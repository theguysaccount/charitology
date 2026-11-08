/** Current staff access and content-bound receipt pins, never roster authority. */
import { isProxy } from "node:util/types";
import { fail } from "./security.mjs";
import { requirePermission } from "./access.mjs";
import { ROLES } from "./modules.mjs";
import { ownGroupValue, groupHash, validateGroupExactStamp } from "./participation-group-model.mjs";

const ID = /^[A-Za-z0-9_-]{1,100}$/, SHA = /^[a-f0-9]{64}$/;
const AUTHORITY_KEYS = ["actorSha256", "sessionSha256", "membershipSha256", "memberCreatedAtExact", "restoreEpochSha256"];
const MEMBER_KEYS = ["userId", "role", "programIds", "revision", "createdAtExact", "membershipSha256"];
const MAX_PROGRAMS = 100, MAX_RECORDS = 64, MAX_AUDIT_ID = 9223372036854775807n;
const invalid = () => fail(422, "participation_group_access", "Use the exact group access selectors and pins.");
const unavailable = () => fail(404, "participation_group_unavailable", "This group context is unavailable.");
const driverInvalid = () => fail(500, "participation_group_access", "Current group access is unavailable.");
const stale = () => fail(409, "participation_group_stale", "Access or restored history changed. Reload and review the group.");
const id = value => { if (typeof value !== "string" || !ID.test(value)) invalid(); return value; };
const digest = value => { if (typeof value !== "string" || !SHA.test(value)) invalid(); return value; };
const closed = (value, keys) => {
  if (!value || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) invalid();
};

// Select only IDs. BetterAuth's unrelated Dates/email fields are neither cloned
// nor read; a matching email never establishes a session or account relationship.
function dataProperty(value, key, plain = true) {
  if (!value || typeof value !== "object" || isProxy(value) ||
      (plain && Object.getPrototypeOf(value) !== Object.prototype)) invalid();
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) invalid();
  return descriptor.value;
}
function selectors(session) {
  return {
    sessionId: id(dataProperty(dataProperty(session, "session"), "id")),
    userId: id(dataProperty(dataProperty(session, "user"), "id")),
  };
}
function rows(result) {
  const list = ownGroupValue(dataProperty(result, "rows", false), 32768);
  const count = dataProperty(result, "rowCount", false);
  if (!Array.isArray(list) || !Number.isInteger(count) || count !== list.length) driverInvalid();
  return list;
}
function programIds(input) {
  if (!Array.isArray(input) || input.length > MAX_PROGRAMS) invalid();
  input.forEach(id);
  // The existing member API admits repeated valid scope IDs. Keep its literal
  // profile; duplicates do not widen access and remain part of the hash input.
  return Object.freeze([...input]);
}
function membershipHash(member) {
  return groupHash("membership", {
    userId: member.userId, role: member.role, programIds: [...member.programIds].sort(),
    revision: member.revision, createdAtExact: member.createdAtExact,
  });
}
function memberProfile(value) {
  id(value.userId);
  if (!ROLES.includes(value.role) || !Number.isSafeInteger(value.revision) || value.revision < 1 || value.revision > 2147483647) invalid();
  validateGroupExactStamp(value.createdAtExact);
  return {
    userId: value.userId, role: value.role, programIds: programIds(value.programIds),
    revision: value.revision, createdAtExact: value.createdAtExact,
  };
}
function checkedMember(input) {
  const value = ownGroupValue(input, 32768); closed(value, MEMBER_KEYS);
  const member = memberProfile(value);
  if (digest(value.membershipSha256) !== membershipHash(member)) invalid();
  return Object.freeze({ ...member, membershipSha256: value.membershipSha256 });
}

