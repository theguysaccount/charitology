/** Frozen DTO contract; declarations are not implementations or source evidence. */
export type Hash = string; // exactly64 lowercase hex; Commit exactly40 nonzero hex
export type Commit = string;
export type Id = string; // /^[a-z][a-z0-9-]{0,63}$/; no coercion
export type Instant = string; // canonical YYYY-MM-DDTHH:mm:ss.sssZ, years1000..9999
export type Day = string; // actual Gregorian YYYY-MM-DD, years1000..9999
export type Kind = "method" | "source" | "incident" | "claim" | "edition";
export interface Pin<K extends Kind = Kind> {
  kind: K;
  id: Id;
  version: number;
  hash: Hash;
}
export interface FilePin {
  path: string;
  bytes: number;
  sha256: Hash;
}
// CLI-only ordinary-file identity, exact unsigned decimal strings (no Number
// conversion). ctimeNs is captured after the final content write; uncertain or
// unsupported filesystem identity prevents automatic removal after a crash.
export interface OwnedAddition {
  file: FilePin;
  identity: { device: string; inode: string; ctimeNs: string };
}
export type ReportedTime =
  | null
  | {
      kind: "day";
      day: Day;
      literal: string;
      mapping:
        "iso-day" | "day-month-year" | "english-month-day" | "pdf-metadata-day";
    }
  | {
      kind: "instant";
      instant: Instant;
      literal: string;
      reportedOffset: string;
      mapping: "rfc3339" | "pdf-metadata";
    };
export interface Period {
  start: ReportedTime;
  end: ReportedTime;
  literal: string | null;
}
export interface Geography {
  countries: { code: string; reportedName: string }[];
  areas: string[];
  note: string;
}
export type Hazard =
  | "wildfire"
  | "earthquake"
  | "flood"
  | "storm"
  | "drought"
  | "other"
  | "unclassified";
export type Sector =
  | "shelter"
  | "water-sanitation"
  | "food"
  | "health"
  | "livelihoods"
  | "protection"
  | "infrastructure"
  | "other"
  | "unclassified";
export type Target =
  | { kind: "incident"; incidentId: Id }
  | {
      kind: "response-operation";
      incidentId: Id;
      issuer: string;
      code: string;
      originalUrl: string;
    }
  | {
      kind: "appeal";
      incidentId: Id;
      issuer: string;
      code: string;
      originalUrl: string;
    };
export type Locator =
  | {
      kind: "html";
      headings: string[];
      paragraph: number;
      shortQuote: string | null;
    }
  | {
      kind: "pdf";
      pdfPage: number;
      printedPage: string | null;
      headings: string[];
      row: string[];
      column: string[];
      shortQuote: string | null;
    }
  | { kind: "json"; pointer: string; expectedLiteral: string }
  | {
      kind: "metadata";
      field: "pdf-created" | "pdf-modified" | "http-last-modified";
      parser: string;
      observedLiteral: string;
    };
export type Role =
  | "identity"
  | "statement"
  | "period"
  | "geography"
  | "status"
  | "rights"
  | "date-discrepancy"
  | "access";
export interface Ref {
  source: Pin<"source">;
  item: Id;
  role: Role;
}
export type StatusObservation =
  | null
  | {
      targetKind: "incident";
      value: "ongoing" | "recovery" | "ended" | "unknown";
    }
  | { targetKind: "response-operation"; value: "ongoing" | "ended" | "unknown" }
  | { targetKind: "appeal"; value: "open" | "closed" | "unknown" };
