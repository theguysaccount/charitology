import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { database, allRecords } from "../lib/database.mjs";
import { membership } from "../lib/access.mjs";
import { validateRecord } from "../lib/modules.mjs";
import { createHandler } from "../lib/handler.mjs";
import { csrf, hash, stable } from "../lib/security.mjs";
import {
  grantReportRoutes,
  grantReportForReader,
} from "../lib/grant-reports.mjs";

const configured = !!(process.env.DATABASE_URL && process.env.OS_DATABASE_URL);
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const direct = (value) => {
  const url = new URL(value);
  if (url.hostname.endsWith(".neon.tech"))
    url.hostname = url.hostname.replace(/-pooler(?=\.)/, "");
  return url.toString();
};
const settings = {
  origin: "https://os.example.invalid",
  secret: "synthetic-grant-report-test-secret-more-than-32-characters",
};
const actor = "synthetic-report-admin",
  reviewer = "synthetic-report-reviewer",
  org = "synthetic-grant-org";
let sequence = 0;
const key = () =>
  "synthetic-grant-command-" + String(++sequence).padStart(16, "0");
const failure =
  (...statuses) =>
  (error) =>
    statuses.includes(error.status);

function fixture(prefix, organization = org) {
  const at = "2026-10-26T12:00:00.000Z",
    names = Object.fromEntries(
      [
        "program",
        "application",
        "agreement",
        "receipt",
        "budget",
        "spending",
        "indicator",
        "observation",
        "manifest",
        "contact",
      ].map((name) => [name, prefix + "-" + name]),
    );
  const money = (minor) => ({ minor, currency: "USD", precision: 2 });
  const definitions = [
    [
      "program",
      "programs",
      "program",
      "active",
      {
        purpose: "Fictional aggregate reporting scenario.",
        evidence: "hypothesis",
      },
    ],
    ["contact", "contacts", "organization", "active", {}],
    [
      "application",
      "grant-seeking",
      "application",
      "decided",
      {
        programId: names.program,
        funderId: names.contact,
        eligibility: "eligible",
        requested: money(100000),
        applicationVersion: 1,
        submissionReference: prefix + "-PRIVATE-SUBMISSION",
        applicationSummary: "PRIVATE-APPLICATION-NARRATIVE",
        documentIds: [],
      },
    ],
    [
      "agreement",
      "grant-delivery",
      "agreement",
      "active",
      {
        programId: names.program,
        applicationId: names.application,
        awarded: money(100000),
        committed: money(80000),
        spent: money(10000),
        restriction: "restricted",
        restrictionCode: prefix + "-allowed",
        allowedPurpose: "Fictional approved aggregate work.",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        documentIds: [],
      },
    ],
    [
      "receipt",
      "fundraising",
      "gift-reference",
      "reconciled",
      {
        programId: names.program,
        agreementId: names.agreement,
        contactId: names.contact,
        amount: money(30000),
        receivedDate: "2026-05-05",
        receiptReference: prefix + "-PRIVATE-RECEIPT",
        externalSystem: "Fictional ledger",
        externalId: prefix + "-PRIVATE-RECEIPT-LINE",
        externalUrl: "https://example.invalid/private-ledger",
        restricted: true,
        restrictionPurpose: "Fictional approved aggregate work.",
      },
    ],
    [
      "budget",
      "finance",
      "budget",
      "approved",
      {
        programId: names.program,
        agreementId: names.agreement,
        planned: money(80000),
        restrictionCode: prefix + "-allowed",
        purpose: "Fictional approved aggregate work.",
        startDate: "2026-05-01",
        endDate: "2026-05-31",
      },
    ],
    [
      "spending",
      "finance",
      "actual-reference",
      "reconciled",
      {
        programId: names.program,
        agreementId: names.agreement,
        actual: money(10000),
        actualClass: "cash-spent",
        actualDate: "2026-05-06",
        restrictionCode: prefix + "-allowed",
        purpose: "Fictional approved aggregate work.",
        externalSystem: "Fictional ledger",
        externalId: prefix + "-PRIVATE-SPENDING",
        externalUrl: "https://example.invalid/private-spending",
      },
    ],
    [
      "indicator",
      "outcomes",
      "indicator",
      "approved",
      {
        programId: names.program,
        unit: "count",
        method: "administrative",
        evidence: "self-reported",
        limitations: "Fictional fixture, not an actual finding.",
      },
    ],
    [
      "observation",
      "outcomes",
      "observation",
      "included",
      {
        programId: names.program,
        indicatorId: names.indicator,
        unit: "count",
        value: 0,
        startDate: "2026-05-01",
        endDate: "2026-05-31",
        method: "administrative",
        evidence: "source-linked",
        sourceUrl: "https://example.invalid/PRIVATE-OBSERVATION-SOURCE",
        limitations: "Synthetic aggregate zero, not an actual measurement.",
      },
    ],
    [
      "manifest",
      "reporting",
      "board",
      "draft",
      {
        programId: names.program,
        agreementId: names.agreement,
        receiptIds: [names.receipt],
        financeIds: [names.budget, names.spending],
        outcomeIds: [names.observation],
        startDate: "2026-05-01",
        endDate: "2026-05-31",
        visibility: "board",
        summary: "Fictional approved aggregate report.",
        missingness:
          "Selected sources only; no complete ledger or causal claim.",
        assemblyMethod: "grant-report-v1",
      },
    ],
  ];
  const records = definitions.map(([name, moduleId, kind, status, data]) => ({
    id: names[name],
    orgId: organization,
    moduleId,
    status,
    revision: name === "application" ? 5 : 1,
    ownerId: actor,
    lastEditedBy: actor,
    createdAt: at,
    updatedAt: at,
    data: { title: "Fictional " + prefix + " " + name, kind, ...data },
    approval:
      name === "manifest"
        ? null
        : {
            status: "approved",
            revision: name === "application" ? 5 : 1,
            actorId: reviewer,
            at,
            reason: "PRIVATE-APPROVAL-REASON; synthetic fixture only",
          },
    snapshot: null,
  }));
  for (const record of records)
    record.data = validateRecord(record.moduleId, record.data, {
      records,
      orgId: organization,
      recordId: record.id,
      status: record.status,
    });
  const application = records.find((record) => record.id === names.application);
  const submitted = structuredClone(application);
  submitted.status = "submitted";
  submitted.revision = 3;
  submitted.approval.revision = 3;
  submitted.snapshot = {
    id: submitted.id,
    orgId: organization,
    moduleId: "grant-seeking",
    data: structuredClone(submitted.data),
    status: "submitted",
    revision: 3,
    approval: structuredClone(submitted.approval),
    lastEditedBy: actor,
    createdAt: at,
    updatedAt: at,
    files: [],
  };
  application.snapshot = {
    ...structuredClone(submitted.snapshot),
    status: "decided",
    revision: 5,
  };
  return { names, records, submitted };
}

