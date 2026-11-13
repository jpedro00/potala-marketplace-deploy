import { randomBytes, randomUUID, createDecipheriv } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RecoveryService, actionHash } from './recovery.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { createConfigMock } from '../../test-utils/prisma.mock';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';

// Explicit opt-in and fixed disposable database guard: never run against developer/production data.
const run =
  process.env.RUN_IDENTITY_POSTGRES === '1' ? describe : describe.skip;
run('account actions and notifications (native PostgreSQL)', () => {
  const prisma = new PrismaService();
  const notifications = new NotificationsService(prisma);
  const passwords = new PasswordService();
  const recovery = new RecoveryService(prisma, notifications, passwords);
  const sessions = new SessionService(
    prisma,
    createConfigMock() as unknown as ConfigService<AppConfig, true>,
  );
  const ids: string[] = [];
  const oldEnv = { ...process.env };
  const originalFetch = global.fetch;
  let mail: jest.Mock;

  function decrypt(value: string) {
    const [iv, tag, content] = value
      .split('.')
      .map((v) => Buffer.from(v, 'base64'));
    const cipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(process.env.NOTIFICATION_ENCRYPTION_KEY!, 'base64'),
      iv,
    );
    cipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([cipher.update(content), cipher.final()]).toString(),
    ) as { link: string };
  }
  async function user() {
    const row = await prisma.user.create({
      data: {
        email: `proof-${randomUUID()}@example.invalid`,
        passwordHash: await passwords.hash('old-password'),
        status: 'ACTIVE',
      },
    });
    ids.push(row.id);
    return row;
  }
  async function token(userId: string, purpose = 'PASSWORD_RESET') {
    const row = await prisma.notification.findFirstOrThrow({
      where: { userId, template: purpose },
      orderBy: { createdAt: 'desc' },
    });
    const link = decrypt(row.encryptedPayload!).link;
    return new URLSearchParams(new URL(link).hash.slice(1)).get('token')!;
  }

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      url.hostname !== '127.0.0.1' ||
      url.port !== '55434' ||
      url.pathname !== '/potala_completion'
    )
      throw new Error('Refusing non-disposable PostgreSQL');
    await prisma.$connect();
  });
  beforeEach(() => {
    process.env.ACCOUNT_ACTION_ORIGIN = 'http://localhost:3100';
    process.env.NOTIFICATION_ENCRYPTION_KEY =
      randomBytes(32).toString('base64');
    process.env.BREVO_API_KEY = 'mock-only';
    process.env.BREVO_SENDER_EMAIL = 'sender@example.invalid';
    mail = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: 'mock-provider-id' }),
    });
    global.fetch = mail as typeof fetch;
  });
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { id: { in: ids.splice(0) } } });
  });
  afterAll(async () => {
    global.fetch = originalFetch;
    process.env = oldEnv;
    await prisma.$disconnect();
  });

  it('returns identical public results, stores only hashes/encrypted links and rejects hostile origins', async () => {
    const account = await user();
    const exists = await recovery.request(account.email, 'PASSWORD_RESET');
    expect(
      await recovery.request('missing@example.invalid', 'PASSWORD_RESET'),
    ).toEqual(exists);
    expect(JSON.stringify(exists)).not.toMatch(/token|proof-/);
    await expect(
      recovery.request(account.email, 'PASSWORD_RESET', 'https://evil.invalid'),
    ).rejects.toThrow('Unsafe callback');
    const raw = await token(account.id);
    const stored = await prisma.accountActionToken.findUniqueOrThrow({
      where: { tokenHash: actionHash(raw) },
    });
    expect(JSON.stringify(stored)).not.toContain(raw);
    const notice = await prisma.notification.findFirstOrThrow({
      where: { userId: account.id },
    });
    expect(notice.encryptedPayload).not.toContain(raw);
    const inbox = await notifications.inbox(account.id);
    expect(JSON.stringify(inbox)).not.toContain(raw);
    expect(JSON.stringify(inbox)).not.toContain('encryptedPayload');
  });

  it('consumes reset once under concurrency, changes password and revokes every session', async () => {
    const account = await user();
    await prisma.session.createMany({
      data: [1, 2].map(() => ({
        userId: account.id,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60000),
      })),
    });
    await recovery.request(account.email, 'PASSWORD_RESET');
    const raw = await token(account.id);
    const results = await Promise.allSettled([
      recovery.consume(raw, 'PASSWORD_RESET', 'new-password'),
      recovery.consume(raw, 'PASSWORD_RESET', 'other-password'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.session.count({
        where: { userId: account.id, revokedAt: null },
      }),
    ).toBe(0);
    const changed = await prisma.user.findUniqueOrThrow({
      where: { id: account.id },
    });
    expect(await passwords.verify(changed.passwordHash, 'old-password')).toBe(
      false,
    );
    // A login that verified the old hash before reset must not resurrect a session.
    await expect(
      sessions.createSession(account.id, account.passwordHash),
    ).rejects.toThrow('Invalid credentials');
    await expect(
      recovery.consume(raw, 'PASSWORD_RESET', 'replay-password'),
    ).rejects.toThrow();
  });

  it('rejects expired and wrong-purpose tokens; confirmation activates only its user', async () => {
    const account = await user();
    await prisma.user.update({
      where: { id: account.id },
      data: { status: 'PENDING_VERIFICATION' },
    });
    await recovery.request(account.email, 'EMAIL_CONFIRMATION');
    const raw = await token(account.id, 'EMAIL_CONFIRMATION');
    await expect(
      recovery.consume(raw, 'PASSWORD_RESET', 'attacker-password'),
    ).rejects.toThrow();
    await recovery.consume(raw, 'EMAIL_CONFIRMATION');
    const verified = await prisma.user.findUniqueOrThrow({
      where: { id: account.id },
    });
    expect(verified.emailVerifiedAt).not.toBeNull();
    expect(verified.status).toBe('ACTIVE');
    await recovery.request(account.email, 'PASSWORD_RESET');
    const reset = await token(account.id);
    await prisma.accountActionToken.update({
      where: { tokenHash: actionHash(reset) },
      data: { expiresAt: new Date(0) },
    });
    await expect(
      recovery.consume(reset, 'PASSWORD_RESET', 'new-password'),
    ).rejects.toThrow();
  });

  it('scopes inbox/read to owner, deduplicates events, and sends only to resolved user email', async () => {
    const account = await user();
    const other = await user();
    const key = randomUUID();
    const a = await notifications.enqueue(account.id, 'ORDER_CREATED', key);
    expect(
      await notifications.enqueue(account.id, 'ORDER_CREATED', key),
    ).toEqual(a);
    await expect(
      notifications.enqueue(other.id, 'ORDER_CREATED', key),
    ).rejects.toThrow('Idempotency');
    expect(await notifications.inbox(other.id)).toHaveLength(0);
    await notifications.read(other.id, a.id);
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: a.id } }))
        .readAt,
    ).toBeNull();
    await Promise.all([notifications.dispatch(), notifications.dispatch()]);
    expect(mail).toHaveBeenCalledTimes(1);
    const request = JSON.parse(mail.mock.calls[0][1].body as string) as {
      to: { email: string }[];
    };
    expect(request.to).toEqual([{ email: account.email }]);
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: a.id } }))
        .status,
    ).toBe('SENT');
  });

  it('recovers an expired process lease and terminates a crashed fifth attempt without resending', async () => {
    const account = await user();
    const notice = await notifications.enqueue(
      account.id,
      'ORDER_CREATED',
      randomUUID(),
    );
    await prisma.notification.update({
      where: { id: notice.id },
      data: { attempts: 1, lockedUntil: new Date(Date.now() + 60000) },
    });
    await notifications.dispatch();
    expect(mail).not.toHaveBeenCalled();
    await prisma.notification.update({
      where: { id: notice.id },
      data: { lockedUntil: new Date(0) },
    });
    await notifications.dispatch();
    expect(mail).toHaveBeenCalledTimes(1);
    const terminal = await notifications.enqueue(
      account.id,
      'ORDER_SHIPPED',
      randomUUID(),
    );
    await prisma.notification.update({
      where: { id: terminal.id },
      data: { attempts: 5, lockedUntil: new Date(0) },
    });
    await notifications.dispatch();
    expect(
      (
        await prisma.notification.findUniqueOrThrow({
          where: { id: terminal.id },
        })
      ).status,
    ).toBe('FAILED');
    expect(mail).toHaveBeenCalledTimes(1);
  });

  it('never fabricates sent state when transport is missing or rejects; bounds retries', async () => {
    const account = await user();
    const notice = await notifications.enqueue(
      account.id,
      'ORDER_CREATED',
      randomUUID(),
    );
    delete process.env.BREVO_API_KEY;
    await expect(notifications.dispatch()).rejects.toThrow('not configured');
    expect(
      (
        await prisma.notification.findUniqueOrThrow({
          where: { id: notice.id },
        })
      ).status,
    ).toBe('QUEUED');
    process.env.BREVO_API_KEY = 'mock-only';
    mail.mockResolvedValue({ ok: false });
    for (let attempt = 0; attempt < 5; attempt++) {
      await prisma.notification.update({
        where: { id: notice.id },
        data: { nextAttemptAt: new Date(0) },
      });
      await notifications.dispatch();
    }
    const failed = await prisma.notification.findUniqueOrThrow({
      where: { id: notice.id },
    });
    expect(failed.status).toBe('FAILED');
    expect(failed.sentAt).toBeNull();
    expect(failed.attempts).toBe(5);
    await notifications.dispatch();
    expect(mail).toHaveBeenCalledTimes(5);
  });
});
