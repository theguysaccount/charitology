/** Browser-private proposals. Known public roots are evidence pins, never local review authority. */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type {
  Hash,
  Id,
  Instant,
  Day,
  Family,
  Pin,
  Source,
  Member,
  Edition,
  ProposalState,
  ProposalDraft,
  ProposalVersion,
  ProposalCommand,
  ProposalCatalog,
  ProposalDigest,
  ProposalModelContext,
  PreparedProposalMutation,
  ProposalPacketOptions,
  ProposalBasisInput,
  PublicationBlock,
} from "../publication-editions-types";
export type * from "../publication-editions-types";
export const PUBLICATION_PROPOSAL_LIMITS = Object.freeze({
  backupBytes: 2_097_152,
  jsonDepth: 32,
  draftBytes: 524_288,
  draftFieldChars: 65_536,
  bases: 20,
  sources: 1000,
  proposals: 20,
  versions: 100,
  selectedMembers: 100,
});
export class PublicationProposalError extends Error {
  constructor(
    public code: string,
    message: string,
    public path = "",
  ) {
    super(message);
    this.name = "PublicationProposalError";
  }
}
export function proposalFail(code: string, message: string, path = ""): never {
  throw new PublicationProposalError(code, message, path);
}
function fail(code: string, message: string, path = ""): never {
  return proposalFail(code, message, path);
}
const encoder = new TextEncoder(),
  reserved = new Set(["__proto__", "constructor", "prototype"]);
const plain = (v: unknown): v is Record<string, any> =>
  !!v &&
  typeof v === "object" &&
  (Object.getPrototypeOf(v) === Object.prototype ||
    Object.getPrototypeOf(v) === null);
function integer(
  v: unknown,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): asserts v is number {
  if (!Number.isSafeInteger(v) || Number(v) < min || Number(v) > max)
    fail("integer", "Use a bounded safe integer.");
}
export function canonicalPublicationProposalJson(value: unknown): string {
  const seen = new Set<object>();
  const walk = (v: unknown, depth: number): unknown => {
    if (v === null || typeof v === "string" || typeof v === "boolean") return v;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) fail("json", "Use finite JSON numbers.");
      return v;
    }
    if (
      typeof v !== "object" ||
      !v ||
      depth > PUBLICATION_PROPOSAL_LIMITS.jsonDepth ||
      seen.has(v)
    )
      fail("json", "Use bounded acyclic plain JSON.");
    if (Object.getOwnPropertySymbols(v).length)
      fail("json", "Symbol-decorated data is unsupported.");
    seen.add(v);
    let out: unknown;
    if (Array.isArray(v)) {
      if (
        Object.getPrototypeOf(v) !== Array.prototype ||
        Object.keys(v).length !== v.length ||
        Object.getOwnPropertyNames(v).length !== v.length + 1
      )
        fail("json", "Sparse or decorated arrays are unsupported.");
      const result: unknown[] = [];
      for (let i = 0; i < v.length; i++) {
        const d = Object.getOwnPropertyDescriptor(v, String(i));
        if (!d || !Object.hasOwn(d, "value"))
          fail("json", "Array accessors are unsupported.");
        result.push(walk(d.value, depth + 1));
      }
      out = result;
    } else {
      if (
        !plain(v) ||
        Object.getOwnPropertyNames(v).length !== Object.keys(v).length
      )
        fail("json", "Use plain enumerable JSON objects.");
      out = Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => {
            if (reserved.has(k)) fail("key", "Reserved object key.");
            const d = Object.getOwnPropertyDescriptor(v, k)!;
            if (!Object.hasOwn(d, "value"))
              fail("json", "JSON accessors are unsupported.");
            return [k, walk(d.value, depth + 1)];
          }),
      );
    }
    seen.delete(v);
    return out;
  };
  return JSON.stringify(walk(value, 1));
}
export const hashPublicationProposalSync = (value: unknown): Hash =>
  bytesToHex(sha256(encoder.encode(canonicalPublicationProposalJson(value))));
