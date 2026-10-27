import initialDefinitions from "../data/observation-definitions.json" with { type: "json" };
import initialInputs from "../data/observation-source-inputs.json" with { type: "json" };
import { types as nativeTypes } from "node:util";
import {
  OBSERVATION_LIMITS,
  observationClone,
  observationFreeze,
  observationFail,
  observationRawHash,
  observationObjectHash,
  canonicalObservationJson,
  observationPrettyJson,
  strictObservationJson,
  observationJsonTokens,
  observationBytes,
} from "./observation-canonical.mjs";
import {
  observationDecimalFromLexeme,
  observationScaledDecimal,
} from "./observation-model.mjs";

const fail = (message) => observationFail("invalid_source", message);
const same = (a, b) =>
  canonicalObservationJson(a) === canonicalObservationJson(b);
const folders = {
  entity: "entities",
  scope: "scopes",
  measure: "measures",
  source: "sources",
  observation: "observations",
  coverage: "coverage",
};
export const observationRecordKey = (r) => `${r.kind}/${r.id}/${r.version}`;
export const observationRecordPath = (r) =>
  `${folders[r.kind]}/${r.id}.v${r.version}.json`;
export const observationPin = (r) => ({
  kind: r.kind,
  id: r.id,
  version: r.version,
  hash: r.hash,
});
const stableKey = (r) => `${r.kind}/${r.id}`;
const ordered = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const ID = /^[a-z][a-z0-9-]{0,99}$/;
const SHA = /^[0-9a-f]{64}$/;
const instant = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  new Date(value).toISOString() === value;

function fields(value, keys, label) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !same(Object.keys(value).sort(), [...keys].sort())
  )
    fail(`Invalid closed ${label}`);
}
export function copyObservationBytes(value, maximum) {
  if (nativeTypes.isProxy(value)) fail("Proxied bytes refused");
  const prototype = value && Object.getPrototypeOf(value);
  if (
    !(value instanceof Uint8Array) ||
    (prototype !== Uint8Array.prototype && prototype !== Buffer.prototype)
  )
    fail("Expected ordinary bytes");
  const native = Object.getPrototypeOf(Uint8Array.prototype);
  const length = Object.getOwnPropertyDescriptor(native, "byteLength").get.call(
    value,
  );
  const offset = Object.getOwnPropertyDescriptor(native, "byteOffset").get.call(
    value,
  );
  const buffer = Object.getOwnPropertyDescriptor(native, "buffer").get.call(
    value,
  );
  if (length > maximum)
    observationFail("input_limit", "Whole byte input exceeds limit");
  // Only native bytes are semantic. Do not materialize millions of index
  // descriptors, inspect caller decorations, or call a caller iterator.
  if (Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype)
    fail("Shared/proxied backing storage refused");
  const resizable = Object.getOwnPropertyDescriptor(
    ArrayBuffer.prototype,
    "resizable",
  );
  if (resizable?.get.call(buffer)) fail("Resizable backing storage refused");
  return new Uint8Array(new Uint8Array(buffer, offset, length));
}

