/** Closed own-choice/SQL-boundary values. No returned value grants authority. */
import { isProxy } from 'node:util/types';
import { hash, fail } from './security.mjs';
import { ownGroupValue, validateGroupExactStamp } from './participation-group-model.mjs';
import { REMINDER_METHOD, validateReminderPreference } from './participation-reminder-model.mjs';

export const REMINDER_MAX_REVISION = 2147483647;
export const REMINDER_CHOICE_FORMAT = 'charitology-participation-reminder-choice';
export const reminderNeed = (value, code = 'fields', status = 422) => {
  if (!value) fail(status, 'participation_reminder_' + code, 'Review this reminder choice or reconcile its retained result.');
};
export function reminderOwn(input, bytes = 65536) {
  try { return ownGroupValue(input, bytes); }
  catch { reminderNeed(false, 'owned'); }
}
export function reminderExact(value, keys) {
  reminderNeed(value && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
  return value;
}
export function reminderId(value) { reminderNeed(typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value)); return value; }
export function reminderSha(value) { reminderNeed(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)); return value; }
export function reminderRevision(value, zero = false) {
  reminderNeed(Number.isSafeInteger(value) && value >= (zero ? 0 : 1) && value <= REMINDER_MAX_REVISION); return value;
}
export function reminderStamp(value) {
  try { return validateGroupExactStamp(value); }
  catch { reminderNeed(false, 'time'); }
}
export function reminderProperty(value, key, plain = true) {
  reminderNeed(value && typeof value === 'object' && !isProxy(value) &&
    (!plain || Object.getPrototypeOf(value) === Object.prototype));
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  reminderNeed(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'));
  return descriptor.value;
}
export function reminderRows(result, max = 1) {
  const list = reminderProperty(result, 'rows', false), count = reminderProperty(result, 'rowCount', false);
  reminderNeed(Array.isArray(list) && !isProxy(list) && Object.getPrototypeOf(list) === Array.prototype, 'sql', 500);
  const descriptor = Object.getOwnPropertyDescriptor(list, 'length'), length = descriptor?.value;
  reminderNeed(Number.isSafeInteger(length) && length >= 0 && length <= max && count === length, 'sql', 500);
  const expected = new Set(Array.from({ length }, (_, i) => String(i)));
  const keys = Reflect.ownKeys(list);
  reminderNeed(keys.length === length + 1 && keys.every(key => key === 'length' || expected.has(key)), 'sql', 500);
  const values = [];
  for (let i = 0; i < length; i++) values.push(reminderOwn(reminderProperty(list, String(i), false), 131072));
  return Object.freeze(values);
}
export function reminderSame(a, b) { return hash(a) === hash(b); }
export function reminderSessionSelectors(session) {
  return { sessionId: reminderId(reminderProperty(reminderProperty(session, 'session'), 'id')),
    actorId: reminderId(reminderProperty(reminderProperty(session, 'user'), 'id')) };
}
export function validateReminderChoiceRequest(input) {
  const value = reminderOwn(input, 16384);
  reminderNeed(typeof value?.enabled === 'boolean');
  reminderExact(value, ['version', 'revision', 'intakeRevision', 'reminderRevision', 'enabled',
    'consentVersion', 'commandKey', ...(value.enabled ? ['commitmentSha256'] : [])]);
  reminderNeed(value.version === 1 && value.consentVersion === REMINDER_METHOD);
  reminderRevision(value.revision); reminderRevision(value.intakeRevision); reminderRevision(value.reminderRevision, true);
  reminderNeed(typeof value.commandKey === 'string' && /^[A-Za-z0-9_-]{16,100}$/.test(value.commandKey));
  if (value.enabled) reminderSha(value.commitmentSha256);
  return value;
}
export function reminderChoicePins(input) {
  const value = reminderOwn(input, 16384); reminderExact(value, ['org', 'actorId', 'intakeId', 'participationId', 'request']);
  for (const key of ['org', 'actorId', 'intakeId', 'participationId']) reminderId(value[key]);
  const request = validateReminderChoiceRequest(value.request), context = {
    org: value.org, actorId: value.actorId, intakeId: value.intakeId, participationId: value.participationId,
  };
  return Object.freeze({ commandSha256: hash({ method: REMINDER_METHOD, kind: 'choice-key', ...context, commandKey: request.commandKey }),
    requestSha256: hash({ method: REMINDER_METHOD, kind: 'choice-request', ...context, request }) });
}
export function reminderChoiceRevisions(participationRevision, preferenceRevision, enabled, alreadyEnabled) {
  reminderRevision(participationRevision); reminderRevision(preferenceRevision, true);
  reminderNeed(typeof enabled === 'boolean' && typeof alreadyEnabled === 'boolean');
  if (enabled) reminderNeed(participationRevision <= REMINDER_MAX_REVISION - 2 &&
    preferenceRevision <= REMINDER_MAX_REVISION - 2, 'revision_exhausted', 409);
  else reminderNeed(alreadyEnabled, 'already_off', 409);
  return Object.freeze({ participation: Math.min(REMINDER_MAX_REVISION, participationRevision + 1),
    preference: Math.min(REMINDER_MAX_REVISION, preferenceRevision + 1) });
}
export function validateReminderChoiceReceipt(input) {
  const value = reminderOwn(input, 16384);
  reminderExact(value, ['format', 'version', 'method', 'action', 'actorSha256', 'sessionSha256', 'linkSha256',
    'commandSha256', 'requestSha256', 'acceptedAtExact', 'result']);
  reminderNeed(value.format === REMINDER_CHOICE_FORMAT && value.version === 1 && value.method === REMINDER_METHOD && value.action === 'choice');
  for (const key of ['actorSha256', 'sessionSha256', 'linkSha256', 'commandSha256', 'requestSha256']) reminderSha(value[key]);
  reminderStamp(value.acceptedAtExact);
  const result = value.result;
  reminderExact(result, ['participationId', 'revision', 'intakeRevision', 'reminder', 'auditRetained']);
  reminderId(result.participationId); reminderRevision(result.revision); reminderRevision(result.intakeRevision);
  reminderNeed(typeof result.auditRetained === 'boolean');
  reminderExact(result.reminder, ['version', 'enabled', 'revision', 'atExact']);
  reminderNeed(result.reminder.version === REMINDER_METHOD && typeof result.reminder.enabled === 'boolean' &&
    result.reminder.atExact === value.acceptedAtExact);
  reminderRevision(result.reminder.revision); reminderStamp(result.reminder.atExact);
  return value;
}

/** Current binding comparison only; callers still prove actual own authority. */
export function reminderChoiceMatchesBinding(input) {
  const value = reminderOwn(input, 8192); reminderExact(value, ['preference', 'recipient', 'commitmentSha256']);
  const preference = validateReminderPreference(value.preference), recipient = value.recipient;
  reminderExact(recipient, ['email', 'userId', 'linkId', 'linkRevision']); reminderId(recipient.userId); reminderRevision(recipient.linkRevision);
  reminderNeed(typeof recipient.email === 'string' && recipient.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email));
  reminderNeed(typeof recipient.linkId === 'string' && /^[a-f0-9]{32}$/.test(recipient.linkId)); reminderSha(value.commitmentSha256);
  return preference?.enabled === true && preference.userId === recipient.userId && preference.linkId === recipient.linkId &&
    preference.linkRevision === recipient.linkRevision && preference.recipientSha256 === hash(recipient.email) && preference.commitmentSha256 === value.commitmentSha256;
}
