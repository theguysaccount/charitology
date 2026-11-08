import test from "node:test";
import assert from "node:assert/strict";
import { GROUP_LIMITS, ParticipationGroupError, projectGroupHistory } from "../lib/participation-group-model.mjs";
import { GROUP_STORE_CONTRACT, loadGroupInventory, getGroup, findGroupReceipt, insertDraftGroup, appendGroupDecision, insertRecoveredGroup, groupStateCount, groupQuota } from "../lib/participation-group-store.mjs";

// Strict fake SQL/driver behavior, NOT PostgreSQL execution, RLS or DDL proof.
const clone = v => structuredClone(v), SHA = "a".repeat(64), ORG = "org_1", GID = "group_1";
const stamp = n => "2026-11-08T12:00:" + String(n).padStart(2, "0") + ".123456Z";
function receipt(operation, revision = operation === "create" ? 1 : operation === "cancel" ? 3 : 2, selected = ["p01", "p02"], gid = GID) {
  const result = { groupId: gid, groupRevision: revision, state: operation === "create" ? "draft" : operation === "close" ? "closed" : "admitted" };
  if (operation === "create") Object.assign(result, { target: { targetId: "target_1", moduleId: "volunteers" }, rosterIds: ["p01", "p02"], coordinatorIntakeId: null });
  if (operation === "admit") Object.assign(result, { selectionMode: selected.length === 2 ? "all" : "subset", selected: selected.map(participationId => ({ participationId, action: "confirm", resultRevision: 5, state: "confirmed", frozenSha256: SHA, allocationHash: null, notificationQueued: true, auditRetained: true })), unselectedIds: ["p01", "p02"].filter(x => !selected.includes(x)), reasonHashes: [], auditRetained: true });
  if (operation === "cancel") Object.assign(result, { selected: selected.map(participationId => ({ participationId, resultRevision: 6, state: "cancelled", notificationQueued: false, auditRetained: false })), reasonSha256: SHA, auditRetained: false });
  if (operation === "close") Object.assign(result, { reasonSha256: SHA, auditRetained: false });
  return { version: 1, groupId: gid, operation, commandHash: String(revision).padStart(64, "0"), requestHash: SHA, authority: { actorSha256: SHA, sessionSha256: SHA, membershipSha256: SHA, memberCreatedAtExact: "2026-11-08T11:59:59.999999Z", restoreEpochSha256: SHA }, reviewSha256: ["create", "close"].includes(operation) ? null : SHA, acceptedAtExact: stamp(revision), result };
}
const rowReceipt = r => ({ org_id: ORG, command_hash: r.commandHash, group_id: r.groupId, receipt: clone(r) });
const refuses = fn => assert.rejects(fn, e => e instanceof ParticipationGroupError);
class FakeSql {
  constructor() { this.groups = []; this.receipts = []; this.calls = []; this.fakeBytes = null; this.casMiss = false; this.failReceipt = false; this.transform = null; }
  async query(sql, params) {
    assert(Array.isArray(params)); this.calls.push({ sql, params: clone(params) });
    const gs = this.groups.filter(x => x.org_id === params[0]), rs = this.receipts.filter(x => x.org_id === params[0]); let out;
    if (sql === "SELECT count(*)::int AS count FROM os_participation_groups WHERE org_id=$1") out = [{ count: gs.length }];
    else if (sql === "SELECT count(*)::int AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes FROM os_participation_groups t WHERE org_id=$1") out = [{ count: gs.length, bytes: String(this.fakeBytes?.groups ?? Buffer.byteLength(JSON.stringify(gs))) }];
    else if (sql === "SELECT count(*)::int AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes FROM os_participation_group_receipts t WHERE org_id=$1") out = [{ count: rs.length, bytes: String(this.fakeBytes?.receipts ?? Buffer.byteLength(JSON.stringify(rs))) }];
    else if (sql === "SELECT group_id,count(*)::int AS count FROM os_participation_group_receipts WHERE org_id=$1 GROUP BY group_id ORDER BY group_id LIMIT 101") {
      const counts = new Map(); for (const r of rs) counts.set(r.group_id, (counts.get(r.group_id) || 0) + 1);
      out = [...counts].sort().slice(0, 101).map(([group_id, count]) => ({ group_id, count }));
    } else if (sql.startsWith("SELECT org_id,id,origin_mode,module_id,live_target_id,roster_ids,coordinator_intake_id,state,revision,last_command_hash,history,to_char(created_at AT TIME ZONE 'UTC'")) {
      assert(sql.includes('HH24:MI:SS.US')); assert(sql.includes('AS created_at_exact') && sql.includes('AS updated_at_exact'));
      if (sql.endsWith(" WHERE org_id=$1 ORDER BY id LIMIT 101")) out = gs.slice().sort((a, b) => a.id.localeCompare(b.id)).slice(0, 101);
      else if (sql.endsWith(" WHERE org_id=$1 AND id=$2") || sql.endsWith(" WHERE org_id=$1 AND id=$2 FOR UPDATE")) out = gs.filter(x => x.id === params[1]);
      else throw Error("Unexpected fictional group select: " + sql);
    } else if (sql === "SELECT org_id,command_hash,group_id,receipt FROM os_participation_group_receipts WHERE org_id=$1 ORDER BY group_id,command_hash LIMIT 1201") out = rs.slice().sort((a, b) => (a.group_id + a.command_hash).localeCompare(b.group_id + b.command_hash)).slice(0, 1201);
    else if (sql === "SELECT org_id,command_hash,group_id,receipt FROM os_participation_group_receipts WHERE org_id=$1 AND group_id=$2 ORDER BY command_hash LIMIT 13") out = rs.filter(x => x.group_id === params[1]).sort((a, b) => a.command_hash.localeCompare(b.command_hash)).slice(0, 13);
    else if (sql === "SELECT org_id,command_hash,group_id,receipt FROM os_participation_group_receipts WHERE org_id=$1 AND command_hash=$2") out = rs.filter(x => x.command_hash === params[1]);
    else if (sql.startsWith("INSERT INTO os_participation_groups(org_id,id,origin_mode,module_id,live_target_id,roster_ids,coordinator_intake_id,state,revision,last_command_hash,history,created_at,updated_at) VALUES(")) {
      assert(!this.groups.some(x => x.org_id === params[0] && x.id === params[1]), "fictional unique group collision");
      if (sql.includes("'live'")) { assert.equal(params.length, 8); this.groups.push({ org_id: params[0], id: params[1], origin_mode: "live", module_id: params[2], live_target_id: params[3], roster_ids: JSON.parse(params[4]), coordinator_intake_id: params[5], state: "draft", revision: 1, last_command_hash: params[6], history: null, created_at_exact: params[7], updated_at_exact: params[7] }); }
      else { assert(sql.includes("'recovered'") && sql.includes("'archived'")); assert.equal(params.length, 5); this.groups.push({ org_id: params[0], id: params[1], origin_mode: "recovered", module_id: params[2], live_target_id: null, roster_ids: [], coordinator_intake_id: null, state: "archived", revision: 1, last_command_hash: null, history: JSON.parse(params[3]), created_at_exact: params[4], updated_at_exact: params[4] }); }
      return { rows: [], rowCount: 1 };
    } else if (sql === "INSERT INTO os_participation_group_receipts(org_id,command_hash,group_id,receipt) VALUES($1,$2,$3,$4::jsonb)") {
      if (this.failReceipt) throw Error("fixture receipt write failed");
      assert(!this.receipts.some(x => x.org_id === params[0] && x.command_hash === params[1]), "fictional unique command collision");
      this.receipts.push({ org_id: params[0], command_hash: params[1], group_id: params[2], receipt: JSON.parse(params[3]) }); return { rows: [], rowCount: 1 };
    } else if (sql === "UPDATE os_participation_groups SET state=$3,revision=$4,last_command_hash=$5,updated_at=$6::timestamptz WHERE org_id=$1 AND id=$2 AND origin_mode='live' AND revision=$7 AND last_command_hash=$8") {
      const r = gs.find(x => x.id === params[1] && x.origin_mode === "live" && x.revision === params[6] && x.last_command_hash === params[7]);
      if (!r || this.casMiss) return { rows: [], rowCount: 0 };
      Object.assign(r, { state: params[2], revision: params[3], last_command_hash: params[4], updated_at_exact: params[5] }); return { rows: [], rowCount: 1 };
    } else throw Error("Unhandled fictional group SQL: " + sql);
    const result = { rows: clone(out), rowCount: out.length }; return this.transform ? this.transform(result, sql) : result;
  }
  // Tests supply the OUTER transaction; production store never calls this.
  async outer(fn) { const before = clone({ groups: this.groups, receipts: this.receipts }); try { return await fn(this); } catch (e) { this.groups = before.groups; this.receipts = before.receipts; throw e; } }
}
const draft = async c => insertDraftGroup(c, ORG, { receipt: receipt("create") });
const admit = async c => appendGroupDecision(c, ORG, { expectedRevision: 1, receipt: receipt("admit") });

