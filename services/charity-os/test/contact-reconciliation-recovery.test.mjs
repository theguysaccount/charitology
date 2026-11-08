// Pure/closed fake-SQL proposal only; no PostgreSQL, auth, RLS or rollback proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import legacyGolden from './fixtures/field-legacy-restore-projection-v1.json' with {type:'json'};
import {restoreMeasurementFixture} from './restore-capacity-fixture.mjs';
import {emptyParticipationGroupsQuery} from './fixtures/empty-participation-groups.mjs';
import committed75 from './fixtures/contact-reconciliation-legacy75-v1.json' with {type:'json'};
import {makeBackup,validateBackup} from '../lib/backup.mjs';
import {database,audit,noteContactReconciliationReceiptReplay} from '../lib/database.mjs';
import {validateRecord} from '../lib/modules.mjs';
import {hash,stable} from '../lib/security.mjs';
import {makeContactReconciliationReport,makeContactReconciliationReportRow} from '../lib/contact-reconciliation-report.mjs';
import {restoredContactReconciliationReports as inspect,exportContactReconciliationReports as native,
  planRestoredContactReconciliationReports as plan,restoreContactReconciliationReports as restore,
  contactReconciliationRestoreSummary as summary} from '../lib/contact-reconciliation-recovery.mjs';
import {CONTACT_REPORT_STORE_SQL as STORE} from '../lib/contact-reconciliation-store.mjs';
import {measureLearningRestoreCapacity as measure,checkLearningRestoreCapacity,operationalGrowth} from '../lib/learning-capacity.mjs';
import {assembleWorkspaceBackup,checkWorkspaceExportCapacity,canRetainIncubatorExportAudit} from '../lib/workspace-backup.mjs';
import {FIELD_FORMAT,FIELD_METHOD,inspectFieldAggregateFile,makeFieldMapping,compileFieldObservationDrafts} from '../lib/field-response-model.mjs';
import {makeFieldResponseReportRow} from '../lib/field-response-store.mjs';
import {validateGroupReceipt,projectGroupHistory,GROUP_METHOD} from '../lib/participation-group-model.mjs';
import {makeParticipationGroupsBackup} from '../lib/participation-group-backup.mjs';

