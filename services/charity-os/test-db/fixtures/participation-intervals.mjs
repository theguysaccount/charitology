import { requireCheckInCi17Profile } from "./participant-check-in-ci17-profile.mjs";
import { applicationGrantsSql } from "../../lib/migration-grants.mjs";
import { intakeSchema } from "../../lib/intake.mjs";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { database, saveRecord, allRecords } from "../../lib/database.mjs";
import {
  participationRoutes,
  participantParticipationRoutes,
} from "../../lib/participation.mjs";
import { participationValidationContext } from "../../lib/participation-guards.mjs";
import { membership } from "../../lib/access.mjs";
import { validateRecord } from "../../lib/modules.mjs";
import { csrf } from "../../lib/security.mjs";
// Each invocation owns one new random schema in the explicitly supplied test database.
// No .env file, provider, mail transport or production migration is loaded.
export const configured = !!(
  process.env.DATABASE_URL && process.env.OS_DATABASE_URL
);
const quote = (s) => '"' + s.replaceAll('"', '""') + '"';
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

export async function withIntervalFixture(run, { orgId, staffId, checkInCi17 } = {}) {
  const ciProfile = checkInCi17 === undefined ? null : requireCheckInCi17Profile(checkInCi17);
  const fixtureOwnerUrl = ciProfile ? ciProfile.ownerUrl : process.env.DATABASE_URL, fixtureRuntimeUrl = ciProfile ? ciProfile.runtimeUrl : process.env.OS_DATABASE_URL;
  for (const value of [fixtureOwnerUrl, fixtureRuntimeUrl]) {
    if (ciProfile) { ciProfile.checkUrl(value); continue; }
    const url = new URL(value);
    assert(
      process.env.CI === "true" || url.hostname === "127.0.0.1",
      "Local interval tests require an explicitly owned loopback test database.",
    );
    assert(["postgres:", "postgresql:"].includes(url.protocol));
    assert(
      [...url.searchParams.keys()].every((k) =>
        ["sslmode", "channel_binding"].includes(k),
      ),
      "Refuse target or runtime query overrides.",
    );
    if (process.env.CI !== "true") {
      assert(
        /^\/(?:os_interval_[a-f0-9]{14}|charitology_interval_fixture)$/.test(
          url.pathname,
        ),
        "Use a new explicitly named interval test database.",
      );
      assert(
        [...url.searchParams].every(
          ([k, v]) => k === "sslmode" && v === "disable",
        ),
        "Local fixture transport must stay explicitly loopback-only.",
      );
    }
  }
  const schema = (ciProfile ? ciProfile.schemaPrefix : "os_interval_") + randomBytes(8).toString("hex"),
    owner = database(fixtureOwnerUrl);
  let migration,
    db,
    created = false,
    driverFailure = false, primaryError = null;
  const watchPool = (pool) => {
    if (ciProfile) { ciProfile.watch(pool); return; }
    const seen = new WeakSet();
    const client = (value) => {
      if (!seen.has(value)) {
        seen.add(value);
        value.on("error", () => {
          driverFailure = true;
        });
      }
    };
    pool.on("error", () => {
      driverFailure = true;
    });
    pool.on("connect", client);
    pool.on("acquire", client);
  };
  watchPool(owner.pool);
  const localGuard = async () => {
    if (ciProfile) { await ciProfile.assertTarget(); await ciProfile.assertRole(owner.pool, "owner"); return; }
    if (process.env.CI === "true") return;
    assert(
      process.env.OS_INTERVAL_EXPECTED_SYSTEM_ID &&
        process.env.OS_INTERVAL_EXPECTED_DATA_DIRECTORY &&
        process.env.OS_INTERVAL_EXPECTED_STARTED,
    );
    await owner.tx(
      null,
      null,
      async (c) => {
        const row = (
          await c.query(
            "SELECT current_database() AS database,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('data_directory') AS directory,(SELECT system_identifier::text FROM pg_control_system()) AS system,floor(extract(epoch FROM pg_postmaster_start_time()))::bigint::text AS started,current_setting('server_version_num')::int AS version",
          )
        ).rows[0];
        assert.equal(
          row.database,
          new URL(process.env.DATABASE_URL).pathname.slice(1),
        );
        assert.equal(row.host, "127.0.0.1");
        assert.equal(row.port, Number(process.env.OS_INTERVAL_EXPECTED_PORT));
        assert.equal(
          row.directory,
          process.env.OS_INTERVAL_EXPECTED_DATA_DIRECTORY,
        );
        assert.equal(row.system, process.env.OS_INTERVAL_EXPECTED_SYSTEM_ID);
        assert.equal(row.started, process.env.OS_INTERVAL_EXPECTED_STARTED);
        assert.equal(row.version, 170011);
      },
      { readOnly: true },
    );
  };
  const org = orgId || "fictional-booking-org",
    staff = staffId || "fictional-staff";
  assert(/^[A-Za-z0-9_-]{1,100}$/.test(org));
  assert(/^[A-Za-z0-9_-]{1,100}$/.test(staff));
  try {
    await localGuard();
    if (ciProfile) await ciProfile.beforeSchema(schema, owner.pool);
    await owner.pool.query(`CREATE SCHEMA ${quote(schema)}`);
    created = true;
    migration = database(direct(fixtureOwnerUrl), { schema });
    watchPool(migration.pool);
    await migration.migrate();
    // Synthetic auth projection only; actual Better Auth sessions are covered
    // by runtime.test.mjs. This table exists solely in this random schema.
    await migration.pool.query(
      'CREATE TABLE "user" (id text PRIMARY KEY,email text NOT NULL,"emailVerified" boolean NOT NULL)',
    );
    await migration.pool.query(
      'INSERT INTO "user"(id,email,"emailVerified") VALUES($1,$2,true)',
      [ownSession.user.id, ownSession.user.email],
    );
    const appRole = decodeURIComponent(
      new URL(fixtureRuntimeUrl).username,
    );
    assert.notEqual(
      appRole,
      decodeURIComponent(new URL(fixtureOwnerUrl).username),
    );
    if (ciProfile) await owner.pool.query(applicationGrantsSql(appRole, schema));
    else await owner.pool.query(
      `GRANT USAGE ON SCHEMA ${quote(schema)} TO ${quote(appRole)}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${quote(schema)} TO ${quote(appRole)}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${quote(schema)} TO ${quote(appRole)}`,
    );
    db = database(direct(fixtureRuntimeUrl), { schema });
    watchPool(db.pool);
    if (ciProfile) await ciProfile.assertRole(db.pool, "runtime");
    await db.tx(
      null,
      null,
      async (c) => {
        const row = (
          await c.query(
            "SELECT current_database() AS database,current_user AS role,host(inet_server_addr()) AS host,inet_server_port() AS port,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication,rolinherit,(SELECT count(*)::int FROM pg_auth_members WHERE member=pg_roles.oid) AS memberships FROM pg_roles WHERE rolname=current_user",
          )
        ).rows[0];
        assert.equal(
          row.database,
          new URL(fixtureRuntimeUrl).pathname.slice(1),
        );
        assert.equal(row.role, appRole);
        assert.equal(row.rolsuper, false);
        assert.equal(row.rolbypassrls, false);
        if (!ciProfile && process.env.CI !== "true") {
          assert.equal(row.host, "127.0.0.1");
          assert.equal(row.port, Number(process.env.OS_INTERVAL_EXPECTED_PORT));
          for (const k of [
            "rolcreatedb",
            "rolcreaterole",
            "rolreplication",
            "rolinherit",
          ])
            assert.equal(row[k], false);
          assert.equal(row.memberships, 0);
        }
      },
      { readOnly: true },
    );
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
    const staffCall = (tail, input, actor = staff, callOrg = org) =>
      db.tx(
        actor,
        callOrg,
        async (c) => {
          const member = await membership(c, callOrg, actor),
            method = input === undefined ? "GET" : "POST",
            r = await participationRoutes({
              c,
              org: callOrg,
              user: actor,
              member,
              tail: "participation-targets" + (tail ? "/" + tail : ""),
              method,
              input: input || {},
              url: new URL(
                settings.origin +
                  "/api/orgs/" +
                  callOrg +
                  "/participation-targets" +
                  (tail ? "/" + tail : ""),
              ),
              settings,
            });
          return { status: r.status, ...(await r.json()) };
        },
        { lock: input !== undefined, readOnly: input === undefined },
      );
    const makeTarget = async (
      id,
      moduleId = "events",
      capacity = 1,
      start = "2099-01-02T09:00:00+00:00",
      end = "2099-01-02T11:00:00+00:00",
      allowPartialIntervals = true,
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
                ...(moduleId === "volunteers" ? { allowPartialIntervals } : {}),
              },
            };
          r.data = validateRecord(moduleId, r.data, {
            participation:
              moduleId === "volunteers"
                ? await participationValidationContext(c, org)
                : undefined,
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
                  target.moduleId === "events" ? "registration" : "assignment",
                [target.moduleId === "events" ? "eventId" : "shiftId"]:
                  target.id,
                contactId,
              },
              {
                participation:
                  target.moduleId === "volunteers"
                    ? await participationValidationContext(c, org)
                    : undefined,
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
            const form = {
              id: id + "-form",
              orgId: org,
              moduleId: "forms",
              status: "published",
              revision: 4,
              ownerId: staff,
              lastEditedBy: "fictional-author",
              approval: {
                status: "approved",
                revision: 4,
                actorId: "fictional-reviewer",
              },
              snapshot: null,
              source: null,
              data: validateRecord(
                "forms",
                {
                  title: "Fictional request",
                  kind: "form",
                  version: 1,
                  purpose: "Arrange this fictional volunteer request.",
                  anonymous: false,
                  consentRequired: true,
                  retentionUntil: "2099-12-31",
                  definition: JSON.stringify([
                    {
                      key: "name",
                      label: "Name",
                      type: "text",
                      required: true,
                    },
                    {
                      key: "email",
                      label: "Email",
                      type: "text",
                      required: true,
                    },
                  ]),
                },
                { status: "published", records },
              ),
            };
            await saveRecord(c, form);
            const kind =
              target.moduleId === "volunteers"
                ? "volunteer-interest"
                : "event-interest";
            const schema = intakeSchema(form, kind);
            await c.query(
              "INSERT INTO os_publications(org_id,id,record_id,source_revision,kind,target_id,target_module,target_revision,schema,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
              [
                org,
                id + "-publication",
                form.id,
                form.revision,
                kind,
                target.id,
                target.moduleId,
                target.revision,
                JSON.stringify(schema),
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
            await c.query("SELECT set_config('app.user_id',$1,true)", [staff]);
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
        ...(p.allocationHash ? { allocationHash: p.allocationHash } : {}),
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

    assert.equal(driverFailure, false, "The owned fixture connection failed.");
    await run({
      schema,
      owner,
      migration,
      db,
      org,
      staff,
      settings,
      ownSession,
      staffCall,
      ownCall,
      makeTarget,
      makeCandidate,
      adopt,
      associate,
      offlineConsent,
      command,
      key,
    });
    assert.equal(driverFailure, false, "The owned fixture connection failed.");
  } catch (error) {
    primaryError = error; throw error;
  } finally {
    if (ciProfile) await ciProfile.cleanup({ db, migration, owner, schema, created, primaryError });
    else {
    if (db) await db.close();
    if (migration) await migration.close();
    try {
      if (created) {
        await localGuard();
        await owner.pool.query(
          `DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`,
        );
      }
    } finally {
      await owner.close();
    }
    }
  }
}
