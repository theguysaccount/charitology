import { reservationSchemaSql, legacyReservationLayout } from "./fixtures/resource-reservation-schema.mjs";
/** Controlled fake SQL byte returns, actual native exporter/policy fragments.
 * No PostgreSQL, current permission or complete-reserve proof. */
import test from "node:test";
import assert from "node:assert/strict";
import { measureGroupRemainingParticipationSafety as measure, GROUP_SAFETY_SQL as SQL,
  validateGroupParticipationNotice, canRetainGroupParticipationNotice, canRetainGroupSafetyAudit,
  checkGroupSafetyCapacity, GROUP_NOTICE_SQL } from "../lib/participation-group-safety-capacity.mjs";
import { exportParticipation } from "../lib/participation-backup.mjs";
import { operationalGrowth, learningOperationalParticipationProjectionSQL, learningOperationalOutboxProjectionSQL, LEARNING_OPERATIONAL_CAPACITY as O } from "../lib/learning-capacity.mjs";
import { DELIVERY_TEMPLATE_VERSION } from "../lib/participation-delivery.mjs";
import { validateGroupReceipt } from "../lib/participation-group-model.mjs";
import { GROUP_CAPACITY_SQL } from "../lib/participation-group-capacity.mjs";
import { GROUP_AUDIT_SQL } from "../lib/participation-group-safety-capacity.mjs";
import { PARTICIPATION_REMINDER_LEGACY_SQL } from "../lib/participation-storage.mjs";

const ORG = "fixture_org", MAX = 2147483647, AT = "2026-11-08T00:00:00.000Z", HASH = "a".repeat(64);
const clone = value => structuredClone(value);
const target = { org_id: ORG, target_id: "target", module_id: "volunteers", revision: 1, mode: "managed", source_revision: 1,
  terms: { kind: "shift", title: "Fictional shift", startAt: "2099-01-01T09:00:00Z", endAt: "2099-01-01T12:00:00Z", timeZone: "UTC" }, terms_hash: HASH, recovery_block: false, created_at: AT };
