import { requireAdmin, requirePermission } from "./access.mjs";
import { rowRecord } from "./database.mjs";
import { ModuleValidationError, modulePermissions } from "./modules.mjs";
import { currentGroupMember } from "./participation-group-access.mjs";
import { participationTerms, readParticipationDomainClock } from "./participation.mjs";
import { participantQuery } from "./participants.mjs";
import { validDate } from "./schedule.mjs";
import { fail, hash, id, json } from "./security.mjs";
import {
  insertLiveVolunteerOrientationMarker, orientationChanged, orientationData, orientationHash, orientationId,
  orientationRevision, orientationUnavailable, readVolunteerOrientationMarker,
} from "./volunteer-orientation-marker.mjs";
import {
  approveVolunteerOrientationPolicy, orientationSubjectHash, requireVolunteerOrientationStorage,
  saveVolunteerOrientationObservation, saveVolunteerOrientationPolicy,
} from "./volunteer-orientation-storage.mjs";
import {
  readDeclaredVolunteerOrientationPolicy, readScopedVolunteerOrientationObservation, volunteerOrientationDisplayState,
  volunteerOrientationPlace, volunteerOrientationPolicyCurrent, volunteerOrientationSourcePins,
} from "./volunteer-orientation-admission.mjs";

const ROOT = "volunteer-orientation";
const PATH = /^volunteer-orientation\/([A-Za-z0-9_-]{1,100})(?:\/(propose|approve)|\/places\/([A-Za-z0-9_-]{1,100}))?$/;
const missing = () => fail(404, "volunteer_orientation", "This orientation review is unavailable.");
const fields = () => fail(422, "volunteer_orientation_fields", "Use the exact site orientation review fields.");
const reply = value => json({ok: true, ...value}, 200, {"referrer-policy": "no-referrer"});
const priorRevision = value => value === 0 || orientationRevision(value);
const sameSource = (policy, pins) => !!pins && policy?.source_revision === pins.sourceRevision && policy?.terms_hash === pins.termsSha256;
const livePlace = p => ["requested", "waitlisted"].includes(p.state);

export function canManageVolunteerOrientation(member) {
  if (!["owner", "admin"].includes(member?.role) || !Array.isArray(member.programIds) || member.programIds.length !== 0) return false;
  const volunteers = modulePermissions("volunteers", member.role), safety = modulePermissions("safeguarding", member.role);
  return volunteers.read && volunteers.write && safety.read && safety.write && safety.approve;
}

async function currentStaff(c, org, session, readOnly) {
  if (session?.user?.emailVerified !== true) fail(401, "session", "Sign in with your verified account to continue.");
  const member = await currentGroupMember(c, org, session, {moduleId: "volunteers", readOnly});
  requireAdmin(member);
  for (const action of ["read", "write", "approve"]) requirePermission("safeguarding", member, action);
  if (!canManageVolunteerOrientation(member)) fail(403, "role", "A workspace-wide orientation reviewer is required.");
  const {rows} = await c.query('SELECT "emailVerified" AS verified FROM "user" WHERE id=$1' + (readOnly ? "" : " FOR SHARE"), [member.userId]);
  if (rows.length !== 1 || rows[0].verified !== true) fail(401, "session", "Sign in with your verified account to continue.");
  return member.userId;
}

async function shiftContext(c, org, targetId, readOnly) {
  const {rows} = await c.query(`SELECT r.* FROM os_records r JOIN os_records g ON g.org_id=r.org_id
    AND g.id=r.data->>'programId' AND g.module_id='programs' AND g.data->>'kind'='program' AND g.deleted_at IS NULL
    WHERE r.org_id=$1 AND r.id=$2 AND r.module_id='volunteers' AND r.data->>'kind'='shift' AND r.deleted_at IS NULL` +
    (readOnly ? "" : " FOR SHARE OF r,g"), [org, targetId]);
  if (rows.length !== 1) missing();
  const source = rowRecord(rows[0]);
  const target = (await c.query(`SELECT * FROM os_participation_targets WHERE org_id=$1 AND target_id=$2 AND module_id='volunteers'` +
    (readOnly ? "" : " FOR SHARE"), [org, targetId])).rows[0];
  let terms = null;
  try { terms = participationTerms(source); } catch (error) {
    if (!["participation_target", "participation_terms", "participation_text"].includes(error?.code) &&
        !(error instanceof ModuleValidationError)) throw error;
  }
  return {source, target, terms, pins: volunteerOrientationSourcePins(source, target, terms)};
}

