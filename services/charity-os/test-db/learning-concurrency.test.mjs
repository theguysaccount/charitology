import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { getMigrations } from "better-auth/db/migration";
import { magicLink } from "better-auth/plugins/magic-link";
import { database, rowRecord } from "../lib/database.mjs";
import { applicationGrantsSql } from "../lib/migration-grants.mjs";
import { createHandler } from "../lib/handler.mjs";
import { csrf } from "../lib/security.mjs";
import { getModule } from "../lib/modules.mjs";
import { learningHash as H } from "../lib/learning-json.mjs";
import {
  headPin,
  workingPin,
  compileLearningMapping,
  makeLearningEvent,
} from "../lib/learning-model.mjs";
import { sourcePin } from "../lib/learning-native.mjs";
import {
  currentLearningMember,
  resolveLearningApproval,
} from "../lib/learning-access.mjs";
import {
  insertLearningHistory,
  loadLearningInventory,
  checkLearningActiveRecords,
} from "../lib/learning-history.mjs";
import {
  previewLearningCommand,
  commitLearningCommand,
} from "../lib/learning-commands.mjs";
import {
  learningMappedFixture,
  appendLearningTestMeasurement,
  learningMeasurementInput,
} from "../test/learning-fixtures.mjs";
const configured = !!(process.env.DATABASE_URL && process.env.OS_DATABASE_URL),
  quote = (v) => '"' + v.replaceAll('"', '""') + '"',
  direct = (v) => {
    const u = new URL(v);
    u.hostname = u.hostname.replace(/-pooler(?=\.)/, "");
    return u.toString();
  };
const org = "org-one",
  capOrg = "fictional-learning-capacity",
  author = "writer-one",
  reviewer = "reviewer-one",
  settings = {
    origin: "https://os.example.invalid",
    secret: "fictional-concurrency-key-at-least-thirty-two-characters",
    production: false,
  };
