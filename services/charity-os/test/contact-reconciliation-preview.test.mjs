import test from "node:test";
import assert from "node:assert/strict";
import { validateRecord } from "../lib/modules.mjs";
import { hash } from "../lib/security.mjs";
import { planContactReconciliation } from "../lib/contact-reconciliation-model.mjs";
import { makeContactReconciliationReport, planContactReconciliationReversal } from "../lib/contact-reconciliation-report.mjs";
import { CONTACT_PREVIEW_KIND, CONTACT_PREVIEW_FORMAT, CONTACT_PREVIEW_METHOD, CONTACT_RECEIPT_METHOD,
  CONTACT_PREVIEW_LIMITS, makeContactReconciliationPreview as make, makeContactReconciliationReversePreview as reverse,
  validateContactReconciliationPreview as validate, makeContactReconciliationReceipt as receipt,
  validateContactReconciliationReceipt as validateReceipt, validateContactReconciliationPreviewRow as passive } from "../lib/contact-reconciliation-preview.mjs";

const AT = "2026-11-08T09:10:11.123456Z", LATER = "2026-11-08T10:10:11.654321Z", ORG = "fictional_org", ACTOR = "fictional_actor";
const authority = () => ({ actorId: ACTOR, sessionSha256: "a".repeat(64), membershipSha256: "b".repeat(64), memberCreatedAtExact: AT, restoreEpochSha256: "c".repeat(64) });
const record = (id, title) => ({ id, orgId: ORG, moduleId: "contacts", revision: 3, status: "draft",
  data: validateRecord("contacts", { title, kind: "person-reference", contactPreference: "permission-needed", purpose: "Fictional scheduling\nNo permission inferred" }, { records: [] }),
  source: null, approval: null, snapshot: null, deletedAt: null });
const input = () => ({ orgId: ORG, pair: [record("left", "Fictional left"), record("right", "Fictional right")], organizations: [], references: [],
  decision: { operation: "merge", survivorId: "left", fields: { title: "left", displayLabel: "unknown", email: "unknown" }, basis: "record-comparison", reason: "Fictional explicit comparison" } });
const stamps = pair => pair.map((r, i) => ({ id: r.id, createdAtExact: AT, updatedAtExact: AT, deletedAtExact: r.deletedAt, rowSha256: String(i + 1).repeat(64) }));
const args = () => { const data = input(); return { orgId: ORG, actorId: ACTOR, reportId: "future_report", authority: authority(), reviewedContextSha256: "d".repeat(64), rowStamps: stamps(data.pair), input: data }; };
const original = () => makeContactReconciliationReport({ reportId: "original_report", recordedAtExact: AT, input: input() });
const reverseArgs = () => {
  const r = original(), current = { pair: r.changes.map(c => structuredClone(c.after)), organizations: [], references: [] };
  return { orgId: ORG, actorId: ACTOR, reportId: "inverse_report", authority: authority(), reviewedContextSha256: "e".repeat(64), rowStamps: stamps(current.pair), original: r,
    receiptPin: { previewId: "original_preview", actorId: "fictional_original_actor", commandSha256: "f".repeat(64), reportId: r.reportId, reportSha256: r.sha256, restoreEpochSha256: authority().restoreEpochSha256 }, current };
};
const finalReverse = v => planContactReconciliationReversal({ original: v.original, current: v.current, reportId: v.reportId, recordedAtExact: LATER });
const accepted = report => receipt({ report, authority: authority(), keyHash: "4".repeat(64), requestHash: "5".repeat(64) });
const sqlRow = (payload, committed = false) => ({ org_id: ORG, id: "fictional_preview", actor_id: ACTOR, kind: CONTACT_PREVIEW_KIND,
  payload, checksum: hash(payload), base_revision: committed ? "6".repeat(64) : payload.reviewedContextSha256,
  expires_at: "2026-11-08T09:40:11.123456+00:00", committed_at: committed ? LATER : null, created_at: AT });
const bad = (fn, code) => assert.throws(fn, e => ["ContactReconciliationPreviewError", "ContactReconciliationError", "ContactReconciliationReportError"].includes(e.name) && (!code || e.code === code));
function reseal(packet, method = CONTACT_PREVIEW_METHOD, kind = "preview") {
  const { sha256, ...body } = packet; return { ...body, sha256: hash({ method, kind, value: body }) };
}

