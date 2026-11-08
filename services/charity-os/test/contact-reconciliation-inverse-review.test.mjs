import test from "node:test";
import assert from "node:assert/strict";
import { validateRecord } from "../lib/modules.mjs";
import { planContactReconciliationInverseReview as review,
  makeContactReconciliationReport as make, planContactReconciliationReversal as reverse } from "../lib/contact-reconciliation-report.mjs";

const AT = "2026-11-08T09:10:11.123456Z", LATER = "2026-11-08T10:10:11.654321Z", LATER_AGAIN = "2026-11-08T11:10:11.654322Z";
const row = (id, title) => ({ id, orgId: "fictional_origin", moduleId: "contacts", revision: 3, status: "draft",
  data: validateRecord("contacts", { title, kind: "person-reference", contactPreference: "permission-needed" }, { records: [] }),
  source: null, approval: null, snapshot: null, deletedAt: null });
const input = () => ({ orgId: "fictional_origin", pair: [row("left", "Fictional left"), row("right", "Fictional right")], organizations: [], references: [],
  decision: { operation: "merge", survivorId: "left", fields: { title: "right", displayLabel: "unknown", email: "unknown" }, basis: "record-comparison", reason: "Fictional deliberate comparison" } });
const original = () => make({ reportId: "original", recordedAtExact: AT, input: input() });
const current = r => ({ pair: r.changes.map(x => structuredClone(x.after)), organizations: structuredClone(r.review.input.organizations), references: structuredClone(r.review.input.references) });
const bad = (fn, code, status) => assert.throws(fn, e => e.name === "ContactReconciliationReportError" && (!code || e.code === code) && (!status || e.status === status));
const final = (r, c, at = LATER) => reverse({ original: r, current: c, reportId: "inverse", recordedAtExact: at });

test("clock-free review is closed and agrees exactly with real stamped final changes", () => {
  const r = original(), c = current(r), before = structuredClone({ original: r, current: c }), reviewed = review({ original: r, current: c });
  assert.deepEqual(Object.keys(reviewed).sort(), ["operation", "originalReportId", "originalChecksum", "changes"].sort());
  assert.equal(reviewed.operation, "reverse"); assert.equal(reviewed.originalReportId, r.reportId); assert.equal(reviewed.originalChecksum, r.sha256);
  const a = final(r, c), b = final(r, c, LATER_AGAIN);
  assert.deepEqual(reviewed.changes, a.changes); assert.deepEqual(reviewed.changes, b.changes); assert.notEqual(a.sha256, b.sha256);
  assert.deepEqual({ original: r, current: c }, before);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(reviewed.changes[i].before, r.changes[i].after);
    assert.equal(reviewed.changes[i].after.revision, r.changes[i].after.revision + 1);
    const { revision, ...restored } = reviewed.changes[i].after, { revision: prior, ...expected } = r.changes[i].before;
    assert.deepEqual(restored, expected);
  }
});
test("review never asks the Node clock and final report still requires a real later exact stamp", () => {
  const r = original(), c = current(r), saved = Date.now;
  Date.now = () => { throw Error("Node clock must not drive inverse review"); };
  try { assert.equal(review({ original: r, current: c }).originalReportId, r.reportId); }
  finally { Date.now = saved; }
  for (const at of [AT, "2026-11-08T09:10:11.123455Z", "2026-11-08T10:10:11.654Z"]) bad(() => final(r, c, at), "contact_report_time");
});
test("review output is detached and deeply frozen without freezing caller data", () => {
  const r = structuredClone(original()), c = current(r), reviewed = review({ original: r, current: c });
  c.pair[0].data.title = "Later edit"; r.changes[0].before.data.title = "Changed historical input";
  assert.equal(reviewed.changes[0].before.data.title, "Fictional right");
  assert.equal(reviewed.changes[0].after.data.title, "Fictional left");
  assert(Object.isFrozen(reviewed) && Object.isFrozen(reviewed.changes) && Object.isFrozen(reviewed.changes[0].after.data));
  assert.throws(() => { reviewed.changes[0].after.data.title = "Forged"; }, TypeError);
});
test("review and final reversal share exact current-row and microsecond staleness refusals", () => {
  const r = original();
  for (const change of [c => c.pair[0].revision++, c => c.pair[1].data.title += " changed", c => c.pair[0].orgId = "foreign",
    c => c.pair[1].deletedAt = "2026-11-08T09:10:11.123Z"]) {
    const c = current(r); change(c);
    bad(() => review({ original: r, current: c }), "contact_report_stale", 409);
    bad(() => final(r, c), "contact_report_stale", 409);
  }
  for (const pair of [[null, null], [1, 2], [{ id: "left" }, { id: "left" }]]) bad(() => review({ original: r, current: { pair, organizations: [], references: [] } }));
});
test("new private or ordinary dependency blocks clock-free review before any report is minted", () => {
  const r = original();
  for (const family of ["record", "intake", "participation", "delivery", "immutable-history"]) {
    const c = current(r); c.references = [{ family, id: "new_reference", moduleId: family === "record" ? "fundraising" : null,
      field: family === "record" ? "contactId" : null, contactId: "left", revision: 1, sha256: "a".repeat(64), deleted: false }];
    bad(() => review({ original: r, current: c }), "contact_report_stale", 409);
    bad(() => final(r, c), "contact_report_stale", 409);
  }
});
test("review only admits original valid merge history, not no-merge or a reversal", () => {
  const r = original(), no = input(); no.decision = { operation: "no-merge", assertion: "unresolved", basis: "unknown", reason: "Fictional unresolved comparison" };
  const separate = make({ reportId: "separate", recordedAtExact: AT, input: no });
  bad(() => review({ original: separate, current: current(r) }), "contact_report_reverse");
  bad(() => review({ original: final(r, current(r)), current: current(r) }));
  const corrupt = structuredClone(r); corrupt.changes[0].after.data.title = "Forged";
  bad(() => review({ original: corrupt, current: current(r) }));
});
test("review has no caller time, new report ID or authority extension and refuses hooks unread", () => {
  const r = original(), c = current(r);
  for (const extra of [{ recordedAtExact: LATER }, { reportId: "new" }, { session: {} }, { accepted: true }]) bad(() => review({ original: r, current: c, ...extra }));
  let hooks = 0; const v = { original: r, current: c };
  Object.defineProperty(v, "clock", { enumerable: true, get() { hooks++; throw Error("not a preview clock callback"); } });
  bad(() => review(v), "contact_report_owned"); assert.equal(hooks, 0);
});
