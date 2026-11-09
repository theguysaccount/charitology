/** SELECT-only finite-batch admission. Internal counterfactuals carry no current
 * authority, actual clock, accepted result or persistent budget reservation. */
import { hash } from './security.mjs';
import { RECURRENCE_PACKET_KIND, RECURRENCE_MANIFEST_FORMAT,
  makeRecurringOccurrencePreview, makeRecurringOccurrenceManifest,
  makeRecurringOccurrenceReceipt, validateRecurringOccurrenceReportRow, validateRecurringOccurrencePreviewRow } from './participation-recurrence-packets.mjs';
import { planRecurringSchedule } from './participation-recurrence-planner.mjs';
import { PARTICIPATION_RECURRENCE_REPORT_LIMITS as L, restoredParticipationRecurrenceReports } from './participation-recurrence-recovery.mjs';
import { need, freeze, id, fields, rows, number, owned } from './participation-recurrence-values.mjs';
import {recurrenceCreatedAuditRecord} from './participation-recurrence-records.mjs';

const LOGICAL=60*1024*1024,NATIVE=64*1024*1024,PREVIEW_BYTES=128*1024*1024;
const TIME='2200-12-31T23:59:59.999999Z',WIRE='2200-12-31T23:59:59.999Z';
// Historical validation requires recordedAtExact before every included start.
// Its fixed-width early stamp is budget data; actual generation reads SQL once.
const RECORDED='0001-01-01T00:00:00.000000Z',DIGEST='f'.repeat(64),AUDIT='9223372036854775807';
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const total=values=>values.reduce((sum,value)=>{const n=sum+number(value);need(Number.isSafeInteger(n),'recurrence_capacity');return n;},0);
const fits=(logical,native)=>need(number(logical)<=LOGICAL&&number(native)<=NATIVE,'recurrence_capacity');
const PHYSICAL=Object.freeze({
  os_records:Object.freeze('org_id id module_id data status owner_id last_editor_id revision approval snapshot source deleted_at created_at updated_at'.split(' ')),
  os_events:Object.freeze('org_id id actor_id action record_id module_id detail created_at'.split(' ')),
  os_reports:Object.freeze('org_id id created_by title checksum payload created_at'.split(' ')),
  os_previews:Object.freeze('org_id id actor_id kind payload checksum base_revision expires_at committed_at created_at'.split(' ')),
});
export const PARTICIPATION_RECURRENCE_CAPACITY_SQL=Object.freeze({
  family:"SELECT count(*) AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0) AS bytes FROM os_reports t WHERE org_id=$1 AND payload->>'format' LIKE $2",
  payloads:"SELECT id,payload::text AS payload_text FROM os_reports WHERE org_id=$1 AND payload->>'format' LIKE $2 ORDER BY id LIMIT 33",
  schema:"SELECT t.relname AS table_name,a.attname AS column_name FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_attribute a ON a.attrelid=t.oid WHERE n.nspname=current_schema() AND t.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY t.relname,a.attnum",
  previews:"SELECT count(*) FILTER(WHERE committed_at IS NULL) AS pending_count,COALESCE(sum(octet_length(payload::text)) FILTER(WHERE committed_at IS NULL),0) AS pending_bytes,count(*) FILTER(WHERE committed_at IS NOT NULL) AS committed_count,COALESCE(sum(octet_length(payload::text)) FILTER(WHERE committed_at IS NOT NULL),0) AS committed_bytes FROM os_previews WHERE org_id=$1",
});

/** SQL family charge, normalized payload and count are independent limits. The
 * store's bounded exact7 row reader also rejects unknown reserved variants. */
export async function checkParticipationRecurrenceFamilyCapacity(c,org){
  id(org);const found=rows(await c.query(PARTICIPATION_RECURRENCE_CAPACITY_SQL.family,[org,RECURRENCE_MANIFEST_FORMAT+'%']),1);need(found.length===1,'recurrence_driver',500);
  const measure=fields(found[0],['count','bytes']),count=number(measure.count),charge=number(measure.bytes);
  need(count<=L.reports&&charge<=L.familyBytes,'recurrence_report_capacity');
  const {recurrenceFamilyRows}=await import('./participation-recurrence-store.mjs');
  const reports=await recurrenceFamilyRows(c,org);need(reports.length===count,'recurrence_driver',500);
  for(const report of reports){validateRecurringOccurrenceReportRow(report);need(bytes(report.payload)<=L.payloadBytes,'recurrence_report_payload_limit');}
  return freeze({count,bytes:charge});
}

