import test from 'node:test';
import assert from 'node:assert/strict';
import { authorized, boundedBody, fields, hashToken, newToken, normalizeEmail, rateKeys, validToken } from '../lib/security.mjs';
test('Cryptographic tokens are unpredictable-shaped and only hashes are persisted', () => {
  const tokens = new Set(Array.from({ length: 1000 }, newToken));
  assert.equal(tokens.size, 1000);
  for (const token of tokens) { assert.ok(validToken(token)); assert.match(hashToken(token), /^[a-f0-9]{64}$/); assert.notEqual(hashToken(token), token); }
  assert.equal(validToken('a'.repeat(42)), false);
});
test('Email validation rejects header injection, bad local/domain syntax, unicode and oversize', () => {
  assert.equal(normalizeEmail(' Person+letter@EXAMPLE.COM '), 'person+letter@example.com');
  for (const value of ['a@example.com\r\nBcc: b@example.com', 'a..b@example.com', '.a@example.com', 'a@-bad.com', 'a@b', 'x'.repeat(65)+'@example.com', 'é@example.com', ['a@example.com']]) assert.equal(normalizeEmail(value), null);
});
test('Bearer auth rejects missing, partial, wrong and undersized secrets', () => {
  const secret = 'x'.repeat(40);
  assert.equal(authorized(new Request('https://example.com', { headers: { authorization: `Bearer ${secret}` } }), secret), true);
  for (const authorization of ['', secret, `Bearer ${secret}x`]) assert.equal(authorized(new Request('https://example.com', { headers: { authorization } }), secret), false);
  assert.equal(authorized(new Request('https://example.com'), ''), false);
});
test('Streaming body limit works even when content-length is absent or false', async () => {
  const request = new Request('https://example.com', { method: 'POST', body: 'x'.repeat(200) });
  await assert.rejects(boundedBody(request, 100), /large/);
});
test('FormData, no-JS urlencoded and JSON have the same field contract; duplicates rejected', async () => {
  const data = new FormData(); data.set('email', 'a@example.com'); data.set('consent', 'yes'); data.set('website', '');
  const multipart = await fields(new Request('https://example.com', { method: 'POST', body: data }));
  const encoded = await fields(new Request('https://example.com', { method: 'POST', body: new URLSearchParams(data) }));
  assert.deepEqual({ ...multipart }, { ...encoded });
  const repeated = new Request('https://example.com', { method: 'POST', body: new URLSearchParams('email=a&email=b') });
  await assert.rejects(fields(repeated), /repeated/);
  await assert.rejects(fields(new Request('https://example.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"email":{}}' })), /Invalid/);
});
test('Rate keys retain neither raw address nor IP and separate window boundaries', () => {
  const r = new Request('https://example.com', { headers: { 'x-vercel-forwarded-for': '192.0.2.4', 'x-forwarded-for': 'arbitrary' } });
  const first = rateKeys(r, 'a@example.com', 'z'.repeat(40), 0);
  assert.ok(!JSON.stringify(first).includes('192.0.2.4'));
  assert.ok(!JSON.stringify(first).includes('a@example.com'));
  assert.notDeepEqual(first, rateKeys(r, 'a@example.com', 'z'.repeat(40), 86400001));
  assert.throws(() => rateKeys(r, 'a@example.com', ''), /secret/);
});
