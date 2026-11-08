import { fail } from "./security.mjs";
import { requirePermission, inScope, requireAdmin } from "./access.mjs";
import { rowRecord } from "./database.mjs";
import { incubatorHash as H, incubatorSame } from "./incubator-bridge-json.mjs";
import { validateIncubatorProgramPin } from "./incubator-bridge-model.mjs";

const staff = new Set([
  "owner",
  "admin",
  "program_lead",
  "grants_lead",
  "finance_reviewer",
  "contributor",
]);
export const incubatorUnavailable = () =>
  fail(
    404,
    "incubator_unavailable",
    "This program or retained selection is unavailable.",
  );
export const incubatorStale = () =>
  fail(
    409,
    "incubator_stale",
    "The program, selected source, history or access changed. Inspect and review again.",
  );
export function requireIncubatorScope(member, programId) {
  if (member.programIds.length && !member.programIds.includes(programId))
    incubatorUnavailable();
}
export function requireIncubatorMember(member, { administrator = false } = {}) {
  if (!staff.has(member.role))
    fail(
      403,
      "incubator_role",
      "This source material is available to authorized staff writers only.",
    );
  requirePermission("programs", member, "read");
  requirePermission("projects", member, "read");
  requirePermission("projects", member, "write");
  if (administrator) requireAdmin(member);
}
export async function currentIncubatorMember(c, org, session, options = {}) {
  const current = await c.query(
    'SELECT 1 FROM "session" s JOIN "user" u ON u.id=s."userId" WHERE s.id=$1 AND s."userId"=$2 AND s."expiresAt">clock_timestamp() AND u."emailVerified"=true' +
      (options.readOnly ? "" : " FOR SHARE OF s"),
    [session.session.id, session.user.id],
  );
  if (!current.rowCount)
    fail(401, "session", "Sign in again before continuing this source review.");
  const row = (
    await c.query(
      "SELECT user_id,role,program_ids,revision,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_exact FROM os_members WHERE org_id=$1 AND user_id=$2",
      [org, session.user.id],
    )
  ).rows[0];
  if (!row)
    fail(
      403,
      "membership",
      "This organization is unavailable or your access has ended.",
    );
  const member = {
    userId: row.user_id,
    role: row.role,
    programIds: row.program_ids,
    revision: row.revision,
    createdAtExact: row.created_exact,
  };
  member.membershipSha256 = H("membership", {
    userId: member.userId,
    role: member.role,
    programIds: [...member.programIds].sort(),
    revision: member.revision,
    createdAtExact: member.createdAtExact,
  });
  requireIncubatorMember(member, options);
  return member;
}
export const incubatorSessionHash = (session) =>
  H("session", { sessionId: session.session.id });
export const incubatorActorHash = (member, session) =>
  H("actor-binding", {
    actorId: member.userId,
    sessionSha256: incubatorSessionHash(session),
    memberCreatedAtExact: member.createdAtExact,
  });

export async function currentIncubatorProgram(c, org, pin, member) {
  validateIncubatorProgramPin(pin);
  const raw = (
    await c.query(
      "SELECT * FROM os_records WHERE org_id=$1 AND id=$2 AND deleted_at IS NULL",
      [org, pin.recordId],
    )
  ).rows[0];
  if (!raw) incubatorUnavailable();
  const record = rowRecord(raw);
  if (
    record.moduleId !== "programs" ||
    record.data.kind !== "program" ||
    !inScope(record, member)
  )
    incubatorUnavailable();
  if (
    record.revision !== pin.revision ||
    H("program-data", record.data) !== pin.dataSha256
  )
    incubatorStale();
  return record;
}

/** Restores revoke unapplied authority and accepted replay, without comparing
 * historical pins with later, ordinarily editable program/candidate data. */
export async function incubatorRestoreEpoch(c, org, recordIds) {
  const records = [];
  for (const recordId of [...new Set(recordIds)].sort()) {
    const row = (
      await c.query(
        "SELECT max(id)::text AS id FROM os_events WHERE org_id=$1 AND record_id=$2 AND action='record.restored'",
        [org, recordId],
      )
    ).rows[0];
    records.push({ recordId, lastRestoredAuditId: row?.id ?? null });
  }
  return H("restore-epoch", { orgId: org, records });
}
export function requireIncubatorAuthority(payload, member, session, epoch) {
  if (
    payload.actorId !== member.userId ||
    payload.sessionSha256 !== incubatorSessionHash(session) ||
    payload.membershipSha256 !== member.membershipSha256 ||
    payload.memberCreatedAtExact !== member.createdAtExact ||
    payload.actorBindingHash !== incubatorActorHash(member, session) ||
    payload.restoreEpochSha256 !== epoch
  )
    incubatorStale();
}
export function incubatorAuthority(member, session, restoreEpochSha256) {
  return {
    actorId: member.userId,
    sessionSha256: incubatorSessionHash(session),
    membershipSha256: member.membershipSha256,
    memberCreatedAtExact: member.createdAtExact,
    actorBindingHash: incubatorActorHash(member, session),
    restoreEpochSha256,
  };
}
export const sameIncubatorPin = incubatorSame;
