/** Immutable public directory data. No request-time paths, fetches or vendor discovery. */
import bundled from "./directory-catalog-data.json" with { type: "json" };
import { hash, stable, fail } from "./security.mjs";
import { validDate } from "./modules.mjs";

export const DIRECTORY_METHOD = "directory-resource-v1";
export const DIRECTORY_MAPPING_VERSION = "directory-resource-map-v1";
export const DIRECTORY_LIMITS = Object.freeze({ entries:128, entryBytes:8192, sourceBytes:8*1024*1024, versions:32, captureBytes:32768, bindings:250, rows:1000, events:32, payloadBytes:32768, reserveBytes:4096, featureBytes:4*1024*1024 });
export const DIRECTORY_CATALOGS = Object.freeze([
  Object.freeze({kind:"tools",sourcePath:"src/data/nonprofit-tools.json",rawPath:"sources/nonprofit-tools.json"}),
  Object.freeze({kind:"benefits",sourcePath:"src/data/nonprofit-benefits.json",rawPath:"sources/nonprofit-benefits.json"}),
]);
const HASH=/^[a-f0-9]{64}$/, COMMIT=/^[a-f0-9]{40}$/, LISTING=/^[a-z0-9][a-z0-9-]{0,63}$/;
const badControl=/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const invalid=(message="Use complete bounded directory source data.")=>fail(422,"directory_capture",message);
export const directoryIsHash=(v)=>typeof v==="string"&&HASH.test(v);
export const directoryIsListingId=(v)=>typeof v==="string"&&LISTING.test(v);
export function directoryFreeze(v){if(v&&typeof v==="object"){for(const x of Object.values(v))directoryFreeze(x);Object.freeze(v);}return v;}
/** Admit and detach JSON data without getters, exotic prototypes, holes, cycles or coercion. */
export function directoryOwned(value,{bytes=DIRECTORY_LIMITS.sourceBytes,depth=24,nodes=150000}={}){
  const ancestors=new Set();let count=0;
  const visit=(v,d)=>{
    if(++count>nodes||d>depth)invalid("Directory data exceeds its structural bound.");
    if(v===null||typeof v==="boolean")return v;
    if(typeof v==="string"){if(badControl.test(v))invalid("Control characters are not accepted.");return v;}
    if(typeof v==="number"&&Number.isFinite(v))return v;
    if(!v||typeof v!=="object"||ancestors.has(v))invalid();
    const array=Array.isArray(v),proto=Object.getPrototypeOf(v),descriptors=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(descriptors);
    if((array&&proto!==Array.prototype)||(!array&&proto!==Object.prototype&&proto!==null)||keys.some(k=>typeof k!=="string"||!Object.hasOwn(descriptors[k],"value")))invalid();
    if(array&&(keys.length!==v.length+1||keys.some(k=>k!=="length"&&!/^(0|[1-9]\d*)$/.test(k))))invalid();
    ancestors.add(v);const out=array?[]:{};
    for(const k of keys){if(k==="length"&&array)continue;Object.defineProperty(out,k,{value:visit(descriptors[k].value,d+1),enumerable:true,writable:true,configurable:true});}
    ancestors.delete(v);return out;
  };
  const out=visit(value,0);if(Buffer.byteLength(stable(out))>bytes)invalid("Directory data exceeds its byte bound.");return out;
}
export function directoryClosed(v,keys){if(!v||Array.isArray(v)||typeof v!=="object"||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))invalid("Unknown or missing directory fields.");}
export function directoryUtcInstant(v){return typeof v==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&validDate(v.slice(0,10))&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;}
function text(v,min,max){if(typeof v!=="string"||v.length<min||v.length>max||!v.trim()||badControl.test(v))invalid();}
export function directoryHttps(v){if(typeof v!=="string"||v.length>1200||/[\u0000-\u0020\u007F]/.test(v))invalid();try{const u=new URL(v);if(u.protocol!=="https:"||u.username||u.password)invalid();}catch{invalid("Use an absolute HTTPS source URL without credentials.");}return v;}
const ENTRY_KEYS=["format","version","catalogKind","listing"];
const LISTING_KEYS=["id","name","category","summary","costType","cost","delivery","fit","eligibility","limits","url","sources","checked","review"];
export function validateDirectoryEntry(value,{capturedAt}={}){
  const e=directoryOwned(value,{bytes:DIRECTORY_LIMITS.entryBytes});directoryClosed(e,ENTRY_KEYS);
  if(e.format!=="charitology-directory-entry"||e.version!==1||!["tools","benefits"].includes(e.catalogKind))invalid();
  const l=e.listing;directoryClosed(l,LISTING_KEYS);if(!directoryIsListingId(l.id))invalid();
  for(const [key,max]of Object.entries({name:180,category:120,summary:2000,costType:120,cost:2000,delivery:1000,fit:2000,eligibility:2000,limits:4000}))text(l[key],1,max);
  directoryHttps(l.url);if(!Array.isArray(l.sources)||l.sources.length<1||l.sources.length>8)invalid();
  for(const s of l.sources){directoryClosed(s,["label","url"]);text(s.label,1,240);directoryHttps(s.url);}
  if(l.checked!==null&&!validDate(l.checked))invalid("Directory checked must be a real date or explicit null.");
  if(capturedAt!==undefined&&(!directoryUtcInstant(capturedAt)||(l.checked!==null&&l.checked>capturedAt.slice(0,10))))invalid("Directory checked cannot be later than its capture UTC day.");
  if(!["draft","reviewed"].includes(l.review))invalid();return directoryFreeze(e);
}
export const directoryEntrySha256=(entry)=>hash({namespace:"charitology:directory-entry:v1",entry:validateDirectoryEntry(entry)});
export const directoryCaptureId=(core)=>hash({namespace:"charitology:directory-capture:v1",core});
export const directoryRegistryHash=(registry)=>hash({namespace:"charitology:directory-registry:v1",registry});
export function validateCaptureFile(value,{now=new Date().toISOString()}={}){
  const c=directoryOwned(value,{bytes:DIRECTORY_LIMITS.captureBytes});directoryClosed(c,["captureId","core"]);const x=c.core;
  directoryClosed(x,["format","version","sourceCommit","capturedAt","catalogs"]);
  if(x.format!=="charitology-directory-capture"||x.version!==1||typeof x.sourceCommit!=="string"||!COMMIT.test(x.sourceCommit)||/^0+$/.test(x.sourceCommit)||!directoryUtcInstant(x.capturedAt)||!directoryUtcInstant(now)||x.capturedAt>now)invalid("Use a committed source and a capture instant that has occurred.");
  if(!Array.isArray(x.catalogs)||x.catalogs.length!==2)invalid();let count=0;
  x.catalogs.forEach((catalog,i)=>{
    directoryClosed(catalog,["kind","sourcePath","rawPath","rawSourceSha256","entries"]);const fixed=DIRECTORY_CATALOGS[i];
    if(catalog.kind!==fixed.kind||catalog.sourcePath!==fixed.sourcePath||catalog.rawPath!==fixed.rawPath||!directoryIsHash(catalog.rawSourceSha256)||!Array.isArray(catalog.entries))invalid();
    let prior="";for(const d of catalog.entries){directoryClosed(d,["listingId","entrySha256","entryPath"]);if(!directoryIsListingId(d.listingId)||d.listingId<=prior||!directoryIsHash(d.entrySha256)||d.entryPath!==`entries/${catalog.kind}/${d.listingId}.json`)invalid();prior=d.listingId;count++;}
  });
  if(count>DIRECTORY_LIMITS.entries||!directoryIsHash(c.captureId)||directoryCaptureId(x)!==c.captureId)invalid("Capture identity or entry bound does not match.");
  // PostgreSQL jsonb text uses spaces; this conservative envelope is independent of compact encoding.
  if(Buffer.byteLength(JSON.stringify(c).replace(/[:,]/g,"$& "))>DIRECTORY_LIMITS.captureBytes)invalid("Capture envelope exceeds the PostgreSQL row bound.");
  return directoryFreeze(c);
}
export function validateDirectoryRegistry(value){
  const r=directoryOwned(value);directoryClosed(r,["format","version","captures","head"]);
  if(r.format!=="charitology-directory-registry"||r.version!==1||!Array.isArray(r.captures)||!r.captures.length)invalid();
  const ids=new Set();r.captures.forEach((d,i)=>{directoryClosed(d,["sequence","captureId"]);if(d.sequence!==i+1||!directoryIsHash(d.captureId)||ids.has(d.captureId))invalid();ids.add(d.captureId);});
  directoryClosed(r.head,["sequence","captureId"]);if(stable(r.head)!==stable(r.captures.at(-1)))invalid("Directory head must equal the final capture descriptor.");return directoryFreeze(r);
}
export function validateDirectoryBundle(value,{now=new Date().toISOString()}={}){
  const b=directoryOwned(value);directoryClosed(b,["format","version","registry","captures"]);
  if(b.format!=="charitology-directory-bundle"||b.version!==1||!Array.isArray(b.captures))invalid();const r=validateDirectoryRegistry(b.registry);
  if(b.captures.length!==r.captures.length)invalid();const versions=new Map();
  b.captures.forEach((c,i)=>{
    directoryClosed(c,["captureId","core","entries"]);validateCaptureFile({captureId:c.captureId,core:c.core},{now});if(c.captureId!==r.captures[i].captureId||!Array.isArray(c.entries))invalid();
    const descriptors=c.core.catalogs.flatMap(k=>k.entries.map(d=>({...d,kind:k.kind})));if(c.entries.length!==descriptors.length)invalid("Capture entries must form a complete descriptor bijection.");
    c.entries.forEach((raw,j)=>{const e=validateDirectoryEntry(raw,{capturedAt:c.core.capturedAt}),d=descriptors[j],sha=directoryEntrySha256(e);if(e.catalogKind!==d.kind||e.listing.id!==d.listingId||sha!==d.entrySha256)invalid("Frozen entry does not match its capture descriptor.");const key=`${e.catalogKind}/${e.listing.id}`,set=versions.get(key)||new Set();set.add(sha);versions.set(key,set);if(set.size>DIRECTORY_LIMITS.versions)invalid("Too many retained entry versions.");});
  });return directoryFreeze(b);
}
export const directoryCatalog=directoryFreeze(bundled);
export const directoryRegistrySha256=directoryCatalog.registry?directoryRegistryHash(directoryCatalog.registry):null;
let admitted;
function catalog(){return admitted??=(validateDirectoryBundle(directoryCatalog));}
export function headDirectoryEntries(kind){if(kind!==undefined&&!["tools","benefits"].includes(kind))invalid();const b=catalog();return b.captures.at(-1).entries.filter(e=>kind===undefined||e.catalogKind===kind);}
export function getDirectorySelection(selection,{now=new Date().toISOString()}={}){
  const s=directoryOwned(selection,{bytes:1024});directoryClosed(s,["captureId","catalogKind","listingId","entrySha256"]);
  if(!directoryIsHash(s.captureId)||!["tools","benefits"].includes(s.catalogKind)||!directoryIsListingId(s.listingId)||!directoryIsHash(s.entrySha256))invalid();
  const b=catalog(),capture=b.captures.find(c=>c.captureId===s.captureId),entry=capture?.entries.find(e=>e.catalogKind===s.catalogKind&&e.listing.id===s.listingId);
  if(!entry||directoryEntrySha256(entry)!==s.entrySha256)fail(422,"directory_source","This exact retained directory version is unavailable.");
  return directoryFreeze({captureId:capture.captureId,core:capture.core,entry,entrySha256:s.entrySha256,selection:s,comparison:compareDirectorySelection(s,{now})});
}
export function compareDirectorySelection(selection,{now=new Date().toISOString()}={}){
  if(!directoryUtcInstant(now))invalid();const b=catalog(),selected=b.captures.find(c=>c.captureId===selection.captureId)?.entries.find(e=>e.catalogKind===selection.catalogKind&&e.listing.id===selection.listingId);
  if(!selected||directoryEntrySha256(selected)!==selection.entrySha256)fail(422,"directory_source","This exact retained directory version is unavailable.");
  const head=b.captures.at(-1).entries.find(e=>e.catalogKind===selection.catalogKind&&e.listing.id===selection.listingId),headHash=head?directoryEntrySha256(head):null;
  const age=selected.listing.checked===null?null:Math.floor((Date.parse(now.slice(0,10))-Date.parse(selected.listing.checked))/86400000);
  return directoryFreeze({historical:headHash!==selection.entrySha256,absentFromHead:!head,newerVersion:!!head&&headHash!==selection.entrySha256,headEntrySha256:headHash,checkedAgeDays:age,editorialReview:selected.listing.review});
}
export function listDirectoryCaptures({cursor=null}={}){
  const b=catalog(),registrySha256=directoryRegistryHash(b.registry);let next=1;
  if(cursor!==null){const c=directoryOwned(cursor,{bytes:256});directoryClosed(c,["registrySha256","nextSequence"]);if(c.registrySha256!==registrySha256)fail(409,"directory_stale","The directory head changed. Restart this list.");if(!Number.isSafeInteger(c.nextSequence)||c.nextSequence<1||c.nextSequence>b.captures.length)invalid();next=c.nextSequence;}
  const captures=b.captures.slice(next-1,next+24).map((c,i)=>({sequence:next+i,captureId:c.captureId,core:c.core}));const after=next+captures.length;
  return directoryFreeze({registry:b.registry,registrySha256,head:b.registry.head,captures,nextCursor:after>b.captures.length?null:{registrySha256,nextSequence:after}});
}

