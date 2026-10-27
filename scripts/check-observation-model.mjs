import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import * as m from "../src/lib/observation-model.mjs";
import {
  fictionalObservationFiles,
  rewriteFixture,
} from "../test-fixtures/observations/factory.mjs";
let groups = 0;
const test = (name, fn) => {
  fn();
  groups++;
  console.log(`✓ ${name}`);
};
const reject = (fn) =>
  assert.throws(fn, (e) => e instanceof m.ObservationError);
const files = fictionalObservationFiles();
const handle = m.validateObservationFiles(files);
const projection = m.observationProjection(handle, handle.registry.current.id);
const all = { entityIds: [], measureIds: [], state: "all" };
test("Actual type-only DTO and model declaration modules compile strict with zero diagnostics", () => {
  const require = createRequire(import.meta.url),
    ts = require("typescript");
  const root = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
  );
  const options = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    types: [],
  };
  const program = ts.createProgram(
    [
      path.join(root, "src/lib/observation-types.ts"),
      path.join(root, "src/lib/observation-model.d.mts"),
    ],
    options,
  );
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnostics(diagnostics, {
      getCurrentDirectory: () => root,
      getCanonicalFileName: (f) => f,
      getNewLine: () => "\n",
    }),
  );
});
const editionPath = Object.keys(files).find((p) => p.startsWith("editions/"));
const mutate = (fn) => rewriteFixture(files, fn);
test("Fictional complete five-series graph admits all present and missing cells", () => {
  assert.equal(projection.entities.length, 2);
  assert.equal(projection.observations.length, 9);
  assert.equal(
    projection.coverage.reduce((n, c) => n + c.cells.length, 0),
    10,
  );
  assert.equal(
    projection.coverage
      .flatMap((c) => c.cells)
      .filter((c) => c.state === "missing").length,
    1,
  );
});
test("Exact decimal normalization, source lexemes, scale, overflow and zero", () => {
  assert.deepEqual(m.observationDecimalFromLexeme("83.0512195121951"), {
    coefficient: "830512195121951",
    exponent: -13,
  });
  assert.deepEqual(m.observationDecimalFromLexeme("-0.000e8"), {
    coefficient: "0",
    exponent: 0,
  });
  assert.equal(
    m.observationDecimalText(
      m.observationScaledDecimal("183889", { coefficient: "1", exponent: 3 }),
    ),
    "183889000",
  );
  for (const token of [
    "+1",
    "01",
    "1.",
    "1e99999",
    "1e-19",
    "1".repeat(39),
    "NaN",
    "1_000",
  ])
    reject(() => m.observationDecimalFromLexeme(token));
});
test("Lossless JSON captures exact numeric tokens before ordinary numeric projection", () => {
  const parsed = m.observationJsonTokens(
    '{"v":83.0512195121951,"zero":-0.0,"a":[1e2]}',
  );
  assert.equal(parsed.tokens.get("/v"), "83.0512195121951");
  assert.equal(parsed.tokens.get("/zero"), "-0.0");
  assert.equal(parsed.tokens.get("/a/0"), "1e2");
});
test("Fatal UTF8, BOM, duplicate escaped keys, malformed surrogate and trailing input refusal", () => {
  for (const raw of [
    new Uint8Array([255]),
    "\ufeff{}",
    '{"a":1,"\\u0061":2}',
    '{"s":"\\ud800"}',
    '{"x":1} trailing',
    "[1,]",
    '{"a":}',
    "[1e9999]",
  ])
    reject(() => m.strictObservationJson(raw));
});
test("Depth32 is admitted and depth33 refused", () => {
  const value = "[".repeat(32) + "0" + "]".repeat(32);
  assert.ok(m.strictObservationJson(value));
  reject(() => m.strictObservationJson("[" + value + "]"));
});
test("Direct accessors, decorated sparse arrays, hidden fields and caller hooks are not invoked", () => {
  let calls = 0;
  const a = [];
  Object.defineProperty(a, "0", {
    get() {
      calls++;
      return 1;
    },
    enumerable: true,
  });
  const obj = {};
  Object.defineProperty(obj, "x", {
    get() {
      calls++;
      return 1;
    },
    enumerable: true,
  });
  const hidden = {};
  Object.defineProperty(hidden, "x", { value: 1 });
  for (const v of [
    obj,
    a,
    hidden,
    new Array(2),
    Object.assign([], { hidden: 1 }),
    Object.create({ x: 1 }),
  ])
    reject(() => m.canonicalObservationJson(v));
  assert.equal(calls, 0);
});
test("Binary PDF bytes hash without UTF8 decoding, text parsers refuse them", () => {
  const binary = new Uint8Array([0x25, 0x50, 0x44, 0x46, 255, 0]);
  assert.match(m.observationRawHash(binary), /^[a-f0-9]{64}$/);
  reject(() => m.strictObservationJson(binary));
});
test("Unknown, orphan, missing and traversal files refuse complete admission", () => {
  reject(() =>
    m.validateObservationFiles({ ...files, "../escape.json": "{}" }),
  );
  reject(() =>
    m.validateObservationFiles({
      ...files,
      ["raw/" + "a".repeat(64) + ".json"]: "{}",
    }),
  );
  const missing = { ...files };
  delete missing[editionPath];
  reject(() => m.validateObservationFiles(missing));
});
test("Stored source/record byte tampering and duplicate decoded JSON keys refuse", () => {
  const p = Object.keys(files).find((p) => p.startsWith("observations/"));
  reject(() => m.validateObservationFiles({ ...files, [p]: files[p] + " " }));
  reject(() =>
    m.validateObservationFiles({
      ...files,
      "registry.json": files["registry.json"].replace(
        '"version": 1',
        '"version": 1, "version": 1',
      ),
    }),
  );
});
test("Rehashed unknown properties and review authority refuse", () => {
  reject(() =>
    m.validateObservationFiles(
      mutate((o) => {
        o[editionPath].rating = 5;
      }),
    ),
  );
  reject(() =>
    m.validateObservationFiles(
      mutate((o) => {
        o["entities/country-aaa.v1.json"].review = "reviewed";
      }),
    ),
  );
});
test("No cached/source mutation and forged registry/projection handles refuse", () => {
  assert.ok(Object.isFrozen(handle.registry));
  assert.ok(Object.isFrozen(projection.observations[0].reported));
  assert.throws(() => {
    projection.observations[0].reported.token = "99";
  }, TypeError);
  reject(() =>
    m.observationProjection(
      structuredClone(handle),
      handle.registry.current.id,
    ),
  );
  reject(() => m.legacyCountriesProjection(structuredClone(projection)));
  const texts = m.observationFileTexts(handle);
  assert.ok(Object.isFrozen(texts));
});
test("Rehashed duplicate and omitted coverage cells fail finite denominator proof", () => {
  reject(() =>
    m.validateObservationFiles(
      mutate((o) => {
        const c = o["coverage/coverage-population.v1.json"];
        c.cells[1] = structuredClone(c.cells[0]);
      }),
    ),
  );
  reject(() =>
    m.validateObservationFiles(
      mutate((o) => {
        o["coverage/coverage-population.v1.json"].cells.pop();
      }),
    ),
  );
});
test("Rehashed observation decimal/token and latest year cannot diverge from source", () => {
  reject(() =>
    m.validateObservationFiles(
      mutate((o) => {
        o["observations/fact-aaa-population.v1.json"].reported.token = "10";
        o["observations/fact-aaa-population.v1.json"].value = {
          coefficient: "1",
          exponent: 1,
        };
      }),
    ),
  );
  reject(() =>
    m.validateObservationFiles(
      mutate((o) => {
        o["observations/fact-aaa-population.v1.json"].period.year = 2020;
      }),
    ),
  );
});
test("Missing six-row proof cannot become zero, omit a year or repeat a row", () => {
  reject(() =>
    m.validateObservationFiles(
      mutate((o) => {
        const c = o["coverage/coverage-basic-water-access.v1.json"].cells[1];
        c.sourceRefs.pop();
      }),
    ),
  );
  reject(() =>
    m.validateObservationFiles(
      mutate((o) => {
        const c = o["coverage/coverage-basic-water-access.v1.json"].cells[1];
        c.sourceRefs[1] = structuredClone(c.sourceRefs[0]);
      }),
    ),
  );
});
test("Bounds and annotations match exact retained producer note", () => {
  reject(() =>
    m.validateObservationFiles(
      mutate((o) => {
        o[
          "observations/fact-aaa-under-five-mortality.v1.json"
        ].uncertainty.lower = { coefficient: "9", exponent: 1 };
      }),
    ),
  );
  reject(() =>
    m.validateObservationFiles(
      mutate((o) => {
        o["observations/fact-aaa-population.v1.json"].annotations = [];
      }),
    ),
  );
});
test("Source-exact country IDs/labels/regions and normalized definitions retain meaning", () => {
  reject(() =>
    m.validateObservationFiles(
      mutate((o) => {
        o["entities/country-aaa.v1.json"].label = "Reinterpreted identity";
      }),
    ),
  );
  reject(() =>
    m.validateObservationFiles(
      mutate((o) => {
        o["entities/country-aaa.v1.json"].countryMetadata.producerRegionLabel =
          "Guessed region";
      }),
    ),
  );
  reject(() =>
    m.validateObservationFiles(
      mutate((o) => {
        o["measures/measure-life-expectancy.v1.json"].definition =
          "New meaning";
        o["measures/measure-life-expectancy.v1.json"].legacyCountry.definition =
          "New meaning";
      }),
    ),
  );
});
test("Unsafe URL literals and malformed Gregorian timestamps refuse after rehash", () => {
  for (const url of [
    "https://example.invalid\\@other.invalid/path",
    "https://user:pass@example.invalid/",
    "javascript:alert(1)",
    "https://example.invalid/\npath",
  ])
    reject(() =>
      m.validateObservationFiles(
        mutate((o) => {
          o["sources/country-metadata.v1.json"].url = url;
        }),
      ),
    );
  reject(() =>
    m.validateObservationFiles(
      mutate((o) => {
        o[editionPath].capturedAt = "2026-02-30T00:00:00.000Z";
      }),
    ),
  );
});
test("Filters preserve immutable records and report correct missing-only counts", () => {
  const result = m.observationExport(handle, {
    editionId: projection.edition.id,
    filter: { ...all, state: "missing" },
    format: "json",
  });
  assert.equal(result.includedObservations, 0);
  assert.equal(result.includedCoverageCells, 1);
  assert.equal(result.omittedObservations, 9);
  assert.equal(result.omittedCoverageCells, 9);
  const filtered = m.coverageProjection(projection, {
    ...all,
    state: "missing",
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].cells.length, 2);
  assert.equal(
    filtered[0].hash,
    projection.coverage.find((c) => c.id === "coverage-basic-water-access")
      .hash,
  );
  reject(() =>
    m.coverageProjection(projection, { ...all, entityIds: ["unknown"] }),
  );
});
test("JSON export retains whole factual closure and discloses broader raw context/private exclusions", () => {
  const full = m.observationExport(handle, {
      editionId: projection.edition.id,
      filter: all,
      format: "json",
    }),
    filtered = m.observationExport(handle, {
      editionId: projection.edition.id,
      filter: { ...all, entityIds: ["country-aaa"] },
      format: "json",
    });
  const a = JSON.parse(full.body),
    b = JSON.parse(filtered.body);
  assert.deepEqual(a.files, b.files);
  assert.equal(b.privateOriginals, "not-included");
  assert.equal(b.history, "pinned-links-only");
  assert.equal(filtered.includedObservations, 5);
  assert.equal(full.sha256, m.observationRawHash(full.body));
});
test("Normalized CSV has exact cells/dictionaries and preserves source/rights reconstruction", () => {
  const result = m.observationExport(handle, {
    editionId: projection.edition.id,
    filter: all,
    format: "csv",
  });
  const rows = parseCsv(result.body),
    header = rows.shift();
  const map = rows.map((c) =>
    Object.fromEntries(header.map((k, i) => [k, c[i]])),
  );
  assert.equal(header.length, 29);
  assert.equal(map.filter((r) => r.row_kind === "fact").length, 9);
  assert.equal(map.filter((r) => r.row_kind === "missing").length, 1);
  assert.equal(map.filter((r) => r.row_kind === "source").length, 12);
  assert.equal(map.filter((r) => r.row_kind === "rights").length, 12);
  for (const r of map.filter((r) => r.row_kind === "source")) {
    const p = JSON.parse(r.source_pin_json),
      rights = map.find(
        (x) =>
          x.row_kind === "rights" && x.source_pin_json === r.source_pin_json,
      );
    const source = {
      ...JSON.parse(r.source_metadata_json),
      rights: JSON.parse(rights.rights_json),
    };
    assert.equal(m.observationObjectHash(source), p.hash);
  }
});
test("Legacy API preserves zero versus absent and carries exact pinned metadata", () => {
  const legacy = m.legacyCountriesProjection(projection);
  assert.equal(Object.keys(legacy).length, 11);
  assert.equal(legacy.countries[1].values["SP.POP.TOTL"].value, 0);
  assert.ok(!Object.hasOwn(legacy.countries[1].values, "SH.H2O.BASW.ZS"));
  assert.equal(legacy.indicators[1].id, "SP.DYN.LE00.IN");
  assert.equal(legacy.retrieved, "2026-10-27");
  assert.ok(Object.isFrozen(legacy.countries[0].values));
});
test("Comparison rejects same aliases, handles unknown coverage and returns no arithmetic", () => {
  reject(() =>
    m.compareOrganizations(
      projection,
      [
        {
          kind: "scope",
          scope: {
            kind: "scope",
            id: "national-aaa",
            version: 1,
            hash: projection.scopes[0].hash,
          },
        },
        {
          kind: "scope",
          scope: {
            kind: "scope",
            id: "national-aaa",
            version: 1,
            hash: projection.scopes[0].hash,
          },
        },
      ],
      ["population"],
    ),
  );
  const result = m.compareOrganizations(
    projection,
    [
      { kind: "ein", ein: "000000001" },
      { kind: "ein", ein: "000000002" },
    ],
    ["assets"],
  );
  assert.equal(result.rows[0].alignment, "not-collected");
  assert.deepEqual(result.rows[0].reasons, ["not-collected"]);
  assert.ok(
    !/"(?:ratio|difference|winner|score|rank)":/.test(JSON.stringify(result)),
  );
});
test("All-history export contains exact registry and immutable file inventory", () => {
  const out = m.observationHistoryExport(handle),
    archive = JSON.parse(out.body);
  assert.equal(archive.scope, "history");
  assert.equal(archive.history, "complete-public-history");
  assert.equal(archive.files.length, Object.keys(files).length);
  assert.equal(
    archive.files.find((f) => f.path === "registry.json").text,
    files["registry.json"],
  );
});
test("Whole input and structural object byte admission fail before partial acceptance", () => {
  reject(() =>
    m.strictObservationJson(
      " ".repeat(m.OBSERVATION_LIMITS.structuredObjectBytes + 1),
    ),
  );
  reject(() =>
    m.validateObservationFiles({
      ...files,
      "registry.json": " ".repeat(
        m.OBSERVATION_LIMITS.structuredObjectBytes + 1,
      ),
    }),
  );
});
test("Fictional financial packet facts retain scope/date/scale and unknown metadata", () => {
  const h = m.validateObservationFiles(
      fictionalObservationFiles({ financial: true }),
    ),
    p = m.observationProjection(h, h.registry.current.id);
  assert.equal(
    p.observations.filter((o) => o.reported.parser === "printed-integer-v1")
      .length,
    8,
  );
  const a = p.observations.find((o) => o.id === "alpha-assets"),
    b = p.observations.find((o) => o.id === "beta-assets");
  assert.equal(
    m.observationDecimalText(a.value),
    m.observationDecimalText(b.value),
  );
  assert.deepEqual(b.precision.quantum, { coefficient: "1", exponent: 3 });
  assert.equal(a.producerStatus, null);
  assert.equal(
    p.observations.find((o) => o.id === "beta-expenses").period.literalStart,
    null,
  );
  const comparison = m.compareOrganizations(
    p,
    [
      { kind: "ein", ein: "000000001" },
      { kind: "profile", slug: "beta-foundation" },
    ],
    ["assets", "expenses"],
  );
  assert.equal(comparison.rows[0].alignment, "same-definition");
  assert.ok(comparison.rows[0].reasons.includes("different-stock-day"));
  assert.ok(comparison.rows[0].reasons.includes("different-reporting-quantum"));
  assert.ok(
    !comparison.rows[0].reasons.includes("different-consolidation-boundary"),
  );
  assert.equal(comparison.rows[1].alignment, "related-definitions");
  assert.ok(
    comparison.rows[1].reasons.includes("literal-interval-start-unknown"),
  );
  reject(() =>
    m.compareOrganizations(
      p,
      [
        { kind: "ein", ein: "000000001" },
        { kind: "profile", slug: "alpha-foundation" },
      ],
      ["assets"],
    ),
  );
});
test("Financial asserted locator/token/parser/scale is unique and raw-document bound after full rehash", () => {
  const finance = fictionalObservationFiles({ financial: true });
  reject(() =>
    m.validateObservationFiles(
      rewriteFixture(finance, (o) => {
        o["observations/alpha-assets.v1.json"].reported.token = "999";
        o["observations/alpha-assets.v1.json"].value = {
          coefficient: "999",
          exponent: 0,
        };
      }),
    ),
  );
  reject(() =>
    m.validateObservationFiles(
      rewriteFixture(finance, (o) => {
        const packet = Object.values(o).find(
          (v) => v.format === "charitology-financial-transcription",
        );
        packet.documentSha256 = "b".repeat(64);
      }),
    ),
  );
  reject(() =>
    m.validateObservationFiles(
      rewriteFixture(finance, (o) => {
        const packet = Object.values(o).find(
          (v) => v.format === "charitology-financial-transcription",
        );
        packet.assertions.push({
          ...structuredClone(packet.assertions[0]),
          id: "duplicate-locator",
        });
      }),
    ),
  );
});
test("Entity/EIN/group scope membership cannot silently change after full rehash", () => {
  const finance = fictionalObservationFiles({ financial: true });
  reject(() =>
    m.validateObservationFiles(
      rewriteFixture(finance, (o) => {
        o["entities/alpha-group.v1.json"].identifiers = [
          { kind: "ein", value: "000000001", sourceRefs: [] },
        ];
      }),
    ),
  );
  reject(() =>
    m.validateObservationFiles(
      rewriteFixture(finance, (o) => {
        o["scopes/alpha-consolidated.v1.json"].includedEntities = [
          {
            kind: "entity",
            id: "beta-legal",
            version: 1,
            hash: o["entities/beta-legal.v1.json"].hash,
          },
        ];
      }),
    ),
  );
});
test("Explicit second edition preserves complete immutable history and current choice", () => {
  const next = appendEdition(files),
    h = m.validateObservationFiles(next),
    p = m.observationProjection(h, h.registry.current.id);
  assert.equal(h.registry.editions.length, 2);
  assert.equal(p.edition.id, "synthetic-second");
  for (const [path, text] of Object.entries(files))
    if (path !== "registry.json")
      assert.equal(m.observationFileTexts(h)[path], text);
  assert.equal(
    m.observationProjection(h, "synthetic-initial").edition.id,
    "synthetic-initial",
  );
  const old = m.observationExport(h, {
    editionId: "synthetic-initial",
    filter: all,
    format: "json",
  });
  assert.ok(
    !JSON.parse(old.body).files.some(
      (f) => f.path === "editions/synthetic-second.json",
    ),
  );
  const reg = JSON.parse(next["registry.json"]);
  reg.current = reg.editions[0];
  reg.hash = m.observationObjectHash(reg);
  next["registry.json"] = m.observationPrettyJson(reg);
  reject(() => m.validateObservationFiles(next));
});
test("Proxies and byte-array hooks are refused or ignored without running caller code", () => {
  let calls = 0;
  const proxy = new Proxy(
    {},
    {
      ownKeys() {
        calls++;
        return [];
      },
      getPrototypeOf() {
        calls++;
        return Object.prototype;
      },
    },
  );
  reject(() => m.validateObservationFiles(proxy));
  reject(() => m.canonicalObservationJson(proxy));
  const bytes = new Uint8Array([1, 2, 3]);
  Object.defineProperty(bytes, "valueOf", {
    get() {
      calls++;
      throw Error("hook");
    },
  });
  m.observationRawHash(bytes);
  assert.equal(calls, 0);
});
test("Canonical inventory order and unknown orphan records fail even with updated registry hashes", () => {
  const reg = JSON.parse(files["registry.json"]);
  reg.files.reverse();
  reg.hash = m.observationObjectHash(reg);
  reject(() =>
    m.validateObservationFiles({
      ...files,
      "registry.json": m.observationPrettyJson(reg),
    }),
  );
  reject(() =>
    m.validateObservationFiles(
      mutate((o) => {
        o[editionPath].records = o[editionPath].records.filter(
          (p) => p.id !== "synthetic-terms",
        );
      }),
    ),
  );
});
test("Selected closure byte ceiling wins over individually valid source counts", () => {
  const inflated = mutate((objects) => {
    for (let i = 0; i < 54; i++) {
      const source = {
        format: "charitology-observation-record",
        schemaVersion: 1,
        kind: "source",
        id: `extra-source-${i}`,
        version: 1,
        previous: null,
        url: `https://example.invalid/extra-${i}`,
        publisher: "Fictional producer",
        title: "Fictional extra source",
        retrievedAt: "2026-10-27T00:00:00.000Z",
        sourceUpdatedDay: null,
        reportDay: null,
        publishedAt: null,
        rawSha256: m.observationRawHash("synthetic " + i),
        rawBytes: 12,
        payload: {
          kind: "external-document",
          mediaType: "text/html",
          publicExcerpt: null,
        },
        producerMetadata: Array.from({ length: 20 }, (_, n) => ({
          field: "synthetic-" + n,
          literal: "x".repeat(8192),
        })),
        rights: {
          returnedLicense: null,
          publicReuse: {
            kind: "linked-document-only",
            note: "Fictional input for capacity test.",
          },
          attribution: "Synthetic",
          originalProducerCredit: "Synthetic",
          limitations: [],
        },
        limitations: [],
        review: "draft",
      };
      source.hash = m.observationObjectHash(source);
      objects[`sources/${source.id}.v1.json`] = source;
      objects[editionPath].records.push({
        kind: source.kind,
        id: source.id,
        version: 1,
        hash: source.hash,
      });
    }
    objects[editionPath].records.sort((a, b) =>
      a.kind < b.kind
        ? -1
        : a.kind > b.kind
          ? 1
          : a.id < b.id
            ? -1
            : a.id > b.id
              ? 1
              : a.version - b.version,
    );
  });
  assert.throws(
    () => m.validateObservationFiles(inflated),
    (e) =>
      e instanceof m.ObservationError &&
      /Selected factual closure byte limit/.test(e.message),
  );
});
test("Actual source date and returned-license fields cannot be invented by a rehashed record", () => {
  reject(() =>
    m.validateObservationFiles(
      mutate((o) => {
        o["sources/country-metadata.v1.json"].sourceUpdatedDay = "2026-10-25";
      }),
    ),
  );
  reject(() =>
    m.validateObservationFiles(
      mutate((o) => {
        o["sources/country-metadata.v1.json"].rights.returnedLicense =
          "CC BY 4.0";
      }),
    ),
  );
});
test("CSV neutralizes actual source-derived formula text while JSON retains exact source bytes", () => {
  const f = fictionalObservationFiles({ unsafeDefinition: true }),
    h = m.validateObservationFiles(f),
    p = m.observationProjection(h, h.registry.current.id);
  const csv = m.observationExport(h, {
      editionId: p.edition.id,
      filter: all,
      format: "csv",
    }),
    rows = parseCsv(csv.body),
    head = rows.shift(),
    definitionIndex = head.indexOf("definition");
  assert.ok(rows.some((r) => r[definitionIndex].startsWith("'\t =HYPERLINK")));
  const json = m.observationExport(h, {
    editionId: p.edition.id,
    filter: all,
    format: "json",
  });
  assert.ok(
    JSON.parse(json.body).files.some((file) => file.text.includes("HYPERLINK")),
  );
  assert.ok(
    p.measures
      .find((x) => x.family === "life-expectancy")
      .definition.startsWith("\t ="),
  );
});
function appendEdition(original) {
  const next = { ...original },
    registry = JSON.parse(next["registry.json"]),
    initial = JSON.parse(next[editionPath]);
  const edition = {
    ...initial,
    id: "synthetic-second",
    sequence: 2,
    capturedAt: "2026-10-28T00:00:00.000Z",
    supersedes: registry.current,
  };
  edition.hash = m.observationObjectHash(edition);
  next["editions/synthetic-second.json"] = m.observationPrettyJson(edition);
  const pin = { id: edition.id, sequence: 2, hash: edition.hash };
  registry.editions.push(pin);
  registry.current = pin;
  registry.files = Object.keys(next)
    .filter((p) => p !== "registry.json")
    .sort()
    .map((path) => ({
      path,
      sha256: m.observationRawHash(next[path]),
      bytes: Buffer.byteLength(next[path]),
    }));
  registry.hash = m.observationObjectHash(registry);
  next["registry.json"] = m.observationPrettyJson(registry);
  return next;
}
function parseCsv(text) {
  let field = "",
    row = [],
    rows = [],
    quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quote = false;
      else field += c;
    } else if (c === '"') quote = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r" && text[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else field += c;
  }
  assert.equal(quote, false);
  return rows;
}
test("Rehashed country scale/precision and printed quantum cannot invent numeric meaning", () => {
  reject(() =>
    m.validateObservationFiles(
      mutate((o) => {
        const r = o["observations/fact-aaa-life-expectancy.v1.json"];
        r.reported.scale = { coefficient: "1", exponent: 1 };
        r.value = m.observationScaledDecimal(
          r.reported.token,
          r.reported.scale,
        );
      }),
    ),
  );
  reject(() =>
    m.validateObservationFiles(
      mutate((o) => {
        const r = o["observations/fact-aaa-population.v1.json"];
        r.precision = {
          kind: "reported-quantum",
          quantum: { coefficient: "1", exponent: 0 },
          sourceRefs: [r.reported.valueRef],
        };
      }),
    ),
  );
  reject(() =>
    m.validateObservationFiles(
      rewriteFixture(fictionalObservationFiles({ financial: true }), (o) => {
        o["observations/beta-assets.v1.json"].precision.quantum = {
          coefficient: "1",
          exponent: 0,
        };
      }),
    ),
  );
});
test("Missing row proofs retain explicit source identity/year matches", () => {
  reject(() =>
    m.validateObservationFiles(
      mutate((o) => {
        o[
          "coverage/coverage-basic-water-access.v1.json"
        ].cells[1].sourceRefs[0].locator.matches = [];
      }),
    ),
  );
});
test("Shared/resizable input bytes and callback-bearing limit values refuse before copying", () => {
  reject(() => m.observationRawHash(new Uint8Array(new SharedArrayBuffer(4))));
  reject(() =>
    m.observationRawHash(
      new Uint8Array(new ArrayBuffer(4, { maxByteLength: 8 })),
    ),
  );
  let calls = 0;
  reject(() =>
    m.strictObservationJson("{}", {
      valueOf() {
        calls++;
        return 5;
      },
    }),
  );
  assert.equal(calls, 0);
});
console.log(`${groups} observation model groups passed.`);