export function copyPreparedObservationInputs(input) {
  if (
    !input ||
    nativeTypes.isProxy(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    fail("Plain prepared input required");
  const descriptors = Object.getOwnPropertyDescriptors(input ?? {});
  if (
    !descriptors.manifest?.enumerable ||
    !descriptors.files?.enumerable ||
    !descriptors.manifest?.value ||
    !descriptors.files?.value ||
    Reflect.ownKeys(descriptors).length !== 2
  )
    fail("Expected closed prepared inputs");
  const manifest = observationClone(descriptors.manifest.value);
  fields(
    manifest,
    ["format", "version", "inputs", "hash"],
    "prepared manifest",
  );
  if (
    manifest.format !== "charitology-observation-prepared-inputs" ||
    manifest.version !== 1 ||
    !Array.isArray(manifest.inputs) ||
    !manifest.inputs.length ||
    manifest.inputs.length > 200
  )
    fail("Invalid prepared manifest");
  if (observationObjectHash(manifest) !== manifest.hash)
    fail("Prepared manifest hash disagrees");
  const original = descriptors.files.value;
  if (
    nativeTypes.isProxy(original) ||
    Object.getPrototypeOf(original) !== Map.prototype ||
    Object.getOwnPropertyDescriptor(Map.prototype, "size").get.call(original) >
      200
  )
    fail("Expected bounded ordinary prepared Map");
  const files = new Map();
  let total = 0;
  for (const [name, bytes] of Map.prototype.entries.call(original)) {
    if (typeof name !== "string" || !ID.test(name) || files.has(name))
      fail("Invalid prepared input name");
    const owned = copyObservationBytes(
      bytes,
      OBSERVATION_LIMITS.privateOriginalBytes,
    );
    total += owned.byteLength;
    if (total > OBSERVATION_LIMITS.preparedInputBytes)
      observationFail("input_limit", "Whole preparation exceeds 32 MiB");
    files.set(name, owned);
  }
  if (files.size !== manifest.inputs.length)
    fail("Prepared inventory is incomplete");
  const seen = new Set();
  for (const item of manifest.inputs) {
    fields(
      item,
      [
        "name",
        "url",
        "retrievedAt",
        "mediaType",
        "sha256",
        "bytes",
        "publicDisposition",
      ],
      "prepared input",
    );
    if (!ID.test(item.name) || seen.has(item.name) || !files.has(item.name))
      fail("Duplicate or missing prepared input");
    seen.add(item.name);
    let url;
    try {
      url = new URL(item.url);
    } catch {
      fail("Invalid source URL");
    }
    if (
      typeof item.url !== "string" ||
      item.url.length > 2048 ||
      /[\\\u0000-\u0020\u007f]/u.test(item.url) ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !instant(item.retrievedAt)
    )
      fail("Unsafe source URL/retrieval");
    if (
      ![
        "application/json",
        "text/html",
        "text/plain",
        "application/pdf",
      ].includes(item.mediaType) ||
      !["raw-json", "bounded-excerpt", "private-original"].includes(
        item.publicDisposition,
      )
    )
      fail("Unknown source media/disposition");
    if (
      !Number.isSafeInteger(item.bytes) ||
      item.bytes < 1 ||
      !SHA.test(item.sha256)
    )
      fail("Invalid source byte pin");
    const raw = files.get(item.name);
    const cap =
      item.publicDisposition === "private-original"
        ? OBSERVATION_LIMITS.privateOriginalBytes
        : OBSERVATION_LIMITS.rawSourceBytes;
    if (
      raw.byteLength > cap ||
      raw.byteLength !== item.bytes ||
      observationRawHash(raw) !== item.sha256
    )
      fail("Prepared source byte pin disagrees");
    if (item.publicDisposition !== "private-original") {
      if (item.mediaType === "application/json")
        strictObservationJson(raw, cap);
      else if (item.mediaType === "text/plain") observationBytes(raw, cap);
      else fail("Only strict JSON/text evidence may be retained publicly");
    }
  }
  return { manifest: observationFreeze(manifest), files };
}

export function validateObservationSourceRoles(input) {
  const value = observationClone(input);
  if (
    value.format !== "charitology-observation-source-definitions" ||
    value.version !== 1 ||
    !Array.isArray(value.sources) ||
    !value.sources.length ||
    value.sources.length > 200
  )
    fail("Invalid source role catalog");
  const names = new Set();
  for (const spec of value.sources) {
    const i = spec.input,
      r = spec.record;
    if (!i || !r || i.name !== r.id || i.url !== r.url || names.has(i.name))
      fail("Source catalog identity or URL disagrees");
    names.add(i.name);
    const valid =
      (i.publicDisposition === "raw-json" &&
        i.mediaType === "application/json" &&
        r.payload?.kind === "public-json") ||
      (i.publicDisposition === "bounded-excerpt" &&
        i.mediaType === "text/plain" &&
        r.payload?.kind === "public-text-evidence") ||
      (i.publicDisposition === "private-original" &&
        ["application/pdf", "text/html"].includes(i.mediaType) &&
        r.payload?.kind === "external-document" &&
        r.payload.mediaType === i.mediaType);
    if (!valid)
      fail(
        "Source disposition, media and payload disagree; private originals cannot become public raw bodies",
      );
  }
  return observationFreeze(value);
}

function sourceContext(definitions, sourceDefinitions, previousRecords = []) {
  const selected = new Map(),
    files = {},
    old = new Map();
  for (const record of previousRecords) {
    const key = stableKey(record);
    if (!old.has(key) || old.get(key).version < record.version)
      old.set(key, record);
  }
  function add(data) {
    const supplied = observationClone(data);
    delete supplied.hash;
    delete supplied.previous;
    delete supplied.version;
    const previous = old.get(stableKey(supplied));
    if (previous) {
      const before = observationClone(previous);
      delete before.hash;
      delete before.previous;
      delete before.version;
      if (same(before, supplied)) {
        selected.set(stableKey(previous), previous);
        return previous;
      }
    }
    const record = {
      ...supplied,
      version: previous ? previous.version + 1 : 1,
      previous: previous ? observationPin(previous) : null,
    };
    record.hash = observationObjectHash(record);
    selected.set(stableKey(record), record);
    files[observationRecordPath(record)] = observationPrettyJson(record);
    return record;
  }
  function blob(raw, namespace = "raw", mediaType = "application/json") {
    const bytes =
      typeof raw === "string"
        ? Buffer.from(raw)
        : copyObservationBytes(raw, OBSERVATION_LIMITS.rawSourceBytes);
    const sha256 = observationRawHash(bytes),
      path = `${namespace}/${sha256}.${mediaType === "application/json" ? "json" : "txt"}`;
    // Public bytes are strict UTF-8, independent of their source's private binary body.
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    files[path] = text;
    return { path, sha256, bytes: bytes.length, mediaType };
  }
  return { definitions, sourceDefinitions, selected, files, add, blob };
}
function directObject(value, keys, label) {
  if (
    !value ||
    nativeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    fail("Plain " + label + " required");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    !same(
      Reflect.ownKeys(descriptors)
        .filter((k) => typeof k === "string")
        .sort(),
      [...keys].sort(),
    ) ||
    Reflect.ownKeys(descriptors).length !== keys.length ||
    keys.some(
      (k) =>
        !descriptors[k].enumerable || !Object.hasOwn(descriptors[k], "value"),
    )
  )
    fail("Closed data-only " + label + " required");
  return Object.fromEntries(keys.map((k) => [k, descriptors[k].value]));
}
function copyWorldBankPreparation(input) {
  const value = directObject(
      input,
      ["format", "version", "window", "responses", "legacyComparison"],
      "World Bank preparation",
    ),
    array = value.responses;
  if (
    nativeTypes.isProxy(array) ||
    !Array.isArray(array) ||
    Object.getPrototypeOf(array) !== Array.prototype ||
    array.length !== 11
  )
    fail("Eleven ordinary response entries required");
  const d = Object.getOwnPropertyDescriptors(array);
  if (Reflect.ownKeys(d).length !== 12) fail("Decorated response array");
  const responses = [];
  for (let i = 0; i < 11; i++) {
    if (!d[i]?.enumerable || !Object.hasOwn(d[i], "value"))
      fail("Accessor/sparse response array");
    const r = directObject(
      d[i].value,
      ["role", "indicator", "url", "retrievedAt", "sha256", "bytes"],
      "World Bank response",
    );
    const bytes = copyObservationBytes(
      r.bytes,
      OBSERVATION_LIMITS.rawSourceBytes,
    );
    delete r.bytes;
    responses.push({ ...observationClone(r), bytes });
  }
  const legacy = directObject(
      value.legacyComparison,
      ["path", "bytes", "sha256"],
      "legacy comparison",
    ),
    legacyBytes = copyObservationBytes(
      legacy.bytes,
      OBSERVATION_LIMITS.rawSourceBytes,
    );
  delete legacy.bytes;
  return {
    ...observationClone({
      format: value.format,
      version: value.version,
      window: value.window,
    }),
    responses,
    legacyComparison: { ...observationClone(legacy), bytes: legacyBytes },
  };
}
const base = (kind, id) => ({
  format: "charitology-observation-record",
  schemaVersion: 1,
  kind,
  id,
});
const jsonRef = (source, role, pointer, matches = []) => ({
  source: observationPin(source),
  role,
  locator: { kind: "json", pointer, matches },
});
function decimalCompare(a, b) {
  const e = Math.min(a.exponent, b.exponent),
    x = BigInt(a.coefficient) * 10n ** BigInt(a.exponent - e),
    y = BigInt(b.coefficient) * 10n ** BigInt(b.exponent - e);
  return x < y ? -1 : x > y ? 1 : 0;
}
function rawInput(input, spec) {
  const item = input.manifest.inputs.find((i) => i.name === spec.input.name),
    bytes = input.files.get(spec.input.name);
  if (
    !item ||
    !bytes ||
    item.url !== spec.input.url ||
    item.mediaType !== spec.input.mediaType ||
    item.publicDisposition !== spec.input.publicDisposition
  )
    fail("Source role, URL, media or disposition changed");
  if (
    !spec.input.mutableBody &&
    (item.sha256 !== spec.input.sha256 || item.bytes !== spec.input.bytes)
  )
    fail("External original changed without a new reviewed source definition");
  return { item, bytes };
}

function prepareSources(input, context) {
  const specs = new Map(
      context.sourceDefinitions.sources.map((s) => [s.record.id, s]),
    ),
    done = new Map(),
    active = new Set();
  function remap(value) {
    if (Array.isArray(value)) return value.map(remap);
    if (!value || typeof value !== "object") return value;
    if (
      value.kind === "source" &&
      same(Object.keys(value).sort(), ["hash", "id", "kind", "version"])
    )
      return observationPin(build(value.id));
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, remap(v)]),
    );
  }
  function build(id) {
    if (done.has(id)) return done.get(id);
    if (active.has(id)) fail("Cyclic source definitions");
    const spec = specs.get(id);
    if (!spec) fail("Unknown source definition");
    active.add(id);
    const { item, bytes } = rawInput(input, spec),
      source = observationClone(spec.record);
    source.retrievedAt = item.retrievedAt;
    source.rawSha256 = item.sha256;
    source.rawBytes = item.bytes;
    source.rights = remap(source.rights);
    if (source.payload.kind === "public-json") {
      const parsed = observationJsonTokens(bytes).value;
      source.payload.raw = context.blob(bytes);
      if (id.startsWith("wb-values-")) {
        source.sourceUpdatedDay = parsed[0]?.lastupdated;
        source.producerMetadata = [
          { field: "sourceid", literal: String(parsed[0]?.sourceid) },
          { field: "lastupdated", literal: String(parsed[0]?.lastupdated) },
        ];
      } else if (id !== "wb-country-metadata")
        source.producerMetadata = [
          { field: "unit", literal: parsed[1]?.[0]?.unit },
        ];
      const series = context.definitions.series.find((s) =>
        id.endsWith(s.code.toLowerCase().replaceAll(".", "-")),
      );
      if (series) {
        const metaSpec = context.sourceDefinitions.sources.find(
          (s) =>
            s.record.id ===
            "wb-metadata-" + series.code.toLowerCase().replaceAll(".", "-"),
        );
        const meta = observationJsonTokens(rawInput(input, metaSpec).bytes)
          .value[1]?.[0];
        source.rights.originalProducerCredit = meta?.sourceOrganization;
      }
    } else if (source.payload.kind === "public-text-evidence") {
      source.payload.raw = context.blob(bytes, "evidence", "text/plain");
    } else {
      source.producerMetadata = [
        {
          field: "originalRetrievalRecord",
          literal:
            item.retrievedAt === spec.input.retrievedAt
              ? spec.input.originalRetrievalLiteral
              : item.retrievedAt,
        },
      ];
      if (spec.publicEvidence) {
        let text = spec.publicEvidence.text;
        if (spec.publicEvidence.mediaType === "application/json") {
          const packet = remap(strictObservationJson(text));
          if (packet.documentSha256 !== item.sha256)
            fail("Financial packet does not bind its private original");
          text = observationPrettyJson(packet);
        }
        source.payload.publicExcerpt = context.blob(
          text,
          "evidence",
          spec.publicEvidence.mediaType,
        );
      }
    }
    const result = context.add(source);
    active.delete(id);
    done.set(id, result);
    return result;
  }
  for (const id of specs.keys()) build(id);
  return done;
}

