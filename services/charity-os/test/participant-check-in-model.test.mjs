import test from "node:test";
import assert from "node:assert/strict";
import { hash } from "../lib/security.mjs";
import {
  CHECK_IN_CONSENT_VERSION, CHECK_IN_LIMITS, CheckInError,
  checkInCommitmentSha256, checkInArrivalEligibility, checkInClaimSha256,
  validateReportInput, validateWithdrawalInput, validateCheckInHistory,
  validateCheckInRecord, currentCheckInDisposition, reportCheckIn, withdrawCheckIn,
  makeCheckInBackup, validateCheckInBackup, restoreCheckInBackup,
} from "../lib/participant-check-in-model.mjs";

const clone = value => structuredClone(value);
const at = "2026-11-07T10:30:00.000Z";
const claimed = "2026-11-07T10:10:00Z";
const key = "fictional_report_command_01";
function context({ interval = true, moduleId = "volunteers", programId = null } = {}) {
  const terms = {
    title: "Fictional occurrence", kind: moduleId === "events" ? "session" : "shift",
    startAt: "2026-11-07T09:00:00Z", endAt: "2026-11-07T12:00:00Z", timeZone: "UTC",
    participationPurpose: "Arrange a fictional commitment", participantInstructions: null,
    organizerEmail: null, organizerUrl: "https://organizer.example.invalid/",
    ...(interval ? { intervalPolicy: { version: 1, mode: "within-shift" } } : {}),
  };
  const range = interval ? { version: 1, startAt: "2026-11-07T10:00:00Z", endAt: "2026-11-07T11:00:00Z", timeZone: "UTC" } : null;
  return {
    id: "claim_1", orgId: "org_A", participationId: "participation_1", moduleId,
    bookingRecordId: "booking_1", revision: 4, intakeRevision: 3,
    frozen: { terms, sourceRevision: 7, termsHash: hash(terms), candidateRevision: 2,
      candidateApproval: { status: "approved", revision: 2, actorId: "fictional_reviewer", reason: "Fictional saved review", at: "2026-11-01T00:00:00.000Z" },
      programId, ...(interval ? { interval: range, allocationHash: "a".repeat(64) } : {}) },
    requestedInterval: range,
  };
}
function request(c = context()) {
  return { revision: c.revision, intakeRevision: c.intakeRevision, checkInRevision: 0,
    commitmentSha256: checkInCommitmentSha256(c), claimedArrivalAt: claimed,
    reportConsent: true, consentVersion: CHECK_IN_CONSENT_VERSION, idempotencyKey: key };
}
function report(c = context(), input = request(c), options = {}) {
  return reportCheckIn({ record: null, request: input, context: c, actorId: "own_actor", serverNow: at, auditRetained: true, ...options });
}
function replayContext(c = context()) {
  return Object.fromEntries(["orgId", "participationId", "moduleId", "bookingRecordId"].map(k => [k, c[k]]));
}
function withdrawal(record) {
  return { checkInRevision: record.revision, reportSha256: record.history.claimSha256, withdraw: true, idempotencyKey: "fictional_withdraw_command_01" };
}
function withdraw(record, input = withdrawal(record), options = {}) {
  return withdrawCheckIn({ record, request: input, actorId: "own_actor", serverNow: "2026-12-01T12:00:00.000Z", auditRetained: false, ...options });
}
const refuses = (fn, code) => assert.throws(fn, error => error instanceof CheckInError && (!code || error.code === code));

test("one explicitly affirmed assertion retains supplied claim/time and nullable program without attendance authority", () => {
  const value = report();
  assert.equal(value.replayed, false);
  assert.equal(value.record.revision, 1);
  assert.equal(value.record.history.programId, null);
  assert.equal(value.record.history.claimedArrivalAt, claimed);
  assert.equal(value.record.history.submittedAt, at);
  assert.deepEqual(value.record.history.affirmation, { version: CHECK_IN_CONSENT_VERSION, at, actorHash: hash("own_actor") });
  assert.deepEqual(value.currentDisposition, { originMode: "live", state: "reported", originalState: "reported", revision: 1, staffReview: "not-recorded", attendance: null, workedMinutes: null });
  assert.equal(value.record.history.commitment.range.startAt, "2026-11-07T10:00:00Z");
  assert(!Object.hasOwn(value.record, "approval"));
  assert(!Object.hasOwn(value.record, "state"));
});

