import {pathToFileURL} from 'node:url';

/** Read-only preflight. No messages, tokens or account mutations are generated. */
export async function checkBrevo(env,{remote=false,fetcher=globalThis.fetch}={}) {
  const read=key=>(env[`IDENTITY_${key}`]??env[key]??'').trim();
  const key=read('BREVO_API_KEY'),sender=read('BREVO_SENDER_EMAIL');
  if(!key||/REPLACE_ME|CHANGE_ME/.test(key))throw Error('Configure IDENTITY_BREVO_API_KEY with an API key');
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(sender))throw Error('Configure IDENTITY_BREVO_SENDER_EMAIL');
  if(Buffer.from(read('NOTIFICATION_ENCRYPTION_KEY'),'base64').length!==32)throw Error('Configure IDENTITY_NOTIFICATION_ENCRYPTION_KEY: 32 bytes encoded in base64');
  const rawOrigin=read('ACCOUNT_ACTION_ORIGIN')||env.FRONTEND_URL;
  let origin;
  try{origin=new URL(rawOrigin);}catch{throw Error('Invalid account action origin');}
  if(origin.origin!==rawOrigin||origin.username||origin.password||!['https:','http:'].includes(origin.protocol)||(origin.protocol==='http:'&&(!['localhost','127.0.0.1'].includes(origin.hostname)||env.NODE_ENV==='production')))throw Error('Invalid account action origin: use exact HTTPS origin');
  if(env.FRONTEND_URL&&origin.origin!==env.FRONTEND_URL)throw Error('Account action origin must match FRONTEND_URL');
  for(const name of ['NOTIFICATION_DISPATCH_ENABLED','REQUIRE_EMAIL_CONFIRMATION'])if(read(name)&&!['true','false'].includes(read(name)))throw Error(`Invalid ${name}: use true or false`);
  const result={configured:true,dispatchEnabled:read('NOTIFICATION_DISPATCH_ENABLED')==='true',confirmationRequired:read('REQUIRE_EMAIL_CONFIRMATION')==='true',remoteChecked:remote};
  if(!remote)return result;
  let response;
  try{response=await fetcher('https://api.brevo.com/v3/senders',{method:'GET',redirect:'error',headers:{'api-key':key,accept:'application/json'},signal:AbortSignal.timeout(15000)});}catch{throw Error('Brevo connection unavailable');}
  if(!response.ok)throw Error(`Brevo sender verification failed (HTTP ${response.status})`);
  let body;try{body=await response.json();}catch{throw Error('Invalid Brevo sender response');}
  if(!Array.isArray(body.senders)||!body.senders.some(row=>typeof row.email==='string'&&row.email.toLowerCase()===sender.toLowerCase()&&row.active===true))throw Error('Configured sender is not active in Brevo');
  return {...result,senderActive:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try{console.log(JSON.stringify(await checkBrevo(process.env,{remote:process.argv.includes('--remote')})));}
  catch(error){console.error(`[brevo-check] ${error.message}`);process.exitCode=1;}
}
