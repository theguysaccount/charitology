import {fail} from './security.mjs';
import {learningHash as H,learningSame,learningCanonical,learningId,learningHashValue,LEARNING_LIMITS} from './learning-json.mjs';
import {validateLearningEvent,validateLearningEvidence,foldLearningHistory,headPin} from './learning-model.mjs';
import {validateLearningSourceCapture} from './learning-native.mjs';
import {logicalBackupBytes} from './database.mjs';

export async function loadLearningInventory(c,org,{recoveredOnly=false}={}){
  const usage=(await c.query("SELECT count(*) AS count,COALESCE(sum(GREATEST(octet_length(to_jsonb(t)::text),budget_bytes)),0) AS bytes FROM os_learning_history t WHERE org_id=$1 AND row_kind<>'recovered-report'",[org])).rows[0];
  if(Number(usage.count)>1000||Number(usage.bytes)>16777216)fail(422,'learning_history','The retained learning inventory exceeds its supported bound.');
  const rows=(await c.query("SELECT * FROM os_learning_history WHERE org_id=$1 AND row_kind<>'recovered-report' AND ($2::boolean=false OR origin_mode='recovered') ORDER BY origin_org_id,binding_id,sequence NULLS FIRST,id LIMIT 1001",[org,recoveredOnly])).rows;
  const sources=[],approvedEvidence=[],events=[],modes=new Map();
  for(const row of rows){
    const admitted=row.row_kind==='source'?validateLearningSourceCapture(row.payload):row.row_kind==='evidence'?validateLearningEvidence(row.payload):validateLearningEvent(row.payload);
    if(admitted.sha256!==row.id)fail(422,'learning_history','The retained learning identity and bytes differ.');
    (row.row_kind==='source'?sources:row.row_kind==='evidence'?approvedEvidence:events).push(admitted);
    modes.set(row.id,row.origin_mode);
  }
  const folded=foldLearningHistory({sources,approvedEvidence,events});
  return {sources,approvedEvidence,events,bindings:folded.bindings,folded,modes,rows};
}

export function learningBinding(inventory,org,bindingId,{recovered=false}={}){
  const found=inventory.bindings.filter(binding=>binding.bindingId===bindingId&&
    (recovered?inventory.modes.get(binding.events[0].sha256)==='recovered':binding.originOrgId===org&&inventory.modes.get(binding.events[0].sha256)==='live'));
  if(found.length!==1)fail(404,'learning_binding','This learning binding is unavailable.');
  return found[0];
}
export function requireLearningHead(binding,pin){
  if(!learningSame(binding.head,pin))fail(409,'learning_stale','The learning history advanced. Inspect its current head and preview again.');
}
export function currentLearningSource(inventory,binding){
  const source=inventory.sources.find(item=>item.sha256===binding.source.sha256);
  if(!source)fail(422,'learning_history','The retained selected source is unavailable.');
  return source;
}
export async function learningBindingSummary(c,org,binding,mode='live'){
  const raw=(await c.query('SELECT data,deleted_at FROM os_records WHERE org_id=$1 AND id=$2',[org,binding.programId])).rows[0];
  let disposition=mode==='recovered'?'historical-only':!raw?'historical-only':raw.deleted_at?'trash':'bound';
  if(disposition==='bound'&&H('data',raw.data)!==binding.mappingEvent.payload.program.dataSha256)disposition='needs-review';
  return {bindingId:binding.bindingId,originOrgId:binding.originOrgId,programId:binding.programId,
    head:binding.head,originMode:mode,source:binding.source,mappingNumber:binding.mappingNumber,disposition};
}

export async function insertLearningHistory(c,org,kind,payload,{mode='live',receipt=null}={}){
  const value=kind==='source'?validateLearningSourceCapture(payload):kind==='evidence'?validateLearningEvidence(payload):validateLearningEvent(payload);
  const existing=(await c.query('SELECT payload,receipt,origin_mode,row_kind FROM os_learning_history WHERE org_id=$1 AND id=$2',[org,value.sha256])).rows[0];
  if(existing){
    if(existing.row_kind!==kind||!learningSame(existing.payload,value)||
       (kind==='event'&&(!learningSame(existing.receipt,receipt)||existing.origin_mode!==mode)))
      fail(409,'learning_identity','This retained learning hash already identifies different bytes or authority.');
    return false;
  }
  const origin=kind==='evidence'?value.pin.originOrgId:value.originOrgId;
  const row=(await c.query("INSERT INTO os_learning_history(org_id,id,row_kind,origin_mode,origin_org_id,binding_id,sequence,source_version,program_id,payload,receipt,budget_bytes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,octet_length($10::jsonb::text)+COALESCE(octet_length($11::jsonb::text),0)+4096) RETURNING budget_bytes,octet_length(to_jsonb(os_learning_history)::text) AS actual",[org,value.sha256,kind,mode,origin,kind==='evidence'?null:value.bindingId,kind==='event'?value.sequence:null,kind==='source'?value.sourceVersion:null,kind==='event'?value.programId:null,JSON.stringify(value),receipt?JSON.stringify(receipt):null])).rows[0];
  if(Number(row.actual)>Number(row.budget_bytes))fail(422,'learning_quota','The retained learning row exceeds its reserved representation.');
  return true;
}

