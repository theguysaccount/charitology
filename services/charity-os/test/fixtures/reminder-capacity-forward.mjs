/** Fictional admitted pure histories and controlled SELECT bytes; no PG proof. */
import {fixture,ORG,AT} from './reminder-capacity.mjs';
import {REMINDER_CAPACITY_SQL as Q} from '../../lib/participation-reminder-capacity.mjs';
import {reportCheckIn,withdrawCheckIn,checkInCommitmentSha256,makeCheckInBackup,restoreCheckInBackup} from '../../lib/participant-check-in-model.mjs';
import {checkInStorageRow} from '../../lib/participant-check-in-store.mjs';
import {hash} from '../../lib/security.mjs';
export function catalogFixture(order){
 const f=fixture(),query=f.c.query.bind(f.c);
 f.c.query=async(sql,args)=>{const result=await query(sql,args);if(sql!==Q.schema)return result;
  const own=result.rows.filter(row=>row.table_name==='os_participations'),special=['delivery_consent','requested_interval','reminder_consent'];
  const indexes=own.map((row,index)=>special.includes(row.column_name)?index:-1).filter(index=>index>=0);
  const names=order==='fresh'?['requested_interval','delivery_consent','reminder_consent']:['reminder_consent','delivery_consent','requested_interval'];
  for(let i=0;i<3;i++)own[indexes[i]].column_name=names[i];
  return result;
 };return f;
}
function reported(id,participationId,orgId=ORG){
 const terms={title:'Fictional historical shift',kind:'shift',startAt:'2026-11-07T09:00:00Z',endAt:'2026-11-07T12:00:00Z',timeZone:'UTC',participationPurpose:'Capacity history fixture only.',participantInstructions:null,organizerEmail:null,organizerUrl:'https://fixture.invalid/'};
 const context={id,orgId,participationId,moduleId:'volunteers',bookingRecordId:participationId==='p2'?'b2':'b1',revision:4,intakeRevision:3,frozen:{terms,sourceRevision:7,termsHash:hash(terms),candidateRevision:2,candidateApproval:{status:'approved',revision:2,actorId:'fictional_reviewer',reason:'Fictional retained pure-model approval; no current authority.',at:'2026-11-01T00:00:00.000Z'},programId:null},requestedInterval:null};
 const request={revision:4,intakeRevision:3,checkInRevision:0,commitmentSha256:checkInCommitmentSha256(context),claimedArrivalAt:'2026-11-07T10:10:00Z',reportConsent:true,consentVersion:'arrival-self-report-v1',idempotencyKey:'fictional_report_command_01'};
 return reportCheckIn({record:null,request,context,actorId:'fictional_own_actor',serverNow:'2026-11-07T10:30:00.000Z',auditRetained:true}).record;
}
export function checkInFixture(){
 const f=fixture(),live=reported('claim_live','p1'),before=reported('claim_withdrawn','p2');
 const withdrawn=withdrawCheckIn({record:before,request:{checkInRevision:before.revision,reportSha256:before.history.claimSha256,withdraw:true,idempotencyKey:'fictional_withdraw_command_01'},actorId:'fictional_own_actor',serverNow:'2026-11-07T11:00:00.000Z',auditRetained:false}).record;
 const recovered=restoreCheckInBackup(makeCheckInBackup([reported('claim_recovered','old_participation','historical_org')]))[0];
 const records=[live,withdrawn,recovered],stored=records.map(record=>checkInStorageRow(record,ORG,'2026-11-07T11:30:00.000Z')),query=f.c.query.bind(f.c);
 const size=value=>Buffer.byteLength(JSON.stringify(value));
 f.c.query=async(sql,args=[])=>{
  if(sql==='SELECT t.* FROM os_participation_checkins t WHERE org_id=$1 ORDER BY id')return{rows:structuredClone(stored).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)};
  if(sql.startsWith('SELECT count(*) AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0) AS bytes')&&sql.includes('FROM os_participation_checkins t'))return{rows:[{count:stored.length,bytes:stored.reduce((a,v)=>a+size(v),0),max_bytes:Math.max(...stored.map(size)),history_bytes:Math.max(...stored.map(v=>size(v.history))),report_bytes:Math.max(...stored.map(v=>size(v.report_receipt))),withdrawal_bytes:Math.max(...stored.map(v=>size(v.withdrawal_receipt)))}]};
  if(sql.startsWith('SELECT t.id,octet_length(to_jsonb(t)::text) AS actual,octet_length(to_jsonb(p)::text) AS projected FROM jsonb_array_elements($2::jsonb)'))return{rows:JSON.parse(args[1]).map(value=>({id:value.id,actual:size(stored.find(row=>row.id===value.id)),projected:size(value)}))};
  if(sql==='SELECT octet_length(to_jsonb(e)::text) AS bytes FROM jsonb_populate_record(NULL::os_events,$1::jsonb) e')return{rows:[{bytes:807}]};
  return query(sql,args);
 };
 return{...f,checkInRecords:records,checkInRows:stored};
}
export {ORG,AT};
