import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { evaluateInput, normalizeRaw, validateInput, discountedYears, snapshotEvaluation,
  NumericalError, AdmissionError, isNumericalIssue, ROWS } from './interpretations/v1/arithmetic.mjs';
import { mulberry32, triangular, quantile, multiply } from './interpretations/v1/random.mjs';
import { canonical, hashValue, sha256, inputHash, encodeArray, hashArray,
  makeRecordedRun } from './interpretations/v1/encoding.mjs';

// Compile the actual unchanged legacy modules in memory; no stand-in evaluator.
const legacyModule = async name => {
  const output = await build({ entryPoints: [new URL(`../client/${name}.ts`, import.meta.url).pathname],
    bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].contents).toString('base64'));
};
const [legacy, oldRandom] = await Promise.all([legacyModule('models'), legacyModule('montecarlo')]);
const sha = b => createHash('sha256').update(b).digest('hex');
const ordinary = { cost: [100, 200, 500], people: [10, 20, 40], works: [0.2, 0.6, 0.9],
  effect: [0.1, 1, 2], years: [0.5, 1, 3], anyway: [0, 0.1, 0.5] };
const base = { cost: 100, people: 10, works: 1, effect: 1, years: 1, anyway: 0 };
const fixed = changes => Object.fromEntries(ROWS.map(k => [k, Array(3).fill(changes[k] ?? base[k])]));
const input = (values = fixed({}), discount = 0, seed = 42) => ({ values, discount, seed, draws: 5000 });
const pin = { id: 'charitology-ce-triangular-js-v1', version: 1, definitionHash: 'a'.repeat(64) }; // test pin only
const number = tagged => tagged.kind === 'no-outcome' || tagged.kind === 'unbounded' ? Infinity : tagged.value;
const untag = value => value && typeof value === 'object' && 'kind' in value ? number(value) :
  Array.isArray(value) ? value.map(untag) : value && typeof value === 'object' ?
    Object.fromEntries(Object.entries(value).map(([k, v]) => [k, untag(v)])) : value;
const draw = { kind: 'draw', index: 0 };
const refusal = (action, code, path, context) => assert.throws(action, error => {
  assert.ok(error instanceof NumericalError);
  assert.ok(isNumericalIssue(error.issue));
  assert.equal(error.issue.code, code); assert.equal(error.issue.path, path);
  if (context) assert.deepEqual(error.issue.context, context);
  return true;
});
const rawFrom = (i, parser = 'legacy-amount-strip-v1') => ({ parser, name: '', unit: '',
  values: Object.fromEntries(ROWS.map(k => [k, i.values[k].map(v => String(v * (['works', 'anyway'].includes(k) ? 100 : 1)))])),
  discount: String(i.discount * 100), seed: String(i.seed) });

function compare(values, discount, seed) {
  const i = input(values, discount, seed), actual = evaluateInput(i);
  const old = legacy.runModel({ ...values, discount }, 5000, seed);
  assert.deepEqual(actual.costs, old.costs); assert.deepEqual(actual.outcomes, old.outcomes);
  assert.deepEqual(untag(actual.cost), old.cost); assert.deepEqual(untag(actual.outcome), old.outcome);
  assert.equal(actual.none, old.none); assert.equal(actual.seed, old.seed); assert.equal(actual.draws, old.draws);
  assert.deepEqual(untag(actual.sensitivity), legacy.sensitivity({ ...values, discount }));
  const p = legacy.likelyPoint({ ...values, discount });
  assert.equal(actual.likely.cost.value, legacy.costPerOutcomeAt(p, discount));
  assert.equal(actual.likely.outcome.value, legacy.outcomesAt(p, discount));
  return actual;
}

test('old arithmetic/PRNG/format source bytes remain the independently reviewed baseline', async () => {
  const expected = {
    models: 'dc3b74c3239175c9551fbf2b993f7b5d911adcce963ab147384c6a17ba864015',
    montecarlo: 'deda9cccee58317fd0a7e40df371d93f44ae46f1c0a949b6fecf7c0d742e4203',
    format: 'e552755beb998fbd9c9f0d14ef79689011016ed1dd263eb34cc0b8f39c66a6e9',
  };
  for (const [name, digest] of Object.entries(expected))
    assert.equal(sha(await readFile(new URL(`../client/${name}.ts`, import.meta.url))), digest);
});