const sessions = new Map(
  [author, reviewer].map((user) => [
    user,
    {
      user: { id: user, email: user + "@example.invalid", emailVerified: true },
      session: { id: "fictional-concurrency-session-" + user },
    },
  ]),
);
test(
  "constrained PostgreSQL serializes Learning acceptance and enforces actual500 active feature records",
  {
    skip: configured
      ? false
      : "Private owner/constrained URLs required for isolated schema.",
    timeout: 900000,
  },
  async (t) => {
    const schema = "os_learning_races_" + randomBytes(8).toString("hex"),
      owner = database(direct(process.env.DATABASE_URL));
    let migration, db;
    const tx = (fn, organization = org, user = author) =>
      db.tx(user, organization, fn, { lock: true });
    const command = (fn, organization = org, user = author) =>
      tx(
        async (c) =>
          fn(
            c,
            await currentLearningMember(c, organization, sessions.get(user)),
          ),
        organization,
        user,
      );
    const preview = (operation, input) =>
      command((c, member) =>
        previewLearningCommand(c, {
          org,
          user: author,
          member,
          session: sessions.get(author),
          operation,
          input,
        }),
      );
    const commit = (input) =>
      command((c, member) =>
        commitLearningCommand(c, {
          org,
          user: author,
          member,
          session: sessions.get(author),
          input,
        }),
      );
    const intent = (p) => ({
      previewId: p.previewId,
      reviewSha256: p.reviewSha256,
      commandKey: randomUUID(),
    });
    const counts = () =>
      tx(
        async (c) =>
          (
            await c.query(
              "SELECT (SELECT count(*) FROM os_records WHERE org_id=$1) AS records,(SELECT count(*) FROM os_learning_history WHERE org_id=$1) AS history,(SELECT count(*) FROM os_events WHERE org_id=$1) AS audits",
              [org],
            )
          ).rows[0],
      );
    const handles = new Map();
    async function ordinary(
      tail,
      {
        method = "GET",
        body,
        user = author,
        organization = org,
        expect = 200,
      } = {},
    ) {
      if (!handles.has(user))
        handles.set(
          user,
          createHandler({
            settings,
            db,
            auth: { api: { getSession: async () => sessions.get(user) } },
            send: async () => {
              throw Error("No provider action permitted");
            },
          }),
        );
      const h = { "x-forwarded-for": "198.51.100.92" };
      if (method !== "GET") {
        h.origin = settings.origin;
        h["x-csrf-token"] = csrf(
          sessions.get(user).session.id,
          settings.secret,
        );
        h["content-type"] = "application/json";
      }
      const r = await handles.get(user)(
        new Request(
          settings.origin + "/api/orgs/" + organization + "/" + tail,
          {
            method,
            headers: h,
            ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
          },
        ),
      );
      const v = await r.json();
      assert.equal(
        r.status,
        expect,
        `${tail}: ${r.status} ${v.code || ""} ${v.message || ""}`,
      );
      return v;
    }
    async function approve(record) {
      const module = "outcomes",
        path = `modules/${module}/records/${record.id}`;
      while (record.status !== "approved") {
        const edge = getModule(module).workflow.transitions.find(
          (e) => e.from === record.status,
        );
        assert(edge);
        if (
          edge.requiresApproval &&
          record.approval?.revision !== record.revision
        )
          record = (
            await ordinary(path + "/approve", {
              method: "POST",
              body: {
                revision: record.revision,
                reason: "Fictional independent review",
              },
              user: reviewer,
            })
          ).record;
        record = (
          await ordinary(path + "/transition", {
            method: "POST",
            body: {
              revision: record.revision,
              to: edge.to,
              reason: "Fictional normal workflow",
            },
            user: reviewer,
          })
        ).record;
      }
      record = (
        await ordinary(path + "/approve", {
          method: "POST",
          body: {
            revision: record.revision,
            reason: "Fictional exact final-state approval",
          },
          user: reviewer,
        })
      ).record;
      return command((c, member) =>
        resolveLearningApproval(c, org, record.id, member),
      );
    }
    async function seedRecord(c, organization, r) {
      await c.query(
        "INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision,approval,snapshot,source,created_at,updated_at,deleted_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,$11,$12,$13)",
        [
          organization,
          r.id,
          r.moduleId,
          JSON.stringify(r.data),
          r.status,
          r.ownerId,
          r.lastEditedBy ?? r.ownerId,
          r.revision,
          r.approval ? JSON.stringify(r.approval) : null,
          r.snapshot ? JSON.stringify(r.snapshot) : null,
          r.createdAt ?? "2026-10-27T00:00:00.000Z",
          r.updatedAt ?? "2026-10-27T00:00:00.000Z",
          r.deletedAt ?? null,
        ],
      );
    }
    async function releaseTogether(tasks) {
      let acquired, release;
      const held = new Promise((resolve) => (acquired = resolve)),
        gate = new Promise((resolve) => (release = resolve));
      const blocker = tx(async () => {
        acquired();
        await gate;
      });
      await held;
      const results = tasks.map((fn) => fn());
      release();
      await blocker;
      return Promise.allSettled(results);
    }
    let f, old;
    try {
      await owner.pool.query(`CREATE SCHEMA ${quote(schema)}`);
      migration = database(direct(process.env.DATABASE_URL), { schema });
      assert.equal(
        (await migration.pool.query("SELECT current_schema() AS name")).rows[0]
          .name,
        schema,
      );
      const auth = await getMigrations({
        database: migration.pool,
        plugins: [
          magicLink({ storeToken: "hashed", sendMagicLink: async () => {} }),
        ],
        logger: { disabled: true },
      });
      assert.doesNotMatch(
        await auth.compileMigrations(),
        /(?:(?:"public"|public)\s*\.)/i,
      );
      await auth.runMigrations();
      await migration.migrate();
      const role = decodeURIComponent(
        new URL(process.env.OS_DATABASE_URL).username,
      );
      assert.notEqual(
        role,
        decodeURIComponent(new URL(process.env.DATABASE_URL).username),
      );
      await migration.pool.query(applicationGrantsSql(role, schema));
      db = database(direct(process.env.OS_DATABASE_URL), { schema });
      for (const [user, s] of sessions) {
        await migration.pool.query(
          'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$1,$2,true,now(),now())',
          [user, s.user.email],
        );
        await migration.pool.query(
          'INSERT INTO "session"(id,token,"userId","expiresAt","createdAt","updatedAt") VALUES($1,$1,$2,now()+interval \'1 day\',now(),now())',
          [s.session.id, user],
        );
      }
      for (const organization of [org, capOrg])
        await tx(async (c) => {
          await c.query(
            "INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional isolated races',$1,'USD','UTC')",
            [organization],
          );
          for (const user of sessions.keys())
            await c.query(
              "INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'admin')",
              [organization, user],
            );
        }, organization);
      f = learningMappedFixture();
      old = appendLearningTestMeasurement(f, 0, { recordId: "original" });
      await tx(async (c) => {
        for (const r of f.records) await seedRecord(c, org, r);
        for (const p of f.approvedEvidence) {
          const record = f.records.find((r) => r.id === p.pin.recordId);
          await c.query(
            "INSERT INTO os_events(id,org_id,actor_id,action,record_id,module_id,detail,created_at) VALUES($1,$2,$3,'record.approved',$4,$5,$6,$7)",
            [
              p.approvalEvent.id,
              org,
              p.approval.actorId,
              record.id,
              record.moduleId,
              JSON.stringify({ record }),
              p.approvalEvent.createdAtExact,
            ],
          );
        }
        for (const source of f.sources)
          await insertLearningHistory(c, org, "source", source);
        for (const p of f.approvedEvidence.filter(
          (p) => p.pin.recordId !== "original",
        ))
          await insertLearningHistory(c, org, "evidence", p);
        for (const e of f.events)
          await insertLearningHistory(c, org, "event", e, {
            receipt: {
              version: 1,
              operation: e.payload.kind === "mapped" ? "map" : "measure",
              commandHash: H("command", { seed: e.sha256 }),
              requestHash: "1".repeat(64),
              actorBindingHash: "2".repeat(64),
              actorId: author,
              sessionSha256: "3".repeat(64),
              membershipSha256: "4".repeat(64),
              memberCreatedAtExact: "2026-10-27T00:00:00.000000Z",
              restoreEpochSha256: "5".repeat(64),
              previewId: "seed-" + e.sequence,
              reviewSha256: "6".repeat(64),
              acceptedAt: "2026-10-27T00:00:00.000Z",
              result: {
                outcome: e.payload.kind,
                head: headPin(e),
                records: e.payload.records ?? [e.payload.record],
                report: null,
              },
            },
          });
      });
      await migration.pool.query("SELECT setval('os_events_id_seq',1000)");
      const state = () => tx((c) => loadLearningInventory(c, org)),
        measurement = async (value) => {
          const inventory = await state();
          return learningMeasurementInput(
            { ...f, head: inventory.bindings[0].head },
            value,
          );
        };
      let accepted;
      await t.test(
        "parallel identical command keys accept once and return exact durable result",
        async () => {
          const p = await preview("measure", await measurement(2)),
            input = intent(p),
            before = await counts(),
            results = await releaseTogether([
              () => commit(input),
              () => commit(input),
            ]);
          assert(results.every((r) => r.status === "fulfilled"));
          assert.deepEqual(results.map((r) => r.value.kind).sort(), [
            "already-committed",
            "committed",
          ]);
          assert.deepEqual(results[0].value.result, results[1].value.result);
          accepted = { input, result: results[0].value.result };
          const after = await counts();
          assert.equal(Number(after.records) - Number(before.records), 1);
          assert.equal(Number(after.history) - Number(before.history), 1);
        },
      );
      await t.test(
        "parallel competing pending corrections reserve one leaf and leave no second draft",
        async () => {
          const input = {
              measurement: await measurement(3),
              replaces: old.proof.evidence.pin,
              reason: "Fictional explicit correction",
            },
            one = await preview("correct", input),
            two = await preview("correct", {
              ...input,
              measurement: { ...input.measurement, value: 4 },
            }),
            before = await counts(),
            results = await releaseTogether([
              () => commit(intent(one)),
              () => commit(intent(two)),
            ]);
          assert.equal(
            results.filter((r) => r.status === "fulfilled").length,
            1,
          );
          assert.equal(
            results.find((r) => r.status === "rejected").reason.status,
            409,
          );
          const inventory = await state(),
            attempt = inventory.bindings[0].corrections.find(
              (a) => a.state === "pending",
            );
          assert(attempt);
          assert.equal(
            Number((await counts()).records) - Number(before.records),
            1,
          );
          const abandoned = await preview("abandon-correction", {
            head: inventory.bindings[0].head,
            correctionEventSha256: attempt.eventSha256,
            reason: "Close fictional competing attempt without approval",
          });
          await commit(intent(abandoned));
        },
      );
      await t.test(
        "parallel apply versus abandon has exactly one permanent terminal and approved candidate stays explicit",
        async () => {
          const input = {
              measurement: await measurement(5),
              replaces: old.proof.evidence.pin,
              reason: "Fresh fictional replacement",
            },
            p = await preview("correct", input),
            created = await commit(intent(p)),
            row = await tx(async (c) =>
              rowRecord(
                (
                  await c.query(
                    "SELECT * FROM os_records WHERE org_id=$1 AND id=$2",
                    [org, created.result.records[0].recordId],
                  )
                ).rows[0],
              ),
            ),
            resolved = await approve(row),
            inventory = await state(),
            head = inventory.bindings[0].head,
            apply = await preview("apply-correction", {
              head,
              correctionEventSha256: p.plan.event.sha256,
              replacement: resolved.pin,
            }),
            abandon = await preview("abandon-correction", {
              head,
              correctionEventSha256: p.plan.event.sha256,
              reason: "Fictional deliberate abandonment",
            }),
            results = await releaseTogether([
              () => commit(intent(apply)),
              () => commit(intent(abandon)),
            ]);
          assert.equal(
            results.filter((r) => r.status === "fulfilled").length,
            1,
          );
          assert.equal(
            results.find((r) => r.status === "rejected").reason.status,
            409,
          );
          const after = await state(),
            attempt = after.bindings[0].corrections.find(
              (a) => a.eventSha256 === p.plan.event.sha256,
            );
          assert(["applied", "abandoned"].includes(attempt.state));
          assert.equal(
            after.events.filter(
              (e) => e.payload.correctionEventSha256 === p.plan.event.sha256,
            ).length,
            1,
          );
          if (attempt.state === "applied")
            assert.equal(
              results.find((r) => r.status === "fulfilled").value.result
                .records[0].recordId,
              resolved.recordId,
            );
        },
      );
      await t.test(
        "revoked and recreated membership cannot reuse an old accepted command incarnation",
        async () => {
          const before = await counts();
          await tx((c) =>
            c.query("DELETE FROM os_members WHERE org_id=$1 AND user_id=$2", [
              org,
              author,
            ]),
          );
          await assert.rejects(commit(accepted.input), (e) => e.status === 403);
          await tx((c) =>
            c.query(
              "INSERT INTO os_members(org_id,user_id,role,created_at) VALUES($1,$2,'admin',clock_timestamp())",
              [org, author],
            ),
          );
          await assert.rejects(commit(accepted.input), (e) => e.status === 409);
          assert.deepEqual(await counts(), before);
        },
      );
      await t.test(
        "actual500 active typed origins accept; +1 projection and generic restore refuse atomically",
        async () => {
          const foundation = learningMappedFixture({
              orgId: capOrg,
              bindingId: "cap-foundation",
            }),
            records = [],
            sources = [],
            events = [];
          for (let b = 0; b < 6; b++) {
            const base = learningMappedFixture({
                orgId: capOrg,
                bindingId: "cap-binding-" + b,
              }),
              maps = b === 5 ? 6 : 8;
            sources.push(base.source);
            let previous = null;
            for (let m = 1; m <= maps; m++) {
              const count = b === 5 && m === 6 ? 5 : 10,
                mapping = structuredClone(base.mapping);
              mapping.indicators = Array.from({ length: count }, (_, i) => ({
                ...structuredClone(mapping.indicators[0]),
                slot: i + 1,
              }));
              const compiled = compileLearningMapping(
                  base.source,
                  mapping,
                  foundation.programId,
                ),
                created = [
                  ...compiled.indicators.map((x, i) => ({
                    id: `cap-${b}-${m}-${i}`,
                    moduleId: "outcomes",
                    data: x.data,
                  })),
                  {
                    id: `cap-${b}-${m}-protocol`,
                    moduleId: "evaluation",
                    data: compiled.protocol,
                  },
                ];
              for (const r of created)
                records.push({
                  ...r,
                  orgId: capOrg,
                  status: "draft",
                  ownerId: author,
                  lastEditedBy: author,
                  revision: 1,
                  approval: null,
                  snapshot: null,
                  source: null,
                });
              const event = makeLearningEvent({
                format: "charitology-learning-event",
                version: 1,
                originOrgId: capOrg,
                bindingId: base.bindingId,
                sequence: m,
                previous: previous ? headPin(previous) : null,
                actorId: author,
                recordedAt: "2026-10-27T00:00:00.000Z",
                programId: foundation.programId,
                payload: {
                  kind: "mapped",
                  mode: m === 1 ? "new" : "remap",
                  source: sourcePin(base.source),
                  program: workingPin(foundation.program.record),
                  mapping,
                  mappingNumber: m,
                  records: created.map((r) => ({
                    moduleId: r.moduleId,
                    recordId: r.id,
                    revision: 1,
                    dataSha256: H("data", r.data),
                  })),
                },
              });
              events.push(event);
              previous = event;
            }
          }
          assert.equal(records.length, 501);
          const trash = records.find((r) => r.moduleId === "outcomes");
          trash.deletedAt = "2026-10-27T00:00:00.000Z";
          await tx(async (c) => {
            await seedRecord(c, capOrg, foundation.program.record);
            for (const r of records) await seedRecord(c, capOrg, r);
            for (const s of sources)
              await insertLearningHistory(c, capOrg, "source", s, {
                mode: "recovered",
              });
            for (const e of events)
              await insertLearningHistory(c, capOrg, "event", e, {
                mode: "recovered",
              });
          }, capOrg);
          assert.equal(
            await tx((c) => checkLearningActiveRecords(c, capOrg), capOrg),
            500,
          );
          await assert.rejects(
            tx(
              (c) =>
                checkLearningActiveRecords(c, capOrg, {
                  additional: ["a-new-typed-record"],
                }),
              capOrg,
            ),
            (e) => e.code === "learning_quota",
          );
          await ordinary(`modules/outcomes/records/${trash.id}/restore`, {
            method: "POST",
            body: { revision: 1 },
            organization: capOrg,
            expect: 422,
          });
          assert.equal(
            (
              await tx(
                (c) =>
                  c.query(
                    "SELECT deleted_at IS NOT NULL AS deleted,revision FROM os_records WHERE org_id=$1 AND id=$2",
                    [capOrg, trash.id],
                  ),
                capOrg,
              )
            ).rows[0].deleted,
            true,
          );
          const active = records.find(
            (r) => r.id !== trash.id && r.moduleId === "outcomes",
          );
          await tx(
            (c) =>
              c.query(
                "UPDATE os_records SET deleted_at=now() WHERE org_id=$1 AND id=$2",
                [capOrg, active.id],
              ),
            capOrg,
          );
          await ordinary(`modules/outcomes/records/${trash.id}/restore`, {
            method: "POST",
            body: { revision: 1 },
            organization: capOrg,
          });
          assert.equal(
            await tx((c) => checkLearningActiveRecords(c, capOrg), capOrg),
            500,
          );
        },
      );
    } finally {
      await db?.close();
      await migration?.close();
      await owner.pool.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
      await owner.close();
    }
  },
);
