import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  notificationTemplates,
  NotificationTemplate,
} from './notification-templates';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private key() {
    const value = Buffer.from(
      process.env.NOTIFICATION_ENCRYPTION_KEY || '',
      'base64',
    );
    if (value.length !== 32)
      throw new ServiceUnavailableException(
        'Notification encryption is not configured',
      );
    return value;
  }

  encrypt(payload: { link: string }) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const content = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), content]
      .map((v) => v.toString('base64'))
      .join('.');
  }

  private decrypt(value: string): { link: string } {
    const [iv, tag, content] = value
      .split('.')
      .map((v) => Buffer.from(v, 'base64'));
    const cipher = createDecipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([cipher.update(content), cipher.final()]).toString('utf8'),
    ) as { link: string };
  }

  async enqueue(
    userId: string,
    template: NotificationTemplate,
    idempotencyKey: string,
    encryptedPayload?: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    if (!Object.prototype.hasOwnProperty.call(notificationTemplates, template))
      throw new BadRequestException('Unknown notification template');
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.status === UserStatus.BLOCKED)
      throw new BadRequestException('Recipient unavailable');
    const [title, message] = notificationTemplates[template];
    const result = await tx.notification.upsert({
      where: { idempotencyKey },
      update: {},
      create: {
        userId,
        template,
        title,
        message,
        idempotencyKey,
        encryptedPayload,
      },
      select: { id: true, status: true, userId: true, template: true },
    });
    if (result.userId !== userId || result.template !== template)
      throw new BadRequestException('Idempotency key already used');
    return { id: result.id, status: result.status };
  }

  async inbox(userId: string) {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        title: true,
        message: true,
        readAt: true,
        createdAt: true,
        template: true,
      },
    });
    return rows.map(({ template, ...row }) => ({
      ...row,
      href: /^(SELLER|DOCUMENT|REVIEW)/.test(template)
        ? '/loja'
        : /^(ORDER|PAYMENT|FISCAL)/.test(template)
          ? '/minha-conta/pedidos'
          : /^(RETURN|REFUND)/.test(template)
            ? '/minha-conta/devolucoes'
            : '/minha-conta',
    }));
  }

  async read(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  // Called by the authenticated internal scheduler. Atomic leases prevent parallel sends.
  async dispatch() {
    if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL)
      throw new ServiceUnavailableException(
        'Email transport is not configured',
      );
    const now = new Date();
    const candidates = await this.prisma.notification.findMany({
      where: {
        status: 'QUEUED',
        nextAttemptAt: { lte: now },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      take: 20,
      orderBy: { createdAt: 'asc' },
    });
    for (const row of candidates) {
      if (row.attempts >= 5) {
        await this.prisma.notification.updateMany({
          where: {
            id: row.id,
            status: 'QUEUED',
            attempts: 5,
            OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
          },
          data: { status: 'FAILED', encryptedPayload: null, lockedUntil: null },
        });
        continue;
      }
      const lease = new Date(Date.now() + 60000);
      const claimed = await this.prisma.notification.updateMany({
        where: {
          id: row.id,
          status: 'QUEUED',
          attempts: row.attempts,
          OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
        },
        data: { lockedUntil: lease, attempts: { increment: 1 } },
      });
      if (!claimed.count) continue;
      try {
        const recipient = await this.prisma.user.findUniqueOrThrow({
          where: { id: row.userId },
        });
        if (recipient.status === UserStatus.BLOCKED)
          throw new Error('Recipient unavailable');
        const payload = row.encryptedPayload
          ? this.decrypt(row.encryptedPayload)
          : null;
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          signal: AbortSignal.timeout(15000),
          headers: {
            'api-key': process.env.BREVO_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: { email: process.env.BREVO_SENDER_EMAIL, name: 'Potala' },
            to: [{ email: recipient.email }],
            subject: row.title,
            textContent: `${row.message}${payload ? `\n\n${payload.link}` : ''}`,
            headers: { IdempotencyKey: row.id },
          }),
        });
        if (!response.ok) throw new Error('Transport rejected');
        const result = (await response.json()) as { messageId?: string };
        if (!result.messageId)
          throw new Error('Transport acknowledgement missing');
        await this.prisma.notification.update({
          where: { id: row.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            providerMessageId: result.messageId,
            encryptedPayload: null,
            lockedUntil: null,
          },
        });
      } catch {
        // Never persist provider error bodies or links: both can contain secrets.
        const exhausted = row.attempts + 1 >= 5;
        await this.prisma.notification.update({
          where: { id: row.id },
          data: {
            status: exhausted ? 'FAILED' : 'QUEUED',
            lockedUntil: null,
            nextAttemptAt: new Date(Date.now() + 60000 * 2 ** row.attempts),
            ...(exhausted ? { encryptedPayload: null } : {}),
          },
        });
      }
    }
    return { processed: candidates.length };
  }
}
