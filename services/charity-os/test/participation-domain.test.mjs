import test from "node:test";
import assert from "node:assert/strict";
import {
  applyParticipationDomainCommand,
  readParticipationDomainClock,
  participationAllocationHash,
  participationIntent,
  participationRoutes,
  participationTerms,
} from "../lib/participation.mjs";
import { hash } from "../lib/security.mjs";

// Closed fake SQL command fixtures only. These exercise the actual domain,
// validators, record saves, audits and outbox code, not PostgreSQL/RLS, physical
// byte measurements, transaction rollback/COMMIT or real session authority.
const ORG = "fixture_org", USER = "fixture_staff";
const AT = "2099-01-02T08:59:59.999999Z";
const EXPIRES = "2099-01-02T09:09:59.999999Z";
const member = { userId: USER, role: "owner", programIds: [], revision: 1 };
const key = "fictional-command-key-1234";
const code = (value) => (error) => error.code === value;
const micros = (stamp) =>
  BigInt(Date.parse(stamp.slice(0, 23) + "Z")) * 1000n + BigInt(stamp.slice(23, 26));
function clockRow(at = AT, expires = EXPIRES, within = true) {
  return {
    at_exact: at, expires_at_exact: expires,
    epoch_microseconds: micros(at).toString(), within_window: within,
  };
}
function record(id, moduleId, data, status = "approved") {
  return {
    id, orgId: ORG, moduleId, data, status, revision: 4,
    ownerId: USER, lastEditedBy: "fixture_author",
    approval: { status: "approved", revision: 4, actorId: "fixture_reviewer" },
    snapshot: null, source: null,
    createdAt: "2098-01-01T00:00:00.000Z", updatedAt: "2098-01-01T00:00:00.000Z",
  };
}
function raw(r) {
  return {
    org_id: r.orgId, id: r.id, module_id: r.moduleId, data: r.data,
    status: r.status, revision: r.revision, owner_id: r.ownerId,
    last_editor_id: r.lastEditedBy, approval: r.approval,
    snapshot: r.snapshot, source: r.source,
    created_at: new Date(r.createdAt), updated_at: new Date(r.updatedAt),
  };
}
function fixture({ moduleId = "events", state = "requested", usage = 0,
  duplicateJournal = false, throwAt = null, at = AT, expires = EXPIRES,
  within = true, extra = [] } = {}) {
  const source = record("target", moduleId, {
    title: "Fictional occurrence", kind: moduleId === "events" ? "session" : "shift",
    startAt: "2099-01-02T09:00:00.000Z", endAt: "2099-01-02T11:00:00.000Z",
    timeZone: "UTC", capacity: 2, participationPurpose: "Fictional scheduling only.",
    participantInstructions: null, organizerEmail: "organizer@example.invalid", organizerUrl: null,
  }, moduleId === "events" ? "scheduled" : "open");
  const candidate = record("booking", moduleId, {
    title: "Fictional candidate", kind: moduleId === "events" ? "registration" : "assignment",
    [moduleId === "events" ? "eventId" : "shiftId"]: "target", contactId: "contact",
  });
  const contact = record("contact", "contacts", { title: "Fictional contact", kind: "person" });
  const records = [source, candidate, contact, ...extra];
  const terms = participationTerms(source);
  const target = {
    org_id: ORG, target_id: source.id, module_id: moduleId, revision: 2,
    mode: "managed", recovery_block: false, source_revision: source.revision,
    terms, terms_hash: hash(terms), created_at: new Date("2098-01-01T00:00:00Z"),
  };
  const p = {
    org_id: ORG, id: "person", target_id: source.id, module_id: moduleId,
    booking_record_id: candidate.id, contact_id: contact.id, intake_id: null,
    source: "staff", revision: 3, state, recovered: false, recovered_state: null,
    requested_interval: null, waitlist_sequence: state === "waitlisted" ? 2 : null,
    consent: { revision: 1, sourceRevision: source.revision, termsHash: hash(terms),
      at: "2098-01-01T00:00:00.000Z", waitlistAllowed: true, emailUpdates: false },
    frozen: null, confirmed_at: null, cancelled_at: null, last_command: null,
    created_at: new Date("2098-01-01T00:00:00Z"),
  };
  const db = { rows: [p], journal: [], audits: [], calls: [], rawRecords: records.map(raw),
    intake: { status: "converted", cancelled_at: null }, quotaFull: false };
  const c = {
    async query(sql, values = []) {
      db.calls.push({ sql, values: structuredClone(values) });
      if (throwAt && sql.startsWith(throwAt)) throw new Error("Fictional SQL failure");
      // The historical single-person fixture has no group containers.
      if (sql === "SELECT count(*)::int AS count FROM os_participation_groups WHERE org_id=$1")
        return { rows: [{ count: 0 }], rowCount: 1 };
      if (sql.startsWith("WITH moment AS MATERIALIZED"))
        return { rows: [clockRow(at, expires, within)] };
      if (sql === "SELECT * FROM os_records WHERE org_id=$1 AND deleted_at IS NULL ORDER BY created_at,id")
        return { rows: db.rawRecords };
      if (sql === "SELECT * FROM os_records WHERE org_id=$1 AND id=$2 AND deleted_at IS NULL")
        return { rows: db.rawRecords.filter((r) => r.id === values[1]) };
      if (sql.startsWith("SELECT * FROM os_participation_targets WHERE org_id=$1 AND target_id=$2"))
        return { rows: [target] };
      if (sql === "SELECT * FROM os_participation_targets WHERE org_id=$1 ORDER BY target_id")
        return { rows: [target] };
      if (sql === "SELECT target_id FROM os_participation_targets WHERE org_id=$1")
        return { rows: [{ target_id: target.target_id }] };
      if (sql === "SELECT * FROM os_participations WHERE org_id=$1 AND state='confirmed'")
        return { rows: db.rows.filter((r) => r.state === "confirmed") };
      if (sql === "SELECT * FROM os_participations WHERE org_id=$1 ORDER BY created_at,id")
        return { rows: db.rows };
      if (sql.startsWith("SELECT p.*,i.status AS intake_status")) {
        const rows = sql.includes("p.id=$3") ? db.rows.filter((r) => r.id === values[2]) : db.rows;
        return { rows: [...rows].sort((a, b) =>
          (a.waitlist_sequence ?? Infinity) - (b.waitlist_sequence ?? Infinity) || a.id.localeCompare(b.id)) };
      }
      if (sql === "SELECT status,cancelled_at FROM os_intake WHERE org_id=$1 AND id=$2")
        return { rows: [db.intake] };
      if (sql === "SELECT COALESCE(max(waitlist_sequence),0)+1 AS sequence FROM os_participations WHERE org_id=$1 AND target_id=$2")
        return { rows: [{ sequence: 3 }] };
      if (sql.startsWith("SELECT COALESCE(sum(octet_length(data::text)),0) AS size,count(*)"))
        return { rows: [{ size: 0, count: db.rawRecords.length - 1 }] };
      if (sql.startsWith("INSERT INTO os_records(org_id,id,module_id")) {
        const old = db.rawRecords.find((r) => r.id === values[1]);
        Object.assign(old, { data: JSON.parse(values[3]), status: values[4],
          revision: values[6], approval: values[7] && JSON.parse(values[7]) });
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("SELECT sum(size) AS size FROM (")) return { rows: [{ size: usage }] };
      if (sql.startsWith("INSERT INTO os_events(")) {
        db.audits.push({ action: values[2], recordId: values[3], detail: JSON.parse(values[5]) });
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("SELECT pg_advisory_xact_lock(")) return { rows: [] };
      if (sql === "SELECT * FROM os_participation_delivery_policies WHERE org_id=$1") return { rows: [] };
      if (sql.startsWith("SELECT id FROM os_participation_outbox WHERE org_id=$1 AND participation_id=$2"))
        return { rows: duplicateJournal ? [{ id: "already_recorded" }] : [] };
      if (sql.startsWith("UPDATE os_participation_outbox SET state='cancelled',safe_code='superseded'"))
        return { rows: [], rowCount: 0 };
      if (sql === "SELECT COALESCE(max(event_revision),0)+1 AS revision FROM os_participation_outbox WHERE org_id=$1 AND participation_id=$2")
        return { rows: [{ revision: db.journal.length + 1 }] };
      if (sql.startsWith("SELECT count(*) AS count,COALESCE(sum("))
        return { rows: [{ count: db.quotaFull && sql.includes("FROM os_participation_targets t") ? 501 : 1, bytes: 1000 }] };
      if (sql.startsWith("INSERT INTO os_participation_outbox(")) {
        db.journal.push({ id: values[1], participation_id: values[2], event_revision: values[3],
          participation_revision: values[4], state: values[5], payload: JSON.parse(values[6]),
          intent_kind: values[7], consent_revision: values[8], consent_copy: values[9],
          user_id: values[10], link_id: values[11], link_revision: values[12],
          recipient_hash: values[13], policy_epoch: values[14], template_version: values[15],
          relay_key: values[16], payload_hash: values[17], budget_bytes: values[18],
          created_at: new Date("2099-01-02T08:59:59.999Z") });
        return { rows: [], rowCount: 1 };
      }
      if (sql === "SELECT count(*) AS count FROM os_participation_checkins WHERE org_id=$1")
        return { rows: [{ count: 0 }] };
      if (sql === "SELECT * FROM os_participation_outbox WHERE org_id=$1 ORDER BY created_at,id")
        return { rows: db.journal };
      if (sql.startsWith("UPDATE os_participations SET state=$3")) {
        const row = db.rows.find((r) => r.id === values[1]);
        Object.assign(row, { state: values[2], revision: values[3],
          consent: values[4] && JSON.parse(values[4]), frozen: values[5] && JSON.parse(values[5]),
          waitlist_sequence: values[6], confirmed_at: values[7], cancelled_at: values[8],
          last_command: JSON.parse(values[9]), recovered: values[10], recovered_state: values[11],
          requested_interval: values[12] && JSON.parse(values[12]) });
        return { rows: [{ ...row }] };
      }
      if (sql.startsWith("UPDATE os_participations SET last_command=$3")) {
        const row = db.rows.find((r) => r.id === values[1] && r.last_command.intentHash === values[3]);
        if (!row) return { rows: [] };
        row.last_command = JSON.parse(values[2]);
        return { rows: [{ last_command: row.last_command }] };
      }
      throw new Error("Unhandled closed domain SQL fixture: " + sql);
    },
  };
  const input = { revision: p.revision, targetRevision: target.revision,
    candidateRevision: candidate.revision, consentRevision: p.consent.revision, idempotencyKey: key };
  const args = { c, org: ORG, user: USER, member, settings: {}, source, t: target, records, p, input };
  const route = (action, ownedInput = input) => participationRoutes({
    ...args, tail: `participation-targets/target/participations/person/${action}`,
    method: "POST", input: ownedInput,
  });
  return { ...args, db, candidate, contact, terms, route };
}
async function command(f, action = "confirm", input = f.input, serverClock) {
  return applyParticipationDomainCommand({ ...f, action, input,
    serverClock: serverClock ?? await readParticipationDomainClock(f.c) });
}
const mutations = (f) => f.db.calls.filter(({ sql }) => /^(?:INSERT|UPDATE|DELETE|COMMIT|BEGIN)/.test(sql));

