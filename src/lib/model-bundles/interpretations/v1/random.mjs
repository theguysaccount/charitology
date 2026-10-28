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

export const ROWS = Object.freeze(['cost', 'people', 'works', 'effect', 'years', 'anyway']);
const CODES = ['numeric-underflow', 'numeric-overflow', 'numeric-domain'];
const PARTS = ['low', 'likely', 'high'];
const SAMPLE = ['u', 'span', 'mode-low', 'high-mode', 'split', 'left-scale', 'left-product',
  'right-weight', 'right-scale', 'right-product', 'root', 'result'];
const DISCOUNT = ['base', 'v', 'power', 'numerator', 'denominator', 'duration'];
const OUTCOME = ['people-works', 'effect', 'duration', 'counterfactual', 'result'];
const QUANTILE = ['difference', 'fractional-product', 'result'];
const ownKeys = (v, expected) => v !== null && typeof v === 'object' &&
  Object.getPrototypeOf(v) === Object.prototype &&
  Reflect.ownKeys(v).length === expected.length && expected.every(k =>
    Object.getOwnPropertyDescriptor(v, k)?.get === undefined &&
    Object.getOwnPropertyDescriptor(v, k)?.set === undefined && Object.hasOwn(v, k));

function issueShape(code, path, context) {
  if (!CODES.includes(code) || typeof path !== 'string' || path.length > 128) return null;
  const p = path.split('.');
  let phase;
  if (p[0] === 'raw' && (path === 'raw.discount' ||
    p.length === 4 && p[1] === 'values' && ROWS.includes(p[2]) && PARTS.includes(p[3]))) phase = 'normalize';
  else if (p.length === 3 && p[0] === 'sample' && ROWS.includes(p[1]) && SAMPLE.includes(p[2])) phase = 'sample';
  else if (p.length === 2 && p[0] === 'discount' && DISCOUNT.includes(p[1])) phase = 'discount';
  else if (p.length === 2 && p[0] === 'outcome' && OUTCOME.includes(p[1])) phase = 'outcome';
  else if (path === 'cost.ratio') phase = 'cost';
  else if (p.length === 3 && p[0] === 'quantile' && ['costs', 'outcomes'].includes(p[1]) && QUANTILE.includes(p[2])) phase = 'quantile';
  else if (p.length === 3 && p[0] === 'sensitivity' && ROWS.includes(p[1]) && p[2] === 'swing') phase = 'sensitivity';
  else return null;
  let valid = false;
  if (ownKeys(context, ['kind']) && context.kind === 'normalization') valid = phase === 'normalize';
  else if (ownKeys(context, ['kind', 'index']) && context.kind === 'draw') valid =
    Number.isInteger(context.index) && context.index >= 0 && context.index < 5000 &&
    ['sample', 'discount', 'outcome', 'cost'].includes(phase);
  else if (ownKeys(context, ['kind']) && context.kind === 'likely') valid =
    ['discount', 'outcome', 'cost'].includes(phase);
  else if (ownKeys(context, ['kind', 'row', 'endpoint']) && context.kind === 'sensitivity' && ROWS.includes(context.row)) valid =
    context.endpoint === 'swing' ? phase === 'sensitivity' && context.row === p[1] :
      ['low', 'high'].includes(context.endpoint) && ['discount', 'outcome', 'cost'].includes(phase);
  else if (ownKeys(context, ['kind', 'series', 'q']) && context.kind === 'quantile') valid =
    phase === 'quantile' && context.series === p[1] && [0.05, 0.5, 0.95].includes(context.q);
  if (!valid) return null;
  return Object.freeze({ code, phase, path, context: Object.freeze({ ...context }) });
}

export class NumericalError extends Error {
  constructor(code, path, context) {
    super('The numerical calculation is outside the supported range.');
    this.name = 'NumericalError';
    const issue = issueShape(code, path, context);
    if (!issue) throw new TypeError('Invalid internal numerical issue.');
    Object.defineProperty(this, 'issue', { value: issue, enumerable: true });
  }
}

export function isNumericalIssue(value) {
  if (!ownKeys(value, ['code', 'phase', 'path', 'context'])) return false;
  const checked = issueShape(value.code, value.path, value.context);
  return checked !== null && checked.phase === value.phase;
}

