import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { AppConfig } from '../../config/configuration';
import { INTERNAL_API_KEY_HEADER } from '../constants/auth.constants';

/**
 * Guards every /internal/* route this service exposes (currently the
 * product/variant resolution and inventory reserve/release/commit routes
 * consumed by orders-service — see modules/internal and
 * docs/internal-api-contract.md). Identical to identity-service's and
 * sellers-service's own InternalApiKeyGuard: these routes are not exposed to
 * the frontend or the public internet in a correct deployment (they should
 * sit behind a private network / the platform's internal routing) — this
 * header check is the belt-and-suspenders layer for when that boundary is
 * misconfigured.
 */
@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers[INTERNAL_API_KEY_HEADER];
    const expected = this.configService.get('internalApiKey', { infer: true });

    if (typeof provided !== 'string' || !this.matches(provided, expected)) {
      throw new UnauthorizedException('Invalid internal API key');
    }

    return true;
  }

  /** Constant-time comparison: a naive === leaks timing information about the secret. */
  private matches(provided: string, expected: string): boolean {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return timingSafeEqual(providedBuffer, expectedBuffer);
  }
}
