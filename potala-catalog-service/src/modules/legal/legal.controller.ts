import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';
import { IsIn, IsString, IsUUID, Length } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Role } from '../../common/types/identity-enums';
import { LegalService, POLICY_KEYS } from './legal.service';
class DraftPolicyDto {@IsIn(POLICY_KEYS) key!:string; @IsString() @Length(1,200) title!:string; @IsString() @Length(1,100000) content!:string;}
class AcceptPolicyDto {@IsUUID('4') policyId!:string;}
@Controller('legal')
export class LegalController {
  constructor(private readonly service:LegalService){}
  @Public() @Header('Cache-Control','no-store') @Get('policies/:key') current(@Param('key') key:string){return this.service.current(key);}
  @Post('acceptances') accept(@Body() dto:AcceptPolicyDto,@CurrentUser() user:AuthenticatedUser){return this.service.accept(dto.policyId,user.id);}
  @Get('acceptances') mine(@CurrentUser() user:AuthenticatedUser){return this.service.mine(user.id);}
}
@Controller('admin/legal/policies') @Roles(Role.ADMIN)
export class AdminLegalController {
  constructor(private readonly service:LegalService){}
  @Get() @RequirePermission('catalog:content:read',{mode:'PLATFORM'}) list(){return this.service.list();}
  @Post() @RequirePermission('catalog:content:manage',{mode:'PLATFORM'}) draft(@Body() dto:DraftPolicyDto,@CurrentUser() user:AuthenticatedUser){return this.service.draft(dto.key,dto.title,dto.content,user.id);}
  @Post(':id/publish') @RequirePermission('catalog:content:manage',{mode:'PLATFORM'}) publish(@Param('id',new ParseUUIDPipe({version:'4'})) id:string,@CurrentUser() user:AuthenticatedUser){return this.service.publish(id,user.id);}
  @Post(':id/revoke') @RequirePermission('catalog:content:manage',{mode:'PLATFORM'}) revoke(@Param('id',new ParseUUIDPipe({version:'4'})) id:string){return this.service.revoke(id);}
}
@Controller('internal/legal') @Public() @UseGuards(InternalApiKeyGuard)
export class InternalLegalController {
  constructor(private readonly service:LegalService){}
  @Get('requirements/:key/:userId') requirement(@Param('key') key:string,@Param('userId',new ParseUUIDPipe({version:'4'})) userId:string){return this.service.requirement(key,userId);}
}
