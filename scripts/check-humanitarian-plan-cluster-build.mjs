// Actual built-output wiring only. Source truth, native Save and publication
// retain their separate evidence; this script makes no network requests.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { parse } from "parse5";
import { readObservationWorkingFiles } from "../src/lib/observation-capture-io.mjs";
import { validateObservationFiles } from "../src/lib/observation-model.mjs";
import { planClusterObservationProjection, planClusterObservationExport } from "../src/lib/humanitarian-plan-cluster/public.mjs";
import { PLAN_CLUSTER_HEADERS } from "../src/lib/humanitarian-plan-cluster/model.mjs";
import { fundingUsd } from "../src/lib/humanitarian-funding/model.mjs";

const root = process.cwd(), dist = resolve("dist");
const base = (process.env.BASE_PATH || "/").replace(/\/$/, "");
const file = route => {
  assert.ok(route.startsWith("/") && !route.includes(".."));
  const result = resolve(dist, "." + route + (route.endsWith("/") ? "index.html" : ""));
  assert.ok(result.startsWith(dist + sep));
  return result;
};
const bytes = route => readFileSync(file(route));
const json = route => JSON.parse(bytes(route));
const sha = value => createHash("sha256").update(value).digest("hex");
const attr = (node, key) => node.attrs?.find(a => a.name === key)?.value;
const text = node => node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(text).join("");
function all(node, predicate) {
  const found = [];
  function visit(n) { if (predicate(n)) found.push(n); for (const c of n.childNodes ?? []) visit(c); }
  visit(node); return found;
}
let groups = 0;
function check(name, run) { run(); groups++; console.log("✓ " + name); }
assert.ok(existsSync(dist), "Build dist before checking the plan-cluster view.");
const retained = readObservationWorkingFiles(root), input = validateObservationFiles(retained);
const current = planClusterObservationProjection(input, input.registry.current.id);
const page = parse(bytes("/record/gap-map/").toString("utf8"));
const sections = all(page, n => attr(n, "id") === "education-plan-funding");
assert.equal(sections.length, 1);
const section = sections[0], names = json("/api/v1/index.json").endpoints.map(e => e.name);

check("The published plan's rounded need and target have their own labels and source", () => {
  const contexts = all(section, n => n.tagName === "section" && attr(n, "aria-labelledby") === "education-plan-context-title");
  assert.equal(contexts.length, 1);
  const context = contexts[0];
  const headings = all(context, n => n.tagName === "h3" && attr(n, "id") === "education-plan-context-title");
  assert.deepEqual(headings.map(text), ["Estimated need and planned reach"]);
  assert.deepEqual(all(context, n => n.tagName === "dt").map(text), [
    "Estimated to need education assistance", "Targeted for education assistance",
  ]);
  assert.deepEqual(all(context, n => n.tagName === "dd").map(text), [
    "About 8 million people", "About 1.4 million people",
  ]);
  const links = all(context, n => n.tagName === "a");
  assert.deepEqual(links.map(text), ["Education section of the published humanitarian plan (PDF, printed page 37)"]);
  assert.equal(attr(links[0], "href"), "https://digitallibrary.un.org/nanna/record/4042660/files/AFG_HNRP_2024_V10.pdf?registerDownload=1&version=1&withMetadata=0&withWatermark=0#page=19");
  assert.match(text(context), /The number who received support is a separate measure/);
  assert.equal(all(context, n => n.tagName === "script").length, 0);
});

check("Only an actual selected capture exposes the current API and values", () => {
  assert.equal(names.filter(n => n === "humanitarian-plan-cluster").length, Number(current !== null));
  assert.equal(existsSync(file("/api/v1/humanitarian-plan-cluster.json")), current !== null);
  if (!current) {
    assert.match(text(section), /No captured Education plan-cluster value is selected/);
    assert.equal(all(section, n => attr(n, "class") === "plan-amounts").length, 0);
    return;
  }
  const api = json("/api/v1/humanitarian-plan-cluster.json");
  assert.deepEqual(Object.keys(api).sort(), ["data", "generated", "license", "name"]);
  assert.equal(api.name, "humanitarian-plan-cluster");
  assert.equal(api.generated, current.capturedAt); assert.deepEqual(api.data, current);
  assert.match(api.license, /CC BY 3\.0 IGO/); assert.match(api.license, /wrapper is private/);
});

check("Every historical selected export has the exact reviewed body; absent selections add no export", () => {
  for (const edition of input.registry.editions) for (const format of ["json", "csv"]) {
    const exported = planClusterObservationExport(input, edition.id, format);
    const route = `/observations/editions/${edition.id}/plan-cluster.${format}`;
    assert.equal(existsSync(file(route)), exported !== null);
    if (!exported) continue;
    const built = bytes(route);
    assert.equal(built.length, exported.bytes); assert.equal(sha(built), exported.sha256);
    assert.equal(built.toString("utf8"), exported.body);
  }
});

