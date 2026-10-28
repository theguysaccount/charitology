/** Explicit fictional engineering fixtures; not shipped public model estimates or review records. */
import { knownEngine, knownEnginePin, knownGoldenVectors } from './registry.mjs';
import { evaluateInput, normalizeRaw } from './interpretations/v1/arithmetic.mjs';
import { inputHash, makeRecordedRun } from './interpretations/v1/encoding.mjs';
import { ROWS, LIMITATIONS, validateContent, editorFormFromContent } from './content.mjs';
import { hashValue, sha256Bytes, prettyBytes } from './codec.mjs';
import { makeSelected, SELECTED_LABEL, SELECTED_OMISSION } from './graph.mjs';
export const FIXTURE_NOW = '2026-10-28T01:02:03.004Z';
export async function fixtureContent(seed = 42) {
  const fixture = knownGoldenVectors().cases.find(item => item.kind === 'run' && item.raw?.seed === String(seed));
  const input = fixture.input, run = await makeRecordedRun(knownEnginePin(), input, evaluateInput(input));
  const point = () => ({ kind: 'user-assumption', sourceIds: [], rationale: 'Fictional assumption for software acceptance.' });
  const basis = Object.fromEntries(ROWS.map(row => [row, { low: point(), likely: point(), high: point() }])); basis.discount = point();
  return validateContent({ enginePin: knownEnginePin(), classification: 'user-authored', title: 'Fictional test model', purpose: 'Exercise software using fictional assumptions.',
    programDescription: 'A hypothetical administrative process.', population: { description: 'No real participants.', geography: null, eligibility: 'Fictional only.', timeHorizon: 'Unknown.' },
    period: { label: 'Unknown hypothetical period.', from: null, to: null }, outcome: { name: fixture.raw.unit, definition: 'One fictional outcome.', measurement: 'No observations.', scope: 'one-outcome' },
    money: { currency: 'USD', priceYear: null, basis: 'unknown', inclusions: 'Hypothetical total.', exclusions: 'Other costs unknown.', adjustment: null },
    assumptions: { independence: 'Assumed independent.', chanceAsScale: 'Expected scaling factor.', counterfactual: 'Authored assumption.', discountRationale: 'Authored choice.',
      harmsAndSpillovers: 'Not calculated.', sourceDepthLimit: 'No empirical source established.', other: '' },
    sources: [], sourceModel: null, raw: fixture.raw, input, basis, run, limitations: LIMITATIONS });
}
export async function sealFixtureVersion(value) {
  const version = structuredClone(value); version.contentHash = await hashValue('content', version.content); delete version.hash;
  version.hash = await hashValue('version', version); return version;
}
export async function fixtureState() {
  const content = await fixtureContent();
  const version = await sealFixtureVersion({ id: 'fixture-version-1', modelId: 'fixture-model', sequence: 1, previous: null,
    recordedAt: FIXTURE_NOW, amendmentReason: null, origin: null, content });
  return { format: 'charitology-model-bundles', schemaVersion: 1, id: 'fixture-workspace', revision: 1, createdAt: FIXTURE_NOW, updatedAt: FIXTURE_NOW,
    engines: [knownEngine()], models: [{ id: version.modelId, title: content.title, currentVersionId: version.id }], versions: [version], imports: [],
    draft: { mode: 'amend', modelId: version.modelId, expectedHead: { id: version.id, hash: version.hash }, origin: null, form: await editorFormFromContent(content), dirty: false } };
}
export async function fixtureSelected(kind = 'matched') {
  const state = await fixtureState();
  if (kind === 'matched') return makeSelected(state, state.versions[0].id, FIXTURE_NOW);
  let engine = knownEngine(), version = structuredClone(state.versions[0]);
  if (kind === 'mismatched') version.content.run.cost.p95.value *= 2;
  else if (kind === 'refused') {
    version.content.raw.discount = '0.000000000000001'; version.content.input = normalizeRaw(version.content.raw);
    version.content.run.inputHash = await inputHash(knownEnginePin(), version.content.input);
  } else if (kind === 'unsupported') {
    engine = structuredClone(engine); engine.files[0].rawUtf8 += '\n// Deliberately unknown test-only declared source. Never executed.\n';
    const bytes = new TextEncoder().encode(engine.files[0].rawUtf8); engine.files[0].byteLength = bytes.length; engine.files[0].sha256 = await sha256Bytes(bytes);
    engine.definition.sourceFiles[0] = { path: engine.files[0].path, byteLength: engine.files[0].byteLength, sha256: engine.files[0].sha256 };
    engine.definitionHash = await hashValue('engine', engine.definition); version.content.enginePin.definitionHash = engine.definitionHash;
    version.content.run.inputHash = await inputHash(version.content.enginePin, version.content.input);
  } else throw new TypeError('Unknown fictional fixture kind.');
  version = await sealFixtureVersion(version);
  const body = { format: 'charitology-cost-effectiveness-bundle', schemaVersion: 1, exportedAt: FIXTURE_NOW, label: SELECTED_LABEL, engine,
    modelVersion: version, omissions: [SELECTED_OMISSION] };
  return prettyBytes({ ...body, checksum: await hashValue('selected', body) });
}
