#!/usr/bin/env node
/** Offline only. Explicit committed code A -> immutable evidence/edition B. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseFundingCsv, makeFundingSource, makeFundingEdition, validateFundingEdition, fundingSha256 } from "../src/lib/humanitarian-funding/model.mjs";
import { fundingSourceMetadata, FUNDING_CODE_PATHS, validateFundingSourceCode } from "../src/lib/humanitarian-funding/source.mjs";
const REPO = fileURLToPath(new URL("../", import.meta.url));
const fundingGitEnv = { ...process.env, GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0" };
function require(ok, message) { if (!ok) throw new Error(message); }
function read(file, max) {
  const st = fs.lstatSync(file); require(st.isFile() && !st.isSymbolicLink() && st.size <= max, "Capture input must be a bounded regular file.");
  const b = fs.readFileSync(file); require(b.length === st.size, "Capture input changed while reading."); return b;
}
export function captureCode(commit) {
  require(/^[a-f0-9]{40}$/.test(commit ?? "") && !/^0+$/.test(commit), "Supply the exact nonzero reviewed code commit.");
  execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], { cwd: REPO, env: fundingGitEnv, stdio: "pipe" });
  const files = FUNDING_CODE_PATHS.map(relative => {
    const b = read(path.join(REPO, relative), 524288);
    let committed;
    try { committed = execFileSync("git", ["show", `${commit}:${relative}`], { cwd: REPO, env: fundingGitEnv, maxBuffer: 524288, stdio: ["ignore", "pipe", "pipe"] }); }
    catch { throw new Error("The named source commit does not contain this capture interpreter. Commit reviewed code A before generating data B."); }
    require(b.equals(committed), "Capture interpreter has uncommitted or later changes; use its reviewed source commit.");
    return { path: relative, bytes: b.length, sha256: fundingSha256(b) };
  });
  return validateFundingSourceCode({ format: "charitology-funding-source-code", version: 1, commit, files });
}
export function prepareCapture({ metadataFile, receiptFile, csvFile, sourceCommit }) {
  const code = captureCode(sourceCommit);
  const csvBytes = read(csvFile, 1_048_576), metadataBytes = read(metadataFile, 524288), receipt = JSON.parse(read(receiptFile, 16384));
  const source = fundingSourceMetadata(metadataBytes, receipt, csvBytes);
  const csvUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(csvBytes);
  const envelope = makeFundingSource(csvUtf8, source, code);
  const edition = makeFundingEdition(parseFundingCsv(csvBytes), source, code, "2025");
  validateFundingEdition(edition, envelope);
  const data = (value) => Buffer.from(JSON.stringify(value, null, 2) + "\n");
  const sourcePath = "public" + source.evidenceUrl;
  const editionPath = `src/data/humanitarian-funding/editions/fts-2025-${source.csvSha256}.json`;
  const sb = data(envelope), eb = data(edition);
  const registry = { format: "charitology-humanitarian-funding-registry", version: 1, referenceYear: "2025",
    source: { path: sourcePath, bytes: sb.length, sha256: fundingSha256(sb) },
    edition: { path: editionPath, bytes: eb.length, sha256: fundingSha256(eb) } };
  return { edition, sourceCommit, outputs: [
    { path: sourcePath, bytes: sb }, { path: editionPath, bytes: eb },
    { path: "src/data/humanitarian-funding/registry.json", bytes: data(registry) },
  ] };
}
export function writeCapture(prepared, mode) {
  require(["plan", "check", "write"].includes(mode), "Unknown capture mode.");
  // Preflight every target before any write. Existing immutable bytes never change.
  const targets = prepared.outputs.map(out => {
    const target = path.join(REPO, out.path);
    require(target.startsWith(REPO) && !out.path.split("/").some(x => ["", ".", ".."].includes(x)), "Unsafe capture target.");
    let cursor = REPO;
    for (const part of out.path.split("/")) { cursor = path.join(cursor, part); if (fs.existsSync(cursor) || (() => { try { return fs.lstatSync(cursor).isSymbolicLink(); } catch { return false; } })()) require(!fs.lstatSync(cursor).isSymbolicLink(), "Capture target cannot traverse symlinks."); }
    const exists = fs.existsSync(target);
    if (exists) require(read(target, 4_194_304).equals(out.bytes), "An immutable source/edition or registry already has different bytes. Preserve it and design an explicit new edition.");
    if (mode === "check") require(exists, "A committed capture artifact is missing.");
    return { ...out, target, exists };
  });
  if (mode === "write") for (const out of targets) if (!out.exists) {
    fs.mkdirSync(path.dirname(out.target), { recursive: true });
    fs.writeFileSync(out.target, out.bytes, { flag: "wx" });
  }
  return { mode, sourceCommit: prepared.sourceCommit, year: "2025", sourceRecords: prepared.edition.sourceRecordCount,
    summary: prepared.edition.summary, editionSha256: prepared.edition.sha256,
    files: targets.map(t => ({ path: t.path, bytes: t.bytes.length, sha256: fundingSha256(t.bytes), existed: t.exists })),
    networkRequests: 0 };
}
function main() {
  const args = process.argv.slice(2), options = {}; let mode = "plan", modeSeen = false;
  for (let i = 0; i < args.length; i++) {
    if (["--plan", "--check", "--write"].includes(args[i])) { require(!modeSeen, "Choose one capture mode."); mode = args[i].slice(2); modeSeen = true; }
    else {
      const names = { "--metadata": "metadataFile", "--receipt": "receiptFile", "--csv": "csvFile", "--source-commit": "sourceCommit" };
      const key = names[args[i]]; require(key && !Object.hasOwn(options, key) && args[i + 1], "Use only the documented closed capture arguments."); options[key] = args[++i];
    }
  }
  require(["metadataFile", "receiptFile", "csvFile", "sourceCommit"].every(k => typeof options[k] === "string"), "Required: --metadata, --receipt, --csv and --source-commit. Default is read-only plan.");
  console.log(JSON.stringify(writeCapture(prepareCapture(options), mode), null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (e) { console.error(e instanceof Error ? e.message : "Funding capture refused."); process.exitCode = 1; }
}
