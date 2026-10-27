import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import {parseBackupJson as browserParse,MAX_BACKUP_JSON_BYTES} from "./backup-json.js";
import {parseBackupJson as serverParse,readBackupBody} from "../lib/backup-json.mjs";
import {makeBackup,validateBackup} from "../lib/backup.mjs";
import {api,setCsrfToken} from "./api.js";
import {hash} from "../lib/security.mjs";
import {directoryCatalog,headDirectoryEntries,directoryEntrySha256} from "../lib/directory-catalog.mjs";
import {buildDirectoryPlan,buildDirectoryEvent} from "../lib/directory-resource-model.mjs";

const source=await readFile(new URL("./app.js",import.meta.url),"utf8"),actual=source.slice(source.indexOf("function renderData()"),source.indexOf("function renderImportPreview("));
const organization={name:"Fictional exact file bytes",currency:"USD",time_zone:"UTC"};
const valid=(large=false)=>makeBackup(organization,[],{legacyUnknown:null,...(large?{padding:"x".repeat(1600000)}:{})});
const rawFile=bytes=>({size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),text:()=>{throw Error("Replacement-decoding File.text must never run.");}});
function harness(selected,transport=api){
 const controls=[],nodes=[];
 const node=(tag,attrs={},...children)=>{const n={tag,attrs,children,disabled:false,files:null,value:"",handlers:{},replaceChildren(...c){this.children=c},append(...c){this.children.push(...c)},addEventListener(type,fn){this.handlers[type]=fn},textContent:""};nodes.push(n);return n;};
 const state={org:"fictional-destination",session:{user:{id:"fictional-owner"}},epoch:3,importPreview:null},errors=[],previews=[];
 const context=vm.createContext({state,node,api:transport,parseSelectedBackupJson:browserParse,Uint8Array,TextEncoder,Promise,setTimeout,clearTimeout,Error,Date,
  button:(label,fn)=>{const b=node("button");b.label=label;b.click=()=>fn({currentTarget:b});controls.push(b);return b;},
  action:async(fn,button,status)=>{try{return await fn()}catch(error){errors.push(error);status.textContent=error.message;}},
  setContent(){},heading(){return node("h1")},notice(){return node("p")},field(_label,input){return input},admin:()=>true,activeOrg:()=>({name:"Fictional destination"}),safeFilename:x=>x,download(){},toast(){},invalidateModules(){},confirmAction:async()=>false,
  renderImportPreview:(target,result)=>{previews.push(result);target.replaceChildren(node("preview"));},
 });
 vm.runInContext(actual+"\nglobalThis.start=renderData",context);context.start();
 const file=nodes.find(n=>n.attrs.id==="backup-file");file.files=[selected];
 return {state,errors,previews,file,click:()=>controls.find(b=>b.label==="Preview this backup").click()};
}
function transport(){
 const calls=[],chunks=new Map();let accepted=0;
 const fetch=async(path,options)=>{
  calls.push({path,method:options.method});const request=new Request("https://os.example.invalid"+path,{method:options.method,headers:options.headers,body:options.body});
  const input=await readBackupBody(request);
  if(path.endsWith("/import/upload")){const id=input.uploadId||"fictional-upload";chunks.set(input.index,Buffer.from(input.chunk,"base64"));return Response.json({ok:true,uploadId:id});}
  assert.ok(path.endsWith("/import/preview"));const backup=input.uploadId?serverParse(Buffer.concat([...chunks].sort((a,b)=>a[0]-b[0]).map(x=>x[1]))):input.backup;
  validateBackup(backup,"fictional-destination","fictional-owner");accepted++;return Response.json({ok:true,previewId:"fictional-reviewed",summary:{accepted:0},issues:[]});
 };
 return {calls,fetch,get accepted(){return accepted}};
}

function directoryBackup(large=false){
 const entry=headDirectoryEntries("tools")[0],capture=directoryCatalog.captures.at(-1),selection={captureId:capture.captureId,catalogKind:"tools",listingId:entry.listing.id,entrySha256:directoryEntrySha256(entry)},actorId="fictional-owner",orgId="fictional-origin",now=new Date().toISOString();
 const proposal={intent:"copy",selection,acceptHistoricalVersion:false,target:null,copiedFields:["title","catalogUrl","sourceUrl"],sourceChoice:null,limitations:{kind:"replace-all",adoptionNotes:null},assessment:null},plan=buildDirectoryPlan({proposal,orgId,actorId,membershipSha256:hash("fictional-membership"),restoreEpoch:null,now,context:{member:{userId:actorId,role:"owner",programIds:[]},ownerIds:[actorId],records:[]}}),event=buildDirectoryEvent(plan,{actorId,originOrgId:orgId,recordedAt:now,proposal});
 return makeBackup(organization,[{id:plan.resourceId,orgId,moduleId:"resources",data:plan.candidate.data,status:plan.candidate.status,ownerId:actorId,lastEditedBy:actorId,revision:1,approval:null,snapshot:null,source:null}],{...(large?{padding:"x".repeat(1600000)}:{}),directoryResources:{format:"charitology-directory-resources",version:1,method:"directory-resource-v1",captures:[{captureId:capture.captureId,core:capture.core}],bindings:[{id:plan.bindingId,resourceId:plan.resourceId,catalogKind:"tools",listingId:entry.listing.id,events:[{...event,provenance:"live"}]}]}});
}

