/** Staff commands in the handler's ONE locked transaction. No HTTP/body flags
 * can substitute for the fresh SQL context, original proof or actual children. */
import { fail, hash, id, json } from './security.mjs';
import { audit, noteParticipationReceiptReplay } from './database.mjs';
import { participantQuery } from './participants.mjs';
import {
  validateGroupCreate, validateGroupClose, validateGroupCommit, validateGroupReceipt,
  groupCommandHashes, deriveGroupChildKey, groupHash,
} from './participation-group-model.mjs';
import { readGroupContext } from './participation-group-context.mjs';
import { requireGroupReceiptAuthority } from './participation-group-access.mjs';
import { findGroupReceipt, insertDraftGroup, appendGroupDecision } from './participation-group-store.mjs';
import { groupCommandDTO } from './participation-group-dto.mjs';
import { planGroupReview } from './participation-group-review.mjs';
import { verifyGroupPreview } from './participation-group-preview.mjs';
import { readParticipationDomainClock, applyParticipationDomainCommand, participationIntent } from './participation.mjs';
import {
  checkGroupCreateBudget, checkGroupCreateReceiptCapacity, checkGroupOrdinaryCapacity,
  groupCreateAudit,
} from './participation-group-write-capacity.mjs';
import { checkGroupSafetyCapacity } from './participation-group-safety-capacity.mjs';

const ROUTE = /^participation-groups(?:\/([A-Za-z0-9_-]{1,100})\/(admit|cancel|close))?$/;
const stale = () => fail(409, 'participation_group_stale', 'Reload and review the complete group before a new decision.');
const collision = () => fail(409, 'participation_group_intent', 'This intent is already retained for a different command.');
const reply = (value, status = 200) => json(value, status, { 'referrer-policy': 'no-referrer' });
const admittedIds = context => context.group.history.decisions.find(d => d.operation === 'admit')?.result.selected.map(p => p.participationId) ?? [];
const commandReceipt = ({ groupId, operation, hashes, context, clock, reviewSha256 = null, result }) => validateGroupReceipt({
  version: 1, groupId, operation, ...hashes, authority: context.authority,
  reviewSha256, acceptedAtExact: clock.atExact, result,
});
const seed = groupId => ({ kind: 'group', groupId });

async function freshDisposition(c, org, session, groupId) {
  return readGroupContext(c, { org, session, seed: seed(groupId), operation: 'read', readOnly: true });
}

/** Original grammar/hashes are admitted before lookup. This path deliberately
 * has no NEW eligibility, revision, preview-MAC, clock or capacity purchase. */
async function replay({ c, org, session, groupId, operation, hashes, retained }) {
  const context = await readGroupContext(c, { org, session,
    seed: operation === 'create' ? { kind: 'receipt', commandHash: hashes.commandHash } : seed(groupId),
    operation: 'replay', readOnly: false });
  if (retained.operation !== operation || retained.requestHash !== hashes.requestHash ||
      retained.commandHash !== hashes.commandHash ||
      (operation !== 'create' && retained.groupId !== groupId) || retained.groupId !== context.group?.id) collision();
  requireGroupReceiptAuthority(retained.authority, context.member, session, context.restoreEpochSha256);
  const response = reply(groupCommandDTO({ receipt: retained, context, replayed: true }));
  noteParticipationReceiptReplay(c, org);
  return response;
}

function childInput(context, p, step, commandHash) {
  const booking = context.records.find(r => r.id === p.booking_record_id);
  if (!booking) stale();
  return {
    revision: p.revision,
    ...(step.action === 'cancel' ? {} : {
      targetRevision: context.t.revision, candidateRevision: booking.revision,
      consentRevision: p.consent?.revision || 0,
      ...(p.requested_interval != null ? { allocationHash: p.consent?.allocationHash } : {}),
    }),
    ...(step.reason === null ? {} : { reason: step.reason }),
    idempotencyKey: deriveGroupChildKey({ groupId: context.group.id, commandHash,
      operation: step.action === 'cancel' ? 'cancel' : 'admit', participationId: p.id, action: step.action }),
  };
}