test('ordinary seeds match every actual legacy sorted element and prior independent array fingerprints', async () => {
  const expected = {
    1: ['06d3b5f2e4c07bc515f056aeabba39c60f60d1d9b83e0d54f6fc2c004fc74e8a', '4a65dfbb56835274f62f4251f44c1fbdfd349c7cec91f16a898383fb5fb7cc97'],
    42: ['99c086c30b8af68f8e098a79c8135f9a9ea4531a687624b3f8491a2f3dfdbacb', '14617be2047727459de9f8ebb49e04c460eb2f8b658b6ddfeba86ebc58e7b55f'],
    4294967295: ['d0981d015049a40afdecaf869f7d2a2e2f705c364a63ca1a9e3d01167708ccdf', '6319f6ad93a4450a6f70aeeb02bb33995875029cd6cac1e2add829b33a8cc785'],
  };
  for (const seed of [1, 42, 4294967295]) {
    const a = compare(ordinary, 0.03, seed);
    assert.equal(await hashArray('costs', a.costs), expected[seed][0]);
    assert.equal(await hashArray('outcomes', a.outcomes), expected[seed][1]);
    const next = mulberry32(seed), oldNext = oldRandom.mulberry32(seed);
    for (let i = 0; i < 30000; i++) assert.equal(next(), oldNext());
  }
});

test('constant rows still consume six uniforms; endpoint modes, fractional years and undiscounted vectors remain exact', () => {
  const fixtures = [fixed({}), { ...fixed({}), cost: [100, 100, 500] },
    { ...fixed({}), cost: [100, 500, 500] }, { ...fixed({}), people: [1, 5, 10] },
    { ...ordinary, years: [0, 0.5, 2] }, { ...ordinary, works: [0, 0.6, 1], effect: [0, 2, 2] }];
  for (const seed of [1, 42, 4294967295]) for (const values of fixtures) compare(values, 0, seed);
});

test('actual PRNG boundary zero produces one genuine no-outcome draw, not numeric refusal', () => {
  for (const [row, call] of [['works', 3], ['effect', 4], ['years', 5]]) {
    // a becomes exactly uint32 zero at this call; both odd imul transforms preserve zero.
    const seed = (-call * 0x6d2b79f5) >>> 0;
    const values = { ...fixed({}), [row]: [0, 1, 1] };
    const a = compare(values, 0, seed);
    assert.equal(a.none, 1); assert.equal(a.costs[4999], Infinity); assert.equal(a.outcomes[0], 0);
    assert.ok(a.sensitivity.rows.some(r => r.key === row && r.swing.kind === 'unbounded'));
  }
});

test('guarded triangular sampling preserves legal endpoints and constants', () => {
  for (const v of [0, Number.MIN_VALUE, 1, 1e200])
    assert.equal(triangular(0.25, v, v, v, 'cost', draw), v);
  for (const triple of [[0, 0, 1], [0, 1, 1], [1, 3, 4]]) for (const u of [0, 0.25, 0.5, 0.9999999999999999])
    assert.equal(triangular(u, ...triple, 'works', draw), oldRandom.triangular(u, ...triple));
  assert.equal(triangular(0, 0, 1, 2, 'works', draw), 0);
});

test('triangular scale/product/split/result zero collapse and overflow refuse before sqrt/classification', () => {
  refusal(() => triangular(0.25, 0, 5e-201, 1e-200, 'effect', draw), 'numeric-underflow', 'sample.effect.left-product', draw);
  refusal(() => triangular(0.25, 0, 1e-323, 1e-323, 'effect', draw), 'numeric-underflow', 'sample.effect.left-scale');
  refusal(() => triangular(0.5, 0, Number.MIN_VALUE, Number.MAX_VALUE, 'effect', draw), 'numeric-underflow', 'sample.effect.split');
  refusal(() => triangular(Number.MIN_VALUE, 0, 0, 1, 'effect', draw), 'numeric-underflow', 'sample.effect.result');
  refusal(() => triangular(0.25, 0, Number.MAX_VALUE, Number.MAX_VALUE, 'effect', draw), 'numeric-overflow', 'sample.effect.left-product');
  refusal(() => triangular(0.5, 0, 0, Number.MAX_VALUE, 'effect', draw), 'numeric-overflow', 'sample.effect.right-product');
  refusal(() => triangular(1, 0, 1, 1, 'effect', draw), 'numeric-domain', 'sample.effect.u');
  refusal(() => triangular(0.5, 2, 1, 3, 'effect', draw), 'numeric-domain', 'sample.effect.span');
});

