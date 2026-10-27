import { fail, stable } from "./security.mjs";

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
export const intervalsOverlap = (a, b) =>
  Number.isFinite(Date.parse(a?.startAt)) &&
  Number.isFinite(Date.parse(a?.endAt)) &&
  Number.isFinite(Date.parse(b?.startAt)) &&
  Number.isFinite(Date.parse(b?.endAt)) &&
  Date.parse(a.startAt) < Date.parse(b.endAt) &&
  Date.parse(b.startAt) < Date.parse(a.endAt);
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
    ]) ||
      record.status === "cancelled")
  )
    fail(
      409,
      "participation_guard",
      "Resolve all noncancelled participations before cancelling or changing this occurrence's identity, program or schedule.",
    );
  if (parent) {
    const occupied = Number(
      (
        await c.query(
          "SELECT count(*) AS count FROM os_participations WHERE org_id=$1 AND target_id=$2 AND state='confirmed'",
          [org, record.id],
        )
      ).rows[0].count,
    );
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
      "SELECT booking_record_id,contact_id,target_id,frozen FROM os_participations WHERE org_id=$1 AND module_id='volunteers' AND state='confirmed'",
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
    ).rows.map((r) => ({ contactId: r.data.contactId, terms: data, id: r.id }));
  for (const candidate of candidates)
    if (
      commitments.some(
        (p) =>
          p.booking_record_id !== (candidate.id || record.id) &&
          p.contact_id === candidate.contactId &&
          intervalsOverlap(p.frozen?.terms || p.frozen, candidate.terms),
      )
    )
      fail(
        409,
        "participation_overlap",
        "This volunteer has an overlapping confirmed managed assignment.",
      );
}
