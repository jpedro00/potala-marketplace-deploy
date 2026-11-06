import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CategoriesService } from './categories.service';
import { createPrismaMock } from '../../test-utils/prisma.mock';

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('CategoriesService', () => {
  it('lists only ACTIVE categories, ordered by name', async () => {
    const prisma = createPrismaMock();
    prisma.category.findMany.mockResolvedValue([]);
    const service = new CategoriesService(prisma);

    await service.listActive();

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });
  });

  it('lists every category regardless of status', async () => {
    const prisma = createPrismaMock();
    prisma.category.findMany.mockResolvedValue([]);
    const service = new CategoriesService(prisma);

    await service.listAll();

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
    });
  });

  it('creates a category with a slug derived from the name', async () => {
    const prisma = createPrismaMock();
    prisma.category.findUnique.mockResolvedValue(null);
    prisma.category.create.mockResolvedValue({ id: '1', name: 'Cristais', slug: 'cristais' });
    const service = new CategoriesService(prisma);

    const result = await service.create({ name: 'Cristais' });

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { name: 'Cristais', slug: 'cristais' },
    });
    expect(result).toEqual({ id: '1', name: 'Cristais', slug: 'cristais' });
  });

  it('retries with a numbered suffix when the derived slug is already taken', async () => {
    const prisma = createPrismaMock();
    prisma.category.findUnique
      .mockResolvedValueOnce({ id: 'existing' })
      .mockResolvedValueOnce(null);
    prisma.category.create.mockResolvedValue({ id: '2', name: 'Cristais', slug: 'cristais-1' });
    const service = new CategoriesService(prisma);

    await service.create({ name: 'Cristais' });

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { name: 'Cristais', slug: 'cristais-1' },
    });
  });

  it('retries on a slug race lost at insert time (P2002 between check and create)', async () => {
    const prisma = createPrismaMock();
    prisma.category.findUnique.mockResolvedValue(null);
    prisma.category.create
      .mockRejectedValueOnce(uniqueViolation())
      .mockResolvedValueOnce({ id: '3', name: 'Cristais', slug: 'cristais' });
    const service = new CategoriesService(prisma);

    await service.create({ name: 'Cristais' });

    expect(prisma.category.create).toHaveBeenCalledTimes(2);
  });

  it('updates status only, without touching the slug, when name is not provided', async () => {
    const prisma = createPrismaMock();
    prisma.category.findUnique.mockResolvedValue({ id: '1', name: 'Cristais', slug: 'cristais' });
    prisma.category.update.mockResolvedValue({ id: '1', status: 'INACTIVE' });
    const service = new CategoriesService(prisma);

    await service.update('1', { status: 'INACTIVE' as never });

    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { status: 'INACTIVE' },
    });
  });

  it('regenerates the slug (excluding itself) when name changes', async () => {
    const prisma = createPrismaMock();
    prisma.category.findUnique.mockResolvedValue({ id: '1', name: 'Cristal', slug: 'cristal' });
    prisma.category.findFirst.mockResolvedValue(null);
    prisma.category.update.mockResolvedValue({ id: '1', name: 'Cristais', slug: 'cristais' });
    const service = new CategoriesService(prisma);

    await service.update('1', { name: 'Cristais' });

    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { slug: 'cristais', NOT: { id: '1' } },
      select: { id: true },
    });
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { name: 'Cristais', slug: 'cristais', status: undefined },
    });
  });

  it('throws NotFoundException when updating a category that does not exist', async () => {
    const prisma = createPrismaMock();
    prisma.category.findUnique.mockResolvedValue(null);
    const service = new CategoriesService(prisma);

    await expect(service.update('missing', { name: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
