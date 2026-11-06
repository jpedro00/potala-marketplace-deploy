import { Controller, Get, INestApplication, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';

/**
 * Teste isolado da correção do rate limit de GET /auth/me (ver
 * auth.controller.ts). Reproduz, em um módulo Nest mínimo, a mesma
 * configuração do grupo `auth` usada em AppModule (mesmo ttl/limit padrão:
 * 5 requests / 60s) e duas rotas de teste que espelham os decorators reais
 * de POST /auth/login (sem override, herda o limite padrão do grupo) e
 * GET /auth/me (com o novo override @Throttle({ auth: { limit: 30, ttl:
 * 60000 } })) adicionado em auth.controller.ts.
 *
 * Não depende de Prisma, SessionService, CurrentUser nem Supabase --
 * exercita somente o ThrottlerGuard real do @nestjs/throttler em
 * isolamento, sem criar nenhuma sessão real.
 */

const AUTH_GROUP_DEFAULT_LIMIT = 5;
const AUTH_GROUP_TTL_MS = 60000;

@Controller('auth')
class FakeAuthController {
  @Post('login')
  login() {
    return { ok: true };
  }

  @Throttle({ auth: { limit: 30, ttl: AUTH_GROUP_TTL_MS } })
  @Get('me')
  me() {
    return { ok: true };
  }
}

describe('GET /auth/me throttle override (isolado, sem DB)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRootAsync({
          useFactory: () => ({
            throttlers: [
              {
                name: 'auth',
                ttl: AUTH_GROUP_TTL_MS,
                limit: AUTH_GROUP_DEFAULT_LIMIT,
                skipIf: () => false,
              },
            ],
          }),
        }),
      ],
      controllers: [FakeAuthController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/login continua limitado a 5 req/60s (comportamento inalterado por esta correção)', async () => {
    const server = app.getHttpServer();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await request(server).post('/auth/login');
      statuses.push(res.status);
    }

    // POST sem @HttpCode() explícito retorna 201 por padrão no Nest --
    // comportamento HTTP natural do controller-fake, não alterado aqui.
    expect(statuses.slice(0, AUTH_GROUP_DEFAULT_LIMIT)).toEqual(
      new Array(AUTH_GROUP_DEFAULT_LIMIT).fill(201),
    );
    expect(statuses[AUTH_GROUP_DEFAULT_LIMIT]).toBe(429);
  });

  it('GET /auth/me não é mais bloqueado em 5 req/60s (novo teto próprio: 30/60s)', async () => {
    const server = app.getHttpServer();
    const statuses: number[] = [];
    const callsAboveOldLimit = AUTH_GROUP_DEFAULT_LIMIT + 2;
    for (let i = 0; i < callsAboveOldLimit; i += 1) {
      const res = await request(server).get('/auth/me');
      statuses.push(res.status);
    }

    expect(statuses.every((status) => status === 200)).toBe(true);
  });
});
