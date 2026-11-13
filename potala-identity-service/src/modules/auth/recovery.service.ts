import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PasswordService } from './password.service';

export const actionHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class RecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly passwords: PasswordService,
  ) {}

  ensureConfigured() {
    this.origin();
    this.notifications.encrypt({ link: '' });
    if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL)
      throw new ServiceUnavailableException(
        'Email transport is not configured',
      );
  }

  private origin(callbackOrigin?: string) {
    let origin: URL;
    try {
      origin = new URL(process.env.ACCOUNT_ACTION_ORIGIN || '');
    } catch {
      throw new ServiceUnavailableException(
        'Account action origin is not configured',
      );
    }
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash ||
      (origin.protocol !== 'https:' &&
        !['localhost', '127.0.0.1'].includes(origin.hostname))
    )
      throw new ServiceUnavailableException(
        'Invalid configured account origin',
      );
    if (callbackOrigin && callbackOrigin !== origin.origin)
      throw new BadRequestException('Unsafe callback origin');
    return origin.origin;
  }

  async request(
    email: string,
    purpose: 'PASSWORD_RESET' | 'EMAIL_CONFIRMATION',
    callbackOrigin?: string,
  ) {
    const origin = this.origin(callbackOrigin);
    // Configuration is checked before lookup so unavailable mail cannot reveal account existence.
    this.notifications.encrypt({ link: '' });
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (
      user &&
      user.status !== UserStatus.BLOCKED &&
      !(purpose === 'EMAIL_CONFIRMATION' && user.emailVerifiedAt)
    ) {
      const token = randomBytes(32).toString('base64url');
      const tokenHash = actionHash(token);
      const path =
        purpose === 'PASSWORD_RESET' ? '/redefinir-senha' : '/confirmar-email';
      // Fragment keeps the credential out of access logs and Referer headers.
      const encryptedPayload = this.notifications.encrypt({
        link: `${origin}${path}#token=${token}`,
      });
      await this.prisma.$transaction(async (tx) => {
        // Serialize requests for this account (including concurrent token issuance).
        await tx.$queryRaw`SELECT id FROM identity.usuarios WHERE id = ${user.id}::uuid FOR UPDATE`;
        const recent = await tx.accountActionToken.findFirst({
          where: {
            userId: user.id,
            purpose,
            createdAt: { gt: new Date(Date.now() - 60000) },
          },
        });
        if (recent) return;
        await tx.accountActionToken.updateMany({
          where: { userId: user.id, purpose, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        await tx.accountActionToken.create({
          data: {
            userId: user.id,
            purpose,
            tokenHash,
            expiresAt: new Date(
              Date.now() +
                (purpose === 'PASSWORD_RESET' ? 30 * 60000 : 24 * 3600000),
            ),
          },
        });
        await this.notifications.enqueue(
          user.id,
          purpose,
          `account-action:${tokenHash}`,
          encryptedPayload,
          tx,
        );
      });
    }
    return {
      message:
        'Se a conta estiver elegível, as instruções serão encaminhadas. A entrega depende do serviço de e-mail.',
    };
  }

  async consume(
    token: string,
    purpose: 'PASSWORD_RESET' | 'EMAIL_CONFIRMATION',
    password?: string,
  ) {
    const tokenHash = actionHash(token);
    const passwordHash =
      purpose === 'PASSWORD_RESET'
        ? await this.passwords.hash(password!)
        : undefined;
    await this.prisma.$transaction(async (tx) => {
      const candidate = await tx.accountActionToken.findUnique({
        where: { tokenHash },
      });
      if (!candidate || candidate.purpose !== purpose)
        throw new BadRequestException('Link inválido ou expirado');
      await tx.$queryRaw`SELECT id FROM identity.usuarios WHERE id = ${candidate.userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: candidate.userId },
      });
      if (user.status === UserStatus.BLOCKED)
        throw new BadRequestException('Link inválido ou expirado');
      const consumed = await tx.accountActionToken.updateMany({
        where: {
          id: candidate.id,
          purpose,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1)
        throw new BadRequestException('Link inválido ou expirado');
      if (purpose === 'PASSWORD_RESET') {
        await tx.user.update({
          where: { id: candidate.userId },
          data: { passwordHash },
        });
        await tx.session.updateMany({
          where: { userId: candidate.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.accountActionToken.updateMany({
          where: { userId: candidate.userId, purpose, consumedAt: null },
          data: { consumedAt: new Date() },
        });
      } else {
        await tx.user.update({
          where: { id: candidate.userId },
          data: {
            emailVerifiedAt: new Date(),
            ...(user.status === UserStatus.PENDING_VERIFICATION
              ? { status: UserStatus.ACTIVE }
              : {}),
          },
        });
      }
      await this.notifications.enqueue(
        candidate.userId,
        purpose === 'PASSWORD_RESET' ? 'PASSWORD_CHANGED' : 'EMAIL_CONFIRMED',
        `account-completed:${candidate.id}`,
        undefined,
        tx,
      );
    });
    return { ok: true };
  }
}
