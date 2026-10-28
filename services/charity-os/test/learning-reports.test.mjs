import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLearningFixture } from './learning-fixtures.mjs';
import { foldLearningHistory } from '../lib/learning-model.mjs';
import { validateLearningReport } from '../lib/learning-report-model.mjs';
import { learningJSONBBytes } from '../lib/learning-backup.mjs';
import { prepareLearningReport, previewLearningReport, readLearningReport } from '../lib/learning-reports.mjs';

const clone = value => structuredClone(value);
const actor = 'reviewer-one';
const fixtures = new Map();
const member = () => ({ userId: actor, role: 'admin', programIds: [], revision: 1, createdAtExact: '2026-10-27T00:00:00.000000Z' });
function rawRecord(record) {
  return { org_id: record.orgId, id: record.id, module_id: record.moduleId, data: clone(record.data), status: record.status,
    owner_id: record.ownerId, last_editor_id: record.lastEditedBy, revision: record.revision, approval: clone(record.approval),
    snapshot: clone(record.snapshot), source: record.source, created_at: new Date(record.createdAt), updated_at: new Date(record.updatedAt), deleted_at: null };
}
function setup(options) {
  const key = JSON.stringify(options ?? {});
  if (!fixtures.has(key)) fixtures.set(key, buildLearningFixture(options));
  const fixture = fixtures.get(key), events = fixture.events.slice(0, -1);
  // Decision and manifest approvals are freshly discovered, never pasted authority.
  const approvedEvidence = fixture.approvedEvidence.filter(proof => proof.pin.recordId !== fixture.decision.record.recordId && proof.pin.moduleId !== 'reporting');
  const folded = foldLearningHistory({ sources: fixture.sources, approvedEvidence, events });
  const inventory = { sources: fixture.sources, approvedEvidence, events, folded, bindings: folded.bindings,
    modes: new Map([...events, ...fixture.sources, ...approvedEvidence].map(value => [value.sha256, 'live'])) };
  const records = new Map(fixture.records.map(record => [record.id, rawRecord(record)]));
  const audits = new Map(fixture.approvedEvidence.map(proof => [proof.pin.recordId, [{ id: proof.approvalEvent.id,
    actor_id: proof.approval.actorId, created_exact: proof.approvalEvent.createdAtExact,
    detail: { record: clone(fixture.records.find(record => record.id === proof.pin.recordId)) } }]]));
  const reports = new Map(), statements = [];
  const client = { query: async (sql, params) => {
    statements.push(sql);
    assert.ok(!/^(?:INSERT|UPDATE|DELETE|ALTER|CREATE)\b/.test(sql), 'Report preparation must never write.');
    if (sql.includes('FROM os_records')) return { rows: (sql.includes('ANY(') ? params[1].map(id => records.get(id)).filter(Boolean) : [records.get(params[1])].filter(Boolean)).map(clone) };
    if (sql.includes('FROM os_events')) return { rows: clone(audits.get(params[1]) ?? []) };
    if (sql.includes('FROM os_reports')) return { rows: reports.has(params[1]) ? [clone(reports.get(params[1]))] : [] };
    if (sql === 'SELECT octet_length($1::jsonb::text) AS bytes') return { rows: [{ bytes: learningJSONBBytes(JSON.parse(params[0])) }] };
    throw new Error('Unexpected fictional query: ' + sql);
  } };
  const args = { org: fixture.orgId, user: actor, member: member(), inventory };
  const prepare = extras => prepareLearningReport(client, { ...args, selection: fixture.selection.selection,
    manifestRevision: fixture.manifestProof.record.revision, ...extras });
  const preview = extras => previewLearningReport(client, { ...args, finalSelection: fixture.selection,
    reportId: 'prepared-report', preparedAt: '2026-10-27T00:00:01.000Z', ...extras });
  const store = report => reports.set(report.id, { id: report.id, org_id: report.orgId, created_by: report.createdBy,
    title: report.title, checksum: report.checksum, payload: report, learning_payload_bytes: learningJSONBBytes(report) });
  return { fixture, inventory, records, audits, reports, statements, client, args, prepare, preview, store };
}

