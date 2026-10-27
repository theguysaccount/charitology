/** Private source snapshots and declared planning links; no storage, network or authorization. */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  applyProgramCapture,
  adapterForProgram,
  validateGraphValues,
  strictProgramGraphJson,
} from "./program-graph-import";
export type Id = string; //1..100 ASCII A-Z/a-z/0-9/_/-, top-level graph IDs globally unique
export type Hash = string; //64 lowercase SHA256 hex
export type Instant = string; //real canonical UTC YYYY-MM-DDTHH:mm:ss.sssZ,1900..2200
export type Program =
  | "the-charitology-fund"
  | "charity-incubator"
  | "question-bounties"
  | "the-charitology-prize"
  | "charitology-fellowship"
  | "charitology-summit"
  | "donor-advisory"
  | "nonprofit-advisory"
  | "field-verification";
export type SourceRecordId = string; //actual partner ASCII Id domain; not a graph entity ID
export interface PartnerSource {
  version: 1;
  program: Program;
  updated: string; //original <=100 chars; empty or current Date.parse-valid
  context: Record<string, string>;
  records: Record<
    string,
    { id: SourceRecordId; values: Record<string, string> }[]
  >;
}
export interface AdapterField {
  key: string;
  label: string;
  kind: "text" | "textarea" | "number" | "date" | "url" | "select";
  optional: boolean;
  options: string[];
  min: number | null;
  max: number | null;
  value: string | null;
  hint: string | null;
  maxLength: 500 | 5000;
}
export interface AdapterCollection {
  key: string;
  label: string;
  singular: string;
  description: string;
  fields: AdapterField[];
}
export interface ProgramGraphAdapter {
  id: string;
  version: 1;
  program: Program;
  context: AdapterField[];
  collections: AdapterCollection[];
  hash: Hash;
}
export interface SourceInstance {
  id: Id;
  program: Program;
  adapterId: string;
  adapterHash: Hash;
  alias: string; //1..160, project alias, no private identity
  currentCaptureId: Id;
  retirement: null | { at: Instant; reason: string; captureId: Id };
}
export interface InventoryRef {
  collection: string;
  recordId: SourceRecordId;
}
export interface SourceCapture {
  id: Id;
  sourceId: Id;
  sequence: number;
  previousId: Id | null;
  capturedAt: Instant;
  sourceUpdated: string;
  sourceRawHash: Hash;
  sourceCanonicalHash: Hash;
  byteLength: number;
  origin:
    { kind: "file"; fileName: string } | { kind: "saved-key"; key: string };
  context: Record<string, string>;
  inventory: InventoryRef[]; //all rows of all known collections, sorted collection/id
  nodeVersions: { nodeId: Id; versionId: Id }[]; //all tracked nodes of this source at this capture
  hash: Hash;
}
export interface GraphNode {
  id: Id;
  sourceId: Id;
  collection: string;
  recordId: SourceRecordId;
  firstCaptureId: Id;
  currentVersionId: Id;
}
export interface NodeVersion {
  id: Id;
  nodeId: Id;
  version: number;
  previousId: Id | null;
  captureId: Id;
  presence: "present" | "missing";
  values: Record<string, string> | null;
  contextHash: Hash; //exact context of its originating capture
  reappeared: boolean; //present after a missing predecessor only
  hash: Hash;
}
export type RelationKind =
  | "related-to"
  | "depends-on"
  | "planned-work-for"
  | "evidence-note-for"
  | "decision-note-for"
  | "conflict-note-for";
export interface GraphLink {
  id: Id;
  from: Id;
  to: Id;
  kind: RelationKind;
  currentVersionId: Id;
}
export interface LinkVersion {
  id: Id;
  linkId: Id;
  version: number;
  previousId: Id | null;
  recordedAt: Instant;
  action: "review" | "retire";
  fromVersionId: Id;
  toVersionId: Id;
  reason: string;
  legacyField: null | { nodeId: Id; field: string; rawValueHash: Hash };
  reappearanceAcknowledged: Id[]; //endpoints crossing missing/reappeared history since prior review
  hash: Hash;
}
export type Tab =
  | "sources"
  | "records"
  | "links"
  | "connected"
  | "import"
  | "exports"
  | "recovery";
export interface GraphDraft {
  tab: Tab;
  sourceId: Id | null;
  nodeId: Id | null;
  form: null | {
    kind:
      | "capture"
      | "link"
      | "review"
      | "retire-source"
      | "retire-link"
      | "rename-source";
    targetId: Id | null;
    binding: Record<string, string>;
    fields: Record<string, string>;
  };
  dirty: boolean;
}
export interface ProgramGraphState {
  version: 1;
  id: Id;
  revision: number;
  updatedAt: Instant;
  adapters: ProgramGraphAdapter[];
  sources: SourceInstance[];
  captures: SourceCapture[];
  nodes: GraphNode[];
  nodeVersions: NodeVersion[];
  links: GraphLink[];
  linkVersions: LinkVersion[];
  draft: GraphDraft;
}
export interface GraphIssue {
  path: string;
  code: string;
  message: string;
}
export interface GraphContext {
  expectedStateHash: Hash;
  at: Instant;
  makeId: () => Id;
  digest?: (bytes: Uint8Array) => Promise<Hash>;
}
export interface PreparedGraphMutation {
  format: "charitology-program-graph-mutation";
  version: 1;
  expectedStateHash: Hash;
  expectedRevision: number;
  nextStateHash: Hash;
  nextState: ProgramGraphState;
  commandHash: Hash;
  noOp: boolean;
  summary: { kind: GraphCommand["kind"]; message: string };
}
export type GraphCommand =
  | {
      kind: "source.capture";
      preview: CapturePreview;
      selection: CaptureSelection;
    }
  | { kind: "source.rename"; sourceId: Id; alias: string }
  | {
      kind: "source.retire";
      sourceId: Id;
      expectedCaptureId: Id;
      reason: string;
    }
  | {
      kind: "link.review";
      linkId: Id | null;
      expectedLinkVersionId: Id | null;
      from: Id;
      to: Id;
      kindOfRelation: RelationKind;
      fromVersionId: Id;
      toVersionId: Id;
      reason: string;
      legacyField: LinkVersion["legacyField"];
      reappearanceAcknowledged: Id[];
    }
  | {
      kind: "link.retire";
      linkId: Id;
      expectedLinkVersionId: Id;
      reason: string;
    }
  | { kind: "draft.replace"; draft: GraphDraft };
export interface CaptureInput {
  bytes: Uint8Array;
  program: Program;
  origin:
    { kind: "file"; fileName: string } | { kind: "saved-key"; key: string };
  target: null | {
    sourceId: Id;
    expectedCaptureId: Id;
    expectedCaptureHash: Hash;
  };
}
export interface CaptureRow {
  index: number;
  collection: string;
  recordId: SourceRecordId;
  title: string;
  trackedNodeId: Id | null;
  change: "new" | "same" | "changed" | "reappeared";
}
export interface CapturePreview {
  format: "charitology-program-graph-capture";
  version: 1;
  stateHash: Hash;
  program: Program;
  adapterId: string;
  adapterHash: Hash;
  sourceRawHash: Hash;
  sourceCanonicalHash: Hash;
  origin: CaptureInput["origin"];
  target: CaptureInput["target"];
  byteLength: number;
  context: Record<string, string>; //exact accepted raw source context strings
  rows: CaptureRow[];
  missingNodeIds: Id[];
  overlap: { sourceId: Id; count: number }[];
  reviewHash: Hash;
  bytes: Uint8Array;
}
export interface CaptureSelection {
  selectedIndexes: number[]; //sorted unique integers0..499; new nodes to track
  alias: string | null; //required only for new instance
  completeCopyAcknowledged: true;
  separateCopyAcknowledged: boolean; //required true for new overlapping instance
  resumeRetired: boolean; //required true if refreshing retired instance
}

