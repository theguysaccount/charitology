// Explicit capture tooling only. Importing this file performs no Git/file read.
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  lstatSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  rmSync,
  existsSync,
} from "node:fs";
import { resolve, join, dirname, relative } from "node:path";
import { randomBytes } from "node:crypto";
import {
  fail,
  exact,
  array,
  id,
  commit,
  instant,
  path,
  canonicalPublicationJson,
  hashPublicationValue,
  rawPublicationHash,
  objectHash,
  pretty,
  strictPublicationJson,
  PUBLICATION_LIMITS,
  freeze,
} from "./publication-editions-canonical.mjs";
import {
  publicationMethod,
  PUBLICATION_DEFINITION_PATH,
  projectPublicationMembers,
  pinnedPublicationResearch,
} from "./publication-editions-projection.mjs";
import {
  makePublicationSource,
  makePublicationEdition,
  validatePublicationRegistry,
  PUBLICATION_FAMILIES,
} from "./publication-editions-model.mjs";

export const PUBLICATION_DATA_DIRECTORY = "src/data/publication-editions";
export const PUBLICATION_CAPTURE_REQUEST_FIELDS = Object.freeze([
  "id",
  "family",
  "sequence",
  "title",
  "declaredPublicationDate",
  "sourceLabel",
  "provenance",
  "methodId",
  "coverage",
  "editorial",
  "r4EditionId",
  "supersedes",
  "correction",
  "authoredLetterPath",
]);
export function publicationCapturePaths(requests) {
  array(requests, 100, 1);
  const paths = new Set();
  for (const request of requests) {
    exact(request, PUBLICATION_CAPTURE_REQUEST_FIELDS);
    const method = publicationMethod(request.methodId);
    if (request.family !== method.family)
      fail("adapter", "Requested family and method disagree.");
    method.sourcePaths.forEach((p) => paths.add(p));
    if (method.id === "letter-authored-capture-v1") {
      if (
        typeof request.authoredLetterPath !== "string" ||
        !new RegExp(method.mapping.authoredLetterPathPattern).test(
          request.authoredLetterPath,
        )
      )
        fail("source", "Select one exact public authored Letter path.");
      paths.add(request.authoredLetterPath);
    } else if (request.authoredLetterPath !== null)
      fail("source", "Unexpected authored Letter source.");
  }
  return [...paths].sort();
}
export function capturePublicationEditions(input) {
  exact(input, [
    "sourceCommit",
    "capturedAt",
    "requests",
    "rawSources",
    "previousInput",
  ]);
  commit(input.sourceCommit);
  instant(input.capturedAt);
  const owned = strictPublicationJson(
    canonicalPublicationJson(input),
    PUBLICATION_LIMITS.totalBytes,
  );
  const required = publicationCapturePaths(owned.requests);
  array(owned.rawSources, 1000, 1);
  const rawMap = new Map();
  for (const source of owned.rawSources) {
    exact(source, ["path", "rawUtf8"]);
    path(source.path);
    if (rawMap.has(source.path)) fail("source", "Duplicate raw source path.");
    rawMap.set(source.path, source.rawUtf8);
  }
  if (
    canonicalPublicationJson([...rawMap.keys()].sort()) !==
    canonicalPublicationJson(required)
  )
    fail(
      "source",
      "Capture requires exactly the full selected source inventory.",
    );
  const previous =
    owned.previousInput === null
      ? null
      : validatePublicationRegistry(owned.previousInput);
  const allSources = previous ? [...previous.sources] : [],
    newSources = [];
  for (const p of required) {
    const candidate = makePublicationSource({
      sourceCommit: owned.sourceCommit,
      sourcePath: p,
      rawUtf8: rawMap.get(p),
    });
    const reused = allSources.find(
      (s) =>
        s.path === p &&
        s.rawSha256 === candidate.rawSha256 &&
        s.adapterId === candidate.adapterId &&
        s.adapterVersion === candidate.adapterVersion &&
        s.projectionHash === candidate.projectionHash &&
        s.rawUtf8 === candidate.rawUtf8,
    );
    if (!reused) {
      if (allSources.some((s) => s.id === candidate.id))
        fail("source", "Source ID collision.");
      allSources.push(candidate);
      newSources.push(candidate);
    }
  }
  const editions = previous ? [...previous.editions] : [],
    artifacts = previous ? [...previous.artifacts] : [];
  for (const request of owned.requests) {
    id(request.id);
    if (editions.some((e) => e.core.id === request.id))
      fail("identity", "A captured edition ID already exists.");
    const method = publicationMethod(request.methodId),
      expectedPaths = publicationCapturePaths([request]);
    const sources = expectedPaths.map((p) =>
      allSources.find((s) => s.path === p && s.rawUtf8 === rawMap.get(p)),
    );
    let r4 = null;
    if (method.mapping.ledgerPaths) {
      if (typeof request.r4EditionId !== "string")
        fail("qualification", "Select an exact R4 edition ID.");
      const research = pinnedPublicationResearch(sources, {
        editionId: request.r4EditionId,
        period:
          request.family === "progress-report" && request.coverage.period
            ? {
                from: request.coverage.period.from,
                to: request.coverage.period.to,
              }
            : undefined,
      });
      r4 = {
        editionId: research.projection.edition.id,
        editionHash: research.projection.edition.hash,
        factualHash: research.projection.factualHash,
        progressInputHash: research.progress.inputHash,
      };
    } else if (request.r4EditionId !== null)
      fail("qualification", "This method has no R4 basis.");
    const core = {
      format: "charitology-publication-edition-core",
      schemaVersion: 1,
      id: request.id,
      family: request.family,
      sequence: request.sequence,
      title: request.title,
      declaredPublicationDate: request.declaredPublicationDate,
      sourceLabel: request.sourceLabel,
      provenance: request.provenance,
      capturedAt: owned.capturedAt,
      sourceCommit: owned.sourceCommit,
      method: {
        id: method.id,
        version: 1,
        definitionHash: hashPublicationValue(method),
      },
      coverage: request.coverage,
      sourcePins: sources
        .map((s) => ({ id: s.id, hash: s.hash }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      members: [],
      editorial: request.editorial,
      r4,
      legacyMail: null,
      supersedes: request.supersedes,
      correction: request.correction,
    };
    const projected = projectPublicationMembers(core, sources);
    core.members = projected.members;
    core.r4 = projected.r4;
    core.legacyMail = projected.legacyMail;
    const result = makePublicationEdition(core, sources);
    editions.push(result.edition);
    artifacts.push(...result.artifacts);
  }
  editions.sort((a, b) => a.core.id.localeCompare(b.core.id));
  allSources.sort((a, b) => a.id.localeCompare(b.id));
  artifacts.sort(
    (a, b) =>
      a.editionId.localeCompare(b.editionId) ||
      a.fileName.localeCompare(b.fileName),
  );
  const current = Object.fromEntries(
    PUBLICATION_FAMILIES.map((f) => [
      f,
      editions
        .filter((e) => e.core.family === f)
        .sort((a, b) => a.core.sequence - b.core.sequence)
        .at(-1)?.core.id,
    ]),
  );
  const registry = {
    format: "charitology-publication-registry",
    schemaVersion: 1,
    editionPins: editions.map((e) => ({ id: e.core.id, hash: e.hash })),
    sourcePins: allSources.map((s) => ({ id: s.id, hash: s.hash })),
    current,
  };
  registry.hash = objectHash(registry);
  const validated = validatePublicationRegistry(
    { registry, sources: allSources, editions, artifacts },
    previous ? { previousObjects: previous } : {},
  );
  const proposalHash = hashPublicationValue({
    sourceCommit: owned.sourceCommit,
    capturedAt: owned.capturedAt,
    requests: owned.requests,
    registryHash: validated.registry.hash,
  });
  return freeze({
    input: validated,
    proposalHash,
    newEditionIds: owned.requests.map((r) => r.id),
    newSourceIds: newSources.map((s) => s.id),
    reusedSourceCount: required.length - newSources.length,
  });
}
export function prepareCommittedPublicationCapture({
  repositoryRoot,
  sourceCommit,
  capturedAt,
  requests,
  previousInput = null,
}) {
  const rawSources = readCommittedPublicationCapture({
    repositoryRoot,
    sourceCommit,
    requests,
  });
  const result = capturePublicationEditions({
    sourceCommit,
    capturedAt,
    requests,
    rawSources,
    previousInput,
  });
  return freeze({
    ...result,
    sourceCommit,
    capturedAt,
    requests: structuredClone(requests),
    previousInput:
      previousInput === null ? null : structuredClone(previousInput),
  });
}
export function publicationRegistryFiles(input) {
  const v = validatePublicationRegistry(input),
    files = new Map([["registry.json", pretty(v.registry)]]);
  for (const s of v.sources) files.set(`sources/${s.id}.json`, pretty(s));
  for (const e of v.editions)
    files.set(`editions/${e.core.id}.json`, pretty(e));
  for (const a of v.artifacts)
    files.set(`artifacts/${a.editionId}/${a.fileName}`, a.text);
  return files;
}
const git = (root, args, options = {}) =>
  execFileSync("git", ["-C", root, ...args], {
    encoding: undefined,
    maxBuffer: PUBLICATION_LIMITS.totalBytes,
    ...options,
  });
function assertWorkingSource(root, p, bytes) {
  const abs = resolve(root, p);
  if (relative(root, abs).startsWith(".."))
    fail("source", "Source escaped the repository.");
  let current = root;
  for (const part of p.split("/").slice(0, -1)) {
    current = join(current, part);
    const info = lstatSync(current);
    if (!info.isDirectory() || info.isSymbolicLink())
      fail("source", "Source parent paths must be regular directories.");
  }
  const stat = lstatSync(abs);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size !== bytes.length ||
    !readFileSync(abs).equals(bytes)
  )
    fail(
      "source",
      "Current source differs from the explicit committed source baseline.",
    );
}
export function readCommittedPublicationCapture({
  repositoryRoot,
  sourceCommit,
  requests,
  requireWorkingMatch = true,
}) {
  const root = resolve(repositoryRoot);
  commit(sourceCommit);
  if (
    git(root, ["rev-parse", "--verify", sourceCommit + "^{commit}"], {
      encoding: "utf8",
    }).trim() !== sourceCommit
  )
    fail("source", "Unavailable exact source commit.");
  const inventory = git(root, ["ls-tree", "-r", "-z", sourceCommit], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const m = /^(\d+) blob ([a-f0-9]{40})\t(.+)$/.exec(line);
      return m ? { mode: m[1], path: m[3] } : null;
    })
    .filter(Boolean);
  const wanted = publicationCapturePaths(requests),
    byPath = new Map(inventory.map((x) => [x.path, x]));
  // A fixed census may not quietly miss a newly added public content/R4 file.
  const methods = requests.map((r) => publicationMethod(r.methodId));
  for (const m of methods) {
    if (m.mapping.content)
      for (const [c, paths] of Object.entries(m.mapping.content)) {
        const actual = inventory
          .filter(
            (x) =>
              x.path.startsWith(`src/content/${c}/`) && x.path.endsWith(".md"),
          )
          .map((x) => x.path)
          .sort();
        if (
          canonicalPublicationJson(actual) !== canonicalPublicationJson(paths)
        )
          fail(
            "source",
            "Committed content inventory needs a deliberately versioned mapping.",
          );
      }
    if (m.mapping.ledgerPaths) {
      const actual = inventory
        .filter(
          (x) =>
            x.path.startsWith("src/data/research-ledger/") &&
            x.path.endsWith(".json"),
        )
        .map((x) => x.path)
        .sort();
      if (
        canonicalPublicationJson(actual) !==
        canonicalPublicationJson(m.mapping.ledgerPaths)
      )
        fail("source", "Committed R4 closure inventory changed.");
    }
  }
  const rawSources = wanted.map((p) => {
    const info = byPath.get(p);
    if (!info || !["100644", "100755"].includes(info.mode))
      fail("source", "Use an available regular committed source file.");
    const bytes = git(root, ["show", sourceCommit + ":" + p]);
    if (bytes.length > PUBLICATION_LIMITS.sourceBytes)
      fail("limit", "Committed raw source is too large.");
    let rawUtf8;
    try {
      rawUtf8 = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes);
    } catch {
      fail("utf8", "Committed source is not UTF-8.");
    }
    if (requireWorkingMatch) assertWorkingSource(root, p, bytes);
    return { path: p, rawUtf8 };
  });
  const definition = rawSources.find(
    (x) => x.path === PUBLICATION_DEFINITION_PATH,
  );
  if (!definition)
    fail("source", "Capture must pin its immutable method definitions.");
  return rawSources;
}
export function readPublicationRegistryDirectory(root) {
  const base = resolve(root);
  if (!existsSync(base)) return null;
  const info = lstatSync(base);
  if (!info.isDirectory() || info.isSymbolicLink())
    fail("source", "Use a regular registry directory.");
  const files = new Map();
  let total = 0;
  const walk = (dir, relativePath = "") => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name),
        rel = relativePath ? relativePath + "/" + name : name,
        stat = lstatSync(p);
      if (stat.isSymbolicLink())
        fail("source", "Registry symlinks are refused.");
      if (stat.isDirectory()) {
        walk(p, rel);
        continue;
      }
      if (!stat.isFile() || stat.size > PUBLICATION_LIMITS.manifestBytes)
        fail("limit", "Unknown/oversized registry file.");
      total += stat.size;
      if (total > PUBLICATION_LIMITS.totalBytes)
        fail("limit", "Registry tree exceeds its byte bound.");
      const bytes = readFileSync(p);
      let text;
      try {
        text = new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: true,
        }).decode(bytes);
      } catch {
        fail("utf8", "Invalid UTF-8 registry input.");
      }
      files.set(rel, text);
    }
  };
  walk(base);
  return publicationRegistryFromFiles(files);
}
export function publicationRegistryFromFiles(files) {
  if (!(files instanceof Map) || !files.size)
    fail("source", "A nonempty exact registry tree is required.");
  const input = { registry: null, sources: [], editions: [], artifacts: [] };
  for (const [p, text] of files) {
    if (p === "registry.json") input.registry = strictPublicationJson(text);
    else if (/^sources\/[a-z][a-z0-9-]{0,79}\.json$/.test(p))
      input.sources.push(strictPublicationJson(text));
    else if (/^editions\/[a-z][a-z0-9-]{0,79}\.json$/.test(p))
      input.editions.push(strictPublicationJson(text));
    else {
      const m =
        /^artifacts\/([a-z][a-z0-9-]{0,79})\/(edition\.md|edition\.txt)$/.exec(
          p,
        );
      if (!m) fail("source", "Unknown path in reserved publication tree.");
      input.artifacts.push({
        editionId: m[1],
        fileName: m[2],
        mediaType: m[2].endsWith(".md")
          ? "text/markdown;charset=utf-8"
          : "text/plain;charset=utf-8",
        text,
      });
    }
  }
  input.sources.sort((a, b) => a.id.localeCompare(b.id));
  input.editions.sort((a, b) => a.core.id.localeCompare(b.core.id));
  input.artifacts.sort(
    (a, b) =>
      a.editionId.localeCompare(b.editionId) ||
      a.fileName.localeCompare(b.fileName),
  );
  const valid = validatePublicationRegistry(input);
  const expected = publicationRegistryFiles(valid);
  if (expected.size !== files.size)
    fail("source", "Registry tree has missing or unrelated files.");
  for (const [p, text] of expected)
    if (files.get(p) !== text)
      fail(
        "source",
        "Committed JSON/text serialization differs from the canonical capture layout.",
      );
  return valid;
}
export function writePublicationRegistryCapture({
  repositoryRoot,
  capture,
  expectedProposalHash,
}) {
  const root = resolve(repositoryRoot);
  if (capture.proposalHash !== expectedProposalHash)
    fail("capture", "Explicit reviewed proposal hash differs.");
  // Re-prove the committed/current bytes at the mutation boundary, not merely at preview.
  const requests = capture.requests;
  if (!requests)
    fail(
      "capture",
      "Use a privately prepared capture including its request inputs.",
    );
  const freshRaw = readCommittedPublicationCapture({
    repositoryRoot: root,
    sourceCommit: capture.sourceCommit,
    requests,
  });
  const fresh = capturePublicationEditions({
    sourceCommit: capture.sourceCommit,
    capturedAt: capture.capturedAt,
    requests,
    rawSources: freshRaw,
    previousInput: capture.previousInput,
  });
  if (fresh.proposalHash !== expectedProposalHash)
    fail("capture", "Capture changed after explicit preview.");
  const target = join(root, PUBLICATION_DATA_DIRECTORY),
    parent = dirname(target);
  mkdirSync(parent, { recursive: true });
  const suffix = randomBytes(8).toString("hex"),
    stage = join(parent, `.publication-stage-${suffix}`),
    backup = join(parent, `.publication-old-${suffix}`);
  mkdirSync(stage);
  let moved = false;
  try {
    for (const [p, text] of publicationRegistryFiles(fresh.input)) {
      const dest = join(stage, p);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, text, { flag: "wx" });
    }
    readPublicationRegistryDirectory(stage);
    if (existsSync(target)) {
      const current = readPublicationRegistryDirectory(target);
      if (
        !capture.previousInput ||
        current.registry.hash !== capture.previousInput.registry.hash
      )
        fail("capture", "Current registry changed after preview.");
      renameSync(target, backup);
      moved = true;
    }
    renameSync(stage, target);
    if (moved) rmSync(backup, { recursive: true });
    return fresh;
  } catch (error) {
    if (moved && !existsSync(target) && existsSync(backup))
      renameSync(backup, target);
    throw error;
  } finally {
    if (existsSync(stage)) rmSync(stage, { recursive: true });
  }
}
