import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentSeller } from '../../common/decorators/current-seller.decorator';
import { SellerContextGuard } from '../../common/guards/seller.guard';
import { Role } from '../../common/types/identity-enums';
import { SellerContext } from '../../common/types/authenticated-user';
import { SellersService } from './sellers.service';

@ApiTags('seller')
@Controller('seller/onboarding')
@Roles(Role.SELLER)
@UseGuards(SellerContextGuard)
export class SellerOnboardingController {
  constructor(private readonly sellersService: SellersService) {}

  @Get('status')
  @ApiOperation({
    summary:
      "Current store status and what's unblocked for the authenticated seller owner/member.",
  })
  getStatus(@CurrentSeller() seller: SellerContext) {
    return this.sellersService.getOnboardingStatus(seller);
  }
}
