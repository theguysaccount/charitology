import test from "node:test";
import assert from "node:assert/strict";
import { frozenParticipationInterval } from "../lib/participation-intervals.mjs";
import { GROUP_ALLOCATION_CONTRACT, GROUP_ALLOCATION_LIMITS, ParticipationGroupAllocationError, planGroupAllocation } from "../lib/participation-group-allocation.mjs";

const clone = v => structuredClone(v), ORG = "org_visible";
const range = (a = "09:00", b = "12:00") => ({ startAt: "2026-11-10T" + a + ":00Z", endAt: "2026-11-10T" + b + ":00Z", timeZone: "UTC" });
const ids = n => Array.from({ length: n }, (_, i) => "person_" + (i + 1));
function input(n = 2, moduleId = "volunteers") {
  return { orgId: ORG, target: { targetId: "target_visible", moduleId, capacity: n, range: range() }, rosterIds: ids(n), selection: { mode: "all", items: [] }, selected: ids(n).map((participationId, i) => ({ orgId: ORG, participationId, bookingRecordId: "booking_" + (i + 1), contactId: "contact_" + (i + 1), targetId: "target_visible", moduleId, range: range() })), existing: [] };
}
function prior(options = {}) {
  return { kind: "managed", orgId: ORG, id: "hidden_participation", bookingRecordId: "hidden_booking", contactId: "hidden_contact", targetId: "target_visible", moduleId: "volunteers", range: range(), ...options };
}
const refuses = (fn, code) => assert.throws(fn, e => e instanceof ParticipationGroupAllocationError && (!code || e.code === code));
const codes = result => result.blockers.map(x => x.code);

test("three at capacity2 does not auto-fit; explicit two-person subset leaves one unchanged", () => {
  const all = input(3); all.target.capacity = 2; const before = clone(all), blocked = planGroupAllocation(all);
  assert.equal(blocked.ready, false); assert.deepEqual(blocked.selectedIds, ids(3)); assert.deepEqual(codes(blocked), ["capacity-exceeded"]);
  assert.deepEqual(blocked.counts, { roster: 3, selected: 3, unchanged: 0, targetExisting: 0, targetProspective: 3, targetPeak: 3, capacity: 2 }); assert.deepEqual(all, before);
  const subset = clone(all); subset.selection = { mode: "subset", items: ids(2) }; subset.selected = subset.selected.slice(0, 2);
  const result = planGroupAllocation(subset); assert.equal(result.ready, true); assert.equal(result.counts.unchanged, 1); assert.deepEqual(result.selectedIds, ids(2));
  assert(!Object.hasOwn(result, "confirmed")); assert(!Object.hasOwn(result, "committed"));
});

test("a fresh changed existing ledger invalidates a previously fitting entire selection", () => {
  const x = input(); assert.equal(planGroupAllocation(x).ready, true);
  x.existing = [prior()]; const result = planGroupAllocation(x); assert.equal(result.ready, false); assert.deepEqual(codes(result), ["capacity-exceeded"]); assert.equal(result.counts.targetExisting, 1); assert.equal(result.counts.targetPeak, 3); assert.deepEqual(result.blockers[0].participationIds, ids(2));
});

