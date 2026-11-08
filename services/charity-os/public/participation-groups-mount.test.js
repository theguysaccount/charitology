/** Actual staff workspace + actual group pane; fictional DOM and transport only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createStaffParticipationWorkspace} from './participation.js';
const SHA='a'.repeat(64),STAMP='2026-11-08T12:00:00.123456Z';
class E {
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.attributes=this.attrs;this.events=new Map();this.disabled=false;this.hidden=false;this.checked=false;this.isConnected=false;this._value='';this.classList={toggle(){}};}
 setAttribute(k,v){this.attrs[k]=String(v);if(k==='id')this.id=String(v);if(k==='value')this.value=v;if(k==='hidden')this.hidden=true;}
 get value(){return this.tagName==='SELECT'?(this._selected??this.all().find(x=>x.tagName==='OPTION')?.attrs.value??''):this._value;}
 set value(v){if(this.tagName==='SELECT')this._selected=this.all().some(x=>x.tagName==='OPTION'&&x.attrs.value===String(v))?String(v):'';else this._value=String(v);}
 connect(on){this.isConnected=on;if(!on&&document.activeElement===this)document.activeElement=null;for(const c of this.children)if(c instanceof E)c.connect(on);}
 append(...xs){for(let x of xs){if(!(x instanceof E))x=String(x);if(x instanceof E){x.parentElement=this;x.connect(this.isConnected);}this.children.push(x);}}
 replaceChildren(...xs){for(const c of this.children)if(c instanceof E){c.connect(false);c.parentElement=null;}this.children=[];this.append(...xs);}
 all(){return this.children.flatMap(x=>x instanceof E?[x,...x.all()]:[]);}
 get textContent(){return this.children.map(x=>x instanceof E?x.textContent:String(x)).join('');}
 set textContent(v){this.replaceChildren(String(v));}
 addEventListener(t,fn){const a=this.events.get(t)||[];a.push(fn);this.events.set(t,a);}
 emit(t){if(this.disabled)return;for(const fn of this.events.get(t)||[])Promise.resolve(fn({preventDefault(){},currentTarget:this})).catch(e=>{throw e;});}
 querySelectorAll(selector){const ss=selector.split(',').map(x=>x.trim());return this.all().filter(x=>ss.some(s=>s[0]==='#'?x.id===s.slice(1):s[0]==='.'?(x.attrs.class||'').split(/\s+/).includes(s.slice(1)):x.tagName===s.toUpperCase()));}
 querySelector(s){return this.querySelectorAll(s)[0]||null;}
 contains(x){return x===this||this.all().includes(x);}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);this.connect(false);}
 focus(){if(this.isConnected)document.activeElement=this;}
 scrollIntoView(){} reportValidity(){return true;}
}
class Doc extends EventTarget{constructor(){super();this.hidden=false;this.activeElement=null;}createElement(t){return new E(t);}createTextNode(v){return String(v);}}
const terms={title:'Fictional shift',kind:'shift',startAt:'2099-01-01T12:00:00Z',endAt:'2099-01-01T14:00:00Z',timeZone:'UTC',participationPurpose:'Fictional organizing only.',participantInstructions:'No actual participants.'};
function target(id='target'){return {targetId:id,moduleId:'volunteers',title:'First\nShift\tName',revision:3,mode:'managed',sourceRevision:5,terms,termsHash:SHA};}
function row(n,patch={}){return {id:'p'+String(n).padStart(4,'0'),targetId:'target',moduleId:'volunteers',revision:2,state:n===2?'waitlisted':'requested',source:'staff',recovered:false,bookingRecordId:'booking'+n,contactId:'contact'+n,candidateRevision:2,candidateApproved:true,consent:null,canCancel:true,...patch};}
const page=()=>({ok:true,targetId:'target',groups:[],nextCursor:null});
function created(body){const ids=body.members.map(x=>x.participationId);return {ok:true,replayed:true,acceptedAtExact:STAMP,accepted:{groupId:'group',groupRevision:1,state:'draft',target:{targetId:'target',moduleId:'volunteers'},rosterIds:ids,coordinatorIntakeId:body.coordinatorIntakeId},currentDisposition:{groupId:'group',groupRevision:1,state:'draft',members:ids.map(participationId=>({participationId,revision:2,state:participationId==='p0002'?'waitlisted':'requested'}))}};}
const group=()=>({ok:true,targetId:'target',group:{groupId:'group',groupRevision:1,state:'draft',originMode:'live',coordinatorIntakeId:null,roster:[1,2].map(n=>({participationId:row(n).id,label:'Fictional authorized '+n,revision:2,state:row(n).state,admitted:false}))}});
async function mounted(run,{rows=[row(1),row(2),row(3)],admin=true}={}){
 const old={document:globalThis.document,window:globalThis.window,Node:globalThis.Node};globalThis.document=new Doc();globalThis.window=new EventTarget();globalThis.Node=E;
 let active=true,allRows=rows,sourceRevision=7,hook=null,root;const calls=[],changes=[],dirty=[];
 const request=async(path,o={})=>{const call={path,method:o.method||'GET',body:o.body&&structuredClone(o.body),wire:o.body&&JSON.stringify(o.body),signal:o.signal};calls.push(call);if(hook){const result=await hook(path,o);if(result!==undefined)return result;}
  if(path==='/api/orgs/org/participation-targets')return {ok:true,targets:[target(),target('other')]};
  if(path==='/api/orgs/org/participation-targets/target'||path==='/api/orgs/org/participation-targets/other'){const id=path.split('/').at(-1);return {ok:true,target:target(id),terms,termsHash:SHA,currentSourceRevision:sourceRevision,sourceApproved:true,capacity:10,occupied:0,canAdopt:false,preview:{legacyHash:SHA,occupants:[],issues:[]}};}
  if(path.startsWith('/api/orgs/org/participation-targets/target/participations')){const cursor=new URL('https://example.invalid'+path).searchParams.get('cursor'),start=cursor?allRows.findIndex(x=>x.id===cursor)+1:0,values=allRows.slice(start,start+20);return {ok:true,participations:structuredClone(values),nextCursor:start+20<allRows.length?values.at(-1).id:null};}
  if(path==='/api/orgs/org/participation-targets/other/participations')return {ok:true,participations:[],nextCursor:null};
  if(path.startsWith('/api/orgs/org/participation-groups?'))return page();
  if(path==='/api/orgs/org/participation-groups/group')return group();
  if(path==='/api/orgs/org/participation-delivery')throw Object.assign(Error('Fictional delivery unavailable'),{status:404});
  throw Error('Unexpected fictional route '+path);
 };
 const flush=async()=>{for(let i=0;i<16;i++)await new Promise(r=>setImmediate(r));};
 try{root=await createStaffParticipationWorkspace({orgId:'org',admin,request,loadRecords:async()=>[],isCurrent:()=>active,onChanged:()=>changes.push(true),onDirty:v=>dirty.push(v),initialTargetId:'target'});root.connect(true);await flush();const h={root,calls,changes,dirty,flush,text:()=>root.textContent,all:()=>root.all(),pane:()=>root.all().find(x=>x.attrs['aria-label']==='Staff group participation'),button:name=>root.all().find(x=>x.tagName==='BUTTON'&&x.textContent===name),field:name=>root.all().find(x=>x.attrs['aria-label']===name),hook:fn=>hook=fn,rows:value=>allRows=value,sourceRevision:value=>sourceRevision=value,inactive:()=>active=false,
  click:async name=>{const b=h.button(name);assert(b,'Missing button '+name);assert.equal(b.disabled,false,'Disabled button '+name);b.emit('click');await flush();},
  check:async(name,value=true)=>{const x=h.field(name);assert(x,'Missing checkbox '+name);x.checked=value;x.emit('change');await flush();},
  picker:async id=>{const x=root.querySelector('#participation-target-picker');x.value=id;x.emit('change');await flush();},
 };await run(h);
 }finally{root?.dispose();globalThis.document=old.document;globalThis.window=old.window;globalThis.Node=old.Node;}
}
async function choose(h){await h.check('Group member p0001');await h.check('Group member p0002');}
function writes(h){return h.calls.filter(x=>x.method==='POST');}

test('staff group tools are manually opened, use current source revision and display-only whitespace, with no inferred candidate names',async()=>mounted(async h=>{
 assert.equal(h.calls.filter(x=>x.path.includes('participation-groups')).length,0);await h.click('Open staff group tools');assert(h.pane());assert(h.button('Save group draft')); /* Strict child target admission would reject raw TAB/LF. */assert(h.field('Group member p0001'));assert(h.field('Group member p0002'));assert(!h.field('Group member p0003'));assert(!h.field('Group member p0004'));assert(!h.field('Group member p0005'));await choose(h);h.hook(async(p,o)=>p==='/api/orgs/org/participation-groups'&&o.method==='POST'?created(o.body):undefined);await h.click('Save group draft');assert.deepEqual(writes(h)[0].body.target,{targetId:'target',targetRevision:3,sourceRevision:7});assert.equal(h.changes.length,1);assert.equal(h.root.hasPendingGroupCommand(),false);assert.equal(h.root.hasUnsavedChanges(),false);
},{rows:[row(1),row(2),row(3,{state:'confirmed'}),row(4,{source:'legacy'}),row(5,{recovered:true})]}));

