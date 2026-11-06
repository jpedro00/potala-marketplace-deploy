import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewSellerDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
