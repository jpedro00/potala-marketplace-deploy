import {
  BadRequestException,
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
const details = {
  instructors: [{ name: 'Ana', bio: 'Professora convidada.' }],
  modality: 'ONLINE',
  meetingUrl: 'https://meet.example.com/room',
};
const draft = () =>
  ({
    title: 'Curso',
    description: 'Descrição',
    kind: 'COURSE',
    priceCents: 0,
    capacity: 10,
    timezone: 'America/Sao_Paulo',
    enrollmentDeadline: new Date(Date.now() + 3600000).toISOString(),
    sessions: [
      {
        title: 'Aula',
        startsAt: new Date(Date.now() + 7200000).toISOString(),
        endsAt: new Date(Date.now() + 10800000).toISOString(),
      },
    ],
  }) as any;
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
  it('updates only metadata on a legacy activity with enrollment history under a row lock', async () => {
    const { service, tx } = fixture();
    tx.activity.update.mockImplementation(({ data }: any) => ({
      ...activity,
      ...data,
    }));
    expect(
      await service.updateDetails('activity', details as any, 'seller'),
    ).toMatchObject(details);
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.activity.update.mock.calls[0][0].data).not.toHaveProperty(
      'priceCents',
    );
  });
  it('rejects protected fields and foreign sellers in metadata updates', async () => {
    const { service } = fixture();
    await expect(
      service.updateDetails(
        'activity',
        { ...details, priceCents: 1 } as any,
        'seller',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateDetails('activity', details as any, 'foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('saves an incomplete legacy draft and structured instructor details without manufacturing data', async () => {
    const { service, prisma } = fixture();
    prisma.activity.create = jest.fn(({ data }) => Promise.resolve(data));
    expect(await service.create(draft(), 'seller')).not.toHaveProperty(
      'modality',
    );
    expect(
      await service.create({ ...draft(), ...details }, 'seller'),
    ).toMatchObject(details);
  });
  it.each([
    'javascript:alert(1)',
    'http://meet.example.com',
    'https://user:pass@meet.example.com',
    'https://localhost/room',
    'https://127.0.0.1/room',
    'https://localhost./room',
    'https://foo.local./room',
    'https://0x7f000001/room',
    'https://2130706433/room',
  ])('rejects unsafe meeting URL %s even in drafts', async (meetingUrl) => {
    const { service } = fixture();
    await expect(
      service.create({ ...draft(), meetingUrl }, 'seller'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each([
    {
      modality: 'IN_PERSON',
      venue: 'Sala principal, Rua Central 10',
      meetingUrl: null,
    },
    {
      modality: 'ONLINE',
      venue: null,
      meetingUrl: 'https://meet.example.com/room',
    },
    {
      modality: 'HYBRID',
      venue: 'Sala principal',
      meetingUrl: 'https://meet.example.com/room',
    },
  ])('publishes complete $modality activity', async (fields) => {
    const { service, tx } = fixture();
    tx.activity.findUniqueOrThrow.mockResolvedValue({
      ...activity,
      ...details,
      ...fields,
    });
    await service.setStatus('activity', 'PUBLISHED', 'seller');
    expect(tx.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity' },
      data: { status: 'PUBLISHED' },
    });
  });
  it.each([
    { modality: 'IN_PERSON', venue: null },
    { modality: 'ONLINE', meetingUrl: null },
    { modality: 'HYBRID', venue: null },
    { modality: 'HYBRID', venue: 'Sala', meetingUrl: null },
    { instructors: [] },
    { instructors: [{ name: 'Ana', bio: ' ' }] },
  ])('rejects incomplete publication %j', async (fields) => {
    const { service, tx } = fixture();
    tx.activity.findUniqueOrThrow.mockResolvedValue({
      ...activity,
      ...details,
      ...fields,
    });
    await expect(
      service.setStatus('activity', 'PUBLISHED', 'seller'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.activity.update).not.toHaveBeenCalled();
  });
  it('rejects foreign seller detail updates before changing sessions', async () => {
    const { service } = fixture();
    await expect(
      service.update('activity', { ...draft(), ...details }, 'foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('requires structured location and instructors before publication', async () => {
    const { service } = fixture();
    await expect(
      service.setStatus('activity', 'PUBLISHED', 'seller'),
    ).rejects.toThrow('modalidade');
  });
  it('never exposes the meeting link on public detail', async () => {
    const { service, prisma } = fixture();
    prisma.activity.findFirst = jest.fn().mockResolvedValue({
      ...activity,
      meetingUrl: 'https://meet.example.com/private',
    });
    expect(await service.get('activity')).not.toHaveProperty('meetingUrl');
    expect(await service.get('activity', 'seller')).toHaveProperty(
      'meetingUrl',
    );
  });
  it('never exposes the meeting link in public listing', async () => {
    const { service, prisma } = fixture();
    prisma.activity.findMany = jest
      .fn()
      .mockResolvedValue([
        { ...activity, meetingUrl: 'https://meet.example.com/private' },
      ]);
    expect((await service.list()).items[0]).not.toHaveProperty('meetingUrl');
    expect((await service.list(undefined, 'seller')).items[0]).toHaveProperty(
      'meetingUrl',
    );
    expect(
      (await service.list(undefined, undefined, true)).items[0],
    ).toHaveProperty('meetingUrl');
  });
  it('hides the meeting link when a confirmed activity is suspended', async () => {
    const { service, prisma } = fixture();
    prisma.enrollment.findMany = jest.fn().mockResolvedValue([
      {
        id: 'enrollment',
        status: 'CONFIRMED',
        activity: {
          ...activity,
          status: 'DRAFT',
          meetingUrl: 'https://meet.example.com/private',
        },
      },
    ]);
    expect((await service.mine('user')).items[0].activity).not.toHaveProperty(
      'meetingUrl',
    );
  });
  it('hides the meeting link for pending or cancelled enrollments', async () => {
    const { service, prisma } = fixture();
    prisma.enrollment.findMany = jest.fn().mockResolvedValue(
      ['CONFIRMED', 'PENDING_PAYMENT', 'CANCELLED'].map((status) => ({
        id: status,
        status,
        activity: {
          ...activity,
          meetingUrl: 'https://meet.example.com/private',
        },
      })),
    );
    const result = await service.mine('user');
    expect(result.items[0].activity).toHaveProperty('meetingUrl');
    expect(result.items[1].activity).not.toHaveProperty('meetingUrl');
    expect(result.items[2].activity).not.toHaveProperty('meetingUrl');
  });
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
