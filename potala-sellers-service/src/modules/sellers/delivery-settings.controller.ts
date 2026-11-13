import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested, ArrayMaxSize, IsArray, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../../database/prisma.service';
import { CurrentSeller } from '../../common/decorators/current-seller.decorator';
import { SellerContext } from '../../common/types/authenticated-user';
import { SellerContextGuard } from '../../common/guards/seller.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/types/identity-enums';
import { Public } from '../../common/decorators/public.decorator';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';

class DeliveryRateDto {
  @Matches(/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/) state!: string;
  @IsOptional() @Matches(/^\d{8}$/) postalCodeFrom?: string;
  @IsOptional() @Matches(/^\d{8}$/) postalCodeTo?: string;
  @IsInt() @Min(0) @Max(2147483647) priceCents!: number;
  @IsInt() @Min(0) @Max(365) estimatedDays!: number;
}
export class DeliverySettingsDto {
  @IsBoolean() pickupEnabled!: boolean;
  @IsOptional() @IsString() @MaxLength(500) pickupAddress?: string;
  @IsBoolean() deliveryEnabled!: boolean;
  @IsArray() @ArrayMaxSize(100) @ValidateNested({each: true}) @Type(() => DeliveryRateDto) rates!: DeliveryRateDto[];
}

@Injectable()
export class DeliverySettingsService {
  constructor(private readonly prisma: PrismaService) {}
  async get(sellerId: string) {
    return await this.prisma.sellerDeliverySettings.findUnique({where: {sellerId}}) ?? {sellerId, pickupEnabled: false, pickupAddress: null, deliveryEnabled: false, rates: [], revision: 0};
  }
  async save(context: SellerContext, input: DeliverySettingsDto) {
    if (context.membershipRole !== 'OWNER') throw new ForbiddenException('Only the owner can configure delivery');
    if (input.pickupEnabled && !input.pickupAddress?.trim()) throw new BadRequestException('Pickup requires an address');
    if (input.deliveryEnabled && !input.rates.length) throw new BadRequestException('Delivery requires an explicit rate');
    const seen = new Set<string>();
    for (const rate of input.rates) {
      if (!!rate.postalCodeFrom !== !!rate.postalCodeTo || (rate.postalCodeFrom && rate.postalCodeFrom > rate.postalCodeTo!)) throw new BadRequestException('Invalid postal-code range');
      const key = `${rate.state}:${rate.postalCodeFrom ?? ''}:${rate.postalCodeTo ?? ''}`;
      if (seen.has(key)) throw new BadRequestException('Duplicate delivery rate');
      seen.add(key);
    }
    const data = {...input, pickupAddress: input.pickupAddress?.trim() ?? null, rates: JSON.parse(JSON.stringify(input.rates))};
    return this.prisma.sellerDeliverySettings.upsert({where: {sellerId: context.sellerId}, create: {sellerId: context.sellerId, ...data}, update: {...data, revision: {increment: 1}}});
  }
}

@Controller('seller/settings/delivery')
@Roles(Role.SELLER)
@UseGuards(SellerContextGuard)
export class DeliverySettingsController {
  constructor(private readonly service: DeliverySettingsService) {}
  @Get() get(@CurrentSeller() seller: SellerContext) { return this.service.get(seller.sellerId); }
  @Put() save(@CurrentSeller() seller: SellerContext, @Body() input: DeliverySettingsDto) { return this.service.save(seller, input); }
}

@Public()
@UseGuards(InternalApiKeyGuard)
@Controller('internal/sellers')
export class InternalDeliverySettingsController {
  constructor(private readonly service: DeliverySettingsService) {}
  @Get(':id/delivery-settings') get(@Param('id', new ParseUUIDPipe({version: '4'})) id: string) { return this.service.get(id); }
}
