/** Same-client SQL only; caller owns fresh authority, org lock and outer tx. */
import {hash} from './security.mjs';
import {requirePermission} from './access.mjs';
import {validateRecurringOccurrenceReportRow,validateRecurringOccurrencePreviewRow,RECURRENCE_PACKET_KIND,RECURRENCE_MANIFEST_FORMAT} from './participation-recurrence-packets.mjs';
import {need,id,rows,fields,jsonRow,number,stamp,prop} from './participation-recurrence-values.mjs';
const reportSelect=`SELECT r.org_id,r.id,r.created_by,r.title,r.checksum,r.payload,to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at FROM os_reports r WHERE r.org_id=$1`;
const previewSelect=`SELECT t.org_id,t.id,t.actor_id,t.kind,t.payload,t.checksum,t.base_revision,to_char(t.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS expires_at,to_char(t.committed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS committed_at,to_char(t.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,(CASE WHEN t.committed_at IS NULL THEN t.expires_at>clock_timestamp() ELSE false END) AS current FROM os_previews t WHERE t.org_id=$1 AND t.actor_id=$2 AND t.kind=$3`;
export const RECURRENCE_STORE_SQL=Object.freeze({
  family:reportSelect+" AND r.payload->>'format' LIKE 'charitology-participation-occurrence-generation%' ORDER BY r.id COLLATE \"C\" LIMIT 33",
  detail:reportSelect+' AND r.id=$2 LIMIT 2',
  list:reportSelect+" AND r.payload->>'format' LIKE 'charitology-participation-occurrence-generation%' AND ($2::text IS NULL OR r.id COLLATE \"C\">$2 COLLATE \"C\") ORDER BY r.id COLLATE \"C\" LIMIT $3",
  available:'SELECT id FROM os_reports WHERE org_id=$1 AND id=$2 LIMIT 1',
  insert:'INSERT INTO os_reports(org_id,id,created_by,title,checksum,payload,created_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::timestamptz)',
  lookup:previewSelect+" AND (t.id=$4 OR (t.committed_at IS NOT NULL AND t.payload->>'commandSha256'=$5)) ORDER BY t.id COLLATE \"C\" LIMIT 3",
  time:previewSelect+' AND t.id=$4 LIMIT 2',
});
function admittedReport(row,org){const r=validateRecurringOccurrenceReportRow(row);need(r.org_id===org,'recurrence_unavailable',404);return r;}
export async function recurrenceFamilyRows(c,org){id(org);const list=rows(await c.query(RECURRENCE_STORE_SQL.family,[org]),33);need(list.length<=32,'recurrence_family_quota');return list.map(r=>admittedReport(r,org));}
export async function requireRecurrenceReportIdAvailable(c,org,reportId){id(org);id(reportId);need(rows(await c.query(RECURRENCE_STORE_SQL.available,[org,reportId]),1).length===0,'recurrence_identity',409);}
export async function appendRecurrenceReport(c,{org,member,row}){
  id(org);id(member.userId);const r=admittedReport(row,org);requirePermission(r.payload.source.moduleId,member,'write');
  need(r.created_by===member.userId&&r.payload.originOrgId===org&&r.created_at===r.payload.recordedAtExact,'recurrence_report_context');
  await requireRecurrenceReportIdAvailable(c,org,r.id);
  need(prop(await c.query(RECURRENCE_STORE_SQL.insert,[org,r.id,r.created_by,r.title,r.checksum,JSON.stringify(r.payload),r.created_at]),'rowCount')===1,'recurrence_report_write');return r;
}
export async function getRecurrenceReport(c,org,reportId){id(org);id(reportId);const list=rows(await c.query(RECURRENCE_STORE_SQL.detail,[org,reportId]),1);need(list.length===1,'recurrence_unavailable',404);return admittedReport(list[0],org);}
export async function pageRecurrenceReports(c,org,after,limit){id(org);if(after!==null)id(after);need(Number.isSafeInteger(limit)&&limit>=1&&limit<=20);const list=rows(await c.query(RECURRENCE_STORE_SQL.list,[org,after,limit+1]),limit+1);let previous=after;return list.map(x=>{const r=admittedReport(x,org);need(previous===null||r.id>previous);previous=r.id;return r;});}
function previewRow(raw,org,actorId){const {current,...row}=fields(raw,['org_id','id','actor_id','kind','payload','checksum','base_revision','expires_at','committed_at','created_at','current']);need(typeof current==='boolean');const admitted=validateRecurringOccurrencePreviewRow(row);need(row.org_id===org&&row.actor_id===actorId&&row.kind===RECURRENCE_PACKET_KIND,'recurrence_unavailable',404);return{row,...admitted,current};}
export async function lookupRecurrenceIntent(c,{org,actorId,previewId,commandSha256,write}){
  id(org);id(actorId);id(previewId);need(typeof write==='boolean'&&/^[a-f0-9]{64}$/.test(commandSha256));
  const list=rows(await c.query(RECURRENCE_STORE_SQL.lookup+(write?' FOR UPDATE OF t':''),[org,actorId,RECURRENCE_PACKET_KIND,previewId,commandSha256]),3);need(list.length<=2,'recurrence_intent',409);return list.map(x=>previewRow(x,org,actorId));
}
export async function readRecurrencePreview(c,{org,actorId,previewId}){const list=rows(await c.query(RECURRENCE_STORE_SQL.time,[id(org),id(actorId),RECURRENCE_PACKET_KIND,id(previewId)]),1);need(list.length===1,'recurrence_preview',409);return previewRow(list[0],org,actorId);}
/** All proposed IDs, including preview/report, are reserved across ordinary
 * records/trash, all report families and retained recurrence identities. */
