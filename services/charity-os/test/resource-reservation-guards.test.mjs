import { reservationSchemaSql, legacyReservationLayout, currentReservationLayout, partialReservationLayout } from "./fixtures/resource-reservation-schema.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  guardResourceReservationWrite,
  resourceReservationDefiningData,
  resourceReservationHistoryPresent,
  RESOURCE_RESERVATION_GUARD_SQL as sql,
} from "../lib/resource-reservation-guards.mjs";

const orgId = "fictional_org";
const source = { integrationId: "fixture_csv", externalId: "room-a", checksum: "a".repeat(64) };
const asset = {
  id: "room_a", orgId, moduleId: "assets", status: "assigned", revision: 2, source,
  data: { title: "Room A", kind: "asset", programId: "program_a", assetCode: "R-A", locationCode: "North", quantity: 1 },
  approval: { revision: 2 },
};
const session = {
  id: "session_a", orgId, moduleId: "events", status: "scheduled", revision: 4,
  data: { title: "Session A", kind: "session", programId: "program_a", startAt: "2026-12-08T10:00:00-05:00",
    endAt: "2026-12-08T11:00:00-05:00", timeZone: "America/New_York", capacity: 40 },
  approval: { revision: 4 },
};
const projection = (record, more = {}) => ({
  org_id: orgId, id: record.id, module_id: record.moduleId, status: record.status,
  trashed: false, live_reserved: true, proof_matches: true,
  defining_data: resourceReservationDefiningData(record.moduleId, record.data),
  source: record.source ?? null, source_fits: true, ...more,
});
const fixture = (record, rows = [projection(record)]) => {
  const calls = [];
  return {
    calls,
    async query(text, args) {
      calls.push({ text, args });
      if (calls.length === 1) {
        assert.equal(text, sql.lock);
        assert.deepEqual(args, [orgId]);
        return { rows: [{}], rowCount: 1 };
      }
      if (calls.length === 2) {
        assert.equal(text, reservationSchemaSql.layout);
        return currentReservationLayout;
      }
      assert.equal(calls.length, 3);
      assert.equal(text, sql.projection);
      assert.deepEqual(args, [orgId, record.id]);
      return { rows, rowCount: rows.length };
    },
  };
};
const guarded = { status: 409, code: "resource_reservation_guard" };
const retained = { status: 409, code: "resource_reservation_source_retained" };
const guardState = { status: 409, code: "resource_reservation_guard_state" };

test("a safe Asset edit may invalidate approval while protecting its exact capacity-one source data", async () => {
  const c = fixture(asset);
  const next = { ...asset, data: { ...asset.data, title: "Room A setup", unitValue: "10.00" },
    revision: 3, status: "review", approval: null };
  await guardResourceReservationWrite(c, next);
  assert.equal(c.calls.length, 3);
  assert.deepEqual(resourceReservationDefiningData(next.moduleId, next.data), {
    kind: "asset", programId: "program_a", assetCode: "R-A", locationCode: "North", quantity: 1,
  });
  assert.equal(asset.approval.revision, 2);
});

test("a live held Asset rejects every capacity and identity change, including source provenance replacement", async () => {
  const changes = { kind: "stock", programId: null, assetCode: "R-B", locationCode: "South",
    quantity: null };
  for (const [key, value] of Object.entries(changes))
    await assert.rejects(guardResourceReservationWrite(fixture(asset), {
      ...asset, data: { ...asset.data, [key]: value },
    }), guarded);
  await assert.rejects(guardResourceReservationWrite(fixture(asset), {
    ...asset, source: { ...source, externalId: "room-b" },
  }), guarded);
  await assert.rejects(guardResourceReservationWrite(fixture(asset), {
    ...asset, source: { ...source, checksum: "b".repeat(64) },
  }), guarded);
});

test("a live Events interval is literal, while completion and participant-place edits remain separate", async () => {
  await guardResourceReservationWrite(fixture(session), {
    ...session, revision: 5, status: "completed", data: { ...session.data, capacity: 30 },
  });
  for (const [key, value] of Object.entries({
    kind: "registration", programId: "program_b", startAt: "2026-12-08T15:00:00Z",
    endAt: "2026-12-08T16:00:00Z", timeZone: "UTC",
  })) {
    await assert.rejects(guardResourceReservationWrite(fixture(session), {
      ...session, data: { ...session.data, [key]: value },
    }), guarded);
  }
  const retiredZone = { ...session, data: { ...session.data, timeZone: "Retired/Example" } };
  await guardResourceReservationWrite(fixture(retiredZone), { ...retiredZone, status: "review" });
});

