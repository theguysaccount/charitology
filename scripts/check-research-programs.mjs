import assert from "node:assert/strict";
import { build } from "esbuild";
import ts from "typescript";
import path from "node:path";

// Bundle the browser module without running its DOM entry point, then test the
// same pure validators and arithmetic used by the seven program workspaces.
const result = await build({
  entryPoints: ["src/lib/client/research-programs.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const m = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
let checks = 0;
function check(label, run) {
  run();
  checks++;
}
const at = "2026-10-25T12:00:00.000Z";
const later = "2026-10-26T12:00:00.000Z";
const fields = [
  { key: "title", label: "Title", required: true },
  { key: "source", label: "Source", type: "url" },
  { key: "count", label: "Count", type: "number", min: 0, max: 100 },
  {
    key: "choice",
    label: "Choice",
    type: "select",
    options: [{ value: "a", label: "A" }],
  },
];
const config = { id: "test", title: "Test workspace", fields };
const blank = () => ({
  version: 1,
  program: "test",
  records: [],
  draft: {},
  editing: null,
});
const values = (title = "Sample") => ({
  title,
  source: "",
  count: "",
  choice: "",
});
check(
  "Research workspace module and storage helpers pass strict TypeScript",
  () => {
    const file = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(
      file.config,
      ts.sys,
      process.cwd(),
    );
    const program = ts.createProgram(
      [
        path.resolve("src/lib/client/research-programs.ts"),
        path.resolve("node_modules/astro/client.d.ts"),
      ],
      {
        ...parsed.options,
        lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
        noEmit: true,
      },
    );
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(
      diagnostics.length,
      0,
      diagnostics
        .map((d) => {
          const location =
            d.file && d.start != null
              ? d.file.getLineAndCharacterOfPosition(d.start)
              : null;
          return `${d.file?.fileName ?? ""}:${location ? location.line + 1 : ""} TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`;
        })
        .join("\n"),
    );
  },
);
check(
  "Two research writers share the prefixed key and reject stale save, import, clear and undo",
  () => {
    const previous = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
    const saved = new Map();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key) => saved.get(key) ?? null,
        setItem: (key, value) => saved.set(key, value),
      },
    });
    try {
      const a = m.researchStorage(config),
        b = m.researchStorage(config);
      assert.equal(a.key, "charitology.research-program.test.v1");
      saved.set(a.key, JSON.stringify(blank()));
      saved.set("research-program.test.v1", "unprefixed unrelated value");
      const before = a.read();
      b.read();
      const latest = m.upsertResearchRecord(
        before,
        config,
        values("Newer work in tab A"),
        at,
        "a",
      );
      a.write(latest);
      const stored = saved.get(a.key);
      const staleSave = m.upsertResearchRecord(
        before,
        config,
        values("Stale tab B"),
        later,
        "b",
      );
      const imported = m.validateResearchState(
        JSON.parse(JSON.stringify(staleSave)),
        config,
      );
      for (const attempt of [staleSave, imported, blank(), before]) {
        assert.throws(() => b.write(attempt), /Another tab changed/);
        assert.equal(
          saved.get(a.key),
          stored,
          "Newer records must survive every stale mutation path",
        );
      }
      assert.equal(
        saved.get("research-program.test.v1"),
        "unprefixed unrelated value",
      );
      assert.deepEqual(
        b.read(),
        m.validateResearchState(latest, config),
        "Explicit reload reads the newer workspace",
      );
      b.write({ ...latest, draft: values("Draft after reload") });
      assert.throws(() => a.write(before), /Another tab changed/);
    } finally {
      if (previous) Object.defineProperty(globalThis, "localStorage", previous);
      else delete globalThis.localStorage;
    }
  },
);
check(
  "Malformed research storage and failed reads never get replaced by imports or clears",
  () => {
    const previous = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
    const saved = new Map();
    let blocked = false;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem(key) {
          if (blocked) throw Error("Storage blocked");
          return saved.get(key) ?? null;
        },
        setItem(key, value) {
          if (blocked) throw Error("Storage blocked");
          saved.set(key, value);
        },
      },
    });
    try {
      for (const raw of [
        "{broken JSON",
        JSON.stringify({ ...blank(), program: "other" }),
      ]) {
        const storage = m.researchStorage(config);
        saved.set(storage.key, raw);
        assert.throws(() => storage.write(blank()), /could not be read/);
        assert.throws(() => storage.read());
        assert.throws(() => storage.write(blank()), /could not be read/);
        assert.equal(saved.get(storage.key), raw);
      }
      const storage = m.researchStorage(config);
      blocked = true;
      assert.throws(() => storage.read(), /Storage blocked/);
      blocked = false;
      assert.throws(() => storage.write(blank()), /could not be read/);
    } finally {
      if (previous) Object.defineProperty(globalThis, "localStorage", previous);
      else delete globalThis.localStorage;
    }
  },
);
check("required blanks and optional unknowns", () => {
  assert.match(m.fieldError(fields[0], "  "), /required/);
  assert.equal(m.fieldError(fields[2], ""), null);
  assert.equal(m.fieldError(fields[2], "0"), null);
});
check("URL inputs cannot become script or insecure links", () => {
  for (const value of [
    "javascript:alert(1)",
    "http://example.org",
    "example.org",
    "not a URL",
    "https://user:password@example.org",
  ])
    assert.ok(m.fieldError(fields[1], value));
  assert.equal(
    m.fieldError(fields[1], "https://example.org/study#table"),
    null,
  );
});
check("dates reject normalization and preserve valid leap days", () => {
  const date = { key: "date", label: "Date", type: "date" };
  assert.equal(m.fieldError(date, "2024-02-29"), null);
  for (const value of ["2025-02-29", "2026-02-31", "2026-13-01", "tomorrow"])
    assert.ok(m.fieldError(date, value));
});
check("numeric bounds and whole years are enforced", () => {
  for (const value of ["NaN", "Infinity", "-1", "101"])
    assert.ok(m.fieldError(fields[2], value));
  assert.ok(m.fieldError({ ...fields[2], step: "1" }, "1.5"));
  assert.equal(m.fieldError(fields[2], "0.25"), null);
  assert.ok(m.fieldError(fields[3], "unknown-choice"));
});
check("method ranges calculate scenario bounds", () => {
  assert.deepEqual(m.methodRange(100, 200, 25, 50, 10, 20), {
    expectedLow: 2.5,
    expectedHigh: 10,
    costPerLow: 10,
    costPerHigh: 80,
  });
  assert.deepEqual(m.methodRange(0, 200, 0, 100, 0, 20), {
    expectedLow: 0,
    expectedHigh: 20,
    costPerLow: 0,
    costPerHigh: null,
  });
});
check("method arithmetic rejects impossible or reversed ranges", () => {
  for (const input of [
    [1, 2, 0, 0, 10, 20],
    [1, 2, 10, 101, 10, 20],
    [2, 1, 10, 20, 10, 20],
    [1, 2, 20, 10, 10, 20],
    [1, 2, 10, 20, 20, 10],
    [-1, 2, 10, 20, 10, 20],
    [1, 2, NaN, 20, 10, 20],
  ])
    assert.equal(m.methodRange(...input), null);
});
check(
  "extreme arithmetic does not export Infinity as an outcome estimate",
  () => {
    assert.equal(m.methodRange(1e308, 1e308, 100, 100, 1e-300, 1e-300), null);
  },
);
const lenses = [
  { id: "a", priorities: { x: 5, y: 0 } },
  { id: "b", priorities: { x: 1, y: 4 } },
  { id: "c", priorities: { x: 3, y: 2 } },
];
check("lens blanks stay unknown and zero is excluded explicitly", () => {
  assert.deepEqual(
    m.weightedLensComparison(lenses, { a: "2", b: "0", c: "" }, "x", "y"),
    {
      first: 5,
      second: 0,
      included: 1,
      unknown: 1,
      equalFirst: 3,
      equalSecond: 2,
    },
  );
  assert.equal(
    m.weightedLensComparison(lenses, { a: "0", b: "", c: "0" }, "x", "y"),
    null,
  );
});
check("lens weights validate choice and arithmetic", () => {
  assert.equal(m.weightedLensComparison(lenses, { a: "6" }, "x", "y"), null);
  assert.equal(m.weightedLensComparison(lenses, { a: "-1" }, "x", "y"), null);
  assert.equal(m.weightedLensComparison(lenses, { a: "NaN" }, "x", "y"), null);
  assert.equal(m.weightedLensComparison(lenses, { a: "1" }, "x", "x"), null);
  assert.equal(
    m.weightedLensComparison(lenses, { a: "1" }, "x", "missing"),
    null,
  );
  const weighted = m.weightedLensComparison(
    lenses,
    { a: "1", b: "3", c: "0" },
    "x",
    "y",
  );
  assert.equal(weighted.first, 2);
  assert.equal(weighted.second, 3);
});
check("create and edit preserve identity and original date", () => {
  const initial = blank();
  const saved = m.upsertResearchRecord(
    initial,
    config,
    { ...values(), count: "0" },
    at,
    "one",
  );
  assert.equal(initial.records.length, 0);
  assert.equal(saved.records[0].values.count, "0");
  const editing = m.editResearchRecord(saved, "one");
  assert.equal(editing.editing, "one");
  assert.equal(saved.editing, null);
  editing.draft.title = "Changed";
  assert.equal(saved.records[0].values.title, "Sample");
  const updated = m.upsertResearchRecord(
    editing,
    config,
    { ...values("Changed"), count: "0" },
    later,
    "ignored-new-id",
  );
  assert.equal(updated.records.length, 1);
  assert.equal(updated.records[0].id, "one");
  assert.equal(updated.records[0].createdAt, at);
  assert.equal(updated.records[0].updatedAt, later);
  assert.equal(updated.editing, null);
});
check("frozen replication records fork instead of mutating", () => {
  const saved = m.upsertResearchRecord(blank(), config, values(), at, "one");
  const frozen = { ...config, freeze: true };
  const fork = m.editResearchRecord(saved, "one", true);
  assert.equal(fork.editing, null);
  const added = m.upsertResearchRecord(
    fork,
    frozen,
    values("Amendment"),
    later,
    "two",
  );
  assert.equal(added.records.length, 2);
  assert.equal(added.records[0].values.title, "Sample");
  assert.equal(
    m.upsertResearchRecord(saved, frozen, values(), later, "one"),
    null,
  );
});
check(
  "deleting edited records clears draft without mutating undo snapshot",
  () => {
    const saved = m.upsertResearchRecord(blank(), config, values(), at, "one");
    const editing = m.editResearchRecord(saved, "one");
    const snapshot = structuredClone(editing);
    const deleted = m.deleteResearchRecord(editing, "one");
    assert.equal(deleted.records.length, 0);
    assert.equal(deleted.editing, null);
    assert.deepEqual(deleted.draft, {});
    assert.equal(snapshot.records.length, 1);
    assert.equal(snapshot.editing, "one");
    assert.equal(m.editResearchRecord(saved, "absent"), null);
  },
);
check("save rejects incomplete records and limits capacity", () => {
  assert.equal(
    m.upsertResearchRecord(blank(), config, values(""), at, "one"),
    null,
  );
  const full = {
    ...blank(),
    records: Array.from({ length: 200 }, (_, i) => ({
      id: String(i),
      createdAt: at,
      updatedAt: at,
      values: values(),
    })),
  };
  assert.equal(m.upsertResearchRecord(full, config, values(), at, "new"), null);
  full.editing = "0";
  assert.equal(
    m.upsertResearchRecord(full, config, values("Edited"), later, "new").records
      .length,
    200,
  );
});
check("import preserves unfinished drafts and sanitizes unknown fields", () => {
  const raw = {
    ...blank(),
    draft: { source: "https://unfinished", count: "-", extra: "remove" },
    rogue: "remove",
  };
  const valid = m.validateResearchState(raw, config);
  assert.equal(valid.draft.count, "-");
  assert.equal(valid.draft.source, "https://unfinished");
  assert.equal(valid.draft.extra, undefined);
  assert.equal(valid.rogue, undefined);
  assert.equal(
    m.validateResearchState({ ...raw, program: "other" }, config),
    null,
  );
  assert.equal(m.validateResearchState({ ...raw, version: 2 }, config), null);
});
check(
  "import rejects invalid saved data, duplicate ids and excessive records",
  () => {
    const saved = m.upsertResearchRecord(blank(), config, values(), at, "one");
    assert.ok(m.validateResearchState(saved, config));
    for (const patch of [
      { source: "javascript:alert(1)" },
      { count: "-1" },
      { choice: "bogus" },
      { title: "" },
    ]) {
      const raw = structuredClone(saved);
      Object.assign(raw.records[0].values, patch);
      assert.equal(m.validateResearchState(raw, config), null);
    }
    assert.equal(
      m.validateResearchState(
        { ...saved, records: [saved.records[0], saved.records[0]] },
        config,
      ),
      null,
    );
    assert.equal(
      m.validateResearchState(
        { ...saved, records: Array(201).fill(saved.records[0]) },
        config,
      ),
      null,
    );
    assert.equal(
      m.validateResearchState({ ...saved, draft: [] }, config),
      null,
    );
  },
);
check("comparison cross checks also apply to imported saved records", () => {
  const comparison = {
    id: "history-of-charity",
    title: "History",
    fields: [
      { key: "first", label: "First" },
      { key: "second", label: "Second" },
    ],
  };
  assert.ok(
    m.researchCrossError(comparison, { first: "same", second: "same" }),
  );
  assert.equal(
    m.validateResearchState(
      {
        ...blank(),
        program: comparison.id,
        records: [
          {
            id: "one",
            createdAt: at,
            updatedAt: at,
            values: { first: "same", second: "same" },
          },
        ],
      },
      comparison,
    ),
    null,
  );
  assert.ok(
    m.researchCrossError(
      { id: "methods-lab" },
      { costLow: "2", costHigh: "1" },
    ),
  );
  assert.equal(
    m.researchCrossError(
      { id: "methods-lab" },
      {
        costLow: "0",
        costHigh: "0",
        probabilityLow: "",
        probabilityHigh: "",
        unitsLow: "",
        unitsHigh: "",
      },
    ),
    null,
  );
});
check(
  "exports retain zero, multiline notes and spreadsheet formula protection",
  () => {
    const csv = m.researchCsv([
      {
        title: "=SUM(1,2)",
        count: "0",
        text: "two\nlines",
        other: " @command",
      },
    ]);
    assert.ok(csv.includes("'=SUM(1,2)"));
    assert.ok(csv.includes("' @command"));
    assert.ok(csv.includes("0"));
    assert.ok(csv.includes('"two\nlines"'));
    const memo = m.researchMarkdown(
      { ...config, freeze: true },
      { ...blank(), draft: { ...values(), count: "0" } },
    );
    assert.match(memo, /not a public registration/);
    assert.match(memo, /Current draft/);
    assert.match(memo, /Count\n\n0/);
  },
);
console.log(`Research program models: ${checks} checks passed.`);