function person(overrides = {}) {
  return { org_id: ORG, id: "person", target_id: "target", module_id: "volunteers", booking_record_id: "booking", contact_id: "contact", intake_id: null,
    state: "requested", revision: 1, source: "staff", consent: null, frozen: null, waitlist_sequence: null, confirmed_at: null, cancelled_at: null,
    created_by: "fixture", created_at: AT, updated_at: AT, recovered: false, recovered_state: null, last_command: null, delivery_consent: null,
    requested_interval: null, reminder_consent: null, ...overrides };
}
function notice(active = false, overrides = {}) {
  return { org_id: ORG, id: "notice", participation_id: "person", event_revision: 1, participation_revision: 1, purpose: "participation", channel: "email", state: "paused",
    payload: { state: "requested", participationId: "person", revision: 1 }, created_at: AT, intent_kind: active ? "snapshot" : "legacy", consent_revision: 0,
    consent_copy: null, user_id: null, link_id: null, link_revision: null, recipient_hash: null, policy_epoch: null, template_version: null, relay_key: null,
    payload_hash: null, first_attempt_at: null, attempts: 0, lease_owner: null, lease_until: null, next_at: AT, last_checked_at: null, safe_code: null,
    provider_event_at: null, budget_bytes: active ? 8192 : 0, recovered_state: null, ...overrides };
}
async function fixture({ active = false, bounded = false, interval = false, noPolicy = false, change = () => {} } = {}) {
  const raw = person(bounded ? { state: "cancelled", revision: MAX, cancelled_at: O.serviceTime } : {});
  const t = clone(target);
  if (interval) { t.terms.intervalPolicy = { version: 1, mode: "within-shift" }; raw.requested_interval = { version: 1, startAt: "2099-01-01T10:00:00Z", endAt: "2099-01-01T11:00:00Z", timeZone: "UTC" }; }
  const outbox = notice(active, bounded ? { state: "cancelled", safe_code: "authority_withdrawn" } : {});
  const sourceClient = { async query(sql) {
    if (sql.includes("FROM os_participation_targets")) return { rows: [t] };
    if (sql.includes("FROM os_participations")) return { rows: [raw] };
    if (sql.includes("FROM os_participation_outbox")) return { rows: [outbox] };
    throw Error("Unexpected native source fixture query");
  } };
  const participation = await exportParticipation(sourceClient, ORG), growth = operationalGrowth(participation);
  const pOp = active && !bounded ? 100 : 0, oOp = active ? 50 : 0;
  const operational = { sourceWireGrowthBytes: growth.sourceWireGrowthBytes, sourceParticipationGrowthBytes: pOp,
    sourceOutboxGrowthBytes: oOp, sourceLogicalGrowthBytes: pOp + oOp };
  const policyNative = noPolicy ? null : { revision: bounded ? MAX : 1, enabled: false, activatedAt: null, templateVersion: DELIVERY_TEMPLATE_VERSION, updatedAt: bounded ? O.serviceTime : AT };
  const record = { id: "booking", orgId: ORG, moduleId: "volunteers", data: { kind: "assignment", shiftId: "target", contactId: "contact", title: "  Literal <field> 🌍  " },
    status: "requested", revision: 1, ownerId: "fixture", lastEditedBy: "fixture", approval: null, snapshot: null, source: null, createdAt: AT, updatedAt: AT };
  const backup = { participation, records: [record], trash: [], delivery: { version: 1, policy: policyNative } };
  const terminal = { ...clone(raw), state: "cancelled", revision: MAX, cancelled_at: bounded ? raw.cancelled_at : O.serviceTime,
    updated_at: O.serviceTime, consent: raw.consent ? { ...raw.consent, emailUpdates: false } : null };
  const calls = [];
  const c = { async query(sql, args) {
    calls.push({ sql, args: clone(args) }); assert(sql.startsWith("SELECT") || sql.startsWith("WITH"));
    let rows, phase;
    if (sql === SQL.participations) {
      const actual = 1000, op = actual + pOp, projected = bounded ? op : op + 200;
      rows = [{ id: raw.id, row: clone(raw), future_row: clone(terminal), actual: String(actual), actual_raw: String(actual + 48),
        operational: String(op), operational_raw: String(op + 48), projected: String(projected), projected_raw: String(projected + 48) }]; phase = "people";
    } else if (sql === SQL.bookings) {
      rows = bounded ? [] : [{ id: "booking", row: { org_id: ORG, id: "booking" }, future_row: { org_id: ORG, id: "booking" }, actual: "500", projected: "550" }]; phase = "bookings";
    } else if (sql === SQL.policy) {
      rows = [{ present: !noPolicy, row: {}, future_row: { org_id: ORG, revision: MAX, enabled: false, epoch: "f".repeat(32), activated_at: null, template_version: DELIVERY_TEMPLATE_VERSION, last_command: {}, updated_at: O.serviceTime },
        actual: noPolicy ? "0" : "200", projected: bounded ? "200" : "230" }]; phase = "policy";
    } else if (sql === SQL.outbox) {
      rows = [{ id: "notice", actual: "500", actual_raw: "500", operational: String(500 + oOp), projected: String(500 + oOp + (bounded || active ? 0 : 40)) }]; phase = "outbox";
    } else throw Error("Unexpected safety fixture SQL");
    const replacement = change(rows, phase); return { rows: replacement === undefined ? rows : replacement };
  } };
  return { c, backup, operational, calls, terminal, raw };
}

test("legacy suppression and remaining p/booking/policy growth are actual-return deltas, not full constants", async () => {
  const f = await fixture(), before = JSON.stringify(f.backup), result = await measure(f.c, ORG, { backup: f.backup, operational: f.operational });
  assert.equal(result.remainingParticipationGrowthAboveOperational, 200);
  assert.equal(result.bookingRetainedGrowth, 50); assert.equal(result.policyRetainedGrowth, 30);
  assert.equal(result.remainingSuppressionGrowthAboveOperational, 40); assert.equal(result.retainedGrowthAboveOperational, 320);
  assert(result.nativeSuppressionGrowth > 0); assert(result.nativePeopleGrowth > 0);
  assert.equal(result.actualParticipationRawBytes - result.actualParticipationChargedBytes, 48);
  assert.equal(JSON.stringify(f.backup), before); assert(!Object.isFrozen(f.backup));
});

