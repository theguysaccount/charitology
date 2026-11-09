import test from "node:test";
import assert from "node:assert/strict";
import {
  freezeResourceReservationProof,
  makeResourceReservationAuthority,
  makeResourceReservationsBackup,
  planResourceReservationWrite,
  reconcileResourceReservationReceipt,
  recordResourceRecoveryDisposition,
  resourceReservationCommandHashes,
  resourceReservationProofSha256,
  restoreResourceReservationRows,
  validateResourceReservationRow,
  validateResourceReservationRows,
  validateResourceReservationsBackup,
} from "../lib/resource-reservation-ledger.mjs";

const exact = "2026-11-08T12:00:00.000001Z";
const later = "2026-11-08T12:00:00.000002Z";
const sha = character => character.repeat(64);
const interval = (startAt = "2026-11-10T09:00:00-05:00", endAt = "2026-11-10T10:00:00-05:00") =>
  ({ startAt, endAt, timeZone: "America/New_York" });
const pin = (id, moduleId, kind) => ({
  id, moduleId, kind, revision: 3, createdAtExact: "2026-11-01T12:00:00.000001Z",
  dataSha256: sha("a"), approvalSha256: sha("b"),
});
const source = (asset = "room", session = "event", span = interval(), orgId = "org") => ({
  version: 1, orgId, asset: pin(asset, "assets", "asset"),
  session: pin(session, "events", "session"), quantity: 1, interval: span,
});
const authority = (changes = {}) => makeResourceReservationAuthority({
  orgId: "org", actorId: "actor", sessionId: "session", role: "admin", programIds: [],
  memberRevision: 1, memberCreatedAtExact: "2026-11-01T12:00:00.000002Z",
  restoreEpochSha256: sha("c"), ...changes,
});
const review = (idempotencyKey = "one-command-key-01") => ({
  version: 1, idempotencyKey, previewToken: "review." + "A".repeat(43),
  reviewSha256: sha("d"), acknowledge: true,
});
const release = (reservationId = "hold", idempotencyKey = "two-command-key-02") => ({
  version: 1, reservationId, reservationRevision: 1, reason: "Equipment is available again.", idempotencyKey,
});
const replace = (reservationId = "hold", idempotencyKey = "three-command-key-03") =>
  ({ ...release(reservationId, idempotencyKey), ...review(idempotencyKey) });
const plan = (change = {}) => planResourceReservationWrite({
  orgId: "org", actorId: "actor", authority: authority(), operation: "reserve",
  request: review(), acceptedAtExact: exact, rows: [],
  newReservation: { id: "hold", proof: source() }, ...change,
});
const refs = (...sources) => Array.from(new Map(sources.flatMap(proof =>
  [proof.asset, proof.session]).map(pin => [pin.id, { id: pin.id, moduleId: pin.moduleId }])).values());

test("Reserve freezes minimal selected pins and uses the exact SQL instant before start", () => {
  const proof = source();
  const outcome = plan({
    acceptedAtExact: "2026-11-10T13:59:59.999999Z", newReservation: { id: "hold", proof },
  });
  assert.equal(outcome.state, "ready");
  assert.equal(outcome.update, null);
  assert.equal(outcome.receipt.decision.acceptedAtExact, "2026-11-10T13:59:59.999999Z");
  assert.equal(outcome.receipt.decision.next.proofSha256, resourceReservationProofSha256(proof));
  proof.session.revision++;
  assert.equal(outcome.insert.proof.session.revision, 3);
  assert.ok(Object.isFrozen(outcome.insert.proof.session));
  assert.throws(() => plan({ acceptedAtExact: "2026-11-10T14:00:00.000000Z" }), {
    code: "resource_reservation_time",
  });
  assert.throws(() => freezeResourceReservationProof({
    ...source(), interval: { ...interval(), timeZone: "-05:00" },
  }), { code: "resource_reservation_interval" });
});

