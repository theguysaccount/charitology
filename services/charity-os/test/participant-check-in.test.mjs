/** Fake SQL units. These do not establish PG/RLS, auth service or HTTP delivery. */
import test from "node:test";
import assert from "node:assert/strict";
import { at, context, reportRequest, reported, withdrawn, withdrawalRequest } from "../test-fixtures/participant-check-in.mjs";
import { csrf } from "../lib/security.mjs";
import { participantCheckInRoutes, staffCheckInRoutes, checkInCurrentContext, readCheckInBody } from "../lib/participant-check-in.mjs";
import { checkInStorageRow } from "../lib/participant-check-in-store.mjs";
const session = { user: { id: "own_actor", email: "fictional@example.invalid", emailVerified: true }, session: { id: "fictional_session" } };
const settings = { origin: "https://os.example.invalid", secret: "fictional-secret-only-for-tests" };
const base = settings.origin + "/api/participant/orgs/org_A/requests/intake_1/participations/participation_1/check-in";
const p = () => ({ id: "participation_1", org_id: "org_A", target_id: "target_1", module_id: "volunteers", booking_record_id: "booking_1", contact_id: "contact_1", intake_id: "intake_1", revision: 4, state: "confirmed", source: "intake", recovered: false, frozen: context().frozen, requested_interval: null });
const records = () => [
  { id: "target_1", moduleId: "volunteers", status: "open", data: { ...context().frozen.terms, programId: null, allowPartialIntervals: false } },
  { id: "booking_1", moduleId: "volunteers", status: "approved", data: { kind: "assignment", shiftId: "target_1", contactId: "contact_1", programId: null } },
  { id: "contact_1", moduleId: "contacts", status: "active", data: { title: "Fictional contact" } },
];
function dbFake({ record = reported(), participation = p(), linked = true, currentRecords = [], clockReason = null } = {}) {
  const calls = [], transactions = [];
  const query = async (sql, values) => {
    calls.push([sql, values]);
    if (sql.startsWith("SELECT id FROM os_participant_links")) return { rows: linked ? [{ id: "link_1" }] : [] };
    if (sql.includes("FROM os_participant_links l JOIN os_intake")) return { rows: linked ? [{ id: "intake_1", revision: 3 }] : [] };
    if (sql.startsWith("SELECT * FROM os_participations")) return { rows: participation ? [participation] : [] };
    if (sql.startsWith("SELECT t.* FROM os_participation_checkins")) return { rows: record ? [checkInStorageRow(record, "org_A", at)] : [] };
    if (sql.startsWith("SELECT * FROM os_participation_targets")) return { rows: [{ mode: "paused", recovery_block: false }] };
    if (sql.startsWith("SELECT * FROM os_records")) return { rows: currentRecords.map(r => ({ id: r.id, org_id: "org_A", module_id: r.moduleId, data: r.data, status: r.status, revision: 1, owner_id: "author", last_editor_id: "author", approval: null, snapshot: null, deleted_at: null, created_at: new Date(at), updated_at: new Date(at) })) };
    if (sql.startsWith("WITH instant AS MATERIALIZED")) return { rows: [{ server_now: at, reason: clockReason, claim_not_future: true }] };
    throw new Error("Unexpected fake SQL: " + sql.slice(0, 90));
  };
  return { calls, transactions, db: { tx: async (user, org, run, options) => { transactions.push({ user, org, options }); return run({ query }); } }, c: { query } };
}
function ownRequest(action, input) {
  return new Request(base + (action ? "/" + action : ""), action ? { method: "POST", headers: { origin: settings.origin, "x-csrf-token": csrf(session.session.id, settings.secret), "content-type": "application/json" }, body: JSON.stringify(input) } : {});
}
const call = (f, action, input, s = session) => participantCheckInRoutes({ request: ownRequest(action, input), db: f.db, settings, session: s, input });

