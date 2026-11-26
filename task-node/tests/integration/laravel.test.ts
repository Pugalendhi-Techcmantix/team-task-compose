import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeLaravel } from '../helpers/fake-laravel.js';
import {
  closeAllClients,
  collect,
  connectClient,
  delay,
  emitWithAck,
  startTestService,
  waitForEvent,
  type TestService,
} from '../helpers/harness.js';
import { signToken } from '../helpers/tokens.js';

/**
 * Live chat with Laravel as the system of record:
 * join → Laravel membership check; send → Laravel stores → Node broadcasts.
 */

const SERVICE_TOKEN = 'laravel-internal-service-token-0123456789abcdef';
const MEMBERS: Record<number, number[]> = { 10: [25, 30] };

let laravel: FakeLaravel;
let ctx: TestService;
let nextMessageId = 1;

function defaultLaravel(req: { method: string; path: string; body: unknown }) {
  const membership = req.path.match(/^\/api\/v1\/internal\/conversations\/(\d+)\/members\/(\d+)$/);
  if (req.method === 'GET' && membership) {
    const [, conversationId, userId] = membership.map(Number);
    return MEMBERS[conversationId!]?.includes(userId!)
      ? { status: 200, body: { data: { conversationId, userId, isMember: true } } }
      : { status: 404, body: { message: 'Not found' } };
  }
  const messages = req.path.match(/^\/api\/v1\/internal\/conversations\/(\d+)\/messages$/);
  if (req.method === 'POST' && messages) {
    const body = req.body as { senderId: number };
    if (!MEMBERS[Number(messages[1])]?.includes(body.senderId)) return { status: 403 };
    return {
      status: 201,
      body: { data: { id: nextMessageId++, createdAt: '2026-11-26T10:00:00.000000Z' } },
    };
  }
  return { status: 404 };
}

beforeEach(async () => {
  nextMessageId = 1;
  laravel = new FakeLaravel();
  laravel.handler = defaultLaravel;
  const url = await laravel.start();
  ctx = await startTestService({
    env: {
      LARAVEL_API_URL: url,
      LARAVEL_SERVICE_TOKEN: SERVICE_TOKEN,
      LARAVEL_API_TIMEOUT_MS: '300',
    },
  });
});

afterEach(async () => {
  closeAllClients();
  await ctx.stop();
  await laravel.stop();
});

async function joinBoth() {
  const user25 = await connectClient(ctx.url, signToken(25));
  const user30 = await connectClient(ctx.url, signToken(30));
  expect(await emitWithAck(user25, 'conversation:join', { conversationId: 10 })).toMatchObject({
    ok: true,
  });
  expect(await emitWithAck(user30, 'conversation:join', { conversationId: 10 })).toMatchObject({
    ok: true,
  });
  return { user25, user30 };
}

describe('Laravel-backed conversation authorization', () => {
  it('uses the laravel adapters by default when LARAVEL_API_URL is set', () => {
    expect(ctx.config.conversationAuthorizationMode).toBe('laravel');
    expect(ctx.config.messagePersistenceMode).toBe('laravel');
  });

  it('asks Laravel with the service token and joins members only', async () => {
    const user25 = await connectClient(ctx.url, signToken(25));
    const outsider = await connectClient(ctx.url, signToken(99));

    expect(await emitWithAck(user25, 'conversation:join', { conversationId: 10 })).toEqual({
      ok: true,
      data: { conversationId: 10 },
    });
    expect(await emitWithAck(outsider, 'conversation:join', { conversationId: 10 })).toMatchObject({
      ok: false,
      error: { code: 'CONVERSATION_ACCESS_DENIED' },
    });

    expect(laravel.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /api/v1/internal/conversations/10/members/25',
      'GET /api/v1/internal/conversations/10/members/99',
    ]);
    expect(laravel.requests.every((r) => r.authorization === `Bearer ${SERVICE_TOKEN}`)).toBe(true);
  });

  it.each([
    [{ member: false }],
    [{ data: { member: false } }],
    // Shape Laravel actually returns
    [{ data: { conversationId: 10, userId: 25, isMember: false } }],
  ])('honours an explicit false membership flag in %j', async (body) => {
    laravel.handler = () => ({ status: 200, body });
    const user25 = await connectClient(ctx.url, signToken(25));
    expect(await emitWithAck(user25, 'conversation:join', { conversationId: 10 })).toMatchObject({
      ok: false,
      error: { code: 'CONVERSATION_ACCESS_DENIED' },
    });
  });

  it('fails closed when Laravel errors or times out', async () => {
    const user25 = await connectClient(ctx.url, signToken(25));

    laravel.handler = () => ({ status: 500 });
    expect(await emitWithAck(user25, 'conversation:join', { conversationId: 10 })).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR' },
    });

    laravel.handler = () => ({ status: 200, delayMs: 1000 });
    expect(await emitWithAck(user25, 'conversation:join', { conversationId: 10 })).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR' },
    });

    const rooms = (await ctx.service.io.fetchSockets())[0]?.rooms;
    expect(rooms?.has('conversation:10')).toBe(false);
  });
});

