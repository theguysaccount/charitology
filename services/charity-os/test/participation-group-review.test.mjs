import test from "node:test";
import assert from "node:assert/strict";
import { planGroupReview, prepareGroupReview } from "../lib/participation-group-review.mjs";
import { readParticipationDomainClock } from "../lib/participation.mjs";
import { groupHash, projectGroupHistory, validateGroupHistory } from "../lib/participation-group-model.mjs";
import { verifyGroupPreview } from "../lib/participation-group-preview.mjs";

// Detached authorized-context fixtures, not real SQL/session/allocation proof.
const SHA = "a".repeat(64), secret = "fictional-review-secret-".repeat(3);
const at = "2099-01-01T09:00:00.123456Z", expires = "2099-01-01T09:10:00.123456Z";
const terms = { startAt: "2099-01-02T10:00:00.000Z", endAt: "2099-01-02T12:00:00.000Z", timeZone: "UTC" };
async function fixture(count = 3, capacity = 2, admitted = false) {
  const ids = Array.from({ length: count }, (_, n) => "p" + String(n + 1).padStart(2, "0"));
  const authority = { actorSha256: SHA, sessionSha256: SHA, membershipSha256: SHA, memberCreatedAtExact: at, restoreEpochSha256: SHA };
  const base = (operation, rev, result) => ({ version: 1, groupId: "group", operation,
    commandHash: String(rev).padStart(64, "0"), requestHash: SHA, authority, reviewSha256: operation === "create" ? null : SHA,
    acceptedAtExact: at, result: { groupId: "group", groupRevision: rev, state: operation === "create" ? "draft" : "admitted", ...result } });
  const receipts = [base("create", 1, { target: { targetId: "target", moduleId: "volunteers" }, rosterIds: ids, coordinatorIntakeId: null })];
  if (admitted) receipts.push(base("admit", 2, { selectionMode: "all", selected: ids.map(participationId => ({ participationId,
    action: "confirm", resultRevision: 3, state: "confirmed", frozenSha256: SHA, allocationHash: null,
    notificationQueued: false, auditRetained: true })), unselectedIds: [], reasonHashes: [], auditRetained: true }));
  const history = projectGroupHistory({ originOrgId: "org", receipts });
  const queries = [], c = { async query(sql, args) {
    queries.push({ sql, args }); assert(sql.startsWith("WITH moment AS MATERIALIZED"));
    return { rows: [{ at_exact: at, expires_at_exact: expires,
      epoch_microseconds: String(BigInt(Date.parse(at.slice(0, 23) + "Z")) * 1000n + 456n), within_window: true }] };
  } };
  const serverClock = await readParticipationDomainClock(c); queries.length = 0;
  const context = { originMode: "live", group: { orgId: "org", id: "group", liveTargetId: "target", moduleId: "volunteers",
    state: admitted ? "admitted" : "draft", revision: admitted ? 2 : 1, lastCommandHash: receipts.at(-1).commandHash,
    rosterIds: ids, history }, source: { id: "target", data: { capacity } }, authority,
    roster: ids.map(id => ({ id, org_id: "org", target_id: "target", module_id: "volunteers",
      booking_record_id: "booking_" + id, contact_id: "contact_" + id, state: admitted ? "confirmed" : "requested",
      recovered: false, requested_interval: null })), chosenGraphPinsSha256: SHA,
    rosterSha256: groupHash("roster", { targetId: "target", moduleId: "volunteers", rosterIds: ids }),
    inventory: { readiness: ids.map(participationId => ({ participationId, action: "confirm", reason: null, eligible: { terms } })),
      orderedWaitlist: [], allocationExisting: [], inventorySha256: SHA, serverClock },
    suggest() { throw Error("No promotion expected"); } };
  return { c, context, queries, ids };
}
const admission = (selection = { mode: "all", items: [] }, reasons = []) => ({ version: 1, groupRevision: 1, selection, reasons });
const review = (f, input = admission(), operation = "admit") => prepareGroupReview({ c: f.c, org: "org", context: f.context, operation, input, secret });

