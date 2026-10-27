// Four actual Astro SSR/inline callers, fictional DOM/storage; no browser/Save proof.
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { webcrypto } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import ts from "typescript";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import {
  compileCaller,
  installCaller,
  spin,
  settle,
  ToolElement,
  simulatedNativeStrings,
} from "../test-fixtures/remaining-record-other-callers/runtime.mjs";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const temp = await mkdtemp(join(resolve("node_modules"), ".rr-other-")),
  container = await AstroContainer.create();
const entries = [
  {
    id: "journal-desk",
    path: "src/components/record/journal.astro",
    key: "charitology-manuscript-v1",
    form: "#manuscript-form",
    host: "#manuscript-recovery",
    status: "#manuscript-status",
  },
  {
    id: "hundred-lab",
    path: "src/components/record/charitology-100.astro",
    key: "charitology-nominations-v1",
    form: "#nomination-form",
    host: "#nomination-recovery",
    status: "#nomination-status",
  },
  {
    id: "depth-census",
    path: "src/components/DepthCensus.astro",
    key: "charitology-depth-census-v1",
    form: "#census-form",
    host: "#census-recovery",
    status: "#census-status",
  },
  {
    id: "country-desk",
    path: "src/components/record/country-profiles.astro",
    key: "charitology-country-notes-v1",
    form: "#country-notes-form",
    host: "#country-notes-recovery",
    status: "#country-storage",
  },
];
let groups = 0;
const mounts = [];
async function check(name, run) {
  if (
    process.env.REMAINING_OTHER_CASE &&
    !name.includes(process.env.REMAINING_OTHER_CASE)
  )
    return;
  try {
    await run();
    groups++;
    console.log("✓ " + name);
  } catch (e) {
    e.message = name + ": " + e.message;
    throw e;
  }
}
const manuscript = (title = "Fictional draft") => ({
  title,
  author: "Fictional project",
  summary: "Fictional summary",
  kind: "Proposed method",
  question: "Fictional question",
  methods: "Fictional methods",
  results: "Untested proposal",
  limits: "Unknown",
  sources: "https://example.invalid/source",
});
const nomination = (id = "fictional-one", title = "Fictional nomination") => ({
  id,
  title,
  subject: "Fictional activity",
  depth: "unknown",
  mechanism: "Fictional mechanism",
  lenses: "Several lenses",
  evidence: "Unknown",
  funding: "Unknown",
  voice: "Missing voices",
  objection: "Unknown",
  conflicts: "Unknown",
});
const depth = (id = "fictional-depth", activity = "Fictional activity") => ({
  currency: "USD",
  rows: [
    {
      id,
      activity,
      amount: 0,
      depth: "unknown",
      source: "Fictional rationale",
    },
  ],
});
async function start(entry, raw, options = {}) {
  const d = installCaller(
    entry.html,
    entry.key,
    typeof raw === "string"
      ? raw
      : raw === undefined
        ? undefined
        : JSON.stringify(raw),
    options,
  );
  d.entry = entry;
  d.root = d.$("#" + entry.id);
  if (options.break) d.$(options.break).remove();
  if (options.failRead) d.flags.failRead = true;
  let release;
  if (options.held) release = await d.holdExact();
  const result = entry.run();
  await result;
  if (release) {
    assert.equal(d.$("[data-private-form-controls]").disabled, true);
    assert.ok(
      d
        .$(entry.form)
        .listeners.get("submit")
        .some((l) => l.capture),
    );
    if (options.beforeRelease) await options.beforeRelease(d);
    release();
  }
  await settle(
    () =>
      d.root.dataset.rrInitialization === "ready" ||
      d.root.dataset.rrInitialization === "failed",
    entry.id + " init",
  );
  if (!options.break)
    assert.equal(
      d.root.dataset.rrInitialization,
      "ready",
      d.$(entry.status).textContent,
    );
  mounts.push(d);
  return d;
}
async function idle(d) {
  await settle(
    () => d.root.dataset.rrBusy !== "true" && !d.action("reload").disabled,
  );
}
async function setForm(d, values) {
  const form = d.$(d.entry.form);
  for (const [name, value] of Object.entries(values)) {
    if (name === "id") continue;
    const el = form.elements.namedItem(name);
    assert.ok(el, name);
    el.value = value;
    await el.fire("input");
  }
}
async function submit(d) {
  const event = await d.$(d.entry.form).fire("submit");
  assert.equal(event.defaultPrevented, true);
  await idle(d);
}
async function download(d, selector) {
  const n = d.downloads.length;
  await d.$(selector).click();
  assert.equal(d.downloads.length, n + 1);
  return d.downloads.at(-1).text();
}
async function rawForms(d) {
  const n = d.downloads.length;
  await d.action("forms").click();
  assert.equal(d.downloads.length, n + 1);
  return JSON.parse(await d.downloads.at(-1).text());
}
async function ready(d, raw) {
  await d.choose(d.nativeFile(JSON.stringify(raw)));
  await settle(() => !d.action("apply").hidden);
  assert.equal(d.action("apply").disabled, false);
}
async function allow(d) {
  d.recoveryField("rrDiscard").checked = true;
  await d.recoveryField("rrDiscard").fire("change");
}
async function click(d, action) {
  await d.action(action).click();
  await idle(d);
}
try {
  for (const entry of entries) {
    Object.assign(entry, await compileCaller(entry.path, temp));
    entry.html = await container.renderToString(entry.component);
  }
  await check(
    "all four actual inline modules strict-compile against concrete recovery exports",
    async () => {
      const virtual = new Map(
        entries.map((e) => [resolve(e.path + ".rr-other.ts"), e.contents]),
      );
      const options = {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      };
      const host = ts.createCompilerHost(options),
        get = host.getSourceFile.bind(host),
        exists = host.fileExists.bind(host);
      host.fileExists = (p) => virtual.has(p) || exists(p);
      host.getSourceFile = (p, l, e, f) =>
        virtual.has(p)
          ? ts.createSourceFile(p, virtual.get(p), l, true)
          : get(p, l, e, f);
      const program = ts.createProgram([...virtual.keys()], options, host),
        diags = ts.getPreEmitDiagnostics(program);
      assert.equal(
        diags.length,
        0,
        diags
          .map(
            (d) =>
              d.file?.fileName +
              ": " +
              ts.flattenDiagnosticMessageText(d.messageText, " "),
          )
          .join("\n"),
      );
    },
  );
  for (const entry of entries) {
    await check(
      entry.id +
        ": SSR-disabled controls and earliest submit capture survive held initialization without startup writes",
      async () => {
        const d = await start(entry, undefined, { held: true });
        assert.equal(d.operations.filter((o) => o[0] !== "get").length, 0);
        assert.ok(d.operations.every((o) => o[1] === entry.key));
        assert.equal(d.$("[data-private-form-controls]").disabled, false);
        assert.equal(d.values.get("unrelated.private.key"), "unchanged");
        await d.window.fire("pagehide");
      },
    );
    await check(
      entry.id +
        ": failed post-open mount disposes owned session and keeps private fields disabled/intercepted",
      async () => {
        const d = await start(entry, undefined, { break: entry.host });
        assert.equal(d.root.dataset.rrInitialization, "failed");
        assert.equal(d.$("[data-private-form-controls]").disabled, true);
        assert.equal(
          (await d.$(entry.form).fire("submit")).defaultPrevented,
          true,
        );
        assert.equal(d.operations.filter((o) => o[0] !== "get").length, 0);
      },
    );
    await check(
      entry.id +
        ": corrupt current data stays protected, with no invented writable default or startup overwrite",
      async () => {
        const d = await start(entry, "{fictional-corrupt");
        assert.equal(d.$("[data-private-form-controls]").disabled, true);
        assert.equal(d.action("backup").disabled, true);
        assert.equal(d.values.get(entry.key), "{fictional-corrupt");
        const n = d.downloads.length;
        await d.action("protected").click();
        assert.equal(
          JSON.parse(await d.downloads[n].text()).raw,
          "{fictional-corrupt",
        );
        await d.window.fire("pagehide");
      },
    );
  }
  const [journal, nominations, census, country] = entries;
  for (const entry of entries)
    await check(
      entry.id +
        ": actual no-JavaScript SSR omits every named private field from default GET",
      async () => {
        const d = installCaller(entry.html, entry.key),
          form = d.$(entry.form),
          fieldset = d.$("[data-private-form-controls]");
        const query = () => {
          const p = new URLSearchParams();
          for (const field of form.querySelectorAll("input,textarea,select"))
            if (
              field.name &&
              !field.disabled &&
              !field.closest("fieldset[disabled]")
            )
              p.append(field.name, field.value);
          return p.toString();
        };
        for (const field of form.querySelectorAll("input,textarea,select"))
          if (field.name) field.value = "Fictional private " + field.name;
        assert.ok(form.querySelectorAll("[name]").length >= 3);
        assert.equal(fieldset.disabled, true);
        assert.equal(query(), "");
        assert.match(entry.html, /<noscript>[\s\S]*JavaScript/);
        fieldset.removeAttribute("disabled");
        assert.ok(query().length > 0);
        assert.equal(d.values.has(entry.key), false);
      },
    );

  await check(
    "manuscript coalesces partial autosave, exports current form without saving and keeps unfinished work dirty until exact completion",
    async () => {
      const d = await start(journal);
      await d.set('[name="title"]', "  Partial title\r\n");
      const raw = JSON.parse(await download(d, "#manuscript-backup"));
      assert.equal(raw.title, "  Partial title\r\n");
      assert.equal(d.values.has(journal.key), false);
      assert.equal(
        (await d.window.fire("beforeunload")).defaultPrevented,
        true,
      );
      await settle(() => d.values.has(journal.key), "manuscript autosave");
      assert.equal(d.saved().title, "  Partial title\r\n");
      assert.equal(d.saved().question, "");
      assert.equal(
        (await d.window.fire("beforeunload")).defaultPrevented,
        false,
      );
      await d.window.fire("pagehide");
    },
  );
  await check(
    "manuscript failed autosave and exact Retry keep a newer raw partial form and literal raw backup intact",
    async () => {
      const d = await start(journal, manuscript());
      d.flags.failWrite = true;
      await d.set('[name="title"]', "Fictional failed title");
      await settle(() => d.action("retry").disabled === false);
      await d.set('[name="title"]', "newer unfinished title");
      const out = await rawForms(d);
      assert.equal(out.forms[0].values.title, "newer unfinished title");
      d.flags.failWrite = false;
      await click(d, "retry");
      assert.equal(d.saved().title, "Fictional failed title");
      assert.equal(d.get('[name="title"]'), "newer unfinished title");
      assert.equal(
        (await d.window.fire("beforeunload")).defaultPrevented,
        true,
      );
      await d.window.fire("pagehide");
    },
  );
  await check(
    "manuscript abortable import A→Cancel→late A cannot overwrite current fields; valid reviewed restore resets only on adoption",
    async () => {
      const d = await start(journal, manuscript());
      await d.choose(d.nativeFile(JSON.stringify(manuscript("Late A")), true));
      const a = d.readers.at(-1);
      await click(d, "cancel");
      assert.ok(a.aborted);
      a.finish(true);
      await spin();
      assert.equal(d.get('[name="title"]'), "Fictional draft");
      assert.equal(d.action("apply").hidden, true);
      await ready(d, manuscript("Reviewed B"));
      await click(d, "apply");
      assert.equal(d.get('[name="title"]'), "Reviewed B");
      assert.equal(d.saved().title, "Reviewed B");
      await d.window.fire("pagehide");
    },
  );
  await check(
    "nominations failed-new→edit→Retry→resubmit retains exactly one admitted row identity and raw text",
    async () => {
      const d = await start(nominations);
      await setForm(d, nomination());
      d.flags.failWrite = true;
      await submit(d);
      assert.equal(d.action("retry").disabled, false);
      const first = JSON.parse(await download(d, "#nomination-json"))[0];
      assert.ok(first.id);
      await d.set('[name="title"]', "  Newer raw title\r\n");
      assert.equal((await rawForms(d)).forms[0].editingId, first.id);
      d.flags.failWrite = false;
      await click(d, "retry");
      assert.equal(d.saved().length, 1);
      assert.equal(d.saved()[0].id, first.id);
      assert.equal(d.get('[name="title"]'), "  Newer raw title\r\n");
      await submit(d);
      assert.equal(d.saved().length, 1);
      assert.equal(d.saved()[0].id, first.id);
      assert.equal(d.saved()[0].title, "  Newer raw title\r\n");
      assert.equal(d.get('[name="title"]'), "");
      await d.window.fire("pagehide");
    },
  );
  await check(
    "nomination synchronous admission refusal creates no dangling editing ID; native records exclude raw editor",
    async () => {
      const d = await start(nominations);
      await setForm(d, nomination());
      await d.set('[name="title"]', "   ");
      await submit(d);
      assert.equal((await rawForms(d)).forms[0].editingId, null);
      assert.deepEqual(JSON.parse(await download(d, "#nomination-json")), []);
      assert.equal(d.get('[name="title"]'), "   ");
      await d.window.fire("pagehide");
    },
  );
  await check(
    "nomination two-press deletion binds current view and preserves another unfinished editor; guarded Undo restores records",
    async () => {
      const d = await start(nominations, [
        nomination("a", "Packet A"),
        nomination("b", "Packet B"),
      ]);
      await d.$('[data-record-id="a"]').querySelector("button").click();
      await d.set('[name="title"]', "unfinished A");
      let buttons = d.$('[data-record-id="b"]').querySelectorAll("button");
      await buttons[1].click();
      assert.equal(d.saved().length, 2);
      await buttons[1].click();
      await idle(d);
      assert.equal(d.saved().length, 1);
      assert.equal(d.get('[name="title"]'), "unfinished A");
      await allow(d);
      await click(d, "undo");
      assert.equal(d.saved().length, 2);
      await d.window.fire("pagehide");
    },
  );
  await check(
    "Depth failed-new row retains ID through newer raw text, exact Retry and resubmit without duplicate or currency-form loss",
    async () => {
      const d = await start(census);
      await setForm(d, {
        activity: "  Activity A\r\n",
        amount: "0",
        depth: "unknown",
        source: "Fictional rationale",
      });
      d.flags.failWrite = true;
      await submit(d);
      const first = JSON.parse(await download(d, "#census-json")).rows[0];
      await d.set('[name="activity"]', "newer activity");
      await d.set("#census-currency", "invalid");
      d.flags.failWrite = false;
      await click(d, "retry");
      assert.equal(d.saved().rows[0].id, first.id);
      await submit(d);
      assert.equal(d.saved().rows.length, 1);
      assert.equal(d.saved().rows[0].id, first.id);
      assert.equal(d.saved().rows[0].activity, "newer activity");
      assert.equal(d.saved().rows[0].amount, 0);
      assert.equal(d.get("#census-currency"), "invalid");
      assert.match(d.$("#census-results").textContent, /zero total/);
      await d.window.fire("pagehide");
    },
  );
  await check(
    "Depth blank and bad numeric input never become zero or create a dangling new editor ID",
    async () => {
      const d = await start(census);
      await setForm(d, {
        activity: "Fictional activity",
        amount: "",
        source: "Fictional rationale",
      });
      await submit(d);
      assert.equal((await rawForms(d)).forms[0].editingId, null);
      assert.deepEqual(JSON.parse(await download(d, "#census-json")).rows, []);
      d.$('[name="amount"]').value = "0";
      d.$('[name="amount"]').validity = { badInput: true };
      await submit(d);
      assert.equal((await rawForms(d)).forms[0].editingId, null);
      assert.equal(d.values.has(census.key), false);
      await d.window.fire("pagehide");
    },
  );
  await check(
    "Depth separate currency save preserves raw activity, invalid currency is retained and row deletion requires two current presses",
    async () => {
      const d = await start(census);
      await d.set('[name="activity"]', "unfinished activity");
      await d.set("#census-currency", "EUR", "change");
      await idle(d);
      assert.equal(d.saved().currency, "EUR");
      assert.equal(d.get('[name="activity"]'), "unfinished activity");
      await setForm(d, { amount: "12.34", source: "Fictional rationale" });
      await submit(d);
      let buttons = d.$(".census-row").querySelectorAll("button");
      await buttons[1].click();
      assert.equal(d.saved().rows.length, 1);
      await d.set('[name="activity"]', "new unrelated field");
      await buttons[1].click();
      assert.equal(d.saved().rows.length, 1);
      await buttons[1].click();
      await idle(d);
      assert.equal(d.saved().rows.length, 0);
      assert.equal(d.get('[name="activity"]'), "new unrelated field");
      await d.window.fire("pagehide");
    },
  );
  await check(
    "country compare, filter, reset and factual downloads never refill or save primary unfinished notes",
    async () => {
      const d = await start(country, {
        KEN: { voices: "Saved Kenyan note", institutions: "", gaps: "" },
        USA: { voices: "Saved US note", institutions: "", gaps: "" },
      });
      await d.set("#country-voices", "unfinished primary");
      await d.set("#country-b", "USA", "change");
      await d.set("#country-search", "Kenya");
      await d.$("#country-reset").click();
      assert.equal(d.get("#country-voices"), "unfinished primary");
      assert.equal(d.get("#country-a"), "KEN");
      const json = JSON.parse(await download(d, "#country-notes-json"));
      assert.equal(json.KEN.voices, "unfinished primary");
      assert.equal(json.USA.voices, "Saved US note");
      const brief = await download(d, "#country-note");
      assert.match(brief, /unfinished primary/);
      assert.equal(d.saved().KEN.voices, "Saved Kenyan note");
      await d.window.fire("pagehide");
    },
  );
  await check(
    "country primary change flushes the captured earlier country before refilling and never saves its notes under the next country",
    async () => {
      const d = await start(country, {
        KEN: { voices: "Kenya saved", institutions: "", gaps: "" },
        USA: { voices: "US saved", institutions: "", gaps: "" },
      });
      await d.set("#country-voices", "  Kenya pending\r\n");
      await d.set("#country-a", "USA", "change");
      await settle(() => d.get("#country-a") === "USA");
      assert.equal(d.saved().KEN.voices, "  Kenya pending\r\n");
      assert.equal(d.saved().USA.voices, "US saved");
      assert.equal(d.get("#country-voices"), "US saved");
      await d.window.fire("pagehide");
    },
  );
  await check(
    "country failed navigation preserves earlier primary identity and raw fields; edit invalidates discard and exact Retry does not refill",
    async () => {
      const d = await start(country, {
        KEN: { voices: "Kenya saved", institutions: "", gaps: "" },
        USA: { voices: "US saved", institutions: "", gaps: "" },
      });
      d.flags.failWrite = true;
      await d.set("#country-voices", "Kenya failed");
      await d.set("#country-a", "USA", "change");
      await settle(() => !d.$("#country-navigation").hidden);
      assert.equal(d.get("#country-a"), "KEN");
      assert.equal(d.get("#country-voices"), "Kenya failed");
      await d.set("#country-voices", "Kenya newer raw");
      assert.equal(d.$("#country-navigation").hidden, true);
      await d.$("#country-navigation-discard").click();
      assert.equal(d.get("#country-a"), "KEN");
      d.flags.failWrite = false;
      await click(d, "retry");
      assert.equal(d.get("#country-voices"), "Kenya newer raw");
      assert.equal(d.saved().KEN.voices, "Kenya failed");
      await d.set("#country-a", "USA", "change");
      await settle(() => d.get("#country-a") === "USA");
      assert.equal(d.saved().KEN.voices, "Kenya newer raw");
      assert.equal(d.saved().USA.voices, "US saved");
      await d.window.fire("pagehide");
    },
  );
  await check(
    "country explicit captured discard reloads the validated saved map before opening another country",
    async () => {
      const d = await start(country, {
        KEN: { voices: "Kenya saved", institutions: "", gaps: "" },
        USA: { voices: "US saved", institutions: "", gaps: "" },
      });
      d.flags.failWrite = true;
      await d.set("#country-voices", "Kenya failed");
      await d.set("#country-a", "USA", "change");
      await settle(() => !d.$("#country-navigation").hidden);
      await d.$("#country-navigation-discard").click();
      await settle(() => d.get("#country-a") === "USA");
      assert.equal(d.saved().KEN.voices, "Kenya saved");
      assert.equal(d.get("#country-voices"), "US saved");
      assert.equal(d.action("retry").disabled, true);
      await d.window.fire("pagehide");
    },
  );
  await check(
    "country full map export retains all 217 exact known note identities and separate literal primary raw form",
    async () => {
      const actual = JSON.parse(
        country.html
          .match(/data-countries="([^"]*)"/)[1]
          .replaceAll("&#34;", '"')
          .replaceAll("&quot;", '"')
          .replaceAll("&amp;", "&"),
      );
      assert.equal(actual.countries.length, 217);
      const map = Object.fromEntries(
        actual.countries.map((c) => [
          c.id,
          { voices: c.id + " exact\r\n", institutions: "0", gaps: "Unknown" },
        ]),
      );
      const d = await start(country, map);
      const out = JSON.parse(await download(d, "#country-notes-json"));
      assert.equal(Object.keys(out).length, 217);
      assert.deepEqual(out, map);
      const forms = await rawForms(d);
      assert.equal(forms.forms[0].form, "country:KEN");
      assert.equal(forms.forms[0].values.voices, "KEN exact\r\n");
      await d.window.fire("pagehide");
    },
  );
  for (const [entry, saved] of [
    [journal, manuscript()],
    [nominations, [nomination()]],
    [census, depth()],
    [
      country,
      { KEN: { voices: "Fictional note", institutions: "", gaps: "" } },
    ],
  ]) {
    await check(
      entry.id +
        ": read-only reload adopts validated records and fields without any write; disposal disables forms and late work",
      async () => {
        const d = await start(entry, saved, { unsupported: true });
        assert.equal(d.action("review-remove").disabled, true);
        const next =
          entry === journal
            ? manuscript("Read only B")
            : entry === nominations
              ? [nomination("b", "Read only B")]
              : entry === census
                ? depth("b", "Read only B")
                : {
                    KEN: { voices: "Read only B", institutions: "", gaps: "" },
                  };
        d.values.set(entry.key, JSON.stringify(next));
        await click(d, "reload");
        assert.equal(d.operations.filter((o) => o[0] !== "get").length, 0);
        if (entry === journal)
          assert.equal(d.get('[name="title"]'), "Read only B");
        if (entry === country)
          assert.equal(d.get("#country-voices"), "Read only B");
        await d.window.fire("pagehide");
        assert.equal(d.$("[data-private-form-controls]").disabled, true);
      },
    );
  }
  await check(
    "manuscript untouched hydration preserves native CR/LF through unrelated autosave/export, while first explicit unchanged input permanently drops the original pair",
    async () =>
      simulatedNativeStrings(async () => {
        const original = manuscript("Title\r\noriginal");
        original.summary = "Summary\r\noriginal";
        const d = await start(journal, original);
        assert.equal(d.get('[name="title"]'), "Titleoriginal");
        assert.equal(d.get('[name="summary"]'), "Summary\noriginal");
        await d.set('[name="author"]', "New author");
        await settle(
          () => d.values.has(journal.key) && d.saved().author === "New author",
        );
        assert.equal(d.saved().title, original.title);
        assert.equal(d.saved().summary, original.summary);
        assert.equal(
          JSON.parse(await download(d, "#manuscript-backup")).title,
          original.title,
        );
        assert.equal(
          (await rawForms(d)).forms[0].values.title,
          "Titleoriginal",
        );
        await d.$('[name="title"]').fire("input");
        await settle(() => d.saved().title === "Titleoriginal");
        await d.set('[name="title"]', "different");
        await d.set('[name="title"]', "Titleoriginal");
        assert.equal(
          JSON.parse(await download(d, "#manuscript-backup")).title,
          "Titleoriginal",
        );
        await d.window.fire("pagehide");
      }),
  );
  await check(
    "nomination untouched native strings survive an unrelated edited field; raw-form recovery contains only exposed strings",
    async () =>
      simulatedNativeStrings(async () => {
        const original = nomination("native-id", "Title\r\noriginal");
        original.evidence = "Evidence\r\noriginal";
        const d = await start(nominations, [original]);
        await d
          .$('[data-record-id="native-id"]')
          .querySelector("button")
          .click();
        assert.equal(d.get('[name="title"]'), "Titleoriginal");
        assert.equal(
          (await rawForms(d)).forms[0].values.evidence,
          "Evidence\noriginal",
        );
        await d.set('[name="subject"]', "new subject");
        await submit(d);
        assert.equal(d.saved()[0].title, original.title);
        assert.equal(d.saved()[0].evidence, original.evidence);
        assert.equal(d.saved()[0].subject, "new subject");
        await d.window.fire("pagehide");
      }),
  );
  await check(
    "Depth separate currency save preserves untouched source hydration and raw editor; admitted numeric zero stays zero",
    async () =>
      simulatedNativeStrings(async () => {
        const original = depth();
        original.rows[0].source = "First\r\nsecond";
        const d = await start(census, original);
        await d.$(".census-row").querySelector("button").click();
        assert.equal(d.get('[name="source"]'), "First\nsecond");
        await d.set("#census-currency", "USD", "change");
        await idle(d);
        assert.equal(d.get('[name="source"]'), "First\nsecond");
        assert.equal(
          (await rawForms(d)).forms[0].values.source,
          "First\nsecond",
        );
        await d.set('[name="activity"]', "different activity");
        await submit(d);
        assert.equal(d.saved().rows[0].source, "First\r\nsecond");
        assert.equal(d.saved().rows[0].amount, 0);
        await d.window.fire("pagehide");
      }),
  );
  await check(
    "country untouched CR/LF notes survive compare and complete overlay export; explicit input of sanitized display replaces the original",
    async () =>
      simulatedNativeStrings(async () => {
        const d = await start(country, {
          KEN: { voices: "First\r\nsecond", institutions: "", gaps: "" },
        });
        assert.equal(d.get("#country-voices"), "First\nsecond");
        await d.set("#country-b", "USA", "change");
        assert.equal(
          JSON.parse(await download(d, "#country-notes-json")).KEN.voices,
          "First\r\nsecond",
        );
        assert.equal(
          (await rawForms(d)).forms[0].values.voices,
          "First\nsecond",
        );
        await d.$("#country-voices").fire("input");
        await settle(() => d.saved().KEN.voices === "First\nsecond");
        assert.equal(
          JSON.parse(await download(d, "#country-notes-json")).KEN.voices,
          "First\nsecond",
        );
        await d.window.fire("pagehide");
      }),
  );
  for (const entry of [nominations, census])
    await check(
      entry.id +
        ": held admitted-new save superseded by typing keeps the same editor ID and all newer fields for resubmit",
      async () => {
        const d = await start(entry);
        if (entry === nominations) await setForm(d, nomination());
        else
          await setForm(d, {
            activity: "initial",
            amount: "0",
            depth: "unknown",
            source: "Fictional rationale",
          });
        const release = await d.holdExact();
        await d.$(entry.form).fire("submit");
        await spin();
        const identity = (await rawForms(d)).forms[0].editingId;
        assert.ok(identity);
        const name = entry === nominations ? "title" : "activity";
        await d.set('[name="' + name + '"]', "newer held field");
        release();
        await idle(d);
        assert.equal(d.values.has(entry.key), false);
        assert.equal(d.get('[name="' + name + '"]'), "newer held field");
        assert.equal((await rawForms(d)).forms[0].editingId, identity);
        await submit(d);
        const rows = entry === nominations ? d.saved() : d.saved().rows;
        assert.equal(rows.length, 1);
        assert.equal(rows[0].id, identity);
        assert.equal(rows[0][name], "newer held field");
        await d.window.fire("pagehide");
      },
    );
  await check(
    "country held primary save followed by a newer field edit cannot change country or apply the older notes",
    async () => {
      const d = await start(country, {
        KEN: { voices: "saved old", institutions: "", gaps: "" },
        USA: { voices: "saved US", institutions: "", gaps: "" },
      });
      const release = await d.holdExact();
      await d.set("#country-voices", "held old field");
      await d.set("#country-a", "USA", "change");
      await spin();
      assert.equal(d.get("#country-a"), "KEN");
      await d.set("#country-voices", "newer retained field");
      release();
      await spin();
      await spin();
      assert.equal(d.get("#country-a"), "KEN");
      assert.equal(d.get("#country-voices"), "newer retained field");
      assert.equal(d.$("#country-navigation").hidden, true);
      await settle(() => d.saved().KEN.voices === "newer retained field");
      await d.window.fire("pagehide");
    },
  );
  await check(
    "country Retry followed by explicit Try saving and open creates a fresh navigation without reusing old discard authority",
    async () => {
      const d = await start(country, {
        KEN: { voices: "saved old", institutions: "", gaps: "" },
        USA: { voices: "saved US", institutions: "", gaps: "" },
      });
      d.flags.failWrite = true;
      await d.set("#country-voices", "failed field");
      await d.set("#country-a", "USA", "change");
      await settle(() => !d.$("#country-navigation").hidden);
      d.flags.failWrite = false;
      await click(d, "retry");
      await d.$("#country-navigation-save").click();
      await settle(() => d.get("#country-a") === "USA");
      assert.equal(d.saved().KEN.voices, "failed field");
      assert.equal(d.get("#country-voices"), "saved US");
      await d.window.fire("pagehide");
    },
  );
  for (const [entry, saved] of [
    [journal, manuscript()],
    [nominations, [nomination()]],
    [census, depth()],
    [country, { KEN: { voices: "saved note", institutions: "", gaps: "" } }],
  ])
    await check(
      entry.id +
        ": null-key storage clear revokes an owned preview immediately and preserves unfinished fields",
      async () => {
        const d = await start(entry, saved),
          selector =
            entry === country
              ? "#country-voices"
              : entry === census
                ? '[name="activity"]'
                : '[name="title"]';
        await d.set(selector, "unfinished after clear");
        await allow(d);
        await ready(d, saved);
        assert.equal(d.action("apply").hidden, false);
        const before = d.operations.length;
        d.values.delete(entry.key);
        await d.window.fire("storage", { key: null });
        assert.equal(d.action("apply").hidden, true);
        await settle(() =>
          d
            .host()
            .querySelectorAll("p")
            .some((p) => p.dataset.rrStatus && /unsaved:/.test(p.textContent)),
        );
        assert.equal(d.get(selector), "unfinished after clear");
        assert.equal(d.values.has(entry.key), false);
        assert.ok(
          d.operations.slice(before).every(([, key]) => key === entry.key),
        );
        assert.equal(
          (await d.window.fire("beforeunload")).defaultPrevented,
          true,
        );
        await d.window.fire("pagehide");
      },
    );
  for (const [entry, saved] of [
    [journal, manuscript()],
    [nominations, [nomination()]],
    [census, depth()],
    [country, { KEN: { voices: "saved note", institutions: "", gaps: "" } }],
  ]) {
    const selector =
      entry === country
        ? "#country-voices"
        : entry === census
          ? '[name="activity"]'
          : '[name="title"]';
    const editSaved = async (d) => {
      if (entry === nominations)
        await d.$(".nomination-card").querySelector("button").click();
      if (entry === census)
        await d.$(".census-row").querySelector("button").click();
    };
    await check(
      entry.id +
        ": persisted hide/show retains live raw fields and editor identity, revokes preview and does not automatically resume an old timer",
      async () => {
        const d = await start(entry, saved);
        await editSaved(d);
        await d.set(selector, "unfinished cached field");
        const id = (await rawForms(d)).forms[0].editingId;
        await allow(d);
        await ready(d, saved);
        const before = d.values.get(entry.key);
        await d.window.fire("pagehide", { persisted: true });
        assert.equal(d.$("[data-private-form-controls]").disabled, false);
        assert.equal(d.action("apply").hidden, true);
        assert.equal(d.get(selector), "unfinished cached field");
        await pause(280);
        assert.equal(d.values.get(entry.key), before);
        await d.window.fire("pageshow", { persisted: true });
        await settle(() =>
          /actual saved copy was rechecked/.test(d.$(entry.status).textContent),
        );
        assert.equal(d.get(selector), "unfinished cached field");
        assert.equal((await rawForms(d)).forms[0].editingId, id);
        assert.equal(d.values.get(entry.key), before);
        assert.equal(
          (await d.window.fire("beforeunload")).defaultPrevented,
          true,
        );
        if (entry === journal || entry === country) {
          await d.$(selector).fire("input");
          await settle(() => d.values.get(entry.key) !== before);
        } else {
          await submit(d);
          assert.equal(
            entry === nominations
              ? d.saved()[0].title
              : d.saved().rows[0].activity,
            "unfinished cached field",
          );
        }
        await d.window.fire("pagehide");
        assert.equal(d.$("[data-private-form-controls]").disabled, true);
      },
    );
    await check(
      entry.id +
        ": persisted return with externally changed disk preserves fields, revokes old review and never automatically overwrites the new copy",
      async () => {
        const d = await start(entry, saved);
        await editSaved(d);
        await d.set(selector, "unfinished cached field");
        await d.window.fire("pagehide", { persisted: true });
        const next =
          entry === journal
            ? manuscript("Foreign saved B")
            : entry === nominations
              ? [nomination("foreign-b", "Foreign saved B")]
              : entry === census
                ? depth("foreign-b", "Foreign saved B")
                : {
                    KEN: {
                      voices: "Foreign saved B",
                      institutions: "",
                      gaps: "",
                    },
                  };
        const raw = JSON.stringify(next);
        d.values.set(entry.key, raw);
        await d.window.fire("pageshow", { persisted: true });
        await settle(() =>
          /unfinished fields were retained.*recovery/i.test(
            d.$(entry.status).textContent,
          ),
        );
        assert.equal(d.get(selector), "unfinished cached field");
        assert.equal(d.values.get(entry.key), raw);
        assert.equal(d.action("apply").hidden, true);
        await pause(280);
        assert.equal(d.values.get(entry.key), raw);
        await d.$(selector).fire("input");
        if (entry === journal || entry === country) await pause(280);
        else await submit(d);
        assert.equal(d.values.get(entry.key), raw);
        assert.equal(d.get(selector), "unfinished cached field");
        await d.window.fire("pagehide");
      },
    );
    await check(
      entry.id +
        ": persisted lifecycle revokes an actual held save before release and rechecks saved bytes without resetting that form",
      async () => {
        const d = await start(entry, saved);
        await editSaved(d);
        const release = await d.holdExact(),
          before = d.values.get(entry.key);
        await d.set(selector, "held cached field");
        if (entry === journal || entry === country) await pause(280);
        else await d.$(entry.form).fire("submit");
        await spin();
        const id = (await rawForms(d)).forms[0].editingId;
        await d.window.fire("pagehide", { persisted: true });
        await d.window.fire("pageshow", { persisted: true });
        release();
        await settle(() =>
          /actual saved copy was rechecked/.test(d.$(entry.status).textContent),
        );
        await idle(d);
        assert.equal(d.values.get(entry.key), before);
        assert.equal(d.get(selector), "held cached field");
        assert.equal((await rawForms(d)).forms[0].editingId, id);
        assert.equal(d.$("[data-private-form-controls]").disabled, false);
        await d.window.fire("pagehide");
      },
    );
  }
  for (const [entry, saved] of [
    [journal, manuscript()],
    [nominations, [nomination()]],
    [census, depth()],
    [country, { KEN: { voices: "saved note", institutions: "", gaps: "" } }],
  ])
    await check(
      entry.id +
        ": persisted lifecycle retains exact failed intent and newer raw fields through explicit Retry",
      async () => {
        const d = await start(entry, saved),
          selector =
            entry === country
              ? "#country-voices"
              : entry === census
                ? '[name="activity"]'
                : '[name="title"]';
        if (entry === nominations)
          await d.$(".nomination-card").querySelector("button").click();
        if (entry === census)
          await d.$(".census-row").querySelector("button").click();
        d.flags.failWrite = true;
        await d.set(selector, "exact failed cached field");
        if (entry === journal || entry === country)
          await settle(() => !d.action("retry").disabled);
        else await submit(d);
        await d.set(selector, "newer retained cached raw");
        const id = (await rawForms(d)).forms[0].editingId;
        await d.window.fire("pagehide", { persisted: true });
        await d.window.fire("pageshow", { persisted: true });
        await settle(() =>
          /exact failed operation is still pending/.test(
            d.$(entry.status).textContent,
          ),
        );
        assert.equal(d.get(selector), "newer retained cached raw");
        assert.equal((await rawForms(d)).forms[0].editingId, id);
        d.flags.failWrite = false;
        await click(d, "retry");
        const persisted =
          entry === journal
            ? d.saved().title
            : entry === nominations
              ? d.saved()[0].title
              : entry === census
                ? d.saved().rows[0].activity
                : d.saved().KEN.voices;
        assert.equal(persisted, "exact failed cached field");
        assert.equal(d.get(selector), "newer retained cached raw");
        assert.equal(
          (await d.window.fire("beforeunload")).defaultPrevented,
          true,
        );
        await d.window.fire("pagehide");
      },
    );
  for (const [entry, saved] of [
    [journal, manuscript()],
    [nominations, [nomination()]],
    [census, depth()],
    [country, { KEN: { voices: "saved note", institutions: "", gaps: "" } }],
  ])
    await check(
      entry.id +
        ": persisted hide/show during held open does not dispose or invalidate initialization and rechecks bytes before first hydration",
      async () => {
        const next =
          entry === journal
            ? manuscript("Returned before ready")
            : entry === nominations
              ? [nomination("returned", "Returned before ready")]
              : entry === census
                ? depth("returned", "Returned before ready")
                : {
                    KEN: {
                      voices: "Returned before ready",
                      institutions: "",
                      gaps: "",
                    },
                  };
        const baseline = await start(entry, saved);
        const initialReads = baseline.operations.filter(
          ([operation]) => operation === "get",
        ).length;
        await baseline.window.fire("pagehide");
        const d = await start(entry, saved, {
          held: true,
          beforeRelease: async (owner) => {
            await owner.window.fire("pagehide", { persisted: true });
            assert.equal(owner.root.dataset.rrInitialization, "opening");
            owner.values.set(entry.key, JSON.stringify(next));
            await owner.window.fire("pageshow", { persisted: true });
            assert.equal(
              owner.$("[data-private-form-controls]").disabled,
              true,
            );
          },
        });
        assert.equal(
          d.operations.filter(([operation]) => operation === "get").length,
          initialReads + 1,
        );
        assert.equal(
          d.operations.filter(([operation]) => operation !== "get").length,
          0,
        );
        if (entry === journal)
          assert.equal(d.get('[name="title"]'), "Returned before ready");
        else if (entry === country)
          assert.equal(d.get("#country-voices"), "Returned before ready");
        else
          assert.match(
            d.$(entry === nominations ? "#nomination-list" : "#census-rows")
              .textContent,
            /Returned before ready/,
          );
        await d.window.fire("pagehide");
      },
    );
  console.log(
    `Remaining-record other callers: ${groups} actual groups; strict zero. Actual Astro SSR/compiled scripts, fictional DOM only.`,
  );
} finally {
  for (const d of mounts) await d.window.fire("pagehide");
  await rm(temp, { recursive: true, force: true });
}
