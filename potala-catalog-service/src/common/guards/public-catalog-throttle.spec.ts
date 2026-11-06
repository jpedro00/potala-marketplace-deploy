import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';

/**
 * Isolado, sem Prisma/sessão/Supabase — mesmo padrão já usado em
 * potala-identity-service's auth-me-throttle.spec.ts para o override de
 * GET /auth/me. Prova o MECANISMO do override (@Throttle por handler
 * sobrescrevendo o limite do grupo nomeado `default`), não os valores reais
 * de produção: valores aqui são deliberadamente pequenos (BASE_LIMIT=3,
 * OVERRIDE_LIMIT=10) só pra manter o teste rápido e determinístico, em vez
 * de reproduzir literalmente 60/300 (o que exigiria 300+ requisições por
 * caso sem ganhar nenhuma garantia adicional) — a proporção
 * override > base é o que importa pra provar que o mecanismo funciona.
 * Os valores reais (60 default / 300 override) vivem só nos controllers de
 * produção (public-categories.controller.ts, public-products.controller.ts),
 * intocados aqui.
 */
const BASE_LIMIT = 3;
const OVERRIDE_LIMIT = 10;
const TTL_MS = 60_000;

@Controller('fake-public')
class FakePublicCatalogController {
  // Espelha PublicCategoriesController.listActive (@Throttle({default:{limit:300,ttl:60000}}))
  @Throttle({ default: { limit: OVERRIDE_LIMIT, ttl: TTL_MS } })
  @Get('categories')
  categories() {
    return { ok: true };
  }

  // Espelha PublicProductsController.list
  @Throttle({ default: { limit: OVERRIDE_LIMIT, ttl: TTL_MS } })
  @Get('products')
  productsList() {
    return { ok: true };
  }

  // Espelha PublicProductsController.getOne
  @Throttle({ default: { limit: OVERRIDE_LIMIT, ttl: TTL_MS } })
  @Get('products/:id')
  productsGetOne() {
    return { ok: true };
  }

  // Sem @Throttle -- representa qualquer handler "normal" do Catalog
  // (admin/seller) que não recebeu override nenhum, pra provar que o
  // grupo `default` sem override continua no limite base (item D).
  @Get('normal')
  normalHandler() {
    return { ok: true };
  }
}

describe('Override de throttle nas rotas públicas de leitura (isolado, sem DB)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRootAsync({
          useFactory: () => ({
            throttlers: [{ name: 'default', ttl: TTL_MS, limit: BASE_LIMIT }],
          }),
        }),
      ],
      controllers: [FakePublicCatalogController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function statusesFor(path: string, count: number): Promise<number[]> {
    const server = app.getHttpServer();
    const statuses: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const res = await request(server).get(path);
      statuses.push(res.status);
    }
    return statuses;
  }

  it('A) GET /fake-public/categories aceita mais que o limite base, de acordo com o override', async () => {
    const statuses = await statusesFor(
      '/fake-public/categories',
      OVERRIDE_LIMIT + 1,
    );
    // Todas as OVERRIDE_LIMIT primeiras passam -- já estourariam em BASE_LIMIT
    // (3) se o override não estivesse em vigor.
    expect(statuses.slice(0, OVERRIDE_LIMIT).every((s) => s === 200)).toBe(
      true,
    );
    expect(statuses[OVERRIDE_LIMIT]).toBe(429);
  });

  it('B) GET /fake-public/products (list) possui override próprio', async () => {
    const statuses = await statusesFor(
      '/fake-public/products',
      OVERRIDE_LIMIT + 1,
    );
    expect(statuses.slice(0, OVERRIDE_LIMIT).every((s) => s === 200)).toBe(
      true,
    );
    expect(statuses[OVERRIDE_LIMIT]).toBe(429);
  });

  it('C) GET /fake-public/products/:id (getOne) possui override próprio', async () => {
    const statuses = await statusesFor(
      '/fake-public/products/11111111-1111-1111-1111-111111111111',
      OVERRIDE_LIMIT + 1,
    );
    expect(statuses.slice(0, OVERRIDE_LIMIT).every((s) => s === 200)).toBe(
      true,
    );
    expect(statuses[OVERRIDE_LIMIT]).toBe(429);
  });

  it('D) GET /fake-public/normal (handler sem override) continua no limite base do grupo default', async () => {
    const statuses = await statusesFor('/fake-public/normal', BASE_LIMIT + 1);
    expect(statuses.slice(0, BASE_LIMIT).every((s) => s === 200)).toBe(true);
    expect(statuses[BASE_LIMIT]).toBe(429);
  });
});
