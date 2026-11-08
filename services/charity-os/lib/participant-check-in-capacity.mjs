/** Exact family SQL/native measures; only trusted tenant transactions call this. */
import { fail } from "./security.mjs";
import { CHECK_IN_LIMITS as L, makeCheckInBackup } from "./participant-check-in-model.mjs";
import { loadCheckInInventory, checkInQuota } from "./participant-check-in-store.mjs";

const wireBytes = value => Buffer.byteLength(JSON.stringify(value));
const stamp = "2200-12-31T23:59:59.999Z", digest = "f".repeat(64);
const over = () => fail(422, "checkin_capacity", "The complete self-report and its safe withdrawal must fit the existing storage and backup limits.");
export function boundedCheckInWithdrawal(record) {
  const h = record.history;
  return { ...record, revision: 2, history: { ...h, withdrawnAt: stamp }, withdrawalReceipt: {
    intentHash: digest, payloadHash: digest, actorHash: h.affirmation.actorHash, action: "withdraw",
    result: { action: "withdrawn", id: h.id, revision: 2, claimSha256: h.claimSha256, at: stamp, auditRetained: false } } };
}
export async function checkCheckInCapacity(c, org, { reserve = true } = {}) {
  const inventory = await loadCheckInInventory(c, org), actual = await checkInQuota(c, org);
  const native = makeCheckInBackup(inventory.records), nativeBytes = native === undefined ? 0 : wireBytes(native);
  if (nativeBytes > L.familyBytes) over();
  const future = inventory.records.map(r => reserve && r.originMode === "live" && r.revision === 1 ? boundedCheckInWithdrawal(r) : r);
  const active = inventory.records.filter(r => reserve && r.originMode === "live" && r.revision === 1);
  let retainedGrowth = 0, auditRetained = 0, auditNative = 0;
  if (active.length) {
    const byId = new Map(future.map(r => [r.history.id, r]));
    const projected = inventory.rows.filter(r => active.some(a => a.history.id === r.id)).map(r => ({ ...r,
      revision: 2, withdrawn_at: stamp, withdrawal_receipt: byId.get(r.id).withdrawalReceipt, updated_at: stamp }));
    const sizes = (await c.query("SELECT t.id,octet_length(to_jsonb(t)::text) AS actual,octet_length(to_jsonb(p)::text) AS projected FROM jsonb_array_elements($2::jsonb) item(value) CROSS JOIN LATERAL jsonb_populate_record(NULL::os_participation_checkins,item.value) p JOIN os_participation_checkins t ON t.org_id=$1 AND t.id=p.id ORDER BY t.id", [org, JSON.stringify(projected)])).rows;
    if (sizes.length !== active.length || new Set(sizes.map(s => s.id)).size !== active.length) over();
    for (const s of sizes) {
      const a = Number(s.actual), p = Number(s.projected);
      if (![a, p].every(n => Number.isSafeInteger(n) && n >= 0) || p > L.rowBytes) over();
      retainedGrowth += Math.max(0, p - a);
    }
    // This is an exact full os_events composite bound, not a DTO scalar. The
    // journal remains optional if later safety admission cannot retain it.
    const event = { org_id: "o".repeat(100), id: "9223372036854775807", actor_id: "u".repeat(100),
      action: "participant-checkin.withdrawn", record_id: null, module_id: null,
      detail: { checkInId: "i".repeat(100), claimSha256: digest }, created_at: "2200-12-31T23:59:59.999999Z" };
    const measured = (await c.query("SELECT octet_length(to_jsonb(e)::text) AS bytes FROM jsonb_populate_record(NULL::os_events,$1::jsonb) e", [JSON.stringify(event)])).rows[0];
    const bytes = Number(measured.bytes);
    if (!Number.isSafeInteger(bytes) || bytes <= 0) over();
    auditRetained = bytes * active.length;
    auditNative = (wireBytes({ ...event, created_at: stamp }) + 2) * active.length;
  }
  const futureNative = native === undefined ? 0 : wireBytes(makeCheckInBackup(future));
  const nativeGrowth = Math.max(0, futureNative - nativeBytes);
  if (actual.bytes + retainedGrowth > L.familyBytes || nativeBytes + nativeGrowth > L.familyBytes) over();
  return Object.freeze({ count: actual.count, retainedBytes: actual.bytes, nativeBytes,
    retainedGrowth, nativeGrowth, auditRetained, auditNative, pendingWithdrawals: active.length,
    wholeRetainedReserve: retainedGrowth + auditRetained, wholeNativeReserve: nativeGrowth + auditNative });
}
export function checkCombinedCheckInCapacity(whole, checkins, participation) {
  const pRetained = participation?.wholeRetainedReserve ?? 0, pNative = participation?.wholeNativeReserve ?? 0;
  if (whole.requiredUsage + pRetained + checkins.wholeRetainedReserve > 60 * 1024 * 1024 ||
      whole.requiredBackupBytes + pNative + checkins.wholeNativeReserve > 64 * 1024 * 1024) over();
  // Recovered check-in rows have no live receipts or future withdrawal. The
  // source check above still retains its complete live safety allowance.
  if (whole.restore && (whole.restore.requiredLogicalBytes + pRetained > 60 * 1024 * 1024 ||
      whole.restore.backupBytes + pNative > 64 * 1024 * 1024)) over();
}

