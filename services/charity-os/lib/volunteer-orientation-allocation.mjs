import { isProxy } from "node:util/types";
import { decideVolunteerOrientation } from "./volunteer-orientation-eligibility.mjs";

const criterion = new Set(["confirm", "promote", "confirm-preview", "promote-preview", "waitlist-hint"]);
const excluded = new Set(["adopt", "adopt-preview", "group-create", "group-admit", "group-admit-preview",
  "group-admit-child", "handoff-options", "handoff-offer", "handoff-choice", "handoff-review",
  "handoff-confirm", "handoff-stage", "handoff-promote-child"]);
const exits = new Set(["waitlist", "staff-cancel", "own-cancel", "group-cancel", "group-cancel-preview",
  "group-cancel-child", "group-close", "handoff-withdraw-choice"]);
const scopeKeys = ["operation", "target", "subject"];
const inputs = [...scopeKeys, "declaration", "livePins", "facts"];
const liveTargetKeys = ["programId", "sourceRevision", "termsSha256", "startAt", "endAt", "timeZone"];
const factsKeys = ["nowExact", "target", "subject", "policy", "retainedObservation", "incomingObservation"];
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const SHA = /^[a-f0-9]{64}$/;
const id = value => typeof value === "string" && ID.test(value);
const revision = value => Number.isInteger(value) && value >= 1 && value <= 2147483647;

function data(value, keys) {
  if (!value || typeof value !== "object" || isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).length !== keys.length) return null;
  const entries = [];
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return null;
    entries.push([key, descriptor.value]);
  }
  return Object.fromEntries(entries);
}
function subjectOf(raw) {
  const s = data(raw, ["participationId", "contactId", "participationRevision"]);
  return s && id(s.participationId) && id(s.contactId) && revision(s.participationRevision) ? s : null;
}
function laneOf(scope) {
  if (!scope) return "invalid";
  const { operation, subject } = scope;
  const t = data(scope.target, ["orgId", "targetId", "moduleId"]);
  if (!t || !id(t.orgId) || !id(t.targetId) || !["events", "volunteers"].includes(t.moduleId)) return "invalid";
  const checksEvidence = criterion.has(operation);
  if (!checksEvidence && !excluded.has(operation) && !exits.has(operation)) return "invalid";
  if (checksEvidence ? !subjectOf(subject) : subject !== null) return "invalid";
  if (t.moduleId === "events") return operation.startsWith("handoff-") ? "invalid" : "ordinary";
  if (exits.has(operation)) return "ordinary";
  return checksEvidence ? "criterion" : "declaration";
}

/** Called only with a server-owned selector after existing authority.
 * Use it to skip both orientation reads on the ordinary/exit lane. */
export function orientationAllocationLookup(raw) {
  return laneOf(data(raw, scopeKeys));
}
const result = (outcome, code = null, status = null, policyRevision = null) =>
  Object.freeze({ version: 1, outcome, code, status, policyRevision });
const ordinary = result("continue");
const unavailable = result("refuse", "volunteer_orientation_unavailable", 503);
const required = result("refuse", "volunteer_orientation_required", 409);
const unsupported = result("refuse", "volunteer_orientation_operation", 409);

/** A continue result advances only the orientation seam. Current scope,
 * consent, capacity, review pins and existing writes remain caller duties. */
export function decideOrientationAllocation(raw) {
  const input = data(raw, inputs), lane = laneOf(input);
  if (lane === "invalid") return unavailable;
  if (lane === "ordinary") return ordinary;
  const t = data(input.target, ["orgId", "targetId", "moduleId"]);
  if (data(input.declaration, ["state"])?.state === "absent")
    return input.livePins === null && input.facts === null ? ordinary : unavailable;
  const d = data(input.declaration, ["state", "orgId", "targetId", "requirementId", "requirementVersion", "originMode"]);
  if (d?.state !== "protected" || d.orgId !== t.orgId || d.targetId !== t.targetId ||
      !id(d.requirementId) || d.requirementVersion !== 1 || !["live", "recovered"].includes(d.originMode)) return unavailable;
  if (lane === "declaration") return unsupported;
  if (d.originMode === "recovered") return required;
  const pins = data(input.livePins, [...liveTargetKeys, "nowExact"]);
  if (!pins || !id(pins.programId) || !revision(pins.sourceRevision) ||
      typeof pins.termsSha256 !== "string" || !SHA.test(pins.termsSha256) ||
      !["startAt", "endAt", "timeZone", "nowExact"].every(key => typeof pins[key] === "string")) return unavailable;
  const f = data(input.facts, factsKeys);
  if (!f || f.incomingObservation !== null || f.nowExact !== pins.nowExact) return required;
  let decision;
  try { decision = decideVolunteerOrientation(f); } catch { return unavailable; }
  if (decision.state !== "verified" || decision.reason !== "full-shift-covered" || decision.order !== "retained" ||
      !["primary", "equivalent"].includes(decision.basis)) return required;
  // The held proof has validated the nested records as plain data. Bind the
  // proof to the independently chosen live command subject and declaration.
  const s = subjectOf(input.subject), state = input.operation.startsWith("confirm") ? "requested" : "waitlisted";
  if (f.target.orgId !== t.orgId || f.target.shiftId !== t.targetId ||
      !liveTargetKeys.every(key => f.target[key] === pins[key]) ||
      f.subject.participationId !== s.participationId || f.subject.contactId !== s.contactId ||
      f.subject.revision !== s.participationRevision || f.subject.state !== state ||
      f.policy.requirementId !== d.requirementId || f.policy.version !== d.requirementVersion) return required;
  return result("continue", null, null, f.policy.revision);
}