test("commitment checksum ignores new report identity and mutable authority revisions, but binds exact frozen data", () => {
  const c = context(), digest = checkInCommitmentSha256(c), altered = clone(c);
  Object.assign(altered, { id: "new_unminted_candidate", revision: 100, intakeRevision: 10 });
  assert.equal(checkInCommitmentSha256(altered), digest);
  altered.frozen.programId = "another_program";
  assert.notEqual(checkInCommitmentSha256(altered), digest);
  for (const k of ["orgId", "participationId", "moduleId", "bookingRecordId"]) {
    const changed = clone(c);
    if (k === "moduleId") { changed.moduleId = "events"; refuses(() => checkInCommitmentSha256(changed)); }
    else { changed[k] += "x"; assert.notEqual(checkInCommitmentSha256(changed), digest); }
  }
});

test("fixed commitment and claim vectors agree with independent Python sorted-JSON SHA256", () => {
  // Computed separately using Python json.dumps(sort_keys=True,separators=(',',':'))
  // and hashlib.sha256 on this ASCII fixture; not generated by the model under test.
  assert.equal(checkInCommitmentSha256(context()), "b8f83741e01504e0a3696a707a027ef43dd00bd0cebbdf1c0e1490c3a4047fba");
  assert.equal(report().record.history.claimSha256, "c3a21ed723fc733884c14532cb5af926b949922cdf783305788bca2c5d1b8dc9");
});

test("both event whole and volunteer whole/partial commitments use their own exact range", () => {
  for (const c of [context({ interval: false }), context({ moduleId: "events", interval: false }), context()]) {
    const value = report(c);
    assert.equal(value.record.history.commitment.allocationHash, c.requestedInterval ? "a".repeat(64) : null);
    assert.equal(value.record.history.commitment.range.endAt, c.requestedInterval ? "2026-11-07T11:00:00Z" : "2026-11-07T12:00:00Z");
  }
  const invalid = context({ moduleId: "events" });
  refuses(() => checkInCommitmentSha256(invalid));
});

test("already-admitted multiline/Unicode frozen terms and review text are preserved rather than narrowed", () => {
  const c = context();
  c.frozen.terms.title = "Fictional 🍃 occurrence";
  c.frozen.terms.participationPurpose = "One fictional purpose\nwith another line";
  c.frozen.terms.participantInstructions = "Bring a pen.\nAsk\torganizer.";
  c.frozen.termsHash = hash(c.frozen.terms);
  c.frozen.candidateApproval.reason = "First review line\nSecond review line";
  const prior = clone(c), value = report(c, request(c));
  assert.deepEqual(c, prior);
  assert.equal(value.record.history.commitment.termsHash, hash(c.frozen.terms));
  assert(!Object.hasOwn(value.record.history, "terms"));
});

test("arrival and reporting windows have independent exact half-open/inclusive boundaries", () => {
  const r = { startAt: "2026-11-07T10:00:00Z", endAt: "2026-11-07T11:00:00Z", timeZone: "UTC" };
  assert.equal(checkInArrivalEligibility(r, r.startAt, "2026-11-07T10:00:00.000Z").eligible, true);
  assert.equal(checkInArrivalEligibility(r, r.startAt, "2026-11-07T09:59:59.999Z").reason, "before-start");
  assert.equal(checkInArrivalEligibility(r, r.endAt, at).reason, "claim-outside-range");
  assert.equal(checkInArrivalEligibility(r, "2026-11-07T10:30:00.001Z", at).reason, "claim-future");
  assert.equal(checkInArrivalEligibility(r, claimed, "2026-11-08T11:00:00.000Z").eligible, true);
  assert.equal(checkInArrivalEligibility(r, claimed, "2026-11-08T11:00:00.001Z").reason, "after-window");
  refuses(() => checkInArrivalEligibility(r, "", at), "checkin_time");
  refuses(() => checkInArrivalEligibility(r, claimed, undefined), "checkin_time");
  refuses(() => checkInArrivalEligibility(r, claimed, new Date(at)), "checkin_time");
});

test("strict seconds/offset/IANA agreement preserves distinct fold instants and refuses gaps", () => {
  const r = { startAt: "2026-11-01T00:30:00-04:00", endAt: "2026-11-01T02:30:00-05:00", timeZone: "America/New_York" };
  for (const a of ["2026-11-01T01:30:00-04:00", "2026-11-01T01:30:00-05:00"]) assert.equal(checkInArrivalEligibility(r, a, "2026-11-01T07:00:00.000Z").eligible, true);
  refuses(() => checkInArrivalEligibility(r, "2026-11-01T01:30", "2026-11-01T07:00:00.000Z"), "checkin_time");
  refuses(() => checkInArrivalEligibility(r, "2026-11-01T01:30:00+03:00", "2026-11-01T07:00:00.000Z"), "checkin_time");
  const gap = { startAt: "2026-03-08T01:00:00-05:00", endAt: "2026-03-08T04:00:00-04:00", timeZone: "America/New_York" };
  refuses(() => checkInArrivalEligibility(gap, "2026-03-08T02:30:00-05:00", "2026-03-08T08:00:00.000Z"), "checkin_time");
});

