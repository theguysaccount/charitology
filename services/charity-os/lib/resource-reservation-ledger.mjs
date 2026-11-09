/** Detached reservation data and command planning. The transaction supplies
 * current source proofs, verified authority, complete inventory and SQL time. */
import { isProxy } from "node:util/types";
import { fail, hash, stable } from "./security.mjs";
import {
  compareGroupExactStamps,
  ownGroupValue,
  validateGroupExactStamp,
} from "./participation-group-model.mjs";
import {
  EXCLUSIVE_RESOURCE_LIMITS,
  ResourceReservationError,
  reviewExclusiveResourceCapacity,
  validateExclusiveResourceInterval,
  validateHistoricalExclusiveResourceInterval,
} from "./resource-reservation-model.mjs";

export const RESOURCE_RESERVATION_METHOD = "exclusive-resource-reservation-v1";
export const RESOURCE_RESERVATION_LIMITS = Object.freeze({
  rows: EXCLUSIVE_RESOURCE_LIMITS.reservations,
  familyBytes: 8 * 1024 * 1024,
  rowBytes: 16 * 1024,
  historyBytes: 8 * 1024,
  proofBytes: 4 * 1024,
  receiptBytes: 4 * 1024,
  requestBytes: 16 * 1024,
  tokenBytes: 8 * 1024,
  reasonCharacters: 300,
});
const limits = RESOURCE_RESERVATION_LIMITS;
const operations = ["reserve", "release", "replace"];
const authorityKeys = [
  "actorSha256", "sessionSha256", "membershipSha256", "memberCreatedAtExact",
  "restoreEpochSha256",
];
const format = "charitology-resource-reservations";
const digest = (kind, value) => hash({ method: RESOURCE_RESERVATION_METHOD, kind, value });
const bytes = value => Buffer.byteLength(stable(value));
const same = (a, b) => stable(a) === stable(b);
const need = (condition, code) => {
  if (!condition) throw new ResourceReservationError(code);
};

function owned(value, max) {
  try { return ownGroupValue(value, max); }
  catch { throw new ResourceReservationError("resource_reservation_value"); }
}

function property(value, key) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  need(descriptor?.enumerable && Object.hasOwn(descriptor, "value"));
  return descriptor.value;
}

// Shallow admission lets each row have its own bound inside the bounded family.
function fields(value, keys) {
  need(value && typeof value === "object" && !isProxy(value) &&
    Object.getPrototypeOf(value) === Object.prototype);
  const actual = Reflect.ownKeys(value);
  need(actual.length === keys.length && keys.every(key => actual.includes(key)));
  return Object.fromEntries(keys.map(key => [key, property(value, key)]));
}

function dense(value, max) {
  need(!isProxy(value) && Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype);
  const length = Object.getOwnPropertyDescriptor(value, "length").value;
  need(length <= max, "resource_reservation_limit");
  need(Reflect.ownKeys(value).length === length + 1);
  return Array.from({ length }, (_, index) => property(value, String(index)));
}

function id(value, min = 1) {
  need(typeof value === "string" && value.length >= min && value.length <= 100 &&
    !/[^A-Za-z0-9_-]/.test(value));
}

function sha(value) {
  need(typeof value === "string" && value.length === 64 && !/[^a-f0-9]/.test(value));
}

function stamp(value) {
  try { validateGroupExactStamp(value); }
  catch { throw new ResourceReservationError("resource_reservation_time"); }
}

function reason(value) {
  // owned() has already rejected control characters and unpaired surrogates.
  need(typeof value === "string" && value.length <= limits.reasonCharacters && value.trim().length > 0);
}

function revision(value) {
  need(Number.isInteger(value) && value >= 1 && value <= 2147483647);
}

function sourcePin(value, moduleId, kind) {
  fields(value, ["id", "moduleId", "kind", "revision", "createdAtExact", "dataSha256", "approvalSha256"]);
  id(value.id);
  need(value.moduleId === moduleId && value.kind === kind);
  revision(value.revision);
  stamp(value.createdAtExact);
  sha(value.dataSha256);
  sha(value.approvalSha256);
}

