import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { database } from '../lib/database.mjs';
import { applicationGrantsSql } from '../lib/migration-grants.mjs';
import { createHandler } from '../lib/handler.mjs';
import { MODULE_MAP, validateRecord } from '../lib/modules.mjs';
import { api, ApiError } from '../public/api.js';
import { can } from '../public/model.js';
import { learningRecordFragment, resolveLearningRecordRoute } from '../public/learning-model.js';

const configured = Boolean(process.env.DATABASE_URL && process.env.OS_DATABASE_URL);
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const direct = value => { const url = new URL(value); url.hostname = url.hostname.replace(/-pooler(?=\.)/, ''); return url.toString(); };
const origin = 'https://os.example.invalid', user = 'fictional-route-reader', other = 'fictional-route-other';
const orgA = 'fictional-route-A', orgB = 'fictional-route-B', recordId = 'same-restored-record';
const settings = { origin, secret: 'fictional-record-route-secret-at-least-thirty-two-characters', production: false };
const sessionFor = id => ({ user: { id, name: 'Fictional route reader', email: `${id}@example.invalid`, emailVerified: true }, session: { id: 'fictional-route-session-' + id } });

test('actual constrained handler, browser API and Learning record resolver use fresh RLS session memberships and exact tenant records', {
  skip: configured ? false : 'Private owner/constrained URLs required for an isolated schema.', timeout: 180000,
}, async t => {
  const schema = 'os_learning_record_route_' + randomBytes(8).toString('hex');
  const owner = database(direct(process.env.DATABASE_URL)), previousFetch = globalThis.fetch;
  let migration, db, activeSession = sessionFor(user);
  const requests = [], transactions = [];
  const read = (fn, org = orgA) => db.tx(user, org, fn, { readOnly: true });
  const fixture = async fn => {
    const c = await migration.pool.connect();
    try { await c.query('BEGIN'); const result = await fn(c); await c.query('COMMIT'); return result; }
    catch (error) { await c.query('ROLLBACK'); throw error; }
    finally { c.release(); }
  };
  const canRead = (moduleId, role) => can(MODULE_MAP[moduleId], 'read', role);
  const resolve = (org, id = recordId) => resolveLearningRecordRoute({ fragment: learningRecordFragment(org, 'outcomes', id), api,
    isCurrent: () => true, canRead, signal: new AbortController().signal });
  const open = async (org, id = recordId) => {
    const resolved = await resolve(org, id);
    const result = await api.record(resolved.target.orgId, resolved.target.moduleId, resolved.target.recordId);
    return { resolved, record: result.record };
  };
  // Only the two fictional memberships are changed by explicit fixture steps.
  // Every real GET must leave records, audits, rate limits and previews untouched.
  const contentFingerprint = async () => {
    const result = {};
    for (const table of ['os_records', 'os_events', 'os_rate_limits', 'os_previews', 'os_learning_history', 'os_learning_previews'])
      result[table] = (await migration.pool.query(`SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(value ORDER BY value::text),'[]'::jsonb)::text,'UTF8')),'hex') AS hash FROM (SELECT to_jsonb(t) AS value FROM ${quote(table)} t) rows`)).rows[0].hash;
    return result;
  };
  try {
    await owner.pool.query(`CREATE SCHEMA ${quote(schema)}`);
    migration = database(direct(process.env.DATABASE_URL), { schema });
    assert.equal((await migration.pool.query('SELECT current_schema() AS name')).rows[0].name, schema);
    await migration.migrate();
    const role = decodeURIComponent(new URL(process.env.OS_DATABASE_URL).username);
    assert.notEqual(role, decodeURIComponent(new URL(process.env.DATABASE_URL).username));
    await migration.pool.query(applicationGrantsSql(role, schema));
    db = database(direct(process.env.OS_DATABASE_URL), { schema });
    assert.deepEqual((await db.pool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0], { rolsuper: false, rolbypassrls: false });
    await fixture(async c => {
      for (const org of [orgA, orgB]) {
        await c.query("INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,$2,$1,'USD','UTC')", [org, 'Fictional ' + org]);
        await c.query("INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'program_lead')", [org, user]);
        const program = { id: org + '-program', orgId: org, moduleId: 'programs', status: 'draft',
          data: validateRecord('programs', { title: 'Fictional program ' + org, kind: 'program' }, { orgId: org, recordId: org + '-program', status: 'draft', records: [] }) };
        const records = [program, { id: recordId, orgId: org, moduleId: 'outcomes', status: 'draft',
          data: validateRecord('outcomes', { title: org === orgA ? 'A exact private target' : 'B exact private target', kind: 'indicator', programId: program.id }, { orgId: org, recordId, status: 'draft', records: [program] }) }];
        if (org === orgA) records.push({ ...records[1], id: 'A-only-record', data: { ...records[1].data, title: 'A-only private target' } });
        for (const record of records) await c.query('INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision) VALUES($1,$2,$3,$4,$5,$6,$6,1)',
          [org, record.id, record.moduleId, JSON.stringify(record.data), record.status, user]);
      }
      await c.query("INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'program_lead')", [orgA, other]);
    });
    const before = await contentFingerprint();
    const observedDb = { ...db, tx: (actor, org, fn, options) => db.tx(actor, org, async c => {
      const mode = (await c.query("SELECT current_setting('transaction_read_only') AS read_only,current_setting('app.org_id') AS org,current_setting('app.user_id') AS actor")).rows[0];
      transactions.push(mode); return fn(c);
    }, options) };
    const handle = createHandler({ settings, db: observedDb, auth: { api: { getSession: async () => activeSession } },
      send: async () => { throw new Error('No provider action is permitted in this isolated regression.'); } });
    globalThis.fetch = async (url, init = {}) => {
      assert.equal(typeof url, 'string'); assert.ok(url.startsWith('/api/')); assert.equal(init.method, 'GET');
      assert.notEqual(url, '/api/orgs', 'The actual handler has no GET organization-list route.');
      assert.equal(init.credentials, 'same-origin'); assert.equal(init.cache, 'no-store');
      const response = await handle(new Request(origin + url, init));
      assert.match(response.headers.get('cache-control') || '', /no-store/);
      requests.push({ path: url, status: response.status }); return response;
    };

    await t.test('fresh actual session and ordinary record GETs select each exact tenant despite a shared restored ID', async () => {
      for (const [org, title] of [[orgB, 'B exact private target'], [orgA, 'A exact private target']]) {
        const start = requests.length, result = await open(org);
        assert.equal(result.resolved.org.id, org); assert.equal(result.resolved.org.role, 'program_lead');
        assert.deepEqual(result.resolved.session.orgs.map(value => value.id).sort(), [orgA, orgB].sort());
        assert.equal(result.record.orgId, org); assert.equal(result.record.id, recordId); assert.equal(result.record.data.title, title);
        assert.deepEqual(requests.slice(start).map(value => value.path), ['/api/session', `/api/orgs/${org}/modules/outcomes/records/${recordId}`]);
      }
      const details = transactions.filter(value => value.org);
      assert.equal(details.length, 2); assert.ok(details.every(value => value.read_only === 'on' && value.actor === user));
    });
    await t.test('a record absent from the pinned tenant does not fall back to another authorized tenant', async () => {
      const start = requests.length;
      await assert.rejects(open(orgB, 'A-only-record'), error => error instanceof ApiError && error.status === 404 && error.code === 'record');
      assert.deepEqual(requests.slice(start), [{ path: '/api/session', status: 200 }, { path: `/api/orgs/${orgB}/modules/outcomes/records/A-only-record`, status: 404 }]);
    });
    await t.test('current program scope is enforced by the ordinary detail endpoint after fresh membership resolution', async () => {
      await fixture(c => c.query('UPDATE os_members SET program_ids=$3,revision=revision+1 WHERE org_id=$1 AND user_id=$2', [orgB, user, JSON.stringify(['fictional-other-program'])]));
      const resolved = await resolve(orgB); assert.deepEqual(resolved.org.programIds, ['fictional-other-program']);
      await assert.rejects(api.record(orgB, 'outcomes', recordId), error => error instanceof ApiError && error.status === 404 && error.code === 'record');
      assert.equal((await open(orgA)).record.data.title, 'A exact private target');
      await fixture(c => c.query("UPDATE os_members SET program_ids='[]',revision=revision+1 WHERE org_id=$1 AND user_id=$2", [orgB, user]));
    });
    await t.test('revocation between session resolution and record lookup refuses, and the next navigation has no remembered membership fallback', async () => {
      const resolved = await resolve(orgB); assert.equal(resolved.org.id, orgB);
      await fixture(c => c.query('DELETE FROM os_members WHERE org_id=$1 AND user_id=$2', [orgB, user]));
      await assert.rejects(api.record(resolved.target.orgId, resolved.target.moduleId, resolved.target.recordId), error => error instanceof ApiError && error.status === 403 && error.code === 'membership');
      const start = requests.length;
      await assert.rejects(open(orgB), error => error.status === 403);
      assert.deepEqual(requests.slice(start), [{ path: '/api/session', status: 200 }], 'A missing fresh membership refuses before any detail lookup.');
      assert.equal((await open(orgA)).record.orgId, orgA);
    });
    await t.test('a different current account and an unsigned session cannot reuse the earlier two-tenant navigation', async () => {
      activeSession = sessionFor(other); const start = requests.length;
      await assert.rejects(open(orgB), error => error.status === 403);
      assert.deepEqual(requests.slice(start), [{ path: '/api/session', status: 200 }]);
      await assert.rejects(api.record(orgB, 'outcomes', recordId), error => error instanceof ApiError && error.status === 403 && error.code === 'membership');
      assert.equal((await open(orgA)).record.orgId, orgA);
      activeSession = null; const unsigned = requests.length;
      await assert.rejects(open(orgA), error => error.status === 401);
      assert.deepEqual(requests.slice(unsigned), [{ path: '/api/session', status: 200 }]);
    });
    await t.test('all resolver/detail requests remain reads and leave ordinary data, audit, quota and preview state unchanged', async () => {
      assert.deepEqual(await contentFingerprint(), before);
      assert.ok(requests.length > 10); assert.equal(requests.some(value => value.path === '/api/orgs'), false);
      assert.ok(transactions.filter(value => value.org).every(value => value.read_only === 'on'));
      assert.equal(await read(async c => (await c.query('SELECT count(*) AS count FROM os_records')).rows[0].count, orgB), '2', 'Actual tenant RLS still confines direct constrained record reads.');
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (db) await db.close(); if (migration) await migration.close();
    await owner.pool.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`); await owner.close();
  }
});
