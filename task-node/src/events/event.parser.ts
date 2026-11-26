import { AppError, ErrorCode, toErrorDetails } from '../utils/errors.js';
import type { EventRegistry, RegisteredEvent } from './event.registry.js';
import { eventEnvelopeSchema, type EventEnvelope } from './event.types.js';

/** Redis messages larger than this are rejected before JSON parsing. */
export const MAX_EVENT_BYTES = 64 * 1024;

export interface ParsedEvent {
  envelope: EventEnvelope;
  definition: RegisteredEvent;
  /** Payload after validation by the (event, version) schema. */
  payload: unknown;
}

export type ParseResult =
  | { ok: true; value: ParsedEvent }
  | {
      ok: false;
      error: AppError;
      /** Envelope fields, when they could be read, for logging. */
      eventId?: string;
      event?: string;
    };

/**
 * Turns a raw Redis message into a validated, routable event.
 * Never throws: every failure is returned as an AppError for logging.
 */
export function parseEvent(raw: string, registry: EventRegistry): ParseResult {
  if (Buffer.byteLength(raw, 'utf8') > MAX_EVENT_BYTES) {
    return {
      ok: false,
      error: new AppError(ErrorCode.INVALID_PAYLOAD, 'Event exceeds size limit'),
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: new AppError(ErrorCode.INVALID_PAYLOAD, 'Event is not valid JSON') };
  }

  const envelope = eventEnvelopeSchema.safeParse(json);
  if (!envelope.success) {
    const partial = readIdentifiers(json);
    return {
      ok: false,
      error: new AppError(
        ErrorCode.INVALID_PAYLOAD,
        'Invalid event envelope',
        toErrorDetails(envelope.error.issues)
      ),
      ...partial,
    };
  }

  const { eventId, event, version } = envelope.data;
  const definition = registry.resolve(event, version);
  if (!definition) {
    const supported = registry.supportedVersions(event);
    const message =
      supported.length === 0
        ? `Unknown event "${event}"`
        : `Unsupported version ${version} of "${event}" (supported: ${supported.join(', ')})`;
    return { ok: false, error: new AppError(ErrorCode.UNKNOWN_EVENT, message), eventId, event };
  }

  const payload = definition.parsePayload(envelope.data.payload);
  if (!payload.success) {
    return {
      ok: false,
      error: new AppError(
        ErrorCode.INVALID_PAYLOAD,
        `Invalid payload for ${event} v${version}`,
        toErrorDetails(payload.error.issues)
      ),
      eventId,
      event,
    };
  }

  return { ok: true, value: { envelope: envelope.data, definition, payload: payload.data } };
}

function readIdentifiers(json: unknown): { eventId?: string; event?: string } {
  if (!json || typeof json !== 'object') {
    return {};
  }
  const record = json as Record<string, unknown>;
  const result: { eventId?: string; event?: string } = {};
  if (typeof record.eventId === 'string') result.eventId = record.eventId.slice(0, 200);
  if (typeof record.event === 'string') result.event = record.event.slice(0, 100);
  return result;
}
