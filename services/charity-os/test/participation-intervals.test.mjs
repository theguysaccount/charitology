import test from "node:test";
import assert from "node:assert/strict";
import { validateRecord } from "../lib/modules.mjs";
import { hash } from "../lib/security.mjs";
import {
  validateRequestedInterval,
  peakOccupancy,
  intervalsOverlap,
  frozenParticipationInterval,
  createParticipationAllocationContext,
  managedAllocationProfile,
  validationInterval,
} from "../lib/participation-intervals.mjs";

const terms = {
  kind: "shift",
  title: "Fictional shift",
  startAt: "2099-01-10T08:00:00Z",
  endAt: "2099-01-10T16:00:00Z",
  timeZone: "UTC",
  intervalPolicy: { version: 1, mode: "within-shift" },
};
const range = (start = "09", end = "10") => ({
  version: 1,
  startAt: `2099-01-10T${start}:00:00Z`,
  endAt: `2099-01-10T${end}:00:00Z`,
  timeZone: "UTC",
});
const entry = (id, interval) => ({
  id,
  booking_record_id: id,
  target_id: "shift",
  module_id: "volunteers",
  state: "confirmed",
  requested_interval: interval,
  frozen: {
    terms: structuredClone(terms),
    ...(interval ? { interval, allocationHash: "a".repeat(64) } : {}),
  },
});
const invalid = (fn) =>
  assert.throws(fn, (e) => e.code === "participation_interval");

