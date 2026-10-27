/** Private, self-recorded study snapshots. No storage, DOM, network, clock or independent assessment. */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
export type Id = string; //1..100 ASCII A-Z/a-z/0-9/_/-, globally unique workspace IDs
export type Hash = string; //64 lowercase SHA-256 hex
export type Instant = string; //real canonical UTC YYYY-MM-DDTHH:mm:ss.sssZ, 1900..2200
export type LegacyDay = string; //empty, or actual old real YYYY-MM-DD domain; no new year restriction
export interface CourseState {
  version: 1;
  name: string; //<=120
  capstone: string; //<=12000
  completedAt: LegacyDay; //declared source date, not a verified completion instant
  lessons: { read: boolean; practice: string; answers: [number, number] }[];
  //Exactly ten lessons; practice<=5000; answers integer -1..2. No other keys.
}
export const LEARNING_LIMITS = Object.freeze({
  courseBytes: 400_000,
  criteriaBytes: 262_144,
  criteria: 20,
  records: 10,
  backupBytes: 2_097_152,
  draftBytes: 524_288,
  draftFieldChars: 16_384,
  jsonDepth: 32,
} as const);
export type LearningDigest = (bytes: Uint8Array) => Promise<Hash>;

export interface CriteriaSource {
  path: string; //exact allowlisted repo-relative chapter path
  rawText: string; //exact UTF-8 source; inert when rendered from an archive
  rawHash: Hash;
}
export interface CourseQuestion {
  prompt: string;
  options: [string, string, string];
  correct: 0 | 1 | 2;
  explanation: string;
}
export interface CriteriaUnit {
  id: Id; //stable chapter ID
  chapter: number; //1..10, ordered without gaps
  chapterPath: string;
  chapterHash: Hash;
  takeaway: string;
  exercise: string;
  worked: string;
  questions: [CourseQuestion, CourseQuestion];
}
export interface CourseCriteria {
  format: "charitology-course-criteria";
  version: 1;
  id: Id;
  sourceCommit: string; //actual explicit 40-lowercase-hex Git baseline
  sourceFiles: CriteriaSource[]; //exact ten chapter files, stable chapter order
  units: CriteriaUnit[]; //exact ten known chapter bindings
  capstoneInstructions: string; //exact authored current text
  rules: {
    readRequired: true;
    practiceMin: number; //current30; safe integer1..5000, known editions only
    capstoneMin: number; //current200; safe integer1..12000, known editions only
    nameMax: 120;
    practiceMax: 5000;
    capstoneMax: 12000;
    stringLength: "javascript-utf16";
  };
  limitations: "self-study-v1";
  hash: Hash;
}
export interface CriteriaRegistry {
  format: "charitology-course-criteria-registry";
  version: 1;
  currentId: Id;
  entries: { id: Id; hash: Hash; path: string }[];
}

export interface CourseEvaluation {
  complete: boolean;
  unitsComplete: number; //0..10, count of all checks satisfied per unit
  units: {
    unitId: Id;
    read: boolean;
    practiceCharacters: number; //trim().length
    practiceSufficient: boolean;
    answers: [
      "unanswered" | "correct" | "incorrect",
      "unanswered" | "correct" | "incorrect",
    ];
    passed: boolean;
  }[];
  capstoneCharacters: number;
  capstoneSufficient: boolean;
  limitations: "self-study-v1";
}
export interface CourseOrigin {
  kind: "course-memory" | "course-file";
  persistence: "saved" | "unsaved-memory" | "selected-file";
  rawHash: Hash | null; //exact selected/saved text bytes where actually available
  fileName: string | null; //safe basename<=255; descriptive, not identity
  declaredCompletedAt: LegacyDay; //equals input.completedAt
  historicalCriteria: "unknown"; //v1 source contains no binding proof
}
export interface LearningRecord {
  id: Id;
  seriesId: Id; //first record's ID
  revision: number; //safe integer starting1
  previousId: Id | null;
  previousHash: Hash | null; //null revision1; exact predecessor hash on amendment
  criteriaId: Id;
  criteriaHash: Hash;
  input: CourseState;
  inputHash: Hash;
  origin: CourseOrigin;
  evaluation: CourseEvaluation; //recomputed; never trusted as an imported flag
  criteriaAffirmed: true; //local assertion of inspecting this selected version now
  recordedAt: Instant; //capture/amend instant, separate from declared source day
  amendmentReason: string | null; //null for revision1; trimmed nonempty<=2000 later
  limitations: "self-study-v1";
  hash: Hash;
}

export interface CourseRawForm {
  name: string;
  capstone: string;
  completedAt: string; //raw dedicated day-action text; may be invalid/unfinished
  lessons: { read: boolean; practice: string; answers: [string, string] }[];
  //Exactly ten. Raw answer strings may be blank/malformed for repair.
}
export interface LearningDraft {
  tab: "course" | "portfolio" | "criteria" | "exports" | "recovery";
  recordId: Id | null;
  form: null | {
    kind: "capture" | "amend" | "course";
    targetId: Id | null;
    binding: {
      criteriaId?: string;
      criteriaHash?: string;
      expectedRecordId?: string;
      expectedRecordHash?: string;
      sourceInputHash?: string;
      sourceGeneration?: string;
      sourceObservedRawHash?: string; //literal "missing" for observed null
    };
    fields: {
      criteriaAffirmed?: string; //raw "true"/"false" when valid
      amendmentReason?: string;
    };
    course: CourseRawForm | null;
  };
  dirty: boolean;
}
export interface LearningPortfolioState {
  format: "charitology-learning-portfolio";
  version: 1;
  id: Id;
  revision: number;
  createdAt: Instant;
  updatedAt: Instant;
  criteria: CourseCriteria[];
  records: LearningRecord[];
  draft: LearningDraft;
}

export interface LearningContext {
  expectedStateHash: Hash;
  expectedRevision: number;
  at: Instant;
  makeId(): Id;
  knownCriteria: readonly CourseCriteria[];
  digest?: LearningDigest; //caller wraps Web Crypto bytes as lowercase hex
}
export interface CourseSnapshotInput {
  input: CourseState;
  origin: CourseOrigin;
}
export type LearningCommand =
  | {
      kind: "record.capture";
      criteriaId: Id;
      criteriaHash: Hash;
      source: CourseSnapshotInput;
      criteriaAffirmed: true;
    }
  | {
      kind: "record.amend";
      criteriaId: Id;
      criteriaHash: Hash;
      expectedRecordId: Id;
      expectedRecordHash: Hash;
      source: CourseSnapshotInput;
      criteriaAffirmed: true;
      reason: string;
    }
  | { kind: "draft.replace"; draft: LearningDraft };
