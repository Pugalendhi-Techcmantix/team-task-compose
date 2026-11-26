import { describe, expect, it } from 'vitest';
import { JwtRealtimeAuthenticator, extractCredential } from '../../src/socket/socket.auth.js';
import type { RealtimeSocket } from '../../src/types/socket.types.js';
import { AppError } from '../../src/utils/errors.js';
import { testConfig } from '../helpers/config.js';
import { signToken } from '../helpers/tokens.js';

const authenticator = new JwtRealtimeAuthenticator(testConfig().auth);

async function rejectionCode(credential: string | undefined): Promise<string> {
  try {
    await authenticator.authenticate(credential);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return (error as AppError).code;
  }
  throw new Error('expected authentication to fail');
}

describe('JwtRealtimeAuthenticator', () => {
  it('returns the user ID from the verified subject claim', async () => {
    const identity = await authenticator.authenticate(signToken(25));
    expect(identity.userId).toBe(25);
    expect(identity.expiresAt).toBeGreaterThan(Date.now());
  });

  it('rejects a missing credential', async () => {
    expect(await rejectionCode(undefined)).toBe('UNAUTHORIZED');
    expect(await rejectionCode('')).toBe('UNAUTHORIZED');
  });

  it('rejects a bad signature', async () => {
    const token = signToken(25, { secret: 'another-secret-that-is-also-long-enough-0000' });
    expect(await rejectionCode(token)).toBe('INVALID_TOKEN');
  });

  it('rejects an expired token with TOKEN_EXPIRED', async () => {
    expect(await rejectionCode(signToken(25, { expiresInSec: -60 }))).toBe('TOKEN_EXPIRED');
  });

  it('rejects a token without an expiry', async () => {
    expect(await rejectionCode(signToken(25, { expiresInSec: null }))).toBe('INVALID_TOKEN');
  });

  it('rejects the wrong issuer or audience', async () => {
    expect(await rejectionCode(signToken(25, { issuer: 'someone-else' }))).toBe('INVALID_TOKEN');
    expect(await rejectionCode(signToken(25, { audience: 'other-service' }))).toBe('INVALID_TOKEN');
  });

  it('rejects missing or malformed user ID claims', async () => {
    expect(await rejectionCode(signToken(undefined))).toBe('INVALID_TOKEN');
    expect(await rejectionCode(signToken('abc'))).toBe('INVALID_TOKEN');
    expect(await rejectionCode(signToken('-5'))).toBe('INVALID_TOKEN');
    expect(await rejectionCode(signToken('0'))).toBe('INVALID_TOKEN');
  });

  it('rejects garbage and the "none" algorithm', async () => {
    expect(await rejectionCode('not-a-jwt')).toBe('INVALID_TOKEN');
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({
        sub: '25',
        iss: 'taskflow',
        aud: 'realtime-service',
        exp: Math.floor(Date.now() / 1000) + 60,
      })
    ).toString('base64url');
    expect(await rejectionCode(`${header}.${body}.`)).toBe('INVALID_TOKEN');
  });

  it('supports a configurable user ID claim', async () => {
    const custom = new JwtRealtimeAuthenticator(
      testConfig({ REALTIME_TOKEN_USER_CLAIM: 'user_id' }).auth
    );
    const identity = await custom.authenticate(signToken(undefined, { claims: { user_id: 42 } }));
    expect(identity.userId).toBe(42);
  });
});

describe('extractCredential', () => {
  const handshake = (auth: unknown, authorization?: string) =>
    ({ auth, headers: authorization ? { authorization } : {} }) as RealtimeSocket['handshake'];

  it('prefers auth.token', () => {
    expect(extractCredential(handshake({ token: 'abc' }, 'Bearer def'))).toBe('abc');
  });

  it('falls back to a Bearer header', () => {
    expect(extractCredential(handshake({}, 'Bearer def'))).toBe('def');
  });

  it('ignores non-string tokens and other schemes', () => {
    expect(extractCredential(handshake({ token: 123 }, 'Basic xyz'))).toBeUndefined();
  });
});
