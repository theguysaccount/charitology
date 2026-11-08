/** IO-free self-report candidates. No value returned here grants live authority. */
import { isProxy } from "node:util/types";
import { hash, stable } from "./security.mjs";
import { validInstant, validZone, agreesWithZone } from "./schedule.mjs";
import { frozenParticipationInterval } from "./participation-intervals.mjs";

export const CHECK_IN_METHOD = "participant-check-in-v1";
export const CHECK_IN_CONSENT_VERSION = "arrival-self-report-v1";
export const CHECK_IN_LIMITS = Object.freeze({
  records: 2000,
  familyBytes: 4194304,
  historyBytes: 2048,
  receiptBytes: 1024,
  rowBytes: 8192,
  requestBytes: 4096,
  contextBytes: 32768,
  afterEndMs: 86400000,
});
const ID = /^[A-Za-z0-9_-]{1,100}$/; // Existing participation/participant opaque-ID profile.
const SHA = /^[a-f0-9]{64}$/;
const HISTORY_KEYS = ["id", "originOrgId", "participationId", "moduleId", "bookingRecordId", "programId", "commitment", "claimedArrivalAt", "submittedAt", "affirmation", "claimSha256", "withdrawnAt"];
const CONTEXT_KEYS = ["id", "orgId", "participationId", "moduleId", "bookingRecordId", "revision", "intakeRevision", "frozen", "requestedInterval"];
const REPLAY_CONTEXT_KEYS = ["orgId", "participationId", "moduleId", "bookingRecordId"];
const REPORT_KEYS = ["revision", "intakeRevision", "checkInRevision", "commitmentSha256", "claimedArrivalAt", "reportConsent", "consentVersion", "idempotencyKey"];
const WITHDRAW_KEYS = ["checkInRevision", "reportSha256", "withdraw", "idempotencyKey"];

export class CheckInError extends Error {
  constructor(code = "checkin_fields", status = 422) {
    super(status === 409 ? "The saved self-report or reviewed commitment changed. Reconcile the current state." : "Use the exact bounded self-report fields and explicit times.");
    this.name = "CheckInError";
    this.code = code;
    this.status = status;
  }
}
const bad = (code, status) => { throw new CheckInError(code, status); };
const requireValue = (condition, code = "checkin_fields", status = 422) => { if (!condition) bad(code, status); };
const freeze = value => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

