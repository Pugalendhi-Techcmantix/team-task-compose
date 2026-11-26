import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';
import type { AppConfig, LaravelConfig } from './config/env.js';
import { LaravelClient } from './integrations/laravel/laravel.client.js';
import { LaravelConversationAuthorizer } from './integrations/laravel/laravel.conversation-authorizer.js';
import { LaravelMessagePersistence } from './integrations/laravel/laravel.message-persistence.js';
import { createChatEventDefinitions } from './events/chat.events.js';
import { EventDeduplicator } from './events/event.deduplicator.js';
import { EventRegistry } from './events/event.registry.js';
import { EventRouter } from './events/event.router.js';
import { createNotificationEventDefinitions } from './events/notification.events.js';
import { createTaskEventDefinitions } from './events/task.events.js';
import type { ReadinessReport } from './http/health.controller.js';
import { createRedisConnection } from './redis/redis.client.js';
import {
  RedisSubscriber,
  type EventSource,
  type MessageHandler,
} from './redis/redis.subscriber.js';
import { ChatService } from './services/chat.service.js';
import {
  AllowAllDevConversationAuthorizer,
  DenyAllConversationAuthorizer,
  type ConversationAuthorizer,
} from './services/conversation.authorizer.js';
import {
  RealtimeOnlyMessagePersistence,
  type MessagePersistence,
} from './services/message.persistence.js';
import { NotificationService } from './services/notification.service.js';
import {
  InMemoryPresenceStore,
  PresenceService,
  type PresenceStore,
} from './services/presence.service.js';
import { JwtRealtimeAuthenticator, type RealtimeAuthenticator } from './socket/socket.auth.js';
import { SocketIoEmitter } from './socket/socket.emitter.js';
import { registerSocketHandlers } from './socket/socket.handlers.js';
import { createSocketServer } from './socket/socket.server.js';
import type { RealtimeServer } from './types/socket.types.js';
import type { Logger } from './utils/logger.js';

/** Adapters that can be replaced, e.g. by Laravel-backed implementations or test doubles. */
export interface RealtimeServiceOverrides {
  authenticator?: RealtimeAuthenticator;
  conversationAuthorizer?: ConversationAuthorizer;
  messagePersistence?: MessagePersistence;
  presenceStore?: PresenceStore;
  createEventSource?: (onMessage: MessageHandler) => EventSource;
}

export interface RealtimeService {
  readonly httpServer: HttpServer;
  readonly io: RealtimeServer;
  start(): Promise<AddressInfo>;
  stop(): Promise<void>;
  readiness(): ReadinessReport;
}

