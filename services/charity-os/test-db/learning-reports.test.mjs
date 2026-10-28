import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { database } from '../lib/database.mjs';
import { applicationGrantsSql } from '../lib/migration-grants.mjs';
import { learningHash } from '../lib/learning-json.mjs';
import { loadLearningInventory, insertLearningHistory } from '../lib/learning-history.mjs';
import { prepareLearningReport, previewLearningReport, readLearningReport } from '../lib/learning-reports.mjs';
import { buildLearningFixture } from '../test/learning-fixtures.mjs';

const configured = !!(process.env.DATABASE_URL && process.env.OS_DATABASE_URL);
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const direct = value => { const url = new URL(value); url.hostname = url.hostname.replace(/-pooler(?=\.)/, ''); return url.toString(); };
const at = '2026-10-27T00:00:00.000Z', preparedAt = '2026-10-27T00:00:01.000Z';

test('actual isolated PostgreSQL report preparation, normal transition and private current-scope reader', {
  skip: configured ? false : 'Set owner and constrained URLs for isolated schema checks.', timeout: 300000,
}, async t => {
  const schema = 'os_learning_reports_' + randomBytes(8).toString('hex');
  const owner = database(direct(process.env.DATABASE_URL));
  let migration, db;
  const org = 'fictional-learning-report-org', actor = 'reviewer-one';
  const member = { userId: actor, role: 'admin', programIds: [], revision: 1, createdAtExact: '2026-10-27T00:00:00.000000Z' };
  const tx = fn => db.tx(actor, org, fn, { lock: true });
  const fixture = buildLearningFixture({ orgId: org });
  const args = inventory => ({ org, user: actor, member, inventory });
  const prepare = (c, inventory) => prepareLearningReport(c, { ...args(inventory), selection: fixture.selection.selection, manifestRevision: 1 });
  const preview = (c, inventory) => previewLearningReport(c, { ...args(inventory), finalSelection: fixture.selection, reportId: 'prepared-report', preparedAt });
  const counts = async c => (await c.query("SELECT (SELECT count(*) FROM os_records) AS records,(SELECT count(*) FROM os_events) AS audits,(SELECT count(*) FROM os_reports) AS reports,(SELECT count(*) FROM os_learning_history) AS history,(SELECT count(*) FROM os_learning_previews) AS previews")).rows[0];
  try {
    await owner.pool.query(`CREATE SCHEMA ${quote(schema)}`);
    migration = database(direct(process.env.DATABASE_URL), { schema });
    assert.equal((await migration.pool.query('SELECT current_schema() AS name')).rows[0].name, schema);
    await migration.migrate();
    const role = decodeURIComponent(new URL(process.env.OS_DATABASE_URL).username);
    assert.notEqual(role, decodeURIComponent(new URL(process.env.DATABASE_URL).username));
    await migration.pool.query(applicationGrantsSql(role, schema));
    db = database(direct(process.env.OS_DATABASE_URL), { schema });
    await tx(async c => {
      await c.query("INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional report test',$1,'USD','UTC')", [org]);
      for (const record of fixture.records) {
        await c.query('INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision,approval,snapshot,source,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,$11,$11)',
          [org, record.id, record.moduleId, JSON.stringify(record.data), record.status, record.ownerId, record.lastEditedBy, record.revision, JSON.stringify(record.approval), JSON.stringify(record.snapshot), at]);
        const evidence = fixture.approvedEvidence.find(value => value.pin.recordId === record.id);
        await c.query("INSERT INTO os_events(id,org_id,actor_id,action,record_id,module_id,detail,created_at) VALUES($1,$2,$3,'record.approved',$4,$5,$6,$7)",
          [evidence.approvalEvent.id, org, evidence.approval.actorId, record.id, record.moduleId, JSON.stringify({ record }), at]);
      }
      for (const source of fixture.sources) await insertLearningHistory(c, org, 'source', source);
      for (const evidence of fixture.approvedEvidence.filter(value => value.pin.recordId !== fixture.decision.record.recordId && value.pin.moduleId !== 'reporting'))
        await insertLearningHistory(c, org, 'evidence', evidence);
      for (const event of fixture.events.slice(0, -1)) {
        const payload = event.payload, operation = { mapped: 'map', measured: 'measure', decided: 'decide' }[payload.kind];
        const receipt = { version: 1, operation, commandHash: learningHash('command', { event: event.sha256 }),
          requestHash: learningHash('request', { event: event.sha256 }), actorBindingHash: 'a'.repeat(64), actorId: event.actorId,
          sessionSha256: 'b'.repeat(64), membershipSha256: 'c'.repeat(64), memberCreatedAtExact: member.createdAtExact,
          restoreEpochSha256: 'd'.repeat(64), previewId: 'fictional-preview-' + event.sequence, reviewSha256: 'e'.repeat(64),
          acceptedAt: at, result: { outcome: payload.kind,
            head: { originOrgId: org, bindingId: event.bindingId, sequence: event.sequence, eventSha256: event.sha256 },
            records: payload.records ?? [payload.record], report: null } };
        await insertLearningHistory(c, org, 'event', event, { receipt });
      }
    });

    await t.test('current real approval audits produce the exact digest without writes', async () => {
      await tx(async c => {
        const before = await counts(c), inventory = await loadLearningInventory(c, org);
        const result = await prepare(c, inventory);
        assert.equal(result.sourceDigest, fixture.manifest.sourceDigest);
        assert.equal(result.requiresSave, false); assert.equal(result.requiresApproval, false);
        assert.deepEqual(await counts(c), before);
      });
    });

    let plan;
    await t.test('preview is reproducible and compiles normal approved-to-frozen snapshot metadata', async () => {
      await tx(async c => {
        const before = await counts(c), inventory = await loadLearningInventory(c, org);
        plan = await preview(c, inventory);
        assert.deepEqual(await preview(c, inventory), plan);
        assert.equal(plan.transition.status, 'frozen'); assert.equal(plan.transition.revision, 2);
        assert.equal(plan.transition.approval.revision, 2);
        assert.equal(plan.transition.snapshot.revision, 2); assert.equal(plan.transition.snapshot.status, 'frozen');
        assert.equal(plan.transition.snapshot.updatedAt, at);
        assert.deepEqual(plan.transition.snapshot.files, []);
        assert.deepEqual(plan.report.selection, fixture.selection);
        assert.equal(plan.report.createdAt, preparedAt);
        assert.equal(plan.event.payload.reportChecksum, plan.report.checksum);
        assert.equal(plan.event.payload.frozenManifest.revision, 2);
        assert.ok(!plan.report.events.some(event => event.sha256 === plan.event.sha256));
        assert.deepEqual(await counts(c), before);
      });
    });

    await t.test('duplicate real approval evidence and stale working program reject without durable writes', async () => {
      const before = await tx(counts);
      await assert.rejects(tx(async c => {
        const record = fixture.definition.record;
        await c.query("INSERT INTO os_events(id,org_id,actor_id,action,record_id,module_id,detail,created_at) VALUES(999,$1,$2,'record.approved',$3,$4,$5,$6)", [org, record.approval.actorId, record.id, record.moduleId, JSON.stringify({ record }), at]);
        return preview(c, await loadLearningInventory(c, org));
      }), error => error.status === 409);
      assert.deepEqual(await tx(counts), before);
      await assert.rejects(tx(async c => {
        await c.query("UPDATE os_records SET data=jsonb_set(data,'{title}','\"Later program\"'::jsonb),revision=revision+1 WHERE org_id=$1 AND id=$2", [org, fixture.programId]);
        return prepare(c, await loadLearningInventory(c, org));
      }), error => error.status === 409);
      assert.deepEqual(await tx(counts), before);
    });

    await t.test('private reader admits only strict actual live report envelope and current full source scope', async () => {
      await tx(c => c.query('INSERT INTO os_reports(org_id,id,created_by,title,checksum,payload) VALUES($1,$2,$3,$4,$5,$6)', [org, plan.report.id, actor, plan.report.title, plan.report.checksum, JSON.stringify(plan.report)]));
      assert.deepEqual(await tx(c => readLearningReport(c, { org, id: plan.report.id, member })), plan.report);
      for (const role of ['board_reader', 'external_reviewer', 'contributor'])
        await assert.rejects(tx(c => readLearningReport(c, { org, id: plan.report.id, member: { ...member, role } })), error => error.status === 403);
      await assert.rejects(tx(c => readLearningReport(c, { org, id: plan.report.id, member: { ...member, programIds: ['other-program'] } })), error => error.status === 404);
      assert.equal((await db.pool.query('SELECT count(*) FROM os_reports')).rows[0].count, '0');
      // A later working approval no longer selects the old point, but does not erase the already frozen report.
      await tx(c => c.query('UPDATE os_records SET approval=NULL WHERE org_id=$1 AND id=$2', [org, fixture.points[0].record.recordId]));
      assert.deepEqual(await tx(c => readLearningReport(c, { org, id: plan.report.id, member })), plan.report);
    });
  } finally {
    if (db) await db.close();
    if (migration) await migration.close();
    await owner.pool.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
    await owner.close();
  }
});
