import test from "node:test";
import assert from "node:assert/strict";
import {
  MODULES,
  exampleRecords,
  getModule,
  validateRecord,
  validateTransition,
  summarizeMoney,
  modulePermissions,
} from "../lib/modules.mjs";
const orgId = "org-test";
const dollars = (minor) => ({ minor, currency: "USD", precision: 2 });
const row = (id, moduleId, data, status) => ({
  id,
  orgId,
  moduleId,
  data,
  status: status || getModule(moduleId).workflow.initial,
});
const validate = (
  moduleId,
  data,
  records = [],
  recordId = "candidate",
  status,
) => validateRecord(moduleId, data, { records, recordId, orgId, status });
test("All 26 modules expose real typed contracts and a valid complete fictional draft", () => {
  assert.equal(MODULES.length, 26);
  assert.equal(new Set(MODULES.map((m) => m.id)).size, 26);
  const examples = exampleRecords(orgId);
  for (const m of MODULES) {
    assert.ok(m.fields.length >= 8);
    assert.ok(m.workflow.transitions.length);
    assert.ok(m.invariants.length);
    assert.doesNotThrow(() =>
      validate(
        m.id,
        examples.find((r) => r.moduleId === m.id).data,
        examples,
        `example-${m.id}`,
      ),
    );
  }
});
test("Money retains unknown and zero, separates currencies, rejects precision and total overflow", () => {
  assert.deepEqual(
    summarizeMoney([
      null,
      dollars(null),
      dollars(0),
      dollars(125),
      { minor: 20, currency: "JPY", precision: 0 },
    ]),
    { totals: { "USD:2": 125, "JPY:0": 20 }, unknown: 2 },
  );
  assert.throws(
    () =>
      validate("finance", {
        title: "Bad cents",
        planned: { minor: 1.5, currency: "USD", precision: 2 },
      }),
    /minor/,
  );
  assert.throws(
    () =>
      validate("finance", {
        title: "Bad precision",
        planned: { minor: 1, currency: "JPY", precision: 2 },
      }),
    /precision/,
  );
  assert.throws(
    () => summarizeMoney([dollars(Number.MAX_SAFE_INTEGER), dollars(1)]),
    /precision/,
  );
  assert.throws(() => summarizeMoney([4]), /Invalid money/);
});
test("Datetime offsets must match real named zones; valid overnight shifts remain valid", () => {
  const d = {
    title: "Night shift",
    kind: "shift",
    startAt: "2026-11-12T23:00:00Z",
    endAt: "2026-11-13T02:00:00Z",
    timeZone: "UTC",
    capacity: 2,
  };
  assert.doesNotThrow(() => validate("volunteers", d));
  assert.throws(
    () => validate("volunteers", { ...d, endAt: "2026-11-12T22:00:00Z" }),
    /later/,
  );
  assert.throws(
    () => validate("volunteers", { ...d, timeZone: "America/New_York" }),
    /offset/,
  );
  assert.throws(
    () => validate("volunteers", { ...d, startAt: "2026-02-30T23:00:00Z" }),
    /real ISO/,
  );
});
test("Dependencies reject self/cycles and completion before prerequisites", () => {
  const records = [
    row("a", "projects", { title: "A", kind: "task", dependencyIds: ["b"] }),
    row("b", "projects", { title: "B", kind: "task", dependencyIds: [] }),
  ];
  assert.throws(
    () =>
      validate(
        "projects",
        { title: "B", kind: "task", dependencyIds: ["a"] },
        records,
        "b",
      ),
    /cycle/,
  );
  assert.throws(
    () =>
      validate("projects", { title: "A", dependencyIds: ["a"] }, records, "a"),
    /cycle/,
  );
  assert.throws(
    () =>
      validate(
        "projects",
        { title: "B", dependencyIds: ["a"] },
        records,
        "b",
        "done",
      ),
    /Finish dependencies/,
  );
});
test("Reference context refuses cross-tenant targets and missing module IDs", () => {
  assert.throws(() => getModule("__proto__"), /Unknown module/);
  assert.throws(
    () =>
      validate("projects", { title: "Work", programId: "foreign" }, [
        { ...row("foreign", "programs", {}), orgId: "other" },
      ]),
    /outside this organization/,
  );
  assert.throws(
    () => validateRecord("projects", { title: "Work", programId: "missing" }),
    /reference context/,
  );
  assert.throws(
    () =>
      validate("casework", {
        title: "A private case narrative",
        coordinationCode: "ref-001",
      }),
    /pseudonymous/,
  );
  assert.throws(
    () =>
      validate("casework", {
        title: "ref-001",
        coordinationCode: "ref-001",
        notes: "not supported",
      }),
    /Unknown/,
  );
});
test("Approved allocation caps include siblings, parent edits and currency identity", () => {
  const budget = row(
    "budget",
    "finance",
    { title: "Budget", kind: "budget", planned: dollars(10000) },
    "approved",
  );
  const allocation = row(
    "allocation",
    "finance",
    {
      title: "A",
      kind: "allocation",
      parentBudgetId: "budget",
      planned: dollars(6000),
      allocationBps: 6000,
    },
    "approved",
  );
  const incoming = {
    title: "B",
    kind: "allocation",
    parentBudgetId: "budget",
    planned: dollars(5000),
    allocationBps: 5000,
  };
  assert.throws(
    () => validate("finance", incoming, [budget, allocation], "b", "approved"),
    /exceed/,
  );
  assert.doesNotThrow(() =>
    validate(
      "finance",
      { ...incoming, planned: dollars(4000), allocationBps: 4000 },
      [budget, allocation],
      "b",
      "approved",
    ),
  );
  assert.throws(
    () =>
      validate(
        "finance",
        { title: "Lower budget", kind: "budget", planned: dollars(5000) },
        [budget, allocation],
        "budget",
        "approved",
      ),
    /reduced/,
  );
  assert.throws(
    () =>
      validate(
        "finance",
        {
          ...incoming,
          planned: { minor: 4000, currency: "EUR", precision: 2 },
        },
        [budget],
        "b",
        "approved",
      ),
    /currency/,
  );
});
test("Grant restriction codes, program identity and award caps constrain allocations", () => {
  const grant = row(
    "grant",
    "grant-delivery",
    {
      title: "Award",
      kind: "agreement",
      restriction: "restricted",
      restrictionCode: "food",
      allowedPurpose: "Food access",
      awarded: dollars(5000),
    },
    "active",
  );
  const d = {
    title: "Use award",
    kind: "allocation",
    agreementId: "grant",
    planned: dollars(3000),
    purpose: "Food access",
    restrictionCode: "food",
  };
  assert.doesNotThrow(() => validate("finance", d, [grant], "one", "approved"));
  assert.throws(
    () =>
      validate(
        "finance",
        { ...d, restrictionCode: "unrelated" },
        [grant],
        "one",
        "approved",
      ),
    /restriction/,
  );
  assert.throws(
    () =>
      validate(
        "finance",
        d,
        [grant, row("existing", "finance", d, "approved")],
        "two",
        "approved",
      ),
    /award/,
  );
});
test("Volunteer active assignments enforce places, duplicates, overlap and parent capacity edits", () => {
  const shift = row(
    "shift",
    "volunteers",
    {
      title: "Night",
      kind: "shift",
      startAt: "2026-11-12T23:00:00Z",
      endAt: "2026-11-13T02:00:00Z",
      timeZone: "UTC",
      capacity: 1,
    },
    "open",
  );
  const contact = row("contact", "contacts", {
    title: "Alias",
    kind: "person-reference",
  });
  const assigned = row(
    "assigned",
    "volunteers",
    {
      title: "Assignment",
      kind: "assignment",
      shiftId: "shift",
      contactId: "contact",
    },
    "assigned",
  );
  assert.doesNotThrow(() =>
    validate(
      "volunteers",
      assigned.data,
      [shift, contact],
      "assigned",
      "assigned",
    ),
  );
  assert.throws(
    () =>
      validate(
        "volunteers",
        assigned.data,
        [shift, contact, assigned],
        "other",
        "assigned",
      ),
    /capacity|already/,
  );
  assert.throws(
    () =>
      validate(
        "volunteers",
        { ...shift.data, capacity: 0 },
        [shift, contact, assigned],
        "shift",
        "open",
      ),
    /capacity|place/,
  );
  assert.throws(
    () =>
      validate(
        "volunteers",
        {
          title: "Attendance",
          kind: "attendance",
          shiftId: "shift",
          minutes: 181,
        },
        [shift],
      ),
    /duration/,
  );
});
test("Observations preserve null/zero and reject unit/denominator/source mismatches", () => {
  const indicator = row("indicator", "outcomes", {
    title: "Rate",
    kind: "indicator",
    unit: "percent",
  });
  const d = {
    title: "Observation",
    kind: "observation",
    indicatorId: "indicator",
    unit: "percent",
    value: 0,
    denominator: 100,
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    evidence: "self-reported",
  };
  assert.equal(validate("outcomes", d, [indicator]).value, 0);
  assert.equal(
    validate("outcomes", { ...d, value: null, denominator: null }, [indicator])
      .value,
    null,
  );
  assert.throws(
    () => validate("outcomes", { ...d, denominator: 0 }, [indicator]),
    /positive denominator/,
  );
  assert.throws(
    () => validate("outcomes", { ...d, unit: "visits" }, [indicator]),
    /unit differs/,
  );
  assert.throws(
    () =>
      validate("outcomes", { ...d, evidence: "source-linked" }, [indicator]),
    /sourceUrl/,
  );
});
test("External mapping duplicates, unsafe URLs and unreviewed import totals are rejected", () => {
  const existing = row("existing", "contacts", {
    title: "Alias",
    externalSystem: "CRM",
    externalId: "42",
  });
  assert.throws(
    () =>
      validate(
        "contacts",
        { title: "Duplicate", externalSystem: "crm", externalId: "42" },
        [existing],
      ),
    /already mapped/,
  );
  assert.throws(
    () =>
      validate("contacts", {
        title: "URL",
        externalUrl: "https://user:secret@example.org/",
      }),
    /credentials/,
  );
  assert.throws(
    () =>
      validate(
        "integrations",
        {
          title: "Import",
          kind: "import",
          sourceChecksum: "a".repeat(64),
          fieldOwner: "local",
          previewApproved: true,
          inputRows: 3,
          acceptedRows: 2,
          rejectedRows: 0,
          skippedRows: 0,
        },
        [],
        "import",
        "completed",
      ),
    /Input must equal/,
  );
});
test("Role, persisted approval and snapshot gates protect grant submissions", () => {
  const context = {
    role: "grants_lead",
    approved: true,
    actorId: "reviewer",
    ownerId: "author",
  };
  assert.throws(
    () =>
      validateTransition("grant-seeking", "review", "approved", {
        ...context,
        approved: false,
      }),
    /approval/,
  );
  assert.throws(
    () =>
      validateTransition("grant-seeking", "review", "approved", {
        ...context,
        actorId: "author",
      }),
    /own work/,
  );
  assert.throws(
    () => validateTransition("grant-seeking", "approved", "submitted", context),
    /snapshot/,
  );
  assert.equal(
    validateTransition("grant-seeking", "approved", "submitted", {
      ...context,
      snapshotApproved: true,
    }),
    true,
  );
  assert.equal(modulePermissions("casework", "board_reader").read, false);
  assert.equal(modulePermissions("organization", "contributor").write, false);
});
