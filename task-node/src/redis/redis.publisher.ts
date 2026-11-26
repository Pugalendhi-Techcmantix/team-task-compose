import type { EventEnvelope } from '../events/event.types.js';
import type { Redis } from './redis.client.js';

/**
 * Publishes event envelopes. Laravel is the production publisher; this exists for local
 * development tooling and integration tests, and for future Node-originated events.
 * It needs its own connection: a subscribed connection cannot PUBLISH.
 */
export class RedisPublisher {
  constructor(private readonly redis: Redis) {}

  /** Returns the number of subscribers that received the message. */
  publish(channel: string, envelope: EventEnvelope): Promise<number> {
    return this.redis.publish(channel, JSON.stringify(envelope));
  }

  publishRaw(channel: string, message: string): Promise<number> {
    return this.redis.publish(channel, message);
  }
}