function proof(input, current = false) {
  const value = owned(input, limits.proofBytes);
  fields(value, ["version", "orgId", "asset", "session", "quantity", "interval"]);
  need(value.version === 1 && value.quantity === 1);
  id(value.orgId);
  sourcePin(value.asset, "assets", "asset");
  sourcePin(value.session, "events", "session");
  need(value.asset.id !== value.session.id);
  validateHistoricalExclusiveResourceInterval(value.interval);
  if (current) validateExclusiveResourceInterval(value.interval);
  return value;
}

export const freezeResourceReservationProof = input => proof(input, true);
export const resourceReservationProofSha256 = input => digest("source-proof", proof(input));

const actorDigest = (orgId, actorId) => digest("actor", { orgId, actorId });

export function makeResourceReservationAuthority(input) {
  const value = owned(input, 2048);
  fields(value, [
    "orgId", "actorId", "sessionId", "role", "programIds", "memberRevision",
    "memberCreatedAtExact", "restoreEpochSha256",
  ]);
  for (const key of ["orgId", "actorId", "sessionId"]) id(value[key]);
  need(["owner", "admin"].includes(value.role) && Array.isArray(value.programIds) &&
    value.programIds.length === 0, "resource_reservation_authority");
  revision(value.memberRevision);
  stamp(value.memberCreatedAtExact);
  sha(value.restoreEpochSha256);
  const { orgId, actorId, sessionId, role, memberRevision, memberCreatedAtExact, restoreEpochSha256 } = value;
  return Object.freeze({
    actorSha256: actorDigest(orgId, actorId),
    sessionSha256: digest("session", { orgId, actorId, sessionId }),
    membershipSha256: digest("membership", { orgId, actorId, role, memberRevision, memberCreatedAtExact }),
    memberCreatedAtExact,
    restoreEpochSha256,
  });
}

function validateAuthority(input) {
  const value = owned(input, 2048);
  fields(value, authorityKeys);
  for (const key of authorityKeys) {
    if (key === "memberCreatedAtExact") stamp(value[key]);
    else sha(value[key]);
  }
  return value;
}

function currentAuthority(input, orgId, actorId) {
  const value = validateAuthority(input);
  need(value.actorSha256 === actorDigest(orgId, actorId), "resource_reservation_authority");
  return value;
}

export function validateResourceReservationRequest(operation, input) {
  need(operations.includes(operation));
  const value = owned(input, limits.requestBytes);
  const keys = ["version", "idempotencyKey"];
  if (operation !== "reserve") keys.push("reservationId", "reservationRevision", "reason");
  if (operation !== "release") keys.push("previewToken", "reviewSha256", "acknowledge");
  fields(value, keys);
  need(value.version === 1);
  id(value.idempotencyKey, 16);
  if (operation !== "reserve") {
    id(value.reservationId);
    need(value.reservationRevision === 1);
    reason(value.reason);
  }
  if (operation !== "release") {
    need(typeof value.previewToken === "string" && value.previewToken.length <= limits.tokenBytes &&
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(value.previewToken));
    sha(value.reviewSha256);
    need(value.acknowledge === true);
  }
  return value;
}

export function resourceReservationCommandHashes(input) {
  const { orgId, actorId, operation, request } = fields(input, ["orgId", "actorId", "operation", "request"]);
  id(orgId);
  id(actorId);
  const value = validateResourceReservationRequest(operation, request);
  return Object.freeze({
    commandHash: digest("command", { orgId, actorId, key: value.idempotencyKey }),
    requestHash: digest("request", { orgId, actorId, operation, request: value }),
  });
}

function effect(value, state, revision) {
  fields(value, ["id", "proofSha256", "state", "revision"]);
  id(value.id);
  sha(value.proofSha256);
  need(value.state === state && value.revision === revision);
}

