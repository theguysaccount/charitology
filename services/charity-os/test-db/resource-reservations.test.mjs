import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {database} from '../lib/database.mjs';
import {applicationGrantsSql} from '../lib/migration-grants.mjs';
import {runResourceReservationStoreCases} from './fixtures/resource-reservation-store-cases.mjs';
import {runResourceReservationCapacityCases} from './fixtures/resource-reservation-capacity-cases.mjs';

function ciUrl(raw, role) {
  try {
    const u = new URL(raw);
    return u.protocol === 'postgresql:' && u.hostname === '127.0.0.1' &&
      u.port === '5432' && u.pathname === '/charitology_os_ci' &&
      u.username === role && u.password && !u.search && !u.hash ? u.href : null;
  } catch { return null; }
}
const ownerUrl = ciUrl(process.env.DATABASE_URL, 'os_test_owner');
const runtimeUrl = ciUrl(process.env.OS_DATABASE_URL, 'os_test_app');
const qualified = process.env.GITHUB_ACTIONS === 'true' && process.env.NODE_ENV === 'test' && ownerUrl && runtimeUrl;

test('room and equipment reservation PostgreSQL storage, recovery and shared capacity', {
  skip: qualified ? false : 'Requires the disposable GitHub PostgreSQL service and its separate app role.',
  timeout: 180_000,
}, async t => {
  const schema = 'os_resource_ci_' + randomBytes(8).toString('hex');
  const root = database(ownerUrl), migration = database(ownerUrl, {schema}), db = database(runtimeUrl, {schema});
  let created = false, owner, runtime, competitor;
  try {
    const identity = (await root.pool.query("SELECT current_database() AS name,inet_server_port() AS port,current_user AS role")).rows[0];
    assert.deepEqual(identity, {name:'charitology_os_ci',port:5432,role:'os_test_owner'});
    await root.pool.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await migration.migrate();
    owner = await migration.pool.connect();
    await owner.query(applicationGrantsSql('os_test_app', schema));
    runtime = await db.pool.connect();
    competitor = await db.pool.connect();
    for (const c of [owner,runtime,competitor]) {
      await c.query("SET TIME ZONE 'UTC'; SET DateStyle='ISO, MDY'");
      assert.equal((await c.query("SELECT current_schema() AS name")).rows[0].name,schema);
    }
    await t.test('stored command identity, immutable receipts, isolation and atomic overlap guard', async () => {
      const proof = await runResourceReservationStoreCases({owner,runtime,competitor,schema,role:'os_test_app'});
      assert.equal(proof.cases.length,10);
      t.diagnostic(JSON.stringify({storageCases:proof.cases.length,final:proof.final}));
    });
    await t.test('whole-workspace growth, native closure and pre-funded Release', async () => {
      const proof = await runResourceReservationCapacityCases({owner,runtime});
      assert.equal(proof.count,6);
      t.diagnostic(JSON.stringify({capacityCases:proof.count}));
    });
  } finally {
    for (const c of [competitor,runtime,owner]) if (c) c.release();
    try { await Promise.all([db.pool.end(),migration.pool.end()]); }
    finally {
      try { if (created) await root.pool.query(`DROP SCHEMA "${schema}" CASCADE`); }
      finally { await root.pool.end(); }
    }
  }
});
