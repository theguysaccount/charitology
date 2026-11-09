import { legacyVolunteerSubstitutions } from './fixtures/volunteer-substitution-legacy.mjs';
import { reservationSchemaSql, legacyReservationLayout } from "./fixtures/resource-reservation-schema.mjs";
import { RESOURCE_RESERVATION_GUARD_SQL as reservationSql } from "../lib/resource-reservation-guards.mjs";
// Actual pure modules and closed fake SELECT/INSERT seams; no PG/auth/rollback proof.
import test from 'node:test';
import legacyProjection from './fixtures/field-legacy-restore-projection-v1.json' with {type:'json'};
import assert from 'node:assert/strict';
import pg from 'pg';
import {makeBackup,validateBackup} from '../lib/backup.mjs';
import {database,audit} from '../lib/database.mjs';
import {validateRecord} from '../lib/modules.mjs';
import {FIELD_FORMAT,FIELD_METHOD,inspectFieldAggregateFile,makeFieldMapping,compileFieldObservationDrafts} from '../lib/field-response-model.mjs';
import {makeFieldResponseReportRow} from '../lib/field-response-store.mjs';
import {inspectFieldResponseRecovery,planRestoredFieldResponseReports,restoreFieldResponseReports,
  fieldResponseRestoreSummary,fieldResponseNativeReports} from '../lib/field-response-recovery.mjs';
import {measureLearningRestoreCapacity,checkLearningRestoreCapacity} from '../lib/learning-capacity.mjs';
import {assembleWorkspaceBackup,checkWorkspaceExportCapacity,canRetainIncubatorExportAudit} from '../lib/workspace-backup.mjs';
import {emptyParticipationGroupsQuery} from './fixtures/empty-participation-groups.mjs';
import {restoreMeasurementFixture} from './restore-capacity-fixture.mjs';

