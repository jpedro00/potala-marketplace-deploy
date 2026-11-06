import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * PATCH /customers/me — atualiza só os campos editáveis de UserProfile
 * (fullName/phone). E-mail fica de fora de propósito: não existe fluxo de
 * troca de e-mail (confirmação, revalidação de sessão etc.) nesta v1,
 * mesma decisão já refletida no frontend (`/minha-conta/configuracoes`,
 * campo de e-mail sempre `readOnly`).
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}
