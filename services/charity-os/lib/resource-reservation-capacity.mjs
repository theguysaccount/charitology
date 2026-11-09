/** SQL and native size projections for one bounded terminal step per hold. */
import { fail } from "./security.mjs";
import { measureFeedbackIntakeRemaining } from "./feedback-intake-capacity.mjs";
import { ownGroupValue } from "./participation-group-model.mjs";
import {
  RESOURCE_RESERVATION_LIMITS as limits,
  makeResourceReservationsBackup,
  resourceReservationProofSha256,
  validateResourceReservationRow,
} from "./resource-reservation-ledger.mjs";
import {
  loadResourceReservationInventory,
  projectResourceReservationCommandStorage,
  projectResourceReservationStorageRow,
} from "./resource-reservation-store.mjs";

const ordinaryLimit = 60 * 1024 * 1024;
const legacySafetyLimit = 61 * 1024 * 1024;
const nativeLimit = 64 * 1024 * 1024;
const stamp = "9999-12-31T23:59:59.999999Z";
const digest = "f".repeat(64);
// Valid BMP text uses at most three UTF-8 bytes per UTF-16 unit. Escaped
// quotes/backslashes use two. Model-admitted astral characters use four per pair.
const reason = "\u0800".repeat(limits.reasonCharacters);
const bytes = value => value === undefined ? 0 : Buffer.byteLength(JSON.stringify(value));
const over = () => fail(422, "resource_reservation_capacity", "The workspace must retain enough capacity to release its reservations and reconcile recovered claims.");
const need = condition => { if (!condition) over(); };
const integer = value => {
  need(Number.isSafeInteger(value) && value >= 0);
  return value;
};
const total = values => integer(values.reduce((sum, value) => sum + integer(value), 0));
const proofOf = row => row.proof ?? row.history.proof;

function sourceRefs(rows) {
  const found = new Map();
  for (const row of rows) {
    const proof = proofOf(row);
    for (const pin of [proof.asset, proof.session]) {
      need(!found.has(pin.id) || found.get(pin.id).moduleId === pin.moduleId);
      found.set(pin.id, { id: pin.id, moduleId: pin.moduleId });
    }
  }
  return [...found.values()];
}

function releaseDecision(row) {
  const proof = proofOf(row);
  return {
    operation: "release", orgId: proof.orgId, actorSha256: digest, acceptedAtExact: stamp,
    previous: { id: row.id, proofSha256: resourceReservationProofSha256(proof), state: "released", revision: 2 },
    next: null, reason,
  };
}

function boundedLiveRelease(row, commandHash) {
  return validateResourceReservationRow({
    ...row, state: "released", revision: 2, terminalReceipt: {
      version: 1, decision: releaseDecision(row), commandHash, requestHash: digest,
      authority: { actorSha256: digest, sessionSha256: digest, membershipSha256: digest,
        memberCreatedAtExact: stamp, restoreEpochSha256: digest }, reviewSha256: null,
    },
  });
}

function boundedDisposition(row) {
  return validateResourceReservationRow({
    ...row, state: "released", revision: 2, history: {
      ...row.history, disposition: { orgId: row.orgId, actorSha256: digest, acceptedAtExact: stamp, reason },
    },
  });
}

function boundedReleasedSource(row) {
  return validateResourceReservationRow({
    ...row, state: "released", history: {
      ...row.history, sourceState: "released", terminal: releaseDecision(row),
    },
  });
}

const tables = Object.freeze({
  reservations: "os_resource_reservations",
  commands: "os_resource_reservation_commands",
});

async function measureRows(c, key, rows) {
  if (!rows.length) return [];
  const table = tables[key];
  need(typeof table === "string" && rows.length <= limits.rows);
  const result = await c.query(`SELECT item.ordinality::int AS position,octet_length(to_jsonb(r)::text) AS bytes,
    to_jsonb(r)=item.value AS exact FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY item(value,ordinality)
    CROSS JOIN LATERAL jsonb_populate_record(NULL::${table},item.value) r ORDER BY item.ordinality`, [JSON.stringify(rows)]);
  need(Array.isArray(result.rows) && result.rows.length === rows.length);
  return result.rows.map((item, index) => {
    need(item.position === index + 1 && item.exact === true);
    return integer(item.bytes);
  });
}

/** Extra source bytes above the two actual family composites already charged
 * by logicalBackupBytes and the current native block already in the backup. */
