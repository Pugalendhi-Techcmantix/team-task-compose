import type { ConversationId, UserId } from '../types/ids.js';

export interface MessageToPersist {
  conversationId: ConversationId;
  senderId: UserId;
  message: string;
}

export interface PersistedMessage {
  /** ID assigned by the system of record (Laravel), if any. */
  id?: string;
  /** Authoritative creation time (ISO-8601). */
  createdAt: string;
}

/**
 * Boundary for message persistence. Laravel owns messages and PostgreSQL; Node must not
 * write to the database. Implement this against the agreed Laravel contract (HTTP API,
 * queue, ...). If `persist` rejects, the message is NOT broadcast and the sender receives
 * MESSAGE_PERSISTENCE_FAILED.
 */
export interface MessagePersistence {
  readonly name: string;
  persist(message: MessageToPersist): Promise<PersistedMessage>;
}

/**
 * Used until the Laravel persistence contract exists: messages are delivered in real time
 * only and are NOT stored anywhere. This is logged as a warning at startup.
 */
export class RealtimeOnlyMessagePersistence implements MessagePersistence {
  readonly name = 'realtime-only';

  constructor(private readonly now: () => Date = () => new Date()) {}

  async persist(): Promise<PersistedMessage> {
    return { createdAt: this.now().toISOString() };
  }
}
