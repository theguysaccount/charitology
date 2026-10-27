/** Origin-local research provenance. No storage, network, execution or review authority. */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { RESEARCH_ARTIFACT_ADAPTERS } from "../../data/research-artifact-adapters";
import { applyProtocolImport } from "./artifact-results-import";
import type {
  ProtocolImportPreview,
  ImportAssignment,
} from "./artifact-results-import";
export type {
  ProtocolImportPreview,
  ImportAssignment,
} from "./artifact-results-import";
export type Id = string; //1..100 ASCII letters/digits/_/-, globally unique top-level state entity IDs
export type Hash = string; //64 lowercase SHA256 hex
export type Instant = string; //canonical actual UTC YYYY-MM-DDTHH:mm:ss.sssZ
export type Day = string; //real YYYY-MM-DD,1900..2200
export type Program = "methods-lab" | "replication-program";
export type Kind = "method-comparison" | "replication";
export type ResultsKnown = "unknown" | "not-known" | "partly-known" | "known";
export interface SourceRef {
  url: string;
  locator: string | null;
} //URL≤1200,locator≤500; HTTPS,no fetch
export interface RegistrationRef {
  url: string;
  reference: string;
  declaredOn: Day | null;
}
export interface AdapterField {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "url" | "select";
  required: boolean;
  group: string | null;
  hint: string | null;
  maxLength: number;
  options: { value: string; label: string }[];
  min: number | null;
  max: number | null;
  step: string | null;
}
export interface Adapter {
  id: "methods-research-v1" | "replication-research-v1";
  version: 1;
  program: Program;
  kind: Kind;
  legacyFreeze: boolean;
  fields: AdapterField[];
  hash: Hash;
}
export interface LegacyRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  values: Record<string, string>;
}
export interface LegacyExport {
  version: 1;
  program: Program;
  records: LegacyRecord[];
  draft: Record<string, string>;
  editing: string | null; //same bounded legacy-ID domain
}
export interface Origin {
  program: Program;
  recordId: string;
  adapterId: string;
  adapterHash: Hash;
  createdAt: string;
  updatedAt: string; //unchanged original source timestamp text
  createdAtUtc: Instant;
  updatedAtUtc: Instant;
  snapshotHash: Hash;
  identityHash: Hash; //definitions below
  sourceFileHash: Hash; //actual chosen bytes, provenance only
}
export interface ProtocolContent {
  adapterId: string;
  adapterHash: Hash;
  values: Record<string, string>;
  resultsKnown: ResultsKnown;
  registration: RegistrationRef | null;
}
export interface Project {
  id: Id;
  program: Program;
  kind: Kind;
  title: string;
  currentProtocolId: Id;
}
export interface Protocol {
  id: Id;
  projectId: Id;
  version: number;
  previousId: Id | null;
  recordedAt: Instant;
  content: ProtocolContent;
  contentHash: Hash;
  origin: Origin | null;
  amendmentReason: string;
  hash: Hash;
}
export type Checksum =
  | { kind: "local-bytes"; sha256: Hash; byteLength: number; hashedAt: Instant }
  | { kind: "declared"; sha256: Hash }
  | null;
export interface Artifact {
  id: Id;
  role:
    | "protocol"
    | "data"
    | "code"
    | "environment"
    | "analysis"
    | "output"
    | "report";
  title: string;
  fileName: string | null;
  url: string | null;
  access: "public" | "restricted" | "not-shared" | "unknown";
  license: string | null;
  note: string | null;
  checksum: Checksum;
}
export interface ManifestContent {
  artifacts: Artifact[];
  environment: string;
  runInstructions: string;
  deviations: string;
}
export interface Manifest {
  id: Id;
  projectId: Id;
  protocolId: Id;
  protocolHash: Hash;
  version: number;
  previousId: Id | null;
  recordedAt: Instant;
  content: ManifestContent;
  hash: Hash;
}
export interface Estimate {
  estimate: number | null;
  lower: number | null;
  upper: number | null;
  intervalLevel: number | null;
  unit: string | null;
  measure: string | null;
  population: string | null;
  timeHorizon: string | null;
  denominator: number | null;
  source: SourceRef | null;
}
export type ResultKind =
  "observed" | "reported-null" | "inconclusive" | "stopped" | "not-observed";
export interface ResultContent {
  kind: ResultKind;
  observedOn: Day | null;
  summary: string;
  original: Estimate | null;
  reported: Estimate | null;
  deviations: string;
  limitations: string;
  sourceReferences: SourceRef[];
  conflicts: {
    state: "unknown" | "declared-none" | "declared";
    note: string | null;
  };
}
export interface Result {
  id: Id;
  projectId: Id;
  protocolId: Id;
  protocolHash: Hash;
  manifestId: Id;
  manifestHash: Hash;
  supersedesId: Id | null;
  recordedAt: Instant;
  content: ResultContent;
  hash: Hash;
}
export interface ComparisonContent {
  compatible: boolean;
  compatibilityReason: string;
  showDifference: boolean;
  interpretation: string;
  limitations: string;
  nextCheck: string;
}
export interface Comparison {
  id: Id;
  resultId: Id;
  resultHash: Hash;
  supersedesId: Id | null;
  recordedAt: Instant;
  content: ComparisonContent;
  hash: Hash;
}
export interface Packet {
  id: Id;
  recordedAt: Instant;
  projectIds: Id[];
  inputHash: Hash;
}
export type Tab =
  | "projects"
  | "import"
  | "protocol"
  | "artifacts"
  | "results"
  | "compare"
  | "exports";
export type FormKind =
  "protocol" | "manifest" | "result" | "comparison" | "import";
export interface Draft {
  tab: Tab;
  selectedProjectId: Id | null;
  form: null | {
    kind: FormKind;
    targetId: Id | null;
    fields: Record<string, string>;
  };
  dirty: boolean;
}
export interface ArtifactState {
  version: 1;
  id: Id;
  revision: number;
  updatedAt: Instant;
  adapters: Adapter[];
  projects: Project[];
  protocols: Protocol[];
  manifests: Manifest[];
  results: Result[];
  comparisons: Comparison[];
  packets: Packet[];
  draft: Draft;
}
export interface ArtifactIssue {
  path: string;
  code: string;
  message: string;
}
export class ArtifactError extends Error {
  constructor(
    public code: string,
    message: string,
    public issues: ArtifactIssue[] = [{ path: "", code, message }],
  ) {
    super(message);
    this.name = "ArtifactError";
  }
}
export interface ArtifactContext {
  expectedStateHash: Hash;
  at: Instant;
  makeId: () => Id;
  digest?: (bytes: Uint8Array) => Promise<Hash>;
}
export interface PreparedArtifactMutation {
  format: "charitology-artifact-mutation";
  version: 1;
  expectedStateHash: Hash;
  expectedRevision: number;
  nextStateHash: Hash;
  nextState: ArtifactState;
  commandHash: Hash;
  noOp: boolean;
  summary: { kind: ArtifactCommand["kind"]; message: string };
}
export type ArtifactCommand =
  | {
      kind: "protocol.freeze";
      projectId: Id | null;
      expectedProtocolId: Id | null;
      expectedProtocolHash: Hash | null;
      content: ProtocolContent;
      amendmentReason: string;
    }
  | {
      kind: "protocol.import";
      preview: ProtocolImportPreview;
      assignments: ImportAssignment[];
    }
  | {
      kind: "manifest.freeze";
      projectId: Id;
      protocolId: Id;
      protocolHash: Hash;
      previousId: Id | null;
      content: ManifestContent;
    }
  | {
      kind: "result.record";
      projectId: Id;
      protocolId: Id;
      protocolHash: Hash;
      manifestId: Id;
      manifestHash: Hash;
      supersedesId: Id | null;
      content: ResultContent;
    }
  | {
      kind: "comparison.record";
      resultId: Id;
      resultHash: Hash;
      supersedesId: Id | null;
      content: ComparisonContent;
    }
  | { kind: "packet.record"; projectIds: Id[] }
  | { kind: "draft.replace"; draft: Draft };

