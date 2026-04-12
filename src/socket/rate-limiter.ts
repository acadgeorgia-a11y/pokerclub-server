interface RateLimitEntry {
  timestamps: number[];
}

export class RateLimiter {
  private limits = new Map<string, RateLimitEntry>();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  check(key: string): boolean {
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry) {
      this.limits.set(key, { timestamps: [now] });
      return true;
    }

    // Remove old timestamps
    entry.timestamps = entry.timestamps.filter((t) => now - t < this.windowMs);

    if (entry.timestamps.length >= this.maxRequests) {
      return false;
    }

    entry.timestamps.push(now);
    return true;
  }

  clear(key: string): void {
    this.limits.delete(key);
  }
}

// Pre-configured limiters
export const actionLimiter = new RateLimiter(10, 1000);    // 10/sec
export const chatLimiter = new RateLimiter(5, 10000);      // 5/10sec
export const buyInLimiter = new RateLimiter(1, 5000);      // 1/5sec