if (current) {
  check("Script-free card retains original strings, separate source percentage, draft scope and clocks", () => {
    assert.equal(all(section, n => n.tagName === "script").length, 0);
    const raw = all(section, n => attr(n, "class") === "plan-raw"); assert.equal(raw.length, 1);
    const cells = all(raw[0], n => n.tagName === "dd"); assert.equal(cells.length, 12);
    assert.deepEqual(cells.map(text), PLAN_CLUSTER_HEADERS.map(k => current.row.raw[k] === "" ? "Empty source string" : current.row.raw[k]));
    const amounts = all(section, n => attr(n, "class") === "plan-amounts"); assert.equal(amounts.length, 1);
    assert.deepEqual(all(amounts[0], n => n.tagName === "dd").map(text), [
      current.row.raw.requirements === "" ? "Unknown" : fundingUsd(current.row.raw.requirements),
      current.row.raw.funding === "" ? "Unknown" : fundingUsd(current.row.raw.funding),
      current.derived.status === "comparable" ? current.derived.displayPercent + "%" : "Unknown",
    ]);
    const content = text(section);
    if (current.derived.status === "comparable") assert.match(content, /This percentage compares two dollar amounts/);
    for (const literal of [current.source.retrievedAt, current.capturedAt, current.source.rawSha256, current.row.locator.rawSha256, current.code.commit, current.edition.hash]) assert.ok(content.includes(literal));
    assert.match(content, /draft cause mapping/); assert.match(content, /no funding-by-depth estimate/);
    assert.match(content, /checksum validation alone does not prove an external retrieval or its clock/);
    if (current.row.raw.percentFunded !== "") assert.ok(content.includes(current.row.raw.percentFunded + "%"));
  });

  check("Download links resolve to selected artifacts and the separately retained original CSV", () => {
    const links = all(section, n => n.tagName === "a"), get = label => links.find(a => text(a) === label);
    for (const [label, format] of [["Selected JSON", "json"], ["Selected CSV", "csv"]]) {
      const link = get(label); assert.ok(link);
      assert.equal(attr(link, "href"), base + `/observations/editions/${current.edition.id}/plan-cluster.${format}`);
      assert.notEqual(attr(link, "download"), undefined);
    }
    const original = get("Original licensed CSV"); assert.ok(original);
    assert.equal(attr(original, "href"), base + "/observations/files/" + current.source.payload.raw.path);
    assert.equal(attr(original, "download"), new URL(current.source.url).pathname.split("/").at(-1));
    const built = bytes("/observations/files/" + current.source.payload.raw.path);
    assert.equal(built.length, current.source.rawBytes); assert.equal(sha(built), current.source.rawSha256);
    assert.deepEqual(built, Buffer.from(retained[current.source.payload.raw.path]));
  });

  check("Source pages distinguish the original licensed CSV from the bounded metadata excerpt", () => {
    const csvPage = parse(bytes(`/observations/sources/${current.source.id}/v${current.source.version}/`).toString("utf8"));
    const licensePage = parse(bytes(`/observations/sources/${current.licenseSource.id}/v${current.licenseSource.version}/`).toString("utf8"));
    assert.match(text(csvPage), /Retained original CSV/);
    assert.match(text(licensePage), /Selected licensing metadata excerpt/);
    assert.match(text(licensePage), /complete original JSON wrapper remains private/);
    const excerpt = current.licenseSource.payload.publicExcerpt;
    const built = bytes("/observations/files/" + excerpt.path);
    assert.equal(built.length, excerpt.bytes); assert.equal(sha(built), excerpt.sha256);
    assert.notEqual(excerpt.sha256, current.licenseSource.rawSha256);
    assert.ok(excerpt.bytes < current.licenseSource.rawBytes);
  });
}

check("The Education Atlas and Census cards link to the case, and the local depth census stays separate", () => {
  const atlas = parse(bytes("/record/cause-atlas/").toString("utf8"));
  const causeCensus = parse(bytes("/programs/cause-census/").toString("utf8"));
  const target = base + "/record/gap-map/#education-plan-funding";
  const linksToCase = node => all(node, n => n.tagName === "a" && attr(n, "href") === target);
  for (const document of [atlas, causeCensus]) {
    const education = all(document, n => n.tagName === "article" && attr(n, "data-cause") === "education");
    assert.equal(education.length, 1);
    assert.equal(linksToCase(document).length, 1);
    assert.equal(linksToCase(education[0]).length, 1);
  }
  const census = all(page, n => attr(n, "id") === "depth-census"); assert.equal(census.length, 1);
  assert.equal(linksToCase(census[0]).length, 1);
  assert.match(text(census[0]), /supplies no depth allocation or global total/);
});
console.log(`Education plan cluster: ${groups} actual built-output groups passed (no network, native Save or source-truth certification).`);
