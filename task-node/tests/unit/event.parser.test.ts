import { describe, expect, it, vi } from 'vitest';
import { EventDeduplicator } from '../../src/events/event.deduplicator.js';
import { MAX_EVENT_BYTES, parseEvent } from '../../src/events/event.parser.js';
import { EventRegistry, defineEvent } from '../../src/events/event.registry.js';
import { EventRouter } from '../../src/events/event.router.js';
import { createTaskEventDefinitions } from '../../src/events/task.events.js';
import { NotificationService } from '../../src/services/notification.service.js';
import { createSilentLogger } from '../../src/utils/logger.js';
import { RecordingEmitter } from '../helpers/mocks.js';
import { z } from 'zod';

const logger = createSilentLogger();

function taskRegistry() {
  const emitter = new RecordingEmitter();
  const registry = new EventRegistry().register(
    ...createTaskEventDefinitions(new NotificationService(emitter, logger))
  );
  return { registry, emitter };
}

const envelope = (overrides: Record<string, unknown> = {}) => ({
  eventId: 'evt_100',
  event: 'task.assigned',
  version: 1,
  payload: { taskId: 101, assignedTo: 25, createdBy: 10, title: 'Fix payment bug' },
  occurredAt: '2026-11-26T10:00:00Z',
  ...overrides,
});

describe('parseEvent', () => {
  const { registry } = taskRegistry();

  it('parses a valid envelope and payload', () => {
    const result = parseEvent(JSON.stringify(envelope()), registry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.envelope.eventId).toBe('evt_100');
    expect(result.value.payload).toEqual({
      taskId: 101,
      assignedTo: 25,
      createdBy: 10,
      title: 'Fix payment bug',
    });
  });

  it('accepts offset timestamps', () => {
    const result = parseEvent(
      JSON.stringify(envelope({ occurredAt: '2026-11-26T10:00:00.000+05:30' })),
      registry
    );
    expect(result.ok).toBe(true);
  });

  it('strips unknown payload fields', () => {
    const result = parseEvent(
      JSON.stringify(
        envelope({ payload: { taskId: 1, assignedTo: 2, internalNotes: 'secret', password: 'x' } })
      ),
      registry
    );
    expect(result.ok && result.value.payload).toEqual({ taskId: 1, assignedTo: 2 });
  });

  it('rejects invalid JSON', () => {
    const result = parseEvent('{not json', registry);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('INVALID_PAYLOAD');
  });

  it.each(['eventId', 'event', 'version', 'payload', 'occurredAt'])(
    'rejects an envelope missing %s',
    (field) => {
      const data: Record<string, unknown> = envelope();
      delete data[field];
      const result = parseEvent(JSON.stringify(data), registry);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('INVALID_PAYLOAD');
      expect(result.error.details?.some((d) => d.path === field)).toBe(true);
    }
  );

  it('rejects a non-ISO timestamp and a non-integer version', () => {
    expect(parseEvent(JSON.stringify(envelope({ occurredAt: 'yesterday' })), registry).ok).toBe(
      false
    );
    expect(parseEvent(JSON.stringify(envelope({ version: 1.5 })), registry).ok).toBe(false);
  });

  it('rejects unknown events with UNKNOWN_EVENT', () => {
    const result = parseEvent(JSON.stringify(envelope({ event: 'task.deleted' })), registry);
    expect(!result.ok && result.error.code).toBe('UNKNOWN_EVENT');
    expect(!result.ok && result.eventId).toBe('evt_100');
  });

  it('rejects unsupported versions and lists supported ones', () => {
    const result = parseEvent(JSON.stringify(envelope({ version: 2 })), registry);
    expect(!result.ok && result.error.code).toBe('UNKNOWN_EVENT');
    expect(!result.ok && result.error.message).toContain('supported: 1');
  });

  it('rejects payloads that fail the versioned schema', () => {
    const result = parseEvent(
      JSON.stringify(envelope({ payload: { taskId: 101, assignedTo: 'twenty-five' } })),
      registry
    );
    expect(!result.ok && result.error.code).toBe('INVALID_PAYLOAD');
    expect(!result.ok && result.error.details?.[0]?.path).toBe('assignedTo');
  });

  it('rejects oversized messages before parsing', () => {
    const result = parseEvent('x'.repeat(MAX_EVENT_BYTES + 1), registry);
    expect(!result.ok && result.error.message).toContain('size');
  });

  it('routes each version to its own handler', () => {
    const v1 = vi.fn();
    const v2 = vi.fn();
    const registry = new EventRegistry().register(
      defineEvent({
        event: 'demo.thing',
        version: 1,
        payloadSchema: z.object({ a: z.number() }),
        handle: v1,
      }),
      defineEvent({
        event: 'demo.thing',
        version: 2,
        payloadSchema: z.object({ b: z.string() }),
        handle: v2,
      })
    );
    const parsed = parseEvent(
      JSON.stringify({ ...envelope(), event: 'demo.thing', version: 2, payload: { b: 'x' } }),
      registry
    );
    expect(parsed.ok && parsed.value.definition.version).toBe(2);
    expect(() =>
      registry.register(
        defineEvent({ event: 'demo.thing', version: 1, payloadSchema: z.object({}), handle: v1 })
      )
    ).toThrow(/already registered/);
  });
});

describe('EventRouter', () => {
  it('dispatches valid events, drops invalid ones and never throws', async () => {
    const { registry, emitter } = taskRegistry();
    const router = new EventRouter(registry, new EventDeduplicator(60_000), logger);

    await expect(router.handle('task.events', 'garbage')).resolves.toBeUndefined();
    await expect(
      router.handle('task.events', JSON.stringify(envelope({ event: 'task.nope' })))
    ).resolves.toBeUndefined();
    expect(emitter.emitted).toHaveLength(0);

    await router.handle('task.events', JSON.stringify(envelope()));
    expect(emitter.emitted).toHaveLength(1);
  });

  it('ignores duplicate event IDs', async () => {
    const { registry, emitter } = taskRegistry();
    const router = new EventRouter(registry, new EventDeduplicator(60_000), logger);
    await router.handle('task.events', JSON.stringify(envelope()));
    await router.handle('task.events', JSON.stringify(envelope()));
    expect(emitter.emitted).toHaveLength(1);
  });

  it('contains handler failures and allows a retry of the same event', async () => {
    let calls = 0;
    const registry = new EventRegistry().register(
      defineEvent({
        event: 'demo.flaky',
        version: 1,
        payloadSchema: z.object({}),
        handle: () => {
          calls += 1;
          if (calls === 1) throw new Error('boom');
        },
      })
    );
    const router = new EventRouter(registry, new EventDeduplicator(60_000), logger);
    const raw = JSON.stringify({ ...envelope(), event: 'demo.flaky', payload: {} });
    await expect(router.handle('x', raw)).resolves.toBeUndefined();
    await router.handle('x', raw);
    await router.handle('x', raw);
    expect(calls).toBe(2);
  });
});

describe('EventDeduplicator', () => {
  it('forgets events after the TTL and caps its size', () => {
    let now = 0;
    const dedupe = new EventDeduplicator(1000, 3, () => now);
    dedupe.markProcessed('a');
    expect(dedupe.isDuplicate('a')).toBe(true);
    now = 1001;
    expect(dedupe.isDuplicate('a')).toBe(false);

    for (const id of ['b', 'c', 'd', 'e']) dedupe.markProcessed(id);
    expect(dedupe.size).toBeLessThanOrEqual(3);
    expect(dedupe.isDuplicate('e')).toBe(true);
    expect(dedupe.isDuplicate('b')).toBe(false);
  });
});
