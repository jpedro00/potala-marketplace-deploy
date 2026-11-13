import { join } from 'node:path';

const domains = ['identity', 'sellers', 'catalog', 'orders'];
const ports = { identity: 3001, sellers: 3002, catalog: 3003, orders: 3004 };
const dependencies = {
  identity: ['sellers'], sellers: ['identity', 'catalog'],
  catalog: ['identity', 'sellers'], orders: ['identity', 'sellers', 'catalog'],
};
const tuning = [
  'SWAGGER_ENABLED', 'THROTTLE_TTL_MS', 'THROTTLE_LIMIT',
  'AUTH_THROTTLE_LIMIT', 'INTERNAL_THROTTLE_LIMIT',
  'IDENTITY_SERVICE_TIMEOUT_MS', 'SELLERS_SERVICE_TIMEOUT_MS',
  'CATALOG_SERVICE_TIMEOUT_MS',
];
const systemKeys = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'SystemDrive', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'LANG', 'LC_ALL', 'TZ'];

function required(env, name) {
  const value = env[name]?.trim();
  if (!value || /CHANGE_ME|REPLACE_ME|<.*>/i.test(value)) throw new Error(`Configure ${name}`);
  return value;
}

function databaseUrl(env, name) {
  const value = required(env, name);
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error();
  } catch {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

export function createServices(env, root) {
  const port = env.PORT ?? '10000';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535 || Object.values(ports).includes(Number(port))) {
    throw new Error('PORT must be a valid public port distinct from 3001–3004');
  }
  const frontend = required(env, 'FRONTEND_URL');
  try {
    const url = new URL(frontend);
    if (url.origin !== frontend || !['https:', 'http:'].includes(url.protocol)) throw new Error();
  } catch {
    throw new Error('Invalid FRONTEND_URL: use an exact HTTP(S) origin');
  }
  const common = { NODE_ENV: env.NODE_ENV ?? 'production', FRONTEND_URL: frontend };
  if (!['production', 'development', 'test'].includes(common.NODE_ENV)) throw new Error('Invalid NODE_ENV');
  for (const key of systemKeys) if (env[key] !== undefined) common[key] = env[key];
  const keys = {};
  for (const name of ['identity', 'sellers', 'catalog']) {
    const key = `${name.toUpperCase()}_INTERNAL_API_KEY`;
    keys[name] = required(env, key);
    if (keys[name].length < 32) throw new Error(`Use at least 32 characters for ${key}`);
  }
  const origin = name => `http://127.0.0.1:${ports[name]}`;
  const services = domains.map(name => {
    const prefix = name.toUpperCase();
    const childEnv = {
      ...common, HOST: '127.0.0.1', PORT: String(ports[name]),
      DATABASE_URL: databaseUrl(env, `${prefix}_DATABASE_URL`),
      DIRECT_URL: databaseUrl(env, `${prefix}_DIRECT_URL`),
      SESSION_COOKIE_NAME: env.SESSION_COOKIE_NAME ?? 'potala_session',
      SWAGGER_ENABLED: 'false', LOG_HTTP_BODY: 'false',
    };
    if (keys[name]) childEnv.INTERNAL_API_KEY = keys[name];
    for (const dependency of dependencies[name]) {
      childEnv[`${dependency.toUpperCase()}_SERVICE_URL`] = origin(dependency);
      childEnv[`${dependency.toUpperCase()}_SERVICE_API_KEY`] = keys[dependency];
    }
    for (const key of tuning) {
      const value = env[`${prefix}_${key}`];
      if (value !== undefined) childEnv[key] = value;
    }
    if (name === 'identity') {
      childEnv.SESSION_COOKIE_SECURE = env.SESSION_COOKIE_SECURE ?? 'true';
      childEnv.SESSION_TTL_DAYS = env.SESSION_TTL_DAYS ?? '7';
      childEnv.ACCOUNT_ACTION_ORIGIN = env.IDENTITY_ACCOUNT_ACTION_ORIGIN ?? frontend;
      for (const key of ['NOTIFICATION_ENCRYPTION_KEY','BREVO_API_KEY','BREVO_SENDER_EMAIL','REQUIRE_EMAIL_CONFIRMATION','NOTIFICATION_DISPATCH_ENABLED']) {
        if (env[`IDENTITY_${key}`] !== undefined) childEnv[key] = env[`IDENTITY_${key}`];
      }
    }
    if (name === 'sellers' && env.SELLERS_SELLER_NOTIFICATION_DISPATCH_ENABLED !== undefined) {
      childEnv.SELLER_NOTIFICATION_DISPATCH_ENABLED = env.SELLERS_SELLER_NOTIFICATION_DISPATCH_ENABLED;
    }
    if (name === 'orders') {
      childEnv.PERMISSION_SHADOW_MODE = env.ORDERS_PERMISSION_SHADOW_MODE ?? 'false';
      childEnv.PAYMENT_GATEWAY_MODE = env.ORDERS_PAYMENT_GATEWAY_MODE ?? 'unavailable';
      if (env.ORDERS_ORDER_NOTIFICATION_WORKER_ENABLED !== undefined) childEnv.ORDER_NOTIFICATION_WORKER_ENABLED = env.ORDERS_ORDER_NOTIFICATION_WORKER_ENABLED;
    }
    return { name, command: process.execPath, args: ['dist/main.js'], cwd: join(root, `potala-${name}-service`), env: childEnv };
  });
  const gatewayEnv = { ...common, PORT: port };
  for (const name of domains) gatewayEnv[`${name.toUpperCase()}_SERVICE_URL`] = origin(name);
  for (const key of ['PROXY_TIMEOUT_MS', 'HEALTH_CHECK_TIMEOUT_MS', 'RATE_LIMIT_WINDOW_MS', 'RATE_LIMIT_MAX']) {
    if (env[`GATEWAY_${key}`] !== undefined) gatewayEnv[key] = env[`GATEWAY_${key}`];
  }
  services.push({ name: 'gateway', command: process.execPath, args: ['dist/main.js'], cwd: join(root, 'potala-api-gateway'), env: gatewayEnv });
  return services;
}
