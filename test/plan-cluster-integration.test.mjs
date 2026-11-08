import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
import * as m from '../src/lib/observation-model.mjs';
import {fictionalObservationFiles,rewriteFixture} from '../test-fixtures/observations/factory.mjs';
import {fictionalObservationFiles as afgFiles} from '../test-fixtures/observations/education-factory.mjs';
import {preparePlanClusterObservationRecords as prepare} from '../src/lib/humanitarian-plan-cluster/source.mjs';
import {PLAN_CLUSTER_DEFINITION as D,PLAN_CLUSTER_HEADERS as H} from '../src/lib/humanitarian-plan-cluster/model.mjs';
import {PLAN_CLUSTER_UNKNOWN_REMAINDER} from '../src/lib/humanitarian-plan-cluster/interpretation.mjs';
import {OBSERVATION_BASELINE_PATHS as OLD,OBSERVATION_PLAN_CLUSTER_BASELINE_PATHS as NEW,observationMethodPins,observationMethodPinsFor,observationBaselinePaths} from '../src/lib/observation-baseline.mjs';
const require=createRequire(import.meta.url),ts=require('typescript'),ROOT=path.resolve(new URL('../',import.meta.url).pathname),golden=JSON.parse(fs.readFileSync(new URL('../test-fixtures/observations/legacy-before-plan-cluster.golden.json',import.meta.url)));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const source=fs.readFileSync(new URL('../src/lib/observation-view.ts',import.meta.url),'utf8');
const view=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
const pin=r=>({kind:r.kind,id:r.id,version:r.version,hash:r.hash}),base=afgFiles({financial:true});
const objects=files=>Object.entries(files).filter(([p])=>!p.startsWith('raw/')&&!p.endsWith('.txt')).map(([,s])=>JSON.parse(s));
const entity=objects(base).find(r=>r.kind==='entity'&&r.id==='country-afg');
const original=()=>{const h=m.validateObservationFiles(base);return m.observationProjection(h,h.registry.current.id);};
const clone=structuredClone;
const row=(r='100',f='25')=>({countryCode:'AFG',id:'1185',name:D.selection.planName,code:'HAFG24',startDate:'2024-01-01',endDate:'2024-12-31',year:'2024',clusterCode:'7415',cluster:'Education',requirements:r,funding:f,percentFunded:'25'});
const csv=(r,f)=>Buffer.from(H.join(',')+'\n'+H.map(k=>row(r,f)[k]).join(',')+'\n');
function input(r='100',f='25'){
 const bytes=csv(r,f),json=Buffer.from(JSON.stringify({success:true,result:{id:D.source.datasetId,name:D.source.packageName,license_id:'cc-by-igo',license_title:'Creative Commons Attribution for Intergovernmental Organisations (CC BY-IGO)',license_url:'http://creativecommons.org/licenses/by/3.0/igo/legalcode',metadata_modified:'2026-11-06T11:16:15.543202',resources:[{id:D.source.resourceId,name:D.source.resourceName,url:D.source.resourceUrl,format:'CSV',size:bytes.length,last_modified:'2026-11-06T11:16:07.816954',hash:'synthetic-publisher-literal'}]}}));
 const receipt=(bytes,a,b)=>({bytes,startedAt:`2026-11-08T13:00:00.00${a}Z`,completedAt:`2026-11-08T13:00:00.00${b}Z`,httpDate:null});
 return{csv:receipt(bytes,2,3),metadataBefore:receipt(json,0,1),metadataAfter:receipt(json,4,5),entity:clone(entity)};
}
// Disclosed synthetic immutable two-edition assembly only. No actual Git,
// capture, code A or edition B authority is asserted by these fixtures.
const order=(a,b)=>a.kind<b.kind?-1:a.kind>b.kind?1:a.id<b.id?-1:a.id>b.id?1:a.version-b.version;
const epin=e=>({id:e.id,hash:e.hash,sequence:e.sequence});
const recordKey=p=>`${p.kind}/${p.id}/${p.version}`;
const currentEdition=objs=>Object.values(objs).filter(r=>r.format==='charitology-observation-edition').sort((a,b)=>a.sequence-b.sequence).at(-1);
function appendFiles(previousFiles,output,{records:selection,id='synthetic-education-append'}={}){
 const files={...previousFiles};
 for(const [name,text]of Object.entries(output.files)){if(Object.hasOwn(files,name))assert.equal(files[name],text,'immutable prior record/blob file exact');else files[name]=text;}
 const priorRegistry=JSON.parse(previousFiles['registry.json']),prior=JSON.parse(previousFiles[`editions/${priorRegistry.current.id}.json`]);
 const e=clone(prior);e.id=id;e.sequence=prior.sequence+1;e.supersedes=epin(prior);e.method.id='observation-plan-cluster-append-v1';e.capturedAt='2026-11-08T13:00:00.006Z';
 e.records=(selection??[...prior.records,...output.records.map(pin)]).sort(order);e.coverage=e.records.filter(p=>p.kind==='coverage');e.hash=m.observationObjectHash(e);
 files[`editions/${e.id}.json`]=m.observationPrettyJson(e);
 const reg=clone(priorRegistry);reg.current=epin(e);reg.editions.push(epin(e));
 const records=objects(files).filter(r=>r.kind);reg.records=records.map(pin).sort(order);
 reg.files=Object.keys(files).filter(p=>p!=='registry.json').sort().map(path=>({path,sha256:m.observationRawHash(files[path]),bytes:Buffer.byteLength(files[path])}));
 reg.hash=m.observationObjectHash(reg);files['registry.json']=m.observationPrettyJson(reg);
 for(const [name,text]of Object.entries(previousFiles))if(name!=='registry.json')assert.equal(files[name],text,'all prior immutable files exact');
 return files;
}
function graph(r='100',f='25'){
 const output=prepare(input(r,f)),files=appendFiles(base,output);
 const handle=m.validateObservationFiles(files);return{output,files,handle,p:m.observationProjection(handle,handle.registry.current.id)};
}
// The old one-edition rewrite helper repairs record pins. This extra pass
// repairs every edition/EPIN and registry inventory, keeping negatives fully
// rehashed rather than depending on a stale second-edition checksum.
const mutate=(files,fn)=>{
 const next=rewriteFixture(files,(objs,texts)=>fn(objs,texts));
 const editions=Object.entries(next).filter(([p])=>p.startsWith('editions/')).map(([path,text])=>({path,e:JSON.parse(text)})).sort((a,b)=>a.e.sequence-b.e.sequence);
 const byId=new Map(editions.map(({e})=>[e.id,e]));
 for(const {path,e}of editions){if(e.supersedes&&byId.has(e.supersedes.id))e.supersedes.hash=byId.get(e.supersedes.id).hash;e.hash=m.observationObjectHash(e);next[path]=m.observationPrettyJson(e);}
 const reg=JSON.parse(next['registry.json']);for(const p of reg.editions)if(byId.has(p.id))p.hash=byId.get(p.id).hash;
 if(byId.has(reg.current.id))reg.current.hash=byId.get(reg.current.id).hash;
 reg.files=Object.keys(next).filter(p=>p!=='registry.json').sort().map(path=>({path,sha256:m.observationRawHash(next[path]),bytes:Buffer.byteLength(next[path])}));reg.hash=m.observationObjectHash(reg);next['registry.json']=m.observationPrettyJson(reg);return next;
};
const reject=fn=>assert.throws(fn);
const named=(objs,kind,id)=>Object.values(objs).find(r=>r.kind===kind&&r.id===id);

