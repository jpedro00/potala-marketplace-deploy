import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  it('allows up to max requests in a window', () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 3 });
    const now = 1_000_000;

    expect(limiter.consume('ip-1', now)).toBe(true);
    expect(limiter.consume('ip-1', now)).toBe(true);
    expect(limiter.consume('ip-1', now)).toBe(true);
    expect(limiter.consume('ip-1', now)).toBe(false);
  });

  it('tracks each key independently', () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 1 });
    const now = 1_000_000;

    expect(limiter.consume('ip-1', now)).toBe(true);
    expect(limiter.consume('ip-2', now)).toBe(true);
    expect(limiter.consume('ip-1', now)).toBe(false);
    expect(limiter.consume('ip-2', now)).toBe(false);
  });

  it('allows requests again once the window rolls over', () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 1 });
    const now = 1_000_000;

    expect(limiter.consume('ip-1', now)).toBe(true);
    expect(limiter.consume('ip-1', now + 500)).toBe(false);
    expect(limiter.consume('ip-1', now + 1001)).toBe(true);
  });

  it('sweep removes fully expired keys and keeps live ones', () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 5 });
    const now = 1_000_000;

    limiter.consume('stale', now);
    limiter.consume('fresh', now + 900);
    expect(limiter.size()).toBe(2);

    limiter.sweep(now + 1500);

    expect(limiter.size()).toBe(1);
    // "fresh" is still inside its window at now + 1500 (900 + 1000 > 1500).
    expect(limiter.consume('fresh', now + 1500)).toBe(true);
  });
});
