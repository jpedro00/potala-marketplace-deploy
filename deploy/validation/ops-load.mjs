// Loopback-only GET traffic. 1,000 simulated users is a requested scenario, never a capacity claim.
import { cpus,totalmem,freemem } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { localOrigin, percentile, save } from './ops-common.mjs';
const origin=localOrigin(process.env.OPS_BASE_URL ?? 'http://127.0.0.1:18080');
const users=Number(process.env.OPS_USERS ?? 1000), seconds=Number(process.env.OPS_SECONDS ?? 30), ramp=Number(process.env.OPS_RAMP_SECONDS ?? 10);
if (!Number.isInteger(users)||users<1||users>1000||!Number.isFinite(seconds)||seconds<1||seconds>120||!Number.isFinite(ramp)||ramp<0||ramp>seconds) throw new Error('Bounds: users1..1000 duration1..120 ramp0..duration');
const machine={logicalCPUs:cpus().length,totalMemoryBytes:totalmem(),freeMemoryBeforeBytes:freemem(),node:process.version};
const paths=['/api/v1/health/ready','/api/v1/public/products','/api/v1/activities'];
const probe=await fetch(origin+paths[0],{signal:AbortSignal.timeout(5000),redirect:'error'});
if(!probe.ok) throw new Error('Local target must be ready before load');
const latencies=[],statuses={},errors={},byPath={}; let inFlight=0,peakInFlight=0,peakRSS=0,completed=0;
const started=performance.now(); const until=started+seconds*1000;
const sample=setInterval(()=>{peakRSS=Math.max(peakRSS,process.memoryUsage().rss);},250);
await Promise.all(Array.from({length:users},async(_,id)=>{
  await delay(ramp*1000*id/users);
  let iteration=0;
  while(performance.now()<until) {
    const path=paths[(id+iteration++)%paths.length];
    const t=performance.now(); inFlight++; peakInFlight=Math.max(peakInFlight,inFlight);
    try { const r=await fetch(origin+path,{signal:AbortSignal.timeout(5000),redirect:'error'}); await r.arrayBuffer(); statuses[r.status]=(statuses[r.status]??0)+1; byPath[path]??={}; byPath[path][r.status]=(byPath[path][r.status]??0)+1; }
    catch(e) { const key=e.name; errors[key]=(errors[key]??0)+1; }
    finally { latencies.push(performance.now()-t); inFlight--; completed++; }
    await delay(1000); // One request per user per second plus latency, bounded memory and no request bodies.
  }
}));
clearInterval(sample);
const elapsedMs=performance.now()-started;
const result={checkedAt:new Date().toISOString(),origin,machine:{...machine,freeMemoryAfterBytes:freemem()},scenario:{users,seconds,rampSeconds:ramp,thinkTimeMs:1000,paths,authentication:'public GET only'},elapsedMs,completed,peakInFlight,loadDriverPeakRSSBytes:peakRSS,statuses,byPath,errors,latencyMs:{p50:percentile(latencies,.5),p75:percentile(latencies,.75),p95:percentile(latencies,.95),p99:percentile(latencies,.99),max:percentile(latencies,1)},limitations:['Driver and target share hardware','No production capacity claim','No authenticated workload; public read scenario only','Driver RSS does not measure target memory']};
await save('artifacts/ops-load.json',result); await save('artifacts/ops-load-'+users+'-users.json',result); console.log(JSON.stringify(result,null,2));
if(Object.keys(errors).length||Object.keys(statuses).some(s=>Number(s)>=400)) process.exitCode=1;
