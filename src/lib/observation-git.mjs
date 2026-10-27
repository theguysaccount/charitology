// Explicit maintainer/CI I/O. Offline build and browser projections never import
// Git or replace an unavailable history proof with a network lookup.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  opendirSync,
  readSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
  OBSERVATION_ROOT,
  OBSERVATION_BASELINE_PATHS,
  observationMethodPins,
} from "./observation-baseline.mjs";
import { validateObservationFiles } from "./observation-model.mjs";
import { canonicalObservationJson } from "./observation-canonical.mjs";

const SHA = /^[a-f0-9]{40}$/;
const utf8 = new TextDecoder("utf-8", { fatal: true });
const root = OBSERVATION_ROOT.replace(/\/$/, "");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const same = (a, b) =>
  a !== undefined &&
  b !== undefined &&
  canonicalObservationJson(a) === canonicalObservationJson(b);
function fail(message) {
  throw new Error(`Observation committed-base proof: ${message}`);
}
function commit(value) {
  if (typeof value !== "string" || !SHA.test(value) || /^0+$/.test(value))
    fail("an exact nonzero forty-character commit is required");
  return value;
}
function git(repo, args, { input, maxBuffer = 8 * 1024 * 1024 } = {}) {
  if (typeof repo !== "string" || !repo || repo.length > 4096)
    fail("invalid repository path");
  try {
    return execFileSync(
      "git",
      ["--no-replace-objects", "-C", resolve(repo), ...args],
      {
        input,
        maxBuffer,
        timeout: 45_000,
        stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          GIT_NO_REPLACE_OBJECTS: "1",
          GIT_NO_LAZY_FETCH: "1",
          GIT_TERMINAL_PROMPT: "0",
        },
      },
    );
  } catch {
    fail("required local Git objects or ancestry are unavailable");
  }
}
function text(bytes) {
  try {
    return utf8.decode(bytes);
  } catch {
    fail("invalid UTF-8 in Git metadata");
  }
}
function verifiedCommit(repo, value) {
  commit(value);
  if (
    text(git(repo, ["rev-parse", "--verify", `${value}^{commit}`])).trim() !==
    value
  )
    fail("the exact commit did not resolve");
  return value;
}
function ancestor(repo, before, after) {
  git(repo, ["merge-base", "--is-ancestor", before, after], {
    maxBuffer: 1024,
  });
}

