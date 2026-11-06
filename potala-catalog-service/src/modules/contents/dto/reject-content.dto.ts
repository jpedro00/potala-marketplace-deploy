import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_CONTENT_MODERATION_NOTE_LENGTH } from '../contents.constants';

const TrimString = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

export class RejectContentDto {
  @ApiPropertyOptional({ maxLength: MAX_CONTENT_MODERATION_NOTE_LENGTH })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(MAX_CONTENT_MODERATION_NOTE_LENGTH)
  note?: string;
}
