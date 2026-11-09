/** Test operations bound to ONE genuine shared fixture; no setup/teardown. */
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {requireReminderTestContext} from './participation-reminder-test-context.mjs';
import {ADDON_SQL as Q,DIGEST_SQL} from './participation-reminder-addon-sql.mjs';
const MiB=1024*1024,MAX=2147483647,copy=v=>structuredClone(v),wire=v=>JSON.stringify(v),bytes=v=>Buffer.byteLength(wire(v));
const hex=()=>randomBytes(16).toString('hex');
const n=v=>{assert(/^(0|[1-9][0-9]*)$/.test(String(v)));const x=Number(v);assert(Number.isSafeInteger(x)&&x>=0);return x;};
const problem=(code,facts)=>Object.assign(Error(code),{code,facts});
export function createReminderAddonOperations(context){
 const H=requireReminderTestContext(context),{M,owner,read,edit,one}=H,active=new Set();
 const work=p=>{assert(p instanceof Promise);active.add(p);H.track(p);void p.then(()=>active.delete(p),()=>active.delete(p));return p;};
 const transaction=(f,actor,fn,options={lock:true})=>work(H.db.tx(actor,f.org,fn,options));
 const clockPolicy=async c=>{await c.query("SET LOCAL TIME ZONE 'UTC'");await c.query("SET LOCAL DateStyle='ISO,YMD'");};
 async function digest(f){return read(f,async c=>{await clockPolicy(c);const tables={};for(const [table,sql]of Object.entries(DIGEST_SQL)){const row=await one(c,sql,[f.org]);assert(/^[a-f0-9]{64}$/.test(row.digest));tables[table]={count:n(row.count),rawBytes:n(row.raw_bytes),sha256:row.digest};}return{tables,chargedUsage:await M.database.logicalBackupBytes(c,f.org)};});}
 async function oracle(f){return read(f,async c=>{await clockPolicy(c);return{independent:await one(c,Q.rowOracle,[f.org]),actual:await M.reminderCapacity.measureReminderParticipationAccounting(c,f.org)};});}
 async function measure(f,{inactive=true,safety=false}={}){return read(f,async c=>{await clockPolicy(c);let backup=await M.workspaceBackup.assembleWorkspaceBackup(c,f.org),text=wire(backup);const usage=await M.database.logicalBackupBytes(c,f.org),accounting=await M.reminderCapacity.measureReminderParticipationAccounting(c,f.org),result={usage,accounting,backupBytes:Buffer.byteLength(text),backupSha256:createHash('sha256').update(text).digest('hex'),settings:await one(c,Q.settings)};text=null;if(inactive)result.inactive=await M.learningCapacity.checkLearningRestoreCapacity(c,backup);backup=null;if(accounting.present)result.complete=await(safety?M.reminderCapacity.checkReminderSafetyCapacity:M.reminderCapacity.checkReminderOrdinaryCapacity)(c,f.org);return result;});}
 async function assertRollback(f,run,code){const before=await digest(f);await assert.rejects(run,e=>e.code===code);assert.deepEqual(await digest(f),before);return before;}
 function reviewBody(f,people){return{version:1,target:{moduleId:f.moduleId,targetId:f.source.id,targetRevision:1,sourceRevision:4},participations:people};}
 async function probeSequence(f,{schedule=true}={}){
  const before=await digest(f),p=f.people[0],observed=[];let refusal=null;const rollback=problem('REMINDER_ADDON_INTENTIONAL_ROLLBACK');
  try{await transaction(f,f.own,async c=>{
   const session=H.sessionFor(f.own),v=await M.commands.getOwnReminder(c,{org:f.org,session,intakeId:p.intakeId,participationId:p.id,settings:H.settings});
   const input={version:1,revision:v.revision,intakeRevision:v.intakeRevision,reminderRevision:v.reminder.revision,enabled:true,consentVersion:'participation-reminder-v1',commandKey:H.key(),commitmentSha256:v.reminder.currentCommitmentSha256};
   await M.commands.changeOwnReminderChoice(c,{org:f.org,session,intakeId:p.intakeId,participationId:p.id,input,settings:H.settings});observed.push(await M.reminderCapacity.checkReminderOrdinaryCapacity(c,f.org));
   if(schedule){const own=await M.commands.getOwnReminder(c,{org:f.org,session:H.sessionFor(f.own),intakeId:p.intakeId,participationId:p.id,settings:H.settings});await c.query("SELECT set_config('app.user_id',$1,true)",[f.actor]);
    const body=reviewBody(f,[{participationId:p.id,revision:own.revision,intakeRevision:own.intakeRevision}]);
    const preview=await M.commands.previewParticipationReminder(c,{org:f.org,session:H.sessionFor(f.actor),input:body,settings:H.settings});observed.push(await M.reminderCapacity.checkReminderOrdinaryCapacity(c,f.org));
    await M.commands.scheduleParticipationReminder(c,{org:f.org,session:H.sessionFor(f.actor),input:{previewId:preview.previewId,commandKey:H.key()},settings:H.settings});observed.push(await M.reminderCapacity.checkReminderOrdinaryCapacity(c,f.org));}
   throw rollback;
  });}catch(error){if(error!==rollback)refusal=error;}
  assert.deepEqual(await digest(f),before,'Intentional actual transaction probe must completely roll back');
  if(refusal){assert.equal(refusal.code,'participation_reminder_capacity');return{accepted:false,code:refusal.code};}
  assert(observed.length===(schedule?3:1));return{accepted:true,peakUsage:Math.max(...observed.map(v=>v.requiredUsage)),peakNative:Math.max(...observed.map(v=>v.requiredBackupBytes)),metrics:observed};
 }
 async function seedFamilyFrontier(f){
  assert.equal(f.moduleId,'events');assert.equal(f.people.length,1);const p=f.people[0],baseline=await oracle(f),raw=(await owner.query(H.sql.exactPerson,[f.org,p.id])).rows[0].row;
  const historicalData={...f.source.data,title:'Fictional '+ '界'.repeat(160),participationPurpose:'Fictional boundary '+ '界'.repeat(570),participantInstructions:'Fictional instructions '+ '界'.repeat(560),organizerEmail:'fixture@example.invalid',organizerUrl:'https://fixture.invalid/'+ 'x'.repeat(450)};
  const historical=await H.put(f,'cap_history_target','events',historicalData,'completed',4),terms=M.participation.participationTerms(historical),termsHash=M.security.hash(terms);
  await owner.query("INSERT INTO os_participation_targets(org_id,target_id,module_id,mode,source_revision,terms,terms_hash,created_by,created_at,updated_at) VALUES($1,$2,'events','paused',4,$3::jsonb,$4,$5,$6::timestamptz,$6::timestamptz)",[f.org,historical.id,wire(terms),termsHash,f.actor,f.clock.history_exact]);
  const originalBooking=(await owner.query('SELECT to_jsonb(t) AS row FROM os_records t WHERE org_id=$1 AND id=$2',[f.org,p.bookingId])).rows[0].row;
  const data=M.modules.validateRecord('events',{...originalBooking.data,title:'Fictional cancelled capacity booking',eventId:historical.id,contactId:p.contactId},{orgId:f.org,recordId:'cap_booking_0001',status:'cancelled',records:f.records});
  const booking={...originalBooking,id:'cap_booking_0001',status:'cancelled',revision:1,approval:null,snapshot:null,source:null,data};
  // Normal approval has these exact fields; the real handler bounds reason
  // at2000 characters. This is declared OWNER-seeded historical software
  // fixture text, never a real reviewer or live approval assertion.
  const approvalSentence='Fictional historical software fixture review: the cancelled booking retained the declared terms and independent-review field shape solely to exercise storage admission; no real person reviewed or approved it. ';
  const approvalReason=approvalSentence.repeat(Math.ceil(600/approvalSentence.length)).slice(0,600);
  const priorApproval={status:'approved',revision:3,actorId:'fictional-reviewer',reason:approvalReason,at:f.clock.history_exact.slice(0,23)+'Z'};
  assert.equal(approvalReason.length,600);assert(approvalReason.length<=2000);
  const frozen={terms,sourceRevision:4,termsHash,candidateRevision:3,candidateApproval:priorApproval,programId:'rm_program'};
  const consent={revision:2,sourceRevision:4,termsHash,at:f.clock.history_exact.slice(0,23)+'Z',waitlistAllowed:false,emailUpdates:false,method:'fictional historic staff affirmation',evidenceRef:'Fictional SQL-seeded software fixture; no real consent',actorHash:M.security.hash(f.actor),recipientHash:null,withdrawalAcknowledged:true};
  const prototype={...raw,id:'cap_person_0001',target_id:historical.id,booking_record_id:'cap_booking_0001',contact_id:p.contactId,intake_id:null,state:'cancelled',revision:3,source:'staff',consent,frozen,requested_interval:null,delivery_consent:null,reminder_consent:null,last_command:null,recovered:false,recovered_state:null,waitlist_sequence:null,cancelled_at:f.clock.history_exact};
  const unit=await one(owner,Q.oneRowMeasure,[wire(prototype)]),room=8192,maximumSeedCount=Math.min(1800,Math.floor((8*MiB-n(baseline.independent.neither)-room)/n(unit.charged)));
  assert(maximumSeedCount>=1&&maximumSeedCount+f.records.length<=2000&&maximumSeedCount+1<=2000);
  const attempts=[],boundCodes=new Set(['participation_quota','participation_backup_size','learning_restore_capacity','learning_backup_size']);
  async function replaceCount(count){
   assert(Number.isSafeInteger(count)&&count>=0&&count<=maximumSeedCount);
   await owner.query(Q.deleteFillPeople,[f.org]);await owner.query(Q.deleteFillBookings,[f.org]);
   if(count){await owner.query(Q.insertBookings,[f.org,wire(booking),count]);await owner.query(Q.insertPeople,[f.org,wire(prototype),count]);}
  }
  let low=0,high=maximumSeedCount,steps=0;
  // Source unit size chooses only the finite search ceiling. Every accepted
  // candidate must pass the actual complete native AND inactive SQL path.
  while(low<high){
   assert(++steps<=11);const count=Math.floor((low+high+1)/2);await replaceCount(count);const accounting=await oracle(f);
   try{const complete=await measure(f);attempts.push({count,accepted:true,sourceChargedBytes:accounting.actual.chargedBytes,inactiveParticipationBytes:n(complete.inactive.categories.os_participations.bytes),backupBytes:complete.backupBytes});low=count;}
   catch(error){if(!boundCodes.has(error.code))throw error;attempts.push({count,accepted:false,sourceChargedBytes:accounting.actual.chargedBytes,refusal:error.code});high=count-1;}
  }
  if(low<1)throw problem('REMINDER_NEAR8_FRONTIER_UNATTAINABLE',{maximumSeedCount,attempts,reason:'No positive complete-admissible filler count was attained'});
  await replaceCount(low);const observed=await oracle(f),shape=await one(owner,Q.counts,[f.org]);let complete;
  try{complete=await measure(f);}catch(error){throw problem('REMINDER_NEAR8_FRONTIER_UNATTAINABLE',{count:low,shape,accounting:observed,attempts,refusal:typeof error.code==='string'?error.code:'unclassified'});}
  const sourceHeadroomBytes=8*MiB-observed.actual.chargedBytes,inactiveHeadroomBytes=8*MiB-n(complete.inactive.categories.os_participations.bytes),bindingFamily=sourceHeadroomBytes<=inactiveHeadroomBytes?'source-charged-participations':'inactive-projected-participations';
  assert(shape.records<=2000&&shape.participations<=2000);assert(sourceHeadroomBytes>0&&inactiveHeadroomBytes>=0&&Math.min(sourceHeadroomBytes,inactiveHeadroomBytes)<=16384);assert(observed.actual.reminderNullCompatibilityCreditBytes>0);assert(complete.backupBytes<64*MiB);
  return{count:low,room,unit,shape,accounting:observed,complete,calibration:{maximumSeedCount,steps,attempts,sourceHeadroomBytes,inactiveHeadroomBytes,bindingFamily,searchCeilingFromSourceUnitOnly:true,allAcceptedCandidatesFullNativeAndInactive:true},approvalFixture:{reasonCharacters:approvalReason.length,actualReasonCap:2000,reasonSha256:M.security.hash(approvalReason),objectBytes:bytes(priorApproval),exactFields:Object.keys(priorApproval),provenance:'Normal five-field shape with bounded fictional historical reason and SQL-derived ISO time; no real approval/human review'},fictionalHistoricalSqlSeed:true};
 }
 const body='Fictional retained comment for a bounded SQL software fixture. ';const commentText=length=>(body.repeat(Math.ceil(length/body.length))).slice(0,length-1)+'F';
 async function fillComments(f,targetUsage){assert(Number.isSafeInteger(targetUsage)&&targetUsage>0&&targetUsage<61*MiB);await owner.query(Q.deleteComments,[f.org]);const base=await read(f,c=>M.database.logicalBackupBytes(c,f.org)),full=await one(owner,Q.commentRowMeasure,[f.org,f.source.id,f.actor,commentText(4000),f.clock.history_exact]),single=await one(owner,Q.commentRowMeasure,[f.org,f.source.id,f.actor,'F',f.clock.history_exact]),header=n(single.bytes)-1,available=targetUsage-base;assert(available>n(full.bytes));const count=Math.floor(available/n(full.bytes)),remainder=available-count*n(full.bytes);assert(count>=1&&count+1<=15000);await owner.query(Q.insertComments,[f.org,f.source.id,f.actor,commentText(4000),f.clock.history_exact,count]);let tail=0;if(remainder>header){tail=Math.min(4000,remainder-header);await owner.query(Q.insertOneComment,[f.org,'cap_comment_'+String(count+1).padStart(5,'0'),f.source.id,f.actor,commentText(tail),f.clock.history_exact]);}
  const usage=await read(f,c=>M.database.logicalBackupBytes(c,f.org));assert(usage<=targetUsage&&targetUsage-usage<=header);return{count,tail,bodyCap:4000,fixtureCountCap:15000,usage,targetUsage,fullRowBytes:n(full.bytes),header,fixture:{org:f.org,recordId:f.source.id,actorId:f.actor,createdAtExact:f.clock.history_exact,idPrefix:'cap_comment_',bodyAlgorithm:'repeat fixed source sentence, truncate to length-1, append literal F',fullBodySha256:createHash('sha256').update(commentText(4000)).digest('hex'),tailBodySha256:tail?createHash('sha256').update(commentText(tail)).digest('hex'):null},fictionalSqlSeed:true};
 }
 async function historicalSchedule(f){
  assert.equal(f.people.length,1);const p=f.people[0],stamps=await one(owner,Q.stamps,[f.clock.history_exact]);await owner.query(Q.historicalOrg,[f.org,f.clock.history_exact]);await owner.query(Q.historicalMember,[f.org,f.actor,f.clock.history_exact]);
  const raw=(await owner.query(H.sql.exactPerson,[f.org,p.id])).rows[0],commitment=M.context.currentReminderCommitment(f.org,raw.row,raw.confirmed_exact);
  const recipient=await read(f,c=>M.delivery.resolveDeliveryRecipient(c,{org:f.org,participation:raw.row}));assert(recipient);
  const preference=M.model.validateReminderPreference({version:'participation-reminder-v1',enabled:true,revision:1,atExact:stamps.preference,userId:recipient.userId,linkId:recipient.linkId,linkRevision:recipient.linkRevision,recipientSha256:M.security.hash(recipient.email),commitmentSha256:M.model.reminderCommitmentSha256(commitment)});
  await owner.query(Q.historicalPreference,[f.org,p.id,wire(preference),stamps.preference]);
  const current=await read(f,c=>M.context.readReminderAdminContext(c,{org:f.org,session:H.sessionFor(f.actor),moduleId:f.moduleId,targetId:f.source.id,participationIds:[p.id],write:false,settings:H.settings}));
  const packet=M.model.makeReminderPreviewPacket({previewId:hex(),orgId:f.org,actorId:f.actor,authority:current.authority,target:current.target,policy:{epoch:current.policy.epoch,revision:current.policy.revision},template:current.template,items:current.items.map(({recipient,preference,...item})=>({...item,dueAtExact:M.model.reminderWindow(item.commitment,stamps.issued,'schedule').dueAtExact})),issuedAtExact:stamps.issued});
  const request={previewId:packet.previewId,commandKey:H.key()},outboxId=hex(),plan=M.outbox.buildReminderOutboxPlan({packet,request,atExact:stamps.accepted,bindings:current.items.map(({participationId,recipient,preference})=>({participationId,recipient,preference})),identities:[{participationId:p.id,outboxId,relayKey:'participation-reminder-'+hex(),eventRevision:1}]});
  const envelope=M.store.validateReminderEnvelope({version:1,state:'accepted',receipt:plan.receipt,access:current.access});
  await owner.query(Q.insertAccepted,[f.org,packet.previewId,f.actor,wire(envelope),M.security.hash(envelope),M.security.hash(current.access),packet.issuedAtExact,packet.expiresAtExact,stamps.accepted]);
  await owner.query(M.store.REMINDER_STORE_SQL.insertOutbox,M.outbox.reminderOutboxParameters(plan.rows[0]));await owner.query(Q.jobTenant,[f.org]);
  const stored=(await owner.query(H.sql.previews,[f.org])).rows.map(M.store.validateReminderStoredRow);assert.equal(stored.length,1);assert.equal(stored[0].payload.state,'accepted');
  return{packet,request,receipt:plan.receipt,row:plan.rows[0],stamps,provenance:'OWNER-seeded fictional historical typed facts; no earlier API/consent/approval execution claimed'};
 }
 async function worker(f,{send,status,settings=H.settings}={}){
  const tenants=await one(owner,Q.jobTenantCount);assert(tenants.count<=50,'This fixed combined fixture must fit the real worker first50 tenant scan');const others=(await owner.query(Q.othersNext,[f.org])).rows;assert(others.length<=256);await owner.query(Q.deferOthers,[f.org]);const callbacks={sends:[],statuses:[]};let primary;
  const checkpoint=async key=>{const values=(await owner.query(Q.workerRows,[f.org])).rows.filter(row=>row.relay_key===key);assert.equal(values.length,1);assert(values[0].attempted&&values[0].first_exact,'Fresh independent OWNER client must see the committed first-attempt checkpoint before any RAM transport callback');return{rowId:values[0].id,firstAttemptAtExact:values[0].first_exact,state:values[0].state};};
  const transport={sendParticipation:async(message,key)=>{callbacks.sends.push({message,key,committedCheckpoint:await checkpoint(key)});if(send instanceof Error)throw send;return send??{state:'accepted',safeCode:'provider_accepted',providerEventAt:null};},participationStatus:async key=>{callbacks.statuses.push({key,committedCheckpoint:await checkpoint(key)});return status??{state:'delivered',safeCode:'provider_delivered',providerEventAt:null};}};
  try{const result=await work(M.delivery.runParticipationDelivery({db:H.db,transport,settings,budget:{deadline:Date.now()+45000,remaining:1}}));assert(callbacks.sends.every(v=>v.key.startsWith('participation-reminder-')));assert.equal(H.providerCalls()+H.refusedCount(),0);return{result,callbacks,ownedReadySetIsolation:true};}
  catch(error){primary=error;throw error;}finally{try{const restored=await owner.query(Q.restoreOthers,[wire(others)]);assert.equal(restored.rowCount,others.length);}catch(error){if(!primary)throw error;}}
 }
 async function checkInHistories(f){
  assert(f.people.length>=2);const dates=await one(owner,Q.stamps,[f.clock.history_exact]),org=f.org,at=f.clock.history_exact.slice(0,23)+'Z';
  function report(id,p,origin=org){const terms={...M.participation.participationTerms(f.source),startAt:at,endAt:dates.historical_end};delete terms.intervalPolicy;const frozen={terms,sourceRevision:4,termsHash:M.security.hash(terms),candidateRevision:3,candidateApproval:{status:'approved',revision:3,actorId:'fictional-reviewer',reason:'Fictional historical SQL fixture',at},programId:'rm_program'},c={id,orgId:origin,participationId:p.id,moduleId:f.moduleId,bookingRecordId:p.bookingId,revision:3,intakeRevision:1,frozen,requestedInterval:null};return M.checkInModel.reportCheckIn({record:null,context:c,request:{revision:3,intakeRevision:1,checkInRevision:0,commitmentSha256:M.checkInModel.checkInCommitmentSha256(c),claimedArrivalAt:dates.reported,reportConsent:true,consentVersion:'arrival-self-report-v1',idempotencyKey:'fictional-addon-report-key'},actorId:f.own,serverNow:dates.reported,auditRetained:false}).record;}
  const live=report('cap_claim_live',f.people[0]),second=report('cap_claim_withdrawn',f.people[1]),withdrawn=M.checkInModel.withdrawCheckIn({record:second,request:{checkInRevision:1,reportSha256:second.history.claimSha256,withdraw:true,idempotencyKey:'fictional-addon-withdraw-key'},actorId:f.own,serverNow:dates.historical_end,auditRetained:false}).record;
  const recovered=M.checkInModel.restoreCheckInBackup(M.checkInModel.makeCheckInBackup([report('cap_claim_recovered',{id:'old_participation',bookingId:'old_booking'},'historical_org')]))[0];
  for(const r of [live,withdrawn,recovered])await M.checkInStore.insertCheckIn(owner,org,r,at);
  return{records:[live,withdrawn,recovered],fictionalHistoricalSqlSeed:true};
 }
 async function groupHistory(f){assert(f.people.length>=2);const context=await read(f,c=>M.context.readReminderAdminContext(c,{org:f.org,session:H.sessionFor(f.actor),moduleId:f.moduleId,targetId:f.source.id,participationIds:f.people.slice(0,2).map(p=>p.id),settings:H.settings})),ids=f.people.slice(0,2).map(p=>p.id).sort(),id='cap_group',at=f.clock.at_exact,hash=M.security.hash,make=(operation,result)=>M.groupModel.validateGroupReceipt({version:1,groupId:id,operation,commandHash:hash('fictional '+f.org+operation),requestHash:hash('fictional request '+f.org+operation),authority:context.authority,reviewSha256:operation==='create'?null:hash('fictional review '+f.org),acceptedAtExact:at,result});
  const create=make('create',{groupId:id,groupRevision:1,state:'draft',target:{targetId:f.source.id,moduleId:f.moduleId},rosterIds:ids,coordinatorIntakeId:null});
  const selected=context.selected.map(({participation:p})=>({participationId:p.id,action:'confirm',resultRevision:p.revision,state:'confirmed',frozenSha256:hash(p.frozen),allocationHash:p.frozen.allocationHash??null,notificationQueued:false,auditRetained:false})).sort((a,b)=>a.participationId<b.participationId?-1:1);
  const admit=make('admit',{groupId:id,groupRevision:2,state:'admitted',selectionMode:'all',selected,unselectedIds:[],reasonHashes:[],auditRetained:false});
  await edit(f,async c=>{await M.groupStore.insertDraftGroup(c,f.org,{receipt:create});await M.groupStore.appendGroupDecision(c,f.org,{expectedRevision:1,receipt:admit});});return{create,admit,fictionalHistoricalTypedStoreWrites:true};
 }
 async function legacyExit(f){
  const person=f.people[0];
  await edit(f,async c=>{const member=(await M.context.readReminderAdminContext(c,{org:f.org,session:H.sessionFor(f.actor),moduleId:f.moduleId,targetId:f.source.id,participationIds:[person.id],eligible:false,settings:H.settings})).member;
   const records=await M.database.allRecords(c,f.org),source=records.find(r=>r.id===f.source.id),t=await one(c,'SELECT * FROM os_participation_targets WHERE org_id=$1 AND target_id=$2',[f.org,f.source.id]),p=await one(c,'SELECT * FROM os_participations WHERE org_id=$1 AND id=$2',[f.org,person.id]),candidate=records.find(r=>r.id===p.booking_record_id);
   const response=await M.participation.participationRoutes({c,org:f.org,user:f.actor,member,settings:H.settings,records,source,t,p,method:'POST',tail:'participation-targets/'+f.source.id+'/participations/'+p.id+'/cancel',input:{revision:p.revision,targetRevision:t.revision,candidateRevision:candidate.revision,consentRevision:p.consent.revision,reason:'Fictional controlled capacity privacy exit',idempotencyKey:H.key()}});assert.equal(response.status,200);
  });
  const p=(await owner.query(H.sql.exactPerson,[f.org,person.id])).rows[0].row,i=(await owner.query('SELECT revision FROM os_intake WHERE org_id=$1 AND id=$2',[f.org,person.intakeId])).rows[0];
  const session=H.sessionFor(f.own),input={revision:p.revision,intakeRevision:i.revision,enabled:false,consentVersion:'participation-email-v1',idempotencyKey:H.key()},request=new Request(H.settings.origin+'/api/participant/orgs/'+f.org+'/requests/'+person.intakeId+'/participations/'+p.id+'/delivery-preference',{method:'POST',headers:{origin:H.settings.origin,'content-type':'application/json','x-csrf-token':M.security.csrf(session.session.id,H.settings.secret)},body:wire(input)});
  const response=await work(M.delivery.ownDeliveryRoutes({request,db:H.db,settings:H.settings,session}));assert.equal(response.status,200);const result=await response.json();assert.equal(result.delivery.enabled,false);const after=(await owner.query(H.sql.exactPerson,[f.org,p.id])).rows[0].row;assert.equal(after.reminder_consent,null);assert.equal(after.state,'cancelled');return{result,afterSha256:M.security.hash(after)};
 }
 return Object.freeze({H,M,Q,wire,bytes,n,MiB,MAX,hex,work,digest,oracle,measure,assertRollback,probeSequence,seedFamilyFrontier,fillComments,historicalSchedule,worker,legacyExit,checkInHistories,groupHistory,activeCount:()=>active.size,settle:()=>Promise.allSettled([...active])});
}