async function schema(c){
  const expected=Object.entries(PHYSICAL).flatMap(([table,columns])=>columns.map(column=>table+':'+column));
  const actual=rows(await c.query(PARTICIPATION_RECURRENCE_CAPACITY_SQL.schema,[Object.keys(PHYSICAL)]),expected.length).map(value=>{const x=fields(value,['table_name','column_name']);return x.table_name+':'+x.column_name;});
  need(actual.length===expected.length&&new Set(actual).size===expected.length&&expected.every(key=>actual.includes(key)),'recurrence_capacity_schema');
}
async function measure(c,table,values){
  need(Object.hasOwn(PHYSICAL,table),'recurrence_capacity_schema');if(!values.length)return[];
  values.forEach(value=>fields(value,PHYSICAL[table]));
  const result=rows(await c.query(`SELECT item.ordinality::integer AS position,octet_length(to_jsonb(r)::text) AS bytes,octet_length(r.${table==='os_records'?'data':table==='os_events'?'detail':'payload'}::text) AS content_bytes FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS item(value,ordinality) CROSS JOIN LATERAL jsonb_populate_record(NULL::${table},item.value) r ORDER BY item.ordinality`,[JSON.stringify(values)]),values.length);
  need(result.length===values.length,'recurrence_driver',500);
  return result.map((value,index)=>{const x=fields(value,['position','bytes','content_bytes']);need(number(x.position)===index+1,'recurrence_driver',500);const n=number(x.bytes);need(n>0,'recurrence_driver',500);return{bytes:n,contentBytes:number(x.content_bytes)};});
}

/** One existing safety composition, used by prospective admission and optional
 * export journals. Results are metrics from this actual tenant snapshot only. */
export async function measureParticipationRecurrenceSourceCapacity(c,org,backup){
  id(org);const {assembleWorkspaceBackup,checkWorkspaceExportCapacity}=await import('./workspace-backup.mjs');
  const {groupStateCount}=await import('./participation-group-store.mjs');
  if(await groupStateCount(c,org)){
    const {checkGroupOrdinaryCapacity}=await import('./participation-group-write-capacity.mjs');
    const value=await checkGroupOrdinaryCapacity(c,org);need(value,'recurrence_capacity');
    return freeze({requiredUsage:number(value.requiredUsage),requiredBackupBytes:number(value.requiredBackupBytes),
      usage:number(value.whole.usage),backupBytes:number(value.whole.backupBytes),
      inactiveRequiredUsage:number(value.inactive.requiredLogicalBytes),inactiveBackupBytes:number(value.inactive.backupBytes),
      inactiveActualRequiredUsage:number(value.whole.restore.requiredLogicalBytes),inactiveActualBackupBytes:number(value.whole.restore.backupBytes),
      restoreRetainedReserve:0,restoreNativeReserve:0,groupComposition:true});
  }
  backup??=await assembleWorkspaceBackup(c,org);
  const whole=await checkWorkspaceExportCapacity(c,org);
  need(bytes(backup)===number(whole.backupBytes),'recurrence_capacity_snapshot');
  const {measureLearningOperationalCapacity,checkLearningRestoreCapacity}=await import('./learning-capacity.mjs');
  const operational=whole.operational??await measureLearningOperationalCapacity(c,org,backup.participation);
  const {checkParticipationExportCapacity}=await import('./participation-capacity.mjs');
  const {checkInStateCount}=await import('./participant-check-in-store.mjs');
  const {checkCheckInCapacity}=await import('./participant-check-in-capacity.mjs');
  const participation=await checkParticipationExportCapacity(c,org,{legacySafety:Boolean(await checkInStateCount(c,org))});
  const checkins=await checkCheckInCapacity(c,org);
  const inactive=whole.restore??await checkLearningRestoreCapacity(c,backup);
  const pRetained=number(participation.wholeRetainedReserve),pNative=number(participation.wholeNativeReserve);
  const requiredUsage=total([whole.usage,operational.sourceLogicalGrowthBytes,pRetained,checkins.wholeRetainedReserve]);
  const requiredBackupBytes=total([whole.backupBytes,operational.sourceWireGrowthBytes,pNative,checkins.wholeNativeReserve]);
  fits(requiredUsage,requiredBackupBytes);fits(inactive.requiredLogicalBytes+pRetained,inactive.backupBytes+pNative);
  return freeze({requiredUsage,requiredBackupBytes,usage:number(whole.usage),backupBytes:number(whole.backupBytes),
    inactiveRequiredUsage:number(inactive.requiredLogicalBytes)+pRetained,inactiveBackupBytes:number(inactive.backupBytes)+pNative,
    inactiveActualRequiredUsage:number(inactive.requiredLogicalBytes),inactiveActualBackupBytes:number(inactive.backupBytes),
    restoreRetainedReserve:pRetained,restoreNativeReserve:pNative,groupComposition:false});
}

