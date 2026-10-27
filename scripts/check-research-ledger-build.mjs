// Offline acceptance of the real static build against the admitted public model.
// This does not establish live hosting, browser downloads or independent review.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseHtml } from "parse5";
import { readLedgerInput } from "../src/lib/research-ledger-data.mjs";
import { seedOptions } from "./capture-research-ledger.mjs";
import {
  canonicalResearchJson,
  ledgerHref,
  projectResearchLedger,
  researchLedgerExport,
  researchProgress,
  researchSubjectHash,
  validateResearchLedger,
} from "../src/lib/research-ledger-model.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const base = (process.env.BASE_PATH || "/").replace(/\/$/, "");
const href = (path) => base + path;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const input = readLedgerInput();
const graph = validateResearchLedger(
  input,
  seedOptions(input, { currentFiles: true }),
);
const current = projectResearchLedger(graph, {
  editionId: input.manifest.currentEditionId,
});
const progress = researchProgress(graph, {
  editionId: current.edition.id,
  ...current.edition.period,
});
assert.ok(
  existsSync(dist),
  "Build dist/ before running the static ledger check.",
);

function routeFile(path) {
  assert.ok(path.startsWith("/") && !path.startsWith("//"));
  const pathname = new URL(path, "https://build.invalid").pathname;
  const decoded = decodeURIComponent(pathname);
  const target = resolve(dist, "." + decoded);
  assert.ok(target.startsWith(dist + sep), "Built routes stay inside dist/.");
  const file = pathname.endsWith("/") ? join(target, "index.html") : target;
  assert.ok(
    existsSync(file) && statSync(file).isFile(),
    `Missing built route: ${path}`,
  );
  return file;
}
const bytesAt = (path) => readFileSync(routeFile(path));
const textAt = (path) => bytesAt(path).toString("utf8");
const jsonAt = (path) => JSON.parse(textAt(path));
const attr = (node, name) =>
  node.attrs?.find((value) => value.name === name)?.value;
const hasClass = (node, value) =>
  (attr(node, "class") || "").split(/\s+/).includes(value);
const nodes = (node) => [node, ...(node.childNodes || []).flatMap(nodes)];
const text = (node) =>
  node.nodeName === "#text"
    ? node.value
    : (node.childNodes || []).map(text).join("");
const tidy = (value) => value.replace(/\s+/g, " ").trim();
const htmlAt = (path) => parseHtml(textAt(path));
const find = (node, predicate) => nodes(node).find(predicate);
const all = (node, predicate) => nodes(node).filter(predicate);
const links = (node) =>
  all(node, (element) => element.tagName === "a").map((element) =>
    attr(element, "href"),
  );
const editionPath = (id) =>
  `/research-ledger/editions/${encodeURIComponent(id)}/`;
const sourcePath = (id) =>
  `/research-ledger/sources/${encodeURIComponent(id)}/source.txt`;
let groups = 0;
function check(name, run) {
  run();
  groups++;
  console.log(`✓ ${name}`);
}

check(
  "Current API retains the exact validated projection, hashes and pinned generation date",
  () => {
    const api = jsonAt("/api/v1/research-ledger.json");
    assert.deepEqual(
      Object.keys(api).sort(),
      ["name", "description", "license", "generated", "data"].sort(),
    );
    assert.equal(api.name, "research-ledger");
    assert.equal(api.generated, current.edition.capturedAt.slice(0, 10));
    assert.deepEqual(
      api.data,
      current,
      "API flattening must not rewrite any hash-bearing object.",
    );
    const { factualHash, ...payload } = api.data;
    assert.equal(factualHash, researchSubjectHash(payload));
    assert.equal(api.data.edition.capturedAt, input.manifest.capture.at);
    assert.deepEqual(api.data.graph.records, input.records);
    assert.equal(api.data.graph.records.length, 43);
    const index = jsonAt("/api/v1/index.json");
    for (const name of ["research-ledger", "research-progress"]) {
      const endpoint = index.endpoints.find((entry) => entry.name === name);
      assert.ok(endpoint, `Missing API discovery entry: ${name}`);
      assert.equal(
        new URL(endpoint.url).pathname,
        href(`/api/v1/${name}.json`),
      );
    }
  },
);

