/** Pure first append. Receipts/clocks are declarations, never transport authority. */
import { isProxy } from "node:util/types";
import { observationClone as clone, observationFreeze as freeze, observationFail,
  observationRawHash as sha, observationObjectHash as hash, canonicalObservationJson as canonical,
  observationPrettyJson as pretty, strictObservationJson as json } from "../observation-canonical.mjs";
import { validateObservationFiles, observationFileTexts, observationProjection,
  observationFactualClosure, observationExport, observationHistoryExport } from "../observation-model.mjs";
import { OBSERVATION_PLAN_CLUSTER_BASELINE_PATHS as paths, OBSERVATION_PLAN_CLUSTER_METHOD as METHOD,
  observationMethodPinsFor } from "../observation-baseline.mjs";
import { copyObservationBytes, observationRecordPath, observationPin } from "../observation-sources.mjs";
import { preparePlanClusterObservationRecords } from "./source.mjs";
import { planClusterObservationProjection, planClusterObservationExport } from "./public.mjs";
import { PLAN_CLUSTER_METADATA_URL } from "./interpretation.mjs";
import { PLAN_CLUSTER_DEFINITION as D } from "./model.mjs";

const candidates = new WeakMap(), SHA = /^[a-f0-9]{64}$/, COMMIT = /^(?!0{40}$)[a-f0-9]{40}$/;
const fail = message => observationFail("plan_cluster_capture", message);
const need = (ok, message) => { if (!ok) fail(message); };
const same = (a,b) => canonical(a) === canonical(b);
const exact = (v, keys) => need(v && !isProxy(v) && Object.getPrototypeOf(v) === Object.prototype &&
  Reflect.ownKeys(v).length === keys.length && keys.every(k => {
    const d=Object.getOwnPropertyDescriptor(v,k); return d?.enumerable && Object.hasOwn(d,"value");
  }), "Closed owned capture fields required");
const id = value => need(typeof value === "string" && /^[a-z][a-z0-9-]{0,99}$/.test(value), "Invalid capture identity");
const hex = value => need(typeof value === "string" && SHA.test(value), "Invalid capture digest");
const commit = value => need(typeof value === "string" && COMMIT.test(value), "Exact committed source required");
const at = value => {
  need(typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value), "Explicit UTC millisecond clock required");
  const n=Date.parse(value); need(Number.isFinite(n) && new Date(n).toISOString()===value,"Invalid client clock"); return n;
};
const literal = value => need(value === null || typeof value === "string" && value.length <= 240 && !/[\u0000-\u001f\u007f]/.test(value), "Invalid bounded HTTP literal");
const epin = value => { exact(value,["id","hash","sequence"]); id(value.id); hex(value.hash); need(Number.isSafeInteger(value.sequence)&&value.sequence>0,"Invalid edition sequence"); };
const order = (a,b) => a.kind<b.kind?-1:a.kind>b.kind?1:a.id<b.id?-1:a.id>b.id?1:a.version-b.version;
const sourcePins = baseline => baseline.files.map(f=>({path:f.path,sha256:f.sha256,bytes:f.bytes.byteLength}));
export const PLAN_CLUSTER_S3_URL = "https://s3.us-east-1.amazonaws.com/hdx-production-filestore/resources/80975d5b-508b-47b2-a10c-b967104d3179/fts_requirements_funding_cluster_global.csv";
export const PLAN_CLUSTER_INPUT_NAMES = Object.freeze(["metadata-before","cluster-csv","metadata-after"]);
export const PLAN_CLUSTER_INPUT_FILES = Object.freeze(["metadata-before.json","cluster.csv","metadata-after.json"]);

