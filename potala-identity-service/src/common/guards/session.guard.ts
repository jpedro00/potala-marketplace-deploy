import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../constants/auth.constants';
import { AppConfig } from '../../config/configuration';
import { SessionService } from '../../modules/auth/session.service';
import { RequestWithAuth } from '../types/authenticated-user';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const cookieName = this.configService.get('session', {
      infer: true,
    }).cookieName;
    const token = request.cookies?.[cookieName] as string | undefined;

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const authUser = await this.sessionService.validateToken(token);
    if (!authUser) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    request.authUser = authUser;
    return true;
  }
}