/** Strict JSON reader also used by offline artifact tools. Decoded duplicate keys fail before JSON.parse. */
export function strictDirectoryJson(input,{bytes=32768,depth=8}={}){
  const raw=typeof input==="string"?Buffer.from(input):input;if(!Buffer.isBuffer(raw)&&!(raw instanceof Uint8Array))invalid();if(raw.byteLength>bytes)fail(413,"size","This directory JSON is too large.");
  let s;try{s=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(raw);}catch{invalid("Supply valid UTF-8 JSON.");}if(s.charCodeAt(0)===0xfeff)invalid("A JSON byte-order mark is not accepted.");let p=0;
  const ws=()=>{while(/[ \t\r\n]/.test(s[p]??"x"))p++;};
  const string=()=>{const start=p++;while(p<s.length){const c=s[p++];if(c==='"'){try{return JSON.parse(s.slice(start,p));}catch{invalid("Supply valid JSON strings.");}}if(c==='\\'){if(s[p]==="u"){if(!/^[0-9a-fA-F]{4}$/.test(s.slice(p+1,p+5)))invalid();p+=5;}else{if(!/["\\/bfnrt]/.test(s[p]??""))invalid();p++;}}else if(c.charCodeAt(0)<32)invalid();}invalid("Unterminated JSON string.");};
  const value=d=>{if(d>depth)invalid("JSON nesting is too deep.");ws();const c=s[p];if(c==='"'){string();return;}if(c==="{"){p++;ws();const seen=new Set();if(s[p]==="}"){p++;return;}while(true){ws();if(s[p]!=='"')invalid();const k=string();if(seen.has(k))invalid("Duplicate decoded JSON object key.");seen.add(k);ws();if(s[p++]!==":")invalid();value(d+1);ws();if(s[p]==="}"){p++;return;}if(s[p++]!==",")invalid();}}if(c==="["){p++;ws();if(s[p]==="]"){p++;return;}while(true){value(d+1);ws();if(s[p]==="]"){p++;return;}if(s[p++]!==",")invalid();}}const match=s.slice(p).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);if(!match)invalid("Supply exact JSON syntax.");p+=match[0].length;};
  value(0);ws();if(p!==s.length)invalid("Trailing JSON syntax is not accepted.");let result;try{result=JSON.parse(s);}catch{invalid("Supply valid JSON.");}return directoryOwned(result,{bytes,depth});
}
