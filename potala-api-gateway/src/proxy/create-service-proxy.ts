import { Logger } from '@nestjs/common';
import { Request } from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';

export interface ServiceProxyOptions {
  /** Human-readable name for logging, e.g. "identity-service". */
  serviceName: string;
  /**
   * Full base URL to forward to, INCLUDING the path prefix this proxy is
   * mounted at. http-proxy-middleware v3 stopped auto-including the
   * app.use() mount path in the forwarded request (that was v2 behavior) —
   * the mount path now has to be part of `target` itself. Concretely: if
   * this is mounted with `app.use('/api/v1/auth', proxy)`, `target` must be
   * `${identityServiceUrl}/api/v1/auth`, so a request to
   * `/api/v1/auth/login` forwards to `${identityServiceUrl}/api/v1/auth/login`
   * — not `${identityServiceUrl}/login`. Get this wrong and every proxied
   * request silently 404s on the upstream.
   */
  target: string;
  timeoutMs: number;
}

/**
 * Thin wrapper around http-proxy-middleware, the one non-hand-rolled runtime
 * dependency this service adds. Correctly streaming arbitrary HTTP
 * methods/bodies (including chunked transfer) is not something worth
 * re-implementing — this is exactly the job the library exists for, unlike
 * the rate limiter (common/rate-limit/rate-limiter.ts), whose logic is
 * simple enough to hand-roll and unit test directly.
 */
export function createServiceProxy({
  serviceName,
  target,
  timeoutMs,
}: ServiceProxyOptions) {
  const logger = new Logger(`Proxy:${serviceName}`);

  const options: Options = {
    target,
    changeOrigin: true,
    xfwd: false,
    proxyTimeout: timeoutMs,
    timeout: timeoutMs,
    on: {
      proxyReq: (proxyReq, req) => {
        // Resolve the original trusted header before adding another hop.
        // xfwd must stay off: it mutates req.headers before this callback.
        const clientIp = (req as Request).ip ?? req.socket.remoteAddress;
        if (clientIp) proxyReq.setHeader('x-forwarded-for', clientIp);
        proxyReq.setHeader('x-forwarded-proto', (req as Request).protocol);
      },
      proxyRes: (proxyRes, req) => {
        logger.log(`${req.method} ${req.url} -> ${proxyRes.statusCode}`);
      },
      error: (err, req, res) => {
        logger.error(`${req.method} ${req.url} unreachable: ${err.message}`);
        // `res` is typed as ServerResponse | Socket — the library's error
        // handler also fires for a raw socket (e.g. a WebSocket upgrade in
        // flight), which has no writeHead/JSON body concept. Only a real
        // HTTP response supports writeHead; a bare Socket just gets closed.
        if ('writeHead' in res) {
          res.writeHead(503, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              statusCode: 503,
              error: 'Service Unavailable',
              message: `${serviceName} is unavailable. Try again shortly.`,
              path: req.url,
              timestamp: new Date().toISOString(),
            }),
          );
        } else {
          res.destroy();
        }
      },
    },
  };

  return createProxyMiddleware(options);
}
