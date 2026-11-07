import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { getMigrations } from 'better-auth/db/migration';
import { magicLink } from 'better-auth/plugins/magic-link';
import { database, audit, logicalBackupBytes } from '../lib/database.mjs';
import { applicationGrantsSql } from '../lib/migration-grants.mjs';
import { createHandler } from '../lib/handler.mjs';
import { getModule, validateRecord } from '../lib/modules.mjs';
import { participationTerms } from '../lib/participation.mjs';
import { insertLearningHistory } from '../lib/learning-history.mjs';
import { learningMappedFixture } from '../test/learning-fixtures.mjs';
import { hash } from '../lib/security.mjs';

const configured = !!(process.env.DATABASE_URL && process.env.OS_DATABASE_URL);
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const direct = value => { const u = new URL(value); u.hostname = u.hostname.replace(/-pooler(?=\.)/, ''); return u.toString(); };
const org = 'fictional-read-only', smallOrg = 'fictional-read-only-small', user = 'writer-one';
const at = '2026-10-27T00:00:00.000Z';
const session = { user: { id: user, email: 'reader@example.invalid', emailVerified: true }, session: { id: 'fictional-read-only-session' } };
const settings = { origin: 'https://os.example.invalid', secret: 'fictional-read-only-secret-at-least-thirty-two-characters', production: false };

