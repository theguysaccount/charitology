/** Strict fake-query/source tests. No PostgreSQL, current auth, transaction or capacity proof. */
import test from "node:test";
import assert from "node:assert/strict";
import CATALOG from "./fixtures/contact-schema-column-vectors-v1.json" with { type: "json" };
import { hash, stable } from "../lib/security.mjs";
import { validateRecord } from "../lib/modules.mjs";
import { currentContactReconciliationMember, readContactReconciliationContext } from "../lib/contact-reconciliation-context.mjs";
import { makeContactReconciliationReport, makeContactReconciliationReportRow } from "../lib/contact-reconciliation-report.mjs";
import { CONTACT_PREVIEW_KIND, makeContactReconciliationPreview, makeContactReconciliationReceipt } from "../lib/contact-reconciliation-preview.mjs";
import { CONTACT_COMMAND_SQL, acceptedContactReconciliationCommand as accepted, commitContactReconciliation as commit,
  inspectContactReconciliation as inspect, previewContactReconciliation as preview, previewContactReconciliationReversal as reversePreview } from "../lib/contact-reconciliation-commands.mjs";

const ORG = "fictional_org", USER = "fictional_user", NOW = "2026-11-08T12:00:00.123456Z", EXPIRES = "2026-11-08T12:30:00.123456Z";
const session = () => ({ user: { id: USER }, session: { id: "fictional_session" } });
const decision = () => ({ operation: "merge", survivorId: "left", fields: { title: "left", displayLabel: "unknown", email: "unknown" }, basis: "record-comparison", reason: "Fictional explicit comparison" });
const separated = () => ({ operation: "no-merge", assertion: "distinct-people", basis: "unknown", reason: "Fictional explicit separation" });
const record = id => ({ org_id: ORG, id, module_id: "contacts", data: validateRecord("contacts", { title: "Fictional " + id, kind: "person-reference", contactPreference: "permission-needed" }, { records: [] }),
  status: "draft", owner_id: USER, last_editor_id: USER, revision: 1, approval: null, snapshot: null, source: null, deleted_at: null, created_at: NOW, updated_at: NOW });
const request = (previewId = "fictional_preview", commandKey = "fictional_command_key") => ({ previewId, commandKey });
const pins = (q, actor = USER) => ({ command: hash({ method: "contact-reconciliation-command-v1", kind: "command", value: { org: ORG, actorId: actor, commandKey: q.commandKey } }),
  request: hash({ method: "contact-reconciliation-command-v1", kind: "request", value: q }) });
