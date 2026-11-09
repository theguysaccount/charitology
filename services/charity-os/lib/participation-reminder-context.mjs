/** Current SQL-owned identity and typed scope. Caller owns the tenant transaction. */
import { hash } from './security.mjs';
import { requireAdmin, requirePermission, inScope } from './access.mjs';
import { getModule, ROLES } from './modules.mjs';
import { rowRecord } from './database.mjs';
import { participantEmail } from './participants.mjs';
import { currentGroupMember, groupRestoreEpoch, groupSessionHash } from './participation-group-access.mjs';
import { readParticipationGroupRowPin } from './participation-group-pins.mjs';
import { groupHash } from './participation-group-model.mjs';
import { readReminderScheduleForOutbox } from './participation-reminder-store.mjs';
import { frozenParticipationInterval } from './participation-intervals.mjs';
import { participationTerms } from './participation.mjs';
import { resolveDeliveryRecipient, deliveryConsentValid, readOwnParticipationEmailBinding,
  readParticipationDeliveryPolicy, participationDeliveryGate, currentParticipationDeliveryApproval } from './participation-delivery.mjs';
import { validateReminderCommitment, reminderCommitmentSha256, reminderActorSha256,
  validateReminderPreference, REMINDER_METHOD } from './participation-reminder-model.mjs';
import { renderParticipationReminderTemplate } from './participation-reminder-template.mjs';
import { reminderNeed as need, reminderRows as rows, reminderId as id, reminderStamp as stamp,
  reminderSessionSelectors as selectors, reminderOwn as own, REMINDER_MAX_REVISION, reminderChoiceMatchesBinding } from './participation-reminder-choice.mjs';

