import { Prisma } from '@prisma/client';
import { Workbook } from 'exceljs';
import { REPORTS, ReportsService, safeCell, csv } from './reports.service';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
const seller = '12345678-1234-4234-9234-123456789012';
const other = '22345678-1234-4234-9234-123456789012';
const user = {
  id: seller,
  roles: ['ADMIN'],
  status: 'ACTIVE',
  isSuperAdmin: false,
  grants: [
    {
      grantId: other,
      roleKey: '1',
      permissions: ['reports:operational:export'],
      scope: { type: 'SELLERS', sellerIds: [seller] },
      expiresAt: null,
    },
  ],
} as AuthenticatedUser;
describe('server report boundaries', () => {
  test('every view selects only fields that exist in its owning domain', () => {
    for (const view of Object.values(REPORTS)) {
      const model = Prisma.dmmf.datamodel.models.find(
        (m) => m.name.toLowerCase() === view.model.toLowerCase(),
      );
      expect(model).toBeDefined();
      for (const field of view.fields)
        expect(model?.fields.some((f) => f.name === field)).toBe(true);
    }
  });
  test.each(['=SUM(A1:A2)', ' \t+cmd', '@evil', '-1'])(
    'protects formula string %s',
    (input) => expect(safeCell(input)).toBe("'" + input),
  );
  test('quotes delimiters and newlines', () =>
    expect(csv([{ x: 'a,"b\n' }], ['x'])).toContain('"a,""b\n"'));
  test('filters scoped export in database and rejects other sellers and global views', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ReportsService({
      sellerOrder: { findMany },
    } as unknown as PrismaService);
    await service.rows(user, 'sales', {});
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sellerId: { in: [seller] } },
        take: 10001,
      }),
    );
    await expect(
      service.rows(user, 'sales', { sellerId: other }),
    ).rejects.toThrow('Seller outside');
    await expect(service.rows(user, 'orders', {})).rejects.toThrow('GLOBAL');
  });
  test('does not export only UI page and refuses truncation beyond limit', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue(Array.from({ length: 10001 }, () => ({ id: 'x' })));
    const service = new ReportsService({
      sellerOrder: { findMany },
    } as unknown as PrismaService);
    await expect(service.rows(user, 'sales', {})).rejects.toThrow('10000');
  });
  test('rejects expired/revoked/legacy claims', () => {
    const service = new ReportsService({} as PrismaService);
    expect(() => service.scope({ ...user, grants: undefined })).toThrow();
    expect(() =>
      service.scope({
        ...user,
        grants: [
          {
            ...(user.grants as object[])[0],
            expiresAt: '2000-01-01T00:00:00Z',
          },
        ],
      }),
    ).toThrow();
  });
  test('real XLSX roundtrip keeps cells literal strings and rows beyond UI pagination', async () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({
      id: String(i),
      status: 'PAID',
      unitPriceCents: 123,
      productTitle: '=cmd',
    }));
    const service = new ReportsService({
      orderItem: { findMany: jest.fn().mockResolvedValue(rows) },
    } as unknown as PrismaService);
    const output = await service.export(user, 'items', {}, 'xlsx');
    const workbook = new Workbook();
    await workbook.xlsx.load(output as never);
    expect(workbook.worksheets[0].rowCount).toBe(151);
    expect(workbook.worksheets[0].getRow(2).getCell(7).value).toBe(123);
    expect(workbook.worksheets[0].getRow(2).getCell(4).value).toBe("'=cmd");
  });
});
