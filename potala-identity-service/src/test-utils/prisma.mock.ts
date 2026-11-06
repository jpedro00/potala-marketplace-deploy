import { PrismaService } from '../database/prisma.service';

type MockFn = jest.Mock;

export type PrismaMock = {
  user: {
    findUnique: MockFn;
    findUniqueOrThrow: MockFn;
    create: MockFn;
    delete: MockFn;
  };
  userRole: { create: MockFn };
  userProfile: { create: MockFn };
  customerProfile: { create: MockFn; findUnique: MockFn };
  session: {
    create: MockFn;
    findUnique: MockFn;
    update: MockFn;
    updateMany: MockFn;
  };
  adminProfile: { create: MockFn };
  $transaction: MockFn;
  $queryRaw: MockFn;
  $executeRaw: MockFn;
};

export function createPrismaMock(): PrismaMock & PrismaService {
  const tx = {
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    userRole: { create: jest.fn() },
    userProfile: { create: jest.fn() },
    customerProfile: { create: jest.fn(), findUnique: jest.fn() },
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    adminProfile: { create: jest.fn() },
  };

  const prisma = {
    ...tx,
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };

  return prisma as unknown as PrismaMock & PrismaService;
}

export function createConfigMock() {
  return {
    get: jest.fn((key: string) => {
      if (key === 'session') {
        return {
          cookieName: 'potala_session',
          ttlDays: 7,
          cookieSecure: false,
        };
      }
      if (key === 'frontendUrl') {
        return 'http://localhost:3000';
      }
      if (key === 'nodeEnv') {
        return 'test';
      }
      if (key === 'logHttpBody') {
        return false;
      }
      if (key === 'internalApiKey') {
        return 'test-internal-api-key-not-a-real-secret';
      }
      if (key === 'sellersService') {
        return { baseUrl: '', apiKey: '', timeoutMs: 5000 };
      }
      return undefined;
    }),
  };
}
