import test from "node:test";
import assert from "node:assert/strict";
import * as contextApi from "../lib/contact-reconciliation-context.mjs";
const { readContactReconciliationContext: read, currentContactReconciliationMember: currentMember } = contextApi;
import CATALOG from "./fixtures/contact-schema-column-vectors-v1.json" with { type: "json" };
import { planContactReconciliation } from "../lib/contact-reconciliation-model.mjs";
import { makeContactReconciliationReport, makeContactReconciliationReportRow, planContactReconciliationReversal } from "../lib/contact-reconciliation-report.mjs";
import { validateRecord, getModule } from "../lib/modules.mjs";
import { hash } from "../lib/security.mjs";
import { CONTACT_PREVIEW_KIND, makeContactReconciliationPreview, makeContactReconciliationReceipt } from "../lib/contact-reconciliation-preview.mjs";
import { inspectFieldAggregateFile, makeFieldMapping, compileFieldObservationDrafts } from "../lib/field-response-model.mjs";

// Strict fake SELECT rows only. This does not execute or parse PostgreSQL SQL,
// apply RLS/constraints, establish auth, or supply a real complete SQL snapshot.
const ORG = "fictional_org", USER = "fictional_owner", NOW = "2026-11-08T12:00:00.123456Z";
const session = () => ({ session: { id: "fictional_session" }, user: { id: USER } });
const raw = (id, moduleId, data, more = {}) => ({ org_id: ORG, id, module_id: moduleId, data, status: moduleId === "fundraising" ? "planned" : "draft", owner_id: USER, last_editor_id: USER, revision: 1, approval: null, snapshot: null, source: null, deleted_at: null, created_at: NOW, updated_at: NOW, ...more });
const contact = id => raw(id, "contacts", validateRecord("contacts", { title: "Fictional " + id, kind: "person-reference", contactPreference: "permission-needed", purpose: "Fictional coordination only" }, { records: [] }));
const decision = () => ({ operation: "merge", survivorId: "left", fields: { title: "left", email: "unknown", displayLabel: "unknown" }, basis: "record-comparison", reason: "Fictional duplicate drafts" });
const recordProjection = r => ({ id: r.id, orgId: r.org_id, moduleId: r.module_id, data: r.data, status: r.status, ownerId: r.owner_id, lastEditedBy: r.last_editor_id, revision: r.revision, approval: r.approval, snapshot: r.snapshot, source: r.source, createdAt: r.created_at.slice(0, 23) + "Z", updatedAt: r.updated_at.slice(0, 23) + "Z" });
function event(r, action = "record.created", more = {}) {
  const record = recordProjection(r); if (action === "record.created") delete record.source;
  return { org_id: ORG, id: "1", actor_id: USER, action, record_id: r.id, module_id: "contacts", detail: { record }, created_at: NOW, ...more };
}
const fkRows = () => [["os_orgs", ["org_id"], ["id"]], ["os_intake", ["org_id", "intake_id"], ["org_id", "id"]], ["os_publications", ["org_id", "publication_id"], ["org_id", "id"]]].map(([parent, child_columns, parent_columns]) => ({ parent, child_columns, parent_columns, validated: true, delete_type: "a", update_type: "a" }));
function fixture() {
  const state = { tables: { os_records: [contact("left"), contact("right")] }, calls: [], role: "owner", scopes: [], sessionValid: true,
    createdExact: NOW, revision: 1, epoch: "0", catalog: Object.entries(CATALOG).map(([table_name, columns]) => ({ table_name, columns: [...columns] })), fks: fkRows(), pageMutation: null, fakeCount: null, allowLocks: false };
  const projected = (table, row) => {
    const omitted = table === "os_files" ? ["bytes"] : table === "os_intake" ? ["answers", "idempotency_hash", "payload_hash", "receipt_hash", "ip_hash"] : table === "os_participation_outbox" ? ["payload", "consent_copy", "relay_key", "recipient_hash", "user_id", "link_id"] : [];
    if (table === "os_jobs") return { org_id: row.org_id, id: row.id, kind: row.kind, payload: row.kind === "reminder" ? row.payload : {} };
    return Object.fromEntries(Object.entries(row).filter(([k]) => !omitted.includes(k)));
  };
  const key = (table, row) => table === "os_task_recurrence_occurrences" ? row.series_id + ":" + row.sequence : table === "os_participation_group_receipts" ? row.command_hash : table === "os_participation_delivery_policies" ? row.org_id : String(row.id);
  const c = { async query(sql, params) {
    state.calls.push({ sql, params: structuredClone(params) });
    assert(!/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|COMMIT|FOR UPDATE)\b/i.test(sql));
    if (!state.allowLocks) assert(!/\bFOR SHARE\b/.test(sql));
    if (sql.startsWith("/*crm:session*/")) {
      assert(sql.includes('s."expiresAt">clock_timestamp()')); assert.deepEqual(params, ["fictional_session", USER]);
      return { rows: state.sessionValid ? [{ session_id: params[0], user_id: params[1], current_user_id: params[1] }] : [] };
    }
    if (sql.startsWith("/*crm:member*/")) { assert.deepEqual(params, [ORG, USER]); return { rows: [{ user_id: USER, role: state.role, program_ids: state.scopes, revision: state.revision, created_exact: state.createdExact }] }; }
    if (sql.startsWith("/*crm:guc*/")) return { rows: [{ org_id: ORG, user_id: USER }] };
    if (sql.startsWith("/*crm:epoch*/")) { assert.deepEqual(params, [ORG]); return { rows: [{ epoch: state.epoch }] }; }
    if (sql.startsWith("/*crm:catalog*/")) return { rows: structuredClone(state.catalog) };
    if (sql.startsWith("/*crm:link-fks*/")) return { rows: structuredClone(state.fks) };
    const m = /^\/\*crm:(count|page):(os_[a-z_]+)\*\//.exec(sql);
    if (!m) throw Error("Unexpected fictional SQL");
    const [, kind, table] = m; assert(Object.hasOwn(CATALOG, table)); assert(sql.includes("t.org_id=$1")); assert.equal(params[0], ORG);
    const data = (state.tables[table] ?? []).map(row => ({ row, row_key: key(table, row), row_json: JSON.stringify(projected(table, row)) })).sort((a, b) => a.row_key < b.row_key ? -1 : a.row_key > b.row_key ? 1 : 0);
    if (kind === "count") return { rows: [state.fakeCount?.(table) ?? { n: String(data.length), bytes: String(data.reduce((n, x) => n + Buffer.byteLength(x.row_json), 0)) }] };
    assert.equal(params[2], 32); assert(sql.includes('COLLATE "C"')); assert(sql.includes("LIMIT $3"));
    let output = data.filter(x => params[1] === null || x.row_key > params[1]).slice(0, params[2]).map(x => ({ row_key: x.row_key, row_json: x.row_json,
      ...(table === "os_records" ? { created_exact: x.row.created_at, updated_exact: x.row.updated_at, deleted_exact: x.row.deleted_at } : table === "os_reports" && sql.includes("AS created_exact") ? { created_exact: NOW } : table === "os_previews" ? { preview_created_exact: x.row.created_at, preview_expires_exact: x.row.expires_at, preview_committed_exact: x.row.committed_at } : {}) }));
    if (state.pageMutation) output = state.pageMutation(table, output);
    return { rows: output };
  } };
  state.read = () => read(c, { org: ORG, session: session(), leftId: "left", rightId: "right" });
  state.current = options => currentMember(c, { org: ORG, session: session() }, options);
  state.inverse = () => contextApi.readContactReconciliationInverseContext(c, { org: ORG, session: session(), leftId: "left", rightId: "right" });
  return state;
}
const mergePlan = context => planContactReconciliation({ ...context.plannerContext, decision: decision() });
const refuse = async (promise, code, status) => assert.rejects(promise, e => e.name === "ContactContextError" && (!code || e.code === code) && (!status || e.status === status));
const pledge = (contactId, id = "pledge") => raw(id, "fundraising", validateRecord("fundraising", { title: "Fictional pledge", kind: "pledge", contactId }, { records: [recordProjection(contact(contactId))], orgId: ORG, recordId: id }));
const publication = () => ({ org_id: ORG, id: "pub", record_id: "form", target_id: null, kind: "contact", schema: { title: "Fictional form" } });
const addForm = f => f.tables.os_records.push(raw("form", "forms", validateRecord("forms", { title: "Fictional form", kind: "form" }, { records: [] })));

