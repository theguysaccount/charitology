import assert from "node:assert/strict";
import { build } from "esbuild";
import ts from "typescript";
import {
  at,
  context,
  command,
  protocolContent,
  withProject,
  workflow,
  manifestContent,
  resultContent,
  comparisonContent,
  estimate,
  legacyExport,
  legacyInput,
  exactBoundaryState,
} from "../test-fixtures/artifact-results/factory.mjs";
const built = await build({
  stdin: {
    contents:
      "export * from './src/lib/client/artifact-results-model.ts'; export * from './src/lib/client/artifact-results-import.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const m = await import(
  "data:text/javascript;base64," +
    Buffer.from(built.outputFiles[0].text).toString("base64")
);
let groups = 0;
const check = async (label, fn) => {
  await fn();
  groups++;
  console.log("✓ " + label);
};
const reject = (fn, code) =>
  assert.rejects(
    async () => fn(),
    (e) => e instanceof m.ArtifactError && (!code || e.code === code),
  );
const run = (s, c) => command(m, s, c),
  view = (s) => m.artifactProjectView(s, s.projects[0].id);
const freeze = (s, content, reason = "Synthetic current amendment.") => {
  const v = view(s);
  return run(s, {
    kind: "protocol.freeze",
    projectId: v.project.id,
    expectedProtocolId: v.currentProtocol.id,
    expectedProtocolHash: v.currentProtocol.hash,
    content,
    amendmentReason: reason,
  });
};
const importRows = async (s, input, assign) => {
  const p = await m.previewProtocolImport(
    s,
    input,
    await m.artifactStateHash(s),
  );
  return run(s, {
    kind: "protocol.import",
    preview: p,
    assignments:
      assign ??
      p.rows.map((r) => ({ recordId: r.recordId, target: { kind: "new" } })),
  });
};
const rawInput = (data, name = "synthetic.json") => ({
  kind: "legacy-research-json",
  bytes: new TextEncoder().encode(JSON.stringify(data)),
  fileName: name,
  program: data.program,
  selectedRecordIds: [data.records[0].id],
});
const base = m.blankArtifactState("synthetic-register", at);
await check("actual model/import/adapters pass strict TypeScript", () => {
  const program = ts.createProgram(
    [
      "src/lib/client/artifact-results-model.ts",
      "src/lib/client/artifact-results-import.ts",
    ],
    {
      noEmit: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ["lib.es2023.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
      skipLibCheck: true,
    },
  );
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(
    diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")),
    [],
  );
});
await check(
  "audited canonical hashes match WebCrypto for UTF8 and multiblock JSON",
  async () => {
    for (const value of [
      null,
      "abc",
      "新しい測定 🧭",
      "x".repeat(20000),
      { b: 0, a: [null, false, "x\n"] },
    ])
      assert.equal(m.hashArtifactSync(value), await m.hashArtifactValue(value));
    assert.throws(() => m.canonicalArtifactJson({ x: Infinity }));
    assert.throws(() =>
      m.canonicalArtifactJson(JSON.parse('{"__proto__":{}}')),
    );
  },
);
await check(
  "native initial/current-identical/ancestor-return freezes retain legitimate version lineage",
  async () => {
    let s = await withProject(m),
      v = view(s),
      original = v.currentProtocol.content;
    const noop = await freeze(s, original);
    assert.equal(m.canonicalArtifactJson(noop), m.canonicalArtifactJson(s));
    s = await freeze(s, {
      ...original,
      values: { ...original.values, analysis: "Changed synthetic analysis." },
    });
    const changed = view(s).currentProtocol;
    s = await freeze(s, original, "Explicit return to original assumptions.");
    v = view(s);
    assert.equal(v.currentProtocol.version, 3);
    assert.equal(v.currentProtocol.contentHash, m.hashArtifactSync(original));
    assert.notEqual(v.currentProtocol.id, s.protocols[0].id);
    assert.equal(v.currentProtocol.previousId, changed.id);
    assert.equal(v.currentManifest, null);
  },
);
await check(
  "project view is detached and never freezes mutable caller input",
  async () => {
    const s = structuredClone(await withProject(m)),
      v = view(s);
    assert.ok(Object.isFrozen(v));
    assert.equal(Object.isFrozen(s), false);
    assert.equal(Object.isFrozen(s.projects[0]), false);
    const before = m.canonicalArtifactJson(s);
    view(s);
    assert.equal(m.canonicalArtifactJson(s), before);
  },
);
await check(
  "complete synthetic artifact→zero result→descriptive comparison works without an effect verdict",
  async () => {
    const s = await workflow(m),
      v = view(s);
    assert.equal(
      m.artifactDifference(v.latestResult, v.latestComparison.content).value,
      0,
    );
    assert.equal(v.latestResult.content.reported.estimate, 0);
    assert.equal(v.latestResult.content.reported.denominator, 0);
    assert.equal(v.latestResult.content.observedOn, null);
    assert.equal("rating" in v, false);
    assert.equal(v.counts.results, 1);
  },
);
await check(
  "old protocol/manifest/result forms cannot retarget changed current bindings",
  async () => {
    let s = await workflow(m),
      old = view(s);
    s = await freeze(s, {
      ...old.currentProtocol.content,
      values: {
        ...old.currentProtocol.content.values,
        analysis: "A source amendment.",
      },
    });
    const before = m.canonicalArtifactJson(s);
    await reject(
      () =>
        run(s, {
          kind: "manifest.freeze",
          projectId: old.project.id,
          protocolId: old.currentProtocol.id,
          protocolHash: old.currentProtocol.hash,
          previousId: old.currentManifest.id,
          content: manifestContent(),
        }),
      "stale_binding",
    );
    await reject(
      () =>
        run(s, {
          kind: "comparison.record",
          resultId: old.latestResult.id,
          resultHash: old.latestResult.hash,
          supersedesId: old.latestComparison.id,
          content: comparisonContent(),
        }),
      "stale_result",
    );
    assert.equal(m.canonicalArtifactJson(s), before);
    assert.equal(view(s).latestResult, null);
    assert.equal(s.results.length, 1);
  },
);
await check(
  "fresh manifest makes earlier results historical and requires a fresh bound result chain",
  async () => {
    let s = await workflow(m),
      v = view(s);
    s = await run(s, {
      kind: "manifest.freeze",
      projectId: v.project.id,
      protocolId: v.currentProtocol.id,
      protocolHash: v.currentProtocol.hash,
      previousId: v.currentManifest.id,
      content: { ...manifestContent(), deviations: "A new output manifest." },
    });
    assert.equal(view(s).latestResult, null);
    await reject(
      () =>
        run(s, {
          kind: "result.record",
          projectId: v.project.id,
          protocolId: v.currentProtocol.id,
          protocolHash: v.currentProtocol.hash,
          manifestId: v.currentManifest.id,
          manifestHash: v.currentManifest.hash,
          supersedesId: v.latestResult.id,
          content: resultContent(),
        }),
      "stale_manifest",
    );
    assert.equal(s.results.length, 1);
  },
);
await check(
  "source qualification distinguishes the original claim from a later result source",
  async () => {
    let s = await withProject(m),
      v = view(s);
    s = await run(s, {
      kind: "manifest.freeze",
      projectId: v.project.id,
      protocolId: v.currentProtocol.id,
      protocolHash: v.currentProtocol.hash,
      previousId: null,
      content: manifestContent(),
    });
    v = view(s);
    const cmd = (content) => ({
      kind: "result.record",
      projectId: v.project.id,
      protocolId: v.currentProtocol.id,
      protocolHash: v.currentProtocol.hash,
      manifestId: v.currentManifest.id,
      manifestHash: v.currentManifest.hash,
      supersedesId: null,
      content,
    });
    const bad = {
      ...resultContent(),
      reported: { ...estimate(), source: null },
      sourceReferences: [],
    };
    await reject(() => run(s, cmd(bad)), "result_source");
    const a = await run(
      s,
      cmd({
        ...bad,
        sourceReferences: [
          { url: "https://example.invalid/later", locator: "Reported result" },
        ],
      }),
    );
    assert.equal(a.results.length, 1);
    const b = await run(s, cmd(resultContent()));
    assert.equal(b.results.length, 1);
  },
);
await check(
  "unknown/zero/null-finding/not-observed and uncertainty stay distinct",
  async () => {
    let s = await workflow(m),
      v = view(s);
    const content = {
      ...resultContent(),
      kind: "not-observed",
      reported: null,
      summary: "Data were unavailable; no result was observed.",
    };
    s = await run(s, {
      kind: "result.record",
      projectId: v.project.id,
      protocolId: v.currentProtocol.id,
      protocolHash: v.currentProtocol.hash,
      manifestId: v.currentManifest.id,
      manifestHash: v.currentManifest.hash,
      supersedesId: v.latestResult.id,
      content,
    });
    assert.equal(view(s).latestResult.content.reported, null);
    assert.equal(s.results[0].content.reported.estimate, 0);
    const invalid = structuredClone(s);
    invalid.results.at(-1).content.reported = estimate(0);
    invalid.results.at(-1).hash = m.hashArtifactSync(
      (({ hash, ...row }) => row)(invalid.results.at(-1)),
    );
    await reject(() => m.validateArtifactState(invalid), "not_observed");
  },
);
await check(
  "incompatible dimensions, numeric overflow and bad intervals reject without pooling",
  async () => {
    const s = await workflow(m),
      r = view(s).latestResult,
      c = comparisonContent();
    assert.equal(
      m.artifactDifference(
        {
          ...r,
          content: {
            ...r.content,
            reported: { ...r.content.reported, unit: "other unit" },
          },
        },
        c,
      ).value,
      null,
    );
    assert.equal(
      m.artifactDifference(
        {
          ...r,
          content: {
            ...r.content,
            original: estimate(-Number.MAX_VALUE),
            reported: estimate(Number.MAX_VALUE),
          },
        },
        c,
      ).value,
      null,
    );
    const invalid = structuredClone(s);
    invalid.results[0].content.reported.lower = 1;
    await reject(() => m.validateArtifactState(invalid), "interval");
  },
);
await check(
  "file-only bridge preserves source metadata while excluding unfinished raw drafts",
  async () => {
    const input = legacyInput(m),
      parsed = m.readLegacyResearchExport(input.bytes, input.program);
    assert.ok(parsed.export.draft.title);
    const p = await m.previewProtocolImport(
      base,
      input,
      await m.artifactStateHash(base),
    );
    assert.equal(p.ignoredDraft, true);
    const s = await importRows(base, input);
    assert.equal(
      s.protocols[0].content.values.title,
      parsed.export.records[0].values.title,
    );
    assert.equal(s.protocols[0].content.resultsKnown, "unknown");
    assert.equal(s.protocols[0].content.registration, null);
    assert.equal(s.protocols[0].origin.recordId, "legacy-record");
    assert.equal(s.protocols.length, 1);
  },
);
await check(
  "renaming/reserializing/unselected draft or timestamp changes cannot duplicate import identity",
  async () => {
    const data = legacyExport(m),
      input = rawInput(data);
    let s = await importRows(base, input);
    const initial = m.canonicalArtifactJson(s);
    data.draft.title = "Changed unfinished text";
    data.records[0].updatedAt = "2026-10-27T08:00:00.000Z";
    const again = rawInput(data, "renamed.json");
    s = await importRows(s, again);
    assert.equal(m.canonicalArtifactJson(s), initial);
    const current = view(s).currentProtocol;
    s = await freeze(s, {
      ...current.content,
      values: {
        ...current.content.values,
        analysis: "Later native amendment.",
      },
    });
    const newer = m.canonicalArtifactJson(s);
    s = await importRows(s, input);
    assert.equal(m.canonicalArtifactJson(s), newer);
    assert.equal(view(s).currentProtocol.version, 2);
  },
);
await check(
  "changed same-source records require an exact current amendment target and reason",
  async () => {
    const data = legacyExport(m);
    let s = await importRows(base, rawInput(data));
    data.records[0].values.analysis = "Changed saved source analysis";
    const input = rawInput(data);
    await reject(() => importRows(s, input), "amendment_required");
    const v = view(s);
    s = await importRows(s, input, [
      {
        recordId: data.records[0].id,
        target: {
          kind: "amend",
          projectId: v.project.id,
          expectedProtocolId: v.currentProtocol.id,
          expectedProtocolHash: v.currentProtocol.hash,
          reason: "Review changed source snapshot.",
        },
      },
    ]);
    assert.equal(s.projects.length, 1);
    assert.equal(s.protocols.length, 2);
    assert.equal(view(s).currentProtocol.previousId, v.currentProtocol.id);
  },
);
await check(
  "malformed legacy input, unknown fields, duplicate IDs and bad dates fail atomically",
  async () => {
    for (const mutate of [
      (d) => (d.extra = true),
      (d) => d.records.push(structuredClone(d.records[0])),
      (d) => (d.records[0].values.extra = "x"),
      (d) => (d.records[0].createdAt = "2026-02-30T00:00:00.000Z"),
      (d) => (d.records[0].values.analysis = null),
    ]) {
      const d = legacyExport(m);
      mutate(d);
      await reject(() =>
        m.previewProtocolImport(base, rawInput(d), m.hashArtifactSync(base)),
      );
    }
    const input = legacyInput(m);
    await reject(
      () =>
        m.previewProtocolImport(
          base,
          { ...input, bytes: new Uint8Array([0xff]) },
          m.hashArtifactSync(base),
        ),
      "legacy_json",
    );
  },
);
await check(
  "legacy IDs/offset timestamps retain source representation without new-ID coercion",
  async () => {
    const d = legacyExport(m, "replication-program", "旧い record");
    d.editing = d.records[0].id;
    d.records[0].createdAt = "2026-10-27T08:00:00+01:00";
    const s = await importRows(base, rawInput(d));
    assert.equal(s.protocols[0].origin.recordId, "旧い record");
    assert.equal(s.protocols[0].origin.createdAt, d.records[0].createdAt);
    assert.equal(s.protocols[0].origin.createdAtUtc, at);
  },
);
await check(
  "selected bytes are copied and preview mutation cannot alter reviewed input",
  async () => {
    const input = legacyInput(m),
      p = await m.previewProtocolImport(
        base,
        input,
        await m.artifactStateHash(base),
      );
    assert.notEqual(p.input.bytes, input.bytes);
    assert.equal(Object.isFrozen(p.input), true);
    assert.equal(Object.isFrozen(p.input.bytes), false);
    p.input.bytes[0] ^= 1;
    await reject(() =>
      run(base, {
        kind: "protocol.import",
        preview: p,
        assignments: [{ recordId: "legacy-record", target: { kind: "new" } }],
      }),
    );
    assert.equal(base.protocols.length, 0);
  },
);
await check(
  "selected local checksum matches actual bytes and enforces prehash bounds",
  async () => {
    const bytes = new TextEncoder().encode("abc"),
      c = await m.hashSelectedArtifact(bytes, at);
    assert.equal(
      c.sha256,
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    assert.equal(c.byteLength, 3);
    assert.equal(c.kind, "local-bytes");
    await reject(
      () =>
        m.hashSelectedArtifact(
          new Uint8Array(m.ARTIFACT_LIMITS.localFileBytes + 1),
          at,
        ),
      "local_file_limit",
    );
    await reject(
      () =>
        m.previewProtocolImport(
          base,
          {
            ...legacyInput(m),
            bytes: new Uint8Array(m.ARTIFACT_LIMITS.legacyBytes + 1),
          },
          m.hashArtifactSync(base),
        ),
      "legacy_limit",
    );
  },
);
await check(
  "unknown adapter definitions, graph references and edited historical hashes fail closed",
  async () => {
    const s = await workflow(m);
    for (const change of [
      (x) => (x.adapters[0].fields[0].label = "Changed adapter"),
      (x) => (x.results[0].manifestHash = "0".repeat(64)),
      (x) => (x.protocols[0].content.values.claim = "Rewritten history"),
      (x) => (x.projects[0].currentProtocolId = "missing"),
      (x) => (x.manifests[0].version = "1"),
    ]) {
      const x = structuredClone(s);
      change(x);
      await reject(() => m.validateArtifactState(x));
    }
  },
);
await check(
  "JSON backup is lossless while CSV neutralizes formulas and Markdown escapes markup",
  async () => {
    let s = await withProject(m);
    s = await freeze(s, {
      ...view(s).currentProtocol.content,
      values: {
        ...view(s).currentProtocol.content.values,
        title: "=FORMULA <script>evil</script>",
      },
    });
    const restored = await m.parseArtifactBackup(
      await m.makeArtifactBackup(s, at),
    );
    assert.equal(m.canonicalArtifactJson(s), m.canonicalArtifactJson(restored));
    const mc = manifestContent();
    mc.artifacts[0].title = "\t=FORMULA";
    let v = view(s);
    s = await run(s, {
      kind: "manifest.freeze",
      projectId: v.project.id,
      protocolId: v.currentProtocol.id,
      protocolHash: v.currentProtocol.hash,
      previousId: null,
      content: mc,
    });
    const out = m.artifactCsvExports(s, [v.project.id]);
    assert.ok(out.artifacts.includes("'\t=FORMULA"));
    assert.ok(
      !m.artifactMarkdownPacket(s, [v.project.id]).includes("<script>"),
    );
    const payload = JSON.parse(await m.makeArtifactBackup(s, at));
    payload.exportedAt = "2026-10-27T08:00:00.000Z";
    await reject(
      () => m.parseArtifactBackup(JSON.stringify(payload)),
      "backup_checksum",
    );
  },
);
await check(
  "escaped valid artifact/source objects survive raw draft save and full restore above8000chars",
  async () => {
    let s = await workflow(m);
    const refs = Array.from({ length: 4 }, () => ({
      url: "https://example.invalid/" + '"'.repeat(1170),
      locator: '"\n'.repeat(250),
    }));
    const content = { ...resultContent(), sourceReferences: refs };
    let v = view(s);
    s = await run(s, {
      kind: "result.record",
      projectId: v.project.id,
      protocolId: v.currentProtocol.id,
      protocolHash: v.currentProtocol.hash,
      manifestId: v.currentManifest.id,
      manifestHash: v.currentManifest.hash,
      supersedesId: v.latestResult.id,
      content,
    });
    const raw = JSON.stringify(refs);
    assert.ok(
      raw.length > 8000 && raw.length <= m.ARTIFACT_LIMITS.draftFieldChars,
    );
    s = await run(s, {
      kind: "draft.replace",
      draft: {
        tab: "results",
        selectedProjectId: v.project.id,
        form: {
          kind: "result",
          targetId: v.project.id,
          fields: { sourceReferences: raw },
        },
        dirty: true,
      },
    });
    let restored = await m.parseArtifactBackup(
      await m.makeArtifactBackup(s, at),
    );
    assert.equal(restored.draft.form.fields.sourceReferences, raw);
    const a = {
      ...manifestContent().artifacts[0],
      title: '"'.repeat(500),
      fileName: '"'.repeat(200),
      url: "https://example.invalid/" + '"'.repeat(1170),
      license: '"'.repeat(200),
      note: '"\n'.repeat(1000),
    };
    v = view(s);
    s = await run(s, {
      kind: "manifest.freeze",
      projectId: v.project.id,
      protocolId: v.currentProtocol.id,
      protocolHash: v.currentProtocol.hash,
      previousId: v.currentManifest.id,
      content: { ...manifestContent(), artifacts: [a] },
    });
    const artifactRaw = JSON.stringify(a);
    assert.ok(
      artifactRaw.length > 8000 &&
        artifactRaw.length <= m.ARTIFACT_LIMITS.draftFieldChars,
    );
    s = await run(s, {
      kind: "draft.replace",
      draft: {
        tab: "artifacts",
        selectedProjectId: v.project.id,
        form: {
          kind: "manifest",
          targetId: v.project.id,
          fields: { artifact0: artifactRaw },
        },
        dirty: true,
      },
    });
    restored = await m.parseArtifactBackup(await m.makeArtifactBackup(s, at));
    assert.equal(restored.draft.form.fields.artifact0, artifactRaw);
  },
);
await check(
  "packet selection order is stable; wholeJSON includes unselected work and selectedhash does not",
  async () => {
    let s = await workflow(m);
    s = await run(s, {
      kind: "protocol.freeze",
      projectId: null,
      expectedProtocolId: null,
      expectedProtocolHash: null,
      content: protocolContent(m, "methods-lab"),
      amendmentReason: "Second synthetic project.",
    });
    const ids = s.projects.map((p) => p.id);
    assert.equal(
      await m.artifactInputHash(s, ids),
      await m.artifactInputHash(s, [...ids].reverse()),
    );
    s = await run(s, { kind: "packet.record", projectIds: [ids[0]] });
    const p = s.packets.at(-1),
      packet = await m.makeArtifactPacket(s, p.id, at);
    assert.equal((await m.parseArtifactBackup(packet.json)).projects.length, 2);
    assert.ok(!packet.csv.protocols.includes(ids[1]));
    const v = m.artifactProjectView(s, ids[1]);
    s = await run(s, {
      kind: "protocol.freeze",
      projectId: v.project.id,
      expectedProtocolId: v.currentProtocol.id,
      expectedProtocolHash: v.currentProtocol.hash,
      content: {
        ...v.currentProtocol.content,
        values: {
          ...v.currentProtocol.content.values,
          assumptions: "Changed unselected project.",
        },
      },
      amendmentReason: "Unselected synthetic change.",
    });
    assert.equal(await m.artifactInputHash(s, [ids[0]]), p.inputHash);
    assert.ok(
      (await m.makeArtifactPacket(s, p.id, at)).json.includes(
        "Changed unselected project.",
      ),
    );
  },
);
await check(
  "changed selected closure cannot masquerade as an old reproducible packet",
  async () => {
    let s = await workflow(m);
    s = await run(s, { kind: "packet.record", projectIds: [s.projects[0].id] });
    const id = s.packets.at(-1).id;
    s = await freeze(s, {
      ...view(s).currentProtocol.content,
      values: {
        ...view(s).currentProtocol.content.values,
        analysis: "Changed selected assumptions.",
      },
    });
    await reject(() => m.makeArtifactPacket(s, id, at), "historical_packet");
    assert.equal(s.packets.length, 1);
  },
);
await check(
  "exact2MiB complete envelope round-trips and onebyteoversize never mutates prior state",
  async () => {
    const s = await exactBoundaryState(m);
    assert.equal(m.artifactBackupBytes(s), m.ARTIFACT_LIMITS.backupBytes);
    const raw = await m.makeArtifactBackup(s, at);
    assert.equal(new TextEncoder().encode(raw).length, 2097152);
    assert.equal(
      (await m.parseArtifactBackup(raw)).protocols.length,
      s.protocols.length,
    );
    const too = structuredClone(s);
    too.draft.form.fields.title += "x";
    const before = m.canonicalArtifactJson(s);
    await reject(() => m.validateArtifactState(too), "backup_limit");
    assert.equal(m.canonicalArtifactJson(s), before);
  },
);
await check(
  "unfinished raw JSON and meaningful large legacy protocol drafts are never coerced into records",
  async () => {
    let s = await withProject(m);
    const a = m.adapterForProgram("replication-program"),
      fields = {};
    for (const f of a.fields)
      fields[f.key] =
        f.type === "textarea"
          ? "x".repeat(8000)
          : protocolContent(m).values[f.key];
    fields.registration = "{unfinished";
    s = await run(s, {
      kind: "draft.replace",
      draft: {
        tab: "protocol",
        selectedProjectId: s.projects[0].id,
        form: { kind: "protocol", targetId: s.projects[0].id, fields },
        dirty: true,
      },
    });
    assert.ok(new TextEncoder().encode(JSON.stringify(s.draft)).length > 65536);
    assert.equal(s.protocols.length, 1);
    assert.equal(
      (await m.parseArtifactBackup(await m.makeArtifactBackup(s, at))).draft
        .form.fields.registration,
      "{unfinished",
    );
  },
);
await check(
  "asynchronous file mutation is rejected after snapshot hashing",
  async () => {
    const actual = globalThis.crypto,
      descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    let enter, release;
    const entered = new Promise((r) => (enter = r)),
      gate = new Promise((r) => (release = r));
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        subtle: {
          digest: async (...args) => {
            enter();
            await gate;
            return actual.subtle.digest(...args);
          },
        },
      },
    });
    try {
      const bytes = new TextEncoder().encode("original"),
        pending = m.hashSelectedArtifact(bytes, at);
      await entered;
      bytes[0] ^= 1;
      release();
      await reject(() => pending, "input_changed");
    } finally {
      Object.defineProperty(globalThis, "crypto", descriptor);
    }
  },
);
await check(
  "asynchronous no-op command mutation cannot clear drafts or bypass original hash guard",
  async () => {
    const s = await withProject(m),
      v = view(s),
      cmd = {
        kind: "protocol.freeze",
        projectId: v.project.id,
        expectedProtocolId: v.currentProtocol.id,
        expectedProtocolHash: v.currentProtocol.hash,
        content: structuredClone(v.currentProtocol.content),
        amendmentReason: "Noop",
      };
    let release, enter;
    const gate = new Promise((r) => (release = r)),
      entered = new Promise((r) => (enter = r));
    const c = await context(m, s);
    c.digest = async (bytes) => {
      enter();
      await gate;
      return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
    };
    const pending = m.prepareArtifactCommand(s, cmd, c);
    await entered;
    cmd.amendmentReason = "Changed during async check";
    release();
    await reject(() => pending, "input_changed");
    assert.equal(s.protocols.length, 1);
  },
);
await check(
  "full multibyte legacy protocol and 8000char source URL roundtrip through matching raw draft",
  async () => {
    let s = await withProject(m);
    const content = protocolContent(m),
      a = m.adapterForProgram("replication-program");
    for (const f of a.fields) {
      if (f.type === "text" || f.type === "textarea")
        content.values[f.key] = "科".repeat(f.maxLength);
      if (f.type === "url")
        content.values[f.key] =
          "https://example.invalid/" + "u".repeat(f.maxLength - 24);
    }
    // Preserve exactly the adapter's full URL capacity, without applying the new-reference1200 cap.
    content.values.source =
      "https://example.invalid/" +
      "u".repeat(8000 - "https://example.invalid/".length);
    s = await freeze(s, content);
    const v = view(s),
      fields = {
        ...content.values,
        adapterId: a.id,
        adapterHash: a.hash,
        projectId: v.project.id,
        expectedProtocolId: v.currentProtocol.id,
        expectedProtocolHash: v.currentProtocol.hash,
        resultsKnown: content.resultsKnown,
        registration: JSON.stringify(content.registration),
        amendmentReason: "未".repeat(2000),
      };
    s = await run(s, {
      kind: "draft.replace",
      draft: {
        tab: "protocol",
        selectedProjectId: v.project.id,
        form: { kind: "protocol", targetId: v.project.id, fields },
        dirty: true,
      },
    });
    const bytes = new TextEncoder().encode(
      m.canonicalArtifactJson(s.draft),
    ).length;
    assert.ok(bytes > 262144 && bytes <= 524288);
    const restored = await m.parseArtifactBackup(
      await m.makeArtifactBackup(s, at),
    );
    assert.equal(restored.draft.form.fields.source.length, 8000);
    assert.equal(restored.draft.form.fields.analysis, "科".repeat(8000));
    const bad = structuredClone(content);
    bad.registration = {
      url: content.values.source,
      reference: "Long reference URL is not an adapter value.",
      declaredOn: null,
    };
    await reject(() => freeze(s, bad), "text");
  },
);
await check(
  "successful commands clear only the exact related raw form and retained version bindings",
  async () => {
    let s = await withProject(m),
      v = view(s);
    const unrelated = {
      tab: "protocol",
      selectedProjectId: null,
      form: {
        kind: "protocol",
        targetId: null,
        fields: { title: "Unrelated unfinished new project" },
      },
      dirty: true,
    };
    s = await run(s, { kind: "draft.replace", draft: unrelated });
    s = await freeze(s, {
      ...v.currentProtocol.content,
      values: {
        ...v.currentProtocol.content.values,
        analysis: "A legitimate amendment.",
      },
    });
    assert.deepEqual(s.draft, unrelated);
    v = view(s);
    const raw = {
      tab: "protocol",
      selectedProjectId: v.project.id,
      form: {
        kind: "protocol",
        targetId: v.project.id,
        fields: {
          adapterId: v.currentProtocol.content.adapterId,
          adapterHash: v.currentProtocol.content.adapterHash,
          projectId: v.project.id,
          expectedProtocolId: v.currentProtocol.id,
          expectedProtocolHash: v.currentProtocol.hash,
        },
      },
      dirty: true,
    };
    s = await run(s, { kind: "draft.replace", draft: raw });
    s = await freeze(s, {
      ...v.currentProtocol.content,
      values: {
        ...v.currentProtocol.content.values,
        analysis: "Another amendment.",
      },
    });
    assert.equal(s.draft.form, null);
    // A saved older binding stays available after a separate fresh command to the same project.
    s = await run(s, { kind: "draft.replace", draft: raw });
    v = view(s);
    s = await freeze(s, {
      ...v.currentProtocol.content,
      values: {
        ...v.currentProtocol.content.values,
        analysis: "A newer amendment.",
      },
    });
    assert.deepEqual(s.draft, raw);
    let complete = await workflow(m),
      w = view(complete);
    const comparisonDraft = {
      tab: "compare",
      selectedProjectId: w.project.id,
      form: {
        kind: "comparison",
        targetId: w.project.id,
        fields: {
          resultId: w.latestResult.id,
          resultHash: w.latestResult.hash,
          supersedesId: w.latestComparison.id,
        },
      },
      dirty: true,
    };
    complete = await run(complete, {
      kind: "draft.replace",
      draft: comparisonDraft,
    });
    complete = await run(complete, {
      kind: "comparison.record",
      resultId: w.latestResult.id,
      resultHash: w.latestResult.hash,
      supersedesId: w.latestComparison.id,
      content: comparisonContent(),
    });
    assert.equal(complete.draft.form, null);
  },
);
await check(
  "selected adapter raw inventory rejects fields from a different known adapter",
  async () => {
    const s = await withProject(m),
      a = m.adapterForProgram("replication-program");
    await reject(
      () =>
        run(s, {
          kind: "draft.replace",
          draft: {
            tab: "protocol",
            selectedProjectId: null,
            form: {
              kind: "protocol",
              targetId: null,
              fields: {
                adapterId: a.id,
                adapterHash: a.hash,
                chain: "Methods-only raw field",
              },
            },
            dirty: true,
          },
        }),
      "draft",
    );
  },
);
await check(
  "Markdown evidence packet includes selected artifacts, numeric sources and descriptive comparisons",
  async () => {
    const s = await workflow(m),
      out = m.artifactMarkdownPacket(s, [s.projects[0].id]);
    assert.ok(out.includes("Descriptors and self-recorded checksums"));
    assert.ok(out.includes("Later reported estimate"));
    assert.ok(out.includes("Reported minus original: 0"));
    assert.ok(out.includes("example"));
  },
);
await check(
  "rehashed imported history cannot claim later registration or results knowledge without a manual amendment",
  async () => {
    const s = await importRows(base, legacyInput(m));
    for (const change of [
      { resultsKnown: "not-known" },
      {
        registration: {
          url: "https://example.invalid/registration",
          reference: "Self-recorded later reference",
          declaredOn: null,
        },
      },
    ]) {
      const bad = structuredClone(s),
        p = bad.protocols[0];
      Object.assign(p.content, change);
      p.contentHash = m.hashArtifactSync(p.content);
      const { hash, ...row } = p;
      p.hash = m.hashArtifactSync(row);
      await reject(() => m.validateArtifactState(bad), "origin");
    }
    const amended = await freeze(
      s,
      { ...view(s).currentProtocol.content, resultsKnown: "not-known" },
      "Declare results knowledge in a new manual version.",
    );
    assert.equal(view(amended).currentProtocol.origin, null);
    assert.equal(
      view(amended).currentProtocol.content.resultsKnown,
      "not-known",
    );
  },
);
console.log(
  `Artifact results: ${groups} actual-module groups passed. Synthetic local records only; no real study, review, upload or execution.`,
);
