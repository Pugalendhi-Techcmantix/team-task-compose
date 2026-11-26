import type { z } from 'zod';
import type { EventEnvelope } from './event.types.js';

/**
 * One handler for one (event, version) pair. A new payload version is supported by
 * registering another definition; existing versions keep working untouched.
 */
export interface EventDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  event: string;
  version: number;
  payloadSchema: S;
  handle(payload: z.output<S>, envelope: EventEnvelope): Promise<void> | void;
}

/** Type-erased form stored in the registry. */
export interface RegisteredEvent {
  event: string;
  version: number;
  parsePayload(payload: unknown): z.SafeParseReturnType<unknown, unknown>;
  handle(payload: unknown, envelope: EventEnvelope): Promise<void> | void;
}

/** Helper that keeps full type inference between a payload schema and its handler. */
export function defineEvent<S extends z.ZodTypeAny>(
  definition: EventDefinition<S>
): RegisteredEvent {
  return {
    event: definition.event,
    version: definition.version,
    parsePayload: (payload) => definition.payloadSchema.safeParse(payload),
    // parsePayload ran first, so the payload here is the schema's output type.
    handle: (payload, envelope) => definition.handle(payload as z.output<S>, envelope),
  };
}

const keyOf = (event: string, version: number): string => `${event}@v${version}`;

export class EventRegistry {
  private readonly definitions = new Map<string, RegisteredEvent>();
  private readonly versionsByEvent = new Map<string, Set<number>>();

  register(...definitions: RegisteredEvent[]): this {
    for (const definition of definitions) {
      const key = keyOf(definition.event, definition.version);
      if (this.definitions.has(key)) {
        throw new Error(`Event handler already registered for ${key}`);
      }
      this.definitions.set(key, definition);
      const versions = this.versionsByEvent.get(definition.event) ?? new Set<number>();
      versions.add(definition.version);
      this.versionsByEvent.set(definition.event, versions);
    }
    return this;
  }

  resolve(event: string, version: number): RegisteredEvent | undefined {
    return this.definitions.get(keyOf(event, version));
  }

  /** Supported versions for an event name, or an empty list if the event is unknown. */
  supportedVersions(event: string): number[] {
    return [...(this.versionsByEvent.get(event) ?? [])].sort((a, b) => a - b);
  }
}
