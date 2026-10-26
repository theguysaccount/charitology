import { createHmac } from 'node:crypto';
import { authorized, boundedBody, hashToken, InputError, normalizeEmail } from './security.mjs';
import { escapeHtml } from './content.mjs';

export function validateOsMail(input, settings) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('Use a JSON message object.');
  if (Object.keys(input).some(key => !['purpose','to','url','organizationName','title','message'].includes(key))) throw new InputError('Unknown transactional message field.');
  const purpose = input.purpose;
  if (!['login','invitation','reminder'].includes(purpose)) throw new InputError('Choose a supported transactional purpose.');
  const to = normalizeEmail(input.to);
  if (!to) throw new InputError('Use one valid recipient address.');
  const string = (key, maximum, required = false, multiline = false) => {
    const value = input[key];
    if (value === undefined && !required) return '';
    if (typeof value !== 'string' || value.length > maximum || (required && !value.trim()) || (!multiline && /[\r\n]/.test(value)) || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) throw new InputError(`Invalid ${key}.`);
    return value.trim();
  };
  const rawUrl = string('url', 2000, true);
  let url;
  try { url = new URL(rawUrl); } catch { throw new InputError('Invalid OS link.'); }
  const correctPath = purpose === 'login' ? url.pathname === '/auth/confirm' : purpose === 'invitation' ? url.pathname === '/invite' : (url.pathname === '/app' || url.pathname.startsWith('/app/'));
  if (url.origin !== settings.osOrigin || url.username || url.password || url.hash || !correctPath) throw new InputError('The link must use the configured OS origin and purpose path.');
  const organizationName = string('organizationName', 180);
  const title = string('title', 180);
  const message = string('message', 1000, false, true);
  return { purpose, to, url: url.toString(), organizationName, title, message };
}

export function renderOsMail(input) {
  const organization = input.organizationName || 'your organization';
  const subject = input.purpose === 'login' ? 'Sign in to Charity OS' : input.purpose === 'invitation' ? 'Your Charity OS invitation' : (input.title || 'Charity OS reminder');
  const introduction = input.purpose === 'login'
    ? 'A sign-in link was requested for this address. Open the link to continue. If you did not request it, ignore this message.'
    : input.purpose === 'invitation'
      ? `You were invited to join ${organization} in Charity OS. Review the invitation before accepting. If it was unexpected, you may ignore it.`
      : (input.message || `There is an action to review for ${organization} in Charity OS.`);
  const action = input.purpose === 'login' ? 'Review sign-in' : input.purpose === 'invitation' ? 'Review invitation' : 'Open Charity OS';
  return {
    to: input.to, subject,
    html: `<h1>${escapeHtml(subject)}</h1><p>${escapeHtml(introduction).replaceAll('\n', '<br>')}</p><p><a href="${escapeHtml(input.url)}">${escapeHtml(action)}</a></p><p>This is an operational Charity OS message. It does not subscribe you to The Charitology Letter.</p><p>Charitology · 938 Peacock Station Rd, McLean, VA 22102</p>`,
    text: `${subject}\n\n${introduction}\n\n${action}: ${input.url}\n\nThis operational message does not subscribe you to The Charitology Letter.\nCharitology · 938 Peacock Station Rd, McLean, VA 22102`,
  };
}

export function osMailRateKeys(recipientHash, now = Date.now()) {
  return [
    { key: `os-mail:global:day:${Math.floor(now / 86400000)}`, limit: 200 },
    { key: `os-mail:recipient:${recipientHash}:hour:${Math.floor(now / 3600000)}`, limit: 10 },
  ];
}

/** Server-only purpose relay. No contact, subscriber, Topic, Segment or campaign operation occurs here. */
export async function handleOsMail(request, { db, mail, settings, logger = () => {} }) {
  const result = (status, body) => ({ status, body });
  if (!authorized(request, settings.osMailSecret || '')) return result(401, { ok: false, message: 'Authentication required.' });
  if (request.headers.has('origin')) return result(403, { ok: false, message: 'This endpoint is for server requests.' });
  const key = request.headers.get('idempotency-key') || '';
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(key)) throw new InputError('A bounded Idempotency-Key is required.');
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new InputError('Use a JSON request.', 415);
  let input;
  try { input = JSON.parse(await boundedBody(request, 16384)); } catch (error) { if (error instanceof InputError) throw error; throw new InputError('The message could not be read.'); }
  const payload = validateOsMail(input, settings);
  const hmac = value => createHmac('sha256', settings.osMailSecret).update(value).digest('hex');
  const keyHash = hashToken(`charitology-os-mail:${key}`);
  const payloadHash = hmac(JSON.stringify(payload));
  const recipientHash = hmac(payload.to);
  let reservation;
  try { reservation = await db.reserveOsMail({ keyHash, payloadHash, purpose: payload.purpose, recipientHash, rateKeys: osMailRateKeys(recipientHash) }); }
  catch { logger(); return result(503, { ok: false, message: 'Transactional delivery is temporarily unavailable.' }); }
  if (!reservation.reserved) {
    if (reservation.state === 'accepted') return result(200, { ok: true, accepted: true, duplicate: true });
    if (reservation.state === 'limited') return result(429, { ok: false, message: 'Transactional request limit reached.' });
    if (reservation.state === 'failed') return result(503, { ok: false, message: 'The previous attempt failed. Request a fresh action rather than resending this key.' });
    return result(409, { ok: false, message: reservation.state === 'conflict' ? 'This idempotency key belongs to another payload.' : 'The prior attempt is in progress or unresolved; no automatic resend occurred.' });
  }
  let attempted = false;
  try {
    await mail.ready({ system: true });
    attempted = true;
    const sent = await mail.sendOsMail(renderOsMail(payload), `os-${keyHash}`);
    if (typeof sent?.id !== 'string' || sent.id.length > 100 || !/^[A-Za-z0-9_-]+$/.test(sent.id)) throw new Error('Provider acceptance could not be confirmed');
    await db.finishOsMail(keyHash, payloadHash, 'accepted', sent.id);
    return result(202, { ok: true, accepted: true, duplicate: false });
  } catch (error) {
    const state = attempted && error?.ambiguous !== false ? 'unknown' : 'failed';
    await db.finishOsMail(keyHash, payloadHash, state).catch(() => {});
    logger();
    return result(503, { ok: false, message: 'Transactional delivery could not be confirmed. No automatic resend will occur.' });
  }
}
