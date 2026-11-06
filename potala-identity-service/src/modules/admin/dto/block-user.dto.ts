import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Body for PATCH /admin/customers/:id/block — reason is stored only in the response, not persisted (no AuditLog model in this service, see AdminService comment). */
export class BlockUserDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