test('actual constrained PostgreSQL read-only routes survive a retained safety-reserve state and cannot write', {
  skip: configured ? false : 'Private owner/constrained URLs required for an isolated schema.', timeout: 300000,
}, async t => {
  const schema = 'os_read_only_' + randomBytes(8).toString('hex'), owner = database(direct(process.env.DATABASE_URL));
  let migration, db;
  const read = fn => db.tx(user, org, fn, { lock: true, readOnly: true });
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
    assert.deepEqual((await db.pool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0], { rolsuper: false, rolbypassrls: false });
    const fixture = learningMappedFixture({ orgId: org, actorId: user });
    const ordinary = (moduleId, id, data, records = []) => {
      const status = getModule(moduleId).workflow.initial;
      return { id, orgId: org, moduleId, data: validateRecord(moduleId, data, { orgId: org, recordId: id, status, records }), status, ownerId: user, lastEditedBy: user, revision: 1, approval: null, snapshot: null };
    };
    const event = ordinary('events', 'read-event', { title: 'Fictional whole occurrence', kind: 'session', startAt: '2099-01-02T09:00:00+00:00', endAt: '2099-01-02T11:00:00+00:00', timeZone: 'UTC', capacity: 2, participationPurpose: 'Arrange this fictional activity.', participantInstructions: 'Read the fictional instructions.', organizerEmail: 'organizer@example.invalid' });
    const contact = ordinary('contacts', 'read-contact', { title: 'Fictional contact', kind: 'person-reference' });
    const booking = ordinary('events', 'read-booking', { title: 'Fictional request', kind: 'registration', eventId: event.id, contactId: contact.id }, [event, contact]);
    const document = ordinary('documents', 'read-document', { title: 'Fictional public form', kind: 'document' });
    const resource = ordinary('resources', 'read-resource', { title: 'Fictional Resource', kind: 'tool' });
    const terms = participationTerms(event);
    // This owner-only setup models a permitted post-safety-reserve state. It is
    // not a successful ordinary application mutation or a production participant.
    const c = await migration.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.org_id',$1,true),set_config('app.user_id',$2,true)", [org, user]);
      await c.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,\'Fictional reader\',$2,true,now(),now())', [user, session.user.email]);
      await c.query('INSERT INTO "session"(id,"userId",token,"expiresAt","createdAt","updatedAt") VALUES($1,$2,\'fictional-read-only-token\',now()+interval \'1 hour\',now(),now())', [session.session.id, user]);
      for (const id of [org, smallOrg]) await c.query("INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional read-only workspace',$1,'USD','UTC')", [id]);
      await c.query("INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'owner')", [org, user]);
      for (const record of [...fixture.records, event, contact, booking, document, resource]) await c.query('INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision,approval,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [org, record.id, record.moduleId, JSON.stringify(record.data), record.status, record.ownerId, record.lastEditedBy, record.revision, record.approval ? JSON.stringify(record.approval) : null, record.snapshot ? JSON.stringify(record.snapshot) : null]);
      await insertLearningHistory(c, org, 'source', fixture.source);
      await insertLearningHistory(c, org, 'event', fixture.root, { receipt: {
        version: 1, operation: 'map', commandHash: '1'.repeat(64), requestHash: '2'.repeat(64),
        actorBindingHash: '3'.repeat(64), actorId: user, sessionSha256: '4'.repeat(64), membershipSha256: '5'.repeat(64),
        memberCreatedAtExact: '2026-10-27T00:00:00.000000Z', restoreEpochSha256: '6'.repeat(64),
        previewId: 'fictional-read-only-preview', reviewSha256: '7'.repeat(64), acceptedAt: at,
        result: { outcome: 'mapped', head: fixture.head, records: fixture.root.payload.records, report: null },
      } });
      const form = { title: 'Fictional request', purpose: 'Review this fictional request.', retentionUntil: '2099-01-01', questions: [{ key: 'email', type: 'text', label: 'Email', required: true }] };
      await c.query("INSERT INTO os_publications(org_id,id,record_id,source_revision,kind,schema,created_by) VALUES($1,'read-publication',$2,1,'contact',$3,$4)", [org, document.id, JSON.stringify(form), user]);
      await c.query("INSERT INTO os_intake(org_id,id,publication_id,answers,consent_at,status) VALUES($1,'read-intake','read-publication',$2,now(),'pending')", [org, JSON.stringify({ email: session.user.email })]);
      await c.query("INSERT INTO os_participant_links(id,org_id,intake_id,publication_id,user_id) VALUES($1,$2,'read-intake','read-publication',$3)", ['a'.repeat(32), org, user]);
      await c.query("INSERT INTO os_participation_targets(org_id,target_id,module_id,source_revision,terms,terms_hash,created_by) VALUES($1,$2,'events',1,$3,$4,$5)", [org, event.id, JSON.stringify(terms), hash(terms), user]);
      await c.query("INSERT INTO os_participations(org_id,id,target_id,module_id,booking_record_id,contact_id,intake_id,source,created_by) VALUES($1,'read-participation',$2,'events',$3,$4,'read-intake','intake',$5)", [org, event.id, booking.id, contact.id, user]);
      // PostgreSQL constructs the padding; no 60MiB JS string or wire body is allocated.
      await c.query("INSERT INTO os_events(org_id,actor_id,action,detail) VALUES($1,$2,'fictional.safety-reserve-state',jsonb_build_object('padding',repeat('x',60*1024*1024+4096)))", [org, user]);
      await c.query('COMMIT');
    } catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); }
    const usage = await read(c => logicalBackupBytes(c, org));
    assert.ok(usage > 60 * 1024 * 1024 && usage < 61 * 1024 * 1024);
    const handle = createHandler({ settings, db, auth: { api: { getSession: async () => session } }, send: async () => { throw new Error('No provider action permitted'); } });
    const call = async path => {
      const response = await handle(new Request(settings.origin + path, { headers: { 'x-forwarded-for': '192.0.2.91' } }));
      const value = await response.json();
      assert.equal(response.status, 200, `${path}: ${value.code || ''} ${value.message || ''}`);
      return value;
    };
    await t.test('PostgreSQL enforces read-only mode while retaining tenant configuration and advisory lock', async () => {
      const value = await read(async c => (await c.query("SELECT current_setting('transaction_read_only') AS mode,current_setting('app.org_id') AS org")).rows[0]);
      assert.deepEqual(value, { mode: 'on', org });
    });
    await t.test('actual participant list, own request, participation and delivery GETs remain readable', async () => {
      assert.equal((await call('/api/participant/requests')).requests[0].id, 'read-intake');
      assert.equal((await call(`/api/participant/orgs/${org}/requests/read-intake`)).request.id, 'read-intake');
      assert.equal((await call(`/api/participant/orgs/${org}/requests/read-intake/participations`)).participations[0].id, 'read-participation');
      assert.equal((await call(`/api/participant/orgs/${org}/requests/read-intake/participations/read-participation/delivery`)).participationId, 'read-participation');
    });
    await t.test('actual staff intake, occurrence, delivery, Learning and Resource GETs omit write-only row locks', async () => {
      await call(`/api/orgs/${org}/dashboard`);
      assert.equal((await call(`/api/orgs/${org}/intake/submissions/read-intake`)).submission.id, 'read-intake');
      await call(`/api/orgs/${org}/participation-targets/${event.id}`);
      await call(`/api/orgs/${org}/participation-delivery`);
      assert.equal((await call(`/api/orgs/${org}/learning/bindings`)).bindings[0].bindingId, fixture.bindingId);
      assert.equal((await call(`/api/orgs/${org}/directory-resources/records/${resource.id}`)).disposition.record.id, resource.id);
    });
    await t.test('ordinary locked writes still hit the complete final gate and roll back', async () => {
      const before = await read(async c => (await c.query('SELECT name FROM os_orgs WHERE id=$1', [org])).rows[0].name);
      await assert.rejects(db.tx(user, org, c => c.query("UPDATE os_orgs SET name='Must roll back' WHERE id=$1", [org]), { lock: true }), error => error.code === 'quota');
      assert.equal(await read(async c => (await c.query('SELECT name FROM os_orgs WHERE id=$1', [org])).rows[0].name), before);
    });
    await t.test('erroneous read-only data and audit writes fail in PostgreSQL and leave no rows', async () => {
      await assert.rejects(read(c => c.query("UPDATE os_orgs SET name='Forbidden read write' WHERE id=$1", [org])), error => error.code === '25006');
      await assert.rejects(db.tx(user, smallOrg, c => audit(c, smallOrg, user, 'record.created'), { lock: true, readOnly: true }), error => error.code === '25006');
      const count = await db.tx(user, smallOrg, async c => (await c.query('SELECT count(*) AS count FROM os_events WHERE org_id=$1', [smallOrg])).rows[0].count, { readOnly: true });
      assert.equal(count, '0');
      assert.equal(await db.tx(user, smallOrg, async c => (await c.query("SELECT current_setting('transaction_read_only') AS mode")).rows[0].mode), 'off');
      assert.equal(await read(c => logicalBackupBytes(c, org)), usage);
    });
  } finally {
    if (db) await db.close(); if (migration) await migration.close();
    await owner.pool.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`); await owner.close();
  }
});
