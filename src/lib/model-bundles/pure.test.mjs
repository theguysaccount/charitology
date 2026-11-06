import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { createPureSessionBridgeForTesting } from './pure.mjs';
import { fixtureState, fixtureContent, fixtureSelected, FIXTURE_NOW, sealFixtureVersion } from './test-fixtures.mjs';
import { editorFormFromContent } from './content.mjs';
import { makeBackup, parseBackup, parseSelected } from './graph.mjs';
import { hashValue, parseJsonBytes, canonicalJson, sha256Bytes } from './codec.mjs';
const platform = { createWorker() {
  const worker = new Worker(new URL('./pure-worker.fixture.mjs', import.meta.url)), listeners = new Map();
  return { addEventListener(type, listener) { const wrapped = type === 'message' ? data => listener({ data }) : listener; listeners.set(listener, [type, wrapped]); worker.on(type === 'messageerror' ? 'messageerror' : type, wrapped); },
    removeEventListener(type, listener) { const found = listeners.get(listener); if (found) worker.off(found[0], found[1]); listeners.delete(listener); },
    postMessage(value) { worker.postMessage(value); }, terminate() { void worker.terminate(); } };
}, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: value => clearTimeout(value) };
function owned() {
  let current = true; const controller = new AbortController();
  const job = { epoch: 1, formGeneration: 0, storeGeneration: 1, signal: controller.signal, isCurrent: () => current };
  return { job, stale() { current = false; }, abort() { controller.abort(); } };
}
const context = (job, ids = {}) => ({ job, now: FIXTURE_NOW, newModelId: ids.model ?? null, newVersionId: ids.version ?? null, sourceChecksums: new Map() });
const bindings = review => ({ beforeStateHash: review.beforeStateHash, formGeneration: 0, storeGeneration: 1 });
async function review(bridge, state, command, ownedJob, ids) { const token = await bridge.api.prepareCommand(state, command, context(ownedJob, ids)); return { token, value: bridge.inspectPrepared(token) }; }
test('actual owned selections/comparisons reject forgery/wrong pair and expose matched arrays only after the fixed Node worker', async () => {
  const bridge = createPureSessionBridgeForTesting(platform), owner = owned();
  try {
    const bytes = await fixtureSelected(), a = await bridge.api.admitSelected(bytes), b = await bridge.api.admitSelected(bytes);
    assert.equal(bridge.api.inspectSelected(a).chosenFileSha256, await sha256Bytes(bytes));
    assert.equal(bridge.api.inspectSelected(a).reproduction, 'not-checked-here');
    assert.throws(() => bridge.api.inspectSelected({}), { code: 'selected-handle' });
    const comparison = await bridge.api.recalculate(a, owner.job); bridge.cancelCalculations(); assert.equal(bridge.api.inspectComparison(comparison).kind, 'matched');
    const draws = parseJsonBytes(await bridge.api.makeDraws(comparison)); assert.equal(draws.costs.length, 5000); assert.equal(draws.outcomes.length, 5000);
    const state = await fixtureState();
    await assert.rejects(bridge.api.prepareCommand(state, { kind: 'copy-reproduced', selected: b, comparison }, context(owner.job, { model: 'copy-model', version: 'copy-version' })), { code: 'comparison-selection' });
    const proposal = new TextDecoder().decode(await bridge.api.makeProposal(a)); assert.ok(proposal.startsWith('User-submitted model proposal, not published or independently reviewed\n'));
    assert.match(proposal, /\n    \{/); assert.doesNotMatch(proposal, /fixture-workspace/);
    owner.stale(); assert.throws(() => bridge.api.inspectComparison(comparison), { code: 'stale' }); await assert.rejects(bridge.api.makeDraws(comparison), { code: 'stale' });
  } finally { bridge.dispose(); }
});
test('actual mismatch/refusal comparison permits only acknowledged draft copy and retains copy-time observation through fresh freeze/backup', async () => {
  const bridge = createPureSessionBridgeForTesting(platform), owner = owned();
  try {
    for (const kind of ['mismatched', 'refused']) {
      const selected = await bridge.api.admitSelected(await fixtureSelected(kind)), comparison = await bridge.api.recalculate(selected, owner.job);
      const observation = bridge.api.inspectComparison(comparison); assert.equal(observation.kind, kind === 'refused' ? 'arithmetic-refusal' : 'mismatched');
      await assert.rejects(bridge.api.makeDraws(comparison), { code: 'matched-comparison-required' });
      const state = await fixtureState();
      await assert.rejects(bridge.api.prepareCommand(state, { kind: 'copy-reproduced', selected, comparison }, context(owner.job, { model: 'new-model', version: 'new-version' })), { code: 'matched-comparison-required' });
      const command = { kind: 'copy-selected-draft', selected, comparison, purpose: 'comparison-mismatch-or-refusal', acknowledge: 'Copy inputs to a new draft without a reproduction claim.' };
      await assert.rejects(bridge.api.prepareCommand(state, { ...command, acknowledge: 'verified' }, context(owner.job)), { code: 'copy-acknowledgement' });
      const prepared = await review(bridge, state, command, owner.job); const draftState = prepared.value.candidate;
      assert.equal(draftState.versions.length, 1); assert.equal(draftState.imports.length, 0); assert.deepEqual(draftState.draft.origin.observation, observation);
      bridge.consumePrepared(prepared.token, bindings(prepared.value));
      const draft = structuredClone(draftState.draft); if (kind === 'refused') draft.form.raw.discount = '3';
      const freeze = await review(bridge, draftState, { kind: 'freeze', draft }, owner.job, { model: `new-model-${kind}`, version: `new-version-${kind}` });
      assert.equal(freeze.value.candidate.versions.length, 2); assert.equal(freeze.value.candidate.imports.length, 0);
      const copied = freeze.value.candidate.versions.find(version => version.modelId === `new-model-${kind}`);
      assert.deepEqual(copied.origin.observation, observation);
      const restored = await parseBackup(await makeBackup(freeze.value.candidate, FIXTURE_NOW)); assert.deepEqual(restored.versions.find(version => version.id === copied.id).origin.observation, observation);
    }
  } finally { bridge.dispose(); }
});
test('actual reproduced copy has one first receipt, exact replay no-op and deliberate separate draft branch', async () => {
  const bridge = createPureSessionBridgeForTesting(platform), owner = owned();
  try {
    const selected = await bridge.api.admitSelected(await fixtureSelected()), comparison = await bridge.api.recalculate(selected, owner.job), state = await fixtureState();
    const command = { kind: 'copy-reproduced', selected, comparison };
    const first = await review(bridge, state, command, owner.job, { model: 'copied-model', version: 'copied-version' });
    assert.equal(first.value.candidate.imports.length, 1); assert.equal(first.value.candidate.versions.length, 2);
    const replay = await review(bridge, first.value.candidate, command, owner.job, { model: 'unused-model', version: 'unused-version' });
    assert.equal(replay.value.candidate.revision, first.value.candidate.revision); assert.equal(replay.value.createdVersion, null);
    assert.equal(bridge.consumePrepared(replay.token, bindings(replay.value)).noop, true);
    const branch = await review(bridge, first.value.candidate, { kind: 'copy-selected-draft', selected, comparison, purpose: 'intentional-new-branch', acknowledge: 'Copy inputs to a new draft without a reproduction claim.' }, owner.job);
    assert.equal(branch.value.candidate.draft.mode, 'copy'); assert.equal(branch.value.candidate.imports.length, 1); assert.equal(branch.value.candidate.versions.length, 2);
    const created = await review(bridge, branch.value.candidate, { kind: 'freeze', draft: branch.value.candidate.draft }, owner.job, { model: 'branch-model', version: 'branch-version' });
    assert.equal(created.value.candidate.imports.length, 1); assert.equal(created.value.candidate.versions.length, 3);
  } finally { bridge.dispose(); }
});
test('actual explicit draft navigation derives authored/selected/local origins and forbids target/origin forgery', async () => {
  const bridge = createPureSessionBridgeForTesting(platform), owner = owned();
  try {
    let state = await fixtureState();
    const original = state.versions[0];
    const local = await review(bridge, state, { kind: 'copy-local-draft', sourceModelId: original.modelId, source: { id: original.id, hash: original.hash } }, owner.job);
    const frozen = await review(bridge, local.value.candidate, { kind: 'freeze', draft: local.value.candidate.draft }, owner.job, { model: 'local-copy', version: 'local-copy-version' }); state = frozen.value.candidate;
    const selected = await bridge.api.admitSelected(await fixtureSelected()), comparison = await bridge.api.recalculate(selected, owner.job);
    const copied = await review(bridge, state, { kind: 'copy-reproduced', selected, comparison }, owner.job, { model: 'selected-copy', version: 'selected-copy-version' }); state = copied.value.candidate;
    for (const model of state.models) {
      const source = state.versions.find(version => version.id === model.currentVersionId);
      const amended = await review(bridge, state, { kind: 'amend-draft', sourceModelId: model.id, source: { id: source.id, hash: source.hash }, discardCurrentDraft: true }, owner.job);
      assert.deepEqual(amended.value.candidate.draft.origin, source.origin); assert.equal(amended.value.candidate.draft.form.text.amendmentReason, '');
      const newDraft = await review(bridge, amended.value.candidate, { kind: 'new-draft', discardCurrentDraft: true }, owner.job);
      assert.equal(newDraft.value.candidate.draft.mode, 'new'); assert.equal(newDraft.value.candidate.draft.origin, null); assert.equal(newDraft.value.candidate.versions.length, state.versions.length);
    }
    const forged = structuredClone(state.draft); forged.origin = null; await assert.rejects(bridge.api.prepareCommand(state, { kind: 'save-draft', draft: forged }, context(owner.job)), { code: 'draft-origin-authority' });
    await assert.rejects(bridge.api.prepareCommand(state, { kind: 'new-draft', discardCurrentDraft: false }, context(owner.job)), { code: 'discard-required' });
    await assert.rejects(bridge.api.prepareCommand(state, { kind: 'new-draft', discardCurrentDraft: true }, context(owner.job, { model: 'unused', version: 'unused-version' })), { code: 'unexpected-new-id' });
  } finally { bridge.dispose(); }
});
test('actual prepared handles bind current owned jobs and exact state/generations, consume once and cannot be changed through inspection', async () => {
  const bridge = createPureSessionBridgeForTesting(platform), owner = owned();
  try {
    const state = await fixtureState(), draft = structuredClone(state.draft); draft.form.text.title = 'Literal edited title'; draft.dirty = true;
    const prepared = await review(bridge, state, { kind: 'save-draft', draft }, owner.job);
    assert.throws(() => { prepared.value.candidate.draft.form.text.title = 'Mutation'; }, TypeError);
    const mutable = structuredClone(prepared.value); mutable.candidate.draft.form.text.title = 'Detached change';
    assert.equal(bridge.inspectPrepared(prepared.token).candidate.draft.form.text.title, 'Literal edited title');
    assert.throws(() => bridge.consumePrepared(prepared.token, { ...bindings(prepared.value), storeGeneration: 2 }), { code: 'stale' });
    const consumed = bridge.consumePrepared(prepared.token, bindings(prepared.value)); assert.equal(consumed.candidate.draft.form.text.title, 'Literal edited title');
    assert.throws(() => bridge.consumePrepared(prepared.token, bindings(prepared.value)), { code: 'prepared-handle' });
    const next = await review(bridge, state, { kind: 'save-draft', draft }, owner.job); owner.stale(); assert.throws(() => bridge.inspectPrepared(next.token), { code: 'stale' });
    assert.equal(consumed.candidate.draft.form.text.title, 'Literal edited title'); // Session can retain this exact consumed candidate for deliberate quota Retry after job invalidation.
  } finally { bridge.dispose(); }
});
test('actual freeze no-op/current/ancestor distinctions, fresh append IDs and source-checksum handles stay closed', async () => {
  const bridge = createPureSessionBridgeForTesting(platform), owner = owned();
  try {
    const state = await fixtureState(), same = await review(bridge, state, { kind: 'freeze', draft: state.draft }, owner.job, { version: 'reserved-unused' });
    assert.equal(same.value.candidate.revision, state.revision); assert.equal(same.value.createdVersion, null);
    const draft = structuredClone(state.draft); draft.form.text.title = 'A deliberate amendment'; draft.form.text.amendmentReason = 'Fictional changed title.';
    await assert.rejects(bridge.api.prepareCommand(state, { kind: 'freeze', draft }, context(owner.job)), { code: 'new-id-required' });
    await assert.rejects(bridge.api.prepareCommand(state, { kind: 'freeze', draft }, context(owner.job, { version: state.versions[0].id })), { code: 'owned-id-collision' });
    const changed = await review(bridge, state, { kind: 'freeze', draft }, owner.job, { version: 'version-2' }); assert.equal(changed.value.candidate.versions.length, 2);
    await assert.rejects(bridge.api.prepareCommand(changed.value.candidate, { kind: 'amend-draft', sourceModelId: state.models[0].id,
      source: { id: state.versions[0].id, hash: state.versions[0].hash }, discardCurrentDraft: true }, context(owner.job)), { code: 'stale-head' });
    const stale = structuredClone(state.draft); await assert.rejects(bridge.api.prepareCommand(changed.value.candidate, { kind: 'freeze', draft: stale }, context(owner.job, { version: 'version-3' })), { code: 'draft-target-authority' });
    const back = structuredClone(changed.value.candidate.draft); back.form = await editorFormFromContent(state.versions[0].content, 'Return to an earlier authored content.');
    const reverted = await review(bridge, changed.value.candidate, { kind: 'freeze', draft: back }, owner.job, { version: 'version-3' }); assert.equal(reverted.value.candidate.versions.length, 3);
    assert.equal(reverted.value.candidate.versions.at(-1).contentHash, state.versions[0].contentHash);
    const sourceId = 'local-hash-source', token = await bridge.hashSourceFile(sourceId, new Uint8Array([1, 2, 3]), FIXTURE_NOW, owner.job), checksum = bridge.inspectSourceChecksum(token);
    const withSource = structuredClone(state.draft); withSource.form.text.title = 'Checksum claim'; withSource.form.text.amendmentReason = 'Add a fictional local file description.';
    withSource.form.json.sources = JSON.stringify([{ id: sourceId, title: 'Fictional selected file', publisher: null, url: null, locator: null, published: null, accessedOn: null, access: 'not-shared', license: null, note: 'Background role only.', checksum }]);
    await assert.rejects(bridge.api.prepareCommand(state, { kind: 'freeze', draft: withSource }, context(owner.job, { version: 'checksum-version' })), { code: 'source-checksum-handle' });
    const checkedContext = context(owner.job, { version: 'checksum-version' }); checkedContext.sourceChecksums.set(sourceId, token);
    const checked = await bridge.api.prepareCommand(state, { kind: 'freeze', draft: withSource }, checkedContext); assert.equal(bridge.inspectPrepared(checked).createdVersion.id, 'checksum-version');
    bridge.revokeSourceChecksum(sourceId); assert.throws(() => bridge.inspectSourceChecksum(token), { code: 'source-checksum-handle' });
    const hashPending = bridge.hashSourceFile(sourceId, new Uint8Array([4, 5, 6]), FIXTURE_NOW, owner.job); bridge.revokeSourceChecksum(sourceId);
    await assert.rejects(hashPending, { code: 'stale' });
  } finally { bridge.dispose(); }
});
test('actual queued argument mutation, cancellation and selected/backup revocation cannot manufacture later handles', async () => {
  const bridge = createPureSessionBridgeForTesting(platform), owner = owned();
  try {
    const state = await fixtureState(), draft = structuredClone(state.draft); draft.form.text.title = 'Captured literal'; draft.dirty = true;
    const pending = bridge.api.prepareCommand(state, { kind: 'save-draft', draft }, context(owner.job)); draft.form.text.title = 'Mutated after await';
    const result = await pending; assert.equal(bridge.inspectPrepared(result).candidate.draft.form.text.title, 'Captured literal');
    const bytes = await fixtureSelected(), selected = await bridge.api.admitSelected(bytes), cancelled = bridge.api.recalculate(selected, owner.job);
    owner.abort(); await assert.rejects(cancelled, { code: 'stale' });
    const late = bridge.api.admitSelected(bytes); bridge.revokeSelections(); await assert.rejects(late, { code: 'stale' });
    const fresh = owned(), backup = await bridge.api.admitBackup(await makeBackup(state, FIXTURE_NOW)); bridge.revokeSelections();
    await assert.rejects(bridge.api.prepareCommand(state, { kind: 'restore', backup, discardLocal: true }, context(fresh.job)), { code: 'stale' });
  } finally { bridge.dispose(); }
});
test('actual source-checksum claims distinguish retained immutable history from a restored unfinished new claim', async () => {
  const bridge = createPureSessionBridgeForTesting(platform), restoredBridge = createPureSessionBridgeForTesting(platform), owner = owned();
  try {
    const state = await fixtureState(), newDraft = await review(bridge, state, { kind: 'new-draft', discardCurrentDraft: true }, owner.job);
    const sourceId = 'new-local-source', token = await bridge.hashSourceFile(sourceId, new Uint8Array([8, 9]), FIXTURE_NOW, owner.job), checksum = bridge.inspectSourceChecksum(token);
    const form = structuredClone(await editorFormFromContent(await fixtureContent())); form.json.sources = JSON.stringify([{ id: sourceId, title: 'Fictional private source', publisher: null, url: null,
      locator: null, published: null, accessedOn: null, access: 'not-shared', license: null, note: 'Background role.', checksum }]);
    const draft = { ...newDraft.value.candidate.draft, form, dirty: true };
    const saved = await review(bridge, newDraft.value.candidate, { kind: 'save-draft', draft }, owner.job);
    const restored = await parseBackup(await makeBackup(saved.value.candidate, FIXTURE_NOW));
    await assert.rejects(restoredBridge.api.prepareCommand(restored, { kind: 'freeze', draft: restored.draft }, context(owner.job, { model: 'new-claim', version: 'new-claim-version' })), { code: 'source-checksum-handle' });
    const sourceContext = context(owner.job, { model: 'new-claim', version: 'new-claim-version' }); sourceContext.sourceChecksums.set(sourceId, token);
    const frozen = await bridge.api.prepareCommand(saved.value.candidate, { kind: 'freeze', draft }, sourceContext), frozenState = bridge.inspectPrepared(frozen).candidate;
    bridge.invalidate(); const edit = structuredClone(frozenState.draft); edit.form.text.title = 'Unrelated text edit'; edit.form.text.amendmentReason = 'Retain the historical file description.';
    const amended = await review(bridge, frozenState, { kind: 'freeze', draft: edit }, owner.job, { version: 'historical-claim-amendment' });
    assert.deepEqual(amended.value.candidate.versions.find(version => version.id === 'historical-claim-amendment').content.sources[0].checksum, checksum);
  } finally { bridge.dispose(); restoredBridge.dispose(); }
});
test('actual backup/Undo handles are session-owned, generation-bound, one-use and reset on lifecycle invalidation', async () => {
  const bridge = createPureSessionBridgeForTesting(platform), other = createPureSessionBridgeForTesting(platform), owner = owned();
  try {
    const state = await fixtureState(), bytes = await makeBackup(state, FIXTURE_NOW), backup = await bridge.api.admitBackup(bytes);
    await assert.rejects(other.api.prepareCommand(state, { kind: 'restore', backup, discardLocal: true }, context(owner.job)), { code: 'backup-handle' });
    const restored = await review(bridge, state, { kind: 'restore', backup, discardLocal: true }, owner.job); assert.deepEqual(restored.value.candidate, state);
    const beforeStateHash = await hashValue('state', state), undo = bridge.registerUndo(state, { beforeStateHash, storeGeneration: 1, formGeneration: 0 });
    const result = await review(bridge, state, { kind: 'undo', undo }, owner.job); assert.deepEqual(result.value.candidate, state);
    const repeated = await review(bridge, state, { kind: 'undo', undo }, owner.job); assert.deepEqual(repeated.value.candidate, state);
    bridge.consumePrepared(result.token, bindings(result.value));
    assert.throws(() => bridge.consumePrepared(repeated.token, bindings(repeated.value)), { code: 'undo-handle' });
    await assert.rejects(bridge.api.prepareCommand(state, { kind: 'undo', undo }, context(owner.job)), { code: 'undo-handle' });
    const selected = await bridge.api.admitSelected(await fixtureSelected()); bridge.invalidate(); assert.throws(() => bridge.api.inspectSelected(selected), { code: 'stale' });
    await assert.rejects(bridge.api.prepareCommand(state, { kind: 'restore', backup, discardLocal: true }, context(owner.job)), { code: 'stale' });
  } finally { bridge.dispose(); other.dispose(); }
});
test('actual cancellation during pre-worker admission never starts a stale freeze worker after its held native hash settles', async () => {
  const state = await fixtureState(), owner = owned(); let workers = 0, release, enter;
  const held = new Promise(resolve => { release = resolve; }), entered = new Promise(resolve => { enter = resolve; });
  const bridge = createPureSessionBridgeForTesting({ ...platform, createWorker() { workers++; return platform.createWorker(); } });
  const subtle = globalThis.crypto.subtle, nativeDigest = subtle.digest; let first = true;
  subtle.digest = function (...args) { const actual = nativeDigest.apply(this, args); if (!first) return actual; first = false; enter(); return Promise.all([actual, held]).then(([result]) => result); };
  try {
    const pending = bridge.api.prepareCommand(state, { kind: 'freeze', draft: state.draft }, context(owner.job, { version: 'reserved-stale' }));
    const refused = assert.rejects(pending, { code: 'stale' }); await entered; bridge.revokeSelections();
    assert.equal(workers, 0); assert.equal(bridge.payload.snapshot().busy, true); release(); await refused; assert.equal(workers, 0);
  } finally { release(); subtle.digest = nativeDigest; bridge.dispose(); }
});