export interface NoteItem {
  id: Id;
  target: Target;
  authoredText: string;
  locator: Locator;
  roles: Role[];
  basis: "source-self-report" | "editorial-access-note";
  status: StatusObservation;
}
export interface SourceNote {
  format: "charitology-disaster-source-note";
  schemaVersion: 1;
  sourceId: Id;
  sourceVersion: number;
  originalSha256: Hash | null;
  items: NoteItem[];
  rights: "charitology-authored-factual-note-only";
  limitations: string[];
  review: "draft";
}
export interface Base<K extends Kind> {
  format: "charitology-disaster-record";
  schemaVersion: 1;
  kind: K;
  id: Id;
  version: number;
  previous: Pin<K> | null;
  hash: Hash;
  review: "draft";
}
export interface Method extends Base<"method"> {
  sourceCommit: Commit;
  sourceFiles: FilePin[];
  adapter: "bounded-issuer-note-v1";
  canonicalEncoding: "DI-C14N-1";
  taxonomy: { hazards: Hazard[]; sectors: Sector[] };
  rules: string[];
}
export interface Source extends Base<"source"> {
  descriptor:
    | "maui-projects"
    | "maui-home"
    | "maui-terms"
    | "ifrc-mdrtr004-final"
    | "fictional-private-only";
  publisher: string;
  title: string;
  requestedUrl: string;
  finalUrl: string;
  retrievedAt: Instant;
  access:
    | { outcome: "retrieved"; httpStatus: 200 }
    | { outcome: "unavailable"; httpStatus: number | null };
  original: {
    mediaType: "text/html" | "application/pdf" | "application/json";
    responseContentType: string | null;
    bytes: number;
    sha256: Hash;
  } | null;
  // mediaType is detected content kind; responseContentType is the exact header,
  // including e.g. application/octet-stream, or null when absent.
  published: ReportedTime;
  sourceUpdated: ReportedTime;
  documentCreated: ReportedTime;
  documentModified: ReportedTime;
  dateDiscrepancy: string | null;
  literalFields: { name: string; value: string }[];
  publicNote: FilePin;
  disposition: "external-original-only";
  rights: {
    reuse: "unknown-not-granted";
    publicOriginal: false;
    attribution: string;
    termsUrl: string | null;
    reason: string;
  };
  evidence: "source-self-report";
  limitations: string[];
}
export interface Incident extends Base<"incident"> {
  name: string;
  hazard: Hazard;
  identifiers: {
    publisher: string;
    value: string;
    originalUrl: string;
    ref: Ref;
  }[];
  geography: Geography;
  period: Period;
  lifecycle: {
    value: "ongoing" | "recovery" | "ended" | "unknown";
    refs: Ref[];
    uncertainty: string;
  };
  editorial: {
    placement: "follow-up" | "archive";
    decidedAt: Instant;
    reason: string;
  };
  checkedAt: Instant;
  recheckAfter: Instant;
  reviewRationale: string;
  refs: Ref[];
  limitations: string[];
}
export interface Quantity {
  reportedText: string;
  unit: string | null;
  currency: string | null;
  definition: string | null;
  refs: Ref[];
}
export type ClaimContent =
  | { kind: "reported-need"; quantity: Quantity | null }
  | { kind: "response-activity"; quantity: Quantity | null }
  | { kind: "appeal-request"; terms: string; quantity: Quantity | null }
  | {
      kind: "status";
      value: "ongoing" | "recovery" | "ended" | "open" | "closed" | "unknown";
    }
  | { kind: "correction"; corrects: Pin<"claim">; reason: string };
