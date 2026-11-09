/** Explicitly unmounted until worker/relay/native/measured capacity compose. */
import { json, fail, checkCsrf, hash } from './security.mjs';
import { readBackupBody } from './backup-json.mjs';
import { reminderNeed as need, reminderSessionSelectors as selectors } from './participation-reminder-choice.mjs';
import { ownReminderPreflight, reminderAdminPreflight } from './participation-reminder-context.mjs';
import { getOwnReminder, acceptedOwnReminderChoice, changeOwnReminderChoice,
  previewParticipationReminder, acceptedParticipationReminder, scheduleParticipationReminder } from './participation-reminder-commands.mjs';

export const PARTICIPATION_REMINDERS_ENABLED = false;
const STAFF = /^\/api\/orgs\/([A-Za-z0-9_-]{1,100})\/participation-reminders\/(preview|schedule)$/;
const OWN = /^\/api\/participant\/orgs\/([A-Za-z0-9_-]{1,100})\/requests\/([A-Za-z0-9_-]{1,100})\/participations\/([A-Za-z0-9_-]{1,100})\/(reminder|reminder-preference)$/;
export function isParticipationReminderPath(path) {
  return /^\/api\/orgs\/[^/]*\/participation-reminders(?:\/|$)/.test(path) ||
    /^\/api\/participant\/orgs\/[^/]*\/requests\/[^/]*\/participations\/[^/]*\/(?:reminder|reminder-preference)(?:\/|$)/.test(path);
}
const okay = value => json(value, 200, { 'referrer-policy': 'no-referrer' });
async function body(request) {
  need(/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || ''), 'content_type', 415);
  return readBackupBody(request, 16384);
}
function translate(error) {
  if (error?.name === 'ParticipationReminderError') fail(error.status || 422, error.code, error.message);
  throw error;
}
/** Handler alone controls mounting. These exported implementations let strict
 * isolated tests exercise the protocol without changing that production gate. */
export async function ownParticipationReminderRoutes({ request, url = new URL(request.url), db, settings, session }) {
  const matched = OWN.exec(url.pathname);
  if (!matched) return null;
  try {
    need(!url.search, 'query');
    const [, org, intakeId, participationId, operation] = matched;
    need(request.method === (operation === 'reminder' ? 'GET' : 'POST'), 'method', 405);
    const actorId = selectors(session).actorId;
    await db.tx(actorId, null, c => ownReminderPreflight(c, { org, session, intakeId }), { readOnly: true });
    await db.limit('participant-' + (request.method === 'GET' ? 'read:' : 'write:') + hash(actorId), request.method === 'GET' ? 120 : 60, 3600);
    const args = { org, session, intakeId, participationId, settings };
    if (request.method === 'GET') {
      need(request.body === null && !request.headers.has('transfer-encoding') &&
        (!request.headers.has('content-length') || request.headers.get('content-length') === '0'), 'body');
      return okay(await db.tx(actorId, org, c => getOwnReminder(c, args), { lock: true, readOnly: true }));
    }
    checkCsrf(request, session, settings);
    args.input = await body(request);
    const read = () => db.tx(actorId, org, c => acceptedOwnReminderChoice(c, args), { lock: true, readOnly: true });
    const retained = await read(); if (retained) return okay(retained);
    try { return okay(await db.tx(actorId, org, c => changeOwnReminderChoice(c, args), { lock: true })); }
    catch (error) {
      // Only the same original body is checked after an uncertain settlement.
      // There is no automatic second mutation or newly generated command key.
      try { const saved = await read(); if (saved) return okay(saved); } catch {}
      throw error;
    }
  } catch (error) { translate(error); }
}
export async function participationReminderRoutes({ request, url = new URL(request.url), db, settings, session }) {
  const matched = STAFF.exec(url.pathname);
  if (!matched) return null;
  try {
    need(!url.search, 'query'); need(request.method === 'POST', 'method', 405);
    const [, org, operation] = matched, actorId = selectors(session).actorId;
    await db.tx(actorId, org, c => reminderAdminPreflight(c, { org, session }), { readOnly: true });
    checkCsrf(request, session, settings);
    await db.limit('participation-reminder-write:' + hash(actorId), 60, 3600);
    const input = await body(request), args = { org, session, settings, input };
    if (operation === 'preview') {
      await db.limit('participation-reminder-preview:' + hash(actorId), 6, 900);
      return okay(await db.tx(actorId, org, c => previewParticipationReminder(c, args), { lock: true }));
    }
    const read = () => db.tx(actorId, org, c => acceptedParticipationReminder(c, args), { lock: true, readOnly: true });
    const retained = await read(); if (retained) return okay(retained);
    try { return okay(await db.tx(actorId, org, c => scheduleParticipationReminder(c, args), { lock: true })); }
    catch (error) {
      try { const saved = await read(); if (saved) return okay(saved); } catch {}
      throw error;
    }
  } catch (error) { translate(error); }
}
