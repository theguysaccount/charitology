// Executes the real mounted controller with a bounded DOM fixture. Layout/browser proof is separate.
import assert from "node:assert/strict";
import { build } from "esbuild";
import ts from "typescript";
import postcss from "postcss";
import { transform } from "@astrojs/compiler";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  Element,
  installArtifactDom,
  settleArtifactUi,
} from "../test-fixtures/artifact-results/ui-dom.mjs";
import {
  at,
  source,
  withGraph,
  command,
  node,
  linkCommand,
  capture as captureModel,
} from "../test-fixtures/program-graph/factory.mjs";
const result = await build({
  stdin: {
    contents:
      "export * from './src/lib/client/program-graph-ui.ts';export * from './src/lib/client/program-graph-ui-helpers.ts';export * from './src/lib/client/program-graph-model.ts';export * from './src/lib/client/program-graph-import.ts';export {rawStorageRecoveryDownload} from './src/lib/client/raw-storage-recovery.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  logLevel: "silent",
});
const temporary = await mkdtemp(
  join(tmpdir(), "charitology-program-graph-ui-"),
);
const bundle = join(temporary, "actual-ui.mjs");
await writeFile(bundle, result.outputFiles[0].text);
process.on("exit", () => {
  void rm(temporary, { recursive: true, force: true });
});
const m = await import(pathToFileURL(bundle));
const key = "charitology.program-graph.v1";
let groups = 0;
Element.prototype.replaceChildren = function (...children) {
  this.textContent = "";
  this.append(...children);
};
const check = async (name, run) => {
  await run();
  groups++;
  console.log("✓ " + name);
};
function dom(saved = null, options = {}) {
  const d = installArtifactDom(null, options);
  d.root.dataset.initialProgram = options.program ?? "the-charitology-fund";
  d.root.querySelector(".artifact-results-mount").className =
    "program-graph-mount";
  if (saved !== null)
    d.values.set(
      key,
      typeof saved === "string" ? saved : JSON.stringify(saved),
    );
  return d;
}
const settle = settleArtifactUi;
async function click(d, label) {
  const b = d.findButton(label);
  assert.ok(b, "Button: " + label);
  assert.equal(b.disabled, false, "Enabled: " + label);
  await b.click();
  await settle(
    () => d.root.querySelector(".pg-status")?.textContent !== "Working…",
  );
}
async function set(d, label, value, event = "input") {
  const f = d.field(label);
  assert.ok(f, "Field: " + label);
  if (typeof value === "boolean") f.checked = value;
  else f.value = value;
  await f.fire(event);
}
async function file(d, label, text, name = "fictional.json") {
  const f = d.field(label);
  assert.ok(f, label);
  const bytes = new TextEncoder().encode(text);
  f.files = [
    { name, size: bytes.length, arrayBuffer: async () => bytes.buffer },
  ];
  await f.fire("change");
  await settle(
    () => d.root.querySelector(".pg-status")?.textContent !== "Working…",
  );
}
const saved = (d) => JSON.parse(d.values.get(key));
async function fileCapture(d, data) {
  await click(d, "Import");
  await file(d, "Choose original program workspace JSON", JSON.stringify(data));
  await set(
    d,
    "I reviewed the complete source context and inventory, including missing rows. This is the complete chosen copy, not a filtered export.",
    true,
    "change",
  );
  await click(d, "Commit reviewed capture");
}
async function downloadText(d, label) {
  const n = d.downloads.length;
  await click(d, label);
  assert.equal(d.downloads.length, n + 1);
  return d.downloads.at(-1).blob.text();
}

await check(
  "actual UI and shared model/store/import modules pass strict TypeScript",
  () => {
    const p = ts.createProgram(
      [
        "src/lib/client/program-graph-ui.ts",
        "src/lib/client/program-graph-ui-helpers.ts",
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
  "actual Astro shell compiles with explicit known-program mounting and recovery",
  async () => {
    const text = await readFile("src/components/ProgramGraph.astro", "utf8");
    const compiled = await transform(text, {
      filename: "src/components/ProgramGraph.astro",
      renderScript: true,
    });
    assert.deepEqual(
      compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 1),
      [],
    );
    assert.ok(text.includes("data-initial-program={initialProgram}"));
    assert.ok(text.includes("program-graph-mount"));
    assert.ok(text.includes("No source workspace was read or changed."));
  },
);
await check(
  "light/dark controls resolve site tokens with readable text contrast",
  async () => {
    const global = postcss.parse(
        await readFile("src/styles/global.css", "utf8"),
      ),
      local = postcss.parse(
        await readFile("src/styles/program-graph.css", "utf8"),
      );
    const defs = (tree, selector) => {
      const v = {};
      tree.walkRules((r) => {
        if (r.selector === selector) r.walkDecls((d) => (v[d.prop] = d.value));
      });
      return v;
    };
    const lum = (h) => {
      assert.match(h, /^#[a-f0-9]{6}$/i);
      const c = [1, 3, 5]
        .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
    };
    for (const theme of [
      defs(global, ":root"),
      { ...defs(global, ":root"), ...defs(global, ":root[data-theme='dark']") },
    ]) {
      const resolve = (v) =>
        v.replace(/var\((--[a-z0-9-]+)\)/g, (_, k) => resolve(theme[k]));
      const contrast = (a, b) => {
        const l = [lum(resolve(a)), lum(resolve(b))].sort((a, b) => b - a);
        assert.ok((l[0] + 0.05) / (l[1] + 0.05) >= 4.5, `${a} on ${b}`);
      };
      contrast("var(--ink)", "var(--surface)");
      contrast("var(--ink-2)", "var(--surface)");
      for (const selector of [
        ".program-graph .pg-button",
        ".program-graph .pg-primary:hover",
      ]) {
        const d = defs(local, selector);
        contrast(d.color, d.background);
      }
      contrast("var(--on-accent)", "var(--accent)");
      contrast("var(--ink)", "var(--highlight)");
    }
    assert.match(local.toString(), /min\(100%,\s*17rem\)/);
    assert.match(local.toString(), /overflow-wrap:\s*anywhere/);
  },
);
await check(
  "raw JSON preserves blank errors and bounded file read refuses oversize before access",
  async () => {
    assert.throws(
      () => m.graphRawJson("", m.graphIndexes),
      /empty value is not null/,
    );
    assert.deepEqual(m.graphRawJson("[]", m.graphIndexes), []);
    let read = false;
    await assert.rejects(() =>
      m.readGraphFile({
        size: 8_000_001,
        arrayBuffer() {
          read = true;
          throw Error();
        },
      }),
    );
    assert.equal(read, false);
    assert.equal(
      m.graphPage(
        Array.from({ length: 51 }, (_, i) => i),
        99,
      ).page,
      2,
    );
  },
);
await check(
  "mount is idempotent, exposes seven tabs, and reads no source key on boot",
  async () => {
    const d = dom();
    await m.mountProgramGraph(d.root);
    const count = d.root.querySelectorAll("button").length;
    await m.mountProgramGraph(d.root);
    assert.equal(d.root.querySelectorAll("button").length, count);
    for (const name of [
      "Sources",
      "Records",
      "Links",
      "Connected",
      "Import",
      "Exports",
      "Recovery",
    ])
      assert.ok(d.findButton(name));
    assert.ok(d.reads.length > 0);
    assert.ok(d.reads.every((value) => value === key));
    assert.equal(d.values.has(key), false);
  },
);
await check(
  "explicit saved-source capture reads only this known page key and preserves exact source bytes",
  async () => {
    const d = dom(),
      data = source(m),
      sourceKey = m.programGraphSourceKey("the-charitology-fund"),
      raw = JSON.stringify(data);
    d.values.set(sourceKey, raw);
    d.values.set(m.programGraphSourceKey("charity-incubator"), "DO NOT READ");
    await m.mountProgramGraph(d.root);
    await click(d, "Import");
    await click(d, "Preview this page’s saved workspace");
    assert.ok(d.root.textContent.includes("Complete capture preview"));
    await set(
      d,
      "I reviewed the complete source context and inventory, including missing rows. This is the complete chosen copy, not a filtered export.",
      true,
      "change",
    );
    await click(d, "Commit reviewed capture");
    assert.equal(saved(d).nodes.length, 5);
    assert.equal(d.values.get(sourceKey), raw);
    assert.ok(!d.reads.includes(m.programGraphSourceKey("charity-incubator")));
  },
);
await check(
  "changed saved-source bytes fail commit and retain selected bytes and raw form",
  async () => {
    const d = dom(),
      data = source(m),
      sourceKey = m.programGraphSourceKey("the-charitology-fund");
    d.values.set(sourceKey, JSON.stringify(data));
    await m.mountProgramGraph(d.root);
    await click(d, "Import");
    await click(d, "Preview this page’s saved workspace");
    d.values.set(sourceKey, JSON.stringify({ ...data, updated: "" }));
    await set(
      d,
      "I reviewed the complete source context and inventory, including missing rows. This is the complete chosen copy, not a filtered export.",
      true,
      "change",
    );
    await click(d, "Commit reviewed capture");
    assert.equal(d.values.has(key), false);
    assert.ok(d.root.textContent.includes("saved source changed"));
    assert.ok(d.findButton("Download selected source bytes unchanged"));
    const raw = await downloadText(d, "Download unfinished raw form");
    assert.ok(raw.includes("sourceRawHash"));
    assert.ok(raw.includes("NOT a validated graph backup"));
  },
);
await check(
  "file capture validates whole inventory, records exact context and clears only matching transient form",
  async () => {
    const d = dom(),
      data = source(m);
    data.context[Object.keys(data.context)[0]] = " Exact scope with spaces ";
    await m.mountProgramGraph(d.root);
    await fileCapture(d, data);
    const s = saved(d);
    assert.equal(s.sources.length, 1);
    assert.equal(s.nodes.length, 5);
    assert.equal(
      s.captures[0].context[Object.keys(data.context)[0]],
      " Exact scope with spaces ",
    );
    assert.equal(
      d.findButton("Download selected source bytes unchanged"),
      undefined,
    );
    assert.equal(d.findButton("Download unfinished raw form"), undefined);
  },
);
await check(
  "unknown unselected source fields reject without assigning graph or losing raw recovery",
  async () => {
    const d = dom(),
      data = source(m);
    data.records.readiness[0].values.futurePrivateField =
      "Fictional unsupported field";
    await m.mountProgramGraph(d.root);
    await click(d, "Import");
    await file(
      d,
      "Choose original program workspace JSON",
      JSON.stringify(data),
    );
    assert.equal(d.values.has(key), false);
    assert.ok(d.root.querySelector(".pg-status").textContent);
    await click(d, "Rebuild preview for this source choice").catch(() => {}); // readable chosen bytes remain recoverable
    assert.ok(d.findButton("Download selected source bytes unchanged"));
  },
);
await check(
  "exact refresh no-op keeps raw capture and file warning, including after saving form",
  async () => {
    const s = await withGraph(m),
      d = dom(s),
      data = source(m);
    await m.mountProgramGraph(d.root);
    await click(d, "Import");
    await set(d, "Capture as", s.sources[0].id, "change");
    await file(
      d,
      "Choose original program workspace JSON",
      JSON.stringify(data, null, 2),
      "fictional-source.json",
    );
    await set(
      d,
      "I reviewed the complete source context and inventory, including missing rows. This is the complete chosen copy, not a filtered export.",
      true,
      "change",
    );
    await click(d, "Commit reviewed capture");
    assert.equal(saved(d).captures.length, 1);
    assert.ok(d.findButton("Download selected source bytes unchanged"));
    assert.ok(d.findButton("Download unfinished raw form"));
    let prevented = 0;
    await d.window.fire("beforeunload", {
      preventDefault() {
        prevented++;
      },
    });
    assert.equal(prevented, 1);
    await click(d, "Save unfinished form in graph");
    assert.ok(saved(d).draft.form);
    prevented = 0;
    await d.window.fire("beforeunload", {
      preventDefault() {
        prevented++;
      },
    });
    assert.equal(prevented, 1);
  },
);
await check(
  "partial malformed rename form survives mount/save/export with original binding unchanged",
  async () => {
    let s = await withGraph(m);
    s = await command(m, s, {
      kind: "draft.replace",
      draft: {
        tab: "sources",
        sourceId: s.sources[0].id,
        nodeId: null,
        dirty: true,
        form: {
          kind: "rename-source",
          targetId: null,
          binding: { sourceId: "malformed original binding" },
          fields: { alias: "  unfinished alias  " },
        },
      },
    });
    const d = dom(s);
    await m.mountProgramGraph(d.root);
    await click(d, "Save unfinished form in graph");
    assert.equal(
      saved(d).draft.form.binding.sourceId,
      "malformed original binding",
    );
    assert.equal(saved(d).draft.form.targetId, null);
    assert.equal(saved(d).draft.form.fields.alias, "  unfinished alias  ");
    const text = await downloadText(d, "Download unfinished raw form");
    assert.ok(text.includes("malformed original binding"));
  },
);
await check(
  "new relation binds exact copies, stale refresh remains explicit, and selected packet excludes raw draft",
  async () => {
    const s = await withGraph(m),
      d = dom(s);
    await m.mountProgramGraph(d.root);
    await click(d, "Links");
    await click(d, "Start a new link");
    await set(d, "From record", node(s, "allocations").id, "change");
    await set(d, "To record", node(s, "proposals").id, "change");
    await set(d, "Relationship kind", "decision-note-for", "change");
    await click(d, "Bind and inspect current endpoint versions");
    await set(
      d,
      "Reason for this exact relationship review",
      "Fictional planning explanation; no real approval.",
    );
    await click(d, "Record new link");
    assert.equal(saved(d).links.length, 1);
    assert.equal(m.programGraphCounts(saved(d)).current, 1);
    assert.equal(
      saved(d).linkVersions[0].fromVersionId,
      node(s, "allocations").currentVersionId,
    );
    await click(d, "Exports");
    const title = saved(d).nodes[0];
    await set(
      d,
      "Include record: " +
        (() => {
          const n = title,
            src = s.sources[0],
            v = m.programGraphNodeView(s, n.id);
          return `${src.alias} · ${n.collection} · ${v.current.values.title} [${n.recordId}]`;
        })(),
      true,
      "change",
    );
    await click(d, "Review selected packet");
    const csv = await downloadText(d, "Download selected CSV packet");
    assert.ok(csv.includes(title.recordId));
    assert.ok(!csv.includes("unfinished alias"));
    const backup = await downloadText(d, "Download complete graph JSON backup");
    assert.equal((await m.parseProgramGraphBackup(backup)).links.length, 1);
  },
);
await check(
  "stale pinned review stays on old versions after another-tab change instead of rebinding",
  async () => {
    let s = await withGraph(m);
    s = await command(
      m,
      s,
      linkCommand(
        m,
        s,
        node(s, "allocations"),
        node(s, "proposals"),
        "decision-note-for",
      ),
    );
    const d = dom(s);
    await m.mountProgramGraph(d.root);
    await click(d, "Links");
    await click(d, "Inspect link " + s.links[0].id);
    await click(d, "Review against current copies");
    const pinned = d.field("binding.fromVersionId"); // raw field remains inspectable
    const oldForm = await downloadText(d, "Download unfinished raw form");
    let changed = structuredClone(source(m));
    changed.records.allocations[0].values.title = "Fictional newer copy";
    const next = await captureModel(m, s, changed, {
      sourceId: s.sources[0].id,
    });
    d.values.set(key, JSON.stringify(next));
    await d.window.fire("storage", { key });
    assert.ok(d.root.textContent.includes("Another tab changed"));
    const still = await downloadText(d, "Download unfinished raw form");
    assert.equal(still, oldForm);
    assert.equal(
      d.findButton("Record review of exact versions").disabled,
      true,
    );
    assert.ok(pinned);
  },
);
await check(
  "missing/corrupt data never invents empty counts and recovery controls remain enabled",
  async () => {
    const d = dom("{not valid");
    await m.mountProgramGraph(d.root);
    assert.ok(d.root.textContent.includes("No validated graph"));
    assert.ok(!d.root.textContent.includes("0 source copies"));
    assert.equal(d.findButton("Preview clearing this graph").disabled, false);
    assert.equal(
      await downloadText(d, "Download protected saved bytes unchanged"),
      "{not valid",
    );
    await click(d, "Preview clearing this graph");
    assert.ok(d.findButton("Confirm clear of companion graph"));
  },
);
await check(
  "shared raw-storage helper preserves exact malformed UTF-16 and leaves valid UTF-8 unchanged",
  async () => {
    for (const text of [
      "ordinary text",
      "paired 😀 and 漢",
      "",
      "high " + String.fromCharCode(0xd800),
      "low " + String.fromCharCode(0xdc00),
      String.fromCharCode(0xd800, 0xd800),
      String.fromCharCode(0xd800) + "x",
    ]) {
      const result = m.rawStorageRecoveryDownload(text),
        blob = new Blob([result.text]);
      if (result.wrapped) {
        assert.equal(JSON.parse(await blob.text()).raw, text);
        assert.equal(
          JSON.parse(result.text).format,
          "charitology-raw-storage-text-recovery",
        );
        assert.ok(!result.text.includes(String.fromCharCode(0xfffd)));
      } else {
        assert.equal(result.text, text);
        assert.equal(await blob.text(), text);
        assert.deepEqual(
          new Uint8Array(await blob.arrayBuffer()),
          new TextEncoder().encode(text),
        );
      }
    }
  },
);
await check(
  "corrupt original A and unseen valid B have distinct byte-exact downloads and a B preview cannot remove later C",
  async () => {
    const corrupt = "{fictional corrupt A " + String.fromCharCode(0xd800),
      b = JSON.stringify(await withGraph(m)),
      c = b + " ",
      d = dom(corrupt);
    await m.mountProgramGraph(d.root);
    d.values.set(key, b);
    await click(d, "Preview clearing this graph");
    assert.equal(d.values.get(key), b);
    assert.ok(d.root.textContent.includes("Another tab changed"));
    assert.equal(d.findButton("Confirm clear of companion graph"), undefined);
    const protectedText = await downloadText(
      d,
      "Download protected saved bytes unchanged",
    );
    assert.equal(JSON.parse(protectedText).raw, corrupt);
    assert.ok(!protectedText.includes(String.fromCharCode(0xfffd)));
    const observed = await downloadText(d, "Download last observed saved text");
    assert.equal(observed, b);
    assert.deepEqual(
      new Uint8Array(await d.downloads.at(-1).blob.arrayBuffer()),
      new TextEncoder().encode(b),
    );
    await click(d, "Preview clearing this graph");
    assert.ok(d.findButton("Confirm clear of companion graph"));
    d.values.set(key, c);
    await click(d, "Confirm clear of companion graph");
    assert.equal(d.values.get(key), c);
    assert.ok(d.root.textContent.includes("Another tab changed"));
    assert.equal(await downloadText(d, "Download last observed saved text"), c);
    assert.equal(
      JSON.parse(
        await downloadText(d, "Download protected saved bytes unchanged"),
      ).raw,
      corrupt,
    );
  },
);
await check(
  "failed persistence retains valid memory and truthful recovery acknowledgement",
  async () => {
    const d = dom(null, { failWrite: true });
    await m.mountProgramGraph(d.root);
    await fileCapture(d, source(m));
    assert.equal(d.values.has(key), false);
    assert.ok(
      d.root.textContent.includes("only in this tab") ||
        d.root.textContent.includes("only in memory"),
    );
    await click(d, "Recovery");
    assert.ok(d.findButton("Retry saving current valid memory"));
    await click(d, "Preview clearing this graph");
    await click(d, "Confirm clear of companion graph");
    assert.ok(
      d.root.querySelector(".pg-status").textContent.includes("only in memory"),
    );
  },
);
await check(
  "bad reload preserves valid memory/raw form and does not claim saved bytes validated",
  async () => {
    const s = await withGraph(m),
      d = dom(s);
    await m.mountProgramGraph(d.root);
    await click(d, "Sources");
    await click(d, "Inspect source " + s.sources[0].alias);
    await click(d, "Rename source alias");
    await set(d, "New display alias", "Fictional unsaved alias");
    d.values.set(key, "{corrupt");
    await click(d, "Recovery");
    await click(d, "Review reload from browser copy");
    await click(d, "Continue and replace unfinished form");
    assert.ok(
      !d.root
        .querySelector(".pg-status")
        .textContent.includes("reloaded and validated"),
    );
    assert.ok(d.root.textContent.includes("5 tracked records"));
    assert.ok(
      (await downloadText(d, "Download unfinished raw form")).includes(
        "Fictional unsaved alias",
      ),
    );
  },
);
await check(
  "undo removes transient file authority and restored capture requires fresh source selection",
  async () => {
    const s = await withGraph(m),
      d = dom(s);
    await m.mountProgramGraph(d.root);
    await click(d, "Import");
    await set(d, "Capture as", s.sources[0].id, "change");
    await file(
      d,
      "Choose original program workspace JSON",
      JSON.stringify(source(m), null, 2),
      "fictional-source.json",
    );
    await click(d, "Save unfinished form in graph");
    await click(d, "Recovery");
    await click(d, "Undo last graph change");
    await click(d, "Continue and replace unfinished form");
    assert.equal(
      d.findButton("Download selected source bytes unchanged"),
      undefined,
    );
    await click(d, "Import");
    assert.equal(d.findButton("Commit reviewed capture"), undefined);
  },
);
await check(
  "two-hop connected view is bounded without truncating the canonical graph",
  async () => {
    let s = await withGraph(m);
    s = await command(
      m,
      s,
      linkCommand(
        m,
        s,
        node(s, "ledger"),
        node(s, "allocations"),
        "depends-on",
      ),
    );
    s = await command(
      m,
      s,
      linkCommand(
        m,
        s,
        node(s, "allocations"),
        node(s, "proposals"),
        "decision-note-for",
      ),
    );
    const c = m.graphConnected(s, node(s, "ledger").id, ["current"]);
    assert.equal(c.nodeIds.length, 3);
    assert.equal(c.linkIds.length, 2);
    assert.equal(c.truncated, false);
    assert.equal(s.nodes.length, 5);
  },
);
await check(
  "a delayed file read cannot retarget a newer program choice",
  async () => {
    const d = dom();
    await m.mountProgramGraph(d.root);
    await click(d, "Import");
    let release;
    const bytes = new TextEncoder().encode(JSON.stringify(source(m)));
    const f = d.field("Choose original program workspace JSON");
    f.files = [
      {
        name: "fictional-delayed.json",
        size: bytes.length,
        arrayBuffer: () => new Promise((resolve) => (release = resolve)),
      },
    ];
    await f.fire("change");
    await set(
      d,
      "Program represented by the file",
      "charity-incubator",
      "change",
    );
    release(bytes.buffer);
    await settle(
      () => d.root.querySelector(".pg-status").textContent !== "Working…",
    );
    assert.equal(d.values.has(key), false);
    assert.equal(
      d.field("Program represented by the file").value,
      "charity-incubator",
    );
    assert.ok(!d.root.textContent.includes("Complete capture preview"));
    assert.ok(
      d.root
        .querySelector(".pg-status")
        .textContent.includes("changed while the file"),
    );
  },
);
await check(
  "a completed write keeps a newer unsaved alias instead of repainting its earlier command",
  async () => {
    const s = await withGraph(m),
      d = dom(s);
    await m.mountProgramGraph(d.root);
    await click(d, "Sources");
    await click(d, "Inspect source " + s.sources[0].alias);
    await click(d, "Rename source alias");
    await set(d, "New display alias", "Fictional first submitted alias");
    const original = crypto.subtle.digest.bind(crypto.subtle);
    let release,
      first = true;
    crypto.subtle.digest = async (...args) => {
      if (first) {
        first = false;
        await new Promise((resolve) => (release = resolve));
      }
      return original(...args);
    };
    try {
      await d.findButton("Save source alias").click();
      await settle(() => !!release);
      await set(d, "New display alias", "Fictional newer unfinished alias");
      release();
      await settle(
        () => d.root.querySelector(".pg-status").textContent !== "Working…",
      );
      assert.equal(
        saved(d).sources[0].alias,
        "Fictional first submitted alias",
      );
      assert.equal(
        d.field("New display alias").value,
        "Fictional newer unfinished alias",
      );
      assert.ok(
        (await downloadText(d, "Download unfinished raw form")).includes(
          "Fictional newer unfinished alias",
        ),
      );
    } finally {
      crypto.subtle.digest = original;
    }
  },
);
await check(
  "a stale clear confirmation cannot discard newer raw input",
  async () => {
    let s = await withGraph(m);
    s = await command(m, s, {
      kind: "draft.replace",
      draft: {
        tab: "recovery",
        sourceId: s.sources[0].id,
        nodeId: null,
        dirty: true,
        form: {
          kind: "rename-source",
          targetId: s.sources[0].id,
          binding: { sourceId: s.sources[0].id },
          fields: { alias: "Fictional old unfinished alias" },
        },
      },
    });
    const d = dom(s);
    await m.mountProgramGraph(d.root);
    await click(d, "Preview clearing this graph");
    await set(d, "fields.alias", "Fictional newer after preview");
    await click(d, "Confirm clear of companion graph");
    assert.equal(saved(d).sources.length, 1);
    assert.ok(
      d.root
        .querySelector(".pg-status")
        .textContent.includes("changed after the clear"),
    );
    assert.ok(
      (await downloadText(d, "Download unfinished raw form")).includes(
        "Fictional newer after preview",
      ),
    );
  },
);
await check(
  "reviewed restore replaces only graph key and requires new file authority",
  async () => {
    const s = await withGraph(m),
      d = dom();
    const sourceKey = m.programGraphSourceKey("the-charitology-fund");
    d.values.set(sourceKey, "Fictional source bytes remain");
    await m.mountProgramGraph(d.root);
    await click(d, "Recovery");
    await file(
      d,
      "Choose graph backup to restore",
      await m.makeProgramGraphBackup(s, at),
      "fictional-graph-backup.json",
    );
    assert.ok(d.root.textContent.includes("Validated replacement preview"));
    assert.equal(d.values.has(key), false);
    await click(d, "Replace graph with this reviewed backup");
    assert.equal(saved(d).nodes.length, 5);
    assert.equal(d.values.get(sourceKey), "Fictional source bytes remain");
    await click(d, "Import");
    assert.equal(d.findButton("Commit reviewed capture"), undefined);
  },
);
await check(
  "source retirement and explicit complete-copy resumption retain old link histories",
  async () => {
    let s = await withGraph(m);
    s = await command(
      m,
      s,
      linkCommand(
        m,
        s,
        node(s, "allocations"),
        node(s, "proposals"),
        "decision-note-for",
      ),
    );
    const d = dom(s);
    await m.mountProgramGraph(d.root);
    await click(d, "Sources");
    await click(d, "Inspect source " + s.sources[0].alias);
    await click(d, "Retire source");
    await set(
      d,
      "Reason for retiring this source",
      "Fictional source deliberately retired.",
    );
    await click(d, "Confirm source retirement");
    assert.ok(saved(d).sources[0].retirement);
    assert.equal(m.programGraphCounts(saved(d)).unresolved, 1);
    await click(d, "Import");
    await set(d, "Capture as", s.sources[0].id, "change");
    await file(
      d,
      "Choose original program workspace JSON",
      JSON.stringify(source(m), null, 2),
      "fictional-source.json",
    );
    await set(
      d,
      "I reviewed the complete source context and inventory, including missing rows. This is the complete chosen copy, not a filtered export.",
      true,
      "change",
    );
    await click(d, "Commit reviewed capture");
    assert.ok(saved(d).sources[0].retirement);
    await set(
      d,
      "Resume this retired source using this new complete capture.",
      true,
      "change",
    );
    await click(d, "Commit reviewed capture");
    assert.equal(saved(d).sources[0].retirement, null);
    assert.equal(saved(d).linkVersions.length, 1);
    assert.equal(m.programGraphCounts(saved(d)).current, 1);
  },
);
await check(
  "reappeared IDs require an explicit acknowledgement in a new endpoint review",
  async () => {
    let s = await withGraph(m);
    s = await command(
      m,
      s,
      linkCommand(
        m,
        s,
        node(s, "allocations"),
        node(s, "proposals"),
        "decision-note-for",
      ),
    );
    const absent = source(m);
    absent.records.proposals = [];
    s = await captureModel(m, s, absent, { sourceId: s.sources[0].id });
    s = await captureModel(m, s, source(m), { sourceId: s.sources[0].id });
    const d = dom(s);
    await m.mountProgramGraph(d.root);
    await click(d, "Links");
    await click(d, "Inspect link " + s.links[0].id);
    await click(d, "Review against current copies");
    await set(
      d,
      "Reason for this exact relationship review",
      "Fictional reappearance reviewed; identity remains unknown.",
    );
    await click(d, "Record review of exact versions");
    assert.equal(saved(d).linkVersions.length, 1);
    const box = d.root
      .querySelectorAll("input")
      .find((n) =>
        (n.getAttribute("aria-label") || "").startsWith(
          "I reviewed the reappeared source ID",
        ),
      );
    assert.ok(box);
    box.checked = true;
    await box.fire("change");
    await click(d, "Record review of exact versions");
    assert.equal(saved(d).linkVersions.length, 2);
    assert.equal(m.programGraphCounts(saved(d)).current, 1);
  },
);
await check(
  "records paginate25 without truncation and filters retain keyboard focus",
  async () => {
    const data = source(m);
    data.records.proposals = Array.from({ length: 31 }, (_, i) => ({
      id: `fictional-row-${i}`,
      values: {
        ...data.records.proposals[0].values,
        title: `Fictional title ${i}`,
      },
    }));
    const s = await captureModel(
        m,
        m.blankProgramGraphState("fictional-many", at),
        data,
      ),
      d = dom(s);
    await m.mountProgramGraph(d.root);
    await click(d, "Records");
    assert.equal(
      d.root
        .querySelectorAll("button")
        .filter((b) => b.textContent.startsWith("Inspect record ")).length,
      25,
    );
    await click(d, "Next 25");
    assert.equal(
      d.root
        .querySelectorAll("button")
        .filter((b) => b.textContent.startsWith("Inspect record ")).length,
      10,
    );
    const picker = d.field("Source filter");
    picker.focus();
    await set(d, "Source filter", s.sources[0].id, "change");
    assert.equal(
      d.document.activeElement.getAttribute("aria-label"),
      "Source filter",
    );
    assert.equal(saved(d).nodes.length, 35);
  },
);
await check(
  "no-lock mode keeps readable exports but blocks ordinary graph writes",
  async () => {
    const s = await withGraph(m),
      d = dom(s, { locks: false });
    await m.mountProgramGraph(d.root);
    assert.ok(d.root.textContent.includes("5 tracked records"));
    await click(d, "Import");
    assert.equal(
      d.findButton("Preview this page’s saved workspace").disabled,
      true,
    );
    await click(d, "Exports");
    const backup = await downloadText(d, "Download complete graph JSON backup");
    assert.equal((await m.parseProgramGraphBackup(backup)).nodes.length, 5);
  },
);
await check(
  "deliberate discard distinguishes this tab from an explicitly saved empty form",
  async () => {
    let s = await withGraph(m);
    s = await command(m, s, {
      kind: "draft.replace",
      draft: {
        tab: "sources",
        sourceId: s.sources[0].id,
        nodeId: null,
        dirty: true,
        form: {
          kind: "rename-source",
          targetId: s.sources[0].id,
          binding: { sourceId: s.sources[0].id },
          fields: { alias: "Fictional saved unfinished name" },
        },
      },
    });
    const d = dom(s);
    await m.mountProgramGraph(d.root);
    await click(d, "Discard unfinished form in this tab");
    await click(d, "Continue and replace unfinished form");
    assert.ok(saved(d).draft.form);
    assert.ok(
      d.root
        .querySelector(".pg-status")
        .textContent.includes("saved copy is unchanged"),
    );
    await click(d, "Save discarded form state");
    assert.equal(saved(d).draft.form, null);
    assert.equal(saved(d).nodes.length, 5);
    assert.equal(d.findButton("Download unfinished raw form"), undefined);
  },
);
await check(
  "changing packet selection removes obsolete download authority",
  async () => {
    const s = await withGraph(m),
      d = dom(s);
    await m.mountProgramGraph(d.root);
    await click(d, "Exports");
    const first = d.root
      .querySelectorAll("input")
      .find((input) =>
        input.getAttribute("aria-label")?.startsWith("Include record:"),
      );
    const label = first.getAttribute("aria-label");
    await set(d, label, true, "change");
    await click(d, "Review selected packet");
    assert.ok(d.findButton("Download selected CSV packet"));
    d.field(label).focus();
    await set(d, label, false, "change");
    assert.equal(d.findButton("Download selected CSV packet"), undefined);
    assert.equal(d.findButton("Download selected Markdown packet"), undefined);
    assert.equal(d.document.activeElement.getAttribute("aria-label"), label);
    assert.ok(
      d.root
        .querySelector(".pg-status")
        .textContent.includes("Review the current selection"),
    );
  },
);
console.log(
  `Program graph UI: ${groups} actual-module/controller/theme groups passed. Synthetic snapshots only; this is not browser layout or independent operating review.`,
);
await rm(temporary, { recursive: true, force: true });
