/** Command boundaries with declared fictional SQL booleans. Not actual SQL
 * clock/equality semantics, PostgreSQL persistence, quota or rollback proof. */
import test,{mock} from 'node:test';import assert from 'node:assert/strict';
const security=await import('../lib/security.mjs');
let identities=0,budgets=0,stores=0;
mock.module(import.meta.resolve('../lib/security.mjs'),{namedExports:{...security,id:()=>{identities++;throw Object.assign(Error('Intentional first-real-identity boundary'),{code:'fake_identity_boundary'});}}});
mock.module(new URL('../lib/participation-recurrence-capacity.mjs',import.meta.url).href,{namedExports:{checkParticipationRecurrenceBudget:async()=>{budgets++;return{testOnly:true};},checkParticipationRecurrencePendingBudget:async()=>{throw Error('Not Create');},checkParticipationRecurrenceFinalCapacity:async()=>{throw Error('No final capacity at first-identity boundary');}}});
mock.module(new URL('../lib/database.mjs',import.meta.url).href,{namedExports:{storePreview:async()=>{stores++;throw Error('No preview may be stored at this boundary');},commitPreview:async()=>{throw Error('Not Create');},audit:async()=>{throw Error('No audit');},saveRecord:async()=>{throw Error('No child');}}});
const {planParticipationRecurrence,previewParticipationRecurrence,RECURRENCE_COMMAND_SQL}=await import('../lib/participation-recurrence-commands.mjs');
const {fakeContext,ORG,session}=await import('./fixtures/recurrence-fake-context.mjs');
const reset=()=>{identities=0;budgets=0;stores=0;};
const planning=()=>({sourceId:'fictional-template',sourceRevision:1,intervalWeeks:1,count:2,exceptions:[],resolutions:[1,2].map(sequence=>({sequence,start:null,end:null}))});
const args=input=>({org:ORG,session:session(),input});
async function previewInput(f){const out=await planParticipationRecurrence(f.c,args(planning()));return{sourceId:out.source.id,sourceRevision:out.source.revision,schedule:out.schedule,titles:[1,2].map(sequence=>({sequence,title:'Fictional occurrence '+sequence}))};}
test('preview false eligibility for declared past/equal cases refuses before real identities, budget or saved intent',async()=>{
  // These two declared DB-result cases are NOT an actual SQL clock boundary
  // test. The fixed SQL uses strict >; actual PG past/equal evidence remains due.
  for(const declared of ['past','equal']){const f=fakeContext(),input=await previewInput(f);f.previewEligible=false;reset();
    await assert.rejects(()=>previewParticipationRecurrence(f.c,args(input)),e=>e.status===422&&e.code==='recurrence_future'&&e.message.includes('Skip or replace past dates'));
    assert.equal(identities,0,declared);assert.equal(budgets,0);assert.equal(stores,0);assert.equal(f.previewEligibilityChecks,1);assert.equal(f.domainClocks,0);assert.equal(f.writes,0);assert.deepEqual(f.previews,[]);
    const q=f.calls.find(x=>x.sql===RECURRENCE_COMMAND_SQL.previewEligibility);assert.deepEqual(q.args,[['2026-11-08T09:00:00.123Z','2026-11-15T09:00:00.123Z']]);assert.equal(q.sql.includes('start_at>p.at'),true);assert.equal(q.sql.includes('at_exact'),false);
  }
});
test('preview eligible result reaches budget then first real identity with only server-resolved starts',async()=>{
  const f=fakeContext(),input=await previewInput(f);reset();await assert.rejects(()=>previewParticipationRecurrence(f.c,args(input)),e=>e.code==='fake_identity_boundary');assert.equal(f.previewEligibilityChecks,1);assert.equal(budgets,1);assert.equal(identities,1);assert.equal(stores,0);assert.equal(f.domainClocks,0);assert.equal(f.writes,0);
});
test('preview requires exact current source anchor and ready calendar before checking future eligibility',async()=>{
  const f=fakeContext(),input=await previewInput(f),wrong=structuredClone(input);wrong.schedule.anchor.startCivil='2026-11-09T09:00:00.123';wrong.schedule.anchor.endCivil='2026-11-09T10:00:00.456';reset();await assert.rejects(()=>previewParticipationRecurrence(f.c,args(wrong)),e=>e.code==='recurrence_draft_anchor');assert.equal(f.previewEligibilityChecks,0);assert.equal(identities,0);assert.equal(budgets,0);
  const fold=fakeContext();Object.assign(fold.records[0].data,{startAt:'2026-10-25T01:10:00.123-04:00',endAt:'2026-10-25T01:40:00.456-04:00',timeZone:'America/New_York'});const unresolved=await previewInput(fold);reset();await assert.rejects(()=>previewParticipationRecurrence(fold.c,args(unresolved)),e=>e.code==='recurrence_draft_not_ready');assert.equal(fold.previewEligibilityChecks,0);assert.equal(identities,0);assert.equal(stores,0);
});
test('preview eligibility admits one closed boolean result and never accepts a caller eligibility override',async()=>{
  for(const driver of [[],[{eligible:null}],[{eligible:'true'}],[{eligible:true,at:'2026-11-01T00:00:00Z'}]]){const f=fakeContext(),input=await previewInput(f),query=f.c.query;f.c.query=async(sql,a)=>sql===RECURRENCE_COMMAND_SQL.previewEligibility?{rows:driver,rowCount:driver.length}:query(sql,a);reset();await assert.rejects(()=>previewParticipationRecurrence(f.c,args(input)));assert.equal(identities,0);assert.equal(budgets,0);assert.equal(stores,0);assert.equal(f.writes,0);}
  const f=fakeContext(),input=await previewInput(f);reset();await assert.rejects(()=>previewParticipationRecurrence(f.c,args({...input,eligible:true})));assert.equal(f.previewEligibilityChecks,0);assert.equal(identities,0);
});
