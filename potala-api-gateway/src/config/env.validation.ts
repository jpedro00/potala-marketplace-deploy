import { AppConfig, AppEnvironment } from './configuration';

const APP_ENVIRONMENTS: readonly AppEnvironment[] = [
  'development',
  'test',
  'production',
];

/** Plain base-10 integers only: rejects 1e3, 0x10, Infinity, NaN and decimals. */
const INTEGER_PATTERN = /^-?\d+$/;

const PORT_MIN = 1;
const PORT_MAX = 65535;
const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

function readString(
  env: Record<string, unknown>,
  name: string,
): string | undefined {
  const value = env[name];
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function required(env: Record<string, unknown>, name: string): string {
  const value = readString(env, name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** `max` is optional: some values have a floor from the domain but no ceiling. */
function optionalInteger(
  env: Record<string, unknown>,
  name: string,
  fallback: number,
  min: number,
  max?: number,
): number {
  const value = readString(env, name);
  if (value === undefined) {
    return fallback;
  }
  if (!INTEGER_PATTERN.test(value)) {
    throw new Error(
      `Invalid integer environment variable: ${name} (expected a whole number)`,
    );
  }
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < min ||
    (max !== undefined && parsed > max)
  ) {
    const range = max === undefined ? `>= ${min}` : `${min}..${max}`;
    throw new Error(
      `Environment variable out of range: ${name} (expected ${range})`,
    );
  }
  return parsed;
}

/**
 * OriginGuard on each downstream service compares FRONTEND_URL literally
 * against the Origin header, so a trailing slash or a path would silently
 * break CORS here too — same rule as in identity-service/sellers-service.
 */
function readFrontendOrigin(env: Record<string, unknown>): string {
  const name = 'FRONTEND_URL';
  const value = required(env, name);

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid environment variable: ${name} is not a valid URL`);
  }
  if (!HTTP_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      `Invalid environment variable: ${name} must use http:// or https://`,
    );
  }
  if (value !== parsed.origin) {
    throw new Error(
      `Invalid environment variable: ${name} must be a bare origin such as ${parsed.origin} (no trailing slash, path or query)`,
    );
  }

  return parsed.origin;
}

/**
 * Bare origin, no trailing slash — the value is concatenated directly with a
 * path prefix (e.g. `${target}/api/v1/auth`) when building each proxy's
 * target, so a stray trailing slash would produce a double slash in every
 * forwarded request.
 */
function readRequiredServiceOrigin(
  env: Record<string, unknown>,
  name: string,
): string {
  const value = required(env, name);

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid environment variable: ${name} is not a valid URL`);
  }
  if (!HTTP_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      `Invalid environment variable: ${name} must use http:// or https://`,
    );
  }
  return value.replace(/\/+$/, '');
}

export function validateEnv(env: Record<string, unknown>): AppConfig {
  const nodeEnvRaw = readString(env, 'NODE_ENV') ?? 'development';
  if (!APP_ENVIRONMENTS.includes(nodeEnvRaw as AppEnvironment)) {
    throw new Error(
      `Invalid NODE_ENV: ${nodeEnvRaw} (expected ${APP_ENVIRONMENTS.join(', ')})`,
    );
  }

  return {
    nodeEnv: nodeEnvRaw as AppEnvironment,
    port: optionalInteger(env, 'PORT', 8080, PORT_MIN, PORT_MAX),
    frontendUrl: readFrontendOrigin(env),
    identityServiceUrl: readRequiredServiceOrigin(env, 'IDENTITY_SERVICE_URL'),
    sellersServiceUrl: readRequiredServiceOrigin(env, 'SELLERS_SERVICE_URL'),
    catalogServiceUrl: readRequiredServiceOrigin(env, 'CATALOG_SERVICE_URL'),
    ordersServiceUrl: readRequiredServiceOrigin(env, 'ORDERS_SERVICE_URL'),
    proxyTimeoutMs: optionalInteger(
      env,
      'PROXY_TIMEOUT_MS',
      10_000,
      100,
      120_000,
    ),
    healthCheckTimeoutMs: optionalInteger(
      env,
      'HEALTH_CHECK_TIMEOUT_MS',
      3_000,
      100,
      60_000,
    ),
    rateLimit: {
      windowMs: optionalInteger(
        env,
        'RATE_LIMIT_WINDOW_MS',
        60_000,
        1_000,
        86_400_000,
      ),
      max: optionalInteger(env, 'RATE_LIMIT_MAX', 300, 1, 1_000_000),
    },
  };
}