test(
  "actual constrained PostgreSQL grant report prepare, approval, immutable freeze, scope, replay and recovery (synthetic provenance only)",
  {
    skip: configured
      ? false
      : "Set owner and constrained application URLs for isolated schema tests.",
    timeout: 900000,
  },
  async (t) => {
    const schema = "os_grant_reports_" + randomBytes(8).toString("hex"),
      owner = database(process.env.DATABASE_URL);
    let migration, db;
    let main, frozen, mainCommand, oldModuleReport;
    const query = (text, values, organization = org) =>
      db.tx(actor, organization, (c) => c.query(text, values));
    const source = async (rid) =>
      (await db.tx(actor, org, (c) => allRecords(c, org))).find(
        (record) => record.id === rid,
      );
    const call = (
      action,
      input,
      user = actor,
      organization = org,
      queryString = "",
    ) =>
      db.tx(
        user,
        organization,
        async (c) => {
          const tail = "grant-reports" + (action ? "/" + action : "");
          const response = await grantReportRoutes({
            c,
            org: organization,
            user,
            member: await membership(c, organization, user),
            tail,
            method: input === undefined ? "GET" : "POST",
            input: input || {},
            url: new URL(
              settings.origin +
                "/api/orgs/" +
                organization +
                "/" +
                tail +
                queryString,
            ),
            settings,
          });
          return response.json();
        },
        { lock: input !== undefined },
      );
    const api = async (
      path,
      {
        user = actor,
        method = "GET",
        body,
        expect = 200,
        csrfHeader = true,
      } = {},
    ) => {
      const session = {
        user: {
          id: user,
          email: user + "@example.invalid",
          emailVerified: true,
        },
        session: { id: "synthetic-session-" + user },
      };
      const handle = createHandler({
        settings,
        db,
        auth: { api: { getSession: async () => (user ? session : null) } },
        send: async () => {
          throw new Error("Grant report tests must not send mail.");
        },
      });
      const headers = {
        ...(method !== "GET"
          ? {
              "content-type": "application/json",
              origin: settings.origin,
              ...(csrfHeader
                ? { "x-csrf-token": csrf(session.session.id, settings.secret) }
                : {}),
            }
          : {}),
      };
      const response = await handle(
        new Request(settings.origin + path, {
          method,
          headers,
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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
    const seed = async (prefix, organization = org) => {
      const data = fixture(prefix, organization);
      await db.tx(
        actor,
        organization,
        async (c) => {
          for (const record of data.records)
            await c.query(
              "INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision,approval,snapshot,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
              [
                organization,
                record.id,
                record.moduleId,
                JSON.stringify(record.data),
                record.status,
                record.ownerId,
                record.lastEditedBy,
                record.revision,
                record.approval ? JSON.stringify(record.approval) : null,
                record.snapshot ? JSON.stringify(record.snapshot) : null,
                record.createdAt,
                record.updatedAt,
              ],
            );
          await c.query(
            "INSERT INTO os_events(org_id,actor_id,action,record_id,module_id,detail) VALUES($1,$2,'record.transitioned',$3,'grant-seeking',$4)",
            [
              organization,
              reviewer,
              data.names.application,
              JSON.stringify({
                record: data.submitted,
                reason:
                  "Synthetic server artifact fixture, not an actual submission or review.",
              }),
            ],
          );
        },
        { lock: true },
      );
      return data;
    };
    const approveManifest = async (data) => {
      const record = await source(data.names.manifest),
        prepared = await call("prepare", {
          reportingRecordId: record.id,
          revision: record.revision,
        });
      let next = (
        await api(`/api/orgs/${org}/modules/reporting/records/${record.id}`, {
          method: "PATCH",
          body: {
            revision: record.revision,
            data: { ...record.data, sourceDigest: prepared.sourceDigest },
          },
        })
      ).record;
      assert.equal(next.approval, null);
      next = (
        await api(
          `/api/orgs/${org}/modules/reporting/records/${record.id}/transition`,
          {
            method: "POST",
            body: {
              revision: next.revision,
              to: "review",
              reason: "Synthetic manifest ready for separate review.",
            },
          },
        )
      ).record;
      await api(
        `/api/orgs/${org}/modules/reporting/records/${record.id}/approve`,
        {
          method: "POST",
          body: { revision: next.revision, reason: "Self approval must fail." },
          expect: 403,
        },
      );
      next = (
        await api(
          `/api/orgs/${org}/modules/reporting/records/${record.id}/approve`,
          {
            user: reviewer,
            method: "POST",
            body: {
              revision: next.revision,
              reason:
                "Synthetic second-account fixture review, not professional/human verification.",
            },
          },
        )
      ).record;
      next = (
        await api(
          `/api/orgs/${org}/modules/reporting/records/${record.id}/transition`,
          {
            user: reviewer,
            method: "POST",
            body: {
              revision: next.revision,
              to: "approved",
              reason: "Synthetic approval workflow.",
            },
          },
        )
      ).record;
      return next;
    };
    const preview = async (data) => {
      const manifest = await source(data.names.manifest);
      return call("preview", {
        reportingRecordId: manifest.id,
        revision: manifest.revision,
      });
    };
    const freezeInput = (preview) => ({
      previewId: preview.previewId,
      reviewHash: preview.reviewHash,
      idempotencyKey: key(),
    });
    try {
      await owner.pool.query(`CREATE SCHEMA ${quote(schema)}`);
      migration = database(direct(process.env.DATABASE_URL), { schema });
      await migration.migrate();
      await migration.migrate();
      const role = decodeURIComponent(
        new URL(process.env.OS_DATABASE_URL).username,
      );
      assert.notEqual(
        role,
        decodeURIComponent(new URL(process.env.DATABASE_URL).username),
      );
      const flags = (
        await owner.pool.query(
          "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1",
          [role],
        )
      ).rows[0];
      assert.equal(flags.rolsuper, false);
      assert.equal(flags.rolbypassrls, false);
      await owner.pool.query(
        `GRANT USAGE ON SCHEMA ${quote(schema)} TO ${quote(role)}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${quote(schema)} TO ${quote(role)}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${quote(schema)} TO ${quote(role)}; REVOKE UPDATE,DELETE ON ${quote(schema)}.os_reports,${quote(schema)}.os_events FROM ${quote(role)}`,
      );
      db = database(direct(process.env.OS_DATABASE_URL), { schema });
      for (const organization of [
        org,
        "synthetic-other-org",
        "synthetic-restored-org",
      ])
        await db.tx(actor, organization, async (c) => {
          await c.query(
            "INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional grant report test',$1,'USD','UTC')",
            [organization],
          );
          await c.query(
            "INSERT INTO os_members(org_id,user_id,role,program_ids) VALUES($1,$2,'admin','[]'),($1,$3,'admin','[]'),($1,'synthetic-board','board_reader','[]'),($1,'synthetic-external','external_reviewer','[]'),($1,'synthetic-contributor','contributor','[]')",
            [organization, actor, reviewer],
          );
        });
      await t.test(
        "new table forces tenant RLS and route auth/CSRF/query guards precede report access",
        async () => {
          const flags = (
            await owner.pool.query(
              "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace=$1::regnamespace AND relname=$2",
              [schema, "os_grant_report_previews"],
            )
          ).rows[0];
          assert.ok(flags.relrowsecurity && flags.relforcerowsecurity);
          assert.equal(
            (
              await db.tx(actor, null, (c) =>
                c.query("SELECT * FROM os_grant_report_previews"),
              )
            ).rows.length,
            0,
          );
          await assert.rejects(
            db.tx(actor, "synthetic-other-org", (c) =>
              c.query(
                "INSERT INTO os_grant_report_previews(org_id,id,actor_id,manifest_id,manifest_revision,review_hash,payload,expires_at) VALUES($1,'forbidden',$2,'manifest',1,$3,'{}',now()+interval '1 minute')",
                [org, actor, "a".repeat(64)],
              ),
            ),
            (e) => e.code === "42501",
          );
          await api(`/api/orgs/${org}/grant-reports`, {
            user: null,
            expect: 401,
          });
          await api(`/api/orgs/${org}/grant-reports/prepare`, {
            method: "POST",
            body: {},
            csrfHeader: false,
            expect: 403,
          });
          await assert.rejects(
            call(undefined, undefined, actor, org, "?key=private"),
            failure(400),
          );
          await assert.rejects(
            call("prepare", {}, "synthetic-board"),
            failure(403),
          );
          await assert.rejects(
            call("prepare", {}, "synthetic-external"),
            failure(403),
          );
        },
      );
      await t.test(
        "draft prepare and normal separate approval bind source digest without a revision cycle; historical submitted artifact survives a later snapshot",
        async () => {
          main = await seed("main");
          const draft = await source(main.names.manifest);
          const prep = await call("prepare", {
            reportingRecordId: draft.id,
            revision: draft.revision,
          });
          assert.match(prep.sourceDigest, /^[a-f0-9]{64}$/);
          await assert.rejects(preview(main), failure(409, 422));
          const manifest = await approveManifest(main);
          assert.equal(manifest.data.sourceDigest, prep.sourceDigest);
          const pr = await preview(main);
          assert.equal(pr.sourceDigest, prep.sourceDigest);
          assert.equal(
            pr.report.sections.grantContext.application.current.status,
            "decided",
          );
          assert.equal(
            pr.report.sections.grantContext.application.submitted.revision,
            3,
          );
          assert.equal(pr.report.sections.finances.receipts.totalMinor, 30000);
          assert.equal(pr.report.sections.finances.spending.totalMinor, 10000);
          assert.equal(pr.report.sections.observations[0].value, 0);
          mainCommand = freezeInput(pr);
          const result = await call("freeze", mainCommand);
          assert.equal(result.commandRecorded, true);
          frozen = result.report;
          assert.equal(frozen.kind, "grant-period");
          assert.equal(
            hash(
              Object.fromEntries(
                Object.entries(frozen).filter(([k]) => k !== "checksum"),
              ),
            ),
            frozen.checksum,
          );
        },
      );
      await t.test(
        "generic snapshots retain old reads while grant boards receive only a safe server-selected projection",
        async () => {
          oldModuleReport = (
            await api(`/api/orgs/${org}/reports`, {
              method: "POST",
              body: {
                title: "Fictional legacy module snapshot",
                moduleIds: ["programs"],
              },
            })
          ).report;
          assert.deepEqual(
            (await api(`/api/orgs/${org}/reports/${oldModuleReport.id}`))
              .report,
            oldModuleReport,
          );
          const legacyList = await api(`/api/orgs/${org}/reports`);
          assert.ok(
            legacyList.reports.some((r) => r.id === oldModuleReport.id),
          );
          assert.ok(!legacyList.reports.some((r) => r.id === frozen.id));
          await api(`/api/orgs/${org}/reports/${oldModuleReport.id}`, {
            user: "synthetic-board",
            expect: 403,
          });
          await api(`/api/orgs/${org}/reports/${frozen.id}`, {
            user: "synthetic-board",
            expect: 403,
          });
          const board = (await call(frozen.id, undefined, "synthetic-board"))
            .report;
          assert.equal(board.kind, "grant-period-board");
          assert.equal(board.id, frozen.id);
          assert.equal(
            hash(
              Object.fromEntries(
                Object.entries(board).filter(([k]) => k !== "checksum"),
              ),
            ),
            board.checksum,
          );
          assert.doesNotMatch(JSON.stringify(board), /PRIVATE-/);
          const keys = (value) =>
            value && typeof value === "object"
              ? Object.entries(value).flatMap(([key, value]) => [
                  key,
                  ...keys(value),
                ])
              : [];
          assert.ok(
            !keys(board).some((key) =>
              [
                "actorId",
                "createdBy",
                "ownerId",
                "lastEditedBy",
                "authorization",
                "command",
                "externalUrl",
                "sourceUrl",
              ].includes(key),
            ),
          );
          await assert.rejects(
            call(frozen.id, undefined, actor, "synthetic-other-org"),
            failure(404),
          );
          await assert.rejects(
            call(frozen.id, undefined, "synthetic-external"),
            failure(403),
          );
          await assert.rejects(
            call(frozen.id, undefined, "synthetic-contributor"),
            failure(404),
          );
          await query(
            "UPDATE os_members SET program_ids='[\"other-program\"]',revision=revision+1 WHERE org_id=$1 AND user_id='synthetic-board'",
            [org],
          );
          assert.equal(
            (await call(undefined, undefined, "synthetic-board")).reports
              .length,
            0,
          );
          await assert.rejects(
            call(frozen.id, undefined, "synthetic-board"),
            failure(404),
          );
          await query(
            "UPDATE os_members SET program_ids='[]',revision=revision+1 WHERE org_id=$1 AND user_id='synthetic-board'",
            [org],
          );
        },
      );
      await t.test(
        "concurrent same-key freeze creates one report; different-key natural edition reuse cannot duplicate it",
        async () => {
          const data = await seed("race");
          await approveManifest(data);
          const pr = await preview(data),
            input = freezeInput(pr);
          const responses = await Promise.all([
            call("freeze", input),
            call("freeze", input),
            call("freeze", input),
          ]);
          assert.equal(new Set(responses.map((r) => r.report.id)).size, 1);
          assert.ok(responses.every((r) => r.commandRecorded === true));
          await assert.rejects(
            call("freeze", { ...input, reviewHash: "b".repeat(64) }),
            failure(409),
          );
          const next = await preview(data),
            naturalInput = freezeInput(next),
            reused = await call("freeze", naturalInput);
          assert.equal(reused.report.id, responses[0].report.id);
          assert.equal(reused.reused, true);
          assert.equal(reused.commandRecorded, false);
          assert.equal(
            Number(
              (
                await query(
                  "SELECT count(*) AS count FROM os_reports WHERE org_id=$1 AND payload#>>'{manifest,id}'=$2",
                  [org, data.names.manifest],
                )
              ).rows[0].count,
            ),
            1,
          );
          const another = await seed("natural-key-not-a-receipt");
          await approveManifest(another);
          const anotherPreview = await preview(another);
          const later = await call("freeze", {
            ...freezeInput(anotherPreview),
            idempotencyKey: naturalInput.idempotencyKey,
          });
          assert.equal(later.commandRecorded, true);
          assert.notEqual(later.report.id, reused.report.id);
          await assert.rejects(call("freeze", naturalInput), failure(409));
          await assert.rejects(
            db.tx(actor, org, (c) =>
              c.query(
                "UPDATE os_reports SET title='illegal' WHERE org_id=$1 AND id=$2",
                [org, responses[0].report.id],
              ),
            ),
            (e) => ["42501", "P0001"].includes(e.code),
          );
          await assert.rejects(
            db.tx(actor, org, (c) =>
              c.query("DELETE FROM os_reports WHERE org_id=$1 AND id=$2", [
                org,
                responses[0].report.id,
              ]),
            ),
            (e) => ["42501", "P0001"].includes(e.code),
          );
        },
      );
      await t.test(
        "correction appends an approved new edition and keeps the original payload/checksum immutable",
        async () => {
          const original = await source(main.names.manifest),
            rid = "main-correction-manifest";
          const data = validateRecord(
            "reporting",
            {
              ...original.data,
              title: "Fictional corrected report",
              sourceDigest: null,
              supersedesReportId: frozen.id,
              revisionReason: "Correct an explicitly fictional aggregate note.",
            },
            {
              records: await db.tx(actor, org, (c) => allRecords(c, org)),
              orgId: org,
              recordId: rid,
              status: "draft",
            },
          );
          await query(
            "INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision) VALUES($1,$2,'reporting',$3,'draft',$4,$4,1)",
            [org, rid, JSON.stringify(data), actor],
          );
          const corrected = { names: { manifest: rid } };
          await approveManifest(corrected);
          const next = (
            await call("freeze", freezeInput(await preview(corrected)))
          ).report;
          assert.equal(next.supersedes.id, frozen.id);
          assert.equal(next.supersedes.checksum, frozen.checksum);
          assert.notEqual(next.id, frozen.id);
          assert.equal(
            stable(
              (
                await query(
                  "SELECT payload FROM os_reports WHERE org_id=$1 AND id=$2",
                  [org, frozen.id],
                )
              ).rows[0].payload,
            ),
            stable(frozen),
          );
        },
      );
      await t.test(
        "source edit/reapproval and membership changes invalidate cached proofs atomically; old command recovers historical success only with current read access",
        async () => {
          const data = await seed("stale");
          await approveManifest(data);
          const pr = await preview(data),
            before = Number(
              (
                await query(
                  "SELECT count(*) AS count FROM os_reports WHERE org_id=$1",
                  [org],
                )
              ).rows[0].count,
            );
          await query(
            "UPDATE os_records SET revision=revision+1,approval=NULL,status='review' WHERE org_id=$1 AND id=$2",
            [org, data.names.receipt],
          );
          await assert.rejects(
            call("freeze", freezeInput(pr)),
            failure(409, 422),
          );
          assert.equal(
            Number(
              (
                await query(
                  "SELECT count(*) AS count FROM os_reports WHERE org_id=$1",
                  [org],
                )
              ).rows[0].count,
            ),
            before,
          );
          await query(
            "UPDATE os_records SET approval=jsonb_build_object('status','approved','revision',revision,'actorId',$3::text,'at','2026-10-26T13:00:00.000Z'),status='reconciled' WHERE org_id=$1 AND id=$2",
            [org, data.names.receipt, reviewer],
          );
          await assert.rejects(preview(data), failure(409, 422));
          const memberData = await seed("member-stale");
          await approveManifest(memberData);
          const memberPreview = await preview(memberData);
          await query(
            "UPDATE os_members SET revision=revision+1 WHERE org_id=$1 AND user_id=$2",
            [org, actor],
          );
          await assert.rejects(
            call("freeze", freezeInput(memberPreview)),
            failure(409),
          );
          await query(
            "UPDATE os_records SET revision=revision+1,approval=NULL,status='review' WHERE org_id=$1 AND id=$2",
            [org, main.names.receipt],
          );
          const replay = await call("freeze", mainCommand);
          assert.equal(replay.report.id, frozen.id);
          assert.equal(replay.commandRecorded, true);
          await query("DELETE FROM os_members WHERE org_id=$1 AND user_id=$2", [
            org,
            actor,
          ]);
          await assert.rejects(call(frozen.id), failure(403));
          await assert.rejects(call("freeze", mainCommand), failure(403));
          await query(
            "INSERT INTO os_members(org_id,user_id,role,program_ids) VALUES($1,$2,'admin','[]')",
            [org, actor],
          );
        },
      );
      await t.test(
        "preview quotas and ordinary workspace budget roll back without a report or partial audit",
        async () => {
          const data = await seed("quota");
          await approveManifest(data);
          await query("DELETE FROM os_grant_report_previews WHERE org_id=$1", [
            org,
          ]);
          for (let n = 0; n < 4; n++) await preview(data);
          await assert.rejects(preview(data), failure(422));
          assert.equal(
            Number(
              (
                await query(
                  "SELECT count(*) AS count FROM os_grant_report_previews WHERE org_id=$1",
                  [org],
                )
              ).rows[0].count,
            ),
            4,
          );
          await query("DELETE FROM os_grant_report_previews WHERE org_id=$1", [
            org,
          ]);
          const pr = await preview(data),
            before = Number(
              (
                await query(
                  "SELECT count(*) AS count FROM os_reports WHERE org_id=$1",
                  [org],
                )
              ).rows[0].count,
            );
          await query(
            "INSERT INTO os_comments(org_id,id,record_id,actor_id,body) VALUES($1,'quota-padding',$2,$3,repeat('x',61*1024*1024))",
            [org, data.names.manifest, actor],
          );
          await assert.rejects(call("freeze", freezeInput(pr)), failure(422));
          assert.equal(
            Number(
              (
                await query(
                  "SELECT count(*) AS count FROM os_reports WHERE org_id=$1",
                  [org],
                )
              ).rows[0].count,
            ),
            before,
          );
          await query(
            "DELETE FROM os_comments WHERE org_id=$1 AND id='quota-padding'",
            [org],
          );
        },
      );
      await t.test(
        "private backup preserves report bytes while restore resets manifests and never recreates board authority or previews",
        async () => {
          const backup = await api(`/api/orgs/${org}/export`);
          const original = backup.reports.find((r) => r.id === frozen.id);
          assert.equal(stable(original.payload), stable(frozen));
          const previewed = await api(
            "/api/orgs/synthetic-restored-org/import/preview",
            { method: "POST", body: { backup } },
          );
          assert.equal(previewed.issues.length, 0);
          await api("/api/orgs/synthetic-restored-org/import/commit", {
            method: "POST",
            body: {
              previewId: previewed.previewId,
              checksum: previewed.checksum,
            },
          });
          const restored = await db.tx(actor, "synthetic-restored-org", (c) =>
            allRecords(c, "synthetic-restored-org"),
          );
          assert.ok(restored.every((r) => r.approval === null));
          assert.equal(
            (
              await db.tx(actor, "synthetic-restored-org", (c) =>
                c.query("SELECT * FROM os_reports"),
              )
            ).rows.length,
            0,
          );
          assert.equal(
            (
              await db.tx(actor, "synthetic-restored-org", (c) =>
                c.query("SELECT * FROM os_grant_report_previews"),
              )
            ).rows.length,
            0,
          );
          assert.equal(
            (
              await call(
                undefined,
                undefined,
                "synthetic-board",
                "synthetic-restored-org",
              )
            ).reports.length,
            0,
          );
          assert.equal(
            grantReportForReader(frozen, {
              role: "admin",
              programIds: ["different-program"],
            }),
            null,
          );
        },
      );
      console.log(
        "Grant report database checks used synthetic source approvals/submission artifacts, temporary constrained PostgreSQL and injected server identities. No actual human review, funder submission, provider, production record or email.",
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
