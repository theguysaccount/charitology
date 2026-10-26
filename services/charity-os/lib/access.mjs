import { modulePermissions, getModule } from "./modules.mjs";
import { fail } from "./security.mjs";
export const administrators = (role) => ["owner", "admin"].includes(role);
export function requireAdmin(member) {
  if (!administrators(member.role))
    fail(403, "role", "An organization administrator is required.");
}
export function requirePermission(moduleId, member, action) {
  if (!modulePermissions(moduleId, member.role)[action])
    fail(403, "role", "Your role does not allow this action.");
}
export function inScope(record, member) {
  if (!member.programIds?.length) return true;
  return record.moduleId === "programs"
    ? member.programIds.includes(record.id)
    : !record.data.programId ||
        member.programIds.includes(record.data.programId);
}
export function visibleRecord(record, member) {
  if (
    !modulePermissions(record.moduleId, member.role).read ||
    !inScope(record, member)
  )
    return null;
  if (
    getModule(record.moduleId).scopeRules.approvedSnapshotsOnly.includes(
      member.role,
    )
  )
    return record.snapshot && inScope(record.snapshot, member)
      ? {
          ...record.snapshot,
          snapshot: record.snapshot,
          approval: record.approval,
        }
      : null;
  return record;
}
export async function membership(c, org, user) {
  const result = await c.query(
    "SELECT * FROM os_members WHERE org_id=$1 AND user_id=$2",
    [org, user],
  );
  const row = result.rows[0];
  if (!row)
    fail(
      403,
      "membership",
      "This organization is unavailable or your access has ended.",
    );
  return {
    userId: row.user_id,
    role: row.role,
    programIds: row.program_ids,
    revision: row.revision,
  };
}
