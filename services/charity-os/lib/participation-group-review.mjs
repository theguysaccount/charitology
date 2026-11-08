/** Internal review over a freshly authorized group context. A token holds no
 * place; commits must reload the context and repeat the actual child commands. */
import { fail } from "./security.mjs";
import { groupHash, validateGroupPreviewAdmission, validateGroupPreviewCancellation } from "./participation-group-model.mjs";
import { planGroupAllocation } from "./participation-group-allocation.mjs";
import { effectiveRequestedInterval } from "./participation-intervals.mjs";
import { readParticipationDomainClock, requireParticipationPromotionReason } from "./participation.mjs";
import { signGroupPreview } from "./participation-group-preview.mjs";

const stale = () => fail(409, "participation_group_stale", "Reload the complete group before reviewing a new decision.");
const range = value => ({ startAt: value.startAt, endAt: value.endAt, timeZone: value.timeZone });
const readinessCode = value => {
  if (["participation_consent", "participation_withdrawn"].includes(value)) return "consent";
  if (["participation_approval", "participation_candidate"].includes(value)) return "approval";
  if (["participation_started", "participation_reconcile", "participation_terms"].includes(value)) return "source";
  return "participation";
};
const allocationCode = value => value.startsWith("capacity-") ? "capacity" : value === "volunteer-overlap" ? "overlap" : "participation";

/** No rows, IDs, audits, previews or receipts are written. Raw context pins are
 * private. The public projection contains only the already authorized roster. */
