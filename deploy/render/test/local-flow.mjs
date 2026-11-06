// Opt-in integration test. Uses only the disposable cluster documented in README.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createServices } from '../service-config.mjs';
import { supervise } from '../supervisor.mjs';

if (process.env.RUN_LOCAL_DB_SMOKE !== '1') throw new Error('Set RUN_LOCAL_DB_SMOKE=1 for the disposable local database only');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);
const { PrismaClient } = require(join(root, 'potala-identity-service/node_modules/@prisma/client'));
const argon2 = require(join(root, 'potala-identity-service/node_modules/argon2'));
const database = 'postgresql://potala_test@127.0.0.1:55432/potala_homolog';
const identity = new PrismaClient({ datasourceUrl: `${database}?schema=identity` });
const password = randomUUID();
const suffix = randomUUID().slice(0, 8);
const adminEmail = `admin-${suffix}@example.test`;
const origin = 'http://localhost:3000';
const base = 'http://127.0.0.1:18080/api/v1';
const env = {
  PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
  NODE_ENV: 'test', FRONTEND_URL: origin, PORT: '18080', SESSION_COOKIE_SECURE: 'false',
};
for (const name of ['identity', 'sellers', 'catalog', 'orders']) {
  const prefix = name.toUpperCase();
  env[`${prefix}_DATABASE_URL`] = `${database}?schema=${name}`;
  env[`${prefix}_DIRECT_URL`] = env[`${prefix}_DATABASE_URL`];
  env[`${prefix}_INTERNAL_API_KEY`] = randomUUID();
}
const logs = [];
let running;

async function call(path, { method = 'GET', data, cookie, headers = {}, expected = 200 } = {}) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
    body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  assert.equal(response.status, expected, `${method} ${path}: ${text}`);
  return { data: text ? JSON.parse(text) : null, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

function cpf() {
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  for (const size of [9, 10]) {
    const remainder = digits.reduce((sum, digit, i) => sum + digit * (size + 1 - i), 0) % 11;
    digits.push(remainder < 2 ? 0 : 11 - remainder);
  }
  return digits.join('');
}

try {
  const checked = await promisify(execFile)(process.execPath, ['deploy/render/start-services.mjs', '--check'], { cwd: root, env });
  assert.match(checked.stdout, /validated for five services/);
  // Refuse to run against another application already using our test ports.
  for (const port of [3001, 3002, 3003, 3004, 18080]) {
    const probe = createServer();
    await new Promise((resolve, reject) => probe.once('error', reject).listen(port, '127.0.0.1', resolve));
    await new Promise(resolve => probe.close(resolve));
  }
  await identity.user.create({ data: {
    email: adminEmail, passwordHash: await argon2.hash(password), status: 'ACTIVE',
    emailVerifiedAt: new Date(), roles: { create: { role: 'ADMIN' } },
    profile: { create: { fullName: 'Administrador de teste local' } }, adminProfile: { create: {} },
  } });
  running = supervise(createServices(env, root), { log: line => logs.push(line) });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { ready = true; break; }
    } catch { /* Startup may not have bound the gateway port yet. */ }
    await delay(500);
  }
  assert.ok(ready, 'All five services must become ready');
  const admin = (await call('/auth/login', { method: 'POST', data: { email: adminEmail, password } })).cookie;
  assert.ok(admin);
  await call('/auth/me', { cookie: admin });
  const category = (await call('/admin/categories', { method: 'POST', data: { name: `Teste ${suffix}` }, cookie: admin, expected: 201 })).data;
  const sellers = [];
  const products = [];
  for (const number of [1, 2]) {
    const email = `seller-${number}-${suffix}@example.test`;
    const registered = (await call('/auth/seller/register', { method: 'POST', expected: 201, data: {
      email, password, ownerName: `Vendedor ${number}`, legalName: `Loja Teste ${number}`,
      tradeName: `Teste ${number} ${suffix}`, documentType: 'CPF', documentNumber: cpf(),
      storeEmail: email, phone: '11999999999',
    } })).data;
    await call(`/admin/sellers/${registered.seller.sellerId}/approve`, { method: 'PATCH', data: {}, cookie: admin });
    const cookie = (await call('/auth/login', { method: 'POST', data: { email, password } })).cookie;
    sellers.push({ id: registered.seller.sellerId, cookie });
    const product = (await call('/seller/products', { method: 'POST', expected: 201, cookie, data: {
      title: `Produto ${number} ${suffix}`, categoryId: category.id, priceCents: 1000,
      variants: [{ name: 'Padrao', sku: `T-${number}-${suffix}`, quantity: 3 }],
    } })).data;
    await call(`/admin/products/${product.id}/activate`, { method: 'PATCH', data: {}, cookie: admin });
    products.push(product);
  }
  await call('/public/products');
  const buyerEmail = `buyer-${suffix}@example.test`;
  await call('/auth/customer/register', { method: 'POST', expected: 201, data: { email: buyerEmail, password, name: 'Comprador teste' } });
  const buyer = (await call('/auth/login', { method: 'POST', data: { email: buyerEmail, password } })).cookie;
  const checkout = {
    items: products.map(p => ({ productId: p.id, variantId: p.variants[0].id, quantity: 1 })),
    shippingAddress: { recipient: 'Comprador teste', street: 'Rua Teste', number: '1', neighborhood: 'Centro', city: 'Sao Paulo', state: 'SP', postalCode: '01001000' },
  };
  const key = randomUUID();
  const order = (await call('/orders/checkout', { method: 'POST', expected: 201, cookie: buyer, data: checkout, headers: { 'idempotency-key': key } })).data;
  assert.equal(order.status, 'PAID');
  assert.equal(order.sellerOrders.length, 2);
  const replay = (await call('/orders/checkout', { method: 'POST', expected: 201, cookie: buyer, data: checkout, headers: { 'idempotency-key': key } })).data;
  assert.equal(replay.id, order.id);
  for (const seller of sellers) {
    const own = order.sellerOrders.find(o => o.sellerId === seller.id);
    const other = order.sellerOrders.find(o => o.sellerId !== seller.id);
    await call(`/seller/orders/${own.id}`, { cookie: seller.cookie });
    await call(`/seller/orders/${other.id}`, { cookie: seller.cookie, expected: 404 });
  }
  for (let i = 0; i < products.length; i++) {
    const product = (await call(`/seller/products/${products[i].id}`, { cookie: sellers[i].cookie })).data;
    assert.equal(product.variants[0].inventory.quantity, 2);
    assert.equal(product.variants[0].inventory.reservedQuantity, 0);
  }
  await call('/internal/sessions/introspect', { method: 'POST', data: {}, expected: 404 });
  await call('/auth/logout', { method: 'POST', cookie: buyer, expected: 204 });
  await call('/auth/me', { cookie: buyer, expected: 401 });
  console.log('PASS: five processes, health, login, sellers, products, two-seller checkout (mock), idempotent replay, stock, seller isolation, internal block and logout.');
} finally {
  if (running) { running.stop(); await running.finished; }
  await identity.$disconnect();
  await mkdir(join(root, 'artifacts'), { recursive: true });
  await writeFile(join(root, 'artifacts/local-flow.log'), logs.join('\n'));
}
