/** Pure authorized-context projections only; no SQL/session/visibility proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {groupDetailDTO,groupSummaryDTO,groupCommandDTO} from '../lib/participation-group-dto.mjs';
import {projectGroupHistory} from '../lib/participation-group-model.mjs';
const SHA='a'.repeat(64),AT='2099-01-01T10:00:00.123456Z';
const authority={actorSha256:SHA,sessionSha256:SHA,membershipSha256:SHA,memberCreatedAtExact:AT,restoreEpochSha256:SHA};
function makeReceipt(operation,revision,result){return {version:1,groupId:'group',operation,
 commandHash:String(revision).padStart(64,'0'),requestHash:SHA,authority,reviewSha256:['create','close'].includes(operation)?null:SHA,
 acceptedAtExact:AT,result:{groupId:'group',groupRevision:revision,state:operation==='create'?'draft':operation==='close'?'closed':'admitted',...result}};}
function fixture({admitted=false,closed=false}={}){
 const rosterIds=['p01','p02','p03'];const receipts=[makeReceipt('create',1,{target:{targetId:'target',moduleId:'volunteers'},rosterIds,coordinatorIntakeId:'coordinator'})];
 if(admitted)receipts.push(makeReceipt('admit',2,{selectionMode:'subset',selected:['p01','p02'].map(participationId=>({participationId,action:'confirm',resultRevision:3,state:'confirmed',frozenSha256:SHA,allocationHash:null,notificationQueued:false,auditRetained:true})),unselectedIds:['p03'],reasonHashes:[],auditRetained:true}));
 if(closed)receipts.push(makeReceipt('close',2,{reasonSha256:SHA,auditRetained:false}));
 const history=projectGroupHistory({originOrgId:'org',receipts});
 const group={orgId:'org',id:'group',originMode:'live',moduleId:'volunteers',liveTargetId:'target',rosterIds,
  coordinatorIntakeId:'coordinator',state:history.decisions.at(-1).result.state,revision:receipts.length,lastCommandHash:receipts.at(-1).commandHash,history,receipts};
 const roster=rosterIds.map((id,i)=>({id,org_id:'org',target_id:'target',module_id:'volunteers',booking_record_id:'booking_'+id,contact_id:'contact_'+id,
  revision:admitted&&i<2?3:2,state:admitted&&i<2?'confirmed':'requested',recovered:false,intake_id:'private_intake_'+id,
  consent:{privateAnswer:'DO_NOT_PROJECT_CONSENT'},safeguarding:'DO_NOT_PROJECT_SAFEGUARDING'}));
 const records=roster.map(p=>({orgId:'org',id:p.contact_id,moduleId:'contacts',data:{title:'Fictional '+p.id,email:'DO_NOT_PROJECT_EMAIL',body:'DO_NOT_PROJECT_CONTACT_BODY'}}));
 return {originMode:'live',group,roster,records,source:{orgId:'org',id:'target',moduleId:'volunteers',data:{title:'DO_NOT_PROJECT_SOURCE_BODY'}},
  member:{role:'owner',programIds:[],userId:'DO_NOT_PROJECT_MEMBER'},authority,chosenGraphPinsSha256:SHA,
  privateIntakeAnswers:'DO_NOT_PROJECT_ANSWERS',inventory:{hiddenRecord:'DO_NOT_PROJECT_INVENTORY'}};
}
const unavailable=e=>e.code==='participation_group_unavailable';

test('complete immutable roster uses authorized contact titles and excludes unrelated private context',()=>{
 const context=fixture(),before=structuredClone(context),dto=groupDetailDTO(context);
 assert.deepEqual(Object.keys(dto),['ok','targetId','group']);assert.equal(dto.targetId,'target');assert.deepEqual(dto.group.roster.map(x=>x.participationId),['p01','p02','p03']);
 assert.deepEqual(dto.group.roster[0],{participationId:'p01',label:'Fictional p01',revision:2,state:'requested',admitted:false});
 assert.equal(JSON.stringify(dto).includes('DO_NOT_PROJECT'),false);assert.equal(JSON.stringify(dto).includes('authority'),false);assert.equal(JSON.stringify(dto).includes('private_intake'),false);
 assert.deepEqual(context,before);assert(Object.isFrozen(dto)&&Object.isFrozen(dto.group.roster[0]));
});
test('partial original admission stays separate from later own cancellation and an excluded request',()=>{
 const context=fixture({admitted:true});context.roster[0].state='cancelled';context.roster[0].revision=4;
 const dto=groupDetailDTO(context);
 assert.deepEqual(dto.group.roster.map(x=>[x.participationId,x.admitted,x.state]),[['p01',true,'cancelled'],['p02',true,'confirmed'],['p03',false,'requested']]);
 assert.equal(dto.group.groupRevision,2);assert.equal(context.group.history.decisions[1].result.selected[0].state,'confirmed');
 assert.deepEqual(groupSummaryDTO(context),{groupId:'group',groupRevision:2,state:'admitted',rosterCount:3});
});
test('all180 actual title characters survive; absent title uses only an opaque participation ID',()=>{
 const context=fixture();context.records[0].data.title='X'.repeat(180);delete context.records[1].data.title;context.records[2].data.title='';
 const dto=groupDetailDTO(context);assert.equal(dto.group.roster[0].label,'X'.repeat(180));assert.equal(dto.group.roster[1].label,'Participant p02');assert.equal(dto.group.roster[2].label,'Participant p03');
 context.records[0].data.title='X'.repeat(181);assert.throws(()=>groupDetailDTO(context),unavailable);
 context.records[0].data.title=['Fictional label'];assert.throws(()=>groupDetailDTO(context),unavailable);
});
test('missing, duplicate, foreign or wrong-target roster rows refuse the whole DTO',()=>{
 for(const change of [c=>c.roster.pop(),c=>{c.roster[1].id='p01';},c=>{c.roster[0].org_id='foreign';},c=>{c.roster[0].target_id='foreign';},
  c=>{c.roster[0].module_id='events';},c=>{c.roster[0].state='unverified';},c=>{c.roster[0].recovered=true;},c=>{c.group.rosterIds=['p01','p02','missing'];}]){
  const context=fixture();change(context);assert.throws(()=>groupDetailDTO(context),unavailable);assert.throws(()=>groupSummaryDTO(context),unavailable);
 }
});
test('contact label lookup never filters missing contacts or substitutes intake/email data',()=>{
 for(const change of [c=>c.records.shift(),c=>c.records.push(structuredClone(c.records[0])),c=>{c.records[0].orgId='foreign';},c=>{c.records[0].moduleId='intake';}]){
  const context=fixture();change(context);assert.throws(()=>groupDetailDTO(context),unavailable);
 }
 const context=fixture();context.source.orgId='foreign';assert.throws(()=>groupDetailDTO(context),unavailable);
});
test('old create Replay after admission preserves original draft result beside complete current disposition',()=>{
 const context=fixture({admitted:true});context.roster[0].state='cancelled';context.roster[0].revision=4;
 const dto=groupCommandDTO({receipt:context.group.receipts[0],context,replayed:true});
 assert.equal(dto.accepted.state,'draft');assert.equal(dto.accepted.groupRevision,1);assert.equal(dto.currentDisposition.state,'admitted');assert.equal(dto.currentDisposition.groupRevision,2);
 assert.deepEqual(dto.currentDisposition.members.map(x=>[x.participationId,x.state]),[['p01','cancelled'],['p02','confirmed'],['p03','requested']]);
 assert.equal(JSON.stringify(dto).includes('actorSha256'),false);assert.equal(JSON.stringify(dto).includes('commandHash'),false);assert.equal(JSON.stringify(dto).includes('private_intake'),false);
 assert.equal(dto.acceptedAtExact,AT);assert.equal(dto.replayed,true);assert.deepEqual(dto.accepted,context.group.receipts[0].result);
});
test('new accepted admission and closed draft preserve exact original audit and journal outcomes',()=>{
 const context=fixture({admitted:true}),dto=groupCommandDTO({receipt:context.group.receipts[1],context,replayed:false});
 assert.equal(dto.accepted.selected[0].notificationQueued,false);assert.equal(dto.accepted.selected[0].auditRetained,true);assert.equal(dto.replayed,false);
 const closed=fixture({closed:true}),value=groupCommandDTO({receipt:closed.group.receipts[1],context:closed,replayed:true});
 assert.equal(value.accepted.auditRetained,false);assert.equal(value.currentDisposition.state,'closed');assert.equal(groupDetailDTO(closed).group.roster.some(x=>x.admitted),false);
});
test('command DTO refuses mismatched group, unretained command, stale history and incomplete current roster',()=>{
 for(const change of [v=>{v.receipt.groupId='foreign';v.receipt.result.groupId='foreign';},v=>{v.receipt.commandHash='f'.repeat(64);},
  v=>{v.context.group.id='foreign';},v=>{v.context.roster.pop();},v=>{v.receipt.result.rosterIds=['p01','p02'];}]){
  const context=fixture({admitted:true}),value={receipt:structuredClone(context.group.receipts[0]),context,replayed:true};change(value);assert.throws(()=>groupCommandDTO(value));
 }
});
test('stored receipt and command wrapper retain the actual closed model grammars',()=>{
 const context=fixture({admitted:true}),receipt=structuredClone(context.group.receipts[1]);receipt.authority.extra='private';assert.throws(()=>groupCommandDTO({receipt,context,replayed:true}));
 assert.throws(()=>groupCommandDTO({receipt:context.group.receipts[0],context,replayed:'true'}),unavailable);
 assert.throws(()=>groupCommandDTO({receipt:context.group.receipts[0],context,replayed:true,skipAuthority:true}),unavailable);
 const malformed=structuredClone(context.group.receipts[1]);malformed.result.selected[0].evidence='private';assert.throws(()=>groupCommandDTO({receipt:malformed,context,replayed:false}));
});
function recovered(){const context=fixture({admitted:true});return {...context,originMode:'recovered',source:null,roster:[],records:[],authority:null,
 group:{...context.group,orgId:'destination',originMode:'recovered',state:'archived',revision:1,liveTargetId:null,rosterIds:[],coordinatorIntakeId:null,receipts:[],lastCommandHash:null}};}
test('recovered orphan history returns opaque archived identity without live target or receipt authority',()=>{
 const context=recovered();assert.notEqual(context.group.orgId,context.group.history.originOrgId);
 const dto=groupDetailDTO(context);assert.deepEqual(dto,{ok:true,targetId:'target',group:{groupId:'group',groupRevision:1,state:'archived',originMode:'recovered',coordinatorIntakeId:null,roster:[]}});
 assert.equal(JSON.stringify(dto).includes('p01'),false);assert.throws(()=>groupSummaryDTO(context),unavailable);assert.throws(()=>groupCommandDTO({receipt:fixture().group.receipts[0],context,replayed:true}),unavailable);
 context.member.role='admin';assert.deepEqual(groupDetailDTO(context),dto);
});
test('recovered scope and cleared live links are checked defensively without granting admin access',()=>{
 for(const change of [c=>{c.member.role='viewer';},c=>{c.member.programIds=['program'];},c=>{c.group.liveTargetId='target';},
  c=>{c.group.coordinatorIntakeId='coordinator';},c=>{c.group.receipts=fixture().group.receipts;},c=>{c.roster=fixture().roster;},c=>{c.source=fixture().source;}]){
  const context=recovered();change(context);assert.throws(()=>groupDetailDTO(context),unavailable);
 }
});


test('valid TAB LF and CR titles become display-safe spaces without changing original records or pins',()=>{const context=fixture();context.records[0].data.title='First\nLast\tName\rSuffix';const before=structuredClone(context);const dto=groupDetailDTO(context);assert.equal(dto.group.roster[0].label,'First Last Name Suffix');assert.deepEqual(context,before);assert.equal(context.records[0].data.title,'First\nLast\tName\rSuffix');assert.equal(context.chosenGraphPinsSha256,SHA);});
test('other control characters remain refused rather than normalized into display text',()=>{for(const code of [0,1,8,11,12,14,31,127]){const context=fixture();context.records[0].data.title='First'+String.fromCharCode(code)+'Last';assert.throws(()=>groupDetailDTO(context));assert.equal(context.records[0].data.title,'First'+String.fromCharCode(code)+'Last');}});
