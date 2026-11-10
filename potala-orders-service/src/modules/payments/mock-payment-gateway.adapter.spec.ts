import { MockPaymentGatewayAdapter } from './mock-payment-gateway.adapter';

describe('MockPaymentGatewayAdapter', () => {
  it('replays the same persisted idempotency key without a second simulated charge', async () => {
    const adapter = new MockPaymentGatewayAdapter();
    const input = {orderId: 'retry', orderNumber: 'RETRY', amountCents: 100, idempotencyKey: 'stable-key'};
    expect(await adapter.charge(input)).toEqual(await adapter.charge(input));
  });
  it('always approves with a provider-shaped result', async () => {
    const adapter = new MockPaymentGatewayAdapter();

    const result = await adapter.charge({
      orderId: 'order-1',
      orderNumber: 'PED-TEST',
      amountCents: 1000,
    });

    expect(result.status).toBe('APPROVED');
    expect(result.provider).toBe('mock');
    expect(result.providerRef).toMatch(/^mock_/);
  });

  it('returns a distinct providerRef per call', async () => {
    const adapter = new MockPaymentGatewayAdapter();

    const first = await adapter.charge({
      orderId: 'order-1',
      orderNumber: 'PED-1',
      amountCents: 1000,
    });
    const second = await adapter.charge({
      orderId: 'order-2',
      orderNumber: 'PED-2',
      amountCents: 2000,
    });

    expect(first.providerRef).not.toBe(second.providerRef);
  });
});