const ORG='source_org',ACTOR='source_actor',STAMP='2026-11-08T12:34:56.123456Z';
const organization={name:'Fictional',currency:'USD',time_zone:'UTC'};
const clone=v=>structuredClone(v),bytes=v=>Buffer.byteLength(JSON.stringify(v));
function report(id='field_report') {
  const program={id:'program',orgId:ORG,moduleId:'programs',revision:1,data:validateRecord('programs',{title:'Fictional program',kind:'program'}),deletedAt:null};
  const indicator={id:'indicator',orgId:ORG,moduleId:'outcomes',revision:1,data:validateRecord('outcomes',{title:'Fictional indicator',kind:'indicator',programId:'program',unit:'visits'},{orgId:ORG,recordId:'indicator',records:[program]}),deletedAt:null};
  const row={responseId:'aggregate_1',startDate:'2026-01-01',endDate:'2026-01-31',geography:null,visitCount:0,denominator:null,excluded:false,exclusionReason:null};
  const inspection=inspectFieldAggregateFile(Buffer.from(JSON.stringify({format:FIELD_FORMAT,version:1,formId:FIELD_METHOD,schemaVersion:1,responses:[row]})));
  const mapping=makeFieldMapping({orgId:ORG,program,indicator});
  const payload=compileFieldObservationDrafts({inspection,mapping,orgId:ORG,actorId:ACTOR,integrationId:'integration',program,indicator,selection:{responseIds:['aggregate_1']},candidateIds:[{responseId:'aggregate_1',recordId:'observation'}]}).manifest;
  return makeFieldResponseReportRow({orgId:ORG,id,actorId:ACTOR,createdAtExact:STAMP,payload});
}
const packet=(reports=[])=>makeBackup(organization,[],{reports});
const destination={orgId:'destination',actorId:'restorer',createdAtExact:'2026-11-08T13:00:00.654321Z'};
function measurement({baseline=[],usage=0,badReportSchema=false}={}) {
  const f=restoreMeasurementFixture(),calls=[];
  return {calls,observed:f.observed,client:{async query(sql,args){
    const handoff = legacyVolunteerSubstitutions(sql); if (handoff) return handoff;
    if (sql === reservationSchemaSql.layout) return legacyReservationLayout;
    calls.push({sql,args:clone(args)});
    if(sql.startsWith('SELECT t.relname AS table_name')) {
      const rows=f.query(sql,args).rows;
      if(args[0].includes('os_reports')) rows.push(...'org_id id created_by title checksum payload created_at'.split(' ').filter(c=>!badReportSchema||c!=='checksum').map(column_name=>({table_name:'os_reports',column_name})));
      return {rows};
    }
    if(sql.startsWith('SELECT item.ordinality::integer AS position')&&sql.includes('NULL::os_reports')) {
      assert.match(sql,/octet_length\(\(to_jsonb\(r\)\)::text\) AS bytes/);const values=JSON.parse(args[0]);f.observed.set('os_reports',values);
      return {rows:values.map((r,i)=>({position:i+1,bytes:bytes(r)}))};
    }
    if(sql.startsWith('SELECT t.*,octet_length(to_jsonb(t)::text) AS capacity_bytes FROM os_events'))return {rows:[]};
    if(sql.startsWith('SELECT t.*,octet_length(to_jsonb(t)::text) AS capacity_bytes FROM os_reports'))return {rows:clone(baseline)};
    if(sql.startsWith('SELECT sum(size) AS size FROM ('))return {rows:[{size:usage}]};
    const known=f.query(sql,args);if(known!==undefined)return known;
    throw Error('Unexpected fictional measurement SQL');
  }}};
}
function exporter(reports=[],features={}) {
  const m=measurement(),calls=m.calls;
  const allowed=new Set(['os_comments','os_events','os_reports','os_files','os_records','os_integrations','os_publications','os_intake','os_participation_targets','os_participations','os_participation_outbox','os_participation_delivery_policies','os_task_recurrence_series','os_task_recurrence_occurrences','os_resource_directory_history','os_learning_history','os_incubator_history','os_participation_checkins','os_participation_groups','os_participation_group_receipts']);
  return {calls,client:{async query(sql,args){
    const handoff = legacyVolunteerSubstitutions(sql); if (handoff) return handoff;
    if(sql.startsWith('SELECT t.relname AS table_name')||sql.startsWith('SELECT item.ordinality::integer AS position'))return m.client.query(sql,args);
    if (sql === reservationSchemaSql.layout) return legacyReservationLayout;
    calls.push({sql,args:clone(args)});
    const emptyGroup=emptyParticipationGroupsQuery(sql,args);if(emptyGroup!==undefined)return emptyGroup;
    if(sql.startsWith('SELECT sum(size) AS size FROM ('))return {rows:[{size:reports.reduce((s,r)=>s+bytes(r),0)}]};
    if(sql.startsWith('SELECT EXISTS(SELECT 1 FROM os_learning_history'))return {rows:[{present:false,incubator:false,checkins:false,groups:false,reminders:false,field:reports.length>0,...features}]};
    if(sql==='SELECT * FROM os_orgs WHERE id=$1')return {rows:[organization]};
    assert.match(sql,/^SELECT /);assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|FOR UPDATE)\b/);
    const table=sql.match(/\bFROM (os_[a-z_]+)/)?.[1];assert(allowed.has(table),'unknown fake export table');
    if(sql==='SELECT * FROM os_reports WHERE org_id=$1')return {rows:clone(reports)};
    return {rows:[]};
  }}};
}

