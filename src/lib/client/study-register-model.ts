/** Browser-local research provenance. No storage, DOM, network, clock or identity authority. */
import { sha256 } from "@noble/hashes/sha2.js";
import {
  applyCitationImport,
  validateStoredBatch,
  validateOccurrenceSource,
} from "./study-register-import";
import type { ImportPreview, ImportAssignment } from "./study-register-import";
export type { ImportPreview, ImportAssignment } from "./study-register-import";
export type Id = string;
export type Hash = string;
export type Instant = string;
export type Day = string;
export type Nullable<T> = T | null;
export type Stage = "title-abstract" | "full-report";
export type Lane = "A" | "B";
export type FirstOutcome = "advance" | "exclude" | "undecided";
export type FullOutcome = "include" | "exclude" | "undecided";
export type SourceClass =
  | "unknown"
  | "empirical-report"
  | "review"
  | "method"
  | "guideline"
  | "dataset"
  | "organization"
  | "discussion"
  | "other";
export type Design =
  | "unknown"
  | "randomized"
  | "quasi-experimental"
  | "observational"
  | "qualitative"
  | "systematic-review"
  | "method"
  | "other";
export interface Metadata {
  title: string;
  authors: string | null;
  year: number | null;
  originalYear: string | null;
  doi: string | null;
  pmid: string | null;
  url: string | null;
  abstract: string | null;
  classification: SourceClass;
  design: Design;
  population: string | null;
  intervention: string | null;
  outcomes: string | null;
  tags: string[];
  summary: string | null;
}
export interface ProtocolContent {
  title: string;
  question: string;
  population: string;
  intervention: string;
  comparison: string | null;
  outcomes: string;
  timeHorizon: string | null;
  eligibleDesigns: Design[];
  eligibleSourceClasses: SourceClass[];
  inclusion: string;
  exclusion: string;
  searchPlan: string;
}
export interface Protocol {
  id: Id;
  version: number;
  basedOnId: Id | null;
  hash: Hash;
  content: ProtocolContent;
  frozenAt: Instant;
}
export interface SearchRun {
  id: Id;
  source: string;
  query: string | null;
  searchedOn: Day | null;
  performed: "unknown" | "self-reported";
  provenanceNote: string | null;
  recordedAt: Instant;
}
export interface SourceBacklink {
  title: string;
  href: string;
}
export interface ImportedCitation {
  title: string;
  authors: string | null;
  year: number | null;
  originalYear: string | null;
  doi: string | null;
  pmid: string | null;
  url: string | null;
  abstract: string | null;
}
export interface ImportBatch {
  id: Id;
  kind: "citation-csv" | "site-bibliography";
  identityHash: Hash;
  sourceHash: Hash;
  fileName: string | null;
  parserVersion: "citation-csv-v1" | "site-citations-v1";
  columnMap: Record<string, number>;
  headers: string[];
  searchRunId: Id | null;
  catalogHash: Hash | null;
  provenanceNote: string | null;
  committedAt: Instant;
  assignments: { row: number; occurrenceId: Id; initialReportId: Id }[];
}
export interface Occurrence {
  id: Id;
  batchId: Id;
  row: number;
  rawCells: string[];
  imported: ImportedCitation;
  backlinks: SourceBacklink[];
  reportId: Id;
}
export interface ReportRevision {
  revision: number;
  hash: Hash;
  metadata: Metadata;
  occurrenceIds: Id[];
  reason: string;
  recordedAt: Instant;
}
export interface Report {
  id: Id;
  currentRevision: number;
  revisions: ReportRevision[];
}
export interface DuplicateAction {
  id: Id;
  kind: "merge" | "split" | "decline";
  recordedAt: Instant;
  reason: string;
  moves: { occurrenceId: Id; from: Id; to: Id }[];
  revisions: { reportId: Id; before: number | null; after: number }[];
  suggestionHash: Hash | null;
}
export interface Binding {
  protocolId: Id;
  protocolHash: Hash;
  reportId: Id;
  reportRevision: number;
}
export interface Decision extends Binding {
  id: Id;
  stage: Stage;
  lane: Lane;
  laneLabel: string;
  outcome: FirstOutcome | FullOutcome;
  reasonCode: string | null;
  reason: string | null;
  recordedAt: Instant;
  supersedesId: Id | null;
  retrievalId: Id | null;
}
export interface Resolution extends Binding {
  id: Id;
  stage: Stage;
  decisionA: Id;
  decisionB: Id;
  outcome: "advance" | "include" | "exclude";
  resolverLabel: string;
  reason: string;
  recordedAt: Instant;
}
export interface Retrieval extends Binding {
  id: Id;
  titleBasisHash: Hash;
  state: "pending" | "obtained" | "not-retrieved";
  reason: string | null;
  sourceReference: string | null;
  recordedAt: Instant;
  supersedesId: Id | null;
}
export interface ExtractionValues {
  comparison: string | null;
  population: string | null;
  outcome: string | null;
  measure: string | null;
  unit: string | null;
  followUp: string | null;
  estimate: number | null;
  lower: number | null;
  upper: number | null;
  denominator: number | null;
  sourceReference: string | null;
  bias: string | null;
  limitations: string | null;
}
export interface Extraction extends Binding, ExtractionValues {
  id: Id;
  inclusionHash: Hash;
  supersedesId: Id | null;
  recordedAt: Instant;
}
export interface Counts {
  occurrences: number;
  collapsedOccurrences: number;
  canonicalReports: number;
  titleExcluded: number;
  titleAdvanced: number;
  titlePending: number;
  titleConflicts: number;
  includedReports: number;
  fullExcluded: number;
  notRetrieved: number;
  fullPending: number;
  fullConflicts: number;
  includedWithExtraction: number;
}
export interface PacketDescriptor {
  id: Id;
  recordedAt: Instant;
  inputHash: Hash;
  protocolId: Id;
  protocolHash: Hash;
  counts: Counts;
}
export type DraftKind =
  | "protocol"
  | "metadata"
  | "decision"
  | "resolution"
  | "retrieval"
  | "extraction"
  | "search"
  | "import"
  | "merge"
  | "split";
export interface Draft {
  tab: "browse" | "protocol" | "imports" | "reports" | "screening" | "exports";
  selectedReportId: Id | null;
  form: {
    kind: DraftKind;
    targetId: Id | null;
    fields: Record<string, string>;
  } | null;
  dirty: boolean;
}
export interface StudyState {
  version: 1;
  id: Id;
  revision: number;
  updatedAt: Instant;
  selectedProtocolId: Id | null;
  protocols: Protocol[];
  searchRuns: SearchRun[];
  imports: ImportBatch[];
  occurrences: Occurrence[];
  reports: Report[];
  duplicateActions: DuplicateAction[];
  decisions: Decision[];
  resolutions: Resolution[];
  retrievals: Retrieval[];
  extractions: Extraction[];
  packets: PacketDescriptor[];
  draft: Draft;
}
export interface StudyIssue {
  path: string;
  code: string;
  message: string;
}
export class StudyError extends Error {
  code: string;
  issues: StudyIssue[];
  constructor(code: string, message: string, path = "workspace") {
    super(message);
    this.name = "StudyError";
    this.code = code;
    this.issues = [{ path, code, message }];
  }
}
export interface ModelContext {
  expectedStateHash: Hash;
  at: Instant;
  makeId: () => Id;
  digest?: (bytes: Uint8Array) => Promise<Hash>;
}
export interface PreparedStudyMutation {
  format: "charitology-study-mutation";
  version: 1;
  expectedStateHash: Hash;
  expectedRevision: number;
  nextStateHash: Hash;
  nextState: StudyState;
  commandHash: Hash;
  noOp: boolean;
  summary: {
    kind: StudyCommand["kind"];
    message: string;
    counts: Counts | null;
  };
}
export type StudyCommand =
  | { kind: "draft.replace"; draft: Draft }
  | { kind: "protocol.freeze"; content: ProtocolContent; basedOnId: Id | null }
  | { kind: "protocol.select"; protocolId: Id }
  | {
      kind: "search.record";
      source: string;
      query: string | null;
      searchedOn: Day | null;
      performed: "unknown" | "self-reported";
      provenanceNote: string | null;
    }
  | {
      kind: "import.commit";
      preview: ImportPreview;
      assignments: ImportAssignment[];
      reason: string;
    }
  | {
      kind: "report.correct";
      reportId: Id;
      reportRevision: number;
      metadata: Metadata;
      reason: string;
    }
  | {
      kind: "duplicates.merge";
      reportIds: Id[];
      targetId: Id;
      metadata: Metadata;
      reason: string;
    }
  | {
      kind: "duplicates.split";
      reportId: Id;
      reportRevision: number;
      partitions: {
        retainOriginal: boolean;
        occurrenceIds: Id[];
        metadata: Metadata;
      }[];
      reason: string;
    }
  | {
      kind: "duplicates.decline";
      suggestionHash: Hash;
      reportIds: Id[];
      reason: string;
    }
  | ({
      kind: "decision.record";
      stage: Stage;
      lane: Lane;
      laneLabel: string;
      outcome: FirstOutcome | FullOutcome;
      reasonCode: string | null;
      reason: string | null;
      retrievalId: Id | null;
      supersedesId: Id | null;
    } & Binding)
  | ({
      kind: "resolution.record";
      stage: Stage;
      decisionA: Id;
      decisionB: Id;
      outcome: "advance" | "include" | "exclude";
      resolverLabel: string;
      reason: string;
    } & Binding)
  | ({
      kind: "retrieval.record";
      titleBasisHash: Hash;
      state: "pending" | "obtained" | "not-retrieved";
      reason: string | null;
      sourceReference: string | null;
      supersedesId: Id | null;
    } & Binding)
  | ({
      kind: "extraction.record";
      inclusionHash: Hash;
      supersedesId: Id | null;
      values: ExtractionValues;
    } & Binding)
  | { kind: "packet.record" };
