/** Closed JSON and reference-byte boundary for model bundles. No arithmetic is dispatched here. */
export const LIMITS = Object.freeze({ selected: 2 * 1024 * 1024, backup: 2 * 1024 * 1024,
  engine: 128 * 1024, golden: 128 * 1024, form: 512 * 1024, leaf: 16384,
  depth: 32, nodes: 100000, models: 20, versions: 100, sources: 20, receipts: 100,
  checksumFile: 8 * 1024 * 1024, draws: 1024 * 1024, proposal: 512 * 1024 });
export class ModelBundleError extends Error {
  constructor(code, path = '$', message = 'The model bundle is not valid.') {
    super(message); this.name = 'ModelBundleError'; this.code = code; this.path = path;
  }
}
export function fail(code, path = '$') { throw new ModelBundleError(code, path); }
const UNSAFE = new Set(['__proto__', 'prototype', 'constructor']);
const encoder = new TextEncoder();
const typedByteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength').get;
function cap(value, maximum) {
  if (value === undefined) return maximum;
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) fail('invalid-codec-limit');
  return value;
}
export function snapshotBytes(value, maxBytes = LIMITS.selected) {
  cap(maxBytes, LIMITS.checksumFile);
  if (!(value instanceof Uint8Array) || typedByteLength.call(value) > maxBytes) fail('byte-limit');
  return new Uint8Array(value);
}
export function wellFormed(value) {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}
function safeKey(key, path) {
  if (UNSAFE.has(key)) fail('unsafe-key', path);
  if (!wellFormed(key)) fail('unpaired-surrogate', path);
}
/** Detaches an ordinary JSON object before any await. Proxies are outside this boundary's claim. */
export function cloneJson(value, options = {}) {
  const maxDepth = cap(options.maxDepth, LIMITS.depth), maxNodes = cap(options.maxNodes, LIMITS.nodes);
  const maxBytes = cap(options.maxBytes, LIMITS.selected);
  let nodes = 0, usedBytes = 0; const active = new Set();
  function charge(size) { usedBytes += size; if (usedBytes > maxBytes) fail('byte-limit'); }
  function stringBytes(value) {
    if (value.length > maxBytes) fail('byte-limit');
    return encoder.encode(JSON.stringify(value)).byteLength;
  }
  function visit(input, depth, path) {
    if (depth > maxDepth) fail('depth-limit', path);
    if (++nodes > maxNodes) fail('node-limit', path);
    if (input === null || typeof input === 'boolean') { charge(input === null ? 4 : input ? 4 : 5); return input; }
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) fail('nonfinite-number', path);
      if (Object.is(input, -0)) fail('negative-zero', path);
      charge(JSON.stringify(input).length); return input;
    }
    if (typeof input === 'string') {
      if (!wellFormed(input)) fail('unpaired-surrogate', path);
      charge(stringBytes(input)); return input;
    }
    if (typeof input !== 'object') fail('not-json', path);
    if (active.has(input)) fail('cycle', path);
    const proto = Object.getPrototypeOf(input);
    const array = Array.isArray(input);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) fail('exotic-object', path);
    charge(2);
    active.add(input);
    let out;
    const keys = Reflect.ownKeys(input);
    if (array) {
      const length = Object.getOwnPropertyDescriptor(input, 'length');
      if (!length || !Number.isSafeInteger(length.value) || length.value < 0 || length.value > maxNodes) fail('node-limit', path);
      if (keys.length !== length.value + 1) fail('decorated-or-sparse-array', path);
      out = [];
      for (let i = 0; i < length.value; i++) {
        if (i) charge(1);
        const d = Object.getOwnPropertyDescriptor(input, String(i));
        if (!d || !('value' in d) || !d.enumerable) fail('decorated-or-sparse-array', path);
        out.push(visit(d.value, depth + 1, `${path}[${i}]`));
      }
    } else {
      out = {};
      for (const [i, key] of keys.entries()) {
        if (typeof key !== 'string') fail('symbol-key', path);
        safeKey(key, path);
        charge(stringBytes(key) + 1 + (i ? 1 : 0));
        if (++nodes > maxNodes) fail('node-limit', path);
        const d = Object.getOwnPropertyDescriptor(input, key);
        if (!d || !('value' in d) || !d.enumerable) fail('accessor-or-hidden-key', path);
        out[key] = visit(d.value, depth + 1, `${path}.${key}`);
      }
    }
    active.delete(input); return Object.freeze(out);
  }
  const result = visit(value, 0, '$');
  return result;
}
function canonicalUnchecked(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalUnchecked).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalUnchecked(value[key])}`).join(',')}}`;
}
export function canonicalJson(value, options = {}) { return canonicalUnchecked(cloneJson(value, options)); }
export const canonical = canonicalJson;
export function canonicalBytes(value, options = {}) { return encoder.encode(canonicalJson(value, options)); }
/** Strict UTF-8/JSON parser checks duplicate decoded keys before constructing a member. */
export function parseJsonBytes(bytes, options = {}) {
  const maxBytes = cap(options.maxBytes, LIMITS.selected);
  if (!(bytes instanceof Uint8Array) || typedByteLength.call(bytes) > maxBytes) fail('byte-limit');
  bytes = new Uint8Array(bytes);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail('bom');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { fail('invalid-utf8'); }
  let at = 0, nodes = 0;
  const maxDepth = cap(options.maxDepth, LIMITS.depth), maxNodes = cap(options.maxNodes, LIMITS.nodes);
  function ws() { while (at < text.length && /[\x20\x09\x0a\x0d]/.test(text[at])) at++; }
  function string() {
    const start = at++;
    let escaped = false;
    while (at < text.length) {
      const c = text.charCodeAt(at++);
      if (escaped) { escaped = false; continue; }
      if (c === 92) { escaped = true; continue; }
      if (c === 34) {
        let result;
        try { result = JSON.parse(text.slice(start, at)); } catch { fail('invalid-json'); }
        if (!wellFormed(result)) fail('unpaired-surrogate');
        return result;
      }
      if (c < 32) fail('invalid-json');
    }
    fail('invalid-json');
  }
  function value(depth) {
    if (depth > maxDepth) fail('depth-limit');
    if (++nodes > maxNodes) fail('node-limit');
    ws(); const c = text[at];
    if (c === '"') return string();
    if (c === '{') {
      at++; ws(); const out = {}, seen = new Set();
      if (text[at] === '}') { at++; return Object.freeze(out); }
      while (at < text.length) {
        if (text[at] !== '"') fail('invalid-json');
        if (++nodes > maxNodes) fail('node-limit');
        const key = string(); safeKey(key, '$');
        if (seen.has(key)) fail('duplicate-key');
        seen.add(key); ws(); if (text[at++] !== ':') fail('invalid-json');
        out[key] = value(depth + 1); ws();
        const next = text[at++]; if (next === '}') return Object.freeze(out);
        if (next !== ',') fail('invalid-json'); ws();
      }
      fail('invalid-json');
    }
    if (c === '[') {
      at++; ws(); const out = [];
      if (text[at] === ']') { at++; return Object.freeze(out); }
      while (at < text.length) {
        out.push(value(depth + 1)); ws();
        const next = text[at++]; if (next === ']') return Object.freeze(out);
        if (next !== ',') fail('invalid-json'); ws();
      }
      fail('invalid-json');
    }
    for (const [token, result] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(token, at)) { at += token.length; return result; }
    }
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(at));
    if (!match) fail('invalid-json');
    at += match[0].length; const number = Number(match[0]);
    if (!Number.isFinite(number)) fail('nonfinite-number');
    if (Object.is(number, -0)) fail('negative-zero');
    return number;
  }
  const parsed = value(0); ws(); if (at !== text.length) fail('trailing-json'); return parsed;
}
export async function sha256Bytes(bytes) {
  if (!(bytes instanceof Uint8Array)) fail('not-bytes');
  const copy = new Uint8Array(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
const HASH_KINDS = new Set(['engine', 'golden', 'input', 'run', 'content', 'version', 'selected', 'backup', 'state', 'draws', 'proposal', 'review']);
export async function hashValue(kind, value) {
  if (!HASH_KINDS.has(kind)) fail('hash-kind');
  return sha256Bytes(encoder.encode(`charitology-model-bundles/v1/${kind}\n${canonicalJson(value)}\n`));
}
export async function savedStringHash(value) {
  if (value === null) return null;
  if (typeof value !== 'string') fail('saved-string');
  return sha256Bytes(encoder.encode(`charitology-model-bundles/v1/saved-string\n${JSON.stringify(value)}\n`));
}
export function prettyBytes(value, maxBytes = LIMITS.selected) {
  cap(maxBytes, LIMITS.selected);
  const snapshot = cloneJson(value);
  const bytes = encoder.encode(`${JSON.stringify(snapshot, null, 2)}\n`);
  if (bytes.byteLength > maxBytes) fail('byte-limit');
  return bytes;
}
export function object(value, keys, path = '$') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('object-shape', path);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail('exotic-object', path);
  const all = Reflect.ownKeys(value);
  for (const key of all) {
    if (typeof key !== 'string') fail('symbol-key', path);
    safeKey(key, path);
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !('value' in d) || !d.enumerable) fail('accessor-or-hidden-key', path);
  }
  const got = all.sort(), wanted = [...keys].sort();
  if (got.length !== wanted.length || got.some((key, i) => key !== wanted[i])) fail('object-keys', path);
  return value;
}
export function array(value, max, path = '$', exact = false) {
  if (!Array.isArray(value) || (exact ? value.length !== max : value.length > max)) fail('array-bound', path);
  if (Object.getPrototypeOf(value) !== Array.prototype) fail('exotic-object', path);
  if (Reflect.ownKeys(value).length !== value.length + 1) fail('decorated-or-sparse-array', path);
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !('value' in d) || !d.enumerable) fail('decorated-or-sparse-array', path);
  }
  return value;
}
export function text(value, max, path = '$', nonblank = false) {
  if (typeof value !== 'string' || value.length > max || !wellFormed(value) || (nonblank && !value.trim())) fail('text-bound', path);
  return value;
}
export function oneOf(value, values, path = '$') { if (!values.includes(value)) fail('enum', path); return value; }
export function integer(value, low, high, path = '$') { if (!Number.isSafeInteger(value) || value < low || value > high || Object.is(value, -0)) fail('integer-bound', path); return value; }
export function hash(value, path = '$') { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('hash', path); return value; }
export function id(value, path = '$') { if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,79}$/.test(value)) fail('id', path); return value; }
export function equal(a, b) { return canonicalJson(a) === canonicalJson(b); }
