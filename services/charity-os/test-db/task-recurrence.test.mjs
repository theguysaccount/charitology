import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  database,
  allRecords,
  saveRecord,
  rowRecord,
  logicalBackupBytes,
} from "../lib/database.mjs";
import { createHandler } from "../lib/handler.mjs";
import { validateRecord } from "../lib/modules.mjs";
import { csrf, hash } from "../lib/security.mjs";
import {
  exportTaskRecurrence,
  restoredTaskRecurrence,
  restoreTaskRecurrence,
} from "../lib/task-recurrence-backup.mjs";
import { recurrenceTableUsage } from "../lib/task-recurrence.mjs";
import { taskRecurrenceRecordId } from "../lib/task-recurrence-model.mjs";
const configured = !!(process.env.DATABASE_URL && process.env.OS_DATABASE_URL),
  quote = (v) => '"' + v.replaceAll('"', '""') + '"',
  direct = (v) => {
    const u = new URL(v);
    u.hostname = u.hostname.replace(/-pooler(?=\.)/, "");
    return u.toString();
  };
const settings = {
    origin: "https://os.example.invalid",
    secret: "synthetic-recurrence-secret-more-than-32-characters",
  },
  org = "synthetic-recurrence-org",
  actor = "synthetic-admin";
const sessionFor = (user) => ({
  user: { id: user, email: user + "@example.invalid", emailVerified: true },
  session: { id: "synthetic-session-" + user },
});
let sequence = 0;
const key = () => "synthetic-command-" + String(++sequence).padStart(16, "0");

