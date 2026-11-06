import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { slugify } from '../../common/utils/text';
import {
  CATEGORY_SLUG_FALLBACK,
  MAX_CATEGORY_SLUG_ATTEMPTS,
} from './categories.constants';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/**
 * listActive() is ported unchanged from the monolith's
 * modules/categories/categories.service.ts. The rest (listAll/create/update)
 * is new this session, backing the admin "gerenciar categorias" screen —
 * the monolith never had an admin surface for this either, so there was
 * nothing to port for those.
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  listActive() {
    return this.prisma.category.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });
  }

  /** Admin-only: every category regardless of status (ACTIVE + INACTIVE). */
  listAll() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateCategoryDto) {
    const baseSlug = slugify(dto.name, CATEGORY_SLUG_FALLBACK);

    for (let suffix = 0; suffix < MAX_CATEGORY_SLUG_ATTEMPTS; suffix += 1) {
      const slug = suffix === 0 ? baseSlug : `${baseSlug}-${suffix}`;
      const taken = await this.prisma.category.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (taken) continue;

      try {
        return await this.prisma.category.create({
          data: { name: dto.name, slug },
        });
      } catch (error) {
        // Another request took this exact slug between the check above and
        // this insert — retry with the next suffix instead of failing a
        // creation that only lost a narrow race.
        if (this.isUniqueSlugViolation(error)) continue;
        throw error;
      }
    }

    throw new ConflictException('Could not allocate a unique category slug');
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    if (dto.name === undefined) {
      // Status-only change: no slug work needed.
      return this.prisma.category.update({
        where: { id },
        data: { status: dto.status },
      });
    }

    const baseSlug = slugify(dto.name, CATEGORY_SLUG_FALLBACK);

    for (let suffix = 0; suffix < MAX_CATEGORY_SLUG_ATTEMPTS; suffix += 1) {
      const slug = suffix === 0 ? baseSlug : `${baseSlug}-${suffix}`;
      const taken = await this.prisma.category.findFirst({
        where: { slug, NOT: { id } },
        select: { id: true },
      });
      if (taken) continue;

      try {
        return await this.prisma.category.update({
          where: { id },
          data: { name: dto.name, slug, status: dto.status },
        });
      } catch (error) {
        if (this.isUniqueSlugViolation(error)) continue;
        throw error;
      }
    }

    throw new ConflictException('Could not allocate a unique category slug');
  }

  private isUniqueSlugViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
