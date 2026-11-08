/** Explicit FIELD-only PG17.11 entry. Never included in legacy *.test.mjs. */
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createHash } from "node:crypto";
import { createFieldCi17Profile } from "./fixtures/field-responses-ci17-profile.mjs";
import { openFieldCi17Fixture, closeFieldCi17Fixture, requireFieldCi17Fixture } from "./fixtures/field-responses.mjs";
import { FIELD_CASE_NAMES, runFieldCases } from "./fixtures/field-responses-cases.mjs";
import sql from "./fixtures/field-responses-sql.json" with {type:"json"};

let profile,fixture,caps,modules,caseWork,result,failed=false,registered=false;
const completed=[],artifacts=[];
const emit=value=>{const text=JSON.stringify(value);assert(Buffer.byteLength(text)<=2097152);process.stdout.write(text+"\n");};
async function actualModules(){return {
 database:await import("../lib/database.mjs"),modules:await import("../lib/modules.mjs"),
 security:await import("../lib/security.mjs"),handler:await import("../lib/handler.mjs"),
 backup:await import("../lib/backup.mjs"),workspace:await import("../lib/workspace-backup.mjs"),
 learning:await import("../lib/learning-capacity.mjs"),
};}
try{
 profile=await createFieldCi17Profile();
 assert.equal(FIELD_CASE_NAMES.length,14);assert.equal(new Set(FIELD_CASE_NAMES).size,14);
 assert(FIELD_CASE_NAMES.every((name,i)=>name.startsWith("FD"+String(i+1).padStart(2,"0")+" ")));
 before(async()=>{try{fixture=await openFieldCi17Fixture(profile);caps=requireFieldCi17Fixture(fixture);modules=await actualModules();}catch{failed=true;throw Error("FIELD_CI17_FIXTURE_PREPARATION_REFUSED");}});
 // One actual Node test executes all fourteen sequential, unchanged business
 // cases. JSON case records, not fabricated TAP subtest counts, distinguish them.
 test("FIELD actual fourteen-case handler and SQL journey",async()=>{
  try{
   caseWork=runFieldCases({...caps,modules,sql,expectedServerVersionNum:170011,expectedRuntimeRole:"os_test_app",
    onCase:async value=>{assert(value.number===completed.length+1&&value.name===FIELD_CASE_NAMES[value.number-1]);completed.push(value);const {number,name,status,code,diagnostic,lastCalls}=value;emit({format:"field-business-ci17-case",number,name,status,...(code?{code}:{}),...(diagnostic?{diagnostic}:{}),...(lastCalls?{lastCalls}:{})});},
    onArtifact:async(name,value)=>{const text=JSON.stringify(value);assert(/^[a-z0-9-]+\.json$/.test(name)&&Buffer.byteLength(text)<=2097152);const ref={name,bytes:Buffer.byteLength(text),sha256:createHash("sha256").update(text).digest("hex")};assert(!artifacts.some(x=>x.name===name));artifacts.push(ref);emit({format:"field-business-ci17-artifact-digest",...ref,bodyRetainedInCiLog:false});},
   });caps.track(caseWork);result=await caseWork;
   assert.equal(result.tests,14);assert.equal(result.pass,14);assert.equal(result.caseWorkSettled,true);assert.equal(result.providerCalls,0);
   assert.equal(completed.length,14);assert(completed.every((x,i)=>x.number===i+1&&x.name===FIELD_CASE_NAMES[i]&&x.status==="PASS"));
  }catch{failed=true;throw Error("FIELD_CI17_CASE_JOURNEY_REFUSED");}
 });
 after(async()=>{
  let cleanupError=false;
  // No schema teardown before the actual journey promise settles, including a
  // failure. Per-query/startup and CI job deadlines remain independently bounded.
  if(caseWork)await Promise.allSettled([caseWork]);
  try{if(fixture)emit(await closeFieldCi17Fixture(fixture,failed?Error("FIELD_CI17_PRIOR_FAILURE"):null));}catch{cleanupError=true;}
  try{
   const final=await profile.finish();emit(final);
   assert(!cleanupError&&!failed&&result&&completed.length===14&&result.tests===14&&result.pass===14&&result.caseWorkSettled&&result.providerCalls===0);
   emit({format:"field-business-ci17-final-cases",version:1,tests:14,pass:14,fail:0,skip:0,syntheticAuthNotRealSignIn:true,expiredRowSqlSeamNotNaturalExpiry:true,nodeTestCount:1,artifactDigestsOnly:artifacts,cleanupVerified:final.cleanupVerified,sourceCommit:final.sourceCommit,sourceTree:final.sourceTree,actualServerVersion:final.actualServerVersion,actualServerVersionNum:final.actualServerVersionNum});
  }catch{throw Error("FIELD_CI17_FINAL_REFUSED");}finally{await profile.abandon();}
 });registered=true;
}catch{if(profile&&!registered)await profile.abandon();process.stderr.write("FIELD_CI17_PRETEST_REFUSAL\n");process.exitCode=1;}
