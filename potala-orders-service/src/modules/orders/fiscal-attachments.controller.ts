import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';
import { createHash, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { SaxesParser } from 'saxes';
import type { Response } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentSeller } from '../../common/decorators/current-seller.decorator';
import { AuthenticatedUser, SellerContext } from '../../common/types/authenticated-user';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/types/identity-enums';
import { SellerContextGuard, SellerActiveGuard } from '../../common/guards/seller.guard';
import { RequirePermission } from '../../common/permissions/require-permission.decorator';

export class FiscalUploadDto {
  @Matches(/^[\p{L}\p{N} _.-]{1,90}\.(pdf|xml)$/iu) fileName!: string;
  @IsIn(['application/pdf', 'application/xml']) mediaType!: string;
  @IsString() @MaxLength(6990508) base64!: string;
}
export function validateFiscalFile(input: FiscalUploadDto) {
  if (input.base64.length > 6990508 || input.base64.length % 4 || /[^A-Za-z0-9+/=]/.test(input.base64)) throw new BadRequestException('Invalid file encoding');
  const bytes = Buffer.from(input.base64, 'base64');
  if (bytes.toString('base64') !== input.base64) throw new BadRequestException('Invalid file encoding');
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new BadRequestException('File must be at most 5 MiB');
  if (input.mediaType === 'application/pdf') {
    if (!input.fileName.toLowerCase().endsWith('.pdf') || bytes.subarray(0, 5).toString() !== '%PDF-' || !bytes.subarray(-1024).includes(Buffer.from('%%EOF'))) throw new BadRequestException('Invalid PDF');
  } else {
    const xml = bytes.toString('utf8');
    if (!input.fileName.toLowerCase().endsWith('.xml') || !Buffer.from(xml).equals(bytes) || !validPrivateXml(xml)) throw new BadRequestException('Invalid XML; DTD and entities are prohibited');
    // Strict SAX syntax validation; external entities are disabled and downloads are attachments.
  }
  return bytes;
}

