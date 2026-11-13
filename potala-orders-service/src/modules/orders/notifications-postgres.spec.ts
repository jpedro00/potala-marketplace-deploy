import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { createServer } from 'http';
import { IdentityServiceClient } from '../../clients/identity-service.client';
import { OrderNotificationDispatcher } from './order-notification-dispatcher';
const enabled = process.env.COMPLETION_POSTGRES_PROOF === 'true';
(enabled ? describe : describe.skip)('order inbox HTTP and native PostgreSQL proof', () => {
  const db = new PrismaClient();
  const customerId = randomUUID();
  let orderId: string;
  afterAll(async () => {
    if (orderId) {await db.outboxEvent.deleteMany({where: {orderId}}); await db.order.delete({where: {id: orderId}});}
    await db.$disconnect();
  });
  it('leases durably, retries ambiguous HTTP failure with the same idempotency key and publishes only on success', async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== '127.0.0.1' || url.port !== '55434' || url.pathname !== '/potala_completion') throw new Error('Only isolated native test database is allowed');
    const order = await db.order.create({data: {customerId, orderNumber: `INBOX-PROOF-${randomUUID()}`, subtotalCents: 1000, totalCents: 1000}});
    orderId = order.id;
    const event = await db.outboxEvent.create({data: {id: randomUUID(), orderId, eventType: 'orders.order.created', eventVersion: 1, aggregateType: 'ORDER', aggregateId: orderId, payload: {orderId, status: 'PENDING_PAYMENT', source: 'CHECKOUT'}}});
    const received: Array<Record<string, string>> = [];
    const durableInboxKeys = new Set<string>();
    const server = createServer(async (request, response) => {
      let body = ''; for await (const chunk of request) body += chunk;
      if (request.url !== '/api/v1/internal/notifications' || request.headers['x-internal-api-key'] !== 'local-proof') {response.writeHead(403).end(); return;}
      const input = JSON.parse(body); received.push(input); durableInboxKeys.add(input.idempotencyKey);
      // Simulate recipient persisted, then connection failed: retry must carry the same key.
      response.writeHead(received.length === 1 ? 503 : 201, {'content-type': 'application/json'}).end('{}');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address() as {port: number};
      const identity = new IdentityServiceClient(new ConfigService({identityService: {baseUrl: `http://127.0.0.1:${address.port}`, apiKey: 'local-proof', timeoutMs: 2000}}) as never);
      // Isolate this proof from existing historical outbox rows by advancing their nextAttemptAt within a transaction would alter unrelated state.
      // Instead the mocked query delegates only this event; all mutations and state remain real PostgreSQL.
      const isolated = {order: db.order, outboxEvent: {updateMany: db.outboxEvent.updateMany.bind(db.outboxEvent), findMany: (args: any) => db.outboxEvent.findMany({...args, where: {...args.where, id: event.id}})}};
      const worker = new OrderNotificationDispatcher(isolated as never, identity);
      await worker.dispatchBatch();
      expect((await db.outboxEvent.findUniqueOrThrow({where: {id: event.id}})).status).toBe('PENDING');
      await db.outboxEvent.update({where: {id: event.id}, data: {nextAttemptAt: new Date(0)}});
      await worker.dispatchBatch();
      const persisted = await db.outboxEvent.findUniqueOrThrow({where: {id: event.id}});
      expect(persisted).toMatchObject({status: 'PUBLISHED', attempts: 2, lockToken: null, lockedUntil: null, lastError: null});
      expect(received).toHaveLength(2);
      expect(durableInboxKeys.size).toBe(1);
      expect(received[0]).toEqual({userId: customerId, template: 'ORDER_CREATED', idempotencyKey: `order-event:${event.id}:${customerId}`});
    } finally {await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));}
  });
});
