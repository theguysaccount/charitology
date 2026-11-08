import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { recurringOccurrenceAnchor as anchor, planRecurringSchedule as plan,
  validateFrozenRecurringPlan as frozen, RECURRING_METHOD } from "../lib/participation-recurrence-planner.mjs";

const schedule = (extra = {}) => ({ format: "charitology-participation-recurrence", version: 1,
  method: RECURRING_METHOD, timeZone: "UTC",
  anchor: { startCivil: "2026-11-08T09:00:00.123", endCivil: "2026-11-08T10:00:00.456" },
  intervalWeeks: 1, count: 1, exceptions: [], resolutions: [{ sequence: 1, start: null, end: null }], ...extra });
const clone = value => structuredClone(value);
const bad = (fn, code) => assert.throws(fn, e => e?.name === "RecurringScheduleError" && e.status === 422 && (!code || e.code === code));
const stable = value => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value)
  ? `[${value.map(stable).join(",")}]` : `{${Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + stable(value[k])).join(",")}}`;
const digest = (kind, value) => createHash("sha256").update("charitology:participation-recurrence:v1:" + kind + "\0" + stable(value)).digest("hex");
const reseal = value => { value.plan.inputSha256 = digest("input", value.schedule); const { planSha256, ...body } = value.plan;
  value.plan.planSha256 = digest("plan", body); return value; };

