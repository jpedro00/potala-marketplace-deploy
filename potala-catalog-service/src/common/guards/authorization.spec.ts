import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { OriginGuard } from './origin.guard';
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
  it('prevents CUSTOMER from accessing SELLER routes', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === ROLES_KEY ? [Role.SELLER] : false,
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

  it('allows SELLER to access seller/products routes', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === ROLES_KEY ? [Role.SELLER] : false,
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

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects mutating requests from a foreign origin', () => {
    const guard = new OriginGuard(
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );
    const request = {
      method: 'POST',
      originalUrl: '/api/v1/seller/products',
      headers: { origin: 'https://evil.example' },
      get: () => 'localhost:3003',
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
      method: 'POST',
      originalUrl: '/api/v1/seller/products',
      headers: { origin: 'http://localhost:3000' },
      get: () => 'localhost:3003',
      protocol: 'http',
    };
    expect(guard.canActivate(createContext(request as never))).toBe(true);
  });

  it('allows GET requests regardless of origin (read-only, no CSRF risk)', () => {
    const guard = new OriginGuard(
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );
    const request = {
      method: 'GET',
      originalUrl: '/api/v1/seller/products',
      headers: { origin: 'https://evil.example' },
      get: () => 'localhost:3003',
      protocol: 'http',
    };
    expect(guard.canActivate(createContext(request as never))).toBe(true);
  });

  it('exempts /internal/* mutating requests from the Origin check (server-to-server, never a browser)', () => {
    const guard = new OriginGuard(
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );
    const request = {
      method: 'POST',
      originalUrl: '/api/v1/internal/inventory/reserve',
      headers: {},
      get: () => 'localhost:3003',
      protocol: 'http',
    };
    expect(guard.canActivate(createContext(request as never))).toBe(true);
  });
});
