import { LIMITS } from "./limits";

/**
 * Fixed-window limiter keyed per user and per IP. This process-local version
 * serves a single instance; a multi-instance deployment needs a shared store
 * behind the same interface.
 */
export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Returns 0 when allowed, otherwise milliseconds until the window resets. */
  hit(key: string, now: number): number {
    const window = this.windows.get(key);
    if (!window || now - window.start >= this.windowMs) {
      this.windows.set(key, { start: now, count: 1 });
      return 0;
    }
    if (window.count >= this.limit) return window.start + this.windowMs - now;
    window.count += 1;
    return 0;
  }
}

export function createMessageRateLimiter() {
  const perUser = new FixedWindowRateLimiter(LIMITS.messagesPerWindowPerUser, LIMITS.rateLimitWindowMs);
  const perIp = new FixedWindowRateLimiter(LIMITS.messagesPerWindowPerIp, LIMITS.rateLimitWindowMs);
  return {
    /** Returns 0 when the send is allowed, otherwise a retry delay in ms. */
    check(userId: string, ip: string, now = Date.now()): number {
      return Math.max(perUser.hit(`user:${userId}`, now), perIp.hit(`ip:${ip}`, now));
    },
  };
}
