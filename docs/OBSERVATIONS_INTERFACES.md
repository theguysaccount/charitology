# Observation interfaces

Planning draft · October 27, 2026 · AI-assisted · review: draft. Read the [plan](OBSERVATIONS_PLAN.md). These declarations specify future code. No observation runtime, seed, source license determination, human review or release is established by this document. Freeze the plan, these interfaces, source preparation and measured real candidate before implementation.

The slice has one current country projection for all 217 existing countries/economies and their 1,085 declared cells: 1,050 present facts and 35 coverage findings. Eight financial facts cover two explicitly named consolidated reporting groups. Present observations total 1,058; a missing cell is not a numeric observation. All public records remain draft. No rating, arithmetic comparison, aggregation, causal effect, worldwide financial census or measured cause-funding allocation is an output.

## Bytes, identifiers and exact numbers

The proposed pure model lives in `src/lib/observation-model.mjs` with inert type declarations. I/O, Git, clocks and fetching belong in explicit adapters/scripts. A normal build validates checked-in inputs and never consults any of them for factual values or identities. All typed JSON below is closed: unknown properties, duplicate keys, unresolved references, incompatible versions and excess bytes refuse the whole candidate. Optional fields are expressed through explicit null or tagged variants; there is no cleaner/default/undefined omission during admission.

```ts
type ObservationHash = string; // exactly 64 lowercase SHA-256 hex
type ObservationId = string; // ^[a-z][a-z0-9-]{0,99}$; file-safe, case-sensitive
type ObservationDay = string; // actual Gregorian YYYY-MM-DD, no inferred UTC instant
type ObservationInstant = string; // actual ISO UTC YYYY-MM-DDTHH:mm:ss.sssZ
type ObservationUrl = string; // HTTPS, <=2048 UTF-16 code units, no credentials/backslash/control
type ObservationPath = string; // one allowed root-relative path, <=240; no traversal/symlink
interface ObservationDecimal {
  coefficient: string; // canonical signed integer, <=38 digits excluding sign
  exponent: number; // integer -18..18; value = coefficient * 10**exponent
}
declare const OBSERVATION_LIMITS: {
  readonly entities: 1000;
  readonly scopes: 1000;
  readonly measures: 100;
  readonly sources: 200;
  readonly observations: 10000;
  readonly coverageRecords: 100;
  readonly coverageCellsPerRecord: 2000;
  readonly coverageCellsAllHistory: 20000;
  readonly editions: 20;
  readonly files: 14000;
  readonly rawSourceBytes: 1048576; //1 MiB, each public raw JSON/text input
  readonly privateOriginalBytes: 4194304; //4 MiB, each private original HTML/PDF only
  readonly structuredObjectBytes: 2097152; //2 MiB, each whole JSON file incl registry
  readonly editionClosureBytes: 8388608; //8 MiB, exact stored selected factual closure
  readonly historyBytes: 20971520; //20 MiB, registry + all immutable stored files
  readonly editionExportBytes: 12582912; //12 MiB, complete JSON or selected CSV output
  readonly historyExportBytes: 33554432; //32 MiB, complete all-history JSON output
  readonly preparedInputBytes: 33554432; //32 MiB, whole private preparation inventory
  readonly jsonDepth: 32;
  readonly sourceRefsPerField: 20;
  readonly attachmentsPerSource: 4;
  readonly requestDeadlineMs: 45000;
};
type ObservationRecordKind =
  "entity" | "scope" | "measure" | "source" | "observation" | "coverage";
interface ObservationPin<
  K extends ObservationRecordKind = ObservationRecordKind,
> {
  kind: K;
  id: ObservationId;
  version: number; //safe positive integer <=100000
  hash: ObservationHash;
}
interface ObservationRecordBase<K extends ObservationRecordKind> {
  format: "charitology-observation-record";
  schemaVersion: 1;
  kind: K;
  id: ObservationId;
  version: number;
  previous: ObservationPin<K> | null;
  hash: ObservationHash;
}
interface ObservationBlobPin {
  path: ObservationPath;
  sha256: ObservationHash; //exact bytes, separate from canonical record hash
  bytes: number; //safe integer, exact stored bytes
  mediaType: "application/json" | "text/plain";
}
declare function observationDecimalFromLexeme(
  token: string,
): ObservationDecimal;
declare function observationScaledDecimal(
  token: string,
  scale: ObservationDecimal,
): ObservationDecimal;
declare function observationDecimalText(value: ObservationDecimal): string;
```

Decimal coefficient has no plus sign, redundant leading zero or trailing zero; zero is exactly `{coefficient:'0',exponent:0}`, never negative zero. A nonzero coefficient ends in 1…9. Normalize through exact string/BigInt operations, then check both bounds; reject overflow rather than round or silently change units. Source JSON numeric grammar is `-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?`. Token maximum is 128 characters. The raw token is retained even when several lexemes normalize to the same decimal. Printed financial numbers use an explicit versioned `printed-integer` parser: plain digits or correctly grouped comma thousands, optional leading minus; do not remove arbitrary punctuation or parse text with `Number`.

Exact scale multiplication is the only first-release numeric transformation besides normalization and display formatting. GiveWell's multiplier 1,000 is exact source scale; its reported USD1,000 quantum does not supply an uncertainty interval or exact-dollar precision. Preserve Wikimedia's USD1 quantum separately. `observationDecimalText` is exact, not locale-dependent. Rounded display text is explicitly a presentation and always links the exact token/decimal. No JSON numeric token is allowed through ordinary `JSON.parse`/IEEE-754 before its source lexeme is captured.

Limits apply simultaneously to all versions in the registry, not only the newest selection. Count ceilings do not promise every maximum fits. UTF-8 is fatal-decoded; reject a BOM, duplicate decoded JSON keys, malformed surrogates in metadata strings, dangerous/custom prototypes, accessors, hidden/symbol fields, decorated/sparse arrays, cycles and nonfinite values before assignment or callbacks. Inert raw source bytes remain exact; the parser may reject a source whose adapter cannot interpret it without rewriting those bytes. IDs and paths have explicit allowlists; URL validation checks literal backslash/control before URL normalization and disallows credentials. No source HTML/script is executed.

General text bounds: labels 240; publisher/producer credit 8,192; definitions 16,384; notes/limitations 4,096 each; original producer annotation 4,096; excerpts 4,096; selector/JSON pointer 1,024; printed row/column/path components 240, at most eight each. At most 20 entries in each sourceRefs/support/evidence/limitations/aliases array; at most eight identity assertions per entity, eight group members per scope/entity and eight evidence matches per locator. This is not a 20-pin limit on an edition or coverage matrix: entity/scope/measure/source/observation/coverage pin collections use their declared global kind counts, and coverage uses its separately bounded cell count. File arrays use 14,000; prepared inputs 200; selection indices 2,000 per coverage record. Every other container uses its named record/global count below. Strings are preserved exactly after admission; no trimming, truncation, ID generation, country coercion or name matching occurs.

## Private pre-freeze byte proof

The private final-DTO constructor ran at `2026-10-27T14:22:49.688Z` using all eleven retained World Bank responses, eight financial facts and their real source/rights support. Its eight extracted declaration blocks (56 types) and actual typed construction compile together in strict TypeScript with zero diagnostics. Both candidates contain 223 entities, 219 scopes, 10 measures, 24 current sources, 1,058 observations and six coverage records with all 1,093 cells. The second candidate is explicitly fictional, locally constructed and unpublished: every selected country fact and all five raw value bodies change; all 35 missing cells remain missing. It makes no new World Bank retrieval/publication claim.