const call = (f, input) => ({ org: ORG, session: session(), input });
const refuses = (promise, code, status) => assert.rejects(promise, e => (!code || e.code === code) && (!status || e.status === status));
function fixture() {
  const f = { tables: { os_records: [record("left"), record("right")] }, calls: [], role: "owner", scopes: [], validSession: true, membershipCreated: NOW, memberRevision: 1, epoch: "0",
    previews: [], current: true, owners: [USER], stopAtClock: false, clockReached: false, mutationAttempts: 0, driftOnLock: null };
  const key = (t, r) => t === "os_participation_group_receipts" ? r.command_hash : t === "os_task_recurrence_occurrences" ? r.series_id + ":" + r.sequence : t === "os_participation_delivery_policies" ? r.org_id : String(r.id);
  const tableRows = t => t === "os_previews" ? f.previews : f.tables[t] ?? [];
  f.c = { async query(sql, params = []) {
    f.calls.push({ sql, params: structuredClone(params) });
    if (sql.startsWith("/*crm:session*/")) { assert(sql.includes('s."expiresAt">clock_timestamp()')); return { rows: f.validSession ? [{ session_id: params[0], user_id: params[1], current_user_id: params[1] }] : [] }; }
    if (sql.startsWith("/*crm:member*/")) return { rows: [{ user_id: USER, role: f.role, program_ids: f.scopes, revision: f.memberRevision, created_exact: f.membershipCreated }] };
    if (sql.startsWith("/*crm:guc*/")) return { rows: [{ org_id: ORG, user_id: USER }] };
    if (sql.startsWith("/*crm:epoch*/")) return { rows: [{ epoch: f.epoch }] };
    if (sql.startsWith("/*crm:catalog*/")) return { rows: Object.entries(CATALOG).map(([table_name, columns]) => ({ table_name, columns: [...columns] })) };
    if (sql.startsWith("/*crm:link-fks*/")) return { rows: [["os_orgs", ["org_id"], ["id"]], ["os_intake", ["org_id", "intake_id"], ["org_id", "id"]], ["os_publications", ["org_id", "publication_id"], ["org_id", "id"]]].map(([parent, child_columns, parent_columns]) => ({ parent, child_columns, parent_columns, validated: true, delete_type: "a", update_type: "a" })) };
    const count = /^\/\*crm:count:([a-z_]+)\*\//.exec(sql), page = /^\/\*crm:page:([a-z_]+)\*\//.exec(sql);
    if (count) { const all = tableRows(count[1]); return { rows: [{ n: String(all.length), bytes: String(all.reduce((n, r) => n + Buffer.byteLength(JSON.stringify(r)), 0)) }] }; }
    if (page) {
      const t = page[1], all = tableRows(t).map(row => ({ row, key: key(t, row) })).filter(x => params[1] === null || x.key > params[1]).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0).slice(0, params[2]);
      return { rows: all.map(({ row, key }) => ({ row_key: key, row_json: JSON.stringify(row), ...(t === "os_records" ? { created_exact: row.created_at, updated_exact: row.updated_at, deleted_exact: row.deleted_at } : t === "os_reports" ? { created_exact: row.created_at } : t === "os_previews" ? { preview_created_exact: row.created_at, preview_expires_exact: row.expires_at, preview_committed_exact: row.committed_at } : {}) })) };
    }
    if (sql.startsWith("/*crm:command:lookup*/")) {
      const found = f.previews.filter(r => r.org_id === params[0] && r.actor_id === params[1] && r.kind === params[2] && (r.id === params[3] || r.committed_at !== null && r.payload.commandSha256 === params[4])).sort((a, b) => a.id < b.id ? -1 : 1).slice(0, 3);
      return { rows: found.map(r => ({ row_json: JSON.stringify(r), current: f.current })) };
    }
    if (sql.startsWith("/*crm:report:detail*/")) return { rows: tableRows("os_reports").filter(r => r.org_id === params[0] && r.id === params[1]) };
    if (sql.startsWith("/*crm:command:original-receipt*/")) return { rows: f.previews.filter(r => r.org_id === params[0] && r.kind === params[1] && r.committed_at !== null && r.payload.result.reportId === params[2]).slice(0, 2).map(r => ({ row_json: JSON.stringify(r), current: false })) };
    if (sql.startsWith("/*crm:command:lock-pair*/")) {
      assert(sql.includes("to_jsonb(t)::text") && sql.endsWith("FOR UPDATE OF t"));
      const selected = tableRows("os_records").filter(r => params[1].includes(r.id)).map(r => structuredClone(r)); if (f.driftOnLock) f.driftOnLock(selected);
      return { rows: selected.map(row => ({ row_json: JSON.stringify(row), created_exact: row.created_at, updated_exact: row.updated_at, deleted_exact: row.deleted_at })) };
    }
    if (sql.startsWith("/*crm:command:owners*/")) return { rows: f.owners.filter(x => params[1].includes(x)).map(user_id => ({ user_id })) };
    if (sql.startsWith("/*crm:command:clock*/")) { f.clockReached = true; if (f.stopAtClock) throw Object.assign(new Error("Intentional test boundary before writes"), { code: "test_stop_at_clock" }); return { rows: [{ at_exact: NOW }] }; }
    if (sql === "SELECT pg_advisory_xact_lock(hashtextextended($1,0))") return { rows: [{}] };
    if (sql === "DELETE FROM os_previews WHERE org_id=$1 AND committed_at IS NULL AND expires_at<=now()") { f.mutationAttempts++; return { rows: [], rowCount: 0 }; }
    if (sql.startsWith("SELECT count(*) FILTER (WHERE committed_at IS NULL) AS pending_count,")) {
      const pending = f.previews.filter(r => r.committed_at === null), committed = f.previews.filter(r => r.committed_at !== null), bytes = a => a.reduce((n, r) => n + Buffer.byteLength(JSON.stringify(r.payload)), 0);
      return { rows: [{ pending_count: String(pending.length), pending_bytes: String(bytes(pending)), committed_count: String(committed.length), committed_bytes: String(bytes(committed)), candidate_bytes: String(Buffer.byteLength(params[1])) }] };
    }
    if (sql === "INSERT INTO os_previews(org_id,id,actor_id,kind,payload,checksum,base_revision,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '30 minutes')") {
      f.mutationAttempts++; f.previews.push({ org_id: params[0], id: params[1], actor_id: params[2], kind: params[3], payload: JSON.parse(params[4]), checksum: params[5], base_revision: params[6], expires_at: EXPIRES, created_at: NOW, committed_at: null }); return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("/*crm:command:preview-time*/")) return { rows: f.previews.filter(r => r.org_id === params[0] && r.id === params[1] && r.actor_id === params[2] && r.kind === params[3] && r.committed_at === null).map(r => ({ expires_exact: r.expires_at })) };
    if (/^(?:INSERT|UPDATE|DELETE)/.test(sql)) f.mutationAttempts++;
    throw new Error("Unknown fake SQL: " + sql.slice(0, 70));
  } };
  f.auth = () => currentContactReconciliationMember(f.c, { org: ORG, session: session() });
  f.context = () => readContactReconciliationContext(f.c, { org: ORG, session: session(), leftId: "left", rightId: "right" });
  f.clear = () => { f.calls.length = 0; };
  return f;
}
async function pending(f, chosen = decision()) {
  const context = await f.context(), payload = makeContactReconciliationPreview({ orgId: ORG, actorId: USER, reportId: "future_report", authority: context.authority,
    reviewedContextSha256: context.contextSha256, rowStamps: context.rowStamps, input: { ...context.plannerContext, decision: chosen } });
  const row = { org_id: ORG, id: "fictional_preview", actor_id: USER, kind: CONTACT_PREVIEW_KIND, payload, checksum: hash(payload), base_revision: payload.reviewedContextSha256,
    created_at: NOW, expires_at: EXPIRES, committed_at: null }; f.previews = [row]; f.clear(); return row;
}
async function retained(f, q = request(), actor = USER) {
  const context = await f.context(), report = makeContactReconciliationReport({ reportId: "accepted_report", recordedAtExact: NOW, input: { ...context.plannerContext, decision: decision() } });
  const p = pins(q, actor), authority = { ...context.authority, actorId: actor }, payload = makeContactReconciliationReceipt({ report, authority, keyHash: p.command, requestHash: p.request });
  const row = { org_id: ORG, id: q.previewId, actor_id: actor, kind: CONTACT_PREVIEW_KIND, payload, checksum: hash(payload), base_revision: "a".repeat(64), created_at: NOW, expires_at: EXPIRES, committed_at: NOW };
  f.previews = [row]; f.clear(); return { row, report };
}
async function mergedSource(f, actor = USER) {
  const context = await f.context(), report = makeContactReconciliationReport({ reportId: "original_report", recordedAtExact: NOW, input: { ...context.plannerContext, decision: decision() } });
  const command = request("original_preview", "original_command_key"), binding = pins(command, actor), auth = { ...context.authority, actorId: actor };
  const receipt = makeContactReconciliationReceipt({ report, authority: auth, keyHash: binding.command, requestHash: binding.request });
  f.tables.os_reports = [makeContactReconciliationReportRow({ orgId: ORG, id: report.reportId, actorId: actor, createdAtExact: NOW, payload: report })];
  for (const change of report.changes) { const row = f.tables.os_records.find(r => r.id === change.after.id); Object.assign(row, { data: change.after.data, status: change.after.status, revision: change.after.revision, deleted_at: change.after.deletedAt }); }
  f.previews = [{ org_id: ORG, id: command.previewId, actor_id: actor, kind: CONTACT_PREVIEW_KIND, payload: receipt, checksum: hash(receipt), base_revision: "a".repeat(64), created_at: NOW, expires_at: EXPIRES, committed_at: NOW }];
  f.clear(); return report;
}

