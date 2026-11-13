import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { SellerContext } from '../../common/types/authenticated-user';
import { queueSellerNotification } from './seller-notifications';
export function validateDocument(mime:string,base64:string){
  if(base64.length>6990510||!base64||base64.length%4!==0||/[^A-Za-z0-9+/=]/.test(base64))throw new BadRequestException('Invalid upload');
  const bytes=Buffer.from(base64,'base64');
  if(bytes.toString('base64')!==base64)throw new BadRequestException('Invalid base64');
  const valid=mime==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:false;
  if(!valid||!bytes.length||bytes.length>5*1024*1024)throw new BadRequestException('PDF, JPEG or PNG up to 5 MiB required');return bytes;
}
const metadata={id:true,sellerId:true,typeId:true,filename:true,mimeType:true,status:true,reason:true,createdAt:true,contentHash:true} as const;
@Injectable()
export class DocumentsService {
  constructor(private readonly db:PrismaService,private readonly config:ConfigService){}
  owner(context:SellerContext){if(context.membershipRole!=='OWNER')throw new ForbiddenException('Store owner required');}
  types(){return this.db.partnerDocumentType.findMany({where:{active:true},orderBy:{createdAt:'asc'}});}
  async configure(name:string,required:boolean){return this.db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('partner-document-types'))::text`;
    if(await tx.partnerDocumentType.count({where:{active:true}})>=10)throw new ConflictException('At most ten active document types');
    return tx.partnerDocumentType.create({data:{name,required}});
  });}
  async updateType(id:string,input:{name?:string;required?:boolean;active?:boolean}){return this.db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('partner-document-types'))::text`;
    const current=await tx.partnerDocumentType.findUnique({where:{id}});if(!current)throw new NotFoundException();
    if(input.active&&!current.active&&await tx.partnerDocumentType.count({where:{active:true}})>=10)throw new ConflictException('At most ten active document types');
    return tx.partnerDocumentType.update({where:{id},data:input});
  });}
  async list(sellerId:string){return {types:await this.types(),documents:await this.db.partnerDocument.findMany({where:{sellerId},select:metadata,orderBy:{createdAt:'desc'}}),history:[...await this.db.partnerReviewEvent.findMany({where:{sellerId},orderBy:{createdAt:'desc'}}),...(await this.db.auditLog.findMany({where:{entityType:'Seller',entityId:sellerId,action:{in:['SELLER_APPROVED','SELLER_REJECTED','SELLER_SUSPENDED']}},orderBy:{createdAt:'desc'}})).map(event=>({id:event.id,action:event.action,createdAt:event.createdAt,reason:(event.metadata as {reason?:string}|null)?.reason??null}))].sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime())};}
  async upload(context:SellerContext,input:{typeId:string;filename:string;mimeType:string;base64:string}){
    this.owner(context);const data=validateDocument(input.mimeType,input.base64);
    if(!await this.db.partnerDocumentType.findFirst({where:{id:input.typeId,active:true}}))throw new BadRequestException('Active document type required');
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner:${context.sellerId}`}))::text`;
      const document=await tx.partnerDocument.create({data:{sellerId:context.sellerId,typeId:input.typeId,filename:input.filename.replace(/[^\p{L}\p{N}_. -]/gu,'_'),mimeType:input.mimeType,data,contentHash:createHash('sha256').update(data).digest('hex'),uploadedBy:context.userId},select:metadata});
      await tx.partnerReviewEvent.create({data:{sellerId:context.sellerId,documentId:document.id,actorId:context.userId,action:'UPLOADED'}});return document;
    });
  }
  async download(sellerId:string,id:string,actorId:string){const doc=await this.db.partnerDocument.findFirst({where:{id,sellerId}});if(!doc)throw new NotFoundException();await this.db.partnerReviewEvent.create({data:{sellerId,documentId:id,actorId,action:'DOWNLOADED'}});return doc;}
  async review(sellerId:string,id:string,status:string,reason:string,actorId:string){return this.db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner:${sellerId}`}))::text`;
    const doc=await tx.partnerDocument.findFirst({where:{id,sellerId}});if(!doc)throw new NotFoundException();
    const latest=await tx.partnerDocument.findFirst({where:{sellerId,typeId:doc.typeId},orderBy:{createdAt:'desc'}});
    if(latest?.id!==id)throw new ConflictException('Review the latest uploaded version');
    const result=await tx.partnerDocument.update({where:{id},data:{status,reason}});
    const event=await tx.partnerReviewEvent.create({data:{sellerId,documentId:id,actorId,action:status,reason}});
    await queueSellerNotification(tx,sellerId,status==='CORRECTION_REQUESTED'?'SELLER_CORRECTION':'DOCUMENT_REVIEWED',event.id);
    return {id:result.id,status:result.status,reason:result.reason};
  });}
  async submit(context:SellerContext){this.owner(context);return this.db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner:${context.sellerId}`}))::text`;
    const required=await tx.partnerDocumentType.findMany({where:{active:true,required:true}});
    if(!required.length)throw new ConflictException('Document requirements pending configuration');
    for(const type of required){const doc=await tx.partnerDocument.findFirst({where:{sellerId:context.sellerId,typeId:type.id},orderBy:{createdAt:'desc'}});if(!doc||['CORRECTION_REQUESTED','REJECTED'].includes(doc.status))throw new ConflictException('Required documents missing or awaiting correction');}
    const baseUrl=this.config.get<string>('catalogService.baseUrl'),apiKey=this.config.get<string>('catalogService.apiKey');
    if(!baseUrl||!apiKey)throw new ServiceUnavailableException('Partner agreement verification unavailable');
    let agreement:{configured:boolean;accepted:boolean;policyId?:string;version?:number};
    try{const response=await fetch(`${baseUrl}/api/v1/internal/legal/requirements/PARTNER_ADHESION/${context.userId}`,{headers:{'x-internal-api-key':apiKey},signal:AbortSignal.timeout(3000)});if(!response.ok)throw new Error('Policy service failed');agreement=await response.json() as typeof agreement;}catch{throw new ServiceUnavailableException('Partner agreement verification unavailable');}
    if(!agreement.configured||!agreement.accepted)throw new ConflictException('Accept the current published partner agreement before submitting');
    await tx.seller.update({where:{id:context.sellerId},data:{status:'PENDING',statusReason:'UNDER_REVIEW'}});
    await tx.partnerReviewEvent.create({data:{sellerId:context.sellerId,actorId:context.userId,action:'UNDER_REVIEW',reason:`Partner agreement ${agreement.policyId}, version ${agreement.version}`}});return {status:'PENDING',reviewStatus:'UNDER_REVIEW'};
  });}
}
