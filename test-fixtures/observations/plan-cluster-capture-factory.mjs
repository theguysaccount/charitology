/** Fictional raw/receipt data and real disposable local Git ancestry only.
 * No public capture or complete historical interpretation replay is claimed. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { fictionalObservationFiles } from "./education-factory.mjs";
import { observationPrettyJson as pretty, observationObjectHash as hash, observationRawHash as sha } from "../../src/lib/observation-canonical.mjs";
import { readObservationBaseline } from "../../src/lib/observation-git.mjs";
import { readBoundedObservationFile } from "../../src/lib/observation-capture-io.mjs";
import { OBSERVATION_PLAN_CLUSTER_BASELINE_PATHS } from "../../src/lib/observation-baseline.mjs";
import { verifyPlanClusterAcquisitionSource } from "../../src/lib/humanitarian-plan-cluster/capture-io.mjs";
import { copyPlanClusterAcquisitionReceipt, PLAN_CLUSTER_S3_URL } from "../../src/lib/humanitarian-plan-cluster/capture.mjs";
import { PLAN_CLUSTER_DEFINITION as D, PLAN_CLUSTER_HEADERS as H } from "../../src/lib/humanitarian-plan-cluster/model.mjs";
import { PLAN_CLUSTER_METADATA_URL } from "../../src/lib/humanitarian-plan-cluster/interpretation.mjs";

const candidate=fileURLToPath(new URL("../../",import.meta.url));
const ownedParent=fileURLToPath(new URL("../../../owned-fixtures/",import.meta.url));
const env={PATH:"/usr/bin:/bin",GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:"/dev/null",GIT_NO_REPLACE_OBJECTS:"1",GIT_NO_LAZY_FETCH:"1",GIT_TERMINAL_PROMPT:"0",GIT_OPTIONAL_LOCKS:"0"};
const cleanupReceipts=[];
export const fixtureCleanupCount=()=>cleanupReceipts.length;
export const fixtureCleanupsAfter=count=>cleanupReceipts.slice(count);
const git=(repo,args)=>execFileSync("/usr/bin/git",["-c","core.hooksPath=/dev/null","-c","gc.auto=0","-c","maintenance.auto=false","-c","user.name=Fictional fixture","-c","user.email=fixture@example.invalid",...args],{cwd:repo,env,encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:10000,maxBuffer:1048576}).trim();
function saveFiles(root,files){for(const [p,text]of Object.entries(files)){const dest=path.join(root,p);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text,{flag:"wx"});}}
export async function withPlanClusterCaptureFixture(run) {
  fs.mkdirSync(ownedParent,{recursive:true});const root=fs.mkdtempSync(path.join(ownedParent,"case-")),identity=fs.lstatSync(root),repo=path.join(root,"repo");fs.mkdirSync(repo);
  let result,cleanup=false,primary=null;
  try {
    git(repo,["init","--quiet","--template="]);
    const previousFiles=fictionalObservationFiles({financial:true});saveFiles(path.join(repo,"src/data/observations"),previousFiles);
    fs.writeFileSync(path.join(repo,"README.fixture"),"Synthetic observation history. No real source capture.\n");git(repo,["add","."]);git(repo,["commit","--quiet","-m","Fictional previous data"]);const previousCommit=git(repo,["rev-parse","HEAD"]);
    // Copy the declared code vector only. Never copy a real checkout's .git,
    // node_modules, build output, private captures or unrelated user files.
    let sourceBytes=0;
    for(const relative of OBSERVATION_PLAN_CLUSTER_BASELINE_PATHS){const raw=readBoundedObservationFile(path.join(candidate,relative),5242880);sourceBytes+=raw.length;if(sourceBytes>5242880)throw Error("FIXTURE_SOURCE_VECTOR_LIMIT");const dest=path.join(repo,relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,raw,{flag:"wx"});}
    git(repo,["add","."]);git(repo,["commit","--quiet","-m","Disposable code baseline, no new observation data"]);const sourceCommit=git(repo,["rev-parse","HEAD"]);
    const context=await verifyPlanClusterAcquisitionSource({repo,sourceCommit}),baseline=await readObservationBaseline(repo,sourceCommit,"observation-plan-cluster-append-v1");
    const row={countryCode:"AFG",id:"1185",name:D.selection.planName,code:"HAFG24",startDate:"2024-01-01",endDate:"2024-12-31",year:"2024",clusterCode:"7415",cluster:"Education",requirements:"100",funding:"25",percentFunded:"25"};
    const csv=Buffer.from(H.join(",")+"\n"+H.map(k=>row[k]).join(",")+"\n");
    const metadata=Buffer.from(JSON.stringify({success:true,result:{id:D.source.datasetId,name:D.source.packageName,license_id:"cc-by-igo",license_title:"Creative Commons Attribution for Intergovernmental Organisations (CC BY-IGO)",license_url:"http://creativecommons.org/licenses/by/3.0/igo/legalcode",metadata_modified:"2026-11-06T11:16:15.543202",resources:[{id:D.source.resourceId,name:D.source.resourceName,url:D.source.resourceUrl,format:"CSV",size:csv.length,last_modified:"2026-11-06T11:16:07.816954",hash:"fictional-publisher-literal"}]}}));
    const bodies=[metadata,Buffer.from("Fictional redirect body"),csv,metadata],phases=["metadata-before","hdx-resource-redirect","csv","metadata-after"],urls=[PLAN_CLUSTER_METADATA_URL,D.source.resourceUrl,PLAN_CLUSTER_S3_URL,PLAN_CLUSTER_METADATA_URL],start=Date.now()-60000;
    const operations=bodies.map((bytes,i)=>({phase:phases[i],url:urls[i],status:i===1?302:200,mediaType:i===1?"text/html":i===2?"text/csv":"application/json",declaredLength:bytes.length,bytes:bytes.length,sha256:sha(bytes),startedAt:new Date(start+i*3).toISOString(),completedAt:new Date(start+i*3+1).toISOString(),elapsedNanoseconds:1000000,httpDate:null,etag:null,lastModified:null,settled:true}));
    const body={format:"charitology-plan-cluster-acquisition",version:1,...context,operations,inputs:[0,2,3].map((n,i)=>{const o=operations[n];return{name:["metadata-before","cluster-csv","metadata-after"][i],sha256:o.sha256,bytes:o.bytes,startedAt:o.startedAt,completedAt:o.completedAt,httpDate:o.httpDate};}),complete:true};
    const receipt=copyPlanClusterAcquisitionReceipt({...body,hash:hash(body)}),retainedRoot=path.join(root,"retained");fs.mkdirSync(retainedRoot,{mode:0o700});
    for(const [name,bytes]of [["metadata-before.json",metadata],["cluster.csv",csv],["metadata-after.json",metadata],["receipt.json",Buffer.from(pretty(receipt))]])fs.writeFileSync(path.join(retainedRoot,name),bytes,{flag:"wx",mode:0o600});
    result=await run({root,repo,sourceCommit,previousCommit,previousFiles,context,baseline,metadata,csv,receipt,retainedRoot,git:args=>git(repo,args)});
  } catch(error){primary=error;
  } finally {
    try{const current=fs.lstatSync(root);if(current.dev!==identity.dev||current.ino!==identity.ino)throw Error("OWNED_FIXTURE_IDENTITY_CHANGED");fs.rmSync(root,{recursive:true,force:false});cleanup=!fs.existsSync(root);if(!cleanup)throw Error("OWNED_FIXTURE_CLEANUP_FAILED");}catch(error){primary??=error;}
    cleanupReceipts.push(Object.freeze({kind:"owned-local-git-fixture-cleanup",complete:cleanup,actualPublicHTTPS:false,fullHistoryReplay:false}));
  }
  if(primary)throw primary;
  return {result,cleanup,scope:"fictional inputs plus real disposable Git ancestry; no actual HTTP/full-history proof"};
}
