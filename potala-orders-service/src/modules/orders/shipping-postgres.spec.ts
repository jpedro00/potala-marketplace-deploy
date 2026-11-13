import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { OrdersService } from './orders.service';
import { CouponsService } from './coupons.service';
import { CheckoutIdempotencyService } from './checkout-idempotency.service';
import { FinanceService } from '../payments/finance.service';
import { OrderTransitionsService } from './order-transitions.service';
const enabled = process.env.COMPLETION_POSTGRES_PROOF === 'true';
(enabled ? describe : describe.skip)('shipping checkout native PostgreSQL proof', () => {
  const db = new PrismaClient();
  const customerId = randomUUID(), sellerIds = [randomUUID(), randomUUID()], productIds = [randomUUID(), randomUUID()], variantIds = [randomUUID(), randomUUID()];
  const couponIds: string[] = [];
  const charge = jest.fn(async () => ({status: 'PENDING', provider: 'proof', providerRef: randomUUID()}));
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== '127.0.0.1' || url.port !== '55434' || url.pathname !== '/potala_completion') throw new Error('Only isolated native test database is allowed');
    for (const id of productIds) await db.financialPolicy.create({data: {scope: 'PRODUCT', scopeId: id, scopeKey: `PRODUCT:${id}`, version: 1, commissionBps: 500, gatewayFeeBps: 100, fixedFeeCents: 5, createdByUserId: customerId}});
  });
  afterAll(async () => {
    const orders = await db.order.findMany({where: {customerId}, select: {id: true}});
    const ids = orders.map(o => o.id);
    await db.checkoutIdempotencyKey.deleteMany({where: {customerId}});
    await db.outboxEvent.deleteMany({where: {orderId: {in: ids}}});
    await db.orderStatusHistory.deleteMany({where: {orderId: {in: ids}}});
    await db.paymentTransaction.deleteMany({where: {orderId: {in: ids}}});
    await db.order.deleteMany({where: {customerId}});
    // FinancialPolicy is append-only by database trigger. Local proof policies intentionally remain with unique, unreferenced product UUIDs.
    await db.coupon.deleteMany({where: {id: {in: couponIds}}});
    await db.$disconnect();
  });
  it('recomputes regional freight, persists exact multi-seller totals/coupons and replays the original snapshot once', async () => {
    const catalog = {resolveVariants: jest.fn(async () => productIds.map((id, i) => ({productId: id, variantId: variantIds[i], sellerId: sellerIds[i], productStatus: 'ACTIVE', productTitle: 'Proof local', sku: `proof-${i}`, variantName: 'Proof', unitPriceCents: i ? 3000 : 2000, availableQuantity: 20, itemType: 'PHYSICAL'}))), reserveInventory: jest.fn(), commitInventory: jest.fn(), releaseInventory: jest.fn()};
    const sellers = {getPaymentSettings: jest.fn(async () => ({status: 'ACTIVE', acceptPix: true, acceptCard: true})), getDeliverySettings: jest.fn(async (sellerId: string) => ({sellerId, revision: 7, pickupEnabled: true, pickupAddress: 'Local proof address', deliveryEnabled: true, rates: [{state: 'SP', priceCents: sellerId === sellerIds[0] ? 1000 : 500, estimatedDays: 2}]}))};
    const service = new OrdersService(db as never, catalog as never, {charge} as never, new CouponsService(db as never), new CheckoutIdempotencyService(db as never), new OrderTransitionsService(), new FinanceService(db as never), sellers as never);
    for (const [type, value, expectedDiscount] of [['FIXED', 777, 777], ['PERCENT', 10, 500], ['SHIPPING', 1, 1500]] as const) {
      const code = `PROOF-${randomUUID().slice(0, 8)}`.toUpperCase();
      const coupon = await db.coupon.create({data: {code, name: 'Local proof only', discountType: type, discountValue: value, startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 60000)}});
      couponIds.push(coupon.id);
      const key = randomUUID();
      const dto = {items: productIds.map((productId, i) => ({productId, variantId: variantIds[i], quantity: 1})), shippingAddress: {recipient: 'Local proof', street: 'Rua A', number: '1', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', postalCode: '01310-000'}, couponCode: code, shippingCents: 1};
      await service.checkoutWithOptionalKey(customerId, dto, key);
      const persisted = await db.order.findFirstOrThrow({where: {checkoutIdempotencyKey: {key, customerId}}, include: {sellerOrders: true}});
      expect(persisted.shippingCents).toBe(1500);
      expect(persisted.discountCents).toBe(expectedDiscount);
      expect(persisted.totalCents).toBe(6500 - expectedDiscount);
      expect(persisted.sellerOrders.reduce((s, row) => s + row.sellerNetCents + row.commissionCents + row.gatewayFeeCents, 0)).toBe(persisted.totalCents);
      expect(persisted.sellerOrders.every(row => (row.shippingSnapshot as any).revision === 7)).toBe(true);
      const calls = charge.mock.calls.length;
      sellers.getDeliverySettings.mockRejectedValueOnce(new Error('changed settings'));
      await service.checkoutWithOptionalKey(customerId, dto, key);
      expect(charge.mock.calls.length).toBe(calls);
      await expect(service.checkoutWithOptionalKey(customerId, {...dto, deliveryChoices: [{sellerId: sellerIds[0], method: 'PICKUP'}]}, key)).rejects.toThrow('different');
      sellers.getDeliverySettings.mockClear();
      // Remove queued failure from the mock: replay does not contact delivery settings.
      sellers.getDeliverySettings.mockReset().mockImplementation(async (sellerId: string) => ({sellerId, revision: 7, pickupEnabled: true, pickupAddress: 'Local proof address', deliveryEnabled: true, rates: [{state: 'SP', priceCents: sellerId === sellerIds[0] ? 1000 : 500, estimatedDays: 2}]}));
    }
    expect(charge).toHaveBeenCalledTimes(3);
  });
});
