// Actual Astro SSR markup + actual inline scripts + actual D1 engine. Fictional data only.
// This bounded DOM checks state/events; native browser layout/download proof is separate.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { transform } from "@astrojs/compiler";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import {
  installToolDom,
  settleTools,
} from "../test-fixtures/donor-recovery/tool-dom.mjs";
import {
  donorFixtures,
  STAMP,
} from "../test-fixtures/donor-recovery/factory.mjs";
const names = [
  "giving-dashboard",
  "portfolio-builder",
  "legacy-planner",
  "gift-giving",
  "cost-effectiveness-model-kit",
  "due-diligence-checklist",
  "grant-evaluator",
  "impact-measurement-toolkit",
  "one-click-split",
  "values-compass",
  "disaster-response-guide",
  "charitology-wrapped",
];
const keyByTool = {
  "giving-dashboard": "gifts",
  "portfolio-builder": "portfolio",
  "legacy-planner": "legacy",
  "gift-giving": "gift-card",
  "cost-effectiveness-model-kit": "ce-models",
  "due-diligence-checklist": "due-diligence",
  "impact-measurement-toolkit": "impact-drafts",
  "one-click-split": "split",
  "values-compass": "compass",
  "disaster-response-guide": "disaster-plan",
  "charitology-wrapped": "wrapped",
};
const temporary = await mkdtemp(join(resolve("node_modules"), ".d1-tools-"));
let count = 0,
  serial = 0;
const rendered = new Map(),
  scripts = new Map();
