// Exact SELECT-only function from d1722b2 database.mjs; source SHA256 ca86fa61696aaaedfa3de8271a05039215c49be2aa61feadb565e67800d3bc6b.
export async function logicalBackupBytes(c, org) {
  const tables = [
    "os_records",
    "os_events",
    "os_comments",
    "os_reports",
    "os_integrations",
    "os_publications",
    "os_intake",
    "os_participant_org_usage",
    "os_participation_targets",
    "os_participations",
    "os_participation_outbox",
    "os_participation_delivery_policies",
    "os_participation_delivery_previews",
    "os_grant_report_previews",
    "os_task_recurrence_series",
    "os_task_recurrence_occurrences",
    "os_resource_directory_history",
    "os_learning_history",
    "os_learning_previews",
  ];
  const sql =
    tables
      .map(
        (table) =>
          `SELECT COALESCE(sum(${table === "os_reports" ? "CASE WHEN payload->>'kind'='learning-review' OR payload->>'methodVersion' LIKE 'learning-%' THEN GREATEST(octet_length(to_jsonb(t)::text),octet_length(payload::text)+4096) ELSE octet_length(to_jsonb(t)::text) END" : ["os_participation_outbox", "os_task_recurrence_series", "os_resource_directory_history", "os_learning_history"].includes(table) ? "GREATEST(octet_length(to_jsonb(t)::text),COALESCE(budget_bytes,0))" : "octet_length(to_jsonb(t)::text)"}),0) AS size FROM ${table} t WHERE org_id=$1`,
      )
      .join(" UNION ALL ") +
    " UNION ALL SELECT COALESCE(sum(ceil(size::numeric/3)*4+1000),0) AS size FROM os_files WHERE org_id=$1";
  return Number(
    (await c.query(`SELECT sum(size) AS size FROM (${sql}) usage`, [org]))
      .rows[0]?.size || 0,
  );
}
