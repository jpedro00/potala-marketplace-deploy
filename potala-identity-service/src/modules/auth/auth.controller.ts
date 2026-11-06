import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  AuthenticatedUser,
  RequestWithAuth,
} from '../../common/types/authenticated-user';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { RegisterSellerDto } from './dto/register-seller.dto';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  @Public()
  @Post('customer/register')
  @ApiOperation({ summary: 'Register a customer account' })
  async registerCustomer(@Body() dto: RegisterCustomerDto) {
    return this.authService.registerCustomer(dto);
  }

  @Public()
  @Post('seller/register')
  @ApiOperation({
    summary:
      'Register a seller account and hand off store creation to sellers-service',
  })
  async registerSeller(@Body() dto: RegisterSellerDto) {
    return this.authService.registerSeller(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authenticate and create an HttpOnly session cookie',
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, token } = await this.authService.login(dto);
    this.sessionService.attachCookie(response, token);
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current server-side session' })
  async logout(
    @Req() request: RequestWithAuth,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = request.cookies?.[this.sessionService.getCookieName()] as
      | string
      | undefined;
    await this.authService.logout(token);
    this.sessionService.clearCookie(response);
  }

  // Override só desta rota: GET /auth/me é leitura de sessao chamada a
  // cada navegacao/reload/nova aba, nao tentativa de credencial -- o teto
  // de 5/60s do grupo `auth` (pensado para login/registro) e baixo demais
  // para esse uso. O contador desta rota ja e independente do de
  // POST /auth/login (a chave de throttling inclui o nome do handler),
  // entao esta mudanca nao afeta o limite de login/registro.
  @Throttle({ auth: { limit: 30, ttl: 60000 } })
  @Get('me')
  @ApiOperation({
    summary: 'Return the authenticated identity and related profiles',
  })
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.id);
  }
}