test("domain SQL-clock fixture uses one materialized SQL moment and preserves six digits", async () => {
  const f = fixture();
  const clock = await readParticipationDomainClock(f.c);
  assert.deepEqual(clock, { atExact: AT, expiresAtExact: EXPIRES });
  assert.equal(Object.isFrozen(clock), true);
  assert.equal(f.db.calls.length, 1);
  assert.match(f.db.calls[0].sql, /WITH moment AS MATERIALIZED \(SELECT clock_timestamp\(\) AS n\)/);
  assert.match(f.db.calls[0].sql, /\$1::timestamptz <= n AND n < \$2::timestamptz/);
  assert.match(f.db.calls[0].sql, /\$2::timestamptz - \$1::timestamptz = interval '10 minutes'/);
  assert.deepEqual(f.db.calls[0].values, [null, null]);
  assert.equal(mutations(f).length, 0);
});

test("clock windows reject hostile, nonexact and extra values before SQL without callbacks", async () => {
  let touched = 0;
  const getter = { get issuedAtExact() { touched++; return AT; }, expiresAtExact: EXPIRES };
  const proxy = new Proxy({}, { ownKeys() { touched++; throw Error("trap"); } });
  const symbol = { issuedAtExact: AT, expiresAtExact: EXPIRES, [Symbol()]: true };
  for (const window of [null, [], {}, getter, proxy, symbol,
    { issuedAtExact: AT, expiresAtExact: EXPIRES, extra: true },
    { issuedAtExact: AT.replace(".999999Z", ".999Z"), expiresAtExact: EXPIRES },
    { issuedAtExact: "2099-02-30T08:59:59.999999Z", expiresAtExact: EXPIRES },
    { issuedAtExact: 42, expiresAtExact: EXPIRES },
    { issuedAtExact: AT, expiresAtExact: "2099-01-02T09:09:59.999998Z" },
  ]) {
    const f = fixture();
    await assert.rejects(readParticipationDomainClock(f.c, window), code("participation_clock"));
    assert.equal(f.db.calls.length, 0);
  }
  assert.equal(touched, 0);
});