test("Untrusted extra fields, accessors and scoped membership cannot become source or authority pins", () => {
  let read = false;
  const proof = source();
  Object.defineProperty(proof.asset, "supplierEmail", {
    enumerable: true, get() { read = true; return "private@example.invalid"; },
  });
  assert.throws(() => freezeResourceReservationProof(proof));
  assert.equal(read, false);
  assert.throws(() => freezeResourceReservationProof({ ...source(), quantity: 2 }));
  assert.throws(() => freezeResourceReservationProof({ ...source(), asset: pin("room", "assets", "stock") }));
  assert.throws(() => authority({ programIds: ["limited"] }), { code: "resource_reservation_authority" });
  assert.throws(() => authority({ role: "member" }), { code: "resource_reservation_authority" });
  assert.throws(() => plan({ request: { ...review(), acknowledge: false } }));
  assert.throws(() => plan({ request: { ...review(), previewToken: "x".repeat(8193) } }));
});

test("One key namespace and exact replay survive a later release without buying another hold", () => {
  const first = plan();
  const end = plan({ operation: "release", request: release(), rows: [first.insert], newReservation: null,
    acceptedAtExact: "2027-01-01T00:00:00.000001Z" });
  assert.equal(end.update.state, "released");
  assert.equal(end.update.revision, 2);
  assert.deepEqual(end.update.originalReceipt, first.receipt);
  assert.deepEqual(end.update.proof, first.insert.proof);
  const saved = {
    orgId: "org", actorId: "actor", operation: "reserve", request: review(),
    authority: authority(), receipt: end.update.originalReceipt,
  };
  assert.deepEqual(reconcileResourceReservationReceipt(saved), first.receipt.decision);
  assert.equal(end.update.state, "released");
  for (const changes of [
    { request: { ...review(), previewToken: "different." + "A".repeat(43) } },
    { authority: authority({ sessionId: "other-session" }) },
    { authority: authority({ memberRevision: 2 }) },
    { authority: authority({ memberCreatedAtExact: "2026-11-01T12:00:00.000003Z" }) },
    { authority: authority({ restoreEpochSha256: sha("e") }) },
  ]) assert.throws(() => reconcileResourceReservationReceipt({ ...saved, ...changes }),
    { code: "resource_reservation_reconcile", status: 409 });
  const sameKeyRelease = release("hold", review().idempotencyKey);
  const hashes = resourceReservationCommandHashes({
    orgId: "org", actorId: "actor", operation: "release", request: sameKeyRelease,
  });
  assert.equal(hashes.commandHash, first.receipt.commandHash);
  assert.notEqual(hashes.requestHash, first.receipt.requestHash);
  assert.throws(() => plan({
    operation: "release", request: sameKeyRelease, rows: [first.insert], newReservation: null,
  }), { code: "resource_reservation_reconcile" });
});

test("Replace conflicts preserve the existing hold and identical candidates make no write", () => {
  const old = plan().insert;
  const occupying = plan({
    request: review("second-hold-key-02"), rows: [old],
    newReservation: { id: "adjacent", proof: source("room", "later",
      interval("2026-11-10T10:00:00-05:00", "2026-11-10T11:00:00-05:00")) },
  }).insert;
  const command = { operation: "replace", request: replace(), rows: [old, occupying], acceptedAtExact: later };
  const conflict = plan({ ...command, newReservation: { id: "other", proof: source("room", "overlap",
    interval("2026-11-10T09:55:00-05:00", "2026-11-10T10:30:00-05:00")) } });
  const noWrite = state => ({ state, insert: null, update: null, receipt: null });
  assert.deepEqual(conflict, noWrite("conflict"));
  assert.deepEqual(plan({ ...command, newReservation: { id: "other", proof: old.proof } }), noWrite("unchanged"));
  assert.equal(old.state, "reserved");
  assert.equal(old.terminalReceipt, null);
  assert.equal(occupying.state, "reserved");
});

