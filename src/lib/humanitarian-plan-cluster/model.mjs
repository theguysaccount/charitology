/** Private fixed-tuple proposal. No network, wall clock, storage or Observation admission. */
import { isProxy, isUint8Array, isSharedArrayBuffer } from 'node:util/types';
import definition from './definition.json' with { type: 'json' };
import { fundingCanonical, fundingCoverage, fundingDecimal, fundingObjectHash, fundingSha256 } from '../humanitarian-funding/model.mjs';

const enc = new TextEncoder(), parsedSources = new WeakSet();
const typed = Object.getPrototypeOf(Uint8Array.prototype);
const byteLength = Object.getOwnPropertyDescriptor(typed, 'byteLength').get;
const bufferOf = Object.getOwnPropertyDescriptor(typed, 'buffer').get;
const setBytes = Uint8Array.prototype.set;
const arrayBufferResizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;
const LIMITS = definition.limits;
function demand(ok, message) { if (!ok) throw new Error(message); }
function freeze(value) {
  if (value && typeof value === 'object') { for (const v of Object.values(value)) freeze(v); Object.freeze(value); }
  return value;
}

/** Descriptor admission precedes any value lookup or canonical serialization. */
function owned(input) {
  let nodes = 0, approximateBytes = 0;
  const active = new Set();
  function walk(value, depth) {
    demand(++nodes <= LIMITS.nodes && depth <= LIMITS.depth, 'Plan-cluster object graph exceeds bounds.');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') { demand(Number.isSafeInteger(value), 'Use exact safe integer metadata.'); return value; }
    if (typeof value === 'string') {
      demand(value.isWellFormed() && !value.includes('\0'), 'Invalid source string.');
      approximateBytes += enc.encode(JSON.stringify(value)).length;
      demand(approximateBytes <= LIMITS.objectBytes, 'Plan-cluster object exceeds byte bound.'); return value;
    }
    demand(value && typeof value === 'object' && !isProxy(value), 'Use owned data-only JSON values.');
    const proto = Object.getPrototypeOf(value), array = Array.isArray(value);
    demand(proto === (array ? Array.prototype : Object.prototype), 'Use plain objects and arrays.');
    demand(!active.has(value), 'Cyclic plan-cluster value.'); active.add(value);
    const keys = Reflect.ownKeys(value);
    let result;
    if (array) {
      const length = Object.getOwnPropertyDescriptor(value, 'length');
      demand(length && 'value' in length && Number.isSafeInteger(length.value) && length.value >= 0 && length.value <= LIMITS.nodes, 'Invalid array length.');
      demand(keys.length === length.value + 1 && keys.every((key, i) => i < length.value ? key === String(i) : key === 'length'), 'Arrays must have exact dense canonical indices.');
      result = [];
      for (let i = 0; i < length.value; i++) {
        const d = Object.getOwnPropertyDescriptor(value, String(i));
        demand(d && d.enumerable && 'value' in d, 'Array accessors and hidden values are refused.'); result.push(walk(d.value, depth + 1));
      }
    } else {
      demand(keys.length <= 64 && keys.every(k => typeof k === 'string'), 'Invalid object keys.'); result = {};
      for (const key of keys) {
        demand(key.isWellFormed() && !key.includes('\0'), 'Invalid object key.');
        approximateBytes += enc.encode(JSON.stringify(key)).length;
        const d = Object.getOwnPropertyDescriptor(value, key);
        demand(d && d.enumerable && 'value' in d, 'Accessors and hidden values are refused.');
        Object.defineProperty(result, key, { value: walk(d.value, depth + 1), enumerable: true, writable: true, configurable: true });
      }
    }
    active.delete(value); return result;
  }
  const value = walk(input, 0);
  demand(enc.encode(fundingCanonical(value)).length <= LIMITS.objectBytes, 'Plan-cluster object exceeds canonical byte bound.');
  return value;
}
function exact(value, keys) {
  demand(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)), 'Plan-cluster fields differ from this closed format.');
}
function equal(a, b) { return fundingCanonical(a) === fundingCanonical(b); }
function hash(value) { return fundingObjectHash(value); }
function sha(value) { demand(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'Invalid SHA-256 pin.'); }
function integer(value, min, max) { demand(Number.isSafeInteger(value) && value >= min && value <= max, 'Integer metadata exceeds bounds.'); }
function text(value, max = 240) { demand(typeof value === 'string' && value.length > 0 && value.length <= max, 'Invalid declared metadata text.'); }
export const PLAN_CLUSTER_DEFINITION = freeze(owned(definition));
export const PLAN_CLUSTER_DEFINITION_SHA256 = hash(PLAN_CLUSTER_DEFINITION);
export const PLAN_CLUSTER_SELECTION = PLAN_CLUSTER_DEFINITION.selection;
export const PLAN_CLUSTER_HEADERS = PLAN_CLUSTER_DEFINITION.headers;
export const PLAN_CLUSTER_LIMITS = PLAN_CLUSTER_DEFINITION.limits;
export const PLAN_CLUSTER_LICENSE = PLAN_CLUSTER_DEFINITION.rights;
export const PLAN_CLUSTER_CAUSE_BINDING = PLAN_CLUSTER_DEFINITION.causeBinding;
export const PLAN_CLUSTER_KEY = 'AFG:1185:2024:7415';

