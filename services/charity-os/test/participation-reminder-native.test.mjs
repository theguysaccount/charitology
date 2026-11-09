/** Codec/fake-client tests only: no SQL/role/auth/dispatch/capacity acceptance. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exportParticipation, restoredParticipation, restoreParticipation } from "../lib/participation-backup.mjs";
import { participationEnvelopeVersion } from "../lib/participation-storage.mjs";
import { nativeReminderPayload, reminderNativeBasis, reminderOutboxPresence } from "../lib/participation-reminder-backup.mjs";
import { makeReminderIntentMarker } from "../lib/participation-reminder-model.mjs";
import { reminderNativeFixture } from "./fixtures/participation-reminder-native.mjs";
const golden = JSON.parse(readFileSync(new URL("./fixtures/participation-reminder-old-native-golden.json", import.meta.url), "utf8"));
const copy = value => JSON.parse(JSON.stringify(value));
const bad = fn => assert.throws(fn, e => e.code === "participation_backup" && e.status === 422);
function live(intervals = false) {
  const f = reminderNativeFixture({ intervals });
  const p = f.participations[0], range = p.requested_interval || p.frozen.terms;
  const marker = makeReminderIntentMarker({ commitment: {
    format: "charitology-participation-reminder-commitment", version: 1, method: "participation-reminder-v1",
    orgId: "org", moduleId: "volunteers", targetId: "shift", participationId: "p00", bookingRecordId: "booking", intakeId: "intake", contactId: "contact",
    confirmedAtExact: "2026-11-07T09:00:00.000001Z", frozenSourceRevision: 4, frozenSha256: "a".repeat(64), frozenTermsSha256: p.frozen.termsHash,
    range: { startAt: range.startAt, endAt: range.endAt, timeZone: range.timeZone } }, sourceSha256: "b".repeat(64), templateSha256: "c".repeat(64) });
  Object.assign(f.outbox[0], { state: "pending", intent_kind: "reminder", consent_revision: 2,
    consent_copy: "participation-reminder-v1", template_version: "participation-reminder-notice-v1",
    payload: { state: "confirmed", participationId: "p00", revision: 1, reminder: marker } });
  return f;
}
const backup = async f => ({ records: f.records, intake: f.intake, participation: await exportParticipation(f.c, "org") });
function readerForNormalized(normalized, source) {
  const at = "2026-11-08T00:00:00.000Z";
  const targets = normalized.targets.map(t => ({ target_id: t.targetId, module_id: t.moduleId, revision: 1, mode: "paused", source_revision: t.sourceRevision,
    terms: t.terms, terms_hash: t.termsHash, recovery_block: true, created_at: t.createdAt }));
  const people = normalized.participations.map(p => ({ id: p.id, target_id: p.targetId, module_id: p.moduleId, booking_record_id: p.bookingRecordId,
    contact_id: p.contactId, intake_id: p.intakeId, state: p.state, revision: 1, source: "recovered", consent: null, frozen: p.frozen,
    waitlist_sequence: null, confirmed_at: null, cancelled_at: p.cancelledAt, recovered: true, recovered_state: p.recoveredState,
    requested_interval: p.requestedInterval, created_at: p.createdAt, updated_at: at, reminder_consent: null, delivery_consent: null, last_command: null }));
  const outbox = normalized.outbox.map(o => ({ id: o.id, participation_id: o.participationId, event_revision: o.eventRevision, purpose: o.purpose,
    channel: o.channel, state: "cancelled", payload: o.payload, created_at: o.createdAt, participation_revision: o.participationRevision,
    intent_kind: "legacy", recovered_state: o.recoveredState, consent_revision: o.consentRevision, consent_copy: o.consentCopy,
    template_version: o.templateVersion, first_attempt_at: o.attemptedAt, attempts: o.attempts, last_checked_at: o.lastCheckedAt,
    safe_code: o.safeCode, provider_event_at: o.providerEventAt }));
  return { async query(sql) {
    if (sql === "SELECT * FROM os_participation_targets WHERE org_id=$1 ORDER BY target_id") return { rows: targets };
    if (sql === "SELECT * FROM os_participations WHERE org_id=$1 ORDER BY created_at,id") return { rows: people };
    if (sql === "SELECT * FROM os_participation_outbox WHERE org_id=$1 ORDER BY created_at,id") return { rows: outbox };
    throw Error("Unexpected closed recovered exporter query");
  } };
}

test("old v1/v2/v3 serialization and normalization equal independent committed-code goldens", async () => {
  for (const basis of [2, 3]) {
    const f = reminderNativeFixture({ intervals: basis === 3 }), b = await backup(f);
    assert.equal(JSON.stringify(b.participation), golden["v" + basis].serialized);
    assert.deepEqual(restoredParticipation(b), golden["v" + basis].normalized);
  }
  const f = reminderNativeFixture();
  assert.deepEqual(restoredParticipation({ records: f.records, intake: f.intake, participation: golden.v1.input }), golden.v1.normalized);
});
test("live reminder selects v4 with basis2 and keeps the exact four-field payload", async () => {
  const f = live(), b = await backup(f); assert.equal(b.participation.version, 4); assert.equal(b.participation.basisVersion, 2);
  assert.deepEqual(b.participation.outbox[0].payload, f.outbox[0].payload);
  assert.equal(Object.hasOwn(b.participation.participations[0], "requestedInterval"), false);
  const n = restoredParticipation(b); assert.equal(n.outbox[0].intentKind, "legacy"); assert.equal(n.outbox[0].state, "cancelled");
});
test("basis3 preserves exact partial interval/allocation semantics in v4", async () => {
  const f = live(true), b = await backup(f); assert.equal(b.participation.basisVersion, 3);
  assert.deepEqual(b.participation.participations[0].requestedInterval, f.participations[0].requested_interval);
  assert.deepEqual(restoredParticipation(b).participations[0].requestedInterval, f.participations[0].requested_interval);
  const downgraded = copy(b); downgraded.participation.basisVersion = 2; bad(() => restoredParticipation(downgraded));
});
test("choice-only state never changes native old-version shape or leaks live fields", async () => {
  const f = reminderNativeFixture(), b = await backup(f);
  assert.equal(b.participation.version, 2); assert.equal(JSON.stringify(b.participation), golden.v2.serialized);
  const text = JSON.stringify(b.participation);
  for (const privateText of ["reminder_consent", "delivery_consent", "last_command", "private-user", "private-key", "recipient_hash", "link_id"])
    assert.equal(text.includes(privateText), false);
});
test("old-version downgrade cannot hide a marker or live reminder kind", async () => {
  const b = await backup(live());
  for (const v of [1, 2, 3]) { const value = copy(b); value.participation.version = v; delete value.participation.basisVersion; bad(() => restoredParticipation(value)); }
  const missing = copy(b); delete missing.participation.outbox[0].payload.reminder; bad(() => restoredParticipation(missing));
});
test("v4 requires actual history, exact top-level grammar and a known basis", async () => {
  const b = await backup(live());
  for (const mutate of [x => x.basisVersion = 1, x => x.basisVersion = 5, x => delete x.basisVersion,
    x => x.previewReceipt = {}, x => { x.outbox[0].intentKind = "legacy"; delete x.outbox[0].payload.reminder; }]) {
    const x = copy(b); mutate(x.participation); bad(() => restoredParticipation(x));
  }
});
test("null/unknown marker and unknown complete payload fields fail closed", async () => {
  const b = await backup(live());
  for (const mutate of [o => o.payload.reminder = null, o => o.payload.reminder.method = "future-method",
    o => o.payload.reminder.version = 2, o => o.payload.reminder.extra = true, o => o.payload.address = "not-authority@example.invalid",
    o => o.payload.state = "waitlisted", o => o.payload.revision = 2]) {
    const x = copy(b); mutate(x.participation.outbox[0]); bad(() => restoredParticipation(x));
  }
});
test("complete causal payload, not merely marker, remains bounded to2048bytes", () => {
  const f = live(), p = copy(f.outbox[0].payload);
  assert.ok(Buffer.byteLength(JSON.stringify(p)) < 2048); assert.deepEqual(nativeReminderPayload(p), p);
  p.padding = "x".repeat(2048); bad(() => nativeReminderPayload(p));
});
test("duplicate event/commitment and conflicting kind cannot manufacture another historical reminder", async () => {
  const b = await backup(live());
  const duplicate = copy(b), o = copy(duplicate.participation.outbox[0]); o.id = "duplicate"; o.eventRevision = 2; o.payload.revision = 2;
  duplicate.participation.outbox.push(o); bad(() => restoredParticipation(duplicate));
  const conflict = copy(b); conflict.participation.outbox[0].intentKind = "transition"; bad(() => restoredParticipation(conflict));
});
test("marker-bearing history refuses rather than silently omitting an unavailable parent", async () => {
  const b = await backup(live()); b.participation.participations[0].state = "cancelled"; b.participation.participations[0].cancelledAt = "2026-11-07T10:00:00.000Z";
  b.records = b.records.filter(r => r.id !== "booking"); bad(() => restoredParticipation(b));
});
test("two inactive export/restore hops preserve marker and known outcome without regaining authority", async () => {
  for (const intervals of [false, true]) {
  const f = live(intervals); Object.assign(f.outbox[0], { state: "delivered", first_attempt_at: new Date("2026-11-07T10:00:00Z"), attempts: 1,
    safe_code: "provider_delivered", provider_event_at: new Date("2026-11-07T10:00:01Z") });
  let b = await backup(f); const original = copy(b.participation.outbox[0].payload), consent = copy(b.participation.participations[0].consent), confirmedAt = b.participation.participations[0].confirmedAt;
  for (let hop = 0; hop < 2; hop++) {
    const n = restoredParticipation(b); assert.equal(n.outbox[0].state, "cancelled"); assert.equal(n.outbox[0].intentKind, "legacy");
    assert.equal(n.outbox[0].recoveredState, "delivered"); assert.deepEqual(n.outbox[0].payload, original);
    assert.deepEqual(n.participations[0].frozen.sourceHistory.consent, consent); assert.equal(n.participations[0].frozen.sourceHistory.confirmedAt, confirmedAt);
    const exported = await exportParticipation(readerForNormalized(n, b), "destination");
    assert.equal(exported.version, 4); assert.equal(exported.basisVersion, intervals ? 3 : 2); assert.deepEqual(exported.outbox[0].payload, original);
    assert.equal(exported.outbox[0].intentKind, "legacy"); assert.equal(exported.outbox[0].state, "cancelled");
    assert.equal(JSON.stringify(exported).includes("private-key"), false);
    b = { ...b, participation: exported };
  }
  }
});
test("v4 rejects authority fields rather than silently importing them", async () => {
  const b = await backup(live());
  for (const mutate of [x => x.participations[0].reminderConsent = { enabled: true }, x => x.outbox[0].relayKey = "new-key",
    x => x.outbox[0].userId = "new-user", x => x.outbox[0].preview = "old-preview"]) {
    const x = copy(b); mutate(x.participation); bad(() => restoredParticipation(x));
  }
});
test("owned v4 descriptors/proxies cannot invoke hooks before native validation", async () => {
  const b = await backup(live()); let hooks = 0;
  const getter = copy(b); Object.defineProperty(getter.participation.outbox[0].payload.reminder, "method", { enumerable: true, get() { hooks++; throw Error("getter"); } });
  bad(() => restoredParticipation(getter));
  const proxy = new Proxy({}, { ownKeys() { hooks++; throw Error("ownKeys"); }, getPrototypeOf() { hooks++; throw Error("prototype"); } });
  const p = copy(b); p.participation.outbox[0].payload.reminder = proxy; bad(() => restoredParticipation(p));
  const a = copy(b); Object.defineProperty(a, "participation", { enumerable: true, get() { hooks++; throw Error("rootgetter"); } }); bad(() => restoredParticipation(a));
  assert.equal(hooks, 0);
});
test("compensated sparse/decorated outbox arrays cannot hide marker history", async () => {
  const b = await backup(live());
  for (const key of ["4294967295", "99999999999999999999", "01", "-0", "1e0"]) {
    const a = Array(1); Object.defineProperty(a, key, { enumerable: true, value: b.participation.outbox[0] });
    bad(() => reminderOutboxPresence(a));
  }
});
test("family larger than the pure-model128KiB bound remains valid within existing historical limits", async () => {
  const f = live(), original = f.participations[0];
  for (let n = 1; n <= 200; n++) {
    const p = { ...original, id: "p" + n, booking_record_id: "booking" + n, intake_id: null, state: "cancelled", source: "staff", cancelled_at: new Date("2026-11-07T10:00:00Z") };
    f.participations.push(p); f.records.push({ id: p.booking_record_id, moduleId: "volunteers", data: { kind: "assignment", shiftId: "shift", contactId: "contact" } });
  }
  const b = await backup(f); assert.ok(Buffer.byteLength(JSON.stringify(b.participation)) > 128 * 1024);
  assert.equal(restoredParticipation(b).participations.length, 201);
});
test("restore writes only inactive rows and retains exact SQL payload, no choice/recipient/key", async () => {
  const b = await backup(live()), n = restoredParticipation(b), writes = [];
  await restoreParticipation({ async query(sql, args) {
    writes.push({ sql, args });
    if (sql.startsWith("INSERT INTO os_participation_" ) || sql.startsWith("INSERT INTO os_participations")) return { rows: [], rowCount: 1 };
    if (sql.startsWith("SELECT count(*)")) return { rows: [{ count: 1, bytes: 4096 }] };
    throw Error("Unexpected closed restore writer query");
  } }, "destination", "fictional-restorer", n);
  const p = writes.find(x => x.sql.startsWith("INSERT INTO os_participations")), o = writes.find(x => x.sql.startsWith("INSERT INTO os_participation_outbox"));
  assert.match(p.sql, /'recovered',NULL/); assert.doesNotMatch(p.sql, /reminder_consent|delivery_consent|last_command/);
  assert.match(o.sql, /'cancelled'/); assert.match(o.sql, /'legacy'/); assert.deepEqual(JSON.parse(o.args[4]), b.participation.outbox[0].payload);
  assert.doesNotMatch(o.sql, /recipient_hash|relay_key|policy_epoch|user_id|link_id|payload_hash/);
});