export const PROGRAM_GRAPH_LIMITS = Object.freeze({
  sources: 20,
  captures: 100,
  nodes: 500,
  nodeVersions: 2000,
  links: 500,
  linkVersions: 2000,
  sourceBytes: 8_000_000,
  backupBytes: 2_097_152,
  draftBytes: 524_288,
  draftFieldChars: 16_384,
  draftKeys: 40,
  jsonDepth: 32,
});
export const GRAPH_LIMITS = PROGRAM_GRAPH_LIMITS;
const encoder = new TextEncoder();
const reserved = new Set(["__proto__", "prototype", "constructor"]);
const entityKeys = [
  "sources",
  "captures",
  "nodes",
  "nodeVersions",
  "links",
  "linkVersions",
] as const;
export type LinkState = "current" | "stale" | "unresolved" | "retired";
export class ProgramGraphError extends Error {
  code: string;
  issues: GraphIssue[];
  constructor(code: string, message: string, path = "") {
    super(message);
    this.name = "ProgramGraphError";
    this.code = code;
    this.issues = [{ code, path, message }];
  }
}
export function graphFail(code: string, message: string, path = ""): never {
  throw new ProgramGraphError(code, message, path);
}
export function graphPlain(v: unknown): v is Record<string, any> {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    (Object.getPrototypeOf(v) === Object.prototype ||
      Object.getPrototypeOf(v) === null)
  );
}
export function exactGraphObject(
  v: unknown,
  keys: readonly string[],
  path = "",
): asserts v is Record<string, any> {
  if (
    !graphPlain(v) ||
    Object.keys(v).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(v, k)) ||
    Object.keys(v).some((k) => reserved.has(k) || !keys.includes(k))
  )
    graphFail("shape", "Use exactly the documented object fields.", path);
}
export function graphText(
  v: unknown,
  max: number,
  path = "",
  allowEmpty = false,
): asserts v is string {
  if (
    typeof v !== "string" ||
    v.length > max ||
    (!allowEmpty && !v.trim()) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)
  )
    graphFail(
      "text",
      `Use ${allowEmpty ? "" : "nonempty "}text of at most ${max} characters.`,
      path,
    );
}
export function graphId(v: unknown, path = ""): asserts v is Id {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(v))
    graphFail("id", "Use a bounded opaque identifier.", path);
}
export function graphHash(v: unknown, path = ""): asserts v is Hash {
  if (typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v))
    graphFail("hash", "Use a complete SHA-256 hash.", path);
}
export function graphInstant(v: unknown, path = ""): asserts v is Instant {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) ||
    v < "1900-01-01T00:00:00.000Z" ||
    v > "2200-12-31T23:59:59.999Z" ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString() !== v
  )
    graphFail(
      "instant",
      "Use a real canonical UTC instant between 1900 and 2200.",
      path,
    );
}
function integer(
  v: unknown,
  min: number,
  max: number,
  path = "",
): asserts v is number {
  if (!Number.isSafeInteger(v) || (v as number) < min || (v as number) > max)
    graphFail("integer", `Use a safe integer from ${min} to ${max}.`, path);
}
function nullableId(v: unknown, path = "") {
  if (v !== null) graphId(v, path);
}
function array(v: unknown, max: number, path = ""): asserts v is unknown[] {
  if (!Array.isArray(v) || v.length > max)
    graphFail("limit", `Use at most ${max} entries.`, path);
}
function choice<T extends string>(
  v: unknown,
  values: readonly T[],
  path = "",
): asserts v is T {
  if (!values.includes(v as T))
    graphFail("choice", "Choose a documented value.", path);
}
export const graphClone = <T>(v: T): T => structuredClone(v);
export function graphFreeze<T>(v: T): T {
  if (v && typeof v === "object" && !(v instanceof Uint8Array)) {
    for (const child of Object.values(v)) graphFreeze(child);
    Object.freeze(v);
  }
  return v;
}
export function canonicalProgramGraphJson(value: unknown): string {
  const seen = new Set<object>();
  const walk = (v: unknown, depth: number): unknown => {
    if (v === null || typeof v === "string" || typeof v === "boolean") return v;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) graphFail("json", "Use finite JSON numbers.");
      return v;
    }
    if (typeof v !== "object" || !v || depth > 32 || seen.has(v))
      graphFail("json", "Use bounded acyclic plain JSON.");
    if (Object.getOwnPropertySymbols(v).length)
      graphFail("json", "Symbol-decorated JSON is unsupported.");
    seen.add(v);
    let out: unknown;
    if (Array.isArray(v)) {
      if (
        Object.keys(v).length !== v.length ||
        Object.getOwnPropertyNames(v).length !== v.length + 1 ||
        Object.keys(v).some(
          (k, i) =>
            k !== String(i) ||
            !Object.hasOwn(Object.getOwnPropertyDescriptor(v, k)!, "value"),
        )
      )
        graphFail(
          "json",
          "Sparse, accessor or decorated arrays are unsupported.",
        );
      out = v.map((x) => walk(x, depth + 1));
    } else {
      if (
        !graphPlain(v) ||
        Object.getOwnPropertyNames(v).length !== Object.keys(v).length
      )
        graphFail("json", "Use plain enumerable JSON objects.");
      out = Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => {
            if (reserved.has(k)) graphFail("key", "Reserved object key.");
            if (!Object.hasOwn(Object.getOwnPropertyDescriptor(v, k)!, "value"))
              graphFail("json", "JSON accessors are unsupported.");
            return [k, walk(v[k], depth + 1)];
          }),
      );
    }
    seen.delete(v);
    return out;
  };
  return JSON.stringify(walk(value, 1));
}
export const hashProgramGraphSync = (value: unknown): Hash =>
  bytesToHex(sha256(encoder.encode(canonicalProgramGraphJson(value))));
export async function hashProgramGraphValue(
  value: unknown,
  digest?: GraphContext["digest"],
): Promise<Hash> {
  const json = canonicalProgramGraphJson(value),
    bytes = encoder.encode(json);
  const result = digest
    ? await digest(bytes.slice())
    : bytesToHex(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", bytes.slice().buffer),
        ),
      );
  graphHash(result, "digest");
  if (result !== bytesToHex(sha256(bytes)))
    graphFail("digest", "Digest must be SHA-256 of the supplied bytes.");
  if (canonicalProgramGraphJson(value) !== json)
    graphFail("input_changed", "Input changed while hashing.");
  return result;
}
export const programGraphStateHash = (state: ProgramGraphState) =>
  hashProgramGraphValue(state);
