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

if (process.env.RUN_LOCAL_COMPLETION_SMOKE !== '1') throw new Error('Set RUN_LOCAL_COMPLETION_SMOKE=1 for the disposable local database only');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);
const { PrismaClient } = require(join(root, 'potala-identity-service/node_modules/@prisma/client'));
const argon2 = require(join(root, 'potala-identity-service/node_modules/argon2'));
const database = 'postgresql://potala_test@127.0.0.1:55434/potala_completion';
const identity = new PrismaClient({ datasourceUrl: `${database}?schema=identity` });
const password = randomUUID();
const suffix = randomUUID().slice(0, 8);
const adminEmail = `admin-${suffix}@example.test`;
const origin = process.env.LOCAL_FRONTEND_ORIGIN ?? 'http://localhost:3000';
const base = 'http://127.0.0.1:18080/api/v1';
const env = {
  PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
  NODE_ENV: 'test', ORDERS_PAYMENT_GATEWAY_MODE: 'mock', FRONTEND_URL: origin, PORT: '18080', SESSION_COOKIE_SECURE: 'false',
  SELLERS_SELLER_NOTIFICATION_DISPATCH_ENABLED: 'true', ORDERS_ORDER_NOTIFICATION_WORKER_ENABLED: 'true',
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
    profile: { create: { fullName: 'Administrador de teste local' } }, adminProfile: { create: { isSuperAdmin: true } },
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
  await call('/admin/finance/policies', {method:'POST',cookie:admin,expected:201,data:{scope:'PLATFORM',commissionBps:1000,gatewayFeeBps:200,fixedFeeCents:10}});
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
    await call('/seller/settings/payments', {method:'PATCH',cookie,data:{acceptPix:true,acceptCard:true}});
    await call('/seller/settings/delivery', {method:'PUT',cookie,data:{pickupEnabled:true,pickupAddress:'Endereço fictício do teste local',deliveryEnabled:true,rates:[{state:'SP',priceCents:0,estimatedDays:2}]}});
    sellers.push({ id: registered.seller.sellerId, cookie });
    const product = (await call('/seller/products', { method: 'POST', expected: 201, cookie, data: {
      title: `Produto ${number} ${suffix}`, categoryId: category.id, priceCents: 1000,
      variants: [{ name: 'Padrao', sku: `T-${number}-${suffix}`, quantity: 3 }],
    } })).data;
    await call(`/admin/products/${product.id}/activate`, { method: 'PATCH', data: {}, cookie: admin });
    products.push(product);
  }
  await call('/public/products');
  await call('/admin/product-attributes',{method:'PUT',cookie:admin,data:{itemType:'PHYSICAL',key:'smoke_size',label:'Tamanho',kind:'TEXT',active:true}});
  await call(`/seller/products/${products[0].id}/details`,{method:'PATCH',cookie:sellers[0].cookie,data:{itemType:'PHYSICAL',attributes:{smoke_size:suffix},title:products[0].title,description:'Descrição local',priceCents:1000}});
  await call(`/seller/products/${products[0].id}/details`,{method:'PATCH',cookie:sellers[1].cookie,expected:404,data:{itemType:'PHYSICAL',attributes:{},title:'Indevido',description:'',priceCents:1}});
  const filtered=(await call(`/public/products?itemType=PHYSICAL&attributes=${encodeURIComponent(JSON.stringify({smoke_size:suffix}))}`)).data;
  assert.ok(JSON.stringify(filtered).includes(products[0].id));
  assert.equal((await call('/legal/policies/TERMS')).data.key,'TERMS');
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
  assert.equal(order.sellerOrders.reduce((sum, row) => sum + row.commissionCents + row.gatewayFeeCents + row.sellerNetCents, 0), 2000);
  const replay = (await call('/orders/checkout', { method: 'POST', expected: 201, cookie: buyer, data: checkout, headers: { 'idempotency-key': key } })).data;
  assert.equal(replay.id, order.id);
  for (const seller of sellers) {
    const own = order.sellerOrders.find(o => o.sellerId === seller.id);
    const other = order.sellerOrders.find(o => o.sellerId !== seller.id);
    await call(`/seller/orders/${own.id}`, { cookie: seller.cookie });
    await call(`/seller/orders/${other.id}`, { cookie: seller.cookie, expected: 404 });
  }
  const ownOrder=order.sellerOrders.find(row=>row.sellerId===sellers[0].id);
  const fiscal=(await call(`/seller/orders/${ownOrder.id}/fiscal-attachments`,{method:'POST',expected:201,cookie:sellers[0].cookie,data:{fileName:'prova-local.xml',mediaType:'application/xml',base64:Buffer.from('<prova>Somente teste local</prova>').toString('base64')}})).data;
  await call(`/seller/orders/${ownOrder.id}/fiscal-attachments/${fiscal.id}`,{cookie:sellers[1].cookie,expected:404});
  const fiscalDownload=await fetch(`${base}/orders/seller-orders/${ownOrder.id}/fiscal-attachments/${fiscal.id}`,{headers:{origin,cookie:buyer}});
  assert.equal(fiscalDownload.status,200);assert.match(await fiscalDownload.text(),/Somente teste local/);
  let inbox=[];
  for(let attempt=0;attempt<30;attempt++) {inbox=(await call('/notifications',{cookie:buyer})).data;if(inbox.some(row=>row.template==='ORDER_CREATED'||row.title==='Pedido recebido'))break;await delay(1000);}
  assert.ok(inbox.some(row=>row.template==='ORDER_CREATED'||row.title==='Pedido recebido'),'Order event must reach the customer inbox');
  await call(`/notifications/${inbox[0].id}/read`,{method:'PATCH',cookie:sellers[1].cookie});
  assert.equal((await call('/notifications',{cookie:buyer})).data.find(row=>row.id===inbox[0].id).readAt,null);
  for (let i = 0; i < products.length; i++) {
    const product = (await call(`/seller/products/${products[i].id}`, { cookie: sellers[i].cookie })).data;
    assert.equal(product.variants[0].inventory.quantity, 2);
    assert.equal(product.variants[0].inventory.reservedQuantity, 0);
  }
  await call('/admin/reports', {cookie:buyer,expected:403});
  await call('/admin/reports', {cookie:admin});
  await call('/admin/access', {cookie:admin});
  for (const format of ['csv', 'xlsx']) {
    const exported = await fetch(`${base}/admin/reports/sales/export?format=${format}`, {headers: {origin,cookie:admin},signal:AbortSignal.timeout(15000)});
    assert.equal(exported.status,200);
    assert.match(exported.headers.get('content-disposition'), new RegExp(`sales\\.${format}`));
    const bytes = Buffer.from(await exported.arrayBuffer());
    if (format === 'xlsx') {
      assert.equal(bytes.subarray(0,2).toString(), 'PK');
      const { Workbook } = require(join(root, 'potala-orders-service/node_modules/exceljs'));
      const book = new Workbook(); await book.xlsx.load(bytes);
      assert.ok(book.worksheets[0].rowCount > 1);
    } else assert.match(bytes.toString('utf8'), /sellerId/);
  }
  const future = hours => new Date(Date.now() + hours * 3600000).toISOString();
  const activity = (await call('/admin/activities', {method:'POST',expected:201,cookie:admin,data:{title:`Curso ${suffix}`,description:'Material de homologação',kind:'COURSE',priceCents:0,capacity:2,timezone:'America/Sao_Paulo',modality:'IN_PERSON',venue:'Sala local de homologação',instructors:[{name:'Instrutor de teste',bio:'Perfil fictício no banco local.'}],enrollmentDeadline:future(1),sessions:[{title:'Sessão',startsAt:future(2),endsAt:future(3)}]}})).data;
  await call(`/admin/activities/${activity.id}`,{method:'PATCH',cookie:admin,data:{status:'PUBLISHED'}});
  const material = (await call(`/admin/activities/${activity.id}/materials`,{method:'POST',cookie:admin,expected:201,data:{title:'Apoio',filename:'apoio.txt',content:'Material de teste'}})).data;
  const enrollment = (await call(`/activities/${activity.id}/enroll`,{method:'POST',cookie:buyer,expected:201})).data;
  assert.equal(enrollment.status,'CONFIRMED');
  const download = await fetch(`${base}/me/enrollments/${enrollment.id}/materials/${material.id}/download`,{headers:{origin,cookie:buyer}});
  assert.equal(download.status,200);assert.equal(await download.text(),'Material de teste');
  const sessionId=randomUUID();
  await call('/public/analytics/events',{method:'POST',expected:202,data:{id:randomUUID(),sessionId,consent:true,event:'page_view'}});
  await call('/public/analytics/events',{method:'POST',expected:400,data:{id:randomUUID(),sessionId,consent:true,event:'purchase'}});
  const contactData={id:randomUUID(),name:'Cliente local',email:`contact-${suffix}@example.test`,subject:'Homologação de contato',message:'Solicitação de teste local com persistência.',analyticsConsent:true,analyticsSessionId:sessionId};
  const contact=(await call('/public/contact',{method:'POST',expected:202,data:contactData})).data;
  assert.equal(contact.protocol,contactData.id);
  assert.equal((await call('/public/contact',{method:'POST',expected:202,data:contactData})).data.protocol,contactData.id);
  await call(`/admin/contacts/${contact.protocol}`,{cookie:buyer,expected:403});
  assert.equal((await call(`/admin/contacts/${contact.protocol}`,{cookie:admin})).data.subject,contactData.subject);
  await call(`/admin/contacts/${contact.protocol}`,{method:'PATCH',cookie:admin,data:{status:'READ'}});
  for(const view of ['products','stock','vendors','customers','activities','sessions','enrollments','contacts','refunds','payouts']) {
    const response=await fetch(`${base}/admin/reports/${view}/export?format=csv`,{headers:{origin,cookie:admin},signal:AbortSignal.timeout(15000)});
    const body=await response.text();assert.equal(response.status,200,`${view}: ${body}`);assert.ok(body.trim().length>0);
    await call(`/admin/reports/${view}/export?format=csv`,{cookie:buyer,expected:403});
  }
  const summary=(await call('/admin/analytics',{cookie:admin})).data;
  assert.ok(summary.events.find(event=>event.event==='contact_submit'&&event.count>=1));
  await call('/public/analytics/withdraw',{method:'POST',data:{sessionId}});
  await call('/admin/analytics',{cookie:admin});
  await call('/internal/sessions/introspect', { method: 'POST', data: {}, expected: 404 });
  await call('/auth/logout', { method: 'POST', cookie: buyer, expected: 204 });
  await call('/auth/me', { cookie: buyer, expected: 401 });
  console.log('PASS: five processes, health, login, sellers, products, two-seller checkout (mock), idempotent replay, stock, seller isolation, internal block and logout.');
  console.log('PASS: contract reports, contacts persisted/idempotent/admin-only, server-confirmed contact analytics, structured course details and downloads.');
  await mkdir(join(root,'artifacts'),{recursive:true});
  await writeFile(join(root,'artifacts/completion-flow.log'),logs.join('\n'));
  await writeFile(join(root,'artifacts/closure-final-smoke.json'),JSON.stringify({passed:true,checkedAt:new Date().toISOString(),target:base,checks:['five services ready','auth and logout','seller isolation','two seller mock checkout','split cents and idempotency','explicit seller delivery configuration','typed attributes and public filters','private fiscal upload and customer download with seller IDOR denial','durable order event reaches owner-scoped inbox','stock once','CSV and XLSX readback','all contract report origins','structured course enrollment and download','contact idempotency and admin authorization','server-confirmed contact analytics','internal routes blocked']},null,2));
  if(process.env.KEEP_LOCAL_RUNTIME==='1') {
    console.log('Local runtime ready at 127.0.0.1:18080; stop with Ctrl+C.');
    await new Promise(resolve=>process.once('SIGINT',resolve));
  }
} finally {
  if (running) { running.stop(); await running.finished; }
  await identity.$disconnect();
  await mkdir(join(root, 'artifacts'), { recursive: true });
  await writeFile(join(root, 'artifacts/completion-flow.log'), logs.join('\n'));
}
