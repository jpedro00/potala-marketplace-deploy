import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { CategoriesService } from './categories.service';

/**
 * New this session — public counterpart of SellerCategoriesController, for
 * the storefront's category filter/nav (Fase 1 do plano até 05/10).
 * `@Public()` is required here, not just "no @UseGuards()": SessionAuthGuard
 * and RolesGuard are registered globally via APP_GUARD in app.module.ts, so
 * every route requires a session by default unless explicitly opted out —
 * same pattern already used by HealthController/InternalController. Missing
 * this made every anonymous request 401 with "Authentication required"
 * (found only once the storefront was actually tested end-to-end with no
 * session cookie present). Only ACTIVE categories, same shape
 * ({id,name,slug}) already used elsewhere so the frontend can share one
 * type between the seller and public category pickers.
 */
@ApiTags('public-categories')
@Controller('public/categories')
@Public()
export class PublicCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // Override so desta rota: GET /public/categories e lida por qualquer
  // visitante anonimo via SSR/RSC da Vercel, que pode compartilhar o mesmo
  // IP de saida entre varias renderizacoes concorrentes (ver investigacao
  // do 429 em producao). O teto de 60/60s do grupo `default` (pensado pra
  // uso geral do catalog-service) e baixo demais pra esse trafico. 300/60s
  // casa com o limite global do api-gateway (RATE_LIMIT_MAX) -- acima
  // disso nao traria beneficio no fluxo normal via gateway. Overrida so
  // este handler (generateKey inclui o nome do handler), sem afetar
  // admin/seller nem o grupo `internal`.
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Get()
  @ApiOperation({
    summary: 'List active categories, for public storefront navigation',
  })
  async listActive() {
    const categories = await this.categoriesService.listActive();
    return categories.map(({ id, name, slug }) => ({ id, name, slug }));
  }
}
