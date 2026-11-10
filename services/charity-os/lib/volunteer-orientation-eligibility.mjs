/** Pure orientation criterion. The caller owns actual source,
 * reviewer authorization, SQL locking and any persistence. */
import { isProxy } from "node:util/types";
import { validDate, validInstant, validZone, agreesWithZone } from "./schedule.mjs";
import { validateGroupExactStamp } from "./participation-group-model.mjs";
import { hash } from "./security.mjs";

export const VOLUNTEER_ORIENTATION_PROOF = Object.freeze({
  version: 1,
  registerId: "charity-site-orientation-register",
  sourceEdition: "manual-versioned-register-v1",
  primaryCourseId: "site-orientation",
  equivalentCourseId: "site-orientation-equivalent",
  observationHours: 24,
  equivalentReason: "equivalent-orientation-verified",
});
const F = VOLUNTEER_ORIENTATION_PROOF;
const MAX_AGE = BigInt(F.observationHours) * 3600000000n;
const ID = /^[A-Za-z0-9_-]{1,100}$/, SHA = /^[a-f0-9]{64}$/;
const TARGET_PINS = [
  "orgId", "programId", "shiftId", "sourceRevision", "termsSha256", "startAt", "endAt", "timeZone",
];
const TARGET = [
  ...TARGET_PINS, "moduleId", "kind", "status", "mode", "capacity", "coverage", "approvedRevision",
];
const SUBJECT = [
  "orgId", "programId", "shiftId", "participationId", "contactId", "revision", "state", "coverage", "origin",
];
const POLICY = ["version", "state", "requirementId", "revision", "target", "source", "authoredBy", "reviewedBy", "reviewedAtExact"];
const SOURCE = ["registerId", "sourceEdition", "primaryCourseId", "equivalentCourseId"];
const OBSERVATION = [
  "orgId", "programId", "shiftId", "requirementId", "policyRevision", "participationId", "contactId",
  "registerId", "sourceEdition", "sourceRevision", "status", "courseId", "checkedAtExact",
  "completedOn", "validThrough", "recordedBy", "equivalentReview",
];
const EQUIVALENT_REVIEW = ["reason", "observationSha256", "participationRevision", "reviewedBy", "reviewedAtExact"];
const EXTERNAL_FACTS = ["status", "courseId", "completedOn", "validThrough"];
const INPUT = ["nowExact", "target", "subject", "policy", "retainedObservation", "incomingObservation"];

