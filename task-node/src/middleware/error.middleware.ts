import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCode, isAppError, toClientError } from '../utils/errors.js';
import type { Logger } from '../utils/logger.js';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: new AppError(ErrorCode.NOT_FOUND).toClient() });
}

const STATUS_BY_CODE: Partial<Record<ErrorCode, number>> = {
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.INVALID_TOKEN]: 401,
  [ErrorCode.TOKEN_EXPIRED]: 401,
  [ErrorCode.CONVERSATION_ACCESS_DENIED]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.INVALID_PAYLOAD]: 400,
  [ErrorCode.MESSAGE_TOO_LARGE]: 413,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.REDIS_UNAVAILABLE]: 503,
};

/** Final Express error handler: full details go to the log, a safe summary to the client. */
export function createErrorHandler(logger: Logger) {
  // Express identifies error handlers by their four parameters.
  return (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const status = isAppError(error) ? (STATUS_BY_CODE[error.code] ?? 500) : 500;
    if (status >= 500) {
      logger.error(
        { event: 'http_error', method: req.method, path: req.path, err: error },
        'http_error'
      );
    }
    if (res.headersSent) {
      return;
    }
    res.status(status).json({ error: toClientError(error) });
  };
}