check(
  "Progress API preserves all 23 states, unknown January baseline and dated editorial limits",
  () => {
    const api = jsonAt("/api/v1/research-progress.json");
    assert.equal(api.name, "research-progress");
    assert.equal(api.generated, current.edition.capturedAt.slice(0, 10));
    assert.deepEqual(api.data, progress);
    const { inputHash, ...payload } = api.data;
    assert.equal(inputHash, researchSubjectHash(payload));
    assert.equal(api.data.startingStates.length, 23);
    assert.ok(api.data.startingStates.every((state) => state.status === null));
    assert.equal(api.data.endingStates.length, 23);
    assert.deepEqual(
      api.data.endingStates,
      current.problemStates.map((state) => ({
        recordId: state.recordId,
        status: state.effectiveStatus,
      })),
    );
    assert.equal(api.data.coverage.baselineKnownFrom, null);
    assert.equal(api.data.dispositionsRecorded.length, 0);
    assert.equal(api.data.currentlySupportedDispositionIds.length, 0);
    assert.equal(api.data.editorialCorrections.length, 1);
    assert.equal(api.data.changedClaimIds.length, 2);
  },
);

check(
  "Every real detail route and exact version anchor is present with model qualification",
  () => {
    assert.equal(current.views.length, 43);
    for (const view of current.views) {
      const doc = htmlAt(ledgerHref(view.id));
      const record = find(
        doc,
        (node) => attr(node, "id") === `record-${view.id}`,
      );
      assert.ok(record, `Missing selected record content: ${view.id}`);
      assert.match(text(record), /Source review: draft/);
      assert.ok(
        links(doc).includes(
          href(editionPath(current.edition.id) + "ledger.json"),
        ),
      );
      for (const id of view.versionIds) {
        const version = current.graph.versions.find((entry) => entry.id === id);
        const section = find(
          record,
          (node) => attr(node, "id") === `version-${version.version}`,
        );
        assert.ok(section, `Missing archived version: ${id}`);
        assert.ok(text(section).includes(version.subjectHash));
        assert.ok(text(section).includes(version.hash));
        for (const binding of version.sources)
          assert.ok(
            links(section).includes(href(sourcePath(binding.sourceId))),
          );
      }
      assert.ok(
        all(doc, (node) => node.tagName === "time").some(
          (node) => attr(node, "datetime") === current.edition.capturedAt,
        ),
      );
    }
  },
);

check(
  "All pinned edition routes and lossless JSON/complete CSV bytes match their actual model",
  () => {
    for (const edition of input.editions) {
      const projection = projectResearchLedger(graph, {
        editionId: edition.id,
      });
      const path = editionPath(edition.id),
        doc = htmlAt(path);
      const pageLinks = links(doc);
      for (const format of ["json", "csv"]) {
        const output = researchLedgerExport(projection, {
          format,
          eventIds: null,
        });
        const route = path + `ledger.${format}`;
        assert.equal(
          textAt(route),
          output.text,
          `Wrong complete ${format} bytes: ${edition.id}`,
        );
        assert.ok(
          pageLinks.includes(href(route)),
          `Edition does not expose its ${format} download.`,
        );
        assert.equal(output.metadata.complete, true);
        assert.equal(output.metadata.selectedCount, edition.eventPins.length);
        assert.equal(output.metadata.omittedCount, 0);
        if (format === "json") {
          const envelope = jsonAt(route);
          const { checksum, ...payload } = envelope;
          assert.equal(checksum, researchSubjectHash(payload));
          assert.equal(textAt(route), canonicalResearchJson(envelope) + "\n");
          assert.deepEqual(envelope.data, projection);
          assert.equal(Object.hasOwn(envelope, "exportedAt"), false);
          for (const [group, pinName] of [
            ["records", "recordPins"],
            ["versions", "versionPins"],
            ["events", "eventPins"],
            ["sources", "sourcePins"],
            ["reviews", "reviewPins"],
            ["actors", "actorPins"],
            ["observations", "observationPins"],
          ]) {
            assert.deepEqual(
              envelope.data.graph[group].map(({ id, hash }) => ({ id, hash })),
              edition[pinName],
            );
          }
        } else {
          assert.ok(
            output.text.startsWith(
              '"rowType","editionId","editionHash","complete"',
            ),
          );
          assert.ok(
            output.text.includes(
              `"metadata","${edition.id}","${edition.hash}","true","null","${edition.eventPins.length}","0"`,
            ),
          );
        }
      }
      assert.ok(text(doc).includes(edition.hash));
      assert.ok(text(doc).includes(projection.factualHash));
    }
  },
);

check(
  "All 44 pinned source routes retain exact UTF-8 bytes, byte lengths and SHA-256 closure",
  () => {
    assert.equal(input.sources.length, 44);
    const sourceIds = new Set(current.graph.sources.map((source) => source.id));
    for (const source of input.sources) {
      const actual = bytesAt(sourcePath(source.id));
      assert.deepEqual(actual, Buffer.from(source.text, "utf8"), source.id);
      assert.equal(actual.length, source.byteLength);
      assert.equal(sha(actual), source.sha256);
    }
    for (const version of current.graph.versions)
      for (const binding of version.sources)
        assert.ok(sourceIds.has(binding.sourceId));
    for (const binding of current.edition.currentSources)
      assert.ok(sourceIds.has(binding.sourceId));
  },
);

