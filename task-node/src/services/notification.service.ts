import { ServerEvent, TaskEventName } from '../events/event.types.js';
import type { RealtimeEmitter } from '../socket/socket.emitter.js';
import type { TaskId, UserId } from '../types/ids.js';
import type { NotificationPayload } from '../types/socket.types.js';
import type { Logger } from '../utils/logger.js';

/**
 * Version-independent description of a task event. Versioned Redis payloads are mapped
 * to this shape in task.events.ts, so this service never changes when Laravel adds a
 * payload version.
 */
export interface TaskNotificationInput {
  type: TaskEventName;
  eventId: string;
  occurredAt: string;
  taskId: TaskId;
  /** User who should be notified. No recipient means no notification. */
  recipientId?: UserId;
  title?: string;
  status?: string;
  previousStatus?: string;
  /** Laravel's stored notification ID, so the client can mark it read. */
  notificationId?: string;
  /** Recipient's unread count including this notification, as computed by Laravel. */
  unreadCount?: number;
}

export interface UnreadCountInput {
  eventId: string;
  occurredAt: string;
  userId: UserId;
  unreadCount: number;
}

const TITLES: Record<TaskEventName, string> = {
  [TaskEventName.CREATED]: 'New task created',
  [TaskEventName.ASSIGNED]: 'New task assigned',
  [TaskEventName.UPDATED]: 'Task updated',
  [TaskEventName.STATUS_CHANGED]: 'Task status changed',
};

export class NotificationService {
  constructor(
    private readonly emitter: RealtimeEmitter,
    private readonly logger: Logger
  ) {}

  /** Builds the client-facing notification. Only fields the UI needs are exposed. */
  buildTaskNotification(input: TaskNotificationInput): NotificationPayload {
    return {
      id: input.notificationId ?? input.eventId,
      type: input.type,
      title: TITLES[input.type],
      message: this.describe(input),
      taskId: input.taskId,
      createdAt: input.occurredAt,
      ...(input.unreadCount !== undefined ? { unreadCount: input.unreadCount } : {}),
    };
  }

  /**
   * Pushes the user's unread count to all their tabs (e.g. after mark-as-read in one tab).
   * Laravel computes the number; Node only delivers it.
   */
  updateUnreadCount(input: UnreadCountInput): void {
    this.emitter.toUser(input.userId, ServerEvent.NOTIFICATION_COUNT, {
      unreadCount: input.unreadCount,
      updatedAt: input.occurredAt,
    });
    this.logger.info(
      {
        event: 'notification_count_sent',
        userId: input.userId,
        eventId: input.eventId,
        unreadCount: input.unreadCount,
      },
      'notification_count_sent'
    );
  }

  /** Sends the notification to every socket of the recipient. Returns whether one was sent. */
  notifyTask(input: TaskNotificationInput): boolean {
    if (input.recipientId === undefined) {
      this.logger.debug(
        { event: 'notification_skipped', eventId: input.eventId, eventType: input.type },
        'notification_skipped: no recipient'
      );
      return false;
    }

    const notification = this.buildTaskNotification(input);
    this.emitter.toUser(input.recipientId, ServerEvent.NOTIFICATION, notification);
    this.logger.info(
      {
        event: 'notification_sent',
        userId: input.recipientId,
        eventId: input.eventId,
        eventType: input.type,
        taskId: input.taskId,
      },
      'notification_sent'
    );
    return true;
  }

  private describe(input: TaskNotificationInput): string {
    const subject = input.title ?? `Task #${input.taskId}`;
    if (input.type === TaskEventName.STATUS_CHANGED && input.status) {
      return input.previousStatus
        ? `${subject}: ${input.previousStatus} → ${input.status}`
        : `${subject}: ${input.status}`;
    }
    return subject;
  }
}
