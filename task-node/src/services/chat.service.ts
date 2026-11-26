import { ServerEvent } from '../events/event.types.js';
import type { RealtimeEmitter } from '../socket/socket.emitter.js';
import { conversationRoom } from '../socket/socket.rooms.js';
import { chatSendSchema, conversationRefSchema, typingSchema } from '../socket/socket.schemas.js';
import type { ConversationId, UserId } from '../types/ids.js';
import type { ChatMessagePayload, ConversationAckData } from '../types/socket.types.js';
import { AppError, ErrorCode, isAppError } from '../utils/errors.js';
import type { Logger } from '../utils/logger.js';
import { parsePayload } from '../utils/validation.js';
import type { ConversationAuthorizer } from './conversation.authorizer.js';
import type { MessagePersistence } from './message.persistence.js';

/**
 * What the chat service needs from a connected socket. `userId` always comes from the
 * verified credential (socket.data.userId), never from the client payload.
 */
export interface SocketSession {
  readonly id: string;
  readonly userId: UserId;
  join(room: string): void | Promise<void>;
  leave(room: string): void | Promise<void>;
  isInRoom(room: string): boolean;
  /** Conversation IDs this socket has joined. */
  conversations(): ConversationId[];
}

export interface ChatServiceDeps {
  emitter: RealtimeEmitter;
  authorizer: ConversationAuthorizer;
  persistence: MessagePersistence;
  logger: Logger;
  maxMessageLength: number;
}

export class ChatService {
  constructor(private readonly deps: ChatServiceDeps) {}

  async joinConversation(session: SocketSession, input: unknown): Promise<ConversationAckData> {
    const { conversationId } = parsePayload(conversationRefSchema, input);
    const room = conversationRoom(conversationId);
    if (session.isInRoom(room)) {
      return { conversationId };
    }

    let allowed: boolean;
    try {
      allowed = await this.deps.authorizer.canAccess(session.userId, conversationId);
    } catch (error) {
      // Fail closed: if membership cannot be checked, access is denied.
      this.deps.logger.error(
        {
          event: 'conversation_authorization_failed',
          userId: session.userId,
          conversationId,
          err: error,
        },
        'conversation_authorization_failed'
      );
      throw new AppError(ErrorCode.INTERNAL_ERROR);
    }

    if (!allowed) {
      this.deps.logger.warn(
        {
          event: 'conversation_access_denied',
          userId: session.userId,
          socketId: session.id,
          conversationId,
        },
        'conversation_access_denied'
      );
      throw new AppError(ErrorCode.CONVERSATION_ACCESS_DENIED);
    }

    await session.join(room);
    this.deps.logger.info(
      {
        event: 'conversation_joined',
        userId: session.userId,
        socketId: session.id,
        conversationId,
      },
      'conversation_joined'
    );
    return { conversationId };
  }

  async leaveConversation(session: SocketSession, input: unknown): Promise<ConversationAckData> {
    const { conversationId } = parsePayload(conversationRefSchema, input);
    const room = conversationRoom(conversationId);
    if (session.isInRoom(room)) {
      await session.leave(room);
      this.emitTyping(session, conversationId, false);
      this.deps.logger.info(
        {
          event: 'conversation_left',
          userId: session.userId,
          socketId: session.id,
          conversationId,
        },
        'conversation_left'
      );
    }
    return { conversationId };
  }

  async sendMessage(session: SocketSession, input: unknown): Promise<ChatMessagePayload> {
    const payload = parsePayload(chatSendSchema, input);
    const message = payload.message.trim();
    if (message.length === 0) {
      throw new AppError(ErrorCode.INVALID_PAYLOAD, 'Message must not be empty', [
        { path: 'message', message: 'must not be empty' },
      ]);
    }
    if (message.length > this.deps.maxMessageLength) {
      throw new AppError(
        ErrorCode.MESSAGE_TOO_LARGE,
        `Message exceeds ${this.deps.maxMessageLength} characters`
      );
    }

    const { conversationId } = payload;
    this.assertMember(session, conversationId);

    // Identity is taken from the authenticated socket; any client-sent senderId was stripped.
    const senderId = session.userId;
    this.deps.logger.info(
      { event: 'chat_message_received', userId: senderId, socketId: session.id, conversationId },
      'chat_message_received'
    );

    let persisted;
    try {
      persisted = await this.deps.persistence.persist({ conversationId, senderId, message });
    } catch (error) {
      this.deps.logger.error(
        { event: 'chat_message_persist_failed', userId: senderId, conversationId, err: error },
        'chat_message_persist_failed'
      );
      // Specific outcomes from the system of record (e.g. access revoked, validation) pass through.
      throw isAppError(error) ? error : new AppError(ErrorCode.MESSAGE_PERSISTENCE_FAILED);
    }

    const chatMessage: ChatMessagePayload = {
      ...(persisted.id !== undefined ? { id: persisted.id } : {}),
      conversationId,
      senderId,
      message,
      createdAt: persisted.createdAt,
    };
    this.broadcast(chatMessage);
    return chatMessage;
  }

  setTyping(session: SocketSession, input: unknown, isTyping: boolean): ConversationAckData {
    const { conversationId } = parsePayload(typingSchema, input);
    this.assertMember(session, conversationId);
    this.emitTyping(session, conversationId, isTyping);
    return { conversationId };
  }

  /** Clears typing indicators the socket may have left behind in its conversations. */
  handleDisconnecting(session: SocketSession): void {
    for (const conversationId of session.conversations()) {
      this.emitTyping(session, conversationId, false);
    }
  }

  /** Delivers a message that Laravel persisted and announced over Redis. */
  deliverPersistedMessage(message: ChatMessagePayload): void {
    this.broadcast(message);
  }

  private broadcast(message: ChatMessagePayload): void {
    this.deps.emitter.toConversation(message.conversationId, ServerEvent.CHAT_MESSAGE, message);
    this.deps.logger.info(
      {
        event: 'chat_message_broadcast',
        userId: message.senderId,
        conversationId: message.conversationId,
        messageId: message.id,
      },
      'chat_message_broadcast'
    );
  }

  private emitTyping(
    session: SocketSession,
    conversationId: ConversationId,
    isTyping: boolean
  ): void {
    this.deps.emitter.toConversation(
      conversationId,
      isTyping ? ServerEvent.TYPING_START : ServerEvent.TYPING_STOP,
      { conversationId, userId: session.userId },
      { exceptSocketId: session.id }
    );
  }

  /** Membership was authorized at join time; sending requires having joined. */
  private assertMember(session: SocketSession, conversationId: ConversationId): void {
    if (!session.isInRoom(conversationRoom(conversationId))) {
      throw new AppError(ErrorCode.NOT_IN_CONVERSATION);
    }
  }
}
