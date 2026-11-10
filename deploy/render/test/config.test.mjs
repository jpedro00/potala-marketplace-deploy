import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServices } from '../service-config.mjs';

function environment() {
  const env = {
    FRONTEND_URL: 'https://shop.example.test', PORT: '10000',
    PATH: process.env.PATH, DATABASE_URL: 'must-not-leak',
    ADMIN_PASSWORD: 'must-not-leak', NODE_OPTIONS: '--inspect',
  };
  for (const name of ['IDENTITY', 'SELLERS', 'CATALOG', 'ORDERS']) {
    env[`${name}_DATABASE_URL`] = `postgresql://user:pass@localhost/${name.toLowerCase()}`;
    env[`${name}_DIRECT_URL`] = env[`${name}_DATABASE_URL`];
    env[`${name}_INTERNAL_API_KEY`] = `${name.toLowerCase()}-${'x'.repeat(40)}`;
  }
  return env;
}

test('maps ports, credentials and local endpoints without leaking unrelated secrets', () => {
  const services = createServices(environment(), process.cwd());
  const byName = Object.fromEntries(services.map(service => [service.name, service]));
  assert.equal(byName.gateway.env.PORT, '10000');
  assert.equal(byName.identity.env.PORT, '3001');
  assert.equal(byName.orders.env.HOST, '127.0.0.1');
  assert.equal(byName.orders.env.CATALOG_SERVICE_URL, 'http://127.0.0.1:3003');
  assert.equal(byName.catalog.env.INTERNAL_API_KEY, byName.orders.env.CATALOG_SERVICE_API_KEY);
  assert.equal(byName.orders.env.DATABASE_URL, 'postgresql://user:pass@localhost/orders');
  assert.equal(byName.gateway.env.DATABASE_URL, undefined);
  assert.equal(byName.identity.env.CATALOG_SERVICE_API_KEY, undefined);
  assert.equal(byName.orders.env.ADMIN_PASSWORD, undefined);
  assert.equal(byName.orders.env.PAYMENT_GATEWAY_MODE, 'unavailable');
  for (const service of services) assert.equal(service.env.NODE_OPTIONS, undefined);
});

test('maps explicit test payment mode only to Orders; adapter still requires NODE_ENV=test', () => {
  const services = createServices({...environment(), NODE_ENV: 'test', ORDERS_PAYMENT_GATEWAY_MODE: 'mock'}, process.cwd());
  assert.equal(services.find(service => service.name === 'orders').env.PAYMENT_GATEWAY_MODE, 'mock');
  assert.equal(services.find(service => service.name === 'identity').env.PAYMENT_GATEWAY_MODE, undefined);
});

test('rejects missing secrets and public port collisions before starting any child', () => {
  const env = environment();
  delete env.CATALOG_INTERNAL_API_KEY;
  assert.throws(() => createServices(env, process.cwd()), /CATALOG_INTERNAL_API_KEY/);
  assert.throws(() => createServices({ ...environment(), PORT: '3001' }, process.cwd()), /PORT/);
});

test('rejects malformed database URLs and secret placeholders without echoing values', () => {
  const env = environment();
  env.ORDERS_DATABASE_URL = 'sensitive-invalid-value';
  assert.throws(() => createServices(env, process.cwd()), error =>
    error.message.includes('ORDERS_DATABASE_URL') && !error.message.includes('sensitive-invalid-value'));
  assert.throws(() => createServices({ ...environment(), IDENTITY_INTERNAL_API_KEY: 'CHANGE_ME' }, process.cwd()));
});

test('keeps tuning overrides scoped to their service and secure cookies by default', () => {
  const services = createServices({ ...environment(), ORDERS_THROTTLE_LIMIT: '123' }, process.cwd());
  assert.equal(services.find(s => s.name === 'orders').env.THROTTLE_LIMIT, '123');
  assert.equal(services.find(s => s.name === 'identity').env.SESSION_COOKIE_SECURE, 'true');
  assert.notEqual(services.find(s => s.name === 'identity').env.THROTTLE_LIMIT, '123');
});
