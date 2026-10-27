// Actual five-desk Astro SSR and actual async recovery facade. Fictional DOM only.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
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
const sourcePath = "src/components/programs/_program-workspace.astro";
const source = await readFile(sourcePath, "utf8"),
  scriptSource = source.match(/<script>([\s\S]*?)<\/script>/)[1];
const temp = await mkdtemp(join(resolve("node_modules"), ".program-desks-"));
const checks = [],
  html = new Map();
let groups = 0,
  serial = 0,
  script,
  model;
const STAMP = "2026-10-27T00:00:00.000Z";
const programs = [
  "university-chapters",
  "local-charitology",
  "time-charitology",
  "corporate-program",
  "policy-program",
];
const key = (p) => "program-workspace-v1." + p;
const fullKey = (p) => "charitology." + key(p);
const check = (name, run) => checks.push([name, run]);
const sample = (p) => ({
  ...model.sampleWorkspace(model.programWorkspaces[p]),
  updated: STAMP,
});
const hasWrite = (d) =>
  d.operations.some(([op]) => op === "set" || op === "remove");
async function start(p = "university-chapters", value = sample(p), opts = {}) {
  const d = installToolDom(
    html.get(p),
    value === null ? {} : { [key(p)]: value },
    opts,
  );
  d.program = p;
  d.action = (name) =>
    d
      .$("#pw-record-recovery")
      .querySelectorAll("button")
      .find((b) => b.dataset.prAction === name);
  d.result = () =>
    d
      .$("#pw-record-recovery")
      .querySelectorAll("p")
      .find((n) => n.dataset.prResult)?.textContent || "";
  d.discard = () =>
    d
      .$("#pw-record-recovery")
      .querySelectorAll("input")
      .find((n) => n.dataset.prDiscard === "true");
  d.file = () =>
    d
      .$("#pw-record-recovery")
      .querySelectorAll("input")
      .find((n) => n.dataset.prFile === "true");
  d.saved = () => JSON.parse(d.values.get(fullKey(p)));
  const release = opts.holdInitial ? await d.hold(key(p)) : null;
  const output = join(temp, "run-" + serial++ + ".mjs");
  await writeFile(output, script);
  await import(pathToFileURL(output));
  if (opts.early) await opts.early(d);
  release?.();
  await settleTools(() =>
    ["ready", "failed"].includes(d.root.dataset.prInitialization),
  );
  assert.equal(
    d.root.dataset.prInitialization,
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
  file.files = [
    new File([text], "fictional.json", { type: "application/json" }),
  ];
  await file.fire("change");
  await settleTools(() => !d.action("apply").hidden);
}
check(
  "all five SSR desks expose shared recovery and no direct storage or cleaner authority",
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
      /\b(?:localStorage|canPersist|parseWorkspace|validValues|confirmTwice)\b/,
    );
    assert.match(scriptSource, /await session\.saveCaptured/);
  },
);
check(
  "actual inline module strict-compiles with the real facade, schema and controls",
  async () => {
    const name = resolve(
      "src/components/programs/__program_records_inline__.ts",
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
  "sanitized display preserves untouched source strings across unrelated saves and failed-save status",
  async () => {
    await nativeControlSanitization(async () => {
      const p = "corporate-program",
        value = sample(p);
      value.context.name = "Fictional\r\nWorkplace";
      value.context.employees = "0x10";
      value.context.eligibility = "First line\r\nSecond line";
      const d = await start(p, value);
      assert.equal(d.get("#pw-context-name"), "FictionalWorkplace");
      assert.equal(d.get("#pw-context-eligibility"), "First line\nSecond line");
      assert.equal(d.$("#pw-context-employees").type, "text");
      assert.equal(
        d.$("#pw-context-employees").getAttribute("inputmode"),
        "decimal",
      );
      assert.match(
        d.$("#pw-context-employees-hint").textContent,
        /finite whole number from 0 to 10000000/,
      );
      assert.equal(d.get("#pw-context-employees"), "0x10");
      await d.set("#pw-context-currency", "New fictional unit");
      await d.$("#pw-context").fire("submit");
      assert.equal(d.saved().context.name, value.context.name);
      assert.equal(d.saved().context.eligibility, value.context.eligibility);
      assert.equal(d.saved().context.employees, "0x10");
      d.flags.failWrite = true;
      await d.set("#pw-context-currency", "Retained failed-save unit");
      await d.$("#pw-context").fire("submit");
      await settleTools(() => !d.action("retry").disabled);
      await d.action("forms").click();
      const forms = JSON.parse(await d.downloads.at(-1).text()).forms,
        context = forms.find((f) => f.form === "context");
      assert.equal(
        context.values.name,
        "FictionalWorkplace",
        "raw-form recovery is the actual exposed input value",
      );
      assert.equal(context.values.eligibility, "First line\nSecond line");
      await d.$("#pw-export").click();
      const failedNative = JSON.parse(await d.downloads.at(-1).text());
      assert.equal(
        failedNative.context.name,
        value.context.name,
        "native backup retains the exact admitted source separately",
      );
      assert.equal(failedNative.context.eligibility, value.context.eligibility);
      d.flags.failWrite = false;
      await d.action("retry").click();
      await settleTools(
        () => d.saved().context.currency === "Retained failed-save unit",
      );
      assert.equal(d.saved().context.name, value.context.name);
      assert.equal(d.saved().context.eligibility, value.context.eligibility);
      await d.set("#pw-context-name", "Deliberately edited field");
      await d.set("#pw-context-employees", " 10 ");
      await d.$("#pw-context").fire("submit");
      assert.equal(d.saved().context.name, "Deliberately edited field");
      assert.equal(d.saved().context.employees, " 10 ");
      assert.equal(d.saved().context.eligibility, value.context.eligibility);
      const old = d.values.get(fullKey(p));
      await d.set("#pw-context-employees", "-1");
      await d.$("#pw-context").fire("submit");
      assert.equal(d.values.get(fullKey(p)), old);
      assert.match(d.$("#pw-status").textContent, /bounds/);
    });
  },
);
check(
  "URL hydration retains exact source spelling until the URL field changes",
  async () => {
    await nativeControlSanitization(async () => {
      const p = "local-charitology",
        value = sample(p),
        config = model.programWorkspaces[p],
        c = config.collections[0],
        original = " \t https://example.invalid/source?q=one \t ";
      value.records[c.key][0].values.source = original;
      const d = await start(p, value),
        recordId = value.records[c.key][0].id;
      await d
        .$("#pw-rows-" + c.key)
        .querySelectorAll("button")
        .find((b) => b.textContent.startsWith("Edit "))
        .click();
      assert.equal(d.get("#pw-" + c.key + "-source"), original.trim());
      await d.set(
        "#pw-" + c.key + "-title",
        "Only the title deliberately changed",
      );
      await editor(d, c).querySelector("form").fire("submit");
      assert.equal(
        d.saved().records[c.key].find((r) => r.id === recordId).values.source,
        original,
      );
      await d
        .$("#pw-rows-" + c.key)
        .querySelectorAll("button")
        .find((b) => b.textContent.startsWith("Edit Only the title"))
        .click();
      const next = "https://example.invalid/revised";
      await d.set("#pw-" + c.key + "-source", next);
      await editor(d, c).querySelector("form").fire("submit");
      assert.equal(
        d.saved().records[c.key].find((r) => r.id === recordId).values.source,
        next,
      );
    });
  },
);
check(
  "explicit input and change revoke original hydration even after returning to its display",
  async () => {
    await nativeControlSanitization(async () => {
      const p = "university-chapters",
        value = sample(p);
      value.context.name = "Fictional\r\nChapter";
      value.context.meeting = "\r\n";
      const d = await start(p, value);
      assert.equal(d.get("#pw-context-name"), "FictionalChapter");
      assert.equal(d.get("#pw-context-meeting"), "");
      await d.set("#pw-context-name", "Intermediate explicit edit");
      await d.set("#pw-context-name", "FictionalChapter");
      await d.set("#pw-context-meeting", "", "change");
      await d.$("#pw-context").fire("submit");
      assert.equal(
        d.saved().context.name,
        "FictionalChapter",
        "editing away and back uses the explicitly edited spelling",
      );
      assert.equal(
        d.saved().context.meeting,
        "",
        "an explicit clear does not revive an invisible sanitized source",
      );
      assert.equal(
        d.saved().context.purpose,
        value.context.purpose,
        "untouched source spelling is still retained",
      );
    });
  },
);
check(
  "absent default does not claim saved; the first valid context persists without startup writes",
  async () => {
    const p = "corporate-program",
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
    const p = "university-chapters",
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
    await fillEditor(d, c, { ...values, date: "2026-02-30" });
    await editor(d, c).querySelector("form").fire("submit");
    assert.equal(d.values.get(fullKey(p)), before);
    assert.match(editor(d, c).querySelector("summary").textContent, /^Add /);
    await d.set("#pw-" + c.key + "-date", values.date);
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
    const p = "local-charitology",
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
    const d = await start("policy-program", '{"unfinished":');
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
    const d = await start("time-charitology", sample("time-charitology"), {
      unsupported: true,
    });
    assert.equal(hasWrite(d), false);
    assert.equal(d.$('#pw-context button[type="submit"]').disabled, true);
    assert.ok(d.$("#pw-kpis").textContent.length);
    assert.equal(d.$("#pw-export").disabled, false);
    await d.$("#pw-export").click();
    assert.equal(
      JSON.parse(await d.downloads.at(-1).text()).program,
      "time-charitology",
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
    d.file().files = [new File([JSON.stringify(next)], "fictional.json")];
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
    const p = "time-charitology",
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
  "dispose during held open never hydrates editors or mounts live recovery",
  async () => {
    const p = "local-charitology",
      d = installToolDom(html.get(p), { [key(p)]: sample(p) }),
      release = await d.hold(key(p));
    const output = join(temp, "run-" + serial++ + ".mjs");
    await writeFile(output, script);
    await import(pathToFileURL(output));
    await d.window.fire("pagehide");
    release();
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.notEqual(d.root.dataset.prInitialization, "ready");
    assert.equal(
      d.$("#pw-record-recovery").querySelector("[data-pr-recovery]"),
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
    const p = "policy-program",
      before = sample(p),
      d = await start(p, before, {
        holdInitial: true,
        expectFailed: true,
        early: async (d) => {
          assert.equal(d.$('#pw-context button[type="submit"]').disabled, true);
          d.$("#pw-kpis").remove();
        },
      });
    assert.equal(d.root.dataset.prInitialization, "failed");
    assert.match(
      d.$("#pw-status").textContent,
      /Initialization failed.*Missing element: #pw-kpis/,
    );
    assert.equal(
      d.$("#pw-record-recovery").querySelector("[data-pr-recovery]"),
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
try {
  const pure = await build({
    stdin: {
      contents:
        "export * from './src/lib/client/program-workspaces.ts';export {programWorkspaces} from './src/data/program-workspaces.ts';",
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
          b.onResolve({ filter: /\?astro&type=style/ }, () => ({
            path: "style",
            namespace: "ignored-css",
          }));
          b.onLoad({ filter: /.*/, namespace: "ignored-css" }, () => ({
            contents: "",
            loader: "js",
          }));
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
    "General program recovery: " +
      groups +
      " actual SSR/mounted groups passed.",
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
