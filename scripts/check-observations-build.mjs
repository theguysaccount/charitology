// Offline static acceptance of admitted source records and actual built bytes.
// No live freshness, browser download, rights ruling or human review is implied.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";
import {
  loadObservations,
  observationEditionHref,
  observationSourceHref,
  observationGroupSelections,
} from "../src/lib/observations.ts";
import {
  observationProjection,
  observationExport,
  observationHistoryExport,
  legacyCountriesProjection,
} from "../src/lib/observation-model.mjs";
import {
  observationFact,
  observationPinned,
  observationCoverageAnchor,
  countryObservationFacts,
  countryMissingFacts,
} from "../src/lib/observation-view.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  dist = join(root, "dist");
const base = (process.env.BASE_PATH || "/").replace(/\/$/, ""),
  site = process.env.SITE_URL || "https://charitology.org",
  href = (p) => base + p;
assert.ok(existsSync(dist), "Build dist/ before checking observation output.");
const archive = loadObservations(),
  { input, projection: current, countries } = archive;
const sha = (v) => createHash("sha256").update(v).digest("hex"),
  plain = (v) => JSON.parse(JSON.stringify(v));
function routeFile(p) {
  assert.ok(p.startsWith("/") && !p.startsWith("//"));
  const path = decodeURIComponent(new URL(p, "https://build.invalid").pathname),
    target = resolve(dist, "." + path);
  assert.ok(target.startsWith(dist + sep), "Built route remains inside dist/.");
  const file = path.endsWith("/") ? join(target, "index.html") : target;
  assert.ok(
    existsSync(file) && statSync(file).isFile(),
    `Missing built route: ${p}`,
  );
  return file;
}
const bytes = (p) => readFileSync(routeFile(p)),
  raw = (p) => bytes(p).toString("utf8"),
  json = (p) => JSON.parse(raw(p)),
  html = (p) => parse(raw(p));
const attr = (n, key) => n.attrs?.find((a) => a.name === key)?.value;
function all(n, predicate) {
  const out = [];
  const visit = (v) => {
    if (predicate(v)) out.push(v);
    for (const c of v.childNodes ?? []) visit(c);
  };
  visit(n);
  return out;
}
const find = (n, p) => all(n, p)[0],
  text = (n) =>
    n.nodeName === "#text" ? n.value : (n.childNodes ?? []).map(text).join(""),
  tidy = (s) => s.replace(/\s+/g, " ").trim();
const links = (n) =>
  all(n, (v) => v.tagName === "a").map((n) => attr(n, "href"));
const includes = (n, value, label = value) =>
  assert.ok(
    tidy(text(n)).includes(tidy(String(value))),
    `Missing rendered content: ${label}`,
  );
function head(doc, path) {
  const canonical = all(
    doc,
    (n) => n.tagName === "link" && attr(n, "rel") === "canonical",
  );
  assert.equal(canonical.length, 1);
  assert.equal(attr(canonical[0], "href"), new URL(href(path), site).href);
  for (const property of ["og:title", "og:description", "og:url", "og:image"])
    assert.equal(
      all(doc, (n) => n.tagName === "meta" && attr(n, "property") === property)
        .length,
      1,
      property,
    );
  const ids = all(doc, (n) => attr(n, "id") !== undefined).map((n) =>
    attr(n, "id"),
  );
  assert.equal(
    new Set(ids).size,
    ids.length,
    `Duplicate document IDs: ${path}`,
  );
}
function editionRows(doc, p) {
  const rows = all(doc, (n) => attr(n, "data-ob-row") !== undefined),
    expected = p.coverage.reduce((n, c) => n + c.cells.length, 0);
  assert.equal(rows.length, expected);
  assert.ok(
    rows.every((r) => attr(r, "hidden") === undefined),
    "Source HTML must be readable without JavaScript.",
  );
  for (const coverage of p.coverage)
    for (const [index, cell] of coverage.cells.entries()) {
      const anchor = observationCoverageAnchor(
          coverage.id,
          coverage.version,
          index,
        ),
        r = rows.find((r) => attr(r, "id") === anchor);
      assert.ok(r, `Missing exact coverage row: ${anchor}`);
      assert.equal(attr(r, "data-coverage-id"), coverage.id);
      assert.equal(attr(r, "data-coverage-version"), String(coverage.version));
      assert.equal(attr(r, "data-coverage-hash"), coverage.hash);
      assert.equal(attr(r, "data-cell-index"), String(index));
      assert.equal(attr(r, "data-edition-id"), p.edition.id);
      assert.equal(attr(r, "data-edition-hash"), p.edition.hash);
      if (cell.state === "present") {
        const o = observationPinned(p.observations, cell.observation),
          f = observationFact(p, o);
        assert.equal(attr(r, "data-observation-id"), o.id);
        assert.equal(attr(r, "data-observation-version"), String(o.version));
        assert.equal(attr(r, "data-observation-hash"), o.hash);
        includes(r, f.valueText);
        includes(r, f.unitText);
        includes(r, f.periodText);
        assert.ok(
          links(r).includes(
            href(observationSourceHref(f.source.id, f.source.version)),
          ),
        );
      } else {
        assert.equal(attr(r, "data-observation-id"), undefined);
        includes(r, "Unknown");
        includes(r, "not a zero observation");
      }
    }
}
let groups = 0,
  countryCount = 0,
  sourceCount = 0,
  downloadCount = 0;
