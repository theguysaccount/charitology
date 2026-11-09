/** Pure substitution receipt and recovery grammar. The trusted caller owns
 * current identity, locked source selection, SQL writes and the outer commit. */
import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";
import { authorizeVolunteerSubstitution } from "./volunteer-substitution-review.mjs";

export const SUBSTITUTION_RECEIPT_FORMAT = "charitology-volunteer-substitution-receipt";
export const SUBSTITUTION_HISTORY_FORMAT = "charitology-volunteer-substitution-history";
export const SUBSTITUTION_RECEIPT_LIMITS = Object.freeze({ receiptBytes: 3072, historyBytes: 2048 });
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const SHA = /^[a-f0-9]{64}$/;
const KEY = /^[A-Za-z0-9_-]{16,100}$/;
const DECISION = /^[a-f0-9]{32}$/;
const MAX_REVISION = 2147483647;
const STAMP = /^(?!0000)\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/;
const SCOPE = ["orgId", "intentId", "staffScopeSha256", "restoreScopeSha256"];
const WIRE = ["version", "reviewSha256", "idempotencyKey", "acknowledge"];
const LIVE = ["format", "version", "originMode", "id", "scope", "reviewSha256", "requestSha256", "history", "sha256"];
const HISTORY = ["format", "version", "originMode", "decisionId", "originOrgId", "shift", "outgoing", "replacement", "confirmedPlaces", "acceptedAtExact", "sha256"];
const LEG = ["participationId", "assignmentId", "beforeRevision", "afterRevision", "assignmentBeforeRevision", "assignmentAfterRevision", "fromState", "toState"];
const WRITTEN = ["orgId", "shiftId", "participationId", "revision", "state", "assignmentId", "assignmentRevision", "assignmentState", "atExact"];
const RECOVERED = ["orgId", "id", "originMode", "storedAtExact", "history"];

