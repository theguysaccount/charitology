import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { createModelBundleControllerForTesting } from './session.mjs';
import { fixtureState, fixtureContent, FIXTURE_NOW } from './test-fixtures.mjs';
import { LOCAL_KEY, makeBackup, validateState } from './graph.mjs';
import { LIMITS, canonicalJson, savedStringHash } from './codec.mjs';
import { editorFormFromContent } from './content.mjs';
const workerPlatform = { createWorker() {
  const worker = new Worker(new URL('./pure-worker.fixture.mjs', import.meta.url)), listeners = new Map();
  return { addEventListener(type, listener) { const wrapped = type === 'message' ? data => listener({ data }) : listener; listeners.set(listener, [type, wrapped]); worker.on(type, wrapped); },
    removeEventListener(type, listener) { const entry = listeners.get(listener); if (entry) worker.off(...entry); listeners.delete(listener); },
    postMessage(value) { worker.postMessage(value); }, terminate() { void worker.terminate(); } };
}, setTimeout, clearTimeout };
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function disk(raw = null) {
  const shared = { raw, logs: [], hooks: new Map(), locks: [], count: 0 };
  let queue = Promise.resolve();
  shared.adapter = label => Object.fromEntries(['getItem', 'setItem', 'removeItem'].map(method => [method, async (key, value) => {
    assert.equal(key, LOCAL_KEY); shared.logs.push({ label, method, value });
    const hook = shared.hooks.get(`${label}:${method}`); if (hook) return hook(value);
    if (method === 'getItem') return shared.raw;
    shared.raw = method === 'removeItem' ? null : value;
  }]));
  shared.lock = { request(name, fn) { assert.equal(name, LOCAL_KEY); shared.locks.push(name); const result = queue.then(async () => { shared.count++; try { return await fn(); } finally { shared.count--; } }); queue = result.catch(() => {}); return result; } };
  return shared;
}
function owner(t, shared, label = 'a', overrides = {}) {
  let serial = 0; const ids = [];
  const controller = createModelBundleControllerForTesting({ storage: shared.adapter(label), locks: shared.lock,
    newId(kind) { const value = `${label}-${kind}-${++serial}`; ids.push(value); return value; }, now: () => FIXTURE_NOW,
    workerPlatform, disableSecureHash: false, ...overrides });
  t.after(() => controller.session.dispose()); return { ...controller, ids };
}
function edited(controller, title) {
  const draft = structuredClone(controller.session.snapshot().memory.draft); draft.form.text.title = title; draft.dirty = true;
  return { kind: 'save-draft', draft };
}
test('actual session opens only the new exact key without writes and detached snapshots cannot alter memory', async t => {
  const state = await fixtureState(), raw = ` \n${JSON.stringify(state, null, 1)}\n`, shared = disk(raw), a = owner(t, shared);
  const opened = await a.openingPromise; assert.deepEqual(opened.memory, state); assert.equal(opened.generation, 1); assert.equal(opened.persistence, 'saved');
  assert.equal(opened.savedSha256, await savedStringHash(raw)); assert.equal(shared.logs.filter(x => x.method !== 'getItem').length, 0);
  assert.throws(() => { opened.memory.draft.form.text.title = 'forged'; }, TypeError);
  assert.equal(a.hooks.ownedJob().formGeneration, 0); assert.equal(a.hooks.ownedJob().storeGeneration, 1);
  const p = await a.session.preview(edited(a, 'Literal unsaved title'));
  assert.equal(shared.logs.filter(x => x.method !== 'getItem').length, 0); assert.notEqual(p.review.candidateStateHash, p.review.beforeStateHash);
  const result = await a.session.commit(p.handle); assert.equal(result.kind, 'saved'); assert.equal(result.snapshot.generation, 2);
  assert.equal(shared.raw, canonicalJson(p.review.candidate)); assert.equal(a.session.snapshot().memory.draft.form.text.title, 'Literal unsaved title');
  assert.equal((await a.session.commit(p.handle)).kind, 'refused');
});
test('actual two adapters serialize exact fresh-disk conflicts and explicit reload retains no stale authority', async t => {
  const state = await fixtureState(), shared = disk(canonicalJson(state)), a = owner(t, shared, 'a'), b = owner(t, shared, 'b');
  await Promise.all([a.openingPromise, b.openingPromise]); const pa = await a.session.preview(edited(a, 'A saved')), pb = await b.session.preview(edited(b, 'B retained'));
  assert.equal((await a.session.commit(pa.handle)).kind, 'saved'); const result = await b.session.commit(pb.handle);
  assert.equal(result.kind, 'refused'); assert.equal(result.code, 'foreign-save'); assert.equal(result.snapshot.persistence, 'conflict');
  assert.equal(result.snapshot.memory.draft.form.text.title, state.draft.form.text.title); assert.equal(shared.logs.filter(x => x.method === 'setItem').length, 1);
  const loaded = await b.session.reload({ discardLocal: true }); assert.equal(loaded.memory.draft.form.text.title, 'A saved'); assert.equal(loaded.persistence, 'saved');
  assert.equal(b.session.undo(), null); assert.equal(shared.count, 0);
});
test('actual quota Retry preserves the exact candidate and IDs while newer writing invalidates only delivery', async t => {
  const shared = disk(canonicalJson(await fixtureState())), a = owner(t, shared); await a.openingPromise;
  const p = await a.session.preview(edited(a, 'Original candidate')), quota = Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
  shared.hooks.set('a:setItem', () => { throw quota; }); const first = await a.session.commit(p.handle);
  assert.equal(first.code, 'quota'); assert.equal(first.snapshot.pending, 'retry'); const reserved = [...a.ids];
  a.hooks.noteFormChanged(); shared.hooks.delete('a:setItem'); const retried = await a.session.retry();
  assert.equal(retried.kind, 'saved'); assert.equal(shared.raw, canonicalJson(p.review.candidate)); assert.deepEqual(a.ids, reserved);
  assert.equal(a.session.undo(), null); assert.equal(a.hooks.ownedJob().formGeneration, 1);
});
test('actual unconfirmed readback reconciles the same candidate without another write, including concurrent Retry', async t => {
  const shared = disk(canonicalJson(await fixtureState())), a = owner(t, shared); await a.openingPromise;
  const p = await a.session.preview(edited(a, 'May already be saved')); let reads = 0;
  shared.hooks.set('a:getItem', () => { if (++reads === 2) throw new Error('read denied after set'); return shared.raw; });
  assert.equal((await a.session.commit(p.handle)).kind, 'unconfirmed'); assert.equal(shared.raw, canonicalJson(p.review.candidate)); shared.hooks.delete('a:getItem');
  const results = await Promise.all([a.session.retry(), a.session.retry()]); assert.ok(results.some(x => x.kind === 'saved')); assert.ok(results.every(x => ['saved', 'noop'].includes(x.kind)));
  assert.equal(shared.logs.filter(x => x.method === 'setItem').length, 1); assert.equal(a.session.snapshot().generation, 2);
});
test('actual observed foreign change protects a pending candidate even if another tab restores the old baseline', async t => {
  const state = await fixtureState(), before = canonicalJson(state), shared = disk(before), a = owner(t, shared); await a.openingPromise;
  const p = await a.session.preview(edited(a, 'Retained quota candidate')); shared.hooks.set('a:setItem', () => { throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); });
  assert.equal((await a.session.commit(p.handle)).code, 'quota'); shared.hooks.delete('a:setItem');
  const foreign = structuredClone(state); foreign.draft.form.text.title = 'Foreign briefly saved'; shared.raw = canonicalJson(foreign); await a.session.rereadStatus(); shared.raw = before; await a.session.rereadStatus();
  const retried = await a.session.retry(); assert.equal(retried.code, 'foreign-save'); assert.equal(retried.snapshot.pending, 'retry'); assert.equal(shared.raw, before);
});
test('actual queued commit is revoked by a form edit before its lock and causes no write', async t => {
  const shared = disk(canonicalJson(await fixtureState())), hold = deferred();
  const locked = shared.lock.request(LOCAL_KEY, () => hold.promise), a = owner(t, shared); await a.openingPromise;
  const p = await a.session.preview(edited(a, 'Never written')), committing = a.session.commit(p.handle); a.hooks.noteFormChanged(); hold.resolve(); await locked;
  assert.equal((await committing).code, 'stale'); assert.equal(shared.logs.filter(x => x.method === 'setItem').length, 0);
});
test('actual queued preview snapshots literal command arguments before its held opening read', async t => {
  const shared = disk(), held = deferred(); shared.hooks.set('a:getItem', () => held.promise); const a = owner(t, shared);
  const command = edited(a, 'Captured before opening'), preview = a.session.preview(command); command.draft.form.text.title = 'Mutated after await';
  shared.hooks.delete('a:getItem'); held.resolve(null); const p = await preview;
  assert.equal(p.review.candidate.draft.form.text.title, 'Captured before opening'); assert.equal(shared.logs.filter(x => x.method !== 'getItem').length, 0);
});
test('actual held write across suspension stays unconfirmed and Retry reconciles without hydration or another set', async t => {
  const shared = disk(canonicalJson(await fixtureState())), a = owner(t, shared); await a.openingPromise;
  const p = await a.session.preview(edited(a, 'Candidate crossing suspension')), entered = deferred(), release = deferred();
  shared.hooks.set('a:setItem', async value => { shared.raw = value; entered.resolve(); await release.promise; });
  const committing = a.session.commit(p.handle); await entered.promise; a.hooks.suspend(); release.resolve();
  assert.equal((await committing).kind, 'unconfirmed'); assert.equal(a.session.snapshot().pending, 'retry');
  const resumed = await a.hooks.resume(); assert.equal(resumed.persistence, 'conflict'); assert.notEqual(resumed.memory.draft.form.text.title, 'Candidate crossing suspension');
  assert.equal((await a.session.retry()).kind, 'saved'); assert.equal(shared.logs.filter(x => x.method === 'setItem').length, 1); assert.equal(a.session.undo(), null);
});
test('actual clear/restore Undo restores exact prior string or absence and only consumes after commit', async t => {
  const state = await fixtureState(), raw = `\n${JSON.stringify(state, null, 3)}  `, shared = disk(raw), a = owner(t, shared); await a.openingPromise;
  const clear = await a.session.preview({ kind: 'clear', discardLocal: true }); assert.equal((await a.session.commit(clear.handle)).kind, 'removed'); assert.equal(shared.raw, null);
  const undo = a.session.undo(); assert.ok(undo); await a.session.preview({ kind: 'undo', undo });
  const retryReview = await a.session.preview({ kind: 'undo', undo }); assert.equal((await a.session.commit(retryReview.handle)).kind, 'saved'); assert.equal(shared.raw, raw); assert.equal(a.session.undo(), null);
  const absentDisk = disk(), b = owner(t, absentDisk, 'b'); await b.openingPromise;
  const backup = await b.bridge.api.admitBackup(await makeBackup(state, FIXTURE_NOW)), restoring = await b.session.preview({ kind: 'restore', backup, discardLocal: true });
  assert.equal((await b.session.commit(restoring.handle)).kind, 'saved'); const priorAbsence = await b.session.preview({ kind: 'undo', undo: b.session.undo() });
  assert.equal((await b.session.commit(priorAbsence.handle)).kind, 'removed'); assert.equal(absentDisk.raw, null); assert.equal(b.session.snapshot().memory.id, 'b-workspace-1');
});
test('actual corrupt and denied strings remain protected, escaped recovery is exact, and corrupt replacement has no Undo', async t => {
  const corrupt = 'unpaired\ud800 saved text', shared = disk(corrupt), a = owner(t, shared); await a.openingPromise;
  assert.equal(a.session.snapshot().persistence, 'corrupt'); const recovery = new TextDecoder().decode(await a.session.rawSavedRecovery());
  assert.equal(JSON.parse(recovery.slice(recovery.indexOf('{'))).savedString, corrupt); await assert.rejects(a.session.preview(edited(a, 'Blocked')), { code: 'protected-saved-string' });
  const clear = await a.session.preview({ kind: 'clear', discardLocal: true }); assert.equal((await a.session.commit(clear.handle)).kind, 'removed'); assert.equal(a.session.undo(), null);
  const denied = disk(); denied.hooks.set('denied:getItem', () => { throw new Error('denied'); }); const b = owner(t, denied, 'denied'); await b.openingPromise;
  assert.equal(b.session.snapshot().persistence, 'unavailable'); await assert.rejects(b.session.preview({ kind: 'clear', discardLocal: true }), { code: 'unavailable' }); assert.equal(denied.logs.filter(x => x.method !== 'getItem').length, 0);
});
test('actual no-lock/no-SHA sessions never write and report read-only capabilities', async t => {
  for (const override of [{ locks: null }, { disableSecureHash: true }]) {
    const shared = disk(canonicalJson(await fixtureState())), a = owner(t, shared, override.disableSecureHash ? 'sha' : 'lock', override); await a.openingPromise;
    assert.equal(a.session.snapshot().capabilities.canPersist, false); await assert.rejects(a.session.preview({ kind: 'clear', discardLocal: true }), { code: 'unavailable' });
    assert.equal(shared.logs.filter(x => x.method !== 'getItem').length, 0);
  }
});
test('actual exact escaped recovery cap is admitted and one extra byte refuses before building the output', async t => {
  const shared = disk(''), a = owner(t, shared); await a.openingPromise;
  const emptyBytes = await a.session.rawSavedRecovery(), count = LIMITS.checksumFile - emptyBytes.byteLength;
  shared.raw = 'a'.repeat(count); assert.equal((await a.session.reload({ discardLocal: true })).persistence, 'corrupt');
  assert.equal((await a.session.rawSavedRecovery()).byteLength, LIMITS.checksumFile);
  shared.raw += 'a'; await a.session.reload({ discardLocal: true }); await assert.rejects(a.session.rawSavedRecovery(), { code: 'byte-limit' });
  assert.equal(shared.logs.filter(x => x.method !== 'getItem').length, 0);
});
test('actual held initial read waits for resume and rereads before its first hydration', async t => {
  const original = await fixtureState(), changed = structuredClone(original); changed.draft.form.text.title = 'Changed during suspension';
  const shared = disk(canonicalJson(original)), first = deferred(); let reads = 0;
  shared.hooks.set('a:getItem', () => ++reads === 1 ? first.promise : shared.raw); const a = owner(t, shared); a.hooks.suspend();
  shared.raw = canonicalJson(changed); first.resolve(canonicalJson(original)); let settled = false; a.openingPromise.then(() => { settled = true; }); await new Promise(resolve => setImmediate(resolve)); assert.equal(settled, false);
  await a.hooks.resume(); assert.equal((await a.openingPromise).memory.draft.form.text.title, 'Changed during suspension'); assert.equal(reads, 2);
});
test('actual resume detects foreign save without hydration and an older status read cannot repaint a later confirmed save', async t => {
  const state = await fixtureState(), shared = disk(canonicalJson(state)), a = owner(t, shared); await a.openingPromise;
  const held = deferred(); let once = true; shared.hooks.set('a:getItem', () => { if (once) { once = false; return held.promise; } return shared.raw; });
  const staleStatus = a.session.rereadStatus(), p = await a.session.preview(edited(a, 'New confirmed title')); assert.equal((await a.session.commit(p.handle)).kind, 'saved');
  held.resolve(canonicalJson(state)); await staleStatus; assert.equal(a.session.snapshot().persistence, 'saved'); assert.equal(a.session.snapshot().memory.draft.form.text.title, 'New confirmed title');
  a.hooks.suspend(); const foreign = structuredClone(state); foreign.draft.form.text.title = 'Foreign after BFCache'; shared.raw = canonicalJson(foreign);
  const resumed = await a.hooks.resume(); assert.equal(resumed.persistence, 'conflict'); assert.equal(resumed.memory.draft.form.text.title, 'New confirmed title'); assert.equal(resumed.pending, 'none');
});
test('actual freeze uses the fixed worker and retains one-time IDs and timestamp across quota retry', async t => {
  const shared = disk(), a = owner(t, shared); await a.openingPromise;
  const draft = structuredClone(a.session.snapshot().memory.draft); draft.form = structuredClone(await editorFormFromContent(await fixtureContent())); draft.dirty = true;
  const p = await a.session.preview({ kind: 'freeze', draft }); assert.equal(p.review.createdVersion.id, 'a-version-3'); assert.equal(p.review.candidate.versions[0].recordedAt, FIXTURE_NOW);
  const quota = Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); shared.hooks.set('a:setItem', () => { throw quota; }); assert.equal((await a.session.commit(p.handle)).code, 'quota');
  const ids = [...a.ids]; shared.hooks.delete('a:setItem'); assert.equal((await a.session.retry()).kind, 'saved'); assert.deepEqual(a.ids, ids);
  const admitted = await validateState(JSON.parse(shared.raw)); assert.deepEqual(admitted, p.review.candidate); assert.equal(admitted.versions[0].content.run.draws, 5000);
});
