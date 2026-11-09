import {validateRecurringOccurrenceManifest,validateRecurringOccurrenceReportRow,validateRecurringOccurrencePreviewRow,RECURRENCE_PACKET_KIND} from './participation-recurrence-packets.mjs';
/** Private SELECT-only candidate. Caller owns the same-c tenant transaction and org lock. */
import { isProxy } from "node:util/types";
import { getModule, validateRecord } from "./modules.mjs";
import { requirePermission } from "./access.mjs";
import { hash, stable } from "./security.mjs";
import { learningOwned } from "./learning-transport.mjs";
import { validateGroupExactStamp } from "./participation-group-model.mjs";
import { CONTACT_CONTEXT_CATALOG } from "./contact-context-catalog.mjs";
import { validateContactReconciliationReport, validateContactReconciliationReportRow } from "./contact-reconciliation-report.mjs";
import { validInstant } from "./schedule.mjs";
import { validateFieldImportManifest } from "./field-response-model.mjs";
import { CONTACT_PREVIEW_KIND, validateContactReconciliationPreviewRow } from "./contact-reconciliation-preview.mjs";
import { validateStoredGrantInventory, GRANT_HISTORY_FIELD_PROFILE_SHA256 } from "./grant-report-history.mjs";
import { validateContactLearningClosure, CONTACT_LEARNING_REFERENCE_PROFILE_SHA256 } from "./contact-known-history.mjs";

export const CONTACT_CONTEXT_LIMITS = Object.freeze({ rows: 20000, bytes: 32 * 1024 * 1024, batch: 32, references: 128 });
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const H = (kind, value) => hash({ method: "contact-reconciliation-context-v1", kind, value });
export class ContactContextError extends Error {
  constructor(code = "contact_context_unavailable", status = 404) {
    super("This contact comparison is unavailable or needs reconciliation.");
    this.name = "ContactContextError"; this.code = code; this.status = status;
  }
}
const need = (v, code, status) => { if (!v) throw new ContactContextError(code, status); };
const reconcile = () => { throw new ContactContextError("contact_context_reconcile", 409); };
const id = v => { need(typeof v === "string" && ID.test(v)); return v; };
function prop(v, k) {
  need(v && typeof v === "object" && !isProxy(v));
  const d = Object.getOwnPropertyDescriptor(v, k); need(d?.enumerable && Object.hasOwn(d, "value")); return d.value;
}
function exact(v, keys) {
  need(v && typeof v === "object" && !isProxy(v) && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype);
  const names = Reflect.ownKeys(v); need(names.length === keys.length && names.every(k => typeof k === "string" && keys.includes(k)));
  return Object.fromEntries(keys.map(k => [k, prop(v, k)]));
}
const rows = result => { const r = prop(result, "rows"); need(Array.isArray(r) && !isProxy(r)); return r; };
const revision = n => need(Number.isSafeInteger(n) && n > 0 && n <= 2147483647);
const count = s => { need(typeof s === "string" && /^(0|[1-9][0-9]*)$/.test(s)); const n = Number(s); need(Number.isSafeInteger(n)); return n; };
const same = (a, b) => stable(a) === stable(b);
const empty = () => new Set();
function addMap(map, key, values) { if (key == null) return; const set = map.get(key) ?? empty(); for (const v of values) set.add(v); map.set(key, set); }
const get = (map, key) => map.get(key) ?? empty();
const union = (...sets) => new Set(sets.flatMap(s => [...s]));

// Fixed table set and projections: no client table/field selectors, credentials or file bytes.
const OMIT = {
  os_orgs: "organization metadata has no contact-record edge", os_members: "account membership is not contact identity",
  os_invites: "email/account invitation is not contact identity", os_integrations: "connector identity is not a contact edge",
  os_rate_limits: "rate keys are not contact references", os_job_tenants: "tenant scheduling metadata",
  os_uploads: "unaccepted byte chunks have no typed contact edge", os_participant_org_usage: "monotonic aggregate only",
  os_participant_links: "own-user RLS; complete mandatory intake/publication graph used instead",
};
const FIRST = ["os_records", "os_reports", "os_publications", "os_intake", "os_participations", "os_participation_groups", "os_participation_group_receipts", "os_participation_checkins"];
const TABLES = [...FIRST, ...Object.keys(CONTACT_CONTEXT_CATALOG).filter(t => !OMIT[t] && !FIRST.includes(t)).sort()];
// No generic no-match result may admit a packet family whose versioned parser
// has not been connected. A later reviewed extension must validate the actual
// family/closure before replacing any one of these unsupported refusals.
const UNPARSED_PACKETS = Object.freeze([
  "os_grant_report_previews", "os_learning_previews",
  "os_incubator_history", "os_resource_directory_history", "os_task_recurrence_series", "os_task_recurrence_occurrences",
  "os_participation_groups", "os_participation_group_receipts", "os_participation_checkins", "os_participation_delivery_previews",
]);
const EXCLUDED_COLUMNS = {
  os_files: ["bytes"], os_intake: ["answers", "idempotency_hash", "payload_hash", "receipt_hash", "ip_hash"],
  os_participation_outbox: ["payload", "consent_copy", "relay_key", "recipient_hash", "user_id", "link_id"],
};
const PROJECTION = {
  os_jobs: "jsonb_build_object('org_id',t.org_id,'id',t.id,'kind',t.kind,'payload',CASE WHEN t.kind='reminder' THEN t.payload ELSE '{}'::jsonb END)",
};
const keyFor = t => t === "os_task_recurrence_occurrences" ? "t.series_id||':'||t.sequence::text" : t === "os_participation_group_receipts" ? "t.command_hash" : t === "os_participation_delivery_policies" ? "t.org_id" : "t.id::text";
const projectFor = t => PROJECTION[t] ?? (EXCLUDED_COLUMNS[t]
  ? `jsonb_build_object(${CONTACT_CONTEXT_CATALOG[t].filter(k => !EXCLUDED_COLUMNS[t].includes(k)).map(k => `'${k}',t.${k}`).join(",")})`
  : "to_jsonb(t)");

