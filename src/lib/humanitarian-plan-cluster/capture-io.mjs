/** Explicit local maintainer I/O. No network and no Git writes. */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { observationClone as clone, observationFreeze as freeze, observationFail,
  observationRawHash as sha, observationPrettyJson as pretty, strictObservationJson as json,
  canonicalObservationJson as canonical } from "../observation-canonical.mjs";
import { OBSERVATION_ROOT, OBSERVATION_PLAN_CLUSTER_METHOD as METHOD, observationMethodPinsFor } from "../observation-baseline.mjs";
import { readObservationBaseline, readObservationGitFiles } from "../observation-git.mjs";
import { readBoundedObservationFile, readObservationWorkingFiles } from "../observation-capture-io.mjs";
import { validateObservationFiles, observationProjection } from "../observation-model.mjs";
import { copyPlanClusterBaseline, copyPlanClusterPreparedInput, copyPlanClusterAcquisitionReceipt,
  PLAN_CLUSTER_INPUT_FILES, makePlanClusterAppendRequest, buildPlanClusterAppendCandidate,
  planClusterAppendCandidateFiles } from "./capture.mjs";

const owners=new WeakMap(),fail=message=>observationFail("plan_cluster_io",message);
const need=(ok,message)=>{if(!ok)fail(message);},same=(a,b)=>canonical(a)===canonical(b);
const exact=(v,keys)=>need(v&&Object.getPrototypeOf(v)===Object.prototype&&same(Object.keys(v).sort(),[...keys].sort()),"Closed local append arguments required");
const plainDir=p=>{const s=fs.lstatSync(p);need(s.isDirectory()&&!s.isSymbolicLink(),"Ordinary local directory required");};
const exists=p=>{try{fs.lstatSync(p);return true;}catch(e){if(e.code==="ENOENT")return false;throw e;}};
function ordinaryParents(p) { const absolute=path.resolve(p);let current=path.parse(absolute).root;for(const part of absolute.slice(current.length).split(path.sep).filter(Boolean)){current=path.join(current,part);plainDir(current);} }
const equals=(a,b)=>{const keys=Object.keys(a).sort();return same(keys,Object.keys(b).sort())&&keys.every(p=>sha(a[p])===sha(b[p]));};
const gitEnv=Object.freeze({PATH:"/usr/bin:/bin",GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:"/dev/null",GIT_NO_REPLACE_OBJECTS:"1",GIT_NO_LAZY_FETCH:"1",GIT_TERMINAL_PROMPT:"0",GIT_OPTIONAL_LOCKS:"0"});
function git(repo,args) {
  try{return execFileSync("/usr/bin/git",["-c","core.fsmonitor=false","-c","core.untrackedCache=false",...args],{cwd:repo,env:gitEnv,encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:30000,maxBuffer:1048576}).trim();}
  catch{fail("Exact local Git source/ancestry unavailable");}
}
const ancestry=(repo,a,b)=>{git(repo,["merge-base","--is-ancestor",a,b]);};
function baselineMatches(repo,baseline) {
  for(const f of baseline.files) { const dest=path.resolve(repo,f.path);need(dest.startsWith(repo+path.sep),"Unsafe baseline path");ordinaryParents(path.dirname(dest));const raw=readBoundedObservationFile(dest,5242880);need(raw.length===f.bytes.byteLength&&sha(raw)===f.sha256,"Working interpretation differs from exact code A"); }
}
async function sourceProof(repo,sourceCommit,previousCommit=null) {
  need(typeof repo==="string"&&path.isAbsolute(repo),"Explicit absolute repository required");repo=path.resolve(repo);ordinaryParents(repo);
  need(typeof sourceCommit==="string"&&/^(?!0{40}$)[a-f0-9]{40}$/.test(sourceCommit),"Exact source A required");
  const baseline=copyPlanClusterBaseline(await readObservationBaseline(repo,sourceCommit,METHOD)),head=git(repo,["rev-parse","--verify","HEAD^{commit}"]);
  need(/^[a-f0-9]{40}$/.test(head),"Exact current HEAD required");ancestry(repo,sourceCommit,head);
  const atSource=await readObservationGitFiles(repo,sourceCommit),atHead=head===sourceCommit?atSource:await readObservationGitFiles(repo,head);
  need(equals(atSource,atHead)&&equals(atSource,readObservationWorkingFiles(repo)),"Previous inventory differs from code A/current HEAD/working history");
  if(previousCommit!==null) { need(typeof previousCommit==="string"&&/^(?!0{40}$)[a-f0-9]{40}$/.test(previousCommit),"Exact previous commit required");ancestry(repo,previousCommit,sourceCommit);need(equals(atSource,await readObservationGitFiles(repo,previousCommit)),"Previous committed inventory differs from code A"); }
  baselineMatches(repo,baseline);
  const previous=validateObservationFiles(atSource),projection=observationProjection(previous,previous.registry.current.id);
  need(!previous.registry.editions.some(p=>json(atSource[`editions/${p.id}.json`]).method.id===METHOD),"First append already exists in retained history");
  need(!projection.coverage.some(c=>c.selection.kind==="explicit-plan-cluster"),"First append only; existing plan capture refuses");
  return {repo,baseline,previousFiles:atSource,context:freeze({sourceCommit,method:observationMethodPinsFor(METHOD,baseline),sourceFiles:baseline.files.map(f=>({path:f.path,sha256:f.sha256,bytes:f.bytes.byteLength})),previousRegistryHash:previous.registry.hash,expectedPrevious:previous.registry.current})};
}
export async function verifyPlanClusterAcquisitionSource(input) {
  const v=clone(input);exact(v,["repo","sourceCommit"]);return (await sourceProof(v.repo,v.sourceCommit)).context;
}
export function readPlanClusterRetainedRoot(input) {
  need(typeof input==="string"&&path.isAbsolute(input),"Absolute retained root required");input=path.resolve(input);ordinaryParents(input);
  need(same(fs.readdirSync(input).sort(),[...PLAN_CLUSTER_INPUT_FILES,"receipt.json"].sort()),"Retained input root inventory mismatch");
  const receipt=copyPlanClusterAcquisitionReceipt(json(readBoundedObservationFile(path.join(input,"receipt.json"),16384),16384));
  const bytes=PLAN_CLUSTER_INPUT_FILES.map((name,i)=>readBoundedObservationFile(path.join(input,name),i===1?1048576:524288));
  return copyPlanClusterPreparedInput({receipt,metadataBefore:bytes[0],csv:bytes[1],metadataAfter:bytes[2]});
}
export async function preparePlanClusterAppendRequest(input) {
  const began=process.hrtime.bigint(),v=clone(input);exact(v,["repo","retainedRoot","sourceCommit","previousCommit","editionId","outputFile"]);
  need(typeof v.outputFile==="string"&&path.isAbsolute(v.outputFile)&&!exists(v.outputFile),"Request output must be an absent absolute file");ordinaryParents(path.dirname(v.outputFile));
  const proof=await sourceProof(v.repo,v.sourceCommit,v.previousCommit),prepared=readPlanClusterRetainedRoot(v.retainedRoot);
  need(same(prepared.receipt.method,proof.context.method)&&same(prepared.receipt.sourceFiles,proof.context.sourceFiles)&&prepared.receipt.previousRegistryHash===proof.context.previousRegistryHash&&same(prepared.receipt.expectedPrevious,proof.context.expectedPrevious),"Acquisition context differs from fresh source/raw proof");
  // One actual local assembly instant, after all fresh source/raw proof. Later
  // preview/write use these exact request bytes; neither mints another clock.
  const capturedAt=new Date().toISOString(),assemblyElapsedNanoseconds=Number(process.hrtime.bigint()-began);
  need(Number.isSafeInteger(assemblyElapsedNanoseconds),"Assembly duration exceeds exact bound");
  const request=makePlanClusterAppendRequest({format:"charitology-plan-cluster-append-request",version:1,sourceCommit:v.sourceCommit,previousCommit:v.previousCommit,editionId:v.editionId,capturedAt,assemblyElapsedNanoseconds,expectedPrevious:proof.context.expectedPrevious,previousRegistryHash:proof.context.previousRegistryHash,preparedInputManifestHash:prepared.receipt.hash});
  buildPlanClusterAppendCandidate(proof.previousFiles,prepared,proof.baseline,request);
  const text=pretty(request);need(Buffer.byteLength(text)<=16384,"Request exceeds private byte bound");
  const fd=fs.openSync(v.outputFile,"wx",0o600);try{fs.writeFileSync(fd,text);}finally{fs.closeSync(fd);}
  return freeze({requestFile:v.outputFile,requestHash:request.requestHash,capturedAt,assemblyElapsedNanoseconds,clockEvidence:"actual-local-clock-declared-not-cryptographic"});
}
export async function previewPlanClusterAppend(input) {
  const v=clone(input);exact(v,["repo","retainedRoot","request"]);
  const proof=await sourceProof(v.repo,v.request.sourceCommit,v.request.previousCommit),prepared=readPlanClusterRetainedRoot(v.retainedRoot);
  const preview=buildPlanClusterAppendCandidate(proof.previousFiles,prepared,proof.baseline,v.request);
  owners.set(preview,{repo:proof.repo,retainedRoot:v.retainedRoot,request:preview.request,baseline:proof.baseline,previousFiles:proof.previousFiles});return preview;
}
function safeRelative(p) {need(typeof p==="string"&&p.length<=240&&!p.includes("\\")&&!p.startsWith("/")&&!/[\u0000-\u001f\u007f]/.test(p)&&p.split("/").every(x=>x&&x!=="."&&x!==".."),"Unsafe candidate path");}
function ownDirectory(p,mode,records) {
  const item={path:p,created:false,dev:null,ino:null};records.push(item);
  fs.mkdirSync(p,{mode});item.created=true;const stat=fs.lstatSync(p);
  need(stat.isDirectory()&&!stat.isSymbolicLink(),"Created directory identity unavailable");item.dev=stat.dev;item.ino=stat.ino;return item;
}
function checkOwnedDirectory(item) {
  const stat=fs.lstatSync(item.path);need(item.created&&item.dev!==null&&stat.isDirectory()&&!stat.isSymbolicLink()&&stat.dev===item.dev&&stat.ino===item.ino,"Owned directory changed; preserved");
}
function ensureDirs(root,relative,created,stage=false) {
  let current=root;for(const part of relative.split("/").filter(x=>x&&x!==".")){
    current=path.join(current,part);
    if(exists(current)){const own=created.find(item=>item.path===current&&item.created);if(stage)need(own,"Unknown stage directory refused");if(own)checkOwnedDirectory(own);else plainDir(current);}
    else ownDirectory(current,stage?0o700:0o755,created);
  }
}
function openOwnedFile(p,text,records) {
  const item={path:p,created:false,fd:null,closed:false,dev:null,ino:null,expected:text,complete:false};records.push(item);
  item.fd=fs.openSync(p,"wx",0o600);item.created=true;
  // Track the exclusive creation before any later write/fault. Unknown inode
  // on a failed fstat is preserved and explicitly reported, never removed.
  const stat=fs.fstatSync(item.fd);item.dev=stat.dev;item.ino=stat.ino;
  fs.writeFileSync(item.fd,text);item.complete=true;return item;
}
function closeOwnedFile(item) {if(item.fd!==null&&!item.closed){fs.closeSync(item.fd);item.closed=true;}}
function writeOwnedFile(p,text,records) {
  let item;try{return item=openOwnedFile(p,text,records);}finally{const opened=item??records.at(-1);if(opened?.path===p)closeOwnedFile(opened);}
}
function removeOwnedFile(item) {
  if(!item.created||!exists(item.path))return;
  const stat=fs.lstatSync(item.path);
  need(item.dev!==null&&stat.isFile()&&!stat.isSymbolicLink()&&stat.dev===item.dev&&stat.ino===item.ino,"Owned cleanup identity changed; preserved");
  const expected=Buffer.from(item.expected),actual=readBoundedObservationFile(item.path,expected.length);
  need(item.complete?actual.equals(expected):actual.length<=expected.length&&expected.subarray(0,actual.length).equals(actual),"Owned cleanup bytes changed; preserved");fs.unlinkSync(item.path);
}
function cleanOwned(files,directories,issues,prefix) {
  for(const item of [...files].reverse())try{closeOwnedFile(item);removeOwnedFile(item);}catch{issues.push(prefix+"-file-preserved");}
  for(const item of [...directories].reverse())if(item.created)try{if(exists(item.path)){checkOwnedDirectory(item);fs.rmdirSync(item.path);}}catch{issues.push(prefix+"-directory-preserved");}
}
/** Adapted from the existing reviewed observation writer protocol. Different
 * owner brand, new-method preflight and candidate; no old writer bypass. */
