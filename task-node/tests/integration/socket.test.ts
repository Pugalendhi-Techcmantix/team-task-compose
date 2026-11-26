import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeAllClients,
  collect,
  connectClient,
  delay,
  emitWithAck,
  startTestService,
  until,
  waitForEvent,
  type TestService,
} from '../helpers/harness.js';
import { RecordingMessagePersistence, StaticConversationAuthorizer } from '../helpers/mocks.js';
import { signToken } from '../helpers/tokens.js';

/** Socket.IO integration tests against the real server; Redis is replaced by an in-memory source. */

let ctx: TestService;
let persistence: RecordingMessagePersistence;

const taskAssigned = (eventId: string, assignedTo: number) => ({
  eventId,
  event: 'task.assigned',
  version: 1,
  payload: { taskId: 101, assignedTo, title: 'Fix payment bug' },
  occurredAt: '2026-11-26T10:00:00Z',
});

beforeEach(async () => {
  persistence = new RecordingMessagePersistence();
  ctx = await startTestService({
    env: {
      RATE_LIMIT_CHAT_SEND: '5',
      RATE_LIMIT_WINDOW_MS: '60000',
      CHAT_MAX_MESSAGE_LENGTH: '50',
    },
    overrides: {
      conversationAuthorizer: new StaticConversationAuthorizer({ 10: [25, 30], 20: [30] }),
      messagePersistence: persistence,
    },
  });
});

afterEach(async () => {
  closeAllClients();
  await ctx.stop();
});

describe('HTTP endpoints', () => {
  it('GET /health returns ok', async () => {
    const res = await request(ctx.service.httpServer).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('GET /ready reflects event source readiness', async () => {
    const ready = await request(ctx.service.httpServer).get('/ready');
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: 'ready', redis: 'connected' });

    ctx.events!.ready = false;
    const notReady = await request(ctx.service.httpServer).get('/ready');
    expect(notReady.status).toBe(503);
    expect(notReady.body).toEqual({ status: 'not_ready', redis: 'disconnected' });
  });

  it('returns structured 404s and restricts CORS to the configured origin', async () => {
    const res = await request(ctx.service.httpServer)
      .get('/nope')
      .set('Origin', 'http://evil.example');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();

    const allowed = await request(ctx.service.httpServer)
      .get('/health')
      .set('Origin', 'http://localhost:3001');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3001');
  });
});

describe('authentication', () => {
  it('accepts a valid credential', async () => {
    const client = await connectClient(ctx.url, signToken(25));
    expect(client.connected).toBe(true);
  });

  it.each([
    ['missing', undefined, 'UNAUTHORIZED'],
    ['garbage', 'not-a-token', 'INVALID_TOKEN'],
    ['wrong secret', signToken(25, { secret: 'x'.repeat(40) }), 'INVALID_TOKEN'],
    ['wrong audience', signToken(25, { audience: 'other' }), 'INVALID_TOKEN'],
    ['expired', signToken(25, { expiresInSec: -60 }), 'TOKEN_EXPIRED'],
  ])('rejects a %s credential', async (_label, token, code) => {
    const error = (await connectClient(ctx.url, token).catch((e: unknown) => e)) as {
      message: string;
      data?: { code: string };
    };
    expect(error).toBeInstanceOf(Error);
    expect(error.data?.code).toBe(code);
  });

  it('ignores a client-supplied userId in the handshake', async () => {
    const client = await connectClient(ctx.url, signToken(25));
    const sockets = await ctx.service.io.fetchSockets();
    expect(sockets.map((s) => s.data.userId)).toEqual([25]);
    client.close();

    const spoof = (await connectClient(ctx.url, undefined).catch((e: unknown) => e)) as Error;
    expect(spoof).toBeInstanceOf(Error);
  });

  it('disconnects a socket when its credential expires', async () => {
    const client = await connectClient(ctx.url, signToken(25, { expiresInSec: 1 }));
    const reason = await waitForEvent<string>(client, 'disconnect', 4000);
    expect(reason).toBe('io server disconnect');
  });
});

