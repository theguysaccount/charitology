import { participationChargeJsonSQL, PARTICIPATION_REMINDER_LEGACY_SQL } from "./participation-storage.mjs";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { verifiedNeonConnectionString } from "./connection.mjs";
import { id, fail, stable, HttpError } from "./security.mjs";
import { guardParticipationWrite } from "./participation-guards.mjs";
import { guardTaskRecurrenceWrite } from "./task-recurrence.mjs";
import { guardLearningWrite } from "./learning-guards.mjs";
import { guardResourceReservationWrite, resourceReservationHistoryPresent } from "./resource-reservation-guards.mjs";
import { resourceReservationHistoryExpression, resourceReservationSchemaReady } from "./resource-reservation-schema.mjs";
// Only trusted server actions classify a transaction. HTTP inputs cannot
// supply a deferral flag or a replacement capacity validator.
const transactionAudits = new WeakMap();
const safetyActions = new Set([
  "task-recurrence.ended",
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
  "participation.reminder.preference_off",
  "participant-checkin.withdrawn",
  "participation-group.cancelled",
  "participation-group.closed",
]);
const projectionExemptActions = new Set([...safetyActions, "backup.exported"]);
// Internal only. Each caller reaches this immediately before an exact accepted
// intent/payload early return, after fresh authorization and read-only queries.
// It detects no arbitrary SQL; any recorded audit/action takes precedence.
export function noteParticipationReceiptReplay(c, org) {
  const transaction = transactionAudits.get(c);
  if (transaction?.orgId === org) transaction.receiptReplay = true;
}
// CRM-only call-site contract: fresh authorization and exact accepted receipt,
// immediately before its early return, with no prior domain writes. This is
// not a SQL write detector. Tracked actions before/after always stay ordinary.
export function noteContactReconciliationReceiptReplay(c, org) {
  const transaction = transactionAudits.get(c);
  if (transaction?.orgId === org && transaction.actions.size === 0)
    transaction.receiptReplay = true;
}
async function checkCompleteWorkspaceCapacity(c, orgId, ordinary, requireResourceHistory = false) {
  const resourceHistory = await resourceReservationHistoryExpression(c);
  const present = (
    await c.query(
      `SELECT EXISTS(SELECT 1 FROM os_learning_history WHERE org_id=$1) OR EXISTS(SELECT 1 FROM os_learning_previews WHERE org_id=$1) OR EXISTS(SELECT 1 FROM os_reports WHERE org_id=$1 AND (payload->>'kind'='learning-review' OR payload->>'methodVersion' LIKE 'learning-%')) AS present, EXISTS(SELECT 1 FROM os_participation_targets WHERE org_id=$1) AS participation, EXISTS(SELECT 1 FROM os_incubator_history WHERE org_id=$1) OR EXISTS(SELECT 1 FROM os_previews WHERE org_id=$1 AND committed_at IS NULL AND kind IN ('incubator-source-inspection-v1','incubator-copy-preview-v1')) AS incubator, EXISTS(SELECT 1 FROM os_participation_checkins WHERE org_id=$1) AS checkins, EXISTS(SELECT 1 FROM os_participation_groups WHERE org_id=$1) AS groups, EXISTS(SELECT 1 FROM os_reports WHERE org_id=$1 AND payload->>'format'='charitology-field-response-import') AS field, EXISTS(SELECT 1 FROM os_reports WHERE org_id=$1 AND payload->>'format'='charitology-contact-reconciliation') AS crm, EXISTS(SELECT 1 FROM os_reports WHERE org_id=$1 AND payload->>'format' LIKE 'charitology-participation-occurrence-generation%') OR EXISTS(SELECT 1 FROM os_previews WHERE org_id=$1 AND committed_at IS NULL AND kind='participation-recurrence-v1') AS recurrence, NOT ${PARTICIPATION_REMINDER_LEGACY_SQL} AS reminders, ${resourceHistory} AS "resourceReservations"`,
      [orgId],
    )
  ).rows[0];
  if (requireResourceHistory && present.resourceReservations !== true)
    fail(503, "resource_reservation_admission", "The reservation transaction has no stored history.");
  if (present.recurrence) {
    const { checkParticipationRecurrenceFamilyCapacity } = await import("./participation-recurrence-capacity.mjs");
    await checkParticipationRecurrenceFamilyCapacity(c, orgId);
  }
  if (present.resourceReservations && !ordinary && !present.groups && !present.reminders) {
    const { checkResourceReservationSafetyCapacity } = await import("./resource-reservation-capacity.mjs");
    await checkResourceReservationSafetyCapacity(c, orgId);
    return;
  }
  let participation;
  if (present.participation) {
    const { checkParticipationExportCapacity } = await import(
      "./participation-capacity.mjs"
    );
    participation = await checkParticipationExportCapacity(c, orgId, {
      reserve: ordinary && !present.groups && !present.reminders,
      legacySafety: present.checkins || present.groups || present.reminders,
    });
    if (!ordinary && !present.groups && !present.reminders) {
      const { checkActualParticipationSafetyPacket } = await import(
        "./participation-capacity.mjs"
      );
      await checkActualParticipationSafetyPacket(c, orgId);
    }
  }
  if (present.reminders) {
    const {checkReminderOrdinaryCapacity,checkReminderSafetyCapacity} = await import('./participation-reminder-capacity.mjs');
    if (ordinary) await checkReminderOrdinaryCapacity(c,orgId);
    else await checkReminderSafetyCapacity(c,orgId);
  } else if (present.groups) {
    // GROUP owns the union of the same actual operational baseline,
    // remaining person/booking/policy/outbox exits and check-ins once.
    // Re-purchasing the old full constants after cancellation strands
    // exits. Accepted no-write Replay uses only this remaining gate.
    if (ordinary) {
      const { checkGroupOrdinaryCapacity } = await import("./participation-group-write-capacity.mjs");
      await checkGroupOrdinaryCapacity(c, orgId);
    } else {
      const { checkGroupSafetyCapacity } = await import("./participation-group-safety-capacity.mjs");
      await checkGroupSafetyCapacity(c, orgId);
    }
  }
  if (!present.groups && !present.reminders && (
    (present.present || present.participation || present.incubator || present.checkins || present.field || present.crm || present.recurrence || present.resourceReservations) &&
    ordinary
  )) {
    const { checkWorkspaceExportCapacity } = await import(
      "./workspace-backup.mjs"
    );
    const whole = await checkWorkspaceExportCapacity(c, orgId);
    if (present.checkins) {
      const { checkCheckInCapacity, checkCombinedCheckInCapacity } = await import("./participant-check-in-capacity.mjs");
      const checkins = await checkCheckInCapacity(c, orgId);
      checkCombinedCheckInCapacity(whole, checkins, participation);
    }
    if (participation) {
      const { checkCombinedParticipationCapacity } = await import(
        "./participation-capacity.mjs"
      );
      checkCombinedParticipationCapacity(whole, participation);
    }
  }
  if (present.checkins && !ordinary && !present.groups && !present.reminders) {
    const { checkCheckInSafetyCapacity } = await import("./participant-check-in-capacity.mjs");
    await checkCheckInSafetyCapacity(c, orgId);
  }
  if ((present.incubator || present.checkins || present.field || present.crm || present.recurrence) && !ordinary && !present.groups && !present.reminders) {
    const { checkActualWorkspaceBackupCapacity } = await import(
      "./workspace-backup.mjs"
    );
    await checkActualWorkspaceBackupCapacity(c, orgId);
  }
}