const ORG='fictional_origin',ACTOR='fictional_actor',AT='2026-11-08T12:34:56.123456Z';
const organization={name:'Fictional source',currency:'USD',time_zone:'UTC'};
const member={userId:ACTOR,role:'admin',programIds:[],revision:1};
const destination={orgId:'fictional_destination',actorId:ACTOR,createdAtExact:'2026-11-08T13:00:00.654321Z'};
const clone=v=>structuredClone(v),bytes=v=>Buffer.byteLength(JSON.stringify(v));
function report(id='crm_report') {
 const row=(id,title)=>({id,orgId:ORG,moduleId:'contacts',revision:1,status:'draft',data:validateRecord('contacts',{title,kind:'person-reference',contactPreference:'permission-needed',purpose:'Fictional only'},{records:[]}),source:null,approval:null,snapshot:null,deletedAt:null});
 const input={orgId:ORG,pair:[row('left','Fictional left'),row('right','Fictional right')],organizations:[],references:[],decision:{operation:'merge',survivorId:'left',fields:{title:'right',displayLabel:'unknown',email:'unknown'},basis:'record-comparison',reason:'Fictional comparison'}};
 const payload=makeContactReconciliationReport({reportId:id,recordedAtExact:AT,input});
 return makeContactReconciliationReportRow({orgId:ORG,id,actorId:ACTOR,createdAtExact:AT,payload});
}
function fieldReport(){
 const program={id:'program',orgId:ORG,moduleId:'programs',revision:1,data:validateRecord('programs',{title:'Fictional program',kind:'program'}),deletedAt:null};
 const indicator={id:'indicator',orgId:ORG,moduleId:'outcomes',revision:1,data:validateRecord('outcomes',{title:'Fictional visits',kind:'indicator',programId:'program',unit:'visits'},{orgId:ORG,recordId:'indicator',records:[program]}),deletedAt:null};
 const row={responseId:'row',startDate:'2026-01-01',endDate:'2026-01-31',geography:null,visitCount:0,denominator:null,excluded:false,exclusionReason:null};
 const inspection=inspectFieldAggregateFile(Buffer.from(JSON.stringify({format:FIELD_FORMAT,version:1,formId:FIELD_METHOD,schemaVersion:1,responses:[row]}))),mapping=makeFieldMapping({orgId:ORG,program,indicator});
 const payload=compileFieldObservationDrafts({inspection,mapping,orgId:ORG,actorId:ACTOR,integrationId:'csv',program,indicator,selection:{responseIds:['row']},candidateIds:[{responseId:'row',recordId:'observation'}]}).manifest;
 return makeFieldResponseReportRow({orgId:ORG,id:'field_report',actorId:ACTOR,createdAtExact:AT,payload});
}
function inactiveGroup(){
 const H='a'.repeat(64),groupId='orphan_group';
 const receipt=validateGroupReceipt({version:1,groupId,operation:'create',commandHash:H,requestHash:H,authority:{actorSha256:H,sessionSha256:H,membershipSha256:H,memberCreatedAtExact:AT,restoreEpochSha256:H},reviewSha256:null,acceptedAtExact:AT,result:{groupId,groupRevision:1,state:'draft',target:{targetId:'historical_target',moduleId:'volunteers'},rosterIds:['historical_a','historical_b'],coordinatorIntakeId:null}});
 return makeParticipationGroupsBackup([projectGroupHistory({originOrgId:ORG,receipts:[receipt]})]);
}
const packet=(reports=[],extra={})=>makeBackup(organization,[],{reports,...extra});
function measurement({baseline=[],usage=0,badSchema=false,reportBytes}={}){
 const f=restoreMeasurementFixture(),calls=[];
 return {calls,observed:f.observed,client:{async query(sql,args){
  calls.push({sql,args:clone(args)});
  if(sql.startsWith('SELECT t.relname AS table_name')){const rows=f.query(sql,args).rows;if(args[0].includes('os_reports'))rows.push(...'org_id id created_by title checksum payload created_at'.split(' ').filter(k=>!badSchema||k!=='checksum').map(column_name=>({table_name:'os_reports',column_name})));return{rows};}
  if(sql.startsWith('SELECT item.ordinality::integer AS position')&&sql.includes('NULL::os_reports')){assert.match(sql,/octet_length\(to_jsonb\(r\)::text\)/);const values=JSON.parse(args[0]);f.observed.set('os_reports',values);return{rows:values.map((r,i)=>({position:i+1,bytes:reportBytes??bytes(r)}))};}
  if(sql.startsWith('SELECT t.*,octet_length(to_jsonb(t)::text) AS capacity_bytes FROM os_events'))return{rows:[]};
  if(sql.startsWith('SELECT t.*,octet_length(to_jsonb(t)::text) AS capacity_bytes FROM os_reports'))return{rows:clone(baseline)};
  if(sql.startsWith('SELECT sum(size) AS size FROM ('))return{rows:[{size:usage}]};
  const known=f.query(sql,args);if(known!==undefined)return known;throw Error('UNKNOWN_FAKE_MEASUREMENT_SQL');
 }}};
}
function exporter(reports=[],features={}){
 const m=measurement(),calls=m.calls;
 const allowed=new Set(['os_comments','os_events','os_reports','os_files','os_records','os_integrations','os_publications','os_intake','os_participation_targets','os_participations','os_participation_outbox','os_participation_delivery_policies','os_task_recurrence_series','os_task_recurrence_occurrences','os_resource_directory_history','os_learning_history','os_incubator_history','os_participation_checkins','os_participation_groups','os_participation_group_receipts']);
 return{calls,client:{async query(sql,args){
  if(sql.startsWith('SELECT t.relname AS table_name')||sql.startsWith('SELECT item.ordinality::integer AS position'))return m.client.query(sql,args);
  calls.push({sql,args:clone(args)});const empty=emptyParticipationGroupsQuery(sql,args);if(empty!==undefined)return empty;
  if(sql.startsWith('SELECT sum(size) AS size FROM ('))return{rows:[{size:reports.reduce((n,r)=>n+bytes(r),0)}]};
  if(sql.startsWith('SELECT EXISTS(SELECT 1 FROM os_learning_history'))return{rows:[{present:false,incubator:false,checkins:false,groups:false,field:reports.some(r=>r.payload?.format==='charitology-field-response-import'),crm:reports.some(r=>r.payload?.format==='charitology-contact-reconciliation'),...features}]};
  if(sql==='SELECT * FROM os_orgs WHERE id=$1')return{rows:[organization]};
  assert.match(sql,/^SELECT /);assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|FOR UPDATE)\b/);const table=sql.match(/\bFROM (os_[a-z_]+)/)?.[1];assert(allowed.has(table),'unknown fake export table');
  if(sql==='SELECT * FROM os_reports WHERE org_id=$1')return{rows:clone(reports)};return{rows:[]};
 }}};
}

