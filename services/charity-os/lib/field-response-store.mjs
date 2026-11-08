/** Immutable FIELD data only. Caller owns fresh auth, tenant GUCs, locks and capacity. */
import { isProxy } from 'node:util/types';
import { requirePermission, inScope, administrators } from './access.mjs';
import { getModule } from './modules.mjs';
import { learningCanonical, learningFreeze } from './learning-transport.mjs';
import { validateGroupExactStamp } from './participation-group-model.mjs';
import { FIELD_METHOD, FIELD_LIMITS, FieldResponseError, validateFieldImportManifest } from './field-response-model.mjs';

const FORMAT = 'charitology-field-response-import';
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const ROW_KEYS = ['org_id','id','created_by','title','checksum','payload','created_at'];
const PROGRAM_KEYS = ['org_id','id','module_id','kind','undeleted'];
export const FIELD_REPORT_READ_LIMIT = 20;
export const FIELD_REPORT_ROW_JSON_LIMIT = FIELD_LIMITS.manifestBytes + 4096;
const freeze = learningFreeze;
const fail = (code='field_report_row', status=422) => { throw new FieldResponseError(code,'This retained aggregate import is invalid or unavailable.','',status); };
const need = (ok, code, status) => { if (!ok) fail(code,status); };
const unavailable = () => fail('field_report_unavailable',404);
const id = v => { need(typeof v==='string' && ID.test(v),'field_id'); return v; };

function plain(v) {
  return !!v && typeof v==='object' && !isProxy(v) && !Array.isArray(v) &&
    [Object.prototype,null].includes(Object.getPrototypeOf(v));
}
function fields(v, keys) {
  need(plain(v));
  const names=Reflect.ownKeys(v);
  need(names.length===keys.length && names.every(k=>typeof k==='string' && keys.includes(k)));
  const out={};
  for (const key of keys) {
    const d=Object.getOwnPropertyDescriptor(v,key);
    need(d?.enumerable && Object.hasOwn(d,'value'));
    out[key]=d.value;
  }
  return out;
}
function ids(value, max) {
  need(value && typeof value==='object' && !isProxy(value) && Array.isArray(value) && Object.getPrototypeOf(value)===Array.prototype);
  const d=Object.getOwnPropertyDescriptor(value,'length');
  need(d && Object.hasOwn(d,'value') && Number.isSafeInteger(d.value) && d.value<=max);
  const keys=Reflect.ownKeys(value), canonical=new Set(Array.from({length:d.value},(_,i)=>String(i)));
  need(keys.length===d.value+1 && keys.every(k=>k==='length'||canonical.has(k)));
  return Array.from({length:d.value},(_,i)=>{const x=Object.getOwnPropertyDescriptor(value,String(i));need(x?.enumerable && Object.hasOwn(x,'value'));return id(x.value);});
}
function timestamp(value, allowMilliseconds=false) {
  need(typeof value==='string');
  let full=value;
  if (allowMilliseconds && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) full=value.slice(0,-1)+'000Z';
  try { validateGroupExactStamp(full); } catch { fail(); }
  return value;
}
function boundedRow(row) {
  try { learningCanonical(row,{maxBytes:FIELD_REPORT_ROW_JSON_LIMIT}); } catch { fail('field_report_size'); }
  return freeze(row);
}

/** Descriptor-only dispatch. Unknown versions/methods are not this known family. */
export function isFieldResponseReportFamily(value) {
  if (!plain(value)) return false;
  return [['format',FORMAT],['version',1],['method',FIELD_METHOD]].every(([key,expected])=>{
    const d=Object.getOwnPropertyDescriptor(value,key);
    return !!d?.enumerable && Object.hasOwn(d,'value') && d.value===expected;
  });
}
export function fieldResponseReportTitle(input) {
  const manifest=validateFieldImportManifest(input);
  return 'Aggregate visits import: '+manifest.file.sha256.slice(0,12);
}
export function validateFieldResponseReportRow(input, options) {
  const orgId=options===undefined ? undefined : fields(options,['orgId']).orgId;
  const r=fields(input,ROW_KEYS);
  id(r.org_id); id(r.id); id(r.created_by);
  if (orgId!==undefined) need(r.org_id===id(orgId));
  need(isFieldResponseReportFamily(r.payload));
  const payload=validateFieldImportManifest(r.payload);
  need(r.checksum===payload.sha256 && r.title===fieldResponseReportTitle(payload));
  // Native backup JSON encodes existing pg Date metadata with milliseconds;
  // source-query projections and new inserts retain exact six-digit SQL time.
  timestamp(r.created_at,true);
  return boundedRow({...r,payload});
}
export function makeFieldResponseReportRow(input) {
  const v=fields(input,['orgId','id','actorId','createdAtExact','payload']);
  id(v.orgId); id(v.id); id(v.actorId); timestamp(v.createdAtExact);
  const payload=validateFieldImportManifest(v.payload);
  need(payload.originOrgId===v.orgId,'field_report_context',409);
  return validateFieldResponseReportRow({org_id:v.orgId,id:v.id,created_by:v.actorId,
    title:fieldResponseReportTitle(payload),checksum:payload.sha256,payload,created_at:v.createdAtExact});
}
/** Historical payload/identity stay exact; destination metadata is caller-owned. */
export function planRestoredFieldResponseReportRow(sourceRow, destination) {
  const old=validateFieldResponseReportRow(sourceRow);
  const next=fields(destination,['orgId','actorId','createdAtExact']);
  id(next.orgId); id(next.actorId); timestamp(next.createdAtExact);
  return validateFieldResponseReportRow({...old,org_id:next.orgId,created_by:next.actorId,created_at:next.createdAtExact});
}

