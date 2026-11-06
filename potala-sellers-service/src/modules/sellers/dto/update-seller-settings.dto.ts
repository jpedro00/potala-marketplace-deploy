import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * PATCH /seller/settings — só os campos que a própria loja pode editar
 * (ver seller-settings.controller.ts). Mesmos limites de tamanho já
 * usados em CreateSellerDto (internal/dto/create-seller.dto.ts) pro
 * cadastro inicial, pra manter os dois em sincronia.
 *
 * De propósito FORA daqui: legalName, documentType/documentNumber, email,
 * status, commissionBps — dados legais/administrativos, não editáveis
 * pela própria loja nesta v1.
 */
export class UpdateSellerSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  tradeName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
