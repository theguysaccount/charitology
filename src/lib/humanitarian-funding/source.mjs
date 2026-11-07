/** Allowlisted publisher metadata for the captured bulk CSV, not the HAPI endpoint. */
import { FUNDING_LICENSE, fundingSha256 } from "./model.mjs";
export const FUNDING_SOURCE_PINS = Object.freeze({
  datasetId: "b2bbb33c-2cfb-4809-8dd3-6bbdc080cbb9",
  packageName: "global-requirements-and-funding-data",
  resourceId: "b3232da8-f1e4-41ab-9642-b22dae10a1d7",
  csvBytes: 279894,
  csvSha256: "ad5cb07e4f70a528e51b66b865f798ff2ef95e5a8b0d77ad3b8a303b58bb364d",
  metadataSha256: "5836d55cd9bd38c146898b608c34c722cd25be7e6051e00ed580b1e395cea03d",
});
export const FUNDING_CODE_PATHS = Object.freeze([
  "scripts/capture-humanitarian-funding.mjs",
  "src/lib/humanitarian-funding/model.mjs",
  "src/lib/humanitarian-funding/source.mjs",
]);
export const FUNDING_ATTRIBUTION = "OCHA Financial Tracking Service (FTS), Global - Requirements and Funding Data, via HDX. Source data licensed under CC BY 3.0 IGO.";
export const FUNDING_DOCUMENTATION = Object.freeze([
  "https://hdx-hapi.readthedocs.io/en/latest/data_usage_guides/coordination_and_context/",
  "https://knowledge.base.unocha.org/wiki/spaces/imtoolbox/pages/2359263233",
]);
export const FUNDING_LICENSE_SUMMARY = "OCHA FTS source data: CC BY 3.0 IGO, Global - Requirements and Funding Data, via HDX. Charitology selects 2025 rows and adds provenance and exact-rational coverage; these draft changes imply no publisher endorsement. Original raw values, source URL, modification notice and license are included in the data.";
const SOURCE_KEYS = ["publisher", "title", "datasetId", "datasetUrl", "resourceId", "resourceUrl", "resourceFilename", "resourceModified", "metadataModified", "publisherDateRange", "publisherHashLiteral", "publisherHashAlgorithm", "metadataSha256", "csvBytes", "csvSha256", "httpDate", "asOf", "evidenceUrl", "attribution", "license", "documentation", "interpretation"];
function require(ok, message) { if (!ok) throw new Error(message); }
function queryFree(value) {
  require(typeof value === "string", "A canonical public source URL is required.");
  const u = new URL(value);
  require(u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash && !u.port && u.href === value, "Use only canonical query-free HTTPS source URLs.");
  return value;
}
export function fundingSourceMetadata(metadataBytes, receipt, csvBytes) {
  require(fundingSha256(metadataBytes) === FUNDING_SOURCE_PINS.metadataSha256, "The captured publisher metadata differs from this source pin.");
  require(csvBytes.byteLength === FUNDING_SOURCE_PINS.csvBytes && fundingSha256(csvBytes) === FUNDING_SOURCE_PINS.csvSha256, "The captured CSV differs from this source pin.");
  const packet = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(metadataBytes));
  const m = packet.result;
  require(packet.success === true && m?.id === FUNDING_SOURCE_PINS.datasetId && m.name === FUNDING_SOURCE_PINS.packageName, "Unexpected HDX package.");
  require(m.license_id === "cc-by-igo", "The captured dataset license changed.");
  const resources = m.resources.filter(r => r.id === FUNDING_SOURCE_PINS.resourceId);
  require(resources.length === 1, "The exact CSV resource is missing or repeated.");
  const resource = resources[0];
  require(resource.name === "fts_requirements_funding_global.csv" && resource.format === "CSV" && resource.size === csvBytes.byteLength, "Unexpected funding resource metadata.");
  require(receipt?.resource?.status === 200 && receipt.resource.sha256 === FUNDING_SOURCE_PINS.csvSha256 && receipt.resource.bytes === csvBytes.byteLength && receipt.resource.contentType === "text/csv", "The recorded successful CSV response differs.");
  require(receipt?.metadata?.status === 200 && receipt.metadata.sha256 === FUNDING_SOURCE_PINS.metadataSha256 && receipt.metadata.bytes === metadataBytes.byteLength && receipt.license === "cc-by-igo", "The recorded metadata response differs.");
  require(receipt.resource.requestedUrl === resource.url, "The response does not name the captured source resource.");
  const httpDate = receipt.resource.serverDate, instant = new Date(httpDate);
  require(Number.isFinite(instant.getTime()) && instant.toUTCString() === httpDate, "A canonical source HTTP Date is required.");
  const source = {
    publisher: "OCHA Financial Tracking Service (FTS), distributed by HDX",
    title: m.title,
    datasetId: m.id,
    datasetUrl: "https://data.humdata.org/dataset/global-requirements-and-funding-data",
    resourceId: resource.id,
    resourceUrl: queryFree(resource.url),
    resourceFilename: resource.name,
    resourceModified: resource.last_modified,
    metadataModified: m.metadata_modified,
    publisherDateRange: m.dataset_date,
    publisherHashLiteral: resource.hash,
    publisherHashAlgorithm: "Not specified in the resource metadata; not used as SHA-256",
    metadataSha256: FUNDING_SOURCE_PINS.metadataSha256,
    csvBytes: csvBytes.byteLength,
    csvSha256: FUNDING_SOURCE_PINS.csvSha256,
    httpDate, asOf: instant.toISOString(),
    evidenceUrl: `/data/humanitarian-funding/source-${FUNDING_SOURCE_PINS.csvSha256}.json`,
    attribution: FUNDING_ATTRIBUTION,
    license: { ...FUNDING_LICENSE },
    documentation: [...FUNDING_DOCUMENTATION],
    interpretation: "This is the HDX bulk CSV. The contextual HAPI guide describes a narrower processed endpoint and is not the downloaded data endpoint.",
  };
  return validateFundingSourceMetadata(source);
}
export function validateFundingSourceMetadata(source) {
  require(source && typeof source === "object" && !Array.isArray(source) && Object.keys(source).length === SOURCE_KEYS.length && SOURCE_KEYS.every(k => Object.hasOwn(source, k)), "Publisher metadata contains unsupported fields.");
  for (const [k, v] of Object.entries(source)) if (!["csvBytes", "license", "documentation"].includes(k)) require(typeof v === "string" && v.length > 0 && v.length <= 2000, "Invalid publisher metadata string.");
  require(source.title === "Global - Requirements and Funding Data" && source.datasetId === FUNDING_SOURCE_PINS.datasetId && source.resourceId === FUNDING_SOURCE_PINS.resourceId && source.csvBytes === FUNDING_SOURCE_PINS.csvBytes && source.csvSha256 === FUNDING_SOURCE_PINS.csvSha256 && source.metadataSha256 === FUNDING_SOURCE_PINS.metadataSha256, "Publisher/source metadata differs from its captured pin.");
  require(source.resourceFilename === "fts_requirements_funding_global.csv" && source.attribution === FUNDING_ATTRIBUTION && source.license && Object.keys(source.license).length === 3 && Object.entries(FUNDING_LICENSE).every(([k, v]) => source.license[k] === v), "Funding attribution or license changed.");
  queryFree(source.datasetUrl); queryFree(source.resourceUrl);
  require(source.datasetUrl === "https://data.humdata.org/dataset/global-requirements-and-funding-data" && source.resourceUrl === `https://data.humdata.org/dataset/${FUNDING_SOURCE_PINS.datasetId}/resource/${FUNDING_SOURCE_PINS.resourceId}/download/fts_requirements_funding_global.csv`, "Unexpected canonical source URL.");
  require(source.evidenceUrl === `/data/humanitarian-funding/source-${source.csvSha256}.json`, "Unexpected retained-source URL.");
  require(Array.isArray(source.documentation) && source.documentation.length === 2 && source.documentation.every((url, i) => url === FUNDING_DOCUMENTATION[i]), "Invalid contextual source links."); source.documentation.forEach(queryFree);
  const instant = new Date(source.httpDate); require(Number.isFinite(instant.getTime()) && instant.toUTCString() === source.httpDate && instant.toISOString() === source.asOf, "The source HTTP Date/as-of pair differs.");
  return source;
}
export function validateFundingSourceCode(code) {
  require(code && Object.keys(code).length === 4 && code.format === "charitology-funding-source-code" && code.version === 1 && /^[a-f0-9]{40}$/.test(code.commit ?? "") && !/^0+$/.test(code.commit), "An exact committed source-code identity is required.");
  require(Array.isArray(code.files) && code.files.length === FUNDING_CODE_PATHS.length, "The source-code input set differs.");
  for (let i = 0; i < FUNDING_CODE_PATHS.length; i++) {
    const f = code.files[i];
    require(f && Object.keys(f).length === 3 && f.path === FUNDING_CODE_PATHS[i] && Number.isSafeInteger(f.bytes) && f.bytes > 0 && /^[a-f0-9]{64}$/.test(f.sha256), "Invalid source-code file pin.");
  }
  return code;
}
