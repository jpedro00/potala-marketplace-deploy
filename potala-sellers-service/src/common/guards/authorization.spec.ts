import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { OriginGuard } from './origin.guard';
import { InternalApiKeyGuard } from './internal-api-key.guard';
import { ROLES_KEY } from '../constants/auth.constants';
import { Role, UserStatus } from '../types/identity-enums';
import { RequestWithAuth } from '../types/authenticated-user';
import { createConfigMock } from '../../test-utils/prisma.mock';
import { AppConfig } from '../../config/configuration';

function createContext(request: Partial<RequestWithAuth>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('Authorization foundation', () => {
  it('prevents SELLER from accessing ADMIN routes', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === ROLES_KEY ? [Role.ADMIN] : false,
      ),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const context = createContext({
      authUser: {
        id: 'u2',
        email: 's@test.com',
        status: UserStatus.ACTIVE,
        roles: [Role.SELLER],
      },
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('prevents CUSTOMER from accessing ADMIN routes', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === ROLES_KEY ? [Role.ADMIN] : false,
      ),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const context = createContext({
      authUser: {
        id: 'u1',
        email: 'c@test.com',
        status: UserStatus.ACTIVE,
        roles: [Role.CUSTOMER],
      },
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows explicitly bootstrapped superadmin to access administrative resources', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === ROLES_KEY ? [Role.ADMIN] : false,
      ),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const context = createContext({
      authUser: {
        id: 'admin-1',
        email: 'admin@test.com',
        status: UserStatus.ACTIVE,
        roles: [Role.ADMIN],
        isSuperAdmin:true,
        grants:[],
      },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects mutating requests from a foreign origin', () => {
    const guard = new OriginGuard(
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );
    const request = {
      method: 'PATCH',
      originalUrl: '/api/v1/admin/sellers/seller-1/approve',
      headers: { origin: 'https://evil.example' },
      get: () => 'localhost:3002',
      protocol: 'http',
    };
    expect(() => guard.canActivate(createContext(request as never))).toThrow(
      ForbiddenException,
    );
  });

  it('allows mutating requests from FRONTEND_URL', () => {
    const guard = new OriginGuard(
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );
    const request = {
      method: 'PATCH',
      originalUrl: '/api/v1/admin/sellers/seller-1/approve',
      headers: { origin: 'http://localhost:3000' },
      get: () => 'localhost:3002',
      protocol: 'http',
    };
    expect(guard.canActivate(createContext(request as never))).toBe(true);
  });

  it('exempts /internal/* mutating requests from the Origin check (server-to-server, no browser Origin)', () => {
    const guard = new OriginGuard(
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );
    const request = {
      method: 'POST',
      originalUrl: '/api/v1/internal/sellers',
      headers: {},
      get: () => 'sellers-service.internal',
      protocol: 'http',
    };
    expect(guard.canActivate(createContext(request as never))).toBe(true);
  });
});

describe('InternalApiKeyGuard', () => {
  const configMock = {
    get: jest.fn(() => 'correct-internal-secret-value'),
  } as unknown as ConfigService<AppConfig, true>;

  it('rejects a missing header', () => {
    const guard = new InternalApiKeyGuard(configMock);
    const request = { headers: {} };
    expect(() => guard.canActivate(createContext(request as never))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a wrong key', () => {
    const guard = new InternalApiKeyGuard(configMock);
    const request = { headers: { 'x-internal-api-key': 'wrong' } };
    expect(() => guard.canActivate(createContext(request as never))).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts the correct key', () => {
    const guard = new InternalApiKeyGuard(configMock);
    const request = {
      headers: { 'x-internal-api-key': 'correct-internal-secret-value' },
    };
    expect(guard.canActivate(createContext(request as never))).toBe(true);
  });
});
