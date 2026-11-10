import {validateRecurringOccurrenceManifest,validateRecurringOccurrenceReportRow,validateRecurringOccurrencePreviewRow,RECURRENCE_PACKET_KIND} from './participation-recurrence-packets.mjs';
/** Private SELECT-only candidate. Caller owns the same-c tenant transaction and org lock. */
import { isProxy } from "node:util/types";
import { getModule, validateRecord } from "./modules.mjs";
import { requirePermission } from "./access.mjs";
import { hash, stable } from "./security.mjs";
import { learningOwned } from "./learning-transport.mjs";
import { validateGroupExactStamp } from "./participation-group-model.mjs";
import {
  CONTACT_CONTEXT_CATALOG, CONTACT_RESOURCE_RESERVATION_CATALOG, CONTACT_RESOURCE_RESERVATION_LAYOUT, CONTACT_SUBSTITUTION_CHOICE_CATALOG,
} from "./contact-context-catalog.mjs";
import { RESOURCE_RESERVATION_METHOD } from "./resource-reservation-ledger.mjs";
import { loadResourceReservationInventory } from "./resource-reservation-store.mjs";
import { feedbackPublicationSchema, requireFeedbackPublicationSchema } from "./feedback-intake-model.mjs";
import { feedbackSchemaFromReviewedFormData } from "./feedback-intake-form.mjs";
import { FEEDBACK_CONVERSION_ACTION, feedbackPortableConversionEvent, isWithheldFeedbackDraft } from "./feedback-intake-safety.mjs";
import { feedbackIntakeSchemaReady } from "./feedback-intake-schema.mjs";
import { validateContactReconciliationReport, validateContactReconciliationReportRow } from "./contact-reconciliation-report.mjs";
import { validInstant } from "./schedule.mjs";
import { validateFieldImportManifest } from "./field-response-model.mjs";
import { CONTACT_PREVIEW_KIND, validateContactReconciliationPreviewRow } from "./contact-reconciliation-preview.mjs";
import { validateStoredGrantInventory, GRANT_HISTORY_FIELD_PROFILE_SHA256 } from "./grant-report-history.mjs";
import { validateContactLearningClosure, CONTACT_LEARNING_REFERENCE_PROFILE_SHA256 } from "./contact-known-history.mjs";
import { isVolunteerSubstitutionNativeReport } from "./volunteer-substitution-native.mjs";
import { isVolunteerOrientationMarkerRow, validateVolunteerOrientationMarkerRow } from "./volunteer-orientation-marker.mjs";
import { VOLUNTEER_SUBSTITUTION_OFFER_KIND } from "./volunteer-substitution-offer.mjs";
import { volunteerSubstitutionAccessReady } from "./volunteer-substitution-schema.mjs";
import {
  CONTACT_SUBSTITUTION_AUDIT, CONTACT_SUBSTITUTION_CHOICE_TABLE, CONTACT_SUBSTITUTION_CHOICE_PROJECTION,
  CONTACT_SUBSTITUTION_METHOD, closeContactSubstitutions, collectContactSubstitutionSource, contactSubstitutionAudit,
  contactSubstitutionChoice, contactSubstitutionGraph, contactSubstitutionOffer, contactSubstitutionReport,
  archivedContactSubstitutionRestoreRecords, contactSubstitutionArchive, closeContactSubstitutionRestore,
  isContactSubstitutionRestoreAudit,
} from "./contact-reconciliation-substitution.mjs";

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
const RESOURCE_TABLES = Object.keys(CONTACT_RESOURCE_RESERVATION_CATALOG);
const BASE_CATALOG_SIZE = Object.keys(CONTACT_CONTEXT_CATALOG).length;
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
  [CONTACT_SUBSTITUTION_CHOICE_TABLE]: CONTACT_SUBSTITUTION_CHOICE_PROJECTION,
};
const PAGE_KEYS = {
  os_task_recurrence_occurrences: "t.series_id||':'||t.sequence::text",
  os_participation_group_receipts: "t.command_hash", os_participation_delivery_policies: "t.org_id",
  os_participation_targets: "t.target_id", [CONTACT_SUBSTITUTION_CHOICE_TABLE]: "t.intent_id||':'||t.party",
};
const keyFor = t => PAGE_KEYS[t] ?? "t.id::text";
const projectFor = t => PROJECTION[t] ?? (EXCLUDED_COLUMNS[t]
  ? `jsonb_build_object(${CONTACT_CONTEXT_CATALOG[t].filter(k => !EXCLUDED_COLUMNS[t].includes(k)).map(k => `'${k}',t.${k}`).join(",")})`
  : "to_jsonb(t)");

const FEEDBACK_INTAKE_KEYS = CONTACT_CONTEXT_CATALOG.os_intake.filter(key => !EXCLUDED_COLUMNS.os_intake.includes(key));
const answerLiterals = Object.fromEntries(feedbackPublicationSchema("2000-01-01").questions.map(q =>
  [q.key, q.options.map(value => "'" + value.replaceAll("'", "''") + "'").join(",")]));