function worldBank(input, context, sources) {
  const byCode = new Map(context.definitions.series.map((s) => [s.code, s])),
    response = new Map();
  if (
    input.format !== "charitology-worldbank-preparation" ||
    input.version !== 1 ||
    !same(input.window, { startYear: 2020, endYear: 2025 }) ||
    !Array.isArray(input.responses) ||
    input.responses.length !== 11
  )
    fail("Complete fixed-window World Bank preparation required");
  for (const r of input.responses) {
    const key =
      r.role === "country-metadata"
        ? "country-metadata"
        : (r.role === "indicator-values"
            ? "values-"
            : r.role === "indicator-metadata"
              ? "metadata-"
              : "invalid-") + r.indicator;
    if (
      response.has(key) ||
      !["country-metadata", "indicator-metadata", "indicator-values"].includes(
        r.role,
      ) ||
      (r.role === "country-metadata"
        ? r.indicator !== null
        : !byCode.has(r.indicator))
    )
      fail("Duplicate/unknown World Bank response role");
    const raw = copyObservationBytes(
      r.bytes,
      OBSERVATION_LIMITS.rawSourceBytes,
    );
    if (observationRawHash(raw) !== r.sha256 || !instant(r.retrievedAt))
      fail("World Bank byte pin/retrieval disagrees");
    const parsed = observationJsonTokens(raw),
      header = parsed.value[0],
      rows = parsed.value[1];
    if (
      !Array.isArray(parsed.value) ||
      parsed.value.length !== 2 ||
      !header ||
      !Array.isArray(rows) ||
      header.page !== 1 ||
      header.pages !== 1 ||
      header.total !== rows.length ||
      !Number.isSafeInteger(Number(header.per_page)) ||
      Number(header.per_page) < rows.length
    )
      fail("Incomplete/paginated World Bank response");
    response.set(key, { ...r, raw, ...parsed });
  }
  const meta = response.get("country-metadata");
  if (!meta) fail("Country metadata missing");
  const economies = meta.value[1]
    .map((c, index) => ({ ...c, index }))
    .filter((c) => c.region?.id !== "NA");
  if (
    !economies.length ||
    economies.length > 1000 ||
    new Set(economies.map((c) => c.id)).size !== economies.length ||
    new Set(economies.map((c) => c.iso2Code)).size !== economies.length
  )
    fail("Country denominator identities invalid");
  const legacyRaw = copyObservationBytes(
    input.legacyComparison.bytes,
    OBSERVATION_LIMITS.rawSourceBytes,
  );
  if (
    input.legacyComparison.path !== "src/data/countries.json" ||
    observationRawHash(legacyRaw) !== input.legacyComparison.sha256
  )
    fail("Legacy comparison pin disagrees");
  const legacyParsed = observationJsonTokens(legacyRaw),
    legacy = legacyParsed.value;
  const report = {
    economies: economies.length,
    cells: economies.length * 5,
    present: 0,
    missing: 0,
    mortalityBounds: 0,
    mortalityWithoutBounds: [],
    selectedTokenDifferences: 0,
    yearStatusNoteDifferences: 0,
    identityDifferences: 0,
    definitionDifferences: 0,
    producerRows: 0,
    rawFiles: [],
    records: [],
  };
  const countrySource = sources.get("wb-country-metadata"),
    entities = new Map(),
    scopes = new Map();
  for (const c of economies) {
    if (
      !/^[A-Z]{3}$/.test(c.id) ||
      !/^[A-Z]{2}$/.test(c.iso2Code) ||
      typeof c.name !== "string" ||
      typeof c.region?.value !== "string"
    )
      fail("Invalid producer country identity");
    const pointer = `/1/${c.index}`,
      refs = [
        jsonRef(countrySource, "identity", pointer, [
          {
            pointer: pointer + "/id",
            expected: { kind: "string", value: c.id },
          },
        ]),
      ];
    const entity = context.add({
      ...base("entity", "country-" + c.id.toLowerCase()),
      entityKind: "country-economy",
      label: c.name,
      identifiers: [
        {
          kind: "iso2",
          value: c.iso2Code,
          sourceRefs: [
            jsonRef(countrySource, "identity", pointer + "/iso2Code"),
          ],
        },
        {
          kind: "iso3",
          value: c.id,
          sourceRefs: [jsonRef(countrySource, "identity", pointer + "/id")],
        },
        {
          kind: "producer-country",
          value: c.iso2Code,
          sourceRefs: [
            jsonRef(countrySource, "identity", pointer + "/iso2Code"),
          ],
        },
      ],
      aliases: [],
      memberEntities: [],
      profileRefs: [],
      countryMetadata: {
        producerRegionId: c.region.id,
        producerRegionLabel: c.region.value,
      },
      sourceRefs: refs,
      limitations: [],
      review: "draft",
    });
    entities.set(c.id, entity);
    scopes.set(
      c.id,
      context.add({
        ...base("scope", "national-" + c.id.toLowerCase()),
        entity: observationPin(entity),
        scopeKind: "national-statistics",
        label: c.name + " statistical scope",
        includedEntities: [observationPin(entity)],
        consolidation: "not-applicable",
        geography: { kind: "country-economy", entity: observationPin(entity) },
        exclusions: [],
        sourceRefs: [],
        limitations: [
          "National indicator scope does not measure local need or charitable activity.",
        ],
        review: "draft",
      }),
    );
    const old = legacy.countries.find((v) => v.id === c.id);
    if (
      !old ||
      old.iso2 !== c.iso2Code ||
      old.name !== c.name ||
      old.region !== c.region.value
    )
      report.identityDifferences++;
  }
  report.identityDifferences += legacy.countries.filter(
    (c) => !entities.has(c.id),
  ).length;
  for (const series of context.definitions.series) {
    const code = series.code,
      values = response.get("values-" + code),
      definition = response.get("metadata-" + code);
    if (
      !values ||
      !definition ||
      definition.value[1].length !== 1 ||
      definition.value[1][0].id !== code ||
      (values.value[0].sourceid !== "2" && values.value[0].sourceid !== 2)
    )
      fail("Indicator identity/source mismatch");
    const def = definition.value[1][0],
      indicator = series.display;
    if (
      typeof def.sourceNote !== "string" ||
      typeof def.sourceOrganization !== "string" ||
      typeof def.unit !== "string"
    )
      fail("Indicator definition fields absent");
    const legacyDef = legacy.indicators.find((i) => i.id === code);
    if (
      !legacyDef ||
      legacyDef.definition !== def.sourceNote ||
      legacyDef.organization !== def.sourceOrganization
    )
      report.definitionDifferences++;
    const metadataSource = sources.get(
        "wb-metadata-" + code.toLowerCase().replaceAll(".", "-"),
      ),
      valueSource = sources.get(
        "wb-values-" + code.toLowerCase().replaceAll(".", "-"),
      );
    const unit =
      series.family === "population"
        ? { kind: "count", label: "people", denominator: null }
        : series.family === "life-expectancy"
          ? { kind: "duration", label: "years", denominator: null }
          : {
              kind: "rate",
              label: indicator.unit,
              denominator: {
                label:
                  series.family === "under-five-mortality"
                    ? "live births"
                    : "population",
                definition:
                  series.family === "under-five-mortality"
                    ? "Probability per 1,000 live births, not total population."
                    : def.sourceNote,
                scale: observationDecimalFromLexeme(
                  series.family === "under-five-mortality" ? "1000" : "100",
                ),
              },
            };
    const measure = context.add({
      ...base("measure", "country-" + series.family),
      label: indicator.label,
      measureKind:
        series.family === "population"
          ? "population-count"
          : series.family === "life-expectancy"
            ? "period-duration"
            : "rate",
      family: series.family,
      producerCode: code,
      definition: def.sourceNote,
      unit,
      method:
        "Latest non-null producer value in the explicitly fixed 2020–2025 window.",
      legacyCountry: {
        id: code,
        label: indicator.label,
        unit: indicator.unit,
        note: indicator.note,
        indicatorUrl: indicator.url,
        queryUrl: indicator.apiUrl,
        definition: def.sourceNote,
        organization: def.sourceOrganization,
      },
      sourceRefs: [
        jsonRef(metadataSource, "definition", "/1/0/sourceNote"),
        jsonRef(metadataSource, "unit", "/1/0/name"),
      ],
      limitations: [indicator.note],
      review: "draft",
    });
    const rows = values.value[1],
      rowKeys = new Set();
    report.producerRows += rows.length;
    for (const row of rows) {
      if (
        !row.country ||
        row.indicator?.id !== code ||
        typeof row.country.id !== "string" ||
        !/^202[0-5]$/.test(row.date)
      )
        fail("Invalid indicator row");
      const key = `${row.country.id}/${code}/${row.date}`;
      if (rowKeys.has(key)) fail("Duplicate producer row");
      rowKeys.add(key);
    }
    const cells = [];
    for (const c of economies) {
      const choices = rows
        .map((r, index) => ({ r, index }))
        .filter((v) => v.r.countryiso3code === c.id);
      if (
        choices.length !== 6 ||
        new Set(choices.map((v) => v.r.date)).size !== 6 ||
        choices.some((v) => v.r.country.id !== c.iso2Code)
      )
        fail("Country/year join incomplete");
      const matches = (r, index) => [
        {
          pointer: `/1/${index}/country/id`,
          expected: { kind: "string", value: r.country.id },
        },
        {
          pointer: `/1/${index}/countryiso3code`,
          expected: { kind: "string", value: r.countryiso3code },
        },
        {
          pointer: `/1/${index}/indicator/id`,
          expected: { kind: "string", value: code },
        },
        {
          pointer: `/1/${index}/date`,
          expected: { kind: "string", value: r.date },
        },
      ];
      const item = choices
          .filter((v) => v.r.value !== null)
          .sort((a, b) => ordered(b.r.date, a.r.date))[0],
        entity = entities.get(c.id),
        scope = scopes.get(c.id),
        legacyIndex = legacy.countries.findIndex((v) => v.id === c.id),
        old =
          legacyIndex < 0
            ? undefined
            : legacy.countries[legacyIndex].values[code];
      if (!item) {
        report.missing++;
        if (old !== undefined) report.selectedTokenDifferences++;
        cells.push({
          state: "missing",
          entity: observationPin(entity),
          scope: observationPin(scope),
          measure: observationPin(measure),
          reason: "producer-null-throughout-window",
          sourceRefs: choices.map((v) =>
            jsonRef(
              valueSource,
              "value",
              `/1/${v.index}/value`,
              matches(v.r, v.index),
            ),
          ),
        });
        continue;
      }
      const { r, index } = item,
        pointer = `/1/${index}`,
        token = values.tokens.get(pointer + "/value");
      if (
        typeof token !== "string" ||
        typeof r.obs_status !== "string" ||
        typeof r.unit !== "string" ||
        typeof r.footnote !== "string"
      )
        fail("Selected value lacks exact returned fields");
      const value = observationDecimalFromLexeme(token),
        valueRef = jsonRef(
          valueSource,
          "value",
          pointer + "/value",
          matches(r, index),
        ),
        annotationRef = jsonRef(
          valueSource,
          "annotation",
          pointer + "/footnote",
        );
      let uncertainty = null;
      if (series.family === "under-five-mortality") {
        const bound =
          /^Uncertainty bound is (\d+(?:\.\d+)?) - (\d+(?:\.\d+)?)$/.exec(
            r.footnote,
          );
        if (bound) {
          uncertainty = {
            kind: "producer-reported-bounds",
            lower: observationDecimalFromLexeme(bound[1]),
            upper: observationDecimalFromLexeme(bound[2]),
            confidence: null,
            verbatimNote: r.footnote,
            sourceRef: annotationRef,
            parser: "world-bank-mortality-bound-v1",
          };
          if (
            decimalCompare(uncertainty.lower, value) > 0 ||
            decimalCompare(value, uncertainty.upper) > 0
          )
            fail("Point outside its producer bounds");
          report.mortalityBounds++;
        } else report.mortalityWithoutBounds.push(c.id);
      }
      const observation = context.add({
        ...base("observation", `fact-${c.id.toLowerCase()}-${series.family}`),
        entity: observationPin(entity),
        scope: observationPin(scope),
        measure: observationPin(measure),
        period: { kind: "calendar-year", year: Number(r.date) },
        reported: {
          token,
          parser: "json-number-v1",
          scale: { coefficient: "1", exponent: 0 },
          valueRef,
        },
        value,
        precision: { kind: "unknown" },
        uncertainty,
        producerStatus: r.obs_status,
        producerUnit: r.unit,
        producerDecimal: values.tokens.get(pointer + "/decimal") ?? null,
        annotations: r.footnote
          ? [{ verbatim: r.footnote, sourceRef: annotationRef }]
          : [],
        priceBasis: { kind: "unknown" },
        sourceRefs: [],
        limitations: [],
        review: "draft",
      });
      report.present++;
      cells.push({
        state: "present",
        observation: observationPin(observation),
      });
      const oldToken =
        legacyIndex < 0
          ? null
          : legacyParsed.tokens.get(
              `/countries/${legacyIndex}/values/${code}/value`,
            );
      if (oldToken !== token) report.selectedTokenDifferences++;
      if (
        !old ||
        old.year !== Number(r.date) ||
        old.status !== r.obs_status ||
        old.footnote !== r.footnote
      )
        report.yearStatusNoteDifferences++;
    }
    context.add({
      ...base("coverage", "country-" + series.family),
      selection: {
        kind: "country-latest-window",
        startYear: 2020,
        endYear: 2025,
        rule: "latest-non-null",
        indicator: code,
        countryMetadataSource: observationPin(countrySource),
        valuesSource: observationPin(valueSource),
        indicatorMetadataSource: observationPin(metadataSource),
        measure: observationPin(measure),
        nonaggregateRule: "country-metadata-region-id-not-NA",
      },
      cells,
      sourceRefs: [],
      exclusions: [
        "Aggregate regions are retained in raw source context but excluded from this country matrix.",
      ],
      limitations: [
        "Latest non-null fact per fixed window; not a normalized six-year time series.",
      ],
      review: "draft",
    });
  }
  if (report.present + report.missing !== report.cells)
    fail("Country matrix is incomplete");
  report.mortalityWithoutBounds.sort(ordered);
  report.rawFiles = [...sources.values()]
    .filter((s) => s.id.startsWith("wb-"))
    .map((s) => s.payload.raw);
  report.records = [...context.selected.values()];
  return report;
}

