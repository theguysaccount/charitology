// Explicit maintainer I/O. Normal builds never fetch or capture observations.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  OBSERVATION_LIMITS,
  observationClone,
  observationFreeze,
  observationFail,
  observationRawHash,
  observationObjectHash,
  observationPrettyJson,
  strictObservationJson,
  canonicalObservationJson,
} from "./observation-canonical.mjs";
import {
  OBSERVATION_ROOT,
  OBSERVATION_BASELINE_PATHS,
} from "./observation-baseline.mjs";
import {
  readObservationGitFiles,
  readObservationBaseline,
} from "./observation-git.mjs";
import {
  copyPreparedObservationInputs,
  assembleObservationRecords,
  validateObservationSourceRoles,
} from "./observation-sources.mjs";
import {
  buildObservationCandidate,
  observationCandidateFiles,
} from "./observation-capture.mjs";

const owners = new WeakMap();
const fail = (message) => observationFail("capture_io", message);
const same = (a, b) =>
  canonicalObservationJson(a) === canonicalObservationJson(b);
export function readBoundedObservationFile(filename, maximum) {
  if (
    typeof filename !== "string" ||
    filename.length > 4096 ||
    !Number.isSafeInteger(maximum) ||
    maximum < 0 ||
    maximum > OBSERVATION_LIMITS.preparedInputBytes ||
    !Number.isInteger(fs.constants.O_NOFOLLOW) ||
    !Number.isInteger(fs.constants.O_NONBLOCK)
  )
    fail(
      "A bounded ordinary-file path and no-follow platform support are required",
    );
  const stat = fs.lstatSync(filename);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    !Number.isSafeInteger(stat.size) ||
    stat.size < 0 ||
    stat.size > maximum
  )
    fail("Expected bounded ordinary file: " + filename);
  const fd = fs.openSync(
    filename,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    const opened = fs.fstatSync(fd);
    if (
      !opened.isFile() ||
      opened.dev !== stat.dev ||
      opened.ino !== stat.ino ||
      opened.size !== stat.size
    )
      fail("Observation file changed before bounded read");
    const buffer = Buffer.alloc(stat.size + 1);
    let used = 0;
    while (used < buffer.length) {
      const count = fs.readSync(fd, buffer, used, buffer.length - used, null);
      if (count === 0) break;
      used += count;
    }
    if (used !== stat.size || fs.fstatSync(fd).size !== stat.size)
      fail("Observation file grew or shrank during bounded read");
    return buffer.subarray(0, used);
  } finally {
    fs.closeSync(fd);
  }
}
const regularFile = readBoundedObservationFile;
function plainDirectory(directory) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    fail("Expected ordinary directory: " + directory);
}
function present(filename) {
  try {
    fs.lstatSync(filename);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
function safeRelative(value) {
  if (
    typeof value !== "string" ||
    value.length > 240 ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value.split("/").some((p) => !p || p === "." || p === "..") ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    fail("Unsafe relative input path");
  return value;
}
function readWithin(root, relative, maximum) {
  const parts = safeRelative(relative).split("/");
  let current = path.resolve(root);
  plainDirectory(current);
  for (const p of parts.slice(0, -1)) {
    current = path.join(current, p);
    plainDirectory(current);
  }
  return regularFile(path.join(current, parts.at(-1)), maximum);
}

export function readPreparedObservationRoot(root) {
  root = path.resolve(root);
  plainDirectory(root);
  if (!same(fs.readdirSync(root).sort(), ["inputs", "manifest.json"]))
    fail("Prepared root contains undeclared files");
  const manifest = strictObservationJson(
    regularFile(
      path.join(root, "manifest.json"),
      OBSERVATION_LIMITS.structuredObjectBytes,
    ),
  );
  if (
    !Array.isArray(manifest.inputs) ||
    !manifest.inputs.length ||
    manifest.inputs.length > 200
  )
    fail("Invalid prepared input inventory");
  plainDirectory(path.join(root, "inputs"));
  const names = manifest.inputs.map((i) => i.name);
  if (
    names.some(
      (n) => typeof n !== "string" || !/^[a-z][a-z0-9-]{0,99}$/.test(n),
    ) ||
    !same(fs.readdirSync(path.join(root, "inputs")).sort(), [...names].sort())
  )
    fail("Prepared files do not match declared inventory");
  const files = new Map();
  let total = 0;
  for (const name of names) {
    const bytes = readWithin(
      root,
      "inputs/" + name,
      OBSERVATION_LIMITS.privateOriginalBytes,
    );
    total += bytes.length;
    if (total > OBSERVATION_LIMITS.preparedInputBytes)
      fail("Whole prepared root exceeds32MiB");
    files.set(name, bytes);
  }
  return copyPreparedObservationInputs({ manifest, files });
}

export function readObservationWorkingFiles(repo) {
  const root = path.resolve(repo, OBSERVATION_ROOT),
    files = {};
  if (!present(root)) return files;
  plainDirectory(root);
  let count = 0,
    total = 0;
  function walk(directory, relative = "") {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const rel = relative ? relative + "/" + item.name : item.name;
      safeRelative(rel);
      const full = path.join(directory, item.name),
        stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) fail("Observation symlink refused");
      if (stat.isDirectory()) {
        walk(full, rel);
        continue;
      }
      if (!stat.isFile() || ++count > OBSERVATION_LIMITS.files + 1)
        fail("Invalid observation file/count");
      const bytes = regularFile(
        full,
        rel.startsWith("raw/") || rel.endsWith(".txt")
          ? OBSERVATION_LIMITS.rawSourceBytes
          : OBSERVATION_LIMITS.structuredObjectBytes,
      );
      total += bytes.length;
      if (total > OBSERVATION_LIMITS.historyBytes)
        fail("Observation working history exceeds20MiB");
      files[rel] = bytes;
    }
  }
  walk(root);
  return files;
}
function bytesEqual(left, right) {
  const a = Object.keys(left).sort(),
    b = Object.keys(right).sort();
  return (
    same(a, b) &&
    a.every((p) => observationRawHash(left[p]) === observationRawHash(right[p]))
  );
}
function workingBaselineMatches(repo, baseline) {
  for (const file of baseline.files) {
    const raw = readWithin(repo, file.path, 5 * 1024 * 1024);
    if (
      observationRawHash(raw) !== file.sha256 ||
      raw.length !== file.bytes.byteLength
    )
      fail(
        "Working interpretation differs from committed source A: " + file.path,
      );
  }
}
function checkAncestry(repo, before, after) {
  try {
    execFileSync(
      "git",
      ["--no-replace-objects", "merge-base", "--is-ancestor", before, after],
      {
        cwd: repo,
        stdio: "pipe",
        timeout: 30000,
        env: {
          ...process.env,
          GIT_NO_REPLACE_OBJECTS: "1",
          GIT_NO_LAZY_FETCH: "1",
          GIT_TERMINAL_PROMPT: "0",
        },
      },
    );
  } catch {
    fail("Previous capture baseline must be an available ancestor of source A");
  }
}
function actualHead(repo) {
  try {
    const head = execFileSync(
      "git",
      ["--no-replace-objects", "rev-parse", "--verify", "HEAD^{commit}"],
      {
        cwd: repo,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30000,
        env: {
          ...process.env,
          GIT_NO_REPLACE_OBJECTS: "1",
          GIT_NO_LAZY_FETCH: "1",
          GIT_TERMINAL_PROMPT: "0",
        },
      },
    ).trim();
    if (!/^[0-9a-f]{40}$/.test(head) || /^0+$/.test(head))
      fail("Exact current HEAD unavailable");
    return head;
  } catch {
    fail("Exact current HEAD unavailable");
  }
}

export async function previewObservationCapture(args) {
  const owned = observationClone(args);
  if (!same(Object.keys(owned).sort(), ["preparedRoot", "repo", "request"]))
    fail("Closed preview arguments required");
  const repo = path.resolve(owned.repo),
    preparedRoot = path.resolve(owned.preparedRoot),
    request = owned.request;
  const baseline = await readObservationBaseline(repo, request.sourceCommit);
  const previous = await readObservationGitFiles(repo, request.previousCommit);
  checkAncestry(repo, request.previousCommit, request.sourceCommit);
  const head = actualHead(repo);
  checkAncestry(repo, request.sourceCommit, head);
  const atSource =
    request.sourceCommit === request.previousCommit
      ? previous
      : await readObservationGitFiles(repo, request.sourceCommit);
  const atHead =
    head === request.previousCommit
      ? previous
      : head === request.sourceCommit
        ? atSource
        : await readObservationGitFiles(repo, head);
  if (!bytesEqual(previous, atSource) || !bytesEqual(previous, atHead))
    fail(
      "Previous inventory differs from source A or current committed history",
    );
  workingBaselineMatches(repo, baseline);
  const working = readObservationWorkingFiles(repo);
  if (!bytesEqual(previous, working))
    fail(
      "Working observation tree differs from exact previous committed inventory",
    );
  const prepared = readPreparedObservationRoot(preparedRoot);
  const preview = buildObservationCandidate(
    Object.keys(previous).length ? previous : null,
    prepared,
    baseline,
    request,
  );
  owners.set(preview, {
    repo,
    preparedRoot,
    request: preview.request,
    baseline,
    previous,
  });
  return preview;
}

function ensureDirectory(root, relative, created) {
  let current = root;
  for (const part of relative.split("/").filter(Boolean)) {
    current = path.join(current, part);
    if (fs.existsSync(current)) plainDirectory(current);
    else {
      fs.mkdirSync(current, { mode: 0o755 });
      created.push(current);
    }
  }
}
export async function writeReviewedObservationCapture(
  preview,
  expectedProposalHash,
) {
  const owner = owners.get(preview);
  if (
    !owner ||
    typeof expectedProposalHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(expectedProposalHash) ||
    preview.proposalHash !== expectedProposalHash
  )
    fail("An owned preview and exact reviewed proposal hash are required");
  const parent = path.resolve(owner.repo, path.dirname(OBSERVATION_ROOT)),
    root = path.resolve(owner.repo, OBSERVATION_ROOT);
  plainDirectory(parent);
  const lock = path.join(parent, ".observations-write.lock"),
    stage = path.join(parent, ".observations-stage-" + randomUUID());
  let lockFd,
    stageOwned = false,
    committed = false;
  const installed = [],
    directories = [];
  try {
    lockFd = fs.openSync(lock, "wx", 0o600);
    fs.writeFileSync(
      lockFd,
      JSON.stringify({ pid: process.pid, nonce: randomUUID() }) + "\n",
    );
    // Rebuild from disk and exact Git objects; preview JSON alone is not authority.
    const fresh = await previewObservationCapture({
      repo: owner.repo,
      preparedRoot: owner.preparedRoot,
      request: owner.request,
    });
    if (fresh.proposalHash !== expectedProposalHash)
      fail("Prepared source or capture changed after review");
    const files = observationCandidateFiles(fresh);
    fs.mkdirSync(stage, { mode: 0o700 });
    stageOwned = true;
    for (const [relative, text] of Object.entries(files)) {
      safeRelative(relative);
      const dest = path.join(stage, relative);
      fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
      fs.writeFileSync(dest, text, { flag: "wx", mode: 0o600 });
    }
    workingBaselineMatches(owner.repo, owner.baseline);
    if (!bytesEqual(readObservationWorkingFiles(owner.repo), owner.previous))
      fail("Observation tree changed while staging");
    const finalPrepared = readPreparedObservationRoot(owner.preparedRoot);
    if (finalPrepared.manifest.hash !== fresh.request.preparedInputManifestHash)
      fail("Prepared input inventory changed while staging");
    if (!fs.existsSync(root)) {
      fs.mkdirSync(root, { mode: 0o755 });
      directories.push(root);
    } else plainDirectory(root);
    for (const relative of Object.keys(files)
      .filter((p) => p !== "registry.json")
      .sort()) {
      if (Object.hasOwn(owner.previous, relative)) continue;
      const parentRel = path.dirname(relative);
      if (parentRel !== ".") ensureDirectory(root, parentRel, directories);
      const dest = path.join(root, relative);
      fs.linkSync(path.join(stage, relative), dest);
      installed.push(dest);
    }
    // Check the expected old registry immediately before its atomic activation.
    const registry = path.join(root, "registry.json");
    if (Object.hasOwn(owner.previous, "registry.json")) {
      if (
        !fs.existsSync(registry) ||
        observationRawHash(
          regularFile(registry, OBSERVATION_LIMITS.structuredObjectBytes),
        ) !== observationRawHash(owner.previous["registry.json"])
      )
        fail("Registry changed before activation");
    } else if (fs.existsSync(registry))
      fail("Registry appeared before bootstrap activation");
    const expectedBeforeActivation = { ...files };
    if (Object.hasOwn(owner.previous, "registry.json"))
      expectedBeforeActivation["registry.json"] =
        owner.previous["registry.json"];
    else delete expectedBeforeActivation["registry.json"];
    if (
      !bytesEqual(
        readObservationWorkingFiles(owner.repo),
        expectedBeforeActivation,
      )
    )
      fail("Immutable inventory changed before activation");
    fs.renameSync(path.join(stage, "registry.json"), registry);
    committed = true;
    return observationFreeze({
      proposalHash: expectedProposalHash,
      registryHash: fresh.candidateRegistryHash,
      files: fresh.files.length,
    });
  } finally {
    if (!committed) {
      for (const file of installed.reverse()) fs.rmSync(file, { force: true });
      for (const directory of directories.reverse()) {
        try {
          fs.rmdirSync(directory);
        } catch {}
      }
    }
    if (stageOwned) fs.rmSync(stage, { recursive: true, force: true });
    if (lockFd !== undefined) {
      fs.closeSync(lockFd);
      fs.rmSync(lock, { force: true });
    }
  }
}

async function boundedDownload(spec, fetchImpl) {
  const rawUrl = spec.input.url;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail("Invalid declared source URL");
  }
  if (
    typeof rawUrl !== "string" ||
    rawUrl.length > 2048 ||
    /[\\\u0000-\u0020\u007f]/u.test(rawUrl) ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    rawUrl !== spec.record.url
  )
    fail("Unsafe or inconsistent declared source URL");
  const controller = new AbortController(),
    timer = setTimeout(
      () => controller.abort(),
      OBSERVATION_LIMITS.requestDeadlineMs,
    );
  try {
    const response = await fetchImpl(spec.input.url, {
      redirect: "error",
      signal: controller.signal,
      headers: { Accept: spec.input.mediaType },
    });
    if (
      response.status !== 200 ||
      response.redirected ||
      response.url !== spec.input.url ||
      !response.body
    )
      fail("Source HTTP result/URL does not match request");
    const type = response.headers
      .get("content-type")
      ?.split(";")[0]
      .trim()
      .toLowerCase();
    if (type !== spec.input.mediaType) fail("Source HTTP media type changed");
    const maximum =
      spec.input.publicDisposition === "private-original"
        ? OBSERVATION_LIMITS.privateOriginalBytes
        : OBSERVATION_LIMITS.rawSourceBytes;
    const chunks = [],
      reader = response.body.getReader();
    let bytes = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > maximum) {
          controller.abort();
          await reader.cancel();
          fail("Complete decoded HTTP entity exceeds source cap");
        }
        chunks.push(Buffer.from(part.value));
      }
    } finally {
      reader.releaseLock();
    }
    return {
      raw: Buffer.concat(chunks),
      retrievedAt: new Date().toISOString(),
      http: {
        status: response.status,
        contentType: response.headers.get("content-type"),
        url: response.url,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function prepareObservationInputs({
  repo,
  retainedRoot = null,
  outputRoot,
  download = false,
  fetchImpl = globalThis.fetch,
}) {
  repo = path.resolve(repo);
  outputRoot = path.resolve(outputRoot);
  if (Boolean(retainedRoot) === Boolean(download))
    fail("Choose retained inputs or an explicit download");
  if (fs.existsSync(outputRoot))
    fail("Preparation never overwrites an existing input directory");
  const definition = validateObservationSourceRoles(
    strictObservationJson(
      readWithin(
        repo,
        "src/data/observation-source-inputs.json",
        OBSERVATION_LIMITS.structuredObjectBytes,
      ),
    ),
  );
  if (!Array.isArray(definition.sources) || definition.sources.length > 200)
    fail("Invalid source input catalog");
  const files = new Map(),
    inputs = [],
    http = [];
  let total = 0;
  for (const spec of definition.sources) {
    let raw, retrievedAt;
    if (download) {
      const result = await boundedDownload(spec, fetchImpl);
      raw = result.raw;
      retrievedAt = result.retrievedAt;
      http.push({ name: spec.input.name, ...result.http, retrievedAt });
    } else {
      raw = readWithin(
        path.resolve(retainedRoot),
        spec.input.retainedFile,
        OBSERVATION_LIMITS.privateOriginalBytes,
      );
      retrievedAt = spec.input.retrievedAt;
      if (
        observationRawHash(raw) !== spec.input.sha256 ||
        raw.length !== spec.input.bytes
      )
        fail("Retained input differs from its recorded original");
    }
    total += raw.length;
    if (total > OBSERVATION_LIMITS.preparedInputBytes)
      fail("Complete prepared source set exceeds32MiB");
    if (
      !spec.input.mutableBody &&
      (observationRawHash(raw) !== spec.input.sha256 ||
        raw.length !== spec.input.bytes)
    )
      fail(
        "External source changed; author a reviewed source definition before capture",
      );
    files.set(spec.input.name, raw);
    inputs.push({
      name: spec.input.name,
      url: spec.input.url,
      retrievedAt,
      mediaType: spec.input.mediaType,
      sha256: observationRawHash(raw),
      bytes: raw.length,
      publicDisposition: spec.input.publicDisposition,
    });
  }
  const core = {
      format: "charitology-observation-prepared-inputs",
      version: 1,
      inputs,
    },
    manifest = { ...core, hash: observationObjectHash(core) };
  const detached = copyPreparedObservationInputs({ manifest, files });
  // Refuse incomplete pages, roles, joins and country/null/bounds matrices before
  // a preparation directory is installed. Full public admission still belongs to
  // the reviewed capture, with an actual committed source A.
  const preparationBaseline = {
    files: [
      "src/data/observation-definitions.json",
      "src/data/observation-source-inputs.json",
      "src/data/countries.json",
    ].map((relative) => ({
      path: relative,
      bytes: readWithin(
        repo,
        relative,
        OBSERVATION_LIMITS.structuredObjectBytes,
      ),
    })),
  };
  const sourceReport = assembleObservationRecords(
    detached,
    preparationBaseline,
  ).report;
  const parent = path.dirname(outputRoot);
  plainDirectory(parent);
  const stage = path.join(parent, ".observation-preparation-" + randomUUID());
  let stageOwned = false;
  try {
    fs.mkdirSync(stage, { mode: 0o700 });
    stageOwned = true;
    fs.mkdirSync(path.join(stage, "inputs"), { mode: 0o700 });
    for (const [name, raw] of files)
      fs.writeFileSync(path.join(stage, "inputs", name), raw, {
        flag: "wx",
        mode: 0o600,
      });
    fs.writeFileSync(
      path.join(stage, "manifest.json"),
      observationPrettyJson(manifest),
      { flag: "wx", mode: 0o600 },
    );
    if (fs.existsSync(outputRoot)) fail("Preparation destination appeared");
    fs.renameSync(stage, outputRoot);
    stageOwned = false;
  } finally {
    if (stageOwned) fs.rmSync(stage, { recursive: true, force: true });
  }
  return observationFreeze({
    manifest,
    bytes: total,
    http,
    worldBank: {
      economies: sourceReport.economies,
      cells: sourceReport.cells,
      present: sourceReport.present,
      missing: sourceReport.missing,
      mortalityBounds: sourceReport.mortalityBounds,
      selectedTokenDifferences: sourceReport.selectedTokenDifferences,
      yearStatusNoteDifferences: sourceReport.yearStatusNoteDifferences,
      identityDifferences: sourceReport.identityDifferences,
      definitionDifferences: sourceReport.definitionDifferences,
    },
    qualification:
      "Prepared exact source inputs, not an admitted or published observation edition.",
  });
}
