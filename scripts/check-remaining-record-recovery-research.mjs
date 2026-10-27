// Actual seven-config Astro SSR and inline RR controller; fictional DOM only.
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
import {
  actual,
  producers,
  researchValue,
  clone,
  STAMP,
} from "../test-fixtures/remaining-record-recovery/harness.mjs";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
ToolElement.prototype.dispatchEvent = function (event) {
  for (const l of this.listeners.get(event.type) || []) l.fn(event);
  return !event.defaultPrevented;
};
const sourcePath = "src/components/programs/ResearchWorkspace.astro",
  source = await readFile(sourcePath, "utf8"),
  inline = source.match(/<script>([\s\S]*?)<\/script>/)[1],
  temp = await mkdtemp(join(resolve("node_modules"), ".remaining-research-"));
const model = await actual(),
  { research } = await producers(),
  programs = Object.keys(research),
  html = new Map();
let script,
  serial = 0,
  groups = 0;
const checks = [],
  check = (name, run) => checks.push([name, run]);
const full = (p) => `charitology.research-program.${p}.v1`,
  short = (p) => `research-program.${p}.v1`,
  field = (p, k) => `#${p}-${k}`,
  sample = (p) => researchValue(model, p),
  hasWrite = (d) =>
    d.operations.some(([op]) => op === "set" || op === "remove");
async function start(p = "methods-lab", value = sample(p), opts = {}) {
  const d = installToolDom(
    html.get(p),
    value === null ? {} : { [short(p)]: value },
    opts,
  );
  d.program = p;
  d.saved = () =>
    d.values.has(full(p))
      ? JSON.parse(d.values.get(full(p)))
      : clone(model.defaultRemainingRecordValue(full(p)));
  d.action = (name) =>
    d.root.querySelectorAll("button").find((b) => b.dataset.rrAction === name);
  d.control = (name) =>
    d.root.querySelectorAll("input").find((b) => b.dataset[name] === "true");
  d.status = () => d.$("[data-status]").textContent;
  d.native = async () => {
    await d.$("[data-json]").click();
    return JSON.parse(await d.downloads.at(-1).text());
  };
  d.dispose = () => d.window.fire("pagehide");
  const release = opts.holdInitial ? await d.hold(short(p)) : null;
  const file = join(temp, "script-" + serial++ + ".mjs");
  await writeFile(file, script);
  await import(pathToFileURL(file));
  if (opts.early) await opts.early(d);
  release?.();
  await settleTools(() =>
    ["ready", "failed"].includes(d.root.dataset.rrInitialization),
  );
  assert.equal(
    d.root.dataset.rrInitialization,
    opts.fail ? "failed" : "ready",
    d.status(),
  );
  return d;
}
async function saveDraft(d) {
  await d.$("[data-save-draft]").click();
  await settleTools(() =>
    /saved in this browser|refused|required|outside|not present|only in memory|Retry|pending|exact/i.test(
      d.status(),
    ),
  );
}
async function inputAll(d, values) {
  for (const [k, v] of Object.entries(values))
    await d.set(field(d.program, k), v);
}
async function submit(d) {
  await d.$("form").fire("submit");
  await settleTools(() =>
    /saved in this browser|only in memory|frozen version|required|explicitly|outside|first|limit|at most|bounds|Retry|pending/i.test(
      d.status(),
    ),
  );
}
const sameIdButton = (d, attr, id) =>
  d
    .$("[data-records]")
    .querySelectorAll("button")
    .find((b) => b.dataset[attr] === id);
