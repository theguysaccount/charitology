// Actual nine partner desks and closed RR facade, with fictional DOM/storage/reader boundaries.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { installPartnerReader } from "../test-fixtures/remaining-record-partners/reader.mjs";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import { build } from "esbuild";
import { transform } from "@astrojs/compiler";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import {
  installToolDom,
  settleTools,
  ToolElement,
} from "../test-fixtures/donor-recovery/tool-dom.mjs";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const sourcePath = "src/components/programs/PartnerWorkspace.astro";
const source = await readFile(sourcePath, "utf8"),
  scriptSource = source.match(/<script>([\s\S]*?)<\/script>/)[1];
const temp = await mkdtemp(join(resolve("node_modules"), ".partner-desks-"));
const checks = [],
  html = new Map();
let groups = 0,
  serial = 0,
  script,
  model;
const STAMP = "2026-10-27T00:00:00.000Z";
const programs = [
  "the-charitology-fund",
  "charity-incubator",
  "question-bounties",
  "the-charitology-prize",
  "charitology-fellowship",
  "charitology-summit",
  "donor-advisory",
  "nonprofit-advisory",
  "field-verification",
];
const key = (p) => "partner-workspace-v1." + p;
const fullKey = (p) => "charitology." + key(p);
const check = (name, run) => checks.push([name, run]);
const sample = (p) => ({
  ...model.sampleWorkspace(model.programWorkspaces[p]),
  updated: STAMP,
});
const hasWrite = (d) =>
  d.operations.some(([op]) => op === "set" || op === "remove");
async function start(p = "the-charitology-fund", value = sample(p), opts = {}) {
  const d = installToolDom(
    html.get(p),
    value === null ? {} : { [key(p)]: value },
    opts,
  );
  installPartnerReader(d);
  d.program = p;
  d.action = (name) =>
    d
      .$("#pw-record-recovery")
      .querySelectorAll("button")
      .find((b) => b.dataset.rrAction === name);
  d.result = () =>
    d
      .$("#pw-record-recovery")
      .querySelectorAll("p")
      .find((n) => n.dataset.rrResult)?.textContent || "";
  d.discard = () =>
    d
      .$("#pw-record-recovery")
      .querySelectorAll("input")
      .find((n) => n.dataset.rrDiscard === "true");
  d.file = () =>
    d
      .$("#pw-record-recovery")
      .querySelectorAll("input")
      .find((n) => n.dataset.rrFile === "true");
  d.saved = () => JSON.parse(d.values.get(fullKey(p)));
  if (opts.beforeRun) await opts.beforeRun(d);
  const release = opts.holdInitial ? await d.hold(key(p)) : null;
  const output = join(temp, "run-" + serial++ + ".mjs");
  await writeFile(output, script);
  await import(pathToFileURL(output));
  if (opts.early) await opts.early(d);
  release?.();
  await settleTools(() =>
    ["ready", "failed"].includes(d.root.dataset.rrInitialization),
  );
  assert.equal(
    d.root.dataset.rrInitialization,
    opts.expectFailed ? "failed" : "ready",
    d.$("#pw-status").textContent,
  );
  return d;
}
// This bounded boundary double models native control value sanitization. It is
// not browser evidence; the real Chrome acceptance separately checks it.
async function nativeControlSanitization(run) {
  const own = Object.getOwnPropertyDescriptor(ToolElement.prototype, "value");
  Object.defineProperty(ToolElement.prototype, "value", {
    ...own,
    set(value) {
      let text = String(value);
      if (this.tagName === "TEXTAREA") text = text.replace(/\r\n?/g, "\n");
      if (this.tagName === "INPUT") {
        const type = this.type || "text";
        if (
          ["text", "search", "tel", "password", "url", "email"].includes(type)
        )
          text = text.replace(/[\r\n]/g, "");
        if (["url", "email"].includes(type))
          text = text.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");
        if (
          type === "number" &&
          !/^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(text)
        )
          text = "";
      }
      own.set.call(this, text);
    },
  });
  try {
    await run();
  } finally {
    Object.defineProperty(ToolElement.prototype, "value", own);
  }
}
async function savedContext(d, value) {
  const field = model.programWorkspaces[d.program].context[0].key;
  await d.set("#pw-context-" + field, value);
  await d.$("#pw-context").fire("submit");
  await settleTools(() => !d.$('#pw-context button[type="submit"]').disabled);
}
function editor(d, collection) {
  return d
    .$("#pw-collections")
    .querySelectorAll("section")
    .find((s) => s.getAttribute("aria-label") === collection.label);
}
async function fillEditor(d, c, values) {
  for (const field of c.fields)
    await d.set("#pw-" + c.key + "-" + field.key, values[field.key]);
}
async function restore(d, text) {
  const file = d.file();
  file.files = [d.nativeFile(text)];
  await file.fire("change");
  await settleTools(() => !d.action("apply").hidden);
}
check(
  "all nine SSR desks expose shared recovery and no direct storage or cleaner authority",
  async () => {
    for (const p of programs) {
      assert.match(html.get(p), /id="pw-record-recovery"/);
      const noJs = installToolDom(html.get(p));
      assert.equal(
        noJs.$('#pw-context button[type="submit"]').disabled,
        true,
        "no-JS submit stays disabled",
      );
      for (const id of [
        "pw-preview",
        "pw-markdown",
        "pw-csv",
        "pw-export",
        "pw-sample",
      ])
        assert.equal(noJs.$("#" + id).disabled, true);
      assert.doesNotMatch(
        html.get(p),
        /id="pw-(?:file|import|reset|undo|raw)"/,
      );
    }
    assert.doesNotMatch(
      scriptSource,
      /\b(?:localStorage|canPersist|parseWorkspace|validValues|confirmTwice|partnerStorage|PartnerSession|savePartnerContext|savePartnerRecord|deletePartnerRecord|partnerBackup)\b/,
    );
    assert.match(scriptSource, /await session\.saveCaptured/);
  },
);
check(
  "actual inline module strict-compiles with the real facade, schema and controls",
  async () => {
    const name = resolve(
      "src/components/programs/__remaining_partner_records_inline__.ts",
    );
    const options = {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
      types: [],
    };
    const host = ts.createCompilerHost(options),
      read = host.readFile.bind(host),
      exists = host.fileExists.bind(host),
      get = host.getSourceFile.bind(host);
    host.readFile = (p) => (resolve(p) === name ? scriptSource : read(p));
    host.fileExists = (p) => resolve(p) === name || exists(p);
    host.getSourceFile = (p, l, ...rest) =>
      resolve(p) === name
        ? ts.createSourceFile(p, scriptSource, l, true)
        : get(p, l, ...rest);
    const program = ts.createProgram(
        [name, resolve("node_modules/astro/client.d.ts")],
        options,
        host,
      ),
      ds = ts.getPreEmitDiagnostics(program);
    assert.equal(
      ds.length,
      0,
      ts.formatDiagnosticsWithColorAndContext(ds, {
        getCanonicalFileName: (p) => p,
        getCurrentDirectory: () => process.cwd(),
        getNewLine: () => "\n",
      }),
    );
  },
);
for (const p of programs)
  check(
    p +
      ": saved hydration, exact free text, native/Markdown/CSV and other-key isolation",
    async () => {
      const before = sample(p),
        config = model.programWorkspaces[p],
        first = config.context[0].key;
      before.context[first] = "  FICTIONAL retained " + p + "  ";
      const d = await start(p, before);
      assert.equal(hasWrite(d), false);
      assert.equal(d.get("#pw-context-" + first), before.context[first]);
      assert.ok(d.$("#pw-kpis").textContent.length);
      assert.ok(
        d
          .$("#pw-collections")
          .textContent.includes(
            before.records[config.collections[0].key][0].values.title,
          ),
      );
      const changed = " \n FICTIONAL exact " + p + " \t ";
      await savedContext(d, changed);
      assert.equal(d.saved().context[first], changed);
      for (const id of ["pw-export", "pw-markdown", "pw-csv"])
        await d.$("#" + id).click();
      assert.equal(d.downloads.length, 3);
      const native = JSON.parse(await d.downloads[0].text());
      assert.equal(native.context[first], changed);
      assert.deepEqual(Object.keys(native).sort(), [
        "context",
        "program",
        "records",
        "updated",
        "version",
      ]);
      assert.ok((await d.downloads[1].text()).includes("FICTIONAL"));
      assert.ok((await d.downloads[2].text()).includes("FICTIONAL"));
      assert.equal(d.values.get("unrelated.private.key"), "unchanged");
      assert.ok(
        d.operations.every(([, k]) => k === fullKey(p)),
        "only its own fixed key may be read or written",
      );
    },
  );