test("actual occurrence anchor advances local endpoint calendars and preserves millisecond writing", () => {
  assert.deepEqual(anchor({ startAt: "2026-03-01T09:00:00.1-05:00", endAt: "2026-03-02T01:00:00.045-05:00",
    timeZone: "America/New_York", intervalWeeks: 1 }),
  { startCivil: "2026-03-08T09:00:00.100", endCivil: "2026-03-09T01:00:00.045" });
  assert.deepEqual(anchor({ startAt: "2026-11-01T09:00:00Z", endAt: "2026-11-01T10:00:00Z", timeZone: "UTC", intervalWeeks: 4 }),
    { startCivil: "2026-11-29T09:00:00.000", endCivil: "2026-11-29T10:00:00.000" });
});
test("anchor refuses wrong zone offsets, invalid or backward source dates and noncalendar scope", () => {
  const source = { startAt: "2026-03-01T09:00:00.000-05:00", endAt: "2026-03-01T10:00:00.000-05:00", timeZone: "America/New_York", intervalWeeks: 1 };
  bad(() => anchor({ ...source, startAt: "2026-03-01T09:00:00.000Z" }), "recurrence_zone");
  bad(() => anchor({ ...source, endAt: source.startAt }));
  bad(() => anchor({ ...source, startAt: "2026-02-30T09:00:00.000-05:00" }));
  bad(() => anchor({ ...source, intervalWeeks: 0 }));
  bad(() => anchor({ ...source, consent: true }));
  bad(() => anchor({ ...source, startAt: "2200-12-31T09:00:00.000-05:00", endAt: "2200-12-31T10:00:00.000-05:00" }));
});
test("frozen ready plans preserve arithmetic without consulting current Intl or current clock", () => {
  const s = schedule(), p = plan(s), originalIntl = Intl.DateTimeFormat, originalNow = Date.now;
  let calls = 0;
  Intl.DateTimeFormat = function () { calls++; throw Error("Current zone resolution must not rewrite history"); };
  Date.now = () => { calls++; throw Error("No current clock"); };
  try {
    const value = frozen({ schedule: s, plan: p });
    assert.deepEqual(value.plan, p); assert.equal(calls, 0); assert(Object.isFrozen(value.plan.occurrences[0].range));
  } finally { Intl.DateTimeFormat = originalIntl; Date.now = originalNow; }
});
test("historical candidate offset, ordinal, chosen range and digest are independently checked", () => {
  const s = schedule(), packet = { schedule: s, plan: plan(s) };
  for (const change of [
    v => { v.plan.occurrences[0].startResolution.candidates[0].offsetSeconds = 3600; },
    v => { v.plan.occurrences[0].nominal.startCivil = "2026-11-09T09:00:00.123"; },
    v => { v.plan.occurrences[0].sequence = 2; },
    v => { v.plan.occurrences[0].range.startAt = "2026-11-08T09:30:00.123Z"; },
    v => { v.plan.occurrences[0].startResolution.candidates[0].dueAt = "2026-11-08T09:00:00.123+00:00"; },
    v => { v.plan.occurrences[0].blockers = ["start-gap"]; },
  ]) { const value = clone(packet); change(value); bad(() => frozen(reseal(value)), "recurrence_history"); }
  const wrongHash = clone(packet); wrongHash.plan.planSha256 = "0".repeat(64); bad(() => frozen(wrongHash), "recurrence_history");
});
test("historical instants retain the live resolver1900–2200 UTC bounds even after a valid checksum is recomputed", () => {
  const s = schedule({ anchor: { startCivil: "2200-12-31T12:00:00.000", endCivil: "2200-12-31T13:00:00.000" } });
  const value = { schedule: s, plan: clone(plan(s)) }, o = value.plan.occurrences[0];
  for (const [side, hour] of [["start", "02"], ["end", "03"]]) {
    const c = o[side + "Resolution"].candidates[0]; c.offsetSeconds = -50400;
    c.dueAt = o.effective[side + "Civil"] + "-14:00"; c.instant = "2201-01-01T" + hour + ":00:00.000Z";
    o.range[side + "At"] = c.dueAt;
  }
  bad(() => frozen(reseal(value)), "recurrence_history");
});
test("recorded folds keep exact two-candidate order and each explicit endpoint choice", () => {
  const s = schedule({ timeZone: "Australia/Lord_Howe",
    anchor: { startCivil: "2026-04-05T01:35:00.000", endCivil: "2026-04-05T01:55:00.000" },
    resolutions: [{ sequence: 1, start: "earlier", end: "later" }] });
  const packet = { schedule: s, plan: plan(s) }; assert.equal(frozen(packet).plan.state, "ready");
  const reversed = clone(packet); reversed.plan.occurrences[0].startResolution.candidates.reverse(); bad(() => frozen(reseal(reversed)), "recurrence_history");
  const omitted = clone(packet); omitted.plan.occurrences[0].startResolution.candidates.pop(); bad(() => frozen(reseal(omitted)), "recurrence_history");
  const defaulted = clone(packet); defaulted.schedule.resolutions[0].start = null; bad(() => frozen(reseal(defaulted)), "recurrence_history");
});
test("skip holes and replacement history remain exact; empty and unresolved plans never become committed ready history", () => {
  const s = schedule({ count: 2, exceptions: [{ sequence: 1, kind: "skip", reason: "Fictional closure" }],
    resolutions: [{ sequence: 1, start: null, end: null }, { sequence: 2, start: null, end: null }] });
  const packet = { schedule: s, plan: plan(s) }; assert.equal(frozen(packet).plan.occurrences[0].range, null);
  const altered = clone(packet); altered.plan.occurrences[0].exception.reason = "Different explanation"; bad(() => frozen(reseal(altered)), "recurrence_history");
  const empty = schedule({ exceptions: [{ sequence: 1, kind: "skip", reason: "Fictional closure" }] }); bad(() => frozen({ schedule: empty, plan: plan(empty) }), "recurrence_history");
  const gap = schedule({ timeZone: "America/New_York", anchor: { startCivil: "2026-03-08T02:30:00.000", endCivil: "2026-03-08T04:00:00.000" } });
  bad(() => frozen({ schedule: gap, plan: plan(gap) }), "recurrence_history");
});
test("historical ownership rejects proxy/getter/decorated arrays without invoking caller code", () => {
  const s = schedule(), packet = { schedule: s, plan: plan(s) }; let calls = 0;
  const getter = clone(packet); Object.defineProperty(getter.plan, "state", { enumerable: true, get() { calls++; throw Error("no"); } }); bad(() => frozen(getter));
  const proxy = new Proxy(packet, { ownKeys() { calls++; throw Error("no"); } }); bad(() => frozen(proxy));
  const nested = clone(packet); nested.plan.occurrences[0].range = new Proxy(nested.plan.occurrences[0].range, { getPrototypeOf() { calls++; throw Error("no"); } }); bad(() => frozen(nested));
  const hidden = clone(packet); Object.defineProperty(hidden.plan.occurrences, "extra", { value: true }); bad(() => frozen(hidden));
  const sparse = clone(packet); delete sparse.plan.occurrences[0]; bad(() => frozen(sparse)); assert.equal(calls, 0);
});
