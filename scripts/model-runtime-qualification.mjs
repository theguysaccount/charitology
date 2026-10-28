/** CI evidence only. Never imported by browser, bundle admission, arithmetic or copy authority.
 * The Linux observation is the complete retained reference DTO with only the six array hashes
 * actually measured in CI changed. It is not a replacement golden or a numerical exception. */
import { readFile } from 'node:fs/promises';
import { canonicalJson, cloneJson, parseJsonBytes, hashValue, sha256Bytes, object, array, hash, equal } from '../src/lib/model-bundles/codec.mjs';
import { knownEngine, knownEnginePin, knownGoldenVectors, verifyRegistry } from '../src/lib/model-bundles/registry.mjs';
import { validateInput, normalizeRaw, evaluateInput, NumericalError } from '../src/lib/model-bundles/interpretations/v1/arithmetic.mjs';
import { hashArray } from '../src/lib/model-bundles/interpretations/v1/encoding.mjs';

const FIXTURE = new URL('./fixtures/model-runtime-observations-v1.json', import.meta.url);
const ROOT = new URL('../', import.meta.url);
const MAX_BYTES = 512 * 1024;
const REFERENCE = Object.freeze({ definitionHash: '3826f798e0dc55defdd59cbdfd697a5eef40931f99dd3181abe12c5d8a28f30e',
  goldenHash: 'ff19a5fe1b56a0452a225ae801fadeff54d30441683dc705197973943896d527' });
