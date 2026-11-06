import test from 'node:test';
import { qualifyModelRuntime } from '../../../scripts/model-runtime-qualification.mjs';
import assert from 'node:assert/strict';
import { hashValue, cloneJson, prettyBytes, parseJsonBytes, LIMITS, canonicalBytes } from './codec.mjs';
import { knownEngine, knownEnginePin, knownGoldenVectors, assertKnownEngine, verifyGoldenVectors } from './registry.mjs';
import { evaluateInput } from './interpretations/v1/arithmetic.mjs';
import { inputHash, makeRecordedRun } from './interpretations/v1/encoding.mjs';
import { ROWS, LIMITATIONS, validateContent, compileEditorContent, editorFormFromContent, runFingerprint } from './content.mjs';
import { validateState, validateSelected, validateFrozenVersion, makeSelected, makeBackup, parseSelected, parseBackup,
  assertGraphExtension, TEXT_FORM_KEYS, JSON_FORM_KEYS, SELECTED_LABEL, SELECTED_OMISSION } from './graph.mjs';
const now = '2026-10-28T01:02:03.004Z';
const copy = value => structuredClone(value);
function emptyForm() { return { raw: { parser: 'strict-decimal-v1', name: '', unit: '', values: Object.fromEntries(ROWS.map(row => [row, ['', '', '']])), discount: '', seed: '' },
  text: Object.fromEntries(TEXT_FORM_KEYS.map(key => [key, ''])), json: Object.fromEntries(JSON_FORM_KEYS.map(key => [key, ''])) }; }
