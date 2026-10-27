import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { api, setCsrfToken } from "./api.js";
import { createDirectoryResourceWorkspace, createDirectoryCatalogPicker, DIRECTORY_VISIBILITY_NOTICE, directorySelectionFromFragment, directoryFragment, directoryHash } from "./directory-resources.js";
// Actual controller and actual API wrappers with fictional transport. No browser/DB evidence.
class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.handlers = new Map(); this.disabled = false; this.checked = false; this._value = ""; }
  removeAttribute(key) { delete this.attributes[key]; }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key === "id") this.id = value; if (key === "value") this.value = value; }
  addEventListener(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, []); this.handlers.get(type).push(fn); }
  append(...children) { for (const child of children) { if (child instanceof Element) child.parentElement = this; this.children.push(child); } if (this.tagName === "TEXTAREA") this._value = this.textContent; }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  get textContent() { return this.children.map(c => c instanceof Element ? c.textContent : c.textContent ?? String(c)).join(" "); }
  set textContent(value) { this.replaceChildren(String(value)); }
  get value() { if (this.tagName === "SELECT" && !this._chosen) { const o = this.children.find(c => c.selected) || this.children[0]; return o?.value || ""; } return this._value; }
  set value(value) { this._value = String(value); this._chosen = true; }
  querySelectorAll(selector) {
    const matches = el => selector.split(",").some(s => { s = s.trim(); if (s.startsWith("[")) { const m = s.match(/^\[([^=\]]+)(?:="([^"]+)")?\]$/); return m && Object.hasOwn(el.attributes,m[1]) && (!m[2] || el.attributes[m[1]] === m[2]); } return el.tagName === s.toUpperCase(); });
    return this.children.flatMap(c => c instanceof Element ? [...(matches(c) ? [c] : []), ...c.querySelectorAll(selector)] : []);
  }
  querySelector(s) { return this.querySelectorAll(s)[0] || null; }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this); }
  async emit(type) { if (this.disabled) return; const event = { target: this, currentTarget: this, preventDefault() {} }; for (let el = this; el; el = el.parentElement) for (const fn of el.handlers.get(type) || []) await fn(event); }
}
globalThis.document = { createElement: tag => new Element(tag), createTextNode: text => ({ textContent: text }) };
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const copy = v => JSON.parse(JSON.stringify(v));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const listing = { id:"fictional-tool", name:"Fictional tool", category:"Records", summary:"Literal <script>source</script> prose", costType:"Free software", cost:"Free with hosting costs", delivery:"Self-hosted", fit:"Record management", eligibility:"Check the provider", limits:"No support promised", url:"https://provider.example/tool", sources:[{label:"Terms",url:"https://provider.example/terms"}], checked:"2026-10-25", review:"draft" };
const entry = {format:"charitology-directory-entry",version:1,catalogKind:"tools",listing};
const selection = {captureId:"a".repeat(64),catalogKind:"tools",listingId:listing.id,entrySha256:await directoryHash({namespace:"charitology:directory-entry:v1",entry})};
const entryResponse = {ok:true,selection,entry,entrySha256:selection.entrySha256,core:{sourceCommit:"b".repeat(40),capturedAt:"2026-10-27T00:00:00.000Z"},comparison:{historical:false,absentFromHead:false,newerVersion:false,headEntrySha256:selection.entrySha256,checkedAgeDays:2,editorialReview:"draft"}};
const data = { title:"Working Resource",kind:"tool",providerName:null,catalogUrl:"https://charitology.org/for-charities/tools/#fictional-tool",sourceUrl:null,eligibility:"unknown",reviewedDate:null,renewalDate:null,cost:null,confirmationReference:null,limitations:"Current custom organization text" };
const record = {id:"resource1",moduleId:"resources",revision:3,status:"discovered",ownerId:"actor1",data};
const binding = {id:"binding1",resourceId:"resource1",catalogKind:"tools",listingId:listing.id,originMode:"live",historyHeadSha256:"f".repeat(64),sequence:1,selection};
const event = {packet:{sequence:1,event:"copied",recordedAt:"2026-10-25T00:00:00.000Z",selection},packetSha256:"c".repeat(64),provenance:"live"};
const key = "12345678-1234-4abc-8abc-123456789abc";
const clock = Date.parse("2026-10-27T00:00:00.000Z");
async function makeReady(proposal) {
  const plan = {method:"directory-resource-v1",mappingVersion:"directory-resource-map-v1",orgId:"org1",intent:proposal.intent,selection:proposal.selection,before:proposal.target?{revision:proposal.target.revision}:null,candidate:{moduleId:"resources",status:"discovered",revision:proposal.target?proposal.target.revision+1:1,data:{...data,limitations:"Summary: Fictional source"}},changes:[{field:"limitations",before:proposal.target?data.limitations:null,after:"Summary: Fictional source",origin:"directory"}],warnings:["editorial-draft"]};
  plan.planSha256 = await directoryHash({namespace:"charitology:directory-resource:plan:v1",value:plan});
  return {ok:true,kind:"ready",plan,previewToken:"fictional-preview-token",expiresAt:new Date(clock+600000).toISOString()};
}
function harness(options = {}) {
  const calls = {preview:[],commit:[],entry:[],history:[],download:[]};
  let current = true, editor = false, time = clock;
  const transport = {
    directoryEntry: async s => { calls.entry.push(copy(s)); return copy(entryResponse); },
    directoryCatalogs: async () => ({head:{captureId:"d".repeat(64)}}),
    directoryResource: async (org,id,cursor) => { calls.history.push({org,id,cursor}); return {ok:true,binding:copy(binding),events:[copy(event)],disposition:{kind:"active-record",record:copy(record)},assessment:{kind:"historical",reviewedDate:"2026-10-25"},nextCursor:null}; },
    previewDirectoryResource: async (org,p) => { calls.preview.push(copy(p)); return makeReady(p); },
    commitDirectoryResource: async (org,b) => { calls.commit.push(copy(b)); return {ok:true,kind:"copied",disposition:{kind:"active-record",record:copy(record)}}; },
    exportDirectoryResource: async () => new Blob(["partial-evidence"]),
    ...options.api,
  };
  const workspace = createDirectoryResourceWorkspace({ orgId:"org1",canExport:true,api:transport,initialSelection:copy(selection),currencies:{USD:2,JPY:0},isCurrent:()=>current,editorOpen:()=>editor,now:()=>time,randomUUID:()=>key,download:(...args)=>calls.download.push(args),...options,api:transport });
  const find = s => workspace.element.querySelector(s);
  const button = text => workspace.element.querySelectorAll("button").find(b=>b.textContent===text);
  return {workspace,calls,find,button,setCurrent:v=>{current=v},setEditor:v=>{editor=v},setTime:v=>{time=v}};
}
const click = async el => { assert.ok(el,"expected mounted control"); await el.emit("click"); };
const change = async (el,value) => { assert.ok(el); if (typeof value === "boolean") el.checked=value; else el.value=value; await el.emit("change"); };

