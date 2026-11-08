/** Private pure immutable history proposal. No returned data grants authority. */
import { isProxy, isDate } from "node:util/types";
import { learningOwned, learningFreeze } from "./learning-transport.mjs";
import { hash, stable } from "./security.mjs";
import { modulePermissions } from "./modules.mjs";
import { validateGroupExactStamp, compareGroupExactStamps } from "./participation-group-model.mjs";
import { planContactReconciliation } from "./contact-reconciliation-model.mjs";

export const CONTACT_REPORT_FORMAT = "charitology-contact-reconciliation";
export const CONTACT_REPORT_METHOD = "contact-reconciliation-report-v1";
export const CONTACT_REPORT_LIMITS = Object.freeze({ reportBytes: 1048576, workBytes: 2097152,
  nativeBytes: 67108864, scanEntries: 200000, nodes: 50000, depth: 32 });
const KEYS = ["format", "version", "method", "originOrgId", "reportId", "recordedAtExact", "operation", "review", "reverses", "changes", "sha256"];
const ROW = ["org_id", "id", "created_by", "title", "checksum", "payload", "created_at"];
const ID = /^[A-Za-z0-9_-]{1,100}$/, SHA = /^[a-f0-9]{64}$/;
export class ContactReconciliationReportError extends Error {
  constructor(code = "contact_report_fields", status = 422) {
    super("This contact reconciliation history is invalid or unavailable.");
    this.name = "ContactReconciliationReportError"; this.code = code; this.status = status;
  }
}
const need = (v, code, status) => { if (!v) throw new ContactReconciliationReportError(code, status); };
const id = v => need(typeof v === "string" && ID.test(v));
const equal = (a, b) => stable(a) === stable(b);
const exact = (v, keys) => need(v && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k)));
const stamp = v => { try { validateGroupExactStamp(v); } catch { throw new ContactReconciliationReportError("contact_report_time"); } };
const digest = body => hash({ method: CONTACT_REPORT_METHOD, kind: "report", value: body });
const freeze = learningFreeze;

