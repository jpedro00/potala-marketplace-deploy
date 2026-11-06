import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';
import { InventoryItemsDto } from './dto/inventory-items.dto';
import { ResolveVariantsDto } from './dto/resolve-variants.dto';
import { InternalService } from './internal.service';

/**
 * Server-to-server only — never called by the frontend directly. Protected
 * by InternalApiKeyGuard instead of the session cookie (there isn't one on
 * service-to-service calls), and marked @Public() so SessionAuthGuard /
 * RolesGuard don't also demand a cookie. Same pattern as identity-service's
 * and sellers-service's own InternalController. Added for orders-service —
 * see docs/internal-api-contract.md for the full contract.
 */
@Public()
@UseGuards(InternalApiKeyGuard)
@ApiTags('internal')
@Controller('internal')
export class InternalController {
  constructor(private readonly internalService: InternalService) {}

  @Post('product-variants/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Resolves authoritative product/variant/price/seller/stock data for a set of variantIds. Ids with no match are simply absent from the response. Called by orders-service at checkout — it must never trust productId/variantId/price/sellerId coming from its own client. POST (not GET) only because variantIds is a body array, not a query string — this is a read-only lookup, hence 200 not 201.',
  })
  resolveVariants(@Body() dto: ResolveVariantsDto) {
    return this.internalService.resolveVariants(dto.variantIds);
  }

  @Post('inventory/reserve')
  @ApiOperation({
    summary:
      'Atomically reserves stock for every item in the batch, all-or-nothing (single Postgres transaction). Called by orders-service right after it creates an Order locally, before charging the payment gateway.',
  })
  reserve(@Body() dto: InventoryItemsDto) {
    return this.internalService.reserveBatch(dto.items);
  }

  @Post('inventory/release')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Atomically releases a previous reservation for every item in the batch, all-or-nothing. Called by orders-service when a reserved order fails to pay (or expires).',
  })
  release(@Body() dto: InventoryItemsDto) {
    return this.internalService.releaseBatch(dto.items);
  }

  @Post('inventory/commit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Atomically turns a previous reservation into consumed stock for every item in the batch, all-or-nothing. Called by orders-service once the payment gateway approves the charge.',
  })
  commit(@Body() dto: InventoryItemsDto) {
    return this.internalService.commitBatch(dto.items);
  }
}