function bytes(input) {
  // Native brand first: instanceof can traverse an attacker-controlled Proxy prototype.
  demand(input && !isProxy(input) && isUint8Array(input), 'Choose native Uint8Array or Buffer bytes.');
  const proto = Object.getPrototypeOf(input);
  demand(proto === Uint8Array.prototype || proto === Buffer.prototype, 'Byte subclasses are refused.');
  const buffer = bufferOf.call(input), size = byteLength.call(input);
  demand(!isSharedArrayBuffer(buffer) && !(arrayBufferResizable && arrayBufferResizable.call(buffer)), 'Shared or resizable bytes are refused.');
  integer(size, 1, LIMITS.bytes);
  const keys = Reflect.ownKeys(input);
  demand(keys.length === size && keys.every((k, i) => k === String(i)), 'Decorated byte values are refused.');
  const result = new Uint8Array(size); setBytes.call(result, input); return result;
}
function date(value) {
  demand(/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 'Invalid written source date.');
}
function rawKey(raw) {
  exact(raw, PLAN_CLUSTER_HEADERS);
  demand(PLAN_CLUSTER_HEADERS.every(k => typeof raw[k] === 'string' && raw[k].length <= LIMITS.field && !raw[k].includes('\0') && raw[k].isWellFormed()), 'Invalid raw source field.');
  demand(/^[A-Z]{3}$/.test(raw.countryCode), 'Invalid source country.');
  demand(raw.id === '' || /^\d{1,20}$/.test(raw.id), 'Invalid plan identifier.');
  demand(raw.clusterCode === '' || /^\d{1,20}$/.test(raw.clusterCode), 'Invalid cluster identifier.');
  demand(/^\d{4}$/.test(raw.year) && Number(raw.year) >= 1900 && Number(raw.year) <= 2200, 'Invalid source year.');
  for (const d of [raw.startDate, raw.endDate]) if (d !== '') date(d);
  demand(!raw.startDate || !raw.endDate || raw.endDate >= raw.startDate, 'Source date order is invalid.');
  demand(raw.name.length > 0 && raw.code.length <= 160 && raw.cluster.length <= 240, 'Invalid plan or cluster label.');
  fundingDecimal(raw.requirements, { signed: false }); fundingDecimal(raw.funding); fundingDecimal(raw.percentFunded);
  // Blank codes remain separate literal source categories, never allocated to Education.
  return `${raw.countryCode}:${raw.id || 'no-plan'}:${raw.year}:${raw.clusterCode || `blank:${raw.cluster}`}`;
}
function selectedRaw(raw) {
  demand(rawKey(raw) === PLAN_CLUSTER_KEY, 'The selected source tuple differs.');
  const s = PLAN_CLUSTER_SELECTION;
  demand(raw.code === s.planCode && raw.name === s.planName && raw.cluster === s.clusterName && raw.startDate === s.start && raw.endDate === s.end, 'Selected source labels or period differ from the definition.');
}