test("fresh own proof precedes accepted report Replay without current parent/clock/business writes", async () => {
  const f = dbFake({ record: withdrawn(), participation: { ...p(), state: "cancelled", revision: 999 } });
  const result = await (await call(f, "report", reportRequest())).json();
  assert.equal(result.replayed, true); assert.equal(result.result.action, "reported"); assert.equal(result.currentDisposition.state, "withdrawn");
  assert.equal(f.transactions[0].org, null); assert.equal(f.transactions[0].options.readOnly, true);
  assert.match(f.calls[0][0], /os_participant_links/);
  assert.equal(f.transactions[1].options.lock, true);
  assert(f.calls.every(([sql]) => sql.startsWith("SELECT")));
  assert(!f.calls.some(([sql]) => /clock_timestamp|os_records|os_participation_targets|INSERT|UPDATE|os_events/.test(sql.replace(/FOR UPDATE/g, ""))));
  assert.deepEqual(Object.keys(result).sort(), ["currentDisposition", "ok", "replayed", "result"]);
  assert(!JSON.stringify(result).includes("actorHash")); assert(!JSON.stringify(result).includes("Receipt"));
});
test("revoked own grant and another actor cannot recover a known exact receipt", async () => {
  const f = dbFake({ linked: false });
  await assert.rejects(call(f, "report", reportRequest()), e => e.status === 404);
  assert.equal(f.calls.length, 1); assert.equal(f.transactions.length, 1);
  const other = dbFake(); await assert.rejects(call(other, "report", reportRequest(), { ...session, user: { ...session.user, id: "another_actor" } }), e => e.status === 404 && e.code === "checkin");
});
test("altered accepted report body cannot acquire Replay or reach clock/source reads", async () => {
  const f = dbFake(); await assert.rejects(call(f, "report", { ...reportRequest(), claimedArrivalAt: "2026-11-07T10:11:00Z" }), e => e.code === "checkin_intent");
  assert(!f.calls.some(([sql]) => /clock_timestamp|os_records/.test(sql)));
});
test("exact withdrawal Replay keeps original false audit result after current parent loss", async () => {
  const f = dbFake({ record: withdrawn() });
  const result = await (await call(f, "withdraw", withdrawalRequest(reported()))).json();
  assert.equal(result.replayed, true); assert.equal(result.result.auditRetained, false); assert.equal(result.result.revision, 2);
  assert(!f.calls.some(([sql]) => /clock_timestamp|INSERT|SET revision|os_records/.test(sql)));
});
test("own GET with missing current parent retains an authorized live withdrawal, no private fields", async () => {
  const f = dbFake(), value = await (await call(f)).json();
  assert.equal(value.context, null); assert.equal(value.window, null); assert.equal(value.canReport, false); assert.equal(value.canWithdraw, true);
  assert.equal(value.report.claimSha256, reported().history.claimSha256); assert.equal(value.unavailableReason, "history-exists");
  assert.equal(f.transactions[1].options.readOnly, true); assert(!f.calls.some(([sql]) => /FOR UPDATE/.test(sql)));
  for (const key of ["actorHash", "contactId", "candidateApproval", "reportReceipt", "withdrawalReceipt"]) assert(!JSON.stringify(value).includes(key));
});
test("new context uses original frozen public terms, allows paused/nonmaterial edits, and refuses material mismatch", () => {
  const r = records(); r[0].data.title = "Unapproved working title"; r[0].data.participantInstructions = "Private changed working instructions";
  const v = checkInCurrentContext("org_A", p(), { revision: 3 }, { mode: "paused", recovery_block: false }, r);
  assert.equal(v.context.title, context().frozen.terms.title); assert.equal(v.context.participantInstructions, null);
  assert.equal(checkInCurrentContext("org_A", { ...p(), state: "cancelled" }, { revision: 3 }, {}, r).reason, "not-confirmed");
  assert.equal(checkInCurrentContext("org_A", { ...p(), recovered: true }, { revision: 3 }, {}, r).reason, "unsupported-origin");
  r[0].data.endAt = "2026-11-07T13:00:00Z";
  assert.equal(checkInCurrentContext("org_A", p(), { revision: 3 }, { mode: "managed" }, r).reason, "commitment-changed");
});
test("own resolve is nonmutating strict civil mapping, not a report eligibility promise", async () => {
  const f = dbFake({ record: null, currentRecords: records() });
  const result = await (await call(f, "resolve-arrival", { revision: 4, intakeRevision: 3, commitmentSha256: reportRequest().commitmentSha256, civil: "2026-11-07T10:10:00.000", resolution: null })).json();
  assert.equal(result.kind, "unique"); assert.equal(result.claimedArrivalAt, "2026-11-07T10:10:00.000Z");
  assert.equal(result.candidates.length, 1); assert.equal(result.reason, null); assert.equal(f.transactions[1].options.readOnly, true);
  assert(!f.calls.some(([sql]) => /clock_timestamp|FOR UPDATE|INSERT/.test(sql)));
});
test("strict raw parser preserves duplicate-key and fatal UTF8 evidence within the 4096-byte cap", async () => {
  const req = bytes => new Request(base + "/report", { method: "POST", body: bytes });
  await assert.rejects(readCheckInBody(req('{"revision":1,"\\u0072evision":2}')), e => e.code === "backup_json");
  await assert.rejects(readCheckInBody(req(Uint8Array.from([123, 34, 120, 34, 58, 34, 255, 34, 125]))), e => e.code === "backup_json");
  await assert.rejects(readCheckInBody(req(" ".repeat(4097))), e => e.status === 413);
});
test("staff reads require current fulfillment writer and every current/historical program scope", async () => {
  const f = dbFake({ currentRecords: records() }), tail = "participation-targets/target_1/participations/participation_1/check-in", url = new URL("https://os.example.invalid/api/orgs/org_A/" + tail);
  const owner = { role: "owner", programIds: [] };
  const v = await (await staffCheckInRoutes({ c: f.c, org: "org_A", member: owner, tail, method: "GET", url })).json();
  assert.equal(v.report.id, "claim_1");
  const r = records(); r[1].data.programId = "other_program";
  await assert.rejects(staffCheckInRoutes({ c: dbFake({ currentRecords: r }).c, org: "org_A", member: { ...owner, programIds: ["allowed_program"] }, tail, method: "GET", url }), e => e.status === 404);
  await assert.rejects(staffCheckInRoutes({ c: f.c, org: "org_A", member: { role: "board_reader", programIds: [] }, tail, method: "GET", url }), e => e.status === 403);
});
