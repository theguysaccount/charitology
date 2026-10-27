// Actual gift calculations, fixed async D1 clients and strict inline scripts. Synthetic local data only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import ts from "typescript";
import { donorFixtures } from "../test-fixtures/donor-recovery/factory.mjs";
const result = await build({
  stdin: {
    contents: `export * from './src/lib/client/gifts.ts'; export * from './src/lib/client/donor-recovery.ts'; export { splitWhole } from './src/lib/client/split.ts';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const m = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
let groups = 0;
async function check(label, run) {
  try {
    await run();
    groups++;
  } catch (error) {
    error.message = `${label}: ${error.message}`;
    throw error;
  }
}
const gift = (changes = {}) => ({
  id: "synthetic",
  date: "2026-01-01",
  organization: "Synthetic example",
  amount: 10,
  cause: "other",
  depth: null,
  ...changes,
});
await check(
  "known gifts retain unknown depth while explicit relief remains zero",
  () => {
    for (const depth of [null, undefined, "", "unknown", "unclassified"])
      assert.equal(m.sanitizeGift(gift({ depth })).depth, null);
    assert.equal(m.sanitizeGift(gift({ depth: 0 })).depth, 0);
    for (const depth of [-1, 5, Infinity, "not a level", {}, []])
      assert.equal(m.sanitizeGift(gift({ depth })), undefined);
    assert.equal(m.sanitizeGift(gift({ amount: 0 })), undefined);
    assert.equal(m.sanitizeGift(gift({ date: "2026-02-30" })), undefined);
  },
);
await check(
  "JSON and CSV round trips retain unclassified gifts and old numeric-depth records",
  () => {
    const rows = [
      gift(),
      gift({ id: "relief", depth: 0 }),
      gift({ id: "source", depth: 4 }),
    ];
    assert.deepEqual(
      m.parseGiftFile(m.giftsToJson(rows), "gifts.json").gifts,
      rows,
    );
    assert.deepEqual(
      m.parseGiftFile(m.giftsToCsv(rows), "gifts.csv").gifts,
      rows,
    );
    const imported = m.parseGiftFile(
      "date,organization,amount\n2026-01-01,Synthetic example,25\n",
      "gifts.csv",
    );
    assert.equal(imported.gifts.length, 1);
    assert.equal(imported.gifts[0].depth, null);
    assert.equal(imported.skipped, 0);
  },
);
await check(
  "total/cause/source denominators retain every dollar and classification coverage is separate",
  () => {
    const summary = m.summarize([
      gift({ amount: 50 }),
      gift({ id: "relief", amount: 150, depth: 0 }),
      gift({ id: "source", amount: 100, depth: 4 }),
    ]);
    assert.equal(summary.total, 300);
    assert.equal(summary.count, 3);
    assert.equal(summary.unclassified, 50);
    assert.equal(summary.unclassifiedCount, 1);
    assert.equal(summary.classified, 250);
    assert.deepEqual(summary.byDepth, [150, 0, 0, 0, 100]);
    assert.equal(summary.sourceShare, 1 / 3);
    const percents = m.splitWhole(100, [
      ...summary.shares,
      summary.unclassified / summary.total,
    ]);
    assert.equal(
      percents.reduce((a, b) => a + b, 0),
      100,
    );
    assert.ok(percents[5] > 0);
    assert.equal(percents[0], 50);
    const unknown = m.summarize([gift()]);
    assert.equal(unknown.total, 10);
    assert.equal(unknown.unclassified, 10);
    assert.deepEqual(unknown.byDepth, [0, 0, 0, 0, 0]);
    assert.ok(Number.isNaN(m.summarize([]).sourceShare));
  },
);
await check(
  "the gift reader preserves exact saved IDs, refuses corrupt producer data and never writes",
  async () => {
    const fixtures = donorFixtures();
    const raw = JSON.stringify(fixtures.gifts);
    let stored = raw;
    const writes = [];
    globalThis.localStorage = {
      getItem: (key) => (key === "charitology.gifts" ? stored : null),
      setItem: (...args) => writes.push(args),
      removeItem: (...args) => writes.push(args),
    };
    const read = await m.loadGifts();
    assert.equal(read.code, "saved");
    assert.deepEqual(read.value, fixtures.gifts);
    assert.equal(writes.length, 0);
    stored = JSON.stringify([fixtures.gifts[0], fixtures.gifts[0]]);
    assert.equal((await m.loadGifts()).code, "corrupt");
    assert.equal(writes.length, 0);
    stored = "{bad";
    assert.equal((await m.loadGifts()).code, "corrupt");
    assert.equal(writes.length, 0);
  },
);
await check(
  "gift persistence is an awaited actual writer result and failed retry never regenerates or inserts an ID",
  async () => {
    const values = new Map();
    let failed = false;
    const storage = {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => {
        if (failed) throw Error("synthetic quota");
        values.set(k, v);
      },
      removeItem: (k) => values.delete(k),
    };
    const locks = { request: async (_k, _o, action) => action() };
    const view = m.createD1ViewTracker(),
      session = await m.openD1ToolSession("gifts", { view, storage, locks });
    const gifts = donorFixtures().gifts;
    view.changedForm();
    failed = true;
    const outcome = await m.saveGifts(session, gifts);
    assert.equal(outcome.outcome, "unsaved");
    assert.equal(values.size, 0);
    failed = false;
    await session.retryPersist();
    assert.deepEqual(JSON.parse(values.get("charitology.gifts")), gifts);
    assert.equal(JSON.parse(values.get("charitology.gifts")).length, 1);
    session.dispose();
    view.dispose();
  },
);
const matchScripts = (text) =>
  [...text.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .join("\n");
await check(
  "actual older tool modules and new storage pass strict TypeScript",
  () => {
    const names = [
      "giving-dashboard",
      "charitology-wrapped",
      "cost-effectiveness-model-kit",
      "disaster-response-guide",
      "due-diligence-checklist",
      "gift-giving",
      "grant-evaluator",
      "impact-measurement-toolkit",
      "legacy-planner",
      "one-click-split",
      "portfolio-builder",
      "values-compass",
    ];
    const virtual = new Map();
    for (const name of names) {
      const file = path.resolve(`src/components/tools/${name}.astro`),
        text = fs.readFileSync(file, "utf8");
      let i = 0;
      for (const match of text.matchAll(/<script>([\s\S]*?)<\/script>/g))
        virtual.set(`${file}.donor-${i++}.ts`, `${match[1]}\nexport {};`);
      assert.match(
        text,
        /donor-recovery['"]/,
        `${name} uses the fixed async facade`,
      );
      assert.doesNotMatch(
        matchScripts(text),
        /durable-store|validateToolStorage|canPersist\(/,
        `${name} has no synchronous write bypass`,
      );
      assert.match(
        text,
        /mountD1(?:Grant)?RecoveryControls/,
        `${name} mounts shared recovery controls`,
      );
    }
    const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile),
      parsed = ts.parseJsonConfigFileContent(
        config.config,
        ts.sys,
        process.cwd(),
      );
    const options = {
      ...parsed.options,
      lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
      noEmit: true,
    };
    const host = ts.createCompilerHost(options),
      get = host.getSourceFile.bind(host),
      exists = host.fileExists.bind(host),
      readFile = host.readFile.bind(host);
    host.getSourceFile = (name, language, onError, create) =>
      virtual.has(name)
        ? ts.createSourceFile(name, virtual.get(name), language, true)
        : get(name, language, onError, create);
    host.fileExists = (name) => virtual.has(name) || exists(name);
    host.readFile = (name) => virtual.get(name) ?? readFile(name);
    const program = ts.createProgram(
      [
        ...virtual.keys(),
        path.resolve("src/lib/client/donor-recovery.ts"),
        path.resolve("node_modules/astro/client.d.ts"),
      ],
      options,
      host,
    );
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(
      diagnostics.length,
      0,
      diagnostics
        .map(
          (d) =>
            `${d.file?.fileName ?? ""}:${d.start == null ? "" : d.file.getLineAndCharacterOfPosition(d.start).line + 1} ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`,
        )
        .join("\n"),
    );
  },
);
console.log(
  `✓ Donor records: ${groups} groups passed (nullable depth, fixed async gift reader/writer and twelve strict actual scripts).`,
);
