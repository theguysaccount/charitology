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
import { validateInput, snapshotEvaluation } from './arithmetic.mjs';

const utf8 = new TextEncoder();
const KINDS = Object.freeze(['engine', 'golden', 'input', 'run', 'content', 'version',
  'selected', 'backup', 'state', 'draws', 'proposal', 'review']);
const unsafe = new Set(['__proto__', 'prototype', 'constructor']);
const bad = () => { throw new TypeError('Invalid engine canonical value.'); };

function validString(value) {
  if (value.length > 2097152) bad();
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) bad();
    } else if (c >= 0xdc00 && c <= 0xdfff) bad();
  }
}

/** Exact ECMAScript code-unit key sort and JSON number/string spelling. */
export function canonical(value) {
  const ancestors = new Set();
  let nodes = 0, bytes = 0;
  const emit = text => {
    bytes += utf8.encode(text).byteLength;
    if (bytes > 2097152) bad();
    return text;
  };
  function visit(v, depth) {
    if (++nodes > 100000 || depth > 32) bad();
    if (v === null) return emit('null');
    if (typeof v === 'boolean') return emit(v ? 'true' : 'false');
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || Object.is(v, -0)) bad();
      return emit(JSON.stringify(v));
    }
    if (typeof v === 'string') { validString(v); return emit(JSON.stringify(v)); }
    if (typeof v !== 'object' || ancestors.has(v)) bad();
    ancestors.add(v);
    const ds = Object.getOwnPropertyDescriptors(v), keys = Reflect.ownKeys(v);
    if (keys.some(k => typeof k !== 'string' || !Object.hasOwn(ds[k], 'value') ||
      (k !== 'length' || !Array.isArray(v)) && ds[k].enumerable !== true)) bad();
    let result;
    if (Array.isArray(v)) {
      if (Object.getPrototypeOf(v) !== Array.prototype || !Number.isSafeInteger(v.length) ||
        v.length > 100000 || keys.length !== v.length + 1) bad();
      const parts = [];
      emit('[');
      for (let i = 0; i < v.length; i++) {
        if (!Object.hasOwn(ds, String(i))) bad();
        if (i) emit(',');
        parts.push(visit(ds[String(i)].value, depth + 1));
      }
      emit(']'); result = '[' + parts.join(',') + ']';
    } else {
      if (Object.getPrototypeOf(v) !== Object.prototype || keys.some(k => unsafe.has(k))) bad();
      keys.sort();
      const parts = [];
      emit('{');
      for (const key of keys) {
        validString(key);
        if (parts.length) emit(',');
        const k = emit(JSON.stringify(key)); emit(':');
        parts.push(k + ':' + visit(ds[key].value, depth + 1));
      }
      emit('}'); result = '{' + parts.join(',') + '}';
    }
    ancestors.delete(v);
    return result;
  }
  return visit(value, 0);
}

export async function sha256(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Engine hash bytes are required.');
  const detached = new Uint8Array(bytes);
  if (!globalThis.crypto?.subtle) throw new Error('Platform SHA-256 is unavailable.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', detached);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export function hashValue(kind, value) {
  if (!KINDS.includes(kind)) throw new TypeError('Invalid engine hash kind.');
  return sha256(utf8.encode(`charitology-model-bundles/v1/${kind}\n${canonical(value)}\n`));
}

function enginePin(value) {
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== 3) throw new TypeError('Invalid engine pin.');
  const ds = Object.getOwnPropertyDescriptors(value);
  if (['id', 'version', 'definitionHash'].some(k => !Object.hasOwn(ds, k) || !Object.hasOwn(ds[k], 'value')) ||
    value.id !== 'charitology-ce-triangular-js-v1' || value.version !== 1 ||
    typeof value.definitionHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.definitionHash))
    throw new TypeError('Invalid engine pin.');
  return { id: value.id, version: 1, definitionHash: value.definitionHash };
}

export function inputHash(pin, value) {
  return hashValue('input', { enginePin: enginePin(pin), input: validateInput(value) });
}

export function encodeArray(series, values) {
  if (!['costs', 'outcomes'].includes(series) || !(values instanceof Float64Array) ||
    Object.getPrototypeOf(values) !== Float64Array.prototype || values.length !== 5000)
    throw new TypeError('Invalid engine array.');
  const prefix = utf8.encode(`charitology-ce-array-v1\n${series}\n`);
  const bytes = new Uint8Array(prefix.byteLength + 40000), view = new DataView(bytes.buffer);
  bytes.set(prefix);
  let prior = -1;
  for (let i = 0; i < 5000; i++) {
    const v = values[i];
    if (!(Number.isFinite(v) && v >= 0 || series === 'costs' && v === Infinity) ||
      series === 'costs' && v === 0 || v < prior) throw new TypeError('Invalid engine array value.');
    view.setFloat64(prefix.byteLength + 8 * i, v === 0 ? 0 : v, false);
    prior = v;
  }
  return bytes;
}
export function hashArray(series, values) { return sha256(encodeArray(series, values)); }

/** Uses retained engine-owned arrays, never caller-mutated display copies. */
export async function makeRecordedRun(pin, value, evaluation) {
  const checked = validateInput(value), snapshot = snapshotEvaluation(evaluation);
  if (canonical(checked) !== canonical(snapshot.input)) throw new TypeError('Evaluation input differs.');
  const [fingerprint, costsSha256, outcomesSha256] = await Promise.all([
    inputHash(pin, checked), hashArray('costs', snapshot.costs), hashArray('outcomes', snapshot.outcomes),
  ]);
  return Object.freeze({ inputHash: fingerprint, ...snapshot.data, costsSha256, outcomesSha256 });
}
