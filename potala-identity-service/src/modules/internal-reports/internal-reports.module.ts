import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Module,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { Public } from '../../common/decorators/public.decorator';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';
export class InternalReportQuery {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  sellerIds?: string[];
  @IsOptional() @IsUUID() after?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsString() @MaxLength(50) status?: string;
}
type View = {
  model: string;
  seller: string;
  fields: string[];
  date?: string;
  extra?: Record<string, unknown>;
};
const VIEWS: Record<string, View> = {
  customers: {
    model: 'user',
    seller: 'global',
    fields: ['id', 'status', 'emailVerifiedAt', 'createdAt'],
  },
};
@Public()
@UseGuards(InternalApiKeyGuard)
@Controller('internal/reports')
export class InternalReportsController {
  constructor(private readonly prisma: PrismaService) {}
  @Post(':view')
  @HttpCode(200)
  async rows(@Param('view') key: string, @Body() query: InternalReportQuery) {
    const view = Object.hasOwn(VIEWS, key) ? VIEWS[key] : undefined;
    if (!view) throw new BadRequestException('Unknown report');
    const where: Record<string, unknown> = {};
    if (query.sellerIds) {
      if (view.seller === 'global')
        throw new BadRequestException(
          'Global report does not accept seller filters',
        );
      const filter = { in: query.sellerIds };
      if (view.seller === 'activity') where.activity = { sellerId: filter };
      else where[view.seller === 'id' ? 'id' : 'sellerId'] = filter;
    }
    const dates: Record<string, Date> = {};
    if (query.from) dates.gte = new Date(query.from);
    if (query.to) dates.lte = new Date(query.to);
    if (
      Object.values(dates).some((d) => Number.isNaN(d.getTime())) ||
      (dates.gte && dates.lte && dates.gte > dates.lte)
    )
      throw new BadRequestException('Invalid date range');
    if (Object.keys(dates).length) where[view.date ?? 'createdAt'] = dates;
    if (query.status) {
      const model = Prisma.dmmf.datamodel.models.find(
        (m) => m.name.toLowerCase() === view.model.toLowerCase(),
      );
      const field = model?.fields.find((f) => f.name === 'status');
      const values = Prisma.dmmf.datamodel.enums
        .find((e) => e.name === field?.type)
        ?.values.map((v) => v.name);
      if (!values?.includes(query.status))
        throw new BadRequestException('Unknown status for view');
      where.status = query.status;
    }
    where.roles = { some: { role: 'CUSTOMER' } };
    if (query.after) where.AND = [{ id: { gt: query.after } }];
    const delegate = (
      this.prisma as unknown as Record<
        string,
        { findMany(args: unknown): Promise<Record<string, unknown>[]> }
      >
    )[view.model];
    const records = await delegate.findMany({
      where,
      select: {
        ...Object.fromEntries(view.fields.map((f) => [f, true])),
        ...view.extra,
      },
      orderBy: { id: 'asc' },
      take: 501,
    });
    const more = records.length > 500;
    const rows = records.slice(0, 500).map((record) => {
      const { inventory, ...row } = record;
      if (view.model === 'productVariant') {
        const stock = inventory as {
          quantity: number;
          reservedQuantity: number;
        } | null;
        return {
          ...row,
          quantity: stock?.quantity ?? null,
          reservedQuantity: stock?.reservedQuantity ?? null,
          availableQuantity: stock
            ? stock.quantity - stock.reservedQuantity
            : null,
        };
      }
      return row;
    });
    return { rows, next: more ? rows[rows.length - 1].id : null };
  }
}
@Module({ controllers: [InternalReportsController] })
export class InternalReportsModule {}
