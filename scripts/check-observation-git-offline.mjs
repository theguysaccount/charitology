// Local-only actual Git regression. No live source, provider or remote network is used.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  fixtureBaselineFiles,
  makeObservationCaptureFixture,
} from "../test-fixtures/observations/capture-factory.mjs";
import {
  buildObservationCandidate,
  observationCandidateFiles,
} from "../src/lib/observation-capture.mjs";
import {
  readObservationBaseline,
  readObservationGitFiles,
  checkObservationAppendOnly,
} from "../src/lib/observation-git.mjs";
import { OBSERVATION_ROOT } from "../src/lib/observation-baseline.mjs";
const parent = mkdtempSync(join(tmpdir(), "charitology-observation-offline-")),
  repo = join(parent, "repo");
mkdirSync(repo);
let groups = 0;
const run = (cwd, ...args) =>
  execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
const git = (...args) => run(repo, ...args);
const write = (name, data) => {
  const path = join(repo, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
};
const commit = (message) => {
  git("add", "--", ".");
  git("commit", "--quiet", "-m", message);
  return git("rev-parse", "HEAD");
};
const test = (name, fn) => {
  fn();
  groups++;
  console.log(`✓ ${name}`);
};
try {
  git("init", "--quiet", "-b", "main");
  git("config", "user.name", "Fictional offline regression");
  git("config", "user.email", "fixture@example.invalid");
  const baselineFiles = fixtureBaselineFiles();
  for (const [name, data] of Object.entries(baselineFiles)) write(name, data);
  const A = commit("Fictional exact interpretation A");
  const fixture = makeObservationCaptureFixture({
    sourceCommit: A,
    baselineFiles,
  });
  const candidate = observationCandidateFiles(
    buildObservationCandidate(
      null,
      fixture.prepared,
      readObservationBaseline(repo, A),
      fixture.request,
    ),
  );
  for (const [name, data] of Object.entries(candidate))
    write(`${OBSERVATION_ROOT}/${name}`, data);
  const B = commit("Fictional exact dataset B");
  const prove = () =>
    checkObservationAppendOnly({ repo, exactBase: A, exactHead: B });
  test("Clean ordinary working files match the exact committed source and dataset", () => {
    assert.equal(prove().mode, "bootstrap-verified");
  });
  test("Assume-unchanged cannot hide modified interpretation bytes from the direct working-tree proof", () => {
    const name = "src/data/observation-definitions.json",
      original = readFileSync(join(repo, name));
    git("update-index", "--assume-unchanged", "--", name);
    try {
      write(name, Buffer.concat([original, Buffer.from(" ")]));
      assert.equal(git("status", "--porcelain=v1", "--", name), "");
      assert.throws(prove, /working interpretation.*uncommitted byte/);
    } finally {
      write(name, original);
      git("update-index", "--no-assume-unchanged", "--", name);
    }
    assert.equal(prove().mode, "bootstrap-verified");
  });
  test("Skip-worktree cannot hide changed or removed dataset files", () => {
    const name = `${OBSERVATION_ROOT}/registry.json`,
      original = readFileSync(join(repo, name));
    git("update-index", "--skip-worktree", "--", name);
    try {
      write(name, Buffer.concat([original, Buffer.from(" ")]));
      assert.equal(git("status", "--porcelain=v1", "--", name), "");
      assert.throws(prove, /working dataset.*uncommitted.*byte/);
      rmSync(join(repo, name));
      assert.equal(git("status", "--porcelain=v1", "--", name), "");
      assert.throws(prove, /working dataset file is missing/);
    } finally {
      write(name, original);
      git("update-index", "--no-skip-worktree", "--", name);
    }
    assert.equal(prove().mode, "bootstrap-verified");
  });
  test("Ignored nested orphan files are inventoried without relying on Git status", () => {
    const name = `${OBSERVATION_ROOT}/ignored-fixture/orphan.json`,
      excludes = join(repo, ".git/info/exclude"),
      original = readFileSync(excludes);
    writeFileSync(
      excludes,
      Buffer.concat([original, Buffer.from("\nignored-fixture/\n")]),
    );
    try {
      write(name, "Fictional ignored orphan\n");
      assert.equal(
        git("status", "--porcelain=v1", "--untracked-files=all", "--", name),
        "",
      );
      assert.throws(prove, /working dataset.*uncommitted inventory/);
    } finally {
      rmSync(join(repo, OBSERVATION_ROOT, "ignored-fixture"), {
        recursive: true,
      });
      writeFileSync(excludes, original);
    }
    assert.equal(prove().mode, "bootstrap-verified");
  });
  test("Hidden oversized and symlinked working files refuse before data admission", () => {
    const name = "src/data/observation-definitions.json",
      original = readFileSync(join(repo, name));
    git("update-index", "--assume-unchanged", "--", name);
    try {
      write(name, Buffer.alloc(2 * 1024 * 1024 + 1, 32));
      assert.throws(prove, /ordinary-file bound/);
      rmSync(join(repo, name));
      symlinkSync("observation-source-inputs.json", join(repo, name));
      assert.throws(prove, /ordinary-file bound/);
    } finally {
      rmSync(join(repo, name), { force: true });
      write(name, original);
      git("update-index", "--no-assume-unchanged", "--", name);
    }
    const link = `${OBSERVATION_ROOT}/ignored-link`;
    try {
      symlinkSync("../", join(repo, link));
      assert.throws(prove, /working dataset symlink/);
    } finally {
      rmSync(join(repo, link));
    }
    assert.equal(prove().mode, "bootstrap-verified");
  });
  test("Available commits with missing promisor blobs refuse without lazy fetch or object-store changes", () => {
    git("config", "uploadpack.allowFilter", "true");
    const partial = join(parent, "partial");
    execFileSync(
      "git",
      [
        "clone",
        "--quiet",
        "--filter=blob:none",
        "--no-checkout",
        pathToFileURL(repo).href,
        partial,
      ],
      { stdio: ["ignore", "pipe", "pipe"], timeout: 30000 },
    );
    assert.equal(run(partial, "rev-parse", "--verify", `${B}^{commit}`), B);
    assert.equal(run(partial, "cat-file", "-t", B), "commit");
    const missing = () =>
      run(partial, "rev-list", "--objects", "--missing=print", "HEAD")
        .split("\n")
        .filter((line) => line.startsWith("?")).length;
    const packs = () => readdirSync(join(partial, ".git/objects/pack")).sort();
    const before = missing(),
      packNames = packs();
    assert.ok(before > 0, "fixture must have genuinely unavailable blobs");
    assert.throws(
      () => readObservationGitFiles(partial, B),
      /unavailable|batched|unsupported Git object/,
    );
    assert.equal(
      missing(),
      before,
      "reading available tree must not hydrate any missing object",
    );
    assert.deepEqual(packs(), packNames, "no promisor fetch pack may appear");
    assert.throws(
      () => readObservationBaseline(partial, A),
      /unavailable|batched|unsupported Git object/,
    );
    assert.equal(missing(), before);
    assert.deepEqual(packs(), packNames);
  });
  test("A committed current-definition edit without an explicit new method capture cannot borrow the old edition", () => {
    const definitionPath = "src/data/observation-definitions.json";
    const definitions = JSON.parse(
      readFileSync(join(repo, definitionPath), "utf8"),
    );
    definitions.countryProjection.title =
      "Changed fictional interpretation after captured baseline";
    write(definitionPath, JSON.stringify(definitions, null, 2) + "\n");
    const changedHead = commit(
      "Fictional interpretation edit without new capture",
    );
    assert.throws(
      () =>
        checkObservationAppendOnly({
          repo,
          exactBase: B,
          exactHead: changedHead,
        }),
      /current|interpretation|baseline|source A/,
    );
  });
  console.log(
    `${groups} actual local-only observation offline/base groups passed.`,
  );
} finally {
  rmSync(parent, { recursive: true, force: true });
}
