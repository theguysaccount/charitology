/** Isolated schema only; synthetic auth rows, no email/provider. Not production acceptance. */
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { database, allRecords, saveRecord, audit } from "../lib/database.mjs";
import { attendanceRoutes, isOfflineAttendanceReview } from "../lib/attendance-from-bookings.mjs";
import { participationTerms } from "../lib/participation.mjs";
import { validateRecord } from "../lib/modules.mjs";
import { hash } from "../lib/security.mjs";
import { assembleWorkspaceBackup } from "../lib/workspace-backup.mjs";
import { validateBackup } from "../lib/backup.mjs";
import {
  restoredParticipation,
  restoreParticipation,
} from "../lib/participation-backup.mjs";

const configured = !!(process.env.DATABASE_URL && process.env.OS_DATABASE_URL),
  quote = (s) => '"' + s.replaceAll('"', '""') + '"';
const direct = (value) => {
  const u = new URL(value);
  if (u.hostname.endsWith(".neon.tech"))
    u.hostname = u.hostname.replace(/-pooler(?=\.)/, "");
  return u.toString();
};
const settings = { secret: "fictional-isolated-attendance-secret-more-than32" },
  staff = "fictional-attendance-author",
  org = "fictional-attendance-org";
test(
  "actual constrained PostgreSQL attendance drafts, atomic duplicate guard and inactive restore",
  {
    skip: configured
      ? false
      : "Set explicit owner and constrained test URLs for an isolated schema.",
    timeout: 900000,
  },
  async (t) => {
    const schema = "os_attendance_" + randomBytes(8).toString("hex"),
      owner = database(process.env.DATABASE_URL);
    let migration, db;
    try {
      await owner.pool.query(`CREATE SCHEMA ${quote(schema)}`);
      migration = database(direct(process.env.DATABASE_URL), { schema });
      await migration.migrate();
      await migration.pool.query(
        'CREATE TABLE "user"(id text PRIMARY KEY,email text,"emailVerified" boolean); CREATE TABLE "session"(id text PRIMARY KEY,"userId" text NOT NULL,"expiresAt" timestamptz NOT NULL)',
      );
      await migration.pool.query('INSERT INTO "user" VALUES($1,$2,true)', [
        staff,
        "fictional@example.invalid",
      ]);
      await migration.pool.query(
        "INSERT INTO \"session\" VALUES($1,$2,now()+interval '1 day')",
        ["session-" + staff, staff],
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
      await db.tx(staff, org, async (c) => {
        await c.query(
          "INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional attendance',$1,'USD','UTC')",
          [org],
        );
        await c.query(
          "INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'admin')",
          [org, staff],
        );
      });
      const session = {
        user: { id: staff },
        session: { id: "session-" + staff },
      };
      const call = (target, action = "", input = {}, o = org, caller = session) => {
        const method = !action || action === "offline/issue" ? "GET" : "POST";
        const endpoint = `/api/orgs/${o}/participation-targets/${target}/attendance${action ? "/" + action : ""}`;
        return db.tx(
          staff,
          o,
          async (c) => {
            const response = await attendanceRoutes({
              c,
              org: o,
              user: staff,
              session: caller,
              settings,
              tail: `participation-targets/${target}/attendance${action ? "/" + action : ""}`,
              method,
              input,
              url: new URL(
                `https://os.example.invalid${endpoint}`,
              ),
            });
            return response.json();
          },
          { lock: method !== "GET", readOnly: method === "GET" || isOfflineAttendanceReview(endpoint, method) },
        );
      };
      const seed = (target, module = "events") =>
        db.tx(
          staff,
          org,
          async (c) => {
            const records = await allRecords(c, org);
            const put = async (
              id,
              moduleId,
              data,
              status = "draft",
              revision = 1,
              approval = null,
            ) => {
              const r = {
                id,
                orgId: org,
                moduleId,
                data: validateRecord(moduleId, data, {
                  orgId: org,
                  recordId: id,
                  status,
                  records,
                }),
                status,
                revision,
                ownerId: staff,
                lastEditedBy: staff,
                approval,
                snapshot: null,
                source: null,
              };
              await saveRecord(c, r);
              records.push(r);
              return r;
            };
            let program = records.find((r) => r.id === "program");
            if (!program)
              program = await put("program", "programs", {
                title: "Fictional program",
                kind: "program",
              });
            const source = await put(
              target,
              module,
              {
                title: "Fictional ended " + target,
                kind: module === "events" ? "session" : "shift",
                programId: "program",
                startAt: "2001-01-02T09:00:00Z",
                endAt: "2001-01-02T11:00:00Z",
                timeZone: "UTC",
                capacity: 20,
                participationPurpose: "Fictional whole occurrence.",
                organizerEmail: "fictional@example.invalid",
              },
              // Ended by its actual timestamp; still open while the active
              // booking is seeded through the unchanged ordinary validator.
              "open",
              5,
              {
                status: "approved",
                revision: 5,
                actorId: "different-fictional-account",
              },
            );
            const contact = await put(target + "-contact", "contacts", {
              title: "Fictional contact",
              kind: "person-reference",
            });
            const booking = await put(
              target + "-booking",
              module,
              {
                title: "Fictional booking",
                kind: module === "events" ? "registration" : "assignment",
                programId: "program",
                [module === "events" ? "eventId" : "shiftId"]: target,
                contactId: contact.id,
              },
              module === "events" ? "scheduled" : "assigned",
              4,
            );
            const terms = participationTerms(source);
            await c.query(
              "INSERT INTO os_participation_targets(org_id,target_id,module_id,revision,source_revision,terms,terms_hash,created_by) VALUES($1,$2,$3,2,5,$4,$5,$6)",
              [org, target, module, JSON.stringify(terms), hash(terms), staff],
            );
            await c.query(
              "INSERT INTO os_participations(org_id,id,target_id,module_id,booking_record_id,contact_id,state,revision,source,frozen,confirmed_at,created_by) VALUES($1,$2,$3,$4,$5,$6,'confirmed',3,'staff',$7,now(),$8)",
              [
                org,
                target + "-participation",
                target,
                module,
                booking.id,
                contact.id,
                JSON.stringify({
                  terms,
                  termsHash: hash(terms),
                  sourceRevision: 5,
                  candidateRevision: 3,
                  candidateApproval: {
                    status: "approved",
                    revision: 3,
                    actorId: "different-fictional-account",
                  },
                  programId: "program",
                }),
                staff,
              ],
            );
          },
          { lock: true },
        );
      const prepare = async (target, count = 0) => {
        const ctx = await call(target);
        return call(target, "preview", {
          contextSha256: ctx.contextSha256,
          title: "Fictional whole attendance",
          reportedAttendance: count,
          registeredCount: null,
          walkInCount: null,
          wholeOccurrence: true,
        });
      };
      const create = (target, p, key) =>
        call(target, "create", {
          previewToken: p.previewToken,
          idempotencyKey: key,
        });
      await t.test("worksheet review is read-only and concurrent devices share one retained attendance receipt", async () => {
        const target = "offline-event";
        await seed(target);
        const second = { ...session, session: { id: "fictional-attendance-second-device" } };
        await migration.pool.query('INSERT INTO "session" VALUES($1,$2,now()+interval \'1 day\')',[second.session.id,staff]);
        const issued = await call(target,"offline/issue");
        const blank = JSON.parse(Buffer.from(issued.packetBase64,"base64"));
        assert.equal(blank.counts.reportedAttendance,null);
        const exactBytes = Buffer.from(JSON.stringify({ ...blank, counts: { ...blank.counts, reportedAttendance: 0 } })+"\n");
        const file = { packetBase64: exactBytes.toString("base64") };
        const changed = { packetBase64: Buffer.concat([exactBytes,Buffer.from(" ")]).toString("base64") };
        const preview = async (body, caller) => {
          const checked = await call(target,"offline/inspect",body,org,caller);
          assert.equal(checked.kind,"review-file");
          return call(target,"offline/preview",{
            ...body, fileSha256: checked.fileSha256, contextSha256: checked.context.contextSha256,
            title:"Fictional whole-event worksheet", wholeOccurrence:true,
          },org,caller);
        };
        const [one,two,different] = await Promise.all([
          preview(file,session),preview(file,second),preview(changed,second),
        ]);
        const body = { previewToken:one.previewToken,idempotencyKey:"fictional-offline-device-a" };
        const [a,b] = await Promise.all([
          call(target,"create",body),
          call(target,"create",{previewToken:two.previewToken,idempotencyKey:"fictional-offline-device-b"},org,second),
        ]);
        assert.deepEqual([a.kind,b.kind].sort(),["already-created","created"]);
        assert.equal(a.record.id,b.record.id);
        assert.equal(a.record.approval,null);
        assert.equal(a.record.data.attendanceCount,0);
        assert.equal(a.record.data.registeredCount,null);
        assert.equal((await call(target,"offline/inspect",file,org,second)).kind,"already-file");
        await assert.rejects(call(target,"create",{
          previewToken:different.previewToken,idempotencyKey:"fictional-offline-device-c",
        },org,second),{code:"offline_attendance_conflict"});
        await db.tx(staff,org,async c=>{
          const kept = await c.query("SELECT detail FROM os_events WHERE org_id=$1 AND action='attendance.draft-created' AND record_id=$2",[org,a.record.id]);
          assert.equal(kept.rowCount,1);
          assert.equal(kept.rows[0].detail.attendanceReceipt.offlinePacket.fileSha256,hash(exactBytes));
          assert.doesNotMatch(JSON.stringify(kept.rows[0].detail),/packetBase64|issueSeal/);
          assert.equal((await c.query("SELECT count(*)::int AS n FROM os_participation_outbox WHERE org_id=$1",[org])).rows[0].n,0);
          await c.query("UPDATE os_records SET deleted_at=now() WHERE org_id=$1 AND id=$2",[org,a.record.id]);
        });
        assert.equal((await call(target,"offline/inspect",file,org,second)).context.existing.disposition,"trash");
        await assert.rejects(call(target,"offline/inspect",changed,org,second),{code:"offline_attendance_conflict"});
      });
      await t.test(
        "read-only GET, explicit zero and whole count above confirmations preserve null facts for both modules",
        async () => {
          for (const [target, module, count] of [
            ["event", "events", 0],
            ["shift", "volunteers", 7],
          ]) {
            await seed(target, module);
            const ctx = await call(target);
            assert.equal(ctx.canPrepare, true);
            assert.equal(ctx.sourceContext.confirmedPlaces, 1);
            const p = await prepare(target, count),
              r = await create(target, p, "fictional-create-" + target);
            assert.equal(r.record.status, "draft");
            assert.equal(r.record.approval, null);
            assert.equal(r.record.snapshot, null);
            assert.equal(
              r.record.data[
                module === "events" ? "attendanceCount" : "participants"
              ],
              count,
            );
            assert.equal(r.record.data.startAt, null);
            assert.equal(r.record.data.endAt, null);
            if (module === "events") {
              assert.equal(r.record.data.registeredCount, null);
              assert.equal(r.record.data.walkInCount, null);
            } else assert.equal(r.record.data.minutes, null);
          }
        },
      );
      await t.test(
        "exact retry retains a later ordinary revision; source booking rows/outbox are unchanged",
        async () => {
          await seed("retry");
          const p = await prepare("retry"),
            made = await create("retry", p, "fictional-create-retry");
          const before = await db.tx(
            staff,
            org,
            async (c) =>
              (
                await c.query(
                  "SELECT id,state,revision,frozen,consent FROM os_participations WHERE org_id=$1 ORDER BY id",
                  [org],
                )
              ).rows,
            { readOnly: true },
          );
          await db.tx(
            staff,
            org,
            async (c) => {
              const records = await allRecords(c, org),
                r = records.find((r) => r.id === made.record.id);
              r.data.attendanceCount = 4;
              r.revision++;
              r.data = validateRecord(r.moduleId, r.data, {
                records,
                orgId: org,
                recordId: r.id,
                status: r.status,
              });
              await saveRecord(c, r);
            },
            { lock: true },
          );
          const replay = await create("retry", p, "fictional-create-retry");
          assert.equal(replay.kind, "already-created");
          assert.equal(replay.record.revision, 2);
          assert.equal(replay.record.data.attendanceCount, 4);
          await db.tx(
            staff,
            org,
            async (c) => {
              assert.deepEqual(
                (
                  await c.query(
                    "SELECT id,state,revision,frozen,consent FROM os_participations WHERE org_id=$1 ORDER BY id",
                    [org],
                  )
                ).rows,
                before,
              );
              assert.equal(
                Number(
                  (
                    await c.query(
                      "SELECT count(*) FROM os_participation_outbox WHERE org_id=$1",
                      [org],
                    )
                  ).rows[0].count,
                ),
                0,
              );
            },
            { readOnly: true },
          );
        },
      );
      await t.test(
        "helper-first and mixed real transactions reserve only helper-owned occurrences",
        async () => {
          await seed("race");
          const p = await prepare("race", 3);
          const results = await Promise.allSettled([
            create("race", p, "fictional-race-one"),
            create("race", p, "fictional-race-two"),
          ]);
          assert.equal(
            results.filter((r) => r.status === "fulfilled").length,
            1,
          );
          assert.equal(
            results.find((r) => r.status === "rejected").reason.code,
            "attendance_exists",
          );
          await assert.rejects(
            () =>
              db.tx(
                staff,
                org,
                async (c) => {
                  await saveRecord(c, {
                    ...p.preview.candidate,
                    id: "generic-duplicate",
                  });
                },
                { lock: true },
              ),
            (e) => e.code === "attendance_exists",
          );
          await seed("mixed");
          const q = await prepare("mixed", 2);
          const mixed = await Promise.allSettled([
            create("mixed", q, "fictional-mixed-helper"),
            db.tx(
              staff,
              org,
              (c) =>
                saveRecord(c, { ...q.preview.candidate, id: "generic-mixed" }),
              { lock: true },
            ),
          ]);
          assert.equal(mixed.filter((r) => r.status === "fulfilled").length, 1);
          assert.equal(
            mixed.find((r) => r.status === "rejected").reason.code,
            "attendance_exists",
          );
          for (const [key, value] of [
            ["kind", "registration"],
            ["eventId", null],
            ["programId", null],
            ["contactId", "race-contact"],
          ])
            await assert.rejects(
              () =>
                db.tx(
                  staff,
                  org,
                  (c) =>
                    saveRecord(c, {
                      ...p.preview.candidate,
                      revision: 2,
                      data: { ...p.preview.candidate.data, [key]: value },
                    }),
                  { lock: true },
                ),
              (e) => e.code === "attendance_guard",
            );
        },
      );
      await t.test(
        "manual-first blocks the helper but ordinary manual duplicates and corrections retain their old behavior",
        async () => {
          await seed("manual");
          const p = await prepare("manual", 2);
          const putManual = (id) =>
            db.tx(
              staff,
              org,
              (c) => saveRecord(c, { ...p.preview.candidate, id }),
              { lock: true },
            );
          await putManual("manual-one");
          await assert.rejects(
            () => create("manual", p, "fictional-manual-first"),
            (e) => e.code === "attendance_exists",
          );
          const results = await Promise.allSettled([
            putManual("manual-two"),
            putManual("manual-three"),
          ]);
          assert.equal(
            results.filter((r) => r.status === "fulfilled").length,
            2,
          );
          await db.tx(
            staff,
            org,
            async (c) => {
              await saveRecord(c, {
                ...p.preview.candidate,
                id: "manual-one",
                revision: 2,
                data: {
                  ...p.preview.candidate.data,
                  contactId: "manual-contact",
                },
              });
              const { rows } = await c.query(
                "SELECT data FROM os_records WHERE org_id=$1 AND id='manual-one'",
                [org],
              );
              assert.equal(rows[0].data.contactId, "manual-contact");
            },
            { lock: true },
          );
          const context = await call("manual");
          assert.equal(context.canPrepare, false);
          assert.equal(context.existing, null);
          assert.match(context.reason, /multiple/i);
        },
      );
      await t.test(
        "failure of the mandatory real audit rolls the ordinary insert back",
        async () => {
          await seed("rollback");
          const p = await prepare("rollback");
          await migration.pool.query(
            `CREATE FUNCTION ${quote(schema)}.reject_attendance_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='attendance.draft-created' THEN RAISE EXCEPTION 'fictional audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_attendance_audit BEFORE INSERT ON ${quote(schema)}.os_events FOR EACH ROW EXECUTE FUNCTION ${quote(schema)}.reject_attendance_audit()`,
          );
          try {
            await assert.rejects(() =>
              create("rollback", p, "fictional-rollback-command"),
            );
          } finally {
            await migration.pool.query(
              `DROP TRIGGER reject_attendance_audit ON ${quote(schema)}.os_events; DROP FUNCTION ${quote(schema)}.reject_attendance_audit()`,
            );
          }
          await db.tx(
            staff,
            org,
            async (c) => {
              assert.equal(
                Number(
                  (
                    await c.query(
                      "SELECT count(*) FROM os_records WHERE org_id=$1 AND data->>'kind'='attendance' AND data->>'eventId'='rollback'",
                      [org],
                    )
                  ).rows[0].count,
                ),
                0,
              );
              assert.equal(
                Number(
                  (
                    await c.query(
                      "SELECT count(*) FROM os_events WHERE org_id=$1 AND action='attendance.draft-created' AND detail#>>'{attendanceReceipt,targetId}'='rollback'",
                      [org],
                    )
                  ).rows[0].count,
                ),
                0,
              );
            },
            { readOnly: true },
          );
        },
      );
      await t.test(
        "full export/typed restore preserves counts without installing original receipt authority",
        async () => {
          // Own source setup: earlier subtest failures cannot substitute for
          // either a successful create or a preserved retry/restore assertion.
          await seed("restore");
          const p = await prepare("restore", 4);
          await create("restore", p, "fictional-create-restore");
          const backup = await db.tx(
            staff,
            org,
            (c) => assembleWorkspaceBackup(c, org),
            { lock: true },
          );
          const restoredOrg = "fictional-attendance-restored",
            records = validateBackup(backup, restoredOrg, staff),
            participation = restoredParticipation(backup);
          await db.tx(
            staff,
            restoredOrg,
            async (c) => {
              await c.query(
                "INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional restored',$1,'USD','UTC')",
                [restoredOrg],
              );
              await c.query(
                "INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'admin')",
                [restoredOrg, staff],
              );
              for (const r of records) {
                await saveRecord(c, r);
                await audit(c, restoredOrg, staff, "record.restored", r, {
                  record: r,
                  sourceChecksum: backup.checksum,
                });
              }
              await restoreParticipation(c, restoredOrg, staff, participation);
            },
            { lock: true },
          );
          const ctx = await call("restore", "", {}, restoredOrg);
          assert.equal(ctx.canPrepare, false);
          assert.equal(ctx.existing.record.data.attendanceCount, 4);
          assert.equal(ctx.existing.record.data.walkInCount, null);
          assert.equal(ctx.existing.record.approval, null);
          await db.tx(
            staff,
            restoredOrg,
            async (c) => {
              assert.equal(
                Number(
                  (
                    await c.query(
                      "SELECT count(*) FROM os_events WHERE org_id=$1 AND action='attendance.draft-created'",
                      [restoredOrg],
                    )
                  ).rows[0].count,
                ),
                0,
              );
            },
            { readOnly: true },
          );
          await assert.rejects(
            () =>
              call(
                "restore",
                "create",
                {
                  previewToken: p.previewToken,
                  idempotencyKey: "fictional-create-restore",
                },
                restoredOrg,
              ),
            (e) => e.code === "attendance_stale",
          );
        },
      );
    } finally {
      if (db) await db.close();
      if (migration) await migration.close();
      await owner.pool.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
      await owner.close();
    }
  },
);
