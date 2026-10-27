// Entirely fictional in-memory source graph. No real accounts, retrievals or source claims.
import * as m from "../../src/lib/observation-model.mjs";
const at = "2026-10-27T00:00:00.000Z",
  p = (r) => ({ kind: r.kind, id: r.id, version: r.version, hash: r.hash });
const codeRows = [
  ["population", "SP.POP.TOTL", "population-count", "count"],
  ["life-expectancy", "SP.DYN.LE00.IN", "period-duration", "duration"],
  ["under-five-mortality", "SH.DYN.MORT", "rate", "rate"],
  ["electricity-access", "EG.ELC.ACCS.ZS", "rate", "rate"],
  ["basic-water-access", "SH.H2O.BASW.ZS", "rate", "rate"],
];
export function fictionalObservationFiles({
  financial = false,
  unsafeDefinition = false,
} = {}) {
  const records = [],
    files = {},
    rights = {
      returnedLicense: null,
      publicReuse: {
        kind: "linked-document-only",
        note: "Fictional source evidence for executable tests only.",
      },
      attribution: "Synthetic fixture",
      originalProducerCredit: "Synthetic fixture",
      limitations: [],
    };
  const raw = (text, dir = "raw", mediaType = "application/json") => {
    const sha256 = m.observationRawHash(text),
      path = `${dir}/${sha256}.${mediaType === "text/plain" ? "txt" : "json"}`;
    files[path] = text;
    return { path, sha256, bytes: Buffer.byteLength(text), mediaType };
  };
  const record = (kind, id, data) => {
    const r = {
      format: "charitology-observation-record",
      schemaVersion: 1,
      kind,
      id,
      version: 1,
      previous: null,
      ...data,
    };
    r.hash = m.observationObjectHash(r);
    records.push(r);
    return r;
  };
  const tail = { sourceRefs: [], limitations: [], review: "draft" };
  const source = (id, text, adapter, extra = {}) => {
    const blob = raw(text);
    return record("source", id, {
      url: `https://example.invalid/${id}`,
      publisher: "Fictional producer",
      title: id,
      retrievedAt: at,
      sourceUpdatedDay: "2026-10-26",
      reportDay: null,
      publishedAt: null,
      rawSha256: blob.sha256,
      rawBytes: blob.bytes,
      payload: { kind: "public-json", raw: blob, adapter },
      producerMetadata: [],
      rights,
      limitations: [],
      review: "draft",
      ...extra,
    });
  };
  const termsBlob = raw("Fictional permission\n", "raw", "text/plain"),
    terms = record("source", "synthetic-terms", {
      url: "https://example.invalid/terms",
      publisher: "Fictional producer",
      title: "Synthetic terms",
      retrievedAt: at,
      sourceUpdatedDay: null,
      reportDay: null,
      publishedAt: null,
      rawSha256: termsBlob.sha256,
      rawBytes: termsBlob.bytes,
      payload: { kind: "public-text-evidence", raw: termsBlob },
      producerMetadata: [],
      rights,
      limitations: [],
      review: "draft",
    });
  const evidence = {
    source: p(terms),
    role: "rights",
    locator: {
      kind: "text",
      section: ["Fictional terms"],
      excerpt: "Fictional permission",
    },
  };
  const publicRights = {
    ...rights,
    publicReuse: {
      kind: "explicit-license",
      label: "Fixture-only permission",
      termsUrl: "https://example.invalid/terms",
      evidence: [evidence],
    },
  };
  const countries = [
    {
      id: "AAA",
      iso2Code: "AA",
      name: "Fictional Alpha",
      region: { id: "TST", value: "Synthetic region" },
    },
    {
      id: "BBB",
      iso2Code: "BB",
      name: "Fictional Beta",
      region: { id: "TST", value: "Synthetic region" },
    },
  ];
  const header = (n) => ({
    page: 1,
    pages: 1,
    total: n,
    lastupdated: "2026-10-26",
  });
  const meta = source(
    "country-metadata",
    JSON.stringify([header(2), countries]),
    "world-bank-country-v1",
    { rights: publicRights },
  );
  const entities = countries.map((c, i) =>
    record("entity", `country-${c.id.toLowerCase()}`, {
      entityKind: "country-economy",
      label: c.name,
      identifiers: [
        ["iso2", c.iso2Code],
        ["iso3", c.id],
        ["producer-country", c.iso2Code],
      ].map(([kind, value]) => ({ kind, value, sourceRefs: [] })),
      aliases: [],
      memberEntities: [],
      profileRefs: [],
      countryMetadata: {
        producerRegionId: c.region.id,
        producerRegionLabel: c.region.value,
      },
      ...tail,
    }),
  );
  const scopes = entities.map((e) =>
    record("scope", `national-${e.id.slice(8)}`, {
      entity: p(e),
      scopeKind: "national-statistics",
      label: "Synthetic national scope",
      includedEntities: [p(e)],
      consolidation: "not-applicable",
      geography: { kind: "country-economy", entity: p(e) },
      exclusions: [],
      ...tail,
    }),
  );
  const coverages = [];
  for (const [family, code, measureKind, unitKind] of codeRows) {
    const definition =
        unsafeDefinition && family === "life-expectancy"
          ? '\t =HYPERLINK("https://example.invalid/","fixture")'
          : `Fictional definition of ${family}.`,
      organization = "Fictional statistical producer";
    const metadata = source(
      "metadata-" + family,
      JSON.stringify([
        header(1),
        [
          {
            id: code,
            sourceNote: definition,
            sourceOrganization: organization,
          },
        ],
      ]),
      "world-bank-indicator-v1",
      { rights: publicRights },
    );
    const values = [];
    const tokens = new Map();
    for (const [ci, c] of countries.entries())
      for (let year = 2025; year >= 2020; year--) {
        const selected =
          year === 2024 && !(ci === 1 && family === "basic-water-access");
        let value = null,
          footnote = "";
        if (selected) {
          value = "EXACT_TOKEN_" + values.length;
          const token =
            ci === 1
              ? "0"
              : family === "life-expectancy"
                ? "83.0512195121951"
                : family === "under-five-mortality"
                  ? "64.5"
                  : family === "population"
                    ? "123456789"
                    : "42.25";
          tokens.set(value, token);
          if (family === "population")
            footnote = "Fictional population annotation";
          if (family === "under-five-mortality")
            footnote = `Uncertainty bound is ${ci === 1 ? "0" : "50.6"} - ${ci === 1 ? "0" : "81.8"}`;
        }
        values.push({
          indicator: { id: code, value: family },
          country: { id: c.iso2Code, value: c.name },
          countryiso3code: c.id,
          date: String(year),
          value,
          unit: "",
          obs_status: "",
          decimal: 0,
          footnote,
        });
      }
    let body = JSON.stringify([header(values.length), values]);
    for (const [marker, token] of tokens)
      body = body.replace(JSON.stringify(marker), token);
    const sourceValues = source(
      "values-" + family,
      body,
      "world-bank-values-v1",
      { rights: publicRights },
    );
    const unit =
      unitKind === "rate"
        ? {
            kind: "rate",
            label:
              family === "under-five-mortality"
                ? "per 1,000 live births"
                : "percent",
            denominator: {
              label: "Fictional denominator",
              definition: "Fictional denominator definition",
              scale: {
                coefficient: "1",
                exponent: family === "under-five-mortality" ? 3 : 2,
              },
            },
          }
        : {
            kind: unitKind,
            label: unitKind === "count" ? "people" : "years",
            denominator: null,
          };
    const measure = record("measure", "measure-" + family, {
      label: family,
      measureKind,
      family,
      producerCode: code,
      definition,
      unit,
      method: "Latest non-null 2020–2025",
      legacyCountry: {
        id: code,
        label: family,
        unit: unit.label,
        note: "Fictional context, no need inference.",
        indicatorUrl: `https://example.invalid/indicator/${code}`,
        queryUrl: `https://example.invalid/values/${code}`,
        definition,
        organization,
      },
      ...tail,
    });
    const cells = [];
    for (const [ci, e] of entities.entries()) {
      const candidates = values
        .map((row, index) => ({ row, index }))
        .filter((x) => x.row.countryiso3code === countries[ci].id);
      const ref = (index, field) => ({
        source: p(sourceValues),
        role: field === "footnote" ? "annotation" : "value",
        locator: {
          kind: "json",
          pointer: `/1/${index}/${field}`,
          matches: [
            ["country/id", countries[ci].iso2Code],
            ["countryiso3code", countries[ci].id],
            ["indicator/id", code],
            ["date", values[index].date],
          ].map(([suffix, value]) => ({
            pointer: `/1/${index}/${suffix}`,
            expected: { kind: "string", value },
          })),
        },
      });
      const chosen = candidates.find((x) => x.row.value !== null);
      if (!chosen) {
        cells.push({
          state: "missing",
          entity: p(e),
          scope: p(scopes[ci]),
          measure: p(measure),
          reason: "producer-null-throughout-window",
          sourceRefs: candidates.map((x) => ref(x.index, "value")),
        });
        continue;
      }
      const token = tokens.get(chosen.row.value),
        note = chosen.row.footnote;
      const uncertainty =
        family === "under-five-mortality"
          ? {
              kind: "producer-reported-bounds",
              lower: m.observationDecimalFromLexeme(ci === 1 ? "0" : "50.6"),
              upper: m.observationDecimalFromLexeme(ci === 1 ? "0" : "81.8"),
              confidence: null,
              verbatimNote: note,
              sourceRef: ref(chosen.index, "footnote"),
              parser: "world-bank-mortality-bound-v1",
            }
          : null;
      const obs = record(
        "observation",
        `fact-${countries[ci].id.toLowerCase()}-${family}`,
        {
          entity: p(e),
          scope: p(scopes[ci]),
          measure: p(measure),
          period: { kind: "calendar-year", year: 2024 },
          reported: {
            token,
            parser: "json-number-v1",
            scale: { coefficient: "1", exponent: 0 },
            valueRef: ref(chosen.index, "value"),
          },
          value: m.observationDecimalFromLexeme(token),
          precision: { kind: "unknown" },
          uncertainty,
          producerStatus: "",
          producerUnit: "",
          producerDecimal: "0",
          annotations: note
            ? [{ verbatim: note, sourceRef: ref(chosen.index, "footnote") }]
            : [],
          priceBasis: { kind: "unknown" },
          ...tail,
        },
      );
      cells.push({ state: "present", observation: p(obs) });
    }
    coverages.push(
      record("coverage", "coverage-" + family, {
        selection: {
          kind: "country-latest-window",
          startYear: 2020,
          endYear: 2025,
          rule: "latest-non-null",
          indicator: code,
          countryMetadataSource: p(meta),
          valuesSource: p(sourceValues),
          indicatorMetadataSource: p(metadata),
          measure: p(measure),
          nonaggregateRule: "country-metadata-region-id-not-NA",
        },
        cells,
        exclusions: [],
        ...tail,
      }),
    );
  }
  if (financial) {
    const financialMeasures = new Map();
    for (const [family, label] of [
      ["assets", "Assets"],
      ["liabilities", "Liabilities"],
      ["net-assets", "Net assets"],
      ["expenses", "Operating expenses"],
      ["expenses-total", "Total expenses"],
    ]) {
      const actualFamily = family.startsWith("expenses") ? "expenses" : family;
      financialMeasures.set(
        family,
        record("measure", "financial-" + family, {
          label,
          measureKind: actualFamily === "expenses" ? "flow" : "stock",
          family: actualFamily,
          producerCode: null,
          definition: `Synthetic source-reported ${label.toLowerCase()}.`,
          unit: {
            kind: "currency",
            label: "USD",
            currency: "USD",
            denominator: null,
          },
          method: "Fictional historical transcription",
          legacyCountry: null,
          ...tail,
        }),
      );
    }
    const panels = [],
      cells = [];
    for (const [index, name] of ["alpha", "beta"].entries()) {
      const rawDocument = new Uint8Array([37, 80, 68, 70, 255, index]),
        documentSha256 = m.observationRawHash(rawDocument),
        scale = { coefficient: "1", exponent: index === 0 ? 0 : 3 };
      const amounts =
        index === 0
          ? ["100000", "10000", "90000", "1234"]
          : ["100", "10", "90", "2"];
      const selectedMeasures = [
        "assets",
        "liabilities",
        "net-assets",
        index === 0 ? "expenses" : "expenses-total",
      ].map((k) => financialMeasures.get(k));
      const assertions = amounts.map((token, i) => ({
        id: `${name}-assertion-${i + 1}`,
        locator: {
          kind: "pdf",
          pdfPage: i < 3 ? 5 : 6,
          printedPage: i < 3 ? "3" : "4",
          section: [
            i < 3 ? "Fictional financial position" : "Fictional activities",
          ],
          row: [selectedMeasures[i].label],
          column: ["2024"],
        },
        token,
        parser: "printed-integer-v1",
        scale,
        support: [
          {
            kind: "same-document",
            locator: {
              kind: "pdf",
              pdfPage: 9,
              printedPage: "7",
              section: ["Fictional consolidation and unit note"],
              row: [],
              column: [],
            },
          },
        ],
        note: "Entirely synthetic test assertion.",
      }));
      const packet = {
          format: "charitology-financial-transcription",
          schemaVersion: 1,
          documentSha256,
          assertions,
          review: "draft",
        },
        blob = raw(m.observationPrettyJson(packet), "evidence");
      const audit = record("source", name + "-audit", {
        url: `https://example.invalid/${name}.pdf`,
        publisher: "Fictional organization",
        title: "Fictional audit",
        retrievedAt: at,
        sourceUpdatedDay: null,
        reportDay: "2025-01-01",
        publishedAt: null,
        rawSha256: documentSha256,
        rawBytes: rawDocument.length,
        payload: {
          kind: "external-document",
          mediaType: "application/pdf",
          publicExcerpt: blob,
        },
        producerMetadata: [],
        rights,
        limitations: ["Synthetic private bytes not in public archive."],
        review: "draft",
      });
      const identity = record("entity", name + "-legal", {
        entityKind: "legal-organization",
        label: "Fictional " + name + " legal entity",
        identifiers: [
          { kind: "ein", value: `00000000${index + 1}`, sourceRefs: [] },
        ],
        aliases: [],
        memberEntities: [],
        profileRefs: [name + "-foundation"],
        countryMetadata: null,
        ...tail,
      });
      const group = record("entity", name + "-group", {
        entityKind: "reporting-group",
        label: "Fictional " + name + " reporting group",
        identifiers: [],
        aliases: [],
        memberEntities: [p(identity)],
        profileRefs: [name + "-group"],
        countryMetadata: null,
        ...tail,
      });
      const scope = record("scope", name + "-consolidated", {
        entity: p(group),
        scopeKind: "consolidated-reporting-group",
        label: "Fictional consolidated scope",
        includedEntities: [p(identity)],
        consolidation: "consolidated-with-eliminations",
        geography: {
          kind: "unknown",
          note: "Service geography not collected.",
        },
        exclusions: [],
        ...tail,
      });
      panels.push({ scope: p(scope), measures: selectedMeasures.map(p) });
      for (const [i, assertion] of assertions.entries()) {
        const valueRef = {
          source: p(audit),
          role: "value",
          locator: assertion.locator,
        };
        const period =
          i < 3
            ? {
                kind: "stock-day",
                day: index === 0 ? "2024-06-30" : "2024-12-31",
              }
            : index === 0
              ? {
                  kind: "closed-interval",
                  start: "2023-07-01",
                  end: "2024-06-30",
                  sourceLabel: "Fictional fiscal interval",
                }
              : {
                  kind: "year-ended",
                  end: "2024-12-31",
                  literalStart: null,
                  sourceLabel: "Year ended December 31, 2024",
                };
        const o = record(
          "observation",
          `${name}-${selectedMeasures[i].family}`,
          {
            entity: p(group),
            scope: p(scope),
            measure: p(selectedMeasures[i]),
            period,
            reported: {
              token: assertion.token,
              parser: "printed-integer-v1",
              scale,
              valueRef,
            },
            value: m.observationScaledDecimal(assertion.token, scale),
            precision: {
              kind: "reported-quantum",
              quantum: scale,
              sourceRefs: [valueRef],
            },
            uncertainty: null,
            producerStatus: null,
            producerUnit: null,
            producerDecimal: null,
            annotations: [],
            priceBasis: { kind: "unknown" },
            ...tail,
          },
        );
        cells.push({ state: "present", observation: p(o) });
      }
    }
    coverages.push(
      record("coverage", "financial-panel", {
        selection: {
          kind: "explicit-financial-panel",
          rule: "selected-consolidated-audit-rows",
          panels,
          unknownRemainder:
            "All other organizations are uncollected; worldwide denominator unknown.",
        },
        cells,
        exclusions: [],
        ...tail,
      }),
    );
  }
  const order = (a, b) =>
    a.kind < b.kind
      ? -1
      : a.kind > b.kind
        ? 1
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : a.version - b.version;
  for (const r of records)
    files[
      `${{ entity: "entities", scope: "scopes", source: "sources", measure: "measures", observation: "observations", coverage: "coverage" }[r.kind]}/${r.id}.v${r.version}.json`
    ] = m.observationPrettyJson(r);
  const edition = {
    format: "charitology-observation-edition",
    version: 1,
    id: "synthetic-initial",
    sequence: 1,
    capturedAt: at,
    sourceCommit: "a".repeat(40),
    method: {
      id: "observation-capture-v1",
      definitionSha256: m.observationRawHash("synthetic definition"),
      adapterSha256: m.observationRawHash("synthetic adapter"),
    },
    supersedes: null,
    records: records.map(p).sort(order),
    coverage: coverages.map(p),
    legacyComparison: {
      path: "src/data/countries.json",
      sha256: m.observationRawHash("synthetic legacy"),
      declaredRetrievedDay: "2026-10-25",
    },
    countryProjection: {
      title: "Fictional country data",
      window: "2020–2025",
      publisher: "Fictional producer",
      licenseSummary: "Fixture only",
      scope: "Fictional economies",
      countrySourceUrl: "https://example.invalid/countries",
      retrievalRule: "maximum-input-retrieval-day",
      review: "draft",
      reviewNote: "Synthetic tests; no human review.",
    },
    limitations: ["Entirely fictional test fixture."],
    review: "draft",
  };
  edition.hash = m.observationObjectHash(edition);
  files[`editions/${edition.id}.json`] = m.observationPrettyJson(edition);
  const ep = { id: edition.id, hash: edition.hash, sequence: edition.sequence };
  const registry = {
    format: "charitology-observation-registry",
    version: 1,
    current: ep,
    editions: [ep],
    records: records.map(p).sort(order),
    files: Object.keys(files)
      .sort()
      .map((path) => ({
        path,
        sha256: m.observationRawHash(files[path]),
        bytes: Buffer.byteLength(files[path]),
      })),
  };
  registry.hash = m.observationObjectHash(registry);
  files["registry.json"] = m.observationPrettyJson(registry);
  return files;
}
export function rewriteFixture(files, change) {
  const next = structuredClone(files),
    objects = {};
  for (const [path, text] of Object.entries(next))
    if (!path.startsWith("raw/") && !path.endsWith(".txt"))
      objects[path] = JSON.parse(text);
  change(objects, next);
  for (const [oldPath, packet] of Object.entries(objects))
    if (oldPath.startsWith("evidence/")) {
      const text = m.observationPrettyJson(packet),
        sha256 = m.observationRawHash(text),
        newPath = `evidence/${sha256}.json`;
      if (newPath !== oldPath) {
        delete objects[oldPath];
        delete next[oldPath];
        objects[newPath] = packet;
      }
      next[newPath] = text;
      for (const source of Object.values(objects))
        if (
          source.kind === "source" &&
          source.payload.publicExcerpt?.path === oldPath
        )
          source.payload.publicExcerpt = {
            path: newPath,
            sha256,
            bytes: Buffer.byteLength(text),
            mediaType: "application/json",
          };
    }
  // Topological fixed point updates only actual reference hashes, never data supplied by change.
  for (let round = 0; round < 10; round++) {
    const refs = new Map(
      Object.values(objects)
        .filter((o) => o.kind)
        .map((o) => [`${o.kind}/${o.id}/${o.version}`, o]),
    );
    function walk(v) {
      if (!v || typeof v !== "object") return;
      if (Object.keys(v).sort().join(",") === "hash,id,kind,version") {
        const r = refs.get(`${v.kind}/${v.id}/${v.version}`);
        if (r) v.hash = r.hash;
      }
      for (const x of Object.values(v)) walk(x);
    }
    for (const [path, o] of Object.entries(objects))
      if (path !== "registry.json") {
        walk(o);
        if (o.kind || o.format === "charitology-observation-edition")
          o.hash = m.observationObjectHash(o);
        next[path] = m.observationPrettyJson(o);
      }
  }
  const reg = objects["registry.json"];
  const edition = Object.values(objects).find(
    (o) => o.format === "charitology-observation-edition",
  );
  for (const p of reg.editions) if (p.id === edition.id) p.hash = edition.hash;
  reg.current.hash = reg.editions.at(-1).hash;
  reg.records = Object.values(objects)
    .filter((o) => o.kind)
    .map(p)
    .sort((a, b) =>
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
  reg.files = Object.keys(next)
    .filter((p) => p !== "registry.json")
    .sort()
    .map((path) => ({
      path,
      sha256: m.observationRawHash(next[path]),
      bytes: Buffer.byteLength(next[path]),
    }));
  reg.hash = m.observationObjectHash(reg);
  next["registry.json"] = m.observationPrettyJson(reg);
  return next;
}
