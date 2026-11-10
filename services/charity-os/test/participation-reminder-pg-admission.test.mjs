/** Pure profile grammar only. No valid zero-argument factory, driver or SQL. */
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {checkedReminderCi17Inputs,checkedReminderCi17Url,checkedReminderCi17Bootstrap,checkedReminderCi17Role,requireReminderCi17Profile,createReminderCi17Profile} from '../test-db/fixtures/participation-reminder-ci17-profile.mjs';
import {requireReminderLocal18Profile,createReminderLocal18Profile} from '../test-db/fixtures/participation-reminder-local18-profile.mjs';
import {createReminderTestContext,requireReminderTestContext} from '../test-db/fixtures/participation-reminder-test-context.mjs';
import {checkedReminderRuntimeBinding,checkedReminderRuntimeManifest,REMINDER_RUNTIME_MODULES,REMINDER_RUNTIME_DATA_FILES,REMINDER_RUNTIME_SOURCE_LIMITS} from '../test-db/fixtures/participation-reminder-binding.mjs';
import {checkedReminderLocal18OutputRoot} from '../test-db/participation-reminder.local18.mjs';
import {admitReminderTraceBudget} from '../test-db/fixtures/participation-reminder.mjs';
const bootUrl='postgresql://os_test_owner:ci-owner-only-password@127.0.0.1:5432/charitology_os_ci';
const runtimeUrl='postgresql://os_test_app:ci-app-only-password@127.0.0.1:5432/charitology_os_ci';
const inputs=()=>({marker:'github-reminder-pg17-v1',githubActions:'true',githubSha:'a'.repeat(40),runId:'1',runAttempt:'1',repository:'fictional/repository',databaseUrl:bootUrl,runtimeUrl});
const boot=()=>({database:'charitology_os_ci',role:'os_test_owner',address:'172.18.0.2',port:5432,version:'17.11 (fictional grammar row)',version_num:170011,rolsuper:true,rolcreatedb:true,rolcreaterole:true,rolinherit:true,rolreplication:true,rolbypassrls:true,rolcanlogin:true,memberships:0,statement_timeout_ms:30000,lock_timeout_ms:3000,idle_timeout_ms:30000,transaction_timeout_ms:120000,directory:'/fictional/owned/data',system:'1234567890123456789',started:'1900000000'});
const role=kind=>{const {directory,system,started,...v}=boot();return{...v,role:kind==='owner'?'os_reminder_ci_owner':'os_test_app',rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolinherit:false,rolreplication:false,rolbypassrls:kind==='owner'};};
test('composed reminder evidence retains descriptors beyond the first failed 32768-query bound',()=>{
 assert.equal(admitReminderTraceBudget(32768,256,8*1024*1024),8*1024*1024+257);
 assert.equal(admitReminderTraceBudget(131071,1,131073),131075);
 assert.throws(()=>admitReminderTraceBudget(131072,1,131075),e=>e.code==='REMINDER_FIXTURE_TRACE_LIMIT');
});
test('trace bytes include array brackets and commas and refuse the first byte over 32MiB',()=>{
 const max=32*1024*1024;
 assert.equal(admitReminderTraceBudget(0,512,2),514);
 assert.equal(admitReminderTraceBudget(1,512,max-513),max);
 assert.throws(()=>admitReminderTraceBudget(1,512,max-512),e=>e.code==='REMINDER_FIXTURE_TRACE_BYTES_LIMIT'&&e.traceNextEncodedBytes===max+1);
});
test('trace descriptors retain their independent 512-byte cap',()=>{
 assert.equal(admitReminderTraceBudget(1,512,514),1027);
 assert.throws(()=>admitReminderTraceBudget(1,513,514),e=>e.code==='REMINDER_FIXTURE_TRACE_ENTRY_LIMIT');
});
test('invalid trace accounting cannot authorize a descriptor',()=>{
 for(const args of [[-1,1,2],[0.5,1,2],[0,0,2],[0,1.5,2],[0,1,1],[0,1,NaN],[0,1,Number.MAX_SAFE_INTEGER+1]])assert.throws(()=>admitReminderTraceBudget(...args),e=>e.code==='REMINDER_FIXTURE_TRACE_STATE');
});
test('closed reminder CI context is data only and rejects old-family/ordinary CI markers',()=>{
 assert(Object.isFrozen(checkedReminderCi17Inputs(inputs())));
 for(const change of [{marker:'github-recurrence-pg17-v1'},{marker:undefined},{githubActions:'false'},{githubSha:'bad'},{runAttempt:'0'},{CI:'true'}])assert.throws(()=>checkedReminderCi17Inputs({...inputs(),...change}));
});
test('exact closed CI URL grammar does not admit remote targets or query authority',()=>{
 assert.equal(checkedReminderCi17Url(bootUrl,'bootstrap'),bootUrl+'?sslmode=disable');
 for(const u of [bootUrl.replace('127.0.0.1','localhost'),bootUrl.replace(':5432',':65204'),runtimeUrl,bootUrl+'#x',bootUrl+'?options=-csearch_path=public',bootUrl+'?sslmode=require'])assert.throws(()=>checkedReminderCi17Url(u,'bootstrap'));
});
test('source accessors and proxies cannot execute during input admission',()=>{
 let count=0;const v=inputs();Object.defineProperty(v,'marker',{enumerable:true,get(){count++;return'github-reminder-pg17-v1';}});assert.throws(()=>checkedReminderCi17Inputs(v));assert.equal(count,0);
 assert.throws(()=>checkedReminderCi17Inputs(new Proxy(inputs(),{ownKeys(){count++;return[];}})));assert.equal(count,0);
});
test('declared source/target and old-family lookalikes do not mint either opaque profile',()=>{
 const data=checkedReminderCi17Inputs(inputs());for(const v of [undefined,null,data,{kind:'reminder-ci17',assertTarget(){}},{kind:'reminder-local18',ownerUrl:bootUrl}])for(const require of [requireReminderCi17Profile,requireReminderLocal18Profile])assert.throws(()=>require(v));
});
test('invalid factory arguments refuse before source binding config or callback access',async()=>{
 let calls=0;for(const factory of [createReminderCi17Profile,createReminderLocal18Profile])await assert.rejects(factory({connect(){calls++;}}),e=>/^REMINDER_(CI17|LOCAL18)_AUTHORITY$/.test(e.code));assert.equal(calls,0);
});
test('minimum owner and runtime role grammar pins server identity privileges memberships and timeouts',()=>{
 const identity=checkedReminderCi17Bootstrap(boot());for(const kind of ['owner','runtime']){
  assert(Object.isFrozen(checkedReminderCi17Role(role(kind),kind,identity)));
  for(const change of [{rolsuper:true},{rolcreatedb:true},{rolcreaterole:true},{rolinherit:true},{rolreplication:true},{memberships:1},{address:'172.18.0.3'},{statement_timeout_ms:0},{lock_timeout_ms:0},{idle_timeout_ms:0},{transaction_timeout_ms:0},{rolbypassrls:kind!=='owner'}])assert.throws(()=>checkedReminderCi17Role({...role(kind),...change},kind,identity));
 }
});
test('PG18 data cannot qualify the separate fixed PG17 CI service',()=>{
 for(const change of [{version:'18.6',version_num:180006},{role:'os_reminder_ci_owner'},{port:65204},{directory:'relative'},{system:'unknown'},{started:''}])assert.throws(()=>checkedReminderCi17Bootstrap({...boot(),...change}));
});

