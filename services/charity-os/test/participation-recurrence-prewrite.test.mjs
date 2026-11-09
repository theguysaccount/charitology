/** Command unit boundary only: capacity and persistence helpers deliberately
 * stubbed. Real context/store/calendar guards use fictional SELECT results.
 * No SQL expiry, natural elapsed deadline, child INSERT or rollback proof. */
import test,{mock} from 'node:test';import assert from 'node:assert/strict';
let childCalls=0;
mock.module(new URL('../lib/participation-recurrence-capacity.mjs',import.meta.url).href,{namedExports:{checkParticipationRecurrenceBudget:async()=>({testOnly:true}),checkParticipationRecurrencePendingBudget:async()=>({testOnly:true}),checkParticipationRecurrenceFinalCapacity:async()=>({testOnly:true})}});
mock.module(new URL('../lib/database.mjs',import.meta.url).href,{namedExports:{storePreview:async()=>{},commitPreview:async()=>{},audit:async()=>{throw Error('No audit should run at this boundary');},saveRecord:async()=>{childCalls++;throw Object.assign(Error('Intentional first-child call boundary'),{code:'fake_first_child_boundary'});}}});
const {createParticipationRecurrence}=await import('../lib/participation-recurrence-commands.mjs');
const {fakeContext,packets,ORG,session,request}=await import('./fixtures/recurrence-fake-context.mjs');
test('RR-EXPIRY-03 exact final clock equal/later refuses before first child; one microsecond before reaches child boundary',async()=>{
  for(const [at,expected] of [['2026-11-02T00:30:00.000001Z','recurrence_preview'],['2026-11-02T00:30:00.000002Z','recurrence_preview'],['2026-11-02T00:30:00.000000Z','fake_first_child_boundary']]){
    const f=fakeContext();await packets(f,{committed:false});const original=f.c.query;f.c.query=async(sql,args)=>{if(sql.includes('WITH processing AS MATERIALIZED')){f.domainClocks++;return{rows:[{at_exact:at}],rowCount:1};}return original(sql,args);};childCalls=0;
    await assert.rejects(()=>createParticipationRecurrence(f.c,{org:ORG,session:session(),input:request()}),e=>e.code===expected);assert.equal(childCalls,expected==='recurrence_preview'?0:1);assert.equal(f.domainClocks,1);assert.equal(f.writes,0);
  }
});