/** Named derivative of the frozen funding CSV scanner; distinct fixed header and tuple. */
export function parsePlanClusterCsv(input) {
  const original = bytes(input); let source;
  try { source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(original); }
  catch { throw new Error('Plan-cluster CSV is not valid original UTF-8.'); }
  demand(!source.startsWith('\uFEFF') && !source.includes('\0'), 'BOM and NUL are refused.');
  let cells = [], cell = '', quoted = false, closed = false, start = 0, byteStart = 0, firstLine = 1, records = 0, selected = null;
  const seen = new Set();
  function field() {
    demand(cell.length <= LIMITS.field, 'CSV field exceeds bound.'); cells.push(cell); cell = ''; closed = false;
    demand(cells.length <= PLAN_CLUSTER_HEADERS.length, 'CSV has extra columns.');
  }
  function record(end) {
    field(); const rawRecord = source.slice(start, end), recordBytes = enc.encode(rawRecord);
    const breaks = (rawRecord.match(/\n/g) || []).length, endsLine = rawRecord.endsWith('\n');
    const locator = { recordNumber: records + 1, firstLine, lastLine: firstLine + breaks - (endsLine ? 1 : 0), byteStart, byteEnd: byteStart + recordBytes.length, rawSha256: fundingSha256(recordBytes) };
    if (records === 0) demand(equal(cells, PLAN_CLUSTER_HEADERS), 'CSV header differs from the exact twelve-column format.');
    else {
      demand(cells.length === PLAN_CLUSTER_HEADERS.length, 'CSV has missing columns.');
      const raw = Object.fromEntries(PLAN_CLUSTER_HEADERS.map((h, i) => [h, cells[i]])), key = rawKey(raw);
      demand(!seen.has(key), 'Duplicate country × plan × year × cluster source tuple.'); seen.add(key);
      if (key === PLAN_CLUSTER_KEY) { selectedRaw(raw); selected = { key, raw, locator }; }
    }
    records++; demand(records <= LIMITS.records + 1, 'CSV has too many records.');
    byteStart += recordBytes.length; firstLine += breaks; cells = []; start = end;
  }
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') { if (source[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += c;
    } else if (c === ',') field();
    else if (c === '\r' || c === '\n') {
      if (c === '\r') { demand(source[i + 1] === '\n', 'Bare CR outside a quoted field.'); i++; } record(i + 1);
    } else if (c === '"') { demand(!closed && cell === '', 'Unexpected CSV quote.'); quoted = true; }
    else { demand(!closed, 'Unexpected text after a quoted field.'); cell += c; }
    demand(cell.length <= LIMITS.field, 'CSV field exceeds bound.');
  }
  demand(!quoted, 'Unclosed quoted CSV field.'); if (start < source.length) record(source.length);
  demand(byteStart === original.length && records > 1 && selected, 'CSV is incomplete or the selected tuple is absent.');
  const result = freeze(owned({ format: 'charitology-plan-cluster-parsed-source', version: 1, sourceBytes: original.length, sourceSha256: fundingSha256(original), totalRecords: records - 1, selected }));
  parsedSources.add(result); return result;
}