export async function measureResourceReservationRemaining(c, org, namespace) {
  if (namespace === undefined) return null;
  const inventory = await loadResourceReservationInventory(c, org);
  const refs = sourceRefs(inventory.rows);
  const actual = makeResourceReservationsBackup(org, inventory.rows, refs);
  need(actual && actual.checksum === namespace.checksum);
  const used = new Set(inventory.rows.flatMap(row =>
    [row.originalReceipt?.commandHash, row.terminalReceipt?.commandHash].filter(Boolean)));
  const originals = [], successors = [], newCommands = [];
  let keyIndex = 0;
  const projected = inventory.rows.map(row => {
    if (row.state !== "reserved") return row;
    let next;
    if (row.originMode === "live") {
      let key;
      do { key = (++keyIndex).toString(16).padStart(64, "0"); } while (used.has(key));
      used.add(key);
      next = boundedLiveRelease(row, key);
      newCommands.push(projectResourceReservationCommandStorage(next.terminalReceipt));
    } else next = boundedDisposition(row);
    originals.push(projectResourceReservationStorageRow(row));
    successors.push(projectResourceReservationStorageRow(next));
    return next;
  });
  need(inventory.quota.commands + newCommands.length <= 2 * inventory.rows.length);
  const before = await measureRows(c, "reservations", originals);
  const after = await measureRows(c, "reservations", successors);
  const commands = await measureRows(c, "commands", newCommands);
  const retainedGrowthBytes = total(after.map((size, index) => Math.max(0, size - before[index]))) + total(commands);
  const future = makeResourceReservationsBackup(org, projected, refs);
  const nativeGrowthBytes = Math.max(0, bytes(future) - bytes(actual));
  need(inventory.quota.bytes + retainedGrowthBytes <= limits.familyBytes &&
    bytes(actual) + nativeGrowthBytes <= limits.familyBytes);
  return Object.freeze({
    retainedBytes: inventory.quota.bytes,
    nativeBytes: bytes(actual),
    retainedGrowthBytes,
    nativeGrowthBytes,
    pendingReleases: newCommands.length,
    pendingDispositions: successors.length - newCommands.length,
  });
}

/** Restored rows have no live receipts. An open historical claim can consume
 * one disposition, or the next source packet can contain its terminal release.
 * Use the larger result per row independently for SQL and native sizes. */
export async function measureResourceReservationRestore(c, org, recovery) {
  if (recovery === null) return null;
  const { rows } = recovery;
  const refs = sourceRefs(rows);
  const actual = makeResourceReservationsBackup(org, rows, refs);
  const base = await measureRows(c, "reservations", rows.map(projectResourceReservationStorageRow));
  const positions = [], disposition = [], terminal = [];
  for (const [index, row] of rows.entries()) {
    if (row.state !== "reserved") continue;
    positions.push(index);
    disposition.push(boundedDisposition(row));
    terminal.push(boundedReleasedSource(row));
  }
  const disposedSizes = await measureRows(c, "reservations", disposition.map(projectResourceReservationStorageRow));
  const terminalSizes = await measureRows(c, "reservations", terminal.map(projectResourceReservationStorageRow));
  const largestSql = [...base], largestNative = [...rows];
  for (const [offset, index] of positions.entries()) {
    largestSql[index] = Math.max(base[index], disposedSizes[offset], terminalSizes[offset]);
    for (const variant of [disposition[offset], terminal[offset]]) {
      if (bytes(variant.history) > bytes(largestNative[index].history))
        largestNative[index] = variant;
    }
  }
  const namespace = makeResourceReservationsBackup(org, largestNative, refs);
  const retainedBytes = total(base), projectedRetainedBytes = total(largestSql);
  need(projectedRetainedBytes <= limits.familyBytes && bytes(namespace) <= limits.familyBytes);
  return Object.freeze({
    count: rows.length, retainedBytes, projectedRetainedBytes, namespace,
    nativeBytes: bytes(actual), projectedNativeBytes: bytes(namespace),
    pendingDispositions: positions.length,
  });
}

