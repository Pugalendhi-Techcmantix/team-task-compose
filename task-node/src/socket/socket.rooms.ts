import type { ConversationId, UserId } from '../types/ids.js';

/** Room naming lives in one place so every module addresses rooms identically. */
export const userRoom = (userId: UserId): string => `user:${userId}`;

export const conversationRoom = (conversationId: ConversationId): string =>
  `conversation:${conversationId}`;