test("draft insertion retains supplied exact micros and circular-reference order on ONE client", async () => {
  const c = new FakeSql(), input = receipt("create"), before = clone(input), value = await insertDraftGroup(c, ORG, { receipt: input });
  assert.deepEqual(input, before); assert.equal(value.id, GID); assert.equal(value.state, "draft"); assert.equal(value.createdAtExact, stamp(1)); assert.equal(value.updatedAtExact, stamp(1));
  assert.deepEqual(value.rosterIds, ["p01", "p02"]); assert.equal(value.history.decisions.length, 1); assert.equal(value.receipts.length, 1);
  assert(c.calls[0].sql.startsWith("INSERT INTO os_participation_groups")); assert(c.calls[1].sql.startsWith("INSERT INTO os_participation_group_receipts"));
  assert(Object.isFrozen(value.history.decisions[0].result)); assert(c.calls.every(x => !/^(?:BEGIN|COMMIT|ROLLBACK|CREATE|ALTER|GRANT)/.test(x.sql)));
});

test("admission/cancellation append receipts before exact CAS and preserve original admission result", async () => {
  const c = new FakeSql(); await draft(c); const saved = await admit(c), original = clone(saved.receipts[1].result);
  const cancelled = await appendGroupDecision(c, ORG, { expectedRevision: 2, receipt: receipt("cancel", 3, ["p01"]) });
  assert.equal(cancelled.revision, 3); assert.equal(cancelled.state, "admitted"); assert.equal(cancelled.updatedAtExact, stamp(3)); assert.equal(cancelled.history.decisions.length, 3);
  assert.deepEqual((await findGroupReceipt(c, ORG, receipt("admit").commandHash)).result, original);
  const update = c.calls.find(x => x.sql.startsWith("UPDATE ")); assert(update.sql.includes("revision=$7 AND last_command_hash=$8"));
  assert.equal(update.params[6], 1); assert.equal(update.params[7], receipt("create").commandHash);
  assert(!update.sql.split(" WHERE ")[0].includes("roster_ids")); assert(!update.sql.split(" WHERE ")[0].includes("live_target_id"));
});

