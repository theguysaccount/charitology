/** Explicit fixed public acquisition. Importing this module performs no I/O. */
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { randomUUID } from "node:crypto";
import { observationClone as clone, observationFreeze as freeze, observationObjectHash as hash,
  observationRawHash as sha, observationPrettyJson as pretty, strictObservationJson as json,
  canonicalObservationJson as canonical } from "../observation-canonical.mjs";
import { PLAN_CLUSTER_DEFINITION as D, validatePlanClusterSourceDescriptor, parsePlanClusterCsv } from "./model.mjs";
import { PLAN_CLUSTER_METADATA_URL } from "./interpretation.mjs";
import { PLAN_CLUSTER_S3_URL, PLAN_CLUSTER_INPUT_NAMES, PLAN_CLUSTER_INPUT_FILES,
  copyPlanClusterAcquisitionReceipt } from "./capture.mjs";
import { verifyPlanClusterAcquisitionSource } from "./capture-io.mjs";
import { readBoundedObservationFile } from "../observation-capture-io.mjs";

const same=(a,b)=>canonical(a)===canonical(b);
const failure=(phase,reason)=>Object.assign(new Error("PLAN_CLUSTER_ACQUISITION_REFUSED"),{code:"PLAN_CLUSTER_ACQUISITION_REFUSED",phase,reason});
const need=(ok,phase,reason)=>{if(!ok)throw failure(phase,reason);};
const phases=Object.freeze(["metadata-before","hdx-resource-redirect","csv","metadata-after"]);
const urls=Object.freeze([PLAN_CLUSTER_METADATA_URL,D.source.resourceUrl,PLAN_CLUSTER_S3_URL,PLAN_CLUSTER_METADATA_URL]);
const caps=Object.freeze([524288,16384,1048576,524288]);
function plainDirectory(p){const s=fs.lstatSync(p);need(s.isDirectory()&&!s.isSymbolicLink(),"preflight","DIRECTORY");}
function parents(p){let current=path.parse(p).root;for(const part of p.slice(current.length).split(path.sep).filter(Boolean)){current=path.join(current,part);plainDirectory(current);}}
function exists(p){try{fs.lstatSync(p);return true;}catch(e){if(e.code==="ENOENT")return false;throw e;}}
function ownDirectory(p,records){const item={path:p,created:false,dev:null,ino:null};records.push(item);fs.mkdirSync(p,{mode:0o700});item.created=true;const s=fs.lstatSync(p);need(s.isDirectory()&&!s.isSymbolicLink(),"ownership","DIRECTORY");item.dev=s.dev;item.ino=s.ino;return item;}
function checkDirectory(item){const s=fs.lstatSync(item.path);need(item.created&&item.dev!==null&&s.isDirectory()&&!s.isSymbolicLink()&&s.dev===item.dev&&s.ino===item.ino,"ownership","CHANGED_DIRECTORY_PRESERVED");}
function writeOwnedFile(p,bytes,records){
  const item={path:p,created:false,fd:null,closed:false,dev:null,ino:null,expected:bytes,complete:false};records.push(item);
  try{item.fd=fs.openSync(p,"wx",0o600);item.created=true;const s=fs.fstatSync(item.fd);item.dev=s.dev;item.ino=s.ino;fs.writeFileSync(item.fd,bytes);item.complete=true;return item;}
  finally{if(item.fd!==null){fs.closeSync(item.fd);item.closed=true;}}
}
function verifyFile(item){
  const s=fs.lstatSync(item.path);need(item.dev!==null&&s.isFile()&&!s.isSymbolicLink()&&s.dev===item.dev&&s.ino===item.ino,"ownership","CHANGED_FILE_PRESERVED");
  const expected=Buffer.from(item.expected),actual=readBoundedObservationFile(item.path,expected.length);need(item.complete?actual.equals(expected):expected.subarray(0,actual.length).equals(actual),"ownership","CHANGED_FILE_PRESERVED");return s;
}
function cleanOwned(files,directories,issues){
  for(const item of [...files].reverse())if(item.created)try{if(item.fd!==null&&!item.closed){fs.closeSync(item.fd);item.closed=true;}if(exists(item.path)){verifyFile(item);fs.unlinkSync(item.path);}}catch{issues.push("owned-file-preserved");}
  for(const item of [...directories].reverse())if(item.created)try{if(exists(item.path)){checkDirectory(item);fs.rmdirSync(item.path);}}catch{issues.push("owned-directory-preserved");}
}
function directoryStatus(item){let present=null,ownershipVerified=false;try{present=exists(item.path);if(present){checkDirectory(item);ownershipVerified=true;}}catch{}return{path:item.path,present,ownershipVerified};}
function headerLiteral(value){need(value===undefined||typeof value==="string"&&value.length<=240&&!/[\u0000-\u001f\u007f]/.test(value),"http","HEADER");return value??null;}
export function validatePlanClusterRedirectLocation(value) {
  need(typeof value==="string"&&value.length<=10240&&!/[\\\u0000-\u0020\u007f]/.test(value),"hdx-resource-redirect","LOCATION");
  let url;try{url=new URL(value);}catch{throw failure("hdx-resource-redirect","LOCATION");}
  const expected=new URL(PLAN_CLUSTER_S3_URL);
  need(url.protocol==="https:"&&url.host===expected.host&&url.pathname===expected.pathname&&!url.username&&!url.password&&!url.hash&&!url.port&&url.search.length<=8192,"hdx-resource-redirect","LOCATION");
  // Return only in RAM. Neither this URL nor raw Location enters any receipt.
  return url.href;
}
/** Exact metadata selection from the reviewed source adapter, validated before
 * CSV acquisition as well as after. Full public JSON remains a private input. */