test("unknown capacity remains null and zero is a distinct refusal", () => {
  const x = input(); x.target.capacity = null; const unknown = planGroupAllocation(x); assert.equal(unknown.counts.capacity, null); assert.deepEqual(codes(unknown), ["capacity-unknown"]);
  x.target.capacity = 0; const zero = planGroupAllocation(x); assert.equal(zero.counts.capacity, 0); assert.deepEqual(codes(zero), ["capacity-zero"]);
  for (const value of [-1, "2", true, 2.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) { const y = input(); y.target.capacity = value; refuses(() => planGroupAllocation(y)); }
});

test("half-open adjacent volunteer intervals allow count2/peak1 while overlap blocks the whole selection", () => {
  const x = input(); x.target.capacity = 1; x.selected[0].range = range("09:00", "10:00"); x.selected[1].range = range("10:00", "11:00");
  const adjacent = planGroupAllocation(x); assert.equal(adjacent.ready, true); assert.equal(adjacent.counts.targetProspective, 2); assert.equal(adjacent.counts.targetPeak, 1);
  x.selected[1].range = range("09:30", "10:30"); const overlap = planGroupAllocation(x); assert.equal(overlap.ready, false); assert.equal(overlap.counts.targetPeak, 2); assert.deepEqual(codes(overlap), ["capacity-exceeded"]);
});

test("existing frozen partial intervals count by saved range, never editable whole-source fallback", () => {
  const x = input(); x.target.capacity = 1; x.selected[0].range = range("10:00", "11:00"); x.selected[1].range = range("11:00", "12:00");
  const terms = { ...range(), kind: "shift", intervalPolicy: { version: 1, mode: "within-shift" } }, requested = { version: 1, ...range("09:00", "10:00") };
  const saved = { module_id: "volunteers", requested_interval: requested, frozen: { terms, interval: requested, allocationHash: "a".repeat(64) } };
  const original = frozenParticipationInterval(saved), projection = { startAt: original.startAt, endAt: original.endAt, timeZone: original.timeZone };
  x.existing = [prior({ range: projection })]; const r = planGroupAllocation(x); assert.equal(r.ready, true); assert.equal(r.counts.targetProspective, 3); assert.equal(r.counts.targetPeak, 1);
  const before = clone(x); x.target.range = range("10:00", "12:00");
  assert.throws(() => planGroupAllocation(x), e => e.code === "participation_group_allocation_ledger" && /reconciliation/.test(e.message) && !/false|invalid history/.test(e.message));
  assert.deepEqual(x.existing, before.existing); assert.deepEqual(saved.frozen.interval, requested);
});

test("event allocations retain exact whole-occurrence strings and never accept partial event ranges", () => {
  const x = input(2, "events"); assert.equal(planGroupAllocation(x).ready, true);
  x.selected[0].range = range("09:30", "10:30"); refuses(() => planGroupAllocation(x));
  const old = input(2, "events"); old.target.capacity = 3; old.existing = [prior({ moduleId: "events", range: range("08:00", "09:00") })]; const before = clone(old); refuses(() => planGroupAllocation(old), "participation_group_allocation_ledger"); assert.deepEqual(old, before);
});

test("simultaneous selected contact/booking duplicates become selected-only consolidated blockers", () => {
  const x = input(); x.selected[1].contactId = x.selected[0].contactId; x.selected[1].bookingRecordId = x.selected[0].bookingRecordId;
  const r = planGroupAllocation(x); assert.equal(r.ready, false); assert.deepEqual(codes(r), ["duplicate-contact", "duplicate-booking", "volunteer-overlap"]);
  for (const blocker of r.blockers) assert.deepEqual(blocker.participationIds, ids(2)); assert(r.blockers.length <= 6);
  x.selected[0].range = range("09:00", "10:00"); x.selected[1].range = range("10:00", "11:00"); assert(!codes(planGroupAllocation(x)).includes("volunteer-overlap")); assert(codes(planGroupAllocation(x)).includes("duplicate-contact"));
});

test("same-target old duplicates and selected already-booked projections never allocate another place", () => {
  const x = input(); x.target.capacity = 4; x.existing = [prior({ contactId: "contact_1", bookingRecordId: "booking_1" })];
  const r = planGroupAllocation(x); assert.equal(r.ready, false); assert.deepEqual(r.blockers.find(x => x.code === "duplicate-contact").participationIds, ["person_1"]); assert.deepEqual(r.blockers.find(x => x.code === "duplicate-booking").participationIds, ["person_1"]);
  const matchingId = input(); matchingId.target.capacity = 4; matchingId.existing = [prior({ id: "person_1", contactId: "contact_1", bookingRecordId: "booking_1" })]; assert(codes(planGroupAllocation(matchingId)).includes("duplicate-booking"));
  matchingId.existing[0].bookingRecordId = "contradictory_identity"; refuses(() => planGroupAllocation(matchingId), "participation_group_allocation_ledger");
});

test("cross-shift managed/unmanaged overlaps report only affected selected IDs", () => {
  for (const kind of ["managed", "unmanaged"]) {
    const x = input(); x.existing = [prior({ kind, id: kind === "managed" ? "private_parent" : "private_booking", bookingRecordId: "private_booking", contactId: "contact_1", targetId: "private_other_shift" })];
    const r = planGroupAllocation(x); assert.deepEqual(r.blockers, [{ code: "volunteer-overlap", participationIds: ["person_1"] }]); assert.equal(r.counts.targetExisting, 0); assert.equal(r.counts.targetPeak, 2);
    const output = JSON.stringify(r); for (const hidden of ["private_parent", "private_booking", "private_other_shift", x.existing[0].range.startAt, "contact_1"]) assert(!output.includes(hidden));
    x.existing[0].range = range("12:00", "13:00"); assert.equal(planGroupAllocation(x).ready, true);
  }
});

test("unrelated hidden allocations cannot change counts or disclose whole-org inventory size", () => {
  const x = input(), baseline = planGroupAllocation(x);
  for (let i = 0; i < 5; ++i) x.existing.push(prior({ id: "unseen_" + i, bookingRecordId: "unseen_booking_" + i, contactId: "unseen_contact_" + i, targetId: "unseen_shift_" + i, range: range("08:00", "13:00") }));
  assert.deepEqual(planGroupAllocation(x), baseline); assert(!Object.hasOwn(baseline.counts, "existing"));
});

test("malformed/conflicting old identities, same-target unadopted rows and foreign orgs refuse generically", () => {
  const cases = [
    [prior(), prior({ id: "other_id" })],
    [prior(), prior({ bookingRecordId: "other_booking" })],
    [prior(), prior({ id: "other_id", bookingRecordId: "other_booking" })],
    [prior({ kind: "unmanaged", id: "hidden_booking" })],
    [prior({ orgId: "private_foreign_org" })],
    [prior({ moduleId: "events" })],
    [prior({ kind: "unmanaged", id: "wrong_identity", targetId: "other_shift" })],
  ];
  for (const existing of cases) {
    const x = input(); x.existing = existing; const before = clone(x);
    assert.throws(() => planGroupAllocation(x), e => e.code === "participation_group_allocation_ledger" && !e.message.includes("hidden") && !e.message.includes("private")); assert.deepEqual(x, before);
  }
});

test("strict schedules reject gaps, offset-zone disagreement, backwards/unknown ranges and extra fields", () => {
  for (const altered of [{ startAt: "" }, { endAt: "2026-11-10T08:00:00Z" }, { timeZone: "not/a/zone" }, { startAt: "2026-11-10T09:00:00+02:00" }, { version: 1 }]) {
    const x = input(); Object.assign(x.selected[0].range, altered); refuses(() => planGroupAllocation(x));
    const old = input(); old.existing = [prior({ range: { ...range(), ...altered } })]; refuses(() => planGroupAllocation(old), "participation_group_allocation_ledger");
  }
  const fold = input(); fold.target.range = { startAt: "2026-11-01T00:30:00-04:00", endAt: "2026-11-01T02:30:00-05:00", timeZone: "America/New_York" }; fold.selected.forEach(x => x.range = clone(fold.target.range)); assert.equal(planGroupAllocation(fold).ready, true);
  fold.selected[0].range.startAt = "2026-11-01T01:30:00-06:00"; refuses(() => planGroupAllocation(fold));
});

test("every selected row exactly matches explicit roster selection and mixed identities do not pass", () => {
  for (const change of [x => x.selected.pop(), x => x.selected.push(clone(x.selected[0])), x => x.selected[0].participationId = "foreign", x => x.selected[0].orgId = "foreign", x => x.selected[0].moduleId = "events", x => x.selected[0].targetId = "other", x => x.selected[0].approval = true, x => x.selection = { mode: "subset", items: ids(2) }, x => x.rosterIds = ["person_1", "person_1"], x => x.role = "owner"]) { const x = input(); change(x); refuses(() => planGroupAllocation(x)); }
  const subset = input(3); subset.selection = { mode: "subset", items: ["person_2"] }; subset.selected = [subset.selected[1]]; assert.equal(planGroupAllocation(subset).ready, true); assert.equal(planGroupAllocation(subset).counts.unchanged, 2);
});

test("outer/list/row Proxy and accessor rejection never executes attacker code", () => {
  let calls = 0; const proxy = new Proxy({}, { ownKeys() { calls++; throw Error("trap"); }, getPrototypeOf() { calls++; throw Error("trap"); }, get() { calls++; throw Error("trap"); } });
  refuses(() => planGroupAllocation(proxy));
  for (const field of ["target", "rosterIds", "selection", "selected", "existing"]) { const x = input(); x[field] = proxy; refuses(() => planGroupAllocation(x)); }
  for (const field of ["selected", "existing"]) { const x = input(); x[field] = [proxy]; refuses(() => planGroupAllocation(x)); }
  const getter = input(); Object.defineProperty(getter, "selected", { enumerable: true, get() { calls++; return []; } }); refuses(() => planGroupAllocation(getter));
  const x = input(); Object.defineProperty(x.selected[0].range, "startAt", { enumerable: true, get() { calls++; throw Error("getter"); } }); refuses(() => planGroupAllocation(x)); assert.equal(calls, 0);
});

test("dense array admission rejects holes, extra digit keys, symbols and malformed containers", () => {
  for (const field of ["selected", "existing"]) {
    const sparse = new Array(2); sparse[1] = field === "selected" ? input().selected[0] : prior(); sparse["01"] = sparse[1]; const x = input(); x[field] = sparse; refuses(() => planGroupAllocation(x));
    const extra = input(); extra[field][Symbol("extra")] = true; refuses(() => planGroupAllocation(extra));
    const accessor = input(); let calls = 0; Object.defineProperty(accessor[field], "0", { enumerable: true, get() { calls++; return prior(); } }); refuses(() => planGroupAllocation(accessor)); assert.equal(calls, 0);
  }
});

test("the2000 combined limit is independent of model128KiB and never silently truncates old inventory", () => {
  const x = input(); x.existing = Array.from({ length: 1998 }, (_, i) => prior({ id: "old_" + i, bookingRecordId: "old_booking_" + i, contactId: "old_contact_" + i, targetId: "other_target_" + i }));
  assert(Buffer.byteLength(JSON.stringify(x)) > 128 * 1024); const r = planGroupAllocation(x); assert.equal(r.ready, true); assert.deepEqual(r, planGroupAllocation(input()));
  x.existing.push(prior({ id: "too_many", bookingRecordId: "extra_booking", contactId: "extra_contact", targetId: "extra_target" })); refuses(() => planGroupAllocation(x), "participation_group_allocation_limit");
  const tooSelected = input(11); refuses(() => planGroupAllocation(tooSelected), "participation_group_allocation_limit");
});

test("deterministic frozen output preserves inputs and carries no mutation, authority or inventory digest", () => {
  const x = input(), before = clone(x); x.selected.reverse(); const r = planGroupAllocation(x); assert.deepEqual(r, planGroupAllocation(before)); assert.deepEqual(x.selected.map(x => x.participationId), ids(2).reverse());
  assert(Object.isFrozen(r) && Object.isFrozen(r.counts) && Object.isFrozen(r.selectedIds)); assert.throws(() => { r.selectedIds.push("other"); }, TypeError);
  const old = Date.now; Date.now = () => { throw Error("No wall-clock authority"); }; try { assert.equal(planGroupAllocation(input()).ready, true); } finally { Date.now = old; }
  assert.equal(GROUP_ALLOCATION_LIMITS.inventory, 2000); assert(GROUP_ALLOCATION_CONTRACT.notImplemented.includes("confirmation")); assert(!Object.hasOwn(r, "inventorySha256"));
});
