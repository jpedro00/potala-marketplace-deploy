import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { parseAccessClaims } from '../../common/permissions/access-claims';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Prisma } from '@prisma/client';
import { Workbook } from 'exceljs';
export const REPORTS = {
  sales: {
    label: 'Vendas por loja',
    model: 'sellerOrder',
    seller: 'direct',
    fields: [
      'id',
      'orderId',
      'sellerId',
      'status',
      'subtotalCents',
      'shippingCents',
      'commissionCents',
      'sellerNetCents',
      'createdAt',
    ],
  },
  orders: {
    label: 'Pedidos',
    model: 'order',
    seller: 'global',
    fields: ['id', 'status', 'subtotalCents', 'totalCents', 'createdAt'],
  },
  items: {
    label: 'Itens vendidos',
    model: 'orderItem',
    seller: 'item',
    fields: [
      'id',
      'sellerOrderId',
      'productId',
      'productTitle',
      'sku',
      'quantity',
      'unitPriceCents',
      'lineTotalCents',
    ],
  },
  payments: {
    label: 'Transações',
    model: 'paymentTransaction',
    seller: 'global',
    fields: ['id', 'orderId', 'status', 'amountCents', 'createdAt'],
  },
  reviews: {
    label: 'Avaliações',
    model: 'review',
    seller: 'direct',
    fields: ['id', 'sellerId', 'productId', 'rating', 'createdAt'],
  },
  coupons: {
    label: 'Cupons',
    model: 'coupon',
    seller: 'global',
    fields: [
      'id',
      'code',
      'enabled',
      'usageCount',
      'totalDiscountCents',
      'createdAt',
    ],
  },
  returns: {
    label: 'Devoluções',
    model: 'return',
    seller: 'direct',
    fields: ['id', 'sellerId', 'status', 'createdAt'],
  },
  claims: {
    label: 'Reclamações',
    model: 'claim',
    seller: 'direct',
    fields: ['id', 'sellerId', 'status', 'createdAt'],
  },
  disputes: {
    label: 'Disputas',
    model: 'dispute',
    seller: 'global',
    fields: ['id', 'status', 'openedAt'],
  },
  favorites: {
    label: 'Favoritos',
    model: 'favorite',
    seller: 'global',
    fields: ['id', 'productId', 'createdAt'],
  },
} as const;
export function safeCell(value: unknown): string {
  const text =
    value instanceof Date ? value.toISOString() : String(value ?? '');
  return /^[\s\u0000-\u001f]*[=+@-]/.test(text) ? "'" + text : text;
}
export function csv(
  rows: Record<string, unknown>[],
  fields: readonly string[],
) {
  return (
    '\ufeff' +
    [fields, ...rows.map((r) => fields.map((f) => safeCell(r[f])))]
      .map((r) =>
        r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(','),
      )
      .join('\r\n')
  );
}
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}
  list() {
    return Object.entries(REPORTS).map(([key, v]) => ({
      key,
      label: v.label,
      scoped: v.seller !== 'global',
    }));
  }
  scope(user: AuthenticatedUser): string[] | null {
    const claims = parseAccessClaims(user);
    if (claims.kind !== 'available')
      throw new ForbiddenException('Authoritative grants required');
    if (claims.isSuperAdmin) return null;
    const grants = (claims.grants ?? []).filter(
      (g) =>
        g.permissions.has('reports:operational:export') &&
        !g.revoked &&
        (!g.expiresAt || g.expiresAt > new Date()),
    );
    if (grants.some((g) => g.scopeType === 'GLOBAL')) return null;
    const sellers = [
      ...new Set(
        grants
          .filter((g) => g.scopeType === 'SELLERS')
          .flatMap((g) => g.sellerIds),
      ),
    ];
    if (!sellers.length)
      throw new ForbiddenException('Report export grant required');
    return sellers;
  }
  async rows(
    user: AuthenticatedUser,
    key: string,
    query: { sellerId?: string; from?: string; to?: string; status?: string },
  ) {
    const config = Object.hasOwn(REPORTS,key) ? REPORTS[key as keyof typeof REPORTS] : undefined;
    if (!config) throw new BadRequestException('Unknown report');
    const allowed = this.scope(user);
    if (allowed && config.seller === 'global')
      throw new ForbiddenException('This report requires GLOBAL scope');
    if (query.sellerId && !/^[0-9a-f-]{36}$/i.test(query.sellerId))
      throw new BadRequestException('Invalid sellerId');
    if (
      allowed &&
      query.sellerId &&
      !allowed.includes(query.sellerId.toLowerCase())
    )
      throw new ForbiddenException('Seller outside grant');
    const sellers = query.sellerId ? [query.sellerId.toLowerCase()] : allowed;
    const where: Record<string, unknown> = {};
    if (sellers) {
      if (config.seller === 'global')
        throw new BadRequestException('This view has no seller filter');
      if (config.seller === 'direct') where.sellerId = { in: sellers };
      else where.sellerOrder = { sellerId: { in: sellers } };
    }
    const date: Record<string, Date> = {};
    for (const [name, op] of [
      ['from', 'gte'],
      ['to', 'lte'],
    ] as const) {
      if (query[name]) {
        const parsed = new Date(query[name]!);
        if (Number.isNaN(parsed.getTime()))
          throw new BadRequestException('Invalid date');
        date[op] = parsed;
      }
    }
    if (date.gte && date.lte && date.gte > date.lte)
      throw new BadRequestException('Date range is reversed');
    if (Object.keys(date).length) {
      if (config.seller === 'item')
        where.sellerOrder = {
          ...((where.sellerOrder as object) ?? {}),
          createdAt: date,
        };
      else where[config.model === 'dispute' ? 'openedAt' : 'createdAt'] = date;
    }
    if (query.status) {
      if (!config.fields.some((f) => f === 'status'))
        throw new BadRequestException('View has no status');
      if (!/^[A-Z_]{1,50}$/.test(query.status))
        throw new BadRequestException('Invalid status');
      const model = Prisma.dmmf.datamodel.models.find(
        (m) => m.name.toLowerCase() === config.model.toLowerCase(),
      );
      const field = model?.fields.find((f) => f.name === 'status');
      const values = Prisma.dmmf.datamodel.enums
        .find((e) => e.name === field?.type)
        ?.values.map((v) => v.name);
      if (!values?.includes(query.status))
        throw new BadRequestException('Unknown status for view');
      where.status = query.status;
    }
    const select = Object.fromEntries(config.fields.map((f) => [f, true]));
    // One bounded database query for the entire filtered export, independent of UI pagination.
    const delegate = (
      this.prisma as unknown as Record<
        string,
        { findMany(args: unknown): Promise<Record<string, unknown>[]> }
      >
    )[config.model];
    const rows = await delegate.findMany({
      where,
      select,
      orderBy: { id: 'asc' },
      take: 10001,
    });
    if (rows.length > 10000)
      throw new BadRequestException(
        'Export exceeds 10000 rows; narrow date/seller filters',
      );
    return { rows, fields: config.fields };
  }
  async export(
    user: AuthenticatedUser,
    key: string,
    query: { sellerId?: string; from?: string; to?: string; status?: string },
    format: string,
  ) {
    if (!['csv', 'xlsx'].includes(format))
      throw new BadRequestException('Format must be csv or xlsx');
    const { rows, fields } = await this.rows(user, key, query);
    if (format === 'csv') return Buffer.from(csv(rows, fields), 'utf8');
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Relatorio');
    sheet.addRow([...fields]);
    for (const row of rows)
      sheet.addRow(
        fields.map((f) =>
          typeof row[f] === 'number' ? row[f] : safeCell(row[f]),
        ),
      );
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(rows.length + 1, 1), column: fields.length },
    };
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
