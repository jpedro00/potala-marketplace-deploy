// Fresh, unsigned Chrome contexts only; no submissions, real email or payments.
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const root=resolve(import.meta.dirname,'..');
const require=createRequire(import.meta.url);
const {chromium,expect}=require(join(root,'../marketing-place-potala-frontend/node_modules/@playwright/test'));
const origin='https://marketing-place-potala.vercel.app';
const results=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 await mkdir(join(root,'artifacts'),{recursive:true});
 for(const [name,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]) {
  const context=await browser.newContext({viewport});
  const page=await context.newPage();
  const apiOrigins=new Set(),apiFailures=new Set(),pageErrors=[];
  page.on('request',request=>{const url=new URL(request.url());if(url.pathname.includes('/api/v1/'))apiOrigins.add(url.origin);});
  page.on('response',response=>{const url=new URL(response.url());if(response.status()>=500&&url.pathname.includes('/api/v1/'))apiFailures.add(`${response.status()} ${url.pathname}`);});
  page.on('pageerror',error=>pageErrors.push(error.name));
  for(const path of ['/','/catalogo','/recuperar-senha','/cursos']) {
   try {
    const response=await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:60000});
    await expect(page.locator('body')).toBeVisible();
    if(path==='/recuperar-senha'){await expect(page.locator('input[type=email]')).toBeVisible();await expect(page.getByRole('button',{name:'Solicitar instruções'})).toBeVisible();}
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    results.push({viewport:name,path,status:response?.status(),noHorizontalOverflow:!overflow,passed:response?.status()===200&&!overflow});
    if(name==='desktop'&&path==='/')await page.screenshot({path:join(root,'artifacts/presentation-home-20261113.png'),fullPage:false});
   }catch{results.push({viewport:name,path,passed:false,error:'navigation_or_assertion_failed'});}
  }
  results.push({viewport:name,check:'browser-api-target',origins:[...apiOrigins],apiFailures:[...apiFailures],pageErrors,passed:apiOrigins.size>0&&[...apiOrigins].every(v=>v==='https://potala-marketplace-deploy-1.onrender.com')&&apiFailures.size===0&&pageErrors.length===0});
  await context.close();
 }
} finally {await browser.close();}
await writeFile(join(root,'artifacts/public-browser-validation-20261113.json'),JSON.stringify({checkedAt:new Date().toISOString(),scope:'production public UI; fresh unsigned contexts; no submissions',results},null,2));
console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results},null,2));