export interface ProjectView {
  project: Project;
  currentProtocol: Protocol;
  currentManifest: Manifest | null;
  latestResult: Result | null;
  latestComparison: Comparison | null;
  history: {
    protocols: Protocol[];
    manifests: Manifest[];
    results: Result[];
    comparisons: Comparison[];
  };
  counts: {
    protocols: number;
    manifests: number;
    artifacts: number;
    results: number;
    comparisons: number;
  };
  notices: string[];
}
export const ARTIFACT_LIMITS = Object.freeze({
  projects: 100,
  protocols: 400,
  manifests: 400,
  artifacts: 2000,
  artifactsPerManifest: 10,
  results: 400,
  comparisons: 400,
  packets: 20,
  history: 5000,
  draftBytes: 524288,
  draftFieldChars: 16384,
  legacyBytes: 2097152,
  localFileBytes: 8388608,
  backupBytes: 2097152,
  pageSize: 25,
});
const encoder = new TextEncoder();
const reserved = new Set(["__proto__", "prototype", "constructor"]);
export function artifactFail(code: string, message: string, path = ""): never {
  throw new ArtifactError(code, message, [{ path, code, message }]);
}
export function artifactPlain(v: unknown): v is Record<string, unknown> {
  return (
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}
export function exactArtifactObject(
  v: unknown,
  keys: readonly string[],
  path = "",
): asserts v is Record<string, unknown> {
  if (
    !artifactPlain(v) ||
    Object.keys(v).some((k) => reserved.has(k) || !keys.includes(k)) ||
    keys.some((k) => !Object.hasOwn(v, k))
  )
    artifactFail("shape", "Use exactly the documented fields.", path);
}
export function artifactText(
  v: unknown,
  max: number,
  path: string,
  nullable = false,
): string | null {
  if (v === null && nullable) return null;
  if (
    typeof v !== "string" ||
    !v.trim() ||
    v.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)
  )
    artifactFail(
      "text",
      `Use ${nullable ? "null or " : ""}nonempty text of at most ${max} characters.`,
      path,
    );
  return v as string;
}
export function artifactId(v: unknown, path: string): asserts v is Id {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(v))
    artifactFail("id", "Use a bounded opaque identifier.", path);
}
export function artifactHash(v: unknown, path: string): asserts v is Hash {
  if (typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v))
    artifactFail("hash", "Use a complete SHA-256 hash.", path);
}
function integer(
  v: unknown,
  min: number,
  max: number,
  path: string,
): asserts v is number {
  if (!Number.isSafeInteger(v) || (v as number) < min || (v as number) > max)
    artifactFail("integer", `Use an integer from ${min} to ${max}.`, path);
}
function choice<T extends string>(
  v: unknown,
  values: readonly T[],
  path: string,
): asserts v is T {
  if (!values.includes(v as T))
    artifactFail("choice", "Choose a documented value.", path);
}
export function artifactDay(v: unknown, path: string): asserts v is Day {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    v < "1900-01-01" ||
    v > "2200-12-31" ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    artifactFail(
      "date",
      "Use a real calendar date between 1900 and 2200.",
      path,
    );
}
export function artifactInstant(
  v: unknown,
  path: string,
): asserts v is Instant {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString() !== v
  )
    artifactFail("instant", "Use an exact UTC instant.", path);
  artifactDay(v.slice(0, 10), path);
}
export function legacyArtifactInstant(v: unknown, path: string): Instant {
  if (
    typeof v !== "string" ||
    v.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      v,
    ) ||
    !Number.isFinite(Date.parse(v))
  )
    artifactFail(
      "instant",
      "Legacy timestamp must be a real ISO instant.",
      path,
    );
  artifactDay(v.slice(0, 10), path);
  const result = new Date(v).toISOString();
  artifactInstant(result, path);
  return result;
}
function url(v: unknown, path: string, maxLength = 1200): string {
  artifactText(v, maxLength, path);
  try {
    if (/[\u0000-\u001f\u007f]/.test(v as string)) throw Error();
    const u = new URL(v as string);
    if (u.protocol !== "https:" || !u.hostname || u.username || u.password)
      throw Error();
  } catch {
    artifactFail(
      "url",
      "Use an absolute public HTTPS URL without credentials.",
      path,
    );
  }
  return v as string;
}
function nullableId(v: unknown, path: string) {
  if (v !== null) artifactId(v, path);
}
function array(v: unknown, max: number, path: string): asserts v is unknown[] {
  if (!Array.isArray(v) || v.length > max)
    artifactFail("limit", `Use an array of at most ${max} entries.`, path);
}
export const artifactClone = <T>(v: T): T => structuredClone(v);
export function artifactFreeze<T>(v: T): T {
  if (v && typeof v === "object" && !(v instanceof Uint8Array)) {
    for (const x of Object.values(v)) artifactFreeze(x);
    Object.freeze(v);
  }
  return v;
}
export function canonicalArtifactJson(value: unknown): string {
  const seen = new Set<object>();
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v === "string" || typeof v === "boolean") return v;
    if (typeof v === "number") {
      if (!Number.isFinite(v))
        artifactFail("number", "Numbers must be finite.");
      return v;
    }
    if (typeof v !== "object" || !v)
      artifactFail("json", "Use finite plain JSON only.");
    if (seen.has(v as object))
      artifactFail("json", "Cyclic data is not supported.");
    seen.add(v as object);
    let out: unknown;
    if (Array.isArray(v)) out = v.map(walk);
    else {
      if (!artifactPlain(v))
        artifactFail("json", "Use plain JSON objects only.");
      out = Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => {
            if (reserved.has(k))
              artifactFail("key", "Reserved keys are not allowed.");
            return [k, walk(v[k])];
          }),
      );
    }
    seen.delete(v as object);
    return out;
  };
  return JSON.stringify(walk(value));
}
export function hashArtifactSync(v: unknown): Hash {
  return bytesToHex(sha256(encoder.encode(canonicalArtifactJson(v))));
}
export async function hashArtifactValue(
  v: unknown,
  digest?: ArtifactContext["digest"],
): Promise<Hash> {
  const json = canonicalArtifactJson(v),
    bytes = encoder.encode(json);
  const out = digest
    ? await digest(bytes.slice())
    : bytesToHex(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", bytes.slice().buffer),
        ),
      );
  artifactHash(out, "digest");
  if (canonicalArtifactJson(v) !== json)
    artifactFail("input_changed", "Input changed while hashing.");
  return out;
}
export const artifactStateHash = (s: ArtifactState) => hashArtifactValue(s);
export function adapterForProgram(program: Program): Adapter {
  const a = RESEARCH_ARTIFACT_ADAPTERS.find((x) => x.program === program);
  if (!a) artifactFail("adapter", "Choose a supported research program.");
  return a;
}
export function adapterForId(id: string, hash: string): Adapter {
  const a = RESEARCH_ARTIFACT_ADAPTERS.find(
    (x) => x.id === id && x.hash === hash,
  );
  if (!a) artifactFail("adapter", "This adapter definition is not supported.");
  return a;
}
export function validateArtifactValues(
  value: unknown,
  adapter: Adapter,
  required = true,
): Record<string, string> {
  if (
    !artifactPlain(value) ||
    Object.keys(value).some(
      (k) => reserved.has(k) || !adapter.fields.some((f) => f.key === k),
    )
  )
    artifactFail("values", "Unknown protocol value field.");
  const out: Record<string, string> = {};
  for (const f of adapter.fields) {
    if (required && !Object.hasOwn(value, f.key))
      artifactFail(
        "values",
        "Saved protocol is missing a documented field.",
        f.key,
      );
    const v = Object.hasOwn(value, f.key) ? value[f.key] : "";
    if (
      typeof v !== "string" ||
      v.length > f.maxLength ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)
    )
      artifactFail(
        "field",
        "Protocol fields must remain bounded raw strings.",
        f.key,
      );
    if (required) {
      if (f.required && !v.trim())
        artifactFail(
          "required",
          "Complete the required protocol field.",
          f.key,
        );
      if (v.trim()) {
        if (f.type === "url") url(v, f.key, f.maxLength);
        if (f.type === "date") artifactDay(v, f.key);
        if (f.type === "select" && !f.options.some((o) => o.value === v))
          artifactFail("choice", "Choose an adapter option.", f.key);
        if (f.type === "number") {
          const n = Number(v);
          if (
            !Number.isFinite(n) ||
            (f.min !== null && n < f.min) ||
            (f.max !== null && n > f.max) ||
            (f.step === "1" && !Number.isInteger(n))
          )
            artifactFail(
              "number",
              "Number is outside the protocol range.",
              f.key,
            );
        }
      }
    }
    out[f.key] = v;
  }
  if (required && adapter.program === "methods-lab")
    for (const [lo, hi] of [
      ["costLow", "costHigh"],
      ["probabilityLow", "probabilityHigh"],
      ["unitsLow", "unitsHigh"],
    ])
      if (out[lo].trim() && out[hi].trim() && Number(out[lo]) > Number(out[hi]))
        artifactFail(
          "range",
          "Lower scenario cannot exceed upper scenario.",
          lo,
        );
  return out;
}
export function validateProtocolContent(v: unknown): ProtocolContent {
  exactArtifactObject(
    v,
    ["adapterId", "adapterHash", "values", "resultsKnown", "registration"],
    "protocol.content",
  );
  const a = adapterForId(v.adapterId as string, v.adapterHash as string);
  const values = validateArtifactValues(v.values, a);
  choice(
    v.resultsKnown,
    ["unknown", "not-known", "partly-known", "known"],
    "resultsKnown",
  );
  if (v.registration !== null) {
    exactArtifactObject(
      v.registration,
      ["url", "reference", "declaredOn"],
      "registration",
    );
    url(v.registration.url, "registration.url");
    artifactText(v.registration.reference, 2000, "registration.reference");
    if (v.registration.declaredOn !== null)
      artifactDay(v.registration.declaredOn, "registration.declaredOn");
  }
  return {
    adapterId: a.id,
    adapterHash: a.hash,
    values,
    resultsKnown: v.resultsKnown,
    registration: artifactClone(v.registration) as RegistrationRef | null,
  };
}
function sourceRef(v: unknown, path: string): void {
  exactArtifactObject(v, ["url", "locator"], path);
  url(v.url, path + ".url");
  artifactText(v.locator, 500, path + ".locator", true);
}
function bool(v: unknown, path: string): asserts v is boolean {
  if (typeof v !== "boolean")
    artifactFail("boolean", "Use an explicit boolean.", path);
}
function finite(v: unknown, path: string) {
  if (v !== null && (typeof v !== "number" || !Number.isFinite(v)))
    artifactFail("number", "Use a finite number or null.", path);
}

