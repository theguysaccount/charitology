import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { database, logicalBackupBytes } from "../lib/database.mjs";
import { applicationGrantsSql } from "../lib/migration-grants.mjs";
import { learningMappedFixture, buildLearningFixture } from "../test/learning-fixtures.mjs";
import { learningHash } from "../lib/learning-json.mjs";
import { validateRecord, validateTransition } from "../lib/modules.mjs";
import { learningJSONBBytes, learningReportReserveBytes, measureLearningBackup, restoreLearningBridge, exportLearningBridge } from "../lib/learning-backup.mjs";

const configured = !!(process.env.DATABASE_URL && process.env.OS_DATABASE_URL);
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const direct = value => { const url = new URL(value); url.hostname = url.hostname.replace(/-pooler(?=\.)/, ""); return url.toString(); };
const empty = () => ({ format: "charitology-learning-backup", version: 1, method: "learning-review-v1", sources: [], approvedEvidence: [], events: [], reports: [] });
const mappedBackup = fixture => ({ ...empty(), sources: fixture.sources, events: fixture.events });
const receiptFor = event => {
  const payload = event.payload, frozen = payload.kind === "report-frozen";
  const operation = { mapped: "map", measured: "measure", decided: "decide", "report-frozen": "freeze" }[payload.kind];
  return { version: 1, operation, commandHash: learningHash("command", { event: event.sha256 }),
    requestHash: learningHash("request", { event: event.sha256 }), actorBindingHash: "c".repeat(64),
    actorId: event.actorId, sessionSha256: "d".repeat(64), membershipSha256: "e".repeat(64),
    memberCreatedAtExact: "2026-10-27T00:00:00.000000Z", restoreEpochSha256: "f".repeat(64),
    previewId: "fictional-private-retry-material-" + event.sequence, reviewSha256: "0".repeat(64),
    acceptedAt: "2026-10-27T00:00:00.000Z", result: {
      outcome: frozen ? "frozen" : payload.kind,
      head: { originOrgId: event.originOrgId, bindingId: event.bindingId, sequence: event.sequence, eventSha256: event.sha256 },
      records: payload.records ?? [payload.record ?? payload.frozenManifest],
      report: frozen ? { id: payload.reportId, checksum: payload.reportChecksum } : null,
    } };
};

// A live history belongs to the same complete ordinary-record inventory that
// production commits before the shared export/restore capacity gate runs.
async function insertLiveRecords(c, fixture, actor) {
  const frozen = fixture.events.find(event => event.payload.kind === "report-frozen")?.payload.frozenManifest;
  for (const original of fixture.records) {
    const record = structuredClone(original);
    if (record.id === frozen?.recordId) {
      validateTransition("reporting", record.status, "frozen", {
        role: "admin", actorId: actor, ownerId: record.lastEditedBy,
        approved: true, snapshotApproved: true,
      });
      record.data = validateRecord("reporting", record.data, {
        orgId: fixture.orgId, recordId: record.id, status: "frozen",
        records: fixture.records, previous: record.data,
      });
      assert.equal(frozen.revision, record.revision + 1);
      assert.equal(frozen.dataSha256, learningHash("data", record.data));
      record.status = "frozen";
      record.revision = frozen.revision;
      record.approval.revision = frozen.revision;
      record.snapshot = { ...record.snapshot, status: "frozen", revision: frozen.revision };
    }
    await c.query("INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision,approval,snapshot,source,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
      [fixture.orgId, record.id, record.moduleId, JSON.stringify(record.data), record.status, record.ownerId,
        record.lastEditedBy, record.revision, JSON.stringify(record.approval), JSON.stringify(record.snapshot),
        record.source === null ? null : JSON.stringify(record.source), record.createdAt, record.updatedAt]);
  }
}

