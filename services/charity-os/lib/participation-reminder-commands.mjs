/** Stateful protocol, one supplied client. Router owns actual COMMIT/ROLLBACK. */
import { hash, id as freshId } from './security.mjs';
import { audit } from './database.mjs';
import { compareGroupExactStamps } from './participation-group-model.mjs';
import { readParticipationDomainClock } from './participation.mjs';
import { validateReminderPreference, reminderCommitmentSha256, reminderWindow,
  validateReminderReviewRequest, validateReminderScheduleRequest, reminderCommandPins,
  makeReminderPreviewPacket, reminderPreviewResponse, makeReminderIntentMarker,
  makeReminderReceipt, reminderAcceptedResponse, REMINDER_METHOD } from './participation-reminder-model.mjs';
import { buildReminderOutboxPlan, reminderOutboxParameters } from './participation-reminder-outbox.mjs';
import { reminderNeed as need, reminderOwn as own, reminderExact as exact, reminderRows as rows,
  reminderSame as same, reminderSessionSelectors as selectors, validateReminderChoiceRequest,
  reminderChoicePins, reminderChoiceRevisions, reminderChoiceMatchesBinding, validateReminderChoiceReceipt, REMINDER_CHOICE_FORMAT } from './participation-reminder-choice.mjs';
import { readOwnReminderContext, ownReminderEnableBinding, reminderOwnSummary, readReminderAdminContext, reminderAdminPreflight } from './participation-reminder-context.mjs';
import { lookupReminderIntent, insertReminderPreview, retainReminderAccepted, cancelOwnUnattemptedReminders,
  requireReminderOriginalAvailable, nextReminderJournalSequence, REMINDER_STORE_SQL } from './participation-reminder-store.mjs';
import { reminderChoiceAuditCandidates, reminderScheduleAuditCandidate } from './participation-reminder-audit.mjs';
import { requireReminderMeasuredCapacity } from './participation-reminder-capacity.mjs';