check(
  "The current overview exposes all record links and honest zero scientific qualification",
  () => {
    const doc = htmlAt("/research-ledger/");
    const recordList = find(
      doc,
      (node) => attr(node, "data-ledger-noun") === "records",
    );
    assert.ok(recordList, "Missing server-rendered ledger record list.");
    const rows = all(
      recordList,
      (node) => node.tagName === "tr" && hasClass(node, "rl-item"),
    );
    assert.equal(rows.length, current.views.length);
    for (const view of current.views)
      assert.ok(links(recordList).includes(href(ledgerHref(view.id))));
    for (const field of [
      "reviews",
      "qualifiedSourceReviews",
      "peerReviewedManuscripts",
      "qualifyingResearchResults",
      "partial",
      "solved",
      "underReview",
    ])
      assert.equal(current.counters[field], 0);
    assert.equal(current.counters.open, 23);
    assert.ok(
      current.views.every(
        (view) =>
          view.qualification.sourceReview === "draft" &&
          view.qualification.peerReview !== "peer-reviewed",
      ),
    );
    const stats = find(doc, (node) => hasClass(node, "rl-stats"));
    assert.ok(stats, "Missing model-derived qualification counts.");
    for (const label of [
      "Review declarations",
      "Subjects with qualifying source review",
      "Peer-reviewed manuscripts",
      "Qualifying research results",
    ]) {
      const item = all(stats, (node) => node.tagName === "li").find(
        (node) => tidy(text(node)) === `0${label}`,
      );
      assert.ok(item, `Missing explicit zero qualification: ${label}`);
    }
    assert.match(
      tidy(text(doc)),
      /does not establish a scientific result or independent review/,
    );
  },
);

check(
  "Every covered content page links its exact record and retains an honest draft review notice",
  () => {
    assert.equal(input.manifest.currentSources.length, 40);
    for (const binding of input.manifest.currentSources) {
      const doc = htmlAt(binding.href);
      const notice = find(
        doc,
        (node) => attr(node, "aria-label") === "Review status",
      );
      assert.ok(notice, `Missing review notice: ${binding.sourceKey}`);
      assert.match(tidy(text(notice)), /Draft, Edition 0/);
      assert.match(
        tidy(text(notice)),
        /No qualifying independent source review is recorded for this version/,
      );
      assert.ok(links(notice).includes(href(ledgerHref(binding.recordId))));
    }
  },
);

check(
  "The built progress table and compatibility API agree on every current problem state",
  () => {
    const doc = htmlAt("/record/progress-report/");
    const section = find(doc, (node) => hasClass(node, "pr"));
    assert.ok(section);
    const body = find(section, (node) => node.tagName === "tbody");
    assert.ok(body, "Missing server-rendered progress table.");
    const rows = all(body, (node) => node.tagName === "tr");
    const compatibility = jsonAt("/api/v1/open-problems.json");
    const bindings = input.manifest.currentSources.filter((entry) =>
      entry.sourceKey.startsWith("problems/"),
    );
    assert.equal(rows.length, 23);
    for (const binding of bindings) {
      const state = current.problemStates.find(
        (entry) => entry.recordId === binding.recordId,
      );
      const row = rows.find((entry) =>
        links(entry).includes(href(binding.href)),
      );
      assert.ok(row, `Missing progress row: ${binding.sourceKey}`);
      const cells = (row.childNodes || []).filter(
        (entry) => entry.tagName === "td",
      );
      assert.equal(tidy(text(cells[2])), state.effectiveStatus);
      assert.ok(links(row).includes(href(ledgerHref(binding.recordId))));
      assert.equal(
        compatibility.data.find(
          (entry) => `problems/${entry.id}` === binding.sourceKey,
        )?.status,
        state.effectiveStatus,
      );
    }
    assert.ok(
      all(section, (node) => node.tagName === "time").some(
        (node) => attr(node, "datetime") === current.edition.capturedAt,
      ),
    );
    assert.match(tidy(text(section)), /No January baseline was recorded/);
    assert.match(tidy(text(section)), /0 qualifying research results/);
  },
);

console.log(
  `Research-ledger static build: ${groups} integration groups passed; ${current.views.length} detail routes, ${input.editions.length} pinned edition(s), ${input.sources.length} exact source downloads and ${current.problemStates.length} progress states. Static evidence only; live hosting, browser files and human review are separate.`,
);
