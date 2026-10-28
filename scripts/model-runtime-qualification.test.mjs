import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Worker } from 'node:worker_threads';
import { loadRuntimeObservations, validateRuntimeObservations, selectRuntimeProfile, runtimeIdentity,
  observeRuntimeGolden, qualifyModelRuntime, runtimeDifferences } from './model-runtime-qualification.mjs';
import { knownGoldenVectors, knownEngine, verifyGoldenVectors } from '../src/lib/model-bundles/registry.mjs';
import { hashValue, sha256Bytes } from '../src/lib/model-bundles/codec.mjs';
import { parseSelected } from '../src/lib/model-bundles/graph.mjs';
import { fixtureSelected, fixtureState, FIXTURE_NOW } from '../src/lib/model-bundles/test-fixtures.mjs';
import { createPureSessionBridgeForTesting } from '../src/lib/model-bundles/pure.mjs';

const execute = promisify(execFile), root = fileURLToPath(new URL('../', import.meta.url));
const selectedPath = new URL('./fixtures/model-runtime-macos-arm64-selected-v1.json', import.meta.url);
const fixtureHash = 'c89e562a7a068ea6b8c340f997f1e2eeda632f377dda4d3dce93d02c382fdc5e';
const clone = value => structuredClone(value);
test('closed CI fixture retains every reference case and only the six measured Linux hashes', async () => {
  const fixture = await loadRuntimeObservations(), reference = knownGoldenVectors();
  assert.equal(fixture.profiles.length, 2); assert.equal(reference.cases.length, 19);
  assert.deepEqual(fixture.profiles[0].cases, reference.cases);
  const linux = { ...reference, cases: fixture.profiles[1].cases }, differences = runtimeDifferences(reference, linux);
  assert.equal(differences.length, 6);
  assert.deepEqual(differences.map(item => item.path), [0, 1, 2].flatMap(index => [
    `$.cases[${index}].expected.costsSha256`, `$.cases[${index}].expected.outcomesSha256`]));
  assert.equal(await hashValue('golden', linux), '323c9e0d6985e11c42589acaa1ca0b3ac7000222c7e5a5a9ff74a639014d6073');
  assert.equal(await hashValue('golden', reference), fixture.referenceGoldenHash);
  assert.ok(Object.isFrozen(fixture.profiles[1].cases[0].expected));
});
test('missing, extra, changed and coherently resealed evidence cannot redefine the closed observations', async () => {
  const original = await loadRuntimeObservations();
  const mutations = [
    f => { f.extra = true; }, f => { f.profiles.pop(); }, f => { f.profiles.push(clone(f.profiles[0])); },
    f => { f.sourceFiles[0].sha256 = '0'.repeat(64); }, f => { f.enginePin.definitionHash = '0'.repeat(64); },
    f => { f.profiles[1].runtime.node = 'v24.22.2'; }, f => { f.profiles[1].runtime.extra = 'linux'; },
    f => { f.profiles[1].cases.pop(); }, f => { f.profiles[1].cases[0].input.seed = 2; },
    f => { f.profiles[1].cases[0].raw.name = 'Changed'; },
    f => { f.profiles[1].cases[0].expected.outcome.p5.value += 1; },
    f => { f.profiles[1].cases[12].issue.path = 'discount.power'; },
    f => { delete f.profiles[1].cases[0].expected.costsSha256; },
    f => { f.profiles[1].cases[0].expected.costsSha256 = f.profiles[0].cases[0].expected.costsSha256; },
  ];
  for (const change of mutations) {
    const altered = clone(original); change(altered);
    await assert.rejects(validateRuntimeObservations(altered), { code: 'fixture-invalid' });
  }
  const resealed = clone(original); resealed.profiles[1].cases[0].expected.costsSha256 = '0'.repeat(64);
  resealed.profiles[1].observedGoldenHash = await hashValue('golden', { ...knownGoldenVectors(), cases: resealed.profiles[1].cases });
  await assert.rejects(validateRuntimeObservations(resealed), { code: 'fixture-invalid' });
});
test('all four runtime identity fields select evidence exactly; uncharacterized runtimes fail with a recovery instruction', async () => {
  const fixture = await loadRuntimeObservations(), actual = runtimeIdentity();
  assert.deepEqual(selectRuntimeProfile(fixture).runtime, actual);
  for (const key of ['platform', 'arch', 'node', 'v8']) {
    assert.throws(() => selectRuntimeProfile(fixture, { ...actual, [key]: 'uncharacterized' }), error =>
      error.code === 'unknown-profile' && /pinned CI release/.test(error.message) && /do not edit v1 goldens/.test(error.message));
  }
  assert.throws(() => selectRuntimeProfile(fixture, { ...actual, extra: true }), { code: 'unknown-profile' });
});
test('actual current runtime evaluates all 19 cases and keeps strict reference mismatch separate from qualification', async () => {
  const fixture = await loadRuntimeObservations(), profile = selectRuntimeProfile(fixture), actual = await observeRuntimeGolden();
  assert.deepEqual(actual.cases, profile.cases);
  const result = await qualifyModelRuntime(); assert.equal(result.evaluatedCases, 19);
  assert.equal(result.referenceCompatible, profile.referenceCompatible);
  assert.equal(result.referenceMatchedCases, profile.referenceCompatible ? 19 : 16);
  assert.equal(result.observedGoldenHash, profile.observedGoldenHash);
  if (profile.referenceCompatible) assert.equal((await verifyGoldenVectors()).cases, 19);
  else {
    await assert.rejects(verifyGoldenVectors(), { code: 'golden-runtime-mismatch' });
    assert.match(result.message, /not 19 reproduced/);
    assert.deepEqual(result.cases.slice(0, 3).map(item => item.differences), Array(3).fill(['$.expected.costsSha256', '$.expected.outcomesSha256']));
    assert.ok(result.cases.slice(3).every(item => item.differences.length === 0));
  }
});
test('actual qualification CLI refuses alternate arguments and reports an honest measured profile', async () => {
  const entry = fileURLToPath(new URL('./check-model-runtime.mjs', import.meta.url));
  const result = await execute(process.execPath, [entry], { cwd: root, timeout: 30000, maxBuffer: 8192 });
  const report = JSON.parse(result.stdout); assert.equal(report.evaluatedCases, 19); assert.equal(result.stderr, '');
  assert.equal(report.referenceCompatible, selectRuntimeProfile(await loadRuntimeObservations()).referenceCompatible);
  await assert.rejects(execute(process.execPath, [entry, '--profile=darwin'], { cwd: root, timeout: 30000 }), error => error.code === 2 && /actual runtime selects/.test(error.stderr));
});
async function invoke(file) {
  const entry = fileURLToPath(new URL('./verify-model-bundle.mjs', import.meta.url));
  try { const result = await execute(process.execPath, [entry, file, '--json'], { cwd: root, timeout: 10000, maxBuffer: 8192 }); return { code: 0, report: JSON.parse(result.stdout), stderr: result.stderr }; }
  catch (error) { if (!Number.isInteger(error.code)) throw error; return { code: error.code, report: JSON.parse(error.stdout), stderr: error.stderr }; }
}
test('actual immutable Mac selected file reports exact Linux array mismatch; a real freshly authored local file matches', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'charitology-model-runtime-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const bytes = new Uint8Array(await readFile(selectedPath)), selected = await parseSelected(bytes), before = await stat(selectedPath);
  assert.equal(await sha256Bytes(bytes), fixtureHash); assert.equal(selected.modelVersion.content.input.seed, 42);
  assert.equal(selected.modelVersion.content.run.costsSha256, '99c086c30b8af68f8e098a79c8135f9a9ea4531a687624b3f8491a2f3dfdbacb');
  const profile = selectRuntimeProfile(await loadRuntimeObservations()), macFile = join(directory, 'mac-reference.json'); await writeFile(macFile, bytes);
  const old = await invoke(macFile); assert.equal(old.code, profile.referenceCompatible ? 0 : 1); assert.equal(old.stderr, '');
  assert.equal(old.report.status, profile.referenceCompatible ? 'matched' : 'mismatched');
  assert.deepEqual(old.report.differences, profile.referenceCompatible ? [] : ['costsSha256', 'outcomesSha256']);
  const ordinary = profile.cases.find(item => item.id === 'ordinary-seed-42').expected;
  assert.equal(old.report.recalculated.costsSha256, ordinary.costsSha256); assert.equal(old.report.recalculated.outcomesSha256, ordinary.outcomesSha256);
  const freshFile = join(directory, 'actual-local-run.json'), freshBytes = await fixtureSelected(); await writeFile(freshFile, freshBytes);
  const fresh = await invoke(freshFile); assert.equal(fresh.code, 0); assert.equal(fresh.report.status, 'matched'); assert.deepEqual(fresh.report.declared, fresh.report.recalculated);
  assert.equal(await sha256Bytes(new Uint8Array(await readFile(selectedPath))), fixtureHash); assert.equal((await stat(selectedPath)).mtimeMs, before.mtimeMs);
});
const workerPlatform = { createWorker() {
  const native = new Worker(new URL('../src/lib/model-bundles/pure-worker.fixture.mjs', import.meta.url)), listeners = new Map();
  return { addEventListener(type, listener) { const wrapped = type === 'message' ? data => listener({ data }) : listener; listeners.set(listener, [type, wrapped]); native.on(type, wrapped); },
    removeEventListener(_type, listener) { const old = listeners.get(listener); if (old) native.off(old[0], old[1]); listeners.delete(listener); },
    postMessage(value) { native.postMessage(value); }, terminate() { void native.terminate(); } };
}, setTimeout, clearTimeout };
test('actual cross-runtime comparison keeps mismatched Mac arrays out of reproduced-copy and draws authority', async () => {
  const bridge = createPureSessionBridgeForTesting(workerPlatform), controller = new AbortController();
  const job = { epoch: 1, formGeneration: 0, storeGeneration: 1, signal: controller.signal, isCurrent: () => !controller.signal.aborted };
  try {
    const handle = await bridge.api.admitSelected(new Uint8Array(await readFile(selectedPath))), comparison = await bridge.api.recalculate(handle, job);
    const observation = bridge.api.inspectComparison(comparison), profile = selectRuntimeProfile(await loadRuntimeObservations());
    assert.equal(observation.kind, profile.referenceCompatible ? 'matched' : 'mismatched');
    if (profile.referenceCompatible) await bridge.api.makeDraws(comparison);
    else {
      assert.deepEqual(observation.differences, ['costsSha256', 'outcomesSha256']);
      await assert.rejects(bridge.api.makeDraws(comparison), { code: 'matched-comparison-required' });
      const state = await fixtureState();
      await assert.rejects(bridge.api.prepareCommand(state, { kind: 'copy-reproduced', selected: handle, comparison },
        { job, now: FIXTURE_NOW, newModelId: 'copy-model', newVersionId: 'copy-version', sourceChecksums: new Map() }), { code: 'matched-comparison-required' });
      assert.equal(state.imports.length, 0);
    }
  } finally { controller.abort(); bridge.dispose(); }
});
test('CI observations never enter browser arithmetic, admission, matching or worker source', async () => {
  const directory = new URL('../src/lib/model-bundles/', import.meta.url);
  for (const name of await readdir(directory)) if (name.endsWith('.mjs') && !/test|fixture/.test(name)) {
    assert.doesNotMatch(await readFile(new URL(name, directory), 'utf8'), /model-runtime-qualification|model-runtime-observations/);
  }
  for (const file of knownEngine().files) assert.equal(await sha256Bytes(new Uint8Array(await readFile(new URL('../' + file.path, import.meta.url)))), file.sha256);
});
