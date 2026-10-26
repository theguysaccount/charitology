import test from 'node:test';
import assert from 'node:assert/strict';
import { Webhook } from 'svix';
import { createHandler } from '../lib/handler.mjs';
import { config } from '../lib/config.mjs';
import { newToken } from '../lib/security.mjs';
const settings = config({ NEWSLETTER_SEND_ENABLED: 'true', NEWSLETTER_TEST_ONLY: 'false', NEWSLETTER_ADMIN_TOKEN: 'a'.repeat(40), NEWSLETTER_RATE_SECRET: 'r'.repeat(40) });
const request = (path, body, extra = {}) => new Request(`https://mail.charitology.org${path}`, { method: 'POST', body: new URLSearchParams(body), headers: { accept: 'application/json', ...extra } });
test('GET confirmation/unsubscribe are scanner-safe and do not touch DB/provider', async () => {
  const fail = () => { throw new Error('unexpected side effect'); };
  const handler = createHandler({ db: new Proxy({}, { get: () => fail }), mail: new Proxy({}, { get: () => fail }), settings });
  for (const path of ['/confirm', '/unsubscribe']) {
    const response = await handler(new Request(`https://mail.charitology.org${path}?token=${newToken()}`));
    assert.equal(response.status, 200); assert.match(await response.text(), /method="post"/);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  }
});
test('Signup requires explicit consent; honeypot and disallowed origins have no mail side effects', async () => {
  let sends = 0;
  const handler = createHandler({ db: {}, mail: { sendConfirmation: () => sends++ }, settings, logger: () => {} });
  assert.equal((await handler(request('/api/subscribe', { email: 'a@example.com' }))).status, 400);
  assert.equal((await handler(request('/api/subscribe', { email: 'a@example.com', consent: 'yes', website: 'bot' }))).status, 202);
  assert.equal((await handler(request('/api/subscribe', { email: 'a@example.com', consent: 'yes' }, { origin: 'https://evil.example' }))).status, 403);
  assert.equal(sends, 0);
});
test('Allowed form signup returns generic result even on provider rejection, and records failure', async () => {
  const updates = [];
  const db = { rate: async () => true, pending: async email => ({ email, generation: 'gen' }), mailResult: async (...args) => updates.push(args) };
  const mail = { ready: async () => {}, sendConfirmation: async () => { throw new Error('suppression'); } };
  const handler = createHandler({ db, mail, settings, logger: () => {} });
  const response = await handler(request('/api/subscribe', { email: 'a@example.com', consent: 'yes' }, { origin: 'https://charitology.org' }));
  assert.equal(response.status, 202); assert.equal(response.headers.get('access-control-allow-origin'), 'https://charitology.org');
  assert.equal((await response.json()).ok, true); assert.equal(updates[0][2], 'failed');
});
test('Normal form submission gets readable HTML; control test mode never sends to other addresses', async () => {
  const handler = createHandler({ db: {}, mail: {}, settings: { ...settings, testOnly: true, testRecipient: 'private@example.com' } });
  const response = await handler(new Request('https://mail.charitology.org/api/subscribe', { method: 'POST', body: new URLSearchParams({ email: 'other@example.com', consent: 'yes' }) }));
  assert.match(response.headers.get('content-type'), /text\/html/); assert.match(await response.text(), /confirmation message/);
});
test('Disabled delivery and admin endpoints fail closed', async () => {
  const handler = createHandler({ db: {}, mail: {}, settings: { ...settings, enabled: false } });
  assert.equal((await handler(request('/api/subscribe', { email: 'a@example.com', consent: 'yes' }))).status, 503);
  assert.equal((await handler(new Request('https://mail.charitology.org/api/admin/preview'))).status, 401);
  const preview = await handler(new Request('https://mail.charitology.org/api/admin/preview', { headers: { authorization: `Bearer ${settings.adminToken}` } }));
  assert.equal(preview.status, 200); assert.match((await preview.json()).hash, /^[a-f0-9]{64}$/);
});
test('One-click unsubscribe supports query bearer plus RFC8058 body and remains durable after sync failure', async () => {
  let withdrawn = 0;
  const handler = createHandler({ db: { unsubscribe: async () => { withdrawn++; return 'a@example.com'; }, tx: async () => { throw new Error('provider unavailable'); } }, mail: {}, settings, logger: () => {} });
  const response = await handler(request(`/unsubscribe?token=${newToken()}`, { 'List-Unsubscribe': 'One-Click' }));
  assert.equal(response.status, 200); assert.equal(withdrawn, 1); assert.match((await response.json()).message, /unsubscribe is recorded/);
});
test('Webhook verifies original raw bytes and rejects tampering before DB access', async () => {
  const secret = 'whsec_'+Buffer.alloc(32, 9).toString('base64'); let writes = 0;
  const handler = createHandler({ db: { tx: async action => action({ query: async () => { writes++; return { rowCount: 0 }; } }) }, mail: {}, settings: { ...settings, webhookSecret: secret }, logger: () => {} });
  const payload = '{"type":"email.delivered","data":{}}'; const id = 'msg_test'; const timestamp = new Date();
  const signature = new Webhook(secret).sign(id, timestamp, payload);
  const make = body => new Request('https://mail.charitology.org/api/webhook', { method: 'POST', body, headers: { 'svix-id': id, 'svix-timestamp': String(Math.floor(+timestamp/1000)), 'svix-signature': signature, 'content-type': 'application/json' } });
  assert.equal((await handler(make(payload))).status, 200); assert.equal(writes, 1);
  assert.equal((await handler(make(payload+' '))).status, 400); assert.equal(writes, 1);
});
test('Daily maintenance requires its independent bearer and only performs cleanup', async () => {
  let cleaned = 0;
  const cronSecret = 'c'.repeat(40);
  const handler = createHandler({ db: { cleanup: async () => { cleaned++; return { ok: true }; } }, mail: new Proxy({}, { get: () => { throw new Error('maintenance must not access provider'); } }), settings: { ...settings, cronSecret } });
  const make = token => new Request('https://mail.charitology.org/api/cron/maintenance', { headers: token ? { authorization: `Bearer ${token}` } : {} });
  assert.equal((await handler(make())).status, 401);
  assert.equal((await handler(make(settings.adminToken))).status, 401);
  assert.equal((await handler(make(cronSecret))).status, 200); assert.equal(cleaned, 1);
});
test('Signed contact.created resumes only an existing confirmed pending record, never new consent or mail', async () => {
  const secret = 'whsec_'+Buffer.alloc(32, 7).toString('base64');
  let person; let contactReads = 0; let topicChanges = 0; let memberships = 0;
  const connection = { query: async sql => sql.startsWith('SELECT * FROM newsletter_subscribers') ? { rows: person ? [person] : [] } : { rowCount: 1 } };
  const db = { tx: async action => action(connection), exclusive: async action => action(connection) };
  const mail = { contact: async () => { contactReads++; return { id: 'confirmed-contact', unsubscribed: false }; }, setTopic: async () => topicChanges++, addSegment: async () => memberships++ };
  const handler = createHandler({ db, mail, settings: { ...settings, webhookSecret: secret, segmentId: 'own-segment', topicId: 'own-topic' }, logger: () => {} });
  const sendEvent = async () => {
    const raw = JSON.stringify({ type: 'contact.created', data: { email: 'a@example.invalid' } });
    const timestamp = new Date(); const id = 'msg_created';
    return handler(new Request('https://mail.charitology.org/api/webhook', { method: 'POST', body: raw, headers: { 'svix-id': id, 'svix-timestamp': String(Math.floor(+timestamp/1000)), 'svix-signature': new Webhook(secret).sign(id, timestamp, raw) } }));
  };
  assert.equal((await sendEvent()).status, 200);
  for (const state of ['pending', 'unsubscribed', 'blocked']) {
    person = { email: 'a@example.invalid', state, sync_pending: true, consent_at: new Date(), consent_generation: 'g' };
    assert.equal((await sendEvent()).status, 200);
  }
  assert.equal(contactReads, 0); assert.equal(topicChanges, 0);
  person = { email: 'a@example.invalid', state: 'confirmed', sync_pending: true, consent_at: new Date(), consent_generation: 'g' };
  assert.equal((await sendEvent()).status, 200);
  assert.equal(contactReads, 1); assert.equal(topicChanges, 1); assert.equal(memberships, 1);
});
