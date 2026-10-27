// Explicit source A / criteria B capture. Never run by the normal build.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  lstatSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2),
  options = new Map();
let write = false;
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (key === "--write") {
    assert(!write, "duplicate write flag");
    write = true;
    continue;
  }
  assert(
    ["--source-commit", "--id"].includes(key) &&
      i + 1 < args.length &&
      !options.has(key),
    "Use --source-commit <40 hex> --id <criteria ID> [--write]",
  );
  options.set(key, args[++i]);
}
const commit = options.get("--source-commit"),
  id = options.get("--id");
assert(
  typeof commit === "string" && /^[a-f0-9]{40}$/.test(commit),
  "An explicit committed source baseline is required",
);
assert(
  typeof id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(id),
  "A bounded explicit criteria ID is required",
);
assert.equal(
  execFileSync("git", ["rev-parse", "--verify", commit + "^{commit}"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  commit,
);
const chapterIds = [
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
];
const paths = [
  ...chapterIds.map((id) => `src/content/principles/${id}.md`),
  "src/data/program-course.ts",
  "src/data/course-capstone.ts",
];
const sources = new Map();
for (const path of paths) {
  const file = join(root, path),
    stat = lstatSync(file);
  assert(
    stat.isFile() && !stat.isSymbolicLink() && stat.size <= 131072,
    "Bounded regular source required",
  );
  const bytes = readFileSync(file);
  assert(bytes.length <= 131072);
  const pinned = execFileSync("git", ["show", commit + ":" + path], {
    cwd: root,
    maxBuffer: 1_000_000,
  });
  assert(bytes.equals(pinned), `${path} differs from explicit source baseline`);
  sources.set(path, new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
assert.deepEqual(
  readdirSync(join(root, "src/content/principles")).sort(),
  chapterIds.map((x) => x + ".md").sort(),
  "Chapter inventory changed",
);
const output = await build({
  stdin: {
    contents:
      "export {courseLessons} from './src/data/program-course.ts';export {courseCapstoneInstructions} from './src/data/course-capstone.ts';export {hashLearningSync,canonicalLearningJson,validateCourseCriteria,strictLearningJson} from './src/lib/client/learning-portfolio-model.ts';",
    resolveDir: root,
  },
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const m = await import(
  "data:text/javascript;base64," +
    Buffer.from(output.outputFiles[0].text).toString("base64")
);
const sha = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const sourceFiles = chapterIds.map((id) => {
  const path = `src/content/principles/${id}.md`,
    rawText = sources.get(path);
  return { path, rawText, rawHash: sha(rawText) };
});
const units = chapterIds.map((id, index) => {
  const lesson = m.courseLessons[index];
  assert.equal(lesson.chapter, index + 1);
  assert.equal(lesson.questions.length, 2);
  for (const q of lesson.questions) assert.equal(q.options.length, 3);
  return {
    id,
    ...lesson,
    chapterPath: sourceFiles[index].path,
    chapterHash: sourceFiles[index].rawHash,
  };
});
const core = {
  format: "charitology-course-criteria",
  version: 1,
  id,
  sourceCommit: commit,
  sourceFiles,
  units,
  capstoneInstructions: m.courseCapstoneInstructions,
  rules: {
    readRequired: true,
    practiceMin: 30,
    capstoneMin: 200,
    nameMax: 120,
    practiceMax: 5000,
    capstoneMax: 12000,
    stringLength: "javascript-utf16",
  },
  limitations: "self-study-v1",
};
const artifact = { ...core, hash: m.hashLearningSync(core) };
assert(
  Buffer.byteLength(m.canonicalLearningJson(artifact), "utf8") <= 262144,
  "Complete criteria canonical bytes exceed bound",
);
m.validateCourseCriteria(artifact, [artifact]);
const directory = join(root, "src/data/course-criteria"),
  file = join(directory, id + ".json"),
  registryPath = join(directory, "registry.json");
let registry = {
  format: "charitology-course-criteria-registry",
  version: 1,
  currentId: id,
  entries: [],
};
if (existsSync(registryPath)) {
  const stat = lstatSync(registryPath);
  assert(
    stat.isFile() && !stat.isSymbolicLink() && stat.size <= 65536,
    "Bounded regular registry required",
  );
  registry = m.strictLearningJson(readFileSync(registryPath), 65536);
}
assert.equal(registry.format, "charitology-course-criteria-registry");
assert.equal(registry.version, 1);
assert(
  Array.isArray(registry.entries) && registry.entries.length <= 20,
  "Registry full",
);
assert.deepEqual(
  Object.keys(registry).sort(),
  ["format", "version", "currentId", "entries"].sort(),
  "Unknown registry fields",
);
const oldIds = new Set(),
  oldPaths = new Set(),
  oldCriteria = [];
for (const entry of registry.entries) {
  assert.deepEqual(
    Object.keys(entry).sort(),
    ["id", "hash", "path"].sort(),
    "Unknown registry pin fields",
  );
  assert(
    typeof entry.id === "string" &&
      /^[A-Za-z0-9_-]{1,100}$/.test(entry.id) &&
      entry.path === entry.id + ".json" &&
      /^[a-f0-9]{64}$/.test(entry.hash),
    "Invalid registry pin",
  );
  assert(
    !oldIds.has(entry.id) && !oldPaths.has(entry.path),
    "Duplicate registry identity",
  );
  oldIds.add(entry.id);
  oldPaths.add(entry.path);
  const oldPath = join(directory, entry.path),
    stat = lstatSync(oldPath);
  assert(
    stat.isFile() && !stat.isSymbolicLink() && stat.size <= 2097152,
    "Bounded regular immutable artifact required",
  );
  const old = m.strictLearningJson(readFileSync(oldPath), 2097152);
  assert.equal(old.id, entry.id);
  assert.equal(old.hash, entry.hash);
  oldCriteria.push(old);
}
for (const old of oldCriteria) m.validateCourseCriteria(old, oldCriteria);
if (oldCriteria.length) {
  assert(oldIds.has(registry.currentId), "Missing current criteria");
  assert.deepEqual(
    readdirSync(directory).sort(),
    ["registry.json", ...oldPaths].sort(),
    "Unregistered criteria file",
  );
}
const existing = registry.entries.find((entry) => entry.id === id);
if (!existing) assert(registry.entries.length < 20, "Registry full");
const artifactText = JSON.stringify(artifact, null, 2) + "\n";
if (existing) {
  assert.equal(existing.hash, artifact.hash, "Existing criteria are immutable");
  assert.equal(
    readFileSync(file, "utf8"),
    artifactText,
    "Existing artifact bytes changed",
  );
} else {
  assert(!existsSync(file), "Unregistered artifact collision");
  registry = {
    ...registry,
    currentId: id,
    entries: [
      ...registry.entries,
      { id, hash: artifact.hash, path: id + ".json" },
    ],
  };
}
const candidate = {
  id,
  sourceCommit: commit,
  hash: artifact.hash,
  canonicalBytes: Buffer.byteLength(m.canonicalLearningJson(artifact)),
  prettyBytes: Buffer.byteLength(artifactText),
  chapters: 10,
  questions: 20,
  existing: !!existing,
  write,
};
console.log(JSON.stringify(candidate, null, 2));
if (write && !existing) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(file, artifactText, { flag: "wx" });
  writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");
  console.log(
    "Created immutable criteria artifact; registry points to this explicit source capture.",
  );
}
