import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { database, logicalBackupBytes, saveRecord, audit } from '../lib/database.mjs';
import { applicationGrantsSql } from '../lib/migration-grants.mjs';
import { makeBackup, validateBackup } from '../lib/backup.mjs';
import { validateRecord, MODULE_MAP } from '../lib/modules.mjs';
import { hash } from '../lib/security.mjs';
import { participationTerms } from '../lib/participation.mjs';
import { restoreParticipation, restoredParticipation, exportParticipation } from '../lib/participation-backup.mjs';
import { restoreIntake, restoredIntake, exportIntake } from '../lib/intake-backup.mjs';
import { intakeSchema } from '../lib/intake.mjs';
import { DELIVERY_CONSENT_VERSION } from '../lib/participation-delivery.mjs';
import { restoreLearningBridge } from '../lib/learning-backup.mjs';
import { learningWriteCapability } from '../lib/learning-guards.mjs';
import { assembleWorkspaceBackup, checkWorkspaceExportCapacity } from '../lib/workspace-backup.mjs';
import { measureLearningRestoreCapacity, measureLearningOperationalCapacity, LEARNING_OPERATIONAL_CAPACITY as O, LEARNING_RESTORE_CAPACITY as C } from '../lib/learning-capacity.mjs';
import { learningMappedFixture } from '../test/learning-fixtures.mjs';
import { participationTimestampParameter as parameter } from '../lib/participation-timestamp.mjs';
const configured = !!(process.env.DATABASE_URL && process.env.OS_DATABASE_URL), at = '2026-10-27T00:00:00.000Z';
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const direct = value => { const url = new URL(value); url.hostname = url.hostname.replace(/-pooler(?=\.)/, ''); return url.toString(); };
const org = 's'.repeat(100), target = 't'.repeat(100), actor = 'u'.repeat(100), pId = 'fictional-participation';
test('actual PostgreSQL finite worker metadata reserve preserves source bytes and inactive restored closure', {
  skip: configured ? false : 'Private owner/constrained URLs required for an isolated schema.', timeout: 600000,
}, async t => {
  const schema = 'os_learning_operational_' + randomBytes(8).toString('hex'), owner = database(direct(process.env.DATABASE_URL));
  let migration, db, sourceBackup, sourceProof, restoreProof;
  const tx = (fn, tenant = org, options = {}) => db.tx(actor, tenant, fn, { lock: true, ...options });
  const fixtureTx = async (fn, { rollback = false } = {}) => {
    const c = await migration.pool.connect();
    try { await c.query('BEGIN'); await c.query("SELECT set_config('app.org_id',$1,true),set_config('app.user_id',$2,true)", [org, actor]);
      const value = await fn(c); await c.query(rollback ? 'ROLLBACK' : 'COMMIT'); return value;
    } catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); }
  };
  try {
    await owner.pool.query(`CREATE SCHEMA ${quote(schema)}`); migration = database(direct(process.env.DATABASE_URL), { schema }); await migration.migrate();
    assert.equal((await migration.pool.query('SELECT current_schema() AS name')).rows[0].name, schema);
    const role = decodeURIComponent(new URL(process.env.OS_DATABASE_URL).username); assert.notEqual(role, decodeURIComponent(new URL(process.env.DATABASE_URL).username));
    await migration.pool.query(applicationGrantsSql(role, schema)); db = database(direct(process.env.OS_DATABASE_URL), { schema });
    for (const tenant of [org, target]) await tx(c => c.query("INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional worker capacity',$1,'USD','UTC')", [tenant]), tenant);
    const f = learningMappedFixture({ orgId: org, actorId: actor }), bridge = { format: 'charitology-learning-backup', version: 1, method: 'learning-review-v1', sources: f.sources, approvedEvidence: [], events: f.events, reports: [] };
    const ordinary = (moduleId, id, data, records = []) => ({ id, orgId: org, moduleId,
      data: validateRecord(moduleId, data, { records, orgId: org, recordId: id, status: MODULE_MAP[moduleId].workflow.initial }),
      status: MODULE_MAP[moduleId].workflow.initial, ownerId: actor, revision: 1, approval: null, snapshot: null, source: null });
    const event = ordinary('events', 'fictional-event', { title: 'Fictional occurrence', kind: 'session', startAt: '2099-01-02T09:00:00+00:00', endAt: '2099-01-02T11:00:00+00:00', timeZone: 'UTC',
      capacity: 1, participationPurpose: 'Arrange a fictional activity.', participantInstructions: 'Bring a notebook.', organizerEmail: 'organizer@example.invalid' });
    const contact = ordinary('contacts', 'fictional-contact', { title: 'Fictional contact', kind: 'person-reference' });
    const booking = ordinary('events', 'fictional-booking', { title: 'Fictional registration', kind: 'registration', eventId: event.id, contactId: contact.id }, [event, contact]);
    const input = makeBackup({ name: 'Fictional worker capacity', currency: 'USD', time_zone: 'UTC' }, [...f.records, event, contact, booking], { learningBridge: bridge });
    const records = validateBackup(input, org, actor), terms = participationTerms(event);
    await tx(async c => {
      for (const record of records) await c.query('INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision) VALUES($1,$2,$3,$4,$5,$6,$6,1)', [org, record.id, record.moduleId, JSON.stringify(record.data), record.status, actor]);
      await c.query("INSERT INTO os_participation_targets(org_id,target_id,module_id,source_revision,terms,terms_hash,created_by) VALUES($1,$2,'events',1,$3,$4,$5)", [org, event.id, JSON.stringify(terms), hash(terms), actor]);
      const consent = { version: DELIVERY_CONSENT_VERSION, enabled: true, revision: 1, at, userId: actor, linkId: 'a'.repeat(32), linkRevision: 1, recipientHash: 'b'.repeat(64) };
      await c.query("INSERT INTO os_participations(org_id,id,target_id,module_id,booking_record_id,contact_id,state,source,frozen,created_by,delivery_consent) VALUES($1,$2,$3,'events',$4,$5,'confirmed','staff',$6,$7,$8)", [org, pId, event.id, booking.id, contact.id, JSON.stringify({ terms, sourceRevision: 1, termsHash: hash(terms) }), actor, JSON.stringify(consent)]);
      for (const [id, revision, kind, budget] of [['fictional-live', 1, 'snapshot', 8192], ['fictional-legacy', 2, 'legacy', 0]])
        await c.query("INSERT INTO os_participation_outbox(org_id,id,participation_id,event_revision,state,payload,intent_kind,consent_revision,consent_copy,template_version,relay_key,budget_bytes) VALUES($1,$2,$3,$4,'paused',$5,$6,1,$7,'participation-notice-v1',$8,$9)",
          [org, id, pId, revision, JSON.stringify({ state: 'confirmed', participationId: pId, revision }), kind, DELIVERY_CONSENT_VERSION, kind === 'snapshot' ? 'fictional-local-only-no-provider' : null, budget]);
      await restoreLearningBridge(c, org, bridge, { records: input.records });
    });
    await t.test('actual admitted extended provider year has27 wire characters and measured PG width', async () => {
      const result = (await tx(c => c.query('SELECT $1::timestamptz AS provider,octet_length(to_jsonb($1::timestamptz)::text) AS provider_bytes,octet_length(to_jsonb($2::timestamptz)::text) AS service_bytes,octet_length(to_jsonb($3::timestamptz)::text) AS physical_bytes,$4::timestamptz AS bc,$5::timestamptz AS zero_year', [parameter(O.providerTime), C.timestamp, O.providerPhysicalTime, parameter(O.providerPhysicalWireTime), parameter('0000-01-01T00:00:00.000Z')]), org, { readOnly: true })).rows[0];
      assert.equal(result.provider.toISOString(), O.providerTime); assert.equal(result.provider.toISOString().length, 27);
      assert.equal(result.bc.toISOString(), O.providerPhysicalWireTime); assert.equal(result.zero_year.toISOString(), '0000-01-01T00:00:00.000Z');
      assert.ok(result.provider_bytes >= 31); assert.ok(result.service_bytes >= result.provider_bytes); assert.ok(result.physical_bytes > result.service_bytes);
      t.diagnostic(JSON.stringify({ providerWire: 27, providerPG: result.provider_bytes, servicePG: result.service_bytes, physicalBC: result.physical_bytes }));
    });
    let originalText, beforeUsage, beforeWire;
    await t.test('separate read-only source and destination proof charges legacy growth without changing source bytes', async () => {
      sourceBackup = await tx(c => assembleWorkspaceBackup(c, org), org, { readOnly: true }); originalText = JSON.stringify(sourceBackup);
      beforeUsage = await tx(c => logicalBackupBytes(c, org), org, { readOnly: true }); beforeWire = Buffer.byteLength(originalText);
      sourceProof = await tx(c => measureLearningOperationalCapacity(c, org, sourceBackup.participation), org, { readOnly: true });
      restoreProof = await tx(c => measureLearningRestoreCapacity(c, sourceBackup), org, { readOnly: true });
      assert.equal(sourceProof.active, true); assert.equal(sourceProof.affectedParticipations, 1); assert.equal(sourceProof.nonlegacyRows, 1);
      assert.ok(sourceProof.maxNonlegacyRowBytes <= 8192); assert.ok(sourceProof.sourceOutboxGrowthBytes > 0); assert.ok(sourceProof.sourceParticipationGrowthBytes > 0);
      assert.ok(sourceProof.sourceWireGrowthBytes > 0); assert.ok(restoreProof.operational.destinationOutboxGrowthBytes > 0);
      assert.ok(restoreProof.operational.destinationWireMetadataExtraBytes >= 0);
      assert.equal(JSON.stringify(sourceBackup), originalText); assert.equal(await tx(c => logicalBackupBytes(c, org), org, { readOnly: true }), beforeUsage);
      const whole = await tx(c => checkWorkspaceExportCapacity(c, org), org, { readOnly: true });
      assert.equal(whole.requiredUsage, whole.usage + sourceProof.sourceLogicalGrowthBytes); assert.equal(whole.requiredBackupBytes, whole.backupBytes + sourceProof.sourceWireGrowthBytes);
    });
    await t.test('actual worst worker-shaped metadata remains inside source reserves without provider actions', async () => {
      await tx(async c => {
        await c.query("UPDATE os_participation_outbox SET state='suppressed',safe_code=$2,attempts=$3,first_attempt_at=$4,last_checked_at=$4,provider_event_at=$5,lease_owner=$6,lease_until=$4,next_at=$4 WHERE org_id=$1 AND intent_kind<>'legacy'", [org, O.safeCode, O.attempts, C.timestamp, parameter(O.providerTime), 'f'.repeat(32)]);
        await c.query("UPDATE os_participation_outbox SET state='cancelled',safe_code='authority_withdrawn',lease_owner=NULL,lease_until=NULL WHERE org_id=$1 AND intent_kind='legacy'", [org]);
        await c.query("UPDATE os_participations SET revision=$2,updated_at=$3,delivery_consent=jsonb_build_object('version',$4::text,'enabled',false,'revision',$2::integer,'at',$5::text) WHERE org_id=$1", [org, O.attempts, C.timestamp, DELIVERY_CONSENT_VERSION, O.serviceTime]);
      });
      const after = await tx(c => assembleWorkspaceBackup(c, org), org, { readOnly: true });
      assert.ok(await tx(c => logicalBackupBytes(c, org), org, { readOnly: true }) <= beforeUsage + sourceProof.sourceLogicalGrowthBytes);
      assert.ok(Buffer.byteLength(JSON.stringify(after)) <= beforeWire + sourceProof.sourceWireGrowthBytes);
      assert.ok(Buffer.byteLength(JSON.stringify(after.participation.outbox)) <= sourceProof.sourceOutboxWireBytes);
      assert.ok(Buffer.byteLength(JSON.stringify(after.participation.participations)) <= sourceProof.sourceParticipationWireBytes);
      assert.deepEqual(after.learningBridge, sourceBackup.learningBridge);
      assert.deepEqual(after.participation.outbox.map(row => row.payload), sourceBackup.participation.outbox.map(row => row.payload));
      sourceBackup = after;
    });
    await t.test('bounded incoming journal restores as inactive provenance through the real final transaction gate', async () => {
      const proof = await tx(c => measureLearningRestoreCapacity(c, sourceBackup), org, { readOnly: true });
      await tx(async c => {
        const imported = validateBackup(sourceBackup, target, actor), capability = learningWriteCapability('restore', imported);
        for (const record of imported) { await saveRecord(c, record, { learningCapability: capability }); await audit(c, target, actor, 'record.restored', record, { record, sourceChecksum: sourceBackup.checksum }); }
        const participation = restoredParticipation(sourceBackup);
        await restoreParticipation(c, target, actor, participation);
        await restoreLearningBridge(c, target, sourceBackup.learningBridge, { records: sourceBackup.records, trash: sourceBackup.trash, legacyReports: sourceBackup.reports });
        await audit(c, target, actor, 'backup.restored', null, { count: imported.length, checksum: sourceBackup.checksum, sourceArchiveId: 'a'.repeat(32),
          sourceHistoryCount: sourceBackup.events.length, sourceCommentCount: sourceBackup.comments.length, sourceReportCount: sourceBackup.reports.length,
          learningSourcesRecovered: bridge.sources.length, learningEventsRetained: bridge.events.length, learningReportsRecovered: 0,
          intakePublicationsClosed: 0, intakeRequests: 0, participationTargetsRecovered: participation.targets.length, participationsRecovered: participation.participations.length,
          taskRecurrenceSeriesRecovered: 0, taskRecurrenceOccurrencesRetained: 0 });
      }, target);
      const restored = await tx(c => assembleWorkspaceBackup(c, target), target, { readOnly: true });
      assert.ok(await tx(c => logicalBackupBytes(c, target), target, { readOnly: true }) <= proof.logicalBytes);
      assert.ok(Buffer.byteLength(JSON.stringify(restored)) <= proof.backupBytes);
      assert.ok(restored.participation.participations.every(row => row.recovered && row.revision === 1));
      assert.ok(restored.participation.outbox.every(row => row.intentKind === 'legacy' && row.state === 'cancelled'));
      assert.deepEqual(restored.learningBridge, sourceBackup.learningBridge);
    });
    await t.test('a missing nonlegacy prepaid reserve refuses without changing installed rows', async () => {
      await fixtureTx(async c => { await c.query("UPDATE os_participation_outbox SET budget_bytes=0 WHERE org_id=$1 AND intent_kind<>'legacy'", [org]);
        await assert.rejects(measureLearningOperationalCapacity(c, org, sourceBackup.participation), error => error.code === 'learning_operational_capacity');
      }, { rollback: true });
      assert.equal((await tx(c => c.query("SELECT budget_bytes FROM os_participation_outbox WHERE intent_kind<>'legacy'"), org, { readOnly: true })).rows[0].budget_bytes, 8192);
    });
    await t.test('admitted intake and participation scalar timestamps retain exact UTC wire values across supported years', async () => {
      const bcTarget = 'b'.repeat(100), portable = structuredClone(sourceBackup.participation);
      const expected = { createdAt: O.providerPhysicalWireTime, attemptedAt: '0000-01-01T00:00:00.000Z', lastCheckedAt: O.providerTime, providerEventAt: '-000001-01-01T00:00:00.000Z' };
      Object.assign(portable.outbox.find(value => value.id === 'fictional-legacy'), expected);
      portable.targets[0].createdAt = O.providerTime;
      Object.assign(portable.participations[0], { state: 'cancelled', createdAt: '0000-02-01T00:00:00.000Z', cancelledAt: '-000001-03-01T00:00:00.000Z' });
      const form = ordinary('forms', 'fictional-form', { title: 'Fictional UTC form', kind: 'form', version: 1,
        definition: JSON.stringify([{ key: 'name', label: 'Operational name', type: 'text', required: true }]),
        purpose: 'Arrange a fictional response.', retentionUntil: '2099-01-01', consentRequired: true, anonymous: false });
      const intake = { version: 1, publications: [{ id: 'fictional-publication', recordId: form.id, sourceRevision: 1, kind: 'contact',
        targetId: null, targetModule: null, targetRevision: null, schema: intakeSchema(form, 'contact'), createdAt: '0000-04-01T00:00:00.000Z', withdrawnAt: null }],
        submissions: [{ id: 'fictional-request', publicationId: 'fictional-publication', answers: {}, consentAt: '0000-05-01T00:00:00.000Z',
          status: 'cancelled', convertedIds: [], createdAt: '0000-06-01T00:00:00.000Z', erasedAt: '0000-07-01T00:00:00.000Z', cancelledAt: '0000-08-01T00:00:00.000Z' }] };
      const copied = makeBackup({ name: 'Fictional UTC transport', currency: 'USD', time_zone: 'UTC' }, [event, contact, booking, form], { participation: portable, intake });
      const originalCopy = JSON.stringify(copied), imported = validateBackup(copied, bcTarget, actor);
      const admitted = restoredParticipation(copied), admittedIntake = restoredIntake(copied);
      // Intake's existing admission requires four-digit years. The transport fix does not widen it.
      for (const value of [O.providerTime, O.providerPhysicalWireTime]) {
        const invalid = structuredClone(copied); invalid.intake.publications[0].createdAt = value;
        assert.throws(() => restoredIntake(invalid), error => error.code === 'intake_backup');
      }
      const proof = await tx(c => measureLearningRestoreCapacity(c, copied), org, { readOnly: true });
      await tx(async c => {
        await c.query("INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional UTC transport',$1,'USD','UTC')", [bcTarget]);
        for (const record of imported) await c.query('INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision) VALUES($1,$2,$3,$4,$5,$6,$6,1)', [bcTarget, record.id, record.moduleId, JSON.stringify(record.data), record.status, actor]);
        await restoreIntake(c, bcTarget, actor, admittedIntake);
        await restoreParticipation(c, bcTarget, actor, admitted);
      }, bcTarget);
      const recovered = await tx(c => exportParticipation(c, bcTarget), bcTarget, { readOnly: true });
      const row = recovered.outbox.find(value => value.id === 'fictional-legacy');
      for (const [key, value] of Object.entries(expected)) assert.equal(row[key], value, key);
      assert.equal(recovered.targets[0].createdAt, portable.targets[0].createdAt);
      for (const key of ['createdAt', 'cancelledAt']) assert.equal(recovered.participations[0][key], portable.participations[0][key], key);
      const recoveredIntake = await tx(c => exportIntake(c, bcTarget), bcTarget, { readOnly: true });
      assert.equal(recoveredIntake.publications[0].createdAt, intake.publications[0].createdAt);
      for (const key of ['consentAt', 'createdAt', 'erasedAt', 'cancelledAt']) assert.equal(recoveredIntake.submissions[0][key], intake.submissions[0][key], key);
      assert.ok(await tx(c => logicalBackupBytes(c, bcTarget), bcTarget, { readOnly: true }) <= proof.logicalBytes);
      assert.ok(Buffer.byteLength(JSON.stringify(await tx(c => assembleWorkspaceBackup(c, bcTarget), bcTarget, { readOnly: true }))) <= proof.backupBytes);
      assert.equal(JSON.stringify(copied), originalCopy, 'Admission, projection and restore never rewrite original source JSON.');
      assert.equal(sourceBackup.participation.outbox.find(value => value.id === 'fictional-legacy').createdAt === expected.createdAt, false, 'Original source was never rewritten.');
    });
    await t.test('ordinary admission rejects source physical growth at60MiB before commit', async () => {
      const proof = await tx(c => measureLearningOperationalCapacity(c, org, sourceBackup.participation), org, { readOnly: true });
      const usage = await tx(c => logicalBackupBytes(c, org), org, { readOnly: true });
      const overhead = Number((await fixtureTx(c => c.query('SELECT octet_length(to_jsonb(r)::text) AS bytes FROM jsonb_populate_record(NULL::os_events,$1::jsonb) r', [JSON.stringify({ org_id: org, id: C.auditId, actor_id: actor, action: 'fictional.capacity-padding', record_id: null, module_id: null, detail: { padding: '' }, created_at: C.timestamp })]))).rows[0].bytes);
      assert.ok(proof.sourceLogicalGrowthBytes > 50);
      const padding = C.logicalBytes - usage - overhead - 20; assert.ok(padding > 0);
      await fixtureTx(c => c.query("INSERT INTO os_events(org_id,actor_id,action,detail) VALUES($1,$2,'fictional.capacity-padding',jsonb_build_object('padding',repeat('x',$3::integer)))", [org, actor, padding]));
      const actual = await tx(c => logicalBackupBytes(c, org), org, { readOnly: true }); assert.ok(actual < C.logicalBytes && actual + proof.sourceLogicalGrowthBytes > C.logicalBytes);
      const revision = (await tx(c => c.query('SELECT revision FROM os_orgs WHERE id=$1', [org]), org, { readOnly: true })).rows[0].revision;
      await assert.rejects(tx(c => c.query('UPDATE os_orgs SET revision=revision+1 WHERE id=$1', [org])), error => error.code === 'learning_operational_capacity');
      assert.equal((await tx(c => c.query('SELECT revision FROM os_orgs WHERE id=$1', [org]), org, { readOnly: true })).rows[0].revision, revision);
      t.diagnostic(JSON.stringify({ sourceLogicalGrowth: proof.sourceLogicalGrowthBytes, sourceWireGrowth: proof.sourceWireGrowthBytes, sourceOutboxGrowth: proof.sourceOutboxGrowthBytes, maxNonlegacyRow: proof.maxNonlegacyRowBytes, actualSourceBeforeRefusal: actual }));
    });
  } finally {
    if (db) await db.close(); if (migration) await migration.close();
    await owner.pool.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`); await owner.close();
  }
});
