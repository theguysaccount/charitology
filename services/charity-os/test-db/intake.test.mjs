import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { database, saveRecord } from "../lib/database.mjs";
import { intakeRoutes, publicIntakeRoutes } from "../lib/intake.mjs";
import {
  exportIntake,
  restoredIntake,
  restoreIntake,
} from "../lib/intake-backup.mjs";
import { validateRecord } from "../lib/modules.mjs";
import { createHandler } from "../lib/handler.mjs";
import { hash } from "../lib/security.mjs";

const configured = !!(process.env.DATABASE_URL && process.env.OS_DATABASE_URL);
const quote = (s) => '"' + s.replaceAll('"', '""') + '"';
function direct(value) {
  const u = new URL(value);
  if (u.hostname.endsWith(".neon.tech"))
    u.hostname = u.hostname.replace(/-pooler(?=\.)/, "");
  return u.toString();
}
const settings = {
  origin: "https://os.example.invalid",
  secret: "synthetic-intake-secret-at-least-32-characters",
};
const admin = { role: "admin", userId: "synthetic-admin", programIds: [] };
const err = (code) => (e) => e.code === code;

test(
  "actual Postgres public intake preserves approval, private receipts, atomic review, quotas and recovery boundaries",
  {
    skip: configured
      ? false
      : "Set isolated owner and constrained app database URLs.",
    timeout: process.env.OS_INTAKE_BROWSER_PORT ? 1200000 : 600000,
  },
  async (t) => {
    const schema = "os_intake_" + randomBytes(8).toString("hex"),
      org = "synthetic-intake-org",
      restoreOrg = "synthetic-restored-org",
      user = admin.userId;
    const owner = database(process.env.DATABASE_URL);
    let migration, db;
    try {
      await owner.pool.query(`CREATE SCHEMA ${quote(schema)}`);
      migration = database(direct(process.env.DATABASE_URL), { schema });
      await migration.migrate();
      if (
        process.env.OS_INTAKE_BROWSER_ONLY === "1" &&
        process.env.OS_INTAKE_BROWSER_ADMIN === "1" &&
        process.env.OS_INTAKE_BROWSER_PORT
      ) {
        const { getMigrations } = await import("better-auth/db/migration");
        const { magicLink } = await import("better-auth/plugins/magic-link");
        const migrations = await getMigrations({
          database: migration.pool,
          rateLimit: { enabled: true, storage: "database" },
          plugins: [
            magicLink({
              storeToken: "hashed",
              sendMagicLink: async () => {
                throw new Error("Browser fixture does not send mail.");
              },
            }),
          ],
          logger: { disabled: true },
        });
        assert.equal(
          /(?:"public"\s*\.|\bpublic\s*\.)/i.test(
            await migrations.compileMigrations(),
          ),
          false,
          "Browser fixture auth migrations must remain in the temporary schema.",
        );
        await migrations.runMigrations();
      }
      const roleName = decodeURIComponent(
        new URL(process.env.OS_DATABASE_URL).username,
      );
      assert.notEqual(
        roleName,
        decodeURIComponent(new URL(process.env.DATABASE_URL).username),
      );
      await owner.pool.query(
        `GRANT USAGE ON SCHEMA ${quote(schema)} TO ${quote(roleName)}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${quote(schema)} TO ${quote(roleName)}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${quote(schema)} TO ${quote(roleName)}`,
      );
      db = database(direct(process.env.OS_DATABASE_URL), { schema });
      const privileges = (
        await db.pool.query(
          "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
        )
      ).rows[0];
      assert.deepEqual(privileges, { rolsuper: false, rolbypassrls: false });
      const policies = (
        await db.pool.query(
          "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace=current_schema()::regnamespace AND relname=ANY($1::text[]) ORDER BY relname",
          [["os_publications", "os_intake"]],
        )
      ).rows;
      assert.equal(policies.length, 2);
      assert.ok(
        policies.every((r) => r.relrowsecurity && r.relforcerowsecurity),
      );
      const makeOrg = (id) =>
        db.tx(user, id, (c) =>
          c.query(
            "INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Synthetic intake test',$1,'USD','UTC')",
            [id],
          ),
        );
      await makeOrg(org);
      await makeOrg(restoreOrg);
      const questions = [
        {
          key: "name",
          label: "Operational name",
          type: "text",
          required: true,
        },
        {
          key: "email",
          label: "Operational email",
          type: "text",
          required: true,
        },
        { key: "count", label: "Count", type: "number", required: true },
        {
          key: "choice",
          label: "Can we reply about this request?",
          type: "boolean",
          required: true,
        },
      ];
      const base = (moduleId, id, data, status) => ({
        orgId: org,
        id,
        moduleId,
        data,
        status,
        revision: 4,
        ownerId: "synthetic-author",
        lastEditedBy: "synthetic-author",
        approval: {
          revision: 4,
          status: "approved",
          actorId: "synthetic-independent-reviewer",
        },
        snapshot: null,
        source: null,
      });
      if (
        process.env.OS_INTAKE_BROWSER_ONLY === "1" &&
        process.env.OS_INTAKE_BROWSER_PORT
      ) {
        await serveBrowserFixture({ db, makeOrg, base, settings, user });
        return;
      }
      const form = base(
        "forms",
        "synthetic-form",
        {
          title: "Synthetic operational interest",
          kind: "form",
          version: 1,
          definition: JSON.stringify(questions),
          purpose: "Review this operational request and arrange a response.",
          retentionUntil: "2099-01-01",
          consentRequired: true,
          anonymous: false,
        },
        "published",
      );
      const target = base(
        "events",
        "synthetic-session",
        {
          title: "Synthetic test session",
          kind: "session",
          startAt: "2030-01-01T10:00:00Z",
          endAt: "2030-01-01T11:00:00Z",
          timeZone: "UTC",
          capacity: 1,
        },
        "open",
      );
      for (const r of [form, target]) {
        r.data = validateRecord(r.moduleId, r.data, {
          orgId: org,
          recordId: r.id,
          status: r.status,
          records: [form, target],
        });
        await db.tx(user, org, (c) => saveRecord(c, r));
      }
      const callAdmin = async (
        tail,
        input,
        method = "POST",
        query = "",
        targetOrg = org,
      ) => {
        const response = await db.tx(
          user,
          targetOrg,
          (c) =>
            intakeRoutes({
              c,
              org: targetOrg,
              user,
              member: admin,
              tail: `intake/${tail}`,
              method,
              input,
              url: new URL(
                `${settings.origin}/api/orgs/${targetOrg}/intake/${tail}${query}`,
              ),
              settings,
            }),
          { lock: true },
        );
        return { response, value: await response.json() };
      };
      const published = await callAdmin("publications", {
        recordId: form.id,
        revision: 4,
        kind: "event-interest",
        targetId: target.id,
        targetRevision: 4,
      });
      const publicationId = published.value.publication.id;
      const publicCall = async (suffix = "", value, opts = {}) => {
        const targetOrg = opts.org || org,
          pub = opts.pub || publicationId;
        const request = new Request(
          `${settings.origin}/api/public/intake/${targetOrg}/${pub}${suffix}`,
          value === undefined
            ? {}
            : {
                method: "POST",
                headers: {
                  origin: settings.origin,
                  "content-type": "application/json",
                  "x-forwarded-for": "192.0.2.123",
                },
                body: JSON.stringify(value),
              },
        );
        const response = await publicIntakeRoutes({ request, db, settings });
        return { response, value: await response.json() };
      };
      const requestAnswers = (n = 1) => ({
        name: `Synthetic requester ${n}`,
        email: `synthetic-${n}@example.invalid`,
        count: 0,
        choice: false,
      });
      const submit = (key, n = 1) =>
        publicCall("/submissions", {
          answers: requestAnswers(n),
          consent: true,
          website: "",
          idempotencyKey: key,
        });
      let first, submission, pending;

      await t.test(
        "only deliberately published schema is public; no anonymous tenant reads",
        async () => {
          const result = (await publicCall()).value;
          assert.equal(
            result.publication.organizationName,
            "Synthetic intake test",
          );
          assert.equal(result.publication.questions.length, 4);
          for (const forbidden of [
            "approval",
            "actorId",
            "record_id",
            "receipt_hash",
            "answers",
            "target_id",
          ])
            assert.equal(
              JSON.stringify(result).includes(`\"${forbidden}\"`),
              false,
            );
          assert.equal(
            Number(
              (await db.pool.query("SELECT count(*) AS n FROM os_publications"))
                .rows[0].n,
            ),
            0,
          );
          assert.equal(
            Number(
              (await db.pool.query("SELECT count(*) AS n FROM os_intake"))
                .rows[0].n,
            ),
            0,
          );
          assert.equal(
            Number(
              (
                await db.tx(user, restoreOrg, (c) =>
                  c.query(
                    "SELECT count(*) AS n FROM os_publications WHERE org_id=$1",
                    [org],
                  ),
                )
              ).rows[0].n,
            ),
            0,
          );
          await assert.rejects(
            publicCall("", undefined, { org: restoreOrg }),
            err("intake_unavailable"),
          );
          let authCalls = 0;
          const handle = createHandler({
            settings,
            db,
            auth: {
              api: {
                getSession: async () => {
                  authCalls++;
                  return null;
                },
              },
            },
            send: async () => {
              throw new Error("No fixture delivery.");
            },
          });
          assert.equal(
            (
              await handle(
                new Request(
                  `${settings.origin}/api/public/intake/${org}/${publicationId}`,
                ),
              )
            ).status,
            200,
          );
          assert.equal(
            authCalls,
            0,
            "Public schema dispatch precedes session lookup.",
          );
          assert.equal(
            (
              await handle(
                new Request(
                  `${settings.origin}/api/orgs/${org}/intake/submissions`,
                ),
              )
            ).status,
            401,
          );
          const authenticated = createHandler({
            settings,
            db,
            auth: {
              api: {
                getSession: async () => ({
                  session: { id: "synthetic-session" },
                  user: { id: user },
                }),
              },
            },
            send: async () => {
              throw new Error("No fixture delivery.");
            },
          });
          assert.equal(
            (
              await authenticated(
                new Request(
                  `${settings.origin}/api/orgs/${org}/intake/publications`,
                  {
                    method: "POST",
                    headers: {
                      origin: settings.origin,
                      "content-type": "application/json",
                    },
                    body: "{}",
                  },
                ),
              )
            ).status,
            403,
            "Admin writes retain the normal CSRF gate.",
          );
        },
      );

      await t.test(
        "concurrent identical submissions create one private intent and disclose the raw receipt once",
        async () => {
          const results = await Promise.all([
            submit("synthetic-concurrent-request"),
            submit("synthetic-concurrent-request"),
          ]);
          assert.deepEqual(
            results.map((r) => r.response.status).sort(),
            [200, 201],
          );
          first = results.find((r) => r.response.status === 201).value;
          assert.match(first.receipt, /^[A-Za-z0-9_-]{43}$/);
          assert.ok(first.receiptUrl.includes(`#${org}.${publicationId}.`));
          assert.equal(
            results.find((r) => r.response.status === 200).value.receipt,
            undefined,
          );
          const row = (
            await db.tx(user, org, (c) =>
              c.query("SELECT * FROM os_intake WHERE org_id=$1", [org]),
            )
          ).rows;
          assert.equal(row.length, 1);
          submission = row[0];
          assert.equal(submission.receipt_hash, hash(first.receipt));
          assert.equal(
            JSON.stringify(submission).includes(first.receipt),
            false,
          );
          assert.equal(
            JSON.stringify(submission).includes("192.0.2.123"),
            false,
          );
          await assert.rejects(
            submit("synthetic-concurrent-request", 2),
            err("intake_identity"),
          );
          assert.deepEqual(
            (
              await publicCall("/receipt", {
                receipt: first.receipt,
                action: "status",
              })
            ).value,
            { ok: true, status: "pending" },
          );
          await assert.rejects(
            publicCall(
              "/receipt",
              { receipt: first.receipt, action: "status" },
              { org: restoreOrg },
            ),
            err("intake_receipt"),
          );
        },
      );

      await t.test(
        "review and conversion serialize expected revisions, create only drafts and never duplicate conversion",
        async () => {
          await assert.rejects(
            callAdmin(`submissions/${submission.id}/review`, {
              revision: 1,
              action: "convert",
            }),
            err("intake_review"),
          );
          const reviewed = await callAdmin(
            `submissions/${submission.id}/review`,
            { revision: 1, action: "review" },
          );
          const attempts = await Promise.allSettled(
            [1, 2].map(() =>
              callAdmin(`submissions/${submission.id}/review`, {
                revision: reviewed.value.submission.revision,
                action: "convert",
              }),
            ),
          );
          assert.equal(
            attempts.filter((r) => r.status === "fulfilled").length,
            1,
          );
          assert.equal(
            attempts.find((r) => r.status === "rejected").reason.code,
            "revision",
          );
          const converted = attempts.find((r) => r.status === "fulfilled").value
            .value;
          assert.equal(converted.records.length, 2);
          assert.ok(converted.records.every((r) => r.status === "draft"));
          assert.equal(converted.submission.convertedIds.length, 2);
          const rows = (
            await db.tx(user, org, (c) =>
              c.query(
                "SELECT * FROM os_records WHERE org_id=$1 AND id=ANY($2::text[])",
                [org, converted.records.map((r) => r.id)],
              ),
            )
          ).rows;
          assert.ok(
            rows.every((r) => r.approval === null && r.status === "draft"),
          );
          assert.equal(
            rows.find((r) => r.module_id === "contacts").data.contactPreference,
            "permission-needed",
          );
          const history = (
            await db.tx(user, org, (c) =>
              c.query(
                "SELECT detail FROM os_events WHERE org_id=$1 AND action='record.created' AND record_id=ANY($2::text[])",
                [org, converted.records.map((r) => r.id)],
              ),
            )
          ).rows;
          assert.equal(history.length, 2);
          assert.ok(
            history.every(
              (r) =>
                r.detail.viaIntake === submission.id &&
                !Object.hasOwn(r.detail, "answers"),
            ),
          );
          // Synthetic active registration consumes the one place; conversion of a
          // different request must now fail before its new contact can be retained.
          await db.tx(user, org, (c) =>
            c.query(
              "UPDATE os_records SET status='scheduled' WHERE org_id=$1 AND id=$2",
              [org, rows.find((r) => r.module_id === "events").id],
            ),
          );
        },
      );

      await t.test(
        "capacity rejection rolls back contacts; erasing queued answers releases pending capacity",
        async () => {
          pending = (await submit("synthetic-capacity-request", 2)).value;
          const queue = (await callAdmin("submissions", undefined, "GET"))
            .value;
          const row = queue.submissions.find((r) => r.status === "pending");
          const reviewed = (
            await callAdmin(`submissions/${row.id}/review`, {
              revision: row.revision,
              action: "review",
            })
          ).value.submission;
          const before = Number(
            (
              await db.tx(user, org, (c) =>
                c.query(
                  "SELECT count(*) AS n FROM os_records WHERE org_id=$1",
                  [org],
                ),
              )
            ).rows[0].n,
          );
          await assert.rejects(
            callAdmin(`submissions/${row.id}/review`, {
              revision: reviewed.revision,
              action: "convert",
            }),
          );
          assert.equal(
            Number(
              (
                await db.tx(user, org, (c) =>
                  c.query(
                    "SELECT count(*) AS n FROM os_records WHERE org_id=$1",
                    [org],
                  ),
                )
              ).rows[0].n,
            ),
            before,
          );
          const erased = (
            await callAdmin(`submissions/${row.id}/review`, {
              revision: reviewed.revision,
              action: "erase",
            })
          ).value.submission;
          assert.deepEqual(erased.answers, {});
          assert.ok(erased.erasedAt);
          assert.equal(erased.status, "dismissed");
          const stored = (
            await db.tx(user, org, (c) =>
              c.query("SELECT * FROM os_intake WHERE org_id=$1 AND id=$2", [
                org,
                row.id,
              ]),
            )
          ).rows[0];
          assert.equal(stored.ip_hash, null);
          assert.equal(stored.payload_hash, null);
          assert.equal(
            Number(
              (
                await db.tx(user, org, (c) =>
                  c.query(
                    "SELECT count(*) AS n FROM os_intake WHERE org_id=$1 AND status IN ('pending','reviewed')",
                    [org],
                  ),
                )
              ).rows[0].n,
            ),
            0,
          );
          await assert.rejects(
            callAdmin(`submissions/${row.id}/review`, {
              revision: erased.revision,
              action: "convert",
            }),
            err("intake_erased"),
          );
        },
      );

      await t.test(
        "source or target revision changes withdraw acceptance automatically, without breaking private status",
        async () => {
          await db.tx(user, org, (c) =>
            c.query(
              "UPDATE os_records SET revision=revision+1 WHERE org_id=$1 AND id=$2",
              [org, form.id],
            ),
          );
          await assert.rejects(publicCall(), err("intake_unavailable"));
          await assert.rejects(
            submit("synthetic-after-edit-request", 3),
            err("intake_unavailable"),
          );
          assert.equal(
            (
              await publicCall("/receipt", {
                receipt: first.receipt,
                action: "status",
              })
            ).value.status,
            "converted",
          );
          await db.tx(user, org, (c) =>
            c.query(
              "UPDATE os_records SET revision=4 WHERE org_id=$1 AND id=$2",
              [org, form.id],
            ),
          );
          await db.tx(user, org, (c) =>
            c.query(
              "UPDATE os_records SET status='completed' WHERE org_id=$1 AND id=$2",
              [org, target.id],
            ),
          );
          await assert.rejects(publicCall(), err("intake_unavailable"));
          await db.tx(user, org, (c) =>
            c.query(
              "UPDATE os_records SET status='open' WHERE org_id=$1 AND id=$2",
              [org, target.id],
            ),
          );
        },
      );

      await t.test(
        "backup restore keeps answers and erasures private while stripping public capabilities and publication authority",
        async () => {
          const handle = createHandler({
            settings,
            db,
            auth: {
              api: {
                getSession: async () => {
                  throw new Error("Public intake must not inspect a session.");
                },
              },
            },
            send: async () => {
              throw new Error("No fixture delivery.");
            },
          });
          const posted = await handle(
            new Request(
              `${settings.origin}/api/public/intake/${org}/${publicationId}/submissions`,
              {
                method: "POST",
                headers: {
                  origin: settings.origin,
                  "content-type": "application/json",
                },
                body: JSON.stringify({
                  answers: requestAnswers(4),
                  consent: true,
                  website: "",
                  idempotencyKey: "synthetic-handler-request",
                }),
              },
            ),
          );
          assert.equal(posted.status, 201);
          await publicCall("/receipt", {
            receipt: (await posted.json()).receipt,
            action: "cancel",
          });
          const fresh = await submit("synthetic-backup-request", 3);
          const exported = await db.tx(user, org, (c) => exportIntake(c, org));
          for (const forbidden of [
            "receipt_hash",
            "receiptHash",
            "idempotency_hash",
            "payload_hash",
            "ip_hash",
            first.receipt,
            fresh.value.receipt,
          ])
            assert.equal(JSON.stringify(exported).includes(forbidden), false);
          const restored = restoredIntake({ intake: exported });
          await db.tx(
            user,
            restoreOrg,
            (c) => restoreIntake(c, restoreOrg, user, restored),
            { lock: true },
          );
          await assert.rejects(
            publicCall("", undefined, { org: restoreOrg }),
            err("intake_unavailable"),
          );
          await assert.rejects(
            publicCall(
              "/receipt",
              { receipt: fresh.value.receipt, action: "status" },
              { org: restoreOrg },
            ),
            err("intake_receipt"),
          );
          const saved = (
            await db.tx(user, restoreOrg, (c) =>
              c.query("SELECT * FROM os_intake WHERE org_id=$1 ORDER BY id", [
                restoreOrg,
              ]),
            )
          ).rows;
          assert.ok(
            saved.some(
              (r) =>
                r.answers.email === "synthetic-3@example.invalid" &&
                r.status === "pending",
            ),
          );
          assert.ok(
            saved.some(
              (r) => r.erased_at && Object.keys(r.answers).length === 0,
            ),
          );
          assert.ok(
            saved.every(
              (r) =>
                r.receipt_hash === null &&
                r.idempotency_hash === null &&
                r.ip_hash === null &&
                r.revision === 1 &&
                r.reviewed_by === null,
            ),
          );
        },
      );

      await t.test(
        "daily, pending-count and full Postgres row-byte limits reject before retaining another request",
        async () => {
          const seed = (n, answers, state, offset = "1 day") =>
            db.tx(user, org, (c) =>
              c.query(
                "INSERT INTO os_intake(org_id,id,publication_id,answers,consent_at,status,created_at) SELECT $1,'synthetic-limit-'||n,$2,$3,now(),$4,now()-$6::interval FROM generate_series(1,$5) n",
                [org, publicationId, JSON.stringify(answers), state, n, offset],
              ),
            );
          const clear = () =>
            db.tx(user, org, (c) =>
              c.query(
                "DELETE FROM os_intake WHERE org_id=$1 AND id LIKE 'synthetic-limit-%'",
                [org],
              ),
            );
          await seed(100, requestAnswers(5), "cancelled", "0 days");
          await assert.rejects(
            submit("synthetic-daily-limit-request", 5),
            err("intake_daily"),
          );
          await clear();
          await seed(1000, requestAnswers(5), "pending");
          await assert.rejects(
            submit("synthetic-count-limit-request", 5),
            err("intake_quota"),
          );
          await clear();
          const manyQuestions = Array.from({ length: 30 }, (_, n) => ({
            key: `q${n}`,
            label: `Operational option ${n}`,
            type: "text",
          }));
          const largeForm = base(
            "forms",
            "synthetic-large-form",
            { ...form.data, definition: JSON.stringify(manyQuestions) },
            "published",
          );
          await db.tx(user, org, (c) => saveRecord(c, largeForm));
          const largePublication = (
            await callAdmin("publications", {
              recordId: largeForm.id,
              revision: 4,
              kind: "contact",
            })
          ).value.publication.id;
          const largeAnswers = Object.fromEntries(
            manyQuestions.map((q) => [q.key, "x".repeat(300)]),
          );
          await db.tx(user, org, (c) =>
            c.query(
              "INSERT INTO os_intake(org_id,id,publication_id,answers,consent_at,status,created_at) SELECT $1,'synthetic-limit-'||n,$2,$3,now(),'pending',now()-interval '1 day' FROM generate_series(1,900) n",
              [org, largePublication, JSON.stringify(largeAnswers)],
            ),
          );
          const actual = (
            await db.tx(user, org, (c) =>
              c.query(
                "SELECT count(*) AS n,sum(octet_length(to_jsonb(i)::text)) AS bytes FROM os_intake i WHERE org_id=$1 AND status IN ('pending','reviewed')",
                [org],
              ),
            )
          ).rows[0];
          assert.equal(Number(actual.n), 901);
          assert.ok(Number(actual.bytes) > 8 * 1024 * 1024);
          await assert.rejects(
            submit("synthetic-bytes-limit-request", 5),
            err("intake_quota"),
          );
          await clear();
          await db.tx(user, org, (c) =>
            c.query(
              "INSERT INTO os_publications(org_id,id,record_id,source_revision,kind,schema,created_by) SELECT $1,'synthetic-publication-limit-'||n,$2,4,'contact',$3,$4 FROM generate_series(1,100) n",
              [
                org,
                form.id,
                JSON.stringify({
                  title: form.data.title,
                  purpose: form.data.purpose,
                  questions,
                  retentionUntil: "2099-01-01",
                  kind: "contact",
                }),
                user,
              ],
            ),
          );
          await assert.rejects(
            callAdmin("publications", {
              recordId: form.id,
              revision: 4,
              kind: "contact",
            }),
            err("intake_daily"),
          );
          await db.tx(user, org, (c) =>
            c.query(
              "DELETE FROM os_publications WHERE org_id=$1 AND id LIKE 'synthetic-publication-limit-%'",
              [org],
            ),
          );
        },
      );

      await t.test(
        "public cancellation and admin withdrawal/erasure still commit after the audit reserve is exhausted",
        async () => {
          // Server-generated synthetic padding avoids transferring large payloads.
          await db.tx(user, org, (c) =>
            c.query(
              "INSERT INTO os_events(org_id,actor_id,action,detail) VALUES($1,$2,'synthetic.quota',jsonb_build_object('padding',repeat('x',62*1024*1024)))",
              [org, user],
            ),
          );
          const cancel = (
            await publicCall("/receipt", {
              receipt: first.receipt,
              action: "cancel",
            })
          ).value;
          assert.deepEqual(cancel, { ok: true, status: "cancelled" });
          const remaining = (
            await callAdmin("submissions", undefined, "GET")
          ).value.submissions.find((r) => r.status === "pending");
          const erased = (
            await callAdmin(`submissions/${remaining.id}/review`, {
              revision: remaining.revision,
              action: "erase",
            })
          ).value.submission;
          assert.deepEqual(erased.answers, {});
          assert.equal(erased.status, "dismissed");
          assert.equal(
            (await callAdmin(`publications/${publicationId}/withdraw`, {}))
              .value.withdrawn,
            true,
          );
          await assert.rejects(publicCall(), err("intake_unavailable"));
          const drafts = (
            await db.tx(user, org, (c) =>
              c.query(
                "SELECT id FROM os_records WHERE org_id=$1 AND module_id='contacts'",
                [org],
              ),
            )
          ).rows;
          assert.equal(
            drafts.length,
            1,
            "Withdrawing a request does not silently delete independently handled drafts.",
          );
        },
      );

      if (process.env.OS_INTAKE_BROWSER_PORT)
        await serveBrowserFixture({ db, makeOrg, base, settings, user });
    } finally {
      await db?.close();
      await migration?.close();
      await owner.pool.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
      await owner.close();
    }
  },
);

