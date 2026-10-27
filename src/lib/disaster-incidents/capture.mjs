// Closed proposal admission shared by preview, installer and exact Retry.
// This module never changes the active inventory or invents editorial records.
import { canonicalBytes, recordHash, filePin, parseJSON, snapshotJSON, exact, equal, sha256 } from "./canonical.mjs";
import { LIMITS } from "./limits.mjs";
import { admitProductionHistory, historyInventory, historyRegistry } from "./model.mjs";
import { inspectSourceOriginal, sourceDescriptor, assertDescriptorUrls } from "./source-adapters.mjs";
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const HASH = /^[a-f0-9]{64}$/;
const COMMIT = /^(?!0{40}$)[a-f0-9]{40}$/;
const fail = m => { throw new Error(`Disaster capture: ${m}`); };
const bytesEqual = (a,b) => Buffer.from(a).equals(Buffer.from(b));
const matches = (v,re) => typeof v === "string" && re.test(v);
export function validateCaptureRequest(input) {
  const r = snapshotJSON(input, LIMITS.request);
  exact(r, ["interpretationCommit", "method", "predecessorRegistryHash", "candidateId"]);
  exact(r.method, ["kind", "id", "version", "hash"]);
  if (!matches(r.interpretationCommit,COMMIT) || !matches(r.candidateId,ID) || r.method.kind !== "method" || !matches(r.method.id,ID) || !Number.isSafeInteger(r.method.version) || r.method.version < 1 || !matches(r.method.hash,HASH) || (r.predecessorRegistryHash !== null && !matches(r.predecessorRegistryHash,HASH))) fail("request fields are invalid");
  canonicalBytes(r, LIMITS.request); return r;
}
export function canonicalFile(bytes, maximum) {
  const value = parseJSON(bytes, maximum);
  if (!bytesEqual(bytes,canonicalBytes(value, maximum))) fail("metadata must use exact canonical JSON plus one LF");
  return value;
}
export function proposedMethod(files, request) {
  const file = `methods/${request.method.id}/v${request.method.version}.json`, raw = files.get(file);
  if (!raw) fail("selected method is absent from the candidate");
  const value = canonicalFile(raw,LIMITS.method);
  if (value.kind !== "method" || value.hash !== request.method.hash || value.sourceCommit !== request.interpretationCommit) fail("candidate method does not match source A/request");
  return value;
}
export function assertCaptureAppend(previous, next, request) {
  const old = previous.size ? historyRegistry(admitProductionHistory(previous)) : null;
  const handle = admitProductionHistory(next), registry = historyRegistry(handle);
  if ((old?.hash ?? null) !== request.predecessorRegistryHash) fail("predecessor registry changed");
  if (old) {
    if (registry.bootstrapSourceCommit !== old.bootstrapSourceCommit || old.editions.length > registry.editions.length || old.editions.some((v,i)=>!equal(v,registry.editions[i]))) fail("historical registry prefix was removed, reordered or replaced");
    for (const [file,bytes] of previous) if (file !== "registry.json" && (!next.has(file) || !bytesEqual(bytes,next.get(file)))) fail("immutable predecessor bytes were changed");
  }
  const selected = canonicalFile(next.get(`editions/${registry.selected.id}.json`),LIMITS.edition);
  if (!equal(selected.interpretation,request.method) || selected.sourceCommit !== request.interpretationCommit) fail("the selected edition does not use the deliberately selected source A/method");
  return handle;
}
function originalEntry(v) {
  const r = snapshotJSON(v,LIMITS.proposal);
  exact(r,["descriptor","requestedUrl","finalUrl","attemptedAt","status","privatePath","original"]);
  assertDescriptorUrls(r.descriptor,r.requestedUrl,r.finalUrl);
  if (typeof r.attemptedAt !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.attemptedAt) || !Number.isFinite(Date.parse(r.attemptedAt)) || new Date(r.attemptedAt).toISOString() !== r.attemptedAt) fail("retrieval observation must be a canonical real instant");
  if (r.status !== null && (!Number.isInteger(r.status) || r.status < 100 || r.status > 599)) fail("HTTP status is invalid");
  if (r.original === null) { if (r.privatePath !== null) fail("an unavailable original cannot name a body"); }
  else {
    exact(r.original,["mediaType","responseContentType","bytes","sha256"]);
    if (r.status !== 200 || !matches(r.privatePath,/^originals\/[a-z][a-z0-9-]{0,63}$/) || r.original.mediaType !== sourceDescriptor(r.descriptor).mediaType || !Number.isSafeInteger(r.original.bytes) || r.original.bytes < 1 || r.original.bytes > LIMITS.original || !matches(r.original.sha256,HASH) || (r.original.responseContentType !== null && (typeof r.original.responseContentType !== "string" || r.original.responseContentType.length > 256 || /[\x00-\x1f\x7f,]/.test(r.original.responseContentType)))) fail("private original metadata is invalid");
  }
  return r;
}
export function validatePreparedCapture(value) {
  const p = snapshotJSON(value,LIMITS.proposal);
  exact(p,["format","schemaVersion","interpretationCommit","method","predecessorRegistryHash","originals","proposedFiles","totals","warnings","proposalHash"]);
  if (p.format !== "charitology-disaster-prepared" || p.schemaVersion !== 1 || !matches(p.proposalHash,HASH) || recordHash("prepared",p) !== p.proposalHash) fail("prepared proposal hash/format is invalid");
  validateCaptureRequest({interpretationCommit:p.interpretationCommit,method:p.method,predecessorRegistryHash:p.predecessorRegistryHash,candidateId:"validation"});
  if (!Array.isArray(p.originals) || p.originals.length > 100 || !Array.isArray(p.proposedFiles) || p.proposedFiles.length > 905 || !Array.isArray(p.warnings) || p.warnings.length > 8 || p.warnings.some(w=>typeof w!=="string" || w.length>1200)) fail("prepared inventories exceed bounds");
  p.originals = p.originals.map(originalEntry);
  const seen=new Set();
  for(const f of p.proposedFiles){exact(f,["path","bytes","sha256"]);if(typeof f.path!=="string"||f.path.length>240||seen.has(f.path)||!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>LIMITS.packet||!matches(f.sha256,HASH))fail("invalid or duplicate proposed file pin");seen.add(f.path);}
  exact(p.totals,["preparedBytes","coreHistoryBytes","generatedArtifactBytes"]);
  for(const [key,max] of [["preparedBytes",LIMITS.prepared],["coreHistoryBytes",LIMITS.core],["generatedArtifactBytes",LIMITS.derived]])if(!Number.isSafeInteger(p.totals[key])||p.totals[key]<0||p.totals[key]>max)fail("prepared byte total is invalid");
  canonicalBytes(p,LIMITS.proposal); return p;
}
export async function verifyNewSourceMaterials({files, previous = new Map(), originals, originalBodies, signal, parserSettings} = {}) {
  if (!Array.isArray(originals) || originals.length > 100 || !(originalBodies instanceof Map)) fail("supply a bounded private original inventory");
  originals=originals.map(originalEntry);
  const entries=new Map(), used=new Set(), paths=new Set();let originalBytes=0;
  for(const o of originals){const key=o.descriptor+"\n"+o.attemptedAt;if(entries.has(key))fail("duplicate descriptor/retrieval observation");entries.set(key,o);if(o.privatePath){if(paths.has(o.privatePath))fail("private paths must not alias another original");paths.add(o.privatePath);const b=originalBodies.get(o.privatePath);if(!(b instanceof Uint8Array)||b.length!==o.original.bytes||sha256(b)!==o.original.sha256)fail("private original bytes differ from sealed metadata");originalBytes+=b.length;}}
  if(originalBytes>LIMITS.originals || paths.size!==originalBodies.size)fail("private originals are oversized or contain unlisted bodies");
  for(const [file,raw]of files){if(!/^records\/source\/[^/]+\/v[1-9]\d*\.json$/.test(file)||previous.has(file))continue;
    if(signal?.aborted)throw signal.reason||new Error("Canceled");
    const source=canonicalFile(raw,LIMITS.record), key=source.descriptor+"\n"+source.retrievedAt, o=entries.get(key);
    if(!o || used.has(key))fail("each new source needs one exact private retrieval observation");used.add(key);
    if(source.requestedUrl!==o.requestedUrl || source.finalUrl!==o.finalUrl || source.access.httpStatus!==o.status || !equal(source.original,o.original))fail("source and original retrieval metadata differ");
    const note=canonicalFile(files.get(source.publicNote.path),LIMITS.note);
    if(o.original===null){if(source.access.outcome!=="unavailable" || note.items.some(i=>i.basis!=="editorial-access-note"||i.roles.some(r=>r!=="access")||i.status!==null))fail("unavailable source must contain access-only notes");continue;}
    if(source.access.outcome!=="retrieved")fail("retrieved original was relabeled unavailable");
    const material=await inspectSourceOriginal({descriptor:o.descriptor,bytes:originalBodies.get(o.privatePath),responseContentType:o.original.responseContentType,requestedUrl:o.requestedUrl,finalUrl:o.finalUrl,signal,parserSettings});
    for(const field of ["descriptor","publisher","title","requestedUrl","finalUrl","original","published","sourceUpdated","documentCreated","documentModified","dateDiscrepancy","literalFields","disposition","rights","evidence"]){if(!equal(source[field],material[field]))fail(`new source ${field} differs from actual fixed-adapter observation`);}
    if(!equal(note.items,material.items) || note.originalSha256!==o.original.sha256)fail("public note or locator differs from actual fixed-adapter observation");
  }
  if(used.size!==entries.size)fail("an original observation is not used by a new source");
  return originals;
}
export async function sealPreparedCapture({request,files,previous=new Map(),originals,originalBodies,signal,parserSettings} = {}) {
  request=validateCaptureRequest(request);const handle=assertCaptureAppend(previous,files,request), inventory=historyInventory(handle);
  proposedMethod(inventory,request);
  originals=await verifyNewSourceMaterials({files:inventory,previous,originals,originalBodies,signal,parserSettings});
  const p={format:"charitology-disaster-prepared",schemaVersion:1,interpretationCommit:request.interpretationCommit,method:request.method,predecessorRegistryHash:request.predecessorRegistryHash,originals,proposedFiles:[...inventory].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([f,b])=>filePin(f,b)),totals:{preparedBytes:0,coreHistoryBytes:0,generatedArtifactBytes:0},warnings:["Publisher statements and maintainer retrieval observations do not establish independent review or current needs.","Original bodies stay private. This proposal creates no gift, payment, reminder or job."],proposalHash:"0".repeat(64)};
  for(const [file,b]of inventory)p.totals[file.startsWith("exports/")?"generatedArtifactBytes":"coreHistoryBytes"]+=b.length;
  const bodies=[...originalBodies.values()].reduce((n,b)=>n+b.length,0), requestBytes=canonicalBytes(request,LIMITS.request).length;
  for(let attempt=0;attempt<8;attempt++){const n=requestBytes+canonicalBytes(p,LIMITS.proposal).length+bodies+p.totals.coreHistoryBytes+p.totals.generatedArtifactBytes;if(n===p.totals.preparedBytes){p.proposalHash=recordHash("prepared",p);return validatePreparedCapture(p);}p.totals.preparedBytes=n;}
  fail("prepared byte accounting did not settle");
}