| Exact UTF-8 bytes                         | Initial real-input candidate | Complete changed fixture |  Whole cap |
| ----------------------------------------- | ---------------------------: | -----------------------: | ---------: |
| Selected factual closure                  |                    6,520,946 |                6,705,352 |  8,388,608 |
| Stored public history, including registry |                    7,070,723 |               13,147,265 | 20,971,520 |
| Selected JSON                             |                    7,874,996 |                8,079,646 | 12,582,912 |
| Selected normalized CSV                   |                    7,282,619 |                7,299,288 | 12,582,912 |
| All-history JSON                          |                    8,323,818 |               15,446,864 | 33,554,432 |
| Largest structured file                   |                      549,777 |                  938,170 |  2,097,152 |

Each selected factual closure contains 1,560 files. Initial history contains 1,561 files; the complete second history contains 2,627, preserving all 1,560 original immutable files exactly. Every CSV has 29 columns and 1,141 rows after its header: 1,058 fact, 35 missing, 24 source and 24 rights rows. An earlier repeated-dictionary CSV trial measured 20,060,481 / 20,490,550 bytes and failed the 12 MiB gate; the specified normalized table preserves the exact data and source reconstruction while avoiding that duplication. No facts, missingness or history were trimmed. The 24 retained prepared inputs total 9,371,777 bytes: 2,087,188 public JSON bytes and 7,284,589 private original bytes. Largest public JSON is 438,744 bytes; largest private original is 1,223,097 bytes. Rights/support originals remain private, while permitted short evidence and source pins are counted in the public closure.

Private evidence lives under `work/os-private/observation-final-dto-prototype/`: `generated/capacity-report.json` SHA-256 `703ef91de7ed59186b2b2a76f425638e2605681f3f99461f15da4c8e665d05a7`, complete `generated/vintage-{1,2}-inventory.json` files, both complete file trees and exact selected JSON/CSV/all-history exports. Extracted `interfaces.ts` SHA-256 is `5be9d07df5268fc1d7e7c0d438fe71368ede7a0eec3d31f7c8bfdc9d4c46e6de`; readable constructor `build-prototype.ts` SHA-256 is `d8ec0a0f3f16e0f501325fad59efdbd421fe5d9ffe00327795401ceb7cd6ab0f`; executed `run-prototype.mjs` SHA-256 is `64cfff8de66e79fff800028321c8fb5b392a480fb7b2a81f476518a6d539d907`. The report pins the extracted type declarations and constructor, not mutable surrounding draft prose, so its evidence pointer does not create a hash cycle.

This is capacity and focused source-replay evidence, **not** full validator admission, a verified committed source A, legal rights approval, independent human source review or a public seed. The constructor checks all 217 legacy identities, five definitions, 1,050 exact numeric source lexemes and their years/status/notes, and all 35 missing legacy cells. Its recorded repository HEAD is diagnostic, not an approved capture baseline. Independent agent inventory/hash/source/CSV review is a separate gate; actual implementation must still reproduce these bounds with the final admission validator and maintainer preview/write protocol.

## Source editions, locators and rights

Sources do not point back to a dataset edition or observation. That avoids a hash cycle. Original producer credit is text/source evidence, never an invented entity or local coauthor. Each source edition identifies one actual retrieved response/document with actual retrieval metadata, a raw hash and byte length, even when raw PDF bytes are private. New retrieval of identical bytes creates a new source version if the retrieval claim changes; it may reuse the same exact public blob. Reusing an older source version preserves its older retrieval instant.

```ts
type ObservationJsonExpected =
  | { kind: "string"; value: string }
  | { kind: "number-token"; value: string }
  | { kind: "null" };
type ObservationLocator =
  | {
      kind: "json";
      pointer: string;
      matches: { pointer: string; expected: ObservationJsonExpected }[];
    }
  | {
      kind: "pdf";
      pdfPage: number;
      printedPage: string | null;
      section: string[];
      row: string[];
      column: string[];
    }
  | { kind: "text"; section: string[]; excerpt: string };
interface ObservationSourceRef {
  source: ObservationPin<"source">;
  role:
    | "value"
    | "annotation"
    | "definition"
    | "unit"
    | "period"
    | "scope"
    | "identity"
    | "rights";
  locator: ObservationLocator;
}
interface ObservationRights {
  returnedLicense: string | null; //literal response field, never an inferred CC declaration
  publicReuse:
    | {
        kind: "explicit-license";
        label: string;
        termsUrl: ObservationUrl;
        evidence: ObservationSourceRef[];
      }
    | {
        kind: "publisher-default-inference";
        label: string;
        termsUrl: ObservationUrl;
        attribution: string;
        evidence: ObservationSourceRef[];
        humanReview: "pending";
      }
    | { kind: "linked-document-only"; note: string };
  attribution: string;
  originalProducerCredit: string;
  limitations: string[];
}
interface ObservationFinancialExcerpt {
  format: "charitology-financial-transcription";
  schemaVersion: 1;
  documentSha256: ObservationHash;
  assertions: {
    id: ObservationId;
    locator: Extract<ObservationLocator, { kind: "pdf" }>;
    token: string;
    parser: "printed-integer-v1";
    scale: ObservationDecimal;
    support: (
      | { kind: "same-document"; locator: ObservationLocator }
      | { kind: "other-source"; ref: ObservationSourceRef }
    )[];
    note: string;
  }[]; //1..20, initial four numerical assertions per audit document
  review: "draft";
}
interface ObservationSourceRecord extends ObservationRecordBase<"source"> {
  url: ObservationUrl;
  publisher: string;
  title: string;
  retrievedAt: ObservationInstant;
  sourceUpdatedDay: ObservationDay | null;
  reportDay: ObservationDay | null; //audit report day if known, not website publication
  publishedAt:
    | { kind: "day"; day: ObservationDay }
    | { kind: "instant"; instant: ObservationInstant }
    | null;
  rawSha256: ObservationHash;
  rawBytes: number; //public raw <=1MiB; external private HTML/PDF <=4MiB
  payload:
    | {
        kind: "public-json";
        raw: ObservationBlobPin;
        adapter:
          | "world-bank-country-v1"
          | "world-bank-indicator-v1"
          | "world-bank-values-v1";
      }
    | { kind: "public-text-evidence"; raw: ObservationBlobPin }
    | {
        kind: "external-document";
        mediaType: "application/pdf" | "text/html";
        publicExcerpt: ObservationBlobPin | null;
      };
  producerMetadata: { field: string; literal: string }[]; //<=20; e.g. sourceid,lastupdated,unit,decimal
  rights: ObservationRights;
  limitations: string[];
  review: "draft";
}
```

Source records that cite rights/support evidence form an acyclic dependency graph. Do not make two sources cite each other's rights. A basic terms-evidence source can carry its own literal URL/excerpt and returned-license null; the rights inference source cites it. A rights citation never grants different rights to all sources in the registry. Public raw JSON requires either the relevant explicit license basis or the explicit publisher-default inference described here. Financial original PDFs remain `external-document`; no copied PDF pages enter public closure. Small public transcription packets contain only bounded assertions/locators/support, with their own byte pins. Their raw PDF hash is a reference to a privately checked original, not a claim the public validator re-extracted the PDF or that a source audit opinion reviewed Charitology.

