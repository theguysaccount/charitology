/** Resource-free negative contracts: no valid profile/factory/driver/SQL. */
import test from "node:test";
import assert from "node:assert/strict";
import { GROUP_BUSINESS_CASE_MANIFEST, checkedGroupBusinessCaseId, prepareGroupBusinessJourney, runGroupBusinessCase, readGroupBusinessEvidence } from "../test-db/fixtures/participation-groups-business.mjs";
import { openGroupCi17BusinessFixture, requireGroupCi17BusinessFixture, closeGroupCi17BusinessFixture } from "../test-db/fixtures/participation-groups.mjs";

const code=expected=>error=>error.code===expected;
const declared=()=>({format:"group-ci17-business-fixture",version:1});
test("GROUP canonical manifest is exactly15 ordered distinct cases with no private expiry case",()=>{
 assert.equal(GROUP_BUSINESS_CASE_MANIFEST.length,15);assert(Object.isFrozen(GROUP_BUSINESS_CASE_MANIFEST));
 assert.equal(new Set(GROUP_BUSINESS_CASE_MANIFEST.map(x=>x.id)).size,15);
 for(let i=0;i<15;i++){const x=GROUP_BUSINESS_CASE_MANIFEST[i];assert.deepEqual(Object.keys(x),["id","name"]);assert(Object.isFrozen(x));assert.equal(x.id,"BG"+String(i+1).padStart(2,"0"));assert(x.name.startsWith(x.id+" "));}
 assert(!GROUP_BUSINESS_CASE_MANIFEST.some(x=>x.id==="BG16"||/token genuinely expires/.test(x.name)));
 assert.throws(()=>{GROUP_BUSINESS_CASE_MANIFEST.push({id:"BG16",name:"fake"});},TypeError);
});
test("GROUP pure case-order selector refuses aliases, duplicate/out-of-order IDs and privateBG16",()=>{
 for(let i=0;i<15;i++)assert.equal(checkedGroupBusinessCaseId("BG"+String(i+1).padStart(2,"0"),i),GROUP_BUSINESS_CASE_MANIFEST[i].id);
 for(const [id,index]of [["BG01",1],["BG02",0],["BG15",13],["BG16",15],["BG1",0],["bg01",0],["BG01/",0],["BG01",-1],["BG01",0.5],["BG01","0"],[new String("BG01"),0],[undefined,0],["BG01",NaN]])assert.throws(()=>checkedGroupBusinessCaseId(id,index),code("GROUP_BUSINESS_CASE_ORDER"));
});
test("GROUP fixture cannot be opened by declared data or arbitrary capability callbacks",async()=>{
 let calls=0;
 const values=[undefined,null,{},declared(),Object.freeze(declared()),{ownerUrl:"fictional",runtimeUrl:"fictional",assertTarget(){calls++;},watch(){calls++;}},new Proxy({}, {get(){calls++;throw Error("TRAP");}})];
 for(const value of values)await assert.rejects(openGroupCi17BusinessFixture(value),code("GROUP_CI17_AUTHORITY"));
 await assert.rejects(openGroupCi17BusinessFixture(),code("GROUP_CI17_FIXTURE_AUTHORITY"));
 await assert.rejects(openGroupCi17BusinessFixture(undefined,()=>{calls++;}),code("GROUP_CI17_FIXTURE_AUTHORITY"));assert.equal(calls,0);
});
test("GROUP unminted fixture values never reveal resources or start a journey",async()=>{
 let calls=0;const callback={query(){calls++;},tx(){calls++;}},proxy=new Proxy({}, {get(){calls++;throw Error("TRAP");}});
 for(const value of [undefined,null,declared(),{...declared(),db:callback,owner:callback},proxy]){
  assert.throws(()=>requireGroupCi17BusinessFixture(value),code("GROUP_CI17_FIXTURE_AUTHORITY"));
  await assert.rejects(prepareGroupBusinessJourney(value),code("GROUP_CI17_FIXTURE_AUTHORITY"));
  await assert.rejects(closeGroupCi17BusinessFixture(value),code("GROUP_CI17_FIXTURE_AUTHORITY"));
 }
 assert.equal(calls,0);
});
test("GROUP declared/frozen journey data cannot run a case or manufacture retained evidence",async()=>{
 let traps=0;const proxy=new Proxy({}, {get(){traps++;throw Error("TRAP");}});
 for(const value of [undefined,null,declared(),Object.freeze({format:"group-business-journey",version:1}),{next:0,records:[{id:"BG01",status:"PASS"}]},proxy]){
  await assert.rejects(runGroupBusinessCase(value,"BG01"),code("GROUP_BUSINESS_CONTRACT"));
  assert.throws(()=>readGroupBusinessEvidence(value),code("GROUP_BUSINESS_CONTRACT"));
 }
 assert.equal(traps,0);
});
test("GROUP public operations reject extra callback arguments before any valid resource access",async()=>{
 let calls=0;const callback=()=>{calls++;};
 await assert.rejects(prepareGroupBusinessJourney(undefined,callback),code("GROUP_BUSINESS_CONTRACT"));
 await assert.rejects(runGroupBusinessCase(undefined,"BG01",callback),code("GROUP_BUSINESS_CONTRACT"));
 await assert.rejects(closeGroupCi17BusinessFixture(undefined,undefined,callback),code("GROUP_CI17_FIXTURE_AUTHORITY"));assert.equal(calls,0);
});
