import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Mirrors RegisterCustomerDto's validation (same password/e-mail rules as
 * the rest of the project) but is never wired to a @Public() route — only
 * an authenticated ADMIN can hit the endpoint that consumes this DTO (see
 * AdminController). No self-service admin registration exists.
 */
export class CreateAdminDto {
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
  name!: string;
}