function validateManifestContent(v: unknown): ManifestContent {
  exactArtifactObject(
    v,
    ["artifacts", "environment", "runInstructions", "deviations"],
    "manifest.content",
  );
  array(v.artifacts, ARTIFACT_LIMITS.artifactsPerManifest, "artifacts");
  if (!v.artifacts.length)
    artifactFail("artifacts", "Describe at least one artifact.");
  const ids = new Set<string>();
  for (const a of v.artifacts) {
    exactArtifactObject(
      a,
      [
        "id",
        "role",
        "title",
        "fileName",
        "url",
        "access",
        "license",
        "note",
        "checksum",
      ],
      "artifact",
    );
    artifactId(a.id, "artifact.id");
    if (ids.has(a.id))
      artifactFail(
        "duplicate_id",
        "Artifact IDs must be unique within the manifest.",
      );
    ids.add(a.id);
    choice(
      a.role,
      [
        "protocol",
        "data",
        "code",
        "environment",
        "analysis",
        "output",
        "report",
      ],
      "artifact.role",
    );
    artifactText(a.title, 500, "artifact.title");
    artifactText(a.fileName, 200, "artifact.fileName", true);
    if (a.fileName !== null && /[\\/]/.test(a.fileName as string))
      artifactFail("filename", "Use a file basename, not a path.");
    if (a.url !== null) url(a.url, "artifact.url");
    choice(
      a.access,
      ["public", "restricted", "not-shared", "unknown"],
      "artifact.access",
    );
    artifactText(a.license, 200, "artifact.license", true);
    artifactText(a.note, 2000, "artifact.note", true);
    if (a.checksum !== null) {
      if (!artifactPlain(a.checksum))
        artifactFail("checksum", "Choose a documented checksum descriptor.");
      if (a.checksum.kind === "local-bytes") {
        exactArtifactObject(
          a.checksum,
          ["kind", "sha256", "byteLength", "hashedAt"],
          "checksum",
        );
        integer(
          a.checksum.byteLength,
          0,
          ARTIFACT_LIMITS.localFileBytes,
          "checksum.byteLength",
        );
        artifactInstant(a.checksum.hashedAt, "checksum.hashedAt");
      } else {
        exactArtifactObject(a.checksum, ["kind", "sha256"], "checksum");
        choice(a.checksum.kind, ["declared"], "checksum.kind");
      }
      artifactHash(a.checksum.sha256, "checksum.sha256");
    }
  }
  for (const key of ["environment", "runInstructions", "deviations"])
    artifactText(v[key], 2000, "manifest." + key);
  return artifactClone(v) as unknown as ManifestContent;
}
const ESTIMATE_KEYS = [
  "estimate",
  "lower",
  "upper",
  "intervalLevel",
  "unit",
  "measure",
  "population",
  "timeHorizon",
  "denominator",
  "source",
];
function validateEstimate(v: unknown, path: string): void {
  exactArtifactObject(v, ESTIMATE_KEYS, path);
  for (const k of [
    "estimate",
    "lower",
    "upper",
    "intervalLevel",
    "denominator",
  ])
    finite(v[k], path + "." + k);
  if (v.denominator !== null)
    integer(v.denominator, 0, Number.MAX_SAFE_INTEGER, path + ".denominator");
  if (
    v.intervalLevel !== null &&
    ((v.intervalLevel as number) <= 0 || (v.intervalLevel as number) >= 1)
  )
    artifactFail("interval", "Interval level must be between zero and one.");
  if (
    v.lower !== null &&
    v.upper !== null &&
    (v.lower as number) > (v.upper as number)
  )
    artifactFail("interval", "Lower bound cannot exceed upper bound.");
  if (
    v.estimate !== null &&
    ((v.lower !== null && (v.estimate as number) < (v.lower as number)) ||
      (v.upper !== null && (v.estimate as number) > (v.upper as number)))
  )
    artifactFail("interval", "Estimate must lie within known bounds.");
  for (const k of ["unit", "measure", "population", "timeHorizon"])
    artifactText(v[k], 500, path + "." + k, true);
  if (v.source !== null) sourceRef(v.source, path + ".source");
}
function validateResultContent(v: unknown): ResultContent {
  exactArtifactObject(
    v,
    [
      "kind",
      "observedOn",
      "summary",
      "original",
      "reported",
      "deviations",
      "limitations",
      "sourceReferences",
      "conflicts",
    ],
    "result.content",
  );
  choice(
    v.kind,
    ["observed", "reported-null", "inconclusive", "stopped", "not-observed"],
    "result.kind",
  );
  if (v.observedOn !== null) artifactDay(v.observedOn, "observedOn");
  for (const k of ["summary", "deviations", "limitations"])
    artifactText(v[k], 2000, "result." + k);
  if (v.original !== null) validateEstimate(v.original, "original");
  if (v.reported !== null) validateEstimate(v.reported, "reported");
  array(v.sourceReferences, 4, "result.sourceReferences");
  v.sourceReferences.forEach((x) => sourceRef(x, "result.sourceReferences"));
  if (
    ["observed", "reported-null"].includes(v.kind) &&
    !v.sourceReferences.length &&
    !(v.reported as Estimate | null)?.source
  )
    artifactFail(
      "result_source",
      "A later-result source is required; the original source alone does not qualify.",
    );
  if (
    v.kind === "not-observed" &&
    v.reported !== null &&
    ["estimate", "lower", "upper", "denominator"].some(
      (k) => (v.reported as Record<string, unknown>)[k] !== null,
    )
  )
    artifactFail(
      "not_observed",
      "Not-observed cannot contain a reported numerical result.",
    );
  exactArtifactObject(v.conflicts, ["state", "note"], "conflicts");
  choice(
    v.conflicts.state,
    ["unknown", "declared-none", "declared"],
    "conflicts.state",
  );
  artifactText(v.conflicts.note, 2000, "conflicts.note", true);
  if (v.conflicts.state === "declared" && v.conflicts.note === null)
    artifactFail("conflicts", "Describe the declared conflict.");
  return artifactClone(v) as unknown as ResultContent;
}
function validateComparisonContent(v: unknown): ComparisonContent {
  exactArtifactObject(
    v,
    [
      "compatible",
      "compatibilityReason",
      "showDifference",
      "interpretation",
      "limitations",
      "nextCheck",
    ],
    "comparison.content",
  );
  bool(v.compatible, "compatible");
  bool(v.showDifference, "showDifference");
  for (const k of [
    "compatibilityReason",
    "interpretation",
    "limitations",
    "nextCheck",
  ])
    artifactText(v[k], 2000, "comparison." + k);
  return artifactClone(v) as unknown as ComparisonContent;
}
export function artifactDifference(
  result: Result,
  comparison: ComparisonContent,
): { value: number | null; reasons: string[] } {
  const a = result.content.original,
    b = result.content.reported,
    reasons: string[] = [];
  if (!comparison.showDifference)
    reasons.push("Descriptive difference was not requested.");
  if (!comparison.compatible || !comparison.compatibilityReason.trim())
    reasons.push(
      "An explicit compatibility assertion and reason are required.",
    );
  if (
    a?.estimate === null ||
    a?.estimate === undefined ||
    b?.estimate === null ||
    b?.estimate === undefined
  )
    reasons.push("Both reported estimates must be known.");
  for (const k of ["unit", "measure", "population", "timeHorizon"] as const)
    if (!a?.[k]?.trim() || !b?.[k]?.trim() || a[k]!.trim() !== b[k]!.trim())
      reasons.push(`Matching known ${k} is required.`);
  const value =
    a?.estimate !== null &&
    a?.estimate !== undefined &&
    b?.estimate !== null &&
    b?.estimate !== undefined
      ? b.estimate - a.estimate
      : null;
  if (value !== null && !Number.isFinite(value))
    reasons.push("The arithmetic difference exceeds finite numerical range.");
  return { value: reasons.length ? null : value, reasons };
}
const allKeys = [
  "protocols",
  "manifests",
  "results",
  "comparisons",
  "packets",
] as const;
function selectedProjects(s: ArtifactState, ids: Id[]): Id[] {
  array(ids, ARTIFACT_LIMITS.projects, "projectIds");
  if (!ids.length) artifactFail("selection", "Choose at least one project.");
  if (new Set(ids).size !== ids.length)
    artifactFail("selection", "Project selection must be unique.");
  for (const id of ids) {
    artifactId(id, "projectId");
    if (!s.projects.some((p) => p.id === id))
      artifactFail("reference", "A selected project is missing.");
  }
  return [...ids].sort();
}
function closure(s: ArtifactState, ids: Id[]) {
  const chosen = selectedProjects(s, ids),
    projects = s.projects
      .filter((p) => chosen.includes(p.id))
      .sort((a, b) => a.id.localeCompare(b.id));
  const protocols = s.protocols.filter((p) => chosen.includes(p.projectId)),
    manifests = s.manifests.filter((m) => chosen.includes(m.projectId)),
    results = s.results.filter((r) => chosen.includes(r.projectId)),
    resultIds = new Set(results.map((r) => r.id));
  return {
    projects,
    adapters: s.adapters
      .filter((a) => protocols.some((p) => p.content.adapterId === a.id))
      .sort((a, b) => a.id.localeCompare(b.id)),
    protocols,
    manifests,
    results,
    comparisons: s.comparisons.filter((c) => resultIds.has(c.resultId)),
  };
}
export const artifactInputHash = (s: ArtifactState, ids: Id[]) =>
  hashArtifactValue(closure(s, ids));
