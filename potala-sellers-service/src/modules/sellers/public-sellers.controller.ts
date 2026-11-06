import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { SellersService } from './sellers.service';

/**
 * New this session — vitrine pública da loja (/vendedor/[slug] no
 * frontend, ver status-migracao-microservicos.md). @Public() é
 * obrigatório aqui, não só a ausência de @UseGuards(): SessionAuthGuard e
 * RolesGuard são globais (APP_GUARD em app.module.ts), então toda rota
 * exige sessão por padrão a menos que marcada explicitamente — mesmo
 * padrão já usado por HealthController/InternalController e pelos
 * controllers /public/* de catalog-service.
 */
@ApiTags('public-sellers')
@Controller('public/sellers')
@Public()
export class PublicSellersController {
  constructor(private readonly sellersService: SellersService) {}

  @Get(':slug')
  @ApiOperation({ summary: 'Get one ACTIVE seller by slug' })
  getBySlug(@Param('slug') slug: string) {
    return this.sellersService.getPublicBySlug(slug);
  }
}