const rawHash = (bytes: Uint8Array): Hash => bytesToHex(sha256(bytes));
const nativeLength = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  "byteLength",
)!.get!;
function ownedBytes(raw: unknown, max: number): Uint8Array {
  if (!(raw instanceof Uint8Array))
    fail("bytes", "Choose a UTF-8 byte sequence.");
  let n: number;
  try {
    n = nativeLength.call(raw);
  } catch {
    fail("bytes", "Source bytes are unavailable.");
  }
  if (n > max) fail("byte_limit", `Use at most ${max} actual UTF-8 bytes.`);
  try {
    const copy = new Uint8Array(n);
    Uint8Array.prototype.set.call(copy, raw);
    return copy;
  } catch {
    fail("bytes", "Source bytes are unavailable.");
  }
}
function rawBytes(raw: string | Uint8Array, max: number): Uint8Array {
  if (typeof raw !== "string") return ownedBytes(raw, max);
  if (raw.length > max) fail("byte_limit", `Use at most ${max} UTF-8 bytes.`);
  const bytes = encoder.encode(raw);
  if (bytes.length > max) fail("byte_limit", `Use at most ${max} UTF-8 bytes.`);
  if (
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) !==
    raw
  )
    fail(
      "utf8",
      "JSON text must be representable as UTF-8 without replacing raw surrogate code units.",
    );
  return bytes;
}
export function strictPublicationProposalJson(
  raw: string | Uint8Array,
  maxBytes: number,
): unknown {
  integer(maxBytes, 1, PUBLICATION_PROPOSAL_LIMITS.backupBytes);
  const bytes = rawBytes(raw, maxBytes);
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    fail(
      "utf8",
      "Choose valid UTF-8 JSON; retain the original bytes for recovery.",
    );
  }
  if (typeof raw === "string" && source !== raw)
    fail("utf8", "JSON text must be representable as UTF-8.");
  if (source.startsWith("\uFEFF")) source = source.slice(1);
  const stack: { object: boolean; keys: Set<string>; key: boolean }[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"') {
      const start = i++;
      let closed = false;
      while (i < source.length) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i++] === '"') {
          closed = true;
          break;
        }
      }
      if (!closed) fail("json", "JSON has an unfinished string.");
      const top = stack.at(-1);
      if (top?.object && top.key) {
        let k: unknown;
        try {
          k = JSON.parse(source.slice(start, i));
        } catch {
          fail("json", "JSON key is invalid.");
        }
        if (typeof k !== "string") fail("json", "Use string keys.");
        if (top.keys.has(k))
          fail("duplicate_key", "JSON repeats a key after escape decoding.");
        top.keys.add(k);
        top.key = false;
      }
      continue;
    }
    if (ch === "{" || ch === "[") {
      if (stack.length >= PUBLICATION_PROPOSAL_LIMITS.jsonDepth)
        fail("depth", "JSON container depth exceeds 32.");
      stack.push({ object: ch === "{", keys: new Set(), key: ch === "{" });
    } else if (ch === "}" || ch === "]") {
      const top = stack.pop();
      if (!top || top.object !== (ch === "}"))
        fail("json", "JSON container boundaries do not match.");
    } else if (ch === ",") {
      const top = stack.at(-1);
      if (top?.object) top.key = true;
    }
    i++;
  }
  if (stack.length) fail("json", "JSON has an unfinished container.");
  try {
    const parsed = JSON.parse(source);
    canonicalPublicationProposalJson(parsed);
    return parsed;
  } catch {
    fail("json", "Choose complete JSON without comments or trailing content.");
  }
}
function exact(v: unknown, keys: string[]): asserts v is Record<string, any> {
  if (
    !plain(v) ||
    Object.keys(v).sort().join("|") !== [...keys].sort().join("|")
  )
    fail("shape", "Use the exact documented fields.");
}
function text(v: unknown, max: number, empty = false): asserts v is string {
  if (typeof v !== "string" || v.length > max || (!empty && !v.length))
    fail("text", "Use bounded text.");
}
function id(v: unknown): asserts v is Id {
  if (typeof v !== "string" || !/^[a-z][a-z0-9-]{0,79}$/.test(v))
    fail("id", "Use an exact publication ID.");
}
function hash(v: unknown): asserts v is Hash {
  if (typeof v !== "string" || !/^[0-9a-f]{64}$/.test(v))
    fail("hash", "Use an exact SHA-256 hash.");
}
function instant(v: unknown): asserts v is Instant {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString() !== v ||
    Number(v.slice(0, 4)) < 1900 ||
    Number(v.slice(0, 4)) > 2200
  )
    fail("instant", "Use a real canonical UTC instant.");
}
function day(v: unknown): asserts v is Day {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d\d-\d\d$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v + "T12:00:00Z").toISOString().slice(0, 10) !== v
  )
    fail("day", "Use a real calendar day.");
}
function arr(v: unknown, max: number): asserts v is any[] {
  if (!Array.isArray(v) || v.length > max)
    fail("limit", "Collection exceeds its bounded limit.");
}
function choice(v: unknown, values: readonly unknown[]) {
  if (!values.includes(v)) fail("choice", "Choose a documented value.");
}
const families: Family[] = [
  "state-of-charity",
  "progress-report",
  "principles",
  "journal",
  "letter",
];
const tabs = ["proposals", "sources", "preview", "exports", "recovery"];
const clone = <T>(v: T): T => JSON.parse(canonicalPublicationProposalJson(v));
export function freezePublicationProposal<T>(v: T): T {
  if (v && typeof v === "object") {
    for (const child of Object.values(v)) freezePublicationProposal(child);
    Object.freeze(v);
  }
  return v;
}
const same = (a: unknown, b: unknown) =>
  canonicalPublicationProposalJson(a) === canonicalPublicationProposalJson(b);
const withoutHash = (v: Record<string, any>) =>
  Object.fromEntries(Object.entries(v).filter(([k]) => k !== "hash"));
