// Separate Node/Git release gate. It never fetches a missing object or accepts a
// supplied JSON stand-in for committed history.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  fail,
  commit,
  choice,
  rawPublicationHash,
  hashPublicationValue,
  PUBLICATION_LIMITS,
  freeze,
} from "./publication-editions-canonical.mjs";
import { publicationRegistryFromFiles } from "./publication-editions-capture.mjs";
import { assertPublicationSemanticAppend } from "./publication-editions-model.mjs";
const PUBLIC_ROOT = "src/data/publication-editions/";
const MAIL_ROOT = "services/newsletter/editions/";
const LEGACY = "services/newsletter/lib/content.mjs";
const LEGACY_SHA =
  "85b0a530fac49b91f5a0ae06c86bf4210bf395ad00c0069dfd15804637e84510";
function git(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      maxBuffer: PUBLICATION_LIMITS.totalBytes * 2,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    fail(
      "committed-base",
      "Exact committed publication history is unavailable or invalid.",
    );
  }
}
function exists(root, ref) {
  try {
    return (
      execFileSync(
        "git",
        ["-C", root, "rev-parse", "--verify", ref + "^{commit}"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim() === ref
    );
  } catch {
    return false;
  }
}
function tree(root, ref, prefix) {
  const lines = git(root, ["ls-tree", "-r", "-z", ref, "--", prefix])
      .toString("utf8")
      .split("\0")
      .filter(Boolean),
    files = new Map();
  let total = 0;
  for (const line of lines) {
    const m = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(line);
    if (!m || !m[3].startsWith(prefix))
      fail(
        "committed-base",
        "Reserved registry tree contains a symlink or unsupported object.",
      );
    const name = m[3].slice(prefix.length),
      raw = git(root, ["cat-file", "blob", m[2]]);
    total += raw.length;
    const maximum =
        prefix === MAIL_ROOT ? 10485760 : PUBLICATION_LIMITS.manifestBytes,
      totalMaximum =
        prefix === MAIL_ROOT ? 10485760 : PUBLICATION_LIMITS.totalBytes;
    if (raw.length > maximum || total > totalMaximum)
      fail("limit", "Committed closure exceeds its byte bound.");
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        raw,
      );
    } catch {
      fail("utf8", "Committed closure is not UTF-8.");
    }
    files.set(name, text);
  }
  // A root represented by a single blob/symlink is not an absent bootstrap.
  if (!files.size) {
    const rootEntry = git(root, [
      "ls-tree",
      ref,
      "--",
      prefix.slice(0, -1),
    ]).toString("utf8");
    if (rootEntry.trim())
      fail(
        "committed-base",
        "Reserved registry root is nonempty but has no valid closure.",
      );
  }
  return files;
}
const byteEqual = (a, b) =>
  Buffer.from(a, "utf8").equals(Buffer.from(b, "utf8"));
