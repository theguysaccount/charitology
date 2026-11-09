/** Worker/transport orchestration only. The sealed current-authority reader is
 * replaced at import time by a fictional closed context; production has no
 * context override. Actual reader SQL/roles/consent remain separate evidence. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {hash,csrf} from '../lib/security.mjs';
import {renderParticipationReminderTemplate} from '../lib/participation-reminder-template.mjs';
import {makeWorkerFixture,clone,ORG,EMAIL,PERSON,settings} from './fixtures/participation-reminder-worker.mjs';
let currentFixture;
mock.module(new URL('../lib/participation-reminder-context.mjs',import.meta.url).href,{namedExports:{readReminderWorkerContext:(...args)=>currentFixture.readContext(...args)}});
// Optional-audit refusal only. Real capacity/SQL and its other entry points
// are deliberately outside this fictional worker/authority orchestration suite.
const unexpectedCapacity=()=>{throw new Error('UNEXPECTED_CAPACITY_OPERATION_IN_WORKER_UNIT');};
mock.module(new URL('../lib/participation-reminder-capacity.mjs',import.meta.url).href,{namedExports:{
 canRetainReminderSafetyAudit:(...args)=>currentFixture.refuseCapacityAudit(...args),
 checkReminderOrdinaryCapacity:unexpectedCapacity,checkReminderSafetyCapacity:unexpectedCapacity,
 requireReminderMeasuredCapacity:unexpectedCapacity,canRetainReminderParticipationNotice:unexpectedCapacity,
 measureReminderParticipationAccounting:unexpectedCapacity,reminderSizingIdentities:unexpectedCapacity,
}});
const {runParticipationDelivery,suppressParticipationDelivery,ownDeliveryRoutes}=await import('../lib/participation-delivery.mjs');
const {REMINDER_FIRST_ATTEMPT_SQL,clearParticipationReminderAuthority}=await import('../lib/participation-reminder-worker.mjs');
const fixture=options=>currentFixture=makeWorkerFixture({attemptSql:REMINDER_FIRST_ATTEMPT_SQL,...options});
const job=f=>[...f.outbox.values()][0];
const budget=remaining=>({remaining:remaining??20,deadline:Date.now()+45000});
const run=(f,options={})=>runParticipationDelivery({db:f.db,transport:f.transport,settings:options.settings||settings,budget:options.budget||budget()});
const failedAuthority=(status=409)=>Object.assign(new Error('Fictional current authority changed'),{status,code:'participation_reminder_schedule_authority'});

test('reminder uses the same loop, genuine-clock query and durable commit before the exact fixed relay envelope',async()=>{
  const f=fixture(),row=job(f),key=row.relay_key,b=budget();const result=await run(f,{budget:b});
  assert.equal(result.attempted,1);assert.equal(result.reconciled,0);assert.equal(b.remaining,19);assert.equal(f.contextCalls.length,1);
  assert.deepEqual(f.sends[0].message,{purpose:'participation',to:EMAIL,url:settings.origin+'/participant',variant:'pre-occurrence-v1'});assert.equal(f.sends[0].key,key);assert.equal(f.sends[0].deadline,b.deadline);
  assert.equal(row.first_attempt_at,f.sqlClock);assert.equal(row.state,'accepted');assert.equal(row.attempts,1);assert.equal(f.calls.filter(x=>x.sql===REMINDER_FIRST_ATTEMPT_SQL).length,1);
  assert.ok(f.events.indexOf('tenant-lock')<f.events.indexOf('current-context'));assert.ok(f.events.indexOf('current-context')<f.events.indexOf('sql-clock'));assert.ok(f.events.indexOf('checkpoint-staged')<f.events.indexOf('send'));
  assert.equal(f.events[f.events.indexOf('send')-1],'commit');
});
test('exact SQL6 due boundary is inclusive and start boundary is exclusive independent of process time',async()=>{
  for(const [clock,attempted,state]of [['2030-01-02T09:59:59.999999Z',0,'pending'],['2030-01-02T10:00:00.000000Z',1,'accepted'],['2030-01-03T09:59:59.999999Z',1,'accepted'],['2030-01-03T10:00:00.000000Z',0,'cancelled'],['2030-01-03T10:00:00.000001Z',0,'cancelled']]){
    const f=fixture({sqlClock:clock}),row=job(f);await run(f);assert.equal(f.sends.length,attempted,clock);assert.equal(row.state,state,clock);assert.equal(row.first_attempt_at,attempted?clock:null,clock);
  }
});
test('the conditional checkpoint SQL has one post-lock clock and no transaction-now first attempt',()=>{
  assert.equal((REMINDER_FIRST_ATTEMPT_SQL.match(/clock_timestamp\(\)/g)||[]).length,1);assert.match(REMINDER_FIRST_ATTEMPT_SQL,/WITH moment AS MATERIALIZED/);assert.match(REMINDER_FIRST_ATTEMPT_SQL,/first_attempt_at=moment\.n/);assert.match(REMINDER_FIRST_ATTEMPT_SQL,/\$4::timestamptz<=moment\.n AND moment\.n<\$5::timestamptz/);
  assert.match(REMINDER_FIRST_ATTEMPT_SQL,/o\.lease_owner=\$3/);assert.match(REMINDER_FIRST_ATTEMPT_SQL,/o\.lease_until>moment\.n/);assert.match(REMINDER_FIRST_ATTEMPT_SQL,/o\.first_attempt_at IS NULL/);assert.match(REMINDER_FIRST_ATTEMPT_SQL,/o\.intent_kind='reminder'/);assert.doesNotMatch(REMINDER_FIRST_ATTEMPT_SQL,/\bnow\(\)|Date/);
});
test('an eligible current context cannot send when the conditional UPDATE did not start its owned row',async()=>{
  const f=fixture();f.forceNoAttempt=true;await run(f);assert.equal(f.sends.length,0);assert.equal(f.statuses.length,0);assert.equal(job(f).first_attempt_at,null);assert.equal(job(f).state,'pending');
});
test('original actor current-incarnation or current-source authority refusal cancels before a clock or transport attempt',async()=>{
  for(const status of [401,403,404,409,422]){const f=fixture();f.contextError=failedAuthority(status);const r=await run(f);assert.equal(r.cancelled,1);assert.equal(f.contextCalls.length,1);assert.equal(f.sends.length,0);assert.equal(job(f).state,'cancelled');assert.equal(f.events.includes('sql-clock'),false);}
});
test('current person, both stored bindings, source/template/policy and original receipt changes cannot use the queued key',async()=>{
  const changes=[f=>f.person.revision++,f=>f.person.state='cancelled',f=>f.person.recovered=true,f=>f.person.source='recovered',f=>f.person.reminder_consent.revision++,f=>f.person.reminder_consent.userId='other-user',f=>f.person.reminder_consent.enabled=false,f=>f.context.item.recipient.email='other@example.invalid',f=>f.context.target.sourceSha256=hash('changed-source'),f=>f.context.template=renderParticipationReminderTemplate('https://other.example.invalid/participant'),f=>f.policy.epoch='f'.repeat(32),f=>f.policy.enabled=false,f=>f.context.scheduled.commitmentSha256=hash('other-commitment'),f=>job(f).consent_copy='old-copy',f=>job(f).payload_hash=hash('other-message'),f=>job(f).payload.reminder=null,f=>job(f).payload.privateRecipient=EMAIL];
  for(const change of changes){const f=fixture();change(f);const r=await run(f);assert.equal(r.cancelled,1);assert.equal(f.sends.length,0);assert.equal(job(f).first_attempt_at,null);}
});
test('the worker never supplies an old browser session or caller authority override to its context reader',async()=>{
  const f=fixture();assert.ok(f.context.schedule.payload.receipt.authority.sessionSha256);delete f.context.session;await run(f);assert.equal(f.sends.length,1);assert.equal(f.contextCalls.length,1);
});
test('attempted and unknown/accepted/delivered work is status-only even after current authority disappears',async()=>{
  for(const [state,attempt]of [['unknown',null],['accepted',null],['delivered',null],['pending','2030-01-02T10:00:00.000001Z'],['unknown','2030-01-02T10:00:00.000001Z']]){
    const f=fixture(),row=job(f);Object.assign(row,{state,first_attempt_at:attempt});f.contextError=failedAuthority();const r=await run(f);assert.equal(r.reconciled,1);assert.equal(f.sends.length,0);assert.equal(f.statuses.length,1);assert.equal(f.contextCalls.length,0);assert.equal(f.events.includes('sql-clock'),false);
  }
});
test('an interrupted possible attempt retains its checkpoint and later performs only keyed status',async()=>{
  const f=fixture();f.throwSend=true;await run(f);const row=job(f),first=row.first_attempt_at,key=row.relay_key;assert.equal(row.state,'unknown');assert.equal(f.sends.length,1);row.ready=true;f.contextError=failedAuthority();await run(f);assert.equal(f.sends.length,1);assert.equal(f.statuses.length,1);assert.equal(f.statuses[0].key,key);assert.equal(f.contextCalls.length,1);assert.equal(row.first_attempt_at,first);
});
test('only typed SEND preflight proof clears the checkpoint and reuses the exact key after fresh checks',async()=>{
  const f=fixture();f.transportSend={state:'unavailable',safeCode:'preflight_unavailable',providerEventAt:null};await run(f);const row=job(f);assert.equal(row.state,'pending');assert.equal(row.first_attempt_at,null);assert.equal(f.sends.length,1);const first=clone(f.sends[0]);
  row.ready=true;f.transportSend={state:'accepted',safeCode:'provider_accepted',providerEventAt:null};await run(f);assert.equal(f.contextCalls.length,2);assert.equal(f.sends.length,2);assert.equal(f.sends[1].key,first.key);assert.deepEqual(f.sends[1].message,first.message);assert.equal(row.attempts,2);
});
test('status absence/preflight-looking results never clear a possible attempt or permit a SEND',async()=>{
  const f=fixture(),row=job(f);row.state='unknown';row.first_attempt_at='2030-01-02T10:00:00.000001Z';f.transportStatus={state:'unavailable',safeCode:'preflight_unavailable',providerEventAt:null};await run(f);assert.equal(row.state,'unknown');assert.equal(row.first_attempt_at,'2030-01-02T10:00:00.000001Z');assert.equal(f.sends.length,0);assert.equal(f.statuses.length,1);
});
test('service/test-recipient gates defer in-window work but cannot make a closed window eligible',async()=>{
  for(const configured of [{...settings,participationDeliveryEnabled:false},{...settings,participationTestRecipient:'other@example.invalid'}]){
    const f=fixture();await run(f,{settings:configured});assert.equal(job(f).state,'pending');assert.equal(job(f).first_attempt_at,null);assert.equal(f.sends.length,0);
    const closed=fixture({sqlClock:'2030-01-03T10:00:00.000000Z'});await run(closed,{settings:configured});assert.equal(job(closed).state,'cancelled');assert.equal(closed.sends.length,0);
  }
});
test('recovered legacy markers, unknown kinds and other purposes/channels never enter either transport path',async()=>{
  for(const patch of [{intent_kind:'legacy',state:'pending'},{intent_kind:'unrecognized'},{purpose:'reminder'},{channel:'sms'}]){const f=fixture();Object.assign(job(f),patch);const b=budget();await run(f,{budget:b});assert.equal(f.sends.length+f.statuses.length,0);assert.equal(f.contextCalls.length,0);assert.equal(b.remaining,20);}
});
test('reminders share the existing twenty-operation budget with status work and do not run a second scheduler',async()=>{
  const f=fixture({count:21});for(const [n,row]of [...f.outbox.values()].entries())if(n){row.intent_kind='transition';delete row.payload.reminder;row.event_revision=n+1;row.payload.revision=n+1;row.participation_revision=n+1;row.template_version='participation-notice-v1';row.first_attempt_at='2030-01-02T09:00:00.000001Z';row.state='unknown';}
  const b=budget();const result=await run(f,{budget:b});assert.equal(b.remaining,0);assert.equal(result.attempted,1);assert.equal(result.reconciled,19);assert.equal(f.sends.length+f.statuses.length,20);assert.equal([...f.outbox.values()].filter(row=>row.ready&&!row.lease_owner).length,1);
});
test('an exhausted shared budget performs no tenant query, context read or transport',async()=>{
  const f=fixture(),r=await run(f,{budget:budget(0)});assert.equal(r.attempted,0);assert.equal(f.calls.length,0);assert.equal(f.sends.length+f.statuses.length,0);
});
test('losing the lease nonce cannot send or resurrect another worker owned row',async()=>{
  const f=fixture();f.loseLease=true;await run(f);assert.equal(f.sends.length,0);assert.equal(f.contextCalls.length,0);assert.equal(job(f).lease_owner,'f'.repeat(32));assert.equal(job(f).state,'leased');assert.equal(job(f).first_attempt_at,null);
});
test('malformed/contradictory SQL clock evidence rolls back the staged checkpoint without transport',async()=>{
  for(const patch of [{at_exact:'2030-01-02T10:00:00.000Z'},{is_due:false},{before_start:false},{attempted:'yes'}]){
    const f=fixture();f.clockPatch=patch;await assert.rejects(run(f),e=>e.code==='participation_reminder_clock');assert.equal(job(f).first_attempt_at,null);assert.equal(job(f).attempts,0);assert.equal(f.sends.length,0);assert.ok(f.events.includes('rollback'));
  }
});
test('privacy authority clearing is scoped, leaves NULL untouched and saturates an exhausted revision',async()=>{
  const f=fixture();f.person.revision=2147483647;assert.equal(await f.db.tx('',ORG,c=>clearParticipationReminderAuthority(c,{org:ORG,participationId:PERSON})),1);assert.equal(f.person.revision,2147483647);assert.equal(f.person.reminder_consent,null);
  assert.equal(await f.db.tx('',ORG,c=>clearParticipationReminderAuthority(c,{org:ORG,participationId:PERSON})),0);assert.equal(f.person.revision,2147483647);
  const before=f.calls.length;await assert.rejects(clearParticipationReminderAuthority({query(){throw Error('unexpected');}},{org:ORG}),e=>e.code==='participation_reminder_scope');assert.equal(f.calls.length,before);
});
test('erasure/unlink/general-off clear reminder authority while policy disable and supersession do not invent a preference',async()=>{
  for(const reason of ['erased','unlink','preference_off']){const f=fixture();await f.db.tx('',ORG,c=>suppressParticipationDelivery(c,{org:ORG,participationId:PERSON,reason}));assert.equal(f.person.reminder_consent,null);assert.equal(job(f).state,'cancelled');}
  for(const reason of ['policy_disabled','superseded']){const f=fixture(),original=clone(f.person.reminder_consent);await f.db.tx('',ORG,c=>suppressParticipationDelivery(c,{org:ORG,participationId:PERSON,reason}));assert.deepEqual(f.person.reminder_consent,original);}
});
test('bound provider suppression clears both consents safely at MAX revision and cannot clear another recipient choice',async()=>{
  for(const changedRecipient of [false,true]){
    const f=fixture(),row=job(f);row.state='unknown';row.first_attempt_at='2030-01-02T10:00:00.000001Z';f.person.revision=2147483647;
    if(changedRecipient){f.person.reminder_consent.recipientSha256=hash('new@example.invalid');f.person.delivery_consent.recipientHash=hash('new@example.invalid');}
    const original=clone(f.person.reminder_consent);f.transportStatus={state:'suppressed',safeCode:'provider_bounced',providerEventAt:'2030-01-02T10:00:01.000Z'};await run(f);
    assert.equal(row.state,'suppressed');assert.equal(f.person.revision,2147483647);assert.equal(f.sends.length,0);
    if(changedRecipient){assert.deepEqual(f.person.reminder_consent,original);assert.equal(f.person.delivery_consent.enabled,true);}else{assert.equal(f.person.reminder_consent,null);assert.equal(f.person.delivery_consent.enabled,false);}
  }
});
test('general email-OFF returns the post-clearing revision when optional audit capacity refuses',async()=>{
  const f=fixture(),before=f.person.revision,session={user:{id:'fictional-user',email:EMAIL,emailVerified:true},session:{id:'fictional-own-session'}};
  // The actual reminder-present audit branch reaches only the disclosed
  // refusal mock, never a fabricated absence or complete capacity success.
  f.auditUsage=0;
  const input={revision:before,intakeRevision:f.intake.revision,enabled:false,consentVersion:'participation-email-v1',idempotencyKey:'fictional-own-off-key-123'};
  const request=new Request(settings.origin+`/api/participant/orgs/${ORG}/requests/fictional-intake/participations/${PERSON}/delivery-preference`,{method:'POST',headers:{origin:settings.origin,'content-type':'application/json','x-csrf-token':csrf(session.session.id,settings.secret)},body:JSON.stringify(input)});
  const response=await ownDeliveryRoutes({request,db:f.db,settings,session}),body=await response.json();assert.equal(body.revision,before+2);assert.equal(body.revision,f.person.revision);assert.equal(body.delivery.enabled,false);assert.equal(f.person.reminder_consent,null);assert.equal(body.auditRetained,false);assert.equal(f.capacityAuditRefusals.length,1);
});
test('old provider bounce leaves a differently bound new reminder and choice intact while old notice cancellation remains unchanged',async()=>{
  const nextEmail='new@example.invalid',f=fixture({recipientEmail:nextEmail,eventRevision:2}),reminder=job(f);
  const oldNotice={...clone(reminder),id:'0'.repeat(32),event_revision:1,participation_revision:4,intent_kind:'transition',consent_copy:'participation-email-v1',consent_revision:1,template_version:'participation-notice-v1',recipient_hash:hash(EMAIL),relay_key:'participation-old-'+'0'.repeat(32),state:'unknown',first_attempt_at:'2030-01-02T09:00:00.000001Z',payload:{state:'confirmed',participationId:PERSON,revision:1}};
  const futureNotice={...clone(reminder),id:'2'.repeat(32),event_revision:3,intent_kind:'snapshot',consent_copy:'participation-email-v1',consent_revision:f.person.delivery_consent.revision,template_version:'participation-notice-v1',relay_key:'participation-future-'+'2'.repeat(32),payload:{state:'confirmed',participationId:PERSON,revision:3}};
  f.outbox.clear();for(const row of [oldNotice,reminder,futureNotice])f.outbox.set(row.id,row);
  const original=clone(f.person.reminder_consent);f.transportStatus={state:'suppressed',safeCode:'provider_bounced',providerEventAt:'2030-01-02T10:00:01.000Z'};
  const result=await run(f,{budget:budget(1),settings:{...settings,participationTestRecipient:nextEmail}});
  assert.equal(result.reconciled,1);assert.equal(f.sends.length,0);assert.equal(f.contextCalls.length,0);assert.equal(oldNotice.state,'suppressed');
  assert.deepEqual(f.person.reminder_consent,original);assert.equal(f.person.delivery_consent.enabled,true);
  assert.equal(reminder.state,'pending');assert.equal(reminder.recipient_hash,hash(nextEmail));assert.equal(reminder.first_attempt_at,null);
  assert.equal(futureNotice.state,'cancelled','Existing notice behavior remains unchanged even for a new recipient.');
  const matching=fixture();await matching.db.tx('',ORG,c=>suppressParticipationDelivery(c,{org:ORG,participationId:PERSON,reason:'recipient_blocked',recipientSha256:hash(EMAIL)}));assert.equal(job(matching).state,'cancelled','Matching-recipient unattempted reminders remain cancellable.');
});
test('valid general-consent revision ceiling survives automatic erasure/unlink privacy removal',async()=>{
  for(const reason of ['erased','unlink']){
    const f=fixture();f.person.revision=2147483647;f.person.delivery_consent.revision=2147483647;
    await f.db.tx('',ORG,c=>suppressParticipationDelivery(c,{org:ORG,participationId:PERSON,reason}));
    assert.equal(f.person.delivery_consent.enabled,false);assert.equal(f.person.delivery_consent.revision,2147483647);assert.equal(f.person.revision,2147483647);assert.equal(f.person.reminder_consent,null);
    const query=f.calls.find(x=>x.sql.startsWith('UPDATE os_participations SET delivery_consent=jsonb_build_object'));assert.match(query.sql,/LEAST\(COALESCE\(\(delivery_consent->>'revision'\)::bigint,0\)\+1,2147483647\)::integer/);
  }
});
test('valid general-consent revision ceiling survives bound provider-block removal',async()=>{
  const f=fixture(),row=job(f);row.state='unknown';row.first_attempt_at='2030-01-02T09:00:00.000001Z';f.person.revision=2147483647;f.person.delivery_consent.revision=2147483647;
  f.transportStatus={state:'suppressed',safeCode:'provider_bounced',providerEventAt:'2030-01-02T10:00:01.000Z'};await run(f,{budget:budget(1)});
  assert.equal(row.state,'suppressed');assert.equal(f.person.delivery_consent.enabled,false);assert.equal(f.person.delivery_consent.revision,2147483647);assert.equal(f.person.revision,2147483647);assert.equal(f.person.reminder_consent,null);assert.equal(f.sends.length,0);
  const query=f.calls.find(x=>x.sql.startsWith('UPDATE os_participations SET delivery_consent=jsonb_build_object'));assert.match(query.sql,/LEAST\(COALESCE\(\(delivery_consent->>'revision'\)::bigint,0\)\+1,2147483647\)::integer/);
});