function hashed(v: Record<string, any>) {
  hash(v.hash);
  if (hashPublicationProposalSync(withoutHash(v)) !== v.hash)
    fail("object_hash", "An object differs from its pinned contents.");
}
function nullableText(v: unknown, max: number) {
  if (v !== null) text(v, max);
}
function strings(v: unknown, maxItems = 100, maxChars = 5000) {
  arr(v, maxItems);
  v.forEach((x) => text(x, maxChars));
}
function pins(v: unknown, max = 1000): asserts v is Pin[] {
  arr(v, max);
  let before = "";
  for (const p of v) {
    exact(p, ["id", "hash"]);
    id(p.id);
    hash(p.hash);
    if (p.id <= before) fail("pin_order", "Pins must be sorted and unique.");
    before = p.id;
  }
}
function url(v: unknown, max = 500, httpsOnly = false) {
  text(v, max);
  if (/[\u0000-\u0020\u007f\\]/.test(v))
    fail(
      "url",
      "Use a public URL without literal controls, spaces or backslashes.",
    );
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    fail("url", "Use an explicit source URL.");
  }
  if (
    !["https:", ...(httpsOnly ? [] : ["http:"])].includes(u.protocol) ||
    u.username ||
    u.password
  )
    fail("url", "Use a safe public URL without credentials.");
}
function citations(v: unknown) {
  arr(v, 1000);
  for (const c of v) {
    exact(c, ["title", "url", "publisher", "year", "note"]);
    text(c.title, 500);
    url(c.url, 2000);
    nullableText(c.publisher, 500);
    if (c.year !== null) integer(c.year, 1, 9999);
    nullableText(c.note, 5000);
  }
}
function qualification(v: unknown) {
  exact(v, [
    "recordId",
    "version",
    "subjectHash",
    "ledgerEditionId",
    "ledgerEditionHash",
  ]);
  text(v.recordId, 200);
  integer(v.version, 1);
  hash(v.subjectHash);
  text(v.ledgerEditionId, 200);
  hash(v.ledgerEditionHash);
}
function blocks(v: unknown): asserts v is PublicationBlock[] {
  arr(v, 100);
  for (const b of v) {
    if (!plain(b)) fail("block", "Use an authored plain block.");
    switch (b.kind) {
      case "heading":
      case "paragraph":
        exact(b, ["kind", "text"]);
        text(b.text, 5000);
        break;
      case "list":
        exact(b, ["kind", "items"]);
        strings(b.items, 20);
        break;
      case "links":
        exact(b, ["kind", "items"]);
        arr(b.items, 20);
        for (const l of b.items) {
          exact(l, ["label", "url"]);
          text(l.label, 180);
          url(l.url, 500, true);
        }
        break;
      default:
        fail("block", "Use a documented authored block.");
    }
  }
  if (canonicalPublicationProposalJson(v).length > 65536)
    fail("blocks_limit", "Complete authored blocks exceed 65,536 characters.");
}
function payload(v: unknown) {
  if (!plain(v)) fail("payload", "Use a known public member payload.");
  switch (v.kind) {
    case "figure-input-v1":
      exact(v, [
        "kind",
        "key",
        "label",
        "value",
        "unit",
        "currency",
        "geography",
        "sourcePeriodLabel",
        "measure",
        "denominator",
        "sources",
        "limitations",
      ]);
      for (const k of ["key", "label", "unit", "geography"]) text(v[k], 500);
      for (const k of ["value", "currency", "sourcePeriodLabel", "denominator"])
        nullableText(v[k], 5000);
      choice(v.measure, [
        "stock",
        "flow",
        "count",
        "ratio",
        "source-description",
      ]);
      citations(v.sources);
      strings(v.limitations);
      break;
    case "project-census-v1":
      exact(v, [
        "kind",
        "collections",
        "evidence",
        "availability",
        "declaredProblemStatuses",
        "problemStates",
      ]);
      for (const [key, fields] of [
        ["collections", ["collection", "entries", "drafts"]],
        ["evidence", ["code", "label", "count"]],
        ["availability", ["status", "count"]],
        ["declaredProblemStatuses", ["status", "count"]],
      ] as const) {
        arr(v[key], 1000);
        for (const row of v[key]) {
          exact(row, [...fields]);
          for (const k of fields) {
            if (["entries", "drafts", "count"].includes(k)) integer(row[k]);
            else text(row[k], 500);
          }
        }
      }
      exact(v.problemStates, [
        "basis",
        "ledgerEditionId",
        "ledgerEditionHash",
        "counts",
      ]);
      choice(v.problemStates.basis, ["pinned-r4-projection"]);
      text(v.problemStates.ledgerEditionId, 200);
      hash(v.problemStates.ledgerEditionHash);
      arr(v.problemStates.counts, 100);
      for (const r of v.problemStates.counts) {
        exact(r, ["state", "count"]);
        text(r.state, 200);
        integer(r.count);
      }
      break;
    case "chapter-v1":
      exact(v, [
        "kind",
        "chapter",
        "title",
        "summary",
        "body",
        "sources",
        "declaredReview",
        "qualification",
        "license",
      ]);
      integer(v.chapter, 1, 10);
      text(v.title, 500);
      text(v.summary, 5000, true);
      text(v.body, 2_097_152, true);
      citations(v.sources);
      choice(v.declaredReview, ["draft", "reviewed"]);
      if (v.qualification !== null) qualification(v.qualification);
      choice(v.license, ["CC BY 4.0"]);
      break;
    case "manuscript-v1":
      exact(v, [
        "kind",
        "title",
        "summary",
        "body",
        "attribution",
        "declaredDate",
        "volume",
        "issue",
        "sources",
        "declaredReview",
        "qualification",
      ]);
      text(v.title, 500);
      text(v.summary, 5000, true);
      text(v.body, 2_097_152, true);
      text(v.attribution, 5000);
      day(v.declaredDate);
      integer(v.volume);
      integer(v.issue);
      citations(v.sources);
      choice(v.declaredReview, ["draft", "reviewed"]);
      qualification(v.qualification);
      break;
    case "r4-progress-v1":
      exact(v, [
        "kind",
        "ledgerEditionId",
        "ledgerEditionHash",
        "from",
        "to",
        "progressJson",
        "progressSha256",
      ]);
      text(v.ledgerEditionId, 200);
      hash(v.ledgerEditionHash);
      instant(v.from);
      instant(v.to);
      if (v.to < v.from) fail("period", "Progress period is reversed.");
      text(v.progressJson, 2_097_152);
      strictPublicationProposalJson(v.progressJson, 2_097_152);
      hash(v.progressSha256);
      if (rawHash(encoder.encode(v.progressJson)) !== v.progressSha256)
        fail("progress_hash", "Pinned progress bytes differ.");
      break;
    case "authored-letter-v1":
      exact(v, [
        "kind",
        "title",
        "summary",
        "blocks",
        "sources",
        "publicByline",
        "aiAssistance",
        "declaredDate",
      ]);
      text(v.title, 500);
      text(v.summary, 5000, true);
      blocks(v.blocks);
      citations(v.sources);
      text(v.publicByline, 500);
      text(v.aiAssistance, 5000);
      day(v.declaredDate);
      break;
    case "legacy-letter-v1":
      exact(v, [
        "kind",
        "id",
        "title",
        "subject",
        "html",
        "text",
        "legacyContentHash",
      ]);
      choice(v.id, ["edition-1"]);
      text(v.title, 500);
      text(v.subject, 500);
      text(v.html, 262144);
      text(v.text, 262144);
      hash(v.legacyContentHash);
      break;
    default:
      fail("payload", "Unknown public member adapter.");
  }
}
function validateSource(v: unknown): asserts v is Source {
  exact(v, [
    "id",
    "adapterId",
    "adapterVersion",
    "commit",
    "path",
    "rawUtf8",
    "rawSha256",
    "projectionHash",
    "hash",
  ]);
  id(v.id);
  id(v.adapterId);
  choice(v.adapterVersion, [1]);
  if (typeof v.commit !== "string" || !/^[a-f0-9]{40}$/.test(v.commit))
    fail("commit", "Use an exact committed source baseline.");
  text(v.path, 500);
  if (
    v.path.startsWith("/") ||
    v.path.includes("\\") ||
    v.path.split("/").some((x: string) => !x || x === "." || x === "..") ||
    /[\u0000-\u001f\u007f]/.test(v.path)
  )
    fail("source_path", "Unsafe source path.");
  text(v.rawUtf8, 2_097_152, true);
  const bytes = rawBytes(v.rawUtf8, 2_097_152);
  hash(v.rawSha256);
  hash(v.projectionHash);
  if (rawHash(bytes) !== v.rawSha256)
    fail("source_raw_hash", "Raw source bytes differ.");
  hashed(v);
  if (encoder.encode(JSON.stringify(v, null, 2) + "\n").length > 2_097_152)
    fail("byte_limit", "Source snapshot exceeds its size bound.");
}
function validateEdition(v: unknown): asserts v is Edition {
  exact(v, [
    "format",
    "schemaVersion",
    "core",
    "coreHash",
    "artifacts",
    "hash",
  ]);
  choice(v.format, ["charitology-publication-edition"]);
  choice(v.schemaVersion, [1]);
  const c = v.core;
  exact(c, [
    "format",
    "schemaVersion",
    "id",
    "family",
    "sequence",
    "title",
    "declaredPublicationDate",
    "sourceLabel",
    "provenance",
    "capturedAt",
    "sourceCommit",
    "method",
    "coverage",
    "sourcePins",
    "members",
    "editorial",
    "r4",
    "legacyMail",
    "supersedes",
    "correction",
  ]);
  choice(c.format, ["charitology-publication-edition-core"]);
  choice(c.schemaVersion, [1]);
  id(c.id);
  choice(c.family, families);
  integer(c.sequence, 1, 100);
  text(c.title, 500);
  if (c.declaredPublicationDate !== null) day(c.declaredPublicationDate);
  nullableText(c.sourceLabel, 500);
  choice(c.provenance, [
    "new-source-capture",
    "preserved-artifact",
    "reconstruction",
  ]);
  instant(c.capturedAt);
  if (
    typeof c.sourceCommit !== "string" ||
    !/^[a-f0-9]{40}$/.test(c.sourceCommit)
  )
    fail("commit", "Use an exact committed edition source.");
  exact(c.method, ["id", "version", "definitionHash"]);
  id(c.method.id);
  choice(c.method.version, [1]);
  hash(c.method.definitionHash);
  exact(c.coverage, [
    "scope",
    "geography",
    "period",
    "completeness",
    "limitations",
  ]);
  text(c.coverage.scope, 5000);
  text(c.coverage.geography, 500);
  choice(c.coverage.completeness, ["declared-scope-only"]);
  strings(c.coverage.limitations);
  if (c.coverage.period !== null) {
    exact(c.coverage.period, ["from", "to", "convention"]);
    text(c.coverage.period.from, 100);
    text(c.coverage.period.to, 100);
    choice(c.coverage.period.convention, ["calendar-period", "utc-half-open"]);
  }
  pins(c.sourcePins);
  arr(c.members, 1000);
  const mids = new Set();
  for (const m of c.members) {
    exact(m, ["id", "kind", "sourcePins", "contentHash", "payload"]);
    id(m.id);
    if (mids.has(m.id)) fail("duplicate_member", "Member identities repeat.");
    mids.add(m.id);
    choice(m.kind, [
      "figure-input",
      "project-census",
      "chapter",
      "manuscript",
      "r4-progress",
      "authored-letter",
      "legacy-letter",
    ]);
    if (m.payload?.kind !== m.kind + "-v1")
      fail("member_kind", "Member and payload disagree.");
    pins(m.sourcePins);
    for (const p of m.sourcePins)
      if (!c.sourcePins.some((q: Pin) => same(p, q)))
        fail("member_source", "Member source not in edition closure.");
    payload(m.payload);
    hash(m.contentHash);
    if (hashPublicationProposalSync(m.payload) !== m.contentHash)
      fail("member_hash", "Member payload differs.");
  }
  exact(c.editorial, ["label", "aiAssistance", "limitations"]);
  choice(c.editorial.label, ["editorial-draft"]);
  text(c.editorial.aiAssistance, 5000);
  strings(c.editorial.limitations);
  if (c.r4 !== null) {
    exact(c.r4, [
      "editionId",
      "editionHash",
      "factualHash",
      "progressInputHash",
    ]);
    text(c.r4.editionId, 200);
    for (const k of ["editionHash", "factualHash", "progressInputHash"])
      hash(c.r4[k]);
  }
  if (c.legacyMail !== null) {
    exact(c.legacyMail, ["id", "algorithm", "contentHash"]);
    choice(c.legacyMail.id, ["edition-1"]);
    choice(c.legacyMail.algorithm, ["ordered-json-mail-v1"]);
    hash(c.legacyMail.contentHash);
  }
  if (c.supersedes !== null) id(c.supersedes);
  if (c.correction !== null) {
    exact(c.correction, ["reason", "sourceRefs"]);
    text(c.correction.reason, 5000);
    strings(c.correction.sourceRefs, 100, 500);
  }
  hash(v.coreHash);
  if (hashPublicationProposalSync(c) !== v.coreHash)
    fail("core_hash", "Edition core differs.");
  arr(v.artifacts, 100);
  const names = new Set();
  for (const a of v.artifacts) {
    exact(a, ["id", "fileName", "mediaType", "byteLength", "sha256"]);
    id(a.id);
    text(a.fileName, 100);
    if (
      !/^[a-z0-9][a-z0-9-]*\.(md|txt)$/.test(a.fileName) ||
      names.has(a.fileName)
    )
      fail("artifact_path", "Use unique inert artifact basenames.");
    names.add(a.fileName);
    choice(a.mediaType, [
      "text/markdown;charset=utf-8",
      "text/plain;charset=utf-8",
    ]);
    integer(a.byteLength, 0, 2_097_152);
    hash(a.sha256);
  }
  hashed(v);
  if (encoder.encode(JSON.stringify(v, null, 2) + "\n").length > 2_097_152)
    fail("byte_limit", "Edition exceeds its size bound.");
}
export function validateProposalCatalog(value: unknown): ProposalCatalog {
  canonicalPublicationProposalJson(value);
  exact(value, [
    "format",
    "version",
    "registryHash",
    "entries",
    "basisOffers",
    "hash",
  ]);
  choice(value.format, ["charitology-publication-proposal-catalog"]);
  choice(value.version, [1]);
  hash(value.registryHash);
  pins(value.entries, 100);
  arr(value.basisOffers, 100);
  if (value.entries.length !== value.basisOffers.length)
    fail("catalog_closure", "Catalog offers must cover exact entries.");
  for (let i = 0; i < value.entries.length; i++) {
    const e = value.entries[i],
      o = value.basisOffers[i];
    exact(o, ["editionId", "editionHash", "href", "byteLength", "sha256"]);
    if (o.editionId !== e.id || o.editionHash !== e.hash)
      fail("catalog_offer", "Offer differs from registered edition.");
    text(o.href, 500);
    if (
      !/^\/(?:[a-zA-Z0-9_-]+\/)*record\/editions\/[a-z][a-z0-9-]{0,79}\/basis\.json$/.test(
        o.href,
      ) ||
      !o.href.endsWith("/" + e.id + "/basis.json")
    )
      fail("catalog_path", "Use the fixed public basis route.");
    integer(o.byteLength, 1, 20 * 1024 * 1024);
    hash(o.sha256);
  }
  hashed(value);
  return freezePublicationProposal(clone(value) as ProposalCatalog);
}
function validateBasis(
  b: unknown,
  catalog: ProposalCatalog,
): asserts b is ProposalBasisInput {
  exact(b, ["edition", "sources"]);
  validateEdition(b.edition);
  if (
    !catalog.entries.some(
      (p) => p.id === b.edition.core.id && p.hash === b.edition.hash,
    )
  )
    fail(
      "unknown_basis",
      "This exact public edition is not offered in the known catalog.",
    );
  arr(b.sources, 1000);
  if (b.sources.length !== b.edition.core.sourcePins.length)
    fail("basis_closure", "Retain the complete edition source closure.");
  let prev = "";
  for (const s of b.sources) {
    validateSource(s);
    if (
      s.id <= prev ||
      !b.edition.core.sourcePins.some(
        (p: Pin) => p.id === s.id && p.hash === s.hash,
      )
    )
      fail("basis_closure", "Source closure differs from pinned edition.");
    prev = s.id;
  }
}
export function parsePublicationProposalBasis(
  raw: string | Uint8Array,
  catalogInput: ProposalCatalog,
): ProposalBasisInput {
  const c = validateProposalCatalog(catalogInput),
    b = strictPublicationProposalJson(
      raw,
      PUBLICATION_PROPOSAL_LIMITS.backupBytes,
    );
  exact(b, ["format", "version", "edition", "sources"]);
  choice(b.format, ["charitology-publication-proposal-basis"]);
  choice(b.version, [1]);
  const input = { edition: b.edition, sources: b.sources };
  validateBasis(input, c);
  const offer = c.basisOffers.find(
    (x) => x.editionId === input.edition.core.id,
  )!;
  const bytes = rawBytes(raw, PUBLICATION_PROPOSAL_LIMITS.backupBytes);
  if (bytes.length !== offer.byteLength || rawHash(bytes) !== offer.sha256)
    fail("basis_transport", "Selected bytes differ from the offered bundle.");
  return freezePublicationProposal(clone(input));
}
function draft(v: unknown): asserts v is ProposalDraft {
  exact(v, ["tab", "proposalId", "form", "dirty"]);
  choice(v.tab, tabs);
  if (v.proposalId !== null) id(v.proposalId);
  if (typeof v.dirty !== "boolean")
    fail("draft", "Dirty state must be explicit.");
  if (v.form !== null) {
    exact(v.form, ["kind", "targetId", "binding", "fields"]);
    choice(v.form.kind, ["basis", "proposal"]);
    if (v.form.targetId !== null) id(v.form.targetId);
    const bindings =
        v.form.kind === "basis"
          ? ["catalogHash"]
          : [
              "proposalId",
              "expectedVersionId",
              "expectedVersionHash",
              "basisHash",
              "catalogHash",
            ],
      fields =
        v.form.kind === "basis"
          ? ["editionId", "editionHash"]
          : [
              "family",
              "title",
              "summary",
              "declaredPublicationDate",
              "basisPins",
              "selectedMembers",
              "blocks",
              "supersedes",
              "correctionReason",
              "operatorNotes",
              "amendmentReason",
            ];
    for (const [obj, allowed] of [
      [v.form.binding, bindings],
      [v.form.fields, fields],
    ] as const) {
      if (!plain(obj) || Object.keys(obj).some((k) => !allowed.includes(k)))
        fail("draft_fields", "Unrecognized raw form field.");
      for (const x of Object.values(obj)) text(x, 65536, true);
    }
    if (v.form.kind === "basis" && v.form.targetId !== null)
      fail("draft_target", "A basis choice has no proposal target.");
  }
  if (
    encoder.encode(canonicalPublicationProposalJson(v)).length >
    PUBLICATION_PROPOSAL_LIMITS.draftBytes
  )
    fail("draft_limit", "Raw form exceeds 512 KiB.");
}
function authored(
  v: Pick<
    ProposalVersion,
    | "title"
    | "summary"
    | "declaredPublicationDate"
    | "basisPins"
    | "selectedMembers"
    | "blocks"
    | "correction"
    | "operatorNotes"
  >,
) {
  return {
    title: v.title,
    summary: v.summary,
    declaredPublicationDate: v.declaredPublicationDate,
    basisPins: v.basisPins,
    selectedMembers: v.selectedMembers,
    blocks: v.blocks,
    correction: v.correction,
    operatorNotes: v.operatorNotes,
  };
}
function versionContents(v: ProposalVersion, bases: Edition[]) {
  text(v.title, 180);
  text(v.summary, 2000, true);
  if (v.declaredPublicationDate !== null) day(v.declaredPublicationDate);
  pins(v.basisPins, 5);
  if (!v.basisPins.length)
    fail("basis_required", "Choose at least one retained public basis.");
  for (const p of v.basisPins)
    if (!bases.some((b) => b.core.id === p.id && b.hash === p.hash))
      fail("basis_reference", "Pinned basis is unavailable.");
  arr(v.selectedMembers, 100);
  const selectedKeys = new Set<string>();
  for (const sel of v.selectedMembers) {
    exact(sel, ["editionId", "memberId", "contentHash"]);
    id(sel.editionId);
    id(sel.memberId);
    hash(sel.contentHash);
    const key = sel.editionId + "/" + sel.memberId;
    if (selectedKeys.has(key))
      fail(
        "selection_identity",
        "Member selections must be unique within their edition.",
      );
    selectedKeys.add(key);
    const basis = bases.find(
      (b) =>
        b.core.id === sel.editionId &&
        v.basisPins.some((p) => p.id === sel.editionId && p.hash === b.hash),
    );
    if (
      !basis?.core.members.some(
        (m) => m.id === sel.memberId && m.contentHash === sel.contentHash,
      )
    )
      fail(
        "selection_reference",
        "Selected member is not in the exact pinned basis.",
      );
  }
  blocks(v.blocks);
  text(v.operatorNotes, 5000, true);
  if (v.correction !== null) {
    exact(v.correction, ["supersedes", "reason"]);
    id(v.correction.supersedes);
    text(v.correction.reason, 2000);
    if (!v.basisPins.some((p) => p.id === v.correction!.supersedes))
      fail(
        "correction_basis",
        "Retain the exact corrected publication as a basis.",
      );
  }
  nullableText(v.amendmentReason, 2000);
}
function backupBytes(state: ProposalState, at: Instant) {
  return (
    JSON.stringify(
      {
        format: "charitology-publication-proposals-backup",
        version: 1,
        exportedAt: at,
        state,
        checksum: hashPublicationProposalSync(state),
      },
      null,
      2,
    ) + "\n"
  );
}
function capacity(state: ProposalState) {
  if (
    encoder.encode(backupBytes(state, state.updatedAt)).length >
    PUBLICATION_PROPOSAL_LIMITS.backupBytes
  )
    fail(
      "byte_limit",
      "The complete pretty backup exceeds 2 MiB. Nothing was truncated.",
    );
}
export function blankPublicationProposals(
  idValue: Id,
  at: Instant,
): ProposalState {
  id(idValue);
  instant(at);
  return freezePublicationProposal({
    format: "charitology-publication-proposals",
    version: 1,
    id: idValue,
    revision: 0,
    createdAt: at,
    updatedAt: at,
    bases: [],
    sources: [],
    proposals: [],
    versions: [],
    draft: { tab: "proposals", proposalId: null, form: null, dirty: false },
  });
}
export function validatePublicationProposalState(
  value: unknown,
  knownCatalog: ProposalCatalog,
): ProposalState {
  const catalog = validateProposalCatalog(knownCatalog);
  canonicalPublicationProposalJson(value);
  exact(value, [
    "format",
    "version",
    "id",
    "revision",
    "createdAt",
    "updatedAt",
    "bases",
    "sources",
    "proposals",
    "versions",
    "draft",
  ]);
  choice(value.format, ["charitology-publication-proposals"]);
  choice(value.version, [1]);
  id(value.id);
  integer(value.revision);
  instant(value.createdAt);
  instant(value.updatedAt);
  if (value.updatedAt < value.createdAt)
    fail("chronology", "Workspace clock precedes creation.");
  arr(value.bases, 20);
  arr(value.sources, 1000);
  arr(value.proposals, 20);
  arr(value.versions, 100);
  const bids = new Set(),
    sids = new Set(),
    usedSources = new Set();
  for (const s of value.sources) {
    validateSource(s);
    if (sids.has(s.id)) fail("source_identity", "Duplicate retained source.");
    sids.add(s.id);
  }
  const rawRefs = new Map();
  for (const s of value.sources) {
    const k = s.commit + "/" + s.path;
    if (rawRefs.has(k) && rawRefs.get(k) !== s.rawSha256)
      fail("source_rebinding", "One committed path asserts different bytes.");
    rawRefs.set(k, s.rawSha256);
  }
  for (const b of value.bases) {
    if (bids.has(b?.core?.id))
      fail("basis_identity", "Duplicate retained basis.");
    bids.add(b?.core?.id);
    const sources = value.sources
      .filter((s: Source) =>
        b.core?.sourcePins?.some((p: Pin) => p.id === s.id),
      )
      .sort((a: Source, b: Source) => a.id.localeCompare(b.id));
    validateBasis({ edition: b, sources }, catalog);
    for (const p of b.core.sourcePins) usedSources.add(p.id);
  }
  if (value.sources.some((s: Source) => !usedSources.has(s.id)))
    fail(
      "orphan_source",
      "An unreferenced source is not a retained public basis.",
    );
  const ids = new Set([value.id]),
    props = new Map<string, any>();
  for (const p of value.proposals) {
    exact(p, ["id", "family", "currentVersionId"]);
    id(p.id);
    choice(p.family, families);
    id(p.currentVersionId);
    if (ids.has(p.id)) fail("identity", "Private IDs cannot repeat.");
    ids.add(p.id);
    props.set(p.id, p);
  }
  const heads = new Map<string, ProposalVersion>();
  for (const v of value.versions) {
    exact(v, [
      "id",
      "proposalId",
      "version",
      "previousId",
      "previousHash",
      "recordedAt",
      "title",
      "summary",
      "declaredPublicationDate",
      "basisPins",
      "selectedMembers",
      "blocks",
      "correction",
      "amendmentReason",
      "operatorNotes",
      "hash",
    ]);
    id(v.id);
    id(v.proposalId);
    integer(v.version, 1, 100);
    if (ids.has(v.id)) fail("identity", "Private IDs cannot repeat.");
    ids.add(v.id);
    const p = props.get(v.proposalId);
    if (!p) fail("version_orphan", "Version has no proposal.");
    instant(v.recordedAt);
    if (v.recordedAt < value.createdAt || v.recordedAt > value.updatedAt)
      fail("chronology", "Version is outside workspace recording period.");
    const prev = heads.get(v.proposalId);
    if (!prev) {
      if (
        v.version !== 1 ||
        v.previousId !== null ||
        v.previousHash !== null ||
        v.amendmentReason !== null
      )
        fail("version_chain", "Initial version has no predecessor/reason.");
    } else if (
      v.version !== prev.version + 1 ||
      v.previousId !== prev.id ||
      v.previousHash !== prev.hash ||
      !v.amendmentReason ||
      v.recordedAt < prev.recordedAt
    )
      fail(
        "version_chain",
        "Version must append to the exact current predecessor.",
      );
    versionContents(v as ProposalVersion, value.bases);
    if (
      v.correction !== null &&
      value.bases.find((b: Edition) => b.core.id === v.correction.supersedes)
        ?.core.family !== p.family
    )
      fail(
        "correction_family",
        "Correction must retain the same publication family.",
      );
    hashed(v);
    if (prev && same(authored(prev), authored(v as ProposalVersion)))
      fail(
        "identical_version",
        "A current-identical version must remain a no-op.",
      );
    heads.set(v.proposalId, v as ProposalVersion);
  }
  for (const p of value.proposals)
    if (heads.get(p.id)?.id !== p.currentVersionId)
      fail(
        "version_head",
        "Current pointer differs from its complete history.",
      );
  if (value.revision < value.bases.length + value.versions.length)
    fail(
      "revision_history",
      "Workspace revision cannot precede retained captures/version history.",
    );
  draft(value.draft);
  capacity(value as ProposalState);
  return freezePublicationProposal(clone(value) as ProposalState);
}
async function digestValue(
  value: unknown,
  digest?: ProposalDigest,
): Promise<Hash> {
  const bytes = encoder.encode(canonicalPublicationProposalJson(value)),
    expected = rawHash(bytes);
  const result = digest
    ? await digest(bytes.slice())
    : bytesToHex(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", bytes.slice().buffer),
        ),
      );
  hash(result);
  if (result !== expected)
    fail("digest", "Digest must be SHA-256 of the supplied bytes.");
  return result;
}
export async function publicationProposalStateHash(
  state: ProposalState,
  digest?: ProposalDigest,
): Promise<Hash> {
  const stamp = canonicalPublicationProposalJson(state),
    copy = clone(state);
  const h = await digestValue(copy, digest);
  if (canonicalPublicationProposalJson(state) !== stamp)
    fail("input_changed", "State changed while hashing.");
  return h;
}
function watch<T>(v: T, max = PUBLICATION_PROPOSAL_LIMITS.backupBytes + 8192) {
  const stamp = canonicalPublicationProposalJson(v);
  if (encoder.encode(stamp).length > max)
    fail("byte_limit", "Input exceeds its bounded size.");
  const value = freezePublicationProposal(JSON.parse(stamp) as T);
  return {
    value,
    assert() {
      if (canonicalPublicationProposalJson(v) !== stamp)
        fail("input_changed", "Input changed while the operation was pending.");
    },
  };
}
export function publicationProposalCommandForm(
  command: ProposalCommand,
  context: { catalogHash: Hash },
): ProposalDraft["form"] {
  hash(context.catalogHash);
  if (command.kind === "draft.replace") return null;
  if (command.kind === "basis.capture")
    return {
      kind: "basis",
      targetId: null,
      binding: { catalogHash: context.catalogHash },
      fields: {
        editionId: command.basis.edition.core.id,
        editionHash: command.basis.edition.hash,
      },
    };
  return {
    kind: "proposal",
    targetId: command.proposalId,
    binding: {
      proposalId: String(command.proposalId),
      expectedVersionId: String(command.expectedVersionId),
      expectedVersionHash: String(command.expectedVersionHash),
      basisHash: hashPublicationProposalSync(command.basisPins),
      catalogHash: context.catalogHash,
    },
    fields: {
      family: command.family,
      title: command.title,
      summary: command.summary,
      declaredPublicationDate: command.declaredPublicationDate ?? "",
      basisPins: canonicalPublicationProposalJson(command.basisPins),
      selectedMembers: canonicalPublicationProposalJson(
        command.selectedMembers,
      ),
      blocks: canonicalPublicationProposalJson(command.blocks),
      supersedes: command.correction?.supersedes ?? "",
      correctionReason: command.correction?.reason ?? "",
      operatorNotes: command.operatorNotes,
      amendmentReason: command.amendmentReason ?? "",
    },
  };
}
export function publicationProposalFormMatchesCommand(
  form: ProposalDraft["form"],
  command: ProposalCommand,
  context: { catalogHash: Hash },
): boolean {
  if (!form || command.kind === "draft.replace") return false;
  try {
    return same(form, publicationProposalCommandForm(command, context));
  } catch {
    return false;
  }
}
export async function preparePublicationProposalCommand(
  current: ProposalState,
  command: ProposalCommand,
  context: ProposalModelContext,
): Promise<PreparedProposalMutation> {
  const readContext = () => {
    if (
      !plain(context) ||
      Reflect.ownKeys(context).some(
        (k) =>
          typeof k !== "string" ||
          ![
            "expectedStateHash",
            "expectedRevision",
            "at",
            "makeId",
            "knownCatalog",
            "digest",
          ].includes(k),
      )
    )
      fail("context", "Use exact plain command context fields.");
    const d = Object.getOwnPropertyDescriptors(context);
    if (
      [
        "expectedStateHash",
        "expectedRevision",
        "at",
        "makeId",
        "knownCatalog",
      ].some((k) => !d[k]) ||
      Object.values(d).some((x) => !("value" in x))
    )
      fail(
        "context",
        "Command context cannot contain accessors or omit required fields.",
      );
    return {
      data: {
        expectedStateHash: d.expectedStateHash.value,
        expectedRevision: d.expectedRevision.value,
        at: d.at.value,
      },
      makeId: d.makeId.value as () => Id,
      known: d.knownCatalog.value as ProposalCatalog,
      digest: d.digest?.value as ProposalDigest | undefined,
    };
  };
  const initialContext = readContext(),
    wc = watch(current),
    wcmd = watch(command),
    wk = watch(initialContext.known, 1_048_576),
    wctx = watch(initialContext.data, 8192),
    makeId = initialContext.makeId,
    digest = initialContext.digest;
  if (
    typeof makeId !== "function" ||
    (digest !== undefined && typeof digest !== "function")
  )
    fail(
      "context",
      "Use explicit clock, identity allocator and optional SHA-256 digest.",
    );
  const assert = () => {
    const ctx = readContext();
    wc.assert();
    wcmd.assert();
    wk.assert();
    wctx.assert();
    if (
      !same(ctx.data, wctx.value) ||
      ctx.makeId !== makeId ||
      ctx.digest !== digest ||
      ctx.known !== initialContext.known
    )
      fail("input_changed", "Command context changed.");
  };
  const catalog = validateProposalCatalog(wk.value),
    state = validatePublicationProposalState(wc.value, catalog),
    cmd = wcmd.value;
  hash(wctx.value.expectedStateHash);
  integer(wctx.value.expectedRevision);
  instant(wctx.value.at);
  if (
    wctx.value.expectedRevision !== state.revision ||
    wctx.value.expectedStateHash !== hashPublicationProposalSync(state)
  )
    fail("stale_state", "Review the current workspace revision.");
  if (wctx.value.at < state.updatedAt)
    fail("chronology", "A new command cannot backdate the workspace.");
  await digestValue(state, digest);
  assert();
  const next = clone(state),
    ids = new Set([
      state.id,
      ...state.proposals.map((x) => x.id),
      ...state.versions.map((x) => x.id),
    ]);
  const allocate = () => {
    const out = makeId();
    assert();
    id(out);
    if (ids.has(out)) fail("identity", "New private IDs cannot be reused.");
    ids.add(out);
    return out;
  };
  let noOp = false,
    proposalId: Id | null = null,
    versionId: Id | null = null,
    message = "";
  if (cmd.kind === "draft.replace") {
    exact(cmd, ["kind", "draft"]);
    draft(cmd.draft);
    noOp = same(state.draft, cmd.draft);
    if (!noOp) next.draft = clone(cmd.draft);
    message = noOp
      ? "The unfinished form is unchanged."
      : "Unfinished form recorded locally.";
  } else if (cmd.kind === "basis.capture") {
    exact(cmd, ["kind", "basis"]);
    validateBasis(cmd.basis, catalog);
    const prior = state.bases.find(
      (b) => b.core.id === cmd.basis.edition.core.id,
    );
    if (prior) {
      if (prior.hash !== cmd.basis.edition.hash)
        fail(
          "basis_rebinding",
          "A retained public identity cannot be rebound.",
        );
      noOp = true;
    } else {
      next.bases.push(clone(cmd.basis.edition));
      for (const s of cmd.basis.sources) {
        const prior = next.sources.find((x) => x.id === s.id);
        if (prior && prior.hash !== s.hash)
          fail("source_rebinding", "A retained source identity cannot change.");
        if (!prior) next.sources.push(clone(s));
      }
    }
    message = noOp
      ? "This exact public basis is already retained."
      : "Complete public basis retained locally.";
  } else if (cmd.kind === "proposal.freeze") {
    exact(cmd, [
      "kind",
      "proposalId",
      "expectedVersionId",
      "expectedVersionHash",
      "basisPins",
      "selectedMembers",
      "title",
      "summary",
      "family",
      "declaredPublicationDate",
      "blocks",
      "correction",
      "operatorNotes",
      "amendmentReason",
    ]);
    choice(cmd.family, families);
    const p =
      cmd.proposalId === null
        ? null
        : state.proposals.find((p) => p.id === cmd.proposalId);
    const prev = p
      ? state.versions.find((v) => v.id === p.currentVersionId)!
      : null;
    if (cmd.proposalId !== null && !p)
      fail("proposal_unknown", "Choose the current proposal series.");
    if (
      (prev === null &&
        (cmd.expectedVersionId !== null ||
          cmd.expectedVersionHash !== null ||
          cmd.amendmentReason !== null)) ||
      (prev !== null &&
        (cmd.expectedVersionId !== prev.id ||
          cmd.expectedVersionHash !== prev.hash ||
          cmd.family !== p!.family))
    )
      fail("stale_version", "Amend only the exact current proposal version.");
    if (prev !== null) text(cmd.amendmentReason, 2000);
    const contents = {
      title: cmd.title,
      summary: cmd.summary,
      declaredPublicationDate: cmd.declaredPublicationDate,
      basisPins: cmd.basisPins,
      selectedMembers: cmd.selectedMembers,
      blocks: cmd.blocks,
      correction: cmd.correction,
      operatorNotes: cmd.operatorNotes,
    };
    versionContents(
      { ...contents, amendmentReason: cmd.amendmentReason } as ProposalVersion,
      state.bases,
    );
    if (
      cmd.correction !== null &&
      state.bases.find((b) => b.core.id === cmd.correction!.supersedes)?.core
        .family !== cmd.family
    )
      fail("correction_family", "Correct only the same public family.");
    noOp = prev !== null && same(authored(prev), contents);
    proposalId = cmd.proposalId;
    if (!noOp) {
      proposalId = p?.id ?? allocate();
      versionId = allocate();
      const version = {
        id: versionId,
        proposalId,
        version: (prev?.version ?? 0) + 1,
        previousId: prev?.id ?? null,
        previousHash: prev?.hash ?? null,
        recordedAt: wctx.value.at,
        ...contents,
        amendmentReason: cmd.amendmentReason,
      };
      const full = { ...version, hash: hashPublicationProposalSync(version) };
      next.versions.push(full);
      if (p)
        next.proposals.find((x) => x.id === p.id)!.currentVersionId = versionId;
      else
        next.proposals.push({
          id: proposalId,
          family: cmd.family,
          currentVersionId: versionId,
        });
    }
    message = noOp
      ? "This current proposal is unchanged; unfinished work was retained."
      : "Draft proposal version frozen locally; it is not published or independently reviewed.";
  } else fail("command", "Use a documented proposal command.");
  if (!noOp) {
    if (
      cmd.kind !== "draft.replace" &&
      publicationProposalFormMatchesCommand(next.draft.form, cmd, {
        catalogHash: catalog.hash,
      })
    ) {
      next.draft.form = null;
      next.draft.dirty = false;
    }
    if (state.revision === Number.MAX_SAFE_INTEGER)
      fail("revision_limit", "Workspace revision cannot advance safely.");
    next.revision++;
    next.updatedAt = wctx.value.at;
  }
  const candidate = validatePublicationProposalState(next, catalog),
    candidateHash = await digestValue(candidate, digest);
  assert();
  const commandHash = await digestValue(cmd, digest);
  assert();
  return freezePublicationProposal({
    format: "charitology-publication-proposal-mutation",
    version: 1,
    commandKind: cmd.kind,
    expectedStateHash: wctx.value.expectedStateHash,
    expectedRevision: wctx.value.expectedRevision,
    catalogHash: catalog.hash,
    candidateHash,
    candidate,
    commandHash,
    noOp,
    summary: { message, proposalId, versionId },
  });
}
export async function makePublicationProposalBackup(
  state: ProposalState,
  exportedAt: Instant,
  knownCatalog: ProposalCatalog,
  digest?: ProposalDigest,
): Promise<string> {
  instant(exportedAt);
  const ws = watch(state),
    wk = watch(knownCatalog, 1_048_576);
  const s = validatePublicationProposalState(ws.value, wk.value);
  await digestValue(s, digest);
  ws.assert();
  wk.assert();
  const out = backupBytes(s, exportedAt);
  if (encoder.encode(out).length > 2_097_152)
    fail("byte_limit", "Complete backup exceeds 2 MiB.");
  return out;
}
export async function parsePublicationProposalBackup(
  input: string | Uint8Array,
  knownCatalog: ProposalCatalog,
  digest?: ProposalDigest,
): Promise<ProposalState> {
  const bytes = rawBytes(input, 2_097_152),
    wk = watch(knownCatalog, 1_048_576),
    v = strictPublicationProposalJson(bytes, 2_097_152);
  exact(v, ["format", "version", "exportedAt", "state", "checksum"]);
  choice(v.format, ["charitology-publication-proposals-backup"]);
  choice(v.version, [1]);
  instant(v.exportedAt);
  hash(v.checksum);
  const s = validatePublicationProposalState(v.state, wk.value);
  if ((await digestValue(s, digest)) !== v.checksum)
    fail("backup_checksum", "Backup checksum differs from its full state.");
  wk.assert();
  const actual = rawBytes(input, 2_097_152);
  if (actual.length !== bytes.length || actual.some((b, i) => b !== bytes[i]))
    fail("input_changed", "Backup input changed while validating.");
  return s;
}
export async function makePublicationProposalPacket(
  state: ProposalState,
  options: ProposalPacketOptions,
  knownCatalog: ProposalCatalog,
  digest?: ProposalDigest,
): Promise<{ json: string; markdown: string; selectionHash: Hash }> {
  const ws = watch(state),
    wo = watch(options, 8192),
    wk = watch(knownCatalog, 1_048_576);
  exact(wo.value, ["versionId", "includeOperatorNotes"]);
  id(wo.value.versionId);
  if (typeof wo.value.includeOperatorNotes !== "boolean")
    fail(
      "packet_options",
      "Choose explicitly whether to include operator notes.",
    );
  const s = validatePublicationProposalState(ws.value, wk.value),
    v = s.versions.find((x) => x.id === wo.value.versionId);
  if (!v) fail("version_unknown", "Select one retained proposal version.");
  const p = s.proposals.find((x) => x.id === v.proposalId)!;
  const basis = s.bases.filter((b) =>
      v.basisPins.some((pin) => pin.id === b.core.id),
    ),
    sourceIds = new Set(
      basis.flatMap((b) => b.core.sourcePins.map((p) => p.id)),
    ),
    sources = s.sources.filter((src) => sourceIds.has(src.id));
  const version = clone(v) as Partial<ProposalVersion>;
  if (!wo.value.includeOperatorNotes) delete version.operatorNotes;
  const packet = {
    format: "charitology-publication-proposal-packet",
    version: 1,
    label: "Draft proposal; not published or independently reviewed.",
    proposal: { id: p.id, family: p.family },
    proposalVersion: version,
    operatorNotesIncluded: wo.value.includeOperatorNotes,
    selectedMembers: v.selectedMembers,
    bases: basis,
    sources,
    limitations: [
      "Complete pinned public basis manifests/source closure include unselected public context.",
      "Artifact descriptors are retained; artifact download bytes were not copied or rechecked.",
      "Unrelated private proposals, other versions and unfinished forms are omitted.",
      "This packet is not a full workspace restore backup; retained version hash covers the original private operator notes, which may be omitted here.",
    ],
  };
  const selectionHash = await digestValue(packet, digest);
  ws.assert();
  wo.assert();
  wk.assert();
  const json = JSON.stringify({ ...packet, selectionHash }, null, 2) + "\n";
  if (encoder.encode(json).length > 2_097_152)
    fail(
      "byte_limit",
      "Selected complete packet exceeds 2 MiB; nothing was omitted silently.",
    );
  let fenceLength = 3;
  for (const run of json.matchAll(/`+/g))
    fenceLength = Math.max(fenceLength, run[0].length + 1);
  const fence = "`".repeat(fenceLength);
  const markdown =
    "# Draft publication proposal\n\nNot published or independently reviewed. Complete pinned public context is included; unrelated private work is omitted.\n\n" +
    fence +
    "json\n" +
    json +
    fence +
    "\n";
  return { json, markdown, selectionHash };
}
