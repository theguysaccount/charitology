import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { getMigrations } from "better-auth/db/migration";
import { magicLink } from "better-auth/plugins/magic-link";
import { database } from "../lib/database.mjs";
import { authentication } from "../lib/auth.mjs";
import { createHandler } from "../lib/handler.mjs";
import { getModule } from "../lib/modules.mjs";
import { hash } from "../lib/security.mjs";
import { runOrgJobs } from "../lib/jobs.mjs";
import { uploadedBackup, MAX_BACKUP_BYTES } from "../lib/uploads.mjs";

const configured = Boolean(
  process.env.DATABASE_URL && process.env.OS_DATABASE_URL,
);
const quote = (value) => '"' + String(value).replaceAll('"', '""') + '"';
function directConnection(value) {
  const url = new URL(value);
  if (url.hostname.endsWith(".neon.tech"))
    url.hostname = url.hostname.replace(/-pooler(?=\.)/, "");
  return url.toString();
}

test(
  "real Postgres, Better Auth and isolated organization workflows",
  {
    skip: configured
      ? false
      : "Set private owner DATABASE_URL and constrained OS_DATABASE_URL for isolated-schema integration.",
    timeout: 1200000,
  },
  async (t) => {
    const suffix = randomBytes(5).toString("hex");
    const schema = `os_test_${Date.now().toString(36)}_${suffix}`;
    assert.match(schema, /^os_test_[a-z0-9_]+$/);
    const owner = database(process.env.DATABASE_URL);
    let migrationDb, db;
    const settings = {
      origin: "http://localhost:4344",
      secret: "synthetic-runtime-secret-at-least-thirty-two-characters",
      encryptionKey: "synthetic-test-integration-encryption-key",
      cronSecret: "synthetic-cron-secret",
      relaySecret: "synthetic-unused-relay",
      production: false,
    };
    const sent = [];
    const send = async (message, key) => {
      assert.ok(
        String(message.to).endsWith("@example.invalid"),
        "Only synthetic invalid recipients are permitted.",
      );
      sent.push({ message, key });
      return { accepted: true };
    };
    try {
      await owner.pool.query(`CREATE SCHEMA ${quote(schema)}`);
      migrationDb = database(directConnection(process.env.DATABASE_URL), {
        schema,
      });
      assert.equal(
        (await migrationDb.pool.query("SELECT current_schema() AS schema"))
          .rows[0].schema,
        schema,
        "Migration search path must be isolated.",
      );
      const migrations = await getMigrations({
        database: migrationDb.pool,
        rateLimit: { enabled: true, storage: "database" },
        plugins: [
          magicLink({ storeToken: "hashed", sendMagicLink: async () => {} }),
        ],
        logger: { disabled: true },
      });
      const compiled = await migrations.compileMigrations();
      assert.ok(
        !/(?:"public"\s*\.|\bpublic\s*\.)/i.test(compiled),
        "Never migrate the public schema.",
      );
      await migrations.runMigrations();
      await migrationDb.migrate();
      const appRole = decodeURIComponent(
        new URL(process.env.OS_DATABASE_URL).username,
      );
      assert.ok(
        appRole &&
          appRole !==
            decodeURIComponent(new URL(process.env.DATABASE_URL).username),
        "Use a distinct constrained application role.",
      );
      await owner.pool.query(
        `GRANT USAGE ON SCHEMA ${quote(schema)} TO ${quote(appRole)}`,
      );
      await owner.pool.query(
        `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${quote(schema)} TO ${quote(appRole)}`,
      );
      await owner.pool.query(
        `GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${quote(schema)} TO ${quote(appRole)}`,
      );
      db = database(directConnection(process.env.OS_DATABASE_URL), { schema });
      const roleInfo = (
        await db.pool.query(
          "SELECT current_schema() AS schema,r.rolsuper,r.rolbypassrls FROM pg_roles r WHERE r.rolname=current_user",
        )
      ).rows[0];
      assert.equal(roleInfo.schema, schema);
      assert.equal(roleInfo.rolsuper, false);
      assert.equal(roleInfo.rolbypassrls, false);
      const auth = authentication({ settings, db, send });
      const rawHandle = createHandler({ settings, db, auth, send });
      let requestNumber = 0;
      async function handle(request) {
        const number = ++requestNumber,
          started = Date.now();
        const route = new URL(request.url).pathname
          .replace(/(\/orgs\/)[^/]+/, "$1:org")
          .replace(/(\/records\/)[^/]+/, "$1:record")
          .replace(/(\/members\/)[^/]+/, "$1:member")
          .replace(/(\/invitations\/)[^/]+/, "$1:invitation");
        console.log(
          `# runtime request ${number} start ${request.method} ${route}`,
        );
        let timer;
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => {
            console.error(
              "# runtime request timeout",
              JSON.stringify({
                number,
                route,
                pool: {
                  total: db.pool.totalCount,
                  idle: db.pool.idleCount,
                  waiting: db.pool.waitingCount,
                },
              }),
            );
            owner.pool
              .query(
                "SELECT state,wait_event_type,wait_event,EXTRACT(EPOCH FROM now()-query_start)::int AS query_seconds,cardinality(pg_blocking_pids(pid)) AS blockers FROM pg_stat_activity WHERE datname=current_database() AND usename=$1 AND pid<>pg_backend_pid()",
                [appRole],
              )
              .then((result) =>
                console.error(
                  "# runtime database wait metadata",
                  JSON.stringify(result.rows),
                ),
              )
              .catch(() =>
                console.error("# runtime database wait metadata unavailable"),
              );
            reject(
              new Error(
                `Request ${number} ${request.method} ${route} exceeded120 seconds.`,
              ),
            );
          }, 120000);
        });
        try {
          const response = await Promise.race([rawHandle(request), deadline]);
          console.log(
            `# runtime request ${number} end HTTP${response.status} ${Date.now() - started}ms`,
          );
          return response;
        } finally {
          clearTimeout(timer);
        }
      }
      async function call(
        actor,
        path,
        {
          method = "GET",
          body,
          expect = 200,
          origin = settings.origin,
          headers = {},
        } = {},
      ) {
        const h = new Headers(headers);
        h.set("x-forwarded-for", actor?.ip || "198.51.100.1");
        if (actor?.cookie) h.set("cookie", actor.cookie);
        if (method !== "GET" && method !== "HEAD") {
          h.set("origin", origin);
          if (actor?.csrf) h.set("x-csrf-token", actor.csrf);
          if (body !== undefined) h.set("content-type", "application/json");
        }
        const response = await handle(
          new Request(new URL(path, settings.origin), {
            method,
            headers: h,
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          }),
        );
        const type = response.headers.get("content-type") || "";
        const value = type.includes("application/json")
          ? await response.json()
          : await response.text();
        if (expect !== null)
          assert.equal(
            response.status,
            expect,
            `HTTP ${method} ${path.split("?")[0]}: ${value?.code || ""} ${value?.message || ""}`,
          );
        return { response, value };
      }
      let actorNumber = 10;
      async function signIn(label, { scannerCheck = false } = {}) {
        const address = `os-${label}-${suffix}@example.invalid`;
        const ip = `198.51.100.${++actorNumber}`;
        await call({ ip }, "/api/auth/request-link", {
          method: "POST",
          body: { email: address },
        });
        const message = sent.findLast(
          (item) =>
            item.message.purpose === "login" && item.message.to === address,
        )?.message;
        assert.ok(
          message,
          "The real auth plugin must call only the synthetic mail transport.",
        );
        const link = new URL(message.url);
        assert.equal(link.pathname, "/auth/confirm");
        const token = link.searchParams.get("token");
        assert.ok(token);
        const ownSessionCount = async () =>
          Number(
            (
              await migrationDb.pool.query(
                'SELECT count(*) FROM "session" s JOIN "user" u ON s."userId"=u.id WHERE u.email=$1',
                [address],
              )
            ).rows[0].count,
          );
        const countBefore = await ownSessionCount();
        assert.equal(countBefore, 0, "A new synthetic actor has no session.");
        const scanner = await call({ ip }, link.pathname + link.search);
        assert.match(scanner.value, /<form[^>]+method="post"/i);
        assert.equal(
          await ownSessionCount(),
          countBefore,
          "GET must not create a session for this actor.",
        );
        const response = await handle(
          new Request(new URL("/auth/confirm", settings.origin), {
            method: "POST",
            headers: {
              origin: "null",
              "x-forwarded-for": ip,
              "content-type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ token }).toString(),
          }),
        );
        assert.ok(
          [302, 303].includes(response.status),
          `A deliberate confirmation for ${label} must redirect; got HTTP${response.status}.`,
        );
        const cookies = response.headers.getSetCookie();
        assert.ok(
          cookies.some((value) => /httponly/i.test(value)),
          "Session cookie must be HttpOnly.",
        );
        assert.ok(
          cookies.some((value) => /samesite=lax/i.test(value)),
          "Session cookie must restrict cross-site use.",
        );
        const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
        assert.ok(cookie);
        const session = (await call({ cookie, ip }, "/api/session")).value;
        assert.equal(session.user.email, address);
        assert.ok(session.csrfToken);
        assert.equal(
          await ownSessionCount(),
          1,
          "Deliberate confirmation creates exactly one session for this actor.",
        );
        if (scannerCheck) {
          const sessions = await ownSessionCount();
          const replay = await handle(
            new Request(new URL("/auth/confirm", settings.origin), {
              method: "POST",
              headers: {
                origin: settings.origin,
                "x-forwarded-for": ip,
                "content-type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({ token }).toString(),
            }),
          );
          assert.ok([302, 303].includes(replay.status));
          assert.ok(
            new URL(
              replay.headers.get("location"),
              settings.origin,
            ).searchParams.has("error"),
            "Replay must redirect with an error.",
          );
          assert.equal(
            await ownSessionCount(),
            sessions,
            "Replay cannot create another session for this actor.",
          );
          await call({ cookie }, "/api/orgs", {
            method: "POST",
            body: { name: "Wrong origin", currency: "USD", timeZone: "UTC" },
            origin: "https://untrusted.example.invalid",
            expect: 403,
          });
          await call({ cookie }, "/api/orgs", {
            method: "POST",
            body: { name: "No CSRF", currency: "USD", timeZone: "UTC" },
            expect: 403,
          });
        }
        return {
          id: session.user.id,
          email: address,
          cookie,
          csrf: session.csrfToken,
          ip,
        };
      }
      let a,
        b,
        reviewer,
        reader,
        contributor,
        invitee,
        orgA,
        orgB,
        programA,
        programOther,
        task,
        document,
        report,
        backup,
        restoredOrg;
      const path = (org, module, id = "") =>
        `/api/orgs/${org}/modules/${module}/records${id ? `/${id}` : ""}`;
      const data = (module, title, extra = {}) => ({
        title,
        ...(getModule(module).fields.find((f) => f.key === "kind")
          ? {
              kind: getModule(module).fields.find((f) => f.key === "kind")
                .options[0].value,
            }
          : {}),
        ...extra,
      });
      const create = async (actor, org, module, title, extra = {}) =>
        (
          await call(actor, path(org, module), {
            method: "POST",
            body: { data: data(module, title, extra) },
          })
        ).value.record;
      const get = async (actor, org, module, id) =>
        (await call(actor, path(org, module, id))).value.record;

      await t.test(
        "real magic-link scanner safety, deliberate opaque-origin confirmation, replay and CSRF",
        async () => {
          assert.equal((await call(null, "/api/session")).value.user, null);
          a = await signIn("owner-a", { scannerCheck: true });
          // Drain every attempt before propagating an assertion failure so the
          // fixture cannot close its pools while another actor is still signing in.
          const actorResults = await Promise.allSettled(
            ["owner-b", "reviewer", "reader", "contributor", "invitee"].map(
              (label) => signIn(label),
            ),
          );
          const signInFailures = actorResults
            .filter((result) => result.status === "rejected")
            .map((result) => result.reason);
          if (signInFailures.length)
            throw new AggregateError(
              signInFailures,
              "Parallel synthetic sign-ins failed after every attempt settled.",
            );
          [b, reviewer, reader, contributor, invitee] = actorResults.map(
            (result) => result.value,
          );
          orgA = (
            await call(a, "/api/orgs", {
              method: "POST",
              body: {
                name: "Synthetic organization A",
                currency: "USD",
                timeZone: "UTC",
              },
            })
          ).value.org.id;
          orgB = (
            await call(b, "/api/orgs", {
              method: "POST",
              body: {
                name: "Synthetic organization B",
                currency: "USD",
                timeZone: "UTC",
              },
            })
          ).value.org.id;
          await db.tx(a.id, orgA, async (c) => {
            for (const [actor, role] of [
              [reviewer, "program_lead"],
              [reader, "board_reader"],
              [contributor, "contributor"],
            ])
              await c.query(
                "INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,$3)",
                [orgA, actor.id, role],
              );
          });
          const registry = (await call(a, "/api/modules")).value;
          assert.equal(registry.modules.length, 26);
          assert.equal((await call(a, "/api/session")).value.orgs.length, 1);
          assert.equal((await call(b, "/api/session")).value.orgs.length, 1);
        },
      );
      assert.ok(
        orgA && orgB,
        "Authentication and organization setup must pass before dependent workflow cases.",
      );
      await t.test(
        "tenant boundary and constrained-role RLS block foreign records and references",
        async () => {
          programA = await create(a, orgA, "programs", "Program A");
          programOther = await create(a, orgA, "programs", "Another A program");
          const foreign = await create(
            b,
            orgB,
            "programs",
            "Foreign B program",
          );
          await call(b, `/api/orgs/${orgA}/dashboard`, { expect: 403 });
          await call(a, path(orgB, "programs"), { expect: 403 });
          await call(a, path(orgA, "projects"), {
            method: "POST",
            body: {
              data: data("projects", "Bad foreign reference", {
                programId: foreign.id,
              }),
            },
            expect: 422,
          });
          assert.equal(
            (await db.pool.query("SELECT id FROM os_records")).rowCount,
            0,
            "No tenant context means no private rows.",
          );
          await db.tx(a.id, orgA, async (c) => {
            assert.equal(
              (
                await c.query("SELECT id FROM os_records WHERE org_id=$1", [
                  orgB,
                ])
              ).rowCount,
              0,
            );
          });
          await call(reader, path(orgA, "programs"), {
            method: "POST",
            body: { data: data("programs", "Reader cannot write") },
            expect: 403,
          });
        },
      );
      await t.test(
        "stale concurrent edits, comments, last-owner protection and versioned delete",
        async () => {
          task = await create(a, orgA, "projects", "Task to coordinate", {
            programId: programA.id,
          });
          const edits = await Promise.all(
            ["First edit", "Second edit"].map((title) =>
              call(a, path(orgA, "projects", task.id), {
                method: "PATCH",
                body: {
                  revision: task.revision,
                  data: { ...task.data, title },
                },
                expect: null,
              }),
            ),
          );
          assert.deepEqual(
            edits.map((r) => r.response.status).sort(),
            [200, 409],
          );
          task = await get(a, orgA, "projects", task.id);
          await call(a, path(orgA, "projects", task.id) + "/comments", {
            method: "POST",
            body: { body: "A synthetic handoff question." },
          });
          const detail = (await call(a, path(orgA, "projects", task.id))).value;
          assert.equal(detail.comments.length, 1);
          assert.ok(
            detail.history.some((event) => event.action === "record.updated"),
          );
          await call(a, `/api/orgs/${orgA}/members/${a.id}`, {
            method: "DELETE",
            expect: 409,
          });
          const disposable = await create(
            a,
            orgA,
            "projects",
            "Delete this synthetic task",
          );
          await call(a, path(orgA, "projects", disposable.id), {
            method: "DELETE",
            body: { revision: 99 },
            expect: 409,
          });
          await call(a, path(orgA, "projects", disposable.id), {
            method: "DELETE",
            body: { revision: disposable.revision },
          });
          await call(a, path(orgA, "projects", disposable.id), { expect: 404 });
        },
      );
      await t.test(
        "independent approval and board snapshots preserve approved data after a later edit",
        async () => {
          let r = await get(a, orgA, "programs", programA.id);
          r = (
            await call(a, path(orgA, "programs", r.id) + "/transition", {
              method: "POST",
              body: {
                revision: r.revision,
                to: "review",
                reason: "Ready for a second person.",
              },
            })
          ).value.record;
          await call(a, path(orgA, "programs", r.id) + "/approve", {
            method: "POST",
            body: { revision: r.revision, reason: "Self approval must fail." },
            expect: 403,
          });
          r = (
            await call(reviewer, path(orgA, "programs", r.id) + "/approve", {
              method: "POST",
              body: {
                revision: r.revision,
                reason: "Synthetic independent check.",
              },
            })
          ).value.record;
          r = (
            await call(reviewer, path(orgA, "programs", r.id) + "/transition", {
              method: "POST",
              body: {
                revision: r.revision,
                to: "approved",
                reason: "The saved revision was reviewed.",
              },
            })
          ).value.record;
          const approvedTitle = r.data.title;
          await call(a, path(orgA, "programs", r.id), {
            method: "PATCH",
            body: {
              revision: r.revision,
              data: { ...r.data, title: "New unapproved program wording" },
            },
          });
          const board = await get(reader, orgA, "programs", r.id);
          assert.equal(board.data.title, approvedTitle);
          assert.notEqual(board.data.title, "New unapproved program wording");
          assert.equal(
            (await call(reader, path(orgA, "programs", r.id))).value.history
              .length,
            0,
          );
        },
      );
      await t.test(
        "program-scoped access, report freeze, source revisions and append-only audit",
        async () => {
          const otherTask = await create(
            a,
            orgA,
            "projects",
            "Other program task",
            { programId: programOther.id },
          );
          await db.tx(a.id, orgA, (c) =>
            c.query(
              "UPDATE os_members SET program_ids=$3 WHERE org_id=$1 AND user_id=$2",
              [orgA, contributor.id, JSON.stringify([programA.id])],
            ),
          );
          await call(contributor, path(orgA, "projects", otherTask.id), {
            expect: 404,
          });
          assert.ok(
            !(
              await call(contributor, path(orgA, "projects"))
            ).value.records.some((r) => r.id === otherTask.id),
          );
          report = (
            await call(a, `/api/orgs/${orgA}/reports`, {
              method: "POST",
              body: {
                title: "Synthetic frozen board packet",
                moduleIds: ["programs", "projects"],
              },
            })
          ).value.report;
          const frozenTitle = report.modules
            .find((m) => m.id === "projects")
            .records.find((r) => r.id === task.id).data.title;
          task = await get(a, orgA, "projects", task.id);
          await call(a, path(orgA, "projects", task.id), {
            method: "PATCH",
            body: {
              revision: task.revision,
              data: { ...task.data, title: "Changed after report freeze" },
            },
          });
          const saved = (
            await call(a, `/api/orgs/${orgA}/reports/${report.id}`)
          ).value.report;
          assert.equal(saved.checksum, report.checksum);
          assert.equal(
            saved.modules
              .find((m) => m.id === "projects")
              .records.find((r) => r.id === task.id).data.title,
            frozenTitle,
          );
          assert.ok(saved.sourceRevisions.some((r) => r.id === task.id));
          await assert.rejects(
            () =>
              db.tx(a.id, orgA, (c) =>
                c.query(
                  "UPDATE os_reports SET title=$3 WHERE org_id=$1 AND id=$2",
                  [orgA, report.id, "Tampered"],
                ),
              ),
            /Append-only/,
          );
          await assert.rejects(
            () =>
              db.tx(a.id, orgA, (c) =>
                c.query("DELETE FROM os_events WHERE org_id=$1", [orgA]),
              ),
            /Append-only/,
          );
          await call(b, `/api/orgs/${orgA}/reports/${report.id}`, {
            expect: 403,
          });
        },
      );
      await t.test(
        "invitation identity, acceptance, replay, revocation and live membership removal",
        async () => {
          t.diagnostic(
            "Creating a synthetic invitation and delivering through the injected transport.",
          );
          const invitation = (
            await call(a, `/api/orgs/${orgA}/invitations`, {
              method: "POST",
              body: { email: invitee.email, role: "contributor" },
            })
          ).value.invitation;
          const token = await db.tx(a.id, orgA, async (c) =>
            new URL(
              (
                await c.query(
                  "SELECT payload FROM os_jobs WHERE org_id=$1 AND idempotency_key=$2",
                  [orgA, `invitation:${invitation.id}`],
                )
              ).rows[0].payload.url,
            ).searchParams.get("token"),
          );
          t.diagnostic("Checking invitation identity, acceptance and replay.");
          await call(b, "/api/invitations/accept", {
            method: "POST",
            body: { token },
            expect: 403,
          });
          await call(invitee, "/api/invitations/accept", {
            method: "POST",
            body: { token },
          });
          await call(invitee, "/api/invitations/accept", {
            method: "POST",
            body: { token },
            expect: 409,
          });
          assert.ok(
            (await call(invitee, "/api/session")).value.orgs.some(
              (org) => org.id === orgA,
            ),
          );
          t.diagnostic(
            "Removing accepted membership and checking immediate session denial.",
          );
          await call(a, `/api/orgs/${orgA}/members/${invitee.id}`, {
            method: "DELETE",
          });
          await call(invitee, `/api/orgs/${orgA}/dashboard`, { expect: 403 });
          assert.ok(
            !(await call(invitee, "/api/session")).value.orgs.some(
              (org) => org.id === orgA,
            ),
          );
          t.diagnostic("Revoking a second invitation before acceptance.");
          const revoked = (
            await call(a, `/api/orgs/${orgA}/invitations`, {
              method: "POST",
              body: { email: invitee.email, role: "contributor" },
            })
          ).value.invitation;
          const oldToken = await db.tx(a.id, orgA, async (c) =>
            new URL(
              (
                await c.query(
                  "SELECT payload FROM os_jobs WHERE org_id=$1 AND idempotency_key=$2",
                  [orgA, `invitation:${revoked.id}`],
                )
              ).rows[0].payload.url,
            ).searchParams.get("token"),
          );
          await call(a, `/api/orgs/${orgA}/invitations/${revoked.id}`, {
            method: "DELETE",
          });
          await call(invitee, "/api/invitations/accept", {
            method: "POST",
            body: { token: oldToken },
            expect: 409,
          });
        },
      );
      await t.test(
        "private file bytes, cross-tenant denial and future personal reminders",
        async () => {
          document = await create(
            a,
            orgA,
            "documents",
            "A synthetic private document",
          );
          const bytes = Buffer.from(
            "Synthetic document bytes, no personal information.",
          );
          const file = (
            await call(a, path(orgA, "documents", document.id) + "/files", {
              method: "POST",
              body: {
                name: "synthetic.txt",
                mime: "text/plain",
                content: bytes.toString("base64"),
              },
            })
          ).value.file;
          assert.equal(file.checksum, hash(bytes));
          const listing = (
            await call(a, path(orgA, "documents", document.id) + "/files")
          ).value.files;
          assert.ok(listing.some((f) => f.id === file.id));
          const response = await handle(
            new Request(
              new URL(`/api/orgs/${orgA}/files/${file.id}`, settings.origin),
              { headers: { cookie: a.cookie } },
            ),
          );
          assert.equal(response.status, 200);
          assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
          assert.equal(response.headers.get("cache-control"), "no-store");
          await call(b, `/api/orgs/${orgA}/files/${file.id}`, { expect: 403 });
          const before = sent.filter(
            (x) => x.message.purpose === "reminder",
          ).length;
          const reminder = (
            await call(a, path(orgA, "projects", task.id) + "/reminder", {
              method: "POST",
              body: { at: new Date(Date.now() + 3600000).toISOString() },
            })
          ).value.jobId;
          await runOrgJobs({ db, org: orgA, send, settings });
          assert.equal(
            sent.filter((x) => x.message.purpose === "reminder").length,
            before,
            "A future reminder must not send early.",
          );
          await db.tx(a.id, orgA, (c) =>
            c.query(
              "UPDATE os_jobs SET next_at=now()-interval '1 minute' WHERE org_id=$1 AND id=$2",
              [orgA, reminder],
            ),
          );
          await runOrgJobs({ db, org: orgA, send, settings });
          assert.equal(
            sent.filter((x) => x.message.purpose === "reminder").length,
            before + 1,
          );
          assert.equal(
            sent.findLast((x) => x.message.purpose === "reminder").message.to,
            a.email,
          );
          await runOrgJobs({ db, org: orgA, send, settings });
          assert.equal(
            sent.filter((x) => x.message.purpose === "reminder").length,
            before + 1,
            "Accepted jobs must not send twice.",
          );
        },
      );
      await t.test(
        "CSV formula defense and exported JSON restore into an empty organization",
        async () => {
          await create(a, orgA, "programs", "=1+1");
          const csv = await call(
            a,
            `/api/orgs/${orgA}/modules/programs/export?format=csv`,
          );
          assert.match(csv.value, /"'=1\+1"/);
          backup = (await call(a, `/api/orgs/${orgA}/export`)).value;
          assert.equal(backup.format, "charitology-os");
          assert.ok(backup.files.length > 0);
          assert.ok(backup.events.length > 0);
          assert.ok(backup.comments.length > 0);
          assert.ok(backup.reports.length > 0);
          await call(b, `/api/orgs/${orgA}/export`, { expect: 403 });
          const nonempty = (
            await call(a, `/api/orgs/${orgA}/import/preview`, {
              method: "POST",
              body: { backup },
            })
          ).value;
          assert.ok(nonempty.issues.length > 0);
          await call(a, `/api/orgs/${orgA}/import/commit`, {
            method: "POST",
            body: { previewId: nonempty.previewId },
            expect: 409,
          });
          restoredOrg = (
            await call(a, "/api/orgs", {
              method: "POST",
              body: {
                name: "Synthetic restore destination",
                currency: "USD",
                timeZone: "UTC",
              },
            })
          ).value.org.id;
          const corrupt = structuredClone(backup);
          corrupt.records[0].data.title = "Tampered without checksum";
          await call(a, `/api/orgs/${restoredOrg}/import/preview`, {
            method: "POST",
            body: { backup: corrupt },
            expect: 422,
          });
          const encoded = Buffer.from(JSON.stringify(backup)),
            middle = Math.ceil(encoded.length / 2);
          const part0 = {
            index: 0,
            total: 2,
            chunk: encoded.subarray(0, middle).toString("base64"),
          };
          const upload = (
            await call(a, `/api/orgs/${restoredOrg}/import/upload`, {
              method: "POST",
              body: part0,
            })
          ).value;
          await call(a, `/api/orgs/${restoredOrg}/import/preview`, {
            method: "POST",
            body: { uploadId: upload.uploadId },
            expect: 409,
          });
          await call(b, `/api/orgs/${restoredOrg}/import/upload`, {
            method: "POST",
            body: { ...part0, uploadId: upload.uploadId },
            expect: 403,
          });
          await call(a, `/api/orgs/${restoredOrg}/import/upload`, {
            method: "POST",
            body: { ...part0, uploadId: upload.uploadId },
          });
          await call(a, `/api/orgs/${restoredOrg}/import/upload`, {
            method: "POST",
            body: {
              ...part0,
              uploadId: upload.uploadId,
              chunk: Buffer.from("different chunk").toString("base64"),
            },
            expect: 409,
          });
          await call(a, `/api/orgs/${restoredOrg}/import/upload`, {
            method: "POST",
            body: {
              uploadId: upload.uploadId,
              index: 1,
              total: 2,
              chunk: encoded.subarray(middle).toString("base64"),
            },
          });
          const preview = (
            await call(a, `/api/orgs/${restoredOrg}/import/preview`, {
              method: "POST",
              body: { uploadId: upload.uploadId },
            })
          ).value;
          assert.equal(preview.issues.length, 0);
          assert.equal(preview.summary.accepted, backup.records.length);
          const committed = (
            await call(a, `/api/orgs/${restoredOrg}/import/commit`, {
              method: "POST",
              body: { previewId: preview.previewId },
            })
          ).value;
          assert.equal(committed.imported, backup.records.length);
          const restored = (await call(a, `/api/orgs/${restoredOrg}/export`))
            .value;
          assert.equal(restored.records.length, backup.records.length);
          assert.ok(
            restored.records.every(
              (r) =>
                r.orgId === restoredOrg &&
                r.approval === null &&
                r.snapshot === null &&
                r.revision === 1 &&
                r.status === getModule(r.moduleId).workflow.initial,
            ),
          );
          assert.deepEqual(
            restored.records.map((r) => r.id).sort(),
            backup.records.map((r) => r.id).sort(),
          );
          assert.equal(restored.files[0].checksum, backup.files[0].checksum);
          const event = await db.tx(
            a.id,
            restoredOrg,
            async (c) =>
              (
                await c.query(
                  "SELECT detail FROM os_events WHERE org_id=$1 AND action='backup.restored'",
                  [restoredOrg],
                )
              ).rows[0],
          );
          assert.equal(event.detail.sourceArchiveId, preview.previewId);
          assert.equal(event.detail.checksum, backup.checksum);
          assert.equal(event.detail.sourceHistoryCount, backup.events.length);
          assert.equal(event.detail.sourceCommentCount, backup.comments.length);
          assert.equal(event.detail.sourceReportCount, backup.reports.length);
          for (const field of [
            "sourceHistory",
            "sourceComments",
            "sourceReports",
          ])
            assert.equal(
              Object.hasOwn(event.detail, field),
              false,
              "Ordinary audit events reference private source archives without duplicating their payloads.",
            );
          const archives = (
            await call(a, `/api/orgs/${restoredOrg}/backups/imports`)
          ).value.imports;
          assert.ok(
            archives.some(
              (archive) =>
                archive.id === preview.previewId &&
                archive.checksum === backup.checksum,
            ),
          );
          const archive = await call(
            a,
            `/api/orgs/${restoredOrg}/backups/imports/${event.detail.sourceArchiveId}`,
          );
          assert.equal(
            archive.response.headers.get("cache-control"),
            "no-store",
          );
          assert.deepEqual(archive.value.comments, backup.comments);
          assert.deepEqual(archive.value.reports, backup.reports);
          assert.deepEqual(archive.value.events, backup.events);
          assert.deepEqual(archive.value, backup);
          const { checksum: archivedChecksum, ...archivedPayload } =
            archive.value;
          assert.equal(archivedChecksum, backup.checksum);
          assert.equal(hash(archivedPayload), archivedChecksum);
          await db.tx(a.id, restoredOrg, (c) =>
            c.query(
              "INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'contributor')",
              [restoredOrg, contributor.id],
            ),
          );
          await call(contributor, `/api/orgs/${restoredOrg}/backups/imports`, {
            expect: 403,
          });
          await call(
            contributor,
            `/api/orgs/${restoredOrg}/backups/imports/${preview.previewId}`,
            { expect: 403 },
          );
          await call(
            b,
            `/api/orgs/${restoredOrg}/backups/imports/${preview.previewId}`,
            { expect: 403 },
          );
          await call(a, `/api/orgs/${restoredOrg}/import/commit`, {
            method: "POST",
            body: { previewId: preview.previewId },
            expect: 409,
          });
        },
      );
      await t.test("logout invalidates the real session", async () => {
        await call(a, "/api/auth/logout", { method: "POST", body: {} });
        assert.equal((await call(a, "/api/session")).value.user, null);
      });
    } finally {
      await db?.close();
      await migrationDb?.close();
      try {
        await owner.pool.query(
          `DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`,
        );
      } finally {
        await owner.close();
      }
    }
  },
);

test("uploaded backups accept 64 MiB of valid JSON and reject the next byte before parsing", async () => {
  const valid = Buffer.alloc(MAX_BACKUP_BYTES, 0x20);
  valid.write('{"synthetic":true}');
  function store(bytes) {
    const chunks = [];
    for (let start = 0; start < bytes.length; start += 1500000)
      chunks.push({ bytes: bytes.subarray(start, start + 1500000) });
    return {
      query: async () => ({
        rows: chunks.map((chunk, part) => ({
          ...chunk,
          part,
          total: chunks.length,
        })),
      }),
    };
  }
  assert.deepEqual(
    await uploadedBackup(
      store(valid),
      "synthetic-org",
      "synthetic-user",
      "a".repeat(32),
    ),
    { synthetic: true },
  );
  const oversized = Buffer.concat([valid, Buffer.from(" ")]);
  await assert.rejects(
    () =>
      uploadedBackup(
        store(oversized),
        "synthetic-org",
        "synthetic-user",
        "a".repeat(32),
      ),
    (error) => error.status === 413 && error.code === "size",
  );
});
