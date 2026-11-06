/* MIT License. Copyright (c) 2026 Charitology contributors.
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { ROWS, mulberry32, triangular, quantile, failNumeric, finiteResult, multiply, divide } from './random.mjs';
export { ROWS, NumericalError, isNumericalIssue } from './random.mjs';

const PARTS = ['low', 'likely', 'high'];
const PERCENT = ['works', 'anyway'];
const STRICT = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/;
const ownedEvaluations = new WeakMap();

export class AdmissionError extends Error {
  constructor(field, reason) {
    super('Invalid model input.');
    this.name = 'AdmissionError';
    this.code = 'invalid-input';
    this.field = field;
    this.reason = reason;
  }
}
const invalid = (field, reason) => { throw new AdmissionError(field, reason); };
function record(value, keys, field) {
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    invalid(field, 'shape');
  const ds = Object.getOwnPropertyDescriptors(value), all = Reflect.ownKeys(value);
  if (all.length !== keys.length || keys.some(k => !Object.hasOwn(ds, k) || !Object.hasOwn(ds[k], 'value') || ds[k].enumerable !== true) ||
    all.some(k => typeof k !== 'string' || !keys.includes(k))) invalid(field, 'shape');
}
function triple(value, field) {
  if (!Array.isArray(value) || value.length !== 3 || Object.getPrototypeOf(value) !== Array.prototype)
    invalid(field, 'shape');
  const keys = Reflect.ownKeys(value), ds = Object.getOwnPropertyDescriptors(value);
  if (keys.length !== 4 || ['0', '1', '2', 'length'].some(k => !Object.hasOwn(ds, k) || !Object.hasOwn(ds[k], 'value')) ||
    ['0', '1', '2'].some(k => ds[k].enumerable !== true))
    invalid(field, 'shape');
}
function rowBounds(row, values, percent) {
  const [low, mode, high] = values;
  if (values.some(v => !Number.isFinite(v) || Object.is(v, -0) || v < 0)) invalid(row, 'range');
  if (!(low <= mode && mode <= high)) invalid(row, 'order');
  if ((row === 'cost' || row === 'people') && !(low > 0)) invalid(row, 'positive');
  if (row === 'works' && high > (percent ? 100 : 1) || row === 'anyway' && high > (percent ? 99 : 0.99))
    invalid(row, 'range');
  if (['works', 'effect', 'years'].includes(row) && !(mode > 0)) invalid(row, 'positive-mode');
}
function seedValue(seed) {
  if (!Number.isInteger(seed) || seed < 1 || seed > 4294967295) invalid('seed', 'range');
  return seed;
}
function text(value, field) {
  if (typeof value !== 'string' || value.length > 16384) invalid(field, 'text');
  return value;
}

/** Input-only admission never invokes a string-stripping parser or repairs -0. */
export function validateInput(input) {
  record(input, ['values', 'discount', 'seed', 'draws'], 'input');
  record(input.values, ROWS, 'input');
  const values = {};
  for (const row of ROWS) {
    triple(input.values[row], row);
    const v = input.values[row].slice();
    rowBounds(row, v, false);
    values[row] = Object.freeze(v);
  }
  if (typeof input.discount !== 'number' || !Number.isFinite(input.discount) ||
    Object.is(input.discount, -0) || input.discount < 0 || input.discount >= 1) invalid('discount', 'range');
  if (input.draws !== 5000) invalid('input', 'draw-count');
  return Object.freeze({ values: Object.freeze(values), discount: input.discount, seed: seedValue(input.seed), draws: 5000 });
}

