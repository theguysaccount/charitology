/** Private SQL wrapper candidate. Caller owns fresh auth, tenant GUC/org lock,
 * outer transaction, original command receipt, required audit and final capacity.
 * Member data and historical reports confer no current authority by themselves. */
import { isProxy } from "node:util/types";
import { learningFreeze } from "./learning-transport.mjs";
import { validateGroupExactStamp } from "./participation-group-model.mjs";
import { ContactReconciliationReportError, CONTACT_REPORT_FORMAT,
  requireContactReconciliationReportReader, validateContactReconciliationReportRow,
  inspectContactReconciliationRecovery, planRestoredContactReconciliationReportRow } from "./contact-reconciliation-report.mjs";

export const CONTACT_REPORT_READ_LIMIT = 20;
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const freeze = learningFreeze;
const fail = (code = "contact_report_store", status = 422) => { throw new ContactReconciliationReportError(code, status); };
const need = (v, code, status) => { if (!v) fail(code, status); };
const id = value => { need(typeof value === "string" && ID.test(value)); return value; };
const plain = value => !!value && typeof value === "object" && !isProxy(value) && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function prop(value, key) {
  // pg Result has a class prototype. Only an own data descriptor is read;
  // public selectors still go through fields()/plain() before reaching here.
  need(value && typeof value === "object" && !isProxy(value));
  const d = Object.getOwnPropertyDescriptor(value, key);
  need(d?.enumerable && Object.hasOwn(d, "value")); return d.value;
}
function fields(value, keys) {
  need(plain(value)); const names = Reflect.ownKeys(value);
  need(names.length === keys.length && names.every(k => typeof k === "string" && keys.includes(k)));
  return Object.fromEntries(keys.map(k => [k, prop(value, k)]));
}
function rows(result, max) {
  const input = prop(result, "rows");
  need(input && typeof input === "object" && !isProxy(input) && Array.isArray(input) && Object.getPrototypeOf(input) === Array.prototype);
  const d = Object.getOwnPropertyDescriptor(input, "length");
  need(d && Object.hasOwn(d, "value") && Number.isSafeInteger(d.value) && d.value >= 0 && d.value <= max);
  const names = Reflect.ownKeys(input), expected = new Set(Array.from({ length: d.value }, (_, i) => String(i)));
  need(names.length === d.value + 1 && names.every(k => k === "length" || expected.has(k)));
  return Array.from({ length: d.value }, (_, i) => { const cell = Object.getOwnPropertyDescriptor(input, String(i)); need(cell?.enumerable && Object.hasOwn(cell, "value")); return cell.value; });
}
function exactTime(value) { try { validateGroupExactStamp(value); } catch { fail("contact_report_time"); } }
function authorized(input) {
  id(input.org);
  // Deliberately not an auth library: the caller must have just established
  // this actual member/session inside its correctly tenant-scoped transaction.
  return requireContactReconciliationReportReader(input.member);
}

