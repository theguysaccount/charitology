import {fail,stable} from './security.mjs';
import {requirePermission,inScope} from './access.mjs';
import {rowRecord} from './database.mjs';
import {learningHash as H,learningSeal,learningSame,learningOwned} from './learning-json.mjs';
import {validateLearningEvidence} from './learning-model.mjs';

const staff=new Set(['owner','admin','program_lead','grants_lead','finance_reviewer','contributor']);
export const learningModules=Object.freeze(['programs','outcomes','evaluation','reporting']);
export const learningUnavailable=()=>fail(404,'learning_unavailable','This learning record or retained evidence is unavailable.');
export const learningStale=()=>fail(409,'learning_stale','This source, approval, membership or saved record changed. Inspect it and preview again.');
export function requireLearningScope(member,programId){
  if(member.programIds.length&&!member.programIds.includes(programId))learningUnavailable();
}
export function requireLearningMember(member,{report=false,source=false,write=[]}={}){
  if(!staff.has(member.role))fail(403,'learning_role','Learning source material and reports are available to authorized staff only.');
  for(const module of learningModules){requirePermission(module,member,'read');if(report)requirePermission(module,member,'export');}
  if(source)for(const module of ['outcomes','evaluation'])requirePermission(module,member,'write');
  for(const module of write)requirePermission(module,member,'write');
}
export async function currentLearningMember(c,org,session,options={}){
  const sessionPresent=await c.query('SELECT 1 FROM "session" s JOIN "user" u ON u.id=s."userId" WHERE s.id=$1 AND s."userId"=$2 AND s."expiresAt">clock_timestamp() AND u."emailVerified"=true'+(options.readOnly?'':' FOR SHARE OF s'),[session.session.id,session.user.id]);
  if(!sessionPresent.rowCount)fail(401,'session','Sign in again before continuing this learning review.');
  const row=(await c.query("SELECT user_id,role,program_ids,revision,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_exact FROM os_members WHERE org_id=$1 AND user_id=$2",[org,session.user.id])).rows[0];
  if(!row)fail(403,'membership','This organization is unavailable or your access has ended.');
  const member={userId:row.user_id,role:row.role,programIds:row.program_ids,revision:row.revision,createdAtExact:row.created_exact};
  member.membershipSha256=learningMembershipHash(member);
  requireLearningMember(member,options);return member;
}
export const learningMembershipHash=member=>H('membership',{userId:member.userId,role:member.role,sortedProgramIds:[...member.programIds].sort(),revision:member.revision,createdAtExact:member.createdAtExact});
export const learningSessionHash=session=>H('session',{sessionId:session.session.id});
export const learningActorHash=(member,session)=>H('actor-binding',{actorId:member.userId,sessionSha256:learningSessionHash(session),memberCreatedAtExact:member.createdAtExact});