test("exact preview-window parameters and SQL false are respected, including expiry equality", async () => {
  const f = fixture();
  const window = { issuedAtExact: AT, expiresAtExact: EXPIRES };
  await readParticipationDomainClock(f.c, window);
  assert.deepEqual(f.db.calls[0].values, [AT, EXPIRES]);
  const expired = fixture({ at: EXPIRES, expires: "2099-01-02T09:19:59.999999Z", within: false });
  await assert.rejects(readParticipationDomainClock(expired.c, window), code("participation_clock"));
  assert.equal(mutations(expired).length, 0);
});

test("SQL processing clocks admit nonzero four-digit calendar years beyond schedule bounds", async () => {
  for (const year of ["0001", "2201", "9999"]) {
    const at = `${year}-01-02T08:59:59.999999Z`;
    const expires = `${year}-01-02T09:09:59.999999Z`;
    const f = fixture({ at, expires });
    const clock = await readParticipationDomainClock(f.c, { issuedAtExact: at, expiresAtExact: expires });
    assert.deepEqual(clock, { atExact: at, expiresAtExact: expires });
    assert.deepEqual(f.db.calls[0].values, [at, expires]);
  }
  const zero = fixture();
  await assert.rejects(readParticipationDomainClock(zero.c, {
    issuedAtExact: "0000-01-02T08:59:59.999999Z",
    expiresAtExact: "0000-01-02T09:09:59.999999Z",
  }), code("participation_clock"));
  assert.equal(zero.db.calls.length, 0);
  const futureCancel = fixture({ state: "confirmed", usage: 61 * 1024 * 1024,
    at: "2201-01-02T08:59:59.999999Z", expires: "2201-01-02T09:09:59.999999Z" });
  const result = await command(futureCancel, "cancel", {
    revision: 3, reason: "Fictional later cancellation", idempotencyKey: key,
  });
  assert.equal(result.p.cancelled_at, "2201-01-02T08:59:59.999999Z");
});

