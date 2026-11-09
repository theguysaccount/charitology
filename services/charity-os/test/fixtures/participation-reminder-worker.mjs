import { reservationSchemaSql, legacyReservationLayout } from "./resource-reservation-schema.mjs";
import { RESOURCE_RESERVATION_GUARD_SQL as reservationSql } from "../../lib/resource-reservation-guards.mjs";
import {PARTICIPATION_REMINDER_LEGACY_SQL} from '../../lib/participation-storage.mjs';
/** Fictional producer fixtures and closed SQL responses. This is orchestration
 * evidence, never PostgreSQL, real current-member/consent or provider evidence. */
import assert from 'node:assert/strict';
import {hash} from '../../lib/security.mjs';
import {makeReminderPreviewPacket,reminderActorSha256,reminderCommitmentSha256,reminderWindow} from '../../lib/participation-reminder-model.mjs';
import {renderParticipationReminderTemplate} from '../../lib/participation-reminder-template.mjs';
import {buildReminderOutboxPlan} from '../../lib/participation-reminder-outbox.mjs';
export const clone=v=>JSON.parse(JSON.stringify(v));
export const ORG='fictional-org',EMAIL='person@example.invalid',PERSON='fictional-person',ACTOR='fictional-admin';
export const settings={origin:'https://os.example.invalid',secret:'fictional-secret',participationDeliveryEnabled:true,participationTestOnly:true,participationTestRecipient:EMAIL};
const precise=v=>BigInt(Date.parse(v.slice(0,23)+'Z'))*1000n+BigInt(v.slice(23,26));
export function makeWorkerFixture({attemptSql,count=1,sqlClock='2030-01-02T10:00:00.000000Z',recipientEmail=EMAIL,eventRevision=1}={}){
  const recipient={email:recipientEmail,userId:'fictional-user',linkId:'b'.repeat(32),linkRevision:2};
  const commitment={format:'charitology-participation-reminder-commitment',version:1,method:'participation-reminder-v1',orgId:ORG,moduleId:'volunteers',targetId:'fictional-shift',participationId:PERSON,bookingRecordId:'fictional-booking',intakeId:'fictional-intake',contactId:'fictional-contact',confirmedAtExact:'2030-01-01T07:00:00.000001Z',frozenSourceRevision:4,frozenSha256:hash('fictional-frozen'),frozenTermsSha256:hash('fictional-terms'),range:{startAt:'2030-01-03T10:00:00.000Z',endAt:'2030-01-03T11:00:00.000Z',timeZone:'UTC'}};
  const preference={version:'participation-reminder-v1',enabled:true,revision:2,atExact:'2030-01-01T07:05:00.000001Z',...recipient,recipientSha256:hash(recipientEmail),commitmentSha256:reminderCommitmentSha256(commitment)};delete preference.email;
  const delivery={version:'participation-email-v1',enabled:true,revision:3,at:'2030-01-01T07:00:00.000Z',userId:recipient.userId,linkId:recipient.linkId,linkRevision:recipient.linkRevision,recipientHash:hash(recipientEmail)};
  const person={org_id:ORG,id:PERSON,module_id:'volunteers',target_id:'fictional-shift',booking_record_id:'fictional-booking',contact_id:'fictional-contact',intake_id:'fictional-intake',state:'confirmed',revision:count>1?100:7,source:'intake',recovered:false,delivery_consent:delivery,reminder_consent:preference,last_command:null};
  const policy={enabled:true,epoch:'c'.repeat(32),revision:2,template_version:'participation-notice-v1'};
  const item={participationId:PERSON,participationRevision:person.revision,intakeRevision:5,participationSha256:hash('fictional-participation'),intakeSha256:hash('fictional-intake'),deliveryConsentSha256:hash(delivery),reminderConsentSha256:hash(preference),recipientBindingSha256:hash(recipient),linkBindingSha256:hash('fictional-link'),commitment,commitmentSha256:reminderCommitmentSha256(commitment),dueAtExact:reminderWindow(commitment,'2030-01-01T08:00:00.000000Z','schedule').dueAtExact};
  const packet=makeReminderPreviewPacket({previewId:'fictional-preview',orgId:ORG,actorId:ACTOR,authority:{actorSha256:reminderActorSha256(ACTOR),sessionSha256:hash('fictional-expired-session'),membershipSha256:hash('fictional-membership'),memberCreatedAtExact:'2029-01-01T00:00:00.000001Z',restoreEpochSha256:hash('fictional-restore')},target:{moduleId:'volunteers',targetId:'fictional-shift',targetRevision:2,sourceRevision:4,sourceSha256:hash('fictional-source')},policy:{epoch:policy.epoch,revision:policy.revision},template:renderParticipationReminderTemplate(settings.origin+'/participant'),items:[item],issuedAtExact:'2030-01-01T08:00:00.000000Z'});
  const plan=buildReminderOutboxPlan({packet,request:{previewId:packet.previewId,commandKey:'fictional-command-key-123'},atExact:'2030-01-01T08:00:01.000001Z',bindings:[{participationId:PERSON,recipient,preference}],identities:[{participationId:PERSON,outboxId:'1'.padStart(32,'0'),relayKey:'participation-reminder-'+'e'.repeat(32),eventRevision}]});
  const context={member:{userId:ACTOR,role:'admin',createdAtExact:packet.authority.memberCreatedAtExact},access:{moduleId:'volunteers',targetId:'fictional-shift',incarnationSha256:hash('fictional-incarnation')},target:clone(packet.target),policy,template:clone(packet.template),items:[{...clone(item),recipient,preference}],selected:[{participation:person,created_exact:'2030-01-01T06:00:00.000001Z',confirmed_exact:commitment.confirmedAtExact}],restoreEpochSha256:packet.authority.restoreEpochSha256,schedule:{payload:{version:1,state:'accepted',receipt:clone(plan.receipt),access:{moduleId:'volunteers',targetId:'fictional-shift',incarnationSha256:hash('fictional-incarnation')}}},scheduled:clone(plan.receipt.result.scheduled[0]),item:{...clone(item),recipient,preference}};
  const jobs=Array.from({length:count},(_,n)=>({...clone(plan.rows[0]),id:(n+1).toString(16).padStart(32,'0'),relay_key:'participation-reminder-'+(n+1).toString(16).padStart(32,'0'),ready:true}));
  const outbox=new Map(jobs.map(row=>[row.id,row]));
  // Every test context/receipt is matched to its selected outbox ID below.
  const calls=[],events=[],contextCalls=[],sends=[],statuses=[],capacityAuditRefusals=[];
  const f={outbox,person,policy,context,calls,events,contextCalls,sends,statuses,capacityAuditRefusals,sqlClock,contextError:null,forceNoAttempt:false,loseLease:false,clockPatch:null,transportSend:{state:'accepted',safeCode:'provider_accepted',providerEventAt:null},transportStatus:{state:'delivered',safeCode:'provider_delivered',providerEventAt:'2030-01-02T10:00:01.000Z'},intake:{id:'fictional-intake',org_id:ORG,publication_id:'fictional-publication',revision:5,answers:{email:recipientEmail},erased_at:null}};
  f.readContext=async(c,args)=>{
    assert.notEqual(c,client);assert.equal(typeof c.query,'function');assert.deepEqual(Object.keys(args).sort(),['org','outboxId','settings']);assert.equal(args.org,ORG);contextCalls.push(args.outboxId);events.push('current-context');
    if(f.contextError)throw f.contextError;
    const value=clone(context);value.selected[0].participation=clone(f.person);value.policy=clone(f.policy);value.item.preference=clone(f.person.reminder_consent);value.items[0].preference=clone(f.person.reminder_consent);
    const scheduled={...value.scheduled,outboxId:args.outboxId};value.scheduled=scheduled;value.schedule.payload.receipt.result.scheduled=[scheduled];return value;
  };
  const owned=(row,args)=>row&&row.org_id===args[0]&&row.id===args[1]&&row.lease_owner===args[2];
  const client={query:async(input,values)=>{
    const sql=typeof input==='string'?input:input.text,args=values||input.values||[];if(typeof input==='object')assert.ok(input.query_timeout>0&&input.query_timeout<=2000);calls.push({sql,args});
    if (sql === reservationSchemaSql.layout) return legacyReservationLayout;
    if(sql===reservationSql.destination)return {rows:[{occupied:false}],rowCount:1};
    if(sql===`SELECT NOT ${PARTICIPATION_REMINDER_LEGACY_SQL} AS present`){
      assert.deepEqual(args,[ORG]);assert([...outbox.values()].some(row=>row.intent_kind==='reminder'||Object.hasOwn(row.payload,'reminder')));
      return {rows:[{present:true}],rowCount:1};
    }
    if(sql.startsWith("SELECT set_config('statement_timeout'"))return {rows:[]};
    if(sql==='SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked'){events.push('tenant-lock');return {rows:[{locked:true}]};}
    if(sql==='SELECT pg_advisory_xact_lock(hashtextextended($1,0))'){events.push('tenant-lock');return {rows:[]};}
    if(sql.startsWith("UPDATE os_participation_outbox SET state=CASE WHEN first_attempt_at IS NULL"))return {rows:[],rowCount:0};
    if(sql.startsWith('SELECT * FROM os_participation_outbox WHERE org_id=$1 AND purpose=')){
      assert.ok(sql.includes("intent_kind IN ('snapshot','transition','reminder')"));
      const row=[...outbox.values()].find(r=>r.org_id===args[0]&&r.purpose==='participation'&&r.channel==='email'&&['snapshot','transition','reminder'].includes(r.intent_kind)&&r.relay_key&&r.ready&&!r.lease_owner&&['pending','unknown','accepted','delivered'].includes(r.state));return {rows:row?[clone(row)]:[]};
    }
    if(sql.startsWith('UPDATE os_participation_outbox SET lease_owner=$3')){const row=outbox.get(args[1]);row.lease_owner=args[2];row.lease_until='2030-01-04T00:00:00.000Z';if(row.state==='pending')row.state='leased';return {rows:[]};}
    if(sql.startsWith('SELECT * FROM os_participation_outbox WHERE org_id=$1 AND id=$2 AND lease_owner=$3')){
      const row=outbox.get(args[1]);if(f.loseLease&&sql.includes('lease_until>now()'))row.lease_owner='f'.repeat(32);return {rows:owned(row,args)?[clone(row)]:[]};
    }
    if(sql===attemptSql){
      events.push('sql-clock');const row=outbox.get(args[1]),at=precise(f.sqlClock),due=precise(args[3]);const start=BigInt(Date.parse(args[4]))*1000n;
      const is_due=at>=due,before_start=at<start,attempted=!f.forceNoAttempt&&args[5]===true&&is_due&&before_start&&owned(row,args)&&row.state==='leased'&&!row.first_attempt_at;
      if(attempted){row.first_attempt_at=f.sqlClock;row.attempts++;events.push('checkpoint-staged');}
      return {rows:[{at_exact:f.sqlClock,is_due,before_start,attempted,...f.clockPatch}]};
    }
    if(sql.startsWith("UPDATE os_participation_outbox SET state='cancelled',safe_code=$4")){
      const row=outbox.get(args[1]);if(owned(row,args)&&!row.first_attempt_at&&row.state==='leased'){Object.assign(row,{state:'cancelled',safe_code:args[3],lease_owner:null,lease_until:null,ready:false});return {rowCount:1,rows:[]};}return {rowCount:0,rows:[]};
    }
    if(sql.startsWith("UPDATE os_participation_outbox SET state='pending',safe_code=$4")){
      const row=outbox.get(args[1]);if(owned(row,args)&&!row.first_attempt_at&&row.state==='leased')Object.assign(row,{state:'pending',safe_code:args[3],lease_owner:null,lease_until:null,next_at:args[5],ready:false});return {rows:[],rowCount:1};
    }
    if(sql.startsWith("UPDATE os_participation_outbox SET state='pending',lease_owner=NULL")){
      const row=outbox.get(args[1]);if(owned(row,args)&&!row.first_attempt_at&&row.state==='leased')Object.assign(row,{state:'pending',lease_owner:null,lease_until:null,ready:false});return {rows:[],rowCount:1};
    }
    if(sql.startsWith('UPDATE os_participation_outbox SET state=$4,safe_code=$5')){
      const row=outbox.get(args[1]);if(owned(row,args)){Object.assign(row,{state:args[3],safe_code:args[4],provider_event_at:args[5],last_checked_at:f.sqlClock,first_attempt_at:args[6]?null:row.first_attempt_at,lease_owner:null,lease_until:null,ready:false});events.push('outcome-staged');}return {rows:[]};
    }
    if(sql.startsWith('UPDATE os_participations SET reminder_consent=NULL')){
      assert.ok(sql.includes('LEAST(revision::bigint+1,2147483647)::integer'));
      const p=f.person,match=args[0]===p.org_id&&(!args[1]||args[1]===p.intake_id)&&(!args[2]||args[2]===p.id)&&p.reminder_consent!==null&&(!args[3]||p.reminder_consent.recipientSha256===args[3]);
      if(match){p.reminder_consent=null;p.revision=Math.min(2147483647,p.revision+1);}return {rows:[],rowCount:match?1:0};
    }
    if(sql.startsWith('UPDATE os_participations SET delivery_consent=jsonb_build_object')){
      const p=f.person,provider=sql.includes("delivery_consent->>'recipientHash'=$3"),match=p.org_id===args[0]&&p.delivery_consent?.enabled&&(provider?p.id===args[1]&&p.delivery_consent.recipientHash===args[2]:(!args[1]||p.intake_id===args[1])&&(!args[2]||p.id===args[2]));
      assert.ok(sql.includes('LEAST(revision::bigint+1,2147483647)::integer'));
      const oldInteger=sql.includes("COALESCE((delivery_consent->>'revision')::integer,0)+1"),saturated=sql.includes("LEAST(COALESCE((delivery_consent->>'revision')::bigint,0)+1,2147483647)::integer");assert.ok(oldInteger||saturated);
      // Exact-source modeled SQL integer arithmetic, NOT actual PostgreSQL evidence.
      if(match&&oldInteger&&p.delivery_consent.revision===2147483647)throw Object.assign(new Error('Modeled PostgreSQL integer+1 overflow'),{code:'22003'});
      if(match){p.delivery_consent={version:'participation-email-v1',enabled:false,revision:saturated?Math.min(2147483647,p.delivery_consent.revision+1):p.delivery_consent.revision+1,at:'2030-01-02T10:00:00.000Z'};p.revision=Math.min(2147483647,p.revision+1);}return {rows:[],rowCount:match?1:0};
    }
    if(sql.startsWith("UPDATE os_participation_outbox o SET state='cancelled'")){
      const recipientScoped=sql.includes("($5::boolean=false OR o.intent_kind<>'reminder' OR o.recipient_hash=$6)");
      let n=0;for(const row of outbox.values())if(row.org_id===args[0]&&(!args[1]||f.person.intake_id===args[1])&&(!args[2]||row.participation_id===args[2])&&!row.first_attempt_at&&['paused','pending','leased'].includes(row.state)&&(!recipientScoped||args[4]===false||row.intent_kind!=='reminder'||row.recipient_hash===args[5])){Object.assign(row,{state:'cancelled',ready:false,lease_owner:null,lease_until:null});n++;}return {rowCount:n,rows:[]};
    }
    if(sql==='SELECT id FROM os_participant_links WHERE user_id=$1 AND org_id=$2 AND intake_id=$3 AND revoked_at IS NULL')return {rows:[{id:recipient.linkId}]};
    if(sql.startsWith('SELECT i.* FROM os_participant_links l JOIN os_intake i'))return {rows:[clone(f.intake)]};
    if(sql.startsWith('SELECT * FROM os_participations WHERE org_id=$1 AND id=$2 AND intake_id=$3'))return {rows:[clone(f.person)]};
    if(sql.startsWith('SELECT l.id,l.revision,l.user_id,u.email'))return {rows:[{id:recipient.linkId,revision:recipient.linkRevision,user_id:recipient.userId,email:recipientEmail,verified:true}]};
    if(sql==='SELECT * FROM os_participation_delivery_policies WHERE org_id=$1')return {rows:[clone(f.policy)]};
    if(sql==='SELECT * FROM os_participation_targets WHERE org_id=$1 AND target_id=$2')return {rows:[{mode:'managed',recovery_block:false}]};
    if(sql==='SELECT * FROM os_records WHERE org_id=$1 AND id=$2 AND deleted_at IS NULL')return {rows:[]};
    if(sql.startsWith('SELECT state,safe_code,provider_event_at,last_checked_at FROM os_participation_outbox'))return {rows:[]};
    if(sql.startsWith('UPDATE os_participations SET delivery_consent=$3,revision=revision+1,last_command=$4')){Object.assign(f.person,{delivery_consent:JSON.parse(args[2]),last_command:JSON.parse(args[3]),revision:f.person.revision+1});return {rows:[clone(f.person)]};}
    if(sql.startsWith('SELECT sum(size) AS size FROM (SELECT COALESCE')&&sql.endsWith(') usage'))return {rows:[{size:String(f.auditUsage||0)}]};
    if(sql==='INSERT INTO os_events(org_id,actor_id,action,record_id,module_id,detail) VALUES($1,$2,$3,$4,$5,$6)')return {rows:[],rowCount:1};
    if(sql==="UPDATE os_participations SET last_command=$3 WHERE org_id=$1 AND id=$2 AND last_command->>'intentHash'=$4 RETURNING last_command"){
      assert.equal(f.person.last_command.intentHash,args[3]);f.person.last_command=JSON.parse(args[2]);return {rows:[{last_command:clone(f.person.last_command)}]};
    }
    throw new Error('Unexpected closed worker/route SQL: '+sql.slice(0,120));
  }};
  // Only the test-owned optional audit seam is refused; no complete-capacity
  // graph or absence is fabricated by this orchestration fixture.
  f.refuseCapacityAudit=(c,org,event)=>{
    assert.equal(c,client);assert.equal(org,ORG);
    assert.deepEqual(event,{org_id:ORG,actor_id:'fictional-user',action:'participation.delivery.preference_off',record_id:null,module_id:null,detail:{participationId:PERSON,enabled:false}});
    capacityAuditRefusals.push(clone(event));return false;
  };
  f.db={pool:{query:async(sql,args)=>{
    calls.push({sql,args});if(sql==='SELECT org_id FROM os_job_tenants ORDER BY participation_last_run_at,org_id LIMIT 50')return {rows:[{org_id:ORG}]};
    if(sql==='UPDATE os_job_tenants SET participation_last_run_at=now() WHERE org_id=$1')return {rows:[]};throw new Error('Unexpected closed tenant query');
  }},tx:async(_actor,org,fn)=>{
    assert.ok(org===ORG||org===null);const snapshot={jobs:clone([...outbox]),person:clone(f.person)};events.push('transaction');
    try{const result=await fn(client);events.push('commit');return result;}catch(e){outbox.clear();for(const [id,row]of snapshot.jobs)outbox.set(id,row);Object.assign(f.person,snapshot.person);events.push('rollback');throw e;}
  }};
  f.transport={sendParticipation:async(message,key,options)=>{assert.equal(events.at(-1),'commit');sends.push({message:clone(message),key,deadline:options.deadline});events.push('send');if(f.throwSend)throw new Error('fictional interrupted transport');return clone(f.transportSend);},participationStatus:async(key,options)=>{assert.equal(events.at(-1),'commit');statuses.push({key,deadline:options.deadline});events.push('status');return clone(f.transportStatus);}};
  return f;
}