const id = value => typeof value === "string" && ID.test(value);
const digest = value => typeof value === "string" && SHA.test(value);
const revision = value => Number.isInteger(value) && value >= 1 && value <= 2147483647;
const same = (left, right, keys) => keys.every(key => left[key] === right[key]);
function record(raw, keys) {
  if (!raw || typeof raw !== "object" || isProxy(raw) || Object.getPrototypeOf(raw) !== Object.prototype ||
      Reflect.ownKeys(raw).length !== keys.length) return null;
  const value = {};
  for (const key of keys) {
    const field = Object.getOwnPropertyDescriptor(raw,key);
    if (!field?.enumerable || !Object.hasOwn(field,"value")) return null;
    value[key] = field.value;
  }
  return value;
}
function exactClock(value) {
  try { validateGroupExactStamp(value); } catch { return null; }
  if (!validDate(value.slice(0,10))) return null;
  const milliseconds = Date.parse(value.slice(0,23) + "Z");
  return { milliseconds, microseconds: BigInt(milliseconds) * 1000n + BigInt(value.slice(23,26)) };
}
function localDay(format, milliseconds) {
  const parts = format.formatToParts(milliseconds);
  const part = type => parts.find(value => value.type === type).value;
  return [part("year"),part("month"),part("day")].join("-");
}
function shiftWindow(target, now) {
  if (!target || !["orgId","programId","shiftId"].every(key => id(target[key])) ||
      target.moduleId !== "volunteers" || target.kind !== "shift" || target.status !== "open" ||
      target.mode !== "managed" || target.capacity !== 1 || target.coverage !== "full" ||
      !revision(target.sourceRevision) || target.approvedRevision !== target.sourceRevision ||
      !digest(target.termsSha256) || !validInstant(target.startAt) || !validInstant(target.endAt) ||
      typeof target.timeZone !== "string" || !/^[A-Za-z]/.test(target.timeZone) || !validZone(target.timeZone) ||
      !agreesWithZone(target.startAt,target.timeZone) || !agreesWithZone(target.endAt,target.timeZone)) return null;
  const start = Date.parse(target.startAt), end = Date.parse(target.endAt);
  if (end <= start || BigInt(start) * 1000n <= now.microseconds) return null;
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: target.timeZone, calendar: "iso8601", numberingSystem: "latn",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  return {
    format, firstDay: localDay(format,start), lastDay: localDay(format,end-1), today: localDay(format,now.milliseconds),
  };
}
function reviewedPolicy(raw, target, nowExact) {
  const policy = record(raw,POLICY);
  if (!policy || policy.version !== F.version || policy.state !== "active" || !id(policy.requirementId) ||
      !revision(policy.revision) || !id(policy.authoredBy) || !id(policy.reviewedBy) ||
      policy.authoredBy === policy.reviewedBy || !exactClock(policy.reviewedAtExact) || policy.reviewedAtExact > nowExact) return null;
  const pins = record(policy.target,TARGET_PINS), source = record(policy.source,SOURCE);
  if (!pins || !same(pins,target,TARGET_PINS) || !source || !same(source,F,["registerId","sourceEdition","primaryCourseId"]) ||
      (source.equivalentCourseId !== null && source.equivalentCourseId !== F.equivalentCourseId)) return null;
  return { ...policy,target:pins,source };
}
function selectedSubject(raw, target) {
  const subject = record(raw,SUBJECT);
  if (!subject || !same(subject,target,["orgId","programId","shiftId"]) || !id(subject.participationId) ||
      !id(subject.contactId) || !revision(subject.revision) || !["requested","waitlisted"].includes(subject.state) ||
      subject.coverage !== "full" || subject.origin !== "live") return null;
  return subject;
}

function readObservation(raw, subject, policy, nowExact) {
  const row = record(raw,OBSERVATION);
  if (!row || !same(row,subject,["orgId","programId","shiftId","participationId","contactId"]) ||
      row.requirementId !== policy.requirementId || row.policyRevision !== policy.revision ||
      !same(row,policy.source,["registerId","sourceEdition"]) || !revision(row.sourceRevision) ||
      !id(row.recordedBy) || !exactClock(row.checkedAtExact) ||
      row.checkedAtExact < policy.reviewedAtExact || row.checkedAtExact > nowExact ||
      !["complete","unknown","withdrawn"].includes(row.status)) return null;
  const equivalentReview = row.equivalentReview === null ? null : record(row.equivalentReview,EQUIVALENT_REVIEW);
  if (row.equivalentReview !== null && (!equivalentReview || !digest(equivalentReview.observationSha256) ||
      !id(equivalentReview.reviewedBy) || !revision(equivalentReview.participationRevision) ||
      !exactClock(equivalentReview.reviewedAtExact) || equivalentReview.reason !== F.equivalentReason)) return null;

  if (row.status === "complete") {
    if ((row.courseId !== policy.source.primaryCourseId &&
        !(row.courseId !== null && row.courseId === policy.source.equivalentCourseId)) ||
        !validDate(row.completedOn) || !validDate(row.validThrough) || row.completedOn > row.validThrough ||
        (row.courseId === policy.source.primaryCourseId && equivalentReview !== null)) return null;
  } else if (row.courseId !== null || row.completedOn !== null || row.validThrough !== null || equivalentReview !== null) {
    return null;
  }
  return { ...row,equivalentReview };
}
function currentObservation(retained, incoming) {
  if (!incoming) return { row:retained,order:retained ? "retained" : "none" };
  if (!retained) return { row:incoming,order:"first" };
  if (incoming.sourceRevision < retained.sourceRevision) return { row:retained,order:"older" };
  if (incoming.sourceRevision === retained.sourceRevision) {
    if (!same(incoming,retained,EXTERNAL_FACTS)) return { row:null,order:"conflict" };
    if (hash(incoming) === hash(retained)) return { row:retained,order:"same" };
    if (incoming.checkedAtExact === retained.checkedAtExact) return { row:null,order:"conflict" };
    if (incoming.checkedAtExact < retained.checkedAtExact) return { row:retained,order:"older-check" };
    // Rechecking unchanged external facts can renew freshness. It cannot
    // change a disposition, course or any of the issuer's validity dates.
    return { row:incoming,order:"rechecked" };
  }
  if (incoming.checkedAtExact < retained.checkedAtExact) return { row:null,order:"conflict" };
  return { row:incoming,order:"newer" };
}
function acceptedEquivalent(row, subject, policy, nowExact) {
  const { equivalentReview: review, ...observation } = row;
  if (!review || review.participationRevision !== subject.revision || review.reviewedBy !== policy.reviewedBy ||
      review.reviewedBy === row.recordedBy || review.reviewedAtExact < row.checkedAtExact ||
      review.reviewedAtExact > nowExact) return false;
  return review.observationSha256 === hash([
    "charitology-volunteer-orientation-observation-v1",subject.revision,observation,
  ]);
}
const decision = (state, reason, order = "none", basis = null) => Object.freeze({state,reason,order,basis});

