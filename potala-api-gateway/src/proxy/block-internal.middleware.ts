import { NextFunction, Request, Response } from 'express';

/** Same path segment identity-service/sellers-service use to recognize their own internal routes. */
export const INTERNAL_PATH_SEGMENT = '/internal/';

/**
 * Every downstream service already guards its own /internal/* routes with
 * InternalApiKeyGuard, so this isn't the only thing standing between the
 * public internet and those routes — but the gateway is the one place a
 * single check protects ALL of them at once, and it means those endpoints
 * don't even appear to exist to anything coming through the public entry
 * point. Mounted before any proxy middleware in main.ts, so a request to
 * .../internal/... never reaches a downstream service through the gateway.
 */
export function blockInternalPaths(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.path.includes(INTERNAL_PATH_SEGMENT)) {
    res.status(404).json({
      statusCode: 404,
      error: 'Not Found',
      message: `Cannot ${req.method} ${req.originalUrl}`,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    });
    return;
  }
  next();
}