/** A safety write consumes its own reserve, never another live claim's exit.
 * This does not purchase new ordinary/restore allocation headroom. */
export async function checkCheckInSafetyCapacity(c, org) {
  const checkins = await checkCheckInCapacity(c, org);
  const { assembleWorkspaceBackup } = await import("./workspace-backup.mjs");
  const { logicalBackupBytes } = await import("./database.mjs");
  const { measureLearningOperationalCapacity } = await import("./learning-capacity.mjs");
  const backup = await assembleWorkspaceBackup(c, org);
  const usage = await logicalBackupBytes(c, org);
  const operational = await measureLearningOperationalCapacity(c, org, backup.participation);
  if (usage + operational.sourceLogicalGrowthBytes + checkins.wholeRetainedReserve > 60 * 1024 * 1024 ||
      wireBytes(backup) + operational.sourceWireGrowthBytes + checkins.wholeNativeReserve > 64 * 1024 * 1024) over();
  return checkins;
}

/** Optional journals cannot spend another assertion's prepaid withdrawal.
 * A partial intermediate graph or failed measure conservatively omits it. */
export async function canRetainCheckInSafetyAudit(c, org, event) {
  try {
    const { checkInStateCount } = await import("./participant-check-in-store.mjs");
    if (!(await checkInStateCount(c, org))) return true;
    const { assembleWorkspaceBackup } = await import("./workspace-backup.mjs");
    const { logicalBackupBytes } = await import("./database.mjs");
    const { measureLearningOperationalCapacity } = await import("./learning-capacity.mjs");
    const { checkParticipationExportCapacity } = await import("./participation-capacity.mjs");
    const backup = await assembleWorkspaceBackup(c, org), usage = await logicalBackupBytes(c, org);
    const operational = await measureLearningOperationalCapacity(c, org, backup.participation);
    const p = await checkParticipationExportCapacity(c, org, { legacySafety: true });
    const checkins = await checkCheckInCapacity(c, org);
    const candidate = { ...event, id: "9223372036854775807", created_at: "2200-12-31T23:59:59.999999Z" };
    const eventBytes = Number((await c.query("SELECT octet_length(to_jsonb(e)::text) AS bytes FROM jsonb_populate_record(NULL::os_events,$1::jsonb) e", [JSON.stringify(candidate)])).rows[0].bytes);
    if (!Number.isSafeInteger(eventBytes) || eventBytes <= 0) return false;
    const eventWire = wireBytes({ ...candidate, created_at: stamp }) + 2;
    return usage + operational.sourceLogicalGrowthBytes + p.wholeRetainedReserve + checkins.wholeRetainedReserve + eventBytes <= 60 * 1024 * 1024 &&
      wireBytes(backup) + operational.sourceWireGrowthBytes + p.wholeNativeReserve + checkins.wholeNativeReserve + eventWire <= 64 * 1024 * 1024;
  } catch { return false; }
}
