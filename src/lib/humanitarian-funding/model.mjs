/** Fixed-source humanitarian funding reference. No network, storage or inferred totals. */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export const FUNDING_HEADERS = Object.freeze([
  "countryCode", "id", "name", "code", "typeId", "typeName", "startDate",
  "endDate", "year", "requirements", "funding", "percentFunded",
]);
export const FUNDING_LIMITS = Object.freeze({ bytes: 1_048_576, records: 10_000, field: 2000, editionBytes: 4_194_304 });
export const FUNDING_LICENSE = Object.freeze({
  id: "CC-BY-3.0-IGO", title: "Creative Commons Attribution 3.0 IGO",
  url: "https://creativecommons.org/licenses/by/3.0/igo/legalcode",
});
export const FUNDING_MODIFICATION = "Charitology selected the 2025 records, preserved their source strings and added filters, provenance and derived exact-rational coverage. This draft interpretation is not endorsed by OCHA or its partners.";
export const FUNDING_LIMITATIONS = Object.freeze([
  "Reported humanitarian funding and published plan requirements, not all charitable giving or independently measured need.",
  "Rows are country × source plan identifier × reference year; identifiers can repeat across countries with different amounts.",
  "Plans and other source rows can overlap. No country, plan or worldwide funding total is calculated here.",
  "A blank is not zero. Rows without a plan identifier are not relabeled as country totals.",
  "The source-rounded percent is distinct from the exact ratio derived from the reported USD amounts.",
  "Funding can exceed requirements or include signed adjustments. Coverage is not effectiveness, unmet need or a charity rating.",
  "A fixed source snapshot can change upstream later. Its HTTP Date and publisher modification strings are retained separately.",
]);
const enc = new TextEncoder();
export const fundingSha256 = (input) => bytesToHex(sha256(typeof input === "string" ? enc.encode(input) : input));
function refuse(message) { throw new Error(message); }
function require(ok, message) { if (!ok) refuse(message); }
function exact(v, keys) {
  require(v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype, "Expected a plain funding object.");
  require(Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k)), "Funding fields differ from this format.");
}
export function fundingCanonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") { require(Number.isSafeInteger(value), "Funding integers must be exact."); return String(value); }
  if (Array.isArray(value)) return `[${value.map(fundingCanonical).join(",")}]`;
  require(value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype, "Unsupported funding value.");
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${fundingCanonical(value[k])}`).join(",")}}`;
}
export const fundingObjectHash = (v) => fundingSha256(fundingCanonical(v));
function sealed(value) { return { ...value, sha256: fundingObjectHash(value) }; }
function verifySeal(value) {
  require(value && /^[a-f0-9]{64}$/.test(value.sha256 ?? ""), "Funding checksum is missing.");
  const { sha256: hash, ...body } = value;
  require(fundingObjectHash(body) === hash, "Funding checksum does not match.");
}
function date(value) {
  require(/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, "Invalid written source date.");
}
export function fundingDecimal(raw, { signed = true } = {}) {
  require(typeof raw === "string" && raw.length <= 64, "Invalid funding decimal token.");
  if (raw === "") return null;
  require((signed ? /^-?\d+(?:\.\d+)?$/ : /^\d+(?:\.\d+)?$/).test(raw), "Use an exact source decimal, or an empty field for missing.");
  const [whole, fraction = ""] = raw.split(".");
  require(fraction.length <= 18, "Source decimal precision exceeds this format.");
  return { coefficient: BigInt(whole + fraction), scale: fraction.length };
}
function gcd(a, b) { a = a < 0n ? -a : a; while (b) [a, b] = [b, a % b]; return a; }
export function fundingCoverage(requirements, funding) {
  const r = fundingDecimal(requirements, { signed: false }), f = fundingDecimal(funding);
  if (!r || !f) return { status: !r && !f ? "both-missing" : !r ? "requirements-missing" : "funding-missing", numerator: null, denominator: null, displayPercent: null };
  if (r.coefficient === 0n) return { status: "zero-requirements", numerator: null, denominator: null, displayPercent: null };
  let n = f.coefficient * 10n ** BigInt(r.scale), d = r.coefficient * 10n ** BigInt(f.scale);
  const divisor = gcd(n, d); n /= divisor; d /= divisor;
  // Display only: two decimals, nearest with exact halves away from zero.
  const abs = n < 0n ? -n : n, rounded = (abs * 10_000n * 2n + d) / (2n * d);
  const displayPercent = `${n < 0n && rounded !== 0n ? "-" : ""}${rounded / 100n}.${String(rounded % 100n).padStart(2, "0")}`;
  return { status: "comparable", numerator: String(n), denominator: String(d), displayPercent };
}
export function fundingUsd(raw) {
  if (raw === "") return "Not reported";
  fundingDecimal(raw);
  const [integer, fraction] = raw.split("."), negative = integer.startsWith("-");
  const digits = negative ? integer.slice(1) : integer;
  return `USD ${negative ? "−" : ""}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction === undefined ? "" : "." + fraction}`;
}
function rawKey(raw) {
  exact(raw, FUNDING_HEADERS);
  require(FUNDING_HEADERS.every(h => typeof raw[h] === "string" && raw[h].length <= FUNDING_LIMITS.field && !raw[h].includes("\u0000")), "Invalid raw source string.");
  require(/^[A-Z]{3}$/.test(raw.countryCode), "Invalid source country code.");
  require(raw.id === "" || /^\d{1,20}$/.test(raw.id), "Invalid source plan identifier.");
  require(raw.typeId === "" || /^\d{1,20}$/.test(raw.typeId), "Invalid source type identifier.");
  require(/^\d{4}$/.test(raw.year) && Number(raw.year) >= 1900 && Number(raw.year) <= 2200, "Invalid source reference year.");
  for (const d of [raw.startDate, raw.endDate]) if (d !== "") date(d);
  if (raw.startDate && raw.endDate) require(raw.endDate >= raw.startDate, "Source end date precedes start date.");
  require(raw.name.length > 0 && raw.code.length <= 160 && raw.typeName.length <= 240, "Invalid source plan labels.");
  fundingDecimal(raw.requirements, { signed: false }); fundingDecimal(raw.funding); fundingDecimal(raw.percentFunded);
  return `${raw.countryCode}:${raw.id || "no-plan"}:${raw.year}`;
}

