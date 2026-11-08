/** Negative-first v1 witnesses; fake SQL only, no target or socket. */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { at, context, reportRequest, reported, withdrawalRequest } from "../test-fixtures/participant-check-in.mjs";
import { csrf } from "../lib/security.mjs";
import { participantCheckInRoutes, staffCheckInRoutes } from "../lib/participant-check-in.mjs";
import { checkInStorageRow } from "../lib/participant-check-in-store.mjs";
import { checkCombinedCheckInCapacity } from "../lib/participant-check-in-capacity.mjs";
const settings = { origin: "https://os.example.invalid", secret: "fictional-checkin-forward-secret" };
const session = { user: { id: "own_actor", email: "fictional@example.invalid", emailVerified: true }, session: { id: "fictional_session" } };
const p = () => ({ id: "participation_1", org_id: "org_A", target_id: "target_1", module_id: "volunteers", booking_record_id: "booking_1", contact_id: "contact_1", intake_id: "intake_1", revision: 4, state: "confirmed", source: "intake", recovered: false, frozen: context().frozen, requested_interval: null });
const records = () => [
  { id: "target_1", moduleId: "volunteers", status: "open", data: { ...context().frozen.terms, programId: null, allowPartialIntervals: false } },
  { id: "booking_1", moduleId: "volunteers", status: "approved", data: { kind: "assignment", shiftId: "target_1", contactId: "contact_1", programId: null } },
  { id: "contact_1", moduleId: "contacts", status: "active", data: { title: "Fictional contact" } },
];
function fixture({ record = null, currentRecords = records(), participation = p() } = {}) {
  const trace = [];
  const c = { query: async (sql, values) => {
    trace.push(sql.startsWith("WITH instant") ? "domain-clock" : "sql");
    if (sql.startsWith("SELECT id FROM os_participant_links")) return { rows: [{ id: "link" }] };
    if (sql.includes("FROM os_participant_links l JOIN os_intake")) return { rows: [{ id: "intake_1", revision: 3 }] };
    if (sql.startsWith("SELECT * FROM os_participations")) return { rows: [participation] };
    if (sql.startsWith("SELECT t.* FROM os_participation_checkins")) return { rows: record ? [checkInStorageRow(record, "org_A", at)] : [] };
    if (sql.startsWith("SELECT * FROM os_participation_targets")) return { rows: [{ mode: "paused", recovery_block: false }] };
    if (sql.startsWith("SELECT * FROM os_records")) return { rows: currentRecords.map(r => ({ id: r.id, org_id: "org_A", module_id: r.moduleId, data: r.data, status: r.status, revision: 1, owner_id: "author", last_editor_id: "author", approval: null, snapshot: null, deleted_at: null, created_at: new Date(at), updated_at: new Date(at) })) };
    if (sql.startsWith("WITH instant")) return { rows: [{ server_now: at, reason: null, claim_not_future: true }] };
    throw Error("Unexpected forward fixture query");
  } };
  return { c, trace, db: { tx: async (user, org, callback) => callback(c) } };
}
async function own(f, action, input, actor = session) {
  const url = settings.origin + "/api/participant/orgs/org_A/requests/intake_1/participations/participation_1/check-in" + (action ? "/" + action : "");
  const request = new Request(url, action ? { method: "POST", headers: { origin: settings.origin, "content-type": "application/json", "x-csrf-token": csrf(actor.session.id, settings.secret) }, body: JSON.stringify(input) } : {});
  const previous = crypto.randomBytes;
  crypto.randomBytes = (...args) => { f.trace.push("domain-mint"); return previous(...args); };
  syncBuiltinESMExports();
  try { return await participantCheckInRoutes({ request, db: f.db, settings, session: actor, input }); }
  finally { crypto.randomBytes = previous; syncBuiltinESMExports(); }
}
for (const [field, value] of [["revision", 3], ["intakeRevision", 2], ["commitmentSha256", "f".repeat(64)]]) {
  test(`new report stale ${field} refuses before domain clock or report identity mint`, async () => {
    const f = fixture(); await assert.rejects(own(f, "report", { ...reportRequest(), [field]: value }), e => e.code === "checkin_context");
    assert.deepEqual(f.trace.filter(step => step.startsWith("domain-")), []);
  });
}
for (const [field, value] of [["checkInRevision", 2], ["reportSha256", "f".repeat(64)]]) {
  test(`new withdrawal stale ${field} refuses before domain clock`, async () => {
    const f = fixture({ record: reported() });
    await assert.rejects(own(f, "withdraw", { ...withdrawalRequest(reported()), [field]: value }), e => e.code === "checkin_context");
    assert.deepEqual(f.trace.filter(step => step.startsWith("domain-")), []);
  });
}
for (const action of [undefined, "report", "withdraw"]) {
  test(`known live foreign actor ${action || "GET"} is generic unavailable before clock or mint`, async () => {
    const f = fixture({ record: reported() }), actor = { ...session, user: { ...session.user, id: "different_actor" } };
    const input = action === "report" ? reportRequest() : action === "withdraw" ? withdrawalRequest(reported()) : undefined;
    await assert.rejects(own(f, action, input, actor), e => e.status === 404 && e.code === "checkin");
    assert.deepEqual(f.trace.filter(step => step.startsWith("domain-")), []);
  });
}
test("inactive restoration fits independently without buying a live check-in withdrawal again", () => {
  const logical = 60 * 1024 * 1024, native = 64 * 1024 * 1024;
  const checkins = { wholeRetainedReserve: 200, wholeNativeReserve: 200 }, participation = { wholeRetainedReserve: 100, wholeNativeReserve: 100 };
  const whole = { requiredUsage: logical - 1000, requiredBackupBytes: native - 1000, restore: { requiredLogicalBytes: logical - 150, backupBytes: native - 150 } };
  assert.doesNotThrow(() => checkCombinedCheckInCapacity(whole, checkins, participation));
  assert.throws(() => checkCombinedCheckInCapacity({ ...whole, requiredUsage: logical - 250 }, checkins, participation), e => e.code === "checkin_capacity");
  assert.throws(() => checkCombinedCheckInCapacity({ ...whole, restore: { ...whole.restore, requiredLogicalBytes: logical - 50 } }, checkins, participation), e => e.code === "checkin_capacity");
});
const staffTail = "participation-targets/target_1/participations/participation_1/check-in";
const staffRead = f => staffCheckInRoutes({ c: f.c, org: "org_A", member: { role: "owner", programIds: [] }, tail: staffTail, method: "GET", url: new URL(settings.origin + "/api/orgs/org_A/" + staffTail) });
for (const [name, change] of [
  ["source module", r => { r[0].moduleId = "projects"; }],
  ["source kind", r => { r[0].data.kind = "assignment"; }],
  ["booking module", r => { r[1].moduleId = "projects"; }],
  ["booking kind", r => { r[1].data.kind = "shift"; }],
  ["booking target", r => { r[1].data.shiftId = "other_target"; }],
  ["booking contact", r => { r[1].data.contactId = "other_contact"; }],
  ["contact module", r => { r[2].moduleId = "projects"; }],
]) {
  test(`staff historical read rejects changed ${name} relationship despite visible IDs`, async () => {
    const r = records(); change(r);
    await assert.rejects(staffRead(fixture({ record: reported(), currentRecords: r })), e => e.status === 404);
  });
}
test("staff relationship-only history read preserves valid cancelled/paused history", async () => {
  const r = records(); r[0].status = "cancelled"; r[1].status = "cancelled";
  const value = await (await staffRead(fixture({ record: reported(), currentRecords: r, participation: { ...p(), state: "cancelled" } }))).json();
  assert.equal(value.report.id, "claim_1"); assert.equal(value.report.currentDisposition.state, "reported");
});
