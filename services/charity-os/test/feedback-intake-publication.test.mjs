import test from 'node:test';import assert from 'node:assert/strict';
import {recordFeedbackPublication,FEEDBACK_PUBLICATION_SQL as sql} from '../lib/feedback-intake-publication.mjs';
import {proposedFeedbackForm} from '../lib/feedback-intake-form.mjs';
const org='fictional_org', source={orgId:org,id:'fictional_form',moduleId:'forms',revision:4,status:'published',data:proposedFeedbackForm('2026-12-01').data};
function fixture(){
  let existing=null;const calls=[],audit=[];
  const c={query:async(q,args)=>{
    calls.push(q);
    if(q===sql.lock)return {rows:[]};
    if(q===sql.clock)return {rows:[{utc_day:'2026-11-09'}]};
    if(q===sql.existing)return {rows:existing?[existing]:[]};
    if(q===sql.daily)return {rows:[{count:'1'}]};
    assert.equal(q,sql.insert);assert.deepEqual(args.slice(0,1),[org]);assert.equal(args[5],'fictional_staff');
    existing={id:args[1],record_id:args[2],source_revision:args[3],kind:'feedback',target_id:null,target_module:null,target_revision:null,schema:JSON.parse(args[4]),withdrawn_at:null};
    return {rows:[{id:existing.id}]};
  }};
  const args={orgId:org,input:{recordId:source.id,revision:source.revision},authenticate:async()=> 'fictional_staff',loadSource:async()=>source,
    isAccepting:(p,s,t,{today})=>p.kind==='feedback'&&s.status==='published'&&t===null&&today==='2026-11-09',
    saveAudit:async(_c,event)=>{assert.equal(event.action,'intake.published');assert.equal(event.detail.kind,'feedback');audit.push(event);},admit:async()=>true,
    urlFor:(_org,id)=>'https://os.example.invalid/intake/'+id};
  return {call:(extra={})=>recordFeedbackPublication(c,{...args,...extra}),calls,audit,withdraw:()=>{existing.withdrawn_at='2026-11-09T15:00:00Z';}};
}
test('one reviewed revision produces one immutable link and replay cannot revive it',async()=>{
  const f=fixture(),first=await f.call(),retry=await f.call();
  assert.equal(first.replayed,false);assert.equal(retry.replayed,true);assert.deepEqual(first.publication,retry.publication);
  assert.equal(f.calls.filter(s=>s===sql.insert).length,1);assert.equal(f.audit.length,1);
  f.withdraw();await assert.rejects(f.call(),{code:'feedback_publication_previous'});
  assert.equal(f.calls.filter(s=>s===sql.insert).length,1);
});
test('scope, current approval and fixed profile must pass before writing',async()=>{
  for(const [extra,code] of [
    [{authenticate:async()=>null},'feedback_staff_authority'],
    [{input:{recordId:source.id,revision:5}},'feedback_publication_revision'],
    [{isAccepting:()=>false},'feedback_publication_approval'],
    [{loadSource:async()=>({...source,data:{...source.data,anonymous:false}})},'feedback_form_profile'],
    [{input:{recordId:source.id,revision:4,targetId:'fictional_target'}},'feedback_publication_fields'],
  ]){
    const f=fixture();await assert.rejects(f.call(extra),{code});assert(!f.calls.includes(sql.insert));assert.equal(f.audit.length,0);
  }
});
test('missing capacity does not report the publication saved to the transaction caller',async()=>{
  const f=fixture();await assert.rejects(f.call({admit:async()=>false}),{code:'feedback_publication_capacity'});
  assert.equal(f.audit.length,1);
});