export async function checkLearningCategories(c,org){
  const row=(await c.query("SELECT count(*) AS count,count(*) FILTER(WHERE row_kind='evidence') AS evidence,COALESCE(sum(GREATEST(octet_length(to_jsonb(t)::text),budget_bytes)),0) AS bytes FROM os_learning_history t WHERE org_id=$1 AND row_kind<>'recovered-report'",[org])).rows[0];
  if(Number(row.count)>1000||Number(row.evidence)>600||Number(row.bytes)>16777216)
    fail(422,'learning_quota','The learning history reached its 1,000-row, 600-evidence or 16 MiB bound. Existing history remains available.');
  const reports=(await c.query("SELECT (SELECT count(*) FROM os_reports WHERE org_id=$1 AND (payload->>'kind'='learning-review' OR payload->>'methodVersion' LIKE 'learning-%'))+(SELECT count(*) FROM os_learning_history WHERE org_id=$1 AND row_kind='recovered-report') AS count",[org])).rows[0];
  if(Number(reports.count)>20)fail(422,'learning_quota','This workspace reached its 20 combined live and recovered learning-report limit.');
  await checkLearningActiveRecords(c,org);
  return {nonreportCount:Number(row.count),nonreportBytes:Number(row.bytes),reportCount:Number(reports.count)};
}

export async function checkLearningActiveRecords(c,org,{inventory,additional=[]}={}){
  inventory??=await loadLearningInventory(c,org);
  const ids=new Set(inventory.events.flatMap(e=>['mapped','adopted'].includes(e.payload.kind)?e.payload.records.map(p=>p.recordId):
    ['measured','corrected','decided'].includes(e.payload.kind)?[e.payload.record.recordId]:[]));
  if(!ids.size&&!additional.length)return 0;
  const count=Number((await c.query('SELECT count(*) AS count FROM os_records WHERE org_id=$1 AND deleted_at IS NULL AND id=ANY($2::text[])',[org,[...ids]])).rows[0].count);
  const extra=new Set(additional.filter(recordId=>!ids.has(recordId))).size;
  if(count+extra>500)fail(422,'learning_quota','This workspace reached its 500 active learning-created record limit. Existing records and history remain available.');
  return count+extra;
}

export async function storeLearningPreview(c,org,member,sessionSha256,kind,payload,{id,reviewSha256,restoreEpochSha256}){
  learningId(id);learningHashValue(reviewSha256);learningHashValue(restoreEpochSha256);
  await c.query('DELETE FROM os_learning_previews WHERE org_id=$1 AND expires_at<=clock_timestamp()',[org]);
  const encoded=JSON.stringify(payload),size=(await c.query('SELECT octet_length($1::jsonb::text) AS bytes',[encoded])).rows[0].bytes;
  if(Number(size)>4194304)fail(413,'learning_preview','This complete learning preview exceeds 4 MiB.');
  const usage=(await c.query('SELECT count(*) AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0) AS bytes FROM os_learning_previews t WHERE org_id=$1',[org])).rows[0];
  if(Number(usage.count)>=4||Number(usage.bytes)+Number(size)+4096>16777216)
    fail(422,'learning_preview_quota','Four pending learning previews or their 16 MiB budget are in use. Finish a preview or wait for its 15-minute expiry.');
  const expiresAt=(await c.query("INSERT INTO os_learning_previews(org_id,id,actor_id,session_sha256,membership_sha256,restore_epoch_sha256,kind,payload,review_sha256,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp()+interval '15 minutes') RETURNING expires_at",[org,id,member.userId,sessionSha256,member.membershipSha256,restoreEpochSha256,kind,encoded,reviewSha256])).rows[0].expires_at.toISOString();
  if(await logicalBackupBytes(c,org)>60*1024*1024)
    fail(422,'learning_quota','This preview would exceed the workspace’s 60 MiB retained record and history budget. Existing records remain available to export.');
  return {previewId:id,reviewSha256,expiresAt};
}
export async function readLearningPreview(c,org,id,member,sessionSha256){
  const row=(await c.query('SELECT *,expires_at>clock_timestamp() AS current FROM os_learning_previews WHERE org_id=$1 AND id=$2',[org,id])).rows[0];
  if(!row||!row.current||row.actor_id!==member.userId||row.session_sha256!==sessionSha256||row.membership_sha256!==member.membershipSha256)
    fail(409,'learning_preview','This learning preview expired or its authority changed. Inspect and preview again.');
  return row;
}
export async function acceptedLearningCommand(c,org,commandHash){
  return (await c.query("SELECT payload,receipt FROM os_learning_history WHERE org_id=$1 AND row_kind='event' AND origin_mode='live' AND receipt->>'commandHash'=$2",[org,commandHash])).rows[0]??null;
}

export function decodeLearningCursor(text){
  if(text===null)return null;
  if(typeof text!=='string'||text.length>2048||!/^[A-Za-z0-9_-]+$/.test(text))fail(422,'learning_cursor','This learning cursor is invalid.');
  const bytes=Buffer.from(text,'base64url');
  if(bytes.toString('base64url')!==text||bytes.byteLength>2048)fail(422,'learning_cursor','This learning cursor is invalid.');
  return bytes;
}
export const encodeLearningCursor=value=>Buffer.from(learningCanonical(value)).toString('base64url');
