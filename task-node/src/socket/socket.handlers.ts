import type { RateLimitConfig } from '../config/env.js';
import { ClientEvent, ServerEvent } from '../events/event.types.js';
import type { ChatService, SocketSession } from '../services/chat.service.js';
import type { PresenceService } from '../services/presence.service.js';
import type { AckResponse, RealtimeServer, RealtimeSocket } from '../types/socket.types.js';
import { AppError, ErrorCode, isAppError, toClientError } from '../utils/errors.js';
import type { Logger } from '../utils/logger.js';
import { FixedWindowRateLimiter } from '../utils/rate-limiter.js';
import { userRoom } from './socket.rooms.js';

const CONVERSATION_ROOM_PREFIX = 'conversation:';
/** setTimeout cannot schedule further out than ~24.8 days. */
const MAX_TIMEOUT_MS = 2_147_483_647;

export interface SocketHandlerDeps {
  chat: ChatService;
  presence: PresenceService;
  logger: Logger;
  rateLimits: RateLimitConfig;
}

export function createRateLimiters(config: RateLimitConfig) {
  return {
    chatSend: new FixedWindowRateLimiter(config.chatSend, config.windowMs),
    typing: new FixedWindowRateLimiter(config.typing, config.windowMs),
    conversationJoin: new FixedWindowRateLimiter(config.conversationJoin, config.windowMs),
  };
}

/**
 * Wires Socket.IO events to services. Handlers here only translate between the transport and
 * the services: rate limiting, acknowledgements and error replies. No business logic.
 */
export function registerSocketHandlers(io: RealtimeServer, deps: SocketHandlerDeps): void {
  const limiters = createRateLimiters(deps.rateLimits);
  io.on('connection', (socket) => handleConnection(socket, deps, limiters));
}

function handleConnection(
  socket: RealtimeSocket,
  deps: SocketHandlerDeps,
  limiters: ReturnType<typeof createRateLimiters>
): void {
  const { chat, presence, logger } = deps;
  const userId = socket.data.userId;
  const meta = { userId, socketId: socket.id };

  // Every socket of a user shares one room, so notifications reach all tabs and devices.
  void socket.join(userRoom(userId));
  logger.info({ event: 'socket_connected', ...meta }, 'socket_connected');

  presence.connect(userId, socket.id).catch((error: unknown) => {
    logger.error(
      { event: 'presence_update_failed', ...meta, err: error },
      'presence_update_failed'
    );
  });

  const expiryTimer = scheduleExpiryDisconnect(socket, logger);
  const session = createSession(socket);

  const bind = (
    event: ClientEvent,
    limiter: FixedWindowRateLimiter | undefined,
    action: (payload: unknown) => unknown
  ): void => {
    socket.on(event, (payload: unknown, ack?: unknown) => {
      void runClientEvent(socket, event, limiter, () => action(payload), ack, logger);
    });
  };

  bind(ClientEvent.CONVERSATION_JOIN, limiters.conversationJoin, (payload) =>
    chat.joinConversation(session, payload)
  );
  bind(ClientEvent.CONVERSATION_LEAVE, undefined, (payload) =>
    chat.leaveConversation(session, payload)
  );
  bind(ClientEvent.CHAT_SEND, limiters.chatSend, (payload) => chat.sendMessage(session, payload));
  bind(ClientEvent.TYPING_START, limiters.typing, (payload) =>
    chat.setTyping(session, payload, true)
  );
  bind(ClientEvent.TYPING_STOP, limiters.typing, (payload) =>
    chat.setTyping(session, payload, false)
  );

  socket.on('disconnecting', () => {
    chat.handleDisconnecting(session);
  });

  socket.on('disconnect', (reason) => {
    if (expiryTimer) clearTimeout(expiryTimer);
    presence.disconnect(userId, socket.id).catch((error: unknown) => {
      logger.error(
        { event: 'presence_update_failed', ...meta, err: error },
        'presence_update_failed'
      );
    });
    logger.info({ event: 'socket_disconnected', ...meta, reason }, 'socket_disconnected');
  });
}

async function runClientEvent(
  socket: RealtimeSocket,
  event: ClientEvent,
  limiter: FixedWindowRateLimiter | undefined,
  action: () => unknown,
  ack: unknown,
  logger: Logger
): Promise<void> {
  // Only call ack if the client actually passed a callback.
  const reply =
    typeof ack === 'function' ? (ack as (res: AckResponse<unknown>) => void) : undefined;
  try {
    if (!socket.data.userId) {
      throw new AppError(ErrorCode.UNAUTHORIZED);
    }
    if (limiter && !limiter.consume(String(socket.data.userId))) {
      throw new AppError(ErrorCode.RATE_LIMITED);
    }
    const data = await action();
    reply?.({ ok: true, data });
  } catch (error) {
    const clientError = toClientError(error);
    if (isAppError(error)) {
      logger.debug(
        {
          event: 'client_event_rejected',
          clientEvent: event,
          userId: socket.data.userId,
          socketId: socket.id,
          code: clientError.code,
        },
        'client_event_rejected'
      );
    } else {
      logger.error(
        {
          event: 'client_event_failed',
          clientEvent: event,
          userId: socket.data.userId,
          socketId: socket.id,
          err: error,
        },
        'client_event_failed'
      );
    }
    socket.emit(ServerEvent.CHAT_ERROR, { ...clientError, event });
    reply?.({ ok: false, error: clientError });
  }
}

function createSession(socket: RealtimeSocket): SocketSession {
  return {
    id: socket.id,
    userId: socket.data.userId,
    join: (room) => socket.join(room),
    leave: (room) => socket.leave(room),
    isInRoom: (room) => socket.rooms.has(room),
    conversations: () =>
      [...socket.rooms]
        .filter((room) => room.startsWith(CONVERSATION_ROOM_PREFIX))
        .map((room) => Number(room.slice(CONVERSATION_ROOM_PREFIX.length))),
  };
}

/** A socket must not outlive its credential; disconnect it when the token expires. */
function scheduleExpiryDisconnect(
  socket: RealtimeSocket,
  logger: Logger
): NodeJS.Timeout | undefined {
  const expiresAt = socket.data.tokenExpiresAt;
  if (expiresAt === undefined) return undefined;
  const delay = Math.min(Math.max(expiresAt - Date.now(), 0), MAX_TIMEOUT_MS);
  const timer = setTimeout(() => {
    logger.info(
      { event: 'socket_token_expired', userId: socket.data.userId, socketId: socket.id },
      'socket_token_expired'
    );
    socket.disconnect(true);
  }, delay);
  timer.unref();
  return timer;
}
