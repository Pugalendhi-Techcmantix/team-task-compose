import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { EventEnvelope } from '../../src/events/event.types.js';
import { RedisPublisher } from '../../src/redis/redis.publisher.js';
import { REDIS_TEST_HOST, REDIS_TEST_PORT } from '../helpers/config.js';
import {
  closeAllClients,
  collect,
  connectClient,
  delay,
  startTestService,
  until,
  waitForEvent,
  type TestService,
} from '../helpers/harness.js';
import { TcpProxy } from '../helpers/tcp-proxy.js';
import { signToken } from '../helpers/tokens.js';

/**
 * Runs against a real Redis (REDIS_TEST_HOST / REDIS_TEST_PORT, default 127.0.0.1:6379).
 * Every run uses unique channel names, so it never interferes with other Redis users.
 */

const runId = randomUUID().slice(0, 8);
const channels = {
  REDIS_TASK_CHANNEL: `test.${runId}.task.events`,
  REDIS_CHAT_CHANNEL: `test.${runId}.chat.events`,
};

let publisherConnection: Redis;
let publisher: RedisPublisher;
let ctx: TestService | undefined;

const event = (eventId: string, name: string, payload: Record<string, unknown>): EventEnvelope => ({
  eventId,
  event: name,
  version: 1,
  payload,
  occurredAt: new Date().toISOString(),
});

const publishTask = (envelope: EventEnvelope) =>
  publisher.publish(channels.REDIS_TASK_CHANNEL, envelope);

async function startWithRedis(env: Record<string, string> = {}): Promise<TestService> {
  ctx = await startTestService({ useRedis: true, env: { ...channels, ...env } });
  await until(() => ctx!.service.readiness().status === 'ready', 5000);
  return ctx;
}

