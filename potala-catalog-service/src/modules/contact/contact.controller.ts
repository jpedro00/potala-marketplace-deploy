import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Role } from '../../common/types/identity-enums';
import { ContactService } from './contact.service';
import { ContactStatusDto, SubmitContactDto } from './contact.dto';
const uuid=new ParseUUIDPipe({version:'4'});
@Controller('public/contact')
export class PublicContactController {
  constructor(private readonly contact:ContactService) {}
  @Public() @Post() @HttpCode(202) @Throttle({default:{limit:5,ttl:60000}})
  submit(@Body() dto:SubmitContactDto) {return this.contact.submit(dto);}
}
@Controller('admin/contacts') @Roles(Role.ADMIN)
export class AdminContactController {
  constructor(private readonly contact:ContactService) {}
  @Get() @Header('Cache-Control','private, no-store') @RequirePermission('aftersales:claim:read',{mode:'PLATFORM'})
  list(@Query('cursor',new ParseUUIDPipe({version:'4',optional:true})) cursor?:string) {return this.contact.list(cursor);}
  @Get(':id') @Header('Cache-Control','private, no-store') @RequirePermission('aftersales:claim:read',{mode:'PLATFORM'})
  get(@Param('id',uuid) id:string) {return this.contact.get(id);}
  @Patch(':id') @Header('Cache-Control','private, no-store') @RequirePermission('aftersales:claim:update',{mode:'PLATFORM'})
  status(@Param('id',uuid) id:string,@Body() dto:ContactStatusDto,@CurrentUser() user:AuthenticatedUser) {return this.contact.status(id,dto.status,user.id);}
}