function decision(value) {
  fields(value, ["operation", "orgId", "actorSha256", "acceptedAtExact", "previous", "next", "reason"]);
  need(operations.includes(value.operation));
  id(value.orgId);
  sha(value.actorSha256);
  stamp(value.acceptedAtExact);
  if (value.operation === "reserve") need(value.previous === null && value.reason === null);
  else {
    effect(value.previous, "released", 2);
    reason(value.reason);
  }
  if (value.operation === "release") need(value.next === null);
  else effect(value.next, "reserved", 1);
  if (value.operation === "replace") need(value.previous.id !== value.next.id);
  return value;
}

export function validateResourceReservationReceipt(input) {
  const value = owned(input, limits.receiptBytes);
  fields(value, ["version", "decision", "commandHash", "requestHash", "authority", "reviewSha256"]);
  need(value.version === 1);
  decision(value.decision);
  sha(value.commandHash);
  sha(value.requestHash);
  const authority = validateAuthority(value.authority);
  need(authority.actorSha256 === value.decision.actorSha256 &&
    compareGroupExactStamps(authority.memberCreatedAtExact, value.decision.acceptedAtExact) <= 0,
    "resource_reservation_authority");
  if (value.decision.operation === "release") need(value.reviewSha256 === null);
  else sha(value.reviewSha256);
  return value;
}

/** Caller checks current session, membership, scope and source incarnations
 * before looking up an accepted key. This comparison needs only that receipt. */
export function reconcileResourceReservationReceipt(input) {
  const value = fields(input, ["orgId", "actorId", "operation", "request", "authority", "receipt"]);
  const { orgId, actorId, operation, request } = value;
  const expected = resourceReservationCommandHashes({ orgId, actorId, operation, request });
  const authority = currentAuthority(value.authority, orgId, actorId);
  const receipt = validateResourceReservationReceipt(value.receipt);
  const checkedRequest = validateResourceReservationRequest(operation, request);
  if (receipt.decision.orgId !== orgId || receipt.decision.operation !== operation ||
      receipt.commandHash !== expected.commandHash || receipt.requestHash !== expected.requestHash ||
      receipt.reviewSha256 !== (checkedRequest.reviewSha256 ?? null) ||
      (receipt.decision.previous?.id ?? null) !== (checkedRequest.reservationId ?? null) ||
      receipt.decision.reason !== (checkedRequest.reason ?? null) ||
      !same(receipt.authority, authority)) {
    fail(409, "resource_reservation_reconcile", "This command or its current authority changed. Reload its recorded result.");
  }
  return receipt.decision;
}

function validateSourceDates(source, acceptedAtExact) {
  const start = new Date(Date.parse(source.interval.startAt)).toISOString().replace("Z", "000Z");
  need(compareGroupExactStamps(acceptedAtExact, start) < 0 &&
    [source.asset, source.session].every(pin => compareGroupExactStamps(pin.createdAtExact, acceptedAtExact) <= 0),
    "resource_reservation_time");
}

function validateActions(id, source, original, terminal) {
  const proofSha256 = digest("source-proof", source);
  need(original.orgId === source.orgId && original.next?.id === id &&
    original.next.proofSha256 === proofSha256, "resource_reservation_history");
  validateSourceDates(source, original.acceptedAtExact);
  if (terminal === null) return;
  need(terminal.orgId === source.orgId && terminal.previous?.id === id &&
    terminal.previous.proofSha256 === proofSha256 &&
    compareGroupExactStamps(original.acceptedAtExact, terminal.acceptedAtExact) <= 0,
    "resource_reservation_history");
}

function validateHistory(input) {
  const value = owned(input, limits.historyBytes);
  fields(value, ["version", "id", "sourceState", "proof", "original", "terminal", "disposition"]);
  need(value.version === 1);
  id(value.id);
  const source = proof(value.proof);
  const original = decision(value.original);
  const terminal = value.terminal === null ? null : decision(value.terminal);
  validateActions(value.id, source, original, terminal);
  need(value.sourceState === (terminal ? "released" : "reserved"), "resource_reservation_history");
  if (value.disposition !== null) {
    need(value.sourceState === "reserved", "resource_reservation_history");
    const disposition = fields(value.disposition, ["orgId", "actorSha256", "acceptedAtExact", "reason"]);
    id(disposition.orgId);
    sha(disposition.actorSha256);
    stamp(disposition.acceptedAtExact);
    reason(disposition.reason);
    need(compareGroupExactStamps(original.acceptedAtExact, disposition.acceptedAtExact) <= 0,
      "resource_reservation_time");
  }
  return value;
}

