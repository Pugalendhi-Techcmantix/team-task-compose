import type { Logger } from '../utils/logger.js';
import type { Redis } from './redis.client.js';

const SHUTDOWN_COMMAND_TIMEOUT_MS = 2000;

/**
 * Commands issued during shutdown must never block it. If Redis drops just as we stop,
 * ioredis would otherwise queue the command until a reconnect that may never come.
 */
async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out`)),
          SHUTDOWN_COMMAND_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Closes a connection gracefully when possible, immediately otherwise. */
export async function closeConnection(redis: Redis): Promise<void> {
  if (redis.status !== 'ready') {
    redis.disconnect(false);
    return;
  }
  try {
    await withTimeout(redis.quit(), 'QUIT');
  } catch {
    redis.disconnect(false);
  }
}

export type MessageHandler = (channel: string, message: string) => Promise<void> | void;

/**
 * Source of inbound domain events. Redis pub/sub in production; tests can plug in an
 * in-memory source.
 */
export interface EventSource {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** True when connected and subscribed to every channel. */
  isReady(): boolean;
}

/**
 * Dedicated subscriber connection (a subscribed Redis connection cannot run other commands).
 * Re-subscribes after every reconnect and hands messages to the event router.
 */
export class RedisSubscriber implements EventSource {
  /** Channels currently subscribed on the live connection. */
  private readonly subscribed = new Set<string>();
  private stopping = false;

  constructor(
    private readonly redis: Redis,
    private readonly channels: string[],
    private readonly onMessage: MessageHandler,
    private readonly logger: Logger
  ) {}

  async start(): Promise<void> {
    this.redis.on('ready', () => void this.subscribe());
    this.redis.on('close', () => {
      this.subscribed.clear();
    });
    this.redis.on('message', (channel: string, message: string) => {
      Promise.resolve(this.onMessage(channel, message)).catch((error: unknown) => {
        this.logger.error(
          { event: 'redis_message_failed', channel, err: error },
          'redis_message_failed'
        );
      });
    });

    if (this.redis.status === 'ready') {
      await this.subscribe();
    }
  }

  /** Ready only when every configured channel is subscribed. */
  isReady(): boolean {
    return (
      !this.stopping &&
      this.redis.status === 'ready' &&
      this.channels.every((channel) => this.subscribed.has(channel))
    );
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const channels = [...this.subscribed];
    if (this.redis.status === 'ready' && channels.length > 0) {
      try {
        await withTimeout(this.redis.unsubscribe(...channels), 'UNSUBSCRIBE');
        this.logger.info({ event: 'redis_unsubscribed', channels }, 'redis_unsubscribed');
      } catch (error) {
        this.logger.warn(
          { event: 'redis_unsubscribe_failed', err: error },
          'redis_unsubscribe_failed'
        );
      }
    }
    this.subscribed.clear();
    await closeConnection(this.redis);
  }

  /**
   * Subscribes channel by channel so one refused channel (e.g. a Redis ACL that does not
   * cover it) cannot block delivery on the others.
   */
  private async subscribe(): Promise<void> {
    for (const channel of this.channels) {
      if (this.stopping) return;
      try {
        await this.redis.subscribe(channel);
        this.subscribed.add(channel);
        this.logger.info({ event: 'redis_subscribed', channel }, 'redis_subscribed');
      } catch (error) {
        this.subscribed.delete(channel);
        // Retried on the next `ready` (after a reconnect). NOPERM means the Redis ACL for
        // this user does not allow the channel; fix the ACL or the channel name.
        this.logger.error(
          { event: 'redis_subscribe_failed', channel, reason: (error as Error).message },
          'redis_subscribe_failed'
        );
      }
    }
  }
}
