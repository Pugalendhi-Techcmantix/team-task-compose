import 'dotenv/config';
import { ConfigError, loadConfig, type AppConfig } from './config/env.js';
import { createRealtimeService } from './container.js';
import { createLogger } from './utils/logger.js';

function readConfig(): AppConfig {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`[realtime-service] ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const config = readConfig();
  const logger = createLogger({
    level: config.logLevel,
    pretty: config.nodeEnv === 'development' && process.stdout.isTTY === true,
  });
  const service = createRealtimeService(config, logger);

  let exiting = false;
  const shutdown = (signal: string, exitCode = 0): void => {
    if (exiting) return;
    exiting = true;
    logger.info({ event: 'shutdown_requested', signal }, 'shutdown_requested');

    const forceExit = setTimeout(() => {
      logger.error(
        { event: 'shutdown_timeout', timeoutMs: config.shutdownTimeoutMs },
        'shutdown_timeout'
      );
      process.exit(1);
    }, config.shutdownTimeoutMs);
    forceExit.unref();

    service
      .stop()
      .then(() => {
        logger.flush();
        process.exit(exitCode);
      })
      .catch((error: unknown) => {
        logger.error({ event: 'shutdown_failed', err: error }, 'shutdown_failed');
        process.exit(1);
      });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ event: 'unhandled_rejection', err: reason }, 'unhandled_rejection');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ event: 'uncaught_exception', err: error }, 'uncaught_exception');
    shutdown('uncaughtException', 1);
  });

  try {
    await service.start();
  } catch (error) {
    logger.fatal({ event: 'startup_failed', err: error }, 'startup_failed');
    shutdown('startup_failed', 1);
  }
}

void main();
