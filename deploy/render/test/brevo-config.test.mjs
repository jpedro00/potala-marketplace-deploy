import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkBrevo} from '../check-brevo.mjs';
const environment=()=>({NODE_ENV:'production',FRONTEND_URL:'https://shop.example.test',IDENTITY_BREVO_API_KEY:'private-api-key',IDENTITY_BREVO_SENDER_EMAIL:'sender@example.test',IDENTITY_NOTIFICATION_ENCRYPTION_KEY:Buffer.alloc(32,1).toString('base64'),IDENTITY_NOTIFICATION_DISPATCH_ENABLED:'true'});
test('offline check validates configuration without HTTP or revealing credentials',async()=>{
 const fetcher=()=>{throw Error('Unexpected network');};
 const result=await checkBrevo(environment(),{fetcher});
 assert.deepEqual(result,{configured:true,dispatchEnabled:true,confirmationRequired:false,remoteChecked:false});
 assert.ok(!JSON.stringify(result).includes('private-api-key'));
});
test('rejects missing key, invalid encryption and unsafe production origin before HTTP',async()=>{
 for(const update of [{IDENTITY_BREVO_API_KEY:''},{IDENTITY_NOTIFICATION_ENCRYPTION_KEY:'bad'},{FRONTEND_URL:'http://shop.example.test'},{IDENTITY_ACCOUNT_ACTION_ORIGIN:'https://other.example.test'}])await assert.rejects(checkBrevo({...environment(),...update}),/Configure|Invalid|match/);
});
test('remote check only reads sender status; never sends email or exposes provider errors',async()=>{
 let calls=0;
 const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://api.brevo.com/v3/senders');assert.equal(options.method,'GET');assert.equal(options.headers['api-key'],'private-api-key');return {ok:true,json:async()=>({senders:[{email:'sender@example.test',active:true}]})};};
 assert.equal((await checkBrevo(environment(),{remote:true,fetcher})).senderActive,true);assert.equal(calls,1);
 await assert.rejects(checkBrevo(environment(),{remote:true,fetcher:async()=>({ok:false,status:401,text:async()=> 'private-api-key'})}),error=>!error.message.includes('private-api-key')&&error.message.includes('401'));
});
test('remote check refuses unverified sender and redacts network exceptions',async()=>{
 await assert.rejects(checkBrevo(environment(),{remote:true,fetcher:async()=>({ok:true,json:async()=>({senders:[{email:'sender@example.test',active:false}]})})}),/active/);
 await assert.rejects(checkBrevo(environment(),{remote:true,fetcher:async()=>{throw Error('private-api-key');}}),error=>error.message==='Brevo connection unavailable');
});