function counterfactuals(org,input,dependencies,authority,backup){
  const used=new Set([input.source.id,...input.references.map(r=>r.id),...backup.records.map(r=>r.id),...(backup.trash||[]).map(r=>r.id),...(backup.reports||[]).map(r=>r.id)]);
  for(const row of restoredParticipationRecurrenceReports(backup).reports){used.add(row.payload.source.id);row.payload.dependencies.references.forEach(r=>used.add(r.id));row.payload.candidates.forEach(r=>used.add(r.id));}
  let slot=0;const next=()=>{while(slot<1000000){const candidate='BUDGET_ONLY_'.padEnd(92,'x')+(slot++).toString(16).padStart(8,'0');if(!used.has(candidate)){used.add(candidate);return candidate;}}need(false,'recurrence_capacity');};
  const previewId=next(),reportId=next(),plan=planRecurringSchedule(input.schedule);need(plan.state==='ready','recurrence_draft_not_ready');
  const children=plan.occurrences.filter(o=>o.range!==null).map(o=>({sequence:o.sequence,id:next()}));need(children.length>0&&children.length<=8,'recurrence_draft_not_ready');
  const complete={...input,children};
  const preview=makeRecurringOccurrencePreview({orgId:org,actorId:input.actorId,reportId,authority,dependencies,input:complete});
  return projectPreview(org,previewId,preview,backup);
}
function projectPreview(org,previewId,preview,backup){
  const compiled=preview.review.compiled,reportId=preview.reportId,authority=preview.authority,dependencies=preview.dependencies,input=preview.review.input;
  const manifest=makeRecurringOccurrenceManifest({reportId,recordedAtExact:RECORDED,compiled,dependencies});
  const report=validateRecurringOccurrenceReportRow({org_id:org,id:reportId,created_by:input.actorId,title:'Recurring occurrence drafts: '+compiled.source.id,checksum:manifest.sha256,payload:manifest,created_at:TIME});
  const receipt=makeRecurringOccurrenceReceipt({manifest,authority,keyHash:DIGEST,requestHash:DIGEST});
  const previewRow={org_id:org,id:previewId,actor_id:input.actorId,kind:RECURRENCE_PACKET_KIND,payload:preview,checksum:hash(preview),base_revision:preview.dependenciesSha256,expires_at:TIME,committed_at:null,created_at:TIME};
  const committed={...previewRow,payload:receipt,checksum:hash(receipt),committed_at:TIME};
  const records=compiled.candidates.map(r=>({org_id:org,id:r.id,module_id:r.moduleId,data:r.data,status:'draft',owner_id:input.actorId,last_editor_id:input.actorId,revision:1,approval:null,snapshot:null,source:null,deleted_at:null,created_at:TIME,updated_at:TIME}));
  const native=compiled.candidates.map(r=>({...r,createdAt:WIRE,updatedAt:WIRE}));
  const audits=compiled.candidates.map((r,index)=>({org_id:org,id:(BigInt(AUDIT)-BigInt(index+1)).toString(),actor_id:input.actorId,action:'record.created',record_id:r.id,module_id:r.moduleId,detail:{record:recurrenceCreatedAuditRecord(records[index],r)},created_at:TIME}));
  audits.push({org_id:org,id:AUDIT,actor_id:input.actorId,action:'participation-recurrence.generated',record_id:null,module_id:null,detail:{reportId,reportSha256:manifest.sha256,sourceId:compiled.source.id,recordIds:compiled.candidates.map(r=>r.id)},created_at:TIME});
  const {checksum,...body}=backup;
  const finalBody={...body,records:[...backup.records,...native],events:[...(backup.events||[]),...audits.map(row=>({...row,created_at:WIRE}))],reports:[...(backup.reports||[]),{...report,created_at:WIRE}]};
  return{previewRow,committed,report,records,audits,finalPacket:{...finalBody,checksum:hash(finalBody)}};
}

