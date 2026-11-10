import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import { SessionService } from './session.service';
import {
  createConfigMock,
  createPrismaMock,
} from '../../test-utils/prisma.mock';
import { AppConfig } from '../../config/configuration';
import { SESSION_LAST_USED_TOUCH_MS } from '../../common/constants/auth.constants';

describe('SessionService lastUsedAt', () => {
  const service = new SessionService(
    createPrismaMock(),
    createConfigMock() as unknown as ConfigService<AppConfig, true>,
  );

  it('does not require a touch when lastUsedAt is recent', () => {
    const lastUsedAt = new Date();
    expect(
      service.shouldTouchLastUsed(
        lastUsedAt,
        SESSION_LAST_USED_TOUCH_MS,
        lastUsedAt,
      ),
    ).toBe(false);
  });

  it('requires a touch after the 15 minute interval', () => {
    const lastUsedAt = new Date('2026-01-01T12:00:00.000Z');
    const now = new Date(lastUsedAt.getTime() + SESSION_LAST_USED_TOUCH_MS);
    expect(
      service.shouldTouchLastUsed(lastUsedAt, SESSION_LAST_USED_TOUCH_MS, now),
    ).toBe(true);
  });
});

describe('SessionService cookie attributes', () => {
  function fakeResponse() {
    return {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as import('express').Response & {
      cookie: jest.Mock;
      clearCookie: jest.Mock;
    };
  }

  function configMockWith(cookieSecure: boolean) {
    return {
      get: jest.fn((key: string) => {
        if (key === 'session') {
          return { cookieName: 'potala_session', ttlDays: 7, cookieSecure };
        }
        return undefined;
      }),
    } as unknown as ConfigService<AppConfig, true>;
  }

  it('uses sameSite=lax when cookieSecure is false (local dev, same-site)', () => {
    const service = new SessionService(
      createPrismaMock(),
      configMockWith(false),
    );
    const response = fakeResponse();

    service.attachCookie(response, 'a-token');

    expect(response.cookie).toHaveBeenCalledWith(
      'potala_session',
      'a-token',
      expect.objectContaining({ sameSite: 'lax', secure: false }),
    );
  });

  it('uses sameSite=none when cookieSecure is true (cross-site production)', () => {
    const service = new SessionService(
      createPrismaMock(),
      configMockWith(true),
    );
    const response = fakeResponse();

    service.attachCookie(response, 'a-token');

    expect(response.cookie).toHaveBeenCalledWith(
      'potala_session',
      'a-token',
      expect.objectContaining({ sameSite: 'none', secure: true }),
    );
  });

  it('clearCookie mirrors the same sameSite/secure pairing', () => {
    const service = new SessionService(
      createPrismaMock(),
      configMockWith(true),
    );
    const response = fakeResponse();

    service.clearCookie(response);

    expect(response.clearCookie).toHaveBeenCalledWith(
      'potala_session',
      expect.objectContaining({ sameSite: 'none', secure: true }),
    );
  });
});

describe('SessionService.validateToken', () => {
  it('returns null for an unknown token', async () => {
    const prisma = createPrismaMock();
    prisma.session.findUnique.mockResolvedValue(null);
    const service = new SessionService(
      prisma,
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );

    await expect(service.validateToken('unknown-token')).resolves.toBeNull();
  });

  it('returns null for a revoked session', async () => {
    const prisma = createPrismaMock();
    const service = new SessionService(
      prisma,
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );
    const token = service.generateToken();
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      tokenHash: service.hashToken(token),
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
      lastUsedAt: new Date(),
      user: {
        id: 'user-1',
        email: 'a@test.com',
        status: UserStatus.ACTIVE,
        roles: [],
      },
    });

    await expect(service.validateToken(token)).resolves.toBeNull();
  });

  it('returns null for a BLOCKED user', async () => {
    const prisma = createPrismaMock();
    const service = new SessionService(
      prisma,
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );
    const token = service.generateToken();
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      tokenHash: service.hashToken(token),
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

    await expect(service.validateToken(token)).resolves.toBeNull();
  });

  it('returns the authenticated user for a valid session', async () => {
    const prisma = createPrismaMock();
    const service = new SessionService(
      prisma,
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );
    const token = service.generateToken();
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      tokenHash: service.hashToken(token),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      lastUsedAt: new Date(),
      user: {
        id: 'user-1',
        email: 'a@test.com',
        status: UserStatus.ACTIVE,
        roles: [{ role: 'CUSTOMER' }],
      },
    });

    await expect(service.validateToken(token)).resolves.toEqual({
      id: 'user-1',
      email: 'a@test.com',
      status: UserStatus.ACTIVE,
      roles: ['CUSTOMER'],
      isSuperAdmin: false,
      grants: [],
    });
  });
  it('returns only current non-revoked unexpired permissions and explicit superadmin flag', async () => {
    const prisma = createPrismaMock();
    const service = new SessionService(
      prisma,
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );
    const role = { slot: 1, permissions: ['reports:operational:export'] };
    const grant = {
      id: 'grant-1',
      role,
      scopeType: 'GLOBAL',
      sellerIds: [],
      expiresAt: null,
      revokedAt: null,
    };
    prisma.session.findUnique.mockResolvedValue({
      id: 's',
      expiresAt: new Date(Date.now() + 60000),
      revokedAt: null,
      lastUsedAt: new Date(),
      user: {
        id: 'u',
        email: 'a@test.com',
        status: UserStatus.ACTIVE,
        roles: [{ role: 'ADMIN' }],
        adminProfile: { isSuperAdmin: false },
        accessGrants: [
          grant,
          { ...grant, id: 'revoked', revokedAt: new Date() },
          { ...grant, id: 'expired', expiresAt: new Date(0) },
        ],
      },
    });
    const result = await service.validateToken('token');
    expect(result?.isSuperAdmin).toBe(false);
    expect(result?.grants).toEqual([
      {
        grantId: 'grant-1',
        roleKey: '1',
        permissions: role.permissions,
        scope: { type: 'GLOBAL', sellerIds: [] },
        expiresAt: null,
      },
    ]);
  });
});
