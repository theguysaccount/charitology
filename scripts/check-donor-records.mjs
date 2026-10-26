// Actual gift model + opt-in durable storage, with synthetic local data only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import ts from 'typescript';
const result = await build({ stdin: { contents: `export * from './src/lib/client/gifts.ts'; export * from './src/lib/client/durable-store.ts'; export { splitWhole } from './src/lib/client/split.ts';`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const m = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
let groups = 0;
function check(label, run) { try { run(); groups++; } catch (error) { error.message = `${label}: ${error.message}`; throw error; } }
const gift = (changes = {}) => ({ id: 'synthetic', date: '2026-01-01', organization: 'Synthetic example', amount: 10, cause: 'other', depth: null, ...changes });
check('known gifts retain unknown depth while explicit relief remains zero', () => {
  for (const depth of [null, undefined, '', 'unknown', 'unclassified']) assert.equal(m.sanitizeGift(gift({ depth })).depth, null);
  assert.equal(m.sanitizeGift(gift({ depth: 0 })).depth, 0);
  for (const depth of [-1, 5, Infinity, 'not a level', {}, []]) assert.equal(m.sanitizeGift(gift({ depth })), undefined);
  assert.equal(m.sanitizeGift(gift({ amount: 0 })), undefined);
  assert.equal(m.sanitizeGift(gift({ date: '2026-02-30' })), undefined);
});
check('JSON and CSV round trips retain unclassified gifts and old numeric-depth records', () => {
  const rows = [gift(), gift({ id: 'relief', depth: 0 }), gift({ id: 'source', depth: 4 })];
  assert.deepEqual(m.parseGiftFile(m.giftsToJson(rows), 'gifts.json').gifts, rows);
  assert.deepEqual(m.parseGiftFile(m.giftsToCsv(rows), 'gifts.csv').gifts, rows);
  const imported = m.parseGiftFile('date,organization,amount\n2026-01-01,Synthetic example,25\n', 'gifts.csv');
  assert.equal(imported.gifts.length, 1); assert.equal(imported.gifts[0].depth, null); assert.equal(imported.skipped, 0);
});
check('total/cause/source denominators retain every dollar and classification coverage is separate', () => {
  const summary = m.summarize([gift({ amount: 50 }), gift({ id: 'relief', amount: 150, depth: 0 }), gift({ id: 'source', amount: 100, depth: 4 })]);
  assert.equal(summary.total, 300); assert.equal(summary.count, 3);
  assert.equal(summary.unclassified, 50); assert.equal(summary.unclassifiedCount, 1); assert.equal(summary.classified, 250);
  assert.deepEqual(summary.byDepth, [150, 0, 0, 0, 100]);
  assert.equal(summary.sourceShare, 1 / 3);
  const percents = m.splitWhole(100, [...summary.shares, summary.unclassified / summary.total]);
  assert.equal(percents.reduce((a, b) => a + b, 0), 100); assert.ok(percents[5] > 0); assert.equal(percents[0], 50);
  const unknown = m.summarize([gift()]); assert.equal(unknown.total, 10); assert.equal(unknown.unclassified, 10); assert.deepEqual(unknown.byDepth, [0, 0, 0, 0, 0]);
  assert.ok(Number.isNaN(m.summarize([]).sourceShare));
});
const fake = () => {
  const values = new Map(); let full = false, unreadable = false;
  return { values, setFull: value => { full = value; }, setUnreadable: value => { unreadable = value; }, getItem: key => { if (unreadable) throw Error('blocked'); return values.get(key) ?? null; }, setItem: (key, value) => { if (full) throw Error('quota'); values.set(key, value); }, removeItem: key => values.delete(key) };
};
const valid = value => !!value && typeof value === 'object' && typeof value.title === 'string';
check('two actual prefixed legacy writers refuse stale edit/import/undo/delete and retain exportable work', () => {
  const storage = fake(); storage.setItem('charitology.legacy', JSON.stringify({ title: 'Original' }));
  const a = m.durableCell(storage, 'legacy', null, valid), b = m.durableCell(storage, 'legacy', null, valid);
  assert.equal(a.write({ title: 'Newer A' }), true);
  const saved = storage.getItem('charitology.legacy');
  for (const next of [{ title: 'Stale edit' }, { title: 'Imported' }, { title: 'Original undo' }]) { assert.equal(b.write(next), false); assert.equal(storage.getItem('charitology.legacy'), saved); }
  assert.equal(b.snapshot().unsaved, true);
  assert.deepEqual(m.parseToolBackup(m.toolBackup('legacy', b.snapshot().current), 'legacy', valid), { title: 'Original undo' });
  assert.equal(b.remove(), false); assert.equal(storage.getItem('charitology.legacy'), saved);
  assert.equal(storage.getItem('legacy'), null);
});
check('malformed JSON and invalid saved fields remain protected instead of becoming a blank save', () => {
  for (const raw of ['{bad', JSON.stringify({ unexpected: 'keep me' })]) {
    const storage = fake(); storage.setItem('charitology.legacy', raw);
    const cell = m.durableCell(storage, 'legacy', null, valid);
    assert.ok(cell.snapshot().blocked);
    assert.equal(cell.write({ title: 'Blank replacement' }), false);
    assert.equal(cell.remove(), false); assert.equal(storage.getItem('charitology.legacy'), raw);
    cell.replace({ title: 'Explicit restored copy' }, raw);
    assert.equal(JSON.parse(storage.getItem('charitology.legacy')).title, 'Explicit restored copy');
  }
});
check('restore preview cannot overwrite a save made after the preview', () => {
  const storage = fake(), cell = m.durableCell(storage, 'legacy', null, valid);
  const preview = storage.getItem('charitology.legacy');
  storage.setItem('charitology.legacy', JSON.stringify({ title: 'After preview' }));
  assert.throws(() => cell.replace({ title: 'Restore' }, preview), /after your preview/);
  assert.equal(JSON.parse(storage.getItem('charitology.legacy')).title, 'After preview');
});
check('quota failure remains unsaved and retry can succeed; read failure never overwrites data', () => {
  const storage = fake(), cell = m.durableCell(storage, 'legacy', null, valid);
  storage.setFull(true); assert.equal(cell.write({ title: 'Memory draft' }), false); assert.equal(cell.snapshot().unsaved, true);
  assert.deepEqual(cell.snapshot().current, { title: 'Memory draft' }); assert.equal(storage.getItem('charitology.legacy'), null);
  storage.setFull(false); assert.equal(cell.write({ title: 'Memory draft' }), true); assert.equal(cell.snapshot().unsaved, false);
  storage.setUnreadable(true); const blocked = m.durableCell(storage, 'other', null, valid); assert.equal(blocked.write({ title: 'Unsafe' }), false); assert.equal(storage.values.has('charitology.other'), false);
});
check('backups reject wrong keys, versions and invalid shapes without mutation', () => {
  const raw = m.toolBackup('legacy', { title: 'Copy' });
  assert.deepEqual(m.parseToolBackup(raw, 'legacy', valid), { title: 'Copy' });
  assert.throws(() => m.parseToolBackup(raw, 'gift-card', valid));
  assert.throws(() => m.parseToolBackup(raw.replace('"version": 1', '"version": 2'), 'legacy', valid));
  assert.throws(() => m.parseToolBackup(m.toolBackup('legacy', { bad: true }), 'legacy', valid));
  assert.equal(m.sameToolValue({ a: null, b: 0 }, { b: 0, a: null }), true);
  assert.equal(m.sameToolValue({ a: null }, { a: 0 }), false);
});
check('UTF8 capacity permits large valid round trips and refuses oversize saves before storage changes', () => {
  const storage = fake(), cell = m.durableCell(storage, 'legacy', null, valid);
  const large = { title: 'é'.repeat(1_100_000) };
  const raw = m.toolBackup('legacy', large); assert.ok(new TextEncoder().encode(raw).byteLength > 2_000_000);
  assert.deepEqual(m.parseToolBackup(raw, 'legacy', valid), large); assert.equal(cell.write(large), true);
  const saved = storage.getItem('charitology.legacy');
  assert.equal(cell.write({ title: 'é'.repeat(4_000_000) }), false); assert.equal(storage.getItem('charitology.legacy'), saved); assert.equal(cell.snapshot().unsaved, true);
});
check('actual older tool modules and new storage pass strict TypeScript', () => {
  const names = ['giving-dashboard', 'charitology-wrapped', 'cost-effectiveness-model-kit', 'disaster-response-guide', 'due-diligence-checklist', 'gift-giving', 'grant-evaluator', 'impact-measurement-toolkit', 'legacy-planner', 'one-click-split', 'portfolio-builder', 'values-compass'];
  const virtual = new Map();
  for (const name of names) {
    const file = path.resolve(`src/components/tools/${name}.astro`), text = fs.readFileSync(file, 'utf8');
    let i = 0; for (const match of text.matchAll(/<script>([\s\S]*?)<\/script>/g)) virtual.set(`${file}.donor-${i++}.ts`, `${match[1]}\nexport {};`);
    assert.match(text, name === 'giving-dashboard' ? /loadGifts/ : /durable-store/, `${name} uses guarded storage`);
  }
  const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile), parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const options = { ...parsed.options, lib: ['lib.esnext.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'], noEmit: true };
  const host = ts.createCompilerHost(options), get = host.getSourceFile.bind(host), exists = host.fileExists.bind(host), readFile = host.readFile.bind(host);
  host.getSourceFile = (name, language, onError, create) => virtual.has(name) ? ts.createSourceFile(name, virtual.get(name), language, true) : get(name, language, onError, create);
  host.fileExists = name => virtual.has(name) || exists(name);
  host.readFile = name => virtual.get(name) ?? readFile(name);
  const program = ts.createProgram([...virtual.keys(), path.resolve('src/lib/client/durable-store.ts'), path.resolve('node_modules/astro/client.d.ts')], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, diagnostics.map(d => `${d.file?.fileName ?? ''}:${d.start == null ? '' : d.file.getLineAndCharacterOfPosition(d.start).line + 1} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`).join('\n'));
});
console.log(`✓ Donor records: ${groups} groups passed (nullable depth, actual storage, capacity and twelve strict UI modules).`);
