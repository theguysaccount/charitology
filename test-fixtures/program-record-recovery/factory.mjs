// Excluded fictional fixtures only. No actual program/participant data.
export const STAMP = "2026-10-27T00:00:00.000Z";
export function osFixture() {
  return {
    organization: "Fictional test organization",
    mission: "A synthetic recovery test",
    community: "No actual participants",
    currency: "USD",
    projects: [
      {
        id: "shared",
        title: "Fictional project",
        status: "active",
        owner: "Role A",
        due: "2028-02-29",
        depth: null,
        budget: 100,
        spent: 0,
        goal: "Test only",
        notes: "  retained text  ",
      },
    ],
    grants: [
      {
        id: "shared",
        title: "Fictional grant",
        funder: "Fictional funder",
        projectId: "shared",
        status: "drafting",
        requested: 0,
        awarded: 0,
        deadline: "",
        owner: "",
        next: "",
        notes: "",
      },
    ],
    tasks: [
      {
        id: "shared",
        title: "Fictional task",
        projectId: "shared",
        status: "todo",
        priority: "normal",
        due: "",
        owner: "",
        notes: "",
      },
    ],
    outcomes: [
      {
        id: "shared",
        date: "2026-10-27",
        projectId: "shared",
        indicator: "Fictional measure",
        value: null,
        unit: "visits",
        evidence: "unknown",
        source: "",
        notes: "",
      },
      {
        id: "zero",
        date: "2026-10-27",
        projectId: "shared",
        indicator: "Fictional zero",
        value: 0,
        unit: "visits",
        evidence: "self-reported",
        source: "https://example.invalid/fixture",
        notes: "",
      },
      {
        id: "negative",
        date: "2026-10-27",
        projectId: "",
        indicator: "Fictional negative",
        value: -1.25,
        unit: "units",
        evidence: "documented",
        source: "",
        notes: "",
      },
    ],
  };
}
export const osEnvelope = (workspace = osFixture()) => ({
  format: "charitology.charity-os",
  version: 1,
  exportedAt: STAMP,
  workspace,
});
export function exactGeneralBoundary(old, bytes = 8_000_000) {
  const config = old.programWorkspaces["university-chapters"],
    value = old.sampleWorkspace(config);
  value.updated = STAMP;
  value.records.sessions = Array.from({ length: 250 }, (_, i) => ({
    id: "session-" + i,
    values: { ...value.records.sessions[0].values },
  }));
  value.records.roles = Array.from({ length: 250 }, (_, i) => ({
    id: "role-" + i,
    values: { ...value.records.roles[0].values },
  }));
  value.records.tasks = [];
  const areas = [];
  for (const c of config.collections)
    for (const row of value.records[c.key])
      for (const f of c.fields)
        if (f.kind === "textarea") areas.push([row.values, f.key]);
  const length = () => Buffer.byteLength(JSON.stringify(value, null, 2));
  let lo = 1,
    hi = 5000;
  while (lo < hi) {
    const n = Math.ceil((lo + hi) / 2);
    for (const [v, k] of areas) v[k] = "é".repeat(n);
    if (length() <= bytes) lo = n;
    else hi = n - 1;
  }
  for (const [v, k] of areas) v[k] = "é".repeat(lo);
  let rest = bytes - length();
  for (const [v, k] of areas) {
    const n = Math.min(rest, 5000 - v[k].length);
    v[k] += "x".repeat(n);
    rest -= n;
    if (!rest) break;
  }
  if (rest || length() !== bytes)
    throw Error("Fictional native boundary construction failed");
  return value;
}
export function exactOsCompact(old, bytes = 4_500_000) {
  const value = old.blankWorkspace();
  value.tasks = Array.from({ length: 2000 }, (_, i) => ({
    id: "task-" + i,
    title: "Fictional",
    projectId: "",
    status: "todo",
    priority: "normal",
    due: "",
    owner: "",
    notes: "",
  }));
  const base = Buffer.byteLength(JSON.stringify(value)),
    n = Math.floor((bytes - base) / 2000);
  value.tasks.forEach((t) => (t.notes = "x".repeat(n)));
  value.tasks[0].notes += "x".repeat(
    bytes - Buffer.byteLength(JSON.stringify(value)),
  );
  return value;
}
