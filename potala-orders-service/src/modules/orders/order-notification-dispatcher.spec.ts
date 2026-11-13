import { notificationTemplate, OrderNotificationDispatcher } from './order-notification-dispatcher';
describe('durable order notification dispatcher', () => {
  const event = {id: 'event', orderId: 'order', eventType: 'orders.order.created', eventVersion: 1, payload: {}, attempts: 0};
  function setup() {
    const prisma = {outboxEvent: {findMany: jest.fn().mockResolvedValue([event]), updateMany: jest.fn().mockResolvedValue({count: 1})}, order: {findUnique: jest.fn().mockResolvedValue({customerId: 'customer'})}};
    const identity = {enqueueNotification: jest.fn().mockResolvedValue(undefined)};
    return {prisma, identity, service: new OrderNotificationDispatcher(prisma as never, identity as never)};
  }
  it.each([['orders.order.created', {}, 'ORDER_CREATED'], ['orders.order.status_changed', {toStatus: 'PAID'}, 'PAYMENT_APPROVED'], ['orders.order.status_changed', {toStatus: 'CANCELLED'}, 'ORDER_CANCELLED'], ['orders.seller_order.status_changed', {toStatus: 'SHIPPED'}, 'ORDER_SHIPPED'], ['orders.seller_order.status_changed', {toStatus: 'DELIVERED'}, 'ORDER_DELIVERED'], ['orders.seller_order.created', {}, null], ['orders.fiscal.available', {}, 'FISCAL_AVAILABLE']])('maps %s %j', (eventType, payload, expected) => expect(notificationTemplate({eventType, payload, eventVersion: 1} as never)).toBe(expected));
  it('claims once and only marks published after durable enqueue with event recipient idempotency', async () => {
    const {service, prisma, identity} = setup();
    await service.dispatchBatch();
    expect(identity.enqueueNotification).toHaveBeenCalledWith('customer', 'ORDER_CREATED', 'order-event:event:customer');
    expect(prisma.outboxEvent.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({where: expect.objectContaining({status: 'PROCESSING', lockToken: expect.any(String)}), data: expect.objectContaining({status: 'PUBLISHED', publishedAt: expect.any(Date)})}));
  });
  it('persists retry state without errors containing personal data or tokens', async () => {
    const {service, prisma, identity} = setup();
    identity.enqueueNotification.mockRejectedValue(new Error('secret token user@email'));
    await service.dispatchBatch();
    expect(prisma.outboxEvent.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({data: expect.objectContaining({status: 'PENDING', nextAttemptAt: expect.any(Date), lastError: 'INBOX_ENQUEUE_FAILED'})}));
  });
  it('sends a seller-specific fiscal event only to the customer and responsible seller owners', async () => {
    const {prisma,identity}=setup();
    prisma.outboxEvent.findMany.mockResolvedValue([{...event,eventType:'orders.fiscal.available',payload:{sellerId:'responsible-seller'}}] as never);
    prisma.order.findUnique.mockResolvedValue({customerId:'customer',sellerOrders:[{sellerId:'responsible-seller'},{sellerId:'other-seller'}]} as never);
    const sellers={getNotificationRecipients:jest.fn().mockResolvedValue(['owner'])};
    await new OrderNotificationDispatcher(prisma as never,identity as never,sellers as never).dispatchBatch();
    expect(sellers.getNotificationRecipients).toHaveBeenCalledTimes(1);
    expect(sellers.getNotificationRecipients).toHaveBeenCalledWith('responsible-seller');
    expect(identity.enqueueNotification).toHaveBeenCalledTimes(2);
    expect(identity.enqueueNotification).toHaveBeenCalledWith('customer','FISCAL_AVAILABLE','order-event:event:customer');
    expect(identity.enqueueNotification).toHaveBeenCalledWith('owner','FISCAL_AVAILABLE','order-event:event:owner');
  });
  it('does not send when another instance owns the lease', async () => {
    const {service, prisma, identity} = setup(); prisma.outboxEvent.updateMany.mockResolvedValue({count: 0});
    await service.dispatchBatch(); expect(identity.enqueueNotification).not.toHaveBeenCalled();
  });
  it('is disabled by default and never starts a timer without explicit opt-in', () => {
    const previous = process.env.ORDER_NOTIFICATION_WORKER_ENABLED; delete process.env.ORDER_NOTIFICATION_WORKER_ENABLED;
    const timer = jest.spyOn(global, 'setInterval'); const {service} = setup(); service.onModuleInit(); expect(timer).not.toHaveBeenCalled(); timer.mockRestore();
    if (previous !== undefined) process.env.ORDER_NOTIFICATION_WORKER_ENABLED = previous;
  });
});
