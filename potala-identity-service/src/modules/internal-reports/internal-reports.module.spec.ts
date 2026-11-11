import { Test } from '@nestjs/testing';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { InternalReportsController } from './internal-reports.module';
import { PrismaService } from '../../database/prisma.service';
import { INTERNAL_API_KEY_HEADER } from '../../common/constants/auth.constants';
const seller = '12345678-1234-4234-9234-123456789012';
describe('internal report routes', () => {
  let app: INestApplication;
  const findMany = jest.fn().mockResolvedValue([]);
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [InternalReportsController],
      providers: [
        {
          provide: PrismaService,
          useValue: Object.fromEntries(
            [
              'product',
              'productVariant',
              'activity',
              'activitySession',
              'enrollment',
              'seller',
              'user',
            ].map((m) => [m, { findMany }]),
          ),
        },
        { provide: ConfigService, useValue: { get: () => 'test-report-key' } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });
  test.each(['customers'])('serves authenticated bounded %s', async (view) => {
    await request(app.getHttpServer())
      .post(`/internal/reports/${view}`)
      .set(INTERNAL_API_KEY_HEADER, 'test-report-key')
      .send({})
      .expect(200, { rows: [], next: null });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 501, orderBy: { id: 'asc' } }),
    );
    const selection = JSON.stringify(findMany.mock.calls[0][0].select);
    expect(selection).not.toMatch(
      /password|email":|documentNumber|phone|recipientRef|accountLast4/,
    );
  });
  test('rejects missing key, unknown view and unbounded parameters', async () => {
    await request(app.getHttpServer())
      .post('/internal/reports/customers')
      .send({})
      .expect(401);
    await request(app.getHttpServer())
      .post('/internal/reports/nope')
      .set(INTERNAL_API_KEY_HEADER, 'test-report-key')
      .send({})
      .expect(400);
    for (const body of [
      { take: 99999 },
      { sellerIds: Array(101).fill(seller) },
      { after: 'invalid' },
      { from: 'invalid' },
      { status: 'NOT_A_STATUS' },
    ])
      await request(app.getHttpServer())
        .post('/internal/reports/customers')
        .set(INTERNAL_API_KEY_HEADER, 'test-report-key')
        .send(body)
        .expect(400);
  });
  test('enforces domain filter and keyset continuation', async () => {
    await request(app.getHttpServer())
      .post('/internal/reports/customers')
      .set(INTERNAL_API_KEY_HEADER, 'test-report-key')
      .send({ sellerIds: [seller] })
      .expect(400);
    await request(app.getHttpServer())
      .post('/internal/reports/customers')
      .set(INTERNAL_API_KEY_HEADER, 'test-report-key')
      .send({ after: seller })
      .expect(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          roles: { some: { role: 'CUSTOMER' } },
          AND: [{ id: { gt: seller } }],
        },
      }),
    );
  });
});