async function importFile(d, text) {
  d.control("rrFile").files = [{ size: Buffer.byteLength(text), data: text }];
  await d.control("rrFile").fire("change");
  await settleTools(
    () =>
      !d.action("apply").hidden ||
      /discard|schema|failed|invalid|limit/.test(
        d.root.querySelector("[data-rr-result]").textContent,
      ),
  );
}
function installReader() {
  class Reader {
    result = null;
    error = null;
    onload = null;
    onerror = null;
    onabort = null;
    readAsArrayBuffer(file) {
      queueMicrotask(() => {
        this.result = new TextEncoder().encode(file.data).buffer;
        this.onload?.({ target: this });
      });
    }
    abort() {
      this.onabort?.({ target: this });
    }
  }
  globalThis.FileReader = Reader;
}
check(
  "actual inline controller strict0 with real core/autosaver/controls and no legacy persistence calls",
  async () => {
    const name = resolve("src/components/programs/__rr_research_inline__.ts"),
      options = {
        strict: true,
        noEmit: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        skipLibCheck: true,
        lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
        types: [],
      },
      host = ts.createCompilerHost(options),
      get = host.getSourceFile.bind(host),
      read = host.readFile.bind(host),
      exists = host.fileExists.bind(host);
    host.readFile = (p) => (resolve(p) === name ? inline : read(p));
    host.fileExists = (p) => resolve(p) === name || exists(p);
    host.getSourceFile = (p, l, ...rest) =>
      resolve(p) === name
        ? ts.createSourceFile(p, inline, l, true)
        : get(p, l, ...rest);
    const ds = ts.getPreEmitDiagnostics(
      ts.createProgram([name], options, host),
    );
    assert.equal(
      ds.length,
      0,
      ts.formatDiagnostics(ds, {
        getCanonicalFileName: (p) => p,
        getCurrentDirectory: () => process.cwd(),
        getNewLine: () => "\n",
      }),
    );
    assert.doesNotMatch(
      inline,
      /\bresearchStorage\b|\bvalidateResearchState\b|\bmountResearchWorkspaces\b|\blocalStorage\b/,
    );
    assert.match(inline, /await session\.saveCaptured/);
  },
);
check(
  "all7 SSR private controls defaultdisabled, legacy mount suppressed, full current102 named fields retained",
  () => {
    let count = 0;
    for (const p of programs) {
      const d = installToolDom(html.get(p));
      assert.equal(d.root.dataset.ready, "remaining-record");
      assert.equal(d.$("[data-private-form-controls]").disabled, true);
      assert.equal(d.$("[data-json]").disabled, true);
      assert.equal(d.$("[data-markdown]").disabled, true);
      assert.equal(d.$("[data-csv]").disabled, true);
      const names = d
        .$("form")
        .querySelectorAll("input,textarea,select")
        .filter((f) => f.name)
        .map((f) => f.name);
      assert.deepEqual(
        names,
        research[p].fields.map((f) => f.key),
      );
      count += names.length;
      for (const f of research[p].fields.filter(
        (f) => f.type === "number" || f.type === "date",
      ))
        assert.equal(d.$(field(p, f.key)).type, "text");
      assert.doesNotMatch(
        html.get(p),
        /data-confirm-import|data-clear|data-undo/,
      );
    }
    assert.equal(count, 102);
  },
);
for (const p of programs)
  check(
    `${p}: actual startup no writes, sparse draft exact overlay, JSON/memo/CSV and other-key isolation`,
    async () => {
      const v = sample(p);
      v.draft = { title: "  unfinished " + p + "  ", source: "https://" };
      const d = await start(p, v);
      assert.equal(hasWrite(d), false);
      assert.equal(d.get(field(p, "title")), v.draft.title);
      assert.equal(d.get(field(p, "source")), "https://");
      const out = await d.native();
      assert.deepEqual(out, v);
      assert.deepEqual(Object.keys(out.draft), ["title", "source"]);
      await d.$("[data-markdown]").click();
      assert.match(await d.downloads.at(-1).text(), /Current draft/);
      await d.$("[data-csv]").click();
      const csv = await d.downloads.at(-1).text();
      assert.ok(csv.includes(v.records[0].values.title));
      assert.ok(!csv.includes("unfinished " + p));
      assert.equal(d.values.get("unrelated.private.key"), "unchanged");
      await d.dispose();
    },
  );
