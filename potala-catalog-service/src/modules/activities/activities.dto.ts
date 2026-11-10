import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsIn,
  ValidateIf,
  MaxLength,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ActivityKind, ActivityStatus } from '@prisma/client';
export class ActivitySessionDto {
  @IsString() @Length(1, 160) title!: string;
  @IsDateString({ strict: true }) startsAt!: string;
  @IsDateString({ strict: true }) endsAt!: string;
}
export class SaveActivityDto {
  @IsString() @Length(3, 160) title!: string;
  @IsString() @Length(1, 20000) description!: string;
  @IsEnum(ActivityKind) kind!: ActivityKind;
  @IsInt() @Min(0) @Max(100000000) priceCents!: number;
  @IsInt() @Min(1) @Max(100000) capacity!: number;
  @IsString() @Length(1, 80) timezone!: string;
  @IsDateString({ strict: true }) enrollmentDeadline!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ActivitySessionDto)
  sessions!: ActivitySessionDto[];
}
export class ActivityStatusDto {
  @IsEnum(ActivityStatus) status!: ActivityStatus;
}
export class MaterialDto {
  @IsString() @Length(1, 160) title!: string;
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,80}\.(txt|pdf|jpg|jpeg|png)$/i)
  filename!: string;
  @ValidateIf((o) => o.base64 === undefined)
  @IsString()
  @Length(1, 1000000)
  content?: string;
  @IsOptional()
  @IsIn(['text/plain', 'application/pdf', 'image/jpeg', 'image/png'])
  mimeType?: string;
  @IsOptional() @IsString() @MaxLength(6990508) base64?: string;
}
export class ActivityPaymentDto {
  @IsUUID('4') orderId!: string;
  @IsUUID('4') userId!: string;
  @IsInt() @Min(1) amountCents!: number;
  @IsEnum({ CONFIRMED: 'CONFIRMED', REVOKED: 'REVOKED' }) status!:
    'CONFIRMED' | 'REVOKED';
}
export class ActivitiesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(ActivityKind) kind?: ActivityKind;
}
