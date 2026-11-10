import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Post,
  Delete,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import {
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  ArrayMaxSize,
  ArrayMinSize,
  IsOptional,
  IsISO8601,
  MaxLength,
} from 'class-validator';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../database/prisma.service';
import { PERMISSION_CODES } from '../../common/permissions/permission-catalog.mirror';
class RoleDto {
  @IsString() @MaxLength(80) name!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsIn(PERMISSION_CODES, { each: true })
  permissions!: string[];
}
class GrantDto {
  @IsUUID() userId!: string;
  @IsUUID() roleId!: string;
  @IsIn(['GLOBAL', 'SELLERS']) scopeType!: string;
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  sellerIds!: string[];
  @IsOptional() @IsISO8601() expiresAt?: string;
}
@Controller('admin/access')
@Roles(Role.ADMIN)
export class AccessController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() async list() {
    const [roles, grants] = await Promise.all([
      this.prisma.adminAccessRole.findMany({ orderBy: { slot: 'asc' } }),
      this.prisma.adminAccessGrant.findMany({
        where: { revokedAt: null },
        take: 1000,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { permissions: PERMISSION_CODES, roles, grants };
  }
  @Put('roles/:slot') async role(
    @Param('slot') raw: string,
    @Body() dto: RoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const slot = Number(raw);
    if (!Number.isInteger(slot) || slot < 1 || slot > 5)
      throw new BadRequestException('Slot must be 1..5');
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.adminAccessRole.upsert({
        where: { slot },
        create: { slot, ...dto },
        update: dto,
      });
      await tx.adminAccessAudit.create({
        data: {
          actorUserId: actor.id,
          action: 'ROLE_UPSERT',
          targetId: role.id,
        },
      });
      return role;
    });
  }
  @Post('grants') async grant(
    @Body() dto: GrantDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (
      (dto.scopeType === 'GLOBAL' && dto.sellerIds.length) ||
      (dto.scopeType === 'SELLERS' && !dto.sellerIds.length)
    )
      throw new BadRequestException('Scope mismatch');
    if (dto.expiresAt && new Date(dto.expiresAt) <= new Date())
      throw new BadRequestException('Expiry must be in future');
    return this.prisma.$transaction(async (tx) => {
      const admin = await tx.user.findFirst({
        where: {
          id: dto.userId,
          status: 'ACTIVE',
          roles: { some: { role: 'ADMIN' } },
        },
      });
      if (!admin)
        throw new BadRequestException('Active administrator required');
      const grant = await tx.adminAccessGrant.create({
        data: {
          ...dto,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
      });
      await tx.adminAccessAudit.create({
        data: {
          actorUserId: actor.id,
          action: 'GRANT_CREATE',
          targetId: grant.id,
        },
      });
      return grant;
    });
  }
  @Delete('grants/:id') async revoke(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const grant = await tx.adminAccessGrant.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      await tx.adminAccessAudit.create({
        data: {
          actorUserId: actor.id,
          action: 'GRANT_REVOKE',
          targetId: grant.id,
        },
      });
      return grant;
    });
  }
}