async function authenticate(c, org, session, readOnly = true) {
  const sessionId = id(prop(prop(session, "session"), "id")), userId = id(prop(prop(session, "user"), "id"));
  let r = rows(await c.query('/*crm:session*/ SELECT s.id AS session_id,s."userId" AS user_id,u.id AS current_user_id FROM "session" s JOIN "user" u ON u.id=s."userId" WHERE s.id=$1 AND s."userId"=$2 AND s."expiresAt">clock_timestamp()'+(readOnly?'':' FOR SHARE OF s'), [sessionId, userId]));
  need(r.length === 1 && same(exact(r[0], ["session_id", "user_id", "current_user_id"]), { session_id: sessionId, user_id: userId, current_user_id: userId }), "session", 401);
  r = rows(await c.query("/*crm:member*/ SELECT user_id,role,program_ids,revision,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_exact FROM os_members WHERE org_id=$1 AND user_id=$2"+(readOnly?'':' FOR SHARE'), [org, userId]));
  need(r.length === 1, "membership", 403);
  const m = exact(r[0], ["user_id", "role", "program_ids", "revision", "created_exact"]);
  need(m.user_id === userId && ["owner", "admin"].includes(m.role) && Array.isArray(m.program_ids) && m.program_ids.length === 0, "contact_context_role", 403);
  revision(m.revision); try { validateGroupExactStamp(m.created_exact); } catch { reconcile(); }
  const member = { userId, role: m.role, programIds: [], revision: m.revision };
  requirePermission("contacts", member, "read"); requirePermission("contacts", member, "write");
  const guc = rows(await c.query("/*crm:guc*/ SELECT current_setting('app.org_id',true) AS org_id,current_setting('app.user_id',true) AS user_id", []));
  need(guc.length === 1 && same(exact(guc[0], ["org_id", "user_id"]), { org_id: org, user_id: userId }));
  const e = rows(await c.query("/*crm:epoch*/ SELECT COALESCE(max(id)::text,'0') AS epoch FROM os_events WHERE org_id=$1 AND action IN ('backup.restored','record.restored')", [org]));
  need(e.length === 1);
  const epoch = prop(e[0], "epoch");
  need(typeof epoch === "string" && /^(0|[1-9][0-9]{0,18})$/.test(epoch) && BigInt(epoch) <= 9223372036854775807n);
  return { member, authority: { actorId: userId, sessionSha256: H("session", { id: sessionId }),
    membershipSha256: H("membership", { ...member, createdAtExact: m.created_exact }), memberCreatedAtExact: m.created_exact,
    restoreEpochSha256: H("restore", { epoch }) } };
}
/** Trusted server options only. Writer callers own a READ WRITE transaction on
 * this same client; no HTTP field may select readOnly or supply authority. */
