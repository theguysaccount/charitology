import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { database, saveRecord } from "../lib/database.mjs";
import { participantRoutes } from "../lib/participants.mjs";
import { intakeRoutes } from "../lib/intake.mjs";
import { validateRecord } from "../lib/modules.mjs";
import { hash, csrf } from "../lib/security.mjs";
import {
  exportIntake,
  restoredIntake,
  restoreIntake,
} from "../lib/intake-backup.mjs";

const configured = !!(process.env.DATABASE_URL && process.env.OS_DATABASE_URL);
const quote = (s) => '"' + s.replaceAll('"', '""') + '"';
const direct = (value) => {
  const u = new URL(value);
  if (u.hostname.endsWith(".neon.tech"))
    u.hostname = u.hostname.replace(/-pooler(?=\.)/, "");
  return u.toString();
};
const settings = {
  origin: "https://os.example.invalid",
  secret: "synthetic-participant-secret-at-least-32-characters",
};
const identity = (id, email) => ({
  user: { id, email, emailVerified: true },
  session: { id: `synthetic-session-${id}` },
});
const a = identity("participant-a", "participant-a@example.invalid"),
  b = identity("participant-b", "participant-b@example.invalid");
const err = (code) => (e) => e.code === code;

test(
  "actual Postgres participant links enforce own RLS, explicit claims, revisions, permanent unlink and lifetime quotas (server identity fixtures; auth tested separately)",
  {
    skip: configured
      ? false
      : "Set isolated owner and constrained app database URLs.",
    timeout: 900000,
  },
  async (t) => {
    const schema = "os_participant_" + randomBytes(8).toString("hex"),
      orgA = "participant-org-a",
      orgB = "participant-org-b",
      capOrg = "participant-org-cap",
      restoredOrg = "participant-org-restored";
    const owner = database(process.env.DATABASE_URL);
    let migration, db;
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
      const privileges = (
        await db.pool.query(
          "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
        )
      ).rows[0];
      assert.deepEqual(privileges, { rolsuper: false, rolbypassrls: false });
      const flags = (
        await db.pool.query(
          "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace=current_schema()::regnamespace AND relname=ANY($1::text[])",
          [
            [
              "os_participant_links",
              "os_participant_org_usage",
              "os_intake",
              "os_publications",
            ],
          ],
        )
      ).rows;
      assert.equal(flags.length, 4);
      assert.ok(flags.every((r) => r.relrowsecurity && r.relforcerowsecurity));
      const questions = [
        { key: "name", label: "Operational name", type: "text" },
        {
          key: "email",
          label: "Operational email",
          type: "text",
          required: true,
        },
        { key: "count", label: "Count", type: "number", required: true },
        { key: "choice", label: "Choice", type: "boolean", required: true },
      ];
      const form = (org) => ({
        id: "source-form",
        orgId: org,
        moduleId: "forms",
        status: "published",
        revision: 4,
        ownerId: "synthetic-author",
        lastEditedBy: "synthetic-author",
        approval: {
          status: "approved",
          revision: 4,
          actorId: "synthetic-independent-reviewer",
        },
        snapshot: null,
        source: null,
        data: validateRecord(
          "forms",
          {
            title: "Synthetic participant request",
            kind: "form",
            version: 1,
            purpose:
              "Review and arrange a response about this operational request.",
            definition: JSON.stringify(questions),
            consentRequired: true,
            anonymous: false,
            retentionUntil: "2099-01-01",
          },
          { status: "published", records: [] },
        ),
      });
      const publications = new Map();
      const makeOrg = async (org) => {
        await db.tx(
          "synthetic-staff",
          org,
          async (c) => {
            await c.query(
              "INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Synthetic participant organization',$1,'USD','UTC')",
              [org],
            );
            await saveRecord(c, form(org));
            const result = await intakeRoutes({
              c,
              org,
              user: "synthetic-staff",
              member: { role: "admin" },
              tail: "intake/publications",
              method: "POST",
              input: { recordId: "source-form", revision: 4, kind: "contact" },
              settings,
            });
            publications.set(org, (await result.json()).publication.id);
          },
          { lock: true },
        );
      };
      await makeOrg(orgA);
      await makeOrg(orgB);
      await makeOrg(capOrg);
      await makeOrg(restoredOrg);
      const answers = (email, count = 0) => ({
        name: "Synthetic participant",
        email,
        count,
        choice: false,
      });
      const seedRequest = async (
        org,
        email,
        intakeId = randomBytes(16).toString("hex"),
      ) => {
        const receipt = randomBytes(32).toString("base64url");
        await db.tx("synthetic-staff", org, (c) =>
          c.query(
            "INSERT INTO os_intake(org_id,id,publication_id,answers,consent_at,receipt_hash,ip_hash,payload_hash) VALUES($1,$2,$3,$4,now(),$5,'synthetic-private-ip','synthetic-private-payload')",
            [
              org,
              intakeId,
              publications.get(org),
              JSON.stringify(answers(email)),
              hash(receipt),
            ],
          ),
        );
        return {
          org,
          id: intakeId,
          publicationId: publications.get(org),
          receipt,
        };
      };
      const call = async (session, path, input) => {
        const request = new Request(
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
        );
        const response = await participantRoutes({
          request,
          db,
          settings,
          session,
        });
        return { status: response.status, ...(await response.json()) };
      };
      const claim = (session, request) =>
        call(
          session,
          `/api/participant/intake/${request.org}/${request.publicationId}/link`,
          { receipt: request.receipt, consent: true },
        );
      const path = (request) =>
        `/api/participant/orgs/${request.org}/requests/${request.id}`;
      const one = await seedRequest(orgA, a.user.email),
        two = await seedRequest(orgA, b.user.email);
      let own, foreignLinkId;

      await t.test(
        "only verified matching mailbox plus separate scoped receipt grants access, once under concurrent retries",
        async () => {
          await assert.rejects(claim(b, one), err("participant_request"));
          await assert.rejects(
            claim({ ...a, user: { ...a.user, emailVerified: false } }, one),
            err("participant_verification"),
          );
          await assert.rejects(
            claim(a, {
              ...one,
              org: orgB,
              publicationId: publications.get(orgB),
            }),
            err("participant_request"),
          );
          await assert.rejects(
            claim(
              {
                ...a,
                user: {
                  ...a.user,
                  email: "participant-a+other@example.invalid",
                },
              },
              one,
            ),
            err("participant_request"),
          );
          const repeated = await Promise.all([claim(a, one), claim(a, one)]);
          assert.deepEqual(repeated.map((r) => r.status).sort(), [200, 201]);
          own = repeated[0].request;
          assert.equal((await claim(b, two)).status, 201);
          const stored = (
            await db.tx(a.user.id, null, (c) =>
              c.query("SELECT * FROM os_participant_links WHERE user_id=$1", [
                a.user.id,
              ]),
            )
          ).rows;
          assert.equal(stored.length, 1);
          assert.equal(JSON.stringify(stored).includes(one.receipt), false);
          assert.equal(
            Number(
              (
                await db.tx(a.user.id, orgA, (c) =>
                  c.query(
                    "SELECT total FROM os_participant_org_usage WHERE org_id=$1",
                    [orgA],
                  ),
                )
              ).rows[0].total,
            ),
            2,
          );
          assert.equal(
            Number(
              (
                await db.pool.query(
                  "SELECT count(*) AS n FROM os_participant_links",
                )
              ).rows[0].n,
            ),
            0,
          );
          assert.equal(
            Number(
              (
                await db.tx(a.user.id, null, (c) =>
                  c.query("SELECT count(*) AS n FROM os_intake"),
                )
              ).rows[0].n,
            ),
            0,
          );
          assert.equal(
            Number(
              (
                await db.tx(a.user.id, orgA, (c) =>
                  c.query(
                    "SELECT count(*) AS n FROM os_participant_links WHERE user_id=$1",
                    [b.user.id],
                  ),
                )
              ).rows[0].n,
            ),
            0,
          );
          assert.equal(
            Number(
              (
                await db.tx(a.user.id, orgA, (c) =>
                  c.query(
                    "SELECT count(*) AS n FROM os_members WHERE org_id=$1",
                    [orgA],
                  ),
                )
              ).rows[0].n,
            ),
            0,
          );
          foreignLinkId = (
            await db.tx(b.user.id, null, (c) =>
              c.query("SELECT id FROM os_participant_links WHERE user_id=$1", [
                b.user.id,
              ]),
            )
          ).rows[0].id;
          await assert.rejects(
            call(a, "/api/participant/requests?cursor=" + foreignLinkId),
            err("participant_cursor"),
          );
          await assert.rejects(call(a, path(two)), err("participant_request"));
        },
      );

      await t.test(
        "own list pages 20 across organizations without private fields or foreign access",
        async () => {
          for (const [org, start, finish] of [
            [orgA, 1, 11],
            [orgB, 12, 21],
          ])
            await db.tx(a.user.id, org, async (c) => {
              await c.query(
                "INSERT INTO os_intake(org_id,id,publication_id,answers,consent_at,created_at,reviewed_by,converted_ids) SELECT $1,'owned-seed-'||n,$2,$3,now(),now()-n*interval '1 second','private-staff-actor','[{\"id\":\"private-contact\",\"moduleId\":\"contacts\"}]'::jsonb FROM generate_series($4::int,$5::int) n",
                [
                  org,
                  publications.get(org),
                  JSON.stringify(answers(a.user.email)),
                  start,
                  finish,
                ],
              );
              await c.query(
                "INSERT INTO os_participant_links(id,org_id,intake_id,publication_id,user_id,created_at) SELECT md5('own-'||n),$1,'owned-seed-'||n,$2,$3,now()-n*interval '1 second' FROM generate_series($4::int,$5::int) n",
                [org, publications.get(org), a.user.id, start, finish],
              );
              await c.query(
                "INSERT INTO os_participant_org_usage(org_id,total) VALUES($1,$2) ON CONFLICT(org_id) DO UPDATE SET total=os_participant_org_usage.total+EXCLUDED.total",
                [org, finish - start + 1],
              );
            });
          const first = await call(a, "/api/participant/requests");
          assert.equal(first.requests.length, 20);
          assert.ok(first.nextCursor);
          const last = await call(
            a,
            "/api/participant/requests?cursor=" + first.nextCursor,
          );
          assert.equal(last.requests.length, 2);
          assert.equal(last.nextCursor, null);
          assert.equal(
            new Set(
              [...first.requests, ...last.requests].map(
                (r) => `${r.orgId}:${r.id}`,
              ),
            ).size,
            22,
          );
          assert.ok(
            first.requests.every(
              (r) =>
                !Object.hasOwn(r, "answers") &&
                !Object.hasOwn(r, "convertedIds"),
            ),
          );
          const detail = (
            await call(a, `/api/participant/orgs/${orgA}/requests/owned-seed-1`)
          ).request;
          assert.deepEqual(detail.answers, answers(a.user.email));
          for (const forbidden of [
            "private-staff-actor",
            "private-contact",
            "receipt_hash",
            "payload_hash",
            "ip_hash",
            "reviewedBy",
            "convertedIds",
            one.receipt,
          ])
            assert.equal(JSON.stringify(detail).includes(forbidden), false);
          const other = await call(b, "/api/participant/requests");
          assert.equal(other.requests.length, 1);
          assert.equal(other.requests[0].id, two.id);
        },
      );

      await t.test(
        "correction preserves zero/false, email identity and expected revisions while racing staff review",
        async () => {
          const updated = answers(a.user.email, 1),
            revision = own.revision;
          const corrected = await Promise.allSettled([
            call(a, path(one) + "/correct", {
              revision,
              answers: updated,
              consent: true,
            }),
            call(a, path(one) + "/correct", {
              revision,
              answers: updated,
              consent: true,
            }),
          ]);
          assert.equal(
            corrected.filter((r) => r.status === "fulfilled").length,
            1,
          );
          assert.equal(
            corrected.find((r) => r.status === "rejected").reason.code,
            "revision",
          );
          own = corrected.find((r) => r.status === "fulfilled").value.request;
          assert.equal(own.answers.count, 1);
          assert.equal(own.answers.choice, false);
          await assert.rejects(
            call(a, path(one) + "/correct", {
              revision: own.revision,
              answers: { ...updated, email: b.user.email },
              consent: true,
            }),
            err("participant_email"),
          );
          await assert.rejects(
            call(a, path(one) + "/correct", {
              revision: own.revision,
              answers: updated,
              consent: false,
            }),
            err("participant_consent"),
          );
          const competing = await Promise.allSettled([
            call(a, path(one) + "/correct", {
              revision: own.revision,
              answers: answers(a.user.email, 2),
              consent: true,
            }),
            db.tx(
              "synthetic-staff",
              orgA,
              async (c) =>
                (
                  await intakeRoutes({
                    c,
                    org: orgA,
                    user: "synthetic-staff",
                    member: { role: "admin" },
                    tail: `intake/submissions/${one.id}/review`,
                    method: "POST",
                    input: { revision: own.revision, action: "review" },
                    settings,
                  })
                ).json(),
              { lock: true },
            ),
          ]);
          assert.equal(
            competing.filter((r) => r.status === "fulfilled").length,
            1,
          );
          assert.equal(
            competing.find((r) => r.status === "rejected").reason.code,
            "revision",
          );
          own = (await call(a, path(one))).request;
          if (own.status === "reviewed")
            await assert.rejects(
              call(a, path(one) + "/correct", {
                revision: own.revision,
                answers: updated,
                consent: true,
              }),
              err("participant_edit"),
            );
          await db.tx(
            "synthetic-staff",
            orgA,
            (c) =>
              c.query(
                "UPDATE os_records SET status='closed',revision=revision+1 WHERE org_id=$1 AND id='source-form'",
                [orgA],
              ),
            { lock: true },
          );
          assert.equal((await call(a, path(one))).request.editable, false);
          await assert.rejects(
            call(a, path(one) + "/correct", {
              revision: own.revision,
              answers: updated,
              consent: true,
            }),
            err("participant_edit"),
          );
        },
      );

      await t.test(
        "permanent unlink removes only account access; closed source cannot block privacy actions or receipt-based claim",
        async () => {
          const withdrawn = (
            await call(a, path(one) + "/withdraw", { revision: own.revision })
          ).request;
          assert.equal(withdrawn.status, "cancelled");
          assert.equal(withdrawn.answers.email, a.user.email);
          assert.equal(
            (
              await call(a, path(one) + "/unlink", {
                revision: withdrawn.revision,
              })
            ).unlinked,
            true,
          );
          await assert.rejects(call(a, path(one)), err("participant_request"));
          await assert.rejects(claim(a, one), err("participant_link"));
          await assert.rejects(
            claim(identity("replacement-account", a.user.email), one),
            err("participant_link"),
          );
          assert.equal(
            Number(
              (
                await db.tx(a.user.id, null, (c) =>
                  c.query(
                    "SELECT count(*) AS n FROM os_participant_links WHERE user_id=$1",
                    [a.user.id],
                  ),
                )
              ).rows[0].n,
            ),
            22,
          );
          const closedClaim = await seedRequest(
            orgA,
            "closed-claim@example.invalid",
          );
          assert.equal(
            (
              await claim(
                identity("closed-claim-user", "closed-claim@example.invalid"),
                closedClaim,
              )
            ).status,
            201,
          );
        },
      );

      await t.test(
        "the last user quota slot serializes across organizations and counts revoked links",
        async () => {
          const quotaUser = identity(
            "quota-user",
            "quota-user@example.invalid",
          );
          await db.tx(
            quotaUser.user.id,
            orgA,
            async (c) => {
              await c.query(
                "INSERT INTO os_intake(org_id,id,publication_id,answers,consent_at,status) SELECT $1,'user-quota-'||n,$2,$3,now(),'dismissed' FROM generate_series(1,99) n",
                [
                  orgA,
                  publications.get(orgA),
                  JSON.stringify(answers(quotaUser.user.email)),
                ],
              );
              await c.query(
                "INSERT INTO os_participant_links(id,org_id,intake_id,publication_id,user_id,revoked_at) SELECT md5('user-quota-'||n),$1,'user-quota-'||n,$2,$3,now() FROM generate_series(1,99) n",
                [orgA, publications.get(orgA), quotaUser.user.id],
              );
              await c.query(
                "UPDATE os_participant_org_usage SET total=total+99 WHERE org_id=$1",
                [orgA],
              );
            },
            { lock: true },
          );
          const candidateA = await seedRequest(orgA, quotaUser.user.email),
            candidateB = await seedRequest(orgB, quotaUser.user.email);
          const results = await Promise.allSettled([
            claim(quotaUser, candidateA),
            claim(quotaUser, candidateB),
          ]);
          assert.equal(
            results.filter((r) => r.status === "fulfilled").length,
            1,
          );
          assert.equal(
            results.find((r) => r.status === "rejected").reason.code,
            "participant_quota",
          );
          assert.equal(
            Number(
              (
                await db.tx(quotaUser.user.id, null, (c) =>
                  c.query(
                    "SELECT count(*) AS n FROM os_participant_links WHERE user_id=$1",
                    [quotaUser.user.id],
                  ),
                )
              ).rows[0].n,
            ),
            100,
          );
          assert.equal(
            (await call(quotaUser, "/api/participant/requests")).requests
              .length,
            1,
          );
        },
      );

      await t.test(
        "the last organization slot serializes across users without exposing other users' grant rows",
        async () => {
          await db.tx("synthetic-staff", capOrg, (c) =>
            c.query(
              "INSERT INTO os_intake(org_id,id,publication_id,answers,consent_at,status) SELECT $1,'org-quota-'||n,$2,jsonb_build_object('name','Synthetic quota person','email','quota-'||((n-1)/100)::int||'@example.invalid','count',0,'choice',false),now(),'dismissed' FROM generate_series(1,999) n",
              [capOrg, publications.get(capOrg)],
            ),
          );
          for (let group = 0; group < 10; group++)
            await db.tx(`cap-seed-${group}`, capOrg, (c) =>
              c.query(
                "INSERT INTO os_participant_links(id,org_id,intake_id,publication_id,user_id,revoked_at) SELECT md5('org-quota-'||n),$1,'org-quota-'||n,$2,$3,now() FROM generate_series($4::int,$5::int) n",
                [
                  capOrg,
                  publications.get(capOrg),
                  `cap-seed-${group}`,
                  group * 100 + 1,
                  Math.min((group + 1) * 100, 999),
                ],
              ),
            );
          await db.tx("synthetic-staff", capOrg, (c) =>
            c.query(
              "INSERT INTO os_participant_org_usage(org_id,total) VALUES($1,999)",
              [capOrg],
            ),
          );
          const firstUser = identity(
              "cap-last-a",
              "cap-last-a@example.invalid",
            ),
            lastUser = identity("cap-last-b", "cap-last-b@example.invalid");
          const first = await seedRequest(capOrg, firstUser.user.email),
            last = await seedRequest(capOrg, lastUser.user.email);
          const results = await Promise.allSettled([
            claim(firstUser, first),
            claim(lastUser, last),
          ]);
          assert.equal(
            results.filter((r) => r.status === "fulfilled").length,
            1,
          );
          assert.equal(
            results.find((r) => r.status === "rejected").reason.code,
            "participant_quota",
          );
          assert.equal(
            Number(
              (
                await db.tx(firstUser.user.id, capOrg, (c) =>
                  c.query(
                    "SELECT total FROM os_participant_org_usage WHERE org_id=$1",
                    [capOrg],
                  ),
                )
              ).rows[0].total,
            ),
            1000,
          );
          const ownCounts = await Promise.all(
            [firstUser, lastUser].map((u) =>
              db.tx(u.user.id, null, async (c) =>
                Number(
                  (
                    await c.query(
                      "SELECT count(*) AS n FROM os_participant_links WHERE user_id=$1",
                      [u.user.id],
                    )
                  ).rows[0].n,
                ),
              ),
            ),
          );
          assert.equal(
            ownCounts.reduce((n, v) => n + v, 0),
            1,
          );
          const overflow = await seedRequest(
            capOrg,
            "overflow@example.invalid",
          );
          await assert.rejects(
            claim(
              identity("cap-overflow", "overflow@example.invalid"),
              overflow,
            ),
            err("participant_quota"),
          );
        },
      );

      await t.test(
        "recovery preserves private answers but creates no account access, even for the original account",
        async () => {
          const source = await db.tx("synthetic-staff", orgB, (c) =>
            exportIntake(c, orgB),
          );
          assert.equal(Object.hasOwn(source, "participantLinks"), false);
          assert.equal(JSON.stringify(source).includes("user_id"), false);
          // The restored destination has no form publications yet; remove its
          // synthetic setup publication so stable imported IDs can be inserted.
          await db.tx(
            "synthetic-staff",
            restoredOrg,
            async (c) => {
              await c.query("DELETE FROM os_publications WHERE org_id=$1", [
                restoredOrg,
              ]);
              await restoreIntake(
                c,
                restoredOrg,
                "synthetic-restorer",
                restoredIntake({ intake: source }),
              );
            },
            { lock: true },
          );
          await assert.rejects(
            call(
              a,
              `/api/participant/orgs/${restoredOrg}/requests/owned-seed-12`,
            ),
            err("participant_request"),
          );
          assert.equal(
            Number(
              (
                await db.tx(a.user.id, null, (c) =>
                  c.query(
                    "SELECT count(*) AS n FROM os_participant_links WHERE user_id=$1 AND org_id=$2",
                    [a.user.id, restoredOrg],
                  ),
                )
              ).rows[0].n,
            ),
            0,
          );
          const restored = (
            await db.tx("synthetic-staff", restoredOrg, (c) =>
              c.query(
                "SELECT answers,receipt_hash FROM os_intake WHERE org_id=$1 AND id='owned-seed-12'",
                [restoredOrg],
              ),
            )
          ).rows[0];
          assert.equal(restored.answers.email, a.user.email);
          assert.equal(restored.receipt_hash, null);
        },
      );

      await t.test(
        "closed-form withdrawal, answer erasure and permanent unlink commit after the entire audit reserve is full",
        async () => {
          await db.tx("synthetic-staff", orgA, async (c) => {
            await c.query(
              "INSERT INTO os_events(org_id,actor_id,action,detail) VALUES($1,'synthetic-staff','synthetic.quota',jsonb_build_object('padding',repeat('x',62*1024*1024)))",
              [orgA],
            );
            await saveRecord(c, {
              orgId: orgA,
              id: "separate-contact",
              moduleId: "contacts",
              data: validateRecord(
                "contacts",
                {
                  title: "Separate operational contact",
                  kind: "person-reference",
                  contactPreference: "permission-needed",
                },
                { status: "draft", records: [] },
              ),
              status: "draft",
              ownerId: "synthetic-staff",
              lastEditedBy: "synthetic-staff",
              revision: 1,
              approval: null,
              snapshot: null,
            });
            await c.query(
              'UPDATE os_intake SET status=\'converted\',revision=3,converted_ids=\'[{"id":"separate-contact","moduleId":"contacts"}]\'::jsonb WHERE org_id=$1 AND id=\'owned-seed-1\'',
              [orgA],
            );
          });
          const target = { org: orgA, id: "owned-seed-1" },
            before = (await call(a, path(target))).request;
          const withdrawn = (
            await call(a, path(target) + "/withdraw", {
              revision: before.revision,
            })
          ).request;
          assert.equal(withdrawn.status, "cancelled");
          const erased = (
            await call(a, path(target) + "/erase", {
              revision: withdrawn.revision,
            })
          ).request;
          assert.deepEqual(erased.answers, {});
          assert.ok(erased.erasedAt);
          assert.deepEqual((await call(a, path(target))).request.answers, {});
          assert.equal(
            (
              await call(a, path(target) + "/unlink", {
                revision: erased.revision,
              })
            ).unlinked,
            true,
          );
          await assert.rejects(
            call(a, path(target)),
            err("participant_request"),
          );
          const contact = (
            await db.tx("synthetic-staff", orgA, (c) =>
              c.query(
                "SELECT status,revision FROM os_records WHERE org_id=$1 AND id='separate-contact'",
                [orgA],
              ),
            )
          ).rows[0];
          assert.deepEqual(contact, { status: "draft", revision: 1 });
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
