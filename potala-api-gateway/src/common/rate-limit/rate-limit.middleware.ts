import { NextFunction, Request, Response } from 'express';
import { RateLimiter } from './rate-limiter';

/**
 * Coarse, IP-keyed global cap on the gateway's own edge. This is deliberately
 * simple — one limit across every route — because per-route granularity
 * (tighter limits on /auth, higher on /internal-style traffic) already lives
 * in each downstream service's own ThrottlerModule config. This layer exists
 * to protect the gateway itself (and, transitively, every downstream
 * service) from being flooded before a request is even routed anywhere.
 */
export function rateLimitMiddleware(limiter: RateLimiter) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? 'unknown';
    if (limiter.consume(key)) {
      next();
      return;
    }

    res.status(429).json({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Try again shortly.',
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    });
  };
}
