import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { RealtimeServer } from '../types/socket.types.js';
import type { Logger } from '../utils/logger.js';
import { createSocketAuthMiddleware, type RealtimeAuthenticator } from './socket.auth.js';

export interface SocketServerOptions {
  corsOrigins: string[];
  maxPayloadBytes: number;
  authenticator: RealtimeAuthenticator;
  logger: Logger;
}

/** Wildcard origins are only reachable outside production (enforced by config validation). */
export function toCorsOrigin(origins: string[]): string | string[] {
  return origins.includes('*') ? '*' : origins;
}

export function createSocketServer(
  httpServer: HttpServer,
  options: SocketServerOptions
): RealtimeServer {
  const origin = toCorsOrigin(options.corsOrigins);
  const io: RealtimeServer = new Server(httpServer, {
    cors: { origin, credentials: origin !== '*', methods: ['GET', 'POST'] },
    // Caps every inbound Socket.IO packet, independent of per-field limits.
    maxHttpBufferSize: options.maxPayloadBytes,
    serveClient: false,
    connectTimeout: 10_000,
  });

  // Every connection must authenticate before any handler runs.
  io.use(createSocketAuthMiddleware(options.authenticator, options.logger));

  io.engine.on('connection_error', (error: { code: number; message: string }) => {
    options.logger.debug(
      { event: 'socket_connection_error', code: error.code, reason: error.message },
      'socket_connection_error'
    );
  });

  return io;
}
