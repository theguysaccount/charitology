import {
  createParticipationAllocationContext,
  managedAllocationProfile,
  frozenParticipationInterval,
  intervalsOverlap,
} from "./participation-intervals.mjs";
export { intervalsOverlap } from "./participation-intervals.mjs";
import { fail, stable } from "./security.mjs";
import { readVolunteerOrientationMarker, volunteerOrientationForTarget } from "./volunteer-orientation-marker.mjs";

export const participationModule = (m) => ["events", "volunteers"].includes(m);
export const parentKey = (m) => (m === "events" ? "eventId" : "shiftId");
export const targetKind = (m) => (m === "events" ? "session" : "shift");
export const bookingKind = (m) =>
  m === "events" ? "registration" : "assignment";
export const legacyActive = (m, state) =>
  (m === "events"
    ? ["scheduled", "open", "completed"]
    : ["open", "assigned", "completed"]
  ).includes(state);
// Always obtained inside a mutating tenant transaction, after the shared organization lock.
export async function participationValidationContext(c, org) {
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [org]);
  const targets = (
    await c.query(
      "SELECT target_id FROM os_participation_targets WHERE org_id=$1 LIMIT 501",
      [org],
    )
  ).rows;
  const rows = (
    await c.query(
      "SELECT * FROM os_participations WHERE org_id=$1 LIMIT 2001",
      [org],
    )
  ).rows;
  return createParticipationAllocationContext(targets, rows);
}
export async function isManagedParticipationTarget(c, org, targetId) {
  return !!(
    await c.query(
      "SELECT target_id FROM os_participation_targets WHERE org_id=$1 AND target_id=$2",
      [org, targetId],
    )
  ).rows.length;
}
const changed = (before, after, keys) =>
  keys.some((k) => stable(before?.[k] ?? null) !== stable(after?.[k] ?? null));

