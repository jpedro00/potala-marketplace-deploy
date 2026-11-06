import { ExecutionContext, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { SessionAuthGuard } from './session.guard';
import { IdentityServiceClient } from '../../clients/identity-service.client';
import { createConfigMock } from '../../test-utils/prisma.mock';
import { AppConfig } from '../../config/configuration';
import { Role, UserStatus } from '../types/identity-enums';

function createContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('SessionAuthGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(false),
  } as unknown as Reflector;

  function createIdentityClientMock() {
    return {
      introspectSession: jest.fn(),
      getUserById: jest.fn(),
    } as unknown as jest.Mocked<IdentityServiceClient>;
  }

  it('rejects requests without a session cookie, without calling identity-service', async () => {
    const identityClient = createIdentityClientMock();
    const guard = new SessionAuthGuard(
      reflector,
      identityClient,
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );

    await expect(
      guard.canActivate(createContext({ cookies: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(identityClient.introspectSession).not.toHaveBeenCalled();
  });

  it('attaches authUser when identity-service confirms the session', async () => {
    const identityClient = createIdentityClientMock();
    identityClient.introspectSession.mockResolvedValue({
      id: 'user-1',
      email: 'a@test.com',
      status: UserStatus.ACTIVE,
      roles: [Role.SELLER],
    });
    const guard = new SessionAuthGuard(
      reflector,
      identityClient,
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );

    const request: Record<string, unknown> = {
      cookies: { potala_session: 'raw-token' },
    };
    await guard.canActivate(createContext(request));

    expect(identityClient.introspectSession).toHaveBeenCalledWith('raw-token');
    expect(request.authUser).toEqual({
      id: 'user-1',
      email: 'a@test.com',
      status: UserStatus.ACTIVE,
      roles: [Role.SELLER],
    });
  });

  it('rejects an invalid or expired session reported by identity-service', async () => {
    const identityClient = createIdentityClientMock();
    identityClient.introspectSession.mockResolvedValue(null);
    const guard = new SessionAuthGuard(
      reflector,
      identityClient,
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );

    await expect(
      guard.canActivate(
        createContext({ cookies: { potala_session: 'stale-token' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('propagates ServiceUnavailableException when identity-service is unreachable', async () => {
    const identityClient = createIdentityClientMock();
    identityClient.introspectSession.mockRejectedValue(
      new ServiceUnavailableException('down'),
    );
    const guard = new SessionAuthGuard(
      reflector,
      identityClient,
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );

    await expect(
      guard.canActivate(
        createContext({ cookies: { potala_session: 'raw-token' } }),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('is bypassed by @Public()', async () => {
    const publicReflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;
    const identityClient = createIdentityClientMock();
    const guard = new SessionAuthGuard(
      publicReflector,
      identityClient,
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );

    await expect(
      guard.canActivate(createContext({ cookies: {} })),
    ).resolves.toBe(true);
    expect(identityClient.introspectSession).not.toHaveBeenCalled();
  });
});
