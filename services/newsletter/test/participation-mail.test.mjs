import test from 'node:test';
import assert from 'node:assert/strict';
import {config,FROM} from '../lib/config.mjs';
import {provider} from '../lib/provider.mjs';
import {handleOsMail,handleOsMailStatus,validateOsMail,renderOsMail,osMailKeyHash,osMailOutcome,osMailHmac,osMailCorrelation,mergeProviderFacts,providerEventTime,applyOsMailFeedback,PARTICIPATION_SUBJECT} from '../lib/os-mail.mjs';
const settings=config({OS_MAIL_RELAY_SECRET:'s'.repeat(40),OS_ORIGIN:'https://os.example.invalid',OS_PARTICIPATION_DELIVERY_ENABLED:'true',OS_PARTICIPATION_TEST_RECIPIENT:'owner@example.invalid'});
const payload={purpose:'participation',to:'owner@example.invalid',url:settings.osOrigin+'/participant'};
const request=(value=payload,key='participation-key',extra={})=>new Request('https://mail.example.invalid/api/system/os-mail',{method:'POST',headers:{authorization:`Bearer ${settings.osMailSecret}`,'content-type':'application/json','idempotency-key':key,...extra},body:JSON.stringify(value)});
const statusRequest=(value={idempotencyKey:'participation-key'},extra={},query='')=>new Request('https://mail.example.invalid/api/system/os-mail/status'+query,{method:'POST',headers:{authorization:`Bearer ${settings.osMailSecret}`,'content-type':'application/json',...extra},body:JSON.stringify(value)});
function fixture(overrides={}){
  const rows=new Map(),sends=[],marks=[],rates=[],reserves=[];
  const db={
    osMailIntent:async k=>rows.get(k)||null,
    reserveOsMail:async value=>{reserves.push(value);const old=rows.get(value.keyHash);if(old){if(old.payload_hash!==value.payloadHash)return {state:'conflict',reserved:false};if(old.state==='preflight'&&!old.attempted_at){old.state='creating';return {reserved:true};}return {...old,reserved:false};}rows.set(value.keyHash,{key_hash:value.keyHash,payload_hash:value.payloadHash,purpose:value.purpose,recipient_hash:value.recipientHash,correlation_hash:value.correlationHash,state:'creating',attempted_at:null,provider_facts:{},provider_id:null});return {reserved:true};},
    markOsMailAttempt:async value=>{marks.push(value);const row=rows.get(value.keyHash);if(row.state!=='creating'||row.attempted_at)return {...row,attempt:false};row.attempted_at=new Date();return {...row,attempt:true};},
    finishParticipationMail:async(k,h,state,safeCode,{providerId=null,facts={}}={})=>{const row=rows.get(k);assert.equal(row.payload_hash,h);if(row.state!=='creating')return row;assert.ok(!(state==='preflight'&&row.attempted_at));Object.assign(row,{state,safe_code:safeCode,provider_id:providerId||row.provider_id,provider_facts:{...row.provider_facts,...facts}});return row;},
    rate:async keys=>{rates.push(keys);return true;},
    observeParticipationMail:async(k,id,type)=>{const row=rows.get(k);assert.equal(row.provider_id,id);row.provider_facts=mergeProviderFacts(row.provider_facts,type);return row;},
  };
  const mail={ready:async()=>{},suppression:async()=>null,sendOsMail:async(message,key,options)=>{sends.push({message,key,options});return {id:'provider-id'};},...overrides};
  return {db,mail,rows,sends,marks,rates,reserves,call:(value=payload,key='participation-key',config=settings)=>handleOsMail(request(value,key),{db,mail,settings:config}),status:(value,headers)=>handleOsMailStatus(statusRequest(value,headers),{db,mail,settings})};
}
test('participation gates default closed and test-only defaults cannot enable another recipient',async()=>{
  const defaults=config({});assert.equal(defaults.participationEnabled,false);assert.equal(defaults.participationTestOnly,true);assert.equal(defaults.participationTestRecipient,'');
  const f=fixture();for(const s of [{...settings,participationEnabled:false},{...settings,participationTestRecipient:''},{...settings,participationTestRecipient:'another@example.invalid'}]){const r=await f.call(payload,'participation-key',s);assert.equal(r.status,503);assert.equal(r.body.safeCode,'preflight_unavailable');}
  assert.equal(f.reserves.length,0);assert.equal(f.sends.length,0);
});
test('fixed purpose strictly rejects alternate links and private/custom fields before a reservation',async()=>{
  const f=fixture();for(const value of [{...payload,url:payload.url+'?'},{...payload,url:payload.url+'#'},{...payload,url:payload.url+'?receipt=private'},{...payload,url:settings.osOrigin+'/app'},{...payload,url:'https://other.example.invalid/participant'},{...payload,title:''},{...payload,message:'Private'},{...payload,organizationName:'Private'}])await assert.rejects(f.call(value));
  const rendered=renderOsMail(validateOsMail(payload,settings));assert.equal(rendered.subject,PARTICIPATION_SUBJECT);assert.match(rendered.text,/938 Peacock Station Rd/);assert.match(rendered.text,/does not subscribe/);assert.equal((rendered.text.match(/https:\/\//g)||[]).length,1);assert.equal(f.reserves.length,0);
});
test('preflight defer is proven before attempt and permits exactly the same immutable key again',async()=>{
  const f=fixture();f.mail.ready=async()=>{throw new Error('private failure');};
  const first=await f.call();assert.deepEqual(first.body,{ok:false,state:'unavailable',safeCode:'preflight_unavailable',providerEventAt:null});assert.equal(f.marks.length,0);assert.equal(f.rows.get(osMailKeyHash('participation-key')).attempted_at,null);
  f.mail.ready=async()=>{};assert.equal((await f.call()).body.state,'accepted');assert.equal(f.marks.length,1);assert.equal(f.sends.length,1);assert.ok(f.marks[0].rateKeys.every(k=>k.key.startsWith('os-mail:')));assert.deepEqual(f.reserves[0].rateKeys,[]);
});
test('provider client construction failure remains a proven preflight defer without a send checkpoint',async()=>{
  const f=fixture({withDeadline:()=>{throw new Error('private construction failure');}});
  assert.deepEqual((await f.call()).body,{ok:false,state:'unavailable',safeCode:'preflight_unavailable',providerEventAt:null});assert.equal(f.marks.length,0);assert.equal(f.sends.length,0);
  delete f.mail.withDeadline;assert.equal((await f.call()).body.state,'accepted');assert.equal(f.sends.length,1);
});
test('accepted repeats resolve before disabled gate and never expose provider identity or resend',async()=>{
  const f=fixture();const first=await f.call();assert.equal(first.status,202);assert.deepEqual(Object.keys(first.body).sort(),['ok','providerEventAt','safeCode','state']);
  const again=await f.call(payload,'participation-key',{...settings,participationEnabled:false});assert.equal(again.body.state,'accepted');assert.equal(f.sends.length,1);assert.match(f.sends[0].options.correlationTag,/^[a-f0-9]{64}$/);assert.doesNotMatch(JSON.stringify(first.body),/owner@|provider-id|portal/);
});
test('uncertain POST, checkpoint failure and lost acceptance persistence remain durable no-resend stops',async()=>{
  for(const stage of ['provider','checkpoint','save']){
    const f=fixture();if(stage==='provider')f.mail.sendOsMail=async()=>{f.sends.push({});throw {ambiguous:true};};
    if(stage==='checkpoint')f.db.markOsMailAttempt=async()=>{throw Error('private');};
    if(stage==='save'){const finish=f.db.finishParticipationMail;f.db.finishParticipationMail=async(...args)=>{if(args[2]==='accepted')throw Error('private');return finish(...args);};}
    const first=await f.call();assert.equal(first.body.state,'unknown');const before=f.sends.length;assert.equal((await f.call()).body.state,'unknown');assert.equal(f.sends.length,before);assert.equal(f.rows.get(osMailKeyHash('participation-key')).state,'unknown');
  }
});
test('preflight recipient suppression is terminal without a provider attempt and cannot be cleared by gate change',async()=>{
  const f=fixture({suppression:async()=>({suppressed:true})});const r=await f.call();assert.equal(r.body.state,'suppressed');assert.equal(f.marks.length,0);assert.equal(f.sends.length,0);f.mail.suppression=async()=>null;assert.equal((await f.call()).body.state,'suppressed');assert.equal(f.sends.length,0);
});
test('status authorizes before reads, rejects extra input and has a separate rate budget',async()=>{
  const f=fixture();assert.equal((await f.status(undefined,{authorization:'Bearer wrong'})).status,401);assert.equal((await f.status(undefined,{origin:'null'})).status,403);assert.equal((await f.status({idempotencyKey:'participation-key',email:'private@example.invalid'})).status,400);assert.equal(f.rates.length,0);
  assert.deepEqual((await f.status()).body,{ok:true,state:'unknown',safeCode:'intent_unknown',providerEventAt:null});assert.equal(f.rates[0][0].limit,60);assert.match(f.rates[0][0].key,/^os-mail:status:minute:/);assert.equal(f.reserves.length,0);
});
test('status accepts only one exact Vercel path capture and keeps intent keys body-only',async()=>{
  const f=fixture(),invoke=(query,value)=>handleOsMailStatus(statusRequest(value,{},query),{db:f.db,mail:f.mail,settings});
  const accepted=await invoke('?path=system%2Fos-mail%2Fstatus');assert.equal(accepted.status,200);assert.equal(accepted.body.safeCode,'intent_unknown');assert.equal(f.rates.length,1);
  for(const query of ['?path=wrong','?path=','?path=system/os-mail/status&path=system/os-mail/status','?path=system/os-mail/status&path=wrong','?idempotencyKey=private-key','?path=system/os-mail/status&idempotencyKey=private-key','?path=system/os-mail/status&email=private@example.invalid']){
    const rejected=await invoke(query);assert.equal(rejected.status,400);assert.equal(rejected.body.safeCode,'invalid_request');
  }
  assert.equal((await invoke('?path=system/os-mail/status',{})).status,400);assert.equal(f.rates.length,1);assert.equal(f.reserves.length,0);assert.equal(f.sends.length,0);
});
test('bound retrieval can improve accepted status without inventing event time or copying content',async()=>{
  const f=fixture();await f.call();f.mail.getEmail=async()=>({id:'provider-id',to:[payload.to],from:FROM,subject:PARTICIPATION_SUBJECT,last_event:'delivered',created_at:'2001-01-01 00:00:00+00',html:'private',tags:[]});
  const r=await f.status();assert.deepEqual(r.body,{ok:true,state:'delivered',safeCode:'provider_delivered',providerEventAt:null});assert.equal(f.sends.length,1);
  f.mail.getEmail=async()=>({id:'provider-id',to:['other@example.invalid'],from:FROM,subject:PARTICIPATION_SUBJECT,last_event:'failed'});assert.equal((await f.status()).body.state,'delivered');
});
test('feedback reduction preserves blocking/delivery facts against old callbacks and null poll timestamps',()=>{
  const time='2026-10-26T09:00:00.000Z',facts=mergeProviderFacts(mergeProviderFacts({},'delivered',time),'sent','2026-10-26T08:00:00.000Z');assert.equal(osMailOutcome({state:'accepted',provider_facts:facts}).state,'delivered');
  const blocked=mergeProviderFacts(facts,'complained','2026-10-26T10:00:00.000Z');assert.equal(osMailOutcome({state:'accepted',provider_facts:blocked}).state,'suppressed');assert.equal(mergeProviderFacts(blocked,'delivered').delivered,time);assert.equal(providerEventTime('2026-02-30T09:00:00Z'),null);assert.equal(providerEventTime('2026-10-26T09:00:00.123456789Z'),'2026-10-26T09:00:00.123Z');assert.equal(providerEventTime('2026-10-26T09:00:00.1234567890Z'),null);
});
test('opaque tag binds one existing attempted intent and mismatched recipient/from/tag cannot attach',async()=>{
  const row={key_hash:'a'.repeat(64),purpose:'participation',state:'unknown',attempted_at:new Date(),provider_id:null,recipient_hash:osMailHmac(settings,payload.to),provider_facts:{},correlation_hash:osMailCorrelation(settings,'a'.repeat(64))};
  let updates=0;const c={query:async(sql,args)=>{if(sql.startsWith('SELECT'))return {rows:args[1]===row.correlation_hash?[row]:[]};updates++;assert.equal(args[1],'provider-id');return {rowCount:1};}};
  const event={type:'email.delivered',created_at:'2026-10-26T09:00:00.000Z',data:{email_id:'provider-id',from:FROM,to:[payload.to],subject:PARTICIPATION_SUBJECT,tags:{os_delivery:row.correlation_hash}}};
  await applyOsMailFeedback(c,event,settings);assert.equal(updates,1);for(const patch of [{to:['other@example.invalid']},{from:'Other <other@example.invalid>'},{tags:[]},{subject:'Different'}])await applyOsMailFeedback(c,{...event,data:{...event.data,...patch}},settings);assert.equal(updates,1);
});
test('provider bounds strict suppression absence and never mistakes generic404 for permission',async()=>{
  for(const [status,body,absent]of [[404,{name:'not_found',message:'Suppression not found'},true],[404,{name:'not_found',message:'The requested endpoint does not exist'},false],[403,{name:'not_found',message:'Suppression not found'},false],[404,{name:'not_found',message:'Suppression not found',padding:'x'.repeat(20000)},false]]){
    const calls=[],mail=provider(settings,{credential:async()=>'synthetic',fetcher:async(url,opts)=>{calls.push({url,...opts});return Response.json(body,{status});}});
    if(absent)assert.equal(await mail.suppression(payload.to),null);else await assert.rejects(mail.suppression(payload.to));assert.equal(calls[0].url,'https://api.resend.com/suppressions/owner%40example.invalid');assert.equal(calls[0].method,'GET');
  }
});
test('native send correlation uses HTTP tag array and oversized retrieve bodies fail bounded',async()=>{
  let call;const mail=provider(settings,{credential:async()=>'synthetic',fetcher:async(url,opts)=>{call={url,...opts};return Response.json({id:'provider-id'});}});
  await mail.sendOsMail(renderOsMail(payload),'same-key',{correlationTag:'c'.repeat(64)});assert.deepEqual(JSON.parse(call.body).tags,[{name:'os_delivery',value:'c'.repeat(64)}]);assert.equal(call.headers['Idempotency-Key'],'same-key');
  const large=provider(settings,{credential:async()=>'synthetic',fetcher:async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('x'.repeat(65537)));c.close();}}))});await assert.rejects(large.getEmail('provider-id'));
});
