/** Exact six INSERT fields shared by actual commands and prospective capacity. */
import { reminderOwn as own, reminderExact as exact, reminderId as id,
  reminderNeed as need } from './participation-reminder-choice.mjs';
export function reminderChoiceAuditCandidates(input) {
  const value = own(input, 1024); exact(value, ['org', 'actorId', 'participationId', 'enabled']);
  id(value.org); id(value.actorId); id(value.participationId); need(typeof value.enabled === 'boolean');
  const ordinary = { org_id: value.org, actor_id: value.actorId,
    action: value.enabled ? 'participation.reminder.preference_enabled' : 'participation.reminder.preference_off',
    record_id: null, module_id: null, detail: { participationId: value.participationId, enabled: value.enabled } };
  // This is precisely database.audit's existing emergency replacement detail.
  // The actual call passes ordinary detail and lets audit select or omit it.
  return own(value.enabled ? [ordinary] : [ordinary, { ...ordinary,
    detail: { targetId: null, previousRole: null, role: null, quotaReserve: true } }], 4096);
}
export function reminderScheduleAuditCandidate(input) {
  const value = own(input, 4096); exact(value, ['org', 'actorId', 'previewId', 'participationIds']);
  id(value.org); id(value.actorId); id(value.previewId);
  need(Array.isArray(value.participationIds) && value.participationIds.length >= 1 && value.participationIds.length <= 20);
  const participationIds = value.participationIds;
  participationIds.forEach((value, n) => { id(value); need(n === 0 || participationIds[n - 1] < value); });
  return own({ org_id: value.org, actor_id: value.actorId, action: 'participation.reminder.scheduled',
    record_id: null, module_id: null, detail: { previewId: value.previewId,
      scheduledCount: value.participationIds.length, participationIds: value.participationIds } }, 8192);
}
