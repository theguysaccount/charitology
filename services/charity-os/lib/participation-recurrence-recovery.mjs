/** Passive immutable reports only. No command receipt, current authority or
 * calendar resolution is imported. The caller owns real restore permission,
 * the organization lock, complete admission and the outer transaction. */
import { isProxy, isDate } from 'node:util/types';
import { requireAdmin } from './access.mjs';
import { RECURRENCE_MANIFEST_FORMAT, validateRecurringOccurrenceReportRow } from './participation-recurrence-packets.mjs';
import { need, freeze, id, stamp, fields, dense, prop, number } from './participation-recurrence-values.mjs';

export const PARTICIPATION_RECURRENCE_REPORT_LIMITS = Object.freeze({ reports:32, payloadBytes:131072, familyBytes:4194304, scanEntries:200000 });
const L=PARTICIPATION_RECURRENCE_REPORT_LIMITS;
const plain=v=>v&&typeof v==='object'&&!isProxy(v)&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
function optional(v,k){if(!plain(v))return undefined;const d=Object.getOwnPropertyDescriptor(v,k);if(!d)return undefined;need(d.enumerable&&Object.hasOwn(d,'value'),'recurrence_recovery_fields');return d.value;}
/** Reserved dispatch includes unsupported method/version; validation refuses it. */
export const isParticipationRecurrenceRecoveryFamily=payload=>{const format=optional(payload,'format');return typeof format==='string'&&format.startsWith(RECURRENCE_MANIFEST_FORMAT);};
const entries=v=>v===undefined?[]:dense(v,L.scanEntries);
function nativeRow(input){
  const at=optional(input,'created_at');
  if(!isDate(at))return input;
  let createdAt;try{createdAt=Date.prototype.toISOString.call(at);}catch{need(false,'recurrence_recovery_time');}
  return Object.fromEntries(Reflect.ownKeys(input).map(k=>{need(typeof k==='string');return[k,k==='created_at'?createdAt:prop(input,k)];}));
}
function scan(input,{native=false,orgId}={}){
  const all=entries(input), reports=[], identities=new Set();
  for(const item of all){
    const reportId=optional(item,'id');
    // Every report family shares the same native identity namespace. Unknown
    // families reserve only this actual row ID, never IDs inferred from prose.
    id(reportId);need(!identities.has(reportId),'recurrence_report_duplicate');identities.add(reportId);
    if(!isParticipationRecurrenceRecoveryFamily(optional(item,'payload')))continue;
    need(reports.length<L.reports,'recurrence_report_limit');
    const row=validateRecurringOccurrenceReportRow(native?nativeRow(item):item);
    need(orgId===undefined||row.org_id===orgId,'recurrence_report_org');
    need(Buffer.byteLength(JSON.stringify(row.payload))<=L.payloadBytes,'recurrence_report_payload_limit');
    need(!row.payload.dependencies.references.some(r=>r.id===row.id),'recurrence_report_identity');
    reports.push(row);
  }
  return freeze({present:reports.length>0,reports});
}
/** Shared by backup admission, export, actual restore and capacity projection. */
export const restoredParticipationRecurrenceReports=backup=>scan(optional(backup,'reports'));
export function exportParticipationRecurrenceReports(input,orgId){
  id(orgId);const result=scan(input,{native:true,orgId}),byId=new Map(result.reports.map(row=>[row.id,row]));
  return entries(input).map(row=>isParticipationRecurrenceRecoveryFamily(optional(row,'payload'))?byId.get(optional(row,'id')):row);
}
export function planRestoredParticipationRecurrenceReports(backup,destination){
  const source=restoredParticipationRecurrenceReports(backup);
  if(!source.present)return freeze({present:false,reports:[]});
  const d=fields(destination,['orgId','actorId','createdAtExact']);id(d.orgId);id(d.actorId);stamp(d.createdAtExact);
  return freeze({present:true,reports:source.reports.map(row=>validateRecurringOccurrenceReportRow({...row,org_id:d.orgId,created_by:d.actorId,created_at:d.createdAtExact}))});
}
export function participationRecurrenceRestoreSummary(recovery){
  const r=fields(recovery,['present','reports']);const all=dense(r.reports,L.reports);need(typeof r.present==='boolean'&&r.present===(all.length>0));
  all.forEach(validateRecurringOccurrenceReportRow);
  return r.present?{participationRecurrenceReportsRecovered:all.length}:{};
}
export const participationRecurrenceRestoreWarning=recovery=>recovery.present?'Recovered recurring draft manifests are inactive history. No accepted command, approval, consent or future generation was restored.':null;

/** Always called, including legacy sources without this family. Retained
 * recurrence history blocks restore. Only validated recurrence rows are inserted;
 * generic legacy reports remain in the source archive and reserve no new row ID. */
export async function assertParticipationRecurrenceRestoreDestination(c,orgId,backup){
  id(orgId);const source=restoredParticipationRecurrenceReports(backup),incoming=source.reports.map(row=>row.id);
  const result=(await c.query("SELECT EXISTS(SELECT 1 FROM os_reports WHERE org_id=$1 AND payload->>'format' LIKE $2) AS occupied,EXISTS(SELECT 1 FROM os_reports WHERE org_id=$1 AND id=ANY($3::text[])) AS collision",[orgId,RECURRENCE_MANIFEST_FORMAT+'%',incoming])).rows;
  need(Array.isArray(result)&&result.length===1,'recurrence_recovery_driver',500);
  const flags=fields(result[0],['occupied','collision']);need(typeof flags.occupied==='boolean'&&typeof flags.collision==='boolean','recurrence_recovery_driver',500);
  need(!flags.occupied,'restore_conflict',409);need(!flags.collision,'restore_conflict',409);
  return source;
}
/** Context.member is the actual member already authorized by ordinary restore;
 * this helper never asks a recurrence writer guard to impersonate that role. */
export async function restoreParticipationRecurrenceReports(c,backup,context){
  const x=fields(context,['orgId','member','createdAtExact']);id(x.orgId);const actorId=id(prop(x.member,'userId'));
  requireAdmin(x.member);
  const source=await assertParticipationRecurrenceRestoreDestination(c,x.orgId,backup);
  if(!source.present)return freeze({present:false,count:0});
  stamp(x.createdAtExact);const plan=planRestoredParticipationRecurrenceReports(backup,{orgId:x.orgId,actorId,createdAtExact:x.createdAtExact});
  for(const row of plan.reports){
    const result=await c.query('INSERT INTO os_reports(org_id,id,created_by,title,checksum,payload,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[row.org_id,row.id,row.created_by,row.title,row.checksum,JSON.stringify(row.payload),row.created_at]);
    need(number(result.rowCount)===1,'recurrence_report_storage',500);
  }
  // Actual SQL family charge is independent from count and normalized payload.
  const measured=(await c.query("SELECT count(*) AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0) AS bytes FROM os_reports t WHERE org_id=$1 AND payload->>'format' LIKE $2",[x.orgId,RECURRENCE_MANIFEST_FORMAT+'%'])).rows[0];
  need(number(measured.count)===plan.reports.length&&number(measured.bytes)<=L.familyBytes,'recurrence_report_capacity');
  return freeze({present:true,count:plan.reports.length});
}
