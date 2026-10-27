// Execute the real controller/model/stores against bounded synthetic DOM and keyed Web Locks.
// This verifies state/authority, not browser layout, native Save or independent assessment.
import assert from "node:assert/strict";
import { webcrypto, createHash } from "node:crypto";
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
  known,
  progress,
  withPortfolio,
  exactBoundaryState,
} from "../test-fixtures/learning-portfolio/factory.mjs";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const NativeDate = Date;
globalThis.Date = class extends NativeDate {
  constructor(...args) {
    super(...(args.length ? args : ["2026-10-28T12:00:00.000Z"]));
  }
  static now() {
    return NativeDate.parse("2026-10-28T12:00:00.000Z");
  }
};
const bundle = await build({
  stdin: {
    contents:
      "export * from './src/lib/client/learning-portfolio-ui.ts';export * from './src/lib/client/learning-portfolio-ui-helpers.ts';export * from './src/lib/client/learning-portfolio-model.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  logLevel: "silent",
});
const temp = await mkdtemp(join(tmpdir(), "charitology-learning-ui-"));
await writeFile(join(temp, "actual.mjs"), bundle.outputFiles[0].text);
const m = await import(pathToFileURL(join(temp, "actual.mjs")));
const definitions = known(m),
  courseKey = "charitology.principles-course-v1",
  portfolioKey = "charitology.learning-portfolio.v1";
Element.prototype.replaceChildren = function (...children) {
  this.textContent = "";
  this.append(...children);
};
Object.defineProperty(Element.prototype, "parentElement", {
  get() {
    return this.parentNode?.tagName === "#DOCUMENT" ? null : this.parentNode;
  },
});
let groups = 0;
async function check(name, run) {
  try {
    await run();
    groups++;
    console.log("✓ " + name);
  } catch (error) {
    error.message = name + ": " + error.message;
    throw error;
  }
}
const settle = settleArtifactUi;
function dom({
  course = null,
  portfolio = null,
  locks = true,
  failRead = false,
  failWrite = false,
  mode = "course",
} = {}) {
  const d = installArtifactDom();
  d.root.className = "tool learning-portfolio";
  d.root.querySelector(".artifact-results-mount").className =
    "learning-portfolio-mount";
  const script = d.root.querySelector(".artifact-results-catalog");
  script.className = "learning-portfolio-config";
  script.textContent = JSON.stringify({
    criteriaRegistry: {
      format: "charitology-course-criteria-registry",
      version: 1,
      currentId: definitions[0].id,
      entries: definitions.map((c) => ({
        id: c.id,
        hash: c.hash,
        path: "synthetic/" + c.id + ".json",
      })),
    },
    currentCriteria: definitions[0],
    knownCriteria: definitions,
    mode,
    base: "/example/",
  });
  if (course !== null)
    d.values.set(
      courseKey,
      typeof course === "string" ? course : JSON.stringify(course),
    );
  if (portfolio !== null)
    d.values.set(
      portfolioKey,
      typeof portfolio === "string" ? portfolio : JSON.stringify(portfolio),
    );
  d.values.set("unrelated.private.key", "unchanged");
  d.behavior = { failRead, failWrite };
  const storage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => {
      if (d.behavior.failRead) throw Error("Synthetic denied read");
      return storage.getItem(key);
    },
    setItem: (key, value) => {
      if (d.behavior.failWrite) throw Error("Synthetic quota");
      storage.setItem(key, value);
    },
    removeItem: (key) => {
      if (d.behavior.failWrite) throw Error("Synthetic removal");
      storage.removeItem(key);
    },
  };
  const queues = new Map();
  const lock = {
    request(name, options, fn) {
      const prior = queues.get(name) || Promise.resolve();
      const next = prior.then(fn);
      queues.set(
        name,
        next.catch(() => {}),
      );
      return next;
    },
  };
  d.hold = async (name) => {
    let release, start;
    const ready = new Promise((r) => (start = r)),
      gate = new Promise((r) => (release = r));
    void lock.request(name, {}, async () => {
      start();
      await gate;
    });
    await ready;
    return release;
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { locks: locks ? lock : undefined },
  });
  d.window.print = () => {
    d.printed = (d.printed || 0) + 1;
  };
  return d;
}
const status = (d) => d.root.querySelector(".lp-status")?.textContent || "";
async function click(d, label) {
  const button = d.findButton(label);
  assert.ok(button, "Button " + label);
  assert.equal(button.disabled, false, "Enabled " + label);
  await button.click();
  await settle(() => status(d) !== "Working…");
}
async function set(d, label, value, event = "input") {
  const field = d.field(label);
  assert.ok(field, "Field " + label);
  if (typeof value === "boolean") field.checked = value;
  else field.value = value;
  await field.fire(event);
}
async function file(d, label, input, name = "fictional-course.json") {
  const field = d.field(label);
  assert.ok(field, label);
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  field.files = [
    {
      name,
      size: bytes.byteLength,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
    },
  ];
  await field.fire("change");
  await settle(() => status(d) !== "Working…");
}
async function mount(d) {
  await m.mountLearningPortfolio(d.root);
  return d;
}
const savedCourse = (d) => JSON.parse(d.values.get(courseKey));
const savedPortfolio = (d) => JSON.parse(d.values.get(portfolioKey));
async function download(d, label) {
  const n = d.downloads.length;
  await click(d, label);
  assert.equal(d.downloads.length, n + 1, "actual download Blob");
  return d.downloads.at(-1).blob.text();
}
const affirmation =
  "I inspected this exact criteria edition and input for this present self-recorded evaluation.";
