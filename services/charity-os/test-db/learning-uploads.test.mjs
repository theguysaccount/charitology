import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { getMigrations } from 'better-auth/db/migration';
import { magicLink } from 'better-auth/plugins/magic-link';
import { database } from '../lib/database.mjs';
import { applicationGrantsSql } from '../lib/migration-grants.mjs';
import { createHandler } from '../lib/handler.mjs';
import { hash, csrf } from '../lib/security.mjs';
import { workingPin } from '../lib/learning-model.mjs';
import { inspectLearningNative, validateLearningSourceCapture } from '../lib/learning-native.mjs';
import { learningMappedFixture } from '../test/learning-fixtures.mjs';
import { inspectLearningSource as clientInspect, setCsrfToken } from '../public/api.js';

const configured = !!(process.env.DATABASE_URL && process.env.OS_DATABASE_URL);
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const direct = value => { const u = new URL(value); u.hostname = u.hostname.replace(/-pooler(?=\.)/, ''); return u.toString(); };
const org = 'fictional-native-upload', user = 'writer-one', other = 'other-writer';
const origin = 'https://os.example.invalid', CHUNK = 1500000;
const settings = { origin, secret: 'fictional-native-transport-secret-at-least-thirty-two-characters', production: false };
const identity = id => ({ user: { id, email: id + '@example.invalid', emailVerified: true }, session: { id: 'fictional-native-session-' + id } });
const metadataFor = program => ({ version: 1, adapter: 'nonprofit-learning-native-v1', selection: { kind: 'learning-row', recordId: 'selected-learning' }, target: { kind: 'new', program: workingPin(program) } });

export function largeNonprofitFixture() {
  const long = '界'.repeat(5000), native = {
    version: 1, program: 'nonprofit-advisory', updated: '2026-10-27T00:00:00.000Z',
    context: { name: 'Fictional organization', activity: '', decision: long, change: '', baseline: '', capacity: '', voice: '', privacy: '', period: '' },
    records: { diagnostics: Array.from({ length: 110 }, (_, i) => ({ id: 'unselected-diagnostic-' + i, values: {
      title: 'Unselected diagnostic ' + i, area: 'Voice and access', current: i ? long : '\0' + long.slice(1), gap: long,
      consequence: long, depth: 'Unclassified', status: 'Draft',
    } })), evidence: [], actions: [], learning: [{ id: 'selected-learning', values: {
      title: 'Fictional selected checkpoint', outcome: 'Fictional access outcome', method: long, rule: long, feedback: long, result: long, date: '', status: 'Draft',
    } }], readiness: [] },
  };
  return Buffer.from(JSON.stringify(native));
}