export class VolunteerSubstitutionReceiptError extends Error {
  constructor(code = "substitution_receipt_fields", status = 422) {
    super("Review the exact saved substitution or its inactive history.");
    this.name = "VolunteerSubstitutionReceiptError";
    this.code = code;
    this.status = status;
  }
}
const need = (condition, code, status) => {
  if (!condition) throw new VolunteerSubstitutionReceiptError(code, status);
};
const plain = value => value && typeof value === "object" && !isProxy(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
function field(value, key) {
  need(plain(value));
  const property = Object.getOwnPropertyDescriptor(value, key);
  need(property?.enumerable && Object.hasOwn(property, "value"));
  return property.value;
}
function fields(value, names) {
  need(plain(value) && Reflect.ownKeys(value).length === names.length);
  return Object.fromEntries(names.map(key => [key, field(value, key)]));
}
const matches = (value, pattern) => typeof value === "string" && value.length <= 100 && pattern.test(value);
const revision = value => Number.isSafeInteger(value) && value >= 1 && value <= MAX_REVISION;
function stamp(value) {
  need(matches(value, STAMP), "substitution_receipt_time");
  const millis = value.slice(0, 23) + "Z", date = new Date(millis);
  need(Number.isFinite(+date) && date.toISOString() === millis, "substitution_receipt_time");
  return value;
}
const hash = (domain, value) => createHash("sha256")
  .update(JSON.stringify(["charitology-volunteer-substitution-receipt-v1", domain, value])).digest("hex");
function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function seal(domain, body, limit) {
  const value = { ...body, sha256: hash(domain, body) };
  need(Buffer.byteLength(JSON.stringify(value)) <= limit, "substitution_receipt_limit");
  return freeze(value);
}
function checkedSeal(domain, body, expected, limit) {
  const saved = seal(domain, body, limit);
  need(matches(expected, SHA) && saved.sha256 === expected, "substitution_receipt_checksum");
  return saved;
}
function scopeOf(raw) {
  const scope = fields(raw, SCOPE);
  need(matches(scope.orgId, ID) && matches(scope.intentId, ID) &&
    matches(scope.staffScopeSha256, SHA) && matches(scope.restoreScopeSha256, SHA));
  return scope;
}
function wireOf(raw) {
  const wire = fields(raw, WIRE);
  need(wire.version === 1 && matches(wire.reviewSha256, SHA) && matches(wire.idempotencyKey, KEY) &&
    wire.acknowledge === true, "substitution_acknowledgement");
  return wire;
}
// A repeated key finds the same local row even if the caller changes the
// target, intent or staff authority. Those changes are checked after lookup.
const liveId = (orgId, wire) => "swap_" + hash("command", [orgId, wire.idempotencyKey]);
const requestHash = (scope, wire) => hash("exact-request", [scope.orgId, scope.intentId, wire]);
const recoveryId = history => "swap_history_" + hash("recovered", [history.originOrgId, history.decisionId]);

export function volunteerSubstitutionReceiptId(orgId, rawRequest) {
  need(matches(orgId, ID));
  return liveId(orgId, wireOf(rawRequest));
}
function leg(raw, from, to) {
  const value = fields(raw, LEG);
  need(matches(value.participationId, ID) && matches(value.assignmentId, ID) &&
    revision(value.beforeRevision) && revision(value.afterRevision) && value.afterRevision === value.beforeRevision + 1 &&
    revision(value.assignmentBeforeRevision) && revision(value.assignmentAfterRevision) &&
    value.assignmentAfterRevision === value.assignmentBeforeRevision + 1 &&
    value.fromState === from && value.toState === to);
  return value;
}
export function validateVolunteerSubstitutionHistory(raw) {
  const { sha256, ...body } = fields(raw, HISTORY);
  need(body.format === SUBSTITUTION_HISTORY_FORMAT && body.version === 1 && body.originMode === "inactive" &&
    matches(body.decisionId, DECISION) && matches(body.originOrgId, ID));
  body.shift = fields(body.shift, ["id", "moduleId", "revision", "startsAtExact", "endsAtExact"]);
  need(matches(body.shift.id, ID) && body.shift.moduleId === "volunteers" && revision(body.shift.revision));
  need(stamp(body.acceptedAtExact) < stamp(body.shift.startsAtExact) &&
    body.shift.startsAtExact < stamp(body.shift.endsAtExact), "substitution_receipt_time");
  body.outgoing = leg(body.outgoing, "confirmed", "cancelled");
  body.replacement = leg(body.replacement, "waitlisted", "confirmed");
  need(body.outgoing.participationId !== body.replacement.participationId &&
    new Set([body.shift.id, body.outgoing.assignmentId, body.replacement.assignmentId]).size === 3);
  body.confirmedPlaces = fields(body.confirmedPlaces, ["before", "after"]);
  need(revision(body.confirmedPlaces.before) && body.confirmedPlaces.before === body.confirmedPlaces.after);
  return checkedSeal("portable-history", body, sha256, SUBSTITUTION_RECEIPT_LIMITS.historyBytes);
}

/** For an exact immutable row already read from the local tenant store. A
 * structurally valid payload from a browser or backup is never such a row. */
export function validateLiveVolunteerSubstitutionReceipt(raw) {
  const { sha256, ...body } = fields(raw, LIVE);
  need(body.format === SUBSTITUTION_RECEIPT_FORMAT && body.version === 1 && body.originMode === "live" &&
    matches(body.id, /^swap_[a-f0-9]{64}$/) && matches(body.reviewSha256, SHA) && matches(body.requestSha256, SHA));
  body.scope = scopeOf(body.scope);
  body.history = validateVolunteerSubstitutionHistory(body.history);
  need(body.history.originOrgId === body.scope.orgId, "substitution_receipt_scope", 404);
  return checkedSeal("live-receipt", body, sha256, SUBSTITUTION_RECEIPT_LIMITS.receiptBytes);
}

function appliedLeg(raw, expected, plan, assignmentId, assignmentBeforeRevision, fromState, assignmentState, at) {
  const result = fields(raw, WRITTEN);
  need(result.orgId === plan.orgId && result.shiftId === plan.shift.id &&
    result.participationId === expected.id && result.revision === expected.nextRevision &&
    result.state === expected.state && result.assignmentId === assignmentId &&
    revision(result.assignmentRevision) && result.assignmentRevision === assignmentBeforeRevision + 1 &&
    result.assignmentState === assignmentState && result.atExact === at, "substitution_receipt_outcome", 409);
  return { participationId: result.participationId, assignmentId, beforeRevision: expected.revision,
    afterRevision: result.revision, assignmentBeforeRevision, assignmentAfterRevision: result.assignmentRevision,
    fromState, toState: result.state };
}

/** Build inside the write transaction after both exact expected rows return.
 * Facts and assignment IDs come from the locked server context, never HTTP. */
export function acceptVolunteerSubstitutionReceipt(raw) {
  const input = fields(raw, ["facts", "request", "decisionId", "assignmentIds", "written"]);
  const wire = wireOf(input.request);
  const { plan } = authorizeVolunteerSubstitution(input.facts, wire);
  const assignments = fields(input.assignmentIds, ["outgoing", "replacement"]);
  need(matches(input.decisionId, DECISION) && matches(assignments.outgoing, ID) && matches(assignments.replacement, ID));
  const acceptedAtExact = stamp(field(input.facts, "nowExact"));
  const scope = scopeOf({ orgId: plan.orgId, intentId: plan.intentId,
    staffScopeSha256: field(input.facts, "staffScopeSha256"), restoreScopeSha256: field(input.facts, "restoreScopeSha256") });
  const written = fields(input.written, ["outgoing", "replacement"]);
  const outcome = (party, from, bookingState) => appliedLeg(written[party], plan[party], plan, assignments[party],
    field(field(input.facts, party), "candidateRevision"), from, bookingState, acceptedAtExact);
  const history = seal("portable-history", {
    format: SUBSTITUTION_HISTORY_FORMAT, version: 1, originMode: "inactive", decisionId: input.decisionId, originOrgId: plan.orgId,
    shift: { id: plan.shift.id, moduleId: "volunteers", revision: plan.shift.revision,
      startsAtExact: plan.shift.startsAt, endsAtExact: plan.shift.endsAt },
    outgoing: outcome("outgoing", "confirmed", "cancelled"),
    replacement: outcome("replacement", "waitlisted", "assigned"),
    confirmedPlaces: plan.confirmedPlaces, acceptedAtExact,
  }, SUBSTITUTION_RECEIPT_LIMITS.historyBytes);
  validateVolunteerSubstitutionHistory(history);
  return seal("live-receipt", {
    format: SUBSTITUTION_RECEIPT_FORMAT, version: 1, originMode: "live", id: liveId(plan.orgId, wire),
    scope, reviewSha256: plan.reviewSha256, requestSha256: requestHash(scope, wire), history,
  }, SUBSTITUTION_RECEIPT_LIMITS.receiptBytes);
}

/** The caller first authenticates current staff and reads this local row.
 * The saved decision remains separate from current roster disposition. */
export function replayVolunteerSubstitutionReceipt(raw, currentScope, rawRequest) {
  const scope = scopeOf(currentScope), wire = wireOf(rawRequest);
  const saved = validateLiveVolunteerSubstitutionReceipt(raw);
  need(SCOPE.every(key => scope[key] === saved.scope[key]), "substitution_receipt_scope", 404);
  need(saved.id === liveId(scope.orgId, wire) && saved.reviewSha256 === wire.reviewSha256 &&
    saved.requestSha256 === requestHash(scope, wire), "substitution_receipt_collision", 409);
  return saved.history;
}

export const projectVolunteerSubstitutionHistory = raw => validateLiveVolunteerSubstitutionReceipt(raw).history;

function requireOriginGraph(history, raw) {
  const graph = fields(raw, ["originOrgId", "shift", "outgoing", "replacement"]);
  const shift = fields(graph.shift, ["id", "moduleId", "kind"]);
  const provenance = "substitution_recovery_provenance";
  need(graph.originOrgId === history.originOrgId && shift.id === history.shift.id &&
    shift.moduleId === "volunteers" && shift.kind === "shift", provenance);
  for (const party of ["outgoing", "replacement"]) {
    const row = fields(graph[party], ["participationId", "assignmentId", "shiftId", "moduleId", "kind"]);
    need(row.participationId === history[party].participationId && row.assignmentId === history[party].assignmentId &&
      row.shiftId === shift.id && row.moduleId === "volunteers" && row.kind === "assignment", provenance);
  }
}

/** A caller-derived closed source graph checks identity. Backup hashes are
 * consistency checks. No imported row can become a local command receipt. */
export function planVolunteerSubstitutionRecovery(raw, rawDestination, originGraph) {
  const destination = fields(rawDestination, ["orgId", "storedAtExact"]);
  const history = validateVolunteerSubstitutionHistory(raw);
  requireOriginGraph(history, originGraph);
  need(matches(destination.orgId, ID) && stamp(destination.storedAtExact) >= history.acceptedAtExact,
    "substitution_recovery_provenance");
  return freeze({ orgId: destination.orgId, id: recoveryId(history), originMode: "recovered",
    storedAtExact: destination.storedAtExact, history });
}

export function projectRecoveredVolunteerSubstitutionHistory(raw, orgId) {
  const row = fields(raw, RECOVERED);
  const history = validateVolunteerSubstitutionHistory(row.history);
  need(matches(orgId, ID) && row.orgId === orgId && row.id === recoveryId(history) && row.originMode === "recovered" &&
    stamp(row.storedAtExact) >= history.acceptedAtExact, "substitution_recovery_provenance");
  return history;
}
