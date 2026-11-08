/** Disclosed synthetic immutable first-append fixture. No capture/Git authority.
 * Reuses unchanged education-factory.mjs, derived from the original observation
 * factory by two fictional country-code literals. No duplicated country corpus.
 */
import assert from "node:assert/strict";
import * as m from "../../src/lib/observation-model.mjs";
import {fictionalObservationFiles} from "./education-factory.mjs";
import {preparePlanClusterObservationRecords as prepare} from "../../src/lib/humanitarian-plan-cluster/source.mjs";
import {PLAN_CLUSTER_DEFINITION as D,PLAN_CLUSTER_HEADERS as H} from "../../src/lib/humanitarian-plan-cluster/model.mjs";
const pin=r=>({kind:r.kind,id:r.id,version:r.version,hash:r.hash});
const epin=e=>({id:e.id,hash:e.hash,sequence:e.sequence});
const order=(a,b)=>a.kind<b.kind?-1:a.kind>b.kind?1:a.id<b.id?-1:a.id>b.id?1:a.version-b.version;
export function fictionalPlanClusterAppend({requirements="100",funding="25"}={}) {
 const previousFiles=fictionalObservationFiles({financial:true}),previous=m.validateObservationFiles(previousFiles);
 const previousProjection=m.observationProjection(previous,previous.registry.current.id),entity=previousProjection.entities.find(r=>r.id==="country-afg");
 const row={countryCode:"AFG",id:"1185",name:D.selection.planName,code:"HAFG24",startDate:"2024-01-01",endDate:"2024-12-31",year:"2024",clusterCode:"7415",cluster:"Education",requirements,funding,percentFunded:"25"};
 const csv=Buffer.from(H.join(",")+"\n"+H.map(k=>row[k]).join(",")+"\n");
 const metadata=Buffer.from(JSON.stringify({success:true,result:{id:D.source.datasetId,name:D.source.packageName,license_id:"cc-by-igo",license_title:"Creative Commons Attribution for Intergovernmental Organisations (CC BY-IGO)",license_url:"http://creativecommons.org/licenses/by/3.0/igo/legalcode",metadata_modified:"2026-11-06T11:16:15.543202",resources:[{id:D.source.resourceId,name:D.source.resourceName,url:D.source.resourceUrl,format:"CSV",size:csv.length,last_modified:"2026-11-06T11:16:07.816954",hash:"synthetic-publisher-literal"}]}}));
 const receipt=(bytes,a,b)=>({bytes,startedAt:`2026-11-08T13:00:00.00${a}Z`,completedAt:`2026-11-08T13:00:00.00${b}Z`,httpDate:null});
 const output=prepare({csv:receipt(csv,2,3),metadataBefore:receipt(metadata,0,1),metadataAfter:receipt(metadata,4,5),entity});
 const files={...previousFiles};for(const [path,text]of Object.entries(output.files)){assert(!Object.hasOwn(files,path)||files[path]===text,"immutable prior file collision");files[path]=text;}
 const prior=JSON.parse(previousFiles[`editions/${previous.registry.current.id}.json`]),edition=structuredClone(prior);
 edition.id="synthetic-education-append";edition.sequence=prior.sequence+1;edition.supersedes=epin(prior);edition.method.id="observation-plan-cluster-append-v1";edition.capturedAt="2026-11-08T13:00:00.006Z";
 edition.records=[...prior.records,...output.records.map(pin)].sort(order);edition.coverage=edition.records.filter(p=>p.kind==="coverage");edition.hash=m.observationObjectHash(edition);files[`editions/${edition.id}.json`]=m.observationPrettyJson(edition);
 const registry=structuredClone(previous.registry);registry.current=epin(edition);registry.editions.push(epin(edition));registry.records=[...registry.records,...output.records.map(pin)].sort(order);
 registry.files=Object.keys(files).filter(path=>path!=="registry.json").sort().map(path=>({path,sha256:m.observationRawHash(files[path]),bytes:Buffer.byteLength(files[path])}));registry.hash=m.observationObjectHash(registry);files["registry.json"]=m.observationPrettyJson(registry);
 for(const [path,text]of Object.entries(previousFiles))if(path!=="registry.json")assert.equal(files[path],text,"all prior immutable files retained exact");
 const handle=m.validateObservationFiles(files),projection=m.observationProjection(handle,handle.registry.current.id);
 return {files,handle,projection,output,previousFiles,previousProjection};
}