export function graphEntryHash(entry: unknown): Hash {
  if (!graphPlain(entry)) graphFail("shape", "Use an entry object.");
  const { hash, ...body } = entry;
  return hashProgramGraphSync(body);
}
function checkHash(entry: { hash: Hash }) {
  graphHash(entry.hash);
  if (graphEntryHash(entry) !== entry.hash)
    graphFail("entry_hash", "An immutable entry checksum changed.");
}
function addHash<T extends object>(entry: T): T & { hash: Hash } {
  return { ...entry, hash: hashProgramGraphSync(entry) };
}
function backupText(state: ProgramGraphState, exportedAt: Instant): string {
  const body = {
    format: "charitology-program-graph-backup",
    version: 1,
    exportedAt,
    state,
  };
  return (
    JSON.stringify({ ...body, checksum: hashProgramGraphSync(body) }, null, 2) +
    "\n"
  );
}
export function graphBackupBytes(
  state: ProgramGraphState,
  exportedAt: Instant = state.updatedAt,
): number {
  const n = encoder.encode(backupText(state, exportedAt)).length;
  if (n > PROGRAM_GRAPH_LIMITS.backupBytes)
    graphFail(
      "backup_limit",
      "Complete graph backup exceeds 2 MiB; preserve this graph and use fewer records or a separate backed-up graph.",
    );
  return n;
}
function originCheck(origin: SourceCapture["origin"], program: Program) {
  if (!graphPlain(origin)) graphFail("origin", "Source origin is missing.");
  if (origin.kind === "file") {
    exactGraphObject(origin, ["kind", "fileName"]);
    graphText(origin.fileName, 255);
    if (
      /[\\/\u0000-\u001f\u007f]/.test(origin.fileName) ||
      [".", ".."].includes(origin.fileName)
    )
      graphFail("origin", "Use a basename without controls.");
  } else {
    exactGraphObject(origin, ["kind", "key"]);
    if (
      origin.kind !== "saved-key" ||
      origin.key !== `charitology.partner-workspace-v1.${program}`
    )
      graphFail(
        "origin",
        "Capture only this program's explicitly chosen known key.",
      );
  }
}
function sourceTime(v: unknown) {
  if (
    typeof v !== "string" ||
    v.length > 100 ||
    (v !== "" && !Number.isFinite(Date.parse(v)))
  )
    graphFail(
      "source_time",
      "Preserve the valid original source timestamp string.",
    );
}
function sortedUnique(values: string[], path = "") {
  if (values.some((v, i) => i > 0 && v <= values[i - 1]))
    graphFail("order", "Use sorted unique identifiers.", path);
}
function must<T>(
  value: T | undefined,
  message = "A referenced graph entry is missing.",
): T {
  if (value === undefined) graphFail("reference", message);
  return value;
}
const formNames = {
  capture: {
    binding: [
      "program",
      "targetSourceId",
      "expectedCaptureId",
      "expectedCaptureHash",
      "stateHash",
      "sourceRawHash",
      "sourceCanonicalHash",
      "reviewHash",
      "originKind",
      "originValue",
    ],
    fields: [
      "alias",
      "selectedIndexes",
      "completeCopyAcknowledged",
      "separateCopyAcknowledged",
      "resumeRetired",
    ],
  },
  link: {
    binding: [
      "linkId",
      "expectedLinkVersionId",
      "from",
      "to",
      "fromVersionId",
      "toVersionId",
    ],
    fields: [
      "kindOfRelation",
      "reason",
      "legacyField",
      "reappearanceAcknowledged",
    ],
  },
  review: {
    binding: [
      "linkId",
      "expectedLinkVersionId",
      "from",
      "to",
      "fromVersionId",
      "toVersionId",
    ],
    fields: [
      "kindOfRelation",
      "reason",
      "legacyField",
      "reappearanceAcknowledged",
    ],
  },
  "retire-source": {
    binding: ["sourceId", "expectedCaptureId"],
    fields: ["reason"],
  },
  "retire-link": {
    binding: ["linkId", "expectedLinkVersionId"],
    fields: ["reason"],
  },
  "rename-source": { binding: ["sourceId"], fields: ["alias"] },
} as const;
export const PROGRAM_GRAPH_FORM_NAMES = graphFreeze(graphClone(formNames));
function validateDraft(d: GraphDraft): void {
  exactGraphObject(d, ["tab", "sourceId", "nodeId", "form", "dirty"], "draft");
  choice(d.tab, [
    "sources",
    "records",
    "links",
    "connected",
    "import",
    "exports",
    "recovery",
  ]);
  nullableId(d.sourceId);
  nullableId(d.nodeId);
  if (typeof d.dirty !== "boolean")
    graphFail("draft", "Dirty state must be explicit.");
  if (d.form !== null) {
    const f = d.form;
    exactGraphObject(f, ["kind", "targetId", "binding", "fields"]);
    if (!Object.hasOwn(formNames, f.kind))
      graphFail("draft", "Unknown raw form kind.");
    nullableId(f.targetId);
    let count = 0;
    for (const k of ["binding", "fields"] as const) {
      if (!graphPlain(f[k]))
        graphFail("draft", "Raw maps must be plain strings.");
      for (const [key, value] of Object.entries(f[k])) {
        count++;
        if (
          !(formNames[f.kind][k] as readonly string[]).includes(key) ||
          typeof value !== "string" ||
          value.length > PROGRAM_GRAPH_LIMITS.draftFieldChars
        )
          graphFail("draft", "Unknown or oversized raw form field.");
      }
    }
    if (count > 40) graphFail("draft", "Raw form has too many fields.");
  }
  if (
    encoder.encode(canonicalProgramGraphJson(d)).length >
    PROGRAM_GRAPH_LIMITS.draftBytes
  )
    graphFail(
      "draft",
      "Raw draft exceeds 512 KiB; download plain raw form recovery.",
    );
}
export function blankProgramGraphState(id: Id, at: Instant): ProgramGraphState {
  graphId(id);
  graphInstant(at);
  return graphFreeze({
    version: 1,
    id,
    revision: 0,
    updatedAt: at,
    adapters: [],
    sources: [],
    captures: [],
    nodes: [],
    nodeVersions: [],
    links: [],
    linkVersions: [],
    draft: {
      tab: "sources",
      sourceId: null,
      nodeId: null,
      form: null,
      dirty: false,
    },
  });
}
const relations = [
  "related-to",
  "depends-on",
  "planned-work-for",
  "evidence-note-for",
  "decision-note-for",
  "conflict-note-for",
] as const;
const roleTable: Record<string, Record<string, string[]>> = {
  "planned-work-for": {
    "the-charitology-fund": ["ledger"],
    "charity-incubator": ["projects", "experiments", "milestones"],
    "charitology-fellowship": ["projects", "curriculum", "milestones"],
    "charitology-summit": ["roles", "production", "followup"],
    "nonprofit-advisory": ["actions"],
    "field-verification": ["actions"],
  },
  "evidence-note-for": {
    "donor-advisory": ["evidence"],
    "nonprofit-advisory": ["evidence"],
    "field-verification": ["findings"],
    "charity-incubator": ["experiments"],
    "question-bounties": ["claims"],
    "charitology-summit": ["followup"],
  },
  "decision-note-for": {
    "the-charitology-fund": ["allocations"],
    "question-bounties": ["decisions"],
    "the-charitology-prize": ["deliberations"],
    "charitology-fellowship": ["reviews"],
    "donor-advisory": ["followup"],
    "nonprofit-advisory": ["learning"],
    "field-verification": ["responses"],
  },
  "conflict-note-for": {
    "the-charitology-fund": ["conflicts"],
    "the-charitology-prize": ["conflicts"],
  },
};
function roleCheck(s: ProgramGraphState, link: GraphLink) {
  choice(link.kind, relations);
  const n = must(s.nodes.find((x) => x.id === link.from)),
    source = must(s.sources.find((x) => x.id === n.sourceId));
  if (link.kind === "related-to" || link.kind === "depends-on") return;
  if (link.kind === "planned-work-for" && n.collection === "readiness") return;
  if (!roleTable[link.kind]?.[source.program]?.includes(n.collection))
    graphFail(
      "relation_role",
      "This collection cannot be the source of that relation kind.",
    );
}
function dependencyCheck(links: GraphLink[]) {
  const duplicate = new Set<string>();
  for (const l of links) {
    const key = canonicalProgramGraphJson([l.kind, l.from, l.to]);
    if (duplicate.has(key))
      graphFail(
        "duplicate_link",
        "An active relationship with these endpoints already exists.",
      );
    duplicate.add(key);
  }
  const edges = new Map<string, string[]>();
  for (const l of links.filter((x) => x.kind === "depends-on"))
    edges.set(l.from, [...(edges.get(l.from) || []), l.to]);
  const done = new Set<string>(),
    active = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id))
      graphFail(
        "dependency_cycle",
        "Declared dependencies must remain acyclic, including unresolved links.",
      );
    if (done.has(id)) return;
    active.add(id);
    for (const to of edges.get(id) || []) visit(to);
    active.delete(id);
    done.add(id);
  };
  for (const id of edges.keys()) visit(id);
}
function reappearanceIds(
  s: ProgramGraphState,
  from: NodeVersion,
  to: NodeVersion,
  prev?: LinkVersion,
): Id[] {
  return [from, to]
    .filter((end, index) => {
      const prior = prev
        ? must(
            s.nodeVersions.find(
              (v) =>
                v.id === (index === 0 ? prev.fromVersionId : prev.toVersionId),
            ),
          )
        : null;
      if (prior && end.version < prior.version)
        graphFail(
          "link_chain",
          "Endpoint review cannot move backwards through history.",
        );
      return s.nodeVersions.some(
        (v) =>
          v.nodeId === end.nodeId &&
          v.reappeared &&
          v.version > (prior?.version ?? 0) &&
          v.version <= end.version,
      );
    })
    .map((v) => v.nodeId)
    .sort();
}
export function programGraphAllowedRelations(
  s: ProgramGraphState,
  nodeId: Id,
): RelationKind[] {
  must(s.nodes.find((n) => n.id === nodeId));
  return graphFreeze(
    relations.filter((kind) => {
      try {
        roleCheck(s, {
          id: "role-preview",
          from: nodeId,
          to: nodeId,
          kind,
          currentVersionId: "none",
        });
        return true;
      } catch (error) {
        if (
          error instanceof ProgramGraphError &&
          error.code === "relation_role"
        )
          return false;
        throw error;
      }
    }),
  );
}
export function programGraphRequiredReappearanceIds(
  s: ProgramGraphState,
  fromNodeId: Id,
  toNodeId: Id,
  linkId: Id | null = null,
): Id[] {
  const from = must(s.nodes.find((n) => n.id === fromNodeId)),
    to = must(s.nodes.find((n) => n.id === toNodeId)),
    link = linkId === null ? null : must(s.links.find((l) => l.id === linkId));
  if (link && (link.from !== fromNodeId || link.to !== toNodeId))
    graphFail(
      "link_identity",
      "Inspect the exact fixed endpoints of this relationship.",
    );
  const previous = link
    ? must(s.linkVersions.find((v) => v.id === link.currentVersionId))
    : undefined;
  return graphFreeze(
    reappearanceIds(
      s,
      must(s.nodeVersions.find((v) => v.id === from.currentVersionId)),
      must(s.nodeVersions.find((v) => v.id === to.currentVersionId)),
      previous,
    ),
  );
}
function legacyCheck(
  s: ProgramGraphState,
  value: LinkVersion["legacyField"],
  from: NodeVersion,
  to: NodeVersion,
) {
  if (value === null) return;
  exactGraphObject(value, ["nodeId", "field", "rawValueHash"]);
  graphId(value.nodeId);
  graphText(value.field, 100);
  graphHash(value.rawValueHash);
  const v = [from, to].find((x) => x.nodeId === value.nodeId);
  if (
    !v ||
    v.values === null ||
    !Object.hasOwn(v.values, value.field) ||
    hashProgramGraphSync(v.values[value.field]) !== value.rawValueHash
  )
    graphFail(
      "legacy_field",
      "Reference provenance must hash an exact field on a reviewed endpoint.",
    );
}

