import test from "node:test";
import assert from "node:assert/strict";
import {
  previewLocalOsMigration,
  isLocalOsBackup,
  legacyMoney,
  MAX_LOCAL_BYTES,
} from "../lib/migration.mjs";
import { validateBackup } from "../lib/backup.mjs";
import { hash } from "../lib/security.mjs";
const organization = {
  name: "Synthetic shared organization",
  currency: "USD",
  time_zone: "America/New_York",
};
const now = "2026-10-26T16:00:00.000Z";
function fixture() {
  return {
    format: "charitology.charity-os",
    version: 1,
    exportedAt: "2026-10-25T12:00:00.000Z",
    workspace: {
      organization: "Synthetic local organization",
      mission: "Synthetic program mission.",
      community: "PRIVATE COMMUNITY TEXT",
      currency: "USD",
      projects: [
        {
          id: "project-one",
          title: "Synthetic project",
          status: "complete",
          owner: "PRIVATE OWNER LABEL",
          due: "2026-12-01",
          depth: 0,
          budget: 10.29,
          spent: 0,
          goal: "Synthetic intended change.",
          notes: "PRIVATE PROJECT NOTES",
        },
      ],
      grants: [
        {
          id: "grant-one",
          title: "Synthetic grant",
          funder: "Synthetic funder label",
          projectId: "project-one",
          status: "awarded",
          requested: 15.05,
          awarded: 10.01,
          deadline: "2026-11-01",
          owner: "PRIVATE GRANT OWNER",
          next: "PRIVATE NEXT STEP",
          notes: "PRIVATE GRANT NOTES",
        },
      ],
      tasks: [
        {
          id: "task-one",
          title: "Synthetic task",
          projectId: "project-one",
          status: "done",
          priority: "high",
          due: "2026-11-01",
          owner: "PRIVATE TASK OWNER",
          notes: "PRIVATE TASK NOTES",
        },
      ],
      outcomes: [
        {
          id: "outcome-one",
          date: "2026-10-25",
          projectId: "project-one",
          indicator: "Synthetic visits",
          value: 0,
          unit: "",
          evidence: "independent",
          source: "https://example.invalid/synthetic-evidence",
          notes: "PRIVATE OUTCOME NOTES",
        },
      ],
    },
  };
}
const preview = (input, changes = {}) =>
  previewLocalOsMigration(input, { organization, now, ...changes });
