import type { ConversationId, UserId } from '../types/ids.js';
import type { RealtimeServer, ServerToClientEvents } from '../types/socket.types.js';
import { conversationRoom, userRoom } from './socket.rooms.js';

type EventName = keyof ServerToClientEvents;
type EventPayload<E extends EventName> = Parameters<ServerToClientEvents[E]>[0];

/**
 * The only way services push data to clients. Keeps services independent of Socket.IO
 * (and easy to unit test), and is the seam for a Redis adapter when scaling horizontally.
 */
export interface RealtimeEmitter {
  toUser<E extends EventName>(userId: UserId, event: E, payload: EventPayload<E>): void;
  toConversation<E extends EventName>(
    conversationId: ConversationId,
    event: E,
    payload: EventPayload<E>,
    options?: { exceptSocketId?: string }
  ): void;
  toAll<E extends EventName>(event: E, payload: EventPayload<E>): void;
}

export class SocketIoEmitter implements RealtimeEmitter {
  constructor(private readonly io: RealtimeServer) {}

  toUser<E extends EventName>(userId: UserId, event: E, payload: EventPayload<E>): void {
    this.emit(this.io.to(userRoom(userId)), event, payload);
  }

  toConversation<E extends EventName>(
    conversationId: ConversationId,
    event: E,
    payload: EventPayload<E>,
    options?: { exceptSocketId?: string }
  ): void {
    let target = this.io.to(conversationRoom(conversationId));
    if (options?.exceptSocketId) {
      target = target.except(options.exceptSocketId);
    }
    this.emit(target, event, payload);
  }

  toAll<E extends EventName>(event: E, payload: EventPayload<E>): void {
    this.emit(this.io, event, payload);
  }

  private emit<E extends EventName>(
    target: { emit: RealtimeServer['emit'] },
    event: E,
    payload: EventPayload<E>
  ): void {
    // Socket.IO's emit signature is variadic over the event map; the generic constraint
    // above already guarantees the payload matches the event.
    (target.emit as (event: E, payload: EventPayload<E>) => boolean)(event, payload);
  }
}
