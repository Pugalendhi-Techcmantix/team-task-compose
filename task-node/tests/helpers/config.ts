import { loadConfig, type AppConfig } from '../../src/config/env.js';

export const TEST_SECRET = 'test-secret-that-is-long-enough-for-hs256-0123456789';
export const TEST_ISSUER = 'taskflow';
export const TEST_AUDIENCE = 'realtime-service';

export const REDIS_TEST_HOST = process.env.REDIS_TEST_HOST ?? '127.0.0.1';
export const REDIS_TEST_PORT = Number(process.env.REDIS_TEST_PORT ?? 6379);

/** Minimal valid environment; individual tests override what they exercise. */
export function testEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '0',
    CORS_ORIGIN: 'http://localhost:3001',
    REDIS_HOST: REDIS_TEST_HOST,
    REDIS_PORT: String(REDIS_TEST_PORT),
    REDIS_RECONNECT_MAX_DELAY_MS: '300',
    REALTIME_TOKEN_SECRET: TEST_SECRET,
    REALTIME_TOKEN_ISSUER: TEST_ISSUER,
    REALTIME_TOKEN_AUDIENCE: TEST_AUDIENCE,
    LOG_LEVEL: 'silent',
    ...overrides,
  };
}

export function testConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig(testEnv(overrides));
}