The excerpt's `documentSha256` identifies original external bytes, not the owner SourceRecord hash. Same-document support uses a local locator; it must not pin its own SourceRecord through a public-excerpt file and create a hash cycle. Other-source supports resolve in the acyclic source closure. Terms evidence may be a bounded, attributed public excerpt from an external-document source; no entire HTML page needs to be republished to retain the evidence.

The five WDI series pages supply explicit CC BY 4.0 evidence and original-producer credit. Their source `unit` fields remain empty strings; definitions provide the separately declared normalized unit. Country metadata's returned license stays null. Its proposed reuse basis is explicitly **author inference under publisher-default dataset terms, human review pending**, with attribution and [World Bank dataset terms](https://www.worldbank.org/ext/en/legal/terms-conditions/datasets) and [summary terms](https://data.worldbank.org/summary-terms-of-use). Root inspected those official pages on October 27; capture actual evidence/retrieval during seed preparation. Do not invent an earlier terms snapshot or generalize that inference to an audit PDF or other third-party data.

A JSON pointer identifies the exact token/row in the pinned raw response. Matches bind country ID, ISO3, indicator and year where applicable; they are checked against the source tree, not merely displayed. PDF pages are **1-based**; printed page is a separate literal label. Row/column paths retain actual printed labels. Text excerpts are inert evidence, not selectors executed on a live page. Supporting currency, consolidation, identity and period references are separate from the numeric row locator. Hashes/locators establish repeatable source references, not source truth, human review or a rights ruling.

Replay binding is mandatory, not a prose-only source label. A JSON observation's reported valueRef has role value, resolves a numeric token in the exact retained raw response, and reported.token is byte-for-byte that token's lexeme before ordinary number parsing; its parser/scale/normalized Decimal must agree. A financial PDF value requires a retained publicExcerpt packet whose documentSha256 equals source.rawSha256 and exactly one assertion matching the complete PDF locator, token, parser and scale. Reject duplicate assertion IDs/locators or disagreement; the public observation cannot independently carry a conflicting transcription under the same source hash. Same-document support locators remain local so this check introduces no owner-hash cycle. Annotation/bounds references similarly match the exact retained footnote/packet evidence; missing coverage pointers must resolve source null, not an absent field or zero.

## Entities, scopes and measure definitions

An entity is a stable identity with explicit versions. A reporting group and its parent legal entity are distinct entities. An EIN points to a legal entity, never directly to every group containing it. A separate scoped mapping can offer that group's recorded financial panel. Same-name/address/fuzzy matches do not create aliases or coverage. Unknown subsidiary identifiers stay unknown.

```ts
type ObservationIdentifier =
  | { kind: "ein"; value: string; sourceRefs: ObservationSourceRef[] } //9 digits, leading zeros retained
  | { kind: "iso2"; value: string; sourceRefs: ObservationSourceRef[] } //2 uppercase letters
  | { kind: "iso3"; value: string; sourceRefs: ObservationSourceRef[] } //3 uppercase letters, incl explicit XKX
  | {
      kind: "producer-country";
      value: string;
      sourceRefs: ObservationSourceRef[];
    };
interface ObservationEntityRecord extends ObservationRecordBase<"entity"> {
  entityKind: "country-economy" | "legal-organization" | "reporting-group";
  label: string;
  identifiers: ObservationIdentifier[];
  aliases: { label: string; sourceRefs: ObservationSourceRef[] }[];
  memberEntities: ObservationPin<"entity">[];
  profileRefs: string[]; //<=8 exact curated slugs, <=100 each; never inferred from name
  countryMetadata: {
    producerRegionId: string;
    producerRegionLabel: string;
  } | null;
  sourceRefs: ObservationSourceRef[];
  limitations: string[];
  review: "draft";
}
interface ObservationScopeRecord extends ObservationRecordBase<"scope"> {
  entity: ObservationPin<"entity">;
  scopeKind: "national-statistics" | "consolidated-reporting-group";
  label: string;
  includedEntities: ObservationPin<"entity">[];
  consolidation:
    | "not-applicable"
    | "consolidated-with-eliminations"
    | "consolidated-unspecified-eliminations";
  geography:
    | { kind: "country-economy"; entity: ObservationPin<"entity"> }
    | { kind: "unknown"; note: string };
  exclusions: string[];
  sourceRefs: ObservationSourceRef[];
  limitations: string[];
  review: "draft";
}
type ObservationUnit =
  | { kind: "count"; label: "people"; denominator: null }
  | { kind: "duration"; label: "years"; denominator: null }
  | {
      kind: "rate";
      label: string;
      denominator: {
        label: string;
        definition: string;
        scale: ObservationDecimal;
      };
    }
  | { kind: "currency"; label: "USD"; currency: "USD"; denominator: null };
interface ObservationMeasureRecord extends ObservationRecordBase<"measure"> {
  label: string;
  measureKind:
    "stock" | "flow" | "population-count" | "period-duration" | "rate";
  family:
    | "population"
    | "life-expectancy"
    | "under-five-mortality"
    | "electricity-access"
    | "basic-water-access"
    | "assets"
    | "liabilities"
    | "net-assets"
    | "expenses";
  producerCode: string | null;
  definition: string;
  unit: ObservationUnit;
  method: string;
  legacyCountry: {
    id: string;
    label: string;
    unit: string;
    note: string;
    indicatorUrl: ObservationUrl;
    queryUrl: ObservationUrl;
    definition: string;
    organization: string;
  } | null;
  sourceRefs: ObservationSourceRef[];
  limitations: string[];
  review: "draft";
}
type ObservationPeriod =
  | { kind: "stock-day"; day: ObservationDay }
  | {
      kind: "closed-interval";
      start: ObservationDay;
      end: ObservationDay;
      sourceLabel: string;
    }
  | {
      kind: "year-ended";
      end: ObservationDay;
      literalStart: null;
      sourceLabel: string;
    }
  | { kind: "calendar-year"; year: number }; //integer1900..2100 for the country adapter
interface ObservationRecord extends ObservationRecordBase<"observation"> {
  entity: ObservationPin<"entity">;
  scope: ObservationPin<"scope">;
  measure: ObservationPin<"measure">;
  period: ObservationPeriod;
  reported: {
    token: string;
    parser: "json-number-v1" | "printed-integer-v1";
    scale: ObservationDecimal;
    valueRef: ObservationSourceRef;
  };
  value: ObservationDecimal; //always present; no null observation value in this release
  precision:
    | { kind: "unknown" }
    | {
        kind: "reported-quantum";
        quantum: ObservationDecimal;
        sourceRefs: ObservationSourceRef[];
      };
  uncertainty: null | {
    kind: "producer-reported-bounds";
    lower: ObservationDecimal;
    upper: ObservationDecimal;
    confidence: null;
    verbatimNote: string;
    sourceRef: ObservationSourceRef;
    parser: "world-bank-mortality-bound-v1";
  };
  producerStatus: string | null; //verbatim returned string (including empty), null if absent
  producerUnit: string | null; //verbatim returned string (including empty), null if absent
  producerDecimal: string | null; //literal display metadata, not measured precision
  annotations: { verbatim: string; sourceRef: ObservationSourceRef }[]; //<=8
  priceBasis: { kind: "unknown" }; //no inflation/FX basis is invented
  sourceRefs: ObservationSourceRef[];
  limitations: string[];
  review: "draft";
}
```

