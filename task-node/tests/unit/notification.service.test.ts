import { describe, expect, it } from 'vitest';
import { EventDeduplicator } from '../../src/events/event.deduplicator.js';
import { EventRegistry } from '../../src/events/event.registry.js';
import { EventRouter } from '../../src/events/event.router.js';
import { createNotificationEventDefinitions } from '../../src/events/notification.events.js';
import { createTaskEventDefinitions } from '../../src/events/task.events.js';
import { NotificationService } from '../../src/services/notification.service.js';
import { createSilentLogger } from '../../src/utils/logger.js';
import { RecordingEmitter } from '../helpers/mocks.js';

const logger = createSilentLogger();

function setup() {
  const emitter = new RecordingEmitter();
  const service = new NotificationService(emitter, logger);
  const router = new EventRouter(
    new EventRegistry().register(
      ...createTaskEventDefinitions(service),
      ...createNotificationEventDefinitions(service)
    ),
    new EventDeduplicator(60_000),
    logger
  );
  const publish = (event: string, payload: Record<string, unknown>, eventId = `evt_${event}`) =>
    router.handle(
      'task.events',
      JSON.stringify({ eventId, event, version: 1, payload, occurredAt: '2026-11-26T10:00:00Z' })
    );
  return { emitter, service, publish };
}

describe('unread notification count', () => {
  it('uses Laravel’s notificationId and unreadCount when the task event carries them', async () => {
    const { emitter, publish } = setup();
    await publish(
      'task.assigned',
      { taskId: 101, assignedTo: 25, title: 'Fix', notificationId: 'a1b2-uuid', unreadCount: 4 },
      'evt_x'
    );
    expect(emitter.emitted[0]?.payload).toMatchObject({ id: 'a1b2-uuid', unreadCount: 4 });
  });

  it('accepts a numeric notificationId and omits unreadCount when absent', async () => {
    const { emitter, publish } = setup();
    await publish('task.assigned', { taskId: 1, assignedTo: 25, notificationId: 77 });
    const payload = emitter.emitted[0]?.payload as Record<string, unknown>;
    expect(payload.id).toBe('77');
    expect('unreadCount' in payload).toBe(false);
  });

  it('forwards notification.count_changed to the user room as notification:count', async () => {
    const { emitter, publish } = setup();
    await publish('notification.count_changed', { userId: 25, unreadCount: 0 }, 'evt_read');
    expect(emitter.emitted).toEqual([
      {
        target: 'user:25',
        event: 'notification:count',
        payload: { unreadCount: 0, updatedAt: '2026-11-26T10:00:00Z' },
      },
    ]);
  });

  it.each([
    [{ userId: 25, unreadCount: -1 }],
    [{ userId: 25, unreadCount: 1.5 }],
    [{ userId: 25 }],
    [{ unreadCount: 3 }],
  ])('rejects invalid count payload %j', async (payload) => {
    const { emitter, publish } = setup();
    await publish('notification.count_changed', payload);
    expect(emitter.emitted).toHaveLength(0);
  });
});

describe('NotificationService', () => {
  it('builds the frontend notification for task.assigned and targets the assignee', async () => {
    const { emitter, publish } = setup();
    await publish(
      'task.assigned',
      { taskId: 101, assignedTo: 25, createdBy: 10, title: 'Fix payment bug' },
      'evt_100'
    );

    expect(emitter.emitted).toEqual([
      {
        target: 'user:25',
        event: 'notification',
        payload: {
          id: 'evt_100',
          type: 'task.assigned',
          title: 'New task assigned',
          message: 'Fix payment bug',
          taskId: 101,
          createdAt: '2026-11-26T10:00:00Z',
        },
      },
    ]);
  });

  it('does not leak internal fields such as createdBy', async () => {
    const { emitter, publish } = setup();
    await publish('task.assigned', { taskId: 1, assignedTo: 25, createdBy: 10, secret: 'x' });
    const payload = emitter.emitted[0]?.payload as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      ['createdAt', 'id', 'message', 'taskId', 'title', 'type'].sort()
    );
  });

  it('falls back to "Task #id" when no title is provided', async () => {
    const { emitter, publish } = setup();
    await publish('task.assigned', { taskId: 101, assignedTo: 25 });
    expect(emitter.emitted[0]?.payload).toMatchObject({ message: 'Task #101' });
  });

  it('handles task.created, task.updated and task.status_changed', async () => {
    const { emitter, publish } = setup();
    await publish('task.created', { taskId: 1, title: 'A', createdBy: 10, assignedTo: 30 });
    await publish('task.updated', { taskId: 2, title: 'B', assignedTo: 31, updatedBy: 10 });
    await publish('task.status_changed', {
      taskId: 3,
      title: 'C',
      status: 'done',
      previousStatus: 'in_progress',
      assignedTo: 32,
    });

    expect(emitter.emitted.map((e) => [e.target, (e.payload as { title: string }).title])).toEqual([
      ['user:30', 'New task created'],
      ['user:31', 'Task updated'],
      ['user:32', 'Task status changed'],
    ]);
    expect(emitter.emitted[2]?.payload).toMatchObject({ message: 'C: in_progress → done' });
  });

  it('sends nothing when there is no recipient', async () => {
    const { emitter, publish } = setup();
    await publish('task.created', { taskId: 1, title: 'Unassigned', assignedTo: null });
    await publish('task.updated', { taskId: 2 });
    expect(emitter.emitted).toHaveLength(0);
  });

  it('rejects task.assigned without an assignee', async () => {
    const { emitter, publish } = setup();
    await publish('task.assigned', { taskId: 1 });
    expect(emitter.emitted).toHaveLength(0);
  });
});
