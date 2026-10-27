import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { hash, stable } from "../services/charity-os/lib/security.mjs";
import {
  DIRECTORY_LIMITS, DIRECTORY_CATALOGS, strictDirectoryJson, validateDirectoryEntry,
  validateCaptureFile, validateDirectoryRegistry, validateDirectoryBundle,
  directoryEntrySha256,
} from "../services/charity-os/lib/directory-catalog.mjs";

export const DIRECTORY_ROOT="public/data/directory-resources";
export const DIRECTORY_BUNDLE="services/charity-os/lib/directory-catalog-data.json";
const SHA=/^[a-f0-9]{40}$/;
const canonical=value=>Buffer.from(stable(value)+"\n");
const need=(condition,message)=>{if(!condition)throw Error(message);};
const json=raw=>strictDirectoryJson(raw,{bytes:DIRECTORY_LIMITS.sourceBytes,depth:12});
function git(repo,...args){return execFileSync("git",["-C",repo,...args],{maxBuffer:16*1024*1024,stdio:["ignore","pipe","pipe"],timeout:30000});}
function commit(repo,sha){need(typeof sha==="string"&&SHA.test(sha)&&!/^0+$/.test(sha),"A real nonzero exact comparison commit is required.");need(git(repo,"rev-parse",`${sha}^{commit}`).toString().trim()===sha,"The exact committed comparison object is unavailable.");}
const ancestor=(repo,a,b)=>{try{git(repo,"merge-base","--is-ancestor",a,b);return true;}catch{return false;}};
export function readDirectoryTree(repo){
  const files={};let bytes=0;function walk(path,relative=""){
    const stat=lstatSync(path);need(!stat.isSymbolicLink(),"Directory artifacts cannot be symlinks.");
    if(stat.isDirectory()){for(const name of readdirSync(path).sort())walk(join(path,name),relative?`${relative}/${name}`:name);return;}
    need(stat.isFile(),"Directory artifacts must be ordinary files.");bytes+=stat.size;need(bytes<=DIRECTORY_LIMITS.sourceBytes,"Retained directory tree exceeds 8 MiB.");files[relative]=readFileSync(path);
  }walk(join(repo,DIRECTORY_ROOT));return files;
}
export function readDirectoryGitTree(repo,sha){
  commit(repo,sha);const files={};let bytes=0;
  const tree=git(repo,"ls-tree","-rz","--full-tree",sha,"--",DIRECTORY_ROOT).toString().split("\0").filter(Boolean);
  for(const line of tree){const match=/^(\d+) blob ([a-f0-9]{40})\t(.+)$/.exec(line);need(match&&["100644","100755"].includes(match[1]),"Directory artifacts cannot be symlinks or non-files.");const size=Number(git(repo,"cat-file","-s",match[2]).toString());bytes+=size;need(Number.isSafeInteger(size)&&bytes<=DIRECTORY_LIMITS.sourceBytes,"Retained directory Git tree exceeds 8 MiB.");files[match[3].slice(DIRECTORY_ROOT.length+1)]=git(repo,"cat-file","blob",match[2]);}return files;
}
export function directoryBundleFromFiles(files,{now=new Date().toISOString()}={}){
  need(files&&typeof files==="object"&&!Array.isArray(files),"Supply a complete directory artifact tree.");
  const names=Object.keys(files).sort();need(names.includes("registry.json"),"The retained directory registry is missing.");
  const total=names.reduce((sum,name)=>sum+Buffer.byteLength(files[name]),0);need(total<=DIRECTORY_LIMITS.sourceBytes,"Retained directory source tree exceeds 8 MiB.");
  const registry=validateDirectoryRegistry(json(files["registry.json"])),expected=new Set(["registry.json"]),captures=[];
  need(Buffer.from(files["registry.json"]).equals(canonical(registry)),"Registry is not exact canonical JSON plus one newline.");
  for(const descriptor of registry.captures){
    const prefix=`captures/${descriptor.captureId}/`,capturePath=prefix+"capture.json";expected.add(capturePath);need(files[capturePath],"A retained directory capture is missing.");
    const capture=validateCaptureFile(json(files[capturePath]),{now});need(capture.captureId===descriptor.captureId,"Capture directory ID differs from its core.");need(Buffer.from(files[capturePath]).equals(canonical(capture)),"Capture is not exact canonical JSON plus one newline.");
    const entries=[];
    for(const catalog of capture.core.catalogs){
      const rawPath=prefix+catalog.rawPath;expected.add(rawPath);need(files[rawPath],"A complete raw directory source is missing.");const raw=Buffer.from(files[rawPath]);need(hash(raw)===catalog.rawSourceSha256,"Raw catalog bytes do not match their declared SHA-256.");
      const rows=json(raw);need(Array.isArray(rows)&&rows.length===catalog.entries.length,"Source rows and entry descriptors must form a bijection.");
      const ids=new Set();const projected=rows.map(listing=>{const e=validateDirectoryEntry({format:"charitology-directory-entry",version:1,catalogKind:catalog.kind,listing},{capturedAt:capture.core.capturedAt});need(!ids.has(e.listing.id),"Duplicate raw catalog listing identity.");ids.add(e.listing.id);return e;}).sort((a,b)=>a.listing.id<b.listing.id?-1:a.listing.id>b.listing.id?1:0);
      projected.forEach((e,i)=>{const d=catalog.entries[i],path=prefix+d.entryPath;expected.add(path);need(d.listingId===e.listing.id&&d.entrySha256===directoryEntrySha256(e),"Complete projected source entry differs from its capture descriptor.");need(files[path]&&Buffer.from(files[path]).equals(canonical(e)),"Frozen entry is missing or differs from the complete canonical raw projection.");entries.push(e);});
    }captures.push({captureId:capture.captureId,core:capture.core,entries});
  }
  need(names.length===expected.size&&names.every(n=>expected.has(n)),"Unregistered or missing directory artifact file.");
  return validateDirectoryBundle({format:"charitology-directory-bundle",version:1,registry,captures},{now});
}
export function checkDirectoryResources({repo=process.cwd(),now=new Date().toISOString()}={}){
  const bundle=directoryBundleFromFiles(readDirectoryTree(repo),{now});need(readFileSync(join(repo,DIRECTORY_BUNDLE)).equals(canonical(bundle)),"Generated service directory bundle differs from the complete retained public projection.");
  return {captures:bundle.captures.length,entries:bundle.captures.reduce((n,c)=>n+c.entries.length,0),head:bundle.registry.head.captureId,treeBytes:Object.values(readDirectoryTree(repo)).reduce((n,b)=>n+b.length,0),bundleSha256:hash(canonical(bundle))};
}
/** Committed history is authoritative. Pending mode is explicitly an uncommitted artifact review. */
export function checkDirectoryResourcesGit({repo=process.cwd(),exactBase,exactHead,pending=false,now=new Date().toISOString()}={}){
  commit(repo,exactBase);commit(repo,exactHead);need(git(repo,"rev-parse","HEAD").toString().trim()===exactHead,"Directory checkout HEAD differs from the exact selected head.");need(ancestor(repo,exactBase,exactHead),"Directory comparison base must be a reachable ancestor of head.");
  const before=readDirectoryGitTree(repo,exactBase),head=readDirectoryGitTree(repo,exactHead),after=pending?readDirectoryTree(repo):head;
  need(Object.keys(after).length,"The selected head has no directory capture artifacts.");
  const bundle=directoryBundleFromFiles(after,{now}),old=Object.keys(before).length?directoryBundleFromFiles(before,{now}):null;
  // A bootstrap base cannot erase a publication made between that base and this head.
  // Validate every reachable committed registry revision, including its complete bundle.
  const publications=git(repo,"log","--full-history","--reverse","--topo-order","--format=%H",exactHead,"--",`${DIRECTORY_ROOT}/registry.json`).toString().trim().split("\n").filter(Boolean);
  let priorFiles=null,priorRegistry=null;
  for(const publication of publications){
    const files=readDirectoryGitTree(repo,publication),historical=directoryBundleFromFiles(files,{now});
    need(stable(bundle.registry.captures.slice(0,historical.registry.captures.length))===stable(historical.registry.captures),"A historical committed registry descriptor was removed, replaced or rewound.");
    need(git(repo,"show",`${publication}:${DIRECTORY_BUNDLE}`).equals(canonical(historical)),"A historical committed bundle differs from its complete public projection.");
    if(priorRegistry){
      need(stable(historical.registry.captures.slice(0,priorRegistry.captures.length))===stable(priorRegistry.captures),"Committed registry history cannot rewind or rewrite a prior publication.");
      for(const [path,bytes]of Object.entries(priorFiles))if(path!=="registry.json")need(files[path]&&Buffer.from(files[path]).equals(bytes),"A historical immutable artifact blob changed or disappeared.");
    }
    priorFiles=files;priorRegistry=historical.registry;
  }
  if(priorFiles)for(const [path,bytes]of Object.entries(priorFiles))if(path!=="registry.json")need(after[path]&&Buffer.from(after[path]).equals(bytes),"A prior published artifact blob changed or disappeared.");
  if(old){need(stable(bundle.registry.captures.slice(0,old.registry.captures.length))===stable(old.registry.captures),"Directory registry cannot rewrite, remove or reorder an old descriptor.");for(const [path,bytes]of Object.entries(before))if(path!=="registry.json")need(after[path]&&Buffer.from(after[path]).equals(bytes),"An earlier immutable directory artifact blob changed.");}
  let introduced=0;for(const c of bundle.captures){
    const path=`${DIRECTORY_ROOT}/captures/${c.captureId}/capture.json`;let B=null;
    if(head[`captures/${c.captureId}/capture.json`]){
      const lines=git(repo,"log","--format=%H","--diff-filter=A","--reverse",exactHead,"--",path).toString().trim().split("\n").filter(Boolean);need(lines.length===1,"A capture must have one immutable artifact-introducing commit.");B=lines[0];
      const parents=git(repo,"rev-list","--parents","-n","1",B).toString().trim().split(" ").slice(1);need(parents.length&&parents.some(parent=>ancestor(repo,c.core.sourceCommit,parent)),"Source commit A must precede artifact B and be reachable from B's parent.");
    }else{need(pending,"Uncommitted captures require explicit pending review mode.");need(ancestor(repo,c.core.sourceCommit,exactHead),"Pending source A must already be reachable from the committed head before artifact B.");introduced++;}
    commit(repo,c.core.sourceCommit);for(const cat of c.core.catalogs){need(/^100(?:644|755) blob /.test(git(repo,"ls-tree",c.core.sourceCommit,"--",cat.sourcePath).toString()),"Source A catalogs must be committed ordinary files.");const raw=git(repo,"show",`${c.core.sourceCommit}:${cat.sourcePath}`);need(raw.equals(Buffer.from(after[`captures/${c.captureId}/${cat.rawPath}`])),"Captured raw source must equal the exact committed source A blob.");}
  }
  if(!pending){
    const tracked=git(repo,"status","--porcelain","--untracked-files=all","--",DIRECTORY_ROOT,DIRECTORY_BUNDLE).toString();need(!tracked.trim(),"Uncommitted directory artifacts cannot borrow committed proof.");
    const generated=canonical(bundle);need(git(repo,"show",`${exactHead}:${DIRECTORY_BUNDLE}`).equals(generated),"Committed generated bundle differs from its complete retained projection.");
    const working=readDirectoryTree(repo);need(stable(Object.keys(working).sort())===stable(Object.keys(head).sort())&&Object.keys(head).every(k=>head[k].equals(working[k])),"Directory checkout differs from exact committed head.");
  }else need(readFileSync(join(repo,DIRECTORY_BUNDLE)).equals(canonical(bundle)),"Pending bundle differs from retained artifacts.");
  return {mode:pending?"pending-uncommitted-review":"committed-verified",comparisonBase:exactBase,head:exactHead,captures:bundle.captures.length,pendingCaptures:introduced,immutableOldFiles:Object.keys(before).filter(p=>p!=="registry.json").length};
}
export function directoryCliOptions(args,allowed){const out={};for(let i=0;i<args.length;i++){const key=args[i];need(allowed.includes(key)&&out[key]===undefined,"Unknown or duplicate option: "+key);if(key==="--pending"||key==="--write"){out[key]=true;continue;}need(args[i+1]&&!args[i+1].startsWith("--"),"Missing option value: "+key);out[key]=args[++i];}return out;}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=directoryCliOptions(process.argv.slice(2),["--repo","--base","--head","--pending"]),repo=resolve(args["--repo"]??".");
  const result=args["--base"]||args["--head"]||args["--pending"]?checkDirectoryResourcesGit({repo,exactBase:args["--base"],exactHead:args["--head"],pending:args["--pending"]===true}):checkDirectoryResources({repo});console.log(JSON.stringify(result,null,2));
}
