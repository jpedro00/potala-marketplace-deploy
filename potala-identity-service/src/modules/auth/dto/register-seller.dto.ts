import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { DocumentType } from '../../../common/types/document-type';
import { parseBrazilianDocument } from '../../../common/utils/brazilian-document';

@ValidatorConstraint({ name: 'sellerDocumentNumber', async: false })
class SellerDocumentNumberConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    const object = args.object as RegisterSellerDto;
    if (
      object.documentType !== DocumentType.CPF &&
      object.documentType !== DocumentType.CNPJ
    ) {
      return false;
    }
    return parseBrazilianDocument(object.documentType, value).ok;
  }

  defaultMessage(args: ValidationArguments): string {
    const object = args.object as RegisterSellerDto;
    if (typeof args.value !== 'string') {
      return 'documentNumber is required';
    }
    if (
      object.documentType !== DocumentType.CPF &&
      object.documentType !== DocumentType.CNPJ
    ) {
      return 'documentType must be CPF or CNPJ';
    }
    const parsed = parseBrazilianDocument(object.documentType, args.value);
    return parsed.ok ? 'Invalid document' : parsed.message;
  }
}

/**
 * identity-service validates and forwards this payload; it does not persist
 * Seller data itself (that table belongs to sellers-service). See
 * AuthService.registerSeller and docs/internal-api-contract.md.
 */
export class RegisterSellerDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  ownerName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  legalName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  tradeName!: string;

  @IsEnum(DocumentType)
  documentType!: DocumentType;

  @IsString()
  @Validate(SellerDocumentNumberConstraint)
  documentNumber!: string;

  @IsEmail()
  @MaxLength(255)
  storeEmail!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(32)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