test('prepare computes the exact saved digest without writes and discovers fresh direct proofs', async () => {
  const s = setup(), before = clone([...s.records]);
  const prepared = await s.prepare();
  assert.equal(prepared.sourceDigest, s.fixture.manifest.sourceDigest);
  assert.equal(prepared.requiresSave, false);
  assert.equal(prepared.requiresApproval, false);
  assert.equal(prepared.manifest.recordId, 'manifest-one');
  assert.deepEqual([...s.records], before);
  assert.deepEqual(Object.keys(prepared).sort(), ['exclusions', 'manifest', 'requiresApproval', 'requiresSave', 'selectionSha256', 'sourceDigest']);
  assert.ok(Object.isFrozen(prepared));
  const manifest = s.records.get('manifest-one');
  manifest.data.sourceDigest = null; manifest.revision++; manifest.approval = null; manifest.snapshot = null; manifest.status = 'draft';
  const unsaved = await s.prepare({ manifestRevision: manifest.revision });
  assert.equal(unsaved.sourceDigest, prepared.sourceDigest);
  assert.equal(unsaved.requiresSave, true);
  assert.equal(unsaved.requiresApproval, true);
  await assert.rejects(s.preview(), error => error.status === 409);
});

test('preview fixes pre-freeze report and event while compiling the ordinary frozen transition exactly', async () => {
  const s = setup(), before = clone([...s.records]);
  const plan = await s.preview();
  assert.deepEqual(await s.preview(), plan);
  assert.deepEqual(Object.keys(plan).sort(), ['approvedEvidence', 'event', 'recordIds', 'report', 'transition']);
  assert.deepEqual(validateLearningReport(plan.report), plan.report);
  assert.equal(plan.report.createdBy, actor);
  assert.equal(plan.report.createdAt, '2026-10-27T00:00:01.000Z');
  assert.deepEqual(plan.report.selection.selection.head, s.fixture.selection.selection.head);
  assert.ok(!plan.report.events.some(event => event.sha256 === plan.event.sha256));
  assert.equal(plan.event.payload.reportChecksum, plan.report.checksum);
  assert.equal(plan.event.previous.eventSha256, s.fixture.selection.selection.head.eventSha256);
  assert.equal(plan.transition.status, 'frozen');
  assert.equal(plan.transition.revision, s.fixture.manifestProof.record.revision + 1);
  assert.equal(plan.transition.approval.revision, plan.transition.revision);
  assert.equal(plan.transition.snapshot.status, 'frozen');
  assert.equal(plan.transition.snapshot.updatedAt, s.fixture.manifestProof.record.updatedAt);
  assert.deepEqual(plan.transition.snapshot.files, s.fixture.manifestProof.record.snapshot.files);
  assert.equal(plan.event.payload.frozenManifest.revision, plan.transition.revision);
  assert.ok(plan.approvedEvidence.some(proof => proof.pin.recordId === s.fixture.decision.record.recordId));
  assert.ok(plan.approvedEvidence.some(proof => proof.pin.moduleId === 'reporting'));
  assert.deepEqual(plan.recordIds, [...new Set(plan.recordIds)].sort());
  assert.deepEqual([...s.records], before);
  assert.equal(plan.report.selection.selection.observations.length, 3);
  assert.deepEqual(plan.report.approvedEvidence.filter(proof => proof.snapshot.data.kind === 'observation').map(proof => proof.snapshot.data.value).sort((a,b) => String(a).localeCompare(String(b))), [0, 7, null]);
});

