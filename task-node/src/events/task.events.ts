import { z } from 'zod';
import type {
  NotificationService,
  TaskNotificationInput,
} from '../services/notification.service.js';
import { entityIdSchema } from '../types/ids.js';
import { defineEvent, type RegisteredEvent } from './event.registry.js';
import { unreadCountSchema } from './notification.events.js';
import { TaskEventName, type EventEnvelope } from './event.types.js';

const taskTitle = z.string().trim().min(1).max(500);
const taskStatus = z.string().trim().min(1).max(64);
/** Laravel may send `null` for "no assignee"; treat it as absent. */
const optionalUser = entityIdSchema
  .nullable()
  .optional()
  .transform((value) => value ?? undefined);

/**
 * Optional fields Laravel adds when it stores the notification: its ID (so the client can
 * mark it read) and the recipient's unread count after this notification.
 */
const notificationMeta = {
  notificationId: z
    .union([z.string().trim().min(1).max(100), entityIdSchema])
    .transform(String)
    .optional(),
  unreadCount: unreadCountSchema.optional(),
};

// Version 1 payload schemas. Unknown fields are stripped, never forwarded to clients.
export const taskCreatedV1 = z.object({
  ...notificationMeta,
  taskId: entityIdSchema,
  title: taskTitle.optional(),
  createdBy: optionalUser,
  assignedTo: optionalUser,
});

export const taskAssignedV1 = z.object({
  ...notificationMeta,
  taskId: entityIdSchema,
  assignedTo: entityIdSchema,
  title: taskTitle.optional(),
  createdBy: optionalUser,
  assignedBy: optionalUser,
});

export const taskUpdatedV1 = z.object({
  ...notificationMeta,
  taskId: entityIdSchema,
  title: taskTitle.optional(),
  assignedTo: optionalUser,
  updatedBy: optionalUser,
});

export const taskStatusChangedV1 = z.object({
  ...notificationMeta,
  taskId: entityIdSchema,
  status: taskStatus,
  previousStatus: taskStatus.optional(),
  title: taskTitle.optional(),
  assignedTo: optionalUser,
  changedBy: optionalUser,
});

const base = (
  envelope: EventEnvelope,
  type: TaskEventName,
  meta: { notificationId?: string; unreadCount?: number }
) => ({
  type,
  eventId: envelope.eventId,
  occurredAt: envelope.occurredAt,
  notificationId: meta.notificationId,
  unreadCount: meta.unreadCount,
});

/**
 * Task event handlers. Each (event, version) maps its payload to a TaskNotificationInput;
 * supporting a v2 payload means adding one more definition here.
 */
export function createTaskEventDefinitions(notifications: NotificationService): RegisteredEvent[] {
  const notify = (input: TaskNotificationInput): void => {
    notifications.notifyTask(input);
  };

  return [
    defineEvent({
      event: TaskEventName.CREATED,
      version: 1,
      payloadSchema: taskCreatedV1,
      handle: (payload, envelope) =>
        notify({
          ...base(envelope, TaskEventName.CREATED, payload),
          taskId: payload.taskId,
          title: payload.title,
          recipientId: payload.assignedTo,
        }),
    }),
    defineEvent({
      event: TaskEventName.ASSIGNED,
      version: 1,
      payloadSchema: taskAssignedV1,
      handle: (payload, envelope) =>
        notify({
          ...base(envelope, TaskEventName.ASSIGNED, payload),
          taskId: payload.taskId,
          title: payload.title,
          recipientId: payload.assignedTo,
        }),
    }),
    defineEvent({
      event: TaskEventName.UPDATED,
      version: 1,
      payloadSchema: taskUpdatedV1,
      handle: (payload, envelope) =>
        notify({
          ...base(envelope, TaskEventName.UPDATED, payload),
          taskId: payload.taskId,
          title: payload.title,
          recipientId: payload.assignedTo,
        }),
    }),
    defineEvent({
      event: TaskEventName.STATUS_CHANGED,
      version: 1,
      payloadSchema: taskStatusChangedV1,
      handle: (payload, envelope) =>
        notify({
          ...base(envelope, TaskEventName.STATUS_CHANGED, payload),
          taskId: payload.taskId,
          title: payload.title,
          status: payload.status,
          previousStatus: payload.previousStatus,
          recipientId: payload.assignedTo,
        }),
    }),
  ];
}
