import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {config, FROM} from '../lib/config.mjs';
import * as relay from '../lib/os-mail.mjs';
import {renderParticipationReminderTemplate, PARTICIPATION_REMINDER_SUBJECT} from '../lib/participation-reminder-template-v1/participation-reminder-template.mjs';

const settings=config({OS_MAIL_RELAY_SECRET:'s'.repeat(40),OS_ORIGIN:'https://os.example.invalid',OS_PARTICIPATION_DELIVERY_ENABLED:'true',OS_PARTICIPATION_TEST_RECIPIENT:'owner@example.invalid'});
const legacy={purpose:'participation',to:'owner@example.invalid',url:settings.osOrigin+'/participant'};
const reminder={...legacy,variant:'pre-occurrence-v1'};
const PURPOSE='participation-reminder-v1';
const request=(value,key)=>new Request('https://mail.example.invalid/api/system/os-mail',{method:'POST',headers:{authorization:`Bearer ${settings.osMailSecret}`,'content-type':'application/json','idempotency-key':key},body:JSON.stringify(value)});
const statusRequest=key=>new Request('https://mail.example.invalid/api/system/os-mail/status',{method:'POST',headers:{authorization:`Bearer ${settings.osMailSecret}`,'content-type':'application/json'},body:JSON.stringify({idempotencyKey:key})});
const digest=value=>createHmac('sha256',settings.osMailSecret).update(value).digest('hex');
function fixture(){
  const rows=new Map(),sends=[],marks=[],reservations=[],observations=[],rates=[];
  const db={
    osMailIntent:async key=>rows.get(key)||null,
    reserveOsMail:async value=>{
      reservations.push(value);const old=rows.get(value.keyHash);
      if(old){if(old.payload_hash!==value.payloadHash||old.purpose!==value.purpose)return {reserved:false,state:'conflict'};if(old.state==='preflight'&&!old.attempted_at){old.state='creating';return {reserved:true};}return {...old,reserved:false};}
      rows.set(value.keyHash,{key_hash:value.keyHash,payload_hash:value.payloadHash,purpose:value.purpose,recipient_hash:value.recipientHash,correlation_hash:value.correlationHash,state:'creating',attempted_at:null,provider_id:null,provider_facts:{}});return {reserved:true};
    },
    markOsMailAttempt:async value=>{marks.push(value);const row=rows.get(value.keyHash);assert.equal(row.payload_hash,value.payloadHash);if(row.state!=='creating'||row.attempted_at)return {...row,attempt:false};row.attempted_at='2030-01-01T00:00:00.000Z';return {...row,attempt:true};},
    finishParticipationMail:async(key,hash,state,safeCode,{providerId=null,facts={}}={})=>{const row=rows.get(key);assert.equal(row.payload_hash,hash);if(row.state!=='creating')return row;assert.ok(!(state==='preflight'&&row.attempted_at));Object.assign(row,{state,safe_code:safeCode,provider_id:providerId||row.provider_id,provider_facts:{...row.provider_facts,...facts}});return row;},
    rate:async value=>{rates.push(value);return true;},
    observeParticipationMail:async(key,id,type,binding)=>{const row=rows.get(key);observations.push(binding);assert.equal(row.provider_id,id);assert.equal(binding.purpose,row.purpose);assert.equal(binding.payloadHash,row.payload_hash);row.provider_facts=relay.mergeProviderFacts(row.provider_facts,type);return row;},
  };
  const mail={ready:async()=>{},suppression:async()=>null,sendOsMail:async(message,key,options)=>{sends.push({message,key,options});return {id:'provider-'+sends.length};}};
  const call=(value=reminder,key='fictional-reminder-key',configured=settings)=>relay.handleOsMail(request(value,key),{db,mail,settings:configured});
  const status=key=>relay.handleOsMailStatus(statusRequest(key),{db,mail,settings});
  const feedbackClient={query:async(sql,args)=>{
    if(sql.startsWith('SELECT'))return {rows:[...rows.values()].filter(row=>['participation',PURPOSE].includes(row.purpose)&&(row.provider_id===args[0]||args[1]&&row.correlation_hash===args[1]))};
    assert.ok(sql.startsWith('UPDATE newsletter_os_mail_intents'));const row=rows.get(args[0]);assert.ok(row);row.state=['creating','unknown'].includes(row.state)?'accepted':row.state;row.provider_id??=args[1];row.provider_facts=JSON.parse(args[2]);return {rowCount:1};
  }};
  return {rows,sends,marks,reservations,observations,rates,db,mail,call,status,feedbackClient};
}
function event(row,subject,type='email.delivered'){
  return {type,created_at:'2030-01-01T00:00:01.000Z',data:{email_id:row.provider_id||'early-provider',from:FROM,to:[legacy.to],subject,tags:{os_delivery:row.correlation_hash}}};
}