test('a caller-shaped fixture or context cannot reach helper callbacks or SQL',()=>{
 let calls=0;const options={};Object.defineProperty(options,'onArtifact',{enumerable:true,get(){calls++;return()=>{};}});
 for(const value of [undefined,null,{},Object.freeze({format:'reminder-owned-business-fixture',version:1}),{db:{query(){calls++;}},modules:{}}]){assert.throws(()=>createReminderTestContext(value,options));assert.throws(()=>requireReminderTestContext(value));}assert.equal(calls,0);
});

// Invented file triples below are grammar data, not filesystem/hash qualification.
const runtimeBinding=patch=>({format:'charitology-reminder-pg-runtime-binding',version:1,status:'BOUND',runtimeManifestSha256:'a'.repeat(64),...patch});
const runtimeManifest=()=>{
 const names=new Set([...Object.values(REMINDER_RUNTIME_MODULES),'schema.sql',...REMINDER_RUNTIME_DATA_FILES]);let i=0;while(names.size<140)names.add('zz-fixture-'+String(i++).padStart(3,'0')+'.mjs');
 return{format:'charitology-reminder-pg-runtime-manifest',version:1,files:[...names].sort().map(name=>({name,bytes:1,sha256:'a'.repeat(64)}))};
};
test('tracked runtime binding has no self-commit fields and cannot admit an old shape',()=>{
 assert(Object.isFrozen(checkedReminderRuntimeBinding(runtimeBinding())));
 assert(Object.isFrozen(checkedReminderRuntimeBinding(runtimeBinding({status:'UNBOUND',runtimeManifestSha256:null}))));
 for(const change of [{sourceCommit:'b'.repeat(40)},{sourceTree:'c'.repeat(40)},{status:'BOUND',runtimeManifestSha256:null},{status:'UNBOUND'},{status:'other'},{runtimeManifestSha256:'A'.repeat(64)}])assert.throws(()=>checkedReminderRuntimeBinding(runtimeBinding(change)));
});
test('runtime binding getters and proxies refuse before executing caller code',()=>{
 let calls=0;const value=runtimeBinding();Object.defineProperty(value,'status',{enumerable:true,get(){calls++;return'BOUND';}});assert.throws(()=>checkedReminderRuntimeBinding(value));assert.equal(calls,0);
 assert.throws(()=>checkedReminderRuntimeBinding(new Proxy(runtimeBinding(),{ownKeys(){calls++;return[];}})));assert.equal(calls,0);
});
test('manifest grammar keeps exact named modules and data-only type leaves as frozen data',()=>{
 const value=checkedReminderRuntimeManifest(runtimeManifest());assert.equal(value.files.length,140);assert(Object.isFrozen(value)&&Object.isFrozen(value.files)&&value.files.every(Object.isFrozen));
 for(const data of [value,checkedReminderRuntimeBinding(runtimeBinding())])for(const require of [requireReminderCi17Profile,requireReminderLocal18Profile])assert.throws(()=>require(data));
});
test('manifest refuses missing modules path traversal executable type additions duplicates and order drift',()=>{
 for(const name of ['../outside.mjs','/outside.mjs','unapproved.ts','entry.js','bad name.mjs']){const value=runtimeManifest();value.files[0]={...value.files[0],name};assert.throws(()=>checkedReminderRuntimeManifest(value));}
 for(const removed of ['database.mjs','schema.sql']){const value=runtimeManifest();value.files=value.files.filter(r=>r.name!==removed);value.files.push({name:'zz-replacement.mjs',bytes:1,sha256:'a'.repeat(64)});value.files.sort((a,b)=>a.name<b.name?-1:1);assert.throws(()=>checkedReminderRuntimeManifest(value));}
 const duplicate=runtimeManifest();duplicate.files[1]={...duplicate.files[0]};assert.throws(()=>checkedReminderRuntimeManifest(duplicate));const unsorted=runtimeManifest();unsorted.files.reverse();assert.throws(()=>checkedReminderRuntimeManifest(unsorted));
});
test('manifest sparse arrays accessors and proxies are rejected without caller execution',()=>{
 let calls=0;const getter=runtimeManifest();Object.defineProperty(getter.files[0],'name',{enumerable:true,get(){calls++;return'database.mjs';}});assert.throws(()=>checkedReminderRuntimeManifest(getter));assert.equal(calls,0);
 const proxy=runtimeManifest();proxy.files=new Proxy(proxy.files,{getOwnPropertyDescriptor(){calls++;return undefined;}});assert.throws(()=>checkedReminderRuntimeManifest(proxy));assert.equal(calls,0);
 const sparse=runtimeManifest();delete sparse.files[2];assert.throws(()=>checkedReminderRuntimeManifest(sparse));
});
test('manifest data budgets enforce independent count per-file and exact aggregate byte bounds',()=>{
 for(const size of [REMINDER_RUNTIME_SOURCE_LIMITS.filesMin-1,REMINDER_RUNTIME_SOURCE_LIMITS.filesMax+1]){const value=runtimeManifest();while(value.files.length<size)value.files.push({name:'zzz-extra-'+value.files.length+'.mjs',bytes:1,sha256:'a'.repeat(64)});value.files.length=size;assert.throws(()=>checkedReminderRuntimeManifest(value));}
 const large=runtimeManifest();large.files[0].bytes=REMINDER_RUNTIME_SOURCE_LIMITS.fileBytes+1;assert.throws(()=>checkedReminderRuntimeManifest(large));
 const exact=runtimeManifest(),each=Math.floor(REMINDER_RUNTIME_SOURCE_LIMITS.totalBytes/exact.files.length);exact.files.forEach(r=>r.bytes=each);exact.files.at(-1).bytes+=REMINDER_RUNTIME_SOURCE_LIMITS.totalBytes-each*exact.files.length;assert.equal(checkedReminderRuntimeManifest(exact).files.reduce((n,r)=>n+r.bytes,0),REMINDER_RUNTIME_SOURCE_LIMITS.totalBytes);
 exact.files.at(-1).bytes++;assert.throws(()=>checkedReminderRuntimeManifest(exact));
});

