/** IO-free group values only. No returned value establishes live authority. */
import { isProxy } from "node:util/types";
import { hash, stable } from "./security.mjs";

export const GROUP_METHOD = "participation-group-v1";
export const GROUP_LIMITS = Object.freeze({
  groups: 100, members: 10, receipts: 12, familyBytes: 8 * 1024 * 1024,
  requestBytes: 16384, receiptBytes: 16384, historyBytes: 65536,
  previewTokenBytes: 8192, previewPayloadBytes: 4096,
  modelBytes: 131072, modelNodes: 4096, maxDepth: 16,
});
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const SHA = /^[a-f0-9]{64}$/;
const KEY = /^[A-Za-z0-9_-]{16,100}$/;
const OPS = ["create", "admit", "cancel", "close"];
const HASH_KINDS = ["command", "request", "child-intent", "roster", "selection", "pins", "review", "actor", "session", "membership", "restore-epoch", "frozen", "reason", "token"];
const PAYLOAD_KEYS = ["format", "version", "operation", "orgId", "groupId", "groupRevision", "actorSha256", "sessionSha256", "membershipSha256", "restoreEpochSha256", "rosterSha256", "selectionSha256", "pinsSha256", "reviewSha256", "issuedAtExact", "expiresAtExact"];
const AUTHORITY_KEYS = ["actorSha256", "sessionSha256", "membershipSha256", "memberCreatedAtExact", "restoreEpochSha256"];
const COMMIT_KEYS = ["version", "previewToken", "reviewSha256", "selection", "reasons", "idempotencyKey"];
const safeText = v => !/\p{Cc}/u.test(v) && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v);
const freeze = value => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
export class ParticipationGroupError extends Error {
  constructor(code = "participation_group_fields", status = 422) {
    super("Use the exact bounded group fields and reconcile the reviewed state.");
    this.name = "ParticipationGroupError"; this.code = code; this.status = status;
  }
}
const need = (condition, code = "participation_group_fields", status = 422) => {
  if (!condition) throw new ParticipationGroupError(code, status);
};

