/**
 * Test doubles for the integration boundaries (Laravel auth/membership/persistence and
 * Redis). They exist only under tests/ and are never used by production code.
 */
import type { EventSource, MessageHandler } from '../../src/redis/redis.subscriber.js';
import type { ConversationAuthorizer } from '../../src/services/conversation.authorizer.js';
import type {
  MessagePersistence,
  MessageToPersist,
  PersistedMessage,
} from '../../src/services/message.persistence.js';
import type { RealtimeEmitter } from '../../src/socket/socket.emitter.js';
import type { ConversationId, UserId } from '../../src/types/ids.js';

/** Grants access according to an explicit membership table. */
export class StaticConversationAuthorizer implements ConversationAuthorizer {
  readonly name = 'static-test';
  private readonly members = new Map<ConversationId, Set<UserId>>();

  constructor(membership: Record<number, number[]> = {}) {
    for (const [conversationId, userIds] of Object.entries(membership)) {
      this.members.set(Number(conversationId), new Set(userIds));
    }
  }

  async canAccess(userId: UserId, conversationId: ConversationId): Promise<boolean> {
    return this.members.get(conversationId)?.has(userId) ?? false;
  }
}

/** Records persisted messages and assigns sequential IDs, like Laravel would. */
export class RecordingMessagePersistence implements MessagePersistence {
  readonly name = 'recording-test';
  readonly saved: MessageToPersist[] = [];
  failNext = false;

  async persist(message: MessageToPersist): Promise<PersistedMessage> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('simulated persistence failure');
    }
    this.saved.push(message);
    return { id: `msg_${this.saved.length}`, createdAt: '2026-11-26T10:00:00.000Z' };
  }
}

/** Redis stand-in: tests push raw messages straight into the event router. */
export class InMemoryEventSource implements EventSource {
  ready = true;
  stopped = false;

  constructor(private readonly handler: MessageHandler) {}

  async start(): Promise<void> {}

  async stop(): Promise<void> {
    this.stopped = true;
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  async publish(channel: string, message: unknown): Promise<void> {
    await this.handler(channel, typeof message === 'string' ? message : JSON.stringify(message));
  }
}

export interface EmittedEvent {
  target: string;
  event: string;
  payload: unknown;
  exceptSocketId?: string;
}

/** Captures what services emit, for unit tests. */
export class RecordingEmitter implements RealtimeEmitter {
  readonly emitted: EmittedEvent[] = [];

  toUser(userId: UserId, event: string, payload: unknown): void {
    this.emitted.push({ target: `user:${userId}`, event, payload });
  }

  toConversation(
    conversationId: ConversationId,
    event: string,
    payload: unknown,
    options?: { exceptSocketId?: string }
  ): void {
    this.emitted.push({
      target: `conversation:${conversationId}`,
      event,
      payload,
      exceptSocketId: options?.exceptSocketId,
    });
  }

  toAll(event: string, payload: unknown): void {
    this.emitted.push({ target: '*', event, payload });
  }
}