const historyState = history => history.disposition === null ? history.sourceState : "released";

export function validateResourceReservationRow(input) {
  const row = owned(input, limits.rowBytes);
  fields(row, ["version", "orgId", "id", "originMode", "state", "revision", "proof", "originalReceipt", "terminalReceipt", "history"]);
  need(row.version === 1);
  id(row.orgId);
  id(row.id);
  if (row.originMode === "recovered") {
    need(row.proof === null && row.originalReceipt === null && row.terminalReceipt === null);
    const history = validateHistory(row.history);
    need(history.id === row.id && row.state === historyState(history) &&
      row.revision === (history.disposition === null ? 1 : 2), "resource_reservation_history");
    return row;
  }
  need(row.originMode === "live" && row.history === null);
  const source = proof(row.proof);
  need(source.orgId === row.orgId);
  const original = validateResourceReservationReceipt(row.originalReceipt);
  const terminal = row.terminalReceipt === null ? null : validateResourceReservationReceipt(row.terminalReceipt);
  need(row.state === (terminal ? "released" : "reserved") && row.revision === (terminal ? 2 : 1));
  validateActions(row.id, source, original.decision, terminal?.decision ?? null);
  return row;
}

function chainEntry(row) {
  if (row.originMode === "live")
    return { id: row.id, mode: "live", original: row.originalReceipt, terminal: row.terminalReceipt };
  return historyEntry(row.history);
}

const historyEntry = history => ({
  id: history.id,
  mode: "recovered",
  original: { decision: history.original },
  terminal: history.terminal === null ? null : { decision: history.terminal },
});

function checkChains(entries) {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  need(byId.size === entries.length, "resource_reservation_history");
  const commands = new Set();
  for (const entry of entries) {
    const previous = entry.original.decision.previous;
    const next = entry.terminal?.decision.next;
    if (previous) {
      const predecessor = byId.get(previous.id);
      need(predecessor?.mode === entry.mode && same(predecessor.terminal, entry.original),
        "resource_reservation_history");
    }
    if (next) {
      const successor = byId.get(next.id);
      need(successor?.mode === entry.mode && same(successor.original, entry.terminal),
        "resource_reservation_history");
    }
    if (entry.mode !== "live") continue;
    for (const receipt of [entry.original, entry.terminal?.decision.operation === "release" ? entry.terminal : null]) {
      if (!receipt) continue;
      need(!commands.has(receipt.commandHash), "resource_reservation_command");
      commands.add(receipt.commandHash);
    }
  }
  // Each node has at most one successor. Equal exact times alone cannot rule
  // out a cycle, so explicitly walk the linked decisions once.
  const checked = new Set();
  for (const entry of entries) {
    const path = new Set();
    for (let cursor = entry; cursor && !checked.has(cursor.id);
      cursor = byId.get(cursor.terminal?.decision.next?.id)) {
      need(!path.has(cursor.id), "resource_reservation_history");
      path.add(cursor.id);
    }
    for (const id of path) checked.add(id);
  }
  return commands;
}

function ledger(orgId, input) {
  id(orgId);
  let used = 0;
  const rows = dense(input, limits.rows).map(value => {
    const row = validateResourceReservationRow(value);
    need(row.orgId === orgId);
    used += bytes(row);
    need(used <= limits.familyBytes, "resource_reservation_limit");
    return row;
  });
  return { rows: Object.freeze(rows), used, commands: checkChains(rows.map(chainEntry)) };
}

export const validateResourceReservationRows = (orgId, input) => ledger(orgId, input).rows;