export function artifactProjectView(s: ArtifactState, id: Id): ProjectView {
  const project = s.projects.find((p) => p.id === id);
  if (!project) artifactFail("reference", "This project is missing.");
  const protocols = s.protocols.filter((p) => p.projectId === id),
    manifests = s.manifests.filter((p) => p.projectId === id),
    results = s.results.filter((p) => p.projectId === id),
    ids = new Set(results.map((p) => p.id)),
    comparisons = s.comparisons.filter((c) => ids.has(c.resultId));
  const currentProtocol = protocols.find(
    (p) => p.id === project.currentProtocolId,
  );
  if (!currentProtocol)
    artifactFail("reference", "Current protocol is missing.");
  const currentManifest =
    manifests.filter((p) => p.protocolId === currentProtocol.id).at(-1) ?? null;
  const latestResult =
    results.filter((p) => p.manifestId === currentManifest?.id).at(-1) ?? null;
  const latestComparison =
    comparisons.filter((p) => p.resultId === latestResult?.id).at(-1) ?? null;
  return artifactFreeze(
    artifactClone({
      project,
      currentProtocol,
      currentManifest,
      latestResult,
      latestComparison,
      history: { protocols, manifests, results, comparisons },
      counts: {
        protocols: protocols.length,
        manifests: manifests.length,
        artifacts: manifests.reduce(
          (n, m) => n + m.content.artifacts.length,
          0,
        ),
        results: results.length,
        comparisons: comparisons.length,
      },
      notices: [
        "Records and local-byte checksums are self-recorded, not independent verification.",
        ...(protocols.length > 1
          ? ["Earlier protocol versions and their outputs remain historical."]
          : []),
      ],
    }),
  );
}
export function blankArtifactState(id: Id, at: Instant): ArtifactState {
  artifactId(id, "id");
  artifactInstant(at, "at");
  return artifactFreeze({
    version: 1,
    id,
    revision: 0,
    updatedAt: at,
    adapters: [],
    projects: [],
    protocols: [],
    manifests: [],
    results: [],
    comparisons: [],
    packets: [],
    draft: {
      tab: "projects",
      selectedProjectId: null,
      form: null,
      dirty: false,
    },
  });
}
function validateDraft(v: unknown, s: ArtifactState): Draft {
  exactArtifactObject(
    v,
    ["tab", "selectedProjectId", "form", "dirty"],
    "draft",
  );
  choice(
    v.tab,
    [
      "projects",
      "import",
      "protocol",
      "artifacts",
      "results",
      "compare",
      "exports",
    ],
    "draft.tab",
  );
  bool(v.dirty, "draft.dirty");
  nullableId(v.selectedProjectId, "draft.selectedProjectId");
  if (
    v.selectedProjectId !== null &&
    !s.projects.some((p) => p.id === v.selectedProjectId)
  )
    artifactFail("reference", "Draft project is missing.");
  if (v.form !== null) {
    exactArtifactObject(v.form, ["kind", "targetId", "fields"], "draft.form");
    choice(
      v.form.kind,
      ["protocol", "manifest", "result", "comparison", "import"],
      "draft.form.kind",
    );
    nullableId(v.form.targetId, "draft.form.targetId");
    if (!artifactPlain(v.form.fields) || Object.keys(v.form.fields).length > 40)
      artifactFail("draft", "Use at most forty raw fields.");
    const maps: Record<FormKind, string[]> = {
      protocol: [
        "adapterId",
        "adapterHash",
        "projectId",
        "expectedProtocolId",
        "expectedProtocolHash",
        "resultsKnown",
        "registration",
        "amendmentReason",
        ...RESEARCH_ARTIFACT_ADAPTERS.flatMap((a) =>
          a.fields.map((f) => f.key),
        ),
      ],
      manifest: [
        "projectId",
        "protocolId",
        "protocolHash",
        "previousId",
        "environment",
        "runInstructions",
        "deviations",
        ...Array.from({ length: 10 }, (_, i) => "artifact" + i),
      ],
      result: [
        "projectId",
        "protocolId",
        "protocolHash",
        "manifestId",
        "manifestHash",
        "supersedesId",
        "kind",
        "observedOn",
        "summary",
        "original",
        "reported",
        "deviations",
        "limitations",
        "sourceReferences",
        "conflicts",
      ],
      comparison: [
        "resultId",
        "resultHash",
        "supersedesId",
        "compatible",
        "compatibilityReason",
        "showDifference",
        "interpretation",
        "limitations",
        "nextCheck",
      ],
      import: [
        "program",
        "sourceFileHash",
        "selectedRecordIds",
        ...Array.from({ length: 20 }, (_, i) => "assignment" + i),
      ],
    };
    if (v.form.kind === "protocol") {
      const fields = v.form.fields;
      const selectedAdapter = RESEARCH_ARTIFACT_ADAPTERS.find(
        (a) => a.id === fields.adapterId && a.hash === fields.adapterHash,
      );
      if (selectedAdapter)
        maps.protocol = [
          "adapterId",
          "adapterHash",
          "projectId",
          "expectedProtocolId",
          "expectedProtocolHash",
          "resultsKnown",
          "registration",
          "amendmentReason",
          ...selectedAdapter.fields.map((f) => f.key),
        ];
    }
    for (const [k, x] of Object.entries(v.form.fields))
      if (
        reserved.has(k) ||
        k.length > 80 ||
        !maps[v.form.kind].includes(k) ||
        typeof x !== "string" ||
        x.length > ARTIFACT_LIMITS.draftFieldChars
      )
        artifactFail("draft", "Raw draft field is invalid.", k);
  }
  if (
    encoder.encode(canonicalArtifactJson(v)).byteLength >
    ARTIFACT_LIMITS.draftBytes
  )
    artifactFail(
      "draft_limit",
      "Raw draft exceeds 512 KiB; download raw form recovery text.",
    );
  return artifactClone(v) as unknown as Draft;
}
function stripHash<T extends { hash: string }>(entry: T) {
  const { hash, ...value } = entry;
  return value;
}
function checkEntryHash(v: { hash: Hash }) {
  artifactHash(v.hash, "hash");
  if (v.hash !== hashArtifactSync(stripHash(v)))
    artifactFail(
      "entry_hash",
      "Retained entry checksum does not match its content.",
    );
}
function stateSize(s: ArtifactState) {
  if (artifactBackupBytes(s) > ARTIFACT_LIMITS.backupBytes)
    artifactFail(
      "backup_limit",
      "Complete workspace backup exceeds 2 MiB. Keep a separate raw-form recovery copy.",
    );
}
function originCheck(
  origin: Origin,
  content: ProtocolContent,
  program: Program,
) {
  exactArtifactObject(
    origin,
    [
      "program",
      "recordId",
      "adapterId",
      "adapterHash",
      "createdAt",
      "updatedAt",
      "createdAtUtc",
      "updatedAtUtc",
      "snapshotHash",
      "identityHash",
      "sourceFileHash",
    ],
    "origin",
  );
  if (
    origin.program !== program ||
    origin.adapterId !== content.adapterId ||
    origin.adapterHash !== content.adapterHash
  )
    artifactFail("origin", "Source adapter does not match protocol.");
  if (content.resultsKnown !== "unknown" || content.registration !== null)
    artifactFail(
      "origin",
      "Imported source snapshots keep unknown results knowledge and no registration; enrich them through a new manual amendment.",
    );
  artifactText(origin.recordId, 100, "origin.recordId");
  if (/[\u0000-\u001f\u007f]/.test(origin.recordId))
    artifactFail("origin", "Legacy identity has control characters.");
  if (
    legacyArtifactInstant(origin.createdAt, "origin.createdAt") !==
      origin.createdAtUtc ||
    legacyArtifactInstant(origin.updatedAt, "origin.updatedAt") !==
      origin.updatedAtUtc
  )
    artifactFail("origin", "Legacy timestamp representations disagree.");
  for (const key of ["snapshotHash", "identityHash", "sourceFileHash"] as const)
    artifactHash(origin[key], key);
  if (
    origin.snapshotHash !==
      hashArtifactSync({
        program,
        adapterHash: content.adapterHash,
        values: content.values,
      }) ||
    origin.identityHash !==
      hashArtifactSync({
        program,
        recordId: origin.recordId,
        snapshotHash: origin.snapshotHash,
      })
  )
    artifactFail(
      "origin",
      "Source identity does not match exact original values/schema.",
    );
}
export async function validateArtifactState(
  value: unknown,
): Promise<ArtifactState> {
  const original = canonicalArtifactJson(value);
  const s = JSON.parse(original) as ArtifactState;
  exactArtifactObject(
    s,
    [
      "version",
      "id",
      "revision",
      "updatedAt",
      "adapters",
      "projects",
      "protocols",
      "manifests",
      "results",
      "comparisons",
      "packets",
      "draft",
    ],
    "state",
  );
  if (s.version !== 1)
    artifactFail("version", "Unsupported artifact register version.");
  artifactId(s.id, "id");
  integer(s.revision, 0, Number.MAX_SAFE_INTEGER, "revision");
  artifactInstant(s.updatedAt, "updatedAt");
  array(s.adapters, 2, "adapters");
  for (const key of ["projects", ...allKeys] as const)
    array(s[key], ARTIFACT_LIMITS[key], key);
  if (allKeys.reduce((n, k) => n + s[k].length, 0) > ARTIFACT_LIMITS.history)
    artifactFail("history_limit", "Retained history exceeds 5,000 entries.");
  const globalIds = new Set([s.id]);
  for (const key of ["projects", ...allKeys] as const)
    for (const row of s[key]) {
      if (!artifactPlain(row))
        artifactFail("shape", "A retained record is not an object.");
      artifactId(row.id, key + ".id");
      if (globalIds.has(row.id))
        artifactFail("duplicate_id", "Retained IDs must be unique.");
      globalIds.add(row.id);
    }
  const adapterIds = new Set<string>();
  for (const a of s.adapters) {
    const known = adapterForId(a.id, a.hash);
    if (
      adapterIds.has(a.id) ||
      canonicalArtifactJson(a) !== canonicalArtifactJson(known) ||
      hashArtifactSync(stripHash(a)) !== a.hash
    )
      artifactFail("adapter", "Adapter definition has changed.");
    adapterIds.add(a.id);
  }
  const projectMap = new Map<Id, Project>();
  for (const p of s.projects) {
    exactArtifactObject(
      p,
      ["id", "program", "kind", "title", "currentProtocolId"],
      "project",
    );
    choice(
      p.program,
      ["methods-lab", "replication-program"],
      "project.program",
    );
    choice(p.kind, ["method-comparison", "replication"], "project.kind");
    artifactText(p.title, 8000, "project.title");
    artifactId(p.currentProtocolId, "project.currentProtocolId");
    if (adapterForProgram(p.program).kind !== p.kind)
      artifactFail("program", "Project kind does not match program.");
    projectMap.set(p.id, p);
  }
  const lastProtocol = new Map<Id, Protocol>(),
    protocolMap = new Map<Id, Protocol>(),
    origins = new Set<Hash>();
  for (const p of s.protocols) {
    exactArtifactObject(
      p,
      [
        "id",
        "projectId",
        "version",
        "previousId",
        "recordedAt",
        "content",
        "contentHash",
        "origin",
        "amendmentReason",
        "hash",
      ],
      "protocol",
    );
    const project = projectMap.get(p.projectId),
      prev = lastProtocol.get(p.projectId);
    if (!project) artifactFail("reference", "Protocol project is missing.");
    integer(p.version, 1, ARTIFACT_LIMITS.protocols, "protocol.version");
    nullableId(p.previousId, "protocol.previousId");
    artifactInstant(p.recordedAt, "protocol.recordedAt");
    if (
      p.version !== (prev?.version ?? 0) + 1 ||
      p.previousId !== (prev?.id ?? null)
    )
      artifactFail(
        "protocol_chain",
        "Protocol version/predecessor chain is invalid.",
      );
    const content = validateProtocolContent(p.content);
    if (
      !adapterIds.has(content.adapterId) ||
      adapterForId(content.adapterId, content.adapterHash).program !==
        project.program
    )
      artifactFail(
        "adapter",
        "Protocol adapter is missing or belongs to another program.",
      );
    artifactText(p.amendmentReason, 2000, "amendmentReason");
    artifactHash(p.contentHash, "contentHash");
    if (p.contentHash !== hashArtifactSync(p.content))
      artifactFail("content_hash", "Protocol content checksum changed.");
    if (p.origin !== null) {
      originCheck(p.origin, p.content, project.program);
      if (origins.has(p.origin.identityHash))
        artifactFail(
          "duplicate_origin",
          "An imported identity was duplicated.",
        );
      origins.add(p.origin.identityHash);
    }
    checkEntryHash(p);
    lastProtocol.set(p.projectId, p);
    protocolMap.set(p.id, p);
  }
  for (const p of s.projects) {
    const first = s.protocols.find((x) => x.projectId === p.id);
    if (
      !first ||
      lastProtocol.get(p.id)?.id !== p.currentProtocolId ||
      p.title !== first.content.values.title
    )
      artifactFail(
        "project_chain",
        "Project must identify its latest protocol and original title.",
      );
  }
  const manifestMap = new Map<Id, Manifest>(),
    lastManifest = new Map<Id, Manifest>();
  let artifacts = 0;
  for (const m of s.manifests) {
    exactArtifactObject(
      m,
      [
        "id",
        "projectId",
        "protocolId",
        "protocolHash",
        "version",
        "previousId",
        "recordedAt",
        "content",
        "hash",
      ],
      "manifest",
    );
    const p = protocolMap.get(m.protocolId),
      prev = lastManifest.get(m.protocolId);
    if (!p || p.projectId !== m.projectId || p.hash !== m.protocolHash)
      artifactFail("binding", "Manifest protocol binding changed.");
    integer(m.version, 1, ARTIFACT_LIMITS.manifests, "manifest.version");
    nullableId(m.previousId, "manifest.previousId");
    if (
      m.version !== (prev?.version ?? 0) + 1 ||
      m.previousId !== (prev?.id ?? null)
    )
      artifactFail(
        "manifest_chain",
        "Manifest predecessor/version is invalid.",
      );
    artifactInstant(m.recordedAt, "manifest.recordedAt");
    validateManifestContent(m.content);
    artifacts += m.content.artifacts.length;
    checkEntryHash(m);
    manifestMap.set(m.id, m);
    lastManifest.set(m.protocolId, m);
  }
  if (artifacts > ARTIFACT_LIMITS.artifacts)
    artifactFail("artifact_limit", "Retained descriptors exceed 2,000.");
  const resultMap = new Map<Id, Result>(),
    lastResult = new Map<Id, Result>();
  for (const r of s.results) {
    exactArtifactObject(
      r,
      [
        "id",
        "projectId",
        "protocolId",
        "protocolHash",
        "manifestId",
        "manifestHash",
        "supersedesId",
        "recordedAt",
        "content",
        "hash",
      ],
      "result",
    );
    const m = manifestMap.get(r.manifestId);
    if (
      !m ||
      m.projectId !== r.projectId ||
      m.protocolId !== r.protocolId ||
      m.protocolHash !== r.protocolHash ||
      m.hash !== r.manifestHash
    )
      artifactFail("binding", "Result manifest/protocol binding changed.");
    nullableId(r.supersedesId, "result.supersedesId");
    if (r.supersedesId !== (lastResult.get(r.manifestId)?.id ?? null))
      artifactFail(
        "result_chain",
        "Result must supersede its exact prior bound result.",
      );
    artifactInstant(r.recordedAt, "result.recordedAt");
    validateResultContent(r.content);
    checkEntryHash(r);
    resultMap.set(r.id, r);
    lastResult.set(r.manifestId, r);
  }
  const lastComparison = new Map<Id, Comparison>();
  for (const c of s.comparisons) {
    exactArtifactObject(
      c,
      [
        "id",
        "resultId",
        "resultHash",
        "supersedesId",
        "recordedAt",
        "content",
        "hash",
      ],
      "comparison",
    );
    const r = resultMap.get(c.resultId);
    if (!r || r.hash !== c.resultHash)
      artifactFail("binding", "Comparison result binding changed.");
    nullableId(c.supersedesId, "comparison.supersedesId");
    if (c.supersedesId !== (lastComparison.get(c.resultId)?.id ?? null))
      artifactFail(
        "comparison_chain",
        "Comparison must supersede its exact prior bound comparison.",
      );
    artifactInstant(c.recordedAt, "comparison.recordedAt");
    validateComparisonContent(c.content);
    if (
      c.content.showDifference &&
      artifactDifference(r, c.content).value === null
    )
      artifactFail(
        "comparison",
        "Requested difference is not supported by compatible known estimates.",
      );
    checkEntryHash(c);
    lastComparison.set(c.resultId, c);
  }
  for (const p of s.packets) {
    exactArtifactObject(
      p,
      ["id", "recordedAt", "projectIds", "inputHash"],
      "packet",
    );
    artifactInstant(p.recordedAt, "packet.recordedAt");
    artifactHash(p.inputHash, "packet.inputHash");
    if (
      canonicalArtifactJson(p.projectIds) !==
      canonicalArtifactJson(selectedProjects(s, p.projectIds))
    )
      artifactFail("selection", "Packet project IDs must be sorted/unique.");
  }
  validateDraft(s.draft, s);
  stateSize(s);
  await hashArtifactValue(s);
  if (canonicalArtifactJson(value) !== original)
    artifactFail("input_changed", "Workspace input changed during validation.");
  return artifactFreeze(s);
}

