// Actual static component controls + actual controller/core; controlled DOM/read/
// download seams are not native chooser, Save, layout or BFCache evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {build} from 'esbuild';
import {transform} from '@astrojs/compiler-rs';
import {installToolDom, ToolElement} from '../../../test-fixtures/donor-recovery/tool-dom.mjs';
import {fixtureState, sealFixtureVersion, FIXTURE_NOW} from '../model-bundles/test-fixtures.mjs';
import {makeSelected} from '../model-bundles/graph.mjs';
import {editorFormFromContent} from '../model-bundles/content.mjs';
import {sha256Bytes} from '../model-bundles/codec.mjs';
const nativeTimeout = globalThis.setTimeout, nativeClearTimeout = globalThis.clearTimeout;
const component = await readFile(new URL('../../components/GiftEstimateDesk.astro', import.meta.url), 'utf8');
const html = component.replace(/<script>[\s\S]*?<\/script>/, '').replace(/<style>[\s\S]*?<\/style>/, '');
async function bundle(contents) {
  const result = await build({stdin:{contents,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',metafile:true});
  return {module:await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`), inputs:Object.keys(result.metafile.inputs)};
}
const compiled = await bundle("export * from './src/lib/gift-estimate/ui.ts';export * from './src/lib/gift-estimate/model.ts';export * from './src/lib/gift-estimate/writing.ts';");
const m = compiled.module, producer = (await bundle("export {giftsToJson} from './src/lib/client/gifts.ts';")).module;
const bytes = text => new TextEncoder().encode(text), parse = value => JSON.parse(new TextDecoder().decode(value));
const source = bytes('ENGINEERING FIXTURE: fictional source bytes for mounted consumer checks.');
const gift = {id:'ui-fictional',date:'2026-10-28',organization:'Fictional software fixture',amount:100,cause:'other',depth:null,sample:true};
const giftBytes = bytes(producer.giftsToJson([gift,{...gift,id:'other-ui-gift',note:'UNRELATED-PRIVATE-ROW'}]));
const authoring = {mappedAmount:'50.00',donorCreditPercent:'25.00',giftMoneyBasis:'nominal-USD-gift-year',moneyRationale:'Fictional nominal USD in2026.',
  applicability:'Fictional purpose only; no real program applicability.',linearFundingRationale:'Authored proportional funding hypothesis.',donorCreditRationale:'Fixed authored allocation; not observed causation.',exclusions:'Delivery and additionality unknown.'};
async function nativeModel() {
  const state=await fixtureState(),version=structuredClone(state.versions[0]),c=version.content,hash=await sha256Bytes(source);
  c.period={label:'Fictional2026period',from:{precision:'day',value:'2026-01-01'},to:{precision:'day',value:'2026-12-31'}};
  c.money={currency:'USD',priceYear:2026,basis:'nominal',inclusions:'Fictional cash',exclusions:'Unpriced resources unknown',adjustment:null};
  c.sources=[{id:'ui-source',title:'ENGINEERING FIXTURE',publisher:null,url:null,locator:null,published:null,accessedOn:null,access:'not-shared',license:null,note:'Fictional only.',checksum:{kind:'declared',sha256:hash}}];
  c.sourceModel={sourceId:'ui-source',artifactSha256:hash,interpretation:'Fictional input interpretation.'};
  state.versions[0]=await sealFixtureVersion(version);state.draft.expectedHead={id:version.id,hash:state.versions[0].hash};state.draft.form=await editorFormFromContent(c);
  return makeSelected(state,version.id,FIXTURE_NOW);
}
const modelBytes = await nativeModel();
const workerPlatform = {createWorker() {
  const worker=new Worker(new URL('../model-bundles/pure-worker.fixture.mjs',import.meta.url)),listeners=new Map();
  return {addEventListener(type,listener){const fn=type==='message'?data=>listener({data}):listener;listeners.set(listener,[type,fn]);worker.on(type,fn);},
    removeEventListener(_type,listener){const found=listeners.get(listener);if(found)worker.off(...found);listeners.delete(listener);},postMessage(value){worker.postMessage(value);},terminate(){void worker.terminate();}};
},setTimeout:nativeTimeout,clearTimeout:nativeClearTimeout};
const valueDescriptor = Object.getOwnPropertyDescriptor(ToolElement.prototype,'value');
Object.defineProperty(ToolElement.prototype,'value',{...valueDescriptor,set(value){if(this.type==='file'){assert.equal(value,'');this.files=[];}valueDescriptor.set.call(this,value);}});
async function until(predicate) {for(let n=0;n<1000;n++){if(predicate())return;await new Promise(resolve=>nativeTimeout(resolve,5));}throw Error('Mounted fixture did not settle');}
function harness({read,download}={}) {
  const dom=installToolDom(html),root=dom.$('[data-gift-estimate]'), $=id=>dom.$('#ge-'+id),outputs=[],readers=[];
  $('form').reportValidity=()=>true;
  globalThis.FileReader=class {
    readyState=0;result=null;onload=null;onerror=null;onabort=null;
    constructor(){readers.push(this);}
    readAsArrayBuffer(file){this.file=file;this.savedLoad=this.onload;this.readyState=1;file.arrayBuffer().then(value=>{this.result=value;this.readyState=2;if(!this.aborted)this.onload?.();});}
    abort(){this.aborted=true;this.readyState=2;this.onabort?.();}
    late(bytes){this.result=new Uint8Array(bytes).buffer;this.savedLoad?.();}
  };
  const network=[];globalThis.fetch=(...args)=>{network.push(args);throw Error('Network forbidden in mounted test');};
  const desk=m.createGiftEstimateDeskForTesting(workerPlatform);
  const dispose=m.mountGiftEstimateDesk(root,{desk,now:()=>FIXTURE_NOW,events:dom.window,read:read??m.readEstimateFile,
    download:download??(async(data,filename)=>outputs.push({bytes:new Uint8Array(data),filename}))});
  const settle=()=>until(()=>root.getAttribute('aria-busy')==='false');
  const choose=async(id,data,{name='fictional.json',file}={})=>{
    const input=$(id);await input.click();assert.equal(input.value,'');assert.equal(input.files.length,0);
    const chosen=file??new File([data],name);input.files=[chosen];valueDescriptor.set.call(input,'C:\\fakepath\\'+chosen.name);
    await input.fire('change');await settle();return chosen;
  };
  const field=async(key,value,event='input')=>{const el=$(key);if(typeof value==='boolean')el.checked=value;else el.value=value;await el.fire(event);};
  const click=async id=>{await $(id).click();await settle();};
  return {...dom,root,$,desk,outputs,readers,settle,choose,field,click,dispose,
    async ready(){await choose('gift-file',giftBytes);await field('gift-select',gift.id,'change');await choose('model-file',modelBytes);await click('reproduce');await choose('source-file',source);
      for(const [key,value]of Object.entries(authoring))await field(key,value);await field('acknowledgeLimits',true,'change');},
    async review(){const event=await $('form').fire('submit');assert.equal(event.defaultPrevented,true);await settle();},
    async prepared(){await this.review();await click('prepare');assert.ok($('outgoing').textContent.includes('"checksum"'));await field('ack',true,'change');},
    noExternal(){assert.deepEqual(dom.operations,[]);assert.deepEqual(network,[]);},
  };
}
test('static private fields start disabled, unnamed and labeled; controller graph excludes old storage/runtime profiles',()=>{
  const d=installToolDom(html),controls=d.$('#ge-controls');assert.equal(controls.disabled,true);
  for(const field of controls.querySelectorAll('input,select,textarea'))assert.equal(field.name,'');
  for(const field of controls.querySelectorAll('input,select,textarea'))assert.ok(d.$(`label[for="${field.id}"]`));
  assert.equal(d.$('#ge-status').getAttribute('tabindex'),'-1');assert.equal(d.$('#ge-status').getAttribute('aria-live'),'polite');
  assert.equal(compiled.inputs.some(path=>/donor-recovery-cell|durable-store|runtime-profile|model-runtime/.test(path)),false);
});
test('actual adjacent Astro sources compile and Dashboard discovery uses the site base-path helper',async()=>{
  for(const path of ['src/components/GiftEstimateDesk.astro','src/pages/tools/giving-dashboard/estimate.astro','src/components/tools/giving-dashboard.astro']){
    const source=await readFile(path,'utf8'),result=await transform(source,{filename:path});
    assert.equal((result.diagnostics??[]).some(d=>d.severity===1),false,path);
  }
  const dashboard=await readFile('src/components/tools/giving-dashboard.astro','utf8');
  assert.ok(dashboard.includes("url('/tools/giving-dashboard/estimate/')"));
});
test('actual producer/worker UI journey reviews complete exact packet, downloads same bytes, and edits revoke acknowledgment',async()=>{
  const h=harness();try{
    await h.ready();assert.equal(h.$('review').disabled,false);await h.prepared();
    const preview=h.$('outgoing').textContent;await h.click('download');assert.equal(h.outputs.length,1);
    assert.equal(new TextDecoder().decode(h.outputs[0].bytes),preview);assert.equal(h.outputs[0].filename,'charitology-gift-model-estimate.json');
    assert.equal(preview.includes('UNRELATED-PRIVATE-ROW'),false);assert.equal(preview.includes(new TextDecoder().decode(source)),false);
    assert.match(h.$('result').textContent,/Hypothetical sample/);assert.match(h.$('result').textContent,/No lifetime/);
    await h.field('applicability','Changed literal writing');assert.equal(h.$('download').disabled,true);assert.equal(h.$('ack').checked,false);assert.equal(h.$('outgoing').textContent,'');
    await h.field('exclusions','');await h.review();assert.equal(h.document.activeElement,h.$('status'));assert.equal(h.$('applicability').value,'Changed literal writing');assert.equal(h.outputs.length,1);h.noExternal();
  }finally{h.dispose();}
});
test('fresh actual saved packet stays historical until explicit copy, original source choices, reproduction and exact requalification',async()=>{
  const first=harness();let saved;try{await first.ready();await first.prepared();await first.click('download');saved=first.outputs[0].bytes;}finally{first.dispose();}
  const h=harness();try{
    await h.field('applicability','Current writing stays');await h.choose('packet-file',saved);assert.equal(h.$('applicability').value,'Current writing stays');
    assert.match(h.$('packet-facts').textContent,/unknown-not-requalified/);assert.match(h.$('result').textContent,/Unknown/);assert.equal(h.$('use-packet').disabled,true);
    await h.field('replace-packet',true,'change');await h.click('use-packet');assert.equal(h.$('applicability').value,authoring.applicability);assert.equal(h.$('acknowledgeLimits').checked,false);assert.equal(h.$('review').disabled,true);
    await h.choose('gift-file',giftBytes);await h.field('gift-select',gift.id,'change');await h.click('reproduce');await h.choose('source-file',source);await h.field('acknowledgeLimits',true,'change');
    assert.equal(h.$('requalify').disabled,false);await h.click('requalify');assert.match(h.$('result').textContent,/Saved case freshly requalified/);
    await h.click('prepare');assert.equal(parse(bytes(h.$('outgoing').textContent)).declaredResult.fingerprint,parse(saved).declaredResult.fingerprint);
    await h.field('donorCreditRationale','Changed assumption');assert.equal(h.$('requalify').disabled,true);assert.equal(h.$('outgoing').textContent,'');h.noExternal();
  }finally{h.dispose();}
});
test('picker resets before opening; cancel and failed same-path retry retain writing without former source authority',async()=>{
  let failRead=false;
  const h=harness({read:async(file,signal,max)=>{if(failRead)throw Error('controlled failure');return m.readEstimateFile(file,signal,max);}});
  try{
    await h.ready();await h.prepared();const same=new File([giftBytes],'same-path.json');
    await h.choose('gift-file',giftBytes,{file:same});await h.field('gift-select',gift.id,'change');
    await h.$('gift-file').click();await h.$('gift-file').fire('cancel');assert.equal(h.$('gift-select').disabled,true);assert.equal(h.$('download').disabled,true);assert.equal(h.$('applicability').value,authoring.applicability);
    failRead=true;await h.choose('gift-file',giftBytes,{file:same});assert.equal(h.$('gift-file').files[0],same);assert.equal(h.$('applicability').value,authoring.applicability);
    failRead=false;await h.choose('gift-file',giftBytes,{file:same});assert.equal(h.$('gift-select').options.length,3);h.noExternal();
  }finally{h.dispose();}
});
test('unfinished invalid literal writing exports/inspects/applies by choice and supplies no source qualification',async()=>{
  const raw={...authoring,mappedAmount:'unfinished $',donorCreditPercent:'',applicability:'  literal <script>no execution</script> 😀\ud800  '};
  const h=harness();let saved;try{
    for(const [key,value]of Object.entries(raw))await h.field(key,value);await h.click('save-writing');saved=h.outputs[0].bytes;
    assert.deepEqual(m.parseEstimateWriting(saved),raw);assert.equal(h.$('outgoing').textContent,'');
  }finally{h.dispose();}
  const fresh=harness();try{
    await fresh.field('applicability','Keep current');await fresh.choose('writing-file',saved);assert.equal(fresh.$('applicability').value,'Keep current');assert.equal(fresh.$('apply-writing').disabled,true);
    await fresh.field('replace-writing',true,'change');await fresh.click('apply-writing');for(const key of m.WRITING_KEYS)assert.equal(fresh.$(key).value,raw[key]);
    assert.equal(fresh.$('review').disabled,true);assert.equal(fresh.$('acknowledgeLimits').checked,false);assert.match(fresh.$('result').textContent,/Unknown/);fresh.noExternal();
  }finally{fresh.dispose();}
  const duplicate=new TextDecoder().decode(saved).replace('"version": 1','"version": 1,"\\u0076ersion":1');assert.throws(()=>m.parseEstimateWriting(bytes(duplicate)));
  assert.throws(()=>m.parseEstimateWriting(new Uint8Array(m.ESTIMATE_LIMITS.recovery+1)));
});
test('an imported field that native controls would normalize is inspected but never silently applied',async()=>{
  const h=harness();try{
    await h.field('applicability','Keep this literal current writing');
    for(const change of [{mappedAmount:'unfinished\namount'},{applicability:'line\r\nending'},{giftMoneyBasis:'unsupported-basis'}]){
      const raw={...authoring,...change},file=m.makeEstimateWriting(raw,FIXTURE_NOW);
      await h.choose('writing-file',file);assert.deepEqual(JSON.parse(h.$('writing-facts').textContent),raw);
      await h.field('replace-writing',true,'change');await h.click('apply-writing');
      assert.equal(h.$('applicability').value,'Keep this literal current writing');assert.equal(h.$('mappedAmount').value,'');
      assert.equal(h.document.activeElement,h.$('status'));assert.match(h.$('status').textContent,/cannot be represented exactly/);
      assert.deepEqual(JSON.parse(h.$('writing-facts').textContent),raw);h.noExternal();
    }
  }finally{h.dispose();}
});
test('failed reviewed download retains exact candidate for deliberate same-byte retry',async()=>{
  let failure=true;const output=[];
  const h=harness({download:async(data,filename)=>{if(failure)throw Error('controlled download failure');output.push({data:new Uint8Array(data),filename});}});
  try{await h.ready();await h.prepared();const preview=h.$('outgoing').textContent;await h.click('download');assert.equal(h.$('outgoing').textContent,preview);assert.equal(h.$('download').disabled,false);assert.equal(h.$('ack').checked,true);
    failure=false;await h.click('download');assert.equal(new TextDecoder().decode(output[0].data),preview);h.noExternal();}finally{h.dispose();}
});
test('silent native FileList replacement cannot send an earlier prepared estimate',async()=>{
  const h=harness();try{
    await h.ready();await h.prepared();h.$('gift-file').files=[new File([giftBytes],'replacement-without-event.json')];
    await h.click('download');assert.equal(h.outputs.length,0);assert.equal(h.$('outgoing').textContent,'');assert.equal(h.$('download').disabled,true);
    assert.equal(h.$('applicability').value,authoring.applicability);assert.equal(h.document.activeElement,h.$('status'));h.noExternal();
  }finally{h.dispose();}
});
test('real hash completed but delayed after a silent FileList replacement cannot adopt the old gift',async()=>{
  const h=harness(),subtle=crypto.subtle,descriptor=Object.getOwnPropertyDescriptor(subtle,'digest'),digest=subtle.digest.bind(subtle);
  let release,entered;const completed=new Promise(resolve=>{entered=resolve;});let held=false;
  Object.defineProperty(subtle,'digest',{configurable:true,value:(...args)=>{
    const actual=digest(...args);if(held)return actual;held=true;
    return actual.then(value=>new Promise(resolve=>{release=()=>resolve(value);entered();}));
  }});
  try{
    const input=h.$('gift-file');await input.click();input.files=[new File([giftBytes],'original.json')];await input.fire('change');await completed;
    input.files=[new File([giftBytes],'changed.json')];release();await h.settle();
    assert.equal(h.$('gift-select').options.length,0);assert.equal(h.$('review').disabled,true);assert.equal(h.$('gift-facts').textContent,'No gift file chosen. Other gifts remain Unknown.');h.noExternal();
  }finally{if(descriptor)Object.defineProperty(subtle,'digest',descriptor);else delete subtle.digest;release?.();h.dispose();}
});
test('completed nonabortable read after field edit or departure cannot restore private views or source authority',async()=>{
  let release,seenSignal;
  const h=harness({read:(file,signal)=>{seenSignal=signal;return new Promise(resolve=>{release=async()=>resolve(new Uint8Array(await file.arrayBuffer()));});}});
  try{
    const input=h.$('gift-file');await input.click();input.files=[new File([giftBytes],'late.json')];await input.fire('change');
    await h.field('applicability','Newer literal');assert.equal(seenSignal.aborted,true);await release();await h.settle();assert.equal(h.$('gift-select').options.length,0);assert.equal(h.$('applicability').value,'Newer literal');
    await input.click();input.files=[new File([giftBytes],'late-again.json')];await input.fire('change');await h.window.fire('pagehide');assert.equal(seenSignal.aborted,true);
    await release();await h.settle();assert.equal(h.$('gift-facts').textContent,'');assert.equal(h.$('applicability').value,'');assert.equal(h.$('outgoing').textContent,'');
    await h.window.fire('pageshow',{persisted:true});assert.match(h.$('status').textContent,/history/);assert.equal(h.$('review').disabled,true);h.noExternal();
  }finally{h.dispose();}
});
test('default bounded reader refuses oversize before reading and ignores an already-completed late load after abort',async()=>{
  const h=harness();try{
    await assert.rejects(m.readEstimateFile(new File([bytes('ab')],'small'),new AbortController().signal,1));assert.equal(h.readers.length,0);
    const controller=new AbortController(),file=new File([giftBytes],'owned.json'),promise=m.readEstimateFile(file,controller.signal,m.ESTIMATE_LIMITS.gifts),reader=h.readers.at(-1);
    controller.abort();await assert.rejects(promise);reader.late(giftBytes);assert.equal(reader.onload,null);assert.equal(reader.onerror,null);assert.equal(reader.onabort,null);
  }finally{h.dispose();}
});
