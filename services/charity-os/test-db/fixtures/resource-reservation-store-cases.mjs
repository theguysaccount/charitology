/** Explicitly owned database fixture. This module opens no connections. */
import assert from "node:assert/strict";
import {
  makeResourceReservationAuthority,
  makeResourceReservationsBackup,
  planResourceReservationWrite,
  reconcileResourceReservationReceipt,
  recordResourceRecoveryDisposition,
  restoreResourceReservationRows,
} from "../../lib/resource-reservation-ledger.mjs";
import {
  applyResourceReservationPlan,
  findResourceReservationReceipt,
  insertRecoveredResourceReservations,
  loadResourceReservationInventory,
  measureResourceReservationStorage,
  projectResourceReservationStorageRow,
  recordResourceReservationDisposition,
} from "../../lib/resource-reservation-store.mjs";

const room = "room";
const second = "equipment";
const session = "session";
const laterSession = "other-session";
const a = "resource-org-a";
const b = "resource-org-b";
const recovered = "resource-org-recovered";
const racing = "resource-org-racing";
const actorId = "fictional-admin";
const createdAtExact = "2000-01-01T00:00:00.000001Z";
const interval = { startAt: "2099-01-02T09:00:00Z", endAt: "2099-01-02T10:00:00Z", timeZone: "UTC" };
const sha = character => character.repeat(64);
const pin = (id, moduleId, kind) => ({
  id, moduleId, kind, revision: 3, createdAtExact, dataSha256: sha("a"), approvalSha256: sha("b"),
});
const proof = (orgId, assetId = room, occurrenceId = session) => ({
  version: 1, orgId, asset: pin(assetId, "assets", "asset"),
  session: pin(occurrenceId, "events", "session"), quantity: 1, interval,
});
const authority = orgId => makeResourceReservationAuthority({
  orgId, actorId, sessionId: "fictional-session", role: "admin", programIds: [],
  memberRevision: 1, memberCreatedAtExact: createdAtExact, restoreEpochSha256: sha("c"),
});
const review = key => ({
  version: 1, previewToken: "review." + "A".repeat(43), reviewSha256: sha("d"),
  acknowledge: true, idempotencyKey: key,
});
const reserveRequest = review("resource-first-key-01");
const replaceRequest = {
  ...review("resource-second-key-02"), reservationId: "first", reservationRevision: 1,
  reason: "Use the reviewed equipment.",
};
const references = [
  { id: room, moduleId: "assets" }, { id: second, moduleId: "assets" },
  { id: session, moduleId: "events" },
];

