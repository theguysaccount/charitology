// Render the actual Astro component against validated fictional model graphs,
// then exercise the actual read-only filter controller in a bounded DOM.
// This is not browser layout, human review or public research evidence.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { transform } from "@astrojs/compiler";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { build } from "esbuild";
import postcss from "postcss";
import { parse as parseHtml } from "parse5";
import {
  validateResearchLedger,
  projectResearchLedger,
} from "../src/lib/research-ledger-model.mjs";
import {
  fixture,
  options,
  scientificFixture,
  journalFixture,
  challengeFixture,
  repin,
  rawProblem,
  source,
  version,
  ref,
} from "../test-fixtures/research-ledger/factory.mjs";
import { captureResearchEntry } from "../src/lib/research-ledger-capture.mjs";

let groups = 0;
async function check(label, callback) {
  await callback();
  groups++;
  console.log(`✓ ${label}`);
}
const temporary = await mkdtemp(
  join(resolve("node_modules"), ".charitology-ledger-ui-"),
);
try {
  const componentText = await readFile(
    "src/components/ResearchLedger.astro",
    "utf8",
  );
  const compiled = await transform(componentText, {
    filename: "src/components/ResearchLedger.astro",
    internalURL: "astro/compiler-runtime",
    renderScript: true,
    resolvePath: async (specifier) => specifier,
  });
  assert.equal(compiled.diagnostics.filter((d) => d.severity === 1).length, 0);
  await build({
    stdin: {
      contents: `${compiled.code}\nexport { readStaticResearchLedger } from "../lib/research-ledger";`,
      loader: "ts",
      sourcefile: "ResearchLedger.astro.ts",
      resolveDir: resolve("src/components"),
    },
    outfile: join(temporary, "component.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    external: ["astro:content"],
    loader: { ".css": "empty" },
    define: { "import.meta.env.BASE_URL": '"/charitology/"' },
    nodePaths: [resolve("node_modules")],
  });
  await build({
    entryPoints: ["src/lib/client/research-ledger-ui.ts"],
    outfile: join(temporary, "controller.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
  });
  const { default: Component, readStaticResearchLedger } = await import(
    pathToFileURL(join(temporary, "component.mjs")).href
  );
  const { mountResearchLedger } = await import(
    pathToFileURL(join(temporary, "controller.mjs")).href
  );
  const container = await AstroContainer.create();
  const projection = (input) =>
    projectResearchLedger(validateResearchLedger(input, options(input)), {
      editionId: input.manifest.currentEditionId,
    });
  const render = (
    p,
    selectedRecordId = null,
    currentEditionId = p.edition.id,
  ) =>
    container.renderToString(Component, {
      props: { projection: p, selectedRecordId, currentEditionId },
    });

  await check(
    "no-JavaScript reading uses actual model counts and explicit unknown baseline",
    async () => {
      const p = projection(fixture()),
        html = await render(p);
      assert.match(html, /Current published edition/);
      assert.match(html, /Unknown before the recorded capture/);
      assert.match(html, /<strong>0<\/strong>Qualifying research results/);
      assert.match(html, /<strong>0<\/strong>Peer-reviewed manuscripts/);
      assert.match(html, /<strong>0<\/strong>Review declarations/);
      assert.match(html, /data-ledger-noun="records"/);
      assert.match(html, /<details class="rl-batch" open/);
      assert.match(html, /class="rl-controls" hidden/);
      assert.match(html, /All records are readable in the expandable batches/);
    },
  );
  await check(
    "namespaced record, version, edition and source routes retain an existing base path",
    async () => {
      const p = projection(fixture()),
        html = await render(p, "problem:fictional");
      assert.match(
        html,
        /href="\/charitology\/research-ledger\/editions\/edition%3Afictional-one\/ledger\.json"/,
      );
      assert.match(
        html,
        /href="\/charitology\/research-ledger\/editions\/edition%3Afictional-one\/ledger\.csv"/,
      );
      assert.match(
        html,
        /href="\/charitology\/research-ledger\/sources\/source%3Afictional-open\/source\.txt"/,
      );
      assert.match(
        html,
        /href="\/charitology\/research-ledger\/problem%3Afictional\/#version-1"/,
      );
      assert.match(html, /id="version-1"/);
      assert.ok(!html.includes("/charitology/charitology/"));
    },
  );
  await check(
    "historical editions retain their own subject/version anchors and current caveat",
    async () => {
      const p = projection(challengeFixture()),
        html = await render(p, null, "edition:later-current");
      assert.match(html, /Historical edition/);
      assert.match(html, /Later corrections and withdrawals/);
      assert.match(html, /href="\/charitology\/research-ledger\/"/);
      assert.match(html, /id="record-claim:fictional-version-1"/);
      assert.match(html, /#record-claim%3Afictional-version-1/);
      assert.match(html, /Fictional earlier scope claim\./);
      assert.match(html, /Fictional later scope claim\./);
      assert.match(html, /Retained dissent/);
    },
  );
  await check(
    "editorial before/after wording stays separate from qualifying research",
    async () => {
      const p = projection(challengeFixture()),
        html = await render(p, "artifact:fictional-correction");
      assert.match(html, /Editorial correction/);
      assert.match(html, /<strong>Before<\/strong>/);
      assert.match(html, /<strong>After<\/strong>/);
      assert.match(html, /Fictional earlier scope claim\./);
      assert.match(html, /Fictional later scope claim\./);
      assert.match(html, /<strong>1<\/strong>Editorial correction artifacts/);
      assert.match(html, /<strong>0<\/strong>Qualifying research results/);
    },
  );
  await check(
    "real public seed stays unreviewed and the editorial context addition is visible on both sides",
    async () => {
      const input = await readStaticResearchLedger(),
        p = projection(input);
      assert.equal(p.counters.records, 43);
      assert.equal(p.counters.reviews, 0);
      assert.equal(p.counters.qualifiedSourceReviews, 0);
      assert.equal(p.counters.peerReviewedManuscripts, 0);
      assert.equal(p.counters.qualifyingResearchResults, 0);
      const html = await render(p, "artifact:pr-3-editorial-framing");
      const tree = parseHtml(html),
        comparisons = [];
      const walk = (node) => {
        if (
          node.attrs?.some(
            (a) => a.name === "class" && a.value === "rl-comparison",
          )
        )
          comparisons.push(node);
        (node.childNodes ?? []).forEach(walk);
      };
      walk(tree);
      const text = (node) =>
        (node.value ?? "") + (node.childNodes ?? []).map(text).join("");
      const contextual = comparisons
        .map(text)
        .find((value) => value.includes("No editorial context is recorded"));
      const after = p.graph.versions.find(
        (v) => v.recordId === "claim:ten-dollars-framing" && v.version === 2,
      );
      assert.ok(after.subject.context);
      assert.ok(contextual?.includes(after.subject.context));
      assert.match(html, /No challenge is recorded for this artifact/);
      assert.equal(comparisons.length, 2);
      const overview = parseHtml(await render(p)),
        rows = [],
        batches = [],
        ids = [];
      const inspect = (node) => {
        const cls =
          node.attrs?.find((a) => a.name === "class")?.value?.split(" ") ?? [];
        if (cls.includes("rl-item")) rows.push(node);
        if (cls.includes("rl-batch")) batches.push(node);
        (node.childNodes ?? []).forEach(inspect);
      };
      inspect(overview);
      assert.equal(rows.length, 43);
      assert.equal(batches.length, 3);
      assert.equal(
        batches.filter((node) => node.attrs.some((a) => a.name === "open"))
          .length,
        1,
      );
      for (const view of p.views) {
        const detail = await render(p, view.id);
        assert.ok(detail.includes(`id="record-${view.id}"`));
      }
      const historical = parseHtml(await render(p, null, "edition:future"));
      const checkIds = (node) => {
        const id = node.attrs?.find((a) => a.name === "id")?.value;
        if (id) ids.push(id);
        (node.childNodes ?? []).forEach(checkIds);
      };
      checkIds(historical);
      assert.equal(
        new Set(ids).size,
        ids.length,
        "historical full archive anchors must be unambiguous",
      );
    },
  );
  await check(
    "scientific disposition/review links use model support and the review's own record",
    async () => {
      const p = projection(scientificFixture()),
        html = await render(p, "problem:fictional");
      assert.match(html, /Problem: solved/);
      assert.match(html, /Current support<\/dt><dd>current/);
      assert.match(
        html,
        /href="\/charitology\/research-ledger\/artifact%3Afictional-result\/#review-review%3Afictional-research"/,
      );
      assert.match(
        html,
        /href="\/charitology\/research-ledger\/decision%3Afictional-solved\/#review-review%3Afictional-decision"/,
      );
      const journal = projection(journalFixture()),
        manuscript = await render(journal, journal.views[0].id);
      assert.match(manuscript, /Peer review: peer-reviewed/);
      assert.match(manuscript, /Recorded declarations do not verify identity/);
    },
  );
  await check(
    "hostile source text is escaped and remains inert rather than becoming HTML",
    async () => {
      const input = fixture();
      const raw = rawProblem(
        "open",
        "draft",
        '<script>globalThis.ledgerAttack=true</script>\n<img src=x onerror="ledgerAttack()"> & text',
      );
      const s = source("source:fictional-open", raw),
        subject = captureResearchEntry({
          sourceKey: "problems/fictional",
          rawText: raw,
        }).subject;
      const v = version("problem:fictional", subject, [
        { sourceId: s.id, selector: { kind: "entry" } },
      ]);
      input.sources = [s];
      input.versions = [v];
      input.events[0].version = ref(v);
      input.manifest.currentSources[0].currentVersion = ref(v);
      const html = await render(projection(repin(input)), "problem:fictional");
      assert.match(
        html,
        /&lt;script&gt;globalThis\.ledgerAttack=true&lt;\/script&gt;/,
      );
      assert.ok(!html.includes('<img src=x onerror="ledgerAttack()">'));
      const elements = [];
      const walk = (node) => {
        elements.push(node);
        (node.childNodes ?? []).forEach(walk);
      };
      walk(parseHtml(html));
      assert.ok(
        !elements.some(
          (node) =>
            node.tagName === "img" &&
            node.attrs.some((a) => a.name === "onerror"),
        ),
      );
      assert.ok(
        !elements.some(
          (node) =>
            node.tagName === "script" &&
            node.childNodes.some((child) =>
              child.value?.includes("ledgerAttack"),
            ),
        ),
      );
    },
  );
  await check(
    "an unknown selected record fails visibly instead of becoming an empty ledger",
    async () => {
      await assert.rejects(
        () => render(projection(fixture()), "problem:missing"),
        /not pinned/,
      );
    },
  );

  // Minimal semantics used by this read-only controller; no browser layout is simulated.
  class Element {
    constructor(tag, className = "") {
      this.tagName = tag.toUpperCase();
      this.className = className;
      this.children = [];
      this.dataset = {};
      this.listeners = new Map();
      this.hidden = false;
      this.open = false;
      this.disabled = false;
      this.value = "";
      this.textContent = "";
      this.id = "";
      this.classList = {
        add: (s) => {
          this.className += ` ${s}`;
        },
      };
    }
    append(...nodes) {
      for (const node of nodes) {
        node.parentElement = this;
        node.ownerDocument = this.ownerDocument;
        this.children.push(node);
      }
    }
    matches(selector) {
      const visible = selector.endsWith(":not([hidden])");
      const plain = visible
        ? selector.slice(0, -":not([hidden])".length)
        : selector;
      return (
        this.className.split(" ").includes(plain.slice(1)) &&
        (!visible || !this.hidden)
      );
    }
    querySelectorAll(selector) {
      return this.children.flatMap((node) => [
        ...(node.matches(selector) ? [node] : []),
        ...node.querySelectorAll(selector),
      ]);
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    }
    closest(selector) {
      return this.matches(selector)
        ? this
        : (this.parentElement?.closest(selector) ?? null);
    }
    addEventListener(name, callback) {
      this.listeners.set(name, [...(this.listeners.get(name) ?? []), callback]);
    }
    fire(name) {
      for (const callback of this.listeners.get(name) ?? [])
        callback({ target: this });
    }
    focus() {
      this.ownerDocument.activeElement = this;
    }
  }
  function dom(count = 43, hash = "") {
    const document = {
      defaultView: {
        location: { hash },
        listeners: [],
        addEventListener(_name, callback) {
          this.listeners.push(callback);
        },
      },
      getElementById(id) {
        return all.find((el) => el.id === id) ?? null;
      },
    };
    const all = [],
      element = (tag, cls) => {
        const el = new Element(tag, cls);
        el.ownerDocument = document;
        all.push(el);
        return el;
      };
    const root = element("section", "research-ledger"),
      list = element("section", "rl-list"),
      controls = element("div", "rl-controls");
    controls.hidden = true;
    list.dataset.ledgerNoun = "records";
    const search = element("input", "rl-text-filter"),
      kind = element("select", "rl-kind-filter"),
      state = element("select", "rl-state-filter"),
      reset = element("button", "rl-reset"),
      previous = element("button", "rl-prev"),
      next = element("button", "rl-next"),
      status = element("p", "rl-page-status");
    controls.append(search, kind, state, reset, previous, next, status);
    list.append(controls);
    root.append(list);
    const rows = [];
    for (let i = 0; i < count; i++) {
      let batch;
      if (i % 20 === 0) {
        batch = element("details", "rl-batch");
        list.append(batch);
      } else batch = list.children.at(-1);
      const row = element("tr", "rl-item");
      row.id = `record-${i}`;
      row.dataset = {
        ledgerKind: i % 2 ? "claim" : "problem",
        ledgerState: i % 2 ? "draft" : "open",
        ledgerSearch: `Fictional ${i} ${i === 31 ? "救援" : ""}`,
      };
      batch.append(row);
      rows.push(row);
    }
    return {
      root,
      list,
      controls,
      search,
      kind,
      state,
      reset,
      previous,
      next,
      status,
      rows,
      document,
      visible: () => rows.filter((r) => !r.hidden && !r.parentElement.hidden),
      element,
    };
  }
  await check(
    "actual controller pages43 SSR rows without truncating the edition",
    () => {
      const ui = dom();
      mountResearchLedger(ui.root);
      assert.equal(ui.controls.hidden, false);
      assert.equal(ui.visible().length, 20);
      assert.equal(
        ui.list.children.filter(
          (el) => el.className === "rl-batch" && !el.hidden && el.open,
        ).length,
        1,
      );
      assert.equal(ui.visible()[0], ui.rows[0]);
      ui.next.fire("click");
      assert.equal(ui.visible()[0], ui.rows[20]);
      assert.equal(ui.visible().length, 20);
      assert.equal(ui.document.activeElement, ui.status);
      ui.next.fire("click");
      assert.equal(ui.visible().length, 3);
      assert.equal(ui.next.disabled, true);
      assert.equal(ui.rows.length, 43);
      assert.match(ui.status.textContent, /43 matching records/);
      ui.previous.fire("click");
      assert.equal(ui.visible()[0], ui.rows[20]);
      mountResearchLedger(ui.root);
      assert.equal(ui.next.listeners.get("click").length, 1);
    },
  );
  await check(
    "type/state/text filters reset page, preserve all source rows and report empty matches",
    () => {
      const ui = dom();
      mountResearchLedger(ui.root);
      ui.next.fire("click");
      ui.kind.value = "claim";
      ui.kind.fire("change");
      assert.equal(ui.visible()[0], ui.rows[1]);
      assert.match(ui.status.textContent, /21 matching records/);
      ui.search.value = "救援";
      ui.search.fire("input");
      assert.deepEqual(ui.visible(), [ui.rows[31]]);
      ui.state.value = "open";
      ui.state.fire("change");
      assert.equal(ui.visible().length, 0);
      assert.match(ui.status.textContent, /0 matching records/);
      ui.reset.fire("click");
      assert.equal(ui.visible().length, 20);
      assert.equal(ui.document.activeElement, ui.search);
      assert.equal(ui.rows.length, 43);
    },
  );
  await check(
    "direct hash and later anchor navigation reveal hidden pages and clear obstructing filters",
    () => {
      const ui = dom(43, "#record-41");
      mountResearchLedger(ui.root);
      assert.equal(ui.rows[41].hidden, false);
      assert.equal(ui.visible().length, 3);
      ui.search.value = "no match";
      ui.search.fire("input");
      assert.equal(ui.visible().length, 0);
      ui.document.defaultView.location.hash = "#record-22";
      for (const callback of ui.document.defaultView.listeners) callback();
      assert.equal(ui.search.value, "");
      assert.equal(ui.rows[22].hidden, false);
      assert.match(ui.status.textContent, /linked item is visible/);
    },
  );
  await check(
    "historical record/review anchors open their own archive without opening another component",
    () => {
      const ui = dom();
      const archive = ui.element("details", "rl-archive"),
        review = ui.element("article", "rl-review");
      review.id = "review:fictional";
      archive.append(review);
      ui.root.append(archive);
      ui.document.defaultView.location.hash = "#review%3Afictional";
      mountResearchLedger(ui.root);
      assert.equal(archive.open, true);
      const foreign = ui.element("details", "foreign"),
        other = ui.element("p", "other");
      other.id = "foreign:target";
      foreign.append(other);
      ui.document.defaultView.location.hash = "#foreign%3Atarget";
      for (const fn of ui.document.defaultView.listeners) fn();
      assert.equal(foreign.open, false);
      ui.document.defaultView.location.hash = "#%broken";
      for (const fn of ui.document.defaultView.listeners) fn();
      assert.equal(ui.rows.length, 43);
    },
  );
  await check(
    "missing shell controls leave unenhanced SSR rows untouched",
    () => {
      const ui = dom();
      ui.reset.className = "not-a-control";
      mountResearchLedger(ui.root);
      assert.equal(ui.controls.hidden, true);
      assert.equal(ui.visible().length, 43);
    },
  );
  await check(
    "component text, form controls and notices meet light/dark theme contrast",
    async () => {
      const global = postcss.parse(
          await readFile("src/styles/global.css", "utf8"),
        ),
        css = postcss.parse(
          await readFile("src/styles/research-ledger.css", "utf8"),
        );
      const declarations = (tree, selector) => {
        const result = {};
        tree.walkRules((rule) => {
          if (rule.selector === selector)
            rule.walkDecls((d) => (result[d.prop] = d.value));
        });
        return result;
      };
      const luminance = (hex) => {
        assert.match(hex, /^#[\da-f]{6}$/i);
        const v = [1, 3, 5]
          .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
          .map((n) =>
            n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4,
          );
        return v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722;
      };
      const base = declarations(global, ":root");
      for (const theme of [
        base,
        { ...base, ...declarations(global, ":root[data-theme='dark']") },
      ]) {
        const values = { ...theme, ...declarations(css, ".research-ledger") };
        const get = (value) =>
          value.replace(/var\((--[a-z0-9-]+)\)/g, (_m, key) =>
            get(values[key]),
          );
        for (const [fg, bg] of [
          ["--ink", "--surface"],
          ["--ink-2", "--surface"],
          ["--ink", "--highlight"],
          ["--ink-2", "--bg-2"],
        ]) {
          const pair = [
            luminance(get(values[fg])),
            luminance(get(values[bg])),
          ].sort((a, b) => b - a);
          assert.ok((pair[0] + 0.05) / (pair[1] + 0.05) >= 4.5, `${fg}/${bg}`);
        }
        assert.equal(
          get(declarations(css, ".research-ledger .rl-button").color),
          get(values["--ink"]),
        );
        assert.equal(
          get(declarations(css, ".research-ledger .rl-button").background),
          get(values["--surface"]),
        );
      }
      assert.match(css.toString(), /overflow-wrap: anywhere/);
      assert.match(css.toString(), /white-space: pre-wrap/);
      assert.match(css.toString(), /@media \(max-width: 560px\)/);
    },
  );
  console.log(
    `Research-ledger UI: ${groups} actual-render/controller/theme groups passed. Browser layout/download and real-human review remain separate evidence.`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
