import { IsString, MinLength } from 'class-validator';

export class IntrospectSessionDto {
  @IsString()
  @MinLength(1)
  token!: string;
}