beforeAll(async () => {
  publisherConnection = new Redis({
    host: REDIS_TEST_HOST,
    port: REDIS_TEST_PORT,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  try {
    await publisherConnection.connect();
  } catch (error) {
    throw new Error(
      `Redis integration tests need Redis at ${REDIS_TEST_HOST}:${REDIS_TEST_PORT} ` +
        `(set REDIS_TEST_HOST / REDIS_TEST_PORT). ${(error as Error).message}`
    );
  }
  publisher = new RedisPublisher(publisherConnection);
});

afterEach(async () => {
  closeAllClients();
  await ctx?.stop();
  ctx = undefined;
});

afterAll(async () => {
  await publisherConnection?.quit();
});

describe('Redis connection and subscription', () => {
  it('connects, subscribes to both channels and reports ready', async () => {
    const service = await startWithRedis();
    const res = await request(service.service.httpServer).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready', redis: 'connected' });

    const counts = (await publisherConnection.pubsub(
      'NUMSUB',
      channels.REDIS_TASK_CHANNEL,
      channels.REDIS_CHAT_CHANNEL
    )) as Array<string | number>;
    expect(counts.map(String)).toEqual([
      channels.REDIS_TASK_CHANNEL,
      '1',
      channels.REDIS_CHAT_CHANNEL,
      '1',
    ]);
  });

  it('unsubscribes on shutdown', async () => {
    const service = await startWithRedis();
    await service.stop();
    const counts = (await publisherConnection.pubsub(
      'NUMSUB',
      channels.REDIS_TASK_CHANNEL
    )) as Array<string | number>;
    expect(String(counts[1])).toBe('0');
  });
});

describe('task notifications through Redis', () => {
  it('mandatory E2E: user 25 receives evt_1, user 30 receives nothing', async () => {
    const service = await startWithRedis();
    const user25 = await connectClient(service.url, signToken(25));
    const user30 = await connectClient(service.url, signToken(30));
    const received30 = collect(user30, 'notification');

    const notification = waitForEvent(user25, 'notification');
    const evt1 = event('evt_1', 'task.assigned', { taskId: 101, assignedTo: 25 });
    await publishTask(evt1);

    expect(await notification).toEqual({
      id: 'evt_1',
      type: 'task.assigned',
      title: 'New task assigned',
      message: 'Task #101',
      taskId: 101,
      createdAt: evt1.occurredAt,
    });
    await delay(200);
    expect(received30).toEqual([]);
  });

  it('multi-device: both sockets of user 25 receive the notification', async () => {
    const service = await startWithRedis();
    const socketA = await connectClient(service.url, signToken(25));
    const socketB = await connectClient(service.url, signToken(25));
    const a = waitForEvent(socketA, 'notification');
    const b = waitForEvent(socketB, 'notification');
    await publishTask(event('evt_md', 'task.assigned', { taskId: 7, assignedTo: 25 }));
    expect(await a).toMatchObject({ id: 'evt_md' });
    expect(await b).toMatchObject({ id: 'evt_md' });
  });

  it('handles task.created, task.updated and task.status_changed', async () => {
    const service = await startWithRedis();
    const user25 = await connectClient(service.url, signToken(25));
    const received = collect<{ type: string; message: string }>(user25, 'notification');

    await publishTask(event('evt_c', 'task.created', { taskId: 1, title: 'New', assignedTo: 25 }));
    await publishTask(event('evt_u', 'task.updated', { taskId: 1, title: 'New', assignedTo: 25 }));
    await publishTask(
      event('evt_s', 'task.status_changed', {
        taskId: 1,
        title: 'New',
        status: 'done',
        previousStatus: 'todo',
        assignedTo: 25,
      })
    );

    await until(() => received.length === 3);
    expect(received.map((n) => n.type)).toEqual([
      'task.created',
      'task.updated',
      'task.status_changed',
    ]);
    expect(received[2]?.message).toBe('New: todo → done');
  });

  it('logs and ignores invalid events without crashing, then keeps working', async () => {
    const service = await startWithRedis();
    const user25 = await connectClient(service.url, signToken(25));
    const received = collect<{ id: string }>(user25, 'notification');

    await publisher.publishRaw(channels.REDIS_TASK_CHANNEL, 'not json');
    await publisher.publishRaw(
      channels.REDIS_TASK_CHANNEL,
      JSON.stringify({ event: 'task.assigned' })
    );
    await publishTask(event('evt_unknown', 'task.exploded', { taskId: 1 }));
    await publishTask(event('evt_badpayload', 'task.assigned', { taskId: 'x', assignedTo: 25 }));
    await publishTask(event('evt_good', 'task.assigned', { taskId: 1, assignedTo: 25 }));

    await until(() => received.length === 1);
    await delay(150);
    expect(received.map((n) => n.id)).toEqual(['evt_good']);
    expect(service.service.readiness().status).toBe('ready');
  });

  it('ignores a re-published duplicate eventId', async () => {
    const service = await startWithRedis();
    const user25 = await connectClient(service.url, signToken(25));
    const received = collect(user25, 'notification');
    const duplicate = event('evt_dup', 'task.assigned', { taskId: 1, assignedTo: 25 });
    await publishTask(duplicate);
    await publishTask(duplicate);
    await until(() => received.length >= 1);
    await delay(200);
    expect(received).toHaveLength(1);
  });

  it('delivers chat.message_created from the chat channel to conversation members', async () => {
    const service = await startWithRedis({ CONVERSATION_AUTHORIZATION_MODE: 'allow-all-dev' });
    const user30 = await connectClient(service.url, signToken(30));
    await user30.timeout(2000).emitWithAck('conversation:join', { conversationId: 10 });
    const message = waitForEvent(user30, 'chat:message');
    await publisher.publish(
      channels.REDIS_CHAT_CHANNEL,
      event('evt_chat', 'chat.message_created', {
        messageId: 555,
        conversationId: 10,
        senderId: 25,
        message: 'From Laravel',
        createdAt: '2026-11-26T10:00:00Z',
      })
    );
    expect(await message).toEqual({
      id: '555',
      conversationId: 10,
      senderId: 25,
      message: 'From Laravel',
      createdAt: '2026-11-26T10:00:00Z',
    });
  });
});

describe('Redis failure and recovery', () => {
  it('survives a Redis outage, reconnects, resubscribes and resumes delivery', async () => {
    const proxy = new TcpProxy(REDIS_TEST_HOST, REDIS_TEST_PORT);
    const proxyPort = await proxy.start();
    try {
      const service = await startWithRedis({
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: String(proxyPort),
      });
      const user25 = await connectClient(service.url, signToken(25));

      // Redis goes down.
      await proxy.stop();
      await until(() => service.service.readiness().status === 'not_ready', 5000);
      const down = await request(service.service.httpServer).get('/ready');
      expect(down.status).toBe(503);
      expect(down.body).toMatchObject({ redis: 'disconnected' });

      // The process and existing sockets are unaffected.
      expect((await request(service.service.httpServer).get('/health')).status).toBe(200);
      expect(user25.connected).toBe(true);

      // Redis comes back on the same address.
      await proxy.start();
      await until(() => service.service.readiness().status === 'ready', 8000);

      const notification = waitForEvent(user25, 'notification', 5000);
      await publishTask(
        event('evt_after_reconnect', 'task.assigned', { taskId: 9, assignedTo: 25 })
      );
      expect(await notification).toMatchObject({ id: 'evt_after_reconnect' });
    } finally {
      await proxy.stop();
    }
  });

  it('starts while Redis is unreachable and becomes ready once it appears', async () => {
    const proxy = new TcpProxy(REDIS_TEST_HOST, REDIS_TEST_PORT);
    const port = await proxy.start();
    await proxy.stop();
    try {
      ctx = await startTestService({
        useRedis: true,
        env: { ...channels, REDIS_HOST: '127.0.0.1', REDIS_PORT: String(port) },
      });
      expect((await request(ctx.service.httpServer).get('/health')).status).toBe(200);
      expect((await request(ctx.service.httpServer).get('/ready')).status).toBe(503);

      await proxy.start();
      await until(() => ctx!.service.readiness().status === 'ready', 8000);
    } finally {
      await proxy.stop();
    }
  });
});
