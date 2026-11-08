/** Real Request -> authenticated main handler -> strict reader/tx classifier.
 * The transaction callback is deliberately not run here: actual leaf/context
 * tests cover it separately. This is no real auth/SQL or allocation claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../lib/handler.mjs';
import { csrf, json } from '../lib/security.mjs';

const settings = { origin: 'https://os.example.invalid', secret: 'fictional-group-handler-secret-at-least32' };
const session = { session: { id: 'fictional_session' }, user: { id: 'fictional_actor', email: 'staff@example.invalid' } };
const prefix = '/api/orgs/fictional_org/participation-groups';
function fixture() {
  const calls = [];
  const db = { async tx(user, org, callback, options) {
    assert.equal(user, session.user.id); assert.equal(org, 'fictional_org'); assert.equal(typeof callback, 'function');
    calls.push(options); return json({ reachedTransactionBoundary: true });
  } };
  const handle = createHandler({ settings, db, auth: { api: { async getSession() { return session; } } }, send: async () => { throw Error('No mail'); } });
  const request = (path, { method = 'POST', body = '{}', headers = {}, token = true } = {}) => new Request(settings.origin + path, {
    method, headers: { origin: settings.origin, 'content-type': 'application/json',
      ...(token ? { 'x-csrf-token': csrf(session.session.id, settings.secret) } : {}), ...headers },
    ...(['GET', 'HEAD'].includes(method) ? {} : { body }),
  });
  return { calls, handle, request };
}

test('only the two exact POST group previews enter a locked SQL read-only transaction', async () => {
  const f = fixture();
  for (const suffix of ['/group/preview-admission', '/group/preview-cancellation']) {
    const response = await f.handle(f.request(prefix + suffix));
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { reachedTransactionBoundary: true });
    assert.deepEqual(f.calls.at(-1), { lock: true, readOnly: true });
  }
  for (const suffix of ['', '/group/admit', '/group/cancel', '/group/close', '/group/preview-admission/unknown']) {
    assert.equal((await f.handle(f.request(prefix + suffix))).status, 200);
    assert.deepEqual(f.calls.at(-1), { lock: true, readOnly: false });
  }
});

test('GET group views retain read-only classification; HEAD refuses before transaction', async () => {
  const f = fixture();
  assert.equal((await f.handle(f.request(prefix + '?targetId=target', { method: 'GET' }))).status, 200);
  assert.deepEqual(f.calls, [{ lock: false, readOnly: true }]);
  assert.equal((await f.handle(f.request(prefix + '/group', { method: 'HEAD' }))).status, 405);
  assert.equal(f.calls.length, 1);
});

for (const [name, body] of [
  ['duplicate fields', '{"version":1,"version":1}'],
  ['nested duplicate fields', '{"target":{"id":1,"id":2}}'],
  ['nonfinite numeric value', '{"value":1e400}'],
  ['malformed UTF8', Uint8Array.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d])],
]) test(`main group reader refuses ${name} before transaction`, async () => {
  const f = fixture(), response = await f.handle(f.request(prefix + '/group/admit', { body }));
  assert.equal(response.status, 422); assert.equal(f.calls.length, 0);
});

test('strict16KiB original-byte ceiling also covers an unknown group suffix', async () => {
  const f = fixture();
  const body = JSON.stringify({ note: 'x'.repeat(16384) });
  assert.equal((await f.handle(f.request(prefix + '/group/unknown', { body }))).status, 413);
  assert.equal(f.calls.length, 0);
});

test('group reads refuse body transport indicators before skipping readers', async () => {
  const f = fixture();
  for (const headers of [{ 'content-length': '1' }, { 'content-length': 'bogus' }, { 'transfer-encoding': 'chunked' }]) {
    assert.equal((await f.handle(f.request(prefix, { method: 'GET', headers }))).status, 400);
    assert.equal(f.calls.length, 0);
  }
  assert.equal((await f.handle(f.request(prefix, { method: 'GET', headers: { 'content-length': '0' } }))).status, 200);
});

test('group POST retains actual global CSRF and JSON content-type admission', async () => {
  const f = fixture();
  assert.equal((await f.handle(f.request(prefix, { token: false }))).status, 403);
  assert.equal((await f.handle(f.request(prefix, { headers: { 'content-type': 'text/plain' } }))).status, 415);
  assert.equal(f.calls.length, 0);
});