/** Composition root: builds and wires every module. Contains no business logic. */
export function createRealtimeService(
  config: AppConfig,
  logger: Logger,
  overrides: RealtimeServiceOverrides = {}
): RealtimeService {
  let shuttingDown = false;
  let eventSource: EventSource | undefined;

  const readiness = (): ReadinessReport => {
    const redisReady = eventSource?.isReady() ?? false;
    const report: ReadinessReport = {
      status: redisReady && !shuttingDown ? 'ready' : 'not_ready',
      redis: redisReady ? 'connected' : 'disconnected',
    };
    return shuttingDown ? { ...report, shuttingDown } : report;
  };

  const app = createApp({ logger, corsOrigins: config.corsOrigins, readiness });
  const httpServer = createServer(app);

  const authenticator = overrides.authenticator ?? new JwtRealtimeAuthenticator(config.auth);
  const io = createSocketServer(httpServer, {
    corsOrigins: config.corsOrigins,
    maxPayloadBytes: config.socket.maxPayloadBytes,
    authenticator,
    logger,
  });
  const emitter = new SocketIoEmitter(io);

  // Laravel owns membership and messages; Node reaches them through its internal API.
  const laravel = config.laravel ? new LaravelClient(config.laravel, logger) : undefined;

  const authorizer = overrides.conversationAuthorizer ?? createAuthorizer(config, laravel, logger);
  const persistence = overrides.messagePersistence ?? createPersistence(config, laravel, logger);

  const notifications = new NotificationService(emitter, logger);
  const chat = new ChatService({
    emitter,
    authorizer,
    persistence,
    logger,
    maxMessageLength: config.chat.maxMessageLength,
  });
  const presence = new PresenceService(
    overrides.presenceStore ?? new InMemoryPresenceStore(),
    emitter,
    logger
  );

  registerSocketHandlers(io, { chat, presence, logger, rateLimits: config.rateLimits });

  const registry = new EventRegistry().register(
    ...createTaskEventDefinitions(notifications),
    ...createNotificationEventDefinitions(notifications),
    ...createChatEventDefinitions(chat)
  );
  const router = new EventRouter(
    registry,
    new EventDeduplicator(config.events.dedupeTtlMs),
    logger
  );
  const onMessage: MessageHandler = (channel, message) => router.handle(channel, message);

  const createEventSource =
    overrides.createEventSource ??
    ((handler: MessageHandler) =>
      new RedisSubscriber(
        createRedisConnection(config.redis, logger, 'subscriber'),
        [config.redis.taskChannel, config.redis.chatChannel].filter(
          (channel): channel is string => channel !== undefined
        ),
        handler,
        logger
      ));

  let stopPromise: Promise<void> | undefined;

  return {
    httpServer,
    io,
    readiness,

    async start(): Promise<AddressInfo> {
      logAdapterWarnings(logger, config, authorizer, persistence);

      // Redis may be down at startup: the subscriber keeps retrying and /ready reports 503.
      eventSource = createEventSource(onMessage);
      await eventSource.start();

      await new Promise<void>((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(config.port, config.host, () => {
          httpServer.off('error', reject);
          resolve();
        });
      });
      const address = httpServer.address() as AddressInfo;
      logger.info(
        { event: 'server_started', port: address.port, host: config.host, nodeEnv: config.nodeEnv },
        'server_started'
      );
      return address;
    },

    stop(): Promise<void> {
      stopPromise ??= (async () => {
        shuttingDown = true;
        logger.info({ event: 'server_stopping' }, 'server_stopping');

        // 1. Stop accepting new HTTP/WebSocket connections (resolves once all are closed).
        const httpClosed = new Promise<void>((resolve) => {
          if (!httpServer.listening) return resolve();
          httpServer.close(() => resolve());
        });

        // 2. Close Socket.IO: disconnect clients and close the engine.
        io.disconnectSockets(true);
        io.engine.close();

        // 3 + 4. Unsubscribe from Redis channels and close the Redis connection.
        await eventSource?.stop();

        // 5. Close the HTTP server, dropping idle keep-alive connections.
        httpServer.closeAllConnections();
        await httpClosed;

        logger.info({ event: 'server_stopped' }, 'server_stopped');
      })();
      return stopPromise;
    },
  };
}

function createAuthorizer(
  config: AppConfig,
  laravel: LaravelClient | undefined,
  logger: Logger
): ConversationAuthorizer {
  switch (config.conversationAuthorizationMode) {
    case 'laravel':
      // Config validation guarantees LARAVEL_API_URL is set for this mode.
      return new LaravelConversationAuthorizer(
        laravel as LaravelClient,
        (config.laravel as LaravelConfig).membershipPath,
        logger
      );
    case 'allow-all-dev':
      return new AllowAllDevConversationAuthorizer();
    case 'deny-all':
      return new DenyAllConversationAuthorizer();
  }
}

function createPersistence(
  config: AppConfig,
  laravel: LaravelClient | undefined,
  logger: Logger
): MessagePersistence {
  switch (config.messagePersistenceMode) {
    case 'laravel':
      return new LaravelMessagePersistence(
        laravel as LaravelClient,
        (config.laravel as LaravelConfig).messagesPath,
        logger
      );
    case 'realtime-only':
      return new RealtimeOnlyMessagePersistence();
  }
}

function logAdapterWarnings(
  logger: Logger,
  config: AppConfig,
  authorizer: ConversationAuthorizer,
  persistence: MessagePersistence
): void {
  logger.info(
    {
      event: 'chat_adapters',
      conversationAuthorization: authorizer.name,
      messagePersistence: persistence.name,
      laravelApiUrl: config.laravel?.baseUrl,
    },
    'chat_adapters'
  );
  if (authorizer.name === 'deny-all') {
    logger.warn(
      { event: 'conversation_authorization_unconfigured' },
      'No conversation authorizer configured: every conversation:join will be denied until the Laravel membership check is integrated'
    );
  } else if (authorizer.name === 'allow-all-dev') {
    logger.warn(
      { event: 'conversation_authorization_dev_mode', nodeEnv: config.nodeEnv },
      'DEVELOPMENT ONLY: any authenticated user may join any conversation'
    );
  }
  if (persistence.name === 'realtime-only') {
    logger.warn(
      { event: 'message_persistence_unconfigured' },
      'No message persistence configured: chat messages are delivered in real time but not stored'
    );
  }
}