/** Only exact write routes are consumed. Read/review/invalid methods remain the
 * read router's responsibility; no stub returns accepted success. */
export async function participationGroupWriteRoutes({ c, org, session, tail, method, input, url, settings }) {
  const match = typeof tail === 'string' && ROUTE.exec(tail);
  if (!match || method !== 'POST') return null;
  participantQuery(url || new URL(`https://os.invalid/api/orgs/${org}/${tail}`), []);
  const [, groupId, action] = match, operation = action || 'create';
  // groupCommandHashes owns the entire bounded operation grammar, including
  // the original token bytes, before any retained request can be returned.
  const hashes = groupCommandHashes({ orgId: org, actorId: session.user.id,
    groupId: groupId || null, operation, input });
  const retained = await findGroupReceipt(c, org, hashes.commandHash);
  if (retained) return replay({ c, org, session, groupId, operation, hashes, retained });

  if (operation === 'create') {
    const body = validateGroupCreate(input);
    const context = await readGroupContext(c, { org, session,
      seed: { kind: 'target', targetId: body.target.targetId,
        rosterIds: body.members.map(p => p.participationId), coordinatorIntakeId: body.coordinatorIntakeId },
      operation: 'create', readOnly: false });
    const budget = await checkGroupCreateBudget(c, org, { input: body, context });
    // No ID or accepted time is minted until the complete prospective budget
    // has been admitted. The actual receipt/packet is separately checked.
    const clock = await readParticipationDomainClock(c), createdId = id();
    const receipt = commandReceipt({ groupId: createdId, operation, hashes, context, clock, result: {
      groupId: createdId, groupRevision: 1, state: 'draft',
      target: { targetId: context.source.id, moduleId: context.source.moduleId },
      rosterIds: body.members.map(p => p.participationId), coordinatorIntakeId: body.coordinatorIntakeId,
    } });
    await checkGroupCreateReceiptCapacity(c, org, { budget, receipt });
    await insertDraftGroup(c, org, { receipt });
    const event = groupCreateAudit({ org, context, groupId: createdId, coordinatorIntakeId: body.coordinatorIntakeId });
    if (!(await audit(c, org, event.actor_id, event.action,
      { id: event.record_id, moduleId: event.module_id }, event.detail))) stale();
    await checkGroupOrdinaryCapacity(c, org);
    const current = await freshDisposition(c, org, session, createdId);
    return reply(groupCommandDTO({ receipt, context: current, replayed: false }), 201);
  }

  const context = await readGroupContext(c, { org, session, seed: seed(groupId), operation, readOnly: false });
  const group = context.group;
  if (!group || context.originMode !== 'live' || group.id !== groupId) stale();
  if (operation === 'close') {
    const body = validateGroupClose(input);
    if (group.state !== 'draft' || group.revision !== body.groupRevision) stale();
    const clock = await readParticipationDomainClock(c);
    const auditRetained = await audit(c, org, context.member.userId, 'participation-group.closed', context.source,
      { groupId, reasonSha256: groupHash('reason', body.reason) });
    const receipt = commandReceipt({ groupId, operation, hashes, context, clock, result: {
      groupId, groupRevision: 2, state: 'closed', reasonSha256: groupHash('reason', body.reason), auditRetained,
    } });
    await appendGroupDecision(c, org, { expectedRevision: group.revision, receipt });
    await checkGroupSafetyCapacity(c, org);
    const current = await freshDisposition(c, org, session, groupId);
    return reply(groupCommandDTO({ receipt, context: current, replayed: false }));
  }

  // Original wire grammar has already passed before retained-intent lookup.
  // A new command against a decided group is a conflict, not malformed input.
  if (operation === 'admit'
    ? group.state !== 'draft' || group.revision !== 1
    : group.state !== 'admitted') stale();
  const body = validateGroupCommit(input, { operation,
    rosterIds: operation === 'admit' ? group.rosterIds : admittedIds(context) });
  const reviewInput = operation === 'admit'
    ? { version: 1, groupRevision: group.revision, selection: body.selection, reasons: body.reasons }
    : { version: 1, groupRevision: group.revision, selected: body.selection.items, reason: body.reasons[0].reason };
  const planned = planGroupReview({ org, context, operation, input: reviewInput });
  if (!planned.publicReview.ready || !planned.bindings || planned.reviewSha256 !== body.reviewSha256) stale();
  const initialClock = operation === 'admit' ? context.inventory.serverClock : await readParticipationDomainClock(c);
  const original = verifyGroupPreview(body.previewToken, settings.secret, { nowExact: initialClock.atExact, bindings: planned.bindings });
  const childCommands = planned.steps.map(step => {
    const p = context.roster.find(p => p.id === step.participationId);
    if (!p) stale();
    const child = childInput(context, p, step, hashes.commandHash);
    const intent = participationIntent(child, context.member.userId, step.action);
    if (p.last_command?.intentHash === intent.intentHash) collision();
    return { p, step, child };
  });
  // This last SQL clock validates the ORIGINAL window immediately before the
  // first child. All actual children and acceptedAt share this same brand/c.
  const clock = await readParticipationDomainClock(c, {
    issuedAtExact: original.issuedAtExact, expiresAtExact: original.expiresAtExact,
  });
  const outcomes = [];
  for (const { p, step, child } of childCommands) {
    const applied = await applyParticipationDomainCommand({ settings, c, org, user: context.member.userId,
      member: context.member, source: context.source, t: context.t, records: context.records,
      input: child, p, action: step.action, serverClock: clock });
    // A child Replay cannot stand in for a new all-or-none aggregate decision.
    if (applied.replayed || applied.p.id !== p.id || applied.p.revision !== p.revision + 1 ||
        applied.p.state !== (operation === 'admit' ? 'confirmed' : 'cancelled') ||
        typeof applied.notificationQueued !== 'boolean') stale();
    outcomes.push({ participationId: p.id,
      ...(operation === 'admit' ? { action: step.action,
        frozenSha256: hash(applied.p.frozen), allocationHash: applied.p.frozen?.allocationHash ?? null } : {}),
      resultRevision: applied.p.revision, state: applied.p.state,
      notificationQueued: applied.notificationQueued, auditRetained: applied.auditRetained });
  }
  outcomes.sort((a, b) => a.participationId < b.participationId ? -1 : 1);
  const auditRetained = await audit(c, org, context.member.userId,
    operation === 'admit' ? 'participation-group.admitted' : 'participation-group.cancelled', context.source,
    { groupId, selectedIds: outcomes.map(p => p.participationId), reviewSha256: planned.reviewSha256 });
  const result = { groupId, groupRevision: group.revision + 1, state: 'admitted',
    ...(operation === 'admit' ? { selectionMode: body.selection.mode,
      unselectedIds: planned.publicReview.unselectedIds,
      reasonHashes: planned.reasons.map(r => ({ participationId: r.participationId, sha256: groupHash('reason', r.reason) })) }
      : { reasonSha256: groupHash('reason', body.reasons[0].reason) }),
    selected: outcomes, auditRetained };
  const receipt = commandReceipt({ groupId, operation, hashes, context, clock, reviewSha256: planned.reviewSha256, result });
  await appendGroupDecision(c, org, { expectedRevision: group.revision, receipt });
  if (operation === 'admit') await checkGroupOrdinaryCapacity(c, org);
  else await checkGroupSafetyCapacity(c, org);
  const current = await freshDisposition(c, org, session, groupId);
  return reply(groupCommandDTO({ receipt, context: current, replayed: false }));
}
