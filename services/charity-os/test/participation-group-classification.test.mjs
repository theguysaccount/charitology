import { legacyVolunteerSubstitutions } from './fixtures/volunteer-substitution-legacy.mjs';
import { reservationSchemaSql, legacyReservationLayout } from "./fixtures/resource-reservation-schema.mjs";
/** Actual database.tx/audit classification over a closed fake pg client.
 * The gates are reached, not replaced with request flags or success stubs.
 * No socket, PostgreSQL engine or complete SQL capacity result is claimed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { database, audit, noteParticipationReceiptReplay } from '../lib/database.mjs';

async function fixture(run) {
  const calls = []; let usage = 0, sum = 0;
  const c = { release() { calls.push('RELEASE'); }, async query(sql) {
    const handoff = legacyVolunteerSubstitutions(sql); if (handoff) return handoff;
    calls.push(sql);
    if (sql === reservationSchemaSql.layout) return legacyReservationLayout;
    if (sql.includes(' AS checkins')) return { rows: [{ present: false, participation: false, incubator: false, checkins: false, groups: true }] };
    if (sql === 'SELECT count(*)::int AS count FROM os_participation_groups WHERE org_id=$1') return { rows: [{ count: 1 }] };
    if (sql.startsWith('SELECT sum(size) AS size FROM (')) {
      sum++;
      if (sum > 1 || usage === 0) throw Error('ACTUAL_ORDINARY_GROUP_GATE');
      return { rows: [{ size: usage }] };
    }
    if (sql === 'SELECT * FROM os_orgs WHERE id=$1') throw Error('ACTUAL_REMAINING_GROUP_GATE');
    if (['BEGIN', 'COMMIT', 'ROLLBACK', 'SET TRANSACTION READ ONLY'].includes(sql) ||
        sql.startsWith('SELECT set_config(') || sql.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [] };
    throw Error('Unexpected group classification query: ' + sql);
  } };
  const Original = pg.Pool, warn = console.warn;
  pg.Pool = class { async connect() { return c; } async end() {} };
  console.warn = () => {};
  try { await run(database('postgres://fictional.invalid/group-classification'), calls, () => { usage = 61 * 1024 * 1024 + 1; }); }
  finally { pg.Pool = Original; console.warn = warn; }
}

test('ordinary group mutation reaches the complete ordinary gate', async () => {
  await fixture(async (db, calls) => {
    await assert.rejects(db.tx('actor', 'org', () => 'changed', { lock: true }), /ACTUAL_ORDINARY_GROUP_GATE/);
    assert(!calls.some(q => q === 'SELECT * FROM os_orgs WHERE id=$1'));
    assert.deepEqual(calls.slice(-2), ['ROLLBACK', 'RELEASE']);
  });
});

test('accepted group Replay reaches remaining exits without buying ordinary space', async () => {
  await fixture(async (db, calls) => {
    await assert.rejects(db.tx('actor', 'org', c => { noteParticipationReceiptReplay(c, 'org'); return 'accepted'; }, { lock: true }), /ACTUAL_REMAINING_GROUP_GATE/);
    assert(!calls.some(q => q.startsWith('SELECT sum(size) AS size FROM (')));
    assert.deepEqual(calls.slice(-2), ['ROLLBACK', 'RELEASE']);
  });
});

for (const action of ['participation-group.cancelled', 'participation-group.closed']) test(`${action} stays safety-classed when its optional audit is omitted`, async () => {
  await fixture(async (db, calls, exhaust) => {
    await assert.rejects(db.tx('actor', 'org', async c => {
      exhaust(); assert.equal(await audit(c, 'org', 'actor', action, null, { groupId: 'group' }), false);
    }, { lock: true }), /ACTUAL_REMAINING_GROUP_GATE/);
    assert(!calls.some(q => q.startsWith('INSERT INTO os_events')));
    assert.deepEqual(calls.slice(-2), ['ROLLBACK', 'RELEASE']);
  });
});

test('group preview transaction enforces SQL read-only and performs no final mutation admission', async () => {
  await fixture(async (db, calls) => {
    assert.equal(await db.tx('actor', 'org', () => 'review', { lock: true, readOnly: true }), 'review');
    assert.equal(calls[0], 'BEGIN'); assert.equal(calls[1], 'SET TRANSACTION READ ONLY');
    assert(calls.some(q => q.startsWith('SELECT pg_advisory_xact_lock')));
    assert(!calls.some(q => q.includes(' AS checkins')));
    assert.deepEqual(calls.slice(-2), ['COMMIT', 'RELEASE']);
  });
});
