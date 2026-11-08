/** Actual write leaf + context/access/store/model/DTO over closed fake SELECTs.
 * No HTTP authentication, PostgreSQL, actual booking/group writes, COMMIT or
 * no-write whole-request claim. Session-expiry SQL and read locks still run. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { participationGroupWriteRoutes } from '../lib/participation-group-write-routes.mjs';
import { GROUP_CONTEXT_SQL } from '../lib/participation-group-context.mjs';
import { groupCommandHashes,validateGroupReceipt } from '../lib/participation-group-model.mjs';
import { signGroupPreview,verifyGroupPreview } from '../lib/participation-group-preview.mjs';
import { hash } from '../lib/security.mjs';
import { fixture as contextFixture,ORG,USER,SHA,stamp,next,session,result } from './fixtures/group-context.mjs';

const ORIGINAL_SECRET='fictional-original-signing-secret-at-least32';
const ROTATED_SECRET='fictional-rotated-signing-secret-at-least32';
const LOOKUP='SELECT org_id,command_hash,group_id,receipt FROM os_participation_group_receipts WHERE org_id=$1 AND command_hash=$2';
const MEMBER="SELECT user_id,role,program_ids,revision,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_exact FROM os_members WHERE org_id=$1 AND user_id=$2";
const THIRD='2026-11-08T12:00:00.123458Z';
const clone=value=>structuredClone(value);
const statusCode=(status,code)=>error=>error.status===status&&error.code===code;
const tailFor=operation=>operation==='create'?'participation-groups':'participation-groups/group_1/'+operation;
function signed(operation){
 const payload={format:'charitology-participation-group-preview',version:1,operation,orgId:ORG,groupId:'group_1',groupRevision:operation==='admit'?1:2,
  actorSha256:SHA,sessionSha256:SHA,membershipSha256:SHA,restoreEpochSha256:SHA,rosterSha256:SHA,selectionSha256:SHA,pinsSha256:SHA,reviewSha256:SHA,
  issuedAtExact:'2020-01-01T00:00:00.000000Z',expiresAtExact:'2020-01-01T00:10:00.000000Z'};
 const {format,version,issuedAtExact,expiresAtExact,...bindings}=payload;
 return {token:signGroupPreview(payload,ORIGINAL_SECRET),payload,bindings};
}
function createBody(){return{version:1,target:{targetId:'target',targetRevision:2,sourceRevision:4},members:[{participationId:'p2',revision:3},{participationId:'p1',revision:3}],coordinatorIntakeId:null,idempotencyKey:'lost_create_command_001'};}
function commitBody(operation){return{version:1,previewToken:signed(operation).token,reviewSha256:SHA,
 selection:operation==='admit'?{mode:'all',items:[]}:{mode:'subset',items:['p1']},
 reasons:operation==='admit'?[]:[{participationId:'p1',reason:'Fictional deliberate cancellation.'}],
 idempotencyKey:operation==='admit'?'lost_admission_command_001':'lost_cancellation_command_001'};}
function bodyFor(operation){return operation==='create'?createBody():operation==='close'?{version:1,groupRevision:1,reason:'Fictional deliberate draft closure.',idempotencyKey:'lost_close_command_001'}:commitBody(operation);}
function hashes(operation,input,groupId=operation==='create'?null:'group_1'){
 return groupCommandHashes({orgId:ORG,actorId:USER,groupId,operation,input});
}
function receipt(operation,input,authority){
 const revision=operation==='create'?1:operation==='cancel'?3:2;
 const output={groupId:'group_1',groupRevision:revision,state:operation==='create'?'draft':operation==='close'?'closed':'admitted'};
 if(operation==='create')Object.assign(output,{target:{targetId:'target',moduleId:'events'},rosterIds:['p1','p2'],coordinatorIntakeId:null});
 if(operation==='admit')Object.assign(output,{selectionMode:'all',selected:['p1','p2'].map(participationId=>({participationId,action:'confirm',resultRevision:4,state:'confirmed',frozenSha256:SHA,allocationHash:null,notificationQueued:false,auditRetained:false})),unselectedIds:[],reasonHashes:[],auditRetained:false});
 if(operation==='cancel')Object.assign(output,{selected:[{participationId:'p1',resultRevision:5,state:'cancelled',notificationQueued:false,auditRetained:false}],reasonSha256:hash('fictional cancellation'),auditRetained:false});
 if(operation==='close')Object.assign(output,{reasonSha256:hash(input.reason),auditRetained:false});
 return validateGroupReceipt({version:1,groupId:'group_1',operation,...hashes(operation,input),authority,reviewSha256:['create','close'].includes(operation)?null:SHA,
  acceptedAtExact:operation==='create'?stamp:operation==='cancel'?THIRD:next,result:output});
}
async function replayFixture({latest='cancel'}={}){
 const f=contextFixture(),initial=await f.read('replay'),authority=initial.authority;
 const bodies={create:bodyFor('create'),admit:bodyFor('admit'),cancel:bodyFor('cancel'),close:bodyFor('close')};
 const retained={create:receipt('create',bodies.create,authority),admit:receipt('admit',bodies.admit,authority),cancel:receipt('cancel',bodies.cancel,authority),close:receipt('close',bodies.close,authority)};
 const chain=latest==='create'?[retained.create]:latest==='close'?[retained.create,retained.close]:latest==='admit'?[retained.create,retained.admit]:[retained.create,retained.admit,retained.cancel];
 const current=chain.at(-1),stored=f.groups.get('group_1');stored.receipts=chain;
 Object.assign(stored.row,{state:current.result.state,revision:chain.length,last_command_hash:current.commandHash,created_at_exact:stamp,updated_at_exact:current.acceptedAtExact});
 const originalQuery=f.c.query.bind(f.c);let missingMember=false;
 f.c={async query(sql,args=[]){
  if(sql===LOOKUP){
   f.calls.push({sql,args:clone(args)});assert.equal(args[0],ORG);
   const selected=[...f.groups.values()].flatMap(group=>group.receipts).filter(value=>value.commandHash===args[1]);
   assert(selected.length<=1);return result(selected.map(value=>({org_id:ORG,command_hash:value.commandHash,group_id:value.groupId,receipt:value})));
  }
  if(missingMember&&(sql===MEMBER||sql===MEMBER+' FOR SHARE')){f.calls.push({sql,args:clone(args)});return result([]);}
  return originalQuery(sql,args);
 }};
 f.invoke=(operation,{input=bodies[operation],tail=tailFor(operation),method='POST',query='',settings={secret:ROTATED_SECRET},suppliedSession=session()}={})=>
  participationGroupWriteRoutes({c:f.c,org:ORG,session:suppliedSession,tail,method,input,url:new URL('https://os.invalid/api/orgs/'+ORG+'/'+tail+query),settings});
 f.missingMember=value=>{missingMember=value;};f.bodies=bodies;f.retained=retained;f.calls.length=0;return f;
}
function noNewDomainWork(f){
 const prohibited=f.calls.filter(({sql})=>/^(?:INSERT|UPDATE|DELETE)\b/.test(sql)||sql.startsWith('WITH moment AS MATERIALIZED')||sql.includes('nextval(')||
  sql===GROUP_CONTEXT_SQL.records||sql===GROUP_CONTEXT_SQL.parts||sql===GROUP_CONTEXT_SQL.queue||sql===GROUP_CONTEXT_SQL.targets||sql===GROUP_CONTEXT_SQL.recordBudget||sql===GROUP_CONTEXT_SQL.partBudget||
  sql.startsWith('SELECT t.relname AS table_name')||sql.startsWith('SELECT sum(size) AS size'));
 assert.deepEqual(prohibited,[],'Replay must not enter NEW clock/eligibility/capacity/audit/write paths');
}
function domainSnapshot(f){return hash({groups:[...f.groups],tables:Object.fromEntries(Object.entries(f.tables).map(([key,value])=>[key,[...value]])),member:f.member,restored:[...f.restored]});}
function privateFree(dto){
 const text=JSON.stringify(dto);for(const value of ['actorSha256','sessionSha256','membershipSha256','restoreEpochSha256','commandHash','requestHash','previewToken','consent','approval','safeguarding'])assert(!text.includes(value));
 assert.deepEqual(Object.keys(dto),['ok','replayed','acceptedAtExact','accepted','currentDisposition']);
}

test('lost create exact Retry executes real lookup/context/store/DTO and returns original draft beside later disposition',async()=>{
 const f=await replayFixture();f.source.status='cancelled';f.source.approval=null;f.source.revision=99;f.source.data.startAt='no-longer-a-new-schedule';f.t.revision=10;f.t.mode='paused';f.t.recovery_block=true;
 f.p1.consent=null;f.p1.state='cancelled';f.p1.revision=9;f.p2.state='confirmed';f.p2.revision=8;
 const before=domainSnapshot(f),response=await f.invoke('create'),dto=await response.json();
 assert.equal(response.status,200);assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(dto.replayed,true);assert.deepEqual(dto.accepted,f.retained.create.result);assert.equal(dto.accepted.state,'draft');assert.equal(dto.currentDisposition.groupRevision,3);
 assert.deepEqual(dto.currentDisposition.members,[{participationId:'p1',revision:9,state:'cancelled'},{participationId:'p2',revision:8,state:'confirmed'}]);
 assert.equal(domainSnapshot(f),before);assert.equal(f.calls[0].sql,LOOKUP);assert(f.calls.some(call=>call.sql===GROUP_CONTEXT_SQL.receiptSeed));noNewDomainWork(f);privateFree(dto);
});
for(const operation of ['admit','cancel'])test(`accepted ${operation} Replay ignores original expired token and rotated HMAC secret after fresh actual authority`,async()=>{
 const f=await replayFixture(),old=signed(operation);
 assert.throws(()=>verifyGroupPreview(old.token,ORIGINAL_SECRET,{nowExact:stamp,bindings:old.bindings}),statusCode(409,'participation_group_preview_stale'));
 assert.throws(()=>verifyGroupPreview(old.token,ROTATED_SECRET,{nowExact:stamp,bindings:old.bindings}),statusCode(422,'participation_group_preview'));
 f.source.status='cancelled';f.source.approval=null;f.source.data.startAt='not-a-current-schedule';f.t.mode='paused';f.p1.consent=null;f.p1.state='cancelled';f.p1.revision=10;
 const before=domainSnapshot(f),response=await f.invoke(operation),dto=await response.json();assert.equal(response.status,200);assert.deepEqual(dto.accepted,f.retained[operation].result);assert.equal(dto.acceptedAtExact,f.retained[operation].acceptedAtExact);
 assert.equal(dto.currentDisposition.groupRevision,3);assert.equal(dto.currentDisposition.members[0].state,'cancelled');assert.equal(domainSnapshot(f),before);noNewDomainWork(f);privateFree(dto);
});
test('accepted close Replay retains original false audit outcome and requires no new schedule/readiness',async()=>{
 const f=await replayFixture({latest:'close'});f.source.status='cancelled';f.source.approval=null;f.p1.consent=null;
 const response=await f.invoke('close'),dto=await response.json();assert.equal(response.status,200);assert.deepEqual(dto.accepted,f.retained.close.result);assert.equal(dto.accepted.auditRetained,false);assert.equal(dto.currentDisposition.state,'closed');noNewDomainWork(f);
});
test('same retained key with changed valid body, action or fully visible group refuses409 without writes',async()=>{
 {
  const f=await replayFixture(),input=clone(f.bodies.create);input.target.sourceRevision++;
  await assert.rejects(f.invoke('create',{input}),statusCode(409,'participation_group_intent'));noNewDomainWork(f);
 }
 {
  const f=await replayFixture(),input=clone(f.bodies.cancel);input.idempotencyKey=f.bodies.admit.idempotencyKey;
  await assert.rejects(f.invoke('cancel',{input}),statusCode(409,'participation_group_intent'));noNewDomainWork(f);
 }
 {
  const f=await replayFixture(),other=f.addGroup('group_other');Object.assign(other.row,{state:'draft',revision:1,last_command_hash:other.receipts[0].commandHash,created_at_exact:stamp,updated_at_exact:stamp});
  await assert.rejects(f.invoke('admit',{tail:'participation-groups/group_other/admit'}),statusCode(409,'participation_group_intent'));noNewDomainWork(f);
 }
 {
  const f=await replayFixture(),input=clone(f.bodies.admit);input.previewToken=signGroupPreview(signed('admit').payload,ROTATED_SECRET);
  await assert.rejects(f.invoke('admit',{input}),statusCode(409,'participation_group_intent'));noNewDomainWork(f);
 }
});
test('a fresh admission intent on an admitted or closed group is a state conflict without writes',async()=>{
 for(const latest of ['admit','close']){
  const f=await replayFixture({latest}),input=clone(f.bodies.admit);
  input.idempotencyKey='fresh_admission_command_002';
  const before=domainSnapshot(f);
  await assert.rejects(f.invoke('admit',{input}),statusCode(409,'participation_group_stale'));
  assert.equal(domainSnapshot(f),before);
  assert(!f.calls.some(({sql})=>/^(?:INSERT|UPDATE|DELETE)\b/.test(sql)));
 }
});
test('a fresh cancellation intent on an undecided group is a state conflict without writes',async()=>{
 const f=await replayFixture({latest:'create'}),input=clone(f.bodies.cancel);
 input.idempotencyKey='fresh_cancellation_command_002';
 const before=domainSnapshot(f);
 await assert.rejects(f.invoke('cancel',{input}),statusCode(409,'participation_group_stale'));
 assert.equal(domainSnapshot(f),before);
 assert(!f.calls.some(({sql})=>/^(?:INSERT|UPDATE|DELETE)\b/.test(sql)));
});
for(const [label,change,status,expected]of[
 ['revoked SQL session',f=>{f.missingSession=true;},401,'session'],
 ['missing membership',f=>f.missingMember(true),403,'membership'],
 ['read-only role',f=>{f.member.role='board_reader';},403,'role'],
 ['changed membership revision',f=>{f.member.revision++;},409,'participation_group_stale'],
 ['submillisecond membership recreation',f=>{f.member.created_exact=next;},409,'participation_group_stale'],
 ['new record restore audit',f=>f.restored.set('target','9223372036854775806'),409,'participation_group_stale'],
])test(`exact accepted Retry still refuses ${label}`,async()=>{
 const f=await replayFixture();change(f);const before=domainSnapshot(f);await assert.rejects(f.invoke('create'),statusCode(status,expected));assert.equal(domainSnapshot(f),before);noNewDomainWork(f);
});
test('incomplete or hidden current typed graph refuses the whole Replay DTO',async()=>{
 for(const change of [f=>f.tables.os_records.delete('p2_contact'),f=>f.tables.os_participations.delete('p2'),f=>{f.tables.os_records.get('p2_booking').data.eventId='different_target';}]){
  const f=await replayFixture();change(f);const before=domainSnapshot(f);await assert.rejects(f.invoke('create'),error=>error.status===404&&error.code==='participation_group_unavailable');assert.equal(domainSnapshot(f),before);noNewDomainWork(f);
 }
});
test('read, preview, unsupported method and unknown tails delegate null without touching body or SQL',async()=>{
 const f=await replayFixture();let reads=0;const body=new Proxy({},{ownKeys(){reads++;throw Error('unread body');},get(){reads++;throw Error('unread body');}});
 for(const [tail,method]of[['participation-groups/group_1','GET'],['participation-groups/group_1/preview-admission','POST'],['participation-groups/group_1/preview-cancellation','POST'],['participation-groups','GET'],['participation-groups','DELETE'],['participation-groups/group_1/admit/extra','POST'],['unrelated','POST']])
  assert.equal(await f.invoke('create',{tail,method,input:body}),null);
 assert.equal(reads,0);assert.equal(f.calls.length,0);
});
test('query grammar rejects private/duplicate/wrong routing fields before lookup; exact one rewrite remains accepted',async()=>{
 for(const query of ['?cursor=private','?idempotencyKey=private','?path=wrong','?path=one&path=two']){
  const f=await replayFixture();await assert.rejects(f.invoke('create',{query}),statusCode(400,'participant_query'));assert.equal(f.calls.length,0);
 }
 const f=await replayFixture(),query='?path='+encodeURIComponent('orgs/'+ORG+'/participation-groups');const response=await f.invoke('create',{query});assert.equal(response.status,200);noNewDomainWork(f);
});
test('owned malformed/extra/getter/proxy bodies refuse before receipt lookup without traps',async()=>{
 const f=await replayFixture();let traps=0;
 const extra={...clone(f.bodies.create),skipAuthority:true},missing=clone(f.bodies.create);delete missing.coordinatorIntakeId;
 const getter=clone(f.bodies.create);Object.defineProperty(getter,'members',{enumerable:true,get(){traps++;throw Error('getter');}});
 const proxy=new Proxy({},{ownKeys(){traps++;throw Error('proxy');},getPrototypeOf(){traps++;throw Error('proxy');}});
 for(const input of [extra,missing,getter,proxy]){await assert.rejects(f.invoke('create',{input}),error=>error.status===422);assert.equal(f.calls.length,0);}
 const bad=clone(f.bodies.admit);bad.previewToken='not-a-syntactically-valid-token';await assert.rejects(f.invoke('admit',{input:bad}),error=>error.status===422);assert.equal(f.calls.length,0);assert.equal(traps,0);
});
