import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { database } from '../lib/database.mjs';
import { verifiedNeonConnectionString } from '../lib/connection.mjs';
import { hashToken } from '../lib/security.mjs';
import { handleOsMail } from '../lib/os-mail.mjs';
import { config } from '../lib/config.mjs';

test('Actual Postgres: OS relay reserves once, persists ambiguous stops and throttles atomically without subscriber changes', async () => {
  assert.ok(process.env.DATABASE_URL);
  const schema = 'newsletter_test_' + randomBytes(8).toString('hex');
  const client = new pg.Client({ connectionString: verifiedNeonConnectionString(process.env.DATABASE_URL) });
  let db;
  try {
    await client.connect(); await client.query(`CREATE SCHEMA ${schema}`);
    const sql = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
    await client.query(`BEGIN; SET LOCAL search_path TO ${schema}; ${sql} COMMIT;`);
    // The deploy migration is safe to apply again to an already populated schema.
    await client.query(`BEGIN; SET LOCAL search_path TO ${schema}; ${sql} COMMIT;`);
    db = database(process.env.DATABASE_URL, { schema });
    const query = (text, values) => db.tx(c => c.query(text, values));
    const base = { keyHash: hashToken('key'), payloadHash: hashToken('payload'), purpose: 'login', recipientHash: hashToken('synthetic-recipient'), rateKeys: [{ key: 'os-mail:test-global', limit: 100 }, { key: 'os-mail:test-recipient', limit: 100 }] };
    // Match the real pool's three active connections. A larger raw-query
    // queue tests acquisition timeouts rather than reservation correctness.
    const claims = await Promise.all(Array.from({ length: 3 }, () => db.reserveOsMail(base)));
    assert.equal(claims.filter(x => x.reserved).length, 1);
    assert.equal((await query('SELECT count(*)::int AS count FROM newsletter_os_mail_intents')).rows[0].count, 1);
    await db.finishOsMail(base.keyHash, base.payloadHash, 'accepted', 'synthetic-provider-id');
    assert.equal((await db.reserveOsMail(base)).state, 'accepted');
    assert.equal((await db.reserveOsMail({ ...base, payloadHash: hashToken('different') })).state, 'conflict');
    await db.finishOsMail(base.keyHash, base.payloadHash, 'unknown');
    assert.equal((await db.reserveOsMail(base)).state, 'accepted', 'accepted cannot be overwritten by a late failure');
    const limits = [];
    for (let batch = 0; batch < 2; batch++) limits.push(...await Promise.all(Array.from({ length: 3 }, (_, i) => db.reserveOsMail({ ...base, keyHash: hashToken('limited-' + (batch * 3 + i)), rateKeys: [{ key: 'os-mail:limited-recipient', limit: 3 }] }))));
    assert.equal(limits.filter(x => x.reserved).length, 3);
    assert.equal(limits.filter(x => x.state === 'limited').length, 3);
    const unknown = { ...base, keyHash: hashToken('unknown') };
    await db.reserveOsMail(unknown); await db.finishOsMail(unknown.keyHash, unknown.payloadHash, 'unknown');
    assert.equal((await db.reserveOsMail(unknown)).state, 'unknown');

    const settings = config({ OS_MAIL_RELAY_SECRET: 'r'.repeat(40), OS_ORIGIN: 'https://os.charitology.org' });
    let sends = 0;
    const mail = { ready: async () => {}, sendOsMail: async () => { sends++; return { id: 'synthetic-provider-id' }; } };
    const request = () => new Request('https://mail.charitology.org/api/system/os-mail', { method: 'POST', headers: { authorization: 'Bearer ' + settings.osMailSecret, 'content-type': 'application/json', 'idempotency-key': 'live-db-mocked-provider' }, body: JSON.stringify({ purpose: 'login', to: 'synthetic@example.invalid', url: settings.osOrigin + '/auth/confirm?token=synthetic' }) });
    const responses = await Promise.all(Array.from({ length: 3 }, () => handleOsMail(request(), { db, mail, settings })));
    assert.equal(responses.filter(x => x.status === 202).length, 1); assert.equal(sends, 1);
    // Real pool exhaustion must return a generic retryable503 before an
    // external mail attempt. Hold only this test schema's own connections.
    const entered = Array.from({ length: 3 }, () => Promise.withResolvers());
    const startSleep = Promise.withResolvers();
    const occupied = entered.map(signal => db.tx(async c => { signal.resolve(); await startSleep.promise; await c.query('SELECT pg_sleep(12)'); }));
    await Promise.all(entered.map(signal => signal.promise));
    startSleep.resolve();
    const overloaded = await handleOsMail(new Request(request(), { headers: { ...Object.fromEntries(request().headers), 'idempotency-key': 'overloaded-no-send' } }), { db, mail, settings });
    assert.equal(overloaded.status, 503); assert.equal(sends, 1);
    await Promise.all(occupied);
    assert.equal((await query('SELECT count(*)::int AS count FROM newsletter_subscribers')).rows[0].count, 0);
    assert.equal((await query('SELECT count(*)::int AS count FROM newsletter_consent_events')).rows[0].count, 0);
    const stored = JSON.stringify((await query('SELECT * FROM newsletter_os_mail_intents')).rows);
    assert.doesNotMatch(stored, /synthetic@example|auth\/confirm|token=synthetic/);
    console.log('OS relay test used an isolated temporary schema and a mocked mail provider; no actual provider calls or emails.');
  } finally {
    await db?.close();
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await client.end();
  }
});