async function fixtureContent() {
  const golden = knownGoldenVectors().cases.find(item => item.kind === 'run' && item.raw !== null);
  const input = golden.input, run = await makeRecordedRun(knownEnginePin(), input, evaluateInput(input));
  const point = { kind: 'user-assumption', sourceIds: [], rationale: 'Fictional authored assumption for software acceptance.' };
  const basis = Object.fromEntries(ROWS.map(row => [row, Object.fromEntries(['low', 'likely', 'high'].map(part => [part, copy(point)]))])); basis.discount = copy(point);
  return validateContent({ enginePin: knownEnginePin(), classification: 'user-authored', title: 'Fictional appointment model',
    purpose: 'Test the bounded software workflow with fictional assumptions.', programDescription: 'A hypothetical administrative change.',
    population: { description: 'No real participants.', geography: null, eligibility: 'Fictional population only.', timeHorizon: 'Unknown.' },
    period: { label: 'Hypothetical period is unknown.', from: null, to: null }, outcome: { name: golden.raw.unit, definition: 'One fictional outcome.', measurement: 'No observed measurement.', scope: 'one-outcome' },
    money: { currency: 'USD', priceYear: null, basis: 'unknown', inclusions: 'Hypothetical total costs.', exclusions: 'Unspecified costs are not estimated.', adjustment: null },
    assumptions: { independence: 'Inputs are assumed independent.', chanceAsScale: 'Chance scales expected outcomes.', counterfactual: 'Authored assumption.', discountRationale: 'Authored discount choice.',
      harmsAndSpillovers: 'Not calculated.', sourceDepthLimit: 'No empirical source established.', other: '' },
    sources: [], sourceModel: null, raw: golden.raw, input, basis, run, limitations: LIMITATIONS });
}
async function sealVersion(value) {
  const v = copy(value); v.contentHash = await hashValue('content', v.content); delete v.hash; v.hash = await hashValue('version', v); return v;
}
async function fixtureState() {
  const content = await fixtureContent();
  const version = await sealVersion({ id: 'version-a-1', modelId: 'model-a', sequence: 1, previous: null, recordedAt: now, amendmentReason: null, origin: null, content });
  return { format: 'charitology-model-bundles', schemaVersion: 1, id: 'fictional-workspace', revision: 1, createdAt: now, updatedAt: now,
    engines: [knownEngine()], models: [{ id: 'model-a', title: content.title, currentVersionId: version.id }], versions: [version], imports: [],
    draft: { mode: 'new', modelId: null, expectedHead: null, origin: null, form: emptyForm(), dirty: false } };
}
async function append(state, title = 'Fictional amended model') {
  const s = copy(state), previous = s.versions.at(-1), content = { ...previous.content, title };
  const version = await sealVersion({ ...previous, id: `version-a-${previous.sequence + 1}`, sequence: previous.sequence + 1,
    previous: { id: previous.id, hash: previous.hash }, recordedAt: '2025-01-01T00:00:00.000Z', amendmentReason: 'Fictional deliberate amendment.', content });
  s.versions.push(version); s.models[0].title = title; s.models[0].currentVersionId = version.id; s.revision++; return s;
}
async function resealSelected(value) { const v = copy(value); delete v.checksum; v.checksum = await hashValue('selected', v); return v; }
test('actual source/golden registry is closed; strict reference reproduction is distinguished from measured Linux incompatibility', async () => {
  await assertKnownEngine(knownEngine()); const qualification = await qualifyModelRuntime();
  assert.equal(qualification.evaluatedCases, 19);
  if (qualification.referenceCompatible) assert.equal((await verifyGoldenVectors()).cases, 19);
  else {
    assert.equal(qualification.referenceMatchedCases, 16);
    await assert.rejects(verifyGoldenVectors(), error => error.code === 'golden-runtime-mismatch');
  }
  const engine = knownEngine(); assert.ok(Object.isFrozen(engine.files[0])); assert.equal(engine.files.length, 3);
  for (const mutate of [e => { e.files[0].rawUtf8 += '\n'; }, e => { e.files.reverse(); }, e => { e.definition.draws = 4999; },
    e => { e.definition.goldenVectorsHash = '0'.repeat(64); }, e => { e.definitionHash = '0'.repeat(64); }, e => { e.extra = true; }]) {
    const changed = copy(engine); mutate(changed); await assert.rejects(assertKnownEngine(changed));
  }
  const golden = knownGoldenVectors();
  for (const item of golden.cases) if (item.kind === 'run') {
    assert.equal(Object.hasOwn(item.expected, 'inputHash'), false);
    for (const forbidden of ['definitionHash', 'runHash', 'contentHash', 'versionHash']) assert.equal(Object.hasOwn(item.expected, forbidden), false);
  }
});
test('actual known-engine Content/raw/source/currency/period and exact editor transforms enforce the complete contract', async () => {
  const content = await fixtureContent(); const form = await editorFormFromContent(content);
  assert.equal(form.text.moneyPriceYear, ''); assert.equal(form.text.periodFrom, ''); assert.equal(form.raw.name, content.raw.name);
  const calculation = { enginePin: content.enginePin, input: content.input, run: content.run };
  assert.deepEqual(await compileEditorContent(form, calculation), content);
  const unfinished = copy(form); unfinished.json.sources = '{unfinished'; await assert.rejects(compileEditorContent(unfinished, calculation)); assert.equal(unfinished.json.sources, '{unfinished');
  for (const mutate of [c => { c.raw.values.cost[0] = '101'; }, c => { c.raw.unit = 'other'; }, c => { c.money.currency = 'EUR'; },
    c => { c.money.basis = 'constant-price'; }, c => { c.money.adjustment = 'Invented conversion.'; },
    c => { c.period.from = { precision: 'year', value: '2026' }; }, c => { c.period = { label: 'Fictional', from: { precision: 'year', value: '2026' }, to: { precision: 'month', value: '2026-01' } }; },
    c => { c.period = { label: 'Fictional', from: { precision: 'day', value: '2026-12-01' }, to: { precision: 'day', value: '2026-01-01' } }; },
    c => { c.basis.cost.low = { kind: 'source-informed', sourceIds: [], rationale: 'Unsupported.' }; }, c => { c.limitations.reverse(); }, c => { c.run.inputHash = '0'.repeat(64); }]) {
    const changed = copy(content); mutate(changed); await assert.rejects(validateContent(changed));
  }
  const source = { id: 'fictional-description', title: 'Fictional artifact description', publisher: null, url: 'https://example.org/fictional', locator: null,
    published: null, accessedOn: null, access: 'unknown', license: null, note: '', checksum: { kind: 'declared', sha256: '1'.repeat(64) } };
  const sourced = copy(content); sourced.sources = [source]; await assert.rejects(validateContent(sourced), { code: 'unused-source-note' });
  sourced.sourceModel = { sourceId: source.id, artifactSha256: source.checksum.sha256, interpretation: 'A user-described hypothetical mapping.' }; await validateContent(sourced);
  sourced.sourceModel.artifactSha256 = '2'.repeat(64); await assert.rejects(validateContent(sourced), { code: 'source-model-checksum' });
  const constant = copy(content); constant.money.basis = 'constant-price'; constant.money.priceYear = 2020; constant.money.adjustment = 'User-described adjustment; no app conversion.'; await validateContent(constant);
  const captured = copy(form), promise = compileEditorContent(captured, calculation); captured.text.title = 'Changed after await'; assert.equal((await promise).title, content.title);
});
test('actual selected and full-backup codecs retain precise ancestor boundaries and do not bless resealed false numerical output', async () => {
  const state = await append(await fixtureState()); await validateState(state);
  const selected = await makeSelected(state, state.models[0].currentVersionId, now), packet = await parseSelected(selected);
  assert.equal(packet.label, SELECTED_LABEL); assert.deepEqual(packet.omissions, [SELECTED_OMISSION]); assert.equal(packet.modelVersion.sequence, 2);
  assert.equal(packet.modelVersion.previous.id, 'version-a-1'); // A selected packet permits this inert unavailable ancestor.
  const backup = await makeBackup(state, now); assert.deepEqual(await parseBackup(backup), state);
  const orphan = copy(state); orphan.versions.shift(); await assert.rejects(validateState(orphan), { code: 'noncontiguous-sequence' });
  const wrong = copy(packet); wrong.modelVersion.content.run.cost.p95.value *= 2; wrong.modelVersion = await sealVersion(wrong.modelVersion);
  const resealed = await resealSelected(wrong); assert.equal((await validateSelected(resealed)).modelVersion.content.run.cost.p95.value, wrong.modelVersion.content.run.cost.p95.value);
  const recalculated = await makeRecordedRun(knownEnginePin(), resealed.modelVersion.content.input, evaluateInput(resealed.modelVersion.content.input));
  assert.notDeepEqual(recalculated, resealed.modelVersion.content.run); // Admission preserves historical claims; only explicit recalculation reveals this mismatch.
  const badChecksum = copy(packet); badChecksum.exportedAt = '2026-10-28T02:00:00.000Z'; await assert.rejects(validateSelected(badChecksum), { code: 'selected-checksum' });
});
test('actual immutable graph refuses forks/orphans/head/title/owned IDs and preserves stale amend writing', async () => {
  const source = await fixtureState(), amended = await append(source);
  await assertGraphExtension(source, amended);
  for (const mutate of [s => { s.models[0].title = 'Different'; }, s => { s.models[0].currentVersionId = s.versions[0].id; },
    s => { s.versions.reverse(); }, s => { s.id = s.models[0].id; }, s => { s.versions[1].previous.hash = '0'.repeat(64); },
    s => { s.versions[1].sequence = 3; }, s => { s.versions[1].amendmentReason = ' '; }, s => { s.versions[1].previous = null; },
    s => { s.versions[1].modelId = 'missing-model'; }]) {
    const changed = copy(amended); mutate(changed); await assert.rejects(validateState(changed));
  }
  const writing = copy(amended); writing.draft = { mode: 'amend', modelId: 'model-a', expectedHead: { id: source.versions[0].id, hash: source.versions[0].hash },
    origin: null, form: await editorFormFromContent(source.versions[0].content, 'Unfinished reason.'), dirty: true };
  assert.equal((await validateState(writing)).draft.expectedHead.id, source.versions[0].id); // Admission retains a stale historical basis; freeze must require the current head.
  writing.draft.expectedHead.hash = '0'.repeat(64); await assert.rejects(validateState(writing), { code: 'draft-basis' });
  const rewritten = copy(source); rewritten.versions[0].content.title = 'Resealed historical change'; rewritten.versions[0] = await sealVersion(rewritten.versions[0]); rewritten.models[0].title = rewritten.versions[0].content.title; rewritten.revision++;
  await validateState(rewritten); await assert.rejects(assertGraphExtension(source, rewritten), { code: 'immutable-history' });
});
test('actual selected-copy observations and receipts close original pins, conflict identities and first receipt through amendments', async () => {
  const state = await fixtureState(), root = state.versions[0], fingerprint = await runFingerprint(root.content.run);
  const origin = { kind: 'selected-bundle-copy', sourceVersionId: 'incoming-version', sourceVersionHash: '3'.repeat(64), sourceContentHash: '4'.repeat(64),
    chosenFileSha256: '5'.repeat(64), observation: { kind: 'matched', declared: fingerprint, recalculated: fingerprint, differences: [] } };
  root.origin = origin; state.versions[0] = await sealVersion(root);
  state.imports = [{ sourceVersionId: origin.sourceVersionId, sourceVersionHash: origin.sourceVersionHash, sourceContentHash: origin.sourceContentHash,
    chosenFileSha256: origin.chosenFileSha256, localModelId: root.modelId, localVersionId: root.id }];
  const amended = await append(state); await validateState(amended);
  assert.deepEqual(amended.versions[1].origin, origin); assert.deepEqual(amended.imports, state.imports);
  const mismatched = copy(amended); mismatched.versions[1].origin.chosenFileSha256 = '6'.repeat(64); mismatched.versions[1] = await sealVersion(mismatched.versions[1]);
  await assert.rejects(validateState(mismatched), { code: 'amendment-origin' });
  const wrongReceipt = copy(state); wrongReceipt.imports[0].chosenFileSha256 = '6'.repeat(64); await assert.rejects(validateState(wrongReceipt), { code: 'receipt-origin' });
  const duplicate = copy(state); duplicate.imports.push(copy(duplicate.imports[0])); await assert.rejects(validateState(duplicate), { code: 'duplicate-receipt' });
  const conflict = copy(state); conflict.draft = { mode: 'copy', modelId: null, expectedHead: null,
    origin: { ...origin, sourceVersionHash: '6'.repeat(64) }, form: emptyForm(), dirty: true }; await assert.rejects(validateState(conflict), { code: 'incoming-version-conflict' });
  const observation = copy(state); observation.versions[0].origin.observation.kind = 'arithmetic-refusal';
  observation.versions[0].origin.observation = { kind: 'arithmetic-refusal', declared: fingerprint, recalculated: null, differences: [],
    issue: { code: 'numeric-domain', phase: 'discount', path: 'discount.v', context: { kind: 'likely' } } };
  observation.versions[0] = await sealVersion(observation.versions[0]);
  const restored = await parseBackup(await makeBackup(observation, now)); assert.equal(restored.versions[0].origin.observation.kind, 'arithmetic-refusal');
});
test('actual cross-copy references require retained exact source nodes and the complete graph has no cycles', async () => {
  const state = await fixtureState(), original = state.versions[0];
  const next = await sealVersion({ ...original, id: 'version-b-1', modelId: 'model-b', origin: { kind: 'local-version-copy', sourceModelId: original.modelId,
    sourceVersionId: original.id, sourceVersionHash: original.hash, sourceContentHash: original.contentHash } });
  state.models.push({ id: next.modelId, title: next.content.title, currentVersionId: next.id }); state.versions.push(next); await validateState(state);
  const missing = copy(state); missing.versions[1].origin.sourceVersionHash = '0'.repeat(64); missing.versions[1] = await sealVersion(missing.versions[1]); await assert.rejects(validateState(missing), { code: 'local-copy-reference' });
  const self = copy(next); self.origin.sourceModelId = next.modelId; self.origin.sourceVersionId = next.id; await assert.rejects(validateFrozenVersion(await sealVersion(self)), { code: 'copy-cycle' });
  // A claimed two-model cycle cannot satisfy the graph's source hashes without a hash fixed point. Even a broken attempt is rejected before acquiring write authority.
  const cycle = copy(state); cycle.versions[0].origin = { kind: 'local-version-copy', sourceModelId: next.modelId, sourceVersionId: next.id, sourceVersionHash: next.hash, sourceContentHash: next.contentHash };
  cycle.versions[0] = await sealVersion(cycle.versions[0]); await assert.rejects(validateState(cycle));
});
test('actual maximum version/model inventory and future pretty backup caps are enforced together', async () => {
  const content = await fixtureContent(), source = await fixtureState(); source.models = []; source.versions = [];
  for (let model = 0; model < 20; model++) {
    const modelId = `model-${String(model).padStart(2, '0')}`; let previous = null;
    for (let sequence = 1; sequence <= 5; sequence++) {
      const version = await sealVersion({ id: `version-${String(model).padStart(2, '0')}-${sequence}`, modelId, sequence, previous,
        recordedAt: now, amendmentReason: sequence === 1 ? null : 'Fictional amendment.', origin: null, content });
      source.versions.push(version); previous = { id: version.id, hash: version.hash };
    }
    source.models.push({ id: modelId, title: content.title, currentVersionId: previous.id });
  }
  await validateState(source); assert.equal((await parseBackup(await makeBackup(source, now))).versions.length, 100);
  const extra = copy(source); extra.versions.push(copy(extra.versions[0])); await assert.rejects(validateState(extra), { code: 'array-bound' });
  const expanded = copy(source);
  for (let i = 0; i < expanded.versions.length; i++) {
    expanded.versions[i].content.assumptions.other = 'x'.repeat(8000);
    expanded.versions[i] = await sealVersion(expanded.versions[i]);
    if (expanded.versions[i].sequence > 1) { const previous = expanded.versions[i - 1]; expanded.versions[i].previous = { id: previous.id, hash: previous.hash }; expanded.versions[i] = await sealVersion(expanded.versions[i]); }
  }
  const complete = { format: 'charitology-model-bundles-backup', schemaVersion: 1, exportedAt: now, state: expanded, checksum: '0'.repeat(64) };
  const canonicalSize = canonicalBytes(expanded).byteLength, prettySize = new TextEncoder().encode(JSON.stringify(complete, null, 2) + '\n').byteLength;
  assert.ok(canonicalSize < LIMITS.backup, `canonical fixture ${canonicalSize}`); assert.ok(prettySize > LIMITS.backup, `pretty fixture ${prettySize}`);
  await assert.rejects(validateState(expanded), { code: 'byte-limit' });
});
