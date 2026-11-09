import { RESOURCE_RESERVATION_GUARD_SQL as reservationSql } from "../lib/resource-reservation-guards.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  exportParticipation,
  restoredParticipation,
} from "../lib/participation-backup.mjs";
import {
  checkParticipationExportCapacity,
  PARTICIPATION_SAFETY_RESERVE,
  checkCombinedParticipationCapacity,
} from "../lib/participation-capacity.mjs";
import { rowRecord } from "../lib/database.mjs";
import { hash } from "../lib/security.mjs";
import { projectionFixture } from "./fixtures/participation-projection.mjs";
import { emptyParticipationGroupsQuery } from "./fixtures/empty-participation-groups.mjs";
const cap = 8 * 1024 * 1024;
test("genuine wholly legacy state keeps its v2 exit without synthesizing repeated terms", async () => {
  const f = projectionFixture();
  assert(f.used < cap);
  const exported = await exportParticipation(f.c, "org");
  assert.equal(exported.version, 2);
  assert(
    exported.participations.every(
      (p) => !Object.hasOwn(p, "requestedInterval") && p.frozen === null,
    ),
  );
  assert(Buffer.byteLength(JSON.stringify(exported.participations)) < cap);
  const normalized = restoredParticipation({
    records: f.records.map(rowRecord),
    participation: exported,
  });
  assert.equal(normalized.participations.length, 1998);
  assert(normalized.participations.every((p) => p.frozen === null));
  assert.equal((await checkParticipationExportCapacity(f.c, "org")).version, 2);
});
test("new interval-aware projection refuses expansion before normalizing or retaining an unrecoverable state", async () => {
  const f = projectionFixture({ intervalAware: true });
  assert(f.used < cap);
  const exported = await exportParticipation(f.c, "org");
  assert.equal(exported.version, 3);
  assert(Buffer.byteLength(JSON.stringify(exported.participations)) > cap);
  await assert.rejects(checkParticipationExportCapacity(f.c, "org"), (e) =>
    ["participation_backup", "participation_backup_size"].includes(e.code),
  );
});
test("derived safety reserve covers cumulative new command, opt-out, timestamps and both encodings", () => {
  assert(PARTICIPATION_SAFETY_RESERVE.retained > 512);
  assert(PARTICIPATION_SAFETY_RESERVE.retained < 1024);
  assert(PARTICIPATION_SAFETY_RESERVE.native > 0);
  assert(
    PARTICIPATION_SAFETY_RESERVE.native < PARTICIPATION_SAFETY_RESERVE.retained,
  );
});

test("whole choices under newer interval-aware terms cannot be exported as legacy v2", async () => {
  const f = projectionFixture({ count: 1 });
  const newer = projectionFixture({ count: 1, intervalAware: true }).targets[0]
    .terms;
  f.participations[0].state = "confirmed";
  f.participations[0].frozen = {
    terms: newer,
    sourceRevision: 5,
    termsHash: hash(newer),
  };
  assert.equal((await exportParticipation(f.c, "org")).version, 3);
  const pending = projectionFixture({ count: 1 });
  pending.participations[0].state = "requested";
  pending.participations[0].consent.terms = newer;
  assert.equal((await exportParticipation(pending.c, "org")).version, 3);
});

test("cancelled v3 history still reserves later legal opt-out growth", async () => {
  const f = projectionFixture({ count: 1, intervalAware: true });
  const ordinary = await checkParticipationExportCapacity(f.c, "org");
  assert.equal(ordinary.retainedReserve, PARTICIPATION_SAFETY_RESERVE.retained);
  assert.equal(ordinary.nativeReserve, PARTICIPATION_SAFETY_RESERVE.native);
  const safety = await checkParticipationExportCapacity(f.c, "org", {
    reserve: false,
  });
  assert.equal(safety.retainedReserve, 0);
  assert.equal(safety.nativeReserve, 0);
});
test("combined operational and participation allowances use required totals and exact recovered bytes", () => {
  const logical = 60 * 1024 * 1024,
    wire = 64 * 1024 * 1024;
  const whole = {
    usage: logical - 100,
    backupBytes: wire - 100,
    requiredUsage: logical - 50,
    requiredBackupBytes: wire - 50,
  };
  assert.throws(
    () =>
      checkCombinedParticipationCapacity(whole, {
        retainedReserve: 60,
        nativeReserve: 60,
      }),
    (e) => e.code === "participation_backup_size",
  );
  checkCombinedParticipationCapacity(whole, {
    retainedReserve: 50,
    nativeReserve: 50,
  });
  assert.throws(
    () =>
      checkCombinedParticipationCapacity(
        {
          ...whole,
          restore: {
            requiredLogicalBytes: 1000,
            backupBytes: 1000,
            categories: { os_participations: { bytes: 8 * 1024 * 1024 - 20 } },
          },
        },
        { retainedReserve: 21, nativeReserve: 0 },
      ),
    (e) => e.code === "participation_backup_size",
  );
});