test("preview-window fields must both be own enumerable values before SQL", async () => {
  for (const hidden of ["issuedAtExact", "expiresAtExact"]) {
    const f = fixture();
    const window = { issuedAtExact: AT, expiresAtExact: EXPIRES };
    Object.defineProperty(window, hidden, { value: window[hidden], enumerable: false });
    await assert.rejects(readParticipationDomainClock(f.c, window), code("participation_clock"));
    assert.equal(f.db.calls.length, 0);
  }
});

test("clock rejects malformed driver results and preserves SQL failures", async () => {
  for (const patch of [
    { at_exact: "2099-02-30T08:59:59.999999Z" },
    { expires_at_exact: "2099-01-02T09:09:59.999998Z" },
    { epoch_microseconds: "1" }, { epoch_microseconds: 1 },
    { epoch_microseconds: "01" }, { within_window: "true" },
  ]) {
    const c = { query: async () => ({ rows: [{ ...clockRow(), ...patch }] }) };
    await assert.rejects(readParticipationDomainClock(c), code("participation_clock"));
  }
  await assert.rejects(readParticipationDomainClock({ query: async () => ({ rows: [] }) }), code("participation_clock"));
  const failure = new Error("fictional connection refusal");
  await assert.rejects(readParticipationDomainClock({ query: async () => { throw failure; } }), (e) => e === failure);
});