// Existing rowRecord consumes pg Dates. to_jsonb timestamps are strings;
// convert only this legacy record DTO projection, never SQL6 identity pins.
function projectedRecord(input) {
  const raw = own(input, 131072);
  need(typeof raw.created_at === 'string' && typeof raw.updated_at === 'string', 'sql_record_time', 500);
  const created = new Date(raw.created_at), updated = new Date(raw.updated_at);
  need(Number.isFinite(created.getTime()) && Number.isFinite(updated.getTime()), 'sql_record_time', 500);
  return rowRecord({ ...raw, created_at: created, updated_at: updated });
}
const SQL6 = column => `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
export const REMINDER_CONTEXT_SQL = Object.freeze({
  session: 'SELECT s.id AS session_id,s."userId" AS user_id,u.id AS actual_user_id,u.email,u."emailVerified" AS verified FROM "session" s JOIN "user" u ON u.id=s."userId" WHERE s.id=$1 AND s."userId"=$2 AND s."expiresAt">clock_timestamp()',
  ownIndex: 'SELECT id FROM os_participant_links WHERE user_id=$1 AND org_id=$2 AND intake_id=$3 AND revoked_at IS NULL',
  own: `SELECT l.id AS link_id,l.revision AS link_revision,${SQL6('l.created_at')} AS link_created_exact,to_jsonb(i) AS intake,${SQL6('i.created_at')} AS intake_created_exact FROM os_participant_links l JOIN os_intake i ON i.org_id=l.org_id AND i.id=l.intake_id AND i.publication_id=l.publication_id WHERE l.user_id=$1 AND l.org_id=$2 AND l.intake_id=$3 AND l.revoked_at IS NULL`,
  people: `SELECT to_jsonb(p) AS participation,${SQL6('p.created_at')} AS created_exact,${SQL6('p.confirmed_at')} AS confirmed_exact FROM os_participations p WHERE p.org_id=$1 AND p.id=ANY($2::text[]) ORDER BY p.id COLLATE "C"`,
  target: `SELECT to_jsonb(t) AS target,${SQL6('t.created_at')} AS created_exact FROM os_participation_targets t WHERE t.org_id=$1 AND t.target_id=$2`,
  records: `SELECT to_jsonb(r) AS record,${SQL6('r.created_at')} AS created_exact FROM os_records r WHERE r.org_id=$1 AND r.id=ANY($2::text[]) ORDER BY r.id COLLATE "C"`,
  intakes: `SELECT to_jsonb(i) AS intake,${SQL6('i.created_at')} AS created_exact FROM os_intake i WHERE i.org_id=$1 AND i.id=ANY($2::text[]) ORDER BY i.id COLLATE "C"`,
});
export async function readReminderSession(c, session, write = false) {
  const s = selectors(session), found = rows(await c.query(REMINDER_CONTEXT_SQL.session + (write ? ' FOR SHARE OF s,u' : ''), [s.sessionId, s.actorId]), 1);
  need(found.length === 1, 'session', 401); const row = found[0];
  need(row.session_id === s.sessionId && row.user_id === s.actorId && row.actual_user_id === s.actorId && row.verified === true, 'session', 401);
  const email = participantEmail(row.email); need(email, 'verification', 403);
  return Object.freeze({ id: s.actorId, email, sessionSha256: hash({ method: REMINDER_METHOD, kind: 'own-session', sessionId: s.sessionId }) });
}
export async function ownReminderPreflight(c, { org, session, intakeId }) {
  id(org); id(intakeId); const actor = await readReminderSession(c, session);
  need(rows(await c.query(REMINDER_CONTEXT_SQL.ownIndex, [actor.id, org, intakeId]), 2).length === 1, 'unavailable', 404);
  return actor;
}
export async function readOwnReminderContext(c, { org, session, intakeId, participationId, write = false }) {
  id(org); id(intakeId); id(participationId); await c.query("SET LOCAL TIME ZONE 'UTC'");
  const actor = await readReminderSession(c, session, write);
  const found = rows(await c.query(REMINDER_CONTEXT_SQL.own + (write ? ' FOR UPDATE OF i,l' : ''), [actor.id, org, intakeId]), 2);
  need(found.length === 1, 'unavailable', 404); const link = found[0], intake = link.intake;
  need(intake.org_id === org && intake.id === intakeId, 'unavailable', 404); stamp(link.link_created_exact); stamp(link.intake_created_exact);
  const selected = rows(await c.query(REMINDER_CONTEXT_SQL.people + (write ? ' FOR UPDATE OF p' : ''), [org, [participationId]]), 1);
  need(selected.length === 1, 'unavailable', 404); const row = selected[0], p = row.participation;
  need(p.org_id === org && p.id === participationId && p.intake_id === intakeId, 'unavailable', 404); stamp(row.created_exact);
  const preference = validateReminderPreference(p.reminder_consent ?? null);
  const authority = { actorSha256: reminderActorSha256(actor.id), sessionSha256: actor.sessionSha256,
    linkSha256: hash({ method: REMINDER_METHOD, kind: 'own-incarnation', org, intakeId,
      intakeCreatedAtExact: link.intake_created_exact, participationId, participationCreatedAtExact: row.created_exact,
      linkId: link.link_id, linkRevision: link.link_revision, linkCreatedAtExact: link.link_created_exact }) };
  return { actor, intake, p, confirmedAtExact: row.confirmed_exact, preference, authority };
}
export function currentReminderCommitment(org, p, confirmedAtExact) {
  need(p.org_id === org && p.intake_id && p.frozen && p.frozen.terms &&
    p.frozen.termsHash === hash(p.frozen.terms), 'confirmation', 409);
  const range = frozenParticipationInterval(p);
  return validateReminderCommitment({ format: 'charitology-participation-reminder-commitment', version: 1,
    method: REMINDER_METHOD, orgId: org, moduleId: p.module_id, targetId: p.target_id, participationId: p.id,
    bookingRecordId: p.booking_record_id, intakeId: p.intake_id, contactId: p.contact_id,
    confirmedAtExact, frozenSourceRevision: p.frozen.sourceRevision, frozenSha256: hash(p.frozen),
    frozenTermsSha256: p.frozen.termsHash, range: { startAt: range.startAt, endAt: range.endAt, timeZone: range.timeZone } });
}
export async function ownReminderEnableBinding(c, { org, context }) {
  const { p, intake, actor } = context;
  need(p.state === 'confirmed' && !p.recovered && !['legacy', 'recovered'].includes(p.source), 'confirmation', 409);
  const ownBinding = await readOwnParticipationEmailBinding(c, { org, participation: p, intake, actor });
  const recipient = await resolveDeliveryRecipient(c, { org, participation: p });
  need(ownBinding && recipient && deliveryConsentValid(p.delivery_consent) &&
    ownBinding.userId === recipient.userId && ownBinding.linkId === recipient.linkId &&
    ownBinding.linkRevision === recipient.linkRevision && ownBinding.email === recipient.email, 'general_consent', 409);
  const target = rows(await c.query(REMINDER_CONTEXT_SQL.target, [org, p.target_id]), 1)[0]?.target;
  need(target?.mode === 'managed' && !target.recovery_block, 'target', 409);
  const source = rows(await c.query(REMINDER_CONTEXT_SQL.records, [org, [p.target_id]]), 1)[0]?.record;
  need(source && !source.deleted_at && source.module_id === p.module_id && currentParticipationDeliveryApproval(projectedRecord(source)), 'approval', 409);
  return { recipient, commitment: currentReminderCommitment(org, p, context.confirmedAtExact) };
}
export async function reminderOwnSummary(c, { org, context }) {
  const preference = context.preference; let canEnable = false, commitmentSha256 = null, unavailableReason = 'current_binding_required';
  try {
    const binding = await ownReminderEnableBinding(c, { org, context }); commitmentSha256 = reminderCommitmentSha256(binding.commitment);
    const matching = reminderChoiceMatchesBinding({ preference: preference ?? null, recipient: binding.recipient, commitmentSha256 });
    const room = context.p.revision <= REMINDER_MAX_REVISION - 2 && (preference?.revision ?? 0) <= REMINDER_MAX_REVISION - 2;
    canEnable = room && !matching;
    unavailableReason = matching ? null : room ? null : 'revision_exhausted';
  } catch (error) {
    if (!['HttpError', 'ParticipationReminderError', 'ParticipationIntervalError'].includes(error?.constructor?.name) && !['ParticipationReminderError', 'ParticipationIntervalError'].includes(error?.name)) throw error;
  }
  return own({ version: REMINDER_METHOD, enabled: preference?.enabled === true, revision: preference?.revision ?? 0,
    atExact: preference?.atExact ?? null, currentCommitmentSha256: commitmentSha256, canEnable,
    canDisable: preference?.enabled === true, unavailableReason }, 4096);
}
export async function reminderAdminPreflight(c, { org, session }) {
  const member = await currentGroupMember(c, id(org), session, { moduleId: 'events', readOnly: true }); requireAdmin(member); return member;
}
function readable(record, member) {
  requirePermission(record.moduleId, member, 'read');
  need(!getModule(record.moduleId).scopeRules.approvedSnapshotsOnly.includes(member.role) && inScope(record, member), 'unavailable', 404);
}
async function readReminderTypedContext(c, { org, session, moduleId, targetId, participationIds, write = false,
  eligible = true, eligibleParticipationId = null, deferTransportGate = false, settings }, member) {
  id(org); id(targetId); need(['events', 'volunteers'].includes(moduleId));
  need(Array.isArray(participationIds) && participationIds.length >= 1 && participationIds.length <= 20 && new Set(participationIds).size === participationIds.length);
  participationIds.forEach(id); await c.query("SET LOCAL TIME ZONE 'UTC'");
  const selected = rows(await c.query(REMINDER_CONTEXT_SQL.people + (write ? ' FOR UPDATE OF p' : ''), [org, [...participationIds].sort()]), 20);
  need(selected.length === participationIds.length, 'unavailable', 404);
  const targetRows = rows(await c.query(REMINDER_CONTEXT_SQL.target + (write ? ' FOR SHARE OF t' : ''), [org, targetId]), 1);
  need(targetRows.length === 1, 'unavailable', 404); const target = targetRows[0].target;
  const sourceRows = rows(await c.query(REMINDER_CONTEXT_SQL.records, [org, [targetId]]), 1);
  need(sourceRows.length === 1, 'unavailable', 404); const source = projectedRecord(sourceRows[0].record);
  need(source.moduleId === moduleId && !sourceRows[0].record.deleted_at, 'unavailable', 404);
  const references = [[source.data.programId, 'programs'], ...(moduleId === 'volunteers' ? [[source.data.safeguardingId, 'safeguarding']] : [])].filter(([id]) => id != null);
  const recordIds = [...new Set([targetId, ...references.map(([id]) => id), ...selected.flatMap(({ participation: p }) => [p.booking_record_id, p.contact_id])])].sort();
  recordIds.forEach(id);
  const records = rows(await c.query(REMINDER_CONTEXT_SQL.records + (write ? ' FOR SHARE OF r' : ''), [org, recordIds]), 43);
  need(records.length === recordIds.length, 'unavailable', 404);
  const byId = new Map(records.map(row => [row.record.id, projectedRecord(row.record)]));
  for (const row of records) { need(!row.record.deleted_at, 'unavailable', 404); stamp(row.created_exact); readable(byId.get(row.record.id), member); }
  for (const [reference, type] of references) need(byId.get(reference)?.moduleId === type, 'relationship', 409);
  const intakeIds = [...new Set(selected.map(({ participation: p }) => p.intake_id))].sort(); intakeIds.forEach(id);
  const intakes = rows(await c.query(REMINDER_CONTEXT_SQL.intakes + (write ? ' FOR SHARE OF i' : ''), [org, intakeIds]), 20);
  need(intakes.length === intakeIds.length, 'unavailable', 404); const intakeMap = new Map(intakes.map(row => [row.intake.id, row]));
  const policy = await readParticipationDeliveryPolicy(c, org), items = [], identities = [
    ['target', targetId, stamp(targetRows[0].created_exact)],
    ...records.map(row => [row.record.module_id, row.record.id, stamp(row.created_exact)]),
    ...intakes.map(row => ['intake', row.intake.id, stamp(row.created_exact)]),
  ];
  for (const row of selected) {
    const p = row.participation; need(p.org_id === org && p.target_id === targetId && p.module_id === moduleId, 'relationship', 409);
    const booking = byId.get(p.booking_record_id), contact = byId.get(p.contact_id);
    need(booking?.moduleId === moduleId && booking.data.kind === (moduleId === 'events' ? 'registration' : 'assignment') &&
      booking.data[moduleId === 'events' ? 'eventId' : 'shiftId'] === targetId && booking.data.contactId === p.contact_id && contact?.moduleId === 'contacts', 'relationship', 409);
    identities.push(['participation', p.id, stamp(row.created_exact), p.intake_id, p.booking_record_id, p.contact_id]);
    if (!eligible || (eligibleParticipationId !== null && p.id !== eligibleParticipationId)) continue;
    need(p.state === 'confirmed' && !p.recovered && !['legacy', 'recovered'].includes(p.source) &&
      target.mode === 'managed' && !target.recovery_block && currentParticipationDeliveryApproval(source) &&
      currentParticipationDeliveryApproval(booking) && booking.status === 'approved', 'confirmation', 409);
    const intake = intakeMap.get(p.intake_id).intake;
    need(!intake.erased_at && deliveryConsentValid(p.delivery_consent), 'general_consent', 409);
    const commitment = currentReminderCommitment(org, p, row.confirmed_exact);
    need(commitment.frozenSourceRevision === source.revision && commitment.frozenTermsSha256 === hash(participationTerms(source)), 'terms', 409);
    const preference = validateReminderPreference(p.reminder_consent ?? null), commitmentSha256 = reminderCommitmentSha256(commitment);
    const recipient = await resolveDeliveryRecipient(c, { org, participation: p });
    need(preference?.enabled === true && recipient && preference.userId === recipient.userId && preference.linkId === recipient.linkId &&
      preference.linkRevision === recipient.linkRevision && preference.recipientSha256 === hash(recipient.email) &&
      preference.commitmentSha256 === commitmentSha256, 'choice', 409);
    need(policy.enabled === true, 'policy_disabled', 409);
    if (!deferTransportGate) need(!participationDeliveryGate(settings, recipient.email), 'delivery_unavailable', 409);
    items.push({ participationId: p.id, participationRevision: p.revision, intakeRevision: intake.revision,
      participationSha256: await readParticipationGroupRowPin(c, { orgId: org, table: 'os_participations', id: p.id }),
      intakeSha256: await readParticipationGroupRowPin(c, { orgId: org, table: 'os_intake', id: p.intake_id }),
      deliveryConsentSha256: hash(p.delivery_consent), reminderConsentSha256: hash(preference),
      recipientBindingSha256: hash({ userId: recipient.userId, emailSha256: hash(recipient.email) }),
      linkBindingSha256: hash({ linkId: recipient.linkId, linkRevision: recipient.linkRevision }), commitment, commitmentSha256,
      recipient, preference });
  }
  const epoch = await groupRestoreEpoch(c, org, recordIds);
  const authority = session ? { actorSha256: reminderActorSha256(member.userId), sessionSha256: groupSessionHash(session),
    membershipSha256: member.membershipSha256, memberCreatedAtExact: member.createdAtExact, restoreEpochSha256: epoch } : null;
  identities.sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);
  const access = own({ moduleId, targetId, incarnationSha256: hash({ method: REMINDER_METHOD, kind: 'typed-incarnations', identities }) });
  if (!eligible) return { member, authority, access, restoreEpochSha256: epoch };
  const portal = new URL('/participant', settings.origin).href, template = renderParticipationReminderTemplate(portal);
  return { member, authority, access, restoreEpochSha256: epoch, target: { moduleId, targetId, targetRevision: target.revision, sourceRevision: source.revision,
    sourceSha256: await readParticipationGroupRowPin(c, { orgId: org, table: 'os_records', id: targetId }) },
    policy: { epoch: policy.epoch, revision: policy.revision, enabled: policy.enabled === true }, template, items, selected };
}

export async function readReminderAdminContext(c, args) {
  const member = await currentGroupMember(c, id(args.org), args.session, { moduleId: args.moduleId, readOnly: !args.write });
  requireAdmin(member);
  // Public/staff inputs cannot forward the private worker-only transport mode.
  return readReminderTypedContext(c, { org: args.org, session: args.session, moduleId: args.moduleId,
    targetId: args.targetId, participationIds: args.participationIds, write: args.write === true,
    eligible: args.eligible !== false, settings: args.settings }, member);
}
/** Actual current membership, never an invented or still-live browser session.
 * Worker owns org/outbox locks, dispatch SQL clock and first-attempt guard. */
export async function readReminderWorkerContext(c, { org, outboxId, settings }) {
  id(org); id(outboxId);
  const schedule = await readReminderScheduleForOutbox(c, { org, outboxId });
  need(schedule, 'schedule_authority', 409);
  const receipt = schedule.payload.receipt, access = schedule.payload.access;
  const found = rows(await c.query(`SELECT m.user_id,m.role,m.program_ids,m.revision,${SQL6('m.created_at')} AS created_exact FROM os_members m JOIN "user" u ON u.id=m.user_id WHERE m.org_id=$1 AND m.user_id=$2 FOR SHARE OF m,u`, [org, receipt.actorId]), 1);
  need(found.length === 1, 'schedule_authority', 409); const raw = found[0];
  need(raw.user_id === receipt.actorId && ROLES.includes(raw.role) && Number.isSafeInteger(raw.revision) && raw.revision >= 1 &&
    raw.revision <= 2147483647 && Array.isArray(raw.program_ids) && raw.program_ids.length <= 100, 'schedule_authority', 409);
  raw.program_ids.forEach(id); stamp(raw.created_exact);
  need(raw.created_exact === receipt.authority.memberCreatedAtExact && reminderActorSha256(raw.user_id) === receipt.authority.actorSha256, 'schedule_authority', 409);
  const member = { userId: raw.user_id, role: raw.role, programIds: raw.program_ids, revision: raw.revision, createdAtExact: raw.created_exact };
  member.membershipSha256 = groupHash('membership', { ...member, programIds: [...raw.program_ids].sort() });
  requireAdmin(member); requirePermission(access.moduleId, member, 'read'); requirePermission(access.moduleId, member, 'write');
  const scheduled = receipt.result.scheduled.find(item => item.outboxId === outboxId);
  const context = await readReminderTypedContext(c, { org, settings, ...access, session: null,
    participationIds: receipt.result.scheduled.map(item => item.participationId), write: true,
    eligibleParticipationId: scheduled.participationId, deferTransportGate: true }, member);
  need(hash(context.access) === hash(access) && context.restoreEpochSha256 === receipt.authority.restoreEpochSha256, 'schedule_authority', 409);
  const item = context.items.find(item => item.participationId === scheduled.participationId);
  need(item && item.commitmentSha256 === scheduled.commitmentSha256, 'schedule_authority', 409);
  return { ...context, schedule, scheduled, item };
}
