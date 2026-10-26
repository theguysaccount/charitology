import pg from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import { randomUUID } from 'node:crypto';
import { CONSENT_VERSION } from './config.mjs';
import { hashToken, newToken } from './security.mjs';
// Transactions always use one checked-out client. No subscriber data is logged.
export function database(connectionString, { schema } = {}) {
  const providerLockKey = schema ? parseInt(hashToken(schema).slice(0, 12), 16) : 716231430;
  const pool = new pg.Pool({ connectionString, max: 3, idleTimeoutMillis: 1000, connectionTimeoutMillis: 10000, application_name: 'charitology-newsletter' });
  if (process.env.VERCEL) attachDatabasePool(pool);
  const tx = async (action, { providerLock = false } = {}) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout = '45000'");
      if (schema) {
        if (!/^newsletter_test_[a-f0-9]+$/.test(schema)) throw new Error('Invalid test schema');
        await client.query(`SET LOCAL search_path TO ${schema}`);
      }
      if (providerLock) {
        const { rows } = await client.query('SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired', [providerLockKey]);
        if (!rows[0].acquired) throw new Error('Another preference or campaign operation is in progress; retry later');
      }
      const result = await action(client);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  };
  return {
    tx,
    // Transaction-scoped locks work through Neon's transaction-mode pooler.
    exclusive: action => tx(action, { providerLock: true }),
    close: () => pool.end(),
    rate: keys => tx(async client => {
      let allowed = true;
      for (const { key, limit } of keys) {
        const { rows } = await client.query(`INSERT INTO newsletter_rate_limits(key,hits,expires_at) VALUES($1,1,now()+interval '2 days') ON CONFLICT(key) DO UPDATE SET hits=newsletter_rate_limits.hits+1 RETURNING hits`, [key]);
        if (rows[0].hits > limit) allowed = false;
      }
      return allowed;
    }),
    pending: email => tx(async client => {
      const generation = randomUUID(); const confirm = newToken(); const unsubscribe = newToken();
      await client.query(`INSERT INTO newsletter_subscribers(email,generation) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET generation=$2,mail_status='none',updated_at=now()`, [email, generation]);
      await client.query("DELETE FROM newsletter_tokens WHERE email=$1 AND kind='confirm'", [email]);
      await client.query(`INSERT INTO newsletter_tokens(token_hash,email,generation,kind,expires_at) VALUES($1,$2,$3,'confirm',now()+interval '24 hours'),($4,$2,$3,'unsubscribe',NULL)`, [hashToken(confirm), email, generation, hashToken(unsubscribe)]);
      return { email, generation, confirm, unsubscribe };
    }, { providerLock: true }),
    mailResult: (email, generation, status) => tx(client => client.query('UPDATE newsletter_subscribers SET mail_status=$3,updated_at=now() WHERE email=$1 AND generation=$2', [email, generation, status])),
    confirm: token => tx(async client => {
      // Lock subscriber first in every token transition, so concurrent confirmation/withdrawal serialize.
      const { rows: tokens } = await client.query("SELECT email FROM newsletter_tokens WHERE token_hash=$1 AND kind='confirm'", [hashToken(token)]);
      if (!tokens[0]) return null;
      const { rows: people } = await client.query('SELECT * FROM newsletter_subscribers WHERE email=$1 FOR UPDATE', [tokens[0].email]);
      const person = people[0];
      const { rows } = await client.query(`UPDATE newsletter_tokens SET used_at=now() WHERE token_hash=$1 AND kind='confirm' AND used_at IS NULL AND expires_at>now() AND generation=$2 RETURNING email`, [hashToken(token), person.generation]);
      if (!rows[0]) return null;
      await client.query(`UPDATE newsletter_subscribers SET state='confirmed',consent_at=now(),consent_generation=generation,consent_version=$2,unsubscribed_at=NULL,topic_attempted_generation=NULL,sync_pending=true,updated_at=now() WHERE email=$1`, [person.email, CONSENT_VERSION]);
      await client.query("INSERT INTO newsletter_consent_events(email,kind,version) VALUES($1,'confirmed',$2)", [person.email, CONSENT_VERSION]);
      return person.email;
    }, { providerLock: true }),
    unsubscribe: token => tx(async client => {
      const { rows } = await client.query("SELECT email FROM newsletter_tokens WHERE token_hash=$1 AND kind='unsubscribe'", [hashToken(token)]);
      if (!rows[0]) return null;
      const email = rows[0].email;
      await client.query('SELECT email FROM newsletter_subscribers WHERE email=$1 FOR UPDATE', [email]);
      await client.query("UPDATE newsletter_subscribers SET state='unsubscribed',unsubscribed_at=now(),sync_pending=true,updated_at=now() WHERE email=$1", [email]);
      // A request issued before withdrawal must never re-enable the subscription afterward.
      await client.query("DELETE FROM newsletter_tokens WHERE email=$1 AND kind='confirm'", [email]);
      await client.query("INSERT INTO newsletter_consent_events(email,kind) VALUES($1,'unsubscribed')", [email]);
      return email;
    }, { providerLock: true }),
    status: () => tx(async client => {
      const { rows } = await client.query('SELECT state,count(*)::int AS count FROM newsletter_subscribers GROUP BY state');
      const { rows: sync } = await client.query('SELECT count(*)::int AS count FROM newsletter_subscribers WHERE sync_pending');
      const { rows: campaigns } = await client.query('SELECT edition,content_hash,state,broadcast_id,provider_status,updated_at FROM newsletter_campaigns ORDER BY updated_at DESC');
      const { rows: imports } = await client.query("SELECT contact_import_status AS status,count(*)::int AS count FROM newsletter_subscribers WHERE contact_import_status<>'none' GROUP BY contact_import_status");
      return { states: Object.fromEntries(rows.map(x => [x.state, x.count])), syncPending: sync[0].count, contactImports: Object.fromEntries(imports.map(x => [x.status, x.count])), campaigns };
    }),
    cleanup: () => tx(async client => {
      await client.query('DELETE FROM newsletter_rate_limits WHERE expires_at<now()');
      await client.query("DELETE FROM newsletter_subscribers WHERE state='pending' AND updated_at<now()-interval '7 days'");
      await client.query("DELETE FROM newsletter_tokens WHERE kind='confirm' AND expires_at<now()-interval '7 days'");
      await client.query("DELETE FROM newsletter_webhook_events WHERE created_at<now()-interval '90 days'");
      return { ok: true };
    }),
  };
}