function own(value, bytes = CONTACT_REPORT_LIMITS.workBytes) {
  const active = new Set(); let nodes = 0;
  const walk = (v, depth) => {
    need(++nodes <= CONTACT_REPORT_LIMITS.nodes && depth <= CONTACT_REPORT_LIMITS.depth);
    if (v === null || typeof v === "boolean") return;
    if (typeof v === "string") { need(v.length <= bytes); return; }
    if (typeof v === "number") { need(Number.isFinite(v)); return; }
    need(v && typeof v === "object" && !isProxy(v) && !active.has(v));
    const array = Array.isArray(v), proto = Object.getPrototypeOf(v);
    need(array ? proto === Array.prototype : proto === Object.prototype);
    const keys = Reflect.ownKeys(v); need(keys.every(k => typeof k === "string"));
    let ordered = keys;
    if (array) {
      const d = Object.getOwnPropertyDescriptor(v, "length");
      need(d && Object.hasOwn(d, "value") && Number.isSafeInteger(d.value) && d.value >= 0 && d.value <= CONTACT_REPORT_LIMITS.scanEntries);
      ordered = Array.from({ length: d.value }, (_, i) => String(i));
      const allowed = new Set(ordered); need(keys.length === ordered.length + 1 && keys.every(k => k === "length" || allowed.has(k)));
    } else need(keys.length <= 64);
    active.add(v);
    for (const key of ordered) { const d = Object.getOwnPropertyDescriptor(v, key); need(d?.enumerable && Object.hasOwn(d, "value")); walk(d.value, depth + 1); }
    active.delete(v);
  };
  try { walk(value, 0); return learningOwned(value, { bytes }); }
  catch { throw new ContactReconciliationReportError("contact_report_owned"); }
}
function pin(value) {
  if (value === null) return;
  exact(value, ["sha256"]); need(typeof value.sha256 === "string" && SHA.test(value.sha256));
}
function review(input) {
  // The held planner permits opaque nonnull comparison metadata. Persistent
  // history narrows these to exact source-derived hashes, never live approvals.
  let plan;
  try { plan = planContactReconciliation(input); } catch { throw new ContactReconciliationReportError("contact_report_review"); }
  for (const row of input.pair) { pin(row.approval); pin(row.snapshot); }
  need(input.decision.operation !== "merge" || plan.proposal !== null, "contact_report_ineligible");
  return { input, plan };
}
function revision(value) { need(Number.isSafeInteger(value) && value >= 1 && value < 2147483647, "contact_report_revision"); return value + 1; }
function mergeChanges(r, at) {
  if (r.input.decision.operation === "no-merge") return [];
  const p = r.plan.proposal, survivor = r.input.pair.find(x => x.id === p.survivorId), loser = r.input.pair.find(x => x.id === p.loserId);
  return [
    { before: survivor, after: { ...survivor, revision: revision(survivor.revision), data: p.survivorData } },
    { before: loser, after: { ...loser, revision: revision(loser.revision), deletedAt: at } },
  ];
}
function inverseChanges(original) {
  return original.changes.map(change => ({ before: change.after,
    after: { ...change.before, revision: revision(change.after.revision) } }));
}
function checkedReport(v, allowReverse = true) {
  exact(v, KEYS); need(v.format === CONTACT_REPORT_FORMAT && v.version === 1 && v.method === CONTACT_REPORT_METHOD);
  id(v.originOrgId); id(v.reportId); stamp(v.recordedAtExact);
  need(["no-merge", "merge", "reverse"].includes(v.operation));
  let expected;
  if (v.operation === "reverse") {
    need(allowReverse && v.review === null && v.reverses !== null);
    const original = checkedReport(v.reverses, false);
    need(original.operation === "merge" && original.originOrgId === v.originOrgId && original.reportId !== v.reportId);
    need(compareGroupExactStamps(v.recordedAtExact, original.recordedAtExact) > 0, "contact_report_time");
    expected = inverseChanges(original);
  } else {
    need(v.reverses === null); exact(v.review, ["input", "plan"]);
    const r = review(v.review.input); need(equal(r.plan, v.review.plan), "contact_report_review");
    need(v.originOrgId === r.input.orgId && v.operation === r.input.decision.operation);
    expected = mergeChanges(r, v.recordedAtExact);
  }
  need(equal(v.changes, expected), "contact_report_changes");
  const { sha256, ...body } = v; need(typeof sha256 === "string" && SHA.test(sha256) && sha256 === digest(body), "contact_report_checksum");
  return v;
}
export function validateContactReconciliationReport(input) { return freeze(checkedReport(own(input, CONTACT_REPORT_LIMITS.reportBytes))); }
function sealed(body) { return validateContactReconciliationReport({ ...body, sha256: digest(body) }); }
export function makeContactReconciliationReport(input) {
  const v = own(input); exact(v, ["reportId", "recordedAtExact", "input"]); id(v.reportId); stamp(v.recordedAtExact);
  const r = review(v.input), body = { format: CONTACT_REPORT_FORMAT, version: 1, method: CONTACT_REPORT_METHOD,
    originOrgId: r.input.orgId, reportId: v.reportId, recordedAtExact: v.recordedAtExact,
    operation: r.input.decision.operation, review: r, reverses: null, changes: mergeChanges(r, v.recordedAtExact) };
  return sealed(body);
}
function checkedInverse(originalValue, current) {
  const original = checkedReport(originalValue, false); need(original.operation === "merge", "contact_report_reverse");
  exact(current, ["pair", "organizations", "references"]);
  need(Array.isArray(current.pair) && current.pair.length === 2);
  for (const row of current.pair) { need(row && typeof row === "object" && !Array.isArray(row)); id(row.id); }
  const byId = new Map(current.pair.map(row => [row.id, row])); need(byId.size === 2);
  for (const change of original.changes) need(equal(byId.get(change.after.id), change.after), "contact_report_stale", 409);
  // Reuse the old planner only to admit/canonicalize projected inventory. The
  // pair here is historical validation data, never a synthetic SQL/current row.
  let inventory;
  try { inventory = planContactReconciliation({ ...original.review.input, organizations: current.organizations, references: current.references }); }
  catch { throw new ContactReconciliationReportError("contact_report_context"); }
  need(equal(inventory.organizations, original.review.plan.organizations) && equal(inventory.references, original.review.plan.references), "contact_report_stale", 409);
  return { original, changes: inverseChanges(original) };
}
/** Data-only inverse review. No new report ID, clock, session or authority is minted. */
export function planContactReconciliationInverseReview(input) {
  const v = own(input); exact(v, ["original", "current"]);
  const { original, changes } = checkedInverse(v.original, v.current);
  return freeze({ operation: "reverse", originalReportId: original.reportId, originalChecksum: original.sha256, changes });
}
export function planContactReconciliationReversal(input) {
  const v = own(input); exact(v, ["original", "current", "reportId", "recordedAtExact"]);
  const { original, changes } = checkedInverse(v.original, v.current); id(v.reportId); stamp(v.recordedAtExact);
  return sealed({ format: CONTACT_REPORT_FORMAT, version: 1, method: CONTACT_REPORT_METHOD,
    originOrgId: original.originOrgId, reportId: v.reportId, recordedAtExact: v.recordedAtExact,
    operation: "reverse", review: null, reverses: original, changes });
}