describe('user rooms and notifications', () => {
  it('delivers a task notification only to the target user (mandatory E2E scenario)', async () => {
    const user25 = await connectClient(ctx.url, signToken(25));
    const user30 = await connectClient(ctx.url, signToken(30));
    const received30 = collect(user30, 'notification');

    const sockets = await ctx.service.io.fetchSockets();
    const roomsByUser = Object.fromEntries(sockets.map((s) => [s.data.userId, [...s.rooms]]));
    expect(roomsByUser[25]).toContain('user:25');
    expect(roomsByUser[30]).toContain('user:30');

    const notification = waitForEvent(user25, 'notification');
    await ctx.events!.publish('task.events', taskAssigned('evt_1', 25));

    expect(await notification).toEqual({
      id: 'evt_1',
      type: 'task.assigned',
      title: 'New task assigned',
      message: 'Fix payment bug',
      taskId: 101,
      createdAt: '2026-11-26T10:00:00Z',
    });
    await delay(150);
    expect(received30).toEqual([]);
  });

  it('syncs the unread count to every tab of that user only', async () => {
    const tabA = await connectClient(ctx.url, signToken(25));
    const tabB = await connectClient(ctx.url, signToken(25));
    const other = await connectClient(ctx.url, signToken(30));
    const otherCounts = collect(other, 'notification:count');

    const a = waitForEvent(tabA, 'notification:count');
    const b = waitForEvent(tabB, 'notification:count');
    await ctx.events!.publish('task.events', {
      eventId: 'evt_count_1',
      event: 'notification.count_changed',
      version: 1,
      payload: { userId: 25, unreadCount: 2 },
      occurredAt: '2026-11-26T10:05:00Z',
    });

    const expected = { unreadCount: 2, updatedAt: '2026-11-26T10:05:00Z' };
    expect(await a).toEqual(expected);
    expect(await b).toEqual(expected);
    await delay(100);
    expect(otherCounts).toEqual([]);
  });

  it('delivers to every socket of the same user (multi-device)', async () => {
    const socketA = await connectClient(ctx.url, signToken(25));
    const socketB = await connectClient(ctx.url, signToken(25));
    const a = waitForEvent(socketA, 'notification');
    const b = waitForEvent(socketB, 'notification');
    await ctx.events!.publish('task.events', taskAssigned('evt_multi', 25));
    expect((await a) as { id: string }).toMatchObject({ id: 'evt_multi' });
    expect((await b) as { id: string }).toMatchObject({ id: 'evt_multi' });
  });

  it('ignores invalid events and keeps serving valid ones', async () => {
    const client = await connectClient(ctx.url, signToken(25));
    const received = collect(client, 'notification');
    await ctx.events!.publish('task.events', '{broken');
    await ctx.events!.publish('task.events', { ...taskAssigned('evt_bad', 25), version: 99 });
    await ctx.events!.publish('task.events', taskAssigned('evt_ok', 25));
    await until(() => received.length === 1);
    expect(received).toMatchObject([{ id: 'evt_ok' }]);
  });
});