test("browser and server lexical admission agree for exact UTF-8, duplicates, finite values and complete64MiB limits",()=>{
 for(const raw of ['{"nested":{"source":"first","\\u0073ource":"last"}}','{"legacyUnknown":1e999}',Buffer.from([123,34,120,34,58,34,255,34,125]),'\ufeff{}','{"a":[1,]}'])for(const parse of[browserParse,serverParse])assert.throws(()=>parse(raw),error=>error.status===422);
 const bytes=new Uint8Array(MAX_BACKUP_JSON_BYTES);bytes.fill(32);bytes.set(new TextEncoder().encode(JSON.stringify(valid())));assert.deepEqual(browserParse(bytes),serverParse(bytes));for(const parse of[browserParse,serverParse])assert.throws(()=>parse(new Uint8Array(MAX_BACKUP_JSON_BYTES+1)),error=>error.status===413);
 const deep="[".repeat(10000)+"0"+"]".repeat(10000);assert.doesNotThrow(()=>browserParse(deep));
});
test("actual file chooser refuses lossy duplicate, escaped source keys, overflow and malformedUTF8 before direct or chunked API",async()=>{
 const original=globalThis.fetch;setCsrfToken("fictional-csrf");
 try{for(const large of[false,true]){
  const good=JSON.stringify(valid(large));
  const replacement=valid(large);replacement.organization.name="Fictional \ufffd replacement";delete replacement.checksum;replacement.checksum=hash(replacement);const unicode=Buffer.from(JSON.stringify(replacement)),at=unicode.indexOf(Buffer.from("\ufffd"));assert.ok(at>0);
  for(const raw of[
   Buffer.from(good.replace('"legacyUnknown":null','"legacyUnknown":"misleading first","legacyUnknown":null')),
   Buffer.from(good.replace('"legacyUnknown":null','"legacyUnknown":1e999')),
   Buffer.from(good.replace('"organization":{','"organization":{"\\u006eame":"misleading first",')),
   Buffer.concat([unicode.subarray(0,at),Buffer.from([255]),unicode.subarray(at+3)]),
  ]){
   const t=transport();globalThis.fetch=t.fetch;const h=harness(rawFile(raw));await h.click();assert.equal(t.calls.length,0);assert.equal(t.accepted,0);assert.equal(h.errors.length,1);assert.equal(h.previews.length,0);assert.equal(h.state.importPreview,null);
  }
 }}finally{globalThis.fetch=original;setCsrfToken("");}
});
test("actual file chooser and actual API preserve legitimate old backups through direct and chunked server admission",async()=>{
 const original=globalThis.fetch;setCsrfToken("fictional-csrf");
 try{for(const large of[false,true]){const t=transport();globalThis.fetch=t.fetch;const h=harness(rawFile(Buffer.from(JSON.stringify(valid(large)))));await h.click();assert.equal(h.errors.length,0);assert.equal(t.accepted,1);assert.equal(h.previews.length,1);assert.equal(h.state.importPreview.id,"fictional-reviewed");assert.equal(t.calls.some(x=>x.path.endsWith("/import/upload")),large);}}
 finally{globalThis.fetch=original;setCsrfToken("");}
});
test("actual file chooser cannot preview under a later organization or adopt a stale response/file selection",async()=>{
 let resolve;const read=new Promise(r=>resolve=r),bytes=Buffer.from(JSON.stringify(valid())),selected={size:bytes.length,arrayBuffer:()=>read},calls=[];
 const h=harness(selected,{previewImport:async(...args)=>{calls.push(args);return {previewId:"wrong"}}});const pending=h.click();h.state.org="new-destination";resolve(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));await pending;assert.equal(calls.length,0);assert.equal(h.state.importPreview,null);
 let respond;const response=new Promise(r=>respond=r),next=harness(rawFile(bytes),{previewImport:async()=>response});const inFlight=next.click();await new Promise(r=>setImmediate(r));next.file.files=[rawFile(bytes)];next.file.handlers.change();respond({previewId:"stale"});await inFlight;assert.equal(next.previews.length,0);assert.equal(next.state.importPreview,null);
 let fail;const delayed=new Promise((_,r)=>fail=r),last=harness(rawFile(bytes),{previewImport:async()=>delayed});const old=last.click();await new Promise(r=>setImmediate(r));last.state.epoch++;fail(Object.assign(new Error("Old forbidden response"),{status:403}));await old;assert.equal(last.errors.length,0);assert.equal(last.previews.length,0);
});

test("actual file chooser rejects escaped duplicate directory packet/source names before direct or chunked transport",async()=>{
 const original=globalThis.fetch;
 try{for(const large of[false,true]){const backup=directoryBackup(large),good=JSON.stringify(backup);assert.equal(validateBackup(backup,"fictional-destination","fictional-owner").length,1);
  for(const raw of[good.replace('"packet":{','"packet":{"\\u0065vent":"misleading first",'),good.replace('"sources":[{','"sources":[{"\\u0075rl":"https://misleading.example/",')]){assert.notEqual(raw,good);const t=transport();globalThis.fetch=t.fetch;const h=harness(rawFile(Buffer.from(raw)));await h.click();assert.equal(t.calls.length,0);assert.equal(t.accepted,0);assert.equal(h.errors.length,1);assert.equal(h.state.importPreview,null);}
  const t=transport();globalThis.fetch=t.fetch;const h=harness(rawFile(Buffer.from(good)));await h.click();assert.equal(h.errors.length,0);assert.equal(t.accepted,1);assert.equal(t.calls.some(x=>x.path.endsWith("/import/upload")),large);
 }}finally{globalThis.fetch=original;}
});