export interface Claim extends Base<"claim"> {
  incidentId: Id;
  target: Target;
  attributedSummary: string;
  sector: { editorial: Sector; literal: string | null; reason: string };
  geography: Geography;
  period: Period;
  content: ClaimContent;
  standing: {
    value: "reported" | "disputed" | "withdrawn" | "corrected";
    reason: string;
    related: Pin<"claim">[];
  };
  refs: Ref[];
  limitations: string[];
  evidence: "source-self-report";
}
export interface Coverage {
  geography: string[];
  hazards: Hazard[];
  sectors: Sector[];
  omitted: string[];
  accessibilityChecks: Pin<"source">[];
  worldwideCurrentCoverage: "not-established";
  currentNeedsVerification: "not-established";
}
export interface Change {
  kind:
    | "added"
    | "revised"
    | "disputed"
    | "withdrawn"
    | "access-lost"
    | "capture-only";
  before: Pin | null;
  after: Pin | null;
  reason: string;
}
export interface Edition extends Base<"edition"> {
  asOf: Instant;
  capturedAt: Instant;
  interpretation: Pin<"method">;
  sourceCommit: Commit;
  incidents: Pin<"incident">[];
  claims: Pin<"claim">[];
  sources: Pin<"source">[];
  coverage: Coverage;
  changes: Change[];
  limitations: string[];
}
export interface ArtifactManifest {
  format: "charitology-disaster-artifacts";
  schemaVersion: 1;
  edition: Pin<"edition">;
  files: FilePin[];
  // Exactly exports/{editionId}/{edition.json,edition.csv,coverage.json}, in that
  // order, relative to the inventory root containing registry.json.
}
export interface Registry {
  format: "charitology-disaster-registry";
  schemaVersion: 1;
  bootstrapSourceCommit: Commit;
  selected: Pin<"edition">;
  editions: { edition: Pin<"edition">; artifacts: FilePin }[];
  hash: Hash;
}
export interface Packet {
  format: "charitology-disaster-packet";
  schemaVersion: 1;
  scope:
    | { kind: "complete-edition" }
    | { kind: "selected-incident"; incidentId: Id };
  edition: Edition; // Exact immutable header, including original member inventory.
  method: Method;
  incidents: Incident[];
  claims: Claim[];
  sources: Source[];
  notes: { file: FilePin; value: SourceNote }[];
  boundaryPins: {
    pin: Pin;
    reason:
      | "historical-predecessor"
      | "unselected-edition-member"
      | "editorial-change-reference";
  }[];
  limitations: string[];
  // Required factual refs are closed here. Explicit boundary pins are provenance
  // links only. This packet is never accepted as a history import/restore.
}
export interface HistoryPacket {
  format: "charitology-disaster-history";
  schemaVersion: 1;
  registry: Registry;
  files: { file: FilePin; utf8: string }[];
  // Every admitted core file except registry, plus every artifact manifest;
  // derived edition outputs and private originals excluded, disclosed, rebuildable.
}
export interface CoveragePacket {
  format: "charitology-disaster-coverage";
  schemaVersion: 1;
  edition: Pin<"edition">;
  asOf: Instant;
  coverage: Coverage;
  incidentIds: Id[];
  limitations: string[];
}
export interface ApiEnvelope<T> {
  name: "disaster-incidents" | "disaster-incident-coverage";
  generated: Instant;
  license: string;
  data: T;
}
export interface PreparedOriginal {
  descriptor: Source["descriptor"];
  requestedUrl: string;
  finalUrl: string;
  attemptedAt: Instant;
  status: number | null;
  privatePath: string | null;
  original: Source["original"];
}
export interface PreparedCapture {
  format: "charitology-disaster-prepared";
  schemaVersion: 1;
  interpretationCommit: Commit;
  method: Pin<"method">;
  predecessorRegistryHash: Hash | null;
  originals: PreparedOriginal[];
  proposedFiles: FilePin[];
  totals: {
    preparedBytes: number;
    coreHistoryBytes: number;
    generatedArtifactBytes: number;
  };
  warnings: string[];
  proposalHash: Hash;
}
export interface CaptureRequest {
  interpretationCommit: Commit;
  method: Pin<"method">;
  predecessorRegistryHash: Hash | null;
  candidateId: Id; // resolves only beneath the configured excluded candidate root
}
export interface InstallJournal {
  format: "charitology-disaster-install";
  schemaVersion: 1;
  transactionId: Id;
  proposalHash: Hash;
  interpretationCommit: Commit;
  predecessorRegistryHash: Hash | null;
  phase:
    | "reserved"
    | "staged"
    | "adding"
    | "committing-head"
    | "head-committed"
    | "rolled-back"
    | "recovery-required";
  predecessorRegistryFile: FilePin | null;
  ownedAdditions: OwnedAddition[];
  desiredRegistry: FilePin;
}
export interface InstallResult {
  outcome:
    | "installed"
    | "already-installed"
    | "canceled"
    | "stale"
    | "recovery-required";
  proposalHash: Hash;
  activeRegistryHash: Hash | null;
  message: string;
}
export interface DeviceWarning {
  kind: "unassessable" | "device-after-capture";
  displayedDeviceInstant: Instant | null;
  overdueIncidentIds: Id[];
  qualifier: "Device-clock display only; not a verified current-time or source check.";
}
export interface FreshnessView {
  asOf: Instant;
  checkedAt: Instant;
  recheckAfter: Instant;
  atCapture: "not-due-at-capture" | "review-overdue-at-capture";
}

/** Runtime capabilities are minted only by full byte admission. */
declare const admitted: unique symbol;
export type AdmittedHistory = Readonly<{ [admitted]: true }>;