test("exported command rejects plain, copied, absent and wrong-client clocks and unknown actions", async () => {
  const f = fixture(), other = fixture();
  const clock = await readParticipationDomainClock(f.c);
  for (const serverClock of [undefined, null, {}, { ...clock }, await readParticipationDomainClock(other.c)]) {
    await assert.rejects(applyParticipationDomainCommand({ ...f, action: "confirm", serverClock }), code("participation_clock"));
  }
  for (const action of ["waitlist", "consent", "adopt", "associate", undefined])
    await assert.rejects(applyParticipationDomainCommand({ ...f, action, serverClock: clock }), code("participation_action"));
  assert.equal(mutations(f).length, 0);
});

test("fresh confirm keeps ordinary frozen/last-command semantics and observes a paused journal", async () => {
  const f = fixture();
  const result = await command(f);
  assert.equal(result.replayed, false);
  assert.equal(result.notificationQueued, true);
  assert.equal(result.auditRetained, true);
  assert.equal(result.p.state, "confirmed");
  assert.equal(result.p.revision, 4);
  assert.equal(result.p.confirmed_at, AT);
  assert.deepEqual(result.p.frozen.terms, f.terms);
  assert.equal(result.p.frozen.candidateRevision, 4);
  assert.equal(f.records.find((r) => r.id === "booking").status, "scheduled");
  assert.deepEqual(Object.keys(result.p.last_command).sort(),
    ["action", "actorHash", "intentHash", "payloadHash", "resultRevision"].sort());
  assert.deepEqual(f.db.audits.map((a) => a.action), ["record.transitioned", "participation.confirmed"]);
  assert.equal(f.db.journal.length, 1);
  assert.equal(f.db.journal[0].state, "paused");
  assert.equal(f.db.journal[0].intent_kind, "legacy");
  for (const field of ["user_id", "link_id", "link_revision", "recipient_hash", "policy_epoch", "template_version", "relay_key", "payload_hash"])
    assert.equal(f.db.journal[0][field], null);
  assert.equal(f.db.calls.some(({ sql }) => sql.includes("INSERT INTO os_job_tenants")), false);
  const writes = mutations(f).map(({ sql }) => sql);
  assert.ok(writes[0].startsWith("INSERT INTO os_records"));
  assert.ok(writes[1].startsWith("INSERT INTO os_events"));
  assert.ok(writes[2].startsWith("UPDATE os_participations SET state"));
  assert.ok(writes.at(-1).startsWith("INSERT INTO os_events"));
  assert.equal(writes.some((s) => /^(?:BEGIN|COMMIT|ROLLBACK)/.test(s)), false);
});

