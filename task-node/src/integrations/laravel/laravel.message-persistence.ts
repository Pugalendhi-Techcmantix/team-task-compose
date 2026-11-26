import { z } from 'zod';
import type {
  MessagePersistence,
  MessageToPersist,
  PersistedMessage,
} from '../../services/message.persistence.js';
import { AppError, ErrorCode } from '../../utils/errors.js';
import type { Logger } from '../../utils/logger.js';
import type { LaravelClient } from './laravel.client.js';

/** Laravel API resources usually wrap the payload in `data`; accept both shapes. */
const savedMessageSchema = z.object({
  id: z.union([z.string().min(1).max(100), z.number().int().positive()]).transform(String),
  createdAt: z.string().datetime({ offset: true }),
});
const responseSchema = z.union([z.object({ data: savedMessageSchema }), savedMessageSchema]);

/**
 * Stores chat messages through Laravel before Node broadcasts them.
 *
 * Contract: POST {messagesPath}
 *   body:     { conversationId, senderId, message }   (senderId comes from the verified token)
 *   201/200:  { id, createdAt }  or  { data: { id, createdAt } }
 *   403       → CONVERSATION_ACCESS_DENIED (Laravel re-checks membership)
 *   422       → INVALID_PAYLOAD (Laravel validation)
 *   other / timeout / bad body → MESSAGE_PERSISTENCE_FAILED; nothing is broadcast
 */
export class LaravelMessagePersistence implements MessagePersistence {
  readonly name = 'laravel';

  constructor(
    private readonly client: LaravelClient,
    private readonly messagesPath: string,
    private readonly logger: Logger
  ) {}

  async persist(message: MessageToPersist): Promise<PersistedMessage> {
    const response = await this.client.post(
      this.messagesPath,
      { conversationId: message.conversationId },
      {
        conversationId: message.conversationId,
        senderId: message.senderId,
        message: message.message,
      }
    );

    if (response.status === 200 || response.status === 201) {
      const parsed = responseSchema.safeParse(response.body);
      if (!parsed.success) {
        this.logger.error(
          { event: 'laravel_message_response_invalid', conversationId: message.conversationId },
          'laravel_message_response_invalid'
        );
        throw new AppError(ErrorCode.MESSAGE_PERSISTENCE_FAILED);
      }
      const saved = 'data' in parsed.data ? parsed.data.data : parsed.data;
      return { id: saved.id, createdAt: saved.createdAt };
    }

    if (response.status === 403) {
      throw new AppError(ErrorCode.CONVERSATION_ACCESS_DENIED);
    }
    if (response.status === 422) {
      throw new AppError(ErrorCode.INVALID_PAYLOAD, 'Message was rejected by the server');
    }

    this.logger.error(
      {
        event: 'laravel_message_unexpected_status',
        status: response.status,
        conversationId: message.conversationId,
      },
      'laravel_message_unexpected_status'
    );
    throw new AppError(ErrorCode.MESSAGE_PERSISTENCE_FAILED);
  }
}
