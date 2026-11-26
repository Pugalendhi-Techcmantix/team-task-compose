import jwt from 'jsonwebtoken';
import type { ExtendedError } from 'socket.io';
import type { AuthConfig } from '../config/env.js';
import { entityIdFromClaimSchema, type UserId } from '../types/ids.js';
import type { RealtimeSocket } from '../types/socket.types.js';
import { AppError, ErrorCode, toClientError } from '../utils/errors.js';
import type { Logger } from '../utils/logger.js';

export interface AuthenticatedIdentity {
  userId: UserId;
  /** Epoch milliseconds at which the credential stops being valid. */
  expiresAt?: number;
}

/**
 * Boundary between Socket.IO and whatever credential Laravel issues.
 * Swap the implementation (JWT, introspection endpoint, signed cookie...) without
 * touching any Socket.IO code.
 */
export interface RealtimeAuthenticator {
  /** Resolves the verified identity or throws AppError (UNAUTHORIZED | INVALID_TOKEN | TOKEN_EXPIRED). */
  authenticate(credential: string | undefined): Promise<AuthenticatedIdentity>;
}

const MAX_CREDENTIAL_LENGTH = 8192;

/** Verifies Laravel-issued JWTs: signature, algorithm, expiry, issuer, audience and user claim. */
export class JwtRealtimeAuthenticator implements RealtimeAuthenticator {
  constructor(private readonly config: AuthConfig) {}

  async authenticate(credential: string | undefined): Promise<AuthenticatedIdentity> {
    if (!credential) {
      throw new AppError(ErrorCode.UNAUTHORIZED);
    }
    if (credential.length > MAX_CREDENTIAL_LENGTH) {
      throw new AppError(ErrorCode.INVALID_TOKEN);
    }

    let claims: jwt.JwtPayload | string;
    try {
      claims = jwt.verify(credential, this.config.verificationKey, {
        algorithms: [this.config.algorithm],
        issuer: this.config.issuer,
        audience: this.config.audience,
        clockTolerance: this.config.clockToleranceSec,
      });
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError(ErrorCode.TOKEN_EXPIRED, undefined, undefined, { cause: error });
      }
      throw new AppError(ErrorCode.INVALID_TOKEN, undefined, undefined, { cause: error });
    }

    if (typeof claims === 'string') {
      throw new AppError(ErrorCode.INVALID_TOKEN);
    }
    // A realtime credential without an expiry would be valid forever; refuse it.
    if (typeof claims.exp !== 'number') {
      throw new AppError(ErrorCode.INVALID_TOKEN);
    }

    const userId = entityIdFromClaimSchema.safeParse(claims[this.config.userIdClaim]);
    if (!userId.success) {
      throw new AppError(ErrorCode.INVALID_TOKEN);
    }

    return { userId: userId.data, expiresAt: claims.exp * 1000 };
  }
}

/**
 * Reads the credential from the Socket.IO handshake: `auth.token` (preferred, used by
 * socket.io-client's `auth` option) or an `Authorization: Bearer` header.
 */
export function extractCredential(handshake: RealtimeSocket['handshake']): string | undefined {
  const auth: unknown = handshake.auth;
  if (auth && typeof auth === 'object' && 'token' in auth) {
    const token = (auth as { token?: unknown }).token;
    if (typeof token === 'string' && token.length > 0) {
      return token;
    }
  }
  const header = handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    return token.length > 0 ? token : undefined;
  }
  return undefined;
}

/**
 * Socket.IO middleware: rejects the handshake unless the credential verifies, and sets
 * `socket.data.userId` from the verified claims. Client-supplied user IDs are never read.
 */
export function createSocketAuthMiddleware(authenticator: RealtimeAuthenticator, logger: Logger) {
  return (socket: RealtimeSocket, next: (err?: ExtendedError) => void): void => {
    authenticator
      .authenticate(extractCredential(socket.handshake))
      .then((identity) => {
        socket.data.userId = identity.userId;
        if (identity.expiresAt !== undefined) {
          socket.data.tokenExpiresAt = identity.expiresAt;
        }
        next();
      })
      .catch((error: unknown) => {
        const clientError = toClientError(error);
        logger.warn(
          { event: 'authentication_failed', socketId: socket.id, code: clientError.code },
          'authentication_failed'
        );
        const err: ExtendedError = new Error(clientError.message);
        err.data = clientError;
        next(err);
      });
  };
}