test("Replace links both rows reciprocally and its receipt remains readable after successor release", () => {
  const old = plan().insert;
  const nextSource = source("other-room", "event");
  const reviewed = replace();
  const made = plan({
    operation: "replace", request: reviewed, rows: [old], acceptedAtExact: later,
    newReservation: { id: "successor", proof: nextSource },
  });
  assert.equal(made.update.state, "released");
  assert.equal(made.insert.state, "reserved");
  assert.deepEqual(made.update.terminalReceipt, made.insert.originalReceipt);
  assert.equal(made.receipt.decision.previous.id, old.id);
  assert.equal(made.receipt.decision.next.id, "successor");
  assert.throws(() => validateResourceReservationRows("org", [made.update]),
    { code: "resource_reservation_history" });
  const inconsistent = structuredClone(made.insert);
  inconsistent.originalReceipt.requestHash = sha("f");
  assert.throws(() => validateResourceReservationRows("org", [made.update, inconsistent]),
    { code: "resource_reservation_history" });
  const final = plan({
    operation: "release", request: release("successor", "end-of-chain-key-04"),
    rows: [made.update, made.insert], newReservation: null, acceptedAtExact: later,
  }).update;
  assert.equal(final.state, "released");
  assert.equal(validateResourceReservationRows("org", [final, made.update]).length, 2);
  assert.deepEqual(reconcileResourceReservationReceipt({
    orgId: "org", actorId: "actor", operation: "replace", request: reviewed,
    authority: authority(), receipt: final.originalReceipt,
  }), made.receipt.decision);
  assert.throws(() => reconcileResourceReservationReceipt({
    orgId: "org", actorId: "actor", operation: "replace", request: { ...reviewed, reason: reviewed.reason + " " },
    authority: authority(), receipt: final.originalReceipt,
  }), { code: "resource_reservation_reconcile" });
});

test("Reciprocal receipts cannot form an equal-time cycle", () => {
  const first = plan().insert;
  const forward = plan({
    operation: "replace", request: replace(), rows: [first],
    newReservation: { id: "successor", proof: source("other-room") },
  });
  const back = {
    ...forward.receipt, commandHash: sha("e"), requestHash: sha("f"),
    decision: { ...forward.receipt.decision,
      previous: { ...forward.receipt.decision.next, state: "released", revision: 2 },
      next: { ...forward.receipt.decision.previous, state: "reserved", revision: 1 },
    },
  };
  const cycle = [{ ...forward.update, originalReceipt: back },
    { ...forward.insert, state: "released", revision: 2, terminalReceipt: back }];
  cycle.forEach(validateResourceReservationRow);
  assert.throws(() => validateResourceReservationRows("org", cycle), { code: "resource_reservation_history" });
});

test("Native history preserves reciprocal releases and typed source links without live authority", () => {
  const old = plan().insert;
  const updated = plan({
    operation: "replace", request: replace(), rows: [old],
    newReservation: { id: "successor", proof: source("other-room") }, acceptedAtExact: later,
  });
  const sources = refs(old.proof, updated.insert.proof);
  const backup = makeResourceReservationsBackup("org", [updated.insert, updated.update], sources);
  assert.deepEqual(backup.histories.map(item => item.id), ["hold", "successor"]);
  const serialized = JSON.stringify(backup);
  assert.doesNotMatch(serialized, /commandHash|requestHash|previewToken|reviewSha256|sessionSha256|membershipSha256|restoreEpochSha256|originalReceipt|terminalReceipt|memberCreatedAtExact/);
  assert.throws(() => validateResourceReservationsBackup(backup, "org", sources.slice(0, 2)),
    { code: "resource_reservation_source" });
  assert.throws(() => validateResourceReservationsBackup(backup, "other-org", sources),
    { code: "resource_reservation_history" });
  const forged = structuredClone(backup);
  forged.histories[0].original.actorSha256 = sha("0");
  assert.throws(() => validateResourceReservationsBackup(forged, "org", sources),
    { code: "resource_reservation_checksum" });
  const archived = restoreResourceReservationRows("restored", backup, "org", sources);
  assert.deepEqual(archived.map(row => [row.orgId, row.originMode, row.state, row.originalReceipt]),
    [["restored", "recovered", "released", null], ["restored", "recovered", "reserved", null]]);
  assert.deepEqual(archived[0].history.terminal, archived[1].history.original);
  assert.equal(makeResourceReservationsBackup("org", [], []), undefined);
  assert.equal(validateResourceReservationsBackup(undefined, "org", []), null);
});

