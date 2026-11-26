import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { ReadinessProbe } from './http/health.controller.js';
import { createRoutes } from './http/routes.js';
import { createErrorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { createRequestLogger } from './middleware/logging.middleware.js';
import { toCorsOrigin } from './socket/socket.server.js';
import type { Logger } from './utils/logger.js';

export interface AppOptions {
  logger: Logger;
  corsOrigins: string[];
  readiness: ReadinessProbe;
}

/** Express app: health/readiness endpoints only. No request bodies are accepted. */
export function createApp(options: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);

  app.use(helmet());
  const origin = toCorsOrigin(options.corsOrigins);
  app.use(cors({ origin, credentials: origin !== '*', methods: ['GET'] }));
  app.use(createRequestLogger(options.logger));

  app.use(createRoutes(options.readiness));

  app.use(notFoundHandler);
  app.use(createErrorHandler(options.logger));
  return app;
}
