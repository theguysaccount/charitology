import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { formatMoney, formatNumber, formatMoneyTick, histogram, displayTicks, sensitivityChartDomain } from './legacy-display.mjs';
import { evaluateInput, normalizeRaw, NumericalError, AdmissionError } from './interpretations/v1/arithmetic.mjs';
import { cloneLegacyRaw, cloneWorkerRequest } from './worker-protocol.mjs';
const compiled = async path => {
  const output = await build({ entryPoints: [new URL(path, import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].contents).toString('base64'));
};
const [old, random] = await Promise.all([compiled('../client/models.ts'), compiled('../client/montecarlo.ts')]);
const values = { cost: [100, 200, 500], people: [10, 20, 40], works: [0.2, 0.6, 0.9], effect: [0.1, 1, 2], years: [0.5, 1, 3], anyway: [0, 0.1, 0.5] };
const raw = () => ({ name: '', unit: '', values: { cost: ['100', '200', '500'], people: ['10', '20', '40'], works: ['20', '60', '90'], effect: ['0.1', '1', '2'], years: ['0.5', '1', '3'], anyway: ['0', '10', '50'] }, discount: '3', seed: '42' });
const input = (changes = {}) => ({ values, discount: 0.03, seed: 42, draws: 5000, ...changes });
const untag = tag => tag.kind === 'no-outcome' || tag.kind === 'unbounded' ? Infinity : tag.value;
const sensitivity = evaluation => ({ base: untag(evaluation.sensitivity.base), rows: evaluation.sensitivity.rows.map(row => ({ ...row, ...Object.fromEntries(['atLow', 'atHigh', 'lo', 'hi', 'swing'].map(key => [key, untag(row[key])])) })) });

test('ordinary display labels match actual unchanged old formatting, including zero and sentinel conventions', () => {
  for (const value of [0, 0.00000001, 0.012, 0.18, 1, 3.33, 33.3, 333, 3000, 1e20, Infinity, NaN]) {
    assert.equal(formatMoney(value), old.dollars(value));
    assert.equal(formatNumber(value), old.sig(value));
    for (const step of [0.05, 2.5, 100, 1000]) {
      const previous = Number.isFinite(value) ? old.dollarsTick(value, step) : value === Infinity ? 'no outcome' : '—';
      const expected = value > 0 && Number.isFinite(value) && /[0-9]/.test(previous) && !/[1-9]/.test(previous) ? '$' + value.toExponential(6) : previous;
      assert.equal(formatMoneyTick(value, step), expected);
    }
  }
});
test('every positive subnormal/tiny display stays visibly nonzero without changing underlying values', () => {
  for (const value of [Number.MIN_VALUE, 4e-323, 1e-200, 1e-12]) {
    assert.match(formatMoney(value), /^\$[1-9]/);
    assert.match(formatNumber(value), /^[1-9]/);
    assert.match(formatMoneyTick(value, Number.MIN_VALUE), /^\$[1-9]/);
    assert.notEqual(formatMoney(value), '$0'); assert.notEqual(formatNumber(value), '0');
  }
  assert.equal(formatMoney(4e-323), '$3.952525e-323');
  assert.equal(formatNumber(0), '0'); assert.equal(formatMoney(0), '$0');
});
test('actual old ordinary histogram bins/counts/clipping are preserved for all three accepted seeds', () => {
  for (const seed of [1, 42, 4294967295]) {
    const run = old.runModel({ ...values, discount: 0.03 }, 5000, seed);
    const finite = run.costs.subarray(0, 5000 - run.none);
    const expected = random.histogram(finite, random.quantile(finite, 0.005), random.quantile(finite, 0.995), 28);
    assert.deepEqual(histogram(run), { kind: 'available', ...expected });
    assert.ok(expected.bins.length <= 128);
  }
});
test('actual guarded subnormal run succeeds; only its unsafe chart is refused and labels remain honest', () => {
  const tiny = { cost: [2e-322, 2e-322, 2e-322], people: [1, 5, 10], works: [1, 1, 1], effect: [1, 1, 1], years: [1, 1, 1], anyway: [0, 0, 0] };
  const evaluation = evaluateInput(input({ values: tiny, discount: 0 }));
  assert.equal(evaluation.none, 0); assert.ok(evaluation.costs.every(v => Number.isFinite(v) && v > 0));
  assert.deepEqual(histogram(evaluation), { kind: 'unavailable', reason: 'numeric-display-range' });
  assert.match(formatMoney(evaluation.cost.median.value), /e-323$/);
  assert.equal(Number(evaluation.cost.median.value.toPrecision(6)), evaluation.cost.median.value);
});
test('constant/no-finite/hostile or mismatched histogram inventories stay bounded and do not mutate arrays', () => {
  const costs = new Float64Array(5000).fill(10), run = { draws: 5000, none: 0, costs };
  assert.deepEqual(histogram(run), { kind: 'available', bins: [{ x0: 10, x1: 10, count: 5000 }], below: 0, above: 0 });
  assert.deepEqual(costs, new Float64Array(5000).fill(10));
  assert.deepEqual(histogram({ draws: 5000, none: 5000, costs: new Float64Array(5000).fill(Infinity) }), { kind: 'unavailable', reason: 'no-finite-cost-draws' });
  for (const candidate of [{ ...run, none: 1 }, { ...run, costs: [10] }, { ...run, draws: 4999 }, { ...run, costs: new Float64Array(5000).fill(NaN) }]) assert.equal(histogram(candidate).kind, 'unavailable');
});
test('axis and sensitivity domain plans refuse invalid/extreme/unbounded coordinates without unbounded ticks', () => {
  for (const [min, max] of [[0, 10], [100, 1000], [1e-5, 1e-4]]) {
    const plan = displayTicks(min, max);
    assert.equal(plan.kind, 'available'); assert.ok(plan.ticks.length <= 32);
    assert.deepEqual(plan.ticks, random.niceTicks(min, max, 5));
  }
  for (const args of [[0, Infinity], [-1e308, 1e308], [Number.MIN_VALUE, 5e-323], [0, 10, 33], [10, 0]]) assert.equal(displayTicks(...args).kind, 'unavailable');
  const evaluation = evaluateInput(input());
  assert.equal(sensitivityChartDomain(sensitivity(evaluation)).kind, 'available');
  const zeroLow = structuredClone(input()); zeroLow.values.works[0] = 0;
  assert.equal(sensitivityChartDomain(sensitivity(evaluateInput(zeroLow))).kind, 'unavailable');
});
test('actual legacy normalization retains original raw semantics, seed spellings and selected literal labels', () => {
  for (const [seed, expected] of [['+42', 42], ['42.0', 42], ['1e3', 1000], ['0x2a', 42]]) {
    const original = raw(); original.seed = seed; original.values.cost = ['1e3', '1e3', '1e3']; original.name = '\ud800'; original.unit = '\u0000';
    const captured = cloneLegacyRaw(original); original.values.cost[0] = '999';
    const normalized = normalizeRaw({ parser: 'legacy-amount-strip-v1', ...captured });
    assert.equal(normalized.seed, expected); assert.deepEqual(normalized.values.cost, [13, 13, 13]);
    assert.equal(captured.name, '\ud800'); assert.equal(captured.unit, '\u0000'); assert.equal(captured.values.cost[0], '1e3');
  }
});
test('raw capture refuses extras/accessors/sparse/decorated values and never invokes a getter', () => {
  let calls = 0; const accessor = raw(); Object.defineProperty(accessor, 'name', { get() { calls++; return 'unsafe'; } });
  assert.throws(() => cloneLegacyRaw(accessor)); assert.equal(calls, 0);
  const sparse = raw(); delete sparse.values.cost[0]; assert.throws(() => cloneLegacyRaw(sparse));
  const decorated = raw(); decorated.values.cost.note = 'extra'; assert.throws(() => cloneLegacyRaw(decorated));
  assert.throws(() => cloneWorkerRequest({ kind: 'legacy-run', raw: raw(), engine: () => {} }));
});
test('real raw positive-percent collapse remains a numerical refusal; negative effects remain invalid', () => {
  const collapse = raw(); collapse.values.works = Array(3).fill('0.' + '0'.repeat(322) + '1');
  assert.throws(() => normalizeRaw({ parser: 'legacy-amount-strip-v1', ...collapse }), e => e instanceof NumericalError && e.issue.code === 'numeric-underflow' && e.issue.path === 'raw.values.works.low');
  const negative = raw(); negative.values.effect[0] = '-1';
  assert.throws(() => normalizeRaw({ parser: 'legacy-amount-strip-v1', ...negative }), e => e instanceof AdmissionError && e.field === 'effect');
});