export function assertInitialWorldBankObservations(report) {
  const value = observationClone(report);
  const actualPins = value.rawFiles
    .map((p) => ({ sha256: p.sha256, bytes: p.bytes }))
    .sort((a, b) => ordered(a.sha256, b.sha256));
  const initialPins = initialInputs.sources
    .filter((s) => s.input.name.startsWith("wb-"))
    .map((s) => ({ sha256: s.input.sha256, bytes: s.input.bytes }))
    .sort((a, b) => ordered(a.sha256, b.sha256));
  if (
    !same(actualPins, initialPins) ||
    actualPins.reduce((n, p) => n + p.bytes, 0) !== 2087188 ||
    value.economies !== 217 ||
    value.cells !== 1085 ||
    value.present !== 1050 ||
    value.missing !== 35 ||
    value.mortalityBounds !== 190 ||
    !same(value.mortalityWithoutBounds, [
      "AND",
      "COD",
      "PSE",
      "ROU",
      "TLS",
      "XKX",
    ]) ||
    value.producerRows !== 7980 ||
    value.selectedTokenDifferences ||
    value.yearStatusNoteDifferences ||
    value.identityDifferences ||
    value.definitionDifferences
  )
    fail(
      "Initial source assertions differ; report a new vintage rather than repairing the old one",
    );
  return observationFreeze({
    economies: 217,
    cells: 1085,
    present: 1050,
    missing: 35,
    mortalityBounds: 190,
    mortalityWithoutBounds: ["AND", "COD", "PSE", "ROU", "TLS", "XKX"],
    legacyTokenYearStatusNoteIdentityDefinitionDifferences: 0,
  });
}

