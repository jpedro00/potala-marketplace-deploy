import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { validate } from 'class-validator';
import { AnalyticsService } from './analytics.service';
import { RecordAnalyticsDto } from './analytics.dto';
import { PrismaService } from '../../database/prisma.service';

describe('Analytics input boundary', () => {
  it.each([{consent:false,event:'page_view'}, {consent:true,event:'purchase'}])('rejects unconsented or client purchases: %j', async input => {
    expect(await validate(Object.assign(new RecordAnalyticsDto(), {id:randomUUID(),sessionId:randomUUID(),...input}))).not.toHaveLength(0);
  });
});
const url = process.env.ANALYTICS_TEST_DATABASE_URL;
(url ? describe : describe.skip)('Analytics isolated PostgreSQL proof', () => {
  let db: PrismaClient, service: AnalyticsService;
  const sessions = [randomUUID(), randomUUID()];
  beforeAll(async () => {
    db = new PrismaClient({datasourceUrl:url});
    await db.$connect();
    service = new AnalyticsService(db as unknown as PrismaService);
  });
  afterAll(async () => {
    await db.analyticsEvent.deleteMany({where:{sessionId:{in:sessions}}});
    await db.analyticsConsent.deleteMany({where:{sessionId:{in:sessions}}});
    await db.$disconnect();
  });
  it('deduplicates without aborting PostgreSQL transaction and rejects conflicting IDs', async () => {
    const dto = {id:randomUUID(), sessionId:sessions[0], consent:true as const, event:'page_view' as const};
    const results = await Promise.all(Array.from({length:5}, () => service.record(dto)));
    expect(results.filter(r => !r.duplicate)).toHaveLength(1);
    await expect(service.record({...dto,event:'sign_up'})).rejects.toThrow('already used');
  }, 30000);
  it('accepts a purchase once only after consent and rejects altered totals', async () => {
    const dto = {orderId:randomUUID(),sessionId:sessions[0],valueCents:9900};
    expect(await service.purchase({...dto,sessionId:sessions[1]})).toMatchObject({accepted:false});
    expect(await service.purchase(dto)).toEqual({accepted:true,duplicate:false});
    expect(await service.purchase(dto)).toEqual({accepted:true,duplicate:true});
    await expect(service.purchase({...dto,valueCents:1})).rejects.toThrow('does not match');
  });
  it('withdrawal erases events and blocks late confirmed purchases and tracking retries', async () => {
    await service.withdraw(sessions[0]);
    await Promise.all([
      service.purchase({orderId:randomUUID(),sessionId:sessions[0],valueCents:500}),
      service.record({id:randomUUID(),sessionId:sessions[0],consent:true,event:'page_view'}),
    ]);
    expect(await db.analyticsEvent.count({where:{sessionId:sessions[0]}})).toBe(0);
    expect((await db.analyticsConsent.findUniqueOrThrow({where:{sessionId:sessions[0]}})).revokedAt).not.toBeNull();
  });
});