test("stale head, changed receipt group and no-op cancellation refuse before another write", async () => {
  const c = new FakeSql(); await draft(c); await admit(c); await appendGroupDecision(c, ORG, { expectedRevision: 2, receipt: receipt("cancel", 3, ["p01"]) });
  let writes = c.calls.filter(x => /^(INSERT|UPDATE)/.test(x.sql)).length;
  await refuses(() => appendGroupDecision(c, ORG, { expectedRevision: 2, receipt: receipt("cancel", 4, ["p02"]) }));
  await refuses(() => appendGroupDecision(c, ORG, { expectedRevision: 3, receipt: receipt("cancel", 4, ["p01"]) }));
  const wrong = receipt("cancel", 4, ["p02"]); wrong.result.groupId = "other"; await refuses(() => appendGroupDecision(c, ORG, { expectedRevision: 3, receipt: wrong }));
  assert.equal(c.calls.filter(x => /^(INSERT|UPDATE)/.test(x.sql)).length, writes); assert.equal(c.receipts.length, 3);
});

test("all container header/receipt/time inconsistencies refuse rather than expose a partial group", async () => {
  const original = new FakeSql(); await draft(original); await admit(original);
  for (const change of [c => c.groups[0].last_command_hash = SHA, c => c.groups[0].revision = 1, c => c.groups[0].state = "draft", c => c.groups[0].module_id = "events", c => c.groups[0].live_target_id = "other", c => c.groups[0].roster_ids.reverse(), c => c.groups[0].updated_at_exact = "2026-11-08T12:00:02.123457Z", c => c.groups[0].created_at_exact = "2026-11-08T12:00:01.123455Z", c => c.receipts.pop(), c => c.receipts[1].receipt.requestHash = [SHA]]) {
    const c = new FakeSql(); c.groups = clone(original.groups); c.receipts = clone(original.receipts); change(c); await refuses(() => getGroup(c, ORG, GID));
  }
});

