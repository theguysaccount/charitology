/** Controlled fake SELECT bytes, real codecs/composers/restore builder.
 * No PostgreSQL, authority, physical-byte or attainable-maximum proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {checkGroupOrdinaryCapacity,checkGroupCreateBudget,checkGroupCreateReceiptCapacity,groupCreateAudit,GROUP_WRITE_SQL as W} from '../lib/participation-group-write-capacity.mjs';
import {GROUP_CAPACITY_SQL as G} from '../lib/participation-group-capacity.mjs';
import {GROUP_SAFETY_SQL as S} from '../lib/participation-group-safety-capacity.mjs';
import {validateGroupReceipt,groupCommandHashes} from '../lib/participation-group-model.mjs';
import {participationTerms} from '../lib/participation.mjs';
import {DELIVERY_CONSENT_VERSION,DELIVERY_TEMPLATE_VERSION} from '../lib/participation-delivery.mjs';
import {LEARNING_OPERATIONAL_CAPACITY as O} from '../lib/learning-capacity.mjs';
import {validateRecord} from '../lib/modules.mjs';
import {hash} from '../lib/security.mjs';
import {restoreMeasurementFixture} from './restore-capacity-fixture.mjs';
const ORG='fixture_org',ACTOR='fixture_actor',AT='2026-11-08T00:00:00.000Z',EXACT='2026-11-08T00:00:00.000001Z',SHA='a'.repeat(64),MAX=2147483647;
const copy=value=>structuredClone(value),size=value=>Buffer.byteLength(JSON.stringify(value));
const authority={actorSha256:SHA,sessionSha256:SHA,membershipSha256:SHA,memberCreatedAtExact:EXACT,restoreEpochSha256:SHA};
const schema={os_participation_groups:{org_id:'text',id:'text',origin_mode:'text',module_id:'text',live_target_id:'text',roster_ids:'jsonb',coordinator_intake_id:'text',state:'text',revision:'integer',last_command_hash:'text',history:'jsonb',created_at:'timestamp with time zone',updated_at:'timestamp with time zone'},os_participation_group_receipts:{org_id:'text',command_hash:'text',group_id:'text',receipt:'jsonb'}};
function receipt(groupId='actual_new_group',input){
 const hashes=input?groupCommandHashes({orgId:ORG,actorId:ACTOR,groupId:null,operation:'create',input}):{commandHash:hash(groupId),requestHash:SHA};
 return validateGroupReceipt({version:1,groupId,operation:'create',...hashes,authority,reviewSha256:null,acceptedAtExact:EXACT,result:{groupId,groupRevision:1,state:'draft',target:{targetId:'target',moduleId:'volunteers'},rosterIds:['p1','p2'],coordinatorIntakeId:null}});
}
function fixture({groups=0,active=false,v3=false}={}){
 const records=[];
 function put(id,moduleId,data,status='draft',revision=1){const r={id,orgId:ORG,moduleId,data,status,ownerId:ACTOR,lastEditedBy:ACTOR,revision,approval:null,snapshot:null,source:null,createdAt:AT,updatedAt:AT};r.data=validateRecord(moduleId,data,{orgId:ORG,recordId:id,status,records:[...records,r]});records.push(r);return r;}
 put('program','programs',{title:'Fictional program',purpose:'Source-valid size composition.',community:'No real people.',mechanism:'Local unit fixture.',evidence:'hypothesis'});
 const source=put('target','volunteers',{title:'Fictional shift',kind:'shift',programId:'program',startAt:'2099-01-01T09:00:00+00:00',endAt:'2099-01-01T12:00:00+00:00',timeZone:'UTC',capacity:10,allowPartialIntervals:v3,participationPurpose:'Fictional size review.',participantInstructions:null,organizerEmail:'organizer@example.invalid',organizerUrl:null},'open',4);
 const terms=participationTerms(source),target={org_id:ORG,target_id:'target',module_id:'volunteers',revision:2,mode:'managed',source_revision:4,terms,terms_hash:hash(terms),recovery_block:false,created_at:AT,updated_at:AT,created_by:ACTOR,last_command:null},people=[];
 for(let n=1;n<=2;n++){
  put('c'+n,'contacts',{title:'Fictional reference '+n,kind:'person-reference',displayLabel:'Fixture '+n,relationship:'volunteer',contactPreference:'permission-needed'});
  put('b'+n,'volunteers',{title:'Fictional assignment '+n,kind:'assignment',programId:'program',shiftId:'target',contactId:'c'+n});
  people.push({org_id:ORG,id:'p'+n,target_id:'target',module_id:'volunteers',booking_record_id:'b'+n,contact_id:'c'+n,intake_id:null,state:'requested',revision:n,source:'staff',consent:{revision:1,sourceRevision:4,termsHash:hash(terms),at:AT,waitlistAllowed:true,emailUpdates:true,method:'fictional-unit',evidenceRef:'fictional-reference',withdrawalAcknowledged:true},frozen:null,waitlist_sequence:null,confirmed_at:null,cancelled_at:null,created_by:ACTOR,created_at:AT,updated_at:AT,recovered:false,recovered_state:null,last_command:null,delivery_consent:null,requested_interval:null,reminder_consent:null});
 }
 const input={version:1,target:{targetId:'target',targetRevision:2,sourceRevision:4},members:[{participationId:'p2',revision:2},{participationId:'p1',revision:1}],coordinatorIntakeId:null,idempotencyKey:'fixture_new_command_key'},context={originMode:'live',group:null,inventory:null,member:{userId:ACTOR},source,t:target,roster:people,authority};
 const notices=active?[{org_id:ORG,id:'notice',participation_id:'p1',event_revision:1,purpose:'participation',channel:'email',state:'pending',payload:{state:'requested',participationId:'p1',revision:1},created_at:AT,participation_revision:1,intent_kind:'transition',consent_revision:1,consent_copy:DELIVERY_CONSENT_VERSION,user_id:'user',link_id:'link',link_revision:1,recipient_hash:SHA,policy_epoch:'f'.repeat(32),template_version:DELIVERY_TEMPLATE_VERSION,relay_key:'participation-'+ 'f'.repeat(32),payload_hash:SHA,first_attempt_at:null,attempts:0,lease_owner:null,lease_until:null,next_at:AT,last_checked_at:null,safe_code:null,provider_event_at:null,budget_bytes:8192,recovered_state:null}]:[];
 const receipts=Array.from({length:groups},(_,n)=>receipt('existing_'+String(n).padStart(3,'0'))),headers=receipts.map(r=>({org_id:ORG,id:r.groupId,origin_mode:'live',module_id:'volunteers',live_target_id:'target',roster_ids:['p1','p2'],coordinator_intake_id:null,state:'draft',revision:1,last_command_hash:r.commandHash,history:null,created_at:EXACT,updated_at:EXACT})),receiptRows=receipts.map(r=>({org_id:ORG,command_hash:r.commandHash,group_id:r.groupId,receipt:r}));
 const restore=restoreMeasurementFixture(),calls=[];let usage=10000,auditBytes=700,receiptBytes=null,stale=false;
 const empty=new Set(['os_comments','os_events','os_reports','os_files','os_integrations','os_learning_history','os_incubator_history','os_participation_checkins','os_publications','os_intake','os_task_recurrence_series','os_task_recurrence_occurrences','os_resource_directory_history']);
 const c={async query(sql,args=[]){
  calls.push({sql,args:copy(args)});assert(/^(SELECT|WITH)\b/.test(sql),'Measurement must remain SELECT-only');
  if(sql==="SELECT id,reminder_consent FROM os_participations WHERE org_id=$1 AND reminder_consent IS NOT NULL ORDER BY id LIMIT 2001")return{rows:[]};
  if(sql===W.source)return{rows:[{id:'target',module_id:'volunteers',revision:stale?5:4,deleted_at:null}]};
  if(sql===W.target)return{rows:[{target_id:'target',module_id:'volunteers',revision:2,source_revision:4,mode:'managed',recovery_block:false}]};
  if(sql===W.roster)return{rows:people.map(p=>Object.fromEntries(['id','target_id','module_id','revision','state','source','recovered','confirmed_at','frozen'].map(k=>[k,p[k]])))};
  if(sql===W.audit)return{rows:[{bytes:String(auditBytes),row:JSON.parse(args[0])}]};
  if(sql===S.participations)return{rows:people.map(p=>{const op=active&&p.id==='p1'?100:0,a=v3?1022:1000;return{id:p.id,row:copy(p),future_row:{...copy(p),state:'cancelled',revision:MAX,cancelled_at:O.serviceTime,updated_at:O.serviceTime,consent:{...p.consent,emailUpdates:false},last_command:{intentHash:SHA,payloadHash:SHA,actorHash:SHA,action:'delivery.preference',resultRevision:MAX,notificationQueued:false,auditRetained:false},delivery_consent:{version:DELIVERY_CONSENT_VERSION,enabled:false,revision:MAX,at:O.serviceTime}},actual:String(a),actual_raw:'1048',operational:String(a+op),operational_raw:String(1048+op),projected:String(a+500),projected_raw:'1548'};})};
  if(sql===S.bookings)return{rows:records.filter(r=>r.data.kind==='assignment').map(r=>({id:r.id,row:{org_id:ORG,id:r.id},future_row:{org_id:ORG,id:r.id},actual:'500',projected:'550'}))};
  if(sql===S.policy)return{rows:[{present:false,row:{},future_row:{org_id:ORG,revision:MAX,enabled:false,epoch:'f'.repeat(32),activated_at:null,template_version:DELIVERY_TEMPLATE_VERSION,last_command:{},updated_at:O.serviceTime},actual:'0',projected:'350'}]};
  if(sql===S.outbox)return{rows:notices.map(n=>({id:n.id,actual_raw:'500',actual:'8192',operational:'8192',projected:'8192'}))};
  if(sql===G.schema)return{rows:Object.entries(schema).flatMap(([table_name,cols])=>Object.entries(cols).map(([column_name,type])=>({table_name,column_name,type})))};
  if(sql===G.headers)return{rows:headers.map(r=>({id:r.id,row:copy(r),bytes:String(size(r)),created_at_exact:EXACT,updated_at_exact:EXACT}))};
  if(sql===G.futureHeaders||sql===G.futureReceipts)return{rows:JSON.parse(args[0]).map((r,i)=>({position:i+1,key:r.id||r.command_hash,bytes:String(sql===G.futureReceipts&&receiptBytes!==null?receiptBytes:size(r))}))};
  if(sql==='SELECT count(*)::int AS count FROM os_participation_groups WHERE org_id=$1')return{rows:[{count:groups}]};
  if(sql.startsWith('SELECT count(*)::int AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes FROM os_participation_groups'))return{rows:[{count:groups,bytes:String(headers.reduce((n,r)=>n+size(r),0))}]};
  if(sql.startsWith('SELECT count(*)::int AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes FROM os_participation_group_receipts'))return{rows:[{count:groups,bytes:String(receiptRows.reduce((n,r)=>n+size(r),0))}]};
  if(sql.startsWith('SELECT group_id,count(*)::int'))return{rows:headers.map(r=>({group_id:r.id,count:1}))};
  if(sql.startsWith('SELECT org_id,id,origin_mode'))return{rows:headers.map(({created_at,updated_at,...r})=>({...copy(r),created_at_exact:EXACT,updated_at_exact:EXACT}))};
  if(sql.startsWith('SELECT org_id,command_hash,group_id,receipt'))return{rows:copy(receiptRows)};
  if(sql.startsWith('SELECT sum(size) AS size'))return{rows:[{size:usage}]};
  if(sql.startsWith('SELECT EXISTS(SELECT 1 FROM os_learning_history'))return{rows:[{present:false,incubator:false,checkins:false,groups:groups>0,reminders:false}]};
  if(sql==='SELECT * FROM os_orgs WHERE id=$1')return{rows:[{id:ORG,name:'Fictional capacity workspace',currency:'USD',time_zone:'UTC'}]};
  if(sql==='SELECT * FROM os_participation_targets WHERE org_id=$1 ORDER BY target_id')return{rows:[copy(target)]};
  if(sql==='SELECT * FROM os_participations WHERE org_id=$1 ORDER BY created_at,id')return{rows:copy(people)};
  if(sql==='SELECT * FROM os_participation_outbox WHERE org_id=$1 ORDER BY created_at,id')return{rows:copy(notices)};
  if(sql.startsWith('SELECT id,intent_kind,budget_bytes,octet_length(to_jsonb(t)::text) AS actual'))return{rows:notices.map(n=>({id:n.id,intent_kind:n.intent_kind,budget_bytes:n.budget_bytes,actual:500,projected:550}))};
  if(sql.startsWith('SELECT octet_length(')&&sql.includes(' AS actual_raw,')&&sql.includes('WHERE t.org_id=$1 AND t.id=ANY'))return{rows:people.filter(p=>args[5].includes(p.id)).map(()=>({actual:v3?1022:1000,projected:v3?1122:1100,actual_raw:1048,projected_raw:1148}))};
  if(sql.startsWith('SELECT COALESCE(sum(octet_length(')&&sql.includes('FROM os_participations t'))return{rows:[{bytes:v3?2044:2000}]};
  if(sql==='SELECT revision,enabled,activated_at,template_version,updated_at FROM os_participation_delivery_policies WHERE org_id=$1')return{rows:[]};
  if(sql.startsWith('SELECT * FROM os_records WHERE org_id=$1 AND deleted_at IS NULL'))return{rows:records.map(r=>({org_id:ORG,id:r.id,module_id:r.moduleId,data:copy(r.data),status:r.status,owner_id:r.ownerId,last_editor_id:r.lastEditedBy,revision:r.revision,approval:r.approval,snapshot:r.snapshot,source:r.source,created_at:new Date(AT),updated_at:new Date(AT)}))};
  if(sql==='SELECT * FROM os_records WHERE org_id=$1 AND deleted_at IS NOT NULL')return{rows:[]};
  if(sql.includes('FROM os_participation_checkins t')&&sql.includes('max_bytes'))return{rows:[{count:0,bytes:0,max_bytes:0,history_bytes:0,report_bytes:0,withdrawal_bytes:0}]};
  const projected=restore.query(sql,args);if(projected)return projected;
  const table=sql.match(/\bFROM (os_[a-z_]+)\b/)?.[1];if(empty.has(table))return{rows:[]};
  throw Error('Unhandled closed fake query: '+sql);
 }};
 return{c,input,context,calls,headers,restore,setUsage:n=>{usage=n;},setReceipt:n=>{receiptBytes=n;},setAudit:n=>{auditBytes=n;},setStale:n=>{stale=n;}};
}

test('absent GROUP keeps prior ordinary handling without source projection',async()=>{const f=fixture();assert.equal(await checkGroupOrdinaryCapacity(f.c,ORG),null);assert.equal(f.calls.length,1);});
test('ordinary uses GROUP-activated whole required totals plus remaining exactly once',async()=>{
 const f=fixture({groups:1,active:true}),r=await checkGroupOrdinaryCapacity(f.c,ORG);assert.equal(r.whole.operational.active,true);assert.equal(r.missingOperationalRetained,0);assert.equal(r.missingOperationalNative,0);
 assert.equal(r.requiredUsage,r.whole.requiredUsage+r.missingOperationalRetained+r.remaining.retainedGrowthAboveOperational+r.core.retainedGrowthBytes+r.checkins.wholeRetainedReserve);
 assert.equal(r.requiredBackupBytes,r.whole.requiredBackupBytes+r.missingOperationalNative+r.remaining.nativeGrowthAboveOperational+r.checkins.wholeNativeReserve+r.futureCompleteBackupBytes-r.whole.backupBytes);
 assert.equal(r.inactive.categories.os_participation_group_receipts.count,0);assert.equal(r.inactive.categories.os_participation_groups.count,1);
});
test('existing v3 operational allowance is not added again',async()=>{const f=fixture({groups:1,active:true,v3:true}),r=await checkGroupOrdinaryCapacity(f.c,ORG);assert(r.whole.operational.active);assert.equal(r.missingOperationalRetained,0);assert.equal(r.missingOperationalNative,0);});
test('ordinary60 refuses combined remaining growth though current pieces individually fit',async()=>{const f=fixture({groups:1}),b=await checkGroupOrdinaryCapacity(f.c,ORG);f.setUsage(60*1024*1024-(b.requiredUsage-b.whole.usage)+1);await assert.rejects(checkGroupOrdinaryCapacity(f.c,ORG),e=>e.code==='participation_group_write_capacity');});
test('pre-ID first activation measures complete first namespace, actual SQL types and mandatory audit',async()=>{
 const f=fixture({active:true}),original=JSON.stringify(f.input),b=await checkGroupCreateBudget(f.c,ORG,{input:f.input,context:f.context});
 assert.equal(b.phase,'pre-id');assert.equal(b.prospectiveGroups,1);assert.equal(b.whole.operational,null);assert.equal(b.missingOperationalRetained,100);assert(b.missingOperationalNative>0);assert(b.candidateRetainedBytes>b.actualCandidateRetainedBytes);assert.equal(b.mandatoryAuditRetainedBytes,700);
 assert(b.futureCompleteBackupBytes>b.whole.backupBytes+b.core.nativeGrowthBytes);assert(b.actualProspectiveBackupBytes>b.whole.backupBytes);assert.equal(b.inactive.categories.os_participation_group_receipts.count,0);assert.equal(b.actualInactive.categories.os_participation_groups.count,1);
 assert.equal(JSON.stringify(f.input),original);assert(Object.isFrozen(b));assert(f.calls.some(x=>x.sql===G.futureHeaders));assert(f.calls.some(x=>x.sql===G.futureReceipts));assert(!f.calls.some(x=>/clock_timestamp|nextval\(|\bINSERT\b|\bUPDATE\b/.test(x.sql)));
});
test('actual receipt requires same-c handle, exact hashes/authority and unchanged current pins',async()=>{
 const f=fixture(),budget=await checkGroupCreateBudget(f.c,ORG,{input:f.input,context:f.context}),value=receipt('actual_new_group',f.input),r=await checkGroupCreateReceiptCapacity(f.c,ORG,{budget,receipt:value});assert(r.actualCandidateRetainedBytes<budget.actualCandidateRetainedBytes);assert.equal(r.unadmittedChildSnapshotsPredicted,false);
 const other=fixture();await assert.rejects(checkGroupCreateReceiptCapacity(other.c,ORG,{budget,receipt:value}),e=>e.code==='participation_group_capacity_context');assert.equal(other.calls.length,0);f.setStale(true);await assert.rejects(checkGroupCreateReceiptCapacity(f.c,ORG,{budget,receipt:value}),e=>e.code==='participation_group_revision');
});
test('forged budget and altered actual receipt refuse before inventory reads',async()=>{
 const f=fixture(),value=receipt('actual_new_group',f.input);await assert.rejects(checkGroupCreateReceiptCapacity(f.c,ORG,{budget:{phase:'pre-id'},receipt:value}));assert.equal(f.calls.length,0);
 const budget=await checkGroupCreateBudget(f.c,ORG,{input:f.input,context:f.context}),n=f.calls.length;await assert.rejects(checkGroupCreateReceiptCapacity(f.c,ORG,{budget,receipt:{...value,requestHash:'b'.repeat(64)}}));assert.equal(f.calls.length,n);
});
test('hostile context/descriptor and mismatched create pins never reach capacity SQL',async()=>{
 for(const change of [f=>{f.input.target.sourceRevision++;},f=>{f.input.members[0].revision++;},f=>{f.context.roster[0].state='confirmed';}]){const f=fixture();change(f);await assert.rejects(checkGroupCreateBudget(f.c,ORG,{input:f.input,context:f.context}));assert.equal(f.calls.length,0);}
 const f=fixture();let traps=0;const proxy=new Proxy({},{ownKeys(){traps++;throw Error('trap');},getPrototypeOf(){traps++;throw Error('trap');}});await assert.rejects(checkGroupCreateBudget(f.c,ORG,{input:f.input,context:proxy}));assert.equal(traps,0);
 const getter={input:f.input};Object.defineProperty(getter,'context',{enumerable:true,get(){traps++;return f.context;}});await assert.rejects(checkGroupCreateBudget(f.c,ORG,getter));assert.equal(traps,0);assert.equal(f.calls.length,0);
});
test('changed actual source pins and100-container bound refuse before a domain mint',async()=>{
 const f=fixture();f.setStale(true);await assert.rejects(checkGroupCreateBudget(f.c,ORG,{input:f.input,context:f.context}),e=>e.code==='participation_group_revision');assert.deepEqual(f.calls.map(x=>x.sql),[W.source]);
 const full=fixture({groups:100});await assert.rejects(checkGroupCreateBudget(full.c,ORG,{input:full.input,context:full.context}),e=>e.code==='participation_group_limit');
});
test('projected candidate family and mandatory create audit consume actual measured headroom',async()=>{
 const f=fixture();f.setReceipt(3*1024*1024);await assert.rejects(checkGroupCreateBudget(f.c,ORG,{input:f.input,context:f.context}),e=>e.code==='participation_group_capacity');
 const g=fixture(),b=await checkGroupCreateBudget(g.c,ORG,{input:g.input,context:g.context});g.setUsage(60*1024*1024-(b.requiredUsage-b.whole.usage)+1);await assert.rejects(checkGroupCreateBudget(g.c,ORG,{input:g.input,context:g.context}),e=>e.code==='participation_group_write_capacity');
});
test('mandatory audit grammar takes coordinator explicitly and preserves caller writing',()=>{
 const f=fixture(),event=groupCreateAudit({org:ORG,context:f.context,groupId:'actual_new_group',coordinatorIntakeId:null});assert.deepEqual(event,{org_id:ORG,actor_id:ACTOR,action:'participation-group.created',record_id:'target',module_id:'volunteers',detail:{groupId:'actual_new_group',rosterCount:2,coordinatorIntakeId:null}});assert(Object.isFrozen(event.detail));assert.throws(()=>groupCreateAudit({org:ORG,context:f.context,groupId:'actual_new_group'}));
});
test('budget receipt slots are globally distinct from retained and existing hypothetical future keys',async()=>{
 const f=fixture({groups:2}),b=await checkGroupCreateBudget(f.c,ORG,{input:f.input,context:f.context}),last=f.calls.filter(x=>x.sql===G.futureReceipts).at(-1),values=JSON.parse(last.args[0]),keys=values.map(r=>r.command_hash);assert.equal(new Set(keys).size,keys.length);assert(keys.every(key=>!f.headers.some(h=>h.last_command_hash===key)));assert.equal(values.length,4);assert.equal(b.prospectiveGroups,3);
});


test('mandatory audit physical bytes are added exactly once before a first write',async()=>{
 const f=fixture(),before=await checkGroupCreateBudget(f.c,ORG,{input:f.input,context:f.context});
 f.setAudit(1700);const after=await checkGroupCreateBudget(f.c,ORG,{input:f.input,context:f.context});
 assert.equal(after.requiredUsage-before.requiredUsage,1000);
 assert.equal(after.mandatoryAuditRetainedBytes,1700);
 assert.equal(after.requiredBackupBytes,before.requiredBackupBytes);
});

test('actual complete inactive projection clears links/receipt authority and keeps admitted history',async()=>{
 const f=fixture(),budget=await checkGroupCreateBudget(f.c,ORG,{input:f.input,context:f.context});
 const accepted=receipt('actual_new_group',f.input),result=await checkGroupCreateReceiptCapacity(f.c,ORG,{budget,receipt:accepted});
 const recovered=f.restore.observed.get('os_participation_groups');assert.equal(recovered.length,1);
 assert.equal(recovered[0].id,'actual_new_group');assert.equal(recovered[0].origin_mode,'recovered');assert.equal(recovered[0].state,'archived');
 for(const key of ['live_target_id','coordinator_intake_id','last_command_hash'])assert.equal(recovered[0][key],null);
 assert.deepEqual(recovered[0].roster_ids,[]);assert.equal(recovered[0].history.decisions.length,1);
 assert.equal(recovered[0].history.decisions[0].acceptedAtExact,EXACT);
 assert(!Object.hasOwn(recovered[0].history,'authority'));assert(!Object.hasOwn(recovered[0].history.decisions[0],'commandHash'));
 assert.equal(result.actualInactive.categories.os_participation_group_receipts.count,0);
});