test("current unscoped owner context exposes exact source classifications and data-only planner input", async () => {
  const f = fixture(), result = await f.read(); assert(mergePlan(result).proposal);
  assert.deepEqual(result.sourceOwnership, [{ id: "left", classification: "local-draft" }, { id: "right", classification: "local-draft" }]);
  assert.equal(result.authority.memberCreatedAtExact, NOW); assert.equal(result.coverage.catalogTables, 33);
  assert.equal(result.plannerContext.references.length, 0); assert(Object.isFrozen(result.plannerContext.pair[0].data));
  assert.equal(result.rowStamps[0].updatedAtExact, NOW); assert.equal(result.rowStamps[0].deletedAtExact, null);
});
test("expired session, scoped administrator and ordinary contributor refuse before private inventory", async () => {
  for (const change of [f => f.sessionValid = false, f => f.scopes = ["hidden_program"], f => f.role = "contributor"]) {
    const f = fixture(); change(f); await refuse(f.read(), null, f.sessionValid ? 403 : 401);
    assert(!f.calls.some(x => x.sql.startsWith("/*crm:count:")));
  }
});
test("session getter or proxy cannot run while selecting the actor", async () => {
  const f = fixture(); let calls = 0;
  const value = {}; Object.defineProperty(value, "id", { enumerable: true, get() { calls++; throw Error("not allowed"); } });
  const c = { query() { throw Error("must not reach SQL"); } };
  await refuse(read(c, { org: ORG, session: { session: value, user: { id: USER } }, leftId: "left", rightId: "right" }));
  const proxied = new Proxy({}, { getOwnPropertyDescriptor() { calls++; throw Error("not allowed"); } });
  await refuse(read(c, { org: ORG, session: proxied, leftId: "left", rightId: "right" })); assert.equal(calls, 0); assert.equal(f.calls.length, 0);
});
test("unclassified table/column or unvalidated missing/cascading own-link FK refuses", async () => {
  for (const change of [f => f.catalog.push({ table_name: "os_new_history", columns: [] }), f => f.catalog[0].columns.push("new_contact_id"), f => f.fks.pop(), f => f.fks[1].validated = false, f => f.fks[2].delete_type = "c"]) {
    const f = fixture(); change(f); await refuse(f.read()); assert(!f.calls.some(x => x.sql.startsWith("/*crm:count:")));
  }
});
test("active and trash losing references block; ordinary survivor references remain untouched", async () => {
  for (const deleted_at of [null, NOW]) {
    const f = fixture(); f.tables.os_records.push(pledge("right")); f.tables.os_records.at(-1).deleted_at = deleted_at;
    const context = await f.read(), result = mergePlan(context); assert.equal(result.proposal, null); assert(result.refusals.includes("losing-id-reference"));
    assert.equal(context.plannerContext.references[0].deleted, deleted_at !== null);
  }
  const f = fixture(); f.tables.os_records.push(pledge("left")); assert(mergePlan(await f.read()).proposal);
});
test("actual converted descriptor shape links even erased intake through complete tenant graph", async () => {
  const f = fixture(); addForm(f); f.tables.os_publications = [publication()];
  f.tables.os_intake = [{ org_id: ORG, id: "intake", publication_id: "pub", status: "converted", erased_at: NOW, revision: 3, converted_ids: [{ id: "right", moduleId: "contacts" }], answers: { email: "not-exported@example.invalid" } }];
  const context = await f.read(); assert.equal(mergePlan(context).proposal, null);
  assert(context.plannerContext.references.some(r => r.family === "intake" && r.contactId === "right" && r.deleted));
  assert(!JSON.stringify(context).includes("not-exported"));
  assert(!f.calls.some(x => /FROM os_participant_links\b/.test(x.sql)));
  assert(context.coverage.ownParticipantLinks.startsWith("not-read-own-RLS"));
});
test("missing/wrong converted modules or publication cannot silently waive a hidden link", async () => {
  for (const converted_ids of [["right"], [{ id: "right", moduleId: "events" }], [{ id: "missing", moduleId: "contacts" }]]) {
    const f = fixture(); addForm(f); f.tables.os_publications = [publication()]; f.tables.os_intake = [{ org_id: ORG, id: "intake", publication_id: "pub", converted_ids }]; await refuse(f.read());
  }
  const f = fixture(); f.tables.os_intake = [{ org_id: ORG, id: "intake", publication_id: "missing", converted_ids: [] }]; await refuse(f.read());
});
test("fixed participation/delivery parent edges and booking comments are read without current-state filters", async () => {
  const f = fixture(); f.tables.os_records.push(pledge("right", "booking"));
  f.tables.os_participations = [{ org_id: ORG, id: "part", contact_id: "right", booking_record_id: "booking", intake_id: null, state: "cancelled", recovered: true, revision: 9 }];
  f.tables.os_comments = [{ org_id: ORG, id: "booking_history", record_id: "booking", actor_id: USER, body: "Fictional retained note", created_at: NOW }];
  f.tables.os_participation_outbox = [{ org_id: ORG, id: "delivery", participation_id: "part", state: "delivered", user_id: "not-a-contact", relay_key: "not-returned", payload: { recipient: "not-read@example.invalid" } }];
  const context = await f.read(); assert.equal(mergePlan(context).proposal, null);
  for (const family of ["participation", "delivery", "immutable-history"]) assert(context.plannerContext.references.some(r => r.family === family));
  assert(!JSON.stringify(context).includes("not-read@example.invalid")); assert(!JSON.stringify(context).includes("not-returned"));
});
test("normal application-created drafts retain exact closed CRUD audits and can propose merge", async () => {
  const f = fixture(); f.tables.os_records[1].revision = 2; f.tables.os_events = [event(f.tables.os_records[0]), event(f.tables.os_records[1], "record.updated", { id: "2" })];
  const before = structuredClone(f.tables.os_events), context = await f.read();
  assert(mergePlan(context).proposal); assert.equal(context.coverage.preservedOrdinaryContactCrudAudits.count, 2);
  assert.match(context.coverage.preservedOrdinaryContactCrudAudits.sha256, /^[a-f0-9]{64}$/); assert.deepEqual(f.tables.os_events, before);
  assert(!JSON.stringify(context).includes('"actor_id"'));
});
test("source-confirmed empty organization audits are unrelated; unknown opaque audit semantics refuse", async () => {
  const f = fixture(); f.tables.os_events = [{ org_id: ORG, id: "1", actor_id: USER, action: "organization.created", record_id: null, module_id: null, detail: {}, created_at: NOW }];
  assert(mergePlan(await f.read()).proposal);
  f.tables.os_events[0] = { ...f.tables.os_events[0], action: "future.unknown", detail: { opaqueCode: "right" } };
  await refuse(f.read(), "contact_context_reconcile", 409);
});
test("normal organization and unrelated Program CRUD plus chosen Contact creation history remains usable", async () => {
  const f = fixture();
  const p = raw("program", "programs", validateRecord("programs", { title: "Fictional program", kind: "program" }, { records: [] }), { status: getModule("programs").workflow.initial });
  f.tables.os_records.push(p);
  f.tables.os_events = [
    { org_id: ORG, id: "1", actor_id: USER, action: "organization.created", record_id: null, module_id: null, detail: {}, created_at: NOW },
    event(p, "record.created", { id: "2", module_id: "programs" }),
    event(f.tables.os_records[0], "record.created", { id: "3" }), event(f.tables.os_records[1], "record.created", { id: "4" }),
  ];
  const result = await f.read(); assert(mergePlan(result).proposal); assert.equal(result.coverage.preservedOrdinaryContactCrudAudits.count, 2);
});
test("authority/import/extra audit shape does not inherit the CRUD preservation exception", async () => {
  for (const mutate of [e => e.detail.viaIntake = "intake", e => e.detail.record.approval = { status: "approved" }, e => e.detail.record.source = { integrationId: "connection", externalId: "foreign", checksum: "b".repeat(64) }]) {
    const f = fixture(), e = event(f.tables.os_records[0]); mutate(e); f.tables.os_events = [e]; await refuse(f.read());
  }
  const f = fixture(); f.tables.os_events = [event(f.tables.os_records[0], "record.approved")];
  const context = await f.read(); assert.equal(mergePlan(context).proposal, null); assert(context.plannerContext.references.some(r => r.family === "immutable-history"));
});
test("comment/file/frozen snapshot dependencies remain blocking for either contact", async () => {
  for (const table of ["os_comments", "os_files"]) {
    const f = fixture(); f.tables[table] = [{ org_id: ORG, id: "history", record_id: "left", bytes: "not-read", body: "Fictional note" }];
    assert.equal(mergePlan(await f.read()).proposal, null);
  }
  const f = fixture(); f.tables.os_records.push(pledge("left", "a-first"));
  f.tables.os_records[2].snapshot = { id: "a-first", moduleId: "fundraising", data: f.tables.os_records[2].data };
  const context = await f.read(); assert(context.plannerContext.references.some(r => r.family === "immutable-history"));
});
test("approval/snapshot comparison is minimized but every canonical value and SQL microstamp remains pinned", async () => {
  const f = fixture(); f.tables.os_records[0].approval = { privateActor: "not-retained-account", reason: "Private historical reason" };
  const a = await f.read(); assert.deepEqual(Object.keys(a.plannerContext.pair[0].approval), ["sha256"]); assert(!JSON.stringify(a).includes("not-retained-account"));
  assert.equal(mergePlan(a).proposal, null);
  f.tables.os_records[0].approval.reason += " changed"; const b = await f.read(); assert.notEqual(a.contextSha256, b.contextSha256); assert.notEqual(a.plannerContext.pair[0].approval.sha256, b.plannerContext.pair[0].approval.sha256);
  f.tables.os_records[0].updated_at = "2026-11-08T12:00:00.123457Z"; const c = await f.read(); assert.equal(c.rowStamps[0].updatedAtExact, "2026-11-08T12:00:00.123457Z"); assert.notEqual(c.contextSha256, b.contextSha256);
});
test("unknown report family and unclosed generic legacy snapshot reports refuse", async () => {
  const f = fixture(); f.tables.os_reports = [{ org_id: ORG, id: "report", checksum: "x", payload: { format: "unknown" } }]; await refuse(f.read(), "contact_context_reconcile", 409);
  const g = fixture(); g.tables.os_previews = [{ org_id: ORG, id: "preview", payload: { mysteryOwnerId: "right" } }]; await refuse(g.read(), "contact_context_unsupported", 409);
  const h = fixture(), record = recordProjection(h.tables.os_records[0]);
  const body = { id: "report", modules: [{ id: "contacts", records: [record] }] }, payload = { ...body, checksum: hash(body) };
  h.tables.os_reports = [{ org_id: ORG, id: "report", checksum: payload.checksum, payload }];
  await refuse(h.read(), "contact_context_reconcile", 409);
});
test("reserved report discriminators alone never prove a valid empty dependency set", async () => {
  for (const payload of [{ format: "charitology-field-response-import", version: 1, method: "aggregate-service-visits-v1", opaque: "right" }, { kind: "learning-review", methodVersion: "learning-review-v1" }]) {
    const f = fixture(); f.tables.os_reports = [{ org_id: ORG, id: "report", checksum: "a".repeat(64), payload }]; await refuse(f.read(), "contact_context_reconcile", 409);
  }
});
test("original CRM report remains a complete blocking dependency; no general ignore-list exists", async () => {
  const f = fixture(), initial = await f.read();
  const payload = makeContactReconciliationReport({ reportId: "original_report", recordedAtExact: NOW, input: { ...initial.plannerContext, decision: decision() } });
  f.tables.os_reports = [makeContactReconciliationReportRow({ orgId: ORG, id: "original_report", actorId: USER, createdAtExact: NOW, payload })];
  const context = await f.read(); assert.equal(mergePlan(context).proposal, null);
  assert.equal(context.reportDependencies[0].checksum, payload.sha256); assert.deepEqual(context.reportDependencies[0].contactIds, ["left", "right"]);
});
test("equal account/external/narrative values never infer contact ownership", async () => {
  const f = fixture();
  const program = raw("program", "programs", validateRecord("programs", { title: "left", kind: "program", purpose: "right" }, { records: [] }), { status: getModule("programs").workflow.initial });
  f.tables.os_records.push(program);
  const history = event(program, "record.created", { actor_id: "left", module_id: "programs" }); history.detail.record.lastEditedBy = "left";
  f.tables.os_events = [history];
  const context = await f.read(); assert(mergePlan(context).proposal);
});
test("bounded full pagination finds a late trash reference; source/count/byte drift refuses", async () => {
  const f = fixture(); for (let i = 0; i < 34; i++) f.tables.os_records.push(contact("other_" + String(i).padStart(2, "0")));
  f.tables.os_records.push({ ...pledge("right", "zz_last"), deleted_at: NOW });
  const context = await f.read(); assert.equal(mergePlan(context).proposal, null);
  assert.equal(f.calls.filter(x => x.sql.startsWith("/*crm:page:os_records*/")).length, 2);
  const g = fixture(); g.fakeCount = table => table === "os_records" ? { n: "20001", bytes: "0" } : null; await refuse(g.read(), "contact_context_limit", 409);
  const h = fixture(); h.pageMutation = (table, page) => table === "os_records" ? page.map((r, i) => i ? { ...r, row_key: page[0].row_key } : r) : page; await refuse(h.read());
  const j = fixture(); j.fakeCount = table => table === "os_records" ? { n: "2", bytes: "1" } : null; await refuse(j.read());
});
test("membership reincarnation/restore epoch changes authority; output is detached and frozen", async () => {
  const f = fixture(), a = await f.read(); f.createdExact = "2026-11-08T12:00:00.123457Z"; const b = await f.read();
  assert.notEqual(a.authority.membershipSha256, b.authority.membershipSha256); f.epoch = "7"; const c = await f.read();
  assert.notEqual(c.authority.restoreEpochSha256, b.authority.restoreEpochSha256);
  f.tables.os_records[0].data.title = "Edited later"; assert.equal(a.plannerContext.pair[0].data.title, "Fictional left");
  assert(Object.isFrozen(a.coverage)); assert.throws(() => { a.sourceOwnership[0].classification = "invented"; }, TypeError);
});
test("legal PostgreSQL bigint restore epoch stays exact decimal text beyond JavaScript safe integer", async () => {
  const f = fixture(); f.epoch = "9007199254740993"; const a = await f.read();
  assert.equal(a.authority.restoreEpochSha256, hash({ method: "contact-reconciliation-context-v1", kind: "restore", value: { epoch: f.epoch } }));
  f.epoch = "9223372036854775807"; const b = await f.read(); assert.notEqual(a.authority.restoreEpochSha256, b.authority.restoreEpochSha256);
  f.epoch = "9223372036854775808"; await refuse(f.read());
  f.epoch = "09007199254740993"; await refuse(f.read());
});
test("exact CRUD updated/restored revisions must reflect actual increments", async () => {
  for (const action of ["record.updated", "record.restored"]) {
    const f = fixture(); f.tables.os_events = [event(f.tables.os_records[0], action)]; await refuse(f.read());
  }
});
test("created/updated/restored current editor matches actor while deleted retains its prior editor", async () => {
  for (const action of ["record.created", "record.updated", "record.restored"]) {
    const f = fixture(); f.tables.os_records[0].revision = action === "record.created" ? 1 : 2;
    const e = event(f.tables.os_records[0], action); e.detail.record.lastEditedBy = "fictional_previous_editor"; f.tables.os_events = [e]; await refuse(f.read());
  }
  const f = fixture(), e = event(f.tables.os_records[0], "record.deleted"); e.detail.record.lastEditedBy = "fictional_previous_editor"; f.tables.os_events = [e]; assert(mergePlan(await f.read()).proposal);
});
test("CRM metadata row ID/checksum/fixed title bind the validated payload before inverse dependency output", async () => {
  const original = fixture(), context = await original.read();
  const payload = makeContactReconciliationReport({ reportId: "original_report", recordedAtExact: NOW, input: { ...context.plannerContext, decision: decision() } });
  const good = makeContactReconciliationReportRow({ orgId: ORG, id: "original_report", actorId: USER, createdAtExact: NOW, payload });
  for (const change of [r => r.id = "substituted_row", r => r.checksum = "f".repeat(64), r => r.title = "Substituted title"]) {
    const f = fixture(), row = structuredClone(good); change(row); f.tables.os_reports = [row]; await refuse(f.read());
  }
  const f = fixture(); f.tables.os_reports = [{ ...good, created_at: "2026-11-08T12:00:00.123456+00:00" }];
  const result = await f.read(); assert.equal(result.reportDependencies[0].reportId, payload.reportId); assert.equal(result.reportDependencies[0].checksum, payload.sha256);
  assert(f.calls.some(c => c.sql.startsWith("/*crm:page:os_reports*/") && c.sql.includes("to_char(t.created_at AT TIME ZONE 'UTC'")));
});

