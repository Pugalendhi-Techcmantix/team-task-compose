import { describe, expect, it } from 'vitest';
import { InMemoryPresenceStore, PresenceService } from '../../src/services/presence.service.js';
import { createSilentLogger } from '../../src/utils/logger.js';
import { FixedWindowRateLimiter } from '../../src/utils/rate-limiter.js';
import { RecordingEmitter } from '../helpers/mocks.js';

const at = new Date('2026-11-26T10:00:00Z');

function setup() {
  const emitter = new RecordingEmitter();
  const presence = new PresenceService(
    new InMemoryPresenceStore(),
    emitter,
    createSilentLogger(),
    () => at
  );
  const statuses = () => emitter.emitted.map((e) => e.payload);
  return { presence, emitter, statuses };
}

describe('PresenceService', () => {
  it('goes online on the first socket and offline after the last', async () => {
    const { presence, statuses } = setup();

    await presence.connect(25, 'A');
    await presence.connect(25, 'B');
    await presence.connect(25, 'C');
    expect(statuses()).toEqual([{ userId: 25, status: 'online', at: at.toISOString() }]);

    await presence.disconnect(25, 'A');
    await presence.disconnect(25, 'B');
    expect(await presence.isOnline(25)).toBe(true);
    expect(statuses()).toHaveLength(1);

    await presence.disconnect(25, 'C');
    expect(await presence.isOnline(25)).toBe(false);
    expect(statuses()).toEqual([
      { userId: 25, status: 'online', at: at.toISOString() },
      { userId: 25, status: 'offline', at: at.toISOString() },
    ]);
  });

  it('broadcasts presence to everyone', async () => {
    const { presence, emitter } = setup();
    await presence.connect(30, 'X');
    expect(emitter.emitted[0]).toMatchObject({ target: '*', event: 'presence:update' });
  });

  it('ignores unknown or repeated disconnects', async () => {
    const { presence, statuses } = setup();
    await presence.disconnect(25, 'nope');
    await presence.connect(25, 'A');
    await presence.disconnect(25, 'A');
    await presence.disconnect(25, 'A');
    expect(statuses().map((s) => (s as { status: string }).status)).toEqual(['online', 'offline']);
  });

  it('tracks users independently', async () => {
    const store = new InMemoryPresenceStore();
    await store.addConnection(25, 'A');
    await store.addConnection(30, 'B');
    expect(await store.connectionCount(25)).toBe(1);
    await store.removeConnection(25, 'A');
    expect(await store.isOnline(30)).toBe(true);
  });
});

describe('FixedWindowRateLimiter', () => {
  it('allows up to the limit per window, per key', () => {
    let now = 0;
    const limiter = new FixedWindowRateLimiter(2, 1000, () => now);
    expect([limiter.consume('a'), limiter.consume('a'), limiter.consume('a')]).toEqual([
      true,
      true,
      false,
    ]);
    expect(limiter.consume('b')).toBe(true);
    now = 1000;
    expect(limiter.consume('a')).toBe(true);
    limiter.sweep(5000);
    expect(limiter.size).toBe(0);
  });
});
