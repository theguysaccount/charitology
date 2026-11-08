/** Real isolated local Git/filesystem tests; HTTPS is explicitly mocked only. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { withPlanClusterCaptureFixture, fixtureCleanupCount, fixtureCleanupsAfter } from "../test-fixtures/observations/plan-cluster-capture-factory.mjs";
import { preparePlanClusterAppendRequest, previewPlanClusterAppend, writeReviewedPlanClusterAppend, readPlanClusterRetainedRoot } from "../src/lib/humanitarian-plan-cluster/capture-io.mjs";
import { acquirePlanClusterInputs } from "../src/lib/humanitarian-plan-cluster/acquire.mjs";
import { observationRawHash as sha, observationObjectHash as hash, observationPrettyJson as pretty, strictObservationJson as json } from "../src/lib/observation-canonical.mjs";
import { validateObservationFiles, observationProjection } from "../src/lib/observation-model.mjs";
import { readObservationWorkingFiles } from "../src/lib/observation-capture-io.mjs";
import { PLAN_CLUSTER_S3_URL, makePlanClusterAppendRequest, buildPlanClusterAppendCandidate } from "../src/lib/humanitarian-plan-cluster/capture.mjs";
import { readObservationBaseline } from "../src/lib/observation-git.mjs";
const sameFiles=(a,b)=>{assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());for(const p of Object.keys(a))assert.equal(sha(a[p]),sha(b[p]));};
const cases=[];
function scenario(name,run){test(name,{concurrency:false,timeout:30000},async t=>{const before=fixtureCleanupCount();try{const receipt=await withPlanClusterCaptureFixture(async f=>{cases.push(name);return run(f);});assert.equal(receipt.cleanup,true);}finally{for(const r of fixtureCleanupsAfter(before))t.diagnostic(JSON.stringify(r));}});}
async function request(f){const outputFile=path.join(f.root,"request.json");const result=await preparePlanClusterAppendRequest({repo:f.repo,retainedRoot:f.retainedRoot,sourceCommit:f.sourceCommit,previousCommit:f.previousCommit,editionId:"fictional-reviewed-append",outputFile});return{outputFile,result,body:json(fs.readFileSync(outputFile))};}
const output=f=>path.join(f.root,"mock-acquired");

// No server, socket or public request exists. These emitters model native
// request/response/socket close ordering while actual local clocks stay real.
async function withMockHttps(plans,run){
 const original=https.request,originalGet=https.get,originalFetch=globalThis.fetch,calls=[],closed=[];
 const denied=()=>{throw Error("MOCK_UNEXPECTED_NETWORK_REFUSED");};https.get=denied;globalThis.fetch=denied;
 https.request=(url,options,callback)=>{
  const index=calls.length,plan=plans[index];calls.push({url,options});assert(plan,"No hidden retry/extra request allowed");
  assert.equal(options.method,"GET");assert.equal(options.agent,false);assert.equal(options.headers["Accept-Encoding"],"identity");
  const req=new EventEmitter(),socket=new EventEmitter();let res,closing=false;
  req.destroyed=false;socket.destroyed=false;
  const close=()=>{if(closing)return;closing=true;setImmediate(()=>{if(res){res.emit("close");closed.push("response:"+index);}req.emit("close");closed.push("request:"+index);socket.emit("close");closed.push("socket:"+index);});};
  req.destroy=()=>{req.destroyed=true;if(res)res.destroyed=true;socket.destroyed=true;close();};socket.destroy=req.destroy;
  req.end=()=>{setImmediate(()=>{
   req.emit("socket",socket);if(plan.hold)return;
   if(plan.error){req.emit("error",Error("FICTIONAL_RAW_TRANSPORT_ERROR"));return;}
   res=new EventEmitter();res.statusCode=plan.status;res.destroyed=false;res.headers={"content-type":plan.type??"application/json",date:"Mon, 01 Jan 1900 00:00:00 GMT",...(plan.length===false?{}:{"content-length":String(plan.body.length)}),...(plan.location?{location:plan.location}:{})};res.destroy=()=>{res.destroyed=true;req.destroy();};
   callback(res);if(res.destroyed)return;
   setImmediate(()=>{if(res.destroyed)return;res.emit("data",plan.body);if(res.destroyed)return;res.emit("end");close();});
  });return req;};return req;
 };
 try{return await run({calls,closed});}finally{https.request=original;https.get=originalGet;globalThis.fetch=originalFetch;}
}
function goodPlans(f){return[
 {status:200,body:f.metadata},{status:302,type:"text/html",body:Buffer.from("Fictional redirect body"),location:PLAN_CLUSTER_S3_URL+"?Signature=FICTIONAL_QUERY_MUST_NOT_PERSIST"},
 {status:200,type:"text/csv",body:f.csv},{status:200,body:f.metadata},
];}

scenario("local Git M→A and offline request/preview/atomic append preserve immutable old closure",async f=>{
 const r=await request(f),before=fs.readFileSync(r.outputFile),preview=await previewPlanClusterAppend({repo:f.repo,retainedRoot:f.retainedRoot,request:r.body});
 await assert.rejects(writeReviewedPlanClusterAppend(JSON.parse(JSON.stringify(preview)),preview.proposalHash));sameFiles(readObservationWorkingFiles(f.repo),f.previousFiles);
 const result=await writeReviewedPlanClusterAppend(preview,preview.proposalHash);assert.equal(result.committed,true);assert.equal(result.cleanup.complete,true);assert.equal(fs.readFileSync(r.outputFile).equals(before),true);
 const files=readObservationWorkingFiles(f.repo);for(const [p,bytes]of Object.entries(f.previousFiles))if(p!=="registry.json")assert.equal(sha(files[p]),sha(bytes));
 const h=validateObservationFiles(files),p=observationProjection(h,h.registry.current.id);assert.equal(h.registry.editions.length,2);assert.equal(p.coverage.filter(c=>c.selection.kind==="explicit-financial-panel").length,1);assert.equal(p.coverage.filter(c=>c.selection.kind==="explicit-plan-cluster").length,1);
 assert.equal(f.git(["rev-parse","HEAD"]),f.sourceCommit);assert.equal(fs.existsSync(path.join(f.repo,"src/data/.observations-write.lock")),false);
});
scenario("stale raw and occupied request files refuse before any observation write",async f=>{
 const r=await request(f);await assert.rejects(preparePlanClusterAppendRequest({repo:f.repo,retainedRoot:f.retainedRoot,sourceCommit:f.sourceCommit,previousCommit:f.previousCommit,editionId:"different",outputFile:r.outputFile}));
 fs.appendFileSync(path.join(f.retainedRoot,"cluster.csv"),"\n");await assert.rejects(previewPlanClusterAppend({repo:f.repo,retainedRoot:f.retainedRoot,request:r.body}));sameFiles(readObservationWorkingFiles(f.repo),f.previousFiles);
});
scenario("partial exclusive lock write preserves primary refusal and removes its verified own prefix",async f=>{
 const r=await request(f),preview=await previewPlanClusterAppend({repo:f.repo,retainedRoot:f.retainedRoot,request:r.body}),open=fs.openSync,write=fs.writeFileSync;let fd;
 fs.openSync=(p,...args)=>{const result=open(p,...args);if(String(p).endsWith(".observations-write.lock"))fd=result;return result;};
 fs.writeFileSync=(p,data,...args)=>{if(p===fd){write(p,Buffer.from(data).subarray(0,7));throw Error("FICTIONAL_PARTIAL_LOCK_WRITE");}return write(p,data,...args);};
 try{await assert.rejects(writeReviewedPlanClusterAppend(preview,preview.proposalHash),e=>e.code==="PLAN_CLUSTER_APPEND_WRITE_REFUSED"&&e.committed===false&&e.cleanupErrors.length===0);}finally{fs.openSync=open;fs.writeFileSync=write;}
 assert.equal(fs.existsSync(path.join(f.repo,"src/data/.observations-write.lock")),false);sameFiles(readObservationWorkingFiles(f.repo),f.previousFiles);
});
scenario("post-link inspection fault rolls back tracked new links and leaves old registry/inventory exact",async f=>{
 const r=await request(f),preview=await previewPlanClusterAppend({repo:f.repo,retainedRoot:f.retainedRoot,request:r.body}),link=fs.linkSync,stat=fs.lstatSync;let target,raised=false;
 fs.linkSync=(from,to)=>{const result=link(from,to);target??=to;return result;};
 fs.lstatSync=(p,...args)=>{if(String(p)===target&&!raised){raised=true;throw Error("FICTIONAL_POST_LINK_STAT");}return stat(p,...args);};
 try{await assert.rejects(writeReviewedPlanClusterAppend(preview,preview.proposalHash),e=>e.committed===false);}finally{fs.linkSync=link;fs.lstatSync=stat;}
 assert.equal(raised,true);sameFiles(readObservationWorkingFiles(f.repo),f.previousFiles);assert.equal(fs.existsSync(target),false);
});
scenario("failed registry activation removes only owned additions and retains all old bytes",async f=>{
 const r=await request(f),preview=await previewPlanClusterAppend({repo:f.repo,retainedRoot:f.retainedRoot,request:r.body}),rename=fs.renameSync;let raised=false;
 fs.renameSync=(from,to)=>{if(String(to)===path.join(f.repo,"src/data/observations/registry.json")){raised=true;throw Error("FICTIONAL_REGISTRY_ACTIVATION");}return rename(from,to);};
 try{await assert.rejects(writeReviewedPlanClusterAppend(preview,preview.proposalHash),e=>e.committed===false&&e.cleanupErrors.length===0);}finally{fs.renameSync=rename;}
 assert.equal(raised,true);sameFiles(readObservationWorkingFiles(f.repo),f.previousFiles);
});
scenario("changed/replaced stage directory and its unknown contents are preserved with cleanup residue",async f=>{
 const r=await request(f),preview=await previewPlanClusterAppend({repo:f.repo,retainedRoot:f.retainedRoot,request:r.body}),link=fs.linkSync;let count=0,stage,saved;
 fs.linkSync=(from,to)=>{if(++count===2){const part=String(from).split(path.sep).find(p=>p.startsWith(".observations-stage-"));stage=path.join(f.repo,"src/data",part);saved=stage+".user-moved";fs.renameSync(stage,saved);fs.mkdirSync(stage);fs.writeFileSync(path.join(stage,"unknown-user-work"),"preserve this");throw Error("FICTIONAL_STAGE_REPLACEMENT");}return link(from,to);};
 try{await assert.rejects(writeReviewedPlanClusterAppend(preview,preview.proposalHash),e=>e.committed===false&&e.cleanupErrors.includes("stage-directory-preserved"));}finally{fs.linkSync=link;}
 assert.equal(fs.readFileSync(path.join(stage,"unknown-user-work"),"utf8"),"preserve this");assert(fs.existsSync(saved));sameFiles(readObservationWorkingFiles(f.repo),f.previousFiles);
});
scenario("MOCK HTTPS complete four-phase acquisition awaits every terminal close and omits query values",async f=>{
 await withMockHttps(goodPlans(f),async({calls,closed})=>{
  const r=await acquirePlanClusterInputs({repo:f.repo,sourceCommit:f.sourceCommit,outputRoot:output(f)});assert.equal(calls.length,4);assert.equal(closed.length,12);assert.equal(r.complete,true);assert.equal(r.cleanup.complete,true);
  const prepared=readPlanClusterRetainedRoot(output(f)),text=fs.readFileSync(path.join(output(f),"receipt.json"),"utf8");assert(!text.includes("FICTIONAL_QUERY_MUST_NOT_PERSIST"));assert.equal(prepared.receipt.operations[0].httpDate,"Mon, 01 Jan 1900 00:00:00 GMT");assert(prepared.receipt.operations[0].startedAt.startsWith("20"));
 });
});
scenario("MOCK HTTPS direct200 refusal retains incomplete terminal fact and performs no fallback/retry",async f=>{
 const plans=goodPlans(f);plans[1]={status:200,type:"text/csv",body:f.csv};await withMockHttps(plans,async({calls,closed})=>{
  let error;try{await acquirePlanClusterInputs({repo:f.repo,sourceCommit:f.sourceCommit,outputRoot:output(f)});}catch(e){error=e;}
  assert(error);assert.equal(error.phase,"hdx-resource-redirect");assert.equal(error.reason,"STATUS");assert.equal(calls.length,2);assert.equal(closed.length,6);assert.equal(error.failedOperation.status,200);assert.equal(error.failedOperation.complete,false);assert.equal(error.failedOperation.sha256,null);assert.equal(error.failedOperation.completedAt,null);assert.equal(error.failedOperation.closedVerified,true);assert.equal(error.artifactPersistence.complete,true);assert.equal(fs.existsSync(output(f)),false);
  const saved=json(fs.readFileSync(path.join(error.failureArtifact,"failure.json")));assert.equal(saved.failedOperation.status,200);assert.equal(saved.completedOperations.length,1);
 });
});
scenario("MOCK HTTPS stream cap retains truncated status without a partial body hash",async f=>{
 await withMockHttps([{status:200,body:Buffer.alloc(524289,120),length:false}],async({calls})=>{
  let error;try{await acquirePlanClusterInputs({repo:f.repo,sourceCommit:f.sourceCommit,outputRoot:output(f)});}catch(e){error=e;}
  assert.equal(calls.length,1);assert.equal(error.reason,"BODY_CAP");assert.equal(error.failedOperation.receivedBytes,524289);assert.equal(error.failedOperation.truncated,true);assert.equal(error.failedOperation.bodyComplete,false);assert.equal(error.failedOperation.sha256,null);assert.equal(error.failedOperation.closedVerified,true);
 });
});
scenario("MOCK HTTPS artifact-write failure preserves primary refusal and bounded terminal facts",async f=>{
 const plans=goodPlans(f);plans[1]={status:200,type:"text/csv",body:f.csv};const write=fs.writeFileSync;
 fs.writeFileSync=(p,data,...args)=>{if(String(data).includes('"format": "charitology-plan-cluster-acquisition-failure"'))throw Error("FICTIONAL_RAW_EVIDENCE_DISK_FAILURE");return write(p,data,...args);};
 try{await withMockHttps(plans,async({calls})=>{
  let error;try{await acquirePlanClusterInputs({repo:f.repo,sourceCommit:f.sourceCommit,outputRoot:output(f)});}catch(e){error=e;}
  assert.equal(calls.length,2);assert.equal(error.reason,"STATUS");assert.equal(error.phase,"hdx-resource-redirect");assert.equal(error.failedOperation.status,200);assert.equal(error.completedOperations.length,1);assert.deepEqual(error.artifactPersistence,{attempted:true,complete:false});assert.equal(error.artifactDirectory.present,true);assert.equal(error.artifactDirectory.ownershipVerified,true);assert(!JSON.stringify(error).includes("FICTIONAL_RAW_EVIDENCE_DISK_FAILURE"));
 });}finally{fs.writeFileSync=write;}
});
scenario("MOCK HTTPS complete output remains structured when stage cleanup fails",async f=>{
 const unlink=fs.unlinkSync;let fault=false;fs.unlinkSync=(p,...args)=>{if(String(p).includes(".plan-cluster-acquisition-")&&!fault){fault=true;throw Error("FICTIONAL_RAW_CLEANUP_FAILURE");}return unlink(p,...args);};
 try{await withMockHttps(goodPlans(f),async()=>{const result=await acquirePlanClusterInputs({repo:f.repo,sourceCommit:f.sourceCommit,outputRoot:output(f)});assert.equal(fault,true);assert.equal(result.complete,true);assert.equal(result.cleanup.complete,false);assert.equal(result.cleanup.artifact.present,true);assert.equal(readPlanClusterRetainedRoot(output(f)).receipt.hash,result.receiptHash);assert(!JSON.stringify(result).includes("FICTIONAL_RAW_CLEANUP_FAILURE"));});}finally{fs.unlinkSync=unlink;}
});
scenario("MOCK HTTPS failed-operation MIME is retained safely without promoting the response",async f=>{
 await withMockHttps([{status:200,type:"text/html",body:Buffer.from("Fictional unexpected page")}],async({calls})=>{
  let error;try{await acquirePlanClusterInputs({repo:f.repo,sourceCommit:f.sourceCommit,outputRoot:output(f)});}catch(e){error=e;}
  assert.equal(calls.length,1);assert.equal(error.reason,"MEDIA");assert.equal(error.failedOperation.status,200);assert.equal(error.failedOperation.mediaType,"text/html");assert.equal(error.failedOperation.sha256,null);assert.equal(error.failedOperation.closedVerified,true);
 });
});
scenario("MOCK HTTPS metadata-before license refusal happens before any CSV/redirect request",async f=>{
 const wrong=JSON.parse(f.metadata);wrong.result.license_id="fictional-not-approved";await withMockHttps([{status:200,body:Buffer.from(JSON.stringify(wrong))}],async({calls})=>{
  let error;try{await acquirePlanClusterInputs({repo:f.repo,sourceCommit:f.sourceCommit,outputRoot:output(f)});}catch(e){error=e;}
  assert.equal(calls.length,1);assert.equal(error.reason,"LICENSE_OR_DESCRIPTOR");assert.equal(error.failedOperation,null);assert.equal(error.completedOperations.length,1);assert.equal(error.completedOperations[0].status,200);assert.equal(fs.existsSync(output(f)),false);
 });
});
scenario("installed-layout offline CLI uses ordinary Node and retains one request clock",async f=>{
 // Main test dependencies may be resolved by a private harness, but the child
 // CLI must use an ordinary installed layout with no external --import hook.
 const noble=fileURLToPath(import.meta.resolve('@noble/hashes/sha2.js')),dependencyRoot=path.resolve(path.dirname(noble),'../..');
 assert.equal(path.basename(dependencyRoot),'node_modules');assert(fs.statSync(dependencyRoot).isDirectory());const dependencyBefore=sha(fs.readFileSync(noble));
 const dependencyLink=path.join(f.repo,'node_modules');assert.equal(fs.existsSync(dependencyLink),false);fs.symlinkSync(dependencyRoot,dependencyLink,'dir');
 let primary=null;
 try{
  const cli=path.join(f.repo,'scripts/append-humanitarian-plan-cluster.mjs'),requestFile=path.join(f.root,'cli-request.json');
  const invoke=args=>JSON.parse(execFileSync(process.execPath,[cli,'--repo',f.repo,'--retained-root',f.retainedRoot,...args],{env:{PATH:'/usr/bin:/bin',NO_COLOR:'1',TZ:'UTC'},encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000}));
  const first=invoke(['--prepare-request',requestFile,'--source-commit',f.sourceCommit,'--previous-commit',f.previousCommit,'--edition-id','fictional-cli-append']),bytes=fs.readFileSync(requestFile),body=json(bytes);
  assert.equal(first.ok,true);assert.equal(first.capturedAt,body.capturedAt);const reviewed=invoke(['--request',requestFile]);assert.equal(reviewed.request.capturedAt,body.capturedAt);
  const saved=invoke(['--request',requestFile,'--write-reviewed-hash',reviewed.proposalHash]);assert.equal(saved.committed,true);assert(fs.readFileSync(requestFile).equals(bytes));assert.equal(saved.registryHash,reviewed.candidateRegistryHash);
 }catch(error){primary=error;}
 finally{
  try{assert(fs.lstatSync(dependencyLink).isSymbolicLink());assert.equal(fs.readlinkSync(dependencyLink),dependencyRoot);fs.unlinkSync(dependencyLink);assert.equal(sha(fs.readFileSync(noble)),dependencyBefore);assert(fs.existsSync(dependencyRoot));}catch(error){primary??=error;}
 }
 if(primary)throw primary;
});

scenario("all-history first-append guards refuse after a legal old-method refresh before HTTPS",async f=>{
 const r=await request(f),first=await previewPlanClusterAppend({repo:f.repo,retainedRoot:f.retainedRoot,request:r.body});await writeReviewedPlanClusterAppend(first,first.proposalHash);
 const files=readObservationWorkingFiles(f.repo),registry=structuredClone(json(files["registry.json"])),initial=json(f.previousFiles[`editions/${r.body.expectedPrevious.id}.json`]);
 const refresh={...structuredClone(initial),id:"fictional-legal-old-refresh",sequence:3,supersedes:registry.current,capturedAt:new Date().toISOString()};refresh.hash=hash(refresh);files[`editions/${refresh.id}.json`]=pretty(refresh);registry.current={id:refresh.id,hash:refresh.hash,sequence:3};registry.editions.push(registry.current);
 registry.files=Object.keys(files).filter(p=>p!=="registry.json").sort().map(p=>({path:p,sha256:sha(files[p]),bytes:Buffer.byteLength(files[p])}));registry.hash=hash(registry);files["registry.json"]=pretty(registry);
 fs.writeFileSync(path.join(f.repo,"src/data/observations",`editions/${refresh.id}.json`),files[`editions/${refresh.id}.json`],{flag:"wx"});fs.writeFileSync(path.join(f.repo,"src/data/observations/registry.json"),files["registry.json"]);validateObservationFiles(files);
 f.git(["add","src/data/observations"]);f.git(["commit","--quiet","-m","Fictional old-method refresh retains earlier plan history"]);const code=f.git(["rev-parse","HEAD"]);
 await withMockHttps([],async({calls})=>{await assert.rejects(acquirePlanClusterInputs({repo:f.repo,sourceCommit:code,outputRoot:output(f)}),e=>e.phase==="preflight"&&e.reason==="SOURCE_PROOF");assert.equal(calls.length,0);});
 const receipt=structuredClone(f.receipt);receipt.sourceCommit=code;receipt.previousRegistryHash=registry.hash;receipt.expectedPrevious=registry.current;receipt.hash=hash(receipt);
 const raw=readPlanClusterRetainedRoot(f.retainedRoot),prepared={...raw,receipt},baseline=await readObservationBaseline(f.repo,code,"observation-plan-cluster-append-v1");
 const req=makePlanClusterAppendRequest({...r.body,sourceCommit:code,previousCommit:code,editionId:"fictional-illegal-second-append",capturedAt:new Date().toISOString(),expectedPrevious:registry.current,previousRegistryHash:registry.hash,preparedInputManifestHash:receipt.hash});
 assert.throws(()=>buildPlanClusterAppendCandidate(files,prepared,baseline,req),/First append already exists in retained history/);
});
scenario("MOCK HTTPS private-output post-link inspection fault cannot leave an untracked own link",async f=>{
 const link=fs.linkSync,stat=fs.lstatSync;let target,raised=false,result,error;
 fs.linkSync=(from,to)=>{const done=link(from,to);if(String(to).startsWith(output(f)+path.sep))target??=to;return done;};
 fs.lstatSync=(p,...args)=>{if(String(p)===target&&!raised){raised=true;throw Error("FICTIONAL_PRIVATE_OUTPUT_POST_LINK_STAT");}return stat(p,...args);};
 try{await withMockHttps(goodPlans(f),async()=>{try{result=await acquirePlanClusterInputs({repo:f.repo,sourceCommit:f.sourceCommit,outputRoot:output(f)});}catch(e){error=e;}});}finally{fs.linkSync=link;fs.lstatSync=stat;}
 if(error){assert.equal(raised,true);assert.deepEqual(error.cleanup,[]);assert.equal(fs.existsSync(output(f)),false);}else{assert.equal(result.complete,true);assert.equal(result.cleanup.complete,true);assert.equal(readPlanClusterRetainedRoot(output(f)).receipt.hash,result.receiptHash);}
});
scenario("MOCK HTTPS changed acquisition stage is preserved while complete output facts survive",async f=>{
 const unlink=fs.unlinkSync;let stage,saved,changed=false;
 fs.unlinkSync=(p,...args)=>{if(String(p).includes(".plan-cluster-acquisition-")&&!changed){changed=true;stage=path.dirname(String(p));saved=stage+".user-moved";fs.renameSync(stage,saved);fs.mkdirSync(stage);fs.writeFileSync(path.join(stage,"unknown-user-work"),"preserve acquisition work");throw Error("FICTIONAL_ACQUISITION_STAGE_REPLACEMENT");}return unlink(p,...args);};
 let result;try{await withMockHttps(goodPlans(f),async()=>{result=await acquirePlanClusterInputs({repo:f.repo,sourceCommit:f.sourceCommit,outputRoot:output(f)});});}finally{fs.unlinkSync=unlink;}
 assert.equal(result.complete,true);assert.equal(result.cleanup.complete,false);assert.equal(result.cleanup.artifact.present,true);assert.equal(result.cleanup.artifact.ownershipVerified,false);assert.equal(fs.readFileSync(path.join(stage,"unknown-user-work"),"utf8"),"preserve acquisition work");assert(fs.existsSync(saved));assert.equal(readPlanClusterRetainedRoot(output(f)).receipt.hash,result.receiptHash);
});
