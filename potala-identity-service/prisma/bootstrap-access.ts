// Explicit operational action. Never invoked by seed or application startup.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const [id, confirmation] = process.argv.slice(2);
  if (!id || confirmation !== 'CONFIRM_SUPERADMIN')
    throw new Error(
      'Usage: npx ts-node prisma/bootstrap-access.ts <existing-admin-UUID> CONFIRM_SUPERADMIN',
    );
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: { id, status: 'ACTIVE', roles: { some: { role: 'ADMIN' } } },
      include: { adminProfile: true },
    });
    if (!user?.adminProfile)
      throw new Error(
        'Active existing ADMIN with profile required; this script never creates or upgrades customer accounts',
      );
    await tx.adminAccessAudit.create({
      data: { actorUserId: null, action: 'SUPERADMIN_BOOTSTRAP', targetId: id },
    });
    await tx.adminProfile.update({
      where: { userId: id },
      data: { isSuperAdmin: true },
    });
  });
  console.log(
    'Explicit superadmin bootstrap completed. Record operator and change ticket externally.',
  );
}
main()
  .catch(() => {
    console.error('Bootstrap refused or failed');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
