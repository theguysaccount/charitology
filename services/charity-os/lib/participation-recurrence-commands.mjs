/** One supplied tenant client. Router owns outer org lock and COMMIT. */
import {id as freshId,hash,fail} from './security.mjs';
import {storePreview,commitPreview,saveRecord,audit} from './database.mjs';
import {validateRecord} from './modules.mjs';
import {compareGroupExactStamps} from './participation-group-model.mjs';
import {recurrenceCreatedAuditRecord} from './participation-recurrence-records.mjs';
import {compileRecurringOccurrenceDrafts} from './participation-recurrence-model.mjs';
import {RECURRING_METHOD,recurringOccurrenceAnchor,validateRecurringSchedule,planRecurringSchedule} from './participation-recurrence-planner.mjs';
import {makeRecurringOccurrencePreview,makeRecurringOccurrenceManifest,makeRecurringOccurrenceReportRow,makeRecurringOccurrenceReceipt,recurringOccurrenceCommandHashes,RECURRENCE_PACKET_KIND} from './participation-recurrence-packets.mjs';
import {recurrencePreflight,readRecurrenceSourceContext,requireRecurrenceAcceptedContext,authorizeRecurrenceHistory} from './participation-recurrence-context.mjs';
import {recurrenceFamilyRows,lookupRecurrenceIntent,readRecurrencePreview,appendRecurrenceReport,getRecurrenceReport,pageRecurrenceReports,requireRecurrenceIdsAvailable} from './participation-recurrence-store.mjs';
import {checkParticipationRecurrenceBudget,checkParticipationRecurrencePendingBudget,checkParticipationRecurrenceFinalCapacity} from './participation-recurrence-capacity.mjs';
import {need,id,fields,prop,rows,owned,freeze,same,stamp} from './participation-recurrence-values.mjs';
const actor=session=>id(prop(prop(session,'user'),'id'));
export function recurrenceCreateRequest(input){const v=fields(owned(input,32768),['previewId','commandKey']);id(v.previewId);need(typeof v.commandKey==='string'&&/^[A-Za-z0-9_-]{16,100}$/.test(v.commandKey));return v;}
const metadata=r=>({id:r.id,title:r.title,checksum:r.checksum,originOrgId:r.payload.originOrgId,recordedAtExact:r.payload.recordedAtExact,createdAt:r.created_at});
export async function inspectParticipationRecurrence(c,{org,session,input}){
  const v=fields(owned(input,32768),['sourceId']),context=await readRecurrenceSourceContext(c,{org,session,sourceId:id(v.sourceId),write:false});
  const existing=(await recurrenceFamilyRows(c,org)).filter(r=>r.payload.source.id===v.sourceId);need(existing.length<=1,'recurrence_history',409);
  if(existing.length)await authorizeRecurrenceHistory(c,{org,session,manifest:existing[0].payload});
  return freeze({source:context.source,dependencies:context.references,existing:existing.length?{...metadata(existing[0]),disposition:'retained-history'}:null});
}
/** Server-resolved schedule exploration only: no saved preview, generated
 * identities, capacity purchase, final clock, receipt or draft is created. */
