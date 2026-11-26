import { z } from 'zod';
import type { NotificationService } from '../services/notification.service.js';
import { entityIdSchema } from '../types/ids.js';
import { defineEvent, type RegisteredEvent } from './event.registry.js';
import { NotificationEventName } from './event.types.js';

/** Unread counts are small non-negative integers; cap to reject garbage. */
export const unreadCountSchema = z.number().int().min(0).max(1_000_000);

/**
 * `notification.count_changed` v1: Laravel publishes the user's new unread count whenever it
 * changes (new notification, mark-as-read, mark-all-read, delete). Node forwards it to every
 * tab of that user as `notification:count`.
 */
export const notificationCountChangedV1 = z.object({
  userId: entityIdSchema,
  unreadCount: unreadCountSchema,
});

export function createNotificationEventDefinitions(
  notifications: NotificationService
): RegisteredEvent[] {
  return [
    defineEvent({
      event: NotificationEventName.COUNT_CHANGED,
      version: 1,
      payloadSchema: notificationCountChangedV1,
      handle: (payload, envelope) =>
        notifications.updateUnreadCount({
          eventId: envelope.eventId,
          occurredAt: envelope.occurredAt,
          userId: payload.userId,
          unreadCount: payload.unreadCount,
        }),
    }),
  ];
}
