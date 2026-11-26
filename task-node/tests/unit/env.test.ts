import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config/env.js';
import { TEST_SECRET, testEnv } from '../helpers/config.js';

function configErrorFor(env: NodeJS.ProcessEnv): ConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('expected ConfigError');
}

describe('environment validation', () => {
  it('loads a valid environment with defaults', () => {
    const config = loadConfig(testEnv({ PORT: '3000' }));
    expect(config.port).toBe(3000);
    expect(config.corsOrigins).toEqual(['http://localhost:3001']);
    expect(config.redis.taskChannel).toBe('task.events');
    expect(config.redis.chatChannel).toBe('chat.events');
    expect(config.redis.username).toBeUndefined();
    expect(config.redis.password).toBeUndefined();
    expect(config.auth).toMatchObject({
      algorithm: 'HS256',
      issuer: 'taskflow',
      audience: 'realtime-service',
      userIdClaim: 'sub',
    });
    expect(config.conversationAuthorizationMode).toBe('deny-all');
  });

  it('parses comma-separated CORS origins', () => {
    const config = loadConfig(
      testEnv({ CORS_ORIGIN: 'http://localhost:3001, https://app.example.com' })
    );
    expect(config.corsOrigins).toEqual(['http://localhost:3001', 'https://app.example.com']);
  });

  it('reports every missing required variable', () => {
    const error = configErrorFor({ NODE_ENV: 'test' });
    const text = error.issues.join('\n');
    for (const name of [
      'CORS_ORIGIN',
      'REDIS_HOST',
      'REALTIME_TOKEN_ISSUER',
      'REALTIME_TOKEN_AUDIENCE',
      'REALTIME_TOKEN_SECRET',
    ]) {
      expect(text).toContain(name);
    }
  });

  it('rejects a short HMAC secret without echoing it', () => {
    const error = configErrorFor(testEnv({ REALTIME_TOKEN_SECRET: 'too-short-secret' }));
    expect(error.message).toContain('REALTIME_TOKEN_SECRET');
    expect(error.message).not.toContain('too-short-secret');
  });

  it('requires a public key for asymmetric algorithms', () => {
    const error = configErrorFor(
      testEnv({ REALTIME_TOKEN_ALGORITHM: 'RS256', REALTIME_TOKEN_SECRET: undefined })
    );
    expect(error.message).toContain('REALTIME_TOKEN_PUBLIC_KEY');
  });

  it('forbids wildcard CORS and dev authorization in production', () => {
    const error = configErrorFor(
      testEnv({
        NODE_ENV: 'production',
        CORS_ORIGIN: '*',
        CONVERSATION_AUTHORIZATION_MODE: 'allow-all-dev',
      })
    );
    expect(error.message).toContain('CORS_ORIGIN');
    expect(error.message).toContain('CONVERSATION_AUTHORIZATION_MODE');
  });

  it('rejects malformed origins, ports and channels', () => {
    const error = configErrorFor(
      testEnv({
        CORS_ORIGIN: 'localhost:3001/path',
        PORT: 'abc',
        REDIS_TASK_CHANNEL: 'bad channel',
      })
    );
    expect(error.message).toContain('CORS_ORIGIN');
    expect(error.message).toContain('PORT');
    expect(error.message).toContain('REDIS_TASK_CHANNEL');
  });

  describe('Laravel integration', () => {
    const token = 'laravel-internal-service-token-0123456789abcdef';

    it('defaults to local adapters when LARAVEL_API_URL is unset', () => {
      const config = loadConfig(testEnv());
      expect(config.laravel).toBeUndefined();
      expect(config.conversationAuthorizationMode).toBe('deny-all');
      expect(config.messagePersistenceMode).toBe('realtime-only');
    });

    it('defaults to Laravel adapters when LARAVEL_API_URL is set, trimming the trailing slash', () => {
      const config = loadConfig(
        testEnv({ LARAVEL_API_URL: 'http://laravel:8000/api/v1/', LARAVEL_SERVICE_TOKEN: token })
      );
      expect(config.conversationAuthorizationMode).toBe('laravel');
      expect(config.messagePersistenceMode).toBe('laravel');
      expect(config.laravel).toMatchObject({
        baseUrl: 'http://laravel:8000/api/v1',
        timeoutMs: 3000,
        membershipPath: '/internal/conversations/{conversationId}/members/{userId}',
        messagesPath: '/internal/conversations/{conversationId}/messages',
      });
    });

    it('requires the URL and a strong service token for laravel modes', () => {
      const missingUrl = configErrorFor(testEnv({ CONVERSATION_AUTHORIZATION_MODE: 'laravel' }));
      expect(missingUrl.message).toContain('LARAVEL_API_URL is required');
      const weakToken = configErrorFor(
        testEnv({ LARAVEL_API_URL: 'http://laravel:8000', LARAVEL_SERVICE_TOKEN: 'short-token' })
      );
      expect(weakToken.message).toContain('LARAVEL_SERVICE_TOKEN');
      expect(weakToken.message).not.toContain('short-token');
    });

    it('allows explicit local modes even when the URL is set', () => {
      const config = loadConfig(
        testEnv({
          LARAVEL_API_URL: 'http://laravel:8000',
          CONVERSATION_AUTHORIZATION_MODE: 'deny-all',
          MESSAGE_PERSISTENCE_MODE: 'realtime-only',
        })
      );
      expect(config.conversationAuthorizationMode).toBe('deny-all');
      expect(config.messagePersistenceMode).toBe('realtime-only');
    });

    it('validates the URL and path templates', () => {
      const error = configErrorFor(
        testEnv({
          LARAVEL_API_URL: 'not a url',
          LARAVEL_SERVICE_TOKEN: token,
          LARAVEL_MEMBERSHIP_PATH: '/members/{userId}',
          LARAVEL_MESSAGES_PATH: '/messages',
        })
      );
      expect(error.message).toContain('LARAVEL_API_URL');
      expect(error.message).toContain('LARAVEL_MEMBERSHIP_PATH must contain {conversationId}');
      expect(error.message).toContain('LARAVEL_MESSAGES_PATH must contain {conversationId}');
    });
  });

  it('disables the chat channel when REDIS_CHAT_CHANNEL is empty', () => {
    expect(loadConfig(testEnv({ REDIS_CHAT_CHANNEL: '' })).redis.chatChannel).toBeUndefined();
    expect(loadConfig(testEnv({ REDIS_CHAT_CHANNEL: 'taskflow:chat' })).redis.chatChannel).toBe(
      'taskflow:chat'
    );
    expect(() =>
      loadConfig(testEnv({ REDIS_TASK_CHANNEL: 'same', REDIS_CHAT_CHANNEL: 'same' }))
    ).toThrow(/must differ/);
  });

  it('treats empty optional values as unset and parses REDIS_TLS', () => {
    const config = loadConfig(
      testEnv({ REDIS_USERNAME: '', REDIS_PASSWORD: '', REDIS_TLS: 'true' })
    );
    expect(config.redis.username).toBeUndefined();
    expect(config.redis.password).toBeUndefined();
    expect(config.redis.tls).toBe(true);
    expect(config.auth.verificationKey).toBe(TEST_SECRET);
  });
});
