/** Inert definitions and pure grammar/brand boundaries only. No factory is
 * called, actual runtime loaded, target descriptor read or pg driver opened. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {RECURRENCE_CASE_NAMES,runRecurrenceCases} from '../test-db/fixtures/participation-recurrence-cases.mjs';
import {checkedRecurrenceCi17Inputs,checkedRecurrenceCi17Bootstrap,checkedRecurrenceCi17Role,requireRecurrenceCi17Profile} from '../test-db/fixtures/participation-recurrence-ci17-profile.mjs';
import {requireRecurrenceFixture} from '../test-db/fixtures/participation-recurrence.mjs';
import {loadRecurrenceModules,checkedRecurrenceCi17RuntimeManifest} from '../test-db/fixtures/participation-recurrence-runtime.mjs';
import {runRecurrenceCi17,checkedRecurrenceCi17OutputRoot} from '../test-db/participation-recurrence.ci17.mjs';
const input=()=>({marker:'github-recurrence-pg17-v1',githubActions:'true',githubSha:'a'.repeat(40),runId:'1',runAttempt:'1',repository:'fictional/recurrence',databaseUrl:'postgresql://os_test_owner:ci-owner-only-password@127.0.0.1:5432/charitology_os_ci',runtimeUrl:'postgresql://os_test_app:ci-app-only-password@127.0.0.1:5432/charitology_os_ci'});
const role=()=>({database:'charitology_os_ci',role:'os_test_app',address:'127.0.0.1',port:5432,version:'17.11',version_num:170011,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolinherit:false,rolreplication:false,rolbypassrls:false,rolcanlogin:true,memberships:0,statement_timeout_ms:30000,lock_timeout_ms:3000,idle_timeout_ms:30000,transaction_timeout_ms:120000});
test('eighteen inert group definitions and the explicit CI runner import without being called',()=>{assert.equal(RECURRENCE_CASE_NAMES.length,18);assert.equal(new Set(RECURRENCE_CASE_NAMES).size,18);assert(RECURRENCE_CASE_NAMES.every((v,i)=>v.startsWith('RR'+String(i+1).padStart(2,'0')+' ')));assert.equal(typeof runRecurrenceCases,'function');assert.equal(typeof runRecurrenceCi17,'function');});
test('closed CI pure inputs accept one exact descriptor shape and refuse marker target and inherited fields',()=>{const data=checkedRecurrenceCi17Inputs(input());assert(Object.isFrozen(data));for(const more of [{marker:'github-crm-pg17-v1'},{databaseUrl:input().databaseUrl.replace('127.0.0.1','example.invalid')},{runtimeUrl:input().runtimeUrl+'&x=1'},{runId:'0'},{extra:true}])assert.throws(()=>checkedRecurrenceCi17Inputs({...input(),...more}));assert.throws(()=>checkedRecurrenceCi17Inputs(Object.assign(Object.create({hidden:true}),input())));});
test('pure actual-role-shaped data never becomes a profile capability and runtime elevated flags refuse',()=>{const boot={...role(),role:'os_test_owner',rolsuper:true,rolbypassrls:true,directory:'/fictional/isolated-data',system:'1234567890123456789',started:'1'},data=checkedRecurrenceCi17Bootstrap(boot);checkedRecurrenceCi17Role(role(),'runtime',data);for(const more of [{rolsuper:true},{rolbypassrls:true},{memberships:1},{rolinherit:true},{transaction_timeout_ms:0}])assert.throws(()=>checkedRecurrenceCi17Role({...role(),...more},'runtime',data));for(const candidate of [data,checkedRecurrenceCi17Inputs(input()),{kind:'recurrence-ci17'}])assert.throws(()=>requireRecurrenceCi17Profile(candidate));});
test('neither foreign or caller-shaped profile/fixture handle admits lazy runtime loading',async()=>{for(const value of [{},{kind:'recurrence-local18',expectedServerVersionNum:180006},{kind:'recurrence-ci17',expectedServerVersionNum:170011},Object.freeze({format:'recurrence-owned-business-fixture',version:1})]){assert.throws(()=>requireRecurrenceCi17Profile(value));assert.throws(()=>requireRecurrenceFixture(value));await assert.rejects(()=>loadRecurrenceModules(value));}});

const manifestData=async()=>JSON.parse(await readFile(new URL('../test-db/fixtures/participation-recurrence-runtime-manifest-v1.json',import.meta.url),'utf8'));
test('portable manifest is closed immutable data and malformed graph inputs never become authority',async()=>{
 const original=await manifestData(),admitted=checkedRecurrenceCi17RuntimeManifest(original);assert.equal(admitted.files.length,172);assert(Object.isFrozen(admitted)&&Object.isFrozen(admitted.files)&&admitted.files.every(Object.isFrozen));
 const typeNames=admitted.files.filter(row=>row.name.endsWith('.ts')||row.name.endsWith('.mts')).map(row=>row.name);
 assert.deepEqual(typeNames,['incubator-bridge-types.ts','incubator-native-entry.ts','learning-native-entry.ts','learning-transport.d.mts','learning-types.ts']);
 for(const name of ['incubator-bridge-types-future.ts','incubator-bridge-types-future.d.mts']){
  const unknown=structuredClone(original),index=unknown.files.findIndex(row=>row.name==='incubator-bridge-types.ts');assert(index>=0);unknown.files[index].name=name;
  const order=unknown.files.map(row=>row.name);assert.deepEqual(order,[...order].sort());assert.throws(()=>checkedRecurrenceCi17RuntimeManifest(unknown));
 }
 const bad=[];for(const mutate of [v=>{v.extra=true;},v=>{v.files.pop();},v=>{v.files[1].name=v.files[0].name;},v=>{v.files[0].name='../schema.sql';},v=>{v.files[0].sha256='F'.repeat(64);},v=>{v.files[0].bytes=0;},v=>{v.files[0].extra=true;},v=>{delete v.files[0];},v=>{v.files.extra=true;},v=>{[v.files[0],v.files[1]]=[v.files[1],v.files[0]];}]){const value=structuredClone(original);mutate(value);bad.push(value);}
 let called=0;const accessor=structuredClone(original);Object.defineProperty(accessor,'files',{enumerable:true,get(){called++;return original.files;}});bad.push(accessor);
 const arrayAccessor=structuredClone(original);Object.defineProperty(arrayAccessor.files,'0',{enumerable:true,get(){called++;return original.files[0];}});bad.push(arrayAccessor);
 bad.push(new Proxy(original,{}));for(const value of bad)assert.throws(()=>checkedRecurrenceCi17RuntimeManifest(value));assert.equal(called,0);
 assert.throws(()=>requireRecurrenceCi17Profile(admitted));await assert.rejects(()=>loadRecurrenceModules(admitted));
});
test('CI evidence root data must exactly match the separate canonical runner temp root outside the checkout',()=>{
 const temp='/fictional/runner-temp',checkout='/fictional/repository';assert.equal(checkedRecurrenceCi17OutputRoot(temp,temp,checkout),temp);
 for(const [declared,runner,repo]of [[temp,'/fictional/other-temp',checkout],['relative','relative',checkout],['/fictional/runner-temp/','/fictional/runner-temp/',checkout],[checkout,checkout,checkout],[checkout+'/inside',checkout+'/inside',checkout],['/fictional','/fictional',checkout],[temp+'\0',temp+'\0',checkout],[temp,temp,'relative-checkout']])assert.throws(()=>checkedRecurrenceCi17OutputRoot(declared,runner,repo));
 assert.throws(()=>requireRecurrenceCi17Profile({outputRoot:checkedRecurrenceCi17OutputRoot(temp,temp,checkout)}));
});