test('legacy packets retain exact old validation and summary shape',()=>{
  const input=packet([{id:'legacy',payload:{historical:'ordinary'}}]);
  assert.deepEqual(validateBackup(input,'destination','restorer'),[]);
  assert.deepEqual(inspectFieldResponseRecovery(input),{present:false,reports:[]});
  assert.deepEqual(fieldResponseRestoreSummary(inspectFieldResponseRecovery(input)),{});
  assert.deepEqual(Object.keys(packet()),['format','version','schemaVersion','organization','createdAt','records','reports','checksum']);
});
test('malformed and unsupported reserved FIELD rows refuse before restoration',async()=>{
  for(const change of [r=>delete r.payload.sha256,r=>r.payload.version=2,r=>r.payload.method='other',r=>r.checksum='f'.repeat(64),r=>r.title='wrong',r=>r.extra='unknown']){
    const r=clone(report());change(r);const input=packet([r]);assert.throws(()=>validateBackup(input,'destination','restorer'));
    let sql=0;await assert.rejects(restoreFieldResponseReports({query(){sql++;throw Error('must not query');}},input,destination));assert.equal(sql,0);
  }
});
test('duplicate FIELD identity also collides with unrelated source report identity',()=>{
  const r=report();assert.throws(()=>inspectFieldResponseRecovery(packet([r,clone(r)])));
  assert.throws(()=>inspectFieldResponseRecovery(packet([r,{id:r.id,payload:{legacy:true}}])));
});
test('dense descriptor-owned scan refuses hooks without invoking them',()=>{
  let hooks=0;const input={get reports(){hooks++;return[];}};assert.throws(()=>inspectFieldResponseRecovery(input));
  const r=clone(report());Object.defineProperty(r,'payload',{enumerable:true,get(){hooks++;return report().payload;}});assert.throws(()=>inspectFieldResponseRecovery({reports:[r]}));
  const sparse=[];sparse.length=1;assert.throws(()=>inspectFieldResponseRecovery({reports:sparse}));assert.equal(hooks,0);
});
test('repeated native backup recovery retains data/id/title/checksum and historical origin',()=>{
  const original=report(),before=clone(original);let current=original;
  for(let n=0;n<3;n++){
    const input=JSON.parse(JSON.stringify(packet([current])));const result=planRestoredFieldResponseReports(input,{...destination,orgId:'destination_'+n});current=result.reports[0];
    assert.deepEqual(current.payload,before.payload);assert.equal(current.payload.originOrgId,ORG);assert.equal(current.id,before.id);assert.equal(current.title,before.title);assert.equal(current.checksum,before.checksum);assert.equal(current.org_id,'destination_'+n);assert.equal(current.created_by,destination.actorId);assert.equal(current.created_at,destination.createdAtExact);
    assert.deepEqual(fieldResponseRestoreSummary(result),{fieldResponseReportsRecovered:1});assert(Object.isFrozen(current.payload));
  }
  assert.deepEqual(original,before);
});
test('ordinary DB Date metadata exports as native ms without touching payload time strings',()=>{
  const original=report(),native={...clone(original),created_at:new Date(STAMP)};const result=fieldResponseNativeReports([native],ORG)[0];
  assert.equal(result.created_at,'2026-11-08T12:34:56.123Z');assert.deepEqual(result.payload,original.payload);assert(native.created_at instanceof Date);
  let invoked=0;Object.defineProperty(native,'title',{enumerable:true,get(){invoked++;return original.title;}});assert.throws(()=>fieldResponseNativeReports([native],ORG));assert.equal(invoked,0);
});
test('same outer client appends exactly seven fields, no accepted command or new clock',async()=>{
  const inserted=[],calls=[],c={async query(sql,args){
    const handoff = legacyVolunteerSubstitutions(sql); if (handoff) return handoff;
    calls.push(sql);
    if(sql.startsWith('SELECT id FROM os_reports'))return {rows:[]};
    if(sql.startsWith('SELECT org_id,id FROM os_reports'))return {rows:[]};
    assert.match(sql,/^INSERT INTO os_reports\(org_id,id,created_by,title,checksum,payload,created_at\)/);inserted.push(args);return {rowCount:1};}};
  const result=await restoreFieldResponseReports(c,packet([report()]),destination);assert.deepEqual(result,{present:true,count:1});assert.equal(inserted.length,1);assert.equal(inserted[0].length,7);assert.equal(inserted[0][0],destination.orgId);assert.equal(inserted[0][2],destination.actorId);assert.equal(inserted[0][6],destination.createdAtExact);assert.deepEqual(JSON.parse(inserted[0][5]),report().payload);
  assert(calls.every(q=>!/^BEGIN|^COMMIT|^ROLLBACK|clock_timestamp|UPDATE|DELETE/.test(q)));
});
test('destination FIELD history or any report ID collision refuses before all inserts',async()=>{
  for(const family of [true,false]){let inserts=0;const c={async query(sql){
    const handoff = legacyVolunteerSubstitutions(sql); if (handoff) return handoff;
    if(sql.startsWith('SELECT id FROM os_reports'))return {rows:family?[{id:'old_field'}]:[]};
    if(sql.startsWith('SELECT org_id,id FROM os_reports'))return {rows:[{org_id:destination.orgId,id:'field_report'}]};
    inserts++;throw Error('must not insert');}};
    await assert.rejects(restoreFieldResponseReports(c,packet([report()]),destination),e=>e.status===409);assert.equal(inserts,0);
  }
});
test('legacy restore capacity vectors and audit detail remain byte-exact',async()=>{
  const input=clone(legacyProjection.input),a=measurement();
  const current=await measureLearningRestoreCapacity(a.client,input);
  assert.deepEqual(current,legacyProjection.result);assert.deepEqual([...a.observed],legacyProjection.observedEntries);assert(!Object.hasOwn(current.categories,'os_reports'));
  assert(!Object.hasOwn(a.observed.get('os_events').at(-1).detail,'fieldResponseReportsRecovered'));
});
test('FIELD projection measures complete seven-column composite and conditional audit counter',async()=>{
  const m=measurement(),input=packet([report()]),before=clone(input);const result=await measureLearningRestoreCapacity(m.client,input);
  assert.equal(result.categories.os_reports.count,1);const rows=m.observed.get('os_reports');assert.equal(rows.length,1);assert.deepEqual(Object.keys(rows[0]),'org_id id created_by title checksum payload created_at'.split(' '));
  assert.equal(rows[0].org_id,'o'.repeat(100));assert.equal(rows[0].created_by,'u'.repeat(100));assert.deepEqual(rows[0].payload,input.reports[0].payload);
  assert.equal(result.categories.os_reports.bytes,bytes(rows[0]));assert.equal(m.observed.get('os_events').at(-1).detail.fieldResponseReportsRecovered,1);assert.deepEqual(input,before);
});
test('FIELD-only restore schema drift refuses rather than guessing report size',async()=>{
  const m=measurement({badReportSchema:true});await assert.rejects(measureLearningRestoreCapacity(m.client,packet([report()])),e=>e.code==='learning_capacity_schema');
});
test('existing destination FIELD history conflicts even for a legacy source',async()=>{
  const r=report(),m=measurement({baseline:[{...r,capacity_bytes:bytes(r)}],usage:bytes(r)});
  await assert.rejects(measureLearningRestoreCapacity(m.client,packet(),{orgId:ORG,actorId:ACTOR,baselineOrgId:ORG}),e=>e.code==='restore_conflict');
});
test('FIELD source ID colliding with destination legacy report refuses',async()=>{
  const legacy={id:'field_report',payload:{legacy:true}},m=measurement({baseline:[{...legacy,capacity_bytes:bytes(legacy)}],usage:bytes(legacy)});
  await assert.rejects(measureLearningRestoreCapacity(m.client,packet([report()]),{orgId:ORG,actorId:ACTOR,baselineOrgId:ORG}),e=>e.code==='restore_conflict');
});
test('actual exporter keeps FIELD history available in the next ordinary native packet',async()=>{
  let r=report();for(let i=0;i<2;i++){
    const f=exporter([{...clone(r),created_at:new Date(r.created_at)}]);const b=await assembleWorkspaceBackup(f.client,ORG,{organization,records:[]});
    assert.equal(b.reports.length,1);assert.deepEqual(b.reports[0].payload,r.payload);assert.equal(b.reports[0].checksum,r.checksum);
    r=planRestoredFieldResponseReports(JSON.parse(JSON.stringify(b)),{...destination,orgId:ORG}).reports[0];
  }
});
test('FIELD-only workspace reaches complete inactive projection with actual report charge',async()=>{
  const f=exporter([report()]);const result=await checkWorkspaceExportCapacity(f.client,ORG);
  assert(result.restore);assert.equal(result.restore.categories.os_reports.count,1);assert.equal(result.requiredUsage,result.usage);assert(f.calls.some(c=>c.sql.includes("payload->>'format'='charitology-field-response-import'")));
});
test('actual transaction classifier reaches complete gate for FIELD-only ordinary changes',async()=>{
  const calls=[],c={release(){calls.push('RELEASE');},async query(sql){
    const handoff = legacyVolunteerSubstitutions(sql); if (handoff) return handoff;
    calls.push(sql);
    if (sql === reservationSchemaSql.layout) return legacyReservationLayout;
    if(sql.includes(' AS checkins'))return {rows:[{present:false,participation:false,incubator:false,checkins:false,groups:false,field:true}]};
    if(sql.startsWith('SELECT sum(size) AS size FROM ('))return {rows:[{size:0}]};
    if(sql==='SELECT * FROM os_orgs WHERE id=$1')throw Error('ACTUAL_FIELD_COMPLETE_GATE');
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.startsWith('SELECT set_config(')||sql.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[]};
    throw Error('Unexpected fictional classifier query');}};
  const OldPool=pg.Pool;pg.Pool=class{async connect(){return c;}};
  try{await assert.rejects(database('postgres://fictional.invalid/field').tx('actor','org',()=>({changed:true}),{lock:true}),/ACTUAL_FIELD_COMPLETE_GATE/);assert.deepEqual(calls.slice(-2),['ROLLBACK','RELEASE']);assert(!calls.includes('COMMIT'));}
  finally{pg.Pool=OldPool;}
});