async function tx(client, org, run, readOnly = false) {
  await client.query("BEGIN");
  try {
    if (readOnly) await client.query("SET TRANSACTION READ ONLY");
    await client.query("SELECT set_config('app.org_id',$1,true),set_config('app.user_id',$2,true)", [org, actorId]);
    if (!readOnly && org)
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [org]);
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function propose(c, orgId, operation, request, newReservation) {
  const { rows } = await loadResourceReservationInventory(c, orgId);
  const { accepted_at } = (await c.query(
    "SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS accepted_at",
  )).rows[0];
  return planResourceReservationWrite({
    orgId, actorId, authority: authority(orgId), operation, request, newReservation,
    rows, acceptedAtExact: accepted_at,
  });
}

async function seedRecord(c, org, id, moduleId, data) {
  await c.query(`INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision,created_at,updated_at)
    VALUES($1,$2,$3,$4::jsonb,'approved',$5,$5,3,$6::timestamptz,$6::timestamptz)`,
    [org, id, moduleId, JSON.stringify(data), actorId, createdAtExact]);
}

async function seed(owner) {
  for (const org of [a,b,recovered,racing]) {
    await owner.query("INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,$1,$1,'USD','UTC')", [org]);
    await seedRecord(owner, org, room, "assets", { kind: "asset", quantity: 1 });
    await seedRecord(owner, org, second, "assets", { kind: "asset", quantity: 1 });
    await seedRecord(owner, org, session, "events", { kind: "session", ...interval });
    await seedRecord(owner, org, laterSession, "events", { kind: "session", ...interval });
  }
  await seedRecord(owner, b, "foreign-room", "assets", { kind: "asset", quantity: 1 });
}

async function rawHold(c, input) {
  const r = projectResourceReservationStorageRow(input);
  const values = Object.values(r).map(value => value !== null && typeof value === "object" ? JSON.stringify(value) : value);
  await c.query(`INSERT INTO os_resource_reservations(${Object.keys(r).join(",")})
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12::jsonb,$13::jsonb)`, values);
}

const rawCommand = (c, org, command) => c.query(
  "INSERT INTO os_resource_reservation_commands(org_id,command_hash,receipt) VALUES($1,$2,$3::jsonb)",
  [org, command.commandHash, JSON.stringify(command)],
);

const deferredRefusal = error => ["23503", "23514"].includes(error.code);

export async function runResourceReservationStoreCases({ owner, runtime, competitor, schema, role }) {
  assert.match(schema, /^[a-z][a-z0-9_]{0,62}$/);
  assert.match(role, /^[a-z][a-z0-9_]{0,62}$/);
  const cases = [];
  const check = async (label, run) => {
    try { await run(); cases.push(label); }
    catch (error) { throw new Error(label, { cause: error }); }
  };
  const read = (org = a) => tx(runtime, org, c => loadResourceReservationInventory(c, org), true);
  const tables = ["os_resource_reservation_commands", "os_resource_reservations"];
  await seed(owner);
  let reserve, replacement;

  await check("restricted role, exact grants and both forced tenant policies", async () => {
    const identity = (await runtime.query(`SELECT current_user AS role,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication
      FROM pg_roles WHERE rolname=current_user`)).rows[0];
    assert.deepEqual(identity, { role, rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false });
    const grant = await runtime.query(`SELECT table_name,privilege_type FROM information_schema.role_table_grants
      WHERE table_schema=$1 AND grantee=$2 AND table_name=ANY($3) ORDER BY table_name,privilege_type`, [schema, role, tables]);
    assert.deepEqual(grant.rows, tables.flatMap(table_name => ["INSERT", "SELECT"].map(privilege_type => ({ table_name, privilege_type }))));
    const columns = await runtime.query(`SELECT table_name,column_name FROM information_schema.column_privileges
      WHERE table_schema=$1 AND grantee=$2 AND table_name=ANY($3) AND privilege_type='UPDATE' ORDER BY column_name`, [schema, role, tables]);
    assert.deepEqual(columns.rows, ["disposition", "revision", "state", "terminal_command_hash"]
      .map(column_name => ({ table_name: "os_resource_reservations", column_name })));
    const rls = await owner.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
      EXISTS(SELECT 1 FROM aclexplode(c.relacl) WHERE grantee=0) AS public_grant
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=ANY($2)
      ORDER BY c.relname`, [schema, tables]);
    assert.deepEqual(rls.rows, tables.map(relname => ({ relname, relrowsecurity: true, relforcerowsecurity: true, public_grant: false })));
  });

  await check("Reserve commits one receipt, exact typed pins and actual SQL bytes", async () => {
    await tx(runtime, a, async c => {
      reserve = await propose(c, a, "reserve", reserveRequest, { id: "first", proof: proof(a) });
      const result = await applyResourceReservationPlan(c, a, reserve);
      assert.equal(result.insertedId, "first");
      assert.equal(result.releasedId, null);
      assert.deepEqual(result.receipt, reserve.receipt);
    });
    const actual = await read();
    assert.deepEqual(actual.rows, [reserve.insert]);
    const independent = (await owner.query(`SELECT
      (SELECT sum(octet_length(to_jsonb(t)::text))::int FROM os_resource_reservations t WHERE org_id=$1) AS holds,
      (SELECT sum(octet_length(to_jsonb(t)::text))::int FROM os_resource_reservation_commands t WHERE org_id=$1) AS commands`, [a])).rows[0];
    assert.deepEqual(actual.quota, { reservations: 1, commands: 1, reservationBytes: independent.holds,
      commandBytes: independent.commands, bytes: independent.holds + independent.commands });
    assert.ok(actual.quota.bytes > 0);
  });

  await check("RLS refuses cross-tenant reads and writes and guards foreign sources", async () => {
    assert.deepEqual((await tx(runtime, "", c => c.query("SELECT id FROM os_resource_reservations"), true)).rows, []);
    assert.deepEqual((await tx(runtime, b, c => c.query("SELECT command_hash FROM os_resource_reservation_commands"), true)).rows, []);
    assert.equal(await tx(runtime, b, c => findResourceReservationReceipt(c, a, reserve.receipt.commandHash), true), null);
    const cross = await tx(runtime, b, c => propose(c, b, "reserve", review("resource-cross-key-01"),
      { id: "cross", proof: proof(b) }), true);
    await assert.rejects(tx(runtime, a, c => applyResourceReservationPlan(c, b, cross)), { code: "42501" });
    await assert.rejects(tx(runtime, a, async c => {
      const foreign = await propose(c, a, "reserve", review("resource-foreign-key-1"),
        { id: "foreign", proof: proof(a, "foreign-room") });
      await applyResourceReservationPlan(c, a, foreign);
    }), { code: "23514" });
    assert.equal((await read(b)).quota.reservations, 0);
    assert.equal((await read()).quota.commands, 1);
  });

  await check("A stale successor insertion rolls back the earlier release and command", async () => {
    const before = await read();
    let attempted;
    await assert.rejects(tx(runtime, a, async c => {
      attempted = await propose(c, a, "replace", replaceRequest, { id: "second",
        proof: { ...proof(a, second), asset: { ...pin(second, "assets", "asset"), revision: 4 } } });
      assert.equal(attempted.state, "ready");
      await applyResourceReservationPlan(c, a, attempted);
    }), { code: "23514" });
    assert.deepEqual(await read(), before);
    assert.equal(await tx(runtime, a, c => findResourceReservationReceipt(c, a, attempted.receipt.commandHash), true), null);
  });

  await check("Deferred Replace without successor rolls back both retained effects", async () => {
    const before = await read();
    await assert.rejects(tx(runtime, a, async c => {
      const half = await propose(c, a, "replace", replaceRequest, { id: "second", proof: proof(a, second) });
      await rawCommand(c, a, half.receipt);
      assert.equal((await c.query(`UPDATE os_resource_reservations SET state='released',revision=2,terminal_command_hash=$3
        WHERE org_id=$1 AND id=$2`, [a, "first", half.receipt.commandHash])).rowCount, 1);
    }), deferredRefusal);
    assert.deepEqual(await read(), before);
  });

  await check("Complete replacement commits reciprocal links and one exact receipt", async () => {
    await tx(runtime, a, async c => {
      replacement = await propose(c, a, "replace", replaceRequest, { id: "second", proof: proof(a, second) });
      const result = await applyResourceReservationPlan(c, a, replacement);
      assert.equal(result.insertedId, "second");
      assert.equal(result.releasedId, "first");
    });
    const actual = await read();
    assert.deepEqual(actual.rows, [replacement.update, replacement.insert]);
    assert.equal(actual.quota.commands, 2);
    const saved = await tx(runtime, a, c => findResourceReservationReceipt(c, a, replacement.receipt.commandHash), true);
    assert.deepEqual(saved, replacement.receipt);
    assert.deepEqual(reconcileResourceReservationReceipt({
      orgId: a, actorId, operation: "replace", request: replaceRequest, authority: authority(a), receipt: saved,
    }), replacement.receipt.decision);
  });

  await check("Orphan receipt with a valid same-tenant foreign key still refuses at commit", async () => {
    const before = await read();
    const orphan = { ...reserve.receipt, commandHash: sha("f") };
    await assert.rejects(tx(runtime, a, c => rawCommand(c, a, orphan)), { code: "23514" });
    assert.deepEqual(await read(), before);
  });

  await check("Receipts and original proof are immutable and terminal states cannot reopen", async () => {
    const before = await read();
    await assert.rejects(tx(runtime, a, c => c.query("UPDATE os_resource_reservations SET proof=proof WHERE id='first'")), { code: "42501" });
    await assert.rejects(tx(runtime, a, c => c.query("DELETE FROM os_resource_reservation_commands")), { code: "42501" });
    await assert.rejects(tx(runtime, a, c => c.query("UPDATE os_resource_reservation_commands SET receipt=receipt")), { code: "42501" });
    await assert.rejects(tx(owner, a, c => c.query("UPDATE os_resource_reservation_commands SET receipt=receipt WHERE org_id=$1", [a])), { code: "P0001" });
    await assert.rejects(tx(owner, a, c => c.query("UPDATE os_resource_reservations SET proof_sha256=$1 WHERE id='first'", [sha("e")])), { code: "23514" });
    await assert.rejects(tx(runtime, a, c => c.query("UPDATE os_resource_reservations SET state='reserved',revision=1,terminal_command_hash=NULL WHERE id='first'")), { code: "23514" });
    assert.deepEqual(await read(), before);
  });

  await check("Recovered rows retain links and one disposition without command authority", async () => {
    const native = makeResourceReservationsBackup(a, (await read()).rows, references);
    const rows = restoreResourceReservationRows(recovered, native, a, references);
    await assert.rejects(tx(runtime, recovered, c => rawHold(c, rows[0])), { code: "23514" });
    assert.equal((await read(recovered)).rows.length, 0);
    await tx(runtime, recovered, c => insertRecoveredResourceReservations(c, recovered, rows));
    const kept = await read(recovered);
    assert.deepEqual(kept.rows, rows);
    assert.equal(kept.quota.commands, 0);
    const disposed = recordResourceRecoveryDisposition({
      row: rows[1], orgId: recovered, actorId, authority: authority(recovered), expectedRevision: 1,
      acceptedAtExact: "2098-01-02T09:00:00.000000Z", reason: "😀".repeat(150),
    });
    const dispositionVariants = [
      { ...disposed.history.disposition, reason: "😀".repeat(151) },
      { ...disposed.history.disposition, orgId: a },
    ];
    for (const invalid of dispositionVariants) {
      await assert.rejects(tx(runtime, recovered, c => c.query(`UPDATE os_resource_reservations SET
        state='released',revision=2,disposition=$1::jsonb WHERE id='second'`, [JSON.stringify(invalid)])), { code: "23514" });
    }
    await tx(runtime, recovered, c => recordResourceReservationDisposition(c, recovered, disposed));
    await assert.rejects(tx(runtime, recovered, c => recordResourceReservationDisposition(c, recovered, disposed)),
      { code: "resource_reservation_stale" });
    const after = await read(recovered);
    assert.equal(after.quota.commands, 0);
    assert.deepEqual(after.rows[1], disposed);
    assert.equal(after.rows[1].history.sourceState, "reserved");
  });

  await check("Two writers using the existing organization lock leave one overlapping hold", async () => {
    const tryReserve = (client, id, occurrence) => tx(client, racing, async c => {
      const candidate = await propose(c, racing, "reserve", review("concurrent-resource-" + id),
        { id, proof: proof(racing, room, occurrence) });
      if (candidate.state === "ready") await applyResourceReservationPlan(c, racing, candidate);
      return candidate.state;
    });
    const states = await Promise.all([tryReserve(runtime, "one", session), tryReserve(competitor, "two", laterSession)]);
    assert.deepEqual(states.sort(), ["conflict", "ready"]);
    const current = await read(racing);
    assert.equal(current.rows.length, 1);
    assert.equal(current.quota.commands, 1);
  });

  const final = {};
  for (const org of [a,b,recovered,racing]) {
    final[org] = await tx(runtime, org, c => measureResourceReservationStorage(c, org), true);
  }
  return Object.freeze({ cases, final });
}