function plain(v) { return !!v && typeof v === "object" && !isProxy(v) && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v)); }
function value(v, key) {
  if (!plain(v)) return undefined;
  const d = Object.getOwnPropertyDescriptor(v, key); if (!d) return undefined;
  need(d.enumerable && Object.hasOwn(d, "value")); return d.value;
}
/** Reserved-format dispatch catches bad versions/methods during recovery. */
export const isContactReconciliationRecoveryFamily = payload => value(payload, "format") === CONTACT_REPORT_FORMAT;
export function isContactReconciliationReportFamily(payload) {
  return isContactReconciliationRecoveryFamily(payload) && value(payload, "version") === 1 && value(payload, "method") === CONTACT_REPORT_METHOD;
}
export function contactReconciliationReportTitle(input) {
  const r = validateContactReconciliationReport(input); return "Contact reconciliation: " + r.operation + " " + r.sha256.slice(0, 12);
}
function rowStamp(value, native = false) {
  if (native && typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) stamp(value.slice(0, -1) + "000Z");
  else stamp(value);
}
export function validateContactReconciliationReportRow(input) {
  const v = own(input); exact(v, ROW); id(v.org_id); id(v.id); id(v.created_by); rowStamp(v.created_at, true);
  const payload = checkedReport(v.payload); need(v.id === payload.reportId && v.checksum === payload.sha256 && v.title === contactReconciliationReportTitle(payload), "contact_report_row");
  return freeze(v);
}
export function makeContactReconciliationReportRow(input) {
  const v = own(input); exact(v, ["orgId", "id", "actorId", "createdAtExact", "payload"]);
  id(v.orgId); id(v.id); id(v.actorId); stamp(v.createdAtExact);
  const payload = checkedReport(v.payload); need(payload.originOrgId === v.orgId && payload.reportId === v.id && payload.recordedAtExact === v.createdAtExact, "contact_report_context");
  return validateContactReconciliationReportRow({ org_id: v.orgId, id: v.id, created_by: v.actorId,
    title: contactReconciliationReportTitle(payload), checksum: payload.sha256, payload, created_at: v.createdAtExact });
}
export function planRestoredContactReconciliationReportRow(source, destination) {
  const row = validateContactReconciliationReportRow(source), d = own(destination); exact(d, ["orgId", "actorId", "createdAtExact"]);
  id(d.orgId); id(d.actorId); stamp(d.createdAtExact);
  return validateContactReconciliationReportRow({ ...row, org_id: d.orgId, created_by: d.actorId, created_at: d.createdAtExact });
}
export function requireContactReconciliationReportReader(input) {
  const m = own(input); exact(m, ["userId", "role", "programIds", "revision"]); id(m.userId);
  need(["owner", "admin"].includes(m.role) && Array.isArray(m.programIds) && m.programIds.length === 0, "contact_report_role", 403);
  need(Number.isSafeInteger(m.revision) && m.revision >= 1 && modulePermissions("contacts", m.role).read && modulePermissions("contacts", m.role).write, "contact_report_role", 403);
  return m; // Caller must establish actual current membership/session separately.
}