test('same-target refresh keeps one pane and exact unknown command; only explicit Retry resends identical bytes',async()=>mounted(async h=>{
 await h.click('Open staff group tools');const pane=h.pane();await choose(h);h.hook(async(p,o)=>{if(p==='/api/orgs/org/participation-groups'&&o.method==='POST')throw Error('Fictional response loss');});await h.click('Save group draft');assert(h.root.hasPendingGroupCommand());const wire=writes(h)[0].wire;await h.click('Refresh group tools');assert.equal(h.pane(),pane);assert.equal(writes(h).length,1);assert(h.button('Retry exact command'));h.hook(async(p,o)=>p==='/api/orgs/org/participation-groups'&&o.method==='POST'?created(o.body):undefined);await h.click('Retry exact command');assert.equal(writes(h).length,2);assert.equal(writes(h)[1].wire,wire);assert.equal(h.changes.length,1);assert.equal(h.pane(),pane);assert(!h.root.hasPendingGroupCommand());
}));

test('an unknown group command blocks conflicting target and individual forms with an accurate reconciliation warning',async()=>mounted(async h=>{
 await h.click('Open staff group tools');await choose(h);h.hook(async(p,o)=>{if(o.method==='POST')throw Error('Fictional response loss');});await h.click('Save group draft');const pane=h.pane();await h.picker('other');assert.equal(h.root.querySelector('#participation-target-picker').value,'target');assert.equal(h.pane(),pane);assert(h.text().includes('may already be saved'));assert.equal(h.calls.filter(x=>x.path.endsWith('/other')).length,0);await h.click('Confirm one place');assert(!h.text().includes('Confirm this one person'));assert(h.root.hasUnsavedChanges());assert.equal(writes(h).length,1);
}));