test('committed75 golden absent projection, audit shape and validation stay exact',async()=>{
 const input=clone(legacyGolden.input),current=measurement();
 const currentResult=await measure(current.client,input);
 assert.deepEqual(currentResult,legacyGolden.result);assert.deepEqual([...current.observed],legacyGolden.observedEntries);
 assert.deepEqual(validateBackup(input,'destination','restorer'),committed75.absentValidated);
 assert(!Object.hasOwn(currentResult.categories,'os_reports'));assert(!Object.hasOwn(current.observed.get('os_events').at(-1).detail,'contactReconciliationReportsRecovered'));
});
test('known CRM is validated before legacy handling; absence adds no counter',()=>{
 for(const reports of [[],[{id:'legacy',payload:{ordinary:true}}]]){const b=packet(reports);assert.deepEqual(inspect(b),{present:false,reports:[]});assert.deepEqual(summary(inspect(b)),{});assert.deepEqual(validateBackup(b,ORG,ACTOR),[]);}
 for(const change of [r=>r.payload.version=2,r=>r.payload.method='unknown',r=>r.checksum='a'.repeat(64),r=>r.title='wrong']){const r=clone(report());change(r);assert.throws(()=>validateBackup(packet([r]),ORG,ACTOR));}
});
test('actual assembler plus two inactive planning hops preserves payload and source archive content',async()=>{
 const original=report(),archive=packet([original]),archived=JSON.stringify(archive);let r=original;
 for(let i=0;i<2;i++){const f=exporter([{...clone(r),created_at:new Date(r.created_at)}]);const b=await assembleWorkspaceBackup(f.client,r.org_id,{organization,records:[]});assert.deepEqual(b.reports[0].payload,original.payload);const recovered=plan(JSON.parse(JSON.stringify(b)),{...destination,orgId:'destination_'+i});r=recovered.reports[0];assert.equal(r.created_by,ACTOR);assert.deepEqual(summary(recovered),{contactReconciliationReportsRecovered:1});}
 assert.equal(r.payload.originOrgId,ORG);assert.equal(r.payload.recordedAtExact,AT);assert.equal(r.payload.changes[1].after.deletedAt,AT);assert.equal(JSON.stringify(archive),archived);assert.equal(r.id,original.id);assert.equal(r.checksum,original.checksum);
});
test('native SQL Date metadata normalizes only top row; literal SQL6 history stays exact',()=>{
 const r=report(),source={...clone(r),created_at:new Date(AT)},out=native([source],ORG)[0];assert.equal(out.created_at,'2026-11-08T12:34:56.123Z');assert.equal(out.payload.recordedAtExact,AT);assert.equal(out.payload.changes[1].after.deletedAt,AT);assert(source.created_at instanceof Date);
 let hooks=0;Object.defineProperty(source,'title',{enumerable:true,get(){hooks++;throw Error('hook');}});assert.throws(()=>native([source],ORG));assert.equal(hooks,0);
});
test('recovery forwards actual member only and delegates occupied guard even absent source',async()=>{
 const calls=[],c={async query(sql,args){calls.push({sql,args});assert.equal(sql,STORE.occupied);return{rows:[]};}};
 assert.deepEqual(await restore(c,packet(),{orgId:ORG,member,createdAtExact:null}),{present:false,count:0});assert.equal(calls.length,1);
 let sql=0;await assert.rejects(restore({query(){sql++;throw Error('not reached');}},packet(),{orgId:ORG,member:{...member,role:'contributor'},createdAtExact:null}),e=>e.status===403);assert.equal(sql,0);
 await assert.rejects(restore(c,packet(),{orgId:ORG,actorId:ACTOR,createdAtExact:null}));assert.equal(calls.length,1);
});
test('occupied reserved destination and unrelated ID collisions refuse before any INSERT',async()=>{
 for(const occupied of [true,false]){let inserts=0;const c={async query(sql,args){if(sql===STORE.occupied)return{rows:occupied?[{org_id:destination.orgId,id:'retained'}]:[]};if(sql===STORE.available)return{rows:[{org_id:destination.orgId,id:args[1]}]};inserts++;throw Error('must not insert');}};await assert.rejects(restore(c,packet(occupied?[]:[report()]),{orgId:destination.orgId,member,createdAtExact:occupied?null:destination.createdAtExact}),e=>e.status===409);assert.equal(inserts,0);}
});
test('seven-column SQL report projection uses worst destination metadata and conditional audit count',async()=>{
 const m=measurement(),b=packet([report()]),before=clone(b),value=await measure(m.client,b);const rows=m.observed.get('os_reports');assert.equal(value.categories.os_reports.count,1);assert.deepEqual(Object.keys(rows[0]),'org_id id created_by title checksum payload created_at'.split(' '));
 assert.equal(rows[0].org_id,'o'.repeat(100));assert.equal(rows[0].created_by,'u'.repeat(100));assert.deepEqual(rows[0].payload,b.reports[0].payload);assert.equal(value.categories.os_reports.bytes,bytes(rows[0]));assert.equal(m.observed.get('os_events').at(-1).detail.contactReconciliationReportsRecovered,1);assert.deepEqual(b,before);
 assert(rows[0].payload.recordedAtExact.endsWith('.123456Z'));assert(m.calls.some(x=>x.sql.includes('jsonb_populate_record(NULL::os_reports')));
});
test('known CRM requires the complete real report schema and fails closed on missing column',async()=>{
 const m=measurement({badSchema:true});await assert.rejects(measure(m.client,packet([report()])),e=>e.code==='learning_capacity_schema');
});
test('restore projection refuses existing CRM even with absent source and legacy report collision',async()=>{
 const r=report(),m=measurement({baseline:[{...r,capacity_bytes:bytes(r)}],usage:bytes(r)});await assert.rejects(measure(m.client,packet(),{orgId:ORG,actorId:ACTOR,baselineOrgId:ORG}),e=>e.code==='restore_conflict');
 const old={id:r.id,payload:{legacy:true}},n=measurement({baseline:[{...old,capacity_bytes:bytes(old)}],usage:bytes(old)});await assert.rejects(measure(n.client,packet([r]),{orgId:ORG,actorId:ACTOR,baselineOrgId:ORG}),e=>e.code==='restore_conflict');
});
test('mixed valid inactive GROUP/FIELD and empty Learning retain old vectors plus exact CRM rows',async()=>{
 const shared={learningBridge:{format:'charitology-learning-backup',version:1,method:'learning-review-v1',sources:[],approvedEvidence:[],events:[],reports:[]},participationGroups:inactiveGroup()};
 // The fixed unit serialization clock reproduces the independently captured
 // committed75 packet, rather than comparing two new implementations.
 const RealDate=Date;class Fixed extends RealDate{constructor(...a){super(...(a.length?a:[committed75.mixedInput.createdAt]));}}
 let without,withCrm;globalThis.Date=Fixed;try{without=packet([fieldReport()],shared);withCrm=packet([fieldReport(),report()],shared);}finally{globalThis.Date=RealDate;}
 const b=measurement();assert.deepEqual(without,committed75.mixedInput);const previous=committed75.mixedResult,next=await measure(b.client,withCrm);
 assert.equal(next.categories.os_reports.count,2);assert.equal(next.categories.os_participation_groups.count,1);assert.equal(next.categories.os_participation_group_receipts.count,0);
 for(const key of Object.keys(previous.categories).filter(k=>!['os_reports','os_events'].includes(k)))assert.deepEqual(next.categories[key],previous.categories[key]);
 assert.deepEqual(b.observed.get('os_reports').map(r=>r.payload),withCrm.reports.map(r=>r.payload));
 const detail=b.observed.get('os_events').at(-1).detail;assert.equal(detail.fieldResponseReportsRecovered,1);assert.equal(detail.contactReconciliationReportsRecovered,1);assert.equal(detail.participationGroupsRecovered,1);assert.equal(detail.learningReportsRecovered,0);assert(next.backupBytes>previous.backupBytes);
});
test('old operational-growth implementation remains exact; no repeated CRM-specific reserve',()=>{
 const at='2026-11-08T00:00:00.000Z',p={version:2,participations:[{id:'p',revision:1}],outbox:[{id:'n',participationId:'p',intentKind:'snapshot',state:'paused',attempts:0,attemptedAt:null,lastCheckedAt:null,providerEventAt:null}]};
 assert.deepEqual(p,committed75.operationalInput);assert.deepEqual(operationalGrowth(p),committed75.operationalResult);assert(operationalGrowth(p).sourceWireGrowthBytes>0);
});
test('CRM-only ordinary source gate reaches complete inactive restore and keeps required totals',async()=>{
 const f=exporter([report()]),value=await checkWorkspaceExportCapacity(f.client,ORG);assert(value.restore);assert.equal(value.restore.categories.os_reports.count,1);assert.equal(value.requiredUsage,value.usage);assert.equal(value.requiredBackupBytes,value.backupBytes);assert(f.calls.some(x=>x.sql.includes('AS crm')));
});
test('declared fake composite pressure triggers unchanged 60 MiB refusal, no attained maximum claim',async()=>{
 const m=measurement({reportBytes:60*1024*1024});await assert.rejects(checkLearningRestoreCapacity(m.client,packet([report()])),e=>e.code==='learning_restore_capacity');
});
test('CRM-only optional export audit uses full packet/candidate row headroom and omits on failure',async()=>{
 const f=exporter([report()]),event={org_id:ORG,actor_id:ACTOR,action:'backup.exported',record_id:null,module_id:null,detail:{checksum:'a'.repeat(64)}};let measured=0;
 const c={async query(sql,args){if(sql.startsWith('SELECT sum(size) AS size FROM ('))return{rows:[{size:60*1024*1024-1000}]};if(sql.startsWith('SELECT octet_length(to_jsonb(candidate)::text) AS bytes')){measured++;return{rows:[{bytes:2001,fields:event}]};}return f.client.query(sql,args);}};
 assert.equal(await canRetainIncubatorExportAudit(c,ORG,event),false);assert.equal(measured,1);
 let positiveMeasured=0;const sufficient={async query(sql,args){if(sql.startsWith('SELECT octet_length(to_jsonb(candidate)::text) AS bytes')){positiveMeasured++;const v=JSON.parse(args[0]),{id,created_at,...fields}=v;return{rows:[{bytes:bytes(v),fields}]};}return f.client.query(sql,args);}};
 assert.equal(await canRetainIncubatorExportAudit(sufficient,ORG,event),true);assert.equal(positiveMeasured,1);
 const broken={query(){throw Error('MEASURE_FAILED');}};assert.equal(await canRetainIncubatorExportAudit(broken,ORG,event),false);
});
test('CRM-free actual assembler serialization remains byte-identical to committed75 under a fixed unit clock',async()=>{
 const RealDate=Date;class Fixed extends RealDate{constructor(...a){super(...(a.length?a:['2026-11-08T12:00:00.000Z']));}static now(){return RealDate.parse('2026-11-08T12:00:00.000Z');}}
 globalThis.Date=Fixed;try{assert.equal(new Date().toISOString(),committed75.fixedClock);const rows=[{id:'legacy',payload:{old:true}}],current=await assembleWorkspaceBackup(exporter(rows).client,ORG,{organization,records:[]});assert.equal(JSON.stringify(current),committed75.assembledJSON);assert.equal(hash(current),committed75.assembledHash);}finally{globalThis.Date=RealDate;}
});
async function classified(mode){
 const f=exporter([report()],{crm:true}),calls=[],c={release(){calls.push('RELEASE');},async query(sql,args){calls.push(sql);
  if(sql.includes(' AS participation,')&&sql.includes(' AS crm'))return{rows:[{present:false,participation:false,incubator:false,checkins:false,groups:false,field:false,crm:true}]};
  if(sql==='SELECT count(*) AS count FROM os_participation_checkins WHERE org_id=$1')return{rows:[{count:0}]};
  if(sql.startsWith('INSERT INTO os_events('))return{rows:[],rowCount:1};
  // Declared fake pressure only, unchanged for all queries in this tx. It is
  // not an attained 60 MiB fixture or an actual PostgreSQL byte measurement.
  if(mode==='omitted-audit'&&sql.startsWith('SELECT sum(size) AS size FROM ('))return{rows:[{size:60*1024*1024-1000}]};
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.startsWith('SELECT set_config(')||sql.startsWith('SELECT pg_advisory_xact_lock'))return{rows:[]};
  return f.client.query(sql,args);
 }};const Old=pg.Pool;pg.Pool=class{async connect(){return c;}};
 try{const value=await database('postgres://fictional.invalid/crm').tx(ACTOR,ORG,async client=>{
  if(mode==='after-action'){await audit(client,ORG,ACTOR,'record.updated',null,{fictional:true});noteContactReconciliationReceiptReplay(client,ORG);}
  if(mode==='before-action'){noteContactReconciliationReceiptReplay(client,ORG);await audit(client,ORG,ACTOR,'record.updated',null,{fictional:true});}
  if(mode==='replay')noteContactReconciliationReceiptReplay(client,ORG);
  if(mode==='unowned')noteContactReconciliationReceiptReplay({},ORG);
  if(mode==='wrong-org')noteContactReconciliationReceiptReplay(client,'other');
  if(mode==='omitted-audit'){assert.equal(await audit(client,ORG,ACTOR,'backup.exported',null,{}),false);noteContactReconciliationReceiptReplay(client,ORG);}
  return{receiptReadOnly:mode==='replay'};
 },{lock:true});assert.equal(value.receiptReadOnly,mode==='replay');assert.deepEqual(calls.slice(-2),['COMMIT','RELEASE']);return calls;}finally{pg.Pool=Old;}
}
test('CRM Replay is actual-hard-only; tracked actions/unowned or wrong-org marker still require ordinary inactive reserve',async()=>{
 for(const mode of ['ordinary','replay','unowned','wrong-org','after-action','before-action','omitted-audit']){
  const calls=await classified(mode);assert(calls.some(q=>q.includes('AS crm')));
  assert(calls.some(q=>q==='SELECT * FROM os_reports WHERE org_id=$1'));
  assert.equal(calls.some(q=>q.startsWith('SELECT t.relname AS table_name')),!['replay','omitted-audit'].includes(mode));
  const mutations=calls.filter(q=>q.startsWith('INSERT INTO os_events'));assert.equal(mutations.length,['after-action','before-action'].includes(mode)?1:0);
 }
});
test('trusted CRM Replay marker cannot skip actual current hard-cap refusal',async()=>{
 const f=exporter([report()],{crm:true}),calls=[],client={release(){calls.push('RELEASE');},async query(sql,args){calls.push(sql);
  if(sql.includes(' AS participation,')&&sql.includes(' AS crm'))return{rows:[{present:false,participation:false,incubator:false,checkins:false,groups:false,field:false,crm:true}]};
  if(sql.startsWith('SELECT sum(size) AS size FROM ('))return{rows:[{size:60*1024*1024+1}]};
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.startsWith('SELECT set_config(')||sql.startsWith('SELECT pg_advisory_xact_lock'))return{rows:[]};
  return f.client.query(sql,args);
 }};const Old=pg.Pool;pg.Pool=class{async connect(){return client;}};
 try{await assert.rejects(database('postgres://fictional.invalid/crm').tx(ACTOR,ORG,async c=>{noteContactReconciliationReceiptReplay(c,ORG);return{receipt:true};},{lock:true}),e=>e.code==='quota');assert.deepEqual(calls.slice(-2),['ROLLBACK','RELEASE']);assert(!calls.includes('COMMIT'));assert(!calls.some(q=>q.startsWith('INSERT')));}finally{pg.Pool=Old;}
});