test('all actual known model failures refuse with closed correct-phase issues and no partial run', () => {
  refusal(() => evaluateInput(input(fixed({}), 1e-17)), 'numeric-domain', 'discount.v', draw);
  refusal(() => evaluateInput(input(fixed({ people: 1e308, effect: 1e308 }))), 'numeric-overflow', 'outcome.effect', draw);
  refusal(() => evaluateInput(input(fixed({ cost: 1e-120, people: 1e120, effect: 1e120 }))), 'numeric-underflow', 'cost.ratio', draw);
  refusal(() => evaluateInput(input({ ...fixed({ people: 1 }), effect: [0, 5e-201, 1e-200] })),
    'numeric-underflow', 'sample.effect.right-product', draw);
  // Genuine zero at a later factor must not conceal earlier overflow.
  const overflow = { ...fixed({ people: 1e308, effect: 1e308 }), years: [0, 1, 1] };
  refusal(() => evaluateInput(input(overflow)), 'numeric-overflow', 'outcome.effect', draw);
});

test('discount cancellation, power-tail zero, tiny positive years and division overflow are distinct refusals', () => {
  assert.equal(discountedYears(0, 0.5), 0); assert.equal(discountedYears(1.5, 0), 1.5);
  assert.equal(discountedYears(1.5, 0.03), legacy.discountedYears(1.5, 0.03));
  refusal(() => discountedYears(1e308, 0.5), 'numeric-underflow', 'discount.power', { kind: 'likely' });
  refusal(() => discountedYears(Number.MIN_VALUE, 0.03), 'numeric-domain', 'discount.power');
  refusal(() => evaluateInput(input(fixed({ cost: Number.MAX_VALUE, people: 1, effect: Number.MIN_VALUE }))),
    'numeric-overflow', 'cost.ratio', draw);
  refusal(() => evaluateInput(input(fixed({ people: Number.MIN_VALUE, works: Number.MIN_VALUE }))),
    'numeric-underflow', 'outcome.people-works', draw);
});

test('required sensitivity endpoint failures reject after finite draws and likely summaries', () => {
  const low = { ...fixed({}), effect: [Number.MIN_VALUE, 1, 1] };
  refusal(() => evaluateInput(input(low)), 'numeric-overflow', 'cost.ratio',
    { kind: 'sensitivity', row: 'effect', endpoint: 'low' });
  const high = { ...fixed({}), years: [0, 1, 1075] };
  refusal(() => evaluateInput(input(high, 0.9999999999999999)), 'numeric-underflow', 'discount.power',
    { kind: 'sensitivity', row: 'years', endpoint: 'high' });
});

test('type7 integer/equal/infinite-upper branches remain exact; interpolation collapse never becomes zero', () => {
  assert.equal(quantile(new Float64Array([1, Infinity]), 0.5, 'costs'), Infinity);
  assert.equal(quantile(new Float64Array([Infinity, Infinity]), 0.5, 'costs'), Infinity);
  assert.equal(quantile(new Float64Array([2e-323, 2e-323]), 0.5, 'costs'), 2e-323);
  assert.equal(quantile(new Float64Array([0, 0]), 0.5, 'outcomes'), 0);
  assert.equal(quantile(new Float64Array([1, 2, 3]), 0.5, 'costs'), 2);
  for (const q of [0.05, 0.5, 0.95]) assert.equal(quantile(new Float64Array([1, 5, 10]), q, 'costs'), oldRandom.quantile([1, 5, 10], q));
  refusal(() => quantile(new Float64Array([Number.MIN_VALUE, 2 * Number.MIN_VALUE]), 0.5, 'costs'),
    'numeric-underflow', 'quantile.costs.fractional-product', { kind: 'quantile', series: 'costs', q: 0.5 });
  refusal(() => quantile(new Float64Array([0, Infinity]), 0.5, 'outcomes'), 'numeric-domain', 'quantile.outcomes.result');
});

test('legitimate finite subnormals survive the whole run, summaries, sensitivity and encoding', async () => {
  const e = compare(fixed({ cost: Number.MIN_VALUE, people: 1, effect: Number.MIN_VALUE }), 0, 42);
  assert.equal(e.outcome.median.value, Number.MIN_VALUE); assert.equal(e.cost.median.value, 1); assert.equal(e.none, 0);
  const sub = compare({ ...fixed({ cost: 2e-322, people: 1 }), people: [1, 5, 10] }, 0, 42);
  assert.equal(sub.cost.median.value, 4e-323); assert.equal(sub.none, 0);
  assert.ok(sub.costs.every(v => v > 0 && Number.isFinite(v)));
  assert.equal(encodeArray('costs', sub.costs).byteLength, 40030);
  const strict = rawFrom(input(fixed({ cost: 1, people: 1 }), 0), 'strict-decimal-v1');
  strict.values.cost = Array(3).fill('0.' + '0'.repeat(119) + '1');
  strict.values.people = Array(3).fill('1' + '0'.repeat(100));
  strict.values.effect = Array(3).fill('1' + '0'.repeat(100));
  const strictRun = evaluateInput(normalizeRaw(strict));
  assert.ok(strictRun.cost.median.value > 0 && strictRun.cost.median.value < 2.2250738585072014e-308);
  await makeRecordedRun(pin, normalizeRaw(strict), strictRun);
});

