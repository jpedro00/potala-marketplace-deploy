import { BadRequestException, ConflictException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AnalyticsPeriodDto, PurchaseAnalyticsDto, RecordAnalyticsDto } from './analytics.dto';

const RETENTION_DAYS = 30;

@Injectable()
export class AnalyticsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsService.name);
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.prune();
    this.cleanupTimer = setInterval(() => { void this.prune(); }, 86400000);
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async record(dto: RecordAnalyticsDto) {
    return this.locked(dto.sessionId, async (tx) => {
    const consent = await tx.analyticsConsent.upsert({
      where: { sessionId: dto.sessionId }, create: { sessionId: dto.sessionId }, update: {},
    });
    if (consent.revokedAt) return { accepted: false, duplicate: false };
      const inserted = await tx.analyticsEvent.createMany({ skipDuplicates: true, data: [{
        id: dto.id, sessionId: dto.sessionId, event: dto.event,
        productId: dto.productId, activityId: dto.activityId, quantity: dto.quantity,
      }] });
      if (inserted.count) return { accepted: true, duplicate: false };
      const existing = await tx.analyticsEvent.findUnique({ where: { id: dto.id } });
      if (!existing || existing.sessionId !== dto.sessionId || existing.event !== dto.event
        || existing.productId !== (dto.productId ?? null) || existing.activityId !== (dto.activityId ?? null)
        || existing.quantity !== (dto.quantity ?? null)) {
        throw new ConflictException('Analytics event id already used');
      }
      return { accepted: true, duplicate: true };
    });
  }

  async purchase(dto: PurchaseAnalyticsDto) {
    return this.locked(dto.sessionId, async (tx) => {
    const consent = await tx.analyticsConsent.findUnique({ where: { sessionId: dto.sessionId } });
    if (!consent || consent.revokedAt) return { accepted: false, duplicate: false };
      const inserted = await tx.analyticsEvent.createMany({ skipDuplicates: true, data: [{
        event: 'purchase', orderId: dto.orderId, sessionId: dto.sessionId, valueCents: dto.valueCents,
      }] });
      if (inserted.count) return { accepted: true, duplicate: false };
      const existing = await tx.analyticsEvent.findUnique({ where: { orderId: dto.orderId } });
      if (!existing || existing.sessionId !== dto.sessionId || existing.valueCents !== dto.valueCents) {
        throw new ConflictException('Purchase analytics does not match recorded order');
      }
      return { accepted: true, duplicate: true };
    });
  }

  async withdraw(sessionId: string) {
    return this.locked(sessionId, async (tx) => {
      await tx.analyticsConsent.upsert({ where: { sessionId },
        create: { sessionId, revokedAt: new Date() }, update: { revokedAt: new Date() } });
      await tx.analyticsEvent.deleteMany({ where: { sessionId } });
      return { withdrawn: true };
    });
  }

  private locked<T>(sessionId: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`analytics:${sessionId}`}, 0))`);
      return work(tx);
    }, { maxWait: 10000, timeout: 10000 });
  }

  async summary(dto: AnalyticsPeriodDto) {
    const to = dto.to ? new Date(dto.to) : new Date();
    const from = dto.from ? new Date(dto.from) : new Date(to.getTime() - 7 * 86400000);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) {
      throw new BadRequestException('Invalid analytics period');
    }
    const groups = await this.prisma.analyticsEvent.groupBy({
      by: ['event'], where: { occurredAt: { gte: from, lte: to } },
      _count: { _all: true }, _sum: { valueCents: true },
    });
    const sessions = await this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COUNT(DISTINCT "sessao_anonima") AS total FROM "catalog"."eventos_analytics"
      WHERE "ocorrido_em" >= ${from} AND "ocorrido_em" <= ${to}
    `);
    return {
      from: from.toISOString(), to: to.toISOString(), retentionDays: RETENTION_DAYS,
      sessions: Number(sessions[0]?.total ?? 0),
      events: groups.map((group) => ({ event: group.event, count: group._count._all,
        valueCents: group._sum.valueCents ?? 0 })),
    };
  }

  private async prune() {
    try {
      await this.prisma.analyticsEvent.deleteMany({ where: {
        occurredAt: { lt: new Date(Date.now() - RETENTION_DAYS * 86400000) },
      } });
      await this.prisma.analyticsConsent.deleteMany({ where: {
        createdAt: { lt: new Date(Date.now() - RETENTION_DAYS * 86400000) },
      } });
    } catch {
      this.logger.warn('Analytics retention cleanup failed; retry scheduled');
    }
  }
}
