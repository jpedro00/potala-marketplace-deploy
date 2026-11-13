import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ProductItemType } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { MAX_PRODUCT_TITLE_LENGTH } from '../products.constants';

export class PublicProductsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(ProductItemType) itemType?: ProductItemType;
  @IsOptional() @IsString() @MaxLength(4000) attributes?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Case-insensitive substring match against the title',
    maxLength: MAX_PRODUCT_TITLE_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PRODUCT_TITLE_LENGTH)
  q?: string;

  /**
   * New this session (vitrine pública do vendedor, /vendedor/[slug] no
   * frontend) — filtra a listagem pública por loja. Não valida se o
   * sellerId existe: um id de loja inexistente ou suspensa simplesmente
   * nunca bate com nenhum produto ACTIVE, mesma resposta "vazio" de uma
   * loja real sem produto publicado — sem vazar se a loja existe ou não.
   */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  sellerId?: string;
}