test(
  "actual constrained PostgreSQL manual recurrence, replay, permissions, guards and inactive recovery",
  {
    skip: configured
      ? false
      : "Set owner and constrained URLs for isolated schema checks.",
    timeout: 900000,
  },
  async (t) => {
    const schema = "os_task_recurrence_" + randomBytes(8).toString("hex"),
      owner = database(process.env.DATABASE_URL);
    let migration, db;
    const tx = (fn, organization = org, user = actor, lock = true) =>
      db.tx(user, organization, fn, { lock });
    const q = (sql, args, organization = org) =>
      tx((c) => c.query(sql, args), organization);
    const api = async (
      path,
      { method = "GET", body, user = actor, raw, expect = 200 } = {},
    ) => {
      const session = sessionFor(user),
        handle = createHandler({
          settings,
          db,
          auth: { api: { getSession: async () => (user ? session : null) } },
          send: async () => {
            throw new Error("No mail from recurrence tests.");
          },
        });
      const response = await handle(
        new Request(settings.origin + path, {
          method,
          headers:
            method === "GET"
              ? {}
              : {
                  "content-type": "application/json",
                  origin: settings.origin,
                  "x-csrf-token": csrf(session.session.id, settings.secret),
                },
          ...(method !== "GET" ? { body: raw ?? JSON.stringify(body) } : {}),
        }),
      );
      const value = await response.json();
      assert.equal(
        response.status,
        expect,
        JSON.stringify({
          path,
          status: response.status,
          code: value.code,
          message: value.message,
        }),
      );
      return value;
    };
    const route = (id, action = "") =>
      "/api/orgs/" +
      org +
      "/task-recurrence/tasks/" +
      id +
      (action ? "/" + action : "");
    const record = async (id, options = {}) =>
      tx(async (c) => {
        const r = {
          id,
          orgId: org,
          moduleId: "projects",
          ownerId: actor,
          lastEditedBy: actor,
          revision: 1,
          status: "planned",
          approval: null,
          snapshot: null,
          source: null,
        };
        r.data = validateRecord(
          "projects",
          {
            title: "Fictional recurring task",
            kind: "task",
            dueAt: "2026-01-31T09:00:00.125Z",
            timeZone: "UTC",
            recurrence: "monthly",
            effortMinutes: 0,
            ...options,
          },
          {
            records: await allRecords(c, org),
            orgId: org,
            recordId: id,
            status: "planned",
          },
        );
        await saveRecord(c, r);
        return r;
      });
    const preview = async (id) => {
      const current = (
        await q("SELECT * FROM os_records WHERE org_id=$1 AND id=$2", [org, id])
      ).rows[0];
      const get = await api(route(id));
      return api(route(id, "preview"), {
        method: "POST",
        body: {
          sourceRevision: current.revision,
          seriesRevision: get.series?.revision ?? null,
          resolution: null,
        },
      });
    };
    try {
      await owner.pool.query(`CREATE SCHEMA ${quote(schema)}`);
      migration = database(direct(process.env.DATABASE_URL), { schema });
      await migration.migrate();
      await migration.migrate();
      const role = decodeURIComponent(
          new URL(process.env.OS_DATABASE_URL).username,
        ),
        flags = (
          await owner.pool.query(
            "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1",
            [role],
          )
        ).rows[0];
      assert.equal(flags.rolsuper, false);
      assert.equal(flags.rolbypassrls, false);
      await owner.pool.query(
        `GRANT USAGE ON SCHEMA ${quote(schema)} TO ${quote(role)}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${quote(schema)} TO ${quote(role)}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${quote(schema)} TO ${quote(role)}`,
      );
      db = database(direct(process.env.OS_DATABASE_URL), { schema });
      for (const organization of [
        org,
        "synthetic-recurrence-other",
        "synthetic-recurrence-recovered",
      ])
        await tx(async (c) => {
          await c.query(
            "INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional recurrence test',$1,'USD','UTC')",
            [organization],
          );
          await c.query(
            "INSERT INTO os_members(org_id,user_id,role,program_ids) VALUES($1,$2,'admin','[]'),($1,'synthetic-staff','contributor','[]'),($1,'synthetic-board','board_reader','[]')",
            [organization, actor],
          );
        }, organization);
      await t.test(
        "two new tenant tables force RLS and occurrences are append-only",
        async () => {
          const flags = (
            await q(
              "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('os_task_recurrence_series','os_task_recurrence_occurrences') AND relnamespace=$1::regnamespace",
              [schema],
            )
          ).rows;
          assert.equal(flags.length, 2);
          assert.ok(
            flags.every((r) => r.relrowsecurity && r.relforcerowsecurity),
          );
        },
      );
      await t.test(
        "strict route intake and authorization reject before expensive generation",
        async () => {
          await record("root");
          await api(route("root"), { user: "synthetic-board", expect: 403 });
          await api(route("root", "preview"), {
            method: "POST",
            raw: '{"sourceRevision":1,"sourceRevision":1,"seriesRevision":null,"resolution":null}',
            expect: 422,
          });
          await api(route("root", "preview"), {
            method: "POST",
            raw: " ".repeat(8193),
            expect: 413,
          });
          await api(route("root") + "?secret=private", { expect: 422 });
        },
      );
      let initial, generated, command, scopedMiddle, scopedTip;
      await t.test(
        "preview and two-session first generation persist exactly one planned unapproved child",
        async () => {
          initial = await preview("root");
          assert.equal(initial.kind, "ready");
          assert.equal(
            initial.preview.chosen.dueAt,
            "2026-02-28T09:00:00.125Z",
          );
          command = {
            previewToken: initial.previewToken,
            idempotencyKey: key(),
          };
          const outcomes = await Promise.all([
            api(route("root", "generate"), { method: "POST", body: command }),
            api(route("root", "generate"), { method: "POST", body: command }),
          ]);
          assert.equal(
            outcomes.filter((r) => r.kind === "generated").length,
            1,
          );
          generated = outcomes[0].existing.record;
          assert.equal(generated.status, "planned");
          assert.equal(generated.approval, null);
          assert.equal(generated.snapshot, null);
          assert.equal(generated.source, null);
          assert.equal(generated.data.effortMinutes, 0);
          assert.equal(
            (
              await q(
                "SELECT count(*) FROM os_task_recurrence_occurrences WHERE org_id=$1",
                [org],
              )
            ).rows[0].count,
            "1",
          );
        },
      );
      await t.test(
        "exact retry and second key return same result; accepted key changed request refuses",
        async () => {
          const retry = await api(route("root", "generate"), {
            method: "POST",
            body: command,
          });
          assert.equal(retry.existing.record.id, generated.id);
          const second = await api(route("root", "generate"), {
            method: "POST",
            body: { ...command, idempotencyKey: key() },
          });
          assert.equal(second.kind, "existing");
          await api(route("root", "generate"), {
            method: "POST",
            body: { ...command, previewToken: initial.previewToken + "x" },
            expect: 409,
          });
        },
      );

      await t.test(
        "expired accepted preview still recovers its readable result while an uncommitted expiry refuses",
        async () => {
          await record("expiry-root");
          const p = await preview("expiry-root");
          const realNow = Date.now;
          Date.now = () => realNow() + 700000;
          try {
            const exact = await api(route("root", "generate"), {
              method: "POST",
              body: command,
            });
            assert.equal(exact.existing.record.id, generated.id);
            await api(route("expiry-root", "generate"), {
              method: "POST",
              body: { previewToken: p.previewToken, idempotencyKey: key() },
              expect: 409,
            });
          } finally {
            Date.now = realNow;
          }
          assert.equal(
            (
              await q(
                "SELECT count(*) FROM os_task_recurrence_occurrences WHERE org_id=$1 AND source_record_id='expiry-root'",
                [org],
              )
            ).rows[0].count,
            "0",
          );
        },
      );
      await t.test(
        "foreign tenant sees no provenance and cannot write another tenant",
        async () => {
          assert.equal(
            (
              await q(
                "SELECT * FROM os_task_recurrence_series",
                [],
                "synthetic-recurrence-other",
              )
            ).rows.length,
            0,
          );
          await assert.rejects(
            q(
              "UPDATE os_task_recurrence_series SET org_id='synthetic-recurrence-other' WHERE org_id=$1",
              [org],
            ),
            /row-level security/,
          );
          await assert.rejects(
            q("DELETE FROM os_task_recurrence_occurrences WHERE org_id=$1", [
              org,
            ]),
            /Append-only/,
          );
        },
      );
      await t.test(
        "central ordinary save freezes active schedule and integration-shaped source cannot bypass",
        async () => {
          const root = rowRecord(
            (
              await q("SELECT * FROM os_records WHERE org_id=$1 AND id=$2", [
                org,
                "root",
              ])
            ).rows[0],
          );
          await assert.rejects(
            tx((c) =>
              saveRecord(c, {
                ...root,
                data: { ...root.data, dueAt: "2026-02-01T09:00:00Z" },
                revision: root.revision + 1,
                source: {
                  integrationId: "synthetic",
                  externalId: "x",
                  checksum: hash("x"),
                },
              }),
            ),
            (e) => e.status === 409 && e.code === "recurrence_fields",
          );
        },
      );
      await t.test(
        "stale source revision and exact membership reincarnation invalidate previews",
        async () => {
          const next = await preview(generated.id);
          assert.equal(next.preview.chosen.dueAt, "2026-03-31T09:00:00.125Z");
          await q(
            "UPDATE os_records SET revision=revision+1,data=jsonb_set(data,'{title}','\"Fictional amended task\"') WHERE org_id=$1 AND id=$2",
            [org, generated.id],
          );
          await api(route(generated.id, "generate"), {
            method: "POST",
            body: { previewToken: next.previewToken, idempotencyKey: key() },
            expect: 409,
          });
          const fresh = await preview(generated.id);
          await q(
            "UPDATE os_members SET created_at=created_at+interval '1 microsecond' WHERE org_id=$1 AND user_id=$2",
            [org, actor],
          );
          await api(route(generated.id, "generate"), {
            method: "POST",
            body: { previewToken: fresh.previewToken, idempotencyKey: key() },
            expect: 409,
          });
        },
      );
      await t.test(
        "stable generated identity conflicts refuse without changing sequence",
        async () => {
          const next = await preview(generated.id),
            collision = taskRecurrenceRecordId(initial.preview.seriesId, 2);
          await record(collision);
          await api(route(generated.id, "generate"), {
            method: "POST",
            body: { previewToken: next.previewToken, idempotencyKey: key() },
            expect: 409,
          });
          assert.equal(
            (
              await q(
                "SELECT count(*) FROM os_task_recurrence_occurrences WHERE org_id=$1",
                [org],
              )
            ).rows[0].count,
            "1",
          );
          await q("DELETE FROM os_records WHERE org_id=$1 AND id=$2", [
            org,
            collision,
          ]);
        },
      );
      let ended;
      await t.test(
        "permanent End exact retry preserves boolean audit result and post-End schedule edits stay legal",
        async () => {
          const state = await api(route("root"));
          const body = {
            seriesRevision: state.series.revision,
            idempotencyKey: key(),
            reason: "Fictional explicit stop.",
          };
          ended = await api(
            "/api/orgs/" +
              org +
              "/task-recurrence/series/" +
              state.series.id +
              "/end",
            { method: "POST", body },
          );
          assert.equal(ended.auditRecorded, true);
          const retry = await api(
            "/api/orgs/" +
              org +
              "/task-recurrence/series/" +
              state.series.id +
              "/end",
            { method: "POST", body },
          );
          assert.equal(retry.replayed, true);
          assert.equal(retry.auditRecorded, true);
          const r = rowRecord(
            (
              await q("SELECT * FROM os_records WHERE org_id=$1 AND id=$2", [
                org,
                generated.id,
              ])
            ).rows[0],
          );
          await tx((c) =>
            saveRecord(c, {
              ...r,
              data: {
                ...r.data,
                kind: "milestone",
                recurrence: "none",
                dueAt: null,
                timeZone: null,
              },
              revision: r.revision + 1,
            }),
          );
          assert.equal(
            (await api(route("root"))).existing.record.data.kind,
            "milestone",
          );
        },
      );
      await t.test(
        "source trash remains archive-only; inactive graph survives post-End edits and repeated restore",
        async () => {
          await q(
            "UPDATE os_records SET deleted_at=now() WHERE org_id=$1 AND id=$2",
            [org, "root"],
          );
          const rows = (
              await q("SELECT * FROM os_records WHERE org_id=$1", [org])
            ).rows,
            backup = await tx((c) => exportTaskRecurrence(c, org));
          const prepared = restoredTaskRecurrence(backup, {
            records: rows.filter((r) => !r.deleted_at).map(rowRecord),
            trash: rows.filter((r) => r.deleted_at).map(rowRecord),
          });
          assert.equal(prepared.series[0].state, "recovered");
          assert.equal(prepared.series[0].recoveredState, "ended");
          await tx(async (c) => {
            for (const r of rows.filter((r) => !r.deleted_at).map(rowRecord))
              await saveRecord(c, {
                ...r,
                orgId: "synthetic-recurrence-recovered",
                approval: null,
                snapshot: null,
              });
            await restoreTaskRecurrence(
              c,
              "synthetic-recurrence-recovered",
              actor,
              prepared,
            );
          }, "synthetic-recurrence-recovered");
          const again = await tx(
            (c) => exportTaskRecurrence(c, "synthetic-recurrence-recovered"),
            "synthetic-recurrence-recovered",
          );
          const p2 = restoredTaskRecurrence(again, {
            records: rows.filter((r) => !r.deleted_at).map(rowRecord),
            trash: [],
          });
          assert.equal(p2.series[0].recoveredState, "ended");
          assert.equal(
            (
              await q(
                "SELECT 1 FROM os_records WHERE org_id=$1 AND id=$2",
                ["synthetic-recurrence-recovered", "root"],
                "synthetic-recurrence-recovered",
              )
            ).rows.length,
            0,
          );
          const changed = structuredClone(backup);
          changed.occurrences[0].sequence = 2;
          assert.throws(
            () =>
              restoredTaskRecurrence(changed, {
                records: rows.map(rowRecord),
                trash: [],
              }),
            (e) => e.status === 422,
          );
        },
      );
      await t.test(
        "deletion hook ends a separate active chain and saved budget bounds End",
        async () => {
          await record("delete-root");
          const p = await preview("delete-root");
          await api(route("delete-root", "generate"), {
            method: "POST",
            body: { previewToken: p.previewToken, idempotencyKey: key() },
          });
          await api(
            "/api/orgs/" + org + "/modules/projects/records/delete-root",
            { method: "DELETE", body: { revision: 1 } },
          );
          const s = (
            await q(
              "SELECT *,octet_length(to_jsonb(s)::text) AS size FROM os_task_recurrence_series s WHERE org_id=$1 AND root_record_id=$2",
              [org, "delete-root"],
            )
          ).rows[0];
          assert.equal(s.state, "ended");
          assert.equal(s.end_code, "record-deleted");
          assert.ok(s.budget_bytes >= Number(s.size));
          assert.ok(
            (await tx((c) => logicalBackupBytes(c, org))) > s.budget_bytes,
          );
        },
      );

      await t.test(
        "fold requires an explicit exact choice and a gap never produces a task",
        async () => {
          await record("fold-root", {
            dueAt: "2026-10-25T01:30:00-04:00",
            timeZone: "America/New_York",
            recurrence: "weekly",
          });
          const folded = await preview("fold-root");
          assert.equal(folded.kind, "needs-resolution");
          assert.equal(folded.resolution.candidates.length, 2);
          const picked = await api(route("fold-root", "preview"), {
            method: "POST",
            body: {
              sourceRevision: 1,
              seriesRevision: null,
              resolution: "later",
            },
          });
          assert.equal(picked.kind, "ready");
          assert.equal(picked.preview.chosen.offsetSeconds, -18000);
          await api(route("fold-root", "generate"), {
            method: "POST",
            body: { previewToken: picked.previewToken, idempotencyKey: key() },
          });
          await record("gap-root", {
            dueAt: "2026-03-01T02:30:00-05:00",
            timeZone: "America/New_York",
            recurrence: "weekly",
          });
          const gap = await preview("gap-root");
          assert.equal(gap.kind, "unavailable");
          assert.equal(gap.code, "gap");
          assert.equal(
            (
              await q(
                "SELECT count(*) FROM os_task_recurrence_occurrences WHERE org_id=$1 AND source_record_id=$2",
                [org, "gap-root"],
              )
            ).rows[0].count,
            "0",
          );
        },
      );
      await t.test(
        "ordinary cancellation and trash restoration never reactivate a series",
        async () => {
          await record("cancel-root");
          const p = await preview("cancel-root");
          await api(route("cancel-root", "generate"), {
            method: "POST",
            body: { previewToken: p.previewToken, idempotencyKey: key() },
          });
          await api(
            "/api/orgs/" +
              org +
              "/modules/projects/records/cancel-root/transition",
            {
              method: "POST",
              body: {
                revision: 1,
                to: "cancelled",
                reason: "Fictional cancellation.",
              },
            },
          );
          assert.equal((await api(route("cancel-root"))).series.state, "ended");
          await api(
            "/api/orgs/" +
              org +
              "/modules/projects/records/delete-root/restore",
            { method: "POST", body: { revision: 2 } },
          );
          assert.equal((await api(route("delete-root"))).series.state, "ended");
        },
      );

      await t.test(
        "linked reference revisions and current program scope are rechecked at commit",
        async () => {
          await tx(async (c) => {
            const r = {
              id: "reference-program",
              orgId: org,
              moduleId: "programs",
              status: "draft",
              ownerId: actor,
              lastEditedBy: actor,
              revision: 1,
              approval: null,
              snapshot: null,
              source: null,
            };
            r.data = validateRecord(
              "programs",
              { title: "Fictional reference context" },
              {
                records: await allRecords(c, org),
                orgId: org,
                recordId: r.id,
                status: r.status,
              },
            );
            await saveRecord(c, r);
          });
          await record("reference-root", { programId: "reference-program" });
          const p = await preview("reference-root");
          await q(
            "UPDATE os_records SET revision=revision+1 WHERE org_id=$1 AND id='reference-program'",
            [org],
          );
          await api(route("reference-root", "generate"), {
            method: "POST",
            body: { previewToken: p.previewToken, idempotencyKey: key() },
            expect: 409,
          });
          await q(
            "UPDATE os_members SET program_ids='[\"another-program\"]' WHERE org_id=$1 AND user_id='synthetic-staff'",
            [org],
          );
          await api(route("reference-root"), {
            user: "synthetic-staff",
            expect: 404,
          });
        },
      );

      await t.test(
        "post-End scope moves protect full history while exact existing-result recovery reveals only current readable records",
        async () => {
          for (const id of ["scope-a", "scope-b"])
            await tx(async (c) => {
              const r = {
                id,
                orgId: org,
                moduleId: "programs",
                status: "draft",
                ownerId: actor,
                lastEditedBy: actor,
                revision: 1,
                approval: null,
                snapshot: null,
                source: null,
              };
              r.data = validateRecord(
                "programs",
                { title: "Fictional scoped program" },
                {
                  records: await allRecords(c, org),
                  orgId: org,
                  recordId: id,
                  status: r.status,
                },
              );
              await saveRecord(c, r);
            });
          await record("scope-root", { programId: "scope-a" });
          const first = await preview("scope-root"),
            one = await api(route("scope-root", "generate"), {
              method: "POST",
              body: { previewToken: first.previewToken, idempotencyKey: key() },
            });
          scopedMiddle = one.existing.record.id;
          const second = await preview(scopedMiddle),
            accepted = {
              previewToken: second.previewToken,
              idempotencyKey: key(),
            },
            two = await api(route(scopedMiddle, "generate"), {
              method: "POST",
              body: accepted,
            });
          scopedTip = two.existing.record.id;
          const state = await api(route(scopedMiddle));
          await api(
            "/api/orgs/" +
              org +
              "/task-recurrence/series/" +
              state.series.id +
              "/end",
            {
              method: "POST",
              body: {
                seriesRevision: state.series.revision,
                idempotencyKey: key(),
                reason: "Fictional scope transfer.",
              },
            },
          );
          for (const id of [scopedMiddle, scopedTip])
            await tx(async (c) => {
              const r = rowRecord(
                (
                  await c.query(
                    "SELECT * FROM os_records WHERE org_id=$1 AND id=$2",
                    [org, id],
                  )
                ).rows[0],
              );
              await saveRecord(c, {
                ...r,
                data: { ...r.data, programId: "scope-b" },
                revision: r.revision + 1,
              });
            });
          await q(
            "UPDATE os_members SET role='contributor',revision=revision+1,program_ids='[\"scope-b\"]' WHERE org_id=$1 AND user_id=$2",
            [org, actor],
          );
          try {
            await api(route(scopedMiddle), { expect: 404 });
            const ordinary = await api(
              "/api/orgs/" + org + "/modules/projects/records/" + scopedMiddle,
            );
            assert.equal(ordinary.record.id, scopedMiddle);
            const existing = await api(route(scopedMiddle, "generate"), {
              method: "POST",
              body: accepted,
            });
            assert.equal(existing.existing.record.id, scopedTip);
            assert.doesNotMatch(
              JSON.stringify(existing),
              /scope-root|scope-a|"anchor"/,
            );
            await api(
              "/api/orgs/" +
                org +
                "/task-recurrence/series/" +
                state.series.id +
                "/end",
              {
                method: "POST",
                body: {
                  seriesRevision: state.series.revision,
                  idempotencyKey: key(),
                  reason: "No history disclosure.",
                },
                expect: 404,
              },
            );
          } finally {
            await q(
              "UPDATE os_members SET role='admin',revision=revision+1,program_ids='[]' WHERE org_id=$1 AND user_id=$2",
              [org, actor],
            );
          }
          const current = rowRecord(
            (
              await q("SELECT * FROM os_records WHERE org_id=$1 AND id=$2", [
                org,
                scopedTip,
              ])
            ).rows[0],
          );
          await api(
            "/api/orgs/" + org + "/modules/projects/records/" + scopedTip,
            { method: "DELETE", body: { revision: current.revision } },
          );
        },
      );
      await t.test(
        "complete backup export/preview/commit recovers metadata inactive and never restores source trash",
        async () => {
          const backup = await api("/api/orgs/" + org + "/export");
          assert.ok(backup.taskRecurrence.series.length >= 3);
          const destination = "synthetic-recurrence-backup-api";
          await tx(async (c) => {
            await c.query(
              "INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional backup target',$1,'USD','UTC')",
              [destination],
            );
            await c.query(
              "INSERT INTO os_members(org_id,user_id,role,program_ids) VALUES($1,$2,'admin','[]')",
              [destination, actor],
            );
          }, destination);
          const p = await api("/api/orgs/" + destination + "/import/preview", {
            method: "POST",
            body: { backup },
          });
          assert.equal(p.issues.length, 0);
          await api("/api/orgs/" + destination + "/import/commit", {
            method: "POST",
            body: { previewId: p.previewId, checksum: p.checksum },
          });
          const saved = (
            await q(
              "SELECT * FROM os_task_recurrence_series WHERE org_id=$1",
              [destination],
              destination,
            )
          ).rows;
          assert.ok(
            saved.every(
              (r) => r.state === "recovered" && r.last_end_command === null,
            ),
          );
          assert.equal(
            (
              await q(
                "SELECT * FROM os_records WHERE org_id=$1 AND id=$2",
                [destination, "root"],
                destination,
              )
            ).rows.length,
            0,
          );
          const rootless = await api(
            "/api/orgs/" +
              destination +
              "/task-recurrence/tasks/" +
              generated.id,
          );
          assert.equal(rootless.series.state, "recovered");
          const replay = await api(
            "/api/orgs/" +
              destination +
              "/task-recurrence/tasks/" +
              generated.id +
              "/preview",
            {
              method: "POST",
              body: {
                sourceRevision: 1,
                seriesRevision: rootless.series.revision,
                resolution: null,
              },
            },
          );
          assert.equal(replay.kind, "unavailable");
          assert.equal(replay.code, "recovered");
          const archivedOnly = await api(
            "/api/orgs/" +
              destination +
              "/task-recurrence/tasks/" +
              scopedMiddle,
          );
          assert.equal(archivedOnly.existing.kind, "historical-only");
          assert.equal(archivedOnly.existing.recoveryAvailable, false);
          assert.equal(Object.hasOwn(archivedOnly.existing, "recordId"), false);
          assert.equal(Object.hasOwn(archivedOnly.existing, "record"), false);
          const archive = (
            await api("/api/orgs/" + destination + "/backups/imports")
          ).imports;
          assert.ok(Array.isArray(archive));
        },
      );
      await t.test(
        "prepaid permanent End survives full recurrence and ordinary quota with truthful audit exhaustion",
        async () => {
          await record("quota-root");
          const p = await preview("quota-root");
          await api(route("quota-root", "generate"), {
            method: "POST",
            body: { previewToken: p.previewToken, idempotencyKey: key() },
          });
          await q(
            "UPDATE os_task_recurrence_series SET revision=2147483646 WHERE org_id=$1 AND root_record_id='quota-root'",
            [org],
          );
          const state = await api(route("quota-root")),
            series = state.series;
          // Synthetic SQL fixture fills already-accounted capacity, never production data.
          await q(
            `UPDATE os_task_recurrence_series SET budget_bytes=budget_bytes+(4194304-(SELECT (SELECT COALESCE(sum(GREATEST(octet_length(to_jsonb(s)::text),budget_bytes)),0) FROM os_task_recurrence_series s WHERE org_id=$1)+(SELECT COALESCE(sum(octet_length(to_jsonb(o)::text)),0) FROM os_task_recurrence_occurrences o WHERE org_id=$1))) WHERE org_id=$1 AND id=$2`,
            [org, series.id],
          );
          assert.equal(
            Number((await tx((c) => recurrenceTableUsage(c, org))).bytes),
            4194304,
          );
          const quotaBudget = (
            await q(
              "SELECT budget_bytes FROM os_task_recurrence_series WHERE org_id=$1 AND id=$2",
              [org, series.id],
            )
          ).rows[0].budget_bytes;
          const beforeUsage = await tx((c) => logicalBackupBytes(c, org)),
            fill = 61 * 1024 * 1024 + 2048 - beforeUsage;
          await q(
            "INSERT INTO os_comments(org_id,id,record_id,actor_id,body) VALUES($1,'synthetic-quota-filler','quota-root',$2,repeat('x',$3))",
            [org, actor, fill],
          );
          const refused = await preview("expiry-root");
          assert.equal(refused.kind, "ready");
          await api(route("expiry-root", "generate"), {
            method: "POST",
            body: { previewToken: refused.previewToken, idempotencyKey: key() },
            expect: 422,
          });
          assert.equal(
            (
              await q(
                "SELECT count(*) FROM os_task_recurrence_occurrences WHERE org_id=$1 AND source_record_id='expiry-root'",
                [org],
              )
            ).rows[0].count,
            "0",
          );
          assert.equal(
            (
              await q("SELECT 1 FROM os_records WHERE org_id=$1 AND id=$2", [
                org,
                refused.preview.generatedRecordId,
              ])
            ).rows.length,
            0,
          );
          const command = {
            seriesRevision: series.revision,
            idempotencyKey: key(),
            reason: "R".repeat(2000),
          };
          const ended = await api(
            "/api/orgs/" +
              org +
              "/task-recurrence/series/" +
              series.id +
              "/end",
            { method: "POST", body: command },
          );
          assert.equal(ended.auditRecorded, false);
          assert.equal(ended.series.state, "ended");
          const retry = await api(
            "/api/orgs/" +
              org +
              "/task-recurrence/series/" +
              series.id +
              "/end",
            { method: "POST", body: command },
          );
          assert.equal(retry.auditRecorded, false);
          assert.equal(retry.replayed, true);
          const row = (
            await q(
              "SELECT *,octet_length(to_jsonb(s)::text) AS bytes FROM os_task_recurrence_series s WHERE org_id=$1 AND id=$2",
              [org, series.id],
            )
          ).rows[0];
          assert.ok(Number(row.bytes) <= row.budget_bytes);
          assert.equal(row.budget_bytes, quotaBudget);
          assert.equal(row.revision, 2147483647);
          assert.equal(
            Number((await tx((c) => recurrenceTableUsage(c, org))).bytes),
            4194304,
          );

          assert.equal(
            (
              await q(
                "SELECT count(*) FROM os_events WHERE org_id=$1 AND action='task-recurrence.ended' AND detail->>'id'=$2",
                [org, series.id],
              )
            ).rows[0].count,
            "0",
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
