/** Current installed resolver + fictional selected SQL rows/Request. No actual
 * DB session, READ ONLY enforcement, expiry, budget or persistence proof. */
import test from 'node:test';import assert from 'node:assert/strict';
import {planParticipationRecurrence,participationRecurrenceHistory} from '../lib/participation-recurrence-commands.mjs';
import {participationRecurrenceRoutes} from '../lib/participation-recurrence-routes.mjs';
import {fakeContext,packets,ORG,session} from './fixtures/recurrence-fake-context.mjs';
const input=()=>({sourceId:'fictional-template',sourceRevision:1,intervalWeeks:1,count:1,exceptions:[],resolutions:[{sequence:1,start:null,end:null}]}),args=(f,v=input())=>({org:ORG,session:session(),input:v});
test('server plan derives exact source zone/civil anchor and remains read-only unsaved data',async()=>{
  const f=fakeContext(),old=Date.now;Date.now=()=>{throw Error('No domain clock for plan');};let value;try{value=await planParticipationRecurrence(f.c,args(f));}finally{Date.now=old;}
  assert.deepEqual(Object.keys(value).sort(),['reviewKind','source','schedule','plan','savedPreview','processingTime'].sort());assert.equal(value.reviewKind,'schedule-plan-only');assert.equal(value.savedPreview,false);assert.equal(value.processingTime,'unassigned');assert.equal(value.plan.state,'ready');assert.equal(value.schedule.timeZone,'UTC');assert.deepEqual(value.schedule.anchor,{startCivil:'2026-11-08T09:00:00.123',endCivil:'2026-11-08T10:00:00.456'});assert.equal(f.previews.length,0);assert.equal(f.reports.length,0);assert.equal(f.writes,0);assert.equal(f.domainClocks,0);assert(!f.calls.some(x=>x.sql?.includes('FROM pg_class')));
});
test('fold endpoints return explicit candidates until both choices are supplied',async()=>{
  const f=fakeContext();Object.assign(f.records[0].data,{startAt:'2026-10-25T01:10:00.123-04:00',endAt:'2026-10-25T01:40:00.456-04:00',timeZone:'America/New_York'});
  const before=await planParticipationRecurrence(f.c,args(f));assert.equal(before.plan.state,'needs-review');const o=before.plan.occurrences[0];assert.equal(o.startResolution.kind,'fold');assert.deepEqual(o.startResolution.candidates.map(c=>c.choice),['earlier','later']);assert.deepEqual(o.startResolution.candidates.map(c=>c.offsetSeconds),[-14400,-18000]);assert(o.blockers.includes('start-choice-required'));assert(o.blockers.includes('end-choice-required'));
  const chosen=input();chosen.resolutions=[{sequence:1,start:'earlier',end:'later'}];const ready=await planParticipationRecurrence(f.c,args(f,chosen));assert.equal(ready.plan.state,'ready');assert.equal(ready.plan.occurrences[0].range.startAt,'2026-11-01T01:10:00.123-04:00');assert.equal(ready.plan.occurrences[0].range.endAt,'2026-11-01T01:40:00.456-05:00');assert.equal(f.writes,0);
});
test('gap, explicit replacement and all-skipped outcomes are visible without making a preview',async()=>{
  const f=fakeContext();Object.assign(f.records[0].data,{startAt:'2026-03-01T02:30:00.000-05:00',endAt:'2026-03-01T04:00:00.000-05:00',timeZone:'America/New_York'});
  const gap=await planParticipationRecurrence(f.c,args(f));assert.equal(gap.plan.state,'needs-review');assert.equal(gap.plan.occurrences[0].startResolution.kind,'gap');assert(gap.plan.occurrences[0].blockers.includes('start-gap'));
  const replace=input();replace.exceptions=[{sequence:1,kind:'replace',reason:'Fictional reviewed opening time',startCivil:'2026-03-08T03:30:00.000',endCivil:'2026-03-08T04:00:00.000'}];assert.equal((await planParticipationRecurrence(f.c,args(f,replace))).plan.state,'ready');
  const skip=input();skip.exceptions=[{sequence:1,kind:'skip',reason:'Fictional facility closure'}];const empty=await planParticipationRecurrence(f.c,args(f,skip));assert.equal(empty.plan.state,'empty');assert.equal(empty.plan.occurrences[0].range,null);assert.equal(empty.savedPreview,false);assert.equal(f.writes,0);
});
test('plan refuses stale revision and any client timezone/anchor/source/authority override',async()=>{
  for(const [key,value]of [['timeZone','UTC'],['anchor',{}],['source',{}],['authority',{}],['recordedAtExact','2026-11-08T00:00:00.000001Z']]){const f=fakeContext();await assert.rejects(()=>planParticipationRecurrence(f.c,args(f,{...input(),[key]:value})));assert.equal(f.writes,0);}
  const f=fakeContext(),stale=input();stale.sourceRevision=2;await assert.rejects(()=>planParticipationRecurrence(f.c,args(f,stale)),e=>e.code==='recurrence_stale');assert.equal(f.domainClocks,0);
});
test('plan route preflights before body and uses locked READ ONLY plus shared6/15min calendar bucket',async()=>{
  const f=fakeContext(),r=new Request(`https://os.invalid/api/orgs/${ORG}/participation-recurrence/plan`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input())}),response=await participationRecurrenceRoutes({request:r,db:f.db,session:session()});assert.equal(response.status,200);assert.equal((await response.json()).savedPreview,false);assert.deepEqual(f.transactions.map(x=>({readOnly:x.readOnly,lock:x.lock})),[{readOnly:true,lock:undefined},{readOnly:true,lock:true}]);assert(f.calls.some(x=>x.rate?.[0].startsWith('participation-recurrence-calendar:')&&x.rate[1]===6&&x.rate[2]===900));assert.equal(f.writes,0);
  const denied=fakeContext();denied.role='board_reader';let reads=0;const fake={method:'POST',url:r.url,headers:r.headers,get body(){reads++;throw Error('No body before permission');}};await assert.rejects(()=>participationRecurrenceRoutes({request:fake,db:denied.db,session:session()}),e=>e.code==='role');assert.equal(reads,0);
});
test('authorized current child workflow status stays separate from historical initial draft and never implies bookability',async()=>{
  const f=fakeContext(),saved=await packets(f),child={...structuredClone(f.records[0]),id:'fictional-child-1',data:structuredClone(saved.manifest.candidates[0].data),revision:3,status:'review'};f.records.push(child);
  const value=await participationRecurrenceHistory(f.c,{org:ORG,session:session(),reportId:saved.report.id});assert.equal(value.report.payload.candidates[0].status,'draft');const current=value.report.currentDisposition.find(r=>r.id===child.id);assert.equal(current.status,'review');assert.equal(current.revision,3);assert.equal(Object.hasOwn(current,'bookable'),false);assert.equal(Object.hasOwn(current,'approval'),false);
  child.status='unsupported-workflow-state';await assert.rejects(()=>participationRecurrenceHistory(f.c,{org:ORG,session:session(),reportId:saved.report.id}),e=>e.code==='recurrence_status');
});
