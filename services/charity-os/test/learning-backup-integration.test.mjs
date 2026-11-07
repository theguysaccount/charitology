import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBackup, validateBackup } from '../lib/backup.mjs';
import { buildLearningFixture } from './learning-fixtures.mjs';

const organization = { name: 'Fictional source workspace', currency: 'USD', time_zone: 'UTC' };
test('full backup validator admits complete learning against original records then resets ordinary authority', () => {
  const fixture = buildLearningFixture();
  const backup = makeBackup(organization, fixture.records, { learningBridge: fixture.backup });
  const imported = validateBackup(backup, 'destination-org', 'destination-admin');
  assert.equal(imported.length, fixture.records.length);
  assert.ok(imported.every(record => record.orgId === 'destination-org' && record.ownerId === 'destination-admin' &&
    record.revision === 1 && record.approval === null && record.snapshot === null));
  assert.equal(imported.find(record => record.id === 'manifest-one').status, 'draft');
  assert.equal(fixture.backup.events[0].originOrgId, fixture.orgId);
  const changed = structuredClone(fixture.records);
  changed.find(record => record.id === fixture.definition.record.id).data.title = 'Altered generated definition';
  assert.throws(() => validateBackup(makeBackup(organization, changed, { learningBridge: fixture.backup }), 'destination-org', 'destination-admin'));
});
test('old backup absence remains compatible while present null and whole-family legacy duplication fail closed', () => {
  const fixture = buildLearningFixture({ zeroObservations: true });
  assert.equal(validateBackup(makeBackup(organization, fixture.records), 'destination-org', 'destination-admin').length, fixture.records.length);
  assert.throws(() => validateBackup(makeBackup(organization, fixture.records, { learningBridge: null }), 'destination-org', 'destination-admin'));
  for (const payload of [{ methodVersion: 'learning-unknown-v99' }, fixture.report]) {
    const reports = [{ id: 'legacy-copy', org_id: fixture.orgId, created_by: fixture.actorId, title: 'Fictional copy', checksum: 'a'.repeat(64), payload, created_at: '2026-10-27T00:00:00.000Z' }];
    assert.throws(() => validateBackup(makeBackup(organization, fixture.records, { reports }), 'destination-org', 'destination-admin'));
    assert.throws(() => validateBackup(makeBackup(organization, fixture.records, { reports, learningBridge: fixture.backup }), 'destination-org', 'destination-admin'));
  }
});
