import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * PATCH /customers/me/addresses/:id — mesmos campos de CreateAddressDto,
 * todos opcionais (atualização parcial). Não usa PartialType (sem
 * @nestjs/mapped-types nas dependências deste serviço, e o resto do
 * projeto já escreve DTOs de update à mão — ver UpdateProductStatusDto em
 * catalog-service).
 */
export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  recipient?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  street?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  complement?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  neighborhood?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(12)
  postalCode?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
