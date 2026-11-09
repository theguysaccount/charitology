import { reservationSchemaSql, legacyReservationLayout, currentReservationLayout, partialReservationLayout } from "./fixtures/resource-reservation-schema.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createHandler } from "../lib/handler.mjs";
import { admitResourceReservationWorkspace, audit, database, saveRecord } from "../lib/database.mjs";
import { RESOURCE_RESERVATION_GUARD_SQL as guardSql } from "../lib/resource-reservation-guards.mjs";
import { csrf, hash } from "../lib/security.mjs";

const org = "fixture_org", actor = "fixture_admin", sessionId = "fixture_session";
const orgPath = "/api/orgs/" + org;
const exact = "2029-08-31T09:22:00.123456Z";
const secret = "synthetic-resource-reservation-integration-key";
const origin = "https://os.example.test";
const session = { user: { id: actor }, session: { id: sessionId } };
const data = { kind: "asset", title: "Fixture room", programId: null, assetCode: "A", locationCode: null, quantity: 1 };
const asset = {
  id: "fixture_asset", org_id: org, module_id: "assets", data,
  status: "assigned", revision: 3, owner_id: actor, last_editor_id: "fixture_editor",
  approval: null, snapshot: null, source: null, created_at: new Date(exact), updated_at: new Date(exact),
};
const guardRow = {
  org_id: org, id: asset.id, module_id: "assets", status: asset.status, trashed: false,
  live_reserved: false, proof_matches: true, source: null, source_fits: true,
  defining_data: { kind: "asset", programId: null, assetCode: "A", locationCode: null, quantity: 1 },
};
const rows = (...values) => ({ rows: values, rowCount: values.length });