Entity/member/scope references must agree: a national scope identifies its country; a consolidated scope lists its verified legal members and its separate group entity. No group membership/alias cycle is allowed. Country entities require their exact non-null region metadata; organization/group entities have countryMetadata null. Country ISO2/ISO3 identifiers are source-exact, including explicitly sourced XKX; no library's idea of sovereign statehood changes the existing 217-economy denominator. Region is metadata, not a need score. Financial service geography stays unknown; headquarters/mailing location cannot fill it. Only the five country measure definitions carry non-null legacyCountry fields; these retain the exact versioned public label/unit/note and producer definition/credit, so a pure compatibility adapter does not need a mutable old dataset or later interpretation code.

The five country definitions retain their actual meanings: midyear population, period life expectancy, under-five probability per 1,000 live births, percent with electricity access and percent using at least basic water. Rate denominator scale is 1,000 for mortality and 100 for percentages, with the actual definition, not an observed population denominator or a value to multiply. Access does not establish reliable/affordable electricity or safely managed water. Financial assets/liabilities/net assets are stocks; operating expenses and total expenses are separately versioned definitions in the expenses family. Wikimedia's known interval is 2023-07-01 through 2024-06-30; GiveWell uses the explicit year-ended 2024-12-31 variant with literal start unknown. Neither becomes plain “2024”, and neither stock day becomes midnight UTC.

## Coverage and country adapter

Coverage records declare a finite selection and every cell's disposition. They do not fill unsourced observations with null/zero. Country coverage is exactly five records, one per indicator, each listing all 217 declared nonaggregate economy/scope cells. A present cell stores only its exact observation pin; entity/scope/measure are resolved from that admitted immutable record, avoiding three redundant pins per present cell. A missing cell has no observation to resolve, so it keeps those explicit pins and its six source references. Eight financial present cells sit in a separate explicit panel. The broad state “all other reporting groups uncollected” has an unknown worldwide denominator, not a million fabricated missing observations.

```ts
type ObservationCoverageCell =
  | {
      state: "present";
      observation: ObservationPin<"observation">;
    }
  | {
      entity: ObservationPin<"entity">;
      scope: ObservationPin<"scope">;
      measure: ObservationPin<"measure">;
      state: "missing";
      reason: "producer-null-throughout-window";
      sourceRefs: ObservationSourceRef[];
    };
interface ObservationCoverageRecord extends ObservationRecordBase<"coverage"> {
  selection:
    | {
        kind: "country-latest-window";
        startYear: 2020;
        endYear: 2025;
        rule: "latest-non-null";
        indicator: string;
        countryMetadataSource: ObservationPin<"source">;
        valuesSource: ObservationPin<"source">;
        indicatorMetadataSource: ObservationPin<"source">;
        measure: ObservationPin<"measure">;
        nonaggregateRule: "country-metadata-region-id-not-NA";
      }
    | {
        kind: "explicit-financial-panel";
        rule: "selected-consolidated-audit-rows";
        panels: {
          scope: ObservationPin<"scope">;
          measures: ObservationPin<"measure">[];
        }[];
        unknownRemainder: string;
      };
  cells: ObservationCoverageCell[];
  sourceRefs: ObservationSourceRef[];
  exclusions: string[];
  limitations: string[];
  review: "draft";
}
interface WorldBankPreparationInput {
  format: "charitology-worldbank-preparation";
  version: 1;
  window: { startYear: 2020; endYear: 2025 };
  responses: {
    role: "country-metadata" | "indicator-metadata" | "indicator-values";
    indicator: string | null;
    url: ObservationUrl;
    retrievedAt: ObservationInstant;
    sha256: ObservationHash;
    bytes: Uint8Array;
  }[]; //exactly11
  legacyComparison: {
    path: "src/data/countries.json";
    bytes: Uint8Array;
    sha256: ObservationHash;
  };
}
interface WorldBankAdapterReport {
  economies: number;
  cells: number;
  present: number;
  missing: number;
  mortalityBounds: number;
  mortalityWithoutBounds: readonly string[]; //<=1000 exact admitted country codes
  selectedTokenDifferences: number;
  yearStatusNoteDifferences: number;
  identityDifferences: number;
  definitionDifferences: number;
  producerRows: number;
  rawFiles: ObservationBlobPin[];
  records: ObservationAnyRecord[];
}
declare function prepareWorldBankObservations(
  input: WorldBankPreparationInput,
): WorldBankAdapterReport;
interface InitialWorldBankAssertions {
  economies: 217;
  cells: 1085;
  present: 1050;
  missing: 35;
  mortalityBounds: 190;
  mortalityWithoutBounds: readonly ["AND", "COD", "PSE", "ROU", "TLS", "XKX"];
  legacyTokenYearStatusNoteIdentityDefinitionDifferences: 0;
}
declare function assertInitialWorldBankObservations(
  report: WorldBankAdapterReport,
): InitialWorldBankAssertions;
```

The general adapter report has safe nonnegative integer counts bounded by the registry/cell limits; present+missing=cells=economies×5, with no missing/duplicated cell. assertInitialWorldBankObservations additionally checks the exact verified initial-source literals and all recorded legacy differences. It is not called to force later vintages back to1050/35: a formerly null cell becoming present yields a changed general report and complete declared diff/new edition. The v1 adapter/window is explicitly2020…2025, six distinct years per scoped economy/indicator. A wider/different window requires a new approved versioned adapter/selection definition and schema variant, never a clock-driven request change. Validate complete single-page metadata/row totals. Validate raw row uniqueness using producer country ID + indicator + year, then exact country/ISO join. Do not deduplicate by ISO3 alone: five initial aggregate groups have empty ISO3 and are source context. Retain all7,980 initial value rows in raw snapshots, while normalizing only latest non-null country facts. Initial country metadata has296 rows; each value source has1,596. Do not silently add49 initial value-response aggregate entities to the normalized denominator.

For every missing cell, retain six exact JSON row/value locators with source null and matched identities/years. Present cells point to one exact selected observation; there are no duplicate cells. The coverage validator resolves that observation, computes its stable entity×measure cell identity and rejects unknown/out-of-set/mismatched pins or duplicate cells across all five records. It proves the complete217×5 matrix with all1050 present and35 missing cells, never inferred completeness from summary counts. Selected population is 2025 (217), life expectancy 2024 (217), mortality 2024 (196), electricity 2024 (215), water 2020/2021/2023/2024 (205). At initial seed, assert exact match to all legacy selected tokens/years/status/notes and all identities/definitions; a future mismatch becomes a declared diff/new vintage, never an automatic correction to the old record.

The country selection explicitly pins exactly one country-metadata source, one values source, one indicator-metadata source and one measure definition. All five country coverage records use the same exact country-metadata pin in an edition; each series uses its matching values/definition pins. Derive the finite expected economy set only from that pinned raw metadata and its nonaggregate rule, then prove the complete set×five definitions. Other metadata vintages in history cannot change this denominator. Refuse missing, duplicate, out-of-set or source-inconsistent cells even if supplied counts happen to add up. A financial panel explicitly lists its finite scope→measure selection (up to1000 scopes and100 distinct measures per scope); the initial two panels each select their four exact audit definitions. Every selected financial cell must be present in this release. All other groups/measures remain outside the declared panel with an unknown worldwide denominator, not an inferred missing crossproduct.

