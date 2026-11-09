/** Pure recurrence packets. Historical facts and valid checksums grant no live authority. */
import { isProxy } from "node:util/types";
import { createHash } from "node:crypto";
import { hash, stable } from "./security.mjs";
import { validDate, validInstant } from "./schedule.mjs";
import { validateGroupExactStamp } from "./participation-group-model.mjs";
import { RECURRING_METHOD, validateFrozenRecurringPlan } from "./participation-recurrence-planner.mjs";
import { compileRecurringOccurrenceDrafts } from "./participation-recurrence-model.mjs";

export const RECURRENCE_PACKET_KIND = "participation-recurrence-v1";
export const RECURRENCE_MANIFEST_FORMAT = "charitology-participation-occurrence-generation";
export const RECURRENCE_PREVIEW_FORMAT = "charitology-participation-recurrence-preview";
export const RECURRENCE_RECEIPT_FORMAT = "charitology-participation-recurrence-receipt";
export const RECURRENCE_PREVIEW_METHOD = "participation-recurrence-preview-v1";
export const RECURRENCE_RECEIPT_METHOD = "participation-recurrence-receipt-v1";
export const RECURRENCE_PACKET_LIMITS = Object.freeze({ bytes: 131072, nodes: 4096, depth: 16 });
const ID = /^[A-Za-z0-9_-]{1,100}$/, SHA = /^[a-f0-9]{64}$/, KEY = /^[A-Za-z0-9_-]{16,100}$/;
const AUTHORITY = ["actorId", "sessionSha256", "membershipSha256", "memberCreatedAtExact", "restoreEpochSha256"];
const SOURCE_PIN = ["id", "revision", "rowSha256", "createdAtExact", "updatedAtExact", "deletedAtExact"];
const SQL_ROW = ["org_id", "id", "actor_id", "kind", "payload", "checksum", "base_revision", "expires_at", "committed_at", "created_at"];
const MANIFEST = ["format", "version", "method", "originOrgId", "reportId", "recordedAtExact", "source", "dependencies", "schedule", "plan", "candidates", "sha256"];
const PREVIEW = ["format", "version", "method", "purpose", "orgId", "actorId", "reportId", "authority", "dependencies", "dependenciesSha256", "review", "sha256"];
const RECEIPT = ["format", "version", "method", "purpose", "orgId", "actorId", "authority", "commandSha256", "requestSha256", "acceptedAtExact", "result", "sha256"];
// Version1 facts mirror the accepted compiler's exact whitelist and normalized
// null fields. Historical admission never inherits a future schema expansion.
const COMMON = ["title", "kind", "programId", "startAt", "endAt", "timeZone", "capacity", "participationPurpose", "participantInstructions", "organizerEmail", "organizerUrl"];
const COPY = { events: [...COMMON, "accessCoordinatorNeeded", "joiningUrl"], volunteers: [...COMMON, "skills", "safeguardingId", "allowPartialIntervals"] };
const EMPTY = { events: ["eventId", "contactId", "registeredCount", "attendanceCount", "walkInCount"], volunteers: ["contactId", "shiftId", "participants", "minutes"] };
const COMPILED = ["format", "version", "method", "orgId", "actorId", "source", "schedule", "plan", "children", "candidates", "sha256"];
const RECORD = ["id", "orgId", "moduleId", "data", "status", "ownerId", "lastEditedBy", "revision", "approval", "snapshot", "source"];
const ROW = ["org_id", "id", "created_by", "title", "checksum", "payload", "created_at"];
const DAY = 86400000;
export class RecurringOccurrencePacketError extends Error {
  constructor(code = "recurrence_packet_fields", status = 422) {
    super("This bounded recurrence history, review or receipt is invalid.");
    this.name = "RecurringOccurrencePacketError"; this.code = code; this.status = status;
  }
}
const need = (value, code) => { if (!value) throw new RecurringOccurrencePacketError(code); };
const exact = (value, keys) => need(value && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
const id = value => { need(typeof value === "string" && ID.test(value)); return value; };
const sha = value => need(typeof value === "string" && SHA.test(value));
const same = (left, right) => stable(left) === stable(right);
const freeze = value => { if (value && typeof value === "object") { for (const x of Object.values(value)) freeze(x); Object.freeze(value); } return value; };
const unicode = value => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
const digest = (kind, value) => hash({ method: RECURRING_METHOD, purpose: RECURRENCE_PACKET_KIND, kind, value });

function owned(input) {
  const active = new Set(); let nodes = 0, bytes = 0;
  const charge = n => { bytes += n; need(bytes <= RECURRENCE_PACKET_LIMITS.bytes, "recurrence_packet_limit"); };
  const visit = (value, depth) => {
    need(++nodes <= RECURRENCE_PACKET_LIMITS.nodes && depth <= RECURRENCE_PACKET_LIMITS.depth, "recurrence_packet_limit");
    if (value === null || typeof value === "boolean" || typeof value === "number") {
      need(typeof value !== "number" || Number.isFinite(value)); charge(Buffer.byteLength(JSON.stringify(value))); return value;
    }
    if (typeof value === "string") {
      need(value.length <= RECURRENCE_PACKET_LIMITS.bytes && unicode(value)); charge(Buffer.byteLength(JSON.stringify(value))); return value;
    }
    need(value && typeof value === "object" && !isProxy(value) && !active.has(value));
    const array = Array.isArray(value); need(Object.getPrototypeOf(value) === (array ? Array.prototype : Object.prototype));
    const keys = Reflect.ownKeys(value); need(keys.every(k => typeof k === "string" && k.length <= 100 && unicode(k) && !/\p{Cc}/u.test(k)));
    let ordered = keys;
    if (array) {
      const d = Object.getOwnPropertyDescriptor(value, "length");
      need(d && Object.hasOwn(d, "value") && Number.isSafeInteger(d.value) && d.value >= 0 && d.value <= 32, "recurrence_packet_limit");
      ordered = Array.from({ length: d.value }, (_, i) => String(i)); const indices = new Set(ordered);
      need(keys.length === ordered.length + 1 && keys.every(k => k === "length" || indices.has(k)));
    } else need(keys.length <= 64, "recurrence_packet_limit");
    active.add(value); charge(2); const out = array ? [] : {}; let first = true;
    for (const key of ordered) {
      const d = Object.getOwnPropertyDescriptor(value, key); need(d?.enumerable && Object.hasOwn(d, "value"));
      if (!first) charge(1); first = false; if (!array) charge(Buffer.byteLength(JSON.stringify(key)) + 1);
      Object.defineProperty(out, key, { value: visit(d.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    active.delete(value); return out;
  };
  return visit(input, 0);
}
function stamp(value) { try { validateGroupExactStamp(value); } catch { throw new RecurringOccurrencePacketError("recurrence_packet_time"); } }
function metadataStamp(value) {
  need(typeof value === "string" && /^(?!0000)\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.(?:\d{3}|\d{6})Z$/.test(value), "recurrence_packet_time");
  stamp(value.length === 24 ? value.slice(0, -1) + "000Z" : value);
}
function text(value, max, required = false) {
  if (value === null && !required) return;
  need(typeof value === "string" && value.length <= max && value.trim() === value &&
    value.length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value));
}
function namedZone(value) { need(typeof value === "string" && /^[A-Za-z0-9_+./-]{1,100}$/.test(value) && !/^[+-]/.test(value)); }
function url(value, max) {
  if (value === null) return;
  text(value, max); let u;
  try { u = new URL(value); } catch { throw new RecurringOccurrencePacketError(); }
  need(u.protocol === "https:" && !u.username && !u.password && !/[\r\n]/.test(value));
}
function data(value, moduleId, full) {
  exact(value, full ? [...COPY[moduleId], ...EMPTY[moduleId]] : COPY[moduleId]);
  text(value.title, 180, true); need(value.kind === (moduleId === "events" ? "session" : "shift"));
  if (value.programId !== null) id(value.programId);
  need(validInstant(value.startAt) && validInstant(value.endAt) && Date.parse(value.endAt) > Date.parse(value.startAt));
  namedZone(value.timeZone);
  need(value.capacity === null || Number.isSafeInteger(value.capacity) && value.capacity >= (moduleId === "volunteers" ? 1 : 0) && value.capacity <= 1000000000);
  text(value.participationPurpose, 600); text(value.participantInstructions, 600); text(value.organizerEmail, 254); url(value.organizerUrl, 500);
  if (moduleId === "events") {
    need(value.accessCoordinatorNeeded === null || typeof value.accessCoordinatorNeeded === "boolean"); url(value.joiningUrl, 1200);
  } else {
    text(value.skills, 4000); if (value.safeguardingId !== null) id(value.safeguardingId);
    need(value.allowPartialIntervals === null || typeof value.allowPartialIntervals === "boolean");
  }
  if (full) for (const key of EMPTY[moduleId]) need(value[key] === null, "recurrence_packet_copied_identity");
}
function source(value) {
  exact(value, ["id", "moduleId", "revision", "data"]); id(value.id);
  need(["events", "volunteers"].includes(value.moduleId) && Number.isSafeInteger(value.revision) && value.revision >= 1 && value.revision <= 2147483647);
  data(value.data, value.moduleId, false);
}
function civil(value) {
  const m = /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)\.(\d{3})$/.exec(value);
  need(m && validDate(m[1]) && +m[2] < 24 && +m[3] < 60 && +m[4] < 60);
  return Date.UTC(+m[1].slice(0, 4), +m[1].slice(5, 7) - 1, +m[1].slice(8, 10), +m[2], +m[3], +m[4], +m[5]);
}
function writtenCivil(value) {
  const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,3}))?(?:Z|[+-]\d\d:\d\d)$/.exec(value);
  need(m); return m[1] + "." + (m[2] ?? "").padEnd(3, "0");
}
function anchorMatches(s, schedule) {
  const a = writtenCivil(s.data.startAt), b = writtenCivil(s.data.endAt), start = civil(a), end = civil(b);
  need(end > start && end - start <= 7 * DAY, "recurrence_packet_anchor");
  const advance = value => { const next = new Date(civil(value) + schedule.intervalWeeks * 7 * DAY).toISOString().slice(0, -1); civil(next); return next; };
  need(schedule.timeZone === s.data.timeZone && same(schedule.anchor, { startCivil: advance(a), endCivil: advance(b) }), "recurrence_packet_anchor");
}
function expectedReferences(s) {
  return [["programId", "programs"], ...(s.moduleId === "volunteers" ? [["safeguardingId", "safeguarding"]] : [])]
    .filter(([key]) => s.data[key] !== null).map(([key, moduleId]) => ({ id: s.data[key], moduleId }))
    .sort((a, b) => a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function dependencies(value, s) {
  exact(value, ["source", "references"]); exact(value.source, SOURCE_PIN);
  const pin = row => {
    id(row.id); sha(row.rowSha256); stamp(row.createdAtExact); stamp(row.updatedAtExact);
    need(row.deletedAtExact === null && Number.isSafeInteger(row.revision) && row.revision >= 1 && row.revision <= 2147483647);
  };
  pin(value.source); need(value.source.id === s.id && value.source.revision === s.revision, "recurrence_packet_dependencies");
  const expected = expectedReferences(s);
  need(Array.isArray(value.references) && value.references.length === expected.length && expected.length <= 2);
  const seen = new Set([s.id]);
  for (let i = 0; i < expected.length; i++) {
    const r = value.references[i]; exact(r, [...SOURCE_PIN, "moduleId"]); pin(r);
    need(r.id === expected[i].id && r.moduleId === expected[i].moduleId && !seen.has(r.id), "recurrence_packet_dependencies"); seen.add(r.id);
  }
}
function checkedFacts(s, schedule, plan, candidates) {
  source(s);
  try { validateFrozenRecurringPlan({ schedule, plan }); }
  catch { throw new RecurringOccurrencePacketError("recurrence_packet_plan"); }
  anchorMatches(s, schedule);
  const included = plan.occurrences.filter(o => o.range !== null), reserved = new Set([s.id, ...expectedReferences(s).map(r => r.id)]);
  need(Array.isArray(candidates) && candidates.length === included.length && candidates.length > 0 && candidates.length <= 8);
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i], o = included[i]; exact(c, ["sequence", "id", "moduleId", "data", "status", "revision"]);
    id(c.id); need(!reserved.has(c.id) && c.sequence === o.sequence && c.moduleId === s.moduleId && c.status === "draft" && c.revision === 1);
    reserved.add(c.id); data(c.data, c.moduleId, true);
    const expected = { ...s.data, ...Object.fromEntries(EMPTY[s.moduleId].map(k => [k, null])), title: c.data.title, ...o.range };
    need(same(c.data, expected), "recurrence_packet_candidates");
  }
}
function checkSeal(value, kind) {
  sha(value.sha256); const { sha256, ...body } = value; need(sha256 === digest(kind, body), "recurrence_packet_checksum");
}
function checkedManifest(v) {
  exact(v, MANIFEST); need(v.format === RECURRENCE_MANIFEST_FORMAT && v.version === 1 && v.method === RECURRING_METHOD);
  id(v.originOrgId); id(v.reportId); stamp(v.recordedAtExact);
  checkedFacts(v.source, v.schedule, v.plan, v.candidates); dependencies(v.dependencies, v.source);
  need(v.reportId !== v.source.id && !v.candidates.some(c => c.id === v.reportId));
  const recordedMicros = BigInt(Date.parse(v.recordedAtExact.slice(0, 23) + "Z")) * 1000n + BigInt(v.recordedAtExact.slice(23, 26));
  need(v.candidates.every(c => recordedMicros < BigInt(Date.parse(c.data.startAt)) * 1000n), "recurrence_packet_future");
  checkSeal(v, "manifest"); return v;
}
export function validateRecurringOccurrenceManifest(input) { return freeze(checkedManifest(owned(input))); }