export interface DuplicateSuggestion {
  hash: Hash;
  reportIds: Id[];
  reason: "doi" | "pmid" | "exact-url" | "title-year";
  identifierConflict: boolean;
}
export interface StageView {
  state: string;
  decisionA: Decision | null;
  decisionB: Decision | null;
  resolution: Resolution | null;
  basisHash?: Hash | null;
  inclusionHash?: Hash | null;
}
export interface ReportView {
  report: Report;
  revision: ReportRevision;
  metadata: Metadata;
  occurrences: Occurrence[];
  binding: Binding | null;
  title: StageView;
  retrieval: Retrieval | null;
  full: StageView;
  extraction: Extraction | null;
  eligibility: {
    canTitleDecide: boolean;
    canRetrieve: boolean;
    canFullDecide: boolean;
    canExtract: boolean;
  };
  notices: string[];
}
export const STUDY_LIMITS = Object.freeze({
  reports: 1000,
  occurrences: 2000,
  imports: 20,
  searchRuns: 20,
  protocols: 20,
  history: 8000,
  packets: 20,
  pageSize: 25,
  csvBytes: 1048576,
  backupBytes: 2097152,
  draftBytes: 65536,
  columns: 30,
});
export const SOURCE_CLASSES: readonly SourceClass[] = [
  "unknown",
  "empirical-report",
  "review",
  "method",
  "guideline",
  "dataset",
  "organization",
  "discussion",
  "other",
];
export const STUDY_DESIGNS: readonly Design[] = [
  "unknown",
  "randomized",
  "quasi-experimental",
  "observational",
  "qualitative",
  "systematic-review",
  "method",
  "other",
];
const enc = new TextEncoder();
const reserved = new Set(["__proto__", "prototype", "constructor"]);
export function studyFail(
  code: string,
  message: string,
  path = "workspace",
): never {
  throw new StudyError(code, message, path);
}
export const isStudyId = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v);
export const isStudyHash = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export function exactStudyObject(
  value: unknown,
  keys: readonly string[],
  path: string,
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).some((k) => reserved.has(k) || !keys.includes(k)) ||
    keys.some((k) => !Object.hasOwn(value, k))
  )
    studyFail("fields", "Use the complete documented fields only.", path);
}
export function studyText(
  value: unknown,
  max: number,
  path: string,
  nullable = false,
): string | null {
  if (value === null && nullable) return null;
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)
  )
    studyFail(
      "text",
      `Use ${nullable ? "null or " : ""}nonempty text of at most ${max} characters.`,
      path,
    );
  return value;
}
function integer(
  v: unknown,
  min: number,
  max: number,
  path: string,
): asserts v is number {
  if (!Number.isSafeInteger(v) || (v as number) < min || (v as number) > max)
    studyFail("integer", `Use an integer from ${min} to ${max}.`, path);
}
function choice<T extends string>(
  v: unknown,
  values: readonly T[],
  path: string,
): asserts v is T {
  if (!values.includes(v as T))
    studyFail("choice", "Choose a listed value.", path);
}
function nullableId(v: unknown, path: string) {
  if (v !== null && !isStudyId(v))
    studyFail("id", "Use a saved opaque ID or null.", path);
}
function identifier(v: unknown, path: string): asserts v is Id {
  if (!isStudyId(v))
    studyFail(
      "id",
      "Use an opaque ID of 1–100 letters, numbers, underscores or hyphens.",
      path,
    );
}
function checksum(v: unknown, path: string): asserts v is Hash {
  if (!isStudyHash(v))
    studyFail("hash", "Use a complete lowercase SHA-256 hash.", path);
}
export function validStudyDay(v: unknown): v is Day {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    Number(v.slice(0, 4)) < 1 ||
    Number(v.slice(0, 4)) > 2200
  )
    return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v;
}
function instant(v: unknown, path: string): asserts v is Instant {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) ||
    !validStudyDay(v.slice(0, 10)) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString() !== v
  )
    studyFail(
      "date",
      "Use a real canonical UTC instant with milliseconds.",
      path,
    );
}
export function studyHttps(v: unknown, path: string, nullable = true) {
  if (v === null && nullable) return;
  studyText(v, 1200, path);
  try {
    const u = new URL(v as string);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      /[\r\n]/.test(v as string)
    )
      throw Error();
  } catch {
    studyFail("url", "Use an absolute HTTPS URL without credentials.", path);
  }
}
export function canonicalStudyJson(value: unknown): string {
  const seen = new Set<object>();
  const visit = (v: unknown): string => {
    if (v === null) return "null";
    if (typeof v === "string" || typeof v === "boolean")
      return JSON.stringify(v);
    if (typeof v === "number") {
      if (!Number.isFinite(v))
        studyFail("json", "Only finite JSON values are supported.");
      return JSON.stringify(v);
    }
    if (!v || typeof v !== "object" || seen.has(v))
      studyFail(
        "json",
        "Use a finite JSON graph without cycles or missing values.",
      );
    seen.add(v);
    let s: string;
    if (Array.isArray(v)) {
      if (Object.keys(v).length !== v.length)
        studyFail("json", "Sparse or decorated arrays are not supported.");
      s = "[" + v.map(visit).join(",") + "]";
    } else {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(v)))
        studyFail("json", "Only plain JSON objects are supported.");
      const keys = Object.keys(v).sort();
      if (keys.some((k) => reserved.has(k)))
        studyFail("fields", "Reserved object keys are not accepted.");
      s =
        "{" +
        keys
          .map(
            (k) =>
              JSON.stringify(k) +
              ":" +
              visit((v as Record<string, unknown>)[k]),
          )
          .join(",") +
        "}";
    }
    seen.delete(v);
    return s;
  };
  return visit(value);
}
export const studyClone = <T>(v: T): T =>
  JSON.parse(canonicalStudyJson(v)) as T;
