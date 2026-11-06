import { PrismaClient, Role, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { readAdminSeedCredentials } from '../src/config/env.validation';

const prisma = new PrismaClient();

/**
 * Safest seed policy:
 * - no user → create admin
 * - user already ADMIN → idempotent skip
 * - user exists without ADMIN → fail (never auto-escalate privileges)
 */
type AdminSeedAction = 'create' | 'skip' | 'reject';

function resolveAdminSeedAction(
  existing: { roles: Array<{ role: Role }> } | null,
): AdminSeedAction {
  if (!existing) {
    return 'create';
  }
  if (existing.roles.some((item) => item.role === Role.ADMIN)) {
    return 'skip';
  }
  return 'reject';
}

async function main(): Promise<void> {
  const { email, password, name } = readAdminSeedCredentials();

  const existing = await prisma.user.findUnique({
    where: { email },
    include: { roles: true, profile: true, adminProfile: true },
  });

  const action = resolveAdminSeedAction(existing);

  if (action === 'skip') {
    console.log(`Admin user already exists for ${email}. Skipping seed.`);
    return;
  }

  if (action === 'reject') {
    throw new Error(
      `User ${email} already exists without the ADMIN role. Refusing to escalate privileges. Resolve manually.`,
    );
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
  });

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    await tx.userRole.create({
      data: {
        userId: user.id,
        role: Role.ADMIN,
      },
    });

    await tx.userProfile.create({
      data: {
        userId: user.id,
        fullName: name,
      },
    });

    await tx.adminProfile.create({
      data: {
        userId: user.id,
      },
    });
  });

  console.log(`Administrator seeded: ${email}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