// Reject proxies before reflection and accessors before reading. Dense native
// arrays have exactly length + their own canonical enumerable value indices.
function owned(input, maxBytes) {
  need(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= GROUP_LIMITS.modelBytes);
  const active = new Set(); let nodes = 0, bytes = 0;
  const charge = n => { bytes += n; need(bytes <= maxBytes, "participation_group_limit"); };
  const visit = (v, depth) => {
    need(++nodes <= GROUP_LIMITS.modelNodes && depth <= GROUP_LIMITS.maxDepth, "participation_group_limit");
    if (v === null || typeof v === "boolean" || typeof v === "number") {
      need(typeof v !== "number" || Number.isFinite(v)); charge(Buffer.byteLength(JSON.stringify(v))); return v;
    }
    if (typeof v === "string") {
      need(v.length <= maxBytes && safeText(v));
      charge(Buffer.byteLength(JSON.stringify(v))); return v;
    }
    need(v && typeof v === "object" && !isProxy(v) && !active.has(v));
    const array = Array.isArray(v), proto = Object.getPrototypeOf(v);
    need(array ? proto === Array.prototype : proto === Object.prototype);
    const keys = Reflect.ownKeys(v);
    need(keys.every(k => typeof k === "string" && k.length <= 100 && safeText(k)));
    let ordered = keys;
    if (array) {
      const descriptor = Object.getOwnPropertyDescriptor(v, "length");
      need(descriptor && Object.hasOwn(descriptor, "value") && Number.isSafeInteger(descriptor.value) && descriptor.value >= 0 && descriptor.value <= 256, "participation_group_limit");
      ordered = Array.from({ length: descriptor.value }, (_, i) => String(i));
      const indices = new Set(ordered);
      need(keys.length === ordered.length + 1 && keys.every(k => k === "length" || indices.has(k)));
    } else need(keys.length <= 64, "participation_group_limit");
    active.add(v); charge(2); const out = array ? [] : {}; let first = true;
    for (const k of ordered) {
      const d = Object.getOwnPropertyDescriptor(v, k);
      need(d?.enumerable && Object.hasOwn(d, "value"));
      if (!first) charge(1); first = false;
      if (!array) charge(Buffer.byteLength(JSON.stringify(k)) + 1);
      Object.defineProperty(out, k, { value: visit(d.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    active.delete(v); return out;
  };
  return visit(input, 0);
}
export const ownGroupValue = (input, maxBytes = GROUP_LIMITS.modelBytes) => freeze(owned(input, maxBytes));
export const groupCanonical = input => stable(owned(input, GROUP_LIMITS.modelBytes));
const exact = (v, keys) => need(v && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k)));
const id = v => need(typeof v === "string" && ID.test(v));
const sha = v => need(typeof v === "string" && SHA.test(v));
const rev = v => need(Number.isSafeInteger(v) && v >= 1 && v <= 2147483647);
const version = v => need(v === 1);
const intentKey = v => need(typeof v === "string" && KEY.test(v));
const reason = v => need(typeof v === "string" && v.length <= 300 && !!v.trim() && safeText(v));
const boolOrNull = v => need(v === null || typeof v === "boolean");
const moduleId = v => need(["events", "volunteers"].includes(v));
const sortIds = a => a.slice().sort();
const equal = (a, b) => stable(a) === stable(b);
function idList(v, min = 1, max = GROUP_LIMITS.members) {
  need(Array.isArray(v) && v.length >= min && v.length <= max, "participation_group_limit");
  v.forEach(id); need(new Set(v).size === v.length, "participation_group_duplicate"); return sortIds(v);
}
function jsonbBytes(v) {
  const s = stable(v); let extra = 0, quoted = false, escaped = false;
  for (const c of s) {
    if (quoted) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === ":" || c === ",") extra++;
  }
  return Buffer.byteLength(s) + extra;
}
const retainedBound = (v, max) => need(jsonbBytes(v) <= max, "participation_group_limit");
function stamp(v) {
  need(typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(v) && Number(v.slice(0, 4)) > 0, "participation_group_time");
  const milliseconds = v.slice(0, 23) + "Z", date = new Date(milliseconds);
  need(Number.isFinite(date.getTime()) && date.toISOString() === milliseconds, "participation_group_time");
  return BigInt(date.getTime()) * 1000n + BigInt(v.slice(23, 26));
}
export function validateGroupExactStamp(input) { stamp(input); return input; }
export function compareGroupExactStamps(a, b) { const x = stamp(a), y = stamp(b); return x < y ? -1 : x > y ? 1 : 0; }
export function groupHash(kind, input) {
  need(typeof kind === "string" && HASH_KINDS.includes(kind));
  return hash({ method: GROUP_METHOD, kind, value: owned(input, GROUP_LIMITS.modelBytes) });
}

function create(v) {
  exact(v, ["version", "target", "members", "coordinatorIntakeId", "idempotencyKey"]); version(v.version);
  exact(v.target, ["targetId", "targetRevision", "sourceRevision"]); id(v.target.targetId); rev(v.target.targetRevision); rev(v.target.sourceRevision);
  need(Array.isArray(v.members) && v.members.length >= 2 && v.members.length <= GROUP_LIMITS.members, "participation_group_limit");
  for (const m of v.members) { exact(m, ["participationId", "revision"]); id(m.participationId); rev(m.revision); }
  need(new Set(v.members.map(m => m.participationId)).size === v.members.length, "participation_group_duplicate");
  if (v.coordinatorIntakeId !== null) id(v.coordinatorIntakeId); intentKey(v.idempotencyKey);
  return { ...v, members: v.members.slice().sort((a, b) => a.participationId < b.participationId ? -1 : a.participationId > b.participationId ? 1 : 0) };
}
export const validateGroupCreate = input => freeze(create(owned(input, GROUP_LIMITS.requestBytes)));
function selection(v, roster, operation) {
  exact(v, ["mode", "items"]); need(["all", "subset"].includes(v.mode));
  const members = idList(roster, operation === "admit" ? 2 : 1), set = new Set(members);
  if (v.mode === "all") { need(operation === "admit" && Array.isArray(v.items) && v.items.length === 0); return { mode: "all", items: [] }; }
  const items = idList(v.items); need(items.every(x => set.has(x)), "participation_group_selection");
  if (operation === "admit") need(items.length < members.length, "participation_group_selection");
  return { mode: "subset", items };
}
export function validateGroupSelection(input, rosterIds) {
  return freeze(selection(owned(input, GROUP_LIMITS.requestBytes), owned(rosterIds, GROUP_LIMITS.requestBytes), "admit"));
}
export function validateGroupCancellationSelection(input, admittedIds) {
  return freeze(selection(owned(input, GROUP_LIMITS.requestBytes), owned(admittedIds, GROUP_LIMITS.requestBytes), "cancel"));
}
function reasons(v, selected, cancellation = false) {
  need(Array.isArray(v) && v.length <= GROUP_LIMITS.members, "participation_group_limit");
  for (const x of v) { exact(x, ["participationId", "reason"]); id(x.participationId); reason(x.reason); need(selected.includes(x.participationId), "participation_group_selection"); }
  need(new Set(v.map(x => x.participationId)).size === v.length, "participation_group_duplicate");
  if (cancellation) need(v.length === selected.length && v.every(x => x.reason === v[0].reason));
  return v.slice().sort((a, b) => a.participationId < b.participationId ? -1 : a.participationId > b.participationId ? 1 : 0);
}
export function validateGroupPreviewAdmission(input, rosterIds) {
  const v = owned(input, GROUP_LIMITS.requestBytes), roster = owned(rosterIds, GROUP_LIMITS.requestBytes);
  exact(v, ["version", "groupRevision", "selection", "reasons"]); version(v.version); need(v.groupRevision === 1);
  const s = selection(v.selection, roster, "admit"), selected = s.mode === "all" ? idList(roster, 2) : s.items;
  return freeze({ ...v, selection: s, reasons: reasons(v.reasons, selected) });
}
export function validateGroupPreviewCancellation(input, admittedIds) {
  const v = owned(input, GROUP_LIMITS.requestBytes), roster = owned(admittedIds, GROUP_LIMITS.requestBytes);
  exact(v, ["version", "groupRevision", "selected", "reason"]); version(v.version); rev(v.groupRevision); need(v.groupRevision >= 2 && v.groupRevision < GROUP_LIMITS.receipts);
  const s = selection({ mode: "subset", items: v.selected }, roster, "cancel"); reason(v.reason);
  return freeze({ ...v, selected: s.items });
}
export function validateGroupPreviewPayload(input) {
  const v = owned(input, GROUP_LIMITS.previewPayloadBytes); exact(v, PAYLOAD_KEYS);
  need(v.format === "charitology-participation-group-preview"); version(v.version); need(["admit", "cancel"].includes(v.operation));
  id(v.orgId); id(v.groupId); rev(v.groupRevision);
  need(v.operation === "admit" ? v.groupRevision === 1 : v.groupRevision >= 2 && v.groupRevision < GROUP_LIMITS.receipts);
  for (const k of ["actorSha256", "sessionSha256", "membershipSha256", "restoreEpochSha256", "rosterSha256", "selectionSha256", "pinsSha256", "reviewSha256"]) sha(v[k]);
  need(stamp(v.expiresAtExact) - stamp(v.issuedAtExact) === 600000000n, "participation_group_time");
  return freeze(v);
}
function commit(v, operation) {
  exact(v, COMMIT_KEYS); version(v.version); sha(v.reviewSha256); intentKey(v.idempotencyKey);
  need(typeof v.previewToken === "string" && Buffer.byteLength(v.previewToken) <= GROUP_LIMITS.previewTokenBytes && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(v.previewToken), "participation_group_token");
  exact(v.selection, ["mode", "items"]); need(["all", "subset"].includes(v.selection.mode));
  if (v.selection.mode === "all") need(operation === "admit" && Array.isArray(v.selection.items) && v.selection.items.length === 0);
  else idList(v.selection.items);
  need(Array.isArray(v.reasons) && v.reasons.length <= GROUP_LIMITS.members);
  // An all-selection's full roster is deliberately supplied by the separate
  // trusted context validator, never inferred from its reason entries.
  const selected = v.selection.mode === "all" ? v.reasons.map(x => { exact(x, ["participationId", "reason"]); return x.participationId; }) : idList(v.selection.items);
  const r = reasons(v.reasons, selected, operation === "cancel");
  return { ...v, selection: { mode: v.selection.mode, items: sortIds(v.selection.items) }, reasons: r };
}
export function validateGroupCommit(input, context) {
  const c = owned(context, GROUP_LIMITS.requestBytes);
  exact(c, ["operation", "rosterIds"]); need(["admit", "cancel"].includes(c.operation));
  const v = commit(owned(input, GROUP_LIMITS.requestBytes), c.operation);
  const s = selection(v.selection, c.rosterIds, c.operation), selected = s.mode === "all" ? idList(c.rosterIds, 2) : s.items;
  return freeze({ ...v, selection: s, reasons: reasons(v.reasons, selected, c.operation === "cancel") });
}
function close(v) { exact(v, ["version", "groupRevision", "reason", "idempotencyKey"]); version(v.version); need(v.groupRevision === 1); reason(v.reason); intentKey(v.idempotencyKey); return v; }
export const validateGroupClose = input => freeze(close(owned(input, GROUP_LIMITS.requestBytes)));

/** Canonical value intent; signature/selection/live permissions remain separate. */
export function groupCommandHashes(input) {
  const v = owned(input, GROUP_LIMITS.modelBytes); exact(v, ["orgId", "actorId", "groupId", "operation", "input"]);
  id(v.orgId); id(v.actorId); need(OPS.includes(v.operation));
  v.input = owned(v.input, GROUP_LIMITS.requestBytes);
  let canonicalInput;
  if (v.operation === "create") { need(v.groupId === null); canonicalInput = create(v.input); }
  else { id(v.groupId); canonicalInput = v.operation === "close" ? close(v.input) : commit(v.input, v.operation); }
  // Canonical typed values include sorted roster/selection/reason arrays. Raw
  // wire-byte retention for an uncertain Retry is a separate client duty.
  return freeze({ commandHash: groupHash("command", { orgId: v.orgId, actorId: v.actorId, key: canonicalInput.idempotencyKey }), requestHash: groupHash("request", { operation: v.operation, groupIdOrNull: v.groupId, exactOwnedInput: canonicalInput }) });
}
export function deriveGroupChildKey(input) {
  const v = owned(input, 2048); exact(v, ["groupId", "commandHash", "operation", "participationId", "action"]);
  id(v.groupId); id(v.participationId); sha(v.commandHash);
  need(v.operation === "admit" ? ["confirm", "promote"].includes(v.action) : v.operation === "cancel" && v.action === "cancel");
  return groupHash("child-intent", v);
}

function result(v, operation) {
  const base = ["groupId", "groupRevision", "state"];
  id(v?.groupId); rev(v.groupRevision);
  if (operation === "create") {
    exact(v, [...base, "target", "rosterIds", "coordinatorIntakeId"]); need(v.groupRevision === 1 && v.state === "draft");
    exact(v.target, ["targetId", "moduleId"]); id(v.target.targetId); moduleId(v.target.moduleId); const ids = idList(v.rosterIds, 2); need(equal(ids, v.rosterIds));
    if (v.coordinatorIntakeId !== null) id(v.coordinatorIntakeId);
  } else if (operation === "admit") {
    exact(v, [...base, "selectionMode", "selected", "unselectedIds", "reasonHashes", "auditRetained"]); need(v.groupRevision === 2 && v.state === "admitted" && ["all", "subset"].includes(v.selectionMode));
    need(Array.isArray(v.selected) && v.selected.length >= 1 && v.selected.length <= GROUP_LIMITS.members);
    for (const x of v.selected) {
      exact(x, ["participationId", "action", "resultRevision", "state", "frozenSha256", "allocationHash", "notificationQueued", "auditRetained"]);
      id(x.participationId); rev(x.resultRevision); need(x.resultRevision >= 2 && ["confirm", "promote"].includes(x.action) && x.state === "confirmed"); sha(x.frozenSha256); if (x.allocationHash !== null) sha(x.allocationHash); need(typeof x.notificationQueued === "boolean"); boolOrNull(x.auditRetained);
    }
    const selected = idList(v.selected.map(x => x.participationId)), rest = v.unselectedIds;
    need(equal(selected, v.selected.map(x => x.participationId)) && Array.isArray(rest));
    if (rest.length) need(equal(idList(rest), rest));
    need(selected.length + rest.length >= 2 && selected.length + rest.length <= GROUP_LIMITS.members && rest.every(x => !selected.includes(x)));
    need(v.selectionMode === "all" ? rest.length === 0 : rest.length > 0);
    need(Array.isArray(v.reasonHashes) && v.reasonHashes.length <= selected.length);
    for (const x of v.reasonHashes) { exact(x, ["participationId", "sha256"]); id(x.participationId); sha(x.sha256); need(selected.includes(x.participationId)); }
    need(new Set(v.reasonHashes.map(x => x.participationId)).size === v.reasonHashes.length && equal(v.reasonHashes.map(x => x.participationId), sortIds(v.reasonHashes.map(x => x.participationId))));
    need(typeof v.auditRetained === "boolean");
  } else if (operation === "cancel") {
    exact(v, [...base, "selected", "reasonSha256", "auditRetained"]); need(v.state === "admitted" && v.groupRevision >= 3 && v.groupRevision <= GROUP_LIMITS.receipts);
    need(Array.isArray(v.selected) && v.selected.length >= 1 && v.selected.length <= GROUP_LIMITS.members);
    for (const x of v.selected) { exact(x, ["participationId", "resultRevision", "state", "notificationQueued", "auditRetained"]); id(x.participationId); rev(x.resultRevision); need(x.resultRevision >= 3 && x.state === "cancelled" && typeof x.notificationQueued === "boolean"); boolOrNull(x.auditRetained); }
    const ids = v.selected.map(x => x.participationId); need(equal(idList(ids), ids)); sha(v.reasonSha256); need(typeof v.auditRetained === "boolean");
  } else {
    need(operation === "close"); exact(v, [...base, "reasonSha256", "auditRetained"]); need(v.state === "closed" && v.groupRevision === 2); sha(v.reasonSha256); need(typeof v.auditRetained === "boolean");
  }
  return v;
}
function receipt(v) {
  exact(v, ["version", "groupId", "operation", "commandHash", "requestHash", "authority", "reviewSha256", "acceptedAtExact", "result"]); version(v.version); id(v.groupId); need(OPS.includes(v.operation)); sha(v.commandHash); sha(v.requestHash);
  exact(v.authority, AUTHORITY_KEYS); for (const k of AUTHORITY_KEYS.filter(k => k !== "memberCreatedAtExact")) sha(v.authority[k]);
  need(stamp(v.acceptedAtExact) >= stamp(v.authority.memberCreatedAtExact), "participation_group_time");
  if (["create", "close"].includes(v.operation)) need(v.reviewSha256 === null); else sha(v.reviewSha256);
  result(v.result, v.operation); need(v.result.groupId === v.groupId); retainedBound(v, GROUP_LIMITS.receiptBytes); return v;
}
export const validateGroupReceipt = input => freeze(receipt(owned(input, GROUP_LIMITS.receiptBytes)));
function history(v) {
  exact(v, ["version", "id", "originOrgId", "moduleId", "targetId", "rosterIds", "coordinatorIntakeId", "createdAtExact", "decisions"]); version(v.version); id(v.id); id(v.originOrgId); moduleId(v.moduleId); id(v.targetId);
  const roster = idList(v.rosterIds, 2); need(equal(roster, v.rosterIds)); if (v.coordinatorIntakeId !== null) id(v.coordinatorIntakeId);
  let at = stamp(v.createdAtExact); need(Array.isArray(v.decisions) && v.decisions.length >= 1 && v.decisions.length <= GROUP_LIMITS.receipts, "participation_group_limit");
  let admitted = null, terminal = false; const cancelled = new Set();
  v.decisions.forEach((d, index) => {
    exact(d, ["operation", "acceptedAtExact", "result"]); need(OPS.includes(d.operation)); const next = stamp(d.acceptedAtExact); need(next >= at, "participation_group_time"); at = next;
    result(d.result, d.operation); need(d.result.groupId === v.id && d.result.groupRevision === index + 1);
    if (index === 0) {
      need(d.operation === "create" && d.acceptedAtExact === v.createdAtExact && d.result.target.targetId === v.targetId && d.result.target.moduleId === v.moduleId && equal(d.result.rosterIds, roster) && d.result.coordinatorIntakeId === v.coordinatorIntakeId);
    } else if (index === 1) {
      need(["admit", "close"].includes(d.operation)); terminal = d.operation === "close";
      if (!terminal) { admitted = new Set(d.result.selected.map(x => x.participationId)); need(equal(sortIds([...admitted, ...d.result.unselectedIds]), roster)); }
    } else {
      need(!terminal && admitted !== null && d.operation === "cancel");
      for (const x of d.result.selected) { need(admitted.has(x.participationId) && !cancelled.has(x.participationId), "participation_group_noop", 409); cancelled.add(x.participationId); }
    }
  });
  retainedBound(v, GROUP_LIMITS.historyBytes); return v;
}
export const validateGroupHistory = input => freeze(history(owned(input, GROUP_LIMITS.historyBytes)));
/** Drops all session/key/authority capabilities; creates no live group state. */
export function projectGroupHistory(input) {
  const v = owned(input, GROUP_LIMITS.modelBytes); exact(v, ["originOrgId", "receipts"]); id(v.originOrgId);
  need(Array.isArray(v.receipts) && v.receipts.length >= 1 && v.receipts.length <= GROUP_LIMITS.receipts, "participation_group_limit");
  v.receipts.forEach(receipt); need(new Set(v.receipts.map(x => x.commandHash)).size === v.receipts.length, "participation_group_duplicate");
  const first = v.receipts[0]; need(first.operation === "create");
  const r = first.result;
  return freeze(history({ version: 1, id: first.groupId, originOrgId: v.originOrgId, moduleId: r.target.moduleId, targetId: r.target.targetId, rosterIds: r.rosterIds, coordinatorIntakeId: r.coordinatorIntakeId, createdAtExact: first.acceptedAtExact, decisions: v.receipts.map(x => ({ operation: x.operation, acceptedAtExact: x.acceptedAtExact, result: x.result })) }));
}

export const PARTICIPATION_GROUP_CONTRACT = freeze({
  method: GROUP_METHOD, limits: GROUP_LIMITS, nominalBoundsMeasured: false,
  authority: "All values are candidates only; backend rederives authorization, SQL time, typed relationships and combined capacity.",
  previewPayloadKeys: PAYLOAD_KEYS, receiptAuthorityKeys: AUTHORITY_KEYS,
  commitKeys: COMMIT_KEYS, operations: OPS,
  selection: { admission: "all with empty items, or proper nonempty subset", cancellation: "nonempty subset; may contain every admitted ID" },
  trustedCommitContextKeys: ["operation", "rosterIds"],
  commandHashInputKeys: ["orgId", "actorId", "groupId", "operation", "input"],
  childKeyInputKeys: ["groupId", "commandHash", "operation", "participationId", "action"],
  historyKeys: ["version", "id", "originOrgId", "moduleId", "targetId", "rosterIds", "coordinatorIntakeId", "createdAtExact", "decisions"],
  receiptKeys: ["version", "groupId", "operation", "commandHash", "requestHash", "authority", "reviewSha256", "acceptedAtExact", "result"],
  createKeys: ["version", "target", "members", "coordinatorIntakeId", "idempotencyKey"],
  createTargetKeys: ["targetId", "targetRevision", "sourceRevision"],
  createMemberKeys: ["participationId", "revision"],
  admissionPreviewKeys: ["version", "groupRevision", "selection", "reasons"],
  cancellationPreviewKeys: ["version", "groupRevision", "selected", "reason"],
  closeKeys: ["version", "groupRevision", "reason", "idempotencyKey"],
  reasonKeys: ["participationId", "reason"],
  resultKeys: {
    create: ["groupId", "groupRevision", "state", "target", "rosterIds", "coordinatorIntakeId"],
    admit: ["groupId", "groupRevision", "state", "selectionMode", "selected", "unselectedIds", "reasonHashes", "auditRetained"],
    cancel: ["groupId", "groupRevision", "state", "selected", "reasonSha256", "auditRetained"],
    close: ["groupId", "groupRevision", "state", "reasonSha256", "auditRetained"],
  },
  admittedItemKeys: ["participationId", "action", "resultRevision", "state", "frozenSha256", "allocationHash", "notificationQueued", "auditRetained"],
  cancelledItemKeys: ["participationId", "resultRevision", "state", "notificationQueued", "auditRetained"],
  reasonHashKeys: ["participationId", "sha256"],
  historicalDecisionKeys: ["operation", "acceptedAtExact", "result"],
  historyProjectionInputKeys: ["originOrgId", "receipts"],
  temporal: "Exact six-digit SQL UTC calendar stamps; expiry exactly600000000 microseconds; no current-clock default.",
  tokenValidation: "Syntax/size only here; no signature, encoding or live-time authority. Separate HMAC module must verify canonical base64url/MAC and caller-supplied SQL now.",
  gatewayDuties: ["same outer transaction", "real current session/membership/scope", "duplicate booking/contact/intake identities", "independent per-person consent/approval", "fresh complete row pins", "waitlist bypass reasons", "whole prospective occupancy/overlap", "raw SQL/native/inactive/future-exit budgets", "receiptReplay before fresh eligibility", "current dispositions separate from immutable accepted result"],
  omitted: ["HMAC signing", "domain transition execution", "storage/schema/ACL", "capacity/backup integration", "HTTP/UI", "native codec changes"],
});