const container = await AstroContainer.create();
async function check(name, run) {
  try {
    await run();
    count++;
    console.log("✓ " + name);
  } catch (e) {
    e.message = name + ": " + e.message;
    throw e;
  }
}
async function prepare(name) {
  if (rendered.has(name)) return;
  const path = `src/components/tools/${name}.astro`,
    text = await readFile(path, "utf8"),
    inline = text.match(/<script>([\s\S]*?)<\/script>/)[1];
  const compiled = await transform(text, {
    filename: path,
    internalURL: "astro/compiler-runtime",
    renderScript: true,
    resolvePath: async (x) => x,
  });
  assert.equal(
    compiled.diagnostics.filter((d) => d.severity === 1).length,
    0,
    name,
  );
  const file = join(temporary, name + ".mjs");
  await build({
    stdin: {
      contents: compiled.code.replace(
        /^import\s+"[^"]+\?astro&type=style[^"]*";$/gm,
        "",
      ),
      loader: "ts",
      resolveDir: resolve("src/components/tools"),
    },
    outfile: file,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    loader: { ".css": "empty" },
    plugins: [
      {
        name: "actual-astro",
        setup(b) {
          b.onLoad({ filter: /\.astro$/ }, async (a) => {
            const r = await transform(await readFile(a.path, "utf8"), {
              filename: a.path,
              internalURL: "astro/compiler-runtime",
              renderScript: true,
              resolvePath: async (x) => x,
            });
            return {
              contents: r.code.replace(
                /^import\s+"[^"]+\?astro&type=style[^"]*";$/gm,
                "",
              ),
              loader: "ts",
              resolveDir: resolve(a.path, ".."),
            };
          });
        },
      },
    ],
    define: {
      "import.meta.env.BASE_URL": '"/charitology/"',
      "import.meta.env.SITE": '"https://example.invalid"',
    },
    logLevel: "silent",
  });
  const Component = (await import(pathToFileURL(file))).default;
  rendered.set(name, await container.renderToString(Component));
  const script = await build({
    stdin: {
      contents: inline.replace(
        "void initializeDonorTool().catch",
        "export const ready = initializeDonorTool().catch",
      ),
      loader: "ts",
      resolveDir: resolve("src/components/tools"),
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    define: {
      "import.meta.env.BASE_URL": '"/charitology/"',
      "import.meta.env.SITE": '"https://example.invalid"',
    },
    logLevel: "silent",
  });
  scripts.set(name, script.outputFiles[0].text);
}
async function start(name, initial = {}, options = {}) {
  await prepare(name);
  const d = installToolDom(rendered.get(name), initial, options);
  const release = options.holdKey ? await d.hold(options.holdKey) : null;
  const file = join(temporary, "script-" + serial++ + ".mjs");
  await writeFile(file, scripts.get(name));
  const m = await import(pathToFileURL(file));
  return { ...d, ready: m.ready, release };
}
async function mount(name, initial = {}, options = {}) {
  const d = await start(name, initial, options);
  await d.ready;
  assert.ok(
    d.document.querySelector("[data-d1-recovery]"),
    "recovery controls mounted: " + d.root.textContent.slice(-500),
  );
  assert.doesNotMatch(
    d.root.textContent,
    /Missing element:|\.\.\. is not a function/,
  );
  return d;
}
const value = (d, k) => JSON.parse(d.values.get("charitology." + k));
const clicks = async (d, id) => {
  const e = d.$(id);
  assert.ok(e, id);
  await e.click();
};
try {
  await check(
    "all twelve actual SSR tool scripts mount without writing any saved key",
    async () => {
      for (const name of names) {
        const d = await mount(name);
        assert.equal(
          d.operations.filter((o) => o[0] !== "get").length,
          0,
          name,
        );
        assert.equal(d.values.get("unrelated.private.key"), "unchanged");
      }
    },
  );
  await check(
    "all real stored producer shapes hydrate without rewritten IDs or startup writes",
    async () => {
      const fixtures = donorFixtures();
      fixtures.legacy.name = "Fictional saved testator";
      fixtures["gift-card"].to = "Fictional saved recipient";
      fixtures["ce-models"][0].name = "Fictional saved model";
      fixtures.split.rows[0].name = "Fictional saved destination";
      fixtures.wrapped.hide = true;
      for (const name of names) {
        const initial =
          name === "grant-evaluator"
            ? Object.fromEntries(
                ["grant-proposals", "grant-weights", "grant-draft"].map((k) => [
                  k,
                  fixtures[k],
                ]),
              )
            : { [keyByTool[name]]: fixtures[keyByTool[name]] };
        const d = await mount(name, initial);
        assert.equal(
          d.operations.filter((o) => o[0] !== "get").length,
          0,
          name,
        );
        for (const [k, v] of Object.entries(initial))
          assert.deepEqual(value(d, k), v);
        if (name === "giving-dashboard")
          assert.equal(d.$("#gd-rows").querySelectorAll("tr").length, 1);
        if (name === "portfolio-builder")
          assert.equal(d.get("#pb-budget"), String(fixtures.portfolio.budget));
        if (name === "values-compass")
          assert.equal(d.$("#vc-result").hidden, false);
        if (name === "legacy-planner")
          assert.equal(d.get("#lp-name"), fixtures.legacy.name);
        if (name === "gift-giving")
          assert.equal(d.get("#gg-to"), fixtures["gift-card"].to);
        if (name === "cost-effectiveness-model-kit")
          assert.match(d.$("#ce-saved").textContent, /Fictional saved model/);
        if (name === "due-diligence-checklist")
          assert.equal(
            d.get("#dd-name"),
            fixtures["due-diligence"].orgs[0].name,
          );
        if (name === "grant-evaluator")
          assert.equal(d.get("#ge-name"), fixtures["grant-draft"].name);
        if (name === "impact-measurement-toolkit")
          assert.equal(
            d.get("#imt-f-name"),
            fixtures["impact-drafts"].drafts[0].name,
          );
        if (name === "one-click-split")
          assert.ok(
            d
              .$("#ocs-rows")
              .querySelectorAll("input")
              .some((input) => input.value === fixtures.split.rows[0].name),
          );
        if (name === "disaster-response-guide")
          assert.equal(
            d.get("#dr-amount"),
            String(fixtures["disaster-plan"].amount),
          );
        if (name === "charitology-wrapped")
          assert.equal(d.$("#wr-hide").checked, true);
      }
    },
  );
  await check(
    "absent Portfolio and Compass defaults never claim a saved record or completed quiz",
    async () => {
      const portfolio = await mount("portfolio-builder");
      assert.doesNotMatch(
        portfolio.$("#pb-loaded").textContent,
        /Loaded your saved/,
      );
      const compass = await mount("values-compass");
      assert.equal(compass.$("#vc-result").hidden, true);
      const f = donorFixtures();
      const savedPortfolio = await mount("portfolio-builder", {
        portfolio: f.portfolio,
      });
      assert.match(
        savedPortfolio.$("#pb-loaded").textContent,
        /Loaded your saved/,
      );
      const savedCompass = await mount("values-compass", {
        compass: f.compass,
      });
      assert.equal(savedCompass.$("#vc-result").hidden, false);
    },
  );
  await check(
    "healthy absent keys show no blocked-storage claim, while unavailable writers retain a warning",
    async () => {
      for (const [name, selector] of [
        ["giving-dashboard", "#gd-storage"],
        ["impact-measurement-toolkit", "#imt-storage"],
        ["one-click-split", "#ocs-storage"],
        ["due-diligence-checklist", "#dd-storage"],
        ["legacy-planner", "#lp-storage"],
      ]) {
        const healthy = await mount(name);
        assert.equal(healthy.$(selector).hidden, true, name);
        const unavailable = await mount(name, {}, { unsupported: true });
        assert.equal(unavailable.$(selector).hidden, false, name);
      }
      const wrapped = await mount("charitology-wrapped");
      assert.equal(wrapped.$("#wr-blocked").hidden, true);
      const corruptGifts = await mount("charitology-wrapped", {
        gifts: "{corrupt",
      });
      assert.equal(corruptGifts.$("#wr-blocked").hidden, false);
    },
  );
  await check(
    "Dashboard explicit gift save and successful saved-key removal both update working UI",
    async () => {
      const d = await mount("giving-dashboard", {
        gifts: donorFixtures().gifts,
      });
      await d.set("#gd-date", "2026-10-27");
      await d.set("#gd-org", "Fictional new gift");
      await d.set("#gd-amount", "25");
      await d.set("#gd-cause", "other", "change");
      await d.$("#gd-form").fire("submit");
      assert.equal(value(d, "gifts").length, 2);
      await clicks(d, "#gd-clear");
      assert.equal(d.values.has("charitology.gifts"), false);
      assert.match(d.$("#gd-count").textContent, /–/);
      assert.equal(d.$("#gd-rows").querySelectorAll("tr").length, 0);
    },
  );
  await check(
    "Dashboard quota failure retains one generated gift and retry does not replay insertion",
    async () => {
      const d = await mount("giving-dashboard");
      d.flags.failWrite = true;
      await d.set("#gd-date", "2026-10-27");
      await d.set("#gd-org", "Fictional quota gift");
      await d.set("#gd-amount", "25");
      await d.set("#gd-cause", "other", "change");
      await d.$("#gd-form").fire("submit");
      assert.equal(d.values.has("charitology.gifts"), false);
      assert.equal(d.$("#gd-rows").querySelectorAll("tr").length, 1);
      d.flags.failWrite = false;
      const b = d.root
        .querySelectorAll("button")
        .find((b) => b.dataset.d1Action === "retry");
      assert.ok(b);
      await b.click();
      await settleTools(() => d.values.has("charitology.gifts"));
      assert.equal(value(d, "gifts").length, 1);
    },
  );
  await check(
    "Wrapped page-only samples never write gift log and remove preview returns to actual saved gifts",
    async () => {
      const fixtures = donorFixtures(),
        d = await mount("charitology-wrapped", { gifts: fixtures.gifts });
      const raw = d.values.get("charitology.gifts");
      await clicks(d, "#wr-try");
      assert.match(d.root.textContent, /Page-only fictional/);
      assert.equal(d.values.get("charitology.gifts"), raw);
      assert.equal(
        d.operations.filter(
          (o) => o[0] === "set" && o[1] === "charitology.gifts",
        ).length,
        0,
      );
      await clicks(d, "#wr-unsample");
      assert.equal(d.values.get("charitology.gifts"), raw);
      assert.match(
        d.$("#wr-status").textContent,
        /saved gift log is unchanged/,
      );
    },
  );
  await check(
    "grant draft-only New removes only draft, blanks the form and retains proposal library",
    async () => {
      const f = donorFixtures(),
        d = await mount(
          "grant-evaluator",
          Object.fromEntries(
            ["grant-proposals", "grant-weights", "grant-draft"].map((k) => [
              k,
              f[k],
            ]),
          ),
        );
      assert.equal(d.get("#ge-name"), f["grant-draft"].name);
      await clicks(d, "#ge-new");
      await settleTools(() => !d.values.has("charitology.grant-draft"));
      assert.equal(d.values.has("charitology.grant-draft"), false);
      assert.equal(d.get("#ge-name"), "");
      assert.deepEqual(value(d, "grant-proposals"), f["grant-proposals"]);
    },
  );
  await check(
    "grant explicit Save creates one identity and library/draft reference agrees",
    async () => {
      const d = await mount("grant-evaluator");
      await d.set("#ge-name", "Fictional saved proposal");
      await clicks(d, "#ge-save");
      const rows = value(d, "grant-proposals"),
        draft = value(d, "grant-draft");
      assert.equal(rows.length, 1);
      assert.equal(draft.id, rows[0].id);
      assert.equal(draft.name, "Fictional saved proposal");
    },
  );
  await check(
    "measurement debounce captures newest raw candidate and writes only after deliberate input",
    async () => {
      const d = await mount("impact-measurement-toolkit");
      assert.equal(d.values.has("charitology.impact-drafts"), false);
      await d.set("#imt-f-name", "Fictional first");
      await d.set("#imt-f-name", "Fictional newest");
      await settleTools(() => d.values.has("charitology.impact-drafts"));
      const s = value(d, "impact-drafts");
      assert.equal(
        s.drafts.find((x) => x.id === s.current).name,
        "Fictional newest",
      );
    },
  );
  await check(
    "CE calculation form remains editable without saving a model; explicit Save preserves exact raw numeric text",
    async () => {
      const d = await mount("cost-effectiveness-model-kit");
      await d.set("#ce-name", "Fictional raw model");
      await d.set("#ce-cost-low", " 1,234.50 ");
      assert.equal(d.values.has("charitology.ce-models"), false);
      await clicks(d, "#ce-save");
      assert.equal(value(d, "ce-models")[0].values.cost[0], " 1,234.50 ");
    },
  );
  await check(
    "read-only persistence environments still calculate and show current user values",
    async () => {
      for (const [name, selector, v] of [
        ["portfolio-builder", "#pb-budget", "500"],
        ["one-click-split", "#ocs-total", "123"],
        ["disaster-response-guide", "#dr-amount", "250"],
      ]) {
        const d = await mount(name, {}, { unsupported: true });
        assert.equal(d.$(selector).disabled, false);
        await d.set(selector, v);
        assert.equal(d.get(selector), v);
        assert.equal(d.operations.filter((x) => x[0] === "set").length, 0);
      }
    },
  );
  await check(
    "held initial lock prevents native submit and preserves newer input through delayed hydration",
    async () => {
      for (const [name, key, selector, form] of [
        ["giving-dashboard", "gifts", "#gd-org", "#gd-form"],
        ["gift-giving", "gift-card", "#gg-to", "#gg-form"],
        ["legacy-planner", "legacy", "#lp-name", null],
        ["grant-evaluator", "grant-draft", "#ge-name", "#ge-form"],
        [
          "impact-measurement-toolkit",
          "impact-drafts",
          "#imt-f-name",
          "#imt-form",
        ],
      ]) {
        const d = await start(name, {}, { holdKey: key });
        await d.set(selector, "Newer unsubmitted fictional text");
        if (form) {
          const event = await d.$(form).fire("submit");
          assert.equal(event.defaultPrevented, true, name);
        }
        d.release();
        await d.ready;
        assert.equal(d.get(selector), "Newer unsubmitted fictional text", name);
        assert.equal(
          d.operations.filter((o) => o[0] !== "get").length,
          0,
          name,
        );
      }
    },
  );
  await check(
    "a queued older card save cannot overwrite newer form or later saved candidate",
    async () => {
      const d = await mount("gift-giving");
      const release = await d.hold("gift-card");
      const old = d.set("#gg-to", "Older fictional name");
      await new Promise((r) => setTimeout(r, 5));
      const newer = d.set("#gg-to", "Newest fictional name");
      release();
      await Promise.all([old, newer]);
      assert.equal(d.get("#gg-to"), "Newest fictional name");
      assert.equal(value(d, "gift-card").to, "Newest fictional name");
    },
  );
  await check(
    "late gift import refuses newer raw form and invalid later file selection revokes older read",
    async () => {
      const d = await mount("giving-dashboard");
      let finish;
      const delayed = new Promise((r) => (finish = r)),
        file = { name: "fictional.json", size: 200, text: () => delayed };
      const input = d.$("#gd-file");
      input.files = [file];
      const pending = input.fire("change");
      await d.set("#gd-org", "Newer raw gift form");
      finish(JSON.stringify({ gifts: donorFixtures().gifts }));
      await pending;
      assert.equal(d.get("#gd-org"), "Newer raw gift form");
      assert.equal(d.values.has("charitology.gifts"), false);
      let finish2;
      input.files = [
        { ...file, text: () => new Promise((r) => (finish2 = r)) },
      ];
      const pending2 = input.fire("change");
      input.files = [
        { name: "oversized.json", size: 5_000_001, text: async () => "{bad" },
      ];
      await input.fire("change");
      finish2(JSON.stringify({ gifts: donorFixtures().gifts }));
      await pending2;
      assert.equal(d.values.has("charitology.gifts"), false);
    },
  );
  await check(
    "measurement pending import is invalidated even by oversized or empty replacement choice",
    async () => {
      const d = await mount("impact-measurement-toolkit"),
        input = d.$("#imt-import");
      for (const replacement of [
        null,
        { name: "oversized.json", size: 1_000_001, text: async () => "{bad" },
      ]) {
        let finish;
        input.files = [
          {
            name: "fictional.json",
            size: 200,
            text: () => new Promise((r) => (finish = r)),
          },
        ];
        const pending = input.fire("change");
        input.files = replacement ? [replacement] : [];
        await input.fire("change");
        finish(JSON.stringify(donorFixtures()["impact-drafts"].drafts[0]));
        await pending;
        assert.equal(d.values.has("charitology.impact-drafts"), false);
      }
    },
  );
  await check(
    "foreign saved bytes block ordinary editing without deleting or rewriting either copy",
    async () => {
      const d = await mount("gift-giving", {
        "gift-card": donorFixtures()["gift-card"],
      });
      const foreign = {
        ...donorFixtures()["gift-card"],
        to: "Foreign saved fictional name",
      };
      d.values.set("charitology.gift-card", JSON.stringify(foreign));
      await d.set("#gg-to", "Own newer raw name");
      assert.deepEqual(value(d, "gift-card"), foreign);
      assert.equal(d.get("#gg-to"), "Own newer raw name");
      assert.match(d.root.textContent, /another|changed|protected|save/i);
    },
  );
  await check(
    "corrupt initial saved bytes stay byte-identical and recoverable across all twelve clients",
    async () => {
      for (const name of names) {
        const key =
            name === "grant-evaluator" ? "grant-draft" : keyByTool[name],
          d = await mount(name, { [key]: "{fictional corrupt raw" });
        assert.equal(
          d.values.get("charitology." + key),
          "{fictional corrupt raw",
          name,
        );
        assert.equal(
          d.operations.filter((o) => o[0] !== "get").length,
          0,
          name,
        );
        assert.match(
          d.root.textContent,
          /recover|invalid|copy|unreadable/i,
          name,
        );
      }
    },
  );
  await check(
    "Split held initialization preserves early method and amount instead of reapplying source defaults",
    async () => {
      const f = donorFixtures(),
        d = await start(
          "one-click-split",
          { portfolio: f.portfolio },
          { holdKey: "split" },
        );
      await d.set("#ocs-method", "alternative", "change");
      await d.set("#ocs-total", "77");
      d.release();
      await d.ready;
      assert.equal(d.get("#ocs-method"), "alternative");
      assert.equal(d.get("#ocs-total"), "77");
      assert.equal(d.values.has("charitology.split"), false);
    },
  );
  await check(
    "library-only gift sample action does not declare unrelated raw gift form saved",
    async () => {
      const d = await mount("giving-dashboard");
      await d.set("#gd-org", "Unsubmitted fictional raw gift");
      await clicks(d, "#gd-sample");
      assert.equal(d.get("#gd-org"), "Unsubmitted fictional raw gift");
      assert.ok(value(d, "gifts").length > 0);
      const event = await d.window.fire("beforeunload");
      assert.equal(event.defaultPrevented, true);
      const preview = d.root
        .querySelectorAll("button")
        .find((x) => x.dataset.d1Action === "preview-remove");
      await preview.click();
      await settleTools(
        () => d.root.querySelector("[data-d1-result]")?.textContent,
      );
      assert.match(
        d.root.querySelector("[data-d1-result]").textContent,
        /unsaved|unsubmitted|discard/i,
      );
      assert.equal(d.values.has("charitology.gifts"), true);
    },
  );
  await check(
    "unsupported and corrupt Measurement New actions retain current work and show failure without rejected DOM handler",
    async () => {
      for (const options of [
        { initial: { "impact-drafts": "{corrupt" } },
        { initial: {}, unsupported: true },
      ]) {
        const d = await mount("impact-measurement-toolkit", options.initial, {
          unsupported: options.unsupported,
        });
        await clicks(d, "#imt-new");
        assert.equal(
          d.values.has("charitology.impact-drafts"),
          Object.hasOwn(options.initial, "impact-drafts"),
        );
        assert.match(
          d.root.textContent,
          /required|recover|unsupported|unreadable|invalid|protected/i,
        );
      }
    },
  );
  console.log(
    `✓ Donor mounted tools: ${count} groups passed (actual twelve scripts; synthetic DOM, no browser claim).`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
