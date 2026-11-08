import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { createIncubatorBridgeWorkspace } from './incubator-bridge.js';
import { learningTestDOM } from './learning-test-dom.js';
import { incubatorHash as H } from '../lib/incubator-bridge-json.mjs';
import { inspectIncubatorNative, makeIncubatorSourceCapture, sourcePin, INCUBATOR_ADAPTER } from '../lib/incubator-native.mjs';
import { compileIncubatorCandidates, createdDescriptors, headPin, makeIncubatorEvent } from '../lib/incubator-bridge-model.mjs';
import { nativeFixture, nativeRow, programRecord, sourceFixture, eventFixture, mapping as authored, encode } from '../test/incubator-fixtures.mjs';
import { api as transport, setCsrfToken } from './api.js';

globalThis.crypto ||= webcrypto;
const AT = '2026-11-07T00:00:00.000Z', EXPIRES = '2026-11-07T00:10:00.000Z';
const COMMAND = '11111111-1111-4111-8111-111111111111';
// These are mounted UI/transport tests, not actual auth, DB, browser or pilot evidence.
function service() {
  const calls = [], program = programRecord(), sources = new Map(), previews = new Map();
  let inspected = null, previewNumber = 0;
  const recordPin = { recordId:program.id, revision:program.revision, dataSha256:H('program-data',program.data) };
  const api = {
    async records(...args) { calls.push({method:'records',args}); return {records:[program],cursor:null}; },
    async incubatorBindings(...args) { calls.push({method:'bindings',args}); return {bindings:[],nextCursor:null}; },
    async incubatorRecovered(...args) { calls.push({method:'recovered',args}); return {bindings:[],nextCursor:null}; },
    async inspectIncubatorSource(org,metadata,bytes,options) {
      calls.push({method:'inspect',org,metadata:structuredClone(metadata),bytes:bytes.slice(),options});
      const local = inspectIncubatorNative(bytes,{adapter:metadata.adapter,selection:metadata.selection});
      const prior=metadata.target.head?[...sources.values()].filter(row=>row.bindingId===metadata.target.head.bindingId).at(-1):null;
      const source = makeIncubatorSourceCapture(local,{originOrgId:org,bindingId:metadata.target.head?.bindingId??'binding-a',sourceVersion:prior?prior.sourceVersion+1:1,previousNativeSource:prior?sourcePin(prior):null,preparedAt:AT});
      sources.set(source.sha256,source);
      inspected = {inspectionId:'inspection-a',expiresAt:EXPIRES,source,target:metadata.target,program:{pin:recordPin,record:program},state:'changed',duplicates:[],canPreview:true};
      return structuredClone(inspected);
    },
    async previewIncubatorCopy(org,input,options) {
      calls.push({method:'preview',org,input:structuredClone(input),options});
      return prepare(org,input.mode,inspected.source,input.mapping,inspected.target.head??null,null);
    },
    async previewIncubatorAdoption(org,input,options) {
      calls.push({method:'adopt',org,input:structuredClone(input),options});
      return prepare(org,'adopt',sources.get(input.source.sha256),input.mapping,null,input.recoveredHead);
    },
    async commitIncubatorCopy(org,input,options) {
      calls.push({method:'commit',org,input:structuredClone(input),options});
      const entry = previews.get(input.previewId);
      return {kind:'created',result:{created:createdDescriptors(entry.event),head:headPin(entry.event),acceptedAt:AT},currentDisposition:entry.event.candidates.map(row=>({id:row.id,moduleId:'projects',disposition:'original',revision:1}))};
    },
  };
  function prepare(org,operation,source,mapping,head,recoveredHead) {
    const n = ++previewNumber, candidates = compileIncubatorCandidates({orgId:org,actorId:'actor-a',programId:program.id,projectId:'project-'+n,milestoneId:'milestone-'+n,mapping,records:[program]});
    const event = makeIncubatorEvent({originOrgId:org,bindingId:operation==='adopt'?'adopted-binding':source.bindingId,sequence:(head?.sequence??0)+1,previous:head,preparedAt:AT,actorId:'actor-a',program:recordPin,operation,source:sourcePin(source),recoveredHead,mapping,candidates});
    const response = {previewId:'preview-'+n,reviewSha256:H('review',event),expiresAt:EXPIRES,plan:{operation,source,program:{pin:recordPin,record:program},head,recoveredHead,mapping,candidates,duplicatePolicy:'refuse',duplicates:[],historicalSource:operation==='adopt',warning:operation==='adopt'?'Historical retained selection; original full file not present.':'Two new editable planned records will be created.'}};
    previews.set(response.previewId,{response,event}); return structuredClone(response);
  }
  return {api,calls,program,recordPin,sources,previews};
}
// Feature-local correction only: a real single SELECT accepts a value only when
// that option is actually present. The shared frozen DOM fixture stays unchanged.
function incubatorTestDOM() {
  const dom=learningTestDOM(), create=dom.document.createElement;
  dom.document.createElement=tag=>{
    const element=create(tag);
    if (element.tagName==='SELECT') {
      let explicitlyUnselected=false;
      Object.defineProperty(element,'value',{configurable:true,
        get(){const options=element.querySelectorAll('option'),selected=options.find(row=>row.selected);return selected?.value??(explicitlyUnselected?'':options[0]?.value??'');},
        set(value){let found=false;for(const option of element.querySelectorAll('option')){option.selected=!found&&option.value===String(value);if(option.selected)found=true;}explicitlyUnselected=!found;},
      });
    }
    return element;
  };
  return dom;
}
function harness(t,options={}) {
  const dom=incubatorTestDOM(), s=service(); let authorized=true, dirty=false, keyCount=0;
  const view=createIncubatorBridgeWorkspace({org:'org-a',actorId:'actor-a',api:s.api,administrator:true,isCurrent:()=>authorized,onDirty:value=>{dirty=value;},makeCommandKey:()=>{keyCount++;return COMMAND;},...options});dom.mount(view);
  t.after(()=>{view.dispose();dom.restore();});
  const get=name=>{const value=view.querySelector(`[data-incubator="${name}"]`);assert.ok(value,name);return value;};
  const picker=nativePicker(get('file'));
  async function set(name,value,type='input'){const c=get(name);if(typeof value==='boolean')c.checked=value;else c.value=value;await c.emit(type);}
  async function source() {
    await get('load').click(); await set('program',s.program.id,'change');
    await picker.choose(new File([encode(nativeFixture())],'fictional.json'));
    await set('project','native-project','change'); await set('milestone','native-milestone','change'); await set('privacy',true,'change');
    await get('inspect').click(); assert.equal(s.calls.filter(c=>c.method==='inspect').length,1);
  }
  async function author() {await set('project-title',authored.project.title);await set('project-deliverable','');await set('milestone-title',authored.milestone.title);await set('milestone-deliverable',authored.milestone.deliverable);await set('relationship',true);await set('reason',authored.relationship.reason);}
  async function preview(){await author();await get('preview-copy').click();assert.match(get('preview').textContent,/Every source, program/);await set('review',true,'change');}
  return {...dom,...s,view,get,picker,set,source,author,preview,revoke(){authorized=false;},get dirty(){return dirty;},get keyCount(){return keyCount;}};
}
function nativePicker(control) {
  let path='',files=[];
  Object.defineProperty(control,'value',{configurable:true,get:()=>path,set(value){assert.equal(value,'');path='';files=[];}});
  Object.defineProperty(control,'files',{configurable:true,get:()=>files});
  return {open:()=>control.click(),cancel:()=>control.emit('cancel'),async choose(file){await control.click();if(path===file.name)return control.emit('cancel');path=file.name;files=[file];await control.emit('change');},async empty(){files=[];await control.emit('change');}};
}
function historicalFixture(h,recovered=false) {
  const source=sourceFixture({org:recovered?'original-org':'org-a',binding:recovered?'original-binding':'binding-a'}),event=eventFixture(source,{org:source.originOrgId,binding:source.bindingId});
  const summary={originOrgId:source.originOrgId,bindingId:source.bindingId,originMode:recovered?'recovered':'live',programId:'program-a',head:headPin(event),source:sourcePin(source),selection:source.selection,nativeVersions:1,eventCount:1,currentDisposition:[]};
  const detail={binding:summary,source,nativeSources:[source],events:[{event,originMode:summary.originMode,acceptedReceipt:null}],nextCursor:null};
  h.sources.set(source.sha256,source);
  h.api[recovered?'incubatorRecovered':'incubatorBindings']=async()=>({bindings:[summary],nextCursor:null});
  h.api[recovered?'incubatorRecoveredHead':'incubatorBinding']=async()=>structuredClone(detail);
  return {source,event,summary,detail};
}

