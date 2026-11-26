/**
 * Fixed-window counter per key. In memory and per process, which is enough to protect a
 * single node from noisy clients.
 */
export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();
  private operations = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now
  ) {}

  /** Records one hit for `key`; returns false when the key is over its limit. */
  consume(key: string): boolean {
    const now = this.now();
    if (++this.operations % 1000 === 0) {
      this.sweep(now);
    }

    const window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    window.count += 1;
    return window.count <= this.limit;
  }

  get size(): number {
    return this.windows.size;
  }

  sweep(now = this.now()): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) {
        this.windows.delete(key);
      }
    }
  }
}
