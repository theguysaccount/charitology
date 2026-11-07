import { fail, stable } from "./security.mjs";
import { learningHash, learningOwned } from "./learning-json.mjs";
import { foldLearningHistory } from "./learning-model.mjs";
import { validateLearningBackup } from "./learning-report-model.mjs";

const MIB = 1024 * 1024;
const RESERVE = 4096;
const NONREPORT_KINDS = new Set(["source", "evidence", "event"]);
const PAYLOAD_LIMITS = Object.freeze({ source: 1056768, evidence: 256 * 1024, event: 128 * 1024, "recovered-report": 4 * MIB });
const invalid = () => fail(422, "learning_backup", "The complete retained learning evidence is invalid or exceeds its limits.");
const capacity = () => fail(422, "learning_quota", "This workspace reached its retained learning history or report limit. Existing evidence remains available to export.");
const size = () => fail(422, "learning_size", "The measured learning evidence exceeds its admitted storage representation.");
const isId = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const isPlain = value => !!value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const bindingKey = value => stable([value.originOrgId, value.bindingId]);
const frozen = value => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) frozen(item);
    Object.freeze(value);
  }
  return value;
};

/** Dispatch before any legacy report schema or checksum interpretation. */
export function isLearningReportFamily(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    (value.kind === "learning-review" || (typeof value.methodVersion === "string" && value.methodVersion.startsWith("learning-")));
}

// PostgreSQL JSONB expands exponent-form JSON numbers and inserts separator
// spaces. Object-key order does not change the byte count. Actual SQL measures
// remain authoritative at every storage boundary below.
function decimalJSONNumber(value) {
  const encoded = JSON.stringify(value);
  if (!encoded || encoded === "null") invalid();
  if (!/[eE]/.test(encoded)) return encoded;
  const [coefficient, exponent] = encoded.toLowerCase().split("e");
  const negative = coefficient.startsWith("-");
  const unsigned = negative ? coefficient.slice(1) : coefficient;
  const dot = unsigned.indexOf(".");
  const digits = unsigned.replace(".", "");
  const position = (dot < 0 ? unsigned.length : dot) + Number(exponent);
  const decimal = position <= 0 ? "0." + "0".repeat(-position) + digits :
    position >= digits.length ? digits + "0".repeat(position - digits.length) :
      digits.slice(0, position) + "." + digits.slice(position);
  return (negative ? "-" : "") + decimal;
}
function jsonbText(value) {
  if (typeof value === "number") return decimalJSONNumber(value);
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(jsonbText).join(", ") + "]";
  return "{" + Object.keys(value).map(key => JSON.stringify(key) + ": " + jsonbText(value[key])).join(", ") + "}";
}
export function learningJSONBBytes(value) {
  return Buffer.byteLength(jsonbText(learningOwned(value, { bytes: 64 * MIB })));
}
export function learningReportReserveBytes(report) {
  return learningJSONBBytes(report) + RESERVE;
}

function checkLegacyInventory(legacyReports, reports = []) {
  if (!Array.isArray(legacyReports)) invalid();
  const ids = new Set(reports.map(report => report.id));
  const checksums = new Set(reports.map(report => report.checksum));
  for (const row of legacyReports) {
    if (isLearningReportFamily(row?.payload) || isLearningReportFamily(row)) invalid();
    if (row && (ids.has(row.id) || checksums.has(row.checksum))) invalid();
  }
}