describe('conversations and chat', () => {
  it('joins permitted conversations and rejects others', async () => {
    const user25 = await connectClient(ctx.url, signToken(25));
    expect(await emitWithAck(user25, 'conversation:join', { conversationId: 10 })).toEqual({
      ok: true,
      data: { conversationId: 10 },
    });

    const chatError = waitForEvent(user25, 'chat:error');
    const denied = await emitWithAck(user25, 'conversation:join', { conversationId: 20 });
    expect(denied).toMatchObject({ ok: false, error: { code: 'CONVERSATION_ACCESS_DENIED' } });
    expect(await chatError).toMatchObject({
      code: 'CONVERSATION_ACCESS_DENIED',
      event: 'conversation:join',
    });

    const rooms = (await ctx.service.io.fetchSockets())[0]?.rooms;
    expect(rooms?.has('conversation:10')).toBe(true);
    expect(rooms?.has('conversation:20')).toBe(false);
  });

  it('validates conversation IDs', async () => {
    const user25 = await connectClient(ctx.url, signToken(25));
    for (const payload of [{ conversationId: 'abc' }, { conversationId: -1 }, 'x', null]) {
      const res = await emitWithAck(user25, 'conversation:join', payload);
      expect(res).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
    }
  });

  it('delivers chat messages to conversation members with the authenticated sender', async () => {
    const user25 = await connectClient(ctx.url, signToken(25));
    const user30 = await connectClient(ctx.url, signToken(30));
    await emitWithAck(user25, 'conversation:join', { conversationId: 10 });
    await emitWithAck(user30, 'conversation:join', { conversationId: 10 });

    const incoming = waitForEvent(user30, 'chat:message');
    const ack = await emitWithAck(user25, 'chat:send', { conversationId: 10, message: 'Hello' });

    const expected = {
      id: 'msg_1',
      conversationId: 10,
      senderId: 25,
      message: 'Hello',
      createdAt: '2026-11-26T10:00:00.000Z',
    };
    expect(await incoming).toEqual(expected);
    expect(ack).toEqual({ ok: true, data: expected });
  });

  it('never takes senderId from the client (security test)', async () => {
    const user25 = await connectClient(ctx.url, signToken(25));
    const user30 = await connectClient(ctx.url, signToken(30));
    await emitWithAck(user25, 'conversation:join', { conversationId: 10 });
    await emitWithAck(user30, 'conversation:join', { conversationId: 10 });

    const incoming = waitForEvent<{ senderId: number }>(user30, 'chat:message');
    user25.emit('chat:send', { conversationId: 10, senderId: 999, message: 'Hello' });

    expect((await incoming).senderId).toBe(25);
    expect(persistence.saved[0]?.senderId).toBe(25);
  });

  it('does not deliver to users outside the conversation', async () => {
    const user25 = await connectClient(ctx.url, signToken(25));
    const outsider = await connectClient(ctx.url, signToken(30));
    const outsiderMessages = collect(outsider, 'chat:message');
    await emitWithAck(user25, 'conversation:join', { conversationId: 10 });
    await emitWithAck(user25, 'chat:send', { conversationId: 10, message: 'secret' });
    await delay(150);
    expect(outsiderMessages).toEqual([]);
  });

  it('rejects sending to a conversation the socket has not joined', async () => {
    const user25 = await connectClient(ctx.url, signToken(25));
    const res = await emitWithAck(user25, 'chat:send', { conversationId: 10, message: 'hi' });
    expect(res).toMatchObject({ ok: false, error: { code: 'NOT_IN_CONVERSATION' } });
  });

  it('rejects empty, oversized and malformed messages with structured errors', async () => {
    const user25 = await connectClient(ctx.url, signToken(25));
    await emitWithAck(user25, 'conversation:join', { conversationId: 10 });

    expect(
      await emitWithAck(user25, 'chat:send', { conversationId: 10, message: ' ' })
    ).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
    expect(
      await emitWithAck(user25, 'chat:send', { conversationId: 10, message: 'x'.repeat(51) })
    ).toMatchObject({ ok: false, error: { code: 'MESSAGE_TOO_LARGE' } });
    const malformed = await emitWithAck(user25, 'chat:send', { conversationId: 10 });
    expect(malformed).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD', details: [{ path: 'message' }] },
    });
    expect(JSON.stringify(malformed)).not.toMatch(/stack|at .*\.ts/);
  });

  it('drops the connection for packets above the Socket.IO payload limit', async () => {
    const user25 = await connectClient(ctx.url, signToken(25));
    const disconnected = waitForEvent(user25, 'disconnect');
    user25.emit('chat:send', { conversationId: 10, message: 'x'.repeat(20 * 1024) });
    expect(await disconnected).toBe('transport close');
  });

  it('rate limits chat:send', async () => {
    const user25 = await connectClient(ctx.url, signToken(25));
    await emitWithAck(user25, 'conversation:join', { conversationId: 10 });
    const results = [];
    for (let i = 0; i < 7; i += 1) {
      results.push(
        await emitWithAck(user25, 'chat:send', { conversationId: 10, message: `m${i}` })
      );
    }
    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(results[5]).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });

  it('stops delivering after conversation:leave', async () => {
    const user25 = await connectClient(ctx.url, signToken(25));
    const user30 = await connectClient(ctx.url, signToken(30));
    await emitWithAck(user25, 'conversation:join', { conversationId: 10 });
    await emitWithAck(user30, 'conversation:join', { conversationId: 10 });
    expect(await emitWithAck(user30, 'conversation:leave', { conversationId: 10 })).toEqual({
      ok: true,
      data: { conversationId: 10 },
    });
    const received = collect(user30, 'chat:message');
    await emitWithAck(user25, 'chat:send', { conversationId: 10, message: 'anyone?' });
    await delay(150);
    expect(received).toEqual([]);
  });

  it('works without an ack callback by emitting chat:error', async () => {
    const user25 = await connectClient(ctx.url, signToken(25));
    const error = waitForEvent(user25, 'chat:error');
    user25.emit('chat:send', { conversationId: 10, message: 'hi' });
    expect(await error).toMatchObject({ code: 'NOT_IN_CONVERSATION', event: 'chat:send' });
  });
});

