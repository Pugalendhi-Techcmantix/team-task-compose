import { z } from 'zod';
import type { ChatService } from '../services/chat.service.js';
import { entityIdSchema } from '../types/ids.js';
import { defineEvent, type RegisteredEvent } from './event.registry.js';
import { ChatEventName } from './event.types.js';

/**
 * `chat.message_created` v1: Laravel announces a message it persisted (e.g. created through
 * its REST API) so Node can deliver it live. Proposed contract; confirm with the Laravel team.
 * Messages sent through `chat:send` are already broadcast by Node and should not be
 * re-announced on this channel (clients can also dedupe on `id`).
 */
export const chatMessageCreatedV1 = z.object({
  messageId: z.union([z.string().trim().min(1).max(100), entityIdSchema]).transform(String),
  conversationId: entityIdSchema,
  senderId: entityIdSchema,
  message: z.string().min(1).max(20_000),
  createdAt: z.string().datetime({ offset: true }),
});

export function createChatEventDefinitions(chat: ChatService): RegisteredEvent[] {
  return [
    defineEvent({
      event: ChatEventName.MESSAGE_CREATED,
      version: 1,
      payloadSchema: chatMessageCreatedV1,
      handle: (payload) =>
        chat.deliverPersistedMessage({
          id: payload.messageId,
          conversationId: payload.conversationId,
          senderId: payload.senderId,
          message: payload.message,
          createdAt: payload.createdAt,
        }),
    }),
  ];
}