/** Before actual IDs and domain clock. Input is compiler input without children.
 * Only numeric sizing metrics escape; counterfactual packets never persist. */
export async function checkParticipationRecurrenceBudget(c,org,args){
  id(org);const v=fields(args,['input','dependencies','authority']);
  const input=fields(owned(v.input),['orgId','actorId','source','schedule','titles','references']);need(input.orgId===org,'recurrence_capacity_context');id(input.actorId);
  const dependencies=owned(v.dependencies),authority=owned(v.authority);
  await schema(c);const family=await checkParticipationRecurrenceFamilyCapacity(c,org);need(family.count<L.reports,'recurrence_report_limit');
  const {assembleWorkspaceBackup}=await import('./workspace-backup.mjs');
  const {logicalBackupBytes}=await import('./database.mjs');
  const {checkLearningRestoreCapacity}=await import('./learning-capacity.mjs');
  const backup=await assembleWorkspaceBackup(c,org),source=await measureParticipationRecurrenceSourceCapacity(c,org,backup);
  const budget=counterfactuals(org,input,dependencies,authority,backup);
  const recordMeasures=await measure(c,'os_records',budget.records),auditMeasures=await measure(c,'os_events',budget.audits),reportMeasures=await measure(c,'os_reports',[budget.report]);
  const previewMeasures=await measure(c,'os_previews',[budget.previewRow,budget.committed]);
  need(family.bytes+reportMeasures[0].bytes<=L.familyBytes,'recurrence_report_capacity');
  const recordUsage=rows(await c.query('SELECT count(*) FILTER(WHERE deleted_at IS NULL) AS count,COALESCE(sum(octet_length(data::text)),0) AS bytes FROM os_records WHERE org_id=$1',[org]),1);need(recordUsage.length===1,'recurrence_driver',500);
  const records=fields(recordUsage[0],['count','bytes']);need(number(records.count)+budget.records.length<=2000&&number(records.bytes)+total(recordMeasures.map(x=>x.contentBytes))<=16*1024*1024,'recurrence_record_capacity');
  const previewUsage=rows(await c.query(PARTICIPATION_RECURRENCE_CAPACITY_SQL.previews,[org]),1);need(previewUsage.length===1,'recurrence_driver',500);
  const p=fields(previewUsage[0],['pending_count','pending_bytes','committed_count','committed_bytes']);
  const pendingPayloadBytes=previewMeasures[0].contentBytes,receiptPayloadBytes=previewMeasures[1].contentBytes;
  need(number(p.pending_count)+1<=4&&number(p.pending_bytes)+pendingPayloadBytes<=PREVIEW_BYTES,'preview_quota');
  need(number(p.committed_count)+1<=32&&number(p.committed_bytes)+Math.max(pendingPayloadBytes,receiptPayloadBytes)<=PREVIEW_BYTES,'archive_quota');
  // The source pending row and accepted final graph are alternative phases.
  // Committed payloads retain the existing separate32/128MiB archive charge.
  const pendingRequiredUsage=source.requiredUsage+previewMeasures[0].bytes;
  const finalGrowth=total([...recordMeasures,...auditMeasures,...reportMeasures].map(x=>x.bytes));
  const finalRequiredUsage=source.requiredUsage+finalGrowth;
  const wireGrowth=bytes(budget.finalPacket)-bytes(backup);need(wireGrowth>=0,'recurrence_capacity');
  const finalRequiredBackupBytes=source.requiredBackupBytes+wireGrowth;
  fits(pendingRequiredUsage,source.requiredBackupBytes);fits(finalRequiredUsage,finalRequiredBackupBytes);
  const restored=await checkLearningRestoreCapacity(c,budget.finalPacket);
  // Preserve the existing GROUP inactive-history projection once. Its delta is
  // independent of these new ordinary children and passive report metadata.
  const restoreRequiredUsage=restored.requiredLogicalBytes+Math.max(0,source.inactiveRequiredUsage-source.inactiveActualRequiredUsage);
  const restoreRequiredBackupBytes=restored.backupBytes+Math.max(0,source.inactiveBackupBytes-source.inactiveActualBackupBytes);
  fits(restoreRequiredUsage,restoreRequiredBackupBytes);
  need(number(await logicalBackupBytes(c,org))===source.usage,'recurrence_capacity_snapshot');
  return freeze({phase:'pre-id-budget-only',projectionOnly:true,childCount:budget.records.length,reportCount:family.count+1,
    pendingRequiredUsage,finalRequiredUsage,finalRequiredBackupBytes,restoreRequiredUsage,restoreRequiredBackupBytes,
    pendingPayloadBytes,receiptPayloadBytes,committedCompositeBytes:previewMeasures[1].bytes,
    recordBytes:total(recordMeasures.map(x=>x.bytes)),auditBytes:total(auditMeasures.map(x=>x.bytes)),reportBytes:reportMeasures[0].bytes,
    groupComposition:source.groupComposition});
}

