import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { database, logicalBackupBytes } from "../lib/database.mjs";
import { membership } from "../lib/access.mjs";
import { csrf, hash } from "../lib/security.mjs";
import {
  DELIVERY_CONSENT_VERSION,
  DELIVERY_TEMPLATE_VERSION,
  deliveryRoutes,
  ownDeliveryRoutes,
  ownDeliverySummary,
  queueParticipationTransition,
  resolveDeliveryRecipient,
  runParticipationDelivery,
  suppressParticipationDelivery,
} from "../lib/participation-delivery.mjs";
import {
  exportDelivery,
  restoredDelivery,
  restoreDelivery,
} from "../lib/participation-delivery-backup.mjs";
const configured = !!(process.env.DATABASE_URL && process.env.OS_DATABASE_URL);
const quote = (v) => '"' + v.replaceAll('"', '""') + '"';
function direct(value) {
  const u = new URL(value);
  if (u.hostname.endsWith(".neon.tech"))
    u.hostname = u.hostname.replace(/-pooler(?=\.)/, "");
  return u.toString();
}
const settings = {
  origin: "https://os.example.invalid",
  secret: "fictional-participation-delivery-secret-longer-than-32",
  participationDeliveryEnabled: true,
  participationTestOnly: false,
  participationTestRecipient: "",
};
const staff = "synthetic-delivery-admin",
  org = "synthetic-delivery-org";
let sequence = 0;
const key = () =>
  "synthetic-delivery-command-" + String(++sequence).padStart(12, "0");
