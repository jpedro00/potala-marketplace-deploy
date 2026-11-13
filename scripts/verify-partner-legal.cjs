// Isolated PostgreSQL proof. Never run against a remote/shared database.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
require('../potala-catalog-service/node_modules/reflect-metadata');
const url=process.env.DATABASE_URL||'';
if(!url.includes('127.0.0.1:55434/potala_completion'))throw Error('Isolated completion database required');
const {PrismaClient:Catalog}=require('../potala-catalog-service/node_modules/@prisma/client');
const {PrismaClient:Sellers}=require('../potala-sellers-service/node_modules/@prisma/client');
const {LegalService}=require('../potala-catalog-service/dist/modules/legal/legal.service');
const {DocumentsService}=require('../potala-sellers-service/dist/modules/documents/documents.service');
const {SellerNotificationDispatcher}=require('../potala-sellers-service/dist/modules/documents/seller-notifications');
const catalog=new Catalog(),sellers=new Sellers();
async function main(){
 const legal=new LegalService(catalog),docs=new DocumentsService(sellers),actor=randomUUID(),user=randomUUID();
 const policy=await legal.draft('PARTNER_ADHESION','Isolated test only','Isolated test content only; not approved production copy.',actor);
 await assert.rejects(legal.accept(policy.id,user),/Current published policy/);
 await legal.publish(policy.id,actor);
 const accepted=await Promise.all(Array.from({length:8},()=>legal.accept(policy.id,user)));
 assert.equal(new Set(accepted.map(a=>a.id)).size,1);
 assert.equal(accepted[0].contentHash,policy.contentHash);
 const next=await legal.draft('PARTNER_ADHESION','Isolated test v2','Isolated test version 2.',actor);
 await legal.publish(next.id,actor);
 await assert.rejects(legal.accept(policy.id,randomUUID()),/Current published policy/);
 assert.equal((await legal.mine(user))[0].policy.version,policy.version);
 await assert.rejects(catalog.legalAcceptance.update({where:{id:accepted[0].id},data:{contentHash:'forged'}}),/immutable/);
 await legal.revoke(next.id);
 await assert.rejects(legal.accept(next.id,user),/Current published policy/);
 const seller=await sellers.seller.create({data:{legalName:'Isolated test only',tradeName:'Test partner',slug:`test-${randomUUID()}`,documentType:'CNPJ',documentNumber:randomUUID(),email:'test@example.invalid',phone:'000'}});
 const ctx={sellerId:seller.id,userId:actor,membershipRole:'OWNER'};
 await sellers.sellerMembership.create({data:{sellerId:seller.id,userId:actor,role:'OWNER'}});
 const type=await sellers.partnerDocumentType.create({data:{name:`TEST-${randomUUID()}`,required:true}});
 const upload={typeId:type.id,filename:'private.pdf',mimeType:'application/pdf',base64:Buffer.from('%PDF-1.7\nprivate test').toString('base64')};
 assert.throws(()=>docs.owner({...ctx,membershipRole:'MANAGER'}),/owner/);
 await assert.rejects(docs.upload({...ctx,membershipRole:'STAFF'},upload),/owner/);
 const doc=await docs.upload(ctx,upload);
 assert.equal(doc.data,undefined);
 await assert.rejects(docs.download(randomUUID(),doc.id,actor));
 await docs.review(seller.id,doc.id,'CORRECTION_REQUESTED','Please reupload',actor);
 await assert.rejects(docs.submit(ctx),/missing or awaiting correction/);
 const replacement=await docs.upload(ctx,upload);
 await assert.rejects(docs.review(seller.id,doc.id,'APPROVED','Stale',actor),/latest/);
 await docs.review(seller.id,replacement.id,'APPROVED','Test reviewed',actor);
 const download=await docs.download(seller.id,replacement.id,actor);
 assert.equal(Buffer.from(download.data).toString(),'%PDF-1.7\nprivate test');
 assert.ok((await docs.list(seller.id)).history.some(e=>e.action==='DOWNLOADED'));
 const http=require('node:http');
 const agreement=await legal.draft('PARTNER_ADHESION','Isolated submission agreement','Isolated submission test.',actor);
 await legal.publish(agreement.id,actor);
 const policyServer=http.createServer(async(req,res)=>{
   if(req.headers['x-internal-api-key']!=='isolated-test-key'||req.url!==`/api/v1/internal/legal/requirements/PARTNER_ADHESION/${actor}`){res.writeHead(401);res.end('{}');return;}
   res.setHeader('content-type','application/json');res.end(JSON.stringify(await legal.requirement('PARTNER_ADHESION',actor)));
 });
 await new Promise(resolve=>policyServer.listen(0,'127.0.0.1',resolve));
 try{
   const submission=new DocumentsService(sellers,{get:key=>key==='catalogService.baseUrl'?`http://127.0.0.1:${policyServer.address().port}`:key==='catalogService.apiKey'?'isolated-test-key':undefined});
   await assert.rejects(submission.submit(ctx),/Accept the current published/);
   await legal.accept(agreement.id,actor);
   assert.equal((await submission.submit(ctx)).reviewStatus,'UNDER_REVIEW');
   assert.equal((await sellers.seller.findUnique({where:{id:seller.id}})).status,'PENDING');
 }finally{await new Promise(resolve=>policyServer.close(resolve));await legal.revoke(agreement.id);}
 await sellers.partnerDocumentType.update({where:{id:type.id},data:{active:false}});
 const created=[];
 try{
   while(await sellers.partnerDocumentType.count({where:{active:true}})<10){created.push((await docs.configure('Isolated configurable requirement',false)).id);}
   await assert.rejects(docs.configure('Eleventh type',false),/At most ten/);
 }finally{await sellers.partnerDocumentType.updateMany({where:{id:{in:created}},data:{active:false}});}
 let requests=0;const requestedKeys=[];
 const server=http.createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{requests++;requestedKeys.push(JSON.parse(body).idempotencyKey);res.writeHead(requests===1?503:202);res.end('{}');});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
   const dispatcher=new SellerNotificationDispatcher(sellers,{get:()=>({baseUrl:`http://127.0.0.1:${server.address().port}`,apiKey:'isolated-test-key'})});
   const pending=await sellers.sellerNotificationJob.findFirst({where:{userId:actor},orderBy:{createdAt:'asc'}});
   assert.ok(pending);
   await sellers.sellerNotificationJob.update({where:{id:pending.id},data:{createdAt:new Date(0)}});
   await dispatcher.dispatch();
   const retry=await sellers.sellerNotificationJob.findUnique({where:{id:pending.id}});
   assert.equal(retry.status,'PENDING');assert.equal(retry.attempts,1);assert.ok(retry.nextAttemptAt>new Date());
   await sellers.sellerNotificationJob.update({where:{id:pending.id},data:{nextAttemptAt:new Date(0)}});
   await Promise.all([dispatcher.dispatch(),dispatcher.dispatch()]);
   assert.equal((await sellers.sellerNotificationJob.findUnique({where:{id:pending.id}})).status,'ENQUEUED');
   assert.equal(requestedKeys.filter(key=>key===pending.idempotencyKey).length,2);
 }finally{await new Promise(resolve=>server.close(resolve));}
 console.log('PASS PostgreSQL legal publication/revocation/version proof, immutable acceptance, 8 concurrent accepts; private partner uploads, owner/IDOR checks, correction/reupload, stale-review protection and download audit.');
}
main().finally(()=>Promise.all([catalog.$disconnect(),sellers.$disconnect()])).catch(e=>{console.error(e);process.exitCode=1;});