function recordInventory(records, trash) {
  if (!Array.isArray(records) || !Array.isArray(trash)) invalid();
  const all = new Map();
  for (const record of [...records, ...trash]) {
    if (!isPlain(record) || !isId(record.id) || all.has(record.id) || typeof record.moduleId !== "string") invalid();
    all.set(record.id, record);
  }
  return all;
}
function createdRecords(event) {
  const payload = event.payload;
  if (["mapped", "adopted"].includes(payload.kind)) return payload.records;
  if (["measured", "corrected", "decided"].includes(payload.kind)) return [payload.record];
  return [];
}
function checkRecordReferences(value, { records, trash, sourceOrgId }) {
  const inventory = recordInventory(records, trash);
  const origins = new Set([...inventory.values()].map(record => record.orgId).filter(isId));
  const currentOrigin = sourceOrgId ?? (origins.size === 1 ? [...origins][0] : null);
  if (sourceOrgId !== undefined && !isId(sourceOrgId)) invalid();
  const created = new Map();
  const programs = new Set();
  for (const event of value.events) {
    programs.add(event.programId);
    const program = inventory.get(event.programId);
    if ((!program && event.originOrgId === currentOrigin) || (program && program.moduleId !== "programs")) invalid();
    for (const pin of createdRecords(event)) {
      const identity = stable([event.originOrgId, pin.recordId]);
      if (created.has(identity)) invalid();
      created.set(identity, { pin, event });
      const record = inventory.get(pin.recordId);
      // Recovered source trash can outlive current ordinary rows. A live source
      // inventory, however, cannot omit its own created identity.
      if (!record) {
        if (event.originOrgId === currentOrigin) invalid();
        continue;
      }
      if (record.moduleId !== pin.moduleId || !isPlain(record.data) || record.data.programId !== event.programId) invalid();
      // Program data can change after mapping. Immutable approval evidence, not
      // the later working row, supplies historical bytes. Bridge-created data
      // remains immutable for the original current organization.
      if (record.orgId === event.originOrgId && learningHash("data", record.data) !== pin.dataSha256) invalid();
    }
  }
  for (const id of programs) {
    const record = inventory.get(id);
    if (record && record.moduleId !== "programs") invalid();
  }
  for (const evidence of value.approvedEvidence) {
    const record = inventory.get(evidence.pin.recordId);
    if (record && record.moduleId !== evidence.pin.moduleId) invalid();
    if (evidence.pin.moduleId !== "programs" && record && isPlain(record.data) &&
      record.data.programId !== evidence.snapshot.data.programId) invalid();
  }
  const createdIds = new Set([...created.values()].map(item => item.pin.recordId));
  if (records.filter(record => createdIds.has(record.id)).length > 500) capacity();
}

function payloadRows(value) {
  return [
    ...value.sources.map(payload => ({ rowKind: "source", payload, id: payload.sha256, originOrgId: payload.originOrgId,
      bindingId: payload.bindingId, sequence: null, sourceVersion: payload.sourceVersion, programId: null })),
    ...value.approvedEvidence.map(payload => ({ rowKind: "evidence", payload, id: payload.sha256,
      originOrgId: payload.pin.originOrgId, bindingId: null, sequence: null, sourceVersion: null, programId: null })),
    ...value.events.map(payload => ({ rowKind: "event", payload, id: payload.sha256, originOrgId: payload.originOrgId,
      bindingId: payload.bindingId, sequence: payload.sequence, sourceVersion: null, programId: payload.programId })),
    ...value.reports.map(payload => ({ rowKind: "recovered-report", payload, id: payload.checksum, originOrgId: payload.orgId,
      bindingId: null, sequence: null, sourceVersion: null, programId: payload.manifest.programId })),
  ];
}
function checkCategoryCounts(value) {
  const nonreportCount = value.sources.length + value.approvedEvidence.length + value.events.length;
  if (nonreportCount > 1000 || value.approvedEvidence.length > 600 || value.reports.length > 20) capacity();
  const roots = new Set(value.events.filter(event => event.sequence === 1).map(bindingKey));
  if (roots.size > 20) capacity();
  if (value.events.filter(event => ["measured", "corrected"].includes(event.payload.kind)).length > 200) capacity();
  const decisions = new Map();
  for (const event of value.events.filter(event => event.payload.kind === "decided")) {
    const key = bindingKey(event);
    decisions.set(key, (decisions.get(key) || 0) + 1);
    if (decisions.get(key) > 20) capacity();
  }
}
function projection(rows) {
  let nonreportCount = 0, nonreportBytes = 0, evidenceCount = 0, reportCount = 0, reportBytes = 0;
  for (const row of rows) {
    if (row.payloadBytes > PAYLOAD_LIMITS[row.rowKind]) size();
    if (row.rowKind === "recovered-report") {
      if (row.canonicalBytes > 4 * MIB) size();
      reportCount++;
      reportBytes += row.budgetBytes;
    } else {
      nonreportCount++;
      nonreportBytes += row.budgetBytes;
      if (row.rowKind === "evidence") evidenceCount++;
    }
  }
  if (nonreportCount > 1000 || evidenceCount > 600 || nonreportBytes > 16 * MIB || reportCount > 20 || reportBytes > 60 * MIB || nonreportBytes + reportBytes > 60 * MIB) capacity();
  return { nonreportCount, nonreportBytes, evidenceCount, reportCount, reportBytes, totalBytes: nonreportBytes + reportBytes, rows };
}

