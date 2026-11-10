import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentSeller } from '../../common/decorators/current-seller.decorator';
import { SellerContextGuard } from '../../common/guards/seller.guard';
import { Role } from '../../common/types/identity-enums';
import { SellerContext } from '../../common/types/authenticated-user';
import { SellersService } from './sellers.service';
import { UpdateSellerSettingsDto } from './dto/update-seller-settings.dto';
import { UpdatePaymentSettingsDto } from './dto/update-payment-settings.dto';

/**
 * Tela "Configurações" do vendedor. Usa só SellerContextGuard (sem
 * SellerActiveGuard), mesmo padrão de SellerOnboardingController — uma
 * loja PENDING/SUSPENSA ainda deve poder ver e corrigir o próprio perfil.
 */
@ApiTags('seller')
@Controller('seller/settings')
@Roles(Role.SELLER)
@UseGuards(SellerContextGuard)
export class SellerSettingsController {
  constructor(private readonly sellersService: SellersService) {}

  @Get('payments')
  getPayments(@CurrentSeller() seller: SellerContext) { return this.sellersService.getPaymentSettings(seller); }

  @Patch('payments')
  updatePayments(@CurrentSeller() seller: SellerContext, @Body() dto: UpdatePaymentSettingsDto) { return this.sellersService.updatePaymentSettings(seller, dto); }

  @Get()
  @ApiOperation({ summary: 'Current store profile for the authenticated seller owner/member.' })
  getSelf(@CurrentSeller() seller: SellerContext) {
    return this.sellersService.getSelf(seller);
  }

  @Patch()
  @ApiOperation({
    summary: 'Update editable store profile fields (tradeName, phone, description).',
  })
  updateSelf(@CurrentSeller() seller: SellerContext, @Body() dto: UpdateSellerSettingsDto) {
    return this.sellersService.updateSelf(seller, dto);
  }
}
