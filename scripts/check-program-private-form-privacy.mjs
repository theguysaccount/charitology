// Actual private-section Astro SSR and actual compiled scripts; fictional data only.
// This is a bounded DOM check, not native browser, navigation or downloaded-file proof.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm, readdir } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { transform } from "@astrojs/compiler";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import ts from "typescript";
import yaml from "js-yaml";
import {
  installToolDom,
  ToolElement,
} from "../test-fixtures/donor-recovery/tool-dom.mjs";

const programs = [
  "moral-frameworks-program",
  "methods-lab",
  "cause-census",
  "evidence-reviews",
  "replication-program",
  "failure-lab",
  "history-of-charity",
];
const temporary = await mkdtemp(
  join(resolve("node_modules"), ".private-forms-"),
);
let checks = 0;
let serial = 0;
const check = async (label, run) => {
  await run();
  checks++;
  console.log("✓ " + label);
};

// Synchronous custom-event dispatch used by the actual shared research renderer.
ToolElement.prototype.dispatchEvent = function (event) {
  for (const listener of this.listeners.get(event.type) || [])
    listener.fn(event);
  return !event.defaultPrevented;
};

// Only the table DOM operations needed by the actual Depth Census renderer.
ToolElement.prototype.createTBody = function () {
  const body = new ToolElement("tbody");
  this.append(body);
  return body;
};
ToolElement.prototype.insertRow = function () {
  const row = new ToolElement("tr");
  this.append(row);
  return row;
};
ToolElement.prototype.insertCell = function () {
  const cell = new ToolElement("td");
  this.append(cell);
  return cell;
};

