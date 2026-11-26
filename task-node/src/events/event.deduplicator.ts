/**
 * Short-lived memory of processed event IDs so a re-published event is not delivered twice.
 * Bounded by TTL and entry count; nothing is stored permanently.
 * With several Node instances each instance dedupes its own deliveries, which is correct
 * because each instance only serves its own sockets.
 */
export class EventDeduplicator {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 50_000,
    private readonly now: () => number = Date.now
  ) {}

  isDuplicate(eventId: string): boolean {
    const expiresAt = this.seen.get(eventId);
    if (expiresAt === undefined) {
      return false;
    }
    if (expiresAt <= this.now()) {
      this.seen.delete(eventId);
      return false;
    }
    return true;
  }

  markProcessed(eventId: string): void {
    this.seen.delete(eventId);
    this.seen.set(eventId, this.now() + this.ttlMs);
    this.evict();
  }

  get size(): number {
    return this.seen.size;
  }

  private evict(): void {
    const now = this.now();
    // Map iteration follows insertion order, so the oldest entries come first.
    for (const [eventId, expiresAt] of this.seen) {
      if (expiresAt <= now || this.seen.size > this.maxEntries) {
        this.seen.delete(eventId);
      } else {
        break;
      }
    }
  }
}