async function placeContext(c, source, placeId, readOnly) {
  const {rows} = await c.query(`SELECT p.*,(a.deleted_at IS NULL AND h.deleted_at IS NULL) AS orientation_links_live
    FROM os_participations p
    JOIN os_records a ON a.org_id=p.org_id AND a.id=p.booking_record_id AND a.module_id='volunteers'
      AND a.data->>'kind'='assignment' AND a.data->>'shiftId'=p.target_id
      AND a.data->>'contactId'=p.contact_id AND a.data->>'programId'=$4
    JOIN os_records h ON h.org_id=p.org_id AND h.id=p.contact_id AND h.module_id='contacts'
    WHERE p.org_id=$1 AND p.target_id=$2 AND p.id=$3 AND p.module_id='volunteers'` +
    (readOnly ? "" : " FOR SHARE OF p,a,h"), [source.orgId, source.id, placeId, source.data.programId]);
  if (rows.length !== 1 || !volunteerOrientationPlace(source, rows[0])) missing();
  return rows[0];
}

async function vacant(c, org, target) {
  const {rows} = await c.query(`SELECT (
    EXISTS(SELECT 1 FROM os_participations WHERE org_id=$1 AND target_id=$2) OR
    EXISTS(SELECT 1 FROM os_publications WHERE org_id=$1 AND target_id=$2 AND target_module='volunteers') OR
    EXISTS(SELECT 1 FROM os_participation_groups WHERE org_id=$1 AND live_target_id=$2 AND module_id='volunteers') OR
    EXISTS(SELECT 1 FROM os_records WHERE org_id=$1 AND module_id='volunteers' AND data->>'kind'='assignment'
      AND data->>'shiftId'=$2)
  ) AS occupied`, [org, target]);
  if (rows.length !== 1 || typeof rows[0].occupied !== "boolean") orientationUnavailable();
  return !rows[0].occupied;
}

function isFuture(pins, clock) {
  return !!pins && Date.parse(pins.startAt) > Date.parse(clock.atExact);
}

async function orientationView(c, {source, pins}, declaration, policy, actor, clock) {
  const current = !!policy && volunteerOrientationPolicyCurrent(policy, pins, clock.atExact);
  const future = isFuture(pins, clock);
  const canPropose = future && (!declaration ? await vacant(c, source.orgId, source.id) :
    declaration.originMode === "live" && !sameSource(policy, pins));
  const state = !declaration ? "unconfigured" : current ? policy.state : "review-needed";
  return reply({orientation: {version: 1, shiftId: source.id, sourceRevision: source.revision,
    termsSha256: pins?.termsSha256 ?? null, policyRevision: policy?.revision ?? declaration?.marker.policyRevision ?? 0,
    state, canPropose, canApprove: current && policy.state === "pending" && policy.authored_by !== actor,
    canRecordEvidence: current && policy.state === "active"}});
}

function eligibilityView({source, pins}, p, policy, row, clock) {
  const candidate = p.orientation_links_live === true && livePlace(p);
  return reply({eligibility: {version: 1, shiftId: source.id, participationId: p.id, participationRevision: p.revision,
    policyRevision: policy?.revision ?? 0, evidenceRevision: row?.revision ?? 0, registerRevision: row?.register_revision ?? 0,
    state: row?.state === "withdrawn" ? "withdrawn" :
      candidate ? volunteerOrientationDisplayState(source, p, pins, clock.atExact, policy, row) : "review-needed",
    canRecord: !!policy && ((candidate && policy.state === "active" &&
      volunteerOrientationPolicyCurrent(policy, pins, clock.atExact)) || (!!row && row.state !== "withdrawn"))}});
}

const localDay = (stamp, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone, calendar: "iso8601", numberingSystem: "latn"}).formatToParts(new Date(stamp));
  return ["year", "month", "day"].map(type => parts.find(item => item.type === type).value).join("-");
};

async function recordEvidence(c, {source, pins}, p, policy, row, actor, clock, raw) {
  const input = orientationData(raw, ["policyRevision", "participationRevision", "evidenceRevision", "registerRevision",
    "state", "completedOn", "validThrough", "checkedRegister"]);
  if (!input || !orientationRevision(input.policyRevision) || !orientationRevision(input.participationRevision) ||
      !priorRevision(input.evidenceRevision) || !orientationRevision(input.registerRevision) || input.checkedRegister !== true ||
      !["complete", "unknown", "withdrawn"].includes(input.state) ||
      (input.state === "complete" ? !validDate(input.completedOn) || !validDate(input.validThrough) || input.completedOn > input.validThrough :
        input.completedOn !== null || input.validThrough !== null)) fields();
  if (!policy) orientationChanged();
  const requestHash = hash(["charitology-volunteer-orientation-evidence-v1", source.orgId, source.id, p.id, actor, input]);
  if (row && row.revision === input.evidenceRevision + 1 && row.request_hash === requestHash) return row;
  if (policy.revision !== input.policyRevision || p.revision !== input.participationRevision ||
      (row?.revision ?? 0) !== input.evidenceRevision) orientationChanged();
  if (row && (input.registerRevision < row.register_revision ||
      (input.registerRevision === row.register_revision && (input.state !== row.state ||
        input.completedOn !== row.completed_on || input.validThrough !== row.valid_through)))) orientationChanged();
  const current = policy.state === "active" && volunteerOrientationPolicyCurrent(policy, pins, clock.atExact) &&
    p.orientation_links_live === true && livePlace(p);
  if (!current && !(row && input.state === "withdrawn")) orientationChanged();
  if (input.state === "complete" && input.completedOn > localDay(clock.atExact, pins.timeZone)) fields();
  return saveVolunteerOrientationObservation(c, {
    orgId: source.orgId, participationId: p.id, requirementId: policy.requirement_id, policyRevision: policy.revision,
    subjectHash: orientationSubjectHash(source.orgId, source.id, p), registerRevision: input.registerRevision,
    state: input.state, completedOn: input.completedOn, validThrough: input.validThrough, actor, atExact: clock.atExact, requestHash,
  }, row);
}

