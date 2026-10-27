// Explicit maintainer interpretation of four fixed original URLs. This module
// neither fetches nor writes a source. Originals/text extractions stay private.
import { parse } from "parse5";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
const sha = b => createHash("sha256").update(b).digest("hex");
const MAX = 8 * 1024 * 1024;
const fail = message => { throw new Error(`Disaster source: ${message}`); };
const definitions = [
  ["maui-projects", "https://www.mauirecovers.org/recoveryprojects", "County of Maui", "County recovery projects", "maui-wildfires-2023", "text/html"],
  ["maui-home", "https://mauirecovers.org/", "County of Maui", "Maui Recovers official website", "maui-wildfires-2023", "text/html"],
  ["maui-terms", "https://mauirecovers.org/termsandconditions", "County of Maui", "Maui Recovers terms and conditions", "maui-wildfires-2023", "text/html"],
  ["ifrc-mdrtr004-final", "https://go-api.ifrc.org/api/DownloadFile/83904/MDRTR004far", "International Federation of Red Cross and Red Crescent Societies", "IFRC MDRTR004 final report", "turkiye-earthquakes-2023", "application/pdf"],
];
export const SOURCE_DESCRIPTORS = Object.freeze(definitions.map(([id, requestedUrl, publisher, title, incidentId, mediaType]) => Object.freeze({ id, requestedUrl, finalUrls: Object.freeze([requestedUrl]), publisher, title, incidentId, mediaType })));
export function sourceDescriptor(id) { const value = SOURCE_DESCRIPTORS.find(d => d.id === id); if (!value) fail("descriptor is outside the reviewed four-source allowlist"); return value; }
export function assertDescriptorUrls(id, requestedUrl, finalUrl) { const d = sourceDescriptor(id); if (requestedUrl !== d.requestedUrl || !d.finalUrls.includes(finalUrl)) fail("original or redirect URL differs from the exact reviewed descriptor"); return d; }
const target = d => ({ kind: "incident", incidentId: d.incidentId });
const operation = d => ({ kind: "response-operation", incidentId: d.incidentId, issuer: d.publisher, code: "MDRTR004", originalUrl: d.requestedUrl });
function text(bytes) { try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); } catch { fail("original HTML is not valid UTF-8"); } }
function boundedBytes(value) { if (!(value instanceof Uint8Array) || value.byteLength < 1 || value.byteLength > MAX) fail("original must contain1..8 MiB of bytes"); return Buffer.from(value); }
function contentType(value) { if (value !== null && (typeof value !== "string" || value.length > 256 || /[\x00-\x1f\x7f,]/.test(value))) fail("ambiguous or malformed HTTP Content-Type"); return value; }
const DAY = /^([1-9]\d{3})-(\d{2})-(\d{2})$/;
function day(value, literal, mapping) { if (!DAY.test(value) || new Date(value + "T00:00:00.000Z").toISOString().slice(0, 10) !== value) fail("source day is invalid"); return { kind: "day", day: value, literal, mapping }; }
function dmy(value) { const m = /^(\d{2})\/(\d{2})\/([1-9]\d{3})$/.exec(value); if (!m) fail("unsupported source-specific DMY date"); return day(`${m[3]}-${m[2]}-${m[1]}`, value, "day-month-year"); }
export function pdfMetadataInstant(literal) {
  if (typeof literal !== "string" || literal.length > 128) fail("unsupported PDF metadata timestamp");
  const m = /^([1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(Z|[+-]\d{2}(?::\d{2})?)$/.exec(literal);
  if (!m) fail("unsupported pdfinfo-isodates timestamp; no date guess was made");
  const offset = m[2] === "Z" ? "Z" : m[2].length === 3 ? m[2] + ":00" : m[2];
  if (offset !== "Z" && (!/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(offset) || /^[-+]14:(?!00)/.test(offset))) fail("unsupported PDF metadata offset");
  const parsed = Date.parse(m[1] + offset);
  if (!Number.isFinite(parsed)) fail("invalid PDF metadata date");
  // Roundtrip the wall-clock fields to reject February30 and similar aliases.
  const shift = offset === "Z" ? 0 : (offset[0] === "+" ? 1 : -1) * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4))) * 60000;
  if (new Date(parsed + shift).toISOString().slice(0, 19) !== m[1]) fail("invalid PDF metadata calendar fields");
  return { kind: "instant", instant: new Date(parsed).toISOString(), literal, reportedOffset: offset, mapping: "pdf-metadata" };
}
function htmlBlocks(bytes) {
  const value = text(bytes);
  if (value.startsWith("\ufeff") || !/<(?:!doctype\s+html|html\b)/i.test(value)) fail("expected HTML body is absent");
  const document = parse(value), blocks = []; let headings = [], paragraph = 0;
  const visibleText = n => n.nodeName === "#text" ? n.value : ["script", "style", "noscript"].includes(n.tagName) ? "" : (n.childNodes || []).map(visibleText).join(" ");
  function walk(n) {
    if (["script", "style", "noscript", "head"].includes(n.tagName)) return;
    const h = /^h[1-6]$/.test(n.tagName || "");
    if (h) { const level = Number(n.tagName[1]); headings = [...headings.filter(entry=>entry.level<level),{level,text:visibleText(n).replace(/\s+/g, " ").trim()}]; }
    if (n.tagName === "p") ++paragraph;
    if (["p", "h1", "h2", "h3", "h4", "h5", "h6"].includes(n.tagName)) blocks.push({ text: visibleText(n).replace(/\s+/g, " ").trim(), headings: headings.map(entry=>entry.text), paragraph, heading: h });
    for (const child of n.childNodes || []) walk(child);
  }
  walk(document); return blocks;
}
function locate(blocks, pattern) { const b = blocks.find(v => pattern.test(v.text)); if (!b) fail("reviewed source statement/locator is absent; do not infer unchanged facts"); return { kind: "html", headings: b.headings, paragraph: b.paragraph, shortQuote: null }; }
const item = (id, d, authoredText, locator, roles, status = null, scopedTarget = target(d)) => ({ id, target: scopedTarget, authoredText, locator, roles, basis: "source-self-report", status });
function htmlMaterial(d, bytes) {
  const blocks = htmlBlocks(bytes);
  const items = [];
  if (d.id === "maui-projects") {
    const loc = locate(blocks, /long.term recovery.*August 2023 wildfires/i);
    items.push(item("recovery", d, "The county describes long-term recovery from the August 2023 wildfires.", loc, ["status", "period"], { targetKind: "incident", value: "recovery" }));
  } else if (d.id === "maui-home") {
    // The retained identity paragraph is in the footer, outside the preceding
    // support form's heading context. Its whole-document paragraph is exact;
    // an empty chain makes no unsupported heading ancestry assertion.
    items.push(item("official-identity", d, "The website identifies itself as the official County of Maui recovery website.", {...locate(blocks, /official County of Maui website/i),headings:[]}, ["identity"]));
  } else {
    items.push(item("terms", d, "County terms describe contributed listings and disclaim endorsement and accuracy assurances.", locate(blocks, /does not endorse.*accuracy/i), ["rights"]));
  }
  return { published: null, sourceUpdated: null, documentCreated: null, documentModified: null, dateDiscrepancy: null, literalFields: d.id === "maui-projects" ? [{ name: "reported-incident-month", value: "August 2023" }] : [], items };
}
export async function inspectPdfBytes(bytes, { signal, pdfinfo = process.env.PDFINFO || "pdfinfo", pdftotext = process.env.PDFTOTEXT || "pdftotext" } = {}) {
  bytes = boundedBytes(bytes); if (bytes.subarray(0, 5).toString() !== "%PDF-") fail("PDF signature is absent");
  if (signal?.aborted) throw signal.reason || new Error("Canceled");
  const options = { encoding: "utf8", timeout: 30000, maxBuffer: 256 * 1024, signal };
  // Child stdin carries the private body; no temporary public extraction file.
  async function child(command, args, input) {
    return await new Promise((resolve,reject)=>{
      const p=execFile(command,args,options,(error,stdout,stderr)=>error?reject(new Error('Required bounded PDF parser failed')):resolve({stdout,stderr}));
      // A parser may reject/exit before consuming the bounded original. Its
      // stdin EPIPE is an ordinary rejected parse, never an unhandled event.
      p.stdin.on('error',reject);p.stdin.end(input);
    });
  }
  const metadata = await child(pdfinfo, ["-isodates", "-"], bytes), extracted = await child(pdftotext, ["-layout", "-f", "1", "-l", "1", "-", "-"], bytes), version = await child(pdfinfo, ["-v"]);
  const parser = (version.stdout + version.stderr).split(/\r?\n/)[0];
  if (!/^pdfinfo version [\w.+-]+$/.test(parser) || parser.length > 120 || !/^Pages:\s+[1-9]\d*\s*$/m.test(metadata.stdout) || /^Encrypted:\s+yes/m.test(metadata.stdout)) fail("PDF metadata parser result is unavailable or unsupported");
  return { text: extracted.stdout, metadata: metadata.stdout, parser };
}
export function materialFromPdfObservation(d, observation) {
  d = sourceDescriptor(d?.id);
  if (d.id !== "ifrc-mdrtr004-final") fail("PDF observation requires the reviewed IFRC descriptor");
  const { text: extracted, metadata, parser } = observation;
  if (typeof extracted !== "string" || extracted.length > 256 * 1024 || typeof metadata !== "string" || metadata.length > 256 * 1024 || typeof parser !== "string" || parser.length > 120) fail("PDF parser observation is invalid");
  if (!/FINAL\s+REPORT/i.test(extracted) || !/MDRTR004/.test(extracted) || !/Internal/.test(extracted)) fail("reviewed report identity or Internal marking is absent");
  const issue = /(?:Date\s+of\s+issue\s*:\s*|\b)(03\/11\/2025)\b/.exec(extracted);
  const period = /(07\/02\/2023)\s*(?:to|[-–])\s*(28\/02\/2025)/.exec(extracted);
  if (!issue || !period) fail("reviewed printed issue day/operation period changed; a new descriptor review is required");
  const rawCreated = /^CreationDate:\s*(.+)\s*$/m.exec(metadata)?.[1]?.trim(), rawModified = /^ModDate:\s*(.+)\s*$/m.exec(metadata)?.[1]?.trim();
  if (!rawCreated || !rawModified) fail("PDF metadata creation/modification observations are absent");
  const documentCreated = pdfMetadataInstant(rawCreated), documentModified = pdfMetadataInstant(rawModified), loc = { kind: "pdf", pdfPage: 1, printedPage: null, headings: ["FINAL REPORT"], row: ["Operation timeframe"], column: [], shortQuote: null };
  return {
    published: dmy(issue[1]), sourceUpdated: null, documentCreated, documentModified,
    dateDiscrepancy: "The printed issue day and PDF file-metadata dates differ. File metadata is not a publisher update.",
    literalFields: [{ name: "printed-issue-day", value: issue[1] }, { name: "reported-operation-period", value: `${period[1]} to ${period[2]}` }, { name: "document-marking", value: "Internal" }],
    items: [
      item("operation-period", d, "The final report gives an operation period from February 7, 2023 through February 28, 2025.", loc, ["status", "period"], { targetKind: "response-operation", value: "ended" }, operation(d)),
      item("issue-day", d, "The final report's printed issue day is November 3, 2025.", { ...loc, row: ["Date of issue"] }, ["statement"]),
      item("file-created", d, "The PDF creation metadata differs from its printed issue day.", { kind: "metadata", field: "pdf-created", parser, observedLiteral: rawCreated }, ["date-discrepancy"]),
      item("file-modified", d, "The PDF modification metadata is retained separately from publication dates.", { kind: "metadata", field: "pdf-modified", parser, observedLiteral: rawModified }, ["date-discrepancy"]),
      item("internal-marking", d, "The publicly accessible PDF is marked Internal; no redistribution permission is established.", { ...loc, row: ["Internal"] }, ["rights"]),
    ],
  };
}
export async function inspectSourceOriginal({ descriptor, bytes, responseContentType = null, requestedUrl, finalUrl, signal, parserSettings } = {}) {
  const d = sourceDescriptor(descriptor); assertDescriptorUrls(descriptor, requestedUrl ?? d.requestedUrl, finalUrl ?? d.requestedUrl);
  bytes = boundedBytes(bytes); responseContentType = contentType(responseContentType);
  const material = d.mediaType === "application/pdf" ? materialFromPdfObservation(d, await inspectPdfBytes(bytes, { ...parserSettings, signal })) : htmlMaterial(d, bytes);
  return {
    descriptor: d.id, publisher: d.publisher, title: d.title, requestedUrl: d.requestedUrl, finalUrl: finalUrl ?? d.requestedUrl,
    original: { mediaType: d.mediaType, responseContentType, bytes: bytes.length, sha256: sha(bytes) },
    ...material, disposition: "external-original-only",
    rights: { reuse: "unknown-not-granted", publicOriginal: false, attribution: d.publisher, termsUrl: d.id.startsWith("maui-") ? sourceDescriptor("maui-terms").requestedUrl : null, reason: d.id === "ifrc-mdrtr004-final" ? "The report is marked Internal. The original and its extraction remain private; no redistribution permission is established." : "No general republishing grant was found. Only an authored factual note and source metadata are public." },
    evidence: "source-self-report", limitations: ["Publisher self-report, with no independent current-needs verification.", "Original body and full extraction are excluded from public output.", ...(d.id === "maui-projects" ? ["Only the recovery introduction is collected; project categories, progress and completion details remain uncollected."] : [])],
  };
}
