// Existing frontend Playwright/installed Chrome; lab samples, not field Core Web Vitals.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { localOrigin,percentile,save } from './ops-common.mjs';
const require=createRequire(resolve('../marketing-place-potala-frontend/package.json'));
const { chromium }=require('@playwright/test');
const origin=localOrigin(process.env.OPS_FRONTEND_URL??'http://127.0.0.1:3000');
const api=localOrigin(process.env.OPS_BASE_URL??'http://127.0.0.1:18080');
const ready=await fetch(api+'/api/v1/health/ready',{redirect:'error',signal:AbortSignal.timeout(5000)});
if(!ready.ok) throw new Error('Local API must be healthy for representative LCP content');
const samples=Number(process.env.OPS_LCP_SAMPLES??5);
if(!Number.isInteger(samples)||samples<3||samples>20) throw new Error('LCP samples must be3..20');
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try {
 for(const viewport of [{name:'desktop',width:1365,height:768},{name:'mobile',width:390,height:844}]) {
  for(const path of ['/','/catalogo','/cursos']) {
   const rows=[];
   for(let i=0;i<samples;i++) {
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:1,isMobile:viewport.name==='mobile'});
    await context.addInitScript(()=>{window.__opsLcp=null; new PerformanceObserver(list=>{for(const e of list.getEntries()) window.__opsLcp={startTime:e.startTime,size:e.size,tag:e.element?.tagName??null};}).observe({type:'largest-contentful-paint',buffered:true});});
    const page=await context.newPage();
    try { const response=await page.goto(origin+path,{waitUntil:'networkidle',timeout:30000});await page.waitForTimeout(2000);const metrics=await page.evaluate(()=>({lcp:window.__opsLcp,navigation:performance.getEntriesByType('navigation')[0]?.toJSON()}));rows.push({status:response.status(),lcp:metrics.lcp,navigation:metrics.navigation}); }
    catch(e) {rows.push({error:e.message});}
    finally {await context.close();}
   }
   const values=rows.filter(r=>r.status===200&&r.lcp).map(r=>r.lcp.startTime);
   results.push({path,viewport,samples:rows,successfulLcpSamples:values.length,lcpP75Ms:percentile(values,.75),within3000Ms:values.length===samples&&percentile(values,.75)<=3000});
  }
 }
 await save('artifacts/ops-lcp.json',{checkedAt:new Date().toISOString(),origin,browser:browser.version(),conditions:{headless:true,coldContextEachSample:true,networkThrottle:false,cpuThrottle:false,sharedLocalHardware:true},results,limitations:['Laboratory samples only; not field p75','Does not prove Safari Firefox Edge or two browser versions','Public pages only; backend must be healthy for representative content']});
 console.log(JSON.stringify(results.map(({path,viewport,lcpP75Ms,successfulLcpSamples,within3000Ms})=>({path,viewport:viewport.name,lcpP75Ms,successfulLcpSamples,within3000Ms})),null,2));
} finally {await browser.close();}