test('raw legacy parser preserves exact old amount and seed interpretation; strict mode never strips', () => {
  const raw = rawFrom(input()); raw.values.cost = ['1e3', '1e3', '1e3'];
  for (const seed of ['+42', '42.0', '0x2a', ' 42 ']) {
    raw.seed = seed; const i = normalizeRaw(raw); assert.equal(i.seed, 42); assert.deepEqual(i.values.cost, [13, 13, 13]);
  }
  raw.seed = '1e3'; assert.equal(normalizeRaw(raw).seed, 1000);
  raw.parser = 'strict-decimal-v1'; assert.throws(() => normalizeRaw(raw), AdmissionError);
  const clean = rawFrom(input(), 'strict-decimal-v1'); clean.discount = ' -0.000 '; clean.values.anyway = ['-0', '+0.0', '.0'];
  const normalized = normalizeRaw(clean); assert.equal(normalized.discount, 0); assert.ok(!Object.is(normalized.discount, -0));
  assert.deepEqual(normalized.values.anyway, [0, 0, 0]);
  for (const invalid of ['1e3', '$100', '1,000', '.', '1 2', 'NaN', 'Infinity', '1'.repeat(129)]) {
    const r = structuredClone(clean); r.values.cost = Array(3).fill(invalid); assert.throws(() => normalizeRaw(r), AdmissionError);
  }
});

test('Number conversion and percent collapse refuse before range/zero normalization', () => {
  const raw = rawFrom(input()), tiny = '0.' + '0'.repeat(322) + '1';
  for (const row of ['works', 'anyway']) {
    const r = structuredClone(raw); r.values[row] = Array(3).fill(tiny);
    refusal(() => normalizeRaw(r), 'numeric-underflow', `raw.values.${row}.low`, { kind: 'normalization' });
  }
  const discount = { ...raw, discount: tiny };
  refusal(() => normalizeRaw(discount), 'numeric-underflow', 'raw.discount');
  const zero = structuredClone(raw); zero.values.effect = Array(3).fill('0.' + '0'.repeat(400) + '1');
  refusal(() => normalizeRaw(zero), 'numeric-underflow', 'raw.values.effect.low');
  const overflow = structuredClone(raw); overflow.values.cost = Array(3).fill('9'.repeat(400));
  refusal(() => normalizeRaw(overflow), 'numeric-overflow', 'raw.values.cost.low');
  const zeros = { ...raw, discount: '-0.' + '0'.repeat(400) };
  assert.equal(normalizeRaw(zeros).discount, 0);
});

test('closed input/raw admission rejects ignored properties/accessors/sparse arrays and invalid numerical bounds', () => {
  for (const changed of [{ ...input(), seed: 0 }, { ...input(), draws: 4999 }, { ...input(), discount: -0 },
    { ...input(), discount: Infinity }, { ...input(), ignored: true }, { ...input(), values: { ...fixed({}), ignored: [1, 1, 1] } },
    input({ ...fixed({}), years: [0, 0, 1] }), input({ ...fixed({}), effect: [-1, 1, 2] }),
    input({ ...fixed({}), works: [0, 1, 1.1] }), input({ ...fixed({}), anyway: [0, 0, 1] }),
    input({ ...fixed({}), cost: [2, 1, 3] }), input({ ...fixed({}), people: [0, 1, 2] })])
    assert.throws(() => validateInput(changed), AdmissionError);
  const sparse = input(); delete sparse.values.cost[1]; assert.throws(() => validateInput(sparse), AdmissionError);
  const decorated = input(); decorated.values.cost.extra = true; assert.throws(() => validateInput(decorated), AdmissionError);
  let called = false; const accessor = input(); Object.defineProperty(accessor, 'seed', { get() { called = true; return 42; } });
  assert.throws(() => validateInput(accessor), AdmissionError); assert.equal(called, false);
  const normalized = validateInput(input()); assert.ok(Object.isFrozen(normalized.values.cost));
});