/** Strict RFC-style CSV, retaining decoded cells and original record byte spans. */
export function parseFundingCsv(input) {
  require(input instanceof Uint8Array && input.byteLength > 0 && input.byteLength <= FUNDING_LIMITS.bytes, "Choose a complete bounded UTF-8 funding CSV.");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(input); }
  catch { refuse("Funding CSV is not valid UTF-8."); }
  require(!text.includes("\u0000"), "Funding CSV contains a NUL character.");
  const bom = text.startsWith("\uFEFF"); if (bom) text = text.slice(1);
  const parsed = []; let cells = [], cell = "", quoted = false, closed = false, start = 0, byteStart = bom ? 3 : 0, firstLine = 1;
  const field = () => { require(cell.length <= FUNDING_LIMITS.field, "Funding CSV field is too long."); cells.push(cell); cell = ""; closed = false; require(cells.length <= 12, "Funding CSV has extra columns."); };
  function record(end) {
    field(); const rawRecord = text.slice(start, end), bytes = enc.encode(rawRecord);
    const breaks = (rawRecord.match(/\n/g) || []).length, endsLine = rawRecord.endsWith("\n");
    parsed.push({ cells, recordNumber: parsed.length + 1, firstLine, lastLine: firstLine + breaks - (endsLine ? 1 : 0), byteStart, byteEnd: byteStart + bytes.length, rawSha256: fundingSha256(bytes) });
    require(parsed.length <= FUNDING_LIMITS.records + 1, "Funding CSV has too many records.");
    byteStart += bytes.length; firstLine += breaks; cells = []; start = end;
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += c;
    } else if (c === ",") field();
    else if (c === "\r" || c === "\n") {
      if (c === "\r") { require(text[i + 1] === "\n", "Bare CR outside a quoted CSV field."); i++; }
      record(i + 1);
    } else if (c === '"') { require(!closed && cell === "", "Unexpected CSV quote."); quoted = true; }
    else { require(!closed, "Unexpected text after a quoted CSV field."); cell += c; }
    require(cell.length <= FUNDING_LIMITS.field, "Funding CSV field is too long.");
  }
  require(!quoted, "Unclosed quoted funding field.");
  if (start < text.length) record(text.length);
  require(byteStart === input.byteLength && parsed.length > 1, "Funding CSV is incomplete or empty.");
  require(JSON.stringify(parsed[0].cells) === JSON.stringify(FUNDING_HEADERS), "Funding CSV header differs from the twelve-column contract.");
  const seen = new Set(), rows = [];
  for (const item of parsed.slice(1)) {
    require(item.cells.length === 12, "Funding CSV record has missing columns.");
    const raw = Object.fromEntries(FUNDING_HEADERS.map((h, i) => [h, item.cells[i]]));
    const key = rawKey(raw);
    require(!seen.has(key), "Duplicate country × plan × year source record."); seen.add(key);
    const { cells: _, ...locator } = item;
    rows.push({ key, raw, locator, coverage: fundingCoverage(raw.requirements, raw.funding) });
  }
  return { sourceBytes: input.byteLength, sourceSha256: fundingSha256(input), totalRecords: rows.length, rows };
}
export function fundingSummary(rows) {
  return {
    rows: rows.length, countryCodes: new Set(rows.map(r => r.raw.countryCode)).size,
    identifiedPlanCountryRows: rows.filter(r => r.raw.id !== "").length,
    missingFundingRows: rows.filter(r => r.raw.funding === "").length,
    explicitZeroFundingRows: rows.filter(r => r.raw.funding !== "" && fundingDecimal(r.raw.funding).coefficient === 0n).length,
    comparableRows: rows.filter(r => r.coverage.status === "comparable").length,
  };
}
export function makeFundingEdition(parsed, source, sourceCode, year = "2025") {
  require(/^\d{4}$/.test(year), "Choose an explicit source reference year.");
  require(parsed.sourceSha256 === source.csvSha256 && parsed.sourceBytes === source.csvBytes, "Edition source does not match the admitted original CSV.");
  const rows = parsed.rows.filter(r => r.raw.year === year);
  require(rows.length > 0, "No rows exist for this reference year.");
  const edition = sealed({
    format: "charitology-humanitarian-funding-edition", version: 1, referenceYear: year,
    review: "draft", units: "USD as reported by OCHA FTS; no currency or price adjustment",
    source, sourceCode, headers: [...FUNDING_HEADERS], sourceRecordCount: parsed.totalRecords,
    summary: fundingSummary(rows), modification: FUNDING_MODIFICATION,
    limitations: [...FUNDING_LIMITATIONS], rows,
  });
  require(enc.encode(JSON.stringify(edition)).length <= FUNDING_LIMITS.editionBytes, "Funding edition is too large.");
  return edition;
}
/** Browser projection integrity only; publication itself is checked against the full source. */
export function validateFundingProjection(edition) {
  exact(edition, ["format", "version", "referenceYear", "review", "units", "source", "sourceCode", "headers", "sourceRecordCount", "summary", "modification", "limitations", "rows", "sha256"]);
  require(edition.format === "charitology-humanitarian-funding-edition" && edition.version === 1 && edition.review === "draft" && edition.referenceYear === "2025", "Unsupported funding projection.");
  require(enc.encode(JSON.stringify(edition)).length <= FUNDING_LIMITS.editionBytes && Array.isArray(edition.rows) && edition.rows.length > 0 && edition.rows.length <= FUNDING_LIMITS.records, "Funding projection is empty or too large.");
  require(JSON.stringify(edition.headers) === JSON.stringify(FUNDING_HEADERS) && edition.modification === FUNDING_MODIFICATION && fundingCanonical(edition.limitations) === fundingCanonical(FUNDING_LIMITATIONS), "Funding interpretation or column contract differs.");
  require(Number.isSafeInteger(edition.sourceRecordCount) && edition.sourceRecordCount >= edition.rows.length && edition.sourceRecordCount <= FUNDING_LIMITS.records, "Invalid source record count.");
  require(Number.isSafeInteger(edition.source?.csvBytes) && edition.source.csvBytes > 0 && edition.source.csvBytes <= FUNDING_LIMITS.bytes && /^[a-f0-9]{64}$/.test(edition.source.csvSha256 ?? ""), "Invalid original CSV identity.");
  verifySeal(edition);
  const seen = new Set(); let priorEnd = 0, priorRecord = 1;
  for (const r of edition.rows) {
    exact(r, ["key", "raw", "locator", "coverage"]);
    require(r.key === rawKey(r.raw) && r.raw.year === edition.referenceYear && !seen.has(r.key), "Funding row identity/year is invalid or repeated."); seen.add(r.key);
    const l = r.locator; exact(l, ["recordNumber", "firstLine", "lastLine", "byteStart", "byteEnd", "rawSha256"]);
    require([l.recordNumber, l.firstLine, l.lastLine, l.byteStart, l.byteEnd].every(Number.isSafeInteger) && l.recordNumber > priorRecord && l.recordNumber <= edition.sourceRecordCount + 1 && l.firstLine >= 2 && l.lastLine >= l.firstLine && l.byteStart >= priorEnd && l.byteEnd > l.byteStart && l.byteEnd <= edition.source.csvBytes && /^[a-f0-9]{64}$/.test(l.rawSha256 ?? ""), "Invalid source record locator.");
    priorEnd = l.byteEnd; priorRecord = l.recordNumber;
    require(fundingCanonical(r.coverage) === fundingCanonical(fundingCoverage(r.raw.requirements, r.raw.funding)), "Derived funding coverage changed.");
  }
  require(fundingCanonical(edition.summary) === fundingCanonical(fundingSummary(edition.rows)), "Funding counts differ from the retained records.");
  return edition;
}
/** Recreate from the separately licensed exact source envelope, never from live data. */
export function validateFundingEdition(edition, envelope) {
  validateFundingProjection(edition); verifySeal(envelope);
  exact(envelope, ["format", "version", "source", "sourceCode", "csvUtf8", "modification", "sha256"]);
  require(envelope.format === "charitology-humanitarian-funding-source" && envelope.version === 1, "Unsupported funding source envelope.");
  const parsed = parseFundingCsv(enc.encode(envelope.csvUtf8));
  require(parsed.sourceSha256 === envelope.source.csvSha256 && parsed.sourceBytes === envelope.source.csvBytes, "Source envelope bytes differ from the captured source.");
  const rebuilt = makeFundingEdition(parsed, envelope.source, envelope.sourceCode, edition.referenceYear);
  require(fundingCanonical(rebuilt) === fundingCanonical(edition), "Funding edition differs from the complete captured source.");
  return edition;
}
export function makeFundingSource(csvUtf8, source, sourceCode) {
  const parsed = parseFundingCsv(enc.encode(csvUtf8));
  require(parsed.sourceSha256 === source.csvSha256 && parsed.sourceBytes === source.csvBytes, "Captured CSV provenance differs.");
  return sealed({ format: "charitology-humanitarian-funding-source", version: 1, source, sourceCode, csvUtf8, modification: "Original CSV bytes are wrapped in JSON without changing their UTF-8 content. Charitology metadata is added; no endorsement is implied." });
}
export function selectFundingRows(edition, { search = "", country = "", type = "" } = {}) {
  const q = search.normalize("NFKC").toLocaleLowerCase("en-US").trim();
  return edition.rows.filter(r => (!country || r.raw.countryCode === country) && (!type || (r.raw.typeId || "no-type") === type) && (!q || FUNDING_HEADERS.map(h => r.raw[h]).join(" ").normalize("NFKC").toLocaleLowerCase("en-US").includes(q)));
}
export function fundingSelectionJson(edition, rows, selection) {
  require(rows.every(r => edition.rows.includes(r)) && new Set(rows.map(r => r.key)).size === rows.length, "Selection is not part of this funding edition.");
  return JSON.stringify({ format: "charitology-humanitarian-funding-selection", version: 1, referenceYear: edition.referenceYear,
    editionSha256: edition.sha256, source: edition.source, sourceCode: edition.sourceCode,
    units: edition.units, modification: edition.modification, limitations: edition.limitations,
    selection, selectedRows: rows.length, editionRows: edition.rows.length, sourceRecordCount: edition.sourceRecordCount,
    headers: edition.headers, summary: fundingSummary(rows), rows }, null, 2) + "\n";
}
function csvCell(value) { const s = String(value); return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; }
function safeSourceText(value) {
  // Reversible: prefix one apostrophe to dangerous text OR an original apostrophe.
  // Validated numeric/date/code columns are not changed. Canonical raw values live in JSON.
  return /^\s*[=+@-]/.test(value) || value.startsWith("'") ? "'" + value : value;
}
export const FUNDING_CSV_TEXT_POLICY = "For name, code and typeName only, one leading apostrophe is added when the original starts with an apostrophe or its first non-whitespace character is =,+,@,-. Remove exactly one apostrophe only when this rule applies to recover the source text. JSON preserves canonical raw strings. The first record is provenance; records marked data are the selected source rows.";
export function fundingSelectionCsv(edition, rows, selection) {
  require(rows.every(r => edition.rows.includes(r)) && new Set(rows.map(r => r.key)).size === rows.length, "Selection is not part of this funding edition.");
  const tail = ["record_type", "row_key", "source_record", "source_first_line", "source_last_line", "source_byte_start", "source_byte_end", "source_row_sha256", "derived_status", "derived_ratio_numerator", "derived_ratio_denominator", "derived_percent_2dp", "edition_sha256", "reference_year", "units", "source_code_commit", "source_records", "edition_rows", "source_csv_sha256", "source_title", "source_url", "snapshot_http_date", "source_modified_literal", "attribution", "license", "license_url", "modification", "csv_text_policy", "selection"];
  const common = [edition.sha256, edition.referenceYear, edition.units, edition.sourceCode.commit, edition.sourceRecordCount, edition.rows.length, edition.source.csvSha256, edition.source.title, edition.source.resourceUrl, edition.source.httpDate,
    edition.source.resourceModified, edition.source.attribution, edition.source.license.id, edition.source.license.url,
    edition.modification, FUNDING_CSV_TEXT_POLICY, JSON.stringify(selection)];
  const records = [[...FUNDING_HEADERS, ...tail], [...FUNDING_HEADERS.map(() => ""), "provenance", ...Array(11).fill(""), ...common]];
  for (const r of rows) records.push([
    ...FUNDING_HEADERS.map(h => ["name", "code", "typeName"].includes(h) ? safeSourceText(r.raw[h]) : r.raw[h]),
    "data", r.key, r.locator.recordNumber, r.locator.firstLine, r.locator.lastLine,
    r.locator.byteStart, r.locator.byteEnd, r.locator.rawSha256, r.coverage.status,
    r.coverage.numerator ?? "", r.coverage.denominator ?? "", r.coverage.displayPercent ?? "", ...common,
  ]);
  return records.map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
