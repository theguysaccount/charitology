import { hash } from "./security.mjs";
import { decideVolunteerOrientation, VOLUNTEER_ORIENTATION_PROOF } from "./volunteer-orientation-eligibility.mjs";
import { decideOrientationAllocation } from "./volunteer-orientation-allocation.mjs";
import { orientationHash, orientationId, orientationRequired, orientationRevision, orientationUnavailable } from "./volunteer-orientation-marker.mjs";
import { orientationSubjectHash, readVolunteerOrientationObservation, readVolunteerOrientationPolicy } from "./volunteer-orientation-storage.mjs";

const timestamps = /^((?!0000)[0-9]{4})-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$/;
const proofSource = Object.freeze({
  registerId: VOLUNTEER_ORIENTATION_PROOF.registerId,
  sourceEdition: VOLUNTEER_ORIENTATION_PROOF.sourceEdition,
  primaryCourseId: VOLUNTEER_ORIENTATION_PROOF.primaryCourseId,
  equivalentCourseId: null,
});

export function volunteerOrientationSourcePins(source, target, terms) {
  const data = source.data;
  if (source.moduleId !== "volunteers" || data?.kind !== "shift" || source.status !== "open" ||
      data.capacity !== 1 || data.allowPartialIntervals === true || !orientationId(data.programId) ||
      source.approval?.status !== "approved" || source.approval.revision !== source.revision ||
      !orientationId(source.approval.actorId) || source.approval.actorId === source.lastEditedBy ||
      target?.mode !== "managed" || target.recovery_block !== false || target.module_id !== "volunteers" ||
      target.org_id !== source.orgId || target.target_id !== source.id || !terms ||
      !Number.isFinite(Date.parse(terms.startAt)) || !Number.isFinite(Date.parse(terms.endAt)) ||
      typeof terms.timeZone !== "string" || terms.intervalPolicy !== undefined) return null;
  return { orgId: source.orgId, programId: data.programId, shiftId: source.id,
    sourceRevision: source.revision, termsSha256: hash(terms),
    startAt: terms.startAt, endAt: terms.endAt, timeZone: terms.timeZone };
}

export function volunteerOrientationPlace(source, p) {
  return p?.org_id === source.orgId && p.target_id === source.id && p.module_id === "volunteers" &&
    p.source === "staff" && !p.recovered && p.intake_id == null && p.requested_interval == null &&
    orientationId(p.id) && orientationId(p.contact_id) && orientationRevision(p.revision);
}

export function volunteerOrientationPolicyCurrent(policy, pins, nowExact) {
  return !!pins && policy.program_id === pins.programId && policy.source_revision === pins.sourceRevision &&
    policy.terms_hash === pins.termsSha256 && Date.parse(pins.startAt) > Date.parse(nowExact);
}

export async function readDeclaredVolunteerOrientationPolicy(c, org, declaration) {
  const row = await readVolunteerOrientationPolicy(c, org);
  const m = declaration.marker;
  if (!row || row.org_id !== org || row.target_id !== m.targetId || row.program_id !== m.programId ||
      row.requirement_id !== m.requirementId || !orientationRevision(row.revision) || row.revision < m.policyRevision ||
      !orientationRevision(row.source_revision) || !orientationHash(row.terms_hash) || !orientationId(row.authored_by) ||
      !["pending", "active"].includes(row.state) ||
      (row.state === "pending" && (row.reviewed_by !== null || row.reviewed_at !== null)) ||
      (row.state === "active" && (!orientationId(row.reviewed_by) || row.reviewed_by === row.authored_by ||
        typeof row.reviewed_at !== "string" || !timestamps.test(row.reviewed_at)))) orientationUnavailable();
  return row;
}