test("three selected at capacity two yields no token and admits nobody", async () => {
  const f = await fixture(), value = await review(f);
  assert.equal(value.publicReview.ready, false); assert.equal(value.payload, null);
  assert.equal(value.publicReview.previewToken, null); assert.equal(value.publicReview.reviewSha256, null);
  assert.deepEqual(value.publicReview.blockers, f.ids.map(participationId => ({ participationId, code: "capacity" })));
  assert.deepEqual(value.steps, []); assert.deepEqual(f.queries, []);
  assert(f.context.roster.every(p => p.state === "requested"));
});
test("a deliberate proper subset gets one fully bound signed review, without SQL writes", async () => {
  const f = await fixture(), input = admission({ mode: "subset", items: ["p02", "p01"] });
  const value = await review(f, input), bindings = { ...value.payload };
  for (const key of ["format", "version", "issuedAtExact", "expiresAtExact"]) delete bindings[key];
  assert.equal(value.publicReview.ready, true); assert.deepEqual(value.publicReview.selectedIds, ["p01", "p02"]);
  assert.deepEqual(value.publicReview.unselectedIds, ["p03"]); assert.deepEqual(value.steps.map(x => x.participationId), ["p01", "p02"]);
  assert.deepEqual(verifyGroupPreview(value.publicReview.previewToken, secret, { nowExact: at, bindings }), value.payload);
  assert.equal(value.publicReview.expiresAtExact, expires); assert.deepEqual(f.queries, []);
  assert.equal(JSON.stringify(value.publicReview).includes("inventorySha256"), false);
  assert.equal(JSON.stringify(value.publicReview).includes("authority"), false);
});
test("readiness failure does not make an automatic smaller selection or allocate excluded members", async () => {
  const f = await fixture(3, 3); f.context.inventory.readiness[1].reason = "participation_consent";
  const all = await review(f); assert.equal(all.publicReview.ready, false);
  assert.deepEqual(all.publicReview.blockers, [{ participationId: "p02", code: "consent" }]); assert.deepEqual(all.steps, []);
  const chosen = await review(f, admission({ mode: "subset", items: ["p01", "p03"] }));
  assert.equal(chosen.publicReview.ready, true); assert.deepEqual(chosen.publicReview.unselectedIds, ["p02"]);
});
test("promotion order uses the source queue and each later suggestion sees preceding prospective changes", async () => {
  const f = await fixture(3, 3), calls = [];
  for (const id of ["p01", "p02"]) {
    f.context.roster.find(p => p.id === id).state = "waitlisted";
    f.context.inventory.readiness.find(p => p.participationId === id).action = "promote";
  }
  f.context.inventory.orderedWaitlist = [{ id: "earlier_unselected" }, { id: "p02" }, { id: "p01" }];
  f.context.suggest = value => { calls.push(structuredClone(value)); return value.prospectiveConfirmed.length ? "p01" : "earlier_unselected"; };
  const input = admission({ mode: "subset", items: ["p01", "p02"] }, [{ participationId: "p02", reason: "Explicitly prioritize this request" }]);
  const value = await review(f, input);
  assert.equal(value.publicReview.ready, true); assert.deepEqual(value.steps.map(x => x.participationId), ["p02", "p01"]);
  assert.deepEqual(calls[0], { removedWaitlistIds: [], prospectiveConfirmed: [] });
  assert.deepEqual(calls[1].removedWaitlistIds, ["p02"]); assert.equal(calls[1].prospectiveConfirmed[0].participationId, "p02");
  assert.equal(calls[1].prospectiveConfirmed.length, 1);
  const blocked = await review(f, admission(input.selection));
  assert.equal(blocked.publicReview.ready, false); assert.deepEqual(blocked.publicReview.blockers, [{ participationId: "p02", code: "bypass-reason" }]);
  assert.equal(blocked.publicReview.previewToken, null);
});
test("legal partial range metadata loses only its version wrapper in allocation projections", async () => {
  const f = await fixture(2, 1);
  const policy = { ...terms, kind: "shift", intervalPolicy: { version: 1, mode: "within-shift" } };
  f.context.inventory.readiness.forEach(x => { x.eligible = { terms: policy }; });
  f.context.roster[0].requested_interval = { version: 1, startAt: terms.startAt, endAt: "2099-01-02T11:00:00.000Z", timeZone: "UTC" };
  f.context.roster[1].requested_interval = { version: 1, startAt: "2099-01-02T11:00:00.000Z", endAt: terms.endAt, timeZone: "UTC" };
  const before = structuredClone(f.context.roster), value = await review(f);
  assert.equal(value.publicReview.ready, true); assert.equal(value.allocation.counts.targetPeak, 1);
  assert.deepEqual(f.context.roster, before);
});
test("cancellation uses current confirmed state without a renewed admission policy", async () => {
  const f = await fixture(2, null, true); f.context.inventory = null; f.context.source.status = "draft";
  f.context.roster.forEach(p => { p.consent = null; });
  const value = await review(f, { version: 1, groupRevision: 2, selected: ["p02"], reason: "Requested cancellation" }, "cancel");
  assert.equal(value.publicReview.ready, true); assert.deepEqual(value.steps, [{ participationId: "p02", action: "cancel", reason: "Requested cancellation" }]);
  assert.equal(f.queries.length, 1); assert.equal(value.payload.operation, "cancel");
  f.context.roster[1].state = "cancelled";
  const blocked = await review(f, { version: 1, groupRevision: 2, selected: ["p01", "p02"], reason: "Requested cancellation" }, "cancel");
  assert.equal(blocked.publicReview.ready, false); assert.equal(blocked.payload, null);
  assert.deepEqual(blocked.publicReview.blockers, [{ participationId: "p02", code: "participation" }]);
  assert.equal(f.queries.length, 1);
});
test("a changed reviewed graph or explicit reason changes the bound review", async () => {
  const f = await fixture(2, 2), first = await review(f);
  f.context.chosenGraphPinsSha256 = "b".repeat(64); const second = await review(f);
  assert.notEqual(first.pinsSha256, second.pinsSha256); assert.notEqual(first.reviewSha256, second.reviewSha256);
  const third = await review(f, admission(undefined, [{ participationId: "p01", reason: "A deliberate recorded reason" }]));
  assert.notEqual(second.selectionSha256, third.selectionSha256); assert.notEqual(second.reviewSha256, third.reviewSha256);
});