// HTML successful text/select controls, including disabled-fieldset inheritance.
// No URL is fetched and no query is sent.
function defaultQuery(form) {
  const params = new URLSearchParams();
  for (const field of form.querySelectorAll("input,textarea,select"))
    if (
      field.name &&
      !field.disabled &&
      !field.closest("fieldset[disabled]") &&
      (!["radio", "checkbox"].includes(field.type) || field.checked)
    )
      params.append(field.name, field.value);
  return params.toString();
}
function setFictional(form) {
  const chosen = new Set();
  for (const field of form.querySelectorAll("input,textarea,select")) {
    if (!field.name) continue;
    if (["radio", "checkbox"].includes(field.type)) {
      field.checked = !chosen.has(field.name);
      chosen.add(field.name);
      continue;
    }
    if (field.type === "range") {
      field.value = "50";
      continue;
    }
    field.value =
      field.tagName === "SELECT"
        ? field.options.find((option) => option.value)?.value ||
          field.options[0]?.textContent ||
          "unknown"
        : field.type === "number"
          ? "3.25"
          : field.type === "date"
            ? "2026-10-27"
            : field.type === "url"
              ? "https://example.invalid/fictional"
              : "Fictional private " + field.name;
  }
}
async function compileComponent(source, path) {
  const output = await transform(source, {
    filename: path,
    internalURL: "astro/compiler-runtime",
    renderScript: true,
    resolvePath: async (value) => value,
  });
  assert.deepEqual(
    output.diagnostics.filter((item) => item.severity === 1),
    [],
  );
  const file = join(temporary, "component-" + serial++ + ".mjs");
  await build({
    stdin: {
      contents: output.code.replace(
        /^import\s+"[^"]+\?astro&type=style[^"]*";$/gm,
        "",
      ),
      loader: "ts",
      resolveDir: dirname(resolve(path)),
    },
    outfile: file,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    loader: { ".css": "empty" },
    plugins: [
      {
        name: "actual-nested-astro",
        setup(bundler) {
          bundler.onLoad({ filter: /\.astro$/ }, async ({ path }) => {
            const nested = await transform(await readFile(path, "utf8"), {
              filename: path,
              internalURL: "astro/compiler-runtime",
              renderScript: true,
              resolvePath: async (value) => value,
            });
            assert.deepEqual(
              nested.diagnostics.filter((item) => item.severity === 1),
              [],
            );
            return {
              contents: nested.code.replace(
                /^import\s+"[^"]+\?astro&type=style[^"]*";$/gm,
                "",
              ),
              loader: "ts",
              resolveDir: dirname(path),
            };
          });
        },
      },
    ],
    define: {
      "import.meta.env.BASE_URL": '"/"',
      "import.meta.env.SITE": '"https://example.invalid"',
    },
    logLevel: "silent",
  });
  return (await import(pathToFileURL(file))).default;
}
async function compiledScript(source, path) {
  const contents = source.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(contents, "actual component script exists");
  const executable = contents.includes("void initializeDonorTool().catch")
    ? contents.replace(
        "void initializeDonorTool().catch",
        "export const privacyReady = initializeDonorTool(); void privacyReady.catch",
      )
    : contents;
  const result = await build({
    stdin: {
      contents: executable,
      loader: "ts",
      resolveDir: dirname(resolve(path)),
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    define: {
      "import.meta.env.BASE_URL": '"/"',
      "import.meta.env.SITE": '"https://example.invalid"',
    },
    logLevel: "silent",
  });
  return async () => {
    const file = join(temporary, "script-" + serial++ + ".mjs");
    await writeFile(file, result.outputFiles[0].text);
    const module = await import(pathToFileURL(file));
    if (module.privacyReady) await module.privacyReady;
  };
}

// Extract the actual fields initializer and its actual inert dependencies. Public
// case choices are read from their real frontmatter; no Astro content API mock or
// substitute private field declaration is involved.
async function programProps(id) {
  const path = `src/components/programs/${id}.astro`;
  const source = await readFile(path, "utf8");
  const frontmatter = source.split("---")[1];
  const ast = ts.createSourceFile(
    path + ".ts",
    frontmatter,
    ts.ScriptTarget.Latest,
    true,
  );
  const declarations = new Map();
  const imports = new Map();
  for (const statement of ast.statements) {
    if (ts.isVariableStatement(statement))
      for (const item of statement.declarationList.declarations)
        if (ts.isIdentifier(item.name))
          declarations.set(item.name.text, item.initializer);
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause?.name) imports.set(clause.name.text, statement.getText(ast));
      for (const binding of clause?.namedBindings?.elements || [])
        imports.set(binding.name.text, statement.getText(ast));
    }
  }
  const statements = [],
    included = new Set();
  const include = async (name) => {
    if (included.has(name)) return;
    included.add(name);
    if (name === "cases") {
      const cases = [];
      for (const file of (await readdir("src/content/cases"))
        .filter((file) => file.endsWith(".md"))
        .sort()) {
        const text = await readFile("src/content/cases/" + file, "utf8");
        const data = yaml.load(text.split("---")[1]);
        cases.push({ id: file.slice(0, -3), title: data.title });
      }
      statements.push("const cases = " + JSON.stringify(cases) + ";");
      return;
    }
    if (imports.has(name)) {
      statements.push(imports.get(name));
      return;
    }
    const initializer = declarations.get(name);
    assert.ok(initializer, "actual fields dependency exists: " + name);
    const dependencies = new Set();
    function visit(node) {
      if (
        ts.isIdentifier(node) &&
        node.text !== name &&
        (declarations.has(node.text) ||
          imports.has(node.text) ||
          node.text === "cases")
      )
        dependencies.add(node.text);
      ts.forEachChild(node, visit);
    }
    visit(initializer);
    for (const dependency of dependencies) await include(dependency);
    statements.push("const " + name + " = " + initializer.getText(ast) + ";");
  };
  await include("fields");
  const output = await build({
    stdin: {
      contents:
        [...new Set(statements)].join("\n") + "\nexport default fields;",
      loader: "ts",
      resolveDir: dirname(resolve(path)),
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    logLevel: "silent",
  });
  const file = join(temporary, "fields-" + serial++ + ".mjs");
  await writeFile(file, output.outputFiles[0].text);
  const fields = (await import(pathToFileURL(file))).default;
  const tag = source.match(/<ResearchWorkspace\s[\s\S]*?\/>/)[0];
  assert.equal(tag.match(/id="([^"]+)"/)[1], id);
  assert.match(tag, /fields=\{fields\}/);
  return {
    id,
    title: tag.match(/title="([^"]+)"/)[1],
    description: tag.match(/description="([^"]+)"/)[1],
    fields,
    freeze: tag.includes("freeze={true}"),
  };
}
function install(html) {
  const dom = installToolDom(html);
  globalThis.FormData = class {
    constructor(form) {
      this.values = new URLSearchParams(defaultQuery(form));
    }
    get(name) {
      return this.values.get(name);
    }
  };
  let requests = 0;
  globalThis.fetch = () => {
    requests++;
    throw Error("No network permitted in private-form check");
  };
  return { ...dom, requests: () => requests };
}