export function planGroupReview({ org, context, operation, input }) {
  const group = context.group;
  if (!group || context.originMode !== "live" || !["admit", "cancel"].includes(operation) ||
      group.orgId !== org || context.source?.id !== group.liveTargetId) stale();
  const admittedIds = group.history.decisions.find(x => x.operation === "admit")?.result.selected.map(x => x.participationId) ?? [];
  const body = operation === "admit"
    ? validateGroupPreviewAdmission(input, group.rosterIds)
    : validateGroupPreviewCancellation(input, admittedIds);
  if (body.groupRevision !== group.revision || (operation === "admit"
    ? group.state !== "draft" || group.revision !== 1 || !context.inventory
    : group.state !== "admitted")) stale();
  const selection = operation === "admit" ? body.selection : { mode: "subset", items: body.selected };
  const selectedIds = selection.mode === "all" ? [...group.rosterIds].sort() : selection.items;
  const unselectedIds = group.rosterIds.filter(id => !selectedIds.includes(id));
  const reasons = operation === "admit" ? body.reasons : selectedIds.map(participationId => ({ participationId, reason: body.reason }));
  const blockers = [], steps = [], seen = new Set();
  const block = (participationId, code) => {
    const key = participationId + ":" + code;
    if (!seen.has(key)) { seen.add(key); blockers.push({ participationId, code }); }
  };
  const byId = new Map(context.roster.map(p => [p.id, p]));
  if (byId.size !== group.rosterIds.length || group.rosterIds.some(id => !byId.has(id))) stale();
  let allocation = null;
  if (operation === "admit") {
    const checks = new Map(context.inventory.readiness.map(row => [row.participationId, row]));
    for (const id of selectedIds) {
      const check = checks.get(id);
      if (!check) stale();
      if (check.reason !== null) block(id, readinessCode(check.reason));
      else if (!check.eligible || !["confirm", "promote"].includes(check.action)) stale();
    }
    if (!blockers.length) {
      const selected = selectedIds.map(id => {
        const p = byId.get(id), terms = checks.get(id).eligible.terms;
        return { orgId: org, participationId: id, bookingRecordId: p.booking_record_id, contactId: p.contact_id,
          targetId: p.target_id, moduleId: p.module_id, range: range(effectiveRequestedInterval(p, terms)) };
      });
      const terms = checks.get(selectedIds[0]).eligible.terms;
      allocation = planGroupAllocation({ orgId: org, target: { targetId: group.liveTargetId, moduleId: group.moduleId,
        capacity: context.source.data.capacity ?? null, range: range(terms) }, rosterIds: group.rosterIds, selection,
        selected, existing: context.inventory.allocationExisting });
      for (const row of allocation.blockers) for (const id of row.participationIds) block(id, allocationCode(row.code));
      if (!blockers.length) {
        const promoted = context.inventory.orderedWaitlist.filter(p => selectedIds.includes(p.id)).map(p => p.id);
        if (selectedIds.some(id => checks.get(id).action === "promote" && !promoted.includes(id))) stale();
        const order = [...promoted, ...selectedIds.filter(id => checks.get(id).action === "confirm").sort()];
        const removedWaitlistIds = [], prospectiveConfirmed = [];
        for (const id of order) {
          const p = byId.get(id), action = checks.get(id).action;
          const reason = reasons.find(row => row.participationId === id)?.reason;
          if (action === "promote") {
            const suggestedId = context.suggest({ removedWaitlistIds, prospectiveConfirmed });
            if (suggestedId !== id && reason === undefined) block(id, "bypass-reason");
            else requireParticipationPromotionReason({ participationId: id, suggestedId, reason });
            removedWaitlistIds.push(id);
          }
          const fact = selected.find(row => row.participationId === id);
          prospectiveConfirmed.push({ participationId: id, bookingRecordId: p.booking_record_id, contactId: p.contact_id,
            targetId: p.target_id, moduleId: p.module_id, range: fact.range });
          steps.push({ participationId: id, action, reason: reason ?? null });
        }
      }
    }
  } else {
    for (const id of selectedIds) {
      const p = byId.get(id);
      if (p.recovered || p.state !== "confirmed") block(id, "participation");
      steps.push({ participationId: id, action: "cancel", reason: body.reason });
    }
  }
  const selectionSha256 = groupHash("selection", { selection, reasons });
  const pinsSha256 = groupHash("pins", { chosenGraphPinsSha256: context.chosenGraphPinsSha256,
    inventorySha256: operation === "admit" ? context.inventory.inventorySha256 : null,
    groupRevision: group.revision, lastCommandHash: group.lastCommandHash });
  const reviewSha256 = groupHash("review", { operation, groupId: group.id, groupRevision: group.revision,
    selection, reasons, steps, pinsSha256 });
  const ready = blockers.length === 0;
  const publicReview = { ok: true, operation, groupId: group.id, groupRevision: group.revision,
    selection, selectedIds, unselectedIds, ready, blockers, previewToken: null, reviewSha256: null, expiresAtExact: null };
  let bindings = null;
  if (ready) {
    const authority = context.authority;
    bindings = { operation, orgId: org,
      groupId: group.id, groupRevision: group.revision, actorSha256: authority.actorSha256,
      sessionSha256: authority.sessionSha256, membershipSha256: authority.membershipSha256,
      restoreEpochSha256: authority.restoreEpochSha256, rosterSha256: context.rosterSha256,
      selectionSha256, pinsSha256, reviewSha256 };
  }
  // Private plan is never passed to JSON/Response. Commit repeats this plan and
  // executes real domain children; the synthetic prospective ledger is no grant.
  return { publicReview, bindings, selection, reasons, steps, allocation, pinsSha256, selectionSha256, reviewSha256 };
}

/** Only a preview route issues a token. NEW commit uses planGroupReview and
 * verifies its original token; it never renews or replaces that original proof. */
export async function prepareGroupReview({ c, org, context, operation, input, secret }) {
  const planned = planGroupReview({ org, context, operation, input });
  let payload = null;
  if (planned.publicReview.ready) {
    const clock = operation === "admit" ? context.inventory.serverClock : await readParticipationDomainClock(c);
    payload = { format: "charitology-participation-group-preview", version: 1, ...planned.bindings,
      issuedAtExact: clock.atExact, expiresAtExact: clock.expiresAtExact };
    planned.publicReview.previewToken = signGroupPreview(payload, secret);
    planned.publicReview.reviewSha256 = planned.reviewSha256;
    planned.publicReview.expiresAtExact = clock.expiresAtExact;
  }
  return { ...planned, payload };
}
