import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, UserStatus } from '@prisma/client';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { SellersServiceClient } from '../../clients/sellers-service.client';
import {
  createConfigMock,
  createPrismaMock,
} from '../../test-utils/prisma.mock';
import { AppConfig } from '../../config/configuration';
import { VALID_CNPJ_FORMATTED } from '../../test-utils/documents';
import { DocumentType } from '../../common/types/document-type';

describe('AuthService foundation', () => {
  const passwordService = new PasswordService();
  let prisma: ReturnType<typeof createPrismaMock>;
  let sessionService: SessionService;
  let sellersServiceClient: jest.Mocked<
    Pick<SellersServiceClient, 'createSellerForOwner'>
  >;
  let service: AuthService;

  beforeEach(() => {
    prisma = createPrismaMock();
    sessionService = new SessionService(
      prisma,
      createConfigMock() as unknown as ConfigService<AppConfig, true>,
    );
    sellersServiceClient = { createSellerForOwner: jest.fn() };
    service = new AuthService(
      prisma,
      passwordService,
      sessionService,
      sellersServiceClient as unknown as SellersServiceClient,
    );
  });

  it('creates User, CUSTOMER role, UserProfile and CustomerProfile on customer registration', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-1',
      email: 'cliente@potala.test',
      passwordHash: 'hashed',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.userRole.create.mockResolvedValue({
      id: 'role-1',
      userId: 'user-1',
      role: Role.CUSTOMER,
      createdAt: new Date(),
    });
    prisma.userProfile.create.mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      fullName: 'Maria Cliente',
      phone: '11999999999',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.customerProfile.create.mockResolvedValue({
      id: 'customer-1',
      userId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.registerCustomer({
      email: 'cliente@potala.test',
      password: 'senha-secreta',
      name: 'Maria Cliente',
      phone: '11999999999',
    });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.user.create).toHaveBeenCalled();
    expect(prisma.userRole.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', role: Role.CUSTOMER },
    });
    expect(prisma.customerProfile.create).toHaveBeenCalledWith({
      data: { userId: 'user-1' },
    });
    expect(result.user.roles).toEqual([Role.CUSTOMER]);
    expect(result.profile.fullName).toBe('Maria Cliente');
    expect(result.customer.id).toBe('customer-1');
    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });

  it('stores a passwordHash different from the original password', async () => {
    const hash = await passwordService.hash('senha-secreta');
    expect(hash).not.toBe('senha-secreta');
    expect(await passwordService.verify(hash, 'senha-secreta')).toBe(true);
    expect(await passwordService.verify(hash, 'outra-senha')).toBe(false);
  });

  it('creates User/UserProfile/SELLER role locally, then hands off to sellers-service', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-2',
      email: 'vendedor@potala.test',
      passwordHash: 'hashed',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.userRole.create.mockResolvedValue({
      id: 'role-2',
      userId: 'user-2',
      role: Role.SELLER,
      createdAt: new Date(),
    });
    prisma.userProfile.create.mockResolvedValue({
      id: 'profile-2',
      userId: 'user-2',
      fullName: 'João Vendedor',
      phone: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    sellersServiceClient.createSellerForOwner.mockResolvedValue({
      sellerId: 'seller-1',
      tradeName: 'Loja Potala',
      slug: 'loja-potala',
      status: 'PENDING',
      membershipId: 'membership-1',
      membershipRole: 'OWNER',
    });

    const result = await service.registerSeller({
      email: 'vendedor@potala.test',
      password: 'senha-secreta',
      ownerName: 'João Vendedor',
      legalName: 'Loja Potala LTDA',
      tradeName: 'Loja Potala',
      documentType: DocumentType.CNPJ,
      documentNumber: VALID_CNPJ_FORMATTED,
      storeEmail: 'loja@potala.test',
      phone: '1133334444',
    });

    expect(prisma.userProfile.create).toHaveBeenCalledWith({
      data: { userId: 'user-2', fullName: 'João Vendedor' },
    });
    expect(prisma.userRole.create).toHaveBeenCalledWith({
      data: { userId: 'user-2', role: Role.SELLER },
    });
    expect(sellersServiceClient.createSellerForOwner).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-2', ownerName: 'João Vendedor' }),
    );
    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(result.seller.status).toBe('PENDING');
  });

  it('compensates by deleting the local user when sellers-service creation fails', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-3',
      email: 'vendedor2@potala.test',
      passwordHash: 'hashed',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.userRole.create.mockResolvedValue({});
    prisma.userProfile.create.mockResolvedValue({
      id: 'profile-3',
      fullName: 'Outra Loja',
    });
    prisma.user.delete.mockResolvedValue({});
    sellersServiceClient.createSellerForOwner.mockRejectedValue(
      new ServiceUnavailableException('Store service is unavailable.'),
    );

    await expect(
      service.registerSeller({
        email: 'vendedor2@potala.test',
        password: 'senha-secreta',
        ownerName: 'Outra Loja',
        legalName: 'Outra Loja LTDA',
        tradeName: 'Outra Loja',
        documentType: DocumentType.CNPJ,
        documentNumber: VALID_CNPJ_FORMATTED,
        storeEmail: 'loja2@potala.test',
        phone: '1133334444',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { id: 'user-3' },
    });
  });

  it('rejects invalid CPF on seller registration before calling sellers-service', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.registerSeller({
        email: 'vendedor@potala.test',
        password: 'senha-secreta',
        ownerName: 'João Vendedor',
        legalName: 'João ME',
        tradeName: 'João ME',
        documentType: DocumentType.CPF,
        documentNumber: '123.456.789-01',
        storeEmail: 'loja@potala.test',
        phone: '1133334444',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sellersServiceClient.createSellerForOwner).not.toHaveBeenCalled();
  });

  it('rejects customer registration when email already exists', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(
      service.registerCustomer({
        email: 'cliente@potala.test',
        password: 'senha-secreta',
        name: 'Maria Cliente',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('fails login with invalid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.login({ email: 'nobody@potala.test', password: 'x' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('creates a server-side session on valid login without exposing the raw token as the stored hash', async () => {
    const passwordHash = await passwordService.hash('senha-secreta');
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'cliente@potala.test',
      passwordHash,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      roles: [{ role: Role.CUSTOMER }],
    });
    prisma.session.create.mockImplementation(
      ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) =>
        Promise.resolve({
          id: 'session-1',
          userId: data.userId,
          tokenHash: data.tokenHash,
          createdAt: new Date(),
          expiresAt: data.expiresAt,
          lastUsedAt: new Date(),
          revokedAt: null,
        }),
    );

    const result = await service.login({
      email: 'cliente@potala.test',
      password: 'senha-secreta',
    });

    expect(result.token).toBeDefined();
    expect(result.token.length).toBeGreaterThan(20);
    const created = prisma.session.create.mock.calls[0][0] as {
      data: { tokenHash: string };
    };
    expect(created.data.tokenHash).not.toBe(result.token);
    expect(created.data.tokenHash).toBe(sessionService.hashToken(result.token));
  });

  it('revokes the session on logout', async () => {
    prisma.session.updateMany.mockResolvedValue({ count: 1 });
    const token = sessionService.generateToken();
    await service.logout(token);
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: sessionService.hashToken(token), revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
