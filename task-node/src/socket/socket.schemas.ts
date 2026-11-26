import { z } from 'zod';
import { entityIdSchema } from '../types/ids.js';

/** Zod schemas for every client -> server payload. Unknown keys (e.g. `senderId`) are stripped. */

export const conversationRefSchema = z.object({
  conversationId: entityIdSchema,
});

/** Message length is checked separately so oversize input gets MESSAGE_TOO_LARGE. */
export const chatSendSchema = z.object({
  conversationId: entityIdSchema,
  message: z.string({ required_error: 'is required', invalid_type_error: 'must be a string' }),
});

export const typingSchema = conversationRefSchema;
