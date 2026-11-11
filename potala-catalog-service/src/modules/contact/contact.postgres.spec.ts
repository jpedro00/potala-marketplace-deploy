import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { validate } from 'class-validator';
import { ContactService } from './contact.service';
import { SubmitContactDto } from './contact.dto';
import { RecordAnalyticsDto } from '../analytics/analytics.dto';
import { PrismaService } from '../../database/prisma.service';
describe('Contact input boundary',()=>{
  it('rejects honeypot, oversized message and missing consent session',async()=>{
    for(const changes of [{company:'spam'},{message:'x'.repeat(5001)},{analyticsConsent:true}]){
      const dto=Object.assign(new SubmitContactDto(),{id:randomUUID(),name:'Test',email:'test@example.test',subject:'Help',message:'A valid message',...changes});
      expect((await validate(dto)).length).toBeGreaterThan(0);
    }
  });
  it('does not accept contact_submit from a client analytics event',async()=>{
    const dto=Object.assign(new RecordAnalyticsDto(),{id:randomUUID(),sessionId:randomUUID(),consent:true,event:'contact_submit'});
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
const url=process.env.CONTACT_TEST_DATABASE_URL;
(url?describe:describe.skip)('Contact PostgreSQL confirmed submission',()=>{
  let db:PrismaClient,service:ContactService;
  const sessionId=randomUUID(),ids:string[]=[];
  const input=()=>({id:randomUUID(),name:'Teste Contato',email:'contato@example.test',subject:'Teste de confirmação',message:'Mensagem local de teste.',analyticsConsent:true,analyticsSessionId:sessionId});
  beforeAll(async()=>{db=new PrismaClient({datasourceUrl:url});await db.$connect();service=new ContactService(db as unknown as PrismaService);await db.analyticsConsent.create({data:{sessionId}});});
  afterAll(async()=>{await db.contactAction.deleteMany({where:{contactId:{in:ids}}});await db.contactSubmission.deleteMany({where:{id:{in:ids}}});await db.analyticsEvent.deleteMany({where:{sessionId}});await db.analyticsConsent.deleteMany({where:{sessionId}});await db.$disconnect();});
  it('persists once before confirmation and records one PII-free event under retries',async()=>{
    const dto=input();ids.push(dto.id);
    const results=await Promise.all(Array.from({length:4},()=>service.submit(dto)));
    expect(results.every(result=>result.accepted&&result.protocol===dto.id)).toBe(true);
    expect(await db.contactSubmission.count({where:{id:dto.id}})).toBe(1);
    const events=await db.analyticsEvent.findMany({where:{sessionId,event:'contact_submit'}});
    expect(events).toHaveLength(1);
    const serialized=JSON.stringify(events);
    expect(serialized).not.toContain(dto.email);expect(serialized).not.toContain(dto.message);expect(serialized).not.toContain(dto.name);
    await expect(service.submit({...dto,message:'Different input body'})).rejects.toThrow('already used');
  },30000);
  it('records status audit and rejects unknown contact',async()=>{
    const actorId=randomUUID();await service.status(ids[0],'READ',actorId);
    expect(await db.contactAction.count({where:{contactId:ids[0],actorId,status:'READ'}})).toBe(1);
    expect((await service.get(ids[0])).status).toBe('READ');
    await expect(service.get(randomUUID())).rejects.toThrow();
  });
  it('retains the message but does not count when analytics consent was withdrawn',async()=>{
    await db.analyticsConsent.update({where:{sessionId},data:{revokedAt:new Date()}});
    const dto=input();ids.push(dto.id);expect((await service.submit(dto)).accepted).toBe(true);
    expect(await db.analyticsEvent.count({where:{sessionId,event:'contact_submit'}})).toBe(1);
  });
  it('serializes uppercase session submission behind lowercase withdrawal',async()=>{
    await db.analyticsConsent.update({where:{sessionId},data:{revokedAt:null}});
    let release!:()=>void,ready!:()=>void;
    const released=new Promise<void>(resolve=>{release=resolve;});
    const acquired=new Promise<void>(resolve=>{ready=resolve;});
    const blocker=db.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'analytics:'+sessionId.toLowerCase()},0))`;
      ready();await released;
      await tx.analyticsConsent.update({where:{sessionId},data:{revokedAt:new Date()}});
      await tx.analyticsEvent.deleteMany({where:{sessionId}});
    },{timeout:10000});
    await acquired;
    const dto={...input(),analyticsSessionId:sessionId.toUpperCase()};ids.push(dto.id);
    let completed=false;
    const submission=service.submit(dto).then(result=>{completed=true;return result;});
    try {await new Promise(resolve=>setTimeout(resolve,200));expect(completed).toBe(false);}
    finally {release();await blocker;await submission;}
    expect(await db.analyticsEvent.count({where:{sessionId,event:'contact_submit'}})).toBe(0);
  },30000);
});