const rowProof = row => row.proof ?? row.history.proof;
const capacityProjection = row => {
  const source = rowProof(row);
  return { id: row.id, assetId: source.asset.id, occurrenceId: source.session.id,
    originMode: row.originMode, state: row.state, interval: source.interval };
};

function activeRow(rows, request) {
  const row = rows.find(item => item.id === request.reservationId);
  if (row?.originMode !== "live" || row.state !== "reserved" || row.revision !== request.reservationRevision)
    fail(409, "resource_reservation_stale", "This internal hold changed. Reload before continuing.");
  return row;
}

function result(state, insert = null, update = null, receipt = null) {
  return Object.freeze({ state, insert, update, receipt });
}

/** Compute one prospective transaction. The caller owns review-token checks,
 * source revalidation, one org lock, final SQL capacity and mandatory audit. */
export function planResourceReservationWrite(input) {
  const { orgId, actorId, authority, operation, request, acceptedAtExact, rows, newReservation } =
    fields(input, ["orgId", "actorId", "authority", "operation", "request", "acceptedAtExact", "rows", "newReservation"]);
  const command = resourceReservationCommandHashes({ orgId, actorId, operation, request });
  const authorized = currentAuthority(authority, orgId, actorId);
  const checkedRequest = validateResourceReservationRequest(operation, request);
  stamp(acceptedAtExact);
  const retained = ledger(orgId, rows);
  if (retained.commands.has(command.commandHash))
    fail(409, "resource_reservation_reconcile", "This command already has a recorded result.");
  const old = operation === "reserve" ? null : activeRow(retained.rows, checkedRequest);
  let next = null;
  if (operation === "release") need(newReservation === null);
  else {
    const target = fields(newReservation, ["id", "proof"]);
    id(target.id);
    const source = freezeResourceReservationProof(target.proof);
    need(source.orgId === orgId);
    validateSourceDates(source, acceptedAtExact);
    need(!retained.rows.some(row => row.id === target.id), "resource_reservation_identity");
    const review = reviewExclusiveResourceCapacity({
      capacity: source.quantity,
      candidate: { assetId: source.asset.id, occurrenceId: source.session.id, interval: source.interval },
      reservations: retained.rows.map(capacityProjection),
      replacingReservationId: old?.id ?? null,
    });
    if (review.state !== "ready") return result(review.state);
    need(retained.rows.length < limits.rows, "resource_reservation_limit");
    next = { id: target.id, proof: source };
  }
  const receipt = validateResourceReservationReceipt({
    version: 1,
    decision: {
      operation, orgId, acceptedAtExact, actorSha256: authorized.actorSha256,
      previous: old && { id: old.id, proofSha256: digest("source-proof", old.proof), state: "released", revision: 2 },
      next: next && { id: next.id, proofSha256: digest("source-proof", next.proof), state: "reserved", revision: 1 },
      reason: checkedRequest.reason ?? null,
    },
    ...command,
    authority: authorized,
    reviewSha256: checkedRequest.reviewSha256 ?? null,
  });
  const insert = next && validateResourceReservationRow({
    version: 1, orgId, id: next.id, originMode: "live", state: "reserved", revision: 1,
    proof: next.proof, originalReceipt: receipt, terminalReceipt: null, history: null,
  });
  const update = old && validateResourceReservationRow({
    ...old, state: "released", revision: 2, terminalReceipt: receipt,
  });
  const nextBytes = retained.used + (insert ? bytes(insert) : 0) + (update ? bytes(update) - bytes(old) : 0);
  need(nextBytes <= limits.familyBytes, "resource_reservation_limit");
  return result("ready", insert, update, receipt);
}

function historyOf(row) {
  if (row.originMode === "recovered") return row.history;
  return validateHistory({
    version: 1, id: row.id, sourceState: row.state, proof: row.proof,
    original: row.originalReceipt.decision, terminal: row.terminalReceipt?.decision ?? null,
    disposition: null,
  });
}