function parseNumber(raw, parser, field, path) {
  text(raw, field);
  const trimmed = raw.trim();
  if (!trimmed || parser === 'legacy-amount-strip-v1' && !/[0-9]/.test(trimmed)) invalid(field, 'number');
  let token = trimmed;
  if (parser === 'strict-decimal-v1') {
    if (token.length > 128 || !STRICT.test(token)) invalid(field, 'number');
  } else token = token.replace(/[^0-9.\-]/g, '');
  const parsed = Number(token);
  if (Number.isNaN(parsed)) invalid(field, 'number');
  if (!Number.isFinite(parsed)) failNumeric('numeric-overflow', path, { kind: 'normalization' });
  if (parsed === 0 && /[1-9]/.test(token)) failNumeric('numeric-underflow', path, { kind: 'normalization' });
  return parsed === 0 ? 0 : parsed;
}
function percent(value, path) {
  return divide(value, 100, path, { kind: 'normalization' });
}

/** Labels are opaque writing here; Content admission owns bundle metadata limits. */
export function normalizeRaw(raw) {
  record(raw, ['parser', 'name', 'unit', 'values', 'discount', 'seed'], 'raw');
  if (!['strict-decimal-v1', 'legacy-amount-strip-v1'].includes(raw.parser)) invalid('raw', 'parser');
  text(raw.name, 'raw'); text(raw.unit, 'raw');
  record(raw.values, ROWS, 'raw');
  const values = {};
  for (const row of ROWS) {
    triple(raw.values[row], row);
    const parsed = raw.values[row].map((v, i) => parseNumber(v, raw.parser, row, `raw.values.${row}.${PARTS[i]}`));
    rowBounds(row, parsed, true);
    values[row] = PERCENT.includes(row) ? parsed.map((v, i) => percent(v, `raw.values.${row}.${PARTS[i]}`)) : parsed;
  }
  const discount = parseNumber(raw.discount, raw.parser, 'discount', 'raw.discount');
  if (!(discount >= 0 && discount < 100)) invalid('discount', 'range');
  text(raw.seed, 'seed');
  const token = raw.seed.trim();
  if (raw.parser === 'strict-decimal-v1' && !/^[1-9][0-9]{0,9}$/.test(token)) invalid('seed', 'number');
  const seed = seedValue(Number(token));
  return validateInput({ values, discount: percent(discount, 'raw.discount'), seed, draws: 5000 });
}

export function discountedYears(years, rate, context = { kind: 'likely' }) {
  if (!Number.isFinite(years) || years < 0 || !Number.isFinite(rate) || rate < 0 || rate >= 1)
    failNumeric('numeric-domain', 'discount.duration', context);
  if (years === 0) return 0;
  if (rate === 0) return years;
  const base = finiteResult(1 + rate, 'discount.base', context);
  const v = divide(1, base, 'discount.v', context);
  if (!(v > 0 && v < 1)) failNumeric('numeric-domain', 'discount.v', context);
  const denominator = finiteResult(1 - v, 'discount.denominator', context);
  if (!(denominator > 0)) failNumeric('numeric-domain', 'discount.denominator', context);
  const power = finiteResult(Math.pow(v, years), 'discount.power', context);
  if (power === 0) failNumeric('numeric-underflow', 'discount.power', context);
  if (!(power > 0 && power < 1)) failNumeric('numeric-domain', 'discount.power', context);
  const numerator = finiteResult(1 - power, 'discount.numerator', context);
  if (!(numerator > 0)) failNumeric('numeric-domain', 'discount.numerator', context);
  const duration = divide(numerator, denominator, 'discount.duration', context);
  if (!(duration > 0)) failNumeric('numeric-domain', 'discount.duration', context);
  return duration;
}

function pointAt(point, discount, context) {
  // Association is intentional: an earlier overflow cannot be hidden by later zero.
  const peopleWorks = multiply(point.people, point.works, 'outcome.people-works', context);
  const effect = multiply(peopleWorks, point.effect, 'outcome.effect', context);
  const duration = discountedYears(point.years, discount, context);
  const overDuration = multiply(effect, duration, 'outcome.duration', context);
  const counterfactual = finiteResult(1 - point.anyway, 'outcome.counterfactual', context);
  const outcome = multiply(overDuration, counterfactual, 'outcome.result', context);
  if (outcome === 0) {
    if (!(point.works === 0 || point.effect === 0 || duration === 0))
      failNumeric('numeric-underflow', 'outcome.result', context);
    return { cost: Infinity, outcome: 0 };
  }
  const cost = divide(point.cost, outcome, 'cost.ratio', context);
  if (!(cost > 0)) failNumeric('numeric-domain', 'cost.ratio', context);
  return { cost, outcome };
}
const finite = value => Object.freeze({ kind: 'finite', value });
const costValue = value => value === Infinity ? Object.freeze({ kind: 'no-outcome' }) : finite(value);
const summarize = (values, series) => Object.freeze({
  median: (series === 'costs' ? costValue : finite)(quantile(values, 0.5, series)),
  p5: (series === 'costs' ? costValue : finite)(quantile(values, 0.05, series)),
  p95: (series === 'costs' ? costValue : finite)(quantile(values, 0.95, series)),
});