test('strict inert DTOs compile including new discriminants and refused unknown CSV column',()=>{
 const opts={strict:true,noEmit:true,skipLibCheck:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,lib:['lib.es2022.d.ts','lib.dom.d.ts'],types:[]};
 const program=ts.createProgram([ROOT+'/src/lib/observation-types.ts',ROOT+'/src/lib/observation-model.d.mts',ROOT+'/src/lib/observation-view.ts',ROOT+'/test/education-types.ts'],opts),d=ts.getPreEmitDiagnostics(program);
 assert.equal(d.length,0,ts.formatDiagnostics(d,{getCurrentDirectory:()=>ROOT,getCanonicalFileName:s=>s,getNewLine:()=> '\n'}));
});
test('unchanged legacy synthetic graph/projection/JSON/CSV/history/country output matches independent old golden',()=>{
 const files=fictionalObservationFiles({financial:true}),h=m.validateObservationFiles(files),p=m.observationProjection(h,h.registry.current.id),filter={entityIds:[],measureIds:[],state:'all'};
 assert.equal(digest(files),golden.hashes.files);assert.equal(digest(p),golden.hashes.projection);assert.equal(digest(m.legacyCountriesProjection(p)),golden.hashes.countries);
 for(const format of ['json','csv'])assert.equal(digest(m.observationExport(h,{editionId:p.edition.id,filter,format})),golden.hashes[format]);
 assert.equal(digest(m.observationHistoryExport(h)),golden.hashes.history);assert.equal(digest(view.countryObservationFacts(p,'AAA')),golden.hashes.countryFacts);assert.equal(digest(view.countryMissingFacts(p,'AAA')),golden.hashes.countryMissing);
});
test('new typed graph admits two exact decimals, fixed scope/measure/period and no old identity coercion',()=>{
 const {p,output}=graph(),scope=p.scopes.find(r=>r.scopeKind==='humanitarian-plan-cluster'),obs=p.observations.filter(o=>o.reported.parser==='csv-decimal-v1');
 assert.equal(obs.length,2);assert.equal(scope.planCluster.countryCode,'AFG');assert.equal(scope.planCluster.causeBinding.review,'draft');assert.deepEqual(obs.map(o=>o.value.coefficient).sort(),['1','25']);
 for(const o of obs){assert.equal(o.period.kind,'closed-interval');assert.equal(o.precision.kind,'unknown');assert.equal(o.uncertainty,null);assert.equal(p.measures.find(m=>m.id===o.measure.id).legacyCountry,null);}
 assert.equal(output.report.newCaptureProved,false);assert.equal(output.report.fullMetadataPublic,false);assert(!Object.values(output.files).some(s=>s.includes('"success":true')));
});
test('blank vs0, signed funding and leading zeros retain exact tokens without floating arithmetic',()=>{
 const zero=graph('0','0');assert.equal(zero.p.observations.filter(o=>o.reported.parser==='csv-decimal-v1').length,2);
 const signed=graph('00100.00','-0.25').p,found=signed.observations.filter(o=>o.reported.parser==='csv-decimal-v1');assert.equal(found.find(o=>o.reported.token==='00100.00').value.coefficient,'1');assert.deepEqual(found.find(o=>o.reported.token==='-0.25').value,{coefficient:'-25',exponent:-2});
});
test('present/eachblank/bothblank plan cells never enter national AFG facts/missing or change legacy countries',()=>{
 const prior=original(),facts=view.countryObservationFacts(prior,'AFG'),missing=view.countryMissingFacts(prior,'AFG'),countries=m.legacyCountriesProjection(prior);
 for(const [r,f,n] of [['100','25',0],['','25',1],['100','',1],['','',2]]){
  const {p}=graph(r,f),c=p.coverage.find(c=>c.selection.kind==='explicit-plan-cluster');assert.equal(c.cells.filter(x=>x.state==='missing').length,n);
  assert.deepEqual(view.countryObservationFacts(p,'AFG'),facts);assert.deepEqual(view.countryMissingFacts(p,'AFG'),missing);assert.deepEqual(m.legacyCountriesProjection(p),countries);
 }
});
test('old record/raw bytes stay exact in the synthetic joined graph; metadata original stays private',()=>{
 const {files,output}=graph();for(const [name,text] of Object.entries(base))if(name!=='registry.json'&&!name.startsWith('editions/'))assert.equal(files[name],text);
 assert.equal(Object.keys(output.files).length,10);assert.equal(Object.keys(output.files).filter(k=>k.startsWith('raw/')||k.startsWith('evidence/')).length,2);assert(Object.keys(output.files).filter(k=>k.startsWith('raw/')||k.startsWith('evidence/')).every(k=>k.endsWith('.txt')));
 const evidence=output.records.find(r=>r.payload?.kind==='external-document');assert.equal(evidence.payload.mediaType,'application/json');assert.equal(evidence.rights.publicReuse.kind,'linked-document-only');
 assert(output.files[evidence.payload.publicExcerpt.path].includes('/result/license_id: "cc-by-igo"'));assert(output.files[evidence.payload.publicExcerpt.path].includes('Changes:'));
});
test('exact row spans, checksum, match literals, duplicate columns and wrong selected column refuse coherently rehashed graph',()=>{
 const {files}=graph();for(const change of [o=>o.reported.valueRef.locator.byteStart++,o=>o.reported.valueRef.locator.rawSha256='0'.repeat(64),o=>o.reported.valueRef.locator.matches[0].expected='USA',o=>o.reported.valueRef.locator.matches[1].column='countryCode',o=>o.reported.valueRef.locator.column='percentFunded']){
  const bad=mutate(files,objs=>change(named(objs,'observation','afg-education-2024-requirements')));reject(()=>m.validateObservationFiles(bad));
 }
});
test('scope cannot acquire a different country, cause, consolidation, source or extra old-branch defaults',()=>{
 const {files}=graph();for(const change of [s=>s.planCluster.countryCode='USA',s=>s.planCluster.causeBinding.review='approved',s=>s.consolidation='consolidated-unspecified-eliminations',s=>s.planCluster.period.end='2025-01-01',s=>s.exclusions=[]])reject(()=>m.validateObservationFiles(mutate(files,objs=>change(named(objs,'scope','afg-education-hnrp-2024')))));
 reject(()=>m.validateObservationFiles(mutate(files,objs=>{const s=Object.values(objs).find(r=>r.scopeKind==='national-statistics');s.planCluster=clone(named(objs,'scope','afg-education-hnrp-2024').planCluster);} )));
});
test('measure/period/parser/scale/precision cannot coerce CSV into audited expenses or national statistics',()=>{
 const {files}=graph();for(const edit of [o=>o.reported.parser='printed-integer-v1',o=>o.reported.token='bogus',o=>o.reported.scale.exponent=3,o=>o.period={kind:'calendar-year',year:2024},o=>o.producerUnit='people']){
  const bad=mutate(files,objs=>edit(named(objs,'observation','afg-education-2024-requirements')));
  reject(()=>m.validateObservationFiles(bad));
 }
 for(const change of [r=>r.family='expenses',r=>r.producerCode=null,r=>r.definition='All human need',r=>r.unit={kind:'count',label:'people',denominator:null}])reject(()=>m.validateObservationFiles(mutate(files,objs=>change(named(objs,'measure','afg-education-2024-requirements')))));
});
test('coverage exactly two ordered measures/cells; blank needs exact missing proof and no fakezero',()=>{
 const {files}=graph('','25');for(const change of [c=>c.cells.pop(),c=>c.cells.reverse(),c=>c.cells[0].reason='producer-null-throughout-window',c=>c.cells[0].sourceRefs=[],c=>c.selection.measures.reverse(),c=>c.selection.unknownRemainder='All countries'])reject(()=>m.validateObservationFiles(mutate(files,objs=>change(named(objs,'coverage','afg-education-hnrp-2024')))));
 const present=graph().files;reject(()=>m.validateObservationFiles(mutate(present,objs=>{const c=named(objs,'coverage','afg-education-hnrp-2024');c.cells[0]={state:'missing',entity:c.selection.scope,scope:c.selection.scope,measure:c.selection.measures[0],reason:'producer-empty-source-field',sourceRefs:[]};})));
});
test('new missing reason cannot weaken old country adapter',()=>{
 const bad=mutate(base,objs=>{for(const c of Object.values(objs))if(c.kind==='coverage'&&c.selection.kind==='country-latest-window')for(const x of c.cells)if(x.state==='missing')x.reason='producer-empty-source-field';});reject(()=>m.validateObservationFiles(bad));
});
test('CSV licensing requires separate HDX JSON excerpt and cannot selflicense/relicense metadata or use PDF',()=>{
 const {files}=graph();for(const change of [s=>s.rights.returnedLicense='cc-by-igo',s=>s.rights.publicReuse.termsUrl='https://example.invalid/terms',s=>s.rights.publicReuse.evidence=[],s=>s.url='https://example.invalid/source'])reject(()=>m.validateObservationFiles(mutate(files,objs=>change(named(objs,'source','fts-afg-education-2024-cluster')))));
 reject(()=>m.validateObservationFiles(mutate(files,objs=>{named(objs,'source','hdx-afg-education-2024-license').payload.mediaType='application/pdf';})));
});
test('metadata/resource/license drift, unknown inputs and missing actualdeclared receipt clocks refuse before output',()=>{
 for(const change of [v=>{const j=JSON.parse(v.metadataAfter.bytes);j.result.resources[0].hash='changed';v.metadataAfter.bytes=Buffer.from(JSON.stringify(j));},v=>v.csv.completedAt=null,v=>v.csv.startedAt='2026-11-08T13:00:00.009Z',v=>v.entity.id='country-usa',v=>v.url='https://example.invalid']){const v=input();change(v);reject(()=>prepare(v));}
 const v=input();v.csv.httpDate='Sun, 08 Nov 2026 13:00:00 GMT';const p=prepare(v);assert.equal(p.records.find(r=>r.payload?.kind==='public-csv').retrievedAt,v.csv.completedAt);
});
test('hostile receipt/selectors/prior inventories refuse without executing Proxy/getter hooks',()=>{
 let n=0;const v=input();Object.defineProperty(v.csv,'completedAt',{enumerable:true,get(){n++;throw Error('hook');}});reject(()=>prepare(v));
 const proxy=input();proxy.metadataBefore.bytes=new Proxy(proxy.metadataBefore.bytes,{getPrototypeOf(){n++;throw Error('hook');}});reject(()=>prepare(proxy));
 const array=Array(1);array['4294967295']={};reject(()=>prepare(input(),array));
 const previous=new Proxy([],{ownKeys(){n++;throw Error('hook');}});reject(()=>prepare(input(),previous));assert.equal(n,0);
});
test('preparation is deterministic, detached, deeply frozen and never reads Date.now',()=>{
 const old=Date.now;Date.now=()=>{throw Error('clock');};try{const v=input(),out=prepare(v),again=prepare(input());assert.deepEqual(out,again);v.csv.bytes.fill(0);assert(Object.isFrozen(out));assert(Object.isFrozen(out.records[0]));assert(out.records.some(r=>r.payload?.kind==='public-csv'));}finally{Date.now=old;}
});
test('source versions reuse unchanged records and preserve original prior objects on a changed capture',()=>{
 const first=prepare(input()),before=clone(first.records),same=prepare(input(),first.records);assert.deepEqual(same.records,first.records);
 const next=prepare(input('100','26'),first.records);assert(next.records.find(r=>r.payload?.kind==='public-csv').version===2);assert.deepEqual(first.records,before);
});
test('old14 vector/algorithm golden exact; new vector dispatch is explicit separate closed26',()=>{
 const baseline=paths=>({commit:'1'.repeat(40),files:paths.map(path=>{const bytes=Buffer.from('Synthetic exact baseline:'+path);return{path,bytes,sha256:m.observationRawHash(bytes)}})});
 assert.deepEqual(OLD,golden.oldBaselinePaths);assert.deepEqual(observationMethodPins(baseline(OLD)),golden.oldMethod);assert.deepEqual(observationMethodPinsFor('observation-capture-v1',baseline(OLD)),golden.oldMethod);
 assert.equal(NEW.length,26);assert.deepEqual(observationBaselinePaths('observation-plan-cluster-append-v1'),NEW);const newer=observationMethodPinsFor('observation-plan-cluster-append-v1',baseline(NEW));assert.notEqual(newer.adapterSha256,golden.oldMethod.adapterSha256);
 reject(()=>observationMethodPinsFor('unknown',baseline(OLD)));reject(()=>observationMethodPinsFor('observation-plan-cluster-append-v1',baseline(OLD)));reject(()=>observationMethodPins(baseline(NEW)));
 const oldText=golden.oldBaselineUtf8,newText=fs.readFileSync(new URL('../src/lib/observation-baseline.mjs',import.meta.url),'utf8');assert(newText.startsWith(oldText));
});
test('new method baseline admits no getters/prototype traps/sparse vectors and verifies exact bytes',()=>{
 const files=NEW.map(path=>{const bytes=Buffer.from(path);return{path,bytes,sha256:m.observationRawHash(bytes)}});let n=0;
 const b={commit:{toString(){n++;return '1'.repeat(40);}},files};reject(()=>observationMethodPinsFor('observation-plan-cluster-append-v1',b));
 const v={commit:'1'.repeat(40),files:files.slice()};Object.defineProperty(v.files,'0',{enumerable:true,get(){n++;throw Error('hook');}});reject(()=>observationMethodPinsFor('observation-plan-cluster-append-v1',v));
 const altered=clone({commit:'1'.repeat(40),files});altered.files[0].sha256='0'.repeat(64);reject(()=>observationMethodPinsFor('observation-plan-cluster-append-v1',altered));assert.equal(n,0);
});
test('CSV locators display as CSV; browser leaf/view introduce no Node parser imports',()=>{
 const {p}=graph(),r=p.observations.find(o=>o.reported.parser==='csv-decimal-v1');assert(view.observationLocatorText(r.reported.valueRef).startsWith('CSV record 2'));
 assert(!/from\s+["'][^"']*(?:plan-cluster|node:|observation-model|observation-sources)/.test(source));
 const leaf=fs.readFileSync(new URL('../src/lib/client/observation-ui.ts',import.meta.url),'utf8');assert(!/^\s*import\b/m.test(leaf));
});

// Genuine predecessor negatives: new factual variants require their own interpretation/assembly boundary.
test('new CSV family cannot be labeled with the old14 interpretation method',()=>{
 const {files}=graph();const bad=mutate(files,objs=>{currentEdition(objs).method.id='observation-capture-v1';});reject(()=>m.validateObservationFiles(bad));
});
test('new-method assembly cannot predate the declared source completions',()=>{
 const {files}=graph();const bad=mutate(files,objs=>{currentEdition(objs).capturedAt='2026-11-08T13:00:00.004Z';});reject(()=>m.validateObservationFiles(bad));
});


// Genuine predecessor-selection regressions for the deliberately first-only method.
test('first append retains two immutable editions, all prior selected pins and financial panel',()=>{
 const {files,p}=graph(),before=JSON.parse(base['registry.json']),after=JSON.parse(files['registry.json']);
 assert.equal(after.editions.length,2);const prior=JSON.parse(base[`editions/${before.current.id}.json`]),e=JSON.parse(files[`editions/${after.current.id}.json`]);
 for(const [name,text]of Object.entries(base))if(name!=='registry.json')assert.equal(files[name],text);
 for(const selected of prior.records)assert(e.records.some(p=>JSON.stringify(p)===JSON.stringify(selected)));
 assert.deepEqual(e.countryProjection,prior.countryProjection);assert.deepEqual(e.legacyComparison,prior.legacyComparison);
 assert.equal(p.coverage.filter(c=>c.selection.kind==='explicit-financial-panel').length,1);
 assert.deepEqual(m.legacyCountriesProjection(p),m.legacyCountriesProjection(original()));
});
test('new append method refuses a predecessor-free rewritten initial edition',()=>{
 const {files}=graph();const bad=mutate(files,(objs,texts)=>{
  const current=currentEdition(objs),reg=objs['registry.json'];
  for(const [path,r]of Object.entries(objs))if(r.format==='charitology-observation-edition'&&r.id!==current.id){delete objs[path];delete texts[path];}
  current.sequence=1;current.supersedes=null;reg.editions=[epin(current)];reg.current=epin(current);
 });
 assert.throws(()=>m.validateObservationFiles(bad),/requires a predecessor edition/);
});
test('fully rehashed two-edition append refuses dropping22 prior financial selected pins',()=>{
 const {output}=graph(),prior=JSON.parse(base[`editions/${JSON.parse(base['registry.json']).current.id}.json`]),all=new Map(objects(base).filter(r=>r.kind).map(r=>[recordKey(r),r])),keep=new Set();
 const visit=p=>{const k=recordKey(p);if(keep.has(k))return;keep.add(k);const r=all.get(k);assert(r);const walk=(v,path=[])=>{if(!v||typeof v!=='object'||path[0]==='previous')return;if(Object.keys(v).sort().join(',')==='hash,id,kind,version'){visit(v);return;}for(const [key,item]of Object.entries(v))walk(item,[...path,key]);};walk(r);};
 for(const c of original().coverage.filter(c=>c.selection.kind==='country-latest-window'))visit(pin(c));
 assert.equal(prior.records.filter(p=>!keep.has(recordKey(p))).length,22);
 const bad=appendFiles(base,output,{records:[...prior.records.filter(p=>keep.has(recordKey(p))),...output.records.map(pin)],id:'synthetic-dropped-financial'});
 assert.throws(()=>m.validateObservationFiles(bad),/preserve every prior selected pin/);
});
test('append refuses a single old panel deselection even while all its dependent records remain selected',()=>{
 const {files}=graph();const bad=mutate(files,objs=>{const e=currentEdition(objs);e.records=e.records.filter(p=>!(p.kind==='coverage'&&p.id==='financial-panel'));e.coverage=e.records.filter(p=>p.kind==='coverage');});
 assert.throws(()=>m.validateObservationFiles(bad),/preserve every prior selected pin/);
});
test('same-id replacement version cannot substitute for an exact prior financial selected pin',()=>{
 const {files}=graph();const bad=mutate(files,(objs,texts)=>{
  const before=named(objs,'coverage','financial-panel'),replacement={...clone(before),version:2,previous:pin(before)};replacement.hash=m.observationObjectHash(replacement);
  const path=`coverage/${replacement.id}.v2.json`;objs[path]=replacement;texts[path]=m.observationPrettyJson(replacement);
  const e=currentEdition(objs);e.records=e.records.map(p=>p.kind==='coverage'&&p.id===replacement.id?pin(replacement):p).sort(order);e.coverage=e.records.filter(p=>p.kind==='coverage');
 });assert.throws(()=>m.validateObservationFiles(bad),/preserve every prior selected pin/);
});
test('fully rehashed append preserves countryProjection and every legacyComparison field exactly',()=>{
 const {files}=graph();for(const change of [e=>e.countryProjection.title='Changed country title',e=>e.legacyComparison.declaredRetrievedDay='2026-11-08',e=>e.legacyComparison.sha256='0'.repeat(64)]){
  const bad=mutate(files,objs=>change(currentEdition(objs)));assert.throws(()=>m.validateObservationFiles(bad),/preserve prior country projection and legacy comparison/);
 }
});
test('append permits no unrelated selected record beyond its fixed plan closure',()=>{
 const {files}=graph();const bad=mutate(files,(objs,texts)=>{
  const extra=clone(named(objs,'measure','financial-assets'));extra.id='unrelated-new-assets';extra.hash=m.observationObjectHash(extra);const path=`measures/${extra.id}.v1.json`;objs[path]=extra;texts[path]=m.observationPrettyJson(extra);
  const e=currentEdition(objs);e.records.push(pin(extra));e.records.sort(order);
 });assert.throws(()=>m.validateObservationFiles(bad),/preserve every prior selected pin/);
});
test('a later same-plan recapture is refused pending a separate reviewed method and contract',()=>{
 const first=graph(),next=prepare(input('100','26'),first.output.records),reg=JSON.parse(first.files['registry.json']),prior=JSON.parse(first.files[`editions/${reg.current.id}.json`]);
 const replacements=new Set(next.records.map(r=>`${r.kind}/${r.id}`));const selection=[...prior.records.filter(p=>!replacements.has(`${p.kind}/${p.id}`)),...next.records.map(pin)];
 const bad=appendFiles(first.files,next,{records:selection,id:'synthetic-unsupported-recapture'});
 assert.throws(()=>m.validateObservationFiles(bad),/first append already exists in retained history/);
});

test('existing closed currency schema refuses nonUSD label/currency/denominator after full rehash',()=>{
 const {files}=graph();for(const change of [r=>r.unit.currency='EUR',r=>r.unit.label='EUR',r=>r.unit.denominator={label:'people'}]){
  const bad=mutate(files,objs=>change(named(objs,'measure','afg-education-2024-requirements')));assert.throws(()=>m.validateObservationFiles(bad));
 }
});
test('existing exact priceBasis schema refuses constant-price claims and extra unknown fields after full rehash',()=>{
 const {files}=graph();for(const basis of [{kind:'constant-price',year:2024},{kind:'unknown',year:2024}]){
  const bad=mutate(files,objs=>{named(objs,'observation','afg-education-2024-requirements').priceBasis=basis;});assert.throws(()=>m.validateObservationFiles(bad));
 }
});

test('retained first append survives an ordinary old-method refresh and blocks a second new append',()=>{
 const first=graph(),files={...first.files},reg=JSON.parse(files['registry.json']),initial=JSON.parse(base[`editions/${JSON.parse(base['registry.json']).current.id}.json`]);
 const refresh={...clone(initial),id:'synthetic-old-method-refresh',sequence:3,supersedes:reg.current,capturedAt:'2026-11-08T13:00:00.007Z'};refresh.hash=m.observationObjectHash(refresh);files[`editions/${refresh.id}.json`]=m.observationPrettyJson(refresh);
 reg.current=epin(refresh);reg.editions.push(epin(refresh));reg.files=Object.keys(files).filter(p=>p!=='registry.json').sort().map(path=>({path,sha256:m.observationRawHash(files[path]),bytes:Buffer.byteLength(files[path])}));reg.hash=m.observationObjectHash(reg);files['registry.json']=m.observationPrettyJson(reg);
 for(const [path,text]of Object.entries(first.files))if(path!=='registry.json')assert.equal(files[path],text);
 const ordinary=m.validateObservationFiles(files);assert.equal(ordinary.registry.editions.length,3);assert.equal(m.observationProjection(ordinary,refresh.id).coverage.some(c=>c.selection.kind==='explicit-plan-cluster'),false);
 const second=appendFiles(files,first.output,{id:'synthetic-second-new-append'});assert.equal(JSON.parse(second['registry.json']).editions.length,4);
 assert.throws(()=>m.validateObservationFiles(second),/first append already exists in retained history/);
});
