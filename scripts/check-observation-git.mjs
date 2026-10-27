import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import {
  fixtureBaselineFiles,
  makeObservationCaptureFixture,
  changedObservationCaptureFixture,
} from "../test-fixtures/observations/capture-factory.mjs";
import {
  buildObservationCandidate,
  observationCandidateFiles,
} from "../src/lib/observation-capture.mjs";
import {
  observationPrettyJson,
  observationObjectHash,
  observationRawHash,
} from "../src/lib/observation-canonical.mjs";
import { validateObservationFiles } from "../src/lib/observation-model.mjs";
import {
  readObservationBaseline,
  readObservationGitFiles,
  checkObservationAppendOnly,
} from "../src/lib/observation-git.mjs";
import { OBSERVATION_ROOT } from "../src/lib/observation-baseline.mjs";

let groups = 0;
const test = (name, fn) => {
  fn();
  groups++;
  console.log(`✓ ${name}`);
};
const parent = mkdtempSync(join(tmpdir(), "charitology-observation-git-"));
const repo = join(parent, "repo");
mkdirSync(repo);
const git = (...args) =>
  execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  }).trim();
const write = (path, bytes) => {
  const target = join(repo, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
};
const commit = (message) => {
  git("add", "--", ".");
  git("commit", "--quiet", "-m", message);
  return git("rev-parse", "HEAD");
};
function dataset(files) {
  rmSync(join(repo, OBSERVATION_ROOT), { recursive: true, force: true });
  for (const [path, bytes] of Object.entries(files))
    write(`${OBSERVATION_ROOT}/${path}`, bytes);
}
function reindex(files) {
  const result = { ...files },
    registry = JSON.parse(result["registry.json"]);
  registry.files = Object.keys(result)
    .filter((path) => path !== "registry.json")
    .sort()
    .map((path) => ({
      path,
      sha256: observationRawHash(result[path]),
      bytes: Buffer.byteLength(result[path]),
    }));
  registry.hash = observationObjectHash(registry);
  result["registry.json"] = observationPrettyJson(registry);
  return result;
}
try {
  git("init", "--quiet", "-b", "main");
  git("config", "user.name", "Fictional observation fixture");
  git("config", "user.email", "fixture@example.invalid");
  const baselineFiles = fixtureBaselineFiles();
  for (const [path, bytes] of Object.entries(baselineFiles)) write(path, bytes);
  const A = commit("Fictional committed source A");
  const first = makeObservationCaptureFixture({
    sourceCommit: A,
    baselineFiles,
  });
  const firstPreview = buildObservationCandidate(
    null,
    first.prepared,
    readObservationBaseline(repo, A),
    first.request,
  );
  const initial = observationCandidateFiles(firstPreview);
  dataset(initial);
  const B = commit("Fictional first immutable dataset B");
  test("Actual committed bootstrap proves absent root and source A with batched object reads", () => {
    assert.deepEqual(readObservationGitFiles(repo, A), {});
    const proof = checkObservationAppendOnly({
      repo,
      exactBase: A,
      exactHead: B,
    });
    assert.equal(proof.mode, "bootstrap-verified");
    assert.equal(proof.sourceBaselineChecked, A);
    assert.equal(proof.oldFilesChecked, 0);
    assert.equal(
      Object.keys(readObservationGitFiles(repo, B)).length,
      Object.keys(initial).length,
    );
  });
  test("Git inputs are detached and exact SHA/checkout requirements reject inferred or wrong heads", () => {
    const copy = readObservationGitFiles(repo, B),
      path = Object.keys(copy)[0],
      byte = copy[path][0];
    copy[path][0] ^= 255;
    assert.equal(readObservationGitFiles(repo, B)[path][0], byte);
    for (const exactBase of ["main", "0".repeat(40), "a".repeat(40)])
      assert.throws(() =>
        checkObservationAppendOnly({ repo, exactBase, exactHead: B }),
      );
    assert.throws(
      () => checkObservationAppendOnly({ repo, exactBase: A, exactHead: A }),
      /checkout differs/,
    );
  });
  write(
    "fixture-method-capture.txt",
    "Explicit fictional source baseline for the next capture\n",
  );
  const A2 = commit(
    "Fictional second committed source A retains the prior edition",
  );
  const second = changedObservationCaptureFixture(first, {
    sourceCommit: A2,
    previousCommit: B,
    previousRegistry: JSON.parse(initial["registry.json"]),
  });
  const changedPreview = buildObservationCandidate(
    initial,
    second.prepared,
    readObservationBaseline(repo, A2),
    second.request,
  );
  const changed = observationCandidateFiles(changedPreview);
  dataset(changed);
  const C = commit("Fictional complete changed vintage");
  test("Actual append preserves every old file and records a complete changed source vintage", () => {
    const proof = checkObservationAppendOnly({
      repo,
      exactBase: B,
      exactHead: C,
    });
    assert.equal(proof.mode, "append-verified");
    assert.equal(proof.oldFilesChecked, Object.keys(initial).length - 1);
    for (const [path, bytes] of Object.entries(initial))
      if (path !== "registry.json") assert.equal(changed[path], bytes);
    assert.equal(
      changedPreview.diff.changed.filter(
        (entry) => entry.after.kind === "observation",
      ).length,
      5,
    );
    assert.equal(
      changedPreview.diff.changed.filter(
        (entry) =>
          entry.after.kind === "source" &&
          entry.after.id.startsWith("wb-values-"),
      ).length,
      5,
    );
  });
  test("Dirty declared interpretation and untracked dataset bytes cannot borrow the committed proof", () => {
    const path = "src/data/observation-definitions.json",
      original = readFileSync(join(repo, path));
    write(path, Buffer.concat([original, Buffer.from(" ")]));
    assert.throws(
      () => checkObservationAppendOnly({ repo, exactBase: B, exactHead: C }),
      /uncommitted/,
    );
    write(path, original);
    write(`${OBSERVATION_ROOT}/orphan.txt`, "fictional");
    assert.throws(
      () => checkObservationAppendOnly({ repo, exactBase: B, exactHead: C }),
      /uncommitted/,
    );
    rmSync(join(repo, OBSERVATION_ROOT, "orphan.txt"));
  });
  test("A model-valid rewrite of old edition bytes is refused by the actual committed-base gate", () => {
    const rewritten = { ...changed };
    const oldPath = `editions/${JSON.parse(initial["registry.json"]).current.id}.json`;
    const edition = JSON.parse(rewritten[oldPath]);
    edition.limitations.push("Changed historical wording");
    edition.hash = observationObjectHash(edition);
    rewritten[oldPath] = observationPrettyJson(edition);
    const registry = JSON.parse(rewritten["registry.json"]);
    registry.editions[0].hash = edition.hash;
    const currentPath = `editions/${registry.current.id}.json`,
      currentEdition = JSON.parse(rewritten[currentPath]);
    currentEdition.supersedes.hash = edition.hash;
    currentEdition.hash = observationObjectHash(currentEdition);
    rewritten[currentPath] = observationPrettyJson(currentEdition);
    registry.current.hash = currentEdition.hash;
    registry.editions.at(-1).hash = currentEdition.hash;
    rewritten["registry.json"] = observationPrettyJson(registry);
    const final = reindex(rewritten);
    validateObservationFiles(final);
    dataset(final);
    const rewrittenHead = commit("Fictional prohibited historical rewrite");
    assert.throws(
      () =>
        checkObservationAppendOnly({
          repo,
          exactBase: C,
          exactHead: rewrittenHead,
        }),
      /edition predecessor|earlier immutable file/,
    );
    git("checkout", "--quiet", C);
  });
  test("Unavailable shallow history fails closed without fetching or adopting another base", () => {
    const shallow = join(parent, "shallow");
    execFileSync(
      "git",
      ["clone", "--quiet", "--depth", "1", pathToFileURL(repo).href, shallow],
      { stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 },
    );
    assert.throws(
      () =>
        checkObservationAppendOnly({
          repo: shallow,
          exactBase: A,
          exactHead: C,
        }),
      /unavailable/,
    );
  });
  test("Symlink and oversized committed source objects are refused before JSON admission", () => {
    symlinkSync("registry.json", join(repo, OBSERVATION_ROOT, "bad.json"));
    const badLink = commit("Fictional forbidden data symlink");
    assert.throws(() => readObservationGitFiles(repo, badLink), /symlink/);
    git("checkout", "--quiet", C);
    write(
      `${OBSERVATION_ROOT}/too-large.json`,
      Buffer.alloc(2 * 1024 * 1024 + 1, 32),
    );
    const tooLarge = commit("Fictional over-bound data object");
    assert.throws(() => readObservationGitFiles(repo, tooLarge), /whole bound/);
    git("checkout", "--quiet", C);
  });
  test("A sibling commit is not a permissible base, even when all its objects are available", () => {
    git("checkout", "--quiet", A);
    write("fictional-branch.txt", "Unrelated sibling\n");
    const sibling = commit("Fictional sibling history");
    git("checkout", "--quiet", C);
    assert.throws(
      () =>
        checkObservationAppendOnly({ repo, exactBase: sibling, exactHead: C }),
      /ancestry/,
    );
  });
  console.log(`${groups} actual observation Git-history groups passed.`);
} finally {
  rmSync(parent, { recursive: true, force: true });
}