test('current authority rejects stale approvals, recovered heads, changed head and mismatched actors', async () => {
  for (const mutate of [s => s.records.get(s.fixture.programId).revision++,
    s => s.audits.get(s.fixture.definition.record.id).push(clone(s.audits.get(s.fixture.definition.record.id)[0])),
    s => s.inventory.modes.set(s.fixture.root.sha256, 'recovered'),
    s => s.inventory.bindings = [{ ...s.inventory.bindings[0], head: s.fixture.head }],
    s => s.records.get('manifest-one').status = 'frozen']) {
    const s = setup(); mutate(s);
    await assert.rejects(s.preview());
  }
  const s = setup();
  await assert.rejects(s.preview({ user: s.fixture.actorId }), error => error.status === 403);
  // Approval is independent; the later ordinary frozen edge can be performed by its author.
  const authored = await s.preview({ user: s.fixture.actorId, member: { ...member(), userId: s.fixture.actorId } });
  assert.equal(authored.report.createdBy, s.fixture.actorId);
  for (const role of ['board_reader', 'external_reviewer', 'contributor'])
    await assert.rejects(s.prepare({ member: { ...member(), role } }), error => error.status === 403);
  await assert.rejects(s.prepare({ member: { ...member(), programIds: ['other-program'] } }), error => error.status === 404);
});

test('prepare checks manifest revision, exact ordered sources, actual periods and zero-point definitions', async () => {
  const s = setup();
  await assert.rejects(s.prepare({ manifestRevision: 2 }), error => error.status === 409);
  const manifest = s.records.get('manifest-one');
  manifest.data.outcomeIds.reverse();
  await assert.rejects(s.prepare(), error => error.code === 'learning_report');
  const narrow = setup(); narrow.records.get('manifest-one').data.startDate = '2026-02-01';
  await assert.rejects(narrow.prepare(), error => error.code === 'learning_report');
  const zero = setup({ zeroObservations: true }), plan = await zero.preview();
  assert.equal(plan.report.selection.selection.observations.length, 0);
  assert.equal(plan.report.selection.selection.definitions.length, 1);
  assert.match(plan.report.manifest.missingness, /No observations/);
});

test('private reader validates actual envelope and current all-source scope without reviving old approvals', async () => {
  const s = setup(), plan = await s.preview(); s.store(plan.report);
  s.records.get('manifest-one').status = 'frozen';
  s.records.get(s.fixture.points[0].record.recordId).approval = null;
  assert.deepEqual(await readLearningReport(s.client, { org: s.fixture.orgId, id: plan.report.id, member: member() }), plan.report);
  for (const role of ['board_reader', 'external_reviewer', 'contributor'])
    await assert.rejects(readLearningReport(s.client, { org: s.fixture.orgId, id: plan.report.id, member: { ...member(), role } }), error => error.status === 403);
  await assert.rejects(readLearningReport(s.client, { org: s.fixture.orgId, id: plan.report.id, member: { ...member(), programIds: ['other'] } }), error => error.status === 404);
  const point = s.records.get(s.fixture.points[0].record.recordId);
  point.data.programId = 'other-program';
  await assert.rejects(readLearningReport(s.client, { org: s.fixture.orgId, id: plan.report.id, member: { ...member(), programIds: [s.fixture.programId] } }), error => error.status === 404);
  point.data.programId = s.fixture.programId;
  point.module_id = 'evaluation';
  await assert.rejects(readLearningReport(s.client, { org: s.fixture.orgId, id: plan.report.id, member: member() }), error => error.status === 404);
  point.module_id = 'outcomes';
  s.reports.get(plan.report.id).learning_payload_bytes = 4194305;
  await assert.rejects(readLearningReport(s.client, { org: s.fixture.orgId, id: plan.report.id, member: member() }), error => error.code === 'learning_size');
  s.reports.get(plan.report.id).learning_payload_bytes = learningJSONBBytes(plan.report);
  s.reports.get(plan.report.id).title = 'Different envelope title';
  await assert.rejects(readLearningReport(s.client, { org: s.fixture.orgId, id: plan.report.id, member: member() }), error => error.status === 404);
});