// Bound descriptor admission before using the existing stable canonicalizer.
// Node's proxy check precedes reflection, so rejecting a Proxy invokes no traps.
function owned(input, maxBytes = CHECK_IN_LIMITS.contextBytes) {
  const active = new Set();
  let nodes = 0, bytes = 0;
  const charge = n => { bytes += n; requireValue(bytes <= maxBytes, "checkin_limit"); };
  const visit = (value, depth) => {
    requireValue(++nodes <= 200000 && depth <= 16, "checkin_limit");
    if (value === null || typeof value === "boolean" || typeof value === "number") {
      requireValue(typeof value !== "number" || Number.isFinite(value));
      charge(Buffer.byteLength(JSON.stringify(value))); return value;
    }
    if (typeof value === "string") {
      requireValue(value.length <= 4096 && !/[\u0000\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value));
      charge(Buffer.byteLength(JSON.stringify(value))); return value;
    }
    requireValue(value && typeof value === "object" && !isProxy(value) && !active.has(value));
    const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
    requireValue(array ? proto === Array.prototype : proto === Object.prototype);
    const keys = Reflect.ownKeys(value);
    requireValue(keys.every(key => typeof key === "string" && key.length <= 100));
    requireValue(array ? value.length <= CHECK_IN_LIMITS.records && keys.length === value.length + 1 : keys.length <= 64, "checkin_limit");
    // Digit-looking properties outside the canonical dense index set are not
    // array members. They must never compensate for holes and then disappear
    // when a later map/JSON operation observes only native array indices.
    const orderedKeys = array ? Array.from({ length: value.length }, (_, i) => String(i)) : keys;
    if (array) {
      const length = Object.getOwnPropertyDescriptor(value, "length"), canonical = new Set(orderedKeys);
      requireValue(length && Object.hasOwn(length, "value") && length.value === value.length);
      requireValue(keys.every(key => key === "length" || canonical.has(key)));
      for (const key of orderedKeys) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        requireValue(descriptor?.enumerable && Object.hasOwn(descriptor, "value"));
      }
    }
    active.add(value); charge(2);
    const result = array ? [] : {}; let first = true;
    for (const key of orderedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      requireValue(descriptor?.enumerable && Object.hasOwn(descriptor, "value"));
      if (!first) charge(1); first = false;
      if (!array) charge(Buffer.byteLength(JSON.stringify(key)) + 1);
      Object.defineProperty(result, key, { value: visit(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    active.delete(value); return result;
  };
  return visit(input, 0);
}
const exact = (value, keys) => requireValue(value && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
const id = value => requireValue(typeof value === "string" && ID.test(value));
const digest = value => requireValue(typeof value === "string" && SHA.test(value));
const revision = (value, min = 1) => requireValue(Number.isSafeInteger(value) && value >= min && value <= 2147483647);
const moduleId = value => requireValue(["events", "volunteers"].includes(value));
const utc = value => requireValue(validInstant(value) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value, "checkin_time");
// Match participationTerms' operational-text profile; legitimate multiline
// frozen instructions must not become ineligible because this model is new.
const text = (value, max, nullable = false) => requireValue((nullable && value === null) || (typeof value === "string" && value.length <= max && !!value.trim() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)));
const rangeFields = value => {
  exact(value, ["startAt", "endAt", "timeZone"]);
  requireValue(validInstant(value.startAt) && validInstant(value.endAt) && validZone(value.timeZone) && /^[A-Za-z0-9_+./-]{1,100}$/.test(value.timeZone), "checkin_time");
  requireValue(agreesWithZone(value.startAt, value.timeZone) && agreesWithZone(value.endAt, value.timeZone) && Date.parse(value.startAt) < Date.parse(value.endAt), "checkin_time");
};

// JSON admission bound only. Full SQL-row accounting remains a backend duty.
function jsonbBytes(value) {
  const json = stable(value); let extra = 0, quoted = false, escaped = false;
  for (const c of json) {
    if (quoted) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === ":" || c === ",") extra++;
  }
  return Buffer.byteLength(json) + extra;
}
const bound = (value, max) => requireValue(jsonbBytes(value) <= max, "checkin_limit");
const namespaced = (kind, value) => hash({ method: CHECK_IN_METHOD, kind, ...value });

function arrival(range, claimedArrivalAt, serverNow) {
  rangeFields(range); utc(serverNow);
  requireValue(validInstant(claimedArrivalAt) && agreesWithZone(claimedArrivalAt, range.timeZone), "checkin_time");
  const S = Date.parse(range.startAt), E = Date.parse(range.endAt), A = Date.parse(claimedArrivalAt), N = Date.parse(serverNow);
  const reason = N < S ? "before-start" : N > E + CHECK_IN_LIMITS.afterEndMs ? "after-window" : A < S || A >= E ? "claim-outside-range" : A > N ? "claim-future" : null;
  return freeze({ eligible: reason === null, reason, eligibleFrom: range.startAt, eligibleThrough: new Date(E + CHECK_IN_LIMITS.afterEndMs).toISOString() });
}
export function checkInArrivalEligibility(range, claimedArrivalAt, serverNow) {
  return arrival(owned(range, 1024), claimedArrivalAt, serverNow);
}

function contextFields(context) {
  exact(context, CONTEXT_KEYS);
  for (const key of ["id", "orgId", "participationId", "bookingRecordId"]) id(context[key]);
  moduleId(context.moduleId); revision(context.revision); revision(context.intakeRevision);
  const f = context.frozen, optional = ["interval", "allocationHash"].filter(key => Object.hasOwn(f ?? {}, key));
  exact(f, ["terms", "sourceRevision", "termsHash", "candidateRevision", "candidateApproval", "programId", ...optional]);
  revision(f.sourceRevision); revision(f.candidateRevision); digest(f.termsHash); if (f.programId !== null) id(f.programId);
  const terms = f.terms, policy = Object.hasOwn(terms ?? {}, "intervalPolicy");
  exact(terms, ["title", "kind", "startAt", "endAt", "timeZone", "participationPurpose", "participantInstructions", "organizerEmail", "organizerUrl", ...(policy ? ["intervalPolicy"] : [])]);
  requireValue(terms.kind === (context.moduleId === "events" ? "session" : "shift"));
  text(terms.title, 180); text(terms.participationPurpose, 600); text(terms.participantInstructions, 600, true); text(terms.organizerEmail, 254, true); text(terms.organizerUrl, 500, true);
  requireValue(terms.organizerEmail !== null || terms.organizerUrl !== null);
  if (terms.organizerEmail !== null) requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(terms.organizerEmail));
  if (terms.organizerUrl !== null) { let u; try { u = new URL(terms.organizerUrl); } catch { bad(); } requireValue(u.protocol === "https:" && !u.username && !u.password && !/[\r\n]/.test(terms.organizerUrl)); }
  rangeFields({ startAt: terms.startAt, endAt: terms.endAt, timeZone: terms.timeZone });
  if (policy) { requireValue(context.moduleId === "volunteers"); exact(terms.intervalPolicy, ["version", "mode"]); requireValue(terms.intervalPolicy.version === 1 && terms.intervalPolicy.mode === "within-shift"); }
  requireValue(f.termsHash === hash(terms), "checkin_commitment");
  exact(f.candidateApproval, ["status", "revision", "actorId", "reason", "at"]);
  requireValue(f.candidateApproval.status === "approved" && f.candidateApproval.revision === f.candidateRevision, "checkin_commitment");
  id(f.candidateApproval.actorId);
  // A retained approval reason comes from existing clean(), not from this new
  // report form. Preserve its bounded admitted text rather than re-authoring it.
  requireValue(typeof f.candidateApproval.reason === "string" && !!f.candidateApproval.reason.trim() && f.candidateApproval.reason.length <= 2000);
  utc(f.candidateApproval.at);
  let r; try { r = frozenParticipationInterval({ module_id: context.moduleId, requested_interval: context.requestedInterval, frozen: f }); } catch { bad("checkin_commitment"); }
  return { range: { startAt: r.startAt, endAt: r.endAt, timeZone: r.timeZone }, allocationHash: f.allocationHash ?? null };
}
const contextHash = context => namespaced("commitment", { orgId: context.orgId, participationId: context.participationId, moduleId: context.moduleId, bookingRecordId: context.bookingRecordId, frozen: context.frozen, requestedInterval: context.requestedInterval });
export function checkInCommitmentSha256(input) { const value = owned(input); contextFields(value); return contextHash(value); }

function reportInput(input) {
  exact(input, REPORT_KEYS); revision(input.revision); revision(input.intakeRevision); requireValue(input.checkInRevision === 0);
  digest(input.commitmentSha256); requireValue(validInstant(input.claimedArrivalAt), "checkin_time");
  requireValue(input.reportConsent === true && input.consentVersion === CHECK_IN_CONSENT_VERSION, "checkin_affirmation");
  requireValue(typeof input.idempotencyKey === "string" && /^[A-Za-z0-9_-]{16,100}$/.test(input.idempotencyKey)); bound(input, CHECK_IN_LIMITS.requestBytes); return input;
}
function withdrawalInput(input) {
  exact(input, WITHDRAW_KEYS); revision(input.checkInRevision); digest(input.reportSha256); requireValue(input.withdraw === true, "checkin_affirmation");
  requireValue(typeof input.idempotencyKey === "string" && /^[A-Za-z0-9_-]{16,100}$/.test(input.idempotencyKey)); bound(input, CHECK_IN_LIMITS.requestBytes); return input;
}
export const validateReportInput = input => freeze(reportInput(owned(input, CHECK_IN_LIMITS.requestBytes)));
export const validateWithdrawalInput = input => freeze(withdrawalInput(owned(input, CHECK_IN_LIMITS.requestBytes)));
function claimHash(history) {
  const { claimSha256, withdrawnAt, ...body } = history;
  return namespaced("arrival-claim", { history: body });
}
function historyFields(history, checked = true) {
  exact(history, HISTORY_KEYS);
  for (const key of ["id", "originOrgId", "participationId", "bookingRecordId"]) id(history[key]);
  moduleId(history.moduleId); if (history.programId !== null) id(history.programId);
  exact(history.commitment, ["sourceRevision", "termsHash", "range", "allocationHash"]);
  revision(history.commitment.sourceRevision); digest(history.commitment.termsHash); rangeFields(history.commitment.range);
  if (history.commitment.allocationHash !== null) { requireValue(history.moduleId === "volunteers"); digest(history.commitment.allocationHash); }
  utc(history.submittedAt); exact(history.affirmation, ["version", "at", "actorHash"]);
  requireValue(history.affirmation.version === CHECK_IN_CONSENT_VERSION && history.affirmation.at === history.submittedAt); digest(history.affirmation.actorHash);
  requireValue(arrival(history.commitment.range, history.claimedArrivalAt, history.submittedAt).eligible, "checkin_time");
  if (history.withdrawnAt !== null) { utc(history.withdrawnAt); requireValue(Date.parse(history.withdrawnAt) >= Date.parse(history.submittedAt), "checkin_time"); }
  digest(history.claimSha256); if (checked) requireValue(history.claimSha256 === claimHash(history), "checkin_checksum"); bound(history, CHECK_IN_LIMITS.historyBytes);
  return history;
}
export function checkInClaimSha256(input) { const value = owned(input); historyFields(value, false); return claimHash(value); }
export const validateCheckInHistory = input => freeze(historyFields(owned(input)));

const intent = (request, actorId, action) => ({ intentHash: namespaced("intent", { actorId, action, key: request.idempotencyKey }), payloadHash: hash(request), actorHash: hash(actorId), action });
function receiptFields(receipt, action, history) {
  exact(receipt, ["intentHash", "payloadHash", "actorHash", "action", "result"]);
  for (const key of ["intentHash", "payloadHash", "actorHash"]) digest(receipt[key]);
  requireValue(receipt.action === action && receipt.actorHash === history.affirmation.actorHash);
  const result = receipt.result; exact(result, ["action", "id", "revision", "claimSha256", "at", "auditRetained"]);
  requireValue(result.action === (action === "report" ? "reported" : "withdrawn") && result.id === history.id && result.claimSha256 === history.claimSha256 && result.revision === (action === "report" ? 1 : 2));
  requireValue(result.at === (action === "report" ? history.submittedAt : history.withdrawnAt) && typeof result.auditRetained === "boolean");
  bound(receipt, CHECK_IN_LIMITS.receiptBytes); return receipt;
}
function recordFields(record) {
  exact(record, ["originMode", "revision", "liveParticipationId", "history", "reportReceipt", "withdrawalReceipt"]); historyFields(record.history);
  if (record.originMode === "recovered") requireValue(record.revision === 1 && record.liveParticipationId === null && record.reportReceipt === null && record.withdrawalReceipt === null, "checkin_inactive");
  else {
    requireValue(record.originMode === "live" && record.liveParticipationId === record.history.participationId);
    requireValue(record.revision === (record.history.withdrawnAt === null ? 1 : 2)); receiptFields(record.reportReceipt, "report", record.history);
    if (record.history.withdrawnAt === null) requireValue(record.withdrawalReceipt === null);
    else receiptFields(record.withdrawalReceipt, "withdraw", record.history);
  }
  bound(record, CHECK_IN_LIMITS.rowBytes); return record;
}
export const validateCheckInRecord = input => freeze(recordFields(owned(input)));
function disposition(record) {
  return freeze({ originMode: record.originMode, state: record.originMode === "recovered" ? "history-only" : record.history.withdrawnAt === null ? "reported" : "withdrawn", originalState: record.history.withdrawnAt === null ? "reported" : "withdrawn", revision: record.revision, staffReview: "not-recorded", attendance: null, workedMinutes: null });
}
export function currentCheckInDisposition(input) { return disposition(recordFields(owned(input))); }
const outcome = (record, result, replayed) => freeze({ record, result, currentDisposition: disposition(record), replayed });
function replay(receipt, command) {
  if (receipt.intentHash !== command.intentHash) return false;
  requireValue(receipt.payloadHash === command.payloadHash && receipt.actorHash === command.actorHash && receipt.action === command.action, "checkin_intent", 409); return true;
}
function actorMatches(record, actorId) { requireValue(record.originMode === "live" && record.history.affirmation.actorHash === hash(actorId), "checkin_inactive", 409); }

/** Proposes a candidate only. Backend must prove live own authorization BEFORE invocation. */
export function reportCheckIn(input) {
  const value = owned(input); exact(value, ["record", "request", "context", "actorId", "serverNow", "auditRetained"]); id(value.actorId);
  const request = reportInput(value.request), c = value.context;
  // Replay needs stable parent identity, not a new source/time approval.
  const command = intent(request, value.actorId, "report");
  if (value.record !== null) {
    exact(c, REPLAY_CONTEXT_KEYS); for (const key of ["orgId", "participationId", "bookingRecordId"]) id(c[key]); moduleId(c.moduleId);
    const record = recordFields(value.record); actorMatches(record, value.actorId);
    requireValue(record.history.originOrgId === c.orgId && record.history.participationId === c.participationId && record.history.moduleId === c.moduleId && record.history.bookingRecordId === c.bookingRecordId, "checkin_context", 409);
    if (replay(record.reportReceipt, command)) return outcome(record, record.reportReceipt.result, true);
    bad("checkin_exists", 409);
  }
  const effective = contextFields(c); utc(value.serverNow); requireValue(typeof value.auditRetained === "boolean");
  requireValue(c.revision === request.revision && c.intakeRevision === request.intakeRevision && contextHash(c) === request.commitmentSha256, "checkin_context", 409);
  requireValue(arrival(effective.range, request.claimedArrivalAt, value.serverNow).eligible, "checkin_window", 409);
  const history = { id: c.id, originOrgId: c.orgId, participationId: c.participationId, moduleId: c.moduleId, bookingRecordId: c.bookingRecordId, programId: c.frozen.programId, commitment: { sourceRevision: c.frozen.sourceRevision, termsHash: c.frozen.termsHash, range: effective.range, allocationHash: effective.allocationHash }, claimedArrivalAt: request.claimedArrivalAt, submittedAt: value.serverNow, affirmation: { version: CHECK_IN_CONSENT_VERSION, at: value.serverNow, actorHash: hash(value.actorId) }, claimSha256: "0".repeat(64), withdrawnAt: null };
  history.claimSha256 = claimHash(history); historyFields(history);
  const result = { action: "reported", id: history.id, revision: 1, claimSha256: history.claimSha256, at: value.serverNow, auditRetained: value.auditRetained };
  const record = recordFields({ originMode: "live", revision: 1, liveParticipationId: c.participationId, history, reportReceipt: { ...command, result }, withdrawalReceipt: null });
  return outcome(record, result, false);
}

/** Terminal retraction; it never changes original claim bytes/checksum or booking state. */
export function withdrawCheckIn(input) {
  const value = owned(input); exact(value, ["record", "request", "actorId", "serverNow", "auditRetained"]); id(value.actorId);
  const request = withdrawalInput(value.request), record = recordFields(value.record); actorMatches(record, value.actorId);
  const command = intent(request, value.actorId, "withdraw");
  if (record.withdrawalReceipt && replay(record.withdrawalReceipt, command)) return outcome(record, record.withdrawalReceipt.result, true);
  requireValue(record.revision === request.checkInRevision && record.history.claimSha256 === request.reportSha256 && record.history.withdrawnAt === null, "checkin_context", 409);
  utc(value.serverNow); requireValue(Date.parse(value.serverNow) >= Date.parse(record.history.submittedAt), "checkin_time"); requireValue(typeof value.auditRetained === "boolean");
  const history = { ...record.history, withdrawnAt: value.serverNow }, result = { action: "withdrawn", id: history.id, revision: 2, claimSha256: history.claimSha256, at: value.serverNow, auditRetained: value.auditRetained };
  return outcome(recordFields({ ...record, revision: 2, history, withdrawalReceipt: { ...command, result } }), result, false);
}

function backupFields(value) {
  exact(value, ["version", "entries"]); requireValue(value.version === 1 && Array.isArray(value.entries) && value.entries.length <= CHECK_IN_LIMITS.records, "checkin_limit");
  const ids = new Set(), parents = new Set();
  for (const entry of value.entries) {
    exact(entry, ["id", "history"]); historyFields(entry.history); requireValue(entry.id === entry.history.id);
    const parent = stable([entry.history.originOrgId, entry.history.participationId]); requireValue(!ids.has(entry.id) && !parents.has(parent), "checkin_duplicate"); ids.add(entry.id); parents.add(parent);
  }
  requireValue(Buffer.byteLength(stable(value)) <= CHECK_IN_LIMITS.familyBytes, "checkin_limit"); return value;
}
export function validateCheckInBackup(input) { return input === undefined ? undefined : freeze(backupFields(owned(input, CHECK_IN_LIMITS.familyBytes))); }
export function makeCheckInBackup(input) {
  const records = owned(input, CHECK_IN_LIMITS.familyBytes * 2); requireValue(Array.isArray(records) && records.length <= CHECK_IN_LIMITS.records, "checkin_limit");
  if (!records.length) return undefined;
  return freeze(backupFields({ version: 1, entries: records.map(record => { recordFields(record); return { id: record.history.id, history: record.history }; }) }));
}
export function restoreCheckInBackup(input) {
  const value = validateCheckInBackup(input);
  return freeze((value?.entries ?? []).map(({ history }) => recordFields({ originMode: "recovered", revision: 1, liveParticipationId: null, history, reportReceipt: null, withdrawalReceipt: null })));
}
