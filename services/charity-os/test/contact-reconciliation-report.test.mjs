import test from "node:test";
import assert from "node:assert/strict";
import { validateRecord } from "../lib/modules.mjs";
import { hash } from "../lib/security.mjs";
import { CONTACT_REPORT_METHOD, CONTACT_REPORT_FORMAT, validateContactReconciliationReport as validate,
  makeContactReconciliationReport as make, planContactReconciliationReversal as reverse,
  validateContactReconciliationReportRow as validateRow, makeContactReconciliationReportRow as makeRow,
  planRestoredContactReconciliationReportRow as restoredRow, requireContactReconciliationReportReader as reader,
  isContactReconciliationReportFamily, isContactReconciliationRecoveryFamily,
  inspectContactReconciliationRecovery as inspect, contactReconciliationNativeReports as native,
  planContactReconciliationReportRestore as restore, contactReconciliationRestoreSummary as summary } from "../lib/contact-reconciliation-report.mjs";

const AT = "2026-11-08T09:10:11.123456Z", LATER = "2026-11-08T10:10:11.654321Z";
const row = (id, title) => ({ id, orgId: "fictional_origin", moduleId: "contacts", revision: 3, status: "draft",
  data: validateRecord("contacts", { title, kind: "person-reference", email: null, contactPreference: "permission-needed", purpose: "Fictional scheduling\nOnly" }, { records: [] }),
  source: null, approval: null, snapshot: null, deletedAt: null });
const context = () => ({ orgId: "fictional_origin", pair: [row("left", "Fictional left 🌱"), row("right", "Fictional right")], organizations: [], references: [],
  decision: { operation: "merge", survivorId: "left", fields: { title: "right", displayLabel: "unknown", email: "unknown" }, basis: "record-comparison", reason: "Fictional deliberate draft comparison" } });
const merged = () => make({ reportId: "merge_report", recordedAtExact: AT, input: context() });
const separate = () => { const v = context(); v.decision = { operation: "no-merge", assertion: "shared-household-distinct-people", basis: "unknown", reason: "Fictional association only; no access or consent" }; return make({ reportId: "separate_report", recordedAtExact: AT, input: v }); };
const current = r => ({ pair: r.changes.map(x => structuredClone(x.after)), organizations: structuredClone(r.review.input.organizations), references: structuredClone(r.review.input.references) });
const inverse = r => reverse({ original: r, current: current(r), reportId: "reverse_report", recordedAtExact: LATER });
const reportRow = r => makeRow({ orgId: r.originOrgId, id: r.reportId, actorId: "fictional_actor", createdAtExact: r.recordedAtExact, payload: r });
const destination = (orgId = "fictional_destination") => ({ orgId, actorId: "fictional_restorer", createdAtExact: LATER });
const bad = (fn, code, status) => assert.throws(fn, e => e.name === "ContactReconciliationReportError" && (!code || e.code === code) && (!status || e.status === status));
function reseal(r) { const { sha256, ...body } = r; return { ...body, sha256: hash({ method: CONTACT_REPORT_METHOD, kind: "report", value: body }) }; }