test("existing operational growth is reconciled and counted only as its baseline", async () => {
  const f = await fixture({ active: true }), r = await measure(f.c, ORG, { backup: f.backup, operational: f.operational });
  assert.equal(r.existingOperationalParticipationGrowth, 100); assert.equal(r.existingOperationalOutboxGrowth, 50);
  assert.equal(r.remainingSuppressionGrowthAboveOperational, 0); assert.equal(r.nativeSuppressionGrowth, 0);
  assert.equal(r.retainedGrowthAboveOperational, 280);
  assert(SQL.participations.includes(learningOperationalParticipationProjectionSQL().base));
  assert(SQL.participations.includes(learningOperationalParticipationProjectionSQL().changed));
  assert(SQL.outbox.includes(learningOperationalOutboxProjectionSQL()));
});

test("already consumed terminal metadata has zero measured remaining growth instead of repurchasing constants", async () => {
  const f = await fixture({ bounded: true }), r = await measure(f.c, ORG, { backup: f.backup, operational: f.operational });
  assert.equal(r.remainingParticipationGrowthAboveOperational, 0); assert.equal(r.bookingRetainedGrowth, 0);
  assert.equal(r.policyRetainedGrowth, 0); assert.equal(r.remainingSuppressionGrowthAboveOperational, 0);
  assert.equal(r.retainedGrowthAboveOperational, 0); assert.equal(r.nativeGrowthAboveOperational, 0);
});

test("absent policy reserves its possible first disabled row once without creating a policy", async () => {
  const f = await fixture({ noPolicy: true }), r = await measure(f.c, ORG, { backup: f.backup, operational: f.operational });
  assert.equal(r.policyRetainedGrowth, 230); assert(r.policyNativeGrowth > 0);
  assert.equal(f.backup.delivery.policy, null); assert(f.calls.every(call => !/INSERT|UPDATE|DELETE/.test(call.sql)));
});

test("actual exporter retains v3 requested interval/history strings and source remains unchanged", async () => {
  const f = await fixture({ interval: true }), before = JSON.stringify(f.backup);
  assert.equal(f.backup.participation.version, 3);
  const r = await measure(f.c, ORG, { backup: f.backup, operational: f.operational });
  assert(r.nativePeopleGrowth > 0); assert.equal(JSON.stringify(f.backup), before);
  assert.deepEqual(f.terminal.requested_interval, f.raw.requested_interval);
});

test("stale current/operational snapshot, missing rows and actual family overflow refuse", async () => {
  for (const phase of ["people", "bookings", "policy", "outbox"]) {
    const f = await fixture({ change: (rows, name) => name === phase ? [] : rows });
    await assert.rejects(measure(f.c, ORG, { backup: f.backup, operational: f.operational }));
  }
  const wrong = await fixture({ active: true }); wrong.operational.sourceParticipationGrowthBytes++;
  await assert.rejects(measure(wrong.c, ORG, { backup: wrong.backup, operational: wrong.operational }), e => e.code === "participation_group_safety_capacity");
  for (const name of ["people", "outbox"]) {
    const f = await fixture({ change: (rows, phase) => phase === name ? rows.map(r => ({ ...r, projected: String(8 * 1024 * 1024 + 1) })) : rows });
    await assert.rejects(measure(f.c, ORG, { backup: f.backup, operational: f.operational }));
  }
});

test("raw query failures propagate without logging; no wall clock or source authority is minted", async () => {
  const f = await fixture(), clock = Date.now; Date.now = () => { throw Error("No current clock"); };
  try { const r = await measure(f.c, ORG, { backup: f.backup, operational: f.operational }); assert(Object.isFrozen(r)); }
  finally { Date.now = clock; }
  const error = Error("Fictional query failure");
  await assert.rejects(measure({ query: async () => { throw error; } }, ORG, { backup: f.backup, operational: f.operational }), value => value === error);
});

