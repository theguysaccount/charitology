import { id, fail } from "./security.mjs";
import { membership, visibleRecord } from "./access.mjs";
import { rowRecord } from "./database.mjs";
export async function enqueue(c, org, kind, key, payload, when = new Date()) {
  const job = id();
  const r = await c.query(
    "INSERT INTO os_jobs(org_id,id,kind,idempotency_key,payload,next_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(org_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING id",
    [org, job, kind, key, JSON.stringify(payload), when],
  );
  return r.rows[0].id;
}
export async function runOrgJobs({
  db,
  org,
  send,
  settings,
  deadline = Date.now() + 45000,
}) {
  let processed = 0;
  for (let i = 0; i < 20 && Date.now() < deadline - 23000; i++) {
    const job = await db.tx("", org, async (c) => {
      const r = (
        await c.query(
          "SELECT * FROM os_jobs WHERE org_id=$1 AND status IN ('pending','retry','processing') AND next_at<=now() AND (lease_until IS NULL OR lease_until<now()) AND attempts<8 ORDER BY next_at FOR UPDATE SKIP LOCKED LIMIT1".replace(
            "LIMIT1",
            "LIMIT 1",
          ),
          [org],
        )
      ).rows[0];
      if (!r) return null;
      await c.query(
        "UPDATE os_jobs SET status='processing',attempts=attempts+1,lease_until=now()+interval '2 minutes' WHERE org_id=$1 AND id=$2",
        [org, r.id],
      );
      return r;
    });
    if (!job) break;
    let message = job.payload;
    try {
      if (job.kind === "reminder") {
        message = await db.tx("", org, async (c) => {
          const recipient = (
            await c.query(
              'SELECT u.email,o.name FROM os_members m JOIN "user" u ON u.id=m.user_id JOIN os_orgs o ON o.id=m.org_id WHERE m.org_id=$1 AND m.user_id=$2',
              [org, job.payload.userId],
            )
          ).rows[0];
          if (!recipient) return null;
          const access = await membership(c, org, job.payload.userId);
          const row = (
            await c.query(
              "SELECT * FROM os_records WHERE org_id=$1 AND id=$2 AND deleted_at IS NULL",
              [org, job.payload.recordId],
            )
          ).rows[0];
          const visible = row && visibleRecord(rowRecord(row), access);
          if (!visible) return null;
          return {
            purpose: "reminder",
            to: recipient.email,
            url: new URL("/app", settings.origin).toString(),
            organizationName: recipient.name,
            title: visible.data.title,
            message:
              "A reminder you scheduled in your Charity OS workspace is due.",
          };
        });
        if (!message) {
          await finish(db, org, job.id, "cancelled", null);
          continue;
        }
      }
      if (job.kind === "invitation") {
        const active = await db.tx(
          "",
          org,
          async (c) =>
            (
              await c.query(
                "SELECT1 FROM os_invites WHERE org_id=$1 AND id=$2 AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at>now()".replace(
                  "SELECT1",
                  "SELECT 1",
                ),
                [org, job.idempotency_key.split(":")[1]],
              )
            ).rowCount,
        );
        if (!active) {
          await finish(db, org, job.id, "cancelled", null);
          continue;
        }
      }
      await send(message, `job-${org}-${job.id}`, { deadline });
      await finish(db, org, job.id, "accepted", { accepted: true });
      processed++;
    } catch (e) {
      await db.tx("", org, (c) =>
        c.query(
          "UPDATE os_jobs SET status=CASE WHEN attempts>=8 THEN 'failed' ELSE 'retry' END,lease_until=NULL,next_at=now()+LEAST(86400,60*power(2,attempts))*interval '1 second',last_error=$3 WHERE org_id=$1 AND id=$2",
          [org, job.id, "Delivery unavailable; retry scheduled."],
        ),
      );
    }
  }
  return { processed };
}
async function finish(db, org, job, status, result) {
  await db.tx("", org, (c) =>
    c.query(
      "UPDATE os_jobs SET status=$3,lease_until=NULL,result=$4 WHERE org_id=$1 AND id=$2",
      [org, job, status, result ? JSON.stringify(result) : null],
    ),
  );
}
export async function runJobs({ db, send, settings }) {
  const deadline = Date.now() + 45000;
  const orgs = (
    await db.pool.query(
      "SELECT org_id FROM os_job_tenants ORDER BY last_run_at,org_id LIMIT 50",
    )
  ).rows.map((x) => x.org_id);
  let processed = 0,
    visited = 0;
  for (const org of orgs) {
    if (Date.now() >= deadline - 25000) break;
    await db.pool.query(
      "UPDATE os_job_tenants SET last_run_at=now() WHERE org_id=$1",
      [org],
    );
    processed += (await runOrgJobs({ db, org, send, settings, deadline }))
      .processed;
    visited++;
  }
  return { processed, visited, budgetLimited: visited < orgs.length };
}