async function livePreview(d) {
  await click(d, "Portfolio");
  await click(d, "Preview current validated course memory");
}
async function append(d) {
  await set(d, affirmation, true, "change");
  await click(d, "Append reviewed self-recorded record");
}
async function clearRaw(d) {
  await click(d, "Discard raw form in this tab");
  await click(d, "Continue with reviewed action");
  if (d.findButton("Save empty portfolio form state")) {
    await click(d, "Save empty portfolio form state");
    await click(d, "Continue with reviewed action");
  }
}
async function confirm(d, label) {
  await click(d, label);
  await click(d, "Continue with reviewed action");
}

try {
  await check(
    "actual UI/model/stores pass strict TypeScript and both Astro wrappers compile",
    async () => {
      const p = ts.createProgram(
        [
          "src/lib/client/learning-portfolio-ui.ts",
          "src/lib/client/learning-portfolio-ui-helpers.ts",
        ],
        {
          strict: true,
          noEmit: true,
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
          skipLibCheck: true,
        },
      );
      const diagnostics = ts.getPreEmitDiagnostics(p);
      assert.equal(
        diagnostics.length,
        0,
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
          getCanonicalFileName: (x) => x,
          getCurrentDirectory: () => process.cwd(),
          getNewLine: () => "\n",
        }),
      );
      for (const path of [
        "src/components/LearningPortfolio.astro",
        "src/components/programs/_principles-learning.astro",
      ]) {
        const source = await readFile(path, "utf8");
        const out = await transform(source, { filename: path });
        assert.ok(out.code);
      }
      const shell = await readFile(
        "src/components/LearningPortfolio.astro",
        "utf8",
      );
      assert.match(shell, /unit\.id/);
      assert.match(shell, /<Content/);
      assert.match(shell, /<SourceList/);
      assert.match(shell, /learningSavedTextRecovery/);
    },
  );
  await check(
    "light/dark theme token controls, bounded wrapping and print ancestor path are explicit",
    async () => {
      const css = postcss.parse(
        await readFile("src/styles/learning-portfolio.css", "utf8"),
      );
      let primary = false,
        controls = false,
        print = false;
      css.walkRules((rule) => {
        if (rule.selector.includes(".lp-primary")) {
          assert.ok(
            rule.nodes.some(
              (n) => n.prop === "color" && n.value === "var(--on-accent)",
            ),
          );
          primary = true;
        }
        if (rule.selector.includes("input:not")) {
          assert.ok(
            rule.nodes.some(
              (n) => n.prop === "background" && n.value === "var(--bg)",
            ),
          );
          controls = true;
        }
        if (rule.selector.includes(".lp-print-path >")) print = true;
      });
      assert.ok(primary && controls && print);
      assert.match(css.toString(), /overflow-wrap: anywhere/);
      assert.match(css.toString(), /max-width: 389px/);
    },
  );
  await check(
    "raw answer zero/unanswered and invalid date recovery remain distinct; ordinary save preserves source day",
    () => {
      const p = progress(m);
      p.completedAt = "0000-02-29";
      const raw = m.rawCourse(p);
      raw.completedAt = "unfinished 2026-";
      raw.lessons[0].answers = ["0", "-1"];
      const candidate = m.courseFromRaw(raw, p.completedAt);
      assert.deepEqual(candidate.lessons[0].answers, [0, -1]);
      assert.equal(candidate.completedAt, "0000-02-29");
      assert.equal(raw.completedAt, "unfinished 2026-");
      raw.lessons[0].answers[0] = "";
      assert.throws(
        () => m.courseFromRaw(raw, p.completedAt),
        /unfinished answer/,
      );
    },
  );
  await check(
    "inert mount JSON round-trips exact hostile chapter text and Unicode without a script terminator",
    () => {
      const props = {
        criteriaRegistry: {},
        currentCriteria: {
          raw: "</script><img src=x onerror=alert(1)>\u2028\u2029",
        },
        knownCriteria: [],
        mode: "course",
        base: "/",
      };
      const text = m.learningMountJson(props);
      assert.equal(text.includes("<"), false);
      assert.deepEqual(JSON.parse(text), props);
    },
  );
  await check(
    "fresh mount reads only two declared keys, never autosaves, and renders all public checks",
    async () => {
      const d = await mount(dom());
      assert.equal(d.values.has(courseKey), false);
      assert.equal(d.values.has(portfolioKey), false);
      assert.ok(d.root.textContent.includes("0 / 10"));
      assert.equal(d.root.querySelectorAll("select").length, 20);
      assert.ok(d.root.textContent.includes("Answer and explanation 10.2"));
      assert.ok(d.root.textContent.includes("Worked example 10"));
      assert.deepEqual(new Set(d.reads), new Set([courseKey, portfolioKey]));
      assert.equal(d.values.get("unrelated.private.key"), "unchanged");
    },
  );
  await check(
    "corrupt initial data supplies no invented progress and exact malformed UTF-16 text remains recoverable",
    async () => {
      const malformed = "broken\ud800raw";
      const d = await mount(dom({ course: malformed, portfolio: "{bad" }));
      assert.match(d.root.textContent, /No validated course/);
      assert.doesNotMatch(d.root.textContent, /Current validated course: 0/);
      await click(d, "Recovery");
      const wrapper = JSON.parse(
        await download(d, "Download protected saved course bytes"),
      );
      assert.equal(wrapper.raw, malformed);
      assert.match(wrapper.notice, /not a validated/);
      assert.equal(d.values.get(courseKey), malformed);
    },
  );
  await check(
    "missing Web Locks preserves validated read/export without enabling unsafe study writes",
    async () => {
      const d = await mount(dom({ course: progress(m), locks: false }));
      assert.equal(d.findButton("Save all current study edits").disabled, true);
      await click(d, "Exports");
      assert.deepEqual(
        JSON.parse(await download(d, "Download validated course v1 JSON")),
        progress(m),
      );
      assert.equal(d.values.has(portfolioKey), false);
    },
  );
  await check(
    "unit save changes only its lesson, keeps unrelated raw capstone and declared day; all-save retains invalid day separately",
    async () => {
      const p = progress(m, definitions[0], false);
      p.completedAt = "2020-01-02";
      const d = await mount(dom({ course: p }));
      await set(
        d,
        "Capstone decision and reasoning",
        "Unrelated unfinished capstone",
      );
      await set(
        d,
        "Self-reported completion day (YYYY-MM-DD or blank)",
        "not-a-day",
      );
      await set(d, "I have read chapter 1", true, "change");
      await set(d, "Chapter 1, question 1", "0", "change");
      await click(d, "Check and save unit 1");
      assert.equal(savedCourse(d).lessons[0].read, true);
      assert.equal(savedCourse(d).capstone, "");
      assert.equal(
        d.field("Capstone decision and reasoning").value,
        "Unrelated unfinished capstone",
      );
      assert.equal(
        d.field("Self-reported completion day (YYYY-MM-DD or blank)").value,
        "not-a-day",
      );
      await click(d, "Save all current study edits");
      assert.equal(savedCourse(d).capstone, "Unrelated unfinished capstone");
      assert.equal(savedCourse(d).completedAt, "2020-01-02");
      await confirm(d, "Review declared-day change");
      assert.match(status(d), /day|date/i);
      assert.equal(savedCourse(d).completedAt, "2020-01-02");
    },
  );
  await check(
    "dirty course blocks live capture and raw completion-day text survives portfolio draft and full backup",
    async () => {
      const d = await mount(dom({ course: progress(m) }));
      await set(
        d,
        "Self-reported completion day (YYYY-MM-DD or blank)",
        "unfinished day",
      );
      const before = d.values.get(courseKey);
      await click(d, "Preview validated course in portfolio");
      assert.match(status(d), /differ/);
      assert.equal(d.values.get(courseKey), before);
      await click(d, "Course");
      await click(d, "Keep unfinished course form in portfolio");
      assert.equal(
        savedPortfolio(d).draft.form.course.completedAt,
        "unfinished day",
      );
      assert.equal(
        "sourceObservedRawHash" in savedPortfolio(d).draft.form.binding,
        false,
      );
      await click(d, "Exports");
      const backup = JSON.parse(
        await download(d, "Download complete portfolio with current raw form"),
      );
      assert.equal(
        backup.state.draft.form.course.completedAt,
        "unfinished day",
      );
    },
  );
  await check(
    "complete backup refuses two differing retained course forms while plain recovery preserves both",
    async () => {
      const d = await mount(dom({ course: progress(m) }));
      await set(
        d,
        "Self-reported completion day (YYYY-MM-DD or blank)",
        "older retained day",
      );
      await click(d, "Keep unfinished course form in portfolio");
      await set(
        d,
        "Self-reported completion day (YYYY-MM-DD or blank)",
        "newer current day",
      );
      await click(d, "Exports");
      const n = d.downloads.length;
      await click(d, "Download complete portfolio with current raw form");
      assert.equal(d.downloads.length, n);
      assert.match(status(d), /both contain unfinished/);
      const raw = await download(
        d,
        "Download all unfinished raw recovery text",
      );
      assert.match(raw, /older retained day/);
      assert.match(raw, /newer current day/);
    },
  );
  await check(
    "explicit tab discard can save a durable empty draft without deleting records or course",
    async () => {
      const state = structuredClone(await withPortfolio(m));
      state.draft = {
        tab: "portfolio",
        recordId: null,
        form: {
          kind: "capture",
          targetId: null,
          binding: {
            criteriaId: definitions[0].id,
            criteriaHash: definitions[0].hash,
          },
          fields: { criteriaAffirmed: "true" },
          course: null,
        },
        dirty: true,
      };
      const d = await mount(dom({ course: progress(m), portfolio: state }));
      const original = d.values.get(courseKey);
      await clearRaw(d);
      assert.equal(savedPortfolio(d).draft.form, null);
      assert.equal(savedPortfolio(d).records.length, 1);
      assert.equal(d.values.get(courseKey), original);
    },
  );
  await check(
    "absent key capture is incomplete unsaved-memory with unknown day and fresh affirmation required",
    async () => {
      const d = await mount(dom());
      await livePreview(d);
      assert.equal(d.field(affirmation).checked, false);
      await click(d, "Append reviewed self-recorded record");
      assert.equal(d.values.has(portfolioKey), false);
      assert.match(status(d), /fresh preview/);
      await append(d);
      const r = savedPortfolio(d).records[0];
      assert.equal(r.evaluation.complete, false);
      assert.equal(r.origin.persistence, "unsaved-memory");
      assert.equal(r.origin.rawHash, null);
      assert.equal(r.input.completedAt, "");
      assert.match(d.root.textContent, /Incomplete self-recorded/);
      assert.equal(d.values.has(courseKey), false);
    },
  );
  await check(
    "valid saved progress produces self-recorded completion with exact source-byte hash; preview choice reset cannot reuse affirmation",
    async () => {
      const p = progress(m),
        raw = JSON.stringify(p, null, 2) + "\n";
      const d = await mount(dom({ course: raw }));
      await livePreview(d);
      await set(d, affirmation, true, "change");
      await set(
        d,
        "Criteria for present evaluation",
        definitions[1].id,
        "change",
      );
      assert.equal(d.field(affirmation), undefined);
      await set(
        d,
        "Criteria for present evaluation",
        definitions[0].id,
        "change",
      );
      await clearRaw(d);
      await click(d, "Preview current validated course memory");
      assert.equal(d.field(affirmation).checked, false);
      await append(d);
      const r = savedPortfolio(d).records[0];
      assert.equal(r.evaluation.complete, true);
      assert.equal(r.origin.persistence, "saved");
      assert.equal(
        r.origin.rawHash,
        createHash("sha256").update(raw, "utf8").digest("hex"),
      ); // replaced below with independent byte hash
    },
  );
  await check(
    "chosen-file capture preserves unrelated dirty course text and performs no hidden course write",
    async () => {
      const d = await mount(
        dom({ course: progress(m, definitions[0], false) }),
      );
      await set(
        d,
        "Capstone decision and reasoning",
        "Unrelated dirty course editor",
      );
      const before = d.values.get(courseKey);
      await click(d, "Portfolio");
      await file(
        d,
        "Choose legacy course JSON for portfolio capture",
        m.makeCourseProgressExport(progress(m)),
      );
      assert.equal(d.field(affirmation).checked, false);
      await append(d);
      assert.equal(savedPortfolio(d).records[0].origin.kind, "course-file");
      assert.equal(d.values.get(courseKey), before);
      await click(d, "Course");
      assert.equal(
        d.field("Capstone decision and reasoning").value,
        "Unrelated dirty course editor",
      );
    },
  );
  await check(
    "capture live final guard rejects an edit queued while the course lock is held",
    async () => {
      const d = await mount(dom({ course: progress(m) }));
      await livePreview(d);
      await set(d, affirmation, true, "change");
      const release = await d.hold(courseKey);
      void d.findButton("Append reviewed self-recorded record").click();
      await settle(() => status(d) === "Working…");
      await set(
        d,
        "Criteria for present evaluation",
        definitions[1].id,
        "change",
      );
      release();
      await settle(() => status(d) !== "Working…");
      assert.equal(d.values.has(portfolioKey), false);
      assert.match(status(d), /changed|stale|current|review/i);
    },
  );
  await check(
    "newer raw editor during a pending study save is retained and cannot silently inherit the new source generation",
    async () => {
      const d = await mount(dom({ course: progress(m) }));
      await set(
        d,
        "Name on your self-study record (optional)",
        "First candidate",
      );
      const release = await d.hold(courseKey);
      void d.findButton("Save all current study edits").click();
      await settle(() => status(d) === "Working…");
      await set(
        d,
        "Name on your self-study record (optional)",
        "Newer raw text",
      );
      release();
      await settle(() => status(d) !== "Working…");
      assert.equal(savedCourse(d).name, "First candidate");
      assert.equal(
        d.field("Name on your self-study record (optional)").value,
        "Newer raw text",
      );
      assert.ok(d.findButton("Review rebinding current raw study form"));
      await click(d, "Save all current study edits");
      assert.equal(savedCourse(d).name, "First candidate");
      await confirm(d, "Review rebinding current raw study form");
      await click(d, "Save all current study edits");
      assert.equal(savedCourse(d).name, "Newer raw text");
    },
  );
  await check(
    "failed course save stays valid memory, retry does not stale the opening binding, and no portfolio capture is replayed",
    async () => {
      const d = await mount(dom({ course: progress(m), failWrite: true }));
      await set(
        d,
        "Name on your self-study record (optional)",
        "Memory candidate",
      );
      await click(d, "Save all current study edits");
      assert.match(status(d), /only in memory/);
      assert.notEqual(savedCourse(d).name, "Memory candidate");
      d.behavior.failWrite = false;
      await click(d, "Recovery");
      await click(d, "Retry saving valid course memory");
      assert.equal(savedCourse(d).name, "Memory candidate");
      await click(d, "Course");
      await set(
        d,
        "Name on your self-study record (optional)",
        "Later valid edit",
      );
      await click(d, "Save all current study edits");
      assert.equal(savedCourse(d).name, "Later valid edit");
      assert.equal(d.values.has(portfolioKey), false);
    },
  );
  await check(
    "amendment retains exact predecessor ID/hash and does not rewrite the earlier completion",
    async () => {
      const d = await mount(dom({ course: progress(m) }));
      await livePreview(d);
      await append(d);
      const first = savedPortfolio(d).records[0];
      await click(d, "Read record " + first.id);
      await click(d, "Choose this record for an amendment");
      await click(d, "Preview current validated course memory");
      await set(
        d,
        "Reason for this amendment",
        "I deliberately recorded this unchanged self-study version again.",
      );
      await append(d);
      const records = savedPortfolio(d).records;
      assert.equal(records.length, 2);
      assert.deepEqual(records[0], first);
      assert.equal(records[1].previousId, first.id);
      assert.equal(records[1].previousHash, first.hash);
      assert.equal(records[1].revision, 2);
    },
  );
  await check(
    "restored raw affirmation is inert and saved raw source bindings cannot silently authorize course replacement",
    async () => {
      const state = structuredClone(
        m.blankLearningPortfolio("fictional-restored", at),
      );
      state.draft = {
        tab: "portfolio",
        recordId: null,
        dirty: true,
        form: {
          kind: "capture",
          targetId: null,
          binding: {
            criteriaId: definitions[0].id,
            criteriaHash: definitions[0].hash,
          },
          fields: { criteriaAffirmed: "true" },
          course: m.rawCourse(progress(m)),
        },
      };
      const d = await mount(
        dom({ course: m.emptyCourseProgress(), portfolio: state }),
      );
      assert.equal(d.field(affirmation), undefined);
      await click(d, "Review resuming retained capture choices");
      assert.equal(d.field(affirmation), undefined);
      await confirm(d, "Review resuming raw course text in editor");
      assert.ok(d.findButton("Review rebinding current raw study form"));
      await click(d, "Save all current study edits");
      assert.equal(savedCourse(d).capstone, "");
    },
  );
  await check(
    "selected packet excludes unrelated raw forms and packet purpose changes remove stale download controls",
    async () => {
      const state = structuredClone(await withPortfolio(m));
      state.draft = {
        tab: "exports",
        recordId: state.records[0].id,
        dirty: true,
        form: {
          kind: "course",
          targetId: null,
          binding: {},
          fields: {},
          course: m.rawCourse({
            ...progress(m),
            capstone: "PRIVATE UNRELATED RAW MARKER",
          }),
        },
      };
      const d = await mount(dom({ course: progress(m), portfolio: state }));
      await click(d, "Review selected record packet");
      const raw = await download(d, "Download selected packet JSON");
      assert.doesNotMatch(raw, /PRIVATE UNRELATED RAW MARKER/);
      assert.match(raw, /fictional-criteria-1/);
      const full = await download(
        d,
        "Download complete portfolio with current raw form",
      );
      assert.match(full, /PRIVATE UNRELATED RAW MARKER/);
      const select = d.field("Packet purpose");
      select.focus();
      await set(d, "Packet purpose", "fellowship-planning", "change");
      assert.equal(d.findButton("Download selected packet JSON"), undefined);
      assert.equal(
        d.document.activeElement.getAttribute("aria-label"),
        "Packet purpose",
      );
    },
  );
  await check(
    "explicit course restore preserves portfolio history and source day; reload corruption never claims validation",
    async () => {
      const state = await withPortfolio(m);
      const d = await mount(dom({ course: progress(m), portfolio: state }));
      const p = progress(m, definitions[0], false);
      p.completedAt = "9999-12-31";
      await click(d, "Recovery");
      await file(
        d,
        "Choose course recovery JSON",
        m.makeCourseProgressExport(p),
      );
      await click(d, "Apply reviewed course replacement");
      assert.equal(savedCourse(d).completedAt, "9999-12-31");
      assert.equal(savedPortfolio(d).records.length, 1);
      d.values.set(courseKey, "{broken");
      await confirm(d, "Review reload of course");
      assert.match(status(d), /invalid|corrupt|could not|saved/i);
      assert.doesNotMatch(status(d), /reloaded and validated/);
      assert.equal(d.values.get(courseKey), "{broken");
    },
  );
  await check(
    "storage event invalidates capture while retaining private raw work and untouched unrelated keys",
    async () => {
      const d = await mount(dom({ course: progress(m) }));
      await livePreview(d);
      await set(d, affirmation, true, "change");
      d.values.set(
        courseKey,
        m.makeCourseProgressExport({ ...progress(m), name: "Other writer" }),
      );
      await d.window.fire("storage", { key: courseKey });
      assert.equal(d.field(affirmation), undefined);
      assert.match(status(d), /Another tab/);
      assert.equal(d.values.has(portfolioKey), false);
      assert.equal(d.values.get("unrelated.private.key"), "unchanged");
      const raw = await download(
        d,
        "Download all unfinished raw recovery text",
      );
      assert.match(raw, /Fictional learner/);
    },
  );
  await check(
    "print of an incomplete record states unknown day and self-study limits without claiming completion",
    async () => {
      const state = await withPortfolio(m, { complete: false });
      const d = await mount(dom({ portfolio: state, mode: "completion" }));
      await click(d, "Read record " + state.records[0].id);
      await click(d, "Prepare print of this record");
      const region = d.root.querySelector(".lp-print");
      assert.match(region.textContent, /Incomplete self-recorded/);
      assert.match(region.textContent, /Unknown \/ not supplied/);
      assert.match(region.textContent, /Nonaccredited/);
      assert.ok(d.document.body.className.includes("lp-print-path"));
      await click(d, "Print selected self-study record");
      assert.equal(d.printed, 1);
      await click(d, "Close print preparation");
      assert.equal(d.document.body.className.includes("lp-print-path"), false);
    },
  );
  await check(
    "complete-backup capacity failure still offers exact plain raw recovery rather than false valid backup",
    async () => {
      const state = await exactBoundaryState(m);
      const d = await mount(dom({ portfolio: state }));
      await click(d, "Exports");
      await set(d, "Raw retained name", "NEW RAW FIELD");
      const n = d.downloads.length;
      await click(d, "Download complete portfolio with current raw form");
      assert.equal(d.downloads.length, n);
      assert.match(status(d), /byte|bound|large|limit|MiB/i);
      const plain = await download(
        d,
        "Download all unfinished raw recovery text",
      );
      assert.match(plain, /NEW RAW FIELD/);
      assert.match(plain, /NOT a validated/);
    },
  );
  await check(
    "a pending empty-draft save never clears newer raw text entered before it finishes",
    async () => {
      const state = structuredClone(await withPortfolio(m));
      state.draft = {
        tab: "portfolio",
        recordId: null,
        dirty: true,
        form: {
          kind: "capture",
          targetId: null,
          binding: {
            criteriaId: definitions[0].id,
            criteriaHash: definitions[0].hash,
          },
          fields: { criteriaAffirmed: "false" },
          course: null,
        },
      };
      const d = await mount(dom({ portfolio: state }));
      await click(d, "Save empty portfolio form state");
      const release = await d.hold(portfolioKey);
      void d.findButton("Continue with reviewed action").click();
      await settle(() => status(d) === "Working…");
      await set(d, "Raw field criteriaAffirmed", "newer unfinished assertion");
      release();
      await settle(() => status(d) !== "Working…");
      assert.equal(savedPortfolio(d).draft.form, null);
      assert.equal(
        d.field("Raw field criteriaAffirmed").value,
        "newer unfinished assertion",
      );
      const raw = await download(
        d,
        "Download all unfinished raw recovery text",
      );
      assert.match(raw, /newer unfinished assertion/);
    },
  );
  await check(
    "a pending recovery does not rebind or overwrite newer raw editor text",
    async () => {
      const d = await mount(dom({ course: progress(m) }));
      await click(d, "Keep unfinished course form in portfolio");
      await click(d, "Recovery");
      await file(
        d,
        "Choose course recovery JSON",
        m.makeCourseProgressExport(m.emptyCourseProgress()),
      );
      const release = await d.hold(courseKey);
      void d.findButton("Apply reviewed course replacement").click();
      await settle(() => status(d) === "Working…");
      await set(d, "Raw retained name", "Newer retained recovery text");
      release();
      await settle(() => status(d) !== "Working…");
      assert.equal(savedCourse(d).capstone, "");
      assert.equal(
        d.field("Raw retained name").value,
        "Newer retained recovery text",
      );
      await click(d, "Course");
      assert.equal(
        d.field("Name on your self-study record (optional)").value,
        progress(m).name,
      );
      assert.ok(d.findButton("Review rebinding current raw study form"));
    },
  );
  await check(
    "portfolio quota failure creates one immutable memory candidate and retry saves without another capture",
    async () => {
      const d = await mount(dom({ course: progress(m) }));
      await livePreview(d);
      d.behavior.failWrite = true;
      await append(d);
      assert.equal(d.values.has(portfolioKey), false);
      assert.match(status(d), /exists once.*memory/);
      await click(d, "Exports");
      const backup = JSON.parse(
        await download(
          d,
          "Download canonical portfolio without newer DOM edits",
        ),
      );
      assert.equal(backup.state.records.length, 1);
      d.behavior.failWrite = false;
      await click(d, "Recovery");
      await click(d, "Retry saving valid portfolio memory");
      assert.equal(savedPortfolio(d).records.length, 1);
    },
  );
  await check(
    "declared-day writes preserve newer raw day and require explicit rebind after an in-flight edit",
    async () => {
      const d = await mount(dom({ course: progress(m) }));
      await set(
        d,
        "Self-reported completion day (YYYY-MM-DD or blank)",
        "2026-01-01",
      );
      await click(d, "Review declared-day change");
      const release = await d.hold(courseKey);
      void d.findButton("Continue with reviewed action").click();
      await settle(() => status(d) === "Working…");
      await set(
        d,
        "Self-reported completion day (YYYY-MM-DD or blank)",
        "unfinished newer day",
      );
      release();
      await settle(() => status(d) !== "Working…");
      assert.equal(savedCourse(d).completedAt, "2026-01-01");
      assert.equal(
        d.field("Self-reported completion day (YYYY-MM-DD or blank)").value,
        "unfinished newer day",
      );
      assert.ok(d.findButton("Review rebinding current raw study form"));
    },
  );
  await check(
    "recovery exposes original corrupt text separately from a newly seen current copy",
    async () => {
      const d = await mount(dom({ course: "original corrupt A" }));
      await click(d, "Recovery");
      d.values.set(courseKey, "unseen corrupt B");
      await click(d, "Preview clearing course");
      assert.match(status(d), /changed|another|external/i);
      const original = JSON.parse(
        await download(d, "Download protected saved course bytes"),
      );
      const latest = JSON.parse(
        await download(d, "Download latest observed course text"),
      );
      assert.equal(original.raw, "original corrupt A");
      assert.equal(latest.raw, "unseen corrupt B");
      assert.equal(d.values.get(courseKey), "unseen corrupt B");
    },
  );
  await check(
    "new invalid recovery-file choice revokes older replacement and clear authority before validation",
    async () => {
      const d = await mount(dom({ course: progress(m) }));
      await click(d, "Recovery");
      const original = d.values.get(courseKey);
      await file(
        d,
        "Choose course recovery JSON",
        m.makeCourseProgressExport(m.emptyCourseProgress()),
      );
      assert.ok(d.findButton("Apply reviewed course replacement"));
      await file(d, "Choose course recovery JSON", "{invalid replacement B");
      assert.equal(
        d.findButton("Apply reviewed course replacement"),
        undefined,
      );
      assert.equal(d.findButton("Confirm clear of course"), undefined);
      assert.equal(d.values.get(courseKey), original);
      await click(d, "Preview clearing course");
      assert.ok(d.findButton("Confirm clear of course"));
      await file(d, "Choose course recovery JSON", "not JSON C");
      assert.equal(d.findButton("Confirm clear of course"), undefined);
      assert.equal(
        d.findButton("Apply reviewed course replacement"),
        undefined,
      );
      assert.equal(d.values.get(courseKey), original);
    },
  );
  console.log(
    `${groups} learning portfolio helper/mounted-controller groups passed.`,
  );
} finally {
  globalThis.Date = NativeDate;
  await rm(temp, { recursive: true, force: true });
}
