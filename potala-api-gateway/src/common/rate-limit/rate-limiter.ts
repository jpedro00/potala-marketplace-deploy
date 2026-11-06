export interface RateLimiterOptions {
  windowMs: number;
  max: number;
}

/**
 * Minimal in-memory sliding-window limiter, hand-rolled instead of pulling in
 * a package such as express-rate-limit: the logic is small, testable in
 * isolation, and matches the rest of this codebase's preference for
 * hand-rolled utilities (see the sibling services' pagination.ts,
 * brazilian-document.ts, redact.ts) over new dependencies where the payoff
 * doesn't clearly justify one.
 *
 * Known v1 limitation, documented rather than silently accepted: this state
 * is process-local. If the gateway is ever scaled to more than one instance
 * without a shared store (e.g. Redis), each instance enforces its own
 * independent limit — a client could get roughly `max * instanceCount`
 * requests per window. Fine for a single-instance deployment; revisit before
 * scaling horizontally.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly options: RateLimiterOptions) {}

  /**
   * Returns true and records the hit if `key` is still under the limit for
   * the current window; returns false (without recording) otherwise.
   */
  consume(key: string, now: number = Date.now()): boolean {
    const windowStart = now - this.options.windowMs;
    const timestamps = (this.hits.get(key) ?? []).filter(
      (t) => t > windowStart,
    );

    if (timestamps.length >= this.options.max) {
      this.hits.set(key, timestamps);
      return false;
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return true;
  }

  /**
   * Drops keys with no timestamps left inside the window, so memory doesn't
   * grow unboundedly with one-off callers. Safe to call periodically (see
   * main.ts) — never removes a key that still has live hits.
   */
  sweep(now: number = Date.now()): void {
    const windowStart = now - this.options.windowMs;
    for (const [key, timestamps] of this.hits) {
      const live = timestamps.filter((t) => t > windowStart);
      if (live.length === 0) {
        this.hits.delete(key);
      } else if (live.length !== timestamps.length) {
        this.hits.set(key, live);
      }
    }
  }

  /** Test/inspection helper — not used by production code paths. */
  size(): number {
    return this.hits.size;
  }
}
