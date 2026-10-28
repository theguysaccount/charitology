import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { getMigrations } from 'better-auth/db/migration';
import { magicLink } from 'better-auth/plugins/magic-link';
import { database } from '../lib/database.mjs';
import { authentication } from '../lib/auth.mjs';
import { applicationGrantsSql } from '../lib/migration-grants.mjs';
import { createHandler } from '../lib/handler.mjs';
import { hash } from '../lib/security.mjs';
import { learningHash } from '../lib/learning-json.mjs';
import { validateRecord } from '../lib/modules.mjs';
import { insertLearningHistory } from '../lib/learning-history.mjs';
import { buildLearningFixture, appendLearningTestMeasurement } from '../test/learning-fixtures.mjs';

const configured = !!(process.env.DATABASE_URL && process.env.OS_DATABASE_URL);
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const direct = value => { const url = new URL(value); url.hostname = url.hostname.replace(/-pooler(?=\.)/, ''); return url.toString(); };
const at = '2026-10-27T00:00:00.000Z';

test('actual authenticated handler learning dispatch, generic guards and single-copy inactive full restore', {
  skip: configured ? false : 'Private owner/constrained URLs required for an isolated schema.', timeout: 600000,
}, async t => {
  const schema = 'os_learning_handler_' + randomBytes(8).toString('hex'), owner = database(direct(process.env.DATABASE_URL));
  let migration, db, handle, actor, lastOrgLock;
  const settings = { origin: 'http://localhost:4387', secret: 'fictional-learning-handler-secret-at-least-thirty-two-characters', encryptionKey: 'fictional-learning-handler-encryption-key', production: false };
  const sent = [], source = 'fictional-handler-source', target = 'fictional-handler-target', occupied = 'fictional-handler-occupied', malformed = 'fictional-handler-malformed', policyOnly = 'fictional-handler-policy-only', connectionOnly = 'fictional-handler-connection-only';
  const send = async message => { assert.ok(message.to.endsWith('@example.invalid')); sent.push(message); return { accepted: true }; };
  const tx = (fn, org = source) => db.tx(actor.id, org, fn, { lock: true });
  // Corrupt-family evidence is seeded only by the owner in this isolated schema; application transactions refuse it.
  const corruptFixtureTx = async (fn, org) => {
    const c = await migration.pool.connect();
    try { await c.query('BEGIN'); await c.query("SELECT set_config('app.org_id',$1,true),set_config('app.user_id',$2,true)", [org, actor.id]);
      const result = await fn(c); await c.query('COMMIT'); return result;
    } catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); }
  };
  async function call(path, { method = 'GET', body, raw, expect = 200, csrf = true } = {}) {
    const headers = new Headers(); headers.set('x-forwarded-for', '192.0.2.88');
    if (actor?.cookie) headers.set('cookie', actor.cookie);
    if (method !== 'GET') { headers.set('origin', settings.origin); if (csrf && actor?.csrf) headers.set('x-csrf-token', actor.csrf); if (!(body instanceof FormData)) headers.set('content-type', 'application/json'); }
    const response = await handle(new Request(settings.origin + path, { method, headers,
      ...(method !== 'GET' ? { body: raw ?? (body instanceof FormData ? body : JSON.stringify(body ?? {})) } : {}) }));
    const value = (response.headers.get('content-type') ?? '').includes('json') ? await response.json() : await response.text();
    if (expect !== null) assert.equal(response.status, expect, `${method} ${path}: ${value?.code ?? ''} ${value?.message ?? ''}`);
    return { response, value };
  }
  const route = (org, tail) => `/api/orgs/${org}/${tail}`;
  const recordRoute = (org, module, id) => route(org, `modules/${module}/records/${id}`);
  const rechecksum = value => { const { checksum, ...payload } = value; return { ...payload, checksum: hash(payload) }; };
  function receipt(event) {
    const payload = event.payload, frozen = payload.kind === 'report-frozen';
    return { version: 1, operation: { mapped: 'map', measured: 'measure', corrected: 'correct', decided: 'decide', 'report-frozen': 'freeze' }[payload.kind],
      commandHash: learningHash('command', { event: event.sha256 }), requestHash: learningHash('request', { event: event.sha256 }),
      actorBindingHash: 'a'.repeat(64), actorId: event.actorId, sessionSha256: 'b'.repeat(64), membershipSha256: 'c'.repeat(64),
      memberCreatedAtExact: '2026-10-27T00:00:00.000000Z', restoreEpochSha256: 'd'.repeat(64),
      previewId: 'fictional-private-retry-' + event.sequence, reviewSha256: 'e'.repeat(64), acceptedAt: at,
      result: { outcome: frozen ? 'frozen' : payload.kind, head: { originOrgId: event.originOrgId, bindingId: event.bindingId, sequence: event.sequence, eventSha256: event.sha256 },
        records: payload.records ?? [payload.record ?? payload.frozenManifest], report: frozen ? { id: payload.reportId, checksum: payload.reportChecksum } : null } };
  }
  try {
    await owner.pool.query(`CREATE SCHEMA ${quote(schema)}`);
    migration = database(direct(process.env.DATABASE_URL), { schema });
    assert.equal((await migration.pool.query('SELECT current_schema() AS name')).rows[0].name, schema);
    const migrations = await getMigrations({ database: migration.pool, rateLimit: { enabled: true, storage: 'database' }, plugins: [magicLink({ storeToken: 'hashed', sendMagicLink: async () => {} })], logger: { disabled: true } });
    assert.doesNotMatch(await migrations.compileMigrations(), /(?:"public"\s*\.|\bpublic\s*\.)/i);
    await migrations.runMigrations(); await migration.migrate();
    const role = decodeURIComponent(new URL(process.env.OS_DATABASE_URL).username);
    assert.notEqual(role, decodeURIComponent(new URL(process.env.DATABASE_URL).username));
    await migration.pool.query(applicationGrantsSql(role, schema));
    db = database(direct(process.env.OS_DATABASE_URL), { schema });
    const originalTx = db.tx;
    db.tx = (user, org, fn, options) => { if (org) lastOrgLock = options?.lock; return originalTx(user, org, fn, options); };
    handle = createHandler({ settings, db, auth: authentication({ settings, db, send }), send });
    const address = 'learning-handler-' + schema + '@example.invalid';
    await call('/api/auth/request-link', { method: 'POST', body: { email: address } });
    const token = new URL(sent.at(-1).url).searchParams.get('token');
    const signed = await handle(new Request(settings.origin + '/auth/confirm', { method: 'POST', headers: { origin: 'null', 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '192.0.2.88' }, body: new URLSearchParams({ token }).toString() }));
    assert.ok([302, 303].includes(signed.status));
    actor = { cookie: signed.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
    const session = (await call('/api/session')).value; Object.assign(actor, { id: session.user.id, csrf: session.csrfToken });
    for (const org of [source, target, occupied, malformed, policyOnly, connectionOnly]) await tx(async c => {
      await c.query("INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional learning handler',$1,'USD','UTC')", [org]);
      await c.query("INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'owner')", [org, actor.id]);
    }, org);
    const fixture = buildLearningFixture({ orgId: source, actorId: actor.id });
    const fileBytes = Buffer.from('Fictional local backup checksum regression.');
    await tx(async c => {
      for (const record of fixture.records) {
        await c.query('INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision,approval,snapshot,source,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,$11,$11)', [source, record.id, record.moduleId, JSON.stringify(record.data), record.status, record.ownerId, record.lastEditedBy, record.revision, JSON.stringify(record.approval), JSON.stringify(record.snapshot), at]);
        const evidence = fixture.approvedEvidence.find(item => item.pin.recordId === record.id);
        await c.query("INSERT INTO os_events(id,org_id,actor_id,action,record_id,module_id,detail,created_at) VALUES($1,$2,$3,'record.approved',$4,$5,$6,$7)", [evidence.approvalEvent.id, source, record.approval.actorId, record.id, record.moduleId, JSON.stringify({ record }), at]);
      }
      for (const value of fixture.sources) await insertLearningHistory(c, source, 'source', value);
      for (const value of fixture.approvedEvidence) await insertLearningHistory(c, source, 'evidence', value);
      for (const event of fixture.events) await insertLearningHistory(c, source, 'event', event, { receipt: receipt(event) });
      await c.query('INSERT INTO os_reports(org_id,id,created_by,title,checksum,payload) VALUES($1,$2,$3,$4,$5,$6)', [source, fixture.report.id, actor.id, fixture.report.title, fixture.report.checksum, JSON.stringify(fixture.report)]);
      const current = fixture.manifestProof.record, next = { ...current, status: 'frozen', revision: 2, approval: { ...current.approval, revision: 2 }, snapshot: { ...current.snapshot, status: 'frozen', revision: 2 } };
      await c.query('UPDATE os_records SET status=$3,revision=$4,approval=$5,snapshot=$6 WHERE org_id=$1 AND id=$2', [source, next.id, next.status, next.revision, JSON.stringify(next.approval), JSON.stringify(next.snapshot)]);
      const document = validateRecord('documents', { title: 'Fictional backup attachment', kind: 'document' }, { records: [], orgId: source, recordId: 'fictional-document', status: 'draft' });
      await c.query("INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision) VALUES($1,'fictional-document','documents',$2,'draft',$3,$3,1)", [source, JSON.stringify(document), actor.id]);
      await c.query("INSERT INTO os_files(org_id,id,record_id,name,mime,checksum,size,bytes,created_by) VALUES($1,'fictional-file','fictional-document','fictional.txt','text/plain',$2,$3,$4,$5)", [source, hash(fileBytes), fileBytes.length, fileBytes, actor.id]);
    });
    await migration.pool.query("SELECT setval(pg_get_serial_sequence('os_events','id'),1000,true)");

    await t.test('learning parser dispatch precedes generic JSON and retains ordinary auth and CSRF gates', async () => {
      await call(route(source, 'learning/reports/prepare'), { method: 'POST', raw: '{"selection":null,"selection":null}', expect: 422 });
      const form = new FormData(); form.set('metadata', '{}'); form.set('native', new Blob(['{}'], { type: 'application/json' }), 'fictional.json');
      await call(route(source, 'learning/source/inspect'), { method: 'POST', body: form, expect: 422 });
      await call(route(source, 'learning/reports/prepare'), { method: 'POST', body: {}, csrf: false, expect: 403 });
    });

    await t.test('generic readers discriminate learning and malformed families before legacy modules', async () => {
      await call(route(source, 'reports'), { method: 'POST', body: { title: 'Fictional ordinary snapshot', moduleIds: ['programs'] } });
      const listing = (await call(route(source, 'reports'))).value.reports;
      assert.equal(listing.length, 1); assert.notEqual(listing[0].id, fixture.report.id);
      assert.deepEqual((await call(route(source, 'reports/' + fixture.report.id))).value.report, fixture.report);
      for (const [id, payload] of [['unknown-family', { methodVersion: 'learning-future-v99' }], ['malformed-legacy', { modules: null }]])
        await corruptFixtureTx(c => c.query('INSERT INTO os_reports(org_id,id,created_by,title,checksum,payload) VALUES($1,$2,$3,$2,$4,$5)', [malformed, id, actor.id, 'a'.repeat(64), JSON.stringify(payload)]), malformed);
      assert.deepEqual((await call(route(malformed, 'reports'))).value.reports, []);
      await call(route(malformed, 'reports/unknown-family'), { expect: 422 });
      await call(route(malformed, 'reports/malformed-legacy'), { expect: 404 });
      await call(route(source, 'reports'), { method: 'POST', body: { title: 'Unsupported method', moduleIds: ['programs'], methodVersion: 'learning-review-v1' }, expect: 422 });
    });

    await t.test('generic writes cannot paste capabilities, change compiler data or use service-only freeze', async () => {
      await tx(c => c.query("INSERT INTO os_members(org_id,user_id,role) VALUES($1,'writer-one','contributor')", [source]));
      await call(recordRoute(source, 'outcomes', fixture.definition.record.id), { method: 'PATCH', body: { revision: 1, ownerId: actor.id, data: { ...fixture.definition.record.data, title: 'Changed generated data' }, learningCapability: { operation: 'restore' } }, expect: 409 });
      await call(recordRoute(source, 'outcomes', fixture.definition.record.id) + '/files', { method: 'POST', body: {}, expect: 409 });
      await call(recordRoute(source, 'reporting', 'manifest-one'), { method: 'PATCH', body: { revision: 2, ownerId: actor.id, data: { ...fixture.manifest, assemblyMethod: null, sourceDigest: null } }, expect: 409 });
      const correction = appendLearningTestMeasurement(fixture, 2, { recordId: 'pending-correction', approved: false, correction: fixture.points[0].proof.evidence.pin });
      await tx(async c => {
        await c.query("INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision) VALUES($1,$2,'outcomes',$3,'draft',$4,$4,1)", [source, correction.record.recordId, JSON.stringify(correction.data), actor.id]);
        await insertLearningHistory(c, source, 'event', correction.event, { receipt: receipt(correction.event) });
      });
      await call(recordRoute(source, 'outcomes', correction.record.recordId), { method: 'DELETE', body: { revision: 1 }, expect: 409 });
      assert.equal((await tx(c => c.query('SELECT deleted_at FROM os_records WHERE org_id=$1 AND id=$2', [source, correction.record.recordId]))).rows[0].deleted_at, null);
    });

    let backup;
    await t.test('actual HTTP backup has one learning inventory and no durable command authority', async () => {
      backup = (await call(route(source, 'export'))).value;
      assert.equal(lastOrgLock, true, 'Export takes the tenant lock before reading its inventory and appending its optional audit.');
      assert.equal(backup.learningBridge.reports.length, 1);
      assert.ok(backup.reports.every(row => row.payload.kind !== 'learning-review' && !row.payload.methodVersion?.startsWith('learning-')));
      assert.ok(!JSON.stringify(backup.learningBridge).includes('fictional-private-retry-'));
      assert.deepEqual(Object.keys(backup.learningBridge).sort(), ['approvedEvidence', 'events', 'format', 'method', 'reports', 'sources', 'version']);
    });

    await t.test('full HTTP restore resets authority and derives an omitted optional file checksum', async () => {
      const input = rechecksum({ ...backup, files: backup.files.map(({ checksum, ...file }) => file) });
      const preview = (await call(route(target, 'import/preview'), { method: 'POST', body: { backup: input } })).value;
      assert.equal(preview.summary.rejected, 0); assert.equal(preview.summary.learningReportsRecovered, 1);
      await call(route(target, 'import/commit'), { method: 'POST', body: { previewId: preview.previewId } });
      const rows = (await tx(c => c.query('SELECT origin_mode,receipt FROM os_learning_history'), target)).rows;
      assert.equal(rows.length, backup.learningBridge.sources.length + backup.learningBridge.approvedEvidence.length + backup.learningBridge.events.length + 1);
      assert.ok(rows.every(row => row.origin_mode === 'recovered' && row.receipt === null));
      assert.equal((await tx(c => c.query('SELECT count(*) FROM os_reports'), target)).rows[0].count, '0');
      assert.ok((await tx(c => c.query('SELECT approval,snapshot,revision FROM os_records'), target)).rows.every(row => row.approval === null && row.snapshot === null && row.revision === 1));
      const restored = (await call(route(target, 'export'))).value;
      assert.deepEqual(restored.learningBridge, backup.learningBridge);
      assert.equal(restored.files.length, 1); assert.equal(restored.files[0].checksum, hash(fileBytes));
      assert.deepEqual(Buffer.from(restored.files[0].content, 'base64'), fileBytes);
      assert.deepEqual((await call(route(target, 'learning/bindings'))).value.bindings, []);
    });

    await t.test('feature-only occupancy and present-null feature data refuse before acceptance', async () => {
      await tx(c => c.query("INSERT INTO os_learning_previews(org_id,id,actor_id,session_sha256,membership_sha256,restore_epoch_sha256,kind,payload,review_sha256,expires_at) VALUES($1,'fictional-pending',$2,$3,$3,$3,'map','{}',$3,now()+interval '1 minute')", [occupied, actor.id, 'a'.repeat(64)]), occupied);
      const preview = (await call(route(occupied, 'import/preview'), { method: 'POST', body: { backup } })).value;
      assert.equal(preview.summary.rejected, 1);
      await call(route(occupied, 'import/commit'), { method: 'POST', body: { previewId: preview.previewId }, expect: 409 });
      await call(route(occupied, 'import/preview'), { method: 'POST', body: { backup: rechecksum({ ...backup, learningBridge: null }) }, expect: 422 });
      assert.equal((await tx(c => c.query('SELECT count(*) FROM os_records'), occupied)).rows[0].count, '0');
    });
    await t.test('delivery-policy-only and connection-only targets block full restore at preview and commit', async () => {
      await tx(c => c.query("INSERT INTO os_participation_delivery_policies(org_id,enabled,epoch,template_version) VALUES($1,false,$2,'participation-notice-v1')", [policyOnly, 'e'.repeat(32)]), policyOnly);
      await tx(c => c.query("INSERT INTO os_integrations(org_id,id,provider,name,config) VALUES($1,'fictional-csv','csv','Fictional CSV',$2)", [connectionOnly, JSON.stringify({ moduleId: 'contacts', fieldMap: {} })]), connectionOnly);
      for (const org of [policyOnly, connectionOnly]) {
        const preview = (await call(route(org, 'import/preview'), { method: 'POST', body: { backup } })).value;
        assert.equal(preview.summary.rejected, 1);
        await call(route(org, 'import/commit'), { method: 'POST', body: { previewId: preview.previewId }, expect: 409 });
        assert.equal((await tx(c => c.query('SELECT count(*) FROM os_records'), org)).rows[0].count, '0');
      }
    });

    await t.test('frozen manifest trash cannot reset the service-owned edition via ordinary restore', async () => {
      await call(recordRoute(source, 'reporting', 'manifest-one'), { method: 'DELETE', body: { revision: 2 } });
      await call(recordRoute(source, 'reporting', 'manifest-one') + '/restore', { method: 'POST', body: { revision: 3 }, expect: 409 });
      assert.deepEqual((await call(route(source, 'reports/' + fixture.report.id))).value.report, fixture.report);
    });
  } finally {
    if (db) await db.close(); if (migration) await migration.close();
    await owner.pool.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`); await owner.close();
  }
});
