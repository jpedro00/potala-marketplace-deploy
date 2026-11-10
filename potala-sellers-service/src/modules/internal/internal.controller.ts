import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';
import { InternalService } from './internal.service';
import { CreateSellerDto } from './dto/create-seller.dto';

/**
 * Server-to-server only. Never called by the frontend directly — see
 * docs/internal-api-contract.md. Protected by InternalApiKeyGuard instead of
 * the session cookie (there isn't one on service-to-service calls), and
 * marked @Public() so SessionAuthGuard/RolesGuard don't also demand a cookie.
 */
@Public()
@UseGuards(InternalApiKeyGuard)
@ApiTags('internal')
@Controller('internal')
export class InternalController {
  constructor(private readonly internalService: InternalService) {}

  @Get('sellers/:sellerId/payment-settings')
  paymentSettings(@Param('sellerId', new ParseUUIDPipe({version: '4'})) sellerId: string) { return this.internalService.getPaymentSettings(sellerId); }

  @Post('sellers')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Creates a Seller (PENDING) + SellerMembership(OWNER) for a user identity-service just registered. Called by identity-service right after it commits the User locally.',
  })
  createSeller(@Body() dto: CreateSellerDto) {
    return this.internalService.createSellerForOwner(dto);
  }

  /**
   * Added for catalog-service, which has no local `membros_vendedor` table
   * of its own — its network-based SellerContextGuard calls this instead of
   * the local Prisma query SellerContextGuard runs inside THIS service. See
   * docs/internal-api-contract.md.
   */
  @Get('sellers/membership/:userId')
  @ApiOperation({
    summary:
      "Resolves a userId's store membership (sellerId, role, current status), for another service's own seller-context guard.",
  })
  async getMembershipByUserId(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
  ) {
    const membership = await this.internalService.getMembershipByUserId(userId);
    if (!membership) {
      throw new NotFoundException('Seller membership not found');
    }
    return membership;
  }
}
