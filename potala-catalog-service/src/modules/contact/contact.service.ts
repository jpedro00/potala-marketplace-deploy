import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SubmitContactDto } from './contact.dto';

@Injectable()
export class ContactService {
  constructor(private readonly prisma: PrismaService) {}
  async submit(dto: SubmitContactDto) {
    const data = {name:dto.name.trim(),email:dto.email.trim().toLowerCase(),subject:dto.subject.trim(),message:dto.message.trim()};
    const requestHash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    return this.prisma.$transaction(async tx => {
      // Serialize consent withdrawal with the confirmed submission event.
      if (dto.analyticsConsent === true && dto.analyticsSessionId) {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`analytics:${dto.analyticsSessionId.toLowerCase()}`},0))`);
      }
      const inserted = await tx.contactSubmission.createMany({data:[{id:dto.id,requestHash,...data}],skipDuplicates:true});
      if (!inserted.count) {
        const existing = await tx.contactSubmission.findUnique({where:{id:dto.id},select:{requestHash:true}});
        if (existing?.requestHash !== requestHash) throw new ConflictException('Submission key already used');
      }
      if (inserted.count && dto.analyticsConsent === true && dto.analyticsSessionId) {
        const consent = await tx.analyticsConsent.findUnique({where:{sessionId:dto.analyticsSessionId}});
        if (consent && !consent.revokedAt) await tx.analyticsEvent.create({data:{event:'contact_submit',sessionId:dto.analyticsSessionId}});
      }
      return {accepted:true,protocol:dto.id};
    }, {maxWait:10000,timeout:10000});
  }
  async list(cursor?: string) {
    const items = await this.prisma.contactSubmission.findMany({take:51,orderBy:{id:'asc'},...(cursor?{cursor:{id:cursor},skip:1}:{}),select:{id:true,name:true,subject:true,status:true,createdAt:true}});
    return {items:items.slice(0,50),nextCursor:items.length>50?items[49].id:null};
  }
  async get(id:string) {
    const row=await this.prisma.contactSubmission.findUnique({where:{id}});
    if (!row) throw new NotFoundException();
    const {requestHash: _hash,...visible}=row;
    return visible;
  }
  async status(id:string,status:string,actorId:string) {
    await this.get(id);
    return this.prisma.$transaction(async tx => {
      const result=await tx.contactSubmission.update({where:{id},data:{status},select:{id:true,status:true}});
      await tx.contactAction.create({data:{contactId:id,actorId,status}});
      return result;
    });
  }
}
