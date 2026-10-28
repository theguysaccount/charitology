import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDay, validatePartialDate, validateInstant, validateNumericalIssue, validateRecordedRun, validateCopyObservation, validateSourceDescription, validatePointBasis, ROWS } from './content.mjs';
const H = 'a'.repeat(64), J = 'b'.repeat(64);
const finite = value => ({ kind: 'finite', value });
function recorded() { return { inputHash: H, draws: 5000, seed: 42, none: 0,
  cost: { median: finite(10), p5: finite(10), p95: finite(10) },
  outcome: { median: finite(1), p5: finite(1), p95: finite(1) }, likely: { cost: finite(10), outcome: finite(1) },
  sensitivity: { base: finite(10), rows: ROWS.map(key => ({ key, atLow: finite(10), atHigh: finite(10), lo: finite(10), hi: finite(10), swing: finite(0) })) },
  costsSha256: H, outcomesSha256: J, numericalPolicy: 'guarded-finite-intermediates-v1' }; }
const cp = value => structuredClone(value);
test('actual date boundary preserves precision and validates leap days and canonical local-recording instants', () => {
  for (const day of ['0001-01-01', '2000-02-29', '2024-02-29', '9999-12-31']) assert.equal(validateDay(day), day);
  for (const day of ['0000-01-01', '1900-02-29', '2023-02-29', '2000-04-31', '2024-2-01', '2024-01-00', '2024-13-01']) assert.throws(() => validateDay(day));
  for (const date of [{ precision: 'year', value: '2024' }, { precision: 'month', value: '2024-02' }, { precision: 'day', value: '2024-02-29' }]) assert.deepEqual(validatePartialDate(date), date);
  for (const date of [{ precision: 'year', value: '0000' }, { precision: 'month', value: '2024-2' }, { precision: 'day', value: '2024' }, { precision: 'month', value: '2024-02', extra: '' }]) assert.throws(() => validatePartialDate(date));
  for (const instant of ['1900-01-01T00:00:00.000Z', '2200-12-31T23:59:59.999Z', '2024-02-29T12:00:00.001Z']) assert.equal(validateInstant(instant), instant);
  for (const instant of ['1899-12-31T23:59:59.999Z', '2201-01-01T00:00:00.000Z', '2023-02-29T00:00:00.000Z', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00.000+00:00']) assert.throws(() => validateInstant(instant));
});
test('actual numerical issue validator closes every path/context and refuses manufactured authority/text', () => {
  const valid = [
    { code: 'numeric-underflow', phase: 'normalize', path: 'raw.values.works.low', context: { kind: 'normalization' } },
    { code: 'numeric-overflow', phase: 'outcome', path: 'outcome.people-works', context: { kind: 'draw', index: 4999 } },
    { code: 'numeric-domain', phase: 'discount', path: 'discount.v', context: { kind: 'likely' } },
    { code: 'numeric-underflow', phase: 'cost', path: 'cost.ratio', context: { kind: 'sensitivity', row: 'years', endpoint: 'low' } },
    { code: 'numeric-overflow', phase: 'quantile', path: 'quantile.costs.result', context: { kind: 'quantile', series: 'costs', q: 0.95 } },
    { code: 'numeric-domain', phase: 'sensitivity', path: 'sensitivity.effect.swing', context: { kind: 'sensitivity', row: 'effect', endpoint: 'swing' } }
  ];
  for (const issue of valid) assert.deepEqual(validateNumericalIssue(issue), issue);
  for (const mutate of [i => { i.phase = 'cost'; }, i => { i.context = { kind: 'draw', index: 5000 }; }, i => { i.context.extra = 'source body'; }, i => { i.message = 'private source'; }, i => { i.path = 'raw.seed'; }, i => { i.code = 'overflow'; }]) {
    const issue = cp(valid[0]); mutate(issue); assert.throws(() => validateNumericalIssue(issue));
  }
  const wrongSeries = cp(valid[4]); wrongSeries.context.series = 'outcomes'; assert.throws(() => validateNumericalIssue(wrongSeries));
  const wrongRow = cp(valid[5]); wrongRow.context.row = 'cost'; assert.throws(() => validateNumericalIssue(wrongRow));
});
test('actual run admission enforces tag positions, none quantiles, endpoint logic and stable sensitivity order without calculating', () => {
  const base = recorded(); assert.deepEqual(validateRecordedRun(base), base);
  for (const mutate of [r => { r.cost.p5.value = 0; }, r => { r.cost.p5 = { kind: 'unbounded' }; }, r => { r.outcome.p5 = { kind: 'no-outcome' }; }, r => { r.none = 5001; }, r => { r.cost.p95 = { kind: 'no-outcome' }; }, r => { r.sensitivity.base.value = 11; }, r => { r.sensitivity.rows.reverse(); }, r => { r.sensitivity.rows[0].key = 'people'; }, r => { r.sensitivity.rows[0].swing = { kind: 'unbounded' }; }, r => { r.likely.cost.value = Infinity; }, r => { r.seed = 0; }, r => { r.extra = true; }]) {
    const changed = cp(base); mutate(changed); assert.throws(() => validateRecordedRun(changed));
  }
  const infinite = cp(base); infinite.none = 251;
  infinite.cost.p95 = { kind: 'no-outcome' }; infinite.outcome.p5 = finite(0);
  const first = infinite.sensitivity.rows[0]; first.atHigh = { kind: 'no-outcome' }; first.hi = { kind: 'no-outcome' }; first.swing = { kind: 'unbounded' };
  assert.deepEqual(validateRecordedRun(infinite), infinite);
  const falsePosition = cp(infinite); falsePosition.none = 249; falsePosition.outcome.p5 = finite(1); assert.throws(() => validateRecordedRun(falsePosition), { code: 'no-outcome-position' });
  const falseFinite = cp(base); falseFinite.cost.p95.value = 12345;
  assert.equal(validateRecordedRun(falseFinite).cost.p95.value, 12345); // Structural history admission deliberately supplies no recalculation badge.
});
test('actual copy-observation admission closes difference order and fingerprint consistency', () => {
  const fingerprint = { inputHash: H, runHash: H, costsSha256: H, outcomesSha256: H };
  const matched = { kind: 'matched', declared: fingerprint, recalculated: cp(fingerprint), differences: [] };
  assert.deepEqual(validateCopyObservation(matched), matched);
  const mismatch = cp(matched); mismatch.kind = 'mismatched'; mismatch.recalculated.runHash = J; mismatch.differences = ['cost'];
  validateCopyObservation(mismatch);
  for (const mutate of [o => { o.kind = 'matched'; }, o => { o.differences = []; }, o => { o.differences = ['cost', 'cost']; }, o => { o.differences = ['cost', 'none']; }, o => { o.differences = ['private narrative']; }, o => { o.recalculated.costsSha256 = J; }, o => { o.verified = true; }]) {
    const changed = cp(mismatch); mutate(changed); assert.throws(() => validateCopyObservation(changed));
  }
  const refusal = { kind: 'arithmetic-refusal', declared: fingerprint, recalculated: null, differences: [],
    issue: { code: 'numeric-domain', phase: 'discount', path: 'discount.v', context: { kind: 'likely' } } };
  validateCopyObservation(refusal); const invalid = cp(refusal); invalid.recalculated = fingerprint; assert.throws(() => validateCopyObservation(invalid));
});
test('actual inert source descriptions reject unsafe citations and close dates, declared hashes and point references', () => {
  const source = { id: 'fictional-source', title: 'Fictional assumption description', publisher: null,
    url: 'https://example.org/fictional-model#table', locator: null, published: { precision: 'year', value: '2026' },
    accessedOn: null, access: 'unknown', license: null, note: '', checksum: null };
  assert.deepEqual(validateSourceDescription(source), source);
  for (const url of ['http://example.org/', 'https://name:secret@example.org/', 'https://localhost/', 'https://host.local/',
    'https://host.internal/', 'https://127.0.0.1/', 'https://127.1/', 'https://0x7f000001/', 'https://[::1]/',
    'https://example.org/\nsecret', ' https://example.org/']) assert.throws(() => validateSourceDescription({ ...source, url }));
  const long = `https://example.org/${'x'.repeat(1200 - 'https://example.org/'.length)}`;
  validateSourceDescription({ ...source, url: long }); assert.throws(() => validateSourceDescription({ ...source, url: long + 'x' }));
  const local = { ...source, checksum: { kind: 'local-bytes', sha256: H, byteLength: 8 * 1024 * 1024, hashedAt: '2026-10-28T00:00:00.000Z' } };
  validateSourceDescription(local); assert.throws(() => validateSourceDescription({ ...local, checksum: { ...local.checksum, byteLength: 8 * 1024 * 1024 + 1 } }));
  validateSourceDescription({ ...source, checksum: { kind: 'declared', sha256: H } });
  assert.throws(() => validateSourceDescription({ ...source, checksum: { kind: 'declared', sha256: H, verified: true } }));
  const known = new Set([source.id]), used = new Set();
  const basis = { kind: 'source-informed', sourceIds: [source.id], rationale: 'A fictional mapping, not source verification.' };
  validatePointBasis(basis, known, used); assert.deepEqual([...used], [source.id]);
  for (const change of [{ sourceIds: [] }, { sourceIds: [source.id, source.id] }, { sourceIds: ['missing'] }, { rationale: ' ' }]) assert.throws(() => validatePointBasis({ ...basis, ...change }, known, new Set()));
});