function exactHistorical(before, after) {
  for (const [p, text] of before) {
    if (p === "registry.json") continue;
    if (!after.has(p) || !byteEqual(text, after.get(p)))
      fail(
        "immutable",
        "Historical committed object/artifact bytes changed or disappeared.",
      );
  }
}
async function mailValidate(files, previous, publicInput) {
  const { validateMailIssueFiles } =
    await import("../../services/newsletter/lib/editions.mjs");
  if (typeof validateMailIssueFiles !== "function")
    fail("committed-base", "Mail closure validator is unavailable.");
  const registry = validateMailIssueFiles(
    Object.fromEntries(files),
    previous ? { previousFiles: Object.fromEntries(previous) } : {},
  );
  const { generateMailIssueFiles } =
    await import("../../services/newsletter/lib/generate-editions.mjs");
  const generated = generateMailIssueFiles(publicInput, {
    selections: registry.issues.map((issue) => ({
      publicationId: issue.publicationId,
      issueId: issue.id,
    })),
    previousRegistry: registry,
  });
  if (Object.keys(generated).length !== files.size)
    fail(
      "publication-mail-binding",
      "Committed mail closure differs from its fixed public publications.",
    );
  for (const [p, text] of files)
    if (!Object.hasOwn(generated, p) || !byteEqual(text, generated[p]))
      fail(
        "publication-mail-binding",
        "Committed mail content or lineage differs from its fixed public publications.",
      );
  return registry;
}
function proveSourceBaselines(root, head, input, cache) {
  const commits = new Set([head]);
  const read = (ref, sourcePath) => {
    const key = ref + ":" + sourcePath;
    if (!commits.has(ref)) {
      if (!exists(root, ref))
        fail(
          "committed-base",
          "A pinned source baseline commit is unavailable.",
        );
      git(root, ["merge-base", "--is-ancestor", ref, head]);
      commits.add(ref);
    }
    if (cache.has(key)) return cache.get(key);
    const listing = git(root, ["ls-tree", ref, "--", sourcePath]).toString(
      "utf8",
    );
    if (
      !/^(100644|100755) blob [a-f0-9]{40}\t/.test(listing) ||
      listing.trimEnd().split("\t").at(-1) !== sourcePath
    )
      fail("source", "Pinned source must be an exact regular committed file.");
    const bytes = git(root, ["show", ref + ":" + sourcePath]);
    if (bytes.length > PUBLICATION_LIMITS.sourceBytes)
      fail("limit", "Pinned source is oversized.");
    cache.set(key, bytes);
    return bytes;
  };
  for (const s of input.sources)
    if (!read(s.commit, s.path).equals(Buffer.from(s.rawUtf8, "utf8")))
      fail(
        "source",
        "Archived source differs from its exact committed source pin.",
      );
  const sources = new Map(input.sources.map((s) => [s.id, s]));
  for (const e of input.editions)
    for (const pin of e.core.sourcePins) {
      const s = sources.get(pin.id);
      if (
        !read(e.core.sourceCommit, s.path).equals(
          Buffer.from(s.rawUtf8, "utf8"),
        )
      )
        fail(
          "source",
          "Edition baseline does not prove every exact retained/reused source byte.",
        );
    }
}
export async function checkCommittedPublicationAppendOnly(options) {
  if (
    !options ||
    Object.keys(options).sort().join(",") !==
      "baseCommit,headCommit,mode,repositoryRoot"
  )
    fail("shape", "Use the exact committed-base gate options.");
  const { headCommit, baseCommit, mode } = options,
    root = resolve(options.repositoryRoot);
  commit(headCommit);
  choice(mode, ["local", "ci", "release"]);
  if (!exists(root, headCommit))
    fail("committed-base", "Exact head commit is unavailable.");
  if (baseCommit === null || baseCommit === undefined) {
    if (mode !== "local")
      fail(
        "committed-base",
        "CI/release requires an exact available committed base.",
      );
    return freeze({
      mode,
      status: "unavailable",
      headCommit,
      baseCommit: null,
      previousRegistryHash: null,
      previousInventoryHash: null,
      checkedHistoricalFiles: 0,
    });
  }
  commit(baseCommit);
  if (!exists(root, baseCommit)) {
    if (mode === "local")
      return freeze({
        mode,
        status: "unavailable",
        headCommit,
        baseCommit: null,
        previousRegistryHash: null,
        previousInventoryHash: null,
        checkedHistoricalFiles: 0,
      });
    fail("committed-base", "Exact base commit is unavailable.");
  }
  git(root, ["merge-base", "--is-ancestor", baseCommit, headCommit]);
  const previousPublic = tree(root, baseCommit, PUBLIC_ROOT),
    nextPublic = tree(root, headCommit, PUBLIC_ROOT),
    previousMail = tree(root, baseCommit, MAIL_ROOT),
    nextMail = tree(root, headCommit, MAIL_ROOT);
  const beforeLegacy = git(root, ["show", baseCommit + ":" + LEGACY]),
    afterLegacy = git(root, ["show", headCommit + ":" + LEGACY]);
  if (
    rawPublicationHash(beforeLegacy) !== LEGACY_SHA ||
    rawPublicationHash(afterLegacy) !== LEGACY_SHA ||
    !beforeLegacy.equals(afterLegacy)
  )
    fail(
      "legacy",
      "Legacy mail source must preserve its exact registered golden bytes.",
    );
  if (
    Boolean(previousPublic.size) !== Boolean(previousMail.size) ||
    Boolean(nextPublic.size) !== Boolean(nextMail.size)
  )
    fail(
      "committed-base",
      "Partial public/mail history is not a complete publication closure.",
    );
  if (!nextPublic.size)
    fail(
      "committed-base",
      "Head has no complete publication registry to release.",
    );
  const next = publicationRegistryFromFiles(nextPublic);
  await mailValidate(nextMail, undefined, next);
  const sourceProofs = new Map();
  proveSourceBaselines(root, headCommit, next, sourceProofs);
  let previous = null;
  if (previousPublic.size) {
    previous = publicationRegistryFromFiles(previousPublic);
    await mailValidate(previousMail, undefined, previous);
    proveSourceBaselines(root, baseCommit, previous, sourceProofs);
    assertPublicationSemanticAppend(previous, next);
    exactHistorical(previousPublic, nextPublic);
    exactHistorical(previousMail, nextMail);
    await mailValidate(nextMail, previousMail, next);
  }
  const rows = [...previousPublic]
    .map(([p, text]) => ({
      path: PUBLIC_ROOT + p,
      bytes: Buffer.byteLength(text),
      sha256: rawPublicationHash(text),
    }))
    .concat(
      [...previousMail].map(([p, text]) => ({
        path: MAIL_ROOT + p,
        bytes: Buffer.byteLength(text),
        sha256: rawPublicationHash(text),
      })),
      [
        {
          path: LEGACY,
          bytes: beforeLegacy.length,
          sha256: rawPublicationHash(beforeLegacy),
        },
      ],
    )
    .sort((a, b) => a.path.localeCompare(b.path));
  return freeze({
    mode,
    status: previous ? "verified" : "bootstrap-verified",
    headCommit,
    baseCommit,
    previousRegistryHash: previous?.registry.hash ?? null,
    previousInventoryHash: hashPublicationValue(rows),
    checkedHistoricalFiles: rows.length,
  });
}