function checkedCompiled(v) {
  exact(v, COMPILED); need(v.format === "charitology-recurring-occurrence-draft-plan" && v.version === 1 && v.method === RECURRING_METHOD);
  id(v.orgId); id(v.actorId); sha(v.sha256);
  const { sha256, ...body } = v;
  need(sha256 === createHash("sha256").update("charitology:participation-recurrence:v1:drafts\0" + stable(body)).digest("hex"), "recurrence_packet_compiled");
  need(Array.isArray(v.candidates) && Array.isArray(v.children) && v.children.length === v.candidates.length);
  const facts = v.candidates.map((c, i) => {
    exact(c, RECORD); const marker = v.children[i]; exact(marker, ["sequence", "recordId"]);
    need(c.orgId === v.orgId && c.ownerId === v.actorId && c.lastEditedBy === v.actorId &&
      c.approval === null && c.snapshot === null && c.source === null && c.id === marker.recordId);
    return { sequence: marker.sequence, id: c.id, moduleId: c.moduleId, data: c.data, status: c.status, revision: c.revision };
  });
  checkedFacts(v.source, v.schedule, v.plan, facts); return facts;
}
export function makeRecurringOccurrenceManifest(input) {
  const v = owned(input); exact(v, ["reportId", "recordedAtExact", "compiled", "dependencies"]);
  const candidates = checkedCompiled(v.compiled);
  const body = { format: RECURRENCE_MANIFEST_FORMAT, version: 1, method: RECURRING_METHOD,
    originOrgId: v.compiled.orgId, reportId: v.reportId, recordedAtExact: v.recordedAtExact, source: v.compiled.source,
    dependencies: v.dependencies, schedule: v.compiled.schedule, plan: v.compiled.plan, candidates };
  return validateRecurringOccurrenceManifest({ ...body, sha256: digest("manifest", body) });
}
export function recurringOccurrenceReportTitle(input) {
  const m = validateRecurringOccurrenceManifest(input); return "Recurring occurrence drafts: " + m.source.id;
}
export function validateRecurringOccurrenceReportRow(input) {
  const v = owned(input); exact(v, ROW); id(v.org_id); id(v.id); id(v.created_by); metadataStamp(v.created_at);
  const payload = checkedManifest(v.payload); need(v.id === payload.reportId && v.checksum === payload.sha256 && v.title === recurringOccurrenceReportTitle(payload));
  return freeze(v);
}
export function makeRecurringOccurrenceReportRow(input) {
  const v = owned(input); exact(v, ["orgId", "id", "actorId", "createdAtExact", "payload"]);
  const payload = checkedManifest(v.payload); stamp(v.createdAtExact);
  need(payload.originOrgId === v.orgId && payload.reportId === v.id && payload.recordedAtExact === v.createdAtExact, "recurrence_packet_live_context");
  return validateRecurringOccurrenceReportRow({ org_id: v.orgId, id: v.id, created_by: v.actorId,
    title: recurringOccurrenceReportTitle(payload), checksum: payload.sha256, payload, created_at: v.createdAtExact });
}
function authority(value, actorId) {
  exact(value, AUTHORITY); id(value.actorId); need(value.actorId === actorId); stamp(value.memberCreatedAtExact);
  for (const key of ["sessionSha256", "membershipSha256", "restoreEpochSha256"]) sha(value[key]);
}
function minimizedInput(compiled, deps) {
  return { orgId: compiled.orgId, actorId: compiled.actorId,
    source: { ...compiled.source, orgId: compiled.orgId }, schedule: compiled.schedule,
    titles: compiled.children.map((child, i) => ({ sequence: child.sequence, title: compiled.candidates[i].data.title })),
    children: compiled.children.map(child => ({ sequence: child.sequence, id: child.recordId })),
    references: deps.references.map(r => ({ id: r.id, moduleId: r.moduleId, orgId: compiled.orgId })) };
}
function checkedPreview(v) {
  exact(v, PREVIEW); need(v.format === RECURRENCE_PREVIEW_FORMAT && v.version === 1 && v.method === RECURRENCE_PREVIEW_METHOD && v.purpose === RECURRENCE_PACKET_KIND);
  id(v.orgId); id(v.actorId); id(v.reportId); authority(v.authority, v.actorId); exact(v.review, ["input", "compiled"]);
  checkedCompiled(v.review.compiled); const compiled = v.review.compiled;
  need(compiled.orgId === v.orgId && compiled.actorId === v.actorId && v.reportId !== compiled.source.id && !compiled.candidates.some(c => c.id === v.reportId));
  dependencies(v.dependencies, compiled.source); sha(v.dependenciesSha256);
  need(v.dependenciesSha256 === digest("dependencies", { orgId: v.orgId, dependencies: v.dependencies }) &&
    same(v.review.input, minimizedInput(compiled, v.dependencies)), "recurrence_packet_dependencies");
  checkSeal(v, "preview"); return v;
}
export function validateRecurringOccurrencePreview(input) { return freeze(checkedPreview(owned(input))); }
export function makeRecurringOccurrencePreview(input) {
  const v = owned(input); exact(v, ["orgId", "actorId", "reportId", "authority", "dependencies", "input"]);
  id(v.orgId); id(v.actorId); need(v.input && typeof v.input === "object" && v.input.orgId === v.orgId && v.input.actorId === v.actorId);
  const compiled = compileRecurringOccurrenceDrafts(v.input); dependencies(v.dependencies, compiled.source);
  const body = { format: RECURRENCE_PREVIEW_FORMAT, version: 1, method: RECURRENCE_PREVIEW_METHOD, purpose: RECURRENCE_PACKET_KIND,
    orgId: v.orgId, actorId: v.actorId, reportId: v.reportId, authority: v.authority, dependencies: v.dependencies,
    dependenciesSha256: digest("dependencies", { orgId: v.orgId, dependencies: v.dependencies }),
    review: { input: minimizedInput(compiled, v.dependencies), compiled } };
  return validateRecurringOccurrencePreview({ ...body, sha256: digest("preview", body) });
}
function checkedReceipt(v) {
  exact(v, RECEIPT); need(v.format === RECURRENCE_RECEIPT_FORMAT && v.version === 1 && v.method === RECURRENCE_RECEIPT_METHOD && v.purpose === RECURRENCE_PACKET_KIND);
  id(v.orgId); id(v.actorId); authority(v.authority, v.actorId); sha(v.commandSha256); sha(v.requestSha256); stamp(v.acceptedAtExact);
  exact(v.result, ["reportId", "reportSha256", "recordIds"]); id(v.result.reportId); sha(v.result.reportSha256);
  need(Array.isArray(v.result.recordIds) && v.result.recordIds.length >= 1 && v.result.recordIds.length <= 8);
  v.result.recordIds.forEach(id); need(new Set(v.result.recordIds).size === v.result.recordIds.length && !v.result.recordIds.includes(v.result.reportId));
  checkSeal(v, "receipt"); return v;
}
export function validateRecurringOccurrenceReceipt(input) { return freeze(checkedReceipt(owned(input))); }
export function makeRecurringOccurrenceReceipt(input) {
  const v = owned(input); exact(v, ["manifest", "authority", "keyHash", "requestHash"]);
  const m = checkedManifest(v.manifest); exact(v.authority, AUTHORITY); authority(v.authority, v.authority.actorId);
  const body = { format: RECURRENCE_RECEIPT_FORMAT, version: 1, method: RECURRENCE_RECEIPT_METHOD, purpose: RECURRENCE_PACKET_KIND,
    orgId: m.originOrgId, actorId: v.authority.actorId, authority: v.authority, commandSha256: v.keyHash, requestSha256: v.requestHash,
    acceptedAtExact: m.recordedAtExact, result: { reportId: m.reportId, reportSha256: m.sha256, recordIds: m.candidates.map(c => c.id) } };
  return validateRecurringOccurrenceReceipt({ ...body, sha256: digest("receipt", body) });
}
export function recurringOccurrenceCommandHashes(input) {
  const v = owned(input); exact(v, ["orgId", "actorId", "previewId", "commandKey"]); id(v.orgId); id(v.actorId); id(v.previewId);
  need(typeof v.commandKey === "string" && KEY.test(v.commandKey));
  return freeze({ commandSha256: digest("command", { orgId: v.orgId, actorId: v.actorId, commandKey: v.commandKey }),
    requestSha256: digest("request", { previewId: v.previewId, commandKey: v.commandKey }) });
}
/** Actual SQL-row integrity only, with explicit UTC6text projections. This does
 * not prove current expiry, permissions, original acceptance or a COMMIT. */
export function validateRecurringOccurrencePreviewRow(input) {
  const v = owned(input); exact(v, SQL_ROW); id(v.org_id); id(v.id); id(v.actor_id);
  need(v.kind === RECURRENCE_PACKET_KIND, "recurrence_packet_kind"); sha(v.checksum); sha(v.base_revision);
  stamp(v.created_at); stamp(v.expires_at); if (v.committed_at !== null) stamp(v.committed_at);
  need(v.checksum === hash(v.payload), "recurrence_packet_row_checksum");
  const pending = v.committed_at === null, payload = pending ? checkedPreview(v.payload) : checkedReceipt(v.payload);
  need(payload.orgId === v.org_id && payload.actorId === v.actor_id, "recurrence_packet_row_context");
  if (pending) need(v.base_revision === payload.dependenciesSha256, "recurrence_packet_row_context");
  return freeze({ classification: "passive", state: pending ? "pending" : "committed", payload });
}
