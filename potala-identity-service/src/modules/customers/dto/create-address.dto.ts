import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * POST /customers/me/addresses — espelha o model Address 1:1
 * (schema.prisma), exceto `isDefault` opcional: se omitido (ou true no
 * primeiro endereço do cliente), o service decide — ver
 * CustomersService.createAddress.
 */
export class CreateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  recipient!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  street!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  number!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  complement?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  neighborhood!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  city!: string;

  /** UF, sempre 2 letras — mesma validação já aplicada no formulário de checkout. */
  @IsString()
  @Length(2, 2)
  state!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(12)
  postalCode!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