type Scope = {sellerId: string} | {customerId: string} | {admin: true};
/** Strict bounded XML syntax only; not XSD validation or verification of fiscal authenticity. */
function validPrivateXml(xml: string): boolean {
  if (/<!\s*(DOCTYPE|ENTITY)|\u0000|[\x01-\x08\x0B\x0C\x0E-\x1F]/i.test(xml)) return false;
  const parser = new SaxesParser({xmlns: true});
  let depth = 0, tags = 0;
  const reject = () => {throw new Error('Invalid private XML');};
  parser.on('error', reject);
  parser.on('doctype', reject);
  parser.on('processinginstruction', reject);
  parser.on('opentag', () => {if (++depth > 128 || ++tags > 100000) reject();});
  parser.on('closetag', () => {depth--;});
  try {parser.write(xml).close(); return true;} catch {return false;}
}
@Injectable()
export class FiscalAttachmentsService {
  constructor(private readonly prisma: PrismaService) {}
  private async order(id: string, scope: Scope) {
    const where = 'sellerId' in scope ? {id, sellerId: scope.sellerId} : 'customerId' in scope ? {id, order: {customerId: scope.customerId}} : {id};
    const order = await this.prisma.sellerOrder.findFirst({where, include: {order: {select: {customerId: true}}}});
    if (!order) throw new NotFoundException('Seller order not found');
    return order;
  }
  async list(id: string, scope: Scope) {
    await this.order(id, scope);
    return this.prisma.fiscalAttachment.findMany({where: {sellerOrderId: id, revokedAt: null}, select: {id: true, fileName: true, mediaType: true, createdAt: true, sha256: true}, orderBy: {createdAt: 'asc'}, take: 100});
  }
  async upload(id: string, sellerId: string, actorId: string, input: FiscalUploadDto) {
    const order = await this.order(id, {sellerId});
    const bytes = validateFiscalFile(input);
    try {return await this.prisma.$transaction(async tx => {
      const count = await tx.fiscalAttachment.count({where: {sellerOrderId: id, revokedAt: null}});
      if (count >= 10) throw new BadRequestException('Maximum 10 active attachments per seller order');
      const file = await tx.fiscalAttachment.create({data: {sellerOrderId: id, sellerId, customerId: order.order.customerId, fileName: input.fileName, mediaType: input.mediaType, bytes, sha256: createHash('sha256').update(bytes).digest('hex'), createdBy: actorId}, select: {id: true, fileName: true, mediaType: true}});
      await tx.fiscalAttachmentAudit.create({data: {attachmentId: file.id, actorId, action: 'UPLOAD'}});
      await tx.outboxEvent.create({data: {id: randomUUID(), eventType: 'orders.fiscal.available', eventVersion: 1, aggregateType: 'SELLER_ORDER', aggregateId: id, orderId: order.orderId, payload: {sellerOrderId: id, sellerId}}});
      return file;
    }, {isolationLevel: 'Serializable'});} catch(error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new ConflictException('Attachments changed concurrently; reload and retry');
      throw error;
    }
  }
  async download(id: string, fileId: string, scope: Scope, actorId: string) {
    await this.order(id, scope);
    return this.prisma.$transaction(async tx => {
      const file = await tx.fiscalAttachment.findFirst({where: {id: fileId, sellerOrderId: id, revokedAt: null}});
      if (!file) throw new NotFoundException('Attachment not found');
      await tx.fiscalAttachmentAudit.create({data: {attachmentId: fileId, actorId, action: 'DOWNLOAD'}});
      return file;
    });
  }
  async revoke(id: string, fileId: string, scope: Scope, actorId: string) {
    await this.order(id, scope);
    return this.prisma.$transaction(async tx => {
      const changed = await tx.fiscalAttachment.updateMany({where: {id: fileId, sellerOrderId: id, revokedAt: null}, data: {revokedAt: new Date()}});
      if (!changed.count) throw new NotFoundException('Attachment not found');
      await tx.fiscalAttachmentAudit.create({data: {attachmentId: fileId, actorId, action: 'REVOKE'}});
      return {revoked: true};
    });
  }
}
function sendFile(response: Response, file: {bytes: Uint8Array; mediaType: string; fileName: string}) {
  response.set({'Content-Type': file.mediaType, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox"});
  return response.send(Buffer.from(file.bytes));
}
@Controller('seller/orders/:orderId/fiscal-attachments')
@Roles(Role.SELLER)
@UseGuards(SellerContextGuard, SellerActiveGuard)
export class SellerFiscalController {
  constructor(private readonly service: FiscalAttachmentsService) {}
  @Get() list(@Param('orderId', ParseUUIDPipe) id: string, @CurrentSeller() seller: SellerContext) { return this.service.list(id, {sellerId: seller.sellerId}); }
  @Post() upload(@Param('orderId', ParseUUIDPipe) id: string, @CurrentSeller() seller: SellerContext, @CurrentUser() user: AuthenticatedUser, @Body() input: FiscalUploadDto) { return this.service.upload(id, seller.sellerId, user.id, input); }
  @Get(':fileId') async download(@Param('orderId', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fileId: string, @CurrentSeller() seller: SellerContext, @CurrentUser() user: AuthenticatedUser, @Res() response: Response) { return sendFile(response, await this.service.download(id, fileId, {sellerId: seller.sellerId}, user.id)); }
  @Delete(':fileId') revoke(@Param('orderId', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fileId: string, @CurrentSeller() seller: SellerContext, @CurrentUser() user: AuthenticatedUser) { return this.service.revoke(id, fileId, {sellerId: seller.sellerId}, user.id); }
}
@Controller('orders/seller-orders/:orderId/fiscal-attachments')
@Roles(Role.CUSTOMER, Role.SELLER)
export class CustomerFiscalController {
  constructor(private readonly service: FiscalAttachmentsService) {}
  @Get() list(@Param('orderId', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) { return this.service.list(id, {customerId: user.id}); }
  @Get(':fileId') async download(@Param('orderId', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fileId: string, @CurrentUser() user: AuthenticatedUser, @Res() response: Response) { return sendFile(response, await this.service.download(id, fileId, {customerId: user.id}, user.id)); }
}
@Controller('admin/orders/seller-orders/:orderId/fiscal-attachments')
@Roles(Role.ADMIN)
export class AdminFiscalController {
  constructor(private readonly service: FiscalAttachmentsService) {}
  @Get() @RequirePermission('orders:order:read', {mode: 'COLLECTION'}) list(@Param('orderId', ParseUUIDPipe) id: string) { return this.service.list(id, {admin: true}); }
  @Get(':fileId') @RequirePermission('orders:order:read', {mode: 'COLLECTION'}) async download(@Param('orderId', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fileId: string, @CurrentUser() user: AuthenticatedUser, @Res() response: Response) { return sendFile(response, await this.service.download(id, fileId, {admin: true}, user.id)); }
  @Delete(':fileId') @RequirePermission('orders:order:update', {mode: 'COLLECTION'}) revoke(@Param('orderId', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fileId: string, @CurrentUser() user: AuthenticatedUser) { return this.service.revoke(id, fileId, {admin: true}, user.id); }
}
