import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createModelFileLaneForTesting } from './file-lane.mjs';
import { createPureSessionBridge, createPureSessionBridgeForTesting } from './pure.mjs';
import { fixtureSelected, fixtureState, FIXTURE_NOW } from './test-fixtures.mjs';
import { makeBackup } from './graph.mjs';
import { LIMITS } from './codec.mjs';

const turn = () => new Promise(resolve => setImmediate(resolve));
const waitFor = async test => { const until = performance.now() + 5000; while (!test()) {
  if (performance.now() > until) throw new Error('Actual file-lane condition deadline exceeded.');
  await new Promise(resolve => setTimeout(resolve, 1));
} };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function threadBridge() {
  const workers = [];
  const bridge = createPureSessionBridgeForTesting({ createWorker() {
    const native = new Worker(new URL('./pure-worker.fixture.mjs', import.meta.url)), handlers = new Map();
    const worker = { terminated: 0, messages: [], addEventListener(type, fn) { handlers.set(type, fn); },
      removeEventListener(type, fn) { if (handlers.get(type) === fn) handlers.delete(type); },
      postMessage(value) { native.postMessage(value); }, terminate() { worker.terminated++; void native.terminate(); } };
    native.on('message', data => { worker.messages.push(data); handlers.get('message')?.({ data }); });
    native.on('error', error => handlers.get('error')?.({ error })); workers.push(worker); return worker;
  }, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) });
  return { bridge, workers };
}
const source = (sourceId = 'source-a', hashedAt = FIXTURE_NOW) => ({ kind: 'checksum', sourceId, hashedAt });
function owned() {
  const controller = new AbortController(); let current = true;
  return { job: { epoch: 1, formGeneration: 0, storeGeneration: 1, signal: controller.signal, isCurrent: () => current },
    abort: () => controller.abort(), stale: () => { current = false; } };
}
/** Native FileReader event model only. Real File bytes and all product admission/hash functions remain actual. */
function harness({ automatic = true, unavailable = false, actualBridge = null } = {}) {
  const bytes = new WeakMap(), readers = [], timers = new Map(); let timerId = 0, reading = 0, maxReading = 0;
  const file = (body, name = 'private-file-name.txt', type = 'image/not-json') => {
    const value = new File([body], name, { type }); bytes.set(value, new Uint8Array(body));
    // Product must never call the nonabortable convenience read.
    value.arrayBuffer = () => { throw new Error('File.arrayBuffer must never be called by the production lane'); };
    return value;
  };
  class Reader {
    constructor() { this.onload = this.onerror = this.onabort = null; this.result = null; this.aborted = 0; this.busy = false; readers.push(this); }
    readAsArrayBuffer(file) {
      assert.equal(this.busy, false); this.file = file; this.busy = true; reading++; maxReading = Math.max(maxReading, reading);
      this.retained = { load: this.onload, error: this.onerror, abort: this.onabort };
      if (automatic) queueMicrotask(() => { if (this.busy) this.load(); });
    }
    load(result = bytes.get(this.file).slice().buffer) {
      if (this.busy) { this.busy = false; reading--; }
      this.result = result; this.onload?.({ target: this });
    }
    abort() {
      this.aborted++;
      assert.equal(this.onload, null); assert.equal(this.onerror, null); assert.equal(this.onabort, null);
      assert.equal(timers.size, 0, 'deadline must be cleared before physical abort');
      if (this.busy) { this.busy = false; reading--; }
    }
  }
  const bridge = actualBridge ?? createPureSessionBridge();
  const lane = createModelFileLaneForTesting(bridge, {
    createReader: () => unavailable ? null : new Reader(),
    setTimeout: (fn, ms) => { assert.equal(ms, 30000); timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id),
  });
  return { lane, bridge, file, readers, timers, maxReading: () => maxReading,
    timeout() { const fn = [...timers.values()][0]; assert.ok(fn); fn(); },
    close() { lane.dispose(); bridge.dispose(); } };
}
test('actual complete selected/backup codecs return only same-session opaque handles, independent of file extension/MIME/name', async () => {
  const h = harness();
  try {
    const bytes = await fixtureSelected(), selected = await h.lane.choose([h.file(bytes, 'not-a-model.pdf')], { kind: 'selected' }, owned().job);
    assert.equal(selected.kind, 'selected'); assert.equal(selected.inspection.chosenFileSha256, sha(bytes));
    assert.deepEqual(h.bridge.api.inspectSelected(selected.handle), selected.inspection);
    assert.equal(Object.hasOwn(selected, 'file'), false); assert.doesNotMatch(JSON.stringify(selected), /not-a-model|private-file-name/);
    assert.throws(() => h.bridge.api.inspectSelected({}), { code: 'selected-handle' });
    const state = await fixtureState(), backupBytes = await makeBackup(state, FIXTURE_NOW);
    const backup = await h.lane.choose([h.file(backupBytes)], { kind: 'backup' }, owned().job);
    assert.equal(backup.kind, 'backup'); assert.throws(() => h.bridge.api.inspectSelected(selected.handle), { code: 'stale' });
    const prepared = await h.bridge.api.prepareCommand(state, { kind: 'restore', backup: backup.handle, discardLocal: true },
      { job: owned().job, now: FIXTURE_NOW, newModelId: null, newVersionId: null, sourceChecksums: new Map() });
    assert.deepEqual(h.bridge.inspectPrepared(prepared).candidate, state);
    assert.deepEqual(h.lane.snapshot(), { pending: false, reading: false, payloadBusy: false, queued: false });
  } finally { h.close(); }
});
test('whole native bytes exactly at both 2MiB caps admit; +1 refuses before a reader is created', async () => {
  const h = harness();
  try {
    for (const [kind, original] of [['selected', await fixtureSelected()], ['backup', await makeBackup(await fixtureState(), FIXTURE_NOW)]]) {
      const exact = new Uint8Array(LIMITS[kind]); exact.fill(32); exact.set(original);
      assert.equal((await h.lane.choose([h.file(exact)], { kind }, owned().job)).kind, kind);
      const count = h.readers.length;
      assert.equal((await h.lane.choose([h.file(new Uint8Array(LIMITS[kind] + 1))], { kind }, owned().job)).code, 'file-size');
      assert.equal(h.readers.length, count);
    }
  } finally { h.close(); }
});
test('actual zero and 8MiB checksum files bind exact source/date/bytes; +1 and spoofed own size refuse before reading', async () => {
  const h = harness();
  try {
    for (const size of [0, LIMITS.checksumFile]) {
      const body = new Uint8Array(size); if (size) body[size - 1] = 99;
      const result = await h.lane.choose([h.file(body)], source('source-a'), owned().job);
      assert.equal(result.kind, 'checksum'); assert.equal(result.sourceId, 'source-a');
      assert.deepEqual(result.checksum, { kind: 'local-bytes', sha256: sha(body), byteLength: size, hashedAt: FIXTURE_NOW });
      assert.deepEqual(h.bridge.inspectSourceChecksum(result.handle), result.checksum);
    }
    const count = h.readers.length, over = h.file(new Uint8Array(LIMITS.checksumFile + 1)); Object.defineProperty(over, 'size', { value: 0 });
    assert.equal((await h.lane.choose([over], source(), owned().job)).code, 'file-size'); assert.equal(h.readers.length, count);
  } finally { h.close(); }
});
test('completed per-source proofs survive another source while same-source invalid replacement revokes its exact proof', async () => {
  const h = harness();
  try {
    const a = await h.lane.choose([h.file(new Uint8Array([1]))], source('source-a'), owned().job);
    const b = await h.lane.choose([h.file(new Uint8Array([2]))], source('source-b', '2026-10-29T00:00:00.000Z'), owned().job);
    assert.deepEqual(h.bridge.inspectSourceChecksum(a.handle), a.checksum); assert.deepEqual(h.bridge.inspectSourceChecksum(b.handle), b.checksum);
    assert.equal((await h.lane.choose([], source('source-b'), owned().job)).code, 'invalid-file');
    assert.throws(() => h.bridge.inspectSourceChecksum(b.handle), { code: 'source-checksum-handle' });
    assert.deepEqual(h.bridge.inspectSourceChecksum(a.handle), a.checksum);
    const c = await h.lane.choose([h.file(new Uint8Array([3]))], source('source-c'), owned().job);
    assert.equal((await h.lane.choose([], source('source-c', 'invalid-date'), owned().job)).code, 'invalid-request');
    assert.throws(() => h.bridge.inspectSourceChecksum(c.handle), { code: 'source-checksum-handle' });
    h.bridge.revokeSourceChecksum('source-a'); assert.throws(() => h.bridge.inspectSourceChecksum(a.handle), { code: 'source-checksum-handle' });
  } finally { h.close(); }
});
test('every empty/multiple/nonFile/oversized/invalid choice detaches and aborts held A before inspecting replacement; retained callbacks stay inert', async () => {
  const h = harness({ automatic: false });
  try {
    const file = h.file(new Uint8Array([1]));
    for (const [files, operation] of [[[], source()], [[file, file], source()], [[{ size: 1 }], source()], [[h.file(new Uint8Array(LIMITS.selected + 1))], { kind: 'selected' }], [[file], { kind: 'other' }]]) {
      const a = h.lane.choose([file], source(), owned().job), reader = h.readers.at(-1), retained = reader.retained;
      const replacement = await h.lane.choose(files, operation, owned().job);
      assert.equal(replacement.kind, 'refused'); assert.equal((await a).kind, 'cancelled'); assert.equal(reader.aborted, 1);
      reader.result = new ArrayBuffer(1); retained.load(); retained.error(); retained.abort(); await turn();
      assert.equal(h.lane.snapshot().pending, false); assert.equal(h.lane.snapshot().reading, false);
    }
    assert.equal(h.maxReading(), 1);
  } finally { h.close(); }
});
test('A→B native read replacement starts only B after actual detach/abort and cannot deliver A late error or load', async () => {
  const h = harness({ automatic: false });
  try {
    const a = h.lane.choose([h.file(new Uint8Array([1]))], source(), owned().job), readerA = h.readers[0];
    const b = h.lane.choose([h.file(new Uint8Array([2]))], source('source-b'), owned().job);
    assert.equal((await a).kind, 'cancelled'); await waitFor(() => h.readers.length === 2);
    readerA.result = new ArrayBuffer(1); readerA.retained.error(); readerA.retained.load();
    h.readers[1].load(); const result = await b; assert.equal(result.kind, 'checksum'); assert.equal(result.checksum.sha256, sha(new Uint8Array([2])));
    assert.equal(h.maxReading(), 1);
  } finally { h.close(); }
});
test('even an empty new file choice terminates the actual same-session fixed calculation worker and revokes its selected handle', async () => {
  const workers = [];
  const bridge = createPureSessionBridgeForTesting({ createWorker() {
    const native = new Worker(new URL('./pure-worker.fixture.mjs', import.meta.url)), handlers = new Map();
    const worker = { terminated: 0, messages: [], addEventListener(type, fn) { handlers.set(type, fn); },
      removeEventListener(type, fn) { if (handlers.get(type) === fn) handlers.delete(type); },
      postMessage(value) { native.postMessage(value); }, terminate() { worker.terminated++; void native.terminate(); } };
    native.on('message', data => worker.messages.push(data)); native.on('error', error => handlers.get('error')?.({ error }));
    workers.push(worker); return worker;
  }, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) });
  const h = harness({ actualBridge: bridge });
  try {
    const selected = await h.lane.choose([h.file(await fixtureSelected())], { kind: 'selected' }, owned().job);
    const run = bridge.api.recalculate(selected.handle, owned().job); const rejected = assert.rejects(run, { code: 'stale' });
    await waitFor(() => workers[0]?.messages.length);
    assert.equal((await h.lane.choose([], { kind: 'selected' }, owned().job)).code, 'invalid-file');
    await rejected; assert.equal(workers[0].terminated, 1);
    assert.throws(() => bridge.api.inspectSelected(selected.handle), { code: 'stale' });
  } finally { h.close(); for (const worker of workers) if (!worker.terminated) worker.terminate(); }
});
test('native cancel, explicit recovery/foreign-change revoke, signal and dispose abort/detach read and reject stale delivery once', async () => {
  for (const action of ['native-cancel', 'explicit-cancel', 'recovery', 'foreign-change', 'signal', 'dispose']) {
    const h = harness({ automatic: false }), owner = owned();
    try {
      const pending = h.lane.choose([h.file(new Uint8Array([1]))], source(), owner.job), reader = h.readers[0];
      if (action === 'signal') owner.abort(); else if (action === 'dispose') h.lane.dispose(); else h.lane.revoke();
      assert.deepEqual(await pending, { kind: 'cancelled' }); assert.equal(reader.aborted, 1);
      reader.retained.load(); reader.retained.error(); await turn(); assert.equal(h.lane.snapshot().payloadBusy, false);
      if (action === 'dispose') assert.equal((await h.lane.choose([], source(), owned().job)).kind, 'cancelled');
    } finally { h.close(); }
  }
});
test('owned 30s native read deadline clears timer and handlers before abort; late error never changes the result', async () => {
  const h = harness({ automatic: false });
  try {
    const pending = h.lane.choose([h.file(new Uint8Array([1]))], source(), owned().job), reader = h.readers[0];
    h.timeout(); const result = await pending; assert.equal(result.code, 'timeout'); assert.equal(reader.aborted, 1);
    reader.retained.error(); reader.retained.load(); await turn(); assert.equal(h.lane.snapshot().payloadBusy, false); assert.equal(h.timers.size, 0);
  } finally { h.close(); }
});
test('load admits only actual exact-size ArrayBuffer and complete fatal UTF8/DTO; native errors stay bounded and private', async () => {
  const h = harness({ automatic: false });
  try {
    const disguised = new ArrayBuffer(2); Object.defineProperty(disguised, 'byteLength', { value: 1 });
    for (const result of [null, new Uint8Array([1]), new ArrayBuffer(0), new ArrayBuffer(2), disguised]) {
      const pending = h.lane.choose([h.file(new Uint8Array([1]))], source(), owned().job); await waitFor(() => h.lane.snapshot().reading);
      h.readers.at(-1).load(result); assert.equal((await pending).code, 'byte-mismatch');
    }
    for (const body of [new Uint8Array([0xff]), new TextEncoder().encode('{"unrecognized":true}'), new TextEncoder().encode('{}')]) {
      const pending = h.lane.choose([h.file(body)], { kind: 'selected' }, owned().job); await waitFor(() => h.lane.snapshot().reading);
      h.readers.at(-1).load(); assert.equal((await pending).code, 'invalid-data');
    }
    const error = h.lane.choose([h.file(new Uint8Array([1]))], source(), owned().job); await waitFor(() => h.lane.snapshot().reading);
    h.readers.at(-1).onerror({ error: new Error('private body/path must not escape') }); assert.equal((await error).code, 'read-failed');
  } finally { h.close(); }
});
test('unavailable reader and malformed/stale jobs cannot fall back to File.arrayBuffer or copy stale authority', async () => {
  const h = harness({ unavailable: true });
  try {
    const file = h.file(new Uint8Array([1])); assert.equal((await h.lane.choose([file], source(), owned().job)).code, 'unavailable');
    for (const bad of [{}, { ...owned().job, storeGeneration: 0 }, { ...owned().job, isCurrent: null }])
      assert.equal((await h.lane.choose([file], source(), bad)).code, 'invalid-job');
    const owner = owned(); owner.stale(); assert.equal((await h.lane.choose([file], source(), owner.job)).kind, 'cancelled');
    const throwing = { ...owned().job, isCurrent: () => { throw new Error('private field'); } };
    assert.equal((await h.lane.choose([file], source(), throwing)).kind, 'cancelled');
  } finally { h.close(); }
});
test('checksum snapshots exact source/date and generations before read; changed owner cannot receive a handle', async () => {
  const h = harness({ automatic: false });
  try {
    const op = source(), owner = owned(), pending = h.lane.choose([h.file(new Uint8Array([1]))], op, owner.job);
    op.sourceId = 'changed-source'; op.hashedAt = '2026-10-29T00:00:00.000Z'; h.readers[0].load();
    const result = await pending; assert.equal(result.sourceId, 'source-a'); assert.equal(result.checksum.hashedAt, FIXTURE_NOW);
    const next = h.lane.choose([h.file(new Uint8Array([2]))], source(), owner.job); await waitFor(() => h.lane.snapshot().reading);
    owner.job.formGeneration++; h.readers.at(-1).load(); assert.equal((await next).kind, 'cancelled');
    assert.throws(() => h.bridge.inspectSourceChecksum(result.handle), { code: 'source-checksum-handle' });
  } finally { h.close(); }
});
test('real nonabortable digest retains occupied payload lane after revoke; only latest queued File starts after stale error settles', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto'), native = globalThis.crypto;
  let release, entered = false, calls = 0, inFlight = 0, maximum = 0;
  const hold = new Promise(resolve => { release = resolve; });
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { subtle: { digest: async (...args) => {
    calls++; inFlight++; maximum = Math.max(maximum, inFlight);
    try { const result = await native.subtle.digest(...args); if (calls === 1) { entered = true; await hold; throw new Error('private stale digest error'); } return result; }
    finally { inFlight--; }
  } } } });
  const h = harness();
  try {
    const a = h.lane.choose([h.file(new Uint8Array([1]))], source(), owned().job); await waitFor(() => entered);
    const b = h.lane.choose([h.file(new Uint8Array([2]))], source('source-b'), owned().job);
    assert.equal((await a).kind, 'cancelled'); assert.equal(h.lane.snapshot().payloadBusy, true); assert.equal(h.readers.length, 1);
    assert.equal((await h.lane.choose([], source(), owned().job)).code, 'invalid-file'); assert.equal((await b).kind, 'cancelled');
    const fileC = h.file(new Uint8Array([3])), c = h.lane.choose([fileC], source('source-c'), owned().job);
    assert.equal(h.readers.length, 1); release();
    const result = await c; assert.equal(result.kind, 'checksum'); assert.equal(result.checksum.sha256, sha(new Uint8Array([3])));
    assert.equal(h.readers.length, 2); assert.equal(h.readers[1].file, fileC); assert.equal(maximum, 1);
  } finally { release(); h.close(); Object.defineProperty(globalThis, 'crypto', original); }
});
test('digest and queued deadlines revoke delivery without falsely releasing a hung physical digest slot', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto'), native = globalThis.crypto; let release, entered = false;
  const hold = new Promise(resolve => { release = resolve; });
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { subtle: { digest: async (...args) => {
    const value = await native.subtle.digest(...args); entered = true; await hold; return value;
  } } } });
  const h = harness();
  try {
    const a = h.lane.choose([h.file(new Uint8Array([1]))], source(), owned().job); await waitFor(() => entered); h.timeout();
    assert.equal((await a).code, 'timeout'); assert.equal(h.lane.snapshot().payloadBusy, true);
    const b = h.lane.choose([h.file(new Uint8Array([2]))], source('source-b'), owned().job); h.timeout();
    assert.equal((await b).code, 'timeout'); assert.equal(h.readers.length, 1); assert.equal(h.lane.snapshot().payloadBusy, true);
    release(); await waitFor(() => !h.lane.snapshot().payloadBusy); assert.equal(h.readers.length, 1);
  } finally { release(); h.close(); Object.defineProperty(globalThis, 'crypto', original); }
});
test('same-bridge cancelled reproduction hash keeps new file physically unread until its actual nested native SHA settles', async () => {
  const threads = threadBridge(), h = harness({ actualBridge: threads.bridge });
  const selected = await h.lane.choose([h.file(await fixtureSelected())], { kind: 'selected' }, owned().job);
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto'), native = globalThis.crypto;
  let release, entered = false, inFlight = 0, maximum = 0, holdOnce = true;
  const hold = new Promise(resolve => { release = resolve; });
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { subtle: { digest: async (...args) => {
    inFlight++; maximum = Math.max(maximum, inFlight);
    try { const value = await native.subtle.digest(...args);
      if (holdOnce && new TextDecoder().decode(args[1]).startsWith('charitology-model-bundles/v1/input\n')) { holdOnce = false; entered = true; await hold; }
      return value;
    } finally { inFlight--; }
  } } } });
  try {
    const run = h.bridge.api.recalculate(selected.handle, owned().job); const rejected = assert.rejects(run, { code: 'stale' });
    await waitFor(() => entered); const readers = h.readers.length;
    const checksum = h.lane.choose([h.file(new Uint8Array([9]))], source(), owned().job);
    await turn(); await rejected;
    assert.equal(h.readers.length, readers); assert.equal(h.bridge.payload.snapshot().busy, true);
    release(); const result = await checksum; assert.equal(result.kind, 'checksum'); assert.equal(result.checksum.sha256, sha(new Uint8Array([9])));
    assert.equal(maximum, 1); assert.equal(h.readers.length, readers + 1);
  } finally { release(); h.close(); Object.defineProperty(globalThis, 'crypto', original); for (const worker of threads.workers) if (!worker.terminated) worker.terminate(); }
});
test('same-bridge cancelled file SHA blocks complete freeze preparation and worker creation until actual digest settles', async () => {
  const threads = threadBridge(), h = harness({ actualBridge: threads.bridge }), state = await fixtureState();
  const draft = structuredClone(state.draft); draft.form.text.title = 'Deliberate fictional amendment'; draft.form.text.amendmentReason = 'Software acceptance.'; draft.dirty = true;
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto'), native = globalThis.crypto;
  let release, entered = false, inFlight = 0, maximum = 0, once = true;
  const hold = new Promise(resolve => { release = resolve; });
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { subtle: { digest: async (...args) => {
    inFlight++; maximum = Math.max(maximum, inFlight);
    try { const value = await native.subtle.digest(...args); if (once) { once = false; entered = true; await hold; } return value; }
    finally { inFlight--; }
  } } } });
  try {
    const checksum = h.lane.choose([h.file(new Uint8Array([7]))], source(), owned().job); await waitFor(() => entered);
    h.lane.revoke(); assert.equal((await checksum).kind, 'cancelled');
    const prepared = h.bridge.api.prepareCommand(state, { kind: 'freeze', draft }, { job: owned().job, now: FIXTURE_NOW,
      newModelId: null, newVersionId: 'new-actual-version', sourceChecksums: new Map() });
    await turn(); assert.equal(threads.workers.length, 0); assert.equal(inFlight, 1);
    release(); const handle = await prepared;
    assert.equal(h.bridge.inspectPrepared(handle).createdVersion.id, 'new-actual-version'); assert.equal(threads.workers.length, 1); assert.equal(maximum, 1);
  } finally { release(); h.close(); Object.defineProperty(globalThis, 'crypto', original); for (const worker of threads.workers) if (!worker.terminated) worker.terminate(); }
});
test('post-worker comparison fingerprint remains inside the same physical lease through a newer file choice', async () => {
  const threads = threadBridge(), h = harness({ actualBridge: threads.bridge });
  const selected = await h.lane.choose([h.file(await fixtureSelected())], { kind: 'selected' }, owned().job), owner = owned();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto'), native = globalThis.crypto;
  let release, entered = false, inFlight = 0, maximum = 0, runHashes = 0;
  const hold = new Promise(resolve => { release = resolve; });
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { subtle: { digest: async (...args) => {
    inFlight++; maximum = Math.max(maximum, inFlight);
    try { const value = await native.subtle.digest(...args);
      if (new TextDecoder().decode(args[1]).startsWith('charitology-model-bundles/v1/run\n') && ++runHashes === 2) { entered = true; await hold; }
      return value;
    } finally { inFlight--; }
  } } } });
  try {
    const run = h.bridge.api.recalculate(selected.handle, owner.job); const rejected = assert.rejects(run, { code: 'stale' });
    await waitFor(() => entered); owner.stale(); const readers = h.readers.length;
    const checksum = h.lane.choose([h.file(new Uint8Array([5]))], source(), owned().job);
    await turn(); assert.equal(h.readers.length, readers); assert.equal(inFlight, 1);
    release(); await rejected; assert.equal((await checksum).kind, 'checksum'); assert.equal(maximum, 1);
  } finally { release(); h.close(); Object.defineProperty(globalThis, 'crypto', original); for (const worker of threads.workers) if (!worker.terminated) worker.terminate(); }
});
test('actual file-lane declarations compile strictly against concrete pure handles and owned jobs without export shims', async () => {
  const root = fileURLToPath(new URL('../../..', import.meta.url)), temporary = await mkdtemp(join(root, 'node_modules/.mb-file-types-'));
  try {
    const fixture = `import {createModelFileLane} from '${root}/src/lib/model-bundles/file-lane.mjs';
import {createPureSessionBridge} from '${root}/src/lib/model-bundles/pure.mjs';
import type {ModelFileBridge} from '${root}/src/lib/model-bundles/file-lane.mjs';
import type {OwnedJob,AdmittedSelected,AdmittedBackup,SourceChecksumHandle} from '${root}/src/lib/model-bundles/types.js';
declare const files:FileList;declare const job:OwnedJob;const bridge=createPureSessionBridge();
const restricted:ModelFileBridge={api:bridge.api,payload:bridge.payload,admitFile:bridge.admitFile,hashSourceFile:bridge.hashSourceFile,inspectSourceChecksum:bridge.inspectSourceChecksum,revokeSourceChecksum:bridge.revokeSourceChecksum,revokeSelections:bridge.revokeSelections};
const lane=createModelFileLane(restricted);
async function check(){const value=await lane.choose(files,{kind:'selected'},job);
if(value.kind==='selected'){const actual:AdmittedSelected=value.handle;void actual;}
if(value.kind==='backup'){const actual:AdmittedBackup=value.handle;void actual;}
if(value.kind==='checksum'){const actual:SourceChecksumHandle=value.handle;void actual;}}
void check;lane.revoke();lane.dispose();`;
    const file = join(temporary, 'actual.ts'); await writeFile(file, fixture);
    const result = spawnSync(process.execPath, ['node_modules/typescript/lib/tsc.js', '--strict', '--noEmit', '--skipLibCheck', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--lib', 'ES2022,DOM,DOM.Iterable', file], { cwd: root, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stdout + result.stderr);
    const source = await readFile(new URL('./file-lane.mjs', import.meta.url), 'utf8'); assert.doesNotMatch(source, /\.arrayBuffer\(|Promise\.race|JSON\.parse/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