const insertKeys = ["org_id", "id", "participation_id", "event_revision", "participation_revision", "purpose", "channel", "state", "payload", "intent_kind", "consent_revision", "consent_copy", "user_id", "link_id", "link_revision", "recipient_hash", "policy_epoch", "template_version", "relay_key", "payload_hash", "budget_bytes"];
const insert = active => {
  const row = notice(active);
  if (active) Object.assign(row, { state: "pending", consent_revision: 1, consent_copy: "participation-email-v1", user_id: "user", link_id: "link", link_revision: 1,
    recipient_hash: HASH, policy_epoch: "f".repeat(32), template_version: DELIVERY_TEMPLATE_VERSION, relay_key: "participation-" + "f".repeat(32), payload_hash: HASH });
  return Object.fromEntries(insertKeys.map(key => [key, row[key]]));
};

test("notice storage admission owns the exact21 actual INSERT fields and preserves inactive/live distinction", () => {
  for (const active of [false, true]) {
    const original = insert(active), before = JSON.stringify(original), result = validateGroupParticipationNotice(original, ORG);
    assert.deepEqual(result, original); assert.notEqual(result, original); assert(Object.isFrozen(result.payload));
    assert.equal(JSON.stringify(original), before);
  }
  assert(GROUP_NOTICE_SQL.includes("transaction_timestamp()"));
  assert(GROUP_NOTICE_SQL.includes(learningOperationalOutboxProjectionSQL()));
});

test("notice rejects override columns, wrong links/hash/payload/revision without invoking hostile data", () => {
  for (const change of [r => { r.created_at = AT; }, r => { r.next_at = AT; }, r => { r.org_id = "other"; }, r => { r.payload.revision++; }, r => { r.budget_bytes = 0; }, r => { r.recipient_hash = "bad"; }, r => { r.link_revision = 0; }, r => { r.state = "delivered"; }]) {
    const r = insert(true); change(r); assert.throws(() => validateGroupParticipationNotice(r, ORG));
  }
  let calls = 0; const r = insert(false);
  Object.defineProperty(r, "payload", { enumerable: true, get() { calls++; throw Error("getter"); } });
  assert.throws(() => validateGroupParticipationNotice(r, ORG));
  const proxy = new Proxy({}, { ownKeys() { calls++; throw Error("proxy"); }, getPrototypeOf() { calls++; throw Error("proxy"); } });
  assert.throws(() => validateGroupParticipationNotice(proxy, ORG)); assert.equal(calls, 0);
});

test("groups-absent optional append paths preserve old delegation without reading candidate input", async () => {
  let count = 0, touched = 0;
  const c = { async query(sql) { assert.equal(sql, "SELECT count(*)::int AS count FROM os_participation_groups WHERE org_id=$1"); count++; return { rows: [{ count: 0 }] }; } };
  const input = new Proxy({}, { ownKeys() { touched++; throw Error("must remain unread"); }, get() { touched++; throw Error("must remain unread"); } });
  assert.equal(await canRetainGroupParticipationNotice(c, ORG, input), true);
  assert.equal(await canRetainGroupSafetyAudit(c, ORG, input), true);
  assert.equal(await checkGroupSafetyCapacity(c, ORG), null);
  assert.equal(count, 3); assert.equal(touched, 0);
});

test("GROUP-present incomplete graph/driver failure omits optional appends with no insert or false pass", async () => {
  const failure = Error("Fictional private graph failure"), calls = [];
  const c = { async query(sql) {
    calls.push(sql); assert(sql.startsWith("SELECT") || sql.startsWith("WITH"));
    if (sql === "SELECT count(*)::int AS count FROM os_participation_groups WHERE org_id=$1") return { rows: [{ count: 1 }] };
    throw failure;
  } };
  assert.equal(await canRetainGroupParticipationNotice(c, ORG, insert(true)), false);
  assert.equal(await canRetainGroupSafetyAudit(c, ORG, { org_id: ORG, actor_id: null, action: "participation.cancelled", record_id: null, module_id: null, detail: {} }), false);
  assert(!calls.some(sql => /^(INSERT|UPDATE|DELETE)\b/.test(sql)));
});

