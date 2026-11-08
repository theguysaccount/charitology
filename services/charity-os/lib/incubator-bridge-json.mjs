/** New Incubator namespace over the existing strict, immutable JSON transport. */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { learningCanonical, learningOwned, learningFreeze, learningBytes, learningRepresentable, parseLearningTransport } from './learning-transport.mjs';

export class IncubatorError extends Error {
  constructor(code, message, field = '', status = 422) {
    super(message); this.name = 'IncubatorError'; this.code = code; this.status = status;
    if (field) this.issues = [{ field, message }];
  }
}
export const incubatorFail = (code, message = 'Use the documented Incubator fields.', field = '', status = 422) => { throw new IncubatorError(code, message, field, status); };
const transport = fn => { try { return fn(); } catch (e) { if (e instanceof IncubatorError) throw e; if (e?.name === 'LearningError') incubatorFail('incubator_' + e.code.replace(/^learning_/, ''), 'Use complete bounded strict JSON supported by this bridge.', e.issues?.[0]?.field ?? '', e.status); throw e; } };
export const INCUBATOR_LIMITS = Object.freeze({ nativeBytes: 8000000, selectedBytes: 1048576, sourceBytes: 1056768, previewBytes: 2097152, requestBytes: 131072, eventBytes: 131072, receiptBytes: 8192, history: 1000, historyBytes: 16777216, bindings: 40, liveBindings: 20, nativeVersions: 8, eventsPerBinding: 8, jsonDepth: 32, jsonNodes: 200000 });
export const incubatorCanonical = (v, options) => transport(() => learningCanonical(v, options));
export const incubatorOwned = (v, options) => transport(() => learningOwned(v, options));
export const incubatorFreeze = learningFreeze;
export const incubatorBytes = (v, max) => transport(() => learningBytes(v, max));
export const incubatorRepresentable = learningRepresentable;
export const parseIncubatorJSON = (v, max = INCUBATOR_LIMITS.requestBytes, options) => transport(() => parseLearningTransport(v, max, options));
const domains = new Set(['registry','source','event','candidate-data','program-data','review','command','request','actor-binding','membership','session','restore-epoch','source-upload','inspection','cursor']);
export function incubatorHash(domain, value) {
  if (!domains.has(domain)) incubatorFail('incubator_hash', 'Unknown Incubator hash namespace.');
  return bytesToHex(sha256(new TextEncoder().encode('charitology-incubator-v1:' + domain + '\n' + incubatorCanonical(value))));
}
export const incubatorRawHash = bytes => bytesToHex(sha256(bytes));
export function incubatorSeal(domain, value) {
  const v = incubatorOwned(value); if (Object.hasOwn(v, 'sha256')) incubatorFail('incubator_hash', 'Seal an unhashed object.');
  return incubatorFreeze({ ...v, sha256: incubatorHash(domain, v) });
}
export function incubatorCheckedHash(domain, value) {
  incubatorHashValue(value.sha256); const { sha256: hash, ...body } = value;
  if (incubatorHash(domain, body) !== hash) incubatorFail('incubator_hash', 'Retained bytes differ from their exact checksum.');
  return value;
}
export function incubatorObject(v, keys, field = '') {
  if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v)) || Object.keys(v).length !== keys.length || Object.keys(v).some(k => !keys.includes(k))) incubatorFail('incubator_shape', 'Use every documented field and no additional fields.', field);
  return v;
}
export function incubatorText(v, max, field = '', { nullable = false, nonblank = false } = {}) {
  if (v === null && nullable) return v;
  if (typeof v !== 'string' || v.length > max || !incubatorRepresentable(v) || (nonblank && !v.trim())) incubatorFail('incubator_text', 'Use supported text within the field limit.', field);
  return v;
}
export function incubatorId(v, field = '') { if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(v)) incubatorFail('incubator_id', 'Use an exact opaque identifier.', field); return v; }
export function incubatorHashValue(v, field = '') { if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v)) incubatorFail('incubator_hash', 'Use a complete lowercase checksum.', field); return v; }
export function incubatorNumber(v, min, max, field = '') { if (!Number.isSafeInteger(v) || v < min || v > max) incubatorFail('incubator_number', 'Use an integer within the documented limit.', field); return v; }
export function incubatorEnum(v, values, field = '') { if (!values.includes(v)) incubatorFail('incubator_choice', 'Choose a documented option.', field); return v; }
export function incubatorInstant(v, field = '', microseconds = false) {
  const re = microseconds ? /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/ : /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
  if (typeof v !== 'string' || !re.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 19) !== v.slice(0, 19)) incubatorFail('incubator_instant', 'Use a real exact UTC instant.', field);
  return v;
}
export const incubatorSame = (a, b) => incubatorCanonical(a) === incubatorCanonical(b);
