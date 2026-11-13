import { PrismaService } from '../database/prisma.service';

type MockFn = jest.Mock;

export type PrismaMock = {
  seller: {
    findUnique: MockFn;
    findUniqueOrThrow: MockFn;
    findMany: MockFn;
    create: MockFn;
    update: MockFn;
  };
  sellerMembership: {
    findUnique: MockFn;
    create: MockFn;
  };
  auditLog: { create: MockFn };
  $transaction: MockFn;
  $queryRaw: MockFn;
  $executeRaw: MockFn;
};

export function createPrismaMock(): PrismaMock & PrismaService {
  const tx = {
    $queryRaw: jest.fn(),
    partnerDocumentType: {findMany:jest.fn().mockResolvedValue([])},
    partnerDocument: {findFirst:jest.fn()},
    seller: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    sellerMembership: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    auditLog: { create: jest.fn() },
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
        return { cookieName: 'potala_session' };
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
      if (key === 'identityService') {
        return {
          baseUrl: 'http://localhost:3001',
          apiKey: 'test-identity-service-api-key-not-a-real-secret',
          timeoutMs: 5000,
        };
      }
      return undefined;
    }),
  };
}