/** undefined is the only old-v1 absence; present null or a partial selection fails. */
export function restoredLearningBridge(input, { records = [], trash = [], legacyReports = [], sourceOrgId } = {}) {
  checkLegacyInventory(legacyReports);
  if (input === undefined) return null;
  const value = validateLearningBackup(input);
  checkLegacyInventory(legacyReports, value.reports);
  checkRecordReferences(value, { records, trash, sourceOrgId });
  checkCategoryCounts(value);
  projection(payloadRows(value).map(row => ({ ...row, payloadBytes: learningJSONBBytes(row.payload),
    canonicalBytes: Buffer.byteLength(stable(row.payload)), budgetBytes: learningJSONBBytes(row.payload) + RESERVE })));
  return value;
}

/** Exact destination projection. No writes, HTTP export or audit side effects. */
export async function measureLearningBackup(c, input) {
  const value = validateLearningBackup(input);
  checkCategoryCounts(value);
  const rows = [];
  for (const row of payloadRows(value)) {
    const result = await c.query("SELECT octet_length($1::jsonb::text) AS bytes", [JSON.stringify(row.payload)]);
    const payloadBytes = Number(result.rows[0]?.bytes);
    if (!Number.isSafeInteger(payloadBytes) || payloadBytes < 0 || payloadBytes !== learningJSONBBytes(row.payload)) size();
    rows.push({ ...row, payloadBytes, canonicalBytes: Buffer.byteLength(stable(row.payload)), budgetBytes: payloadBytes + RESERVE });
  }
  return frozen(projection(rows));
}

function sortedSection(sources, approvedEvidence, events, reports) {
  const text = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const origin = (a, b) => text(a.originOrgId, b.originOrgId) || text(a.bindingId, b.bindingId);
  sources.sort((a, b) => origin(a, b) || a.sourceVersion - b.sourceVersion);
  approvedEvidence.sort((a, b) => text(a.sha256, b.sha256));
  events.sort((a, b) => origin(a, b) || a.sequence - b.sequence);
  reports.sort((a, b) => text(a.createdAt, b.createdAt) || text(a.id, b.id));
  return { format: "charitology-learning-backup", version: 1, method: "learning-review-v1", sources, approvedEvidence, events, reports };
}
function storedRow(row) {
  const payload = row.payload;
  const kind = row.row_kind;
  if (!NONREPORT_KINDS.has(kind) && kind !== "recovered-report") invalid();
  if (!["live", "recovered"].includes(row.origin_mode) || (kind === "recovered-report" && row.origin_mode !== "recovered")) invalid();
  const expected = kind === "source" ? { id: payload.sha256, origin: payload.originOrgId, binding: payload.bindingId, sequence: null, version: payload.sourceVersion, program: null } :
    kind === "evidence" ? { id: payload.sha256, origin: payload.pin?.originOrgId, binding: null, sequence: null, version: null, program: null } :
      kind === "event" ? { id: payload.sha256, origin: payload.originOrgId, binding: payload.bindingId, sequence: payload.sequence, version: null, program: payload.programId } :
        { id: payload.checksum, origin: payload.orgId, binding: null, sequence: null, version: null, program: payload.manifest?.programId };
  if (row.id !== expected.id || row.origin_org_id !== expected.origin || row.binding_id !== expected.binding ||
    row.sequence !== expected.sequence || row.source_version !== expected.version || row.program_id !== expected.program) invalid();
  if (row.receipt !== null && (row.origin_mode !== "live" || kind !== "event")) invalid();
  const payloadBytes = Number(row.learning_payload_bytes), receiptBytes = Number(row.learning_receipt_bytes), actual = Number(row.learning_row_bytes);
  const budget = Number(row.budget_bytes);
  if (![payloadBytes, receiptBytes, actual, budget].every(Number.isSafeInteger) || receiptBytes < 0 || receiptBytes > 8192 ||
    payloadBytes !== learningJSONBBytes(payload) || budget !== payloadBytes + receiptBytes + RESERVE || actual > budget) size();
  return { rowKind: kind, payloadBytes, canonicalBytes: Buffer.byteLength(stable(payload)), budgetBytes: Math.max(actual, budget) };
}

