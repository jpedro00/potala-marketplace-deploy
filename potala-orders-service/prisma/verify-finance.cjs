// Disposable PostgreSQL proof. Never load .env or accept a production target.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { FinanceService } = require('../dist/modules/payments/finance.service');
const { OrdersService } = require('../dist/modules/orders/orders.service');
const { MockPaymentGatewayAdapter } = require('../dist/modules/payments/mock-payment-gateway.adapter');
const url = process.env.FINANCE_TEST_DATABASE_URL;
if (!url) throw new Error('FINANCE_TEST_DATABASE_URL must explicitly identify the disposable database');
const parsed = new URL(url);
assert.equal(parsed.hostname, '127.0.0.1');
assert.equal(parsed.port, '55434');
assert.equal(parsed.pathname, '/potala_completion');
assert.equal(parsed.searchParams.get('schema'), 'orders');
const prisma = new PrismaClient({datasourceUrl: url});
(async () => {
  const finance = new FinanceService(prisma);
  const actor = randomUUID();
  const seller = randomUUID();
  const product = randomUUID();
  const first = await finance.createPolicy(actor, {scope: 'SELLER', scopeId: seller, commissionBps: 1375, gatewayFeeBps: 125, fixedFeeCents: 3});
  const [quote] = await finance.quote([{sellerId: seller, subtotalCents: 10001, items: [{productId: product, lineTotalCents: 10001}]}], 101);
  assert.equal(quote.sellerNetCents + quote.commissionCents + quote.gatewayFeeCents, 9900);
  assert.equal(quote.financialSnapshot.lines[0].policyId, first.id);
  await assert.rejects(prisma.financialPolicy.update({where: {id: first.id}, data: {commissionBps: 1}}), /immutable/);
  await assert.rejects(prisma.financialPolicy.create({data: {scope: 'SELLER', scopeId: seller, scopeKey: `SELLER:${seller}`, version: 2, commissionBps: 10001, gatewayFeeBps: 0, fixedFeeCents: 0, createdByUserId: actor}}));
  const second = await finance.createPolicy(actor, {scope: 'SELLER', scopeId: seller, commissionBps: 0, gatewayFeeBps: 0, fixedFeeCents: 0});
  assert.equal(second.version, 2);
  assert.equal(quote.financialSnapshot.lines[0].commissionBps, 1375);
  const order = await prisma.order.create({data: {customerId: actor, orderNumber: `FINANCE-PROOF-${randomUUID()}`, subtotalCents: 10001, discountCents: 101, totalCents: 9900}});
  await prisma.sellerOrder.create({data: {orderId: order.id, sellerId: seller, subtotalCents: 10001, discountCents: quote.discountCents, commissionCents: quote.commissionCents, gatewayFeeCents: quote.gatewayFeeCents, sellerNetCents: quote.sellerNetCents, financialSnapshot: quote.financialSnapshot}});
  const payment = await prisma.paymentTransaction.create({data: {orderId: order.id, amountCents: 9900, status: 'APPROVED', provider: 'disposable-proof', providerRef: randomUUID(), idempotencyKey: randomUUID()}});
  const attempts = await Promise.allSettled([finance.prepareRefund(actor, payment.id, 6000, randomUUID()), finance.prepareRefund(actor, payment.id, 6000, randomUUID())]);
  assert.equal(attempts.filter(a => a.status === 'fulfilled').length, 1);
  const saved = attempts.find(a => a.status === 'fulfilled').value;
  assert.equal((await finance.prepareRefund(actor, payment.id, 6000, saved.idempotencyKey)).id, saved.id);
  const total = await prisma.refundRequest.aggregate({where: {paymentTransactionId: payment.id}, _sum: {amountCents: true}});
  assert.equal(total._sum.amountCents, 6000);
  // Simulate a process stopped after the order/payment transaction committed,
  // before charge(): the authenticated enrollment retry resumes the same key.
  const enrollmentId = randomUUID();
  const resumedOrder = await prisma.order.create({data: {customerId: actor, activityEnrollmentId: enrollmentId, orderNumber: `ACTIVITY-RECOVERY-${randomUUID()}`, subtotalCents: 100, totalCents: 100, sellerOrders: {create: {sellerId: seller, subtotalCents: 100, sellerNetCents: 100, financialSnapshot: {version: 1, paymentMethod: 'PIX'}}}, paymentTransactions: {create: {amountCents: 100, idempotencyKey: `activity:${enrollmentId}:charge`}}}});
  let confirmed = 0;
  const catalog = {getEnrollment: async () => ({id: enrollmentId, userId: actor, sellerId: seller, priceCents: 100, activityId: product, status: 'PENDING_PAYMENT', expiresAt: new Date(Date.now() + 60000).toISOString()}), confirmEnrollment: async () => { confirmed++; }};
  const sellers = {getPaymentSettings: async () => ({acceptPix: true, status: 'ACTIVE', recipientRef: null})};
  const orders = new OrdersService(prisma, catalog, new MockPaymentGatewayAdapter(), {}, {}, undefined, finance, sellers);
  await orders.payActivity(actor, {enrollmentId});
  await orders.payActivity(actor, {enrollmentId});
  assert.equal((await prisma.order.findUnique({where: {id: resumedOrder.id}})).status, 'PAID');
  assert.equal(await prisma.paymentTransaction.count({where: {orderId: resumedOrder.id}}), 1);
  assert.equal(await prisma.order.count({where: {activityEnrollmentId: enrollmentId}}), 1);
  assert.equal(confirmed, 2); // Catalog callback contract is itself idempotent.
  console.log('PASS: real PostgreSQL policy versions/immutability/CHECK, cent reconciliation, concurrent refund cap and idempotent replay. No provider charge or refund performed.');
  console.log('PASS: activity payment resumes after pre-charge interruption with one order/payment and server callback only after test approval.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