// Complete public helper call with a closed fake table inventory. Empty legacy
// families here are explicit fixture data, not production query fallbacks.
async function fullGuardFixture() {
  const f = await fixture(), calls = [], exactAt = "2026-11-08T00:00:00.000001Z";
  const accepted = validateGroupReceipt({ version: 1, groupId: "group", operation: "create", commandHash: "b".repeat(64), requestHash: HASH,
    authority: { actorSha256: HASH, sessionSha256: HASH, membershipSha256: HASH, memberCreatedAtExact: exactAt, restoreEpochSha256: HASH }, reviewSha256: null,
    acceptedAtExact: exactAt, result: { groupId: "group", groupRevision: 1, state: "draft", target: { targetId: "target", moduleId: "volunteers" }, rosterIds: ["person", "second"], coordinatorIntakeId: null } });
  const group = { org_id: ORG, id: "group", origin_mode: "live", module_id: "volunteers", live_target_id: "target", roster_ids: ["person", "second"], coordinator_intake_id: null,
    state: "draft", revision: 1, last_command_hash: accepted.commandHash, history: null, created_at: exactAt, updated_at: exactAt };
  const receiptRow = { org_id: ORG, command_hash: accepted.commandHash, group_id: "group", receipt: accepted };
  const size = value => Buffer.byteLength(JSON.stringify(value)); // Fixture byte returns only.
  const schema = {
    os_participation_groups: { org_id: "text", id: "text", origin_mode: "text", module_id: "text", live_target_id: "text", roster_ids: "jsonb", coordinator_intake_id: "text", state: "text", revision: "integer", last_command_hash: "text", history: "jsonb", created_at: "timestamp with time zone", updated_at: "timestamp with time zone" },
    os_participation_group_receipts: { org_id: "text", command_hash: "text", group_id: "text", receipt: "jsonb" },
  };
  let usage = 5000, noticeBytes = 800, sourceOutboxCount = 1;
  const emptyTables = new Set(["os_comments", "os_events", "os_reports", "os_files", "os_integrations", "os_learning_history", "os_incubator_history", "os_participation_checkins", "os_publications", "os_intake", "os_task_recurrence_series", "os_task_recurrence_occurrences", "os_resource_directory_history"]);
  const c = { async query(sql, args = []) {
    calls.push({ sql, args: clone(args) });
    assert(/^(SELECT|WITH)\b/.test(sql.trimStart()), "Sizing must never execute fixture writes");
    if (sql === reservationSchemaSql.layout) return legacyReservationLayout;
    if(sql===`SELECT NOT ${PARTICIPATION_REMINDER_LEGACY_SQL} AS present`)return {rows:[{present:false}]};
    if(sql==="SELECT id,reminder_consent FROM os_participations WHERE org_id=$1 AND reminder_consent IS NOT NULL ORDER BY id LIMIT 2001")return {rows:[]};
    if (Object.values(SQL).includes(sql)) {
      const result = await f.c.query(sql, args);
      if (sql === SQL.participations && args[5].length) return { rows: result.rows.map(r => ({ ...r, operational: String(Number(r.actual) + 100), operational_raw: String(Number(r.actual_raw) + 100) })) };
      if (sql === SQL.outbox && args[6]) return { rows: result.rows.map(r => ({ ...r, operational: "550", projected: "550" })) };
      return result;
    }
    if (sql === GROUP_NOTICE_SQL) {
      const value = JSON.parse(args[6]);
      return { rows: [{ row: { ...value, created_at: AT, next_at: AT, attempts: 0, first_attempt_at: null, lease_owner: null, lease_until: null, last_checked_at: null, safe_code: null, provider_event_at: null, recovered_state: null }, actual_raw: String(noticeBytes), operational_raw: String(noticeBytes + 20), suppression_raw: String(noticeBytes + 10) }] };
    }
    if (sql === GROUP_AUDIT_SQL) return { rows: [{ bytes: "600", row: JSON.parse(args[0]) }] };
    if (sql === "SELECT count(*)::int AS count FROM os_participation_groups WHERE org_id=$1") return { rows: [{ count: 1 }] };
    if (sql === GROUP_CAPACITY_SQL.schema) return { rows: Object.entries(schema).flatMap(([table_name, columns]) => Object.entries(columns).map(([column_name, type]) => ({ table_name, column_name, type }))) };
    if (sql === GROUP_CAPACITY_SQL.headers) return { rows: [{ id: group.id, row: group, bytes: String(size(group)), created_at_exact: exactAt, updated_at_exact: exactAt }] };
    if (sql === GROUP_CAPACITY_SQL.futureHeaders || sql === GROUP_CAPACITY_SQL.futureReceipts) return { rows: JSON.parse(args[0]).map((row, i) => ({ position: i + 1, key: row.id || row.command_hash, bytes: String(size(row)) })) };
    if (sql.startsWith("SELECT count(*)::int AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes FROM os_participation_groups")) return { rows: [{ count: 1, bytes: String(size(group)) }] };
    if (sql.startsWith("SELECT count(*)::int AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes FROM os_participation_group_receipts")) return { rows: [{ count: 1, bytes: String(size(receiptRow)) }] };
    if (sql.startsWith("SELECT group_id,count(*)::int")) return { rows: [{ group_id: "group", count: 1 }] };
    if (sql.startsWith("SELECT org_id,id,origin_mode")) { const { created_at, updated_at, ...r } = group; return { rows: [{ ...r, created_at_exact: exactAt, updated_at_exact: exactAt }] }; }
    if (sql.startsWith("SELECT org_id,command_hash,group_id,receipt")) return { rows: [receiptRow] };
    if (sql.startsWith("SELECT sum(size) AS size")) return { rows: [{ size: usage }] };
    if (sql === "SELECT * FROM os_orgs WHERE id=$1") return { rows: [{ id: ORG, name: "Fictional byte fixture", currency: "USD", time_zone: "UTC" }] };
    if (sql === "SELECT * FROM os_participation_targets WHERE org_id=$1 ORDER BY target_id") return { rows: [target] };
    if (sql === "SELECT * FROM os_participations WHERE org_id=$1 ORDER BY created_at,id") return { rows: [f.raw] };
    if (sql === "SELECT * FROM os_participation_outbox WHERE org_id=$1 ORDER BY created_at,id") return { rows: Array.from({ length: sourceOutboxCount }, (_, index) => notice(false, { id: index ? "notice_" + index : "notice", event_revision: index + 1 })) };
    if (sql.startsWith("SELECT id,intent_kind,budget_bytes,octet_length(to_jsonb(t)::text) AS actual")) return { rows: [{ id: "notice", intent_kind: "legacy", budget_bytes: 0, actual: 500, projected: 550 }] };
    if (sql.startsWith("SELECT octet_length(") && sql.includes(" AS actual_raw,") && sql.includes("WHERE t.org_id=$1 AND t.id=ANY")) return { rows: args[5].map(() => ({ actual: 1000, projected: 1100, actual_raw: 1048, projected_raw: 1148 })) };
    if (sql.startsWith("SELECT COALESCE(sum(octet_length(") && sql.includes("FROM os_participations t")) return { rows: [{ bytes: 1000 }] };
    if (sql === "SELECT revision,enabled,activated_at,template_version,updated_at FROM os_participation_delivery_policies WHERE org_id=$1") return { rows: [{ revision: 1, enabled: false, activated_at: null, template_version: DELIVERY_TEMPLATE_VERSION, updated_at: AT }] };
    if (sql.startsWith("SELECT * FROM os_records WHERE org_id=$1 AND deleted_at IS NULL")) {
      const r = f.backup.records[0]; return { rows: [{ org_id: ORG, id: r.id, module_id: r.moduleId, data: r.data, status: r.status, owner_id: r.ownerId, last_editor_id: r.lastEditedBy,
        revision: r.revision, approval: r.approval, snapshot: r.snapshot, source: r.source, created_at: new Date(AT), updated_at: new Date(AT) }] };
    }
    if (sql === "SELECT * FROM os_records WHERE org_id=$1 AND deleted_at IS NOT NULL") return { rows: [] };
    if (sql.includes("FROM os_participation_checkins t") && sql.includes("max_bytes")) return { rows: [{ count: 0, bytes: 0, max_bytes: 0, history_bytes: 0, report_bytes: 0, withdrawal_bytes: 0 }] };
    const table = sql.match(/\bFROM (os_[a-z_]+)\b/)?.[1];
    if (emptyTables.has(table)) return { rows: [] };
    throw Error("Unhandled table/query in complete fake fixture: " + table);
  } };
  return { c, calls, setUsage(value) { usage = value; }, setNoticeBytes(value) { noticeBytes = value; }, setOutboxCount(value) { sourceOutboxCount = value; } };
}

