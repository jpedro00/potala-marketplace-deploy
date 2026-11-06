import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  PAGINATION_ORDER_CREATED_AT_ID_DESC,
  buildPage,
  prismaIdCursorArgs,
  requireCursor,
  resolvePagination,
} from '../../common/pagination/pagination';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { RejectContentDto } from './dto/reject-content.dto';

/**
 * Backs a domínio inteiro novo, admin "Conteúdos / Cursos" -- v1 mínimo
 * escolhido pelo Arthur (28/09): só cadastro e moderação, sem módulos/
 * aulas, sem compra, sem aluno. Ver comentário do model Content em
 * schema.prisma pro racional completo.
 */
@Injectable()
export class ContentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForAdmin(query: PaginationQueryDto = {}) {
    const { limit, cursor } = resolvePagination(query);
    await requireCursor(cursor, async (id) => {
      const content = await this.prisma.content.findUnique({
        where: { id },
        select: { id: true },
      });
      return content !== null;
    });

    const rows = await this.prisma.content.findMany({
      ...prismaIdCursorArgs(limit, cursor),
      orderBy: PAGINATION_ORDER_CREATED_AT_ID_DESC,
    });

    return buildPage(rows, limit);
  }

  create(dto: CreateContentDto) {
    return this.prisma.content.create({
      data: {
        title: dto.title,
        instructor: dto.instructor,
        category: dto.category,
        format: dto.format,
        priceCents: dto.priceCents,
        description: dto.description ?? '',
      },
    });
  }

  async update(id: string, dto: UpdateContentDto) {
    const existing = await this.prisma.content.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Content not found');
    }
    return this.prisma.content.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.instructor !== undefined ? { instructor: dto.instructor } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.format !== undefined ? { format: dto.format } : {}),
        ...(dto.priceCents !== undefined ? { priceCents: dto.priceCents } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    });
  }

  private async requireContent(id: string) {
    const existing = await this.prisma.content.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Content not found');
    }
    return existing;
  }

  /**
   * DRAFT -> REVIEW. 409 on any other current status -- explicit
   * transition, no silent no-op, same reasoning already used by every
   * other state-machine change in this project (Coupon/Return/Seller).
   */
  async submitForReview(id: string) {
    const existing = await this.requireContent(id);
    if (existing.status !== ContentStatus.DRAFT) {
      throw new ConflictException(
        'Only DRAFT content can be submitted for review',
      );
    }
    return this.prisma.content.update({
      where: { id },
      data: { status: ContentStatus.REVIEW, moderationNote: null },
    });
  }

  /** REVIEW -> PUBLISHED. */
  async approve(id: string) {
    const existing = await this.requireContent(id);
    if (existing.status !== ContentStatus.REVIEW) {
      throw new ConflictException('Only content in REVIEW can be approved');
    }
    return this.prisma.content.update({
      where: { id },
      data: { status: ContentStatus.PUBLISHED, moderationNote: null },
    });
  }

  /** REVIEW -> REJECTED, com nota opcional (motivo mostrado na tela). */
  async reject(id: string, dto: RejectContentDto) {
    const existing = await this.requireContent(id);
    if (existing.status !== ContentStatus.REVIEW) {
      throw new ConflictException('Only content in REVIEW can be rejected');
    }
    return this.prisma.content.update({
      where: { id },
      data: { status: ContentStatus.REJECTED, moderationNote: dto.note ?? null },
    });
  }

  /**
   * PUBLISHED -> ARCHIVED. Terminal nesta v1, mesma decisão já tomada pra
   * Category (sem "reabrir" via endpoint nenhum).
   */
  async archive(id: string) {
    const existing = await this.requireContent(id);
    if (existing.status !== ContentStatus.PUBLISHED) {
      throw new ConflictException('Only PUBLISHED content can be archived');
    }
    return this.prisma.content.update({
      where: { id },
      data: { status: ContentStatus.ARCHIVED },
    });
  }
}