async function serveBrowserFixture({ db, makeOrg, base, settings, user }) {
  const { createServer } = await import("node:http");
  const { readFile, access, unlink } = await import("node:fs/promises");
  const { createHandler } = await import("../lib/handler.mjs");
  const port = Number(process.env.OS_INTAKE_BROWSER_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Use a valid nonprivileged fixture port.");
  const origin = `http://localhost:${port}`,
    browserOrg = "synthetic-browser-org",
    adminMode = process.env.OS_INTAKE_BROWSER_ADMIN === "1";
  if (adminMode && process.env.OS_INTAKE_BROWSER_ONLY !== "1")
    throw new Error(
      "Synthetic admin mode requires the explicit browser-only fixture.",
    );
  await makeOrg(browserOrg);
  if (adminMode) {
    await db.tx(user, browserOrg, async (c) => {
      await c.query(
        'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,\'Synthetic fixture operator\',\'synthetic-operator@example.invalid\',true,now(),now())',
        [user],
      );
      await c.query(
        "INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'owner')",
        [browserOrg, user],
      );
    });
  }
  const form = base(
    "forms",
    "synthetic-browser-form",
    {
      title: "Synthetic browser request",
      kind: "form",
      version: 1,
      definition: JSON.stringify([
        { key: "name", label: "Synthetic name", type: "text", required: true },
        {
          key: "email",
          label: "Synthetic email",
          type: "text",
          required: true,
        },
      ]),
      purpose:
        "Test public participation without real people or email delivery.",
      retentionUntil: "2099-01-01",
      consentRequired: true,
      anonymous: false,
    },
    "published",
  );
  form.orgId = browserOrg;
  await db.tx(user, browserOrg, (c) => saveRecord(c, form));
  const fixtureSettings = { ...settings, origin };
  const publication = await db.tx(
    user,
    browserOrg,
    async (c) =>
      (
        await intakeRoutes({
          c,
          org: browserOrg,
          user,
          member: admin,
          tail: "intake/publications",
          method: "POST",
          input: { recordId: form.id, revision: 4, kind: "contact" },
          settings: fixtureSettings,
        })
      ).json(),
    { lock: true },
  );
  const handle = createHandler({
    settings: fixtureSettings,
    db,
    // This explicit loopback-only acceptance mode is not an authentication test.
    // Public requests dispatch before this stub; all admin CSRF and role checks remain real.
    auth: {
      api: {
        getSession: async () =>
          adminMode
            ? {
                user: {
                  id: user,
                  name: "Synthetic fixture operator",
                  email: "synthetic-operator@example.invalid",
                },
                session: {
                  id: "synthetic-browser-admin-session",
                  userId: user,
                },
              }
            : null,
      },
    },
    send: async () => {
      throw new Error("Fixture does not send mail.");
    },
  });
  const root = new URL("../public/", import.meta.url),
    stopFile = `/tmp/charitology-intake-${port}.stop`,
    withdrawFile = `/tmp/charitology-intake-${port}.withdraw`;
  await unlink(stopFile).catch(() => {});
  await unlink(withdrawFile).catch(() => {});
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, origin);
      if (url.pathname.startsWith("/api/")) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const request = new Request(url, {
          method: req.method,
          headers: req.headers,
          ...(req.method !== "GET" && req.method !== "HEAD"
            ? { body: Buffer.concat(chunks) }
            : {}),
        });
        const result = await handle(request);
        res.writeHead(result.status, Object.fromEntries(result.headers));
        res.end(Buffer.from(await result.arrayBuffer()));
      } else {
        const path = url.pathname.startsWith("/p/")
          ? "intake.html"
          : adminMode && ["/", "/app"].includes(url.pathname)
            ? "index.html"
            : url.pathname.slice(1);
        if (
          !/^(?:intake\.(?:html|js)|api\.js|os\.css|mark(?:-dark)?\.svg|fonts\/[a-zA-Z0-9_.-]+)$/.test(
            path,
          ) &&
          !(adminMode && /^(?:index\.html|app\.js|model\.js)$/.test(path))
        ) {
          res.writeHead(404);
          res.end();
          return;
        }
        const bytes = await readFile(new URL(path, root));
        const type = path.endsWith(".html")
          ? "text/html"
          : path.endsWith(".js")
            ? "text/javascript"
            : path.endsWith(".css")
              ? "text/css"
              : path.endsWith(".svg")
                ? "image/svg+xml"
                : "font/woff2";
        res.writeHead(200, {
          "content-type": type,
          "cache-control": "no-store",
        });
        res.end(bytes);
      }
    } catch {
      res.writeHead(500);
      res.end("Synthetic fixture request failed.");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  console.log(
    `Synthetic intake browser fixture: ${origin}/p/${browserOrg}.${publication.publication.id}`,
  );
  if (adminMode)
    console.log(
      `Synthetic admin acceptance fixture (auth stub, no real sign-in or mail): ${origin}/#intake`,
    );
  console.log(
    `Create ${withdrawFile} to withdraw its source; create ${stopFile} to stop and remove its temporary schema. Maximum wait: 10 minutes.`,
  );
  try {
    const until = Date.now() + 600000;
    while (Date.now() < until) {
      if (
        await access(stopFile).then(
          () => true,
          () => false,
        )
      )
        break;
      if (
        await access(withdrawFile).then(
          () => true,
          () => false,
        )
      ) {
        await db.tx(user, browserOrg, (c) =>
          c.query(
            "UPDATE os_records SET status='closed',revision=revision+1 WHERE org_id=$1 AND id=$2",
            [browserOrg, form.id],
          ),
        );
        await unlink(withdrawFile);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await unlink(stopFile).catch(() => {});
    await unlink(withdrawFile).catch(() => {});
  }
}
