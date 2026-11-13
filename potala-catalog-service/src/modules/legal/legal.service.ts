import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
export const POLICY_KEYS=['TERMS','PRIVACY','COOKIES','PURCHASE_RETURNS','PARTNER_ADHESION'] as const;
@Injectable()
export class LegalService {
  constructor(private readonly db:PrismaService){}
  private key(key:string){if(!POLICY_KEYS.includes(key as any))throw new BadRequestException('Unknown policy');return key;}
  async current(key:string){this.key(key);const policy=await this.db.legalPolicy.findFirst({where:{key,status:'PUBLISHED'},select:{id:true,key:true,version:true,title:true,content:true,contentHash:true,publishedAt:true}});return policy?{configured:true,...policy}:{configured:false,key};}
  list(){return this.db.legalPolicy.findMany({orderBy:[{key:'asc'},{version:'desc'}]});}
  async draft(key:string,title:string,content:string,actor:string){
    this.key(key);
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`legal:${key}`}))::text`;
      const last=await tx.legalPolicy.findFirst({where:{key},orderBy:{version:'desc'}});
      return tx.legalPolicy.create({data:{key,title,content,contentHash:createHash('sha256').update(content).digest('hex'),version:(last?.version??0)+1,createdBy:actor}});
    });
  }
  async publish(id:string,actor:string){return this.db.$transaction(async tx=>{
    const policy=await tx.legalPolicy.findUnique({where:{id}});if(!policy)throw new NotFoundException();
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`legal:${policy.key}`}))::text`;
    const fresh=await tx.legalPolicy.findUnique({where:{id}});
    if(fresh?.status!=='DRAFT')throw new ConflictException('Only a draft can be published');
    await tx.legalPolicy.updateMany({where:{key:policy.key,status:'PUBLISHED',id:{not:id}},data:{status:'REVOKED'}});
    const changed=await tx.legalPolicy.updateMany({where:{id,status:'DRAFT'},data:{status:'PUBLISHED',reviewedBy:actor,publishedAt:new Date()}});
    if(!changed.count)throw new ConflictException('Only a draft can be published');
    return tx.legalPolicy.findUnique({where:{id}});
  });}
  async revoke(id:string){return this.db.$transaction(async tx=>{
    const policy=await tx.legalPolicy.findUnique({where:{id}});if(!policy)throw new NotFoundException();
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`legal:${policy.key}`}))::text`;
    return tx.legalPolicy.update({where:{id},data:{status:'REVOKED'}});
  });}
  async accept(policyId:string,userId:string){return this.db.$transaction(async tx=>{
    let policy=await tx.legalPolicy.findUnique({where:{id:policyId}});
    if(!policy||policy.status!=='PUBLISHED')throw new ConflictException('Current published policy required');
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`legal:${policy.key}`}))::text`;
    policy=await tx.legalPolicy.findUnique({where:{id:policyId}});
    if(!policy||policy.status!=='PUBLISHED')throw new ConflictException('Current published policy required');
    return tx.legalAcceptance.upsert({where:{policyId_userId:{policyId,userId}},create:{policyId,userId,contentHash:policy.contentHash},update:{}});
  });}
  mine(userId:string){return this.db.legalAcceptance.findMany({where:{userId},include:{policy:true},orderBy:{acceptedAt:'desc'}});}
  async requirement(key:string,userId:string){this.key(key);return this.db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`legal:${key}`}))::text`;
    const policy=await tx.legalPolicy.findFirst({where:{key,status:'PUBLISHED'}});
    if(!policy)return {configured:false,accepted:false};
    const acceptance=await tx.legalAcceptance.findUnique({where:{policyId_userId:{policyId:policy.id,userId}}});
    return {configured:true,accepted:Boolean(acceptance),policyId:policy.id,version:policy.version};
  });}
}