function validateSync(s: ProgramGraphState): void {
  exactGraphObject(
    s,
    [
      "version",
      "id",
      "revision",
      "updatedAt",
      "adapters",
      ...entityKeys,
      "draft",
    ],
    "state",
  );
  if (s.version !== 1) graphFail("version", "Unsupported graph version.");
  graphId(s.id);
  integer(s.revision, 0, Number.MAX_SAFE_INTEGER);
  graphInstant(s.updatedAt);
  array(s.adapters, 9);
  for (const key of entityKeys) array(s[key], PROGRAM_GRAPH_LIMITS[key], key);
  const allIds = new Set([s.id]);
  for (const key of entityKeys)
    for (const row of s[key]) {
      if (!graphPlain(row)) graphFail("shape", "A graph row is not an object.");
      graphId(row.id);
      if (allIds.has(row.id))
        graphFail("duplicate_id", "Graph entity IDs must be globally unique.");
      allIds.add(row.id);
    }
  const adapterIds = new Set<string>();
  for (const a of s.adapters) {
    if (!graphPlain(a)) graphFail("adapter", "Adapter definition is missing.");
    const known = adapterForProgram(a.program);
    if (
      adapterIds.has(a.id) ||
      canonicalProgramGraphJson(a) !== canonicalProgramGraphJson(known) ||
      graphEntryHash(a) !== a.hash
    )
      graphFail(
        "adapter",
        "Only exact frozen known adapter definitions are accepted.",
      );
    adapterIds.add(a.id);
  }
  const sourceMap = new Map(s.sources.map((x) => [x.id, x])),
    captureMap = new Map(s.captures.map((x) => [x.id, x])),
    nodeMap = new Map(s.nodes.map((x) => [x.id, x])),
    nodeVersionMap = new Map(s.nodeVersions.map((x) => [x.id, x])),
    linkMap = new Map(s.links.map((x) => [x.id, x]));
  for (const source of s.sources) {
    exactGraphObject(source, [
      "id",
      "program",
      "adapterId",
      "adapterHash",
      "alias",
      "currentCaptureId",
      "retirement",
    ]);
    const a = adapterForProgram(source.program);
    if (
      !adapterIds.has(a.id) ||
      source.adapterId !== a.id ||
      source.adapterHash !== a.hash
    )
      graphFail("adapter", "Source uses a missing or different adapter.");
    graphText(source.alias, 160);
    graphId(source.currentCaptureId);
    if (source.retirement !== null) {
      exactGraphObject(source.retirement, ["at", "reason", "captureId"]);
      graphInstant(source.retirement.at);
      graphText(source.retirement.reason, 2000);
      if (source.retirement.captureId !== source.currentCaptureId)
        graphFail(
          "retirement",
          "Retirement must bind the source's current capture.",
        );
    }
  }
  const identities = new Set<string>();
  for (const n of s.nodes) {
    exactGraphObject(n, [
      "id",
      "sourceId",
      "collection",
      "recordId",
      "firstCaptureId",
      "currentVersionId",
    ]);
    const source = must(sourceMap.get(n.sourceId)),
      a = adapterForProgram(source.program);
    graphId(n.recordId);
    if (!a.collections.some((c) => c.key === n.collection))
      graphFail("collection", "Node collection is unknown.");
    graphId(n.firstCaptureId);
    graphId(n.currentVersionId);
    const k = canonicalProgramGraphJson([n.sourceId, n.collection, n.recordId]);
    if (identities.has(k))
      graphFail("identity", "Source record identity already has a node.");
    identities.add(k);
  }
  const lastNode = new Map<Id, NodeVersion>();
  for (const v of s.nodeVersions) {
    exactGraphObject(v, [
      "id",
      "nodeId",
      "version",
      "previousId",
      "captureId",
      "presence",
      "values",
      "contextHash",
      "reappeared",
      "hash",
    ]);
    const n = must(nodeMap.get(v.nodeId)),
      source = must(sourceMap.get(n.sourceId)),
      a = adapterForProgram(source.program),
      c = must(captureMap.get(v.captureId)),
      prev = lastNode.get(v.nodeId);
    integer(v.version, 1, 2000);
    nullableId(v.previousId);
    choice(v.presence, ["present", "missing"]);
    if (typeof v.reappeared !== "boolean")
      graphFail("node_chain", "Reappearance must be explicit.");
    graphHash(v.contextHash);
    if (
      c.sourceId !== n.sourceId ||
      v.version !== (prev?.version ?? 0) + 1 ||
      v.previousId !== (prev?.id ?? null)
    )
      graphFail("node_chain", "Node ownership/version chain changed.");
    if (!prev && (v.presence !== "present" || v.captureId !== n.firstCaptureId))
      graphFail(
        "node_chain",
        "A node must begin with a present captured version.",
      );
    if (v.presence === "present")
      validateGraphValues(
        v.values,
        must(a.collections.find((x) => x.key === n.collection)).fields,
      );
    else if (v.values !== null)
      graphFail(
        "node_chain",
        "Missing versions must retain null rather than invented blank values.",
      );
    if (
      v.reappeared !==
      (v.presence === "present" && prev?.presence === "missing")
    )
      graphFail(
        "reappearance",
        "Reappearance flag does not match node history.",
      );
    if (v.contextHash !== hashProgramGraphSync(c.context))
      graphFail(
        "context",
        "Node context differs from its originating capture.",
      );
    if (
      prev &&
      v.presence === prev.presence &&
      v.contextHash === prev.contextHash &&
      canonicalProgramGraphJson(v.values) ===
        canonicalProgramGraphJson(prev.values)
    )
      graphFail(
        "node_chain",
        "Unchanged node/context must reuse the preceding version.",
      );
    checkHash(v);
    lastNode.set(v.nodeId, v);
  }
  for (const n of s.nodes)
    if (lastNode.get(n.id)?.id !== n.currentVersionId)
      graphFail("node_chain", "Node current pointer must be its last version.");
  const lastCapture = new Map<Id, SourceCapture>(),
    seenVersions = new Set<Id>(),
    tracked = new Map<Id, Map<Id, Id>>(),
    historicCollections = new Map<Id, Map<SourceRecordId, string>>();
  for (const c of s.captures) {
    exactGraphObject(c, [
      "id",
      "sourceId",
      "sequence",
      "previousId",
      "capturedAt",
      "sourceUpdated",
      "sourceRawHash",
      "sourceCanonicalHash",
      "byteLength",
      "origin",
      "context",
      "inventory",
      "nodeVersions",
      "hash",
    ]);
    const source = must(sourceMap.get(c.sourceId)),
      a = adapterForProgram(source.program),
      prev = lastCapture.get(c.sourceId);
    integer(c.sequence, 1, 100);
    nullableId(c.previousId);
    if (
      c.sequence !== (prev?.sequence ?? 0) + 1 ||
      c.previousId !== (prev?.id ?? null)
    )
      graphFail(
        "capture_chain",
        "Capture sequence must append to the named source.",
      );
    graphInstant(c.capturedAt);
    sourceTime(c.sourceUpdated);
    graphHash(c.sourceRawHash);
    graphHash(c.sourceCanonicalHash);
    integer(c.byteLength, 1, 8_000_000);
    originCheck(c.origin, source.program);
    validateGraphValues(c.context, a.context, true);
    array(c.inventory, 500);
    array(c.nodeVersions, 500);
    if (!prev && c.nodeVersions.length === 0)
      graphFail(
        "capture_chain",
        "A source's first capture must track at least one selected record.",
      );
    const known =
        historicCollections.get(c.sourceId) ??
        new Map<SourceRecordId, string>(),
      inventory = new Map<SourceRecordId, string>(),
      collectionCounts = new Map<string, number>();
    let previousKey = "";
    for (const ref of c.inventory) {
      exactGraphObject(ref, ["collection", "recordId"]);
      graphId(ref.recordId);
      if (
        !a.collections.some((x) => x.key === ref.collection) ||
        inventory.has(ref.recordId)
      )
        graphFail(
          "inventory",
          "Inventory needs unique IDs in known collections.",
        );
      const k = ref.collection + "\u0000" + ref.recordId;
      if (previousKey && k <= previousKey)
        graphFail(
          "inventory",
          "Inventory must have canonical collection/ID order.",
        );
      previousKey = k;
      if (known.has(ref.recordId) && known.get(ref.recordId) !== ref.collection)
        graphFail(
          "source_identity",
          "A source ID moved to a different collection.",
        );
      known.set(ref.recordId, ref.collection);
      inventory.set(ref.recordId, ref.collection);
    }
    for (const ref of c.inventory)
      collectionCounts.set(
        ref.collection,
        (collectionCounts.get(ref.collection) ?? 0) + 1,
      );
    if ([...collectionCounts.values()].some((count) => count > 250))
      graphFail(
        "inventory",
        "A captured collection cannot exceed the source's 250-record bound.",
      );
    historicCollections.set(c.sourceId, known);
    const old = tracked.get(c.sourceId) ?? new Map<Id, Id>(),
      next = new Map<Id, Id>();
    let priorId = "";
    for (const ref of c.nodeVersions) {
      exactGraphObject(ref, ["nodeId", "versionId"]);
      graphId(ref.nodeId);
      graphId(ref.versionId);
      if (priorId && ref.nodeId <= priorId)
        graphFail(
          "capture_chain",
          "Captured node references must be sorted and unique.",
        );
      priorId = ref.nodeId;
      const n = must(nodeMap.get(ref.nodeId)),
        v = must(nodeVersionMap.get(ref.versionId));
      if (n.sourceId !== c.sourceId || v.nodeId !== n.id)
        graphFail("capture_chain", "Capture node ownership changed.");
      const prior = old.has(n.id)
        ? must(nodeVersionMap.get(old.get(n.id)!))
        : null;
      if (!prior && n.firstCaptureId !== c.id)
        graphFail("capture_chain", "New node must originate in this capture.");
      if (
        prior &&
        v.id !== prior.id &&
        (v.previousId !== prior.id || v.captureId !== c.id)
      )
        graphFail(
          "capture_chain",
          "Refresh must use its previous node version or append exactly one.",
        );
      if (!prior && v.captureId !== c.id)
        graphFail("capture_chain", "New node points at another capture.");
      if (
        (v.presence === "present") !==
        (inventory.get(n.recordId) === n.collection)
      )
        graphFail(
          "inventory",
          "Presence/absence contradicts the complete chosen inventory.",
        );
      if (v.contextHash !== hashProgramGraphSync(c.context))
        graphFail(
          "context",
          "Changed source context must refresh tracked endpoints.",
        );
      if (v.id !== prior?.id) {
        if (seenVersions.has(v.id))
          graphFail(
            "capture_chain",
            "Node version appeared before its own capture.",
          );
        seenVersions.add(v.id);
      }
      next.set(n.id, v.id);
    }
    for (const id of old.keys())
      if (!next.has(id))
        graphFail("capture_chain", "Refresh omitted an already tracked node.");
    tracked.set(c.sourceId, next);
    checkHash(c);
    lastCapture.set(c.sourceId, c);
  }
  if (seenVersions.size !== s.nodeVersions.length)
    graphFail(
      "capture_chain",
      "An orphan node version is not retained in its capture.",
    );
  for (const source of s.sources) {
    if (lastCapture.get(source.id)?.id !== source.currentCaptureId)
      graphFail(
        "capture_chain",
        "A source must point at its last complete capture.",
      );
    const map = tracked.get(source.id);
    for (const n of s.nodes.filter((x) => x.sourceId === source.id))
      if (map?.get(n.id) !== n.currentVersionId)
        graphFail(
          "capture_chain",
          "Final capture must cover every node current pointer.",
        );
  }
  for (const a of s.adapters)
    if (!s.sources.some((x) => x.adapterId === a.id))
      graphFail("adapter", "Unused adapters are not captured graph history.");
  for (const l of s.links) {
    exactGraphObject(l, ["id", "from", "to", "kind", "currentVersionId"]);
    graphId(l.from);
    graphId(l.to);
    graphId(l.currentVersionId);
    must(nodeMap.get(l.from));
    must(nodeMap.get(l.to));
    if (l.from === l.to)
      graphFail("self_link", "A node cannot link to itself.");
    roleCheck(s, l);
    if (l.kind === "related-to" && l.from >= l.to)
      graphFail("link_order", "Symmetric links use canonical endpoint order.");
  }
  const linkHeads = new Map<Id, LinkVersion>();
  for (const v of s.linkVersions) {
    exactGraphObject(v, [
      "id",
      "linkId",
      "version",
      "previousId",
      "recordedAt",
      "action",
      "fromVersionId",
      "toVersionId",
      "reason",
      "legacyField",
      "reappearanceAcknowledged",
      "hash",
    ]);
    const l = must(linkMap.get(v.linkId)),
      prev = linkHeads.get(v.linkId),
      from = must(nodeVersionMap.get(v.fromVersionId)),
      to = must(nodeVersionMap.get(v.toVersionId));
    integer(v.version, 1, 2000);
    nullableId(v.previousId);
    graphInstant(v.recordedAt);
    choice(v.action, ["review", "retire"]);
    graphText(v.reason, 2000);
    array(v.reappearanceAcknowledged, 2);
    for (const id of v.reappearanceAcknowledged) graphId(id);
    sortedUnique(v.reappearanceAcknowledged);
    if (
      v.version !== (prev?.version ?? 0) + 1 ||
      v.previousId !== (prev?.id ?? null) ||
      from.nodeId !== l.from ||
      to.nodeId !== l.to ||
      from.presence !== "present" ||
      to.presence !== "present"
    )
      graphFail(
        "link_chain",
        "Relationship versions must retain exact present endpoint histories.",
      );
    if (v.action === "retire") {
      if (
        !prev ||
        prev.action === "retire" ||
        v.fromVersionId !== prev.fromVersionId ||
        v.toVersionId !== prev.toVersionId ||
        canonicalProgramGraphJson(v.legacyField) !==
          canonicalProgramGraphJson(prev.legacyField) ||
        canonicalProgramGraphJson(v.reappearanceAcknowledged) !==
          canonicalProgramGraphJson(prev.reappearanceAcknowledged)
      )
        graphFail(
          "link_chain",
          "Retirement must preserve the preceding reviewed endpoint/provenance bindings.",
        );
    } else {
      const expected = reappearanceIds(s, from, to, prev);
      if (
        canonicalProgramGraphJson(expected) !==
        canonicalProgramGraphJson(v.reappearanceAcknowledged)
      )
        graphFail(
          "reappearance",
          "A review must acknowledge exactly the intervening reappeared endpoints.",
        );
      legacyCheck(s, v.legacyField, from, to);
    }
    checkHash(v);
    linkHeads.set(v.linkId, v);
    dependencyCheck(
      s.links.filter((x) => linkHeads.get(x.id)?.action === "review"),
    );
  }
  for (const l of s.links)
    if (linkHeads.get(l.id)?.id !== l.currentVersionId)
      graphFail("link_chain", "Relationship must point at its final version.");
  validateDraft(s.draft);
  graphBackupBytes(s);
}
export async function validateProgramGraphState(
  value: unknown,
): Promise<ProgramGraphState> {
  const json = canonicalProgramGraphJson(value),
    copy = JSON.parse(json) as ProgramGraphState;
  validateSync(copy);
  await hashProgramGraphValue(copy);
  if (canonicalProgramGraphJson(value) !== json)
    graphFail("input_changed", "Graph changed during validation.");
  return graphFreeze(copy);
}

