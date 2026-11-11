import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { localOrigin,save } from './ops-common.mjs';
const origin=localOrigin(process.env.OPS_FRONTEND_URL??'http://127.0.0.1:3000');
const mappings=JSON.parse(await readFile('../marketing-place-potala-frontend/legacy-redirects.json','utf8'));
const sources=new Set();
for(const row of mappings) {assert.match(row.source,/^\/[a-zA-Z0-9/_-]*$/);assert.match(row.destination,/^\/[a-zA-Z0-9/_-]*$/);assert.ok(!row.source.startsWith('//')&&!row.destination.startsWith('//'));assert.equal(row.statusCode,301);assert.notEqual(row.source,row.destination);assert.ok(!sources.has(row.source));sources.add(row.source);}
assert.ok(mappings.every(row=>!sources.has(row.destination)));
const evidence=[];
for(const row of mappings) {const r=await fetch(origin+row.source,{redirect:'manual',signal:AbortSignal.timeout(10000)});const location=r.headers.get('location');assert.equal(r.status,301);assert.equal(new URL(location,origin).href,origin+row.destination);evidence.push({...row,observedStatus:r.status,observedLocation:location});}
await save('artifacts/ops-redirect-probe.json',{checkedAt:new Date().toISOString(),origin,evidence}); console.log(`Verified ${evidence.length} HTTP 301 mapping(s)`);