test("ordinary validated Program title and purpose JSON-looking text remain literal", async () => {
  for (const [field,value] of [["title","[Planning]"],["purpose","{draft}"]]) {
    const f=fixture();
    const data=validateRecord("programs",{title:"Fictional program",kind:"program",[field]:value},{records:[]});
    assert.equal(data[field],value);
    const p=raw("program","programs",data,{status:getModule("programs").workflow.initial});
    f.tables.os_records.push(p);
    f.tables.os_events=[event(p,"record.created",{id:"1",module_id:"programs"}),event(f.tables.os_records[0],"record.created",{id:"2"})];
    const context=await f.read();assert(mergePlan(context).proposal);
  }
});

test("complete future unknown preview row refuses before opaque payload scanning", async () => {
  const f=fixture();
  const row=Object.fromEntries(CATALOG.os_previews.map(k=>[k,null]));
  Object.assign(row,{org_id:ORG,id:"future_preview",actor_id:USER,kind:"future.unknown",payload:{opaqueCode:"left"},checksum:"a".repeat(64),base_revision:"b".repeat(64),expires_at:"2026-11-09T12:00:00.000000Z",created_at:NOW});
  f.tables.os_previews=[row];await refuse(f.read(),"contact_context_unsupported",409);
});
test("unparsed versioned history families refuse before packet body interpretation", async () => {
  for (const table of ["os_grant_report_previews", "os_learning_previews", "os_incubator_history", "os_resource_directory_history", "os_task_recurrence_series", "os_task_recurrence_occurrences", "os_participation_groups", "os_participation_group_receipts", "os_participation_checkins", "os_participation_delivery_previews"]) {
    const f = fixture(), row = Object.fromEntries(CATALOG[table].map(k => [k, null]));
    Object.assign(row, { org_id: ORG, id: "unparsed_packet", payload: { opaqueCode: "left" }, series_id: "series", sequence: 1, command_hash: "a".repeat(64) });
    f.tables[table] = [row]; await refuse(f.read(), "contact_context_unsupported", 409);
    assert(!f.calls.some(c => c.sql.startsWith("/*crm:page:" + table + "*/")));
  }
});
test("small fresh-member admission needs no catalog/pair/history read even after loser trash", async () => {
  const f = fixture(); f.tables.os_records[1].deleted_at = NOW; f.tables.os_previews = [{ org_id: ORG, id: "unknown", kind: "future.unknown", payload: {} }]; f.catalog = [];
  const result = await f.current(); assert.equal(result.member.userId, USER); assert.equal(result.authority.memberCreatedAtExact, NOW);
  assert(Object.isFrozen(result.authority)); assert.equal(f.calls.length, 4);
  assert(f.calls.every(c => !/crm:(?:catalog|link-fks|count|page)/.test(c.sql))); assert(f.calls.every(c => !c.sql.includes("FOR SHARE")));
  for (const change of [g => g.sessionValid = false, g => g.scopes = ["restricted"], g => g.role = "contributor"]) {
    const g = fixture(); change(g); await refuse(g.current(), null, g.sessionValid ? 403 : 401); assert(!g.calls.some(c => /crm:(?:catalog|count|page)/.test(c.sql)));
  }
});
test("trusted writer admission holds actual session/member row locks; options are closed and default readonly", async () => {
  const f = fixture(); f.allowLocks = true; await f.current({ readOnly: false });
  assert(f.calls.find(c => c.sql.startsWith("/*crm:session*/")).sql.endsWith(" FOR SHARE OF s"));
  assert(f.calls.find(c => c.sql.startsWith("/*crm:member*/")).sql.endsWith(" FOR SHARE"));
  assert(f.calls.every(c => !/crm:(?:catalog|count|page)/.test(c.sql)));
  const g = fixture(); await g.current({ readOnly: true }); assert(g.calls.every(c => !c.sql.includes("FOR SHARE")));
  for (const options of [{}, { readOnly: "false" }, { readOnly: true, authority: true }]) {
    const h = fixture(); await refuse(h.current(options)); assert.equal(h.calls.length, 0);
  }
});