/** Internal import gateway. The public command supplies expected current bindings. */
export function appendArtifactProtocol(
  s: ArtifactState,
  content: ProtocolContent,
  origin: Origin | null,
  binding: {
    projectId: Id | null;
    expectedProtocolId: Id | null;
    expectedProtocolHash: Hash | null;
    reason: string;
  },
  at: Instant,
  newId: () => Id,
): { noOp: boolean; protocol: Protocol } {
  const a = adapterForId(content.adapterId, content.adapterHash),
    contentHash = hashArtifactSync(content);
  let project: Project | undefined, prev: Protocol | undefined;
  if (binding.projectId !== null) {
    project = s.projects.find((p) => p.id === binding.projectId);
    if (!project) artifactFail("reference", "Amendment project is missing.");
    prev = s.protocols.find((p) => p.id === project!.currentProtocolId);
    if (
      !prev ||
      prev.id !== binding.expectedProtocolId ||
      prev.hash !== binding.expectedProtocolHash ||
      project.program !== a.program
    )
      artifactFail(
        "stale_binding",
        "Review the exact current protocol before amending.",
      );
    if (origin === null && prev.contentHash === contentHash)
      return { noOp: true, protocol: prev };
    artifactText(binding.reason, 2000, "amendmentReason");
  } else if (
    binding.expectedProtocolId !== null ||
    binding.expectedProtocolHash !== null
  )
    artifactFail("binding", "A new project has no prior protocol binding.");
  if (!s.adapters.some((x) => x.id === a.id)) s.adapters.push(artifactClone(a));
  const projectId = project?.id ?? newId(),
    id = newId();
  const row = {
    id,
    projectId,
    version: (prev?.version ?? 0) + 1,
    previousId: prev?.id ?? null,
    recordedAt: at,
    content: artifactClone(content),
    contentHash,
    origin: artifactClone(origin),
    amendmentReason: binding.reason.trim()
      ? binding.reason
      : "Initial local protocol snapshot.",
  };
  const protocol = { ...row, hash: hashArtifactSync(row) };
  s.protocols.push(protocol);
  if (project) project.currentProtocolId = id;
  else
    s.projects.push({
      id: projectId,
      program: a.program,
      kind: a.kind,
      title: content.values.title,
      currentProtocolId: id,
    });
  return { noOp: false, protocol };
}
const COMMAND_KEYS: Record<ArtifactCommand["kind"], string[]> = {
  "protocol.freeze": [
    "projectId",
    "expectedProtocolId",
    "expectedProtocolHash",
    "content",
    "amendmentReason",
  ],
  "protocol.import": ["preview", "assignments"],
  "manifest.freeze": [
    "projectId",
    "protocolId",
    "protocolHash",
    "previousId",
    "content",
  ],
  "result.record": [
    "projectId",
    "protocolId",
    "protocolHash",
    "manifestId",
    "manifestHash",
    "supersedesId",
    "content",
  ],
  "comparison.record": ["resultId", "resultHash", "supersedesId", "content"],
  "packet.record": ["projectIds"],
  "draft.replace": ["draft"],
};
function commandSnapshot(cmd: ArtifactCommand): unknown {
  if (cmd?.kind !== "protocol.import") return cmd;
  const p = cmd.preview;
  if (!p?.input) return cmd;
  const b = p.input.bytes;
  if (!(b instanceof Uint8Array) || b.length > ARTIFACT_LIMITS.legacyBytes)
    artifactFail("legacy_limit", "Choose legacy JSON no larger than 2 MiB.");
  return {
    ...cmd,
    preview: {
      ...p,
      input: {
        ...p.input,
        bytes: { length: b.length, hash: bytesToHex(sha256(b)) },
      },
    },
  };
}
function currentBinding(
  s: ArtifactState,
  projectId: Id,
  protocolId: Id,
  protocolHash: Hash,
): ProjectView {
  const v = artifactProjectView(s, projectId);
  if (
    v.currentProtocol.id !== protocolId ||
    v.currentProtocol.hash !== protocolHash
  )
    artifactFail(
      "stale_binding",
      "The current protocol changed. Open a fresh form.",
    );
  return v;
}
function clearRelevantDraft(s: ArtifactState, cmd: ArtifactCommand) {
  const form = s.draft.form;
  if (!form) return;
  const f = form.fields;
  const same = (key: string, value: string | null) =>
    Object.hasOwn(f, key) && f[key] === (value ?? "");
  const sameJson = (key: string, value: unknown) => {
    if (!Object.hasOwn(f, key)) return false;
    try {
      return (
        canonicalArtifactJson(JSON.parse(f[key])) ===
        canonicalArtifactJson(value)
      );
    } catch {
      return false;
    }
  };
  let relevant = false;
  switch (cmd.kind) {
    case "protocol.freeze":
      relevant =
        form.kind === "protocol" &&
        form.targetId === cmd.projectId &&
        same("projectId", cmd.projectId) &&
        same("expectedProtocolId", cmd.expectedProtocolId) &&
        same("expectedProtocolHash", cmd.expectedProtocolHash) &&
        same("adapterId", cmd.content.adapterId) &&
        same("adapterHash", cmd.content.adapterHash);
      // A new form has no persistent identity. Do not discard a different new
      // project merely because both targets are null.
      if (relevant && cmd.projectId === null)
        relevant =
          Object.entries(cmd.content.values).every(([key, value]) =>
            same(key, value),
          ) &&
          same("resultsKnown", cmd.content.resultsKnown) &&
          sameJson("registration", cmd.content.registration);
      break;
    case "manifest.freeze":
      relevant =
        form.kind === "manifest" &&
        form.targetId === cmd.projectId &&
        same("projectId", cmd.projectId) &&
        same("protocolId", cmd.protocolId) &&
        same("protocolHash", cmd.protocolHash) &&
        same("previousId", cmd.previousId);
      break;
    case "result.record":
      relevant =
        form.kind === "result" &&
        form.targetId === cmd.projectId &&
        same("projectId", cmd.projectId) &&
        same("protocolId", cmd.protocolId) &&
        same("protocolHash", cmd.protocolHash) &&
        same("manifestId", cmd.manifestId) &&
        same("manifestHash", cmd.manifestHash) &&
        same("supersedesId", cmd.supersedesId);
      break;
    case "comparison.record": {
      const projectId = s.results.find((r) => r.id === cmd.resultId)?.projectId;
      relevant =
        form.kind === "comparison" &&
        form.targetId === projectId &&
        same("resultId", cmd.resultId) &&
        same("resultHash", cmd.resultHash) &&
        same("supersedesId", cmd.supersedesId);
      break;
    }
    case "protocol.import":
      relevant =
        form.kind === "import" &&
        form.targetId === null &&
        same("program", cmd.preview.input.program) &&
        same("sourceFileHash", cmd.preview.sourceFileHash) &&
        sameJson("selectedRecordIds", cmd.preview.input.selectedRecordIds) &&
        cmd.assignments.every((a, i) => sameJson("assignment" + i, a));
      break;
  }
  if (relevant) {
    s.draft.form = null;
    s.draft.dirty = false;
  }
}
export async function prepareArtifactCommand(
  state: ArtifactState,
  command: ArtifactCommand,
  context: ArtifactContext,
): Promise<PreparedArtifactMutation> {
  const { expectedStateHash, at, makeId, digest } = context;
  const sourceJson = canonicalArtifactJson(state),
    cmdJson = canonicalArtifactJson(commandSnapshot(command)),
    cmd = artifactClone(command);
  artifactHash(expectedStateHash, "expectedStateHash");
  artifactInstant(at, "at");
  if (typeof makeId !== "function") artifactFail("id", "Supply an ID factory.");
  if (!artifactPlain(cmd) || !Object.hasOwn(COMMAND_KEYS, cmd.kind))
    artifactFail("command", "Choose a documented artifact command.");
  exactArtifactObject(cmd, ["kind", ...COMMAND_KEYS[cmd.kind]], "command");
  if (
    (await hashArtifactValue(JSON.parse(sourceJson), digest)) !==
    expectedStateHash
  )
    artifactFail(
      "stale_state",
      "Workspace changed. Read its latest version before preparing.",
    );
  const valid = await validateArtifactState(JSON.parse(sourceJson)),
    s = artifactClone(valid),
    used = new Set([
      s.id,
      ...s.projects.map((x) => x.id),
      ...allKeys.flatMap((k) => s[k].map((x) => x.id)),
    ]);
  const newId = () => {
    const id = makeId();
    artifactId(id, "generatedId");
    if (used.has(id))
      artifactFail("duplicate_id", "Generated ID already exists.");
    used.add(id);
    return id;
  };
  let noOp = false,
    message = "Self-recorded research work prepared.";
  switch (cmd.kind) {
    case "draft.replace": {
      s.draft = validateDraft(cmd.draft, s);
      noOp =
        canonicalArtifactJson(s.draft) === canonicalArtifactJson(valid.draft);
      message = "Unfinished raw form retained; it is not a research record.";
      break;
    }
    case "protocol.freeze": {
      const content = validateProtocolContent(cmd.content);
      nullableId(cmd.projectId, "projectId");
      nullableId(cmd.expectedProtocolId, "expectedProtocolId");
      if (cmd.expectedProtocolHash !== null)
        artifactHash(cmd.expectedProtocolHash, "expectedProtocolHash");
      if (
        typeof cmd.amendmentReason !== "string" ||
        cmd.amendmentReason.length > 2000
      )
        artifactFail("reason", "Use a bounded amendment reason.");
      noOp = appendArtifactProtocol(
        s,
        content,
        null,
        {
          projectId: cmd.projectId,
          expectedProtocolId: cmd.expectedProtocolId,
          expectedProtocolHash: cmd.expectedProtocolHash,
          reason: cmd.amendmentReason,
        },
        at,
        newId,
      ).noOp;
      message = noOp
        ? "Content matches the current protocol; no version changed."
        : "A new local protocol version was frozen; no independent registration is claimed.";
      break;
    }
    case "protocol.import": {
      const result = await applyProtocolImport(
        s,
        cmd.preview,
        cmd.assignments,
        { expectedStateHash: expectedStateHash, at: at, newId },
      );
      noOp = result.noOp;
      message = result.message;
      break;
    }
    case "manifest.freeze": {
      const view = currentBinding(
        s,
        cmd.projectId,
        cmd.protocolId,
        cmd.protocolHash,
      );
      nullableId(cmd.previousId, "previousId");
      if (cmd.previousId !== (view.currentManifest?.id ?? null))
        artifactFail("stale_manifest", "Manifest predecessor changed.");
      const content = validateManifestContent(cmd.content);
      const row = {
        id: newId(),
        projectId: cmd.projectId,
        protocolId: cmd.protocolId,
        protocolHash: cmd.protocolHash,
        version: (view.currentManifest?.version ?? 0) + 1,
        previousId: cmd.previousId,
        recordedAt: at,
        content,
      };
      s.manifests.push({ ...row, hash: hashArtifactSync(row) });
      message =
        "Artifact metadata frozen. Checksums remain self-recorded provenance.";
      break;
    }
    case "result.record": {
      const view = currentBinding(
        s,
        cmd.projectId,
        cmd.protocolId,
        cmd.protocolHash,
      );
      if (
        view.currentManifest?.id !== cmd.manifestId ||
        view.currentManifest.hash !== cmd.manifestHash
      )
        artifactFail(
          "stale_manifest",
          "Result must bind the exact current manifest.",
        );
      nullableId(cmd.supersedesId, "supersedesId");
      if (cmd.supersedesId !== (view.latestResult?.id ?? null))
        artifactFail("stale_result", "Result predecessor changed.");
      const content = validateResultContent(cmd.content);
      const row = {
        id: newId(),
        projectId: cmd.projectId,
        protocolId: cmd.protocolId,
        protocolHash: cmd.protocolHash,
        manifestId: cmd.manifestId,
        manifestHash: cmd.manifestHash,
        supersedesId: cmd.supersedesId,
        recordedAt: at,
        content,
      };
      s.results.push({ ...row, hash: hashArtifactSync(row) });
      message =
        "A dated self-recorded result was retained with deviations and limitations.";
      break;
    }
    case "comparison.record": {
      const result = s.results.find((r) => r.id === cmd.resultId);
      if (!result || result.hash !== cmd.resultHash)
        artifactFail("binding", "Exact comparison result is missing.");
      const view = artifactProjectView(s, result.projectId);
      if (view.latestResult?.id !== result.id)
        artifactFail(
          "stale_result",
          "Compare the current result; earlier result remains historical.",
        );
      nullableId(cmd.supersedesId, "supersedesId");
      if (cmd.supersedesId !== (view.latestComparison?.id ?? null))
        artifactFail("stale_comparison", "Comparison predecessor changed.");
      const content = validateComparisonContent(cmd.content);
      if (
        content.showDifference &&
        artifactDifference(result, content).value === null
      )
        artifactFail(
          "comparison",
          artifactDifference(result, content).reasons.join(" "),
        );
      const row = {
        id: newId(),
        resultId: cmd.resultId,
        resultHash: cmd.resultHash,
        supersedesId: cmd.supersedesId,
        recordedAt: at,
        content,
      };
      s.comparisons.push({ ...row, hash: hashArtifactSync(row) });
      message =
        "Descriptive comparison saved; no causal or replication verdict was inferred.";
      break;
    }
    case "packet.record": {
      const ids = selectedProjects(s, cmd.projectIds),
        inputHash = await artifactInputHash(s, ids);
      const last = s.packets.at(-1);
      if (
        last?.inputHash === inputHash &&
        canonicalArtifactJson(last.projectIds) === canonicalArtifactJson(ids)
      )
        noOp = true;
      else
        s.packets.push({
          id: newId(),
          recordedAt: at,
          projectIds: ids,
          inputHash,
        });
      message =
        "Selected-closure packet descriptor saved. Packet JSON contains the whole private workspace.";
      break;
    }
  }
  let next: ArtifactState;
  if (noOp) next = valid;
  else {
    if (cmd.kind !== "draft.replace") clearRelevantDraft(s, cmd);
    s.revision++;
    s.updatedAt = at;
    next = await validateArtifactState(s);
  }
  const nextStateHash = await hashArtifactValue(next, digest),
    commandHash = await hashArtifactValue(JSON.parse(cmdJson), digest);
  if (
    canonicalArtifactJson(state) !== sourceJson ||
    canonicalArtifactJson(commandSnapshot(command)) !== cmdJson
  )
    artifactFail(
      "input_changed",
      "State or command changed while checking; nothing was applied.",
    );
  return artifactFreeze({
    format: "charitology-artifact-mutation",
    version: 1,
    expectedStateHash: expectedStateHash,
    expectedRevision: valid.revision,
    nextStateHash,
    nextState: next,
    commandHash,
    noOp,
    summary: { kind: cmd.kind, message },
  });
}
const BACKUP_FORMAT = "charitology-artifact-results";
export function artifactBackupBytes(state: ArtifactState): number {
  return encoder.encode(
    JSON.stringify(
      {
        format: BACKUP_FORMAT,
        version: 1,
        exportedAt: "2000-01-01T00:00:00.000Z",
        state,
        checksum: "0".repeat(64),
      },
      null,
      2,
    ) + "\n",
  ).byteLength;
}
export async function makeArtifactBackup(
  state: ArtifactState,
  exportedAt: Instant,
): Promise<string> {
  artifactInstant(exportedAt, "exportedAt");
  const before = canonicalArtifactJson(state),
    valid = await validateArtifactState(state),
    payload = { format: BACKUP_FORMAT, version: 1, exportedAt, state: valid };
  const checksum = await hashArtifactValue(payload),
    text = JSON.stringify({ ...payload, checksum }, null, 2) + "\n";
  if (encoder.encode(text).byteLength > ARTIFACT_LIMITS.backupBytes)
    artifactFail("backup_limit", "Complete backup exceeds 2 MiB.");
  if (canonicalArtifactJson(state) !== before)
    artifactFail("input_changed", "Workspace changed during backup export.");
  return text;
}
export async function parseArtifactBackup(
  raw: string | Uint8Array,
): Promise<ArtifactState> {
  if (typeof raw !== "string" && !(raw instanceof Uint8Array))
    artifactFail("backup", "Choose actual backup text or bytes.");
  if (typeof raw === "string" && raw.length > ARTIFACT_LIMITS.backupBytes)
    artifactFail("backup_limit", "Choose a backup no larger than 2 MiB.");
  const bytes = typeof raw === "string" ? encoder.encode(raw) : raw;
  if (bytes.length > ARTIFACT_LIMITS.backupBytes)
    artifactFail("backup_limit", "Choose a backup no larger than 2 MiB.");
  const before = bytesToHex(sha256(bytes));
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice()),
    );
  } catch {
    artifactFail("backup", "Backup must be valid UTF-8 JSON.");
  }
  exactArtifactObject(
    value,
    ["format", "version", "exportedAt", "state", "checksum"],
    "backup",
  );
  if (value.format !== BACKUP_FORMAT || value.version !== 1)
    artifactFail("backup", "Unsupported backup format/version.");
  artifactInstant(value.exportedAt, "exportedAt");
  artifactHash(value.checksum, "checksum");
  const { checksum, ...payload } = value;
  if ((await hashArtifactValue(payload)) !== checksum)
    artifactFail("backup_checksum", "Backup checksum does not match.");
  const s = await validateArtifactState(value.state);
  if (typeof raw !== "string" && bytesToHex(sha256(raw)) !== before)
    artifactFail("input_changed", "Backup bytes changed while checking.");
  return s;
}
const csvCell = (v: unknown) => {
  let text = v === null || v === undefined ? "" : String(v);
  if (
    typeof v !== "number" &&
    (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))
  )
    text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
};
function csv(rows: Record<string, unknown>[], headers: string[]): string {
  return (
    [
      headers.map(csvCell).join(","),
      ...rows.map((row) => headers.map((k) => csvCell(row[k])).join(",")),
    ].join("\r\n") + "\r\n"
  );
}
export function artifactCsvExports(
  s: ArtifactState,
  ids: Id[],
): {
  protocols: string;
  artifacts: string;
  results: string;
  comparisons: string;
} {
  const c = closure(s, ids);
  return {
    protocols: csv(
      c.protocols.map((p) => ({
        id: p.id,
        projectId: p.projectId,
        version: p.version,
        hash: p.hash,
        current: s.projects.some((x) => x.currentProtocolId === p.id),
        contentHash: p.contentHash,
        recordedAt: p.recordedAt,
        sourceProgram: p.origin?.program ?? "",
        sourceRecordId: p.origin?.recordId ?? "",
        identityHash: p.origin?.identityHash ?? "",
        resultsKnown: p.content.resultsKnown,
        registration: p.content.registration?.url ?? "",
        amendmentReason: p.amendmentReason,
        values: canonicalArtifactJson(p.content.values),
      })),
      [
        "id",
        "projectId",
        "version",
        "hash",
        "current",
        "contentHash",
        "recordedAt",
        "sourceProgram",
        "sourceRecordId",
        "identityHash",
        "resultsKnown",
        "registration",
        "amendmentReason",
        "values",
      ],
    ),
    artifacts: csv(
      c.manifests.flatMap((m) =>
        m.content.artifacts.map((a) => ({
          projectId: m.projectId,
          protocolId: m.protocolId,
          protocolHash: m.protocolHash,
          manifestId: m.id,
          manifestHash: m.hash,
          version: m.version,
          recordedAt: m.recordedAt,
          ...a,
          checksumKind: a.checksum?.kind ?? "",
          sha256: a.checksum?.sha256 ?? "",
          byteLength:
            a.checksum?.kind === "local-bytes" ? a.checksum.byteLength : null,
          hashedAt:
            a.checksum?.kind === "local-bytes" ? a.checksum.hashedAt : "",
        })),
      ),
      [
        "projectId",
        "protocolId",
        "protocolHash",
        "manifestId",
        "manifestHash",
        "version",
        "recordedAt",
        "id",
        "role",
        "title",
        "fileName",
        "url",
        "access",
        "license",
        "note",
        "checksumKind",
        "sha256",
        "byteLength",
        "hashedAt",
      ],
    ),
    results: csv(
      c.results.map((r) => ({
        id: r.id,
        projectId: r.projectId,
        protocolId: r.protocolId,
        protocolHash: r.protocolHash,
        manifestId: r.manifestId,
        manifestHash: r.manifestHash,
        hash: r.hash,
        supersedesId: r.supersedesId,
        recordedAt: r.recordedAt,
        observedOn: r.content.observedOn,
        kind: r.content.kind,
        summary: r.content.summary,
        originalEstimate: r.content.original?.estimate ?? null,
        originalKnown:
          r.content.original?.estimate !== null &&
          r.content.original?.estimate !== undefined,
        reportedEstimate: r.content.reported?.estimate ?? null,
        reportedKnown:
          r.content.reported?.estimate !== null &&
          r.content.reported?.estimate !== undefined,
        original: canonicalArtifactJson(r.content.original),
        reported: canonicalArtifactJson(r.content.reported),
        deviations: r.content.deviations,
        limitations: r.content.limitations,
        sources: canonicalArtifactJson(r.content.sourceReferences),
        conflicts: canonicalArtifactJson(r.content.conflicts),
      })),
      [
        "id",
        "projectId",
        "protocolId",
        "protocolHash",
        "manifestId",
        "manifestHash",
        "hash",
        "supersedesId",
        "recordedAt",
        "observedOn",
        "kind",
        "summary",
        "originalEstimate",
        "originalKnown",
        "reportedEstimate",
        "reportedKnown",
        "original",
        "reported",
        "deviations",
        "limitations",
        "sources",
        "conflicts",
      ],
    ),
    comparisons: csv(
      c.comparisons.map((x) => {
        const r = c.results.find((r) => r.id === x.resultId)!;
        const diff = artifactDifference(r, x.content);
        return {
          id: x.id,
          resultId: x.resultId,
          resultHash: x.resultHash,
          hash: x.hash,
          supersedesId: x.supersedesId,
          recordedAt: x.recordedAt,
          ...x.content,
          difference: diff.value,
          differenceKnown: diff.value !== null,
          unavailableReasons: diff.reasons.join(" "),
        };
      }),
      [
        "id",
        "resultId",
        "resultHash",
        "hash",
        "supersedesId",
        "recordedAt",
        "compatible",
        "compatibilityReason",
        "showDifference",
        "interpretation",
        "limitations",
        "nextCheck",
        "difference",
        "differenceKnown",
        "unavailableReasons",
      ],
    ),
  };
}
const md = (v: string) =>
  v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_{}\[\]()#+.!|~-])/g, "\\$1");
