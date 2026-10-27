import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { edition as legacy } from "./content.mjs";
import {
  canonicalIssueJson,
  exactIssue,
  freezeIssue,
  issueDigest,
  issueHash,
  issueId,
  issueJson,
  plainIssueValue,
} from "./issue-json.mjs";

export const LEGACY_CONTENT_HASH =
  "a3206bae9f3497914e7160b58984c5a1c3cea1ed550ddba205344ccf4f18f0f8";
export const LEGACY_FILE_HASH =
  "85b0a530fac49b91f5a0ae06c86bf4210bf395ad00c0069dfd15804637e84510";
export const MAIL_LIMITS = Object.freeze({
  issues: 100,
  lineage: 100,
  formatBytes: 262144,
  issueBytes: 524288,
  totalBytes: 10485760,
});
const pretty = (v) => JSON.stringify(v, null, 2) + "\n";
const checksum = (v) => {
  const { hash, ...core } = v;
  if (issueHash(core) !== hash) throw new Error("Issue checksum differs");
};
const text = (v, maximum) => {
  if (
    typeof v !== "string" ||
    !v.trim() ||
    Buffer.byteLength(v) > maximum ||
    /[\u0000\u0008\u000b\u000c\u000e-\u001f]/.test(v)
  )
    throw new Error("Invalid bounded issue text");
  return v;
};
export function mailContentFingerprint(issue) {
  return issueHash({
    subject: issue.subject,
    title: issue.title,
    html: issue.html,
    text: issue.text,
  });
}
export function validateMailIssueRegistry(input, { previousRegistry } = {}) {
  const v = plainIssueValue(input);
  exactIssue(v, ["format", "version", "issues", "lineage", "hash"]);
  if (
    v.format !== "charitology-mail-issue-registry" ||
    v.version !== 1 ||
    !Array.isArray(v.issues) ||
    !v.issues.length ||
    v.issues.length > 100 ||
    !Array.isArray(v.lineage) ||
    !v.lineage.length ||
    v.lineage.length > 100
  )
    throw new Error("Invalid issue registry");
  issueDigest(v.hash);
  checksum(v);
  const ids = new Set(),
    publications = new Set(),
    fingerprints = new Set(),
    nodes = new Map(),
    sequences = new Set();
  for (const n of v.lineage) {
    exactIssue(n, [
      "format",
      "version",
      "publicationId",
      "publicationHash",
      "sequence",
      "supersedes",
      "hash",
    ]);
    if (
      n.format !== "charitology-letter-publication-lineage" ||
      n.version !== 1 ||
      !Number.isSafeInteger(n.sequence) ||
      n.sequence < 1 ||
      sequences.has(n.sequence) ||
      nodes.has(n.publicationId)
    )
      throw new Error("Invalid Letter lineage");
    issueId(n.publicationId);
    issueDigest(n.publicationHash);
    issueDigest(n.hash);
    checksum(n);
    if (n.supersedes !== null) {
      exactIssue(n.supersedes, ["id", "hash"]);
      issueId(n.supersedes.id);
      issueDigest(n.supersedes.hash);
    }
    nodes.set(n.publicationId, n);
    sequences.add(n.sequence);
  }
  for (const n of nodes.values())
    if (n.supersedes) {
      const p = nodes.get(n.supersedes.id);
      if (
        !p ||
        p.publicationHash !== n.supersedes.hash ||
        p.sequence >= n.sequence
      )
        throw new Error("Incomplete or cyclic Letter lineage");
    }
  let legacyFound = false;
  for (const x of v.issues) {
    exactIssue(x, [
      "schemaVersion",
      "id",
      "publicationId",
      "publicationHash",
      "hashAlgorithm",
      "rendererVersion",
      "title",
      "subject",
      "html",
      "text",
      "hash",
    ]);
    issueId(x.id);
    if (x.id === "registry") throw new Error("Reserved issue ID");
    issueId(x.publicationId);
    issueDigest(x.publicationHash);
    issueDigest(x.hash);
    if (
      x.schemaVersion !== 1 ||
      ids.has(x.id) ||
      publications.has(x.publicationId)
    )
      throw new Error("Duplicate issue binding");
    const n = nodes.get(x.publicationId);
    if (!n || n.publicationHash !== x.publicationHash)
      throw new Error("Missing exact issue lineage");
    text(x.title, 1000);
    text(x.subject, 1000);
    if (/[\r\n]/.test(x.subject)) throw new Error("Invalid issue subject");
    text(x.html, MAIL_LIMITS.formatBytes);
    text(x.text, MAIL_LIMITS.formatBytes);
    if (Buffer.byteLength(pretty(x)) > MAIL_LIMITS.issueBytes)
      throw new Error("Issue byte limit");
    if (x.id === "edition-1") {
      if (
        legacy.hash !== LEGACY_CONTENT_HASH ||
        x.hashAlgorithm !== "ordered-json-mail-v1" ||
        x.rendererVersion !== "legacy" ||
        ["title", "subject", "html", "text", "hash"].some(
          (k) => x[k] !== legacy[k],
        )
      )
        throw new Error("Legacy issue changed");
      legacyFound = true;
    } else if (
      x.hashAlgorithm !== "canonical-mail-v1" ||
      x.rendererVersion !== 1
    )
      throw new Error("Unsupported mail renderer");
    else checksum(x);
    if (
      x.html.replaceAll("{{{RESEND_UNSUBSCRIBE_URL}}}", "").includes("{{") ||
      x.text.replaceAll("{{{RESEND_UNSUBSCRIBE_URL}}}", "").includes("{{") ||
      /<\s*(?:script|iframe|img|form|object|embed)\b|\son[a-z]+\s*=|javascript\s*:/i.test(
        x.html,
      ) ||
      x.html.split("{{{RESEND_UNSUBSCRIBE_URL}}}").length !== 2 ||
      x.text.split("{{{RESEND_UNSUBSCRIBE_URL}}}").length !== 2 ||
      !x.html.includes("938 Peacock Station Rd, McLean, VA 22102") ||
      !x.text.includes("938 Peacock Station Rd, McLean, VA 22102")
    )
      throw new Error("Unsafe or incomplete mail format");
    const fp = mailContentFingerprint(x);
    if (fingerprints.has(fp))
      throw new Error("Identical mail cannot use another ID");
    fingerprints.add(fp);
    ids.add(x.id);
    publications.add(x.publicationId);
  }
  if (!legacyFound) throw new Error("Preserved issue 1 binding required");
  const closure = new Set();
  for (const x of v.issues) {
    let n = nodes.get(x.publicationId);
    while (n && !closure.has(n.publicationId)) {
      closure.add(n.publicationId);
      n = n.supersedes ? nodes.get(n.supersedes.id) : null;
    }
  }
  if (closure.size !== nodes.size)
    throw new Error("Unselected lineage declaration");
  if (
    v.lineage.some((n, i) => i && v.lineage[i - 1].sequence >= n.sequence) ||
    v.issues.some((n, i) => i && v.issues[i - 1].id >= n.id)
  )
    throw new Error("Registry order differs");
  if (
    Buffer.byteLength(pretty(v)) +
      [...v.issues, ...v.lineage].reduce(
        (sum, x) => sum + Buffer.byteLength(pretty(x)),
        0,
      ) >
    MAIL_LIMITS.totalBytes
  )
    throw new Error("Service mail registry byte limit");
  if (previousRegistry) {
    const p = validateMailIssueRegistry(previousRegistry);
    for (const old of p.issues)
      if (
        !v.issues.some(
          (x) =>
            x.id === old.id &&
            canonicalIssueJson(x) === canonicalIssueJson(old),
        )
      )
        throw new Error("Historical issue removed or changed");
    for (const old of p.lineage)
      if (
        !v.lineage.some(
          (x) =>
            x.publicationId === old.publicationId &&
            canonicalIssueJson(x) === canonicalIssueJson(old),
        )
      )
        throw new Error("Historical lineage removed or changed");
  }
  return freezeIssue(v);
}
export function getMailIssue(registry, id) {
  issueId(id);
  const x = registry.issues.find((x) => x.id === id);
  if (!x)
    throw Object.assign(new Error("Unknown registered issue"), {
      issueCode: "issue_unknown",
      status: 404,
    });
  return x;
}
export function resolveMailIssueCorrectionAncestors(registry, id) {
  const issue = getMailIssue(registry, id);
  let n = registry.lineage.find((n) => n.publicationId === issue.publicationId);
  const out = [],
    seen = new Set();
  while (n?.supersedes) {
    if (seen.has(n.publicationId))
      throw new Error("Cyclic correction ancestry");
    seen.add(n.publicationId);
    const p = registry.lineage.find(
      (x) =>
        x.publicationId === n.supersedes.id &&
        x.publicationHash === n.supersedes.hash &&
        x.sequence < n.sequence,
    );
    if (!p) throw new Error("Incomplete correction ancestry");
    out.push(p);
    n = p;
  }
  if (!n) throw new Error("Missing selected lineage");
  return freezeIssue(out);
}
export function issueContentPreview(registry, id) {
  const x = getMailIssue(registry, id);
  return freezeIssue({
    ok: true,
    issueId: x.id,
    publicationId: x.publicationId,
    publicationHash: x.publicationHash,
    contentHash: x.hash,
    hashAlgorithm: x.hashAlgorithm,
    rendererVersion: x.rendererVersion,
    title: x.title,
    subject: x.subject,
    html: x.html,
    text: x.text,
    editorialLabel: "editorial-draft",
  });
}
export function mailIssueFiles(registry) {
  const v = validateMailIssueRegistry(registry),
    files = { "registry.json": pretty(v) };
  for (const x of v.issues) files[x.id + ".json"] = pretty(x);
  for (const x of v.lineage)
    files["lineage/" + x.publicationId + ".json"] = pretty(x);
  return freezeIssue(files);
}
export function validateMailIssueFiles(files, { previousFiles } = {}) {
  if (
    !files ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(files))
  )
    throw new Error("Plain mail file map required");
  const desc = Object.getOwnPropertyDescriptors(files),
    keys = Reflect.ownKeys(files);
  let total = 0;
  const texts = Object.create(null);
  if (keys.length > 201) throw new Error("Mail file count limit");
  for (const key of keys) {
    if (
      typeof key !== "string" ||
      !desc[key].enumerable ||
      !Object.hasOwn(desc[key], "value") ||
      !(
        /^(?:registry|[a-z][a-z0-9-]{0,79})\.json$/.test(key) ||
        /^lineage\/[a-z][a-z0-9-]{0,79}\.json$/.test(key)
      )
    )
      throw new Error("Invalid mail file path");
    const value = desc[key].value;
    if (typeof value === "string") {
      if (!value.isWellFormed() || value.length > MAIL_LIMITS.totalBytes)
        throw new Error("Invalid mail UTF-8");
      texts[key] = value;
    } else if (value instanceof Uint8Array) {
      const length = Reflect.getOwnPropertyDescriptor(
        Object.getPrototypeOf(Uint8Array.prototype),
        "byteLength",
      ).get.call(value);
      if (length > MAIL_LIMITS.totalBytes) throw new Error("Mail file limit");
      texts[key] = new TextDecoder("utf-8", { fatal: true }).decode(value);
    } else throw new Error("Mail bytes required");
    total += Buffer.byteLength(texts[key]);
    if (total > MAIL_LIMITS.totalBytes)
      throw new Error("Mail closure byte limit");
  }
  if (!Object.hasOwn(texts, "registry.json"))
    throw new Error("Missing registry");
  const v = validateMailIssueRegistry(
    issueJson(texts["registry.json"], MAIL_LIMITS.totalBytes),
  );
  const expected = mailIssueFiles(v);
  if (Object.keys(expected).sort().join("\0") !== keys.sort().join("\0"))
    throw new Error("Partial or unknown mail closure");
  for (const key of keys) {
    issueJson(
      texts[key],
      key === "registry.json" ? MAIL_LIMITS.totalBytes : MAIL_LIMITS.issueBytes,
    );
    if (texts[key] !== expected[key])
      throw new Error("Mail artifact bytes differ");
  }
  if (previousFiles) {
    const p = validateMailIssueFiles(previousFiles);
    validateMailIssueRegistry(v, { previousRegistry: p });
    for (const key of Object.keys(previousFiles))
      if (key !== "registry.json") {
        const old =
          typeof previousFiles[key] === "string"
            ? previousFiles[key]
            : new TextDecoder("utf-8", { fatal: true }).decode(
                previousFiles[key],
              );
        if (texts[key] !== old) throw new Error("Historical mail blob changed");
      }
  }
  return v;
}
export function loadMailIssueRegistry() {
  const root = new URL("../editions/", import.meta.url),
    files = Object.create(null);
  let total = 0;
  const read = (name) => {
    const path = new URL(name, root),
      stat = lstatSync(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      (total += stat.size) > MAIL_LIMITS.totalBytes
    )
      throw new Error("Invalid service mail file");
    files[name] = readFileSync(path);
  };
  for (const name of readdirSync(root)) {
    if (name === "lineage") {
      if (
        !lstatSync(new URL("lineage", root)).isDirectory() ||
        lstatSync(new URL("lineage", root)).isSymbolicLink()
      )
        throw new Error("Invalid lineage directory");
      for (const child of readdirSync(new URL("lineage/", root)))
        read("lineage/" + child);
    } else read(name);
  }
  return validateMailIssueFiles(files);
}