describe('Laravel-backed chat persistence', () => {
  it('stores through Laravel, then broadcasts with Laravel’s id and createdAt', async () => {
    const { user25, user30 } = await joinBoth();
    const incoming = waitForEvent(user30, 'chat:message');

    const ack = await emitWithAck(user25, 'chat:send', {
      conversationId: 10,
      senderId: 999,
      message: 'Hello',
    });

    const expected = {
      id: '1',
      conversationId: 10,
      senderId: 25,
      message: 'Hello',
      createdAt: '2026-11-26T10:00:00.000000Z',
    };
    expect(ack).toEqual({ ok: true, data: expected });
    expect(await incoming).toEqual(expected);

    const post = laravel.requests.find((r) => r.method === 'POST');
    expect(post).toMatchObject({
      path: '/api/v1/internal/conversations/10/messages',
      authorization: `Bearer ${SERVICE_TOKEN}`,
      body: { conversationId: 10, senderId: 25, message: 'Hello' },
    });
  });

  it('accepts an unwrapped { id, createdAt } response', async () => {
    const { user25 } = await joinBoth();
    laravel.handler = () => ({
      status: 201,
      body: { id: 'msg_abc', createdAt: '2026-11-26T10:00:00Z' },
    });
    const ack = await emitWithAck(user25, 'chat:send', { conversationId: 10, message: 'Hi' });
    expect(ack).toMatchObject({ ok: true, data: { id: 'msg_abc' } });
  });

  it.each([
    [500, undefined, 'MESSAGE_PERSISTENCE_FAILED'],
    [201, { unexpected: true }, 'MESSAGE_PERSISTENCE_FAILED'],
    [403, undefined, 'CONVERSATION_ACCESS_DENIED'],
    [422, { message: 'The message field is invalid.' }, 'INVALID_PAYLOAD'],
  ])('does not broadcast when Laravel answers %i', async (status, body, code) => {
    const { user25, user30 } = await joinBoth();
    const received = collect(user30, 'chat:message');
    laravel.handler = () => ({ status, body });

    const ack = await emitWithAck(user25, 'chat:send', { conversationId: 10, message: 'Hi' });
    expect(ack).toMatchObject({ ok: false, error: { code } });
    expect(JSON.stringify(ack)).not.toContain('invalid.');
    await delay(100);
    expect(received).toEqual([]);
  });

  it('does not broadcast when Laravel times out', async () => {
    const { user25, user30 } = await joinBoth();
    const received = collect(user30, 'chat:message');
    laravel.handler = () => ({ status: 201, delayMs: 1000 });
    const ack = await emitWithAck(user25, 'chat:send', { conversationId: 10, message: 'Hi' });
    expect(ack).toMatchObject({ ok: false, error: { code: 'MESSAGE_PERSISTENCE_FAILED' } });
    expect(received).toEqual([]);
  });
});
