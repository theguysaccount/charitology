/** Private IO-free proposal only. Input data establishes no current authority. */
import { isProxy } from "node:util/types";
import { learningOwned } from "./learning-transport.mjs";
import { hash, stable } from "./security.mjs";
import { getModule, validateRecord } from "./modules.mjs";

export const CONTACT_RECONCILIATION_METHOD = "contact-reconciliation-plan-v1";
export const CONTACT_RECONCILIATION_LIMITS = Object.freeze({ inputBytes: 131072, references: 128, reason: 500 });
const ID = /^[A-Za-z0-9_-]{1,100}$/, SHA = /^[a-f0-9]{64}$/;
const ROW = ["id", "orgId", "moduleId", "revision", "status", "data", "source", "approval", "snapshot", "deletedAt"];
const ORGANIZATION = ["id", "orgId", "moduleId", "revision", "kind", "deletedAt"];
const REFERENCE = ["family", "id", "moduleId", "field", "contactId", "revision", "sha256", "deleted"];
const FAMILIES = ["record", "intake", "participation", "delivery", "immutable-history"];
const SEPARATE = ["distinct-people", "same-person-kept-separate", "shared-household-distinct-people", "separate-role-records", "unresolved"];
const BASES = ["record-comparison", "recorded-direct-confirmation", "existing-document", "unknown"];
const SELECTED = ["title", "displayLabel", "email"];
const PROTECTED = ["organizationId", "relationship", "contactPreference", "purpose", "reviewDate"];
const EXTERNAL = ["externalSystem", "externalId", "externalUrl"];
const contactModule = getModule("contacts");
const DATA_KEYS = contactModule.fields.map(f => f.key);
export class ContactReconciliationError extends Error {
  constructor(code = "contact_reconciliation_fields") {
    super("Use the exact bounded contact comparison and explicit choices.");
    this.name = "ContactReconciliationError"; this.status = 422; this.code = code;
  }
}
const need = (value, code) => { if (!value) throw new ContactReconciliationError(code); };
const exact = (value, keys) => need(value && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)));
const id = value => need(typeof value === "string" && ID.test(value));
const revision = value => need(Number.isSafeInteger(value) && value >= 1 && value <= 2147483647);
const same = (a, b) => stable(a) === stable(b);
const sealHash = (kind, value) => hash({ method: CONTACT_RECONCILIATION_METHOD, kind, value });
const owned = value => {
  // Descriptor admission precedes the unchanged shared JSON canonicalizer.
  // Contacts permits newlines; a group-specific all-controls ban would wrongly
  // reject ordinary purpose text. No getters, proxies or inherited data run.
  const active = new Set(); let nodes = 0;
  const visit = (v, depth) => {
    need(++nodes <= 10000 && depth <= 24);
    if (v === null || typeof v === "boolean") return;
    if (typeof v === "string") { need(v.length <= CONTACT_RECONCILIATION_LIMITS.inputBytes); return; }
    if (typeof v === "number") { need(Number.isFinite(v)); return; }
    need(v && typeof v === "object" && !isProxy(v) && !active.has(v));
    const array = Array.isArray(v), proto = Object.getPrototypeOf(v);
    need(array ? proto === Array.prototype : proto === Object.prototype);
    const keys = Reflect.ownKeys(v); need(keys.every(k => typeof k === "string"));
    let ordered = keys;
    if (array) {
      const d = Object.getOwnPropertyDescriptor(v, "length");
      need(d && Object.hasOwn(d, "value") && Number.isSafeInteger(d.value) && d.value >= 0 && d.value <= 256);
      ordered = Array.from({ length: d.value }, (_, i) => String(i));
      const indices = new Set(ordered); need(keys.length === ordered.length + 1 && keys.every(k => k === "length" || indices.has(k)));
    } else need(keys.length <= 64);
    active.add(v);
    for (const key of ordered) {
      const d = Object.getOwnPropertyDescriptor(v, key); need(d?.enumerable && Object.hasOwn(d, "value")); visit(d.value, depth + 1);
    }
    active.delete(v);
  };
  try { visit(value, 0); return learningOwned(value, { bytes: CONTACT_RECONCILIATION_LIMITS.inputBytes }); }
  catch { throw new ContactReconciliationError("contact_reconciliation_owned"); }
};
function source(value) {
  if (value === null) return;
  exact(value, ["integrationId", "externalId", "checksum"]); id(value.integrationId);
  need(typeof value.externalId === "string" && value.externalId.length >= 1 && value.externalId.length <= 160);
  need(typeof value.checksum === "string" && SHA.test(value.checksum));
}
function decision(value) {
  need(value && !Array.isArray(value));
  const merge = value.operation === "merge";
  exact(value, merge ? ["operation", "survivorId", "fields", "basis", "reason"] : ["operation", "assertion", "basis", "reason"]);
  need(BASES.includes(value.basis));
  need(typeof value.reason === "string" && !!value.reason.trim() && value.reason.length <= CONTACT_RECONCILIATION_LIMITS.reason);
  if (merge) {
    id(value.survivorId); exact(value.fields, SELECTED);
    need(["left", "right"].includes(value.fields.title));
    for (const f of SELECTED.slice(1)) need(["left", "right", "unknown"].includes(value.fields[f]));
  } else need(value.operation === "no-merge" && SEPARATE.includes(value.assertion));
}
function checkedContext(v) {
  exact(v, ["orgId", "pair", "organizations", "references", "decision"]); id(v.orgId);
  need(Array.isArray(v.pair) && v.pair.length === 2 && Array.isArray(v.organizations) && v.organizations.length <= 2);
  need(Array.isArray(v.references) && v.references.length <= CONTACT_RECONCILIATION_LIMITS.references, "contact_reconciliation_limit");
  const seen = new Set();
  for (const r of v.pair) {
    exact(r, ROW); id(r.id); need(!seen.has(r.id)); seen.add(r.id); id(r.orgId);
    need(r.orgId === v.orgId && r.moduleId === "contacts" && r.deletedAt === null);
    revision(r.revision); need(contactModule.workflow.states.some(x => x.id === r.status)); source(r.source);
    exact(r.data, DATA_KEYS); need(r.data.kind === "person-reference");
    need(r.approval === null || typeof r.approval === "object" && !Array.isArray(r.approval));
    need(r.snapshot === null || typeof r.snapshot === "object" && !Array.isArray(r.snapshot));
  }
  const related = [];
  for (const r of v.organizations) {
    exact(r, ORGANIZATION); id(r.id); revision(r.revision);
    need(!seen.has(r.id) && r.orgId === v.orgId && r.moduleId === "contacts" && r.kind === "organization" && r.deletedAt === null);
    seen.add(r.id);
    // This is an explicitly supplied current typed reference projection, not a
    // generated record, account or assertion that the caller has access.
    related.push({ id: r.id, orgId: r.orgId, moduleId: r.moduleId, data: { kind: r.kind } });
  }
  const records = [...v.pair, ...related];
  for (const r of v.pair) {
    let normalized;
    try { normalized = validateRecord("contacts", r.data, { orgId: v.orgId, recordId: r.id, status: r.status, records }); }
    catch { throw new ContactReconciliationError("contact_reconciliation_contact"); }
    need(same(normalized, r.data), "contact_reconciliation_contact");
    if (r.data.organizationId !== null) need(v.organizations.some(o => o.id === r.data.organizationId));
  }
  const pairIds = new Set(v.pair.map(r => r.id)), refs = new Set();
  for (const r of v.references) {
    exact(r, REFERENCE); need(FAMILIES.includes(r.family)); id(r.id); id(r.contactId);
    need(pairIds.has(r.contactId) && typeof r.deleted === "boolean" && typeof r.sha256 === "string" && SHA.test(r.sha256));
    if (r.revision !== null) revision(r.revision);
    if (r.family === "record") {
      need(typeof r.moduleId === "string" && typeof r.field === "string" && r.revision !== null);
      let module; try { module = getModule(r.moduleId); } catch { throw new ContactReconciliationError(); }
      need(module.fields.some(f => f.key === r.field && ["reference", "references"].includes(f.type) && f.target === "contacts"));
    } else need(r.moduleId === null && r.field === null);
    const key = stable([r.family, r.id, r.field, r.contactId]); need(!refs.has(key)); refs.add(key);
  }
  decision(v.decision);
  if (v.decision.operation === "merge") need(pairIds.has(v.decision.survivorId));
  return v;
}
const sortRefs = refs => refs.slice().sort((a, b) => {
  const x = stable([a.family, a.id, a.field, a.contactId]), y = stable([b.family, b.id, b.field, b.contactId]);
  return x < y ? -1 : x > y ? 1 : 0;
});
/** Decision grammar only; creates no pair/current-context authority. */
export function validateContactReconciliationDecision(input) {
  const d = owned(input); decision(d); return d;
}