test("no Date.now or process-local clock supplies report or withdrawal authority", () => {
  const c = context(), input = request(c), old = Date.now;
  Date.now = () => { throw new Error("current clock must not be consulted"); };
  try { const value = report(c, input); assert.equal(withdraw(value.record).record.revision, 2); }
  finally { Date.now = old; }
});

test("missing/false affirmation, extras, unsafe revisions and blank claim are refused without filling defaults", () => {
  const c = context();
  for (const change of [{ reportConsent: false }, { consentVersion: "booking-consent" }, { claimedArrivalAt: "" }, { checkInRevision: 1 }, { revision: 0 }, { intakeRevision: 1.5 }, { idempotencyKey: "short" }, { attendance: 1 }]) refuses(() => validateReportInput({ ...request(c), ...change }));
  const missing = request(c); delete missing.reportConsent; refuses(() => validateReportInput(missing));
  refuses(() => validateWithdrawalInput({ checkInRevision: 1, reportSha256: "a".repeat(64), withdraw: false, idempotencyKey: key }));
});

test("changed revision/intake/hash and malformed frozen allocation never create a new assertion", () => {
  const c = context(), input = request(c);
  for (const change of [{ revision: 5 }, { intakeRevision: 4 }]) refuses(() => report({ ...c, ...change }, input), "checkin_context");
  refuses(() => report(c, { ...input, commitmentSha256: "0".repeat(64) }), "checkin_context");
  for (const alter of [v => { delete v.frozen.interval; }, v => { v.frozen.allocationKnown = false; }, v => { v.frozen.termsHash = "0".repeat(64); }, v => { v.frozen.candidateApproval = null; }, v => { v.frozen.programId = ""; }]) {
    const changed = clone(c); alter(changed); refuses(() => checkInCommitmentSha256(changed));
  }
});

test("accepted report Replay needs no minted ID/current eligibility and remains exact after terminal withdrawal", () => {
  const c = context(), input = request(c), first = report(c, input), removed = withdraw(first.record);
  const replay = reportCheckIn({ record: removed.record, request: input, context: replayContext(c), actorId: "own_actor", serverNow: null, auditRetained: null });
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.result, first.result);
  assert.equal(replay.currentDisposition.state, "withdrawn");
  assert.deepEqual(replay.record, removed.record);
  assert.equal(replay.record.history.claimSha256, first.record.history.claimSha256);
  assert.equal(replay.record.history.claimedArrivalAt, claimed);
  assert.equal(replay.record.reportReceipt.result.auditRetained, true);
  assert.equal(replay.record.withdrawalReceipt.result.auditRetained, false);
});

test("same accepted intent with altered payload, another actor/context and a new duplicate key all refuse", () => {
  const c = context(), input = request(c), first = report(c, input);
  const options = { record: first.record, request: input, context: replayContext(c), actorId: "own_actor", serverNow: null, auditRetained: null };
  refuses(() => reportCheckIn({ ...options, request: { ...input, claimedArrivalAt: "2026-11-07T10:11:00Z" } }), "checkin_intent");
  refuses(() => reportCheckIn({ ...options, request: { ...input, idempotencyKey: "another_fictional_command" } }), "checkin_exists");
  refuses(() => reportCheckIn({ ...options, actorId: "different_actor" }), "checkin_inactive");
  refuses(() => reportCheckIn({ ...options, context: { ...options.context, orgId: "other_org" } }), "checkin_context");
  refuses(() => reportCheckIn({ ...options, context: { ...options.context, id: "new_id" } }));
});

