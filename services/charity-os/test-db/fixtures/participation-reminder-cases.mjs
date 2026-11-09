/** Ten command/context groups, sharing one genuine fixture-branded test context. */
import assert from 'node:assert/strict';
import {requireReminderTestContext} from './participation-reminder-test-context.mjs';
const opaque=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v),stamp=v=>assert(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(v));
export const REMINDER_CASE_NAMES=Object.freeze([
 'RM01 actual NULL upgrade exact grants and forced tenant RLS',
 'RM02 current own SQL identity access and read-only reads',
 'RM03 separate ON OFF and saturating privacy exit',
 'RM04 latest-only own exact retry and overwritten receipt reconciliation',
 'RM05 typed staff selection minimized preview and current authority',
 'RM06 complete current pins SQL6 staleness and temporal admission',
 'RM07 exact scheduled rows mandatory audit receipt and whole rollback',
 'RM08 concurrent durable staff retry and fresh request authority',
 'RM09 all-state original uniqueness and old-purpose boundaries',
 'RM10 final catalog provider and settled-client readback'
]);
export async function runReminderCases(context,options){
 const {db,owner,M,sql,healthy,upgrade,identity,authAcl,authCatalog,readAuthFacts,trace,providerCalls,key,one,read,edit,artifact,snapshot,noDml,noClock,settings,api,actor,tenant,put,seedTenant,ownPath,staffPath,ownGet,choice,enableAll,preview,schedule,accepted,verifyScheduled,calls,observations,sessionFor,activeCount,settle,refusedCount,setFaultPhase}=requireReminderTestContext(context);
 const descriptor=Object.getOwnPropertyDescriptor(options,'onCase');assert(descriptor&&Object.hasOwn(descriptor,'value'));const onCase=descriptor.value;assert.equal(typeof onCase,'function');assert.equal(REMINDER_CASE_NAMES.length,10);
 const results=[],groups=[];const group=run=>groups.push(run);

 group(async()=>{
  assert.equal(upgrade.newPreferenceNull,true);assert.equal(upgrade.allOldColumnsExact,true);assert.equal(upgrade.actualMigrationPasses,2);
  const f=await seedTenant('catalog'),column=await read(f,c=>one(c,sql.column));assert.deepEqual(column,{type:'jsonb',not_null:false,default_value:null});
  const constraints=await read(f,c=>c.query(sql.constraints).then(r=>r.rows));assert.equal(constraints.length,3);const index=await read(f,c=>one(c,sql.originalIndex));assert.equal(index.unique_index,true);assert.equal(index.valid,true);assert.match(index.definition,/commitmentSha256/);assert.match(index.predicate,/intent_kind/);assert.doesNotMatch(index.predicate,/state/);
  for(const row of await read(f,c=>c.query(sql.rls).then(r=>r.rows))){assert.equal(row.relrowsecurity,true);assert.equal(row.relforcerowsecurity,true);}
  const role=await read(f,c=>one(c,sql.noDdl));for(const k of ['schema_create','rolsuper','rolcreatedb','rolcreaterole','rolinherit','rolreplication','rolbypassrls'])assert.equal(role[k],false);assert.equal(role.memberships,0);
  for(const org of [null,'rm_foreign'])assert.equal(await db.tx(f.actor,org,c=>one(c,'SELECT count(*)::int AS n FROM os_participations').then(r=>r.n),{readOnly:true}),0);
  assert.equal((await db.tx(f.actor,'rm_foreign',c=>c.query("UPDATE os_participations SET reminder_consent='{}'::jsonb WHERE org_id=$1",[f.org]))).rowCount,0);
  await artifact('schema-upgrade-null-and-constrained-identity.json',{upgrade,column,constraints,index,role,authAcl,authCatalog,syntheticAuthOnly:true});return{nullUpgrade:true,allStateIndex:true,forcedRls:true};
 });
 group(async()=>{
  const f=await seedTenant('own_auth'),p=f.people[0],before=await snapshot(f),offset=trace.length,start=observations.length;await ownGet(f);noDml(offset);noClock(offset);assert.deepEqual(await snapshot(f),before);assert(observations.slice(start).every(r=>r.declaredReadOnly&&r.actualReadOnly));
  await api(f,ownPath(f,p)+'/reminder',{user:'anonymous',status:401,throughHandler:true});await ownGet(f,p,{throughHandler:true,status:404});
  const foreign=await actor(f,'rm_foreign_user');await ownGet(f,p,{user:foreign,status:404});
  await owner.query('UPDATE "session" SET "expiresAt"=clock_timestamp()-interval \'1 second\' WHERE id=$1',[sessionFor(f.own).session.id]);await ownGet(f,p,{status:401});await owner.query('UPDATE "session" SET "expiresAt"=clock_timestamp()+interval \'48 hours\' WHERE id=$1',[sessionFor(f.own).session.id]);
  await owner.query('UPDATE "user" SET "emailVerified"=false WHERE id=$1',[f.own]);await ownGet(f,p,{status:401});await owner.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1',[f.own]);
  await owner.query('UPDATE os_participant_links SET revoked_at=clock_timestamp() WHERE org_id=$1',[f.org]);await ownGet(f,p,{status:404});await owner.query('UPDATE os_participant_links SET revoked_at=NULL WHERE org_id=$1',[f.org]);
  const v=await ownGet(f),body={version:1,revision:v.revision,intakeRevision:v.intakeRevision,reminderRevision:0,enabled:true,consentVersion:'participation-reminder-v1',commandKey:key(),commitmentSha256:v.reminder.currentCommitmentSha256};await api(f,ownPath(f,p)+'/reminder-preference',{body,user:f.own,status:403,headers:{'x-csrf-token':'wrong'}});assert.equal((await read(f,c=>one(c,sql.exactPerson,[f.org,p.id]))).row.reminder_consent,null);return{actualSessionLinkCsrf:true,readOnly:true,handlerGateFalse:true};
 });
 group(async()=>{
  const f=await seedTenant('choice'),p=f.people[0];let offset=trace.length;await choice(f,p,false,{status:409});noClock(offset);noDml(offset);
  const on=await choice(f);assert.equal(on.value.reminder.enabled,true);assert.equal((await read(f,c=>one(c,sql.counts,[f.org]))).outbox,0);assert.equal((await read(f,c=>one(c,sql.counts,[f.org]))).tenants,0);
  offset=trace.length;await choice(f,p,true,{status:409});noClock(offset);noDml(offset);
  await owner.query('UPDATE os_participations SET revision=2147483647,reminder_consent=jsonb_set(reminder_consent,\'{revision}\',\'2147483647\') WHERE org_id=$1 AND id=$2',[f.org,p.id]);
  await owner.query("UPDATE os_participation_targets SET mode='paused' WHERE org_id=$1",[f.org]);await owner.query("UPDATE os_records SET status='completed',approval=NULL WHERE org_id=$1 AND id=$2",[f.org,f.source.id]);
  const off=await choice(f,p,false);assert.equal(off.value.revision,2147483647);assert.equal(off.value.reminder.revision,2147483647);assert.equal(off.value.reminder.enabled,false);
  offset=trace.length;await choice(f,p,false,{status:409});noClock(offset);noDml(offset);
  const g=await seedTenant('choice_ceiling');for(const field of ['participation','reminder']){await owner.query('UPDATE os_participations SET revision=$3,reminder_consent=$4::jsonb WHERE org_id=$1 AND id=$2',[g.org,g.people[0].id,field==='participation'?2147483646:3,field==='reminder'?JSON.stringify({version:'participation-reminder-v1',enabled:false,revision:2147483646,atExact:g.clock.history_exact}):null]);offset=trace.length;await choice(g,g.people[0],true,{status:409});noClock(offset);noDml(offset);}
  return{separateChoiceNotScheduling:true,redundantOnRefused:true,offSaturatesAfterClosedSource:true,nullDisabledNoWrite:true};
 });
 group(async()=>{
  const f=await seedTenant('own_retry'),p=f.people[0],first=await choice(f),before=await snapshot(f),offset=trace.length;
  const retry=await api(f,ownPath(f,p)+'/reminder-preference',{body:first.body,user:f.own});const {replayed,...rest}=retry;assert.equal(replayed,true);const {replayed:firstReplayed,...firstResult}=first.value;assert.equal(firstReplayed,false);assert.deepEqual(rest,firstResult);assert.deepEqual(await snapshot(f),before);noClock(offset);noDml(offset);
  await api(f,ownPath(f,p)+'/reminder-preference',{body:{...first.body,commitmentSha256:'f'.repeat(64)},user:f.own,status:409});
  const off=await choice(f,p,false);assert.equal(off.value.reminder.enabled,false);const after=await snapshot(f);await api(f,ownPath(f,p)+'/reminder-preference',{body:first.body,user:f.own,status:409});assert.deepEqual(await snapshot(f),after);
  const exact=await api(f,ownPath(f,p)+'/reminder-preference',{body:off.body,user:f.own});assert.equal(exact.replayed,true);await artifact('own-latest-retry-not-durable-archive.json',{first:first.value,retry,off:off.value,completedValueSuppressionNotSocket:true,latestOnly:true});return{sameLatestWireReadOnly:true,laterChoiceOverwrites:true};
 });
 group(async()=>{
  for(const [name,options]of [['typed_event',{moduleId:'events'}],['typed_volunteer',{moduleId:'volunteers',interval:true,count:20}]]){
   const f=await enableAll(await seedTenant(name,options)),p=await preview(f),rows=await read(f,c=>c.query(sql.previews,[f.org]).then(r=>r.rows));assert.equal(rows.length,1);const saved=M.store.validateReminderStoredRow(rows[0]);assert.equal(saved.payload.state,'pending');assert.equal(saved.payload.packet.items.length,f.people.length);assert.deepEqual(saved.payload.packet.items.map(i=>i.participationId),f.people.map(i=>i.id).sort());stamp(saved.created_exact);stamp(saved.expires_exact);M.model.validateReminderPreviewResponse(p.value);
   const publicJson=JSON.stringify(p.value);assert.doesNotMatch(publicJson,/recipientSha256|userId|linkId|sessionSha256|membershipSha256/);
   const reader=await actor(f,'rm_reader_'+name,'reader@example.invalid');await owner.query("INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'board_reader')",[f.org,reader]);await api(f,staffPath(f,'preview'),{body:p.body,user:reader,status:403});
   if(options.moduleId==='volunteers'){await owner.query("UPDATE os_records SET module_id='outcomes' WHERE org_id=$1 AND id='rm_safeguarding'",[f.org]);await api(f,staffPath(f,'preview'),{body:p.body,status:409});}
  }
  return{eventsAndIntervals:true,selection1And20:true,currentTypedAuthority:true,minimizedPublicDto:true};
 });
 group(async()=>{
  const mutations={source:"UPDATE os_records SET data=data||'{\"participantInstructions\":\"Changed fixture fact\"}'::jsonb WHERE org_id=$1 AND id='rm_target'",dependency:"UPDATE os_records SET created_at=created_at+interval '1 microsecond' WHERE org_id=$1 AND id='rm_program'",intake:'UPDATE os_intake SET revision=revision+1 WHERE org_id=$1',person:'UPDATE os_participations SET revision=revision+1 WHERE org_id=$1',preference:null,link:'UPDATE os_participant_links SET revision=revision+1 WHERE org_id=$1',micro:"UPDATE os_participations SET confirmed_at=confirmed_at+interval '1 microsecond' WHERE org_id=$1",member:"UPDATE os_members SET created_at=created_at+interval '1 microsecond' WHERE org_id=$1",epoch:"INSERT INTO os_events(org_id,actor_id,action,detail) VALUES($1,$2,'backup.restored','{}')",policy:'UPDATE os_participation_delivery_policies SET revision=revision+1 WHERE org_id=$1'};
  for(const [name,q]of Object.entries(mutations)){const f=await enableAll(await seedTenant('stale_'+name)),p=await preview(f);if(name==='preference')await choice(f,f.people[0],false);else await owner.query(q,name==='epoch'?[f.org,f.actor]:[f.org]);const before=await snapshot(f),offset=trace.length;await schedule(p,{status:409});assert.deepEqual(await snapshot(f),before);noClock(offset);noDml(offset);}
  for(const startOffsetSeconds of [0,31968000]){const f=await enableAll(await seedTenant('window_'+startOffsetSeconds,{startOffsetSeconds})),before=await snapshot(f);const participations=[];for(const p of f.people){const v=await ownGet(f,p);participations.push({participationId:p.id,revision:v.revision,intakeRevision:v.intakeRevision});}const offset=trace.length;await api(f,staffPath(f,'preview'),{body:{version:1,target:{moduleId:f.moduleId,targetId:f.source.id,targetRevision:1,sourceRevision:4},participations},status:422});assert.deepEqual(await snapshot(f),before);noDml(offset);assert.equal(trace.slice(offset).filter(r=>r.kind==='REMINDER_DOMAIN_CLOCK').length,1);}
  const equality=await one(owner,sql.strictWindow,['2030-01-01T10:00:00.000000Z','2030-01-01T10:00:00.000000Z','2030-01-01T10:00:00.000000Z']);assert.deepEqual(equality,{before_expiry:false,before_due:false});await artifact('fixed-sql6-equality-not-natural-expiry.json',equality);return{actualRawConsentIncarnationAndPolicyDrift:true,fixedSqlEquality:true};
 });
 group(async()=>{
  const f=await enableAll(await seedTenant('schedule',{count:2})),p=await preview(f),v=await schedule(p),proof=await verifyScheduled(p,v);await artifact('actual-schedule-rows-and-receipt.json',{value:v,proof,fictionalHistoricalApprovalAndConfirmation:true,workerNotRun:true});
  const literal=v=>{assert(opaque(v));return "'"+v+"'";};
  await owner.query(sql.faultFunction);
  try{for(const phase of ['outbox','audit','receipt']){
   const g=await enableAll(await seedTenant('fault_'+phase,{count:2})),q=await preview(g),before=await snapshot(g),table={outbox:'os_participation_outbox',audit:'os_events',receipt:'os_previews'}[phase],event=phase==='receipt'?'UPDATE':'INSERT',name='reminder_test_'+phase;
   await owner.query('CREATE TRIGGER '+name+' BEFORE '+event+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION os_reminder_test_fault('+literal(phase)+','+literal(g.people.at(-1).id)+')');setFaultPhase(phase);
   try{await assert.rejects(schedule(q),e=>e.code==='P0001');}finally{setFaultPhase(null);await owner.query('DROP TRIGGER '+name+' ON '+table);}
   assert.deepEqual(await snapshot(g),before,'Whole tenant rollback at '+phase);
  }}finally{setFaultPhase(null);await owner.query('DROP FUNCTION os_reminder_test_fault()');}
  return{actualSchedule:true,threeMandatoryRollbackStages:true,capacityBoundarySeparate:true};
 });
 group(async()=>{
  const f=await enableAll(await seedTenant('concurrent')),p=await preview(f),all=await Promise.all([schedule(p),schedule(p)]);assert.equal(all.filter(v=>!v.replayed).length,1);assert.equal(all.filter(v=>v.replayed).length,1);assert.deepEqual(accepted(all[0]),accepted(all[1]));await verifyScheduled(p,all[0]);
  await owner.query(sql.expireAccepted,[f.org,p.schedule.previewId]);let stored=(await owner.query(sql.previews,[f.org])).rows[0];await owner.query('UPDATE os_previews SET checksum=$3 WHERE org_id=$1 AND id=$2',[f.org,stored.id,M.security.hash(stored.payload)]);stored=(await owner.query(sql.previews,[f.org])).rows[0];M.store.validateReminderStoredRow(stored);const witness=await one(owner,sql.expiryWitness,[f.org,p.schedule.previewId]);assert.equal(witness.expired,true);
  await owner.query("UPDATE os_records SET data=data||'{\"participantInstructions\":\"Changed after completed scheduling\"}'::jsonb WHERE org_id=$1 AND id='rm_target'",[f.org]);const before=await snapshot(f),offset=trace.length,retry=await schedule(p);assert.equal(retry.replayed,true);assert.deepEqual(accepted(retry),accepted(all[0]));assert.deepEqual(await snapshot(f),before);noClock(offset);noDml(offset);
  await schedule({...p,schedule:{...p.schedule,commandKey:key()}},{status:409});await owner.query('UPDATE "session" SET "expiresAt"=clock_timestamp()-interval \'1 second\' WHERE id=$1',[sessionFor(f.actor).session.id]);await schedule(p,{status:401});await owner.query('UPDATE "session" SET "expiresAt"=clock_timestamp()+interval \'48 hours\' WHERE id=$1',[sessionFor(f.actor).session.id]);await owner.query("UPDATE os_members SET created_at=created_at+interval '1 microsecond' WHERE org_id=$1 AND user_id=$2",[f.org,f.actor]);await schedule(p,{status:409});
  const pending=await preview(await enableAll(await seedTenant('wrong_actor'))),other=await actor(pending.f,'rm_other_admin','other-admin@example.invalid');await owner.query("INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'admin')",[pending.f.org,other]);await schedule(pending,{user:other,status:409});
  const wrongOrg=await tenant('wrong_org');await owner.query("INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'admin')",[wrongOrg.org,pending.f.actor]);await api(wrongOrg,staffPath(wrongOrg,'schedule'),{body:pending.schedule,user:pending.f.actor,status:409});
  const purpose=await preview(await enableAll(await seedTenant('wrong_purpose')));await owner.query("UPDATE os_previews SET kind='future.unknown' WHERE org_id=$1 AND id=$2",[purpose.f.org,purpose.schedule.previewId]);const purposeBefore=await snapshot(purpose.f);await schedule(purpose,{status:409});assert.deepEqual(await snapshot(purpose.f),purposeBefore);
  for(const kind of ['malformed','multiple']){const q=await preview(await enableAll(await seedTenant('bad_'+kind)));await schedule(q);if(kind==='multiple')await owner.query(sql.duplicateReceipt,[q.f.org,q.schedule.previewId,'rm_duplicate_receipt']);else{const raw=(await owner.query(sql.previews,[q.f.org])).rows[0],payload={...raw.payload,version:2};await owner.query('UPDATE os_previews SET payload=$3::jsonb,checksum=$4 WHERE org_id=$1 AND id=$2',[q.f.org,raw.id,JSON.stringify(payload),M.security.hash(payload)]);}const prior=await snapshot(q.f);await schedule(q,{status:kind==='multiple'?409:422});assert.deepEqual(await snapshot(q.f),prior);}
  await artifact('durable-staff-retry-controlled-history-not-walltime.json',{witness,retry,concurrent:all,controlledTimestampTransplantAndChecksum:true,originalPublicResultUnchanged:true,completedValueSuppressionNotSocket:true});return{oneActualConcurrentAcceptance:true,readOnlyRetryAfterControlledExpiry:true,freshSessionAndIncarnation:true};
 });
 group(async()=>{
  for(const state of ['paused','pending','leased','accepted','delivered','suppressed','failed','unknown','cancelled']){
   const f=await enableAll(await seedTenant('original_'+state)),p=await preview(f),v=await schedule(p),row=v.scheduled[0];await owner.query('UPDATE os_participation_outbox SET state=$3 WHERE org_id=$1 AND id=$2',[f.org,row.outboxId,state]);const before=await snapshot(f);
   await assert.rejects(edit(f,c=>c.query(sql.duplicateOriginal,[f.org,row.outboxId,'duplicate_'+state,'reminder_duplicate_'+state])),e=>e.code==='23505');assert.deepEqual(await snapshot(f),before);
   await assert.rejects(edit(f,c=>c.query("UPDATE os_participation_outbox SET payload='{}'::jsonb WHERE org_id=$1 AND id=$2",[f.org,row.outboxId])),e=>e.code==='23514');
  }
  const f=await enableAll(await seedTenant('new_original')),p=await preview(f),first=await schedule(p);await owner.query("UPDATE os_participations SET confirmed_at=confirmed_at+interval '1 microsecond',revision=revision+1 WHERE org_id=$1",[f.org]);await choice(f);const second=await schedule(await preview(f));assert.notEqual(first.scheduled[0].commitmentSha256,second.scheduled[0].commitmentSha256);assert.equal((await read(f,c=>one(c,sql.counts,[f.org]))).outbox,2);
  const previous=(await read(f,c=>c.query(sql.outbox,[f.org]).then(r=>r.rows))).filter(r=>r.row.intent_kind==='reminder').map(r=>r.row);await edit(f,async c=>{const p=(await one(c,sql.exactPerson,[f.org,f.people[0].id])).row;await M.delivery.queueParticipationTransition(c,{org:f.org,participation:p,settings});});const after=(await read(f,c=>c.query(sql.outbox,[f.org]).then(r=>r.rows))).filter(r=>r.row.intent_kind==='reminder').map(r=>r.row);assert.deepEqual(after,previous,'Ordinary transition append/supersession preserves reminders');
  const oldId=first.scheduled[0].outboxId,newId=second.scheduled[0].outboxId;await owner.query("UPDATE os_participation_outbox SET state='unknown',first_attempt_at=clock_timestamp() WHERE org_id=$1 AND id=$2",[f.org,oldId]);const notices=(await read(f,c=>c.query(sql.outbox,[f.org]).then(r=>r.rows))).filter(r=>r.row.intent_kind!=='reminder').map(r=>r.row);await choice(f,f.people[0],false);const exited=await read(f,c=>c.query(sql.outbox,[f.org]).then(r=>r.rows));assert.equal(exited.find(r=>r.row.id===oldId).row.state,'unknown');assert.equal(exited.find(r=>r.row.id===newId).row.state,'cancelled');assert.deepEqual(exited.filter(r=>r.row.intent_kind!=='reminder').map(r=>r.row),notices);
  return{allNineStatesUnique:true,markerSqlGuard:true,newConfirmedOriginalDistinct:true,onlyUnattemptedReminderOff:true,workerAndNativeSeparate:true};
 });
 group(async()=>{
  assert.equal(providerCalls()+refusedCount(),0);assert.equal(activeCount(),0);assert.deepEqual((await owner.query(sql.faultObjects)).rows,[]);const finalAuth=await readAuthFacts();assert.deepEqual(finalAuth.acl,authAcl);assert.deepEqual(finalAuth.catalog,authCatalog);const finalTenant=await tenant('final_readback'),role=await read(finalTenant,c=>one(c,sql.noDdl)),rls=await read(finalTenant,c=>c.query(sql.rls).then(r=>r.rows)),index=await read(finalTenant,c=>one(c,sql.originalIndex));for(const k of ['schema_create','rolsuper','rolcreatedb','rolcreaterole','rolinherit','rolreplication','rolbypassrls'])assert.equal(role[k],false);assert.equal(role.memberships,0);assert(rls.length===3&&rls.every(r=>r.relrowsecurity&&r.relforcerowsecurity));assert(index.unique_index&&index.valid);
  const pids=[...new Set(trace.map(v=>v.backendPid).filter(Number.isSafeInteger))],observer=await db.pool.connect();let activities;try{activities=(await observer.query(sql.poolActivity,[pids])).rows;}finally{observer.release();}
  const pool={total:db.pool.totalCount,idle:db.pool.idleCount,waiting:db.pool.waitingCount,borrowed:db.pool.totalCount-db.pool.idleCount};assert(pool.total<=5&&pool.total>=1);assert.equal(pool.borrowed,0);assert.equal(pool.waiting,0);assert(activities.every(r=>r.no_transaction&&r.state==='idle'));
  await artifact('final-commands-only-scope-and-settled-work.json',{calls,observations,source:M.sourceProof,identity,authAcl,authCatalog,finalAuth,role,rls,index,upgrade,pids,activities,pool,providerCalls:providerCalls()+refusedCount(),faultObjects:[],actualAuth:false,workerRun:false,relayRun:false,nativeBoundary:false,capacityBoundary:false,outerProfileCleanupSeparate:true});return{borrowedClientsZero:true,providersZero:true,cleanupStillOuterOwnedProfile:true};
 });
 assert.equal(groups.length,REMINDER_CASE_NAMES.length);
 for(let n=0;n<groups.length;n++){
  try{healthy();const facts=await groups[n]();assert.equal(activeCount(),0);const result={number:n+1,name:REMINDER_CASE_NAMES[n],status:'PASS',facts};results.push(result);await onCase(result);}
  catch(error){await settle();const code=typeof error.code==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(error.code)?error.code:'REMINDER_PG_CASE_FAILED';await onCase({number:n+1,name:REMINDER_CASE_NAMES[n],status:'FAIL',code,lastCall:calls.at(-1)?{tail:calls.at(-1).tail,method:calls.at(-1).method,status:calls.at(-1).status,expectedStatus:calls.at(-1).expectedStatus,code:calls.at(-1).code}:null,traceCount:trace.length,lastQueries:trace.slice(-8).map(({kind,sqlSha256})=>({kind,sqlSha256}))});throw Object.assign(Error('REMINDER_PG_CASE_FAILED'),{code});}
 }
 return Object.freeze({tests:10,pass:results.length,caseWorkSettled:activeCount()===0,providerCalls:providerCalls()+refusedCount(),actualWorker:false,actualRelay:false,actualNativeCapacity:false});
}