The supported mortality note grammar is exactly `Uncertainty bound is <decimal> - <decimal>` with source-matching spacing/numeric tokens. Preserve the whole original note and source-row reference, parse both bounds losslessly and require lower ≤ point ≤ upper in the same unit. Confidence stays null. All 190 individual source notes must be checked; six explicitly lack bounds. Preserve 34 population annotations too. Producer `decimal:0` for mortality is not precision despite a value such as 38.8. The 205 real tokens exceeding twelve fractional places must survive intact, including `83.0512195121951`.

## Registry, stored layout and complete closure

```ts
type ObservationAnyRecord =
  | ObservationEntityRecord
  | ObservationScopeRecord
  | ObservationMeasureRecord
  | ObservationSourceRecord
  | ObservationRecord
  | ObservationCoverageRecord;
interface ObservationEditionPin {
  id: ObservationId;
  hash: ObservationHash;
  sequence: number;
}
interface ObservationEdition {
  format: "charitology-observation-edition";
  version: 1;
  id: ObservationId;
  sequence: number;
  capturedAt: ObservationInstant;
  sourceCommit: string; //exact40-hex committed source baseline A, not future data commit B
  method: {
    id: "observation-capture-v1";
    definitionSha256: ObservationHash;
    adapterSha256: ObservationHash;
  };
  supersedes: ObservationEditionPin | null;
  records: ObservationPin[]; //selected factual closure, canonical kind/id/version order
  coverage: ObservationPin<"coverage">[];
  legacyComparison: {
    path: "src/data/countries.json";
    sha256: ObservationHash;
    declaredRetrievedDay: ObservationDay;
  };
  countryProjection: {
    title: string;
    window: string;
    publisher: string;
    licenseSummary: string;
    scope: string;
    countrySourceUrl: ObservationUrl;
    retrievalRule: "maximum-input-retrieval-day";
    review: "draft";
    reviewNote: string;
  };
  limitations: string[];
  review: "draft";
  hash: ObservationHash;
}
interface ObservationFilePin {
  path: ObservationPath;
  sha256: ObservationHash; //exact pretty JSON+newline or raw bytes
  bytes: number;
}
interface ObservationRegistry {
  format: "charitology-observation-registry";
  version: 1;
  current: ObservationEditionPin;
  editions: ObservationEditionPin[]; //1..20 in sequence order; all earlier entries retained
  records: ObservationPin[]; //every immutable record version, unique kind/id/version
  files: ObservationFilePin[]; //all immutable files except this registry
  hash: ObservationHash;
}
interface ObservationFiles {
  readonly [relativePath: string]: string | Uint8Array;
}
declare const OBSERVATION_VALIDATED: unique symbol;
interface ValidatedObservationRegistry {
  readonly registry: ObservationRegistry;
  readonly historyBytes: number;
  readonly [OBSERVATION_VALIDATED]: true;
}
declare function validateObservationFiles(
  files: ObservationFiles,
): ValidatedObservationRegistry;
declare function observationFactualClosure(
  input: ValidatedObservationRegistry,
  editionId: ObservationId,
): readonly ObservationFilePin[];
```

Proposed committed layout under `src/data/observations/`:

```text
registry.json
entities/<id>.v<version>.json
scopes/<id>.v<version>.json
measures/<id>.v<version>.json
sources/<id>.v<version>.json
observations/<id>.v<version>.json
coverage/<id>.v<version>.json
editions/<id>.json
raw/<sha256>.json
evidence/<sha256>.json
evidence/<sha256>.txt
```

Every JSON record is canonical pretty two-space UTF-8 plus one newline; raw responses stay their original exact bytes. Canonical **semantic** hashes use sorted keys, array order as specified, integer structural numbers only, and no own hash field. Blob/file hashes use exact bytes. Registry hash excludes only its own hash. A record hash includes its prior-version pin, but not a later registry/edition hash. Edition hash includes selected pins and its previous-edition pin, not the registry or its own file hash. The registry file pins completed record/edition bytes. No byte-total field inside a hashed file depends on its own eventual serialization length.

Registry admission requires an exact inventory: no undeclared/orphan/missing file, duplicate path, duplicate decoded key, symlink, traversal, unknown extension or unsupported record variant. Public raw bytes match source pins; a source marked external-document has no pretend raw public file. Its public excerpt, if present, is closed/pinned. All source/identity/definition/observation/coverage references resolve to exact versions/hashes. Each stable record's version1 has previous null; later versions point to the exact same kind/id/version−1 in history. An unchanged record can be reused with the old identity/hash. No branch, missing previous version, cycle or deletion is admitted. Entities/scopes/definitions are never edited in place to reinterpret an old value. Every edition's active records contain exactly one selected version of a stable kind/id, and all factual dependencies are included.

**Factual dependencies and historical links are different edges.** The 8 MiB edition bound includes the selected edition file, its selected entities/scopes/measures/sources/observations/coverage and their permitted public blobs, counted once. It does not recursively include record.previous or edition.supersedes bytes. Those history pins must resolve in the full registry and are covered by the separate 20 MiB whole-history gate. Otherwise an entirely changed second vintage would drag both full raw sets into a single 8 MiB closure. The full validator checks both acyclic graphs. A single-edition export is complete for its selected factual source closure and labels historical links as pins-only; it never claims to include every prior edition's bytes. All-history export includes all of them. Private original PDFs are outside both public byte inventories, with an explicit unarchived-source disclaimer.

`ValidatedObservationRegistry` is an opaque, deeply owned/frozen object recognized by a private owner map. A forged marker or caller-mutated JSON is not trusted. All public projections accept only this validated handle or perform full admission first. Shared caches hold owned immutable inputs; returning a mutable source object must not allow source/qualification poisoning. `ObservationFiles` itself is detached and bounded synchronously before any later asynchronous work. Current lookup is explicit `registry.current`; build time, filesystem order or maximum year never elects the current edition.

## Projection, factual comparison and export

