import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { database, logicalBackupBytes, saveRecord, audit } from '../lib/database.mjs';
import { applicationGrantsSql } from '../lib/migration-grants.mjs';
import { makeBackup, validateBackup, restoredIntegrations } from '../lib/backup.mjs';
import { assembleWorkspaceBackup } from '../lib/workspace-backup.mjs';
import { measureLearningRestoreCapacity, checkLearningRestoreCapacity, LEARNING_RESTORE_CAPACITY as LIMIT } from '../lib/learning-capacity.mjs';
import { restoredIntake, restoreIntake } from '../lib/intake-backup.mjs';
import { restoredParticipation, restoreParticipation } from '../lib/participation-backup.mjs';
import { restoredDelivery, restoreDelivery } from '../lib/participation-delivery-backup.mjs';
import { restoredTaskRecurrence, restoreTaskRecurrence } from '../lib/task-recurrence-backup.mjs';
import { restoreDirectoryResources } from '../lib/directory-resource-backup.mjs';
import { restoreLearningBridge, restoredLearningBridge } from '../lib/learning-backup.mjs';
import { learningWriteCapability } from '../lib/learning-guards.mjs';
import { MODULE_MAP, validateRecord } from '../lib/modules.mjs';
import { validateFile } from '../lib/files.mjs';
import { clean, hash, id } from '../lib/security.mjs';
import { participationTerms } from '../lib/participation.mjs';
import { prepareTaskRecurrence } from '../lib/task-recurrence-model.mjs';
import { directoryCatalog, headDirectoryEntries, directoryEntrySha256 } from '../lib/directory-catalog.mjs';
import { buildDirectoryPlan, buildDirectoryEvent } from '../lib/directory-resource-model.mjs';
import { buildLearningFixture } from '../test/learning-fixtures.mjs';

