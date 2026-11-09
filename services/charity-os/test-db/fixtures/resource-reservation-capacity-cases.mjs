/** Owned PostgreSQL assertions. This module never opens a connection. */
import assert from "node:assert/strict";
import { hash } from "../../lib/security.mjs";
import { validateBackup } from "../../lib/backup.mjs";
import { logicalBackupBytes, saveRecord } from "../../lib/database.mjs";
import { measureLearningRestoreCapacity } from "../../lib/learning-capacity.mjs";
import { assembleWorkspaceBackup, checkWorkspaceExportCapacity } from "../../lib/workspace-backup.mjs";
import { restoredResourceReservations, restoreResourceReservations } from "../../lib/resource-reservation-backup.mjs";
import { checkResourceReservationSafetyCapacity } from "../../lib/resource-reservation-capacity.mjs";
import {
  makeResourceReservationAuthority,
  planResourceReservationWrite,
  recordResourceRecoveryDisposition,
} from "../../lib/resource-reservation-ledger.mjs";
import {
  applyResourceReservationPlan,
  loadResourceReservationInventory,
  recordResourceReservationDisposition,
} from "../../lib/resource-reservation-store.mjs";

const actor = "fictional-admin";
const source = "reservation-capacity-source";
const recovered = "reservation-capacity-recovered";
const secondHop = "reservation-capacity-second-hop";
const stamp = "2000-01-01T00:00:00.000001Z";
const actionStamp = "2026-11-07T02:30:00.000001Z";
const interval = { startAt: "2099-01-02T09:00:00Z", endAt: "2099-01-02T10:00:00Z", timeZone: "UTC" };
const reason = "\u0800".repeat(300);
const sha = character => character.repeat(64);
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const pin = (id, moduleId, kind) => ({
  id, moduleId, kind, revision: 3, createdAtExact: stamp, dataSha256: sha("a"), approvalSha256: sha("b"),
});
const asset = pin("fixture-room", "assets", "asset");
const session = pin("fixture-session", "events", "session");
const authority = orgId => makeResourceReservationAuthority({
  orgId, actorId: actor, sessionId: "fictional-session", role: "admin", programIds: [],
  memberRevision: 1, memberCreatedAtExact: stamp, restoreEpochSha256: sha("c"),
});
const rehash = ({ checksum: _, ...body }) => ({ ...body, checksum: hash(body) });

async function tx(c, org, work, { readOnly = true } = {}) {
  await c.query("BEGIN");
  try {
    if (readOnly) await c.query("SET TRANSACTION READ ONLY");
    await c.query("SELECT set_config('app.org_id',$1,true),set_config('app.user_id',$2,true)", [org, actor]);
    if (!readOnly) await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [org]);
    const result = await work(c);
    await c.query("COMMIT");
    return result;
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  }
}

async function command(c, operation, request, newReservation = null) {
  const { rows } = await loadResourceReservationInventory(c, source);
  const plan = planResourceReservationWrite({
    orgId: source, actorId: actor, authority: authority(source), operation, request, rows,
    acceptedAtExact: actionStamp, newReservation,
  });
  return applyResourceReservationPlan(c, source, plan);
}

async function snapshot(c, org) {
  return {
    backup: JSON.parse(JSON.stringify(await assembleWorkspaceBackup(c, org))),
    inventory: await loadResourceReservationInventory(c, org),
    capacity: await checkWorkspaceExportCapacity(c, org),
  };
}