test('native option nodes make default new, refresh/adopt, loaded programs and saved row choices usable',async t=>{
  const h=harness(t),mode=h.get('mode');
  assert.equal(mode.value,'new','the visible deliberate action starts at New copied pair');
  assert.deepEqual(mode.querySelectorAll('option').map(row=>row.value),['','new','refresh','adopt']);
  assert.match(mode.textContent,/New copied pair/);assert.doesNotMatch(mode.textContent,/\[object/);
  for(const value of ['refresh','adopt','new']){mode.value=value;assert.equal(mode.value,value);}
  mode.value='unavailable-action';assert.equal(mode.value,'','an absent option cannot become a selected value');mode.value='new';
  await h.get('load').click();const program=h.get('program');
  assert.equal(program.value,'','a loaded program is still a deliberate choice');
  assert.equal(program.querySelectorAll('option').find(row=>row.value===h.program.id)?.textContent,`${h.program.data.title} — ${h.program.id}, revision ${h.program.revision}`);
  program.value=h.program.id;assert.equal(program.value,h.program.id);program.value='missing-program';assert.equal(program.value,'');
  await h.picker.choose(new File([encode(nativeFixture())],'fictional.json'));
  for(const [name,value] of [['project','native-project'],['milestone','native-milestone']]){
    const select=h.get(name);assert.ok(select.querySelectorAll('option').some(row=>row.value===value));assert.doesNotMatch(select.textContent,/\[object/);
    select.value=value;assert.equal(select.value,value);select.value='missing-native-row';assert.equal(select.value,'');
  }
});
for(const historical of [false,true]) test(`${historical?'inactive recovered':'live'} history presents actual ordinary project and milestone links, not stringified nodes`,async t=>{
  const h=harness(t),old=historicalFixture(h,historical);await h.get('load').click();
  await h.set(historical?'recovered':'binding',historical?old.summary.head.sha256:old.summary.bindingId,'change');
  await h.get(historical?'read-recovered':'read-history').click();
  const links=h.get('history').querySelectorAll('a');
  assert.deepEqual(links.map(row=>row.getAttribute('href')),old.event.candidates.map(row=>`#module/projects/${row.id}`),'each ordinary editor link is a usable anchor node');
  assert.match(links[0].textContent,/ordinary project/);assert.match(links[1].textContent,/ordinary milestone/);
  assert.doesNotMatch(h.get('history').textContent,/\[object/);
});

test('real native admission, exact ProgramPin and normalized two-record preview are distinct from literal authorship',async t=>{
  const h=harness(t);assert.equal(h.calls.length,0,'constructor has no network/storage work');
  await h.source();const call=h.calls.find(c=>c.method==='inspect');
  assert.deepEqual(call.metadata,{version:1,adapter:INCUBATOR_ADAPTER,selection:{projectId:'native-project',milestoneId:'native-milestone'},target:{kind:'new',program:h.recordPin,duplicatePolicy:'refuse'}});
  assert.match(h.get('source').textContent,/deliberately unmatched/);
  await h.preview();
  const response=[...h.previews.values()][0].response;
  assert.equal(response.plan.candidates[0].data.title,'Authored project');assert.equal(h.get('project-title').value,authored.project.title);
  assert.equal(response.plan.mapping.milestone.deliverable,authored.milestone.deliverable);
  assert.equal(response.plan.candidates[1].data.projectId,response.plan.candidates[0].id);
  assert.equal(response.plan.candidates[0].status,'planned');assert.equal(response.plan.candidates[0].approval,null);
  assert.equal(h.get('commit').disabled,false);await h.get('commit').click();assert.equal(h.keyCount,1);
  assert.equal(h.get('saved').querySelectorAll('a').length,2);assert.match(h.get('saved').textContent,/original/);assert.equal(h.dirty,false);
});
test('author changes invalidate only outgoing review, preserve inspected source and require a new explicit preview',async t=>{
  const h=harness(t);await h.source();await h.preview();
  await h.set('reason','  Changed relation\n😀  ');assert.equal(h.get('preview').textContent,'');assert.equal(h.view.querySelector('[data-incubator="commit"]'),null);
  await h.get('preview-copy').click();assert.equal(h.calls.filter(c=>c.method==='inspect').length,1);assert.equal(h.calls.filter(c=>c.method==='preview').length,2);
  assert.equal([...h.previews.values()].at(-1).response.plan.mapping.relationship.reason,'  Changed relation\n😀  ');
});
test('cancelled/empty/failed/same-path choices preserve literal writing while invalidating preview authority',async t=>{
  const h=harness(t);await h.source();await h.preview();const literal='  Writing\n😀  ';await h.set('project-deliverable',literal);
  await h.picker.open();await h.picker.cancel();assert.equal(h.get('project-deliverable').value,literal);assert.equal(h.get('preview').textContent,'');
  await h.picker.choose(new File([encode(nativeFixture())],'fictional.json'));assert.equal(h.get('project-deliverable').value,literal);assert.equal(h.get('project').value,'native-project');
  await h.picker.empty();assert.equal(h.get('project-deliverable').value,literal);
  await h.picker.choose(new File(['{bad'],'fictional.json'));assert.match(h.get('status').textContent,/JSON|strict|native|complete/i);assert.equal(h.get('project-deliverable').value,literal);
  assert.equal(h.calls.filter(c=>c.method==='inspect').length,1,'no selection automatically uploads');
});
test('a newer file choice suppresses an older arrayBuffer success and error without overwriting its writing',async t=>{
  const h=harness(t);await h.source();await h.author();let resolve;
  const old={name:'old.json',size:encode(nativeFixture()).length,arrayBuffer:()=>new Promise(r=>{resolve=r;})};
  const waiting=h.picker.choose(old);await new Promise(r=>setImmediate(r));
  await h.picker.open();await h.picker.cancel();resolve(encode(nativeFixture()).buffer);await waiting;
  assert.match(h.get('status').textContent,/cancelled/);assert.equal(h.get('project-title').value,authored.project.title);
  assert.equal(h.calls.filter(c=>c.method==='inspect').length,1);
});
test('a different valid source needs deliberate discard; declined switch and invalid unselected row keep old writing',async t=>{
  let ask=0;const h=harness(t,{confirmDiscard:async()=>{ask++;return false;}});await h.source();await h.author();
  const changed=nativeFixture();changed.context.name='Different native context';
  await h.picker.choose(new File([encode(changed)],'changed.json'));assert.equal(ask,1);assert.equal(h.get('project-title').value,authored.project.title);
  const invalid=nativeFixture();invalid.records.gaps=[{id:'invalid-unselected',values:{}}];
  await h.picker.choose(new File([encode(invalid)],'invalid.json'));assert.equal(ask,1,'whole-file refusal precedes switching');
  await h.set('privacy',true,'change');await h.get('inspect').click();assert.equal(h.calls.at(-1).metadata.target.program.dataSha256,H('program-data',h.program.data));
  assert.equal(h.calls.filter(c=>c.method==='inspect').at(-1).bytes.toString(),encode(nativeFixture()).toString());
});
test('lost response then 429 and definitive refusal retain exactly the original command and block changed previews',async t=>{
  const h=harness(t);await h.source();await h.preview();const original=h.api.commitIncubatorCopy;let n=0;
  h.api.commitIncubatorCopy=async(...args)=>{n++;h.calls.push({method:'attempt',request:structuredClone(args[1])});if(n===1)throw Object.assign(Error('lost'),{status:0});if(n===2)throw Object.assign(Error('limited'),{status:429});if(n===3)throw Object.assign(Error('stale'),{status:409});return original(...args);};
  await h.get('commit').click();assert.equal(h.get('mode').disabled,true);assert.match(h.get('status').textContent,/Result unknown/);
  await h.get('retry').click();await h.get('retry').click();assert.equal(h.keyCount,1);assert.equal(h.get('mode').disabled,true);assert.match(h.get('status').textContent,/Result unknown/);
  await h.get('preview-copy').click();assert.equal(h.calls.filter(c=>c.method==='preview').length,1);
  await h.get('retry').click();assert.equal(n,4);const attempts=h.calls.filter(c=>c.method==='attempt');for(const row of attempts)assert.deepEqual(row.request,attempts[0].request);
  assert.equal(h.get('saved').querySelectorAll('a').length,2);assert.equal(h.get('mode').disabled,false);
});
test('malformed nominal success stays uncertain; later genuine exact receipt clears it, first definite rejection permits correction',async t=>{
  const h=harness(t);await h.source();await h.preview();const commit=h.api.commitIncubatorCopy;let n=0;
  h.api.commitIncubatorCopy=async(...args)=>++n===1?{kind:'created',result:{created:[]}}:commit(...args);
  await h.get('commit').click();assert.match(h.get('status').textContent,/unknown/i);assert.equal(h.get('retry').disabled,false);assert.equal(h.keyCount,1);
  await h.get('retry').click();assert.equal(h.get('retry').disabled,true);
});
test('unchanged and duplicate inspection cannot prepare a hidden extra pair',async t=>{
  const h=harness(t);await h.source();const inspect=h.api.inspectIncubatorSource;
  h.api.inspectIncubatorSource=async(...args)=>({...await inspect(...args),state:'unchanged',canPreview:false});
  await h.get('inspect').click();await h.author();await h.get('preview-copy').click();assert.equal(h.calls.filter(c=>c.method==='preview').length,0);assert.match(h.get('status').textContent,/Inspect this exact/);
});
test('explicit refresh preserves the exact head/IDs and discloses an unselected-only change before two new planned records',async t=>{
  const h=harness(t), old=historicalFixture(h);await h.get('load').click();
  await h.set('mode','refresh','change');await h.set('program',h.program.id,'change');await h.set('binding',old.source.bindingId,'change');await h.get('read-history').click();
  const next=nativeFixture();next.records.projects.push(nativeRow('unselected-extra'));
  await h.picker.choose(new File([encode(next)],'refresh.json'));await h.set('project','native-project','change');await h.set('milestone','native-milestone','change');await h.set('privacy',true,'change');
  await h.get('inspect').click();assert.deepEqual(h.calls.find(c=>c.method==='inspect').metadata.target,{kind:'refresh',program:h.recordPin,head:old.summary.head});
  assert.match(h.get('source').textContent,/selected rows and context are unchanged/);await h.preview();
  const result=[...h.previews.values()][0].response;assert.equal(result.plan.operation,'refresh-copy');assert.equal(result.plan.source.sourceVersion,2);assert.deepEqual(result.plan.source.previousNativeSource,sourcePin(old.source));
  await h.get('commit').click();assert.equal(h.get('saved').querySelectorAll('a').length,2);assert.equal(old.event.candidates[0].data.title,'Authored project','original historical candidate is not overwritten');
});
test('inactive adoption needs a deliberately chosen current program and fresh mapping, never a fictional full-file inspection',async t=>{
  const h=harness(t), old=historicalFixture(h,true);await h.get('load').click();await h.set('mode','adopt','change');await h.set('recovered',old.summary.head.sha256,'change');await h.get('read-recovered').click();
  assert.equal(h.get('program').value,'','old program does not choose a current one');assert.equal(h.get('inspect').disabled,true);
  await h.author();await h.get('preview-copy').click();assert.equal(h.calls.filter(c=>c.method==='adopt').length,0);
  await h.set('program',h.program.id,'change');await h.get('preview-copy').click();
  const call=h.calls.find(c=>c.method==='adopt');assert.deepEqual(call.input,{recoveredHead:old.summary.head,source:sourcePin(old.source),program:h.recordPin,mapping:authored});
  assert.match(h.get('preview').textContent,/Historical retained selection; original full file not present/);assert.equal(h.calls.filter(c=>c.method==='inspect').length,0);
  await h.set('review',true,'change');await h.get('commit').click();assert.equal(h.get('saved').querySelectorAll('a').length,2);
});
test('a first definitive refusal keeps writing editable; a known accepted result survives a shell refresh failure',async t=>{
  const h=harness(t,{onChanged:()=>{throw Error('fictional navigation failure');}});await h.source();await h.preview();const commit=h.api.commitIncubatorCopy;let n=0;
  h.api.commitIncubatorCopy=async(...args)=>{if(++n===1)throw Object.assign(Error('Fix authored content'),{status:422});return commit(...args);};
  await h.get('commit').click();assert.equal(h.get('mode').disabled,false);assert.equal(h.get('retry').disabled,true);assert.equal(h.get('project-title').value,authored.project.title);
  await h.get('commit').click();assert.match(h.get('status').textContent,/Accepted receipt verified.*refresh failed/);assert.equal(h.get('saved').querySelectorAll('a').length,2);assert.equal(h.keyCount,2);
});
test('a valid different native source clears writing only after explicit discard; selected unsupported text refuses before upload',async t=>{
  const h=harness(t,{confirmDiscard:async()=>true});await h.source();await h.author();const next=nativeFixture();next.context.name='New explicit source';
  await h.picker.choose(new File([encode(next)],'next.json'));assert.equal(h.get('project-title').value,'');assert.equal(h.get('relationship').checked,false);
  next.records.projects[0].values.title='Native-valid selected\u0000text';await h.picker.choose(new File([encode(next)],'native-valid.json'));
  await h.set('project','native-project','change');await h.set('milestone','native-milestone','change');await h.set('privacy',true,'change');await h.get('inspect').click();
  assert.match(h.get('status').textContent,/cannot be retained by PostgreSQL/);assert.equal(h.calls.filter(c=>c.method==='inspect').length,1);
});
test('a mismatched preview program or imported target owner never becomes outgoing commit authority',async t=>{
  const h=harness(t);await h.source();await h.author();const preview=h.api.previewIncubatorCopy;
  h.api.previewIncubatorCopy=async(...args)=>{const result=await preview(...args);result.plan.program.record.revision++;return result;};
  await h.get('preview-copy').click();assert.match(h.get('status').textContent,/program snapshot differs/);assert.equal(h.view.querySelector('[data-incubator="commit"]'),null);
  h.api.previewIncubatorCopy=async(...args)=>{const result=await preview(...args);result.plan.candidates[0].ownerId='imported-person';result.plan.candidates[0].lastEditedBy='imported-person';return result;};
  await h.get('preview-copy').click();assert.match(h.get('status').textContent,/two distinct ordinary/);assert.equal(h.view.querySelector('[data-incubator="commit"]'),null);
});
test('pagehide clears visible selected strings, file and command authority; late success cannot repopulate private DOM',async t=>{
  const h=harness(t);await h.source();await h.preview();let resolve;h.api.commitIncubatorCopy=()=>new Promise(r=>{resolve=r;});
  const file=h.get('file'),saving=h.get('commit').click();await new Promise(r=>setImmediate(r));await h.window.emit('pagehide');
  assert.doesNotMatch(h.view.textContent,/deliberately unmatched|Authored milestone/);assert.equal(file.value,'');
  resolve({kind:'created'});await saving;assert.doesNotMatch(h.view.textContent,/Authored milestone|Accepted original pair/);assert.equal(h.dirty,false);
});
test('a revoked or disposed view ignores late source inspection and does not focus an error',async t=>{
  const h=harness(t);await h.source();let reject;h.api.inspectIncubatorSource=()=>new Promise((_,r)=>{reject=r;});
  const waiting=h.get('inspect').click();await new Promise(r=>setImmediate(r));h.revoke();h.view.dispose();reject(Error('late private error'));await waiting;
  assert.doesNotMatch(h.view.textContent,/late private error|deliberately unmatched/);
});
test('current connected errors focus the status; moved or detached status cannot steal focus',async t=>{
  const h=harness(t);await h.get('inspect').click();const status=h.get('status');assert.equal(status.focused,true);
  status.focused=false;status.remove();h.document.body.append(status);await h.get('inspect').click();assert.equal(status.focused,false);
});
test('cancelled navigation invalidation keeps an in-flight command uncertain and reuses its exact key',async t=>{
  const h=harness(t);await h.source();await h.preview();const commit=h.api.commitIncubatorCopy;let reject;
  h.api.commitIncubatorCopy=()=>new Promise((_,r)=>{reject=r;});const waiting=h.get('commit').click();await new Promise(r=>setImmediate(r));
  h.view.invalidate();assert.match(h.get('status').textContent,/Result unknown after this view changed/);reject(Object.assign(Error('cancelled'),{name:'AbortError'}));await waiting;
  h.api.commitIncubatorCopy=commit;await h.get('retry').click();assert.equal(h.calls.filter(c=>c.method==='commit').at(-1).input.commandKey,COMMAND);assert.equal(h.keyCount,1);assert.equal(h.get('saved').querySelectorAll('a').length,2);
});
test('unbound forms suppress fallback GET and controls have labels without URL/source values',async t=>{
  const h=harness(t);let prevented=0;for(const form of h.view.querySelectorAll('form')){await form.emit('submit',{preventDefault(){prevented++;}});assert.equal(form.getAttribute('action'),null);}
  assert.equal(prevented,2);for(const input of h.view.querySelectorAll('input,select,textarea')){assert.equal(input.getAttribute('name'),null);assert.ok(h.view.querySelectorAll('label').some(label=>label.getAttribute('for')===input.id)||input.getAttribute('data-incubator')==='review');}
});
test('native transport reconstructs all 8,000,000 original bytes with fixed routes, SHA, no filename, and explicit same-slot retry',async t=>{
  const previous=globalThis.fetch;t.after(()=>{globalThis.fetch=previous;setCsrfToken('');});setCsrfToken('fictional-csrf');
  const bytes=new Uint8Array(8000000);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
  const calls=[];let lose=true;
  globalThis.fetch=async(path,options)=>{const input=JSON.parse(options.body);calls.push({path,input,options});if(lose){lose=false;throw Error('fictional first response loss');}return{ok:true,status:200,json:async()=>path.endsWith('/uploads')?{ok:true,uploadId:input.uploadId,received:input.index}:{ok:true,inspectionId:'done'}};};
  const metadata={version:1,adapter:INCUBATOR_ADAPTER};await assert.rejects(transport.inspectIncubatorSource('org-a',metadata,bytes));await transport.inspectIncubatorSource('org-a',metadata,bytes);
  const parts=calls.filter(c=>c.path.endsWith('/uploads'));assert.equal(parts[0].input.uploadId,parts[1].input.uploadId);assert.deepEqual(parts.map(c=>c.input.index),[0,0,1,2,3,4,5]);
  assert.deepEqual(Buffer.concat(parts.slice(1).map(c=>Buffer.from(c.input.chunk,'base64'))),Buffer.from(bytes));
  assert.deepEqual(calls.at(-1).input,{metadata,upload:{uploadId:parts[0].input.uploadId,byteLength:8000000,sha256:createHash('sha256').update(bytes).digest('hex')}});
  for(const c of calls){assert.equal(c.options.credentials,'same-origin');assert.equal(c.options.cache,'no-store');assert.equal(c.options.headers['X-CSRF-Token'],'fictional-csrf');assert.ok(Buffer.byteLength(c.options.body)<2008192);}
  await assert.rejects(transport.inspectIncubatorSource('org-a',{},new Uint8Array(8000001)),error=>error.code==='incubator_size');
});
test('abort between native parts sends no later chunk or inspection; facade retains exact opaque paths and commit body',async t=>{
  const previous=globalThis.fetch;t.after(()=>{globalThis.fetch=previous;});const calls=[],controller=new AbortController();
  globalThis.fetch=async(path,options)=>{const input=options.body?JSON.parse(options.body):null;calls.push({path,input});controller.abort();return{ok:true,status:200,json:async()=>({uploadId:input?.uploadId,received:0})};};
  await assert.rejects(transport.inspectIncubatorSource('org-a',{},new Uint8Array(1500001),{signal:controller.signal}),error=>error.name==='AbortError');assert.equal(calls.length,1);
  globalThis.fetch=async(path,options)=>{calls.push({path,input:options.body?JSON.parse(options.body):null});return{ok:true,status:200,json:async()=>({ok:true})};};
  const body={previewId:'preview',reviewSha256:'a'.repeat(64),commandKey:COMMAND};await transport.commitIncubatorCopy('org with space',body);await transport.incubatorRecoveredHead('org','a/b');await transport.incubatorBindings('org','opaque + cursor');
  assert.deepEqual(calls[1],{path:'/api/orgs/org%20with%20space/incubator-bridge/commit',input:body});assert.equal(calls[2].path,'/api/orgs/org/incubator-bridge/recovered/a%2Fb');assert.equal(calls[3].path,'/api/orgs/org/incubator-bridge/bindings?cursor=opaque%20%2B%20cursor');
});
