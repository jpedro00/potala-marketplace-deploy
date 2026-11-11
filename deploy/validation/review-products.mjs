// Read-only by default. Reversible deactivation only for the exact confirmed fixture.
import { mkdir, writeFile } from 'node:fs/promises';
const base=(process.env.POTALA_API_BASE_URL??'https://potala-marketplace-deploy-1.onrender.com/api/v1').replace(/\/$/,'');
const url=new URL(base);
if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('Invalid API origin');
if(url.protocol==='http:'&&!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('HTTP only on loopback');
const fixture={id:'b84181c0-5b7f-4f5f-9645-9dd8ad2e49a2',title:'TESTE REGRESSAO Produto Seller B 1663039609',slug:'teste-regressao-produto-seller-b-1663039609'};
const apply=process.argv.includes('--apply');
const cookie=apply?process.env.POTALA_ADMIN_COOKIE:undefined;
if(apply&&!cookie)throw new Error('POTALA_ADMIN_COOKIE required for authenticated reversible moderation');
const origin=process.env.POTALA_FRONTEND_ORIGIN??'https://marketing-place-potala.vercel.app';
async function request(path,method='GET') {
  const response=await fetch(base+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{origin,...(cookie?{cookie}:{}),...(method==='PATCH'?{'content-type':'application/json'}:{})},...(method==='PATCH'?{body:'{}'}:{})});
  if(!response.ok)throw new Error(`API ${method} failed with status ${response.status}; no credentials or body printed`);
  return response.json();
}
const rows=[];let cursor;
for(let page=0;page<100;page++){
  const query=new URLSearchParams({limit:'100',...(cursor?{cursor}:{})});
  const result=await request(`${apply?'/admin':'/public'}/products?${query}`);
  const items=Array.isArray(result)?result:result.items;
  if(!Array.isArray(items))throw new Error('Unexpected product response');
  rows.push(...items);
  const next=result.pageInfo?.nextCursor??result.nextCursor;
  if(!next)break;
  if(next===cursor||page===99)throw new Error('Unbounded pagination refused');cursor=next;
}
const target=rows.find(row=>row.id===fixture.id);
if(target&&(target.title!==fixture.title||target.slug!==fixture.slug))throw new Error('Fixture identity changed: human review required');
const summary={checkedAt:new Date().toISOString(),base,mode:apply?'authenticated-deactivation':'read-only',count:rows.length,fixture:target?{...fixture,status:target.status}:null,findings:rows.filter(row=>/TESTE REGRESSAO|\uFFFD/.test(row.title??'')).map(row=>({id:row.id,title:row.title,status:row.status,reason:row.id===fixture.id?'confirmed-regression-fixture':'editorial-review-required'}))};
await mkdir('artifacts',{recursive:true});
const path=`artifacts/product-review-${Date.now()}.json`;
await writeFile(path,JSON.stringify({...summary,...(apply?{backupBefore:target}: {})},null,2));
if(apply){
  if(!target)throw new Error('Fixture not found; no mutation');
  if(target.status==='ACTIVE'){
    const result=await request(`/admin/products/${fixture.id}/deactivate`,'PATCH');
    if(result.status!=='INACTIVE')throw new Error('Moderation result needs verification');
    console.log('Confirmed fixture deactivated; rollback is authenticated PATCH /admin/products/'+fixture.id+'/activate.');
  }else if(target.status!=='INACTIVE')throw new Error('Unexpected status; human review required');
}
console.log(JSON.stringify(summary,null,2));console.log('Evidence saved to '+path+'; no product was physically deleted.');
