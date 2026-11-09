import { reservationSchemaSql, legacyReservationLayout } from "./resource-reservation-schema.mjs";
/** Strict fake SELECT fixture. Controlled SQL byte values are NOT a PG oracle. */
import assert from 'node:assert/strict';
import {reminderCapacityFixture as baseFixture} from './reminder-capacity-source.mjs';
import {REMINDER_CAPACITY_SQL as Q,REMINDER_PEOPLE_SQL,REMINDER_OUTBOX_SQL} from '../../lib/participation-reminder-capacity.mjs';
import {GROUP_SAFETY_SQL as S} from '../../lib/participation-group-safety-capacity.mjs';
import {LEARNING_OPERATIONAL_CAPACITY as O} from '../../lib/learning-capacity.mjs';
import {hash} from '../../lib/security.mjs';
const clone=v=>structuredClone(v), size=v=>Buffer.byteLength(JSON.stringify(v));
export const ORG='fixture_org',AT='2026-11-08T00:00:00.000001Z',SHA='a'.repeat(64);
const columns={os_participations:'org_id id target_id module_id booking_record_id contact_id intake_id state revision source consent frozen waitlist_sequence confirmed_at cancelled_at created_by created_at updated_at recovered recovered_state last_command delivery_consent requested_interval reminder_consent',os_participation_outbox:'org_id id participation_id event_revision purpose channel state payload created_at participation_revision intent_kind consent_revision consent_copy user_id link_id link_revision recipient_hash policy_epoch template_version relay_key payload_hash first_attempt_at attempts lease_owner lease_until next_at last_checked_at safe_code provider_event_at budget_bytes recovered_state',os_previews:'org_id id actor_id kind payload checksum base_revision expires_at committed_at created_at',os_events:'org_id id actor_id action record_id module_id detail created_at'};
export function fixture(options={}){
 const f=baseFixture(options),query=f.c.query.bind(f.c);let reserved=false,auditBytes=700,overFamily=false,missingColumn=false,pendingBytes=0;
 const calls=[],previews=[];
 const usage={pending_count:0,pending_bytes:0,committed_count:0,committed_bytes:0};
 if(options.active) f.setUsage(20000);
 const present=()=>reserved||f.people.some(p=>p.reminder_consent!==null||p.last_command?.format==='charitology-participation-reminder-choice'||p.last_command?.method==='participation-reminder-v1')||f.notices.some(o=>o.intent_kind==='reminder'||Object.hasOwn(o.payload,'reminder'));
 const raw=()=>1048*f.people.length, interval=()=>raw()-(options.v3?0:22*f.people.length), charged=()=>interval()-(present()?0:26*f.people.length);
 const people=(source,ids,full=false)=>source.map(p=>{
  const original=f.people.find(x=>x.id===p.id),delta=Math.max(0,size(p)-size(original)),actualRaw=1048+delta;
  const actual=actualRaw-(options.v3?0:22)-(full||present()?0:26),op=ids.includes(p.id)?100:0;
  return{id:p.id,row:clone(p),future_row:{...clone(p),state:'cancelled',revision:O.attempts,cancelled_at:O.serviceTime,updated_at:O.serviceTime,consent:{...p.consent,emailUpdates:false},last_command:{intentHash:SHA,payloadHash:SHA,action:'delivery.preference',actorHash:SHA,resultRevision:O.attempts,notificationQueued:false,auditRetained:false}},actual:String(actual),actual_raw:String(actualRaw),operational:String(actual+op),operational_raw:String(actualRaw+op),projected:String(overFamily&&full?8*1024*1024:actual+500),projected_raw:String(overFamily&&full?8*1024*1024+48:actualRaw+500)};
 });
 f.c.query=async(sql,args=[])=>{
  calls.push({sql,args:clone(args)});
  assert(/^(SELECT|WITH)\b/.test(sql.trimStart()));
  if (sql === reservationSchemaSql.layout) return legacyReservationLayout;
  if(sql===Q.accounting)return{rows:[{count:f.people.length,raw_bytes:raw(),interval_bytes:interval(),charged_bytes:charged(),reminder_absent:!present()}]};
  if(sql===Q.choices)return{rows:f.people.filter(p=>p.reminder_consent!==null).map(p=>({id:p.id,reminder_consent:clone(p.reminder_consent)}))};
  if(sql===Q.schema)return{rows:Object.entries(columns).flatMap(([table_name,names])=>names.split(' ').filter(name=>!(missingColumn&&name==='reminder_consent')).map(column_name=>({table_name,column_name})))};
  if(sql===Q.original){const value=f.people.find(p=>p.id===args[1]);return{rows:value&&hash(value)===hash(JSON.parse(args[2]))?[{row:clone(value)}]:[]};}
  if(sql===S.participations)return{rows:people(f.people,args[5])};
  if(sql===REMINDER_PEOPLE_SQL){const candidates=JSON.parse(args[7]),p=f.people.map(p=>candidates.find(c=>c.id===p.id)||p);return{rows:people(p,args[5],true)};}
  if(sql===REMINDER_OUTBOX_SQL){const added=JSON.parse(args[7]),list=[...f.notices,...added];return{rows:list.map(row=>({id:row.id,row:clone(row),raw:500,actual:Math.max(500,row.budget_bytes),operational:Math.max(500,row.budget_bytes,args[6]?550:0),projected:Math.max(530,row.budget_bytes,args[6]?550:0)}))};}
  if(sql===Q.audits)return{rows:JSON.parse(args[0]).map(row=>({row,bytes:auditBytes}))};
  if(sql===Q.reservedPreviews)return{rows:clone(previews)};
  if(sql===Q.previewUsage)return{rows:[clone(usage)]};
  if(sql===Q.previews)return{rows:JSON.parse(args[0]).map(row=>({row,bytes:size(row)+80,payload_bytes:size(row.payload)+50}))};
  if(sql===Q.previewOriginal)return{rows:pendingBytes?[{bytes:pendingBytes}]:[]};
  if(sql.startsWith('SELECT octet_length(')&&sql.includes('AS actual_raw')&&sql.includes('WHERE t.org_id=$1 AND t.id=ANY'))return{rows:f.people.filter(p=>args[5].includes(p.id)).map(p=>({actual:1048-(options.v3?0:22)-(present()?0:26),projected:1148-(options.v3?0:22)-(present()?0:26),actual_raw:1048,projected_raw:1148}))};
  if(sql.startsWith('SELECT COALESCE(sum(octet_length(')&&sql.includes('FROM os_participations t'))return{rows:[{bytes:charged()}]};
  return query(sql,args);
 };
 return{...f,calls,previews,usage,setReserved:v=>{reserved=v;},setAudit:v=>{auditBytes=v;},setOverFamily:v=>{overFamily=v;},setMissingColumn:v=>{missingColumn=v;},setPendingBytes:v=>{pendingBytes=v;}};
}
export function preference(enabled=true,revision=1){return{version:'participation-reminder-v1',enabled,revision,atExact:AT,...(enabled?{userId:'own-user',linkId:'c'.repeat(32),linkRevision:1,recipientSha256:SHA,commitmentSha256:SHA}:{})};}
export function choice(p,enabled,auditRetained=true){return{format:'charitology-participation-reminder-choice',version:1,method:'participation-reminder-v1',action:'choice',actorSha256:SHA,sessionSha256:SHA,linkSha256:SHA,commandSha256:SHA,requestSha256:SHA,acceptedAtExact:AT,result:{participationId:p.id,revision:p.revision+1,intakeRevision:1,reminder:{version:'participation-reminder-v1',enabled,revision:enabled?1:2,atExact:AT},auditRetained}};}
