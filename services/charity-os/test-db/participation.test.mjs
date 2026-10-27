import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  database,
  saveRecord,
  allRecords,
  logicalBackupBytes,
} from "../lib/database.mjs";
import {
  participationRoutes,
  participantParticipationRoutes,
  participationTerms,
  participationQuota,
} from "../lib/participation.mjs";
import {
  exportParticipation,
  restoredParticipation,
  restoreParticipation,
} from "../lib/participation-backup.mjs";
import { guardParticipationWrite } from "../lib/participation-guards.mjs";
import { membership } from "../lib/access.mjs";
import { validateRecord } from "../lib/modules.mjs";
import { hash, csrf } from "../lib/security.mjs";
const configured = !!(process.env.DATABASE_URL && process.env.OS_DATABASE_URL),
  quote = (s) => '"' + s.replaceAll('"', '""') + '"';
const direct = (value) => {
  const u = new URL(value);
  if (u.hostname.endsWith(".neon.tech"))
    u.hostname = u.hostname.replace(/-pooler(?=\.)/, "");
  return u.toString();
};
const settings = {
  origin: "https://os.example.invalid",
  secret: "fictional-booking-secret-of-more-than-32-characters",
};
const ownSession = {
  user: {
    id: "fictional-participant",
    email: "fictional@example.invalid",
    emailVerified: true,
  },
  session: { id: "fictional-session" },
};
const err = (code) => (e) => e.code === code;
let serial = 0;
const key = () => "fictional-intent-" + (++serial).toString().padStart(12, "0");
test(
  "actual PostgreSQL participation ledger, safe recovery and own-only booking controls (synthetic identities; no transport)",
  {
    skip: configured
      ? false
      : "Set owner and constrained app URLs for isolated schema tests.",
    timeout: 900000,
  },
  async (t) => {
    const schema = "os_booking_" + randomBytes(8).toString("hex"),
      owner = database(process.env.DATABASE_URL);
    let migration, db;
    const org = "fictional-booking-org",
      staff = "fictional-staff";
    try {
      await owner.pool.query(`CREATE SCHEMA ${quote(schema)}`);
      migration = database(direct(process.env.DATABASE_URL), { schema });
      await migration.migrate();
      const appRole = decodeURIComponent(
        new URL(process.env.OS_DATABASE_URL).username,
      );
      assert.notEqual(
        appRole,
        decodeURIComponent(new URL(process.env.DATABASE_URL).username),
      );
      await owner.pool.query(
        `GRANT USAGE ON SCHEMA ${quote(schema)} TO ${quote(appRole)}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${quote(schema)} TO ${quote(appRole)}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${quote(schema)} TO ${quote(appRole)}`,
      );
      db = database(direct(process.env.OS_DATABASE_URL), { schema });
      await db.tx(staff, org, async (c) => {
        await c.query(
          "INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional booking organization',$1,'USD','UTC')",
          [org],
        );
        await c.query(
          "INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'admin'),($1,'fictional-reader','board_reader')",
          [org, staff],
        );
      });
      const staffCall = (tail, input, actor = staff) =>
        db.tx(
          actor,
          org,
          async (c) => {
            const member = await membership(c, org, actor),
              method = input === undefined ? "GET" : "POST",
              r = await participationRoutes({
                c,
                org,
                user: actor,
                member,
                tail: "participation-targets" + (tail ? "/" + tail : ""),
                method,
                input: input || {},
                url: new URL(
                  settings.origin +
                    "/api/orgs/" +
                    org +
                    "/participation-targets" +
                    (tail ? "/" + tail : ""),
                ),
                settings,
              });
            return { status: r.status, ...(await r.json()) };
          },
          { lock: true },
        );
      const makeTarget = async (
        id,
        moduleId = "events",
        capacity = 1,
        start = "2099-01-02T09:00:00+00:00",
        end = "2099-01-02T11:00:00+00:00",
      ) =>
        db.tx(
          staff,
          org,
          async (c) => {
            const records = await allRecords(c, org),
              r = {
                id,
                orgId: org,
                moduleId,
                status: moduleId === "events" ? "scheduled" : "open",
                revision: 4,
                ownerId: "fictional-author",
                lastEditedBy: "fictional-author",
                approval: {
                  status: "approved",
                  revision: 4,
                  actorId: "fictional-reviewer",
                },
                snapshot: null,
                source: null,
                data: {
                  title: "Fictional occurrence " + id,
                  kind: moduleId === "events" ? "session" : "shift",
                  startAt: start,
                  endAt: end,
                  timeZone: "UTC",
                  capacity,
                  participationPurpose:
                    "Arrange this fictional operational occurrence.",
                  participantInstructions: "Bring an ordinary notebook.",
                  organizerEmail: "organizer@example.invalid",
                },
              };
            r.data = validateRecord(moduleId, r.data, {
              recordId: id,
              orgId: org,
              status: r.status,
              records,
            });
            await saveRecord(c, r);
            return r;
          },
          { lock: true },
        );
      const makeCandidate = async (
        id,
        target,
        contactId = id + "-contact",
        { legacy = false, withIntake = false } = {},
      ) =>
        db.tx(
          staff,
          org,
          async (c) => {
            const records = await allRecords(c, org);
            let contact = records.find((r) => r.id === contactId);
            if (!contact) {
              contact = {
                id: contactId,
                orgId: org,
                moduleId: "contacts",
                status: "draft",
                revision: 1,
                ownerId: staff,
                lastEditedBy: staff,
                approval: null,
                snapshot: null,
                source: null,
                data: validateRecord(
                  "contacts",
                  {
                    title: "Fictional contact",
                    kind: "person-reference",
                    contactPreference: "permission-needed",
                  },
                  { records, status: "draft" },
                ),
              };
              await saveRecord(c, contact);
              records.push(contact);
            }
            const r = {
              id,
              orgId: org,
              moduleId: target.moduleId,
              status: legacy
                ? target.moduleId === "events"
                  ? "scheduled"
                  : "assigned"
                : "approved",
              revision: 3,
              ownerId: "fictional-author",
              lastEditedBy: "fictional-author",
              approval: {
                status: "approved",
                revision: 3,
                actorId: "fictional-reviewer",
              },
              snapshot: null,
              source: null,
              data: validateRecord(
                target.moduleId,
                {
                  title: "Fictional candidate " + id,
                  kind:
                    target.moduleId === "events"
                      ? "registration"
                      : "assignment",
                  [target.moduleId === "events" ? "eventId" : "shiftId"]:
                    target.id,
                  contactId,
                },
                {
                  recordId: id,
                  orgId: org,
                  status: legacy
                    ? target.moduleId === "events"
                      ? "scheduled"
                      : "assigned"
                    : "approved",
                  records,
                },
              ),
            };
            await saveRecord(c, r);
            let intakeId = null;
            if (withIntake) {
              intakeId = id + "-intake";
              await c.query(
                "INSERT INTO os_publications(org_id,id,record_id,source_revision,kind,schema,created_by) VALUES($1,$2,$3,1,'event-interest',$4,$5)",
                [
                  org,
                  id + "-publication",
                  target.id,
                  JSON.stringify({
                    title: "Fictional request",
                    purpose: "Arrange fictional participation",
                    questions: [],
                  }),
                  staff,
                ],
              );
              await c.query(
                "INSERT INTO os_intake(org_id,id,publication_id,answers,consent_at,status,converted_ids) VALUES($1,$2,$3,$4,now(),'converted',$5)",
                [
                  org,
                  intakeId,
                  id + "-publication",
                  JSON.stringify({
                    name: "Fictional participant",
                    email: ownSession.user.email,
                  }),
                  JSON.stringify([
                    { id, moduleId: target.moduleId },
                    { id: contactId, moduleId: "contacts" },
                  ]),
                ],
              );
              await c.query("SELECT set_config('app.user_id',$1,true)", [
                ownSession.user.id,
              ]);
              await c.query(
                "INSERT INTO os_participant_links(id,org_id,intake_id,publication_id,user_id) VALUES($1,$2,$3,$4,$5)",
                [
                  randomBytes(16).toString("hex"),
                  org,
                  intakeId,
                  id + "-publication",
                  ownSession.user.id,
                ],
              );
              await c.query("SELECT set_config('app.user_id',$1,true)", [
                staff,
              ]);
            }
            return { record: r, intakeId };
          },
          { lock: true },
        );
      const adopt = async (target) => {
        const preview = await staffCall(target.id);
        return staffCall(target.id + "/adopt", {
          targetRevision: preview.currentSourceRevision,
          expectedLegacyHash: preview.preview.legacyHash,
          idempotencyKey: key(),
        });
      };
      const associate = async (target, candidate) => {
        const view = await staffCall(target.id);
        return (
          await staffCall(target.id + "/participations", {
            targetRevision: view.target.revision,
            candidateRevision: candidate.record.revision,
            bookingRecordId: candidate.record.id,
            ...(candidate.intakeId ? { intakeId: candidate.intakeId } : {}),
            idempotencyKey: key(),
          })
        ).participation;
      };
      const offlineConsent = async (target, p, extra = {}) => {
        const view = await staffCall(target.id);
        return (
          await staffCall(target.id + "/participations/" + p.id + "/consent", {
            revision: p.revision,
            targetRevision: view.target.revision,
            sourceRevision: view.currentSourceRevision,
            termsHash: view.termsHash,
            consent: true,
            waitlistAllowed: true,
            emailUpdates: false,
            method: "fictional-test-assertion",
            evidenceRef: "fictional-reference",
            consentedAt: new Date().toISOString(),
            idempotencyKey: key(),
            ...extra,
          })
        ).participation;
      };
      const command = async (target, p, action, extra = {}) => {
        const view = await staffCall(target.id);
        return staffCall(target.id + "/participations/" + p.id + "/" + action, {
          revision: p.revision,
          targetRevision: view.target.revision,
          candidateRevision: p.candidateRevision,
          consentRevision: p.consent?.revision || 0,
          idempotencyKey: key(),
          ...extra,
        });
      };
      const ownCall = async (
        intakeId,
        pid,
        action,
        input,
        session = ownSession,
      ) => {
        const path =
            `/api/participant/orgs/${org}/requests/${intakeId}/participations` +
            (pid ? `/${pid}/${action}` : ""),
          request = new Request(
            settings.origin + path,
            input === undefined
              ? {}
              : {
                  method: "POST",
                  headers: {
                    origin: settings.origin,
                    "content-type": "application/json",
                    "x-csrf-token": csrf(session.session.id, settings.secret),
                  },
                  body: JSON.stringify(input),
                },
          ),
          r = await participantParticipationRoutes({
            request,
            db,
            settings,
            session,
          });
        return { status: r.status, ...(await r.json()) };
      };
      let event, p1, p2, c1, c2;
      await t.test(
        "forced RLS and writer-only console deny cross-tenant/index-only and snapshot readers",
        async () => {
          const flags = (
            await db.pool.query(
              "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace=current_schema()::regnamespace AND relname=ANY($1::text[])",
              [
                [
                  "os_participation_targets",
                  "os_participations",
                  "os_participation_outbox",
                ],
              ],
            )
          ).rows;
          assert.equal(flags.length, 3);
          assert.ok(
            flags.every((r) => r.relrowsecurity && r.relforcerowsecurity),
          );
          assert.deepEqual(
            (
              await db.pool.query(
                "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
              )
            ).rows[0],
            { rolsuper: false, rolbypassrls: false },
          );
          event = await makeTarget("event");
          assert.deepEqual(
            (await staffCall("", undefined, "fictional-reader")).targets,
            [],
          );
          await assert.rejects(
            staffCall(event.id, undefined, "fictional-reader"),
            err("role"),
          );
          const a = await adopt(event);
          assert.equal(a.adopted, 0);
          assert.equal(a.target.revision, 1);
          assert.equal(
            (
              await db.tx(ownSession.user.id, null, (c) =>
                c.query("SELECT * FROM os_participation_targets"),
              )
            ).rows.length,
            0,
          );
        },
      );
      await t.test(
        "requested candidates and separate consent reserve zero; concurrent final seat confirms once",
        async () => {
          c1 = await makeCandidate("candidate-one", event, "one-contact", {
            withIntake: true,
          });
          c2 = await makeCandidate("candidate-two", event);
          p1 = await associate(event, c1);
          p2 = await associate(event, c2);
          assert.equal((await staffCall(event.id)).occupied, 0);
          await assert.rejects(
            command(event, p1, "confirm"),
            err("participation_consent"),
          );
          p1 = await offlineConsent(event, p1);
          p2 = await offlineConsent(event, p2);
          const race = await Promise.allSettled([
            command(event, p1, "confirm"),
            command(event, p2, "confirm"),
          ]);
          assert.equal(race.filter((x) => x.status === "fulfilled").length, 1);
          assert.equal(
            race.find((x) => x.status === "rejected").reason.code,
            "participation_capacity",
          );
          const rows = (await staffCall(event.id + "/participations"))
            .participations;
          p1 = rows.find((p) => p.id === p1.id);
          p2 = rows.find((p) => p.id === p2.id);
          assert.equal(rows.filter((p) => p.state === "confirmed").length, 1);
          assert.equal((await staffCall(event.id)).occupied, 1);
        },
      );
      await t.test(
        "full occurrences retain explicit zero-seat waitlists; cancellation does not promote",
        async () => {
          const winner = p1.state === "confirmed" ? p1 : p2,
            loser = p1.state === "confirmed" ? p2 : p1;
          const waited = (await command(event, loser, "waitlist"))
            .participation;
          assert.equal(waited.state, "waitlisted");
          const cancelled = await command(event, winner, "cancel", {
            reason: "Fictional cancellation",
          });
          assert.equal(cancelled.participation.state, "cancelled");
          let rows = (await staffCall(event.id + "/participations"))
            .participations;
          assert.equal(
            rows.find((p) => p.id === waited.id).state,
            "waitlisted",
          );
          assert.equal((await staffCall(event.id)).occupied, 0);
          const promoted = (await command(event, waited, "promote"))
            .participation;
          assert.equal(promoted.state, "confirmed");
          rows = (await staffCall(event.id + "/participations")).participations;
          p1 = rows.find((p) => p.id === p1.id);
          p2 = rows.find((p) => p.id === p2.id);
        },
      );
      await t.test(
        "generic edits preserve frozen occupancy and cannot cancel/reuse identities or reduce capacity",
        async () => {
          const confirmed = p1.state === "confirmed" ? p1 : p2;
          await db.tx(
            staff,
            org,
            async (c) => {
              const records = await allRecords(c, org),
                r = records.find((r) => r.id === confirmed.bookingRecordId);
              await saveRecord(c, {
                ...r,
                status: "review",
                revision: r.revision + 1,
                approval: null,
                data: { ...r.data, title: "Fictional content edit" },
              });
            },
            { lock: true },
          );
          assert.equal((await staffCall(event.id)).occupied, 1);
          await assert.rejects(
            db.tx(
              staff,
              org,
              async (c) => {
                const r = (await allRecords(c, org)).find(
                  (r) => r.id === confirmed.bookingRecordId,
                );
                await saveRecord(c, {
                  ...r,
                  status: "cancelled",
                  revision: r.revision + 1,
                });
              },
              { lock: true },
            ),
            err("participation_guard"),
          );
          await assert.rejects(
            db.tx(
              staff,
              org,
              async (c) => {
                const r = (await allRecords(c, org)).find(
                  (r) => r.id === event.id,
                );
                await saveRecord(c, {
                  ...r,
                  revision: r.revision + 1,
                  data: { ...r.data, capacity: 0 },
                });
              },
              { lock: true },
            ),
            err("participation_capacity"),
          );
          const cancelled = p1.state === "cancelled" ? p1 : p2;
          await assert.rejects(
            db.tx(
              staff,
              org,
              async (c) => {
                const r = (await allRecords(c, org)).find(
                  (r) => r.id === cancelled.bookingRecordId,
                );
                await saveRecord(c, {
                  ...r,
                  revision: r.revision + 1,
                  data: { ...r.data, contactId: "different-contact" },
                });
              },
              { lock: true },
            ),
            err("participation_guard"),
          );
        },
      );
      await t.test(
        "latest intent retries have no repeated allocation, audit or outbox effects",
        async () => {
          const target = await makeTarget("replay-event"),
            candidate = await makeCandidate("replay-candidate", target);
          await adopt(target);
          let p = await associate(target, candidate);
          p = await offlineConsent(target, p);
          const view = await staffCall(target.id),
            payload = {
              revision: p.revision,
              targetRevision: view.target.revision,
              candidateRevision: p.candidateRevision,
              consentRevision: p.consent.revision,
              idempotencyKey: key(),
            };
          const confirmed = await staffCall(
            target.id + "/participations/" + p.id + "/confirm",
            payload,
          );
          const counts = () =>
            db.tx(
              staff,
              org,
              async (c) =>
                (
                  await c.query(
                    "SELECT (SELECT count(*) FROM os_events WHERE org_id=$1) AS audit,(SELECT count(*) FROM os_participation_outbox WHERE org_id=$1) AS outbox",
                    [org],
                  )
                ).rows[0],
            );
          const before = await counts();
          const retried = await staffCall(
            target.id + "/participations/" + p.id + "/confirm",
            payload,
          );
          assert.deepEqual(retried.participation, confirmed.participation);
          assert.deepEqual(await counts(), before);
          await assert.rejects(
            staffCall(target.id + "/participations/" + p.id + "/confirm", {
              ...payload,
              reason: "changed payload",
            }),
            err("participation_intent"),
          );
          const cancelInput = {
              revision: confirmed.participation.revision,
              reason: "Fictional retry cancellation",
              idempotencyKey: key(),
            },
            cancelled = await staffCall(
              target.id + "/participations/" + p.id + "/cancel",
              cancelInput,
            ),
            cancelCounts = await counts();
          const cancelRetry = await staffCall(
            target.id + "/participations/" + p.id + "/cancel",
            cancelInput,
          );
          assert.equal(
            cancelRetry.notificationQueued,
            cancelled.notificationQueued,
          );
          assert.deepEqual(await counts(), cancelCounts);
          await assert.rejects(
            staffCall(
              target.id + "/participations/" + p.id + "/confirm",
              payload,
            ),
            err("revision"),
          );
        },
      );
      await t.test(
        "scoped writers cannot read another program's booking identifiers through an allowed target",
        async () => {
          await db.tx(staff, org, async (c) => {
            for (const id of ["scope-a", "scope-b"])
              await saveRecord(c, {
                id,
                orgId: org,
                moduleId: "programs",
                status: "draft",
                revision: 1,
                ownerId: staff,
                lastEditedBy: staff,
                approval: null,
                snapshot: null,
                source: null,
                data: validateRecord(
                  "programs",
                  { title: "Fictional program " + id, kind: "program" },
                  { records: [], status: "draft" },
                ),
              });
            await c.query(
              "INSERT INTO os_members(org_id,user_id,role,program_ids) VALUES($1,'scoped-writer','program_lead',$2)",
              [org, JSON.stringify(["scope-a"])],
            );
          });
          const target = await makeTarget("scoped-target", "events", 2);
          await db.tx(
            staff,
            org,
            (c) =>
              saveRecord(c, {
                ...target,
                data: { ...target.data, programId: "scope-a" },
              }),
            { lock: true },
          );
          const candidate = await makeCandidate(
            "private-program-booking",
            target,
            "private-program-contact",
            { legacy: true },
          );
          await db.tx(
            staff,
            org,
            (c) =>
              saveRecord(c, {
                ...candidate.record,
                data: { ...candidate.record.data, programId: "scope-b" },
              }),
            { lock: true },
          );
          const preview = await staffCall(
            target.id,
            undefined,
            "scoped-writer",
          );
          assert.equal(preview.occupied, 1);
          assert.deepEqual(preview.preview.occupants, []);
          await adopt(target);
          assert.deepEqual(
            (
              await staffCall(
                target.id + "/participations",
                undefined,
                "scoped-writer",
              )
            ).participations,
            [],
          );
          assert.equal(
            (await staffCall(target.id, undefined, "scoped-writer")).occupied,
            1,
          );
        },
      );
      await t.test(
        "legacy adoption is exact/idempotent and recovered confirmations cannot silently disappear",
        async () => {
          const target = await makeTarget("legacy-event", "events", 2),
            legacy = await makeCandidate(
              "legacy-record",
              target,
              "legacy-contact",
              { legacy: true },
            ),
            preview = await staffCall(target.id),
            input = {
              targetRevision: preview.currentSourceRevision,
              expectedLegacyHash: preview.preview.legacyHash,
              idempotencyKey: key(),
            };
          await assert.rejects(
            staffCall(target.id + "/adopt", {
              ...input,
              expectedLegacyHash: "wrong",
            }),
            err("participation_legacy"),
          );
          const first = await staffCall(target.id + "/adopt", input);
          assert.equal(first.adopted, 1);
          const repeated = await staffCall(target.id + "/adopt", input);
          assert.equal(repeated.target.revision, first.target.revision);
          const ledger = (await staffCall(target.id + "/participations"))
            .participations;
          assert.equal(ledger.length, 1);
          assert.equal(ledger[0].consent, null);
          assert.equal(ledger[0].source, "legacy");
          const exported = await db.tx(staff, org, (c) =>
              exportParticipation(c, org),
            ),
            records = await db.tx(staff, org, (c) => allRecords(c, org));
          const normalized = restoredParticipation({
            records,
            participation: exported,
            intake: { submissions: [{ id: c1.intakeId }] },
          });
          assert.ok(
            normalized.participations.some(
              (p) =>
                p.recoveredState === "confirmed" && p.state === "requested",
            ),
          );
          assert.throws(
            () =>
              restoredParticipation({
                records: records.filter((r) => r.id !== legacy.record.id),
                participation: exported,
                intake: { submissions: [{ id: c1.intakeId }] },
              }),
            err("participation_backup"),
          );
        },
      );
      await t.test(
        "own access hides working terms, checks revisions, handles withdrawal chronology and permanent unlink",
        async () => {
          const event = await makeTarget("own-event"),
            c1 = await makeCandidate("own-candidate", event, "own-contact", {
              withIntake: true,
            });
          await adopt(event);
          await associate(event, c1);
          const rows = await ownCall(c1.intakeId);
          assert.equal(rows.participations.length, 1);
          assert.equal(rows.participations[0].contactId, undefined);
          await assert.rejects(
            ownCall(c1.intakeId, undefined, undefined, undefined, {
              ...ownSession,
              user: { ...ownSession.user, id: "another-user" },
            }),
            err("participation"),
          );
          const p = rows.participations[0];
          assert.equal(p.state, "requested");
          await db.tx(staff, org, (c) =>
            c.query(
              "UPDATE os_intake SET status='cancelled',cancelled_at=NULL,revision=revision+1 WHERE org_id=$1 AND id=$2",
              [org, c1.intakeId],
            ),
          );
          let own = (await ownCall(c1.intakeId)).participations[0];
          const consent = {
            revision: own.revision,
            intakeRevision: 2,
            targetRevision: own.targetRevision,
            sourceRevision: own.sourceRevision,
            termsHash: own.termsHash,
            consent: true,
            waitlistAllowed: true,
            emailUpdates: true,
            idempotencyKey: key(),
          };
          await assert.rejects(
            ownCall(c1.intakeId, own.id, "consent", consent),
            err("participation_withdrawn"),
          );
          own = (
            await ownCall(c1.intakeId, own.id, "consent", {
              ...consent,
              withdrawalAcknowledged: true,
            })
          ).participation;
          assert.equal(own.notifications.requested, true);
          assert.equal(own.withdrawalAcknowledgementRequired, true);
          const renewal = {
            ...consent,
            revision: own.revision,
            idempotencyKey: key(),
          };
          await assert.rejects(
            ownCall(c1.intakeId, own.id, "consent", renewal),
            err("participation_withdrawn"),
          );
          own = (
            await ownCall(c1.intakeId, own.id, "consent", {
              ...renewal,
              withdrawalAcknowledged: true,
            })
          ).participation;
          await db.tx(
            staff,
            org,
            async (c) => {
              const r = (await allRecords(c, org)).find(
                (r) => r.id === event.id,
              );
              await saveRecord(c, {
                ...r,
                status: "review",
                revision: r.revision + 1,
                approval: null,
                data: {
                  ...r.data,
                  participantInstructions:
                    "PRIVATE UNAPPROVED WORKING INSTRUCTIONS",
                },
              });
            },
            { lock: true },
          );
          const detail = (await ownCall(c1.intakeId)).participations[0];
          assert.ok(!JSON.stringify(detail).includes("PRIVATE UNAPPROVED"));
          assert.equal(detail.canConsent, false);
          const optedOut = (
            await ownCall(c1.intakeId, own.id, "preferences", {
              revision: detail.revision,
              intakeRevision: 2,
              emailUpdates: false,
              idempotencyKey: key(),
            })
          ).participation;
          assert.equal(optedOut.notifications.requested, false);
          const cancelled = (
            await ownCall(c1.intakeId, own.id, "cancel", {
              revision: optedOut.revision,
              intakeRevision: 2,
              idempotencyKey: key(),
            })
          ).participation;
          assert.equal(cancelled.state, "cancelled");
          await db.tx(ownSession.user.id, org, (c) =>
            c.query(
              "UPDATE os_participant_links SET revoked_at=now() WHERE org_id=$1 AND intake_id=$2",
              [org, c1.intakeId],
            ),
          );
          await assert.rejects(ownCall(c1.intakeId), err("participation"));
        },
      );
      await t.test(
        "managed and unmanaged volunteer assignments cannot overlap frozen reservations",
        async () => {
          const v = await makeTarget("volunteer-shift", "volunteers", 2),
            candidate = await makeCandidate(
              "volunteer-candidate",
              v,
              "same-volunteer",
            );
          await adopt(v);
          let p = await associate(v, candidate);
          p = await offlineConsent(v, p);
          p = (await command(v, p, "confirm")).participation;
          await db.tx(
            staff,
            org,
            async (c) => {
              const r = (await allRecords(c, org)).find(
                (r) => r.id === candidate.record.id,
              );
              await saveRecord(c, {
                ...r,
                status: "review",
                revision: r.revision + 1,
                approval: null,
                data: {
                  ...r.data,
                  title: "Fictional review preserving frozen commitment",
                },
              });
            },
            { lock: true },
          );
          const other = await makeTarget(
            "other-shift",
            "volunteers",
            2,
            "2099-01-02T10:00:00+00:00",
            "2099-01-02T12:00:00+00:00",
          );
          await assert.rejects(
            makeCandidate("unmanaged-conflict", other, "same-volunteer", {
              legacy: true,
            }),
            err("participation_overlap"),
          );
          const later = await makeTarget(
            "adjacent-shift",
            "volunteers",
            2,
            "2099-01-02T11:00:00+00:00",
            "2099-01-02T13:00:00+00:00",
          );
          await makeCandidate("adjacent-assignment", later, "same-volunteer", {
            legacy: true,
          });
          const otherCandidate = await makeCandidate(
            "managed-conflict",
            other,
            "same-volunteer",
          );
          await adopt(other);
          let q = await associate(other, otherCandidate);
          q = await offlineConsent(other, q);
          await assert.rejects(
            command(other, q, "confirm"),
            err("participation_overlap"),
          );
        },
      );
      await t.test(
        "real recovery strips reservation authority and requires explicit confirmed-occupancy reconciliation",
        async () => {
          const recoveredOrg = "fictional-recovered-booking-org",
            backup = await db.tx(staff, org, async (c) => ({
              records: await allRecords(c, org),
              participation: await exportParticipation(c, org),
              intake: {
                submissions: (
                  await c.query("SELECT id FROM os_intake WHERE org_id=$1", [
                    org,
                  ])
                ).rows,
              },
            })),
            n = restoredParticipation(backup);
          await db.tx(
            staff,
            recoveredOrg,
            async (c) => {
              await c.query(
                "INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional recovered organization',$1,'USD','UTC')",
                [recoveredOrg],
              );
              await c.query(
                "INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'admin')",
                [recoveredOrg, staff],
              );
              for (const r of backup.records)
                await saveRecord(c, {
                  ...r,
                  orgId: recoveredOrg,
                  status: "draft",
                  revision: 1,
                  approval: null,
                  snapshot: null,
                });
              await c.query(
                "INSERT INTO os_publications(org_id,id,record_id,source_revision,kind,schema,created_by,withdrawn_at) VALUES($1,'recovered-publication','event',1,'event-interest','{}',$2,now())",
                [recoveredOrg, staff],
              );
              for (const original of backup.intake.submissions)
                await c.query(
                  "INSERT INTO os_intake(org_id,id,publication_id,answers,consent_at,status) VALUES($1,$2,'recovered-publication','{}',now(),'converted')",
                  [recoveredOrg, original.id],
                );
              await restoreParticipation(c, recoveredOrg, staff, n);
              assert.equal(
                (
                  await c.query(
                    "SELECT count(*) FROM os_participations WHERE org_id=$1 AND state='confirmed'",
                    [recoveredOrg],
                  )
                ).rows[0].count,
                "0",
              );
              assert.ok(
                (
                  await c.query(
                    "SELECT * FROM os_participation_targets WHERE org_id=$1",
                    [recoveredOrg],
                  )
                ).rows.every((x) => x.recovery_block && x.mode === "paused"),
              );
              assert.equal(
                (
                  await c.query(
                    "SELECT count(*) FROM os_participant_links WHERE org_id=$1",
                    [recoveredOrg],
                  )
                ).rows[0].count,
                "0",
              );
              assert.equal(
                (
                  await c.query(
                    "SELECT count(*) FROM os_participation_outbox WHERE org_id=$1 AND state<>'cancelled'",
                    [recoveredOrg],
                  )
                ).rows[0].count,
                "0",
              );
            },
            { lock: true },
          );
          const recoveredCall = (tail, input) =>
            db.tx(
              staff,
              recoveredOrg,
              async (c) => {
                const response = await participationRoutes({
                  c,
                  org: recoveredOrg,
                  user: staff,
                  member: await membership(c, recoveredOrg, staff),
                  tail: "participation-targets/" + tail,
                  method: input ? "POST" : "GET",
                  input: input || {},
                  url: new URL(
                    settings.origin +
                      "/api/orgs/" +
                      recoveredOrg +
                      "/participation-targets/" +
                      tail,
                  ),
                  settings,
                });
                return response.json();
              },
              { lock: true },
            );
          const before = await recoveredCall("legacy-event");
          assert.equal(before.occupied, 1);
          assert.equal(before.target.recoveryBlock, true);
          assert.equal(before.sourceApproved, false);
          assert.ok(before.preview.issues.length);
          await db.tx(
            staff,
            recoveredOrg,
            async (c) => {
              const r = (await allRecords(c, recoveredOrg)).find(
                (r) => r.id === "legacy-event",
              );
              await saveRecord(c, {
                ...r,
                status: "scheduled",
                revision: 2,
                lastEditedBy: "fictional-recovery-author",
                approval: {
                  status: "approved",
                  revision: 2,
                  actorId: "fictional-recovery-reviewer",
                },
              });
            },
            { lock: true },
          );
          const ready = await recoveredCall("legacy-event");
          assert.equal(ready.occupied, 1);
          assert.deepEqual(ready.preview.issues, []);
          const adopted = await recoveredCall("legacy-event/adopt", {
            targetRevision: ready.currentSourceRevision,
            expectedLegacyHash: ready.preview.legacyHash,
            idempotencyKey: key(),
          });
          assert.equal(adopted.adopted, 1);
          assert.equal(adopted.target.recoveryBlock, false);
          assert.equal(adopted.target.occupied, 1);
          const legacy = (await recoveredCall("legacy-event/participations"))
            .participations[0];
          assert.equal(legacy.source, "legacy");
          assert.equal(legacy.state, "confirmed");
          assert.equal(legacy.consent, null);
        },
      );
      await t.test(
        "retained target/participation counts and actual PostgreSQL byte caps roll back excess writes",
        async () => {
          await assert.rejects(
            db.tx(
              staff,
              org,
              async (c) => {
                await c.query(
                  "INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision) SELECT $1,'limit-target-'||g,'events','{}','draft',$2,$2,1 FROM generate_series(1,501) g",
                  [org, staff],
                );
                await c.query(
                  "INSERT INTO os_participation_targets(org_id,target_id,module_id,source_revision,terms,terms_hash,created_by) SELECT $1,'limit-target-'||g,'events',1,'{}','synthetic',$2 FROM generate_series(1,501) g",
                  [org, staff],
                );
                await participationQuota(c, org);
              },
              { lock: true },
            ),
            err("participation_quota"),
          );
          await assert.rejects(
            db.tx(
              staff,
              org,
              async (c) => {
                await c.query(
                  "UPDATE os_participation_targets SET terms=jsonb_build_object('padding',repeat('x',2*1024*1024)) WHERE org_id=$1 AND target_id='event'",
                  [org],
                );
                await participationQuota(c, org);
              },
              { lock: true },
            ),
            err("participation_quota"),
          );
          await assert.rejects(
            db.tx(
              staff,
              org,
              async (c) => {
                await c.query(
                  "INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision) SELECT $1,'limit-booking-'||g,'events','{}','draft',$2,$2,1 FROM generate_series(1,2001) g",
                  [org, staff],
                );
                await c.query(
                  "INSERT INTO os_participations(org_id,id,target_id,module_id,booking_record_id,contact_id,state,source,created_by) SELECT $1,'limit-part-'||g,'event','events','limit-booking-'||g,'one-contact','cancelled','legacy',$2 FROM generate_series(1,2001) g",
                  [org, staff],
                );
                await participationQuota(c, org);
              },
              { lock: true },
            ),
            err("participation_quota"),
          );
          await assert.rejects(
            db.tx(
              staff,
              org,
              async (c) => {
                await c.query(
                  "UPDATE os_participations SET frozen=jsonb_build_object('padding',repeat('x',8*1024*1024)) WHERE org_id=$1 AND id=$2",
                  [org, p1.id],
                );
                await participationQuota(c, org);
              },
              { lock: true },
            ),
            err("participation_quota"),
          );
          await assert.rejects(
            db.tx(
              staff,
              org,
              async (c) => {
                await c.query(
                  "INSERT INTO os_participation_outbox(org_id,id,participation_id,event_revision,payload) SELECT $1,'byte-limit-'||g,$2::text,20000+g,jsonb_build_object('padding',repeat('x',1900)) FROM generate_series(1,4500) g",
                  [org, p1.id],
                );
                await participationQuota(c, org);
              },
              { lock: true },
            ),
            err("participation_quota"),
          );
          const after = await db.tx(
            staff,
            org,
            async (c) =>
              (
                await c.query(
                  "SELECT (SELECT count(*) FROM os_records WHERE org_id=$1 AND id LIKE 'limit-%') AS records,(SELECT count(*) FROM os_participations WHERE org_id=$1 AND id LIKE 'limit-%') AS participations,(SELECT count(*) FROM os_participation_outbox WHERE org_id=$1 AND id LIKE 'byte-limit-%') AS outbox",
                  [org],
                )
              ).rows[0],
          );
          assert.deepEqual(after, {
            records: "0",
            participations: "0",
            outbox: "0",
          });
        },
      );
      await t.test(
        "safe cancellation commits with a full paused journal and exhausted workspace audit reserve",
        async () => {
          const p = (
            await staffCall("volunteer-shift/participations")
          ).participations.find((p) => p.state === "confirmed");
          await db.tx(staff, org, async (c) => {
            await c.query(
              "INSERT INTO os_participation_outbox(org_id,id,participation_id,event_revision,payload) SELECT $1,'quota-'||g,$2::text,10000+g,jsonb_build_object('participationId',$2::text,'revision',10000+g,'state','confirmed') FROM generate_series(1,8000-(SELECT count(*)::int FROM os_participation_outbox WHERE org_id=$1)) g",
              [org, p.id],
            );
            await c.query(
              "INSERT INTO os_events(org_id,actor_id,action,detail) VALUES($1,$2,'fictional.quota.padding',jsonb_build_object('padding',repeat('x',62*1024*1024)))",
              [org, staff],
            );
            assert.ok((await logicalBackupBytes(c, org)) > 61 * 1024 * 1024);
          });
          const result = await command({ id: "volunteer-shift" }, p, "cancel", {
            reason: "Fictional safe cancellation at quota",
          });
          assert.equal(result.participation.state, "cancelled");
          assert.equal(result.notificationQueued, false);
          assert.equal((await staffCall("volunteer-shift")).occupied, 0);
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
