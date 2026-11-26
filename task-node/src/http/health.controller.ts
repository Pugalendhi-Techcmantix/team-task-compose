import type { Request, Response } from 'express';

export interface ReadinessReport {
  status: 'ready' | 'not_ready';
  redis: 'connected' | 'disconnected';
  shuttingDown?: boolean;
}

export type ReadinessProbe = () => ReadinessReport;

/** Liveness: the process is up and serving HTTP. Does not depend on Redis. */
export function health(_req: Request, res: Response): void {
  res.status(200).json({ status: 'ok' });
}

/** Readiness: able to deliver events (Redis subscribed, not shutting down). */
export function createReadyHandler(probe: ReadinessProbe) {
  return (_req: Request, res: Response): void => {
    const report = probe();
    res.status(report.status === 'ready' ? 200 : 503).json(report);
  };
}
