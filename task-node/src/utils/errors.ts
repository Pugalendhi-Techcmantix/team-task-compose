export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  CONVERSATION_ACCESS_DENIED: 'CONVERSATION_ACCESS_DENIED',
  NOT_IN_CONVERSATION: 'NOT_IN_CONVERSATION',
  MESSAGE_TOO_LARGE: 'MESSAGE_TOO_LARGE',
  MESSAGE_PERSISTENCE_FAILED: 'MESSAGE_PERSISTENCE_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  UNKNOWN_EVENT: 'UNKNOWN_EVENT',
  REDIS_UNAVAILABLE: 'REDIS_UNAVAILABLE',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHORIZED: 'Authentication required',
  INVALID_TOKEN: 'Invalid authentication token',
  TOKEN_EXPIRED: 'Authentication token expired',
  INVALID_PAYLOAD: 'Invalid payload',
  CONVERSATION_ACCESS_DENIED: 'Access to this conversation is denied',
  NOT_IN_CONVERSATION: 'Join the conversation first',
  MESSAGE_TOO_LARGE: 'Message is too large',
  MESSAGE_PERSISTENCE_FAILED: 'Message could not be saved',
  RATE_LIMITED: 'Too many requests, slow down',
  UNKNOWN_EVENT: 'Unknown event',
  REDIS_UNAVAILABLE: 'Redis is unavailable',
  NOT_FOUND: 'Not found',
  INTERNAL_ERROR: 'Internal server error',
};

export interface ClientErrorDetail {
  path: string;
  message: string;
}

/** Shape sent to clients. Never contains stack traces, secrets or internal details. */
export interface ClientError {
  code: ErrorCode;
  message: string;
  details?: ClientErrorDetail[];
}

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string = DEFAULT_MESSAGES[code],
    /** Safe, client-facing validation details. */
    public readonly details?: ClientErrorDetail[],
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'AppError';
  }

  toClient(): ClientError {
    return this.details && this.details.length > 0
      ? { code: this.code, message: this.message, details: this.details }
      : { code: this.code, message: this.message };
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Converts any thrown value into a safe client error; unknown errors become INTERNAL_ERROR. */
export function toClientError(error: unknown): ClientError {
  if (isAppError(error)) {
    return error.toClient();
  }
  return { code: ErrorCode.INTERNAL_ERROR, message: DEFAULT_MESSAGES.INTERNAL_ERROR };
}

/** Maps Zod issues to client-safe details. Received values are never echoed back. */
export function toErrorDetails(
  issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }>
): ClientErrorDetail[] {
  return issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}