export function failNumeric(code, path, context) { throw new NumericalError(code, path, context); }
export function finiteResult(value, path, context) {
  if (!Number.isFinite(value)) failNumeric(Number.isNaN(value) ? 'numeric-domain' : 'numeric-overflow', path, context);
  return value === 0 ? 0 : value;
}
export function multiply(a, b, path, context) {
  const value = finiteResult(a * b, path, context);
  if (a > 0 && b > 0 && value === 0) failNumeric('numeric-underflow', path, context);
  return value;
}
export function divide(a, b, path, context) {
  const value = finiteResult(a / b, path, context);
  if (a > 0 && b > 0 && value === 0) failNumeric('numeric-underflow', path, context);
  return value;
}

/** Original unsigned Mulberry32; all six draws are consumed by arithmetic.mjs. */
export function mulberry32(seed) {
  if (!Number.isInteger(seed) || seed < 1 || seed > 4294967295) throw new TypeError('Invalid engine seed.');
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function triangular(u, low, mode, high, row, context) {
  if (!ROWS.includes(row)) throw new TypeError('Invalid engine row.');
  const path = part => `sample.${row}.${part}`;
  if (!Number.isFinite(u) || u < 0 || u >= 1) failNumeric('numeric-domain', path('u'), context);
  if (![low, mode, high].every(v => Number.isFinite(v) && v >= 0) || low > mode || mode > high)
    failNumeric('numeric-domain', path('span'), context);
  if (high === low) return low === 0 ? 0 : low;
  const span = finiteResult(high - low, path('span'), context);
  const left = finiteResult(mode - low, path('mode-low'), context);
  const right = finiteResult(high - mode, path('high-mode'), context);
  const split = divide(left, span, path('split'), context);
  if (split < 0 || split > 1 || mode > low && mode < high && !(split > 0 && split < 1))
    failNumeric('numeric-domain', path('split'), context);
  let value;
  if (u < split) {
    const scale = multiply(u, span, path('left-scale'), context);
    const product = multiply(scale, left, path('left-product'), context);
    const root = finiteResult(Math.sqrt(product), path('root'), context);
    value = finiteResult(low + root, path('result'), context);
  } else {
    const weight = finiteResult(1 - u, path('right-weight'), context);
    const scale = multiply(weight, span, path('right-scale'), context);
    const product = multiply(scale, right, path('right-product'), context);
    const root = finiteResult(Math.sqrt(product), path('root'), context);
    value = finiteResult(high - root, path('result'), context);
  }
  if (value < low || value > high) failNumeric('numeric-domain', path('result'), context);
  if (value === 0 && !(low === 0 && u === 0)) failNumeric('numeric-underflow', path('result'), context);
  return value;
}

/** Type7 with a dedicated +Infinity cost sentinel, never a nonfinite outcome. */
export function quantile(sorted, q, series) {
  if (!['costs', 'outcomes'].includes(series) || ![0.05, 0.5, 0.95].includes(q))
    throw new TypeError('Invalid engine quantile.');
  const context = { kind: 'quantile', series, q }, path = part => `quantile.${series}.${part}`;
  if (!(sorted instanceof Float64Array) || sorted.length < 1 || sorted.length > 5000)
    failNumeric('numeric-domain', path('result'), context);
  let prior = -1;
  for (const v of sorted) {
    if (!(Number.isFinite(v) && v >= 0 || series === 'costs' && v === Infinity) ||
      series === 'costs' && v === 0 || v < prior) failNumeric('numeric-domain', path('result'), context);
    prior = v;
  }
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.min(sorted.length - 1, lo + 1);
  const a = sorted[lo], b = sorted[hi];
  if (pos === lo || a === b) return a === 0 ? 0 : a;
  if (b === Infinity) return Infinity;
  const difference = finiteResult(b - a, path('difference'), context);
  const part = multiply(difference, pos - lo, path('fractional-product'), context);
  const value = finiteResult(a + part, path('result'), context);
  if (value < a || value > b) failNumeric('numeric-domain', path('result'), context);
  return value;
}