function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object") {
    for (const child of Object.values(v)) deepFreeze(child);
    Object.freeze(v);
  }
  return v;
}
export function hashStudySync(value: unknown): Hash {
  return Array.from(sha256(enc.encode(canonicalStudyJson(value))), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function hashStudyValue(
  value: unknown,
  digest?: ModelContext["digest"],
): Promise<Hash> {
  const bytes = enc.encode(canonicalStudyJson(value));
  if (digest) {
    const result = await digest(bytes.slice());
    checksum(result, "digest");
    return result;
  }
  if (!globalThis.crypto?.subtle)
    studyFail(
      "crypto_unavailable",
      "Secure-context hashing is unavailable; use the read-only recovery view.",
    );
  const result = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(result), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export const studyStateHash = (state: StudyState) => hashStudyValue(state);
export function studyInputHash(state: StudyState): Promise<Hash> {
  const { draft, packets, revision, updatedAt, id, ...input } = state;
  return hashStudyValue(input);
}
function array(
  value: unknown,
  max: number,
  path: string,
): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > max)
    studyFail("limit", `Use an array of at most ${max} entries.`, path);
}
function ids(
  values: unknown,
  max: number,
  path: string,
): asserts values is Id[] {
  array(values, max, path);
  if (
    values.some((v) => !isStudyId(v)) ||
    new Set(values).size !== values.length
  )
    studyFail("ids", "Use distinct opaque IDs.", path);
}
export function validateCitation(
  value: unknown,
  path = "citation",
): ImportedCitation {
  exactStudyObject(
    value,
    [
      "title",
      "authors",
      "year",
      "originalYear",
      "doi",
      "pmid",
      "url",
      "abstract",
    ],
    path,
  );
  studyText(value.title, 500, `${path}.title`);
  studyText(value.authors, 1000, `${path}.authors`, true);
  if (value.year !== null) integer(value.year, 1, 2200, `${path}.year`);
  studyText(value.originalYear, 2000, `${path}.originalYear`, true);
  studyText(value.doi, 200, `${path}.doi`, true);
  studyText(value.pmid, 200, `${path}.pmid`, true);
  studyHttps(value.url, `${path}.url`);
  studyText(value.abstract, 8000, `${path}.abstract`, true);
  return studyClone(value) as unknown as ImportedCitation;
}
const META_KEYS = [
  "title",
  "authors",
  "year",
  "originalYear",
  "doi",
  "pmid",
  "url",
  "abstract",
  "classification",
  "design",
  "population",
  "intervention",
  "outcomes",
  "tags",
  "summary",
] as const;
export function validateStudyMetadata(
  value: unknown,
  path = "metadata",
): Metadata {
  exactStudyObject(value, META_KEYS, path);
  validateCitation(
    Object.fromEntries(
      [
        "title",
        "authors",
        "year",
        "originalYear",
        "doi",
        "pmid",
        "url",
        "abstract",
      ].map((k) => [k, value[k]]),
    ),
    path,
  );
  choice(value.classification, SOURCE_CLASSES, path + ".classification");
  choice(value.design, STUDY_DESIGNS, path + ".design");
  for (const k of ["population", "intervention", "outcomes", "summary"])
    studyText(value[k], 2000, path + "." + k, true);
  array(value.tags, 20, path + ".tags");
  if (
    value.tags.some(
      (t) => typeof t !== "string" || !t.trim() || t.length > 80,
    ) ||
    new Set(value.tags).size !== value.tags.length
  )
    studyFail(
      "tags",
      "Use at most 20 distinct tags of 80 characters.",
      path + ".tags",
    );
  return studyClone(value) as unknown as Metadata;
}
export const metadataFromCitation = (c: ImportedCitation): Metadata => ({
  ...studyClone(c),
  classification: "unknown",
  design: "unknown",
  population: null,
  intervention: null,
  outcomes: null,
  tags: [],
  summary: null,
});
function protocolContent(value: unknown): ProtocolContent {
  const keys = [
    "title",
    "question",
    "population",
    "intervention",
    "comparison",
    "outcomes",
    "timeHorizon",
    "eligibleDesigns",
    "eligibleSourceClasses",
    "inclusion",
    "exclusion",
    "searchPlan",
  ];
  exactStudyObject(value, keys, "protocol");
  for (const k of [
    "title",
    "question",
    "population",
    "intervention",
    "comparison",
    "outcomes",
    "timeHorizon",
    "inclusion",
    "exclusion",
    "searchPlan",
  ])
    studyText(
      value[k],
      k === "title" ? 180 : k === "timeHorizon" ? 500 : 2000,
      "protocol." + k,
      ["comparison", "timeHorizon"].includes(k),
    );
  for (const [k, opts] of [
    ["eligibleDesigns", STUDY_DESIGNS],
    ["eligibleSourceClasses", SOURCE_CLASSES],
  ] as const) {
    array(value[k], 20, "protocol." + k);
    if (new Set(value[k]).size !== value[k].length)
      studyFail("choice", "Duplicate eligible values.", "protocol." + k);
    for (const v of value[k]) choice(v, opts, "protocol." + k);
  }
  return studyClone(value) as unknown as ProtocolContent;
}
const BINDING_KEYS = [
  "protocolId",
  "protocolHash",
  "reportId",
  "reportRevision",
];
const bindKey = (b: Binding) =>
  canonicalStudyJson([
    b.protocolId,
    b.protocolHash,
    b.reportId,
    b.reportRevision,
  ]);
const sameBinding = (a: Binding, b: Binding) => bindKey(a) === bindKey(b);
function currentReport(state: StudyState, id: Id, revision?: number): Report {
  const r = state.reports.find((r) => r.id === id);
  if (!r || !r.revisions.at(-1)?.occurrenceIds.length)
    studyFail(
      "report_unavailable",
      "Choose a current nonempty report.",
      "reportId",
    );
  if (revision !== undefined && r.currentRevision !== revision)
    studyFail(
      "stale_revision",
      "This report changed. Refresh its current revision.",
      "reportRevision",
    );
  return r;
}
export const reportRevision = (r: Report) =>
  r.revisions[r.currentRevision - 1]!;
function selectedProtocol(s: StudyState, id?: Id): Protocol {
  const p = s.protocols.find((p) => p.id === (id ?? s.selectedProtocolId));
  if (!p)
    studyFail(
      "protocol_required",
      "Select a frozen local protocol first.",
      "protocolId",
    );
  return p;
}
function bindingCheck(state: StudyState, b: Binding, current = false) {
  identifier(b.protocolId, "protocolId");
  checksum(b.protocolHash, "protocolHash");
  identifier(b.reportId, "reportId");
  integer(b.reportRevision, 1, 8000, "reportRevision");
  const p = state.protocols.find((p) => p.id === b.protocolId),
    r = state.reports.find((r) => r.id === b.reportId);
  if (!p || p.hash !== b.protocolHash || !r?.revisions[b.reportRevision - 1])
    studyFail("binding", "This protocol/report revision does not exist.");
  if (current) {
    selectedProtocol(state, b.protocolId);
    if (state.selectedProtocolId !== b.protocolId)
      studyFail("binding", "Choose the selected protocol.");
    currentReport(state, b.reportId, b.reportRevision);
  }
}
function latest<T>(rows: T[]): T | null {
  return rows.at(-1) ?? null;
}
function stageView(
  s: StudyState,
  b: Binding,
  stage: Stage,
  retrievalId: Id | null,
): StageView {
  const rows = s.decisions.filter(
    (d) =>
      sameBinding(d, b) &&
      d.stage === stage &&
      (stage === "title-abstract" || d.retrievalId === retrievalId),
  );
  const a = latest(rows.filter((d) => d.lane === "A")),
    bb = latest(rows.filter((d) => d.lane === "B"));
  const resolution =
    a && bb
      ? latest(
          s.resolutions.filter(
            (r) =>
              sameBinding(r, b) &&
              r.stage === stage &&
              r.decisionA === a.id &&
              r.decisionB === bb.id,
          ),
        )
      : null;
  let state = "pending";
  if (a && bb && a.outcome !== "undecided" && bb.outcome !== "undecided")
    state =
      a.outcome === bb.outcome
        ? a.outcome
        : (resolution?.outcome ?? "conflict");
  const basis =
    state === "advance" || state === "include"
      ? hashStudySync({
          binding: b,
          ...(stage === "full-report" ? { retrievalId } : {}),
          decisionA: a!.id,
          decisionB: bb!.id,
          resolutionId: resolution?.id ?? null,
        })
      : null;
  return {
    state,
    decisionA: a,
    decisionB: bb,
    resolution,
    ...(stage === "title-abstract"
      ? { basisHash: basis }
      : { inclusionHash: basis }),
  };
}
export function studyReportView(
  s: StudyState,
  reportId: Id,
  protocolId?: Id,
): ReportView {
  const report = currentReport(s, reportId),
    revision = reportRevision(report),
    occurrences = s.occurrences.filter((o) => o.reportId === reportId);
  const p = s.protocols.find(
    (p) => p.id === (protocolId ?? s.selectedProtocolId),
  );
  const binding = p
    ? {
        protocolId: p.id,
        protocolHash: p.hash,
        reportId,
        reportRevision: report.currentRevision,
      }
    : null;
  const title = binding
    ? stageView(s, binding, "title-abstract", null)
    : {
        state: "pending",
        decisionA: null,
        decisionB: null,
        resolution: null,
        basisHash: null,
      };
  const retrieval =
    binding && title.state === "advance"
      ? latest(
          s.retrievals.filter(
            (r) =>
              sameBinding(r, binding) && r.titleBasisHash === title.basisHash,
          ),
        )
      : null;
  let full: StageView = {
    state: title.state === "advance" ? "pending" : "not-advanced",
    decisionA: null,
    decisionB: null,
    resolution: null,
    inclusionHash: null,
  };
  if (retrieval?.state === "not-retrieved")
    full = { ...full, state: "not-retrieved" };
  else if (binding && retrieval?.state === "obtained")
    full = stageView(s, binding, "full-report", retrieval.id);
  const extraction =
    binding && full.state === "include"
      ? latest(
          s.extractions.filter(
            (e) =>
              sameBinding(e, binding) && e.inclusionHash === full.inclusionHash,
          ),
        )
      : null;
  return {
    report,
    revision,
    metadata: revision.metadata,
    occurrences,
    binding,
    title,
    retrieval,
    full,
    extraction,
    eligibility: {
      canTitleDecide: !!binding,
      canRetrieve: title.state === "advance",
      canFullDecide: retrieval?.state === "obtained",
      canExtract: full.state === "include",
    },
    notices: [
      "Lane labels and timestamps are self-recorded; no independent reviewer or source verification is established.",
    ],
  };
}
export function studyCounts(s: StudyState, protocolId?: Id): Counts {
  selectedProtocol(s, protocolId);
  const reports = s.reports.filter(
    (r) => reportRevision(r).occurrenceIds.length,
  );
  const c: Counts = {
    occurrences: s.occurrences.length,
    collapsedOccurrences: s.occurrences.length - reports.length,
    canonicalReports: reports.length,
    titleExcluded: 0,
    titleAdvanced: 0,
    titlePending: 0,
    titleConflicts: 0,
    includedReports: 0,
    fullExcluded: 0,
    notRetrieved: 0,
    fullPending: 0,
    fullConflicts: 0,
    includedWithExtraction: 0,
  };
  for (const r of reports) {
    const v = studyReportView(s, r.id, protocolId);
    if (v.title.state === "exclude") c.titleExcluded++;
    else if (v.title.state !== "advance") {
      c.titlePending++;
      if (v.title.state === "conflict") c.titleConflicts++;
    } else {
      c.titleAdvanced++;
      if (v.full.state === "include") {
        c.includedReports++;
        if (v.extraction) c.includedWithExtraction++;
      } else if (v.full.state === "exclude") c.fullExcluded++;
      else if (v.full.state === "not-retrieved") c.notRetrieved++;
      else {
        c.fullPending++;
        if (v.full.state === "conflict") c.fullConflicts++;
      }
    }
  }
  return c;
}
export const normalizedDoi = (v: string | null) =>
  v
    ?.trim()
    .replace(/^https:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .toLowerCase() || null;
export const normalizedPmid = (v: string | null) =>
  v?.trim().replace(/^pmid:\s*/i, "") || null;
export function identifierConflict(ms: Metadata[]): boolean {
  return [
    ms.map((m) => normalizedDoi(m.doi)),
    ms.map((m) => normalizedPmid(m.pmid)),
  ].some((xs) => new Set(xs.filter(Boolean)).size > 1);
}
export function duplicateSuggestions(s: StudyState): DuplicateSuggestion[] {
  const buckets = new Map<
    string,
    { reason: DuplicateSuggestion["reason"]; ids: Id[] }
  >();
  for (const r of s.reports) {
    const rev = reportRevision(r);
    if (!rev.occurrenceIds.length) continue;
    const m = rev.metadata;
    for (const [reason, value] of [
      ["doi", normalizedDoi(m.doi)],
      ["pmid", normalizedPmid(m.pmid)],
      ["exact-url", m.url?.trim() ?? null],
      [
        "title-year",
        m.year === null
          ? null
          : canonicalStudyJson([m.title.trim().toLowerCase(), m.year]),
      ],
    ] as const) {
      if (!value) continue;
      const key = reason + ":" + value;
      if (!buckets.has(key)) buckets.set(key, { reason, ids: [] });
      buckets.get(key)!.ids.push(r.id);
    }
  }
  return [...buckets.values()]
    .filter((v) => v.ids.length > 1)
    .map((v) => {
      const reportIds = v.ids.sort();
      return {
        hash: hashStudySync({
          reason: v.reason,
          reportIds,
          revisions: reportIds.map(
            (id) => currentReport(s, id).currentRevision,
          ),
        }),
        reportIds,
        reason: v.reason,
        identifierConflict: identifierConflict(
          reportIds.map((id) => reportRevision(currentReport(s, id)).metadata),
        ),
      };
    })
    .filter(
      (x) =>
        !s.duplicateActions.some(
          (a) => a.kind === "decline" && a.suggestionHash === x.hash,
        ),
    )
    .sort((a, b) => a.hash.localeCompare(b.hash))
    .slice(0, 100);
}
const DRAFT_FIELDS: Record<DraftKind, readonly string[]> = {
  protocol: [
    "title",
    "question",
    "population",
    "intervention",
    "comparison",
    "outcomes",
    "timeHorizon",
    "eligibleDesigns",
    "eligibleSourceClasses",
    "inclusion",
    "exclusion",
    "searchPlan",
    "basedOnId",
  ],
  metadata: [...META_KEYS, "reason", "reportId", "reportRevision"],
  decision: [
    ...BINDING_KEYS,
    "stage",
    "lane",
    "laneLabel",
    "outcome",
    "reasonCode",
    "reason",
    "retrievalId",
    "supersedesId",
  ],
  resolution: [
    ...BINDING_KEYS,
    "stage",
    "decisionA",
    "decisionB",
    "outcome",
    "resolverLabel",
    "reason",
  ],
  retrieval: [
    ...BINDING_KEYS,
    "titleBasisHash",
    "state",
    "reason",
    "sourceReference",
    "supersedesId",
  ],
  extraction: [
    ...BINDING_KEYS,
    "inclusionHash",
    "supersedesId",
    "comparison",
    "population",
    "outcome",
    "measure",
    "unit",
    "followUp",
    "estimate",
    "lower",
    "upper",
    "denominator",
    "sourceReference",
    "bias",
    "limitations",
  ],
  search: ["source", "query", "searchedOn", "performed", "provenanceNote"],
  import: ["columnMap", "searchRunId", "provenanceNote", "reason"],
  merge: ["reportIds", "targetId", "metadata", "reason", "suggestionHash"],
  split: ["reportId", "reportRevision", "partitions", "reason"],
};
function validateDraft(v: unknown, s: StudyState): Draft {
  exactStudyObject(v, ["tab", "selectedReportId", "form", "dirty"], "draft");
  choice(
    v.tab,
    ["browse", "protocol", "imports", "reports", "screening", "exports"],
    "draft.tab",
  );
  nullableId(v.selectedReportId, "draft.selectedReportId");
  if (
    v.selectedReportId !== null &&
    !s.reports.some((r) => r.id === v.selectedReportId)
  )
    studyFail(
      "reference",
      "Draft report is missing.",
      "draft.selectedReportId",
    );
  if (typeof v.dirty !== "boolean")
    studyFail("boolean", "Draft dirty must be true or false.", "draft.dirty");
  if (v.form !== null) {
    exactStudyObject(v.form, ["kind", "targetId", "fields"], "draft.form");
    choice(
      v.form.kind,
      Object.keys(DRAFT_FIELDS) as DraftKind[],
      "draft.form.kind",
    );
    nullableId(v.form.targetId, "draft.form.targetId");
    if (
      !v.form.fields ||
      typeof v.form.fields !== "object" ||
      Array.isArray(v.form.fields)
    )
      studyFail(
        "draft",
        "Raw draft fields must be a plain string map.",
        "draft.form.fields",
      );
    const fields = v.form.fields as Record<string, unknown>;
    if (
      ![Object.prototype, null].includes(Object.getPrototypeOf(fields)) ||
      Object.keys(fields).length > 40
    )
      studyFail(
        "draft",
        "Use at most40 bounded draft fields.",
        "draft.form.fields",
      );
    for (const [k, x] of Object.entries(fields))
      if (
        reserved.has(k) ||
        k.length > 80 ||
        !DRAFT_FIELDS[v.form.kind].includes(k) ||
        typeof x !== "string" ||
        x.length > 8000
      )
        studyFail(
          "draft",
          "A raw form field is unsupported or too large.",
          "draft.form.fields",
        );
  }
  if (enc.encode(canonicalStudyJson(v)).length > STUDY_LIMITS.draftBytes)
    studyFail(
      "draft_limit",
      "The raw draft exceeds 64 KiB. Export/reduce it before continuing.",
      "draft",
    );
  return studyClone(v) as unknown as Draft;
}
export function blankStudyState(id: Id, at: Instant): StudyState {
  identifier(id, "id");
  instant(at, "updatedAt");
  return deepFreeze({
    version: 1,
    id,
    revision: 1,
    updatedAt: at,
    selectedProtocolId: null,
    protocols: [],
    searchRuns: [],
    imports: [],
    occurrences: [],
    reports: [],
    duplicateActions: [],
    decisions: [],
    resolutions: [],
    retrievals: [],
    extractions: [],
    packets: [],
    draft: { tab: "browse", selectedReportId: null, form: null, dirty: false },
  });
}
const STATE_KEYS = [
  "version",
  "id",
  "revision",
  "updatedAt",
  "selectedProtocolId",
  "protocols",
  "searchRuns",
  "imports",
  "occurrences",
  "reports",
  "duplicateActions",
  "decisions",
  "resolutions",
  "retrievals",
  "extractions",
  "packets",
  "draft",
];
const DECISION_KEYS = [
  ...BINDING_KEYS,
  "id",
  "stage",
  "lane",
  "laneLabel",
  "outcome",
  "reasonCode",
  "reason",
  "recordedAt",
  "supersedesId",
  "retrievalId",
];
const RESOLUTION_KEYS = [
  ...BINDING_KEYS,
  "id",
  "stage",
  "decisionA",
  "decisionB",
  "outcome",
  "resolverLabel",
  "reason",
  "recordedAt",
];
const RETRIEVAL_KEYS = [
  ...BINDING_KEYS,
  "id",
  "titleBasisHash",
  "state",
  "reason",
  "sourceReference",
  "recordedAt",
  "supersedesId",
];
const EXTRACTION_VALUE_KEYS = [
  "comparison",
  "population",
  "outcome",
  "measure",
  "unit",
  "followUp",
  "estimate",
  "lower",
  "upper",
  "denominator",
  "sourceReference",
  "bias",
  "limitations",
];
const EXTRACTION_KEYS = [
  ...BINDING_KEYS,
  ...EXTRACTION_VALUE_KEYS,
  "id",
  "inclusionHash",
  "supersedesId",
  "recordedAt",
];
const COUNT_KEYS = [
  "occurrences",
  "collapsedOccurrences",
  "canonicalReports",
  "titleExcluded",
  "titleAdvanced",
  "titlePending",
  "titleConflicts",
  "includedReports",
  "fullExcluded",
  "notRetrieved",
  "fullPending",
  "fullConflicts",
  "includedWithExtraction",
];
function validateCounts(value: unknown) {
  exactStudyObject(value, COUNT_KEYS, "counts");
  for (const [k, v] of Object.entries(value))
    integer(v, 0, 2000, "counts." + k);
  const c = value as unknown as Counts;
  if (
    c.occurrences !== c.collapsedOccurrences + c.canonicalReports ||
    c.canonicalReports !== c.titleExcluded + c.titleAdvanced + c.titlePending ||
    c.titleAdvanced !==
      c.includedReports + c.fullExcluded + c.notRetrieved + c.fullPending ||
    c.titleConflicts > c.titlePending ||
    c.fullConflicts > c.fullPending ||
    c.includedWithExtraction > c.includedReports
  )
    studyFail("counts", "Screening-flow conservation failed.", "counts");
}
function validateExtractionValues(v: unknown): ExtractionValues {
  exactStudyObject(v, EXTRACTION_VALUE_KEYS, "extraction");
  for (const k of EXTRACTION_VALUE_KEYS) {
    if (["estimate", "lower", "upper", "denominator"].includes(k)) {
      if (
        v[k] !== null &&
        (typeof v[k] !== "number" ||
          !Number.isFinite(v[k]) ||
          (k === "denominator" && (v[k] as number) < 0))
      )
        studyFail(
          "number",
          "Use a finite number or null; denominator cannot be negative.",
          "extraction." + k,
        );
    } else studyText(v[k], 2000, "extraction." + k, true);
  }
  const e = v as unknown as ExtractionValues;
  if (
    (e.lower !== null && e.upper !== null && e.lower > e.upper) ||
    (e.estimate !== null && e.lower !== null && e.estimate < e.lower) ||
    (e.estimate !== null && e.upper !== null && e.estimate > e.upper)
  )
    studyFail(
      "interval",
      "Present interval bounds must contain the reported estimate.",
      "extraction",
    );
  return studyClone(e);
}
function historyCount(s: StudyState) {
  return (
    s.protocols.length +
    s.searchRuns.length +
    s.reports.reduce((n, r) => n + r.revisions.length, 0) +
    s.duplicateActions.length +
    s.decisions.length +
    s.resolutions.length +
    s.retrievals.length +
    s.extractions.length +
    s.packets.length
  );
}
function envelope(s: StudyState, exportedAt: Instant, checksum: string) {
  return {
    format: "charitology-study-register",
    version: 1,
    exportedAt,
    checksum,
    workspace: s,
  };
}
export function studyBackupBytes(s: StudyState): number {
  return enc.encode(
    JSON.stringify(
      envelope(s, "2200-12-31T23:59:59.999Z", "0".repeat(64)),
      null,
      2,
    ),
  ).length;
}
function admission(s: StudyState) {
  if (historyCount(s) > STUDY_LIMITS.history)
    studyFail(
      "history_limit",
      "The retained history reached 8,000 entries. Keep an archive rather than pruning it.",
    );
  if (studyBackupBytes(s) > STUDY_LIMITS.backupBytes)
    studyFail(
      "backup_limit",
      "The complete future backup exceeds 2 MiB. No candidate was accepted.",
    );
}
function decisionContext(d: Decision) {
  return canonicalStudyJson([
    bindKey(d),
    d.stage,
    d.lane,
    d.stage === "full-report" ? d.retrievalId : null,
  ]);
}
function lineageBases(s: StudyState) {
  const title = new Map<Hash, string>(),
    full = new Map<Hash, string>(),
    seen = new Map<string, Decision>();
  const register = (a: Decision, b: Decision, r: Resolution | null) => {
    const outcome = r?.outcome ?? a.outcome;
    if (!r && a.outcome !== b.outcome) return;
    if (!["advance", "include"].includes(outcome)) return;
    const binding: Binding = {
      protocolId: a.protocolId,
      protocolHash: a.protocolHash,
      reportId: a.reportId,
      reportRevision: a.reportRevision,
    };
    const h = hashStudySync({
      binding,
      ...(a.stage === "full-report" ? { retrievalId: a.retrievalId } : {}),
      decisionA: a.id,
      decisionB: b.id,
      resolutionId: r?.id ?? null,
    });
    (a.stage === "title-abstract" ? title : full).set(h, bindKey(binding));
  };
  for (const d of s.decisions) {
    seen.set(decisionContext(d), d);
    const opposite = seen.get(
      decisionContext({ ...d, lane: d.lane === "A" ? "B" : "A" }),
    );
    if (opposite)
      register(
        d.lane === "A" ? d : opposite,
        d.lane === "B" ? d : opposite,
        null,
      );
  }
  for (const r of s.resolutions) {
    const a = s.decisions.find((d) => d.id === r.decisionA),
      b = s.decisions.find((d) => d.id === r.decisionB);
    if (a && b) register(a, b, r);
  }
  return { title, full };
}
/** Validate a snapshot, retaining no caller-owned mutable references across asynchronous digest work. */
export async function validateStudyState(value: unknown): Promise<StudyState> {
  const original = canonicalStudyJson(value);
  if (enc.encode(original).length > STUDY_LIMITS.backupBytes)
    studyFail("backup_limit", "Workspace exceeds the supported backup bound.");
  const s = JSON.parse(original) as StudyState;
  exactStudyObject(s, STATE_KEYS, "workspace");
  if (s.version !== 1) studyFail("version", "Use a version 1 study register.");
  identifier(s.id, "id");
  integer(s.revision, 1, Number.MAX_SAFE_INTEGER, "revision");
  instant(s.updatedAt, "updatedAt");
  nullableId(s.selectedProtocolId, "selectedProtocolId");
  for (const [k, max] of [
    ["protocols", 20],
    ["searchRuns", 20],
    ["imports", 20],
    ["occurrences", 2000],
    ["reports", 1000],
    ["duplicateActions", 8000],
    ["decisions", 8000],
    ["resolutions", 8000],
    ["retrievals", 8000],
    ["extractions", 8000],
    ["packets", 20],
  ] as const)
    array(s[k], max, k);
  const allIds = new Set<string>([s.id]);
  for (const key of [
    "protocols",
    "searchRuns",
    "imports",
    "occurrences",
    "reports",
    "duplicateActions",
    "decisions",
    "resolutions",
    "retrievals",
    "extractions",
    "packets",
  ] as const)
    for (const raw of s[key]) {
      if (!raw || typeof raw !== "object")
        studyFail("entity", "Use complete entity objects.", key);
      identifier(raw.id, key + ".id");
      if (allIds.has(raw.id))
        studyFail("duplicate_id", "Entity IDs must be globally unique.", key);
      allIds.add(raw.id);
    }
  const protocolHashes = new Set<string>();
  for (const [pidx, p] of s.protocols.entries()) {
    exactStudyObject(
      p,
      ["id", "version", "basedOnId", "hash", "content", "frozenAt"],
      "protocol",
    );
    integer(p.version, pidx + 1, pidx + 1, "protocol.version");
    nullableId(p.basedOnId, "protocol.basedOnId");
    if (
      pidx === 0
        ? p.basedOnId !== null
        : !s.protocols.slice(0, pidx).some((x) => x.id === p.basedOnId)
    )
      studyFail(
        "protocol_parent",
        "A protocol version must identify an earlier version.",
      );
    instant(p.frozenAt, "protocol.frozenAt");
    protocolContent(p.content);
    checksum(p.hash, "protocol.hash");
    if (
      p.hash !== (await hashStudyValue(p.content)) ||
      protocolHashes.has(p.hash)
    )
      studyFail(
        "protocol_hash",
        "Protocol content/hash is changed or repeated.",
      );
    protocolHashes.add(p.hash);
  }
  if (
    s.selectedProtocolId !== null &&
    !s.protocols.some((p) => p.id === s.selectedProtocolId)
  )
    studyFail("reference", "Selected protocol is missing.");
  for (const run of s.searchRuns) {
    exactStudyObject(
      run,
      [
        "id",
        "source",
        "query",
        "searchedOn",
        "performed",
        "provenanceNote",
        "recordedAt",
      ],
      "search",
    );
    studyText(run.source, 2000, "search.source");
    studyText(run.query, 2000, "search.query", true);
    if (run.searchedOn !== null && !validStudyDay(run.searchedOn))
      studyFail("date", "Use a real search day or null.");
    choice(run.performed, ["unknown", "self-reported"], "search.performed");
    studyText(run.provenanceNote, 2000, "search.provenanceNote", true);
    instant(run.recordedAt, "search.recordedAt");
  }
  const batchHashes = new Set<string>();
  for (const b of s.imports) {
    await validateStoredBatch(b, s);
    if (batchHashes.has(b.identityHash))
      studyFail(
        "import_duplicate",
        "Exact import identities may appear only once.",
      );
    batchHashes.add(b.identityHash);
  }
  for (const r of s.reports) {
    exactStudyObject(r, ["id", "currentRevision", "revisions"], "report");
    array(r.revisions, 8000, "report.revisions");
    integer(r.currentRevision, 1, 8000, "report.currentRevision");
    if (r.currentRevision !== r.revisions.length)
      studyFail(
        "revision",
        "Report current revision must name its final retained version.",
      );
    for (const [i, v] of r.revisions.entries()) {
      exactStudyObject(
        v,
        [
          "revision",
          "hash",
          "metadata",
          "occurrenceIds",
          "reason",
          "recordedAt",
        ],
        "reportRevision",
      );
      integer(v.revision, i + 1, i + 1, "reportRevision.revision");
      validateStudyMetadata(v.metadata);
      ids(v.occurrenceIds, 2000, "reportRevision.occurrenceIds");
      studyText(v.reason, 2000, "reportRevision.reason");
      instant(v.recordedAt, "reportRevision.recordedAt");
      checksum(v.hash, "reportRevision.hash");
      if (
        v.hash !==
        (await hashStudyValue({
          reportId: r.id,
          revision: v.revision,
          metadata: v.metadata,
          occurrenceIds: v.occurrenceIds,
        }))
      )
        studyFail("revision_hash", "A retained report revision changed.");
    }
  }
  const occurrenceIds = new Set(s.occurrences.map((o) => o.id));
  for (const o of s.occurrences) {
    exactStudyObject(
      o,
      ["id", "batchId", "row", "rawCells", "imported", "backlinks", "reportId"],
      "occurrence",
    );
    identifier(o.batchId, "occurrence.batchId");
    identifier(o.reportId, "occurrence.reportId");
    integer(o.row, 1, 1000000, "occurrence.row");
    const batch = s.imports.find((b) => b.id === o.batchId);
    if (
      !batch ||
      !batch.assignments.some((a) => a.row === o.row && a.occurrenceId === o.id)
    )
      studyFail(
        "occurrence",
        "An occurrence must identify its retained source batch/row.",
      );
    if (!s.reports.some((r) => r.id === o.reportId))
      studyFail("reference", "Current canonical report is missing.");
    array(o.rawCells, 30, "occurrence.rawCells");
    if (o.rawCells.length !== batch.headers.length)
      studyFail(
        "row_width",
        "Retained row width must match its source headers.",
      );
    for (const [i, cell] of o.rawCells.entries())
      if (
        typeof cell !== "string" ||
        cell.length > (batch.columnMap.abstract === i ? 8000 : 2000)
      )
        studyFail("cell_limit", "Retained source cell is oversized.");
    validateCitation(o.imported);
    validateOccurrenceSource(o, batch);
    array(o.backlinks, 100, "backlinks");
    for (const link of o.backlinks) {
      exactStudyObject(link, ["title", "href"], "backlink");
      studyText(link.title, 500, "backlink.title");
      if (
        typeof link.href !== "string" ||
        link.href.length > 1200 ||
        !/^\/(?!\/)[A-Za-z0-9_./#%?=&-]*$/.test(link.href) ||
        /[\\\r\n]/.test(link.href) ||
        link.href.includes("..")
      )
        studyFail("backlink", "Use a controlled internal source path.");
    }
  }
  for (const b of s.imports)
    for (const a of b.assignments) {
      if (
        !s.occurrences.some(
          (o) =>
            o.id === a.occurrenceId && o.batchId === b.id && o.row === a.row,
        ) ||
        !s.reports.some((r) => r.id === a.initialReportId)
      )
        studyFail(
          "import_reference",
          "Every retained import assignment must resolve.",
        );
    }

  for (const r of s.reports) {
    for (const v of r.revisions)
      if (v.occurrenceIds.some((id) => !occurrenceIds.has(id)))
        studyFail("reference", "A historical source occurrence is missing.");
    const mapped = s.occurrences
      .filter((o) => o.reportId === r.id)
      .map((o) => o.id)
      .sort();
    if (
      canonicalStudyJson(mapped) !==
      canonicalStudyJson([...reportRevision(r).occurrenceIds].sort())
    )
      studyFail(
        "mapping",
        "Canonical source mapping disagrees with report revision.",
      );
  }
  for (const action of s.duplicateActions) {
    exactStudyObject(
      action,
      [
        "id",
        "kind",
        "recordedAt",
        "reason",
        "moves",
        "revisions",
        "suggestionHash",
      ],
      "duplicateAction",
    );
    choice(action.kind, ["merge", "split", "decline"], "duplicateAction.kind");
    instant(action.recordedAt, "duplicateAction.recordedAt");
    studyText(action.reason, 2000, "duplicateAction.reason");
    if (action.suggestionHash !== null)
      checksum(action.suggestionHash, "suggestionHash");
    array(action.moves, 2000, "moves");
    array(action.revisions, action.kind === "decline" ? 1000 : 20, "revisions");
    const moved = new Set<string>();
    for (const move of action.moves) {
      exactStudyObject(move, ["occurrenceId", "from", "to"], "move");
      if (
        !occurrenceIds.has(move.occurrenceId) ||
        !s.reports.some((r) => r.id === move.from) ||
        !s.reports.some((r) => r.id === move.to) ||
        moved.has(move.occurrenceId)
      )
        studyFail(
          "duplicate_history",
          "Duplicate history references are invalid.",
        );
      moved.add(move.occurrenceId);
    }
    const revised = new Set<string>();
    for (const v of action.revisions) {
      exactStudyObject(v, ["reportId", "before", "after"], "duplicateRevision");
      integer(v.after, 1, Number.MAX_SAFE_INTEGER, "duplicateRevision.after");
      if (v.before !== null)
        integer(
          v.before,
          1,
          Number.MAX_SAFE_INTEGER,
          "duplicateRevision.before",
        );
      const r = s.reports.find((r) => r.id === v.reportId);
      if (
        !r ||
        revised.has(v.reportId) ||
        !r.revisions[v.after - 1] ||
        (v.before !== null && !r.revisions[v.before - 1]) ||
        (v.before !== null &&
          v.after !== v.before + (action.kind === "decline" ? 0 : 1))
      )
        studyFail(
          "duplicate_history",
          "Duplicate history revision is missing.",
        );
      revised.add(v.reportId);
    }
  }
  const replayMapping = new Map<Id, Id>();
  for (const b of s.imports)
    for (const a of b.assignments)
      replayMapping.set(a.occurrenceId, a.initialReportId);
  for (const action of s.duplicateActions)
    for (const move of action.moves) {
      if (replayMapping.get(move.occurrenceId) !== move.from)
        studyFail(
          "duplicate_history",
          "Source mapping history does not follow its original assignments.",
        );
      replayMapping.set(move.occurrenceId, move.to);
    }
  for (const o of s.occurrences)
    if (replayMapping.get(o.id) !== o.reportId)
      studyFail(
        "duplicate_history",
        "Current source mapping disagrees with retained merge/split history.",
      );
  const decisionLatest = new Map<string, Decision>();
  for (const d of s.decisions) {
    exactStudyObject(d, DECISION_KEYS, "decision");
    bindingCheck(s, d);
    choice(d.stage, ["title-abstract", "full-report"], "decision.stage");
    choice(d.lane, ["A", "B"], "decision.lane");
    studyText(d.laneLabel, 100, "decision.laneLabel");
    choice(
      d.outcome,
      d.stage === "title-abstract"
        ? ["advance", "exclude", "undecided"]
        : ["include", "exclude", "undecided"],
      "decision.outcome",
    );
    studyText(d.reasonCode, 100, "decision.reasonCode", true);
    studyText(d.reason, 2000, "decision.reason", true);
    if (d.outcome === "exclude" && (!d.reasonCode || !d.reason))
      studyFail(
        "exclusion_reason",
        "Exclusion requires a code and explanation.",
      );
    instant(d.recordedAt, "decision.recordedAt");
    nullableId(d.retrievalId, "retrievalId");
    nullableId(d.supersedesId, "supersedesId");
    if (d.stage === "title-abstract" && d.retrievalId !== null)
      studyFail("stage", "Title screening has no retrieval ID.");
    if (d.stage === "full-report") {
      const r = s.retrievals.find((r) => r.id === d.retrievalId);
      if (!r || r.state !== "obtained" || !sameBinding(r, d))
        studyFail(
          "retrieval",
          "Full-report screening needs its exact obtained retrieval.",
        );
    }
    const key = decisionContext(d),
      old = decisionLatest.get(key);
    if (d.supersedesId !== (old?.id ?? null))
      studyFail(
        "supersession",
        "A decision must supersede the exact previous decision in its context.",
      );
    decisionLatest.set(key, d);
  }
  const pairs = new Set<string>();
  for (const r of s.resolutions) {
    exactStudyObject(r, RESOLUTION_KEYS, "resolution");
    bindingCheck(s, r);
    instant(r.recordedAt, "resolution.recordedAt");
    studyText(r.resolverLabel, 100, "resolution.resolverLabel");
    studyText(r.reason, 2000, "resolution.reason");
    const a = s.decisions.find((d) => d.id === r.decisionA),
      b = s.decisions.find((d) => d.id === r.decisionB);
    if (
      !a ||
      !b ||
      a.lane !== "A" ||
      b.lane !== "B" ||
      !sameBinding(a, r) ||
      !sameBinding(b, r) ||
      a.stage !== r.stage ||
      b.stage !== r.stage ||
      a.retrievalId !== b.retrievalId ||
      a.outcome === "undecided" ||
      b.outcome === "undecided" ||
      a.outcome === b.outcome ||
      ![a.outcome, b.outcome].includes(r.outcome)
    )
      studyFail(
        "resolution",
        "A resolution must identify a disagreeing completed pair and chosen outcome.",
      );
    const pair = canonicalStudyJson([r.decisionA, r.decisionB]);
    if (pairs.has(pair))
      studyFail("resolution", "A decision pair has more than one resolution.");
    pairs.add(pair);
  }
  const bases = lineageBases(s),
    retLatest = new Map<string, Retrieval>();
  for (const r of s.retrievals) {
    exactStudyObject(r, RETRIEVAL_KEYS, "retrieval");
    bindingCheck(s, r);
    checksum(r.titleBasisHash, "titleBasisHash");
    if (bases.title.get(r.titleBasisHash) !== bindKey(r))
      studyFail(
        "title_basis",
        "Retrieval needs retained title-advance decision lineage.",
      );
    choice(
      r.state,
      ["pending", "obtained", "not-retrieved"],
      "retrieval.state",
    );
    studyText(r.reason, 2000, "retrieval.reason", true);
    studyText(r.sourceReference, 2000, "retrieval.sourceReference", true);
    if (r.state === "not-retrieved" && !r.reason)
      studyFail("retrieval_reason", "A not-retrieved report needs a reason.");
    instant(r.recordedAt, "retrieval.recordedAt");
    const key = bindKey(r) + r.titleBasisHash;
    if (r.supersedesId !== (retLatest.get(key)?.id ?? null))
      studyFail(
        "supersession",
        "Retrieval must supersede its exact prior basis record.",
      );
    retLatest.set(key, r);
  }
  const extLatest = new Map<string, Extraction>();
  for (const e of s.extractions) {
    exactStudyObject(e, EXTRACTION_KEYS, "extraction");
    bindingCheck(s, e);
    checksum(e.inclusionHash, "inclusionHash");
    if (bases.full.get(e.inclusionHash) !== bindKey(e))
      studyFail(
        "inclusion_basis",
        "Extraction needs retained full-report inclusion lineage.",
      );
    validateExtractionValues(
      Object.fromEntries(
        EXTRACTION_VALUE_KEYS.map((k) => [
          k,
          (e as unknown as Record<string, unknown>)[k],
        ]),
      ),
    );
    instant(e.recordedAt, "extraction.recordedAt");
    const key = bindKey(e) + e.inclusionHash;
    if (e.supersedesId !== (extLatest.get(key)?.id ?? null))
      studyFail(
        "supersession",
        "Extraction must supersede its exact prior included version.",
      );
    extLatest.set(key, e);
  }
  for (const p of s.packets) {
    exactStudyObject(
      p,
      ["id", "recordedAt", "inputHash", "protocolId", "protocolHash", "counts"],
      "packet",
    );
    instant(p.recordedAt, "packet.recordedAt");
    checksum(p.inputHash, "packet.inputHash");
    const protocol = s.protocols.find((x) => x.id === p.protocolId);
    if (!protocol || protocol.hash !== p.protocolHash)
      studyFail("packet", "Packet protocol is missing.");
    validateCounts(p.counts);
  }
  validateDraft(s.draft, s);
  if (s.selectedProtocolId) validateCounts(studyCounts(s));
  admission(s);
  if (canonicalStudyJson(value) !== original)
    studyFail("input_changed", "Input changed while validation was running.");
  return deepFreeze(s);
}
export function appendStudyReportRevision(
  s: StudyState,
  report: Report,
  metadata: Metadata,
  occurrenceIds: Id[],
  reason: string,
  at: Instant,
) {
  const revision = report.revisions.length + 1;
  const v = {
    revision,
    metadata: studyClone(metadata),
    occurrenceIds: [...occurrenceIds].sort(),
    reason,
    recordedAt: at,
    hash: "",
  };
  v.hash = hashStudySync({
    reportId: report.id,
    revision,
    metadata: v.metadata,
    occurrenceIds: v.occurrenceIds,
  });
  report.revisions.push(v);
  report.currentRevision = revision;
}
const COMMAND_KEYS: Record<StudyCommand["kind"], string[]> = {
  "draft.replace": ["draft"],
  "protocol.freeze": ["content", "basedOnId"],
  "protocol.select": ["protocolId"],
  "search.record": [
    "source",
    "query",
    "searchedOn",
    "performed",
    "provenanceNote",
  ],
  "import.commit": ["preview", "assignments", "reason"],
  "report.correct": ["reportId", "reportRevision", "metadata", "reason"],
  "duplicates.merge": ["reportIds", "targetId", "metadata", "reason"],
  "duplicates.split": ["reportId", "reportRevision", "partitions", "reason"],
  "duplicates.decline": ["suggestionHash", "reportIds", "reason"],
  "decision.record": [
    ...BINDING_KEYS,
    "stage",
    "lane",
    "laneLabel",
    "outcome",
    "reasonCode",
    "reason",
    "retrievalId",
    "supersedesId",
  ],
  "resolution.record": [
    ...BINDING_KEYS,
    "stage",
    "decisionA",
    "decisionB",
    "outcome",
    "resolverLabel",
    "reason",
  ],
  "retrieval.record": [
    ...BINDING_KEYS,
    "titleBasisHash",
    "state",
    "reason",
    "sourceReference",
    "supersedesId",
  ],
  "extraction.record": [
    ...BINDING_KEYS,
    "inclusionHash",
    "supersedesId",
    "values",
  ],
  "packet.record": [],
};
function commandSnapshot(command: StudyCommand): unknown {
  if (command.kind !== "import.commit") return command;
  const p = command.preview;
  if (p?.input?.kind !== "citation-csv") return command;
  const bytes = p.input.bytes;
  if (!(bytes instanceof Uint8Array))
    studyFail("csv", "Import bytes are missing.");
  if (bytes.length > STUDY_LIMITS.csvBytes)
    studyFail("csv_limit", "Choose a CSV no larger than 1 MiB.");
  return {
    ...command,
    preview: {
      ...p,
      input: {
        ...p.input,
        bytes: {
          length: bytes.length,
          sha256: Array.from(sha256(bytes), (b) =>
            b.toString(16).padStart(2, "0"),
          ).join(""),
        },
      },
    },
  };
}
function relevantDraft(s: StudyState, cmd: StudyCommand) {
  const map: Partial<Record<StudyCommand["kind"], DraftKind>> = {
    "protocol.freeze": "protocol",
    "search.record": "search",
    "import.commit": "import",
    "report.correct": "metadata",
    "duplicates.merge": "merge",
    "duplicates.decline": "merge",
    "duplicates.split": "split",
    "decision.record": "decision",
    "resolution.record": "resolution",
    "retrieval.record": "retrieval",
    "extraction.record": "extraction",
  };
  const form = s.draft.form;
  if (!form || form.kind !== map[cmd.kind]) return;
  const target =
    "reportId" in cmd
      ? cmd.reportId
      : cmd.kind === "duplicates.merge"
        ? cmd.targetId
        : null;
  if (form.targetId === null || form.targetId === target) {
    s.draft.form = null;
    s.draft.dirty = false;
  }
}
export async function prepareStudyCommand(
  state: StudyState,
  command: StudyCommand,
  context: ModelContext,
): Promise<PreparedStudyMutation> {
  const sourceJson = canonicalStudyJson(state);
  const commandJson = canonicalStudyJson(commandSnapshot(command));
  const cmd = structuredClone(command);
  const expected = context.expectedStateHash,
    at = context.at;
  checksum(expected, "expectedStateHash");
  instant(at, "at");
  if (typeof context.makeId !== "function")
    studyFail("id", "Supply an ID factory.");
  if (!cmd || !Object.hasOwn(COMMAND_KEYS, cmd.kind))
    studyFail("command", "Choose a documented study command.");
  exactStudyObject(
    cmd as unknown,
    ["kind", ...COMMAND_KEYS[cmd.kind]],
    "command",
  );
  if (
    (await hashStudyValue(JSON.parse(sourceJson), context.digest)) !== expected
  )
    studyFail(
      "stale_state",
      "The workspace changed. Read its current version before applying this command.",
    );
  const valid = await validateStudyState(JSON.parse(sourceJson)),
    s = studyClone(valid),
    generated: Id[] = [];
  const used = new Set<string>([s.id]);
  for (const key of [
    "protocols",
    "searchRuns",
    "imports",
    "occurrences",
    "reports",
    "duplicateActions",
    "decisions",
    "resolutions",
    "retrievals",
    "extractions",
    "packets",
  ] as const)
    for (const row of s[key]) used.add(row.id);
  const newId = () => {
    const id = context.makeId();
    identifier(id, "generatedId");
    if (used.has(id))
      studyFail("duplicate_id", "A generated ID already exists.");
    used.add(id);
    generated.push(id);
    return id;
  };
  let noOp = false,
    message = "Local research work recorded.";
  switch (cmd.kind) {
    case "draft.replace":
      s.draft = validateDraft(cmd.draft, s);
      noOp = canonicalStudyJson(s.draft) === canonicalStudyJson(valid.draft);
      message = "Raw form draft kept locally.";
      break;
    case "protocol.freeze": {
      const content = protocolContent(cmd.content),
        contentHash = await hashStudyValue(content, context.digest);
      nullableId(cmd.basedOnId, "basedOnId");
      if (
        s.protocols.length
          ? !s.protocols.some((p) => p.id === cmd.basedOnId)
          : cmd.basedOnId !== null
      )
        studyFail(
          "protocol_parent",
          "Choose an earlier protocol version, or null for the first.",
        );
      const existing = s.protocols.find((p) => p.hash === contentHash);
      if (existing) {
        noOp = s.selectedProtocolId === existing.id;
        s.selectedProtocolId = existing.id;
        message =
          "Selected the existing identical local protocol; no new version was minted.";
        break;
      }
      const p = {
        id: newId(),
        version: s.protocols.length + 1,
        basedOnId: cmd.basedOnId,
        hash: contentHash,
        content,
        frozenAt: at,
      };
      s.protocols.push(p);
      s.selectedProtocolId = p.id;
      message =
        "Local protocol version frozen; this is not independent public registration.";
      break;
    }
    case "protocol.select":
      selectedProtocol(s, cmd.protocolId);
      noOp = s.selectedProtocolId === cmd.protocolId;
      s.selectedProtocolId = cmd.protocolId;
      message =
        "Selected local protocol; other-version decisions remain historical.";
      break;
    case "search.record":
      s.searchRuns.push({
        id: newId(),
        source: cmd.source,
        query: cmd.query,
        searchedOn: cmd.searchedOn,
        performed: cmd.performed,
        provenanceNote: cmd.provenanceNote,
        recordedAt: at,
      });
      message =
        "Search provenance recorded as entered; no search was run by the software.";
      break;
    case "import.commit": {
      const result = await applyCitationImport(
        s,
        cmd.preview,
        cmd.assignments,
        { expectedStateHash: expected, at, newId, reason: cmd.reason },
      );
      noOp = result.noOp;
      message = result.message;
      break;
    }
    case "report.correct": {
      const r = currentReport(s, cmd.reportId, cmd.reportRevision),
        metadata = validateStudyMetadata(cmd.metadata);
      studyText(cmd.reason, 2000, "reason");
      noOp =
        canonicalStudyJson(metadata) ===
        canonicalStudyJson(reportRevision(r).metadata);
      if (!noOp)
        appendStudyReportRevision(
          s,
          r,
          metadata,
          reportRevision(r).occurrenceIds,
          cmd.reason,
          at,
        );
      message =
        "Metadata correction retained as a new revision; old screening is historical.";
      break;
    }
    case "duplicates.merge": {
      ids(cmd.reportIds, 20, "reportIds");
      if (cmd.reportIds.length < 2 || !cmd.reportIds.includes(cmd.targetId))
        studyFail(
          "merge",
          "Choose 2–20 current reports including the retained target.",
        );
      studyText(cmd.reason, 2000, "reason");
      const reports = cmd.reportIds.map((id) => currentReport(s, id)),
        metadata = validateStudyMetadata(cmd.metadata);
      if (
        identifierConflict([
          ...reports.map((r) => reportRevision(r).metadata),
          metadata,
        ])
      )
        studyFail(
          "identifier_conflict",
          "Resolve conflicting DOI/PMID metadata deliberately before merging.",
        );
      const target = currentReport(s, cmd.targetId),
        moves: DuplicateAction["moves"] = [],
        revisions: DuplicateAction["revisions"] = [];
      for (const o of s.occurrences)
        if (cmd.reportIds.includes(o.reportId) && o.reportId !== target.id) {
          moves.push({ occurrenceId: o.id, from: o.reportId, to: target.id });
          o.reportId = target.id;
        }
      for (const r of reports) {
        const before = r.currentRevision;
        appendStudyReportRevision(
          s,
          r,
          r.id === target.id ? metadata : reportRevision(r).metadata,
          s.occurrences.filter((o) => o.reportId === r.id).map((o) => o.id),
          cmd.reason,
          at,
        );
        revisions.push({ reportId: r.id, before, after: r.currentRevision });
      }
      s.duplicateActions.push({
        id: newId(),
        kind: "merge",
        recordedAt: at,
        reason: cmd.reason,
        moves,
        revisions,
        suggestionHash: null,
      });
      message =
        "Explicit merge retained every source row and invalidated affected current screening.";
      break;
    }
    case "duplicates.split": {
      const original = currentReport(s, cmd.reportId, cmd.reportRevision);
      studyText(cmd.reason, 2000, "reason");
      array(cmd.partitions, 20, "partitions");
      if (
        cmd.partitions.length < 2 ||
        cmd.partitions.filter((p) => p.retainOriginal === true).length !== 1
      )
        studyFail(
          "split",
          "Use 2–20 nonempty partitions, exactly one retaining the old ID.",
        );
      const assigned: Id[] = [],
        revisions: DuplicateAction["revisions"] = [],
        moves: DuplicateAction["moves"] = [];
      const groups = cmd.partitions.map((p) => {
        exactStudyObject(
          p,
          ["retainOriginal", "occurrenceIds", "metadata"],
          "partition",
        );
        if (typeof p.retainOriginal !== "boolean")
          studyFail("split", "Specify which partition retains the original.");
        ids(p.occurrenceIds, 2000, "partition.occurrenceIds");
        if (!p.occurrenceIds.length)
          studyFail("split", "Empty partitions are unavailable.");
        assigned.push(...p.occurrenceIds);
        return { ...p, metadata: validateStudyMetadata(p.metadata) };
      });
      const source = [...reportRevision(original).occurrenceIds].sort();
      if (
        new Set(assigned).size !== assigned.length ||
        canonicalStudyJson([...assigned].sort()) !== canonicalStudyJson(source)
      )
        studyFail(
          "split",
          "Partitions must cover every current occurrence exactly once.",
        );
      for (const p of groups) {
        const report = p.retainOriginal
          ? original
          : { id: newId(), currentRevision: 0, revisions: [] };
        if (!p.retainOriginal) s.reports.push(report);
        const before = report.currentRevision || null;
        appendStudyReportRevision(
          s,
          report,
          p.metadata,
          p.occurrenceIds,
          cmd.reason,
          at,
        );
        revisions.push({
          reportId: report.id,
          before,
          after: report.currentRevision,
        });
        for (const id of p.occurrenceIds) {
          const o = s.occurrences.find((o) => o.id === id)!;
          if (report.id !== o.reportId)
            moves.push({ occurrenceId: id, from: o.reportId, to: report.id });
          o.reportId = report.id;
        }
      }
      s.duplicateActions.push({
        id: newId(),
        kind: "split",
        recordedAt: at,
        reason: cmd.reason,
        moves,
        revisions,
        suggestionHash: null,
      });
      message =
        "Split retained all original sources and made affected screening historical.";
      break;
    }
    case "duplicates.decline": {
      ids(cmd.reportIds, 1000, "reportIds");
      studyText(cmd.reason, 2000, "reason");
      const previous = s.duplicateActions.find(
        (a) => a.kind === "decline" && a.suggestionHash === cmd.suggestionHash,
      );
      if (previous) {
        noOp = true;
        break;
      }
      const suggestion = duplicateSuggestions(s).find(
        (x) =>
          x.hash === cmd.suggestionHash &&
          canonicalStudyJson(x.reportIds) ===
            canonicalStudyJson([...cmd.reportIds].sort()),
      );
      if (!suggestion)
        studyFail(
          "suggestion_changed",
          "This duplicate suggestion changed. Inspect the current candidates.",
        );
      s.duplicateActions.push({
        id: newId(),
        kind: "decline",
        recordedAt: at,
        reason: cmd.reason,
        moves: [],
        revisions: cmd.reportIds.map((id) => ({
          reportId: id,
          before: currentReport(s, id).currentRevision,
          after: currentReport(s, id).currentRevision,
        })),
        suggestionHash: cmd.suggestionHash,
      });
      message = "Duplicate suggestion declined as a self-recorded decision.";
      break;
    }
    case "decision.record": {
      bindingCheck(s, cmd, true);
      const v = studyReportView(s, cmd.reportId);
      choice(cmd.stage, ["title-abstract", "full-report"], "stage");
      choice(cmd.lane, ["A", "B"], "lane");
      if (
        cmd.stage === "full-report" &&
        (!v.eligibility.canFullDecide || cmd.retrievalId !== v.retrieval?.id)
      )
        studyFail(
          "retrieval",
          "Use the exact current obtained retrieval before full screening.",
        );
      if (cmd.stage === "title-abstract" && cmd.retrievalId !== null)
        studyFail("stage", "Title screening has no retrieval.");
      const prior = latest(
        s.decisions.filter(
          (d) =>
            sameBinding(d, cmd) &&
            d.stage === cmd.stage &&
            d.lane === cmd.lane &&
            (cmd.stage === "title-abstract" ||
              d.retrievalId === cmd.retrievalId),
        ),
      );
      if (cmd.supersedesId !== (prior?.id ?? null))
        studyFail(
          "supersession",
          "The lane decision changed. Reload before recording it.",
        );
      const { kind, ...data } = cmd;
      s.decisions.push({ ...data, id: newId(), recordedAt: at });
      message =
        "Labeled screening decision recorded locally; reviewer identity is not verified.";
      break;
    }
    case "resolution.record": {
      bindingCheck(s, cmd, true);
      const v = studyReportView(s, cmd.reportId),
        stage = cmd.stage === "title-abstract" ? v.title : v.full;
      if (
        stage.state !== "conflict" ||
        stage.decisionA?.id !== cmd.decisionA ||
        stage.decisionB?.id !== cmd.decisionB
      )
        studyFail(
          "resolution_changed",
          "Resolve the exact current disagreeing completed pair.",
        );
      const { kind, ...data } = cmd;
      s.resolutions.push({ ...data, id: newId(), recordedAt: at });
      message =
        "Self-recorded resolution retained with both original decisions.";
      break;
    }
    case "retrieval.record": {
      bindingCheck(s, cmd, true);
      const v = studyReportView(s, cmd.reportId);
      if (
        !v.eligibility.canRetrieve ||
        cmd.titleBasisHash !== v.title.basisHash
      )
        studyFail(
          "title_basis",
          "Title advancement changed. Read its current decision basis.",
        );
      if (cmd.supersedesId !== (v.retrieval?.id ?? null))
        studyFail("supersession", "Retrieval status changed. Reload it.");
      const { kind, ...data } = cmd;
      s.retrievals.push({ ...data, id: newId(), recordedAt: at });
      message =
        "Full-report retrieval state recorded; not retrieved is not an excluded or zero-effect study.";
      break;
    }
    case "extraction.record": {
      bindingCheck(s, cmd, true);
      const v = studyReportView(s, cmd.reportId);
      if (
        !v.eligibility.canExtract ||
        cmd.inclusionHash !== v.full.inclusionHash
      )
        studyFail(
          "inclusion_basis",
          "Use the current final inclusion before extraction.",
        );
      if (cmd.supersedesId !== (v.extraction?.id ?? null))
        studyFail(
          "supersession",
          "Extraction changed. Read its current version.",
        );
      s.extractions.push({
        protocolId: cmd.protocolId,
        protocolHash: cmd.protocolHash,
        reportId: cmd.reportId,
        reportRevision: cmd.reportRevision,
        id: newId(),
        inclusionHash: cmd.inclusionHash,
        supersedesId: cmd.supersedesId,
        recordedAt: at,
        ...validateExtractionValues(cmd.values),
      });
      message =
        "Reported extraction inputs kept without pooling or evidence certification.";
      break;
    }
    case "packet.record": {
      const p = selectedProtocol(s),
        inputHash = await studyInputHash(s);
      if (
        s.packets.some(
          (x) => x.protocolId === p.id && x.inputHash === inputHash,
        )
      ) {
        noOp = true;
        message =
          "The current packet descriptor already exists; use its complete download.";
        break;
      }
      s.packets.push({
        id: newId(),
        recordedAt: at,
        inputHash,
        protocolId: p.id,
        protocolHash: p.hash,
        counts: studyCounts(s),
      });
      message =
        "Compact packet descriptor recorded. Keep the complete downloaded JSON to retain this exact research state.";
      break;
    }
  }
  if (noOp) {
    const commandHash = await hashStudyValue(
      { expected, command: JSON.parse(commandJson), at, generated },
      context.digest,
    );
    if (
      canonicalStudyJson(state) !== sourceJson ||
      canonicalStudyJson(commandSnapshot(command)) !== commandJson
    )
      studyFail("input_changed", "Input changed during preparation.");
    return deepFreeze({
      format: "charitology-study-mutation",
      version: 1,
      expectedStateHash: expected,
      expectedRevision: valid.revision,
      nextStateHash: expected,
      nextState: valid,
      commandHash,
      noOp: true,
      summary: {
        kind: cmd.kind,
        message,
        counts: valid.selectedProtocolId ? studyCounts(valid) : null,
      },
    });
  }
  relevantDraft(s, cmd);
  s.revision++;
  s.updatedAt = at;
  const nextState = await validateStudyState(s),
    nextStateHash = await studyStateHash(nextState);
  const commandHash = await hashStudyValue(
    { expected, command: JSON.parse(commandJson), at, generated },
    context.digest,
  );
  if (
    canonicalStudyJson(state) !== sourceJson ||
    canonicalStudyJson(commandSnapshot(command)) !== commandJson
  )
    studyFail(
      "input_changed",
      "Input changed while this operation was preparing; inspect the current workspace.",
    );
  return deepFreeze({
    format: "charitology-study-mutation",
    version: 1,
    expectedStateHash: expected,
    expectedRevision: valid.revision,
    nextStateHash,
    nextState,
    commandHash,
    noOp: false,
    summary: {
      kind: cmd.kind,
      message,
      counts: nextState.selectedProtocolId ? studyCounts(nextState) : null,
    },
  });
}
export async function makeStudyBackup(
  state: StudyState,
  exportedAt: Instant,
): Promise<string> {
  instant(exportedAt, "exportedAt");
  const raw = canonicalStudyJson(state),
    valid = await validateStudyState(JSON.parse(raw));
  const checksum = await hashStudyValue({
    format: "charitology-study-register",
    version: 1,
    workspace: valid,
  });
  const text = JSON.stringify(envelope(valid, exportedAt, checksum), null, 2);
  if (enc.encode(text).length > STUDY_LIMITS.backupBytes)
    studyFail("backup_limit", "The complete backup exceeds 2 MiB.");
  if (canonicalStudyJson(state) !== raw)
    studyFail(
      "input_changed",
      "Workspace changed while the backup was being prepared.",
    );
  return text;
}
export async function parseStudyBackup(
  raw: string | Uint8Array,
): Promise<StudyState> {
  const bytes =
    typeof raw === "string"
      ? enc.encode(raw)
      : raw instanceof Uint8Array
        ? raw.slice()
        : studyFail("backup", "Choose a complete JSON backup.");
  if (bytes.length > STUDY_LIMITS.backupBytes)
    studyFail("backup_limit", "Choose a JSON backup no larger than 2 MiB.");
  let value: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    value = JSON.parse(text);
  } catch {
    studyFail("backup_json", "Use valid UTF-8 JSON.");
  }
  exactStudyObject(
    value,
    ["format", "version", "exportedAt", "checksum", "workspace"],
    "backup",
  );
  if (value.format !== "charitology-study-register" || value.version !== 1)
    studyFail(
      "backup_format",
      "Use a version 1 study-register backup; legacy work stays separate.",
    );
  instant(value.exportedAt, "exportedAt");
  checksum(value.checksum, "checksum");
  if (
    value.checksum !==
    (await hashStudyValue({
      format: value.format,
      version: value.version,
      workspace: value.workspace,
    }))
  )
    studyFail("backup_checksum", "The backup checksum does not match.");
  return validateStudyState(value.workspace);
}
function safeCsv(value: unknown): string {
  let s =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? canonicalStudyJson(value)
        : String(value);
  if (
    typeof value !== "number" &&
    (/^[\s\u0000-\u0020]*[=+@-]/u.test(s) || /^[\t\r\n]/.test(s))
  )
    s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
function csv(rows: Record<string, unknown>[], columns: string[]): string {
  return [
    columns.map(safeCsv).join(","),
    ...rows.map((row) => columns.map((key) => safeCsv(row[key])).join(",")),
  ].join("\r\n");
}
const md = (v: unknown) =>
  String(v ?? "Unknown")
    .replace(/[\\`*_{}\[\]<>|]/g, "\\$&")
    .replace(/\r?\n/g, " ");
export function studyCsvExports(
  s: StudyState,
  protocolId?: Id,
): Record<
  "reports" | "occurrences" | "decisions" | "exclusions" | "extractions",
  string
> {
  const p = selectedProtocol(s, protocolId),
    views = s.reports
      .filter((r) => reportRevision(r).occurrenceIds.length)
      .map((r) => studyReportView(s, r.id, p.id));
  const context = { protocolId: p.id, protocolHash: p.hash };
  const reports = views.map((v) => ({
    ...context,
    reportId: v.report.id,
    reportRevision: v.revision.revision,
    ...v.metadata,
    titleStage: v.title.state,
    retrieval: v.retrieval?.state ?? "pending",
    fullStage: v.full.state,
    sourceOccurrences: v.occurrences.length,
  }));
  const occurrences = s.occurrences.map((o) => {
    const b = s.imports.find((b) => b.id === o.batchId)!;
    return {
      ...context,
      occurrenceId: o.id,
      batchId: b.id,
      kind: b.kind,
      sourceHash: b.sourceHash,
      searchRunId: b.searchRunId,
      row: o.row,
      reportId: o.reportId,
      headers: b.headers,
      columnMap: b.columnMap,
      imported: o.imported,
      backlinks: o.backlinks,
      ...Object.fromEntries(
        Array.from({ length: 30 }, (_, i) => [
          "raw_" + String(i + 1).padStart(2, "0"),
          o.rawCells[i] ?? null,
        ]),
      ),
    };
  });
  const decisions = s.decisions.map((d) => ({
    ...d,
    current:
      d.protocolId === p.id &&
      views.some(
        (v) =>
          v.binding &&
          sameBinding(v.binding, d) &&
          (d.stage === "title-abstract"
            ? [v.title.decisionA?.id, v.title.decisionB?.id]
            : [v.full.decisionA?.id, v.full.decisionB?.id]
          ).includes(d.id),
      ),
  }));
  const exclusions = views.flatMap((v) => {
    const stage =
      v.title.state === "exclude"
        ? "title-abstract"
        : v.full.state === "exclude"
          ? "full-report"
          : null;
    if (!stage) return [];
    const result = stage === "title-abstract" ? v.title : v.full;
    return [
      {
        ...context,
        reportId: v.report.id,
        reportRevision: v.revision.revision,
        stage,
        decisionA: result.decisionA?.id,
        decisionB: result.decisionB?.id,
        resolutionId: result.resolution?.id ?? null,
        reasonCode: result.resolution
          ? "resolved-disagreement"
          : result.decisionA?.reasonCode,
        reason: result.resolution?.reason ?? result.decisionA?.reason,
        laneAReason: result.decisionA?.reason,
        laneBReason: result.decisionB?.reason,
      },
    ];
  });
  const extractions = s.extractions.map((e) => ({
    ...e,
    estimateKnown: e.estimate !== null,
    lowerKnown: e.lower !== null,
    upperKnown: e.upper !== null,
    denominatorKnown: e.denominator !== null,
    current:
      e.protocolId === p.id && views.some((v) => v.extraction?.id === e.id),
  }));
  return {
    reports: csv(reports, [
      ...Object.keys(context),
      "reportId",
      "reportRevision",
      ...META_KEYS,
      "titleStage",
      "retrieval",
      "fullStage",
      "sourceOccurrences",
    ]),
    occurrences: csv(occurrences, [
      ...Object.keys(context),
      "occurrenceId",
      "batchId",
      "kind",
      "sourceHash",
      "searchRunId",
      "row",
      "reportId",
      "headers",
      "columnMap",
      "imported",
      "backlinks",
      ...Array.from(
        { length: 30 },
        (_, i) => "raw_" + String(i + 1).padStart(2, "0"),
      ),
    ]),
    decisions: csv(decisions, [...DECISION_KEYS, "current"]),
    exclusions: csv(exclusions, [
      ...Object.keys(context),
      "reportId",
      "reportRevision",
      "stage",
      "decisionA",
      "decisionB",
      "resolutionId",
      "reasonCode",
      "reason",
      "laneAReason",
      "laneBReason",
    ]),
    extractions: csv(extractions, [
      ...EXTRACTION_KEYS,
      "estimateKnown",
      "lowerKnown",
      "upperKnown",
      "denominatorKnown",
      "current",
    ]),
  };
}
export function studyMarkdownMemo(s: StudyState, protocolId?: Id): string {
  const p = selectedProtocol(s, protocolId),
    counts = studyCounts(s, p.id);
  return [
    "# Local study-register memo",
    "",
    "Self-recorded source and screening work. Lane labels are not verified identities; both may be the same person. No search, source truth, independent review, pooled estimate or causal finding is established by this software.",
    "",
    `Protocol: ${md(p.id)} · version ${p.version} · SHA-256 ${p.hash}`,
    `Question: ${md(p.content.question)}`,
    "",
    "## Screening-flow counts",
    "",
    ...Object.entries(counts).map(([key, value]) => `- ${md(key)}: ${value}`),
    "",
    "Counts cover explicitly imported reports, not unique independent studies or sample sizes. Bibliography sources are not executed database searches.",
    "",
    "## Recorded searches",
    "",
    ...(s.searchRuns.length
      ? s.searchRuns.map(
          (r) =>
            `- ${md(r.source)} · performed: ${md(r.performed)} · searched: ${md(r.searchedOn)} · query: ${md(r.query)}`,
        )
      : ["No search runs were recorded."]),
    "",
    "## Included reports",
    "",
    ...s.reports
      .filter((r) => reportRevision(r).occurrenceIds.length)
      .map((r) => studyReportView(s, r.id, p.id))
      .filter((v) => v.full.state === "include")
      .map(
        (v) =>
          `- ${md(v.metadata.title)} · ${md(v.report.id)} revision ${v.revision.revision} · source: ${md(v.metadata.url)} · extraction: ${v.extraction ? "user-entered inputs retained" : "not recorded"}`,
      ),
    "",
    "Keep the complete JSON backup for source rows, versions, disagreements and exact provenance. CSVs are formula-safe views; private/licensed notes require deliberate review before sharing.",
    "",
  ].join("\n");
}
export async function makeStudyPacket(
  s: StudyState,
  packetId: Id,
  exportedAt: Instant,
): Promise<{
  json: string;
  csv: ReturnType<typeof studyCsvExports>;
  markdown: string;
  descriptor: PacketDescriptor;
}> {
  const raw = canonicalStudyJson(s),
    valid = await validateStudyState(JSON.parse(raw));
  const packet = valid.packets.find((p) => p.id === packetId);
  if (
    !packet ||
    packet.inputHash !== (await studyInputHash(valid)) ||
    packet.protocolId !== valid.selectedProtocolId ||
    canonicalStudyJson(packet.counts) !==
      canonicalStudyJson(studyCounts(valid, packet.protocolId))
  )
    studyFail(
      "packet_changed",
      "This descriptor is historical. Use its earlier complete downloaded JSON or record a new current packet.",
    );
  const json = await makeStudyBackup(valid, exportedAt);
  if (canonicalStudyJson(s) !== raw)
    studyFail("input_changed", "Workspace changed during packet export.");
  return {
    json,
    csv: studyCsvExports(valid, packet.protocolId),
    markdown: studyMarkdownMemo(valid, packet.protocolId),
    descriptor: studyClone(packet),
  };
}