const DESCRIPTOR_KEYS = ['datasetId','resourceId','resourceName','resourceUrl','resourceBytes','resourceModified','metadataModified','publisherHashLiteral','license','attribution'];
/** Declared metadata admission only; this proves neither public origin nor retrieval time. */
export function validatePlanClusterSourceDescriptor(input) {
  const d = owned(input); exact(d, DESCRIPTOR_KEYS);
  for (const k of ['datasetId','resourceId','resourceName','resourceUrl']) demand(d[k] === PLAN_CLUSTER_DEFINITION.source[k], 'Declared CSV resource differs from the fixed source.');
  integer(d.resourceBytes, 1, LIMITS.bytes);
  for (const k of ['resourceModified','metadataModified','publisherHashLiteral']) { demand(typeof d[k] === 'string' && d[k].length <= 240, 'Invalid publisher metadata literal.'); }
  exact(d.license, ['id','title','url']);
  demand(d.license.id === PLAN_CLUSTER_LICENSE.metadataLicenseId && [PLAN_CLUSTER_LICENSE.termsUrl, PLAN_CLUSTER_LICENSE.termsUrl.replace('https:', 'http:')].includes(d.license.url), 'Declared license differs from CC BY 3.0 IGO.');
  text(d.license.title); demand(d.attribution === PLAN_CLUSTER_LICENSE.attribution, 'Use the fixed source attribution.'); return freeze(d);
}
function amount(token, signed) {
  const d = fundingDecimal(token, { signed });
  return { state: d === null ? 'missing' : 'present', token, decimal: d === null ? null : { coefficient: String(d.coefficient), scale: d.scale }, unit: 'USD' };
}
function difference(requirements, funding) {
  const r = fundingDecimal(requirements, { signed: false }), f = fundingDecimal(funding);
  if (!r || !f) return null;
  const scale = Math.max(r.scale, f.scale), n = r.coefficient * 10n ** BigInt(scale - r.scale) - f.coefficient * 10n ** BigInt(scale - f.scale);
  const negative = n < 0n, digits = String(negative ? -n : n).padStart(scale + 1, '0');
  const decimal = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/0+$/, '').replace(/\.$/, '') : digits;
  return `${negative ? '-' : ''}${decimal}`;
}
function locator(value, sourceBytes, totalRecords) {
  exact(value, ['recordNumber','firstLine','lastLine','byteStart','byteEnd','rawSha256']);
  integer(value.recordNumber, 2, totalRecords + 1); integer(value.firstLine, 2, LIMITS.bytes); integer(value.lastLine, value.firstLine, LIMITS.bytes);
  integer(value.byteStart, 1, sourceBytes - 1); integer(value.byteEnd, value.byteStart + 1, sourceBytes); sha(value.rawSha256);
}
function projectionBody(parsed, descriptor) {
  const { raw } = parsed.selected;
  return { format: 'charitology-plan-cluster-pure-projection', version: 1, method: PLAN_CLUSTER_DEFINITION.method,
    definitionSha256: PLAN_CLUSTER_DEFINITION_SHA256, selection: PLAN_CLUSTER_SELECTION, causeBinding: PLAN_CLUSTER_CAUSE_BINDING,
    source: { csvSha256: parsed.sourceSha256, csvBytes: parsed.sourceBytes, records: parsed.totalRecords, descriptor }, row: parsed.selected,
    values: { requirements: amount(raw.requirements, false), funding: amount(raw.funding, true) },
    derived: { ...fundingCoverage(raw.requirements, raw.funding), differenceUSD: difference(raw.requirements, raw.funding) },
    review: 'draft', limitations: PLAN_CLUSTER_DEFINITION.limitations };
}
export function makePlanClusterPureProjection(parsed, sourceDescriptor) {
  demand(parsed && parsedSources.has(parsed), 'Use a real parser result from this module.');
  const d = validatePlanClusterSourceDescriptor(sourceDescriptor);
  demand(d.resourceBytes === parsed.sourceBytes, 'Declared size differs from actual CSV bytes.');
  const body = owned(projectionBody(parsed, d)); return freeze({ ...body, sha256: hash(body) });
}
export function validatePlanClusterPureProjection(input) {
  const p = owned(input);
  exact(p, ['format','version','method','definitionSha256','selection','causeBinding','source','row','values','derived','review','limitations','sha256']);
  exact(p.source, ['csvSha256','csvBytes','records','descriptor']); sha(p.source.csvSha256); integer(p.source.csvBytes, 1, LIMITS.bytes); integer(p.source.records, 1, LIMITS.records);
  exact(p.row, ['key','raw','locator']); demand(p.row.key === PLAN_CLUSTER_KEY, 'Selected tuple key differs.'); selectedRaw(p.row.raw); locator(p.row.locator, p.source.csvBytes, p.source.records);
  const d = validatePlanClusterSourceDescriptor(p.source.descriptor); demand(d.resourceBytes === p.source.csvBytes, 'Declared CSV byte length differs.');
  const expected = owned(projectionBody({ sourceSha256: p.source.csvSha256, sourceBytes: p.source.csvBytes, totalRecords: p.source.records, selected: p.row }, d));
  sha(p.sha256); demand(equal(p, { ...expected, sha256: hash(expected) }), 'Projection fields, math or checksum differ.'); return freeze(p);
}
/** Verifies retained byte identity and row spans, not origin, rights or capture chronology. */
export function verifyPlanClusterProjectionAgainstCsv(projection, input) {
  const p = validatePlanClusterPureProjection(projection), parsed = parsePlanClusterCsv(input);
  demand(equal(p, makePlanClusterPureProjection(parsed, p.source.descriptor)), 'Projection differs from actual complete CSV bytes.'); return p;
}