function choiceResult(receipt, replayed) { return own({ ok: true, ...receipt.result, replayed }, 16384); }
function choiceAccepted(context, pins, participationId) {
  const last = context.p.last_command;
  if (!last || last.format !== REMINDER_CHOICE_FORMAT) return null;
  const receipt = validateReminderChoiceReceipt(last);
  if (receipt.commandSha256 !== pins.commandSha256) return null;
  need(receipt.requestSha256 === pins.requestSha256 && receipt.result.participationId === participationId &&
    receipt.actorSha256 === context.authority.actorSha256 && receipt.sessionSha256 === context.authority.sessionSha256 &&
    receipt.linkSha256 === context.authority.linkSha256, 'intent', 409);
  return choiceResult(receipt, true);
}
function choiceArguments(args) {
  const request = validateReminderChoiceRequest(args.input), actorId = selectors(args.session).actorId;
  return { request, pins: reminderChoicePins({ org: args.org, actorId, intakeId: args.intakeId,
    participationId: args.participationId, request }) };
}
export async function getOwnReminder(c, args) {
  const context = await readOwnReminderContext(c, args);
  return own({ ok: true, participationId: context.p.id, revision: context.p.revision,
    intakeRevision: context.intake.revision, reminder: await reminderOwnSummary(c, { org: args.org, context }) }, 8192);
}
export async function acceptedOwnReminderChoice(c, args) {
  const { pins } = choiceArguments(args), context = await readOwnReminderContext(c, { ...args, write: false });
  return choiceAccepted(context, pins, args.participationId);
}
export async function changeOwnReminderChoice(c, args) {
  const { request, pins } = choiceArguments(args), context = await readOwnReminderContext(c, { ...args, write: true });
  need(choiceAccepted(context, pins, args.participationId) === null, 'read_reconcile', 409);
  const { p, intake, preference } = context;
  need(request.revision === p.revision && request.intakeRevision === intake.revision &&
    request.reminderRevision === (preference?.revision ?? 0), 'revision', 409);
  const revisions = reminderChoiceRevisions(p.revision, preference?.revision ?? 0, request.enabled, preference?.enabled === true);
  const binding = request.enabled ? await ownReminderEnableBinding(c, { org: args.org, context }) : null;
  if (binding) {
    need(request.commitmentSha256 === reminderCommitmentSha256(binding.commitment), 'commitment', 409);
    need(!reminderChoiceMatchesBinding({ preference: preference ?? null, recipient: binding.recipient,
      commitmentSha256: request.commitmentSha256 }), 'already_enabled', 409);
  }
  const clock = await readParticipationDomainClock(c);
  const next = validateReminderPreference({ version: REMINDER_METHOD, enabled: request.enabled,
    revision: revisions.preference, atExact: clock.atExact, ...(binding ? { userId: binding.recipient.userId,
      linkId: binding.recipient.linkId, linkRevision: binding.recipient.linkRevision,
      recipientSha256: hash(binding.recipient.email), commitmentSha256: request.commitmentSha256 } : {}) });
  const receiptFor = auditRetained => validateReminderChoiceReceipt({ format: REMINDER_CHOICE_FORMAT, version: 1,
    method: REMINDER_METHOD, action: 'choice', ...context.authority, ...pins, acceptedAtExact: clock.atExact,
    result: { participationId: p.id, revision: revisions.participation, intakeRevision: intake.revision,
      reminder: { version: REMINDER_METHOD, enabled: request.enabled, revision: next.revision, atExact: clock.atExact }, auditRetained } });
  const audits = reminderChoiceAuditCandidates({ org: args.org, actorId: context.actor.id, participationId: p.id, enabled: request.enabled });
  await requireReminderMeasuredCapacity(c, args.org, { phase: 'choice-before-write', enabled: request.enabled, audits,
    participation: p, participationRevision: revisions.participation, preference: next, atExact: clock.atExact,
    receiptVariants: request.enabled ? [receiptFor(true)] : [receiptFor(false), receiptFor(true)] });
  const auditEvent = audits[0];
  const auditRetained = await audit(c, auditEvent.org_id, auditEvent.actor_id, auditEvent.action, null, auditEvent.detail);
  need(typeof auditRetained === 'boolean', 'audit', 500);
  if (request.enabled) need(auditRetained, 'audit');
  if (!request.enabled) await cancelOwnUnattemptedReminders(c, args.org, p.id);
  const receipt = receiptFor(auditRetained);
  const updated = await c.query('UPDATE os_participations SET reminder_consent=$3::jsonb,revision=$4,last_command=$5::jsonb,updated_at=$6::timestamptz WHERE org_id=$1 AND id=$2 AND revision=$7 AND reminder_consent IS NOT DISTINCT FROM $8::jsonb',
    [args.org, p.id, JSON.stringify(next), revisions.participation, JSON.stringify(receipt), clock.atExact, p.revision,
      p.reminder_consent == null ? null : JSON.stringify(p.reminder_consent)]);
  need(updated.rowCount === 1, 'revision', 409);
  await requireReminderMeasuredCapacity(c, args.org, { phase: 'choice-final', enabled: request.enabled, participationId: p.id });
  return choiceResult(receipt, false);
}
function packetFromContext(context, { org, previewId, issuedAtExact }) {
  return makeReminderPreviewPacket({ previewId, orgId: org, actorId: context.member.userId, authority: context.authority,
    target: context.target, policy: { epoch: context.policy.epoch, revision: context.policy.revision }, template: context.template,
    items: context.items.map(({ recipient, preference, ...item }) => ({ ...item,
      dueAtExact: reminderWindow(item.commitment, issuedAtExact, 'schedule').dueAtExact })), issuedAtExact });
}
export async function previewParticipationReminder(c, args) {
  const request = validateReminderReviewRequest(args.input);
  const context = await readReminderAdminContext(c, { ...args, ...request.target,
    participationIds: request.participations.map(item => item.participationId), write: true });
  need(request.target.targetRevision === context.target.targetRevision && request.target.sourceRevision === context.target.sourceRevision,
    'revision', 409);
  for (const requested of request.participations) {
    const actual = context.items.find(item => item.participationId === requested.participationId);
    need(actual && actual.participationRevision === requested.revision && actual.intakeRevision === requested.intakeRevision, 'revision', 409);
  }
  const clock = await readParticipationDomainClock(c);
  const probe = packetFromContext(context, { org: args.org, previewId: '0'.repeat(32), issuedAtExact: clock.atExact });
  await requireReminderMeasuredCapacity(c, args.org, { phase: 'preview-before-id', packet: probe, access: context.access, audits: [] });
  const packet = packetFromContext(context, { org: args.org, previewId: freshId(), issuedAtExact: clock.atExact });
  await insertReminderPreview(c, { org: args.org, actorId: context.member.userId, packet, access: context.access });
  await requireReminderMeasuredCapacity(c, args.org, { phase: 'preview-final', previewId: packet.previewId });
  return reminderPreviewResponse(packet);
}
async function lookup(c, args, write) {
  const request = validateReminderScheduleRequest(args.input), actorId = selectors(args.session).actorId;
  const pins = reminderCommandPins({ orgId: args.org, actorId, request });
  await reminderAdminPreflight(c, args);
  const row = await lookupReminderIntent(c, { org: args.org, actorId, previewId: request.previewId, commandSha256: pins.commandSha256, write });
  if (row) need(row.id === request.previewId, 'intent', 409);
  if (row?.payload.state === 'accepted') need(row.payload.receipt.commandSha256 === pins.commandSha256 &&
    row.payload.receipt.requestSha256 === pins.requestSha256, 'intent', 409);
  return { request, pins, row, actorId };
}
async function accepted(c, args, found) {
  if (found.row?.payload.state !== 'accepted') return null;
  const envelope = found.row.payload, receipt = envelope.receipt;
  const current = await readReminderAdminContext(c, { ...args, ...envelope.access,
    participationIds: receipt.result.scheduled.map(item => item.participationId), write: false, eligible: false });
  need(same(current.access, envelope.access) && same(current.authority, receipt.authority), 'reconcile', 409);
  return reminderAcceptedResponse(receipt, true);
}
export async function acceptedParticipationReminder(c, args) { return accepted(c, args, await lookup(c, args, false)); }
export async function scheduleParticipationReminder(c, args) {
  const found = await lookup(c, args, true); need(await accepted(c, args, found) === null, 'read_reconcile', 409);
  need(found.row?.payload.state === 'pending', 'preview', 409);
  const original = found.row.payload.packet;
  const context = await readReminderAdminContext(c, { ...args, ...original.target,
    participationIds: original.items.map(item => item.participationId), write: true });
  need(same(context.access, found.row.payload.access), 'stale', 409);
  const current = packetFromContext(context, { org: args.org, previewId: original.previewId, issuedAtExact: original.issuedAtExact });
  need(same(current, original), 'stale', 409);
  const clock = await readParticipationDomainClock(c, { issuedAtExact: original.issuedAtExact, expiresAtExact: original.expiresAtExact });
  need(compareGroupExactStamps(clock.atExact, original.expiresAtExact) < 0 &&
    original.items.every(item => compareGroupExactStamps(clock.atExact, item.dueAtExact) < 0), 'window', 409);
  const auditEvent = reminderScheduleAuditCandidate({ org: args.org, actorId: found.actorId, previewId: original.previewId, participationIds: original.items.map(item => item.participationId) });
  const bindings = context.items.map(({ participationId, recipient, preference }) => ({ participationId, recipient, preference }));
  const sequences = [];
  for (const item of original.items) {
    await requireReminderOriginalAvailable(c, args.org, item);
    sequences.push(await nextReminderJournalSequence(c, args.org, item.participationId));
  }
  const probeIdentities = original.items.map((item, n) => ({ participationId: item.participationId,
    outboxId: (n + 1).toString(16).padStart(32, '0'), relayKey: 'participation-reminder-' + (n + 1).toString(16).padStart(32, '0'), eventRevision: sequences[n] }));
  const probe = buildReminderOutboxPlan({ packet: original, request: found.request, atExact: clock.atExact, bindings, identities: probeIdentities });
  await requireReminderMeasuredCapacity(c, args.org, { phase: 'schedule-before-id', row: found.row,
    atExact: clock.atExact, audits: [auditEvent], proposedRows: probe.rows, receipt: probe.receipt });
  const identities = original.items.map((item, n) => ({ participationId: item.participationId, outboxId: freshId(),
    relayKey: 'participation-reminder-' + freshId(), eventRevision: sequences[n] }));
  const proposed = buildReminderOutboxPlan({ packet: original, request: found.request, atExact: clock.atExact, bindings, identities });
  for (const row of proposed.rows) {
    const measured = rows(await c.query('SELECT octet_length($1::jsonb::text) AS bytes', [JSON.stringify(row.payload)]), 1);
    need(measured.length === 1 && Number.isSafeInteger(measured[0].bytes) && measured[0].bytes > 0 && measured[0].bytes <= 2048, 'payload_size');
  }
  need(rows(await c.query('SELECT id FROM os_participation_outbox WHERE org_id=$1 AND (id=ANY($2::text[]) OR relay_key=ANY($3::text[])) LIMIT 1',
    [args.org, proposed.rows.map(row => row.id), proposed.rows.map(row => row.relay_key)]), 1).length === 0, 'identity', 409);
  for (const row of proposed.rows) need((await c.query(REMINDER_STORE_SQL.insertOutbox, reminderOutboxParameters(row))).rowCount === 1, 'outbox_write');
  need(await audit(c, auditEvent.org_id, auditEvent.actor_id, auditEvent.action, null, auditEvent.detail), 'audit');
  await retainReminderAccepted(c, { row: found.row, receipt: proposed.receipt });
  await c.query('INSERT INTO os_job_tenants(org_id) VALUES($1) ON CONFLICT(org_id) DO NOTHING', [args.org]);
  await requireReminderMeasuredCapacity(c, args.org, { phase: 'schedule-final', previewId: original.previewId });
  return reminderAcceptedResponse(proposed.receipt, false);
}
