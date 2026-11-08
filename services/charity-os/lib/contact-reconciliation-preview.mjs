/** IO-free review/receipt data. A valid packet or SQL-row shape grants no current authority. */
import { isProxy } from "node:util/types";
import { learningOwned, learningFreeze } from "./learning-transport.mjs";
import { hash, stable } from "./security.mjs";
import { validateGroupExactStamp } from "./participation-group-model.mjs";
import { planContactReconciliation } from "./contact-reconciliation-model.mjs";
import { validateContactReconciliationReport, planContactReconciliationInverseReview } from "./contact-reconciliation-report.mjs";

export const CONTACT_PREVIEW_KIND = "contact-reconciliation-v1";
export const CONTACT_PREVIEW_FORMAT = "charitology-contact-reconciliation-preview";
export const CONTACT_PREVIEW_METHOD = "contact-reconciliation-preview-v1";
export const CONTACT_RECEIPT_FORMAT = "charitology-contact-reconciliation-receipt";
export const CONTACT_RECEIPT_METHOD = "contact-reconciliation-receipt-v1";
export const CONTACT_PREVIEW_LIMITS = Object.freeze({ bytes: 2097152, nodes: 50000, depth: 32 });
const ID = /^[A-Za-z0-9_-]{1,100}$/, SHA = /^[a-f0-9]{64}$/;
const AUTHORITY = ["actorId", "sessionSha256", "membershipSha256", "memberCreatedAtExact", "restoreEpochSha256"];
const STAMP = ["id", "createdAtExact", "updatedAtExact", "deletedAtExact", "rowSha256"];
const PIN = ["previewId", "actorId", "commandSha256", "reportId", "reportSha256", "restoreEpochSha256"];
const PREVIEW = ["format", "version", "method", "purpose", "orgId", "actorId", "reportId", "authority", "reviewedContextSha256", "rowStamps", "operation", "review", "sha256"];
const RECEIPT = ["format", "version", "method", "purpose", "orgId", "actorId", "authority", "commandSha256", "requestSha256", "acceptedAtExact", "result", "sha256"];
const SQL_ROW = ["org_id", "id", "actor_id", "kind", "payload", "checksum", "base_revision", "expires_at", "committed_at", "created_at"];
export class ContactReconciliationPreviewError extends Error {
  constructor(code = "contact_preview_fields", status = 422) {
    super("This contact review or retained receipt is invalid or unavailable.");
    this.name = "ContactReconciliationPreviewError"; this.code = code; this.status = status;
  }
}
const need = (v, code, status) => { if (!v) throw new ContactReconciliationPreviewError(code, status); };
const exact = (v, keys) => need(v && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k)));
const id = v => need(typeof v === "string" && ID.test(v));
const sha = v => need(typeof v === "string" && SHA.test(v));
const same = (a, b) => stable(a) === stable(b);
const freeze = learningFreeze;
const stamp = v => { try { validateGroupExactStamp(v); } catch { throw new ContactReconciliationPreviewError("contact_preview_time"); } };
function own(value) {
  const active = new Set(); let nodes = 0, bytes = 0;
  const charge = n => { bytes += n; need(bytes <= CONTACT_PREVIEW_LIMITS.bytes, "contact_preview_limit"); };
  const visit = (v, depth) => {
    need(++nodes <= CONTACT_PREVIEW_LIMITS.nodes && depth <= CONTACT_PREVIEW_LIMITS.depth, "contact_preview_limit");
    if (v === null || typeof v === "boolean" || typeof v === "number") {
      need(typeof v !== "number" || Number.isFinite(v)); charge(Buffer.byteLength(JSON.stringify(v))); return;
    }
    if (typeof v === "string") { need(v.length <= CONTACT_PREVIEW_LIMITS.bytes); charge(Buffer.byteLength(JSON.stringify(v))); return; }
    need(v && typeof v === "object" && !isProxy(v) && !active.has(v));
    const array = Array.isArray(v); need(Object.getPrototypeOf(v) === (array ? Array.prototype : Object.prototype));
    const keys = Reflect.ownKeys(v); need(keys.every(k => typeof k === "string")); let ordered = keys;
    if (array) {
      const d = Object.getOwnPropertyDescriptor(v, "length"); need(d && Object.hasOwn(d, "value") && Number.isSafeInteger(d.value) && d.value >= 0 && d.value <= CONTACT_PREVIEW_LIMITS.nodes);
      need(keys.length === d.value + 1);
      ordered = Array.from({ length: d.value }, (_, i) => String(i)); const indices = new Set(ordered);
      need(keys.length === ordered.length + 1 && keys.every(k => k === "length" || indices.has(k)));
    } else need(keys.length <= 64);
    active.add(v); charge(2); let first = true;
    for (const key of ordered) {
      const d = Object.getOwnPropertyDescriptor(v, key); need(d?.enumerable && Object.hasOwn(d, "value"));
      if (!first) charge(1); first = false; if (!array) charge(Buffer.byteLength(JSON.stringify(key)) + 1);
      visit(d.value, depth + 1);
    }
    active.delete(v);
  };
  try { visit(value, 0); return learningOwned(value, { bytes: CONTACT_PREVIEW_LIMITS.bytes }); }
  catch (e) { if (e instanceof ContactReconciliationPreviewError && e.code === "contact_preview_limit") throw e; throw new ContactReconciliationPreviewError("contact_preview_owned"); }
}
function authority(v, actorId) {
  exact(v, AUTHORITY); id(v.actorId); need(v.actorId === actorId); stamp(v.memberCreatedAtExact);
  for (const key of ["sessionSha256", "membershipSha256", "restoreEpochSha256"]) sha(v[key]);
}
function rowStamps(v, pair) {
  need(Array.isArray(v) && v.length === 2 && Array.isArray(pair) && pair.length === 2);
  for (let i = 0; i < 2; i++) {
    const r = v[i]; exact(r, STAMP); id(r.id); need(r.id === pair[i].id); stamp(r.createdAtExact); stamp(r.updatedAtExact); sha(r.rowSha256);
    if (r.deletedAtExact !== null) stamp(r.deletedAtExact);
    need(r.deletedAtExact === pair[i].deletedAt);
  }
  need(v[0].id !== v[1].id);
}
function pairMarkers(pair) {
  for (const row of pair) for (const value of [row.approval, row.snapshot]) if (value !== null) { exact(value, ["sha256"]); sha(value.sha256); }
}
function receiptPin(v, original, auth) {
  exact(v, PIN); id(v.previewId); id(v.actorId); id(v.reportId);
  for (const k of ["commandSha256", "reportSha256", "restoreEpochSha256"]) sha(v[k]);
  need(v.reportId === original.reportId && v.reportSha256 === original.sha256 && v.restoreEpochSha256 === auth.restoreEpochSha256, "contact_preview_context");
}
const digest = (method, kind, value) => hash({ method, kind, value });
function checkDigest(v, method, kind) {
  sha(v.sha256); const { sha256, ...body } = v; need(sha256 === digest(method, kind, body), "contact_preview_checksum");
}
function checkedPreview(v) {
  exact(v, PREVIEW); need(v.format === CONTACT_PREVIEW_FORMAT && v.version === 1 && v.method === CONTACT_PREVIEW_METHOD && v.purpose === CONTACT_PREVIEW_KIND);
  id(v.orgId); id(v.actorId); id(v.reportId); authority(v.authority, v.actorId); sha(v.reviewedContextSha256);
  let expected;
  if (v.operation === "reverse") {
    exact(v.review, ["original", "receiptPin", "current", "plan"]);
    const original = validateContactReconciliationReport(v.review.original); need(original.originOrgId === v.orgId && original.reportId !== v.reportId, "contact_preview_context");
    receiptPin(v.review.receiptPin, original, v.authority);
    expected = planContactReconciliationInverseReview({ original, current: v.review.current }); rowStamps(v.rowStamps, v.review.current.pair);
  } else {
    need(["merge", "no-merge"].includes(v.operation)); exact(v.review, ["input", "plan"]);
    expected = planContactReconciliation(v.review.input); need(v.review.input.orgId === v.orgId && v.review.input.decision.operation === v.operation, "contact_preview_context");
    need(v.operation !== "merge" || expected.proposal !== null, "contact_preview_ineligible"); pairMarkers(v.review.input.pair); rowStamps(v.rowStamps, v.review.input.pair);
  }
  need(same(v.review.plan, expected), "contact_preview_review"); checkDigest(v, CONTACT_PREVIEW_METHOD, "preview"); return v;
}
export function validateContactReconciliationPreview(input) { return freeze(checkedPreview(own(input))); }
function sealPreview(body) { return validateContactReconciliationPreview({ ...body, sha256: digest(CONTACT_PREVIEW_METHOD, "preview", body) }); }
function base(v) { return { format: CONTACT_PREVIEW_FORMAT, version: 1, method: CONTACT_PREVIEW_METHOD, purpose: CONTACT_PREVIEW_KIND,
  orgId: v.orgId, actorId: v.actorId, reportId: v.reportId, authority: v.authority, reviewedContextSha256: v.reviewedContextSha256, rowStamps: v.rowStamps }; }
