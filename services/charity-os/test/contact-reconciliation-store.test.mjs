import test from "node:test";
import assert from "node:assert/strict";
import { validateRecord } from "../lib/modules.mjs";
import { makeContactReconciliationReport, makeContactReconciliationReportRow, planRestoredContactReconciliationReportRow } from "../lib/contact-reconciliation-report.mjs";
import { appendContactReconciliationReport as append, listContactReconciliationReports as list,
  readContactReconciliationReport as read, restoreContactReconciliationReports as restore,
  CONTACT_REPORT_STORE_SQL as SQL } from "../lib/contact-reconciliation-store.mjs";

// Exact fake SELECT/INSERT adapter only. No pg package, SQL parser, auth or RLS.
const AT = "2026-11-08T09:10:11.123456Z", LATER = "2026-11-08T10:10:11.654321Z";
const MEMBER = { userId: "fictional_actor", role: "admin", programIds: [], revision: 2 };
const ORG = "fictional_origin", DEST = "fictional_destination";
const member = () => structuredClone(MEMBER);
function input() {
  const row = (id, title) => ({ id, orgId: ORG, moduleId: "contacts", revision: 1, status: "draft",
    data: validateRecord("contacts", { title, kind: "person-reference", contactPreference: "permission-needed", purpose: "Fictional only" }, { records: [] }),
    source: null, approval: null, snapshot: null, deletedAt: null });
  return { orgId: ORG, pair: [row("left", "Fictional left"), row("right", "Fictional right")], organizations: [], references: [],
    decision: { operation: "merge", survivorId: "left", fields: { title: "right", displayLabel: "unknown", email: "unknown" }, basis: "record-comparison", reason: "Fictional review" } };
}
function reportRow(id = "report_a") {
  const payload = makeContactReconciliationReport({ reportId: id, recordedAtExact: AT, input: input() });
  return makeContactReconciliationReportRow({ orgId: ORG, id, actorId: MEMBER.userId, createdAtExact: AT, payload });
}
const destination = () => ({ orgId: DEST, actorId: MEMBER.userId, createdAtExact: LATER });
const source = rows => ({ reports: rows });
function fake(initial = [], { failInsert = 0 } = {}) {
  const state = structuredClone(initial), calls = []; let inserts = 0;
  // pg/lib/result.js constructs a class instance, not a plain object. Only
  // relevant own descriptor values are mirrored; no driver is imported/run.
  class QueryResult { constructor(rows, rowCount) { Object.assign(this, { command: "SELECT", rowCount, oid: null, fields: [], rows }); } }
  const result = (rows, rowCount = rows.length) => new QueryResult(rows, rowCount);
  const c = { state, calls, async query(text, params) {
    calls.push({ text, params: structuredClone(params) });
    if (text === SQL.available) return result(state.filter(r => r.org_id === params[0] && r.id === params[1]).slice(0, 2).map(r => ({ org_id: r.org_id, id: r.id })));
    if (text === SQL.occupied) return result(state.filter(r => r.org_id === params[0] && r.payload?.format === "charitology-contact-reconciliation").slice(0, 1).map(r => ({ org_id: r.org_id, id: r.id })));
    if (text === SQL.list) return result(state.filter(r => r.org_id === params[0] && r.payload?.format === "charitology-contact-reconciliation" && (params[1] === null || r.id > params[1])).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).slice(0, params[2]));
    if (text === SQL.detail) return result(state.filter(r => r.org_id === params[0] && r.id === params[1] && r.payload?.format === "charitology-contact-reconciliation").slice(0, 2));
    if (text === SQL.insert) {
      if (++inserts === failInsert) { const e = Error("Fictional insert failure"); e.code = "ZCRM1"; throw e; }
      const [org_id, id, created_by, title, checksum, json, created_at] = params;
      assert(!state.some(r => r.org_id === org_id && r.id === id));
      state.push({ org_id, id, created_by, title, checksum, payload: JSON.parse(json), created_at }); return result([], 1);
    }
    throw Error("UNEXPECTED_FAKE_SQL");
  } }; return c;
}
const bad = (fn, code, status) => assert.rejects(fn, e => e.name === "ContactReconciliationReportError" && (!code || e.code === code) && (!status || e.status === status));

