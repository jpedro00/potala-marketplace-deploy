import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { OriginGuard } from './origin.guard';

function context(originalUrl: string, origin?: string): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ method: 'POST', originalUrl, get: (name: string) => name === 'host' ? 'api.potala.test' : undefined, headers: { host: 'api.potala.test', ...(origin ? { origin } : {}) }, protocol: 'https' }) }) } as unknown as ExecutionContext;
}

describe('Origin routing regression', () => {
  const config = { get: (key: string) => key === 'nodeEnv' ? 'production' : 'https://potala.test' } as unknown as ConfigService<AppConfig, true>;
  const guard = new OriginGuard(config);
  it('does not exempt a public mutation containing internal path in query', () => {
    expect(() => guard.canActivate(context('/api/v1/seller/settings?redirect=/internal/users', 'https://evil.test'))).toThrow(ForbiddenException);
  });
  it('does not exempt missing Origin via a query parameter', () => {
    expect(() => guard.canActivate(context('/api/v1/auth/login?next=/internal/users'))).toThrow(ForbiddenException);
  });
  it('keeps the actual internal endpoint exemption for API key authentication', () => {
    expect(guard.canActivate(context('/api/v1/internal/users/resolve'))).toBe(true);
  });
});
