import test from "node:test";
import assert from "node:assert/strict";
import { at, reported, withdrawn } from "../test-fixtures/participant-check-in.mjs";
import { makeBackup, validateBackup } from "../lib/backup.mjs";
import { makeCheckInBackup, restoreCheckInBackup } from "../lib/participant-check-in-model.mjs";
import { restoredParticipantCheckins, exportParticipantCheckins, restoreParticipantCheckins } from "../lib/participant-check-in-backup.mjs";
import { checkInStorageRow } from "../lib/participant-check-in-store.mjs";
import { checkCheckInCapacity } from "../lib/participant-check-in-capacity.mjs";
import { measureLearningRestoreCapacity } from "../lib/learning-capacity.mjs";
import { restoreMeasurementFixture } from "./restore-capacity-fixture.mjs";
const org = { name: "Fictional", currency: "USD", time_zone: "UTC" };

test("absent optional family leaves old outer packet and restoration branch unchanged", async () => {
  const backup = makeBackup(org, []), before = JSON.stringify(backup);
  assert.equal(restoredParticipantCheckins(undefined), null); assert.equal(await restoreParticipantCheckins({}, "new_org", undefined), null);
  const exported = await exportParticipantCheckins({ query: async () => ({ rows: [] }) }, "org_A");
  assert.equal(exported, undefined); assert.equal(Object.hasOwn(backup, "participantCheckins"), false);
  assert.deepEqual(validateBackup(backup, "org_A", "author"), []); assert.equal(JSON.stringify(backup), before);
  assert.throws(() => validateBackup(makeBackup(org, [], { participantCheckins: null }), "org_A", "author"));
});
test("full packet grammar admits explicit empty and real orphan history but refuses operational authority", () => {
  const empty = makeBackup(org, [], { participantCheckins: { version: 1, entries: [] } });
  assert.deepEqual(validateBackup(empty, "new_org", "author"), []); assert.deepEqual(restoredParticipantCheckins(empty.participantCheckins), []);
  const packet = makeBackup(org, [], { participantCheckins: makeCheckInBackup([withdrawn()]) });
  validateBackup(packet, "new_org", "author");
  const recovered = restoredParticipantCheckins(packet.participantCheckins);
  assert.deepEqual(makeCheckInBackup(recovered), packet.participantCheckins); assert.equal(recovered[0].liveParticipationId, null);
  const bad = structuredClone(packet.participantCheckins); bad.entries[0].reportReceipt = reported().reportReceipt;
  assert.throws(() => validateBackup(makeBackup(org, [], { participantCheckins: bad }), "new_org", "author"));
});
test("SELECT-only inactive composite projection includes all metadata and is not treated as an SQL-byte proof", async () => {
  const f = restoreMeasurementFixture(), packet = makeBackup(org, [], { participantCheckins: makeCheckInBackup([withdrawn()]) });
  const c = { query: async (sql, args) => { const result = f.query(sql, args); if (result !== undefined) return result; throw Error("Unexpected projection fixture query"); } };
  const measure = await measureLearningRestoreCapacity(c, packet, { orgId: "new_org", actorId: "author" });
  const rows = f.observed.get("os_participation_checkins"); assert.equal(rows.length, 1);
  assert.equal(rows[0].origin_mode, "recovered"); assert.equal(rows[0].live_participation_id, null); assert.equal(rows[0].revision, 1);
  assert.equal(rows[0].report_receipt, null); assert.equal(rows[0].withdrawal_receipt, null); assert.equal(rows[0].withdrawn_at, null);
  assert.equal(rows[0].history.withdrawnAt, withdrawn().history.withdrawnAt);
  assert(measure.categories.os_participation_checkins.bytes > Buffer.byteLength(JSON.stringify(rows[0].history)));
  const legacy = await measureLearningRestoreCapacity(c, makeBackup(org, []), { orgId: "new_org", actorId: "author" });
  assert.equal(Object.hasOwn(legacy.categories, "os_participation_checkins"), false);
  const finalAudit = f.observed.get("os_events").at(-1); assert.equal(Object.hasOwn(finalAudit.detail, "participantCheckinsRecovered"), false);
});
test("SQL-returned physical growth and native growth remain separate, with reserve only for live unwithdrawn", async () => {
  const row = checkInStorageRow(reported(), "org_A", at), calls = [];
  const c = { query: async (sql, args) => {
    calls.push(sql);
    if (sql.startsWith("SELECT t.*")) return { rows: [row] };
    if (sql.startsWith("SELECT count(*)")) return { rows: [{ count: 1, bytes: 1024, max_bytes: 1024, history_bytes: 600, report_bytes: 450, withdrawal_bytes: 0 }] };
    if (sql.startsWith("SELECT t.id")) { assert.equal(JSON.parse(args[1])[0].revision, 2); return { rows: [{ id: row.id, actual: 1024, projected: 1640 }] }; }
    if (sql.startsWith("SELECT octet_length(to_jsonb(e)")) return { rows: [{ bytes: 807 }] };
    throw Error("Unexpected physical-measure fake SQL");
  } };
  const value = await checkCheckInCapacity(c, "org_A");
  assert.equal(value.retainedGrowth, 616); assert.equal(value.auditRetained, 807); assert.equal(value.wholeRetainedReserve, 1423);
  assert.equal(value.pendingWithdrawals, 1); assert.equal(value.nativeGrowth, 22);
  calls.length = 0; const actual = await checkCheckInCapacity(c, "org_A", { reserve: false });
  assert.equal(actual.retainedGrowth, 0); assert.equal(actual.wholeRetainedReserve, 0); assert(!calls.some(sql => sql.startsWith("SELECT t.id")));
  row.origin_mode = "recovered"; row.live_participation_id = null; row.report_receipt = null;
  assert.equal((await checkCheckInCapacity(c, "org_A")).pendingWithdrawals, 0);
});