export function evaluateInput(value) {
  const input = validateInput(value), random = mulberry32(input.seed);
  const costs = new Float64Array(5000), outcomes = new Float64Array(5000), point = {};
  let none = 0;
  for (let i = 0; i < 5000; i++) {
    const context = { kind: 'draw', index: i };
    for (const row of ROWS) point[row] = triangular(random(), ...input.values[row], row, context);
    const evaluated = pointAt(point, input.discount, context);
    costs[i] = evaluated.cost; outcomes[i] = evaluated.outcome;
    if (evaluated.outcome === 0) none++;
  }
  costs.sort(); outcomes.sort();
  const cost = summarize(costs, 'costs'), outcome = summarize(outcomes, 'outcomes');
  const mode = Object.fromEntries(ROWS.map(row => [row, input.values[row][1]]));
  const likelyPoint = pointAt(mode, input.discount, { kind: 'likely' });
  if (!(likelyPoint.outcome > 0 && Number.isFinite(likelyPoint.cost)))
    failNumeric('numeric-domain', 'cost.ratio', { kind: 'likely' });
  const likely = Object.freeze({ cost: finite(likelyPoint.cost), outcome: finite(likelyPoint.outcome) });
  const rows = ROWS.map(row => {
    const atLow = pointAt({ ...mode, [row]: input.values[row][0] }, input.discount,
      { kind: 'sensitivity', row, endpoint: 'low' }).cost;
    const atHigh = pointAt({ ...mode, [row]: input.values[row][2] }, input.discount,
      { kind: 'sensitivity', row, endpoint: 'high' }).cost;
    const lo = Math.min(atLow, atHigh), hi = Math.max(atLow, atHigh);
    const swing = hi === lo ? 0 : hi === Infinity ? Infinity :
      finiteResult(hi - lo, `sensitivity.${row}.swing`, { kind: 'sensitivity', row, endpoint: 'swing' });
    return { key: row, atLow, atHigh, lo, hi, swing };
  });
  rows.sort((a, b) => b.swing - a.swing || ROWS.indexOf(a.key) - ROWS.indexOf(b.key));
  const sensitivity = Object.freeze({ base: finite(likelyPoint.cost), rows: Object.freeze(rows.map(r => Object.freeze({
    key: r.key, atLow: costValue(r.atLow), atHigh: costValue(r.atHigh), lo: costValue(r.lo), hi: costValue(r.hi),
    swing: r.swing === Infinity ? Object.freeze({ kind: 'unbounded' }) : finite(r.swing),
  }))) });
  const data = Object.freeze({ draws: 5000, seed: input.seed, none, cost, outcome, likely, sensitivity,
    numericalPolicy: 'guarded-finite-intermediates-v1' });
  const evaluation = Object.freeze({ ...data, costs: costs.slice(), outcomes: outcomes.slice() });
  ownedEvaluations.set(evaluation, { input, data, costs, outcomes });
  return evaluation;
}

/** Detached copies from engine-owned data; mutation of public arrays is inert. */
export function snapshotEvaluation(evaluation) {
  const found = ownedEvaluations.get(evaluation);
  if (!found) throw new TypeError('An owned engine evaluation is required.');
  return { input: found.input, data: found.data, costs: found.costs.slice(), outcomes: found.outcomes.slice() };
}
