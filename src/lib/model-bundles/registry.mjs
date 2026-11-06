/** Static installed v1 interpretation. Supplied source is inert data and is never imported or executed. */
import { ENGINE, GOLDEN } from './registry-v1.generated.mjs';
import { cloneJson, canonicalJson, hashValue, sha256Bytes, prettyBytes, LIMITS, object, array, id, hash, equal, fail, text, integer } from './codec.mjs';
import { validateRaw, validateNumericalIssue, validateRecordedRun, RUN_FIELDS } from './content.mjs';
import { normalizeRaw, validateInput, evaluateInput, NumericalError } from './interpretations/v1/arithmetic.mjs';
import { hashArray, inputHash } from './interpretations/v1/encoding.mjs';
const installed = cloneJson(ENGINE, { maxBytes: LIMITS.engine });
const golden = cloneJson(GOLDEN, { maxBytes: LIMITS.golden });
const pin = Object.freeze({ id: installed.definition.id, version: installed.definition.version, definitionHash: installed.definitionHash });
const SOURCE_PATHS = Object.freeze(['src/lib/model-bundles/interpretations/v1/arithmetic.mjs',
  'src/lib/model-bundles/interpretations/v1/encoding.mjs', 'src/lib/model-bundles/interpretations/v1/random.mjs']);