// The index can hide modifications via assume-unchanged/skip-worktree. Prove
// actual ordinary working files independently; Git status is only supplementary.
function ordinaryDirectory(directory) {
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    fail("working interpretation or dataset contains a nonordinary directory");
}
function safeWorkingPath(path) {
  if (
    path.length > 300 ||
    /[\x00-\x1f\x7f\\]/.test(path) ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    fail("unsafe working interpretation or dataset path");
}
function boundedWorkingFile(filename, maximum) {
  if (
    !Number.isInteger(constants.O_NOFOLLOW) ||
    !Number.isInteger(constants.O_NONBLOCK)
  )
    fail("bounded no-follow ordinary-file reads are unavailable");
  const stat = lstatSync(filename, { bigint: true });
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size < 0n ||
    stat.size > BigInt(maximum)
  )
    fail(
      "working interpretation or dataset file exceeds its ordinary-file bound",
    );
  const fd = openSync(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const unchanged = (other) =>
      other.isFile() &&
      other.dev === stat.dev &&
      other.ino === stat.ino &&
      other.size === stat.size &&
      other.mtimeNs === stat.mtimeNs &&
      other.ctimeNs === stat.ctimeNs;
    if (!unchanged(fstatSync(fd, { bigint: true })))
      fail("working file changed before bounded read");
    // One extra byte detects growth; never use an unbounded readFileSync.
    const buffer = Buffer.alloc(Number(stat.size) + 1);
    let used = 0;
    while (used < buffer.length) {
      const count = readSync(fd, buffer, used, buffer.length - used, null);
      if (count === 0) break;
      used += count;
    }
    if (
      used !== Number(stat.size) ||
      !unchanged(fstatSync(fd, { bigint: true })) ||
      !unchanged(lstatSync(filename, { bigint: true }))
    )
      fail("working file changed during bounded read");
    return buffer.subarray(0, used);
  } finally {
    closeSync(fd);
  }
}
function workingWithin(repo, path, maximum) {
  safeWorkingPath(path);
  const parts = path.split("/");
  let current = resolve(repo);
  ordinaryDirectory(current);
  for (const part of parts.slice(0, -1)) {
    current = join(current, part);
    ordinaryDirectory(current);
  }
  return boundedWorkingFile(join(current, parts.at(-1)), maximum);
}
function verifyWorkingInputs(repo, baseline, dataset) {
  let baselineBytes = 0;
  for (const file of baseline.files) {
    const bytes = workingWithin(repo, file.path, 2 * 1024 * 1024);
    baselineBytes += bytes.length;
    if (baselineBytes > 5 * 1024 * 1024)
      fail("working interpretation bytes exceed the whole bound");
    if (!bytes.equals(Buffer.from(file.bytes)))
      fail("the working interpretation has uncommitted byte changes");
  }
  const absoluteRoot = join(resolve(repo), root),
    seen = new Set();
  // Check all parent components before walking, including ignored files. Keep
  // directory enumeration bounded too: many empty directories cannot evade it.
  let current = resolve(repo);
  ordinaryDirectory(current);
  for (const part of root.split("/")) {
    current = join(current, part);
    ordinaryDirectory(current);
  }
  let entries = 0,
    total = 0;
  function walk(directory, relative = "", depth = 0) {
    if (depth > 32) fail("working dataset directory nesting exceeds the bound");
    ordinaryDirectory(directory);
    const handle = opendirSync(directory);
    try {
      for (let item; (item = handle.readSync()) !== null;) {
        if (++entries > 28_002)
          fail("working dataset inventory exceeds the whole bound");
        const path = relative ? relative + "/" + item.name : item.name;
        safeWorkingPath(path);
        const filename = join(directory, item.name),
          stat = lstatSync(filename);
        if (stat.isSymbolicLink()) fail("working dataset symlink refused");
        if (stat.isDirectory()) {
          walk(filename, path, depth + 1);
          continue;
        }
        if (!stat.isFile() || seen.size >= 14_001)
          fail("working dataset ordinary-file count exceeds the whole bound");
        const bytes = boundedWorkingFile(filename, 2 * 1024 * 1024);
        total += bytes.length;
        if (total > 20 * 1024 * 1024)
          fail("working dataset bytes exceed the whole bound");
        if (
          !Object.hasOwn(dataset, path) ||
          !bytes.equals(Buffer.from(dataset[path]))
        )
          fail("the working dataset has uncommitted inventory or byte changes");
        seen.add(path);
      }
    } finally {
      handle.closeSync();
    }
  }
  walk(absoluteRoot);
  if (
    seen.size !== Object.keys(dataset).length ||
    Object.keys(dataset).some((path) => !seen.has(path))
  )
    fail("a committed working dataset file is missing");
}

