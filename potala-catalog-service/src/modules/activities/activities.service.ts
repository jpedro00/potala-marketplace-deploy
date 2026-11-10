import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityKind, ActivityStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  ActivityPaymentDto,
  MaterialDto,
  SaveActivityDto,
} from './activities.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  buildPage,
  prismaIdCursorArgs,
  requireCursor,
  resolvePagination,
  PAGINATION_ORDER_CREATED_AT_ID_DESC,
} from '../../common/pagination/pagination';
import { validateMaterialFile } from './material-files';
const publicInclude = { sessions: { orderBy: { startsAt: 'asc' as const } } };
@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}
  async list(
    kind?: ActivityKind,
    sellerId?: string,
    admin = false,
    query: PaginationQueryDto = {},
  ) {
    const where: Prisma.ActivityWhereInput = {
      ...(!admin && sellerId === undefined ? { status: 'PUBLISHED' } : {}),
      ...(sellerId ? { sellerId } : {}),
      ...(kind ? { kind } : {}),
    };
    const { limit, cursor } = resolvePagination(query);
    await requireCursor(cursor, async (id) =>
      Boolean(
        await this.prisma.activity.findFirst({
          where: { ...where, id },
          select: { id: true },
        }),
      ),
    );
    const rows = await this.prisma.activity.findMany({
      where,
      include: publicInclude,
      ...prismaIdCursorArgs(limit, cursor),
      orderBy: PAGINATION_ORDER_CREATED_AT_ID_DESC,
    });
    return buildPage(rows, limit);
  }
  async get(id: string, sellerId?: string, admin = false) {
    const a = await this.prisma.activity.findFirst({
      where: {
        id,
        ...(sellerId ? { sellerId } : {}),
        ...(!admin && !sellerId ? { status: 'PUBLISHED' as const } : {}),
      },
      include: publicInclude,
    });
    if (!a) throw new NotFoundException('Atividade não encontrada');
    return a;
  }
  async create(dto: SaveActivityDto, sellerId?: string) {
    this.validate(dto);
    if (dto.priceCents > 0 && !sellerId)
      throw new BadRequestException(
        'Cadastre a atividade paga no painel da loja responsável pelo recebimento',
      );
    return this.prisma.activity.create({
      data: {
        ...dto,
        sellerId,
        enrollmentDeadline: new Date(dto.enrollmentDeadline),
        sessions: {
          create: dto.sessions.map((s) => ({
            ...s,
            startsAt: new Date(s.startsAt),
            endsAt: new Date(s.endsAt),
          })),
        },
      },
      include: publicInclude,
    });
  }
  async participants(
    id: string,
    sellerId?: string,
    query: PaginationQueryDto = {},
  ) {
    await this.get(id, sellerId, true);
    const { limit, cursor } = resolvePagination(query);
    await requireCursor(cursor, async (cursorId) =>
      Boolean(
        await this.prisma.enrollment.findFirst({
          where: { id: cursorId, activityId: id },
          select: { id: true },
        }),
      ),
    );
    const rows = await this.prisma.enrollment.findMany({
      where: { activityId: id },
      select: {
        id: true,
        userId: true,
        status: true,
        priceCents: true,
        createdAt: true,
      },
      orderBy: PAGINATION_ORDER_CREATED_AT_ID_DESC,
      ...prismaIdCursorArgs(limit, cursor),
    });
    return buildPage(rows, limit);
  }
  async revoke(id: string, enrollmentId: string, sellerId?: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const a = await tx.activity.findUniqueOrThrow({ where: { id } });
      if (sellerId && a.sellerId !== sellerId) throw new NotFoundException();
      const e = await tx.enrollment.findFirst({
        where: { id: enrollmentId, activityId: id },
      });
      if (!e) throw new NotFoundException();
      if (e.status === 'EXPIRED') return e;
      return tx.enrollment.update({
        where: { id: enrollmentId },
        data: { status: 'CANCELLED' },
      });
    });
  }
  async update(id: string, dto: SaveActivityDto, sellerId?: string) {
    this.validate(dto);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const a = await tx.activity.findUniqueOrThrow({ where: { id } });
      if (sellerId && a.sellerId !== sellerId) throw new NotFoundException();
      if (dto.priceCents > 0 && !a.sellerId)
        throw new BadRequestException(
          'Cadastre a atividade paga no painel da loja responsável pelo recebimento',
        );
      if (
        a.status !== 'DRAFT' ||
        (await tx.enrollment.count({ where: { activityId: id } }))
      )
        throw new ConflictException(
          'Edição permitida somente em rascunho sem inscrições',
        );
      await tx.activitySession.deleteMany({ where: { activityId: id } });
      return tx.activity.update({
        where: { id },
        data: {
          ...dto,
          enrollmentDeadline: new Date(dto.enrollmentDeadline),
          sessions: {
            create: dto.sessions.map((s) => ({
              ...s,
              startsAt: new Date(s.startsAt),
              endsAt: new Date(s.endsAt),
            })),
          },
        },
        include: publicInclude,
      });
    });
  }
  private validate(dto: SaveActivityDto) {
    try {
      new Intl.DateTimeFormat('pt-BR', { timeZone: dto.timezone });
    } catch {
      throw new BadRequestException('Fuso horário inválido');
    }
    const deadline = Date.parse(dto.enrollmentDeadline);
    if (
      !/(Z|[+-]\d{2}:\d{2})$/.test(dto.enrollmentDeadline) ||
      deadline <= Date.now()
    )
      throw new BadRequestException(
        'Prazo deve ser futuro e incluir fuso horário',
      );
    const sessions = [...dto.sessions].sort(
      (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
    );
    sessions.forEach((s, i) => {
      if (
        ![s.startsAt, s.endsAt].every((d) => /(Z|[+-]\d{2}:\d{2})$/.test(d)) ||
        Date.parse(s.startsAt) >= Date.parse(s.endsAt) ||
        Date.parse(s.startsAt) < deadline ||
        (i > 0 && Date.parse(s.startsAt) < Date.parse(sessions[i - 1].endsAt))
      )
        throw new BadRequestException(
          'Encontros devem ocorrer após o prazo, com início/fim válidos e sem sobreposição',
        );
    });
  }
  private async lock(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM catalog."Activity" WHERE id = ${id}::uuid FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Atividade não encontrada');
  }
  private async expire(tx: Prisma.TransactionClient, id: string) {
    await tx.enrollment.updateMany({
      where: {
        activityId: id,
        status: 'PENDING_PAYMENT',
        expiresAt: { lte: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
  }
  async setStatus(id: string, status: ActivityStatus, sellerId?: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const a = await tx.activity.findUniqueOrThrow({ where: { id } });
      if (sellerId && a.sellerId !== sellerId) throw new NotFoundException();
      if (status === 'PUBLISHED' && a.priceCents > 0 && !a.sellerId)
        throw new BadRequestException(
          'Atividade paga exige loja responsável pelo recebimento',
        );
      if (a.status === 'CANCELLED')
        throw new ConflictException('Atividade cancelada é terminal');
      if (status === 'CANCELLED')
        await tx.enrollment.updateMany({
          where: {
            activityId: id,
            status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] },
          },
          data: { status: 'CANCELLED' },
        });
      return tx.activity.update({ where: { id }, data: { status } });
    });
  }
  async enroll(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      await this.expire(tx, id);
      const a = await tx.activity.findUniqueOrThrow({ where: { id } });
      const existing = await tx.enrollment.findFirst({
        where: { activityId: id, userId, status: { not: 'EXPIRED' } },
      });
      if (existing && existing.status !== 'CANCELLED') return existing;
      if (a.status !== 'PUBLISHED' || a.enrollmentDeadline <= new Date())
        throw new ConflictException('Inscrições encerradas');
      if (existing)
        throw new ConflictException(
          'Inscrição cancelada; entre em contato com a organização',
        );
      const occupied = await tx.enrollment.count({
        where: {
          activityId: id,
          status: { in: ['CONFIRMED', 'PENDING_PAYMENT'] },
        },
      });
      if (occupied >= a.capacity)
        throw new ConflictException('Não há vagas disponíveis');
      return tx.enrollment.create({
        data: {
          activityId: id,
          userId,
          priceCents: a.priceCents,
          status: a.priceCents === 0 ? 'CONFIRMED' : 'PENDING_PAYMENT',
          expiresAt: a.priceCents
            ? new Date(
                Math.min(
                  Date.now() + 30 * 60000,
                  a.enrollmentDeadline.getTime(),
                ),
              )
            : null,
        },
      });
    });
  }
  async mine(userId: string, query: PaginationQueryDto = {}) {
    await this.prisma.enrollment.updateMany({
      where: {
        userId,
        status: 'PENDING_PAYMENT',
        expiresAt: { lte: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
    const { limit, cursor } = resolvePagination(query);
    await requireCursor(cursor, async (id) =>
      Boolean(
        await this.prisma.enrollment.findFirst({
          where: { id, userId },
          select: { id: true },
        }),
      ),
    );
    const rows = await this.prisma.enrollment.findMany({
      where: { userId },
      include: { activity: { include: publicInclude } },
      orderBy: PAGINATION_ORDER_CREATED_AT_ID_DESC,
      ...prismaIdCursorArgs(limit, cursor),
    });
    return buildPage(rows, limit);
  }
  async cancel(id: string, userId: string) {
    const e = await this.prisma.enrollment.findFirst({ where: { id, userId } });
    if (!e) throw new NotFoundException();
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, e.activityId);
      const current = await tx.enrollment.findUniqueOrThrow({ where: { id } });
      if (current.status === 'EXPIRED') return current;
      return tx.enrollment.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
    });
  }
  async snapshot(id: string) {
    const e = await this.prisma.enrollment.findUnique({
      where: { id },
      include: { activity: true },
    });
    if (!e) throw new NotFoundException();
    return {
      id: e.id,
      userId: e.userId,
      activityId: e.activityId,
      sellerId: e.activity.sellerId,
      priceCents: e.priceCents,
      status: e.status,
      expiresAt: e.expiresAt,
      title: e.activity.title,
    };
  }
  async payment(id: string, dto: ActivityPaymentDto) {
    const e = await this.prisma.enrollment.findUnique({ where: { id } });
    if (!e) throw new NotFoundException();
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, e.activityId);
      await this.expire(tx, e.activityId);
      const current = await tx.enrollment.findUniqueOrThrow({
        where: { id },
        include: { activity: true },
      });
      if (
        current.userId !== dto.userId ||
        current.priceCents !== dto.amountCents ||
        !current.priceCents ||
        (current.orderId && current.orderId !== dto.orderId)
      )
        throw new ConflictException('Pagamento não corresponde à inscrição');
      if (dto.status === 'REVOKED') {
        if (current.orderId !== dto.orderId)
          throw new ConflictException('Pedido não vinculado');
        return tx.enrollment.update({
          where: { id },
          data: { status: 'CANCELLED' },
        });
      }
      if (current.status === 'CONFIRMED' && current.orderId === dto.orderId)
        return current;
      if (
        current.status !== 'PENDING_PAYMENT' ||
        current.activity.status !== 'PUBLISHED' ||
        !current.expiresAt ||
        current.expiresAt <= new Date()
      )
        throw new ConflictException(
          'Reserva expirada ou cancelada; pagamento exige estorno',
        );
      return tx.enrollment.update({
        where: { id },
        data: { status: 'CONFIRMED', orderId: dto.orderId, expiresAt: null },
      });
    });
  }
  async addMaterial(id: string, dto: MaterialDto, sellerId?: string) {
    await this.get(id, sellerId, true);
    return this.prisma.activityMaterial.create({
      data: { activityId: id, ...validateMaterialFile(dto) },
      select: {
        id: true,
        title: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
      },
    });
  }
  async materials(enrollmentId: string, userId: string) {
    const e = await this.prisma.enrollment.findFirst({
      where: {
        id: enrollmentId,
        userId,
        status: 'CONFIRMED',
        activity: { status: 'PUBLISHED' },
      },
    });
    if (!e)
      throw new ForbiddenException(
        'Material disponível somente para inscrição confirmada',
      );
    return this.prisma.activityMaterial.findMany({
      where: { activityId: e.activityId },
      select: {
        id: true,
        title: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
      },
    });
  }
  async download(enrollmentId: string, materialId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.enrollment.findFirst({
        where: { id: enrollmentId, userId },
      });
      if (!e) throw new ForbiddenException();
      await this.lock(tx, e.activityId);
      const active = await tx.enrollment.findFirst({
        where: {
          id: enrollmentId,
          userId,
          status: 'CONFIRMED',
          activity: { status: 'PUBLISHED' },
        },
      });
      if (!active)
        throw new ForbiddenException(
          'Acesso revogado ou inscrição não confirmada',
        );
      const m = await tx.activityMaterial.findFirst({
        where: { id: materialId, activityId: active.activityId },
      });
      if (!m) throw new NotFoundException();
      await tx.materialAccess.create({ data: { enrollmentId, materialId } });
      return m;
    });
  }
}