export async function requireFieldResponseReportIdAvailable(c, org, reportId) {
  id(org); id(reportId);
  const rows=(await c.query('SELECT org_id,id FROM os_reports WHERE org_id=$1 AND id=$2 LIMIT 2',[org,reportId])).rows;
  need(Array.isArray(rows) && rows.length<=1);
  for (const raw of rows) {
    const row=fields(raw,['org_id','id']);
    need(row.org_id===org && row.id===reportId);
    fail('field_report_collision',409);
  }
}
/** No upsert, update/delete, ID mint, clock, audit, quota or auth grant here. */
export async function appendFieldResponseReport(c, input) {
  const row=validateFieldResponseReportRow(input);
  // A new append always has a caller's exact SQL clock, not native ms transport.
  timestamp(row.created_at);
  await requireFieldResponseReportIdAvailable(c,row.org_id,row.id);
  const result=await c.query('INSERT INTO os_reports(org_id,id,created_by,title,checksum,payload,created_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::timestamptz)',
    [row.org_id,row.id,row.created_by,row.title,row.checksum,JSON.stringify(row.payload),row.created_at]);
  need(result.rowCount===1);
  return row;
}

function reader(input) {
  const m=fields(input,['userId','role','programIds','revision']);
  id(m.userId); need(typeof m.role==='string');
  need(Number.isSafeInteger(m.revision) && m.revision>=1);
  m.programIds=ids(m.programIds,100); // Existing memberships allow duplicates.
  requirePermission('outcomes',m,'read');
  need(!getModule('outcomes').scopeRules.approvedSnapshotsOnly.includes(m.role),'field_report_role',403);
  return freeze(m);
}
const SELECT = `SELECT r.org_id,r.id,r.created_by,r.title,r.checksum,r.payload,
to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('org_id',p.org_id,'id',p.id,'module_id',p.module_id,'kind',p.data->>'kind','undeleted',p.deleted_at IS NULL) END AS current_program
FROM os_reports r LEFT JOIN os_records p ON p.org_id=r.org_id AND p.id=r.payload#>>'{mapping,program,recordId}'
WHERE r.org_id=$1 AND r.payload->>'format'='charitology-field-response-import' AND r.payload->'version'='1'::jsonb AND r.payload->>'method'='aggregate-service-visits-v1'
AND ((p.module_id='programs' AND p.data->>'kind'='program' AND p.deleted_at IS NULL AND (cardinality($2::text[])=0 OR p.id=ANY($2::text[])))
OR ($3::boolean AND (p.id IS NULL OR p.module_id<>'programs' OR COALESCE(p.data->>'kind','')<>'program' OR p.deleted_at IS NOT NULL)))`;
function admittedReadRow(raw, org, member) {
  const item=fields(raw,[...ROW_KEYS,'current_program']);
  const {current_program:current,...source}=item;
  const row=validateFieldResponseReportRow(source,{orgId:org});
  const reportProgram=row.payload.mapping.program.recordId;
  let disposition='orphaned';
  if (current!==null) {
    const p=fields(current,PROGRAM_KEYS);
    need(p.org_id===org && p.id===reportProgram);
    need(typeof p.module_id==='string' && (p.kind===null||typeof p.kind==='string') && typeof p.undeleted==='boolean');
    if (p.module_id==='programs' && p.kind==='program' && p.undeleted) {
      if (!inScope({moduleId:'programs',id:p.id},member)) unavailable();
      disposition='current-program';
    }
  }
  if (disposition==='orphaned' && !(administrators(member.role) && member.programIds.length===0)) unavailable();
  return {row,disposition};
}
function metadata({row,disposition}) {
  return freeze({id:row.id,title:row.title,checksum:row.checksum,createdAt:row.created_at,
    programId:row.payload.mapping.program.recordId,disposition,summary:row.payload.summary});
}
/** Caller supplies a fresh current member inside a correctly tenant-scoped tx. */
export async function listFieldResponseReports(c, input) {
  const v=fields(input,['org','member','after','limit']); id(v.org);
  const member=reader(v.member); if (v.after!==null) id(v.after);
  need(Number.isSafeInteger(v.limit) && v.limit>=1 && v.limit<=FIELD_REPORT_READ_LIMIT);
  const orphan=administrators(member.role) && member.programIds.length===0;
  const raw=(await c.query(SELECT+' AND ($4::text IS NULL OR r.id COLLATE "C">$4::text COLLATE "C") ORDER BY r.id COLLATE "C" LIMIT $5',
    [v.org,member.programIds,orphan,v.after,v.limit+1])).rows;
  need(Array.isArray(raw) && raw.length<=v.limit+1);
  const visible=[];
  for (const item of raw) {
    try { visible.push(admittedReadRow(item,v.org,member)); }
    catch(e) { if (e instanceof FieldResponseError && e.code==='field_report_unavailable') continue; throw e; }
  }
  // No total or hidden-row count. Cursor is derived only from an authorized row.
  const nextAfter=visible.length>v.limit ? visible[v.limit-1].row.id : null;
  return freeze({reports:visible.slice(0,v.limit).map(metadata),nextAfter});
}
export async function readFieldResponseReport(c, input) {
  const v=fields(input,['org','id','member']); id(v.org); id(v.id);
  const member=reader(v.member),orphan=administrators(member.role) && member.programIds.length===0;
  const rows=(await c.query(SELECT+' AND r.id=$4 LIMIT 2',[v.org,member.programIds,orphan,v.id])).rows;
  if (!Array.isArray(rows) || rows.length!==1) unavailable();
  let admitted;
  try { admitted=admittedReadRow(rows[0],v.org,member); }
  catch(e) { if (e instanceof FieldResponseError) unavailable(); throw e; }
  return freeze({...metadata(admitted),payload:admitted.row.payload});
}