test("unknown/foreign raw row fields and getter values are not admitted", async () => {
  const c = new FakeSql(); await draft(c);
  for (const change of [r => { r.rows[0].unexpected = 1; }, r => { r.rows[0].org_id = "foreign"; }, r => { Object.defineProperty(r.rows[0], "revision", { enumerable: true, get() { throw Error("must not read getter"); } }); }]) {
    c.transform = (r, sql) => { if (sql.includes("AS updated_at_exact")) change(r); return r; }; await refuses(() => getGroup(c, ORG, GID));
  }
  c.transform = null; c.receipts[0].org_id = "foreign"; await refuses(() => getGroup(c, ORG, GID));
});

test("recovered history is orphan-capable and has no live target/roster/receipt or Replay capability", async () => {
  const c = new FakeSql(), h = projectGroupHistory({ originOrgId: "original_org", receipts: [receipt("create"), receipt("admit")] });
  const value = await insertRecoveredGroup(c, ORG, { history: h, storedAtExact: stamp(20) });
  assert.equal(value.originMode, "recovered"); assert.equal(value.state, "archived"); assert.equal(value.revision, 1); assert.equal(value.liveTargetId, null); assert.deepEqual(value.rosterIds, []); assert.equal(value.lastCommandHash, null); assert.deepEqual(value.receipts, []); assert.deepEqual(value.history, h);
  assert.equal(value.createdAtExact, stamp(20)); assert.equal(h.createdAtExact, stamp(1)); assert.equal(await groupStateCount(c, ORG), 1); assert.equal(await findGroupReceipt(c, ORG, receipt("create").commandHash), null);
  const before = c.calls.length; await refuses(() => appendGroupDecision(c, ORG, { expectedRevision: 1, receipt: receipt("admit") })); assert(c.calls.slice(before).every(x => x.sql.startsWith("SELECT")));
});

test("archives with retained executable receipts or edited historical header refuse", async () => {
  const c = new FakeSql(), h = projectGroupHistory({ originOrgId: "original_org", receipts: [receipt("create")] }); await insertRecoveredGroup(c, ORG, { history: h, storedAtExact: stamp(20) });
  for (const change of [x => x.groups[0].last_command_hash = SHA, x => x.groups[0].live_target_id = "target_1", x => x.groups[0].roster_ids = ["p01"], x => x.groups[0].state = "draft", x => x.groups[0].revision = 2, x => x.groups[0].history.id = "other", x => x.receipts.push(rowReceipt(receipt("create")))]) {
    const x = new FakeSql(); x.groups = clone(c.groups); change(x); await refuses(() => getGroup(x, ORG, GID));
  }
});

test("load inventory includes live AND archived rows and refuses orphan/missing receipt fragments", async () => {
  const c = new FakeSql(); await draft(c); const h = projectGroupHistory({ originOrgId: "old_org", receipts: [receipt("create", 1, ["p01", "p02"], "archived_2")] }); await insertRecoveredGroup(c, ORG, { history: h, storedAtExact: stamp(20) });
  const inv = await loadGroupInventory(c, ORG); assert.equal(inv.groups.length, 2); assert.equal(inv.quota.groups, 2); assert.equal(inv.quota.receipts, 1);
  c.receipts[0].group_id = "missing_group"; c.receipts[0].receipt.groupId = "missing_group"; c.receipts[0].receipt.result.groupId = "missing_group"; await refuses(() => loadGroupInventory(c, ORG));
});

