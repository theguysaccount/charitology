/** Actual policy/route code with closed fake SELECTs and pure range projections.
 * No PostgreSQL, lock/transaction, current session or atomic group proof.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as participation from "../lib/participation.mjs";
import { hash } from "../lib/security.mjs";
import { VOLUNTEER_ORIENTATION_MARKER_SQL } from "../lib/volunteer-orientation-marker.mjs";

const ORG = "fictional_org", member = { role: "owner", programIds: [], revision: 1 };
const at = "2099-01-02T08:00:00.123456Z", expires = "2099-01-02T08:10:00.123456Z";
const code = expected => error => error.code === expected;
const range = (a = "09", b = "11") => ({ startAt: `2099-01-02T${a}:00:00Z`, endAt: `2099-01-02T${b}:00:00Z`, timeZone: "UTC" });
const raw = r => ({ id: r.id, org_id: r.orgId, module_id: r.moduleId, data: r.data, status: r.status, revision: r.revision,
  last_editor_id: r.lastEditedBy, approval: r.approval, snapshot: null, source: null, owner_id: "fictional_staff",
  created_at: new Date("2098-01-01T00:00:00Z"), updated_at: new Date("2098-01-01T00:00:00Z") });
function record(id, moduleId, data, status = "approved") {
  return { id, orgId: ORG, moduleId, data, status, revision: 4, lastEditedBy: "fictional_author",
    approval: { status: "approved", revision: 4, actorId: "fictional_reviewer" } };
}
function fixture({ moduleId = "volunteers", partial = true } = {}) {
  const source = record("target", moduleId, { title: "Fictional occurrence", kind: moduleId === "events" ? "session" : "shift",
    ...range(), capacity: 1, participationPurpose: "Arrange a fictional activity.", participantInstructions: null,
    organizerEmail: "organizer@example.invalid", organizerUrl: null, ...(moduleId === "volunteers" ? { allowPartialIntervals: partial } : {}) },
  moduleId === "events" ? "scheduled" : "open");
  const terms = participation.participationTerms(source), records = [source], waitlist = [], confirmed = [], calls = [];
  const t = { org_id: ORG, target_id: source.id, module_id: moduleId, revision: 2, mode: "managed", recovery_block: false };
  const f = { source, terms, t, records, waitlist, confirmed, calls, member, intake: { status: "converted", cancelled_at: null } };
  f.add = (id, interval = null, state = "waitlisted") => {
    const booking = record(id + "_booking", moduleId, { title: "Fictional candidate", kind: moduleId === "events" ? "registration" : "assignment",
      [moduleId === "events" ? "eventId" : "shiftId"]: source.id, contactId: id + "_contact" });
    const contact = record(id + "_contact", "contacts", { title: "Fictional contact", kind: "person" });
    records.push(booking, contact);
    const p = { org_id: ORG, id, module_id: moduleId, target_id: source.id, booking_record_id: booking.id, contact_id: contact.id,
      intake_id: null, state, source: "staff", revision: 3, recovered: false, frozen: null, requested_interval: interval,
      created_at: new Date("2098-01-01T00:00:00Z"), waitlist_sequence: String(waitlist.length + 1),
      consent: { revision: 1, sourceRevision: source.revision, termsHash: hash(terms), terms: structuredClone(terms),
        at: "2098-01-01T00:00:00Z", waitlistAllowed: true, emailUpdates: false } };
    if (interval) p.consent.allocationHash = participation.participationAllocationHash(source.id, source.revision, hash(terms), interval);
    waitlist.push(p); return p;
  };
  f.c = { async query(sql, values) {
    if (sql === VOLUNTEER_ORIENTATION_MARKER_SQL) return {rows: []};
    calls.push({ sql, values });
    if (sql.startsWith("WITH moment AS MATERIALIZED")) return { rows: [{ at_exact: at, expires_at_exact: expires,
      epoch_microseconds: (BigInt(Date.parse(at.slice(0, 23) + "Z")) * 1000n + 456n).toString(), within_window: true }] };
    if (sql === "SELECT status,cancelled_at FROM os_intake WHERE org_id=$1 AND id=$2") return { rows: f.intake ? [f.intake] : [] };
    if (sql === "SELECT pg_advisory_xact_lock(hashtextextended($1,0))") return { rows: [] };
    if (sql === "SELECT * FROM os_records WHERE org_id=$1 AND deleted_at IS NULL ORDER BY created_at,id") return { rows: records.map(raw) };
    if (sql === "SELECT * FROM os_participation_targets WHERE org_id=$1 AND target_id=$2") return { rows: [t] };
    if (sql === "SELECT p.*,i.status AS intake_status,i.cancelled_at AS intake_cancelled_at,i.revision AS intake_revision FROM os_participations p LEFT JOIN os_intake i ON i.org_id=p.org_id AND i.id=p.intake_id WHERE p.org_id=$1 AND p.target_id=$2 ORDER BY p.waitlist_sequence NULLS LAST,p.created_at,p.id") return { rows: waitlist };
    if (sql === "SELECT * FROM os_participations WHERE org_id=$1 AND state='confirmed'") return { rows: confirmed };
    if (sql === "SELECT target_id FROM os_participation_targets WHERE org_id=$1") return { rows: [{ target_id: source.id }] };
    throw new Error("Unexpected closed read-only seam SQL: " + sql);
  } };
  f.input = p => ({ revision: p.revision, targetRevision: t.revision, candidateRevision: 4, consentRevision: p.consent.revision,
    ...(p.requested_interval ? { allocationHash: p.consent.allocationHash } : {}) });
  f.read = async (p, patch = {}) => participation.readParticipationAdmissionEligibility({ c: f.c, org: ORG, member, source, t, records, p,
    input: f.input(p), action: p.state === "waitlisted" ? "promote" : "confirm", serverClock: await participation.readParticipationDomainClock(f.c), ...patch });
  f.hint = () => participation.suggestParticipationFromInventory({ source, records, member, orderedWaitlist: waitlist,
    removedWaitlistIds: [], confirmed: confirmed.map(projection), unmanaged: [] });
  f.legacyHint = async () => (await (await participation.participationRoutes({ c: f.c, org: ORG, user: "fictional_staff", member, method: "GET",
    tail: "participation-targets/target/participations", url: new URL("https://os.example.invalid/api/orgs/fictional_org/participation-targets/target/participations") })).json()).suggestedWaitlistId;
  return f;
}
const projection = p => ({ participationId: p.id, contactId: p.contact_id, targetId: p.target_id, moduleId: p.module_id,
  range: p.frozen?.interval || p.frozen?.terms });
const candidate = p => ({ participationId: p.id, bookingRecordId: p.booking_record_id, contactId: p.contact_id, targetId: p.target_id,
  moduleId: p.module_id, range: p.requested_interval || range() });
const partial = (a, b) => ({ version: 1, ...range(a, b) });

test("new eligibility is a detached read-only result and never an allocation/command", async () => {
  const f = fixture(), p = f.add("one", partial("09", "10"), "requested");
  const before = structuredClone(p), result = await f.read(p);
  assert.deepEqual(Object.keys(result).sort(), ["action", "participationId", "terms", "termsHash"]);
  assert.equal(result.action, "confirm"); assert.equal(result.participationId, p.id);
  assert.deepEqual(result.terms, f.terms); assert.equal(result.termsHash, hash(f.terms));
  assert.notEqual(result.terms, f.terms); assert(Object.isFrozen(result)); assert(Object.isFrozen(result.terms.intervalPolicy));
  assert.deepEqual(p, before); assert.equal(f.calls.length, 1, "SQL clock only when there is no intake");
  assert(f.calls.every(x => x.sql.startsWith("WITH moment")));
});

test("new read eligibility rejects wrong-client/copied clocks and unsupported actions without side effects", async () => {
  const f = fixture(), p = f.add("one"), clock = await participation.readParticipationDomainClock(f.c);
  for (const serverClock of [undefined, { ...clock }, await participation.readParticipationDomainClock(fixture().c)])
    await assert.rejects(f.read(p, { serverClock }), code("participation_clock"));
  for (const action of ["waitlist", "cancel", "consent", undefined])
    await assert.rejects(f.read(p, { action }), code("participation_action"));
  assert(f.calls.every(x => x.sql.startsWith("WITH moment")));
});

test("typed visibility/permission failures precede clocks, eligibility and intake disclosure", async () => {
  const f = fixture(), p = f.add("one"); p.intake_id = "fictional_intake";
  const clock = await participation.readParticipationDomainClock(f.c); f.calls.length = 0;
  const args = { c: f.c, org: ORG, member, source: f.source, t: f.t, records: f.records, p, input: f.input(p), action: "promote", serverClock: clock };
  for (const patch of [{ org: "another_org" }, { p: { ...p, target_id: "other_target" } }, { t: { ...f.t, module_id: "events" } },
    { records: f.records.filter(x => x.id !== p.contact_id) }])
    await assert.rejects(participation.readParticipationAdmissionEligibility({ ...args, ...patch }), code("participation"));
  await assert.rejects(participation.readParticipationAdmissionEligibility({ ...args, member: { role: "viewer", programIds: [] } }), code("role"));
  assert.equal(f.calls.length, 0);
});

test("read admission keeps every submitted revision and current approval check", async () => {
  for (const field of ["revision", "targetRevision", "candidateRevision", "consentRevision"]) {
    const f = fixture(), p = f.add("one");
    await assert.rejects(f.read(p, { input: { ...f.input(p), [field]: 0 } }), code("revision"));
  }
  for (const [change, expected] of [
    [(f) => { f.source.approval = null; }, "participation_approval"],
    [(f) => { f.records[1].approval = null; }, "participation_candidate"],
    [(f, p) => { p.recovered = true; }, "participation_state"],
    [(f, p) => { p.state = "cancelled"; }, "participation_state"],
  ]) { const f = fixture(), p = f.add("one"); change(f, p); await assert.rejects(f.read(p), code(expected)); }
});

test("missing or mismatched partial consent terms stay hint-eligible but not fully eligible", async () => {
  for (const terms of [undefined, { fictional: "changed terms" }]) {
    const f = fixture(), p = f.add("one", partial("09", "10"));
    if (terms === undefined) delete p.consent.terms; else p.consent.terms = terms;
    assert.equal(await f.legacyHint(), p.id); assert.equal(f.hint(), p.id);
    await assert.rejects(f.read(p), code("participation_consent"));
  }
});

test("intake LEFT JOIN hint and strict admission retain their distinct withdrawal policies", async () => {
  const f = fixture(), p = f.add("one"); p.intake_id = "fictional_intake";
  p.intake_status = "converted"; p.intake_cancelled_at = "2098-02-01T00:00:00Z";
  f.intake.cancelled_at = p.intake_cancelled_at;
  assert.equal(await f.legacyHint(), p.id); assert.equal(f.hint(), p.id);
  await assert.rejects(f.read(p), code("participation_withdrawn"));
  f.intake = null; delete p.intake_status; delete p.intake_cancelled_at;
  assert.equal(await f.legacyHint(), p.id); assert.equal(f.hint(), p.id);
  await assert.rejects(f.read(p), code("participation"));
});

test("cancelled intake hint excludes unacknowledged or later withdrawal but permits a renewed affirmation", async () => {
  const f = fixture(), p = f.add("one"); p.intake_status = "cancelled";
  for (const cancelled of [null, "2098-02-01T00:00:00Z"]) {
    p.intake_cancelled_at = cancelled; assert.equal(await f.legacyHint(), null); assert.equal(f.hint(), null);
  }
  p.intake_cancelled_at = "2097-01-01T00:00:00Z";
  assert.equal(await f.legacyHint(), p.id); assert.equal(f.hint(), p.id);
});

test("false renewed waitlist permission excludes the hint but explicit promotion remains eligible with a reason", async () => {
  const f = fixture(), p = f.add("one"); p.consent.waitlistAllowed = false;
  assert.equal(await f.legacyHint(), null); assert.equal(f.hint(), null);
  assert.equal((await f.read(p)).action, "promote");
  assert.throws(() => participation.requireParticipationPromotionReason({ participationId: p.id, suggestedId: null, reason: " " }), code("participation_text"));
  const reason = "  Explicit fictional reason\n  ";
  assert.equal(participation.requireParticipationPromotionReason({ participationId: p.id, suggestedId: null, reason }), undefined);
  assert.equal(reason, "  Explicit fictional reason\n  ", "the old audit input is not rewritten");
});

test("old hints on completed/past sources are not upgraded to command eligibility", async () => {
  const f = fixture(), p = f.add("one"); f.source.status = "completed";
  assert.equal(await f.legacyHint(), p.id); assert.equal(f.hint(), p.id);
  await assert.rejects(f.read(p), code("participation_approval"));
  f.source.status = "open"; f.source.data.startAt = "2000-01-02T09:00:00Z"; f.source.data.endAt = "2000-01-02T11:00:00Z";
  const terms = participation.participationTerms(f.source); p.consent.termsHash = hash(terms); p.consent.terms = terms;
  assert.equal(await f.legacyHint(), p.id); assert.equal(f.hint(), p.id);
  await assert.rejects(f.read(p), code("participation_started"));
});

test("partial allocation mismatches are skipped by hints and fail specific current consent/read review", async () => {
  const f = fixture(), p = f.add("one", partial("09", "10")); p.consent.allocationHash = "0".repeat(64);
  assert.equal(await f.legacyHint(), null); assert.equal(f.hint(), null);
  await assert.rejects(f.read(p), code("participation_consent"));
  p.consent.allocationHash = participation.participationAllocationHash(f.source.id, f.source.revision, hash(f.terms), p.requested_interval);
  await assert.rejects(f.read(p, { input: { ...f.input(p), allocationHash: "0".repeat(64) } }), code("participation_interval"));
});

test("read-only intake SELECT preserves its exact ordering and driver errors propagate", async () => {
  const f = fixture(), p = f.add("one"); p.intake_id = "fictional_intake";
  await f.read(p);
  assert.equal(f.calls[1].sql, "SELECT status,cancelled_at FROM os_intake WHERE org_id=$1 AND id=$2");
  assert.deepEqual(f.calls[1].values, [ORG, "fictional_intake"]); assert.equal(f.calls.length, 2);
  const failure = new Error("Fictional driver failure"), original = f.c.query;
  f.c.query = async (...args) => { if (args[0].startsWith("SELECT status")) throw failure; return original(...args); };
  await assert.rejects(f.read(p), e => e === failure);
});

test("read eligibility does not quietly promise a place when allocation capacity is unknown", async () => {
  const f = fixture(), p = f.add("one"); f.source.data.capacity = null;
  assert.equal((await f.read(p)).participationId, p.id);
  assert(!f.calls.some(x => x.sql.includes("state='confirmed'")));
  assert.throws(() => participation.assertParticipationAllocationCandidate({ candidate: candidate(p), capacity: null, confirmed: [], unmanaged: [] }), code("participation_capacity"));
});

test("old hint capacity validation occurs before confirmed SELECT and preserves per-candidate SQL", async () => {
  const f = fixture(), p = f.add("one");
  f.source.data.capacity = null; assert.equal(await f.legacyHint(), null);
  assert(!f.calls.some(x => x.sql.includes("state='confirmed'")));
  f.source.data.capacity = 1; f.calls.length = 0; assert.equal(await f.legacyHint(), p.id);
  const suffix = f.calls.slice(-3).map(x => x.sql);
  assert(suffix[0].startsWith("SELECT p.*,i.status AS intake_status"));
  assert.equal(suffix[1], "SELECT * FROM os_participations WHERE org_id=$1 AND state='confirmed'");
  assert.equal(suffix[2], "SELECT target_id FROM os_participation_targets WHERE org_id=$1");
});

test("irrelevant malformed saved ranges are never eagerly validated on the old path", async () => {
  const f = fixture(), p = f.add("one");
  f.confirmed.push({ id: "unrelated", target_id: "other", contact_id: "other_person", module_id: "volunteers", frozen: null });
  assert.equal(await f.legacyHint(), p.id);
  assert.equal(f.hint(), p.id);
});

test("old capacity refusal precedes later same-contact malformed managed ranges and unmanaged SELECT", async () => {
  const f = fixture(), p = f.add("one", null, "requested");
  f.confirmed.push({ id: "full_target", target_id: p.target_id, contact_id: "different", module_id: "volunteers", frozen: { terms: f.terms } },
    { id: "bad_later", target_id: "another_shift", contact_id: p.contact_id, module_id: "volunteers", frozen: null });
  await assert.rejects(participation.applyParticipationDomainCommand({ c: f.c, org: ORG, user: "fictional_staff", member,
    source: f.source, t: f.t, records: f.records, p, input: { ...f.input(p), idempotencyKey: "fictional-seam-command-1234" }, action: "confirm",
    serverClock: await participation.readParticipationDomainClock(f.c) }), code("participation_capacity"));
  assert.deepEqual(f.calls.slice(1).map(x => x.sql), ["SELECT * FROM os_participations WHERE org_id=$1 AND state='confirmed'"]);
  assert.equal(p.state, "requested"); assert.equal(p.last_command, undefined);
});

test("missing unmanaged shift keeps old skip behavior but new applicable projection requires reconciliation", async () => {
  const f = fixture(), p = f.add("one");
  f.records.push(record("orphan_assignment", "volunteers", { title: "Fictional saved assignment", kind: "assignment", shiftId: "missing_shift", contactId: p.contact_id }, "assigned"));
  assert.equal(await f.legacyHint(), p.id);
  assert.throws(() => participation.assertParticipationAllocationCandidate({ candidate: candidate(p), capacity: 1, confirmed: [],
    unmanaged: [{ bookingRecordId: "orphan_assignment", contactId: p.contact_id, targetId: "missing_shift", range: null }] }), code("participation_interval"));
});

test("single-candidate pure assertion preserves half-open adjacency, capacity and duplicate error precedence", () => {
  const f = fixture(), p = f.add("one", partial("10", "11")), c = candidate(p);
  const old = { participationId: "existing", targetId: p.target_id, contactId: "other_contact", moduleId: "volunteers", range: range("09", "10") };
  assert.equal(participation.assertParticipationAllocationCandidate({ candidate: c, capacity: 1, confirmed: [old], unmanaged: [] }), undefined);
  assert.throws(() => participation.assertParticipationAllocationCandidate({ candidate: c, capacity: 1,
    confirmed: [{ ...old, contactId: p.contact_id, range: range("10", "11") }], unmanaged: [] }), code("participation_capacity"));
  assert.throws(() => participation.assertParticipationAllocationCandidate({ candidate: c, capacity: 2,
    confirmed: [{ ...old, contactId: p.contact_id }], unmanaged: [] }), code("participation_duplicate"));
  for (const capacity of [null, 0, -1, 1.5])
    assert.throws(() => participation.assertParticipationAllocationCandidate({ candidate: c, capacity, confirmed: [], unmanaged: [] }), code("participation_capacity"));
});

test("managed and unmanaged cross-shift overlap rules apply only to the same selected volunteer", () => {
  const f = fixture(), p = f.add("one"), c = candidate(p);
  const old = { participationId: "existing", targetId: "another_shift", contactId: p.contact_id, moduleId: "volunteers", range: range() };
  assert.throws(() => participation.assertParticipationAllocationCandidate({ candidate: c, capacity: 2, confirmed: [old], unmanaged: [] }), code("participation_overlap"));
  assert.throws(() => participation.assertParticipationAllocationCandidate({ candidate: c, capacity: 2, confirmed: [], unmanaged: [
    { bookingRecordId: "other_booking", targetId: "another_shift", contactId: p.contact_id, range: range() }] }), code("participation_overlap"));
  assert.equal(participation.assertParticipationAllocationCandidate({ candidate: c, capacity: 2, confirmed: [{ ...old, contactId: "other" }], unmanaged: [] }), undefined);
});

test("virtual waitlist preserves supplied SQL order, removals and exact caller objects", () => {
  const f = fixture(), a = f.add("z_first"), b = f.add("a_second");
  a.waitlist_sequence = "9007199254740993"; b.waitlist_sequence = "9007199254740992";
  const before = structuredClone(f.waitlist); assert.equal(f.hint(), a.id);
  assert.equal(participation.suggestParticipationFromInventory({ source: f.source, records: f.records, member, orderedWaitlist: f.waitlist,
    removedWaitlistIds: new Set([a.id]), confirmed: [], unmanaged: [] }), b.id);
  assert.deepEqual(f.waitlist, before);
});

test("an earlier unselected candidate can change the second promotion reason after a prospective interval", () => {
  const f = fixture(), earlier = f.add("earlier", { version: 1, ...range("09", "11"), startAt: "2099-01-02T09:30:00Z", endAt: "2099-01-02T10:30:00Z" }),
    a = f.add("first_selected", partial("09", "10")), b = f.add("second_selected", partial("10", "11"));
  assert.equal(f.hint(), earlier.id);
  assert.throws(() => participation.requireParticipationPromotionReason({ participationId: a.id, suggestedId: f.hint(), reason: null }), code("participation_text"));
  const next = participation.suggestParticipationFromInventory({ source: f.source, records: f.records, member, orderedWaitlist: f.waitlist,
    removedWaitlistIds: [a.id], confirmed: [{ ...candidate(a), participationId: a.id }].map(({ bookingRecordId, ...row }) => row), unmanaged: [] });
  assert.equal(next, b.id);
  assert.equal(participation.requireParticipationPromotionReason({ participationId: b.id, suggestedId: next, reason: null }), undefined);
  assert.equal(earlier.state, "waitlisted"); assert.equal(a.state, "waitlisted"); assert.equal(b.state, "waitlisted");
});

test("virtual hints skip only the legacy allocation codes, not unexpected inventory errors", () => {
  const f = fixture(), p = f.add("one");
  const failure = new Error("Fictional malformed context"), projection = { participationId: "old", targetId: "target", contactId: "other", moduleId: "volunteers",
    get range() { throw failure; } };
  assert.throws(() => participation.suggestParticipationFromInventory({ source: f.source, records: f.records, member, orderedWaitlist: f.waitlist,
    removedWaitlistIds: [], confirmed: [projection], unmanaged: [] }), e => e === failure);
  assert.equal(p.state, "waitlisted");
});