function worldBankInput(prepared, definitions, legacyBytes, seriesDefinitions) {
  const responses = prepared.manifest.inputs
    .filter((i) => i.name.startsWith("wb-"))
    .map((i) => {
      const spec = definitions.sources.find((s) => s.input.name === i.name),
        id = i.name.slice(3),
        role =
          id === "country-metadata"
            ? "country-metadata"
            : id.startsWith("values-")
              ? "indicator-values"
              : "indicator-metadata";
      const series = seriesDefinitions.find((s) =>
        id.endsWith(s.code.toLowerCase().replaceAll(".", "-")),
      );
      return {
        role,
        indicator: role === "country-metadata" ? null : series?.code,
        url: i.url,
        retrievedAt: i.retrievedAt,
        sha256: i.sha256,
        bytes: prepared.files.get(spec.input.name),
      };
    });
  return {
    format: "charitology-worldbank-preparation",
    version: 1,
    window: { startYear: 2020, endYear: 2025 },
    responses,
    legacyComparison: {
      path: "src/data/countries.json",
      bytes: legacyBytes,
      sha256: observationRawHash(legacyBytes),
    },
  };
}

export function assembleObservationRecords(
  prepared,
  baseline,
  previousRecords = [],
) {
  const files = new Map(baseline.files.map((f) => [f.path, f.bytes]));
  const definitions = strictObservationJson(
    files.get("src/data/observation-definitions.json"),
  );
  const sourceDefinitions = validateObservationSourceRoles(
    strictObservationJson(files.get("src/data/observation-source-inputs.json")),
  );
  if (
    definitions.format !== "charitology-observation-definitions" ||
    definitions.version !== 1 ||
    sourceDefinitions.format !== "charitology-observation-source-definitions" ||
    sourceDefinitions.version !== 1
  )
    fail("Unknown source definition version");
  const legacyBytes = files.get("src/data/countries.json");
  if (
    definitions.legacyComparison?.path !== "src/data/countries.json" ||
    definitions.legacyComparison.sha256 !== observationRawHash(legacyBytes) ||
    definitions.legacyComparison.declaredRetrievedDay !==
      strictObservationJson(legacyBytes).retrieved
  )
    fail(
      "Declared legacy comparison must match its exact source baseline bytes/day",
    );
  if (prepared.manifest.inputs.length !== sourceDefinitions.sources.length)
    fail("Complete declared source preparation is required");
  const context = sourceContext(
      definitions,
      sourceDefinitions,
      previousRecords,
    ),
    sources = prepareSources(prepared, context);
  const report = worldBank(
    worldBankInput(
      prepared,
      sourceDefinitions,
      files.get("src/data/countries.json"),
      definitions.series,
    ),
    context,
    sources,
  );
  const templates = new Map(
      sourceDefinitions.templates.map((t) => [stableKey(t), t]),
    ),
    active = new Set();
  function build(key) {
    if (context.selected.has(key)) return context.selected.get(key);
    if (active.has(key)) fail("Cyclic interpretation templates");
    active.add(key);
    const template = templates.get(key);
    if (!template) fail("Missing interpretation template");
    function remap(value) {
      if (Array.isArray(value)) return value.map(remap);
      if (!value || typeof value !== "object") return value;
      if (
        value.kind &&
        same(Object.keys(value).sort(), ["hash", "id", "kind", "version"])
      )
        return observationPin(build(stableKey(value)));
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, remap(v)]),
      );
    }
    const record = context.add(remap(template));
    active.delete(key);
    return record;
  }
  for (const key of templates.keys()) build(key);
  return {
    records: [...context.selected.values()].sort((a, b) =>
      ordered(observationRecordKey(a), observationRecordKey(b)),
    ),
    files: context.files,
    report,
    definitions,
  };
}