// Called centrally, before every save/delete/restore. The internal flag is never
// populated from JSON input. This module imports no database module (no cycle).
export async function guardParticipationWrite(
  c,
  record,
  { participationCommand = false, operation = "save" } = {},
) {
  if (record.moduleId === "programs" && (operation === "delete" || record.data?.kind !== "program")) {
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [record.orgId]);
    const orientation = await readVolunteerOrientationMarker(c, record.orgId);
    if (orientation?.marker.programId === record.id)
      fail(409, "volunteer_orientation_source", "Keep the saved program type and its orientation requirement.");
  }
  if (!participationModule(record.moduleId) || participationCommand) return;
  const org = record.orgId,
    m = record.moduleId,
    data = record.data;
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [org]);
  const old = (
    await c.query(
      "SELECT data,status FROM os_records WHERE org_id=$1 AND id=$2",
      [org, record.id],
    )
  ).rows[0];
  if (m === "volunteers" && (data.kind === "shift" || old?.data?.kind === "shift")) {
    const orientation = await volunteerOrientationForTarget(c, org, record);
    if (orientation && (operation === "delete" || data.kind !== "shift" || data.programId !== orientation.marker.programId))
      fail(409, "volunteer_orientation_source", "Keep the shift and program linked to the retained orientation requirement.");
  }
  if (data.kind === "attendance" || old?.data?.kind === "attendance") {
    // A live server audit reserves the helper's original occurrence identity.
    // Full imports archive original events; they never install these receipts.
    const receipts = (
      await c.query(
        "SELECT record_id FROM os_events WHERE org_id=$1 AND action='attendance.draft-created' AND record_id=$2 LIMIT 1",
        [org, record.id],
      )
    ).rows;
    if (
      receipts.length &&
      changed(old?.data, data, ["kind", parentKey(m), "programId", "contactId"])
    )
      fail(
        409,
        "attendance_guard",
        "Keep this attendance record's occurrence identity. Correct its counts through the ordinary revision workflow.",
      );
    const targetId = data.kind === "attendance" ? data[parentKey(m)] : null;
    if (targetId) {
      const reserved = (
        await c.query(
          "SELECT record_id FROM os_events WHERE org_id=$1 AND action='attendance.draft-created' AND detail#>>'{attendanceReceipt,targetId}'=$2 AND record_id<>$3 LIMIT 1",
          [org, targetId, record.id],
        )
      ).rows;
      // Only helper-owned occurrences gain this reservation. Existing manual
      // creation rules and already-linked legacy records remain unchanged.
      const alreadyLinked =
        old?.data?.kind === "attendance" && old.data[parentKey(m)] === targetId;
      if (!alreadyLinked && reserved.length)
        fail(
          409,
          "attendance_exists",
          "A helper-created attendance record reserves this occurrence, including cancelled or trashed records.",
        );
    }
  }
  const targets = (
    await c.query(
      "SELECT * FROM os_participation_targets WHERE org_id=$1 AND (target_id=$2 OR target_id=$3)",
      [org, record.id, data[parentKey(m)] || old?.data?.[parentKey(m)] || null],
    )
  ).rows;
  const history = (
    await c.query(
      "SELECT * FROM os_participations WHERE org_id=$1 AND (booking_record_id=$2 OR target_id=$2)",
      [org, record.id],
    )
  ).rows;
  const linked = history.filter((p) => p.state !== "cancelled");
  if (linked.length && operation === "delete")
    fail(
      409,
      "participation_guard",
      "Cancel every noncancelled participation before deleting its occurrence or booking record.",
    );
  const own = history.find((p) => p.booking_record_id === record.id);
  if (
    own &&
    (changed(old?.data, data, [
      "kind",
      "contactId",
      parentKey(m),
      "programId",
      "startAt",
      "endAt",
      "timeZone",
    ]) ||
      (own.state !== "cancelled" && record.status === "cancelled") ||
      (own.state === "cancelled" && legacyActive(m, record.status)))
  )
    fail(
      409,
      "participation_guard",
      "Allocation identity is historical. Cancel through participation controls and create a new typed candidate to reapply.",
    );
  const parent = targets.find((t) => t.target_id === record.id);
  if (
    parent &&
    linked.length &&
    (changed(old?.data, data, [
      "kind",
      "programId",
      "startAt",
      "endAt",
      "timeZone",
      "allowPartialIntervals",
    ]) ||
      record.status === "cancelled")
  )
    fail(
      409,
      "participation_guard",
      "Resolve all noncancelled participations before cancelling or changing this occurrence's identity, program or schedule.",
    );
  if (parent) {
    const occupied =
      managedAllocationProfile(
        await participationValidationContext(c, org),
        record.id,
      )?.peakOccupied || 0;
    if (
      occupied &&
      (!Number.isSafeInteger(data.capacity) || data.capacity < occupied)
    )
      fail(
        409,
        "participation_capacity",
        "Capacity cannot be unknown or lower than recorded confirmed occupancy.",
      );
  }
  if (
    data.kind === bookingKind(m) &&
    targets.some((t) => t.target_id === data[parentKey(m)]) &&
    legacyActive(m, record.status)
  )
    fail(
      409,
      "participation_gateway",
      "Confirm or cancel a managed occurrence through its participation controls. Generic workflow changes cannot allocate places.",
    );
  // Unmanaged volunteer writes must also respect managed, frozen commitments.
  if (m !== "volunteers" || operation === "delete") return;
  const commitments = (
    await c.query(
      "SELECT * FROM os_participations WHERE org_id=$1 AND module_id='volunteers' AND state='confirmed'",
      [org],
    )
  ).rows;
  if (!commitments.length) return;
  let candidates = [];
  if (data.kind === "assignment" && legacyActive(m, record.status)) {
    const shift = (
      await c.query(
        "SELECT data FROM os_records WHERE org_id=$1 AND id=$2 AND deleted_at IS NULL",
        [org, data.shiftId],
      )
    ).rows[0]?.data;
    if (shift) candidates = [{ contactId: data.contactId, terms: shift }];
  } else if (data.kind === "shift")
    candidates = (
      await c.query(
        "SELECT id,data FROM os_records WHERE org_id=$1 AND module_id='volunteers' AND deleted_at IS NULL AND data->>'kind'='assignment' AND data->>'shiftId'=$2 AND status=ANY($3::text[])",
        [org, record.id, ["open", "assigned", "completed"]],
      )
    ).rows
      .filter((r) => !commitments.some((p) => p.booking_record_id === r.id))
      .map((r) => ({ contactId: r.data.contactId, terms: data, id: r.id }));
  for (const candidate of candidates)
    if (
      commitments.some(
        (p) =>
          p.booking_record_id !== (candidate.id || record.id) &&
          p.contact_id === candidate.contactId &&
          intervalsOverlap(frozenParticipationInterval(p), candidate.terms),
      )
    )
      fail(
        409,
        "participation_overlap",
        "This volunteer has an overlapping confirmed managed assignment.",
      );
}