const resourceOrdinaryAudit = {
  reserve: "resource-reservation.reserved",
  replace: "resource-reservation.replaced",
};
const measuredCapacityCodes = new Set([
  "resource_reservation_capacity", "resource_reservation_quota", "quota", "backup_size",
  "learning_backup_size", "learning_operational_capacity", "learning_restore_capacity",
  "participation_backup_size", "checkin_capacity",
]);

function savedReservationPlan(orgId, operation, plan, stored) {
  if (plan?.state !== "ready") return false;
  if (operation === "resolve-recovered") {
    const row = stored?.row;
    return row?.orgId === orgId && row.originMode === "recovered" && row.state === "released" && row.revision === 2 &&
      row.history?.sourceState === "reserved" && row.history?.disposition?.orgId === orgId &&
      stored.quota?.reservations > 0 && stable(plan.row) === stable(row);
  }
  const decision = stored?.receipt?.decision;
  return decision?.orgId === orgId && decision.operation === operation &&
    plan.receipt?.commandHash === stored.receipt.commandHash &&
    plan.receipt?.requestHash === stored.receipt.requestHash &&
    stored.insertedId === (decision.next?.id ?? null) && stored.releasedId === (decision.previous?.id ?? null);
}

/** The mounted reservation route calls this after the complete store plan and
 * any mandatory ordinary audit. Release and disposition spend prepaid growth. */
