/** Strict fake SELECT fixture copied from committed context tests, extended only for exact Learning SQL aliases. No SQL/auth truth. */
import assert from "node:assert/strict";
import * as contextApi from "../lib/contact-reconciliation-context.mjs";
const { readContactReconciliationContext: read, currentContactReconciliationMember: currentMember } = contextApi;
import CATALOG from "./fixtures/contact-schema-column-vectors-v1.json" with { type: "json" };
import { validateRecord } from "../lib/modules.mjs";
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
export function fixture(reader = read) {
  const state = { tables: { os_records: [contact("left"), contact("right")] }, calls: [], role: "owner", scopes: [], sessionValid: true,
    aliases: new Map(), createdExact: NOW, revision: 1, epoch: "0", catalog: Object.entries(CATALOG).map(([table_name, columns]) => ({ table_name, columns: [...columns] })), fks: fkRows(), pageMutation: null, fakeCount: null, allowLocks: false };
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
      ...(table === "os_records" ? { created_exact: x.row.created_at, updated_exact: x.row.updated_at, deleted_exact: x.row.deleted_at } : table === "os_reports" && sql.includes("AS created_exact") ? { created_exact: state.aliases.get(table + ":" + x.row.id)?.createdAtExact ?? NOW } : table === "os_learning_history" ? (() => {
        assert(sql.includes("octet_length(t.payload::text) AS payload_bytes")); assert(sql.includes("COALESCE(octet_length(t.receipt::text),0) AS receipt_bytes"));
        const a = state.aliases.get(table + ":" + x.row.id); assert(a);
        return { created_exact: a.createdAtExact, payload_bytes: a.payloadBytes, receipt_bytes: a.receiptBytes };
      })() : table === "os_previews" ? { preview_created_exact: x.row.created_at, preview_expires_exact: x.row.expires_at, preview_committed_exact: x.row.committed_at } : {}) }));
    if (state.pageMutation) output = state.pageMutation(table, output);
    return { rows: output };
  } };
  state.read = () => reader(c, { org: ORG, session: session(), leftId: "left", rightId: "right" });
  state.current = options => currentMember(c, { org: ORG, session: session() }, options);
  state.inverse = () => contextApi.readContactReconciliationInverseContext(c, { org: ORG, session: session(), leftId: "left", rightId: "right" });
  return state;
}

export { ORG, USER, NOW, session, raw, contact, recordProjection };