// The exact local/inert discriminator and closed choice check never return an answer or hash.
const FEEDBACK_INTAKE_METADATA = `CASE WHEN EXISTS(SELECT 1 FROM os_publications p
    WHERE p.org_id=t.org_id AND p.id=t.publication_id AND p.kind='feedback') THEN
  jsonb_build_object('feedback_check',jsonb_build_object(
    'origin',CASE
      WHEN t.ip_hash IS NULL AND t.idempotency_hash IS NULL AND t.receipt_hash IS NULL AND t.payload_hash IS NULL
        AND t.reviewed_by IS NULL AND t.reviewed_at IS NULL THEN 'inert'
      WHEN t.ip_hash IS NULL AND t.idempotency_hash ~ '^[0-9a-f]{64}$' AND t.receipt_hash ~ '^[0-9a-f]{64}$'
        AND (CASE WHEN t.erased_at IS NULL THEN t.payload_hash ~ '^[0-9a-f]{64}$' ELSE t.payload_hash IS NULL END)
        THEN 'local' ELSE 'invalid' END,
    'answersValid',CASE WHEN t.erased_at IS NOT NULL THEN t.answers='{}'::jsonb
      WHEN jsonb_typeof(t.answers)='object' AND octet_length(t.answers::text)<=512 THEN
        t.answers ?& ARRAY['topic','experience'] AND (t.answers-ARRAY['topic','experience'])='{}'::jsonb
        AND jsonb_typeof(t.answers->'topic')='string' AND jsonb_typeof(t.answers->'experience')='string'
        AND t.answers->>'topic' IN (${answerLiterals.topic}) AND t.answers->>'experience' IN (${answerLiterals.experience})
      ELSE false END))
  ELSE '{}'::jsonb END`;
