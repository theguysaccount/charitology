/** Closed passive native family. Private command/offer/consent rows never cross
 * this boundary. Caller owns authorization, capacity and the tenant lock. */
import { isProxy } from "node:util/types";
import { requireAdmin } from "./access.mjs";
import { hash, fail } from "./security.mjs";
import { restoredIntake } from "./intake-backup.mjs";
import { restoredParticipation } from "./participation-backup.mjs";
import { validateGroupExactStamp } from "./participation-group-model.mjs";
import {
  SUBSTITUTION_RECEIPT_FORMAT, validateLiveVolunteerSubstitutionReceipt, validateVolunteerSubstitutionHistory,
  planVolunteerSubstitutionRecovery, projectRecoveredVolunteerSubstitutionHistory,
} from "./volunteer-substitution-receipt.mjs";
import { VOLUNTEER_SUBSTITUTION_STORAGE_LIMITS } from "./volunteer-substitution-store.mjs";

export const SUBSTITUTION_RECOVERED_REPORT_FORMAT = "charitology-volunteer-substitution-recovered";
const NATIVE_FORMAT = "charitology-volunteer-substitutions";
const FORMAT_PREFIX = "charitology-volunteer-substitution-";
const LIVE_TITLE = "Volunteer shift substitution", RECOVERED_TITLE = "Recovered volunteer shift substitution";
const AUDIT = "participation.substituted";
const MAX = VOLUNTEER_SUBSTITUTION_STORAGE_LIMITS.receipts;
const FAMILY_BYTES = VOLUNTEER_SUBSTITUTION_STORAGE_LIMITS.receiptFamilyBytes;
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const ROW = ["org_id","id","created_by","title","checksum","payload","created_exact"];
const sql6 = column => `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const reportColumns = `org_id,id,created_by,title,checksum,payload,${sql6("created_at")} AS created_exact`;
const known = ["outgoing","replacement"];
const invalid = () => fail(422,"substitution_native","Use the original typed volunteer substitution history.");
const provenance = () => fail(422,"substitution_native_provenance","Keep the shift, both original assignments and their participation history together before exporting or restoring.");
const conflict = () => fail(409,"restore_conflict","The destination already has volunteer substitution history or a colliding report.");
const quota = () => fail(422,"substitution_native_capacity","Volunteer substitution history exceeds its bounded storage or backup size.");
const need = (condition, reject = invalid) => { if (!condition) reject(); };
const opaque = value => typeof value === "string" && value.length <= 100 && ID.test(value);
const plain = value => value && typeof value === "object" && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
function optional(value,key) {
  if (!plain(value)) return undefined;
  const d = Object.getOwnPropertyDescriptor(value,key);
  if (!d) return undefined;
  need(d.enumerable && Object.hasOwn(d,"value"));
  return d.value;
}
function shape(value,keys) {
  need(plain(value) && Reflect.ownKeys(value).length === keys.length && keys.every(key=>Object.hasOwn(value,key)));
  return Object.fromEntries(keys.map(key=>[key,optional(value,key)]));
}
function list(value,max) {
  need(Array.isArray(value) && !isProxy(value) && Object.getPrototypeOf(value) === Array.prototype &&
    value.length <= max && Reflect.ownKeys(value).length === value.length+1);
  return Array.from({length:value.length},(_,i)=>{
    const d=Object.getOwnPropertyDescriptor(value,String(i));
    need(d?.enumerable && Object.hasOwn(d,"value"));
    return d.value;
  });
}
function at(value) {
  try { return validateGroupExactStamp(value); }
  catch { invalid(); }
}
function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function countRows(result,max) {
  need(Array.isArray(result?.rows) && result.rowCount === result.rows.length && result.rows.length <= max);
  return result.rows;
}

export function isVolunteerSubstitutionNativeReport(row) {
  const format=optional(optional(row,"payload"),"format"), id=optional(row,"id");
  return typeof format === "string" && format.startsWith(FORMAT_PREFIX) ||
    typeof id === "string" && id.startsWith("swap_");
}
const isSubstitutionAudit = row => optional(row,"action") === AUDIT;
function originOf(raw) {
  const graph=shape(raw,["originOrgId","shift","outgoing","replacement"]);
  need(opaque(graph.originOrgId));
  graph.shift=shape(graph.shift,["id","moduleId","kind"]);
  need(opaque(graph.shift.id) && graph.shift.moduleId === "volunteers" && graph.shift.kind === "shift");
  for (const party of known) {
    const row=shape(graph[party],["participationId","assignmentId","shiftId","moduleId","kind"]);
    need(opaque(row.participationId) && opaque(row.assignmentId) && row.shiftId === graph.shift.id &&
      row.moduleId === "volunteers" && row.kind === "assignment");
    graph[party]=row;
  }
  return freeze(graph);
}
function byId(values,key="id") {
  return new Map(values.map(value=>[value[key],value]));
}
function nativeGraph(backup,sourceOrgId) {
  const records=list(backup.records,2000);
  const byRecord=byId(records);
  need(byRecord.size===records.length,provenance);
  const restored=restoredParticipation(backup), intake=restoredIntake(backup);
  const participants=byId(restored.participations), targets=byId(restored.targets,"targetId");
  const original=byId(list(backup.participation?.participations,2000));
  const submissions=byId(intake.submissions), publications=byId(intake.publications);
  const required=(id,module,kind)=>{
    const row=byRecord.get(id);
    need(row?.orgId === sourceOrgId && row.moduleId === module && (!kind || row.data?.kind===kind),provenance);
    return row;
  };
  return (history, mode)=>{
    const h=validateVolunteerSubstitutionHistory(history);
    const shift=required(h.shift.id,"volunteers","shift");
    const normalized=targets.get(shift.id);
    need(normalized?.moduleId==="volunteers",provenance);
    const closed={originOrgId:h.originOrgId,shift:{id:shift.id,moduleId:shift.moduleId,kind:shift.data.kind}};
    const people=[];
    for (const party of known) {
      const leg=h[party], p=participants.get(leg.participationId), originalRow=original.get(leg.participationId);
      const booking=required(leg.assignmentId,"volunteers","assignment");
      need(p?.targetId===shift.id && p.moduleId==="volunteers" && p.bookingRecordId===booking.id &&
        p.requestedInterval==null && booking.data.shiftId===shift.id && booking.data.contactId===p.contactId &&
        (party==="outgoing"?p.recoveredState==="cancelled":["confirmed","cancelled"].includes(p.recoveredState)),provenance);
      const contact=required(p.contactId,"contacts");
      const submission=submissions.get(p.intakeId), publication=publications.get(submission?.publicationId);
      need(publication?.kind==="volunteer-interest" && publication.targetModule==="volunteers" &&
        publication.targetId===shift.id && submission.convertedIds.some(item=>item.id===booking.id && item.moduleId==="volunteers") &&
        submission.convertedIds.some(item=>item.id===contact.id && item.moduleId==="contacts"),provenance);
      required(publication.recordId,"forms","form");
      const exactRange=value=>new Date(value).toISOString().slice(0,-1)+"000Z";
      need(p.frozen?.sourceRevision===h.shift.revision && p.frozen.terms?.kind==="shift" &&
        exactRange(p.frozen.terms.startAt)===h.shift.startsAtExact && exactRange(p.frozen.terms.endAt)===h.shift.endsAtExact,provenance);
      if (mode==="recorded") {
        const acceptedMillis=h.acceptedAtExact.slice(0,23)+"Z";
        need(originalRow?.source==="intake" && originalRow.recovered===false && originalRow.revision>=leg.afterRevision &&
          booking.revision>=leg.assignmentAfterRevision &&
          (party==="outgoing"?originalRow.cancelledAt:originalRow.confirmedAt)===acceptedMillis,provenance);
      } else if (party==="outgoing") {
        // The outgoing cancelled row is never reactivated by ordinary
        // recovered occupancy adoption. It anchors this prior restore.
        need(originalRow?.source==="recovered" && originalRow.recovered===true &&
          originalRow.recoveredState==="cancelled",provenance);
      }
      closed[party]={participationId:p.id,assignmentId:booking.id,shiftId:shift.id,moduleId:booking.moduleId,kind:booking.data.kind};
      people.push({contactId:contact.id,intakeId:p.intakeId});
    }
    need(people[0].contactId!==people[1].contactId && people[0].intakeId!==people[1].intakeId,provenance);
    return originOf(closed);
  };
}

/** Used for exact SQL export and future CRM report classification. */
export function inspectStoredVolunteerSubstitutionReport(raw,orgId) {
  const row=shape(raw,ROW);
  need(opaque(orgId) && row.org_id===orgId && opaque(row.created_by));
  const created=at(row.created_exact);
  if (optional(row.payload,"format")===SUBSTITUTION_RECEIPT_FORMAT) {
    const receipt=validateLiveVolunteerSubstitutionReceipt(row.payload);
    need(receipt.scope.orgId===orgId && receipt.id===row.id && receipt.sha256===row.checksum &&
      row.title===LIVE_TITLE && receipt.history.acceptedAtExact===created);
    return Object.freeze({source:"recorded",history:receipt.history,origin:null,actorId:row.created_by});
  }
  const recovered=shape(row.payload,["format","version","originMode","history","origin"]);
  need(recovered.format===SUBSTITUTION_RECOVERED_REPORT_FORMAT && recovered.version===1 &&
    recovered.originMode==="recovered" && row.title===RECOVERED_TITLE && row.checksum===hash(recovered));
  const history=projectRecoveredVolunteerSubstitutionHistory({orgId,id:row.id,originMode:"recovered",
    storedAtExact:created,history:recovered.history},orgId);
  const origin=originOf(recovered.origin);
  // Recheck original scope and deterministic non-command destination identity.
  need(planVolunteerSubstitutionRecovery(history,{orgId,storedAtExact:created},origin).id===row.id);
  return Object.freeze({source:"recovered",history,origin,actorId:row.created_by});
}
const pairKey=(shiftId,outgoingId,replacementId)=>JSON.stringify([shiftId,outgoingId,replacementId]);
function auditKey(row,orgId) {
  const detail=shape(optional(row,"detail"),["outgoingId","replacementId"]);
  need(row.org_id===orgId && row.module_id==="volunteers" && opaque(row.record_id) &&
    opaque(row.actor_id) && opaque(detail.outgoingId) && opaque(detail.replacementId) &&
    detail.outgoingId!==detail.replacementId);
  return pairKey(row.record_id,detail.outgoingId,detail.replacementId);
}
function nativePacket(orgId, entries) {
  need(entries.length>0 && entries.length<=MAX,quota);
  const key=entry=>JSON.stringify([entry.history.originOrgId,entry.history.decisionId]);
  const sorted=[...entries].sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0);
  const value={format:NATIVE_FORMAT,version:1,sourceOrgId:orgId,entries:sorted};
  need(Buffer.byteLength(JSON.stringify(value))<=FAMILY_BYTES,quota);
  return freeze(value);
}

/** Pass original report and event arrays before generic family projections.
 * Absence preserves both original array objects and emits no extra field. */
export async function exportVolunteerSubstitutionNative(c,{orgId,reports,events,records,participation,intake}) {
  need(opaque(orgId));
  const reserved=reports.filter(isVolunteerSubstitutionNativeReport), audits=events.filter(isSubstitutionAudit);
  if (!reserved.length && !audits.length) return {reports,events,volunteerSubstitutions:undefined};
  need(reserved.length>0 && reserved.length<=MAX && audits.length<=MAX,quota);
  const ids=reserved.map(row=>optional(row,"id"));
  need(ids.every(opaque) && new Set(ids).size===ids.length);
  const exactRows=countRows(await c.query(`SELECT ${reportColumns} FROM os_reports
    WHERE org_id=$1 AND id=ANY($2::text[]) ORDER BY id COLLATE "C" LIMIT ${MAX+1}`,[orgId,ids]),MAX);
  need(exactRows.length===ids.length && exactRows.every(row=>ids.includes(row.id)));
  const sourceGraph=nativeGraph({records,participation,intake},orgId), byAudit=new Map();
  for (const event of audits) {
    const key=auditKey(event,orgId);
    need(!byAudit.has(key));
    byAudit.set(key,event);
  }
  const entries=[],seen=new Set();
  for (const row of exactRows) {
    const {source,history,origin:retained,actorId}=inspectStoredVolunteerSubstitutionReport(row,orgId);
    const origin=sourceGraph(history,source);
    const identity=JSON.stringify([history.originOrgId,history.decisionId]);
    need(!seen.has(identity));seen.add(identity);
    if (source==="recorded") {
      const key=pairKey(history.shift.id,history.outgoing.participationId,history.replacement.participationId);
      need(byAudit.get(key)?.actor_id===actorId,provenance);byAudit.delete(key);
    } else need(hash(origin)===hash(retained),provenance);
    entries.push({source,history,origin});
  }
  need(byAudit.size===0,provenance);
  return {reports:reports.filter(row=>!isVolunteerSubstitutionNativeReport(row)),
    events:events.filter(row=>!isSubstitutionAudit(row)),volunteerSubstitutions:nativePacket(orgId,entries)};
}

export function restoredVolunteerSubstitutionNative(backup) {
  const reports=optional(backup,"reports"), events=optional(backup,"events");
  if (Array.isArray(reports)) need(!reports.some(isVolunteerSubstitutionNativeReport));
  if (Array.isArray(events)) need(!events.some(isSubstitutionAudit));
  const raw=optional(backup,"volunteerSubstitutions");
  if (raw===undefined) return {present:false,entries:[]};
  const family=shape(raw,["format","version","sourceOrgId","entries"]);
  need(family.format===NATIVE_FORMAT && family.version===1 && opaque(family.sourceOrgId));
  const sourceGraph=nativeGraph(backup,family.sourceOrgId), seen=new Set();
  const entries=list(family.entries,MAX).map(rawEntry=>{
    const entry=shape(rawEntry,["source","history","origin"]);
    need(["recorded","recovered"].includes(entry.source));
    const history=validateVolunteerSubstitutionHistory(entry.history);
    if (entry.source==="recorded") need(history.originOrgId===family.sourceOrgId,provenance);
    const identity=JSON.stringify([history.originOrgId,history.decisionId]);
    need(!seen.has(identity));seen.add(identity);
    const origin=originOf(entry.origin);
    need(hash(origin)===hash(sourceGraph(history,entry.source)),provenance);
    return {source:entry.source,history,origin};
  });
  return {present:true,entries:nativePacket(family.sourceOrgId,entries).entries};
}
export function planRestoredVolunteerSubstitutionReports(backup,rawDestination) {
  const source=restoredVolunteerSubstitutionNative(backup);
  if (!source.present) return {present:false,reports:[]};
  const d=shape(rawDestination,["orgId","actorId","createdAtExact"]);
  need(opaque(d.orgId) && opaque(d.actorId));at(d.createdAtExact);
  const namespace=nativePacket(d.orgId,source.entries.map(({history,origin})=>({source:"recovered",history,origin})));
  return freeze({present:true,namespace,reports:namespace.entries.map(({history,origin})=>{
    const recovered=planVolunteerSubstitutionRecovery(history,{orgId:d.orgId,storedAtExact:d.createdAtExact},origin);
    const payload={format:SUBSTITUTION_RECOVERED_REPORT_FORMAT,version:1,originMode:"recovered",history:recovered.history,origin};
    return {org_id:d.orgId,id:recovered.id,created_by:d.actorId,title:RECOVERED_TITLE,checksum:hash(payload),
      payload,created_at:d.createdAtExact};
  })});
}
async function destinationEmpty(c,orgId,ids) {
  const [row]=countRows(await c.query(`SELECT EXISTS(SELECT 1 FROM os_reports r WHERE r.org_id=$1 AND (
    starts_with(r.payload->>'format',$2) OR starts_with(r.id,'swap_') OR r.id=ANY($3::text[]))) AS occupied`,
    [orgId,FORMAT_PREFIX,ids]),1);
  need(row?.occupied===false,conflict);
}
export async function assertVolunteerSubstitutionRestoreDestination(c,orgId,backup) {
  need(opaque(orgId));
  const source=restoredVolunteerSubstitutionNative(backup);
  const ids=source.entries.map(({history,origin})=>
    planVolunteerSubstitutionRecovery(history,{orgId,storedAtExact:history.acceptedAtExact},origin).id);
  await destinationEmpty(c,orgId,ids);
  return source;
}

async function assertRestoredGraph(c,orgId,history) {
  const [row]=countRows(await c.query(`SELECT count(*)::int AS count
    FROM os_participations p JOIN os_participation_targets t ON t.org_id=p.org_id AND t.target_id=p.target_id
    JOIN os_records s ON s.org_id=t.org_id AND s.id=t.target_id
    JOIN os_records b ON b.org_id=p.org_id AND b.id=p.booking_record_id
    JOIN os_records k ON k.org_id=p.org_id AND k.id=p.contact_id AND k.module_id='contacts' AND k.deleted_at IS NULL
    JOIN os_intake i ON i.org_id=p.org_id AND i.id=p.intake_id
    JOIN os_publications f ON f.org_id=i.org_id AND f.id=i.publication_id AND f.kind='volunteer-interest'
    JOIN os_records form ON form.org_id=f.org_id AND form.id=f.record_id AND form.module_id='forms'
      AND form.data->>'kind'='form' AND form.deleted_at IS NULL
    WHERE p.org_id=$1 AND p.target_id=$2 AND p.module_id='volunteers' AND p.source='recovered' AND p.recovered
    AND p.consent IS NULL AND p.delivery_consent IS NULL AND p.reminder_consent IS NULL AND p.last_command IS NULL
    AND p.requested_interval IS NULL AND t.module_id='volunteers' AND t.mode='paused' AND t.recovery_block AND t.last_command IS NULL
    AND f.target_module='volunteers' AND f.target_id=s.id
    AND i.converted_ids @> jsonb_build_array(jsonb_build_object('id',b.id,'moduleId','volunteers'),
      jsonb_build_object('id',k.id,'moduleId','contacts'))
    AND s.module_id='volunteers' AND s.data->>'kind'='shift' AND s.deleted_at IS NULL
    AND b.module_id='volunteers' AND b.data->>'kind'='assignment' AND b.data->>'shiftId'=s.id
    AND b.data->>'contactId'=p.contact_id AND b.deleted_at IS NULL
    AND ((p.id=$3 AND b.id=$4 AND p.state='cancelled' AND p.recovered_state='cancelled')
      OR (p.id=$5 AND b.id=$6 AND ((p.state='requested' AND p.recovered_state='confirmed')
      OR (p.state='cancelled' AND p.recovered_state='cancelled'))))`,
    [orgId,history.shift.id,history.outgoing.participationId,history.outgoing.assignmentId,
      history.replacement.participationId,history.replacement.assignmentId]),1);
  need(row?.count===2,provenance);
}

/** Run after the normal typed records, intake and participation restore.
 * It inserts only inactive report rows and no local audit or command. */
export async function restoreVolunteerSubstitutionReports(c,backup,{orgId,member,createdAtExact}) {
  need(opaque(orgId) && opaque(member?.userId));
  requireAdmin(member);
  const plan=planRestoredVolunteerSubstitutionReports(backup,{orgId,actorId:member.userId,createdAtExact});
  await destinationEmpty(c,orgId,plan.reports.map(row=>row.id));
  if (!plan.present) return {present:false,count:0};
  for (const row of plan.reports) {
    await assertRestoredGraph(c,orgId,row.payload.history);
    const [written]=countRows(await c.query(`INSERT INTO os_reports(org_id,id,created_by,title,checksum,payload,created_at)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::timestamptz) RETURNING ${reportColumns}`,
      [row.org_id,row.id,row.created_by,row.title,row.checksum,JSON.stringify(row.payload),row.created_at]),1);
    need(written && inspectStoredVolunteerSubstitutionReport(written,orgId).source==="recovered");
  }
  const [usage]=countRows(await c.query(`SELECT count(*)::int AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes
    FROM os_reports t WHERE org_id=$1 AND starts_with(payload->>'format',$2)`,[orgId,FORMAT_PREFIX]),1);
  need(usage?.count===plan.reports.length && Number(usage.bytes)<=FAMILY_BYTES,quota);
  return {present:true,count:usage.count};
}
