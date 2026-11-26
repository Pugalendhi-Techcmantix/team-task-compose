import type { Logger } from '../utils/logger.js';
import type { EventDeduplicator } from './event.deduplicator.js';
import { parseEvent } from './event.parser.js';
import type { EventRegistry } from './event.registry.js';

/**
 * Entry point for every Redis message: parse, validate, dedupe and dispatch.
 * Never throws; a bad event is logged and dropped without affecting the process.
 */
export class EventRouter {
  constructor(
    private readonly registry: EventRegistry,
    private readonly deduplicator: EventDeduplicator,
    private readonly logger: Logger
  ) {}

  async handle(channel: string, raw: string): Promise<void> {
    const result = parseEvent(raw, this.registry);
    if (!result.ok) {
      this.logger.warn(
        {
          event: 'redis_event_invalid',
          channel,
          eventId: result.eventId,
          eventType: result.event,
          code: result.error.code,
          reason: result.error.message,
          details: result.error.details,
        },
        'redis_event_invalid'
      );
      return;
    }

    const { envelope, definition, payload } = result.value;
    const meta = {
      channel,
      eventId: envelope.eventId,
      eventType: envelope.event,
      version: envelope.version,
    };

    if (this.deduplicator.isDuplicate(envelope.eventId)) {
      this.logger.info({ event: 'redis_event_duplicate', ...meta }, 'redis_event_duplicate');
      return;
    }

    this.logger.info({ event: 'redis_event_received', ...meta }, 'redis_event_received');

    try {
      await definition.handle(payload, envelope);
      this.deduplicator.markProcessed(envelope.eventId);
    } catch (error) {
      this.logger.error({ event: 'redis_event_failed', ...meta, err: error }, 'redis_event_failed');
    }
  }
}
