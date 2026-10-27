// Excluded fictional fixtures. These are not operating records or public seeds.
export const at = "2026-10-27T12:00:00.000Z";
let serial = 0;
export const context = (m, state, digest) => ({
  expectedStateHash: m.hashProgramGraphSync(state),
  at,
  makeId: () => `fictional-${++serial}`,
  digest,
});
export async function command(m, state, cmd, digest) {
  return (
    await m.prepareProgramGraphCommand(state, cmd, context(m, state, digest))
  ).nextState;
}
export function source(m, program = "the-charitology-fund") {
  const a = m.adapterForProgram(program),
    values = (fields, draft = false) =>
      Object.fromEntries(
        fields.map((f) => [
          f.key,
          f.value ??
            (draft || f.optional
              ? ""
              : f.kind === "select"
                ? f.options[0]
                : f.kind === "number"
                  ? String(f.min ?? 0)
                  : f.kind === "date"
                    ? "2026-10-27"
                    : f.kind === "url"
                      ? "https://example.invalid/fictional-public-evidence"
                      : "Fictional planning text; no authority or observed result."),
        ]),
      );
  return {
    version: 1,
    program,
    updated: at,
    context: values(a.context, true),
    records: Object.fromEntries(
      a.collections.map((c) => [
        c.key,
        [
          {
            id: `fictional-${c.key}`,
            values: { ...values(c.fields), title: `Fictional ${c.label}` },
          },
        ],
      ]),
    ),
  };
}
export const input = (source, target = null) => ({
  bytes: new TextEncoder().encode(JSON.stringify(source, null, 2)),
  program: source.program,
  origin: { kind: "file", fileName: "fictional-source.json" },
  target,
});
export const target = (state, id = state.sources[0].id) => {
  const s = state.sources.find((x) => x.id === id),
    c = state.captures.find((x) => x.id === s.currentCaptureId);
  return { sourceId: id, expectedCaptureId: c.id, expectedCaptureHash: c.hash };
};
export async function capture(
  m,
  state,
  data,
  {
    sourceId = null,
    indexes = null,
    separate = false,
    resume = false,
    alias = "Fictional project copy",
  } = {},
) {
  const preview = await m.previewProgramCapture(
    state,
    input(data, sourceId === null ? null : target(state, sourceId)),
    await m.programGraphStateHash(state),
  );
  return command(m, state, {
    kind: "source.capture",
    preview,
    selection: {
      selectedIndexes:
        indexes ??
        preview.rows
          .filter((r) => r.trackedNodeId === null)
          .map((r) => r.index),
      alias: sourceId === null ? alias : null,
      completeCopyAcknowledged: true,
      separateCopyAcknowledged: separate,
      resumeRetired: resume,
    },
  });
}
export async function withGraph(m, program = "the-charitology-fund") {
  return capture(
    m,
    m.blankProgramGraphState(`fictional-state-${++serial}`, at),
    source(m, program),
  );
}
export function node(state, collection, sourceId = state.sources[0].id) {
  return state.nodes.find(
    (n) => n.sourceId === sourceId && n.collection === collection,
  );
}
export function linkCommand(
  m,
  state,
  from,
  to,
  kindOfRelation = "related-to",
  linkId = null,
) {
  if (kindOfRelation === "related-to" && from.id > to.id)
    [from, to] = [to, from];
  return {
    kind: "link.review",
    linkId,
    expectedLinkVersionId: linkId
      ? state.links.find((l) => l.id === linkId).currentVersionId
      : null,
    from: from.id,
    to: to.id,
    kindOfRelation,
    fromVersionId: from.currentVersionId,
    toVersionId: to.currentVersionId,
    reason:
      "Fictional deliberate planning relationship; no approval or effect claim.",
    legacyField: null,
    reappearanceAcknowledged: m.programGraphRequiredReappearanceIds(
      state,
      from.id,
      to.id,
      linkId,
    ),
  };
}
const cache = new WeakMap();
export async function exactBoundaryState(m) {
  if (cache.has(m)) return structuredClone(cache.get(m));
  let s = await withGraph(m),
    data = source(m);
  const adapter = m.adapterForProgram(data.program);
  for (const c of adapter.collections)
    for (const f of c.fields)
      if (f.kind === "textarea")
        data.records[c.key][0].values[f.key] = "x".repeat(5000);
  let turn = 0;
  while (m.graphBackupBytes(s) < 1_900_000) {
    for (const c of adapter.collections)
      data.records[c.key][0].values.title = `Fictional boundary row ${++turn}`;
    s = await capture(m, s, data, { sourceId: s.sources[0].id });
  }
  const copy = structuredClone(s);
  copy.draft = {
    tab: "import",
    sourceId: null,
    nodeId: null,
    dirty: true,
    form: {
      kind: "capture",
      targetId: null,
      binding: {},
      fields: { alias: "" },
    },
  };
  const names = m.PROGRAM_GRAPH_FORM_NAMES.capture;
  let remaining = m.PROGRAM_GRAPH_LIMITS.backupBytes - m.graphBackupBytes(copy);
  for (const [map, key] of [
    ...names.binding.map((k) => ["binding", k]),
    ...names.fields.filter((k) => k !== "alias").map((k) => ["fields", k]),
  ]) {
    if (remaining <= 8192) break;
    copy.draft.form[map][key] = "";
    remaining = m.PROGRAM_GRAPH_LIMITS.backupBytes - m.graphBackupBytes(copy);
    const take = Math.min(remaining - 8192, 16384);
    copy.draft.form[map][key] = "x".repeat(take);
    remaining = m.PROGRAM_GRAPH_LIMITS.backupBytes - m.graphBackupBytes(copy);
  }
  if (remaining < 0 || remaining > 16383)
    throw Error(`Fixture cannot represent exact padding: ${remaining}`);
  copy.draft.form.fields.alias = "x".repeat(remaining);
  const result = await m.validateProgramGraphState(copy);
  if (m.graphBackupBytes(result) !== 2_097_152)
    throw Error("Fixture is not exact 2 MiB.");
  cache.set(m, result);
  return structuredClone(result);
}
