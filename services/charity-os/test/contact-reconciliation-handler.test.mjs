// Actual Request -> main sign-in/CSRF -> CRM route boundary. Business callbacks
// are deliberately unexecuted; actual SQL/RLS/atomicity is separate evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../lib/handler.mjs';
import { csrf, hash, HttpError } from '../lib/security.mjs';

const settings = { origin: 'https://os.example.invalid', secret: 'fictional-contact-boundary-secret-at-least32' };
const session = { session: { id: 'contact_session' }, user: { id: 'contact_actor', email: 'staff@example.invalid' } };
const base = '/api/orgs/contact_org/contact-reconciliation';
function fixture({ answers = [], noSession = false } = {}) {
  const transactions = [], limits = [];
  const db = { async limit(...args) { limits.push(args); }, async tx(user, org, callback, options) {
    assert.equal(user, session.user.id); assert.equal(org, 'contact_org'); assert.equal(typeof callback, 'function');
    transactions.push(options); const answer = answers.length ? answers.shift() : { boundary: true };
    if (answer instanceof Error) throw answer; return answer;
  } };
  const handle = createHandler({ settings, db, auth: { api: { async getSession() { return noSession ? null : session; } } }, send: async () => { throw Error('No mail'); } });
  const request = (suffix, { method = 'POST', body = '{}', headers = {}, token = true } = {}) => new Request(settings.origin + base + suffix, {
    method, headers: { origin: settings.origin, 'content-type': 'application/json', ...(token ? { 'x-csrf-token': csrf(session.session.id, settings.secret) } : {}), ...headers },
    ...(['GET', 'HEAD'].includes(method) ? {} : { body }),
  });
  return { handle, request, transactions, limits };
}
const commit = JSON.stringify({ previewId: 'preview', commandKey: 'kept_command' });

test('CRM bounded history uses only the read-only transaction and user read limit', async () => {
  for (const suffix of ['/history?limit=20&after=previous', '/history/report']) {
    const f = fixture(), response = await f.handle(f.request(suffix, { method: 'GET' }));
    assert.equal(response.status, 200); assert.deepEqual(f.transactions, [{ readOnly: true }]);
    assert.deepEqual(f.limits, [['contact-reconciliation-read:' + hash(session.user.id), 120, 3600]]);
  }
});
test('CRM inspect preflights permission before a locked READ ONLY complete comparison', async () => {
  const f = fixture(), response = await f.handle(f.request('/inspect', { body: '{"leftId":"left","rightId":"right"}' }));
  assert.equal(response.status, 200); assert.deepEqual(f.transactions, [{ readOnly: true }, { lock: true, readOnly: true }]);
  assert.deepEqual(f.limits, [['contact-reconciliation-write:' + hash(session.user.id), 60, 3600]]);
});
test('CRM normal/undo preview each use one fresh preflight and one locked write', async () => {
  for (const suffix of ['/preview', '/reverse-preview']) {
    const f = fixture(), response = await f.handle(f.request(suffix));
    assert.equal(response.status, 200); assert.deepEqual(f.transactions, [{ readOnly: true }, { lock: true }]);
  }
});
test('CRM malformed/oversized transport is refused after preflight and before business dispatch', async () => {
  for (const [options, status] of [
    [{ body: '{"leftId":"left","leftId":"right"}' }, 422], [{ body: Uint8Array.of(0xc3, 0x28) }, 422],
    [{ body: ' '.repeat(16385) }, 413], [{ headers: { 'content-type': 'text/plain' } }, 415],
    [{ headers: { 'content-encoding': 'gzip' } }, 415],
  ]) {
    const f = fixture(), response = await f.handle(f.request('/inspect', options));
    assert.equal(response.status, status); assert.deepEqual(f.transactions, [{ readOnly: true }]);
  }
});
test('CRM actual permission preflight can refuse before accessing the POST body', async () => {
  const f = fixture({ answers: [new HttpError(403, 'membership', 'Unavailable')] }), request = f.request('/inspect'); let bodyReads = 0;
  const body = request.body; Object.defineProperty(request, 'body', { get() { bodyReads++; return body; } });
  const response = await f.handle(request); assert.equal(response.status, 403); assert.equal(bodyReads, 0); assert.deepEqual(f.transactions, [{ readOnly: true }]);
});
test('CRM accepted read precedes write; one failed write triggers only an accepted-result read', async () => {
  const accepted = { operation: 'merge', reportId: 'report', reportSha256: 'a'.repeat(64), recordIds: ['left', 'right'], replayed: true };
  for (const answers of [[{}, accepted], [{}, null, accepted], [{}, null, new Error('fictional lost local result'), accepted]]) {
    const expected = answers.length === 2 ? [{ readOnly: true }, { readOnly: true }] : answers.length === 3
      ? [{ readOnly: true }, { readOnly: true }, { lock: true }]
      : [{ readOnly: true }, { readOnly: true }, { lock: true }, { readOnly: true }];
    const f = fixture({ answers: [...answers] }), response = await f.handle(f.request('/commit', { body: commit }));
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true, ...accepted }); assert.deepEqual(f.transactions, expected);
    assert.equal(f.transactions.filter(x => x.lock).length, answers.length === 2 ? 0 : 1);
  }
});
test('CRM commit extra fields refuse before lookup; failed reconciliation never repeats the write', async () => {
  const a = fixture(), bad = await a.handle(a.request('/commit', { body: '{"previewId":"p","commandKey":"k","ignoreReports":[]}' }));
  assert.equal(bad.status, 422); assert.deepEqual(a.transactions, [{ readOnly: true }]);
  const b = fixture({ answers: [{}, null, new HttpError(409, 'contact_preview_expired', 'Expired'), null] });
  const response = await b.handle(b.request('/commit', { body: commit })); assert.equal(response.status, 409);
  assert.deepEqual(b.transactions, [{ readOnly: true }, { readOnly: true }, { lock: true }, { readOnly: true }]);
});
test('CRM retains main auth/CSRF and rejects method, query, route and read-body indicators before rates', async () => {
  for (const [suffix, options, status] of [
    ['/preview', { token: false }, 403], ['/history', { method: 'HEAD' }, 405], ['/unknown', {}, 404],
    ['/history?limit=21', { method: 'GET' }, 422], ['/history?limit=1&limit=2', { method: 'GET' }, 422],
    ['/history/report?after=x', { method: 'GET' }, 422], ['/inspect?extra=1', {}, 422],
    ['/history', { method: 'GET', headers: { 'content-length': '1' } }, 400],
  ]) { const f = fixture(), response = await f.handle(f.request(suffix, options)); assert.equal(response.status, status); assert.equal(f.transactions.length, 0); assert.equal(f.limits.length, 0); }
  const f = fixture({ noSession: true }), response = await f.handle(f.request('/preview')); assert.equal(response.status, 401); assert.equal(f.transactions.length, 0);
});
