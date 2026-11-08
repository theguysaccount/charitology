/** Explicit GROUP-only PG17 entry. Not part of the legacy *.test.mjs glob. */
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createGroupCi17Profile } from "./fixtures/participation-groups-ci17-profile.mjs";
import { openGroupCi17BusinessFixture, closeGroupCi17BusinessFixture } from "./fixtures/participation-groups.mjs";
import { GROUP_BUSINESS_CASE_MANIFEST, prepareGroupBusinessJourney, runGroupBusinessCase, readGroupBusinessEvidence } from "./fixtures/participation-groups-business.mjs";

let profile,fixture,journey,failed=false,registered=false;
const emit=value=>process.stdout.write(JSON.stringify(value)+"\n");
try{
 profile=await createGroupCi17Profile();
 assert.equal(GROUP_BUSINESS_CASE_MANIFEST.length,15);assert.equal(new Set(GROUP_BUSINESS_CASE_MANIFEST.map(x=>x.id)).size,15);
 assert(GROUP_BUSINESS_CASE_MANIFEST.every((x,i)=>x.id==="BG"+String(i+1).padStart(2,"0")&&x.name.startsWith(x.id+" ")));
 before(async()=>{
  try{fixture=await openGroupCi17BusinessFixture(profile);journey=await prepareGroupBusinessJourney(fixture);}
  catch{failed=true;throw Error("GROUP_CI17_FIXTURE_PREPARATION_REFUSED");}
 });
 for(const item of GROUP_BUSINESS_CASE_MANIFEST)test("group "+item.id+": "+item.name,async t=>{
  if(failed){t.skip("A prior actual case failed; no later business operation was attempted.");return;}
  try{emit(await runGroupBusinessCase(journey,item.id));}
  catch{failed=true;if(journey)emit({format:"group-business-case-failure",caseId:item.id,evidence:readGroupBusinessEvidence(journey)});throw Error("GROUP_CI17_CASE_REFUSED");}
 });
 after(async()=>{
  let cleanupError=false;
  try{if(fixture)emit(await closeGroupCi17BusinessFixture(fixture,failed?Error("GROUP_CI17_PRIOR_FAILURE"):null));}
  catch{cleanupError=true;}
  const evidence=journey?readGroupBusinessEvidence(journey):null;
  emit({format:"group-business-ci17-final-cases",evidence,cleanups:profile.cleanupsAfter(0)});
  try{
   const final=await profile.finish();emit(final);
   assert(!cleanupError&&!failed&&evidence&&evidence.tests===15&&evidence.pass===15&&evidence.fail===0&&evidence.next===15&&!evidence.active&&!evidence.failed&&evidence.providerCalls===0);
   assert.deepEqual(evidence.cases.map(x=>x.id),GROUP_BUSINESS_CASE_MANIFEST.map(x=>x.id));
  }catch{throw Error("GROUP_CI17_FINAL_REFUSED");}
  finally{await profile.abandon();}
 });
 registered=true;
}catch{
 if(profile&&!registered)await profile.abandon();
 process.stderr.write("GROUP_CI17_PRETEST_REFUSAL\n");process.exitCode=1;
}