const commandKeys = {
  "source.capture": ["preview", "selection"],
  "source.rename": ["sourceId", "alias"],
  "source.retire": ["sourceId", "expectedCaptureId", "reason"],
  "link.review": [
    "linkId",
    "expectedLinkVersionId",
    "from",
    "to",
    "kindOfRelation",
    "fromVersionId",
    "toVersionId",
    "reason",
    "legacyField",
    "reappearanceAcknowledged",
  ],
  "link.retire": ["linkId", "expectedLinkVersionId", "reason"],
  "draft.replace": ["draft"],
} as const;
const intrinsicByteLength = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  "byteLength",
)!.get!;
function admittedBytes(value: unknown, max: number): Uint8Array {
  if (!(value instanceof Uint8Array) || intrinsicByteLength.call(value) > max)
    graphFail("byte_limit", `Choose at most ${max} actual bytes.`);
  const copy = new Uint8Array(intrinsicByteLength.call(value));
  Uint8Array.prototype.set.call(copy, value);
  return copy;
}
function commandStamp(command: GraphCommand): string {
  if (!graphPlain(command) || !Object.hasOwn(commandKeys, command.kind))
    graphFail("command", "Choose a known graph command.");
  if (command.kind !== "source.capture")
    return canonicalProgramGraphJson(command);
  const p = command.preview;
  if (!graphPlain(p))
    graphFail("byte_limit", "Use a bounded actual source preview.");
  const bytes = admittedBytes(p.bytes, PROGRAM_GRAPH_LIMITS.sourceBytes);
  return canonicalProgramGraphJson({
    ...command,
    preview: {
      ...p,
      bytes: { byteLength: bytes.byteLength, hash: bytesToHex(sha256(bytes)) },
    },
  });
}
export function programGraphCommandForm(c: GraphCommand): GraphDraft["form"] {
  let kind: keyof typeof formNames | null = null,
    target: Id | null = null,
    binding: Record<string, string> = {},
    fields: Record<string, string> = {};
  const raw = (v: string | null) => v ?? "";
  switch (c.kind) {
    case "source.capture": {
      const p = c.preview,
        t = p.target;
      kind = "capture";
      target = t?.sourceId ?? null;
      binding = {
        program: p.program,
        targetSourceId: t?.sourceId ?? "",
        expectedCaptureId: t?.expectedCaptureId ?? "",
        expectedCaptureHash: t?.expectedCaptureHash ?? "",
        stateHash: p.stateHash,
        sourceRawHash: p.sourceRawHash,
        sourceCanonicalHash: p.sourceCanonicalHash,
        reviewHash: p.reviewHash,
        originKind: p.origin.kind,
        originValue:
          p.origin.kind === "file" ? p.origin.fileName : p.origin.key,
      };
      fields = {
        alias: raw(c.selection.alias),
        selectedIndexes: canonicalProgramGraphJson(c.selection.selectedIndexes),
        completeCopyAcknowledged: String(c.selection.completeCopyAcknowledged),
        separateCopyAcknowledged: String(c.selection.separateCopyAcknowledged),
        resumeRetired: String(c.selection.resumeRetired),
      };
      break;
    }
    case "link.review":
      kind = c.linkId === null ? "link" : "review";
      target = c.linkId;
      binding = {
        linkId: raw(c.linkId),
        expectedLinkVersionId: raw(c.expectedLinkVersionId),
        from: c.from,
        to: c.to,
        fromVersionId: c.fromVersionId,
        toVersionId: c.toVersionId,
      };
      fields = {
        kindOfRelation: c.kindOfRelation,
        reason: c.reason,
        legacyField: canonicalProgramGraphJson(c.legacyField),
        reappearanceAcknowledged: canonicalProgramGraphJson(
          c.reappearanceAcknowledged,
        ),
      };
      break;
    case "source.retire":
      kind = "retire-source";
      target = c.sourceId;
      binding = {
        sourceId: c.sourceId,
        expectedCaptureId: c.expectedCaptureId,
      };
      fields = { reason: c.reason };
      break;
    case "link.retire":
      kind = "retire-link";
      target = c.linkId;
      binding = {
        linkId: c.linkId,
        expectedLinkVersionId: c.expectedLinkVersionId,
      };
      fields = { reason: c.reason };
      break;
    case "source.rename":
      kind = "rename-source";
      target = c.sourceId;
      binding = { sourceId: c.sourceId };
      fields = { alias: c.alias };
      break;
  }
  return kind ? graphFreeze({ kind, targetId: target, binding, fields }) : null;
}
export function programGraphFormMatchesCommand(
  form: GraphDraft["form"],
  command: GraphCommand,
): boolean {
  const expected = programGraphCommandForm(command);
  return (
    form !== null &&
    expected !== null &&
    canonicalProgramGraphJson(form) === canonicalProgramGraphJson(expected)
  );
}
function clearMatchingDraft(s: ProgramGraphState, c: GraphCommand): void {
  if (programGraphFormMatchesCommand(s.draft.form, c)) {
    s.draft.form = null;
    s.draft.dirty = false;
  }
}
export async function prepareProgramGraphCommand(
  state: ProgramGraphState,
  command: GraphCommand,
  context: GraphContext,
): Promise<PreparedGraphMutation> {
  const { expectedStateHash, at, makeId, digest } = context,
    sourceJson = canonicalProgramGraphJson(state),
    stamp = commandStamp(command),
    cmd = graphClone(command);
  graphHash(expectedStateHash);
  graphInstant(at);
  if (typeof makeId !== "function") graphFail("id", "Supply an ID generator.");
  exactGraphObject(cmd, ["kind", ...commandKeys[cmd.kind]]);
  if (
    (await hashProgramGraphValue(JSON.parse(sourceJson), digest)) !==
    expectedStateHash
  )
    graphFail(
      "stale_state",
      "Read the latest whole graph before preparing this command.",
    );
  const valid = await validateProgramGraphState(JSON.parse(sourceJson));
  let s = graphClone(valid);
  const used = new Set([
    s.id,
    ...entityKeys.flatMap((k) => s[k].map((x) => x.id)),
  ]);
  const newId = () => {
    const id = makeId();
    graphId(id);
    if (used.has(id))
      graphFail("duplicate_id", "Generated entity ID was already used.");
    used.add(id);
    return id;
  };
  switch (cmd.kind) {
    case "draft.replace":
      validateDraft(cmd.draft);
      s.draft = graphClone(cmd.draft);
      break;
    case "source.capture":
      s = await applyProgramCapture(s, cmd.preview, cmd.selection, {
        at,
        makeId: newId,
        digest,
      });
      break;
    case "source.rename": {
      graphId(cmd.sourceId);
      graphText(cmd.alias, 160);
      must(s.sources.find((x) => x.id === cmd.sourceId)).alias = cmd.alias;
      break;
    }
    case "source.retire": {
      graphId(cmd.sourceId);
      graphId(cmd.expectedCaptureId);
      graphText(cmd.reason, 2000);
      const source = must(s.sources.find((x) => x.id === cmd.sourceId));
      if (source.currentCaptureId !== cmd.expectedCaptureId)
        graphFail("stale_capture", "The named source capture changed.");
      if (source.retirement?.reason !== cmd.reason)
        source.retirement = {
          at,
          reason: cmd.reason,
          captureId: source.currentCaptureId,
        };
      break;
    }
    case "link.review": {
      nullableId(cmd.linkId);
      nullableId(cmd.expectedLinkVersionId);
      graphId(cmd.from);
      graphId(cmd.to);
      graphId(cmd.fromVersionId);
      graphId(cmd.toVersionId);
      graphText(cmd.reason, 2000);
      choice(cmd.kindOfRelation, relations);
      array(cmd.reappearanceAcknowledged, 2);
      for (const id of cmd.reappearanceAcknowledged) graphId(id);
      sortedUnique(cmd.reappearanceAcknowledged);
      const existing =
          cmd.linkId === null
            ? null
            : must(s.links.find((x) => x.id === cmd.linkId)),
        prev = existing
          ? must(s.linkVersions.find((x) => x.id === existing.currentVersionId))
          : undefined;
      if (
        (cmd.linkId === null) !== (cmd.expectedLinkVersionId === null) ||
        cmd.expectedLinkVersionId !== (prev?.id ?? null)
      )
        graphFail("stale_link", "The exact relationship version changed.");
      if (
        existing &&
        (existing.from !== cmd.from ||
          existing.to !== cmd.to ||
          existing.kind !== cmd.kindOfRelation)
      )
        graphFail(
          "link_identity",
          "Relationship endpoints and kind are immutable; retire and create a different link.",
        );
      if (cmd.from === cmd.to)
        graphFail("self_link", "A node cannot link to itself.");
      if (cmd.kindOfRelation === "related-to" && cmd.from >= cmd.to)
        graphFail(
          "link_order",
          "Review symmetric endpoints in canonical ID order.",
        );
      const from = must(s.nodeVersions.find((x) => x.id === cmd.fromVersionId)),
        to = must(s.nodeVersions.find((x) => x.id === cmd.toVersionId));
      for (const [id, v] of [
        [cmd.from, from],
        [cmd.to, to],
      ] as const) {
        const n = must(s.nodes.find((x) => x.id === id)),
          source = must(s.sources.find((x) => x.id === n.sourceId));
        if (
          v.nodeId !== id ||
          n.currentVersionId !== v.id ||
          v.presence !== "present" ||
          source.retirement !== null
        )
          graphFail(
            "endpoint",
            "Review requires both exact current present endpoints from active sources.",
          );
      }
      legacyCheck(s, cmd.legacyField, from, to);
      const same =
        prev?.action === "review" &&
        prev.fromVersionId === from.id &&
        prev.toVersionId === to.id &&
        prev.reason === cmd.reason &&
        canonicalProgramGraphJson(prev.legacyField) ===
          canonicalProgramGraphJson(cmd.legacyField) &&
        canonicalProgramGraphJson(prev.reappearanceAcknowledged) ===
          canonicalProgramGraphJson(cmd.reappearanceAcknowledged);
      if (same) break;
      if (
        canonicalProgramGraphJson(reappearanceIds(s, from, to, prev)) !==
        canonicalProgramGraphJson(cmd.reappearanceAcknowledged)
      )
        graphFail(
          "reappearance",
          "Acknowledge exactly the endpoints crossing missing/reappearance history.",
        );
      const l = existing ?? {
        id: newId(),
        from: cmd.from,
        to: cmd.to,
        kind: cmd.kindOfRelation,
        currentVersionId: "",
      };
      roleCheck(s, l);
      const v = addHash({
        id: newId(),
        linkId: l.id,
        version: (prev?.version ?? 0) + 1,
        previousId: prev?.id ?? null,
        recordedAt: at,
        action: "review" as const,
        fromVersionId: from.id,
        toVersionId: to.id,
        reason: cmd.reason,
        legacyField: graphClone(cmd.legacyField),
        reappearanceAcknowledged: [...cmd.reappearanceAcknowledged],
      });
      if (!existing) s.links.push(l);
      s.linkVersions.push(v);
      l.currentVersionId = v.id;
      break;
    }
    case "link.retire": {
      graphId(cmd.linkId);
      graphId(cmd.expectedLinkVersionId);
      graphText(cmd.reason, 2000);
      const link = must(s.links.find((x) => x.id === cmd.linkId)),
        prev = must(s.linkVersions.find((x) => x.id === link.currentVersionId));
      if (prev.id !== cmd.expectedLinkVersionId)
        graphFail("stale_link", "The exact relationship version changed.");
      if (prev.action === "retire") {
        if (prev.reason === cmd.reason) break;
        graphFail(
          "retired",
          "Review the retired link to reopen it before another retirement.",
        );
      }
      const v = addHash({
        ...prev,
        id: newId(),
        version: prev.version + 1,
        previousId: prev.id,
        recordedAt: at,
        action: "retire" as const,
        reason: cmd.reason,
      });
      v.hash = graphEntryHash(v);
      s.linkVersions.push(v);
      link.currentVersionId = v.id;
      break;
    }
  }
  const noOp = canonicalProgramGraphJson(s) === sourceJson;
  if (!noOp) {
    s.revision = valid.revision + 1;
    s.updatedAt = at;
    if (cmd.kind !== "draft.replace") clearMatchingDraft(s, cmd);
  }
  const next = await validateProgramGraphState(s),
    nextStateHash = await hashProgramGraphValue(next, digest),
    commandHash = await hashProgramGraphValue(JSON.parse(stamp), digest);
  if (
    canonicalProgramGraphJson(state) !== sourceJson ||
    commandStamp(command) !== stamp ||
    context.expectedStateHash !== expectedStateHash ||
    context.at !== at ||
    context.makeId !== makeId ||
    context.digest !== digest
  )
    graphFail(
      "input_changed",
      "Command, context or graph changed while preparing; review it again.",
    );
  return graphFreeze({
    format: "charitology-program-graph-mutation",
    version: 1,
    expectedStateHash,
    expectedRevision: valid.revision,
    nextStateHash,
    nextState: next,
    commandHash,
    noOp,
    summary: {
      kind: cmd.kind,
      message: noOp
        ? "No graph changes; pending input remains available."
        : "Local snapshot/relationship change prepared; no source workspace or outside authority changed.",
    },
  });
}

