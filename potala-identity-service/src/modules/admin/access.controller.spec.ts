import { AccessController } from './access.controller';
import { PrismaService } from '../../database/prisma.service';
const actor = { id: '11111111-1111-4111-8111-111111111111' };
function fixture() {
  const tx = {
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'target' }) },
    adminAccessRole: { upsert: jest.fn().mockResolvedValue({ id: 'role' }) },
    adminAccessGrant: {
      create: jest.fn().mockResolvedValue({ id: 'grant' }),
      update: jest.fn().mockResolvedValue({ id: 'grant' }),
    },
    adminAccessAudit: { create: jest.fn().mockResolvedValue({ id: 'audit' }) },
  };
  const prisma = { ...tx, $transaction: jest.fn((fn) => fn(tx)) };
  return {
    controller: new AccessController(prisma as unknown as PrismaService),
    tx,
    prisma,
  };
}
describe('transactional administrative access audit', () => {
  test.each(['ROLE_UPSERT', 'GRANT_CREATE', 'GRANT_REVOKE'])(
    '%s records technical actor and target in the same transaction',
    async (action) => {
      const { controller, tx, prisma } = fixture();
      if (action === 'ROLE_UPSERT')
        await (controller.role as Function)(
          '1',
          {
            name: 'Private profile name',
            permissions: ['reports:operational:export'],
          },
          actor,
        );
      else if (action === 'GRANT_CREATE')
        await (controller.grant as Function)(
          {
            userId: 'target',
            roleId: 'role',
            scopeType: 'GLOBAL',
            sellerIds: [],
          },
          actor,
        );
      else await (controller.revoke as Function)('grant', actor);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.adminAccessAudit.create).toHaveBeenCalledWith({
        data: {
          actorUserId: actor.id,
          action,
          targetId: action === 'ROLE_UPSERT' ? 'role' : 'grant',
        },
      });
      expect(
        JSON.stringify(tx.adminAccessAudit.create.mock.calls),
      ).not.toContain('Private profile name');
    },
  );
  test('audit write failure fails the entire transactional mutation', async () => {
    const { controller, tx } = fixture();
    tx.adminAccessAudit.create.mockRejectedValue(
      new Error('audit unavailable'),
    );
    await expect(
      (controller.role as Function)(
        '1',
        { name: 'Operations', permissions: ['reports:operational:export'] },
        actor,
      ),
    ).rejects.toThrow('audit unavailable');
  });
});
