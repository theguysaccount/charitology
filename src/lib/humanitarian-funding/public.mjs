/** Static build only. No source download or provider action occurs on import/load. */
import fs from "node:fs";
import path from "node:path";
import { fundingCanonical, fundingSha256, validateFundingEdition } from "./model.mjs";
import { FUNDING_CODE_PATHS, FUNDING_SOURCE_PINS, validateFundingSourceCode, validateFundingSourceMetadata } from "./source.mjs";
// Astro emits this build helper into a chunk; its URL is not the source-tree root.
const REPO = path.resolve(process.cwd());
export const FUNDING_REGISTRY_PATH = "src/data/humanitarian-funding/registry.json";
function require(ok, message) { if (!ok) throw new Error(message); }
function read(relative, cap) {
  require(typeof relative === "string" && !relative.includes("\\") && !relative.split("/").some(x => ["", ".", ".."].includes(x)) && !path.isAbsolute(relative), "Unsafe funding artifact path.");
  let target = REPO;
  for (const part of relative.split("/")) { target = path.join(target, part); require(!fs.lstatSync(target).isSymbolicLink(), "Funding source paths cannot be symlinks."); }
  const stat = fs.statSync(target); require(stat.isFile() && stat.size <= cap, "Funding artifact is nonregular or too large.");
  const bytes = fs.readFileSync(target); require(bytes.length === stat.size, "Funding artifact changed while reading."); return bytes;
}
let cached;
export function freezeFundingEdition(edition) {
  function freeze(v) {
    if (v && typeof v === "object") { for (const child of Object.values(v)) freeze(child); Object.freeze(v); }
    return v;
  }
  return freeze(edition);
}
export function loadHumanitarianFunding() {
  if (cached !== undefined) return cached;
  if (!fs.existsSync(path.join(REPO, FUNDING_REGISTRY_PATH))) return null;
  const registry = JSON.parse(read(FUNDING_REGISTRY_PATH, 16384));
  require(registry.format === "charitology-humanitarian-funding-registry" && registry.version === 1 && registry.referenceYear === "2025", "Unsupported funding registry.");
  const expectedEdition = `src/data/humanitarian-funding/editions/fts-2025-${FUNDING_SOURCE_PINS.csvSha256}.json`;
  const expectedSource = `public/data/humanitarian-funding/source-${FUNDING_SOURCE_PINS.csvSha256}.json`;
  require(registry.edition.path === expectedEdition && registry.source.path === expectedSource, "Funding registry names a different source or edition.");
  const eb = read(expectedEdition, 4_194_304), sb = read(expectedSource, 2_097_152);
  require(fundingSha256(eb) === registry.edition.sha256 && fundingSha256(sb) === registry.source.sha256 && eb.length === registry.edition.bytes && sb.length === registry.source.bytes, "Funding registry artifact bytes differ.");
  const edition = JSON.parse(eb), source = JSON.parse(sb);
  validateFundingSourceMetadata(edition.source);
  validateFundingSourceCode(edition.sourceCode);
  for (const f of edition.sourceCode.files) {
    require(FUNDING_CODE_PATHS.includes(f.path), "Unexpected funding interpreter source.");
    const b = read(f.path, 524288); require(b.length === f.bytes && fundingSha256(b) === f.sha256, "Published funding interpreter bytes changed; preserve its version before changing the calculation.");
  }
  require(edition.source.csvSha256 === FUNDING_SOURCE_PINS.csvSha256 && edition.source.csvBytes === FUNDING_SOURCE_PINS.csvBytes, "Funding source differs from its fixed resource pin.");
  require(fundingCanonical(edition.source) === fundingCanonical(source.source) && fundingCanonical(edition.sourceCode) === fundingCanonical(source.sourceCode), "Funding source/edition provenance differs.");
  validateFundingEdition(edition, source);
  cached = freezeFundingEdition(edition);
  return cached;
}
export function requireHumanitarianFunding() {
  const edition = loadHumanitarianFunding();
  require(edition !== null, "No committed funding edition is available.");
  return edition;
}