export function artifactMarkdownPacket(s: ArtifactState, ids: Id[]): string {
  const c = closure(s, ids);
  return (
    "# Local artifact and results packet\n\nSelf-recorded planning and sourced reports, not independent registration, execution, causal findings or review. Checksums are self-recorded provenance.\n\nSelected project IDs: " +
    c.projects.map((p) => md(p.id)).join(", ") +
    ".\n\n" +
    c.projects
      .map((p) => {
        const v = artifactProjectView(s, p.id);
        return (
          `## ${md(p.title)}\n\nCurrent protocol: ${md(v.currentProtocol.id)} · ${v.currentProtocol.hash}. Earlier versions remain historical.\n\n` +
          c.protocols
            .filter((x) => x.projectId === p.id)
            .map(
              (x) =>
                `### Protocol ${x.version}${x.id === v.currentProtocol.id ? " (current)" : " (historical)"}\n\nID: ${md(x.id)}; checksum: ${x.hash}.\n\nLocal time: ${x.recordedAt}. Results known: ${x.content.resultsKnown}.\n\n${md(canonicalArtifactJson(x.content.values))}\n\nAmendment: ${md(x.amendmentReason)}\n\n`,
            )
            .join("") +
          c.manifests
            .filter((x) => x.projectId === p.id)
            .map(
              (x) =>
                `### Artifact manifest ${x.version}${x.id === v.currentManifest?.id ? " (current binding)" : " (historical)"}\n\nID: ${md(x.id)}; protocol ${md(x.protocolId)}; checksum ${x.hash}; recorded locally ${x.recordedAt}.\n\nEnvironment: ${md(x.content.environment)}\n\nRun instructions: ${md(x.content.runInstructions)}\n\nDeviations: ${md(x.content.deviations)}\n\nDescriptors and self-recorded checksums: ${md(canonicalArtifactJson(x.content.artifacts))}\n\n`,
            )
            .join("") +
          c.results
            .filter((r) => r.projectId === p.id)
            .map(
              (r) =>
                `### Self-recorded ${r.content.kind}${r.id === v.latestResult?.id ? " (current binding)" : " (historical)"}\n\nID: ${md(r.id)}; protocol ${md(r.protocolId)}; manifest ${md(r.manifestId)}; checksum ${r.hash}.\n\nObserved date: ${r.content.observedOn ?? "unknown"}; recorded locally: ${r.recordedAt}.\n\n${md(r.content.summary)}\n\nOriginal estimate (null fields are unknown): ${md(canonicalArtifactJson(r.content.original))}\n\nLater reported estimate (null fields are unknown): ${md(canonicalArtifactJson(r.content.reported))}\n\nLater result sources: ${md(canonicalArtifactJson(r.content.sourceReferences))}\n\nConflict declaration: ${md(canonicalArtifactJson(r.content.conflicts))}\n\nDeviations: ${md(r.content.deviations)}\n\nLimits: ${md(r.content.limitations)}\n\n`,
            )
            .join("") +
          c.comparisons
            .filter((x) =>
              c.results.some(
                (r) => r.projectId === p.id && r.id === x.resultId,
              ),
            )
            .map((x) => {
              const result = c.results.find((r) => r.id === x.resultId)!;
              const difference = artifactDifference(result, x.content);
              return `### Descriptive comparison${x.id === v.latestComparison?.id ? " (current binding)" : " (historical)"}\n\nID: ${md(x.id)}; exact result ${md(x.resultId)}; checksum ${x.hash}; recorded locally ${x.recordedAt}.\n\nCompatibility, interpretation and limitations: ${md(canonicalArtifactJson(x.content))}\n\nReported minus original: ${difference.value === null ? "unavailable — " + md(difference.reasons.join(" ")) : String(difference.value)}. This is descriptive arithmetic, not a causal or replication verdict.\n\n`;
            })
            .join("")
        );
      })
      .join("\n")
  );
}
export async function makeArtifactPacket(
  s: ArtifactState,
  id: Id,
  exportedAt: Instant,
): Promise<{
  json: string;
  csv: ReturnType<typeof artifactCsvExports>;
  markdown: string;
}> {
  const before = canonicalArtifactJson(s),
    valid = await validateArtifactState(s),
    p = valid.packets.find((p) => p.id === id);
  if (!p) artifactFail("packet", "Packet descriptor is missing.");
  if ((await artifactInputHash(valid, p.projectIds)) !== p.inputHash)
    artifactFail(
      "historical_packet",
      "Selected closure changed. Use its earlier downloaded JSON or record a new descriptor.",
    );
  const json = await makeArtifactBackup(valid, exportedAt),
    out = {
      json,
      csv: artifactCsvExports(valid, p.projectIds),
      markdown: artifactMarkdownPacket(valid, p.projectIds),
    };
  if (canonicalArtifactJson(s) !== before)
    artifactFail("input_changed", "Workspace changed during packet export.");
  return out;
}