export function validatePlanClusterMetadataBytes(bytes) {
  const tree=json(bytes,524288);
  need(tree&&tree.success===true&&tree.result&&!Array.isArray(tree.result)&&tree.result.id===D.source.datasetId&&tree.result.name===D.source.packageName&&Array.isArray(tree.result.resources),"metadata","PACKAGE");
  const d=tree.result,found=d.resources.filter(r=>r?.id===D.source.resourceId);
  need(found.length===1&&found[0].format==="CSV","metadata","RESOURCE");const r=found[0];
  try{return validatePlanClusterSourceDescriptor({datasetId:d.id,resourceId:r.id,resourceName:r.name,resourceUrl:r.url,resourceBytes:r.size,resourceModified:r.last_modified,metadataModified:d.metadata_modified,publisherHashLiteral:r.hash,license:{id:d.license_id,title:d.license_title,url:d.license_url},attribution:D.rights.attribution});}
  catch{throw failure("metadata","LICENSE_OR_DESCRIPTOR");}
}
function recordedMedia(value){if(typeof value!=="string"||value.length>240)return null;const type=value.split(";")[0].trim().toLowerCase();return type.length<=100&&/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(type)?type:null;}
function media(value,ordinal) {
  const type=recordedMedia(value);need(type!==null,"http","MEDIA");const parts=value.split(";").map(x=>x.trim());parts.shift();
  need(parts.every(p=>/^charset\s*=\s*(?:utf-?8|"utf-?8")$/i.test(p)),"http","CHARSET");
  need(ordinal===1||type===(ordinal===2?"text/csv":"application/json"),"http","MEDIA");return type;
}
/** One owned native request/socket/body. A deadline destroys transport; the
 * promise still waits for terminal close. No raced/abandoned request exists. */
