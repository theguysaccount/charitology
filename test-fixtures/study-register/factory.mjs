// Synthetic acceptance data only. Never imported by a production catalogue or browser entry point.
export const at = "2026-10-26T12:00:00.000Z";
export const protocol = {
  title: "Synthetic review",
  question: "What is reported in this synthetic set?",
  population: "Fictional aggregate population",
  intervention: "Synthetic intervention",
  comparison: null,
  outcomes: "Reported aggregate observations",
  timeHorizon: null,
  eligibleDesigns: ["unknown", "randomized", "observational"],
  eligibleSourceClasses: ["unknown", "empirical-report", "review"],
  inclusion: "Record relevant reports.",
  exclusion: "Exclude explicitly irrelevant source classes.",
  searchPlan: "No actual search was performed; synthetic acceptance only.",
};
export function context(m, state, prefix = "test") {
  let n = 0;
  return m.studyStateHash(state).then((expectedStateHash) => ({
    expectedStateHash,
    at,
    makeId: () => `${prefix}-${++n}`,
  }));
}
export async function command(m, state, input, prefix = "command") {
  const c = await context(m, state, prefix);
  return (await m.prepareStudyCommand(state, input, c)).nextState;
}
export async function imported(
  m,
  {
    text = "title,doi,year,url,abstract\nSynthetic first,10.0000/a,2025,https://example.invalid/a,Reported zero\nSynthetic duplicate,10.0000/a,2025,https://example.invalid/a,Alternate citation\nSynthetic distinct,10.0000/b,,https://example.invalid/b,Unknown year\nOrganization homepage,,,https://example.invalid/organization,Nonstudy source\nNot retrieved,10.0000/c,2026,https://example.invalid/c,No full report",
  } = {},
) {
  let s = m.blankStudyState("synthetic-register", at);
  const preview = await m.previewCitationImport(
    s,
    {
      kind: "citation-csv",
      bytes: new TextEncoder().encode(text),
      fileName: "synthetic.csv",
      columnMap: { title: 0, doi: 1, year: 2, url: 3, abstract: 4 },
      searchRunId: null,
      provenanceNote: "Synthetic fixture; no actual literature search.",
    },
    await m.studyStateHash(s),
  );
  s = await command(
    m,
    s,
    {
      kind: "import.commit",
      preview,
      assignments: m.defaultImportAssignments(preview),
      reason: "Import synthetic acceptance citations.",
    },
    "source",
  );
  return s;
}
export async function exactBoundaryState(m) {
  const build = async (length) => {
    const text =
      "title,abstract\n" +
      Array.from(
        { length: 90 },
        (_, i) => `Synthetic ${i},${"x".repeat(length)}`,
      ).join("\n");
    let s = m.blankStudyState("synthetic-boundary-register", at);
    const p = await m.previewCitationImport(
      s,
      {
        kind: "citation-csv",
        bytes: new TextEncoder().encode(text),
        fileName: "synthetic-boundary.csv",
        columnMap: { title: 0, abstract: 1 },
        searchRunId: null,
        provenanceNote: null,
      },
      await m.studyStateHash(s),
    );
    s = await command(
      m,
      s,
      {
        kind: "import.commit",
        preview: p,
        assignments: m.defaultImportAssignments(p),
        reason: "Synthetic byte-boundary fixture.",
      },
      "boundary",
    );
    return s;
  };
  let lo = 1,
    hi = 8000,
    valid;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    try {
      const s = await build(mid);
      valid = s;
      lo = mid + 1;
    } catch (e) {
      if (e.code !== "backup_limit") throw e;
      hi = mid - 1;
    }
  }
  let state = structuredClone(valid);
  state.draft = {
    tab: "reports",
    selectedReportId: null,
    form: { kind: "metadata", targetId: null, fields: { title: "x" } },
    dirty: true,
  };
  const gap = m.STUDY_LIMITS.backupBytes - m.studyBackupBytes(state);
  if (gap < 0) {
    state = structuredClone(await build(hi - 1));
    state.draft = {
      tab: "reports",
      selectedReportId: null,
      form: { kind: "metadata", targetId: null, fields: { title: "x" } },
      dirty: true,
    };
  }
  const fill = m.STUDY_LIMITS.backupBytes - m.studyBackupBytes(state);
  if (fill < 0 || fill + 1 > 8000)
    throw Error("Synthetic padding did not fit.");
  state.draft.form.fields.title += "x".repeat(fill);
  return m.validateStudyState(state);
}
