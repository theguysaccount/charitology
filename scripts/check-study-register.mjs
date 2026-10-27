import assert from "node:assert/strict";
import { build } from "esbuild";
import ts from "typescript";
import {
  protocol,
  at,
  command,
  imported,
  exactBoundaryState,
} from "../test-fixtures/study-register/factory.mjs";
const result = await build({
  stdin: {
    contents:
      "export * from './src/lib/client/study-register-model.ts';export * from './src/lib/client/study-register-import.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const m = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
let checks = 0;
const check = async (label, fn) => {
  await fn();
  checks++;
  process.stdout.write(`✓ ${label}\n`);
};
const rejects = (fn, code) =>
  assert.rejects(fn, (e) => e instanceof Error && (!code || e.code === code));
let serial = 0;
const run = (s, c) => command(m, s, c, "operation-" + ++serial);
const first = (s) =>
  s.reports.find((r) => m.reportRevision(r).occurrenceIds.length).id;
const view = (s, id = first(s)) => m.studyReportView(s, id);
const decide = async (s, id, stage, lane, outcome, reason = null) => {
  const v = view(s, id),
    part = stage === "title-abstract" ? v.title : v.full;
  return run(s, {
    kind: "decision.record",
    ...v.binding,
    stage,
    lane,
    laneLabel: "Self-recorded " + lane,
    outcome,
    reasonCode: outcome === "exclude" ? "irrelevant" : null,
    reason,
    supersedesId: (lane === "A" ? part.decisionA : part.decisionB)?.id ?? null,
    retrievalId: stage === "full-report" ? v.retrieval.id : null,
  });
};
const advance = async (s, id) => {
  s = await decide(s, id, "title-abstract", "A", "advance");
  return decide(s, id, "title-abstract", "B", "advance");
};
const obtain = async (s, id, state = "obtained", reason = null) => {
  const v = view(s, id);
  return run(s, {
    kind: "retrieval.record",
    ...v.binding,
    titleBasisHash: v.title.basisHash,
    state,
    reason,
    sourceReference: null,
    supersedesId: v.retrieval?.id ?? null,
  });
};
const extraction = () => ({
  comparison: null,
  population: null,
  outcome: null,
  measure: null,
  unit: "people",
  followUp: null,
  estimate: 0,
  lower: 0,
  upper: 0,
  denominator: 0,
  sourceReference: "Synthetic table1",
  bias: null,
  limitations: "Synthetic, unverified reported values.",
});
const assertFlow = (s) => {
  const c = m.studyCounts(s);
  assert.equal(c.occurrences, c.collapsedOccurrences + c.canonicalReports);
  assert.equal(
    c.canonicalReports,
    c.titleExcluded + c.titleAdvanced + c.titlePending,
  );
  assert.equal(
    c.titleAdvanced,
    c.includedReports + c.fullExcluded + c.notRetrieved + c.fullPending,
  );
  return c;
};
await check("actual model/import modules pass strict TypeScript", async () => {
  const p = ts.createProgram(
    [
      "src/lib/client/study-register-model.ts",
      "src/lib/client/study-register-import.ts",
    ],
    {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    },
  );
  const d = ts.getPreEmitDiagnostics(p);
  assert.equal(
    d.length,
    0,
    d
      .map((e) => ts.flattenDiagnosticMessageText(e.messageText, " "))
      .join("\n"),
  );
});
await check(
  "audited synchronous projection hashing matches WebCrypto for UTF-8 and multi-block JSON",
  async () => {
    for (const value of [
      "",
      "abc",
      "量".repeat(1000),
      { z: [0, null, "text"], a: "x".repeat(128) },
      Array.from({ length: 1000 }, (_, i) => i),
    ])
      assert.equal(m.hashStudySync(value), await m.hashStudyValue(value));
  },
);
await check(
  "strict UTF-8 CSV handles BOM/quotes/newlines and rejects malformed rows without truncation",
  async () => {
    const bytes = (t) => new TextEncoder().encode(t);
    const parsed = m.parseCitationCsv(
      bytes(
        '\uFEFFtitle,abstract\r\n"A, B","Line1\nLine2 ""quoted"""\r\n\r\nC,Plain',
      ),
    );
    assert.equal(parsed.rows[0].cells[0], "A, B");
    assert.equal(parsed.rows[0].cells[1], 'Line1\nLine2 "quoted"');
    assert.equal(parsed.rows[1].row, 5);
    assert.equal(parsed.ignoredBlankLines, 1);
    for (const text of [
      'title,abstract\n"unclosed,abc',
      'title,abstract\n"closed"bad,abc',
      "title,title\na,b",
      "title,abstract\na",
      "__proto__,title\na,b",
      "title,abstract\na,b,c",
    ])
      assert.throws(() => m.parseCitationCsv(bytes(text)));
    assert.throws(
      () => m.parseCitationCsv(new Uint8Array([0x74, 0x0a, 0xff])),
      (e) => e.code === "csv_utf8",
    );
    assert.throws(
      () => m.parseCitationCsv(new Uint8Array(1048577)),
      (e) => e.code === "csv_limit",
    );
  },
);
await check(
  "import preview is nonmutating, preserves missing years/raw fields and rejects invalid mapped URLs",
  async () => {
    const s = m.blankStudyState("preview-register", at),
      raw = m.canonicalStudyJson(s);
    const input = {
      kind: "citation-csv",
      bytes: new TextEncoder().encode(
        "title,year,url,extra\nA,n.d.,https://example.invalid/a, keep me \nB,2020,http://example.invalid/b,text",
      ),
      fileName: "synthetic.csv",
      columnMap: { title: 0, year: 1, url: 2 },
      searchRunId: null,
      provenanceNote: null,
    };
    const p = await m.previewCitationImport(
      s,
      input,
      await m.studyStateHash(s),
    );
    assert.equal(p.rows[0].citation.year, null);
    assert.equal(p.rows[0].citation.originalYear, "n.d.");
    assert.equal(p.rows[0].rawCells[3], " keep me ");
    assert.ok(p.issues.length);
    await rejects(
      () =>
        run(s, {
          kind: "import.commit",
          preview: p,
          assignments: m.defaultImportAssignments(p),
          reason: "Synthetic invalid import.",
        }),
      "import_rows",
    );
    assert.equal(m.canonicalStudyJson(s), raw);
    input.columnMap = { title: 0, year: 0 };
    await rejects(
      () => m.previewCitationImport(s, input, m.hashStudySync(s)),
      "column_map",
    );
  },
);
let base = await imported(m);
await check(
  "same source/mapping/provenance reimport is idempotent while another recorded run is distinct",
  async () => {
    let s = base;
    const bytes = new TextEncoder().encode("title\nReimported");
    const input = {
      kind: "citation-csv",
      bytes,
      fileName: "one.csv",
      columnMap: { title: 0 },
      searchRunId: null,
      provenanceNote: null,
    };
    let p = await m.previewCitationImport(s, input, await m.studyStateHash(s));
    s = await run(s, {
      kind: "import.commit",
      preview: p,
      assignments: m.defaultImportAssignments(p),
      reason: "Synthetic import.",
    });
    const raw = m.canonicalStudyJson(s);
    p = await m.previewCitationImport(
      s,
      { ...input, fileName: "renamed.csv" },
      await m.studyStateHash(s),
    );
    assert.ok(p.existingBatchId);
    const next = await run(s, {
      kind: "import.commit",
      preview: p,
      assignments: m.defaultImportAssignments(p),
      reason: "Exact repeat.",
    });
    assert.equal(m.canonicalStudyJson(next), raw);
    s = await run(s, {
      kind: "search.record",
      source: "Synthetic source",
      query: null,
      searchedOn: null,
      performed: "unknown",
      provenanceNote: "Not an actual search.",
    });
    p = await m.previewCitationImport(
      s,
      { ...input, searchRunId: s.searchRuns.at(-1).id },
      await m.studyStateHash(s),
    );
    s = await run(s, {
      kind: "import.commit",
      preview: p,
      assignments: m.defaultImportAssignments(p),
      reason: "A separate explicitly recorded provenance.",
    });
    assert.equal(s.occurrences.length, 7);
  },
);
await check(
  "reviewed grouped import preserves every occurrence and safe unknown classification",
  async () => {
    let s = m.blankStudyState("grouped-register", at);
    const p = await m.previewCitationImport(
      s,
      {
        kind: "citation-csv",
        bytes: new TextEncoder().encode(
          "title,doi\nOne,10.0000/a\nOther citation,10.0000/a",
        ),
        fileName: "grouped.csv",
        columnMap: { title: 0, doi: 1 },
        searchRunId: null,
        provenanceNote: null,
      },
      await m.studyStateHash(s),
    );
    assert.ok(p.duplicateSuggestions.length);
    const assignments = p.rows.map((r) => ({
      row: r.row,
      target: {
        kind: "new",
        group: "explicit-group",
        canonicalRow: p.rows[0].row,
      },
    }));
    s = await run(s, {
      kind: "import.commit",
      preview: p,
      assignments,
      reason: "Explicit synthetic duplicate grouping.",
    });
    assert.equal(s.reports.length, 1);
    assert.equal(s.occurrences.length, 2);
    assert.equal(
      m.reportRevision(s.reports[0]).metadata.classification,
      "unknown",
    );
  },
);
let workflow = await run(base, {
  kind: "protocol.freeze",
  content: protocol,
  basedOnId: null,
});
await check(
  "merge/split preserve occurrences and exact flow, conflicts require correction",
  async () => {
    let s = workflow;
    const ids = s.reports.slice(0, 2).map((r) => r.id);
    s = await run(s, {
      kind: "duplicates.merge",
      reportIds: ids,
      targetId: ids[0],
      metadata: m.reportRevision(s.reports[0]).metadata,
      reason: "Synthetic duplicate sources reviewed.",
    });
    assert.equal(assertFlow(s).collapsedOccurrences, 1);
    assert.equal(s.reports[1].currentRevision, 2);
    assert.equal(m.reportRevision(s.reports[1]).occurrenceIds.length, 0);
    const o = m.reportRevision(s.reports[0]).occurrenceIds;
    s = await run(s, {
      kind: "duplicates.split",
      reportId: ids[0],
      reportRevision: s.reports[0].currentRevision,
      partitions: o.map((id, i) => ({
        retainOriginal: i === 0,
        occurrenceIds: [id],
        metadata: m.reportRevision(s.reports[0]).metadata,
      })),
      reason: "Undo an incorrect asserted duplicate.",
    });
    assert.equal(assertFlow(s).canonicalReports, 5);
    assert.equal(s.occurrences.length, 5);
    assert.equal(s.duplicateActions.length, 2);
    await rejects(
      () =>
        run(workflow, {
          kind: "duplicates.merge",
          reportIds: [workflow.reports[0].id, workflow.reports[2].id],
          targetId: workflow.reports[0].id,
          metadata: m.reportRevision(workflow.reports[0]).metadata,
          reason: "Cannot merge conflicting DOI.",
        }),
      "identifier_conflict",
    );
  },
);
await check(
  "two-lane disagreement stays pending until an exact reasoned resolution; superseding one lane invalidates it",
  async () => {
    let s = workflow,
      id = first(s);
    s = await decide(s, id, "title-abstract", "A", "advance");
    assert.equal(view(s, id).title.state, "pending");
    s = await decide(
      s,
      id,
      "title-abstract",
      "B",
      "exclude",
      "Synthetic ineligibility.",
    );
    assert.equal(view(s, id).title.state, "conflict");
    assert.equal(assertFlow(s).titleConflicts, 1);
    let v = view(s, id);
    s = await run(s, {
      kind: "resolution.record",
      ...v.binding,
      stage: "title-abstract",
      decisionA: v.title.decisionA.id,
      decisionB: v.title.decisionB.id,
      outcome: "advance",
      resolverLabel: "Self-recorded resolver",
      reason: "Synthetic criterion clarification.",
    });
    assert.equal(view(s, id).title.state, "advance");
    s = await decide(s, id, "title-abstract", "B", "undecided");
    assert.equal(view(s, id).title.state, "pending");
    assert.equal(s.resolutions.length, 1);
  },
);
await check(
  "retrieval/not-retrieved, final inclusion/exclusion and reported zero extraction partition correctly",
  async () => {
    let s = workflow,
      [a, b, c] = s.reports.map((r) => r.id);
    s = await advance(s, a);
    s = await obtain(s, a);
    s = await decide(s, a, "full-report", "A", "include");
    s = await decide(s, a, "full-report", "B", "include");
    let v = view(s, a);
    s = await run(s, {
      kind: "extraction.record",
      ...v.binding,
      inclusionHash: v.full.inclusionHash,
      supersedesId: null,
      values: extraction(),
    });
    assert.equal(view(s, a).extraction.estimate, 0);
    s = await advance(s, b);
    s = await obtain(
      s,
      b,
      "not-retrieved",
      "Synthetic unavailable full report.",
    );
    s = await advance(s, c);
    s = await obtain(s, c);
    s = await decide(
      s,
      c,
      "full-report",
      "A",
      "exclude",
      "Wrong synthetic setting.",
    );
    s = await decide(
      s,
      c,
      "full-report",
      "B",
      "exclude",
      "Wrong synthetic setting.",
    );
    const counts = assertFlow(s);
    assert.equal(counts.includedReports, 1);
    assert.equal(counts.fullExcluded, 1);
    assert.equal(counts.notRetrieved, 1);
    assert.equal(counts.includedWithExtraction, 1);
    workflow = s;
  },
);
await check(
  "new retrieval, title basis, protocol and metadata revisions cannot resurrect old inclusion/extraction",
  async () => {
    let s = workflow,
      id = first(s);
    s = await obtain(s, id);
    assert.equal(view(s, id).full.state, "pending");
    assert.equal(view(s, id).full.decisionA, null);
    s = await decide(s, id, "full-report", "A", "include");
    s = await decide(s, id, "full-report", "B", "include");
    assert.equal(view(s, id).extraction, null);
    let v = view(s, id);
    s = await run(s, {
      kind: "extraction.record",
      ...v.binding,
      inclusionHash: v.full.inclusionHash,
      supersedesId: null,
      values: { ...extraction(), estimate: null, lower: null, upper: null },
    });
    assert.equal(view(s, id).extraction.estimate, null);
    s = await decide(s, id, "title-abstract", "A", "advance");
    assert.equal(view(s, id).retrieval, null);
    assert.equal(view(s, id).full.state, "pending");
    s = await run(s, {
      kind: "report.correct",
      reportId: id,
      reportRevision: view(s, id).revision.revision,
      metadata: {
        ...view(s, id).metadata,
        summary: "A deliberate metadata correction.",
      },
      reason: "Synthetic correction.",
    });
    assert.equal(view(s, id).title.state, "pending");
    s = await run(s, {
      kind: "protocol.freeze",
      content: { ...protocol, question: "A changed synthetic question." },
      basedOnId: s.selectedProtocolId,
    });
    assert.equal(assertFlow(s).titlePending, 5);
    assert.ok(s.decisions.length > 0);
  },
);
await check(
  "stage/reason/binding/interval errors reject atomically and preserve prior state",
  async () => {
    const s = workflow,
      id = first(s),
      v = view(s, id),
      raw = m.canonicalStudyJson(s);
    await rejects(
      () =>
        run(s, {
          kind: "decision.record",
          ...v.binding,
          stage: "title-abstract",
          lane: "A",
          laneLabel: "A",
          outcome: "include",
          reasonCode: null,
          reason: null,
          retrievalId: null,
          supersedesId: v.title.decisionA.id,
        }),
      "choice",
    );
    await rejects(
      () =>
        run(s, {
          kind: "extraction.record",
          ...v.binding,
          inclusionHash: v.full.inclusionHash,
          supersedesId: v.extraction.id,
          values: { ...extraction(), lower: 1, upper: 2 },
        }),
      "interval",
    );
    assert.equal(m.canonicalStudyJson(s), raw);
  },
);
await check(
  "immutable prepared candidates protect inputs and reject async state/command mutation",
  async () => {
    const s = structuredClone(workflow),
      cmd = {
        kind: "search.record",
        source: "Before",
        query: null,
        searchedOn: null,
        performed: "unknown",
        provenanceNote: null,
      };
    const hash = await m.studyStateHash(s);
    let release;
    const gate = new Promise((r) => (release = r));
    let entered;
    const seen = new Promise((r) => (entered = r));
    const pending = m.prepareStudyCommand(s, cmd, {
      expectedStateHash: hash,
      at,
      makeId: () => "async-search",
      digest: async (bytes) => {
        entered();
        await gate;
        return Array.from(
          new Uint8Array(
            await crypto.subtle.digest("SHA-256", bytes.slice().buffer),
          ),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
      },
    });
    await seen;
    cmd.source = "After";
    s.draft.tab = "exports";
    release();
    await rejects(() => pending, "input_changed");
    const prepared = await m.prepareStudyCommand(
      workflow,
      { kind: "draft.replace", draft: { ...workflow.draft, tab: "exports" } },
      {
        expectedStateHash: await m.studyStateHash(workflow),
        at,
        makeId: () => "unused",
      },
    );
    assert.equal(Object.isFrozen(prepared.nextState), true);
    assert.throws(() => {
      prepared.nextState.draft.tab = "browse";
    }, TypeError);
  },
);
await check(
  "lossless backup retains raw fields/history/draft while CSV neutralizes formula text and memo avoids independent-review claims",
  async () => {
    let s = workflow,
      id = first(s);
    s = await run(s, {
      kind: "report.correct",
      reportId: id,
      reportRevision: view(s, id).revision.revision,
      metadata: {
        ...view(s, id).metadata,
        title: '=HYPERLINK("https://example.invalid")',
      },
      reason: "Synthetic spreadsheet injection test.",
    });
    s = await run(s, {
      kind: "draft.replace",
      draft: {
        tab: "reports",
        selectedReportId: id,
        form: {
          kind: "metadata",
          targetId: id,
          fields: { title: "Unsaved raw title" },
        },
        dirty: true,
      },
    });
    const json = await m.makeStudyBackup(s, at),
      round = await m.parseStudyBackup(json);
    assert.equal(m.canonicalStudyJson(round), m.canonicalStudyJson(s));
    assert.match(m.studyCsvExports(s).reports, /"'=HYPERLINK/);
    assert.match(m.studyMarkdownMemo(s), /not verified identities/);
    assert.equal(round.draft.form.fields.title, "Unsaved raw title");
    const bad = JSON.parse(json);
    bad.workspace.reports[0].revisions[0].metadata.title = "Changed";
    await rejects(
      () => m.parseStudyBackup(JSON.stringify(bad)),
      "backup_checksum",
    );
  },
);
await check(
  "compact packet descriptors do not recursively embed state; old packets require original complete download",
  async () => {
    let s = await run(workflow, { kind: "packet.record" });
    const descriptor = s.packets.at(-1),
      packet = await m.makeStudyPacket(s, descriptor.id, at);
    assert.equal(
      m.canonicalStudyJson(await m.parseStudyBackup(packet.json)),
      m.canonicalStudyJson(s),
    );
    assert.equal(Object.hasOwn(descriptor, "workspace"), false);
    const again = await run(s, { kind: "packet.record" });
    assert.equal(again.packets.length, 1);
    s = await run(s, {
      kind: "search.record",
      source: "A new synthetic provenance",
      query: null,
      searchedOn: null,
      performed: "unknown",
      provenanceNote: null,
    });
    await rejects(
      () => m.makeStudyPacket(s, descriptor.id, at),
      "packet_changed",
    );
  },
);
await check(
  "unknown fields, broken graph/hash and malformed old supersession fail closed",
  async () => {
    const cases = [
      (s) => (s.injected = true),
      (s) => (s.protocols[0].content.question = "Tampered"),
      (s) => (s.occurrences[0].reportId = "missing"),
      (s) => (s.reports[0].revisions[0].hash = "f".repeat(64)),
      (s) => (s.decisions[0].supersedesId = "missing"),
    ];
    for (const change of cases) {
      const s = structuredClone(workflow);
      change(s);
      await rejects(() => m.validateStudyState(s));
    }
  },
);
await check(
  "exact2MiB future pretty backup round-trips; one-byte oversize is rejected without input mutation",
  async () => {
    const exact = await exactBoundaryState(m);
    assert.equal(m.studyBackupBytes(exact), 2097152);
    const json = await m.makeStudyBackup(exact, at);
    assert.equal(new TextEncoder().encode(json).length, 2097152);
    assert.equal(
      m.canonicalStudyJson(await m.parseStudyBackup(json)),
      m.canonicalStudyJson(exact),
    );
    const larger = structuredClone(exact);
    larger.draft.form.fields.title += "x";
    const before = m.canonicalStudyJson(larger);
    await rejects(() => m.validateStudyState(larger), "backup_limit");
    assert.equal(m.canonicalStudyJson(larger), before);
  },
);

await check(
  "controlled catalog import stays a bibliography occurrence with exact backlinks and declared unknowns",
  async () => {
    const entries = [
      {
        entryId: "public-entry",
        title: "Synthetic public source",
        authors: null,
        year: null,
        originalYear: "n.d.",
        doi: null,
        pmid: null,
        url: "https://example.invalid/public",
        abstract: null,
        publisher: "Synthetic publisher",
        backlinks: [
          { title: "Synthetic citing page", href: "/record/evidence-library/" },
        ],
      },
    ];
    let s = m.blankStudyState("catalog-register", at);
    const p = await m.previewCitationImport(
      s,
      {
        kind: "site-bibliography",
        entries,
        catalogHash: await m.hashStudyValue(entries),
        provenanceNote: null,
      },
      await m.studyStateHash(s),
    );
    s = await run(s, {
      kind: "import.commit",
      preview: p,
      assignments: m.defaultImportAssignments(p),
      reason: "Select this public bibliography source.",
    });
    assert.equal(s.imports[0].searchRunId, null);
    assert.equal(s.imports[0].kind, "site-bibliography");
    assert.equal(s.occurrences[0].imported.year, null);
    assert.equal(
      s.occurrences[0].backlinks[0].href,
      "/record/evidence-library/",
    );
    assert.equal(
      (await m.parseStudyBackup(await m.makeStudyBackup(s, at))).occurrences
        .length,
      1,
    );
  },
);
await check(
  "duplicate declines and relevant saved draft clearing retain a reasoned local trail",
  async () => {
    let s = workflow;
    const suggestion = m.duplicateSuggestions(s)[0];
    assert.ok(suggestion);
    s = await run(s, {
      kind: "draft.replace",
      draft: {
        tab: "reports",
        selectedReportId: null,
        form: {
          kind: "merge",
          targetId: null,
          fields: {
            reportIds: JSON.stringify(suggestion.reportIds),
            targetId: "",
            metadata: "{}",
            reason: "Keep separate.",
          },
        },
        dirty: true,
      },
    });
    s = await run(s, {
      kind: "duplicates.decline",
      suggestionHash: suggestion.hash,
      reportIds: suggestion.reportIds,
      reason: "Synthetic evidence suggests separate articles.",
    });
    assert.equal(s.draft.form, null);
    assert.equal(s.duplicateActions.at(-1).kind, "decline");
    assert.equal(
      m.duplicateSuggestions(s).some((x) => x.hash === suggestion.hash),
      false,
    );
  },
);
await check(
  "historical bases, raw citation lineage and duplicate mapping cannot be rebound silently",
  async () => {
    const wrong = structuredClone(workflow);
    wrong.retrievals[0].titleBasisHash = view(
      workflow,
      workflow.reports[1].id,
    ).title.basisHash;
    await rejects(() => m.validateStudyState(wrong), "title_basis");
    const raw = structuredClone(workflow);
    raw.occurrences[0].imported.title = "A changed original citation";
    await rejects(() => m.validateStudyState(raw), "source_row");
    const pair = workflow.reports.slice(0, 2).map((r) => r.id);
    let merged = await run(workflow, {
      kind: "duplicates.merge",
      reportIds: pair,
      targetId: pair[0],
      metadata: view(workflow, pair[0]).metadata,
      reason: "Synthetic mapping proof.",
    });
    merged = structuredClone(merged);
    merged.duplicateActions.at(-1).moves[0].from = pair[0];
    await rejects(() => m.validateStudyState(merged), "duplicate_history");
  },
);
await check(
  "late mutable CSV bytes and no-op command inputs cannot pass asynchronous guards",
  async () => {
    const real = globalThis.crypto,
      descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    let release, enter;
    const gate = new Promise((r) => (release = r)),
      entered = new Promise((r) => (enter = r));
    let firstCall = true;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        subtle: {
          digest: async (...args) => {
            if (firstCall) {
              firstCall = false;
              enter();
              await gate;
            }
            return real.subtle.digest(...args);
          },
        },
      },
    });
    try {
      const s = m.blankStudyState("mutable-import", at),
        input = {
          kind: "citation-csv",
          bytes: new TextEncoder().encode("title\nSynthetic"),
          fileName: "mutable.csv",
          columnMap: { title: 0 },
          searchRunId: null,
          provenanceNote: null,
        };
      const pending = m.previewCitationImport(s, input, m.hashStudySync(s));
      await entered;
      input.bytes[0] = 84;
      release();
      await rejects(() => pending, "input_changed");
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
      else delete globalThis.crypto;
    }
    let calls = 0,
      unblock,
      arrived;
    const wait = new Promise((r) => (unblock = r)),
      seen = new Promise((r) => (arrived = r));
    const cmd = {
      kind: "protocol.select",
      protocolId: workflow.selectedProtocolId,
    };
    const pending = m.prepareStudyCommand(workflow, cmd, {
      expectedStateHash: await m.studyStateHash(workflow),
      at,
      makeId: () => "unused",
      digest: async (bytes) => {
        if (++calls === 2) {
          arrived();
          await wait;
        }
        return Array.from(
          new Uint8Array(
            await real.subtle.digest("SHA-256", bytes.slice().buffer),
          ),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
      },
    });
    await seen;
    cmd.protocolId = "changed-after-hash";
    unblock();
    await rejects(() => pending, "input_changed");
  },
);
await check(
  "protocol and recorded-search capacity rejects the next operation without rewriting prior work",
  async () => {
    let s = base;
    for (let i = 0; i < 20; i++)
      s = await run(s, {
        kind: "protocol.freeze",
        content: { ...protocol, question: "Synthetic question " + i },
        basedOnId: s.selectedProtocolId,
      });
    const before = m.canonicalStudyJson(s);
    await rejects(
      () =>
        run(s, {
          kind: "protocol.freeze",
          content: { ...protocol, question: "Twenty-first version" },
          basedOnId: s.selectedProtocolId,
        }),
      "limit",
    );
    assert.equal(m.canonicalStudyJson(s), before);
    for (let i = 0; i < 20; i++)
      s = await run(s, {
        kind: "search.record",
        source: "Synthetic source " + i,
        query: null,
        searchedOn: null,
        performed: "unknown",
        provenanceNote: null,
      });
    await rejects(
      () =>
        run(s, {
          kind: "search.record",
          source: "Over capacity",
          query: null,
          searchedOn: null,
          performed: "unknown",
          provenanceNote: null,
        }),
      "limit",
    );
  },
);
await check(
  "retained duplicate revision history requires distinct numeric source revisions",
  async () => {
    const ids = workflow.reports.slice(0, 2).map((r) => r.id);
    let s = await run(workflow, {
      kind: "duplicates.merge",
      reportIds: ids,
      targetId: ids[0],
      metadata: m.reportRevision(workflow.reports[0]).metadata,
      reason: "Synthetic duplicate history validation.",
    });
    s = await run(s, {
      kind: "duplicates.split",
      reportId: ids[0],
      reportRevision: s.reports[0].currentRevision,
      partitions: m.reportRevision(s.reports[0]).occurrenceIds.map((id, i) => ({
        retainOriginal: i === 0,
        occurrenceIds: [id],
        metadata: m.reportRevision(s.reports[0]).metadata,
      })),
      reason: "Synthetic split retains a new report revision.",
    });
    for (const after of ["1", 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const invalid = structuredClone(s);
      invalid.duplicateActions
        .at(-1)
        .revisions.find((v) => v.before === null).after = after;
      await rejects(() => m.validateStudyState(invalid), "integer");
    }
    const invalidBefore = structuredClone(s);
    invalidBefore.duplicateActions[0].revisions[0].before = "1";
    await rejects(() => m.validateStudyState(invalidBefore), "integer");
    const duplicate = structuredClone(s);
    duplicate.duplicateActions
      .at(-1)
      .revisions.push(
        structuredClone(duplicate.duplicateActions.at(-1).revisions[0]),
      );
    await rejects(() => m.validateStudyState(duplicate), "duplicate_history");
    assert.equal(
      (await m.validateStudyState(s)).occurrences.length,
      s.occurrences.length,
    );
  },
);
await check(
  "oversized CSV input is rejected before byte iteration, hashing or command cloning",
  async () => {
    class OversizedBytes extends Uint8Array {
      *[Symbol.iterator]() {
        throw Error("Oversized bytes must not be iterated.");
      }
    }
    const input = {
      kind: "citation-csv",
      bytes: new OversizedBytes(m.STUDY_LIMITS.csvBytes + 1),
      fileName: "too-large.csv",
      columnMap: { title: 0 },
      searchRunId: null,
      provenanceNote: null,
    };
    const hash = await m.studyStateHash(base);
    await rejects(
      () => m.previewCitationImport(base, input, hash),
      "csv_limit",
    );
    const preview = await m.previewCitationImport(
      base,
      {
        ...input,
        bytes: new TextEncoder().encode("title\nSynthetic source"),
      },
      hash,
    );
    await rejects(
      () =>
        m.prepareStudyCommand(
          base,
          {
            kind: "import.commit",
            preview: { ...preview, input },
            assignments: m.defaultImportAssignments(preview),
            reason: "Cannot commit an oversized replacement input.",
          },
          { expectedStateHash: hash, at, makeId: () => "unused-id" },
        ),
      "csv_limit",
    );
  },
);
console.log(
  `Study register: ${checks} actual-module check groups passed. Synthetic local workflow only; no real searches or independent reviews.`,
);