const previewRow = (payload, more = {}) => ({ org_id: ORG, id: "crm_preview", actor_id: USER, kind: CONTACT_PREVIEW_KIND,
  payload, checksum: hash(payload), base_revision: payload.reviewedContextSha256 ?? "c".repeat(64),
  expires_at: "2026-11-08T12:30:00.123456+00:00", committed_at: null, created_at: "2026-11-08T12:00:00.123456+00:00", ...more });
const reportRow = (payload, actorId = USER) => makeContactReconciliationReportRow({ orgId: ORG, id: payload.reportId, actorId, createdAtExact: payload.recordedAtExact, payload });
const makeReport = async (f, more = {}) => makeContactReconciliationReport({ reportId: "review_report", recordedAtExact: NOW,
  input: { ...(await f.read()).plannerContext, decision: { ...decision(), ...more } } });
function installMergedPair(f, report) {
  for (const change of report.changes) {
    const r = f.tables.os_records.find(r => r.id === change.after.id);
    Object.assign(r, { revision: change.after.revision, data: structuredClone(change.after.data), deleted_at: change.after.deletedAt, updated_at: NOW });
  }
}
function recordedAudit(report, more = {}) {
  return { org_id: ORG, id: "7", actor_id: USER, action: "contact-reconciliation.recorded", record_id: null, module_id: null,
    detail: { reportId: report.reportId, reportSha256: report.sha256, operation: report.operation }, created_at: NOW, ...more };
}
function fieldManifest() {
  // These are actual pure source definitions and original aggregate bytes, not
  // a discriminator-only handcrafted manifest. Historical typed IDs may equal a
  // current Contact ID without changing their Programs/Outcomes meaning.
  const program = { id: "left", orgId: ORG, moduleId: "programs", revision: 1, data: validateRecord("programs", { title: "Fictional program", kind: "program" }), deletedAt: null };
  const indicator = { id: "right", orgId: ORG, moduleId: "outcomes", revision: 1, data: validateRecord("outcomes", { title: "Fictional indicator", kind: "indicator", programId: program.id, unit: "visits" }, { orgId: ORG, recordId: "right", records: [program] }), deletedAt: null };
  const responses = [
    { responseId: "included", startDate: "2026-01-01", endDate: "2026-01-02", geography: "[Planning]", visitCount: 0, denominator: null, excluded: false, exclusionReason: null },
    { responseId: "excluded", startDate: "2026-01-01", endDate: "2026-01-02", geography: null, visitCount: null, denominator: null, excluded: true, exclusionReason: "{draft}" },
  ];
  const inspection = inspectFieldAggregateFile(Buffer.from(JSON.stringify({ format: "charitology-aggregate-service-visits", version: 1, formId: "aggregate-service-visits-v1", schemaVersion: 1, responses })));
  const mapping = makeFieldMapping({ orgId: ORG, program, indicator });
  return compileFieldObservationDrafts({ inspection, mapping, selection: { responseIds: ["included", "excluded"] }, orgId: ORG, actorId: USER,
    integrationId: "fictional_source", candidateIds: [{ responseId: "included", recordId: "observation" }], program, indicator }).manifest;
}