/** Caller owns organization locking, typed graph visibility and current scope. */
export async function currentGroupMember(c, org, session, options) {
  id(org);
  const selected = selectors(session), opts = ownGroupValue(options, 512);
  closed(opts, ["moduleId", "readOnly"]);
  if (!["events", "volunteers"].includes(opts.moduleId) || typeof opts.readOnly !== "boolean") invalid();
  const present = rows(await c.query(
    'SELECT s.id AS session_id,s."userId" AS user_id,u.id AS current_user_id FROM "session" s JOIN "user" u ON u.id=s."userId" WHERE s.id=$1 AND s."userId"=$2 AND s."expiresAt">clock_timestamp()' +
      (opts.readOnly ? "" : " FOR SHARE OF s"),
    [selected.sessionId, selected.userId],
  ));
  if (!present.length) fail(401, "session", "Sign in again before continuing this group review.");
  if (present.length !== 1) driverInvalid();
  closed(present[0], ["session_id", "user_id", "current_user_id"]);
  if (present[0].session_id !== selected.sessionId || present[0].user_id !== selected.userId || present[0].current_user_id !== selected.userId)
    fail(401, "session", "Sign in again before continuing this group review.");
  const current = rows(await c.query(
    "SELECT user_id,role,program_ids,revision,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_exact FROM os_members WHERE org_id=$1 AND user_id=$2" +
      (opts.readOnly ? "" : " FOR SHARE"),
    [org, selected.userId],
  ));
  if (!current.length) fail(403, "membership", "This organization is unavailable or your access has ended.");
  if (current.length !== 1) driverInvalid();
  closed(current[0], ["user_id", "role", "program_ids", "revision", "created_exact"]);
  const raw = current[0];
  if (raw.user_id !== selected.userId) driverInvalid();
  const profile = memberProfile({ userId: raw.user_id, role: raw.role, programIds: raw.program_ids, revision: raw.revision, createdAtExact: raw.created_exact });
  requirePermission(opts.moduleId, profile, "read");
  requirePermission(opts.moduleId, profile, "write");
  return Object.freeze({ ...profile, membershipSha256: membershipHash(profile) });
}

export function groupSessionHash(session) {
  const selected = selectors(session);
  return groupHash("session", { sessionId: selected.sessionId });
}
export function groupAuthority(member, session, restoreEpochSha256) {
  const current = checkedMember(member), selected = selectors(session);
  if (current.userId !== selected.userId) unavailable();
  const sessionSha256 = groupSessionHash(session);
  return Object.freeze({
    actorSha256: groupHash("actor", { actorId: current.userId, sessionSha256, memberCreatedAtExact: current.createdAtExact }),
    sessionSha256, membershipSha256: current.membershipSha256,
    memberCreatedAtExact: current.createdAtExact, restoreEpochSha256: digest(restoreEpochSha256),
  });
}
/** Fresh caller authorization precedes this comparison, including exact Replay. */
export function requireGroupReceiptAuthority(authority, member, session, epoch) {
  const value = ownGroupValue(authority, 2048); closed(value, AUTHORITY_KEYS);
  for (const key of AUTHORITY_KEYS) {
    if (key === "memberCreatedAtExact") validateGroupExactStamp(value[key]);
    else digest(value[key]);
  }
  const current = groupAuthority(member, session, epoch);
  if (!AUTHORITY_KEYS.every(key => value[key] === current[key])) stale();
}

const auditId = value => {
  if (value === null) return value;
  if (typeof value !== "string" || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > MAX_AUDIT_ID) driverInvalid();
  return value;
};
/**
 * Caller-derived complete graph, not a graph-discovery or authorization API.
 * Org recreation, full restore and each ordinary record restore revoke pins.
 */
export async function groupRestoreEpoch(c, org, recordIds) {
  id(org);
  const selected = ownGroupValue(recordIds, 8192);
  if (!Array.isArray(selected) || selected.length < 1 || selected.length > MAX_RECORDS) invalid();
  selected.forEach(id);
  if (new Set(selected).size !== selected.length) invalid();
  const sorted = [...selected].sort();
  const result = rows(await c.query(
    `WITH selected AS (SELECT record_id FROM unnest($2::text[]) AS r(record_id)),
restored AS (
  SELECT r.record_id,max(e.id)::text AS restored_id FROM selected r
  LEFT JOIN os_events e ON e.org_id=$1 AND e.record_id=r.record_id AND e.action='record.restored'
  GROUP BY r.record_id
)
SELECT to_char(o.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS org_created_exact,
       (SELECT max(e.id)::text FROM os_events e WHERE e.org_id=$1 AND e.action='backup.restored') AS backup_restored_id,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('recordId',record_id,'lastRestoredAuditId',restored_id) ORDER BY record_id COLLATE "C") FROM restored),'[]'::jsonb) AS records
FROM os_orgs o WHERE o.id=$1`,
    [org, sorted],
  ));
  if (!result.length) unavailable();
  if (result.length !== 1) driverInvalid();
  closed(result[0], ["org_created_exact", "backup_restored_id", "records"]);
  const raw = result[0]; validateGroupExactStamp(raw.org_created_exact);
  if (!Array.isArray(raw.records) || raw.records.length !== sorted.length) driverInvalid();
  const records = raw.records.map((record, index) => {
    closed(record, ["recordId", "lastRestoredAuditId"]);
    if (record.recordId !== sorted[index]) driverInvalid();
    return { recordId: record.recordId, lastRestoredAuditId: auditId(record.lastRestoredAuditId) };
  });
  return groupHash("restore-epoch", {
    orgId: org, orgCreatedAtExact: raw.org_created_exact,
    backupRestoredAuditId: auditId(raw.backup_restored_id), records,
  });
}