describe('typing indicators', () => {
  it('relays typing:start/stop to other members with the authenticated user ID', async () => {
    const user25 = await connectClient(ctx.url, signToken(25));
    const user30 = await connectClient(ctx.url, signToken(30));
    await emitWithAck(user25, 'conversation:join', { conversationId: 10 });
    await emitWithAck(user30, 'conversation:join', { conversationId: 10 });
    const ownEcho = collect(user25, 'typing:start');

    const started = waitForEvent(user30, 'typing:start');
    user25.emit('typing:start', { conversationId: 10, userId: 999 });
    expect(await started).toEqual({ conversationId: 10, userId: 25 });

    const stopped = waitForEvent(user30, 'typing:stop');
    user25.emit('typing:stop', { conversationId: 10 });
    expect(await stopped).toEqual({ conversationId: 10, userId: 25 });
    expect(ownEcho).toEqual([]);
  });

  it('clears typing when the typing user disconnects', async () => {
    const user25 = await connectClient(ctx.url, signToken(25));
    const user30 = await connectClient(ctx.url, signToken(30));
    await emitWithAck(user25, 'conversation:join', { conversationId: 10 });
    await emitWithAck(user30, 'conversation:join', { conversationId: 10 });
    const stopped = waitForEvent(user30, 'typing:stop');
    user25.close();
    expect(await stopped).toEqual({ conversationId: 10, userId: 25 });
  });
});

describe('presence', () => {
  it('reports online once and offline only after the last socket disconnects', async () => {
    const observer = await connectClient(ctx.url, signToken(30));
    const updates = collect<{ userId: number; status: string }>(observer, 'presence:update');

    const socketA = await connectClient(ctx.url, signToken(25));
    const socketB = await connectClient(ctx.url, signToken(25));
    await until(() => updates.some((u) => u.userId === 25));

    socketA.close();
    await delay(150);
    expect(updates.filter((u) => u.userId === 25).map((u) => u.status)).toEqual(['online']);

    socketB.close();
    await until(() => updates.filter((u) => u.userId === 25).length === 2);
    expect(updates.filter((u) => u.userId === 25).map((u) => u.status)).toEqual([
      'online',
      'offline',
    ]);
  });
});

describe('graceful shutdown', () => {
  it('disconnects clients, stops the event source and closes the HTTP server', async () => {
    const client = await connectClient(ctx.url, signToken(25));
    const disconnected = waitForEvent(client, 'disconnect');
    await ctx.stop();
    expect(await disconnected).toBe('io server disconnect');
    expect(ctx.events!.stopped).toBe(true);
    expect(ctx.service.httpServer.listening).toBe(false);
    expect(ctx.service.readiness()).toMatchObject({ status: 'not_ready', shuttingDown: true });
    await expect(ctx.stop()).resolves.toBeUndefined();
  });
});