test("merge report contains exact declared context and two deterministic changes only", () => {
  const input = context(), before = structuredClone(input), r = make({ reportId: "merge_report", recordedAtExact: AT, input });
  assert.deepEqual(Object.keys(r).sort(), ["format", "version", "method", "originOrgId", "reportId", "recordedAtExact", "operation", "review", "reverses", "changes", "sha256"].sort());
  assert.equal(r.operation, "merge"); assert.equal(r.reverses, null); assert.equal(r.changes.length, 2);
  assert.equal(r.changes[0].after.data.title, input.pair[1].data.title);
  assert.equal(r.changes[0].after.revision, 4); assert.equal(r.changes[1].after.revision, 4);
  assert.equal(r.changes[1].after.deletedAt, AT); assert.equal(r.changes[0].after.deletedAt, null);
  assert.deepEqual(input, before); assert(Object.isFrozen(r.changes[0].after.data));
});
test("no-merge household/role assertion changes nothing and cannot confer identity", () => {
  const r = separate(); assert.equal(r.operation, "no-merge"); assert.deepEqual(r.changes, []);
  assert.equal(r.review.plan.proposal, null); assert.equal(r.review.plan.authority, "none-data-only");
  assert.equal(r.review.input.decision.assertion, "shared-household-distinct-people");
  assert(!Object.hasOwn(r, "actorId")); assert(!Object.hasOwn(r, "accepted")); assert(!Object.hasOwn(r, "commandKey"));
});
test("closed approval/snapshot value-hash markers preserve useful no-merge without private bodies", () => {
  const input = context(); input.decision = { operation: "no-merge", assertion: "unresolved", basis: "unknown", reason: "Fictional uncertainty" };
  input.pair[0].status = "active"; input.pair[0].approval = { sha256: "a".repeat(64) }; input.pair[0].snapshot = { sha256: "b".repeat(64) };
  const r = make({ reportId: "pinned_report", recordedAtExact: AT, input }); assert.deepEqual(r.review.input.pair[0].snapshot, input.pair[0].snapshot);
  input.pair[0].approval = { actorId: "should_not_copy", status: "approved" }; bad(() => make({ reportId: "pinned_report", recordedAtExact: AT, input }));
});
test("ineligible merge is refused instead of becoming an accepted no-merge", () => {
  const input = context(); input.pair[1].data.contactPreference = "do-not-contact";
  bad(() => make({ reportId: "report", recordedAtExact: AT, input }), "contact_report_ineligible");
});
test("report checksum binds full input/plan/changes; forged self-consistent changes still refuse", () => {
  const r = merged(), tampered = structuredClone(r); tampered.changes[0].after.data.email = "fictional@example.invalid";
  bad(() => validate(tampered)); bad(() => validate(reseal(tampered)), "contact_report_changes");
  const altered = structuredClone(r); altered.review.plan.pair[0].revision++; bad(() => validate(reseal(altered)), "contact_report_review");
  const { sha256, ...body } = r; assert.equal(sha256, hash({ method: CONTACT_REPORT_METHOD, kind: "report", value: body })); assert.notEqual(sha256, hash(body));
});
test("exact reversal restores original values/trash state with advancing revisions", () => {
  const r = merged(), undone = inverse(r); assert.equal(undone.operation, "reverse"); assert.equal(undone.review, null);
  assert.deepEqual(undone.reverses, r);
  for (let i = 0; i < 2; i++) { assert.deepEqual(undone.changes[i].before, r.changes[i].after); const { revision, ...a } = undone.changes[i].after, { revision: old, ...b } = r.changes[i].before; assert.deepEqual(a, b); assert.equal(revision, r.changes[i].after.revision + 1); }
  assert.equal(undone.changes[1].after.deletedAt, null); assert.notEqual(undone.sha256, r.sha256);
});
test("later edits, repeated reversal, changed destination and revision exhaustion refuse", () => {
  const r = merged();
  for (const change of [c => c.pair[0].revision++, c => c.pair[1].data.title += " changed", c => c.pair[0].orgId = "restored_org"]) {
    const c = current(r); change(c); bad(() => reverse({ original: r, current: c, reportId: "next", recordedAtExact: LATER }), "contact_report_stale", 409);
  }
  const undone = inverse(r); bad(() => reverse({ original: undone, current: current(r), reportId: "again", recordedAtExact: LATER }));
  const c = current(r); c.pair = undone.changes.map(x => x.after); bad(() => reverse({ original: r, current: c, reportId: "again", recordedAtExact: LATER }), "contact_report_stale", 409);
  const input = context(); input.pair[0].revision = 2147483647; bad(() => make({ reportId: "overflow", recordedAtExact: AT, input }), "contact_report_revision");
});
test("SQL microseconds are exact, rounded Date-ms trash equality is never assumed", () => {
  const r = merged(), c = current(r); c.pair[1].deletedAt = "2026-11-08T09:10:11.123Z";
  bad(() => reverse({ original: r, current: c, reportId: "rounded", recordedAtExact: LATER }), "contact_report_stale", 409);
  for (const t of [AT, "2026-11-08T09:10:11.123455Z", "2026-11-08T10:10:11.654Z", "2026-02-30T00:00:00.000000Z"]) bad(() => reverse({ original: r, current: current(r), reportId: "time", recordedAtExact: t }), "contact_report_time");
});
test("new ordinary/private reference blocks reversal even when both row projections match", () => {
  const r = merged();
  for (const family of ["record", "intake", "participation", "delivery", "immutable-history"]) {
    const c = current(r); c.references = [{ family, id: "new_reference", moduleId: family === "record" ? "fundraising" : null, field: family === "record" ? "contactId" : null, contactId: "left", revision: 1, sha256: "a".repeat(64), deleted: false }];
    bad(() => reverse({ original: r, current: c, reportId: "changed_context", recordedAtExact: LATER }), "contact_report_stale", 409);
  }
});
test("dependency byte/hash changes block inverse; inventory order alone stays canonical", () => {
  const input = context(); input.references = ["z", "a"].map(id => ({ family: "record", id, moduleId: "fundraising", field: "contactId", contactId: "left", revision: 2, sha256: "a".repeat(64), deleted: false }));
  const r = make({ reportId: "referenced", recordedAtExact: AT, input }), c = current(r); c.references.reverse();
  assert.equal(reverse({ original: r, current: c, reportId: "ordered", recordedAtExact: LATER }).operation, "reverse");
  c.references[0].sha256 = "b".repeat(64); bad(() => reverse({ original: r, current: c, reportId: "stale", recordedAtExact: LATER }), "contact_report_stale", 409);
});
test("closed reserved family refuses unsupported method/version and unknown receipt fields", () => {
  const r = merged(); assert(isContactReconciliationReportFamily(r));
  for (const patch of [{ version: 2 }, { method: "unknown" }, { accepted: true }, { sessionSha256: "a".repeat(64) }]) {
    const t = { ...r, ...patch }; assert(isContactReconciliationRecoveryFamily(t)); bad(() => validate(t)); bad(() => inspect({ reports: [{ ...reportRow(r), payload: t }] }));
  }
});
test("seven-field row integrity pins ID/title/checksum and new origin/time context", () => {
  const r = merged(), row = reportRow(r); assert.deepEqual(validateRow(row), row); assert.equal(row.payload.recordedAtExact, AT);
  assert(!row.title.includes("Fictional"));
  for (const patch of [{ id: "different" }, { checksum: "f".repeat(64) }, { title: "arbitrary" }, { extra: true }]) bad(() => validateRow({ ...row, ...patch }));
  bad(() => makeRow({ orgId: "foreign", id: r.reportId, actorId: "actor", createdAtExact: AT, payload: r }), "contact_report_context");
  bad(() => makeRow({ orgId: r.originOrgId, id: r.reportId, actorId: "actor", createdAtExact: LATER, payload: r }), "contact_report_context");
});
test("two native JSON/metadata hops preserve exact history with inactive destination metadata", () => {
  const original = [merged(), separate(), inverse(merged())].map(reportRow), initialPayloads = original.map(r => r.payload);
  const encoded = JSON.parse(JSON.stringify(native(original.map(r => ({ ...r, created_at: new Date(r.created_at) })), "fictional_origin")));
  assert.equal(encoded[0].created_at, "2026-11-08T09:10:11.123Z"); assert.equal(encoded[0].payload.recordedAtExact, AT);
  const first = restore({ backup: { reports: encoded }, destination: destination(), destinationReports: [] });
  const secondEncoded = JSON.parse(JSON.stringify(native(first.reports.map(r => ({ ...r, created_at: new Date(r.created_at) })), "fictional_destination")));
  const second = restore({ backup: { reports: secondEncoded }, destination: destination("fictional_third"), destinationReports: [] });
  for (const result of [first, second]) { assert.equal(result.reports.length, 3); assert.deepEqual(result.reports.map(r => r.payload), initialPayloads); assert.deepEqual(result.reports.map(r => r.id), original.map(r => r.id)); assert.deepEqual(result.reports.map(r => r.checksum), original.map(r => r.checksum)); }
  assert.equal(second.reports[0].org_id, "fictional_third"); assert.equal(second.reports[0].payload.originOrgId, "fictional_origin"); assert.equal(second.reports[0].created_by, "fictional_restorer");
  assert.deepEqual(summary(second), { contactReconciliationReportsRecovered: 3 });
});
test("absent/legacy-only packets preserve old summary and legacy values without new family", () => {
  const legacy = { id: "legacy", payload: { historical: "unchanged" } };
  for (const backup of [{}, { reports: [] }, { reports: [legacy] }]) {
    const r = restore({ backup, destination: destination(), destinationReports: undefined }); assert.deepEqual(r, { present: false, reports: [] }); assert.deepEqual(summary(r), {});
  }
  const rows = native([legacy], "fictional_origin"); assert.equal(rows[0], legacy);
});
test("occupied destination, generic ID collision and duplicate source all refuse before a plan", () => {
  const source = reportRow(merged()), dest = destination();
  bad(() => restore({ backup: { reports: [source] }, destination: dest, destinationReports: [restoredRow(source, dest)] }), "contact_report_occupied", 409);
  bad(() => restore({ backup: { reports: [source] }, destination: dest, destinationReports: [{ org_id: dest.orgId, id: source.id, payload: { legacy: true } }] }), "contact_report_collision", 409);
  bad(() => restore({ backup: { reports: [source, source] }, destination: dest, destinationReports: [] }), "contact_report_duplicate");
  bad(() => restore({ backup: { reports: [source] }, destination: dest, destinationReports: undefined }));
});
test("reader helper narrows to unscoped owner/admin and does not fabricate freshness", () => {
  for (const role of ["owner", "admin"]) assert.equal(reader({ userId: "fictional_actor", role, programIds: [], revision: 2 }).role, role);
  for (const role of ["program_lead", "grants_lead", "contributor", "board_reader", "external_reviewer"]) bad(() => reader({ userId: "fictional_actor", role, programIds: [], revision: 2 }), "contact_report_role", 403);
  bad(() => reader({ userId: "fictional_actor", role: "admin", programIds: ["hidden"], revision: 2 }), "contact_report_role", 403);
});
test("hostile data and sparse compensated arrays refuse without running hooks", () => {
  let hooks = 0; const proxy = new Proxy({}, { getPrototypeOf() { hooks++; throw Error("trap"); }, ownKeys() { hooks++; throw Error("trap"); }, get() { hooks++; throw Error("trap"); } });
  bad(() => validate(proxy)); bad(() => validate(Object.create(proxy)));
  const r = structuredClone(merged()); Object.defineProperty(r, "review", { enumerable: true, get() { hooks++; throw Error("getter"); } }); bad(() => validate(r));
  for (const key of ["4294967295", "99999999999999999999999", "01", "-0"]) { const a = Array(1); Object.defineProperty(a, key, { value: reportRow(merged()), enumerable: true }); bad(() => inspect({ reports: a })); }
  assert.equal(hooks, 0);
});
test("reversal cannot nest reversals, use itself, forge inverse values or carry new authority", () => {
  const r = inverse(merged());
  for (const change of [x => x.reportId = x.reverses.reportId, x => x.changes[0].after.data.contactPreference = "permitted", x => x.reverses = structuredClone(r), x => x.review = { accepted: true }]) { const x = structuredClone(r); change(x); bad(() => validate(reseal(x))); }
});
test("malformed current pair returns a bounded refusal rather than a native exception", () => {
  const r = merged(); for (const pair of [[null, null], [1, 2], [{ id: "left" }, { id: "left" }]]) bad(() => reverse({ original: r, current: { pair, organizations: [], references: [] }, reportId: "bad_current", recordedAtExact: LATER }));
});
test("invalid native Date is refused without invoking toJSON or caller metadata getters", () => {
  let hooks = 0; const r = reportRow(merged()), invalid = new Date(NaN); invalid.toJSON = () => { hooks++; throw Error("hook"); };
  bad(() => native([{ ...r, created_at: invalid }], r.org_id), "contact_report_time");
  assert.equal(hooks, 0);
});