test("SQL quotas measure BOTH full composites; independent bounds remain enforced", async () => {
  const c = new FakeSql(); await draft(c); c.fakeBytes = { groups: GROUP_LIMITS.familyBytes - 1, receipts: 1 };
  assert.equal((await groupQuota(c, ORG)).bytes, GROUP_LIMITS.familyBytes);
  c.fakeBytes.receipts = 2; await assert.rejects(() => groupQuota(c, ORG), e => e.code === "participation_group_quota");
  assert.equal(c.calls.filter(x => x.sql.includes("sum(octet_length(to_jsonb(t)::text))")).length > 0, true);
  const receipts = new FakeSql(); receipts.groups = clone(c.groups); receipts.receipts = Array.from({ length: 13 }, (_, i) => ({ ...rowReceipt(receipt("create")), command_hash: String(i + 1).padStart(64, "0") })); await assert.rejects(() => groupQuota(receipts, ORG), e => e.code === "participation_group_quota");
  const groups = new FakeSql(); groups.groups = Array.from({ length: 101 }, (_, i) => ({ ...clone(c.groups[0]), id: "g" + i })); await assert.rejects(() => groupQuota(groups, ORG), e => e.code === "participation_group_quota");
});

test("malformed SQL counters, unsafe sums and missing actual aggregate rows refuse", async () => {
  for (const value of ["1e2", "-1", " 1", true, "9007199254740992", 1.5]) {
    const c = new FakeSql(); c.transform = (r, sql) => { if (sql.startsWith("SELECT count(*)::int AS count,")) r.rows[0].bytes = value; return r; }; await refuses(() => groupQuota(c, ORG));
  }
  const c = new FakeSql(); c.transform = () => ({ rows: [], rowCount: 0 }); await refuses(() => groupQuota(c, ORG));
});

test("store validates input before writes and never accepts caller flags, dates or clocks", async () => {
  const c = new FakeSql(); await refuses(() => insertDraftGroup(c, ORG, { receipt: receipt("admit") })); await refuses(() => insertDraftGroup(c, "not/a/tenant", { receipt: receipt("create") }));
  await refuses(() => insertDraftGroup(c, ORG, { receipt: receipt("create"), skipValidation: true })); assert.equal(c.calls.length, 0);
  const old = Date.now; Date.now = () => { throw Error("Store minted a clock"); };
  try { await draft(c); } finally { Date.now = old; }
  await refuses(() => getGroup(c, ORG, GID, { forUpdate: "true" })); await refuses(() => getGroup(c, ORG, GID, { forUpdate: true, bypassRls: true }));
});

test("SQL error or CAS failure requires and is preserved by the caller's outer rollback", async () => {
  const c = new FakeSql(); c.failReceipt = true;
  await assert.rejects(() => c.outer(client => draft(client)), /fixture receipt write failed/); assert.deepEqual(c.groups, []); assert.deepEqual(c.receipts, []);
  c.failReceipt = false; await draft(c); const before = clone({ groups: c.groups, receipts: c.receipts }); c.casMiss = true;
  await refuses(() => c.outer(client => admit(client))); assert.deepEqual({ groups: c.groups, receipts: c.receipts }, before);
  assert(c.calls.every(x => !/^(BEGIN|COMMIT|ROLLBACK)/.test(x.sql)));
});

test("missing group/key returns null, but an unrelated lookup row cannot masquerade as a receipt", async () => {
  const c = new FakeSql(); assert.equal(await getGroup(c, ORG, GID), null); assert.equal(await findGroupReceipt(c, ORG, SHA), null);
  await draft(c); c.transform = (r, sql) => { if (sql.includes("AND command_hash=$2")) return { rows: clone(c.receipts), rowCount: 1 }; return r; }; await refuses(() => findGroupReceipt(c, ORG, SHA));
});

test("closed draft cannot accept later group admission and13-row partial histories never load", async () => {
  const c = new FakeSql(); await draft(c); await appendGroupDecision(c, ORG, { expectedRevision: 1, receipt: receipt("close") }); await refuses(() => appendGroupDecision(c, ORG, { expectedRevision: 2, receipt: receipt("admit") }));
  c.receipts = Array.from({ length: 13 }, (_, i) => ({ ...rowReceipt(receipt("create")), command_hash: String(i + 1).padStart(64, "0") })); await refuses(() => getGroup(c, ORG, GID));
});

test("candidate contract explicitly leaves real SQL, RLS, DDL, live authority and exit reserves unproven", () => {
  assert.equal(GROUP_STORE_CONTRACT.candidateOnly, true); assert.equal(GROUP_STORE_CONTRACT.integrated, false); assert.equal(GROUP_STORE_CONTRACT.ddlExecuted, false);
  assert.match(GROUP_STORE_CONTRACT.caller, /roll back on ANY error/); assert.match(GROUP_STORE_CONTRACT.quota, /No measured maximum/);
});