// Read each blob once in a bounded cat-file batch. No process per observation.
function readTree(
  repo,
  exactCommit,
  paths,
  { maxFiles, maxBytes, maxFile, exact = false },
) {
  verifiedCommit(repo, exactCommit);
  const rows = text(
    git(repo, [
      "ls-tree",
      "-rz",
      "-l",
      "--full-tree",
      exactCommit,
      "--",
      ...paths,
    ]),
  )
    .split("\0")
    .filter(Boolean);
  if (rows.length > maxFiles) fail("Git file count exceeds the whole bound");
  const entries = [],
    seen = new Set();
  let total = 0;
  for (const row of rows) {
    const match =
      /^(100644|100755) blob ([a-f0-9]{40})\s+(\d+)\t([^\0]+)$/.exec(row);
    if (!match) fail("symlink, submodule or unsupported Git object");
    const [, mode, oid, sizeText, path] = match;
    const size = Number(sizeText);
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > maxFile ||
      (total += size) > maxBytes
    )
      fail("Git object bytes exceed the whole bound");
    if (
      path.length > 300 ||
      /[\x00-\x1f\x7f\\]/.test(path) ||
      path.split("/").some((p) => !p || p === "." || p === "..") ||
      seen.has(path)
    )
      fail("unsafe or duplicate Git path");
    if (exact ? !paths.includes(path) : !path.startsWith(root + "/"))
      fail("Git path is outside the exact inventory");
    if (!exact && mode !== "100644")
      fail("data files must have ordinary file mode");
    seen.add(path);
    entries.push({ path, oid, size });
  }
  if (
    exact &&
    (entries.length !== paths.length || paths.some((path) => !seen.has(path)))
  )
    fail("a committed interpretation input is missing");
  const result = Object.create(null);
  if (!entries.length) return result;
  const unique = [...new Set(entries.map((entry) => entry.oid))];
  const output = git(repo, ["cat-file", "--batch"], {
    input: Buffer.from(unique.join("\n") + "\n"),
    maxBuffer: maxBytes + unique.length * 128 + 1024,
  });
  const blobs = new Map();
  let at = 0;
  for (const oid of unique) {
    const end = output.indexOf(10, at);
    if (end < at || end - at > 100) fail("invalid batched Git header");
    const header = /^(\w{40}) blob (\d+)$/.exec(text(output.subarray(at, end)));
    if (!header || header[1] !== oid) fail("batched Git object mismatch");
    const length = Number(header[2]);
    if (!Number.isSafeInteger(length) || length > maxFile || length < 0)
      fail("invalid batched object length");
    at = end + 1;
    if (at + length >= output.length || output[at + length] !== 10)
      fail("incomplete batched Git object");
    blobs.set(oid, Uint8Array.from(output.subarray(at, at + length)));
    at += length + 1;
  }
  if (at !== output.length) fail("unexpected trailing batched Git bytes");
  for (const entry of entries) {
    const bytes = blobs.get(entry.oid);
    if (!bytes || bytes.byteLength !== entry.size)
      fail("Git tree/blob size mismatch");
    result[entry.path] = Uint8Array.from(bytes);
  }
  return result;
}

export function readObservationGitFiles(repo, exactCommit) {
  const files = readTree(repo, exactCommit, [root], {
    maxFiles: 14_001,
    maxBytes: 20 * 1024 * 1024,
    maxFile: 2 * 1024 * 1024,
  });
  return Object.fromEntries(
    Object.entries(files).map(([path, bytes]) => [
      path.slice(root.length + 1),
      bytes,
    ]),
  );
}

export function readObservationBaseline(repo, exactCommit) {
  if (
    !Array.isArray(OBSERVATION_BASELINE_PATHS) ||
    !OBSERVATION_BASELINE_PATHS.length ||
    OBSERVATION_BASELINE_PATHS.length > 100 ||
    new Set(OBSERVATION_BASELINE_PATHS).size !==
      OBSERVATION_BASELINE_PATHS.length
  )
    fail("invalid fixed interpretation inventory");
  const paths = [...OBSERVATION_BASELINE_PATHS].sort();
  const files = readTree(repo, exactCommit, paths, {
    maxFiles: 100,
    maxBytes: 5 * 1024 * 1024,
    maxFile: 2 * 1024 * 1024,
    exact: true,
  });
  return {
    commit: exactCommit,
    files: paths.map((path) => ({
      path,
      sha256: digest(files[path]),
      bytes: Uint8Array.from(files[path]),
    })),
  };
}