const check = (name, run) => {
  run();
  groups++;
  console.log("✓ " + name);
};

check(
  "three current APIs preserve complete model data, pinned capture and scoped third-party rights",
  () => {
    const p = current;
    const expected = {
      observations: plain(p),
      countries: plain(countries),
      "observation-coverage": plain({
        format: "charitology-observation-coverage-projection",
        version: 1,
        edition: p.edition,
        capturedAt: p.capturedAt,
        countryProjection: p.countryProjection,
        entities: p.entities,
        scopes: p.scopes,
        measures: p.measures,
        sources: p.sources,
        coverage: p.coverage,
        observationsEndpoint: "/api/v1/observations.json",
        limitations: p.limitations,
      }),
    };
    const directory = json("/api/v1/index.json");
    assert.match(
      directory.license,
      /External data and documents retain their own source-specific terms/,
    );
    assert.match(
      directory.license,
      /does not license third-party source material/,
    );
    assert.equal(
      new Set(directory.endpoints.map((e) => e.name)).size,
      directory.endpoints.length,
    );
    for (const name of Object.keys(expected)) {
      const endpoint = json(`/api/v1/${name}.json`);
      assert.deepEqual(
        Object.keys(endpoint).sort(),
        ["name", "description", "license", "generated", "data"].sort(),
      );
      assert.equal(endpoint.name, name);
      assert.equal(endpoint.generated, p.capturedAt.slice(0, 10));
      assert.deepEqual(endpoint.data, expected[name]);
      assert.match(
        endpoint.license,
        /metadata licensing is a disclosed publisher-default inference/,
      );
      assert.match(endpoint.license, /Financial documents have separate terms/);
      assert.match(endpoint.license, /private originals are not included/);
      const entry = directory.endpoints.find((e) => e.name === name);
      assert.ok(entry);
      assert.equal(new URL(entry.url).pathname, href(`/api/v1/${name}.json`));
    }
    assert.deepEqual(
      Object.keys(expected.countries).sort(),
      [
        "title",
        "retrieved",
        "window",
        "publisher",
        "license",
        "scope",
        "countrySource",
        "review",
        "reviewNote",
        "indicators",
        "countries",
      ].sort(),
    );
  },
);
check(
  "current desk and every pinned edition retain all script-free coverage rows and source-version links",
  () => {
    const currentDoc = html("/observations/");
    head(currentDoc, "/observations/");
    editionRows(currentDoc, current);
    includes(currentDoc, current.capturedAt);
    includes(currentDoc, "awaiting independent human source review");
    for (const e of input.registry.editions) {
      const p = observationProjection(input, e.id),
        path = observationEditionHref(e.id),
        doc = html(path);
      head(doc, path);
      editionRows(doc, p);
      includes(doc, e.hash);
      includes(doc, p.capturedAt);
      assert.ok(links(doc).includes(href(path + "observations.json")));
      assert.ok(links(doc).includes(href(path + "observations.csv")));
      for (const s of p.sources)
        assert.ok(
          links(doc).includes(href(observationSourceHref(s.id, s.version))),
        );
    }
  },
);
check(
  "all current country pages retain exact present observations and missing coverage identities",
  () => {
    for (const country of countries.countries) {
      const path = `/record/countries/${country.id.toLowerCase()}/`,
        doc = html(path),
        facts = countryObservationFacts(current, country.id),
        missing = countryMissingFacts(current, country.id);
      head(doc, path);
      includes(doc, country.name);
      assert.ok(
        links(doc).includes(href(observationEditionHref(current.edition.id))),
      );
      for (const indicator of countries.indicators) {
        const f = facts[indicator.id];
        if (f) {
          const card = find(
            doc,
            (n) => attr(n, "data-observation-id") === f.record.id,
          );
          assert.ok(card);
          assert.equal(
            attr(card, "data-observation-version"),
            String(f.record.version),
          );
          assert.equal(attr(card, "data-observation-hash"), f.record.hash);
          assert.equal(attr(card, "data-edition-id"), current.edition.id);
          assert.equal(attr(card, "data-edition-hash"), current.edition.hash);
          includes(card, f.valueText);
          includes(card, f.unitText);
          includes(card, f.periodText);
          includes(card, f.record.reported.token);
          assert.ok(
            links(card).includes(
              href(observationSourceHref(f.source.id, f.source.version)),
            ),
          );
        } else {
          const m = missing[indicator.id];
          assert.ok(m);
          const card = find(
            doc,
            (n) =>
              attr(n, "data-coverage-id") === m.coverage.id &&
              attr(n, "data-cell-index") === String(m.index),
          );
          assert.ok(card);
          assert.equal(
            attr(card, "data-coverage-version"),
            String(m.coverage.version),
          );
          assert.equal(attr(card, "data-coverage-hash"), m.coverage.hash);
          assert.equal(attr(card, "data-edition-id"), current.edition.id);
          includes(card, "Unknown in the 2020–2025 snapshot");
          assert.ok(
            links(card).includes(
              href(
                `${observationEditionHref(current.edition.id)}#${observationCoverageAnchor(m.coverage.id, m.coverage.version, m.index)}`,
              ),
            ),
          );
        }
      }
      countryCount++;
    }
  },
);
check(
  "country desk embeds the same exact values, observation pins, missing-cell links and immutable edition",
  () => {
    const doc = html("/record/country-profiles/"),
      desk = find(doc, (n) => attr(n, "id") === "country-desk");
    assert.ok(desk);
    assert.deepEqual(
      JSON.parse(attr(desk, "data-countries")),
      plain(countries),
    );
    assert.equal(attr(desk, "data-edition"), current.edition.id);
    assert.equal(attr(desk, "data-edition-hash"), current.edition.hash);
    const facts = JSON.parse(attr(desk, "data-facts")),
      missing = JSON.parse(attr(desk, "data-missing"));
    for (const country of countries.countries) {
      for (const [key, f] of Object.entries(
        countryObservationFacts(current, country.id),
      )) {
        const v = facts[country.id][key];
        assert.equal(v.value, f.valueText);
        assert.equal(v.token, f.record.reported.token);
        assert.equal(v.observationId, f.record.id);
        assert.equal(v.observationVersion, f.record.version);
        assert.equal(v.observationHash, f.record.hash);
        assert.equal(v.sourceHash, f.source.hash);
        assert.equal(
          v.source,
          href(observationSourceHref(f.source.id, f.source.version)),
        );
      }
      for (const [key, m] of Object.entries(
        countryMissingFacts(current, country.id),
      )) {
        const v = missing[country.id][key];
        assert.equal(v.coverageId, m.coverage.id);
        assert.equal(v.coverageVersion, m.coverage.version);
        assert.equal(v.coverageHash, m.coverage.hash);
        assert.equal(v.cellIndex, m.index);
        assert.equal(
          v.cellHref,
          href(
            `${observationEditionHref(current.edition.id)}#${observationCoverageAnchor(m.coverage.id, m.coverage.version, m.index)}`,
          ),
        );
      }
    }
  },
);
check(
  "every immutable public inventory file is published with exact bytes and no unindexed file",
  () => {
    const expected = [
      "registry.json",
      ...input.registry.files.map((f) => f.path),
    ].sort();
    for (const path of expected) {
      const actual = bytes(`/observations/files/${path}`);
      assert.deepEqual(actual, Buffer.from(archive.file(path)), path);
      if (path !== "registry.json") {
        const pin = input.registry.files.find((f) => f.path === path);
        assert.equal(actual.byteLength, pin.bytes);
        assert.equal(sha(actual), pin.sha256);
      }
      downloadCount++;
    }
    const names = [];
    function visit(dir, prefix = "") {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name),
          relative = prefix ? `${prefix}/${name}` : name;
        if (statSync(full).isDirectory()) visit(full, relative);
        else names.push(relative);
      }
    }
    visit(join(dist, "observations/files"));
    assert.deepEqual(names.sort(), expected);
  },
);
check(
  "full edition, selected financial groups and all-history downloads equal the exact model exports",
  () => {
    for (const e of input.registry.editions) {
      const p = observationProjection(input, e.id);
      for (const format of ["json", "csv"]) {
        const expected = observationExport(input, {
          editionId: e.id,
          filter: { entityIds: [], measureIds: [], state: "all" },
          format,
        });
        const actual = bytes(
          `${observationEditionHref(e.id)}observations.${format}`,
        );
        assert.equal(actual.toString("utf8"), expected.body);
        assert.equal(actual.byteLength, expected.bytes);
        assert.equal(sha(actual), expected.sha256);
        downloadCount++;
      }
      for (const selection of observationGroupSelections(p))
        for (const format of ["json", "csv"]) {
          const expected = observationExport(input, {
            editionId: e.id,
            filter: {
              entityIds: selection.entityIds,
              measureIds: [],
              state: "all",
            },
            format,
          });
          const actual = bytes(
            `${observationEditionHref(e.id)}groups/${selection.id}/observations.${format}`,
          );
          assert.equal(actual.toString("utf8"), expected.body);
          assert.equal(sha(actual), expected.sha256);
          if (format === "json") {
            const parsed = JSON.parse(expected.body);
            assert.equal(parsed.privateOriginals, "not-included");
            assert.deepEqual(
              parsed.selection.filter.entityIds,
              selection.entityIds,
            );
          }
          downloadCount++;
        }
    }
    const history = observationHistoryExport(input),
      actual = bytes("/observations/history.json");
    assert.equal(actual.toString("utf8"), history.body);
    assert.equal(actual.byteLength, history.bytes);
    assert.equal(sha(actual), history.sha256);
    assert.equal(JSON.parse(history.body).history, "complete-public-history");
    downloadCount++;
  },
);
check(
  "every source-version page retains exact byte identity, reuse limits and inert public-text offers",
  () => {
    for (const pin of input.registry.records.filter(
      (r) => r.kind === "source",
    )) {
      const edition = input.registry.editions.find((e) =>
        observationProjection(input, e.id).sources.some(
          (s) => s.id === pin.id && s.version === pin.version,
        ),
      );
      assert.ok(edition);
      const p = observationProjection(input, edition.id),
        s = observationPinned(p.sources, pin),
        path = observationSourceHref(s.id, s.version),
        doc = html(path);
      head(doc, path);
      includes(doc, s.title);
      includes(doc, s.rawSha256);
      includes(doc, s.rawBytes);
      includes(doc, s.retrievedAt);
      includes(doc, s.hash);
      assert.ok(links(doc).includes(s.url));
      const blob =
        s.payload.kind === "external-document"
          ? s.payload.publicExcerpt
          : s.payload.raw;
      if (blob) {
        assert.ok(
          links(doc).includes(href(`/observations/files/${blob.path}`)),
        );
        assert.equal(
          sha(bytes(`/observations/files/${blob.path}`)),
          blob.sha256,
        );
      }
      if (s.payload.kind === "external-document")
        includes(doc, "audit opinion does not independently audit Charitology");
      if (s.rights.publicReuse.kind === "publisher-default-inference")
        includes(doc, "independent human rights review pending");
      sourceCount++;
    }
  },
);
check(
  "organization comparison and contextual views retain bounded scope, mismatch reasons and no worldwide inference",
  () => {
    const doc = html("/tools/compare-tool/"),
      component = find(
        doc,
        (n) => attr(n, "data-organization-comparison") !== undefined,
      );
    assert.ok(component);
    includes(component, "Different balance-sheet dates");
    includes(component, "Expense definitions differ");
    includes(component, "literal period start is unknown");
    includes(component, "No overall score");
    const data = JSON.parse(
      text(find(component, (n) => attr(n, "data-org-data") !== undefined)),
    );
    assert.ok(data.choices.some((c) => c.scopeId === null));
    for (const s of current.scopes.filter(
      (s) => s.scopeKind === "consolidated-reporting-group",
    ))
      for (const o of current.observations.filter((o) => o.scope.id === s.id)) {
        const card = find(
          component,
          (n) => attr(n, "data-observation-id") === o.id,
        );
        assert.ok(card);
        assert.equal(attr(card, "data-observation-hash"), o.hash);
        includes(card, observationFact(current, o).valueText);
      }
    for (const path of [
      "/programs/cause-census/",
      "/record/cause-atlas/",
      "/record/gap-map/",
    ])
      assert.ok(links(html(path)).includes(href("/observations/")));
    assert.doesNotMatch(
      raw("/tools/compare-tool/"),
      /A missing figure means nobody has measured it/,
    );
  },
);
check(
  "initial source coverage, historical country compatibility and eight audit facts retain their exact bounded claims",
  () => {
    const initial = observationProjection(input, input.registry.editions[0].id),
      legacy = JSON.parse(
        readFileSync(join(root, "src/data/countries.json"), "utf8"),
      );
    assert.equal(
      sha(readFileSync(join(root, "src/data/countries.json"))),
      "8f4a71e525a8b7765691f211b7d94a6d4fed02746a19060b88f196d137f74543",
    );
    const firstCountries = legacyCountriesProjection(initial);
    assert.equal(firstCountries.countries.length, 217);
    // The current projection orders ISO IDs; the historical file orders names.
    // Compare every unchanged row/field by stable identity, not presentation order.
    const byId = (rows) =>
      [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    assert.equal(new Set(firstCountries.countries.map((c) => c.id)).size, 217);
    assert.equal(new Set(legacy.countries.map((c) => c.id)).size, 217);
    assert.deepEqual(byId(firstCountries.countries), byId(legacy.countries));
    assert.deepEqual(
      firstCountries.indicators.map((i) => i.id),
      legacy.indicators.map((i) => i.id),
    );
    const countryCells = initial.coverage
      .filter((c) => c.selection.kind === "country-latest-window")
      .flatMap((c) => c.cells);
    assert.equal(countryCells.length, 1085);
    assert.equal(
      countryCells.filter((c) => c.state === "present").length,
      1050,
    );
    assert.equal(countryCells.filter((c) => c.state === "missing").length, 35);
    const pdfs = {
      "0560f7324670b44dcd89a8505f8fef398a5e73487bb80870796f784e624739ef": {
        scale: "1",
        stock: "2024-06-30",
        values: {
          assets: ["286,759,938", "286759938"],
          liabilities: ["15,204,548", "15204548"],
          "net-assets": ["271,555,390", "271555390"],
          expenses: ["178,471,109", "178471109"],
        },
      },
      "3858a38150a0672425893ccf1cfa708f180dc62a3d3e272096aac7f895765d1d": {
        scale: "1000",
        stock: "2024-12-31",
        values: {
          assets: ["289,426", "289426000"],
          liabilities: ["21,895", "21895000"],
          "net-assets": ["267,531", "267531000"],
          expenses: ["183,889", "183889000"],
        },
      },
    };
    const financial = initial.observations.filter(
      (o) => o.reported.parser === "printed-integer-v1",
    );
    assert.equal(financial.length, 8);
    for (const o of financial) {
      const f = observationFact(initial, o),
        expected = pdfs[f.source.rawSha256];
      assert.ok(expected);
      assert.deepEqual(
        [o.reported.token, f.valueText],
        expected.values[f.measure.family],
      );
      assert.equal(f.scaleText, expected.scale);
      assert.equal(o.precision.kind, "reported-quantum");
      assert.equal(o.uncertainty, null);
      if (f.measure.family !== "expenses") {
        assert.equal(o.period.kind, "stock-day");
        assert.equal(o.period.day, expected.stock);
      } else if (expected.scale === "1000") {
        assert.equal(o.period.kind, "year-ended");
        assert.equal(o.period.end, "2024-12-31");
        assert.equal(o.period.literalStart, null);
      } else {
        assert.equal(o.period.kind, "closed-interval");
        assert.equal(o.period.start, "2023-07-01");
        assert.equal(o.period.end, "2024-06-30");
      }
    }
  },
);
console.log(
  `${groups} actual observation build groups passed: ${countryCount} current country routes, ${sourceCount} source-version pages and ${downloadCount} exact downloaded artifacts; no browser/live/human-review claim.`,
);