```ts
declare const OBSERVATION_PROJECTION: unique symbol;
interface ObservationProjection {
  readonly [OBSERVATION_PROJECTION]: true;
  format: "charitology-observation-projection";
  version: 1;
  edition: ObservationEditionPin;
  capturedAt: ObservationInstant;
  countryProjection: ObservationEdition["countryProjection"];
  entities: readonly ObservationEntityRecord[];
  scopes: readonly ObservationScopeRecord[];
  measures: readonly ObservationMeasureRecord[];
  sources: readonly ObservationSourceRecord[];
  observations: readonly ObservationRecord[];
  coverage: readonly ObservationCoverageRecord[];
  limitations: readonly string[];
}
interface ObservationFilter {
  entityIds: readonly ObservationId[]; //0..1000; [] means all in the selected edition
  measureIds: readonly ObservationId[]; //0..100
  state: "all" | "present" | "missing";
}
type ObservationSelection =
  | { kind: "scope"; scope: ObservationPin<"scope"> }
  | { kind: "profile"; slug: string }
  | { kind: "ein"; ein: string };
type ObservationCompatibilityReason =
  | "not-collected"
  | "different-stock-day"
  | "different-interval"
  | "literal-interval-start-unknown"
  | "different-measure-definition"
  | "different-unit-or-denominator"
  | "different-price-basis"
  | "different-consolidation-boundary"
  | "different-reporting-quantum"
  | "uncertainty-unknown"
  | "service-geography-unknown";
interface ObservationComparisonCell {
  target: ObservationSelection;
  resolvedScope: ObservationPin<"scope"> | null;
  state: "present" | "not-collected";
  observations: readonly ObservationPin<"observation">[];
}
interface ObservationComparisonRow {
  family: ObservationMeasureRecord["family"];
  left: ObservationComparisonCell;
  right: ObservationComparisonCell;
  alignment: "same-definition" | "related-definitions" | "not-collected";
  reasons: readonly ObservationCompatibilityReason[];
}
interface ObservationComparison {
  format: "charitology-observation-comparison";
  version: 1;
  edition: ObservationEditionPin;
  selection: readonly [ObservationSelection, ObservationSelection];
  rows: readonly ObservationComparisonRow[]; //<=100, no difference/ratio/winner/rank/score
  limitations: readonly string[];
}
declare function observationProjection(
  input: ValidatedObservationRegistry,
  editionId: ObservationId,
): ObservationProjection;
declare function coverageProjection(
  input: ObservationProjection,
  filter: ObservationFilter,
): readonly ObservationCoverageRecord[];
declare function compareOrganizations(
  input: ObservationProjection,
  selection: readonly [ObservationSelection, ObservationSelection],
  families: readonly ObservationMeasureRecord["family"][],
): ObservationComparison;
interface ObservationExportRequest {
  editionId: ObservationId;
  filter: ObservationFilter;
  format: "json" | "csv";
}
interface ObservationExport {
  mediaType: "application/json" | "text/csv";
  filename: string;
  body: string;
  sha256: ObservationHash;
  bytes: number;
  edition: ObservationEditionPin;
  includedObservations: number;
  includedCoverageCells: number;
  omittedObservations: number;
  omittedCoverageCells: number;
}
interface ObservationExportFile extends ObservationFilePin {
  text: string;
}
type ObservationJsonArchive =
  | {
      format: "charitology-observation-archive";
      version: 1;
      scope: "edition";
      registryHash: ObservationHash;
      edition: ObservationEditionPin;
      history: "pinned-links-only";
      privateOriginals: "not-included";
      selection: {
        filter: ObservationFilter;
        observations: ObservationPin<"observation">[];
        coverageCells: {
          coverage: ObservationPin<"coverage">;
          indices: number[];
        }[];
        omittedObservations: number;
        omittedCoverageCells: number;
      };
      files: ObservationExportFile[];
    }
  | {
      format: "charitology-observation-archive";
      version: 1;
      scope: "history";
      registryHash: ObservationHash;
      history: "complete-public-history";
      privateOriginals: "not-included";
      files: ObservationExportFile[];
    };
declare function observationExport(
  input: ValidatedObservationRegistry,
  request: ObservationExportRequest,
): ObservationExport;
declare function observationHistoryExport(
  input: ValidatedObservationRegistry,
): ObservationExport;
```

Pure projection/export never reads the clock. Projection handles are owned/frozen and recognized by a private owner map; a deserialized object with the same fields or symbol is not a trusted projection. Sort countries by explicit stable ID, facts by measure/entity/period/version, and source refs by their preserved stable order; never use locale-dependent sorting for hashes/bytes. HTML, both API datasets, country desk/detail routes, research brief and JSON/CSV read this same current projection. Every displayed cell carries an observation/coverage ID plus edition identity and exact source detail. Filters include missing coverage even when no present rows remain; export reports both included and omitted cells.

Organization selectors resolve only through explicit pinned scope/entity/profile/EIN assertions. A parent EIN's legal identity can offer a recorded consolidated group through that explicit membership, but the display keeps both identities. Unknown/uncovered selectors return `not-collected`; an IRS match alone supplies no audit facts. Reject the same resolved group on both sides, including different aliases/profile/EIN selectors. Reject malformed selections and ambiguous one-to-many mappings. Different group scope IDs are normal; assess their declared structural kinds/consolidation boundaries rather than requiring equal IDs. Membership differences remain visible. An expense-family row may align operating and total expenses only as related definitions with a mismatch reason, never as one quantity or a numeric winner. A source-corrected value belongs to its selected edition/version; default comparison does not silently blend versions or choose newest per individual cell.

Even a structurally aligned same-year row provides no first-release subtraction, ratio, summed total, FX/inflation conversion, ranking or impact inference. Different stock days, intervals, unknown literal starts, units/denominators, definitions, quantums and unknown geography/uncertainty are explicit reasons. Source-reported totals retain that label but are never added across rows/entities. No `aggregate` API or score/rating field exists, including in export. Country comparison can align two selected country scopes by the same five definitions without claiming their need or charity effectiveness was measured.

JSON export includes format/version, exact selection/filter/omission counts, edition pin, selected factual closure/file hashes, original numeric tokens, normalized Decimal and source-specific rights. Its files preserve the **complete selected edition's factual closure**, even when the selection table filters it: whole raw responses and immutable coverage records contain wider source context, disclosed in the download label. Selection/omission counts concern the requested report, not a claim that all other values vanished from the raw source files. A filter never rewrites an immutable source/coverage record to appear independently complete. Single-edition history is explicitly `pinned-links-only`, private PDFs explicitly `not-included`; raw public bytes are represented losslessly as text because admitted public attachments are strict UTF-8 JSON/text. Check the **actual escaped whole JSON** against 12 MiB before returning it. All-history export labels `complete-public-history`, includes the registry's exact text plus every public file, and checks actual bytes against 32 MiB. Neither includes private country notes or private PDFs. No export silently drops metadata/raw sources/history to fit.

CSV is a selected facts/coverage report, not an archive restoring every file. Emit one normalized table with the following fixed header and closed `row_kind` values `fact`, `missing`, `source`, `rights`. Every selected present or missing coverage cell has exactly one `fact` or `missing` row. Every selected factual-closure source pin has exactly one `source` and one `rights` row, including source records needed by rights-evidence references; never copy the complete source dictionary into every fact row. All `_json` fields contain compact JSON, including explicit nulls; pins contain their exact IDs/versions/hashes. `unit_json` includes the denominator, `reported_json` the token/parser/scale/value locator, `precision_json` the quantum or unknown state, and `uncertainty_json` the verbatim bounds/confidence metadata. `source_refs_json` retains exact locators from the observation/coverage cell and its entity/scope/measure, linking the exact source dictionary pins. Raw blob bodies and full history remain in JSON/source detail.

```text
edition_id,edition_hash,row_kind,source_pin_json,observation_pin_json,coverage_pin_json,coverage_cell_index,coverage_selection_json,entity_pin_json,scope_pin_json,measure_pin_json,definition,unit_json,period_json,reported_json,value_json,exact_decimal,precision_json,producer_status_json,producer_unit_json,producer_decimal_json,annotations_json,uncertainty_json,price_basis_json,source_refs_json,source_metadata_json,rights_json,missing_reason,export_notice
```