const storedTime = value => typeof value === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
function admitFeedbackPublication(row, graph, recordModules) {
  exact(row, CONTACT_CONTEXT_CATALOG.os_publications);
  id(row.id); id(row.record_id); id(row.created_by); revision(row.source_revision);
  const hasSource = recordModules.has(row.record_id), withdrawn = row.withdrawn_at !== null;
  if (row.target_id !== null || row.target_module !== null || row.target_revision !== null || !storedTime(row.created_at) ||
      withdrawn && !storedTime(row.withdrawn_at) || hasSource && recordModules.get(row.record_id) !== "forms" ||
      !hasSource && !withdrawn || graph.publications.has(row.id)) reconcile();
  try { requireFeedbackPublicationSchema(row.schema); } catch { reconcile(); }
  graph.publications.set(row.id, { sourceId: row.record_id, sourceRevision: row.source_revision, hasSource, withdrawn, actorId: row.created_by });
  graph.formIds.add(row.record_id);
}
function admitFeedbackIntake(row, publication, graph, recordModules, draftRecords) {
  exact(row, [...FEEDBACK_INTAKE_KEYS, "feedback_check"]);
  const { origin, answersValid } = exact(row.feedback_check, ["origin", "answersValid"]);
  id(row.id); revision(row.revision);
  const local = origin === "local", erased = row.erased_at !== null, status = row.status;
  if (answersValid !== true || !["local", "inert"].includes(origin) || graph.entries.has(row.id) ||
      !["pending", "reviewed", "dismissed", "converted", "cancelled"].includes(status) ||
      ![row.created_at, row.updated_at, row.consent_at].every(storedTime) || erased && !storedTime(row.erased_at) ||
      (status === "cancelled" ? !storedTime(row.cancelled_at) : row.cancelled_at !== null)) reconcile();
  if (row.reviewed_by === null ? row.reviewed_at !== null : !id(row.reviewed_by) || !storedTime(row.reviewed_at)) reconcile();
  if (local ? !publication.hasSource : !publication.withdrawn || ["pending", "reviewed"].includes(status) ||
      row.revision > 1 && !erased) reconcile();
  const links = row.converted_ids;
  if (!Array.isArray(links) || links.length > 1 || status === "converted" && links.length !== 1 ||
      !["converted", "cancelled"].includes(status) && links.length) reconcile();
  if (local && (status === "reviewed" || links.length) && row.reviewed_by === null) reconcile();
  let draftId = null;
  if (links.length) {
    const link = exact(links[0], ["id", "moduleId"]);
    draftId = id(link.id);
    const present = recordModules.has(draftId);
    if (link.moduleId !== "feedback" || graph.draftIds.has(draftId) || local && !present ||
        present && !isWithheldFeedbackDraft(draftRecords.get(draftId))) reconcile();
    graph.draftIds.add(draftId);
  }
  graph.entries.set(row.id, { publicationId: row.publication_id, local, status, revision: row.revision,
    reviewed: row.reviewed_by !== null, erased, draftId });
}
function passiveFeedbackIntakeAudit(row, graph) {
  if (row.action === FEEDBACK_CONVERSION_ACTION) {
    if (!storedTime(row.created_at)) reconcile();
    let event;
    // The raw PG JSON timestamp remains pinned. The portable event reader
    // accepts the corresponding driver Date as the export path would supply it.
    try { event = feedbackPortableConversionEvent({ ...row, created_at: new Date(row.created_at) }, true); }
    catch { reconcile(); }
    const { intakeId, publicationId, sourceRevision, submissionRevision } = event.detail;
    const intake = graph.entries.get(intakeId), publication = graph.publications.get(publicationId);
    if (!Object.hasOwn(row.detail, "requestSha256") || !Object.hasOwn(row.detail, "authoritySha256") ||
        !intake?.local || intake.publicationId !== publicationId || intake.draftId !== row.record_id ||
        publication?.sourceRevision !== sourceRevision || intake.revision < submissionRevision ||
        !["converted", "cancelled"].includes(intake.status) || graph.receipts.has(intakeId)) reconcile();
    graph.receipts.add(intakeId);
    return true;
  }
  if (["intake.published", "intake.publication.withdrawn"].includes(row.action)) {
    const publication = graph.publications.get(row.detail?.publicationId);
    if (!publication) return false;
    exact(row, CONTACT_CONTEXT_CATALOG.os_events); id(row.actor_id);
    if (row.action === "intake.published") {
      const detail = exact(row.detail, ["publicationId", "kind", "targetId"]);
      if (!publication.hasSource || publication.actorId !== row.actor_id || row.record_id !== publication.sourceId ||
          row.module_id !== "forms" || detail.kind !== "feedback" || detail.targetId !== null) reconcile();
    } else {
      exact(row.detail, ["publicationId"]);
      if (!publication.withdrawn || row.record_id !== null || row.module_id !== null) reconcile();
    }
    return true;
  }
  if (!["intake.received", "intake.reviewed", "intake.dismissed", "intake.cancelled", "intake.erased"].includes(row.action)) return false;
  const intake = graph.entries.get(row.detail?.intakeId);
  if (!intake) return false;
  exact(row, CONTACT_CONTEXT_CATALOG.os_events); id(row.actor_id);
  if (row.record_id !== null || row.module_id !== null) reconcile();
  if (row.action === "intake.received") {
    const detail = exact(row.detail, ["intakeId", "publicationId"]);
    if (!intake.local || row.actor_id !== "public-intake" || detail.publicationId !== intake.publicationId) reconcile();
  } else if (["intake.reviewed", "intake.dismissed"].includes(row.action)) {
    const detail = exact(row.detail, ["intakeId", "publicationId", "recordIds"]);
    if (!intake.local || !intake.reviewed || intake.revision < 2 || detail.publicationId !== intake.publicationId ||
        !Array.isArray(detail.recordIds) || detail.recordIds.length) reconcile();
  } else {
    const detail = exact(row.detail, ["intakeId", "converted"]);
    if (detail.converted !== Boolean(intake.draftId) || intake.revision < 2 || (row.action === "intake.erased" ? !intake.erased
      : !intake.local || intake.status !== "cancelled" || row.actor_id !== "public-intake")) reconcile();
  }
  return true;
}

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
const RESOURCE_LAYOUT_SQL = `/*crm:reservation-layout*/
  SELECT t.relname AS table_name,t.relkind::text AS relation_kind,
    t.relrowsecurity AS rls,t.relforcerowsecurity AS forced_rls,
    (SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
      a.attgenerated::text,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
    (SELECT jsonb_agg(jsonb_build_array(pg_get_constraintdef(k.oid),k.convalidated,
      COALESCE(parent.relnamespace=t.relnamespace,true)) ORDER BY pg_get_constraintdef(k.oid) COLLATE "C")
      FROM pg_constraint k LEFT JOIN pg_class parent ON parent.oid=k.confrelid
      WHERE k.conrelid=t.oid AND k.contype IN ('p','f')) AS keys,
    (SELECT jsonb_agg(jsonb_build_array(p.polname,p.polcmd::text,p.polpermissive,p.polroles::text,
      pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname COLLATE "C")
      FROM pg_policy p WHERE p.polrelid=t.oid) AS policies,
    (SELECT jsonb_agg(jsonb_build_array(g.tgname,g.tgtype,g.tgenabled::text,g.tginitdeferred,g.tgdeferrable,
      f.proname,f.pronamespace=t.relnamespace) ORDER BY g.tgname COLLATE "C")
      FROM pg_trigger g JOIN pg_proc f ON f.oid=g.tgfoid WHERE g.tgrelid=t.oid AND NOT g.tgisinternal) AS triggers
  FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname=current_schema() AND t.relname=ANY($1::text[])
  ORDER BY t.relname COLLATE "C" LIMIT 3`;