test("confirm replay returns unknown outcomes before stale current eligibility without extra writes", async () => {
  const f = fixture();
  const saved = await command(f);
  const count = f.db.calls.length;
  f.source.status = "cancelled"; f.source.approval = null;
  f.p.state = "cancelled"; f.candidate.approval = null;
  const result = await command(f);
  assert.equal(result.replayed, true);
  assert.equal(result.notificationQueued, null);
  assert.equal(result.auditRetained, null);
  assert.deepEqual(result.p.last_command, saved.p.last_command);
  assert.deepEqual(f.db.calls.slice(count).map(({ sql }) => sql.startsWith("WITH moment")), [true]);
  assert.equal(f.db.journal.length, 1);
  assert.equal(f.db.audits.length, 2);
  await assert.rejects(command(f, "confirm", { ...f.input, reason: "changed fields" }), code("participation_intent"));
});

test("SQL eligibility handles one microsecond before start and equality without Node wall time", async () => {
  const original = Date.now;
  Date.now = () => Date.parse("2200-01-01T00:00:00Z");
  try {
    const before = fixture();
    assert.equal((await command(before)).p.state, "confirmed");
    const equal = fixture({ at: "2099-01-02T09:00:00.000000Z", expires: "2099-01-02T09:10:00.000000Z" });
    await assert.rejects(command(equal), code("participation_started"));
    assert.equal(mutations(equal).length, 0);
  } finally { Date.now = original; }
});

test("an invalid source start is refused by typed terms before any domain mutation", async () => {
  const f = fixture();
  f.source.data.startAt = "not-an-instant";
  await assert.rejects(command(f), (error) => error.name === "ModuleValidationError");
  assert.equal(mutations(f).length, 0);
  assert.equal(f.p.state, "requested");
  assert.equal(f.db.journal.length, 0);
});

test("new command retains current revisions, specific consent, approvals and typed scope checks", async () => {
  for (const [change, expected] of [
    [(f) => { f.input.revision--; }, "revision"],
    [(f) => { f.input.targetRevision--; }, "revision"],
    [(f) => { f.input.candidateRevision--; }, "revision"],
    [(f) => { f.input.consentRevision--; }, "revision"],
    [(f) => { f.p.consent.termsHash = "0".repeat(64); }, "participation_consent"],
    [(f) => { f.source.approval = null; }, "participation_approval"],
    [(f) => { f.candidate.approval.actorId = f.candidate.lastEditedBy; }, "participation_candidate"],
    [(f) => { f.candidate.data.eventId = "different_target"; }, "participation"],
    [(f) => { f.contact.moduleId = "programs"; }, "participation"],
    [(f) => { f.p.recovered = true; }, "participation_state"],
    [(f) => { f.p.org_id = "different_org"; }, "participation"],
    [(f) => { f.t.target_id = "different_target"; }, "participation"],
  ]) {
    const f = fixture(); change(f);
    await assert.rejects(command(f), code(expected));
    assert.equal(mutations(f).length, 0, expected);
  }
  const f = fixture();
  f.source.data.programId = "hidden_program";
  await assert.rejects(applyParticipationDomainCommand({ ...f, action: "confirm",
    member: { ...member, programIds: ["other_program"] }, serverClock: await readParticipationDomainClock(f.c) }), code("scope"));
  assert.equal(mutations(f).length, 0);
});

test("specific intake withdrawal and exact child fields cannot be bypassed by the domain caller", async () => {
  const f = fixture();
  f.p.intake_id = "fictional_intake";
  f.db.intake.cancelled_at = "2098-01-02T00:00:00.000Z";
  await assert.rejects(command(f), code("participation_withdrawn"));
  assert.equal(mutations(f).length, 0);
  for (const patch of [{ skipValidation: true }, { participationCommand: true },
    { actor: "different_actor" }, { capacity: 100 }, { consent: true }]) {
    const other = fixture();
    await assert.rejects(command(other, "confirm", { ...other.input, ...patch }), code("participation_fields"));
    assert.equal(mutations(other).length, 0);
  }
});

