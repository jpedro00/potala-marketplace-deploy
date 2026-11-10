import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ActivitiesService } from './activities.service';
const activity = {
  id: 'activity',
  sellerId: 'seller',
  status: 'PUBLISHED',
  priceCents: 0,
  capacity: 1,
  enrollmentDeadline: new Date(Date.now() + 3600000),
};
function fixture() {
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'activity' }]),
    activity: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(activity),
      update: jest.fn(),
    },
    enrollment: {
      updateMany: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest
        .fn()
        .mockImplementation(({ data }) => ({ id: 'enrollment', ...data })),
      update: jest.fn(),
    },
    activityMaterial: { findFirst: jest.fn(), findMany: jest.fn() },
    materialAccess: { create: jest.fn() },
  };
  const prisma: any = { ...tx, $transaction: jest.fn((fn) => fn(tx)) };
  return { service: new ActivitiesService(prisma), tx, prisma };
}
describe('Activities authorization and capacity', () => {
  it('confirms a free enrollment under a database row lock', async () => {
    const { service, tx } = fixture();
    const result = await service.enroll('activity', 'user');
    expect(result.status).toBe('CONFIRMED');
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.enrollment.create).toHaveBeenCalledTimes(1);
  });
  it('returns existing enrollment on retry without consuming another seat', async () => {
    const { service, tx } = fixture();
    tx.enrollment.findFirst.mockResolvedValue({
      id: 'existing',
      status: 'CONFIRMED',
    });
    expect(await service.enroll('activity', 'user')).toMatchObject({
      id: 'existing',
    });
    expect(tx.enrollment.count).not.toHaveBeenCalled();
    expect(tx.enrollment.create).not.toHaveBeenCalled();
  });
  it('rejects exhausted capacity', async () => {
    const { service, tx } = fixture();
    tx.enrollment.count.mockResolvedValue(1);
    await expect(service.enroll('activity', 'user')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.enrollment.create).not.toHaveBeenCalled();
  });
  it('reserves paid seats without granting access and clears expired reservations first', async () => {
    const { service, tx } = fixture();
    tx.activity.findUniqueOrThrow.mockResolvedValue({
      ...activity,
      priceCents: 1000,
    });
    expect(await service.enroll('activity', 'user')).toMatchObject({
      status: 'PENDING_PAYMENT',
      priceCents: 1000,
      expiresAt: expect.any(Date),
    });
    expect(tx.enrollment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING_PAYMENT' }),
      }),
    );
  });
  it('denies unpaid, cancelled and foreign enrollment material downloads', async () => {
    const { service, tx } = fixture();
    tx.enrollment.findFirst
      .mockResolvedValueOnce({ activityId: 'activity' })
      .mockResolvedValueOnce(null);
    await expect(
      service.download('enrollment', 'material', 'other-user'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.activityMaterial.findFirst).not.toHaveBeenCalled();
    expect(tx.materialAccess.create).not.toHaveBeenCalled();
  });
  it('does not leak materials from another activity', async () => {
    const { service, tx } = fixture();
    tx.enrollment.findFirst.mockResolvedValue({
      activityId: 'activity',
      status: 'CONFIRMED',
    });
    tx.activityMaterial.findFirst.mockResolvedValue(null);
    await expect(
      service.download('enrollment', 'foreign-material', 'user'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.activityMaterial.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-material', activityId: 'activity' },
    });
  });
  it('audits authorized downloads and never fetches external URLs', async () => {
    const { service, tx } = fixture();
    tx.enrollment.findFirst.mockResolvedValue({
      activityId: 'activity',
      status: 'CONFIRMED',
    });
    tx.activityMaterial.findFirst.mockResolvedValue({
      id: 'material',
      content: 'Material protegido',
      filename: 'material.txt',
    });
    expect(
      await service.download('enrollment', 'material', 'user'),
    ).toMatchObject({ content: 'Material protegido' });
    expect(tx.materialAccess.create).toHaveBeenCalledWith({
      data: { enrollmentId: 'enrollment', materialId: 'material' },
    });
  });
  it('rejects payment for another owner or amount', async () => {
    const { service, tx } = fixture();
    tx.enrollment.findUnique.mockResolvedValue({ activityId: 'activity' });
    tx.enrollment.findUniqueOrThrow.mockResolvedValue({
      userId: 'owner',
      priceCents: 2000,
      activity,
    });
    await expect(
      service.payment('e', {
        orderId: 'order',
        userId: 'attacker',
        amountCents: 2000,
        status: 'CONFIRMED',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.enrollment.update).not.toHaveBeenCalled();
  });
  it('cannot revive expired or cancelled reservations after payment', async () => {
    const { service, tx } = fixture();
    tx.enrollment.findUnique.mockResolvedValue({ activityId: 'activity' });
    tx.enrollment.findUniqueOrThrow.mockResolvedValue({
      userId: 'user',
      priceCents: 2000,
      status: 'CANCELLED',
      activity,
    });
    await expect(
      service.payment('e', {
        orderId: 'order',
        userId: 'user',
        amountCents: 2000,
        status: 'CONFIRMED',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('is idempotent for the same confirmed order', async () => {
    const { service, tx } = fixture();
    tx.enrollment.findUnique.mockResolvedValue({ activityId: 'activity' });
    const current = {
      userId: 'user',
      priceCents: 2000,
      status: 'CONFIRMED',
      orderId: 'order',
      activity,
    };
    tx.enrollment.findUniqueOrThrow.mockResolvedValue(current);
    expect(
      await service.payment('e', {
        orderId: 'order',
        userId: 'user',
        amountCents: 2000,
        status: 'CONFIRMED',
      }),
    ).toEqual(current);
    expect(tx.enrollment.update).not.toHaveBeenCalled();
  });
  it('seller cannot cancel an activity belonging to another store', async () => {
    const { service, tx } = fixture();
    await expect(
      service.setStatus('activity', 'CANCELLED', 'foreign-seller'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.enrollment.updateMany).not.toHaveBeenCalled();
  });
});
