// Configuration metadata only. Does not read provider account MFA or rotate credentials.
import { readFile } from 'node:fs/promises';
import { save } from './ops-common.mjs';
const paths=['deploy/render/env.example',...['identity','sellers','catalog','orders','api-gateway'].map(n=>'potala-'+n+(n==='api-gateway'?'':'-service')+'/.env')];
const files=[];
for(const path of paths) {
 try { const body=await readFile(path,'utf8');const names=[...body.matchAll(/^\s*([A-Z][A-Z0-9_]+)\s*=/gm)].map(m=>m[1]);files.push({path,exists:true,variableNames:[...new Set(names)].sort()}); }
 catch(e) {if(e.code!=='ENOENT')throw e;files.push({path,exists:false});}
}
const result={checkedAt:new Date().toISOString(),files,providerMFA:{status:'not_verified',reason:'No account security metadata was available; source configuration cannot prove provider MFA.'},secretRotation:{status:'not_executed',reason:'Requires coordinated deployment across all service clients and providers plus revocation evidence. No values printed or modified.'}};
await save('artifacts/ops-security-metadata.json',result);console.log(JSON.stringify(result,null,2));