test('array fingerprints use independent big-endian Buffer encoding and exact zero/sentinel policy', async () => {
  const e = evaluateInput(input(ordinary, 0.03));
  for (const series of ['costs', 'outcomes']) {
    const prefix = Buffer.from('charitology-ce-array-v1\n' + series + '\n'), independent = Buffer.alloc(prefix.length + 40000);
    prefix.copy(independent); e[series].forEach((v, i) => independent.writeDoubleBE(v === 0 ? 0 : v, prefix.length + 8 * i));
    assert.deepEqual(Buffer.from(encodeArray(series, e[series])), independent);
    assert.equal(await hashArray(series, e[series]), sha(independent));
  }
  assert.equal(encodeArray('outcomes', new Float64Array(5000).fill(-0)).byteLength, 40033);
  assert.throws(() => encodeArray('costs', new Float64Array(5000)), TypeError);
  assert.throws(() => encodeArray('outcomes', new Float64Array(5000).fill(Infinity)), TypeError);
  assert.throws(() => encodeArray('costs', new Float64Array(4999).fill(1)), TypeError);
});

test('engine-owned evaluation rejects structural forgery and input mismatch; display mutations cannot change a record', async () => {
  const i = input(ordinary, 0.03), e = evaluateInput(i), first = await makeRecordedRun(pin, i, e);
  e.costs.fill(Infinity); e.outcomes.fill(0); snapshotEvaluation(e).costs.fill(0);
  assert.deepEqual(await makeRecordedRun(pin, i, e), first);
  await assert.rejects(makeRecordedRun(pin, i, { ...e }), TypeError);
  await assert.rejects(makeRecordedRun(pin, { ...i, seed: 1 }, e), TypeError);
  assert.ok(Object.isFrozen(first.sensitivity.rows[0].swing));
  const p = inputHash(pin, i); i.values.cost[0] = 1;
  assert.equal(await p, first.inputHash);
  const bytes = new Uint8Array([1, 2, 3]), h = sha256(bytes); bytes.fill(9);
  assert.equal(await h, sha(new Uint8Array([1, 2, 3])));
});

test('canonical JSON/hash domain is exact and rejects noncanonical or excessive values without getter execution', async () => {
  const value = { z: 'é', a: [1, true, null, '😀'] };
  assert.equal(canonical(value), '{"a":[1,true,null,"😀"],"z":"é"}');
  assert.equal(await hashValue('run', value), sha(Buffer.from('charitology-model-bundles/v1/run\n' + canonical(value) + '\n')));
  for (const invalid of [NaN, Infinity, -0, undefined, '\ud800', '\udc00', new Date(), new Map(),
    Object.assign([1], { extra: 2 }), [1, , 2], JSON.parse('{"__proto__":1}'), { prototype: 1 }, { constructor: 1 }])
    assert.throws(() => canonical(invalid), TypeError);
  const cycle = {}; cycle.me = cycle; assert.throws(() => canonical(cycle), TypeError);
  let getter = false; const access = {}; Object.defineProperty(access, 'x', { get() { getter = true; return 1; } });
  assert.throws(() => canonical(access), TypeError); assert.equal(getter, false);
  let depth = 0; for (let i = 0; i < 33; i++) depth = [depth]; assert.throws(() => canonical(depth), TypeError);
  assert.throws(() => canonical('x'.repeat(2097153)), TypeError);
  assert.throws(() => hashValue('caller-invented', {}), TypeError);
});

test('numerical issue contexts cannot be relabeled and frozen errors contain no arbitrary source text', () => {
  let issue;
  try { multiply(1e-200, 1e-200, 'outcome.effect', draw); } catch (error) { issue = error.issue; }
  assert.ok(isNumericalIssue(issue)); assert.ok(Object.isFrozen(issue)); assert.ok(Object.isFrozen(issue.context));
  for (const changed of [{ ...issue, phase: 'sample' }, { ...issue, path: 'sample.anything.evil' },
    { ...issue, context: { kind: 'normalization' } }, { ...issue, context: { kind: 'draw', index: 5000 } },
    { ...issue, message: 'untrusted' }]) assert.equal(isNumericalIssue(changed), false);
  assert.throws(() => new NumericalError('numeric-underflow', 'cost.ratio', { kind: 'quantile', series: 'costs', q: 0.5 }), TypeError);
});

test('runtime inventory contains only exact relative static imports inside the three frozen source files', async () => {
  const names = ['arithmetic', 'encoding', 'random'];
  for (const name of names) {
    const source = await readFile(new URL(`./interpretations/v1/${name}.mjs`, import.meta.url), 'utf8');
    assert.match(source, /MIT License/);
    for (const [, path] of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g))
      assert.ok(names.some(n => path === `./${n}.mjs`));
    assert.doesNotMatch(source, /\b(?:eval|Function|fetch|localStorage)\s*\(|\bimport\s*\(/);
  }
});