test('group-only unsaved selection contributes to the page guard and explicit discard permits another target',async()=>mounted(async h=>{
 await h.click('Open staff group tools');await h.check('Group member p0001');assert(h.root.hasUnsavedChanges());assert.equal(h.dirty.at(-1),true);await h.picker('other');assert(h.button('Discard and continue'));assert(h.text().includes('Saved decisions remain saved'));assert(h.pane());await h.click('Keep editing');assert(h.root.hasUnsavedChanges());await h.picker('other');await h.click('Discard and continue');assert(!h.pane());assert.equal(h.root.querySelector('#participation-target-picker').value,'other');assert.equal(h.root.hasUnsavedChanges(),false);
}));

test('fresh candidate prefix replaces old loaded pages and invalidates missing selections without silently dropping them',async()=>mounted(async h=>{
 await h.click('Load more participation entries');await h.click('Open staff group tools');await h.check('Group member p0001');await h.click('Next candidate page');await h.check('Group member p0021');const start=h.calls.length;const changed=Array.from({length:21},(_,i)=>row(i+2,{revision:9}));h.rows(changed);h.sourceRevision(8);await h.click('Refresh group tools');const reads=h.calls.slice(start).filter(x=>x.path.includes('/participations'));assert.equal(reads.length,2);assert(!reads[0].path.includes('cursor='));assert(h.text().includes('selection was retained'));assert(h.button('Save group draft').disabled);await h.click('Clear draft selection');assert.equal(h.root.hasUnsavedChanges(),false);
},{rows:Array.from({length:21},(_,i)=>row(i+1))}));

test('failed same-target refresh never readmits private group DOM or sends an unknown command automatically',async()=>mounted(async h=>{
 await h.click('Open staff group tools');await choose(h);h.hook(async(p)=>{if(p.endsWith('/target'))throw Object.assign(Error('Fictional access lost'),{status:403});});await h.click('Refresh group tools');assert.equal(h.pane().textContent,'');assert(h.button('Refresh group tools'));assert(h.root.hasUnsavedChanges());assert.equal(writes(h).length,0);h.hook(null);await h.click('Refresh group tools');assert(h.field('Group member p0001').checked);assert(h.field('Group member p0002').checked);
}));

