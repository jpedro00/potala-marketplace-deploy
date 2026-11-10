import 'reflect-metadata';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
const id = '12345678-1234-4234-9234-123456789012';
function context(user: unknown): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => Controller,
    switchToHttp: () => ({
      getRequest: () => ({ authUser: user, params: {} }),
    }),
  } as unknown as ExecutionContext;
}
function handler() {}
class Controller {}
beforeEach(() => {
  Reflect.defineMetadata('roles', ['ADMIN'], Controller);
  Reflect.deleteMetadata('permissionRequirement', handler);
});
test('legacy admin cannot bypass grants', () =>
  expect(() =>
    new RolesGuard(new Reflector()).canActivate(
      context({ id, roles: ['ADMIN'], status: 'ACTIVE' }),
    ),
  ).toThrow());
test('explicit superadmin can administer access', () =>
  expect(
    new RolesGuard(new Reflector()).canActivate(
      context({
        id,
        roles: ['ADMIN'],
        status: 'ACTIVE',
        isSuperAdmin: true,
        grants: [],
      }),
    ),
  ).toBe(true));
test('live global grant authorizes and revoked grant denies', () => {
  Reflect.defineMetadata(
    'permissionRequirement',
    {
      kind: 'required',
      permission: 'reports:operational:export',
      scope: { mode: 'COLLECTION' },
    },
    handler,
  );
  const grant = {
    grantId: id,
    permissions: ['reports:operational:export'],
    scope: { type: 'GLOBAL', sellerIds: [] },
    expiresAt: null,
  };
  const user = {
    id,
    roles: ['ADMIN'],
    status: 'ACTIVE',
    isSuperAdmin: false,
    grants: [grant],
  };
  const guard = new RolesGuard(new Reflector());
  expect(guard.canActivate(context(user))).toBe(true);
  expect(() =>
    guard.canActivate(
      context({ ...user, grants: [{ ...grant, revokedAt: '2026-01-01' }] }),
    ),
  ).toThrow();
});
test('scoped collection without database filter is denied', () => {
  Reflect.defineMetadata(
    'permissionRequirement',
    {
      kind: 'required',
      permission: 'reports:operational:export',
      scope: { mode: 'COLLECTION' },
    },
    handler,
  );
  expect(() =>
    new RolesGuard(new Reflector()).canActivate(
      context({
        id,
        roles: ['ADMIN'],
        status: 'ACTIVE',
        isSuperAdmin: false,
        grants: [
          {
            grantId: id,
            permissions: ['reports:operational:export'],
            scope: { type: 'SELLERS', sellerIds: [id] },
          },
        ],
      }),
    ),
  ).toThrow();
});
