import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OutboxEvent } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { IdentityServiceClient } from '../../clients/identity-service.client';
import { SellersServiceClient } from '../../clients/sellers-service.client';

/** One bounded consumer for the existing transactional outbox; no HTTP call inside a DB transaction.
 * At-least-once delivery plus Identity's persistent idempotency key covers crashes after enqueue. */
@Injectable()
export class OrderNotificationDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderNotificationDispatcher.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly identity: IdentityServiceClient, private readonly sellers: SellersServiceClient = undefined!) {}
  onModuleInit() {
    if (process.env.ORDER_NOTIFICATION_WORKER_ENABLED !== 'true') return;
    this.timer = setInterval(() => {void this.dispatchBatch().catch(() => this.logger.error('Order inbox dispatcher batch failed'));}, 5000);
    this.timer.unref();
  }
  onModuleDestroy() {if (this.timer) clearInterval(this.timer);}
  async dispatchBatch(limit = 20) {
    if (this.running) return {claimed: 0};
    this.running = true;
    let claimed = 0;
    try {
      const now = new Date();
      const rows = await this.prisma.outboxEvent.findMany({where: {OR: [{status: 'PENDING', nextAttemptAt: {lte: now}}, {status: 'PROCESSING', lockedUntil: {lt: now}}]}, orderBy: {sequence: 'asc'}, take: Math.max(1, Math.min(limit, 50))});
      for (const event of rows) {
        const lockToken = randomUUID();
        const taken = await this.prisma.outboxEvent.updateMany({where: {id: event.id, OR: [{status: 'PENDING', nextAttemptAt: {lte: now}}, {status: 'PROCESSING', lockedUntil: {lt: now}}]}, data: {status: 'PROCESSING', lockToken, lockedUntil: new Date(Date.now() + 120000), attempts: {increment: 1}}});
        if (!taken.count) continue;
        claimed++;
        try {
          const template = notificationTemplate(event);
          if (template) {
            const order = await this.prisma.order.findUnique({where: {id: event.orderId}, select: {customerId: true, sellerOrders: {select: {sellerId: true}}}});
            if (!order) throw new Error('ORDER_NOT_FOUND');
            const recipients = new Set([order.customerId]);
            if (this.sellers) {
              const payload = event.payload as Record<string, unknown>;
              const sellerIds = typeof payload.sellerId === 'string' ? [payload.sellerId] : (order.sellerOrders ?? []).map(row => row.sellerId);
              for (const sellerId of new Set(sellerIds)) for (const userId of await this.sellers.getNotificationRecipients(sellerId)) recipients.add(userId);
            }
            for (const userId of recipients) await this.identity.enqueueNotification(userId, template, `order-event:${event.id}:${userId}`);
          }
          await this.prisma.outboxEvent.updateMany({where: {id: event.id, lockToken, status: 'PROCESSING'}, data: {status: 'PUBLISHED', publishedAt: new Date(), lockToken: null, lockedUntil: null, lastError: null}});
        } catch {
          const attempts = event.attempts + 1;
          await this.prisma.outboxEvent.updateMany({where: {id: event.id, lockToken, status: 'PROCESSING'}, data: {status: attempts >= 10 ? 'FAILED' : 'PENDING', nextAttemptAt: new Date(Date.now() + Math.min(3600000, 5000 * 2 ** attempts)), lockToken: null, lockedUntil: null, lastError: 'INBOX_ENQUEUE_FAILED'}});
        }
      }
      return {claimed};
    } finally {this.running = false;}
  }
}
export function notificationTemplate(event: Pick<OutboxEvent, 'eventType' | 'eventVersion' | 'payload'>): string | null {
  if (event.eventVersion !== 1 || !event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) return null;
  const payload = event.payload as Record<string, unknown>;
  if (event.eventType === 'orders.order.created') return 'ORDER_CREATED';
  if (event.eventType === 'orders.order.status_changed') {
    if (payload.toStatus === 'PAID') return 'PAYMENT_APPROVED';
    if (payload.toStatus === 'CANCELLED') return 'ORDER_CANCELLED';
  }
  if (event.eventType === 'orders.seller_order.status_changed') {
    if (payload.toStatus === 'SHIPPED') return 'ORDER_SHIPPED';
    if (payload.toStatus === 'DELIVERED') return 'ORDER_DELIVERED';
  }
  if (event.eventType === 'orders.fiscal.available') return 'FISCAL_AVAILABLE';
  return null;
}