const err = (code) => (e) => e.code === code;
test(
  "actual constrained PostgreSQL delivery consent, activation, leases, privacy, quotas and inactive recovery (synthetic accounts; mocked transport only)",
  {
    skip: configured
      ? false
      : "Set owner and constrained app URLs for isolated schema tests.",
    timeout: 900000,
  },
  async (t) => {
    const schema = "os_delivery_" + randomBytes(8).toString("hex"),
      owner = database(process.env.DATABASE_URL);
    let migration, db;
    const terms = {
      title: "Fictional approved occurrence",
      kind: "session",
      startAt: "2099-05-01T09:00:00+00:00",
      endAt: "2099-05-01T11:00:00+00:00",
      timeZone: "UTC",
      participationPurpose: "Coordinate a fictional test occurrence.",
      participantInstructions: null,
      organizerEmail: "organizer@example.invalid",
      organizerUrl: null,
    };
    const sent = [],
      pol = () =>
        db.tx(
          staff,
          org,
          async (c) =>
            (
              await c.query(
                "SELECT * FROM os_participation_delivery_policies WHERE org_id=$1",
                [org],
              )
            ).rows[0],
        );
    const transport = {
      async sendParticipation(message, key) {
        assert.match(message.to, /@example\.invalid$/);
        sent.push({ message, key });
        return {
          state: "accepted",
          safeCode: "provider_accepted",
          providerEventAt: null,
        };
      },
      async participationStatus() {
        return {
          state: "delivered",
          safeCode: "provider_delivered",
          providerEventAt: "+100000-12-31T23:59:59.999Z",
        };
      },
    };
    const row = (pid) =>
      db.tx(
        staff,
        org,
        async (c) =>
          (
            await c.query(
              "SELECT * FROM os_participations WHERE org_id=$1 AND id=$2",
              [org, pid],
            )
          ).rows[0],
      );
    const boxes = (pid) =>
      db.tx(
        staff,
        org,
        async (c) =>
          (
            await c.query(
              "SELECT * FROM os_participation_outbox WHERE org_id=$1 AND ($2::text IS NULL OR participation_id=$2) ORDER BY event_revision",
              [org, pid || null],
            )
          ).rows,
      );
    const own = async (p, input, custom = settings) => {
      const url =
          custom.origin +
          `/api/participant/orgs/${org}/requests/${p.intake}/participations/${p.id}/` +
          (input === undefined ? "delivery" : "delivery-preference"),
        headers =
          input === undefined
            ? {}
            : {
                origin: custom.origin,
                "content-type": "application/json",
                "x-csrf-token": csrf(p.session.session.id, custom.secret),
              };
      const response = await ownDeliveryRoutes({
        request: new Request(url, {
          method: input === undefined ? "GET" : "POST",
          headers,
          ...(input === undefined ? {} : { body: JSON.stringify(input) }),
        }),
        db,
        settings: custom,
        session: p.session,
      });
      return response.json();
    };
    const staffCall = async (action, input, actor = staff) =>
      db.tx(
        actor,
        org,
        async (c) => {
          const tail = "participation-delivery" + (action ? "/" + action : ""),
            response = await deliveryRoutes({
              c,
              org,
              user: actor,
              member: await membership(c, org, actor),
              tail,
              method: input === undefined ? "GET" : "POST",
              input: input || {},
              url: new URL(settings.origin + `/api/orgs/${org}/${tail}`),
              settings,
            });
          return response.json();
        },
        { lock: true },
      );
    async function seed(
      name,
      { fresh = false, program = "program-a", state = "confirmed" } = {},
    ) {
      const id = "p-" + name,
        intake = "i-" + name,
        user = "user-" + name,
        email = name + "@example.invalid",
        link = randomBytes(16).toString("hex"),
        session = {
          user: { id: user, email, emailVerified: true },
          session: { id: "session-" + name },
        };
      await migration.pool.query(
        'INSERT INTO "user"(id,email,"emailVerified") VALUES($1,$2,true)',
        [user, email],
      );
      await db.tx(
        user,
        org,
        async (c) => {
          for (const [rid, module, kind, data] of [
            [
              "contact-" + name,
              "contacts",
              "person-reference",
              { contactPreference: "permission-needed" },
            ],
            [
              "booking-" + name,
              "events",
              "registration",
              { sessionId: "target", contactId: "contact-" + name },
            ],
          ])
            await c.query(
              "INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision,approval) VALUES($1,$2,$3,$4,'approved',$5,$5,1,$6)",
              [
                org,
                rid,
                module,
                JSON.stringify({
                  title: "Fictional record",
                  kind,
                  programId: program,
                  ...data,
                }),
                staff,
                JSON.stringify({
                  status: "approved",
                  revision: 1,
                  actorId: "independent-synthetic-reviewer",
                }),
              ],
            );
          await c.query(
            "INSERT INTO os_intake(org_id,id,publication_id,answers,consent_at,status) VALUES($1,$2,'publication',$3,now(),'converted')",
            [
              org,
              intake,
              JSON.stringify({ name: "Fictional participant", email }),
            ],
          );
          await c.query(
            "INSERT INTO os_participant_links(id,org_id,intake_id,publication_id,user_id) VALUES($1,$2,$3,'publication',$4)",
            [link, org, intake, user],
          );
          const d = fresh
            ? {
                version: DELIVERY_CONSENT_VERSION,
                enabled: true,
                revision: 1,
                at: new Date().toISOString(),
                userId: user,
                linkId: link,
                linkRevision: 1,
                recipientHash: hash(email),
              }
            : null;
          await c.query(
            "INSERT INTO os_participations(org_id,id,target_id,module_id,booking_record_id,contact_id,intake_id,state,source,consent,frozen,created_by,delivery_consent) VALUES($1,$2,'target','events',$3,$4,$5,$6,'intake',$7,$8,$9,$10)",
            [
              org,
              id,
              "booking-" + name,
              "contact-" + name,
              intake,
              state,
              JSON.stringify({
                emailUpdates: true,
                recipientHash: hash(email),
              }),
              JSON.stringify({
                terms,
                termsHash: hash(terms),
                sourceRevision: 4,
              }),
              staff,
              d && JSON.stringify(d),
            ],
          );
        },
        { lock: true },
      );
      return { id, intake, user, email, link, session };
    }
    const enable = async (p, custom = settings) => {
      const current = await row(p.id);
      return own(
        p,
        {
          revision: current.revision,
          intakeRevision: 1,
          enabled: true,
          consentVersion: DELIVERY_CONSENT_VERSION,
          idempotencyKey: key(),
        },
        custom,
      );
    };
    const preview = async (ids) =>
      staffCall("preview", {
        policyRevision: (await pol())?.revision || 1,
        participationIds: ids,
      });
    const activate = async (pr) =>
      staffCall("activate", {
        previewId: pr.previewId,
        reviewHash: pr.reviewHash,
        policyRevision: pr.policyRevision,
        idempotencyKey: key(),
      });
    const queue = async (p, safe = false) =>
      db.tx(
        staff,
        org,
        async (c) =>
          queueParticipationTransition(c, {
            org,
            participation: await rowIn(c, p.id),
            settings,
            safe,
          }),
        { lock: true },
      );
    async function rowIn(c, pid) {
      return (
        await c.query(
          "SELECT * FROM os_participations WHERE org_id=$1 AND id=$2",
          [org, pid],
        )
      ).rows[0];
    }
    const run = (override = transport, remaining = 1) =>
      runParticipationDelivery({
        db,
        transport: override,
        settings,
        budget: { deadline: Date.now() + 45000, remaining },
      });
    const due = () =>
      db.tx(staff, org, (c) =>
        c.query(
          "UPDATE os_participation_outbox SET next_at=now() WHERE org_id=$1 AND state IN ('accepted','unknown','pending')",
          [org],
        ),
      );
    try {
      await owner.pool.query(`CREATE SCHEMA ${quote(schema)}`);
      migration = database(direct(process.env.DATABASE_URL), { schema });
      await migration.migrate();
      await migration.pool.query(
        'CREATE TABLE "user"(id text PRIMARY KEY,email text NOT NULL,"emailVerified" boolean NOT NULL)',
      );
      const role = decodeURIComponent(
        new URL(process.env.OS_DATABASE_URL).username,
      );
      assert.notEqual(
        role,
        decodeURIComponent(new URL(process.env.DATABASE_URL).username),
      );
      await owner.pool.query(
        `GRANT USAGE ON SCHEMA ${quote(schema)} TO ${quote(role)}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${quote(schema)} TO ${quote(role)}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${quote(schema)} TO ${quote(role)}`,
      );
      db = database(direct(process.env.OS_DATABASE_URL), { schema });
      await db.tx(
        staff,
        org,
        async (c) => {
          await c.query(
            "INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional delivery organization',$1,'USD','UTC')",
            [org],
          );
          await c.query(
            "INSERT INTO os_members(org_id,user_id,role,program_ids) VALUES($1,$2,'admin','[]'),($1,'synthetic-reader','board_reader','[]'),($1,'synthetic-writer','program_lead','[\"program-a\"]')",
            [org, staff],
          );
          await c.query(
            "INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision,approval) VALUES($1,'target','events',$2,'scheduled','synthetic-author','synthetic-author',4,$3)",
            [
              org,
              JSON.stringify({
                ...terms,
                capacity: 100,
                programId: "program-a",
              }),
              JSON.stringify({
                status: "approved",
                revision: 4,
                actorId: "independent-synthetic-reviewer",
              }),
            ],
          );
          await c.query(
            "INSERT INTO os_participation_targets(org_id,target_id,module_id,source_revision,terms,terms_hash,created_by) VALUES($1,'target','events',4,$2,$3,$4)",
            [org, JSON.stringify(terms), hash(terms), staff],
          );
          await c.query(
            "INSERT INTO os_publications(org_id,id,record_id,source_revision,kind,schema,created_by) VALUES($1,'publication','target',4,'event-interest',$2,$3)",
            [
              org,
              JSON.stringify({
                title: "Fictional request",
                questions: [
                  {
                    key: "email",
                    type: "text",
                    label: "Email",
                    required: true,
                  },
                ],
              }),
              staff,
            ],
          );
        },
        { lock: true },
      );
      await t.test(
        "new policy/preview tables FORCE RLS; context-free reads and cross-tenant writes are denied",
        async () => {
          const flags = await migration.pool.query(
            "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace=$1::regnamespace AND relname IN ('os_participation_delivery_policies','os_participation_delivery_previews')",
            [schema],
          );
          assert.equal(flags.rows.length, 2);
          assert.ok(
            flags.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity),
          );
          await assert.rejects(
            db.tx(staff, null, (c) =>
              c.query(
                "INSERT INTO os_participation_delivery_policies(org_id,epoch,template_version) VALUES($1,'forbidden',$2)",
                [org, DELIVERY_TEMPLATE_VERSION],
              ),
            ),
            (e) => e.code === "42501",
          );
          await assert.rejects(
            staffCall(undefined, undefined, "synthetic-reader"),
            err("role"),
          );
        },
      );
      let current;
      await t.test(
        "historical preference cannot send; new exact own consent saves without changing frozen attendance or queuing mail",
        async () => {
          current = await seed("fresh");
          const before = await own(current);
          assert.equal(before.delivery.enabled, false);
          assert.equal(before.delivery.canEnable, true);
          const initialPolicy = await staffCall();
          assert.equal(initialPolicy.policy.enabled, false);
          assert.equal(initialPolicy.available, true);
          const result = await enable(current, {
            ...settings,
            participationDeliveryEnabled: false,
          });
          assert.equal(result.revision, 2);
          assert.equal(result.delivery.enabled, true);
          assert.equal(result.delivery.available, false);
          assert.equal(result.delivery.canEnable, true);
          assert.deepEqual((await row(current.id)).frozen.terms, terms);
          assert.equal((await boxes(current.id)).length, 0);
          assert.equal(sent.length, 0);
          const p = await row(current.id);
          await db.tx(staff, org, async (c) => {
            assert.equal(
              (await resolveDeliveryRecipient(c, { org, participation: p }))
                .email,
              current.email,
            );
            assert.equal(
              (
                await c.query(
                  "SELECT current_setting('app.user_id',true) AS user_id",
                )
              ).rows[0].user_id,
              staff,
            );
          });
        },
      );
      await t.test(
        "current verified address cannot transfer the original request binding; body/query cannot supply an address",
        async () => {
          const p = await seed("mismatch");
          await migration.pool.query('UPDATE "user" SET email=$2 WHERE id=$1', [
            p.user,
            "changed@example.invalid",
          ]);
          const changed = {
            ...p,
            session: {
              ...p.session,
              user: { ...p.session.user, email: "changed@example.invalid" },
            },
          };
          await assert.rejects(
            enable(changed),
            err("participation_delivery_consent"),
          );
          assert.equal((await row(p.id)).delivery_consent, null);
          await assert.rejects(
            own(p, {
              revision: 1,
              intakeRevision: 1,
              enabled: true,
              consentVersion: DELIVERY_CONSENT_VERSION,
              idempotencyKey: key(),
              to: "somebody@example.invalid",
            }),
            err("participation_delivery_fields"),
          );
        },
      );
      await t.test(
        "preview binds every selected consent/link/booking revision and stale activation has no partial writes",
        async () => {
          const a = await seed("stale-a", { fresh: true }),
            b = await seed("stale-b", { fresh: true }),
            pr = await preview([a.id, b.id]);
          assert.equal(pr.summary.eligible, 2);
          await db.tx(staff, org, (c) =>
            c.query(
              "UPDATE os_participations SET revision=revision+1 WHERE org_id=$1 AND id=$2",
              [org, b.id],
            ),
          );
          await assert.rejects(
            activate(pr),
            err("participation_delivery_preview"),
          );
          assert.equal((await boxes(a.id)).length, 0);
          assert.equal((await pol()).enabled, false);
        },
      );
      await t.test(
        "new snapshot activation never upgrades paused history; same-key replay and cross-kind snapshots do not duplicate",
        async () => {
          await db.tx(staff, org, (c) =>
            c.query(
              "INSERT INTO os_participation_outbox(org_id,id,participation_id,event_revision,payload) VALUES($1,'legacy-paused',$2,1,$3)",
              [
                org,
                current.id,
                JSON.stringify({
                  state: "confirmed",
                  participationId: current.id,
                  revision: 1,
                }),
              ],
            ),
          );
          const pr = await preview([current.id]),
            input = {
              previewId: pr.previewId,
              reviewHash: pr.reviewHash,
              policyRevision: pr.policyRevision,
              idempotencyKey: key(),
            },
            first = await staffCall("activate", input),
            again = await staffCall("activate", input);
          assert.equal(first.queued, 1);
          assert.deepEqual(again, first);
          assert.equal(await queue(current), false);
          const list = await boxes(current.id);
          assert.equal(list.length, 2);
          assert.equal(list[0].state, "paused");
          assert.equal(list[0].intent_kind, "legacy");
          assert.equal(list[1].state, "pending");
          assert.equal(list[1].budget_bytes, 8192);
          assert.equal(list[1].participation_revision, 2);
          assert.equal(list[1].event_revision, 2);
          await assert.rejects(
            staffCall("activate", { ...input, reviewHash: "a".repeat(64) }),
            err("participation_delivery_intent"),
          );
        },
      );
      await t.test(
        "one concurrent lease sends once; extended-year provider delivery persists through status-only reconciliation",
        async () => {
          const results = await Promise.all([run(), run()]);
          assert.equal(
            results.reduce((n, r) => n + r.attempted, 0),
            1,
          );
          assert.equal(sent.length, 1);
          assert.deepEqual(Object.keys(sent[0].message).sort(), [
            "purpose",
            "to",
            "url",
          ]);
          assert.equal(sent[0].message.url, settings.origin + "/participant");
          assert.equal((await boxes(current.id)).at(-1).state, "accepted");
          await due();
          await run({
            sendParticipation: async () => {
              throw new Error("acceptance cannot resend");
            },
            participationStatus: async () => ({
              state: "unknown",
              safeCode: "intent_unknown",
              providerEventAt: null,
            }),
          });
          const preservedAcceptance = (await boxes(current.id)).at(-1);
          assert.equal(preservedAcceptance.state, "accepted");
          assert.equal(preservedAcceptance.safe_code, "provider_accepted");
          assert.equal(preservedAcceptance.provider_event_at, null);
          await due();
          assert.equal((await run()).reconciled, 1);
          assert.equal(sent.length, 1);
          assert.equal((await boxes(current.id)).at(-1).state, "delivered");
        },
      );
      await t.test(
        "a later verified complaint after delivery is reconciled without resend and disables only the blocked binding",
        async () => {
          await db.tx(staff, org, (c) =>
            c.query(
              "UPDATE os_participation_outbox SET next_at=now() WHERE org_id=$1 AND participation_id=$2 AND state='delivered'",
              [org, current.id],
            ),
          );
          await run({
            sendParticipation: async () => {
              throw new Error("delivery cannot resend");
            },
            participationStatus: async () => ({
              state: "unknown",
              safeCode: "intent_unknown",
              providerEventAt: null,
            }),
          });
          const preservedDelivery = (await boxes(current.id)).at(-1);
          assert.equal(preservedDelivery.state, "delivered");
          assert.equal(preservedDelivery.safe_code, "provider_delivered");
          assert.equal(
            preservedDelivery.provider_event_at.toISOString(),
            "+100000-12-31T23:59:59.999Z",
          );
          await db.tx(staff, org, (c) =>
            c.query(
              "UPDATE os_participation_outbox SET next_at=now() WHERE org_id=$1 AND participation_id=$2 AND state='delivered'",
              [org, current.id],
            ),
          );
          const result = await run({
            sendParticipation: async () => {
              throw new Error("delivered history must not resend");
            },
            participationStatus: async () => ({
              state: "suppressed",
              safeCode: "provider_complained",
              providerEventAt: "2026-10-26T14:00:00.000Z",
            }),
          });
          assert.equal(result.reconciled, 1);
          assert.equal(sent.length, 1);
          assert.equal((await boxes(current.id)).at(-1).state, "suppressed");
          assert.equal((await row(current.id)).delivery_consent.enabled, false);
          assert.equal((await row(current.id)).state, "confirmed");
        },
      );
      await t.test(
        "known provider outcomes wait for brief tenant-lock contention instead of leaving a completed send leased",
        async () => {
          const p = await seed("outcome-contention", { fresh: true });
          await queue(p);
          let held = null,
            finalizerPid = null,
            observation,
            sends = 0,
            statuses = 0;
          const contendedDb = {
            pool: db.pool,
            tx(user, tenant, fn, options) {
              return db.tx(
                user,
                tenant,
                async (c) => {
                  const backendPid = (
                    await c.query("SELECT pg_backend_pid() AS pid")
                  ).rows[0].pid;
                  return fn({
                    query(sql, values) {
                      const pending = c.query(sql, values),
                        text = typeof sql === "string" ? sql : sql.text;
                      if (held && text.includes("advisory_xact_lock"))
                        finalizerPid = backendPid;
                      return pending;
                    },
                  });
                },
                options,
              );
            },
          };
          try {
            const result = await runParticipationDelivery({
              db: contendedDb,
              settings,
              budget: { deadline: Date.now() + 45000, remaining: 1 },
              transport: {
                async sendParticipation() {
                  sends++;
                  held = await db.pool.connect();
                  await held.query("BEGIN");
                  await held.query(
                    "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
                    [org],
                  );
                  // Release only after PostgreSQL shows that the finalizer is
                  // actually waiting. A try-lock/drop implementation cannot
                  // satisfy this assertion, regardless of runner scheduling.
                  const lock = held;
                  observation = (async () => {
                    const until = Date.now() + 1000;
                    try {
                      while (Date.now() < until) {
                        if (finalizerPid) {
                          const blocked = (
                            await migration.pool.query(
                              "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted) AS blocked",
                              [finalizerPid],
                            )
                          ).rows[0].blocked;
                          if (blocked) return true;
                        }
                        await new Promise((resolve) => setTimeout(resolve, 5));
                      }
                      return false;
                    } finally {
                      await lock.query("ROLLBACK");
                      lock.release();
                      if (held === lock) held = null;
                    }
                  })();
                  return {
                    state: "accepted",
                    safeCode: "provider_accepted",
                    providerEventAt: null,
                  };
                },
                async participationStatus() {
                  throw new Error("The first operation must send once.");
                },
              },
            });
            assert.equal(await observation, true);
            assert.equal(result.attempted, 1);
            assert.equal(sends, 1);
            const accepted = (await boxes(p.id)).at(-1);
            assert.equal(accepted.state, "accepted");
            assert.equal(accepted.safe_code, "provider_accepted");
            assert.equal(accepted.lease_owner, null);
            assert.equal(accepted.attempts, 1);
            const reconcile = async (state, safeCode) => {
              await db.tx(staff, org, (c) =>
                c.query(
                  "UPDATE os_participation_outbox SET next_at=now() WHERE org_id=$1 AND participation_id=$2",
                  [org, p.id],
                ),
              );
              return run({
                async sendParticipation() {
                  sends++;
                  throw new Error("A completed attempt cannot resend.");
                },
                async participationStatus() {
                  statuses++;
                  return { state, safeCode, providerEventAt: null };
                },
              });
            };
            assert.equal(
              (await reconcile("delivered", "provider_delivered")).reconciled,
              1,
            );
            assert.equal((await boxes(p.id)).at(-1).state, "delivered");
            assert.equal(
              (await reconcile("suppressed", "provider_complained")).reconciled,
              1,
            );
            assert.equal((await boxes(p.id)).at(-1).state, "suppressed");
            assert.equal((await row(p.id)).delivery_consent.enabled, false);
            assert.equal(sends, 1);
            assert.equal(statuses, 2);
          } finally {
            if (observation) await observation;
            if (held) {
              await held.query("ROLLBACK");
              held.release();
            }
          }
        },
      );
      await t.test(
        "a genuinely exhausted completion deadline keeps the attempted lease recoverable by status only",
        async () => {
          const p = await seed("outcome-deadline", { fresh: true });
          await queue(p);
          let sends = 0,
            statuses = 0;
          const budget = { deadline: Date.now() + 45000, remaining: 1 };
          const result = await runParticipationDelivery({
            db,
            settings,
            budget,
            transport: {
              async sendParticipation() {
                sends++;
                budget.deadline = Date.now();
                return {
                  state: "accepted",
                  safeCode: "provider_accepted",
                  providerEventAt: null,
                };
              },
              async participationStatus() {
                throw new Error("The initial operation must send once.");
              },
            },
          });
          assert.equal(result.attempted, 1);
          assert.equal(result.budgetLimited, true);
          const interrupted = (await boxes(p.id)).at(-1);
          assert.equal(interrupted.state, "leased");
          assert.ok(interrupted.first_attempt_at);
          assert.equal(interrupted.attempts, 1);
          await db.tx(staff, org, (c) =>
            c.query(
              "UPDATE os_participation_outbox SET lease_until=now()-interval '1 second',next_at=now() WHERE org_id=$1 AND participation_id=$2",
              [org, p.id],
            ),
          );
          const recovered = await run({
            async sendParticipation() {
              sends++;
              throw new Error("An expired attempted lease cannot resend.");
            },
            async participationStatus() {
              statuses++;
              return {
                state: "delivered",
                safeCode: "provider_delivered",
                providerEventAt: null,
              };
            },
          });
          assert.equal(recovered.reconciled, 1);
          assert.equal((await boxes(p.id)).at(-1).state, "delivered");
          assert.equal(sends, 1);
          assert.equal(statuses, 1);
        },
      );
      await t.test(
        "ambiguous attempt and expired attempted lease never resend, including after provider cache expiry",
        async () => {
          const p = await seed("unknown", { fresh: true });
          await queue(p);
          let sends = 0,
            statuses = 0;
          await run({
            sendParticipation: async () => {
              sends++;
              throw new Error("simulated lost response");
            },
            participationStatus: async () => {
              statuses++;
              return {
                state: "unknown",
                safeCode: "intent_unknown",
                providerEventAt: null,
              };
            },
          });
          assert.equal((await boxes(p.id)).at(-1).state, "unknown");
          await db.tx(staff, org, (c) =>
            c.query(
              "UPDATE os_participation_outbox SET state='leased',first_attempt_at=now()-interval '2 days',lease_until=now()-interval '1 second',lease_owner='expired-worker',next_at=now() WHERE org_id=$1 AND participation_id=$2",
              [org, p.id],
            ),
          );
          await run({
            sendParticipation: async () => {
              sends++;
              throw new Error("must not send");
            },
            participationStatus: async () => {
              statuses++;
              return {
                state: "unknown",
                safeCode: "intent_unknown",
                providerEventAt: null,
              };
            },
          });
          assert.equal(sends, 1);
          assert.equal(statuses, 1);
          assert.equal((await boxes(p.id)).at(-1).state, "unknown");
        },
      );
      await t.test(
        "proven preflight-only defer retries the identical key/payload; blocked feedback withdraws future live authority",
        async () => {
          const p = await seed("preflight", { fresh: true });
          await queue(p);
          const attempts = [];
          const response = {
            sendParticipation: async (message, key) => {
              attempts.push({ message, key });
              return attempts.length === 1
                ? {
                    state: "unavailable",
                    safeCode: "preflight_unavailable",
                    providerEventAt: null,
                  }
                : {
                    state: "accepted",
                    safeCode: "provider_accepted",
                    providerEventAt: null,
                  };
            },
            participationStatus: async () => ({
              state: "suppressed",
              safeCode: "provider_complained",
              providerEventAt: "2026-10-26T13:00:00.000Z",
            }),
          };
          await run(response);
          let out = (await boxes(p.id)).at(-1);
          assert.equal(out.state, "pending");
          assert.equal(out.first_attempt_at, null);
          await db.tx(staff, org, (c) =>
            c.query(
              "UPDATE os_participation_outbox SET next_at=now() WHERE org_id=$1 AND participation_id=$2",
              [org, p.id],
            ),
          );
          await run(response);
          assert.equal(attempts.length, 2);
          assert.deepEqual(attempts[1], attempts[0]);
          await db.tx(staff, org, (c) =>
            c.query(
              "UPDATE os_participation_outbox SET next_at=now() WHERE org_id=$1 AND participation_id=$2",
              [org, p.id],
            ),
          );
          await run(response);
          assert.equal((await row(p.id)).delivery_consent.enabled, false);
          assert.equal((await boxes(p.id)).at(-1).state, "suppressed");
        },
      );
      await t.test(
        "scoped writers never receive another program roster or private delivery bindings",
        async () => {
          const hidden = await seed("hidden", {
              fresh: true,
              program: "program-b",
            }),
            list = await staffCall(undefined, undefined, "synthetic-writer");
          assert.ok(
            !list.candidates.some((c) => c.participationId === hidden.id),
          );
          assert.equal(
            /recipientHash|linkId|userId|@example/.test(JSON.stringify(list)),
            false,
          );
          await assert.rejects(
            staffCall(
              "preview",
              {
                policyRevision: (await pol()).revision,
                participationIds: [hidden.id],
              },
              "synthetic-writer",
            ),
            err("role"),
          );
        },
      );
      await t.test(
        "privacy suppression removes unsent work and verified authority without changing attendance",
        async () => {
          const p = await seed("erased", { fresh: true });
          await queue(p);
          await db.tx(
            staff,
            org,
            (c) =>
              suppressParticipationDelivery(c, {
                org,
                intakeId: p.intake,
                reason: "erased",
              }),
            { lock: true },
          );
          assert.equal((await row(p.id)).state, "confirmed");
          assert.equal((await row(p.id)).delivery_consent.enabled, false);
          assert.equal((await boxes(p.id)).at(-1).state, "cancelled");
          const noAttempt = await run();
          assert.equal(noAttempt.attempted, 0);
        },
      );
      await t.test(
        "shared budget counts cancelled and deferred leased work, including the last reserved operation",
        async () => {
          const p = await seed("bounded-cancel", { fresh: true });
          await db.tx(staff, org, (c) =>
            c.query(
              "INSERT INTO os_participation_outbox(org_id,id,participation_id,event_revision,participation_revision,intent_kind,state,payload,relay_key,budget_bytes) SELECT $1,'bounded-cancel-'||n,$2,n,n,'transition','pending',jsonb_build_object('state','confirmed','participationId',$2::text,'revision',n),'bounded-cancel-key-'||n,8192 FROM generate_series(100,124) n",
              [org, p.id],
            ),
          );
          const budget = { deadline: Date.now() + 45000, remaining: 3 },
            result = await runParticipationDelivery({
              db,
              transport,
              settings,
              budget,
            });
          assert.equal(result.cancelled, 3);
          assert.equal(budget.remaining, 0);
          assert.equal(
            (await boxes(p.id)).filter((o) => o.state === "pending").length,
            22,
          );
          await db.tx(staff, org, (c) =>
            c.query(
              "UPDATE os_participation_outbox SET state='cancelled' WHERE org_id=$1 AND participation_id=$2",
              [org, p.id],
            ),
          );
          const deferred = await seed("bounded-defer", { fresh: true });
          await queue(deferred);
          const deferBudget = { deadline: Date.now() + 45000, remaining: 1 };
          const deferredResult = await runParticipationDelivery({
            db,
            transport,
            settings: { ...settings, participationDeliveryEnabled: false },
            budget: deferBudget,
          });
          assert.equal(deferredResult.deferred, 1);
          assert.equal(deferBudget.remaining, 0);
          assert.equal(
            (await boxes(deferred.id)).at(-1).first_attempt_at,
            null,
          );
          await db.tx(
            staff,
            org,
            (c) =>
              suppressParticipationDelivery(c, {
                org,
                participationId: deferred.id,
                reason: "preference_off",
              }),
            { lock: true },
          );
        },
      );
      await t.test(
        "live row reservations enforce the8MiB outbox cap before insertion while safe cancellation can omit its notice",
        async () => {
          const p = await seed("outbox-full", { fresh: true });
          await db.tx(staff, org, (c) =>
            c.query(
              "INSERT INTO os_participation_outbox(org_id,id,participation_id,event_revision,participation_revision,intent_kind,state,payload,relay_key,budget_bytes) SELECT $1,'quota-outbox-'||n,$2,n,n,'transition','cancelled',jsonb_build_object('state','confirmed','participationId',$2::text,'revision',n),'quota-outbox-key-'||n,8192 FROM generate_series(200,1223) n",
              [org, p.id],
            ),
          );
          try {
            await assert.rejects(queue(p), err("participation_delivery_quota"));
            assert.equal(await queue(p, true), false);
            assert.equal((await boxes(p.id)).length, 1024);
            assert.equal((await row(p.id)).state, "confirmed");
          } finally {
            await db.tx(staff, org, (c) =>
              c.query(
                "DELETE FROM os_participation_outbox WHERE org_id=$1 AND id LIKE 'quota-outbox-%'",
                [org],
              ),
            );
          }
        },
      );
      await t.test(
        "policy disable and own preference-off survive exhausted ordinary and emergency audit budgets; opt-in rolls back",
        async () => {
          const on = await seed("full-off", { fresh: true }),
            off = await seed("full-on");
          await queue(on);
          await db.tx(staff, org, (c) =>
            c.query(
              "INSERT INTO os_comments(org_id,id,record_id,actor_id,body) VALUES($1,'quota-fixture','target',$2,repeat('x',63*1024*1024))",
              [org, staff],
            ),
          );
          try {
            await assert.rejects(enable(off), err("quota"));
            assert.equal((await row(off.id)).delivery_consent, null);
            const result = await own(on, {
              revision: 1,
              intakeRevision: 1,
              enabled: false,
              consentVersion: DELIVERY_CONSENT_VERSION,
              idempotencyKey: key(),
            });
            assert.equal(result.delivery.enabled, false);
            assert.equal((await boxes(on.id)).at(-1).state, "cancelled");
            const disabled = await staffCall("disable", {
              policyRevision: (await pol()).revision,
              idempotencyKey: key(),
            });
            assert.equal(disabled.policy.enabled, false);
          } finally {
            await db.tx(staff, org, (c) =>
              c.query(
                "DELETE FROM os_comments WHERE org_id=$1 AND id='quota-fixture'",
                [org],
              ),
            );
          }
        },
      );
      await t.test(
        "policy export is bounded historical metadata; restore disables authority with fresh epoch and no previews",
        async () => {
          const exported = await db.tx(staff, org, (c) =>
              exportDelivery(c, org),
            ),
            normalized = restoredDelivery({ delivery: exported });
          const recovered = "synthetic-recovered-delivery";
          await db.tx(staff, recovered, async (c) => {
            await c.query(
              "INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional recovery',$1,'USD','UTC')",
              [recovered],
            );
            await restoreDelivery(c, recovered, staff, normalized);
            const p = (
              await c.query(
                "SELECT * FROM os_participation_delivery_policies WHERE org_id=$1",
                [recovered],
              )
            ).rows[0];
            assert.equal(p.enabled, false);
            assert.notEqual(p.epoch, (await pol()).epoch);
            assert.equal(p.last_command, null);
            assert.equal(
              (
                await c.query(
                  "SELECT * FROM os_participation_delivery_previews WHERE org_id=$1",
                  [recovered],
                )
              ).rows.length,
              0,
            );
          });
          assert.equal(
            (
              await db.tx(staff, null, (c) =>
                c.query("SELECT * FROM os_participation_delivery_policies"),
              )
            ).rows.length,
            0,
          );
          assert.ok(
            (await db.tx(staff, org, (c) => logicalBackupBytes(c, org))) > 0,
          );
        },
      );
    } finally {
      await db?.close();
      await migration?.close();
      await owner.pool.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
      assert.equal(
        (
          await owner.pool.query(
            "SELECT 1 FROM pg_namespace WHERE nspname=$1",
            [schema],
          )
        ).rows.length,
        0,
      );
      await owner.close();
    }
  },
);