/** One canonical report inventory from live and recovered locations; no receipts. */
export async function exportLearningBridge(c, org, context = {}) {
  const history = (await c.query("SELECT h.*,octet_length(payload::text) AS learning_payload_bytes,COALESCE(octet_length(receipt::text),0) AS learning_receipt_bytes,octet_length(to_jsonb(h)::text) AS learning_row_bytes FROM os_learning_history h WHERE org_id=$1 ORDER BY origin_org_id,binding_id,sequence,source_version,id", [org])).rows;
  const live = (await c.query("SELECT r.*,octet_length(payload::text) AS learning_payload_bytes,octet_length(to_jsonb(r)::text) AS learning_row_bytes FROM os_reports r WHERE org_id=$1 AND (payload->>'kind'='learning-review' OR payload->>'methodVersion' LIKE 'learning-%') ORDER BY created_at,id", [org])).rows;
  if (!history.length && !live.length) {
    checkLegacyInventory(context.legacyReports || []);
    return undefined;
  }
  const sources = [], approvedEvidence = [], events = [], reports = [], usageRows = [];
  for (const row of history) {
    const payload = learningOwned(row.payload, { bytes: 4 * MIB });
    usageRows.push(storedRow({ ...row, payload }));
    if (row.row_kind === "source") sources.push(payload);
    else if (row.row_kind === "evidence") approvedEvidence.push(payload);
    else if (row.row_kind === "event") events.push(payload);
    else reports.push(payload);
  }
  for (const row of live) {
    const payload = learningOwned(row.payload, { bytes: 4 * MIB });
    if (row.id !== payload.id || row.org_id !== payload.orgId || row.checksum !== payload.checksum ||
      row.created_by !== payload.createdBy || row.title !== payload.title) invalid();
    const payloadBytes = Number(row.learning_payload_bytes), actual = Number(row.learning_row_bytes);
    if (![payloadBytes, actual].every(Number.isSafeInteger) || payloadBytes !== learningJSONBBytes(payload)) size();
    usageRows.push({ rowKind: "recovered-report", payloadBytes, canonicalBytes: Buffer.byteLength(stable(payload)), budgetBytes: Math.max(actual, payloadBytes + RESERVE) });
    reports.push(payload);
  }
  projection(usageRows);
  return restoredLearningBridge(sortedSection(sources, approvedEvidence, events, reports), { ...context, sourceOrgId: context.sourceOrgId ?? org });
}

/**
 * The recovered reader must first establish origin_mode from its server rows
 * and authorize every program in this complete inventory. Portable JSON cannot
 * grant recovered/adoption authority. Keeping the complete admitted graph is
 * deliberate: this response does not claim to contain only one binding.
 */
