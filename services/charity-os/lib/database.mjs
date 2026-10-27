import pg from "pg";
import { readFile } from "node:fs/promises";
import { verifiedNeonConnectionString } from "./connection.mjs";
import { id, fail } from "./security.mjs";
import { guardParticipationWrite } from "./participation-guards.mjs";
export function database(url, { schema } = {}) {
  if (schema && !/^[a-z][a-z0-9_]{0,62}$/.test(schema))
    throw new Error("Invalid schema.");
  const pool = new pg.Pool({
    connectionString: verifiedNeonConnectionString(url),
    ...(schema ? { options: `-c search_path=${schema}` } : {}),
    max: 5,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 15000,
  });
  return {
    pool,
    async tx(userId, orgId, fn, { lock = false } = {}) {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        await c.query(
          "SELECT set_config('app.org_id',$1,true),set_config('app.user_id',$2,true)",
          [orgId || "", userId || ""],
        );
        if (lock && orgId)
          await c.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [orgId],
          );
        const result = await fn(c);
        await c.query("COMMIT");
        return result;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    },
    async migrate() {
      await pool.query(
        await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
      );
    },
    async limit(key, max = 5, seconds = 600) {
      const r = await pool.query(
        `INSERT INTO os_rate_limits(key,hits,expires_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN os_rate_limits.expires_at<now() THEN1 ELSE os_rate_limits.hits+1 END,expires_at=CASE WHEN os_rate_limits.expires_at<now() THEN now()+$2*interval '1 second' ELSE os_rate_limits.expires_at END RETURNING hits`.replace(
          "THEN1",
          "THEN 1",
        ),
        [key, seconds],
      );
      if (r.rows[0].hits > max)
        fail(429, "rate", "Please wait before trying again.");
    },
    close: () => pool.end(),
  };
}
export async function audit(c, org, user, action, record = null, detail = {}) {
  const usage = await logicalBackupBytes(c, org);
  if (
    usage + Buffer.byteLength(JSON.stringify(detail)) + 1000 >
    60 * 1024 * 1024
  ) {
    if (action === "backup.exported") return;
    const accessControl = [
      "membership.revoked",
      "membership.changed",
      "invitation.revoked",
      "integration.disabled",
      "intake.cancelled",
      "intake.publication.withdrawn",
      "intake.erased",
      "participant.unlinked",
      "participation.cancelled",
      "participation.preferences",
      "participation.delivery.disabled",
      "participation.delivery.preference_off",
    ].includes(action);
    if (accessControl) {
      detail = {
        targetId:
          detail.userId ||
          detail.id ||
          detail.intakeId ||
          detail.publicationId ||
          null,
        previousRole: detail.previousRole || null,
        role: detail.role || null,
        quotaReserve: true,
      };
      if (
        usage + Buffer.byteLength(JSON.stringify(detail)) + 1000 >
        61 * 1024 * 1024
      ) {
        console.warn(
          "Charity OS access control completed after its audit reserve was exhausted.",
        );
        return;
      }
    } else
      fail(
        422,
        "quota",
        "This workspace reached its60 MiB record, history and file export budget. Export your records before continuing in a new workspace.",
      );
  }
  await c.query(
    "INSERT INTO os_events(org_id,actor_id,action,record_id,module_id,detail) VALUES($1,$2,$3,$4,$5,$6)",
    [
      org,
      user,
      action,
      record?.id || null,
      record?.moduleId || null,
      JSON.stringify(detail),
    ],
  );
}
export function rowRecord(r) {
  return {
    id: r.id,
    orgId: r.org_id,
    moduleId: r.module_id,
    data: r.data,
    status: r.status,
    ownerId: r.owner_id,
    lastEditedBy: r.last_editor_id,
    revision: r.revision,
    approval: r.approval,
    snapshot: r.snapshot,
    source: r.source,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}
export async function allRecords(c, org) {
  return (
    await c.query(
      "SELECT * FROM os_records WHERE org_id=$1 AND deleted_at IS NULL ORDER BY created_at,id",
      [org],
    )
  ).rows.map(rowRecord);
}
export async function saveRecord(c, r, options = {}) {
  await guardParticipationWrite(c, r, options);
  const size = Buffer.byteLength(JSON.stringify(r.data));
  const usage = (
    await c.query(
      "SELECT COALESCE(sum(octet_length(data::text)),0) AS size,count(*) FILTER (WHERE deleted_at IS NULL) AS count FROM os_records WHERE org_id=$1 AND id<>$2",
      [r.orgId, r.id],
    )
  ).rows[0];
  const total = Number(usage.size);
  if (Number(usage.count) >= 2000)
    fail(422, "quota", "This workspace reached its2,000 active record limit.");
  if (total + size > 16 * 1024 * 1024)
    fail(
      422,
      "quota",
      "This workspace reached its16 MiB structured-record limit.",
    );
  r.updatedAt = new Date().toISOString();
  await c.query(
    `INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,revision,approval,snapshot,last_editor_id,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(org_id,id) DO UPDATE SET data=EXCLUDED.data,status=EXCLUDED.status,owner_id=EXCLUDED.owner_id,last_editor_id=EXCLUDED.last_editor_id,revision=EXCLUDED.revision,approval=EXCLUDED.approval,snapshot=EXCLUDED.snapshot,source=EXCLUDED.source,updated_at=now()`,
    [
      r.orgId,
      r.id,
      r.moduleId,
      JSON.stringify(r.data),
      r.status,
      r.ownerId,
      r.revision,
      r.approval ? JSON.stringify(r.approval) : null,
      r.snapshot ? JSON.stringify(r.snapshot) : null,
      r.lastEditedBy || r.ownerId,
      r.source ? JSON.stringify(r.source) : null,
    ],
  );
}

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
  ];
  const sql =
    tables
      .map(
        (table) =>
          `SELECT COALESCE(sum(${table === "os_participation_outbox" ? "GREATEST(octet_length(to_jsonb(t)::text),COALESCE(budget_bytes,0))" : "octet_length(to_jsonb(t)::text)"}),0) AS size FROM ${table} t WHERE org_id=$1`,
      )
      .join(" UNION ALL ") +
    " UNION ALL SELECT COALESCE(sum(ceil(size::numeric/3)*4+1000),0) AS size FROM os_files WHERE org_id=$1";
  return Number(
    (await c.query(`SELECT sum(size) AS size FROM (${sql}) usage`, [org]))
      .rows[0]?.size || 0,
  );
}

