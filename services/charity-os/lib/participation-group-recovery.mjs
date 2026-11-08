/** Inactive workspace history only. Caller owns tenant authorization, the
 * organization lock, empty-destination admission and complete capacity checks. */
import { fail } from "./security.mjs";
import { validateGroupExactStamp } from "./participation-group-model.mjs";
import { makeParticipationGroupsBackup, validateParticipationGroupsBackup } from "./participation-group-backup.mjs";
import { loadGroupInventory, groupQuota, insertRecoveredGroup } from "./participation-group-store.mjs";

export const restoredParticipationGroups = validateParticipationGroupsBackup;

export async function participationGroupHistoryCount(c, org) {
  const counts = await groupQuota(c, org);
  return counts.groups + counts.receipts;
}

export async function exportParticipationGroups(c, org) {
  const inventory = await loadGroupInventory(c, org);
  return makeParticipationGroupsBackup(inventory.groups.map(group => group.history));
}

export async function restoreParticipationGroups(c, org, input) {
  const packet = restoredParticipationGroups(input);
  if (packet === null) return null;
  const current = await groupQuota(c, org);
  if (current.groups !== 0 || current.receipts !== 0)
    fail(409, "restore_conflict", "Restore requires a destination without group history or command receipts.");
  // Local storage time is separate from every original historical timestamp.
  // No historical key, actor/session pin, roster link or allocation is restored.
  const rows = (await c.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS stored_at_exact")).rows;
  if (rows.length !== 1) fail(500, "participation_group_storage", "Group recovery time is unavailable.");
  const storedAtExact = rows[0].stored_at_exact;
  validateGroupExactStamp(storedAtExact);
  for (const history of packet.groups) await insertRecoveredGroup(c, org, { history, storedAtExact });
  await groupQuota(c, org);
  return packet.groups.length;
}