try {
  await check(
    "all seven actual ResearchWorkspace mounts are covered",
    async () => {
      const found = [];
      for (const file of await readdir("src/components/programs")) {
        if (!file.endsWith(".astro") || file === "ResearchWorkspace.astro")
          continue;
        const source = await readFile(
          "src/components/programs/" + file,
          "utf8",
        );
        if (source.includes("<ResearchWorkspace"))
          found.push(file.slice(0, -6));
      }
      assert.deepEqual(found.sort(), [...programs].sort());
    },
  );
  await check(
    "all changed actual inline scripts and shared research module pass strict TypeScript",
    async () => {
      const paths = [
        "src/components/record/journal.astro",
        "src/components/record/charitology-100.astro",
        "src/components/DepthCensus.astro",
        ...[
          "giving-dashboard",
          "values-compass",
          "grant-evaluator",
          "due-diligence-checklist",
          "gift-giving",
        ].map((name) => `src/components/tools/${name}.astro`),
      ];
      const virtual = new Map();
      for (const path of paths) {
        const source = await readFile(path, "utf8");
        virtual.set(
          resolve(path + ".privacy.ts"),
          source.match(/<script>([\s\S]*?)<\/script>/)[1],
        );
      }
      const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
      const parsed = ts.parseJsonConfigFileContent(
        config.config,
        ts.sys,
        process.cwd(),
      );
      const options = {
        ...parsed.options,
        lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
        noEmit: true,
      };
      const host = ts.createCompilerHost(options);
      const originalSource = host.getSourceFile.bind(host),
        originalExists = host.fileExists.bind(host);
      host.fileExists = (path) => virtual.has(path) || originalExists(path);
      host.getSourceFile = (path, language, onError, fresh) =>
        virtual.has(path)
          ? ts.createSourceFile(path, virtual.get(path), language, true)
          : originalSource(path, language, onError, fresh);
      const program = ts.createProgram(
        [
          ...virtual.keys(),
          resolve("src/lib/client/research-programs.ts"),
          resolve("node_modules/astro/client.d.ts"),
        ],
        options,
        host,
      );
      const diagnostics = ts.getPreEmitDiagnostics(program);
      assert.equal(
        diagnostics.length,
        0,
        diagnostics
          .map(
            (item) =>
              `${item.file?.fileName || ""}: TS${item.code} ${ts.flattenDiagnosticMessageText(item.messageText, " ")}`,
          )
          .join("\n"),
      );
    },
  );
  const workspacePath = "src/components/programs/ResearchWorkspace.astro";
  const workspaceSource = await readFile(workspacePath, "utf8");
  const workspace = await compileComponent(workspaceSource, workspacePath);
  const workspaceRun = await compiledScript(workspaceSource, workspacePath);
  const container = await AstroContainer.create();
  const mounts = [];
  for (const id of programs) {
    const props = await programProps(id);
    mounts.push({
      id,
      html: await container.renderToString(workspace, { props }),
      form: "form",
      key: "charitology.research-program." + id + ".v1",
      run: workspaceRun,
      fail(dom) {
        dom.$("[data-research-workspace]").dataset.config = "{";
      },
      async effect(dom, form) {
        await form.fire("input");
        const state = JSON.parse(dom.values.get(this.key));
        assert.equal(state.program, id);
        assert.equal(state.draft.title, "Fictional private title");
        const event = await form.fire("submit");
        assert.equal(event.defaultPrevented, true);
      },
    });
  }
  for (const entry of [
    {
      id: "journal-desk",
      path: "src/components/record/journal.astro",
      form: "#manuscript-form",
      key: "charitology-manuscript-v1",
      break: "#manuscript-import",
    },
    {
      id: "hundred-lab",
      path: "src/components/record/charitology-100.astro",
      form: "#nomination-form",
      key: "charitology-nominations-v1",
      break: "#nomination-json",
    },
    {
      id: "depth-census",
      path: "src/components/DepthCensus.astro",
      form: "#census-form",
      key: "charitology-depth-census-v1",
      break: "#census-currency",
    },
  ]) {
    const source = await readFile(entry.path, "utf8");
    const sectionStart = source.indexOf(`<section id="${entry.id}">`);
    assert.ok(sectionStart >= 0);
    const end =
      source.indexOf("</section>", sectionStart) + "</section>".length;
    const fragment = source.slice(sectionStart, end);
    // Public page catalogs/ledger are deliberately not loaded by this private-form test.
    const component = await compileComponent(
      '---\nimport { url } from "../../lib/site";\n---\n' + fragment,
      entry.path,
    );
    mounts.push({
      ...entry,
      html: await container.renderToString(component),
      run: await compiledScript(source, entry.path),
      fail(dom) {
        dom.$(entry.break).remove();
      },
      async effect(dom, form) {
        if (entry.id === "journal-desk") {
          await form.fire("input");
          assert.equal(
            JSON.parse(dom.values.get(entry.key)).title,
            "Fictional private title",
          );
          const event = await form.fire("submit");
          assert.equal(event.defaultPrevented, true);
          assert.equal(dom.downloads.length, 1);
          assert.match(
            await dom.downloads[0].text(),
            /Fictional private title/,
          );
        } else {
          const event = await form.fire("submit");
          assert.equal(event.defaultPrevented, true);
          const saved = JSON.parse(dom.values.get(entry.key));
          const row = entry.id === "depth-census" ? saved.rows[0] : saved[0];
          assert.ok(row, "actual business handler records fictional local row");
          assert.equal(
            entry.id === "depth-census" ? row.activity : row.title,
            "Fictional private " +
              (entry.id === "depth-census" ? "activity" : "title"),
          );
        }
      },
    });
  }
  const dashboardPath = "src/components/tools/giving-dashboard.astro";
  const dashboardSource = await readFile(dashboardPath, "utf8");
  const dashboard = await compileComponent(dashboardSource, dashboardPath);
  mounts.push({
    id: "giving-dashboard",
    html: await container.renderToString(dashboard),
    form: "#gd-form",
    key: "charitology.gifts",
    run: await compiledScript(dashboardSource, dashboardPath),
    fail(dom) {
      dom.$("#gd-date").remove();
    },
    async effect(dom, form) {
      dom.$("#gd-amount").value = "25";
      const event = await form.fire("submit");
      assert.equal(event.defaultPrevented, true);
      assert.ok(
        dom.values.has(this.key),
        "actual local gift handler saves the fictional record",
      );
      const saved = JSON.parse(dom.values.get(this.key));
      assert.equal(saved.length, 1);
      assert.equal(saved[0].organization, "Fictional private organization");
      assert.equal(saved[0].amount, 25);
    },
  });
  for (const [name, formId, key, missing] of [
    ["values-compass", "vc-form", "compass", "#vc-result"],
    ["grant-evaluator", "ge-form", "grant-draft", "#ge-name"],
    ["due-diligence-checklist", "dd-form", "due-diligence", "#dd-org"],
    ["gift-giving", "gg-form", "gift-card", "#gg-card"],
  ]) {
    const path = `src/components/tools/${name}.astro`;
    const source = await readFile(path, "utf8");
    const component = await compileComponent(source, path);
    mounts.push({
      id: name,
      form: "#" + formId,
      key: "charitology." + key,
      html: await container.renderToString(component),
      run: await compiledScript(source, path),
      fail(dom) {
        dom.$(missing).remove();
      },
      async effect(dom, form) {
        assert.equal((await form.fire("submit")).defaultPrevented, true);
      },
    });
  }
  assert.equal(mounts.length, 15);
  for (const mount of mounts) {
    await check(
      mount.id +
        ": actual no-JS SSR excludes every named private field from default GET",
      async () => {
        const dom = install(mount.html),
          form = dom.$(mount.form);
        setFictional(form);
        assert.equal(form.getAttribute("method"), null);
        assert.ok(form.querySelectorAll("[name]").length >= 4);
        assert.equal(dom.$("[data-private-form-controls]").disabled, true);
        assert.equal(defaultQuery(form), "");
        assert.match(mount.html, /<noscript>[\s\S]*JavaScript/);
        dom.$("[data-private-form-controls]").removeAttribute("disabled");
        const priorQuery = defaultQuery(form);
        assert.ok(
          priorQuery.length > 0,
          "without the default disabled wrapper these private entries would enter the query",
        );
        assert.equal(dom.requests(), 0);
      },
    );
    await check(
      mount.id +
        ": actual script installs guard before storage/startup and preserves local business action",
      async () => {
        const dom = install(mount.html),
          form = dom.$(mount.form);
        const originalGet = dom.storage.getItem;
        let reads = 0;
        let starting = true;
        dom.storage.getItem = (key) => {
          reads++;
          if (starting)
            assert.equal(dom.$("[data-private-form-controls]").disabled, true);
          if (starting)
            assert.ok(
              form.listeners
                .get("submit")
                ?.some((listener) => listener.capture),
              "submit guard precedes the first storage read",
            );
          return originalGet(key);
        };
        await mount.run();
        starting = false;
        assert.ok(reads > 0);
        dom.storage.getItem = originalGet;
        assert.equal(dom.$("[data-private-form-controls]").disabled, false);
        assert.equal(
          dom.values.has(mount.key),
          false,
          "initialization does not save this workspace",
        );
        setFictional(form);
        await mount.effect(dom, form);
        assert.equal(location.search, "");
        assert.equal(dom.requests(), 0);
        assert.equal(dom.values.get("unrelated.private.key"), "unchanged");
      },
    );
    await check(
      mount.id +
        ": startup exception leaves controls disabled and early submit interception intact",
      async () => {
        const dom = install(mount.html),
          form = dom.$(mount.form);
        mount.fail(dom);
        await assert.rejects(mount.run());
        assert.equal(dom.$("[data-private-form-controls]").disabled, true);
        assert.equal((await form.fire("submit")).defaultPrevented, true);
        assert.equal(defaultQuery(form), "");
        assert.equal(dom.values.has(mount.key), false);
        assert.equal(dom.requests(), 0);
      },
    );
  }
  console.log(
    `${checks} private program/record form privacy groups passed (actual SSR + compiled scripts; no network/native browser).`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
