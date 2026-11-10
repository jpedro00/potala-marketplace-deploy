import { allocateCents, quoteSplit } from './financial-split';
import { createPaymentGateway } from './payments.module';

describe('financial preparation', () => {
  it('reconciles discounts, commission and fees across sellers without losing cents', () => {
    const discount = allocateCents(7, [101, 102, 103]);
    expect(discount.reduce((a, b) => a + b, 0)).toBe(7);
    const quotes = [101, 102, 103].map((gross, i) => quoteSplit(gross, discount[i], {
      id: 'rule-v1', commissionBps: 1000, gatewayFeeBps: 200, fixedFeeCents: 1,
    }));
    expect(quotes.reduce((sum, q) => sum + q.sellerNetCents + q.commissionCents + q.gatewayFeeCents, 0)).toBe(299);
    expect(quotes.every(q => q.sellerNetCents >= 0)).toBe(true);
    expect(quotes[0].policyId).toBe('rule-v1');
  });
  it('uses exact integer rounding and rejects fees larger than the payable amount', () => {
    expect(allocateCents(1, [1, 1, 1])).toEqual([1, 0, 0]);
    expect(quoteSplit(101, 0, {id: 'r', commissionBps: 5000, gatewayFeeBps: 0, fixedFeeCents: 0}).commissionCents).toBe(51);
    expect(() => quoteSplit(1, 0, {id: 'r', commissionBps: 0, gatewayFeeBps: 0, fixedFeeCents: 2})).toThrow();
    expect(() => allocateCents(1, [0])).toThrow();
    expect(() => allocateCents(-1, [1])).toThrow();
  });
  it('never enables simulation in production and fails closed by default', async () => {
    await expect(createPaymentGateway('production', 'mock').charge({orderId: '1', orderNumber: '1', amountCents: 1})).rejects.toThrow();
    await expect(createPaymentGateway('test', undefined).charge({orderId: '1', orderNumber: '1', amountCents: 1})).rejects.toThrow();
    expect((await createPaymentGateway('test', 'mock').charge({orderId: '1', orderNumber: '1', amountCents: 1})).status).toBe('APPROVED');
  });
});
