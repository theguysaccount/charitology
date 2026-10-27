import pg from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { randomUUID } from "node:crypto";
import { CONSENT_VERSION } from "./config.mjs";
import { hashToken, newToken } from "./security.mjs";
import { verifiedNeonConnectionString } from "./connection.mjs";
import { mergeProviderFacts } from "./os-mail.mjs";
// Transactions always use one checked-out client. No subscriber data is logged.
export function database(connectionString, { schema } = {}) {
  const providerLockKey = schema
    ? parseInt(hashToken(schema).slice(0, 12), 16)
    : 716231430;
  const pool = new pg.Pool({
    connectionString: verifiedNeonConnectionString(connectionString),
    max: 3,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 10000,
    application_name: "charitology-newsletter",
  });
  if (process.env.VERCEL) attachDatabasePool(pool);
  const tx = async (
    action,
    { providerLock = false, deadline = Infinity } = {},
  ) => {
    const remaining = () => {
      const milliseconds = Math.floor(deadline - Date.now());
      if (milliseconds <= 0) throw new Error("Maintenance time budget reached");
      return milliseconds;
    };
    if (Number.isFinite(deadline)) remaining();
    let client;
    if (Number.isFinite(deadline)) {
      let timer;
      const pending = pool.connect();
      let expired = false;
      try {
        client = await Promise.race([
          pending,
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              expired = true;
              reject(new Error("Database connection time budget reached"));
            }, remaining());
          }),
        ]);
      } catch (error) {
        if (expired)
          pending.then(
            (late) => late.release(),
            () => {},
          );
        throw error;
      } finally {
        clearTimeout(timer);
      }
    } else client = await pool.connect();
    let broken = false;
    const run = (text, values) =>
      Number.isFinite(deadline)
        ? client.query({ text, values, query_timeout: remaining() })
        : client.query(text, values);
    const budgetClient = Number.isFinite(deadline)
      ? {
          query: async (text, values) => {
            await run("SELECT set_config('statement_timeout',$1,true)", [
              String(Math.min(45000, remaining())),
            ]);
            return run(text, values);
          },
        }
      : client;
    try {
      await run("BEGIN");
      await run("SELECT set_config('statement_timeout',$1,true)", [
        String(
          Number.isFinite(deadline) ? Math.min(45000, remaining()) : 45000,
        ),
      ]);
      if (schema) {
        if (!/^newsletter_test_[a-f0-9]+$/.test(schema))
          throw new Error("Invalid test schema");
        await run(`SET LOCAL search_path TO ${schema}`);
      }
      if (providerLock) {
        const { rows } = await run(
          "SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired",
          [providerLockKey],
        );
        if (!rows[0].acquired)
          throw new Error(
            "Another preference or campaign operation is in progress; retry later",
          );
      }
      const result = await action(budgetClient);
      await run("COMMIT");
      return result;
    } catch (error) {
      if (Number.isFinite(deadline)) {
        const left = deadline - Date.now();
        if (left <= 0) broken = true;
        else
          await client
            .query({ text: "ROLLBACK", query_timeout: Math.min(1000, left) })
            .catch(() => {
              broken = true;
            });
      } else await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release(
        broken ? new Error("Timed-out maintenance connection") : undefined,
      );
    }
  };
  const rate = (keys, deadline = Infinity) =>
    tx(
      async (client) => {
        let allowed = true;
        for (const { key, limit } of keys) {
          const { rows } = await client.query(
            `INSERT INTO newsletter_rate_limits(key,hits,expires_at) VALUES($1,1,now()+interval '2 days') ON CONFLICT(key) DO UPDATE SET hits=newsletter_rate_limits.hits+1 RETURNING hits`,
            [key],
          );
          if (rows[0].hits > limit) allowed = false;
        }
        return allowed;
      },
      { deadline },
    );
  return {
    tx,
    // Transaction-scoped locks work through Neon's transaction-mode pooler.
    exclusive: (action) => tx(action, { providerLock: true }),
    withDeadline: (deadline) => ({
      tx: (action, options) => tx(action, { ...options, deadline }),
      exclusive: (action) => tx(action, { providerLock: true, deadline }),
      rate: (keys) => rate(keys, deadline),
    }),
    close: () => pool.end(),
    reserveOsMail: ({
      keyHash,
      payloadHash,
      purpose,
      recipientHash,
      rateKeys,
      correlationHash = null,
    }) =>
      tx(async (client) => {
        // Duplicate callers fail busy before waiting on the unique INSERT. They
        // must not occupy every pooled client while the reservation commits.
        const lockKey = BigInt(
          "0x" +
            hashToken(`${schema || "public"}:os-mail:${keyHash}`).slice(0, 15),
        ).toString();
        const locked = await client.query(
          "SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired",
          [lockKey],
        );
        if (!locked.rows[0].acquired)
          return { state: "creating", reserved: false };
        const inserted = await client.query(
          "INSERT INTO newsletter_os_mail_intents(key_hash,payload_hash,purpose,recipient_hash,state,correlation_hash) VALUES($1,$2,$3,$4,'creating',$5) ON CONFLICT DO NOTHING RETURNING key_hash",
          [keyHash, payloadHash, purpose, recipientHash, correlationHash],
        );
        if (!inserted.rowCount) {
          const { rows } = await client.query(
            "SELECT * FROM newsletter_os_mail_intents WHERE key_hash=$1 FOR UPDATE",
            [keyHash],
          );
          const row = rows[0];
          if (row?.payload_hash !== payloadHash)
            return { state: "conflict", reserved: false };
          if (
            purpose === "participation" &&
            row.purpose === "participation" &&
            row.state === "preflight" &&
            !row.attempted_at
          ) {
            await client.query(
              "UPDATE newsletter_os_mail_intents SET state='creating',safe_code=NULL,updated_at=now() WHERE key_hash=$1",
              [keyHash],
            );
            return { reserved: true };
          }
          return { ...row, reserved: false };
        }
        let limited = false;
        for (const { key, limit } of [...rateKeys].sort((a, b) =>
          a.key.localeCompare(b.key),
        )) {
          const { rows } = await client.query(
            "INSERT INTO newsletter_rate_limits(key,hits,expires_at) VALUES($1,1,now()+interval '2 days') ON CONFLICT(key) DO UPDATE SET hits=newsletter_rate_limits.hits+1 RETURNING hits",
            [key],
          );
          if (rows[0].hits > limit) limited = true;
        }
        if (limited) {
          await client.query(
            "UPDATE newsletter_os_mail_intents SET state='limited',updated_at=now() WHERE key_hash=$1",
            [keyHash],
          );
          return { state: "limited", reserved: false };
        }
        return { state: "creating", reserved: true };
      }),
    finishOsMail: (keyHash, payloadHash, state, providerId = null) =>
      tx(async (client) => {
        if (!["accepted", "unknown", "failed"].includes(state))
          throw new Error("Invalid transactional mail state");
        return client.query(
          "UPDATE newsletter_os_mail_intents SET state=$3,provider_id=$4,updated_at=now() WHERE key_hash=$1 AND payload_hash=$2 AND state='creating'",
          [keyHash, payloadHash, state, providerId],
        );
      }),
    osMailIntent: (keyHash) =>
      tx(
        async (client) =>
          (
            await client.query(
              "SELECT * FROM newsletter_os_mail_intents WHERE key_hash=$1",
              [keyHash],
            )
          ).rows[0] || null,
      ),
    markOsMailAttempt: ({ keyHash, payloadHash, rateKeys }) =>
      tx(async (client) => {
        const row = (
          await client.query(
            "SELECT * FROM newsletter_os_mail_intents WHERE key_hash=$1 FOR UPDATE",
            [keyHash],
          )
        ).rows[0];
        if (
          !row ||
          row.purpose !== "participation" ||
          row.payload_hash !== payloadHash
        )
          throw new Error("Unbound participation attempt");
        if (row.state !== "creating" || row.attempted_at)
          return { ...row, attempt: false };
        let limited = false;
        for (const { key, limit } of [...rateKeys].sort((a, b) =>
          a.key.localeCompare(b.key),
        )) {
          const { rows } = await client.query(
            "INSERT INTO newsletter_rate_limits(key,hits,expires_at) VALUES($1,1,now()+interval '2 days') ON CONFLICT(key) DO UPDATE SET hits=newsletter_rate_limits.hits+1 RETURNING hits",
            [key],
          );
          if (rows[0].hits > limit) limited = true;
        }
        const saved = (
          await client.query(
            limited
              ? "UPDATE newsletter_os_mail_intents SET state='limited',safe_code='rate_limited',updated_at=now() WHERE key_hash=$1 RETURNING *"
              : "UPDATE newsletter_os_mail_intents SET attempted_at=now(),safe_code='provider_attempt_started',updated_at=now() WHERE key_hash=$1 RETURNING *",
            [keyHash],
          )
        ).rows[0];
        return { ...saved, attempt: !limited };
      }),
    finishParticipationMail: (
      keyHash,
      payloadHash,
      state,
      safeCode,
      { providerId = null, facts = {} } = {},
    ) =>
      tx(async (client) => {
        if (
          !["accepted", "unknown", "failed", "preflight"].includes(state) ||
          !/^[a-z_]{1,64}$/.test(safeCode) ||
          (providerId !== null && !/^[A-Za-z0-9_-]{1,100}$/.test(providerId))
        )
          throw new Error("Invalid participation outcome");
        const row = (
          await client.query(
            "SELECT * FROM newsletter_os_mail_intents WHERE key_hash=$1 FOR UPDATE",
            [keyHash],
          )
        ).rows[0];
        if (
          !row ||
          row.purpose !== "participation" ||
          row.payload_hash !== payloadHash
        )
          throw new Error("Unbound participation outcome");
        if (row.state !== "creating") return row;
        if (state === "preflight" && row.attempted_at) {
          state = "unknown";
          safeCode = "attempt_unconfirmed";
        }
        let merged = row.provider_facts;
        for (const [type, at] of Object.entries(facts))
          merged = mergeProviderFacts(merged, type, at);
        return (
          await client.query(
            "UPDATE newsletter_os_mail_intents SET state=$3,safe_code=$4,provider_id=COALESCE(provider_id,$5),provider_facts=$6,updated_at=now() WHERE key_hash=$1 AND payload_hash=$2 RETURNING *",
            [
              keyHash,
              payloadHash,
              state,
              safeCode,
              providerId,
              JSON.stringify(merged),
            ],
          )
        ).rows[0];
      }),
    observeParticipationMail: (keyHash, providerId, type) =>
      tx(async (client) => {
        const row = (
          await client.query(
            "SELECT * FROM newsletter_os_mail_intents WHERE key_hash=$1 AND purpose='participation' AND provider_id=$2 FOR UPDATE",
            [keyHash, providerId],
          )
        ).rows[0];
        if (!row) throw new Error("Unbound provider observation");
        // Retrieval has no last-event timestamp. Preserve verified callback time,
        // otherwise the observation is deliberately timestamp-null.
        const facts = mergeProviderFacts(row.provider_facts, type);
        return (
          await client.query(
            "UPDATE newsletter_os_mail_intents SET state=CASE WHEN state IN ('creating','unknown') THEN 'accepted' ELSE state END,provider_facts=$3,updated_at=now() WHERE key_hash=$1 AND provider_id=$2 RETURNING *",
            [keyHash, providerId, JSON.stringify(facts)],
          )
        ).rows[0];
      }),
    rate,
    pending: (email) =>
      tx(
        async (client) => {
          const generation = randomUUID();
          const confirm = newToken();
          const unsubscribe = newToken();
          await client.query(
            `INSERT INTO newsletter_subscribers(email,generation) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET generation=$2,mail_status='none',updated_at=now()`,
            [email, generation],
          );
          await client.query(
            "DELETE FROM newsletter_tokens WHERE email=$1 AND kind='confirm'",
            [email],
          );
          await client.query(
            `INSERT INTO newsletter_tokens(token_hash,email,generation,kind,expires_at) VALUES($1,$2,$3,'confirm',now()+interval '24 hours'),($4,$2,$3,'unsubscribe',NULL)`,
            [hashToken(confirm), email, generation, hashToken(unsubscribe)],
          );
          return { email, generation, confirm, unsubscribe };
        },
        { providerLock: true },
      ),
    mailResult: (email, generation, status) =>
      tx((client) =>
        client.query(
          "UPDATE newsletter_subscribers SET mail_status=$3,updated_at=now() WHERE email=$1 AND generation=$2",
          [email, generation, status],
        ),
      ),
    confirm: (token) =>
      tx(
        async (client) => {
          // Lock subscriber first in every token transition, so concurrent confirmation/withdrawal serialize.
          const { rows: tokens } = await client.query(
            "SELECT email FROM newsletter_tokens WHERE token_hash=$1 AND kind='confirm'",
            [hashToken(token)],
          );
          if (!tokens[0]) return null;
          const { rows: people } = await client.query(
            "SELECT * FROM newsletter_subscribers WHERE email=$1 FOR UPDATE",
            [tokens[0].email],
          );
          const person = people[0];
          const { rows } = await client.query(
            `UPDATE newsletter_tokens SET used_at=now() WHERE token_hash=$1 AND kind='confirm' AND used_at IS NULL AND expires_at>now() AND generation=$2 RETURNING email`,
            [hashToken(token), person.generation],
          );
          if (!rows[0]) return null;
          await client.query(
            `UPDATE newsletter_subscribers SET state='confirmed',consent_at=now(),consent_generation=generation,consent_version=$2,unsubscribed_at=NULL,topic_attempted_generation=NULL,sync_pending=true,updated_at=now() WHERE email=$1`,
            [person.email, CONSENT_VERSION],
          );
          await client.query(
            "INSERT INTO newsletter_consent_events(email,kind,version) VALUES($1,'confirmed',$2)",
            [person.email, CONSENT_VERSION],
          );
          return person.email;
        },
        { providerLock: true },
      ),
    unsubscribe: (token) =>
      tx(
        async (client) => {
          const { rows } = await client.query(
            "SELECT email FROM newsletter_tokens WHERE token_hash=$1 AND kind='unsubscribe'",
            [hashToken(token)],
          );
          if (!rows[0]) return null;
          const email = rows[0].email;
          await client.query(
            "SELECT email FROM newsletter_subscribers WHERE email=$1 FOR UPDATE",
            [email],
          );
          await client.query(
            "UPDATE newsletter_subscribers SET state='unsubscribed',unsubscribed_at=now(),sync_pending=true,updated_at=now() WHERE email=$1",
            [email],
          );
          // A request issued before withdrawal must never re-enable the subscription afterward.
          await client.query(
            "DELETE FROM newsletter_tokens WHERE email=$1 AND kind='confirm'",
            [email],
          );
          await client.query(
            "INSERT INTO newsletter_consent_events(email,kind) VALUES($1,'unsubscribed')",
            [email],
          );
          return email;
        },
        { providerLock: true },
      ),
    status: () =>
      tx(async (client) => {
        const { rows } = await client.query(
          "SELECT state,count(*)::int AS count FROM newsletter_subscribers GROUP BY state",
        );
        const { rows: sync } = await client.query(
          "SELECT count(*)::int AS count FROM newsletter_subscribers WHERE sync_pending",
        );
        const { rows: campaigns } = await client.query(
          "SELECT edition,content_hash,state,broadcast_id,provider_status,updated_at FROM newsletter_campaigns ORDER BY updated_at DESC",
        );
        const { rows: imports } = await client.query(
          "SELECT contact_import_status AS status,count(*)::int AS count FROM newsletter_subscribers WHERE contact_import_status<>'none' GROUP BY contact_import_status",
        );
        return {
          states: Object.fromEntries(rows.map((x) => [x.state, x.count])),
          syncPending: sync[0].count,
          contactImports: Object.fromEntries(
            imports.map((x) => [x.status, x.count]),
          ),
          campaigns,
        };
      }),
    cleanup: (options = {}) =>
      tx(async (client) => {
        await client.query(
          "DELETE FROM newsletter_rate_limits WHERE expires_at<now()",
        );
        await client.query(
          "DELETE FROM newsletter_subscribers WHERE state='pending' AND updated_at<now()-interval '7 days'",
        );
        await client.query(
          "DELETE FROM newsletter_tokens WHERE kind='confirm' AND expires_at<now()-interval '7 days'",
        );
        await client.query(
          "DELETE FROM newsletter_webhook_events WHERE created_at<now()-interval '90 days'",
        );
        return { ok: true };
      }, options),
  };
}
