/** Exact native/recovery budgeting, called only inside the owning tenant transaction. */
import {
  exportParticipation,
  restoredParticipation,
} from "./participation-backup.mjs";
import { rowRecord, logicalBackupBytes } from "./database.mjs";
import { PARTICIPATION_LIMITS } from "./participation.mjs";
import { fail } from "./security.mjs";
const bytes = (value) => Buffer.byteLength(JSON.stringify(value));
// Count jsonb separator spaces outside JSON strings, including nested objects.
const jsonbBytes = (value) => {
  const json = JSON.stringify(value);
  let extra = 0,
    quoted = false,
    escaped = false;
  for (const char of json) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ":" || char === ",") extra++;
  }
  return Buffer.byteLength(json) + extra;
};
const max = 2147483647,
  digest = "f".repeat(64),
  iso = "2200-12-31T23:59:59.999Z",
  pgStamp = "2200-12-31T23:59:59.999999+14:00";
// Full subobjects deliberately include their already-existing field names and old
// values are not subtracted. This bounds cumulative cancellation AND opt-out,
// including a genuine legacy last_command:null, rather than just a fresh command.
const retainedSafetyShape = {
  last_command: {
    intentHash: digest,
    payloadHash: digest,
    action: "delivery.preference",
    actorHash: digest,
    resultRevision: max,
    notificationQueued: false,
    auditRetained: false,
  },
  delivery_consent: {
    version: "participation-email-v1",
    enabled: false,
    revision: max,
    at: iso,
  },
  cancelled_at: pgStamp,
  updated_at: pgStamp,
  revision: max,
  state: "cancelled",
  consent: { emailUpdates: false },
};
const nativeSafetyShape = {
  revision: max,
  cancelledAt: iso,
  state: "cancelled",
  recoveredState: "cancelled",
  frozen: {
    sourceHistory: { state: "cancelled", consent: { emailUpdates: false } },
  },
};
const bookingSafetyShape = {
  status: "cancelled",
  revision: max,
  last_editor_id: "u".repeat(100),
  updated_at: pgStamp,
  approval: null,
};
const bookingNativeShape = {
  status: "cancelled",
  revision: max,
  lastEditedBy: "u".repeat(100),
  updatedAt: iso,
  approval: null,
};
const policyNativeShape = {
  revision: max,
  enabled: false,
  activatedAt: iso,
  templateVersion: "participation-notice-v1",
  updatedAt: iso,
};
const policySafetyShape = {
  org_id: "o".repeat(100),
  revision: max,
  enabled: false,
  epoch: "f".repeat(32),
  activated_at: pgStamp,
  template_version: "participation-notice-v1",
  last_command: {
    intentHash: digest,
    payloadHash: digest,
    actorHash: digest,
    action: "delivery.disable",
    result: {
      policy: {
        revision: max,
        enabled: false,
        templateVersion: "participation-notice-v1",
      },
      cancelled: 8000,
      auditRetained: false,
    },
  },
  updated_at: pgStamp,
};
export const PARTICIPATION_SAFETY_RESERVE = Object.freeze({
  retained: jsonbBytes(retainedSafetyShape),
  native: bytes(nativeSafetyShape),
  bookingRetained: jsonbBytes(bookingSafetyShape),
  bookingNative: bytes(bookingNativeShape),
  policyRetained: jsonbBytes(policySafetyShape),
  policyNative: bytes(policyNativeShape),
});
const refuse = () =>
  fail(
    422,
    "participation_backup_size",
    "The complete participation backup and inactive recovery would exceed their retained limits. This change was rolled back; existing work remains available.",
  );
