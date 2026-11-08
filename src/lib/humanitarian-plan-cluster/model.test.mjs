import test from 'node:test';
import assert from 'node:assert/strict';
import { fundingObjectHash, fundingSha256 } from '../humanitarian-funding/model.mjs';
import { PLAN_CLUSTER_DEFINITION as D, PLAN_CLUSTER_SELECTION as S, PLAN_CLUSTER_HEADERS as H, PLAN_CLUSTER_LIMITS as L, PLAN_CLUSTER_KEY, parsePlanClusterCsv as parse, validatePlanClusterSourceDescriptor as descriptor, makePlanClusterPureProjection as make, validatePlanClusterPureProjection as validate, verifyPlanClusterProjectionAgainstCsv as verify } from './model.mjs';

const enc = new TextEncoder();
const row = (patch = {}) => ({ countryCode:'AFG',id:'1185',name:S.planName,code:S.planCode,startDate:S.start,endDate:S.end,year:'2024',clusterCode:'7415',cluster:'Education',requirements:'140022000',funding:'79460644',percentFunded:'57',...patch });
const cell = s => /[",\r\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
const record = r => H.map(h => cell(r[h])).join(',');
const csv = (rows = [row()], ending = '\n') => enc.encode(H.join(',') + ending + rows.map(record).join(ending) + ending);
const source = b => ({ ...Object.fromEntries(['datasetId','resourceId','resourceName','resourceUrl'].map(k=>[k,D.source[k]])),resourceBytes:b.length,resourceModified:'2026-11-06T11:16:07.816954',metadataModified:'2026-11-06T11:16:15.543202',publisherHashLiteral:'e79c623d3cf104e17b69296c26a0eb60',license:{id:'cc-by-igo',title:'Creative Commons Attribution for Intergovernmental Organisations (CC BY-IGO)',url:'http://creativecommons.org/licenses/by/3.0/igo/legalcode'},attribution:D.rights.attribution });
const projection = (patch = {}) => { const b=csv([row(patch)]);return make(parse(b),source(b)); };
const copy = value => structuredClone(value);
const reseal = value => { const {sha256:_,...body}=value; return {...body,sha256:fundingObjectHash(body)}; };

// All source rows below are deliberately synthetic, including the fixed tuple's numeric tokens.
test('fixed tuple retains raw12 and derives exact coverage without source-rounded substitution',()=>{
 const p=projection();assert.equal(p.row.key,PLAN_CLUSTER_KEY);assert.equal(p.row.raw.percentFunded,'57');
 assert.deepEqual(p.derived,{status:'comparable',numerator:'19865161',denominator:'35005500',displayPercent:'56.75',differenceUSD:'60561356'});
 assert.equal(p.causeBinding.review,'draft');assert.equal(p.review,'draft');assert.ok(!Object.hasOwn(p,'retrievedAt'));assert.ok(!Object.hasOwn(p,'edition'));assert.deepEqual(validate(p),p);
});
test('native Uint8Array and Buffer are detached without modifying source bytes',()=>{
 const b=csv(),prior=Buffer.from(b),p=parse(b);b.fill(0);assert.equal(p.selected.raw.funding,'79460644');assert.equal(p.sourceSha256,fundingSha256(prior));assert.deepEqual(parse(prior),p);assert.ok(Object.isFrozen(p.selected.raw));
});
test('exact UTF8/CRLF locators include original record ending and quoted multiline fields',()=>{
 const unselected=row({countryCode:'USA',id:'2',clusterCode:'3',name:'éducation, "test"\r\nsecond line'}),b=csv([unselected,row()], '\r\n'),p=parse(b);
 const span=b.subarray(p.selected.locator.byteStart,p.selected.locator.byteEnd);
 assert.equal(new TextDecoder().decode(span),record(row())+'\r\n');assert.equal(p.selected.locator.recordNumber,3);assert.equal(p.selected.locator.firstLine,4);assert.equal(p.selected.locator.lastLine,4);assert.equal(fundingSha256(span),p.selected.locator.rawSha256);assert.equal(p.sourceBytes,b.length);
});
test('final record without newline has exact end offset',()=>{
 const b=csv().subarray(0,csv().length-1),p=parse(b);assert.equal(p.selected.locator.byteEnd,b.length);assert.equal(p.selected.locator.lastLine,2);
});
test('shared and unspecified categories remain distinct unselected literal categories',()=>{
 const p=parse(csv([row({clusterCode:'',cluster:'Not specified'}),row({clusterCode:'',cluster:'Multiple clusters/sectors (shared)'}),row()]));assert.equal(p.totalRecords,3);assert.equal(p.selected.raw.clusterCode,'7415');
});
test('missing and repeated selected tuple refuse rather than choose or pool',()=>{
 assert.throws(()=>parse(csv([row({clusterCode:'7417'})])));assert.throws(()=>parse(csv([row(),row({funding:'1'})])));
});
test('unselected duplicate source tuple also refuses; different country or cluster does not pool',()=>{
 const other=row({countryCode:'USA',clusterCode:'1'});assert.throws(()=>parse(csv([row(),other,other])));assert.equal(parse(csv([row(),other])).totalRecords,2);
});
test('fixed selection label, code, cluster and calendar-period mismatches refuse',()=>{
 for(const patch of [{name:'Other'},{code:'HAFG25'},{cluster:'education'},{startDate:'2024-01-02'},{endDate:'2024-12-30'}])assert.throws(()=>parse(csv([row(patch)])));
});
test('blank and exact zero are different states; denominator zero gives no ratio',()=>{
 const absent=projection({requirements:'',funding:''}),zero=projection({requirements:'0',funding:'0'});
 assert.equal(absent.values.requirements.state,'missing');assert.equal(absent.values.requirements.decimal,null);assert.equal(absent.derived.differenceUSD,null);assert.equal(absent.derived.status,'both-missing');
 assert.equal(zero.values.requirements.state,'present');assert.deepEqual(zero.values.requirements.decimal,{coefficient:'0',scale:0});assert.equal(zero.derived.status,'zero-requirements');assert.equal(zero.derived.differenceUSD,'0');
 assert.equal(projection({requirements:'',funding:'0'}).derived.status,'requirements-missing');assert.equal(projection({requirements:'1',funding:''}).derived.status,'funding-missing');
});
test('signed adjustments, overfunding and exact fractions remain visible',()=>{
 assert.deepEqual(projection({requirements:'3',funding:'1'}).derived,{status:'comparable',numerator:'1',denominator:'3',displayPercent:'33.33',differenceUSD:'2'});
 assert.equal(projection({requirements:'1.20',funding:'2.250'}).derived.differenceUSD,'-1.05');assert.equal(projection({requirements:'1',funding:'2'}).derived.displayPercent,'200.00');assert.equal(projection({requirements:'2',funding:'-1'}).derived.displayPercent,'-50.00');
});
test('malformed decimal tokens and invalid source dates refuse without whitespace coercion',()=>{
 for(const patch of [{requirements:' '},{funding:' 0'},{requirements:'-1'},{funding:'1e3'},{funding:'.5'},{funding:'1.1234567890123456789'},{percentFunded:'NaN'},{startDate:'2024-02-30'},{year:'2201'}])assert.throws(()=>parse(csv([row(patch)])));
});
test('UTF8 malformed bytes, BOM and NUL refuse original input',()=>{
 for(const b of [new Uint8Array([0xc3,0x28]),new Uint8Array([0xef,0xbb,0xbf,...csv()]),enc.encode(new TextDecoder().decode(csv()).replace('Education','Edu\0cation'))])assert.throws(()=>parse(b));
});
test('strict CSV header, quoting, column count and bare CR refusals',()=>{
 const text=new TextDecoder().decode(csv());
 for(const s of [text.replace('countryCode','country'),text.replace('Education','"Education"x'),text.replace('Education','"Education'),text.replace('Education','Edu"cation'),text.replace(',57\n','\n'),text.replace(',57\n',',57,extra\n'),text.replaceAll('\n','\r')])assert.throws(()=>parse(enc.encode(s)));
});
test('field, record and whole-file bounds fail closed',()=>{
 assert.throws(()=>parse(csv([row({name:'x'.repeat(L.field+1)})])));assert.throws(()=>parse(new Uint8Array(L.bytes+1)));
 const tiny=H.join(',')+'\n'+record(row())+'\n'+Array.from({length:L.records},(_,i)=>record(row({countryCode:'USA',id:String(i),name:'x',code:'',startDate:'',endDate:'',clusterCode:'1',cluster:'x',requirements:'',funding:'',percentFunded:''}))).join('\n');
 assert.ok(enc.encode(tiny).length<L.bytes);assert.throws(()=>parse(enc.encode(tiny)),/too many records/);assert.throws(()=>parse(new Uint8Array()));
});
test('untrusted nonbytes and Proxy prototypes invoke zero hooks',()=>{
 let hooks=0;const trap=new Proxy({}, {get(){hooks++;throw Error('get');},getPrototypeOf(){hooks++;throw Error('proto');},ownKeys(){hooks++;throw Error('keys');}});
 for(const value of [trap,Object.create(trap),{},[],new ArrayBuffer(8),new DataView(new ArrayBuffer(8)),new Uint16Array(8),'csv'])assert.throws(()=>parse(value));assert.equal(hooks,0);
});
test('native byte wrappers reject subclass, shared, resizable and decorations before hooks',()=>{
 let hooks=0;class Sub extends Uint8Array{};assert.throws(()=>parse(new Sub(csv())));assert.throws(()=>parse(new Uint8Array(new SharedArrayBuffer(8))));
 assert.throws(()=>parse(new Uint8Array(new ArrayBuffer(8,{maxByteLength:16}))));
 const b=csv();Object.defineProperty(b,'evil',{get(){hooks++;throw Error('evil');},enumerable:true});assert.throws(()=>parse(b));assert.equal(hooks,0);
});
test('declared descriptor closes source and rights without a retrieval clock',()=>{
 const b=csv(),d=descriptor(source(b));assert.equal(d.license.url,'http://creativecommons.org/licenses/by/3.0/igo/legalcode');assert.ok(!Object.hasOwn(d,'retrievedAt'));assert.ok(Object.isFrozen(d.license));
 for(const patch of [{resourceId:'other'},{resourceUrl:'https://other.test/'},{resourceBytes:b.length+1},{retrievedAt:'2026-11-08T00:00:00Z'},{attribution:'unknown'}])assert.throws(()=>make(parse(b),{...source(b),...patch}));
 for(const license of [{...d.license,id:'unknown'},{...d.license,url:'https://creativecommons.org/licenses/by/4.0/'},{...d.license,extra:true}])assert.throws(()=>descriptor({...d,license}));
});
test('descriptor getters, hidden keys, symbols and proxies refuse before invocation',()=>{
 const b=csv();let hooks=0;const bad=source(b);Object.defineProperty(bad,'resourceBytes',{enumerable:true,get(){hooks++;return b.length;}});assert.throws(()=>descriptor(bad));
 const hidden=source(b);Object.defineProperty(hidden,'extra',{value:true});assert.throws(()=>descriptor(hidden));const symbol=source(b);symbol[Symbol('x')]=true;assert.throws(()=>descriptor(symbol));assert.throws(()=>descriptor(new Proxy(source(b),{ownKeys(){hooks++;return [];}})));assert.equal(hooks,0);
});
test('compensated sparse and noncanonical array indices cannot hide projection content',()=>{
 for(const key of ['4294967295','999999999999999999999','01','-0','1e0']){const p=copy(projection()),a=Array(1);Object.defineProperty(a,key,{value:'x',enumerable:true});p.limitations=a;assert.throws(()=>validate(p));}
 const p=copy(projection());delete p.limitations[0];assert.throws(()=>validate(p));
});
test('owned graph cycles, prototypes, hidden values and accessor arrays refuse with zero callbacks',()=>{
 let hooks=0;const p=copy(projection());Object.defineProperty(p.limitations,'0',{get(){hooks++;return 'x';},enumerable:true});assert.throws(()=>validate(p));
 const q=copy(projection());q.limitations.push(q);assert.throws(()=>validate(q));const r=copy(projection());Object.setPrototypeOf(r,new Proxy({},{getPrototypeOf(){hooks++;throw Error('trap');}}));assert.throws(()=>validate(r));assert.equal(hooks,0);
});
test('new builder requires branded parsed bytes, never a user-forged summary',()=>{
 const b=csv(),p=parse(b);assert.throws(()=>make(copy(p),source(b)));assert.throws(()=>make({...p,selected:{...p.selected,raw:row({funding:'999'})}},source(b)));
});
test('self-checksum cannot rescue tampered tuple, labels, math or unknown fields',()=>{
 for(const edit of [p=>p.values.funding.token='1',p=>p.derived.displayPercent='57',p=>p.causeBinding.review='approved',p=>p.row.raw.cluster='Health',p=>p.selection.referenceYear=2025,p=>p.extra=true,p=>p.source.records=0,p=>p.row.locator.byteEnd=p.source.csvBytes+1]){const p=copy(projection());edit(p);assert.throws(()=>validate(reseal(p)));}
 const p=copy(projection());p.sha256='0'.repeat(64);assert.throws(()=>validate(p));
});
test('detached projection preserves declared strings and unchanged source ownership',()=>{
 const b=csv(),d=source(b),p=make(parse(b),d);d.license.title='changed';assert.notEqual(p.source.descriptor.license.title,'changed');assert.ok(Object.isFrozen(p));assert.ok(Object.isFrozen(p.source.descriptor));assert.throws(()=>{p.row.raw.funding='1';});
});
test('actual-byte verification catches plausible forged locator and unselected-byte changes',()=>{
 const b=csv([row({countryCode:'USA',id:'2'}),row()]),p=make(parse(b),source(b));assert.deepEqual(verify(p,b),p);
 const q=copy(p);q.row.locator.rawSha256='0'.repeat(64);assert.doesNotThrow(()=>validate(reseal(q)));assert.throws(()=>verify(reseal(q),b));
 const changed=csv([row({countryCode:'USA',id:'2',funding:'79460645'}),row()]);assert.throws(()=>verify(p,changed));
});
test('pure paths never consult current wall clock and permit no timestamp authority fields',()=>{
 const old=Date.now;Date.now=()=>{throw Error('wall clock');};try{const p=projection();assert.deepEqual(validate(p),p);assert.throws(()=>validate({...p,retrievedAt:'2026-11-08T00:00:00Z'}));}finally{Date.now=old;}
});
