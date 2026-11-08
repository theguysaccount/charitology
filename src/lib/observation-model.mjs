import {
  OBSERVATION_LIMITS as L,
  ObservationError,
  observationFail as fail,
  observationClone as clone,
  observationFreeze as freeze,
  observationText,
  observationBytes,
  canonicalObservationJson as canonical,
  observationObjectHash as objectHash,
  observationRawHash as rawHash,
  observationPrettyJson as pretty,
  strictObservationJson as strict,
  observationJsonTokens,
} from "./observation-canonical.mjs";
import { types as utilTypes } from "node:util";
// Node-only admission. Actual browser leaves do not import this build model.
import { parsePlanClusterCsv, PLAN_CLUSTER_SELECTION as PC, PLAN_CLUSTER_CAUSE_BINDING as PC_CAUSE,
  PLAN_CLUSTER_DEFINITION, PLAN_CLUSTER_HEADERS } from "./humanitarian-plan-cluster/model.mjs";
import { fundingDecimal } from "./humanitarian-funding/model.mjs";
import { PLAN_CLUSTER_PERIOD_LABEL, PLAN_CLUSTER_UNKNOWN_REMAINDER,
  PLAN_CLUSTER_IDENTITY_COLUMNS, PLAN_CLUSTER_MEASURES, PLAN_CLUSTER_METADATA_URL } from "./humanitarian-plan-cluster/interpretation.mjs";
export {
  OBSERVATION_LIMITS,
  ObservationError,
  observationFail,
  canonicalObservationJson,
  observationObjectHash,
  observationRawHash,
  observationPrettyJson,
  strictObservationJson,
  observationJsonTokens,
} from "./observation-canonical.mjs";

const requireThat = (condition, message, path = "") => {
  if (!condition) fail("invalid_data", message, path);
};
const key = (p) => `${p.kind}/${p.id}/${p.version}`;
const same = (a, b) => canonical(a) === canonical(b);
const pin = (r) => ({
  kind: r.kind,
  id: r.id,
  version: r.version,
  hash: r.hash,
});
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const pinCompare = (a, b) =>
  cmp(a.kind, b.kind) || cmp(a.id, b.id) || a.version - b.version;
const kinds = [
  "entity",
  "scope",
  "measure",
  "source",
  "observation",
  "coverage",
];
const roots = {
  entity: "entities",
  scope: "scopes",
  measure: "measures",
  source: "sources",
  observation: "observations",
  coverage: "coverage",
};
const idRx = /^[a-z][a-z0-9-]{0,99}$/;
const hashRx = /^[a-f0-9]{64}$/;
const S =
  (max = 4096, empty = false) =>
  (v, p) => {
    observationText(v, max, p, empty);
  };
const lit = (x) => (v, p) => requireThat(v === x, `Expected ${String(x)}`, p);
const choice = (xs) => (v, p) =>
  requireThat(xs.includes(v), "Unknown variant", p);
const integer =
  (min = 0, max = Number.MAX_SAFE_INTEGER) =>
  (v, p) =>
    requireThat(
      Number.isSafeInteger(v) && v >= min && v <= max,
      "Invalid integer",
      p,
    );
const nullable = (s) => (v, p) => {
  if (v !== null) s(v, p);
};
const regex =
  (rx, max = 240) =>
  (v, p) => {
    S(max)(v, p);
    requireThat(rx.test(v), "Invalid string shape", p);
  };
const ID = regex(idRx, 100),
  HASH = regex(hashRx, 64);
const arr =
  (s, max = 20, min = 0) =>
  (v, p) => {
    requireThat(
      Array.isArray(v) && v.length >= min && v.length <= max,
      "Array count limit",
      p,
    );
    for (let i = 0; i < v.length; i++) s(v[i], `${p}/${i}`);
  };
const obj =
  (shape) =>
  (v, p = "") => {
    requireThat(
      v !== null && typeof v === "object" && !Array.isArray(v),
      "Expected object",
      p,
    );
    requireThat(
      same(Object.keys(v).sort(), Object.keys(shape).sort()),
      "Unknown or missing property",
      p,
    );
    for (const [k, s] of Object.entries(shape)) s(v[k], `${p}/${k}`);
  };
const variant = (map) => (v, p) => {
  requireThat(
    v && typeof v === "object" && Object.hasOwn(map, v.kind),
    "Unknown tagged object",
    p,
  );
  map[v.kind](v, p);
};
const day = (v, p) => {
  S(10)(v, p);
  requireThat(
    /^\d{4}-\d{2}-\d{2}$/.test(v) && v.slice(0, 4) !== "0000",
    "Invalid Gregorian date",
    p,
  );
  let d;
  try {
    d = new Date(v + "T00:00:00.000Z").toISOString().slice(0, 10);
  } catch {}
  requireThat(d === v, "Invalid Gregorian date", p);
};
const instant = (v, p) => {
  S(24)(v, p);
  requireThat(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
      v.slice(0, 4) !== "0000",
    "Invalid canonical instant",
    p,
  );
  let s;
  try {
    s = new Date(v).toISOString();
  } catch {}
  requireThat(s === v, "Invalid canonical instant", p);
};
const url = (v, p) => {
  S(2048)(v, p);
  requireThat(!/[\\\u0000-\u0020\u007f]/.test(v), "Unsafe URL literal", p);
  let u;
  try {
    u = new URL(v);
  } catch {}
  requireThat(
    u?.protocol === "https:" && !u.username && !u.password,
    "HTTPS without credentials required",
    p,
  );
};
const pathValue = (v, p) => {
  S(240)(v, p);
  requireThat(
    v === "registry.json" ||
      /^(?:entities|scopes|measures|sources|observations|coverage)\/[a-z][a-z0-9-]{0,99}\.v[1-9]\d{0,5}\.json$/.test(
        v,
      ) ||
      /^editions\/[a-z][a-z0-9-]{0,99}\.json$/.test(v) ||
      /^(?:raw|evidence)\/[a-f0-9]{64}\.(?:json|txt)$/.test(v),
    "Invalid allowed file path",
    p,
  );
};
const PIN = (kind = null) =>
  obj({
    kind: kind ? lit(kind) : choice(kinds),
    id: ID,
    version: integer(1, 100000),
    hash: HASH,
  });
const EPIN = obj({ id: ID, hash: HASH, sequence: integer(1, 20) });
const FILE = obj({
  path: pathValue,
  sha256: HASH,
  bytes: integer(1, L.historyBytes),
});
const BLOB = obj({
  path: pathValue,
  sha256: HASH,
  bytes: integer(1, L.structuredObjectBytes),
  mediaType: choice(["application/json", "text/plain"]),
});
const decimalSchema = (v, p) => {
  obj({ coefficient: S(39), exponent: integer(-18, 18) })(v, p);
  requireThat(
    /^(?:0|-?[1-9][0-9]{0,37})$/.test(v.coefficient) &&
      (!v.coefficient.endsWith("0") || v.coefficient === "0") &&
      (v.coefficient !== "0" || v.exponent === 0),
    "Noncanonical decimal",
    p,
  );
};
function normalized(coefficient, exponent) {
  let c = BigInt(coefficient),
    e = exponent;
  if (c === 0n) return { coefficient: "0", exponent: 0 };
  while (c % 10n === 0n) {
    c /= 10n;
    e++;
  }
  const d = { coefficient: c.toString(), exponent: e };
  decimalSchema(d, "decimal");
  return d;
}
export function observationDecimalFromLexeme(token) {
  S(128)(token, "token");
  const m = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(
    token,
  );
  requireThat(m, "Invalid source number token");
  const exponent = Number(m[4] ?? 0) - (m[3]?.length ?? 0);
  requireThat(
    Number.isSafeInteger(exponent) && Math.abs(exponent) <= 10000,
    "Exponent overflow",
  );
  return freeze(normalized((m[1] || "") + m[2] + (m[3] ?? ""), exponent));
}
export function observationScaledDecimal(token, scale) {
  const a = observationDecimalFromLexeme(token);
  decimalSchema(scale, "scale");
  return freeze(
    normalized(
      BigInt(a.coefficient) * BigInt(scale.coefficient),
      a.exponent + scale.exponent,
    ),
  );
}
export function observationDecimalText(input) {
  const d = clone(input);
  decimalSchema(d, "decimal");
  const neg = d.coefficient[0] === "-",
    digits = neg ? d.coefficient.slice(1) : d.coefficient;
  let s;
  if (d.exponent >= 0) s = digits + "0".repeat(d.exponent);
  else {
    const n = digits.length + d.exponent;
    s =
      n > 0
        ? digits.slice(0, n) + "." + digits.slice(n)
        : "0." + "0".repeat(-n) + digits;
  }
  return (neg ? "-" : "") + s;
}
const decimalCompare = (a, b) => {
  const e = Math.min(a.exponent, b.exponent),
    x = BigInt(a.coefficient) * 10n ** BigInt(a.exponent - e),
    y = BigInt(b.coefficient) * 10n ** BigInt(b.exponent - e);
  return x < y ? -1 : x > y ? 1 : 0;
};
const expected = (v, p) => {
  requireThat(v && typeof v === "object", "Expected source match", p);
  if (v.kind === "null") obj({ kind: lit("null") })(v, p);
  else
    obj({
      kind: choice(["string", "number-token"]),
      value: S(v.kind === "number-token" ? 128 : 4096, true),
    })(v, p);
  if (v.kind === "number-token") observationDecimalFromLexeme(v.value);
};
const pointerValue = (v, p) => {
  S(1024, true)(v, p);
  requireThat(v === "" || v.startsWith("/"), "Invalid JSON pointer", p);
  requireThat(!/~(?![01])/u.test(v), "Invalid JSON pointer escape", p);
};
const locator = variant({
  json: obj({
    kind: lit("json"),
    pointer: pointerValue,
    matches: arr(obj({ pointer: pointerValue, expected }), 8),
  }),
  csv: obj({
    kind: lit("csv"), recordNumber: integer(2, 10001), firstLine: integer(2, L.rawSourceBytes),
    lastLine: integer(2, L.rawSourceBytes), byteStart: integer(1, L.rawSourceBytes),
    byteEnd: integer(2, L.rawSourceBytes), rawSha256: HASH,
    column: choice(PLAN_CLUSTER_HEADERS),
    matches: arr(obj({ column: choice(PLAN_CLUSTER_HEADERS), expected: S(2000, true) }), 12),
  }),
  pdf: obj({
    kind: lit("pdf"),
    pdfPage: integer(1, 100000),
    printedPage: nullable(S(240)),
    section: arr(S(240), 8),
    row: arr(S(240), 8),
    column: arr(S(240), 8),
  }),
  text: obj({ kind: lit("text"), section: arr(S(240), 8), excerpt: S(4096) }),
});
const ref = obj({
  source: PIN("source"),
  role: choice([
    "value",
    "annotation",
    "definition",
    "unit",
    "period",
    "scope",
    "identity",
    "rights",
  ]),
  locator,
});
const refs = arr(ref, 20),
  notes = arr(S(4096), 20),
  unknown = obj({ kind: lit("unknown") });