// Standalone adapter uses the declared immutable support definitions. The capture
// path additionally verifies every complete private original through preparation.
export function prepareWorldBankObservations(input) {
  validateObservationSourceRoles(initialInputs);
  input = copyWorldBankPreparation(input);
  const responses = input.responses;
  if (!Array.isArray(responses) || responses.length !== 11)
    fail("Eleven source responses are required");
  const context = sourceContext(initialDefinitions, initialInputs),
    sources = new Map();
  for (const spec of initialInputs.sources.filter(
    (s) => !s.input.name.startsWith("wb-"),
  ))
    sources.set(spec.record.id, context.add(spec.record));
  const wbSpecs = initialInputs.sources.filter((s) =>
    s.input.name.startsWith("wb-"),
  );
  // Source supports are already immutable; install dynamic WB records with exact source bytes.
  for (const spec of wbSpecs) {
    const r = responses.find((v) =>
      spec.input.name === "wb-country-metadata"
        ? v.role === "country-metadata"
        : v.indicator &&
          spec.input.name.endsWith(
            v.indicator.toLowerCase().replaceAll(".", "-"),
          ) &&
          (spec.input.name.startsWith("wb-values-")
            ? v.role === "indicator-values"
            : v.role === "indicator-metadata"),
    );
    if (!r || r.url !== spec.input.url)
      fail("Missing World Bank role or mismatched request URL");
    const record = observationClone(spec.record),
      parsed = observationJsonTokens(r.bytes).value;
    record.rawSha256 = r.sha256;
    record.rawBytes = r.bytes.byteLength;
    record.retrievedAt = r.retrievedAt;
    record.payload.raw = context.blob(r.bytes);
    if (r.role === "indicator-values") {
      record.sourceUpdatedDay = parsed[0]?.lastupdated;
      record.producerMetadata = [
        { field: "sourceid", literal: String(parsed[0]?.sourceid) },
        { field: "lastupdated", literal: String(parsed[0]?.lastupdated) },
      ];
    } else if (r.role === "indicator-metadata")
      record.producerMetadata = [
        { field: "unit", literal: parsed[1]?.[0]?.unit },
      ];
    if (r.indicator) {
      const def = responses.find(
        (v) => v.role === "indicator-metadata" && v.indicator === r.indicator,
      );
      record.rights.originalProducerCredit = observationJsonTokens(
        def.bytes,
      ).value[1][0].sourceOrganization;
    }
    sources.set(record.id, context.add(record));
  }
  return observationFreeze(worldBank(input, context, sources));
}