export function programGraphLinkState(
  s: ProgramGraphState,
  linkId: Id,
): { state: LinkState; reasons: string[]; fromVersionId: Id; toVersionId: Id } {
  const l = must(s.links.find((x) => x.id === linkId)),
    v = must(s.linkVersions.find((x) => x.id === l.currentVersionId)),
    from = must(s.nodes.find((x) => x.id === l.from)),
    to = must(s.nodes.find((x) => x.id === l.to));
  const ends = [from, to],
    missing = ends.some(
      (n) =>
        must(s.nodeVersions.find((x) => x.id === n.currentVersionId))
          .presence === "missing",
    ),
    retired = ends.some(
      (n) =>
        must(s.sources.find((x) => x.id === n.sourceId)).retirement !== null,
    );
  const state: LinkState =
    v.action === "retire"
      ? "retired"
      : missing || retired
        ? "unresolved"
        : v.fromVersionId !== from.currentVersionId ||
            v.toVersionId !== to.currentVersionId
          ? "stale"
          : "current";
  const reasons =
    state === "retired"
      ? ["The relationship was deliberately retired; its history remains."]
      : state === "unresolved"
        ? [
            ...(missing
              ? [
                  "An endpoint is not present in its latest complete chosen capture.",
                ]
              : []),
            ...(retired ? ["An endpoint source is retired."] : []),
          ]
        : state === "stale"
          ? [
              "A captured endpoint or its source context changed since this link was reviewed.",
            ]
          : [
              "Both reviewed endpoint versions match their latest accepted active-source capture; this is a self-recorded planning link.",
            ];
  return graphFreeze({
    state,
    reasons,
    fromVersionId: v.fromVersionId,
    toVersionId: v.toVersionId,
  });
}
export function programGraphNodeView(
  s: ProgramGraphState,
  nodeId: Id,
): {
  node: GraphNode;
  source: SourceInstance;
  current: NodeVersion;
  lastPresent: NodeVersion;
  history: NodeVersion[];
  incoming: Id[];
  outgoing: Id[];
} {
  const node = must(s.nodes.find((x) => x.id === nodeId)),
    history = s.nodeVersions.filter((x) => x.nodeId === nodeId),
    current = must(history.find((x) => x.id === node.currentVersionId)),
    lastPresent = must(
      [...history].reverse().find((x) => x.presence === "present"),
    );
  return graphFreeze(
    graphClone({
      node,
      source: must(s.sources.find((x) => x.id === node.sourceId)),
      current,
      lastPresent,
      history,
      incoming: s.links
        .filter(
          (x) =>
            x.to === nodeId || (x.kind === "related-to" && x.from === nodeId),
        )
        .map((x) => x.id)
        .sort(),
      outgoing: s.links
        .filter(
          (x) =>
            x.from === nodeId || (x.kind === "related-to" && x.to === nodeId),
        )
        .map((x) => x.id)
        .sort(),
    }),
  );
}
export function programGraphCounts(s: ProgramGraphState): {
  sources: number;
  nodes: number;
  present: number;
  missing: number;
  links: number;
  current: number;
  stale: number;
  unresolved: number;
  retired: number;
} {
  const counts = {
    sources: s.sources.length,
    nodes: s.nodes.length,
    present: 0,
    missing: 0,
    links: s.links.length,
    current: 0,
    stale: 0,
    unresolved: 0,
    retired: 0,
  };
  for (const n of s.nodes)
    counts[
      must(s.nodeVersions.find((x) => x.id === n.currentVersionId)).presence
    ]++;
  for (const l of s.links) counts[programGraphLinkState(s, l.id).state]++;
  return graphFreeze(counts);
}
export async function makeProgramGraphBackup(
  state: ProgramGraphState,
  exportedAt: Instant,
): Promise<string> {
  graphInstant(exportedAt);
  const valid = await validateProgramGraphState(state);
  graphBackupBytes(valid, exportedAt);
  return backupText(valid, exportedAt);
}
export async function parseProgramGraphBackup(
  raw: string | Uint8Array,
): Promise<ProgramGraphState> {
  const byteStamp =
      typeof raw === "string"
        ? raw
        : bytesToHex(
            sha256(admittedBytes(raw, PROGRAM_GRAPH_LIMITS.backupBytes)),
          ),
    data = strictProgramGraphJson(raw, PROGRAM_GRAPH_LIMITS.backupBytes);
  exactGraphObject(data, [
    "format",
    "version",
    "exportedAt",
    "state",
    "checksum",
  ]);
  if (data.format !== "charitology-program-graph-backup" || data.version !== 1)
    graphFail(
      "version",
      "Choose an exact version 1 graph backup, not a partner source file.",
    );
  graphInstant(data.exportedAt);
  graphHash(data.checksum);
  const { checksum, ...body } = data;
  if (hashProgramGraphSync(body) !== checksum)
    graphFail(
      "backup_hash",
      "Backup checksum does not match its complete contents.",
    );
  const result = await validateProgramGraphState(data.state);
  if (
    typeof raw !== "string" &&
    bytesToHex(sha256(admittedBytes(raw, PROGRAM_GRAPH_LIMITS.backupBytes))) !==
      byteStamp
  )
    graphFail("input_changed", "Backup bytes changed while validating.");
  return result;
}
const formulaSafe = (v: unknown): string => {
  let t = v === null || v === undefined ? "" : String(v);
  if (
    typeof v !== "number" &&
    (/^[\s\u0000-\u001f]*[=+@-]/.test(t) || /^[\t\r\n]/.test(t))
  )
    t = "'" + t;
  return '"' + t.replace(/"/g, '""') + '"';
};
function markdownFence(json: string): string {
  let width = 3;
  for (const match of json.matchAll(/`+/g))
    width = Math.max(width, match[0].length + 1);
  return "`".repeat(width);
}
export async function programGraphPacket(
  state: ProgramGraphState,
  selection: { nodeIds: Id[]; linkIds: Id[] },
): Promise<{
  selectionHash: Hash;
  csv: string;
  markdown: string;
  omissions: string[];
}> {
  const stateJson = canonicalProgramGraphJson(state),
    selectionJson = canonicalProgramGraphJson(selection),
    chosen = JSON.parse(selectionJson) as typeof selection,
    s = await validateProgramGraphState(state);
  exactGraphObject(chosen, ["nodeIds", "linkIds"]);
  array(chosen.nodeIds, 500);
  array(chosen.linkIds, 500);
  for (const id of [...chosen.nodeIds, ...chosen.linkIds]) graphId(id);
  sortedUnique(chosen.nodeIds);
  sortedUnique(chosen.linkIds);
  const selectedLinks = chosen.linkIds.map((id) =>
      must(s.links.find((x) => x.id === id)),
    ),
    nodeIds = new Set([
      ...chosen.nodeIds,
      ...selectedLinks.flatMap((l) => [l.from, l.to]),
    ]);
  for (const id of nodeIds) must(s.nodes.find((x) => x.id === id));
  const selectedNodes = s.nodes.filter((n) => nodeIds.has(n.id)),
    linkVersions = s.linkVersions.filter((v) =>
      chosen.linkIds.includes(v.linkId),
    ),
    versionIds = new Set([
      ...selectedNodes.flatMap((n) => {
        const view = programGraphNodeView(s, n.id);
        return [view.current.id, view.lastPresent.id];
      }),
      ...linkVersions.flatMap((v) => [v.fromVersionId, v.toVersionId]),
    ]),
    nodeVersions = s.nodeVersions.filter((v) => versionIds.has(v.id)),
    sourceIds = new Set(selectedNodes.map((n) => n.sourceId)),
    captureIds = new Set([
      ...nodeVersions.map((v) => v.captureId),
      ...s.sources
        .filter((x) => sourceIds.has(x.id))
        .map((x) => x.currentCaptureId),
    ]);
  const captures = s.captures
    .filter((c) => captureIds.has(c.id))
    .map(({ inventory, nodeVersions, ...capture }) => ({
      ...capture,
      assertions: nodeVersions
        .filter((ref) => nodeIds.has(ref.nodeId))
        .map((ref) => {
          const n = must(s.nodes.find((x) => x.id === ref.nodeId)),
            v = must(s.nodeVersions.find((x) => x.id === ref.versionId));
          return {
            nodeId: n.id,
            collection: n.collection,
            recordId: n.recordId,
            presence: v.presence,
          };
        }),
    }));
  const omissions = [
    `${s.nodes.length - selectedNodes.length} graph nodes and ${s.links.length - selectedLinks.length} relationships omitted.`,
    "Unselected partner values and original source bytes are not stored in this graph and are not included.",
    "Unrelated inventory IDs and saved raw form are omitted. Selected source context may contain additional user-entered text.",
    "Historical endpoint versions included only to explain the selected nodes and relationship history. Absence and identity are self-recorded assertions, not independently proved facts.",
    "This selected packet cannot restore the complete graph; use the separately labeled full JSON backup.",
  ];
  const payload = {
      format: "charitology-program-graph-packet",
      version: 1,
      stateId: s.id,
      selection: chosen,
      nodes: selectedNodes,
      nodeVersions,
      links: selectedLinks,
      linkVersions,
      linkStates: selectedLinks.map((l) => ({
        linkId: l.id,
        ...programGraphLinkState(s, l.id),
      })),
      sources: s.sources.filter((x) => sourceIds.has(x.id)),
      captures,
      omissions,
    },
    selectionHash = await hashProgramGraphValue(payload);
  const headers = [
      "rowType",
      "id",
      "nodeId",
      "linkId",
      "sourceId",
      "collection",
      "sourceRecordId",
      "version",
      "presence",
      "state",
      "hash",
      "reason",
      "from",
      "to",
      "fromVersionId",
      "toVersionId",
      "values",
      "context",
      "provenance",
    ],
    rows: Record<string, unknown>[] = [
      {
        rowType: "metadata",
        id: selectionHash,
        provenance: canonicalProgramGraphJson({ selection: chosen, omissions }),
      },
      ...selectedNodes.map((n) => ({
        rowType: "node",
        id: n.id,
        sourceId: n.sourceId,
        collection: n.collection,
        sourceRecordId: n.recordId,
        provenance: canonicalProgramGraphJson({
          currentVersionId: n.currentVersionId,
          firstCaptureId: n.firstCaptureId,
        }),
      })),
      ...nodeVersions.map((v) => ({
        rowType: "node-version",
        id: v.id,
        nodeId: v.nodeId,
        version: v.version,
        presence: v.presence,
        hash: v.hash,
        values: canonicalProgramGraphJson(v.values),
        provenance: canonicalProgramGraphJson({
          captureId: v.captureId,
          previousId: v.previousId,
          contextHash: v.contextHash,
          reappeared: v.reappeared,
        }),
      })),
      ...linkVersions.map((v) => {
        const l = must(selectedLinks.find((x) => x.id === v.linkId));
        return {
          rowType: "link-version",
          id: v.id,
          linkId: v.linkId,
          version: v.version,
          state: programGraphLinkState(s, l.id).state,
          hash: v.hash,
          reason: v.reason,
          from: l.from,
          to: l.to,
          fromVersionId: v.fromVersionId,
          toVersionId: v.toVersionId,
          provenance: canonicalProgramGraphJson({
            action: v.action,
            legacyField: v.legacyField,
            reappearanceAcknowledged: v.reappearanceAcknowledged,
          }),
        };
      }),
      ...captures.map((c) => ({
        rowType: "capture",
        id: c.id,
        sourceId: c.sourceId,
        hash: c.hash,
        context: canonicalProgramGraphJson(c.context),
        provenance: canonicalProgramGraphJson(c),
      })),
      ...payload.sources.map((source) => ({
        rowType: "source",
        id: source.id,
        values: source.alias,
        provenance: canonicalProgramGraphJson(source),
      })),
    ];
  const csv =
      [
        headers.map(formulaSafe).join(","),
        ...rows.map((row) => headers.map((k) => formulaSafe(row[k])).join(",")),
      ].join("\r\n") + "\r\n",
    json = JSON.stringify({ ...payload, selectionHash }, null, 2),
    fence = markdownFence(json),
    markdown = `# Selected local program graph packet\n\nSelection checksum: ${selectionHash}\n\n${omissions.map((x) => "- " + x).join("\n")}\n\n${fence}json\n${json}\n${fence}\n`;
  if (
    canonicalProgramGraphJson(state) !== stateJson ||
    canonicalProgramGraphJson(selection) !== selectionJson
  )
    graphFail(
      "input_changed",
      "Packet selection or graph changed during export.",
    );
  return graphFreeze({ selectionHash, csv, markdown, omissions });
}
