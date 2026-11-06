import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AppConfig } from '../../config/configuration';
import { INTERNAL_PATH_SEGMENT } from '../constants/auth.constants';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!MUTATING_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    // Server-to-server calls under /internal/* are authenticated by
    // InternalApiKeyGuard, not by a browser Origin header — they never carry
    // one, since nothing about them runs in a browser.
    const path = request.originalUrl ?? request.url ?? '';
    if (path.includes(INTERNAL_PATH_SEGMENT)) {
      return true;
    }

    const allowed = this.allowedOrigins(request);
    const origin = this.requestOrigin(request);

    if (!origin) {
      if (this.configService.get('nodeEnv', { infer: true }) === 'production') {
        throw new ForbiddenException('Missing Origin header');
      }
      return true;
    }

    if (!allowed.has(origin)) {
      throw new ForbiddenException('Origin is not allowed');
    }

    return true;
  }

  private requestOrigin(request: Request): string | null {
    const origin = request.headers.origin;
    if (typeof origin === 'string' && origin.length > 0) {
      return origin;
    }

    const referer = request.headers.referer;
    if (typeof referer === 'string' && referer.length > 0) {
      try {
        return new URL(referer).origin;
      } catch {
        return null;
      }
    }

    return null;
  }

  private allowedOrigins(request: Request): Set<string> {
    const allowed = new Set<string>([
      this.configService.get('frontendUrl', { infer: true }),
    ]);

    const host = request.get('host');
    if (host) {
      const forwardedProto = request.get('x-forwarded-proto');
      const protocol =
        typeof forwardedProto === 'string' && forwardedProto.length > 0
          ? forwardedProto.split(',')[0]!.trim()
          : request.protocol;
      allowed.add(`${protocol}://${host}`);
    }

    return allowed;
  }
}