test('pagehide aborts an owned prefix read and late results cannot restore group DOM; visible is inert until manual refresh',async()=>mounted(async h=>{
 await h.click('Open staff group tools');let release;h.hook((p)=>p.endsWith('/participations')?new Promise(r=>release=()=>r({ok:true,participations:[row(1),row(2)],nextCursor:null})):undefined);await h.click('Refresh group tools');const req=h.calls.at(-1);window.dispatchEvent(new Event('pagehide'));assert(req.signal.aborted);assert.equal(h.pane().textContent,'');release();await h.flush();assert.equal(h.pane().textContent,'');const count=h.calls.length;document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));await h.flush();assert.equal(h.calls.length,count);h.hook(null);await h.click('Refresh group tools');assert(h.field('Group member p0001'));
}));

test('hidden pause and disposal clear owned private controls, abort requests and reject late callbacks',async()=>mounted(async h=>{
 await h.click('Open staff group tools');await choose(h);let release;h.hook((p,o)=>o.method==='POST'?new Promise(r=>release=()=>r(created(o.body))):undefined);await h.click('Save group draft');const req=writes(h)[0];document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert(req.signal.aborted);assert.equal(h.pane().textContent,'');assert(h.root.hasPendingGroupCommand());h.root.dispose();release();await h.flush();assert.equal(h.changes.length,0);assert.equal(h.root.hasPendingGroupCommand(),false);assert.equal(document.activeElement,null);const count=h.calls.length;document.hidden=false;window.dispatchEvent(new Event('pagehide'));document.dispatchEvent(new Event('visibilitychange'));assert.equal(h.calls.length,count);
}));

test('obsolete parent context cannot accept a late group create or invoke saved callbacks',async()=>mounted(async h=>{
 await h.click('Open staff group tools');await choose(h);let release;h.hook((p,o)=>o.method==='POST'?new Promise(r=>release=()=>r(created(o.body))):undefined);await h.click('Save group draft');h.inactive();release();await h.flush();assert.equal(h.changes.length,0);assert(h.root.hasPendingGroupCommand());
}));

test('actual app page guard prevents ordinary navigation and permits only deliberate sign-out discard of a pending RAM Retry',async()=>{
 const source=readFileSync(new URL('./app.js',import.meta.url),'utf8');const start=source.indexOf('async function discardPage('),end=source.indexOf('\nfunction configureEditor',start);assert(start>0&&end>start);let reconciled=0,confirmed=false;const notices=[],prompts=[];const state={pageDirty:true,participationWorkspace:{hasPendingGroupCommand:()=>true,reconcilePendingGroup:()=>reconciled++}};const context=vm.createContext({state,toast:t=>notices.push(t),confirmAction:async(...args)=>{prompts.push(args);return confirmed;}});vm.runInContext(source.slice(start,end)+';globalThis.guard=discardPage;',context);
 assert.equal(await context.guard(),false);assert.equal(reconciled,1);assert.equal(prompts.length,0);assert.equal(await context.guard({signingOut:true}),false);assert.equal(state.pageDirty,true);confirmed=true;assert.equal(await context.guard({signingOut:true}),true);assert.equal(state.pageDirty,false);assert(prompts[1][1].includes('may already be saved'));assert(prompts[1][1].includes('no command will be resent automatically'));assert(!prompts[1][1].includes('remain unchanged'));assert.match(source,/Sign out[\s\S]*?discardPage\(\{ signingOut: true \}\)/);
});

test('stale discard prompt cannot erase a group command begun after the prompt opened',async()=>mounted(async h=>{
 await h.click('Open staff group tools');
 await choose(h);
 const pane=h.pane();
 await h.picker('other');
 const oldDiscard=h.button('Discard and continue');
 assert(oldDiscard?.isConnected);
 h.hook(async(p,o)=>{if(p==='/api/orgs/org/participation-groups'&&o.method==='POST')throw Error('Fictional response loss after prompt');});
 await h.click('Save group draft');
 const wire=writes(h)[0].wire;
 assert(h.root.hasPendingGroupCommand());
 oldDiscard.emit('click');
 await h.flush();
 assert(h.root.hasPendingGroupCommand(),'A stale prompt must retain the newly unknown exact command');
 assert.equal(h.pane(),pane);
 assert.equal(h.root.querySelector('#participation-target-picker').value,'target');
 assert.equal(h.calls.filter(x=>x.path.endsWith('/other')).length,0);
 assert(h.text().includes('may already be saved'));
 h.hook(async(p,o)=>p==='/api/orgs/org/participation-groups'&&o.method==='POST'?created(o.body):undefined);
 await h.click('Refresh group tools');
 await h.click('Retry exact command');
 assert.equal(writes(h).at(-1).wire,wire);
 assert.equal(h.changes.length,1);
}));