test("delete, restore, cancel and disposal cannot release a live internal hold", async () => {
  await assert.rejects(guardResourceReservationWrite(fixture(asset), asset, { operation: "delete" }), retained);
  await assert.rejects(guardResourceReservationWrite(fixture(asset), asset, { operation: "restore" }), guarded);
  await assert.rejects(guardResourceReservationWrite(fixture(asset), { ...asset, status: "disposed" }), guarded);
  await assert.rejects(guardResourceReservationWrite(fixture(session), { ...session, status: "cancelled" }), guarded);
  await assert.rejects(guardResourceReservationWrite(fixture(session), {
    ...session, moduleId: "tasks", data: { kind: "task" },
  }, { participationCommand: true }), guarded);
});

test("released and recovered claims retain their typed source for export and recovery", async () => {
  for (const operation of ["save", "restore"])
    await guardResourceReservationWrite(fixture(asset, [projection(asset, { live_reserved: false })]),
      { ...asset, status: "disposed" }, { operation });
  for (const record of [asset, session]) {
    await assert.rejects(guardResourceReservationWrite(
      fixture(record, [projection(record, { live_reserved: false })]), record, { operation: "delete" },
    ), retained);
    await guardResourceReservationWrite(
      fixture(record, []), record, { operation: "delete" },
    );
  }
  assert.match(sql.projection, /WHERE h\.org_id=r\.org_id AND \(h\.asset_id=r\.id OR h\.occurrence_id=r\.id\)\) LIMIT 1$/);
  await guardResourceReservationWrite(fixture(asset, []), asset);
  assert.match(sql.projection, /h\.origin_mode='live' AND h\.state='reserved'/);
  assert.match(sql.projection, /h\.asset_id=r\.id OR h\.occurrence_id=r\.id/);
  assert.match(sql.projection, /LIMIT 1$/);
  assert.doesNotMatch(sql.projection, /receipt|history_core/);
});

test("malformed and mismatched bounded projections fail closed before generic writes", async () => {
  for (const row of [
    projection(asset, { org_id: "different_org" }),
    projection(asset, { proof_matches: false }),
    projection(asset, { trashed: true }),
    projection(asset, { status: null }),
    projection(asset, { source_fits: false }),
    projection(asset, { defining_data: null }),
    projection(asset, { unrequested_field: true }),
  ]) await assert.rejects(guardResourceReservationWrite(fixture(asset, [row]), asset), guardState);
  const duplicate = [projection(asset), projection(asset)];
  await assert.rejects(guardResourceReservationWrite(fixture(asset, duplicate), asset), guardState);
  let getterCalls = 0;
  const altered = { ...asset, data: { ...asset.data } };
  Object.defineProperty(altered.data, "quantity", { enumerable: true, get: () => { getterCalls++; return 1; } });
  await assert.rejects(guardResourceReservationWrite(fixture(asset), altered), guarded);
  assert.equal(getterCalls, 0);
});

test("full restore checks both retained families without loading private ledger bodies", async () => {
  const c = { query: async (text, params) => {
    if (text === reservationSchemaSql.layout) return currentReservationLayout;
    assert.equal(text, sql.destination);
    assert.deepEqual(params, [orgId]);
    return { rows: [{ occupied: true }], rowCount: 1 };
  } };
  assert.equal(await resourceReservationHistoryPresent(c, orgId), true);
  assert.match(sql.destination, /EXISTS\(SELECT 1 FROM os_resource_reservations/);
  assert.match(sql.destination, /EXISTS\(SELECT 1 FROM os_resource_reservation_commands/);
  await assert.rejects(resourceReservationHistoryPresent({
    query: async text => text === reservationSchemaSql.layout ? currentReservationLayout :
      { rows: [{ occupied: "false" }], rowCount: 1 },
  }, orgId), guardState);
});

test("legacy absence skips family SQL only after the source guard's tenant lock", async () => {
  const calls = [], c = { async query(text) {
    calls.push(text);
    if (text === sql.lock) return { rows: [{}], rowCount: 1 };
    assert.equal(text, reservationSchemaSql.layout);
    return legacyReservationLayout;
  } };
  await guardResourceReservationWrite(c, asset, { operation: "delete" });
  assert.deepEqual(calls, [sql.lock, reservationSchemaSql.layout]);
  assert.equal(await resourceReservationHistoryPresent(c, orgId), false);
  assert.equal(calls.at(-1), reservationSchemaSql.layout);
  await assert.rejects(resourceReservationHistoryPresent({ async query(text) {
    assert.equal(text, reservationSchemaSql.layout);
    return partialReservationLayout;
  } }, orgId), { status: 503, code: "resource_reservation_schema" });
});