test("whole request leaves the original source terms and hash unchanged", () => {
  const old = { ...terms };
  delete old.intervalPolicy;
  const before = JSON.stringify(old),
    digest = hash(old);
  assert.equal(validateRequestedInterval(null, old), null);
  assert.equal(JSON.stringify(old), before);
  assert.equal(hash(old), digest);
  invalid(() => validateRequestedInterval(range(), old));
});
test("closed requested interval preserves exact admitted strings and source containment", () => {
  const input = range(),
    admitted = validateRequestedInterval(input, terms);
  assert.deepEqual(admitted, input);
  assert.notEqual(admitted, input);
  assert(Object.isFrozen(admitted));
  for (const value of [
    { ...input, extra: true },
    { ...input, version: 2 },
    { ...input, timeZone: "Etc/UTC" },
    range("07", "10"),
    range("09", "17"),
    range("10", "10"),
    range("11", "10"),
  ])
    invalid(() => validateRequestedInterval(value, terms));
  invalid(() => validateRequestedInterval(input, terms, "events"));
});
test("offset, calendar and named-zone validation matches typed schedule admission", () => {
  invalid(() =>
    validateRequestedInterval(
      { ...range(), startAt: "2099-02-29T09:00:00Z" },
      terms,
    ),
  );
  invalid(() =>
    validateRequestedInterval(
      { ...range(), startAt: "2099-01-10T09:00:00-01:00" },
      terms,
    ),
  );
  const dst = {
    ...terms,
    startAt: "2026-11-01T00:00:00-04:00",
    endAt: "2026-11-01T03:00:00-05:00",
    timeZone: "America/New_York",
  };
  const repeated = {
    version: 1,
    startAt: "2026-11-01T01:15:00-04:00",
    endAt: "2026-11-01T01:45:00-05:00",
    timeZone: dst.timeZone,
  };
  assert.deepEqual(validateRequestedInterval(repeated, dst), repeated);
  invalid(() =>
    validateRequestedInterval(
      { ...repeated, endAt: "2026-11-01T03:00:00-04:00" },
      dst,
    ),
  );
});
test("half-open sweep counts actual peak rather than total and permits adjacency", () => {
  assert.equal(peakOccupancy([range("09", "10"), range("10", "11")]), 1);
  assert.equal(peakOccupancy([range("09", "11"), range("10", "12")]), 2);
  assert.equal(intervalsOverlap(range("09", "10"), range("10", "11")), false);
  assert.equal(intervalsOverlap(range("09", "11"), range("10", "12")), true);
  assert.equal(peakOccupancy([terms, range("09", "10"), range("10", "11")]), 2);
});
test("complete inventory and malformed ranges fail closed without time expansion", () => {
  assert.equal(
    peakOccupancy(Array.from({ length: 2000 }, () => range())),
    2000,
  );
  invalid(() => peakOccupancy(Array.from({ length: 2001 }, () => range())));
  invalid(() => peakOccupancy([{ ...range(), endAt: null }]));
});
test("frozen interval requires exact retained request, policy and bound provenance", () => {
  const row = entry("one", range());
  assert.deepEqual(frozenParticipationInterval(row), range());
  invalid(() =>
    frozenParticipationInterval({
      ...row,
      requested_interval: range("10", "11"),
    }),
  );
  invalid(() => frozenParticipationInterval({ ...row, frozen: { terms } }));
  invalid(() =>
    frozenParticipationInterval({
      ...row,
      frozen: { ...row.frozen, allocationHash: null },
    }),
  );
  const whole = entry("whole", null);
  delete whole.frozen.terms.intervalPolicy;
  assert.equal(frozenParticipationInterval(whole).startAt, terms.startAt);
});
test("owned profile includes recovered confirmed claims and rejects a JSON authority lookalike", () => {
  const one = entry("one", range()),
    two = {
      ...entry("two", range("10", "11")),
      state: "requested",
      recovered: true,
      recovered_state: "confirmed",
    };
  const c = createParticipationAllocationContext(
    [{ target_id: "shift" }],
    [one, two],
  );
  assert.deepEqual(managedAllocationProfile(c, "shift"), {
    confirmedCount: 2,
    peakOccupied: 1,
  });
  assert.equal(
    managedAllocationProfile(JSON.parse(JSON.stringify(c)), "shift"),
    undefined,
  );
  assert.deepEqual(validationInterval(c, "two", terms), range("10", "11"));
  one.frozen.interval.startAt = "2099-01-10T07:00:00Z";
  assert.equal(
    validationInterval(c, "one", terms).startAt,
    "2099-01-10T09:00:00Z",
  );
});
test("typed managed shift capacity uses owned peak despite two active generic projections", () => {
  const data = validateRecord(
    "volunteers",
    {
      title: terms.title,
      kind: "shift",
      startAt: terms.startAt,
      endAt: terms.endAt,
      timeZone: "UTC",
      capacity: 1,
      allowPartialIntervals: true,
    },
    { status: "draft" },
  );
  const source = { id: "shift", moduleId: "volunteers", status: "open", data };
  const contacts = ["a", "b"].map((id) => ({
    id,
    moduleId: "contacts",
    status: "active",
    data: { title: id },
  }));
  const assignments = contacts.map((contact, i) => ({
    id: `booking${i}`,
    moduleId: "volunteers",
    status: "assigned",
    data: {
      kind: "assignment",
      title: "Fictional assignment",
      shiftId: "shift",
      contactId: contact.id,
    },
  }));
  const rows = assignments.map((r, i) =>
    entry(r.id, range(i ? "10" : "09", i ? "11" : "10")),
  );
  const context = createParticipationAllocationContext(
    [{ target_id: "shift" }],
    rows,
  );
  const records = [source, ...contacts, ...assignments];
  assert.equal(
    validateRecord("volunteers", data, {
      recordId: "shift",
      status: "open",
      records,
      participation: context,
    }).capacity,
    1,
  );
  assert.throws(
    () =>
      validateRecord("volunteers", data, {
        recordId: "shift",
        status: "open",
        records,
      }),
    /current allocation context|Capacity/,
  );
  assert.throws(
    () =>
      validateRecord(
        "volunteers",
        { ...data, capacity: 0 },
        { recordId: "shift", status: "open", records, participation: context },
      ),
    /Capacity|place/,
  );
});
test("a non-shift cannot opt into intervals and a forged context never fixes old over-capacity", () => {
  assert.throws(
    () =>
      validateRecord("volunteers", {
        title: "Wrong kind",
        kind: "profile",
        allowPartialIntervals: true,
      }),
    /Only volunteer shifts/,
  );
  assert.equal(
    managedAllocationProfile({ peakOccupied: 0 }, "shift"),
    undefined,
  );
});

test("nonallocating history consumes zero capacity and never falls back to a whole commitment", () => {
  const row = {
    ...entry("history", range()),
    state: "requested",
    recovered: true,
    recovered_state: "requested",
    frozen: {
      version: 1,
      allocationKnown: false,
      sourceHistory: { state: "requested" },
    },
  };
  const context = createParticipationAllocationContext(
    [{ target_id: "shift" }],
    [row],
  );
  assert.equal(managedAllocationProfile(context, "shift").peakOccupied, 0);
  invalid(() =>
    frozenParticipationInterval({
      ...row,
      state: "confirmed",
      frozen: { ...row.frozen, terms },
    }),
  );
  invalid(() =>
    createParticipationAllocationContext(
      [{ target_id: "shift" }],
      [{ ...row, state: "confirmed" }],
    ),
  );
});

test("legacy whole fallback rejects orphaned hashes and every allocationKnown marker", () => {
  const row = entry("legacy", null);
  invalid(() =>
    frozenParticipationInterval({
      ...row,
      frozen: { ...row.frozen, allocationHash: "a".repeat(64) },
    }),
  );
  for (const allocationKnown of [false, true, null, "false", 0])
    invalid(() =>
      frozenParticipationInterval({
        ...row,
        frozen: { ...row.frozen, allocationKnown },
      }),
    );
});