export function copyPlanClusterBaseline(input) {
  exact(input,["commit","files"]); commit(input.commit);
  const array=input.files;
  need(Array.isArray(array)&&!isProxy(array)&&Object.getPrototypeOf(array)===Array.prototype,"Owned baseline vector required");
  const ds=Object.getOwnPropertyDescriptors(array),n=ds.length?.value;
  need(n===paths.length&&Reflect.ownKeys(ds).length===n+1,"Exact new-method source vector required");
  const files=[];
  for(let i=0;i<n;i++) {
    need(ds[i]?.enumerable&&Object.hasOwn(ds[i],"value"),"Dense baseline vector required");
    const f=ds[i].value; exact(f,["path","sha256","bytes"]);
    files.push({path:f.path,sha256:f.sha256,bytes:copyObservationBytes(f.bytes,5242880)});
  }
  const result={commit:input.commit,files}; observationMethodPinsFor(METHOD,result); return result;
}
export function copyPlanClusterAcquisitionReceipt(input) {
  const r=clone(input);
  exact(r,["format","version","sourceCommit","method","sourceFiles","previousRegistryHash","expectedPrevious","operations","inputs","complete","hash"]);
  need(r.format==="charitology-plan-cluster-acquisition"&&r.version===1&&r.complete===true,"Complete acquisition receipt required");
  commit(r.sourceCommit); exact(r.method,["id","definitionSha256","adapterSha256"]); need(r.method.id===METHOD,"Wrong acquisition method");
  hex(r.method.definitionSha256); hex(r.method.adapterSha256); hex(r.previousRegistryHash); epin(r.expectedPrevious);
  need(Array.isArray(r.sourceFiles)&&r.sourceFiles.length===paths.length,"Complete receipt source vector required");
  let total=0;
  for(let i=0;i<paths.length;i++) { const p=r.sourceFiles[i]; exact(p,["path","sha256","bytes"]); hex(p.sha256); need(p.path===paths[i]&&Number.isSafeInteger(p.bytes)&&p.bytes>0,"Exact receipt source pin required"); total+=p.bytes; }
  need(total<=5242880,"Source vector exceeds limit");
  const phases=["metadata-before","hdx-resource-redirect","csv","metadata-after"],urls=[PLAN_CLUSTER_METADATA_URL,D.source.resourceUrl,PLAN_CLUSTER_S3_URL,PLAN_CLUSTER_METADATA_URL],caps=[524288,16384,1048576,524288];
  need(Array.isArray(r.operations)&&r.operations.length===4,"Exactly four settled operation facts required");
  for(let i=0;i<4;i++) {
    const o=r.operations[i]; exact(o,["phase","url","status","mediaType","declaredLength","bytes","sha256","startedAt","completedAt","elapsedNanoseconds","httpDate","etag","lastModified","settled"]);
    need(o.phase===phases[i]&&o.url===urls[i]&&o.status===(i===1?302:200)&&o.settled===true,"Operation status/origin mismatch");
    need(typeof o.mediaType==="string"&&o.mediaType.length<=100&&(i===1||o.mediaType===(i===2?"text/csv":"application/json")),"Operation media type mismatch");
    need(Number.isSafeInteger(o.bytes)&&o.bytes>=0&&o.bytes<=caps[i]&&(i===1||o.bytes>0),"Operation bytes exceed limit");
    need(o.declaredLength===null||Number.isSafeInteger(o.declaredLength)&&o.declaredLength===o.bytes,"Complete HTTP length mismatch");
    hex(o.sha256); const start=at(o.startedAt),end=at(o.completedAt);
    need(end>=start&&end-start<=45000&&Number.isSafeInteger(o.elapsedNanoseconds)&&o.elapsedNanoseconds>=0&&o.elapsedNanoseconds<=45000000000,"Operation clock order/deadline refused");
    if(i)need(at(r.operations[i-1].completedAt)<=start,"Acquisition operations out of order");
    literal(o.httpDate); literal(o.etag); literal(o.lastModified);
  }
  need(Array.isArray(r.inputs)&&r.inputs.length===3,"Three complete input facts required");
  for(let i=0;i<3;i++) {
    const p=r.inputs[i],o=r.operations[[0,2,3][i]]; exact(p,["name","sha256","bytes","startedAt","completedAt","httpDate"]);
    need(same(p,{name:PLAN_CLUSTER_INPUT_NAMES[i],sha256:o.sha256,bytes:o.bytes,startedAt:o.startedAt,completedAt:o.completedAt,httpDate:o.httpDate}),"Input facts do not match operations");
  }
  hex(r.hash); need(hash(r)===r.hash&&Buffer.byteLength(pretty(r))<=16384,"Acquisition receipt hash/size refused");
  return freeze(r);
}
export function copyPlanClusterPreparedInput(input) {
  exact(input,["receipt","metadataBefore","csv","metadataAfter"]);
  const receipt=copyPlanClusterAcquisitionReceipt(input.receipt),raw=[input.metadataBefore,input.csv,input.metadataAfter],owned=[];
  for(let i=0;i<3;i++) { const bytes=copyObservationBytes(raw[i],i===1?1048576:524288),p=receipt.inputs[i]; need(bytes.byteLength===p.bytes&&sha(bytes)===p.sha256,"Retained input byte pin mismatch"); owned.push(bytes); }
  return {receipt,metadataBefore:owned[0],csv:owned[1],metadataAfter:owned[2]};
}
export function planClusterAppendRequestHash(input) { const r=clone(input); delete r.requestHash; return sha(canonical(r)); }
export function makePlanClusterAppendRequest(input) { const r=clone(input); delete r.requestHash; return freeze({...r,requestHash:planClusterAppendRequestHash(r)}); }
function requestCopy(input,baseline,prepared) {
  const r=clone(input); exact(r,["format","version","sourceCommit","previousCommit","editionId","capturedAt","assemblyElapsedNanoseconds","expectedPrevious","previousRegistryHash","preparedInputManifestHash","requestHash"]);
  need(r.format==="charitology-plan-cluster-append-request"&&r.version===1,"Wrong append request format");
  commit(r.sourceCommit); commit(r.previousCommit); id(r.editionId); epin(r.expectedPrevious); at(r.capturedAt);
  for(const k of ["previousRegistryHash","preparedInputManifestHash","requestHash"])hex(r[k]);
  need(Number.isSafeInteger(r.assemblyElapsedNanoseconds)&&r.assemblyElapsedNanoseconds>=0,"Actual local assembly duration required");
  need(r.sourceCommit===baseline.commit&&r.sourceCommit===prepared.receipt.sourceCommit&&r.preparedInputManifestHash===prepared.receipt.hash&&r.requestHash===planClusterAppendRequestHash(r),"Append request source/input/hash mismatch");
  need(prepared.receipt.operations.every(o=>o.completedAt<=r.capturedAt),"Assembly predates input completion"); return r;
}
export function buildPlanClusterAppendCandidate(previousFiles,preparedInput,baselineInput,requestInput) {
  const prepared=copyPlanClusterPreparedInput(preparedInput),baseline=copyPlanClusterBaseline(baselineInput),request=requestCopy(requestInput,baseline,prepared);
  need(same(prepared.receipt.method,observationMethodPinsFor(METHOD,baseline))&&same(prepared.receipt.sourceFiles,sourcePins(baseline)),"Acquisition baseline pins mismatch");
  const previous=validateObservationFiles(previousFiles),oldFiles=observationFileTexts(previous),prior=json(oldFiles[`editions/${previous.registry.current.id}.json`]);
  need(!previous.registry.editions.some(p=>json(oldFiles[`editions/${p.id}.json`]).method.id===METHOD),"First append already exists in retained history");
  need(same(request.expectedPrevious,previous.registry.current)&&request.previousRegistryHash===previous.registry.hash&&same(prepared.receipt.expectedPrevious,previous.registry.current)&&prepared.receipt.previousRegistryHash===previous.registry.hash,"Previous registry/edition is stale");
  need(!previous.registry.editions.some(e=>e.id===request.editionId),"Edition identity is occupied");
  const projection=observationProjection(previous,prior.id);
  need(!projection.coverage.some(c=>c.selection.kind==="explicit-plan-cluster"),"First append only; recapture requires separate method");
  const entity=projection.entities.find(e=>e.id==="country-afg"); need(entity,"Exact selected Afghanistan entity required");
  const receipt=(bytes,i)=>({bytes,startedAt:prepared.receipt.inputs[i].startedAt,completedAt:prepared.receipt.inputs[i].completedAt,httpDate:prepared.receipt.inputs[i].httpDate});
  const previousRecords=previous.registry.records.map(p=>json(oldFiles[observationRecordPath(p)]));
  const output=preparePlanClusterObservationRecords({metadataBefore:receipt(prepared.metadataBefore,0),csv:receipt(prepared.csv,1),metadataAfter:receipt(prepared.metadataAfter,2),entity},previousRecords);
  const files={...oldFiles};
  for(const [p,text]of Object.entries(output.files)) { need(!Object.hasOwn(files,p)||files[p]===text,"Adapter attempted immutable file overwrite"); files[p]=text; }
  const edition={format:"charitology-observation-edition",version:1,id:request.editionId,sequence:prior.sequence+1,capturedAt:request.capturedAt,sourceCommit:baseline.commit,method:observationMethodPinsFor(METHOD,baseline),supersedes:previous.registry.current,
    records:[...prior.records,...output.records.map(observationPin)].sort(order),coverage:[...prior.coverage,...output.records.filter(r=>r.kind==="coverage").map(observationPin)].sort(order),legacyComparison:prior.legacyComparison,countryProjection:prior.countryProjection,limitations:prior.limitations,review:"draft"};
  edition.hash=hash(edition); const ep={id:edition.id,hash:edition.hash,sequence:edition.sequence}; files[`editions/${edition.id}.json`]=pretty(edition);
  const allRecords=new Map(previous.registry.records.map(p=>[`${p.kind}/${p.id}/${p.version}`,p]));
  for(const r of output.records)allRecords.set(`${r.kind}/${r.id}/${r.version}`,observationPin(r));
  const registry={format:previous.registry.format,version:1,current:ep,editions:[...previous.registry.editions,ep],records:[...allRecords.values()].sort(order),files:Object.keys(files).filter(p=>p!=="registry.json").sort().map(p=>({path:p,sha256:sha(files[p]),bytes:Buffer.byteLength(files[p])}))};
  registry.hash=hash(registry); files["registry.json"]=pretty(registry);
  const handle=validateObservationFiles(files),owned=observationFileTexts(handle),filter={entityIds:[],measureIds:[],state:"all"};
  const exports=[observationExport(handle,{editionId:edition.id,filter,format:"json"}),observationExport(handle,{editionId:edition.id,filter,format:"csv"}),observationHistoryExport(handle)];
  const selected=planClusterObservationProjection(handle,edition.id); need(selected,"Selected public projection required");
  planClusterObservationExport(handle,edition.id,"json"); planClusterObservationExport(handle,edition.id,"csv");
  const core={format:"charitology-plan-cluster-append-preview",version:1,request,candidateRegistryHash:handle.registry.hash,sourceFiles:sourcePins(baseline),files:Object.keys(owned).sort().map(p=>({path:p,sha256:sha(owned[p]),bytes:Buffer.byteLength(owned[p])})),added:output.records.map(observationPin),retainedSelected:prior.records,priorCountryProjection:prior.countryProjection,priorLegacyComparison:prior.legacyComparison,editionBytes:observationFactualClosure(handle,edition.id).reduce((n,p)=>n+p.bytes,0),historyBytes:handle.historyBytes,exportBytes:exports.map(e=>e.bytes),selectedProjectionSha256:selected.sha256,acquisitionReceiptHash:prepared.receipt.hash};
  const preview=freeze({...core,proposalHash:sha(canonical(core))}); candidates.set(preview,{files:owned,handle,prepared,baseline,report:output.report}); return preview;
}
export function planClusterAppendCandidateFiles(preview) { const c=candidates.get(preview); need(c,"Actual owned append candidate required"); return c.files; }
export function planClusterAppendCandidateReport(preview) { const c=candidates.get(preview); need(c,"Actual owned append candidate required"); return c.report; }
