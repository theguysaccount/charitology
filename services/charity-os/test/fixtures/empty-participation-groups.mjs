// These historical fixtures contain neither group containers nor receipts.
// Match only the five complete inventory reads and one presence read;
// every other query falls through.
const quotaReads = new Set([
  "SELECT count(*)::int AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes FROM os_participation_groups t WHERE org_id=$1",
  "SELECT count(*)::int AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes FROM os_participation_group_receipts t WHERE org_id=$1",
]);
const inventoryReads = new Set([
  "SELECT group_id,count(*)::int AS count FROM os_participation_group_receipts WHERE org_id=$1 GROUP BY group_id ORDER BY group_id LIMIT 101",
  "SELECT org_id,id,origin_mode,module_id,live_target_id,roster_ids,coordinator_intake_id,state,revision,last_command_hash,history,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at_exact,to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS updated_at_exact FROM os_participation_groups WHERE org_id=$1 ORDER BY id LIMIT 101",
  "SELECT org_id,command_hash,group_id,receipt FROM os_participation_group_receipts WHERE org_id=$1 ORDER BY group_id,command_hash LIMIT 1201",
]);

export function emptyParticipationGroupsQuery(sql, args) {
  const presence = sql === "SELECT count(*)::int AS count FROM os_participation_groups WHERE org_id=$1";
  if (!presence && !quotaReads.has(sql) && !inventoryReads.has(sql)) return undefined;
  if (!Array.isArray(args) || args.length !== 1 ||
      typeof args[0] !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(args[0]))
    throw new Error("Invalid empty group fixture query arguments.");
  if (presence) return { rows: [{ count: 0 }], rowCount: 1 };
  return quotaReads.has(sql)
    ? { rows: [{ count: 0, bytes: "0" }], rowCount: 1 }
    : { rows: [], rowCount: 0 };
}