const SELECT = `SELECT r.org_id,r.id,r.created_by,r.title,r.checksum,r.payload,
to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
FROM os_reports r WHERE r.org_id=$1 AND r.payload->>'format'='charitology-contact-reconciliation'`;
export const CONTACT_REPORT_STORE_SQL = Object.freeze({
  available: "/*crm:report:available*/ SELECT org_id,id FROM os_reports WHERE org_id=$1 AND id=$2 LIMIT 2",
  insert: "/*crm:report:insert*/ INSERT INTO os_reports(org_id,id,created_by,title,checksum,payload,created_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::timestamptz)",
  list: "/*crm:report:list*/ " + SELECT + ' AND ($2::text IS NULL OR r.id COLLATE "C">$2::text COLLATE "C") ORDER BY r.id COLLATE "C" LIMIT $3',
  detail: "/*crm:report:detail*/ " + SELECT + " AND r.id=$2 LIMIT 2",
  occupied: "/*crm:report:occupied*/ SELECT org_id,id FROM os_reports WHERE org_id=$1 AND payload->>'format'='charitology-contact-reconciliation' LIMIT 1",
});
async function available(c, org, reportId) {
  const found = rows(await c.query(CONTACT_REPORT_STORE_SQL.available, [org, reportId]), 1);
  for (const raw of found) {
    const r = fields(raw, ["org_id", "id"]); need(r.org_id === org && r.id === reportId);
    fail("contact_report_collision", 409);
  }
}
function scopedRow(raw, org) {
  const row = validateContactReconciliationReportRow(raw);
  need(row.org_id === org, "contact_report_unavailable", 404); return row;
}
function metadata(row) {
  return { id: row.id, title: row.title, checksum: row.checksum, createdAt: row.created_at,
    operation: row.payload.operation, originOrgId: row.payload.originOrgId, recordedAtExact: row.payload.recordedAtExact };
}
// This non-exported path accepts only rows already validated/planned by its
// two callers. Historical cross-origin metadata is never a public append flag.
async function insertPlannedRow(c, org, member, input) {
  const row = scopedRow(input, org); need(row.created_by === member.userId, "contact_report_actor"); exactTime(row.created_at);
  await available(c, org, row.id);
  const result = await c.query(CONTACT_REPORT_STORE_SQL.insert,
    [row.org_id, row.id, row.created_by, row.title, row.checksum, JSON.stringify(row.payload), row.created_at]);
  need(prop(result, "rowCount") === 1); return row;
}
/** No upsert/update/delete, clock/ID mint, automatic Retry or receipt promotion. */
export async function appendContactReconciliationReport(c, input) {
  const v = fields(input, ["org", "member", "row"]), member = authorized(v);
  const row = scopedRow(v.row, v.org);
  need(row.payload.originOrgId === v.org && row.created_at === row.payload.recordedAtExact, "contact_report_live_context");
  return insertPlannedRow(c, v.org, member, row);
}
export async function listContactReconciliationReports(c, input) {
  const v = fields(input, ["org", "member", "after", "limit"]); authorized(v);
  if (v.after !== null) id(v.after);
  need(Number.isSafeInteger(v.limit) && v.limit >= 1 && v.limit <= CONTACT_REPORT_READ_LIMIT);
  const raw = rows(await c.query(CONTACT_REPORT_STORE_SQL.list, [v.org, v.after, v.limit + 1]), v.limit + 1);
  const admitted = []; let previous = v.after;
  for (const item of raw) {
    const row = scopedRow(item, v.org);
    need(row.payload.format === CONTACT_REPORT_FORMAT && (previous === null || row.id > previous));
    previous = row.id; admitted.push(row);
  }
  // Invalid reserved versions/methods fail above, including the extra cursor
  // row. No skip/filter path or hidden/global count can alter the page.
  return freeze({ reports: admitted.slice(0, v.limit).map(metadata),
    nextAfter: admitted.length > v.limit ? admitted[v.limit - 1].id : null });
}
export async function readContactReconciliationReport(c, input) {
  const v = fields(input, ["org", "member", "id"]); authorized(v); id(v.id);
  const raw = rows(await c.query(CONTACT_REPORT_STORE_SQL.detail, [v.org, v.id]), 1);
  if (raw.length === 0) fail("contact_report_unavailable", 404);
  const row = scopedRow(raw[0], v.org); need(row.id === v.id, "contact_report_unavailable", 404);
  return freeze({ ...metadata(row), payload: row.payload });
}
/** All known source rows are admitted and every proposed ID is preflighted
 * before the first INSERT. A later failure still needs caller rollback. */
export async function restoreContactReconciliationReports(c, input) {
  const v = fields(input, ["org", "member", "backup", "createdAtExact"]), member = authorized(v);
  const recovery = inspectContactReconciliationRecovery(v.backup);
  if (recovery.present || v.createdAtExact !== null) exactTime(v.createdAtExact);
  const occupied = rows(await c.query(CONTACT_REPORT_STORE_SQL.occupied, [v.org]), 1);
  for (const item of occupied) {
    const row = fields(item, ["org_id", "id"]); need(row.org_id === v.org); id(row.id);
    // Also blocks an unknown reserved version and a CRM-free/legacy source.
    fail("contact_report_occupied", 409);
  }
  if (!recovery.present) return freeze({ present: false, count: 0 });
  const destination = { orgId: v.org, actorId: member.userId, createdAtExact: v.createdAtExact };
  const planned = recovery.reports.map(row => planRestoredContactReconciliationReportRow(row, destination));
  for (const row of planned) await available(c, v.org, row.id);
  for (const row of planned) await insertPlannedRow(c, v.org, member, row);
  return freeze({ present: true, count: planned.length });
}