test("cancellation exclusions use the original admitted set after a proper subset admission", async () => {
  const f = await fixture(3, 3, true), history = structuredClone(f.context.group.history);
  const prior = history.decisions[1].result;
  prior.selectionMode = "subset"; prior.selected = prior.selected.slice(0, 2); prior.unselectedIds = ["p03"];
  f.context.group.history = validateGroupHistory(history); f.context.roster[2].state = "requested";
  f.context.inventory = null;
  const value = await review(f, { version: 1, groupRevision: 2, selected: ["p01"], reason: "One admitted person asked to cancel" }, "cancel");
  assert.equal(value.publicReview.ready, true); assert.deepEqual(value.publicReview.selectedIds, ["p01"]);
  assert.deepEqual(value.publicReview.unselectedIds, ["p02"]);
  assert.equal(f.context.roster[2].state, "requested");
});
test("stale, incomplete or terminal contexts refuse instead of signing a partial view", async () => {
  for (const change of [f => { f.context.group.revision = 2; }, f => { f.context.group.state = "closed"; },
    f => { f.context.roster.pop(); }, f => { f.context.inventory.readiness.pop(); }, f => { f.context.originMode = "recovered"; }]) {
    const f = await fixture(2, 2); change(f); await assert.rejects(review(f));
  }
  const f = await fixture(2, 2); await assert.rejects(review(f, admission({ mode: "subset", items: ["p01", "p02"] })));
  assert.equal(f.queries.length, 0);
});

test("NEW commit planning needs no signing key and never renews a review window", async () => {
  const f = await fixture(2, 2);
  Object.defineProperty(f.context.inventory, "serverClock", { get() { throw Error("A commit must verify its original window"); } });
  const result = planGroupReview({ org: "org", context: f.context, operation: "admit", input: admission() });
  assert.equal(result.publicReview.ready, true); assert.equal(result.publicReview.previewToken, null);
  assert.equal(result.publicReview.expiresAtExact, null); assert.equal(Object.hasOwn(result.bindings, "issuedAtExact"), false);
  assert.equal(Object.hasOwn(result.bindings, "expiresAtExact"), false); assert.deepEqual(f.queries, []);
});