const PROFILES = Object.freeze([
  Object.freeze({ id: 'node-24.22.1-darwin-arm64', runtime: Object.freeze({ platform: 'darwin', arch: 'arm64', node: 'v24.22.1', v8: '13.6.233.17-node.58' }), referenceCompatible: true,
    observedGoldenHash: REFERENCE.goldenHash }),
  Object.freeze({ id: 'node-24.22.1-linux-x64', runtime: Object.freeze({ platform: 'linux', arch: 'x64', node: 'v24.22.1', v8: '13.6.233.17-node.58' }), referenceCompatible: false,
    observedGoldenHash: '323c9e0d6985e11c42589acaa1ca0b3ac7000222c7e5a5a9ff74a639014d6073' }),
]);
export class ModelRuntimeQualificationError extends Error {
  constructor(code, message) { super(message); this.name = 'ModelRuntimeQualificationError'; this.code = code; }
}
const refuse = (code, message) => { throw new ModelRuntimeQualificationError(code, message); };
export function runtimeIdentity() {
  return Object.freeze({ platform: process.platform, arch: process.arch, node: process.version, v8: process.versions.v8 });
}
/** Complete DTO differences, not rounded values or just the visible summaries. */
export function runtimeDifferences(reference, actual) {
  const differences = [];
  function visit(a, b, path) {
    if (equal(a, b)) return;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) {
      differences.push({ path, reference: a, actual: b }); return;
    }
    if (Array.isArray(a)) {
      if (a.length !== b.length) { differences.push({ path: path + '.length', reference: a.length, actual: b.length }); return; }
      for (let i = 0; i < a.length; i++) visit(a[i], b[i], `${path}[${i}]`);
    } else {
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
      for (const key of keys) {
        if (!Object.hasOwn(a, key) || !Object.hasOwn(b, key)) {
          differences.push({ path: path + '.' + key, reference: Object.hasOwn(a, key) ? a[key] : null,
            actual: Object.hasOwn(b, key) ? b[key] : null, missing: Object.hasOwn(a, key) ? 'actual' : 'reference' });
        } else visit(a[key], b[key], path + '.' + key);
      }
    }
  }
  visit(reference, actual, '$'); return differences;
}
export async function validateRuntimeObservations(value) {
  const v = cloneJson(value, { maxBytes: MAX_BYTES });
  try {
    await verifyRegistry(); object(v, ['format', 'version', 'enginePin', 'referenceGoldenHash', 'sourceFiles', 'profiles']);
    if (v.format !== 'charitology-model-runtime-observations' || v.version !== 1 || !equal(v.enginePin, knownEnginePin()) ||
      v.enginePin.definitionHash !== REFERENCE.definitionHash || v.referenceGoldenHash !== REFERENCE.goldenHash ||
      !equal(v.sourceFiles, knownEngine().definition.sourceFiles)) throw new TypeError();
    array(v.profiles, PROFILES.length, '$.profiles', true);
    const reference = knownGoldenVectors();
    for (let i = 0; i < PROFILES.length; i++) {
      const p = v.profiles[i], descriptor = PROFILES[i];
      object(p, ['id', 'runtime', 'referenceCompatible', 'observedGoldenHash', 'cases']);
      object(p.runtime, ['platform', 'arch', 'node', 'v8']);
      if (p.id !== descriptor.id || p.referenceCompatible !== descriptor.referenceCompatible || !equal(p.runtime, descriptor.runtime) ||
          p.observedGoldenHash !== descriptor.observedGoldenHash) throw new TypeError();
      hash(p.observedGoldenHash); array(p.cases, reference.cases.length, '$.profiles.cases', true);
      // Reconstruct the sole allowed non-reference shape, then compare every case field.
      // The actual six values remain reviewed evidence and must match actual execution below.
      const permitted = structuredClone(reference.cases);
      if (!p.referenceCompatible) {
        for (let index = 0; index < 3; index++) {
          const item = p.cases[index];
          if (item.id !== ['ordinary-seed-1', 'ordinary-seed-42', 'ordinary-seed-4294967295'][index]) throw new TypeError();
          for (const field of ['costsSha256', 'outcomesSha256']) {
            hash(item.expected[field]);
            if (item.expected[field] === permitted[index].expected[field]) throw new TypeError();
            permitted[index].expected[field] = item.expected[field];
          }
        }
      }
      if (!equal(permitted, p.cases) || await hashValue('golden', { ...reference, cases: p.cases }) !== p.observedGoldenHash ||
          p.referenceCompatible !== (p.observedGoldenHash === v.referenceGoldenHash)) throw new TypeError();
    }
    return v;
  } catch { refuse('fixture-invalid', 'The closed CI runtime observations or fixed v1 pins are invalid. Do not replace the retained v1 goldens.'); }
}
export async function loadRuntimeObservations() {
  return validateRuntimeObservations(parseJsonBytes(new Uint8Array(await readFile(FIXTURE)), { maxBytes: MAX_BYTES }));
}
export function selectRuntimeProfile(fixture, runtime = runtimeIdentity()) {
  const result = fixture.profiles.find(profile => equal(profile.runtime, runtime));
  if (!result) refuse('unknown-profile', `Uncharacterized runtime ${runtime.platform}/${runtime.arch}, Node ${runtime.node}, V8 ${runtime.v8}. Use the pinned CI release or record a new reviewed observation; do not edit v1 goldens.`);
  return result;
}
export async function observeRuntimeGolden() {
  await verifyRegistry();
  for (const file of knownEngine().files) {
    const bytes = new Uint8Array(await readFile(new URL(file.path, ROOT)));
    if (bytes.byteLength !== file.byteLength || await sha256Bytes(bytes) !== file.sha256 ||
      new TextDecoder('utf-8', { fatal: true }).decode(bytes) !== file.rawUtf8)
      refuse('source-mismatch', 'The actual installed source bytes differ from immutable v1.');
  }
  const reference = knownGoldenVectors(), cases = [];
  for (const item of reference.cases) {
    if (item.kind === 'run') {
      const input = validateInput(item.input);
      if (item.raw !== null && !equal(normalizeRaw(item.raw), input)) refuse('normalization-mismatch', 'A retained raw reference no longer normalizes to its exact input.');
      const r = evaluateInput(input);
      cases.push({ ...item, input, expected: { draws: r.draws, seed: r.seed, none: r.none, cost: r.cost, outcome: r.outcome,
        likely: r.likely, sensitivity: r.sensitivity, costsSha256: await hashArray('costs', r.costs),
        outcomesSha256: await hashArray('outcomes', r.outcomes), numericalPolicy: r.numericalPolicy } });
    } else {
      let issue = null;
      try { evaluateInput(item.raw === null ? item.input : normalizeRaw(item.raw)); }
      catch (error) { if (!(error instanceof NumericalError)) throw error; issue = error.issue; }
      cases.push({ ...item, issue });
    }
  }
  return cloneJson({ ...reference, cases }, { maxBytes: 128 * 1024 });
}
export async function qualifyModelRuntime() {
  const fixture = await loadRuntimeObservations(), runtime = runtimeIdentity(), profile = selectRuntimeProfile(fixture, runtime);
  const observed = await observeRuntimeGolden(), expected = { ...knownGoldenVectors(), cases: profile.cases };
  if (canonicalJson(observed) !== canonicalJson(expected))
    refuse('observation-mismatch', 'Actual complete reference-case results differ from the reviewed runtime observation. Keep the failure and investigate; do not replace v1 goldens.');
  const cases = knownGoldenVectors().cases.map((item, i) => ({ id: item.id, kind: item.kind,
    differences: runtimeDifferences(item, observed.cases[i]).map(difference => difference.path) }));
  return Object.freeze({ format: 'charitology-model-runtime-qualification', version: 1, profile: profile.id, runtime,
    enginePin: fixture.enginePin, referenceGoldenHash: fixture.referenceGoldenHash, observedGoldenHash: await hashValue('golden', observed),
    evaluatedCases: cases.length, referenceMatchedCases: cases.filter(item => item.differences.length === 0).length,
    referenceCompatible: profile.referenceCompatible, cases,
    message: profile.referenceCompatible ? 'All 19 immutable reference cases reproduce on this measured runtime.'
      : 'Measured runtime qualified: 16 reference cases match; 3 ordinary cases have the exact 6 observed array-hash differences. This is not 19 reproduced reference cases.' });
}
