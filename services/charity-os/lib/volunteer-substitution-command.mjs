/**
 * Server-side command composition for one approved shift and two places.
 * No route is mounted here. Pass the existing locked workspace transaction
 * and reviewed server-owned data adapters; never pass HTTP bodies as facts.
 */
import { randomBytes } from "node:crypto";
import { isProxy } from "node:util/types";
import { authorizeVolunteerSubstitution } from "./volunteer-substitution-review.mjs";
import {
  acceptVolunteerSubstitutionReceipt,
  projectVolunteerSubstitutionHistory,
  replayVolunteerSubstitutionReceipt,
  validateLiveVolunteerSubstitutionReceipt,
  volunteerSubstitutionReceiptId,
} from "./volunteer-substitution-receipt.mjs";

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const SHA = /^[a-f0-9]{64}$/;
const identity = v => typeof v === "string" && ID.test(v);
const hash = v => typeof v === "string" && SHA.test(v);
const AUTHORITY = ["orgId", "intentId", "staffScopeSha256"];
const COMMAND = ["version", "reviewSha256", "idempotencyKey", "acknowledge"];

function refuse(status, code, message) {
  throw Object.assign(new Error(message), { status, code });
}
const unavailable = () => refuse(404, "substitution_unavailable", "This shift change is unavailable.");
const inconsistent = () => refuse(409, "substitution_storage", "The shift change could not be recorded. Review again.");
function exact(value, fields, invalid = inconsistent) {
  if (!value || typeof value !== "object" || isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const own = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(own).length !== fields.length ||
      !fields.every(k => own[k]?.enumerable && Object.hasOwn(own[k], "value"))) invalid();
  return Object.fromEntries(fields.map(k => [k, own[k].value]));
}
function staffScope(value, selector) {
  const scope = exact(value, AUTHORITY, unavailable);
  if (scope.orgId !== selector.orgId || scope.intentId !== selector.intentId ||
      !hash(scope.staffScopeSha256)) unavailable();
  return Object.freeze(scope);
}
function graphOf(shiftId, outgoingAssignmentId, replacementAssignmentId) {
  const ids = [shiftId, outgoingAssignmentId, replacementAssignmentId];
  if (!ids.every(identity) || new Set(ids).size !== ids.length) inconsistent();
  return Object.freeze({ shiftId, outgoingAssignmentId, replacementAssignmentId });
}
function currentReviewScope(facts, base) {
  if (!facts || typeof facts !== "object" || isProxy(facts) || Object.getPrototypeOf(facts) !== Object.prototype) unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(facts);
  if (!AUTHORITY.every(key => descriptors[key]?.enumerable && Object.hasOwn(descriptors[key],"value") &&
    descriptors[key].value === base[key])) unavailable();
}

/**
 * The adapter operates on the real workspace transaction callback. No child
 * adapter may start/commit another transaction. readStaffAuthority must check
 * the current verified session and active whole-Volunteers write permission.
 * readRestoreScope must bind the typed server-owned shift and both assignment
 * IDs to current restore history. Each read/write receives the
 * same locked client and the exact org/intent. stagePair must update both
 * expected rows using the common SQL clock, stop undelivered outgoing jobs and
 * enqueue nothing. The fresh-write counter and capacity checks use this same
 * client. The final capacity check has to include the saved receipt.
 */
export function createVolunteerSubstitutionCommand({
  db,
  readStaffAuthority,
  readRestoreScope,
  readLocalAcceptance,
  readLockedReview,
  consumeFreshWrite,
  checkProspectiveCapacity,
  stagePair,
  appendAcceptance,
  checkFinalCapacity,
  noteExactRetry,
}) {
  if (typeof db?.tx !== "function" ||
      ![readStaffAuthority, readRestoreScope, readLocalAcceptance, readLockedReview, consumeFreshWrite, checkProspectiveCapacity, stagePair,
        appendAcceptance, checkFinalCapacity, noteExactRetry].every(f => typeof f === "function"))
    throw new TypeError("Provide the locked workspace and all shift-change adapters.");

  return async function commitVolunteerSubstitution({ session, orgId, intentId, request }) {
    const userId = session?.user?.id;
    if (![userId, orgId, intentId].every(identity)) unavailable();
    // The idempotency namespace stays the same if a caller changes the intent
    // or scope. A different command cannot borrow an existing local decision.
    const wire = Object.freeze(exact(request, COMMAND,
      () => refuse(422, "substitution_acknowledgement", "Review both effects and explicitly accept the change.")));
    const receiptId = volunteerSubstitutionReceiptId(orgId, wire);
    const selector = Object.freeze({ orgId, intentId, userId });
    return db.tx(userId, orgId, async c => {
      const base = staffScope(await readStaffAuthority(c, selector, session), selector);
      const bindRestore = async graph => {
        const restoreScopeSha256 = await readRestoreScope(c, selector, graph);
        if (!hash(restoreScopeSha256)) unavailable();
        return Object.freeze({ ...base, restoreScopeSha256 });
      };
      const saved = await readLocalAcceptance(c, orgId, receiptId);
      if (saved !== null) {
        const accepted = validateLiveVolunteerSubstitutionReceipt(saved);
        if (accepted.id !== receiptId) inconsistent();
        if (!AUTHORITY.every(key => accepted.scope[key] === base[key])) unavailable();
        const h = accepted.history;
        // A pending offer can have expired or disappeared. After staff
        // authorization, only the immutable local receipt supplies this graph.
        const scope = await bindRestore(graphOf(h.shift.id, h.outgoing.assignmentId, h.replacement.assignmentId));
        const decision = replayVolunteerSubstitutionReceipt(accepted, scope, wire);
        // No calls to a fresh review, allocation, budgets or writes on Retry.
        // Production can mark an exact receipt read for its remaining exit check.
        noteExactRetry(c, orgId);
        return Object.freeze({ decision, replayed: true });
      }

      const locked = exact(await readLockedReview(c, selector, base), ["facts", "assignmentIds", "writeContext"]);
      currentReviewScope(locked.facts, base);
      const { plan } = authorizeVolunteerSubstitution(locked.facts, wire);
      const assignmentIds = exact(locked.assignmentIds, ["outgoing", "replacement"]);
      const scope = await bindRestore(graphOf(plan.shift.id, assignmentIds.outgoing, assignmentIds.replacement));
      if (locked.facts.restoreScopeSha256 !== scope.restoreScopeSha256) unavailable();
      // Prepare only after authority, original consent and the live roster
      // review all pass. A thrown capacity/receipt error rolls back both places.
      await consumeFreshWrite(c, selector);
      await checkProspectiveCapacity(c, selector, plan);
      const written = await stagePair(c, selector, locked.writeContext, plan);
      const receipt = acceptVolunteerSubstitutionReceipt({ facts: locked.facts, request: wire,
        decisionId: randomBytes(16).toString("hex"), assignmentIds, written });
      if (receipt.id !== receiptId) inconsistent();
      await appendAcceptance(c, orgId, receipt, userId);
      // Verify an actual store read on the same transaction, not merely the
      // value passed to the append adapter. A missing receipt is a failed save.
      const persisted = validateLiveVolunteerSubstitutionReceipt(await readLocalAcceptance(c, orgId, receiptId));
      if (persisted.id !== receiptId || persisted.sha256 !== receipt.sha256) inconsistent();
      await checkFinalCapacity(c, selector, plan);
      return Object.freeze({ decision: projectVolunteerSubstitutionHistory(persisted), replayed: false });
    }, { lock: true });
  };
}