function entries(rows) {
  if (rows === undefined) return [];
  need(rows && typeof rows === "object" && !isProxy(rows) && Array.isArray(rows) && Object.getPrototypeOf(rows) === Array.prototype);
  const d = Object.getOwnPropertyDescriptor(rows, "length");
  need(d && Object.hasOwn(d, "value") && Number.isSafeInteger(d.value) && d.value >= 0 && d.value <= CONTACT_REPORT_LIMITS.scanEntries);
  const keys = Reflect.ownKeys(rows), expected = new Set(Array.from({ length: d.value }, (_, i) => String(i)));
  need(keys.length === d.value + 1 && keys.every(k => k === "length" || expected.has(k)));
  return Array.from({ length: d.value }, (_, i) => { const cell = Object.getOwnPropertyDescriptor(rows, String(i)); need(cell?.enumerable && Object.hasOwn(cell, "value")); return cell.value; });
}
function scan(rows, native = false, org) {
  const all = entries(rows), reports = [], ids = new Map(); let bytes = 0;
  for (const item of all) {
    const itemId = value(item, "id"); if (typeof itemId === "string") ids.set(itemId, (ids.get(itemId) ?? 0) + 1);
    if (!isContactReconciliationRecoveryFamily(value(item, "payload"))) continue;
    let candidate = item;
    if (native && isDate(value(item, "created_at"))) {
      candidate = {};
      for (const key of Reflect.ownKeys(item)) {
        need(typeof key === "string"); const x = Object.getOwnPropertyDescriptor(item, key); need(x?.enumerable && Object.hasOwn(x, "value"));
        if (key === "created_at") { try { candidate[key] = Date.prototype.toISOString.call(x.value); } catch { throw new ContactReconciliationReportError("contact_report_time"); } }
        else candidate[key] = x.value;
      }
    }
    const row = validateContactReconciliationReportRow(candidate); if (org !== undefined) need(row.org_id === org);
    bytes += Buffer.byteLength(JSON.stringify(row)); need(bytes <= CONTACT_REPORT_LIMITS.nativeBytes, "contact_report_limit"); reports.push(row);
  }
  for (const row of reports) need(ids.get(row.id) === 1, "contact_report_duplicate");
  return freeze({ present: reports.length > 0, reports });
}
export const inspectContactReconciliationRecovery = backup => scan(value(backup, "reports"));
export function contactReconciliationNativeReports(rows, orgId) {
  id(orgId); const checked = scan(rows, true, orgId), byId = new Map(checked.reports.map(r => [r.id, r]));
  return entries(rows).map(row => isContactReconciliationRecoveryFamily(value(row, "payload")) ? byId.get(value(row, "id")) : row);
}
export function planContactReconciliationReportRestore(input) {
  // Only descriptors are read from existing native legacy rows. Their bodies
  // remain outside this new validator, and old absence emits no new counter.
  need(plain(input)); const keys = Reflect.ownKeys(input);
  need(keys.length === 3 && ["backup", "destination", "destinationReports"].every(k => keys.includes(k)));
  const recovery = inspectContactReconciliationRecovery(value(input, "backup")), destination = own(value(input, "destination"));
  exact(destination, ["orgId", "actorId", "createdAtExact"]); id(destination.orgId); id(destination.actorId); stamp(destination.createdAtExact);
  if (!recovery.present) return freeze({ present: false, reports: [] });
  const destinationRows = value(input, "destinationReports"); need(Array.isArray(destinationRows));
  const existing = entries(destinationRows), ids = new Set();
  for (const row of existing) {
    need(value(row, "org_id") === destination.orgId, "contact_report_destination");
    const recordId = value(row, "id"); id(recordId); need(!ids.has(recordId)); ids.add(recordId);
    need(!isContactReconciliationRecoveryFamily(value(row, "payload")), "contact_report_occupied", 409);
  }
  for (const row of recovery.reports) need(!ids.has(row.id), "contact_report_collision", 409);
  return freeze({ present: true, reports: recovery.reports.map(row => planRestoredContactReconciliationReportRow(row, destination)) });
}
export function contactReconciliationRestoreSummary(input) {
  need(plain(input)); exact(input, ["present", "reports"]);
  const present = value(input, "present"), rows = entries(value(input, "reports"));
  need(typeof present === "boolean" && present === (rows.length > 0));
  for (const row of rows) validateContactReconciliationReportRow(row);
  return present ? { contactReconciliationReportsRecovered: rows.length } : {};
}