test("capacity, duplicate contact and managed/unmanaged volunteer overlaps still refuse", async () => {
  for (const [setup, expected] of [
    [(f) => { f.source.data.capacity = 1; f.db.rows.push({ ...f.p, id: "other", contact_id: "other_contact", state: "confirmed", frozen: { terms: f.terms } }); }, "participation_capacity"],
    [(f) => { f.db.rows.push({ ...f.p, id: "other", state: "confirmed", frozen: { terms: f.terms } }); }, "participation_duplicate"],
    [(f) => { f.db.rows.push({ ...f.p, id: "other", target_id: "other_shift", state: "confirmed", frozen: { terms: f.terms } }); }, "participation_overlap"],
    [(f) => { f.records.push(record("other_shift", "volunteers", { ...f.source.data }));
      f.records.push(record("other_assignment", "volunteers", { title: "Fictional other assignment", kind: "assignment", shiftId: "other_shift", contactId: "contact" }, "assigned")); }, "participation_overlap"],
  ]) {
    const f = fixture({ moduleId: "volunteers" }); setup(f);
    await assert.rejects(command(f), code(expected));
    assert.equal(mutations(f).length, 0);
  }
});

test("promote preserves dynamic suggestion and an explicit out-of-order reason", async () => {
  const f = fixture({ state: "waitlisted" });
  const earlier = { ...f.p, id: "earlier", booking_record_id: "earlier_booking", contact_id: "earlier_contact", waitlist_sequence: 1 };
  f.db.rows.push(earlier);
  f.records.push(record("earlier_booking", "events", { ...f.candidate.data, contactId: "earlier_contact" }));
  f.records.push(record("earlier_contact", "contacts", { title: "Fictional earlier contact", kind: "person" }));
  await assert.rejects(command(f, "promote"), code("participation_text"));
  assert.equal(mutations(f).length, 0);
  const result = await command(f, "promote", { ...f.input, reason: "Explicit fictional operational reason" });
  assert.equal(result.p.state, "confirmed");
  assert.equal(earlier.state, "waitlisted");
  assert.equal(f.db.audits.at(-1).detail.reason, "Explicit fictional operational reason");
});

test("partial consent/allocation hash checks and frozen requested interval remain exact", async () => {
  const f = fixture({ moduleId: "volunteers" });
  f.source.data.allowPartialIntervals = true;
  f.terms = participationTerms(f.source);
  f.p.requested_interval = { version: 1, startAt: "2099-01-02T09:30:00Z", endAt: "2099-01-02T10:00:00Z", timeZone: "UTC" };
  f.p.consent.terms = f.terms; f.p.consent.termsHash = hash(f.terms);
  f.p.consent.allocationHash = participationAllocationHash("target", 4, hash(f.terms), f.p.requested_interval);
  await assert.rejects(command(f), code("participation_interval"));
  assert.equal(mutations(f).length, 0);
  const result = await command(f, "confirm", { ...f.input, allocationHash: f.p.consent.allocationHash });
  assert.deepEqual(result.p.frozen.interval, f.p.requested_interval);
  assert.equal(result.p.frozen.allocationHash, f.p.consent.allocationHash);
});

