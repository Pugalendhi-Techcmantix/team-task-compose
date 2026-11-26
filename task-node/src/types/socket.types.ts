import type { Server, Socket } from 'socket.io';
import type { ClientEvent, ServerEvent } from '../events/event.types.js';
import type { ClientError } from '../utils/errors.js';
import type { ConversationId, TaskId, UserId } from './ids.js';

/** Acknowledgement returned to clients that pass a callback as the last emit argument. */
export type AckResponse<T = undefined> = { ok: true; data?: T } | { ok: false; error: ClientError };
export type AckCallback<T = undefined> = (response: AckResponse<T>) => void;

export interface NotificationPayload {
  /** Laravel's stored notification ID when provided (use it for mark-as-read), else the event ID. */
  id: string;
  type: string;
  title: string;
  message: string;
  taskId: TaskId;
  createdAt: string;
  /** The recipient's unread count after this notification, when Laravel provides it. */
  unreadCount?: number;
}

export interface NotificationCountPayload {
  unreadCount: number;
  /** When Laravel computed the count; clients ignore updates older than the last one applied. */
  updatedAt: string;
}

export interface ChatMessagePayload {
  /** Present when the persistence layer (Laravel) assigned an ID. */
  id?: string;
  conversationId: ConversationId;
  senderId: UserId;
  message: string;
  createdAt: string;
}

export interface TypingPayload {
  conversationId: ConversationId;
  userId: UserId;
}

export interface PresencePayload {
  userId: UserId;
  status: 'online' | 'offline';
  at: string;
}

export interface SocketErrorPayload extends ClientError {
  /** The client event that caused the error, e.g. "chat:send". */
  event: string;
}

export interface ConversationAckData {
  conversationId: ConversationId;
}

/**
 * Client handlers receive `unknown` payloads on purpose: everything is validated with Zod
 * before use, so the types never pretend that client input is trusted.
 */
export interface ClientToServerEvents {
  [ClientEvent.CONVERSATION_JOIN]: (payload: unknown, ack?: unknown) => void;
  [ClientEvent.CONVERSATION_LEAVE]: (payload: unknown, ack?: unknown) => void;
  [ClientEvent.CHAT_SEND]: (payload: unknown, ack?: unknown) => void;
  [ClientEvent.TYPING_START]: (payload: unknown, ack?: unknown) => void;
  [ClientEvent.TYPING_STOP]: (payload: unknown, ack?: unknown) => void;
}

export interface ServerToClientEvents {
  [ServerEvent.NOTIFICATION]: (payload: NotificationPayload) => void;
  [ServerEvent.NOTIFICATION_COUNT]: (payload: NotificationCountPayload) => void;
  [ServerEvent.CHAT_MESSAGE]: (payload: ChatMessagePayload) => void;
  [ServerEvent.TYPING_START]: (payload: TypingPayload) => void;
  [ServerEvent.TYPING_STOP]: (payload: TypingPayload) => void;
  [ServerEvent.PRESENCE_UPDATE]: (payload: PresencePayload) => void;
  [ServerEvent.CHAT_ERROR]: (payload: SocketErrorPayload) => void;
  [ServerEvent.NOTIFICATION_ERROR]: (payload: SocketErrorPayload) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InterServerEvents {}

/** Populated only by the authentication middleware; never from client input. */
export interface SocketData {
  userId: UserId;
  /** Epoch milliseconds at which the credential expires, if it carries an expiry. */
  tokenExpiresAt?: number;
}

export type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type RealtimeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
