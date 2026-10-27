// Actual Astro SSR + actual inline module in a bounded fictional DOM.
// No browser/layout/native-save, network, provider or real localStorage proof.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
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
import { osEnvelope } from "../test-fixtures/program-record-recovery/factory.mjs";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const sourcePath = "src/components/tools/charity-os.astro",
  source = await readFile(sourcePath, "utf8"),
  scriptSource = source.match(/<script>([\s\S]*?)<\/script>/)[1];
const temp = await mkdtemp(join(resolve("node_modules"), ".program-os-"));
let groups = 0,
  serial = 0;
const checks = [];
const check = (name, fn) => checks.push([name, fn]);
ToolElement.prototype.showModal = function () {
  this.open = true;
};
ToolElement.prototype.close = function () {
  this.open = false;
  void this.fire("close");
};
ToolElement.prototype.prepend = function (...nodes) {
  for (const node of nodes.reverse()) this.insertBefore(node, this.firstChild);
};
let html, script;
async function start(initial = {}, options = {}) {
  const d = installToolDom(html, initial, options);
  const file = join(temp, "run-" + serial++ + ".mjs");
  await writeFile(file, script);
  await import(pathToFileURL(file));
  d.action = (name) =>
    d
      .$("#os-record-recovery")
      .querySelectorAll("button")
      .find((button) => button.dataset.prAction === name);
  d.result = () =>
    d
      .$("#os-record-recovery")
      .querySelectorAll("p")
      .find((p) => p.dataset.prResult)?.textContent || "";
  d.discard = () =>
    d
      .$("#os-record-recovery")
      .querySelectorAll("input")
      .find((input) => input.dataset.prDiscard === "true");
  d.file = () =>
    d
      .$("#os-record-recovery")
      .querySelectorAll("input")
      .find((input) => input.dataset.prFile === "true");
  d.choose = async (file) => {
    d.file().files = file ? [file] : [];
    await d.file().fire("change");
  };
  d.saved = () => JSON.parse(d.values.get("charitology.charity-os"));
  await settleTools(
    () =>
      d.root.dataset.prInitialization === "ready" ||
      d.root.dataset.prInitialization === "failed",
  );
  assert.equal(
    d.root.dataset.prInitialization,
    "ready",
    d.$("#os-status").textContent,
  );
  return d;
}
async function idle(d) {
  await settleTools(() => !d.action("reload").disabled);
}
async function submitContext(d, name) {
  await d.set("#os-organization", name);
  await d.$("#os-context-form").fire("submit");
}
async function choose(d, raw) {
  await d.choose(
    new File([raw], "fictional-os.json", { type: "application/json" }),
  );
  await settleTools(() => d.action("apply").hidden === false);
}
function hasWrite(d) {
  return d.operations.some(([kind]) => kind === "set" || kind === "remove");
}
check(
  "SSR has default-disabled context and no old direct storage/import bypass",
  async () => {
    assert.match(html, /<fieldset[^>]*id="os-context-controls"[^>]*disabled/);
    assert.doesNotMatch(
      scriptSource,
      /\b(?:saveWorkspace|loadWorkspace|canPersist|parseWorkspace|workspaceJson)\b/,
    );
    assert.doesNotMatch(
      html,
      /id="os-(?:file|import-apply|keep-local|recovery-reset)"/,
    );
  },
);
check(
  "actual inline module strict-compiles with actual engine/controls imports",
  async () => {
    const filename = resolve("src/components/tools/__program_os_inline__.ts"),
      options = {
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
    host.readFile = (p) => (resolve(p) === filename ? scriptSource : read(p));
    host.fileExists = (p) => resolve(p) === filename || exists(p);
    host.getSourceFile = (p, language, ...args) =>
      resolve(p) === filename
        ? ts.createSourceFile(p, scriptSource, language, true)
        : get(p, language, ...args);
    const program = ts.createProgram([filename], options, host),
      diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(
      diagnostics.length,
      0,
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (x) => x,
        getCurrentDirectory: () => process.cwd(),
        getNewLine: () => "\n",
      }),
    );
  },
);
check(
  "absent initial UI is unsaved, writes nothing and enables only intercepted local context",
  async () => {
    const d = await start();
    assert.match(d.$("#os-save-state").textContent, /not saved/);
    assert.equal(hasWrite(d), false);
    assert.equal(d.$("#os-context-controls").disabled, false);
    const event = await d.$("#os-context-form").fire("submit");
    assert.equal(event.defaultPrevented, true);
    await settleTools(() => d.values.has("charitology.charity-os"));
    assert.equal(location.search, "");
    assert.equal(d.values.get("unrelated.private.key"), "unchanged");
    await d.window.fire("pagehide");
  },
);
check(
  "actual context save retains exact free text, uses awaited persistence and native clock",
  async () => {
    const d = await start();
    await d.set("#os-mission", "  retained mission  ");
    await submitContext(d, "  Fictional team  ");
    await settleTools(() => d.values.has("charitology.charity-os"));
    assert.equal(d.saved().workspace.organization, "  Fictional team  ");
    assert.equal(d.saved().workspace.mission, "  retained mission  ");
    assert.match(d.saved().exportedAt, /\.\d{3}Z$/);
    assert.match(d.$("#os-status").textContent, /Saved mission/);
    await d.window.fire("pagehide");
  },
);
check(
  "held context save cannot reset newer context fields or write stale candidate",
  async () => {
    const d = await start({ "charity-os": osEnvelope() });
    const before = d.values.get("charitology.charity-os"),
      release = await d.hold("charity-os");
    await submitContext(d, "Queued");
    await d.set("#os-organization", "Newer unsaved");
    release();
    await settleTools(() => /newer edit/i.test(d.$("#os-status").textContent));
    assert.equal(d.get("#os-organization"), "Newer unsaved");
    assert.equal(d.values.get("charitology.charity-os"), before);
    assert.match(d.$("#os-save-state").textContent, /unfinished/);
    await d.window.fire("pagehide");
  },
);
check(
  "failed context set retains desired native memory and separate raw forms; Retry never redraws them",
  async () => {
    const d = await start();
    d.flags.failWrite = true;
    await submitContext(d, "Desired saved record");
    await settleTools(() =>
      /could not save/i.test(d.$("#os-status").textContent),
    );
    assert.equal(d.values.has("charitology.charity-os"), false);
    assert.equal(d.get("#os-organization"), "Desired saved record");
    await d.$("#os-json").click();
    const native = JSON.parse(await d.downloads.at(-1).text());
    assert.equal(native.workspace.organization, "Desired saved record");
    await d.set("#os-organization", "Newer raw form");
    await d.action("forms").click();
    const forms = JSON.parse(await d.downloads.at(-1).text());
    assert.equal(forms.forms[0].values.organization, "Newer raw form");
    d.flags.failWrite = false;
    await d.action("retry").click();
    await idle(d);
    assert.equal(d.saved().workspace.organization, "Desired saved record");
    assert.equal(d.get("#os-organization"), "Newer raw form");
    assert.equal(d.$("#os-context-controls").disabled, false);
    assert.equal(d.$('[data-add="tasks"]').disabled, false);
    assert.match(
      d.$("#os-save-state").textContent,
      /Saved records.*unfinished/,
    );
    await d.window.fire("pagehide");
  },
);
check(
  "corrupt saved A shows no blank loaded workspace and keeps original raw copy",
  async () => {
    const d = await start({ "charity-os": "A{corrupt" });
    assert.match(d.$("#os-save-state").textContent, /No validated/);
    assert.equal(d.$("#os-context-controls").disabled, true);
    assert.equal(d.$("#os-projects").hidden, true);
    assert.equal(d.$("#os-json").disabled, true);
    assert.equal(hasWrite(d), false);
    await d.action("protected").click();
    const archive = JSON.parse(await d.downloads.at(-1).text());
    assert.equal(archive.raw, "A{corrupt");
    assert.equal(d.values.get("charitology.charity-os"), "A{corrupt");
    await d.window.fire("pagehide");
  },
);
check(
  "actual file restore A then invalid B cannot reuse Apply; successful reviewed restore retains native bytes",
  async () => {
    const d = await start();
    const n = osEnvelope(),
      raw = JSON.stringify(n, null, 2);
    await choose(d, raw);
    await d.choose(new File(["bad"], "invalid.json"));
    assert.equal(d.action("apply").hidden, true);
    assert.equal(d.values.has("charitology.charity-os"), false);
    await choose(d, raw);
    await d.action("apply").click();
    await idle(d);
    assert.equal(d.values.get("charitology.charity-os"), raw);
    assert.equal(d.get("#os-organization"), n.workspace.organization);
    await d.window.fire("pagehide");
  },
);
check(
  "file restore requires discard for dirty fields and preserves them until deliberate Apply",
  async () => {
    const d = await start();
    await d.set("#os-organization", "Private unfinished");
    await d.choose(new File([JSON.stringify(osEnvelope())], "fictional.json"));
    await settleTools(() => /discard/i.test(d.result()));
    assert.equal(d.action("apply").hidden, true);
    assert.equal(d.get("#os-organization"), "Private unfinished");
    d.discard().checked = true;
    await d.discard().fire("change");
    await choose(d, JSON.stringify(osEnvelope()));
    assert.equal(d.get("#os-organization"), "Private unfinished");
    await d.action("apply").click();
    await idle(d);
    assert.equal(
      d.get("#os-organization"),
      osEnvelope().workspace.organization,
    );
    await d.window.fire("pagehide");
  },
);
check(
  "editor is intercepted before dynamic fields; unknown, zero and negative outcomes save without ID repair",
  async () => {
    const d = await start();
    await d.$('[data-add="outcomes"]').click();
    assert.equal(d.$("#os-editor").open, true);
    await d.set("#os-field-indicator", "  Fictional harm  ");
    await d.set("#os-field-value", "-1.25");
    const e = await d.$("#os-editor-form").fire("submit");
    assert.equal(e.defaultPrevented, true);
    await settleTools(() => d.values.has("charitology.charity-os"));
    assert.equal(
      d.saved().workspace.outcomes[0].indicator,
      "  Fictional harm  ",
    );
    assert.equal(d.saved().workspace.outcomes[0].value, -1.25);
    const id = d.saved().workspace.outcomes[0].id;
    await settleTools(() => d.$("#os-editor").open === false);
    const edit = d
      .$("#os-outcome-list")
      .querySelector('button[aria-label="Edit   Fictional harm  "]');
    assert.ok(edit);
    await edit.click();
    await d.set("#os-field-value", "");
    await d.$("#os-editor-form").fire("submit");
    await settleTools(() => d.saved().workspace.outcomes[0].value === null);
    assert.equal(d.saved().workspace.outcomes[0].id, id);
    await d.window.fire("pagehide");
  },
);
check(
  "failed new record retains editor fields and same desired ID for native backup/Retry",
  async () => {
    const d = await start();
    await d.$('[data-add="tasks"]').click();
    await d.set("#os-field-title", "Fictional failed task");
    d.flags.failWrite = true;
    await d.$("#os-editor-form").fire("submit");
    await settleTools(() =>
      /could not save/i.test(d.$("#os-status").textContent),
    );
    assert.equal(d.$("#os-editor").open, true);
    assert.equal(d.get("#os-field-title"), "Fictional failed task");
    await d.$("#os-json").click();
    const n = JSON.parse(await d.downloads.at(-1).text()),
      id = n.workspace.tasks[0].id;
    assert.equal(d.values.has("charitology.charity-os"), false);
    d.flags.failWrite = false;
    await d.action("retry").click();
    await idle(d);
    assert.equal(d.saved().workspace.tasks[0].id, id);
    assert.equal(d.$("#os-editor").open, true);
    assert.equal(d.get("#os-field-title"), "Fictional failed task");
    await d.window.fire("pagehide");
  },
);
check(
  "held record save keeps a newer editor draft open and leaves disk unchanged",
  async () => {
    const d = await start({ "charity-os": osEnvelope() });
    await d.$('[data-add="tasks"]').click();
    await d.set("#os-field-title", "Queued task");
    const before = d.values.get("charitology.charity-os"),
      release = await d.hold("charity-os");
    await d.$("#os-editor-form").fire("submit");
    await d.set("#os-field-title", "Newer task draft");
    release();
    await settleTools(() => /newer edit/i.test(d.$("#os-status").textContent));
    assert.equal(d.$("#os-editor").open, true);
    assert.equal(d.get("#os-field-title"), "Newer task draft");
    assert.equal(d.values.get("charitology.charity-os"), before);
    await d.window.fire("pagehide");
  },
);
check(
  "project deletion previews exact linked counts, unlinks rather than deleting, and keeps context draft",
  async () => {
    const d = await start({ "charity-os": osEnvelope() });
    await d.set("#os-organization", "Unfinished context");
    const remove = d
      .$("#os-project-list")
      .querySelector('button[aria-label="Delete Fictional project"]');
    await remove.click();
    assert.match(
      d.$("#os-status").textContent,
      /1 grants, 1 tasks and 2 observations/,
    );
    assert.equal(d.saved().workspace.projects.length, 1);
    await remove.click();
    await settleTools(() => d.saved().workspace.projects.length === 0);
    for (const kind of ["grants", "tasks", "outcomes"])
      assert.ok(d.saved().workspace[kind].every((row) => row.projectId === ""));
    assert.equal(d.get("#os-organization"), "Unfinished context");
    assert.match(d.$("#os-save-state").textContent, /unfinished/);
    await d.window.fire("pagehide");
  },
);
check("filters never shrink native/CSV exports", async () => {
  const d = await start({ "charity-os": osEnvelope() });
  await d.set("#os-search", "no row matches");
  await d.$("#os-json").click();
  const n = JSON.parse(await d.downloads.at(-1).text());
  assert.equal(n.workspace.projects.length, 1);
  assert.equal(n.workspace.outcomes.length, 3);
  await d.$("#os-csv").click();
  const csv = await d.downloads.at(-1).text();
  assert.match(csv, /Fictional project/);
  assert.match(csv, /Fictional negative/);
  await d.window.fire("pagehide");
});
check(
  "fictional sample is a guarded reviewed replacement; newer input revokes Apply",
  async () => {
    const d = await start();
    await d.set("#os-organization", "Keep raw");
    await d.$("#os-sample").click();
    await settleTools(() => /discard/i.test(d.$("#os-status").textContent));
    assert.equal(d.$("#os-sample-preview").hidden, true);
    await d.set("#os-sample-discard", true, "change");
    await d.$("#os-sample").click();
    await settleTools(() => d.$("#os-sample-preview").hidden === false);
    assert.equal(d.values.has("charitology.charity-os"), false);
    assert.match(d.$("#os-sample-summary").textContent, /FICTIONAL/);
    await d.set("#os-organization", "Newer raw");
    assert.equal(d.$("#os-sample-preview").hidden, true);
    await d.$("#os-sample-apply").click();
    assert.equal(d.values.has("charitology.charity-os"), false);
    assert.equal(d.get("#os-organization"), "Newer raw");
    await d.window.fire("pagehide");
  },
);
check(
  "reviewed sample, remove and Undo run actual recovery and preserve unrelated keys",
  async () => {
    const d = await start();
    await d.$("#os-sample").click();
    await settleTools(() => !d.$("#os-sample-preview").hidden);
    await d.$("#os-sample-apply").click();
    await settleTools(() => d.values.has("charitology.charity-os"));
    const old = d.values.get("charitology.charity-os");
    await settleTools(() => !d.$("#os-sample").disabled);
    await d.action("review-remove").click();
    await settleTools(() => !d.action("apply").hidden);
    await d.action("apply").click();
    await idle(d);
    assert.equal(d.values.has("charitology.charity-os"), false);
    assert.match(d.$("#os-save-state").textContent, /not saved/);
    await d.action("undo").click();
    await idle(d);
    assert.equal(d.values.get("charitology.charity-os"), old);
    assert.equal(d.values.get("unrelated.private.key"), "unchanged");
    await d.window.fire("pagehide");
  },
);
check(
  "external storage notice never adopts or overwrites newer raw fields",
  async () => {
    const d = await start({ "charity-os": osEnvelope() });
    await d.set("#os-organization", "Raw stays");
    const b = osEnvelope();
    b.workspace.organization = "Other tab";
    d.values.set("charitology.charity-os", JSON.stringify(b));
    await d.window.fire("storage", { key: "charitology.charity-os" });
    await settleTools(() => /Another tab/i.test(d.$("#os-status").textContent));
    assert.equal(d.get("#os-organization"), "Raw stays");
    assert.equal(d.$("#os-context-controls").disabled, true);
    assert.equal(d.saved().workspace.organization, "Other tab");
    await d.window.fire("pagehide");
  },
);
check(
  "failed recovery status adopts desired records/cards/CSV without resetting raw forms",
  async () => {
    const d = await start({ "charity-os": osEnvelope() });
    await d.set("#os-organization", "Unfinished raw context");
    d.discard().checked = true;
    await d.discard().fire("change");
    const n = osEnvelope();
    n.workspace.organization = "Desired imported records";
    n.workspace.projects[0].title = "Desired imported project";
    await choose(d, JSON.stringify(n));
    d.flags.failWrite = true;
    await d.action("apply").click();
    await idle(d);
    assert.equal(
      d.saved().workspace.organization,
      osEnvelope().workspace.organization,
    );
    assert.equal(d.get("#os-organization"), "Unfinished raw context");
    assert.match(
      d.$("#os-project-list").textContent,
      /Desired imported project/,
    );
    assert.match(d.$("#os-save-state").textContent, /unsaved memory/);
    await d.$("#os-csv").click();
    assert.match(await d.downloads.at(-1).text(), /Desired imported project/);
    d.flags.failWrite = false;
    await d.action("retry").click();
    await idle(d);
    assert.equal(d.saved().workspace.organization, "Desired imported records");
    assert.equal(d.get("#os-organization"), "Unfinished raw context");
    assert.equal(d.$("#os-context-controls").disabled, false);
    await d.window.fire("pagehide");
  },
);
check(
  "failed native download keeps fields and saved bytes intact",
  async () => {
    const d = await start({ "charity-os": osEnvelope() });
    await d.set("#os-organization", "Keep raw fields");
    const before = d.values.get("charitology.charity-os"),
      create = URL.createObjectURL;
    URL.createObjectURL = () => {
      throw Error("Synthetic native download refusal");
    };
    try {
      await d.$("#os-json").click();
    } finally {
      URL.createObjectURL = create;
    }
    assert.match(
      d.$("#os-status").textContent,
      /Synthetic native download refusal/,
    );
    assert.equal(d.get("#os-organization"), "Keep raw fields");
    assert.equal(d.values.get("charitology.charity-os"), before);
    const leaving = await d.window.fire("beforeunload");
    assert.equal(leaving.defaultPrevented, true);
    await d.window.fire("pagehide");
  },
);
check(
  "disposal during held async open leaves fields disabled and never mounts a live writer",
  async () => {
    const d = installToolDom(html),
      release = await d.hold("charity-os"),
      file = join(temp, "run-" + serial++ + ".mjs");
    await writeFile(file, script);
    await import(pathToFileURL(file));
    await d.window.fire("pagehide");
    release();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(d.$("#os-context-controls").disabled, true);
    assert.equal(d.values.has("charitology.charity-os"), false);
    assert.equal(d.$('[data-add="tasks"]').disabled, true);
    assert.notEqual(d.root.dataset.prInitialization, "ready");
  },
);
check(
  "post-read initialization failure disposes the mounted writer and keeps early submit protection",
  async () => {
    const d = installToolDom(html, { "charity-os": osEnvelope() });
    d.$("#os-task-list").remove();
    const before = d.values.get("charitology.charity-os"),
      file = join(temp, "run-" + serial++ + ".mjs");
    await writeFile(file, script);
    await import(pathToFileURL(file));
    await settleTools(() => d.root.dataset.prInitialization === "failed");
    assert.equal(d.$("#os-context-controls").disabled, true);
    assert.equal(
      d.$("#os-record-recovery").querySelector("[data-pr-recovery]"),
      null,
    );
    assert.equal(d.$('[data-add="tasks"]').disabled, true);
    assert.equal(
      (await d.$("#os-context-form").fire("submit")).defaultPrevented,
      true,
    );
    assert.equal(d.values.get("charitology.charity-os"), before);
    assert.equal(hasWrite(d), false);
  },
);
check(
  "missing locks makes existing records read-only, exportable and never replaced",
  async () => {
    const d = await start(
      { "charity-os": osEnvelope() },
      { unsupported: true },
    );
    assert.equal(d.$("#os-context-controls").disabled, true);
    assert.equal(d.$('[data-add="tasks"]').disabled, true);
    assert.equal(d.$("#os-json").disabled, false);
    await d.$("#os-json").click();
    assert.equal(
      JSON.parse(await d.downloads.at(-1).text()).workspace.organization,
      osEnvelope().workspace.organization,
    );
    assert.equal(hasWrite(d), false);
    await d.window.fire("pagehide");
  },
);
try {
  const compiled = await transform(source, {
    filename: sourcePath,
    internalURL: "astro/compiler-runtime",
    renderScript: true,
    resolvePath: async (x) => x,
  });
  assert.equal(compiled.diagnostics.filter((d) => d.severity === 1).length, 0);
  const componentPath = join(temp, "component.mjs");
  await build({
    stdin: {
      contents: compiled.code.replace(
        /^import\s+"[^"]+\?astro&type=style[^"]*";$/gm,
        "",
      ),
      loader: "ts",
      resolveDir: resolve("src/components/tools"),
    },
    outfile: componentPath,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    define: {
      "import.meta.env.BASE_URL": '"/"',
      "import.meta.env.SITE": '"https://example.invalid"',
    },
    logLevel: "silent",
  });
  const component = (await import(pathToFileURL(componentPath))).default,
    container = await AstroContainer.create();
  html = await container.renderToString(component);
  const code = await build({
    stdin: {
      contents: scriptSource,
      loader: "ts",
      resolveDir: resolve("src/components/tools"),
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    logLevel: "silent",
  });
  script = code.outputFiles[0].text;
  for (const [name, fn] of checks) {
    try {
      await fn();
      groups++;
      console.log("PASS " + name);
    } catch (error) {
      error.message = name + ": " + error.message;
      throw error;
    }
  }
  console.log(
    `Charity OS program recovery: ${groups} actual SSR/mounted groups passed.`,
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
