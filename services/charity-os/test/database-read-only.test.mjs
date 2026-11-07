import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { database } from '../lib/database.mjs';
import { currentLearningMember } from '../lib/learning-access.mjs';

async function withClient(run) {
  const calls = [], client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('AS present')) throw new Error('complete mutation gate reached');
      return { rows: [] };
    },
    release() { calls.push({ sql: 'RELEASE' }); },
  };
  const Original = pg.Pool;
  pg.Pool = class { async connect() { return client; } async end() {} };
  try { await run(database('postgres://fictional.invalid/read-only'), calls, client); }
  finally { pg.Pool = Original; }
}

test('enforced read-only transaction mode is set immediately after BEGIN and retains the organization lock', async () => {
  await withClient(async (db, calls) => {
    const result = await db.tx('reader', 'org', async c => {
      await c.query('SELECT current_setting(\'transaction_read_only\')');
      return 'retained read';
    }, { lock: true, readOnly: true });
    assert.equal(result, 'retained read');
    assert.deepEqual(calls.slice(0, 2).map(x => x.sql), ['BEGIN', 'SET TRANSACTION READ ONLY']);
    assert.match(calls[2].sql, /set_config/);
    assert.match(calls[3].sql, /pg_advisory_xact_lock/);
    assert.deepEqual(calls.slice(-2).map(x => x.sql), ['COMMIT', 'RELEASE']);
    assert.equal(calls.some(x => x.sql.includes('AS present')), false);
  });
});

test('the ordinary locked transaction still reaches the final complete mutation gate', async () => {
  await withClient(async (db, calls) => {
    await assert.rejects(db.tx('writer', 'org', c => c.query('SELECT 1'), { lock: true }), /complete mutation gate reached/);
    assert.equal(calls.some(x => x.sql === 'SET TRANSACTION READ ONLY'), false);
    assert.deepEqual(calls.slice(-2).map(x => x.sql), ['ROLLBACK', 'RELEASE']);
  });
});

test('a failed read callback rolls back and cannot leave read-only state on a reused pool client', async () => {
  await withClient(async (db, calls) => {
    await assert.rejects(db.tx('reader', 'org', () => { throw new Error('read failed'); }, { readOnly: true }), /read failed/);
    const next = calls.length;
    assert.equal(await db.tx('reader', null, () => 'next transaction'), 'next transaction');
    assert.deepEqual(calls.slice(next).map(x => x.sql), ['BEGIN', "SELECT set_config('app.org_id',$1,true),set_config('app.user_id',$2,true)", 'COMMIT', 'RELEASE']);
  });
});

test('Learning session checks omit the row lock only for the trusted read-only route option', async () => {
  const calls = [], c = { async query(sql) {
    calls.push(sql);
    return sql.includes('FROM "session"') ? { rowCount: 1, rows: [] } : { rows: [{
      user_id: 'reader', role: 'owner', program_ids: [], revision: 1,
      created_exact: '2026-10-27T00:00:00.000000Z',
    }] };
  } };
  const session = { user: { id: 'reader' }, session: { id: 'fictional-session' } };
  await currentLearningMember(c, 'org', session, { readOnly: true });
  assert.doesNotMatch(calls[0], /FOR SHARE/);
  calls.length = 0;
  await currentLearningMember(c, 'org', session);
  assert.match(calls[0], /FOR SHARE OF s$/);
});