test("An unresolved historical claim blocks until a separate disposition survives two restores", () => {
  const old = plan().insert;
  const sources = refs(old.proof);
  const backup = makeResourceReservationsBackup("org", [old], sources);
  const first = restoreResourceReservationRows("restored", backup, "org", sources)[0];
  const context = { orgId: "restored", authority: authority({ orgId: "restored" }),
    rows: [first], acceptedAtExact: "2027-01-01T00:00:00.000001Z" };
  const proposed = { ...context, newReservation: { id: "next-hold", proof: source(
    "room", "new-event", interval("2027-02-01T09:00:00-05:00", "2027-02-01T10:00:00-05:00"), "restored") } };
  assert.equal(plan(proposed).state, "recovery-required");
  assert.throws(() => plan({ ...proposed, operation: "replace", request: replace() }),
    { code: "resource_reservation_stale" });
  const disposition = {
    row: first, orgId: context.orgId, actorId: "actor", authority: context.authority,
    expectedRevision: 1, acceptedAtExact: context.acceptedAtExact,
    reason: "Reviewed source claim. Carry no internal hold forward.",
  };
  const acknowledged = recordResourceRecoveryDisposition(disposition);
  assert.equal(acknowledged.state, "released");
  assert.equal(acknowledged.history.sourceState, "reserved");
  assert.equal(acknowledged.history.terminal, null);
  assert.equal(acknowledged.history.disposition.orgId, "restored");
  assert.throws(() => recordResourceRecoveryDisposition({ ...disposition, row: acknowledged }),
    { code: "resource_reservation_stale" });
  assert.equal(plan({ ...proposed, rows: [acknowledged] }).state, "ready");
  const secondBackup = makeResourceReservationsBackup("restored", [acknowledged], sources);
  const second = restoreResourceReservationRows("restored-again", secondBackup, "restored", sources)[0];
  assert.deepEqual(second.history, acknowledged.history);
  assert.equal(second.history.proof.orgId, "org");
  assert.equal(second.originalReceipt, null);
  assert.equal(second.state, "released");
  assert.equal(second.revision, 2);
});

test("A former named zone remains literal through release and backup after zone removal", () => {
  const row = plan().insert;
  const original = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function (...args) {
    if (args[1]?.timeZone === "America/New_York") throw new RangeError("synthetic removed zone");
    return new original(...args);
  };
  try {
    const released = plan({
      operation: "release", request: release(), rows: [row], acceptedAtExact: later, newReservation: null,
    }).update;
    const backup = makeResourceReservationsBackup("org", [released], refs(row.proof));
    assert.deepEqual(restoreResourceReservationRows("restored", backup, "org", refs(row.proof))[0].history.proof.interval,
      row.proof.interval);
    assert.throws(() => freezeResourceReservationProof(row.proof), { code: "resource_reservation_interval" });
  } finally {
    Intl.DateTimeFormat = original;
  }
});

test("At 1,000 retained holds a Release consumes its current row and a new hold is refused", () => {
  const rows = Array.from({ length: 1000 }, (_, index) => {
    const row = plan({
      request: review("bounded-case-key-" + index),
      newReservation: { id: "hold-" + index, proof: source("room-" + index, "event-" + index) },
    }).insert;
    return row;
  });
  assert.throws(() => plan({ rows }), { code: "resource_reservation_limit" });
  const end = plan({ rows, operation: "release", request: release("hold-999"), newReservation: null,
    acceptedAtExact: later });
  assert.equal(end.insert, null);
  assert.equal(end.update.id, "hold-999");
  assert.equal(end.update.state, "released");
});