`source` rows identify their full original source pin in `source_pin_json` and carry the complete source record except its rights object in `source_metadata_json`, retaining its original full-source hash. The matching `rights` row has that same exact pin and its complete rights object in `rights_json`. Recombining those two objects must reconstruct the exact source and verify the original source hash: the rights-omitted metadata is not independently rehashed or misrepresented as a complete source. Dictionary pins are unique and every fact/rights source reference must resolve. Nonapplicable JSON fields are null, other nonapplicable fields empty, and edition identity/export notice appear on every row. Fact/missing rows have null dictionary-only fields. Missing rows keep their explicit coverage selection/window and reason; observation-only fields are JSON null or empty exact-decimal text as appropriate, never zero. Producer status/unit preserve a returned string including `""`; an absent structured field is JSON null. Financial PDFs do not return structured producer status/unit fields, so these fields are null unless a source-located printed unit label is explicitly described and retained as such. A normalized USD unit, currency-conversion note or scale caption cannot silently become a claimed returned producer field. Neutralize every untrusted text cell whose first significant character is `=`, `+`, `-` or `@` (including leading control/whitespace) with a literal apostrophe before RFC4180 quoting; ordinary leading tab/CR/LF are neutralized too. CSV states that this protective text transformation changes presentation; exact source text remains in JSON/source detail. Formula defense is not accomplished by quoting alone. Check the complete CSV against the same 12 MiB selected-export cap. Generated/requested download, HTTP bytes and native browser saved file remain distinct evidence.

## Legacy country API boundary

```ts
interface LegacyCountryIndicator {
  id: string;
  label: string;
  unit: string;
  note: string;
  url: string;
  apiUrl: string;
  lastUpdated: string;
  definition: string;
  organization: string;
}
interface LegacyCountryValue {
  value: number;
  year: number;
  footnote: string;
  status: string;
}
interface LegacyCountryDataset {
  title: string;
  retrieved: string;
  window: string;
  publisher: string;
  license: string;
  scope: string;
  countrySource: string;
  review: "draft";
  reviewNote: string;
  indicators: LegacyCountryIndicator[];
  countries: {
    id: string;
    iso2: string;
    name: string;
    region: string;
    values: Record<string, LegacyCountryValue>;
  }[];
}
declare function legacyCountriesProjection(
  input: ObservationProjection,
): LegacyCountryDataset;
```

Keep `/api/v1/countries`' existing outer API envelope and this data shape, including pinned review/reviewNote. Assert exact root-key agreement with the actual eleven legacy data keys, not only numeric country rows. The current review note explicitly says AI-assisted source transcription, with no independent human review or local narrative authorship; it is retained from the versioned edition metadata. An absent cell remains an absent `values` key, never null/zero. For the current exact seed, all 217 identifiers, labels, selected years/status/notes and numeric **JavaScript Number semantics** agree with the old endpoint. That compatibility representation does not promise lossless decimal arithmetic: callers using `JSON.parse` can round binary numbers. New observations/coverage APIs and JSON retain source lexeme plus Decimal. The compatibility serializer may preserve a source number token in JSON bytes, but cannot promise a caller's native numeric parser retains it.

Root title/window/publisher/scope notes derive from pinned adapter definitions. `retrieved` is the actual new capture/retrieval **day** selected by the country adapter, documented as the maximum actual retrieval day across its eleven inputs; retain full instants in the new graph. Indicator lastUpdated comes only from its value response; do not copy the unrelated catalog date or fill unknown metadata timestamps. The legacy top-level license text becomes a scoped summary that links each indicator and separately discloses metadata's publisher-default inference; it is not a new blanket license. Preserve the historical October25 normalized file unchanged as comparison evidence, not as the current second data source. Retire `update-country-data.mjs` as an active writer: replacement refresh uses only the new preparation/capture pipeline. All 217 route generation and all desk/brief/export controls must migrate together. Existing private country notes and their key remain unchanged.

Update source-specific rights at the API boundary too: src/lib/api.ts buildEndpoint and src/pages/api/v1/index.json.ts must not overwrite them with the current blanket CC notice. Preserve wrapper field shape, but scope its license statement to Charitology's schema/editorial material and explicitly delegate external response/document terms to each source's rights. The directory's global summary must say this distinction; adding per-record rights beneath an unchanged universal license claim is insufficient. Test the built wrapper and API directory text for all three affected datasets: countries, observations and observation-coverage.

## Maintainer capture and exact committed-base gate

```ts
interface ObservationCaptureRequest {
  format: "charitology-observation-capture-request";
  version: 1;
  sourceCommit: string;
  previousCommit: string; //exact committed previous inventory/absence baseline
  capturedAt: ObservationInstant;
  editionId: ObservationId;
  expectedPrevious: ObservationEditionPin | null;
  previousRegistryHash: ObservationHash | null;
  preparedInputManifestHash: ObservationHash;
  requestHash: ObservationHash;
}
interface ObservationCaptureDiff {
  added: readonly ObservationPin[];
  changed: readonly {
    before: ObservationPin;
    after: ObservationPin;
    fields: readonly string[];
  }[];
  missing: readonly {
    entity: ObservationPin<"entity">;
    measure: ObservationPin<"measure">;
    reason: string;
  }[];
  identityChanges: readonly ObservationId[];
  definitionChanges: readonly ObservationId[];
  unchanged: readonly ObservationPin[];
}
interface ObservationCapturePreview {
  format: "charitology-observation-capture-preview";
  version: 1;
  request: ObservationCaptureRequest;
  candidateRegistryHash: ObservationHash;
  files: readonly ObservationFilePin[]; //exact complete new stored inventory, not an estimate
  editionBytes: number;
  historyBytes: number;
  editionJsonBytes: number;
  editionCsvBytes: number;
  historyJsonBytes: number;
  diff: ObservationCaptureDiff;
  proposalHash: ObservationHash;
}
interface ObservationBaseProof {
  mode: "bootstrap-verified" | "append-verified";
  exactBase: string;
  exactHead: string;
  previousRegistryHash: ObservationHash | null;
  currentRegistryHash: ObservationHash;
  oldFilesChecked: number;
  sourceBaselineChecked: string;
}
interface ObservationPreparedManifest {
  format: "charitology-observation-prepared-inputs";
  version: 1;
  inputs: {
    name: string;
    url: ObservationUrl;
    retrievedAt: ObservationInstant;
    mediaType:
      "application/json" | "text/html" | "text/plain" | "application/pdf";
    sha256: ObservationHash;
    bytes: number;
    publicDisposition: "raw-json" | "bounded-excerpt" | "private-original";
  }[]; //<=200, total <=32MiB
  hash: ObservationHash;
}
interface ObservationSourceBaseline {
  commit: string;
  files: readonly {
    path: ObservationPath;
    sha256: ObservationHash;
    bytes: Uint8Array;
  }[]; //<=100 method/definition inputs, whole <=5MiB
}
declare function buildObservationCandidate(
  previous: ObservationFiles | null,
  prepared: {
    manifest: ObservationPreparedManifest;
    files: ReadonlyMap<string, Uint8Array>;
  },
  baseline: ObservationSourceBaseline,
  request: ObservationCaptureRequest,
): ObservationCapturePreview;
// Explicit script-layer I/O only; never imported by a build/browser model.
declare function previewObservationCapture(args: {
  repo: string;
  preparedRoot: string;
  request: ObservationCaptureRequest;
}): Promise<ObservationCapturePreview>;
declare function writeReviewedObservationCapture(
  preview: ObservationCapturePreview,
  expectedProposalHash: ObservationHash,
): Promise<void>;
declare function checkObservationAppendOnly(args: {
  repo: string;
  exactBase: string;
  exactHead: string;
}): Promise<ObservationBaseProof>;
```

