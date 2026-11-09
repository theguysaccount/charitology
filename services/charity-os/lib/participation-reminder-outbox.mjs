/** Same exact complete row builder for prospective SQL casts and real INSERTs.
 * Identity arguments supplied for capacity probes never become stored authority. */
import { hash } from './security.mjs';
import { validateReminderPreviewPacket, validateReminderPreference, makeReminderIntentMarker,
  makeReminderReceipt, REMINDER_METHOD } from './participation-reminder-model.mjs';
import { PARTICIPATION_REMINDER_VARIANT } from './participation-reminder-template.mjs';
import { reminderOwn as own, reminderExact as exact, reminderId as id, reminderRevision as revision,
  reminderStamp as stamp, reminderNeed as need } from './participation-reminder-choice.mjs';

export const REMINDER_OUTBOX_COLUMNS = Object.freeze(('org_id id participation_id event_revision purpose channel state payload created_at ' +
  'participation_revision intent_kind consent_revision consent_copy user_id link_id link_revision recipient_hash policy_epoch ' +
  'template_version relay_key payload_hash first_attempt_at attempts lease_owner lease_until next_at last_checked_at safe_code ' +
  'provider_event_at budget_bytes recovered_state').split(' '));
export function reminderOutboxParameters(row) {
  exact(row, REMINDER_OUTBOX_COLUMNS);
  return REMINDER_OUTBOX_COLUMNS.map(key => key === 'payload' ? JSON.stringify(row[key]) : row[key]);
}
export function buildReminderOutboxPlan(input) {
  const value = own(input, 131072); exact(value, ['packet', 'request', 'atExact', 'bindings', 'identities']);
  const packet = validateReminderPreviewPacket(value.packet); stamp(value.atExact);
  need(Array.isArray(value.bindings) && Array.isArray(value.identities) && value.bindings.length === packet.items.length && value.identities.length === packet.items.length);
  const rows = [], scheduled = [], used = new Set(), relayKeys = new Set();
  for (let n = 0; n < packet.items.length; n++) {
    const item = packet.items[n], binding = value.bindings[n], identity = value.identities[n];
    exact(binding, ['participationId', 'recipient', 'preference']); exact(identity, ['participationId', 'outboxId', 'relayKey', 'eventRevision']);
    need(binding.participationId === item.participationId && identity.participationId === item.participationId);
    need(typeof identity.outboxId === 'string' && /^[a-f0-9]{32}$/.test(identity.outboxId) && !used.has(identity.outboxId)); used.add(identity.outboxId);
    need(typeof identity.relayKey === 'string' && /^participation-reminder-[a-f0-9]{32}$/.test(identity.relayKey) && !relayKeys.has(identity.relayKey)); relayKeys.add(identity.relayKey); revision(identity.eventRevision);
    const recipient = binding.recipient, preference = validateReminderPreference(binding.preference);
    exact(recipient, ['email', 'userId', 'linkId', 'linkRevision']); id(recipient.userId); revision(recipient.linkRevision);
    need(typeof recipient.email === 'string' && recipient.email.length <= 254 && recipient.email === recipient.email.trim().toLowerCase() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email));
    need(typeof recipient.linkId === 'string' && /^[a-f0-9]{32}$/.test(recipient.linkId));
    need(preference?.enabled === true && preference.userId === recipient.userId && preference.linkId === recipient.linkId &&
      preference.linkRevision === recipient.linkRevision && preference.recipientSha256 === hash(recipient.email) && preference.commitmentSha256 === item.commitmentSha256);
    const marker = makeReminderIntentMarker({ commitment: item.commitment, sourceSha256: packet.target.sourceSha256, templateSha256: packet.templateSha256 });
    const payload = own({ state: 'confirmed', participationId: item.participationId, revision: identity.eventRevision, reminder: marker }, 2048);
    const message = { purpose: 'participation', to: recipient.email, url: packet.template.url, variant: PARTICIPATION_REMINDER_VARIANT };
    rows.push({ org_id: packet.orgId, id: identity.outboxId, participation_id: item.participationId, event_revision: identity.eventRevision,
      purpose: 'participation', channel: 'email', state: 'pending', payload, created_at: value.atExact,
      participation_revision: item.participationRevision, intent_kind: 'reminder', consent_revision: preference.revision,
      consent_copy: REMINDER_METHOD, user_id: recipient.userId, link_id: recipient.linkId, link_revision: recipient.linkRevision,
      recipient_hash: hash(recipient.email), policy_epoch: packet.policy.epoch, template_version: packet.template.templateVersion,
      relay_key: identity.relayKey, payload_hash: hash(message), first_attempt_at: null, attempts: 0, lease_owner: null,
      lease_until: null, next_at: item.dueAtExact, last_checked_at: null, safe_code: null, provider_event_at: null,
      budget_bytes: 8192, recovered_state: null });
    scheduled.push({ participationId: item.participationId, outboxId: identity.outboxId,
      commitmentSha256: item.commitmentSha256, dueAtExact: item.dueAtExact });
  }
  const receipt = makeReminderReceipt({ packet, request: value.request, acceptedAtExact: value.atExact, scheduled });
  return own({ rows, receipt }, 65536);
}
