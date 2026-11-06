import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { PublicProductsQueryDto } from './dto/public-products-query.dto';
import { ProductsService } from './products.service';

/**
 * New this session — the public storefront (Fase 1 do plano até 05/10, ver
 * status-migracao-microservicos.md). `@Public()` is required here, not just
 * "no @UseGuards()": SessionAuthGuard and RolesGuard are registered
 * globally via APP_GUARD in app.module.ts, so every route requires a
 * session by default unless explicitly opted out — same pattern already
 * used by HealthController/InternalController. Missing this made every
 * anonymous request 401 with "Authentication required" (found only once
 * the storefront was actually tested end-to-end with no session cookie
 * present). This is the one product surface meant to be reachable by an
 * anonymous shopper. Only ACTIVE products/variants are ever returned
 * (enforced in ProductsService, in the WHERE clause, not filtered after
 * the fact) — see listPublished/getPublishedById.
 */
@ApiTags('public-products')
@Controller('public/products')
@Public()
export class PublicProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // Override so destes dois handlers: GET /public/products(/:id) e lido por
  // qualquer visitante anonimo via SSR/RSC da Vercel, que pode compartilhar
  // o mesmo IP de saida entre varias renderizacoes concorrentes (ver
  // investigacao do 429 em producao). O teto de 60/60s do grupo `default`
  // (pensado pra uso geral do catalog-service) e baixo demais pra esse
  // trafico. 300/60s casa com o limite global do api-gateway
  // (RATE_LIMIT_MAX) -- acima disso nao traria beneficio no fluxo normal
  // via gateway. `list` e `getOne` sao handlers diferentes (generateKey
  // inclui o nome do handler), cada um com seu proprio override/contador --
  // nao afeta admin/seller nem o grupo `internal`.
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Get()
  @ApiOperation({
    summary:
      'List published (ACTIVE) products, optionally by category or title search',
  })
  list(@Query() query: PublicProductsQueryDto) {
    return this.productsService.listPublished(query);
  }

  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Get(':id')
  @ApiOperation({ summary: 'Get one published (ACTIVE) product by id' })
  getOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.productsService.getPublishedById(id);
  }
}
