import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import ts from "typescript";

const built = await build({
  stdin: {
    contents: `export * from './src/lib/client/program-graph-model.ts';
      export * from './src/lib/client/program-graph-import.ts';
      export {PROGRAM_GRAPH_ADAPTERS} from './src/data/program-graph-adapters.ts';
      export {programWorkspaces,emptyWorkspace,sampleWorkspace,partnerBackup,parseWorkspace,validValues} from './src/lib/client/partner-programs.ts';`,
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
const encoder = new TextEncoder();
const at = "2026-10-27T12:00:00.000Z";
const clone = structuredClone;
const canonical = (value) =>
  value === null || typeof value !== "object"
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? "[" + value.map(canonical).join(",") + "]"
      : "{" +
        Object.keys(value)
          .sort()
          .map((key) => JSON.stringify(key) + ":" + canonical(value[key]))
          .join(",") +
        "}";
const digest = (value) =>
  createHash("sha256").update(canonical(value)).digest("hex");
const byteHash = (value) => createHash("sha256").update(value).digest("hex");
const field = (f) => ({
  key: f.key,
  label: f.label,
  kind: f.kind ?? "text",
  optional: f.optional ?? false,
  options: f.options ?? [],
  min: f.min ?? null,
  max: f.max ?? null,
  value: f.value ?? null,
  hint: f.hint ?? null,
  maxLength: f.kind === "textarea" ? 5000 : 500,
});
const pins = {
  "the-charitology-fund":
    "6c35d45e777bb1f972c177d579330ce6733c60a3972886cfcab7adbc2ae61d2d",
  "charity-incubator":
    "eded5ab6727d9def42321ff1551fa22329f2281863ffdb60bb95a6efde697656",
  "question-bounties":
    "ae04bedb847405ebed5513309da655f5c1f0021c7f67649faed2f49d0559a212",
  "the-charitology-prize":
    "292cc4b7776c5845b64dc1caaa66d41b652ae854902dd965ada283af97b9d25b",
  "charitology-fellowship":
    "f7ab921a507d504981d40f8b31641aacdc6f47f90461c1747f1db742bcdce46b",
  "charitology-summit":
    "5bdd5fbdbae4c21f85a7c02d2df85c57e32551b89c29ad37047050a79bdcece9",
  "donor-advisory":
    "25b0f881b40775eff925c3907b08223a277762993838881bbeb1439b218e5e56",
  "nonprofit-advisory":
    "8092fd8b1de272db6d1bfc1318066b058cc8b8dedbd17fc5d0e0ca8c0b71fc87",
  "field-verification":
    "86c84be22a760c535af0e888a2ddacedce9190bba5af4a4bae9e0552c1f4f56e",
};
let groups = 0,
  id = 0;
const newId = () => "synthetic-" + ++id;
const check = async (name, fn) => {
  try {
    await fn();
  } catch (error) {
    throw Error(
      `${name}: ${error.name}: ${error.message} [${error.code ?? "assertion"}]`,
    );
  }
  groups++;
  console.log("✓ " + name);
};
const fails = (fn, code) =>
  assert.throws(
    fn,
    (e) => e instanceof m.ProgramGraphError && (!code || e.code === code),
  );
const rejects = (fn, code) =>
  assert.rejects(
    async () => fn(),
    (e) => e instanceof m.ProgramGraphError && (!code || e.code === code),
  );
const bytes = (value) => encoder.encode(JSON.stringify(value));
const blank = () => m.blankProgramGraphState(newId(), at);
function sample(program) {
  const state = m.sampleWorkspace(m.programWorkspaces[program]);
  state.updated = at;
  let n = 0;
  for (const rows of Object.values(state.records))
    for (const row of rows) row.id = "source-" + ++n;
  return state;
}
const fund = () => sample("the-charitology-fund");
function target(state, sourceId = state.sources[0]?.id) {
  if (!sourceId) return null;
  const source = state.sources.find((s) => s.id === sourceId);
  const capture = state.captures.find((c) => c.id === source.currentCaptureId);
  return {
    sourceId,
    expectedCaptureId: capture.id,
    expectedCaptureHash: capture.hash,
  };
}
async function preview(
  state,
  source,
  refresh = null,
  origin = { kind: "file", fileName: "synthetic.json" },
) {
  return m.previewProgramCapture(
    state,
    { program: source.program, bytes: bytes(source), origin, target: refresh },
    await m.programGraphStateHash(state),
  );
}
const selection = (p, indexes = [0], extras = {}) => ({
  selectedIndexes: indexes,
  alias: p.target ? null : "Fictional planning copy",
  completeCopyAcknowledged: true,
  separateCopyAcknowledged: false,
  resumeRetired: false,
  ...extras,
});
async function capture(
  state,
  source,
  refresh = null,
  indexes = [0],
  extra = {},
) {
  const p = await preview(state, source, refresh);
  const next = await m.applyProgramCapture(
    state,
    p,
    selection(p, indexes, extra),
    { at, makeId: newId },
  );
  await m.validateProgramGraphState(next);
  return next;
}

await check(
  "all nine inert definitions, all 46 collections and context fields match actual legacy configs and pinned hashes",
  () => {
    assert.equal(m.PROGRAM_GRAPH_ADAPTERS.length, 9);
    assert.equal(
      m.PROGRAM_GRAPH_ADAPTERS.reduce((n, a) => n + a.collections.length, 0),
      46,
    );
    for (const a of m.PROGRAM_GRAPH_ADAPTERS) {
      const c = m.programWorkspaces[a.program];
      const expected = {
        id: `partner-${c.id}-v1`,
        version: 1,
        program: c.id,
        context: c.context.map(field),
        collections: c.collections.map((x) => ({
          key: x.key,
          label: x.label,
          singular: x.singular,
          description: x.description,
          fields: x.fields.map(field),
        })),
      };
      assert.deepEqual(a, { ...expected, hash: digest(expected) });
      assert.equal(a.hash, pins[a.program]);
      assert.ok(
        Object.isFrozen(a) &&
          Object.isFrozen(a.context) &&
          Object.isFrozen(a.collections[0].fields[0]),
      );
    }
  },
);

await check(
  "actual nine complete empty and sample exports round-trip without original-byte or string changes",
  async () => {
    let rows = 0;
    for (const c of Object.values(m.programWorkspaces)) {
      for (const state of [m.emptyWorkspace(c), sample(c.id)]) {
        const raw = m.partnerBackup(state),
          original = bytes(state);
        const read = m.readProgramGraphSource(encoder.encode(raw), c.id);
        assert.deepEqual(read.source, state);
        assert.deepEqual(bytes(state), original);
        const graph = blank(),
          p = await preview(graph, state);
        assert.deepEqual(p.context, state.context);
        assert.equal(p.rows.length, Object.values(state.records).flat().length);
        assert.equal(p.sourceCanonicalHash, digest(state));
        assert.equal(p.sourceRawHash, byteHash(bytes(state)));
        if (p.rows.length) {
          rows += p.rows.length;
          const next = await m.applyProgramCapture(
            graph,
            p,
            selection(
              p,
              p.rows.map((r) => r.index),
            ),
            { at, makeId: newId },
          );
          await m.validateProgramGraphState(next);
          assert.equal(next.nodes.length, p.rows.length);
        }
      }
    }
    assert.equal(rows, 68);
  },
);
await check(
  "whole strict source admission rejects unknown or missing fields at every envelope level",
  () => {
    const src = fund(),
      key = Object.keys(src.records).find((k) => src.records[k].length),
      row = src.records[key][0];
    for (const mutate of [
      (s) => (s.future = true),
      (s) => (s.context.future = "x"),
      (s) => (s.records.future = []),
      (s) => (s.records[key][0].future = "x"),
      (s) => (s.records[key][0].values.future = "x"),
      (s) => delete s.context[Object.keys(s.context)[0]],
      (s) => delete s.records[key],
      (s) => delete s.records[key][0].values[Object.keys(row.values)[0]],
      (s) => (s.version = 2),
    ]) {
      const changed = clone(src);
      mutate(changed);
      fails(() => m.readProgramGraphSource(bytes(changed), src.program));
    }
    fails(
      () => m.readProgramGraphSource(bytes(src), "charity-incubator"),
      "source_version",
    );
  },
);

await check(
  "trim is validation-only: spaces, explicit zero, blank optional fields and context drafts are retained",
  () => {
    for (const a of m.PROGRAM_GRAPH_ADAPTERS) {
      const values = Object.fromEntries(a.context.map((f) => [f.key, " \t "]));
      assert.deepEqual(m.validateGraphValues(values, a.context, true), values);
      for (const c of a.collections) {
        const source = sample(a.program),
          original = source.records[c.key][0]?.values;
        if (!original) continue;
        const padded = Object.fromEntries(
          Object.entries(original).map(([k, v]) => [
            k,
            v ? " \t" + v + "  " : " \t ",
          ]),
        );
        assert.deepEqual(m.validateGraphValues(padded, c.fields), padded);
        for (const f of c.fields.filter((f) => f.kind === "number")) {
          const value = ` ${Math.max(0, f.min ?? 0)} `,
            v = { ...original, [f.key]: value };
          assert.equal(m.validateGraphValues(v, c.fields)[f.key], value);
        }
      }
    }
  },
);

await check(
  "actual v1 decimal, generic numeric, whole-minute, UTC, date, option, URL and length rules remain exact",
  () => {
    const number = {
      key: "amount",
      label: "Amount",
      kind: "number",
      optional: true,
      options: [],
      min: 0,
      max: 1e12,
      value: null,
      hint: null,
      maxLength: 500,
    };
    for (const value of [
      "0.001",
      "1e2",
      "0x10",
      "-1",
      "Infinity",
      "1000000001",
    ])
      fails(() => m.validateGraphValues({ amount: value }, [number]));
    for (const value of ["0", ".01", "1.2", " 10.29 "])
      assert.equal(
        m.validateGraphValues({ amount: value }, [number]).amount,
        value,
      );
    assert.equal(
      m.validateGraphValues({ x: "0x10" }, [{ ...number, key: "x" }]).x,
      "0x10",
    );
    fails(() =>
      m.validateGraphValues({ minutes: "1.5" }, [
        { ...number, key: "minutes" },
      ]),
    );
    const text = { ...number, key: "start", kind: "text", optional: false };
    assert.equal(
      m.validateGraphValues({ start: " 23:59 " }, [text]).start,
      " 23:59 ",
    );
    for (const start of ["24:00", "9:30", "00:60"])
      fails(() => m.validateGraphValues({ start }, [text]));
    for (const value of ["2026-02-29", "2024-04-31", "2026-1-01"])
      fails(() =>
        m.validateGraphValues({ date: value }, [
          { ...text, key: "date", kind: "date" },
        ]),
      );
    assert.equal(
      m.validateGraphValues({ date: "2024-02-29" }, [
        { ...text, key: "date", kind: "date" },
      ]).date,
      "2024-02-29",
    );
    for (const value of [
      "http://example.invalid",
      "https://u:p@example.invalid/",
    ])
      fails(() =>
        m.validateGraphValues({ url: value }, [
          { ...text, key: "url", kind: "url" },
        ]),
      );
    fails(() =>
      m.validateGraphValues({ s: "other" }, [
        { ...text, key: "s", kind: "select", options: ["Draft"] },
      ]),
    );
    fails(() => m.validateGraphValues({ start: "x".repeat(501) }, [text]));
    fails(() => m.validateGraphValues({ start: 0 }, [text]));
  },
);

await check(
  "duplicate IDs, unselected invalid rows, source envelope dates and exact record limits fail as a whole",
  () => {
    const src = fund(),
      entries = Object.entries(src.records).filter(([, r]) => r.length),
      [key, rows] = entries[0];
    const dup = clone(src);
    dup.records[entries[1][0]][0].id = rows[0].id;
    fails(
      () => m.readProgramGraphSource(bytes(dup), src.program),
      "source_identity",
    );
    const bad = clone(src);
    bad.records[key][0].values[Object.keys(rows[0].values)[0]] = false;
    fails(() => m.readProgramGraphSource(bytes(bad), src.program));
    const limit = clone(src);
    limit.records[key] = Array.from({ length: 251 }, (_, i) => ({
      ...clone(rows[0]),
      id: "r-" + i,
    }));
    fails(
      () => m.readProgramGraphSource(bytes(limit), src.program),
      "source_limit",
    );
    const total = clone(src);
    Object.values(total.records).forEach((rs) => rs.splice(0));
    let n = 0;
    entries.slice(0, 3).forEach(([k, rs], i) => {
      total.records[k] = Array.from({ length: i < 2 ? 250 : 1 }, () => ({
        ...clone(rs[0]),
        id: "row-" + ++n,
      }));
    });
    fails(
      () => m.readProgramGraphSource(bytes(total), src.program),
      "source_limit",
    );
    for (const updated of ["not a date", "x".repeat(101), 0])
      fails(
        () => m.readProgramGraphSource(bytes({ ...src, updated }), src.program),
        "source_date",
      );
    // Legacy Date.parse assertions remain verbatim, even when not canonical graph clocks.
    const dated = { ...src, updated: "October 1, 2026" };
    assert.equal(
      m.readProgramGraphSource(bytes(dated), src.program).source.updated,
      dated.updated,
    );
  },
);

await check(
  "strict JSON refuses decoded duplicate keys, invalid UTF-8 and depth 33; string braces do not add depth",
  () => {
    for (const raw of [
      '{"a":1,"a":2}',
      '{"a":1,"\\u0061":2}',
      '{"x":{"a":0,"\\u0061":1}}',
    ])
      fails(() => m.strictProgramGraphJson(raw, 1000), "duplicate_key");
    assert.deepEqual(
      m.strictProgramGraphJson(
        '{"a":"{[\\\"\\\"]}","x":[{"a":1},{"a":2}]}',
        1000,
      ),
      JSON.parse('{"a":"{[\\\"\\\"]}","x":[{"a":1},{"a":2}]}'),
    );
    assert.ok(
      Array.isArray(
        m.strictProgramGraphJson("[".repeat(32) + "0" + "]".repeat(32), 1000),
      ),
    );
    fails(
      () =>
        m.strictProgramGraphJson("[".repeat(33) + "0" + "]".repeat(33), 1000),
      "depth",
    );
    fails(
      () =>
        m.strictProgramGraphJson(Uint8Array.of(0x7b, 0x22, 0xc3, 0x28), 1000),
      "utf8",
    );
    for (const raw of [
      '{"x":1,}',
      '{"x":1}true',
      '{"x":]',
      "[1,2",
      '"unterminated',
    ])
      fails(() => m.strictProgramGraphJson(raw, 1000));
    assert.deepEqual(
      m.strictProgramGraphJson(encoder.encode('\uFEFF{"a":1}'), 1000),
      { a: 1 },
    );
  },
);

await check(
  "UTF-8 byte admission precedes decode, clone and hashes at exact source and graph bounds",
  () => {
    const exact = '"' + "a".repeat(8_000_000 - 2) + '"';
    assert.equal(m.strictProgramGraphJson(exact, 8_000_000).length, 7_999_998);
    fails(() => m.strictProgramGraphJson(exact + " ", 8_000_000), "byte_limit");
    const compact = '"' + "a".repeat(2_097_152 - 2) + '"';
    assert.equal(
      m.strictProgramGraphJson(compact, 2_097_152).length,
      2_097_150,
    );
    fails(
      () => m.strictProgramGraphJson(compact + " ", 2_097_152),
      "byte_limit",
    );
    fails(
      () => m.strictProgramGraphJson('"' + "é".repeat(500) + '"', 1000),
      "byte_limit",
    );
    class Oversize extends Uint8Array {
      slice() {
        throw Error("oversize input was cloned before its bound");
      }
    }
    fails(
      () =>
        m.readProgramGraphSource(
          new Oversize(8_000_001),
          "the-charitology-fund",
        ),
      "byte_limit",
    );
    class FalseLength extends Oversize {
      get byteLength() {
        return 0;
      }
    }
    fails(
      () =>
        m.readProgramGraphSource(
          new FalseLength(8_000_001),
          "the-charitology-fund",
        ),
      "byte_limit",
    );
    class HostileSpecies extends Uint8Array {
      static get [Symbol.species]() {
        throw Error("Input species hook must not be invoked.");
      }
    }
    const source = fund(),
      hostile = new HostileSpecies(bytes(source));
    assert.deepEqual(
      m.readProgramGraphSource(hostile, source.program).source,
      source,
    );
  },
);

await check(
  "preview owns bytes and frozen metadata, binds whole context/inventory but excludes unselected values from graph",
  async () => {
    const state = blank(),
      source = fund();
    const rows = Object.entries(source.records)
      .flatMap(([collection, rs]) => rs.map((r) => ({ collection, ...r })))
      .sort(
        (a, b) =>
          a.collection.localeCompare(b.collection) || a.id.localeCompare(b.id),
      );
    rows.at(-1).values.title = "UNSELECTED_PRIVATE_SENTINEL";
    const input = {
      bytes: bytes(source),
      program: source.program,
      origin: { kind: "file", fileName: "synthetic.json" },
      target: null,
    };
    const p = await m.previewProgramCapture(
      state,
      input,
      await m.programGraphStateHash(state),
    );
    assert.notEqual(p.bytes, input.bytes);
    input.bytes.fill(32);
    assert.equal(p.sourceRawHash, byteHash(p.bytes));
    assert.ok(
      Object.isFrozen(p) &&
        Object.isFrozen(p.context) &&
        Object.isFrozen(p.rows),
    );
    const next = await m.applyProgramCapture(state, p, selection(p, [0]), {
      at,
      makeId: newId,
    });
    await m.validateProgramGraphState(next);
    assert.equal(next.nodes.length, 1);
    assert.equal(next.captures[0].inventory.length, rows.length);
    assert.ok(!JSON.stringify(next).includes("UNSELECTED_PRIVATE_SENTINEL"));
    assert.deepEqual(next.captures[0].context, source.context);
  },
);

await check(
  "a valid multi-megabyte old export can select a bounded graph; whole oversized candidates fail without truncation",
  async () => {
    const source = fund(),
      template = clone(source.records.proposals[0]);
    Object.values(source.records).forEach((rows) => rows.splice(0));
    source.records.proposals = Array.from({ length: 140 }, (_, i) => ({
      id: `large-${i}`,
      values: {
        ...template.values,
        mechanism: "m".repeat(5000),
        evidence: "e".repeat(5000),
        voice: "v".repeat(5000),
      },
    }));
    const original = m.partnerBackup(source),
      sourceBytes = encoder.encode(original);
    assert.ok(sourceBytes.length > 2_097_152 && sourceBytes.length < 8_000_000);
    const state = blank(),
      stateHash = await m.programGraphStateHash(state);
    const p = await m.previewProgramCapture(
      state,
      {
        bytes: sourceBytes,
        program: source.program,
        origin: { kind: "file", fileName: "synthetic-large.json" },
        target: null,
      },
      stateHash,
    );
    assert.equal(p.rows.length, 140);
    const small = await m.prepareProgramGraphCommand(
      state,
      { kind: "source.capture", preview: p, selection: selection(p, [0]) },
      { at, makeId: newId, expectedStateHash: stateHash },
    );
    assert.equal(small.nextState.nodes.length, 1);
    assert.equal(small.nextState.captures[0].inventory.length, 140);
    await rejects(
      () =>
        m.prepareProgramGraphCommand(
          state,
          {
            kind: "source.capture",
            preview: p,
            selection: selection(
              p,
              p.rows.map((r) => r.index),
            ),
          },
          { at, makeId: newId, expectedStateHash: stateHash },
        ),
      "backup_limit",
    );
    assert.equal(await m.programGraphStateHash(state), stateHash);
    assert.equal(m.partnerBackup(source), original);
  },
);

await check(
  "separate clones sharing source IDs require acknowledgement and retain different source/node identities",
  async () => {
    const source = fund(),
      first = await capture(blank(), source),
      p = await preview(first, source);
    assert.equal(p.overlap.length, 1);
    assert.equal(p.overlap[0].count, p.rows.length);
    await rejects(
      () =>
        m.applyProgramCapture(first, p, selection(p), { at, makeId: newId }),
      "clone_acknowledgement",
    );
    const next = await m.applyProgramCapture(
      first,
      p,
      selection(p, [0], { separateCopyAcknowledged: true }),
      { at, makeId: newId },
    );
    await m.validateProgramGraphState(next);
    assert.equal(next.sources.length, 2);
    assert.equal(new Set(next.nodes.map((n) => n.id)).size, 2);
    assert.equal(next.nodes[0].recordId, next.nodes[1].recordId);
    assert.notEqual(next.nodes[0].sourceId, next.nodes[1].sourceId);
  },
);

await check(
  "refresh reuses unchanged values, records whitespace provenance, context changes and missing/reappeared history",
  async () => {
    const source = fund();
    let state = await capture(blank(), source);
    const nodeId = state.nodes[0].id;
    let p = await preview(state, source, target(state));
    let next = await m.applyProgramCapture(state, p, selection(p, []), {
      at,
      makeId: newId,
    });
    assert.equal(next, state);
    const formatted = clone(p);
    formatted.bytes = encoder.encode(JSON.stringify(source, null, 2));
    p = await m.previewProgramCapture(
      state,
      {
        bytes: formatted.bytes,
        program: source.program,
        origin: p.origin,
        target: p.target,
      },
      await m.programGraphStateHash(state),
    );
    next = await m.applyProgramCapture(state, p, selection(p, []), {
      at,
      makeId: newId,
    });
    assert.equal(next.captures.length, 2);
    assert.equal(next.nodeVersions.length, 1);
    await m.validateProgramGraphState(next);
    state = next;
    source.context[Object.keys(source.context)[0]] += " changed scope";
    state = await capture(state, source, target(state), []);
    assert.equal(state.nodeVersions.length, 2);
    const n = state.nodes[0],
      saved = source.records[n.collection].find((r) => r.id === n.recordId);
    source.records[n.collection] = source.records[n.collection].filter(
      (r) => r.id !== n.recordId,
    );
    p = await preview(state, source, target(state));
    assert.deepEqual(p.missingNodeIds, [nodeId]);
    state = await capture(state, source, target(state), []);
    assert.equal(state.nodeVersions.at(-1).values, null);
    state = await capture(state, source, target(state), []);
    assert.equal(state.nodeVersions.length, 3);
    source.records[n.collection].push(saved);
    p = await preview(state, source, target(state));
    assert.equal(
      p.rows.find((r) => r.recordId === n.recordId).change,
      "reappeared",
    );
    state = await capture(state, source, target(state), []);
    assert.equal(state.nodes[0].id, nodeId);
    assert.equal(state.nodeVersions.at(-1).reappeared, true);
  },
);

await check(
  "tracked and untracked source identities cannot relocate collections within an instance",
  async () => {
    const source = fund(),
      state = await capture(blank(), source),
      entries = Object.entries(source.records).filter(([, r]) => r.length);
    const [from, rows] = entries[1],
      [to] = entries[2];
    const moved = rows.shift();
    source.records[to].push({
      id: moved.id,
      values: clone(source.records[to][0].values),
    });
    await rejects(
      () => preview(state, source, target(state)),
      "source_identity",
    );
    const initial = fund(),
      first = await capture(blank(), initial),
      otherEntries = Object.entries(initial.records).filter(
        ([, r]) => r.length,
      );
    const [oldKey, oldRows] = otherEntries.at(-1),
      original = oldRows.pop();
    const absent = await capture(first, initial, target(first), []);
    const newKey = otherEntries.find(([k]) => k !== oldKey)[0];
    initial.records[newKey].push({
      id: original.id,
      values: clone(initial.records[newKey][0].values),
    });
    await rejects(
      () => preview(absent, initial, target(absent)),
      "source_identity",
    );
  },
);

await check(
  "stale target/program/state, forged context/rows/review and mutated preview bytes cannot commit",
  async () => {
    const source = fund(),
      state = blank(),
      p = await preview(state, source);
    for (const alter of [
      (v) => (v.context[Object.keys(v.context)[0]] += "x"),
      (v) => (v.rows[0].title += "x"),
      (v) => (v.reviewHash = "f".repeat(64)),
      (v) => v.bytes.fill(32),
    ]) {
      const changed = clone(p);
      alter(changed);
      await rejects(() =>
        m.applyProgramCapture(state, changed, selection(p), {
          at,
          makeId: newId,
        }),
      );
    }
    for (const indexes of [[0, 0], [1, 0], [-1], [500], [0.5]])
      await rejects(
        () =>
          m.applyProgramCapture(state, p, selection(p, indexes), {
            at,
            makeId: newId,
          }),
        "selection",
      );
    const committed = await capture(state, source);
    await rejects(
      () =>
        m.applyProgramCapture(committed, p, selection(p), {
          at,
          makeId: newId,
        }),
      "stale_state",
    );
    const t = target(committed);
    t.expectedCaptureHash = "f".repeat(64);
    await rejects(() => preview(committed, source, t), "stale_capture");
    await rejects(
      () => preview(committed, sample("charity-incubator"), target(committed)),
      "stale_capture",
    );
  },
);

await check(
  "async input mutation and selection/preview/context changes including no-op paths are rejected",
  async () => {
    const source = fund(),
      state = blank(),
      input = {
        bytes: bytes(source),
        program: source.program,
        origin: { kind: "file", fileName: "synthetic.json" },
        target: null,
      };
    const hash = await m.programGraphStateHash(state),
      pending = m.previewProgramCapture(state, input, hash);
    input.bytes.fill(32);
    await rejects(() => pending, "input_changed");
    const p = await preview(state, source),
      choose = selection(p),
      mutable = clone(p),
      c = {
        at,
        makeId: newId,
        digest: async (b) => {
          choose.alias = "changed during await";
          return byteHash(b);
        },
      };
    await rejects(
      () => m.applyProgramCapture(state, mutable, choose, c),
      "input_changed",
    );
    const captured = await capture(state, source),
      noOp = await preview(captured, source, target(captured));
    const changed = clone(noOp),
      sel = selection(noOp, []);
    await rejects(
      () =>
        m.applyProgramCapture(captured, changed, sel, {
          at,
          makeId: newId,
          digest: async (b) => {
            changed.reviewHash = "0".repeat(64);
            return byteHash(b);
          },
        }),
      "input_changed",
    );
  },
);

await check(
  "origins use exact known key or bounded basename only; retirement resume remains explicit",
  async () => {
    const state = blank(),
      source = fund();
    for (const origin of [
      { kind: "saved-key", key: "other" },
      { kind: "file", fileName: "../private.json" },
      { kind: "file", fileName: "bad\\name.json" },
      { kind: "file", fileName: "x\n.json" },
      { kind: "file", fileName: "." },
    ])
      await rejects(() => preview(state, source, null, origin));
    const key = `charitology.partner-workspace-v1.${source.program}`;
    assert.equal(
      (await preview(state, source, null, { kind: "saved-key", key })).origin
        .key,
      key,
    );
    let s = await capture(state, source);
    s = clone(s);
    s.sources[0].retirement = {
      at,
      reason: "Fictional source retired.",
      captureId: s.sources[0].currentCaptureId,
    };
    await m.validateProgramGraphState(s);
    const p = await preview(s, source, target(s));
    await rejects(
      () =>
        m.applyProgramCapture(s, p, selection(p, []), { at, makeId: newId }),
      "resume",
    );
    const resumed = await m.applyProgramCapture(
      s,
      p,
      selection(p, [], { resumeRetired: true }),
      { at, makeId: newId },
    );
    await m.validateProgramGraphState(resumed);
    assert.equal(resumed.sources[0].retirement, null);
  },
);

await check(
  "old readers lose unknown fields or reject a new absent optional field; companion never rewrites that format",
  () => {
    const source = fund(),
      config = m.programWorkspaces[source.program],
      key = Object.keys(source.records).find((k) => source.records[k].length);
    const unknown = clone(source);
    unknown.records[key][0].values.futureRelationship =
      "not preserved by old reader";
    assert.ok(
      !Object.hasOwn(
        m.parseWorkspace(unknown, config).records[key][0].values,
        "futureRelationship",
      ),
    );
    const changed = clone(config);
    changed.collections
      .find((c) => c.key === key)
      .fields.push({
        key: "futureRelationship",
        label: "Optional future link",
        optional: true,
      });
    assert.throws(() => m.parseWorkspace(source, changed));
    fails(() => m.readProgramGraphSource(bytes(unknown), source.program));
  },
);

await check(
  "actual adapter/import modules pass strict TypeScript and adapters have no runtime legacy-config dependency",
  async () => {
    const files = [
      "src/data/program-graph-adapters.ts",
      "src/lib/client/program-graph-import.ts",
    ];
    const program = ts.createProgram(files, {
      noEmit: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
      skipLibCheck: true,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(
      diagnostics.length,
      0,
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: () => process.cwd(),
        getCanonicalFileName: (x) => x,
        getNewLine: () => "\n",
      }),
    );
    const source = await readFile(files[0], "utf8");
    assert.ok(
      !source.includes('from "./partner-') &&
        !source.includes("from './partner-"),
    );
    assert.match(source, /import type/);
  },
);
console.log(`${groups} program-graph adapter/import groups passed.`);
