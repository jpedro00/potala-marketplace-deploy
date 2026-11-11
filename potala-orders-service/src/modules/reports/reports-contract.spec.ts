import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsDomainClient } from './reports-domain.client';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Workbook } from 'exceljs';
const seller = '12345678-1234-4234-9234-123456789012';
const other = '22345678-1234-4234-9234-123456789012';
const user = {
  id: seller,
  status: 'ACTIVE',
  roles: ['ADMIN'],
  isSuperAdmin: false,
  grants: [
    {
      grantId: other,
      roleKey: '1',
      permissions: ['reports:operational:export', 'reports:financial:export'],
      scope: { type: 'SELLERS', sellerIds: [seller] },
      expiresAt: null,
    },
  ],
} as AuthenticatedUser;
describe('contract report exports', () => {
  test('cross-domain reports enforce grant before calling source', async () => {
    const rows = jest.fn().mockResolvedValue({ rows: [], fields: ['id'] });
    const service = new ReportsService(
      {} as PrismaService,
      { rows } as unknown as ReportsDomainClient,
    );
    await expect(
      service.rows(user, 'products', { sellerId: other }),
    ).rejects.toThrow('outside');
    await expect(service.rows(user, 'customers', {})).rejects.toThrow('GLOBAL');
    expect(rows).not.toHaveBeenCalled();
    await service.rows(user, 'stock', { from: '2026-11-01T00:00:00Z' });
    expect(rows).toHaveBeenCalledWith(
      'stock',
      expect.objectContaining({
        sellerIds: [seller],
        from: '2026-11-01T00:00:00Z',
      }),
    );
  });
  test('does not forward transport parameters to strict domain DTO', async () => {
    const rows = jest.fn().mockResolvedValue({ rows: [], fields: ['id'] });
    const service = new ReportsService(
      {} as PrismaService,
      { rows } as unknown as ReportsDomainClient,
    );
    await service.rows(user, 'products', {
      sellerId: seller,
      format: 'xlsx',
    } as never);
    expect(rows).toHaveBeenCalledWith('products', {
      sellerIds: [seller],
      from: undefined,
      to: undefined,
      status: undefined,
    });
  });
  test('exports real XLSX with scoped remote rows and formula protection', async () => {
    const rows = jest.fn().mockResolvedValue({
      rows: [{ id: seller, title: '=HYPERLINK("evil")', quantity: 7 }],
      fields: ['id', 'title', 'quantity'],
    });
    const service = new ReportsService(
      {} as PrismaService,
      { rows } as unknown as ReportsDomainClient,
    );
    const buffer = await service.export(user, 'products', {}, 'xlsx');
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer as never);
    expect(workbook.worksheets[0].getCell('B2').value).toBe(
      `'=HYPERLINK("evil")`,
    );
    expect(workbook.worksheets[0].getCell('C2').value).toBe(7);
  });
  test('financial output includes gateway fees and never fabricates a paid payout', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: seller,
        subtotalCents: 1000,
        discountCents: 100,
        shippingCents: 20,
        commissionCents: 90,
        gatewayFeeCents: 30,
        sellerNetCents: 800,
        order: { status: 'PAID' },
      },
    ]);
    const service = new ReportsService({
      sellerOrder: { findMany },
    } as unknown as PrismaService);
    const result = await service.rows(user, 'payouts', {});
    expect(result.fields).toEqual(
      expect.arrayContaining([
        'gatewayFeeCents',
        'paidTurnoverCents',
        'payoutState',
        'paidPayoutCents',
      ]),
    );
    expect(result.rows[0]).toMatchObject({
      paidTurnoverCents: 920,
      payoutState: 'NOT_INTEGRATED',
      paidPayoutCents: null,
    });
  });
});
describe('bounded report source client', () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
  });
  const client = () =>
    new ReportsDomainClient({
      get: () => ({
        baseUrl: 'http://internal',
        apiKey: 'test-key',
        timeoutMs: 1000,
      }),
    } as unknown as ConfigService<AppConfig, true>);
  test('propagates filters across pages with internal authentication', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rows: [{ id: seller }], next: seller }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rows: [{ id: other }], next: null }),
      });
    global.fetch = fetch;
    const result = await client().rows('products', {
      sellerIds: [seller],
      status: 'ACTIVE',
    });
    expect(result.rows).toHaveLength(2);
    const [, options] = fetch.mock.calls[1];
    expect(JSON.parse(options.body)).toEqual({
      sellerIds: [seller],
      status: 'ACTIVE',
      after: seller,
    });
    expect(options.headers['x-internal-api-key']).toBe('test-key');
  });
  test('refuses overflow instead of truncating', async () => {
    let page = 0;
    global.fetch = jest.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        rows: Array.from({ length: 500 }, () => ({ id: seller })),
        next: String(++page),
      }),
    }));
    await expect(client().rows('products', {})).rejects.toThrow('10000');
  });
  test('fails closed on source outage and invalid pagination', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(client().rows('products', {})).rejects.toThrow('unavailable');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rows: [], next: 'cycle' }),
    });
    await expect(client().rows('products', {})).rejects.toThrow(
      'Invalid report',
    );
  });
});

describe('admin export HTTP contract', () => {
  test('strict format, grant denial and XLSX download through controller', async () => {
    const rows = jest.fn().mockResolvedValue({
      rows: [{ id: seller, title: '=1+1' }],
      fields: ['id', 'title'],
    });
    const service = new ReportsService(
      {} as PrismaService,
      { rows } as unknown as ReportsDomainClient,
    );
    const module = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [{ provide: ReportsService, useValue: service }],
    }).compile();
    const app = module.createNestApplication();
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
    try {
      await request(app.getHttpServer())
        .get(`/admin/reports/products/export?format=xlsx&sellerId=${other}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/admin/reports/customers/export')
        .expect(403);
      await request(app.getHttpServer())
        .get('/admin/reports/products/export?format=exe')
        .expect(400);
      const response = await request(app.getHttpServer())
        .get(`/admin/reports/products/export?format=xlsx&sellerId=${seller}`)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
          res.on('error', done);
        })
        .expect(200);
      expect(response.headers['content-type']).toContain('spreadsheetml');
      expect(response.headers['cache-control']).toBe('no-store');
      const workbook = new Workbook();
      await workbook.xlsx.load(response.body as never);
      expect(workbook.worksheets[0].getCell('B2').value).toBe("'=1+1");
    } finally {
      await app.close();
    }
  });
});