async function measureAudit(c, org, input) {
  if (input === null) return { retained: 0, native: 0 };
  const event = ownGroupValue(input);
  const keys = ["org_id", "actor_id", "action", "record_id", "module_id", "detail"];
  need(event && Object.keys(event).length === keys.length && keys.every(key => Object.hasOwn(event, key)) &&
    event.org_id === org && typeof event.action === "string" && event.action.length <= 100);
  const bounded = { ...event, id: "9223372036854775807", created_at: "2200-12-31T23:59:59.999999Z" };
  const found = (await c.query(`SELECT octet_length(to_jsonb(e)::text) AS bytes
    FROM jsonb_populate_record(NULL::os_events,$1::jsonb) e`, [JSON.stringify(bounded)])).rows;
  need(found.length === 1 && integer(found[0].bytes) > 0);
  return { retained: found[0].bytes, native: bytes({ ...bounded, created_at: "2200-12-31T23:59:59.999Z" }) + 2 };
}

async function safety(c, org, features) {
  if (features.reminders) {
    const { checkReminderSafetyCapacity } = await import("./participation-reminder-capacity.mjs");
    return { capacity: await checkReminderSafetyCapacity(c, org), limit: legacySafetyLimit };
  }
  if (features.groups) {
    const { checkGroupSafetyCapacity } = await import("./participation-group-safety-capacity.mjs");
    return { capacity: await checkGroupSafetyCapacity(c, org), limit: legacySafetyLimit };
  }
  const { assembleWorkspaceBackup } = await import("./workspace-backup.mjs");
  const { logicalBackupBytes } = await import("./database.mjs");
  const { measureLearningOperationalCapacity } = await import("./learning-capacity.mjs");
  const { checkParticipationExportCapacity } = await import("./participation-capacity.mjs");
  const { checkCheckInCapacity } = await import("./participant-check-in-capacity.mjs");
  const backup = await assembleWorkspaceBackup(c, org, { features });
  const resources = await measureResourceReservationRemaining(c, org, backup.resourceReservations);
  const feedback = await measureFeedbackIntakeRemaining(c, org, backup.intake, { expected: features.feedback === true });
  need(resources || feedback);
  const operating = await measureLearningOperationalCapacity(c, org, backup.participation);
  const participation = backup.participation.targets.length || features.checkins
    ? await checkParticipationExportCapacity(c, org, { reserve: false, legacySafety: features.checkins === true })
    : null;
  const checkins = features.checkins ? await checkCheckInCapacity(c, org) : null;
  const requiredUsage = total([await logicalBackupBytes(c, org), operating.sourceLogicalGrowthBytes,
    participation?.safetyRetained ?? 0, checkins?.wholeRetainedReserve ?? 0, resources?.retainedGrowthBytes ?? 0, feedback?.retainedGrowthBytes ?? 0]);
  const requiredBackupBytes = total([bytes(backup), operating.sourceWireGrowthBytes,
    participation?.safetyNative ?? 0, checkins?.wholeNativeReserve ?? 0, resources?.nativeGrowthBytes ?? 0, feedback?.nativeGrowthBytes ?? 0]);
  return { capacity: { requiredUsage, requiredBackupBytes }, limit: ordinaryLimit };
}

export async function checkWorkspaceExitCapacity(c, org, { extraAudit = null } = {}) {
  const { readWorkspaceFeatures } = await import("./workspace-backup.mjs");
  const features = await readWorkspaceFeatures(c, org);
  if (features?.reservations !== true && features?.feedback !== true) return null;
  const { capacity, limit } = await safety(c, org, features);
  need(capacity);
  const audit = await measureAudit(c, org, extraAudit);
  const requiredUsage = total([capacity.requiredUsage, audit.retained]);
  const requiredBackupBytes = total([capacity.requiredBackupBytes, audit.native]);
  if (features.feedback && (requiredUsage > limit || requiredBackupBytes > nativeLimit))
    fail(422, "feedback_intake_capacity", "The workspace must retain enough room for its remaining feedback and other workspace exits.");
  need(requiredUsage <= limit && requiredBackupBytes <= nativeLimit);
  return Object.freeze({ requiredUsage, requiredBackupBytes });
}

/** Null delegates to the old family guards. False omits only the optional event. */
export async function canRetainWorkspaceExitAudit(c, org, event) {
  try {
    const capacity = await checkWorkspaceExitCapacity(c, org, { extraAudit: event });
    return capacity === null ? null : true;
  } catch {
    return false;
  }
}

// Retain the existing resource hook names for composed callers.
export const checkResourceReservationSafetyCapacity = checkWorkspaceExitCapacity;
export const canRetainResourceReservationSafetyAudit = canRetainWorkspaceExitAudit;