test('actual CI ROOT source literal produces the canonical directory required by runtime qualification',async()=>{
 const url=new URL('../test-db/fixtures/participation-reminder-ci17-profile.mjs',import.meta.url),text=await readFile(url,'utf8');
 const match=text.match(/^const ROOT = (.+);$/m);assert(match,'Actual qualified profile must declare its fixed ROOT');
 const fromDirectoryUrl=fileURLToPath(new URL('../../../../',url));let actual;
 // Closed source-literal control: both exact historical and corrected forms
 // use the real URL/fileURLToPath/path functions, never a target or factory.
 if(match[1]==='fileURLToPath(new URL("../../../../", import.meta.url))')actual=fromDirectoryUrl;
 else if(match[1]==='path.resolve(fileURLToPath(new URL("../../../../", import.meta.url)))')actual=path.resolve(fromDirectoryUrl);
 else assert.fail('Unexpected fixed ROOT grammar needs source review');
 assert.equal(actual,path.resolve(actual),'The actual CI ROOT literal must produce a canonical path without a trailing directory separator');
 assert.equal(actual,path.resolve(fromDirectoryUrl));
});

test('actual local output literal stays outside ACTIVE when the entry has its installed source location',async()=>{
 const url=new URL('../test-db/participation-reminder.local18.mjs',import.meta.url),text=await readFile(url,'utf8');
 const checkoutLine=text.match(/^const CHECKOUT=(['"])([^'"\n]+)\1;$/m),outputLine=text.match(/^const LOCAL_OUTPUT_ROOT=(.+);$/m);assert(checkoutLine&&outputLine);
 const checkout=checkoutLine[2],installed=pathToFileURL(path.join(checkout,'services','charity-os','test-db','participation-reminder.local18.mjs'));let actual;
 if(outputLine[1]==='path.resolve(fileURLToPath(new URL("../../../",import.meta.url)))')actual=path.resolve(fileURLToPath(new URL('../../../',installed)));
 else{assert(/^"[^"\n]+"$/.test(outputLine[1]),'Only a fixed private literal or the historical relative-root form is admitted');actual=JSON.parse(outputLine[1]);}
 assert.doesNotThrow(()=>checkedReminderLocal18OutputRoot(actual,actual,checkout),'Installed local output must not resolve inside the qualified checkout');
 assert.equal(actual,"/Users/jack/Documents/Codex/2026-10-25/i-m-continuing-my-project-charitology/work/os-private/learning-continuation-2026-11-05");
});
