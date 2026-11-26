import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../utils/logger.js';

const PROBE_PATHS = new Set(['/health', '/ready']);

/** Logs one line per HTTP request. Query strings and headers are not logged. */
export function createRequestLogger(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const entry = {
        event: 'http_request',
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
      };
      // Probes run every few seconds; keep them out of info-level logs.
      if (PROBE_PATHS.has(req.path) && res.statusCode < 500) {
        logger.debug(entry, 'http_request');
      } else {
        logger.info(entry, 'http_request');
      }
    });
    next();
  };
}
