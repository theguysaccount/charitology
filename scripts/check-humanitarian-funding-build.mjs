// Actual built files only; no network, browser, native Save or source-truth claim.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { parse } from "parse5";
import { loadHumanitarianFunding } from "../src/lib/humanitarian-funding/public.mjs";
import { FUNDING_HEADERS, validateFundingEdition, fundingSha256 } from "../src/lib/humanitarian-funding/model.mjs";
import { FUNDING_LICENSE_SUMMARY } from "../src/lib/humanitarian-funding/source.mjs";
const dist = resolve("dist"), base = (process.env.BASE_PATH || "/").replace(/\/$/, "");
const file = p => { assert.ok(p.startsWith("/") && !p.includes("..")); const f = resolve(dist, "." + p + (p.endsWith("/") ? "index.html" : "")); assert.ok(f.startsWith(dist + sep)); return f; };
const bytes = p => readFileSync(file(p)), json = p => JSON.parse(bytes(p));
const attr = (n, k) => n.attrs?.find(a => a.name === k)?.value;
const text = n => n.nodeName === "#text" ? n.value : (n.childNodes ?? []).map(text).join("");
function all(node, predicate) { const out = []; function visit(n) { if (predicate(n)) out.push(n); for (const c of n.childNodes ?? []) visit(c); } visit(node); return out; }
let groups = 0;
function check(name, fn) { fn(); groups++; console.log("✓ " + name); }
assert.ok(existsSync(dist), "Build dist before checking humanitarian funding.");
const edition = loadHumanitarianFunding(), doc = parse(bytes("/record/gap-map/").toString("utf8"));
const section = all(doc, n => attr(n, "id") === "humanitarian-plan-funding"); assert.equal(section.length, 1);
const names = json("/api/v1/index.json").endpoints.map(e => e.name);
if (!edition) {
  check("Code A has honest no-capture HTML and no fabricated funding API", () => {
    assert.match(text(section[0]), /not available in this edition/); assert.ok(!names.includes("humanitarian-funding"));
    assert.equal(existsSync(file("/api/v1/humanitarian-funding.json")), false);
  });
} else {
  check("Built API retains the full admitted edition, capture instant and distinct source license", () => {
    const api = json("/api/v1/humanitarian-funding.json");
    assert.deepEqual(Object.keys(api).sort(), ["data", "generated", "license", "name"]);
    assert.equal(api.name, "humanitarian-funding"); assert.equal(api.generated, edition.source.asOf);
    assert.equal(api.license, FUNDING_LICENSE_SUMMARY); assert.deepEqual(api.data, edition);
    assert.equal(names.filter(n => n === "humanitarian-funding").length, 1); assert.equal(names.length, 39);
  });
  check("Public licensed source envelope independently reconstructs every selected row and byte locator", () => {
    const raw = bytes(edition.source.evidenceUrl), original = readFileSync(resolve("public", "." + edition.source.evidenceUrl));
    assert.deepEqual(raw, original);
    const source = JSON.parse(raw); validateFundingEdition(edition, source);
    const csv = Buffer.from(source.csvUtf8, "utf8");
    assert.equal(csv.length, edition.source.csvBytes); assert.equal(fundingSha256(csv), edition.source.csvSha256);
    for (const row of edition.rows) assert.equal(fundingSha256(csv.subarray(row.locator.byteStart, row.locator.byteEnd)), row.locator.rawSha256);
    assert.deepEqual(source.source.license, edition.source.license); assert.equal(source.source.attribution, edition.source.attribution);
  });
  check("Script-free table preserves all195 source rows, their exact twelve strings and safe projection", () => {
    const rows = all(section[0], n => attr(n, "data-funding-row") !== undefined);
    assert.equal(rows.length, 195); assert.equal(edition.summary.comparableRows, 84);
    assert.deepEqual(rows.map(r => attr(r, "data-funding-row")), edition.rows.map(r => r.key));
    for (let i = 0; i < rows.length; i++) {
      const rawFields = all(rows[i], n => n.tagName === "dd"); assert.equal(rawFields.length, 12);
      assert.deepEqual(rawFields.map(n => text(n)), FUNDING_HEADERS.map(k => edition.rows[i].raw[k] === "" ? "Empty source string" : edition.rows[i].raw[k]));
    }
    const serialized = all(section[0], n => attr(n, "data-funding-json") !== undefined); assert.equal(serialized.length, 1);
    assert.deepEqual(JSON.parse(text(serialized[0])), edition);
    assert.ok(all(section[0], n => n.tagName === "noscript").length === 1);
  });
  check("No-JS controls are disabled and source/license/API links retain configured base paths", () => {
    const controls = all(section[0], n => attr(n, "data-funding-controls") !== undefined); assert.equal(controls.length, 1);
    assert.notEqual(attr(controls[0], "disabled"), undefined);
    const buttons = all(section[0], n => attr(n, "data-funding-export") !== undefined); assert.equal(buttons.length, 4);
    assert.ok(buttons.every(n => attr(n, "disabled") !== undefined));
    const links = all(section[0], n => n.tagName === "a").map(n => attr(n, "href"));
    for (const href of [edition.source.datasetUrl, edition.source.resourceUrl, edition.source.license.url, base + edition.source.evidenceUrl, base + "/api/v1/humanitarian-funding.json"]) assert.ok(links.includes(href), href);
    assert.match(text(section[0]), /No country or worldwide funding total/); assert.match(text(section[0]), /Requirements are planning requests/);
  });
}
check("The existing census/planner and qualified Atlas/Census links remain alongside the new reference", () => {
  assert.ok(all(doc, n => attr(n, "id") === "depth-census").length === 1);
  for (const p of ["/record/cause-atlas/", "/programs/cause-census/"]) {
    const d = parse(bytes(p).toString("utf8"));
    assert.ok(all(d, n => n.tagName === "a" && attr(n, "href") === base + "/record/gap-map/#humanitarian-plan-funding").length === 1);
  }
});
console.log(`Humanitarian funding: ${groups} actual built-output groups passed.`);