// Source archives are separate from the current-workspace export budget. Keep
// both pending and committed payloads bounded, including empty import journals.
export const PREVIEW_LIMITS = Object.freeze({
  pendingCount: 4,
  pendingBytes: 128 * 1024 * 1024,
  committedCount: 32,
  committedBytes: 128 * 1024 * 1024,
});
async function previewUsage(c, org, encoded) {
  const { rows } = await c.query(
    `SELECT count(*) FILTER (WHERE committed_at IS NULL) AS pending_count,
    COALESCE(sum(octet_length(payload::text)) FILTER (WHERE committed_at IS NULL),0) AS pending_bytes,
    count(*) FILTER (WHERE committed_at IS NOT NULL) AS committed_count,
    COALESCE(sum(octet_length(payload::text)) FILTER (WHERE committed_at IS NOT NULL),0) AS committed_bytes,
    octet_length($2::jsonb::text) AS candidate_bytes FROM os_previews WHERE org_id=$1`,
    [org, encoded],
  );
  return Object.fromEntries(
    Object.entries(rows[0]).map(([key, value]) => [key, Number(value)]),
  );
}
function checkArchiveCapacity(usage) {
  if (
    usage.committed_count + 1 > PREVIEW_LIMITS.committedCount ||
    usage.committed_bytes + usage.candidate_bytes >
      PREVIEW_LIMITS.committedBytes
  )
    fail(
      422,
      "archive_quota",
      "This workspace reached its source archive limit of 32 committed previews or 128 MiB. Existing archives remain available to download. Keep those copies and restore into a new empty workspace to continue; no saved archive was deleted.",
    );
}
export async function storePreview(
  c,
  { org, previewId, actorId, kind, payload, checksum, baseRevision },
) {
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [org]);
  // A committed source archive survives expiry. Only unusable pending previews
  // are eligible for cleanup, inside the same organization-locked transaction.
  await c.query(
    "DELETE FROM os_previews WHERE org_id=$1 AND committed_at IS NULL AND expires_at<=now()",
    [org],
  );
  const encoded = JSON.stringify(payload),
    usage = await previewUsage(c, org, encoded);
  checkArchiveCapacity(usage);
  if (
    usage.pending_count + 1 > PREVIEW_LIMITS.pendingCount ||
    usage.pending_bytes + usage.candidate_bytes > PREVIEW_LIMITS.pendingBytes
  )
    fail(
      422,
      "preview_quota",
      "This workspace reached its pending preview limit of 4 previews or 128 MiB. Commit a reviewed preview or wait for unused previews to expire after 30 minutes, then try again. Existing source archives were preserved.",
    );
  await c.query(
    "INSERT INTO os_previews(org_id,id,actor_id,kind,payload,checksum,base_revision,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '30 minutes')",
    [org, previewId, actorId, kind, encoded, checksum, baseRevision],
  );
}
export async function commitPreview(c, org, previewId) {
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [org]);
  const { rows } = await c.query(
    "SELECT payload FROM os_previews WHERE org_id=$1 AND id=$2 AND committed_at IS NULL AND expires_at>now() FOR UPDATE",
    [org, previewId],
  );
  if (!rows[0])
    fail(409, "preview", "This preview expired or has already been imported.");
  checkArchiveCapacity(
    await previewUsage(c, org, JSON.stringify(rows[0].payload)),
  );
  // The caller's record/import writes share this transaction. A later failure
  // rolls the archive transition back too; no independent archive is appended.
  await c.query(
    "UPDATE os_previews SET committed_at=now() WHERE org_id=$1 AND id=$2",
    [org, previewId],
  );
}
