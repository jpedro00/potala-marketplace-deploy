import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder=new URL('../../migrations/20261117-marketplace/',import.meta.url);
const root=new URL('../../../',import.meta.url);
const digest=value=>createHash('sha256').update(value).digest('hex');
test('marketplace package preserves the 17 original SQL migrations and transaction boundaries',async()=>{
 const manifest=JSON.parse(await readFile(new URL('manifest.json',folder),'utf8'));
 assert.equal(manifest.migrations.length,17);
 for(const item of manifest.migrations){
  assert.ok(['identity','sellers','catalog','orders'].includes(item.schema));
  const source=await readFile(new URL(`potala-${item.schema}-service/prisma/migrations/${item.name}/migration.sql`,root),'utf8');
  const packaged=await readFile(new URL(item.file,folder),'utf8');
  assert.equal(digest(source),item.sourceSha256);
  assert.equal(digest(packaged),item.packageSha256);
  assert.ok(packaged.includes(source));
  assert.ok(packaged.includes('\nBEGIN;\nSET LOCAL lock_timeout'));
  assert.ok(packaged.endsWith('\nCOMMIT;\n'));
  assert.ok(!/^\s*(DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\b/im.test(source));
 }
});
test('preflight inspects metadata only and reported migrations are not silently re-applied',async()=>{
 const preflight=await readFile(new URL('00-preflight-somente-leitura.sql',folder),'utf8');
 assert.ok(!/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|DO|CALL)\b/im.test(preflight));
 assert.ok(preflight.includes('information_schema.columns'));
 assert.ok(!preflight.includes('encryptedPayload'));
 const manifest=JSON.parse(await readFile(new URL('manifest.json',folder),'utf8'));
 assert.equal(manifest.migrations.filter(m=>m.previouslyReportedApplied).length,3);
 const directories=(await readdir(folder,{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name).sort();
 assert.deepEqual(directories,['catalog','identity','orders','sellers']);
});