test("withdrawal is terminal beyond the report window; original claim/hash and both exact results persist", () => {
  const first = report(), input = withdrawal(first.record), result = withdraw(first.record, input);
  const { withdrawnAt, ...old } = first.record.history, { withdrawnAt: nextTime, ...next } = result.record.history;
  assert.deepEqual(old, next);
  assert.equal(nextTime, "2026-12-01T12:00:00.000Z");
  assert.equal(checkInClaimSha256(result.record.history), first.record.history.claimSha256);
  const retry = withdraw(result.record, input, { serverNow: null, auditRetained: null });
  assert.deepEqual(retry.result, result.result); assert.deepEqual(retry.record, result.record); assert.equal(retry.replayed, true);
  refuses(() => withdraw(result.record, { ...input, idempotencyKey: "new_withdraw_command_02" }), "checkin_context");
  refuses(() => withdraw(result.record, { ...input, checkInRevision: 2 }), "checkin_intent");
  refuses(() => withdraw(first.record, input, { serverNow: "2026-11-07T10:29:59.999Z" }), "checkin_time");
});

test("strict receipts reject malformed successful outcomes and retain explicit false audit result on Replay", () => {
  const first = report(context(), undefined, { auditRetained: false });
  assert.equal(first.result.auditRetained, false);
  for (const mutate of [v => { delete v.reportReceipt.result.auditRetained; }, v => { v.reportReceipt.result.revision = 2; }, v => { v.reportReceipt.actorHash = "b".repeat(64); }, v => { v.reportReceipt.result.claimSha256 = "c".repeat(64); }, v => { v.reportReceipt.authorized = true; }]) {
    const value = clone(first.record); mutate(value); refuses(() => validateCheckInRecord(value));
  }
});

test("export/restore repeated with an unavailable historical parent preserves only inactive unverified claims", () => {
  const first = withdraw(report().record).record, original = makeCheckInBackup([first]);
  let backup = original;
  for (let i = 0; i < 3; i++) {
    const restored = restoreCheckInBackup(backup);
    assert.equal(restored[0].originMode, "recovered"); assert.equal(restored[0].liveParticipationId, null);
    assert.equal(restored[0].reportReceipt, null); assert.equal(restored[0].withdrawalReceipt, null);
    assert.equal(currentCheckInDisposition(restored[0]).state, "history-only");
    assert.equal(currentCheckInDisposition(restored[0]).originalState, "withdrawn");
    backup = makeCheckInBackup(restored); assert.deepEqual(backup, original);
    refuses(() => withdraw(restored[0]), "checkin_inactive");
    refuses(() => reportCheckIn({ record: restored[0], request: request(), context: replayContext(), actorId: "own_actor", serverNow: at, auditRetained: true }), "checkin_inactive");
    const forged = clone(restored[0]); forged.reportReceipt = clone(first.reportReceipt); refuses(() => validateCheckInRecord(forged), "checkin_inactive");
  }
});

test("missing history is omitted and old participation/other-family input is neither accepted nor changed", () => {
  assert.equal(makeCheckInBackup([]), undefined); assert.equal(validateCheckInBackup(undefined), undefined); assert.deepEqual(restoreCheckInBackup(undefined), []);
  assert.deepEqual(validateCheckInBackup({ version: 1, entries: [] }), { version: 1, entries: [] });
  for (const version of [1, 2, 3]) {
    const unrelated = { version, targets: [], participations: [], outbox: [] }, old = JSON.stringify(unrelated);
    refuses(() => validateCheckInBackup(unrelated)); assert.equal(JSON.stringify(unrelated), old);
  }
});

test("corrupt/duplicate/downgraded/authority-bearing histories reject atomically", () => {
  const record = report().record, backup = makeCheckInBackup([record]);
  const corrupt = clone(backup); corrupt.entries[0].history.claimedArrivalAt = "2026-11-07T10:12:00Z";
  refuses(() => restoreCheckInBackup(corrupt), "checkin_checksum");
  refuses(() => validateCheckInBackup({ ...clone(backup), entries: [backup.entries[0], backup.entries[0]] }), "checkin_duplicate");
  const sameParent = clone(record); sameParent.history.id = "different_claim"; sameParent.history.claimSha256 = checkInClaimSha256(sameParent.history);
  const second = { id: sameParent.history.id, history: sameParent.history };
  refuses(() => validateCheckInBackup({ version: 1, entries: [backup.entries[0], second] }), "checkin_duplicate");
  refuses(() => restoreCheckInBackup({ ...clone(backup), version: 0 }));
  const forged = clone(backup); forged.entries[0].reportReceipt = record.reportReceipt; refuses(() => restoreCheckInBackup(forged));
  const emptyProgram = clone(record.history); emptyProgram.programId = ""; refuses(() => validateCheckInHistory(emptyProgram));
  assert.deepEqual(makeCheckInBackup([record]), backup);
});

