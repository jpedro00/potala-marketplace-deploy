import { PrismaService } from '../database/prisma.service';

type MockFn = jest.Mock;

export type PrismaMock = {
  category: {
    findUnique: MockFn;
    findFirst: MockFn;
    findMany: MockFn;
    create: MockFn;
    update: MockFn;
  };
  product: {
    findFirst: MockFn;
    findUnique: MockFn;
    findMany: MockFn;
    create: MockFn;
    update: MockFn;
  };
  productVariant: {
    findUnique: MockFn;
    findFirst: MockFn;
    findMany: MockFn;
    create: MockFn;
  };
  productImage: {
    createMany: MockFn;
    findMany: MockFn;
  };
  inventory: {
    create: MockFn;
  };
  $transaction: MockFn;
  $queryRaw: MockFn;
  $executeRaw: MockFn;
};

export function createPrismaMock(): PrismaMock & PrismaService {
  const tx = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    category: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    product: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    productVariant: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    productImage: {
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    inventory: {
      create: jest.fn(),
    },
  };

  const prisma = {
    ...tx,
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
      if (key === 'identityService') {
        return {
          baseUrl: 'http://localhost:3001',
          apiKey: 'test-identity-service-api-key-not-a-real-secret',
          timeoutMs: 5000,
        };
      }
      if (key === 'sellersService') {
        return {
          baseUrl: 'http://localhost:3002',
          apiKey: 'test-sellers-service-api-key-not-a-real-secret',
          timeoutMs: 5000,
        };
      }
      if (key === 'internalApiKey') {
        return 'test-catalog-service-internal-api-key-not-a-real-secret';
      }
      return undefined;
    }),
  };
}
