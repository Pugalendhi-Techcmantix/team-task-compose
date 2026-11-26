import net from 'node:net';

/**
 * Minimal TCP proxy used to simulate a Redis outage: `stop()` kills every connection and
 * the listener (like Redis going down); `start()` brings it back on the same port.
 */
export class TcpProxy {
  private server: net.Server | undefined;
  private readonly sockets = new Set<net.Socket>();
  port = 0;

  constructor(
    private readonly targetHost: string,
    private readonly targetPort: number
  ) {}

  async start(): Promise<number> {
    const server = net.createServer((client) => {
      const upstream = net.connect(this.targetPort, this.targetHost);
      for (const socket of [client, upstream]) {
        this.sockets.add(socket);
        socket.on('close', () => this.sockets.delete(socket));
        socket.on('error', () => {
          client.destroy();
          upstream.destroy();
        });
      }
      client.pipe(upstream).pipe(client);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.port, '127.0.0.1', () => resolve());
    });
    this.server = server;
    this.port = (server.address() as net.AddressInfo).port;
    return this.port;
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    const server = this.server;
    this.server = undefined;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}