const configured = !!(process.env.DATABASE_URL && process.env.OS_DATABASE_URL), at = '2026-10-27T00:00:00.000Z';
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const direct = value => { const url = new URL(value); url.hostname = url.hostname.replace(/-pooler(?=\.)/, ''); return url.toString(); };
const org = 'fictional-capacity-source', actor = 'u'.repeat(100), target = 'o'.repeat(100), largeTarget = 't'.repeat(100);
const organization = { name: 'Fictional capacity proof', currency: 'USD', time_zone: 'UTC' };
function ordinary(moduleId, recordId, data, records = []) {
  const status = MODULE_MAP[moduleId].workflow.initial;
  return { id: recordId, orgId: org, moduleId, data: validateRecord(moduleId, data, { orgId: org, recordId, records, status }),
    status, ownerId: actor, lastEditedBy: actor, revision: 1, approval: null, snapshot: null, source: null, createdAt: at, updatedAt: at };
}
function richFixture() {
  const learning = buildLearningFixture({ orgId: org, actorId: actor });
  const document = ordinary('documents', 'capacity-document', { title: 'Fictional file', kind: 'document' });
  const event = ordinary('events', 'capacity-event', { title: 'Fictional occurrence', kind: 'session',
    startAt: '2099-01-02T09:00:00+00:00', endAt: '2099-01-02T11:00:00+00:00', timeZone: 'UTC', capacity: 2,
    participationPurpose: 'Arrange this fictional activity.', participantInstructions: 'Bring a notebook.', organizerEmail: 'organizer@example.invalid' });
  const contact = ordinary('contacts', 'capacity-contact', { title: 'Fictional contact', kind: 'person-reference' });
  const booking = ordinary('events', 'capacity-booking', { title: 'Fictional registration', kind: 'registration', eventId: event.id, contactId: contact.id }, [event, contact]);
  const terms = participationTerms(event);
  const task = ordinary('projects', 'capacity-task', { title: 'Fictional recurring task', kind: 'task', dueAt: '2027-01-31T09:00:00.000Z', timeZone: 'UTC', recurrence: 'monthly' });
  task.status = 'planned';
  const plan = prepareTaskRecurrence({ source: task, series: null, member: { userId: actor, role: 'owner', programIds: [], revision: 1, createdAtExact: at.replace('.000Z', '.000000Z') }, records: [task], resolution: null }).plan;
  const child = { ...plan.candidate, id: plan.generatedRecordId, orgId: org, createdAt: at, updatedAt: at };
  const recurrence = { format: 'charitology-os-task-recurrence', version: 1, series: [{ id: plan.seriesId, rootRecordId: task.id,
    method: plan.method, anchor: plan.anchor, state: 'active', revision: 1, tipRecordId: child.id, tipSequence: 1,
    createdBy: actor, createdAt: at, endedAt: null, endCode: null, recoveredState: null, budgetBytes: 4096 }],
    occurrences: [{ seriesId: plan.seriesId, sequence: 1, sourceRecordId: task.id, sourceRevision: task.revision, sourceDataHash: plan.sourceDataHash,
      capturedSource: { moduleId: 'projects', kind: 'task', programId: task.data.programId, dueAt: task.data.dueAt, timeZone: task.data.timeZone, recurrence: task.data.recurrence },
      generatedRecordId: child.id, initialGeneratedDataHash: plan.candidateDataHash, generatedModuleId: 'projects', generatedKindAtCreation: 'task',
      method: plan.method, anchorHash: hash(plan.anchor), selectedCivil: plan.chosen.dueAt.slice(0, 23), chosen: plan.chosen, planHash: plan.planHash,
      originalActorId: actor, acceptedCommandHash: hash('fictional-capacity-command'), acceptedRequestHash: hash('fictional-capacity-request'), createdAt: at }] };
  const capture = directoryCatalog.captures.at(-1), entry = headDirectoryEntries()[0], directoryAt = new Date().toISOString();
  const proposal = { intent: 'copy', selection: { captureId: capture.captureId, catalogKind: entry.catalogKind, listingId: entry.listing.id, entrySha256: directoryEntrySha256(entry) },
    acceptHistoricalVersion: false, target: null, copiedFields: ['title', 'catalogUrl', 'sourceUrl'], sourceChoice: null, limitations: { kind: 'replace-all', adoptionNotes: null }, assessment: null };
  const directoryPlan = buildDirectoryPlan({ proposal, orgId: org, actorId: actor, membershipSha256: hash('fictional-membership'), restoreEpoch: null, now: directoryAt,
    context: { member: { userId: actor, role: 'owner', programIds: [] }, ownerIds: [actor], records: [] } });
  const directoryEvent = buildDirectoryEvent(directoryPlan, { actorId: actor, originOrgId: org, recordedAt: directoryAt, proposal });
  const resource = ordinary('resources', directoryPlan.resourceId, directoryPlan.candidate.data);
  const bytes = Buffer.alloc(200, 'x');
  return makeBackup(organization, [...learning.records, document, event, contact, booking, task, child, resource], {
    comments: [], events: [], reports: [], trash: [], trashFiles: [],
    integrations: [{ id: 'capacity-csv', provider: 'csv', name: 'Fictional CSV', config: { moduleId: 'contacts', fieldMap: { Name: 'title' } } }],
    files: [{ id: 'source-file', recordId: document.id, name: 'fictional.txt', mime: 'text/plain', size: bytes.length, checksum: hash(bytes), content: bytes.toString('base64') }],
    intake: { version: 1, publications: [{ id: 'capacity-publication', recordId: document.id, sourceRevision: 1, kind: 'contact', targetId: null, targetModule: null, targetRevision: null,
      createdAt: at, schema: { kind: 'contact', title: 'Fictional form', purpose: 'Reply to this fictional request.', questions: [{ key: 'email', label: 'Email', type: 'text', required: true }], retentionUntil: '2026-10-28' } }],
      submissions: [{ id: 'capacity-request', publicationId: 'capacity-publication', answers: { email: 'fiction@example.invalid' }, consentAt: at, createdAt: at, status: 'reviewed', convertedIds: [] }] },
    participation: { version: 1, targets: [{ targetId: event.id, moduleId: 'events', sourceRevision: 1, terms, termsHash: hash(terms), createdAt: at }],
      participations: [{ id: 'capacity-participation', targetId: event.id, moduleId: 'events', bookingRecordId: booking.id, contactId: contact.id, intakeId: null,
        state: 'confirmed', source: 'staff', revision: 1, frozen: { terms, sourceRevision: 1, termsHash: hash(terms) }, createdAt: at }],
      outbox: [{ id: 'capacity-outbox', participationId: 'capacity-participation', eventRevision: 1, purpose: 'participation', channel: 'email', state: 'paused',
        payload: { state: 'confirmed', participationId: 'capacity-participation', revision: 1 }, createdAt: at }] },
    delivery: { version: 1, policy: { revision: 1, enabled: true, activatedAt: at, updatedAt: at, templateVersion: 'participation-notice-v1' } },
    taskRecurrence: recurrence,
    directoryResources: { format: 'charitology-directory-resources', version: 1, method: 'directory-resource-v1', captures: [{ captureId: capture.captureId, core: capture.core }],
      bindings: [{ id: directoryPlan.bindingId, resourceId: resource.id, catalogKind: entry.catalogKind, listingId: entry.listing.id, events: [{ ...directoryEvent, provenance: 'live' }] }] },
    learningBridge: learning.backup,
  });
}
async function restore(c, destination, backup, { journals = true } = {}) {
  const records = validateBackup(backup, destination, actor), capability = learningWriteCapability('restore', records);
  const context = { records: backup.records, trash: backup.trash || [], legacyReports: backup.reports || [] };
  const intake = restoredIntake(backup), participation = restoredParticipation(backup), recurrence = restoredTaskRecurrence(backup.taskRecurrence, context), learning = restoredLearningBridge(backup.learningBridge, context);
  for (const connection of restoredIntegrations(backup)) await c.query("INSERT INTO os_integrations(org_id,id,provider,name,config,status) VALUES($1,$2,$3,$4,$5,'unconfigured')", [destination, connection.id, connection.provider, connection.name, JSON.stringify(connection.config)]);
  for (const record of records) {
    if (journals) { await saveRecord(c, record, { learningCapability: capability }); await audit(c, destination, actor, 'record.restored', record, { record, sourceChecksum: backup.checksum }); }
    else await c.query('INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision,source) VALUES($1,$2,$3,$4,$5,$6,$6,1,$7)', [destination, record.id, record.moduleId, JSON.stringify(record.data), record.status, actor, record.source ? JSON.stringify(record.source) : null]);
  }
  for (const file of backup.files || []) {
    const verified = validateFile(file);
    await c.query('INSERT INTO os_files(org_id,id,record_id,name,mime,checksum,size,bytes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [destination, id(), file.recordId, clean(file.name, 180), clean(file.mime, 100), verified.checksum, verified.size, verified.bytes, actor]);
  }
  await restoreIntake(c, destination, actor, intake); await restoreParticipation(c, destination, actor, participation);
  await restoreDelivery(c, destination, actor, restoredDelivery(backup)); await restoreTaskRecurrence(c, destination, actor, recurrence);
  await restoreDirectoryResources(c, destination, backup.directoryResources, context); await restoreLearningBridge(c, destination, backup.learningBridge, context);
  if (journals) await audit(c, destination, actor, 'backup.restored', null, { count: records.length, checksum: backup.checksum, sourceArchiveId: 'a'.repeat(32),
    sourceHistoryCount: backup.events?.length || 0, sourceCommentCount: backup.comments?.length || 0, sourceReportCount: backup.reports?.length || 0,
    learningSourcesRecovered: learning?.sources.length || 0, learningEventsRetained: learning?.events.length || 0, learningReportsRecovered: learning?.reports.length || 0,
    intakePublicationsClosed: intake.publications.length, intakeRequests: intake.submissions.length, participationTargetsRecovered: participation.targets.length,
    participationsRecovered: participation.participations.length, taskRecurrenceSeriesRecovered: recurrence.series.length, taskRecurrenceOccurrencesRetained: recurrence.occurrences.length });
  return records;
}

test('actual PostgreSQL read-only whole restore capacity and near-limit emitted backup closure', {
  skip: configured ? false : 'Private owner/constrained URLs required for an isolated schema.', timeout: 600000,
}, async t => {
  const schema = 'os_learning_capacity_' + randomBytes(8).toString('hex'), owner = database(direct(process.env.DATABASE_URL));
  let migration, db;
  const tx = (fn, organization = org) => db.tx(actor, organization, fn, { lock: true });
  // Seed a historical source deliberately rejected by the new destination-reserve gate, in this owned schema only.
  const sourceFixtureTx = async fn => {
    const c = await migration.pool.connect();
    try { await c.query('BEGIN'); await c.query("SELECT set_config('app.org_id',$1,true),set_config('app.user_id',$2,true)", [org, actor]);
      const result = await fn(c); await c.query('COMMIT'); return result;
    } catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); }
  };
  try {
    await owner.pool.query(`CREATE SCHEMA ${quote(schema)}`);
    migration = database(direct(process.env.DATABASE_URL), { schema }); await migration.migrate();
    assert.equal((await migration.pool.query('SELECT current_schema() AS name')).rows[0].name, schema);
    const role = decodeURIComponent(new URL(process.env.OS_DATABASE_URL).username);
    assert.notEqual(role, decodeURIComponent(new URL(process.env.DATABASE_URL).username));
    await migration.pool.query(applicationGrantsSql(role, schema)); db = database(direct(process.env.OS_DATABASE_URL), { schema });
    for (const organizationId of [org, target, largeTarget]) await tx(c => c.query("INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,$2,$1,'USD','UTC')", [organizationId, organization.name]), organizationId);
    let emitted, projected;
    await t.test('complete actual schema, every restored feature row and files are measured without writes', async () => {
      const input = richFixture();
      await tx(c => restore(c, org, input, { journals: false }));
      emitted = await tx(c => assembleWorkspaceBackup(c, org));
      const before = await tx(c => logicalBackupBytes(c, org));
      projected = await tx(c => checkLearningRestoreCapacity({ query: (sql, args) => { assert.match(sql, /^SELECT /); return c.query(sql, args); } }, emitted));
      assert.equal(await tx(c => logicalBackupBytes(c, org)), before);
      assert.equal(projected.categories.os_events.count, emitted.records.length + 2, 'Fresh API target creation audit is charged.');
      for (const table of ['os_records', 'os_events', 'os_integrations', 'os_publications', 'os_intake', 'os_participation_targets', 'os_participations', 'os_participation_outbox', 'os_participation_delivery_policies', 'os_task_recurrence_series', 'os_task_recurrence_occurrences', 'os_resource_directory_history', 'os_learning_history', 'os_files']) assert.ok(projected.categories[table].count > 0, table);
      const baselinePayload = { id: 'original-legacy-report', title: 'Original destination snapshot', createdBy: actor, createdAt: at,
        modules: [{ id: 'programs', title: 'Programs', records: [] }], sourceRevisions: [], missingness: 'Fictional original destination snapshot.' };
      baselinePayload.checksum = hash(baselinePayload);
      await tx(async c => { await audit(c, target, actor, 'organization.created');
        await c.query('INSERT INTO os_reports(org_id,id,created_by,title,checksum,payload) VALUES($1,$2,$3,$4,$5,$6)', [target, baselinePayload.id, actor, baselinePayload.title, baselinePayload.checksum, JSON.stringify(baselinePayload)]);
      }, target);
      const baselineBytes = await tx(c => logicalBackupBytes(c, target), target);
      const targetProjected = await tx(c => checkLearningRestoreCapacity(c, emitted, { orgId: target, actorId: actor, baselineOrgId: target }), target);
      assert.equal(targetProjected.categories.targetBaseline.count, 2); assert.equal(targetProjected.categories.targetBaseline.bytes, baselineBytes);
      await assert.rejects(tx(c => measureLearningRestoreCapacity(c, emitted, { orgId: target, baselineOrgId: org }), target), error => error.code === 'learning_capacity_schema');
      await tx(c => restore(c, target, emitted), target);
      const actual = await tx(c => logicalBackupBytes(c, target), target), output = await tx(c => assembleWorkspaceBackup(c, target), target);
      assert.ok(actual <= targetProjected.logicalBytes, `${actual} > ${targetProjected.logicalBytes}`);
      assert.ok(Buffer.byteLength(JSON.stringify(output)) <= targetProjected.backupBytes);
      assert.deepEqual(output.reports[0].payload, baselinePayload); assert.ok(output.events.some(event => event.action === 'organization.created'));
      await assert.rejects(tx(c => measureLearningRestoreCapacity(c, emitted, { orgId: target, actorId: actor, baselineOrgId: target }), target), error => error.code === 'restore_conflict');
      assert.equal(output.learningBridge.reports.length, 1); assert.deepEqual(output.learningBridge, emitted.learningBridge);
      assert.equal((await tx(c => c.query('SELECT recovered_state FROM os_participation_outbox'), target)).rows[0].recovered_state, 'paused');
      assert.match(output.files[0].content, /\n/);
      t.diagnostic(JSON.stringify({ smallActual: actual, smallProjected: targetProjected.logicalBytes, smallExport: Buffer.byteLength(JSON.stringify(output)), smallProjectedExport: targetProjected.backupBytes, baselineBytes }));
    });
    await t.test('original target report identity collisions refuse before any restore writes', async () => {
      const report = emitted.learningBridge.reports[0];
      await tx(c => c.query('INSERT INTO os_reports(org_id,id,created_by,title,checksum,payload) VALUES($1,$2,$3,$4,$5,$6)', [largeTarget, report.id, actor, 'Fictional collision', hash('fictional-legacy-collision'), '{}']), largeTarget);
      await assert.rejects(tx(c => measureLearningRestoreCapacity(c, emitted, { orgId: largeTarget, actorId: actor, baselineOrgId: largeTarget }), largeTarget), error => error.code === 'restore_conflict');
      assert.equal((await tx(c => c.query('SELECT count(*) FROM os_records'), largeTarget)).rows[0].count, '0');
      const checksumTarget = 'c'.repeat(100);
      await tx(async c => { await c.query("INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,$2,$1,'USD','UTC')", [checksumTarget, organization.name]);
        await c.query("INSERT INTO os_reports(org_id,id,created_by,title,checksum,payload) VALUES($1,'different-legacy-id',$2,'Fictional checksum collision',$3,'{}')", [checksumTarget, actor, report.checksum]);
      }, checksumTarget);
      await assert.rejects(tx(c => measureLearningRestoreCapacity(c, emitted, { orgId: checksumTarget, actorId: actor, baselineOrgId: checksumTarget }), checksumTarget), error => error.code === 'restore_conflict');
      // Immutable report remains in its own isolated target; the near-cap proof uses a different empty organization.
    });
    await t.test('closed schema gate refuses an added column rather than silently undercounting', async () => {
      assert.ok(emitted, 'The complete fixture must succeed before checking schema drift.');
      const c = await migration.pool.connect();
      try { await c.query('BEGIN'); await c.query('ALTER TABLE os_records ADD COLUMN fictional_future_metadata text');
        await assert.rejects(measureLearningRestoreCapacity(c, emitted), error => error.code === 'learning_capacity_schema');
      } finally { await c.query('ROLLBACK'); c.release(); }
    });
    await t.test('real near-60 MiB source emits under 64 MiB and restores with mandatory ordinary journals', async () => {
      assert.ok(emitted, 'The complete fixture must succeed before checking near-capacity restore.');
      // Source journals are legitimate archived provenance, not reinstalled rows. The destination must reserve its new journals.
      const largeData = '界'.repeat(4000), maxPrograms = 300;
      const programData = ordinary('programs', 'capacity-program', { title: 'Fictional large program', kind: 'program', purpose: largeData, community: largeData, mechanism: largeData, assumptions: largeData }).data;
      const programs = Array.from({ length: maxPrograms }, (_, index) => ({ ...ordinary('programs', 'capacity-program-' + index, { title: 'Fictional large program', kind: 'program' }), data: programData }));
      await sourceFixtureTx(async c => {
        for (const record of programs) await c.query("INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision) VALUES($1,$2,'programs',$3,'draft',$4,$4,1)", [org, record.id, JSON.stringify(record.data), actor]);
        for (let index = 0; index < 13; index++) {
          const bytes = Buffer.alloc((index === 12 ? 1 : 2) * 1024 * 1024, 'x');
          await c.query('INSERT INTO os_files(org_id,id,record_id,name,mime,checksum,size,bytes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [org, 'large-file-' + index, 'capacity-document', 'fictional-' + index + '.txt', 'text/plain', hash(bytes), bytes.length, bytes, actor]);
        }
        await c.query("DELETE FROM os_files WHERE org_id=$1 AND name='fictional.txt'", [org]);
      });
      emitted = await sourceFixtureTx(c => assembleWorkspaceBackup(c, org));
      projected = await sourceFixtureTx(c => measureLearningRestoreCapacity(c, emitted));
      // The old source-only gate accepts this actual larger inventory, while destination accounting rejects it before writes.
      assert.ok(await sourceFixtureTx(c => logicalBackupBytes(c, org)) < LIMIT.logicalBytes);
      assert.ok(Buffer.byteLength(JSON.stringify(emitted)) < LIMIT.backupBytes);
      assert.ok(projected.requiredLogicalBytes > LIMIT.logicalBytes);
      const beforeRejection = await sourceFixtureTx(c => logicalBackupBytes(c, org));
      await assert.rejects(sourceFixtureTx(c => checkLearningRestoreCapacity(c, emitted)), error => error.code === 'learning_restore_capacity');
      assert.equal(await sourceFixtureTx(c => logicalBackupBytes(c, org)), beforeRejection);
      const perProgram = projected.categories.os_records.bytes / emitted.records.length + projected.categories.os_events.bytes / emitted.records.length;
      const remove = Math.max(0, Math.ceil((projected.requiredLogicalBytes - (LIMIT.logicalBytes - 128 * 1024)) / perProgram));
      assert.ok(remove < maxPrograms && remove > 0);
      await sourceFixtureTx(async c => { for (const record of programs.slice(maxPrograms - remove)) await c.query('DELETE FROM os_records WHERE org_id=$1 AND id=$2', [org, record.id]); });
      emitted = null;
      let usage = await sourceFixtureTx(c => logicalBackupBytes(c, org));
      const padding = LIMIT.logicalBytes - 16 * 1024 - usage - 500;
      assert.ok(padding > 0);
      await sourceFixtureTx(c => c.query("INSERT INTO os_events(org_id,actor_id,action,detail) VALUES($1,$2,'fictional.source-history',$3)", [org, actor, JSON.stringify({ padding: 'x'.repeat(padding) })]));
      usage = await sourceFixtureTx(c => logicalBackupBytes(c, org));
      emitted = await sourceFixtureTx(c => assembleWorkspaceBackup(c, org));
      const sourceBytes = Buffer.byteLength(JSON.stringify(emitted));
      projected = await sourceFixtureTx(c => checkLearningRestoreCapacity(c, emitted));
      assert.ok(usage <= LIMIT.logicalBytes && usage >= LIMIT.logicalBytes - 32 * 1024);
      assert.ok(sourceBytes <= LIMIT.backupBytes);
      assert.ok(projected.requiredLogicalBytes >= LIMIT.logicalBytes - 512 * 1024);
      const nearTarget = 'n'.repeat(100);
      await tx(c => c.query("INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,$2,$1,'USD','UTC')", [nearTarget, organization.name]), nearTarget);
      await tx(c => restore(c, nearTarget, emitted), nearTarget);
      const actual = await tx(c => logicalBackupBytes(c, nearTarget), nearTarget);
      const restored = await tx(c => assembleWorkspaceBackup(c, nearTarget), nearTarget), restoredBytes = Buffer.byteLength(JSON.stringify(restored));
      assert.ok(actual <= projected.logicalBytes && actual + LIMIT.auditCheckReserveBytes <= LIMIT.logicalBytes);
      assert.ok(restoredBytes <= projected.backupBytes && restoredBytes <= LIMIT.backupBytes);
      assert.equal(restored.records.length + 1, (await tx(c => c.query('SELECT count(*) FROM os_events'), nearTarget)).rows[0].count * 1);
      assert.deepEqual(restored.learningBridge, emitted.learningBridge);
      t.diagnostic(JSON.stringify({ sourceUsage: usage, sourceBytes, requiredDestination: projected.requiredLogicalBytes, actualDestination: actual, projectedDestinationExport: projected.backupBytes, actualDestinationExport: restoredBytes, records: emitted.records.length }));
    });
  } finally {
    if (db) await db.close(); if (migration) await migration.close();
    await owner.pool.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`); await owner.close();
  }
});
