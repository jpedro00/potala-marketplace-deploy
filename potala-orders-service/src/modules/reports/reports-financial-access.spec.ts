import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Workbook } from 'exceljs';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
const seller = '12345678-1234-4234-9234-123456789012';
const other = '22345678-1234-4234-9234-123456789012';
const op = 'reports:operational:export',
  finance = 'reports:financial:export';
function grant(permission: string, sellerIds?: string[], extra: object = {}) {
  return {
    grantId: seller,
    roleKey: 'reports',
    permissions: [permission],
    scope: sellerIds ? { type: 'SELLERS', sellerIds } : { type: 'GLOBAL' },
    expiresAt: null,
    ...extra,
  };
}
function identity(grants: object[]): AuthenticatedUser {
  return {
    id: seller,
    roles: ['ADMIN'],
    status: 'ACTIVE',
    isSuperAdmin: false,
    grants,
  } as AuthenticatedUser;
}
describe('financial report permission HTTP boundary', () => {
  let app: INestApplication;
  let user = identity([]);
  const findMany = jest.fn();
  beforeAll(async () => {
    const service = new ReportsService(
      Object.fromEntries(
        ['sellerOrder', 'paymentTransaction', 'refundRequest'].map((model) => [
          model,
          { findMany },
        ]),
      ) as unknown as PrismaService,
    );
    const module = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [{ provide: ReportsService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    app.use(
      (
        req: { authUser: AuthenticatedUser },
        _res: unknown,
        next: () => void,
      ) => {
        req.authUser = user;
        next();
      },
    );
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
  test.each(['sales', 'payments', 'refunds', 'payouts'])(
    'operational GLOBAL alone cannot export %s',
    async (view) => {
      user = identity([grant(op)]);
      for (const format of ['csv', 'xlsx'])
        await request(app.getHttpServer())
          .get(`/admin/reports/${view}/export?format=${format}`)
          .expect(403);
      expect(findMany).not.toHaveBeenCalled();
    },
  );
  test.each([
    { expiresAt: '2000-01-01T00:00:00Z' },
    { revokedAt: '2026-01-01T00:00:00Z' },
  ])('rejects inactive finance grant %j', async (extra) => {
    user = identity([grant(op), grant(finance, undefined, extra)]);
    for (const format of ['csv', 'xlsx'])
      await request(app.getHttpServer())
        .get(`/admin/reports/payouts/export?format=${format}`)
        .expect(403);
    expect(findMany).not.toHaveBeenCalled();
  });
  test('does not combine foreign seller scopes or elevate financial scope with operational GLOBAL', async () => {
    for (const format of ['csv', 'xlsx']) {
      user = identity([grant(op, [seller]), grant(finance, [other])]);
      await request(app.getHttpServer())
        .get(`/admin/reports/sales/export?format=${format}`)
        .expect(403);
      user = identity([grant(op), grant(finance, [seller])]);
      await request(app.getHttpServer())
        .get(`/admin/reports/sales/export?format=${format}&sellerId=${other}`)
        .expect(403);
      for (const view of ['payments', 'refunds'])
        await request(app.getHttpServer())
          .get(`/admin/reports/${view}/export?format=${format}`)
          .expect(403);
    }
    expect(findMany).not.toHaveBeenCalled();
  });
  test('permits global transactions and refunds only with both effective global grants', async () => {
    user = identity([grant(op), grant(finance)]);
    for (const view of ['payments', 'refunds'])
      await request(app.getHttpServer())
        .get(`/admin/reports/${view}/export?format=csv`)
        .expect(200);
    expect(findMany).toHaveBeenCalledTimes(2);
  });
  test('requires operational permission even with financial GLOBAL', async () => {
    user = identity([grant(finance)]);
    await request(app.getHttpServer())
      .get('/admin/reports/sales/export?format=xlsx')
      .expect(403);
    expect(findMany).not.toHaveBeenCalled();
  });
  test.each(['operational', 'financial'])(
    'XLSX preserves intersection with %s GLOBAL and opposite seller scope',
    async (globalPermission) => {
      user =
        globalPermission === 'operational'
          ? identity([grant(op), grant(finance, [seller])])
          : identity([grant(op, [seller]), grant(finance)]);
      findMany.mockResolvedValue([
        {
          id: seller,
          sellerId: seller,
          orderId: other,
          status: 'CONFIRMED',
          subtotalCents: 1000,
          discountCents: 100,
          shippingCents: 0,
          commissionCents: 90,
          gatewayFeeCents: 30,
          sellerNetCents: 780,
          order: { status: 'PAID' },
        },
      ]);
      const response = await request(app.getHttpServer())
        .get('/admin/reports/payouts/export?format=xlsx')
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
          res.on('error', done);
        })
        .expect(200);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { sellerId: { in: [seller] } } }),
      );
      const workbook = new Workbook();
      await workbook.xlsx.load(response.body as never);
      const sheet = workbook.worksheets[0];
      const header = sheet.getRow(1).values as string[];
      expect(sheet.getRow(2).getCell(header.indexOf('sellerId')).value).toBe(
        seller,
      );
      expect(sheet.getRow(2).getCell(header.indexOf('payoutState')).value).toBe(
        'NOT_INTEGRATED',
      );
      expect(
        sheet.getRow(2).getCell(header.indexOf('paidPayoutCents')).value,
      ).toBe('');
    },
  );
});
