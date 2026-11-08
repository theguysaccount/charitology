/** PRIVATE, IO-free sizing candidate. Never persist these synthetic receipts. */
import {
  GROUP_LIMITS, ownGroupValue, groupCanonical, validateGroupHistory,
  validateGroupReceipt, projectGroupHistory,
} from "./participation-group-model.mjs";

export const GROUP_EXIT_PROJECTION_METHOD = "participation-group-future-exit-v1";
export const GROUP_EXIT_MAX_STAMP = "9999-12-31T23:59:59.999999Z";
const DIGEST = "f".repeat(64), ADMIT_REVISION = 2147483646, CANCEL_REVISION = 2147483647;
const freeze = v => {
  if (v && typeof v === "object") { for (const x of Object.values(v)) freeze(x); Object.freeze(v); }
  return v;
};
export class GroupExitProjectionError extends Error {
  constructor() { super("Use one complete, consistent group history and its exact live receipts for a sizing projection only."); this.name = "GroupExitProjectionError"; }
}
const need = v => { if (!v) throw new GroupExitProjectionError(); };
const exact = (v, keys) => need(v && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k)));

function fakeAuthority() {
  return { actorSha256: DIGEST, sessionSha256: DIGEST, membershipSha256: DIGEST,
    memberCreatedAtExact: GROUP_EXIT_MAX_STAMP, restoreEpochSha256: DIGEST };
}
function fakeCommandSlots(receipts) {
  const used = new Set(receipts.map(r => r.commandHash)); let slot = 0;
  return () => {
    // At most12 existing slots and11 future receipts.25 trials are sufficient
    // even if every original digest deliberately occupies an early fake slot.
    while (slot < 25) {
      const candidate = "f".repeat(60) + (slot++).toString(16).padStart(4, "0");
      if (!used.has(candidate)) { used.add(candidate); return candidate; }
    }
    throw new GroupExitProjectionError();
  };
}
function syntheticReceipt(groupId, operation, revision, result, commandHash) {
  return validateGroupReceipt({ version: 1, groupId, operation, commandHash,
    requestHash: DIGEST, authority: fakeAuthority(), reviewSha256: DIGEST,
    acceptedAtExact: GROUP_EXIT_MAX_STAMP, result: { groupId, groupRevision: revision,
      state: "admitted", ...result } });
}

export function projectGroupFutureExit(input) {
  const v = ownGroupValue(input); exact(v, ["originMode", "orgId", "history", "receipts"]);
  need(["live", "recovered"].includes(v.originMode));
  need(typeof v.orgId === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v.orgId));
  const history = validateGroupHistory(v.history);
  need(Array.isArray(v.receipts) && v.receipts.length <= GROUP_LIMITS.receipts);
  const receipts = v.receipts.map(validateGroupReceipt);
  if (v.originMode === "recovered") need(receipts.length === 0);
  else need(groupCanonical(projectGroupHistory({ originOrgId: v.orgId, receipts })) === groupCanonical(history));

  const future = [], nextCommand = fakeCommandSlots(receipts);
  let revision = receipts.length;
  if (v.originMode === "live" && receipts.at(-1).result.state !== "closed") {
    let admission = receipts.find(r => r.operation === "admit");
    if (!admission) {
      need(receipts.length === 1 && receipts[0].operation === "create");
      admission = syntheticReceipt(history.id, "admit", ++revision, {
        selectionMode: "all",
        selected: history.rosterIds.map(participationId => ({ participationId,
          action: "promote", resultRevision: ADMIT_REVISION, state: "confirmed",
          frozenSha256: DIGEST, allocationHash: history.moduleId === "volunteers" ? DIGEST : null,
          notificationQueued: false, auditRetained: false })),
        unselectedIds: [],
        reasonHashes: history.rosterIds.map(participationId => ({ participationId, sha256: DIGEST })),
        auditRetained: false,
      }, nextCommand());
      future.push(admission);
    }
    const cancelled = new Set(receipts.filter(r => r.operation === "cancel").flatMap(r => r.result.selected.map(x => x.participationId)));
    for (const item of admission.result.selected) {
      if (cancelled.has(item.participationId)) continue;
      future.push(syntheticReceipt(history.id, "cancel", ++revision, {
        selected: [{ participationId: item.participationId, resultRevision: CANCEL_REVISION,
          state: "cancelled", notificationQueued: false, auditRetained: false }],
        reasonSha256: DIGEST, auditRetained: false,
      }, nextCommand()));
    }
  }
  need(receipts.length + future.length <= GROUP_LIMITS.receipts);
  if (future.length) {
    const projected = projectGroupHistory({ originOrgId: v.orgId, receipts: [...receipts, ...future] });
    // Original history is an immutable prefix. This is a structural candidate,
    // not proof that a future command is authorized or actually attainable.
    need(groupCanonical(projected.decisions.slice(0, history.decisions.length)) === groupCanonical(history.decisions));
    need(projected.decisions.length === receipts.length + future.length);
  }
  const last = future.at(-1);
  return freeze({ method: GROUP_EXIT_PROJECTION_METHOD, version: 1, projectionOnly: true,
    groupId: history.id, futureReceipts: future,
    projectedHeader: last ? { state: last.result.state, revision: last.result.groupRevision,
      lastCommandHash: last.commandHash, updatedAtExact: last.acceptedAtExact } : null,
    retainedReceiptCount: receipts.length, futureReceiptCount: future.length,
    projectedReceiptCount: receipts.length + future.length });
}

export const GROUP_EXIT_PROJECTION_CONTRACT = freeze({
  method: GROUP_EXIT_PROJECTION_METHOD, privateCandidateOnly: true,
  inputKeys: ["originMode", "orgId", "history", "receipts"],
  outputKeys: ["method", "version", "projectionOnly", "groupId", "futureReceipts", "projectedHeader", "retainedReceiptCount", "futureReceiptCount", "projectedReceiptCount"],
  headerKeys: ["state", "revision", "lastCommandHash", "updatedAtExact"],
  headerNull: "Retain the original current header; no future header growth, never delete it.",
  scope: "GROUP CONTAINER and GROUP RECEIPTS only. Underlying participation/booking/outbox/audits are not projected again.",
  draft: "All-roster admission, then one cancellation receipt per distinct admitted child.",
  admitted: "Only original admitted children not already GROUP-cancelled; unseen own cancellations can leave conservative excess reserve.",
  closedOrRecovered: "Zero future receipts. Recovered history has zero live receipts/capability.",
  synthetic: "Fixed maximum valid SQL stamp, fixed-width fake hashes/authority, max-width valid child revisions, false booleans and all possible admission reason hashes. Unique command slots skip all original hashes. Never persist or execute.",
  boundReasoning: "All-member admission maximizes selected items; one-child cancellation partition maximizes per-receipt overhead. Draft closure is the smaller alternative. Existing batched cancellations reduce remaining count; no no-op padding.",
  notClaimed: ["actual SQL bytes", "native bytes", "future-growth byte guarantee", "workspace reserve composition", "quota feasibility", "live command eligibility", "attainability of nominal maxima"],
});