check(
  "partner hydration retains exact admitted strings while raw forms show literal native values",
  async () => {
    await nativeControlSanitization(async () => {
      const p = "the-charitology-fund",
        v = sample(p),
        config = model.programWorkspaces[p];
      const text = config.context.find((f) => f.kind === "text"),
        area = config.context.find((f) => f.kind === "textarea");
      v.context[text.key] = "FICTIONAL\r\nFund";
      v.context[area.key] = "First\r\nSecond";
      const d = await start(p, v);
      assert.equal(d.get("#pw-context-" + text.key), "FICTIONALFund");
      assert.equal(d.get("#pw-context-" + area.key), "First\nSecond");
      const other = config.context.find(
        (f) =>
          f.key !== text.key && f.key !== area.key && f.kind === "textarea",
      );
      await d.set("#pw-context-" + other.key, "Only this field changed");
      await d.$("#pw-context").fire("submit");
      assert.equal(d.saved().context[text.key], v.context[text.key]);
      assert.equal(d.saved().context[area.key], v.context[area.key]);
      await d.action("forms").click();
      const raw = JSON.parse(await d.downloads.at(-1).text()).forms.find(
        (f) => f.form === "context",
      );
      assert.equal(raw.values[text.key], "FICTIONALFund");
      assert.equal(raw.values[area.key], "First\nSecond");
      await d.set("#pw-context-" + text.key, "Temporary edit");
      await d.set("#pw-context-" + text.key, "FICTIONALFund");
      await d.$("#pw-context").fire("submit");
      assert.equal(d.saved().context[text.key], "FICTIONALFund");
    });
  },
);
check(
  "partner URL and numeric fields preserve exact source spelling until explicit input",
  async () => {
    await nativeControlSanitization(async () => {
      const p = "field-verification",
        v = sample(p),
        config = model.programWorkspaces[p];
      const c = config.collections.find((c) =>
          c.fields.some((f) => f.kind === "url"),
        ),
        source = c.fields.find((f) => f.kind === "url");
      const original = "   https://example.invalid/source?q=one   ";
      v.records[c.key][0].values[source.key] = original;
      const d = await start(p, v),
        id = v.records[c.key][0].id;
      await d
        .$("#pw-rows-" + c.key)
        .querySelectorAll("button")
        .find((b) => b.textContent.startsWith("Edit "))
        .click();
      assert.equal(d.get("#pw-" + c.key + "-" + source.key), original.trim());
      await d.set("#pw-" + c.key + "-title", "Only title changed");
      await editor(d, c).querySelector("form").fire("submit");
      assert.equal(
        d.saved().records[c.key].find((r) => r.id === id).values[source.key],
        original,
      );
      const np = "the-charitology-fund",
        nv = sample(np),
        nc = model.programWorkspaces[np];
      const number = nc.context.find((f) => f.kind === "number");
      nv.context[number.key] = " 10 ";
      const nd = await start(np, nv);
      assert.equal(nd.$("#pw-context-" + number.key).type, "text");
      assert.equal(nd.get("#pw-context-" + number.key), " 10 ");
      await savedContext(nd, "Only name changed");
      assert.equal(nd.saved().context[number.key], " 10 ");
    });
  },
);
check(
  "absent default does not claim saved; the first valid context persists without startup writes",
  async () => {
    const p = "charity-incubator",
      d = await start(p, null, {});
    assert.equal(hasWrite(d), false);
    assert.match(
      d.$("#pw-save-state").textContent,
      /Empty workspace.*not saved/,
    );
    await d.$("#pw-context").fire("submit");
    assert.equal(
      hasWrite(d),
      false,
      "required blank fields remain raw and do not mint a snapshot",
    );
    assert.doesNotMatch(d.$("#pw-status").textContent, /Context saved/);
    const config = model.programWorkspaces[p],
      context = sample(p).context;
    for (const field of config.context)
      await d.set("#pw-context-" + field.key, context[field.key]);
    await d.$("#pw-context").fire("submit");
    assert.deepEqual(d.saved().context, context);
    assert.match(d.$("#pw-save-state").textContent, /Validated records saved/);
  },
);
check(
  "collection save keeps exact text and preserves unrelated context/editor drafts",
  async () => {
    const p = "the-charitology-fund",
      d = await start(p),
      config = model.programWorkspaces[p],
      c = config.collections[0];
    const count = d.saved().records[c.key].length,
      values = {
        ...sample(p).records[c.key][0].values,
        title: " \n Fictional raw title \t ",
      };
    await d.set("#pw-context-" + config.context[0].key, "Unsubmitted context");
    await fillEditor(d, c, values);
    await editor(d, c).querySelector("form").fire("submit");
    await settleTools(() => d.saved().records[c.key].length === count + 1);
    assert.equal(d.saved().records[c.key].at(-1).values.title, values.title);
    assert.equal(
      d.get("#pw-context-" + config.context[0].key),
      "Unsubmitted context",
    );
    assert.equal(d.get("#pw-" + c.key + "-title"), "");
    assert.match(d.$("#pw-save-state").textContent, /unfinished fields/);
  },
);
check(
  "same-collection Edit refuses to overwrite an unfinished new record",
  async () => {
    const d = await start(),
      c = model.programWorkspaces[d.program].collections[0];
    await d.set("#pw-" + c.key + "-title", "Keep this unfinished new record");
    const button = d
      .$("#pw-rows-" + c.key)
      .querySelectorAll("button")
      .find((b) => b.textContent.startsWith("Edit "));
    await button.click();
    assert.equal(
      d.get("#pw-" + c.key + "-title"),
      "Keep this unfinished new record",
    );
    assert.match(d.$("#pw-status").textContent, /unfinished fields/);
  },
);
check(
  "failed save retains validated candidate and raw form; retry updates cards without clearing newer fields",
  async () => {
    const d = await start(),
      config = model.programWorkspaces[d.program],
      field = config.context[0].key,
      old = d.values.get(fullKey(d.program));
    d.flags.failWrite = true;
    await d.set("#pw-context-" + field, "FICTIONAL failed candidate");
    await d.$("#pw-context").fire("submit");
    await settleTools(() => !d.action("retry").disabled);
    assert.equal(d.values.get(fullKey(d.program)), old);
    assert.match(d.$("#pw-status").textContent, /Saving failed/);
    assert.equal(d.get("#pw-context-" + field), "FICTIONAL failed candidate");
    await d.$("#pw-export").click();
    assert.equal(
      JSON.parse(await d.downloads.at(-1).text()).context[field],
      "FICTIONAL failed candidate",
    );
    await d.set("#pw-context-" + field, "NEWER unfinished text");
    d.flags.failWrite = false;
    await d.action("retry").click();
    await settleTools(
      () => d.saved().context[field] === "FICTIONAL failed candidate",
    );
    assert.equal(d.get("#pw-context-" + field), "NEWER unfinished text");
    assert.match(d.$("#pw-save-state").textContent, /unfinished fields/);
  },
);
check(
  "failed new row keeps its admitted ID through newer input, exact Retry and resubmission",
  async () => {
    const d = await start(),
      p = d.program,
      c = model.programWorkspaces[p].collections[0],
      initialCount = d.saved().records[c.key].length,
      values = {
        ...sample(p).records[c.key][0].values,
        title: "Fictional failed new row",
      };
    await fillEditor(d, c, values);
    d.flags.failWrite = true;
    await editor(d, c).querySelector("form").fire("submit");
    await settleTools(() => !d.action("retry").disabled);
    await d.$("#pw-export").click();
    const failed = JSON.parse(await d.downloads.at(-1).text()),
      admitted = failed.records[c.key].find(
        (row) => row.values.title === values.title,
      );
    assert.ok(admitted, "failed valid candidate remains natively exportable");
    assert.match(editor(d, c).querySelector("summary").textContent, /^Edit /);
    await d.set("#pw-" + c.key + "-title", "Newer unfinished row revision");
    d.flags.failWrite = false;
    await d.action("retry").click();
    await settleTools(
      () => d.saved().records[c.key].length === initialCount + 1,
    );
    assert.equal(
      d.saved().records[c.key].find((row) => row.id === admitted.id).values
        .title,
      values.title,
      "Retry persists the exact old candidate rather than rereading newer fields",
    );
    assert.equal(
      d.get("#pw-" + c.key + "-title"),
      "Newer unfinished row revision",
    );
    await editor(d, c).querySelector("form").fire("submit");
    await settleTools(
      () =>
        d.saved().records[c.key].find((row) => row.id === admitted.id).values
          .title === "Newer unfinished row revision",
    );
    assert.equal(d.saved().records[c.key].length, initialCount + 1);
    assert.equal(d.get("#pw-" + c.key + "-title"), "");
    assert.match(editor(d, c).querySelector("summary").textContent, /^Add /);
  },
);
check(
  "a rejected new candidate retains Add mode and Cancel releases a retained failed-row editor",
  async () => {
    const d = await start(),
      p = d.program,
      c = model.programWorkspaces[p].collections[0],
      before = d.values.get(fullKey(p)),
      values = {
        ...sample(p).records[c.key][0].values,
        title: "Rejected then corrected fictional row",
      };
    await fillEditor(d, c, { ...values, title: "" });
    await editor(d, c).querySelector("form").fire("submit");
    assert.equal(d.values.get(fullKey(p)), before);
    assert.match(editor(d, c).querySelector("summary").textContent, /^Add /);
    await d.set("#pw-" + c.key + "-title", values.title);
    d.flags.failWrite = true;
    await editor(d, c).querySelector("form").fire("submit");
    await settleTools(() => !d.action("retry").disabled);
    assert.match(editor(d, c).querySelector("summary").textContent, /^Edit /);
    await editor(d, c)
      .querySelectorAll("button")
      .find((button) => button.textContent === "Cancel edit")
      .click();
    assert.equal(d.get("#pw-" + c.key + "-title"), "");
    assert.match(editor(d, c).querySelector("summary").textContent, /^Add /);
    d.flags.failWrite = false;
    await d.action("retry").click();
    await settleTools(() => d.action("retry").disabled);
    assert.equal(d.get("#pw-" + c.key + "-title"), "");
    assert.match(editor(d, c).querySelector("summary").textContent, /^Add /);
  },
);
check(
  "no-event foreign writes refuse save and preserve the exact newer disk bytes and raw form",
  async () => {
    const d = await start(),
      p = d.program,
      field = model.programWorkspaces[p].context[0].key,
      foreign = sample(p);
    foreign.context[field] = "FOREIGN newer committed snapshot";
    const bytes = JSON.stringify(foreign);
    d.values.set(fullKey(p), bytes);
    await d.set("#pw-context-" + field, "Own unfinished candidate");
    await d.$("#pw-context").fire("submit");
    await settleTools(() => d.$("#pw-storage").hidden === false);
    assert.equal(d.values.get(fullKey(p)), bytes);
    assert.equal(d.get("#pw-context-" + field), "Own unfinished candidate");
    assert.doesNotMatch(d.$("#pw-status").textContent, /Context saved/);
  },
);
check(
  "held initial lock disables editors and prevents native submission/navigation without startup writes",
  async () => {
    const p = "nonprofit-advisory",
      field = model.programWorkspaces[p].context[0].key;
    let prevented = false;
    const d = await start(p, sample(p), {
      holdInitial: true,
      early: async (d) => {
        assert.equal(d.$("#pw-context-" + field).disabled, true);
        assert.equal(d.$('#pw-context button[type="submit"]').disabled, true);
        await d.$("#pw-context").fire("submit", {
          preventDefault() {
            prevented = true;
          },
        });
      },
    });
    assert.equal(prevented, true);
    assert.equal(d.get("#pw-context-" + field), sample(p).context[field]);
    assert.equal(hasWrite(d), false);
    assert.equal(d.$("#pw-context-" + field).disabled, false);
  },
);
check(
  "a queued save superseded by newer raw input never clears or persists the stale form",
  async () => {
    const d = await start(),
      field = model.programWorkspaces[d.program].context[0].key,
      original = d.values.get(fullKey(d.program));
    const release = await d.hold(key(d.program));
    await d.set("#pw-context-" + field, "Queued older input");
    const pending = d.$("#pw-context").fire("submit");
    await Promise.resolve();
    await d.set("#pw-context-" + field, "NEWER input during lock wait");
    release();
    await pending;
    assert.equal(d.values.get(fullKey(d.program)), original);
    assert.equal(d.get("#pw-context-" + field), "NEWER input during lock wait");
    assert.doesNotMatch(d.$("#pw-status").textContent, /Context saved/);
  },
);
check(
  "corrupt source stays protected, native export is disabled and raw forms remain downloadable",
  async () => {
    const d = await start("field-verification", '{"unfinished":');
    assert.equal(hasWrite(d), false);
    assert.match(d.$("#pw-save-state").textContent, /No validated/);
    assert.equal(d.$("#pw-export").disabled, true);
    assert.match(d.$("#pw-collections").textContent, /No validated records/);
    const field = model.programWorkspaces[d.program].context[0].key;
    await d.set(
      "#pw-context-" + field,
      "Malformed source does not erase raw fields",
    );
    await d.action("forms").click();
    const text = await d.downloads.at(-1).text();
    assert.ok(text.includes("Malformed source does not erase raw fields"));
    assert.equal(d.values.get(fullKey(d.program)), '{"unfinished":');
  },
);
check(
  "unsupported browser retains validated calculations/exports while durable saves stay disabled",
  async () => {
    const d = await start("charitology-summit", sample("charitology-summit"), {
      unsupported: true,
    });
    assert.equal(hasWrite(d), false);
    assert.equal(d.$('#pw-context button[type="submit"]').disabled, true);
    assert.ok(d.$("#pw-kpis").textContent.length);
    assert.equal(d.$("#pw-export").disabled, false);
    await d.$("#pw-export").click();
    assert.equal(
      JSON.parse(await d.downloads.at(-1).text()).program,
      "charitology-summit",
    );
  },
);
check(
  "native restore requires explicit discard and does not normalize retained strings or IDs",
  async () => {
    const d = await start(),
      p = d.program,
      field = model.programWorkspaces[p].context[0].key,
      next = sample(p);
    next.context[field] = " \n Restore exact text \t ";
    next.records[model.programWorkspaces[p].collections[0].key][0].id =
      "kept-source-id";
    await d.set("#pw-context-" + field, "unfinished before restore");
    d.file().files = [d.nativeFile(JSON.stringify(next))];
    await d.file().fire("change");
    await settleTools(() => /discard|unfinished/i.test(d.result()));
    assert.equal(d.action("apply").hidden, true);
    d.discard().checked = true;
    await d.discard().fire("change");
    await restore(d, JSON.stringify(next));
    await d.action("apply").click();
    await settleTools(() => d.saved().context[field] === next.context[field]);
    assert.equal(d.get("#pw-context-" + field), next.context[field]);
    assert.equal(
      d.saved().records[model.programWorkspaces[p].collections[0].key][0].id,
      "kept-source-id",
    );
  },
);
check(
  "reviewed fictional example cannot apply after a newer field edit",
  async () => {
    const d = await start(),
      field = model.programWorkspaces[d.program].context[0].key,
      old = d.values.get(fullKey(d.program));
    await d.$("#pw-sample").click();
    await settleTools(() => !d.$("#pw-sample-preview").hidden);
    await d.set("#pw-context-" + field, "newer after review");
    await d.$("#pw-sample-apply").click();
    assert.equal(d.values.get(fullKey(d.program)), old);
    assert.equal(d.get("#pw-context-" + field), "newer after review");
    assert.equal(d.$("#pw-sample-preview").hidden, true);
  },
);
check(
  "reviewed removal adopts absent defaults and guarded Undo restores exact records",
  async () => {
    const d = await start(),
      old = d.values.get(fullKey(d.program));
    await d.action("review-remove").click();
    await settleTools(() => !d.action("apply").hidden);
    await d.action("apply").click();
    await settleTools(() => !d.values.has(fullKey(d.program)));
    assert.match(
      d.$("#pw-save-state").textContent,
      /Empty workspace.*not saved/,
    );
    assert.equal(d.$("#pw-collections").querySelectorAll("article").length, 0);
    await d.action("undo").click();
    await settleTools(() => d.values.has(fullKey(d.program)));
    assert.deepEqual(
      d.saved(),
      JSON.parse(old),
      "Undo preserves IDs, exact strings, order and source timestamp, without promising old JSON whitespace",
    );
    assert.ok(d.$("#pw-collections").querySelectorAll("article").length);
  },
);
check(
  "deletion needs a fresh second press and retains unrelated unfinished context",
  async () => {
    const d = await start(),
      config = model.programWorkspaces[d.program],
      c = config.collections[0],
      initial = d.saved(),
      id = initial.records[c.key][0].id;
    const remove = d
      .$("#pw-rows-" + c.key)
      .querySelectorAll("button")
      .find((b) => b.textContent.startsWith("Delete "));
    await remove.click();
    assert.ok(d.saved().records[c.key].some((row) => row.id === id));
    await d.set(
      "#pw-context-" + config.context[0].key,
      "Unrelated unfinished context survives deletion",
    );
    await remove.click();
    assert.ok(
      d.saved().records[c.key].some((row) => row.id === id),
      "new edit invalidates old confirmation",
    );
    await remove.click();
    await settleTools(
      () => !d.saved().records[c.key].some((row) => row.id === id),
    );
    assert.equal(
      d.saved().records[c.key].length,
      initial.records[c.key].length - 1,
    );
    assert.equal(
      d.get("#pw-context-" + config.context[0].key),
      "Unrelated unfinished context survives deletion",
    );
    assert.equal(
      d.saved().context[config.context[0].key],
      initial.context[config.context[0].key],
    );
    assert.match(d.$("#pw-save-state").textContent, /unfinished fields/);
  },
);
check(
  "reviewed fictional replacement requires explicit discard and adopts clean exact native records",
  async () => {
    const p = "charitology-summit",
      d = await start(p),
      config = model.programWorkspaces[p],
      field = config.context[0].key,
      source = d.saved();
    await d.set(
      "#pw-context-" + field,
      "Unfinished form not silently discarded",
    );
    await d.$("#pw-sample").click();
    await settleTools(() =>
      /unfinished|discard/i.test(d.$("#pw-status").textContent),
    );
    assert.equal(d.$("#pw-sample-preview").hidden, true);
    assert.deepEqual(d.saved(), source);
    await d.set("#pw-sample-discard", true, "change");
    await d.$("#pw-sample").click();
    await settleTools(() => !d.$("#pw-sample-preview").hidden);
    assert.match(
      d.$("#pw-sample-summary").textContent,
      /FICTIONAL replacement/,
    );
    await d.$("#pw-sample-apply").click();
    await settleTools(
      () => d.$("#pw-sample-preview").hidden && !d.$("#pw-sample").disabled,
    );
    assert.equal(d.get("#pw-context-" + field), source.context[field]);
    for (const c of config.collections)
      assert.deepEqual(
        d.saved().records[c.key].map((r) => r.values),
        source.records[c.key].map((r) => r.values),
      );
    assert.deepEqual(d.saved().context, source.context);
    await d.$("#pw-export").click();
    assert.deepEqual(JSON.parse(await d.downloads.at(-1).text()), d.saved());
    assert.doesNotMatch(d.$("#pw-save-state").textContent, /unfinished fields/);
  },
);
check(
  "persisted history during held initialization opens without losing the disabled editor",
  async () => {
    const p = "nonprofit-advisory",
      d = await start(p, sample(p), {
        holdInitial: true,
        early: async (d) => {
          await d.window.fire("pagehide", { persisted: true });
          await d.window.fire("pageshow", { persisted: true });
        },
      });
    const f = model.programWorkspaces[p].context[0].key;
    assert.equal(d.get("#pw-context-" + f), sample(p).context[f]);
    assert.equal(d.$('#pw-context button[type="submit"]').disabled, false);
    assert.equal(hasWrite(d), false);
  },
);
check(
  "held-init resume does not reacquire initial hydration ownership after a newer view-only intent",
  async () => {
    const p = "nonprofit-advisory",
      field = model.programWorkspaces[p].context[0].key;
    let reads = 0,
      changed = false;
    const d = await start(p, sample(p), {
      holdInitial: true,
      beforeRun: async (d) => {
        const get = d.storage.getItem.bind(d.storage);
        d.storage.getItem = (k) => {
          const raw = get(k);
          if (k === fullKey(p) && ++reads === 3)
            queueMicrotask(() => {
              d.$("#pw-context-" + field).value =
                "Retain newer view-owned text";
              void d.$("#pw-sample-discard").fire("change");
              changed = true;
            });
          return raw;
        };
      },
      early: async (d) => {
        await d.window.fire("pagehide", { persisted: true });
        await d.window.fire("pageshow", { persisted: true });
      },
    });
    assert.equal(changed, true);
    assert.equal(d.get("#pw-context-" + field), "Retain newer view-owned text");
    assert.equal(hasWrite(d), false);
    await d.window.fire("pagehide");
  },
);
check(
  "persisted history return keeps raw fields and a live editor",
  async () => {
    const d = await start(),
      f = model.programWorkspaces[d.program].context[0].key;
    await d.set("#pw-context-" + f, "Unfinished history-return text");
    await d.window.fire("pagehide", { persisted: true });
    await d.window.fire("pageshow", { persisted: true });
    assert.equal(d.get("#pw-context-" + f), "Unfinished history-return text");
    assert.equal(d.$('#pw-context button[type="submit"]').disabled, false);
    await d.$("#pw-context").fire("submit");
    assert.equal(d.saved().context[f], "Unfinished history-return text");
  },
);
check(
  "history return observes silent external bytes without hydrating dirty forms",
  async () => {
    const d = await start(),
      f = model.programWorkspaces[d.program].context[0].key;
    await d.set("#pw-context-" + f, "Private retained history form");
    await d.window.fire("pagehide", { persisted: true });
    const foreign = sample(d.program);
    foreign.context[f] = "Foreign during cached navigation";
    const raw = JSON.stringify(foreign);
    d.values.set(fullKey(d.program), raw);
    await d.window.fire("pageshow", { persisted: true });
    assert.equal(d.get("#pw-context-" + f), "Private retained history form");
    assert.equal(d.$('#pw-context button[type="submit"]').disabled, true);
    assert.equal(d.values.get(fullKey(d.program)), raw);
  },
);
check(
  "persisted hide revokes a held save before cached document returns",
  async () => {
    const d = await start(),
      f = model.programWorkspaces[d.program].context[0].key;
    const raw = d.values.get(fullKey(d.program)),
      release = await d.hold(key(d.program));
    await d.set("#pw-context-" + f, "Held cached-page input");
    const pending = d.$("#pw-context").fire("submit");
    await Promise.resolve();
    await d.window.fire("pagehide", { persisted: true });
    release();
    await pending;
    await d.window.fire("pageshow", { persisted: true });
    assert.equal(d.values.get(fullKey(d.program)), raw);
    assert.equal(d.get("#pw-context-" + f), "Held cached-page input");
  },
);
check(
  "dispose during held open never hydrates editors or mounts live recovery",
  async () => {
    const p = "nonprofit-advisory",
      d = installToolDom(html.get(p), { [key(p)]: sample(p) }),
      release = await d.hold(key(p));
    installPartnerReader(d);
    const output = join(temp, "run-" + serial++ + ".mjs");
    await writeFile(output, script);
    await import(pathToFileURL(output));
    await d.window.fire("pagehide");
    release();
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.notEqual(d.root.dataset.rrInitialization, "ready");
    assert.equal(
      d.$("#pw-record-recovery").querySelector("[data-rr-recovery]"),
      null,
    );
    assert.ok(
      d.root
        .querySelectorAll("[data-pw-field]")
        .every((field) => field.disabled),
    );
    assert.equal(d.$('#pw-context button[type="submit"]').disabled, true);
    assert.equal(
      (await d.$("#pw-context").fire("submit")).defaultPrevented,
      true,
    );
    assert.equal(hasWrite(d), false);
  },
);
check(
  "post-open render failure closes mounted recovery and leaves editors disabled without a write",
  async () => {
    const p = "field-verification",
      before = sample(p),
      d = await start(p, before, {
        holdInitial: true,
        expectFailed: true,
        early: async (d) => {
          assert.equal(d.$('#pw-context button[type="submit"]').disabled, true);
          d.$("#pw-kpis").remove();
        },
      });
    assert.equal(d.root.dataset.rrInitialization, "failed");
    assert.match(
      d.$("#pw-status").textContent,
      /Initialization failed.*Missing element: #pw-kpis/,
    );
    assert.equal(
      d.$("#pw-record-recovery").querySelector("[data-rr-recovery]"),
      null,
    );
    assert.ok(
      d.root
        .querySelectorAll("button,input,select,textarea")
        .every((field) => field.disabled),
    );
    assert.equal(
      (await d.$("#pw-context").fire("submit")).defaultPrevented,
      true,
    );
    assert.deepEqual(d.saved(), before);
    assert.equal(hasWrite(d), false);
    await d.window.fire("pagehide");
  },
);
check(
  "all 46 partner collections edit through their actual forms without changing another form or ID",
  async () => {
    let collections = 0;
    for (const p of programs) {
      const before = sample(p),
        d = await start(p, before),
        config = model.programWorkspaces[p];
      for (const c of config.collections) {
        const row = d.saved().records[c.key][0],
          id = row.id;
        await d
          .$("#pw-rows-" + c.key)
          .querySelectorAll("button")
          .find((b) => b.textContent.startsWith("Edit "))
          .click();
        await d.set(
          "#pw-" + c.key + "-title",
          "  FICTIONAL updated " + c.key + "  ",
        );
        await editor(d, c).querySelector("form").fire("submit");
        assert.equal(d.saved().records[c.key][0].id, id);
        assert.equal(
          d.saved().records[c.key][0].values.title,
          "  FICTIONAL updated " + c.key + "  ",
        );
        for (const f of c.fields.filter((f) => f.key !== "title"))
          assert.equal(
            d.saved().records[c.key][0].values[f.key],
            row.values[f.key],
          );
        assert.deepEqual(d.saved().context, before.context);
        collections++;
      }
    }
    assert.equal(collections, 46);
  },
);
check(
  "native kit exports exclude every raw partial form and do not shrink to the current filter",
  async () => {
    const p = "the-charitology-fund",
      d = await start(p),
      config = model.programWorkspaces[p],
      before = d.saved();
    await d.set(
      "#pw-context-" + config.context[0].key,
      "UNSUBMITTED CONTEXT ONLY",
    );
    for (const c of config.collections)
      await d.set("#pw-" + c.key + "-title", "UNSUBMITTED " + c.key);
    await d.set("#pw-search", "no existing record matches this filter");
    await d.$("#pw-export").click();
    assert.deepEqual(JSON.parse(await d.downloads.at(-1).text()), before);
    await d.$("#pw-markdown").click();
    assert.equal(
      await d.downloads.at(-1).text(),
      model.workspaceMarkdown(config, before),
    );
    await d.$("#pw-csv").click();
    assert.equal(
      await d.downloads.at(-1).text(),
      model.workspaceCsv(config, before),
    );
    await d.action("forms").click();
    const raw = JSON.parse(await d.downloads.at(-1).text());
    assert.equal(raw.forms.length, config.collections.length + 1);
    assert.equal(
      raw.forms[0].values[config.context[0].key],
      "UNSUBMITTED CONTEXT ONLY",
    );
    assert.ok(
      raw.forms
        .slice(1)
        .every((f) => f.values.title.startsWith("UNSUBMITTED ")),
    );
    assert.match(d.$("#pw-save-state").textContent, /unfinished/);
  },
);
check(
  "selected Fund transparency and tentative Summit calendar retain their actual helper output",
  async () => {
    const fund = await start("the-charitology-fund"),
      fv = fund.saved();
    await fund.set("#pw-search", "no matching saved record");
    await fund.$("#pw-transparency").click();
    const ft = await fund.downloads.at(-1).text();
    assert.equal(ft, model.fundTransparency(fv));
    for (const r of fv.records.conflicts)
      assert.ok(!ft.includes(r.values.title));
    const summit = await start("charitology-summit"),
      sv = summit.saved();
    await summit.set("#pw-search", "no matching saved record");
    await summit.$("#pw-calendar").click();
    const actual = await summit.downloads.at(-1).text(),
      expected = model.summitCalendar(sv).text;
    assert.equal(
      actual.replace(/DTSTAMP:[^\r\n]+/g, "DTSTAMP:DECLARED"),
      expected.replace(/DTSTAMP:[^\r\n]+/g, "DTSTAMP:DECLARED"),
    );
    assert.match(actual, /STATUS:TENTATIVE/);
    assert.match(
      summit.$("#pw-status").textContent,
      /No event announced or invitation sent/,
    );
  },
);
check(
  "new row admission binds identity before a held save and a superseded retry reuses it",
  async () => {
    const d = await start(),
      p = d.program,
      c = model.programWorkspaces[p].collections[0],
      initial = d.saved().records[c.key].length;
    await fillEditor(d, c, {
      ...sample(p).records[c.key][0].values,
      title: "Held admitted row",
    });
    const release = await d.hold(key(p)),
      pending = editor(d, c).querySelector("form").fire("submit");
    await Promise.resolve();
    await d.action("forms").click();
    const forms = JSON.parse(await d.downloads.at(-1).text()).forms,
      current = forms.find((f) => f.form === "collection:" + c.key);
    assert.ok(
      current.editingId,
      "identity is bound before the persistence await",
    );
    const identity = current.editingId;
    await d.set("#pw-" + c.key + "-title", "Newer same admitted row");
    release();
    await pending;
    assert.equal(
      d.saved().records[c.key].length,
      initial,
      "superseded candidate did not enter current model",
    );
    await editor(d, c).querySelector("form").fire("submit");
    assert.equal(d.saved().records[c.key].length, initial + 1);
    assert.equal(d.saved().records[c.key].at(-1).id, identity);
    assert.equal(
      d.saved().records[c.key].at(-1).values.title,
      "Newer same admitted row",
    );
  },
);
check(
  "failed intent can be explicitly replaced from one current form; newer input revokes that review",
  async () => {
    const d = await start(),
      p = d.program,
      config = model.programWorkspaces[p],
      field = config.context[0].key,
      old = d.values.get(fullKey(p));
    d.flags.failWrite = true;
    await d.set("#pw-context-" + field, "Exact failed context");
    await d.$("#pw-context").fire("submit");
    await settleTools(() => !d.action("retry").disabled);
    assert.equal(d.values.get(fullKey(p)), old);
    await d.set("#pw-context-" + field, "Current replacement context");
    await d.$("#pw-context-replace").click();
    await settleTools(() =>
      /discard|unfinished/i.test(d.$("#pw-status").textContent),
    );
    assert.equal(d.$("#pw-sample-preview").hidden, true);
    await d.set("#pw-sample-discard", true, "change");
    await d.$("#pw-context-replace").click();
    await settleTools(() => !d.$("#pw-sample-preview").hidden);
    await d.set("#pw-context-" + field, "Newer than replacement review");
    assert.equal(d.$("#pw-sample-preview").hidden, true);
    await d.$("#pw-sample-apply").click();
    assert.equal(d.values.get(fullKey(p)), old);
    await d.set("#pw-sample-discard", true, "change");
    await d.$("#pw-context-replace").click();
    await settleTools(() => !d.$("#pw-sample-preview").hidden);
    d.flags.failWrite = false;
    await d.$("#pw-sample-apply").click();
    await settleTools(
      () => d.saved().context[field] === "Newer than replacement review",
    );
    assert.equal(
      d.get("#pw-context-" + field),
      "Newer than replacement review",
    );
    assert.doesNotMatch(d.$("#pw-save-state").textContent, /unfinished/);
  },
);
check(
  "late file A cannot replace newer B or resurrect Apply after cancel, empty or oversized choices",
  async () => {
    for (const choice of ["newer", "cancel", "empty", "oversize"]) {
      const d = await start(),
        p = d.program,
        field = model.programWorkspaces[p].context[0].key,
        a = sample(p),
        b = sample(p);
      a.context[field] = "Late A";
      b.context[field] = "Newer B";
      d.file().files = [d.nativeFile(JSON.stringify(a), { held: true })];
      await d.file().fire("change");
      const reader = d.readers.at(-1);
      assert.ok(reader);
      if (choice === "newer") {
        await restore(d, JSON.stringify(b));
        reader.load({ late: true });
        await d.action("apply").click();
        await settleTools(() => d.saved().context[field] === "Newer B");
      } else {
        if (choice === "cancel") await d.action("cancel").click();
        else {
          d.file().files =
            choice === "empty" ? [] : [d.nativeFile("{}", { size: 8000001 })];
          await d.file().fire("change");
        }
        reader.load({ late: true });
        await Promise.resolve();
        assert.equal(d.action("apply").hidden, true);
        assert.notEqual(d.saved().context[field], "Late A");
      }
      assert.equal(reader.aborted, true);
      assert.equal(d.maxActiveReaders, 1);
    }
  },
);
check(
  "explicit unchanged change and sanitized-empty clear never revive hidden source strings",
  async () => {
    await nativeControlSanitization(async () => {
      const p = "the-charitology-fund",
        v = sample(p);
      v.context.name = "Fictional\r\nFund";
      const d = await start(p, v);
      await d.set("#pw-context-name", "FictionalFund", "change");
      await d.$("#pw-context").fire("submit");
      assert.equal(d.saved().context.name, "FictionalFund");
      let found;
      for (const p of programs) {
        for (const c of model.programWorkspaces[p].collections) {
          const field = c.fields.find((f) => f.optional && f.kind === "text");
          if (field) {
            found = { p, c, field };
            break;
          }
        }
        if (found) break;
      }
      assert.ok(found);
      const { p: program, c, field } = found,
        native = sample(program);
      native.records[c.key][0].values[field.key] = "\r\n";
      const nd = await start(program, native),
        id = native.records[c.key][0].id;
      await nd
        .$("#pw-rows-" + c.key)
        .querySelectorAll("button")
        .find((b) => b.textContent.startsWith("Edit "))
        .click();
      assert.equal(nd.get("#pw-" + c.key + "-" + field.key), "");
      await nd.set("#pw-" + c.key + "-" + field.key, "", "change");
      await editor(nd, c).querySelector("form").fire("submit");
      assert.equal(
        nd.saved().records[c.key].find((r) => r.id === id).values[field.key],
        "",
      );
    });
  },
);
check(
  "optional numeric unknown, exact zero and effective partner limits retain their meaning",
  async () => {
    const d = await start("the-charitology-fund");
    await d.set("#pw-context-budget", " ");
    await d.$("#pw-context").fire("submit");
    assert.equal(
      d.saved().context.budget,
      " ",
      "blank remains unknown without a trim rewrite",
    );
    await d.set("#pw-context-budget", "0");
    await d.$("#pw-context").fire("submit");
    assert.equal(d.saved().context.budget, "0");
    const saved = d.values.get(fullKey(d.program));
    for (const invalid of ["0.001", "1000000001", "-1"]) {
      await d.set("#pw-context-budget", invalid);
      await d.$("#pw-context").fire("submit");
      assert.equal(d.values.get(fullKey(d.program)), saved);
      assert.equal(d.get("#pw-context-budget"), invalid);
    }
  },
);
try {
  const pure = await build({
    stdin: {
      contents: "export * from './src/lib/client/partner-programs.ts';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    logLevel: "silent",
  });
  const purePath = join(temp, "model.mjs");
  await writeFile(purePath, pure.outputFiles[0].text);
  model = await import(pathToFileURL(purePath));
  const compiled = await transform(source, {
    filename: resolve(sourcePath),
    internalURL: "astro/compiler-runtime",
    resolvePath: async (s) => s,
  });
  assert.equal(compiled.diagnostics.filter((d) => d.severity === 1).length, 0);
  const component = await build({
    stdin: {
      contents: compiled.code,
      loader: "ts",
      resolveDir: dirname(resolve(sourcePath)),
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    packages: "external",
    plugins: [
      {
        name: "ignore-actual-SSR-css",
        setup(b) {
          b.onResolve({ filter: /(?:\?astro&type=style|\.css$)/ }, () => ({
            path: "style",
            namespace: "ignored-css",
          }));
          b.onLoad({ filter: /.*/, namespace: "ignored-css" }, () => ({
            contents: "",
            loader: "js",
          }));
          b.onLoad({ filter: /\.astro$/ }, async (args) => {
            const nested = await transform(await readFile(args.path, "utf8"), {
              filename: args.path,
              internalURL: "astro/compiler-runtime",
              resolvePath: async (s) => s,
            });
            assert.equal(
              nested.diagnostics.filter((d) => d.severity === 1).length,
              0,
            );
            return {
              contents: nested.code,
              loader: "ts",
              resolveDir: dirname(args.path),
            };
          });
        },
      },
    ],
    define: { "import.meta.env.BASE_URL": '"/charitology/"' },
    logLevel: "silent",
  });
  const componentPath = join(temp, "component.mjs");
  await writeFile(componentPath, component.outputFiles[0].text);
  const loaded = (await import(pathToFileURL(componentPath))).default,
    container = await AstroContainer.create();
  for (const p of programs)
    html.set(
      p,
      await container.renderToString(loaded, { props: { program: p } }),
    );
  const bundled = await build({
    stdin: {
      contents: scriptSource,
      loader: "ts",
      resolveDir: dirname(resolve(sourcePath)),
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    define: { "import.meta.env.BASE_URL": '"/charitology/"' },
    logLevel: "silent",
  });
  script = bundled.outputFiles[0].text;
  for (const [name, run] of checks) {
    await run();
    groups++;
    console.log("✓ " + name);
  }
  console.log(
    "Partner record recovery: " + groups + " actual SSR/mounted groups passed.",
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