export async function planParticipationRecurrence(c,{org,session,input}){
  const v=fields(owned(input,32768),['sourceId','sourceRevision','intervalWeeks','count','exceptions','resolutions']);id(v.sourceId);need(Number.isSafeInteger(v.sourceRevision)&&v.sourceRevision>=1&&v.sourceRevision<=2147483647);
  const context=await readRecurrenceSourceContext(c,{org,session,sourceId:v.sourceId,write:false});need(context.source.revision===v.sourceRevision,'recurrence_stale',409);
  const data=validateRecord(context.source.moduleId,context.source.data,{orgId:org,recordId:context.source.id,status:'draft',records:context.references});
  const anchor=recurringOccurrenceAnchor({startAt:data.startAt,endAt:data.endAt,timeZone:data.timeZone,intervalWeeks:v.intervalWeeks});
  const schedule=validateRecurringSchedule({format:'charitology-participation-recurrence',version:1,method:RECURRING_METHOD,timeZone:data.timeZone,anchor,intervalWeeks:v.intervalWeeks,count:v.count,exceptions:v.exceptions,resolutions:v.resolutions});
  const plan=planRecurringSchedule(schedule);
  return freeze({reviewKind:'schedule-plan-only',source:{id:context.source.id,moduleId:context.source.moduleId,revision:context.source.revision},schedule,plan,savedPreview:false,processingTime:'unassigned'});
}
export async function previewParticipationRecurrence(c,{org,session,input}){
  const v=fields(owned(input,32768),['sourceId','sourceRevision','schedule','titles']);id(v.sourceId);need(Number.isSafeInteger(v.sourceRevision)&&v.sourceRevision>=1&&v.sourceRevision<=2147483647);
  const context=await readRecurrenceSourceContext(c,{org,session,sourceId:v.sourceId,write:true});need(context.source.revision===v.sourceRevision,'recurrence_stale',409);
  // Preview eligibility uses only the actual current source and resolved ready
  // calendar. It is not an accepted processing stamp or a persisted intent.
  const data=validateRecord(context.source.moduleId,context.source.data,{orgId:org,recordId:context.source.id,status:'draft',records:context.references});
  const schedule=validateRecurringSchedule(v.schedule),anchor=recurringOccurrenceAnchor({startAt:data.startAt,endAt:data.endAt,timeZone:data.timeZone,intervalWeeks:schedule.intervalWeeks});
  need(schedule.timeZone===data.timeZone&&same(schedule.anchor,anchor),'recurrence_draft_anchor');
  const plan=planRecurringSchedule(schedule);need(plan.state==='ready','recurrence_draft_not_ready');
  const included=plan.occurrences.filter(o=>o.range!==null);need(included.length>=1&&included.length<=8);
  const eligibility=rows(await c.query(RECURRENCE_COMMAND_SQL.previewEligibility,[included.map(o=>o.range.startAt)]),1);need(eligibility.length===1,'recurrence_driver',500);
  const eligible=fields(eligibility[0],['eligible']).eligible;need(typeof eligible==='boolean','recurrence_driver',500);
  if(!eligible)fail(422,'recurrence_future','All selected starts must be in the future. Skip or replace past dates, then review the schedule again.');
  const base={orgId:org,actorId:context.member.userId,source:context.source,schedule,titles:v.titles,references:context.references};
  // This checks the actual planner/compiler and budget-only templates before
  // any real report/child identity or final processing time is assigned.
  await checkParticipationRecurrenceBudget(c,org,{input:base,dependencies:context.dependencies,authority:context.authority});
  const previewId=freshId(),reportId=freshId(),children=v.titles.map(t=>({sequence:t.sequence,id:freshId()}));
  const packet=makeRecurringOccurrencePreview({orgId:org,actorId:context.member.userId,reportId,authority:context.authority,dependencies:context.dependencies,input:{...base,children}});
  await requireRecurrenceIdsAvailable(c,{org,sourceId:v.sourceId,previewId,reportId,recordIds:children.map(x=>x.id)});
  await storePreview(c,{org,previewId,actorId:context.member.userId,kind:RECURRENCE_PACKET_KIND,payload:packet,checksum:hash(packet),baseRevision:packet.dependenciesSha256});
  const saved=await readRecurrencePreview(c,{org,actorId:context.member.userId,previewId});need(saved.state==='pending'&&same(saved.payload,packet),'recurrence_preview');
  await checkParticipationRecurrenceFinalCapacity(c,org);
  return freeze({previewId,expiresAt:saved.row.expires_at,review:{...packet.review,reportId:packet.reportId,dependencies:packet.dependencies,dependenciesSha256:packet.dependenciesSha256},processingTime:'assigned-on-create'});
}
async function intent(c,{org,session,input,write}){
  const request=recurrenceCreateRequest(input),actorId=actor(session),pins=recurringOccurrenceCommandHashes({orgId:org,actorId,...request});
  await recurrencePreflight(c,{org,session,write:true});
  const list=await lookupRecurrenceIntent(c,{org,actorId,previewId:request.previewId,commandSha256:pins.commandSha256,write});need(list.length<=1,'recurrence_intent',409);
  const retained=list[0]??null;
  if(retained){need(retained.row.id===request.previewId,'recurrence_intent',409);if(retained.state==='committed')need(retained.payload.commandSha256===pins.commandSha256&&retained.payload.requestSha256===pins.requestSha256,'recurrence_intent',409);}
  return{request,pins,retained,actorId};
}
async function accepted(c,{org,session},lookup){
  const e=lookup.retained;if(!e||e.state!=='committed')return null;
  const receipt=e.payload,report=await getRecurrenceReport(c,org,receipt.result.reportId),m=report.payload;
  need(report.created_by===lookup.actorId&&m.originOrgId===org&&m.sha256===receipt.result.reportSha256&&m.recordedAtExact===receipt.acceptedAtExact&&same(m.candidates.map(x=>x.id),receipt.result.recordIds),'recurrence_intent',409);
  await requireRecurrenceAcceptedContext(c,{org,session,manifest:m,authority:receipt.authority});
  return freeze({...receipt.result,replayed:true});
}
/** Actual read-only route calls this before any pending mutation/clock/budget. */
export async function acceptedParticipationRecurrence(c,args){return accepted(c,args,await intent(c,{...args,write:false}));}
export const RECURRENCE_COMMAND_SQL=Object.freeze({
  // Only a bounded boolean escapes this preview-only SQL clock. Equality is
  // ineligible. Create still assigns and checks its own one SQL6 final stamp.
  previewEligibility:`WITH preview_eligibility AS MATERIALIZED (SELECT clock_timestamp() AS at) SELECT COALESCE(bool_and(selected.start_at>p.at),false) AS eligible FROM unnest($1::timestamptz[]) AS selected(start_at) CROSS JOIN preview_eligibility p`,
  clock:`WITH processing AS MATERIALIZED (SELECT clock_timestamp() AS at) SELECT to_char(at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at_exact FROM processing`,
  receipt:`UPDATE os_previews SET payload=$5::jsonb,checksum=$6 WHERE org_id=$1 AND id=$2 AND actor_id=$3 AND kind=$4 AND committed_at IS NULL AND expires_at>clock_timestamp() AND checksum=$7 AND payload=$8::jsonb AND base_revision=$9`,
  created:`SELECT org_id,id,module_id,data,status,owner_id,last_editor_id,revision,approval,snapshot,source,deleted_at,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at FROM os_records WHERE org_id=$1 AND id=$2 AND deleted_at IS NULL`,
});
export async function createParticipationRecurrence(c,args){
  const {org,session}=args,lookup=await intent(c,{...args,write:true}),old=await accepted(c,args,lookup);
  // An accepted race must leave this write-classified transaction by rollback
  // and reconcile through the router's real READ ONLY path. Returning here
  // would purchase ordinary final-capacity reserve for a no-write Retry.
  need(old===null,'recurrence_read_reconcile',409);
  const pending=lookup.retained;need(pending&&pending.state==='pending'&&pending.current,'recurrence_preview',409);const packet=pending.payload;
  const context=await readRecurrenceSourceContext(c,{org,session,sourceId:packet.review.compiled.source.id,write:true});
  need(same(context.authority,packet.authority)&&same(context.dependencies,packet.dependencies),'recurrence_stale',409);
  const original=packet.review.input,current={...original,source:context.source,references:context.references};
  const compiled=compileRecurringOccurrenceDrafts(current);need(same(compiled,packet.review.compiled),'recurrence_stale',409);
  await requireRecurrenceIdsAvailable(c,{org,sourceId:context.source.id,previewId:lookup.request.previewId,reportId:packet.reportId,recordIds:compiled.candidates.map(x=>x.id),ownPreviewId:lookup.request.previewId});
  await checkParticipationRecurrencePendingBudget(c,org,{row:pending.row});
  const clock=rows(await c.query(RECURRENCE_COMMAND_SQL.clock,[]),1);need(clock.length===1);const at=stamp(fields(clock[0],['at_exact']).at_exact);
  need(compareGroupExactStamps(at,pending.row.expires_at)<0,'recurrence_preview',409);
  // Supplied actual SQL6 stamp must precede every start. No JS wall clock or
  // synthetic generated child timestamp is used as accepted processing time.
  const manifest=makeRecurringOccurrenceManifest({reportId:packet.reportId,recordedAtExact:at,compiled,dependencies:context.dependencies});
  for(const r of compiled.candidates){const data=validateRecord(r.moduleId,r.data,{orgId:org,recordId:r.id,status:'draft',records:context.references});need(same(data,r.data),'recurrence_stale',409);await saveRecord(c,{...r,data});const inserted=rows(await c.query(RECURRENCE_COMMAND_SQL.created,[org,r.id]),1);need(inserted.length===1,'recurrence_created_row');const record=recurrenceCreatedAuditRecord(inserted[0],r);need(await audit(c,org,lookup.actorId,'record.created',record,{record}),'recurrence_audit');}
  const report=makeRecurringOccurrenceReportRow({orgId:org,id:manifest.reportId,actorId:lookup.actorId,createdAtExact:at,payload:manifest});await appendRecurrenceReport(c,{org,member:context.member,row:report});
  const recordIds=manifest.candidates.map(x=>x.id),detail={reportId:manifest.reportId,reportSha256:manifest.sha256,sourceId:manifest.source.id,recordIds};
  need(await audit(c,org,lookup.actorId,'participation-recurrence.generated',null,detail),'recurrence_audit');
  const receipt=makeRecurringOccurrenceReceipt({manifest,authority:context.authority,keyHash:lookup.pins.commandSha256,requestHash:lookup.pins.requestSha256});
  need(prop(await c.query(RECURRENCE_COMMAND_SQL.receipt,[org,lookup.request.previewId,lookup.actorId,RECURRENCE_PACKET_KIND,JSON.stringify(receipt),hash(receipt),pending.row.checksum,JSON.stringify(packet),pending.row.base_revision]),'rowCount')===1,'recurrence_preview',409);
  await commitPreview(c,org,lookup.request.previewId);await checkParticipationRecurrenceFinalCapacity(c,org);
  return freeze({...receipt.result,replayed:false});
}
export async function participationRecurrenceHistory(c,{org,session,reportId=null,after=null,limit=20}){
  await recurrencePreflight(c,{org,session,write:false});
  const found=reportId===null?await pageRecurrenceReports(c,org,after,limit):[await getRecurrenceReport(c,org,id(reportId))],admitted=[];
  for(const r of found){const view=await authorizeRecurrenceHistory(c,{org,session,manifest:r.payload});admitted.push({...metadata(r),payload:r.payload,currentDisposition:view.current,acceptance:'historical-data-only'});}
  return reportId===null?freeze({reports:admitted.slice(0,limit),nextAfter:admitted.length>limit?admitted[limit-1].id:null}):freeze({report:admitted[0]});
}
