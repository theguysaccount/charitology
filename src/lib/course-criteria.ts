/** Checked-in, immutable self-study criteria; no clock, Git or network during builds. */
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { courseLessons } from "../data/program-course";
import { courseCapstoneInstructions } from "../data/course-capstone";
import {
  strictLearningJson,
  validateCourseCriteria,
  hashLearningSync,
  type CourseCriteria,
  type CriteriaRegistry,
} from "./client/learning-portfolio-model";

export const INITIAL_COURSE_CRITERIA = Object.freeze({
  id: "principles-2026-10-27",
  hash: "36c075ae85ff3923c3ec217c8d7e7a3292da90835c885f9cc096ea7f6932b1bb",
  sourceCommit: "49bc24a5149d3593c3a52a3b75fa7ff421037943",
});

export const COURSE_CHAPTER_IDS = [
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
] as const;
const root = process.cwd().replace(/\/$/, "");
const directory = join(root, "src/data/course-criteria");
const rawHash = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");
function assert(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Course criteria: ${message}`);
}
function regularDirectory(path: string): void {
  assert(
    path === root || path.startsWith(root + "/"),
    "source escaped repository root",
  );
  let current = root;
  for (const part of path
    .slice(root.length + 1)
    .split("/")
    .filter(Boolean)) {
    current = join(current, part);
    const info = lstatSync(current);
    assert(
      info.isDirectory() && !info.isSymbolicLink(),
      "source ancestors must be regular directories",
    );
  }
}
function text(path: string, limit: number): string {
  assert(path.startsWith(root + "/"), "source escaped repository root");
  regularDirectory(dirname(path));
  const stat = lstatSync(path);
  assert(
    stat.isFile() && !stat.isSymbolicLink() && stat.size <= limit,
    "source must be a bounded regular file",
  );
  const bytes = readFileSync(path);
  assert(bytes.byteLength <= limit, "source grew beyond bound");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
function plain(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
export interface CourseCriteriaBundle {
  criteriaRegistry: CriteriaRegistry;
  currentCriteria: CourseCriteria;
  knownCriteria: readonly CourseCriteria[];
}
/** Also exported for the checker: verifies all real bindings, not two coincident arrays. */
export function verifyCurrentCourseCriteria(criteria: CourseCriteria): void {
  assert(
    criteria.sourceFiles.length === 10 &&
      criteria.units.length === 10 &&
      courseLessons.length === 10,
    "exact ten-unit shape required",
  );
  regularDirectory(join(root, "src/content/principles"));
  const actualNames = readdirSync(join(root, "src/content/principles")).sort();
  assert(
    hashLearningSync(actualNames) ===
      hashLearningSync(COURSE_CHAPTER_IDS.map((id) => `${id}.md`).sort()),
    "chapter inventory changed; capture a new criteria edition",
  );
  for (const [index, id] of COURSE_CHAPTER_IDS.entries()) {
    const path = `src/content/principles/${id}.md`,
      source = criteria.sourceFiles[index],
      unit = criteria.units[index],
      lesson = courseLessons[index];
    const raw = text(join(root, path), 131_072);
    assert(
      source.path === path &&
        source.rawText === raw &&
        source.rawHash === rawHash(raw),
      `${id}: current chapter bytes changed; capture a new edition`,
    );
    assert(
      unit.id === id &&
        unit.chapter === index + 1 &&
        lesson.chapter === index + 1 &&
        unit.chapterPath === path &&
        unit.chapterHash === source.rawHash,
      `${id}: chapter/unit binding changed`,
    );
    const {
      id: _id,
      chapterPath: _path,
      chapterHash: _hash,
      ...capturedLesson
    } = unit;
    assert(
      hashLearningSync(capturedLesson) === hashLearningSync(lesson),
      `${id}: questions, order or practice changed; capture a new edition`,
    );
  }
  assert(
    criteria.capstoneInstructions === courseCapstoneInstructions,
    "capstone instructions changed; capture a new edition",
  );
  assert(
    hashLearningSync(criteria.rules) ===
      hashLearningSync({
        readRequired: true,
        practiceMin: 30,
        capstoneMin: 200,
        nameMax: 120,
        practiceMax: 5000,
        capstoneMax: 12000,
        stringLength: "javascript-utf16",
      }),
    "current rules changed; capture a new edition",
  );
}
export function loadCourseCriteria(): CourseCriteriaBundle {
  const directoryStat = lstatSync(directory);
  assert(
    directoryStat.isDirectory() && !directoryStat.isSymbolicLink(),
    "registry directory must be regular",
  );
  const raw = strictLearningJson(
    text(join(directory, "registry.json"), 65_536),
    65_536,
  );
  assert(
    plain(raw) &&
      hashLearningSync(Object.keys(raw).sort()) ===
        hashLearningSync(["format", "version", "currentId", "entries"].sort()),
    "unknown registry fields",
  );
  assert(
    raw.format === "charitology-course-criteria-registry" &&
      raw.version === 1 &&
      typeof raw.currentId === "string" &&
      Array.isArray(raw.entries) &&
      raw.entries.length > 0 &&
      raw.entries.length <= 20,
    "invalid registry",
  );
  const seen = new Set<string>(),
    paths = new Set<string>(),
    artifacts: CourseCriteria[] = [];
  for (const value of raw.entries) {
    assert(
      plain(value) &&
        hashLearningSync(Object.keys(value).sort()) ===
          hashLearningSync(["id", "hash", "path"].sort()),
      "invalid registry entry",
    );
    assert(
      typeof value.id === "string" &&
        /^[A-Za-z0-9_-]{1,100}$/.test(value.id) &&
        typeof value.hash === "string" &&
        /^[a-f0-9]{64}$/.test(value.hash) &&
        value.path === `${value.id}.json`,
      "invalid registry pin",
    );
    assert(
      !seen.has(value.id) && !paths.has(value.path as string),
      "duplicate registry identity",
    );
    seen.add(value.id);
    paths.add(value.path as string);
    const artifact = strictLearningJson(
      text(join(directory, value.path as string), 2_097_152),
      2_097_152,
    ) as CourseCriteria;
    assert(
      artifact.id === value.id && artifact.hash === value.hash,
      "artifact differs from registry pin",
    );
    assert(
      new TextEncoder().encode(JSON.stringify(artifact)).length <= 262_144,
      "criteria exceeds canonical bound",
    );
    artifacts.push(artifact);
  }
  assert(
    hashLearningSync(readdirSync(directory).sort()) ===
      hashLearningSync(["registry.json", ...paths].sort()),
    "unregistered criteria files",
  );
  assert(
    artifacts.some(
      (value) =>
        value.id === INITIAL_COURSE_CRITERIA.id &&
        value.hash === INITIAL_COURSE_CRITERIA.hash &&
        value.sourceCommit === INITIAL_COURSE_CRITERIA.sourceCommit,
    ),
    "initial criteria pin cannot be removed or replaced",
  );
  const validated = artifacts.map((value) =>
    validateCourseCriteria(value, artifacts),
  );
  const current = validated.find((value) => value.id === raw.currentId);
  assert(current, "current criteria missing");
  verifyCurrentCourseCriteria(current);
  const registry = raw as unknown as CriteriaRegistry;
  const deepFreeze = <T>(value: T): T => {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) deepFreeze(child);
      Object.freeze(value);
    }
    return value;
  };
  return deepFreeze({
    criteriaRegistry: registry,
    currentCriteria: current,
    knownCriteria: validated,
  });
}