test("an optional export journal cannot consume the last byte of a v3 exit packet", async () => {
  // Closed synthetic query surface exercises the actual exporter and audit gate.
  // Its deliberately large historical comment is a wire-boundary witness only,
  // not a claim that a product authoring flow created a 64 MiB PG workspace.
  const f = projectionFixture({ count: 1, intervalAware: true });
  let body = "",
    inserts = 0;
  const emptyTables = new Set([
    "os_events",
    "os_reports",
    "os_files",
    "os_integrations",
    "os_publications",
    "os_intake",
    "os_participation_delivery_policies",
    "os_task_recurrence_series",
    "os_task_recurrence_occurrences",
    "os_learning_history",
    "os_incubator_history",
    "os_resource_directory_history",
  ]);
  const c = {
    query: async (sql, values) => {
      if (sql === reservationSql.destination) return { rows: [{ occupied: false }], rowCount: 1 };
      const emptyGroups = emptyParticipationGroupsQuery(sql, values);
      if (emptyGroups !== undefined) return emptyGroups;
      if (
        sql.startsWith(
          "SELECT EXISTS(SELECT 1 FROM os_learning_history WHERE org_id=$1)",
        ) &&
        sql.includes(" AS incubator")
      )
        return { rows: [{ present: false, incubator: false }] }; // This closed v3 witness has no Incubator history or pending purpose rows.
      if (sql.startsWith("SELECT sum(size) AS size FROM"))
        return { rows: [{ size: 1000 }] };
      if (sql.startsWith("SELECT * FROM os_orgs"))
        return {
          rows: [
            {
              id: "org",
              name: "Fictional boundary",
              currency: "USD",
              time_zone: "UTC",
            },
          ],
        };
      if (sql.startsWith("SELECT * FROM os_comments"))
        return {
          rows: [
            {
              org_id: "org",
              id: "comment",
              record_id: "shift",
              actor_id: "fictional-owner",
              body,
              created_at: new Date("2026-11-07T00:00:00.000Z"),
            },
          ],
        };
      if (
        sql.includes("FROM os_records") &&
        sql.includes("deleted_at IS NOT NULL")
      )
        return { rows: [] };
      if (sql.startsWith("SELECT count(*) AS count FROM os_participation_checkins")) return { rows: [{ count: 0 }] };
      if (sql.startsWith("SELECT t.* FROM os_participation_checkins")) return { rows: [] };
      const table = /\bFROM (os_[a-z_]+)\b/.exec(sql)?.[1];
      if (sql.startsWith("SELECT") && emptyTables.has(table))
        return { rows: [] };
      if (sql.startsWith("INSERT INTO os_events")) {
        inserts++;
        return { rows: [], rowCount: 1 };
      }
      return f.c.query(sql, values);
    },
  };
  const { assembleWorkspaceBackup } = await import(
    "../lib/workspace-backup.mjs"
  );
  const { audit } = await import("../lib/database.mjs");
  const first = await assembleWorkspaceBackup(c, "org");
  assert.equal(first.participation.version, 3);
  assert.equal(
    await audit(c, "org", "fictional-owner", "backup.exported", null, {
      count: 3,
    }),
    true,
  );
  assert.equal(inserts, 1);
  const whole = 64 * 1024 * 1024;
  body = "x".repeat(whole - 1 - Buffer.byteLength(JSON.stringify(first)));
  const packet = await assembleWorkspaceBackup(c, "org");
  assert.equal(Buffer.byteLength(JSON.stringify(packet)), whole - 1);
  inserts = 0;
  assert.equal(
    await audit(c, "org", "fictional-owner", "backup.exported", null, {
      count: 3,
    }),
    false,
  );
  assert.equal(inserts, 0);
  assert.equal(
    Buffer.byteLength(JSON.stringify(await assembleWorkspaceBackup(c, "org"))),
    whole - 1,
  );
});

test("safety and receipt Replay still enforce actual retained SQL participation bytes without a new reserve", async () => {
  const f = projectionFixture({ count: 1, intervalAware: true });
  const c = {
    query: (sql, args) =>
      sql.startsWith("SELECT COALESCE(sum(") &&
      sql.includes(" AS interval_bytes FROM os_participations t")
        ? Promise.resolve({
            rows: [
              { bytes: 8 * 1024 * 1024 + 1, raw_bytes: 8 * 1024 * 1024 + 1, interval_bytes: 8 * 1024 * 1024 + 1 },
            ],
          })
        : f.c.query(sql, args),
  };
  await assert.rejects(
    checkParticipationExportCapacity(c, "org", { reserve: false }),
    (e) => e.code === "participation_backup_size",
  );
});