export interface PreparedLearningMutation {
  format: "charitology-learning-mutation";
  version: 1;
  commandKind: LearningCommand["kind"];
  expectedStateHash: Hash;
  expectedRevision: number;
  commandHash: Hash;
  candidateHash: Hash;
  candidate: LearningPortfolioState;
  noOp: boolean;
  summary: { message: string; recordId: Id | null };
}

const encoder = new TextEncoder();
const reserved = new Set(["__proto__", "prototype", "constructor"]);
export const LEARNING_CHAPTER_IDS = Object.freeze([
  "01-what-charitology-is",
  "02-the-charity-system",
  "03-depth-from-relief-to-source",
  "04-evidence-and-its-grades",
  "05-counterfactuals-and-neglect",
  "06-comparing-the-incomparable",
  "07-time",
  "08-feedback-and-voice",
  "09-failure-and-learning",
  "10-becoming-a-charitologist",
] as const);
export class LearningPortfolioError extends Error {
  readonly issues: { code: string; path: string; message: string }[];
  constructor(
    public code: string,
    message: string,
    path = "",
  ) {
    super(message);
    this.name = "LearningPortfolioError";
    this.issues = [{ code, path, message }];
  }
}
export function learningFail(code: string, message: string, path = ""): never {
  throw new LearningPortfolioError(code, message, path);
}
const fail: typeof learningFail = learningFail;
function plain(v: unknown): v is Record<string, unknown> {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    (Object.getPrototypeOf(v) === Object.prototype ||
      Object.getPrototypeOf(v) === null)
  );
}
function exact(
  v: unknown,
  keys: readonly string[],
  path = "",
): asserts v is Record<string, unknown> {
  if (
    !plain(v) ||
    Object.keys(v).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(v, k)) ||
    Object.keys(v).some((k) => reserved.has(k) || !keys.includes(k))
  )
    fail("shape", "Use exactly the documented object fields.", path);
}
function text(
  v: unknown,
  max: number,
  path = "",
  empty = false,
): asserts v is string {
  if (typeof v !== "string" || v.length > max || (!empty && !v.trim()))
    fail(
      "text",
      `Use ${empty ? "" : "nonempty "}text within ${max} characters.`,
      path,
    );
}
function id(v: unknown, path = ""): asserts v is Id {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(v))
    fail("id", "Use a bounded opaque identifier.", path);
}
function hash(v: unknown, path = ""): asserts v is Hash {
  if (typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v))
    fail("hash", "Use a complete lowercase SHA-256 hash.", path);
}
function integer(
  v: unknown,
  min: number,
  max: number,
  path = "",
): asserts v is number {
  if (!Number.isSafeInteger(v) || (v as number) < min || (v as number) > max)
    fail("integer", `Use a safe integer from ${min} to ${max}.`, path);
}
function instant(v: unknown, path = ""): asserts v is Instant {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) ||
    v < "1900-01-01T00:00:00.000Z" ||
    v > "2200-12-31T23:59:59.999Z" ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString() !== v
  )
    fail(
      "instant",
      "Use a real canonical UTC instant between 1900 and 2200.",
      path,
    );
}
function day(v: unknown): asserts v is LegacyDay {
  if (
    typeof v !== "string" ||
    (v !== "" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(v) ||
        !Number.isFinite(Date.parse(v)) ||
        new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) !== v))
  )
    fail("day", "Preserve an empty or real YYYY-MM-DD source day.");
}
function arr(v: unknown, max: number, path = ""): asserts v is unknown[] {
  if (!Array.isArray(v) || v.length > max)
    fail("limit", `Use at most ${max} entries.`, path);
}
function choice<T extends string>(
  v: unknown,
  values: readonly T[],
  path = "",
): asserts v is T {
  if (!values.includes(v as T))
    fail("choice", "Choose a documented value.", path);
}
export const learningClone = <T>(v: T): T => structuredClone(v);
export function learningFreeze<T>(v: T): T {
  if (v && typeof v === "object") {
    for (const child of Object.values(v)) learningFreeze(child);
    Object.freeze(v);
  }
  return v;
}
export function canonicalLearningJson(value: unknown): string {
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
      depth > LEARNING_LIMITS.jsonDepth ||
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
export const hashLearningSync = (value: unknown): Hash =>
  bytesToHex(sha256(encoder.encode(canonicalLearningJson(value))));
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
export function strictLearningJson(
  raw: string | Uint8Array,
  maxBytes: number,
): unknown {
  integer(maxBytes, 1, LEARNING_LIMITS.backupBytes);
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
      if (stack.length >= LEARNING_LIMITS.jsonDepth)
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
    return JSON.parse(source);
  } catch {
    fail("json", "Choose complete JSON without comments or trailing content.");
  }
}
async function digestBytes(
  bytes: Uint8Array,
  digest?: LearningDigest,
): Promise<Hash> {
  const expected = rawHash(bytes);
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
export async function hashLearningValue(
  value: unknown,
  digest?: LearningDigest,
): Promise<Hash> {
  const before = canonicalLearningJson(value);
  const result = await digestBytes(encoder.encode(before), digest);
  if (canonicalLearningJson(value) !== before)
    fail("input_changed", "Input changed while hashing.");
  return result;
}
export const learningPortfolioStateHash = (
  state: LearningPortfolioState,
  digest?: LearningDigest,
): Promise<Hash> => hashLearningValue(state, digest);
export function learningEntryHash(value: unknown): Hash {
  canonicalLearningJson(value);
  if (!plain(value)) fail("shape", "Use an entry object.");
  const { hash: ignored, ...body } = value;
  return hashLearningSync(body);
}
function checkedEntry(value: { hash: Hash }): void {
  hash(value.hash);
  if (learningEntryHash(value) !== value.hash)
    fail("entry_hash", "An immutable entry checksum changed.");
}
function withHash<T extends object>(body: T): T & { hash: Hash } {
  return { ...body, hash: hashLearningSync(body) };
}
function equal(a: unknown, b: unknown): boolean {
  return canonicalLearningJson(a) === canonicalLearningJson(b);
}

export const emptyCourseProgress = (): CourseState =>
  learningFreeze({
    version: 1,
    name: "",
    capstone: "",
    completedAt: "",
    lessons: Array.from({ length: 10 }, () => ({
      read: false,
      practice: "",
      answers: [-1, -1] as [number, number],
    })),
  });
export function validateCourseProgress(value: unknown): CourseState {
  canonicalLearningJson(value);
  exact(value, ["version", "name", "capstone", "completedAt", "lessons"]);
  if (value.version !== 1)
    fail("course_version", "Choose known version 1 course progress.");
  text(value.name, 120, "name", true);
  text(value.capstone, 12000, "capstone", true);
  day(value.completedAt);
  arr(value.lessons, 10);
  if (value.lessons.length !== 10)
    fail("course_units", "Keep exactly ten unit records.");
  for (const item of value.lessons) {
    exact(item, ["read", "practice", "answers"]);
    if (typeof item.read !== "boolean")
      fail("course_read", "Reading is a local boolean assertion.");
    text(item.practice, 5000, "practice", true);
    arr(item.answers, 2);
    if (item.answers.length !== 2)
      fail("course_answers", "Keep two answer indexes per unit.");
    for (const a of item.answers) integer(a, -1, 2, "answer");
  }
  const result = learningClone(value) as unknown as CourseState;
  if (
    encoder.encode(JSON.stringify(result, null, 2) + "\n").length >
    LEARNING_LIMITS.courseBytes
  )
    fail("course_limit", "The complete v1 export exceeds 400,000 bytes.");
  return learningFreeze(result);
}
export function makeCourseProgressExport(input: CourseState): string {
  return JSON.stringify(validateCourseProgress(input), null, 2) + "\n";
}
export async function parseCourseProgressExport(
  raw: string | Uint8Array,
  digest?: LearningDigest,
): Promise<{ input: CourseState; rawHash: Hash }> {
  const bytes = rawBytes(raw, LEARNING_LIMITS.courseBytes),
    stamp = rawHash(bytes);
  const input = validateCourseProgress(
    strictLearningJson(bytes, LEARNING_LIMITS.courseBytes),
  );
  const result = await digestBytes(bytes, digest);
  if (rawHash(rawBytes(raw, LEARNING_LIMITS.courseBytes)) !== stamp)
    fail("input_changed", "Selected course bytes changed during validation.");
  return learningFreeze({ input, rawHash: result });
}
function criteriaShape(value: unknown): CourseCriteria {
  const json = canonicalLearningJson(value);
  if (encoder.encode(json).length > LEARNING_LIMITS.criteriaBytes)
    fail("criteria_limit", "Frozen criteria exceed 262,144 canonical bytes.");
  exact(value, [
    "format",
    "version",
    "id",
    "sourceCommit",
    "sourceFiles",
    "units",
    "capstoneInstructions",
    "rules",
    "limitations",
    "hash",
  ]);
  if (
    value.format !== "charitology-course-criteria" ||
    value.version !== 1 ||
    value.limitations !== "self-study-v1"
  )
    fail("criteria_version", "Use the supported self-study criteria format.");
  id(value.id);
  if (
    typeof value.sourceCommit !== "string" ||
    !/^[a-f0-9]{40}$/.test(value.sourceCommit)
  )
    fail("criteria_commit", "Pin an actual complete Git baseline.");
  text(
    value.capstoneInstructions,
    LEARNING_LIMITS.criteriaBytes,
    "capstoneInstructions",
  );
  exact(value.rules, [
    "readRequired",
    "practiceMin",
    "capstoneMin",
    "nameMax",
    "practiceMax",
    "capstoneMax",
    "stringLength",
  ]);
  const rules = value.rules;
  if (
    rules.readRequired !== true ||
    rules.nameMax !== 120 ||
    rules.practiceMax !== 5000 ||
    rules.capstoneMax !== 12000 ||
    rules.stringLength !== "javascript-utf16"
  )
    fail(
      "criteria_rules",
      "Keep supported v1 input limits and string-length semantics.",
    );
  integer(rules.practiceMin, 1, 5000);
  integer(rules.capstoneMin, 1, 12000);
  arr(value.sourceFiles, 10);
  arr(value.units, 10);
  if (value.sourceFiles.length !== 10 || value.units.length !== 10)
    fail("criteria_units", "Keep ten exact chapter/unit bindings.");
  for (let i = 0; i < 10; i++) {
    const chapterId = LEARNING_CHAPTER_IDS[i],
      path = `src/content/principles/${chapterId}.md`,
      source = value.sourceFiles[i],
      unit = value.units[i];
    exact(source, ["path", "rawText", "rawHash"]);
    if (source.path !== path)
      fail("criteria_path", "Use the exact ordered chapter path.");
    text(source.rawText, LEARNING_LIMITS.criteriaBytes, "rawText");
    hash(source.rawHash);
    if (rawHash(encoder.encode(source.rawText)) !== source.rawHash)
      fail("chapter_hash", "An archived chapter's exact UTF-8 bytes changed.");
    exact(unit, [
      "id",
      "chapter",
      "chapterPath",
      "chapterHash",
      "takeaway",
      "exercise",
      "worked",
      "questions",
    ]);
    if (
      unit.id !== chapterId ||
      unit.chapter !== i + 1 ||
      unit.chapterPath !== path ||
      unit.chapterHash !== source.rawHash
    )
      fail(
        "criteria_binding",
        "The chapter, unit order or source binding changed.",
      );
    for (const k of ["takeaway", "exercise", "worked"])
      text(unit[k], LEARNING_LIMITS.criteriaBytes, k);
    arr(unit.questions, 2);
    if (unit.questions.length !== 2)
      fail("criteria_questions", "Use exactly two questions per unit.");
    for (const q of unit.questions) {
      exact(q, ["prompt", "options", "correct", "explanation"]);
      text(q.prompt, LEARNING_LIMITS.criteriaBytes);
      text(q.explanation, LEARNING_LIMITS.criteriaBytes);
      arr(q.options, 3);
      if (q.options.length !== 3)
        fail("criteria_options", "Use exactly three ordered choices.");
      for (const o of q.options) text(o, LEARNING_LIMITS.criteriaBytes);
      integer(q.correct, 0, 2);
    }
  }
  checkedEntry(value as unknown as { hash: Hash });
  return learningFreeze(learningClone(value) as unknown as CourseCriteria);
}
function knownDefinitions(known: readonly CourseCriteria[]): CourseCriteria[] {
  canonicalLearningJson(known);
  if (!Array.isArray(known) || known.length > LEARNING_LIMITS.criteria)
    fail("criteria_limit", "Use at most twenty known criteria artifacts.");
  const ids = new Set<string>();
  return known.map((c) => {
    const v = criteriaShape(c);
    if (ids.has(v.id))
      fail("criteria_duplicate", "Known criteria IDs must be unique.");
    ids.add(v.id);
    return v;
  });
}
export function validateCourseCriteria(
  value: unknown,
  knownCriteria: readonly CourseCriteria[],
): CourseCriteria {
  const v = criteriaShape(value),
    known = knownDefinitions(knownCriteria).find((k) => k.id === v.id);
  if (!known || known.hash !== v.hash || !equal(known, v))
    fail(
      "criteria_unknown",
      "This exact criteria definition is not in the known immutable registry.",
    );
  return v;
}
function evaluation(
  input: CourseState,
  criteria: CourseCriteria,
): CourseEvaluation {
  const units = input.lessons.map((lesson, i) => {
    const practiceCharacters = lesson.practice.trim().length,
      practiceSufficient = practiceCharacters >= criteria.rules.practiceMin;
    const answers = lesson.answers.map((answer, j) =>
      answer === -1
        ? "unanswered"
        : answer === criteria.units[i].questions[j].correct
          ? "correct"
          : "incorrect",
    ) as CourseEvaluation["units"][number]["answers"];
    return {
      unitId: criteria.units[i].id,
      read: lesson.read,
      practiceCharacters,
      practiceSufficient,
      answers,
      passed:
        lesson.read &&
        practiceSufficient &&
        answers.every((a) => a === "correct"),
    };
  });
  const unitsComplete = units.filter((u) => u.passed).length,
    capstoneCharacters = input.capstone.trim().length,
    capstoneSufficient = capstoneCharacters >= criteria.rules.capstoneMin;
  return learningFreeze({
    complete: unitsComplete === 10 && capstoneSufficient,
    unitsComplete,
    units,
    capstoneCharacters,
    capstoneSufficient,
    limitations: "self-study-v1",
  });
}
export function evaluateCourseProgress(
  input: CourseState,
  criteria: CourseCriteria,
): CourseEvaluation {
  return evaluation(validateCourseProgress(input), criteriaShape(criteria));
}
function checkOrigin(
  origin: unknown,
  input: CourseState,
): asserts origin is CourseOrigin {
  exact(origin, [
    "kind",
    "persistence",
    "rawHash",
    "fileName",
    "declaredCompletedAt",
    "historicalCriteria",
  ]);
  day(origin.declaredCompletedAt);
  if (
    origin.declaredCompletedAt !== input.completedAt ||
    origin.historicalCriteria !== "unknown"
  )
    fail(
      "origin",
      "Retain the declared source date and unknown historical criteria.",
    );
  if (origin.rawHash !== null) hash(origin.rawHash);
  if (origin.kind === "course-file") {
    if (origin.persistence !== "selected-file" || origin.rawHash === null)
      fail("origin", "File capture needs its actual source-byte hash.");
    text(origin.fileName, 255);
    if (
      /[\\/\u0000-\u001f\u007f]/.test(origin.fileName) ||
      [".", ".."].includes(origin.fileName)
    )
      fail("origin", "Use a safe file basename.");
  } else if (origin.kind === "course-memory") {
    if (
      origin.fileName !== null ||
      !["saved", "unsaved-memory"].includes(origin.persistence as string) ||
      (origin.persistence === "saved"
        ? origin.rawHash === null
        : origin.rawHash !== null)
    )
      fail(
        "origin",
        "Saved memory needs actual bytes; unsaved/absent memory has no raw hash.",
      );
  } else
    fail("origin", "Choose an explicit course-memory or selected-file origin.");
}
export const LEARNING_FORM_NAMES = learningFreeze({
  capture: {
    binding: [
      "criteriaId",
      "criteriaHash",
      "sourceInputHash",
      "sourceGeneration",
      "sourceObservedRawHash",
    ],
    fields: ["criteriaAffirmed"],
  },
  amend: {
    binding: [
      "criteriaId",
      "criteriaHash",
      "expectedRecordId",
      "expectedRecordHash",
      "sourceInputHash",
      "sourceGeneration",
      "sourceObservedRawHash",
    ],
    fields: ["criteriaAffirmed", "amendmentReason"],
  },
  course: {
    binding: ["sourceInputHash", "sourceGeneration", "sourceObservedRawHash"],
    fields: [],
  },
} as const);
function validateRawCourse(value: unknown): void {
  exact(value, ["name", "capstone", "completedAt", "lessons"]);
  for (const k of ["name", "capstone", "completedAt"])
    text(value[k], LEARNING_LIMITS.draftFieldChars, k, true);
  arr(value.lessons, 10);
  if (value.lessons.length !== 10)
    fail("draft", "Keep all ten raw unit fields.");
  for (const lesson of value.lessons) {
    exact(lesson, ["read", "practice", "answers"]);
    if (typeof lesson.read !== "boolean")
      fail("draft", "Keep the raw reading assertion as a boolean.");
    text(lesson.practice, LEARNING_LIMITS.draftFieldChars, "practice", true);
    arr(lesson.answers, 2);
    if (lesson.answers.length !== 2)
      fail("draft", "Keep both raw answer strings.");
    for (const a of lesson.answers)
      text(a, LEARNING_LIMITS.draftFieldChars, "answer", true);
  }
}
function validateDraft(value: unknown): asserts value is LearningDraft {
  exact(value, ["tab", "recordId", "form", "dirty"]);
  choice(value.tab, ["course", "portfolio", "criteria", "exports", "recovery"]);
  if (value.recordId !== null) id(value.recordId);
  if (typeof value.dirty !== "boolean")
    fail("draft", "Keep an explicit raw-draft flag.");
  if (value.form !== null) {
    const f = value.form;
    exact(f, ["kind", "targetId", "binding", "fields", "course"]);
    choice(f.kind, ["capture", "amend", "course"]);
    if (f.targetId !== null) id(f.targetId);
    const names = LEARNING_FORM_NAMES[f.kind];
    for (const section of ["binding", "fields"] as const) {
      const map = f[section];
      if (
        !plain(map) ||
        Object.keys(map).some(
          (k) => !(names[section] as readonly string[]).includes(k),
        )
      )
        fail("draft", "Unknown raw form field or binding.");
      for (const v of Object.values(map))
        text(v, LEARNING_LIMITS.draftFieldChars, "draft", true);
    }
    if (f.course !== null) validateRawCourse(f.course);
  }
  if (
    encoder.encode(canonicalLearningJson(value)).length >
    LEARNING_LIMITS.draftBytes
  )
    fail(
      "draft_limit",
      "Raw draft exceeds 512 KiB; download plain recovery before simplifying it.",
    );
}
function backupText(
  state: LearningPortfolioState,
  exportedAt: Instant,
): string {
  const body = {
    format: "charitology-learning-portfolio-backup",
    version: 1,
    exportedAt,
    state,
  };
  return (
    JSON.stringify({ ...body, checksum: hashLearningSync(body) }, null, 2) +
    "\n"
  );
}
export function learningBackupBytes(
  state: LearningPortfolioState,
  exportedAt: Instant = state.updatedAt,
): number {
  instant(exportedAt);
  const bytes = encoder.encode(backupText(state, exportedAt)).length;
  if (bytes > LEARNING_LIMITS.backupBytes)
    fail(
      "backup_limit",
      "Complete portfolio backup exceeds 2 MiB; preserve it and use fewer records or a separate backed-up portfolio.",
    );
  return bytes;
}
export function blankLearningPortfolio(
  workspaceId: Id,
  at: Instant,
): LearningPortfolioState {
  id(workspaceId);
  instant(at);
  return learningFreeze({
    format: "charitology-learning-portfolio",
    version: 1,
    id: workspaceId,
    revision: 0,
    createdAt: at,
    updatedAt: at,
    criteria: [],
    records: [],
    draft: { tab: "course", recordId: null, form: null, dirty: false },
  });
}

export function validateLearningPortfolio(
  value: unknown,
  knownCriteria: readonly CourseCriteria[],
): LearningPortfolioState {
  canonicalLearningJson(value);
  exact(value, [
    "format",
    "version",
    "id",
    "revision",
    "createdAt",
    "updatedAt",
    "criteria",
    "records",
    "draft",
  ]);
  if (value.format !== "charitology-learning-portfolio" || value.version !== 1)
    fail("portfolio_version", "Choose a version 1 self-study portfolio.");
  id(value.id);
  integer(value.revision, 0, Number.MAX_SAFE_INTEGER);
  instant(value.createdAt);
  instant(value.updatedAt);
  if (value.updatedAt < value.createdAt)
    fail("chronology", "The workspace update precedes its creation.");
  arr(value.criteria, LEARNING_LIMITS.criteria);
  arr(value.records, LEARNING_LIMITS.records);
  if (value.revision < value.records.length)
    fail("revision", "Workspace revision cannot precede its retained appends.");
  const known = knownDefinitions(knownCriteria),
    criteriaMap = new Map<Id, CourseCriteria>(),
    ids = new Set<string>([value.id]);
  for (const c of value.criteria) {
    const v = criteriaShape(c),
      definition = known.find((k) => k.id === v.id);
    if (!definition || !equal(definition, v))
      fail(
        "criteria_unknown",
        "A retained criteria definition is not in the known registry.",
      );
    if (ids.has(v.id))
      fail("duplicate_id", "Workspace entity IDs must be unique.");
    ids.add(v.id);
    criteriaMap.set(v.id, v);
  }
  const recordMap = new Map<Id, LearningRecord>(),
    heads = new Map<Id, LearningRecord>(),
    usedCriteria = new Set<Id>();
  let lastAt = value.createdAt;
  for (const item of value.records) {
    exact(item, [
      "id",
      "seriesId",
      "revision",
      "previousId",
      "previousHash",
      "criteriaId",
      "criteriaHash",
      "input",
      "inputHash",
      "origin",
      "evaluation",
      "criteriaAffirmed",
      "recordedAt",
      "amendmentReason",
      "limitations",
      "hash",
    ]);
    id(item.id);
    id(item.seriesId);
    integer(item.revision, 1, Number.MAX_SAFE_INTEGER);
    id(item.criteriaId);
    hash(item.criteriaHash);
    hash(item.inputHash);
    instant(item.recordedAt);
    if (ids.has(item.id))
      fail("duplicate_id", "Workspace entity IDs must be unique.");
    ids.add(item.id);
    const criteria = criteriaMap.get(item.criteriaId);
    if (!criteria || criteria.hash !== item.criteriaHash)
      fail(
        "criteria_reference",
        "The exact retained criteria reference is missing.",
      );
    usedCriteria.add(criteria.id);
    const input = validateCourseProgress(item.input);
    if (hashLearningSync(input) !== item.inputHash)
      fail("input_hash", "The exact retained course input changed.");
    checkOrigin(item.origin, input);
    if (
      item.criteriaAffirmed !== true ||
      item.limitations !== "self-study-v1" ||
      !equal(evaluation(input, criteria), item.evaluation)
    )
      fail(
        "evaluation",
        "Recomputed self-study checks or limitations differ from this record.",
      );
    if (item.recordedAt < lastAt || item.recordedAt > value.updatedAt)
      fail(
        "chronology",
        "Retained appends must follow their recorded workspace order.",
      );
    lastAt = item.recordedAt;
    if (item.previousId === null) {
      if (
        item.previousHash !== null ||
        item.revision !== 1 ||
        item.seriesId !== item.id ||
        item.amendmentReason !== null ||
        heads.has(item.seriesId)
      )
        fail(
          "record_chain",
          "A new series must begin with no predecessor or amendment reason.",
        );
    } else {
      id(item.previousId);
      hash(item.previousHash);
      text(item.amendmentReason, 2000, "amendmentReason");
      if (item.amendmentReason !== item.amendmentReason.trim())
        fail("record_chain", "Amendment reason must be explicitly trimmed.");
      const prior = recordMap.get(item.previousId);
      if (
        !prior ||
        prior.hash !== item.previousHash ||
        prior.seriesId !== item.seriesId ||
        heads.get(item.seriesId)?.id !== prior.id ||
        prior.revision === Number.MAX_SAFE_INTEGER ||
        item.revision !== prior.revision + 1 ||
        prior.criteriaId !== item.criteriaId ||
        prior.criteriaHash !== item.criteriaHash
      )
        fail(
          "record_chain",
          "Amend only the exact current same-criteria predecessor ID/hash.",
        );
    }
    checkedEntry(item as unknown as { hash: Hash });
    const r = item as unknown as LearningRecord;
    recordMap.set(r.id, r);
    heads.set(r.seriesId, r);
  }
  if ([...criteriaMap.keys()].some((k) => !usedCriteria.has(k)))
    fail(
      "criteria_orphan",
      "Retain only criteria referenced by portfolio records.",
    );
  validateDraft(value.draft);
  if (value.draft.recordId !== null && !recordMap.has(value.draft.recordId))
    fail("draft_reference", "The selected portfolio record is missing.");
  const result = learningClone(value) as unknown as LearningPortfolioState;
  learningBackupBytes(result);
  return learningFreeze(result);
}
function commandShape(command: unknown): asserts command is LearningCommand {
  canonicalLearningJson(command);
  if (!plain(command)) fail("command", "Choose a documented command.");
  if (command.kind === "draft.replace") {
    exact(command, ["kind", "draft"]);
    validateDraft(command.draft);
    return;
  }
  if (command.kind === "record.capture")
    exact(command, [
      "kind",
      "criteriaId",
      "criteriaHash",
      "source",
      "criteriaAffirmed",
    ]);
  else if (command.kind === "record.amend") {
    exact(command, [
      "kind",
      "criteriaId",
      "criteriaHash",
      "expectedRecordId",
      "expectedRecordHash",
      "source",
      "criteriaAffirmed",
      "reason",
    ]);
    id(command.expectedRecordId);
    hash(command.expectedRecordHash);
    text(command.reason, 2000, "reason");
  } else fail("command", "Choose a documented portfolio command.");
  id(command.criteriaId);
  hash(command.criteriaHash);
  if (command.criteriaAffirmed !== true)
    fail("affirmation", "Affirm the exact currently reviewed criteria.");
  exact(command.source, ["input", "origin"]);
  const input = validateCourseProgress(command.source.input);
  checkOrigin(command.source.origin, input);
}
export function learningCommandForm(
  command: LearningCommand,
): LearningDraft["form"] {
  commandShape(command);
  if (command.kind === "draft.replace") return null;
  const input = command.source.input;
  return learningFreeze({
    kind: command.kind === "record.amend" ? "amend" : "capture",
    targetId: command.kind === "record.amend" ? command.expectedRecordId : null,
    binding: {
      criteriaId: command.criteriaId,
      criteriaHash: command.criteriaHash,
      ...(command.kind === "record.amend"
        ? {
            expectedRecordId: command.expectedRecordId,
            expectedRecordHash: command.expectedRecordHash,
          }
        : {}),
      sourceInputHash: hashLearningSync(input),
    },
    fields: {
      criteriaAffirmed: "true",
      ...(command.kind === "record.amend"
        ? { amendmentReason: command.reason.trim() }
        : {}),
    },
    course: {
      name: input.name,
      capstone: input.capstone,
      completedAt: input.completedAt,
      lessons: input.lessons.map((l) => ({
        read: l.read,
        practice: l.practice,
        answers: l.answers.map(String) as [string, string],
      })),
    },
  });
}
/** Extra/partial binding fields cannot be guessed from a command; preserve such a draft. */
export function learningFormMatchesCommand(
  form: LearningDraft["form"],
  command: LearningCommand,
): boolean {
  if (form === null) return false;
  try {
    return equal(form, learningCommandForm(command));
  } catch {
    return false;
  }
}
function clearMatchingDraft(
  state: LearningPortfolioState,
  command: LearningCommand,
): void {
  if (learningFormMatchesCommand(state.draft.form, command))
    state.draft = { ...state.draft, form: null, dirty: false };
}
export async function prepareLearningCommand(
  state: LearningPortfolioState,
  command: LearningCommand,
  context: LearningContext,
): Promise<PreparedLearningMutation> {
  const contextShape = () => {
    if (
      !plain(context) ||
      Object.getOwnPropertySymbols(context).length ||
      Object.getOwnPropertyNames(context).length !==
        Object.keys(context).length ||
      Object.keys(context).some(
        (k) =>
          !Object.hasOwn(Object.getOwnPropertyDescriptor(context, k)!, "value"),
      )
    )
      fail(
        "context",
        "Use plain enumerable preparation fields without accessors.",
      );
  };
  contextShape();
  if (
    !context ||
    typeof context.makeId !== "function" ||
    (context.digest !== undefined && typeof context.digest !== "function")
  )
    fail("context", "Supply explicit clock, ID and hash context.");
  const contextKeys = Object.keys(context);
  if (
    contextKeys.some(
      (k) =>
        ![
          "expectedStateHash",
          "expectedRevision",
          "at",
          "makeId",
          "knownCriteria",
          "digest",
        ].includes(k),
    ) ||
    ![
      "expectedStateHash",
      "expectedRevision",
      "at",
      "makeId",
      "knownCriteria",
    ].every((k) => Object.hasOwn(context, k))
  )
    fail("context", "Use exactly the documented preparation context.");
  const stamp = canonicalLearningJson(state),
    commandStamp = canonicalLearningJson(command),
    ctxData = {
      expectedStateHash: context.expectedStateHash,
      expectedRevision: context.expectedRevision,
      at: context.at,
      knownCriteria: context.knownCriteria,
    },
    ctxStamp = canonicalLearningJson(ctxData),
    makeId = context.makeId,
    digest = context.digest;
  const ownedState = validateLearningPortfolio(state, context.knownCriteria),
    ownedCommand = learningClone(command),
    known = knownDefinitions(context.knownCriteria),
    expected = context.expectedStateHash,
    revision = context.expectedRevision,
    at = context.at;
  hash(expected);
  integer(revision, 0, Number.MAX_SAFE_INTEGER);
  instant(at);
  commandShape(ownedCommand);
  if (ownedState.revision !== revision)
    fail("stale_revision", "Portfolio revision changed; review current state.");
  if (at < ownedState.updatedAt)
    fail(
      "chronology",
      "A new command cannot backdate its recorded workspace update.",
    );
  const unchanged = () => {
    contextShape();
    if (
      canonicalLearningJson(state) !== stamp ||
      canonicalLearningJson(command) !== commandStamp ||
      canonicalLearningJson({
        expectedStateHash: context.expectedStateHash,
        expectedRevision: context.expectedRevision,
        at: context.at,
        knownCriteria: context.knownCriteria,
      }) !== ctxStamp ||
      context.makeId !== makeId ||
      context.digest !== digest ||
      Object.keys(context).length !== contextKeys.length ||
      Object.keys(context).some((k) => !contextKeys.includes(k))
    )
      fail(
        "input_changed",
        "State, command or preparation context changed while awaiting.",
      );
  };
  const actual = await hashLearningValue(ownedState, digest);
  unchanged();
  if (actual !== expected)
    fail("stale_state", "Portfolio bytes changed; review the current state.");
  const commandHash = await hashLearningValue(ownedCommand, digest);
  unchanged();
  let next = learningClone(ownedState),
    recordId: Id | null = null,
    noOp = false;
  if (ownedCommand.kind === "draft.replace") {
    if (equal(next.draft, ownedCommand.draft)) noOp = true;
    else next.draft = learningClone(ownedCommand.draft);
  } else {
    if (next.records.length >= LEARNING_LIMITS.records)
      fail(
        "record_limit",
        "Ten retained records already exist; back up this portfolio before using another.",
      );
    const criteria = known.find(
      (k) =>
        k.id === ownedCommand.criteriaId &&
        k.hash === ownedCommand.criteriaHash,
    );
    if (!criteria)
      fail("criteria_unknown", "Select the exact known criteria version.");
    let prior: LearningRecord | null = null;
    if (ownedCommand.kind === "record.amend") {
      prior =
        next.records.find((r) => r.id === ownedCommand.expectedRecordId) ??
        null;
      if (
        !prior ||
        prior.hash !== ownedCommand.expectedRecordHash ||
        next.records.some((r) => r.previousId === prior!.id) ||
        prior.criteriaId !== criteria.id ||
        prior.criteriaHash !== criteria.hash
      )
        fail(
          "stale_record",
          "Amend only the exact current same-criteria record.",
        );
      if (prior.revision === Number.MAX_SAFE_INTEGER)
        fail("revision", "Record revision is exhausted.");
    }
    if (!next.criteria.some((c) => c.id === criteria.id))
      next.criteria.push(learningClone(criteria));
    const newId = makeId();
    unchanged();
    id(newId);
    if (
      newId === next.id ||
      next.criteria.some((c) => c.id === newId) ||
      next.records.some((r) => r.id === newId)
    )
      fail("duplicate_id", "The new opaque ID is already in use.");
    const input = validateCourseProgress(ownedCommand.source.input),
      origin = learningClone(ownedCommand.source.origin);
    const record = withHash({
      id: newId,
      seriesId: prior?.seriesId ?? newId,
      revision: prior ? prior.revision + 1 : 1,
      previousId: prior?.id ?? null,
      previousHash: prior?.hash ?? null,
      criteriaId: criteria.id,
      criteriaHash: criteria.hash,
      input,
      inputHash: hashLearningSync(input),
      origin,
      evaluation: evaluation(input, criteria),
      criteriaAffirmed: true as const,
      recordedAt: at,
      amendmentReason:
        ownedCommand.kind === "record.amend"
          ? ownedCommand.reason.trim()
          : null,
      limitations: "self-study-v1" as const,
    });
    next.records.push(record);
    recordId = newId;
    clearMatchingDraft(next, ownedCommand);
  }
  if (!noOp) {
    if (revision === Number.MAX_SAFE_INTEGER)
      fail("revision", "Workspace revision is exhausted.");
    next.revision = revision + 1;
    next.updatedAt = at;
    next = validateLearningPortfolio(next, known);
  } else next = ownedState;
  const candidateHash = await hashLearningValue(next, digest);
  unchanged();
  learningBackupBytes(next);
  return learningFreeze({
    format: "charitology-learning-mutation",
    version: 1,
    commandKind: ownedCommand.kind,
    expectedStateHash: expected,
    expectedRevision: revision,
    commandHash,
    candidateHash,
    candidate: next,
    noOp,
    summary: {
      message: noOp
        ? "Identical draft; no change was made."
        : ownedCommand.kind === "draft.replace"
          ? "Unfinished raw form updated."
          : `Self-recorded ${next.records.at(-1)!.evaluation.complete ? "completion of these checks" : "incomplete study snapshot"} appended.`,
      recordId,
    },
  });
}
export function learningRecordView(
  state: LearningPortfolioState,
  recordId: Id,
  knownCriteria: readonly CourseCriteria[],
): {
  record: LearningRecord;
  criteria: CourseCriteria;
  currentInSeries: boolean;
  history: LearningRecord[];
} {
  const valid = validateLearningPortfolio(state, knownCriteria);
  id(recordId);
  const record = valid.records.find((r) => r.id === recordId);
  if (!record) fail("record_reference", "The selected record is missing.");
  const history = valid.records.filter((r) => r.seriesId === record.seriesId);
  return learningFreeze({
    record,
    criteria: valid.criteria.find((c) => c.id === record.criteriaId)!,
    currentInSeries: history.at(-1)?.id === record.id,
    history,
  });
}
export async function makeLearningBackup(
  state: LearningPortfolioState,
  exportedAt: Instant,
  knownCriteria: readonly CourseCriteria[],
  digest?: LearningDigest,
): Promise<string> {
  const stamp = canonicalLearningJson(state),
    knownStamp = canonicalLearningJson(knownCriteria),
    valid = validateLearningPortfolio(state, knownCriteria);
  instant(exportedAt);
  learningBackupBytes(valid, exportedAt);
  const body = {
    format: "charitology-learning-portfolio-backup",
    version: 1,
    exportedAt,
    state: valid,
  };
  const checksum = await hashLearningValue(body, digest);
  if (
    canonicalLearningJson(state) !== stamp ||
    canonicalLearningJson(knownCriteria) !== knownStamp
  )
    fail(
      "input_changed",
      "Portfolio or known criteria changed while exporting.",
    );
  return JSON.stringify({ ...body, checksum }, null, 2) + "\n";
}
export async function parseLearningBackup(
  raw: string | Uint8Array,
  knownCriteria: readonly CourseCriteria[],
  digest?: LearningDigest,
): Promise<LearningPortfolioState> {
  const bytes = rawBytes(raw, LEARNING_LIMITS.backupBytes),
    stamp = rawHash(bytes),
    knownStamp = canonicalLearningJson(knownCriteria),
    known = knownDefinitions(knownCriteria),
    value = strictLearningJson(bytes, LEARNING_LIMITS.backupBytes);
  canonicalLearningJson(value);
  exact(value, ["format", "version", "exportedAt", "state", "checksum"]);
  if (
    value.format !== "charitology-learning-portfolio-backup" ||
    value.version !== 1
  )
    fail(
      "backup_version",
      "Choose a complete learning portfolio backup, not a selected packet.",
    );
  instant(value.exportedAt);
  hash(value.checksum);
  const { checksum, ...body } = value;
  const actual = await hashLearningValue(body, digest);
  if (actual !== checksum)
    fail("backup_hash", "The complete backup checksum changed.");
  const valid = validateLearningPortfolio(value.state, known);
  if (
    rawHash(rawBytes(raw, LEARNING_LIMITS.backupBytes)) !== stamp ||
    canonicalLearningJson(knownCriteria) !== knownStamp
  )
    fail(
      "input_changed",
      "Backup bytes or known criteria changed while validating.",
    );
  return valid;
}
export type LearningPacketPurpose =
  "personal-study" | "credential-proposal" | "fellowship-planning";
function csvCell(value: unknown): string {
  let s = value === null ? "" : String(value);
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
function fenced(value: string): string {
  let longest = 0;
  for (const m of value.matchAll(/`+/g))
    longest = Math.max(longest, m[0].length);
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}text\n${value}\n${fence}`;
}
export async function makeLearningPacket(
  state: LearningPortfolioState,
  recordId: Id,
  purpose: LearningPacketPurpose,
  knownCriteria: readonly CourseCriteria[],
  digest?: LearningDigest,
): Promise<{ json: string; markdown: string; csv: string; packetHash: Hash }> {
  const stamp = canonicalLearningJson(state),
    knownStamp = canonicalLearningJson(knownCriteria);
  choice(purpose, [
    "personal-study",
    "credential-proposal",
    "fellowship-planning",
  ]);
  const { record, criteria } = learningRecordView(
    state,
    recordId,
    knownCriteria,
  );
  const body = {
      format: "charitology-learning-packet",
      version: 1,
      purpose,
      criteria,
      record,
      limitations: "self-study-v1",
    },
    packetHash = await hashLearningValue(body, digest);
  if (
    canonicalLearningJson(state) !== stamp ||
    canonicalLearningJson(knownCriteria) !== knownStamp
  )
    fail(
      "input_changed",
      "Selected portfolio data changed while preparing the packet.",
    );
  const lines = [
    "# Principles of Charitology — private self-study packet",
    "",
    `Purpose: ${purpose}. This packet has not been submitted anywhere.`,
    "",
    record.evaluation.complete
      ? "Self-recorded completion of these checks."
      : "Incomplete self-study snapshot; local checks are not all satisfied.",
    "",
    `Record: ${record.id} · series revision ${record.revision} · selected immutable local version; this packet does not establish the current series head.`,
    `Criteria: ${criteria.id} · ${criteria.hash}`,
    `Input hash: ${record.inputHash}`,
    `Captured locally: ${record.recordedAt}`,
    `Declared source completion day: ${record.input.completedAt || "Unknown"} (editable source assertion; original criteria and time zone unknown).`,
    `Predecessor: ${record.previousId ?? "None"} · ${record.previousHash ?? "None"} (ancestor data is not included).`,
    "",
    "Nonaccredited. Identity, reading, learning and reasoning are not independently assessed. Public answers and length checks do not establish competence, professional certification, permission to rate charities or fellowship admission. IDs, hashes and timestamps are not signatures or external receipts.",
    "",
    `Packet checksum: ${packetHash}`,
    "",
    "## Optional private display name",
    fenced(record.input.name),
    "",
    "## Study input",
  ];
  const rows: unknown[][] = [
    [
      "record_id",
      "criteria_id",
      "unit_id",
      "reading_assertion",
      "practice_characters",
      "answer_1",
      "answer_2",
      "unit_passed",
      "private_practice",
      "declared_source_day",
      "capture_instant",
      "limitations",
    ],
  ];
  for (let i = 0; i < 10; i++) {
    const unit = criteria.units[i],
      r = record.evaluation.units[i],
      input = record.input.lessons[i];
    lines.push(
      "",
      `## Unit ${unit.chapter}: ${unit.id}`,
      `Local checks: ${r.passed ? "satisfied" : "incomplete"}; reading assertion ${input.read}; practice characters ${r.practiceCharacters}; answers ${r.answers.join(", ")}.`,
      fenced(input.practice),
    );
    rows.push([
      record.id,
      criteria.id,
      unit.id,
      input.read,
      r.practiceCharacters,
      ...r.answers,
      r.passed,
      input.practice,
      record.input.completedAt || "unknown",
      record.recordedAt,
      "self-study-v1",
    ]);
  }
  lines.push(
    "",
    "## Capstone",
    fenced(record.input.capstone),
    "",
    "The JSON packet contains exactly this selected record and its complete frozen criteria. It excludes other records, ancestors and unfinished raw forms, and cannot restore the complete portfolio or import a fellowship/credential application.",
  );
  return learningFreeze({
    json: JSON.stringify({ ...body, checksum: packetHash }, null, 2) + "\n",
    markdown: lines.join("\n") + "\n",
    csv: rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n",
    packetHash,
  });
}
