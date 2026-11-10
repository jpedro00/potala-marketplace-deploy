import { IsBoolean, IsIn, ValidateIf } from 'class-validator';

/** Recipient onboarding is server/provider owned. No bank/card details accepted from the browser. */
export class UpdatePaymentSettingsDto {
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() acceptPix?: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() acceptCard?: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsIn(['MANUAL', 'WEEKLY', 'MONTHLY']) payoutSchedule?: string;
}
