import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../lib/config.mjs';
import { createHandler } from '../lib/handler.mjs';
import { provider } from '../lib/provider.mjs';
import { renderOsMail, validateOsMail, osMailRateKeys } from '../lib/os-mail.mjs';
const settings = config({ OS_MAIL_RELAY_SECRET: 's'.repeat(40), OS_ORIGIN: 'https://os.charitology.org' });
const message = { purpose: 'login', to: 'person@example.invalid', url: 'https://os.charitology.org/auth/confirm?token=private-token' };
const request = (body = message, key = 'test-1', extra = {}) => new Request('https://mail.charitology.org/api/system/os-mail', { method: 'POST', headers: { authorization: `Bearer ${settings.osMailSecret}`, 'content-type': 'application/json', 'idempotency-key': key, ...extra }, body: JSON.stringify(body) });
function fixture() {
  const intents = new Map(), reservations = [], sends = [], finishes = [], readiness = [];
  const db = {
    reserveOsMail: async data => { reservations.push(data); const existing = intents.get(data.keyHash); if (existing) return { reserved: false, state: existing.payloadHash === data.payloadHash ? existing.state : 'conflict' }; intents.set(data.keyHash, { ...data, state: 'creating' }); return { reserved: true, state: 'creating' }; },
    finishOsMail: async (keyHash, payloadHash, state, id) => { finishes.push({ state, id }); const found = intents.get(keyHash); if (found.payloadHash === payloadHash && found.state === 'creating') found.state = state; },
  };
  const mail = { ready: async options => readiness.push(options), sendOsMail: async (payload, key) => { sends.push({ payload, key }); return { id: 'provider-id-001' }; } };
  const handler = createHandler({ db, mail, settings, logger: () => {} });
  return { db, mail, handler, intents, reservations, sends, finishes, readiness };
}
test('OS relay requires its independent bearer, server origin absence and bounded key before any side effect', async () => {
  const f = fixture();
  assert.equal((await f.handler(request(message, 'a', { authorization: 'Bearer wrong' }))).status, 401);
  assert.equal((await f.handler(request(message, 'a', { origin: settings.osOrigin }))).status, 403);
  assert.equal((await f.handler(request(message, 'a', { origin: 'null' }))).status, 403);
  assert.equal((await f.handler(request(message, 'bad key'))).status, 400);
  assert.equal((await f.handler(request(message, 'x'.repeat(129)))).status, 400);
  assert.equal(f.reservations.length, 0); assert.equal(f.sends.length, 0);
});
test('Purpose URLs reject foreign origins, credentials, wrong routes and fragments', () => {
  for (const url of ['https://os.charitology.org.evil.example/auth/confirm', 'https://evil.example/auth/confirm', 'http://os.charitology.org/auth/confirm', 'https://user:secret@os.charitology.org/auth/confirm', 'https://os.charitology.org/invite', 'https://os.charitology.org/auth/confirm#token']) assert.throws(() => validateOsMail({ ...message, url }, settings));
  assert.equal(validateOsMail({ ...message, purpose: 'invitation', url: settings.osOrigin + '/invite?token=invite-token' }, settings).purpose, 'invitation');
  assert.equal(validateOsMail({ ...message, purpose: 'reminder', url: settings.osOrigin + '/app' }, settings).purpose, 'reminder');
  assert.throws(() => validateOsMail({ ...message, purpose: 'newsletter' }, settings));
});
test('Relay JSON rejects extra fields, multiple recipients, header injection and oversized bodies', async () => {
  const f = fixture();
  for (const bad of [{ ...message, cc: 'other@example.invalid' }, { ...message, to: [message.to] }, { ...message, title: 'Injected\r\nHeader' }, { ...message, message: 'x'.repeat(1001) }]) assert.equal((await f.handler(request(bad))).status, 400);
  assert.equal((await f.handler(request({ ...message, message: 'x'.repeat(17000) }))).status, 413);
  assert.equal(f.reservations.length, 0);
});
test('OS origin config permits only strict production HTTPS origins and explicit local development', () => {
  assert.throws(() => config({ NODE_ENV: 'production', OS_ORIGIN: 'http://localhost:4444' }));
  for (const origin of ['https://user:secret@os.charitology.org', 'https://os.charitology.org/path', 'https://os.charitology.org?x=1', 'https://os.charitology.org/']) assert.throws(() => config({ OS_ORIGIN: origin }));
  assert.equal(config({ NODE_ENV: 'development', OS_ORIGIN: 'http://127.0.0.1:4444' }).osOrigin, 'http://127.0.0.1:4444');
});
test('Accepted transactional mail stores only hashes, uses one native key and changes no newsletter state', async () => {
  const f = fixture(); const response = await f.handler(request());
  assert.equal(response.status, 202); assert.equal((await response.json()).accepted, true);
  assert.deepEqual(f.readiness, [{ system: true }]);
  assert.equal(f.sends.length, 1); assert.match(f.sends[0].key, /^os-[a-f0-9]{64}$/);
  assert.deepEqual(f.finishes, [{ state: 'accepted', id: 'provider-id-001' }]);
  const stored = JSON.stringify(f.reservations);
  assert.doesNotMatch(stored, /person@example|private-token|auth\/confirm/);
  assert.ok(!response.headers.has('access-control-allow-origin'));
  assert.equal(response.headers.get('cache-control'), 'no-store, private');
});
test('Exact repeated intent returns accepted without sending; payload conflicts return409', async () => {
  const f = fixture();
  assert.equal((await f.handler(request())).status, 202);
  const duplicate = await f.handler(request()); assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).duplicate, true);
  assert.equal((await f.handler(request({ ...message, title: 'Different payload' }))).status, 409);
  assert.equal(f.sends.length, 1);
});
test('Concurrent same-key requests have one winner and no implicit resend', async () => {
  const f = fixture();
  const responses = await Promise.all(Array.from({ length: 10 }, () => f.handler(request())));
  assert.equal(responses.filter(x => x.status === 202).length, 1);
  assert.ok(responses.every(x => [200,202,409].includes(x.status)));
  assert.equal(f.sends.length, 1);
});
test('Ambiguous provider failures leave a durable stop; definitive failures do not claim acceptance', async () => {
  for (const ambiguous of [true, false]) {
    const f = fixture(); f.mail.sendOsMail = async () => { throw Object.assign(new Error('private details'), { ambiguous }); };
    assert.equal((await f.handler(request())).status, 503);
    assert.equal(f.finishes[0].state, ambiguous ? 'unknown' : 'failed');
    assert.equal((await f.handler(request())).status, ambiguous ? 409 : 503);
  }
});
test('Provider readiness failure is generic, persists failure and never sends', async () => {
  const f = fixture(); f.mail.ready = async () => { throw new Error('secret-token private@example.invalid'); };
  const response = await f.handler(request());
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /secret-token|private@example/);
  assert.equal(f.finishes[0].state, 'failed'); assert.equal(f.sends.length, 0);
});
test('Durable throttle prevents provider work and keeps OS scopes distinct from signup limits', async () => {
  const f = fixture(); f.db.reserveOsMail = async () => ({ reserved: false, state: 'limited' });
  assert.equal((await f.handler(request())).status, 429); assert.equal(f.readiness.length, 0); assert.equal(f.sends.length, 0);
  const keys = osMailRateKeys('a'.repeat(64), 0); assert.ok(keys.every(x => x.key.startsWith('os-mail:'))); assert.deepEqual(keys.map(x => x.limit), [200, 10]);
});
test('Transactional content escapes labels and reminder text; login/invite do not accept a marketing body', () => {
  const input = validateOsMail({ ...message, purpose: 'invitation', url: settings.osOrigin + '/invite?token=x&next=app', organizationName: '<img src=x onerror=alert(1)>', message: 'UNREQUESTED MARKETING' }, settings);
  const rendered = renderOsMail(input); assert.doesNotMatch(rendered.html, /<img|UNREQUESTED MARKETING/); assert.match(rendered.html, /&lt;img/); assert.match(rendered.html, /&amp;next/);
  const reminder = renderOsMail(validateOsMail({ ...message, purpose: 'reminder', url: settings.osOrigin + '/app', title: '<script>', message: '<b>Reminder</b>\nNext line' }, settings));
  assert.doesNotMatch(reminder.html, /<script>|<b>/); assert.match(reminder.text, /<b>Reminder/);
});
test('Native transport is one transactional recipient with no contact or subscription mutation', async () => {
  const calls = [];
  const mail = provider(settings, { credential: async () => 'private-token', fetcher: async (url, options) => { calls.push({ url, ...options }); return Response.json({ id: 'provider-id-001' }); } });
  await mail.sendOsMail(renderOsMail(validateOsMail(message, settings)), 'os-test-key');
  assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://api.resend.com/emails');
  const body = JSON.parse(calls[0].body); assert.deepEqual(body.to, [message.to]); assert.equal(body.from, 'Charitology <hello@charitology.org>'); assert.ok(body.text && body.html);
  assert.equal(calls[0].headers['Idempotency-Key'], 'os-test-key'); assert.equal(body.topic_id, undefined); assert.equal(body.unsubscribed, undefined);
});
