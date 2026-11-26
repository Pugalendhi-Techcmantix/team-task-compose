import { Router } from 'express';
import { createReadyHandler, health, type ReadinessProbe } from './health.controller.js';

export function createRoutes(readiness: ReadinessProbe): Router {
  const router = Router();
  router.get('/health', health);
  router.get('/ready', createReadyHandler(readiness));
  return router;
}