test("normal preview recomputes the actual plan with closed data-only fields and no commit clock", () => {
  const v = args(), p = make(v); assert.equal(p.format, CONTACT_PREVIEW_FORMAT); assert.equal(p.purpose, CONTACT_PREVIEW_KIND);
  assert.deepEqual(p.review.plan, planContactReconciliation(v.input)); assert.equal(p.operation, "merge");
  assert.deepEqual(Object.keys(p).sort(), ["format", "version", "method", "purpose", "orgId", "actorId", "reportId", "authority", "reviewedContextSha256", "rowStamps", "operation", "review", "sha256"].sort());
  assert(!Object.hasOwn(p, "recordedAtExact")); assert(!Object.hasOwn(p, "reportSha256")); assert(Object.isFrozen(p.review.input.pair[0].data));
  v.input.pair[0].data.title = "Later caller change"; assert.equal(p.review.input.pair[0].data.title, "Fictional left");
});
test("explicit no-merge permits comparison metadata while ineligible merge is refused", () => {
  const v = args(); v.input.decision = { operation: "no-merge", assertion: "shared-household-distinct-people", basis: "unknown", reason: "Fictional shared association only" };
  v.input.pair[0].approval = { sha256: "7".repeat(64) }; assert.equal(make(v).operation, "no-merge");
  v.input.pair[0].approval = { actorId: "must_not_copy" }; bad(() => make(v));
  const x = args(); x.input.pair[1].data.contactPreference = "do-not-contact"; bad(() => make(x), "contact_preview_ineligible");
});
test("authority is exactly the five current-context pins and is bound to the packet actor", () => {
  for (const change of [v => v.actorId = "foreign", v => v.authority.sessionSha256 = "x", v => v.authority.memberCreatedAtExact = "2026-11-08T09:10:11.123Z", v => v.authority.role = "owner", v => v.orgId = "foreign"]) {
    const v = args(); change(v); bad(() => make(v));
  }
  const v = args(); delete v.authority.restoreEpochSha256; bad(() => make(v));
});
test("the two exact SQL row stamps retain orientation, microseconds and current trash state", () => {
  for (const change of [v => v.rowStamps.reverse(), v => v.rowStamps[1].id = "left", v => v.rowStamps[0].rowSha256 = "x", v => v.rowStamps[0].createdAtExact = "2026-11-08T09:10:11.123Z", v => v.rowStamps[0].deletedAtExact = AT, v => v.rowStamps.push(v.rowStamps[0])]) {
    const v = args(); change(v); bad(() => make(v));
  }
  const v = reverseArgs(), p = reverse(v); assert.equal(p.rowStamps[1].deletedAtExact, v.original.recordedAtExact);
});
test("packet-domain digest and generic stored hash are distinct and forged recomputed plans refuse", () => {
  const p = make(args()); assert.notEqual(p.sha256, hash(p));
  const stale = structuredClone(p); stale.review.plan.proposal.survivorData.title = "Forged";
  bad(() => validate(reseal(stale)), "contact_preview_review");
  bad(() => validate({ ...p, sha256: hash(p) }), "contact_preview_checksum");
  for (const patch of [{ version: 2 }, { purpose: "future.unknown" }, { accepted: true }, { clock: AT }]) bad(() => validate(reseal({ ...p, ...patch })));
});
test("reverse preview uses the clock-free inverse and agrees with later actual final changes", () => {
  const v = reverseArgs(), saved = Date.now; Date.now = () => { throw Error("Preview must not call Node now"); };
  let p; try { p = reverse(v); } finally { Date.now = saved; }
  assert.equal(p.operation, "reverse"); assert.deepEqual(p.review.plan.changes, finalReverse(v).changes);
  assert.equal(p.review.plan.originalChecksum, v.original.sha256); assert(!Object.hasOwn(p, "recordedAtExact"));
  assert(!Object.hasOwn(p.review.plan, "reportId")); assert(!Object.hasOwn(p.review.plan, "reportSha256"));
});
test("reverse receipt pin binds the original ID, SHA and current restore epoch without claiming proof", () => {
  for (const change of [v => v.receiptPin.reportId = "foreign", v => v.receiptPin.reportSha256 = "0".repeat(64), v => v.receiptPin.restoreEpochSha256 = "0".repeat(64), v => v.receiptPin.accepted = true, v => v.reportId = v.original.reportId, v => v.orgId = "foreign"]) {
    const v = reverseArgs(); change(v); bad(() => reverse(v));
  }
  const v = reverseArgs(); assert.notEqual(v.receiptPin.actorId, v.actorId); assert.equal(reverse(v).review.receiptPin.actorId, "fictional_original_actor");
});
test("reverse preview refuses later current edits and new private or ordinary dependencies", () => {
  const v = reverseArgs(); v.current.pair[0].revision++; bad(() => reverse(v), "contact_report_stale");
  for (const family of ["record", "intake", "participation", "delivery", "immutable-history"]) {
    const x = reverseArgs(); x.current.references = [{ family, id: "new_ref", moduleId: family === "record" ? "fundraising" : null, field: family === "record" ? "contactId" : null,
      contactId: "left", revision: 1, sha256: "8".repeat(64), deleted: false }]; bad(() => reverse(x), "contact_report_stale");
  }
});
test("compact receipt result and accepted stamp derive only from the actual validated final report", () => {
  const normal = args(), merged = makeContactReconciliationReport({ reportId: normal.reportId, recordedAtExact: AT, input: normal.input });
  const x = args(); x.input.decision = { operation: "no-merge", assertion: "unresolved", basis: "unknown", reason: "Fictional unresolved review" };
  const separate = makeContactReconciliationReport({ reportId: x.reportId, recordedAtExact: AT, input: x.input });
  for (const report of [merged, separate, finalReverse(reverseArgs())]) {
    const r = accepted(report); assert.equal(r.acceptedAtExact, report.recordedAtExact);
    assert.deepEqual(r.result, { operation: report.operation, reportId: report.reportId, reportSha256: report.sha256, recordIds: report.changes.map(c => c.after.id) });
    assert(!Object.hasOwn(r, "report")); assert(!Object.hasOwn(r, "accepted")); assert(Object.isFrozen(r.result.recordIds));
  }
  bad(() => receipt({ report: merged, authority: authority(), keyHash: "4".repeat(64), requestHash: "5".repeat(64), acceptedAtExact: LATER }));
});
test("receipt closed grammar and separate digest refuse added authority, mismatches and duplicate IDs", () => {
  const r = accepted(original()); assert.notEqual(r.sha256, hash(r));
  for (const change of [x => x.result.recordIds = ["left", "left"], x => x.result.recordIds = [], x => x.result.reportSha256 = "x", x => x.authority.actorId = "foreign", x => x.result.currentAuthority = true, x => x.acceptedAtExact = "2026-02-30T00:00:00.000000Z"]) {
    const x = structuredClone(r); change(x); bad(() => validateReceipt(reseal(x, CONTACT_RECEIPT_METHOD, "receipt")));
  }
  bad(() => receipt({ report: original(), authority: null, keyHash: "4".repeat(64), requestHash: "5".repeat(64) }));
});
test("strict pending and committed ordinary SQL rows classify passive data only", () => {
  const p = make(args()), pending = passive(sqlRow(p)); assert.deepEqual(Object.keys(pending).sort(), ["classification", "state", "payload"].sort());
  assert.equal(pending.classification, "passive"); assert.equal(pending.state, "pending"); assert.deepEqual(pending.payload, p);
  const r = accepted(original()), committed = passive(sqlRow(r, true)); assert.equal(committed.state, "committed"); assert.equal(committed.classification, "passive");
  assert.equal(committed.payload.result.reportSha256, r.result.reportSha256); assert(Object.isFrozen(committed.payload.authority));
});
test("unknown preview kinds and unbound SQL actor/org/base/checksum never prove passive absence", () => {
  const p = make(args());
  for (const change of [r => r.kind = "future.unknown", r => r.actor_id = "foreign", r => r.org_id = "foreign", r => r.base_revision = "9".repeat(64), r => r.checksum = p.sha256, r => r.extra = true]) {
    const r = sqlRow(p); change(r); bad(() => passive(r));
  }
  bad(() => passive({ ...sqlRow(p), kind: "future.unknown", payload: { opaqueCode: "left" }, checksum: hash({ opaqueCode: "left" }) }), "contact_preview_kind");
});
test("pending/receipt phase confusion and rehashed malformed domain packets are refused", () => {
  bad(() => passive(sqlRow(accepted(original())))); bad(() => passive(sqlRow(make(args()), true)));
  const p = structuredClone(make(args())); p.review.plan.sha256 = "0".repeat(64); const row = sqlRow(reseal(p)); bad(() => passive(row), "contact_preview_review");
});
test("SQL metadata timestamps preserve explicit original microseconds/offsets without Node now", () => {
  const p = make(args()), r = sqlRow(p); r.created_at = "2026-11-08T01:10:11.123456-08:00"; r.expires_at = "2026-11-08T09:40:11+00:00";
  const saved = Date.now; Date.now = () => { throw Error("No current clock in passive integrity"); };
  try { assert.equal(passive(r).classification, "passive"); } finally { Date.now = saved; }
  for (const value of ["2026-02-30T00:00:00Z", "2026-11-08T09:10:11", "2026-11-08T09:10:11.1234567Z", "2026-11-08T09:10:11+16:00", new Date(AT)]) bad(() => passive({ ...r, created_at: value }));
});
test("descriptor admission runs no proxy/getter/prototype or serialization hooks", () => {
  let hooks = 0; const proxy = new Proxy({}, { get() { hooks++; throw Error("trap"); }, getPrototypeOf() { hooks++; throw Error("trap"); }, ownKeys() { hooks++; throw Error("trap"); } });
  bad(() => make(proxy), "contact_preview_owned"); bad(() => make(Object.create(proxy)), "contact_preview_owned");
  const v = args(); Object.defineProperty(v.authority, "sessionSha256", { enumerable: true, get() { hooks++; throw Error("getter"); } }); bad(() => make(v), "contact_preview_owned");
  const x = args(); x.input.pair.toJSON = () => { hooks++; throw Error("toJSON"); }; bad(() => make(x), "contact_preview_owned");
  const y = args(); Object.defineProperty(y.rowStamps[0], "rowSha256", { value: "1".repeat(64), enumerable: false }); bad(() => make(y), "contact_preview_owned");
  assert.equal(hooks, 0);
});
test("sparse compensated arrays, symbols, cycles and oversized work refuse before canonical hashing", () => {
  for (const key of ["01", "4294967295", "99999999999999999999999"]) {
    const v = args(), sparse = Array(2); sparse[0] = v.rowStamps[0]; Object.defineProperty(sparse, key, { value: v.rowStamps[1], enumerable: true }); v.rowStamps = sparse; bad(() => make(v), "contact_preview_owned");
  }
  const v = args(); v[Symbol("extra")] = true; bad(() => make(v), "contact_preview_owned");
  const x = args(); x.authority.loop = x; bad(() => make(x), "contact_preview_owned");
  bad(() => validate({ ...make(args()), extra: "x".repeat(CONTACT_PREVIEW_LIMITS.bytes) }), "contact_preview_limit");
});
test("review census metadata changes packet identity but not meaningful plan/stamps/authority", () => {
  const a = args(), b = structuredClone(a); b.reviewedContextSha256 = "e".repeat(64); const left = make(a), right = make(b);
  assert.notEqual(left.sha256, right.sha256); assert.deepEqual(left.review.plan, right.review.plan);
  assert.deepEqual(left.rowStamps, right.rowStamps); assert.deepEqual(left.authority, right.authority);
  // Controller must compare these current meaningful values, not the self-changing complete census.
});
test("malformed maker inputs give bounded pure refusals, not native property access errors", () => {
  for (const invalid of [null, 1, {}, { decision: null }]) { const v = args(); v.input = invalid; bad(() => make(v)); }
  const v = reverseArgs(); v.current = null; bad(() => reverse(v));
});
