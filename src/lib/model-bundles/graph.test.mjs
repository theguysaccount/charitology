import test from 'node:test';
import assert from 'node:assert/strict';
import { validateState, validateDraft, validateEditorForm, makeBackup, parseBackup, validateBackup, assertGraphExtension, TEXT_FORM_KEYS, JSON_FORM_KEYS } from './graph.mjs';
import { parseJsonBytes, hashValue } from './codec.mjs';
import { ROWS } from './content.mjs';
const now = '2026-10-28T01:02:03.004Z';
function form() { return { raw: { parser: 'strict-decimal-v1', name: '', unit: '',
  values: Object.fromEntries(ROWS.map(row => [row, ['', '', '']])), discount: '', seed: '' },
  text: Object.fromEntries(TEXT_FORM_KEYS.map(key => [key, ''])), json: Object.fromEntries(JSON_FORM_KEYS.map(key => [key, ''])) }; }
function state() { return { format: 'charitology-model-bundles', schemaVersion: 1, id: 'fictional-workspace', revision: 1,
  createdAt: now, updatedAt: now, engines: [], models: [], versions: [], imports: [],
  draft: { mode: 'new', modelId: null, expectedHead: null, origin: null, form: form(), dirty: false } }; }
test('actual empty-state graph and backup codec preserve unfinished writing without a registry, calculation or initial write', async () => {
  const source = state(); source.draft.dirty = true; source.draft.form.json.sources = '{unfinished'; source.draft.form.raw.values.cost[0] = 'not known';
  const admitted = await validateState(source); assert.ok(Object.isFrozen(admitted));
  const exported = await makeBackup(source, now); assert.equal(exported.at(-1), 10);
  assert.deepEqual(await parseBackup(exported), source);
  const dto = parseJsonBytes(exported); assert.equal(dto.state.draft.form.json.sources, '{unfinished');
  assert.deepEqual((await validateBackup(dto)).state, source);
  const changed = structuredClone(dto); changed.state.draft.form.json.sources = '[]';
  await assert.rejects(validateBackup(changed), { code: 'backup-checksum' });
  const resealed = { ...changed }; delete resealed.checksum; changed.checksum = await hashValue('backup', resealed);
  assert.equal((await validateBackup(changed)).state.draft.form.json.sources, '[]');
  // A backup is integrity-protected declared data, never proof of source truth or contemporary authority.
});
test('actual empty graph rejects shape/caps/hidden provenance and requires explicit draft target rules', async () => {
  for (const mutate of [s => { s.format = 'other'; }, s => { s.revision = -1; }, s => { s.models = Array(21).fill({}); }, s => { s.versions = Array(101).fill({}); }, s => { s.imports = Array(101).fill({}); }, s => { s.engines = [{}, {}]; }, s => { s.extra = true; }, s => { s.draft.origin = { verified: true }; }, s => { s.draft.form.text.hidden = ''; }]) {
    const changed = state(); mutate(changed); await assert.rejects(validateState(changed));
  }
  const draft = state().draft;
  for (const mutate of [d => { d.modelId = 'unexpected-model'; }, d => { d.expectedHead = { id: 'version', hash: 'a'.repeat(64) }; }, d => { d.mode = 'copy'; }, d => { d.mode = 'amend'; }, d => { d.dirty = 'yes'; }]) {
    const changed = structuredClone(draft); mutate(changed); assert.throws(() => validateDraft(changed));
  }
  assert.ok(validateEditorForm(form()));
});
test('actual state extension is exact and timestamps remain device declarations, not a clock-monotonic claim', async () => {
  const old = state(), next = structuredClone(old); next.revision++; next.updatedAt = '2025-01-01T00:00:00.000Z'; next.draft.form.text.title = 'Fictional writing';
  assert.equal((await assertGraphExtension(old, next)).draft.form.text.title, 'Fictional writing');
  for (const mutate of [s => { s.revision = 1; }, s => { s.id = 'other-workspace'; }, s => { s.createdAt = '2025-01-01T00:00:00.000Z'; }]) {
    const changed = structuredClone(next); mutate(changed); await assert.rejects(assertGraphExtension(old, changed), { code: 'state-extension' });
  }
});