Preparation is explicit download→complete bounded validation→exact source inventory/transcription review→preview. Capture its real retrieval instants once, exact request URL, HTTP result/content type, final bytes/hash and actual terms evidence. Hash/byte counts mean exact retained HTTP entity bytes after Fetch content decoding, before JSON parsing/reserialization, not compressed wire bytes. All eleven World Bank responses must arrive and validate as one complete candidate; retain failures separately without touching earlier inputs. Source downloads have 45-second deadlines, public raw JSON/text 1 MiB caps and private original HTML/PDF 4 MiB caps, HTTPS exact hosts/URLs and no silent redirects or pagination truncation. Private originals above 1 MiB do not enter public closure; only their complete raw hash/byte metadata and permitted small excerpt do. Financial PDFs are fetched/byte-checked only into private preparation; explicit reviewed transcription/public-excerpt data enters the public candidate. Its source claim is bounded to that actual input/check, never a claim of automated PDF extraction in public CI. The prepared manifest has at most 200 inputs and 32 MiB total; every named input/role/disposition and exact byte pin is checked before candidate generation. Approved ReadonlyMap/Uint8Array preparation containers are detached using fixed native operations, never caller iterators/methods or accessors; only their captured plain manifest/data enter hashing. Reusing the retained October 27 numeric responses preserves their original retrieval instants/bytes; new rights captures have their separate actual retrievals and never silently replace or redate those earlier numeric inputs.

Before initial capture, commit baseline **A** containing inert definitions, adapter/model code, request/manifest schema and interpretation metadata. The initial dataset **B** explicitly pins A and a real capturedAt; no invented future commit/time. The script-layer preview loads A and the separate request.previousCommit through exact Git objects and compares every interpreted baseline input/method pin plus the complete prior inventory; an archived copy alone is not a new verified baseline. Pure buildObservationCandidate receives that bounded source-baseline DTO and validates its pins without invoking Git. Prepared inputs are detached/bounded before async work; a hash of a mutable Map is not authority. Preview returns a deeply owned frozen candidate and exact byte inventory. A private owner record or complete deterministic rebuild of the exact request/inputs binds review to write; the caller cannot fabricate a preview with a matching public discriminator/hash. A separate CLI write invocation must rebuild from the exact verified committed inputs and compare the explicitly supplied reviewed proposal hash; a preview JSON file alone is never authority.

`proposalHash` hashes the exact request, prepared-input inventory, selected baseline A, previous registry/base pin, candidate file paths/byte hashes, diff and all whole-size measurements. Immediately before writing, re-read exact current public inventory/base and verify request/inputs/proposal against the reviewed hash. A changed source, stale previous edition, missing file, changed path, changed definition or mutated caller input refuses before any publication. No command silently adopts a newer base or recalculates a different candidate under the same approval. Write only new immutable content files, then atomically replace the registry index last; failed staging/validation cannot activate a partial edition. Use a uniquely owned staging directory and check it before index installation. Clean only that command's staged temporary output. Existing immutable files/registry remain byte-identical on refusal; a partial materialization must never be reported complete or leave unindexed public files in an accepted tree.

requestHash is SHA-256 of canonical exact request JSON excluding **only its own top-level requestHash field**; nested pin/hash fields remain included. Prepared-manifest hash similarly excludes only its own top-level hash. proposalHash excludes only its own top-level proposalHash while binding every declared constituent above. These are explicit recipes, not self-hash fixed points. Revalidate both canonical semantic hashes and exact file-byte inventory at write; neither substitutes for the other.

Later refresh appends versions/edition and preserves every old record/raw/edition byte. All source-definition changes are explicit versions; changing only a retrieval instant does not pretend selected values changed, and changed metadata/source notes are still diffs. A complete changed second-vintage fixture changes all five value responses and every selected country observation/source pin, then proves old history intact within both the per-edition 8 MiB and history 20 MiB bounds. Exact shared raw/object bytes count once; raw spelling changes, new retrieval metadata and changed interpretation are not silently deduplicated as identical facts.

CI/release requires an **available exact committed base**, before build: PR event base SHA; push event before SHA; dispatch explicit base. Require exact checked head/event SHA and ancestry; reject missing/shallow-unavailable base, zero/ambiguous revision, nonancestor or malformed previous registry/closure. Bootstrap succeeds only if the exact base proves absence of this registry and its entire allowed root. Append validates the entire previous/current public inventories, all historical/semantic/file hashes, edition sequence, source-baseline A proof, unchanged old bytes and allowed index append. No “offline unavailable” status counts as CI/release success. Read complete old/current objects through bounded `git cat-file --batch`/tree inventory, not thousands of independent Git subprocesses. No provider or network fallback substitutes for missing history. A normal shallow/offline build can validate current checked-in closure but cannot claim this separate historical proof.

## Initial source assertions and remaining gates

Before freezing seed B, reproduce the eleven raw World Bank hashes and the 2,087,188-byte input total, source ID2/lastupdated2026-10-08, exact217/1085/1050/35 selection, all six years/row identities, five empty-ISO3 aggregate groups, all original tokens/status/notes/definitions, 190 point-within-note intervals and six explicitly unknown intervals. Preserve the legacy normalized file 192,713 bytes with hash `8f4a71e525a8b7765691f211b7d94a6d4fed02746a19060b88f196d137f74543`. This comparison is a verified new October27 retrieval of the same selected data, not recovery of original October25 raw responses.

The eight financial assertions are the plan's exact selected historical consolidated audit facts: Wikimedia stock day2024-06-30 (assets286,759,938; liabilities15,204,548; net assets271,555,390) and total operating expenses178,471,109 for2023-07-01…2024-06-30; GiveWell stock day2024-12-31 (assets289,426,000; liabilities21,895,000; net assets267,531,000) and total expenses183,889,000 for its explicit year-ended period. GiveWell printed tokens have scale1,000; Wikimedia scale1. Retain actual PDF/printed pages and source-specific row/column locators, separate unit/period/consolidation/identity evidence, actual retrievals and external raw hashes. Audit report dates are2024-10-08 and2025-06-27; website publication is unknown. EIN200049703 and208625442 map only their parent legal entities. Source records remain draft; no human transcription review or “latest filing” claim follows.

The complete source/support/rights inventory, actual prototype record IDs/versions/locators and initial/changed-vintage closure/export byte totals are now authored in the [private final-DTO proof](#private-pre-freeze-byte-proof), including all 1,093 country and financial coverage cells. Independent agent review verified exact inventories/hashes/pins, source replay, unchanged original immutable files, and both normalized CSV dictionaries' reconstruction of the original complete source hashes. This capacity/replay proof is **not admission by a production validator, verified source A, legal rights approval, independent human source review or a public seed**. The earlier 4,080,462-byte serialization plus 128 KiB allowance is superseded feasibility evidence. Actual implementation must reproduce the complete byte proof without trimming; exact limits/+1, immutable/cache ownership, unavailable/mutated committed-base cases, full changed-vintage, alternate clocks/timezones, all 217 routes and HTML/API/export agreement remain required implementation evidence. Later controlled Chrome and native saved-file proof remain separate gates.

Giving USA figures remain source-scoped context: the cited2026 source values match current data; recipient uses are not a partition of the source-of-giving headline. No invented negative residual, charity ranking or funding-by-depth fill is introduced. Cause Census's actual heading dereference and Compare's unrecorded-estimate wording still need their planned mounted regression fixes. None of these source hashes closes broader financial/cause/need coverage, local coauthorship, independent review or actual research operations.