const eligibleStates={programs:['approved','active'],outcomes:['approved','included'],evaluation:['registered','decided'],reporting:['approved']};
const eligibleKind={programs:['program'],outcomes:['indicator','observation'],evaluation:['protocol','decision'],reporting:['template']};
const reasons=Object.freeze({
 'deleted-or-unavailable':'This record is unavailable in the current workspace.',
 'unsupported-ordinary-record':'Choose a supported program, learning definition, observation, protocol, decision or manifest.',
 'wrong-state':'Complete the ordinary workflow, then approve that final state before selecting it.',
 'not-approved':'Ask a different authorized account to approve this final state.',
 'approval-not-current':'This final state needs a fresh independent approval before it can be selected.',
 'approval-event-unavailable':'The exact ordinary approval event is unavailable; approve the current final state again.',
 'program-data-changed':'The program changed after mapping. Inspect it and make a new explicit mapping.',
 eligible:'This exact current final-state approval is eligible for deliberate selection.'
});
export function learningResolution(recordId,record,code='deleted-or-unavailable',evidence=null){
  return {recordId,record:record??null,pin:evidence?.pin??null,evidence,eligibility:{eligible:code==='eligible',code,message:reasons[code]}};
}
export async function resolveLearningApproval(c,org,recordId,member,{allowUnavailable=false}={}){
  const raw=(await c.query('SELECT * FROM os_records WHERE org_id=$1 AND id=$2',[org,recordId])).rows[0];
  if(!raw||raw.deleted_at){if(allowUnavailable)return learningResolution(recordId,null);learningUnavailable();}
  const record=rowRecord(raw);
  if(!inScope(record,member)||!learningModules.includes(record.moduleId))learningUnavailable();
  requirePermission(record.moduleId,member,'read');
  const bad=code=>learningResolution(recordId,record,code);
  if(!eligibleKind[record.moduleId].includes(record.data.kind)||
    (record.moduleId==='reporting'&&record.data.assemblyMethod!=='learning-review-v1'))return bad('unsupported-ordinary-record');
  if(!eligibleStates[record.moduleId].includes(record.status)||
     (record.moduleId==='evaluation'&&((record.data.kind==='protocol'&&record.status!=='registered')||(record.data.kind==='decision'&&record.status!=='decided'))))return bad('wrong-state');
  if(!record.approval||!record.snapshot)return bad('not-approved');
  const snapshot=record.snapshot,approval=record.approval;
  if(approval.status!=='approved'||approval.revision!==record.revision||snapshot.revision!==record.revision||
     snapshot.id!==record.id||snapshot.orgId!==org||snapshot.moduleId!==record.moduleId||
     snapshot.status!==record.status||snapshot.ownerId!==record.ownerId||!learningSame(snapshot.data,record.data))return bad('approval-not-current');
  const events=(await c.query("SELECT id::text,actor_id,detail,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_exact FROM os_events WHERE org_id=$1 AND record_id=$2 AND action='record.approved' AND detail#>>'{record,revision}'=$3 ORDER BY id DESC LIMIT 2",[org,recordId,String(record.revision)])).rows;
  if(events.length!==1)return bad('approval-event-unavailable');
  const event=events[0],original=event.detail?.record;
  if(!original||event.actor_id!==approval.actorId||approval.actorId===original.lastEditedBy||original.orgId!==org||original.id!==recordId||
     original.moduleId!==record.moduleId||original.revision!==record.revision||original.status!==record.status||
     original.ownerId!==record.ownerId||!learningSame(original.data,record.data)||
     !learningSame(original.snapshot,snapshot)||!learningSame(original.approval,approval)||
     !learningSame(original.source,record.source))return bad('approval-event-unavailable');
  // Copy the actual immutable audit body; never synthesize it from a later row.
  const evidence=learningSeal('evidence',{
    format:'charitology-learning-approved-evidence',version:1,
    pin:{originOrgId:org,moduleId:record.moduleId,recordId,revision:record.revision,
      snapshotSha256:H('snapshot',snapshot),approvalEventId:event.id,approvalSha256:H('approval',approval)},
    snapshot:learningOwned(snapshot),approval:learningOwned(approval),
    approvalEvent:{id:event.id,action:'record.approved',actorId:event.actor_id,
      createdAtExact:event.created_exact,recordSha256:H('audit-record',original)}
  });
  return learningResolution(recordId,record,'eligible',validateLearningEvidence(evidence));
}
export async function requireLearningApproval(c,org,pin,member){
  const resolved=await resolveLearningApproval(c,org,pin.recordId,member);
  if(!resolved.eligibility.eligible||!learningSame(pin,resolved.pin))learningStale();
  return resolved;
}
export async function currentLearningWorking(c,org,pin,member){
  const row=(await c.query('SELECT * FROM os_records WHERE org_id=$1 AND id=$2 AND deleted_at IS NULL',[org,pin.recordId])).rows[0];
  if(!row)learningUnavailable();const record=rowRecord(row);
  if(!inScope(record,member))learningUnavailable();requirePermission(record.moduleId,member,'read');
  if(record.moduleId!==pin.moduleId||record.revision!==pin.revision||H('data',record.data)!==pin.dataSha256)learningStale();
  return record;
}
export async function learningRestoreEpoch(c,org,root,recordIds){
  const records=[];
  for(const recordId of [...new Set(recordIds)].sort()){
    const row=(await c.query("SELECT max(id)::text AS id FROM os_events WHERE org_id=$1 AND record_id=$2 AND action='record.restored'",[org,recordId])).rows[0];
    records.push({recordId,lastRestoredAuditId:row?.id??null});
  }
  return {root,records};
}
export async function learningInspectionEpoch(c,org,target){
  const recordId=target.program.recordId;
  const row=(await c.query("SELECT max(id)::text AS id FROM os_events WHERE org_id=$1 AND record_id=$2 AND action='record.restored'",[org,recordId])).rows[0];
  return H('restore-epoch',{kind:'inspection-target',programRecordId:recordId,lastRestoredAuditId:row?.id??null,head:target.kind==='refresh'?target.head:null});
}
