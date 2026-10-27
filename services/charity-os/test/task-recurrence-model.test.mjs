import test from "node:test";
import assert from "node:assert/strict";
import { validateRecord } from "../lib/modules.mjs";
import { hash, stable } from "../lib/security.mjs";
import {
  TASK_RECURRENCE_METHOD,
  taskAnchor,
  taskCivilAt,
  resolveTaskCivil,
  validateTaskAnchor,
  validateTaskCandidate,
  taskRecurrenceSeriesId,
  taskRecurrenceRecordId,
  taskMembershipHash,
  prepareTaskRecurrence,
} from "../lib/task-recurrence-model.mjs";

// All identities, work and authority below are fictional unit fixtures. No service or provider is called.
const orgId = "fictional-recurrence-org";
const member = () => ({
  userId: "fictional-writer",
  role: "owner",
  programIds: [],
  revision: 1,
  createdAtExact: "2026-01-01T00:00:00.123456Z",
});
function row(id, moduleId, data, status = "planned") {
  return {
    id,
    orgId,
    moduleId,
    data,
    status,
    ownerId: "fictional-prior-owner",
    lastEditedBy: "fictional-prior-editor",
    revision: 3,
    approval: null,
    snapshot: null,
    source: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
function source(changes = {}, other = []) {
  const data = validateRecord(
    "projects",
    {
      title: "Fictional recurring work",
      kind: "task",
      dueAt: "2027-01-31T09:15:00.123Z",
      timeZone: "UTC",
      recurrence: "monthly",
      ...changes,
    },
    { orgId, recordId: "fictional-root", records: other, status: "planned" },
  );
  return row("fictional-root", "projects", data);
}
function anchor(dueAt, frequency = "monthly", timeZone = "UTC") {
  return taskAnchor(source({ dueAt, recurrence: frequency, timeZone }));
}
function prepare(s = source(), extra = {}) {
  return prepareTaskRecurrence({
    source: s,
    series: null,
    member: member(),
    records: [s],
    resolution: null,
    ...extra,
  });
}
function series(plan, changes = {}) {
  return {
    id: plan.seriesId,
    orgId,
    rootRecordId: plan.anchor.rootRecordId,
    method: TASK_RECURRENCE_METHOD,
    anchor: plan.anchor,
    state: "active",
    revision: 1,
    tipRecordId: plan.generatedRecordId,
    tipSequence: 1,
    createdBy: member().userId,
    createdAt: "2026-01-01T00:00:00.000Z",
    endedAt: null,
    endCode: null,
    recoveredState: null,
    budgetBytes: 4096,
    lastEndCommand: null,
    ...changes,
  };
}

test("original monthly day clamps February and returns to March 31 without cumulative drift", () => {
  const a = anchor("2027-01-31T09:15:00.123Z");
  assert.equal(taskCivilAt(a, 1), "2027-02-28T09:15:00.123");
  assert.equal(taskCivilAt(a, 2), "2027-03-31T09:15:00.123");
  assert.equal(taskCivilAt(a, 3), "2027-04-30T09:15:00.123");
  assert.equal(taskCivilAt(a, 12), "2028-01-31T09:15:00.123");
});
test("every target month uses the original day and actual Gregorian month length", () => {
  for (const year of [1900, 2000, 2027, 2028, 2099, 2100, 2199]) {
    const a = anchor(`${year}-01-31T23:59:59.007Z`);
    for (let n = 1; n <= 12; n++) {
      const month = (n % 12) + 1,
        targetYear = year + Math.floor(n / 12);
      const day = Math.min(
        31,
        new Date(Date.UTC(targetYear, month, 0)).getUTCDate(),
      );
      assert.equal(
        taskCivilAt(a, n),
        `${targetYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T23:59:59.007`,
      );
    }
  }
});
test("quarterly anchor returns July 31 after April clamp and retains leap day", () => {
  const a = anchor("2027-01-31T00:00:00Z", "quarterly");
  assert.equal(taskCivilAt(a, 1), "2027-04-30T00:00:00.000");
  assert.equal(taskCivilAt(a, 2), "2027-07-31T00:00:00.000");
  assert.equal(
    taskCivilAt(anchor("2028-02-29T00:00:00Z", "quarterly"), 4),
    "2029-02-28T00:00:00.000",
  );
});
test("weekly arithmetic carries local dates across month, leap and year boundaries", () => {
  assert.equal(
    taskCivilAt(anchor("2026-12-29T23:55:40.007Z", "weekly"), 1),
    "2027-01-05T23:55:40.007",
  );
  assert.equal(
    taskCivilAt(anchor("2028-02-26T23:55:40Z", "weekly"), 1),
    "2028-03-04T23:55:40.000",
  );
});
test("sequence and supported date bounds refuse before any rollover output", () => {
  const a = anchor("2027-01-31T00:00:00Z");
  for (const n of [0, -1, 0.5, 2001, Infinity, NaN, "1"])
    assert.throws(() => taskCivilAt(a, n));
  assert.equal(taskCivilAt(a, 2000), "2193-09-30T00:00:00.000");
  assert.throws(() => taskCivilAt(anchor("2200-12-31T00:00:00Z"), 1));
  assert.throws(() => taskCivilAt(anchor("2200-12-31T00:00:00Z", "weekly"), 1));
});
test("anchor retains zone spelling, original offset and exact fractional instant", () => {
  const s = source({
      dueAt: "2027-01-31T09:15:00.1+05:45",
      timeZone: "Asia/Kathmandu",
    }),
    before = stable(s);
  const a = taskAnchor(s);
  assert.equal(a.originalDueAt, s.data.dueAt);
  assert.equal(a.originalTimeZone, "Asia/Kathmandu");
  assert.equal(a.anchorCivil, "2027-01-31T09:15:00.100");
  assert.equal(a.anchorInstant, "2027-01-31T03:30:00.100Z");
  assert.equal(stable(s), before);
  assert(Object.isFrozen(a));
  assert.throws(() => {
    a.programId = "other";
  });
});
test("anchor refuses malformed dates, offset grammar, missing zone and schedule mismatch", () => {
  const valid = source();
  for (const dueAt of [
    "1899-12-31T00:00:00Z",
    "2201-01-01T00:00:00Z",
    "2027-02-29T00:00:00Z",
    "2027-01-01T24:00:00Z",
    "2027-01-01T00:00:60Z",
    "2027-01-01T00:00:00.1234Z",
    "2027-01-01T00:00:00+14:01",
    "2027-01-01T00:00:00+00:60",
    "2027-01-01T00:00:00",
  ])
    assert.throws(() =>
      taskAnchor({ ...valid, data: { ...valid.data, dueAt } }),
    );
  assert.throws(() =>
    taskAnchor({ ...valid, data: { ...valid.data, timeZone: null } }),
  );
  assert.throws(() =>
    taskAnchor({
      ...valid,
      data: { ...valid.data, dueAt: "2027-01-01T00:00:00+01:00" },
    }),
  );
  assert.throws(() =>
    taskAnchor({ ...valid, data: { ...valid.data, recurrence: "none" } }),
  );
});
test("civil resolver refuses malformed date and unknown zones with closed unsupported results", () => {
  assert.deepEqual(resolveTaskCivil("2027-02-29T01:00:00.000", "UTC"), {
    kind: "unsupported",
    civil: null,
    reason: "date-range",
    candidates: [],
  });
  assert.equal(
    resolveTaskCivil("2027-01-01T01:00:00.000", "Not/A_Zone").reason,
    "zone",
  );
  assert.equal(
    resolveTaskCivil("2027-01-01T01:00:00.000", null).reason,
    "zone",
  );
  assert.equal(
    resolveTaskCivil("2027-01-01T01:00:00.000", "+01:00").reason,
    "zone",
  );
  assert.equal(
    resolveTaskCivil("2027-01-01T01:00:00", "UTC").reason,
    "date-range",
  );
});
test("unique resolver preserves milliseconds and positive quarter-hour offset", () => {
  const r = resolveTaskCivil("2027-01-31T09:15:00.007", "Asia/Kathmandu");
  assert.equal(r.kind, "unique");
  assert.deepEqual(r.candidates, [
    {
      choice: "unique",
      dueAt: "2027-01-31T09:15:00.007+05:45",
      instant: "2027-01-31T03:30:00.007Z",
      offsetSeconds: 20700,
    },
  ]);
  assert(Object.isFrozen(r.candidates[0]));
});
test("New York spring gap refuses and fall fold retains two explicit instants", () => {
  assert.equal(
    resolveTaskCivil("2027-03-14T02:30:00.000", "America/New_York").kind,
    "gap",
  );
  const r = resolveTaskCivil("2027-11-07T01:30:00.123", "America/New_York");
  assert.equal(r.kind, "fold");
  assert.deepEqual(
    r.candidates.map((c) => [c.choice, c.instant, c.offsetSeconds]),
    [
      ["earlier", "2027-11-07T05:30:00.123Z", -14400],
      ["later", "2027-11-07T06:30:00.123Z", -18000],
    ],
  );
});
test("weekly local time spans 167 and 169 elapsed hours through clock transitions", () => {
  for (const [dueAt, expected] of [
    ["2027-03-07T09:15:00.123-05:00", 167],
    ["2027-10-31T09:15:00.123-04:00", 169],
  ]) {
    const a = anchor(dueAt, "weekly", "America/New_York"),
      r = resolveTaskCivil(taskCivilAt(a, 1), a.originalTimeZone);
    assert.equal(r.kind, "unique");
    assert.equal(
      (Date.parse(r.candidates[0].instant) - Date.parse(a.anchorInstant)) /
        3600000,
      expected,
    );
  }
});
test("Lord Howe half-hour fold and gap do not assume hour-sized transitions", () => {
  const fold = resolveTaskCivil(
    "2027-04-04T01:45:00.000",
    "Australia/Lord_Howe",
  );
  assert.equal(fold.kind, "fold");
  assert.equal(
    (Date.parse(fold.candidates[1].instant) -
      Date.parse(fold.candidates[0].instant)) /
      60000,
    30,
  );
  assert.equal(
    resolveTaskCivil("2027-10-03T02:15:00.000", "Australia/Lord_Howe").kind,
    "gap",
  );
});
test("Apia skipped civil day is a gap and historical sub-minute offset is unsupported", () => {
  assert.equal(
    resolveTaskCivil("2011-12-30T09:15:00.000", "Pacific/Apia").kind,
    "gap",
  );
  assert.deepEqual(
    resolveTaskCivil("1970-01-01T09:15:00.000", "Africa/Monrovia"),
    {
      kind: "unsupported",
      civil: "1970-01-01T09:15:00.000",
      reason: "offset",
      candidates: [],
    },
  );
});
test("resolver accepts exact fourteen-hour boundary but refuses UTC outside year range", () => {
  const r = resolveTaskCivil("2027-01-01T00:00:00.000", "Pacific/Kiritimati");
  assert.equal(r.candidates[0].offsetSeconds, 50400);
  assert.equal(
    resolveTaskCivil("1900-01-01T00:00:00.000", "Etc/GMT-14").reason,
    "date-range",
  );
});
test("historical candidate arithmetic remains admissible without current-zone reinterpretation", () => {
  const candidate = {
    choice: "unique",
    dueAt: "2027-01-01T09:00:00.123+01:00",
    instant: "2027-01-01T08:00:00.123Z",
    offsetSeconds: 3600,
  };
  assert.deepEqual(
    validateTaskCandidate(candidate, {
      civil: "2027-01-01T09:00:00.123",
      historical: true,
      timeZone: "UTC",
    }),
    candidate,
  );
  assert.throws(() =>
    validateTaskCandidate(candidate, {
      civil: "2027-01-01T09:00:00.123",
      timeZone: "UTC",
    }),
  );
  assert.throws(() =>
    validateTaskCandidate(
      { ...candidate, instant: "2027-01-01T08:00:00.124Z" },
      { civil: "2027-01-01T09:00:00.123", historical: true },
    ),
  );
  assert.throws(() =>
    validateTaskCandidate(
      { ...candidate, offsetSeconds: 3601 },
      { civil: "2027-01-01T09:00:00.123", historical: true },
    ),
  );
  assert.throws(() =>
    validateTaskCandidate(
      { ...candidate, extra: true },
      { civil: "2027-01-01T09:00:00.123", historical: true },
    ),
  );
});
test("historical anchor preserves unavailable old zone spelling while arithmetic remains exact", () => {
  const a = {
    ...anchor("2027-01-31T09:15:00Z"),
    originalTimeZone: "Historical/Unavailable",
    canonicalTimeZone: "Historical/Unavailable",
  };
  assert.deepEqual(validateTaskAnchor(a, { historical: true }), a);
  assert.throws(() => validateTaskAnchor(a));
  assert.equal(taskCivilAt(a, 1), "2027-02-28T09:15:00.000");
  assert.throws(() =>
    validateTaskAnchor(
      { ...a, anchorInstant: "2027-01-31T09:15:01.000Z" },
      { historical: true },
    ),
  );
});
test("current candidate requires its precise choice and native zone resolution", () => {
  const r = resolveTaskCivil("2027-11-07T01:30:00.000", "America/New_York");
  assert.deepEqual(
    validateTaskCandidate(r.candidates[0], {
      civil: r.civil,
      timeZone: "America/New_York",
    }),
    r.candidates[0],
  );
  assert.throws(() =>
    validateTaskCandidate(
      { ...r.candidates[0], choice: "unique" },
      { civil: r.civil, timeZone: "America/New_York" },
    ),
  );
});
test("membership fingerprint preserves microseconds and canonicalizes scope order only", () => {
  const m = member(),
    h = taskMembershipHash({
      ...m,
      programIds: ["fictional-b", "fictional-a"],
    });
  assert.equal(
    h,
    taskMembershipHash({ ...m, programIds: ["fictional-a", "fictional-b"] }),
  );
  const duplicate = taskMembershipHash({
    ...m,
    programIds: ["fictional-b", "fictional-a", "fictional-a"],
  });
  assert.equal(
    duplicate,
    taskMembershipHash({
      ...m,
      programIds: ["fictional-a", "fictional-b", "fictional-a"],
    }),
  );
  assert.notEqual(duplicate, h);
  for (const change of [
    { createdAtExact: "2026-01-01T00:00:00.123457Z" },
    { role: "contributor" },
    { revision: 2 },
    { programIds: ["fictional-a"] },
  ])
    assert.notEqual(
      taskMembershipHash({ ...m, ...change }),
      taskMembershipHash(m),
    );
  for (const change of [
    { createdAtExact: "2026-01-01T00:00:00.123Z" },
    { createdAtExact: new Date() },
    { extra: true },
  ])
    assert.throws(() => taskMembershipHash({ ...m, ...change }));
});
test("stable namespaced identities bind organization, root, method and exact sequence", () => {
  const s = taskRecurrenceSeriesId(orgId, "fictional-root");
  assert.match(s, /^[a-f0-9]{64}$/);
  assert.equal(s, taskRecurrenceSeriesId(orgId, "fictional-root"));
  assert.notEqual(
    s,
    taskRecurrenceSeriesId("fictional-other-org", "fictional-root"),
  );
  assert.notEqual(s, taskRecurrenceSeriesId(orgId, "fictional-other-root"));
  assert.notEqual(taskRecurrenceRecordId(s, 1), taskRecurrenceRecordId(s, 2));
  assert.throws(() => taskRecurrenceSeriesId("bad/id", "root"));
  assert.throws(() => taskRecurrenceRecordId(s, 2001));
});
test("preparation copies complete normalized data and clears all inherited authority", () => {
  const s = source({
    effortMinutes: 0,
    dependencyIds: [],
    deliverable: "Fictional completion condition",
  });
  s.status = "active";
  s.source = {
    integrationId: "fictional-connection",
    externalId: "fictional-remote",
    checksum: "a".repeat(64),
  };
  s.approval = {
    status: "approved",
    revision: s.revision,
    actorId: "fictional-reviewer",
    at: "2026-01-01T00:00:00Z",
  };
  s.snapshot = { fictional: true };
  const before = stable(s),
    r = prepare(s),
    p = r.plan;
  assert.equal(r.kind, "ready");
  assert.equal(stable(s), before);
  assert.equal(p.sequence, 1);
  assert.equal(p.seriesRevision, null);
  assert.equal(p.sourceApproval, "current");
  assert.equal(p.candidate.status, "planned");
  assert.equal(p.candidate.ownerId, member().userId);
  assert.equal(p.candidate.lastEditedBy, member().userId);
  assert.equal(p.candidate.revision, 1);
  assert.equal(p.candidate.approval, null);
  assert.equal(p.candidate.snapshot, null);
  assert.equal(p.candidate.source, null);
  assert.deepEqual(p.candidate.data, {
    ...s.data,
    dueAt: "2027-02-28T09:15:00.123Z",
  });
  assert.equal(p.sourceDataHash, hash(s.data));
  assert.equal(p.candidateDataHash, hash(p.candidate.data));
  const { planHash, ...basis } = p;
  assert.equal(planHash, hash(basis));
  assert(Object.isFrozen(p.candidate.data));
  assert(Object.isFrozen(p.referenceRevisions));
});
test("null dependencies and unknown effort remain distinct from empty array and zero", () => {
  const p = prepare(source({ dependencyIds: null, effortMinutes: null })).plan;
  assert.equal(p.candidate.data.dependencyIds, null);
  assert.equal(p.candidate.data.effortMinutes, null);
  assert.notEqual(
    p.candidateDataHash,
    prepare(source({ dependencyIds: [], effortMinutes: 0 })).plan
      .candidateDataHash,
  );
});
test("fold preparation requires explicit earlier or later for each occurrence", () => {
  const s = source({
    dueAt: "2027-10-31T01:30:00-04:00",
    timeZone: "America/New_York",
    recurrence: "weekly",
  });
  assert.equal(prepare(s).kind, "needs-resolution");
  const earlier = prepare(s, { resolution: "earlier" }).plan,
    later = prepare(s, { resolution: "later" }).plan;
  assert.notEqual(earlier.planHash, later.planHash);
  assert.equal(earlier.chosen.instant, "2027-11-07T05:30:00.000Z");
  assert.equal(later.chosen.instant, "2027-11-07T06:30:00.000Z");
  assert.throws(() => prepare(s, { resolution: "unique" }));
});
test("gap preparation yields no candidate or draft and does not shift the clock", () => {
  const s = source({
      dueAt: "2027-03-07T02:30:00-05:00",
      timeZone: "America/New_York",
      recurrence: "weekly",
    }),
    r = prepare(s);
  assert.equal(r.kind, "unavailable");
  assert.equal(r.code, "gap");
  assert.equal(r.resolution.civil, "2027-03-14T02:30:00.000");
  assert(!Object.hasOwn(r, "plan"));
});
test("reference revisions are actual, unique and sorted without changing dependency order", () => {
  const program = row(
    "fictional-program",
    "programs",
    { title: "Fictional program", kind: "program" },
    "active",
  );
  const parent = row("fictional-parent", "projects", {
    title: "Fictional parent",
    kind: "project",
    programId: program.id,
    dependencyIds: [],
  });
  const b = row(
    "fictional-b",
    "projects",
    {
      title: "Fictional B",
      kind: "task",
      programId: program.id,
      dependencyIds: [],
    },
    "done",
  );
  const a = row(
    "fictional-a",
    "projects",
    {
      title: "Fictional A",
      kind: "task",
      programId: program.id,
      dependencyIds: [],
    },
    "done",
  );
  const refs = [program, parent, b, a],
    s = source(
      {
        programId: program.id,
        projectId: parent.id,
        dependencyIds: [b.id, a.id],
      },
      refs,
    ),
    p = prepare(s, { records: [s, ...refs] }).plan;
  assert.deepEqual(
    p.referenceRevisions,
    refs
      .map((x) => ({ id: x.id, revision: x.revision }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
  );
  assert.deepEqual(p.candidate.data.dependencyIds, [b.id, a.id]);
  assert.equal(p.referenceHash, hash(p.referenceRevisions));
  assert.throws(() =>
    prepare(s, { records: [s, ...refs.filter((x) => x !== a)] }),
  );
  assert.throws(() =>
    prepare(s, {
      records: [s, ...refs],
      member: {
        ...member(),
        role: "contributor",
        programIds: ["fictional-other-program"],
      },
    }),
  );
});
test("preparation refuses inaccessible references even when the source itself is in scope", () => {
  const dep = row("fictional-dependency", "projects", {
    title: "Fictional dependency",
    kind: "task",
    programId: "fictional-other-program",
    dependencyIds: [],
  });
  const s = source({ dependencyIds: [dep.id] }, [dep]);
  assert.throws(
    () =>
      prepare(s, {
        records: [s, dep],
        member: {
          ...member(),
          role: "contributor",
          programIds: ["fictional-allowed-program"],
        },
      }),
    (error) =>
      error.status === 403 && error.code === "task_recurrence_reference",
  );
});
test("preparation uses original series anchor after clamped predecessor and mutable title edit", () => {
  const p = prepare().plan,
    s = row(p.generatedRecordId, "projects", {
      ...p.candidate.data,
      title: "Fictional edited next task",
    });
  const r = prepare(s, { series: series(p), records: [s] });
  assert.equal(r.kind, "ready");
  assert.equal(r.plan.sequence, 2);
  assert.equal(r.plan.chosen.dueAt, "2027-03-31T09:15:00.123Z");
  assert.equal(r.plan.candidate.data.title, s.data.title);
  assert.equal(r.plan.anchor.originalDueAt, "2027-01-31T09:15:00.123Z");
});
test("ended and recovered series never prepare new work", () => {
  const p = prepare().plan,
    s = row(p.generatedRecordId, "projects", p.candidate.data);
  for (const state of ["ended", "recovered"])
    assert.equal(
      prepare(s, { series: series(p, { state }), records: [s] }).code,
      state,
    );
  const historicalId = taskRecurrenceSeriesId(
    "fictional-origin-org",
    p.anchor.rootRecordId,
  );
  assert.equal(
    prepare(s, {
      series: series(p, { id: historicalId, state: "recovered" }),
      records: [s],
    }).code,
    "recovered",
  );
});
test("active tip schedule and stable identity cannot be replaced by an unrelated task", () => {
  const p = prepare().plan,
    s = row(p.generatedRecordId, "projects", p.candidate.data),
    rs = series(p);
  for (const change of [
    { timeZone: "Etc/UTC" },
    { recurrence: "weekly" },
    { dueAt: "2027-02-28T09:16:00.123Z" },
  ]) {
    const changed = { ...s, data: { ...s.data, ...change } };
    assert.throws(() => prepare(changed, { series: rs, records: [changed] }));
  }
  const unrelated = { ...s, id: "fictional-unrelated" };
  assert.throws(() =>
    prepare(unrelated, {
      series: { ...rs, tipRecordId: unrelated.id },
      records: [unrelated],
    }),
  );
  assert.throws(() =>
    prepare(s, {
      series: { ...rs, tipRecordId: "fictional-old-tip" },
      records: [s],
    }),
  );
});
test("preparation rejects stale source, duplicate/cross-tenant records and colliding generated IDs", () => {
  const s = source(),
    p = prepare(s).plan;
  assert.throws(() => prepare(s, { records: [{ ...s, revision: 4 }] }));
  assert.throws(() => prepare(s, { records: [s, s] }));
  assert.throws(() =>
    prepare(s, {
      records: [
        s,
        { ...s, id: "fictional-other", orgId: "fictional-other-org" },
      ],
    }),
  );
  assert.throws(() =>
    prepare(s, { records: [s, { ...s, id: p.generatedRecordId }] }),
  );
  assert.throws(() => prepare(s, { records: [] }));
});
test("role, unnormalized and closed request fields refuse instead of manufacturing authority", () => {
  const s = source();
  assert.throws(() => prepare(s, { member: { ...member(), role: "board" } }));
  const unnormalized = {
    ...s,
    data: { ...s.data, title: "  Fictional title  " },
  };
  assert.throws(() => prepare(unnormalized));
  assert.throws(() => prepare(s, { resolution: "first" }));
  assert.throws(() => prepare(s, { extra: true }));
  assert.throws(() => prepare({ ...s, data: { ...s.data, unexpected: 1 } }));
  assert.throws(() => prepare({ ...s, unexpected: 1 }));
});
test("private input getters, cycles, sparse arrays and non-finite values are rejected without invocation", () => {
  const s = source();
  let reads = 0;
  const trapped = { ...s };
  Object.defineProperty(trapped, "data", {
    get() {
      reads++;
      throw Error("getter should not run");
    },
    enumerable: true,
  });
  assert.throws(() => prepare(trapped));
  assert.equal(reads, 0);
  const cycle = { ...s };
  cycle.snapshot = cycle;
  assert.throws(() => prepare(cycle));
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => prepare(s, { records: sparse }));
  assert.throws(() =>
    prepare({ ...s, data: { ...s.data, effortMinutes: NaN } }),
  );
});
test("returned plan owns detached immutable values even after callers edit their source", () => {
  const s = source({ dependencyIds: [] }),
    m = member(),
    r = prepare(s, { member: m });
  s.data.title = "Different";
  s.data.dependencyIds.push("fictional-late");
  m.programIds.push("fictional-new");
  assert.equal(r.plan.candidate.data.title, "Fictional recurring work");
  assert.deepEqual(r.plan.candidate.data.dependencyIds, []);
  assert.throws(() =>
    r.plan.candidate.data.dependencyIds.push("fictional-edit"),
  );
});
test("calendar and plan do not consult process-local time zone or current clock", () => {
  const prior = process.env.TZ;
  try {
    process.env.TZ = "Pacific/Honolulu";
    const a = prepare().plan;
    process.env.TZ = "Asia/Tokyo";
    const b = prepare().plan;
    assert.equal(a.planHash, b.planHash);
  } finally {
    if (prior === undefined) delete process.env.TZ;
    else process.env.TZ = prior;
  }
});

test("all 102 allowed references fit while the ordinary 100-dependency bound stays enforced", () => {
  const program = row(
    "fictional-full-program",
    "programs",
    { title: "Fictional program", kind: "program" },
    "active",
  );
  const parent = row("fictional-full-parent", "projects", {
    title: "Fictional parent",
    kind: "project",
    programId: program.id,
    dependencyIds: [],
  });
  const dependencies = Array.from({ length: 100 }, (_, i) =>
    row(
      `fictional-dep-${String(i).padStart(3, "0")}`,
      "projects",
      {
        title: "Fictional dependency",
        kind: "task",
        programId: program.id,
        dependencyIds: [],
      },
      "done",
    ),
  );
  const refs = [program, parent, ...dependencies],
    s = source(
      {
        programId: program.id,
        projectId: parent.id,
        dependencyIds: dependencies.map((r) => r.id),
      },
      refs,
    );
  assert.equal(
    prepare(s, { records: [s, ...refs] }).plan.referenceRevisions.length,
    102,
  );
  const extra = row(
    "fictional-extra",
    "projects",
    {
      title: "Fictional extra",
      kind: "task",
      programId: program.id,
      dependencyIds: [],
    },
    "done",
  );
  const tooMany = {
    ...s,
    data: { ...s.data, dependencyIds: [...s.data.dependencyIds, extra.id] },
  };
  assert.throws(() => prepare(tooMany, { records: [tooMany, ...refs, extra] }));
});

test("historical helper policy is explicit boolean and saved source authority fields are required", () => {
  const a = anchor("2027-01-31T09:15:00Z");
  assert.throws(() => validateTaskAnchor(a, { historical: "true" }));
  assert.throws(() => validateTaskAnchor(a, { historical: true, extra: true }));
  const candidate = {
    choice: "unique",
    dueAt: a.originalDueAt,
    instant: a.anchorInstant,
    offsetSeconds: 0,
  };
  assert.throws(() =>
    validateTaskCandidate(candidate, { civil: a.anchorCivil, historical: 1 }),
  );
  const s = source();
  delete s.approval;
  assert.throws(() => prepare(s));
  class ExoticArray extends Array {}
  assert.throws(() =>
    prepare(source(), { records: new ExoticArray(source()) }),
  );
});

test("near-quota actual record shapes prepare without cloning unrelated approved snapshots", () => {
  const root = source(),
    data = validateRecord(
      "projects",
      { title: "x".repeat(180), kind: "task", deliverable: "é".repeat(4000) },
      { orgId, recordId: "fictional-filler", records: [], status: "planned" },
    );
  const records = [
    root,
    ...Array.from({ length: 1993 }, (_, i) => {
      const r = row("fictional-near-cap-" + i, "projects", data);
      r.approval = {
        status: "approved",
        revision: r.revision,
        actorId: "fictional-independent-reviewer",
        at: "2026-01-01T00:00:00.000Z",
      };
      r.snapshot = {
        id: r.id,
        orgId: r.orgId,
        moduleId: r.moduleId,
        data: r.data,
        status: r.status,
        ownerId: r.ownerId,
        revision: r.revision,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        files: [],
      };
      return r;
    }),
  ];
  const pgJson = (v) =>
    Array.isArray(v)
      ? "[" + v.map(pgJson).join(", ") + "]"
      : v && typeof v === "object"
        ? "{" +
          Object.keys(v)
            .map((k) => JSON.stringify(k) + ": " + pgJson(v[k]))
            .join(", ") +
          "}"
        : JSON.stringify(v);
  const structuredBytes = records.reduce(
    (sum, r) => sum + Buffer.byteLength(pgJson(r.data)),
    0,
  );
  const fullContext = {
    source: root,
    series: null,
    member: member(),
    records,
    resolution: null,
  };
  assert.equal(records.length, 1994);
  assert.ok(structuredBytes < 16 * 1024 * 1024);
  assert.ok(structuredBytes > 16.6 * 1000 * 1000);
  assert.ok(Buffer.byteLength(stable(fullContext)) > 32 * 1024 * 1024);
  assert.ok(
    Buffer.byteLength(stable(fullContext)) + records.length * 4096 <
      60 * 1024 * 1024,
  );
  const result = prepareTaskRecurrence(fullContext);
  assert.equal(result.kind, "ready");
  assert.equal(result.plan.sourceDataHash, hash(root.data));
  assert.equal(result.plan.candidate.data.title, root.data.title);
  console.log(
    "Fictional near-quota recurrence fixture: " +
      structuredBytes +
      " Postgres-style structured-data bytes, " +
      Buffer.byteLength(stable(fullContext)) +
      " unprojected context bytes; no database or production claim.",
  );
});
