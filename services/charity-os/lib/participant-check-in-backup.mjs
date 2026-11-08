import { fail } from "./security.mjs";
import { makeCheckInBackup, restoreCheckInBackup } from "./participant-check-in-model.mjs";
import { loadCheckInInventory, checkInStateCount, insertCheckIn, checkInServerClock, checkInQuota } from "./participant-check-in-store.mjs";

export const restoredParticipantCheckins = value => value === undefined ? null : restoreCheckInBackup(value);
export async function exportParticipantCheckins(c, org) {
  return makeCheckInBackup((await loadCheckInInventory(c, org)).records);
}
export async function restoreParticipantCheckins(c, org, value) {
  const records = restoredParticipantCheckins(value);
  if (records === null) return null;
  if (await checkInStateCount(c, org)) fail(409, "restore_conflict", "Restore requires a destination without self-report history.");
  const { serverNow } = await checkInServerClock(c);
  for (const record of records) await insertCheckIn(c, org, record, serverNow);
  await checkInQuota(c, org);
  return records.length;
}