/** The enclosing handler supplies strict bounded JSON, current CSRF, tenant
 * transaction, and ordinary whole-workspace admission for a new marker. */
export async function volunteerOrientationRoutes({c, org, session, tail, method, input, url, settings, checkCapacity}) {
  if (settings?.volunteerOrientation !== true || !(tail === ROOT || tail.startsWith(ROOT + "/"))) return null;
  const path = PATH.exec(tail);
  if (!path) missing();
  const [, shiftId, action, placeId] = path;
  const readOnly = method === "GET";
  if (readOnly ? !!action : method !== "POST" || (!action && !placeId))
    fail(405, "volunteer_orientation_method", "Use the documented orientation review action.");
  participantQuery(url || new URL("https://os.invalid/api/" + tail), []);
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [org]);
  const actor = await currentStaff(c, org, session, readOnly);
  await requireVolunteerOrientationStorage(c);
  const context = await shiftContext(c, org, shiftId, readOnly), {source, pins} = context;
  const clock = await readParticipationDomainClock(c);
  let declaration = await readVolunteerOrientationMarker(c, org);
  if (declaration && declaration.marker.targetId !== shiftId) missing();
  let policy = declaration?.originMode === "live" ? await readDeclaredVolunteerOrientationPolicy(c, org, declaration) : null;
  if (placeId) {
    const p = await placeContext(c, source, placeId, readOnly);
    let observation = policy ? await readScopedVolunteerOrientationObservation(c, source, p, policy) : null;
    if (!readOnly) observation = await recordEvidence(c, context, p, policy, observation, actor, clock, input);
    return eligibilityView(context, p, policy, observation, clock);
  }
  if (action === "propose") {
    const args = orientationData(input, ["policyRevision", "sourceRevision", "termsSha256", "registerAcknowledged"]);
    if (!args || !priorRevision(args.policyRevision) || !orientationRevision(args.sourceRevision) ||
        !orientationHash(args.termsSha256) || args.registerAcknowledged !== true) fields();
    if (!isFuture(pins, clock) || args.sourceRevision !== pins.sourceRevision || args.termsSha256 !== pins.termsSha256 ||
        declaration?.originMode === "recovered") orientationChanged();
    if (policy?.revision === args.policyRevision + 1 && policy.state === "pending" &&
        policy.authored_by === actor && sameSource(policy, pins))
      return orientationView(c, context, declaration, policy, actor, clock);
    if ((policy?.revision ?? 0) !== args.policyRevision || sameSource(policy, pins) ||
        (!declaration && !await vacant(c, org, shiftId))) orientationChanged();
    if (!declaration && typeof checkCapacity !== "function") orientationUnavailable();
    const requirementId = declaration?.marker.requirementId ?? id();
    policy = await saveVolunteerOrientationPolicy(c, {orgId: org, targetId: shiftId, programId: pins.programId,
      requirementId, sourceRevision: pins.sourceRevision, termsHash: pins.termsSha256, actor}, policy?.revision ?? null);
    if (!declaration) {
      declaration = await insertLiveVolunteerOrientationMarker(c, org, actor, {version: 1, moduleId: "volunteers",
        targetId: shiftId, programId: pins.programId, requirementId, policyRevision: policy.revision,
        sourceRevision: pins.sourceRevision, termsHash: pins.termsSha256, disposition: "review-needed"});
      await checkCapacity(c, org);
    }
  }
  if (action === "approve") {
    const args = orientationData(input, ["policyRevision", "registerAcknowledged"]);
    if (!args || !orientationRevision(args.policyRevision) || args.registerAcknowledged !== true) fields();
    if (!policy || !volunteerOrientationPolicyCurrent(policy, pins, clock.atExact)) orientationChanged();
    if (policy.state === "active" && policy.revision === args.policyRevision + 1 && policy.reviewed_by === actor)
      return orientationView(c, context, declaration, policy, actor, clock);
    if (policy.state !== "pending" || policy.revision !== args.policyRevision) orientationChanged();
    if (policy.authored_by === actor) fail(409, "volunteer_orientation_independent", "Ask another authorized staff member to review this requirement.");
    policy = await approveVolunteerOrientationPolicy(c, org, policy, actor, clock.atExact);
  }
  return orientationView(c, context, declaration, policy, actor, clock);
}
