import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listIncubatorNativeSelections, inspectIncubatorNative, makeIncubatorSourceCapture, validateIncubatorSourceCapture, INCUBATOR_ADAPTER, INCUBATOR_NATIVE_REGISTRY, INCUBATOR_NATIVE_REGISTRY_SHA256 } from '../lib/incubator-native.mjs';
import { incubatorHash, parseIncubatorJSON, incubatorOwned } from '../lib/incubator-bridge-json.mjs';
import { incubatorHash as browserIncubatorHash } from '../lib/incubator-native-admission.mjs';
import { nativeFixture, nativeRow, selection, sourceFixture, clone, encode, AT } from './incubator-fixtures.mjs';
const choice = { adapter: INCUBATOR_ADAPTER, selection };
const error = code => e => e.code === code;
test('checked browser facade uses the same program-data hash, canonical rules and domain refusal', () => {
  const values = [{ title: 'Exact program', kind: 'program', evidence: null }, { z: ['中', 0, null, false], a: { b: '\nLiteral\ttext' } }];
  for (const value of values) assert.equal(browserIncubatorHash('program-data', value), incubatorHash('program-data', value));
  assert.equal(browserIncubatorHash('program-data', { b: 2, a: 1 }), browserIncubatorHash('program-data', { a: 1, b: 2 }));
  assert.notEqual(browserIncubatorHash('program-data', values[0]), browserIncubatorHash('candidate-data', values[0]));
  assert.throws(() => browserIncubatorHash('unsupported-domain', values[0]));
  assert.throws(() => browserIncubatorHash('program-data', { unsupported: '\0' }));
});
test('actual existing native exporter and strict codec agree with the one-producer admission', async () => {
  const repo = fileURLToPath(new URL('../../../', import.meta.url));
  const built = await build({ stdin: { contents: 'export { remainingRecordBackup, parseRemainingRecordBackup } from "./src/lib/client/remaining-record-recovery-formats.ts";', resolveDir: repo }, bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent' });
  const codec = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].contents).toString('base64'));
  const native = nativeFixture(), raw = codec.remainingRecordBackup('charitology.partner-workspace-v1.charity-incubator', native), admitted = inspectIncubatorNative(new TextEncoder().encode(raw), choice);
  assert.deepEqual(admitted.selected.context, native.context); assert.deepEqual(admitted.selected.project, native.records.projects[0]); assert.deepEqual(admitted.selected.milestone, native.records.milestones[0]); assert.equal(admitted.selected.updated, native.updated);
  assert.deepEqual(codec.parseRemainingRecordBackup(raw, 'charitology.partner-workspace-v1.charity-incubator'), native);
});
test('equal titles and unmatched free-text references never choose or infer a relationship', () => {
  const n = nativeFixture(); n.records.projects.push(nativeRow('another-project'));
  const listed = listIncubatorNativeSelections(encode(n), { adapter: INCUBATOR_ADAPTER }); assert.equal(listed.projects.length, 2); assert.equal(listed.projects[0].title, listed.projects[1].title);
  assert.equal(listed.milestones[0].projectReference, n.records.milestones[0].values.project);
  assert.throws(() => inspectIncubatorNative(encode(n), { adapter: INCUBATOR_ADAPTER, selection: { projectId: 'Same visible code', milestoneId: selection.milestoneId } }));
  assert.throws(() => inspectIncubatorNative(encode(n), { ...choice, extra: true }));
});
test('complete invalid unselected rows, duplicate IDs and unsupported envelopes refuse before selection', () => {
  for (const change of [n => { n.records.projects.push(nativeRow('unselected')); n.records.projects[1].values.status = 'Imaginary'; }, n => n.records.projects.push(nativeRow(selection.milestoneId)), n => { n.records.readiness = undefined; }, n => { n.program = 'nonprofit-advisory'; }, n => { n.format = 'selected-packet'; }, n => { n.version = 2; }]) { const n = nativeFixture(); change(n); assert.throws(() => inspectIncubatorNative(encode(n), choice)); }
});
test('native valid unselected NUL/surrogates remain admitted, retained selected text has a precise hosted refusal', () => {
  for (const value of ['\0', '\ud800', '\udc00']) {
    const n = nativeFixture(); n.records.projects.push(nativeRow('unselected')); n.records.projects[1].values.model = value;
    const retained = inspectIncubatorNative(encode(n), choice); assert.equal(JSON.stringify(retained).includes('unselected'), false);
    n.records.projects[0].values.model = value;
    assert.throws(() => inspectIncubatorNative(encode(n), choice), e => e.code === 'incubator_native_text_unsupported' && e.issues[0].field === 'selected.project.values.model');
  }
});
test('whole file exact 8,000,000-byte and 500/250-row ceilings are independent of selected retention', () => {
  const n = nativeFixture(); n.records.projects = Array.from({ length: 250 }, (_, i) => nativeRow(i ? 'p-' + i : selection.projectId)); n.records.milestones = Array.from({ length: 250 }, (_, i) => nativeRow(i ? 'm-' + i : selection.milestoneId, 'milestones'));
  const raw = encode(n), max = new Uint8Array(8000000); max.fill(32); max.set(raw);
  assert.equal(inspectIncubatorNative(max, choice).originalBytes, 8000000); assert.throws(() => inspectIncubatorNative(new Uint8Array(8000001), choice));
  n.records.projects.push(nativeRow('p-over')); assert.throws(() => inspectIncubatorNative(encode(n), choice));
  n.records.projects.pop();
  const experiment = { id: 'experiment-over', values: { title: 'Valid unselected experiment', project: 'Free text', hypothesis: 'Hypothesis', design: 'Not run', threshold: 'Review', finding: 'Unknown', source: '', status: 'Draft' } };
  const small = nativeFixture(); small.records.experiments.push(experiment); assert.doesNotThrow(() => inspectIncubatorNative(encode(small), choice));
  n.records.experiments.push(experiment); assert.throws(() => inspectIncubatorNative(encode(n), choice));
});
test('lexical duplicate aliases, unsafe keys, nonfinite tokens, BOM/UTF8 and deep/work-bounded JSON refuse', () => {
  for (const raw of ['{"x":1,"\\u0078":2}', '{"constructor":{}}', '1e999', '['.repeat(33) + '0' + ']'.repeat(33), '\ufeff{}']) assert.throws(() => parseIncubatorJSON(raw, 1000000, { nativeStrings: true }));
  assert.throws(() => parseIncubatorJSON(new Uint8Array([0xc0, 0xaf]), 100));
  assert.throws(() => parseIncubatorJSON('[' + '0,'.repeat(200000) + '0]', 1000000));
  let read = false; const getter = Object.defineProperty({}, 'x', { enumerable: true, get() { read = true; return 'secret'; } }); assert.throws(() => incubatorOwned(getter)); assert.equal(read, false);
});
test('source capture requires actual complete inspection, is immutable and checks exact original/source bytes', () => {
  const i = inspectIncubatorNative(encode(nativeFixture()), choice), settings = { originOrgId: 'org-a', bindingId: 'binding-a', sourceVersion: 1, previousNativeSource: null, preparedAt: AT };
  assert.throws(() => makeIncubatorSourceCapture(clone(i), settings), error('incubator_native'));
  const s = makeIncubatorSourceCapture(i, settings); assert(Object.isFrozen(s.selected.project.values)); assert.equal(s.originalBytes, encode(nativeFixture()).length);
  const changed = clone(s); changed.selected.project.values.model += '!'; assert.throws(() => validateIncubatorSourceCapture(changed), error('incubator_hash'));
  assert.equal(incubatorHash('registry', INCUBATOR_NATIVE_REGISTRY), INCUBATOR_NATIVE_REGISTRY_SHA256);
});
test('new generated source closure reproduces; old frozen Learning interpretation remains untouched', async () => {
  const service = fileURLToPath(new URL('../', import.meta.url)), repo = fileURLToPath(new URL('../../../', import.meta.url));
  const before = await readFile(new URL('../lib/learning-native-admission.mjs', import.meta.url));
  const result = spawnSync(process.execPath, ['scripts/build-incubator-native.mjs', '--check'], { cwd: service, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await readFile(new URL('../lib/learning-native-admission.mjs', import.meta.url)), before);
  assert.deepEqual(await readFile(new URL('../lib/incubator-native-admission.mjs', import.meta.url)), await readFile(new URL('../public/incubator-native-admission.js', import.meta.url)));
  assert.equal(repo.endsWith('/'), true);
});