test("exact accepted read Replay precedes expiry and all pair/catalog/dependency reads", async () => {
  const f = fixture(), { row } = await retained(f); f.current = false; f.tables.os_records = []; const result = await accepted(f.c, call(f, request()));
  assert.deepEqual(result, { ...row.payload.result, replayed: true }); assert.equal(f.calls.length, 5);
  assert(f.calls.every(x => !/crm:(?:catalog|count|page|command:clock|command:lock-pair)/.test(x.sql))); assert.equal(f.mutationAttempts, 0);
});
test("writer Replay holds member/session locks and returns without clock, mutations or source eligibility", async () => {
  const f = fixture(), { row } = await retained(f); f.current = false; f.tables.os_records[1].deleted_at = NOW;
  const result = await commit(f.c, call(f, request())); assert.deepEqual(result, { ...row.payload.result, replayed: true });
  assert(f.calls.find(x => x.sql.startsWith("/*crm:session*/")).sql.endsWith(" FOR SHARE OF s"));
  assert(f.calls.find(x => x.sql.startsWith("/*crm:member*/")).sql.endsWith(" FOR SHARE"));
  assert(f.calls.find(x => x.sql.startsWith("/*crm:command:lookup*/")).sql.endsWith(" FOR UPDATE OF t")); assert.equal(f.clockReached, false); assert.equal(f.mutationAttempts, 0);
  // Actual transaction classifier marker behavior remains the real database module's own test scope.
});
test("fresh session/member denial occurs before retained receipt lookup", async () => {
  for (const change of [f => f.validSession = false, f => f.role = "contributor", f => f.scopes = ["restricted"]]) {
    const f = fixture(); await retained(f); change(f); await refuses(accepted(f.c, call(f, request())), null, f.validSession ? 403 : 401);
    assert(!f.calls.some(x => x.sql.startsWith("/*crm:command:lookup*/")));
  }
});
test("accepted receipt requires current session, membership incarnation and restore epoch", async () => {
  for (const change of [f => f.memberRevision++, f => f.membershipCreated = "2026-11-08T12:00:00.123457Z", f => f.epoch = "1"]) {
    const f = fixture(); await retained(f); change(f); await refuses(accepted(f.c, call(f, request())), "contact_command_stale", 409); assert.equal(f.clockReached, false);
  }
  const f = fixture(); await retained(f); await refuses(accepted(f.c, { org: ORG, session: { user: { id: USER }, session: { id: "other_session" } }, input: request() }), "contact_command_stale", 409);
});
test("same command key or preview with any other exact request conflicts without replacement", async () => {
  const f = fixture(); await retained(f); await refuses(accepted(f.c, call(f, request("other_preview"))), "contact_command_conflict", 409);
  await refuses(accepted(f.c, call(f, request("fictional_preview", "different_key"))), "contact_command_conflict", 409);
  assert.equal(f.mutationAttempts, 0); assert.equal(f.clockReached, false);
});
test("duplicate/colliding rows and malformed SQL generic/domain checksums fail closed", async () => {
  const f = fixture(), { row } = await retained(f); f.previews.push({ ...structuredClone(row), id: "second_preview" }); await refuses(accepted(f.c, call(f, request())));
  const g = fixture(); await retained(g); g.previews[0].checksum = g.previews[0].payload.sha256; await refuses(accepted(g.c, call(g, request())), "contact_preview_row_checksum");
  assert.equal(f.mutationAttempts + g.mutationAttempts, 0);
});
test("pending accepted lookup returns null; expired commit refuses before dependencies/domain clock", async () => {
  const f = fixture(); await pending(f); assert.equal(await accepted(f.c, call(f, request())), null); f.clear(); f.current = false;
  await refuses(commit(f.c, call(f, request())), "contact_preview_expired", 409); assert(!f.calls.some(x => x.sql.startsWith("/*crm:catalog*/"))); assert.equal(f.clockReached, false);
});
test("pending old authority refuses before current context or writes", async () => {
  const f = fixture(); await pending(f); f.epoch = "2"; await refuses(commit(f.c, call(f, request())), "contact_command_stale", 409);
  assert(!f.calls.some(x => x.sql.startsWith("/*crm:catalog*/"))); assert.equal(f.mutationAttempts, 0);
});
test("self-preview bookkeeping changes census but unchanged meaningful context reaches actual clock boundary", async () => {
  const f = fixture(), p = await pending(f), context = await f.context(); assert.notEqual(context.contextSha256, p.payload.reviewedContextSha256); f.clear(); f.stopAtClock = true;
  await refuses(commit(f.c, call(f, request())), "test_stop_at_clock"); assert.equal(f.clockReached, true); assert.equal(f.mutationAttempts, 0);
  assert(f.calls.some(x => x.sql.startsWith("/*crm:command:lock-pair*/"))); assert(f.calls.some(x => x.sql.startsWith("/*crm:command:owners*/")));
});
test("meaningful row edits or raw locked-row owner drift refuse before the processing clock", async () => {
  const f = fixture(); await pending(f); f.tables.os_records[0].data.title = "Edited after review"; await refuses(commit(f.c, call(f, request())), "contact_command_stale", 409); assert.equal(f.clockReached, false);
  const g = fixture(); await pending(g); g.driftOnLock = records => records[0].owner_id = "different_retained_owner";
  await refuses(commit(g.c, call(g, request())), "contact_command_stale", 409); assert.equal(g.clockReached, false); assert.equal(g.mutationAttempts, 0);
});
test("actual writes require retained owner membership while no-merge can record separation after owner departure", async () => {
  const f = fixture(); await pending(f); f.owners = []; await refuses(commit(f.c, call(f, request())), "owner", 422); assert.equal(f.clockReached, false);
  const g = fixture(); g.tables.os_records[0].owner_id = "former_member"; await pending(g, separated()); g.owners = []; g.stopAtClock = true;
  await refuses(commit(g.c, call(g, request())), "test_stop_at_clock"); assert.equal(g.clockReached, true); assert(!g.calls.some(x => x.sql.startsWith("/*crm:command:owners*/")));
});
test("inspect uses actual complete source context and readonly fresh authority, not caller-supplied context", async () => {
  const f = fixture(), value = await inspect(f.c, call(f, { leftId: "left", rightId: "right" })); assert.deepEqual(Object.keys(value), ["context"]); assert.equal(value.context.plannerContext.pair[0].id, "left");
  assert(f.calls.every(x => !/FOR SHARE|FOR UPDATE/.test(x.sql))); assert.equal(f.mutationAttempts, 0);
  await refuses(inspect(f.c, call(f, { leftId: "left", rightId: "right", authority: {} })));
});
test("preview stale client census refuses before server IDs/store SQL or report clock", async () => {
  const f = fixture(); await refuses(preview(f.c, call(f, { leftId: "left", rightId: "right", contextSha256: "0".repeat(64), decision: decision() })), "contact_command_stale", 409);
  assert.equal(f.clockReached, false); assert.equal(f.mutationAttempts, 0); assert(f.calls.find(x => x.sql.startsWith("/*crm:session*/")).sql.endsWith(" FOR SHARE OF s"));
});
test("reverse preview requires a genuine original accepted receipt before inverse pair/context enumeration", async () => {
  const f = fixture(), context = await f.context(), original = makeContactReconciliationReport({ reportId: "original_report", recordedAtExact: NOW, input: { ...context.plannerContext, decision: decision() } });
  f.tables.os_reports = [makeContactReconciliationReportRow({ orgId: ORG, id: original.reportId, actorId: USER, createdAtExact: NOW, payload: original })]; f.clear();
  await refuses(reversePreview(f.c, call(f, { reportId: original.reportId })), "contact_command_stale", 409);
  assert(f.calls.some(x => x.sql.startsWith("/*crm:command:original-receipt*/"))); assert(!f.calls.some(x => x.sql.startsWith("/*crm:catalog*/"))); assert.equal(f.mutationAttempts, 0);
});
test("SQL mutation surfaces are exact conditional receipt/trash updates and full-row locking, not report upsert", () => {
  assert(CONTACT_COMMAND_SQL.receipt.includes("committed_at IS NULL AND expires_at>clock_timestamp() AND checksum=$7 AND payload=$8::jsonb"));
  assert(CONTACT_COMMAND_SQL.trash.includes("revision=$3 AND deleted_at IS NOT DISTINCT FROM $5::timestamptz"));
  assert(CONTACT_COMMAND_SQL.lockPair.includes("to_jsonb(t)::text") && CONTACT_COMMAND_SQL.lockPair.includes('ORDER BY t.id COLLATE "C" FOR UPDATE OF t'));
  assert(!Object.values(CONTACT_COMMAND_SQL).some(sql => /ON CONFLICT|BEGIN|COMMIT|ROLLBACK/.test(sql)));
});
test("normal stored preview exposes only explicit pending processing time and actual SQL expiry", async () => {
  const f = fixture(), context = await f.context(); f.clear(); const value = await preview(f.c, call(f, { leftId: "left", rightId: "right", contextSha256: context.contextSha256, decision: decision() }));
  assert.deepEqual(Object.keys(value).sort(), ["previewId", "expiresAt", "review", "processingTime"].sort()); assert.equal(value.expiresAt, EXPIRES); assert.equal(value.processingTime, "assigned-on-commit");
  assert.equal(value.review.reportId.length, 32); assert(!Object.hasOwn(value.review, "recordedAtExact")); assert(!Object.hasOwn(value.review, "reportSha256"));
  const stored = f.previews.find(r => r.id === value.previewId); assert.equal(stored.checksum, hash(value.review)); assert.equal(stored.base_revision, context.contextSha256); assert.equal(f.clockReached, false);
});
test("genuine original receipt permits only exact original report exclusion with real current trash", async () => {
  const f = fixture(), original = await mergedSource(f, "fictional_other_admin"), value = await reversePreview(f.c, call(f, { reportId: original.reportId }));
  assert.equal(value.review.operation, "reverse"); assert.equal(value.review.review.receiptPin.actorId, "fictional_other_admin");
  assert.equal(value.review.review.current.pair[1].deletedAt, NOW); assert.equal(value.review.rowStamps[1].deletedAtExact, NOW); assert.deepEqual(value.review.review.current.references, []);
  assert.equal(value.review.review.plan.originalChecksum, original.sha256); assert.equal(f.clockReached, false);
  f.clear(); f.stopAtClock = true; await refuses(commit(f.c, call(f, request(value.previewId, "inverse_command_key"))), "test_stop_at_clock");
  assert.equal(f.clockReached, true); assert.equal(f.mutationAttempts, 2); // Earlier preview DELETE/INSERT only; no commit writes reached.
});
test("another immutable report is never excluded by original ID proof, at preview or commit", async () => {
  const f = fixture(), original = await mergedSource(f), value = await reversePreview(f.c, call(f, { reportId: original.reportId }));
  const otherInput = structuredClone(original.review.input); otherInput.decision = separated();
  const other = makeContactReconciliationReport({ reportId: "other_report", recordedAtExact: NOW, input: otherInput });
  f.tables.os_reports.push(makeContactReconciliationReportRow({ orgId: ORG, id: other.reportId, actorId: USER, createdAtExact: NOW, payload: other })); f.clear();
  await refuses(reversePreview(f.c, call(f, { reportId: original.reportId })), "contact_report_stale", 409);
  await refuses(commit(f.c, call(f, request(value.previewId, "inverse_command_key"))), "contact_command_stale", 409); assert.equal(f.clockReached, false);
});
test("restored epoch and original receipt/report mismatch cannot authorize inverse context", async () => {
  const f = fixture(), original = await mergedSource(f); f.epoch = "1";
  await refuses(reversePreview(f.c, call(f, { reportId: original.reportId })), "contact_command_stale", 409); assert(!f.calls.some(x => x.sql.startsWith("/*crm:catalog*/")));
  const g = fixture(), r = await mergedSource(g), alternativeInput = structuredClone(r.review.input); alternativeInput.decision.fields.title = "right";
  const alternative = makeContactReconciliationReport({ reportId: r.reportId, recordedAtExact: NOW, input: alternativeInput }), old = g.previews[0].payload;
  g.previews[0].payload = makeContactReconciliationReceipt({ report: alternative, authority: old.authority, keyHash: old.commandSha256, requestHash: old.requestSha256 }); g.previews[0].checksum = hash(g.previews[0].payload);
  await refuses(reversePreview(g.c, call(g, { reportId: r.reportId })), "contact_command_stale", 409); assert(!g.calls.some(x => x.sql.startsWith("/*crm:catalog*/")));
});