test("known pending CRM preview is passive while every retained row still changes the complete context pin", async () => {
  const f = fixture(), before = await f.read();
  const payload = makeContactReconciliationPreview({ orgId: ORG, actorId: USER, reportId: "future_report", authority: before.authority,
    reviewedContextSha256: before.contextSha256, rowStamps: before.rowStamps, input: { ...before.plannerContext, decision: decision() } });
  f.tables.os_previews = [previewRow(payload)]; const context = await f.read();
  assert.deepEqual(context.plannerContext, before.plannerContext); assert(mergePlan(context).proposal);
  assert.notEqual(context.contextSha256, before.contextSha256); assert.deepEqual(context.reportDependencies, []);
  assert(f.calls.some(c => c.sql.startsWith("/*crm:page:os_previews*/")));
  f.tables.os_previews[0].expires_at = "2026-11-08T12:31:00.123456+00:00";
  assert.notEqual((await f.read()).contextSha256, context.contextSha256);
});
test("known committed CRM compact receipt stays passive and cannot grant current membership", async () => {
  const f = fixture(), initial = await f.read(), report = await makeReport(f);
  const payload = makeContactReconciliationReceipt({ report, authority: initial.authority, keyHash: "a".repeat(64), requestHash: "b".repeat(64) });
  f.tables.os_previews = [previewRow(payload, { committed_at: "2026-11-08T12:00:00.123456+00:00" })];
  assert(mergePlan(await f.read()).proposal); f.role = "contributor"; await refuse(f.read(), "contact_context_role", 403);
});
test("known preview requires its exact row, closed parser checksum and actor/org/base linkage", async () => {
  const original = fixture(), initial = await original.read();
  const payload = makeContactReconciliationPreview({ orgId: ORG, actorId: USER, reportId: "future_report", authority: initial.authority,
    reviewedContextSha256: initial.contextSha256, rowStamps: initial.rowStamps, input: { ...initial.plannerContext, decision: decision() } });
  for (const mutate of [r => r.checksum = "f".repeat(64), r => r.base_revision = "f".repeat(64), r => r.actor_id = "another_actor",
    r => r.extra = null, r => { r.payload.review.input.decision.reason += " altered"; r.checksum = hash(r.payload); }, r => r.org_id = "another_org"]) {
    const f = fixture(), r = structuredClone(previewRow(payload)); mutate(r); f.tables.os_previews = [r]; await refuse(f.read());
  }
});
test("separate inverse context returns genuine trashed SQL six-digit stamps without weakening normal reads", async () => {
  const f = fixture(), report = await makeReport(f); installMergedPair(f, report); const saved = structuredClone(f.tables.os_records);
  await refuse(f.read()); const result = await f.inverse();
  assert(!Object.hasOwn(result, "plannerContext")); assert.deepEqual(Object.keys(result.inverseContext).sort(), ["organizations", "pair", "references"]);
  assert.deepEqual(result.inverseContext.pair, report.changes.map(c => c.after));
  assert.equal(result.rowStamps[1].deletedAtExact, NOW); assert.equal(result.inverseContext.pair[1].deletedAt, NOW);
  assert.equal(result.rowStamps[0].deletedAtExact, null); assert.deepEqual(f.tables.os_records, saved); assert(Object.isFrozen(result.inverseContext.pair[1]));
});
test("inverse reader keeps current role, typed real pair and exact timestamp guards", async () => {
  for (const mutate of [f => f.role = "contributor", f => f.scopes = ["hidden"], f => f.sessionValid = false,
    f => f.tables.os_records.pop(), f => f.tables.os_records[1].module_id = "programs",
    f => f.tables.os_records[1].deleted_at = "2026-11-08T12:00:00.123Z"]) {
    const f = fixture(); f.tables.os_records[1].deleted_at = NOW; mutate(f); await refuse(f.inverse());
  }
});
test("inverse original report remains blocking and no client ignore argument is accepted", async () => {
  const f = fixture(), report = await makeReport(f); installMergedPair(f, report); f.tables.os_reports = [reportRow(report)];
  const result = await f.inverse(); assert.deepEqual(result.reportDependencies[0].contactIds, ["left", "right"]);
  assert.equal(result.reportDependencies[0].checksum, report.sha256); assert.equal(result.inverseContext.references.length, 2);
  const c = { query() { throw Error("must not query"); } };
  await refuse(contextApi.readContactReconciliationInverseContext(c, { org: ORG, session: session(), leftId: "left", rightId: "right", ignoreReports: [report.reportId] }));
});
test("fully validated FIELD geography/exclusion literals and typed source IDs do not become Contact edges", async () => {
  const f = fixture(), payload = fieldManifest();
  assert.equal(payload.rows[0].row.geography, "[Planning]"); assert.equal(payload.rows[1].row.exclusionReason, "{draft}");
  f.tables.os_reports = [{ org_id: ORG, id: "field_report", created_by: USER, title: "Aggregate visits import: " + payload.file.sha256.slice(0, 12), checksum: payload.sha256, payload, created_at: NOW }];
  const result = await f.read(); assert(mergePlan(result).proposal); assert.deepEqual(result.reportDependencies, []);
  const before = result.contextSha256; f.tables.os_reports[0].payload = structuredClone(payload); f.tables.os_reports[0].payload.rows[0].row.geography = "unsealed change"; await refuse(f.read());
  assert.match(before, /^[a-f0-9]{64}$/);
});
test("fully validated CRM literal reason still retains its exact typed frozen pair dependencies", async () => {
  for (const reason of ["[Planning]", "{draft}"]) {
    const f = fixture(), report = await makeReport(f, { reason }); f.tables.os_reports = [reportRow(report)];
    const result = await f.read(); assert.equal(mergePlan(result).proposal, null);
    assert.deepEqual(result.reportDependencies[0].contactIds, ["left", "right"]); assert.equal(result.reportDependencies[0].checksum, report.sha256);
  }
});
test("strict report-linked recorded audit is passive, ordered after reports, and preserves all pins", async () => {
  const f = fixture(), report = await makeReport(f); f.tables.os_reports = [{ ...reportRow(report), created_by: "restored_creator" }];
  const before = await f.read(); f.calls = []; f.tables.os_events = [recordedAudit(report)]; const result = await f.read();
  assert.deepEqual(result.plannerContext.references, before.plannerContext.references); assert.deepEqual(result.reportDependencies, before.reportDependencies);
  assert.notEqual(result.contextSha256, before.contextSha256);
  const pages = f.calls.map(c => c.sql); assert(pages.findIndex(s => s.startsWith("/*crm:page:os_reports*/")) < pages.findIndex(s => s.startsWith("/*crm:page:os_events*/")));
});
test("recorded audit refuses absent/mismatched report, operation, checksum or extra metadata", async () => {
  const seed = fixture(), report = await makeReport(seed);
  for (const mutate of [e => e.detail.reportId = "missing", e => e.detail.reportSha256 = "f".repeat(64), e => e.detail.operation = "no-merge",
    e => e.detail.unknown = "right", e => e.record_id = "left", e => e.module_id = "contacts", e => e.action += ".future"]) {
    const f = fixture(), e = recordedAudit(report); mutate(e); f.tables.os_reports = [reportRow(report)]; f.tables.os_events = [e]; await refuse(f.read());
  }
  const f = fixture(); f.tables.os_events = [recordedAudit(report)]; await refuse(f.read());
});
test("reverse report nested original and recorded audit retain the original typed references", async () => {
  const f = fixture(), original = await makeReport(f);
  const reverse = planContactReconciliationReversal({ original, current: { pair: original.changes.map(c => c.after), organizations: [], references: [] }, reportId: "inverse_report", recordedAtExact: "2026-11-08T12:00:00.123457Z" });
  f.tables.os_reports = [reportRow(reverse)]; f.tables.os_events = [recordedAudit(reverse)];
  const result = await f.read(); assert.deepEqual(result.reportDependencies[0].contactIds, ["left", "right"]); assert.equal(result.reportDependencies[0].reportId, reverse.reportId);
});

