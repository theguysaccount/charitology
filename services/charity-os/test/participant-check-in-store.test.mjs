import test from "node:test";
import assert from "node:assert/strict";
import { at, reported, withdrawn } from "../test-fixtures/participant-check-in.mjs";
import { checkInStorageRow, checkInRecordFromRow, saveCheckInWithdrawal, insertCheckIn, checkInQuota, checkInServerClock } from "../lib/participant-check-in-store.mjs";
import { makeCheckInBackup, restoreCheckInBackup } from "../lib/participant-check-in-model.mjs";
import { checkCombinedCheckInCapacity, boundedCheckInWithdrawal } from "../lib/participant-check-in-capacity.mjs";

test("physical live row keeps original history immutable while typed withdrawal maps back exactly", () => {
  const before = checkInStorageRow(reported(), "org_A", at), after = checkInStorageRow(withdrawn(), "org_A", at);
  assert.deepEqual(before.history, after.history);
  assert.deepEqual(before.report_receipt, after.report_receipt);
  assert.equal(after.history.withdrawnAt, null);
  assert.equal(after.withdrawn_at, withdrawn().history.withdrawnAt);
  assert.deepEqual(checkInRecordFromRow(after), withdrawn());
  assert.throws(() => checkInStorageRow(reported(), "other_org", at), e => e.code === "checkin_context");
  assert.throws(() => checkInRecordFromRow({ ...after, history: withdrawn().history }), e => e.code === "checkin_storage");
});
test("recovered orphan retains historical withdrawal but receives no live FK/receipt and roundtrips", () => {
  const original = makeCheckInBackup([withdrawn()]), record = restoreCheckInBackup(original)[0];
  const row = checkInStorageRow(record, "new_org", at);
  assert.equal(row.live_participation_id, null); assert.equal(row.report_receipt, null); assert.equal(row.withdrawal_receipt, null); assert.equal(row.withdrawn_at, null);
  assert.deepEqual(makeCheckInBackup([checkInRecordFromRow(row)]), original);
  assert.throws(() => checkInRecordFromRow({ ...row, withdrawn_at: at }), e => e.code === "checkin_storage");
});
test("one terminal SQL update cannot replace original claim or report receipt", async () => {
  const calls = [], c = { query: async (...args) => { calls.push(args); return { rows: [{ id: "claim_1" }] }; } };
  await saveCheckInWithdrawal(c, "org_A", reported(), withdrawn());
  assert.equal(calls.length, 1); assert.match(calls[0][0], /SET revision=2,withdrawn_at=\$3,withdrawal_receipt=\$4::jsonb,updated_at=\$3/);
  assert.doesNotMatch(calls[0][0], /SET history|SET report_receipt/);
  const changed = structuredClone(withdrawn()); changed.reportReceipt.intentHash = "0".repeat(64);
  await assert.rejects(saveCheckInWithdrawal(c, "org_A", reported(), changed), e => e.code === "checkin_context"); assert.equal(calls.length, 1);
  await assert.rejects(saveCheckInWithdrawal({ query: async () => ({ rows: [] }) }, "org_A", reported(), withdrawn()), e => e.code === "checkin_context");
});
test("INSERT binds exact admitted JSON and owns SQL metadata without implicit host timestamps", async () => {
  let call; await insertCheckIn({ query: async (...args) => { call = args; return { rows: [] }; } }, "org_A", reported(), at);
  assert.equal(call[1].length, 11); assert.deepEqual(JSON.parse(call[1][5]), reported().history); assert.equal(call[1][9], at); assert.equal(call[1][10], at);
  await assert.rejects(insertCheckIn({}, "org_A", reported(), undefined), e => e.code === "checkin_time");
});
test("full SQL composite quota rejects physical expansion separately from compact model validity", async () => {
  const valid = { count: "1", bytes: "8192", max_bytes: "8192", history_bytes: "2048", report_bytes: "1024", withdrawal_bytes: "0" };
  const c = value => ({ query: async sql => { assert.match(sql, /octet_length\(to_jsonb\(t\)::text\)/); return { rows: [value] }; } });
  assert.equal((await checkInQuota(c(valid), "org_A")).bytes, 8192);
  for (const [key, value] of [["bytes", 4194305], ["count", 2001], ["max_bytes", 8193], ["history_bytes", 2049], ["report_bytes", 1025], ["withdrawal_bytes", 1025], ["bytes", "NaN"]])
    await assert.rejects(checkInQuota(c({ ...valid, [key]: value }), "org_A"), e => e.code === "checkin_limit");
});
test("server clock is one materialized SQL instant with raw cutoff and canonical-ms returned value", async () => {
  let sql; const c = { query: async (text, values) => { sql = text; assert.deepEqual(values, ["2026-11-07T09:00:00Z", "2026-11-07T12:00:00Z", null]); return { rows: [{ server_now: at, reason: "after-window", claim_not_future: null }] }; } };
  const result = await checkInServerClock(c, { startAt: "2026-11-07T09:00:00Z", endAt: "2026-11-07T12:00:00Z" });
  assert.equal(result.reason, "after-window"); assert.equal(result.serverNow, at);
  assert.equal((sql.match(/clock_timestamp\(\)/g) || []).length, 1); assert.match(sql, /MATERIALIZED/); assert.match(sql, /n>\$2::timestamptz\+86400000\*interval '1 millisecond'/); assert.doesNotMatch(sql, /now\(\)/);
});
test("combined allowances use required operational totals and both source/inactive caps", () => {
  const full = { requiredUsage: 60 * 1024 * 1024 - 100, requiredBackupBytes: 64 * 1024 * 1024 - 100 };
  const s = { wholeRetainedReserve: 60, wholeNativeReserve: 60 }, p = { wholeRetainedReserve: 60, wholeNativeReserve: 60 };
  assert.throws(() => checkCombinedCheckInCapacity({ usage: 0, backupBytes: 0, ...full }, s, p), e => e.code === "checkin_capacity");
  checkCombinedCheckInCapacity(full, { wholeRetainedReserve: 40, wholeNativeReserve: 40 }, p);
  assert.throws(() => checkCombinedCheckInCapacity({ ...full, requiredUsage: 0, requiredBackupBytes: 0, restore: { requiredLogicalBytes: full.requiredUsage + 51, backupBytes: full.requiredBackupBytes } }, s, p));
});
test("future withdrawal bound preserves report identity/original claim and keeps false audit result", () => {
  const before = reported(), future = boundedCheckInWithdrawal(before);
  assert.deepEqual(future.reportReceipt, before.reportReceipt); assert.equal(future.history.claimSha256, before.history.claimSha256);
  assert.equal(future.withdrawalReceipt.result.auditRetained, false); assert.equal(before.history.withdrawnAt, null);
  assert.equal(restoreCheckInBackup(makeCheckInBackup([future]))[0].reportReceipt, null);
});