test('actual constrained handler transports a full large native file without body-limit, scope or backup authority shortcuts', {
  skip: configured ? false : 'Private owner/constrained URLs required for an isolated schema.', timeout: 300000,
}, async t => {
  const bytes = largeNonprofitFixture();
  assert.ok(bytes.length > 4500000 && bytes.length < 8000000);
  const local = inspectLearningNative(bytes, { adapter: 'nonprofit-learning-native-v1', selection: { kind: 'learning-row', recordId: 'selected-learning' } });
  assert.equal(local.originalSha256, hash(bytes));
  const schema = 'os_native_upload_' + randomBytes(8).toString('hex'), owner = database(direct(process.env.DATABASE_URL));
  let migration, db, handle, active = identity(user), loseFirst = false, firstLostId, inspected;
  const originalFetch = globalThis.fetch, requests = [], fixture = learningMappedFixture({ orgId: org, actorId: user });
  const metadata = metadataFor(fixture.program.record), parts = Math.ceil(bytes.length / CHUNK), freshId = () => randomUUID().replaceAll('-', '');
  const tx = fn => db.tx(user, org, fn, { lock: true, readOnly: true });
  const owned = async fn => {
    const c = await migration.pool.connect();
    try { await c.query('BEGIN'); await c.query("SELECT set_config('app.org_id',$1,true),set_config('app.user_id',$2,true)", [org, user]);
      const result = await fn(c); await c.query('COMMIT'); return result;
    } catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); }
  };
  const resetTransient = () => owned(async c => { await c.query('DELETE FROM os_uploads WHERE org_id=$1', [org]); await c.query('DELETE FROM os_learning_previews WHERE org_id=$1', [org]); await c.query('DELETE FROM os_rate_limits'); });
  const raw = async (tail, body, { expect = 200, session = active } = {}) => {
    const text = JSON.stringify(body), request = new Request(origin + `/api/orgs/${org}/${tail}`, { method: 'POST', headers: {
      origin, 'content-type': 'application/json', 'x-csrf-token': csrf(session.session.id, settings.secret), 'x-forwarded-for': '192.0.2.94',
    }, body: text });
    const saved = active; active = session;
    let response; try { response = await handle(request); } finally { active = saved; }
    const value = await response.json();
    assert.equal(response.status, expect, `${tail}: ${value.code || ''} ${value.message || ''}`);
    return value;
  };
  const chunk = (uploadId, index, data = bytes.subarray(index * CHUNK, (index + 1) * CHUNK), total = parts) => raw('learning/source/upload', { uploadId, index, total, chunk: data.toString('base64') });
  const finish = (uploadId, extra = {}, options) => raw('learning/source/inspect', { metadata, upload: { uploadId, byteLength: bytes.length, sha256: hash(bytes), ...extra } }, options);
  const allChunks = async uploadId => { for (let i = 0; i < parts; i++) await chunk(uploadId, i); };
  const count = table => tx(async c => Number((await c.query(`SELECT count(*) AS count FROM ${table} WHERE org_id=$1`, [org])).rows[0].count));
  try {
    await owner.pool.query(`CREATE SCHEMA ${quote(schema)}`);
    migration = database(direct(process.env.DATABASE_URL), { schema });
    assert.equal((await migration.pool.query('SELECT current_schema() AS name')).rows[0].name, schema);
    const migrations = await getMigrations({ database: migration.pool, rateLimit: { enabled: true, storage: 'database' }, plugins: [magicLink({ storeToken: 'hashed', sendMagicLink: async () => {} })], logger: { disabled: true } });
    assert.doesNotMatch(await migrations.compileMigrations(), /(?:"public"\s*\.|\bpublic\s*\.)/i);
    await migrations.runMigrations(); await migration.migrate();
    const role = decodeURIComponent(new URL(process.env.OS_DATABASE_URL).username);
    assert.notEqual(role, decodeURIComponent(new URL(process.env.DATABASE_URL).username));
    await migration.pool.query(applicationGrantsSql(role, schema)); db = database(direct(process.env.OS_DATABASE_URL), { schema });
    assert.deepEqual((await db.pool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0], { rolsuper: false, rolbypassrls: false });
    await owned(async c => {
      await c.query("INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional native transport',$1,'USD','UTC')", [org]);
      for (const id of [user, other]) {
        const s = identity(id);
        await c.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$1,$2,true,now(),now())', [id, s.user.email]);
        await c.query('INSERT INTO "session"(id,"userId",token,"expiresAt","createdAt","updatedAt") VALUES($1,$2,$1,now()+interval \'1 hour\',now(),now())', [s.session.id, id]);
        await c.query("INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'owner')", [org, id]);
      }
      const r = fixture.program.record;
      await c.query('INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision,approval,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [org, r.id, r.moduleId, JSON.stringify(r.data), r.status, r.ownerId, r.lastEditedBy, r.revision, JSON.stringify(r.approval), JSON.stringify(r.snapshot)]);
    });
    handle = createHandler({ settings, db, auth: { api: { getSession: async () => active } }, send: async () => { throw new Error('No provider action permitted'); } });
    globalThis.fetch = async (url, options) => {
      const target = new URL(url, origin), text = options.body;
      requests.push({ path: target.pathname, bytes: Buffer.byteLength(text), body: JSON.parse(text) });
      const response = await handle(new Request(target, { ...options, headers: { ...options.headers, origin, 'x-forwarded-for': '192.0.2.94' } }));
      if (loseFirst && target.pathname.endsWith('/source/upload')) {
        loseFirst = false; firstLostId = JSON.parse(text).uploadId;
        assert.equal(response.status, 200); throw new TypeError('Fictional response lost after commit');
      }
      return response;
    };
    setCsrfToken(csrf(active.session.id, settings.secret));
    await t.test('actual client retries a lost first response with one retained identity, exact bytes and no unselected retention', async () => {
      loseFirst = true;
      await assert.rejects(clientInspect(org, metadata, bytes), error => error.code === 'connection_interrupted');
      assert.match(firstLostId, /^[a-f0-9]{32}$/);
      assert.equal(await count('os_uploads'), 1);
      inspected = await clientInspect(org, metadata, bytes);
      const source = validateLearningSourceCapture(inspected.source);
      assert.equal(source.originalBytes, bytes.length); assert.equal(source.originalSha256, hash(bytes));
      assert.deepEqual(source.selected, local.selected);
      assert.equal(requests.filter(r => r.path.endsWith('/source/upload') && r.body.index === 0).every(r => r.body.uploadId === firstLostId), true);
      assert.ok(requests.every(r => r.bytes < 4500000));
      assert.ok(requests.filter(r => r.path.endsWith('/source/upload')).every(r => r.bytes <= 2008192));
      assert.equal(await count('os_uploads'), 0); assert.equal(await count('os_learning_history'), 0);
      const saved = await tx(async c => (await c.query('SELECT payload FROM os_learning_previews WHERE org_id=$1', [org])).rows[0].payload);
      assert.equal(JSON.stringify(saved).includes('unselected-diagnostic'), false);
      assert.equal(JSON.stringify(saved).includes('diagnostics'), false);
      t.diagnostic(JSON.stringify({ originalNativeBytes: bytes.length, sha256: hash(bytes), uploadRequests: requests.length - 1, largestRequestBytes: Math.max(...requests.map(r => r.bytes)), selectedBytes: Buffer.byteLength(JSON.stringify(source.selected)) }));
    });
    await t.test('actual admitted source can map and its validated context streams in bounded chunks', async () => {
      const mapping = structuredClone(fixture.mapping);
      mapping.basis.intendedOutcome = { disposition: 'adapted', sourceFields: ['np.learning.outcome'], text: 'Fictional access outcome', reason: 'Explicit short authored summary of the retained narrative' };
      mapping.basis.rule.basis = { disposition: 'adapted', sourceFields: ['np.learning.rule'], text: 'Review access', reason: 'Explicit short authored rule' };
      mapping.basis.feedback = { disposition: 'adapted', sourceFields: ['np.learning.feedback'], text: 'Ask about barriers', reason: 'Explicit short authored feedback plan' };
      mapping.indicators[0].origin = { kind: 'learning-checkpoint' };
      const preview = await raw('learning/mapping/preview', { mode: 'new', inspectionId: inspected.inspectionId, program: metadata.target.program, mapping });
      const committed = await raw('learning/commit', { previewId: preview.previewId, reviewSha256: preview.reviewSha256, commandKey: randomUUID() });
      const response = await handle(new Request(origin + `/api/orgs/${org}/learning/bindings/${committed.result.head.bindingId}/context`));
      assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
      const reader = response.body.getReader(), chunks = [];
      while (true) { const next = await reader.read(); if (next.done) break; assert.ok(next.value.byteLength <= 65536); chunks.push(next.value); }
      assert.ok(chunks.length > 1);
      const context = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.equal(context.source.originalSha256, hash(bytes)); assert.deepEqual(context.source.selected, local.selected);
    });
    await t.test('first-part, canonical base64, chunk cap, duplicate bytes and complete ordered assembly are enforced', async () => {
      await resetTransient(); const id = freshId();
      await raw('learning/source/upload', { uploadId: id, index: 1, total: parts, chunk: bytes.subarray(CHUNK, CHUNK * 2).toString('base64') }, { expect: 409 });
      assert.equal(await count('os_uploads'), 0);
      await raw('learning/source/upload', { uploadId: id, index: 0, total: 1, chunk: 'Zh==' }, { expect: 422 });
      await raw('learning/source/upload', { uploadId: id, index: 0, total: 1, chunk: Buffer.alloc(CHUNK + 1).toString('base64') }, { expect: 422 });
      await chunk(id, 0); await chunk(id, 2); await chunk(id, 3);
      await finish(id, {}, { expect: 409 });
      await raw('learning/source/upload', { uploadId: id, index: 0, total: parts, chunk: Buffer.alloc(CHUNK, 'x').toString('base64') }, { expect: 409 });
      await chunk(id, 1);
      await finish(id, { sha256: '0'.repeat(64) }, { expect: 409 });
      await finish(id, { byteLength: bytes.length + 1 }, { expect: 409 });
      await finish(id); assert.equal(await count('os_uploads'), 0);
    });
    await t.test('current actor, session expiry, incarnation and target scope are checked without consuming original chunks', async () => {
      await resetTransient(); const id = freshId(); await allChunks(id);
      await finish(id, {}, { expect: 409, session: identity(other) });
      await owned(c => c.query('UPDATE "session" SET "expiresAt"=now()-interval \'1 second\' WHERE id=$1', [active.session.id]));
      await finish(id, {}, { expect: 401 });
      await owned(c => c.query('UPDATE "session" SET "expiresAt"=now()+interval \'1 hour\' WHERE id=$1', [active.session.id]));
      await owned(c => c.query("UPDATE os_members SET role='program_lead',program_ids='[\"different-program\"]',revision=revision+1 WHERE org_id=$1 AND user_id=$2", [org, user]));
      await finish(id, {}, { expect: 404 });
      await owned(c => c.query("UPDATE os_members SET role='owner',program_ids='[]',revision=revision+1,created_at=created_at+interval '1 microsecond' WHERE org_id=$1 AND user_id=$2", [org, user]));
      await finish(id, {}, { expect: 409 });
      assert.equal(await count('os_uploads'), parts); assert.equal(await count('os_learning_previews'), 0);
    });
    await t.test('backup and source purposes cannot consume each other, and successful source cleanup removes only owned parts', async () => {
      await resetTransient(); const id = freshId(), backupId = freshId();
      await raw('import/upload', { uploadId: backupId, index: 0, total: 1, chunk: Buffer.from('{}').toString('base64') });
      await raw('learning/source/inspect', { metadata, upload: { uploadId: backupId, byteLength: 2, sha256: hash('{}') } }, { expect: 409 });
      await allChunks(id);
      await raw('import/preview', { uploadId: id }, { expect: 409 });
      await finish(id);
      assert.equal(await count('os_uploads'), 1);
      const retained = await tx(async c => (await c.query('SELECT id,actor_id FROM os_uploads WHERE org_id=$1', [org])).rows[0]);
      assert.deepEqual(retained, { id: backupId, actor_id: user });
    });
    await t.test('a failure after inspection and cleanup rolls both back, preserving exact chunks for Retry', async () => {
      await resetTransient(); const id = freshId(); await allChunks(id);
      await migration.pool.query("CREATE FUNCTION fictional_upload_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Fictional deferred inspection failure'; END$$");
      await migration.pool.query('CREATE CONSTRAINT TRIGGER fictional_upload_failure AFTER INSERT ON os_learning_previews DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fictional_upload_failure()');
      await finish(id, {}, { expect: 500 });
      assert.equal(await count('os_uploads'), parts); assert.equal(await count('os_learning_previews'), 0);
      await migration.pool.query('DROP TRIGGER fictional_upload_failure ON os_learning_previews');
      await finish(id); assert.equal(await count('os_uploads'), 0); assert.equal(await count('os_learning_previews'), 1);
    });
  } finally {
    globalThis.fetch = originalFetch; setCsrfToken('');
    if (db) await db.close(); if (migration) await migration.close();
    await owner.pool.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`); await owner.close();
  }
});
