import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { LIMITS, cloneJson, parseJsonBytes, canonicalJson, canonicalBytes, hashValue, savedStringHash, prettyBytes, ModelBundleError } from './codec.mjs';
import { validateEditorForm, formSize, TEXT_FORM_KEYS, JSON_FORM_KEYS } from './graph.mjs';
import { ROWS } from './content.mjs';
const bytes = value => new TextEncoder().encode(value);
const refuses = (fn, code) => assert.throws(fn, error => error instanceof ModelBundleError && (!code || error.code === code));
function form(fill = '') {
  return { raw: { parser: 'strict-decimal-v1', name: fill, unit: fill,
    values: Object.fromEntries(ROWS.map(row => [row, [fill, fill, fill]])), discount: fill, seed: fill },
  text: Object.fromEntries(TEXT_FORM_KEYS.map(key => [key, fill])), json: Object.fromEntries(JSON_FORM_KEYS.map(key => [key, fill])) };
}
function leaves(value) { return [
  [value.raw, 'name'], [value.raw, 'unit'], ...ROWS.flatMap(row => [0, 1, 2].map(i => [value.raw.values[row], i])),
  [value.raw, 'discount'], [value.raw, 'seed'], ...TEXT_FORM_KEYS.map(key => [value.text, key]), ...JSON_FORM_KEYS.map(key => [value.json, key])
]; }
test('actual strict codec decodes detached frozen JSON and uses code-unit sorted canonical keys', () => {
  const parsed = parseJsonBytes(bytes('{"z": [1, true, null], "a":"é", "💠":"x"}'));
  assert.equal(Object.getPrototypeOf(parsed), Object.prototype); assert.ok(Object.isFrozen(parsed)); assert.ok(Object.isFrozen(parsed.z));
  assert.equal(canonicalJson(parsed), '{"a":"é","z":[1,true,null],"💠":"x"}');
  assert.notEqual(canonicalJson({ value: 'é' }), canonicalJson({ value: 'é' }));
  assert.equal(canonicalJson({ b: 1e21, a: 1e-7 }), '{"a":1e-7,"b":1e+21}');
  const source = { a: [1] }, copy = cloneJson(source); source.a[0] = 9; assert.equal(copy.a[0], 1);
});
test('actual byte decoder rejects malformed UTF-8, BOM, decoded duplicate/unsafe keys and malformed JSON', () => {
  refuses(() => parseJsonBytes(Uint8Array.from([0xc0, 0xaf])), 'invalid-utf8');
  refuses(() => parseJsonBytes(Uint8Array.from([0xef, 0xbb, 0xbf, 0x30])), 'bom');
  refuses(() => parseJsonBytes(bytes('{"a":1,"\\u0061":2}')), 'duplicate-key');
  for (const key of ['__proto__', 'constructor', 'prototype']) refuses(() => parseJsonBytes(bytes(`{"${key}":0}`)), 'unsafe-key');
  for (const value of ['{"a":1,}', '[1,]', '01', '+1', '1.', '.1', 'true false', 'nullx', '"\\x20"', '"\n"', 'NaN', 'Infinity', '-Infinity', '']) refuses(() => parseJsonBytes(bytes(value)));
  refuses(() => parseJsonBytes(bytes('1e999')), 'nonfinite-number');
  for (const value of ['-0', '-0.0', '-0e0', '-1e-9999']) refuses(() => parseJsonBytes(bytes(value)), 'negative-zero');
  for (const value of ['"\\ud800"', '"\\udfff"', '"\\ud800a"']) refuses(() => parseJsonBytes(bytes(value)), 'unpaired-surrogate');
  assert.equal(parseJsonBytes(bytes('"\\ud83d\\udca0"')), '💠');
});
test('actual object boundary refuses accessors before reading them, exotic/decorated/sparse/symbol and cycles', () => {
  let reads = 0; const accessor = {}; Object.defineProperty(accessor, 'a', { enumerable: true, get() { reads++; return 1; } });
  refuses(() => cloneJson(accessor), 'accessor-or-hidden-key'); assert.equal(reads, 0);
  for (const value of [new Date(), new Number(1), new Map(), new Uint8Array([1]), Object.create({ custom: true })]) refuses(() => cloneJson(value), 'exotic-object');
  const sparse = new Array(1); refuses(() => cloneJson(sparse), 'decorated-or-sparse-array');
  const decorated = [1]; decorated.x = 1; refuses(() => cloneJson(decorated), 'decorated-or-sparse-array');
  const hiddenArray = [1]; Object.defineProperty(hiddenArray, '0', { enumerable: false }); refuses(() => cloneJson(hiddenArray), 'decorated-or-sparse-array');
  const hidden = {}; Object.defineProperty(hidden, 'a', { value: 1 }); refuses(() => cloneJson(hidden), 'accessor-or-hidden-key');
  refuses(() => cloneJson({ [Symbol('a')]: 1 }), 'symbol-key');
  const cyclic = {}; cyclic.a = cyclic; refuses(() => cloneJson(cyclic), 'cycle');
  for (const value of [undefined, () => 1, 1n, Symbol(), NaN, Infinity, -Infinity, -0, '\ud800']) refuses(() => cloneJson(value));
  const ownUnsafe = Object.create(null); ownUnsafe.__proto__ = 1; refuses(() => cloneJson(ownUnsafe), 'unsafe-key');
  assert.equal({}.polluted, undefined);
});
test('actual parser and canonical boundary enforce exact depth, node and byte limits plus one', () => {
  const nested = depth => '['.repeat(depth) + '0' + ']'.repeat(depth);
  assert.ok(parseJsonBytes(bytes(nested(32)))); refuses(() => parseJsonBytes(bytes(nested(33))), 'depth-limit');
  const at = `[${Array(99999).fill('0').join(',')}]`;
  assert.equal(parseJsonBytes(bytes(at)).length, 99999);
  refuses(() => parseJsonBytes(bytes(`[${Array(100000).fill('0').join(',')}]`)), 'node-limit');
  const exact = bytes(`"${'x'.repeat(LIMITS.selected - 2)}"`);
  assert.equal(parseJsonBytes(exact).length, LIMITS.selected - 2);
  refuses(() => parseJsonBytes(bytes(`"${'x'.repeat(LIMITS.selected - 1)}"`)), 'byte-limit');
  const disguised = new Uint8Array(LIMITS.selected + 1); Object.defineProperty(disguised, 'byteLength', { value: 0 });
  refuses(() => parseJsonBytes(disguised), 'byte-limit');
  const small = { a: '💠' }; const size = canonicalBytes(small).length;
  assert.equal(canonicalBytes(small, { maxBytes: size }).length, size); refuses(() => canonicalBytes(small, { maxBytes: size - 1 }), 'byte-limit');
  assert.equal(prettyBytes({}).length, 3); refuses(() => prettyBytes({}, 2), 'byte-limit');
  for (const options of [{ maxDepth: 33 }, { maxNodes: 100001 }, { maxBytes: LIMITS.selected + 1 }, { maxDepth: -1 }, { maxNodes: Infinity }]) {
    refuses(() => parseJsonBytes(bytes('0'), options), 'invalid-codec-limit');
    refuses(() => canonicalJson(0, options), 'invalid-codec-limit');
  }
});
test('actual domain-separated hashes and corrupt saved-string fingerprints use exact documented bytes', async () => {
  const value = { z: 2, a: 1 };
  const expected = createHash('sha256').update('charitology-model-bundles/v1/content\n{"a":1,"z":2}\n').digest('hex');
  assert.equal(await hashValue('content', value), expected);
  assert.notEqual(await hashValue('content', value), await hashValue('version', value));
  await assert.rejects(hashValue('anything', value), { code: 'hash-kind' });
  const corrupt = 'x\ud800y';
  assert.equal(await savedStringHash(corrupt), createHash('sha256').update(`charitology-model-bundles/v1/saved-string\n${JSON.stringify(corrupt)}\n`).digest('hex'));
  assert.equal(await savedStringHash(null), null); assert.notEqual(await savedStringHash(''), null);
});
test('the actual 58-leaf EditorForm admits unfinished text, but no hidden leaves or lone code units', () => {
  const draft = form(); assert.equal(leaves(draft).length, 58); assert.equal(formSize(draft).leaves, 58);
  draft.json.sources = '{unfinished'; draft.text.periodFrom = 'unknown'; draft.raw.values.cost[0] = 'not yet known';
  assert.equal(validateEditorForm(draft).json.sources, '{unfinished');
  draft.raw.name = 'x'.repeat(16384); validateEditorForm(draft); draft.raw.name += 'x'; refuses(() => validateEditorForm(draft), 'text-bound');
  const extra = form(); extra.text.hidden = ''; refuses(() => validateEditorForm(extra), 'object-keys');
  const lone = form(); lone.raw.name = '\ud800'; refuses(() => validateEditorForm(lone), 'unpaired-surrogate');
  assert.match(JSON.stringify(lone), /\\ud800/); // The separate raw recovery can preserve this escaped writing; a saved form cannot.
});
test('actual maximum escaped and multibyte form fixtures hit the joint complete form cap, not invented scalar counts', () => {
  for (const char of ['"', '💠']) {
    const draft = form(), positions = leaves(draft);
    let available = LIMITS.form - canonicalBytes(draft).length;
    for (const [owner, key] of positions) {
      const cost = canonicalBytes(char).length - 2;
      const count = Math.min(Math.floor(16384 / char.length), Math.floor(available / cost));
      owner[key] = char.repeat(count); available -= count * cost;
    }
    // Fill any byte remainder with ASCII in a leaf that still has room.
    const [owner, key] = positions.find(([o, k]) => o[k].length + available <= LIMITS.leaf);
    owner[key] += 'x'.repeat(available);
    assert.equal(canonicalBytes(draft).length, LIMITS.form);
    assert.equal(formSize(validateEditorForm(draft)).canonicalBytes, LIMITS.form);
    assert.equal(parseJsonBytes(canonicalBytes(draft), { maxBytes: LIMITS.form }).raw.parser, 'strict-decimal-v1');
    const [extraOwner, extraKey] = positions.find(([o, k]) => o[k].length < LIMITS.leaf);
    extraOwner[extraKey] += 'x'; refuses(() => validateEditorForm(draft), 'byte-limit');
  }
});