const reuse = variant({
  "explicit-license": obj({
    kind: lit("explicit-license"),
    label: S(240),
    termsUrl: url,
    evidence: refs,
  }),
  "publisher-default-inference": obj({
    kind: lit("publisher-default-inference"),
    label: S(240),
    termsUrl: url,
    attribution: S(8192),
    evidence: refs,
    humanReview: lit("pending"),
  }),
  "linked-document-only": obj({
    kind: lit("linked-document-only"),
    note: S(4096),
  }),
});
const rights = obj({
  returnedLicense: nullable(S(8192, true)),
  publicReuse: reuse,
  attribution: S(8192),
  originalProducerCredit: S(8192),
  limitations: notes,
});
const payload = variant({
  "public-json": obj({
    kind: lit("public-json"),
    raw: BLOB,
    adapter: choice([
      "world-bank-country-v1",
      "world-bank-indicator-v1",
      "world-bank-values-v1",
    ]),
  }),
  "public-csv": obj({ kind: lit("public-csv"), raw: BLOB, adapter: lit("ocha-fts-plan-cluster-v1") }),
  "public-text-evidence": obj({ kind: lit("public-text-evidence"), raw: BLOB }),
  "external-document": obj({
    kind: lit("external-document"),
    mediaType: choice(["application/pdf", "text/html", "application/json"]),
    publicExcerpt: nullable(BLOB),
  }),
});
const identifier = (v, p) => {
  obj({
    kind: choice(["ein", "iso2", "iso3", "producer-country"]),
    value: S(100),
    sourceRefs: refs,
  })(v, p);
  const rx = { ein: /^\d{9}$/, iso2: /^[A-Z]{2}$/, iso3: /^[A-Z]{3}$/ }[v.kind];
  if (rx) requireThat(rx.test(v.value), "Invalid source identifier", p);
};
const geography = variant({
  "country-economy": obj({
    kind: lit("country-economy"),
    entity: PIN("entity"),
  }),
  unknown: obj({ kind: lit("unknown"), note: S(4096) }),
});
const unit = variant({
  count: obj({
    kind: lit("count"),
    label: lit("people"),
    denominator: lit(null),
  }),
  duration: obj({
    kind: lit("duration"),
    label: lit("years"),
    denominator: lit(null),
  }),
  rate: obj({
    kind: lit("rate"),
    label: S(240),
    denominator: obj({
      label: S(240),
      definition: S(16384),
      scale: decimalSchema,
    }),
  }),
  currency: obj({
    kind: lit("currency"),
    label: lit("USD"),
    currency: lit("USD"),
    denominator: lit(null),
  }),
});
const families = [
  "population",
  "life-expectancy",
  "under-five-mortality",
  "electricity-access",
  "basic-water-access",
  "assets",
  "liabilities",
  "net-assets",
  "expenses",
  "humanitarian-plan-requirements",
  "humanitarian-plan-funding",
];
const legacyMeasure = obj({
  id: S(100),
  label: S(240),
  unit: S(240),
  note: S(4096),
  indicatorUrl: url,
  queryUrl: url,
  definition: S(16384),
  organization: S(8192),
});
const period = variant({
  "stock-day": obj({ kind: lit("stock-day"), day }),
  "closed-interval": obj({
    kind: lit("closed-interval"),
    start: day,
    end: day,
    sourceLabel: S(4096),
  }),
  "year-ended": obj({
    kind: lit("year-ended"),
    end: day,
    literalStart: lit(null),
    sourceLabel: S(4096),
  }),
  "calendar-year": obj({
    kind: lit("calendar-year"),
    year: integer(1900, 2100),
  }),
});
const precision = variant({
  unknown,
  "reported-quantum": obj({
    kind: lit("reported-quantum"),
    quantum: decimalSchema,
    sourceRefs: refs,
  }),
});
const uncertainty = nullable(
  obj({
    kind: lit("producer-reported-bounds"),
    lower: decimalSchema,
    upper: decimalSchema,
    confidence: lit(null),
    verbatimNote: S(4096),
    sourceRef: ref,
    parser: lit("world-bank-mortality-bound-v1"),
  }),
);
const cell = (v, p) => {
  requireThat(v && typeof v === "object", "Invalid coverage cell", p);
  if (v.state === "present")
    obj({ state: lit("present"), observation: PIN("observation") })(v, p);
  else
    obj({
      entity: PIN("entity"),
      scope: PIN("scope"),
      measure: PIN("measure"),
      state: lit("missing"),
      reason: choice(["producer-null-throughout-window", "producer-empty-source-field"]),
      sourceRefs: refs,
    })(v, p);
};
const selection = variant({
  "explicit-plan-cluster": obj({
    kind: lit("explicit-plan-cluster"), rule: lit("one-selected-source-plan-cluster"),
    source: PIN("source"), scope: PIN("scope"), measures: arr(PIN("measure"), 2, 2),
    tuple: obj({ countryCode: lit("AFG"), planId: lit("1185"), clusterCode: lit("7415"), year: lit(2024) }),
    unknownRemainder: lit(PLAN_CLUSTER_UNKNOWN_REMAINDER),
  }),
  "country-latest-window": obj({
    kind: lit("country-latest-window"),
    startYear: lit(2020),
    endYear: lit(2025),
    rule: lit("latest-non-null"),
    indicator: S(100),
    countryMetadataSource: PIN("source"),
    valuesSource: PIN("source"),
    indicatorMetadataSource: PIN("source"),
    measure: PIN("measure"),
    nonaggregateRule: lit("country-metadata-region-id-not-NA"),
  }),
  "explicit-financial-panel": obj({
    kind: lit("explicit-financial-panel"),
    rule: lit("selected-consolidated-audit-rows"),
    panels: arr(
      obj({
        scope: PIN("scope"),
        measures: arr(PIN("measure"), L.measures, 1),
      }),
      L.scopes,
      1,
    ),
    unknownRemainder: S(4096),
  }),
});
const base = {
  format: lit("charitology-observation-record"),
  schemaVersion: lit(1),
  id: ID,
  version: integer(1, 100000),
  previous: nullable(PIN()),
  hash: HASH,
};
const tail = { sourceRefs: refs, limitations: notes, review: lit("draft") };
const schemas = {
  entity: obj({
    ...base,
    kind: lit("entity"),
    entityKind: choice([
      "country-economy",
      "legal-organization",
      "reporting-group",
    ]),
    label: S(240),
    identifiers: arr(identifier, 8),
    aliases: arr(obj({ label: S(240), sourceRefs: refs }), 20),
    memberEntities: arr(PIN("entity"), 8),
    profileRefs: arr(regex(/^[a-z0-9][a-z0-9-]{0,99}$/, 100), 8),
    countryMetadata: nullable(
      obj({ producerRegionId: S(240), producerRegionLabel: S(240) }),
    ),
    ...tail,
  }),
  scope: (v, p) => { const shape = {
    ...base,
    kind: lit("scope"),
    entity: PIN("entity"),
    scopeKind: choice(["national-statistics", "consolidated-reporting-group", "humanitarian-plan-cluster"]),
    label: S(240),
    includedEntities: arr(PIN("entity"), 8, 1),
    consolidation: choice([
      "not-applicable",
      "consolidated-with-eliminations",
      "consolidated-unspecified-eliminations",
    ]),
    geography,
    exclusions: notes,
    ...tail,
  };
    if (v?.scopeKind === "humanitarian-plan-cluster") shape.planCluster = obj({
      source: PIN("source"), countryCode: lit("AFG"), planId: lit("1185"), planCode: lit("HAFG24"),
      planName: lit(PC.planName), clusterCode: lit("7415"), clusterName: lit("Education"), referenceYear: lit(2024),
      period: obj({ start: lit(PC.start), end: lit(PC.end) }),
      causeBinding: obj({ method: lit(PC_CAUSE.method), causeId: lit("education"), sourceClusterName: lit("Education"), basis: lit(PC_CAUSE.basis), review: lit("draft") }),
    });
    obj(shape)(v, p);
  },
  measure: obj({
    ...base,
    kind: lit("measure"),
    label: S(240),
    measureKind: choice([
      "stock",
      "flow",
      "population-count",
      "period-duration",
      "rate",
      "planning-budget",
      "reported-funding",
    ]),
    family: choice(families),
    producerCode: nullable(S(100)),
    definition: S(16384),
    unit,
    method: S(16384),
    legacyCountry: nullable(legacyMeasure),
    ...tail,
  }),
  source: obj({
    ...base,
    kind: lit("source"),
    url,
    publisher: S(8192),
    title: S(240),
    retrievedAt: instant,
    sourceUpdatedDay: nullable(day),
    reportDay: nullable(day),
    publishedAt: nullable(
      variant({
        day: obj({ kind: lit("day"), day }),
        instant: obj({ kind: lit("instant"), instant }),
      }),
    ),
    rawSha256: HASH,
    rawBytes: integer(1, L.privateOriginalBytes),
    payload,
    producerMetadata: arr(obj({ field: S(240), literal: S(8192, true) }), 20),
    rights,
    limitations: notes,
    review: lit("draft"),
  }),
  observation: obj({
    ...base,
    kind: lit("observation"),
    entity: PIN("entity"),
    scope: PIN("scope"),
    measure: PIN("measure"),
    period,
    reported: obj({
      token: S(128),
      parser: choice(["json-number-v1", "printed-integer-v1", "csv-decimal-v1"]),
      scale: decimalSchema,
      valueRef: ref,
    }),
    value: decimalSchema,
    precision,
    uncertainty,
    producerStatus: nullable(S(4096, true)),
    producerUnit: nullable(S(4096, true)),
    producerDecimal: nullable(S(4096, true)),
    annotations: arr(obj({ verbatim: S(4096), sourceRef: ref }), 8),
    priceBasis: unknown,
    ...tail,
  }),
  coverage: obj({
    ...base,
    kind: lit("coverage"),
    selection,
    cells: arr(cell, L.coverageCellsPerRecord, 1),
    exclusions: notes,
    ...tail,
  }),
};
const countryProjectionSchema = obj({
  title: S(240),
  window: S(4096),
  publisher: S(8192),
  licenseSummary: S(4096),
  scope: S(4096),
  countrySourceUrl: url,
  retrievalRule: lit("maximum-input-retrieval-day"),
  review: lit("draft"),
  reviewNote: S(4096),
});
const editionSchema = obj({
  format: lit("charitology-observation-edition"),
  version: lit(1),
  id: ID,
  sequence: integer(1, L.editions),
  capturedAt: instant,
  sourceCommit: regex(/^[a-f0-9]{40}$/, 40),
  method: obj({
    id: choice(["observation-capture-v1", "observation-plan-cluster-append-v1"]),
    definitionSha256: HASH,
    adapterSha256: HASH,
  }),
  supersedes: nullable(EPIN),
  records: arr(PIN(), 12500, 1),
  coverage: arr(PIN("coverage"), L.coverageRecords, 1),
  legacyComparison: obj({
    path: lit("src/data/countries.json"),
    sha256: HASH,
    declaredRetrievedDay: day,
  }),
  countryProjection: countryProjectionSchema,
  limitations: notes,
  review: lit("draft"),
  hash: HASH,
});
const registrySchema = obj({
  format: lit("charitology-observation-registry"),
  version: lit(1),
  current: EPIN,
  editions: arr(EPIN, L.editions, 1),
  records: arr(PIN(), 12500, 1),
  files: arr(FILE, L.files, 1),
  hash: HASH,
});
const excerptSchema = obj({
  format: lit("charitology-financial-transcription"),
  schemaVersion: lit(1),
  documentSha256: HASH,
  assertions: arr(
    obj({
      id: ID,
      locator: (v, p) => {
        locator(v, p);
        requireThat(v.kind === "pdf", "Financial locator must be PDF", p);
      },
      token: S(128),
      parser: lit("printed-integer-v1"),
      scale: decimalSchema,
      support: arr(
        variant({
          "same-document": obj({ kind: lit("same-document"), locator }),
          "other-source": obj({ kind: lit("other-source"), ref }),
        }),
        20,
      ),
      note: S(4096),
    }),
    20,
    1,
  ),
  review: lit("draft"),
});