export async function currentContactReconciliationMember(c, input, options) {
  const { org, session } = exact(input, ["org", "session"]); id(org);
  const settings = options === undefined ? { readOnly: true } : exact(options, ["readOnly"]);
  need(typeof settings.readOnly === "boolean");
  return learningOwned(await authenticate(c, org, session, settings.readOnly), { bytes: 4096 });
}
async function catalog(c) {
  const found = rows(await c.query("/*crm:catalog*/ SELECT t.relname AS table_name,array_agg(a.attname::text ORDER BY a.attnum) AS columns FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped WHERE n.nspname=current_schema() AND t.relkind IN ('r','p') AND t.relname LIKE 'os\\_%' ESCAPE '\\' GROUP BY t.relname ORDER BY t.relname COLLATE \"C\"", []));
  need(found.length === Object.keys(CONTACT_CONTEXT_CATALOG).length);
  const names = new Set();
  for (const value of found) {
    const r = exact(value, ["table_name", "columns"]); need(!names.has(r.table_name) && Object.hasOwn(CONTACT_CONTEXT_CATALOG, r.table_name));
    need(Array.isArray(r.columns) && same([...r.columns].sort(), [...CONTACT_CONTEXT_CATALOG[r.table_name]].sort())); names.add(r.table_name);
  }
  const fks = rows(await c.query("/*crm:link-fks*/ SELECT c.confrelid::regclass::text AS parent,array(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(attnum,n) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum ORDER BY k.n) AS child_columns,array(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(attnum,n) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum ORDER BY k.n) AS parent_columns,c.convalidated AS validated,c.confdeltype::text AS delete_type,c.confupdtype::text AS update_type FROM pg_constraint c WHERE c.conrelid='os_participant_links'::regclass AND c.contype='f' ORDER BY c.confrelid::regclass::text", []));
  need(fks.length === 3);
  for (const [parent, child, target] of [["os_orgs", ["org_id"], ["id"]], ["os_intake", ["org_id", "intake_id"], ["org_id", "id"]], ["os_publications", ["org_id", "publication_id"], ["org_id", "id"]]]) {
    need(fks.filter(f => f.parent === parent && same(f.child_columns, child) && same(f.parent_columns, target) && f.validated === true && f.delete_type === "a" && f.update_type === "a").length === 1);
  }
}
function referenceFields(data, moduleId, chosen) {
  need(data && typeof data === "object" && !Array.isArray(data));
  let m; try { m = getModule(moduleId); } catch { reconcile(); }
  need(Object.keys(data).every(k => m.fields.some(f => f.key === k)));
  const result = [];
  for (const f of m.fields.filter(f => f.target === "contacts" && ["reference", "references"].includes(f.type))) {
    const raw = data[f.key] ?? null;
    need(raw === null || (f.type === "reference" ? typeof raw === "string" && ID.test(raw) : Array.isArray(raw) && raw.every(x => typeof x === "string" && ID.test(x))));
    for (const contactId of f.type === "references" ? raw ?? [] : raw === null ? [] : [raw]) if (chosen.has(contactId)) result.push({ field: f.key, contactId });
  }
  return result;
}
// Only typed record/intake/participation/group roles establish edges. Equal user,
// email, external identity or arbitrary narrative never establishes contact identity.
const NON_CONTACT = new Set(["org_id", "orgId", "originOrgId", "origin_org_id", "user_id", "userId", "actor_id", "actorId", "actorHash", "created_by", "createdBy", "owner_id", "ownerId", "last_editor_id", "lastEditedBy", "sessionId", "session_id", "integrationId", "externalId", "publicationId", "programId", "sourceVersion", "reportId", "report_id", "authority"]);
function scan(value, maps, chosen, budget, depth = 0) {
  need(++budget.nodes <= 1000000 && depth <= 32, "contact_context_limit", 409);
  let found = empty();
  // Only actual normalized record data branded internally by its closed source
  // builder may bypass opaque-packet walking. The registry defines ALL its
  // reference fields; text/textarea/URL/money leaves remain literal data.
  if (value && typeof value === "object" && budget.literalModuleData.has(value)) {
    for (const r of referenceFields(value, budget.literalModuleData.get(value), chosen)) found.add(r.contactId);
    return found;
  }
  if (typeof value === "string") {
    // A persisted JSON string may contain a second structured packet. Refuse an
    // unparseable structured-looking value instead of silently skipping it.
    if (/^[\[{]/.test(value.trim())) {
      budget.decoded += Buffer.byteLength(value); need(budget.decoded <= CONTACT_CONTEXT_LIMITS.bytes, "contact_context_limit", 409);
      let parsed; try { parsed = JSON.parse(value); } catch { reconcile(); }
      return scan(parsed, maps, chosen, budget, depth + 1);
    }
    return found;
  }
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) { for (const x of value) found = union(found, scan(x, maps, chosen, budget, depth + 1)); return found; }
    if (typeof value.moduleId === "string" && value.data && typeof value.data === "object") {
    let m; try { m = getModule(value.moduleId); } catch { reconcile(); }
    if (m.id === "contacts" && chosen.has(value.id)) found.add(value.id);
    for (const r of referenceFields(value.data, m.id, chosen)) found.add(r.contactId);
  }
  const roles = { contactId: "contact", contact_id: "contact", recordId: "record", record_id: "record", recordIds: "record", survivorId: "record", loserId: "record", bookingRecordId: "record", booking_record_id: "record", targetId: "record", target_id: "record", generatedRecordId: "record", generated_record_id: "record", sourceRecordId: "record", source_record_id: "record", rootRecordId: "record", root_record_id: "record", tip_record_id: "record", participationId: "participation", participation_id: "participation", live_participation_id: "participation", unselectedIds: "participation", intakeId: "intake", intake_id: "intake", coordinatorIntakeId: "intake", coordinator_intake_id: "intake", publication_id: "publication", groupId: "group", group_id: "group", rosterIds: "participation", roster_ids: "participation" };
  for (const [key, v] of Object.entries(value)) {
    if (NON_CONTACT.has(key)) continue;
    if (key === "converted_ids") {
      need(Array.isArray(v));
      for (const item of v) {
        const x = exact(item, ["id", "moduleId"]); id(x.id);
        need(["contacts", "events", "volunteers"].includes(x.moduleId));
        found = union(found, get(maps.record, x.id));
      }
      continue;
    }
    const role = roles[key];
    if (role) {
      const ids = v === null ? [] : Array.isArray(v) ? v : [v]; need(ids.every(x => typeof x === "string" && ID.test(x)));
      for (const x of ids) {
        if (role === "contact") { if (chosen.has(x)) found.add(x); }
        else found = union(found, get(maps[role], x));
      }
    } else if (key === "ids" || /Ids?$|_ids?$/.test(key)) {
      const values = Array.isArray(v) ? v : [v];
      // Unsupported identifier roles affecting this pair require a reviewed seam.
      if (values.some(x => typeof x === "string" && (chosen.has(x) || Object.values(maps).some(m => get(m, x).size)))) reconcile();
    }
    found = union(found, scan(v, maps, chosen, budget, depth + 1));
  }
  return found;
}
// Fully parsed reserved report families have source-specific reference roles.
// Their narrative leaves are never serialized packets or identifier guesses.
function classifyReport(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (typeof payload.format === 'string' && payload.format.startsWith('charitology-participation-occurrence-generation')) {
    try { return {kind:'recurrence',payload:validateRecurringOccurrenceManifest(payload)}; } catch { return null; }
  }
  if (payload.format === "charitology-field-response-import") {
    try { return { kind: "field", payload: validateFieldImportManifest(payload) }; } catch { return null; }
  }
  if (payload.format === "charitology-contact-reconciliation") {
    try { return { kind: "contact", payload: validateContactReconciliationReport(payload) }; } catch { return null; }
  }
  // Discriminators only select a complete deferred family validator. They do
  // not admit a body or waive an unsupported/changed version.
  if (payload.kind === "grant-period" || payload.methodVersion === "grant-report-v1")
    return { kind: "grant-history", payload };
  if (payload.kind === "learning-review" || payload.methodVersion === "learning-review-v1")
    return { kind: "learning-history", payload };
  return null;
}
function recurrenceReportReferences(payload,maps,modules,org) {
  // Cross-organization restore preserves original historical identities. They
  // must not alias unrelated destination IDs merely sharing their spelling.
  if(payload.originOrgId!==org)return empty();
  const refs=[{id:payload.source.id,moduleId:payload.source.moduleId},...payload.dependencies.references,...payload.candidates.map(r=>({id:r.id,moduleId:r.moduleId}))];
  let found=empty();for(const ref of refs){if(modules.has(ref.id))need(modules.get(ref.id)===ref.moduleId);found=union(found,get(maps.record,ref.id));}return found;
}
function passiveRecurrenceAudit(row,reports) {
  if(row.action!=='participation-recurrence.generated'||row.record_id!==null||row.module_id!==null)return false;
  const d=exact(row.detail,['reportId','reportSha256','sourceId','recordIds']),m=reports.get(d.reportId);need(m);
  need(d.reportSha256===m.sha256&&d.sourceId===m.source.id&&stable(d.recordIds)===stable(m.candidates.map(c=>c.id)));return true;
}
function contactReportReferences(payload, chosen) {
  // checkedReport admits at most one nested original merge. No reason, title,
  // account, opaque checksum or external-source value establishes identity.
  const found = empty();
  const add = contactId => { if (chosen.has(contactId)) found.add(contactId); };
  const record = r => { add(r.id); for (const ref of referenceFields(r.data, "contacts", chosen)) add(ref.contactId); };
  if (payload.review !== null) {
    for (const r of payload.review.input.pair) record(r);
    for (const r of payload.review.input.organizations) add(r.id);
    for (const r of payload.review.input.references) { add(r.contactId); if (r.family === "record" && r.moduleId === "contacts") add(r.id); }
  }
  for (const change of payload.changes) { record(change.before); record(change.after); }
  if (payload.reverses !== null) for (const contactId of contactReportReferences(payload.reverses, chosen)) add(contactId);
  return found;
}
// Complete inventories only. No account/receipt/creator field supplies current
// authority, and no historical row is fabricated to satisfy a typed reference.
function finalizeKnownHistory(known, org, recordModules, maps, chosen, pushRef, reportDependencies) {
  const grantPresent = known.grants.length > 0;
  const learningPresent = known.history.length > 0 || known.learning.length > 0;
  if (!grantPresent && !learningPresent) return null;
  let grants = null, learning = null;
  try {
    if (grantPresent) grants = validateStoredGrantInventory({ reportRows: known.grants.map(x => x.entry) });
    if (learningPresent) learning = validateContactLearningClosure({ historyRows: known.history, reportRows: known.learning.map(x => x.entry) });
  } catch { reconcile(); }
  const types = new Map();
  const identity = (originOrgId, moduleId, recordId) => {
    const key = stable([originOrgId, recordId]);
    need(!types.has(key) || types.get(key) === moduleId, "contact_context_reconcile", 409);
    types.set(key, moduleId);
    if (originOrgId === org && recordModules.has(recordId))
      need(recordModules.get(recordId) === moduleId, "contact_context_reconcile", 409);
  };
  if (learning) for (const r of learning.recordIdentities) identity(r.originOrgId, r.moduleId, r.recordId);
  if (grants) for (const report of grants.reports) {
    for (const module of report.modules) for (const r of module.records) {
      identity(report.orgId, r.moduleId, r.id);
      if (Object.hasOwn(r, "submittedArtifact")) {
        const submitted = r.submittedArtifact.record;
        identity(report.orgId, submitted.moduleId, submitted.id);
      }
    }
  }
  if (grants) for (const projection of grants.referenceProjections) for (const r of projection.recordRefs) {
    identity(r.originOrgId, r.moduleId, r.recordId);
    identity(r.originOrgId, r.targetModuleId, r.targetRecordId);
  }
  const actual = (originOrgId, recordId) => originOrgId === org ? get(maps.record, recordId) : empty();
  if (grants) for (const projection of grants.referenceProjections) {
    let affected = empty();
    const report = grants.reports.find(r => r.id === projection.report.id);
    for (const module of report.modules) for (const r of module.records)
      affected = union(affected, actual(report.orgId, r.id));
    for (const r of projection.recordRefs) {
      affected = union(affected, actual(r.originOrgId, r.recordId), actual(r.originOrgId, r.targetRecordId));
      if (r.originOrgId === org && r.targetModuleId === "contacts" && chosen.has(r.targetRecordId)) affected.add(r.targetRecordId);
    }
    const stored = known.grants.find(x => x.entry.row.id === report.id);
    const referenceId = H("reference-id", { table: "os_reports", key: stored.rowKey });
    for (const contactId of affected) pushRef({ family: "immutable-history", id: referenceId,
      moduleId: null, field: null, contactId, revision: null, sha256: stored.pin, deleted: false });
    if (affected.size) reportDependencies.push({ referenceId, reportId: report.id, checksum: report.checksum,
      classification: "frozen-report", contactIds: [...affected].sort() });
  }
  // Only a present, fully admitted inventory adds this closed interpretation pin.
  // Raw row/census pins independently retain every payload and new SQL alias.
  return H("known-history-method", { method: "contact-known-history-context-v1",
    grantFieldProfileSha256: grantPresent ? GRANT_HISTORY_FIELD_PROFILE_SHA256 : null,
    learningReferenceProfileSha256: learningPresent ? CONTACT_LEARNING_REFERENCE_PROFILE_SHA256 : null });
}
function reminderReferences(row, maps) {
  exact(row, ["org_id", "id", "kind", "payload"]); id(row.id);
  need(row.kind === "reminder", "contact_context_unsupported", 409);
  const p = exact(row.payload, ["userId", "recordId", "title", "organizationName"]);
  id(p.userId); id(p.recordId); need(typeof p.title === "string" && typeof p.organizationName === "string");
  // Exact handler reminder builder. Only the record pointer has record meaning;
  // account identity and literal title/organization text do not create edges.
  return new Set(get(maps.record, p.recordId));
}
function passiveContactAudit(row, reports) {
  if (row.action !== "contact-reconciliation.recorded") return false;
  exact(row, CONTACT_CONTEXT_CATALOG.os_events); id(row.actor_id);
  need(row.record_id === null && row.module_id === null);
  const d = exact(row.detail, ["reportId", "reportSha256", "operation"]); id(d.reportId);
  need(typeof d.reportSha256 === "string" && /^[a-f0-9]{64}$/.test(d.reportSha256) && ["merge", "no-merge", "reverse"].includes(d.operation));
  const report = reports.get(d.reportId);
  need(report && report.checksum === d.reportSha256 && report.operation === d.operation);
  // Restore changes SQL created_by independently of the historical audit actor.
  // This metadata grants no accepted-command, inverse or current authority.
  return true;
}

// Exact normal handler builders, not a broad record.* prefix. The created
// handler object has no source key until persistence; rowRecord-backed later
// actions have source:null. Intake/import/approval/transition shapes are excluded.
function ordinaryRecordAudit(row, org, records) {
  if (!["record.created", "record.updated", "record.deleted", "record.restored"].includes(row.action)) return null;
  if (!row.detail || Object.keys(row.detail).length !== 1 || !Object.hasOwn(row.detail, "record")) reconcile();
  const r = row.detail.record;
  const base = ["id", "orgId", "moduleId", "data", "status", "ownerId", "lastEditedBy", "revision", "approval", "snapshot", "createdAt", "updatedAt"];
  exact(r, row.action === "record.created" ? base : [...base, "source"]);
  id(r.id); need(r.id === row.record_id && r.orgId === org && r.moduleId === row.module_id);
  let module; try { module = getModule(r.moduleId); } catch { reconcile(); }
  need(module.workflow.states.some(s => s.id === r.status));
  for (const v of [r.approval, r.snapshot]) need(v === null || v && typeof v === "object" && !Array.isArray(v));
  if (row.action !== "record.created" && r.source !== null) {
    const s = exact(r.source, ["integrationId", "externalId", "checksum"]); id(s.integrationId);
    need(typeof s.externalId === "string" && s.externalId.length >= 1 && s.externalId.length <= 160 && typeof s.checksum === "string" && /^[a-f0-9]{64}$/.test(s.checksum));
  }
  id(r.ownerId); id(r.lastEditedBy); revision(r.revision); if (row.action === "record.created") need(r.revision === 1);
  id(row.actor_id);
  if (["record.updated", "record.restored"].includes(row.action)) need(r.revision >= 2);
  if (["record.created", "record.updated", "record.restored"].includes(row.action)) need(r.lastEditedBy === row.actor_id);
  for (const stamp of [r.createdAt, r.updatedAt]) need(typeof stamp === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(stamp) && validInstant(stamp));
  let normalized; try { normalized = validateRecord(r.moduleId, r.data, { orgId: org, recordId: r.id, status: r.status, records }); } catch { reconcile(); }
  need(same(normalized, r.data));
  return r;
}
function preserveOrdinaryContactAudit(row, record, chosen) {
  if (!record || row.module_id !== "contacts" || !chosen.has(row.record_id)) return false;
  need(record.data.kind === "person-reference" && record.status === "draft" && record.approval === null && record.snapshot === null && (row.action === "record.created" || record.source === null));
  need(["externalSystem", "externalId", "externalUrl"].every(k => record.data[k] === null));
  return true;
}

/** No decision/clock/ID/receipt is minted; all returned metadata is private. */
export async function readContactReconciliationContext(c, input) {
  return readContext(c, input, false);
}
/** Genuine current/trash data only; accepted-original receipt proof remains the caller duty. */
export async function readContactReconciliationInverseContext(c, input) {
  return readContext(c, input, true);
}
async function readContext(c, input, inverse) {
  const { org, session, leftId, rightId } = exact(input, ["org", "session", "leftId", "rightId"]);
  id(org); id(leftId); id(rightId); need(leftId !== rightId);
  const { member, authority } = await authenticate(c, org, session); await catalog(c);
  const chosen = new Set([leftId, rightId]), maps = { record: new Map(), participation: new Map(), intake: new Map(), group: new Map(), publication: new Map() };
  for (const x of chosen) maps.record.set(x, new Set([x]));
  const pair = new Map(), contacts = new Map(), rowStamps = new Map(), references = new Map(), pins = [], census = [], snapshots = [], recordModules = new Map(), preservedAudits = [], reportDependencies = [], currentRecords = [], contactReports = new Map(), recurrenceReports = new Map();
  const budget = { nodes: 0, decoded: 0, literalModuleData: new WeakMap() }; let totalRows = 0, totalBytes = 0;
  const known = { grants: [], learning: [], history: [] };
  const pushRef = r => {
    const key = stable([r.family, r.id, r.field, r.contactId]);
    if (references.has(key)) return;
    need(references.size < CONTACT_CONTEXT_LIMITS.references, "contact_context_limit", 409); references.set(key, r);
  };
  for (const table of TABLES) {
    const projection = projectFor(table), keyExpr = keyFor(table);
    const a = rows(await c.query(`/*crm:count:${table}*/ SELECT count(*)::text AS n,COALESCE(sum(octet_length((${projection})::text)),0)::text AS bytes FROM ${table} t WHERE t.org_id=$1`, [org]));
    need(a.length === 1); const expected = count(prop(a[0], "n")), bytes = count(prop(a[0], "bytes"));
    totalRows += expected; totalBytes += bytes;
    need(totalRows <= CONTACT_CONTEXT_LIMITS.rows && totalBytes <= CONTACT_CONTEXT_LIMITS.bytes, "contact_context_limit", 409);
    need(expected === 0 || !UNPARSED_PACKETS.includes(table), "contact_context_unsupported", 409);
    let after = null, seen = 0, seenBytes = 0;
    while (seen < expected) {
      const stamps = table === "os_records" ? ",to_char(t.created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_exact,to_char(t.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS updated_exact,to_char(t.deleted_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS deleted_exact" : ["os_reports", "os_learning_history"].includes(table) ? ",to_char(t.created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_exact" + (table === "os_learning_history" ? ",octet_length(t.payload::text) AS payload_bytes,COALESCE(octet_length(t.receipt::text),0) AS receipt_bytes" : "") : table === "os_previews" ? ",to_char(t.created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS preview_created_exact,to_char(t.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS preview_expires_exact,to_char(t.committed_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS preview_committed_exact" : "";
      const page = rows(await c.query(`/*crm:page:${table}*/ SELECT ${keyExpr} AS row_key,(${projection})::text AS row_json${stamps} FROM ${table} t WHERE t.org_id=$1 AND ($2::text IS NULL OR (${keyExpr}) COLLATE "C">$2::text COLLATE "C") ORDER BY (${keyExpr}) COLLATE "C" LIMIT $3`, [org, after, CONTACT_CONTEXT_LIMITS.batch]));
      need(page.length > 0 && page.length <= CONTACT_CONTEXT_LIMITS.batch);
      for (const raw of page) {
        const entry = exact(raw, ["row_key", "row_json", ...(table === "os_records" ? ["created_exact", "updated_exact", "deleted_exact"] : table === "os_reports" ? ["created_exact"] : table === "os_learning_history" ? ["created_exact", "payload_bytes", "receipt_bytes"] : table === "os_previews" ? ["preview_created_exact", "preview_expires_exact", "preview_committed_exact"] : [])]);
        need(typeof entry.row_key === "string" && entry.row_key.length <= 256 && (after === null || entry.row_key > after));
        need(typeof entry.row_json === "string" && Buffer.byteLength(entry.row_json) <= CONTACT_CONTEXT_LIMITS.bytes);
        seenBytes += Buffer.byteLength(entry.row_json); need(seenBytes <= bytes);
        let row; try { row = JSON.parse(entry.row_json); } catch { reconcile(); }
        need(row && row.org_id === org);
        let reportClass = null;
        if (table === "os_reports") {
          try {
            validateGroupExactStamp(entry.created_exact);
            reportClass = classifyReport(row.payload); need(reportClass);
            if (reportClass.kind === 'recurrence') { const admitted=validateRecurringOccurrenceReportRow({...row,created_at:entry.created_exact}); recurrenceReports.set(admitted.id,admitted.payload); }
            if (reportClass.kind === "contact") {
              const report = validateContactReconciliationReportRow({ ...row, created_at: entry.created_exact });
              contactReports.set(report.id, { checksum: report.checksum, operation: report.payload.operation });
            }
          } catch { reconcile(); }
        }
        if (table === "os_previews") {
          if(row.kind===RECURRENCE_PACKET_KIND){try{validateRecurringOccurrencePreviewRow({...row,created_at:entry.preview_created_exact,expires_at:entry.preview_expires_exact,committed_at:entry.preview_committed_exact});}catch{reconcile();}}
          else { need(row.kind === CONTACT_PREVIEW_KIND, "contact_context_unsupported", 409);
          try { validateContactReconciliationPreviewRow(row); } catch { reconcile(); } }
        }
        const pin = H("row", { table, value: row, ...(table === "os_reports" ? { createdAtExact: entry.created_exact }
          : table === "os_learning_history" ? { createdAtExact: entry.created_exact, payloadBytes: entry.payload_bytes, receiptBytes: entry.receipt_bytes } : table === "os_previews" && row.kind === RECURRENCE_PACKET_KIND ? { createdAtExact: entry.preview_created_exact, expiresAtExact: entry.preview_expires_exact, committedAtExact: entry.preview_committed_exact } : {}) }); pins.push([table, entry.row_key, pin]);
        if (reportClass?.kind === "grant-history" || reportClass?.kind === "learning-history") {
          known[reportClass.kind === "grant-history" ? "grants" : "learning"].push({
            entry: { row, createdAtExact: entry.created_exact }, rowKey: entry.row_key, pin });
        }
        if (table === "os_learning_history") known.history.push({ row, createdAtExact: entry.created_exact,
          payloadBytes: entry.payload_bytes, receiptBytes: entry.receipt_bytes });
        if (table === "os_records") {
          need(Object.keys(row).length === CONTACT_CONTEXT_CATALOG.os_records.length && Object.keys(row).every(k => CONTACT_CONTEXT_CATALOG.os_records.includes(k)));
          id(row.id); revision(row.revision); need(typeof row.module_id === "string");
          recordModules.set(row.id, row.module_id);
          currentRecords.push({ id: row.id, orgId: org, moduleId: row.module_id, data: row.data, status: row.status, revision: row.revision });
          const refs = referenceFields(row.data, row.module_id, chosen);
          const linked = new Set(refs.map(x => x.contactId)); if (chosen.has(row.id)) linked.add(row.id); addMap(maps.record, row.id, linked);
          for (const r of refs) pushRef({ family: "record", id: row.id, moduleId: row.module_id, field: r.field, contactId: r.contactId, revision: row.revision, sha256: pin, deleted: row.deleted_at !== null });
          if (row.snapshot !== null) snapshots.push({ value: row.snapshot, id: row.id, revision: row.revision, pin, deleted: row.deleted_at !== null });
          if (row.module_id === "contacts") contacts.set(row.id, { id: row.id, orgId: org, moduleId: "contacts", revision: row.revision, kind: row.data.kind, deletedAt: row.deleted_at });
          if (chosen.has(row.id)) {
            need(row.module_id === "contacts" && row.data.kind === "person-reference" && (inverse || row.deleted_at === null));
            for (const stamp of [entry.created_exact, entry.updated_exact]) { try { validateGroupExactStamp(stamp); } catch { reconcile(); } }
            if (row.deleted_at === null) need(entry.deleted_exact === null);
            else { need(inverse && entry.deleted_exact !== null); try { validateGroupExactStamp(entry.deleted_exact); } catch { reconcile(); } }
            pair.set(row.id, { id: row.id, orgId: org, moduleId: "contacts", revision: row.revision, status: row.status, data: row.data, source: row.source,
              approval: row.approval === null ? null : { sha256: H("approval-value", row.approval) }, snapshot: row.snapshot === null ? null : { sha256: H("snapshot-value", row.snapshot) }, deletedAt: entry.deleted_exact });
            rowStamps.set(row.id, { id: row.id, createdAtExact: entry.created_exact, updatedAtExact: entry.updated_exact, deletedAtExact: entry.deleted_exact, rowSha256: pin });
          }
        } else {
          const jobReferences = table === "os_jobs" ? reminderReferences(row, maps) : null;
          if (table === "os_publications") {
            need(maps.record.has(row.record_id));
            if (row.target_id !== null) need(maps.record.has(row.target_id));
            const linked = union(get(maps.record, row.record_id), get(maps.record, row.target_id)); addMap(maps.publication, row.id, linked);
          }
          if (table === "os_intake") {
            need(maps.publication.has(row.publication_id));
            need(Array.isArray(row.converted_ids));
            for (const raw of row.converted_ids) {
              const x = exact(raw, ["id", "moduleId"]); id(x.id); need(["contacts", "events", "volunteers"].includes(x.moduleId));
              // Missing historical converted rows cannot silently establish no
              // linkage. Current or trash rows must retain the declared module.
              need(recordModules.get(x.id) === x.moduleId);
            }
            // Every tenant intake and publication is read regardless of status
            // or erasure. An own link requires both parents; no staff link-row
            // visibility or equality of the two independent FKs is invented.
            const linked = union(get(maps.publication, row.publication_id), ...row.converted_ids.map(x => get(maps.record, x.id)));
            addMap(maps.intake, row.id, linked);
          }
          if (table === "os_participations") {
            const linked = union(chosen.has(row.contact_id) ? new Set([row.contact_id]) : empty(), get(maps.record, row.booking_record_id), get(maps.intake, row.intake_id));
            addMap(maps.participation, row.id, linked);
          }
          if (table === "os_participation_groups") {
            need(Array.isArray(row.roster_ids)); const linked = union(...row.roster_ids.map(x => get(maps.participation, x)), get(maps.intake, row.coordinator_intake_id), scan(row.history, maps, chosen, budget)); addMap(maps.group, row.id, linked);
          }
          const passiveAudit = table === "os_events" && (passiveContactAudit(row, contactReports) || passiveRecurrenceAudit(row, recurrenceReports));
          const auditRecord = table === "os_events" ? ordinaryRecordAudit(row, org, currentRecords) : null;
          if (auditRecord) budget.literalModuleData.set(auditRecord.data, auditRecord.moduleId);
          const preserved = table === "os_events" && preserveOrdinaryContactAudit(row, auditRecord, chosen);
          if (table === "os_events" && !preserved) {
            const organizationOnly = ["organization.created", "organization.updated"].includes(row.action) && row.record_id === null && row.module_id === null && row.detail && Object.keys(row.detail).length === 0;
            const chosenAuthority = ["record.approved", "record.transitioned"].includes(row.action) && row.module_id === "contacts" && chosen.has(row.record_id);
            // Known record pointers in approval/transition events are blocking,
            // never waived. All other unsupported audit semantics refuse rather
            // than inferring identity from opaque strings, emails or accounts.
            if (!organizationOnly && !auditRecord && !chosenAuthority && !passiveAudit) reconcile();
          }
          if (preserved) preservedAudits.push([entry.row_key, pin, row.record_id]);
          // FIELD's validated mapping/created pins are Programs/Outcomes only.
          // Known CRM previews and linked audit metadata are passive bookkeeping.
          const affected = preserved || passiveAudit || table === "os_previews" || table === "os_learning_history" || ["field", "grant-history", "learning-history"].includes(reportClass?.kind) ? empty()
            : reportClass?.kind === "contact" ? contactReportReferences(reportClass.payload, chosen) : reportClass?.kind === "recurrence" ? recurrenceReportReferences(reportClass.payload, maps, recordModules, org) : jobReferences ?? scan(row, maps, chosen, budget);
          if (table === "os_events" && !preserved && affected.size && ["record.created", "record.updated", "record.deleted", "record.restored"].includes(row.action) && row.module_id === "contacts") reconcile();
          if (table === "os_publications") for (const x of get(maps.publication, row.id)) affected.add(x);
          if (table === "os_intake") for (const x of get(maps.intake, row.id)) affected.add(x);
          if (table === "os_participations") for (const x of get(maps.participation, row.id)) affected.add(x);
          if (table === "os_participation_groups") for (const x of get(maps.group, row.id)) affected.add(x);
          const family = table === "os_intake" || table === "os_publications" ? "intake" : table === "os_participations" ? "participation" : table.startsWith("os_participation_delivery") || table === "os_participation_outbox" || table === "os_jobs" ? "delivery" : "immutable-history";
          const referenceId = H("reference-id", { table, key: entry.row_key });
          for (const contactId of affected) pushRef({ family, id: referenceId, moduleId: null, field: null, contactId, revision: Number.isSafeInteger(row.revision) ? row.revision : null, sha256: pin, deleted: row.erased_at != null || row.revoked_at != null });
          if (table === "os_reports" && affected.size) reportDependencies.push({ referenceId, reportId: row.id, checksum: row.checksum, classification: "frozen-report", contactIds: [...affected].sort() });
        }
        after = entry.row_key; need(++seen <= expected);
      }
    }
    need(seen === expected && seenBytes === bytes); census.push([table, expected, bytes]);
    if (table === "os_records") for (const s of snapshots) for (const contactId of scan(s.value, maps, chosen, budget)) pushRef({ family: "immutable-history", id: H("snapshot-id", s.id), moduleId: null, field: null, contactId, revision: s.revision, sha256: s.pin, deleted: s.deleted });
  }
  const knownHistoryMethodPin = finalizeKnownHistory(known, org, recordModules, maps, chosen, pushRef, reportDependencies);
  need(pair.size === 2);
  const orderedPair = [pair.get(leftId), pair.get(rightId)], organizations = [];
  for (const row of orderedPair) if (row.data.organizationId !== null && !organizations.some(x => x.id === row.data.organizationId)) {
    const linked = contacts.get(row.data.organizationId); need(linked && linked.kind === "organization" && linked.deletedAt === null); organizations.push(linked);
  }
  const recordContext = [...orderedPair, ...organizations.map(x => ({ ...x, data: { kind: x.kind } }))];
  for (const row of orderedPair) {
    let normalized; try { normalized = validateRecord("contacts", row.data, { orgId: org, recordId: row.id, status: row.status, records: recordContext }); } catch { reconcile(); }
    need(same(normalized, row.data));
    if (row.source !== null) {
      const s = exact(row.source, ["integrationId", "externalId", "checksum"]); id(s.integrationId);
      need(typeof s.externalId === "string" && s.externalId.length >= 1 && s.externalId.length <= 160 && typeof s.checksum === "string" && /^[a-f0-9]{64}$/.test(s.checksum));
    }
  }
  const plannerContext = { orgId: org, pair: orderedPair, organizations, references: [...references.values()] };
  const sourceOwnership = orderedPair.map(r => ({ id: r.id, classification: r.source !== null ? "source-owned" : ["externalSystem", "externalId", "externalUrl"].some(k => r.data[k] !== null) ? "external-reference" : r.status !== "draft" || r.approval !== null || r.snapshot !== null ? "non-draft" : "local-draft" }));
  const coverage = { method: "closed-catalog-tenant-pages-v1", enumeratedTables: TABLES, catalogTables: Object.keys(CONTACT_CONTEXT_CATALOG).length,
    ownParticipantLinks: "not-read-own-RLS;mandatory-intake-publication-transitive", unknownFamilyOrLinkage: "refuse", callerOrgLockRequired: true,
    preservedOrdinaryContactCrudAudits: { count: preservedAudits.length, sha256: H("preserved-crud-audits", preservedAudits) },
    unsupportedPacketFamilies: UNPARSED_PACKETS };
  const context = inverse ? { inverseContext: { pair: orderedPair, organizations, references: [...references.values()] } } : { plannerContext };
  return learningOwned({ ...context, authority, rowStamps: [rowStamps.get(leftId), rowStamps.get(rightId)], sourceOwnership, coverage, reportDependencies,
    contextSha256: H("context", { org, authority, pins, census, rowStamps: [rowStamps.get(leftId), rowStamps.get(rightId)], ...(knownHistoryMethodPin === null ? {} : { knownHistoryMethodPin }) }) }, { bytes: 131072 });
}