export async function requireRecurrenceIdsAvailable(c,{org,sourceId,previewId,reportId,recordIds,ownPreviewId=null}){
  id(org);id(sourceId);const chosen=[id(previewId),id(reportId),...recordIds.map(id)];need(new Set(chosen).size===chosen.length&&recordIds.length>=1&&recordIds.length<=8,'recurrence_identity',409);
  need(rows(await c.query('SELECT id FROM os_records WHERE org_id=$1 AND id=ANY($2::text[]) LIMIT 1',[org,chosen]),1).length===0,'recurrence_identity',409);
  need(rows(await c.query('SELECT id FROM os_reports WHERE org_id=$1 AND id=ANY($2::text[]) LIMIT 1',[org,chosen]),1).length===0,'recurrence_identity',409);
  need(rows(await c.query('SELECT id FROM os_previews WHERE org_id=$1 AND id=ANY($2::text[]) AND ($3::text IS NULL OR id<>$3) LIMIT 1',[org,chosen,ownPreviewId]),1).length===0,'recurrence_identity',409);
  const family=await recurrenceFamilyRows(c,org);
  for(const r of family){const m=r.payload;need(m.source.id!==sourceId,'recurrence_existing_batch',409);const reserved=[m.reportId,m.source.id,...m.dependencies.references.map(x=>x.id),...m.candidates.map(x=>x.id)];need(!reserved.some(x=>chosen.includes(x)),'recurrence_identity',409);}
  // Other stored pending reviews reserve their generated IDs, never provide
  // original accepted-command authority or a hidden count to the caller.
  const pending=rows(await c.query(previewSelect.replace('t.actor_id=$2','($2::text IS NULL OR t.actor_id=$2)')+' AND t.committed_at IS NULL AND ($4::text IS NULL OR t.id<>$4) ORDER BY t.id COLLATE "C" LIMIT 5',[org,null,RECURRENCE_PACKET_KIND,ownPreviewId]),5);need(pending.length<=4,'recurrence_preview_quota');
  for(const raw of pending){const actor=prop(raw,'actor_id'),p=previewRow(raw,org,actor).payload;need(![prop(raw,'id'),p.reportId,...p.review.compiled.candidates.map(x=>x.id)].some(x=>chosen.includes(x)),'recurrence_identity',409);}
}