test("GROUP-present positive optional notice/audit and finite safety gate execute complete real helpers", async () => {
  const f = await fullGuardFixture(), candidate = insert(false);
  candidate.id = "next_notice"; candidate.event_revision = candidate.payload.revision = 2; candidate.participation_revision = 2;
  assert.equal(await canRetainGroupParticipationNotice(f.c, ORG, candidate), true);
  assert(f.calls.some(call => call.sql === GROUP_NOTICE_SQL));
  assert.equal(await canRetainGroupSafetyAudit(f.c, ORG, { org_id: ORG, actor_id: null, action: "participation.cancelled", record_id: null, module_id: null, detail: {} }), true);
  const measured = await checkGroupSafetyCapacity(f.c, ORG); assert(measured.requiredUsage > measured.usage);
  assert.equal(f.calls.some(call => /^(INSERT|UPDATE|DELETE)\b/.test(call.sql)), false);
});

test("GROUP-present optional append refuses excess61MiB pressure without accepting a new reserve", async () => {
  const f = await fullGuardFixture(), candidate = insert(false);
  candidate.id = "next_notice"; candidate.event_revision = candidate.payload.revision = 2;
  f.setUsage(61 * 1024 * 1024);
  assert.equal(await canRetainGroupParticipationNotice(f.c, ORG, candidate), false);
  assert.equal(await canRetainGroupSafetyAudit(f.c, ORG, { org_id: ORG, actor_id: null, action: "participation.cancelled", record_id: null, module_id: null, detail: {} }), false);
  await assert.rejects(checkGroupSafetyCapacity(f.c, ORG), e => e.code === "participation_group_safety_capacity");
});

test("prospective live notice activates the real operational path and must fit its existing8192 budget", async () => {
  const f = await fullGuardFixture(), candidate = insert(true);
  candidate.id = "next_notice"; candidate.event_revision = candidate.payload.revision = 2; candidate.participation_revision = 2;
  assert.equal(await canRetainGroupParticipationNotice(f.c, ORG, candidate), true);
  assert(f.calls.some(call => call.sql.startsWith("SELECT id,intent_kind,budget_bytes")));
  const before = f.calls.length; f.setNoticeBytes(8193);
  assert.equal(await canRetainGroupParticipationNotice(f.c, ORG, candidate), false);
  assert(f.calls.slice(before).some(call => call.sql === GROUP_NOTICE_SQL));
});

test("unchanged8000 outbox count refuses before prospective candidate measurement", async () => {
  const f = await fullGuardFixture(), candidate = insert(false);
  candidate.id = "next_notice"; candidate.event_revision = candidate.payload.revision = 8001;
  f.setOutboxCount(8000);
  assert.equal(await canRetainGroupParticipationNotice(f.c, ORG, candidate), false);
  assert.equal(f.calls.some(call => call.sql === GROUP_NOTICE_SQL), false);
});