const handles = new WeakMap(),
  projections = new WeakMap();
function ownedHandle(input) {
  const value = handles.get(input);
  requireThat(value, "Unowned observation registry handle");
  return value;
}
function ownedProjection(input) {
  const value = projections.get(input);
  requireThat(value, "Unowned observation projection");
  return value;
}
function each(value, callback, path = []) {
  callback(value, path);
  if (Array.isArray(value))
    for (let i = 0; i < value.length; i++)
      each(value[i], callback, [...path, i]);
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) each(v, callback, [...path, k]);
}
function isPin(v) {
  return (
    v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    same(Object.keys(v).sort(), ["hash", "id", "kind", "version"])
  );
}
function resolvePin(ctx, p) {
  const r = ctx.records.get(key(p));
  requireThat(r && r.hash === p.hash, "Unresolved exact record pin");
  return r;
}
function unique(values, label) {
  const set = new Set(values);
  requireThat(set.size === values.length, `Duplicate ${label}`);
  return set;
}
function jsonPointer(tree, pointer) {
  let out = tree;
  for (const part of pointer.split("/").slice(1)) {
    const k = part.replaceAll("~1", "/").replaceAll("~0", "~");
    requireThat(
      out !== null && typeof out === "object" && Object.hasOwn(out, k),
      "Unresolved source JSON pointer",
    );
    if (Array.isArray(out))
      requireThat(/^(?:0|[1-9][0-9]*)$/.test(k), "Noncanonical array pointer");
    out = out[k];
  }
  return out;
}
function checkReference(ctx, r) {
  const s = resolvePin(ctx, r.source),
    loc = r.locator;
  if (loc.kind === "csv") {
    const parsed = ctx.csvSources.get(key(s)), item = parsed?.selected;
    requireThat(s.payload.kind === "public-csv" && item, "CSV locator requires the strict selected CSV source");
    const { column, matches, kind: _, ...span } = loc;
    requireThat(same(span, item.locator), "CSV original byte/record/line/hash locator mismatch");
    unique(matches.map(m => m.column), "CSV locator match column");
    for (const m of matches) requireThat(item.raw[m.column] === m.expected, "CSV selected-row literal mismatch");
    return { source: s, value: item.raw[column], token: item.raw[column] };
  }
  if (loc.kind === "json") {
    const parsed = ctx.rawTrees.get(key(s));
    requireThat(parsed, "JSON locator without public JSON source");
    const value = jsonPointer(parsed.value, loc.pointer);
    for (const m of loc.matches) {
      const actual = jsonPointer(parsed.value, m.pointer),
        e = m.expected;
      if (e.kind === "number-token")
        requireThat(
          parsed.tokens.get(m.pointer) === e.value,
          "Source numeric identity mismatch",
        );
      else if (e.kind === "null")
        requireThat(actual === null, "Source null match failed");
      else
        requireThat(
          actual === e.value && typeof actual === "string",
          "Source literal identity mismatch",
        );
    }
    return { source: s, value, token: parsed.tokens.get(loc.pointer) };
  }
  if (loc.kind === "text") {
    const blob =
      s.payload.kind === "external-document"
        ? s.payload.publicExcerpt
        : s.payload.kind === "public-text-evidence"
          ? s.payload.raw
          : null;
    requireThat(
      blob &&
        blob.mediaType === "text/plain" &&
        ctx.files[blob.path].includes(loc.excerpt),
      "Text locator does not match retained evidence",
    );
  }
  return { source: s };
}
function closurePaths(ctx, edition) {
  const set = new Set([`editions/${edition.id}.json`]),
    selected = new Set(edition.records.map(key));
  for (const p of edition.records) {
    const r = resolvePin(ctx, p);
    set.add(`${roots[r.kind]}/${r.id}.v${r.version}.json`);
    each(r, (v, path) => {
      if (path[0] === "previous") return;
      if (isPin(v) && path[0] !== "previous")
        requireThat(
          selected.has(key(v)),
          "Factual dependency absent from edition",
        );
    });
    if (r.kind === "source") {
      const blob =
        r.payload.kind === "external-document"
          ? r.payload.publicExcerpt
          : r.payload.raw;
      if (blob) {
        set.add(blob.path);
        const packet = ctx.packets.get(blob.path);
        if (packet)
          each(packet, (v) => {
            if (isPin(v))
              requireThat(
                selected.has(key(v)),
                "Packet factual dependency absent from edition",
              );
          });
      }
    }
  }
  return [...set].sort();
}
export function observationFileTexts(input) {
  return ownedHandle(input).publicTexts;
}

