import test from 'node:test';
import { loadRuntimeObservations, selectRuntimeProfile } from '../../../scripts/model-runtime-qualification.mjs';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { knownEngine, knownEnginePin, knownGoldenVectors, assertKnownEngine, verifyRegistry } from './registry.mjs';
import { hashValue, sha256Bytes, parseJsonBytes, prettyBytes } from './codec.mjs';
import { parseSelected } from './graph.mjs';
import { fixtureSelected } from './test-fixtures.mjs';
const root = fileURLToPath(new URL('../../..', import.meta.url));
const script = 'scripts/generate-model-engine-registry.mjs';
function run(cwd, args) { return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', timeout: 30000 }); }
test('actual installed registry checks source bytes, independent golden hash and descriptor closure without a self hash', async () => {
  await verifyRegistry(); const engine = knownEngine();
  for (const file of engine.files) {
    const actual = new Uint8Array(await readFile(join(root, file.path)));
    assert.equal(actual.byteLength, file.byteLength); assert.equal(await sha256Bytes(actual), file.sha256);
    assert.equal(new TextDecoder('utf-8', { fatal: true }).decode(actual), file.rawUtf8);
  }
  assert.equal(await hashValue('golden', knownGoldenVectors()), engine.definition.goldenVectorsHash);
  assert.equal(await hashValue('engine', engine.definition), knownEnginePin().definitionHash);
  assert.equal(Object.hasOwn(engine.definition, 'definitionHash'), false);
  const source = structuredClone(engine), pending = assertKnownEngine(source); source.files[0].rawUtf8 += '\n'; await pending;
});
test('actual fixed-path generator checks existing v1 and refuses creation/changed v1 without overwriting any member', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'charitology-engine-registry-'));
  try {
    const paths = [script, 'src/lib/model-bundles/codec.mjs', 'src/lib/model-bundles/registry-v1.generated.mjs',
      'src/lib/model-bundles/fixtures/golden-v1.json', ...knownEngine().files.map(file => file.path)];
    for (const path of paths) { const target = join(temporary, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, await readFile(join(root, path)), { flag: 'wx' }); }
    const data = join(temporary, 'src/lib/model-bundles/registry-v1.generated.mjs'), golden = join(temporary, 'src/lib/model-bundles/fixtures/golden-v1.json');
    const before = [await readFile(data), await readFile(golden)];
    const checked = run(temporary, ['--check-integrity']); assert.equal(checked.error, undefined); assert.equal(checked.status, 0, checked.stderr);
    assert.equal(JSON.parse(checked.stdout).mode, 'integrity-checked'); assert.equal(JSON.parse(checked.stdout).numericalConformance, 'not-evaluated');
    const profile = selectRuntimeProfile(await loadRuntimeObservations()), strict = run(temporary, []);
    assert.equal(strict.status, profile.referenceCompatible ? 0 : 1, strict.stderr);
    if (profile.referenceCompatible) assert.equal(JSON.parse(strict.stdout).mode, 'checked');
    else { assert.match(strict.stderr, /Existing v1 bytes differ/); assert.match(strict.stderr, /ordinary-seed-42/); }
    const alteredGolden = JSON.parse(before[1]); alteredGolden.cases[0].expected.seed = 2; await writeFile(golden, JSON.stringify(alteredGolden, null, 2) + '\n');
    assert.equal(run(temporary, ['--check-integrity']).status, 1); await writeFile(golden, before[1]);
    const duplicate = run(temporary, ['--create']); assert.equal(duplicate.status, 1); assert.match(duplicate.stderr, /may not be overwritten/);
    const unknown = run(temporary, ['--overwrite']); assert.equal(unknown.status, 2);
    const source = join(temporary, knownEngine().files[0].path); await writeFile(source, (await readFile(source, 'utf8')) + '\n');
    const changed = run(temporary, ['--check']); assert.equal(changed.status, 1); assert.match(changed.stderr, /cannot be silently replaced/);
    assert.equal(run(temporary, ['--check-integrity']).status, 1);
    assert.deepEqual(await readFile(data), before[0]); assert.deepEqual(await readFile(golden), before[1]);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
test('actual shared admission distinguishes malformed inert engines from a well-formed unknown interpretation', async () => {
  await assert.rejects(assertKnownEngine({}), error => error.code === 'object-keys');
  const changed = structuredClone(knownEngine()); changed.files[0].rawUtf8 += '\n';
  await assert.rejects(assertKnownEngine(changed), error => error.code === 'engine-source-integrity');
  const badHash = structuredClone(knownEngine()); badHash.definition.draws = 4999;
  await assert.rejects(assertKnownEngine(badHash), error => error.code === 'engine-definition-hash');
  await assert.rejects(parseSelected(await fixtureSelected('unsupported')), error => error.code === 'unsupported-engine');
  const crossLink = structuredClone(parseJsonBytes(await fixtureSelected())); crossLink.modelVersion.content.enginePin.definitionHash = '0'.repeat(64);
  await assert.rejects(parseSelected(prettyBytes(crossLink)), error => error.code === 'engine-reference');
});
