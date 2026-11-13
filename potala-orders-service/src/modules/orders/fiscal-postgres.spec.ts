import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { FiscalAttachmentsService } from './fiscal-attachments.controller';

const enabled = process.env.COMPLETION_POSTGRES_PROOF === 'true';
(enabled ? describe : describe.skip)('private fiscal native PostgreSQL proof', () => {
  const db = new PrismaClient();
  const sellerId = randomUUID(), customerId = randomUUID(), actorId = randomUUID();
  let orderId: string, sellerOrderId: string;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== '127.0.0.1' || url.port !== '55434' || url.pathname !== '/potala_completion') throw new Error('Only isolated native test database is allowed');
    const order = await db.order.create({data: {customerId, orderNumber: `FISCAL-PROOF-${randomUUID()}`, subtotalCents: 1000, totalCents: 1500, shippingCents: 500, sellerOrders: {create: {sellerId, subtotalCents: 1000, shippingCents: 500, commissionCents: 0, sellerNetCents: 1500, shippingSnapshot: {method: 'DELIVERY', priceCents: 500, revision: 1}}}}, include: {sellerOrders: true}});
    orderId = order.id; sellerOrderId = order.sellerOrders[0].id;
  });
  afterAll(async () => {
    if (sellerOrderId) {
      const files = await db.fiscalAttachment.findMany({where: {sellerOrderId}, select: {id: true}});
      await db.fiscalAttachmentAudit.deleteMany({where: {attachmentId: {in: files.map(f => f.id)}}});
      await db.fiscalAttachment.deleteMany({where: {sellerOrderId}});
      await db.outboxEvent.deleteMany({where: {orderId}});
      await db.sellerOrder.delete({where: {id: sellerOrderId}});
      await db.order.delete({where: {id: orderId}});
    }
    await db.$disconnect();
  });
  it('persists bytes privately, scopes seller/customer, records downloads/revocation and blocks revoked files', async () => {
    const service = new FiscalAttachmentsService(db as never);
    const input = {fileName: 'nota.xml', mediaType: 'application/xml', base64: Buffer.from('<nfeProc><NFe id="proof">local</NFe></nfeProc>').toString('base64')};
    await expect(service.upload(sellerOrderId, randomUUID(), actorId, input)).rejects.toThrow('not found');
    const created = await service.upload(sellerOrderId, sellerId, actorId, input);
    expect(await service.list(sellerOrderId, {customerId})).toHaveLength(1);
    await expect(service.download(sellerOrderId, created.id, {customerId: randomUUID()}, actorId)).rejects.toThrow('not found');
    const downloaded = await service.download(sellerOrderId, created.id, {customerId}, customerId);
    expect(Buffer.from(downloaded.bytes).toString('base64')).toBe(input.base64);
    await service.download(sellerOrderId, created.id, {admin: true}, actorId);
    await expect(service.revoke(sellerOrderId, created.id, {sellerId: randomUUID()}, actorId)).rejects.toThrow();
    await service.revoke(sellerOrderId, created.id, {sellerId}, actorId);
    expect(await service.list(sellerOrderId, {customerId})).toEqual([]);
    await expect(service.download(sellerOrderId, created.id, {admin: true}, actorId)).rejects.toThrow('not found');
    const audit = await db.fiscalAttachmentAudit.findMany({where: {attachmentId: created.id}, orderBy: {occurredAt: 'asc'}});
    expect(audit.map(a => a.action)).toEqual(['UPLOAD', 'DOWNLOAD', 'DOWNLOAD', 'REVOKE']);
  });
});