function requestOnce(actualUrl,ordinal) {
  return new Promise((resolve,reject)=>{
    const phase=phases[ordinal],startedAt=new Date().toISOString(),start=process.hrtime.bigint();
    let req,res,socket,timer,reqClosed=false,resClosed=false,socketClosed=false,bodyEnded=false,problem=null,target=null,completedAt,elapsedNanoseconds,declaredLength=null,type=null;
    let chunks=[],bytes=0,httpDate=null,etag=null,lastModified=null;
    const refuse=reason=>{problem??=failure(phase,reason);if(res&&!res.destroyed)res.destroy();if(req&&!req.destroyed)req.destroy();if(socket&&!socket.destroyed)socket.destroy();};
    const finish=()=>{
      if(!reqClosed||(socket&&!socketClosed)||(res&&!resClosed))return;
      clearTimeout(timer);
      if(problem||!bodyEnded){
        const completeBody=bodyEnded&&bytes<=caps[ordinal]&&chunks.reduce((n,b)=>n+b.byteLength,0)===bytes;
        const refused=problem??failure(phase,"INCOMPLETE_BODY");
        // Actual terminal facts, not a completed source receipt. Incomplete
        // buffers are never hashed or mislabeled as a complete HTTP entity.
        refused.failedOperation=freeze({phase,complete:false,status:Number.isInteger(res?.statusCode)?res.statusCode:null,mediaType:type,
          startedAt,completedAt:bodyEnded?completedAt:null,bodyElapsedNanoseconds:bodyEnded?elapsedNanoseconds:null,
          terminalAt:new Date().toISOString(),terminalElapsedNanoseconds:Number(process.hrtime.bigint()-start),
          receivedBytes:bytes,bodyComplete:completeBody,truncated:bytes>caps[ordinal]||!bodyEnded&&bytes>0,
          sha256:completeBody?sha(Buffer.concat(chunks)):null,
          closed:{request:req?reqClosed:null,response:res?resClosed:null,socket:socket?socketClosed:null},closedVerified:true});
        chunks=[];reject(refused);return;
      }
      const body=Buffer.concat(chunks);chunks=[];
      resolve({bytes:body,target,fact:{phase,url:urls[ordinal],status:res.statusCode,mediaType:type,declaredLength,bytes,sha256:sha(body),startedAt,completedAt,elapsedNanoseconds,httpDate,etag,lastModified,settled:true}});
    };
    timer=setTimeout(()=>refuse("DEADLINE"),45000);
    try {
      req=https.request(actualUrl,{method:"GET",agent:false,maxHeaderSize:16384,headers:{Accept:ordinal===2?"text/csv":ordinal===1?"*/*":"application/json","Accept-Encoding":"identity","User-Agent":"Charitology fixed observation capture/1"}},response=>{
        res=response;
        res.on("error",()=>refuse("BODY_TRANSPORT"));res.on("aborted",()=>refuse("BODY_ABORTED"));res.once("close",()=>{resClosed=true;finish();});
        res.on("data",chunk=>{bytes+=chunk.byteLength;if(bytes>caps[ordinal]){refuse("BODY_CAP");return;}chunks.push(Buffer.from(chunk));});
        res.once("end",()=>{
          bodyEnded=true;completedAt=new Date().toISOString();elapsedNanoseconds=Number(process.hrtime.bigint()-start);
          if(Date.parse(completedAt)<Date.parse(startedAt)||Date.parse(completedAt)-Date.parse(startedAt)>45000||elapsedNanoseconds>45000000000)refuse("CLOCK_OR_DEADLINE");
          if(declaredLength!==null&&declaredLength!==bytes)refuse("LENGTH");finish();
        });
        try {
          type=recordedMedia(res.headers["content-type"]);
          need(res.statusCode===(ordinal===1?302:200),phase,"STATUS");
          need(res.headers["content-encoding"]===undefined||res.headers["content-encoding"]==="identity",phase,"CONTENT_ENCODING");
          type=media(res.headers["content-type"],ordinal);httpDate=headerLiteral(res.headers.date);etag=headerLiteral(res.headers.etag);lastModified=headerLiteral(res.headers["last-modified"]);
          if(res.headers["content-length"]!==undefined){const length=res.headers["content-length"];need(typeof length==="string"&&/^(?:0|[1-9][0-9]*)$/.test(length),phase,"LENGTH");declaredLength=Number(length);need(Number.isSafeInteger(declaredLength)&&declaredLength<=caps[ordinal],phase,"LENGTH");}
          if(ordinal===1)target=validatePlanClusterRedirectLocation(res.headers.location);
        } catch(error){refuse(error?.reason??"HEADERS");}
      });
      req.once("socket",s=>{socket=s;socket.once("close",()=>{socketClosed=true;finish();});socket.on("error",()=>refuse("SOCKET_TRANSPORT"));});
      req.on("error",()=>refuse("REQUEST_TRANSPORT"));req.once("close",()=>{reqClosed=true;finish();});req.end();
    } catch {problem??=failure(phase,"REQUEST_START");if(req)refuse("REQUEST_START");else{reqClosed=true;finish();}}
  });
}
export async function acquirePlanClusterInputs(input) {
  const v=clone(input);need(v&&Object.getPrototypeOf(v)===Object.prototype&&same(Object.keys(v).sort(),["outputRoot","repo","sourceCommit"]),"preflight","FIELDS");
  need(typeof v.repo==="string"&&path.isAbsolute(v.repo)&&typeof v.outputRoot==="string"&&path.isAbsolute(v.outputRoot),"preflight","OUTPUT_PATH");
  v.repo=path.resolve(v.repo);v.outputRoot=path.resolve(v.outputRoot);
  need(v.outputRoot!==v.repo&&!v.outputRoot.startsWith(v.repo+path.sep),"preflight","PRIVATE_OUTPUT_REQUIRED");
  const parent=path.dirname(v.outputRoot);parents(parent);need(!exists(v.outputRoot),"preflight","OCCUPIED_OUTPUT");
  let context;try{context=await verifyPlanClusterAcquisitionSource({repo:v.repo,sourceCommit:v.sourceCommit});}catch{throw failure("preflight","SOURCE_PROOF");}
  const stage=path.join(parent,".plan-cluster-acquisition-"+randomUUID()),stageFiles=[],stageDirs=[],outputDirs=[],installed=[],operations=[];
  let phase="private-stage",stageOwned,success=false,result,primary;
  try {
    stageOwned=ownDirectory(stage,stageDirs);phase="metadata-before";
    const before=await requestOnce(urls[0],0);operations.push(before.fact);checkDirectory(stageOwned);writeOwnedFile(path.join(stage,PLAN_CLUSTER_INPUT_FILES[0]),before.bytes,stageFiles);
    const descriptor=validatePlanClusterMetadataBytes(before.bytes);
    phase="hdx-resource-redirect";const redirect=await requestOnce(urls[1],1);operations.push(redirect.fact);
    phase="csv";const csv=await requestOnce(redirect.target,2);operations.push(csv.fact);checkDirectory(stageOwned);writeOwnedFile(path.join(stage,PLAN_CLUSTER_INPUT_FILES[1]),csv.bytes,stageFiles);
    const parsed=parsePlanClusterCsv(csv.bytes);need(parsed.sourceBytes===descriptor.resourceBytes,"csv","DESCRIPTOR_SIZE");
    phase="metadata-after";const after=await requestOnce(urls[3],3);operations.push(after.fact);checkDirectory(stageOwned);writeOwnedFile(path.join(stage,PLAN_CLUSTER_INPUT_FILES[2]),after.bytes,stageFiles);
    need(same(descriptor,validatePlanClusterMetadataBytes(after.bytes)),"metadata-after","DESCRIPTOR_DRIFT");
    phase="final-source-proof";need(same(context,await verifyPlanClusterAcquisitionSource({repo:v.repo,sourceCommit:v.sourceCommit})),phase,"SOURCE_CHANGED");
    const body={format:"charitology-plan-cluster-acquisition",version:1,...context,operations,inputs:[0,2,3].map((n,i)=>{const o=operations[n];return{name:PLAN_CLUSTER_INPUT_NAMES[i],sha256:o.sha256,bytes:o.bytes,startedAt:o.startedAt,completedAt:o.completedAt,httpDate:o.httpDate};}),complete:true};
    const receipt=copyPlanClusterAcquisitionReceipt({...body,hash:hash(body)});checkDirectory(stageOwned);writeOwnedFile(path.join(stage,"receipt.json"),pretty(receipt),stageFiles);
    // Exclusive final directory plus receipt-last activation; never rename over
    // another process's directory. This private rawroot is not public data B.
    phase="private-output";const outputOwned=ownDirectory(v.outputRoot,outputDirs);
    for(const name of [...PLAN_CLUSTER_INPUT_FILES,"receipt.json"]){checkDirectory(stageOwned);checkDirectory(outputOwned);const from=stageFiles.find(item=>item.path===path.join(stage,name));verifyFile(from);const dest=path.join(v.outputRoot,name);fs.linkSync(from.path,dest);installed.push({path:dest,created:true,fd:null,closed:true,dev:from.dev,ino:from.ino,expected:from.expected,complete:true});}
    success=true;result={outputRoot:v.outputRoot,receiptHash:receipt.hash,sourceCommit:context.sourceCommit,inputs:receipt.inputs,complete:true,actualRunEvidence:"local-client-clocks-declared-not-cryptographic"};
  } catch(error) {
    primary=error;
  }
  if(success){const issues=[];cleanOwned(stageFiles,stageDirs,issues);return freeze({...result,cleanup:{complete:issues.length===0,issues,artifact:issues.length?directoryStatus(stageDirs[0]):null}});}
  const reason=typeof primary?.reason==="string"&&/^[A-Z_]{1,64}$/.test(primary.reason)?primary.reason:"REFUSED",failedPhase=phases.includes(primary?.phase)?primary.phase:phase,cleanup=[];
  cleanOwned(installed,outputDirs,cleanup);
  const failedOperation=primary?.failedOperation??null,artifactPersistence={attempted:false,complete:false};
  const evidence={format:"charitology-plan-cluster-acquisition-failure",version:1,complete:false,sourceCommit:v.sourceCommit,phase:failedPhase,reason,failedOperation,completedOperations:operations,queryValuesRetained:false,cleanup};
  try{checkDirectory(stageOwned);artifactPersistence.attempted=true;writeOwnedFile(path.join(stage,"failure.json"),pretty(evidence),stageFiles);artifactPersistence.complete=true;}catch{}
  const artifactDirectory=directoryStatus(stageDirs[0]??{path:stage,created:false,dev:null,ino:null}),refused=failure(failedPhase,reason);
  Object.assign(refused,{failedOperation,completedOperations:operations,cleanup,artifactPersistence,artifactDirectory,failureArtifact:artifactDirectory.ownershipVerified?stage:null});throw refused;
}