const record = (p, id) => p.backup.records.find((r) => r.id === id);
test("actual four-collection local export becomes a native shared backup with checked typed relationships", () => {
  const input = fixture(),
    p = preview(input),
    map = p.backup.migration.idMap;
  assert.equal(p.summary.sourceRecords, 4);
  assert.deepEqual(p.summary.sourceCounts, {
    projects: 1,
    grants: 1,
    tasks: 1,
    outcomes: 1,
  });
  assert.equal(p.summary.targetRecords, 9);
  assert.equal(p.summary.requiresEmptyOrganization, true);
  assert.equal(p.summary.requiresExplicitConfirmation, true);
  assert.equal(map.projects["project-one"].targetId, "project-one");
  assert.equal(map.tasks["task-one"].targetId, "task-one");
  const project = record(p, "project-one"),
    task = record(p, "task-one"),
    programId = map.projects["project-one"].companions.program;
  assert.equal(project.data.kind, "project");
  assert.equal(project.data.programId, programId);
  assert.equal(task.data.projectId, project.id);
  assert.equal(task.data.programId, programId);
  const seeking = record(p, "grant-one"),
    award = record(p, map.grants["grant-one"].companions.award);
  assert.equal(seeking.data.programId, programId);
  assert.equal(award.data.applicationId, seeking.id);
  assert.equal(
    seeking.data.funderId,
    map.grants["grant-one"].companions.funder,
  );
  assert.equal(
    record(p, seeking.data.funderId).data.contactPreference,
    "unknown",
  );
  const restored = validateBackup(
    JSON.parse(JSON.stringify(p.backup)),
    "synthetic-org",
    "synthetic-user",
  );
  assert.equal(restored.length, 9);
  assert.ok(
    restored.every(
      (r) =>
        r.orgId === "synthetic-org" &&
        r.ownerId === "synthetic-user" &&
        r.approval === null &&
        r.snapshot === null,
    ),
  );
});
test("canonical source hash and private original preserve every unsupported field without altering source or generic notes", () => {
  const input = fixture();
  input.workspace.projects[0].beneficiaryHistory = {
    narrative: "PRIVATE UNSUPPORTED NARRATIVE",
    nested: [null, 0, false],
  };
  input.operatorExtra = "PRIVATE ENVELOPE DATA";
  const before = structuredClone(input),
    p = preview(input);
  assert.deepEqual(input, before);
  assert.deepEqual(p.backup.migration.sourceBackup, before);
  assert.equal(p.inputCanonicalHash, hash(before));
  const active = JSON.stringify(p.backup.records);
  for (const forbidden of [
    "PRIVATE PROJECT NOTES",
    "PRIVATE OWNER LABEL",
    "PRIVATE COMMUNITY TEXT",
    "PRIVATE UNSUPPORTED NARRATIVE",
    "PRIVATE ENVELOPE DATA",
    "PRIVATE NEXT STEP",
  ])
    assert.equal(active.includes(forbidden), false);
  assert.ok(
    p.warnings.some(
      (w) =>
        w.sourceId === "project-one" &&
        w.sourceFields?.includes("beneficiaryHistory"),
    ),
  );
  assert.ok(
    p.warnings.every(
      (w) =>
        Object.hasOwn(w, "sourceId") &&
        typeof w.field === "string" &&
        typeof w.reason === "string",
    ),
  );
  const reordered = Object.fromEntries(Object.entries(input).reverse());
  assert.equal(preview(reordered).inputCanonicalHash, p.inputCanonicalHash);
  const raw = JSON.stringify(input, null, 2),
    fromText = preview(raw);
  assert.equal(fromText.inputCanonicalHash, p.inputCanonicalHash);
  assert.equal(fromText.backup.migration.inputByteHash, hash(raw));
  const tampered = structuredClone(p.backup);
  tampered.migration.sourceBackup.workspace.projects[0].goal =
    "Changed after preview";
  assert.throws(
    () => validateBackup(tampered, "org", "user"),
    (error) => error.code === "checksum",
  );
});
test("money converts decimal strings exactly to safe minor units, retains zero and never rounds subunits", () => {
  assert.deepEqual(legacyMoney(0.29, "USD"), {
    minor: 29,
    currency: "USD",
    precision: 2,
  });
  assert.deepEqual(legacyMoney(0, "JPY"), {
    minor: 0,
    currency: "JPY",
    precision: 0,
  });
  assert.deepEqual(legacyMoney(0.001, "KWD"), {
    minor: 1,
    currency: "KWD",
    precision: 3,
  });
  assert.equal(legacyMoney(1.001, "USD"), null);
  assert.equal(legacyMoney(1.1, "JPY"), null);
  assert.equal(legacyMoney(0.1 + 0.2, "USD"), null);
  assert.equal(legacyMoney(null, "USD"), null);
  assert.equal(legacyMoney(1, "XYZ"), null);
  assert.equal(legacyMoney(Infinity, "USD"), null);
  const p = preview(fixture()),
    budget = record(
      p,
      p.backup.migration.idMap.projects["project-one"].companions.budget,
    );
  assert.deepEqual(budget.data.planned, {
    minor: 1029,
    currency: "USD",
    precision: 2,
  });
  assert.deepEqual(budget.data.actual, {
    minor: 0,
    currency: "USD",
    precision: 2,
  });
  assert.deepEqual(record(p, "grant-one").data.requested, {
    minor: 1505,
    currency: "USD",
    precision: 2,
  });
});
test("unsupported money stays archived and active-null; a planning currency change performs no exchange conversion", () => {
  const input = fixture();
  input.workspace.currency = "EUR";
  input.workspace.projects[0].budget = 0.001;
  const p = preview(input),
    budget = record(
      p,
      p.backup.migration.idMap.projects["project-one"].companions.budget,
    );
  assert.equal(budget.data.planned, null);
  assert.equal(budget.data.actual.currency, "EUR");
  assert.equal(p.backup.organization.currency, "USD");
  assert.ok(p.warnings.some((w) => w.code === "currency_not_converted"));
  assert.ok(
    p.warnings.some(
      (w) =>
        w.sourceId === "project-one" &&
        w.field === "budget" &&
        w.code === "unrepresentable_money",
    ),
  );
  assert.equal(
    p.backup.migration.sourceBackup.workspace.projects[0].budget,
    0.001,
  );
  input.workspace.currency = "XYZ";
  const unsupported = preview(input);
  assert.equal(record(unsupported, "grant-one").data.requested, null);
  assert.ok(
    unsupported.warnings.some((w) => w.code === "unsupported_currency"),
  );
});
test("missing depth stays null; zero depth survives; measurements and evidence never become invented observations", () => {
  const input = fixture(),
    p = preview(input),
    program = record(
      p,
      p.backup.migration.idMap.projects["project-one"].companions.program,
    ),
    outcome = record(p, "outcome-one");
  assert.equal(program.data.depth, 0);
  assert.equal(program.data.evidence, null);
  assert.equal(outcome.data.kind, "indicator");
  assert.equal(outcome.data.unit, null);
  assert.equal(outcome.data.value, null);
  assert.equal(outcome.data.evidence, null);
  assert.equal(outcome.data.startDate, null);
  assert.equal(outcome.data.endDate, null);
  assert.equal(outcome.data.denominator, null);
  assert.equal(p.backup.migration.sourceBackup.workspace.outcomes[0].value, 0);
  assert.equal(
    p.backup.migration.sourceBackup.workspace.outcomes[0].evidence,
    "independent",
  );
  assert.equal(p.summary.archivedObservationMeasurements, 1);
  assert.ok(
    p.warnings.some(
      (w) =>
        w.code === "observation_needs_review" && w.sourceId === "outcome-one",
    ),
  );
  input.workspace.projects[0].depth = null;
  input.workspace.outcomes[0].value = null;
  input.workspace.outcomes[0].unit = "percent";
  const unknown = preview(input);
  assert.equal(
    record(
      unknown,
      unknown.backup.migration.idMap.projects["project-one"].companions.program,
    ).data.depth,
    null,
  );
  assert.equal(record(unknown, "outcome-one").data.unit, "percent");
  assert.equal(record(unknown, "outcome-one").data.value, null);
  assert.equal(
    unknown.backup.migration.sourceBackup.workspace.outcomes[0].value,
    null,
  );
});
test("date-only deadlines and declared completion/award statuses do not create instants, reminders or approvals", () => {
  const p = preview(fixture());
  for (const r of p.backup.records) {
    assert.equal(r.approval, null);
    assert.equal(r.snapshot, null);
    assert.equal(Object.hasOwn(r, "ownerId"), false);
  }
  assert.equal(record(p, "project-one").status, "planned");
  assert.equal(record(p, "task-one").status, "planned");
  assert.equal(record(p, "grant-one").status, "prospect");
  assert.equal(record(p, "project-one").data.dueAt, null);
  assert.equal(record(p, "project-one").data.timeZone, null);
  assert.equal(record(p, "grant-one").data.deadlineAt, null);
  assert.equal(p.backup.organization.timeZone, organization.time_zone);
  assert.ok(p.warnings.some((w) => w.code === "date_without_time"));
  const prospect = fixture();
  prospect.workspace.grants[0].status = "prospect";
  prospect.workspace.grants[0].awarded = 0;
  const q = preview(prospect);
  assert.equal(
    q.backup.records.some((r) => r.moduleId === "grant-delivery"),
    false,
  );
  assert.ok(
    q.warnings.some((w) => w.sourceId === "grant-one" && w.field === "awarded"),
  );
});
test("IDs colliding across source collections and special property names remain deterministic with valid references", () => {
  const input = fixture();
  input.workspace.projects[0].id = "__proto__";
  input.workspace.grants[0].id = "__proto__";
  input.workspace.grants[0].projectId = "__proto__";
  input.workspace.tasks[0].id = "__proto__";
  input.workspace.tasks[0].projectId = "__proto__";
  input.workspace.outcomes[0].id = "__proto__";
  input.workspace.outcomes[0].projectId = "__proto__";
  const p = preview(input),
    q = preview(input),
    map = p.backup.migration.idMap;
  assert.equal(map.projects.__proto__.targetId, "__proto__");
  assert.notEqual(map.tasks.__proto__.targetId, "__proto__");
  assert.equal(
    record(p, map.tasks.__proto__.targetId).data.projectId,
    "__proto__",
  );
  assert.equal(
    new Set(p.backup.records.map((r) => r.id)).size,
    p.backup.records.length,
  );
  assert.deepEqual(p.backup, q.backup);
  assert.equal(
    JSON.parse(JSON.stringify(map)).projects.__proto__.targetId,
    "__proto__",
  );
  assert.doesNotThrow(() => validateBackup(p.backup, "org", "user"));
  assert.ok(p.warnings.filter((w) => w.code === "id_collision").length === 3);
});
test("derived companion IDs never take an original ID and no original fields are silently truncated", () => {
  const input = fixture();
  input.workspace.tasks[0].id = "local_program_project-one";
  const p = preview(input);
  assert.equal(
    p.backup.migration.idMap.tasks["local_program_project-one"].targetId,
    "local_program_project-one",
  );
  assert.notEqual(
    p.backup.migration.idMap.projects["project-one"].companions.program,
    "local_program_project-one",
  );
  input.workspace.projects[0].title = "x".repeat(161);
  assert.throws(
    () => preview(input),
    (error) =>
      error.code === "local_os_migration" && error.issues[0].field === "title",
  );
  assert.equal(input.workspace.projects[0].title.length, 161);
});
test("malformed, partial, orphaned and unsupported source data fails all-or-nothing without changing the original", () => {
  for (const mutate of [
    (x) => (x.version = 2),
    (x) => delete x.workspace.tasks,
    (x) => (x.workspace.tasks[0].projectId = "absent"),
    (x) => x.workspace.projects.push(structuredClone(x.workspace.projects[0])),
    (x) => (x.workspace.projects[0].budget = null),
    (x) => (x.workspace.projects[0].depth = 5),
    (x) => (x.workspace.outcomes[0].date = "2026-02-30"),
    (x) =>
      (x.workspace.outcomes[0].source =
        "https://user:password@example.invalid/"),
    (x) => (x.workspace.tasks[0].priority = "urgent"),
  ]) {
    const input = fixture();
    mutate(input);
    const before = structuredClone(input);
    assert.throws(() => preview(input));
    assert.deepEqual(input, before);
  }
  assert.equal(
    isLocalOsBackup({ format: "charitology-os", version: 1 }),
    false,
  );
  assert.throws(() => preview("{broken"));
  assert.throws(() =>
    preview(fixture(), {
      organization: { ...organization, time_zone: undefined },
    }),
  );
});
test("bounded source sizes/record counts/depth are rejected explicitly rather than partially migrated", () => {
  const input = fixture();
  input.workspace.projects = Array.from({ length: 2001 }, (_, i) => ({
    ...input.workspace.projects[0],
    id: `p-${i}`,
  }));
  assert.throws(() => preview(input), /2,000/);
  assert.throws(() => preview(" ".repeat(MAX_LOCAL_BYTES + 1)), /8 MiB/);
  const deep = fixture();
  let cursor = deep;
  for (let i = 0; i < 45; i++) {
    cursor.extra = {};
    cursor = cursor.extra;
  }
  assert.throws(() => preview(deep), /deeply nested/);
  const nonJson = fixture();
  nonJson.extra = undefined;
  assert.throws(() => preview(nonJson), /finite JSON/);
});
test("an empty original workspace remains a valid contextual import with zero invented operational records", () => {
  const source = fixture();
  for (const kind of ["projects", "grants", "tasks", "outcomes"])
    source.workspace[kind] = [];
  source.workspace.organization =
    source.workspace.mission =
    source.workspace.community =
      "";
  const p = preview(source);
  assert.equal(p.summary.sourceRecords, 0);
  assert.equal(p.backup.records.length, 1);
  assert.equal(p.backup.records[0].moduleId, "organization");
  assert.equal(p.backup.records[0].data.legalName, null);
  assert.doesNotThrow(() => validateBackup(p.backup, "org", "user"));
});