test("actual isolated PostgreSQL learning backup representation, category and inactive recovery", {
  skip: configured ? false : "Set owner and constrained URLs for isolated schema checks.", timeout: 300000,
}, async t => {
  const schema = "os_learning_backup_" + randomBytes(8).toString("hex");
  const owner = database(direct(process.env.DATABASE_URL));
  let migration, db;
  const org = "fictional-learning-backup-org", other = "fictional-learning-backup-other", liveOrg = "fictional-learning-backup-live", reportOrg = "fictional-learning-backup-live-report", actor = "fictional-learning-backup-actor";
  const tx = (fn, organization = org) => db.tx(actor, organization, fn, { lock: true });
  try {
    await owner.pool.query(`CREATE SCHEMA ${quote(schema)}`);
    migration = database(direct(process.env.DATABASE_URL), { schema });
    assert.equal((await migration.pool.query("SELECT current_schema() AS name")).rows[0].name, schema);
    await migration.migrate();
    const role = decodeURIComponent(new URL(process.env.OS_DATABASE_URL).username);
    assert.notEqual(role, decodeURIComponent(new URL(process.env.DATABASE_URL).username));
    await migration.pool.query(applicationGrantsSql(role, schema));
    db = database(direct(process.env.OS_DATABASE_URL), { schema });
    for (const organization of [org, other, liveOrg, reportOrg]) await tx(c => c.query("INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,$2,$3,'USD','UTC')", [organization, "Fictional backup test", organization]), organization);

    await t.test("uses constrained role and both tenant tables force row isolation", async () => {
      const privileges = (await db.pool.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
      assert.deepEqual(privileges, { rolsuper: false, rolbypassrls: false });
      for (const table of ["os_learning_history", "os_learning_previews"]) {
        const flags = (await migration.pool.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass", [schema + "." + table])).rows[0];
        assert.deepEqual(flags, { relrowsecurity: true, relforcerowsecurity: true });
      }
      assert.equal((await db.pool.query("SELECT count(*) FROM os_learning_history")).rows[0].count, "0");
    });

    await t.test("actual JSONB bytes match decimal expansion, separator and Unicode accounting", async () => {
      for (const value of [1e21, 1e-7, -1.25e-8, 5e-324, { a: "界\n\"\\", b: [0, null, true, { c: 1e-10 }] }, [1.234e25, -0, "😀"]]) {
        const bytes = Number((await tx(c => c.query("SELECT octet_length($1::jsonb::text) AS bytes", [JSON.stringify(value)]))).rows[0].bytes);
        assert.equal(learningJSONBBytes(value), bytes);
        assert.equal(learningReportReserveBytes(value), bytes + 4096);
      }
    });

    await t.test("old absent and empty admitted sections create no authority or reports", async () => {
      const before = (await tx(c => c.query("SELECT count(*) FROM os_events"))).rows[0].count;
      const summary = await tx(c => restoreLearningBridge(c, org, undefined));
      assert.deepEqual(summary, { sources: 0, approvedEvidence: 0, events: 0, reports: 0, nonreportBytes: 0, reportBytes: 0, totalBytes: 0 });
      assert.deepEqual(await tx(c => measureLearningBackup(c, empty())), { nonreportCount: 0, nonreportBytes: 0, evidenceCount: 0, reportCount: 0, reportBytes: 0, totalBytes: 0, rows: [] });
      assert.equal((await tx(c => c.query("SELECT count(*) FROM os_events"))).rows[0].count, before);
      assert.equal(await tx(c => exportLearningBridge(c, org)), undefined);
      await assert.rejects(tx(c => restoreLearningBridge(c, org, null)));
    });

    await t.test("a transient feature preview makes a destination nonempty", async () => {
      await tx(c => c.query("INSERT INTO os_learning_previews(org_id,id,actor_id,session_sha256,membership_sha256,restore_epoch_sha256,kind,payload,review_sha256,expires_at) VALUES($1,'fictional-preview',$2,$3,$3,$3,'map','{}',$3,now()+interval '1 minute')", [org, actor, "a".repeat(64)]));
      await assert.rejects(tx(c => restoreLearningBridge(c, org, empty())), error => error.code === "restore_conflict");
      await tx(c => c.query("DELETE FROM os_learning_previews WHERE org_id=$1", [org]));
    });

    const fixture = learningMappedFixture({ orgId: "fictional-original-workspace" });
    const input = mappedBackup(fixture), context = { records: fixture.records, sourceOrgId: fixture.orgId };
    await t.test("a mid-restore error rolls back every recovered row", async () => {
      let inserts = 0;
      await assert.rejects(tx(c => restoreLearningBridge({ query: async (sql, params) => {
        if (sql.startsWith("INSERT INTO os_learning_history") && ++inserts === 2) throw new Error("Fictional interrupted restore");
        return c.query(sql, params);
      } }, other, input, context), other), /Fictional interrupted restore/);
      assert.equal(inserts, 2);
      assert.equal((await tx(c => c.query("SELECT count(*) FROM os_learning_history"), other)).rows[0].count, "0");
      assert.equal((await tx(c => c.query("SELECT count(*) FROM os_reports"), other)).rows[0].count, "0");
    });

    await t.test("whole closure restores inactive provenance once and exports identical original evidence", async () => {
      const measured = await tx(c => measureLearningBackup(c, input));
      const beforeAudit = (await tx(c => c.query("SELECT count(*) FROM os_events"))).rows[0].count;
      const summary = await tx(c => restoreLearningBridge(c, org, input, context));
      assert.deepEqual(summary, { sources: 1, approvedEvidence: 0, events: 1, reports: 0,
        nonreportBytes: measured.nonreportBytes, reportBytes: 0, totalBytes: measured.totalBytes });
      const rows = (await tx(c => c.query("SELECT row_kind,origin_mode,origin_org_id,receipt,budget_bytes,octet_length(payload::text) AS payload_bytes,octet_length(to_jsonb(h)::text) AS actual_bytes FROM os_learning_history h ORDER BY row_kind"))).rows;
      assert.equal(rows.length, 2);
      assert.ok(rows.every(row => row.origin_mode === "recovered" && row.origin_org_id === fixture.orgId && row.receipt === null));
      assert.ok(rows.every(row => row.budget_bytes === row.payload_bytes + 4096 && row.actual_bytes <= row.budget_bytes));
      assert.equal((await tx(c => c.query("SELECT count(*) FROM os_reports"))).rows[0].count, "0");
      assert.equal((await tx(c => c.query("SELECT count(*) FROM os_events"))).rows[0].count, beforeAudit);
      assert.deepEqual(await tx(c => exportLearningBridge(c, org, { ...context, sourceOrgId: fixture.orgId })), input);
      await assert.rejects(tx(c => restoreLearningBridge(c, org, input, context)), error => error.code === "restore_conflict");
      await assert.rejects(tx(c => c.query("UPDATE os_learning_history SET origin_mode='live' WHERE org_id=$1", [org])), error => error.code === "42501");
      await assert.rejects(tx(c => c.query("DELETE FROM os_learning_history WHERE org_id=$1", [org])), error => error.code === "42501");
    });

    await t.test("recovered rows remain invisible without tenant context and across organizations", async () => {
      assert.equal((await db.pool.query("SELECT count(*) FROM os_learning_history")).rows[0].count, "0");
      assert.equal((await tx(c => c.query("SELECT count(*) FROM os_learning_history WHERE org_id=$1", [org]), other)).rows[0].count, "0");
      await assert.rejects(tx(c => restoreLearningBridge(c, other, input, context)), error => error.code === "42501");
      assert.equal((await tx(c => c.query("SELECT count(*) FROM os_learning_history"), other)).rows[0].count, "0");
    });

    await t.test("live export removes durable command authority and dropping receipts cannot increase restore charge", async () => {
      const live = learningMappedFixture({ orgId: liveOrg }), section = mappedBackup(live);
      const receipt = receiptFor(live.root);
      await tx(async c => {
        await insertLiveRecords(c, live, actor);
        for (const [kind, payload, sequence, version, program, retainedReceipt] of [
          ["source", live.source, null, 1, null, null], ["event", live.root, 1, null, live.programId, receipt],
        ]) await c.query("INSERT INTO os_learning_history(org_id,id,row_kind,origin_mode,origin_org_id,binding_id,sequence,source_version,program_id,payload,receipt,budget_bytes) VALUES($1,$2,$3,'live',$1,$4,$5,$6,$7,$8,$9,octet_length($8::jsonb::text)+COALESCE(octet_length($9::jsonb::text),0)+4096)", [liveOrg, payload.sha256, kind, live.bindingId, sequence, version, program, JSON.stringify(payload), retainedReceipt ? JSON.stringify(retainedReceipt) : null]);
      }, liveOrg);
      const exported = await tx(c => exportLearningBridge(c, liveOrg, { records: live.records }), liveOrg);
      assert.deepEqual(exported, section);
      assert.ok(!JSON.stringify(exported).includes("fictional-private-retry-material"));
      const sourceUsage = Number((await tx(c => c.query("SELECT sum(GREATEST(octet_length(to_jsonb(h)::text),budget_bytes)) AS bytes FROM os_learning_history h"), liveOrg)).rows[0].bytes);
      const destination = await tx(c => measureLearningBackup(c, exported));
      assert.ok(destination.totalBytes < sourceUsage);
      assert.equal(sourceUsage - destination.totalBytes, learningJSONBBytes(receipt));
    });

    const complete = buildLearningFixture({ orgId: reportOrg });
    const reportContext = { records: complete.records, sourceOrgId: complete.orgId };
    await t.test("report recovery uses the separate report category and creates no active report copy", async () => {
      const measured = await tx(c => measureLearningBackup(c, complete.backup), other);
      const summary = await tx(c => restoreLearningBridge(c, other, complete.backup, reportContext), other);
      assert.equal(summary.reports, 1);
      assert.equal(summary.reportBytes, learningReportReserveBytes(complete.report));
      assert.equal(summary.nonreportBytes, measured.nonreportBytes);
      assert.equal(summary.totalBytes, measured.totalBytes);
      const counts = (await tx(c => c.query("SELECT count(*) FILTER (WHERE row_kind<>'recovered-report') AS nonreport,count(*) FILTER (WHERE row_kind='recovered-report') AS reports,count(*) FILTER (WHERE receipt IS NOT NULL OR origin_mode<>'recovered') AS authority FROM os_learning_history"), other)).rows[0];
      assert.equal(Number(counts.nonreport), measured.nonreportCount);
      assert.equal(Number(counts.reports), 1);
      assert.equal(Number(counts.authority), 0);
      assert.equal((await tx(c => c.query("SELECT count(*) FROM os_reports"), other)).rows[0].count, "0");
      assert.equal(await tx(c => logicalBackupBytes(c, other), other), summary.totalBytes);
      assert.deepEqual(await tx(c => exportLearningBridge(c, other, reportContext), other), complete.backup);
    });

    await t.test("live report charge pays the recovery reserve once and duplicate inventories refuse atomically", async () => {
      const measured = await tx(c => measureLearningBackup(c, complete.backup), reportOrg);
      let receipts = 0, ordinaryBytes = 0;
      await tx(async c => {
        await insertLiveRecords(c, complete, actor);
        ordinaryBytes = await logicalBackupBytes(c, reportOrg);
        for (const row of measured.rows) {
          if (row.rowKind === "recovered-report") {
            await c.query("INSERT INTO os_reports(org_id,id,created_by,title,checksum,payload) VALUES($1,$2,$3,$4,$5,$6)", [reportOrg, row.payload.id, row.payload.createdBy, row.payload.title, row.payload.checksum, JSON.stringify(row.payload)]);
          } else {
            const receipt = row.rowKind === "event" ? receiptFor(row.payload) : null;
            receipts += receipt ? learningJSONBBytes(receipt) : 0;
            await c.query("INSERT INTO os_learning_history(org_id,id,row_kind,origin_mode,origin_org_id,binding_id,sequence,source_version,program_id,payload,receipt,budget_bytes) VALUES($1,$2,$3,'live',$4,$5,$6,$7,$8,$9,$10,octet_length($9::jsonb::text)+COALESCE(octet_length($10::jsonb::text),0)+4096)", [reportOrg, row.id, row.rowKind, row.originOrgId, row.bindingId, row.sequence, row.sourceVersion, row.programId, JSON.stringify(row.payload), receipt ? JSON.stringify(receipt) : null]);
          }
        }
      }, reportOrg);
      assert.equal(await tx(c => logicalBackupBytes(c, reportOrg), reportOrg), ordinaryBytes + measured.totalBytes + receipts);
      const exported = await tx(c => exportLearningBridge(c, reportOrg, reportContext), reportOrg);
      assert.deepEqual(exported, complete.backup);
      assert.equal(exported.reports.length, 1);
      assert.ok(!JSON.stringify(exported).includes("fictional-private-retry-material"));
      await assert.rejects(tx(async c => {
        await c.query("INSERT INTO os_learning_history(org_id,id,row_kind,origin_mode,origin_org_id,program_id,payload,receipt,budget_bytes) VALUES($1,$2,'recovered-report','recovered',$1,$3,$4,NULL,octet_length($4::jsonb::text)+4096)", [reportOrg, complete.report.checksum, complete.programId, JSON.stringify(complete.report)]);
        return exportLearningBridge(c, reportOrg, reportContext);
      }, reportOrg));
      assert.equal((await tx(c => c.query("SELECT count(*) FROM os_learning_history WHERE row_kind='recovered-report'"), reportOrg)).rows[0].count, "0");
      assert.deepEqual(await tx(c => exportLearningBridge(c, reportOrg, reportContext), reportOrg), complete.backup);
    });
  } finally {
    if (db) await db.close();
    if (migration) await migration.close();
    await owner.pool.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
    await owner.close();
  }
});