/** Existing pending command, after current context/pins/compiler equality and
 * before the final domain clock. Reuses its actual IDs and replaces its pending
 * charge instead of purchasing a fifth pending slot or charging it twice. */
export async function checkParticipationRecurrencePendingBudget(c,org,args){
  id(org);const a=fields(args,['row']),row=fields(owned(a.row),PHYSICAL.os_previews);
  const admitted=validateRecurringOccurrencePreviewRow(row);
  need(admitted.state==='pending'&&row.org_id===org,'recurrence_preview',409);
  const actual=rows(await c.query("SELECT octet_length(to_jsonb(t)::text) AS bytes FROM os_previews t WHERE org_id=$1 AND id=$2 AND actor_id=$3 AND kind=$4 AND checksum=$5 AND payload=$6::jsonb AND expires_at=$7::timestamptz AND created_at=$8::timestamptz AND base_revision=$9 AND committed_at IS NULL AND expires_at>clock_timestamp()",[org,row.id,row.actor_id,RECURRENCE_PACKET_KIND,row.checksum,JSON.stringify(row.payload),row.expires_at,row.created_at,row.base_revision]),1);
  need(actual.length===1,'recurrence_preview',409);const pendingCharge=number(fields(actual[0],['bytes']).bytes);need(pendingCharge>0,'recurrence_driver',500);
  await schema(c);const family=await checkParticipationRecurrenceFamilyCapacity(c,org);need(family.count<L.reports,'recurrence_report_limit');
  const {assembleWorkspaceBackup}=await import('./workspace-backup.mjs');
  const {logicalBackupBytes}=await import('./database.mjs');
  const {checkLearningRestoreCapacity}=await import('./learning-capacity.mjs');
  const backup=await assembleWorkspaceBackup(c,org),source=await measureParticipationRecurrenceSourceCapacity(c,org,backup);
  need(source.usage>=pendingCharge,'recurrence_capacity_snapshot');
  const budget=projectPreview(org,row.id,admitted.payload,backup);
  const recordMeasures=await measure(c,'os_records',budget.records),auditMeasures=await measure(c,'os_events',budget.audits),reportMeasures=await measure(c,'os_reports',[budget.report]),previewMeasures=await measure(c,'os_previews',[budget.committed]);
  need(family.bytes+reportMeasures[0].bytes<=L.familyBytes,'recurrence_report_capacity');
  const recordUsage=rows(await c.query('SELECT count(*) FILTER(WHERE deleted_at IS NULL) AS count,COALESCE(sum(octet_length(data::text)),0) AS bytes FROM os_records WHERE org_id=$1',[org]),1);need(recordUsage.length===1,'recurrence_driver',500);
  const records=fields(recordUsage[0],['count','bytes']);need(number(records.count)+budget.records.length<=2000&&number(records.bytes)+total(recordMeasures.map(x=>x.contentBytes))<=16*1024*1024,'recurrence_record_capacity');
  const previewUsage=rows(await c.query(PARTICIPATION_RECURRENCE_CAPACITY_SQL.previews,[org]),1);need(previewUsage.length===1,'recurrence_driver',500);
  const p=fields(previewUsage[0],['pending_count','pending_bytes','committed_count','committed_bytes']);
  need(number(p.pending_count)>=1&&number(p.pending_count)<=4&&number(p.pending_bytes)<=PREVIEW_BYTES,'preview_quota');
  need(number(p.committed_count)+1<=32&&number(p.committed_bytes)+previewMeasures[0].contentBytes<=PREVIEW_BYTES,'archive_quota');
  const finalGrowth=total([...recordMeasures,...auditMeasures,...reportMeasures].map(x=>x.bytes));
  const finalRequiredUsage=source.requiredUsage-pendingCharge+finalGrowth;
  const wireGrowth=bytes(budget.finalPacket)-bytes(backup);need(wireGrowth>=0,'recurrence_capacity');
  const finalRequiredBackupBytes=source.requiredBackupBytes+wireGrowth;fits(finalRequiredUsage,finalRequiredBackupBytes);
  const restored=await checkLearningRestoreCapacity(c,budget.finalPacket);
  const restoreRequiredUsage=restored.requiredLogicalBytes+Math.max(0,source.inactiveRequiredUsage-source.inactiveActualRequiredUsage);
  const restoreRequiredBackupBytes=restored.backupBytes+Math.max(0,source.inactiveBackupBytes-source.inactiveActualBackupBytes);
  fits(restoreRequiredUsage,restoreRequiredBackupBytes);
  need(number(await logicalBackupBytes(c,org))===source.usage,'recurrence_capacity_snapshot');
  return freeze({phase:'pending-budget-only',projectionOnly:true,childCount:budget.records.length,reportCount:family.count+1,
    replacedPendingBytes:pendingCharge,finalRequiredUsage,finalRequiredBackupBytes,restoreRequiredUsage,restoreRequiredBackupBytes,
    receiptPayloadBytes:previewMeasures[0].contentBytes,committedCompositeBytes:previewMeasures[0].bytes,
    recordBytes:total(recordMeasures.map(x=>x.bytes)),auditBytes:total(auditMeasures.map(x=>x.bytes)),reportBytes:reportMeasures[0].bytes,
    groupComposition:source.groupComposition});
}

/** Complete post-write graph; outer COMMIT and database final gates remain
 * decisive. Accepted READ ONLY Retry never calls this admission path. */
export async function checkParticipationRecurrenceFinalCapacity(c,org){
  const family=await checkParticipationRecurrenceFamilyCapacity(c,org),source=await measureParticipationRecurrenceSourceCapacity(c,org);
  return freeze({family,...source});
}

export const PARTICIPATION_RECURRENCE_CAPACITY_CONTRACT=freeze({
  budget:'Counterfactual maximum-width IDs and timestamp metadata only; actual SELECT composite/JSONB casts. Never persisted or returned as preview authority.',
  phases:'Pending source preview and accepted children/report/audits are measured separately; compact accepted packet uses unchanged source-archive gates.',
  composition:'One existing GROUP composition, otherwise operational+person/booking/policy/outbox+check-in once; no finite-series future exit.',
  limits:{reports:L.reports,payloadBytes:L.payloadBytes,familyBytes:L.familyBytes,logicalBytes:LOGICAL,nativeBytes:NATIVE},
  evidence:'Source implementation only. No actual PostgreSQL, CI, attainability, participant consent or release evidence.'
});
