import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { planRecurringSchedule as plan, validateRecurringSchedule as validate,
  recurringScheduleHash, RECURRING_METHOD, RECURRING_LIMITS } from "../lib/participation-recurrence-planner.mjs";

// Calendar fixtures only. No person, approval, consent, booking, client, server or SQL.
const request = (changes = {}) => ({
  format: "charitology-participation-recurrence", version: 1, method: RECURRING_METHOD,
  timeZone: "UTC", anchor: { startCivil: "2026-10-25T09:00:00.123", endCivil: "2026-10-25T10:00:00.456" },
  intervalWeeks: 1, count: 2, exceptions: [],
  resolutions: [{ sequence: 1, start: null, end: null }, { sequence: 2, start: null, end: null }], ...changes,
});
const single = changes => request({ count: 1, resolutions: [{ sequence: 1, start: null, end: null }], ...changes });
const span = (day, start = "09:00:00.000", end = "10:00:00.000") => ({ startCivil: day + "T" + start, endCivil: day + "T" + end });
const bad = (f, code) => assert.throws(f, e => e?.name === "RecurringScheduleError" && e.status === 422 && (!code || e.code === code));
const canonical = v => v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v)
  ? `[${v.map(canonical).join(",")}]` : `{${Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canonical(v[k])).join(",")}}`;

