import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import type { AppConfig } from '../../src/config/env.js';
import {
  createRealtimeService,
  type RealtimeService,
  type RealtimeServiceOverrides,
} from '../../src/container.js';
import { createSilentLogger, type Logger } from '../../src/utils/logger.js';
import { testConfig } from './config.js';
import { InMemoryEventSource } from './mocks.js';

export interface TestService {
  service: RealtimeService;
  url: string;
  config: AppConfig;
  /** Present when the service runs with the in-memory event source. */
  events: InMemoryEventSource | undefined;
  stop(): Promise<void>;
}

export interface StartOptions {
  env?: Record<string, string | undefined>;
  overrides?: RealtimeServiceOverrides;
  /** Use the real Redis subscriber instead of the in-memory event source. */
  useRedis?: boolean;
  logger?: Logger;
}

export async function startTestService(options: StartOptions = {}): Promise<TestService> {
  const config = testConfig(options.env);
  let events: InMemoryEventSource | undefined;
  const overrides: RealtimeServiceOverrides = { ...options.overrides };
  if (!options.useRedis && !overrides.createEventSource) {
    overrides.createEventSource = (handler) => (events = new InMemoryEventSource(handler));
  }
  const service = createRealtimeService(config, options.logger ?? createSilentLogger(), overrides);
  const address = await service.start();
  return {
    service,
    url: `http://127.0.0.1:${address.port}`,
    config,
    get events() {
      return events;
    },
    stop: () => service.stop(),
  };
}

const openClients = new Set<ClientSocket>();

/** Connects an authenticated client; resolves on connect, rejects with the connect_error. */
export function connectClient(url: string, token?: string): Promise<ClientSocket> {
  const client = connect(url, {
    auth: token === undefined ? {} : { token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    timeout: 5000,
  });
  openClients.add(client);
  return new Promise((resolve, reject) => {
    client.once('connect', () => resolve(client));
    client.once('connect_error', (error) => {
      client.close();
      reject(error);
    });
  });
}

export function closeAllClients(): void {
  for (const client of openClients) client.close();
  openClients.clear();
}

/** Resolves with the next payload of `event`, or rejects after `timeoutMs`. */
export function waitForEvent<T = unknown>(
  client: ClientSocket,
  event: string,
  timeoutMs = 3000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(event, listener);
      reject(new Error(`Timed out waiting for "${event}"`));
    }, timeoutMs);
    const listener = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    client.once(event, listener);
  });
}

/** Collects every payload of `event` received during the test. */
export function collect<T = unknown>(client: ClientSocket, event: string): T[] {
  const received: T[] = [];
  client.on(event, (payload: T) => received.push(payload));
  return received;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls `predicate` until it is true or the timeout elapses. */
export async function until(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 25
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(intervalMs);
  }
  throw new Error('Condition not met in time');
}

export interface AckResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown[] };
}

export function emitWithAck<T = unknown>(
  client: ClientSocket,
  event: string,
  payload: unknown
): Promise<AckResult<T>> {
  return client.timeout(3000).emitWithAck(event, payload) as Promise<AckResult<T>>;
}
