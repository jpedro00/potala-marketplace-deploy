import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { ActivitiesService } from './activities.service';
import { PrismaService } from '../../database/prisma.service';
// Opt-in only. Caller must provision/migrate an isolated disposable database.
const databaseUrl = process.env.ACTIVITIES_TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
suite('Activities PostgreSQL concurrency and access (isolated DB)', () => {
  let db: PrismaClient, service: ActivitiesService;
  const activityIds: string[] = [];
  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: databaseUrl });
    await db.$connect();
    service = new ActivitiesService(db as unknown as PrismaService);
  });
  afterAll(async () => {
    if (!db) return;
    await db.materialAccess.deleteMany({
      where: { enrollment: { activityId: { in: activityIds } } },
    });
    await db.activityMaterial.deleteMany({
      where: { activityId: { in: activityIds } },
    });
    await db.enrollment.deleteMany({
      where: { activityId: { in: activityIds } },
    });
    await db.activity.deleteMany({ where: { id: { in: activityIds } } });
    await db.$disconnect();
  });
  async function create(priceCents = 0, capacity = 2) {
    const a = await db.activity.create({
      data: {
        title: 'Isolated concurrency proof',
        description: 'Disposable test fixture',
        kind: 'COURSE',
        status: 'PUBLISHED',
        priceCents,
        capacity,
        enrollmentDeadline: new Date(Date.now() + 3600000),
      },
    });
    activityIds.push(a.id);
    return a;
  }
  it('never overbooks the last seats across simultaneous independent requests', async () => {
    const a = await create();
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => service.enroll(a.id, randomUUID())),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(
      await db.enrollment.count({
        where: { activityId: a.id, status: 'CONFIRMED' },
      }),
    ).toBe(2);
  }, 30000);
  it('retries of one user return one enrollment under contention', async () => {
    const a = await create(0, 10),
      userId = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => service.enroll(a.id, userId)),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await db.enrollment.count({ where: { activityId: a.id } })).toBe(1);
  }, 30000);
  it('expired paid reservations free seats and cannot be confirmed late', async () => {
    const a = await create(2000, 1),
      userId = randomUUID();
    const e = await service.enroll(a.id, userId);
    await db.enrollment.update({
      where: { id: e.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await service.enroll(a.id, randomUUID());
    await expect(
      service.payment(e.id, {
        orderId: randomUUID(),
        userId,
        amountCents: 2000,
        status: 'CONFIRMED',
      }),
    ).rejects.toThrow('Reserva expirada');
    expect(
      await db.enrollment.count({
        where: { activityId: a.id, status: 'PENDING_PAYMENT' },
      }),
    ).toBe(1);
  }, 30000);
  it('paid materials require exact owner and confirmed payment; cancellation revokes access', async () => {
    const a = await create(1000, 2),
      userId = randomUUID();
    const e = await service.enroll(a.id, userId);
    const m = await service.addMaterial(a.id, {
      title: 'Test',
      filename: 'test.txt',
      content: 'private',
    });
    await expect(service.download(e.id, m.id, userId)).rejects.toThrow();
    const orderId = randomUUID();
    await service.payment(e.id, {
      orderId,
      userId,
      amountCents: 1000,
      status: 'CONFIRMED',
    });
    await service.payment(e.id, {
      orderId,
      userId,
      amountCents: 1000,
      status: 'CONFIRMED',
    });
    await expect(service.download(e.id, m.id, randomUUID())).rejects.toThrow();
    expect(
      Buffer.from(
        (await service.download(e.id, m.id, userId)).data!,
      ).toString(),
    ).toBe('private');
    expect(
      await db.materialAccess.count({ where: { enrollmentId: e.id } }),
    ).toBe(1);
    await service.cancel(e.id, userId);
    await expect(service.download(e.id, m.id, userId)).rejects.toThrow();
  }, 30000);
  it('allows one fresh reservation after TTL while preserving the old ID and denying its late payment', async () => {
    const a = await create(1500, 1),
      userId = randomUUID();
    const old = await service.enroll(a.id, userId);
    await db.enrollment.update({
      where: { id: old.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const attempts = await Promise.all(
      Array.from({ length: 6 }, () => service.enroll(a.id, userId)),
    );
    expect(new Set(attempts.map((e) => e.id)).size).toBe(1);
    expect(attempts[0].id).not.toBe(old.id);
    expect(
      (await db.enrollment.findUniqueOrThrow({ where: { id: old.id } })).status,
    ).toBe('EXPIRED');
    await expect(
      service.payment(old.id, {
        orderId: randomUUID(),
        userId,
        amountCents: 1500,
        status: 'CONFIRMED',
      }),
    ).rejects.toThrow('Reserva expirada');
    expect(
      await db.enrollment.count({ where: { activityId: a.id, userId } }),
    ).toBe(2);
    await service.cancel(old.id, userId);
    expect(
      (await db.enrollment.findUniqueOrThrow({ where: { id: old.id } })).status,
    ).toBe('EXPIRED');
  }, 30000);
  it('voluntary cancellation remains terminal', async () => {
    const a = await create(0, 1),
      userId = randomUUID();
    const e = await service.enroll(a.id, userId);
    await service.cancel(e.id, userId);
    await expect(service.enroll(a.id, userId)).rejects.toThrow(
      'Inscrição cancelada',
    );
  });
  it('paginates customer history without duplicate or missing enrollment IDs and rejects foreign cursors', async () => {
    const a = await create(0, 3),
      b = await create(0, 3),
      userId = randomUUID();
    const first = await service.enroll(a.id, userId),
      second = await service.enroll(b.id, userId);
    const page1 = await service.mine(userId, { limit: 1 });
    expect(page1.items).toHaveLength(1);
    expect(page1.pageInfo.hasNextPage).toBe(true);
    const page2 = await service.mine(userId, {
      limit: 1,
      cursor: page1.pageInfo.nextCursor!,
    });
    expect(new Set([...page1.items, ...page2.items].map((e) => e.id))).toEqual(
      new Set([first.id, second.id]),
    );
    expect(page2.pageInfo.hasNextPage).toBe(false);
    const foreign = await service.enroll(a.id, randomUUID());
    await expect(service.mine(userId, { cursor: foreign.id })).rejects.toThrow(
      'Invalid cursor',
    );
  });
  it('roundtrips a real PDF and prevents foreign enrollment access to it', async () => {
    const a = await create(0, 2),
      userId = randomUUID(),
      e = await service.enroll(a.id, userId);
    const data = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF',
    );
    const m = await service.addMaterial(a.id, {
      title: 'PDF',
      filename: 'aula.pdf',
      mimeType: 'application/pdf',
      base64: data.toString('base64'),
    });
    expect(
      Buffer.from((await service.download(e.id, m.id, userId)).data!),
    ).toEqual(data);
    const other = await create(0, 1),
      otherEnrollment = await service.enroll(other.id, userId);
    await expect(
      service.download(otherEnrollment.id, m.id, userId),
    ).rejects.toThrow();
  });
});
