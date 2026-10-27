// Actual pure modules and excluded fictional data. No operating authority is tested or seeded.
import assert from "node:assert/strict";
import { build } from "esbuild";
import ts from "typescript";
import {
  at,
  context,
  command,
  source,
  input,
  target,
  capture,
  withGraph,
  node,
  linkCommand,
  exactBoundaryState,
} from "../test-fixtures/program-graph/factory.mjs";
const built = await build({
  stdin: {
    contents:
      "export * from './src/lib/client/program-graph-model.ts';export * from './src/lib/client/program-graph-import.ts';",
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
const check = async (name, run) => {
  await run();
  groups++;
  console.log("✓ " + name);
};
const reject = (run, code) =>
  assert.rejects(
    async () => run(),
    (error) =>
      error instanceof m.ProgramGraphError && (!code || error.code === code),
  );
const run = (s, c) => command(m, s, c),
  copy = structuredClone;
const link = async (s, a, b, kind = "related-to", id = null) =>
  run(s, linkCommand(m, s, a, b, kind, id));
const fullBytes = (s) =>
  new TextEncoder().encode(
    JSON.stringify(
      {
        format: "charitology-program-graph-backup",
        version: 1,
        exportedAt: at,
        state: s,
        checksum: m.hashProgramGraphSync({
          format: "charitology-program-graph-backup",
          version: 1,
          exportedAt: at,
          state: s,
        }),
      },
      null,
      2,
    ) + "\n",
  );

await check(
  "actual model/import/frozen adapters pass strict TypeScript",
  () => {
    const p = ts.createProgram(
      [
        "src/lib/client/program-graph-model.ts",
        "src/lib/client/program-graph-import.ts",
      ],
      {
        strict: true,
        noEmit: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        skipLibCheck: true,
        lib: ["lib.es2023.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
      },
    );
    assert.deepEqual(
      ts
        .getPreEmitDiagnostics(p)
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")),
      [],
    );
  },
);
await check(
  "canonical SHA matches WebCrypto and rejects unsupported JSON without executing accessors",
  async () => {
    for (const v of [
      null,
      "abc",
      "救援 🧭",
      { b: 0, a: [false, "x".repeat(5000)] },
    ])
      assert.equal(m.hashProgramGraphSync(v), await m.hashProgramGraphValue(v));
    for (const v of [
      Infinity,
      NaN,
      undefined,
      new Date(),
      { x: undefined },
      JSON.parse('{"__proto__":{}}'),
      new Array(2),
      Object.assign(new Array(1), { extra: 1 }),
      new Uint8Array(1),
    ])
      assert.throws(() => m.canonicalProgramGraphJson(v), m.ProgramGraphError);
    let called = false;
    const getter = {
      get x() {
        called = true;
        return 1;
      },
    };
    assert.throws(() => m.canonicalProgramGraphJson(getter));
    assert.equal(called, false);
  },
);
await check(
  "blank state has no initial capture, preserves unknowns and is deeply frozen",
  async () => {
    const s = m.blankProgramGraphState("fictional-blank", at);
    assert.deepEqual(m.programGraphCounts(s), {
      sources: 0,
      nodes: 0,
      present: 0,
      missing: 0,
      links: 0,
      current: 0,
      stale: 0,
      unresolved: 0,
      retired: 0,
    });
    assert.deepEqual(s.adapters, []);
    assert.ok(Object.isFrozen(s.draft));
    assert.deepEqual(
      await m.parseProgramGraphBackup(await m.makeProgramGraphBackup(s, at)),
      s,
    );
  },
);
await check(
  "all nine real program adapters produce valid source-owned captured node histories",
  async () => {
    for (const program of [
      "the-charitology-fund",
      "charity-incubator",
      "question-bounties",
      "the-charitology-prize",
      "charitology-fellowship",
      "charitology-summit",
      "donor-advisory",
      "nonprofit-advisory",
      "field-verification",
    ]) {
      const s = await withGraph(m, program);
      assert.equal(s.adapters.length, 1);
      assert.equal(
        s.nodes.length,
        m.adapterForProgram(program).collections.length,
      );
      assert.equal(s.captures[0].nodeVersions.length, s.nodes.length);
      assert.ok(
        s.nodeVersions.every(
          (v) =>
            v.presence === "present" && v.previousId === null && !v.reappeared,
        ),
      );
    }
  },
);
await check(
  "whole source is validated but unselected values stay out of graph snapshots",
  async () => {
    const s = m.blankProgramGraphState("fictional-privacy", at),
      data = source(m),
      keys = Object.keys(data.records).sort(),
      privateKey = keys[1];
    data.records[privateKey][0].id = "UNSELECTED_PRIVATE_ID";
    data.records[privateKey][0].values.title = "UNSELECTED_SECRET_VALUE";
    const p = await m.previewProgramCapture(
      s,
      input(data),
      await m.programGraphStateHash(s),
    );
    const next = await run(s, {
      kind: "source.capture",
      preview: p,
      selection: {
        selectedIndexes: [0],
        alias: "Fictional selected copy",
        completeCopyAcknowledged: true,
        separateCopyAcknowledged: false,
        resumeRetired: false,
      },
    });
    const raw = m.canonicalProgramGraphJson(next);
    assert.ok(raw.includes("UNSELECTED_PRIVATE_ID"));
    assert.ok(!raw.includes("UNSELECTED_SECRET_VALUE"));
    assert.equal(next.nodes.length, 1);
    const packet = await m.programGraphPacket(next, {
      nodeIds: [next.nodes[0].id],
      linkIds: [],
    });
    assert.ok(!packet.csv.includes("UNSELECTED_PRIVATE_ID"));
    assert.ok(!packet.markdown.includes("UNSELECTED_PRIVATE_ID"));
    assert.ok(packet.omissions.some((v) => v.includes("context")));
  },
);
await check(
  "typed Fund chain, reverse navigation and explicit cross-program planning work",
  async () => {
    let s = await withGraph(m);
    s = await link(
      s,
      node(s, "allocations"),
      node(s, "proposals"),
      "decision-note-for",
    );
    s = await link(
      s,
      node(s, "ledger"),
      node(s, "allocations"),
      "planned-work-for",
    );
    s = await link(
      s,
      node(s, "conflicts"),
      node(s, "proposals"),
      "conflict-note-for",
    );
    s = await capture(m, s, source(m, "charity-incubator"));
    s = await link(
      s,
      node(s, "proposals"),
      node(s, "projects", s.sources[1].id),
    );
    assert.equal(m.programGraphCounts(s).current, 4);
    assert.equal(
      m.programGraphNodeView(s, node(s, "proposals").id).incoming.length,
      3,
    );
    assert.ok(
      m
        .programGraphAllowedRelations(s, node(s, "allocations").id)
        .includes("decision-note-for"),
    );
    assert.ok(
      !m
        .programGraphAllowedRelations(s, node(s, "proposals").id)
        .includes("decision-note-for"),
    );
    await reject(
      () =>
        link(
          s,
          node(s, "proposals"),
          node(s, "allocations"),
          "decision-note-for",
        ),
      "relation_role",
    );
  },
);
await check(
  "Incubator and Field Verification chains retain their distinct source roles",
  async () => {
    let s = await withGraph(m, "charity-incubator");
    s = await link(s, node(s, "projects"), node(s, "gaps"), "depends-on");
    s = await link(
      s,
      node(s, "experiments"),
      node(s, "projects"),
      "planned-work-for",
    );
    s = await link(
      s,
      node(s, "milestones"),
      node(s, "experiments"),
      "depends-on",
    );
    s = await capture(m, s, source(m, "field-verification"));
    const id = s.sources[1].id;
    s = await link(
      s,
      node(s, "findings", id),
      node(s, "checks", id),
      "evidence-note-for",
    );
    s = await link(
      s,
      node(s, "responses", id),
      node(s, "findings", id),
      "decision-note-for",
    );
    assert.equal(m.programGraphCounts(s).current, 5);
  },
);
await check(
  "self/duplicate/symmetric relationships are guarded and exact current review is a no-op",
  async () => {
    let s = await withGraph(m);
    const a = node(s, "proposals"),
      b = node(s, "allocations");
    await reject(() => link(s, a, a), "self_link");
    s = await link(s, a, b);
    await reject(() => link(s, a, b), "duplicate_link");
    const l = s.links[0],
      cmd = linkCommand(
        m,
        s,
        s.nodes.find((n) => n.id === l.from),
        s.nodes.find((n) => n.id === l.to),
        l.kind,
        l.id,
      ),
      prepared = await m.prepareProgramGraphCommand(s, cmd, context(m, s));
    assert.equal(prepared.noOp, true);
    assert.deepEqual(prepared.nextState, s);
    await reject(
      () =>
        run(s, {
          ...cmd,
          from: l.to,
          to: l.from,
          fromVersionId: cmd.toVersionId,
          toVersionId: cmd.fromVersionId,
        }),
      "link_identity",
    );
  },
);
await check(
  "dependency cycles include unresolved links; retirement explicitly breaks a cycle",
  async () => {
    let s = await withGraph(m);
    s = await link(
      s,
      node(s, "proposals"),
      node(s, "allocations"),
      "depends-on",
    );
    s = await link(s, node(s, "allocations"), node(s, "ledger"), "depends-on");
    const data = source(m);
    data.records.allocations = [];
    s = await capture(m, s, data, { sourceId: s.sources[0].id });
    assert.equal(m.programGraphCounts(s).unresolved, 2);
    await reject(
      () => link(s, node(s, "ledger"), node(s, "proposals"), "depends-on"),
      "dependency_cycle",
    );
    const old = s.links[0];
    s = await run(s, {
      kind: "link.retire",
      linkId: old.id,
      expectedLinkVersionId: old.currentVersionId,
      reason: "Fictional dependency deliberately withdrawn.",
    });
    s = await link(s, node(s, "ledger"), node(s, "proposals"), "depends-on");
    assert.equal(m.programGraphCounts(s).retired, 1);
  },
);
await check(
  "rename refresh preserves IDs, appends only changed values and leaves exact old link stale",
  async () => {
    let s = await withGraph(m);
    s = await link(
      s,
      node(s, "allocations"),
      node(s, "proposals"),
      "decision-note-for",
    );
    const before = copy(s),
      data = source(m);
    data.records.proposals[0].values.title = "Fictional renamed proposal";
    s = await capture(m, s, data, { sourceId: s.sources[0].id });
    assert.equal(node(s, "proposals").id, node(before, "proposals").id);
    assert.equal(s.nodeVersions.length, before.nodeVersions.length + 1);
    assert.equal(m.programGraphLinkState(s, s.links[0].id).state, "stale");
    const v = m.programGraphNodeView(s, node(s, "proposals").id);
    assert.equal(v.history.length, 2);
    assert.notEqual(v.history[0].values.title, v.current.values.title);
  },
);
await check(
  "changed raw source context invalidates every tracked endpoint review",
  async () => {
    let s = await withGraph(m);
    s = await link(
      s,
      node(s, "allocations"),
      node(s, "proposals"),
      "decision-note-for",
    );
    const data = source(m),
      field = m
        .adapterForProgram(data.program)
        .context.find((f) => f.kind === "text" || f.kind === "textarea");
    assert.ok(field);
    data.context[field.key] =
      " Fictional changed scope; no outside authorization. ";
    const p = await m.previewProgramCapture(
      s,
      input(data, target(s)),
      await m.programGraphStateHash(s),
    );
    assert.equal(p.context[field.key], data.context[field.key]);
    const n = s.nodes.length;
    s = await capture(m, s, data, { sourceId: s.sources[0].id });
    assert.equal(s.nodeVersions.length, n * 2);
    assert.equal(m.programGraphCounts(s).stale, 1);
  },
);
await check(
  "empty chosen inventories preserve old values and repeat absence reuses its version",
  async () => {
    let s = await withGraph(m);
    const data = source(m);
    for (const key of Object.keys(data.records)) data.records[key] = [];
    s = await capture(m, s, data, { sourceId: s.sources[0].id });
    assert.equal(m.programGraphCounts(s).missing, s.nodes.length);
    assert.ok(m.programGraphNodeView(s, s.nodes[0].id).lastPresent.values);
    const count = s.nodeVersions.length;
    s = await capture(m, s, data, { sourceId: s.sources[0].id });
    assert.equal(s.nodeVersions.length, count);
    assert.equal(s.captures.length, 2);
  },
);
await check(
  "reappearance acknowledgement survives later edits and cannot be invented or omitted",
  async () => {
    let s = await withGraph(m);
    s = await link(
      s,
      node(s, "allocations"),
      node(s, "proposals"),
      "decision-note-for",
    );
    const original = source(m),
      absent = copy(original);
    absent.records.proposals = [];
    s = await capture(m, s, absent, { sourceId: s.sources[0].id });
    s = await capture(m, s, original, { sourceId: s.sources[0].id });
    const changed = copy(original);
    changed.records.proposals[0].values.title =
      "Fictional later edit after reappearance";
    s = await capture(m, s, changed, { sourceId: s.sources[0].id });
    const cmd = linkCommand(
      m,
      s,
      node(s, "allocations"),
      node(s, "proposals"),
      "decision-note-for",
      s.links[0].id,
    );
    assert.deepEqual(cmd.reappearanceAcknowledged, [node(s, "proposals").id]);
    await reject(
      () => run(s, { ...cmd, reappearanceAcknowledged: [] }),
      "reappearance",
    );
    s = await run(s, cmd);
    assert.equal(m.programGraphCounts(s).current, 1);
    const replay = {
      ...cmd,
      expectedLinkVersionId: s.links[0].currentVersionId,
    };
    assert.equal(
      (await m.prepareProgramGraphCommand(s, replay, context(m, s))).noOp,
      true,
    );
  },
);
await check(
  "cloned source enrollment stays separate and source retirement resumes only through fresh capture",
  async () => {
    let s = await withGraph(m);
    await reject(() => capture(m, s, source(m)));
    s = await capture(m, s, source(m), { separate: true });
    assert.equal(s.sources.length, 2);
    assert.equal(s.nodes.length, 10);
    assert.notEqual(s.nodes[0].id, s.nodes[5].id);
    s = await link(s, s.nodes[0], s.nodes[5]);
    const id = s.sources[0].id;
    s = await run(s, {
      kind: "source.retire",
      sourceId: id,
      expectedCaptureId: s.sources[0].currentCaptureId,
      reason: "Fictional source deliberately retired.",
    });
    assert.equal(m.programGraphCounts(s).unresolved, 1);
    await reject(() => capture(m, s, source(m), { sourceId: id }));
    s = await capture(m, s, source(m), { sourceId: id, resume: true });
    assert.equal(s.sources[0].retirement, null);
    assert.equal(m.programGraphCounts(s).current, 1);
  },
);
await check(
  "rehashed impossible source/node histories fail beyond outer checksum validation",
  async () => {
    const valid = await withGraph(m);
    let bad = copy(valid);
    bad.nodeVersions[0].reappeared = true;
    bad.nodeVersions[0].hash = m.graphEntryHash(bad.nodeVersions[0]);
    await reject(() => m.validateProgramGraphState(bad), "reappearance");
    bad = copy(valid);
    bad.captures[0].nodeVersions.pop();
    bad.captures[0].hash = m.graphEntryHash(bad.captures[0]);
    await reject(() => m.validateProgramGraphState(bad), "capture_chain");
    bad = copy(valid);
    bad.sources[0].currentCaptureId = "unknown-capture";
    await reject(() => m.validateProgramGraphState(bad), "capture_chain");
    bad = copy(valid);
    bad.nodes = [];
    bad.nodeVersions = [];
    bad.captures[0].nodeVersions = [];
    bad.captures[0].hash = m.graphEntryHash(bad.captures[0]);
    await reject(() => m.validateProgramGraphState(bad), "capture_chain");
  },
);
await check(
  "rehashed endpoint/legacy provenance and historical dependency-cycle forgery fail",
  async () => {
    let s = await withGraph(m);
    const a = node(s, "allocations"),
      b = node(s, "proposals");
    let cmd = linkCommand(m, s, a, b, "decision-note-for");
    cmd.legacyField = {
      nodeId: b.id,
      field: "title",
      rawValueHash: m.hashProgramGraphSync(
        m.programGraphNodeView(s, b.id).current.values.title,
      ),
    };
    s = await run(s, cmd);
    const bad = copy(s);
    bad.linkVersions[0].legacyField.rawValueHash = "0".repeat(64);
    bad.linkVersions[0].hash = m.graphEntryHash(bad.linkVersions[0]);
    await reject(() => m.validateProgramGraphState(bad), "legacy_field");
    const changed = copy(s);
    changed.links[0].to = node(s, "ledger").id;
    await reject(() => m.validateProgramGraphState(changed), "link_chain");
  },
);
await check(
  "all six raw form allowlists retain incomplete/malformed strings without authority",
  async () => {
    let s = await withGraph(m);
    for (const [kind, names] of Object.entries(m.PROGRAM_GRAPH_FORM_NAMES)) {
      s = await run(s, {
        kind: "draft.replace",
        draft: {
          tab: "recovery",
          sourceId: null,
          nodeId: null,
          dirty: true,
          form: {
            kind,
            targetId: null,
            binding: Object.fromEntries(
              names.binding.map((k) => [k, "[malformed raw repair"]),
            ),
            fields: Object.fromEntries(
              names.fields.map((k) => [k, "[not canonical JSON"]),
            ),
          },
        },
      });
      assert.equal(s.draft.form.kind, kind);
      assert.ok(s.draft.dirty);
      assert.deepEqual(
        await m.parseProgramGraphBackup(await m.makeProgramGraphBackup(s, at)),
        s,
      );
    }
    const bad = copy(s);
    bad.draft.form.fields.unpublishedAuthority = "true";
    await reject(() => m.validateProgramGraphState(bad), "draft");
  },
);
await check(
  "successful rename clears only its exact complete raw target, bindings and values",
  async () => {
    let s = await withGraph(m);
    const id = s.sources[0].id,
      raw = {
        tab: "sources",
        sourceId: id,
        nodeId: null,
        dirty: true,
        form: {
          kind: "rename-source",
          targetId: id,
          binding: { sourceId: id },
          fields: { alias: "Fictional renamed copy" },
        },
      };
    s = await run(s, { kind: "draft.replace", draft: raw });
    s = await run(s, {
      kind: "source.rename",
      sourceId: id,
      alias: raw.form.fields.alias,
    });
    assert.equal(s.draft.form, null);
    assert.equal(s.draft.sourceId, id);
    s = await run(s, {
      kind: "draft.replace",
      draft: { ...raw, form: { ...raw.form, targetId: null } },
    });
    s = await run(s, {
      kind: "source.rename",
      sourceId: id,
      alias: "Fictional third alias",
    });
    assert.ok(s.draft.form);
    s = await run(s, {
      kind: "source.rename",
      sourceId: id,
      alias: "Fictional third alias",
    });
    assert.ok(s.draft.form);
  },
);
await check(
  "no-op capture and no-op review retain pending raw forms exactly",
  async () => {
    let s = await withGraph(m);
    s = await link(
      s,
      node(s, "allocations"),
      node(s, "proposals"),
      "decision-note-for",
    );
    s = await run(s, {
      kind: "draft.replace",
      draft: {
        tab: "import",
        sourceId: null,
        nodeId: null,
        dirty: true,
        form: {
          kind: "capture",
          targetId: null,
          binding: {},
          fields: { alias: "Unrelated unfinished new source" },
        },
      },
    });
    const before = copy(s);
    s = await capture(m, s, source(m), { sourceId: s.sources[0].id });
    assert.deepEqual(s, before);
    const cmd = linkCommand(
      m,
      s,
      node(s, "allocations"),
      node(s, "proposals"),
      "decision-note-for",
      s.links[0].id,
    );
    s = await run(s, cmd);
    assert.deepEqual(s, before);
  },
);
await check(
  "graph commands snapshot live state, command and injected context across awaits",
  async () => {
    let state = copy(await withGraph(m)),
      cmd = {
        kind: "source.rename",
        sourceId: state.sources[0].id,
        alias: "Fictional rename",
      },
      ctx = context(m, state),
      fired = false;
    ctx.digest = async (bytes) => {
      if (!fired) {
        fired = true;
        cmd.alias = "Changed while hashing";
      }
      return Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString(
        "hex",
      );
    };
    await reject(
      () => m.prepareProgramGraphCommand(state, cmd, ctx),
      "input_changed",
    );
    state = copy(await withGraph(m));
    cmd = {
      kind: "source.rename",
      sourceId: state.sources[0].id,
      alias: "Fictional rename",
    };
    ctx = context(m, state);
    fired = false;
    ctx.digest = async (bytes) => {
      if (!fired) {
        fired = true;
        state.revision++;
      }
      return Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString(
        "hex",
      );
    };
    await reject(
      () => m.prepareProgramGraphCommand(state, cmd, ctx),
      "input_changed",
    );
  },
);
await check(
  "oversized hostile byte subclasses fail before hashing or cloning",
  async () => {
    const s = m.blankProgramGraphState("fictional-large-bytes", at);
    class Hostile extends Uint8Array {
      get byteLength() {
        return 0;
      }
      [Symbol.iterator]() {
        throw Error("must not iterate");
      }
    }
    let digestCalled = false;
    const ctx = context(m, s, async () => {
      digestCalled = true;
      throw Error("must not hash");
    });
    await reject(
      () =>
        m.prepareProgramGraphCommand(
          s,
          {
            kind: "source.capture",
            preview: { bytes: new Hostile(8_000_001) },
            selection: {},
          },
          ctx,
        ),
      "byte_limit",
    );
    assert.equal(digestCalled, false);
    await reject(
      () => m.parseProgramGraphBackup(new Hostile(2_097_153)),
      "byte_limit",
    );
  },
);
await check(
  "strict backup admission rejects duplicate keys, excessive nesting, UTF8 and altered checksums",
  async () => {
    const s = await withGraph(m),
      backup = await m.makeProgramGraphBackup(s, at);
    await reject(
      () =>
        m.parseProgramGraphBackup(
          backup.replace('"version": 1', '"version": 1, "vers\\u0069on": 1'),
        ),
      "duplicate_key",
    );
    await reject(
      () => m.parseProgramGraphBackup("[".repeat(33) + "0" + "]".repeat(33)),
      "depth",
    );
    await reject(
      () => m.parseProgramGraphBackup(new Uint8Array([0xff])),
      "utf8",
    );
    const bad = JSON.parse(backup);
    bad.state.sources[0].alias = "Edited after checksum";
    await reject(
      () => m.parseProgramGraphBackup(JSON.stringify(bad)),
      "backup_hash",
    );
    await reject(() => m.parseProgramGraphBackup(JSON.stringify(source(m))));
  },
);
await check(
  "filtered packet includes exact historical endpoint closure and no unrelated draft/inventory",
  async () => {
    let s = await withGraph(m);
    s = await link(
      s,
      node(s, "allocations"),
      node(s, "proposals"),
      "decision-note-for",
    );
    const data = source(m);
    data.records.proposals[0].values.title = "=Fictional formula-looking title";
    s = await capture(m, s, data, { sourceId: s.sources[0].id });
    s = await run(s, {
      kind: "draft.replace",
      draft: {
        tab: "exports",
        sourceId: null,
        nodeId: null,
        dirty: true,
        form: {
          kind: "rename-source",
          targetId: null,
          binding: {},
          fields: { alias: "PRIVATE_UNRELATED_RAW_FORM" },
        },
      },
    });
    const packet = await m.programGraphPacket(s, {
      nodeIds: [],
      linkIds: [s.links[0].id],
    });
    assert.ok(packet.markdown.includes("stale"));
    assert.ok(packet.markdown.includes(s.linkVersions[0].toVersionId));
    assert.ok(!packet.markdown.includes("PRIVATE_UNRELATED_RAW_FORM"));
    assert.ok(!packet.markdown.includes(node(s, "readiness").recordId));
    assert.ok(packet.csv.startsWith('"rowType"'));
    assert.ok(packet.omissions.some((v) => v.includes("cannot restore")));
    await reject(
      () => m.programGraphPacket(s, { nodeIds: ["unknown-node"], linkIds: [] }),
      "reference",
    );
  },
);
await check(
  "CSV formula defense applies to user text and packet selection is deterministic",
  async () => {
    let s = await withGraph(m);
    s = await run(s, {
      kind: "source.rename",
      sourceId: s.sources[0].id,
      alias: " =Fictional formula alias",
    });
    const chosen = { nodeIds: [s.nodes[0].id], linkIds: [] },
      p = await m.programGraphPacket(s, chosen);
    assert.ok(p.csv.includes('"\' =Fictional formula alias"'));
    assert.deepEqual(await m.programGraphPacket(s, chosen), p);
    await reject(
      () =>
        m.programGraphPacket(s, {
          nodeIds: [s.nodes[1].id, s.nodes[0].id],
          linkIds: [],
        }),
      "order",
    );
  },
);
await check(
  "full 2 MiB backup round trips exactly and one extra byte preserves the previous valid graph",
  async () => {
    const s = await exactBoundaryState(m),
      backup = await m.makeProgramGraphBackup(s, at);
    assert.equal(new TextEncoder().encode(backup).length, 2_097_152);
    assert.deepEqual(await m.parseProgramGraphBackup(backup), s);
    assert.equal(await m.makeProgramGraphBackup(s, at), backup);
    const bad = copy(s);
    bad.draft.form.fields.alias += "x";
    assert.equal(fullBytes(bad).length, 2_097_153);
    await reject(() => m.validateProgramGraphState(bad), "backup_limit");
    await reject(() => m.parseProgramGraphBackup(fullBytes(bad)), "byte_limit");
    assert.equal(m.graphBackupBytes(s), 2_097_152);
  },
);
await check(
  "selected historical Markdown remains bounded even with hundreds of thousands of code markers",
  async () => {
    const s = await exactBoundaryState(m);
    s.draft = {
      tab: "exports",
      sourceId: null,
      nodeId: null,
      form: null,
      dirty: false,
    };
    const a = m.adapterForProgram(s.sources[0].program);
    for (const v of s.nodeVersions) {
      const n = s.nodes.find((n) => n.id === v.nodeId),
        c = a.collections.find((c) => c.key === n.collection);
      for (const f of c.fields)
        if (f.kind === "textarea" && v.values !== null)
          v.values[f.key] = "`x".repeat(2500);
      v.hash = m.graphEntryHash(v);
    }
    const from = node(s, "allocations"),
      to = node(s, "proposals"),
      l = {
        id: "fictional-code-marker-link",
        from: from.id,
        to: to.id,
        kind: "decision-note-for",
        currentVersionId: "",
      };
    for (const [index, c] of s.captures.entries()) {
      const v = {
        id: `fictional-code-review-${index}`,
        linkId: l.id,
        version: index + 1,
        previousId: index ? `fictional-code-review-${index - 1}` : null,
        recordedAt: at,
        action: "review",
        fromVersionId: c.nodeVersions.find((r) => r.nodeId === from.id)
          .versionId,
        toVersionId: c.nodeVersions.find((r) => r.nodeId === to.id).versionId,
        reason: "Fictional retained source review only.",
        legacyField: null,
        reappearanceAcknowledged: [],
      };
      s.linkVersions.push({ ...v, hash: m.hashProgramGraphSync(v) });
      l.currentVersionId = v.id;
    }
    s.links.push(l);
    const valid = await m.validateProgramGraphState(s),
      packet = await m.programGraphPacket(valid, {
        nodeIds: [],
        linkIds: [l.id],
      });
    let markers = 0;
    for (const _match of packet.markdown.matchAll(/`+/g)) markers++;
    assert.ok(markers > 100_000);
    assert.match(packet.markdown, /^```json$/m);
    assert.ok(packet.markdown.includes("fictional-code-review-0"));
  },
);
await check(
  "transient form matching shares the exact model cleanup representation",
  async () => {
    const s = await withGraph(m),
      cmd = {
        kind: "source.rename",
        sourceId: s.sources[0].id,
        alias: " Fictional exact raw alias ",
      },
      form = m.programGraphCommandForm(cmd);
    assert.ok(Object.isFrozen(form));
    assert.equal(m.programGraphFormMatchesCommand(form, cmd), true);
    assert.equal(
      m.programGraphFormMatchesCommand(
        { ...form, fields: { alias: cmd.alias.trim() } },
        cmd,
      ),
      false,
    );
    assert.equal(
      m.programGraphFormMatchesCommand({ ...form, binding: {} }, cmd),
      false,
    );
    assert.equal(
      m.programGraphCommandForm({ kind: "draft.replace", draft: s.draft }),
      null,
    );
  },
);
await check(
  "safe state/history/count caps reject rather than truncate retained entries",
  async () => {
    const s = await withGraph(m);
    for (const [key, limit] of [
      ["sources", 20],
      ["captures", 100],
      ["nodes", 500],
      ["nodeVersions", 2000],
      ["links", 500],
      ["linkVersions", 2000],
    ]) {
      const bad = copy(s);
      bad[key] = Array.from({ length: limit + 1 }, (_, i) => ({
        id: `oversized-${i}`,
      }));
      await reject(() => m.validateProgramGraphState(bad), "limit");
    }
    const bad = copy(s);
    bad.revision = Number.MAX_SAFE_INTEGER;
    await reject(
      () =>
        run(bad, {
          kind: "source.rename",
          sourceId: bad.sources[0].id,
          alias: "Different fictional alias",
        }),
      "integer",
    );
  },
);
console.log(
  `Program graph model: ${groups} actual-module groups passed. Fictional local snapshots/links only; no source mutation, shared authority or observed outcomes.`,
);