async function catalog(c) {
  const found = rows(await c.query("/*crm:catalog*/ SELECT t.relname AS table_name,array_agg(a.attname::text ORDER BY a.attnum) AS columns FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped WHERE n.nspname=current_schema() AND t.relkind IN ('r','p') AND t.relname LIKE 'os\\_%' ESCAPE '\\' GROUP BY t.relname ORDER BY t.relname COLLATE \"C\"", []));
  const entries = found.map(value => exact(value, ["table_name", "columns"]));
  const hasSubstitutions = entries.some(r => r.table_name === CONTACT_SUBSTITUTION_CHOICE_TABLE);
  const baseSize = found.length - Number(hasSubstitutions);
  const hasResources = baseSize === BASE_CATALOG_SIZE + RESOURCE_TABLES.length;
  need(hasResources || baseSize === BASE_CATALOG_SIZE);
  const vector = { ...CONTACT_CONTEXT_CATALOG, ...(hasResources ? CONTACT_RESOURCE_RESERVATION_CATALOG : {}),
    ...(hasSubstitutions ? { [CONTACT_SUBSTITUTION_CHOICE_TABLE]: CONTACT_SUBSTITUTION_CHOICE_CATALOG } : {}) };
  const names = new Set();
  for (const r of entries) {
    need(!names.has(r.table_name) && Object.hasOwn(vector, r.table_name));
    need(Array.isArray(r.columns) && same([...r.columns].sort(), [...vector[r.table_name]].sort()));
    names.add(r.table_name);
  }
  if (hasResources) {
    const resource = rows(await c.query(RESOURCE_LAYOUT_SQL, [RESOURCE_TABLES]));
    need(resource.length === RESOURCE_TABLES.length);
    for (let i = 0; i < RESOURCE_TABLES.length; i++) {
      const expected = CONTACT_RESOURCE_RESERVATION_LAYOUT[RESOURCE_TABLES[i]];
      need(same(exact(resource[i], Object.keys(expected)), expected));
    }
  }
  if (hasSubstitutions) {
    try { if (!await volunteerSubstitutionAccessReady(c)) reconcile(); }
    catch { reconcile(); }
  }
  const fks = rows(await c.query("/*crm:link-fks*/ SELECT c.confrelid::regclass::text AS parent,array(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(attnum,n) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum ORDER BY k.n) AS child_columns,array(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(attnum,n) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum ORDER BY k.n) AS parent_columns,c.convalidated AS validated,c.confdeltype::text AS delete_type,c.confupdtype::text AS update_type FROM pg_constraint c WHERE c.conrelid='os_participant_links'::regclass AND c.contype='f' ORDER BY c.confrelid::regclass::text", []));
  need(fks.length === 3);
  for (const [parent, child, target] of [["os_orgs", ["org_id"], ["id"]], ["os_intake", ["org_id", "intake_id"], ["org_id", "id"]], ["os_publications", ["org_id", "publication_id"], ["org_id", "id"]]]) {
    need(fks.filter(f => f.parent === parent && same(f.child_columns, child) && same(f.parent_columns, target) && f.validated === true && f.delete_type === "a" && f.update_type === "a").length === 1);
  }
  return { hasResources, hasSubstitutions };
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
async function readReservationHistory(c, org, enabled) {
  if (!enabled) return null;
  try { return await loadResourceReservationInventory(c, org); }
  catch { reconcile(); }
}
function reservationSourceProof(row) { return row.proof ?? row.history.proof; }
function requireReservationSources(reservations, records, chosen) {
  for (const row of reservations.values()) {
    const proof = reservationSourceProof(row);
    const asset = records.get(proof.asset.id), session = records.get(proof.session.id);
    for (const [record, pin] of [[asset, proof.asset], [session, proof.session]]) {
      if (!record || chosen.has(pin.id) || record.moduleId !== pin.moduleId ||
          row.originMode === "live" && record.createdAtExact !== pin.createdAtExact) reconcile();
    }
    if (row.originMode === "live" && row.state === "reserved") {
      const { startAt, endAt, timeZone } = session.data;
      if (asset.trashed || session.trashed || asset.data.kind !== "asset" || asset.data.quantity !== 1 ||
          session.data.kind !== "session" || !same({ startAt, endAt, timeZone }, proof.interval)) reconcile();
    }
  }
}
function passiveReservationAudit(row, reservations, seen) {
  if (!["resource-reservation.reserved", "resource-reservation.replaced"].includes(row.action)) return false;
  exact(row, CONTACT_CONTEXT_CATALOG.os_events);
  const detail = exact(row.detail, ["previousId", "reservationId", "assetId", "proofSha256", "acceptedAtExact"]);
  const hold = reservations.get(detail.reservationId);
  const decision = hold?.originalReceipt?.decision;
  const actorSha256 = hash({ method: RESOURCE_RESERVATION_METHOD, kind: "actor",
    value: { orgId: row.org_id, actorId: id(row.actor_id) } });
  need(hold?.originMode === "live" && decision && decision.orgId === row.org_id &&
    decision.operation === (row.action === "resource-reservation.reserved" ? "reserve" : "replace") &&
    decision.actorSha256 === actorSha256 && !seen.has(hold.id) && row.module_id === "events" &&
    row.record_id === hold.proof.session.id && same(detail, {
      previousId: decision.previous?.id ?? null, reservationId: hold.id, assetId: hold.proof.asset.id,
      proofSha256: decision.next.proofSha256, acceptedAtExact: decision.acceptedAtExact,
    }), "contact_context_reconcile", 409);
  seen.add(hold.id);
  return true;
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
  return admitAuditRecord(row, row.detail.record, org, records);
}
function admitAuditRecord(row, r, org, records) {
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
function requireFixedFeedbackForm(data) {
  try { feedbackSchemaFromReviewedFormData(data); } catch { reconcile(); }
}
function passiveFeedbackFormAudit(row, graph, recordModules, org, records) {
  const approved = row.action === "record.approved";
  if ((!approved && row.action !== "record.transitioned") || row.module_id !== "forms" ||
      !graph.formIds.has(row.record_id)) return false;
  if (recordModules.get(row.record_id) !== "forms") reconcile();
  exact(row, CONTACT_CONTEXT_CATALOG.os_events);
  const detail = exact(row.detail, approved ? ["record"] : ["record", "reason"]);
  const r = admitAuditRecord(row, detail.record, org, records);
  requireFixedFeedbackForm(r.data);
  if (r.revision < 2 || !approved && (typeof detail.reason !== "string" || detail.reason.length > 2000)) reconcile();
  if (approved && (!r.approval || !r.snapshot)) reconcile();
  if (r.approval !== null) {
    const approval = exact(r.approval, ["status", "revision", "actorId", "reason", "at"]);
    id(approval.actorId);
    if (approval.status !== "approved" || approval.revision !== r.revision || !validInstant(approval.at) ||
        typeof approval.reason !== "string" || !approval.reason.trim() || approval.reason.length > 2000 ||
        approved && (approval.actorId !== row.actor_id || approval.actorId === r.lastEditedBy)) reconcile();
  }
  if (r.snapshot !== null) {
    const snapshot = exact(r.snapshot, ["id", "orgId", "moduleId", "data", "status", "ownerId", "revision", "createdAt", "updatedAt", "files"]);
    id(snapshot.ownerId); revision(snapshot.revision);
    if (snapshot.id !== r.id || snapshot.orgId !== org || snapshot.moduleId !== "forms" ||
        snapshot.revision > r.revision || !Array.isArray(snapshot.files) || snapshot.files.length ||
        !validInstant(snapshot.createdAt) || !validInstant(snapshot.updatedAt) ||
        !getModule("forms").workflow.states.some(state => state.id === snapshot.status) ||
        approved && (snapshot.revision !== r.revision || snapshot.status !== r.status || !same(snapshot.data, r.data))) reconcile();
    requireFixedFeedbackForm(snapshot.data);
    let checked;
    try { checked = validateRecord("forms", snapshot.data, { orgId: org, recordId: r.id, status: snapshot.status, records }); }
    catch { reconcile(); }
    if (!same(checked, snapshot.data)) reconcile();
  }
  return true;
}
function preserveOrdinaryContactAudit(row, record, chosen) {
  if (!record || row.module_id !== "contacts" || !chosen.has(row.record_id)) return false;
  need(record.data.kind === "person-reference" && record.status === "draft" && record.approval === null && record.snapshot === null && (row.action === "record.created" || record.source === null));
  need(["externalSystem", "externalId", "externalUrl"].every(k => record.data[k] === null));
  return true;
}
function archivedSubstitutionReferences(archive, chosen, maps, budget, recordModules) {
  const { originalRecords: originals, originalEvents, sourceOrgId } = archive.value;
  const affected = new Set();
  const add = value => { for (const contactId of value) affected.add(contactId); };
  const readRecord = (record, contactCrud = false) => {
    need(record.orgId === sourceOrgId && recordModules.get(record.id) === record.moduleId);
    add(referenceFields(record.data, record.moduleId, chosen).map(ref => ref.contactId));
    if (record.moduleId === "contacts" && chosen.has(record.id) && !contactCrud &&
        (record.approval !== null || record.snapshot !== null || record.source != null)) affected.add(record.id);
    if (record.snapshot !== null) add(scan(record.snapshot, maps, chosen, budget));
  };
  for (const raw of originals) readRecord(exact(raw, [
    "id", "orgId", "moduleId", "data", "status", "ownerId", "lastEditedBy", "revision", "approval",
    "snapshot", "source", "createdAt", "updatedAt",
  ]));
  for (const record of archivedContactSubstitutionRestoreRecords(archive.value)) readRecord(record);
  for (const event of originalEvents) {
    const row = exact(event, CONTACT_CONTEXT_CATALOG.os_events);
    need(row.org_id === sourceOrgId && storedTime(row.created_at));
    if (isContactSubstitutionRestoreAudit(row)) continue;
    if (["organization.created", "organization.updated"].includes(row.action)) {
      need(row.record_id === null && row.module_id === null); exact(row.detail, []); continue;
    }
    const record = ordinaryRecordAudit(row, sourceOrgId, originals);
    need(record);
    const kept = preserveOrdinaryContactAudit(row, record, chosen);
    readRecord(record, kept);
  }
  return [...affected];
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
  const { member, authority } = await authenticate(c, org, session);
  const { hasResources, hasSubstitutions } = await catalog(c);
  const reservationInventory = await readReservationHistory(c, org, hasResources);
  const reservations = new Map((reservationInventory?.rows ?? []).map(row => [row.id, row]));
  const reservationSourceIds = new Set([...reservations.values()].flatMap(row => {
    const { asset, session } = reservationSourceProof(row);
    return [asset.id, session.id];
  }));
  const reservationSources = new Map(), reservationAudits = new Set();
  const feedback = { publications: new Map(), entries: new Map(), formIds: new Set(), draftIds: new Set(), receipts: new Set() };
  const feedbackDraftRecords = new Map();
  const substitution = contactSubstitutionGraph();
  const chosen = new Set([leftId, rightId]), maps = { record: new Map(), participation: new Map(), intake: new Map(), group: new Map(), publication: new Map() };
  for (const x of chosen) maps.record.set(x, new Set([x]));
  const pair = new Map(), contacts = new Map(), rowStamps = new Map(), references = new Map(), pins = [], census = [], snapshots = [], recordModules = new Map(), preservedAudits = [], reportDependencies = [], currentRecords = [], contactReports = new Map(), recurrenceReports = new Map();
  const budget = { nodes: 0, decoded: 0, literalModuleData: new WeakMap() };
  let totalRows = reservationInventory ? reservationInventory.quota.reservations + reservationInventory.quota.commands : 0;
  let totalBytes = reservationInventory?.quota.bytes ?? 0;
  const known = { grants: [], learning: [], history: [] };
  const pushRef = r => {
    const key = stable([r.family, r.id, r.field, r.contactId]);
    if (references.has(key)) return;
    need(references.size < CONTACT_CONTEXT_LIMITS.references, "contact_context_limit", 409); references.set(key, r);
  };
  const tables = hasSubstitutions ? [...TABLES, CONTACT_SUBSTITUTION_CHOICE_TABLE] : TABLES;
  for (const table of tables) {
    const feedbackIntake = table === "os_intake" && feedback.publications.size > 0;
    if (feedbackIntake && !(await feedbackIntakeSchemaReady(c))) reconcile();
    const projection = feedbackIntake ? projectFor(table) + " || " + FEEDBACK_INTAKE_METADATA : projectFor(table);
    const keyExpr = keyFor(table);
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
        let substitutionRow = null;
        if (table === "os_reports") {
          try {
            validateGroupExactStamp(entry.created_exact);
            if (isVolunteerSubstitutionNativeReport(row)) {
              exact(row, CONTACT_CONTEXT_CATALOG.os_reports);
              const value = contactSubstitutionReport(row, entry.row_key, entry.created_exact);
              need(hasSubstitutions || value.source === "recovered");
              substitutionRow = { family: "reports", value };
            } else if (isVolunteerOrientationMarkerRow(row)) {
              exact(row, CONTACT_CONTEXT_CATALOG.os_reports);
              const { marker } = validateVolunteerOrientationMarkerRow(row, org);
              const shift = currentRecords.find((record) => record.id === marker.targetId);
              const program = currentRecords.find((record) => record.id === marker.programId);
              need(shift?.moduleId === "volunteers" && shift.data.kind === "shift" &&
                shift.data.programId === marker.programId && program?.moduleId === "programs" &&
                program.data.kind === "program");
              reportClass = { kind: "orientation" };
            } else { reportClass = classifyReport(row.payload); need(reportClass); }
            if (reportClass?.kind === 'recurrence') { const admitted=validateRecurringOccurrenceReportRow({...row,created_at:entry.created_exact}); recurrenceReports.set(admitted.id,admitted.payload); }
            if (reportClass?.kind === "contact") {
              const report = validateContactReconciliationReportRow({ ...row, created_at: entry.created_exact });
              contactReports.set(report.id, { checksum: report.checksum, operation: report.payload.operation });
            }
          } catch { reconcile(); }
        }
        if (table === "os_previews") {
          if(row.kind===RECURRENCE_PACKET_KIND){try{validateRecurringOccurrencePreviewRow({...row,created_at:entry.preview_created_exact,expires_at:entry.preview_expires_exact,committed_at:entry.preview_committed_exact});}catch{reconcile();}}
          else if ((row.kind === VOLUNTEER_SUBSTITUTION_OFFER_KIND && hasSubstitutions) ||
              (row.kind === "backup" && row.payload?.volunteerSubstitutions !== undefined)) {
            try {
              exact(row, CONTACT_CONTEXT_CATALOG.os_previews);
              const archive = row.kind === "backup";
              const parse = archive ? contactSubstitutionArchive : contactSubstitutionOffer;
              substitutionRow = { family: archive ? "archives" : "offers", value: parse(row, entry.row_key, {
                created: entry.preview_created_exact, expires: entry.preview_expires_exact, committed: entry.preview_committed_exact,
              }) };
            } catch { reconcile(); }
          }
          else { need(row.kind === CONTACT_PREVIEW_KIND, "contact_context_unsupported", 409);
          try { validateContactReconciliationPreviewRow(row); } catch { reconcile(); } }
        }
        if (table === CONTACT_SUBSTITUTION_CHOICE_TABLE) {
          try { substitutionRow = { family: "choices", value: contactSubstitutionChoice(row, entry.row_key) }; }
          catch { reconcile(); }
        }
        if (table === "os_events" && row.action === CONTACT_SUBSTITUTION_AUDIT) {
          try {
            need(hasSubstitutions); exact(row, CONTACT_CONTEXT_CATALOG.os_events);
            substitutionRow = { family: "audits", value: contactSubstitutionAudit(row) };
          } catch { reconcile(); }
        }
        if (table === "os_events" && isContactSubstitutionRestoreAudit(row)) {
          try { exact(row, CONTACT_CONTEXT_CATALOG.os_events); }
          catch { reconcile(); }
          substitutionRow = { family: "restoreAudits", value: row };
        }
        const pin = H("row", { table, value: row, ...(table === "os_reports" ? { createdAtExact: entry.created_exact }
          : table === "os_learning_history" ? { createdAtExact: entry.created_exact, payloadBytes: entry.payload_bytes, receiptBytes: entry.receipt_bytes } : table === "os_previews" && (row.kind === RECURRENCE_PACKET_KIND || substitutionRow) ? { createdAtExact: entry.preview_created_exact, expiresAtExact: entry.preview_expires_exact, committedAtExact: entry.preview_committed_exact } : {}) }); pins.push([table, entry.row_key, pin]);
        if (substitutionRow) {
          const { family, value } = substitutionRow;
          substitution[family].push({ table, rowKey: entry.row_key, pin, value,
            reportId: table === "os_reports" ? row.id : null, checksum: table === "os_reports" ? row.checksum : null });
          after = entry.row_key; need(++seen <= expected);
          continue;
        }
        if (hasSubstitutions || substitution.reports.length) collectContactSubstitutionSource(substitution, table, row);
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
          if (row.module_id === "feedback") feedbackDraftRecords.set(row.id, {
            id: row.id, moduleId: row.module_id, status: row.status, data: row.data, snapshot: row.snapshot,
          });
          if (reservationSourceIds.has(row.id)) {
            need(!reservationSources.has(row.id));
            reservationSources.set(row.id, { moduleId: row.module_id, createdAtExact: entry.created_exact,
              trashed: row.deleted_at !== null, data: row.data });
          }
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
          let passiveFeedbackRow = false;
          if (table === "os_publications") {
            if (row.kind === "feedback") {
              admitFeedbackPublication(row, feedback, recordModules);
              addMap(maps.publication, row.id, empty());
              passiveFeedbackRow = true;
            } else {
              need(maps.record.has(row.record_id));
              if (row.target_id !== null) need(maps.record.has(row.target_id));
              addMap(maps.publication, row.id, union(get(maps.record, row.record_id), get(maps.record, row.target_id)));
            }
          }
          if (table === "os_intake") {
            need(maps.publication.has(row.publication_id));
            const publication = feedback.publications.get(row.publication_id);
            if (publication) {
              admitFeedbackIntake(row, publication, feedback, recordModules, feedbackDraftRecords);
              addMap(maps.intake, row.id, empty());
              passiveFeedbackRow = true;
            } else {
              need(Array.isArray(row.converted_ids));
              for (const raw of row.converted_ids) {
                const x = exact(raw, ["id", "moduleId"]); id(x.id); need(["contacts", "events", "volunteers"].includes(x.moduleId));
                // Legacy current and trash links must retain the declared module.
                need(recordModules.get(x.id) === x.moduleId);
              }
              // The complete tenant graph includes erased and closed intake.
              const linked = union(get(maps.publication, row.publication_id), ...row.converted_ids.map(x => get(maps.record, x.id)));
              addMap(maps.intake, row.id, linked);
            }
          }
          if (table === "os_participations") {
            const linked = union(chosen.has(row.contact_id) ? new Set([row.contact_id]) : empty(), get(maps.record, row.booking_record_id), get(maps.intake, row.intake_id));
            addMap(maps.participation, row.id, linked);
          }
          if (table === "os_participation_groups") {
            need(Array.isArray(row.roster_ids)); const linked = union(...row.roster_ids.map(x => get(maps.participation, x)), get(maps.intake, row.coordinator_intake_id), scan(row.history, maps, chosen, budget)); addMap(maps.group, row.id, linked);
          }
          const passiveAudit = table === "os_events" && (passiveContactAudit(row, contactReports) ||
            passiveRecurrenceAudit(row, recurrenceReports) || passiveReservationAudit(row, reservations, reservationAudits) ||
            passiveFeedbackIntakeAudit(row, feedback) || passiveFeedbackFormAudit(row, feedback, recordModules, org, currentRecords));
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
          const affected = preserved || passiveAudit || passiveFeedbackRow || table === "os_previews" || table === "os_learning_history" || ["field", "grant-history", "learning-history", "orientation"].includes(reportClass?.kind) ? empty()
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
    need(seen === expected && seenBytes === bytes);
    if (table !== CONTACT_SUBSTITUTION_CHOICE_TABLE || expected > 0) census.push([table, expected, bytes]);
    if (table === "os_records") {
      requireReservationSources(reservations, reservationSources, chosen);
      for (const s of snapshots) for (const contactId of scan(s.value, maps, chosen, budget)) pushRef({ family: "immutable-history", id: H("snapshot-id", s.id), moduleId: null, field: null, contactId, revision: s.revision, sha256: s.pin, deleted: s.deleted });
    }
  }
  for (const [intakeId, entry] of feedback.entries)
    if (entry.local && entry.draftId && !feedback.receipts.has(intakeId)) reconcile();
  const feedbackMethodPin = feedback.publications.size ? H("feedback-context-method", "feedback-typed-links-v1") : null;
  const knownHistoryMethodPin = finalizeKnownHistory(known, org, recordModules, maps, chosen, pushRef, reportDependencies);
  let substitutionReferences;
  try {
    substitutionReferences = closeContactSubstitutions(substitution, currentRecords);
    const archive = closeContactSubstitutionRestore(substitution.archives, substitution.restoreAudits, substitution.reports);
    if (archive) substitutionReferences.push({ ...archive,
      contactIds: archivedSubstitutionReferences(archive, chosen, maps, budget, recordModules) });
  } catch { reconcile(); }
  for (const entry of substitutionReferences ?? []) {
    const referenceId = H("reference-id", { table: entry.table, key: entry.rowKey });
    const affected = entry.contactIds.filter(id => chosen.has(id)).sort();
    for (const contactId of affected) pushRef({ family: "immutable-history", id: referenceId, moduleId: null,
      field: null, contactId, revision: null, sha256: entry.pin, deleted: false });
    if (entry.reportId && affected.length) reportDependencies.push({ referenceId, reportId: entry.reportId,
      checksum: entry.checksum, classification: "frozen-report", contactIds: affected });
  }
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
  const resourceInventoryPin = reservations.size ? H("resource-reservation-inventory-v1", reservationInventory) : null;
  const choicesPresent = substitution.choices.length > 0;
  const additionalTables = [...(resourceInventoryPin ? RESOURCE_TABLES : []), ...(choicesPresent ? [CONTACT_SUBSTITUTION_CHOICE_TABLE] : [])];
  const coverage = { method: "closed-catalog-tenant-pages-v1", enumeratedTables: additionalTables.length ? [...TABLES, ...additionalTables] : TABLES,
    catalogTables: BASE_CATALOG_SIZE + additionalTables.length,
    ownParticipantLinks: "not-read-own-RLS;mandatory-intake-publication-transitive", unknownFamilyOrLinkage: "refuse", callerOrgLockRequired: true,
    preservedOrdinaryContactCrudAudits: { count: preservedAudits.length, sha256: H("preserved-crud-audits", preservedAudits) },
    unsupportedPacketFamilies: UNPARSED_PACKETS };
  const context = inverse ? { inverseContext: { pair: orderedPair, organizations, references: [...references.values()] } } : { plannerContext };
  return learningOwned({ ...context, authority, rowStamps: [rowStamps.get(leftId), rowStamps.get(rightId)], sourceOwnership, coverage, reportDependencies,
    contextSha256: H("context", { org, authority, pins, census, rowStamps: [rowStamps.get(leftId), rowStamps.get(rightId)],
      ...(knownHistoryMethodPin === null ? {} : { knownHistoryMethodPin }), ...(resourceInventoryPin === null ? {} : { resourceInventoryPin }),
      ...(feedbackMethodPin === null ? {} : { feedbackMethodPin }),
      ...(substitutionReferences === null ? {} : { substitutionMethodPin: H("substitution-context-method", CONTACT_SUBSTITUTION_METHOD) }) }) }, { bytes: 131072 });
}
