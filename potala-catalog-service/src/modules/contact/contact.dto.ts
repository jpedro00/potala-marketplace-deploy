import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength, ValidateIf } from 'class-validator';
const trim = Transform(({value}: {value:unknown}) => typeof value === 'string' ? value.trim() : value);
export class SubmitContactDto {
  @IsUUID('4') id!: string;
  @trim @IsString() @Length(2,120) name!: string;
  @trim @IsEmail() @MaxLength(254) email!: string;
  @trim @IsString() @Length(3,160) subject!: string;
  @trim @IsString() @Length(10,5000) message!: string;
  @IsOptional() @IsString() @MaxLength(0) company?: string;
  @IsOptional() @IsBoolean() analyticsConsent?: boolean;
  @ValidateIf(o => o.analyticsConsent === true) @IsUUID('4') analyticsSessionId?: string;
}
export class ContactStatusDto {
  @IsIn(['NEW','READ','CLOSED']) status!: string;
}