test("unsupported legacy report cannot hide an unknown opaque linkage behind a valid modules checksum", async () => {
  const f = fixture();
  const p = raw("program", "programs", validateRecord("programs", { title: "Fictional program", kind: "program" }), { status: getModule("programs").workflow.initial });
  const body = { id: "legacy_report", modules: [{ id: "programs", records: [recordProjection(p)] }], futurePacket: { opaqueCode: "right" } };
  const payload = { ...body, checksum: hash(body) };
  f.tables.os_reports = [{ org_id: ORG, id: "legacy_report", checksum: payload.checksum, payload }];
  await refuse(f.read(), "contact_context_reconcile", 409);
});

const reminder = (more = {}) => ({ org_id: ORG, id: "reminder", kind: "reminder", payload: { userId: "left", recordId: "program", title: "[Planning]", organizationName: "{draft}" }, ...more });
test("closed reminder narrative remains literal while its actual record pointer still blocks", async () => {
  const f = fixture(); f.tables.os_jobs = [reminder()];
  assert(mergePlan(await f.read()).proposal);
  f.tables.os_jobs[0].payload.recordId = "right"; const result = await f.read(); assert.equal(mergePlan(result).proposal, null);
  assert.deepEqual(result.plannerContext.references.map(r => [r.family, r.contactId]), [["delivery", "right"]]);
});
test("reminder kind alone cannot admit opaque extra payload, invalid IDs or incomplete old shapes", async () => {
  for (const mutate of [r => r.payload.futurePacket = { opaqueCode: "right" }, r => delete r.payload.organizationName,
    r => r.payload.userId = ["left"], r => r.payload.title = {}, r => r.payload.recordId = "invalid/id"]) {
    const f = fixture(), r = reminder(); r.payload.title = "Fictional title"; r.payload.organizationName = "Fictional organization"; mutate(r); f.tables.os_jobs = [r]; await refuse(f.read());
  }
});
test("invitation and unknown jobs remain unsupported without selecting addresses or tokens", async () => {
  for (const kind of ["invitation", "future.unknown"]) {
    const f = fixture(); f.tables.os_jobs = [{ org_id: ORG, id: "job", kind, payload: { to: "not-selected@example.invalid", token: "not-selected-secret" } }];
    await refuse(f.read(), "contact_context_unsupported", 409);
    assert(f.calls.filter(c => /crm:(count|page):os_jobs/.test(c.sql)).every(c => c.sql.includes("CASE WHEN t.kind='reminder' THEN t.payload ELSE '{}'::jsonb END")));
  }
});
