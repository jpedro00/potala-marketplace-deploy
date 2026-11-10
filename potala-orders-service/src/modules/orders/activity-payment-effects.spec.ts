import { OrdersService } from './orders.service';
import { createCatalogServiceClientMock, createPrismaMock } from '../../test-utils/prisma.mock';

describe('Authoritative activity payment callbacks', () => {
  function setup() {
    const prisma = createPrismaMock();
    const catalog = createCatalogServiceClientMock();
    const service = new OrdersService(prisma, catalog as never, {} as never, {} as never, {} as never);
    prisma.paymentTransaction.findUnique.mockResolvedValue({id: 'payment', orderId: 'order', status: 'APPROVED'});
    prisma.order.findUnique.mockResolvedValue({id: 'order', customerId: 'buyer', status: 'PAID', activityEnrollmentId: 'enrollment', totalCents: 1234, analyticsSessionId: null});
    return {prisma, catalog, service};
  }
  const event = {provider: 'verified-provider', providerRef: 'verified-ref', status: 'APPROVED' as const};
  it('retries an approved enrollment callback with server amounts and no second charge or inventory mutation', async () => {
    const {service, catalog, prisma} = setup();
    catalog.confirmEnrollment.mockRejectedValueOnce(new Error('Catalog unavailable')).mockResolvedValueOnce({});
    await expect(service.confirmPaymentFromWebhook(event)).rejects.toThrow('Catalog unavailable');
    await service.confirmPaymentFromWebhook(event);
    expect(catalog.confirmEnrollment).toHaveBeenCalledTimes(2);
    expect(catalog.confirmEnrollment).toHaveBeenLastCalledWith('enrollment', {orderId: 'order', userId: 'buyer', amountCents: 1234, status: 'CONFIRMED'});
    expect(prisma.paymentTransaction.updateMany).not.toHaveBeenCalled();
    expect(catalog.commitInventory).not.toHaveBeenCalled();
    expect(catalog.recordPurchase).not.toHaveBeenCalled();
  });
  it('never confirms a cancelled or unpaid enrollment even when a provider approval is recorded', async () => {
    const {service, catalog, prisma} = setup();
    prisma.order.findUnique.mockResolvedValue({status: 'CANCELLED', activityEnrollmentId: 'enrollment'});
    await service.confirmPaymentFromWebhook(event);
    expect(catalog.confirmEnrollment).not.toHaveBeenCalled();
  });
  it('analytics requires consent snapshot and its outage never breaks a paid order', async () => {
    const {service, catalog, prisma} = setup();
    prisma.order.findUnique.mockResolvedValue({id: 'order', customerId: 'buyer', status: 'PAID', totalCents: 1234, analyticsSessionId: 'consented-session'});
    catalog.recordPurchase.mockRejectedValue(new Error('telemetry outage'));
    await expect(service.confirmPaymentFromWebhook(event)).resolves.toBeUndefined();
    expect(catalog.recordPurchase).toHaveBeenCalledWith('order', 'consented-session', 1234);
  });
});
