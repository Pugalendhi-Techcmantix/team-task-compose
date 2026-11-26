import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  method: string;
  path: string;
  authorization?: string;
  body: unknown;
}

export interface FakeReply {
  status: number;
  body?: unknown;
  /** Milliseconds to wait before replying (to exercise timeouts). */
  delayMs?: number;
}

type Handler = (request: RecordedRequest) => FakeReply;

/**
 * Stand-in for Laravel's internal API. Tests decide each reply; every request is recorded
 * so tests can assert exactly what Node sent.
 */
export class FakeLaravel {
  readonly requests: RecordedRequest[] = [];
  handler: Handler = () => ({ status: 404 });
  private server: Server | undefined;
  url = '';

  async start(): Promise<string> {
    this.server = createServer((req, res) => {
      void readBody(req).then(async (raw) => {
        const recorded: RecordedRequest = {
          method: req.method ?? '',
          path: req.url ?? '',
          authorization: req.headers.authorization,
          body: raw ? JSON.parse(raw) : undefined,
        };
        this.requests.push(recorded);
        const reply = this.handler(recorded);
        if (reply.delayMs) await new Promise((r) => setTimeout(r, reply.delayMs));
        if (res.destroyed) return;
        res.writeHead(reply.status, { 'Content-Type': 'application/json' });
        res.end(reply.body === undefined ? '' : JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/api/v1`;
    return this.url;
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve()
    );
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: Buffer) => (data += chunk.toString('utf8')));
    req.on('end', () => resolve(data));
  });
}
