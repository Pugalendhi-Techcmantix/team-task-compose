import { ServerEvent } from '../events/event.types.js';
import type { RealtimeEmitter } from '../socket/socket.emitter.js';
import type { UserId } from '../types/ids.js';
import type { Logger } from '../utils/logger.js';

/**
 * Tracks live connections per user. Async on purpose so a Redis-backed store can replace
 * the in-memory one when the service runs on more than one node.
 */
export interface PresenceStore {
  /** Returns true when this is the user's first active connection (user came online). */
  addConnection(userId: UserId, socketId: string): Promise<boolean>;
  /** Returns true when this was the user's last active connection (user went offline). */
  removeConnection(userId: UserId, socketId: string): Promise<boolean>;
  isOnline(userId: UserId): Promise<boolean>;
  connectionCount(userId: UserId): Promise<number>;
}

/** Single-node store. Holds only live socket IDs; nothing permanent. */
export class InMemoryPresenceStore implements PresenceStore {
  private readonly connections = new Map<UserId, Set<string>>();

  async addConnection(userId: UserId, socketId: string): Promise<boolean> {
    let sockets = this.connections.get(userId);
    const cameOnline = sockets === undefined || sockets.size === 0;
    if (!sockets) {
      sockets = new Set();
      this.connections.set(userId, sockets);
    }
    sockets.add(socketId);
    return cameOnline;
  }

  async removeConnection(userId: UserId, socketId: string): Promise<boolean> {
    const sockets = this.connections.get(userId);
    if (!sockets || !sockets.delete(socketId)) {
      return false;
    }
    if (sockets.size === 0) {
      this.connections.delete(userId);
      return true;
    }
    return false;
  }

  async isOnline(userId: UserId): Promise<boolean> {
    return (this.connections.get(userId)?.size ?? 0) > 0;
  }

  async connectionCount(userId: UserId): Promise<number> {
    return this.connections.get(userId)?.size ?? 0;
  }
}

export class PresenceService {
  constructor(
    private readonly store: PresenceStore,
    private readonly emitter: RealtimeEmitter,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date()
  ) {}

  async connect(userId: UserId, socketId: string): Promise<void> {
    if (await this.store.addConnection(userId, socketId)) {
      this.publish(userId, 'online');
    }
  }

  async disconnect(userId: UserId, socketId: string): Promise<void> {
    if (await this.store.removeConnection(userId, socketId)) {
      this.publish(userId, 'offline');
    }
  }

  isOnline(userId: UserId): Promise<boolean> {
    return this.store.isOnline(userId);
  }

  private publish(userId: UserId, status: 'online' | 'offline'): void {
    this.emitter.toAll(ServerEvent.PRESENCE_UPDATE, {
      userId,
      status,
      at: this.now().toISOString(),
    });
    this.logger.info({ event: `presence_${status}`, userId }, `presence_${status}`);
  }
}