// Declared fake near-logical-cap values only; no large native packet or attained maximum.
test('FIELD-only optional export journal measures declared remaining headroom instead of unconditional true',async()=>{
 const f=exporter([report()],{field:true,incubator:false}),event={org_id:ORG,actor_id:ACTOR,action:'backup.exported',record_id:null,module_id:null,detail:{checksum:'a'.repeat(64)}};let measured=0;
 const c={async query(sql,args){
   const handoff = legacyVolunteerSubstitutions(sql); if (handoff) return handoff;
  if(sql.startsWith('SELECT sum(size) AS size FROM ('))return {rows:[{size:60*1024*1024-1000}]};
  if(sql==='SELECT octet_length(to_jsonb(candidate)::text) AS bytes,to_jsonb(candidate)-\'id\'-\'created_at\' AS fields FROM jsonb_populate_record(NULL::os_events,$1::jsonb) AS candidate'){measured++;return {rows:[{bytes:2001,fields:event}]};}
  return f.client.query(sql,args);
 }};
 assert.equal(await canRetainIncubatorExportAudit(c,ORG,event),false);assert.equal(measured,1);assert(f.calls.some(c=>c.sql.includes('AS field')));
});
test('FIELD-only nonordinary transaction reaches actual hard packet gate without new restore reserve',async()=>{
 const f=exporter([],{field:true}),calls=[],c={release(){calls.push('RELEASE');},async query(sql,args){
   const handoff = legacyVolunteerSubstitutions(sql); if (handoff) return handoff;
   calls.push(sql);
  if (sql === reservationSql.destination) return { rows: [{ occupied: false }], rowCount: 1 };
  if(sql==='SELECT * FROM os_orgs WHERE id=$1')throw Error('FIELD_ACTUAL_EXIT_GATE');
  if(sql.includes(' AS participation,')&&sql.includes(' AS field'))return {rows:[{present:false,participation:false,incubator:false,checkins:false,groups:false,field:true}]};
  if(sql==='SELECT count(*) AS count FROM os_participation_checkins WHERE org_id=$1')return {rows:[{count:0}]};
  if(sql==='SELECT sum(size) AS size FROM ('||sql.startsWith('SELECT sum(size) AS size FROM ('))return {rows:[{size:0}]};
  if(sql.startsWith('INSERT INTO os_events('))return {rows:[],rowCount:1};
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.startsWith('SELECT set_config(')||sql.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[]};
  return f.client.query(sql,args);
 }};
 const OldPool=pg.Pool;pg.Pool=class{async connect(){return c;}};
 try{await assert.rejects(database('postgres://fictional.invalid/field').tx('actor','org',async client=>{await audit(client,'org','actor','integration.disabled',null,{id:'connection'});return {disabled:true};},{lock:true}),/FIELD_ACTUAL_EXIT_GATE/);assert.deepEqual(calls.slice(-2),['ROLLBACK','RELEASE']);assert(!calls.includes('COMMIT'));}
 finally{pg.Pool=OldPool;}
});
