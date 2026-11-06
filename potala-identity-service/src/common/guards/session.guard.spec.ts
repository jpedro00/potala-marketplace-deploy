import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { UserStatus } from '@prisma/client';
import { SessionAuthGuard } from './session.guard';
import { SessionService } from '../../modules/auth/session.service';
import {
  createConfigMock,
  createPrismaMock,
} from '../../test-utils/prisma.mock';
import { AppConfig } from '../../config/configuration';
import { SESSION_LAST_USED_TOUCH_MS } from '../constants/auth.constants';

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

  it('rejects requests without a session cookie', async () => {
    const prisma = createPrismaMock();
    const sessionService = new SessionService(
      prisma,
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );
    const guard = new SessionAuthGuard(
      reflector,
      sessionService,
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );

    await expect(
      guard.canActivate(createContext({ cookies: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('skips lastUsedAt update when the session was touched recently', async () => {
    const prisma = createPrismaMock();
    const sessionService = new SessionService(
      prisma,
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );
    const token = sessionService.generateToken();
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      tokenHash: sessionService.hashToken(token),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      lastUsedAt: new Date(),
      user: {
        id: 'user-1',
        email: 'a@test.com',
        status: UserStatus.ACTIVE,
        roles: [],
      },
    });

    const guard = new SessionAuthGuard(
      reflector,
      sessionService,
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );

    await guard.canActivate(
      createContext({ cookies: { potala_session: token } }),
    );
    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  it('updates lastUsedAt when the interval has elapsed', async () => {
    const prisma = createPrismaMock();
    const sessionService = new SessionService(
      prisma,
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );
    const token = sessionService.generateToken();
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      tokenHash: sessionService.hashToken(token),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      lastUsedAt: new Date(Date.now() - SESSION_LAST_USED_TOUCH_MS),
      user: {
        id: 'user-1',
        email: 'a@test.com',
        status: UserStatus.ACTIVE,
        roles: [],
      },
    });
    prisma.session.update.mockResolvedValue({});

    const guard = new SessionAuthGuard(
      reflector,
      sessionService,
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );

    await guard.canActivate(
      createContext({ cookies: { potala_session: token } }),
    );
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it('rejects BLOCKED users', async () => {
    const prisma = createPrismaMock();
    const sessionService = new SessionService(
      prisma,
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );
    const token = sessionService.generateToken();
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      tokenHash: sessionService.hashToken(token),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      lastUsedAt: new Date(),
      user: {
        id: 'user-1',
        email: 'a@test.com',
        status: UserStatus.BLOCKED,
        roles: [],
      },
    });

    const guard = new SessionAuthGuard(
      reflector,
      sessionService,
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );

    await expect(
      guard.canActivate(createContext({ cookies: { potala_session: token } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
