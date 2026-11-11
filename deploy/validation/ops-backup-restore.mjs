// Restores only a freshly created, uniquely named database on the disposable loopback cluster.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir,readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join,resolve } from 'node:path';
import assert from 'node:assert/strict';
import { save } from './ops-common.mjs';
if(process.env.OPS_ALLOW_DISPOSABLE_RESTORE!=='1') throw new Error('Set OPS_ALLOW_DISPOSABLE_RESTORE=1 only for local disposable data');
const bin=process.env.OPS_PG_BIN??'C:/Program Files/PostgreSQL/17/bin';
const source='potala_completion';
const target='ops_restore_'+Date.now();
const dir='artifacts/ops-backup-'+Date.now(); await mkdir(dir,{recursive:true});
const backup=join(dir,'snapshot.dump');
const run=promisify(execFile);
const conn=['--host=127.0.0.1','--port=55434','--username=potala_test','--no-password'];
const env={...process.env,PGHOST:'127.0.0.1',PGPORT:'55434',PGUSER:'potala_test',PGPASSWORD:'',PGDATABASE:source,PGOPTIONS:'-c timezone=UTC -c client_encoding=UTF8 -c statement_timeout=30000'};
delete env.PGSERVICE; delete env.PGSERVICEFILE;
async function pg(name,args){return (await run(join(bin,name+'.exe'),args,{env,maxBuffer:20*1024*1024,timeout:180000})).stdout.trim();}
async function sql(db,q){return pg('psql',[...conn,'--dbname='+db,'--no-psqlrc','--set=ON_ERROR_STOP=1','--tuples-only','--no-align','--command',q]);}
const fingerprint=await sql(source,"SELECT json_build_object('database',current_database(),'port',inet_server_port(),'address',inet_server_addr(),'version',current_setting('server_version_num'),'dataDirectory',current_setting('data_directory'),'user',current_user)");
const actual=JSON.parse(fingerprint);assert.equal(actual.database,source);assert.equal(actual.port,55434);assert.equal(actual.address,'127.0.0.1');assert.equal(actual.user,'potala_test');
assert.equal(actual.dataDirectory.replaceAll('\\','/').toLowerCase(),resolve('artifacts/ops-postgres-20261111').replaceAll('\\','/').toLowerCase(),'Refuse any cluster outside the disposable artifact directory');
const schemas=['identity','sellers','catalog','orders'];
async function integrity(db) {
 const tables=JSON.parse(await sql(db,"SELECT coalesce(json_agg(json_build_object('schema',schemaname,'table',tablename) ORDER BY schemaname,tablename),'[]') FROM pg_tables WHERE schemaname IN ('identity','sellers','catalog','orders')"));
 assert.ok(tables.length>0,'Disposable database must contain marketplace schemas');
 const counts=[]; let totalBytes=0;
 for(const t of tables) {
   assert.ok(schemas.includes(t.schema));const quoted='"'+t.schema+'"."'+t.table.replaceAll('"','""')+'"';
   const stats=JSON.parse(await sql(db,`SELECT json_build_object('count',count(*),'bytes',coalesce(sum(octet_length(to_jsonb(t)::text)),0)) FROM ${quoted} t`));
   totalBytes+=Number(stats.bytes);
   assert.ok(stats.count<=100000 && stats.bytes<=10*1024*1024 && totalBytes<=100*1024*1024,'Digest proof is bounded to small disposable fixtures');
   const sha256=await sql(db,`SELECT encode(sha256(convert_to(coalesce(string_agg(j,E'\\n' ORDER BY j COLLATE "C"),''),'UTF8')),'hex') FROM (SELECT to_jsonb(t)::text j FROM ${quoted} t) rows`);
   counts.push({...t,count:Number(stats.count),jsonBytes:Number(stats.bytes),sha256});
 }
 // All native FK constraints are validated after restore, not merely table existence.
 const constraints=JSON.parse(await sql(db,"SELECT coalesce(json_agg(json_build_object('schema',n.nspname,'table',r.relname,'name',c.conname,'definition',pg_get_constraintdef(c.oid),'validated',c.convalidated) ORDER BY n.nspname,r.relname,c.conname),'[]') FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE c.contype='f' AND n.nspname IN ('identity','sellers','catalog','orders')"));
 assert.ok(constraints.length>0,'Expected representative native FK constraints');assert.ok(constraints.every(c=>c.validated),'Every foreign key must be validated');
 // Restored constraints are checked against rows by PostgreSQL while pg_restore builds them.
 return {counts,foreignKeys:constraints};
}
const before=await integrity(source);const start=performance.now();
await pg('pg_dump',[...conn,'--dbname='+source,'--format=custom','--no-owner','--file='+backup]);const dumpMs=performance.now()-start;
// createdb fails if the target already exists: no drop, clean, overwrite or supplied restore URL.
await pg('createdb',[...conn,'--template=template0',target]);const restoreStart=performance.now();
await pg('pg_restore',[...conn,'--dbname='+target,'--no-owner','--no-privileges','--exit-on-error',backup]);const restoreMs=performance.now()-restoreStart;
const after=await integrity(target);assert.deepEqual(after,before,'Restored counts, canonical row digests and referential constraints must match source snapshot');
const bytes=await readFile(backup);const report={checkedAt:new Date().toISOString(),sourceFingerprint:actual,targetDatabase:target,backupPath:backup,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),dumpMs,restoreMs,integrity:after,passed:true,limitations:['Disposable local database only; not a production backup','Source must be quiescent during before/dump comparisons','No cross-service FK guarantee where domain IDs intentionally lack native foreign keys','Restore target retained for review; no automatic deletion']};
await save(dir+'/proof.json',report);await save('artifacts/ops-backup-latest.json',report);console.log(JSON.stringify({passed:true,target,dumpMs,restoreMs,tables:after.counts.length,foreignKeys:after.foreignKeys.length,bytes:bytes.length}));
