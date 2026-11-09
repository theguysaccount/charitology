import test from 'node:test';import assert from 'node:assert/strict';
import {mountFeedbackIntakeDraft} from './feedback-intake-draft.js';
class El {
  constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.listeners=new Map();this.textContent='';}
  setAttribute(k,v){this[k]=v;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  addEventListener(k,fn){this.listeners.set(k,fn);}
  trigger(k){if(!this.disabled)return this.listeners.get(k)?.();}
}
function env(){
  const doc={createElement:t=>new El(t,doc)},root=doc.createElement('root');
  const flat=()=>{const walk=r=>[r,...r.children.flatMap(walk)];return walk(root);};
  return {root,button:text=>flat().find(e=>e.tag==='button'&&e.textContent===text),input:()=>flat().find(e=>e.tag==='input'),text:()=>flat().map(e=>e.textContent).join('\n')};
}
const org='fictional_team', sub='fictional_submission', scope='a'.repeat(64), review='b'.repeat(64), key='fixture-staff-key-0001';
const ready={
  ok:true,version:1,orgId:org,scopeSha256:scope,state:'ready',
  submission:{id:sub,revision:2,status:'reviewed'},
  proposed:{moduleId:'feedback',status:'received',data:{
    title:'Finding information · Hard to follow',kind:'feedback-summary',programId:null,channel:'anonymous',
    publicationConsent:'withheld',responses:1,receivedDate:'2026-11-09',respondBy:null,resolution:'needs-review',publicSummary:null,change:null,
  }},reviewSha256:review,
};
const current={submission:{id:sub,revision:3,status:'converted',erased:false},
  draft:{id:'fictional_draft',moduleId:'feedback',status:'received',revision:1,disposition:'active'}};
const settled={
  ok:true,version:1,orgId:org,scopeSha256:scope,state:'accepted',
  decision:{submissionId:sub,publicationId:'fictional_publication',sourceRevision:1,reviewedRevision:2,submissionRevision:3,acceptedAtExact:'2026-11-09T00:00:00.000001Z',
    draft:{id:'fictional_draft',moduleId:'feedback',status:'received',revision:1}},current,
};
const base={orgId:org,submissionId:sub,ownerKey:'fictional-owner',makeKey:()=>key};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function reviewAndRecord(view){
  await view.button('Read current feedback state').trigger('click');
  const write=view.button('Record reviewed feedback draft');
  assert.equal(write.disabled,true);
  const check=view.input();assert(check);check.checked=true;check.trigger('change');
  assert.equal(write.disabled,false);write.trigger('click');await flush();
}
test('explicit review and acknowledgement, lost response and readback never create another write',async()=>{
  const view=env(),writes=[],reads=[];
  const pane=mountFeedbackIntakeDraft(view.root,{...base,
    load:async()=>{reads.push(1);return {status:200,body:reads.length===1?ready:settled};},
    send:async raw=>{writes.push(raw);if(writes.length===1)throw Error('fictional interruption');return {status:200,body:{...settled,idempotencyKey:key,replayed:true}};},
  });
  assert.equal(reads.length,0);assert.equal(writes.length,0);
  await reviewAndRecord(view);assert(pane.pending());assert.match(view.text(),/result is not confirmed/i);
  await view.button('Read current feedback state').trigger('click');assert.equal(writes.length,1);assert(pane.pending());assert.match(view.text(),/Original decision/);
  view.button('Retry the same feedback draft').trigger('click');await flush();
  assert.equal(writes.length,2);assert.equal(writes[0],writes[1]);assert.equal(pane.pending(),null);
  assert.equal(JSON.parse(writes[0]).acknowledge,true);assert.match(view.text(),/Current draft state/);
  pane.dispose();assert.equal(view.root.children.length,0);
});
test('a recovered history never creates a new review or command',async()=>{
  const view=env(), historical={ok:true,version:1,orgId:org,scopeSha256:scope,state:'historical',
    current:{submission:null,draft:{id:'fictional_draft',moduleId:'feedback',status:null,revision:null,disposition:'missing'}}};
  mountFeedbackIntakeDraft(view.root,{...base,load:async()=>({status:200,body:historical}),send:async()=>{throw Error('unexpected write');}});
  await view.button('Read current feedback state').trigger('click');
  assert.match(view.text(),/Recovered feedback history/);assert.match(view.text(),/no current record/);
  assert(!view.button('Record reviewed feedback draft'));assert(!view.button('Retry the same feedback draft'));
});
test('wrong scope leaves no writing; only a definitive application refusal clears an exact pending request',async()=>{
  const view=env();let n=0,writes=0;
  const pane=mountFeedbackIntakeDraft(view.root,{...base,load:async()=>({status:200,body:++n===1?{...ready,orgId:'different_org'}:ready}),
    send:async()=>({status:409,body:{ok:false,code:'fixture_stale',message:'Refused.',...(++writes===2?{definitive:true}:{})}})});
  await view.button('Read current feedback state').trigger('click');assert(!view.button('Record reviewed feedback draft'));
  await reviewAndRecord(view);assert(pane.pending());
  view.button('Retry the same feedback draft').trigger('click');await flush();assert.equal(pane.pending(),null);assert.match(view.text(),/earlier decision was refused/i);
});
test('a pending draft survives disposal in the same authorized scope only',async()=>{
  const a=env(), writes=[];
  const original=mountFeedbackIntakeDraft(a.root,{...base,load:async()=>({status:200,body:ready}),send:async raw=>{writes.push(raw);throw Error('fictional timeout');}});
  await reviewAndRecord(a);const p=original.pending();assert(p);original.dispose();
  const b=env();mountFeedbackIntakeDraft(b.root,{...base,ownerKey:'new-owner',pendingHandle:p,load:async()=>{throw Error('unused');},send:async()=>{throw Error('wrong owner');}});
  assert(!b.button('Retry the same feedback draft'));
  const c=env();const resumed=mountFeedbackIntakeDraft(c.root,{...base,pendingHandle:p,load:async()=>{throw Error('unused');},
    send:async raw=>{writes.push(raw);return {status:200,body:{...settled,idempotencyKey:key,replayed:true}};}});
  c.button('Retry the same feedback draft').trigger('click');await flush();
  assert.equal(writes[0],writes[1]);assert.equal(resumed.pending(),null);
});