check(
  "250ms autosave coalesces latestpartial text and never treats draft as saved record",
  async () => {
    const d = await start("methods-lab", null);
    await d.set(field(d.program, "costLow"), "-e");
    await d.set(field(d.program, "title"), "first");
    await d.set(field(d.program, "title"), "latest exact");
    assert.equal(hasWrite(d), false);
    const guard = await d.window.fire("beforeunload");
    assert.equal(guard.defaultPrevented, true);
    await settleTools(() => d.values.has(full(d.program)));
    assert.equal(d.saved().draft.costLow, "-e");
    assert.equal(d.saved().draft.title, "latest exact");
    assert.equal(d.saved().records.length, 0);
    assert.equal(d.operations.filter(([op]) => op === "set").length, 1);
    await d.dispose();
  },
);
check(
  "explicitpartialsave preserves invalid number/date/select drafts and does not pad sparse fields",
  async () => {
    const p = "replication-program",
      v = sample(p);
    v.draft = {
      due: "2026-0",
      kind: "unrecognized partial choice",
      source: "https://",
    };
    const d = await start(p, v);
    assert.equal(d.get(field(p, "due")), "2026-0");
    assert.equal(d.get(field(p, "kind")), "unrecognized partial choice");
    await d.set(field(p, "amendments"), "  draft note ");
    await saveDraft(d);
    await settleTools(() => d.saved().draft.amendments === "  draft note ");
    assert.deepEqual(d.saved().draft, {
      ...v.draft,
      amendments: "  draft note ",
    });
    assert.equal(d.saved().records.length, 1);
    await d.dispose();
  },
);
check(
  "all6 unfrozen programs edit sameID, preserve createdAt and rawfree text, and successfulcurrent save resets onlythat draft",
  async () => {
    for (const p of programs.filter((p) => p !== "replication-program")) {
      const d = await start(p),
        id = d.saved().records[0].id;
      await sameIdButton(d, "researchEdit", id).click();
      await settleTools(
        () =>
          d.get(field(p, "title")) === d.saved().records[0].values.title &&
          d.saved().editing === id,
      );
      const created = d.saved().records[0].createdAt;
      await d.set(field(p, "title"), "  Edited exact " + p + "  ");
      await submit(d);
      await settleTools(
        () =>
          d.saved().records[0].values.title === "  Edited exact " + p + "  ",
      );
      assert.equal(d.saved().records.length, 1);
      assert.equal(d.saved().records[0].id, id);
      assert.equal(d.saved().records[0].createdAt, created);
      assert.equal(d.get(field(p, "title")), "");
      assert.equal(d.saved().editing, null);
      await d.dispose();
    }
  },
);
check(
  "failed-new then newer rawtyping Retry and resubmit keeps one identical admittedID",
  async () => {
    const d = await start("methods-lab", null),
      v = sample(d.program).records[0].values;
    await inputAll(d, v);
    d.flags.failWrite = true;
    await submit(d);
    await settleTools(() => !d.action("retry").disabled);
    const failed = await d.native(),
      id = failed.records[0].id;
    assert.equal(failed.records.length, 1);
    assert.equal(failed.records[0].createdAt, failed.records[0].updatedAt);
    await d.set(field(d.program, "title"), "newer raw title");
    d.flags.failWrite = false;
    await d.action("retry").click();
    await settleTools(() => d.saved().records.length === 1);
    assert.equal(d.get(field(d.program, "title")), "newer raw title");
    await submit(d);
    await settleTools(
      () => d.saved().records[0].values.title === "newer raw title",
    );
    assert.equal(d.saved().records.length, 1);
    assert.equal(d.saved().records[0].id, id);
    await d.dispose();
  },
);
check(
  "failed-new frozen version Retry retains newer draft but ordinaryresubmitrefused until explicitFork establishesnewID",
  async () => {
    const d = await start("replication-program", null);
    await inputAll(d, sample(d.program).records[0].values);
    d.flags.failWrite = true;
    await submit(d);
    await settleTools(() => !d.action("retry").disabled);
    const old = (await d.native()).records[0],
      id = old.id;
    await d.set(field(d.program, "title"), "newer frozen working text");
    d.flags.failWrite = false;
    await d.action("retry").click();
    await settleTools(() => d.values.has(full(d.program)));
    await submit(d);
    assert.match(d.status(), /already saved.*Fork/);
    assert.equal(d.saved().records.length, 1);
    assert.deepEqual(d.saved().records[0], old);
    assert.equal(d.get(field(d.program, "title")), "newer frozen working text");
    await sameIdButton(d, "researchEdit", id).click();
    await settleTools(
      () => d.get(field(d.program, "title")) === old.values.title,
    );
    await d.set(field(d.program, "title"), "explicit second version");
    await submit(d);
    await settleTools(() => d.saved().records.length === 2);
    assert.notEqual(d.saved().records[1].id, id);
    assert.deepEqual(d.saved().records[0], old);
    await d.dispose();
  },
);
check(
  "pre-admission refusal leaves no proposedID; a later validnew record can saveonce",
  async () => {
    const d = await start("methods-lab", null);
    await inputAll(d, sample(d.program).records[0].values);
    await d.set(field(d.program, "title"), "x".repeat(8001));
    await d.$("form").fire("submit");
    assert.equal(hasWrite(d), false);
    await d.set(field(d.program, "title"), "valid after refusal");
    await submit(d);
    await settleTools(() => d.saved().records.length === 1);
    assert.equal(d.saved().records[0].values.title, "valid after refusal");
    await d.dispose();
  },
);
check(
  "heldsave then newer text cannot reset or erase newer draft; sameadmittedID resubmit can insertifoldercandidate superseded",
  async () => {
    const d = await start("methods-lab", null);
    await inputAll(d, sample(d.program).records[0].values);
    const release = await d.hold(short(d.program));
    await d.$("form").fire("submit");
    await d.set(field(d.program, "title"), "newer after submit");
    await d.action("forms").click();
    const forms = JSON.parse(await d.downloads.at(-1).text()),
      id = forms.forms[0].editingId;
    assert.ok(id);
    release();
    await settleTools(() => !d.$("[data-save-draft]").disabled);
    assert.equal(d.get(field(d.program, "title")), "newer after submit");
    await submit(d);
    await settleTools(() => d.saved().records.length === 1);
    assert.equal(d.saved().records[0].id, id);
    assert.equal(d.saved().records[0].values.title, "newer after submit");
    await d.dispose();
  },
);
check(
  "rawnative hydration substitution survives unrelated autosave and Retry; explicit edit-return/clear permanentlyinvalidate",
  async () => {
    const own = Object.getOwnPropertyDescriptor(ToolElement.prototype, "value");
    Object.defineProperty(ToolElement.prototype, "value", {
      ...own,
      set(value) {
        let v = String(value);
        if (this.tagName === "TEXTAREA") v = v.replace(/\r\n?/g, "\n");
        if (this.tagName === "INPUT") v = v.replace(/[\r\n]/g, "");
        own.set.call(this, v);
      },
    });
    try {
      const p = "methods-lab",
        v = sample(p);
      v.draft = {
        title: "Exact\r\nTitle",
        harm: "Line1\r\nLine2",
        next: "\r\n",
        costLow: "0x10",
      };
      const d = await start(p, v);
      assert.equal(d.get(field(p, "title")), "ExactTitle");
      assert.equal(d.get(field(p, "harm")), "Line1\nLine2");
      await d.set(field(p, "problem"), "unrelated change");
      d.flags.failWrite = true;
      await saveDraft(d);
      await settleTools(() => !d.action("retry").disabled);
      await d.action("forms").click();
      const raw = JSON.parse(await d.downloads.at(-1).text()).forms[0].values;
      assert.equal(raw.title, "ExactTitle");
      assert.equal((await d.native()).draft.title, "Exact\r\nTitle");
      d.flags.failWrite = false;
      await d.action("retry").click();
      await settleTools(() => d.saved().draft.problem === "unrelated change");
      assert.equal(d.saved().draft.harm, "Line1\r\nLine2");
      await d.set(field(p, "title"), "away");
      await d.set(field(p, "title"), "ExactTitle");
      await d.set(field(p, "next"), "", "change");
      await saveDraft(d);
      await settleTools(() => d.saved().draft.title === "ExactTitle");
      assert.equal(d.saved().draft.next, "");
      assert.equal(d.saved().draft.harm, "Line1\r\nLine2");
      await d.dispose();
    } finally {
      Object.defineProperty(ToolElement.prototype, "value", own);
    }
  },
);
check(
  "native draft export overlays newerform withoutmutating current savedmodel or cleaning pending timer",
  async () => {
    const d = await start(),
      before = d.values.get(full(d.program));
    await d.set(field(d.program, "title"), "newer unsaved overlay");
    const native = await d.native();
    assert.equal(native.draft.title, "newer unsaved overlay");
    assert.equal(d.values.get(full(d.program)), before);
    const unload = await d.window.fire("beforeunload");
    assert.equal(unload.defaultPrevented, true);
    await d.dispose();
  },
);
check(
  "explicit currentdraft replacement supersedes exactfailedintent onlyafterreview; newinputrevokesApply",
  async () => {
    const d = await start();
    d.flags.failWrite = true;
    await d.set(field(d.program, "title"), "first failed");
    await saveDraft(d);
    await settleTools(() => !d.action("retry").disabled);
    await d.set(field(d.program, "title"), "replacement draft");
    await d.$("[data-replace-draft]").click();
    await settleTools(() => !d.$("[data-apply-draft]").hidden);
    await d.set(field(d.program, "title"), "newer invalidates preview");
    assert.equal(d.$("[data-apply-draft]").hidden, true);
    d.flags.failWrite = false;
    await d.$("[data-replace-draft]").click();
    await settleTools(() => !d.$("[data-apply-draft]").hidden);
    await d.$("[data-apply-draft]").click();
    await settleTools(
      () => d.saved().draft.title === "newer invalidates preview",
    );
    assert.equal(d.get(field(d.program, "title")), "newer invalidates preview");
    await d.dispose();
  },
);
check(
  "restore usescurrentowned native bytes and successfuladoption resets form; corruptedrawnevercreateswritableblank",
  async () => {
    installReader();
    const d = await start();
    await d.set(field(d.program, "title"), "unfinished before restore");
    d.control("rrDiscard").checked = true;
    const v = sample(d.program);
    v.draft = { title: "restored exact" };
    await importFile(d, JSON.stringify(v));
    await settleTools(() => !d.action("apply").hidden);
    await d.action("apply").click();
    await settleTools(
      () => d.get(field(d.program, "title")) === "restored exact",
    );
    assert.deepEqual(d.saved(), v);
    await d.dispose();
    const bad = await start("methods-lab", '{"broken":');
    assert.equal(hasWrite(bad), false);
    assert.equal(bad.$("[data-json]").disabled, true);
    assert.match(bad.$("[data-save-state]").textContent, /No admitted/);
    assert.equal(bad.values.get(full(bad.program)), '{"broken":');
    await bad.dispose();
  },
);
check(
  "storageconflict retains dirtyform and sourceA while ordinarysave cannotoverwriteforeignB",
  async () => {
    const d = await start(),
      old = d.values.get(full(d.program));
    await d.set(field(d.program, "title"), "retained raw text");
    const foreign = sample(d.program);
    foreign.draft = { title: "foreign B" };
    d.values.set(full(d.program), JSON.stringify(foreign));
    await d.window.fire("storage", { key: full(d.program) });
    assert.equal(d.get(field(d.program, "title")), "retained raw text");
    await d.$("[data-save-draft]").click();
    assert.equal(d.values.get(full(d.program)), JSON.stringify(foreign));
    await d.action("protected").click();
    const raw = JSON.parse(await d.downloads.at(-1).text());
    assert.equal(raw.raw, old);
    await d.dispose();
  },
);
check(
  "pendinginitial read blocks controls and interceptssubmit; post-open renderfailure disposes and keepsprivateHTMLdisabled",
  async () => {
    await start("methods-lab", null, {
      holdInitial: true,
      early: async (d) => {
        assert.equal(d.$("[data-private-form-controls]").disabled, true);
        assert.equal((await d.$("form").fire("submit")).defaultPrevented, true);
        assert.equal(hasWrite(d), false);
      },
    }).then((d) => d.dispose());
    const p = "methods-lab",
      original = html.get(p);
    html.set(p, original.replace("data-records", "data-missing-records"));
    try {
      const d = await start(p, sample(p), { fail: true });
      assert.equal(d.$("[data-private-form-controls]").disabled, true);
      assert.equal((await d.$("form").fire("submit")).defaultPrevented, true);
      assert.equal(hasWrite(d), false);
      await d.dispose();
    } finally {
      html.set(p, original);
    }
  },
);
check(
  "readonly supportsadmittedexports without durablemutators; pagehide revokes debounce and queued save",
  async () => {
    const d = await start("methods-lab", sample("methods-lab"), {
      unsupported: true,
    });
    assert.equal(d.$('button[type="submit"]').disabled, true);
    assert.equal(d.$("[data-json]").disabled, false);
    assert.equal((await d.native()).records.length, 1);
    assert.equal(hasWrite(d), false);
    await d.dispose();
    const e = await start("methods-lab", null);
    await e.set(field(e.program, "title"), "pending at dispose");
    await e.dispose();
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(hasWrite(e), false);
    assert.equal(e.$("[data-private-form-controls]").disabled, true);
  },
);
check(
  "savednative partialdraft may leave without falseunsaved warning after successful autosave",
  async () => {
    const d = await start("methods-lab", null);
    await d.set(field(d.program, "title"), "durable partial draft");
    await settleTools(
      () =>
        d.values.has(full(d.program)) && /Partial draft saved/.test(d.status()),
    );
    assert.equal((await d.window.fire("beforeunload")).defaultPrevented, false);
    await d.dispose();
  },
);
check(
  "source prefills and inspect/change/state notifications preserve calculator seam and currentdraft fields",
  async () => {
    const d = await start("methods-lab", null);
    const events = [];
    d.root.addEventListener("research:change", (e) =>
      events.push({ kind: "change", detail: e.detail }),
    );
    d.root.addEventListener("research:state", (e) =>
      events.push({ kind: "state", detail: e.detail }),
    );
    d.root.dispatchEvent(
      new CustomEvent("research:prefill", {
        detail: {
          title: "starting point",
          method: "unrecognized unfinished choice",
          costLow: "-e",
        },
      }),
    );
    assert.equal(d.get(field(d.program, "title")), "starting point");
    assert.equal(
      d.get(field(d.program, "method")),
      "unrecognized unfinished choice",
    );
    d.root.dispatchEvent(new CustomEvent("research:inspect"));
    assert.equal(events.at(-1).kind, "state");
    assert.equal(events.at(-1).detail.draft.costLow, "-e");
    assert.equal(events.at(-2).detail.method, "unrecognized unfinished choice");
    await settleTools(() => d.values.has(full(d.program)));
    assert.equal(d.saved().draft.costLow, "-e");
    assert.equal(d.saved().records.length, 0);
    await d.dispose();
  },
);
check(
  "deleting a savedrow retains unrelated currentdraft and guarded Undo restores exact row",
  async () => {
    const d = await start(),
      id = d.saved().records[0].id;
    await d.set(field(d.program, "title"), "unrelated draft");
    await sameIdButton(d, "researchDelete", id).click();
    await settleTools(() => d.saved().records.length === 0);
    assert.equal(d.get(field(d.program, "title")), "unrelated draft");
    assert.equal(d.saved().draft.title, "unrelated draft");
    d.control("rrDiscard").checked = true;
    await d.action("undo").click();
    await settleTools(() => d.saved().records.length === 1);
    assert.equal(d.saved().records[0].id, id);
    await d.dispose();
  },
);
check(
  "200recordcap refuses newrow without installing editingidentity or droppingdraft",
  async () => {
    const p = "methods-lab",
      v = researchValue(model, p, 200),
      d = await start(p, v);
    await inputAll(d, sample(p).records[0].values);
    await d.$("form").fire("submit");
    assert.match(d.status(), /at most 200/);
    assert.equal(d.saved().records.length, 200);
    await d.action("forms").click();
    assert.equal(
      JSON.parse(await d.downloads.at(-1).text()).forms[0].editingId,
      null,
    );
    assert.equal(d.get(field(p, "title")), sample(p).records[0].values.title);
    await d.dispose();
  },
);
check(
  "stale replacement-preview failure and saved-copy notice cannot overwrite newer input status",
  async () => {
    const d = await start();
    d.flags.failWrite = true;
    await d.set(field(d.program, "title"), "failed first");
    await saveDraft(d);
    await settleTools(() => !d.action("retry").disabled);
    const release = await d.hold(short(d.program)),
      pending = d.$("[data-replace-draft]").click();
    await new Promise((r) => setTimeout(r, 0));
    await d.set(field(d.program, "title"), "newer after preview");
    d.$("[data-status]").textContent = "current owned status";
    release();
    await pending;
    assert.equal(d.status(), "current owned status");
    assert.equal(d.get(field(d.program, "title")), "newer after preview");
    await d.dispose();
  },
);
check(
  "malformedconfig asyncstartup marksfailed without unhandled rejection and keeps privateform intercepted",
  async () => {
    const p = "methods-lab",
      original = html.get(p);
    html.set(p, original.replace(/data-config="[^"]*"/, 'data-config="{"'));
    try {
      const d = await start(p, null, { fail: true });
      assert.equal(d.$("[data-private-form-controls]").disabled, true);
      assert.equal((await d.$("form").fire("submit")).defaultPrevented, true);
      assert.equal(hasWrite(d), false);
      assert.ok(
        d.root
          .querySelectorAll("button,input,textarea,select")
          .every((el) => el.disabled),
      );
      await d.dispose();
    } finally {
      html.set(p, original);
    }
  },
);
check(
  "persistedpagehide retains controllers/rawdraft but cancels timer; pageshow rechecks withoutrefilling",
  async () => {
    const d = await start();
    await d.set(field(d.program, "title"), "retained through back cache");
    const before = d.values.get(full(d.program));
    await d.window.fire("pagehide", { persisted: true });
    assert.equal(d.$("[data-private-form-controls]").disabled, false);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(d.values.get(full(d.program)), before);
    await d.window.fire("pageshow", { persisted: true });
    assert.equal(
      d.get(field(d.program, "title")),
      "retained through back cache",
    );
    assert.equal(d.values.get(full(d.program)), before);
    await d.set(field(d.program, "title"), "edited after return");
    await settleTools(() => d.saved().draft.title === "edited after return");
    await d.dispose();
  },
);
check(
  "persistedpageshow detectsforeign savedchange and retainsrawdraft withoutautomaticadoption",
  async () => {
    const d = await start();
    await d.set(field(d.program, "title"), "local before cache");
    await d.window.fire("pagehide", { persisted: true });
    const foreign = sample(d.program);
    foreign.draft = { title: "foreign cache B" };
    d.values.set(full(d.program), JSON.stringify(foreign));
    await d.window.fire("pageshow", { persisted: true });
    assert.equal(d.get(field(d.program, "title")), "local before cache");
    assert.equal(d.saved().draft.title, "foreign cache B");
    assert.match(d.status(), /Another tab changed/);
    assert.equal(d.$("[data-save-draft]").disabled, true);
    await d.action("forms").click();
    assert.equal(
      JSON.parse(await d.downloads.at(-1).text()).forms[0].values.title,
      "local before cache",
    );
    await d.dispose();
  },
);
check(
  "persistedpagehide revokesheldwrite authority and recoverypreviews while preservingalive session",
  async () => {
    const d = await start(),
      before = d.values.get(full(d.program));
    await d.set(field(d.program, "title"), "queued before cache");
    const release = await d.hold(short(d.program));
    await d.$("[data-save-draft]").click();
    await new Promise((r) => setTimeout(r, 0));
    await d.window.fire("pagehide", { persisted: true });
    release();
    await d.window.fire("pageshow", { persisted: true });
    assert.equal(d.values.get(full(d.program)), before);
    assert.equal(d.get(field(d.program, "title")), "queued before cache");
    assert.equal(d.$("[data-private-form-controls]").disabled, false);
    await saveDraft(d);
    await settleTools(() => d.saved().draft.title === "queued before cache");
    d.flags.failWrite = true;
    await d.set(field(d.program, "title"), "failed cache candidate");
    await saveDraft(d);
    await settleTools(() => !d.action("retry").disabled);
    await d.$("[data-replace-draft]").click();
    await settleTools(() => !d.$("[data-apply-draft]").hidden);
    await d.window.fire("pagehide", { persisted: true });
    assert.equal(d.$("[data-apply-draft]").hidden, true);
    assert.equal(d.get(field(d.program, "title")), "failed cache candidate");
    await d.window.fire("pageshow", { persisted: true });
    assert.equal(d.get(field(d.program, "title")), "failed cache candidate");
    await d.dispose();
  },
);
check(
  "persistedhide/show duringheldinitialopen preserves guardedread and rechecksbeforefirsthydrate",
  async () => {
    const p = "methods-lab",
      next = sample(p);
    next.draft = { title: "current bytes after early cache return" };
    const d = await start(p, sample(p), {
      holdInitial: true,
      early: async (d) => {
        await d.window.fire("pagehide", { persisted: true });
        await d.window.fire("pageshow", { persisted: true });
        assert.equal(d.$("[data-private-form-controls]").disabled, true);
        d.values.set(full(p), JSON.stringify(next));
        assert.equal(hasWrite(d), false);
      },
    });
    assert.equal(d.root.dataset.rrInitialization, "ready");
    assert.equal(
      d.get(field(p, "title")),
      "current bytes after early cache return",
    );
    assert.ok(
      d.operations.filter(([op, key]) => op === "get" && key === full(p))
        .length >= 3,
    );
    assert.equal(d.$("[data-private-form-controls]").disabled, false);
    assert.equal(hasWrite(d), false);
    await d.dispose();
  },
);
try {
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
          name: "ignore-ssr-css",
          setup(b) {
            b.onResolve({ filter: /\?astro&type=style/ }, () => ({
              path: "style",
              namespace: "ignore-css",
            }));
            b.onLoad({ filter: /.*/, namespace: "ignore-css" }, () => ({
              contents: "",
              loader: "js",
            }));
          },
        },
      ],
      logLevel: "silent",
    }),
    componentPath = join(temp, "component.mjs");
  await writeFile(componentPath, component.outputFiles[0].text);
  const loaded = (await import(pathToFileURL(componentPath))).default,
    container = await AstroContainer.create();
  for (const p of programs)
    html.set(
      p,
      await container.renderToString(loaded, {
        props: {
          ...research[p],
          title: "Fictional " + p,
          description: "Fictional bounded test",
        },
      }),
    );
  const built = await build({
    stdin: {
      contents: inline,
      loader: "ts",
      resolveDir: dirname(resolve(sourcePath)),
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    define: { "import.meta.env.BASE_URL": '"/"' },
    logLevel: "silent",
  });
  script = built.outputFiles[0].text;
  for (const [name, run] of checks) {
    try {
      await run();
      groups++;
      console.log("PASS " + name);
    } catch (e) {
      e.message = name + ": " + e.message;
      throw e;
    }
  }
  console.log(
    `Remaining-record research: ${groups} actual SSR/mounted groups passed; strict0.`,
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
