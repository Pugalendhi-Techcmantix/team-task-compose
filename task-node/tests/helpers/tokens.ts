import jwt from 'jsonwebtoken';
import { TEST_AUDIENCE, TEST_ISSUER, TEST_SECRET } from './config.js';

export interface TokenOptions {
  secret?: string;
  issuer?: string;
  audience?: string;
  /** Seconds until expiry; negative values produce an already-expired token. */
  expiresInSec?: number | null;
  claims?: Record<string, unknown>;
}

/** Signs a credential the way Laravel is expected to (see README authentication contract). */
export function signToken(userId: number | string | undefined, options: TokenOptions = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    iat: now,
    iss: options.issuer ?? TEST_ISSUER,
    aud: options.audience ?? TEST_AUDIENCE,
    ...options.claims,
  };
  if (userId !== undefined) payload.sub = String(userId);
  const expiresIn = options.expiresInSec === undefined ? 3600 : options.expiresInSec;
  if (expiresIn !== null) payload.exp = now + expiresIn;
  return jwt.sign(payload, options.secret ?? TEST_SECRET, { algorithm: 'HS256' });
}
