// Actual shared Request transport with a fictional fetch response; no server/auth proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { contactReconciliationAPI, setCsrfToken, ApiError } from './api.js';

test('contact callbacks use the existing same-origin CSRF transport and exact documented routes', async () => {
  const old = globalThis.fetch, calls = [], controller = new AbortController();
  globalThis.fetch = async (path, options) => { calls.push({ path, options }); return new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }); };
  try {
    setCsrfToken('fictional-contact-csrf'); const api = contactReconciliationAPI('org A'), options = { signal: controller.signal };
    const inspect = { leftId: 'left', rightId: 'right' }, commit = { previewId: 'preview', commandKey: 'exact-key' };
    await api.contacts('next/+?', options);
    await api.inspect(inspect, options); await api.preview({ ...inspect, contextSha256: 'a'.repeat(64), decision: { operation: 'no-merge' } }, options);
    await api.reversePreview({ reportId: 'report' }, options); await api.commit(commit, options);
    await api.history({ after: 'report A', limit: 20 }, options); await api.historyDetail('report B', options);
    assert.deepEqual(calls.map(c => c.path), [
      '/api/orgs/org%20A/modules/contacts/records?cursor=next%2F%2B%3F',
      '/api/orgs/org%20A/contact-reconciliation/inspect', '/api/orgs/org%20A/contact-reconciliation/preview',
      '/api/orgs/org%20A/contact-reconciliation/reverse-preview', '/api/orgs/org%20A/contact-reconciliation/commit',
      '/api/orgs/org%20A/contact-reconciliation/history?limit=20&after=report%20A', '/api/orgs/org%20A/contact-reconciliation/history/report%20B',
    ]);
    for (const c of calls) { assert.equal(c.options.credentials, 'same-origin'); assert.equal(c.options.cache, 'no-store'); assert.equal(c.options.signal, controller.signal); }
    for (const i of [1, 2, 3, 4]) { assert.equal(calls[i].options.method, 'POST'); assert.equal(calls[i].options.headers['X-CSRF-Token'], 'fictional-contact-csrf'); }
    assert.deepEqual(JSON.parse(calls[1].options.body), inspect); assert.equal(calls[4].options.body, JSON.stringify(commit));
    for (const i of [0, 5, 6]) { assert.equal(calls[i].options.method, 'GET'); assert(!Object.hasOwn(calls[i].options, 'body')); assert(!Object.hasOwn(calls[i].options.headers, 'X-CSRF-Token')); }
  } finally { globalThis.fetch = old; setCsrfToken(''); }
});

test('contact commit preserves a refused or interrupted body without transport retries', async () => {
  const old = globalThis.fetch, bodies = [], body = Object.freeze({ previewId: 'preview', commandKey: 'same-key' });
  try {
    const api = contactReconciliationAPI('org');
    globalThis.fetch = async (path, options) => { bodies.push(options.body); throw new TypeError('fictional interruption'); };
    await assert.rejects(api.commit(body), e => e instanceof ApiError && e.status === 0); assert.equal(bodies.length, 1);
    globalThis.fetch = async (path, options) => { bodies.push(options.body); return new Response('{"ok":false,"code":"rate","message":"Wait"}', { status: 429 }); };
    await assert.rejects(api.commit(body), e => e.status === 429 && e.code === 'rate');
    assert.deepEqual(bodies, [JSON.stringify(body), JSON.stringify(body)]); assert.deepEqual(body, { previewId: 'preview', commandKey: 'same-key' });
  } finally { globalThis.fetch = old; }
});
