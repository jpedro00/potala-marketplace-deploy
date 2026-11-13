import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Put, Query, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentSeller } from '../../common/decorators/current-seller.decorator';
import { Role } from '../../common/types/identity-enums';
import { SellerContext } from '../../common/types/authenticated-user';
import { SellerActiveGuard,SellerContextGuard } from '../../common/guards/seller.guard';
import { RequirePermission } from '../../common/permissions/require-permission.decorator';
import { AttributesService } from './attributes.service';
import { AttributeTypeQuery,SaveDefinitionDto,SaveProductDetailsDto } from './attributes.dto';
@Controller('public/product-attributes') @Public()
class PublicAttributesController {constructor(private readonly attributes:AttributesService){} @Get() list(@Query() query:AttributeTypeQuery){return this.attributes.list(query.itemType);}}
@Controller('admin/product-attributes') @Roles(Role.ADMIN)
class AdminAttributesController {
  constructor(private readonly attributes:AttributesService){}
  @Get() @RequirePermission('catalog:category:manage',{mode:'PLATFORM'}) list(@Query() query:AttributeTypeQuery){return this.attributes.list(query.itemType,true);}
  @Put() @RequirePermission('catalog:category:manage',{mode:'PLATFORM'}) save(@Body() dto:SaveDefinitionDto){return this.attributes.saveDefinition(dto);}
}
@Controller('seller/products') @Roles(Role.SELLER) @UseGuards(SellerContextGuard,SellerActiveGuard)
class ProductDetailsController {
  constructor(private readonly attributes:AttributesService){}
  @Patch(':id/details') update(@CurrentSeller() seller:SellerContext,@Param('id',new ParseUUIDPipe({version:'4'})) id:string,@Body() dto:SaveProductDetailsDto){return this.attributes.updateProduct(seller.sellerId,id,dto);}
}
@Module({controllers:[PublicAttributesController,AdminAttributesController,ProductDetailsController],providers:[AttributesService],exports:[AttributesService]})
export class AttributesModule {}