export function checkObservationAppendOnly({ repo, exactBase, exactHead }) {
  verifiedCommit(repo, exactBase);
  verifiedCommit(repo, exactHead);
  if (
    text(git(repo, ["rev-parse", "--verify", "HEAD^{commit}"])).trim() !==
    exactHead
  )
    fail("the checkout differs from the exact head");
  ancestor(repo, exactBase, exactHead);
  const previousFiles = readObservationGitFiles(repo, exactBase);
  const currentFiles = readObservationGitFiles(repo, exactHead);
  if (!Object.keys(currentFiles).length)
    fail("the head has no observation registry");
  const actualInterpretation = readObservationBaseline(repo, exactHead);
  verifyWorkingInputs(repo, actualInterpretation, currentFiles);
  // A historical proof must not be used to bless different working-tree inputs.
  const relevant = [root, ...OBSERVATION_BASELINE_PATHS];
  if (
    text(
      git(repo, [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--ignored=matching",
        "--",
        ...relevant,
      ]),
    ).length
  )
    fail("the checked interpretation or dataset has uncommitted changes");
  const current = validateObservationFiles(currentFiles);
  const previous = Object.keys(previousFiles).length
    ? validateObservationFiles(previousFiles)
    : null;
  const baselines = new Map(),
    sourceStates = new Map();
  const currentPins = new Map(
    current.registry.records.map((pin) => [
      `${pin.kind}/${pin.id}/${pin.version}`,
      pin,
    ]),
  );
  function retainCommittedState(files, admitted) {
    for (const [path, bytes] of Object.entries(files)) {
      if (path === "registry.json") continue;
      if (
        !Object.hasOwn(currentFiles, path) ||
        !Buffer.from(bytes).equals(Buffer.from(currentFiles[path]))
      )
        fail("an earlier immutable file was removed or changed");
    }
    const old = admitted.registry;
    if (
      current.registry.editions.length < old.editions.length ||
      !same(
        current.registry.editions.slice(0, old.editions.length),
        old.editions,
      )
    )
      fail("an earlier edition pin changed");
    for (const pin of old.records)
      if (!same(currentPins.get(`${pin.kind}/${pin.id}/${pin.version}`), pin))
        fail("an earlier record pin changed");
  }
  // Every edition, including historical ones, proves its actual source A.
  for (const pin of current.registry.editions) {
    const edition = JSON.parse(text(currentFiles[`editions/${pin.id}.json`]));
    if (edition.sourceCommit === exactHead)
      fail("dataset B cannot be its own source A");
    ancestor(repo, edition.sourceCommit, exactHead);
    let baseline = baselines.get(edition.sourceCommit);
    if (!baseline) {
      baseline = readObservationBaseline(repo, edition.sourceCommit);
      baselines.set(edition.sourceCommit, baseline);
    }
    const method = observationMethodPins(baseline);
    if (
      method.definitionSha256 !== edition.method.definitionSha256 ||
      method.adapterSha256 !== edition.method.adapterSha256
    )
      fail("edition interpretation pins differ from its committed source A");
    const legacy = baseline.files.find(
      (file) => file.path === edition.legacyComparison.path,
    );
    if (
      !legacy ||
      legacy.sha256 !== edition.legacyComparison.sha256 ||
      JSON.parse(text(legacy.bytes)).retrieved !==
        edition.legacyComparison.declaredRetrievedDay
    )
      fail("legacy comparison identity differs from its committed source A");
    let state = sourceStates.get(edition.sourceCommit);
    if (!state) {
      const files = readObservationGitFiles(repo, edition.sourceCommit);
      state = {
        files,
        admitted: Object.keys(files).length
          ? validateObservationFiles(files)
          : null,
      };
      sourceStates.set(edition.sourceCommit, state);
    }
    if (state.admitted === null) {
      if (edition.sequence !== 1 || edition.supersedes !== null)
        fail("an appended edition has no committed predecessor at source A");
    } else {
      if (
        edition.sequence !== state.admitted.registry.editions.length + 1 ||
        !same(edition.supersedes, state.admitted.registry.current)
      )
        fail("edition predecessor differs from its actual committed source A");
      retainCommittedState(state.files, state.admitted);
    }
  }
  if (previous) {
    retainCommittedState(previousFiles, previous);
    const old = previous.registry,
      next = current.registry;
    if (next.editions.length === old.editions.length) {
      if (
        !Buffer.from(previousFiles["registry.json"]).equals(
          Buffer.from(currentFiles["registry.json"]),
        )
      )
        fail("the registry changed without an appended edition");
    } else if (!same(next.current, next.editions.at(-1)))
      fail("an append must explicitly select its final new edition");
  }
  const currentEdition = JSON.parse(
    text(currentFiles[`editions/${current.registry.current.id}.json`]),
  );
  const pinnedInterpretation = baselines.get(currentEdition.sourceCommit);
  if (
    !same(
      actualInterpretation.files.map(({ path, sha256, bytes }) => ({
        path,
        sha256,
        bytes: bytes.byteLength,
      })),
      pinnedInterpretation.files.map(({ path, sha256, bytes }) => ({
        path,
        sha256,
        bytes: bytes.byteLength,
      })),
    )
  )
    fail(
      "current interpretation differs from its committed source A; append an explicitly captured method edition",
    );
  return Object.freeze({
    mode: previous ? "append-verified" : "bootstrap-verified",
    exactBase,
    exactHead,
    previousRegistryHash: previous?.registry.hash ?? null,
    currentRegistryHash: current.registry.hash,
    oldFilesChecked: previous ? Object.keys(previousFiles).length - 1 : 0,
    sourceBaselineChecked: currentEdition.sourceCommit,
  });
}