test("public source fragment is closed, exact and contains no private state", () => {
  assert.deepEqual(directorySelectionFromFragment(directoryFragment(selection)),selection);
  for (const suffix of ["?org=secret","/extra","#token","?email=a@example.org"]) assert.equal(directorySelectionFromFragment(directoryFragment(selection)+suffix),null);
  for (const bad of [directoryFragment(selection).replace("directory/","directory%2F"),directoryFragment(selection).replace("tools/","TOOLS/"),"#directory?kind=tools"]) assert.equal(directorySelectionFromFragment(bad),null);
});
test("copy inspects actual entry hash, shows defaults and sends only exact closed proposal", async () => {
  const h=harness(); await h.workspace.load();
  assert.match(h.workspace.element.textContent,/Source checked 2 days/);
  assert.match(h.workspace.element.textContent,/Provider name, organization review date/);
  assert.ok(h.workspace.element.querySelectorAll("a").some(a=>a.attributes.href===listing.url));
  await change(h.find('[data-directory-source-choice]'),"source:0");
  await click(h.find('[data-directory-preview]'));
  const p=h.calls.preview[0];
  assert.deepEqual(Object.keys(p).sort(),["intent","selection","acceptHistoricalVersion","target","copiedFields","sourceChoice","limitations","assessment"].sort());
  assert.equal(p.intent,"copy"); assert.equal(p.assessment,null); assert.equal(p.target,null);
  assert.deepEqual(p.sourceChoice,{kind:"source",index:0}); assert.deepEqual(p.limitations,{kind:"replace-all",adoptionNotes:null});
  assert.match(h.workspace.element.textContent,/Full limitations before and after/);
  await click(h.find('[data-directory-commit]')); assert.equal(h.calls.commit.length,1);
  assert.deepEqual(h.calls.commit[0].proposal,p); assert.equal(h.calls.commit[0].commandKey,key);
  assert.match(h.workspace.element.textContent,/Open current Resource/);h.workspace.dispose();
});
test("tampered source/preview hashes never expose a commit control", async () => {
  const h=harness({api:{directoryEntry:async()=>({...copy(entryResponse),entry:{...entry,listing:{...listing,name:"Tampered"}}})}});
  await h.workspace.load(); assert.match(h.workspace.element.textContent,/source hash did not match/); assert.equal(h.find('[data-directory-preview]'),null);
  const p=harness({api:{previewDirectoryResource:async (_org,proposal)=>({...await makeReady(proposal),plan:{...(await makeReady(proposal)).plan,planSha256:"e".repeat(64)}})}});
  await p.workspace.load(); await click(p.find('[data-directory-preview]'));assert.equal(p.find('[data-directory-commit]'),null);assert.match(p.workspace.element.textContent,/preview hash did not match/); h.workspace.dispose();p.workspace.dispose();
});
test("changed and missing historical versions require acknowledgment and retain exact selection", async () => {
  for (const absent of [false,true]) {
    const h=harness({api:{directoryEntry:async()=>({...copy(entryResponse),comparison:{...entryResponse.comparison,historical:true,newerVersion:!absent,absentFromHead:absent,headEntrySha256:absent?null:"d".repeat(64)}})}});
    await h.workspace.load();await click(h.find('[data-directory-preview]'));assert.equal(h.calls.preview.length,0);assert.match(h.workspace.element.textContent,/Acknowledge/);
    await change(h.find('[data-directory-historical]'),true);await click(h.find('[data-directory-preview]'));assert.equal(h.calls.preview[0].acceptHistoricalVersion,true);assert.deepEqual(h.calls.preview[0].selection,selection);h.workspace.dispose();
  }
});
test("primary identity surfaces current Resource/trash/archive without another copy", async () => {
  for (const disposition of [{kind:"active-record",record},{kind:"trash",recordId:record.id,recoveryAvailable:true},{kind:"historical-only",recoveryAvailable:false}]) {
    const h=harness({api:{previewDirectoryResource:async()=>({ok:true,kind:"existing",disposition})}});await h.workspace.load();await click(h.find('[data-directory-preview]'));
    assert.equal(h.find('[data-directory-commit]'),null);assert.equal(h.calls.commit.length,0);assert.equal(h.find('[data-directory-disposition]').attributes["data-directory-disposition"],disposition.kind);h.workspace.dispose();
  }
});
test("recheck maps only chosen fields and explicit ownership choices and organization declaration", async () => {
  const h=harness({record});await h.workspace.load();
  await change(h.find('[data-directory-copy-field="sourceUrl"]'),true);await change(h.find('[data-directory-source-choice]'),"listing");
  await change(h.find('[data-directory-ownership]'),"replace-all");await change(h.find('[data-directory-notes]'),"  Exact organization notes  ");
  await change(h.find('[data-directory-assess]'),true);await change(h.find('[data-directory-provider]'),"Legal provider");await change(h.find('[data-directory-reviewed]'),"2026-10-26");
  await click(h.find('[data-directory-preview]'));
  const p=h.calls.preview[0];assert.equal(p.intent,"recheck");assert.deepEqual(p.target,{recordId:record.id,revision:3,historyHeadSha256:binding.historyHeadSha256});assert.deepEqual(p.copiedFields,["sourceUrl"]);assert.deepEqual(p.limitations,{kind:"replace-all",adoptionNotes:"Exact organization notes"});
  assert.deepEqual(p.assessment,{providerName:"Legal provider",eligibility:"unknown",reviewedDate:"2026-10-26",renewalDate:null,cost:null,confirmationReference:null});
  assert.match(h.workspace.element.textContent,/Current custom organization text/);h.workspace.dispose();
});
test("recheck never infers declarations and refuses assessment without chosen source/date", async () => {
  const h=harness({record});await h.workspace.load();await click(h.find('[data-directory-preview]'));
  assert.equal(h.calls.preview[0].assessment,null);assert.deepEqual(h.calls.preview[0].copiedFields,[]);assert.deepEqual(h.calls.preview[0].limitations,{kind:"keep-current"});
  await change(h.find('[data-directory-assess]'),true);await click(h.find('[data-directory-preview]'));assert.equal(h.calls.preview.length,1);assert.match(h.workspace.element.textContent,/Select source URL/);h.workspace.dispose();
});
test("recovered binding requires fresh explicit adoption and partial evidence is labeled", async () => {
  const h=harness({record,api:{directoryResource:async()=>({binding:{...binding,originMode:"recovered"},events:[{...event,provenance:"recovered"}],disposition:{kind:"active-record",record},nextCursor:null})}});
  await h.workspace.load();assert.match(h.workspace.element.textContent,/Recovered history is inert/);await click(h.find('[data-directory-preview]'));assert.equal(h.calls.preview[0].intent,"adopt-recovered");
  await click(h.button("Download partial source evidence JSON"));assert.equal(h.calls.download.length,1);assert.match(h.calls.download[0][0],/partial-directory-evidence/);assert.match(h.workspace.element.textContent,/partial evidence/);h.workspace.dispose();
});
test("each ownership choice is exact, with no parsed or silently carried notes", async () => {
  const h=harness({record});await h.workspace.load();await change(h.find('[data-directory-ownership]'),"replace-mapped");await click(h.find('[data-directory-preview]'));assert.deepEqual(h.calls.preview.at(-1).limitations,{kind:"replace-mapped",notes:{kind:"keep"}});
  const selectors=h.workspace.element.querySelectorAll("select");const notesChoice=selectors.find(s=>s.children.some(o=>o.value==="set"));await change(notesChoice,"set");await change(h.find('[data-directory-notes]'),"");await click(h.find('[data-directory-preview]'));assert.deepEqual(h.calls.preview.at(-1).limitations,{kind:"replace-mapped",notes:{kind:"set",text:null}});h.workspace.dispose();
});
test("input invalidates before async preview hash resolves; stale preview cannot commit", async () => {
  const gate=deferred();let hashes=0;
  const h=harness({hash:async value=>++hashes===2?gate.promise:directoryHash(value)});await h.workspace.load();const preview=click(h.find('[data-directory-preview]'));
  await new Promise(resolve=>setImmediate(resolve));
  // A programmatic edit/change still invalidates while controls are busy.
  const control=h.find('[data-directory-source-choice]');control.disabled=false;await change(control,"listing");
  const plan=await makeReady(h.calls.preview[0]);gate.resolve(plan.plan.planSha256);await preview;
  assert.equal(h.find('[data-directory-commit]'),null);h.workspace.dispose();
});
test("source changes invalidate before asynchronous source hash returns", async () => {
  const gate=deferred(),h=harness({hash:()=>gate.promise});const load=h.workspace.load();await new Promise(resolve=>setImmediate(resolve));h.workspace.invalidate();gate.resolve(selection.entrySha256);await load;assert.equal(h.find('[data-directory-preview]'),null);h.workspace.dispose();
});
test("route, organization, session and editor changes prevent pending preview/save responses", async () => {
  for (const mode of ["route","editor","dispose","explicit"]) {
    const gate=deferred();const h=harness({api:{previewDirectoryResource:()=>gate.promise}});await h.workspace.load();const p=click(h.find('[data-directory-preview]'));await new Promise(resolve=>setImmediate(resolve));
    if(mode==="route")h.setCurrent(false);if(mode==="editor")h.setEditor(true);if(mode==="dispose")h.workspace.dispose();if(mode==="explicit")h.workspace.invalidate();
    gate.resolve(await makeReady({intent:"copy",selection,target:null}));await p;assert.equal(h.find('[data-directory-commit]'),null);assert.equal(h.calls.commit.length,0);h.workspace.dispose();
  }
});
test("lost save response retains exact key/proof/proposal; one command in flight and exact Retry", async () => {
  const gate=deferred(),bodies=[];let attempt=0;
  const h=harness({api:{commitDirectoryResource:async(org,b)=>{bodies.push(copy(b));if(++attempt===1){await gate.promise;throw Object.assign(new Error("offline"),{status:0,code:"connection_interrupted"});}return {ok:true,kind:"existing",disposition:{kind:"active-record",record}};}}});
  await h.workspace.load();await click(h.find('[data-directory-preview]'));const saving=click(h.find('[data-directory-commit]'));await click(h.find('[data-directory-commit]'));assert.equal(bodies.length,1);gate.resolve();await saving;assert.ok(h.find('[data-directory-retry]'));await click(h.find('[data-directory-retry]'));assert.deepEqual(bodies[0],bodies[1]);assert.match(h.workspace.element.textContent,/accepted/);h.workspace.dispose();
});
test("expired proof and non-UUIDv4 keys are never sent", async () => {
  const h=harness();await h.workspace.load();await click(h.find('[data-directory-preview]'));h.setTime(clock+600000);await click(h.find('[data-directory-commit]'));assert.equal(h.calls.commit.length,0);assert.match(h.workspace.element.textContent,/expired/);h.workspace.dispose();
  const k=harness({randomUUID:()=>"not-a-uuid"});await k.workspace.load();await click(k.find('[data-directory-preview]'));await click(k.find('[data-directory-commit]'));assert.equal(k.calls.commit.length,0);assert.match(k.workspace.element.textContent,/UUIDv4/);k.workspace.dispose();
});
test("known stale refusal clears proof and retry, while edits clear interrupted command identity", async () => {
  const h=harness({api:{commitDirectoryResource:async()=>{throw Object.assign(new Error("Record changed"),{status:409});}}});await h.workspace.load();await click(h.find('[data-directory-preview]'));await click(h.find('[data-directory-commit]'));assert.equal(h.find('[data-directory-retry]'),null);assert.equal(h.find('[data-directory-commit]'),null);assert.match(h.workspace.element.textContent,/fresh preview/);h.workspace.dispose();
});
test("actual API wrappers send exact routes/no-store/CSRF and no provider request", async () => {
  const original=globalThis.fetch,calls=[];globalThis.fetch=async(path,options)=>{calls.push({path,options});return new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json"}});};
  try {setCsrfToken("fictional-csrf");await api.directoryCatalogs();await api.directoryEntry(selection);await api.directoryResource("org A","r/1","opaque-cursor");await api.previewDirectoryResource("org A",{intent:"copy"});await api.commitDirectoryResource("org A",{previewToken:"exact",commandKey:key,proposal:{intent:"copy"}});await api.exportDirectoryResource("org A","r/1");
    assert.equal(calls[1].path,`/api/directory-resources/catalogs/${selection.captureId}/tools/fictional-tool`);assert.match(calls[2].path,/\/api\/orgs\/org%20A\/directory-resources\/records\/r%2F1\?cursor=/);assert.equal(calls[3].options.headers["X-CSRF-Token"],"fictional-csrf");assert.equal(calls[4].options.method,"POST");assert.equal(JSON.parse(calls[4].options.body).commandKey,key);assert.ok(calls.every(c=>c.path.startsWith("/api/")&&c.options.cache==="no-store"));
  } finally {globalThis.fetch=original;setCsrfToken("");}
});
test("actual app binds only writer Resource history and invalidates on route/editor/org/sign-out",async()=>{
  const app=await readFile(new URL("./app.js",import.meta.url),"utf8");
  assert.match(app,/moduleId === "resources" && can\(module, "write", role\(\)\)/);assert.match(app,/directorySelectionFromFragment\(location.hash\)/);assert.match(app,/Destination organization/);assert.match(app,/state\.session === session/);
  for(const marker of ['async function route()', 'async function openRecordEditor(', '$("#org-switch").addEventListener', 'window.addEventListener("hashchange"', '"Sign out"']) {const pos=app.indexOf(marker);assert.ok(pos>=0);assert.match(app.slice(pos,pos+1200),/directoryResourceWorkspace\?\.invalidate\(\)/);}
  const source=await readFile(new URL("./directory-resources.js",import.meta.url),"utf8");assert.doesNotMatch(source,/localStorage|sessionStorage|90\s*\*|90-day|setInterval|providerFetch/);
});
test("assessment records exact zero and unknown money without importing directory cost prose", async () => {
  for (const [mode,expected] of [["amount",{minor:0,currency:"USD",precision:2}],["unknown",{minor:null,currency:"USD",precision:2}]]) {
    const h=harness({record});await h.workspace.load();await change(h.find('[data-directory-copy-field="sourceUrl"]'),true);await change(h.find('[data-directory-source-choice]'),"source:0");await change(h.find('[data-directory-assess]'),true);await change(h.find('[data-directory-reviewed]'),"2026-10-26");await change(h.find('[data-directory-cost-kind]'),mode);await change(h.find('[data-directory-currency]'),"USD");await change(h.find('[data-directory-amount]'),"0.00");await click(h.find('[data-directory-preview]'));assert.deepEqual(h.calls.preview[0].assessment.cost,expected);h.workspace.dispose();
  }
});
test("earlier source history pages preserve current head target and allow explicit exact historical inspection", async () => {
  let reads=0;const h=harness({record,api:{directoryResource:async(org,id,cursor)=>({binding,events:[{...event,packet:{...event.packet,sequence:++reads===1?25:1}}],disposition:{kind:"active-record",record},nextCursor:cursor?null:"earlier-page"})}});
  await h.workspace.load();await click(h.button("Load more source history"));assert.equal(reads,2);await click(h.find('[data-directory-preview]'));assert.equal(h.calls.preview[0].target.historyHeadSha256,binding.historyHeadSha256);assert.match(h.workspace.element.textContent,/Source event 25/);assert.match(h.workspace.element.textContent,/Source event 1/);h.workspace.dispose();
});
test("actual app chooser requires an explicit writable organization and ignores a stale choice response", async () => {
  const source=await readFile(new URL("./app.js",import.meta.url),"utf8");
  const helpers=source.slice(source.indexOf("function node("),source.indexOf("const loading ="));
  const chooser=source.slice(source.indexOf("async function renderDirectoryCopy("),source.indexOf("function renderCreateOrganization("));
  const content=new Element("main"),gate=deferred(),mounts=[];
  const state={session:{user:{id:"actor1"}},org:"previous",orgs:[{id:"previous",name:"Previous",role:"owner"},{id:"destination",name:"Chosen destination",role:"owner"},{id:"board",name:"Board only",role:"board"}],epoch:4,currencies:{USD:2},editor:null};
  const context=vm.createContext({Node:Element,document:globalThis.document,state,DIRECTORY_VISIBILITY_NOTICE,location:{hash:directoryFragment(selection)},directorySelectionFromFragment,ApiError:Error,
    moduleById:()=>({}),can:(_module,_action,role)=>role==="owner",showError:e=>{throw e},
    createDirectoryResourceWorkspace:options=>{mounts.push(options);return {element:new Element("section"),load:async()=>{},dispose(){},invalidate(){}};},
    setContent:(...children)=>content.replaceChildren(...children),heading:()=>new Element("h1"),notice:()=>new Element("p"),
    action:async(fn,control)=>{control.disabled=true;try{await fn()}finally{control.disabled=false}},loadMembers:()=>gate.promise,renderOrgControl(){},invalidateModules(){},rememberOrg(){},showTrash(){},download(){},api:{},
  });
  vm.runInContext(`${helpers}\n${chooser}\nglobalThis.runChooser=renderDirectoryCopy`,context);
  await context.runChooser(4);const choice=content.querySelector('[data-directory-org-choice]');const choose=content.querySelectorAll("button").find(b=>b.textContent==="Inspect for this organization");
  assert.equal(choice.value,"");assert.equal(choice.children.some(o=>o.value==="board"),false);await click(choose);assert.equal(mounts.length,0);
  choice.value="destination";const pending=click(choose);await new Promise(resolve=>setImmediate(resolve));await change(choice,"previous");gate.resolve();await pending;assert.equal(mounts.length,0);
  await click(choose);assert.equal(mounts.length,1);assert.equal(mounts[0].orgId,"previous");assert.deepEqual(copy(mounts[0].initialSelection),selection);assert.equal(state.org,"previous");
});
test("organization-wide visibility is explicit before preview and program scopes offer no false picker",async()=>{
  const h=harness();await h.workspace.load();assert.match(h.workspace.element.textContent,/Resources belong to the whole organization/);assert.match(h.workspace.element.textContent,/Program scopes do not narrow Resource visibility/);assert.equal(h.workspace.element.querySelector('[data-program-picker]'),null);h.workspace.dispose();
});
test("current bundled in-app listing picker enters the same exact source/org-choice route without writes",async()=>{
  const core={format:"charitology-directory-capture",version:1,sourceCommit:"b".repeat(40),capturedAt:"2026-10-27T00:00:00.000Z",catalogs:[{kind:"tools",entries:[{listingId:selection.listingId,entrySha256:selection.entrySha256}]},{kind:"benefits",entries:[]}]};
  const captureId=await directoryHash({namespace:"charitology:directory-capture:v1",core});let reads=0;
  const picker=createDirectoryCatalogPicker({api:{directoryCatalogs:async(cursor)=>{reads++;return {registrySha256:"c".repeat(64),head:{captureId},captures:cursor?[{captureId,core}]:[],nextCursor:cursor?null:"next-page"};}}});
  assert.equal(reads,0);await click(picker.element.querySelectorAll("button")[0]);assert.equal(reads,2);
  const choice=picker.element.querySelector('[data-directory-catalog-selection]');await change(choice,directoryFragment({...selection,captureId}));
  const review=picker.element.querySelectorAll("a")[0];assert.deepEqual(directorySelectionFromFragment(review.attributes.href),{...selection,captureId});assert.match(picker.element.textContent,/Nothing has been copied/);
  const app=await readFile(new URL("./app.js",import.meta.url),"utf8");assert.match(app,/id === "resources" && can\(module, "write", role\(\)\)[\s\S]*?createDirectoryCatalogPicker/);assert.match(app,/directoryCatalogPicker\?\.element/);
});
test("stale server revision409 preserves notes until explicit parent dirty-confirmed reload then fresh preview",async()=>{
  const app=await readFile(new URL("./app.js",import.meta.url),"utf8");
  const actualReload=app.match(/onReload: async \(\) => \{([\s\S]*?)\n          \},/)[1];
  let acceptDiscard=false,confirms=0,fresh=null,h;
  const context=vm.createContext({discardEditor:async()=>true,discardPage:async()=>{confirms++;return acceptDiscard;},route:async()=>{h.workspace.dispose();fresh=harness({record:{...record,revision:4}});await fresh.workspace.load();}});
  const reload=vm.runInContext(`(async()=>{${actualReload}})`,context);
  h=harness({record,onReload:reload,api:{commitDirectoryResource:async()=>{throw Object.assign(new Error("The saved Resource changed"),{status:409,code:"directory_stale"});}}});
  await h.workspace.load();await change(h.find('[data-directory-notes]'),"Retain my unsaved organization notes");await click(h.find('[data-directory-preview]'));await click(h.find('[data-directory-commit]'));
  assert.equal(h.find('[data-directory-notes]').value,"Retain my unsaved organization notes");await click(h.button("Inspect this exact source again"));assert.match(h.workspace.element.textContent,/use Reload current Resource/);
  await click(h.find('[data-directory-reload]'));assert.equal(confirms,1);assert.equal(fresh,null);assert.equal(h.find('[data-directory-notes]').value,"Retain my unsaved organization notes");
  acceptDiscard=true;await click(h.find('[data-directory-reload]'));assert.equal(confirms,2);await click(fresh.find('[data-directory-preview]'));assert.equal(fresh.calls.preview[0].target.revision,4);assert.ok(fresh.find('[data-directory-commit]'));fresh.workspace.dispose();
});
test("a409during preview also offers current Resource reload and keeps it available while notes are copied",async()=>{
  let reloads=0;const h=harness({record,onReload:async()=>{reloads++;},api:{previewDirectoryResource:async()=>{throw Object.assign(new Error("The target revision changed"),{status:409});}}});
  await h.workspace.load();await click(h.find('[data-directory-preview]'));assert.ok(h.find('[data-directory-reload]'));await change(h.find('[data-directory-notes]'),"Text still kept");assert.ok(h.find('[data-directory-reload]'));await click(h.find('[data-directory-reload]'));assert.equal(reloads,1);assert.equal(h.find('[data-directory-notes]').value,"Text still kept");h.workspace.dispose();
});

test("contributors retain source, writing and recheck without an unavailable export control",async()=>{
  const h=harness({record,canExport:false});await h.workspace.load();assert.equal(h.button("Download partial source evidence JSON"),undefined);assert.ok(h.find('[data-directory-preview]'));assert.match(h.workspace.element.textContent,/Source event 1/);await click(h.find('[data-directory-preview]'));assert.equal(h.calls.preview[0].intent,"recheck");assert.ok(h.find('[data-directory-commit]'));assert.match(h.workspace.element.textContent,/Source event 1/);h.workspace.dispose();
  for(const canExport of[undefined,false,"true"]){const no=harness({record,canExport});await no.workspace.load();assert.equal(no.button("Download partial source evidence JSON"),undefined);no.workspace.dispose();}
  const exporter=harness({record,canExport:true});await exporter.workspace.load();await click(exporter.button("Download partial source evidence JSON"));assert.equal(exporter.calls.download.length,1);exporter.workspace.dispose();
  const app=await readFile(new URL("./app.js",import.meta.url),"utf8");assert.ok(app.includes('canExport: can(moduleById("resources"), "export", destination.role)'));assert.ok(app.includes('canExport: can(module, "export", role())'));
});
