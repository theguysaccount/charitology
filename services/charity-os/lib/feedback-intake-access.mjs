import { isProxy } from "node:util/types";
import { administrators } from "./access.mjs";
import { modulePermissions } from "./modules.mjs";
import { validateGroupExactStamp } from "./participation-group-model.mjs";
import { fail, hash } from "./security.mjs";

const MAX_REVISION = 2147483647;
export const feedbackIntakeId = value => typeof value === "string" && value.length > 0 &&
  value.length <= 100 && !/[^A-Za-z0-9_-]/.test(value);
export const feedbackIntakeRevision = value =>
  Number.isInteger(value) && value > 0 && value <= MAX_REVISION;
export const feedbackIntakeHash = (domain, value) =>
  hash({ method: "charitology-feedback-draft-v1", domain, value });
export const FEEDBACK_UTC_STAMP = 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"';
export const feedbackStorageUnavailable = () =>
  fail(503, "feedback_draft_storage", "The feedback review is temporarily unavailable.");

export function feedbackExactTime(value) {
  try { return validateGroupExactStamp(value); }
  catch { return feedbackStorageUnavailable(); }
}

/** Internal driver boundary. These queries project at most one typed row. */
export function oneFeedbackRow(result) {
  if (!Array.isArray(result?.rows) || result.rows.length > 1 || result.rowCount !== result.rows.length)
    feedbackStorageUnavailable();
  return result.rows[0] ?? null;
}

function property(value, key) {
  if (!value || typeof value !== "object" || isProxy(value)) return undefined;
  const field = Object.getOwnPropertyDescriptor(value, key);
  return field?.enumerable && Object.hasOwn(field, "value") ? field.value : undefined;
}

export function feedbackStaffSelectors(session) {
  const userId = property(property(session, "user"), "id");
  const sessionId = property(property(session, "session"), "id");
  if (!feedbackIntakeId(userId) || !feedbackIntakeId(sessionId))
    fail(401, "session", "Sign in again to review feedback.");
  return { userId, sessionId };
}

export function canManageFeedbackIntake(member) {
  return administrators(member?.role) && Array.isArray(member.programIds) && member.programIds.length === 0 &&
    ["forms", "feedback"].every(moduleId => {
      const permission = modulePermissions(moduleId, member.role);
      return permission.read && permission.write;
    });
}

/** Current live account and unrestricted staff access. The caller owns the
 * organization lock for preview/commit. Queue callers can use this gate too. */
export async function requireFeedbackIntakeStaff(c, org, session, { readOnly }) {
  const { userId, sessionId } = feedbackStaffSelectors(session);
  const live = oneFeedbackRow(await c.query(
    'SELECT s.id AS session_id,u.id AS user_id FROM "session" s JOIN "user" u ON u.id=s."userId" ' +
      'WHERE s.id=$1 AND s."userId"=$2 AND s."expiresAt">clock_timestamp()' + (readOnly ? "" : " FOR SHARE OF s"),
    [sessionId, userId],
  ));
  if (!live || live.session_id !== sessionId || live.user_id !== userId)
    fail(401, "session", "Sign in again to review feedback.");
  const row = oneFeedbackRow(await c.query(
    `SELECT user_id,role,program_ids,revision,to_char(created_at AT TIME ZONE 'UTC','${FEEDBACK_UTC_STAMP}') AS created_exact
      FROM os_members WHERE org_id=$1 AND user_id=$2` + (readOnly ? "" : " FOR SHARE"),
    [org, userId],
  ));
  if (!row) fail(403, "membership", "This organization is unavailable or your access has ended.");
  const member = { userId, role: row.role, programIds: row.program_ids, revision: row.revision };
  if (!canManageFeedbackIntake(member))
    fail(403, "feedback_draft_role", "An unrestricted Forms and Community feedback administrator is required.");
  if (row.user_id !== userId || !feedbackIntakeRevision(row.revision)) feedbackStorageUnavailable();
  return { member, sessionId, memberCreatedAtExact: feedbackExactTime(row.created_exact) };
}

export async function feedbackIntakeScope(c, org, session, readOnly) {
  const staff = await requireFeedbackIntakeStaff(c, org, session, { readOnly });
  const row = oneFeedbackRow(await c.query(`
    SELECT to_char(o.created_at AT TIME ZONE 'UTC','${FEEDBACK_UTC_STAMP}') AS created_exact,
      (SELECT max(e.id)::text FROM os_events e WHERE e.org_id=o.id AND e.action='backup.restored') AS restored_id
    FROM os_orgs o WHERE o.id=$1`, [org]));
  if (!row) fail(403, "membership", "This organization is unavailable or your access has ended.");
  if (row.restored_id !== null && (typeof row.restored_id !== "string" ||
      !/^[1-9][0-9]{0,18}$/.test(row.restored_id) || BigInt(row.restored_id) > 9223372036854775807n))
    feedbackStorageUnavailable();
  return {
    org, member: staff.member,
    scopeSha256: feedbackIntakeHash("authority", {
      org, ...staff, orgCreatedAtExact: feedbackExactTime(row.created_exact), restoredAuditId: row.restored_id,
    }),
  };
}
