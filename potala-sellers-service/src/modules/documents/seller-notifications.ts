import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
export async function queueSellerNotification(tx:Prisma.TransactionClient,sellerId:string,template:string,eventId:string){
  const owners=await tx.sellerMembership.findMany({where:{sellerId,role:'OWNER'},select:{userId:true}});
  if(owners.length)await tx.sellerNotificationJob.createMany({data:owners.map(owner=>({userId:owner.userId,template,idempotencyKey:`sellers:${eventId}:${owner.userId}`})),skipDuplicates:true});
}
@Injectable()
export class SellerNotificationDispatcher implements OnModuleInit,OnModuleDestroy {
  private timer?:NodeJS.Timeout;
  constructor(private readonly db:PrismaService,private readonly config:ConfigService){}
  onModuleInit(){if(this.config.get<boolean>('sellerNotificationDispatchEnabled')){this.timer=setInterval(()=>{void this.dispatch().catch(()=>undefined);},5000);this.timer.unref();}}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
  async dispatch(){
    const now=new Date(),job=await this.db.sellerNotificationJob.findFirst({where:{OR:[{status:'PENDING',nextAttemptAt:{lte:now}},{status:'PROCESSING',lockedUntil:{lte:now}}]},orderBy:{createdAt:'asc'}});
    if(!job)return false;
    const claim=await this.db.sellerNotificationJob.updateMany({where:{id:job.id,OR:[{status:'PENDING',nextAttemptAt:{lte:now}},{status:'PROCESSING',lockedUntil:{lte:now}}]},data:{status:'PROCESSING',lockedUntil:new Date(now.getTime()+30000),attempts:{increment:1}}});
    if(!claim.count)return false;
    try{
      const identity=this.config.get<{baseUrl:string;apiKey:string}>('identityService');
      if(!identity)throw new Error('Identity unavailable');
      const response=await fetch(`${identity.baseUrl}/api/v1/internal/notifications`,{method:'POST',headers:{'content-type':'application/json','x-internal-api-key':identity.apiKey},body:JSON.stringify({userId:job.userId,template:job.template,idempotencyKey:job.idempotencyKey}),signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw new Error('Enqueue failed');
      await this.db.sellerNotificationJob.update({where:{id:job.id},data:{status:'ENQUEUED',enqueuedAt:new Date(),lockedUntil:null}});
    }catch{
      await this.db.sellerNotificationJob.update({where:{id:job.id},data:{status:'PENDING',nextAttemptAt:new Date(Date.now()+Math.min(3600000,5000*2**Math.min(job.attempts,10))),lockedUntil:null}});
    }
    return true;
  }
}