export function makeContactReconciliationPreview(input) {
  const v = own(input); exact(v, ["orgId", "actorId", "reportId", "authority", "reviewedContextSha256", "rowStamps", "input"]);
  const plan = planContactReconciliation(v.input);
  return sealPreview({ ...base(v), operation: v.input.decision.operation, review: { input: v.input, plan } });
}
export function makeContactReconciliationReversePreview(input) {
  const v = own(input); exact(v, ["orgId", "actorId", "reportId", "authority", "reviewedContextSha256", "rowStamps", "original", "receiptPin", "current"]);
  return sealPreview({ ...base(v), operation: "reverse", review: { original: v.original, receiptPin: v.receiptPin, current: v.current,
    plan: planContactReconciliationInverseReview({ original: v.original, current: v.current }) } });
}
function checkedReceipt(v) {
  exact(v, RECEIPT); need(v.format === CONTACT_RECEIPT_FORMAT && v.version === 1 && v.method === CONTACT_RECEIPT_METHOD && v.purpose === CONTACT_PREVIEW_KIND);
  id(v.orgId); id(v.actorId); authority(v.authority, v.actorId); sha(v.commandSha256); sha(v.requestSha256); stamp(v.acceptedAtExact);
  exact(v.result, ["operation", "reportId", "reportSha256", "recordIds"]); need(["merge", "no-merge", "reverse"].includes(v.result.operation)); id(v.result.reportId); sha(v.result.reportSha256);
  need(Array.isArray(v.result.recordIds) && v.result.recordIds.length === (v.result.operation === "no-merge" ? 0 : 2)); v.result.recordIds.forEach(id);
  need(new Set(v.result.recordIds).size === v.result.recordIds.length); checkDigest(v, CONTACT_RECEIPT_METHOD, "receipt"); return v;
}
export function validateContactReconciliationReceipt(input) { return freeze(checkedReceipt(own(input))); }
export function makeContactReconciliationReceipt(input) {
  const v = own(input); exact(v, ["report", "authority", "keyHash", "requestHash"]); const report = validateContactReconciliationReport(v.report);
  exact(v.authority, AUTHORITY); authority(v.authority, v.authority.actorId);
  const body = { format: CONTACT_RECEIPT_FORMAT, version: 1, method: CONTACT_RECEIPT_METHOD, purpose: CONTACT_PREVIEW_KIND,
    orgId: report.originOrgId, actorId: v.authority.actorId, authority: v.authority, commandSha256: v.keyHash, requestSha256: v.requestHash,
    acceptedAtExact: report.recordedAtExact, result: { operation: report.operation, reportId: report.reportId, reportSha256: report.sha256, recordIds: report.changes.map(c => c.after.id) } };
  return validateContactReconciliationReceipt({ ...body, sha256: digest(CONTACT_RECEIPT_METHOD, "receipt", body) });
}
function sqlTimestamp(v) {
  need(typeof v === "string"); const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)$/.exec(v); need(m, "contact_preview_time");
  stamp(m[1] + "." + (m[2] ?? "").padEnd(6, "0") + "Z");
  if (m[3] !== "Z") need(Number(m[3].slice(1, 3)) <= 15 && Number(m[3].slice(4)) <= 59, "contact_preview_time");
}
/** Exact ordinary SQL-row integrity only. The returned authority fields remain historical data. */
export function validateContactReconciliationPreviewRow(input) {
  const v = own(input); exact(v, SQL_ROW); id(v.org_id); id(v.id); id(v.actor_id); need(v.kind === CONTACT_PREVIEW_KIND, "contact_preview_kind");
  sha(v.checksum); sha(v.base_revision); sqlTimestamp(v.created_at); sqlTimestamp(v.expires_at); if (v.committed_at !== null) sqlTimestamp(v.committed_at);
  need(v.checksum === hash(v.payload), "contact_preview_row_checksum");
  const pending = v.committed_at === null, payload = pending ? checkedPreview(v.payload) : checkedReceipt(v.payload);
  need(payload.orgId === v.org_id && payload.actorId === v.actor_id, "contact_preview_context");
  if (pending) need(v.base_revision === payload.reviewedContextSha256, "contact_preview_context");
  return freeze({ classification: "passive", state: pending ? "pending" : "committed", payload });
}
