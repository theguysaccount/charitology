/** Strict fake-SQL units with real store/model/codec. No PostgreSQL evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { measureGroupCapacity, GROUP_CAPACITY_SQL as SQL, GROUP_CAPACITY_CONTRACT } from "../lib/participation-group-capacity.mjs";
import { GROUP_LIMITS as L, validateGroupReceipt, projectGroupHistory } from "../lib/participation-group-model.mjs";
import { makeParticipationGroupsBackup } from "../lib/participation-group-backup.mjs";

const ORG = "fixture_org", STAMP = "2026-11-08T10:00:00.000001Z", HASH = "a".repeat(64);
const clone = value => structuredClone(value);
const size = value => Buffer.byteLength(JSON.stringify(value)); // Fake driver return only, never claimed PG bytes.
const roster = count => Array.from({ length: count }, (_, index) => "person_" + String(index).padStart(2, "0"));
const schema = {
  os_participation_groups: { org_id: "text", id: "text", origin_mode: "text", module_id: "text", live_target_id: "text", roster_ids: "jsonb", coordinator_intake_id: "text", state: "text", revision: "integer", last_command_hash: "text", history: "jsonb", created_at: "timestamp with time zone", updated_at: "timestamp with time zone" },
  os_participation_group_receipts: { org_id: "text", command_hash: "text", group_id: "text", receipt: "jsonb" },
};
const schemaRows = () => Object.entries(schema).flatMap(([table_name, fields]) => Object.entries(fields).map(([column_name, type]) => ({ table_name, column_name, type })));
function receipt(groupId, operation, revision, people, selected = people) {
  const result = { groupId, groupRevision: revision, state: operation === "create" ? "draft" : operation === "close" ? "closed" : "admitted" };
  if (operation === "create") Object.assign(result, { target: { targetId: "target", moduleId: "volunteers" }, rosterIds: people, coordinatorIntakeId: null });
  if (operation === "admit") Object.assign(result, { selectionMode: selected.length === people.length ? "all" : "subset", selected: selected.map(participationId => ({ participationId, action: "confirm", resultRevision: 3, state: "confirmed", frozenSha256: HASH, allocationHash: null, notificationQueued: true, auditRetained: true })), unselectedIds: people.filter(id => !selected.includes(id)), reasonHashes: [], auditRetained: true });
  if (operation === "cancel") Object.assign(result, { selected: selected.map(participationId => ({ participationId, resultRevision: 4, state: "cancelled", notificationQueued: true, auditRetained: null })), reasonSha256: HASH, auditRetained: true });
  if (operation === "close") Object.assign(result, { reasonSha256: HASH, auditRetained: true });
  return validateGroupReceipt({ version: 1, groupId, operation, commandHash: createHash("sha256").update(groupId + ":" + revision).digest("hex"), requestHash: HASH,
    authority: { actorSha256: HASH, sessionSha256: HASH, membershipSha256: HASH, memberCreatedAtExact: STAMP, restoreEpochSha256: HASH }, reviewSha256: ["create", "close"].includes(operation) ? null : HASH, acceptedAtExact: STAMP, result });
}
function group(id, { count = 2, selected, cancellations = [], closed = false, recovered = false } = {}) {
  const people = roster(count), values = [receipt(id, "create", 1, people)];
  if (closed) values.push(receipt(id, "close", 2, people));
  else if (selected) {
    values.push(receipt(id, "admit", 2, people, selected));
    cancellations.forEach((ids, index) => values.push(receipt(id, "cancel", index + 3, people, ids)));
  }
  const history = projectGroupHistory({ originOrgId: recovered ? "old_org" : ORG, receipts: values }), last = values.at(-1);
  return {
    row: { org_id: ORG, id, origin_mode: recovered ? "recovered" : "live", module_id: "volunteers", live_target_id: recovered ? null : "target", roster_ids: recovered ? [] : people,
      coordinator_intake_id: null, state: recovered ? "archived" : last.result.state, revision: recovered ? 1 : values.length, last_command_hash: recovered ? null : last.commandHash,
      history: recovered ? history : null, created_at: STAMP, updated_at: STAMP },
    receipts: recovered ? [] : values.map(receipt => ({ org_id: ORG, command_hash: receipt.commandHash, group_id: id, receipt })),
    history,
  };
}
function fixture(groups = [], change = () => {}) {
  const calls = [], future = { headers: [], receipts: [] };
  const c = { async query(sql, args = []) {
    calls.push({ sql, args: clone(args) });
    assert(/^(SELECT|WITH)\b/.test(sql), "No writes or transaction/settings changes in this helper");
    let rows, phase;
    if (sql === SQL.schema) { rows = schemaRows(); phase = "schema"; }
    else if (sql === SQL.headers) { rows = groups.map(g => ({ id: g.row.id, row: clone(g.row), bytes: String(size(g.row)), created_at_exact: STAMP, updated_at_exact: STAMP })); phase = "headers"; }
    else if (sql === SQL.futureHeaders || sql === SQL.futureReceipts) {
      const values = JSON.parse(args[0]), header = sql === SQL.futureHeaders;
      future[header ? "headers" : "receipts"] = values;
      rows = values.map((value, index) => ({ position: index + 1, key: header ? value.id : value.command_hash, bytes: String(size(value)) }));
      phase = header ? "futureHeaders" : "futureReceipts";
    } else if (sql.includes("SELECT count(*)::int AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes FROM os_participation_groups"))
      rows = [{ count: groups.length, bytes: String(groups.reduce((n, g) => n + size(g.row), 0)) }];
    else if (sql.includes("SELECT count(*)::int AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes FROM os_participation_group_receipts"))
      rows = [{ count: groups.reduce((n, g) => n + g.receipts.length, 0), bytes: String(groups.reduce((n, g) => n + g.receipts.reduce((m, r) => m + size(r), 0), 0)) }];
    else if (sql.startsWith("SELECT group_id,count(*)::int AS count"))
      rows = groups.filter(g => g.receipts.length).map(g => ({ group_id: g.row.id, count: g.receipts.length }));
    else if (sql.startsWith("SELECT org_id,id,origin_mode"))
      rows = groups.map(g => { const { created_at, updated_at, ...r } = clone(g.row); return { ...r, created_at_exact: STAMP, updated_at_exact: STAMP }; });
    else if (sql.startsWith("SELECT org_id,command_hash,group_id,receipt")) rows = groups.flatMap(g => clone(g.receipts));
    else throw Error("Unexpected SQL in fake fixture");
    if (phase) { const replacement = change(rows, phase); if (replacement !== undefined) rows = replacement; }
    return { rows };
  } };
  return { c, groups, calls, future };
}
const refuses = (f, code) => assert.rejects(measureGroupCapacity(f.c, ORG), error =>
  error.status === 422 && (code === undefined || error.code === code));

test("empty installed family has no namespace or future cast; metrics are frozen", async () => {
  const f = fixture(), result = await measureGroupCapacity(f.c, ORG);
  assert.equal(result.groups, 0); assert.equal(result.actualRetainedBytes, 0); assert.equal(result.projectedRetainedBytes, 0);
  assert.equal(result.actualNativeBytes, 0); assert.equal(result.projectedNativeBytes, 0); assert.equal(result.futureReceiptCount, 0);
  assert(Object.isFrozen(result)); assert(!f.calls.some(call => [SQL.futureHeaders, SQL.futureReceipts].includes(call.sql)));
});

test("draft2 measures actual store inventory and complete future group/receipt composites", async () => {
  const g = group("group_a"), before = JSON.stringify(g), f = fixture([g]);
  const result = await measureGroupCapacity(f.c, ORG);
  assert.equal(result.retainedReceipts, 1); assert.equal(result.futureReceiptCount, 3); assert.equal(result.headerProjectionCount, 1);
  const delta = Math.max(0, size(f.future.headers[0]) - size(g.row)) + f.future.receipts.reduce((n, r) => n + size(r), 0);
  assert.equal(result.retainedGrowthBytes, delta); assert.equal(result.projectedRetainedBytes, result.actualRetainedBytes + delta);
  assert.equal(result.actualNativeBytes, size(makeParticipationGroupsBackup([g.history])));
  const projectedHistory = projectGroupHistory({ originOrgId: ORG, receipts: [...g.receipts.map(r => r.receipt), ...f.future.receipts.map(r => r.receipt)] });
  assert.equal(result.projectedNativeBytes, size(makeParticipationGroupsBackup([projectedHistory])));
  assert.equal(result.nativeGrowthBytes, result.projectedNativeBytes - result.actualNativeBytes);
  assert.equal(JSON.stringify(g), before); assert(!Object.isFrozen(g));
  assert.deepEqual(Object.keys(f.future.headers[0]).sort(), Object.keys(schema.os_participation_groups).sort());
  assert(f.future.receipts.every(r => Object.keys(r).sort().join() === "command_hash,group_id,org_id,receipt"));
});

test("draft10 ends at12; subset/batched cancellations never invent unselected or padding receipts", async () => {
  const a = group("group_a", { count: 10 }), b = group("group_b", { count: 5, selected: roster(5), cancellations: [["person_00", "person_01"], ["person_03"]] });
  const f = fixture([a, b]), result = await measureGroupCapacity(f.c, ORG);
  assert.equal(result.maxProjectedReceiptsPerGroup, 12); assert.equal(result.futureReceiptCount, 13);
  assert.equal(f.future.receipts.filter(r => r.group_id === "group_b").length, 2);
  const subset = fixture([group("group_c", { count: 3, selected: ["person_00"] })]);
  assert.equal((await measureGroupCapacity(subset.c, ORG)).futureReceiptCount, 1);
  assert.deepEqual(subset.future.receipts[0].receipt.result.selected.map(r => r.participationId), ["person_00"]);
});

test("closed and recovered groups retain original native history and have no future capability", async () => {
  const f = fixture([group("closed", { closed: true }), group("archive", { recovered: true, selected: roster(2) })]);
  const before = JSON.stringify(f.groups), result = await measureGroupCapacity(f.c, ORG);
  assert.equal(result.liveGroups, 1); assert.equal(result.recoveredGroups, 1); assert.equal(result.retainedReceipts, 2);
  assert.equal(result.futureReceiptCount, 0); assert.equal(result.retainedGrowthBytes, 0); assert.equal(result.nativeGrowthBytes, 0);
  assert.deepEqual(f.future, { headers: [], receipts: [] }); assert.equal(JSON.stringify(f.groups), before);
});

test("synthetic future receipt keys are unique for the actual org PK and skip retained collisions", async () => {
  const a = group("group_a"), b = group("group_b");
  a.receipts[0].command_hash = "f".repeat(56) + "00000000";
  a.receipts[0].receipt = { ...a.receipts[0].receipt, commandHash: a.receipts[0].command_hash };
  a.row.last_command_hash = a.receipts[0].command_hash;
  const f = fixture([b, a]), original = JSON.stringify(f.groups), result = await measureGroupCapacity(f.c, ORG);
  const hashes = [...a.receipts, ...b.receipts, ...f.future.receipts].map(r => r.command_hash);
  assert.equal(result.futureReceiptCount, 6); assert.equal(new Set(hashes).size, hashes.length);
  assert.equal(f.future.receipts[0].command_hash, "f".repeat(56) + "00000001");
  for (const header of f.future.headers) assert.equal(header.last_command_hash, f.future.receipts.filter(r => r.group_id === header.id).at(-1).command_hash);
  assert.equal(JSON.stringify(f.groups), original);
});

test("one hundred valid groups are processed individually beyond the whole-graph128KiB bound", async () => {
  const groups = Array.from({ length: 100 }, (_, index) => group("group_" + String(index).padStart(3, "0")));
  assert(size(groups) > L.modelBytes);
  const f = fixture(groups), result = await measureGroupCapacity(f.c, ORG);
  assert.equal(result.groups, 100); assert.equal(result.retainedReceipts, 100); assert.equal(result.futureReceiptCount, 300);
  assert.equal(f.future.headers.length, 100); assert.equal(f.future.receipts.length, 300);
  assert.equal(new Set(f.future.receipts.map(r => r.command_hash)).size, 300);
});

test("maximum-width group identity survives unchanged in actual and prospective rows", async () => {
  const f = fixture([group("g".repeat(100))]), before = JSON.stringify(f.groups);
  const result = await measureGroupCapacity(f.c, ORG);
  assert.equal(result.groups, 1); assert.equal(f.future.headers[0].id, "g".repeat(100));
  assert(f.future.receipts.every(r => r.group_id === "g".repeat(100)));
  assert.equal(JSON.stringify(f.groups), before);
});

test("missing/extra/duplicate columns and changed installed types fail closed", async () => {
  for (const change of [rows => rows.slice(1), rows => [...rows, rows[0]], rows => [rows[0], ...rows.slice(0, -1)], rows => rows.map((r, i) => i ? r : { ...r, type: "integer" })])
    await refuses(fixture([], (rows, phase) => phase === "schema" ? change(rows) : rows));
});

test("complete raw header identity/history/state/time and actual byte sums must match the store", async () => {
  for (const change of [r => { r[0].row.org_id = "foreign"; }, r => { r[0].row.state = "closed"; }, r => { r[0].row.extra = null; }, r => { r[0].created_at_exact = "2026-11-08T10:00:00.000002Z"; }, r => { r[0].bytes = String(Number(r[0].bytes) + 1); }, r => { r[0].row.roster_ids.reverse(); }])
    await refuses(fixture([group("group_a")], (rows, phase) => { if (phase === "headers") change(rows); }));
});

test("prospective row count/ordinal/key/byte measurements have no missing-row or numeric fallback", async () => {
  for (const phaseName of ["futureHeaders", "futureReceipts"])
    for (const change of [rows => rows.slice(1), rows => [...rows, rows[0]], rows => rows.map((r, i) => i ? r : { ...r, position: 2 }), rows => rows.map((r, i) => i ? r : { ...r, key: "wrong" }), rows => rows.map((r, i) => i ? r : { ...r, bytes: "-1" }), rows => rows.map((r, i) => i ? r : { ...r, bytes: "9007199254740992" }), rows => rows.map((r, i) => i ? r : { ...r, bytes: "1.5" }), rows => rows.map((r, i) => i ? r : { ...r, bytes: "0" })])
      await refuses(fixture([group("group_a")], (rows, phase) => phase === phaseName ? change(rows) : rows));
});

test("actual returned projected SQL over8MiB refuses independently of small real-codec namespace", async () => {
  const f = fixture([group("group_a")], (rows, phase) => phase === "futureReceipts" ? rows.map((r, i) => i ? r : { ...r, bytes: String(L.familyBytes) }) : rows);
  await refuses(f, "participation_group_capacity");
});

test("hostile prospective row accessors/proxies/sparse decorations are refused without invocation", async () => {
  let calls = 0;
  for (const variant of ["getter", "proxy", "sparse"]) {
    const f = fixture([group("group_a")], (rows, phase) => {
      if (phase !== "futureHeaders") return rows;
      if (variant === "getter") Object.defineProperty(rows[0], "bytes", { enumerable: true, get() { calls++; return "1"; } });
      if (variant === "proxy") rows[0] = new Proxy({}, { ownKeys() { calls++; throw Error("trap"); }, getPrototypeOf() { calls++; throw Error("trap"); } });
      if (variant === "sparse") { const sparse = Array(1); sparse["4294967295"] = rows[0]; return sparse; }
      return rows;
    });
    await refuses(f);
  }
  assert.equal(calls, 0);
});

test("raw driver failure propagates, no wall-clock/ID/settings/write or whole-workspace authority is added", async () => {
  const f = fixture([group("group_a")]), original = Date.now; Date.now = () => { throw Error("No wall clock allowed"); };
  try { await measureGroupCapacity(f.c, ORG); } finally { Date.now = original; }
  assert(f.calls.every(call => /^SELECT\b/.test(call.sql)));
  const failure = Error("Fictional driver failure");
  await assert.rejects(measureGroupCapacity({ query: async () => { throw failure; } }, ORG), error => error === failure);
  assert.equal(GROUP_CAPACITY_CONTRACT.integrated, false);
  assert(GROUP_CAPACITY_CONTRACT.notImplemented.includes("whole workspace composition"));
  let queries = 0;
  await assert.rejects(measureGroupCapacity({ query() { queries++; } }, { toString() { throw Error("No coercion"); } }));
  assert.equal(queries, 0);
});