test("ordinary append uses exact immutable row parameters and no upsert/clock/audit", async () => {
  const c = fake(), row = reportRow(), saved = await append(c, { org: ORG, member: member(), row });
  assert.deepEqual(saved, row); assert(Object.isFrozen(saved.payload));
  assert.deepEqual(c.calls.map(x => x.text), [SQL.available, SQL.insert]);
  assert.deepEqual(c.calls[0].params, [ORG, row.id]);
  assert.deepEqual(c.calls[1].params, [ORG, row.id, MEMBER.userId, row.title, row.checksum, JSON.stringify(row.payload), AT]);
  assert.deepEqual(c.state, [structuredClone(row)]);
  assert(!/ON CONFLICT|UPDATE|DELETE|clock_timestamp|\bnow\(|BEGIN|COMMIT/i.test(SQL.insert));
});
test("ordinary append refuses historical cross-origin/time/actor rows before SQL", async () => {
  const row = reportRow();
  const restored = planRestoredContactReconciliationReportRow(row, destination()), c = fake();
  await bad(() => append(c, { org: DEST, member: member(), row: restored }), "contact_report_live_context");
  await bad(() => append(c, { org: ORG, member: member(), row: { ...row, created_at: LATER } }), "contact_report_live_context");
  await bad(() => append(c, { org: ORG, member: member(), row: { ...row, created_by: "other_actor" } }), "contact_report_actor");
  await bad(() => append(c, { org: ORG, member: member(), row: { ...row, created_at: "2026-11-08T09:10:11.123Z" } }), "contact_report_live_context");
  assert.equal(c.calls.length, 0);
});
test("all public store operations refuse nonadmin/scoped data before SQL or private body work", async () => {
  for (const m of [{ ...MEMBER, role: "program_lead" }, { ...MEMBER, role: "board_reader" }, { ...MEMBER, programIds: ["program"] }]) {
    const c = fake(); let hooks = 0; const payload = new Proxy({}, { ownKeys() { hooks++; throw Error("hook"); } });
    await bad(() => append(c, { org: ORG, member: m, row: payload }), "contact_report_role", 403);
    await bad(() => list(c, { org: ORG, member: m, after: null, limit: 20 }), "contact_report_role", 403);
    await bad(() => read(c, { org: ORG, member: m, id: "report" }), "contact_report_role", 403);
    await bad(() => restore(c, { org: ORG, member: m, backup: payload, createdAtExact: null }), "contact_report_role", 403);
    assert.equal(c.calls.length, 0); assert.equal(hooks, 0);
  }
});
test("unknown selector keys/proxies/getters are inert refusals", async () => {
  let hooks = 0; const c = fake(), v = { org: ORG, member: member(), after: null, limit: 20 };
  await bad(() => list(c, { ...v, override: true }));
  await bad(() => list(c, new Proxy(v, { ownKeys() { hooks++; throw Error("trap"); } })));
  const getter = { ...v }; Object.defineProperty(getter, "org", { enumerable: true, get() { hooks++; throw Error("getter"); } });
  await bad(() => list(c, getter)); assert.equal(hooks, 0); assert.equal(c.calls.length, 0);
});
test("collision with any legacy family stops append without update or overwrite", async () => {
  const row = reportRow(), existing = { org_id: ORG, id: row.id, payload: { legacy: true } }, c = fake([existing]);
  await bad(() => append(c, { org: ORG, member: member(), row }), "contact_report_collision", 409);
  assert.deepEqual(c.calls.map(x => x.text), [SQL.available]); assert.deepEqual(c.state, [existing]);
});
test("bad reserved version/method refuses append before collision lookup", async () => {
  for (const patch of [{ version: 2 }, { method: "unknown" }]) {
    const row = structuredClone(reportRow()); Object.assign(row.payload, patch); const c = fake();
    await bad(() => append(c, { org: ORG, member: member(), row })); assert.equal(c.calls.length, 0);
  }
});
test("list C cursor ordering/limit returns only operation-hash metadata and no total", async () => {
  const c = fake([reportRow("a"), reportRow("B"), reportRow("A"), reportRow("b")]);
  const first = await list(c, { org: ORG, member: member(), after: null, limit: 2 });
  assert.deepEqual(first.reports.map(r => r.id), ["A", "B"]); assert.equal(first.nextAfter, "B");
  assert.deepEqual(c.calls[0].params, [ORG, null, 3]);
  const second = await list(c, { org: ORG, member: member(), after: first.nextAfter, limit: 2 });
  assert.deepEqual(second.reports.map(r => r.id), ["a", "b"]); assert.equal(second.nextAfter, null);
  assert.deepEqual(Object.keys(first).sort(), ["nextAfter", "reports"]);
  for (const r of first.reports) { assert.deepEqual(Object.keys(r).sort(), ["id", "title", "checksum", "createdAt", "operation", "originOrgId", "recordedAtExact"].sort()); assert(!r.title.includes("Fictional")); }
  assert(Object.isFrozen(first.reports[0])); assert.match(SQL.list, /COLLATE "C"/);
  assert(!/COUNT\(|payload->.?version|payload->>.?method/i.test(SQL.list));
});
test("invalid reserved row including lookahead version fails whole page, never skipped", async () => {
  const good = reportRow("A"), invalid = structuredClone(reportRow("B")); invalid.payload.version = 2;
  const c = fake([good, invalid]); await bad(() => list(c, { org: ORG, member: member(), after: null, limit: 1 }));
  assert.deepEqual(c.calls[0].params, [ORG, null, 2]); assert.match(SQL.list, /payload->>'format'/);
});
test("list rejects zero/over20 limits and unsafe cursor without queries", async () => {
  const c = fake();
  for (const limit of [0, 21, 1.5]) await bad(() => list(c, { org: ORG, member: member(), after: null, limit }));
  for (const after of ["a' OR true", "", 1]) await bad(() => list(c, { org: ORG, member: member(), after, limit: 20 }));
  assert.equal(c.calls.length, 0);
});
test("detail reads exact historical payload even orphaned/current-data changed", async () => {
  const row = planRestoredContactReconciliationReportRow(reportRow(), destination()), c = fake([row]);
  const r = await read(c, { org: DEST, member: member(), id: row.id });
  assert.deepEqual(r.payload, row.payload); assert.equal(r.originOrgId, ORG); assert.equal(r.createdAt, LATER);
  assert.deepEqual(c.calls.map(x => x.params), [[DEST, row.id]]); assert(!/os_records|user|session/i.test(SQL.detail));
});
test("detail foreign/missing and malformed reserved rows refuse without private result", async () => {
  const row = reportRow(), c = fake([row]);
  await bad(() => read(c, { org: DEST, member: member(), id: row.id }), "contact_report_unavailable", 404);
  await bad(() => read(c, { org: ORG, member: member(), id: "missing" }), "contact_report_unavailable", 404);
  const malformed = structuredClone(row); malformed.payload.method = "unknown";
  await bad(() => read(fake([malformed]), { org: ORG, member: member(), id: row.id }));
});
test("SQL driver rows are checked for tenant/order/duplicates and sparse/getter shapes", async () => {
  const row = reportRow();
  const direct = value => ({ query: async () => ({ rows: value }) });
  await bad(() => list(direct([row, row]), { org: ORG, member: member(), after: null, limit: 20 }));
  await bad(() => list(direct([reportRow("b"), reportRow("A")]), { org: ORG, member: member(), after: null, limit: 20 }));
  await bad(() => read(direct([{ ...row, org_id: DEST }]), { org: ORG, member: member(), id: row.id }), "contact_report_unavailable", 404);
  let hooks = 0; const sparse = Array(1); Object.defineProperty(sparse, "4294967295", { value: row, enumerable: true });
  await bad(() => list(direct(sparse), { org: ORG, member: member(), after: null, limit: 20 }));
  const getter = []; Object.defineProperty(getter, "0", { get() { hooks++; throw Error("getter"); }, enumerable: true });
  await bad(() => list(direct(getter), { org: ORG, member: member(), after: null, limit: 20 }));
  const result = {}; Object.defineProperty(result, "rows", { enumerable: true, get() { hooks++; throw Error("result getter"); } });
  await bad(() => list({ query: async () => result }, { org: ORG, member: member(), after: null, limit: 20 })); assert.equal(hooks, 0);
});
test("restore privately inserts only planned historical rows with fresh destination metadata", async () => {
  const original = [reportRow("A"), reportRow("B")], before = structuredClone(original), c = fake();
  const result = await restore(c, { org: DEST, member: member(), backup: source(original), createdAtExact: LATER });
  assert.deepEqual(result, { present: true, count: 2 }); assert.equal(c.state.length, 2);
  for (let i = 0; i < 2; i++) { const r = c.state[i]; assert.deepEqual(r.payload, original[i].payload); assert.equal(r.org_id, DEST); assert.equal(r.created_by, MEMBER.userId); assert.equal(r.created_at, LATER); assert.equal(r.checksum, original[i].checksum); }
  assert.deepEqual(original, before); assert.deepEqual(c.calls.slice(0, 3).map(x => x.text), [SQL.occupied, SQL.available, SQL.available]);
  assert(c.calls.findIndex(x => x.text === SQL.insert) > 2);
});
test("any occupied reserved destination blocks even CRM-free source or invalid-version history", async () => {
  const occupied = structuredClone(reportRow()); occupied.org_id = DEST; occupied.payload.version = 99;
  for (const backup of [{}, { reports: [] }]) {
    const c = fake([occupied]); await bad(() => restore(c, { org: DEST, member: member(), backup, createdAtExact: null }), "contact_report_occupied", 409);
    assert.deepEqual(c.calls.map(x => x.text), [SQL.occupied]);
    assert.equal(c.state.length, 1);
  }
  const c = fake([occupied]); await bad(() => restore(c, { org: DEST, member: member(), backup: source([reportRow()]), createdAtExact: LATER }), "contact_report_occupied", 409);
});
test("later legacy-ID collision is preflighted before first restored INSERT", async () => {
  const originals = [reportRow("A"), reportRow("B")], existing = { org_id: DEST, id: "B", payload: { legacy: true } }, c = fake([existing]);
  await bad(() => restore(c, { org: DEST, member: member(), backup: source(originals), createdAtExact: LATER }), "contact_report_collision", 409);
  assert.deepEqual(c.calls.map(x => x.text), [SQL.occupied, SQL.available, SQL.available]); assert.deepEqual(c.state, [existing]);
});
test("duplicate or invalid source history refuses before destination SQL", async () => {
  const row = reportRow();
  for (const reports of [[row, row], [{ ...row, checksum: "f".repeat(64) }], [{ ...row, payload: { ...row.payload, method: "unknown" } }]]) {
    const c = fake(); await bad(() => restore(c, { org: DEST, member: member(), backup: { reports }, createdAtExact: LATER })); assert.equal(c.calls.length, 0);
  }
});
test("absent/legacy source needs no new clock and returns old absence shape", async () => {
  for (const backup of [{}, { reports: [{ id: "legacy", payload: { old: true } }] }]) {
    const c = fake(); assert.deepEqual(await restore(c, { org: DEST, member: member(), backup, createdAtExact: null }), { present: false, count: 0 });
    assert.deepEqual(c.calls, [{ text: SQL.occupied, params: [DEST] }]); assert.equal(c.state.length, 0);
  }
});
test("driver failure is not retried; caller rollback is required after a later INSERT error", async () => {
  const c = fake([], { failInsert: 2 });
  await assert.rejects(() => restore(c, { org: DEST, member: member(), backup: source([reportRow("A"), reportRow("B")]), createdAtExact: LATER }), e => e.code === "ZCRM1");
  assert.equal(c.calls.filter(x => x.text === SQL.insert).length, 2); assert.equal(c.state.length, 1);
  assert(!c.calls.some(x => /BEGIN|COMMIT|ROLLBACK|SAVEPOINT/.test(x.text)));
  // This deliberately NOT-atomic fake result documents the outer-transaction
  // precondition, rather than relabeling a unit fixture as database rollback.
});
test("unreadable INSERT result fails; no audit/delivery/source mutation is invented", async () => {
  const calls = [], c = { query: async (text, params) => { calls.push([text, params]); return text === SQL.available ? { rows: [] } : { rowCount: 0 }; } };
  await bad(() => append(c, { org: ORG, member: member(), row: reportRow() }));
  assert.deepEqual(calls.map(x => x[0]), [SQL.available, SQL.insert]);
  assert(Object.values(SQL).every(s => !/os_events|outbox|os_members|UPDATE os_|DELETE FROM/.test(s)));
});
test("all query identifiers are fixed; report methods do not consult Date.now", async () => {
  const row = reportRow(), c = fake(), old = Date.now; Date.now = () => { throw Error("No domain clock here"); };
  try { await append(c, { org: ORG, member: member(), row }); await list(c, { org: ORG, member: member(), after: null, limit: 20 }); await read(c, { org: ORG, member: member(), id: row.id }); }
  finally { Date.now = old; }
  assert(c.calls.every(x => Object.values(SQL).includes(x.text))); assert(c.calls.every(x => x.params[0] === ORG));
});
