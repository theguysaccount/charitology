// Inert declarations from the frozen observation contract. Type-only imports only.
// Runtime admission and private ownership live in observation-model.mjs.

export type ObservationHash = string; // exactly 64 lowercase SHA-256 hex
export type ObservationId = string; // ^[a-z][a-z0-9-]{0,99}$; file-safe, case-sensitive
export type ObservationDay = string; // actual Gregorian YYYY-MM-DD, no inferred UTC instant
export type ObservationInstant = string; // actual ISO UTC YYYY-MM-DDTHH:mm:ss.sssZ
export type ObservationUrl = string; // HTTPS, <=2048 UTF-16 code units, no credentials/backslash/control
export type ObservationPath = string; // one allowed root-relative path, <=240; no traversal/symlink
export interface ObservationDecimal {
  coefficient: string; // canonical signed integer, <=38 digits excluding sign
  exponent: number; // integer -18..18; value = coefficient * 10**exponent
}
export declare const OBSERVATION_LIMITS: {
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
export type ObservationRecordKind =
  "entity" | "scope" | "measure" | "source" | "observation" | "coverage";
export interface ObservationPin<
  K extends ObservationRecordKind = ObservationRecordKind,
> {
  kind: K;
  id: ObservationId;
  version: number; //safe positive integer <=100000
  hash: ObservationHash;
}
export interface ObservationRecordBase<K extends ObservationRecordKind> {
  format: "charitology-observation-record";
  schemaVersion: 1;
  kind: K;
  id: ObservationId;
  version: number;
  previous: ObservationPin<K> | null;
  hash: ObservationHash;
}
export interface ObservationBlobPin {
  path: ObservationPath;
  sha256: ObservationHash; //exact bytes, separate from canonical record hash
  bytes: number; //safe integer, exact stored bytes
  mediaType: "application/json" | "text/plain";
}
export declare function observationDecimalFromLexeme(
  token: string,
): ObservationDecimal;
export declare function observationScaledDecimal(
  token: string,
  scale: ObservationDecimal,
): ObservationDecimal;
export declare function observationDecimalText(
  value: ObservationDecimal,
): string;

export type ObservationJsonExpected =
  | { kind: "string"; value: string }
  | { kind: "number-token"; value: string }
  | { kind: "null" };
export type ObservationLocator =
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
export interface ObservationSourceRef {
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
export interface ObservationRights {
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
export interface ObservationFinancialExcerpt {
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
export interface ObservationSourceRecord extends ObservationRecordBase<"source"> {
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

export type ObservationIdentifier =
  | { kind: "ein"; value: string; sourceRefs: ObservationSourceRef[] } //9 digits, leading zeros retained
  | { kind: "iso2"; value: string; sourceRefs: ObservationSourceRef[] } //2 uppercase letters
  | { kind: "iso3"; value: string; sourceRefs: ObservationSourceRef[] } //3 uppercase letters, incl explicit XKX
  | {
      kind: "producer-country";
      value: string;
      sourceRefs: ObservationSourceRef[];
    };
export interface ObservationEntityRecord extends ObservationRecordBase<"entity"> {
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
export interface ObservationScopeRecord extends ObservationRecordBase<"scope"> {
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
export type ObservationUnit =
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
export interface ObservationMeasureRecord extends ObservationRecordBase<"measure"> {
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
export type ObservationPeriod =
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
export interface ObservationRecord extends ObservationRecordBase<"observation"> {
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

export type ObservationCoverageCell =
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
export interface ObservationCoverageRecord extends ObservationRecordBase<"coverage"> {
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
export interface WorldBankPreparationInput {
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
export interface WorldBankAdapterReport {
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
export declare function prepareWorldBankObservations(
  input: WorldBankPreparationInput,
): WorldBankAdapterReport;
export interface InitialWorldBankAssertions {
  economies: 217;
  cells: 1085;
  present: 1050;
  missing: 35;
  mortalityBounds: 190;
  mortalityWithoutBounds: readonly ["AND", "COD", "PSE", "ROU", "TLS", "XKX"];
  legacyTokenYearStatusNoteIdentityDefinitionDifferences: 0;
}
export declare function assertInitialWorldBankObservations(
  report: WorldBankAdapterReport,
): InitialWorldBankAssertions;

export type ObservationAnyRecord =
  | ObservationEntityRecord
  | ObservationScopeRecord
  | ObservationMeasureRecord
  | ObservationSourceRecord
  | ObservationRecord
  | ObservationCoverageRecord;
export interface ObservationEditionPin {
  id: ObservationId;
  hash: ObservationHash;
  sequence: number;
}
export interface ObservationEdition {
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
export interface ObservationFilePin {
  path: ObservationPath;
  sha256: ObservationHash; //exact pretty JSON+newline or raw bytes
  bytes: number;
}
export interface ObservationRegistry {
  format: "charitology-observation-registry";
  version: 1;
  current: ObservationEditionPin;
  editions: ObservationEditionPin[]; //1..20 in sequence order; all earlier entries retained
  records: ObservationPin[]; //every immutable record version, unique kind/id/version
  files: ObservationFilePin[]; //all immutable files except this registry
  hash: ObservationHash;
}
export interface ObservationFiles {
  readonly [relativePath: string]: string | Uint8Array;
}
export declare const OBSERVATION_VALIDATED: unique symbol;
export interface ValidatedObservationRegistry {
  readonly registry: ObservationRegistry;
  readonly historyBytes: number;
  readonly [OBSERVATION_VALIDATED]: true;
}
export declare function validateObservationFiles(
  files: ObservationFiles,
): ValidatedObservationRegistry;
export declare function observationFactualClosure(
  input: ValidatedObservationRegistry,
  editionId: ObservationId,
): readonly ObservationFilePin[];

export declare const OBSERVATION_PROJECTION: unique symbol;
export interface ObservationProjection {
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
export interface ObservationFilter {
  entityIds: readonly ObservationId[]; //0..1000; [] means all in the selected edition
  measureIds: readonly ObservationId[]; //0..100
  state: "all" | "present" | "missing";
}
export type ObservationSelection =
  | { kind: "scope"; scope: ObservationPin<"scope"> }
  | { kind: "profile"; slug: string }
  | { kind: "ein"; ein: string };
export type ObservationCompatibilityReason =
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
export interface ObservationComparisonCell {
  target: ObservationSelection;
  resolvedScope: ObservationPin<"scope"> | null;
  state: "present" | "not-collected";
  observations: readonly ObservationPin<"observation">[];
}
export interface ObservationComparisonRow {
  family: ObservationMeasureRecord["family"];
  left: ObservationComparisonCell;
  right: ObservationComparisonCell;
  alignment: "same-definition" | "related-definitions" | "not-collected";
  reasons: readonly ObservationCompatibilityReason[];
}
export interface ObservationComparison {
  format: "charitology-observation-comparison";
  version: 1;
  edition: ObservationEditionPin;
  selection: readonly [ObservationSelection, ObservationSelection];
  rows: readonly ObservationComparisonRow[]; //<=100, no difference/ratio/winner/rank/score
  limitations: readonly string[];
}
export declare function observationProjection(
  input: ValidatedObservationRegistry,
  editionId: ObservationId,
): ObservationProjection;
export declare function coverageProjection(
  input: ObservationProjection,
  filter: ObservationFilter,
): readonly ObservationCoverageRecord[];
export declare function compareOrganizations(
  input: ObservationProjection,
  selection: readonly [ObservationSelection, ObservationSelection],
  families: readonly ObservationMeasureRecord["family"][],
): ObservationComparison;
export interface ObservationExportRequest {
  editionId: ObservationId;
  filter: ObservationFilter;
  format: "json" | "csv";
}
export interface ObservationExport {
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
export interface ObservationExportFile extends ObservationFilePin {
  text: string;
}
export type ObservationJsonArchive =
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
export declare function observationExport(
  input: ValidatedObservationRegistry,
  request: ObservationExportRequest,
): ObservationExport;
export declare function observationHistoryExport(
  input: ValidatedObservationRegistry,
): ObservationExport;

export interface LegacyCountryIndicator {
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
export interface LegacyCountryValue {
  value: number;
  year: number;
  footnote: string;
  status: string;
}
export interface LegacyCountryDataset {
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
export declare function legacyCountriesProjection(
  input: ObservationProjection,
): LegacyCountryDataset;

export interface ObservationCaptureRequest {
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
export interface ObservationCaptureDiff {
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
export interface ObservationCapturePreview {
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
export interface ObservationBaseProof {
  mode: "bootstrap-verified" | "append-verified";
  exactBase: string;
  exactHead: string;
  previousRegistryHash: ObservationHash | null;
  currentRegistryHash: ObservationHash;
  oldFilesChecked: number;
  sourceBaselineChecked: string;
}
export interface ObservationPreparedManifest {
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
export interface ObservationSourceBaseline {
  commit: string;
  files: readonly {
    path: ObservationPath;
    sha256: ObservationHash;
    bytes: Uint8Array;
  }[]; //<=100 method/definition inputs, whole <=5MiB
}
export declare function buildObservationCandidate(
  previous: ObservationFiles | null,
  prepared: {
    manifest: ObservationPreparedManifest;
    files: ReadonlyMap<string, Uint8Array>;
  },
  baseline: ObservationSourceBaseline,
  request: ObservationCaptureRequest,
): ObservationCapturePreview;
// Explicit script-layer I/O only; never imported by a build/browser model.
export declare function previewObservationCapture(args: {
  repo: string;
  preparedRoot: string;
  request: ObservationCaptureRequest;
}): Promise<ObservationCapturePreview>;
export declare function writeReviewedObservationCapture(
  preview: ObservationCapturePreview,
  expectedProposalHash: ObservationHash,
): Promise<void>;
export declare function checkObservationAppendOnly(args: {
  repo: string;
  exactBase: string;
  exactHead: string;
}): Promise<ObservationBaseProof>;
