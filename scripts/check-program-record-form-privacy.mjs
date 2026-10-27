// Actual Astro SSR and inline script; fictional input, bounded DOM, no browser/network claim.
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

const path = "src/components/tools/charity-os.astro";
const source = await readFile(path, "utf8");
const temporary = await mkdtemp(
  join(resolve("node_modules"), ".program-form-"),
);
let count = 0;
const check = async (name, run) => {
  await run();
  console.log("✓ " + name);
  count++;
};
// Successful controls for these text fields, including disabled-fieldset inheritance.
// No GET is actually sent. This models the HTML form default that the fix prevents.
function defaultQuery(form) {
  const values = new URLSearchParams();
  for (const control of form.querySelectorAll("input,textarea,select")) {
    if (
      control.name &&
      !control.disabled &&
      !control.closest("fieldset[disabled]")
    )
      values.append(control.name, control.value);
  }
  return values.toString();
}
try {
  const compiled = await transform(source, {
    filename: path,
    internalURL: "astro/compiler-runtime",
    renderScript: true,
    resolvePath: async (x) => x,
  });
  assert.equal(compiled.diagnostics.filter((d) => d.severity === 1).length, 0);
  const componentPath = join(temporary, "component.mjs");
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
  const component = (await import(pathToFileURL(componentPath))).default;
  const container = await AstroContainer.create();
  const html = await container.renderToString(component);
  const script = await build({
    stdin: {
      contents: source.match(/<script>([\s\S]*?)<\/script>/)[1],
      loader: "ts",
      resolveDir: resolve("src/components/tools"),
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    logLevel: "silent",
  });
  let serial = 0;
  const run = async () => {
    const file = join(temporary, "script-" + serial++ + ".mjs");
    await writeFile(file, script.outputFiles[0].text);
    await import(pathToFileURL(file));
  };
  await check(
    "prior default GET could serialize fictional context; actual no-JS markup excludes every context field",
    async () => {
      const d = installToolDom(html);
      const form = d.$("#os-context-form");
      d.$("#os-organization").value = "Fictional Private Team";
      d.$("#os-mission").value = "Fictional private mission";
      d.$("#os-community").value = "Fictional private context";
      assert.equal(form.getAttribute("method"), null, "HTML default is GET");
      assert.equal(defaultQuery(form), "");
      const fieldset = d.$("#os-context-controls");
      assert.equal(fieldset.disabled, true);
      fieldset.removeAttribute("disabled");
      assert.match(defaultQuery(form), /organization=Fictional\+Private\+Team/);
      assert.match(defaultQuery(form), /mission=Fictional\+private\+mission/);
      assert.match(html, /<noscript>[\s\S]*Context fields stay disabled/);
    },
  );
  await check(
    "actual initialized script enables local context only after submit interception and saves without navigation",
    async () => {
      const d = installToolDom(html);
      await run();
      await settleTools(() => d.root.dataset.prInitialization === "ready");
      assert.equal(d.$("#os-context-controls").disabled, false);
      d.$("#os-organization").value = "Fictional Local Team";
      d.$("#os-mission").value = "Fictional local mission";
      const event = await d.$("#os-context-form").fire("submit");
      assert.equal(event.defaultPrevented, true);
      await settleTools(() => d.values.has("charitology.charity-os"));
      const saved = JSON.parse(d.values.get("charitology.charity-os"));
      assert.equal(saved.workspace.organization, "Fictional Local Team");
      assert.equal(saved.workspace.mission, "Fictional local mission");
      assert.equal(location.search, "");
      assert.equal(d.values.get("unrelated.private.key"), "unchanged");
    },
  );
  await check(
    "startup failure leaves fields disabled and the early local submit guard installed",
    async () => {
      const d = installToolDom(html);
      d.$("#os-editor").remove();
      await assert.rejects(run(), /Missing element/);
      assert.equal(d.$("#os-context-controls").disabled, true);
      const event = await d.$("#os-context-form").fire("submit");
      assert.equal(event.defaultPrevented, true);
      assert.equal(defaultQuery(d.$("#os-context-form")), "");
      assert.equal(d.values.has("charitology.charity-os"), false);
    },
  );
  console.log(`${count} program-record form privacy groups passed.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
