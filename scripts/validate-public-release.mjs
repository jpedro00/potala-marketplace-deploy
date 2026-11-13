// Public production smoke only: bounded reads plus malformed requests rejected before persistence.
import {mkdir,writeFile} from 'node:fs/promises';
const frontend='https://marketing-place-potala.vercel.app';
const api='https://potala-marketplace-deploy-1.onrender.com/api/v1';
const checks=[];
async function check(name,url,expected,{method='GET',body,headers={},json=false}={}) {
 const start=performance.now();
 try {
  const response=await fetch(url,{method,headers:{...headers,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'follow',signal:AbortSignal.timeout(45000)});
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{}
  const result={name,url,method,status:response.status,expected,passed:expected.includes(response.status),ms:Math.round(performance.now()-start)};
  if(json&&response.ok){result.summary=Array.isArray(data)?{items:data.length}:Array.isArray(data?.items)?{items:data.items.length}:{configured:data?.configured,status:data?.status};}
  if(response.ok&&url.includes('/public/products')&&data){const items=Array.isArray(data)?data:data.items??[];result.testProductTitles=items.filter(p=>/TESTE REGRESSAO|1663039609/i.test(p.title??'')).map(p=>p.title);}
  if(response.ok&&url.startsWith(frontend))result.hasForm=/<form\b/i.test(text);
  checks.push(result);
 }catch{checks.push({name,url,method,expected,passed:false,error:'network_or_timeout',ms:Math.round(performance.now()-start)});}
}
const pages=['/','/catalogo','/cursos','/eventos','/contato','/recuperar-senha','/redefinir-senha','/confirmar-email','/termos','/privacidade','/cookies','/compra-troca-cancelamento','/adesao-parceiro','/robots.txt','/sitemap.xml'];
const reads=['/health/ready','/public/products','/public/categories','/activities','/public/product-attributes?itemType=PHYSICAL','/legal/policies/TERMS','/legal/policies/PRIVACY','/legal/policies/COOKIES','/legal/policies/PURCHASE_RETURNS','/legal/policies/PARTNER_ADHESION'];
const protectedPaths=['/notifications','/me/enrollments','/orders','/seller/settings/delivery','/seller/onboarding/documents','/admin/access','/admin/reports','/admin/analytics','/admin/contacts','/admin/legal/policies'];
const tasks=[...pages.map(path=>()=>check('Página '+path,frontend+path,[200])),...reads.map(path=>()=>check('API '+path,api+path,[200],{json:true})),...protectedPaths.map(path=>()=>check('Sem sessão '+path,api+path,[401,403]))];
for(let i=0;i<tasks.length;i+=3)await Promise.all(tasks.slice(i,i+3).map(task=>task()));
await check('Recuperação valida campos',api+'/auth/password/forgot',[400],{method:'POST',body:{},headers:{origin:frontend}});
await check('Reset recusa token inválido',api+'/auth/password/reset',[400],{method:'POST',body:{token:'invalid',password:'not-a-real-password'},headers:{origin:frontend}});
await check('Contato valida campos',api+'/public/contact',[400],{method:'POST',body:{},headers:{origin:frontend}});
await check('Rotas internas não públicas',api+'/internal/sessions/introspect',[404],{method:'POST',body:{},headers:{origin:frontend}});
const report={checkedAt:new Date().toISOString(),scope:'public read-only production checks; no authenticated user changes, no real payments or emails',checks,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length};
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/public-release-validation-20261113.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,failed:report.failed,failures:checks.filter(c=>!c.passed),findings:checks.filter(c=>c.testProductTitles?.length||c.summary?.configured===false).map(c=>({name:c.name,summary:c.summary,testProductTitles:c.testProductTitles}))},null,2));