test('omitted variant preserves the pinned legacy normalized JSON, hash, render and native key',async()=>{
  const golden=JSON.parse(await readFile(new URL('./fixtures/participation-legacy-golden-v1.json',import.meta.url),'utf8'));
  assert.deepEqual(legacy,golden.input);const value=relay.validateOsMail(legacy,settings);
  assert.equal(JSON.stringify(value),golden.validatedJson);assert.equal(digest(JSON.stringify(value)),golden.payloadHash);
  assert.equal(relay.osMailKeyHash(golden.key),golden.keyHash);assert.deepEqual(relay.renderOsMail(value),golden.rendered);
  const f=fixture();assert.equal((await f.call(legacy,golden.key)).status,202);const row=f.rows.get(golden.keyHash);
  assert.equal(row.purpose,'participation');assert.equal(row.payload_hash,golden.payloadHash);assert.deepEqual(f.sends[0].message,golden.rendered);assert.equal(f.sends[0].key,'os-'+golden.keyHash);
  assert.equal((await f.call(legacy,golden.key,{...settings,participationEnabled:false})).body.state,'accepted');assert.equal(f.sends.length,1);
});
test('fixed reminder variant sends canonical V3 copy with a distinct persisted purpose and payload hash',async()=>{
  const f=fixture();assert.equal((await f.call()).status,202);const normalized=relay.validateOsMail(reminder,settings),r=f.reservations[0];
  assert.deepEqual(normalized,reminder);assert.equal(r.purpose,PURPOSE);assert.equal(r.payloadHash,digest(JSON.stringify(reminder)));assert.notEqual(r.payloadHash,digest(JSON.stringify(legacy)));
  const {subject,html,text}=renderParticipationReminderTemplate(reminder.url);assert.deepEqual(f.sends[0].message,{to:reminder.to,subject,html,text});assert.equal(subject,PARTICIPATION_REMINDER_SUBJECT);
  assert.deepEqual(r.rateKeys,[]);assert.equal(f.marks.length,1);assert.deepEqual(f.marks[0].rateKeys.map(k=>k.limit),[200,10]);assert.equal(f.sends.length,1);
  assert.doesNotMatch(JSON.stringify([...f.rows.values()]),/owner@example|https:\/\/|asked for a reminder/);
});
test('only the explicit fixed variant is admitted and no caller text or internal purpose is public authority',async()=>{
  const f=fixture();for(const value of [null,undefined,'','pre-occurrence-v2','participation-reminder-v1',{},['pre-occurrence-v1']])assert.throws(()=>relay.validateOsMail({...legacy,variant:value},settings));
  for(const value of [{...reminder,purpose:PURPOSE},{...reminder,purpose:'login'},{...reminder,message:'private instructions'},{...reminder,title:'Occurrence details'},{...reminder,organizationName:'Private organization'},{...reminder,templateVersion:'arbitrary'},{...reminder,recipientAuthority:true}])await assert.rejects(f.call(value));
  assert.equal(f.reservations.length,0);assert.equal(f.sends.length,0);
});
test('reminder variant retains the canonical HTTPS clean origin/path bound without changing legacy local notice',()=>{
  for(const url of [reminder.url+'?',reminder.url+'#',reminder.url+'?receipt=secret','https://elsewhere.example.invalid/participant',settings.osOrigin+'/participant/',settings.osOrigin+'/app'])assert.throws(()=>relay.validateOsMail({...reminder,url},settings));
  const local={...settings,osOrigin:'http://127.0.0.1:4444'},port={...settings,osOrigin:'https://os.example.invalid:4444'};
  assert.throws(()=>relay.validateOsMail({...reminder,url:local.osOrigin+'/participant'},local));assert.throws(()=>relay.validateOsMail({...reminder,url:port.osOrigin+'/participant'},port));
  const old=relay.validateOsMail({...legacy,url:local.osOrigin+'/participant'},local);assert.equal(old.url,local.osOrigin+'/participant');assert.equal(relay.renderOsMail(old).subject,relay.PARTICIPATION_SUBJECT);
});
test('reminder preflight can explicitly resume unchanged once without charging or sending before readiness',async()=>{
  const f=fixture();f.mail.ready=async()=>{throw new Error('fictional unready');};const first=await f.call();
  assert.equal(first.body.safeCode,'preflight_unavailable');assert.equal(f.marks.length,0);assert.equal(f.sends.length,0);assert.equal(f.rows.get(relay.osMailKeyHash('fictional-reminder-key')).purpose,PURPOSE);
  f.mail.ready=async()=>{};assert.equal((await f.call()).status,202);assert.equal(f.marks.length,1);assert.equal(f.sends.length,1);assert.equal((await f.call()).body.state,'accepted');assert.equal(f.sends.length,1);
});
test('reminder ambiguous transport remains stopped and configuration gates cannot hide the retained outcome',async()=>{
  const f=fixture();let sends=0;f.mail.sendOsMail=async()=>{sends++;throw {ambiguous:true};};assert.equal((await f.call()).body.state,'unknown');
  assert.equal((await f.call(reminder,'fictional-reminder-key',{...settings,participationEnabled:false})).body.state,'unknown');assert.equal(sends,1);assert.equal(f.marks.length,1);
});
test('one exact key cannot change between generic participation and reminder in either direction',async()=>{
  for(const [first,second] of [[legacy,reminder],[reminder,legacy]]){const f=fixture();assert.equal((await f.call(first)).status,202);const result=await f.call(second);assert.equal(result.status,409);assert.equal(result.body.safeCode,'intent_conflict');assert.equal(f.sends.length,1);assert.equal(f.reservations.length,1);}
});
test('status requires the one matching subject for each persisted purpose and binds the observed payload hash',async()=>{
  for(const [input,subject,wrong] of [[legacy,relay.PARTICIPATION_SUBJECT,PARTICIPATION_REMINDER_SUBJECT],[reminder,PARTICIPATION_REMINDER_SUBJECT,relay.PARTICIPATION_SUBJECT]]){
    const f=fixture();await f.call(input);const row=f.rows.get(relay.osMailKeyHash('fictional-reminder-key'));
    f.mail.getEmail=async()=>({id:row.provider_id,from:FROM,to:[input.to],subject:wrong,last_event:'delivered'});assert.equal((await f.status('fictional-reminder-key')).body.state,'accepted');assert.equal(f.observations.length,0);
    f.mail.getEmail=async()=>({id:row.provider_id,from:FROM,to:[input.to],subject,last_event:'delivered'});assert.equal((await f.status('fictional-reminder-key')).body.state,'delivered');assert.deepEqual(f.observations,[{purpose:row.purpose,payloadHash:row.payload_hash}]);assert.equal(f.sends.length,1);
  }
});
test('feedback cannot use the other fixed subject even when recipient and opaque correlation match',async()=>{
  for(const [input,subject,wrong] of [[legacy,relay.PARTICIPATION_SUBJECT,PARTICIPATION_REMINDER_SUBJECT],[reminder,PARTICIPATION_REMINDER_SUBJECT,relay.PARTICIPATION_SUBJECT]]){
    const f=fixture();await f.call(input);const row=f.rows.get(relay.osMailKeyHash('fictional-reminder-key'));
    await relay.applyOsMailFeedback(f.feedbackClient,event(row,wrong),settings);assert.deepEqual(row.provider_facts,{});
    for(const patch of [{from:'Other <other@example.invalid>'},{to:['other@example.invalid']},{email_id:'not-this-provider',tags:{}}])await relay.applyOsMailFeedback(f.feedbackClient,{...event(row,subject),data:{...event(row,subject).data,...patch}},settings);
    assert.deepEqual(row.provider_facts,{});await relay.applyOsMailFeedback(f.feedbackClient,event(row,subject),settings);assert.equal(relay.osMailOutcome(row).state,'delivered');
  }
});
test('early reminder callback uses only an existing attempted row and survives the eventual send response',async()=>{
  const f=fixture();f.mail.sendOsMail=async(message,key,options)=>{f.sends.push({message,key,options});const row=f.rows.get(relay.osMailKeyHash('fictional-reminder-key'));assert.ok(row.attempted_at);assert.equal(row.provider_id,null);await relay.applyOsMailFeedback(f.feedbackClient,event(row,message.subject),settings);return {id:'early-provider'};};
  const r=await f.call();assert.deepEqual(r.body,{ok:true,state:'delivered',safeCode:'provider_delivered',providerEventAt:'2030-01-01T00:00:01.000Z'});assert.equal(f.sends.length,1);assert.equal((await f.call()).body.state,'delivered');assert.equal(f.sends.length,1);
});
test('suppression binds the existing reminder provider and recipient without inventing a subject or authority',async()=>{
  const f=fixture();await f.call();const row=f.rows.get(relay.osMailKeyHash('fictional-reminder-key'));
  const e={type:'suppression.added',created_at:'2030-01-01T00:00:02.000Z',data:{source_id:row.provider_id,email:reminder.to}};
  await relay.applyOsMailFeedback(f.feedbackClient,{...e,data:{...e.data,email:'other@example.invalid'}},settings);assert.deepEqual(row.provider_facts,{});
  await relay.applyOsMailFeedback(f.feedbackClient,e,settings);assert.equal(relay.osMailOutcome(row).state,'suppressed');assert.equal(f.sends.length,1);
});
test('persisted row purpose disagreement is a conflict and cannot be reinterpreted by the matching payload hash',async()=>{
  const f=fixture();await f.call();const row=f.rows.get(relay.osMailKeyHash('fictional-reminder-key'));row.purpose='participation';assert.equal((await f.call()).body.safeCode,'intent_conflict');assert.equal(f.sends.length,1);
});