test("weekly anchored local dates preserve exact milliseconds and have no participation authority fields", () => {
  const r = plan(request());
  assert.equal(r.state, "ready");
  assert.equal(r.occurrences[0].range.startAt, "2026-10-25T09:00:00.123Z");
  assert.equal(r.occurrences[1].range.endAt, "2026-11-01T10:00:00.456Z");
  assert.deepEqual(Object.keys(r).sort(), ["format", "version", "method", "inputSha256", "timeZone", "canonicalTimeZone", "state", "occurrences", "planSha256"].sort());
  assert(!JSON.stringify(r).includes("consent")); assert(!JSON.stringify(r).includes("booking"));
  assert.equal(r.inputSha256, recurringScheduleHash(request()));
});
test("spring New York calendar weeks are167 hours and preserve named9am wall time", () => {
  const r = plan(request({ timeZone: "America/New_York", anchor: span("2026-03-01") }));
  assert.equal(r.state, "ready");
  assert.equal(r.occurrences[0].range.startAt, "2026-03-01T09:00:00.000-05:00");
  assert.equal(r.occurrences[1].range.startAt, "2026-03-08T09:00:00.000-04:00");
  assert.equal((Date.parse(r.occurrences[1].range.startAt) - Date.parse(r.occurrences[0].range.startAt)) / 3600000, 167);
});
test("autumn New York weeks are169 hours; original zone spelling is retained", () => {
  const r = plan(request({ timeZone: "US/Eastern", anchor: span("2026-10-25") }));
  assert.equal(r.state, "ready"); assert.equal(r.timeZone, "US/Eastern");
  assert.equal(r.canonicalTimeZone, "America/New_York");
  assert.equal((Date.parse(r.occurrences[1].range.startAt) - Date.parse(r.occurrences[0].range.startAt)) / 3600000, 169);
});
test("southern spring transition keeps local anchors rather than adding UTC milliseconds", () => {
  const r = plan(request({ timeZone: "Australia/Sydney", anchor: span("2026-09-27") }));
  assert.equal(r.state, "ready");
  assert.equal(r.occurrences[0].range.startAt, "2026-09-27T09:00:00.000+10:00");
  assert.equal(r.occurrences[1].range.startAt, "2026-10-04T09:00:00.000+11:00");
});
test("gap blocks the complete plan and preserves exact authored civil writing", () => {
  const input = single({ timeZone: "America/New_York", anchor: span("2026-03-08", "02:30:00.000", "04:00:00.000") });
  const before = structuredClone(input), r = plan(input);
  assert.equal(r.state, "needs-review"); assert.equal(r.occurrences[0].range, null);
  assert.deepEqual(r.occurrences[0].blockers, ["start-gap"]);
  assert.equal(r.occurrences[0].effective.startCivil, input.anchor.startCivil); assert.deepEqual(input, before);
});
test("explicit skip leaves a retained reason and no generated range or resolution", () => {
  const r = plan(single({ timeZone: "America/New_York", anchor: span("2026-03-08", "02:30:00.000", "04:00:00.000"), exceptions: [{ sequence: 1, kind: "skip", reason: "Fictional exception: facility unavailable" }] }));
  assert.equal(r.state, "empty"); assert.equal(r.occurrences[0].range, null);
  assert.equal(r.occurrences[0].startResolution, null); assert.equal(r.occurrences[0].exception.kind, "skip");
  assert.deepEqual(r.occurrences[0].blockers, []);
});
test("explicit replacement resolves its own times and preserves nominal gap history", () => {
  const r = plan(single({ timeZone: "America/New_York", anchor: span("2026-03-08", "02:30:00.000", "04:00:00.000"),
    exceptions: [{ sequence: 1, kind: "replace", reason: "Fictional reviewed later start", ...span("2026-03-08", "03:30:00.000", "04:30:00.000") }] }));
  assert.equal(r.state, "ready"); assert.equal(r.occurrences[0].nominal.startCivil, "2026-03-08T02:30:00.000");
  assert.equal(r.occurrences[0].range.startAt, "2026-03-08T03:30:00.000-04:00");
});
test("each repeated endpoint needs its own explicit choice with no default", () => {
  const input = single({ timeZone: "America/New_York", anchor: span("2026-11-01", "01:10:00.000", "01:40:00.000") });
  const unresolved = plan(input);
  assert.equal(unresolved.state, "needs-review");
  assert.deepEqual(unresolved.occurrences[0].blockers, ["start-choice-required", "end-choice-required"]);
  const resolved = plan({ ...input, resolutions: [{ sequence: 1, start: "earlier", end: "later" }] });
  assert.equal(resolved.state, "ready");
  assert.equal(Date.parse(resolved.occurrences[0].range.endAt) - Date.parse(resolved.occurrences[0].range.startAt), 90 * 60000);
  const backwards = plan({ ...input, resolutions: [{ sequence: 1, start: "later", end: "earlier" }] });
  assert.equal(backwards.state, "needs-review"); assert.deepEqual(backwards.occurrences[0].blockers, ["instant-order"]);
});
test("Lord Howe repeated time has30minute separation without an hour-sized assumption", () => {
  const r = plan(single({ timeZone: "Australia/Lord_Howe", anchor: span("2026-04-05", "01:35:00.000", "01:55:00.000"), resolutions: [{ sequence: 1, start: "earlier", end: "later" }] }));
  assert.equal(r.state, "ready"); const c = r.occurrences[0].startResolution.candidates;
  assert.equal(c.length, 2); assert.equal(Date.parse(c[1].instant) - Date.parse(c[0].instant), 30 * 60000);
  assert.equal(Date.parse(r.occurrences[0].range.endAt) - Date.parse(r.occurrences[0].range.startAt), 50 * 60000);
});
test("representationally unsupported historical second offsets refuse instead of rounding", () => {
  const r = plan(single({ timeZone: "Europe/Paris", anchor: span("1900-06-01") }));
  assert.equal(r.state, "needs-review"); assert.equal(r.occurrences[0].range, null);
  assert.equal(r.occurrences[0].startResolution.kind, "unsupported");
  assert.equal(r.occurrences[0].startResolution.reason, "offset");
});
test("cross-midnight anchors use independent end date and preserve calendar span", () => {
  const r = plan(request({ anchor: { startCivil: "2026-10-25T23:30:00.000", endCivil: "2026-10-26T01:00:00.000" } }));
  assert.equal(r.state, "ready"); assert.equal(r.occurrences[1].range.endAt, "2026-11-02T01:00:00.000Z");
});
test("exceptions cannot reorder or overlap earlier reviewed ranges; adjacency remains usable", () => {
  const replacement = { sequence: 2, kind: "replace", reason: "Fictional exception", ...span("2026-10-25", "09:30:00.000", "11:00:00.000") };
  const blocked = plan(request({ exceptions: [replacement] }));
  assert.equal(blocked.state, "needs-review"); assert.deepEqual(blocked.occurrences[1].blockers, ["prior-order-or-overlap"]);
  const adjacent = plan(request({ exceptions: [{ ...replacement, ...span("2026-10-25", "10:00:00.456", "11:00:00.000") }] }));
  assert.equal(adjacent.state, "ready");
});
test("known unambiguous or skipped endpoints reject extraneous repeated-time choices", () => {
  bad(() => plan(single({ resolutions: [{ sequence: 1, start: "earlier", end: null }] })), "recurrence_choice");
  bad(() => validate(single({ resolutions: [{ sequence: 1, start: "earlier", end: null }], exceptions: [{ sequence: 1, kind: "skip", reason: "Fictional" }] })));
});
test("closed limits reject missing zones, impossible dates, zero/oversized counts and horizons", () => {
  for (const timeZone of [null, "", "+01:00", "Not/AZone", " UTC "]) bad(() => validate(single({ timeZone })));
  for (const count of [0, 9, 1.5]) bad(() => validate(request({ count })));
  for (const intervalWeeks of [0, 5, 1.2]) bad(() => validate(request({ intervalWeeks })));
  for (const startCivil of ["2026-02-30T09:00:00.000", "2026-01-01T24:00:00.000", "2026-01-01T09:00", "2026-01-01T09:00:00.000Z"]) bad(() => validate(single({ anchor: { startCivil, endCivil: "2026-03-01T10:00:00.000" } })));
  bad(() => validate(single({ anchor: span("2026-10-25", "10:00:00.000", "09:00:00.000") })), "recurrence_duration");
  bad(() => validate(single({ anchor: { startCivil: "2026-10-25T09:00:00.000", endCivil: "2026-11-02T09:00:00.000" } })), "recurrence_duration");
  bad(() => validate(request({ anchor: span("2200-12-31") })), "recurrence_civil");
  bad(() => validate(single({ exceptions: [{ sequence: 1, kind: "replace", reason: "Too far", ...span("2028-01-01") }] })), "recurrence_horizon");
});
test("all exception/resolution slots are dense, unique, ordered and closed", () => {
  bad(() => validate(request({ resolutions: [{ sequence: 2, start: null, end: null }, { sequence: 1, start: null, end: null }] })));
  bad(() => validate(request({ resolutions: [] })));
  bad(() => validate(request({ exceptions: [{ sequence: 1, kind: "skip", reason: "A" }, { sequence: 1, kind: "skip", reason: "B" }] })));
  bad(() => validate(single({ exceptions: [{ sequence: 1, kind: "skip", reason: " ", consent: true }] })));
  bad(() => validate({ ...request(), authority: true }));
});
test("proxy/accessor/dense-array/Unicode ownership refuses without invoking code", () => {
  let calls = 0;
  const getter = request(); Object.defineProperty(getter, "timeZone", { enumerable: true, get() { calls++; throw Error("must not execute"); } });
  bad(() => validate(getter)); assert.equal(calls, 0);
  const proxy = new Proxy(request(), { ownKeys() { calls++; throw Error("must not execute"); } });
  bad(() => validate(proxy)); assert.equal(calls, 0);
  const nested = request(); nested.anchor = new Proxy(nested.anchor, { getPrototypeOf() { calls++; throw Error("must not execute"); } });
  bad(() => validate(nested)); assert.equal(calls, 0);
  const sparse = request(); delete sparse.resolutions[0]; bad(() => validate(sparse));
  const decorated = request(); decorated.resolutions.extra = true; bad(() => validate(decorated));
  const cycle = request(); cycle.anchor = cycle; bad(() => validate(cycle));
  bad(() => validate({ ...request(), count: Infinity }));
  for (const reason of ["bad\ntext", "bad\u007ftext", "bad\ud800text", "x".repeat(301)]) bad(() => validate(single({ exceptions: [{ sequence: 1, kind: "skip", reason }] })));
  const hidden = request(); Object.defineProperty(hidden, "secret", { value: 1 }); bad(() => validate(hidden));
  const badKey = request(); badKey["bad\u0000key"] = 1; bad(() => validate(badKey));
  bad(() => validate(Object.assign(Object.create(null), request())));
  bad(() => validate({ ...request(), arbitrary: "x".repeat(16384) }), "recurrence_limit");
});
test("outputs detach and recursively freeze every retained exception/resolution", () => {
  const input = single({ exceptions: [{ sequence: 1, kind: "skip", reason: "Fictional café 😀" }] });
  const owned = validate(input), r = plan(input);
  input.exceptions[0].reason = "Edited later";
  assert.equal(owned.exceptions[0].reason, "Fictional café 😀");
  assert.equal(r.occurrences[0].exception.reason, "Fictional café 😀");
  assert(Object.isFrozen(r.occurrences[0].exception)); assert(Object.isFrozen(owned.anchor));
  assert.throws(() => { r.occurrences[0].exception.reason = "No"; }, TypeError);
});
test("digests are domain-separated canonical values and do not consult the current clock", () => {
  const input = single(), original = Date.now;
  Date.now = () => { throw Error("Current time must not select a recurrence"); };
  try {
    const r = plan(input), copy = { ...r }; delete copy.planSha256;
    assert.equal(r.inputSha256, createHash("sha256").update("charitology:participation-recurrence:v1:input\0" + canonical(input)).digest("hex"));
    assert.equal(r.planSha256, createHash("sha256").update("charitology:participation-recurrence:v1:plan\0" + canonical(copy)).digest("hex"));
    assert.notEqual(r.inputSha256, r.planSha256);
    assert.equal(recurringScheduleHash(Object.fromEntries(Object.entries(input).reverse())), r.inputSha256);
    assert.notEqual(recurringScheduleHash({ ...input, intervalWeeks: 2 }), r.inputSha256);
  } finally { Date.now = original; }
});
test("maximum8 review measures all16 distinct endpoint searches without changing semantic output", () => {
  const input = request({ count: 8, intervalWeeks: 4, resolutions: Array.from({ length: 8 }, (_, i) => ({ sequence: i + 1, start: null, end: null })) });
  const t = performance.now(), r = plan(input), elapsedMs = performance.now() - t;
  assert.equal(r.state, "ready"); assert.equal(r.occurrences.length, RECURRING_LIMITS.occurrences);
  assert.equal(new Set(r.occurrences.flatMap(x => [x.effective.startCivil, x.effective.endCivil])).size, 16);
  assert.equal(r.occurrences[7].range.startAt, "2027-05-09T09:00:00.123Z");
  assert(!Object.hasOwn(r, "elapsedMs"));
  console.log("recurring-max8-benchmark " + JSON.stringify({ occurrences: 8, distinctEndpointResolutions: 16, unchangedResolverOffsetsPerEndpoint: 100801, elapsedMs: Math.round(elapsedMs), runtime: process.version, icu: process.versions.icu, tz: process.versions.tz, planSha256: r.planSha256 }));
});
