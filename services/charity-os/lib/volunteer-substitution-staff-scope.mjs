/** Existing staff session, whole-module access and typed history pins. */
import { isProxy } from "node:util/types";
import { fail, hash } from "./security.mjs";
import { currentGroupMember, groupRestoreEpoch, groupSessionHash } from "./participation-group-access.mjs";

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const valid = v => typeof v === "string" && ID.test(v);
const unavailable = () => fail(404, "substitution_unavailable", "This shift change is unavailable.");
function exact(input, keys) {
  if (!input || typeof input !== "object" || isProxy(input) || Object.getPrototypeOf(input) !== Object.prototype) unavailable();
  const fields = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(fields).length !== keys.length ||
      !keys.every(key => fields[key]?.enumerable && Object.hasOwn(fields[key], "value") && valid(fields[key].value))) unavailable();
  return Object.fromEntries(keys.map(key=>[key,fields[key].value]));
}
const scopeKeys = ["orgId", "intentId", "userId"];

/** Caller owns the locked workspace transaction. The staff pin is stable only
 * under the same verified session and current organization-wide write access. */
export async function readVolunteerSubstitutionStaffScope(c, raw, session) {
  const s = exact(raw, scopeKeys);
  const member = await currentGroupMember(c,s.orgId,session,{moduleId:"volunteers",readOnly:false});
  if (member.userId !== s.userId || member.programIds.length !== 0) unavailable();
  const verified = await c.query('SELECT "emailVerified" AS verified FROM "user" WHERE id=$1 FOR SHARE',[s.userId]);
  if (verified.rowCount !== 1 || verified.rows[0]?.verified !== true) unavailable();
  return Object.freeze({
    orgId:s.orgId,intentId:s.intentId,
    staffScopeSha256:hash(["volunteer-substitution-staff-v1",s.orgId,member.membershipSha256,groupSessionHash(session)]),
  });
}

/** Only trusted shift and assignment IDs from the locked review or immutable
 * local receipt may reach this port. A lost response needs no active offer. */
export async function readVolunteerSubstitutionRestoreScope(c, raw, rawGraph) {
  const {orgId} = exact(raw,scopeKeys);
  const graph = exact(rawGraph,["shiftId","outgoingAssignmentId","replacementAssignmentId"]);
  const ids = Object.values(graph);
  if (new Set(ids).size !== 3) unavailable();
  return groupRestoreEpoch(c,orgId,ids);
}
