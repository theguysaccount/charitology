import { existsSync, mkdirSync, writeFileSync, readFileSync, lstatSync, mkdtempSync, renameSync, rmSync, rmdirSync, openSync, closeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { hash, stable } from "../services/charity-os/lib/security.mjs";
import { DIRECTORY_CATALOGS, DIRECTORY_LIMITS, strictDirectoryJson, validateDirectoryEntry, validateCaptureFile, directoryEntrySha256, directoryCaptureId, directoryUtcInstant } from "../services/charity-os/lib/directory-catalog.mjs";
import { DIRECTORY_ROOT, DIRECTORY_BUNDLE, readDirectoryTree, directoryBundleFromFiles, directoryCliOptions } from "./check-directory-resources.mjs";
const bytes=value=>Buffer.from(stable(value)+"\n");
const git=(repo,...args)=>execFileSync("git",["-C",repo,...args],{maxBuffer:16*1024*1024,stdio:["ignore","pipe","pipe"],timeout:30000});
/** Deterministic for the same existing tree, exact source A bytes and actual capture instant. */
export function prepareDirectoryCapture({existing={},sourceCommit,capturedAt,sources}){
  if(!directoryUtcInstant(capturedAt))throw Error("Use the actual UTC capture instant.");
  const previous=Object.keys(existing).length?directoryBundleFromFiles(existing,{now:capturedAt}):null,files={...existing},entries=[],catalogs=[];
  for(const fixed of DIRECTORY_CATALOGS){
    const raw=Buffer.from(sources[fixed.kind]);if(raw.length>DIRECTORY_LIMITS.sourceBytes)throw Error("Source catalog exceeds 8 MiB.");const rows=strictDirectoryJson(raw,{bytes:DIRECTORY_LIMITS.sourceBytes,depth:8});if(!Array.isArray(rows))throw Error("Source catalog must be an array.");
    const projected=rows.map(listing=>validateDirectoryEntry({format:"charitology-directory-entry",version:1,catalogKind:fixed.kind,listing},{capturedAt})).sort((a,b)=>a.listing.id<b.listing.id?-1:a.listing.id>b.listing.id?1:0);
    const descriptors=projected.map(e=>({listingId:e.listing.id,entrySha256:directoryEntrySha256(e),entryPath:`entries/${fixed.kind}/${e.listing.id}.json`}));
    catalogs.push({...fixed,rawSourceSha256:hash(raw),entries:descriptors});entries.push(...projected);
  }
  const core={format:"charitology-directory-capture",version:1,sourceCommit,capturedAt,catalogs},captureId=directoryCaptureId(core),capture=validateCaptureFile({captureId,core},{now:capturedAt}),prefix=`captures/${captureId}/`;
  if(previous?.registry.captures.some(c=>c.captureId===captureId))throw Error("This immutable capture already exists.");
  files[prefix+"capture.json"]=bytes(capture);for(const fixed of DIRECTORY_CATALOGS)files[prefix+fixed.rawPath]=Buffer.from(sources[fixed.kind]);for(const entry of entries)files[prefix+`entries/${entry.catalogKind}/${entry.listing.id}.json`]=bytes(entry);
  const captures=[...(previous?.registry.captures??[]),{sequence:(previous?.registry.captures.length??0)+1,captureId}],registry={format:"charitology-directory-registry",version:1,captures,head:captures.at(-1)};files["registry.json"]=bytes(registry);
  const bundle=directoryBundleFromFiles(files,{now:capturedAt});return {captureId,capture,files,bundle,bundleBytes:bytes(bundle)};
}
function ordinaryDestination(repo,relative,leaf){
  let current=repo;const parts=relative.split("/");
  if(parts.some(part=>!part||part==="."||part===".."))throw Error("Use only fixed ordinary capture destinations.");
  for(let i=0;i<parts.length;i++){
    current=join(current,parts[i]);if(!existsSync(current)){try{lstatSync(current);throw Error("A destination cannot be a dangling symlink.");}catch(error){if(error.code!=="ENOENT")throw error;}continue;}
    const stat=lstatSync(current);if(stat.isSymbolicLink()||(i<parts.length-1?!stat.isDirectory():leaf==="file"?!stat.isFile():!stat.isDirectory()))throw Error("Capture destinations must be ordinary files and directories without symlinks.");
  }
}
/** Stage complete bytes, install immutable capture then bundle then registry; rollback this attempt only. */
export function installDirectoryCapture({repo,prepared,testBeforeMutation=()=>{}}){
  repo=resolve(repo);const rootStat=lstatSync(repo);if(rootStat.isSymbolicLink()||!rootStat.isDirectory())throw Error("The repository must be an ordinary directory.");
  const lockPath=join(repo,".directory-resource-capture.lock");let lock,stage,captureInstalled=false,bundleInstalled=false,registryInstalled=false;const created=[];
  const mutation=(kind,path,fn)=>{testBeforeMutation(kind,path);return fn();};
  const mkdir=path=>{if(existsSync(path))return;mkdir(dirname(path));mutation("mkdir",path,()=>mkdirSync(path));created.push(path);};
  let priorBundle=null,priorRegistry=null;
  try{
    lock=mutation("lock",lockPath,()=>openSync(lockPath,"wx",0o600));
    ordinaryDestination(repo,DIRECTORY_ROOT,"directory");ordinaryDestination(repo,DIRECTORY_BUNDLE,"file");
    const existing=existsSync(join(repo,DIRECTORY_ROOT))?readDirectoryTree(repo):{};
    const bundle=directoryBundleFromFiles(prepared.files),candidateBytes=bytes(bundle);
    if(!candidateBytes.equals(prepared.bundleBytes)||bundle.registry.head.captureId!==prepared.captureId)throw Error("Prepared bundle and capture projection do not match.");
    const prior=Object.keys(existing).length?directoryBundleFromFiles(existing):null;
    if(bundle.registry.captures.length!==(prior?.registry.captures.length??0)+1||stable(bundle.registry.captures.slice(0,-1))!==stable(prior?.registry.captures??[]))throw Error("Installation only appends one immutable capture.");
    for(const [path,content]of Object.entries(existing))if(path!=="registry.json"&&(!prepared.files[path]||!Buffer.from(prepared.files[path]).equals(content)))throw Error("Installation cannot modify an existing capture artifact.");
    const prefix=`captures/${prepared.captureId}/`,newFiles=Object.keys(prepared.files).filter(path=>!Object.hasOwn(existing,path)&&path!=="registry.json");
    if(!newFiles.length||newFiles.some(path=>!path.startsWith(prefix)))throw Error("Installation admits only this capture's new files.");
    const target=join(repo,DIRECTORY_ROOT,prefix);ordinaryDestination(repo,`${DIRECTORY_ROOT}/${prefix.slice(0,-1)}`,"directory");if(existsSync(target))throw Error("This immutable capture destination already exists.");
    priorBundle=existsSync(join(repo,DIRECTORY_BUNDLE))?readFileSync(join(repo,DIRECTORY_BUNDLE)):null;priorRegistry=existing["registry.json"]??null;
    stage=mutation("stage",repo,()=>mkdtempSync(join(repo,".directory-resource-stage-")));
    const stageWrite=(path,content)=>{const full=join(stage,path);mkdirSync(dirname(full),{recursive:true});mutation("stage-write",full,()=>writeFileSync(full,content));};
    for(const path of newFiles)stageWrite(path.slice(prefix.length),prepared.files[path]);
    stageWrite("new-bundle.json",candidateBytes);stageWrite("new-registry.json",prepared.files["registry.json"]);if(priorBundle!==null)stageWrite("prior-bundle.json",priorBundle);if(priorRegistry!==null)stageWrite("prior-registry.json",priorRegistry);
    // Separate the capture payload from staging metadata before its one-directory install.
    const stagedCapture=join(stage,"capture");mkdirSync(stagedCapture);mkdirSync(join(stage,"entries"),{recursive:true});
    for(const name of ["capture.json","sources","entries"])renameSync(join(stage,name),join(stagedCapture,name));
    mkdir(dirname(target));mkdir(dirname(join(repo,DIRECTORY_BUNDLE)));
    mutation("install-capture",target,()=>renameSync(stagedCapture,target));captureInstalled=true;
    mutation("install-bundle",join(repo,DIRECTORY_BUNDLE),()=>renameSync(join(stage,"new-bundle.json"),join(repo,DIRECTORY_BUNDLE)));bundleInstalled=true;
    mutation("install-registry",join(repo,DIRECTORY_ROOT,"registry.json"),()=>renameSync(join(stage,"new-registry.json"),join(repo,DIRECTORY_ROOT,"registry.json")));registryInstalled=true;
    mutation("verify-installed",join(repo,DIRECTORY_ROOT),()=>{const installed=directoryBundleFromFiles(readDirectoryTree(repo));if(!bytes(installed).equals(candidateBytes)||!readFileSync(join(repo,DIRECTORY_BUNDLE)).equals(candidateBytes))throw Error("Installed source projection differs from the prepared complete capture.");});
  }catch(error){
    if(registryInstalled){if(priorRegistry!==null)renameSync(join(stage,"prior-registry.json"),join(repo,DIRECTORY_ROOT,"registry.json"));else rmSync(join(repo,DIRECTORY_ROOT,"registry.json"),{force:true});}
    if(bundleInstalled){if(priorBundle!==null)renameSync(join(stage,"prior-bundle.json"),join(repo,DIRECTORY_BUNDLE));else rmSync(join(repo,DIRECTORY_BUNDLE),{force:true});}
    if(captureInstalled)rmSync(join(repo,DIRECTORY_ROOT,"captures",prepared.captureId),{recursive:true,force:true});
    for(const path of created.reverse())try{rmdirSync(path);}catch(failure){if(!["ENOENT","ENOTEMPTY"].includes(failure.code))throw failure;}
    throw error;
  }finally{
    if(stage)rmSync(stage,{recursive:true,force:true});if(lock!==undefined){closeSync(lock);rmSync(lockPath,{force:true});}
  }
}
export function captureDirectoryResources({repo=process.cwd(),sourceCommit,write=false}={}){
  if(typeof sourceCommit!=="string"||!/^[a-f0-9]{40}$/.test(sourceCommit)||/^0+$/.test(sourceCommit)||git(repo,"rev-parse",`${sourceCommit}^{commit}`).toString().trim()!==sourceCommit)throw Error("Supply a real exact committed source A.");
  git(repo,"merge-base","--is-ancestor",sourceCommit,"HEAD");
  const sources=Object.fromEntries(DIRECTORY_CATALOGS.map(c=>[c.kind,git(repo,"show",`${sourceCommit}:${c.sourcePath}`)])),capturedAt=new Date().toISOString(),existing=existsSync(join(repo,DIRECTORY_ROOT))?readDirectoryTree(repo):{},prepared=prepareDirectoryCapture({existing,sourceCommit,capturedAt,sources});
  if(write)installDirectoryCapture({repo,prepared});
  return {mode:write?"written-pending-artifact-commit":"preview-only",captureInstantPolicy:"Each invocation uses its own actual UTC instant; write does not install a previous preview.",sourceCommit,capturedAt,captureId:prepared.captureId,entries:prepared.capture.core.catalogs.reduce((n,c)=>n+c.entries.length,0),captureFileSha256:hash(bytes(prepared.capture)),bundleSha256:hash(prepared.bundleBytes),files:Object.keys(prepared.files).length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const args=directoryCliOptions(process.argv.slice(2),["--repo","--source-commit","--write"]);console.log(JSON.stringify(captureDirectoryResources({repo:resolve(args["--repo"]??"."),sourceCommit:args["--source-commit"],write:args["--write"]===true}),null,2));}
