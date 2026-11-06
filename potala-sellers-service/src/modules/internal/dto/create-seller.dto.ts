import { DocumentType } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Body sent by identity-service's SellersServiceClient.createSellerForOwner —
 * see docs/internal-api-contract.md for the full contract.
 */
export class CreateSellerDto {
  @IsUUID('4')
  userId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  ownerName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  legalName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  tradeName!: string;

  @IsEnum(DocumentType)
  documentType!: DocumentType;

  /**
   * Digits-only, already normalized and check-digit validated by
   * identity-service (see its common/utils/brazilian-document.ts). This
   * service only re-checks format/length against documentType — defense in
   * depth, not a re-implementation of the check-digit algorithm.
   */
  @IsString()
  @Matches(/^\d+$/, {
    message: 'documentNumberDigits must contain only digits',
  })
  documentNumberDigits!: string;

  @IsEmail()
  storeEmail!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
