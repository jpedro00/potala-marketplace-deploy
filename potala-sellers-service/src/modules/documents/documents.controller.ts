import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { Response } from 'express';
import { CurrentSeller } from '../../common/decorators/current-seller.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SellerContextGuard } from '../../common/guards/seller.guard';
import { RequirePermission } from '../../common/permissions/require-permission.decorator';
import { SellerContext, AuthenticatedUser } from '../../common/types/authenticated-user';
import { Role } from '../../common/types/identity-enums';
import { DocumentsService } from './documents.service';
class UploadDto {@IsUUID('4') typeId!:string; @IsString() @Length(1,200) filename!:string; @IsIn(['application/pdf','image/jpeg','image/png']) mimeType!:string; @IsString() @MaxLength(6990510) base64!:string;}
class TypeDto {@IsString() @Length(1,100) name!:string; @IsBoolean() required!:boolean;}
class UpdateTypeDto {@IsOptional() @IsString() @Length(1,100) name?:string; @IsOptional() @IsBoolean() required?:boolean; @IsOptional() @IsBoolean() active?:boolean;}
class ReviewDto {@IsIn(['APPROVED','CORRECTION_REQUESTED','REJECTED']) status!:string; @IsString() @Length(1,2000) reason!:string;}
const uuid=new ParseUUIDPipe({version:'4'});
function send(res:Response,doc:{data:Uint8Array;mimeType:string}){res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Disposition','attachment; filename="document"');res.type(doc.mimeType).send(Buffer.from(doc.data));}
@Controller('seller/onboarding/documents') @Roles(Role.SELLER) @UseGuards(SellerContextGuard)
export class PartnerDocumentsController {
  constructor(private readonly service:DocumentsService){}
  @Get() @Header('Cache-Control','private, no-store') list(@CurrentSeller() seller:SellerContext){this.service.owner(seller);return this.service.list(seller.sellerId);}
  @Post() upload(@CurrentSeller() seller:SellerContext,@Body() dto:UploadDto){return this.service.upload(seller,dto);}
  @Post('submit') submit(@CurrentSeller() seller:SellerContext){return this.service.submit(seller);}
  @Get(':id/download') async download(@CurrentSeller() seller:SellerContext,@Param('id',uuid) id:string,@Res() res:Response){this.service.owner(seller);send(res,await this.service.download(seller.sellerId,id,seller.userId));}
}
@Controller('admin') @Roles(Role.ADMIN)
export class AdminPartnerDocumentsController {
  constructor(private readonly service:DocumentsService){}
  @Post('partner-document-types') @RequirePermission('sellers:seller:approve',{mode:'PLATFORM'}) configure(@Body() dto:TypeDto){return this.service.configure(dto.name,dto.required);}
  @Patch('partner-document-types/:id') @RequirePermission('sellers:seller:approve',{mode:'PLATFORM'}) updateType(@Param('id',uuid) id:string,@Body() dto:UpdateTypeDto){return this.service.updateType(id,dto);}
  @Get('partner-documents/:sellerId') @RequirePermission('sellers:seller:read',{mode:'SELLER',sellerIdParam:'sellerId'}) list(@Param('sellerId',uuid) sellerId:string){return this.service.list(sellerId);}
  @Post('partner-documents/:sellerId/:id/review') @RequirePermission('sellers:seller:approve',{mode:'SELLER',sellerIdParam:'sellerId'}) review(@Param('sellerId',uuid) sellerId:string,@Param('id',uuid) id:string,@Body() dto:ReviewDto,@CurrentUser() user:AuthenticatedUser){return this.service.review(sellerId,id,dto.status,dto.reason,user.id);}
  @Get('partner-documents/:sellerId/:id/download') @RequirePermission('sellers:seller:read',{mode:'SELLER',sellerIdParam:'sellerId'}) async download(@Param('sellerId',uuid) sellerId:string,@Param('id',uuid) id:string,@CurrentUser() user:AuthenticatedUser,@Res() res:Response){send(res,await this.service.download(sellerId,id,user.id));}
}
