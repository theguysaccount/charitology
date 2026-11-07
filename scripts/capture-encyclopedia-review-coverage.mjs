// Explicit local-Git preparation/application. Importing this file performs no I/O.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, mkdirSync, writeFileSync, unlinkSync, renameSync, openSync, closeSync } from "node:fs";
import { dirname, join, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readLedgerInput } from "../src/lib/research-ledger-data.mjs";
import { ENCYCLOPEDIA_INITIAL_PATHS, prepareEncyclopediaCoverage, researchLedgerFiles } from "../src/lib/research-ledger-extension.mjs";
import { canonicalResearchJson, researchRawHash } from "../src/lib/research-ledger-model.mjs";
const repository = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dataRoot = join(repository, "src/data/research-ledger");
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const decode = (bytes) => {
  const value = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  assert(Buffer.from(value).equals(bytes), "UTF-8 decode changed exact bytes");
  return value;
};
function regular(path, directory = false) {
  const stat = lstatSync(path);
  assert(!stat.isSymbolicLink() && (directory ? stat.isDirectory() : stat.isFile()), "Use regular nonsymlink files/directories");
  return stat;
}
function filesBelow(root, prefix = "") {
  regular(root, true);
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name), stat = lstatSync(path), key = prefix + name;
    assert(!stat.isSymbolicLink(), "Refusing a symbolic-link ledger path");
    return stat.isDirectory() ? filesBelow(path, key + "/") : (assert(stat.isFile(), "Use regular ledger files"), [key]);
  }).sort();
}
export function assertPriorFiles(prior, root) {
  const files = researchLedgerFiles(prior);
  assert.deepEqual(filesBelow(root), files.map((file) => file.path), "Ledger output inventory changed");
  for (const file of files) {
    const raw = readFileSync(join(root, file.path));
    assert.equal(raw.length, file.bytes, "Prior ledger byte length changed: " + file.path);
    assert.equal(researchRawHash(raw), file.sha256, "Prior ledger bytes changed: " + file.path);
  }
}
export function rebuildPreparation(prior, preparation) {
  assert(preparation && preparation.format === "charitology-encyclopedia-coverage-preparation" && preparation.version === 1, "Unsupported preparation");
  assert(Array.isArray(preparation.addedFiles) && preparation.addedFiles.length <= 105, "Bound the prepared objects");
  const sourceFiles = preparation.addedFiles.filter((file) => /^sources\/source--encyclopedia-[a-z0-9-]+-v1\.json$/.test(file.path))
    .map((file) => {
      assert(typeof file.text === "string" && Buffer.byteLength(file.text) <= 2 * 131072, "Bound each prepared source");
      const source = JSON.parse(file.text);
      return { path: source.path, rawText: source.text };
    });
  const rebuilt = prepareEncyclopediaCoverage(prior, {
    sourceCommit: preparation.sourceCommit, captureAt: preparation.capture?.at,
    captureId: preparation.capture?.id, editionId: preparation.editionId, sourceFiles,
  });
  assert.equal(canonicalResearchJson(rebuilt), canonicalResearchJson(preparation), "Preparation differs from its exact deterministic derivation");
  return rebuilt;
}
export function captureGitEnvironment(input) {
  return {
    ...Object.fromEntries(Object.entries(input).filter(([key]) => !key.startsWith("GIT_"))),
    GIT_NO_REPLACE_OBJECTS: "1", GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0",
  };
}
export function readEncyclopediaGit(root, args, options = {}) {
  return execFileSync("git", ["--no-replace-objects", "-C", root, "-c", "core.fsmonitor=false", ...args], {
    maxBuffer: 8 * 1024 * 1024, timeout: 45000, stdio: ["ignore", "pipe", "pipe"],
    encoding: options.encoding, env: captureGitEnvironment(process.env),
  });
}
const git = (args, options) => readEncyclopediaGit(repository, args, options);
export function assertSourceCaptureMetadata({ sourceCommit, head, committedAt, captureAt, worktreeStatus }) {
  assert.match(sourceCommit, /^[a-f0-9]{40}$/);
  assert.equal(sourceCommit, head, "The source ref must be the exact final reviewed HEAD");
  assert.equal(worktreeStatus, "", "Commit all required source/runtime files and resolve tracked or untracked changes before capture");
  const committedInstant = new Date(committedAt).toISOString();
  assert(captureAt >= committedInstant, "The recording instant cannot precede the actual source commit timestamp");
  return { sourceCommit, committedAt, committedInstant, head, clean: true };
}
export function verifyCommittedPreparation(prior, preparation) {
  assert.match(preparation.sourceCommit, /^[a-f0-9]{40}$/);
  assert.equal(git(["cat-file", "-t", preparation.sourceCommit], { encoding: "utf8" }).trim(), "commit", "Use an available commit");
  const sourceMetadata = assertSourceCaptureMetadata({ sourceCommit: preparation.sourceCommit,
    head: git(["rev-parse", "--verify", "HEAD"], { encoding: "utf8" }).trim(),
    committedAt: git(["show", "-s", "--format=%cI", preparation.sourceCommit], { encoding: "utf8" }).trim(),
    captureAt: preparation.capture.at,
    worktreeStatus: git(["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" }),
  });
  git(["merge-base", "--is-ancestor", preparation.sourceCommit, "HEAD"]);
  const selected = git(["ls-tree", "-r", preparation.sourceCommit, "--", "src/content/encyclopedia"], { encoding: "utf8" })
    .trim().split("\n").filter(Boolean).map((line) => {
      const match = /^100644 blob [a-f0-9]{40}\t(.+)$/.exec(line);
      assert(match, "Use only regular committed encyclopedia Markdown files");
      return match[1];
    }).sort();
  assert.deepEqual(selected, ENCYCLOPEDIA_INITIAL_PATHS, "Committed encyclopedia inventory changed");
  const current = filesBelow(join(repository, "src/content/encyclopedia")).map((path) => "src/content/encyclopedia/" + path);
  assert.deepEqual(current, selected, "Working encyclopedia inventory changed");
  const expectedFiles = researchLedgerFiles(prior);
  const committedPaths = git(["ls-tree", "-r", "--name-only", preparation.sourceCommit, "--", "src/data/research-ledger"], { encoding: "utf8" })
    .trim().split("\n").filter(Boolean).map((path) => path.slice("src/data/research-ledger/".length)).sort();
  assert.deepEqual(committedPaths, expectedFiles.map((file) => file.path), "Committed prior ledger inventory changed");
  for (const file of expectedFiles)
    assert.equal(researchRawHash(git(["show", preparation.sourceCommit + ":src/data/research-ledger/" + file.path])), file.sha256, "Committed historical ledger changed: " + file.path);
  const inventory = new Map(preparation.sourceInventory.map((source) => [source.path, source]));
  for (const path of selected) {
    const raw = git(["show", preparation.sourceCommit + ":" + path]), working = join(repository, path);
    regular(working);
    assert(raw.equals(readFileSync(working)), "Working encyclopedia source differs from the source commit: " + path);
    const expected = inventory.get(path);
    assert.equal(raw.length, expected.bytes);
    assert.equal(researchRawHash(raw), expected.sha256);
  }
  // Also protect every old covered current source, not only the newly added family.
  for (const binding of prior.manifest.currentSources) {
    const source = prior.sources.find((source) => source.id === binding.sourceId);
    const raw = git(["show", preparation.sourceCommit + ":" + source.path]);
    regular(join(repository, source.path));
    assert(raw.equals(readFileSync(join(repository, source.path))), "Working covered source changed: " + source.path);
    assert.equal(researchRawHash(raw), source.sha256, "Previous current source needs its own version/capture");
  }
  return sourceMetadata;
}
export function applyPreparedCoverage(prior, preparation, root) {
  const rebuilt = rebuildPreparation(prior, preparation);
  assertPriorFiles(prior, root);
  const lock = root + ".encyclopedia-extension.lock";
  const fd = openSync(lock, "wx", 0o600);
  const written = [], temp = join(root, ".manifest-" + rebuilt.checksum + ".tmp");
  let installed = false;
  try {
    assertPriorFiles(prior, root);
    for (const file of rebuilt.addedFiles) {
      assert(!existsSync(join(root, file.path)), "An added file already exists; inspect an interrupted attempt");
      regular(dirname(join(root, file.path)), true);
    }
    for (const file of rebuilt.addedFiles) {
      const path = join(root, file.path);
      writeFileSync(path, file.text, { flag: "wx", mode: 0o644 });
      written.push({ path, sha256: file.sha256 });
    }
    assert.equal(researchRawHash(readFileSync(join(root, "manifest.json"))), rebuilt.priorManifestSha256, "Prior manifest changed during capture");
    writeFileSync(temp, rebuilt.replacementManifest.text, { flag: "wx", mode: 0o644 });
    renameSync(temp, join(root, "manifest.json")); installed = true;
    return { added: written.length, manifestSha256: rebuilt.replacementManifest.sha256, checksum: rebuilt.checksum };
  } catch (error) {
    if (!installed) {
      for (const file of written.reverse()) {
        assert.equal(researchRawHash(readFileSync(file.path)), file.sha256, "Interrupted output changed; inspect before cleanup");
        unlinkSync(file.path);
      }
      if (existsSync(temp)) {
        assert.equal(researchRawHash(readFileSync(temp)), rebuilt.replacementManifest.sha256, "Temporary manifest changed; inspect before cleanup");
        unlinkSync(temp);
      }
    }
    throw error;
  } finally {
    closeSync(fd); unlinkSync(lock);
  }
}
function args(values) {
  const options = {};
  const allowed = new Set(["--source-ref", "--capture-at", "--capture-id", "--edition-id", "--expected-manifest-sha", "--prepare-dir", "--apply-dir", "--expected-preparation-sha"]);
  for (let i = 0; i < values.length; i += 2) {
    const key = values[i]; assert(allowed.has(key) && values[i + 1] && !values[i + 1].startsWith("--") && !Object.hasOwn(options, key), "Use explicit unique capture options");
    options[key] = values[i + 1];
  }
  return options;
}
export function runEncyclopediaCapture(values) {
  const options = args(values), prior = readLedgerInput(dataRoot);
  if (options["--apply-dir"]) {
    assert.deepEqual(Object.keys(options).sort(), ["--apply-dir", "--expected-preparation-sha"]);
    const path = join(resolve(options["--apply-dir"]), "preparation.json");
    assert(regular(path).size <= 8 * 1024 * 1024, "Bound the preparation");
    const bytes = readFileSync(path);
    assert.match(options["--expected-preparation-sha"], /^[a-f0-9]{64}$/);
    assert.equal(researchRawHash(bytes), options["--expected-preparation-sha"], "Reviewed preparation bytes changed");
    const rebuilt = rebuildPreparation(prior, JSON.parse(decode(bytes)));
    assertPriorFiles(prior, dataRoot); const sourceMetadata = verifyCommittedPreparation(prior, rebuilt);
    return { ...applyPreparedCoverage(prior, rebuilt, dataRoot), sourceMetadata };
  }
  assert.deepEqual(Object.keys(options).sort(), ["--capture-at", "--capture-id", "--edition-id", "--expected-manifest-sha", "--prepare-dir", "--source-ref"]);
  assert.match(options["--expected-manifest-sha"], /^[a-f0-9]{64}$/);
  assert.equal(researchRawHash(readFileSync(join(dataRoot, "manifest.json"))), options["--expected-manifest-sha"], "Prior manifest changed");
  assert.match(options["--source-ref"], /^[a-f0-9]{40}$/);
  const sourceFiles = ENCYCLOPEDIA_INITIAL_PATHS.map((path) => ({ path, rawText: decode(git(["show", options["--source-ref"] + ":" + path])) }));
  const preparation = prepareEncyclopediaCoverage(prior, {
    sourceCommit: options["--source-ref"], captureAt: options["--capture-at"],
    captureId: options["--capture-id"], editionId: options["--edition-id"], sourceFiles,
  });
  assertPriorFiles(prior, dataRoot); const sourceMetadata = verifyCommittedPreparation(prior, preparation);
  const cache = join(repository, ".projects/cache"), output = resolve(options["--prepare-dir"]);
  const rel = relative(cache, output);
  assert(rel && rel !== ".." && !rel.startsWith(".." + sep) && !rel.includes(sep), "Use one new named preparation folder inside .projects/cache");
  for (const path of [join(repository, ".projects"), cache]) {
    if (!existsSync(path)) mkdirSync(path); regular(path, true);
  }
  mkdirSync(output, { recursive: false, mode: 0o700 });
  const preparedBytes = json(preparation), { addedFiles, replacementManifest, ...summary } = preparation;
  writeFileSync(join(output, "preparation.json"), preparedBytes, { flag: "wx", mode: 0o600 });
  writeFileSync(join(output, "inventory.json"), json({ ...summary, sourceMetadata,
    preparationFileSha256: researchRawHash(preparedBytes),
    addedFiles: addedFiles.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
    replacementManifest: { path: replacementManifest.path, bytes: replacementManifest.bytes, sha256: replacementManifest.sha256 },
  }), { flag: "wx", mode: 0o600 });
  return { output, checksum: preparation.checksum, preparationFileSha256: researchRawHash(preparedBytes),
    manifestSha256: preparation.replacementManifest.sha256, counts: preparation.counts, added: addedFiles.length, sourceMetadata };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(json(runEncyclopediaCapture(process.argv.slice(2)))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