export async function readScopedVolunteerOrientationObservation(c, source, p, policy) {
  const row = await readVolunteerOrientationObservation(c, source.orgId, p.id);
  if (!row) return null;
  if (row.org_id !== source.orgId || row.participation_id !== p.id || row.requirement_id !== policy.requirement_id ||
      row.subject_hash !== orientationSubjectHash(source.orgId, source.id, p) || !orientationRevision(row.revision) ||
      !orientationRevision(row.policy_revision) || row.policy_revision > policy.revision ||
      !orientationRevision(row.register_revision) || !orientationId(row.recorded_by) ||
      typeof row.checked_at !== "string" || !timestamps.test(row.checked_at) ||
      !["complete", "unknown", "withdrawn"].includes(row.state)) orientationUnavailable();
  return row;
}

function currentOrientationFacts(source, p, pins, nowExact, policy, row) {
  if (!volunteerOrientationPlace(source, p) || !["requested", "waitlisted"].includes(p.state) || !pins) return null;
  const scope = { orgId: pins.orgId, programId: pins.programId, shiftId: pins.shiftId };
  const subject = { ...scope, participationId: p.id, contactId: p.contact_id, revision: p.revision,
    state: p.state, coverage: "full", origin: "live" };
  return {
    nowExact,
    target: { ...pins, moduleId: "volunteers", kind: "shift", status: "open", mode: "managed",
      capacity: 1, coverage: "full", approvedRevision: source.revision },
    subject,
    policy: {
      version: 1, state: policy.state, requirementId: policy.requirement_id, revision: policy.revision,
      target: { ...pins, sourceRevision: policy.source_revision, termsSha256: policy.terms_hash },
      source: proofSource, authoredBy: policy.authored_by, reviewedBy: policy.reviewed_by, reviewedAtExact: policy.reviewed_at,
    },
    retainedObservation: row && row.policy_revision === policy.revision ? {
      ...scope, requirementId: row.requirement_id, policyRevision: row.policy_revision,
      participationId: p.id, contactId: p.contact_id,
      registerId: proofSource.registerId, sourceEdition: proofSource.sourceEdition, sourceRevision: row.register_revision,
      status: row.state, courseId: row.state === "complete" ? proofSource.primaryCourseId : null,
      checkedAtExact: row.checked_at, completedOn: row.completed_on, validThrough: row.valid_through,
      recordedBy: row.recorded_by, equivalentReview: null,
    } : null,
    incomingObservation: null,
  };
}

export function volunteerOrientationDisplayState(source, p, pins, nowExact, policy, observation) {
  if (!policy || policy.state !== "active" || !volunteerOrientationPolicyCurrent(policy, pins, nowExact)) return "review-needed";
  const facts = currentOrientationFacts(source, p, pins, nowExact, policy, observation);
  if (!facts) return "review-needed";
  const state = decideVolunteerOrientation(facts).state;
  return ["verified", "expired", "withdrawn", "unknown"].includes(state) ? state : "review-needed";
}

export async function requireVolunteerOrientationForPlace({c, source, target, terms, p, action, declaration, clock, policy}) {
  if (declaration.originMode !== "live") orientationRequired();
  const pins = volunteerOrientationSourcePins(source, target, terms);
  if (!pins || !volunteerOrientationPlace(source, p) || declaration.marker.programId !== pins.programId ||
      policy.state !== "active" || !volunteerOrientationPolicyCurrent(policy, pins, clock.atExact)) orientationRequired();
  const observation = await readScopedVolunteerOrientationObservation(c, source, p, policy);
  const decision = decideOrientationAllocation({
    operation: action,
    target: { orgId: source.orgId, targetId: source.id, moduleId: "volunteers" },
    subject: { participationId: p.id, contactId: p.contact_id, participationRevision: p.revision },
    declaration: { state: "protected", orgId: source.orgId, targetId: source.id,
      requirementId: declaration.marker.requirementId, requirementVersion: 1, originMode: declaration.originMode },
    livePins: { programId: pins.programId, sourceRevision: pins.sourceRevision, termsSha256: pins.termsSha256,
      startAt: pins.startAt, endAt: pins.endAt, timeZone: pins.timeZone, nowExact: clock.atExact },
    facts: currentOrientationFacts(source, p, pins, clock.atExact, policy, observation),
  });
  if (decision.outcome !== "continue" || decision.policyRevision !== policy.revision || !observation) orientationRequired();
  return observation;
}