export function planContactReconciliation(input) {
  const v = checkedContext(owned(input)), [left, right] = v.pair;
  const references = sortRefs(v.references);
  const pair = v.pair.map(r => ({ id: r.id, revision: r.revision, sha256: sealHash("contact", r) }));
  const comparison = DATA_KEYS.map(field => ({ field, left: left.data[field], right: right.data[field], equal: same(left.data[field], right.data[field]) }));
  const refusals = []; let proposal = null;
  if (v.decision.operation === "merge") {
    const survivor = v.pair.find(r => r.id === v.decision.survivorId), loser = v.pair.find(r => r !== survivor);
    if (v.pair.some(r => r.status !== "draft" || r.approval !== null || r.snapshot !== null)) refusals.push("not-unapproved-drafts");
    if (v.pair.some(r => r.source !== null || EXTERNAL.some(f => r.data[f] !== null))) refusals.push("source-owned-contact");
    if (PROTECTED.some(f => !same(left.data[f], right.data[f]))) refusals.push("role-or-preference-conflict");
    if (references.some(r => r.family !== "record")) refusals.push("linked-private-or-immutable-history");
    if (references.some(r => r.family === "record" && r.contactId === loser.id)) refusals.push("losing-id-reference");
    if (!refusals.length) {
      const data = { ...survivor.data }, fieldProvenance = [];
      for (const field of SELECTED) {
        const choice = v.decision.fields[field], from = choice === "unknown" ? null : choice === "left" ? left : right;
        data[field] = from === null ? null : from.data[field];
        fieldProvenance.push({ field, choice, contactId: from?.id ?? null, contactRevision: from?.revision ?? null, value: data[field] });
      }
      let normalized;
      try { normalized = validateRecord("contacts", data, { orgId: v.orgId, recordId: survivor.id, status: "draft", records: [...v.pair, ...v.organizations.map(o => ({ ...o, data: { kind: o.kind } }))] }); }
      catch { throw new ContactReconciliationError("contact_reconciliation_contact"); }
      need(same(normalized, data));
      proposal = { survivorId: survivor.id, loserId: loser.id, survivorData: data, survivorStatus: "draft",
        expectedRevisions: pair.map(p => ({ id: p.id, revision: p.revision })),
        retire: { id: loser.id, operation: "soft-delete" }, fieldProvenance,
        unchangedFields: DATA_KEYS.filter(k => !SELECTED.includes(k)) };
    }
  }
  const body = { format: "charitology-contact-reconciliation-plan", version: 1, method: CONTACT_RECONCILIATION_METHOD,
    orgId: v.orgId, pair, organizations: v.organizations.slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    decision: v.decision, comparison, references, proposal, refusals,
    authority: "none-data-only", dependencyCompleteness: "caller-must-establish" };
  return owned({ ...body, sha256: sealHash("plan", body) });
}
