// Actual Astro SSR and production controller; fictional DOM/storage, not native Save/layout.
import assert from "node:assert/strict";
import fs from "node:fs";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { compileCaller } from "../test-fixtures/remaining-record-other-callers/runtime.mjs";
import { installToolDom } from "../test-fixtures/donor-recovery/tool-dom.mjs";
import { fundingFixture, fixtureRows } from "../test-fixtures/humanitarian-funding/fixture.mjs";
import { parseCsv } from "../src/lib/client/csv.ts";
import { FUNDING_LICENSE, FUNDING_HEADERS } from "../src/lib/humanitarian-funding/model.mjs";
import { FUNDING_REGISTRY_PATH, loadHumanitarianFunding } from "../src/lib/humanitarian-funding/public.mjs";
import { captureCode } from "./capture-humanitarian-funding.mjs";
const temp = await mkdtemp(join(resolve("node_modules"), ".humanitarian-funding-"));
let groups = 0, dispose;
const check = async (name, fn) => { await fn(); groups++; console.log("✓ " + name); };
try {
  const caller = await compileCaller("src/components/HumanitarianFundingReference.astro", temp);
  const container = await AstroContainer.create();
  const f = fundingFixture();
  const html = await container.renderToString(caller.component, { props: { edition: f.edition } });
  const bundled = await build({ stdin: { contents: "export * from './src/lib/client/humanitarian-funding.ts';", loader: "ts", resolveDir: process.cwd() }, bundle: true, write: false, platform: "node", format: "esm", logLevel: "silent" });
  const clientPath = join(temp, "controller.mjs"); await writeFile(clientPath, bundled.outputFiles[0].text);
  const client = await import(pathToFileURL(clientPath));
  function dom(source = html) {
    dispose?.(); dispose = undefined;
    const d = installToolDom(source); d.root = d.$("[data-funding-reference]");
    d.revoked = []; URL.revokeObjectURL = url => d.revoked.push(url);
    d.requests = []; globalThis.fetch = async (...args) => { d.requests.push(args); throw Error("No network is allowed in this controller"); };
    d.buttons = d.root.querySelectorAll("[data-funding-export]");
    d.get = key => d.$(`[data-funding-${key}]`);
    return d;
  }
  function mount(source) { const d = dom(source); dispose = client.wireHumanitarianFunding(d.root); return d; }
  async function download(d, action) {
    const before = d.downloads.length, button = d.buttons.find(b => b.dataset.fundingExport === action);
    assert.ok(button && !button.disabled); await button.click();
    assert.equal(d.downloads.length, before + 1); return d.downloads.at(-1).text();
  }
  await check("actual SSR keeps all raw rows, disabled no-JS controls, source links and safe JSON strings", async () => {
    const d = dom();
    assert.equal(d.root.querySelectorAll("[data-funding-row]").length, 3);
    assert.equal(d.get("controls").disabled, true); assert.ok(d.buttons.every(b => b.disabled));
    assert.match(d.root.textContent, /No country or worldwide funding total/);
    assert.match(d.root.textContent, /No plan ID supplied/); assert.match(d.root.textContent, /Not comparable/);
    assert.ok(d.root.querySelectorAll("caption").length === 1);
    const rows = fixtureRows(); rows[0][2] = '</script><script>fictional marker</script>\u2028  ';
    const hostile = fundingFixture(rows), rendered = await container.renderToString(caller.component, { props: { edition: hostile.edition } });
    assert.equal(rendered.includes('</script><script>fictional marker'), false);
    const text = dom(rendered).get("json").textContent;
    assert.equal(text.includes("<"), false); assert.equal(JSON.parse(text).rows[0].raw.name, rows[0][2]);
  });
  await check("mounted search/type/country are conjunctive; Clear restores exact source order without storage or network", async () => {
    const d = mount();
    assert.equal(d.get("controls").disabled, false); assert.ok(d.buttons.every(b => !b.disabled));
    d.get("country").value = "AAA"; await d.get("country").fire("change");
    assert.equal(d.root.querySelectorAll("[data-funding-row]").filter(r => !r.hidden).length, 2);
    d.get("type").value = "5"; await d.get("type").fire("change");
    d.get("search").value = "ＡＬＰＨＡ"; await d.get("search").fire("input");
    assert.match(d.get("status").textContent, /1 of 3/);
    const selected = JSON.parse(await download(d, "selected-json"));
    assert.deepEqual(selected.rows.map(r => r.key), ["AAA:101:2025"]); assert.equal(selected.selection.search, "ＡＬＰＨＡ");
    await d.get("clear").click(); assert.match(d.get("status").textContent, /3 of 3/);
    assert.equal(d.get("country").value + d.get("type").value + d.get("search").value, "");
    assert.equal(d.operations.length, 0); assert.equal(d.requests.length, 0); assert.equal(d.values.get("unrelated.private.key"), "unchanged");
  });
  await check("all four actual download actions preserve source fields, selection scope and license/provenance", async () => {
    const d = mount(); d.get("country").value = "BBB"; await d.get("country").fire("change");
    for (const scope of ["complete", "selected"]) {
      const json = JSON.parse(await download(d, scope + "-json"));
      assert.equal(json.rows.length, scope === "complete" ? 3 : 1); assert.equal(json.source.license.id, FUNDING_LICENSE.id);
      assert.equal(json.source.csvSha256, f.source.csvSha256); assert.equal(json.editionSha256, f.edition.sha256);
      assert.deepEqual(json.rows.at(-1).raw, scope === "complete" ? f.edition.rows.at(-1).raw : f.edition.rows[1].raw);
      const csv = parseCsv(await download(d, scope + "-csv")), head = csv[0], type = head.indexOf("record_type");
      assert.deepEqual(head.slice(0, 12), FUNDING_HEADERS); assert.ok(csv.every(r => r.length === head.length));
      assert.equal(csv[1][type], "provenance"); assert.equal(csv[1][head.indexOf("license_url")], FUNDING_LICENSE.url);
      assert.equal(csv.filter(r => r[type] === "data").length, scope === "complete" ? 3 : 1);
    }
    assert.ok(d.revoked.length >= 3, "New output revokes each previous owned URL");
    await d.window.fire("pagehide"); assert.equal(d.revoked.length, 4);
    assert.equal(d.document.querySelectorAll("a[download]").length, 0);
  });
  await check("empty filtered output stays explicitly empty with a licensed JSON/CSV provenance record", async () => {
    const d = mount(); d.get("search").value = "No such fictional plan"; await d.get("search").fire("input");
    assert.equal(d.get("empty").hidden, false);
    const json = JSON.parse(await download(d, "selected-json")); assert.equal(json.rows.length, 0); assert.equal(json.source.license.id, FUNDING_LICENSE.id);
    const csv = parseCsv(await download(d, "selected-csv")); assert.equal(csv.length, 2); assert.equal(csv[0].length, csv[1].length);
    assert.ok(csv[1].includes(FUNDING_LICENSE.url));
  });
  await check("invalid serialized data or missing DOM rows refuse controls while preserving readable source content", async () => {
    const d = dom(); d.get("json").textContent = "{invalid fixture";
    dispose = client.wireHumanitarianFunding(d.root); assert.equal(d.get("controls").disabled, true); assert.ok(d.buttons.every(b => b.disabled));
    assert.match(d.root.textContent, /Fictional plan alpha/); assert.match(d.get("status").textContent, /could not be checked/);
    const missing = dom(); missing.root.querySelector("[data-funding-row]").remove();
    dispose = client.wireHumanitarianFunding(missing.root); assert.equal(missing.get("controls").disabled, true);
  });
  await check("export failure retains filters/rows; disposal revokes output and detaches current controls", async () => {
    const d = mount(); d.get("search").value = "alpha"; await d.get("search").fire("input");
    const original = URL.createObjectURL; URL.createObjectURL = () => { throw Error("Fictional URL refusal"); };
    await d.buttons[0].click(); URL.createObjectURL = original;
    assert.equal(d.get("search").value, "alpha"); assert.match(d.get("status").textContent, /could not be prepared/);
    await download(d, "selected-json"); const before = d.downloads.length;
    dispose(); assert.equal(d.revoked.length, 1); assert.ok(d.buttons.every(b => b.disabled));
    await d.buttons[0].fire("click"); assert.equal(d.downloads.length, before);
  });
  await check("the actually bundled build loader still resolves the declared source-tree working directory", async () => {
    const file = join(temp, "bundled-public-loader.mjs");
    await build({ entryPoints: [resolve("src/lib/humanitarian-funding/public.mjs")], outfile: file, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent" });
    const loader = await import(pathToFileURL(file));
    const original = fs.existsSync, seen = [];
    try { fs.existsSync = p => { seen.push(String(p)); return false; }; assert.equal(loader.loadHumanitarianFunding(), null); }
    finally { fs.existsSync = original; }
    assert.ok(seen.includes(resolve(FUNDING_REGISTRY_PATH)), "Astro chunk location cannot retarget source admission");
  });
  await check("source-only absence is honest; a committed edition must pass actual cached immutability and code-A pins", async () => {
    const edition = loadHumanitarianFunding();
    if (!fs.existsSync(resolve(FUNDING_REGISTRY_PATH))) {
      assert.equal(edition, null);
      const absent = await container.renderToString(caller.component, { props: { edition: null } });
      assert.match(absent, /not available in this edition/); assert.equal(absent.includes("data-funding-json"), false);
      console.log("  Source-only stage: no data edition is claimed yet.");
    } else {
      assert.ok(edition); const hash = edition.sha256, funding = edition.rows[0].raw.funding;
      assert.equal(edition.rows.length, 195); assert.equal(edition.summary.comparableRows, 84);
      assert.equal(captureCode(edition.sourceCode.commit).commit, edition.sourceCode.commit);
      assert.throws(() => { edition.rows[0].raw.funding = "999"; }, TypeError);
      assert.throws(() => { edition.source.license.url = "https://example.invalid/changed"; }, TypeError);
      assert.equal(loadHumanitarianFunding(), edition); assert.equal(edition.sha256, hash); assert.equal(edition.rows[0].raw.funding, funding);
      console.log("  Actual committed data: 195 source rows, frozen cache and named code-A files checked.");
    }
  });
  console.log(`Humanitarian funding: ${groups} actual SSR/mounted/build-helper groups passed; no native browser or file-save claim.`);
} finally { dispose?.(); await rm(temp, { recursive: true, force: true }); }
