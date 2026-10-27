// Actual Astro rendering and mounted presentation; all data/identities fictional.
// No browser layout, public seed, human review, storage or network is simulated as evidence.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { transform } from "@astrojs/compiler";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { parse } from "parse5";
import ts from "typescript";
import postcss from "postcss";
import { Element as BaseElement } from "../test-fixtures/artifact-results/ui-dom.mjs";
import { fictionalObservationFiles } from "../test-fixtures/observations/factory.mjs";
import {
  validateObservationFiles,
  observationProjection,
  legacyCountriesProjection,
} from "../src/lib/observation-model.mjs";

const temporary = await mkdtemp(
  join(resolve("node_modules"), ".observation-ui-"),
);
let groups = 0;
const check = async (name, run) => {
  await run();
  groups++;
  console.log(`✓ ${name}`);
};
const files = fictionalObservationFiles({ financial: true });
const input = validateObservationFiles(files);
const projection = observationProjection(input, input.registry.current.id);
globalThis.__observationUiFixture = {
  input,
  projection,
  countries: legacyCountriesProjection(projection),
};
class Element extends BaseElement {
  get options() {
    return this.children.filter((child) => child.tagName === "OPTION");
  }
  select() {
    this.selectionStart = 0;
    this.selectionEnd = this.value.length;
  }
  append(...children) {
    for (let child of children) {
      if (!(child instanceof BaseElement))
        child = new Element("#text", String(child));
      child.parentNode?.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) {
    this.textContent = "";
    this.append(...children);
  }
  setAttribute(key, value) {
    super.setAttribute(key, value);
    if (key.startsWith("data-"))
      this.dataset[
        key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      ] = String(value);
    if (key === "hidden") this.hidden = true;
  }
  matches(selector) {
    const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
    if (m)
      return (
        this.attributes.has(m[1]) &&
        (m[2] === undefined || this.getAttribute(m[1]) === m[2])
      );
    return super.matches(selector);
  }
  after(node) {
    const parent = this.parentNode,
      index = parent.children.indexOf(this);
    node.parentNode = parent;
    parent.children.splice(index + 1, 0, node);
  }
  dispatchEvent(event) {
    void this.fire(event.type, { detail: event.detail });
    return true;
  }
  createCaption() {
    const e = new Element("caption");
    this.append(e);
    return e;
  }
  createTHead() {
    const e = new Element("thead");
    this.append(e);
    return e;
  }
  createTBody() {
    const e = new Element("tbody");
    this.append(e);
    return e;
  }
  insertRow() {
    const e = new Element("tr");
    this.append(e);
    return e;
  }
  insertCell() {
    const e = new Element("td");
    this.append(e);
    return e;
  }
}
function dom(html) {
  const document = new Element("#document");
  document.createElement = (tag) => new Element(tag);
  document.createTextNode = (text) => new Element("#text", text);
  document.getElementById = (id) => document.querySelector("#" + id);
  function visit(node, parent) {
    if (node.nodeName === "#text") {
      parent.append(new Element("#text", node.value));
      return;
    }
    const el = node.tagName ? new Element(node.tagName) : parent;
    if (el !== parent) {
      for (const a of node.attrs ?? []) el.setAttribute(a.name, a.value);
      parent.append(el);
    }
    for (const child of node.childNodes ?? []) visit(child, el);
  }
  visit(parse(html), document);
  document.body = document.querySelector("body");
  globalThis.document = document;
  globalThis.Node = Element;
  globalThis.location = new URL(
    "https://example.invalid/charitology/tools/compare-tool/",
  );
  const events = new Map();
  globalThis.window = {
    addEventListener(name, callback) {
      const list = events.get(name) ?? [];
      list.push(callback);
      events.set(name, list);
    },
    async fire(name) {
      for (const callback of events.get(name) ?? []) await callback();
    },
  };
  globalThis.history = {
    replaceState(_a, _b, href) {
      location.href = new URL(href, location.href).href;
    },
  };
  return document;
}
try {
  const js = await build({
    stdin: {
      contents:
        "export * from './src/lib/observation-view.ts';export * from './src/lib/client/observation-ui.ts';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    logLevel: "silent",
  });
  await writeFile(join(temporary, "ui.mjs"), js.outputFiles[0].text);
  const ui = await import(pathToFileURL(join(temporary, "ui.mjs")));
  const astroPlugin = {
    name: "actual-observation-components",
    setup(b) {
      b.onResolve({ filter: /observation-model\.mjs$/ }, (args) => ({
        path: resolve(args.resolveDir, args.path),
        external: true,
      }));
      b.onResolve({ filter: /^astro:content$/ }, () => ({
        path: "content",
        namespace: "fixture",
      }));
      b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
        contents: `const interventions=[1,2].map(n=>({id:'fictional-intervention-'+n,data:{title:'Fictional intervention '+n,depth:n,evidence:'C',mechanism:'Fictional comparison only',timeToEffect:'unknown',durability:'unknown',feedback:'unknown',agency:'unknown',causes:[],conditions:[]}}));export const getCollection=async(name)=>name==='interventions'?interventions:name==='charities'?[{id:'fictional-uncovered',data:{name:'Fictional uncovered organization'}}]:[];`,
        loader: "js",
      }));
      b.onResolve({ filter: /research-program-catalog$/ }, () => ({
        path: "research",
        namespace: "catalog-fixture",
      }));
      b.onLoad({ filter: /.*/, namespace: "catalog-fixture" }, () => ({
        contents:
          "export const researchProgramCatalog=async()=>({interventions:[]});",
        loader: "js",
      }));
      b.onResolve({ filter: /\/observations$/ }, () => ({
        path: "loader",
        namespace: "observation-fixture",
      }));
      b.onResolve(
        { filter: /observations\.ts$/, namespace: "observation-fixture" },
        (args) => ({ path: args.path, namespace: "file" }),
      );
      b.onLoad({ filter: /.*/, namespace: "observation-fixture" }, () => ({
        contents: `export { observationEditionHref,observationSourceHref,observationGroupSelections } from ${JSON.stringify(resolve("src/lib/observations.ts"))};export const loadObservations=()=>globalThis.__observationUiFixture;`,
        loader: "js",
      }));
      b.onLoad({ filter: /\.astro$/ }, async (args) => {
        const compiled = await transform(await readFile(args.path, "utf8"), {
          filename: args.path,
          internalURL: "astro/compiler-runtime",
          renderScript: true,
          resolvePath: async (specifier) => specifier,
        });
        assert.equal(
          compiled.diagnostics.filter((d) => d.severity === 1).length,
          0,
          args.path,
        );
        return {
          contents: compiled.code,
          loader: "ts",
          resolveDir: dirname(args.path),
        };
      });
    },
  };
  const components = [
    "ObservationFact",
    "ObservationDesk",
    "OrganizationComparison",
    "record/country-profiles",
    "programs/cause-census",
    "tools/compare-tool",
  ];
  const loaded = {};
  for (const name of components) {
    const output = join(temporary, `${name.replaceAll("/", "-")}.mjs`);
    await build({
      entryPoints: [`src/components/${name}.astro`],
      outfile: output,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      plugins: [astroPlugin],
      loader: { ".css": "empty" },
      define: { "import.meta.env.BASE_URL": '"/charitology/"' },
      logLevel: "silent",
    });
    loaded[name] = (await import(pathToFileURL(output))).default;
  }
  const container = await AstroContainer.create();
  const render = (name, props = {}) =>
    container.renderToString(loaded[name], { props });
  async function mountInline(file, d) {
    const raw = await readFile(file, "utf8"),
      code = [
        ...raw
          .replace(/<script\b[^>]*\/>/g, "")
          .matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g),
      ]
        .filter((m) => !m[1].includes("application/json"))
        .map((m) => m[2])
        .join("\n"),
      parsed = ts.createSourceFile(
        file + ".ts",
        code,
        ts.ScriptTarget.Latest,
        true,
      ),
      imports = [],
      body = [];
    for (const statement of parsed.statements)
      (ts.isImportDeclaration(statement) ? imports : body).push(
        statement.getText(parsed),
      );
    const compiled = await build({
      stdin: {
        contents:
          imports.join("\n") +
          "\nexport function mount(){\n" +
          body.join("\n") +
          "\n}",
        resolveDir: dirname(resolve(file)),
        loader: "ts",
      },
      bundle: true,
      write: false,
      platform: "node",
      format: "esm",
      define: { "import.meta.env.BASE_URL": '"/charitology/"' },
      plugins: [
        {
          name: "capture-generated-downloads",
          setup(b) {
            b.onResolve({ filter: /client\/files$/ }, () => ({
              path: "files",
              namespace: "download-fixture",
            }));
            b.onResolve(
              { filter: /files\.ts$/, namespace: "download-fixture" },
              (args) => ({ path: args.path, namespace: "file" }),
            );
            b.onLoad({ filter: /.*/, namespace: "download-fixture" }, () => ({
              contents: `export {toCsv,copy,flash} from ${JSON.stringify(resolve("src/lib/client/files.ts"))};export function download(name,content,type){globalThis.__obDownloads.push({name,content,type});}`,
              loader: "js",
            }));
          },
        },
      ],
      logLevel: "silent",
    });
    const name = join(
      temporary,
      `inline-${file.split("/").at(-1).replace(".astro", "")}.mjs`,
    );
    await writeFile(name, compiled.outputFiles[0].text);
    (await import(pathToFileURL(name))).mount();
  }
  await check(
    "exact decimal display keeps zero, long source decimals, signed values and source scale without rounding",
    () => {
      assert.equal(
        ui.observationExactText({ coefficient: "0", exponent: 0 }),
        "0",
      );
      assert.equal(
        ui.observationExactText({
          coefficient: "1234567890123456789012345678901234567",
          exponent: -18,
        }),
        "1234567890123456789.012345678901234567",
      );
      assert.equal(
        ui.observationExactText({ coefficient: "-123", exponent: -5 }),
        "-0.00123",
      );
      assert.equal(
        ui.observationExactText({ coefficient: "289426", exponent: 3 }),
        "289426000",
      );
    },
  );
  await check(
    "period labels retain literal year-ended unknown start and day-precision stock dates",
    () => {
      assert.equal(
        ui.observationPeriodText({ kind: "stock-day", day: "2024-06-30" }),
        "At 2024-06-30",
      );
      assert.equal(
        ui.observationPeriodText({
          kind: "year-ended",
          end: "2024-12-31",
          literalStart: null,
          sourceLabel: "Year ended 2024-12-31",
        }),
        "Year ended 2024-12-31 · literal start unknown",
      );
    },
  );
  await check(
    "curated financial links require the exact admitted entity pin, not an ID-only match",
    () => {
      const parent = projection.entities.find(
        (e) => e.entityKind === "legal-organization",
      );
      assert.equal(
        ui.financialScopesForProfile(projection, parent.profileRefs[0]).length,
        1,
      );
      const changed = {
        ...projection,
        entities: projection.entities.map((e) =>
          e.id === parent.id ? { ...e, version: e.version + 1 } : e,
        ),
      };
      assert.equal(
        ui.financialScopesForProfile(changed, parent.profileRefs[0]).length,
        0,
      );
      assert.equal(
        ui.financialScopesForProfile(projection, "fictional-unmapped-name")
          .length,
        0,
      );
    },
  );
  await check(
    "actual fact component escapes retained strings and shows exact source quantum, locator and audit limits",
    async () => {
      const observation = projection.observations.find(
        (o) =>
          projection.measures.find((m) => m.id === o.measure.id)?.family ===
          "assets",
      );
      const html = await render("ObservationFact", { projection, observation });
      assert.match(html, /Exact source multiplier/);
      assert.match(html, /Reported quantum/);
      assert.match(html, /not an uncertainty interval/);
      assert.match(html, /PDF page/);
      assert.match(html, /\/charitology\/observations\/sources\//);
      assert.doesNotMatch(html, /undefined|NaN/);
      const inert = await render("ObservationFact", {
        projection,
        observation: {
          ...observation,
          annotations: [
            {
              verbatim: "<script>fictional()</script>",
              sourceRef: observation.reported.valueRef,
            },
          ],
        },
      });
      assert.match(inert, /&lt;script&gt;fictional\(\)&lt;\/script&gt;/);
      assert.doesNotMatch(inert, /<script>fictional\(\)/);
    },
  );
  const desk = await render("ObservationDesk", { projection });
  await check(
    "script-free desk renders every selected coverage cell, including missing and exact zero",
    () => {
      assert.equal(
        (desk.match(/data-ob-row/g) ?? []).length,
        projection.coverage.reduce((n, c) => n + c.cells.length, 0),
      );
      assert.match(desk, /Producer returned null throughout/);
      assert.match(desk, /<strong>0<\/strong>/);
      assert.match(desk, /Filters change this view only/);
    },
  );
  await check(
    "every rendered coverage row retains its exact edition, record pin and zero-based deep anchor",
    () => {
      const d = dom(desk);
      for (const coverage of projection.coverage)
        for (const [index, cell] of coverage.cells.entries()) {
          const row = d.getElementById(
            ui.observationCoverageAnchor(coverage.id, coverage.version, index),
          );
          assert.ok(row);
          assert.equal(row.dataset.coverageId, coverage.id);
          assert.equal(row.dataset.coverageVersion, String(coverage.version));
          assert.equal(row.dataset.coverageHash, coverage.hash);
          assert.equal(row.dataset.cellIndex, String(index));
          assert.equal(row.dataset.editionId, projection.edition.id);
          assert.equal(row.dataset.editionHash, projection.edition.hash);
          if (cell.state === "present") {
            assert.equal(row.dataset.observationId, cell.observation.id);
            assert.equal(
              row.dataset.observationVersion,
              String(cell.observation.version),
            );
            assert.equal(row.dataset.observationHash, cell.observation.hash);
          } else assert.equal(row.dataset.observationId, undefined);
        }
      const missing = Object.values(
        ui.countryMissingFacts(projection, "BBB"),
      )[0];
      assert.equal(missing.coverage.cells[missing.index], missing.cell);
    },
  );
  await check(
    "mounted desk intersects search, measure and missing filters and resets without altering source text",
    async () => {
      const d = dom(desk);
      ui.mountObservationDesks(d);
      const root = d.querySelector("[data-observation-desk]"),
        before = root
          .querySelectorAll("[data-ob-row]")
          .map((r) => r.textContent);
      const state = root.querySelector("[data-ob-state]");
      state.value = "missing";
      await state.fire("change");
      assert.equal(
        root.querySelectorAll("[data-ob-row]").filter((r) => !r.hidden).length,
        1,
      );
      const search = root.querySelector("[data-ob-search]");
      search.value = "No such fictional country";
      await search.fire("input");
      assert.equal(root.querySelector("[data-ob-empty]").hidden, false);
      await root.querySelector("[data-ob-reset]").click();
      assert.equal(root.querySelector("[data-ob-empty]").hidden, true);
      assert.deepEqual(
        root.querySelectorAll("[data-ob-row]").map((r) => r.textContent),
        before,
      );
    },
  );
  await check(
    "mounted pagination counts synthetic repeated DOM cells once and resets its page after filtering",
    async () => {
      const d = dom(desk),
        root = d.querySelector("[data-observation-desk]"),
        tbody = root.querySelector("tbody");
      for (let i = 0; i < 110; i++) {
        const row = new Element("tr");
        row.setAttribute("data-ob-row", "");
        row.setAttribute("data-search", "fictional pagination cell");
        row.setAttribute("data-measure", "pagination-only");
        row.setAttribute("data-state", "present");
        tbody.append(row);
      }
      ui.mountObservationDesks(d);
      const shown = () =>
        root.querySelectorAll("[data-ob-row]").filter((r) => !r.hidden).length;
      assert.equal(shown(), 50);
      await root.querySelector("[data-ob-more]").click();
      assert.equal(shown(), 100);
      const search = root.querySelector("[data-ob-search]");
      search.value = "fictional pagination cell";
      await search.fire("input");
      assert.equal(shown(), 50);
      assert.match(
        root.querySelector("[data-ob-count]").textContent,
        /50 of 110/,
      );
      await root.querySelector("[data-ob-more]").click();
      await root.querySelector("[data-ob-more]").click();
      assert.equal(shown(), 110);
      assert.equal(root.querySelector("[data-ob-more]").hidden, true);
    },
  );
  await check(
    "an exact deep link reveals its coverage row beyond the first page without changing any record",
    () => {
      const d = dom(desk),
        root = d.querySelector("[data-observation-desk]"),
        tbody = root.querySelector("tbody");
      for (let i = 0; i < 100; i++) {
        const row = new Element("tr");
        row.setAttribute("data-ob-row", "");
        row.setAttribute("id", `coverage-synthetic-navigation-v1-cell-${i}`);
        row.setAttribute("data-search", "synthetic navigation");
        row.setAttribute("data-state", "present");
        tbody.append(row);
      }
      location.hash = "#coverage-synthetic-navigation-v1-cell-99";
      ui.mountObservationDesks(d);
      const target = d.getElementById(
        "coverage-synthetic-navigation-v1-cell-99",
      );
      assert.equal(target.hidden, false);
      assert.equal(d.activeElement, target);
      assert.equal(target.getAttribute("tabindex"), "-1");
    },
  );
  const comparison = await render("OrganizationComparison");
  await check(
    "actual organization comparison uses the model's mismatch reasons and static selected exports without a rating",
    () => {
      assert.match(comparison, /Different balance-sheet dates/);
      assert.match(comparison, /Expense definitions differ/);
      assert.match(comparison, /literal period start is unknown/i);
      assert.match(comparison, /groups\/all-groups\/observations\.json/);
      assert.match(comparison, /full edition\/source context/);
      assert.doesNotMatch(comparison, /winnerScore|impactScore|expenseRatio/);
    },
  );
  await check(
    "mounted covered/uncovered selection cannot reuse another organization's panel or export",
    async () => {
      const d = dom(comparison);
      ui.mountOrganizationComparisons(d);
      const root = d.querySelector("[data-organization-comparison]"),
        a = root.querySelector("[data-org-a]"),
        b = root.querySelector("[data-org-b]");
      const text = root.querySelector("[data-org-data]").textContent,
        data = JSON.parse(text),
        uncovered = data.choices.find((c) => c.scopeId === null);
      a.value = uncovered.id;
      await a.fire("change");
      assert.equal(root.querySelector("[data-org-both]").hidden, true);
      assert.match(
        root.querySelector("[data-org-left]").textContent,
        /No financial facts/,
      );
      assert.equal(
        root.querySelector("[data-org-left]").querySelectorAll("a").length,
        0,
      );
      b.value = uncovered.id;
      await b.fire("change");
      assert.match(
        root.querySelector("[data-org-status]").textContent,
        /Choose two different/,
      );
      assert.equal(
        root.querySelectorAll("[data-org-panel]").filter((p) => !p.hidden)
          .length,
        0,
      );
      a.value = data.first;
      b.value = data.second;
      await b.fire("change");
      assert.equal(root.querySelector("[data-org-both]").hidden, false);
      assert.equal(
        root.querySelectorAll("[data-org-panel]").filter((p) => !p.hidden)
          .length,
        2,
      );
    },
  );
  await check(
    "organization query selections and copied URLs retain the real section anchor, with old-fragment compatibility",
    async () => {
      const d = dom(comparison),
        root = d.querySelector("[data-organization-comparison]"),
        data = JSON.parse(root.querySelector("[data-org-data]").textContent);
      location.href = `https://example.invalid/charitology/tools/compare-tool/?${new URLSearchParams({ orgA: data.second, orgB: data.first })}#organizations`;
      location.hash = "#organizations";
      ui.mountOrganizationComparisons(d);
      assert.equal(root.querySelector("[data-org-a]").value, data.second);
      assert.equal(root.querySelector("[data-org-b]").value, data.first);
      await root.querySelector("[data-org-share]").click();
      const shared = new URL(
        root
          .querySelectorAll("input")
          .find((e) => e.dataset.orgCopy !== undefined).value,
      );
      assert.equal(shared.pathname, "/charitology/tools/compare-tool/");
      assert.equal(shared.hash, "#organizations");
      assert.equal(shared.searchParams.get("orgA"), data.second);
      assert.equal(shared.searchParams.get("orgB"), data.first);
      assert.ok(d.getElementById(shared.hash.slice(1)));
      const old = dom(comparison),
        oldRoot = old.querySelector("[data-organization-comparison]");
      location.hash = `#${new URLSearchParams({ orgA: data.second, orgB: data.first })}`;
      ui.mountOrganizationComparisons(old);
      assert.equal(oldRoot.querySelector("[data-org-a]").value, data.second);
      assert.equal(oldRoot.querySelector("[data-org-b]").value, data.first);
    },
  );
  await check(
    "both actual comparison controllers preserve a real organization anchor until a deliberate intervention change",
    async () => {
      const html = await render("tools/compare-tool");
      for (const organizationFirst of [true, false]) {
        const d = dom(html),
          data = JSON.parse(d.querySelector("[data-org-data]").textContent),
          address = `https://example.invalid/charitology/tools/compare-tool/?${new URLSearchParams({ orgA: data.second, orgB: data.first })}#organizations`;
        location.href = address;
        if (organizationFirst) ui.mountOrganizationComparisons(d);
        await mountInline("src/components/tools/compare-tool.astro", d);
        if (!organizationFirst) ui.mountOrganizationComparisons(d);
        assert.equal(
          location.href,
          address,
          "initial rendering keeps the exact section URL",
        );
        assert.equal(d.querySelector("[data-org-a]").value, data.second);
        assert.equal(d.querySelector("[data-org-b]").value, data.first);
        assert.match(
          d.getElementById("ct-summary").textContent,
          /Comparing Fictional intervention 1 and Fictional intervention 2/,
        );
        await window.fire("hashchange");
        assert.equal(
          location.href,
          address,
          "hash-driven rendering keeps the section URL",
        );
        const third = d.getElementById("ct-pick-3");
        third.value = "";
        await third.fire("change");
        assert.equal(location.searchParams.get("orgA"), data.second);
        const hash = new URLSearchParams(location.hash.slice(1));
        assert.equal(hash.has("organizations"), false);
        assert.equal(
          hash.get("v"),
          "fictional-intervention-1,fictional-intervention-2",
        );
        assert.equal(d.querySelector("[data-org-a]").value, data.second);
      }
    },
  );
  await check(
    "actual intervention copy feedback survives native currentTarget clearing after asynchronous dispatch",
    async () => {
      const d = dom(await render("tools/compare-tool")),
        descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
      let copied, resolveCopy;
      const copying = new Promise((resolve) => (resolveCopy = resolve));
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: {
          clipboard: {
            async writeText(value) {
              copied = value;
              await copying;
            },
          },
        },
      });
      try {
        await mountInline("src/components/tools/compare-tool.astro", d);
        const button = d.getElementById("ct-share"),
          event = { currentTarget: button },
          pending = button.listeners.get("click")[0](event);
        event.currentTarget = null;
        resolveCopy();
        await pending;
        assert.equal(copied, location.href);
        assert.equal(button.textContent, "Link copied");
      } finally {
        if (descriptor)
          Object.defineProperty(globalThis, "navigator", descriptor);
        else delete globalThis.navigator;
      }
    },
  );
  await check(
    "all actual observation/country/context Astro templates compile and CSS retains narrow/print/focus behavior",
    async () => {
      for (const file of [
        "src/pages/observations/index.astro",
        "src/pages/observations/editions/[id].astro",
        "src/pages/observations/sources/[id]/[version].astro",
        "src/pages/record/countries/[code].astro",
        "src/components/record/country-profiles.astro",
        "src/components/programs/cause-census.astro",
        "src/components/tools/compare-tool.astro",
        "src/components/record/charity-index.astro",
        "src/components/record/cause-atlas.astro",
        "src/components/record/gap-map.astro",
      ]) {
        const r = await transform(await readFile(file, "utf8"), {
          filename: file,
        });
        assert.equal(
          r.diagnostics.filter((d) => d.severity === 1).length,
          0,
          file,
        );
      }
      const css = await readFile("src/styles/observations.css", "utf8");
      assert.doesNotThrow(() => postcss.parse(css));
      for (const p of [
        /max-width:\s*430px/,
        /:focus-visible/,
        /overflow-wrap:\s*anywhere/,
        /@media print/,
      ])
        assert.match(css, p);
    },
  );
  await check(
    "the narrow observation table retains readable column width inside a named keyboard-scrollable region",
    async () => {
      const d = dom(desk),
        region = d.querySelector(".ob-table-scroll");
      assert.equal(region.getAttribute("role"), "region");
      assert.equal(region.getAttribute("tabindex"), "0");
      assert.equal(
        region.getAttribute("aria-label"),
        "Source-linked facts table",
      );
      assert.match(d.textContent, /scroll the table horizontally/);
      const rules = postcss.parse(
          await readFile("src/styles/observations.css", "utf8"),
        ),
        declarations = (selector) => {
          const rule = rules.nodes.find(
            (n) => n.type === "rule" && n.selector === selector,
          );
          assert.ok(rule, selector);
          return Object.fromEntries(
            rule.nodes
              .filter((n) => n.type === "decl")
              .map((n) => [n.prop, n.value]),
          );
        };
      assert.equal(declarations(".ob-desk table.data")["min-width"], "48rem");
      assert.equal(declarations(".ob-desk table.data").display, "table");
      assert.equal(declarations(".ob-desk table.data")["table-layout"], "fixed");
      assert.deepEqual(declarations(".ob-desk .ob-table-scroll"), {
        "max-width": "100%",
        "overflow-x": "auto",
      });
    },
  );
  await check(
    "country current views no longer read the historical normalized file and cause capture has a real heading",
    async () => {
      for (const file of [
        "src/pages/record/countries/[code].astro",
        "src/components/record/country-profiles.astro",
      ]) {
        const text = await readFile(file, "utf8");
        assert.doesNotMatch(text, /import countries from .*countries\.json/);
        assert.match(text, /loadObservations/);
        assert.match(text, /countryObservationFacts/);
      }
      const census = await readFile(
        "src/components/programs/cause-census.astro",
        "utf8",
      );
      assert.match(census, /<h3>\{cause\.name\}<\/h3>/);
      const comparison = await readFile(
        "src/components/tools/compare-tool.astro",
        "utf8",
      );
      assert.doesNotMatch(comparison, /nobody has measured it/);
      assert.match(comparison, /No estimate is recorded in this database/);
    },
  );
  await check(
    "actual mounted country desk/brief/CSV retain zero, missing source pins and exact decimals without startup writes",
    async () => {
      const html = await render("record/country-profiles"),
        d = dom(html),
        values = new Map();
      const desk = d.getElementById("country-desk"),
        adversarial = JSON.parse(desk.dataset.countries);
      adversarial.indicators[0].definition = "\t=SUM(1,2)";
      desk.dataset.countries = JSON.stringify(adversarial);
      let writes = 0;
      globalThis.localStorage = {
        getItem: (k) => values.get(k) ?? null,
        setItem(k, v) {
          writes++;
          values.set(k, v);
        },
      };
      globalThis.__obDownloads = [];
      await mountInline("src/components/record/country-profiles.astro", d);
      assert.equal(writes, 0);
      const countries = globalThis.__observationUiFixture.countries.countries;
      const second = d.getElementById("country-b");
      second.value = countries[1].id;
      await second.fire("change");
      assert.match(
        d.getElementById("country-comparison").textContent,
        /Unknown: producer null/,
      );
      assert.match(
        d.getElementById("country-comparison").textContent,
        /0 people/,
      );
      await d.getElementById("country-csv").click();
      const csv = globalThis.__obDownloads.at(-1).content;
      assert.match(csv, /reported_token,source_multiplier,coverage/);
      assert.match(csv, /producer-null-throughout-window/);
      assert.match(csv, /observation_hash/);
      assert.match(
        csv,
        /coverage_id,coverage_version,coverage_cell_index,coverage_cell_detail/,
      );
      assert.match(csv, /observation_id,observation_version/);
      const visible = d
        .getElementById("country-comparison")
        .querySelectorAll("td");
      const absentCell = visible.find((cell) => cell.dataset.coverageId);
      assert.ok(absentCell);
      assert.equal(absentCell.dataset.editionId, projection.edition.id);
      const metadata = JSON.parse(desk.dataset.missing)[countries[1].id],
        missing = Object.values(metadata)[0];
      assert.equal(absentCell.dataset.coverageId, missing.coverageId);
      assert.equal(
        absentCell.dataset.coverageVersion,
        String(missing.coverageVersion),
      );
      assert.equal(absentCell.dataset.cellIndex, String(missing.cellIndex));
      assert.ok(
        absentCell
          .querySelectorAll("a")
          .some((link) => link.href === missing.cellHref),
      );
      assert.ok(
        csv.includes("'\t=SUM(1,2)"),
        "untrusted spreadsheet formula prefix is neutralized before quoting",
      );
      assert.ok(
        csv.includes("83.0512195121951"),
        "exact source decimal remains in CSV",
      );
      await d.getElementById("country-note").click();
      const brief = globalThis.__obDownloads.at(-1).content;
      assert.match(brief, /Fixed edition/);
      assert.match(brief, /Exact token:/);
      assert.match(brief, /not locally coauthored/);
      assert.match(brief, /observation [a-z0-9-]+ v1, hash/);
      const first = d.getElementById("country-a");
      first.value = countries[1].id;
      await first.fire("change");
      await d.getElementById("country-note").click();
      const missingBrief = globalThis.__obDownloads.at(-1).content;
      assert.ok(
        missingBrief.includes(
          `Missing coverage ${missing.coverageId} v${missing.coverageVersion}, cell ${missing.cellIndex}`,
        ),
      );
      assert.ok(missingBrief.includes(missing.cellHref));
      assert.ok(
        [...values.keys()].every((k) => k === "charitology-country-notes-v1"),
      );
      delete globalThis.__obDownloads;
      delete globalThis.localStorage;
    },
  );
  await check(
    "actual mounted Cause Census CSV and estimate-prefill use the restored heading",
    async () => {
      const d = dom(await render("programs/cause-census"));
      globalThis.__obDownloads = [];
      await mountInline("src/components/programs/cause-census.astro", d);
      await d.getElementById("cc-export").click();
      assert.match(
        globalThis.__obDownloads.at(-1).content,
        /cause,upstream,recordedInterventions,scope/,
      );
      assert.doesNotMatch(globalThis.__obDownloads.at(-1).content, /undefined/);
      const button = d.querySelector("[data-capture]"),
        workspace = d.getElementById("workspace-cause-census");
      let captured;
      workspace.addEventListener("research:prefill", (e) => {
        captured = e.detail;
      });
      // Native closest() semantics, restricted to the actual ancestor needed here.
      Element.prototype.closest = function (selector) {
        let n = this;
        while (n) {
          if (n.matches(selector)) return n;
          n = n.parentNode;
        }
        return null;
      };
      await button.click();
      assert.equal(captured.cause, button.dataset.capture);
      assert.match(captured.title, /^Estimate: .+/);
      assert.doesNotMatch(captured.title, /undefined/);
      delete globalThis.__obDownloads;
    },
  );
  await check(
    "actual presentation helpers and executable inline scripts compile strictly",
    async () => {
      const virtual = new Map();
      for (const file of [
        "src/components/ObservationDesk.astro",
        "src/components/OrganizationComparison.astro",
        "src/components/record/country-profiles.astro",
        "src/components/programs/cause-census.astro",
        "src/components/tools/compare-tool.astro",
      ]) {
        let n = 0;
        const text = await readFile(file, "utf8");
        for (const m of text.matchAll(
          /<script\b([^>]*)>([\s\S]*?)<\/script>/g,
        )) {
          if (/\btype=["']application\/json/.test(m[1])) continue;
          virtual.set(
            resolve(file) + `.inline-${n++}.ts`,
            m[2] + "\nexport {};\n",
          );
        }
      }
      const options = {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
        noEmit: true,
        allowJs: true,
        checkJs: false,
        skipLibCheck: true,
        resolveJsonModule: true,
        esModuleInterop: true,
        lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
        types: ["node"],
      };
      const host = ts.createCompilerHost(options),
        get = host.getSourceFile.bind(host),
        exists = host.fileExists.bind(host),
        read = host.readFile.bind(host);
      host.getSourceFile = (name, l, ...rest) =>
        virtual.has(name)
          ? ts.createSourceFile(name, virtual.get(name), l, true)
          : get(name, l, ...rest);
      host.fileExists = (name) => virtual.has(name) || exists(name);
      host.readFile = (name) => virtual.get(name) ?? read(name);
      const roots = [
        ...virtual.keys(),
        resolve("src/lib/observation-view.ts"),
        resolve("src/lib/client/observation-ui.ts"),
        resolve("src/lib/observations.ts"),
        resolve("node_modules/astro/client.d.ts"),
      ];
      const program = ts.createProgram(roots, options, host),
        diagnostics = ts.getPreEmitDiagnostics(program);
      for (const d of diagnostics)
        console.log(
          d.file?.fileName,
          ts.flattenDiagnosticMessageText(d.messageText, " "),
        );
      assert.equal(diagnostics.length, 0);
    },
  );
  console.log(
    `${groups} actual observation presentation/controller groups passed; strict TypeScript 0.`,
  );
} finally {
  delete globalThis.__observationUiFixture;
  await rm(temporary, { recursive: true, force: true });
}