test("owned output cannot be retargeted and hostile descriptors/proxies execute no callbacks", () => {
  const c = context(), input = request(c), value = report(c, input);
  c.frozen.terms.title = "changed outside"; input.claimedArrivalAt = "changed outside";
  assert.equal(value.record.history.claimedArrivalAt, claimed); assert(Object.isFrozen(value.record.history.commitment.range));
  assert.throws(() => { value.result.auditRetained = false; }, TypeError);
  let calls = 0;
  const getter = {}; Object.defineProperty(getter, "revision", { enumerable: true, get() { calls++; return 4; } });
  refuses(() => validateReportInput(getter));
  const proxy = new Proxy({}, { ownKeys() { calls++; return []; }, getPrototypeOf() { calls++; return Object.prototype; } });
  refuses(() => validateReportInput(proxy)); assert.equal(calls, 0);
  const cyclic = {}; cyclic.self = cyclic; refuses(() => validateReportInput(cyclic));
  const sparse = Array(1); refuses(() => makeCheckInBackup(sparse));
  const exotic = Object.create(null); refuses(() => validateReportInput(exotic));
  const symbol = request(); symbol[Symbol("authority")] = true; refuses(() => validateReportInput(symbol));
});

test("bounded rows/receipts/text/counts refuse before producing partial recovery", () => {
  const value = report();
  const huge = clone(value.record.history); huge.originOrgId = "o".repeat(101); refuses(() => validateCheckInHistory(huge));
  const badText = context(); badText.frozen.candidateApproval.reason = "x".repeat(2001); refuses(() => checkInCommitmentSha256(badText));
  for (const text of ["\u0000", "\ud800", "\udc00"]) { const v = request(); v.idempotencyKey = text.repeat(20); refuses(() => validateReportInput(v)); }
  const many = Array.from({ length: CHECK_IN_LIMITS.records + 1 }, () => value.record); refuses(() => makeCheckInBackup(many), "checkin_limit");
  const record = clone(value.record); record.withdrawalReceipt = {}; refuses(() => validateCheckInRecord(record));
  assert.equal(restoreCheckInBackup(makeCheckInBackup([value.record])).length, 1);
});

test("the declared 2000-history count boundary is admissible with bounded maximum-length identity fields", () => {
  const first = report().record.history;
  const entries = Array.from({ length: CHECK_IN_LIMITS.records }, (_, i) => {
    const h = clone(first);
    h.id = (`claim_${i}_`).padEnd(100, "c");
    h.originOrgId = "o".repeat(100); h.participationId = (`participation_${i}_`).padEnd(100, "p");
    h.bookingRecordId = (`booking_${i}_`).padEnd(100, "b"); h.programId = "g".repeat(100);
    h.claimSha256 = checkInClaimSha256(h);
    return { id: h.id, history: h };
  });
  const input = { version: 1, entries }, admitted = validateCheckInBackup(input);
  assert.equal(admitted.entries.length, 2000);
  assert.deepEqual(makeCheckInBackup(restoreCheckInBackup(admitted)), admitted);
  assert(Buffer.byteLength(JSON.stringify(admitted)) <= CHECK_IN_LIMITS.familyBytes);
  refuses(() => validateCheckInBackup({ ...input, entries: [...entries, entries[0]] }), "checkin_limit");
});

for (const key of ["4294967295", "99999999999999999999999999999999999999", "01", "-0", "1e0", "2"]) {
  test(`compensated sparse array decoration ${key} cannot disappear as an empty export`, () => {
    const values = Array(1);
    Object.defineProperty(values, key, { value: report().record, enumerable: true });
    refuses(() => makeCheckInBackup(values));
  });
}

test("compensated sparse array with a real first history cannot silently drop the missing second history", () => {
  const values = Array(2);
  Object.defineProperty(values, "0", { value: report().record, enumerable: true });
  Object.defineProperty(values, "4294967295", { value: report().record, enumerable: true });
  refuses(() => makeCheckInBackup(values));
});

test("compensated sparse admission invokes neither index accessors nor proxy traps", () => {
  let calls = 0;
  const accessor = Array(1);
  Object.defineProperty(accessor, "0", { enumerable: true, get() { calls++; return report().record; } });
  refuses(() => makeCheckInBackup(accessor));
  const proxy = new Proxy(Array(1), { ownKeys() { calls++; return ["0", "length"]; }, getPrototypeOf() { calls++; return Array.prototype; } });
  refuses(() => makeCheckInBackup(proxy));
  assert.equal(calls, 0);
});
