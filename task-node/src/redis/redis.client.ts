import { Redis, type RedisOptions } from 'ioredis';
import type { RedisConfig } from '../config/env.js';
import type { Logger } from '../utils/logger.js';

export type { Redis };

export function buildRedisOptions(config: RedisConfig, connectionName: string): RedisOptions {
  return {
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    db: config.db,
    tls: config.tls ? {} : undefined,
    connectionName: `realtime-service:${connectionName}`,
    // Keep retrying forever with capped backoff: a Redis outage must not kill the process.
    retryStrategy: (attempt) => Math.min(attempt * 200, config.reconnectMaxDelayMs),
    maxRetriesPerRequest: null,
    // Subscriptions are restored explicitly by RedisSubscriber on every `ready`.
    autoResubscribe: false,
    // The ready check runs INFO, which least-privilege ACL users (subscribe-only) are
    // usually not granted. Pub/sub does not need it.
    enableReadyCheck: false,
  };
}

/**
 * Creates a Redis connection with lifecycle logging. Connection errors are logged and
 * retried; they never throw out of the process.
 */
export function createRedisConnection(
  config: RedisConfig,
  logger: Logger,
  connectionName: string
): Redis {
  const redis = new Redis(buildRedisOptions(config, connectionName));
  const meta = { connection: connectionName, host: config.host, port: config.port };
  let wasReady = false;

  redis.on('connect', () => logger.debug({ event: 'redis_connecting', ...meta }, 'redis_connect'));
  redis.on('ready', () => {
    wasReady = true;
    logger.info({ event: 'redis_connected', ...meta }, 'redis_connected');
  });
  redis.on('error', (error: Error) => {
    // ioredis error messages contain host/port, never credentials.
    logger.warn({ event: 'redis_error', ...meta, reason: error.message }, 'redis_error');
  });
  redis.on('close', () => {
    if (wasReady) {
      wasReady = false;
      logger.warn({ event: 'redis_disconnected', ...meta }, 'redis_disconnected');
    }
  });
  redis.on('reconnecting', (delayMs: number) => {
    logger.info({ event: 'redis_reconnecting', ...meta, delayMs }, 'redis_reconnecting');
  });
  redis.on('end', () => logger.info({ event: 'redis_connection_ended', ...meta }, 'redis_end'));

  return redis;
}