function requireSourceLinks(histories, refs) {
  const sources = new Map();
  for (const item of dense(refs, limits.rows * 2)) {
    const { id: sourceId, moduleId } = fields(item, ["id", "moduleId"]);
    id(sourceId);
    need(["assets", "events"].includes(moduleId) && !sources.has(sourceId), "resource_reservation_source");
    sources.set(sourceId, moduleId);
  }
  for (const { proof: { asset, session } } of histories) {
    need(sources.get(asset.id) === "assets" && sources.get(session.id) === "events",
      "resource_reservation_source");
  }
}

function validateHistories(input) {
  let used = 0;
  return Object.freeze(dense(input, limits.rows).map(item => {
    const history = validateHistory(item);
    used += bytes(history) + 1;
    need(used <= limits.familyBytes, "resource_reservation_limit");
    return history;
  }));
}

function sealBackup(sourceOrgId, histories, checksum = undefined) {
  const body = { format, version: 1, method: RESOURCE_RESERVATION_METHOD, sourceOrgId, histories };
  const full = { ...body, checksum: digest("backup", body) };
  need(bytes(full) <= limits.familyBytes, "resource_reservation_limit");
  if (checksum !== undefined) need(checksum === full.checksum, "resource_reservation_checksum");
  return Object.freeze(full);
}

export function makeResourceReservationsBackup(orgId, rows, sourceRefs) {
  const retained = ledger(orgId, rows);
  if (!retained.rows.length) return undefined;
  const histories = Object.freeze(retained.rows.map(historyOf).sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  requireSourceLinks(histories, sourceRefs);
  return sealBackup(orgId, histories);
}

export function validateResourceReservationsBackup(input, sourceOrgId, sourceRefs) {
  if (input === undefined) return null;
  id(sourceOrgId);
  const value = fields(input, ["format", "version", "method", "sourceOrgId", "histories", "checksum"]);
  need(value.format === format && value.version === 1 && value.method === RESOURCE_RESERVATION_METHOD &&
    value.sourceOrgId === sourceOrgId, "resource_reservation_history");
  sha(value.checksum);
  const histories = validateHistories(value.histories);
  for (let index = 1; index < histories.length; index++)
    need(histories[index - 1].id < histories[index].id, "resource_reservation_history");
  checkChains(histories.map(historyEntry));
  requireSourceLinks(histories, sourceRefs);
  return sealBackup(sourceOrgId, histories, value.checksum);
}

export function restoreResourceReservationRows(orgId, input, sourceOrgId, sourceRefs) {
  id(orgId);
  const backup = validateResourceReservationsBackup(input, sourceOrgId, sourceRefs);
  return validateResourceReservationRows(orgId, (backup?.histories ?? []).map(history => ({
    version: 1, orgId, id: history.id, originMode: "recovered",
    state: historyState(history), revision: history.disposition === null ? 1 : 2,
    proof: null, originalReceipt: null, terminalReceipt: null, history,
  })));
}

/** Record an administrator's separate inactive-claim disposition. */
export function recordResourceRecoveryDisposition(input) {
  const { row: raw, orgId, actorId, authority, expectedRevision, acceptedAtExact, reason: writtenReason } =
    fields(input, ["row", "orgId", "actorId", "authority", "expectedRevision", "acceptedAtExact", "reason"]);
  id(orgId);
  id(actorId);
  const row = validateResourceReservationRow(raw);
  const authorized = currentAuthority(authority, orgId, actorId);
  stamp(acceptedAtExact);
  need(compareGroupExactStamps(authorized.memberCreatedAtExact, acceptedAtExact) <= 0,
    "resource_reservation_time");
  if (row.orgId !== orgId || row.originMode !== "recovered" || row.state !== "reserved" ||
      row.revision !== expectedRevision)
    fail(409, "resource_reservation_stale", "This recovered claim changed. Reload before continuing.");
  const history = validateHistory({ ...row.history,
    disposition: { orgId, actorSha256: authorized.actorSha256, acceptedAtExact, reason: writtenReason },
  });
  return validateResourceReservationRow({ ...row, state: "released", revision: 2, history });
}