export async function checkParticipationExportCapacity(
  c,
  org,
  { reserve = true } = {},
) {
  const exported = await exportParticipation(c, org);
  for (const [key, limit] of [
    ["targets", PARTICIPATION_LIMITS.targetBytes],
    ["participations", PARTICIPATION_LIMITS.participationBytes],
    ["outbox", PARTICIPATION_LIMITS.outboxBytes],
  ])
    if (bytes(exported[key]) > limit) refuse();
  const records = (
    await c.query("SELECT * FROM os_records WHERE org_id=$1", [org])
  ).rows.map(rowRecord);
  const submissions = (
    await c.query("SELECT id FROM os_intake WHERE org_id=$1", [org])
  ).rows;
  const normalized = restoredParticipation({
    records,
    intake: { submissions },
    participation: exported,
  });
  const active =
    exported.version === 3 && reserve ? exported.participations.length : 0;
  const retainedReserve = active * PARTICIPATION_SAFETY_RESERVE.retained,
    nativeReserve = active * PARTICIPATION_SAFETY_RESERVE.native;
  for (const [key, limit] of [
    ["targets", PARTICIPATION_LIMITS.targetBytes],
    ["participations", PARTICIPATION_LIMITS.participationBytes],
    ["outbox", PARTICIPATION_LIMITS.outboxBytes],
  ]) {
    if (
      bytes(exported[key]) + (key === "participations" ? nativeReserve : 0) >
        limit ||
      bytes(normalized[key]) + (key === "participations" ? nativeReserve : 0) >
        limit
    )
      refuse();
  }
  if (retainedReserve) {
    const used = Number(
      (
        await c.query(
          "SELECT COALESCE(sum(octet_length(to_jsonb(t)::text)),0) AS bytes FROM os_participations t WHERE org_id=$1",
          [org],
        )
      ).rows[0].bytes,
    );
    if (used + retainedReserve > PARTICIPATION_LIMITS.participationBytes)
      refuse();
  }
  return {
    version: exported.version,
    retainedReserve,
    nativeReserve,
    exportBytes: bytes(exported),
    normalizedBytes: bytes(normalized),
    safetyRetained:
      exported.version === 3
        ? exported.participations.length *
            (PARTICIPATION_SAFETY_RESERVE.retained +
              PARTICIPATION_SAFETY_RESERVE.bookingRetained) +
          PARTICIPATION_SAFETY_RESERVE.policyRetained
        : 0,
    safetyNative:
      exported.version === 3
        ? exported.participations.length *
            (PARTICIPATION_SAFETY_RESERVE.native +
              PARTICIPATION_SAFETY_RESERVE.bookingNative) +
          PARTICIPATION_SAFETY_RESERVE.policyNative
        : 0,
    wholeRetainedReserve:
      active *
        (PARTICIPATION_SAFETY_RESERVE.retained +
          PARTICIPATION_SAFETY_RESERVE.bookingRetained) +
      (exported.version === 3 && reserve
        ? PARTICIPATION_SAFETY_RESERVE.policyRetained
        : 0),
    wholeNativeReserve:
      active *
        (PARTICIPATION_SAFETY_RESERVE.native +
          PARTICIPATION_SAFETY_RESERVE.bookingNative) +
      (exported.version === 3 && reserve
        ? PARTICIPATION_SAFETY_RESERVE.policyNative
        : 0),
  };
}

export function checkCombinedParticipationCapacity(whole, participation) {
  if (
    whole.requiredUsage +
      (participation.wholeRetainedReserve ?? participation.retainedReserve) >
      60 * 1024 * 1024 ||
    whole.requiredBackupBytes +
      (participation.wholeNativeReserve ?? participation.nativeReserve) >
      64 * 1024 * 1024
  )
    refuse();
  if (
    whole.restore &&
    (whole.restore.categories.os_participations.bytes +
      participation.retainedReserve >
      PARTICIPATION_LIMITS.participationBytes ||
      whole.restore.requiredLogicalBytes +
        (participation.wholeRetainedReserve ?? participation.retainedReserve) >
        60 * 1024 * 1024 ||
      whole.restore.backupBytes +
        (participation.wholeNativeReserve ?? participation.nativeReserve) >
        64 * 1024 * 1024)
  )
    refuse();
}

/** Read-only exporters never call audit. On an incomplete intermediate view, omit
 * the optional journal conservatively; the final transaction still checks its
 * complete actual graph and hard caps before commit. No raw error is surfaced. */
export async function canRetainParticipationSafetyAudit(c, org, event) {
  try {
    if ((await exportParticipation(c, org)).version !== 3) return true;
    const participation = await checkParticipationExportCapacity(c, org, {
      reserve: false,
    });
    const { assembleWorkspaceBackup } = await import("./workspace-backup.mjs");
    const { measureLearningOperationalCapacity } = await import(
      "./learning-capacity.mjs"
    );
    const backup = await assembleWorkspaceBackup(c, org);
    const usage = await logicalBackupBytes(c, org);
    const operational = await measureLearningOperationalCapacity(
      c,
      org,
      backup.participation,
    );
    const candidate = {
      ...event,
      id: "9223372036854775807",
      created_at: pgStamp,
    };
    const eventBound = jsonbBytes(candidate);
    return (
      usage +
        operational.sourceLogicalGrowthBytes +
        participation.safetyRetained +
        eventBound <=
        61 * 1024 * 1024 &&
      bytes(backup) +
        operational.sourceWireGrowthBytes +
        participation.safetyNative +
        eventBound <=
        64 * 1024 * 1024
    );
  } catch {
    return false;
  }
}
export async function checkActualParticipationSafetyPacket(c, org) {
  const { assembleWorkspaceBackup } = await import("./workspace-backup.mjs");
  const backup = await assembleWorkspaceBackup(c, org);
  if (bytes(backup) > 64 * 1024 * 1024) refuse();
}