export function selectRecoveredLearningHistory(input, headHash) {
  if (typeof headHash !== "string" || !/^[a-f0-9]{64}$/.test(headHash))
    fail(404, "learning_recovered", "This recovered learning history is unavailable.");
  const history = validateLearningBackup(input);
  const folded = foldLearningHistory({ sources: history.sources, approvedEvidence: history.approvedEvidence, events: history.events });
  const binding = folded.bindings.find(item => item.head.eventSha256 === headHash);
  if (!binding) fail(404, "learning_recovered", "This recovered learning history is unavailable.");
  const source = history.sources.find(item => item.sha256 === binding.source.sha256 && item.originOrgId === binding.source.originOrgId &&
    item.bindingId === binding.source.bindingId && item.sourceVersion === binding.source.version);
  if (!source || !binding.mappingEvent) invalid();
  const detail = { binding: { bindingId: binding.bindingId, originOrgId: binding.originOrgId, programId: binding.programId, head: binding.head,
    originMode: "recovered", source: binding.source, mappingNumber: binding.mappingNumber, disposition: "historical-only" },
  mapping: binding.mappingEvent, source, history };
  if (Buffer.byteLength(JSON.stringify(detail)) > 64 * MIB) size();
  return frozen(detail);
}

/** Caller owns the tenant transaction/lock and global full-backup admission. */
export async function restoreLearningBridge(c, org, input, context = {}) {
  const value = restoredLearningBridge(input, context);
  if (value === null) return { sources: 0, approvedEvidence: 0, events: 0, reports: 0, nonreportBytes: 0, reportBytes: 0, totalBytes: 0 };
  const occupied = (await c.query("SELECT (SELECT count(*) FROM os_learning_history WHERE org_id=$1)+(SELECT count(*) FROM os_learning_previews WHERE org_id=$1)+(SELECT count(*) FROM os_reports WHERE org_id=$1 AND (payload->>'kind'='learning-review' OR payload->>'methodVersion' LIKE 'learning-%')) AS count", [org])).rows[0];
  if (Number(occupied?.count) !== 0) fail(409, "restore_conflict", "Restore requires an organization without learning history, reports or previews.");
  const measured = await measureLearningBackup(c, value);
  for (const row of measured.rows) {
    const inserted = (await c.query("INSERT INTO os_learning_history(org_id,id,row_kind,origin_mode,origin_org_id,binding_id,sequence,source_version,program_id,payload,receipt,budget_bytes) VALUES($1,$2,$3,'recovered',$4,$5,$6,$7,$8,$9,NULL,$10) RETURNING octet_length(to_jsonb(os_learning_history)::text) AS actual_bytes,budget_bytes", [org, row.id, row.rowKind, row.originOrgId, row.bindingId, row.sequence, row.sourceVersion, row.programId, JSON.stringify(row.payload), row.budgetBytes])).rows[0];
    if (!inserted || Number(inserted.budget_bytes) !== row.budgetBytes || Number(inserted.actual_bytes) > row.budgetBytes) size();
  }
  const usage = (await c.query("SELECT count(*) FILTER (WHERE row_kind<>'recovered-report') AS nonreport_count,count(*) FILTER (WHERE row_kind='evidence') AS evidence_count,COALESCE(sum(GREATEST(octet_length(to_jsonb(h)::text),budget_bytes)) FILTER (WHERE row_kind<>'recovered-report'),0) AS nonreport_bytes,count(*) FILTER (WHERE row_kind='recovered-report') AS report_count,COALESCE(sum(GREATEST(octet_length(to_jsonb(h)::text),budget_bytes)) FILTER (WHERE row_kind='recovered-report'),0) AS report_bytes FROM os_learning_history h WHERE org_id=$1", [org])).rows[0];
  if (Number(usage.nonreport_count) !== measured.nonreportCount || Number(usage.evidence_count) !== measured.evidenceCount ||
    Number(usage.nonreport_bytes) !== measured.nonreportBytes || Number(usage.report_count) !== measured.reportCount || Number(usage.report_bytes) !== measured.reportBytes) size();
  return frozen({ sources: value.sources.length, approvedEvidence: value.approvedEvidence.length, events: value.events.length, reports: value.reports.length,
    nonreportBytes: measured.nonreportBytes, reportBytes: measured.reportBytes, totalBytes: measured.totalBytes });
}
