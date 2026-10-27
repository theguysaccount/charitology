// Actual archive presentation/loader checks; no provider, Git mutation or browser claim.
import assert from "node:assert/strict";
import { build } from "esbuild";
import ts from "typescript";
import postcss from "postcss";
import { transform } from "@astrojs/compiler";
import { mkdtemp, writeFile, mkdir, rm, symlink, readFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { makeActualPublicationFixture } from "../test-fixtures/publication-editions/factory.mjs";
import { publicationRegistryFiles } from "../src/lib/publication-editions-capture.mjs";

const temporary = await mkdtemp(join(tmpdir(), "charitology-publication-view-"));
let groups = 0;
async function check(name, action) { await action(); groups++; console.log(`✓ ${name}`); }
try {
  const bundle = await build({ entryPoints: ["src/lib/publication-editions-view.ts"], bundle: true, write: false, platform: "node", format: "esm", logLevel: "silent" });
  const viewModule = join(temporary, "view.mjs");
  await writeFile(viewModule, bundle.outputFiles[0].text);
  const view = await import(pathToFileURL(viewModule));
  await check("five family labels and ordinary endpoint paths", () => {
    assert.equal(Object.keys(view.PUBLICATION_FAMILIES).length, 5);
    assert.equal(view.publicationHref("sample-edition"), "/record/editions/sample-edition/");
    assert.equal(view.publicationSourceHref("source-test"), "/record/editions/sources/source-test/source.txt");
  });
  await check("Markdown HTML/images/embeds remain inert and unsafe links cannot execute", () => {
    const html = view.renderPublicationMarkdown('# Read\n\n<script>alert(1)</script>\n\n![remote](https://example.invalid/image.png)\n\n[x](javascript:alert) [x](https://user:pass@example.invalid/) [x](//example.invalid/)\n\n`<img onerror=x>` **Evidence**\n\n- One\n- Two');
    assert.doesNotMatch(html, /<(?:script|iframe|img)\b|href="(?:javascript|\/\/|https:\/\/user)/i);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /<code>&lt;img onerror=x&gt;<\/code>/);
    assert.match(html, /<strong>Evidence<\/strong>/);
    assert.match(html, /<ul><li>One<\/li><li>Two<\/li><\/ul>/);
  });
  await check("safe relative/HTTPS links, escaped quotes and fenced text", () => {
    const html = view.renderPublicationMarkdown('[Method](/method/) [Source](https://example.invalid/?q=%22)\n\n```html\n<iframe src=x>\n```', "/charitology");
    assert.match(html, /href="\/charitology\/method\/"/);
    assert.match(html, /href="https:\/\/example.invalid\/\?q=%22"/);
    assert.match(html, /<pre><code>&lt;iframe src=x&gt;<\/code><\/pre>/);
    for (const link of ["http://example.invalid/", "https://user@example.invalid/", "//example.invalid/", "/\\example.invalid/", "javascript:alert(1)", "https://example.invalid/\n"]) assert.equal(view.publicationSafeHref(link), null);
  });
  await check("large inert source text renders without argument spread or omission", () => {
    const raw = "# Source\n\n```\n" + "<>&\n".repeat(20000) + "```";
    const html = view.renderPublicationMarkdown(raw);
    assert.equal((html.match(/&lt;&gt;&amp;/g) ?? []).length, 20000);
  });
  const components = ["PublicationCurrent", "PublicationEdition", "PublicationMember"].map(n=>`src/components/${n}.astro`);
  const routes = ["src/pages/record/editions/index.astro", "src/pages/record/editions/[id].astro", "src/pages/record/editions/compare/index.astro", "src/pages/record/editions/compare/[from]/[to].astro"];
  await check("actual archive Astro templates compile", async () => {
    for (const file of [...components, ...routes]) {
      const result = await transform(await readFile(file,"utf8"), { filename: file });
      assert.equal(result.diagnostics.filter(d=>d.severity===1).length,0,file);
    }
  });
  await check("archive CSS parses and retains narrow, focus, inert text and print rules", async () => {
    const css = await readFile("src/styles/publication-editions.css","utf8");
    assert.doesNotThrow(()=>postcss.parse(css));
    for (const pattern of [/:focus-visible/,/max-width: 430px/,/white-space: pre-wrap/,/@media print/,/overflow-wrap: anywhere/]) assert.match(css,pattern);
  });
  await check("actual server loader and view helpers compile strictly", () => {
    const program = ts.createProgram(["src/lib/publication-editions.ts", "src/lib/publication-editions-view.ts", "node_modules/astro/client.d.ts"], {target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,noEmit:true,allowJs:true,checkJs:false,skipLibCheck:true,resolveJsonModule:true,esModuleInterop:true,lib:["lib.esnext.d.ts","lib.dom.d.ts","lib.dom.iterable.d.ts"],types:["node"]});
    const diagnostics=ts.getPreEmitDiagnostics(program);
    for(const d of diagnostics) console.log(ts.flattenDiagnosticMessageText(d.messageText," "));
    assert.equal(diagnostics.length,0);
  });
  const fixture = await makeActualPublicationFixture();
  const fixtureRoot=join(temporary,"fixture"), dataRoot=join(fixtureRoot,"src/data/publication-editions");
  const files=publicationRegistryFiles(fixture.input);
  for(const [name,text]of files){const path=join(dataRoot,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,text);}
  const loader = await build({ entryPoints:["src/lib/publication-editions.ts"],bundle:true,write:false,platform:"node",format:"esm",logLevel:"silent",define:{"process.cwd":"__fixtureCwd","import.meta.env.BASE_URL":JSON.stringify("/charitology/")},banner:{js:`import {createRequire as __createRequire} from 'node:module';const require=__createRequire(${JSON.stringify(pathToFileURL(resolve("package.json")).href)});const __fixtureCwd=()=>${JSON.stringify(fixtureRoot)};`} });
  let serial=0;
  const loadFresh=async()=>{const file=join(temporary,`loader-${serial++}.mjs`);await writeFile(file,loader.outputFiles[0].text);return (await import(pathToFileURL(file))).loadPublicationEditions();};
  await check("actual loader admits all five source-backed editions and measures complete shipped bytes", async () => {
    const actual=await loadFresh();
    assert.equal(actual.input.editions.length,5);
    assert.equal(actual.input.artifacts.length,10);
    assert.equal(actual.inventory.files,files.size);
    assert.ok(actual.inventory.shippedBytes<=20_971_520);
    assert.ok(actual.catalog.basisOffers.every(o=>o.href.startsWith("/charitology/record/editions/")));
  });
  await check("unknown files and empty directories fail closed", async () => {
    await writeFile(join(dataRoot,"unknown.json"),"{}\n");
    await assert.rejects(loadFresh);
    await rm(join(dataRoot,"unknown.json"));
    await mkdir(join(dataRoot,"unknown"));
    await assert.rejects(loadFresh);
    await rm(join(dataRoot,"unknown"),{recursive:true});
  });
  await check("missing, modified and symlinked actual source files fail closed", async () => {
    const entry=[...files].find(([p])=>p.startsWith("sources/"));
    const path=join(dataRoot,entry[0]), raw=entry[1];
    await rm(path);await assert.rejects(loadFresh);
    await writeFile(path,raw.replace('"rawSha256": "','"rawSha256": "0'));await assert.rejects(loadFresh);
    await rm(path);await symlink(join(dataRoot,"registry.json"),path);await assert.rejects(loadFresh);
    await rm(path);await writeFile(path,raw);
    assert.equal((await loadFresh()).input.editions.length,5);
  });
  console.log(`${groups} publication archive view/loader groups passed.`);
} finally { await rm(temporary,{recursive:true,force:true}); }