// Full admission and projections are defined below; no filesystem or source fetching belongs here.
function amountToken(reported) {
  if (reported.parser === "json-number-v1") return reported.token;
  if (reported.parser === "csv-decimal-v1") {
    let d;
    try { d = fundingDecimal(reported.token); } catch { fail("invalid_data", "Invalid exact CSV decimal token"); }
    requireThat(d !== null, "A blank CSV token is missing coverage, never a numeric observation");
    return observationDecimalText(normalized(d.coefficient, -d.scale));
  }
  requireThat(
    /^-?(?:0|[1-9][0-9]*|[1-9][0-9]{0,2}(?:,[0-9]{3})+)$/.test(reported.token),
    "Malformed printed integer",
  );
  return reported.token.replaceAll(",", "");
}
function validateSemantics(ctx) {
  let allCells = 0;
  const sourceDeps = new Map(),
    entityDeps = new Map();
  for (const r of ctx.records.values()) {
    each(r, (v, path) => {
      if (isPin(v)) resolvePin(ctx, v);
      if (
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        same(Object.keys(v).sort(), ["locator", "role", "source"])
      )
        checkReference(ctx, v);
    });
    if (r.previous) {
      requireThat(
        r.version > 1 &&
          r.previous.kind === r.kind &&
          r.previous.id === r.id &&
          r.previous.version === r.version - 1,
        "Broken previous version lineage",
      );
    } else requireThat(r.version === 1, "Missing previous version");
    if (r.kind === "entity") {
      unique(
        r.identifiers.map((x) => `${x.kind}/${x.value}`),
        "identifier",
      );
      unique(r.profileRefs, "profile reference");
      unique(r.memberEntities.map(key), "entity member");
      entityDeps.set(key(r), r.memberEntities.map(key));
      if (r.entityKind === "country-economy") {
        requireThat(
          r.countryMetadata !== null && r.memberEntities.length === 0,
          "Country metadata/member mismatch",
        );
        for (const k of ["iso2", "iso3", "producer-country"])
          requireThat(
            r.identifiers.filter((i) => i.kind === k).length === 1,
            "Country identifier missing/duplicate",
          );
      } else
        requireThat(
          r.countryMetadata === null,
          "Organization cannot carry country metadata",
        );
      if (r.entityKind !== "legal-organization")
        requireThat(
          r.identifiers.every((x) => x.kind !== "ein"),
          "EIN belongs only to legal identity",
        );
      if (r.entityKind !== "reporting-group")
        requireThat(
          r.memberEntities.length === 0,
          "Only reporting groups have legal members",
        );
      else {
        requireThat(
          r.memberEntities.length > 0,
          "Reporting group requires legal members",
        );
        for (const p of r.memberEntities)
          requireThat(
            resolvePin(ctx, p).entityKind === "legal-organization",
            "Group member is not a legal organization",
          );
      }
    }
    if (r.kind === "scope") {
      const e = resolvePin(ctx, r.entity);
      unique(r.includedEntities.map(key), "scope member");
      if (r.scopeKind === "national-statistics")
        requireThat(
          e.entityKind === "country-economy" &&
            r.consolidation === "not-applicable" &&
            same(r.includedEntities, [r.entity]) &&
            r.geography.kind === "country-economy" &&
            same(r.geography.entity, r.entity),
          "National scope identity disagreement",
        );
      else if (r.scopeKind === "humanitarian-plan-cluster") {
        const source = resolvePin(ctx, r.planCluster.source), parsed = ctx.csvSources.get(key(source));
        requireThat(e.entityKind === "country-economy" && e.id === "country-afg" &&
          e.identifiers.some(i => i.kind === "iso3" && i.value === "AFG") &&
          r.consolidation === "not-applicable" && same(r.includedEntities, [r.entity]) &&
          r.geography.kind === "country-economy" && same(r.geography.entity, r.entity) && parsed,
          "Plan-cluster source/country/scope identity mismatch");
        requireThat(r.exclusions.includes(PLAN_CLUSTER_UNKNOWN_REMAINDER), "Plan-cluster coverage limitation missing");
      }
      else
        requireThat(
          e.entityKind === "reporting-group" &&
            r.consolidation !== "not-applicable" &&
            same(
              [...r.includedEntities].sort(pinCompare),
              [...e.memberEntities].sort(pinCompare),
            ) &&
            r.geography.kind === "unknown",
          "Consolidated scope identity/member/geography disagreement",
        );
    }
    if (r.kind === "measure") {
      const rules = {
        population: ["population-count", "count"],
        "life-expectancy": ["period-duration", "duration"],
        "under-five-mortality": ["rate", "rate"],
        "electricity-access": ["rate", "rate"],
        "basic-water-access": ["rate", "rate"],
        assets: ["stock", "currency"],
        liabilities: ["stock", "currency"],
        "net-assets": ["stock", "currency"],
        expenses: ["flow", "currency"],
        "humanitarian-plan-requirements": ["planning-budget", "currency"],
        "humanitarian-plan-funding": ["reported-funding", "currency"],
      };
      requireThat(
        rules[r.family][0] === r.measureKind &&
          rules[r.family][1] === r.unit.kind,
        "Measure family/kind/unit mismatch",
      );
      const codes = {
        population: "SP.POP.TOTL",
        "life-expectancy": "SP.DYN.LE00.IN",
        "under-five-mortality": "SH.DYN.MORT",
        "electricity-access": "EG.ELC.ACCS.ZS",
        "basic-water-access": "SH.H2O.BASW.ZS",
      };
      if (codes[r.family]) {
        requireThat(
          r.legacyCountry !== null &&
            r.producerCode === codes[r.family] &&
            r.legacyCountry.id === r.producerCode &&
            r.legacyCountry.definition === r.definition,
          "Country definition/legacy mismatch",
        );
      } else if (r.family.startsWith("humanitarian-plan-")) {
        requireThat(r.legacyCountry === null && r.producerCode ===
          (r.family === "humanitarian-plan-requirements" ? "requirements" : "funding"),
          "Plan-cluster measure cannot acquire national/expense identity");
        const definition = PLAN_CLUSTER_MEASURES[r.producerCode];
        requireThat(r.label === definition.label && r.definition === definition.definition && r.method === definition.method,
          "Plan-cluster measure must retain the reviewed fixed definition");
      } else
        requireThat(
          r.legacyCountry === null && r.producerCode === null,
          "Financial measure cannot carry country adapter metadata",
        );
      if (r.unit.kind === "rate") {
        const expected =
          r.family === "under-five-mortality"
            ? { coefficient: "1", exponent: 3 }
            : { coefficient: "1", exponent: 2 };
        requireThat(
          same(r.unit.denominator.scale, expected),
          "Rate denominator scale mismatch",
        );
      }
    }
    if (r.kind === "source") {
      if (r.payload.kind === "public-json") {
        const tree = ctx.rawTrees.get(key(r)).value,
          header = Array.isArray(tree) ? tree[0] : tree;
        const updated =
          header &&
          typeof header === "object" &&
          Object.hasOwn(header, "lastupdated")
            ? header.lastupdated
            : null;
        if (updated !== null) day(updated, "source/lastupdated");
        requireThat(
          r.sourceUpdatedDay === updated,
          "Source updated date differs from exact returned metadata",
        );
        const licenses = new Set();
        each(tree, (value, path) => {
          if (path.at(-1) === "license" && typeof value === "string")
            licenses.add(value);
        });
        requireThat(
          licenses.size <= 1 &&
            r.rights.returnedLicense ===
              (licenses.size ? [...licenses][0] : null),
          "Returned license is not the literal source field",
        );
      } else
        requireThat(
          r.rights.returnedLicense === null,
          "External/text evidence has no returned structured license field",
        );
      const deps = [];
      each(r.rights, (v) => {
        if (isPin(v)) deps.push(key(v));
      });
      const blob =
        r.payload.kind === "external-document"
          ? r.payload.publicExcerpt
          : r.payload.raw;
      if (blob) {
        requireThat(
          ctx.files[blob.path] !== undefined,
          "Missing public source blob",
        );
        requireThat(
          rawHash(ctx.files[blob.path]) === blob.sha256 &&
            Buffer.byteLength(ctx.files[blob.path]) === blob.bytes,
          "Source blob byte/hash mismatch",
        );
        requireThat(
          blob.path ===
            `${r.payload.kind === "external-document" ? "evidence" : "raw"}/${blob.sha256}.${blob.mediaType === "application/json" ? "json" : "txt"}`,
          "Source blob path/hash/media mismatch",
        );
        if (r.payload.kind !== "external-document") {
          requireThat(
            blob.sha256 === r.rawSha256 &&
              blob.bytes === r.rawBytes &&
              blob.bytes <= L.rawSourceBytes,
            "Public raw identity/limit mismatch",
          );
        }
        const packet = ctx.packets.get(blob.path);
        if (packet) {
          requireThat(
            packet.documentSha256 === r.rawSha256,
            "Financial transcription PDF hash mismatch",
          );
          each(packet, (v) => {
            if (isPin(v)) {
              resolvePin(ctx, v);
              deps.push(key(v));
            }
            if (
              v &&
              typeof v === "object" &&
              !Array.isArray(v) &&
              same(Object.keys(v).sort(), ["locator", "role", "source"])
            )
              checkReference(ctx, v);
          });
        }
      }
      if (r.payload.kind === "public-json")
        requireThat(
          r.payload.raw.mediaType === "application/json" &&
            r.rights.publicReuse.kind !== "linked-document-only",
          "Public JSON lacks explicit rights basis",
        );
      if (r.payload.kind === "public-csv")
        requireThat(r.url === PLAN_CLUSTER_DEFINITION.source.resourceUrl && r.payload.raw.mediaType === "text/plain" &&
          r.rights.returnedLicense === null && r.rights.publicReuse.kind === "explicit-license" &&
          r.rights.publicReuse.termsUrl === PLAN_CLUSTER_DEFINITION.rights.termsUrl &&
          r.rights.attribution === PLAN_CLUSTER_DEFINITION.rights.attribution, "CSV source identity/rights/media mismatch");
      if (r.payload.kind === "public-csv") {
        const ev = r.rights.publicReuse.evidence;
        requireThat(ev.length === 1 && ev[0].locator.kind === "text", "CSV licensing evidence must be one bounded metadata excerpt");
        const metadata = resolvePin(ctx, ev[0].source);
        requireThat(metadata.payload.kind === "external-document" && metadata.payload.mediaType === "application/json" &&
          metadata.url === PLAN_CLUSTER_METADATA_URL && metadata.payload.publicExcerpt?.mediaType === "text/plain" &&
          metadata.rights.publicReuse.kind === "linked-document-only" &&
          ev[0].locator.section.includes(PLAN_CLUSTER_DEFINITION.source.resourceId) &&
          ev[0].locator.excerpt.includes('/result/license_id: "cc-by-igo"') &&
          ev[0].locator.excerpt.includes(PLAN_CLUSTER_DEFINITION.source.resourceId),
          "CSV rights evidence requires the separate selected HDX JSON excerpt, not full-wrapper reuse");
      }
      if (r.payload.kind === "public-text-evidence")
        requireThat(
          r.payload.raw.mediaType === "text/plain",
          "Text evidence media mismatch",
        );
      if (r.rights.publicReuse.kind !== "linked-document-only")
        requireThat(
          r.rights.publicReuse.evidence.length > 0 &&
            r.rights.publicReuse.evidence.every((x) => x.role === "rights"),
          "Rights evidence missing or incorrectly scoped",
        );
      sourceDeps.set(key(r), deps);
    }
    if (r.kind === "observation") {
      const scope = resolvePin(ctx, r.scope),
        measure = resolvePin(ctx, r.measure);
      requireThat(
        same(r.entity, scope.entity),
        "Observation scope/entity disagreement",
      );
      requireThat(
        r.reported.valueRef.role === "value",
        "Value reference must have value role",
      );
      requireThat(
        same(
          observationScaledDecimal(amountToken(r.reported), r.reported.scale),
          r.value,
        ),
        "Reported token/scale/decimal disagreement",
      );
      requireThat(
        decimalCompare(r.reported.scale, { coefficient: "0", exponent: 0 }) > 0,
        "Scale must be positive",
      );
      if (r.period.kind === "closed-interval")
        requireThat(r.period.start <= r.period.end, "Reversed explicit period");
      if (measure.family.startsWith("humanitarian-plan-")) {
        const column = measure.producerCode, loc = r.reported.valueRef.locator;
        requireThat(scope.scopeKind === "humanitarian-plan-cluster" &&
          same(scope.planCluster.source, r.reported.valueRef.source) &&
          same(r.period, { kind: "closed-interval", start: PC.start, end: PC.end, sourceLabel: PLAN_CLUSTER_PERIOD_LABEL }) &&
          r.reported.parser === "csv-decimal-v1" && loc.kind === "csv" && loc.column === column &&
          same(loc.matches.map(m => m.column), PLAN_CLUSTER_IDENTITY_COLUMNS) &&
          same(r.reported.scale, { coefficient: "1", exponent: 0 }) && r.precision.kind === "unknown" && r.uncertainty === null &&
          r.producerStatus === null && r.producerUnit === null && r.producerDecimal === null && r.annotations.length === 0,
          "Plan-cluster value/period/parser/precision identity mismatch");
      } else if (measure.measureKind === "stock")
        requireThat(
          r.period.kind === "stock-day",
          "Stock requires a stock date",
        );
      else if (measure.measureKind === "flow")
        requireThat(
          ["closed-interval", "year-ended"].includes(r.period.kind),
          "Flow requires explicit source period",
        );
      else
        requireThat(
          r.period.kind === "calendar-year",
          "Country fact requires calendar year",
        );
      if (r.precision.kind === "reported-quantum")
        requireThat(
          decimalCompare(r.precision.quantum, {
            coefficient: "0",
            exponent: 0,
          }) > 0 && r.precision.sourceRefs.length > 0,
          "Invalid reporting quantum",
        );
      const replay = checkReference(ctx, r.reported.valueRef);
      if (r.reported.parser === "json-number-v1")
        requireThat(
          r.reported.valueRef.locator.kind === "json" &&
            replay.token === r.reported.token,
          "Numeric source lexeme mismatch",
        );
      else if (r.reported.parser === "csv-decimal-v1") {
        requireThat(measure.family.startsWith("humanitarian-plan-") && replay.token === r.reported.token,
          "CSV reported source token mismatch");
      } else {
        requireThat(
          r.reported.valueRef.locator.kind === "pdf" &&
            replay.source.payload.kind === "external-document" &&
            replay.source.payload.mediaType === "application/pdf",
          "Printed value requires PDF source",
        );
        const packet = ctx.packets.get(
          replay.source.payload.publicExcerpt?.path,
        );
        requireThat(
          packet &&
            packet.assertions.filter(
              (a) =>
                same(a.locator, r.reported.valueRef.locator) &&
                a.token === r.reported.token &&
                a.parser === r.reported.parser &&
                same(a.scale, r.reported.scale),
            ).length === 1,
          "No unique exact financial transcription assertion",
        );
        requireThat(
          r.precision.kind === "reported-quantum" &&
            same(r.precision.quantum, r.reported.scale),
          "Printed integer quantum must retain the exact reported source scale",
        );
      }
      for (const a of r.annotations) {
        const result = checkReference(ctx, a.sourceRef);
        if (a.sourceRef.locator.kind === "json")
          requireThat(
            result.value === a.verbatim,
            "Annotation differs from retained source literal",
          );
      }
      if (r.uncertainty) {
        const u = r.uncertainty,
          m =
            /^Uncertainty bound is ((?:0|[1-9][0-9]*)(?:\.[0-9]+)?) - ((?:0|[1-9][0-9]*)(?:\.[0-9]+)?)$/.exec(
              u.verbatimNote,
            );
        requireThat(
          m &&
            same(observationDecimalFromLexeme(m[1]), u.lower) &&
            same(observationDecimalFromLexeme(m[2]), u.upper),
          "Unsupported or mismatched mortality bounds",
        );
        requireThat(
          decimalCompare(u.lower, r.value) <= 0 &&
            decimalCompare(r.value, u.upper) <= 0,
          "Point outside producer bounds",
        );
        const source = checkReference(ctx, u.sourceRef);
        requireThat(
          u.sourceRef.locator.kind === "json" &&
            source.value === u.verbatimNote &&
            measure.family === "under-five-mortality",
          "Bounds source note mismatch",
        );
      }
    }
    if (r.kind === "coverage") {
      allCells += r.cells.length;
      requireThat(
        allCells <= L.coverageCellsAllHistory,
        "Whole historical coverage cell limit",
      );
      validateCoverage(ctx, r);
    }
  }
  function acyclic(graph, label) {
    const active = new Set(),
      done = new Set();
    function visit(k) {
      if (done.has(k)) return;
      requireThat(!active.has(k), `${label} cycle`);
      active.add(k);
      for (const d of graph.get(k) ?? []) visit(d);
      active.delete(k);
      done.add(k);
    }
    for (const k of graph.keys()) visit(k);
  }
  acyclic(sourceDeps, "Source dependency");
  acyclic(entityDeps, "Group membership");
}
function validateCoverage(ctx, r) {
  const s = r.selection,
    identities = [];
  if (s.kind === "explicit-plan-cluster") {
    const source = resolvePin(ctx, s.source), scope = resolvePin(ctx, s.scope), parsed = ctx.csvSources.get(key(source));
    requireThat(parsed && scope.scopeKind === "humanitarian-plan-cluster" && same(scope.planCluster.source, s.source), "Plan-cluster selection source/scope mismatch");
    requireThat(s.measures.length === 2 && r.cells.length === 2, "Plan-cluster requires exactly two selected cells");
    for (let i = 0; i < 2; i++) {
      const measure = resolvePin(ctx, s.measures[i]), column = i === 0 ? "requirements" : "funding", cell = r.cells[i];
      requireThat(measure.family === `humanitarian-plan-${column === "requirements" ? "requirements" : "funding"}` && measure.producerCode === column, "Plan-cluster measure order mismatch");
      if (parsed.selected.raw[column] === "") {
        requireThat(cell.state === "missing" && cell.reason === "producer-empty-source-field" && same(cell.entity, scope.entity) &&
          same(cell.scope, s.scope) && same(cell.measure, s.measures[i]) && cell.sourceRefs.length === 1,
          "Blank CSV column requires one exact missing coverage cell");
        const ref = cell.sourceRefs[0], result = checkReference(ctx, ref);
        requireThat(ref.role === "value" && same(ref.source, s.source) && ref.locator.kind === "csv" && ref.locator.column === column &&
          same(ref.locator.matches.map(m => m.column), PLAN_CLUSTER_IDENTITY_COLUMNS) && result.value === "", "Missing CSV source proof mismatch");
      } else {
        requireThat(cell.state === "present", "Present CSV token cannot become missing or zero");
        const observation = resolvePin(ctx, cell.observation);
        requireThat(same(observation.entity, scope.entity) && same(observation.scope, s.scope) && same(observation.measure, s.measures[i]) &&
          same(observation.reported.valueRef.source, s.source), "Plan-cluster present cell identity mismatch");
      }
    }
    return;
  }
  if (s.kind === "explicit-financial-panel") {
    const expected = [];
    unique(
      s.panels.map((p) => key(p.scope)),
      "financial panel scope",
    );
    for (const panel of s.panels) {
      requireThat(
        resolvePin(ctx, panel.scope).scopeKind ===
          "consolidated-reporting-group",
        "Financial panel scope mismatch",
      );
      unique(panel.measures.map(key), "financial panel definition");
      for (const m of panel.measures) {
        requireThat(
          resolvePin(ctx, m).unit.kind === "currency",
          "Nonfinancial panel definition",
        );
        expected.push(`${key(panel.scope)}|${key(m)}`);
      }
    }
    for (const cell of r.cells) {
      requireThat(
        cell.state === "present",
        "Financial panel has missing numeric fact",
      );
      const o = resolvePin(ctx, cell.observation);
      identities.push(`${key(o.scope)}|${key(o.measure)}`);
    }
    requireThat(
      same([...unique(identities, "financial cell")].sort(), expected.sort()),
      "Financial panel selection not complete",
    );
    return;
  }
  const countrySource = resolvePin(ctx, s.countryMetadataSource),
    valuesSource = resolvePin(ctx, s.valuesSource),
    indicatorSource = resolvePin(ctx, s.indicatorMetadataSource),
    measure = resolvePin(ctx, s.measure);
  requireThat(
    countrySource.payload.kind === "public-json" &&
      countrySource.payload.adapter === "world-bank-country-v1" &&
      valuesSource.payload.kind === "public-json" &&
      valuesSource.payload.adapter === "world-bank-values-v1" &&
      indicatorSource.payload.kind === "public-json" &&
      indicatorSource.payload.adapter === "world-bank-indicator-v1",
    "Country source adapter mismatch",
  );
  const metadata = ctx.rawTrees.get(key(countrySource)).value,
    values = ctx.rawTrees.get(key(valuesSource)),
    definition = ctx.rawTrees.get(key(indicatorSource)).value;
  for (const input of [metadata, values.value, definition])
    requireThat(
      Array.isArray(input) &&
        input.length === 2 &&
        input[0] &&
        typeof input[0] === "object" &&
        !Array.isArray(input[0]) &&
        input[0].page === 1 &&
        input[0].pages === 1 &&
        Array.isArray(input[1]) &&
        Number.isSafeInteger(Number(input[0].total)) &&
        Number(input[0].total) === input[1].length,
      "Incomplete source pagination/row count",
    );
  requireThat(
    measure.producerCode === s.indicator &&
      definition[1].length === 1 &&
      definition[1][0].id === s.indicator &&
      definition[1][0].sourceNote === measure.definition &&
      definition[1][0].sourceOrganization ===
        measure.legacyCountry?.organization,
    "Country indicator definition/credit mismatch",
  );
  const economies = new Map();
  for (const row of metadata[1]) {
    requireThat(
      row &&
        typeof row === "object" &&
        !Array.isArray(row) &&
        row.region &&
        typeof row.region === "object" &&
        typeof row.region.id === "string",
      "Malformed producer country metadata",
    );
    if (row.region.id !== "NA") {
      requireThat(
        typeof row.id === "string" &&
          /^[A-Z]{3}$/.test(row.id) &&
          typeof row.iso2Code === "string" &&
          /^[A-Z]{2}$/.test(row.iso2Code) &&
          typeof row.name === "string" &&
          typeof row.region.value === "string" &&
          !economies.has(row.id),
        "Duplicate/invalid country metadata identity",
      );
      economies.set(row.id, row);
    }
  }
  requireThat(economies.size <= L.entities, "Country count exceeds limit");
  const rows = new Map();
  for (const [index, row] of values.value[1].entries()) {
    requireThat(
      row &&
        typeof row === "object" &&
        !Array.isArray(row) &&
        row.indicator?.id === s.indicator &&
        typeof row.country?.id === "string" &&
        typeof row.countryiso3code === "string" &&
        typeof row.date === "string" &&
        /^202[0-5]$/.test(row.date) &&
        (row.value === null || typeof row.value === "number"),
      "Invalid producer row identity/window/value",
    );
    for (const field of ["obs_status", "unit", "footnote"])
      if (Object.hasOwn(row, field))
        requireThat(
          typeof row[field] === "string" && row[field].length <= 4096,
          "Invalid returned producer string",
        );
    if (Object.hasOwn(row, "decimal"))
      requireThat(
        typeof row.decimal === "string" || Number.isSafeInteger(row.decimal),
        "Invalid producer decimal literal",
      );
    const k = `${row.country.id}|${row.indicator.id}|${row.date}`;
    requireThat(!rows.has(k), "Duplicate producer country/indicator/year");
    rows.set(k, { row, index });
  }
  for (const cell of r.cells) {
    const o =
        cell.state === "present" ? resolvePin(ctx, cell.observation) : null,
      e = resolvePin(ctx, o ? o.entity : cell.entity),
      scope = resolvePin(ctx, o ? o.scope : cell.scope),
      m = o ? o.measure : cell.measure;
    requireThat(
      e.entityKind === "country-economy" &&
        scope.scopeKind === "national-statistics" &&
        same(scope.entity, pin(e)) &&
        same(m, s.measure),
      "Country coverage identity/scope/measure mismatch",
    );
    const ids = Object.fromEntries(e.identifiers.map((x) => [x.kind, x.value])),
      meta = economies.get(ids.iso3);
    requireThat(
      meta &&
        ids.iso2 === meta.iso2Code &&
        ids["producer-country"] === meta.iso2Code &&
        e.label === meta.name &&
        e.countryMetadata.producerRegionId === meta.region.id &&
        e.countryMetadata.producerRegionLabel === meta.region.value,
      "Country metadata identity/region mismatch",
    );
    identities.push(meta.id);
    const candidates = [];
    for (let year = 2020; year <= 2025; year++) {
      const found = rows.get(
        `${ids["producer-country"]}|${s.indicator}|${year}`,
      );
      requireThat(
        found && found.row.countryiso3code === ids.iso3,
        "Missing/join-mismatched source year",
      );
      candidates.push(found);
    }
    const valid = candidates
      .filter((x) => x.row.value !== null)
      .sort((a, b) => cmp(b.row.date, a.row.date));
    if (o) {
      requireThat(
        o.reported.parser === "json-number-v1" &&
          same(o.reported.scale, { coefficient: "1", exponent: 0 }) &&
          o.precision.kind === "unknown",
        "Country adapter cannot invent scale or measured precision",
      );
      requireThat(valid.length > 0, "Present cell without producer value");
      const { row, index } = valid[0],
        base = `/1/${index}`;
      requireThat(
        same(o.reported.valueRef.source, s.valuesSource) &&
          o.reported.valueRef.locator.kind === "json" &&
          o.reported.valueRef.locator.pointer === base + "/value" &&
          o.period.year === Number(row.date),
        "Country selected value is not exact latest non-null",
      );
      const expectedMatches = [
        ["country/id", ids["producer-country"]],
        ["countryiso3code", ids.iso3],
        ["indicator/id", s.indicator],
        ["date", row.date],
      ];
      for (const [suffix, value] of expectedMatches)
        requireThat(
          o.reported.valueRef.locator.matches.some(
            (x) =>
              x.pointer === `${base}/${suffix}` &&
              same(x.expected, { kind: "string", value }),
          ),
          "Value locator lacks exact source identity/year assertion",
        );
      requireThat(
        o.producerStatus ===
          (Object.hasOwn(row, "obs_status") ? row.obs_status : null) &&
          o.producerUnit === (Object.hasOwn(row, "unit") ? row.unit : null) &&
          o.producerDecimal ===
            (Object.hasOwn(row, "decimal") ? String(row.decimal) : null),
        "Producer returned metadata mismatch",
      );
      requireThat(
        same(
          o.annotations.map((x) => x.verbatim),
          row.footnote ? [row.footnote] : [],
        ),
        "Producer annotation omitted or changed",
      );
      requireThat(
        !!o.uncertainty === !!row.footnote?.startsWith("Uncertainty bound is "),
        "Producer mortality bounds omitted or invented",
      );
    } else {
      requireThat(cell.reason === "producer-null-throughout-window", "Country missing reason cannot use another adapter");
      requireThat(
        valid.length === 0 && cell.sourceRefs.length === 6,
        "Missing coverage must prove six null source values",
      );
      const indices = [];
      for (const ref of cell.sourceRefs) {
        const found = checkReference(ctx, ref);
        requireThat(
          same(ref.source, s.valuesSource) &&
            ref.role === "value" &&
            ref.locator.kind === "json" &&
            found.value === null,
          "Missing cell is not exact producer null",
        );
        const match = /^\/1\/(\d+)\/value$/.exec(ref.locator.pointer);
        requireThat(match, "Invalid missing row locator");
        const index = Number(match[1]),
          row = values.value[1][index],
          base = `/1/${index}`;
        for (const [suffix, value] of [
          ["country/id", ids["producer-country"]],
          ["countryiso3code", ids.iso3],
          ["indicator/id", s.indicator],
          ["date", row?.date],
        ])
          requireThat(
            ref.locator.matches.some(
              (x) =>
                x.pointer === `${base}/${suffix}` &&
                same(x.expected, { kind: "string", value }),
            ),
            "Missing value locator lacks exact identity/year assertion",
          );
        indices.push(index);
      }
      requireThat(
        same(
          indices.sort((a, b) => a - b),
          candidates.map((x) => x.index).sort((a, b) => a - b),
        ),
        "Missing cell incomplete/duplicate row proof",
      );
    }
  }
  requireThat(
    same(
      [...unique(identities, "country coverage cell")].sort(),
      [...economies.keys()].sort(),
    ),
    "Country finite denominator incomplete/out of set",
  );
}
export function validateObservationFiles(input) {
  requireThat(
    input &&
      typeof input === "object" &&
      !utilTypes.isProxy(input) &&
      !Array.isArray(input) &&
      Object.getPrototypeOf(input) === Object.prototype,
    "ObservationFiles must be a plain object",
  );
  const desc = Object.getOwnPropertyDescriptors(input),
    names = Reflect.ownKeys(desc);
  requireThat(
    names.length <= L.files + 1 && names.every((k) => typeof k === "string"),
    "File count/symbol limit",
  );
  const files = {};
  let historyBytes = 0;
  for (const name of names) {
    pathValue(name, "path");
    const d = desc[name];
    requireThat(
      d.enumerable && Object.hasOwn(d, "value"),
      "Hidden/accessor file refused",
    );
    const max =
      name.startsWith("raw/") || name.endsWith(".txt")
        ? L.rawSourceBytes
        : L.structuredObjectBytes;
    const { bytes, text } = observationBytes(d.value, max);
    historyBytes += bytes.length;
    requireThat(
      historyBytes <= L.historyBytes,
      "Whole stored history byte limit",
    );
    Object.defineProperty(files, name, { value: text, enumerable: true });
  }
  requireThat(Object.hasOwn(files, "registry.json"), "Missing registry");
  const registry = strict(files["registry.json"]);
  registrySchema(registry, "registry");
  requireThat(
    objectHash(registry) === registry.hash,
    "Registry semantic hash mismatch",
  );
  requireThat(
    pretty(registry) === files["registry.json"],
    "Registry must be exact pretty JSON plus newline",
  );
  const expected = unique(
    registry.files.map((p) => p.path),
    "file inventory",
  );
  requireThat(
    !expected.has("registry.json") &&
      same(
        [...expected].sort(),
        names.filter((k) => k !== "registry.json").sort(),
      ),
    "Stored inventory orphan/missing file",
  );
  requireThat(
    same(
      registry.files.map((p) => p.path),
      registry.files.map((p) => p.path).sort(),
    ),
    "Registry file inventory must use canonical path order",
  );
  for (const p of registry.files)
    requireThat(
      rawHash(files[p.path]) === p.sha256 &&
        Buffer.byteLength(files[p.path]) === p.bytes,
      "Stored file byte pin mismatch",
    );
  const ctx = {
    files,
    registry,
    historyBytes,
    records: new Map(),
    editions: new Map(),
    rawTrees: new Map(),
    csvSources: new Map(),
    packets: new Map(),
  };
  for (const name of names) {
    if (
      name === "registry.json" ||
      name.startsWith("raw/") ||
      name.endsWith(".txt")
    )
      continue;
    const value = strict(files[name]);
    requireThat(
      pretty(value) === files[name],
      "Structured file must be exact pretty JSON plus newline",
    );
    if (name.startsWith("editions/")) {
      editionSchema(value, name);
      requireThat(
        name === `editions/${value.id}.json` && !ctx.editions.has(value.id),
        "Edition file identity mismatch",
      );
      requireThat(
        objectHash(value) === value.hash,
        "Edition semantic hash mismatch",
      );
      ctx.editions.set(value.id, value);
    } else if (name.startsWith("evidence/")) {
      excerptSchema(value, name);
      requireThat(
        name === `evidence/${rawHash(files[name])}.json`,
        "Evidence byte path mismatch",
      );
      unique(
        value.assertions.map((a) => a.id),
        "financial assertion ID",
      );
      unique(
        value.assertions.map((a) => canonical(a.locator)),
        "financial assertion locator",
      );
      ctx.packets.set(name, value);
    } else {
      requireThat(
        value && Object.hasOwn(schemas, value.kind),
        "Unknown record kind",
      );
      schemas[value.kind](value, name);
      requireThat(
        name === `${roots[value.kind]}/${value.id}.v${value.version}.json` &&
          !ctx.records.has(key(value)),
        "Record file identity mismatch",
      );
      requireThat(
        objectHash(value) === value.hash,
        "Record semantic hash mismatch",
      );
      ctx.records.set(key(value), value);
    }
  }
  const countLimits = {
    entity: L.entities,
    scope: L.scopes,
    measure: L.measures,
    source: L.sources,
    observation: L.observations,
    coverage: L.coverageRecords,
  };
  for (const kind of kinds)
    requireThat(
      [...ctx.records.values()].filter((r) => r.kind === kind).length <=
        countLimits[kind],
      `Historical ${kind} count limit`,
    );
  requireThat(
    same(registry.records, [...ctx.records.values()].map(pin).sort(pinCompare)),
    "Registry records not exact canonical inventory",
  );
  requireThat(
    ctx.editions.size === registry.editions.length,
    "Registry edition inventory mismatch",
  );
  for (let i = 0; i < registry.editions.length; i++) {
    const p = registry.editions[i],
      e = ctx.editions.get(p.id);
    requireThat(
      e &&
        e.hash === p.hash &&
        e.sequence === p.sequence &&
        e.sequence === i + 1,
      "Edition sequence/pin mismatch",
    );
    requireThat(
      same(e.supersedes, i === 0 ? null : registry.editions[i - 1]),
      "Edition predecessor chain mismatch",
    );
  }
  requireThat(
    same(registry.current, registry.editions.at(-1)),
    "Current must be explicit latest retained sequence",
  );
  const usedBlobs = new Set();
  for (const source of ctx.records.values())
    if (source.kind === "source") {
      const blob =
        source.payload.kind === "external-document"
          ? source.payload.publicExcerpt
          : source.payload.raw;
      if (blob) usedBlobs.add(blob.path);
      if (source.payload.kind === "public-csv") {
        let parsed;
        try { parsed = parsePlanClusterCsv(new TextEncoder().encode(files[source.payload.raw.path])); }
        catch { fail("invalid_data", "Strict plan-cluster CSV source refused"); }
        ctx.csvSources.set(key(source), parsed);
      }
      if (source.payload.kind === "public-json") {
        const data = observationJsonTokens(
          files[source.payload.raw.path],
          L.rawSourceBytes,
        );
        ctx.rawTrees.set(key(source), data);
      }
    }
  requireThat(
    same(
      [...usedBlobs].sort(),
      names
        .filter((k) => k.startsWith("raw/") || k.startsWith("evidence/"))
        .sort(),
    ),
    "Orphan/missing public blob",
  );
  validateSemantics(ctx);
  const everSelected = new Set();
  for (const e of ctx.editions.values()) {
    for (const p of e.records) everSelected.add(key(p));
    requireThat(
      same(e.records, [...e.records].sort(pinCompare)) &&
        new Set(e.records.map((p) => `${p.kind}/${p.id}`)).size ===
          e.records.length,
      "Edition selected record order/identity duplicate",
    );
    for (const p of e.records) resolvePin(ctx, p);
    requireThat(
      same(
        [...e.coverage].sort(pinCompare),
        e.records.filter((p) => p.kind === "coverage"),
      ),
      "Edition coverage inventory mismatch",
    );
    const selected = e.records.map((p) => resolvePin(ctx, p)),
      country = selected.filter(
        (r) =>
          r.kind === "coverage" && r.selection.kind === "country-latest-window",
      );
    requireThat(
      country.length === 5 &&
        unique(
          country.map((c) => c.selection.indicator),
          "country series",
        ).size === 5 &&
        new Set(
          country.map((c) => canonical(c.selection.countryMetadataSource)),
        ).size === 1,
      "Edition requires five common-metadata country series",
    );
    const planRecords = selected.filter(r => r.scopeKind === "humanitarian-plan-cluster" ||
      r.payload?.kind === "public-csv" || r.family?.startsWith("humanitarian-plan-") ||
      r.reported?.parser === "csv-decimal-v1" || r.selection?.kind === "explicit-plan-cluster");
    if (e.method.id === "observation-capture-v1")
      requireThat(planRecords.length === 0, "Plan-cluster facts require their separately pinned append method");
    else {
      const coverages = selected.filter(r => r.kind === "coverage" && r.selection.kind === "explicit-plan-cluster"),
        csvSources = selected.filter(r => r.kind === "source" && r.payload.kind === "public-csv"),
        scopes = selected.filter(r => r.kind === "scope" && r.scopeKind === "humanitarian-plan-cluster"),
        measures = selected.filter(r => r.kind === "measure" && r.family.startsWith("humanitarian-plan-")),
        observations = selected.filter(r => r.kind === "observation" && r.reported.parser === "csv-decimal-v1");
      requireThat(coverages.length === 1 && csvSources.length === 1 && scopes.length === 1 && measures.length === 2,
        "Append method requires exactly one selected plan-cluster source/scope/two measures/coverage");
      const panel = coverages[0].selection, source = csvSources[0], metadata = resolvePin(ctx, source.rights.publicReuse.evidence[0].source);
      requireThat(same(panel.source, pin(source)) && same(panel.scope, pin(scopes[0])) &&
        same([...panel.measures].sort(pinCompare), measures.map(pin).sort(pinCompare)) &&
        same(coverages[0].cells.filter(c => c.state === "present").map(c => c.observation).sort(pinCompare), observations.map(pin).sort(pinCompare)),
        "Append method contains unbound or extra plan-cluster records");
      // This method admits one first append, not a general refresh or a
      // replacement of an earlier selected factual closure.
      requireThat(e.supersedes !== null, "Plan-cluster append requires a predecessor edition");
      requireThat(!registry.editions.some(p => p.sequence < e.sequence &&
        ctx.editions.get(p.id).method.id === "observation-plan-cluster-append-v1"),
        "Plan-cluster first append already exists in retained history");
      const predecessor = ctx.editions.get(e.supersedes.id);
      const priorRecords = predecessor.records.map(p => resolvePin(ctx, p));
      requireThat(!priorRecords.some(r => r.scopeKind === "humanitarian-plan-cluster" ||
        r.payload?.kind === "public-csv" || r.family?.startsWith("humanitarian-plan-") ||
        r.reported?.parser === "csv-decimal-v1" || r.selection?.kind === "explicit-plan-cluster"),
        "Plan-cluster recapture requires a separately reviewed method");
      requireThat(same(e.countryProjection, predecessor.countryProjection) &&
        same(e.legacyComparison, predecessor.legacyComparison),
        "First append must preserve prior country projection and legacy comparison");
      const priorPins = new Map(predecessor.records.map(p => [key(p), p]));
      requireThat(priorPins.has(key(scopes[0].entity)) && same(priorPins.get(key(scopes[0].entity)), scopes[0].entity),
        "First append must retain its exact prior country entity");
      const expectedPins = new Map(priorPins);
      for (const r of [coverages[0], source, scopes[0], ...measures, ...observations, metadata])
        expectedPins.set(key(r), pin(r));
      requireThat(same(e.records, [...expectedPins.values()].sort(pinCompare)),
        "First append must preserve every prior selected pin and add only its fixed plan closure");
      const started = record => {
        const fields = record.producerMetadata.filter(v => v.field === "clientRequestStartedAt");
        requireThat(fields.length === 1, "New source requires its explicit declared client start");
        instant(fields[0].literal, "clientRequestStartedAt");
        requireThat(fields[0].literal <= record.retrievedAt && record.retrievedAt <= e.capturedAt,
          "Assembly cannot predate declared source completion or reorder its start");
        return fields[0].literal;
      };
      started(source);
      requireThat(source.retrievedAt <= started(metadata), "Licensing metadata-after must follow CSV completion");
    }
    const closure = closurePaths(ctx, e);
    requireThat(
      closure.reduce((n, p) => n + Buffer.byteLength(files[p]), 0) <=
        L.editionClosureBytes,
      "Selected factual closure byte limit",
    );
  }
  requireThat(
    everSelected.size === ctx.records.size,
    "Unselected orphan record version",
  );
  ctx.publicTexts = freeze({ ...files });
  const handle = freeze({ registry, historyBytes });
  handles.set(handle, ctx);
  return handle;
}
export function observationFactualClosure(input, editionId) {
  const ctx = ownedHandle(input);
  ID(editionId, "editionId");
  const e = ctx.editions.get(editionId);
  requireThat(e, "Unknown edition");
  return freeze(
    closurePaths(ctx, e).map((path) => ({
      path,
      sha256: rawHash(ctx.files[path]),
      bytes: Buffer.byteLength(ctx.files[path]),
    })),
  );
}
export function observationProjection(input, editionId) {
  const ctx = ownedHandle(input);
  ID(editionId, "editionId");
  const e = ctx.editions.get(editionId);
  requireThat(e, "Unknown edition");
  const selected = e.records.map((p) => resolvePin(ctx, p));
  const value = {
    format: "charitology-observation-projection",
    version: 1,
    edition: { id: e.id, hash: e.hash, sequence: e.sequence },
    capturedAt: e.capturedAt,
    countryProjection: e.countryProjection,
    entities: selected
      .filter((r) => r.kind === "entity")
      .sort((a, b) => cmp(a.id, b.id)),
    scopes: selected
      .filter((r) => r.kind === "scope")
      .sort((a, b) => cmp(a.id, b.id)),
    measures: selected
      .filter((r) => r.kind === "measure")
      .sort((a, b) => cmp(a.id, b.id)),
    sources: selected
      .filter((r) => r.kind === "source")
      .sort((a, b) => cmp(a.id, b.id)),
    observations: selected
      .filter((r) => r.kind === "observation")
      .sort(
        (a, b) =>
          cmp(a.measure.id, b.measure.id) ||
          cmp(a.entity.id, b.entity.id) ||
          cmp(canonical(a.period), canonical(b.period)) ||
          a.version - b.version,
      ),
    coverage: selected
      .filter((r) => r.kind === "coverage")
      .sort((a, b) => cmp(a.id, b.id)),
    limitations: e.limitations,
  };
  freeze(value);
  projections.set(value, { ctx, edition: e });
  return value;
}
const filterSchema = obj({
  entityIds: arr(ID, L.entities),
  measureIds: arr(ID, L.measures),
  state: choice(["all", "present", "missing"]),
});
function selectedCells(input, requestedFilter) {
  const { ctx } = ownedProjection(input),
    filter = clone(requestedFilter);
  filterSchema(filter, "filter");
  unique(filter.entityIds, "filter entity");
  unique(filter.measureIds, "filter measure");
  const eids = new Set(input.entities.map((e) => e.id)),
    mids = new Set(input.measures.map((m) => m.id));
  for (const id of filter.entityIds)
    requireThat(eids.has(id), "Unknown filter entity");
  for (const id of filter.measureIds)
    requireThat(mids.has(id), "Unknown filter measure");
  const entries = [];
  for (const c of input.coverage)
    for (const [index, cell] of c.cells.entries()) {
      const o =
          cell.state === "present" ? resolvePin(ctx, cell.observation) : null,
        e = o ? o.entity : cell.entity,
        m = o ? o.measure : cell.measure;
      if (
        (!filter.entityIds.length || filter.entityIds.includes(e.id)) &&
        (!filter.measureIds.length || filter.measureIds.includes(m.id)) &&
        (filter.state === "all" || filter.state === cell.state)
      )
        entries.push({ coverage: c, index, cell, observation: o });
    }
  return { filter, entries };
}
export function coverageProjection(input, filter) {
  const { entries } = selectedCells(input, filter);
  const selected = new Set(entries.map((x) => key(x.coverage)));
  return freeze(input.coverage.filter((c) => selected.has(key(c))));
}
export function legacyCountriesProjection(input) {
  const { ctx } = ownedProjection(input),
    countryCoverage = input.coverage.filter(
      (c) => c.selection.kind === "country-latest-window",
    ),
    entities = input.entities.filter((e) => e.entityKind === "country-economy");
  const ids = {};
  for (const e of entities)
    ids[e.id] = Object.fromEntries(e.identifiers.map((i) => [i.kind, i.value]));
  const indicators = [];
  const countryMap = new Map(
    entities.map((e) => [
      e.id,
      {
        id: ids[e.id].iso3,
        iso2: ids[e.id].iso2,
        name: e.label,
        region: e.countryMetadata.producerRegionLabel,
        values: {},
      },
    ]),
  );
  let retrieved = "0001-01-01";
  for (const c of countryCoverage) {
    const m = resolvePin(ctx, c.selection.measure),
      legacy = m.legacyCountry,
      s = resolvePin(ctx, c.selection.valuesSource),
      raw = ctx.rawTrees.get(key(s));
    requireThat(legacy, "Missing legacy country definition");
    for (const sourcePin of [
      c.selection.countryMetadataSource,
      c.selection.valuesSource,
      c.selection.indicatorMetadataSource,
    ]) {
      const day = resolvePin(ctx, sourcePin).retrievedAt.slice(0, 10);
      if (day > retrieved) retrieved = day;
    }
    const lastUpdated = raw.value[0].lastupdated;
    requireThat(
      typeof lastUpdated === "string",
      "Missing source lastupdated literal",
    );
    indicators.push({
      id: legacy.id,
      label: legacy.label,
      unit: legacy.unit,
      note: legacy.note,
      url: legacy.indicatorUrl,
      apiUrl: legacy.queryUrl,
      lastUpdated,
      definition: legacy.definition,
      organization: legacy.organization,
    });
    for (const cell of c.cells)
      if (cell.state === "present") {
        const o = resolvePin(ctx, cell.observation);
        countryMap.get(o.entity.id).values[m.producerCode] = {
          value: Number(observationDecimalText(o.value)),
          year: o.period.year,
          footnote: o.annotations.map((x) => x.verbatim).join("\n"),
          status: o.producerStatus ?? "",
        };
      }
  }
  const meta = input.countryProjection;
  const countryOrder = [
    "SP.POP.TOTL",
    "SP.DYN.LE00.IN",
    "SH.DYN.MORT",
    "EG.ELC.ACCS.ZS",
    "SH.H2O.BASW.ZS",
  ];
  indicators.sort(
    (a, b) => countryOrder.indexOf(a.id) - countryOrder.indexOf(b.id),
  );
  return freeze({
    title: meta.title,
    retrieved,
    window: meta.window,
    publisher: meta.publisher,
    license: meta.licenseSummary,
    scope: meta.scope,
    countrySource: meta.countrySourceUrl,
    review: meta.review,
    reviewNote: meta.reviewNote,
    indicators,
    countries: [...countryMap.values()].sort((a, b) => cmp(a.id, b.id)),
  });
}
const selector = variant({
  scope: obj({ kind: lit("scope"), scope: PIN("scope") }),
  profile: obj({
    kind: lit("profile"),
    slug: regex(/^[a-z0-9][a-z0-9-]{0,99}$/, 100),
  }),
  ein: obj({ kind: lit("ein"), ein: regex(/^\d{9}$/, 9) }),
});
function resolveSelection(input, s) {
  const { ctx } = ownedProjection(input);
  let scopes = [];
  if (s.kind === "scope")
    scopes = input.scopes.filter((x) => same(pin(x), s.scope));
  else {
    const entities = input.entities.filter((e) =>
      s.kind === "profile"
        ? e.profileRefs.includes(s.slug)
        : e.entityKind === "legal-organization" &&
          e.identifiers.some((x) => x.kind === "ein" && x.value === s.ein),
    );
    const keys = new Set(entities.map(key));
    scopes = input.scopes.filter(
      (scope) =>
        keys.has(key(scope.entity)) ||
        scope.includedEntities.some((e) => keys.has(key(e))),
    );
  }
  requireThat(
    scopes.length <= 1,
    "Ambiguous selector maps to multiple reporting scopes",
  );
  return scopes[0] ?? null;
}
export function compareOrganizations(
  input,
  requestedSelection,
  requestedFamilies,
) {
  const selectionInput = clone(requestedSelection),
    familyInput = clone(requestedFamilies);
  arr(selector, 2, 2)(selectionInput, "selection");
  arr(choice(families), 100)(familyInput, "families");
  unique(familyInput, "comparison family");
  ownedProjection(input);
  const scopes = selectionInput.map((s) => resolveSelection(input, s));
  requireThat(
    !scopes[0] || !scopes[1] || !same(pin(scopes[0]), pin(scopes[1])),
    "Both selectors resolve the same scope",
  );
  const measures = new Map(input.measures.map((m) => [key(m), m]));
  const rows = [];
  for (const family of familyInput) {
    const sets = scopes.map((scope) =>
      scope
        ? input.observations.filter(
            (o) =>
              same(o.scope, pin(scope)) &&
              measures.get(key(o.measure)).family === family,
          )
        : [],
    );
    const cell = (i) => ({
      target: selectionInput[i],
      resolvedScope: scopes[i] ? pin(scopes[i]) : null,
      state: sets[i].length ? "present" : "not-collected",
      observations: sets[i].map(pin),
    });
    const reasons = new Set();
    let alignment = "not-collected";
    if (!sets[0].length || !sets[1].length) reasons.add("not-collected");
    else {
      alignment = sets[0].every((a) =>
        sets[1].every((b) => same(a.measure, b.measure)),
      )
        ? "same-definition"
        : "related-definitions";
      for (const a of sets[0])
        for (const b of sets[1]) {
          if (!same(a.measure, b.measure))
            reasons.add("different-measure-definition");
          if (a.period.kind === "stock-day" && b.period.kind === "stock-day") {
            if (a.period.day !== b.period.day)
              reasons.add("different-stock-day");
          } else if (!same(a.period, b.period))
            reasons.add("different-interval");
          if (a.period.kind === "year-ended" || b.period.kind === "year-ended")
            reasons.add("literal-interval-start-unknown");
          if (
            !same(
              measures.get(key(a.measure)).unit,
              measures.get(key(b.measure)).unit,
            )
          )
            reasons.add("different-unit-or-denominator");
          if (
            a.priceBasis.kind === "unknown" ||
            b.priceBasis.kind === "unknown" ||
            !same(a.priceBasis, b.priceBasis)
          )
            reasons.add("different-price-basis");
          if (
            a.precision.kind !== b.precision.kind ||
            (a.precision.kind === "reported-quantum" &&
              b.precision.kind === "reported-quantum" &&
              !same(a.precision.quantum, b.precision.quantum))
          )
            reasons.add("different-reporting-quantum");
          if (
            !a.uncertainty ||
            !b.uncertainty ||
            a.uncertainty.confidence === null ||
            b.uncertainty.confidence === null
          )
            reasons.add("uncertainty-unknown");
        }
      if (
        scopes[0].scopeKind !== scopes[1].scopeKind ||
        scopes[0].consolidation !== scopes[1].consolidation
      )
        reasons.add("different-consolidation-boundary");
      if (scopes.some((s) => s.geography.kind === "unknown"))
        reasons.add("service-geography-unknown");
    }
    rows.push({
      family,
      left: cell(0),
      right: cell(1),
      alignment,
      reasons: [...reasons].sort(),
    });
  }
  return freeze({
    format: "charitology-observation-comparison",
    version: 1,
    edition: input.edition,
    selection: selectionInput,
    rows,
    limitations: [
      "Source-reported facts have different scopes, dates and definitions. No subtraction, ratio, aggregation, ranking or impact inference is supplied.",
    ],
  });
}
const CSV_HEADER = [
  "edition_id",
  "edition_hash",
  "row_kind",
  "source_pin_json",
  "observation_pin_json",
  "coverage_pin_json",
  "coverage_cell_index",
  "coverage_selection_json",
  "entity_pin_json",
  "scope_pin_json",
  "measure_pin_json",
  "definition",
  "unit_json",
  "period_json",
  "reported_json",
  "value_json",
  "exact_decimal",
  "precision_json",
  "producer_status_json",
  "producer_unit_json",
  "producer_decimal_json",
  "annotations_json",
  "uncertainty_json",
  "price_basis_json",
  "source_refs_json",
  "source_metadata_json",
  "rights_json",
  "missing_reason",
  "export_notice",
];
const csvCell = (value) => {
  let s = String(value);
  if (/^[\s\u0000-\u001f\u007f-\u009f]*[=+\-@]/u.test(s) || /^[\t\r\n]/.test(s))
    s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
function selectedCsv(input, entries) {
  const { ctx } = ownedProjection(input),
    json = JSON.stringify,
    notice =
      "Selected facts/coverage report, not a complete source/history archive. Formula-sensitive text is apostrophe-prefixed; exact source text is retained in JSON/source detail. Private originals excluded. No aggregate, ranking or impact inference.";
  const lines = [CSV_HEADER.map(csvCell).join(",")];
  const base = (kind) =>
    Object.fromEntries(
      CSV_HEADER.map((k) => [k, k.endsWith("_json") ? "null" : ""]).concat([
        ["edition_id", input.edition.id],
        ["edition_hash", input.edition.hash],
        ["row_kind", kind],
        ["export_notice", notice],
      ]),
    );
  function append(row) {
    lines.push(CSV_HEADER.map((k) => csvCell(row[k])).join(","));
  }
  for (const { coverage, index, cell, observation: o } of entries) {
    const entity = resolvePin(ctx, o ? o.entity : cell.entity),
      scope = resolvePin(ctx, o ? o.scope : cell.scope),
      measure = resolvePin(ctx, o ? o.measure : cell.measure),
      refsMap = new Map();
    function collect(obj) {
      each(obj, (v) => {
        if (
          v &&
          typeof v === "object" &&
          !Array.isArray(v) &&
          same(Object.keys(v).sort(), ["locator", "role", "source"])
        )
          refsMap.set(canonical(v), v);
      });
    }
    for (const r of [entity, scope, measure, o ?? cell]) collect(r);
    const seen = new Set();
    for (let refs = [...refsMap.values()], i = 0; i < refs.length; i++) {
      const s = resolvePin(ctx, refs[i].source);
      if (!seen.has(key(s))) {
        seen.add(key(s));
        collect(s.rights);
        refs = [...refsMap.values()];
      }
    }
    const row = base(o ? "fact" : "missing");
    Object.assign(row, {
      observation_pin_json: json(o ? pin(o) : null),
      coverage_pin_json: json(pin(coverage)),
      coverage_cell_index: String(index),
      coverage_selection_json: json(coverage.selection),
      entity_pin_json: json(pin(entity)),
      scope_pin_json: json(pin(scope)),
      measure_pin_json: json(pin(measure)),
      definition: measure.definition,
      unit_json: json(measure.unit),
      period_json: json(o?.period ?? null),
      reported_json: json(o?.reported ?? null),
      value_json: json(o?.value ?? null),
      exact_decimal: o ? observationDecimalText(o.value) : "",
      precision_json: json(o?.precision ?? null),
      producer_status_json: json(o?.producerStatus ?? null),
      producer_unit_json: json(o?.producerUnit ?? null),
      producer_decimal_json: json(o?.producerDecimal ?? null),
      annotations_json: json(o?.annotations ?? []),
      uncertainty_json: json(o?.uncertainty ?? null),
      price_basis_json: json(o?.priceBasis ?? null),
      source_refs_json: json([...refsMap.values()]),
      missing_reason: o ? "" : cell.reason,
    });
    append(row);
  }
  for (const source of input.sources) {
    const { rights, ...metadata } = source;
    const row = base("source");
    row.source_pin_json = json(pin(source));
    row.source_metadata_json = json(metadata);
    append(row);
    const right = base("rights");
    right.source_pin_json = json(pin(source));
    right.rights_json = json(rights);
    append(right);
  }
  return lines.join("\r\n") + "\r\n";
}
function resultExport(
  body,
  format,
  edition,
  includedObservations,
  includedCoverageCells,
  omittedObservations,
  omittedCoverageCells,
  history = false,
) {
  const bytes = Buffer.byteLength(body);
  requireThat(
    bytes <= (history ? L.historyExportBytes : L.editionExportBytes),
    "Whole escaped export byte limit",
  );
  return freeze({
    mediaType: format === "csv" ? "text/csv" : "application/json",
    filename: `charitology-observations-${history ? "history" : edition.id}.${format}`,
    body,
    sha256: rawHash(body),
    bytes,
    edition,
    includedObservations,
    includedCoverageCells,
    omittedObservations,
    omittedCoverageCells,
  });
}
export function observationExport(input, requested) {
  const ctx = ownedHandle(input),
    request = clone(requested);
  obj({ editionId: ID, filter: filterSchema, format: choice(["json", "csv"]) })(
    request,
    "export",
  );
  const p = observationProjection(input, request.editionId),
    { filter, entries } = selectedCells(p, request.filter);
  const observationPins = [
    ...new Map(
      entries
        .filter((e) => e.observation)
        .map((e) => [key(e.observation), pin(e.observation)]),
    ).values(),
  ].sort(pinCompare);
  const totalCells = p.coverage.reduce((n, c) => n + c.cells.length, 0),
    omittedObs = p.observations.length - observationPins.length,
    omittedCells = totalCells - entries.length;
  let body;
  if (request.format === "csv") body = selectedCsv(p, entries);
  else {
    const groups = p.coverage
      .map((c) => ({
        coverage: pin(c),
        indices: entries
          .filter((e) => same(pin(e.coverage), pin(c)))
          .map((e) => e.index),
      }))
      .filter((g) => g.indices.length);
    const archive = {
      format: "charitology-observation-archive",
      version: 1,
      scope: "edition",
      registryHash: ctx.registry.hash,
      edition: p.edition,
      history: "pinned-links-only",
      privateOriginals: "not-included",
      selection: {
        filter,
        observations: observationPins,
        coverageCells: groups,
        omittedObservations: omittedObs,
        omittedCoverageCells: omittedCells,
      },
      files: observationFactualClosure(input, request.editionId).map((f) => ({
        ...f,
        text: ctx.files[f.path],
      })),
    };
    body = JSON.stringify(archive);
  }
  return resultExport(
    body,
    request.format,
    p.edition,
    observationPins.length,
    entries.length,
    omittedObs,
    omittedCells,
  );
}
export function observationHistoryExport(input) {
  const ctx = ownedHandle(input),
    p = observationProjection(input, ctx.registry.current.id),
    archive = {
      format: "charitology-observation-archive",
      version: 1,
      scope: "history",
      registryHash: ctx.registry.hash,
      history: "complete-public-history",
      privateOriginals: "not-included",
      files: Object.keys(ctx.files)
        .sort()
        .map((path) => ({
          path,
          sha256: rawHash(ctx.files[path]),
          bytes: Buffer.byteLength(ctx.files[path]),
          text: ctx.files[path],
        })),
    };
  return resultExport(
    JSON.stringify(archive),
    "json",
    p.edition,
    ctx.registry.records.filter((p) => p.kind === "observation").length,
    [...ctx.records.values()]
      .filter((r) => r.kind === "coverage")
      .reduce((n, r) => n + r.cells.length, 0),
    0,
    0,
    true,
  );
}