export async function writeReviewedPlanClusterAppend(preview,reviewedHash) {
  const owner=owners.get(preview);need(owner&&typeof reviewedHash==="string"&&/^[a-f0-9]{64}$/.test(reviewedHash)&&preview.proposalHash===reviewedHash,"Actual owned preview and exact reviewed hash required");
  const parent=path.resolve(owner.repo,path.dirname(OBSERVATION_ROOT)),root=path.resolve(owner.repo,OBSERVATION_ROOT);ordinaryParents(parent);
  const lock=path.join(parent,".observations-write.lock"),stage=path.join(parent,".observations-stage-"+randomUUID());
  const installed=[],directories=[],stageFiles=[],stageDirs=[],lockFiles=[],cleanupErrors=[];let committed=false,result,primary=null,stageOwned;
  try {
    openOwnedFile(lock,JSON.stringify({pid:process.pid,nonce:randomUUID()})+"\n",lockFiles);
    const fresh=await previewPlanClusterAppend({repo:owner.repo,retainedRoot:owner.retainedRoot,request:owner.request});need(fresh.proposalHash===reviewedHash,"Source/input/registry changed after review");
    const files=planClusterAppendCandidateFiles(fresh);stageOwned=ownDirectory(stage,0o700,stageDirs);
    for(const [relative,text]of Object.entries(files)){safeRelative(relative);checkOwnedDirectory(stageOwned);ensureDirs(stage,path.dirname(relative),stageDirs,true);writeOwnedFile(path.join(stage,relative),text,stageFiles);}
    baselineMatches(owner.repo,owner.baseline);need(equals(readObservationWorkingFiles(owner.repo),owner.previousFiles),"Working history changed during stage");need(readPlanClusterRetainedRoot(owner.retainedRoot).receipt.hash===fresh.request.preparedInputManifestHash,"Retained source changed during stage");
    plainDir(root);
    for(const relative of Object.keys(files).filter(p=>p!=="registry.json").sort()) {
      if(Object.hasOwn(owner.previousFiles,relative))continue;
      ensureDirs(root,path.dirname(relative),directories);const dest=path.join(root,relative),from=path.join(stage,relative),stat=fs.lstatSync(from);
      fs.linkSync(from,dest);installed.push({path:dest,created:true,fd:null,closed:true,dev:stat.dev,ino:stat.ino,expected:files[relative],complete:true});
    }
    const registry=path.join(root,"registry.json");need(sha(readBoundedObservationFile(registry,2097152))===sha(owner.previousFiles["registry.json"]),"Previous registry changed before activation");
    const before={...files,"registry.json":owner.previousFiles["registry.json"]};need(equals(readObservationWorkingFiles(owner.repo),before),"Complete immutable inventory changed before activation");
    fs.renameSync(path.join(stage,"registry.json"),registry);committed=true;result={proposalHash:reviewedHash,registryHash:fresh.candidateRegistryHash,files:fresh.files.length,committed:true};
  } catch(error) {primary=error;}
  finally {
    if(!committed)cleanOwned(installed,directories,cleanupErrors,"installed");
    cleanOwned(stageFiles,stageDirs,cleanupErrors,"stage");
    cleanOwned(lockFiles,[],cleanupErrors,"lock");
  }
  if(primary||cleanupErrors.length) {const error=new Error("PLAN_CLUSTER_APPEND_WRITE_REFUSED");Object.assign(error,{code:"PLAN_CLUSTER_APPEND_WRITE_REFUSED",committed,cleanupErrors,...(result?{result}:{})});throw error;}
  return freeze({...result,cleanup:{complete:true}});
}
