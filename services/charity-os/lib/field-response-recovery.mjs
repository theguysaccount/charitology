/** FIELD-only immutable historical report recovery. No auth, clock, IDs or tx. */
import { isProxy, isDate } from 'node:util/types';
import { learningFreeze } from './learning-transport.mjs';
import { FieldResponseError } from './field-response-model.mjs';
import { validateFieldResponseReportRow, planRestoredFieldResponseReportRow,
  requireFieldResponseReportIdAvailable, appendFieldResponseReport } from './field-response-store.mjs';

const FORMAT = 'charitology-field-response-import';
const fail = (status=422,code='field_report_recovery') => { throw new FieldResponseError(code,'The aggregate import history cannot be restored into this destination.','',status); };
const plain = v => !!v && typeof v==='object' && !isProxy(v) && !Array.isArray(v) && [Object.prototype,null].includes(Object.getPrototypeOf(v));
function value(v,key) {
  if (!plain(v)) return undefined;
  const d=Object.getOwnPropertyDescriptor(v,key);
  if (!d) return undefined;
  if (!d.enumerable || !Object.hasOwn(d,'value')) fail();
  return d.value;
}
/** Reserved format dispatch includes unsupported versions so they refuse. */
export const isFieldResponseRecoveryFamily = payload => value(payload,'format')===FORMAT;
function entries(rows) {
  if (rows===undefined) return [];
  if (!Array.isArray(rows) || isProxy(rows) || Object.getPrototypeOf(rows)!==Array.prototype) fail();
  const len=Object.getOwnPropertyDescriptor(rows,'length').value;
  // No new report count cap: the existing complete native request/packet cap
  // bounds the family. Admit only actual dense array values, never hooks.
  if (!Number.isSafeInteger(len) || Reflect.ownKeys(rows).length!==len+1) fail();
  return Array.from({length:len},(_,i)=>{
    const d=Object.getOwnPropertyDescriptor(rows,String(i));
    if (!d?.enumerable || !Object.hasOwn(d,'value')) fail();
    return d.value;
  });
}
function scan(rows,{orgId,native=false}={}) {
  const all=entries(rows), reports=[], ids=new Map();
  for (const item of all) {
    const id=value(item,'id');
    if (typeof id==='string') ids.set(id,(ids.get(id)||0)+1);
    const payload=value(item,'payload');
    if (!isFieldResponseRecoveryFamily(payload)) continue;
    let candidate=item;
    if (native) {
      const at=value(item,'created_at');
      if (isDate(at)) {
        let stamp;try { stamp=Date.prototype.toISOString.call(at); } catch { fail(); }
        // Descriptor ownership/closed keys are still enforced by the store.
        candidate=Object.fromEntries(Reflect.ownKeys(item).map(key=>{
          const d=Object.getOwnPropertyDescriptor(item,key);
          if (typeof key!=='string' || !d?.enumerable || !Object.hasOwn(d,'value')) fail();
          return [key,key==='created_at'?stamp:d.value];
        }));
      }
    }
    reports.push(validateFieldResponseReportRow(candidate,orgId===undefined?undefined:{orgId}));
  }
  for (const report of reports) if (ids.get(report.id)!==1) fail(422,'field_report_duplicate');
  return learningFreeze({present:reports.length>0,reports});
}
export function inspectFieldResponseRecovery(backup) {
  return scan(value(backup,'reports'));
}
/** Existing DB export uses Date metadata; native JSON transports it as ms. */
export function fieldResponseNativeReports(rows,orgId) {
  const result=scan(rows,{orgId,native:true}), by=new Map(result.reports.map(r=>[r.id,r]));
  return entries(rows).map(r=>isFieldResponseRecoveryFamily(value(r,'payload'))?by.get(value(r,'id')):r);
}
export function planRestoredFieldResponseReports(backup,context) {
  const original=inspectFieldResponseRecovery(backup);
  return learningFreeze({present:original.present,reports:original.reports.map(row=>planRestoredFieldResponseReportRow(row,context))});
}
export function fieldResponseRestoreSummary(recovery) {
  return recovery.present ? {fieldResponseReportsRecovered:recovery.reports.length} : {};
}
/** Caller must hold the ordinary restore transaction and organization lock. */
export async function restoreFieldResponseReports(c,backup,context) {
  const plan=planRestoredFieldResponseReports(backup,context);
  if (!plan.present) return learningFreeze({present:false,count:0});
  const org=plan.reports[0].org_id;
  const rows=(await c.query("SELECT id FROM os_reports WHERE org_id=$1 AND payload->>'format'='charitology-field-response-import' LIMIT 1",[org])).rows;
  if (!Array.isArray(rows) || rows.length) fail(409,'restore_conflict');
  // Check every proposed ID before inserting. The ordinary append checks again;
  // any failure still requires the caller's existing outer transaction rollback.
  for (const row of plan.reports) await requireFieldResponseReportIdAvailable(c,org,row.id);
  for (const row of plan.reports) await appendFieldResponseReport(c,row);
  return learningFreeze({present:true,count:plan.reports.length});
}
