// Synthetic local fixtures only. No public loader imports these records.
export const at = "2026-10-27T07:00:00.000Z";
let serial = 0;
export function protocolContent(m, program = "replication-program") {
  const a = m.adapterForProgram(program),
    values = Object.fromEntries(
      a.fields.map((f) => [
        f.key,
        f.type === "select"
          ? f.options[0].value
          : f.type === "url"
            ? "https://example.invalid/original"
            : f.type === "date" || f.type === "number"
              ? ""
              : f.required
                ? "Synthetic " + f.key
                : "",
      ]),
    );
  values.title = "Synthetic " + program;
  return {
    adapterId: a.id,
    adapterHash: a.hash,
    values,
    resultsKnown: "unknown",
    registration: null,
  };
}
export async function context(m, state, prefix = "synthetic-" + ++serial) {
  let id = 0;
  return {
    expectedStateHash: await m.artifactStateHash(state),
    at,
    makeId: () => prefix + "-" + ++id,
  };
}
export async function command(m, state, input, prefix) {
  return (
    await m.prepareArtifactCommand(
      state,
      input,
      await context(m, state, prefix),
    )
  ).nextState;
}
export async function withProject(m, program = "replication-program") {
  let state = m.blankArtifactState("synthetic-artifact-register", at);
  return command(m, state, {
    kind: "protocol.freeze",
    projectId: null,
    expectedProtocolId: null,
    expectedProtocolHash: null,
    content: protocolContent(m, program),
    amendmentReason: "Synthetic initial plan.",
  });
}
export const manifestContent = () => ({
  artifacts: [
    {
      id: "synthetic-artifact",
      role: "output",
      title: "Synthetic output description",
      fileName: "synthetic.txt",
      url: null,
      access: "not-shared",
      license: null,
      note: "Fictional bytes only.",
      checksum: null,
    },
  ],
  environment: "Synthetic Node environment.",
  runInstructions: "No study is executed by this fixture.",
  deviations: "No changes recorded in this synthetic example.",
});
export const estimate = (
  value = 0,
  url = "https://example.invalid/result",
) => ({
  estimate: value,
  lower: value,
  upper: value,
  intervalLevel: null,
  unit: "synthetic units",
  measure: "synthetic measure",
  population: "fictional population",
  timeHorizon: "one fictional interval",
  denominator: 0,
  source: { url, locator: "Synthetic table" },
});
export const resultContent = () => ({
  kind: "observed",
  observedOn: null,
  summary: "Synthetic self-recorded zero.",
  original: estimate(0, "https://example.invalid/original"),
  reported: estimate(0),
  deviations: "Synthetic deviation note.",
  limitations: "No real study, observation or independent review.",
  sourceReferences: [],
  conflicts: { state: "unknown", note: null },
});
export const comparisonContent = () => ({
  compatible: true,
  compatibilityReason: "Identical fictional units, population and horizon.",
  showDifference: true,
  interpretation: "Arithmetic only; no causal claim.",
  limitations: "Synthetic example only.",
  nextCheck: "Check a real source before use.",
});
export async function workflow(m) {
  let s = await withProject(m);
  let v = m.artifactProjectView(s, s.projects[0].id);
  s = await command(m, s, {
    kind: "manifest.freeze",
    projectId: v.project.id,
    protocolId: v.currentProtocol.id,
    protocolHash: v.currentProtocol.hash,
    previousId: null,
    content: manifestContent(),
  });
  v = m.artifactProjectView(s, s.projects[0].id);
  s = await command(m, s, {
    kind: "result.record",
    projectId: v.project.id,
    protocolId: v.currentProtocol.id,
    protocolHash: v.currentProtocol.hash,
    manifestId: v.currentManifest.id,
    manifestHash: v.currentManifest.hash,
    supersedesId: null,
    content: resultContent(),
  });
  v = m.artifactProjectView(s, s.projects[0].id);
  return command(m, s, {
    kind: "comparison.record",
    resultId: v.latestResult.id,
    resultHash: v.latestResult.hash,
    supersedesId: null,
    content: comparisonContent(),
  });
}
export function legacyExport(
  m,
  program = "replication-program",
  recordId = "legacy-record",
) {
  return {
    version: 1,
    program,
    records: [
      {
        id: recordId,
        createdAt: at,
        updatedAt: at,
        values: protocolContent(m, program).values,
      },
    ],
    draft: { title: "Unfinished draft, never imported." },
    editing: null,
  };
}
export function legacyInput(
  m,
  program = "replication-program",
  recordId = "legacy-record",
) {
  return {
    kind: "legacy-research-json",
    bytes: new TextEncoder().encode(
      JSON.stringify(legacyExport(m, program, recordId)),
    ),
    fileName: "synthetic-legacy.json",
    program,
    selectedRecordIds: [recordId],
  };
}
const boundaryCache = new WeakMap();
export async function exactBoundaryState(m) {
  if (!boundaryCache.has(m))
    boundaryCache.set(
      m,
      (async () => {
        let s = m.blankArtifactState("synthetic-boundary-register", at),
          i = 0;
        const content = protocolContent(m),
          a = m.adapterForProgram("replication-program");
        for (const f of a.fields)
          if (f.type === "textarea") content.values[f.key] = "x".repeat(8000);
        while (
          m.artifactBackupBytes(s) <
          m.ARTIFACT_LIMITS.backupBytes - 210000
        ) {
          const old = s.projects.length
            ? m.artifactProjectView(s, s.projects[0].id)
            : null;
          const c = structuredClone(content);
          c.values.analysis = "Synthetic " + ++i + " " + "x".repeat(7970);
          s = await command(
            m,
            s,
            {
              kind: "protocol.freeze",
              projectId: old?.project.id ?? null,
              expectedProtocolId: old?.currentProtocol.id ?? null,
              expectedProtocolHash: old?.currentProtocol.hash ?? null,
              content: c,
              amendmentReason: "Synthetic boundary version " + i,
            },
            "boundary-" + i,
          );
        }
        s = structuredClone(s);
        s.draft = {
          tab: "protocol",
          selectedProjectId: null,
          form: { kind: "protocol", targetId: null, fields: {} },
          dirty: true,
        };
        const keys = [
          ...new Set([
            "adapterId",
            "adapterHash",
            "projectId",
            "expectedProtocolId",
            "expectedProtocolHash",
            "resultsKnown",
            "registration",
            "amendmentReason",
            ...["methods-lab", "replication-program"].flatMap((p) =>
              m.adapterForProgram(p).fields.map((f) => f.key),
            ),
          ]),
        ];
        s.draft.form.fields.title = "";
        for (const key of keys.filter((k) => k !== "title")) {
          const missing =
            m.ARTIFACT_LIMITS.backupBytes - m.artifactBackupBytes(s);
          if (missing < 8100) break;
          s.draft.form.fields[key] = "x".repeat(8000);
        }
        let lo = 0,
          hi = 8000;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          s.draft.form.fields.title = "x".repeat(mid);
          if (m.artifactBackupBytes(s) <= m.ARTIFACT_LIMITS.backupBytes)
            lo = mid;
          else hi = mid - 1;
        }
        s.draft.form.fields.title = "x".repeat(lo);
        if (
          m.artifactBackupBytes(s) !== m.ARTIFACT_LIMITS.backupBytes ||
          lo >= 8000
        )
          throw Error("Synthetic exact boundary fixture could not fit.");
        return m.validateArtifactState(s);
      })(),
    );
  return structuredClone(await boundaryCache.get(m));
}
