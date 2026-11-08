import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fictionalPlanClusterAppend } from '../test-fixtures/observations/plan-cluster-append-factory.mjs';
import { rewriteFixture } from '../test-fixtures/observations/education-factory.mjs';
import { validateObservationFiles, observationObjectHash, observationPrettyJson } from '../src/lib/observation-model.mjs';
import { planClusterObservationProjection as project, planClusterObservationExport as output,
  PLAN_CLUSTER_CSV_TEXT_POLICY } from '../src/lib/humanitarian-plan-cluster/public.mjs';
import { parseCsv } from '../src/lib/client/csv.ts';

test('selected view carries actual edition, source, original row and code pins without invented freshness', () => {
  const f = fictionalPlanClusterAppend(), p = project(f.handle, f.handle.registry.current.id);
  assert.equal(p.format, 'charitology-humanitarian-plan-cluster-projection');
  assert.equal(p.scope.scopeKind, 'humanitarian-plan-cluster');
  assert.equal(p.causeBinding.review, 'draft');
  assert.equal(p.row.raw.requirements, '100'); assert.equal(p.row.raw.funding, '25');
  assert.deepEqual(p.derived, { status: 'comparable', numerator: '1', denominator: '4', displayPercent: '25.00', differenceUSD: '75' });
  assert.equal(p.observations.length, 2); assert.equal(p.measures.length, 2);
  const e = JSON.parse(f.files[`editions/${p.edition.id}.json`]);
  assert.equal(p.code.commit, e.sourceCommit); assert.deepEqual(p.code.method, e.method);
  assert.equal(p.capturedAt, e.capturedAt); assert.equal(p.source.retrievedAt, '2026-11-08T13:00:00.003Z');
  assert.equal(p.licenseSource.payload.mediaType, 'application/json');
  assert.equal(p.source.rights.publicReuse.kind, 'explicit-license');
  assert.equal(p.row.locator.rawSha256, f.output.records.find(r => r.kind === 'observation').reported.valueRef.locator.rawSha256);
});

test('old edition has no selected new view or download; forged handles and unknown formats refuse', () => {
  const f = fictionalPlanClusterAppend(), old = f.handle.registry.editions[0].id;
  assert.equal(project(f.handle, old), null); assert.equal(output(f.handle, old, 'json'), null);
  assert.equal(output(f.handle, old, 'csv'), null);
  assert.throws(() => project(JSON.parse(JSON.stringify(f.handle)), f.handle.registry.current.id));
  assert.throws(() => output(f.handle, f.handle.registry.current.id, 'html'));
});

test('missing, zero, negative adjustments and overfunding retain source meaning and exact arithmetic', () => {
  const cases = [
    ['', '', 'both-missing', null, null], ['', '25', 'requirements-missing', null, null],
    ['100', '', 'funding-missing', null, null], ['0', '0', 'zero-requirements', null, '0'],
    ['00100.00', '-0.25', 'comparable', '-0.25', '100.25'],
    ['10', '12.5', 'comparable', '125.00', '-2.5'],
  ];
  for (const [requirements, funding, status, displayPercent, differenceUSD] of cases) {
    const f = fictionalPlanClusterAppend({ requirements, funding }), p = project(f.handle, f.handle.registry.current.id);
    assert.equal(p.derived.status, status); assert.equal(p.derived.displayPercent, displayPercent);
    assert.equal(p.derived.differenceUSD, differenceUSD);
    assert.equal(p.row.raw.requirements, requirements); assert.equal(p.row.raw.funding, funding);
    assert.equal(p.observations.length, Number(requirements !== '') + Number(funding !== ''));
  }
});

test('JSON and selected CSV bind identical source/edition/code; raw numeric strings are preserved', () => {
  const f = fictionalPlanClusterAppend({ requirements: '00100.00', funding: '-0.25' }), id = f.handle.registry.current.id;
  const json = output(f.handle, id, 'json'), csv = output(f.handle, id, 'csv'), p = JSON.parse(json.body);
  assert.equal(json.sha256, createHash('sha256').update(json.body).digest('hex'));
  assert.equal(csv.sha256, createHash('sha256').update(csv.body).digest('hex'));
  assert.equal(csv.bytes, Buffer.byteLength(csv.body));
  const [header, row] = parseCsv(csv.body), data = Object.fromEntries(header.map((k, i) => [k, row[i]]));
  for (const [k, v] of Object.entries(p.row.raw)) assert.equal(data[k], v);
  assert.equal(data.source_csv_sha256, p.source.rawSha256); assert.equal(data.source_row_sha256, p.row.locator.rawSha256);
  assert.equal(data.edition_sha256, p.edition.hash); assert.equal(data.code_commit, p.code.commit);
  assert.equal(data.derived_ratio_numerator, '-1'); assert.equal(data.derived_ratio_denominator, '400');
  assert.equal(data.derived_percent_2dp, '-0.25'); assert.equal(data.csv_text_policy, PLAN_CLUSTER_CSV_TEXT_POLICY);
  assert.equal(data.source_client_completed_at, p.source.retrievedAt);
});

test('publisher text formula protection is reversible and distinct from original CSV bytes', () => {
  const f = fictionalPlanClusterAppend();
  for (const literal of ['=SUM(1,2)', "'original", ' \t@formula']) {
    const files = rewriteFixture(f.files, objects => {
      const source = Object.values(objects).find(r => r.kind === 'source' && r.payload?.kind === 'public-csv');
      source.producerMetadata.find(v => v.field === 'resourceModifiedLiteral').literal = literal;
    });
    // The original fixture rewriter updates only its first edition pin. This
    // disclosed two-edition synthetic mutation must relink both actual hashes.
    const registry = JSON.parse(files['registry.json']);
    for (const pin of registry.editions) pin.hash = JSON.parse(files[`editions/${pin.id}.json`]).hash;
    registry.current.hash = registry.editions.at(-1).hash;
    registry.hash = observationObjectHash(registry);
    files['registry.json'] = observationPrettyJson(registry);
    const handle = validateObservationFiles(files), csv = output(handle, handle.registry.current.id, 'csv');
    const [head, row] = parseCsv(csv.body), cell = row[head.indexOf('source_modified_literal')];
    assert.equal(cell, "'" + literal); assert.equal(cell.slice(1), literal);
    assert.equal(JSON.parse(output(handle, handle.registry.current.id, 'json').body).source.producerMetadata.find(v => v.field === 'resourceModifiedLiteral').literal, literal);
  }
});

test('view is frozen, detached and independent of current clocks', () => {
  const f = fictionalPlanClusterAppend(), id = f.handle.registry.current.id, first = project(f.handle, id);
  const clock = Date.now; Date.now = () => { throw new Error('No current-clock fallback'); };
  try {
    const second = project(f.handle, id); assert.deepEqual(second, first);
    assert(Object.isFrozen(second) && Object.isFrozen(second.row.raw) && Object.isFrozen(second.source));
    f.files[first.source.payload.raw.path] = 'changed caller source';
    assert.deepEqual(project(f.handle, id), first);
  } finally { Date.now = clock; }
});