export async function admitResourceReservationWorkspace(c, { orgId, operation, mode, plan, stored }) {
  const state = transactionAudits.get(c);
  const safety = operation === "release" || operation === "resolve-recovered";
  const validAction = safety ? state?.actions.size === 0 :
    Object.hasOwn(resourceOrdinaryAudit, operation) && state?.actions.size === 1 &&
    state.actions.has(resourceOrdinaryAudit[operation]);
  if (!state?.locked || state.readOnly || state.orgId !== orgId || state.resourceAdmission ||
      mode !== (safety ? "release-safety" : "ordinary") || !validAction ||
      !savedReservationPlan(orgId, operation, plan, stored))
    fail(503, "resource_reservation_admission", "The reservation transaction cannot be admitted.");

  try {
    await checkCompleteWorkspaceCapacity(c, orgId, !safety, true);
  } catch (error) {
    if (error instanceof HttpError && error.status === 422 && measuredCapacityCodes.has(error.code)) return false;
    throw error;
  }
  state.resourceAdmission = { mode, auditRevision: state.auditRevision };
  return true;
}

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
    async tx(userId, orgId, fn, { lock = false, readOnly = false } = {}) {
      const c = await pool.connect();
      const state = {
        orgId,
        locked: Boolean(lock && orgId),
        actions: new Set(),
        auditRevision: 0,
        readOnly,
      };
      transactionAudits.set(c, state);
      try {
        await c.query("BEGIN");
        // Enforce the trusted read classification in PostgreSQL, before any
        // query can acquire a snapshot or perform a write.
        if (readOnly) await c.query("SET TRANSACTION READ ONLY");
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
        // A complete source graph exists here, after all ordinary records,
        // immutable history and mandatory audits. Intermediate audit checks
        // intentionally retain raw SQL accounting below.
        if (!readOnly && orgId && (state.locked || state.actions.size)) {
          const ordinary =
            (!state.actions.size && !state.receiptReplay && state.resourceAdmission?.mode !== "release-safety") ||
            [...state.actions].some((action) => !projectionExemptActions.has(action));
          const mode = ordinary ? "ordinary" : "release-safety";
          // The resource hook has already measured the complete final graph
          // on this client. A later audit or a different class rechecks it.
          if (state.resourceAdmission?.mode !== mode ||
              state.resourceAdmission.auditRevision !== state.auditRevision)
            await checkCompleteWorkspaceCapacity(c, orgId, ordinary);
        }
        await c.query("COMMIT");
        return result;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        transactionAudits.delete(c);
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
  const transaction = transactionAudits.get(c);
  if (transaction && transaction.orgId === org) {
    // Track intent even when an optional or emergency-reserve audit is skipped.
    transaction.actions.add(action);
    transaction.auditRevision++;
    if (!transaction.locked) {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        org,
      ]);
      transaction.locked = true;
    }
  }
  const usage = await logicalBackupBytes(c, org);
  if (
    usage + Buffer.byteLength(JSON.stringify(detail)) + 1000 >
    60 * 1024 * 1024
  ) {
    if (action === "backup.exported") return false;
    const accessControl = safetyActions.has(action);
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
        return false;
      }
    } else
      fail(
        422,
        "quota",
        "This workspace reached its60 MiB record, history and file export budget. Export your records before continuing in a new workspace.",
      );
  }
  const optional = action === "backup.exported" || safetyActions.has(action);
  if (optional && await resourceReservationHistoryPresent(c, org)) {
    const { canRetainResourceReservationSafetyAudit } = await import("./resource-reservation-capacity.mjs");
    const resourceAudit = await canRetainResourceReservationSafetyAudit(c, org, {
      org_id: org, actor_id: user, action, record_id: record?.id || null,
      module_id: record?.moduleId || null, detail,
    });
    if (resourceAudit !== true) return false;
  } else {
    if (action === "backup.exported") {
      const { canRetainIncubatorExportAudit } = await import(
        "./workspace-backup.mjs"
      );
      if (
        !(await canRetainIncubatorExportAudit(c, org, {
          org_id: org,
          actor_id: user,
          action,
          record_id: record?.id || null,
          module_id: record?.moduleId || null,
          detail,
        }))
      )
        return false;
    }
    if (safetyActions.has(action) || action === "backup.exported") {
      const { groupStateCount } = await import("./participation-group-store.mjs");
      const reminderPresent=(await c.query(`SELECT NOT ${PARTICIPATION_REMINDER_LEGACY_SQL} AS present`,[org])).rows[0]?.present;
      if (reminderPresent === true) {
        const {canRetainReminderSafetyAudit}=await import('./participation-reminder-capacity.mjs');
        if (!(await canRetainReminderSafetyAudit(c,org,{org_id:org,actor_id:user,action,record_id:record?.id||null,module_id:record?.moduleId||null,detail}))) return false;
      } else if (await groupStateCount(c, org)) {
        const { canRetainGroupSafetyAudit } = await import("./participation-group-safety-capacity.mjs");
        if (!(await canRetainGroupSafetyAudit(c, org, { org_id: org, actor_id: user, action,
          record_id: record?.id || null, module_id: record?.moduleId || null, detail }))) return false;
      } else {
      const { canRetainCheckInSafetyAudit } = await import("./participant-check-in-capacity.mjs");
      if (!(await canRetainCheckInSafetyAudit(c, org, { org_id: org, actor_id: user, action, record_id: record?.id || null, module_id: record?.moduleId || null, detail }))) return false;
      const { canRetainParticipationSafetyAudit } = await import(
        "./participation-capacity.mjs"
      );
      if (
        !(await canRetainParticipationSafetyAudit(c, org, {
          org_id: org,
          actor_id: user,
          action,
          record_id: record?.id || null,
          module_id: record?.moduleId || null,
          detail,
        }))
      )
        return false;
      }
    }
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
  return true;
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
  await guardTaskRecurrenceWrite(c, r, options);
  await guardLearningWrite(c, r, options);
  await guardResourceReservationWrite(c, r, { operation: options.operation });
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
  const reservationsReady = await resourceReservationSchemaReady(c);
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
    "os_participation_checkins",
    "os_participation_groups",
    "os_participation_group_receipts",
    "os_participation_outbox",
    "os_participation_delivery_policies",
    "os_participation_delivery_previews",
    "os_grant_report_previews",
    "os_task_recurrence_series",
    "os_task_recurrence_occurrences",
    "os_resource_directory_history",
    ...(reservationsReady ? ["os_resource_reservations", "os_resource_reservation_commands"] : []),
    "os_learning_history",
    "os_incubator_history",
    "os_learning_previews",
  ];
  const sql =
    tables
      .map(
        (table) =>
          `SELECT COALESCE(sum(${table === "os_reports" ? "CASE WHEN payload->>'kind'='learning-review' OR payload->>'methodVersion' LIKE 'learning-%' THEN GREATEST(octet_length(to_jsonb(t)::text),octet_length(payload::text)+4096) ELSE octet_length(to_jsonb(t)::text) END" : ["os_participation_outbox", "os_task_recurrence_series", "os_resource_directory_history", "os_learning_history", "os_incubator_history"].includes(table) ? "GREATEST(octet_length(to_jsonb(t)::text),COALESCE(budget_bytes,0))" : table === "os_participations" ? `octet_length(${participationChargeJsonSQL("t")}::text)` : "octet_length(to_jsonb(t)::text)"}),0) AS size FROM ${table} t WHERE org_id=$1`,
      )
      .join(" UNION ALL ") +
    " UNION ALL SELECT COALESCE(sum(ceil(size::numeric/3)*4+1000),0) AS size FROM os_files WHERE org_id=$1" +
    " UNION ALL SELECT COALESCE(sum(octet_length(to_jsonb(t)::text)),0) AS size FROM os_previews t WHERE org_id=$1 AND committed_at IS NULL AND kind IN ('incubator-source-inspection-v1','incubator-copy-preview-v1','participation-recurrence-v1','participation-reminder-v1')";
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
