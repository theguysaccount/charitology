/** Tenant-locked storage. No function here establishes account ownership. */
import { fail, stable } from "./security.mjs";
import { validInstant } from "./schedule.mjs";
import { CHECK_IN_LIMITS as L, validateCheckInRecord } from "./participant-check-in-model.mjs";

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const checkedId = value => { if (typeof value !== "string" || !ID.test(value)) fail(422, "checkin_fields", "Use a valid self-report identity."); return value; };
export function checkInTimestamp(value) {
  const text = value instanceof Date ? value.toISOString() : value;
  if (!validInstant(text) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(text) || new Date(text).toISOString() !== text)
    fail(422, "checkin_time", "A canonical server processing time is required.");
  return text;
}
export function checkInStorageRow(input, org, timestamp) {
  checkedId(org); const record = validateCheckInRecord(input), h = record.history;
  const at = checkInTimestamp(timestamp);
  if (record.originMode === "live" && h.originOrgId !== org) fail(409, "checkin_context", "This report belongs to another original workspace.");
  return { org_id: org, id: h.id, origin_mode: record.originMode, revision: record.revision,
    live_participation_id: record.liveParticipationId,
    history: record.originMode === "live" ? { ...h, withdrawnAt: null } : h,
    report_receipt: record.reportReceipt,
    withdrawn_at: record.originMode === "live" ? h.withdrawnAt : null,
    withdrawal_receipt: record.withdrawalReceipt, created_at: at, updated_at: at };
}
export function checkInRecordFromRow(row) {
  checkedId(row.org_id); checkedId(row.id);
  if (!row.history || row.history.id !== row.id ||
      (row.origin_mode === "live" && (row.history.originOrgId !== row.org_id || row.history.withdrawnAt !== null)) ||
      (row.origin_mode === "recovered" && row.withdrawn_at !== null))
    fail(422, "checkin_storage", "The retained self-report needs reconciliation.");
  return validateCheckInRecord({ originMode: row.origin_mode, revision: row.revision,
    liveParticipationId: row.live_participation_id,
    history: row.origin_mode === "live" ? { ...row.history, withdrawnAt: row.withdrawn_at === null ? null : checkInTimestamp(row.withdrawn_at) } : row.history,
    reportReceipt: row.report_receipt, withdrawalReceipt: row.withdrawal_receipt });
}
export async function loadCheckInInventory(c, org) {
  const rows = (await c.query("SELECT t.* FROM os_participation_checkins t WHERE org_id=$1 ORDER BY id", [checkedId(org)])).rows;
  if (rows.length > L.records) fail(422, "checkin_limit", "The retained self-report inventory exceeds its limit.");
  return { rows, records: rows.map(checkInRecordFromRow) };
}
export async function checkInStateCount(c, org) {
  return Number((await c.query("SELECT count(*) AS count FROM os_participation_checkins WHERE org_id=$1", [checkedId(org)])).rows[0].count);
}
export async function checkInParentRows(c, org, participationId, { forUpdate = false } = {}) {
  return (await c.query(`SELECT t.* FROM os_participation_checkins t WHERE org_id=$1 AND history->>'participationId'=$2 ORDER BY id${forUpdate ? " FOR UPDATE" : ""}`, [checkedId(org), checkedId(participationId)])).rows;
}
export async function checkInQuota(c, org) {
  const result = (await c.query("SELECT count(*) AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0) AS bytes,COALESCE(max(octet_length(to_jsonb(t)::text)),0) AS max_bytes,COALESCE(max(octet_length(history::text)),0) AS history_bytes,COALESCE(max(octet_length(report_receipt::text)),0) AS report_bytes,COALESCE(max(octet_length(withdrawal_receipt::text)),0) AS withdrawal_bytes FROM os_participation_checkins t WHERE org_id=$1", [checkedId(org)])).rows[0];
  const measured = Object.fromEntries(["count", "bytes", "max_bytes", "history_bytes", "report_bytes", "withdrawal_bytes"].map(k => [k, Number(result[k])]));
  if (Object.values(measured).some(n => !Number.isSafeInteger(n) || n < 0) || measured.count > L.records || measured.bytes > L.familyBytes || measured.max_bytes > L.rowBytes || measured.history_bytes > L.historyBytes || measured.report_bytes > L.receiptBytes || measured.withdrawal_bytes > L.receiptBytes)
    fail(422, "checkin_limit", "The complete retained self-report rows exceed their bounded storage allowance.");
  return measured;
}
export async function insertCheckIn(c, org, record, timestamp) {
  const r = checkInStorageRow(record, org, timestamp), keys = Object.keys(r);
  await c.query("INSERT INTO os_participation_checkins(org_id,id,origin_mode,revision,live_participation_id,history,report_receipt,withdrawn_at,withdrawal_receipt,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9::jsonb,$10,$11)", keys.map(k => ["history", "report_receipt", "withdrawal_receipt"].includes(k) && r[k] !== null ? JSON.stringify(r[k]) : r[k]));
}
export async function saveCheckInWithdrawal(c, org, beforeInput, afterInput) {
  const before = validateCheckInRecord(beforeInput), after = validateCheckInRecord(afterInput);
  const immutable = r => ({ ...r, revision: 1, history: { ...r.history, withdrawnAt: null }, withdrawalReceipt: null });
  if (before.originMode !== "live" || before.revision !== 1 || after.revision !== 2 || stable(immutable(before)) !== stable(immutable(after)))
    fail(409, "checkin_context", "Only the original self-report can be withdrawn once.");
  const result = await c.query("UPDATE os_participation_checkins SET revision=2,withdrawn_at=$3,withdrawal_receipt=$4::jsonb,updated_at=$3 WHERE org_id=$1 AND id=$2 AND origin_mode='live' AND revision=1 AND withdrawn_at IS NULL RETURNING id", [checkedId(org), before.history.id, after.history.withdrawnAt, JSON.stringify(after.withdrawalReceipt)]);
  if (result.rows.length !== 1) fail(409, "checkin_context", "This self-report changed before withdrawal.");
}

/** One volatile clock evaluation, with raw comparisons before ms truncation. */
export async function checkInServerClock(c, range = null, claimedArrivalAt = null) {
  const r = (await c.query("WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS n) SELECT to_char(date_trunc('milliseconds',n) AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS server_now,CASE WHEN $1::timestamptz IS NULL THEN NULL WHEN n<$1::timestamptz THEN 'before-start' WHEN n>$2::timestamptz+86400000*interval '1 millisecond' THEN 'after-window' ELSE NULL END AS reason,CASE WHEN $3::timestamptz IS NULL THEN NULL ELSE $3::timestamptz<=n END AS claim_not_future FROM instant", [range?.startAt ?? null, range?.endAt ?? null, claimedArrivalAt])).rows[0];
  return Object.freeze({ serverNow: checkInTimestamp(r.server_now), reason: r.reason, claimNotFuture: r.claim_not_future });
}