function mountedFixture() {
  const state = { ready: true, layout: currentReservationLayout, loggedIn: true, role: "admin", programIds: [], includeAsset: true, calls: [], txs: [] };
  const c = {
    async query(sql) {
      state.calls.push(sql);
      if (sql === reservationSchemaSql.layout) return state.layout;
      if (sql === reservationSchemaSql.access) return rows({ ready: state.ready });
      if (sql.includes("AS current_user_id"))
        return rows({ session_id: sessionId, user_id: actor, current_user_id: actor });
      if (sql.includes("FROM os_members"))
        return rows({ user_id: actor, role: state.role, program_ids: state.programIds, revision: 1, created_exact: exact });
      if (sql.includes("FROM os_orgs o")) return rows({ created_exact: exact, restored_id: null });
      if (sql.startsWith("SELECT * FROM os_orgs"))
        return rows({ id: org, name: "Fixture organization", time_zone: "UTC" });
      if (sql.includes("WITH holds AS"))
        return rows({ reservation_count: "0", command_count: "0", reservation_bytes: "0", command_bytes: "0" });
      if (sql === guardSql.projection) return rows(guardRow);
      if (sql.includes("LEFT JOIN os_resource_reservation_commands") || sql.includes("CROSS JOIN LATERAL")) return rows();
      if (sql.includes("AS now_exact")) return rows({ now_exact: exact });
      if (sql.startsWith("SELECT * FROM os_records WHERE org_id=$1 AND deleted_at IS NULL")) return state.includeAsset ? rows(asset) : rows();
      if (sql.startsWith("SELECT * FROM os_previews WHERE org_id=$1")) return rows({ id: "preview", committed_at: null, base_revision: hash([]) });
      if (sql === "SELECT count(*) AS count FROM os_records WHERE org_id=$1") return rows({ count: "0" });
      if (sql === guardSql.destination) return rows({ occupied: true });
      if (sql === guardSql.lock) return rows({});
      throw new Error("Unrecognized fixture SQL");
    },
  };
  const db = {
    async tx(user, tenant, fn, options) {
      assert.equal(user, actor);
      assert.equal(tenant, org);
      state.txs.push(options);
      return fn(c);
    },
    async limit() {},
  };
  const handle = createHandler({
    settings: { origin, secret }, db,
    auth: { api: { getSession: async () => state.loggedIn ? session : null } },
    send: async () => { throw new Error("No provider in reservation integration fixtures"); },
  });
  const call = (tail, { method = "GET", body, token = csrf(sessionId, secret) } = {}) =>
    handle(new Request(new URL(orgPath + tail, origin), {
      method, headers: { origin, "content-type": "application/json", "x-csrf-token": token },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
  return { call, state };
}

test("the mounted reservation workspace uses fresh scope and private headers", async () => {
  const { call, state } = mountedFixture();
  const settings = await (await call("")).json();
  assert.deepEqual(settings.features, { resourceReservations: true });
  const workspace = await call("/resource-reservations/workspace");
  assert.equal(workspace.status, 200);
  assert.equal(workspace.headers.get("referrer-policy"), "no-referrer");
  assert.equal(workspace.headers.get("cache-control"), "no-store");
  const result = await workspace.json();
  assert.match(result.scopeSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(result, {
    ok: true, version: 1, orgId: org, scopeSha256: result.scopeSha256,
    assets: [], sessions: [], reservations: [],
  });
  assert.deepEqual(state.txs.at(-1), { lock: true, readOnly: true });
  state.ready = false;
  assert.equal(Object.hasOwn(await (await call("")).json(), "features"), false);
  state.programIds = ["limited"];
  const checks = state.calls.filter(sql => sql === reservationSchemaSql.layout).length;
  assert.equal(Object.hasOwn(await (await call("")).json(), "features"), false);
  assert.equal(state.calls.filter(sql => sql === reservationSchemaSql.layout).length, checks);
  assert.equal((await call("/resource-reservations/workspace")).status, 403);
  state.loggedIn = false;
  const denied = await call("/resource-reservations/workspace");
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get("referrer-policy"), "no-referrer");
  state.loggedIn = true;
  const csrfDenied = await call("/resource-reservations/review", { method: "POST", body: {}, token: "invalid" });
  assert.equal(csrfDenied.status, 403);
  assert.equal(csrfDenied.headers.get("referrer-policy"), "no-referrer");
});

test("ordinary Trash and native commit refuse retained resource source/history before writing", async () => {
  const { call, state } = mountedFixture();
  const trashed = await call("/modules/assets/records/" + asset.id, { method: "DELETE", body: { revision: asset.revision } });
  assert.equal(trashed.status, 409);
  assert.equal((await trashed.json()).code, "resource_reservation_source_retained");
  assert.ok(!state.calls.some(sql => sql.includes("UPDATE os_records SET deleted_at")));
  state.includeAsset = false;
  const restored = await call("/import/commit", { method: "POST", body: { previewId: "preview" } });
  assert.equal(restored.status, 409);
  assert.equal((await restored.json()).code, "restore_conflict");
  assert.ok(state.calls.includes(guardSql.destination));
  assert.ok(!state.calls.some(sql => sql.includes("UPDATE os_previews SET committed_at")));
});

test("the central save checks resource-defining data before any record upsert", async () => {
  const called = [];
  const client = {
    async query(sql) {
      called.push(sql);
      if (sql === guardSql.lock) return rows({});
      if (sql === reservationSchemaSql.layout) return currentReservationLayout;
      if (sql === guardSql.projection) return rows({ ...guardRow, live_reserved: true });
      throw new Error("A guarded write reached the upsert");
    },
  };
  await assert.rejects(saveRecord(client, {
    id: asset.id, orgId: org, moduleId: "assets", status: "assigned", source: null, data: { ...data, quantity: 2 },
  }, { participationCommand: true }), { status: 409, code: "resource_reservation_guard" });
  assert.deepEqual(called, [guardSql.lock, reservationSchemaSql.layout, guardSql.projection]);
});

test("the transaction measures Reserve and Release once through their existing ordinary and safety dispatch", async t => {
  const capacities = [], queries = [];
  t.mock.module("../lib/workspace-backup.mjs", {
    exports: { checkWorkspaceExportCapacity: async () => { capacities.push("ordinary"); } },
  });
  t.mock.module("../lib/resource-reservation-capacity.mjs", {
    exports: { checkResourceReservationSafetyCapacity: async () => { capacities.push("release-safety"); } },
  });
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql === reservationSchemaSql.layout) return currentReservationLayout;
      if (sql.includes('AS "resourceReservations"')) return rows({ resourceReservations: true });
      if (sql.startsWith("SELECT sum(size)")) return rows({ size: "0" });
      return rows();
    },
    release() {},
  };
  const Original = pg.Pool;
  pg.Pool = class { async connect() { return client; } };
  try {
    const db = database("postgres://fictional.invalid/resource-reservation");
    const evidence = (operation, mode, previous, next) => {
      const receipt = { commandHash: "a".repeat(64), requestHash: "b".repeat(64), decision: { orgId: org, operation, previous, next } };
      return { orgId: org, operation, mode, plan: { state: "ready", receipt },
        stored: { receipt, insertedId: next?.id ?? null, releasedId: previous?.id ?? null } };
    };
    const effect = { id: "fixture_hold" };
    assert.equal(await db.tx(actor, org, async c => {
      assert.equal(await audit(c, org, actor, "resource-reservation.reserved"), true);
      return admitResourceReservationWorkspace(c, evidence("reserve", "ordinary", null, effect));
    }, { lock: true }), true);
    assert.equal(await db.tx(actor, org, c =>
      admitResourceReservationWorkspace(c, evidence("release", "release-safety", effect, null)), { lock: true }), true);
    assert.deepEqual(capacities, ["ordinary", "release-safety"]);
    assert.equal(queries.filter(sql => sql.includes('AS "resourceReservations"')).length, 2);
    const logical = queries.find(sql => sql.startsWith("SELECT sum(size)"));
    for (const table of ["os_resource_reservations", "os_resource_reservation_commands"])
      assert.equal(logical.split("FROM " + table + " t").length, 2);
    await assert.rejects(db.tx(actor, org, c =>
      admitResourceReservationWorkspace(c, evidence("reserve", "ordinary", null, effect)), { lock: true }),
    { status: 503, code: "resource_reservation_admission" });
  } finally { pg.Pool = Original; }
});

test("legacy schema hides mounted reservations and partial schema refuses without a family data read", async () => {
  const { call, state } = mountedFixture();
  state.layout = legacyReservationLayout;
  assert.equal(Object.hasOwn(await (await call("")).json(), "features"), false);
  assert.equal((await call("/resource-reservations/workspace")).status, 503);
  state.layout = partialReservationLayout;
  const settings = await call("");
  assert.equal(settings.status, 503);
  assert.equal((await settings.json()).code, "resource_reservation_schema");
  assert.equal((await call("/resource-reservations/workspace")).status, 503);
  assert.equal(state.calls.some(sql => sql.includes("WITH holds AS") || sql === reservationSchemaSql.access), false);
});