/**
 * Check one already protected place against one retained observation and at
 * most one source correction. An incoming row is a counterfactual until a
 * future authorized store accepts it. A result says only whether this training
 * criterion is met, with no identity, approval, booking or persistence.
 */
export function decideVolunteerOrientation(raw) {
  const input = record(raw,INPUT), now = exactClock(input?.nowExact);
  if (!input || !now) return decision("policy-review-needed","context-invalid");
  const target = record(input.target,TARGET), window = shiftWindow(target,now);
  if (!window) return decision("policy-review-needed","target-unavailable");
  const policy = reviewedPolicy(input.policy,target,input.nowExact);
  if (!policy) return decision("policy-review-needed","policy-unavailable");
  const subject = selectedSubject(input.subject,target);
  if (!subject) return decision("unknown","subject-unavailable");

  const retained = readObservation(input.retainedObservation,subject,policy,input.nowExact);
  const incoming = readObservation(input.incomingObservation,subject,policy,input.nowExact);
  if ((!retained && input.retainedObservation !== null) || (!incoming && input.incomingObservation !== null))
    return decision("unknown","evidence-invalid");
  const { row,order } = currentObservation(retained,incoming);
  if (order === "conflict") return decision("unknown","source-order-conflict",order);
  if (!row) return decision("unknown","evidence-missing",order);
  if (row.status === "withdrawn") return decision("withdrawn","source-withdrawn",order);
  if (row.status === "unknown") return decision("unknown","source-unknown",order);

  const checked = exactClock(row.checkedAtExact);
  if (now.microseconds - checked.microseconds >= MAX_AGE)
    return decision("unknown","evidence-stale",order);
  if (row.completedOn > localDay(window.format,checked.milliseconds) || row.completedOn > window.firstDay)
    return decision("unknown","completion-date-invalid",order);
  if (row.validThrough < window.today || row.validThrough < window.lastDay)
    return decision("expired","coverage-ended",order);
  if (row.courseId === policy.source.primaryCourseId)
    return decision("verified","full-shift-covered",order,"primary");
  if (acceptedEquivalent(row,subject,policy,input.nowExact))
    return decision("verified","full-shift-covered",order,"equivalent");
  return decision("unknown","equivalent-review-needed",order);
}