test("cancellation retains safe omitted journal/audit results and needs no fresh approval/start/consent", async () => {
  const f = fixture({ state: "confirmed", usage: 61 * 1024 * 1024 });
  f.p.consent = null; f.source.status = "cancelled"; f.source.approval = null;
  f.t.mode = "paused"; f.t.recovery_block = true;
  const input = { revision: 3, reason: "Explicit fictional cancellation", idempotencyKey: key };
  const result = await command(f, "cancel", input);
  assert.equal(result.p.state, "cancelled");
  assert.equal(result.p.cancelled_at, AT);
  assert.equal(result.notificationQueued, false);
  assert.equal(result.auditRetained, false);
  assert.equal(result.replayed, false);
  assert.equal(f.db.journal.length, 0);
  assert.equal(f.db.audits.length, 0);
  assert.equal(result.p.last_command.notificationQueued, false);
  assert.equal(result.p.last_command.auditRetained, false);
  const count = mutations(f).length;
  const replay = await command(f, "cancel", input);
  assert.equal(replay.replayed, true);
  assert.equal(replay.notificationQueued, false);
  assert.equal(replay.auditRetained, false);
  assert.equal(mutations(f).length, count);
});

test("older cancellation replay retains unknown audit, and NEW cancellation never becomes a no-op", async () => {
  const f = fixture({ state: "cancelled" });
  const input = { revision: 3, reason: "Fictional cancellation", idempotencyKey: key };
  f.p.last_command = { ...participationIntent(input, USER, "cancel"), resultRevision: 4, notificationQueued: true };
  const result = await command(f, "cancel", input);
  assert.equal(result.replayed, true);
  assert.equal(result.notificationQueued, true);
  assert.equal(result.auditRetained, null);
  await assert.rejects(command(f, "cancel", { ...input, idempotencyKey: "different-command-key-1234" }), code("participation_state"));
  assert.equal(mutations(f).length, 0);
});

test("outbox duplicate returns actual false; SQL failures still throw, never warning-success", async () => {
  const f = fixture({ duplicateJournal: true });
  const result = await command(f);
  assert.equal(result.notificationQueued, false);
  assert.equal(result.auditRetained, true);
  assert.equal(f.db.journal.length, 0);
  for (const throwAt of ["INSERT INTO os_records", "INSERT INTO os_events", "INSERT INTO os_participation_outbox"])
    await assert.rejects(command(fixture({ throwAt })), /Fictional SQL failure/);
  const quota = fixture(); quota.db.quotaFull = true;
  await assert.rejects(command(quota), code("participation_quota"));
});

test("old staff confirm/waitlist/cancel envelopes, last-command shapes and local clock remain unchanged", async () => {
  const original = Date.now;
  Date.now = () => Date.parse("2200-01-01T00:00:00Z");
  try { await assert.rejects(fixture().route("confirm"), code("participation_started")); }
  finally { Date.now = original; }
  for (const action of ["confirm", "promote", "waitlist", "cancel"]) {
    const f = fixture({ state: action === "promote" ? "waitlisted" : "requested" });
    const input = action === "cancel" ? { revision: 3, reason: "Fictional cancel", idempotencyKey: key } : f.input;
    const response = await f.route(action, input);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    const result = await response.json();
    assert.deepEqual(Object.keys(result).sort(), action === "cancel"
      ? ["auditRetained", "notificationQueued", "ok", "participation"] : ["ok", "participation"]);
    assert.equal(result.participation.revision, 4);
    assert.equal(result.participation.state, action === "waitlist" ? "waitlisted" : action === "cancel" ? "cancelled" : "confirmed");
    assert.match(action === "cancel" ? f.p.cancelled_at : action === "confirm" ? f.p.confirmed_at : "2099-01-01T00:00:00.000Z", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.equal(f.db.calls.some(({ sql }) => sql.startsWith("WITH moment")), false);
    assert.deepEqual(Object.keys(f.p.last_command).sort(), (action === "cancel"
      ? ["action", "actorHash", "auditRetained", "intentHash", "notificationQueued", "payloadHash", "resultRevision"]
      : ["action", "actorHash", "intentHash", "payloadHash", "resultRevision"]).sort());
    const saved = structuredClone(result);
    const mutationCount = mutations(f).length;
    assert.deepEqual(await (await f.route(action, input)).json(), saved);
    assert.equal(mutations(f).length, mutationCount);
  }
});