let verified = null;
export function knownEngine() { return installed; }
export function knownEnginePin() { return pin; }
export function knownGoldenVectors() { return golden; }
/** Inert shape/integrity only. This grants no known-engine or numerical authority. */
export async function validateInertEngineEnvelope(value) {
  const v = cloneJson(value, { maxBytes: LIMITS.engine });
  object(v, ['definition', 'definitionHash', 'files']); hash(v.definitionHash);
  const d = v.definition;
  object(d, ['id', 'version', 'language', 'rangedOrder', 'draws', 'prng', 'distribution', 'quantile', 'equation',
    'drawConsumption', 'sorting', 'sensitivity', 'numericalPolicy', 'sourceFiles', 'goldenVectorsHash']);
  id(d.id); integer(d.version, 1, Number.MAX_SAFE_INTEGER); integer(d.draws, 1, Number.MAX_SAFE_INTEGER); hash(d.goldenVectorsHash);
  for (const key of ['language', 'prng', 'distribution', 'quantile', 'equation', 'drawConsumption', 'sorting', 'sensitivity', 'numericalPolicy']) text(d[key], 160, `$.engine.definition.${key}`, true);
  array(d.rangedOrder, 6, '$.engine.definition.rangedOrder', true); const rows = new Set();
  for (const row of d.rangedOrder) { text(row, 80, '$.engine.definition.rangedOrder', true); if (rows.has(row)) fail('engine-row-order'); rows.add(row); }
  array(v.files, 3, '$.engine.files', true); array(d.sourceFiles, 3, '$.engine.definition.sourceFiles', true);
  for (let i = 0; i < SOURCE_PATHS.length; i++) {
    const file = v.files[i], pin = d.sourceFiles[i];
    object(file, ['path', 'byteLength', 'sha256', 'rawUtf8']); object(pin, ['path', 'byteLength', 'sha256']);
    text(file.rawUtf8, LIMITS.engine); integer(file.byteLength, 0, LIMITS.engine); hash(file.sha256);
    const bytes = new TextEncoder().encode(file.rawUtf8);
    if (file.path !== SOURCE_PATHS[i] || file.byteLength !== bytes.byteLength || file.sha256 !== await sha256Bytes(bytes)
      || !equal(pin, { path: file.path, byteLength: file.byteLength, sha256: file.sha256 })) fail('engine-source-integrity');
  }
  if (v.definitionHash !== await hashValue('engine', d)) fail('engine-definition-hash');
  prettyBytes(v, LIMITS.engine);
}
async function verifyInstalled() {
  object(installed, ['definition', 'definitionHash', 'files']); hash(installed.definitionHash);
  const definition = installed.definition;
  object(definition, ['id', 'version', 'language', 'rangedOrder', 'draws', 'prng', 'distribution', 'quantile', 'equation',
    'drawConsumption', 'sorting', 'sensitivity', 'numericalPolicy', 'sourceFiles', 'goldenVectorsHash']);
  const expected = { id: 'charitology-ce-triangular-js-v1', version: 1, language: 'ecmascript-binary64',
    rangedOrder: ['cost', 'people', 'works', 'effect', 'years', 'anyway'], draws: 5000, prng: 'mulberry32-v1',
    distribution: 'triangular-inverse-cdf-v1', quantile: 'type7-infinity-v1', equation: 'expected-one-outcome-geometric-years-v1',
    drawConsumption: 'six-in-order-including-constants', sorting: 'separate-ascending-cost-and-outcome',
    sensitivity: 'one-at-a-time-mode-v1', numericalPolicy: 'guarded-finite-intermediates-v1' };
  for (const key of Object.keys(expected)) if (!equal(definition[key], expected[key])) fail('installed-engine-definition');
  hash(definition.goldenVectorsHash);
  array(installed.files, 3, '$.engine.files', true); array(definition.sourceFiles, 3, '$.engine.definition.sourceFiles', true);
  for (let i = 0; i < SOURCE_PATHS.length; i++) {
    const file = installed.files[i]; object(file, ['path', 'byteLength', 'sha256', 'rawUtf8']);
    const filePin = definition.sourceFiles[i]; object(filePin, ['path', 'byteLength', 'sha256']);
    text(file.rawUtf8, LIMITS.engine); integer(file.byteLength, 0, LIMITS.engine); hash(file.sha256);
    const bytes = new TextEncoder().encode(file.rawUtf8);
    if (file.path !== SOURCE_PATHS[i] || file.byteLength !== bytes.byteLength || file.sha256 !== await sha256Bytes(bytes)
      || !equal(filePin, { path: file.path, byteLength: file.byteLength, sha256: file.sha256 })) fail('installed-engine-source');
  }
  prettyBytes(installed, LIMITS.engine); prettyBytes(golden, LIMITS.golden);
  object(golden, ['format', 'version', 'cases']);
  if (golden.format !== 'charitology-model-golden' || golden.version !== 1) fail('installed-golden-shape');
  array(golden.cases, 40); const ids = new Set();
  for (const item of golden.cases) {
    id(item.id); if (ids.has(item.id)) fail('installed-golden-id'); ids.add(item.id);
    if (item.kind === 'run') {
      object(item, ['kind', 'id', 'input', 'raw', 'expected']); validateInput(item.input);
      if (item.raw !== null) { validateRaw(item.raw); if (!equal(normalizeRaw(item.raw), item.input)) fail('installed-golden-input'); }
      object(item.expected, RUN_FIELDS.filter(field => field !== 'inputHash'));
      validateRecordedRun({ ...item.expected, inputHash: await inputHash(pin, item.input) }, item.input);
    } else {
      object(item, ['kind', 'id', 'raw', 'input', 'issue']);
      if (item.kind !== 'refusal' || (item.raw === null) === (item.input === null)) fail('installed-golden-refusal');
      if (item.raw !== null) validateRaw(item.raw); else validateInput(item.input);
      validateNumericalIssue(item.issue);
    }
  }
  if (definition.goldenVectorsHash !== await hashValue('golden', golden) || installed.definitionHash !== await hashValue('engine', definition)) fail('installed-engine-hash');
}
export function verifyRegistry() {
  if (!verified) verified = verifyInstalled();
  return verified;
}
export async function assertKnownEngine(value) {
  const snapshot = cloneJson(value, { maxBytes: LIMITS.engine });
  await validateInertEngineEnvelope(snapshot);
  await verifyRegistry();
  if (!equal(snapshot, installed)) fail('unsupported-engine');
  // The complete comparison includes raw source, definition and all source/golden pins.
}
/** Explicit numerical check, separate from inert selected/backup admission. */
export async function verifyGoldenVectors() {
  await verifyRegistry();
  for (const item of golden.cases) {
    if (item.kind === 'run') {
      const result = evaluateInput(item.input);
      const actual = { draws: result.draws, seed: result.seed, none: result.none, cost: result.cost, outcome: result.outcome,
        likely: result.likely, sensitivity: result.sensitivity, costsSha256: await hashArray('costs', result.costs),
        outcomesSha256: await hashArray('outcomes', result.outcomes), numericalPolicy: result.numericalPolicy };
      if (canonicalJson(actual) !== canonicalJson(item.expected)) fail('golden-runtime-mismatch');
    } else {
      let issue = null;
      try { evaluateInput(item.raw === null ? item.input : normalizeRaw(item.raw)); }
      catch (error) { if (!(error instanceof NumericalError)) throw error; issue = error.issue; }
      if (!equal(issue, item.issue)) fail('golden-runtime-mismatch');
    }
  }
  return Object.freeze({ cases: golden.cases.length, definitionHash: installed.definitionHash,
    goldenVectorsHash: installed.definition.goldenVectorsHash });
}