export async function runResourceReservationCapacityCases({ owner, runtime }) {
  const cases = [];
  const check = async (label, run) => {
    try { await run(); cases.push(label); }
    catch (cause) { throw new Error(label, { cause }); }
  };
  const read = (org, run) => tx(runtime, org, run);
  const write = (org, run) => tx(runtime, org, run, { readOnly: false });
  const restore = (packet, org) => write(org, async c => {
    const recovery = restoredResourceReservations(packet, org);
    for (const row of validateBackup(packet, org, actor)) await saveRecord(c, row);
    return restoreResourceReservations(c, org, recovery);
  });

  for (const org of [source, recovered, secondHop])
    await owner.query("INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,$1,$1,'USD','UTC')", [org]);
  for (const [pin, data] of [[asset, { title: "Fixture room", kind: "asset", quantity: 1 }],
    [session, { title: "Fixture session", kind: "session", ...interval }]]) {
    await owner.query(`INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision,created_at,updated_at)
      VALUES($1,$2,$3,$4::jsonb,'approved',$5,$5,3,$6::timestamptz,$6::timestamptz)`,
    [source, pin.id, pin.moduleId, JSON.stringify(data), actor, stamp]);
  }
  let before, live, initialRecovered, disposed;
  await check("Absent reservations keep the native namespace and restore categories absent", async () => {
    before = await read(source, c => snapshot(c, source));
    assert.equal(Object.hasOwn(before.backup, "resourceReservations"), false);
    assert.equal(Object.hasOwn(before.capacity, "resourceReservations"), false);
    const projection = await read(source, c => measureLearningRestoreCapacity(c, before.backup));
    assert.equal(Object.hasOwn(projection.categories, "os_resource_reservations"), false);
    assert.equal(Object.hasOwn(projection.categories, "os_resource_reservation_commands"), false);
    assert.equal(await read(source, c => checkResourceReservationSafetyCapacity(c, source)), null);
  });

  await check("Source charges real physical reservation and receipt rows exactly once and prepays one Release", async () => {
    await write(source, c => command(c, "reserve", {
      version: 1, previewToken: "review." + "A".repeat(43), reviewSha256: sha("d"),
      acknowledge: true, idempotencyKey: "capacity-reserve-test-01",
    }, { id: "first", proof: { version: 1, orgId: source, asset, session, quantity: 1, interval } }));
    live = await read(source, c => snapshot(c, source));
    const { capacity, inventory, backup } = live, metric = capacity.resourceReservations;
    const actual = (await owner.query(`SELECT
      (SELECT sum(octet_length(to_jsonb(t)::text))::int FROM os_resource_reservations t WHERE org_id=$1) +
      (SELECT sum(octet_length(to_jsonb(t)::text))::int FROM os_resource_reservation_commands t WHERE org_id=$1) AS bytes`,
    [source])).rows[0].bytes;
    assert.equal(inventory.quota.bytes, actual);
    assert.equal(capacity.usage - before.capacity.usage, actual);
    assert.equal(metric.retainedBytes, actual);
    assert.equal(metric.nativeBytes, bytes(backup.resourceReservations));
    assert.equal(metric.pendingReleases, 1);
    assert.equal(metric.pendingDispositions, 0);
    assert.ok(metric.retainedGrowthBytes > 900 && metric.nativeGrowthBytes > 900);
    assert.equal(capacity.requiredUsage - capacity.usage, metric.retainedGrowthBytes);
    assert.equal(capacity.requiredBackupBytes - capacity.backupBytes, metric.nativeGrowthBytes);
    assert.equal(backup.resourceReservations.histories[0].terminal, null);
    const safety = await read(source, c => checkResourceReservationSafetyCapacity(c, source));
    const audit = { org_id: source, actor_id: actor, action: "fixture.optional", record_id: session.id,
      module_id: session.moduleId, detail: { count: 1 } };
    const audited = await read(source, c => checkResourceReservationSafetyCapacity(c, source, { extraAudit: audit }));
    const auditSQL = (await owner.query(`SELECT octet_length(to_jsonb(e)::text) AS bytes
      FROM jsonb_populate_record(NULL::os_events,$1::jsonb) e`, [JSON.stringify({
      ...audit, id: "9223372036854775807", created_at: "2200-12-31T23:59:59.999999Z",
    })])).rows[0].bytes;
    assert.equal(audited.requiredUsage - safety.requiredUsage, auditSQL);
    assert.equal(audited.requiredBackupBytes - safety.requiredBackupBytes, bytes({
      ...audit, id: "9223372036854775807", created_at: "2200-12-31T23:59:59.999Z",
    }) + 2);
  });

  await check("Archive-only and missing source references fail during native validation", async () => {
    const missing = live.backup.records.find(row => row.id === asset.id);
    const records = live.backup.records.filter(row => row.id !== asset.id);
    assert.throws(() => validateBackup(rehash({ ...live.backup, records, trash: [missing] }), recovered, actor),
      { code: "resource_reservation_archive_source" });
    assert.throws(() => validateBackup(rehash({ ...live.backup, records }), recovered, actor),
      { code: "resource_reservation_source" });
    const wrongModule = live.backup.records.map(row => row.id === asset.id
      ? { ...row, moduleId: "events", data: { title: "Different module", kind: "session", ...interval } } : row);
    assert.throws(() => validateBackup(rehash({ ...live.backup, records: wrongModule }), recovered, actor),
      { code: "resource_reservation_source" });
  });

  await check("Native restore stores only inactive histories and budgets the exact target rows", async () => {
    const projection = await read(recovered, c => measureLearningRestoreCapacity(c, live.backup, { orgId: recovered, actorId: actor }));
    assert.equal(await restore(live.backup, recovered), 1);
    initialRecovered = await read(recovered, c => snapshot(c, recovered));
    const { inventory, capacity, backup } = initialRecovered;
    assert.equal(inventory.quota.commands, 0);
    assert.equal(inventory.rows[0].originMode, "recovered");
    assert.equal(inventory.rows[0].proof, null);
    assert.equal(inventory.rows[0].originalReceipt, null);
    assert.equal(inventory.rows[0].terminalReceipt, null);
    assert.equal(inventory.rows[0].history.disposition, null);
    assert.deepEqual(backup.resourceReservations.histories, live.backup.resourceReservations.histories);
    assert.equal(backup.resourceReservations.sourceOrgId, recovered);
    assert.equal(projection.categories.os_resource_reservations.rawBytes, inventory.quota.bytes);
    assert.deepEqual(projection.categories.os_resource_reservation_commands, { count: 0, bytes: 0, rawBytes: 0 });
    assert.ok(projection.categories.os_resource_reservations.bytes >=
      inventory.quota.bytes + capacity.resourceReservations.retainedGrowthBytes);
    assert.ok(projection.resourceReservations.projectedNativeBytes >=
      bytes(backup.resourceReservations) + capacity.resourceReservations.nativeGrowthBytes);
    assert.equal(capacity.resourceReservations.pendingDispositions, 1);
    assert.equal(capacity.resourceReservations.pendingReleases, 0);
    await assert.rejects(write(recovered, c => restoreResourceReservations(c, recovered,
      restoredResourceReservations(live.backup, recovered))), { code: "restore_conflict" });
  });

  await check("A full-width disposition consumes prepaid space and survives another native restore", async () => {
    await write(recovered, async c => {
      const next = recordResourceRecoveryDisposition({
        row: initialRecovered.inventory.rows[0], orgId: recovered, actorId: actor,
        authority: authority(recovered), expectedRevision: 1, acceptedAtExact: actionStamp, reason,
      });
      await recordResourceReservationDisposition(c, recovered, next);
    });
    disposed = await read(recovered, c => snapshot(c, recovered));
    const before = initialRecovered.capacity.resourceReservations;
    assert.equal(disposed.inventory.quota.bytes - before.retainedBytes, before.retainedGrowthBytes);
    assert.equal(bytes(disposed.backup.resourceReservations) - before.nativeBytes, before.nativeGrowthBytes);
    assert.equal(disposed.capacity.resourceReservations.retainedGrowthBytes, 0);
    assert.equal(disposed.capacity.resourceReservations.nativeGrowthBytes, 0);
    assert.equal(disposed.backup.resourceReservations.histories[0].disposition.reason, reason);
    assert.equal(await restore(disposed.backup, secondHop), 1);
    const hop = await read(secondHop, c => snapshot(c, secondHop));
    assert.equal(hop.inventory.quota.commands, 0);
    assert.equal(hop.backup.resourceReservations.sourceOrgId, secondHop);
    assert.deepEqual(hop.backup.resourceReservations.histories, disposed.backup.resourceReservations.histories);
  });

  await check("A full-width Release consumes the exact reserve and retains its immutable receipt", async () => {
    const before = live.capacity.resourceReservations;
    await write(source, c => command(c, "release", { version: 1, reservationId: "first", reservationRevision: 1,
      reason, idempotencyKey: "capacity-release-test-01" }));
    const after = await read(source, c => snapshot(c, source));
    assert.equal(after.inventory.quota.commands, 2);
    assert.equal(after.inventory.rows[0].terminalReceipt.decision.reason, reason);
    assert.equal(after.inventory.quota.bytes - before.retainedBytes, before.retainedGrowthBytes);
    assert.equal(bytes(after.backup.resourceReservations) - before.nativeBytes, before.nativeGrowthBytes);
    assert.equal(after.capacity.resourceReservations.retainedGrowthBytes, 0);
    assert.equal(after.capacity.resourceReservations.nativeGrowthBytes, 0);
    assert.equal(after.capacity.usage, await read(source, c => logicalBackupBytes(c, source)));
    assert.equal(after.capacity.usage, live.capacity.requiredUsage);
    assert.equal(after.capacity.backupBytes, live.capacity.requiredBackupBytes);
  });
  return { count: cases.length, cases };
}
