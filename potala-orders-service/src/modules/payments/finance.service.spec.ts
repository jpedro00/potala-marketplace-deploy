import { FinanceService } from './finance.service';

describe('FinanceService policy and refund invariants', () => {
  const rule = (scope: string, scopeId: string | null, version: number, commissionBps: number) => ({id: `${scope}-${version}`, scope, scopeId, version, commissionBps, gatewayFeeBps: 0, fixedFeeCents: 0});
  it('fails closed when no commercial policy was explicitly approved', async () => {
    const service = new FinanceService({financialPolicy: {findMany: async () => []}} as never);
    await expect(service.quote([{sellerId: 's', subtotalCents: 10, items: [{productId: 'p', lineTotalCents: 10}]}], 0)).rejects.toThrow('Commercial policy');
  });
  it('applies product > category > seller > platform and preserves the selected immutable version', async () => {
    const service = new FinanceService({financialPolicy: {findMany: async () => [rule('PRODUCT', 'p', 2, 2000), rule('PRODUCT', 'p', 1, 1000), rule('CATEGORY', 'c', 1, 3000), rule('SELLER', 's', 1, 4000), rule('PLATFORM', null, 1, 5000)]}} as never);
    const [quote] = await service.quote([{sellerId: 's', subtotalCents: 400, items: [{productId: 'p', categoryId: 'c', lineTotalCents: 100}, {productId: 'other', categoryId: 'c', lineTotalCents: 100}, {productId: 'another', lineTotalCents: 200}]}], 0);
    expect(quote.commissionCents).toBe(130);
    expect(quote.sellerNetCents).toBe(270);
    expect(quote.financialSnapshot.lines.map(l => l.policyId)).toEqual(['PRODUCT-2', 'CATEGORY-1', 'SELLER-1']);
  });
  it('reconciles multi-store discounts and refuses negative net amounts', async () => {
    const service = new FinanceService({financialPolicy: {findMany: async () => [{...rule('PLATFORM', null, 1, 1000), fixedFeeCents: 1}]}} as never);
    const quotes = await service.quote([{sellerId: 'a', subtotalCents: 101, items: [{productId: 'p', lineTotalCents: 101}]}, {sellerId: 'b', subtotalCents: 99, items: [{productId: 'q', lineTotalCents: 99}]}], 3);
    expect(quotes.reduce((sum, q) => sum + q.discountCents, 0)).toBe(3);
    expect(quotes.reduce((sum, q) => sum + q.commissionCents + q.gatewayFeeCents + q.sellerNetCents, 0)).toBe(197);
    await expect(service.quote([{sellerId: 'a', subtotalCents: 1, items: [{productId: 'p', lineTotalCents: 1}]}], 1)).rejects.toThrow();
  });
  it('refund preparations are replayable, reject key reuse and cap the outstanding balance', async () => {
    const tx = {refundRequest: {findUnique: jest.fn().mockResolvedValue(null), aggregate: jest.fn().mockResolvedValue({_sum: {amountCents: 80}}), create: jest.fn(async ({data}: {data: object}) => data)}, paymentTransaction: {findUnique: jest.fn().mockResolvedValue({status: 'APPROVED', amountCents: 100})}};
    const service = new FinanceService({$transaction: async (fn: (t: typeof tx) => unknown) => fn(tx)} as never);
    await expect(service.prepareRefund('admin', 'payment', 21, 'key')).rejects.toThrow('exceeds');
    expect(tx.refundRequest.create).not.toHaveBeenCalled();
    await expect(service.prepareRefund('admin', 'payment', 20, 'key')).resolves.toMatchObject({amountCents: 20});
    tx.refundRequest.findUnique.mockResolvedValue({paymentTransactionId: 'payment', amountCents: 20});
    await expect(service.prepareRefund('admin', 'payment', 20, 'key')).resolves.toMatchObject({amountCents: 20});
    await expect(service.prepareRefund('admin', 'other-payment', 20, 'key')).rejects.toThrow('Idempotency');
    expect(tx.refundRequest.create).toHaveBeenCalledTimes(1);
  });
});
