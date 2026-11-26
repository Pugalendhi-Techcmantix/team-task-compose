import { pino, type Logger, type LoggerOptions } from 'pino';

export type { Logger };

/**
 * Paths that must never reach log output; pino replaces them with "[REDACTED]".
 * Code avoids logging these in the first place; this is a safety net.
 */
export const REDACT_PATHS = [
  'token',
  '*.token',
  'auth',
  '*.auth',
  'authorization',
  '*.authorization',
  'headers.authorization',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  '*.password',
  'secret',
  '*.secret',
  'verificationKey',
  '*.verificationKey',
];

export interface LoggerSettings {
  level: string;
  pretty?: boolean;
}

export function createLogger(settings: LoggerSettings): Logger {
  const options: LoggerOptions = {
    level: settings.level,
    base: { service: 'realtime-service' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    formatters: {
      level: (label) => ({ level: label }),
    },
  };
  if (settings.pretty) {
    // pino-pretty is a dev dependency and is only requested in development.
    options.transport = { target: 'pino-pretty', options: { colorize: true } };
  }
  return pino(options);
}

/** Logger that discards everything; used by tests. */
export function createSilentLogger(): Logger {
  return pino({ level: 'silent' });
}
