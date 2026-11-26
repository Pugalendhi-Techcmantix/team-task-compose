import { z } from 'zod';

/** Socket.IO events sent by clients (React) to this service. */
export const ClientEvent = {
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',
  CHAT_SEND: 'chat:send',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
} as const;
export type ClientEvent = (typeof ClientEvent)[keyof typeof ClientEvent];

/** Socket.IO events emitted by this service to clients. */
export const ServerEvent = {
  NOTIFICATION: 'notification',
  NOTIFICATION_COUNT: 'notification:count',
  CHAT_MESSAGE: 'chat:message',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  PRESENCE_UPDATE: 'presence:update',
  CHAT_ERROR: 'chat:error',
  NOTIFICATION_ERROR: 'notification:error',
} as const;
export type ServerEvent = (typeof ServerEvent)[keyof typeof ServerEvent];

/** Domain events published by Laravel on the task channel. */
export const TaskEventName = {
  CREATED: 'task.created',
  ASSIGNED: 'task.assigned',
  UPDATED: 'task.updated',
  STATUS_CHANGED: 'task.status_changed',
} as const;
export type TaskEventName = (typeof TaskEventName)[keyof typeof TaskEventName];

/** Notification state changes published by Laravel (any subscribed channel). */
export const NotificationEventName = {
  COUNT_CHANGED: 'notification.count_changed',
} as const;
export type NotificationEventName =
  (typeof NotificationEventName)[keyof typeof NotificationEventName];

/** Domain events published by Laravel on the chat channel (proposed contract, see README). */
export const ChatEventName = {
  MESSAGE_CREATED: 'chat.message_created',
} as const;
export type ChatEventName = (typeof ChatEventName)[keyof typeof ChatEventName];

/**
 * Standard envelope for every Redis event. The payload is validated separately,
 * per (event, version), by the event registry.
 */
export const eventEnvelopeSchema = z.object({
  eventId: z.string().trim().min(1).max(200),
  event: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/, 'must look like "domain.action"'),
  version: z.number().int().positive(),
  payload: z.record(z.unknown()),
  occurredAt: z.string().datetime({ offset: true }),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
