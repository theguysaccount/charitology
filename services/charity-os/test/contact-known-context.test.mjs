/** Fake SELECT orchestration with actual unchanged pure producers. No SQL/RLS/accepted authority proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, ORG, NOW, raw } from './contact-known-context-fixtures.mjs';
import { grantFixture, syntheticReport } from './grant-history-fixtures.mjs';
import { fixture as learningFixture, rows as learningRows, refreshBytes } from './contact-learning-fixtures.mjs';
import { learningNativeToC, learningMappedFixture, appendLearningTestMeasurement, finishLearningFixture } from './learning-fixtures.mjs';
import { learningSeal } from '../lib/learning-json.mjs';
import absentGolden from './fixtures/contact-known-context-absent-golden-v1.json' with { type:'json' };
import { validateStoredGrantInventory } from '../lib/grant-report-history.mjs';
import { planContactReconciliation } from '../lib/contact-reconciliation-model.mjs';
import { validateRecord } from '../lib/modules.mjs';
const clone = structuredClone;
const refused = p => assert.rejects(p, e => e.name === 'ContactContextError' && e.code === 'contact_context_reconcile' && e.status === 409);
const plan = result => planContactReconciliation({ ...result.plannerContext, decision: { operation:'merge',survivorId:'left',fields:{title:'left',email:'unknown',displayLabel:'unknown'},basis:'record-comparison',reason:'Fictional duplicate drafts' } });
function grantSetup(edit = () => {}) {
  const f = grantFixture(); f.org = ORG;
  for (const r of f.records) r.orgId = ORG;
  for (const e of f.submissionEvents) { e.record.orgId = ORG; e.record.snapshot.orgId = ORG; }
  edit(f); return f;
}
function reportRow(p) { return {org_id:p.orgId,id:p.id,created_by:p.createdBy,title:p.title,checksum:p.checksum,payload:clone(p),created_at:NOW}; }
function putGrant(f,p) { (f.tables.os_reports ??= []).push(reportRow(p)); return p; }
function putLearning(f, options = {}) {
  const source = options.source ?? learningFixture({orgId:ORG,...options}), rows = learningRows(source, {tenant:ORG,recovered:options.recovered === true});
  f.tables.os_learning_history = rows.historyRows.map(e => e.row);
  for (const e of rows.historyRows) f.aliases.set('os_learning_history:'+e.row.id,e);
  for (const e of rows.reportRows) { (f.tables.os_reports ??= []).push(e.row); f.aliases.set('os_reports:'+e.row.id,e); }
  return {source,rows};
}
function contactSources(f,current,submitted,donor) {
  const all = new Set([current,submitted,donor].filter(Boolean));
  for(const id of all) f.records.push({id,orgId:ORG,moduleId:'contacts',data:{title:id,kind:'person-reference'}});
  const app=f.records.find(r=>r.id==='application'),receipt=f.records.find(r=>r.id==='receipt');
  app.data.funderId=current; receipt.data.contactId=donor;
  const old=f.submissionEvents[0].record;old.data.funderId=submitted;old.snapshot.data.funderId=submitted;
}

test('unrelated complete stored grant is admitted without installing frozen targets or authority',async()=>{
  const f=fixture();putGrant(f,syntheticReport(grantSetup()));const out=await f.read();
  assert.equal(out.plannerContext.references.length,0);assert(plan(out).proposal);
  assert.equal(f.tables.os_records.length,2);assert.equal(out.reportDependencies.length,0);
  assert(Object.isFrozen(out)&&Object.isFrozen(out.plannerContext.pair[0].data));
});
test('frozen and submitted funder plus receipt contact independently block either chosen contact',async()=>{
  for(const values of [['right','elsewhere',null],['elsewhere','right',null],[null,null,'right'],['left','right','elsewhere']]) {
    const f=fixture();putGrant(f,syntheticReport(grantSetup(g=>contactSources(g,...values))));const out=await f.read();
    assert(out.plannerContext.references.some(r=>r.family==='immutable-history'&&r.contactId==='right'));
    assert(out.reportDependencies.some(r=>r.contactIds.includes('right')));
    assert.equal(plan(out).proposal,null);assert(plan(out).refusals.includes('linked-private-or-immutable-history'));
  }
});
test('complete grant supersedes chain is admitted and missing predecessor refuses after collection',async()=>{
  const previous=syntheticReport(grantSetup(),'prior');const setup=grantSetup(g=>{const m=g.records.find(r=>r.id==='manifest');m.data.supersedesReportId=previous.id;m.data.revisionReason='Fictional correction';g.previousReport=previous;});
  const next=syntheticReport(setup,'next');const f=fixture();putGrant(f,next);putGrant(f,previous);assert.equal((await f.read()).reportDependencies.length,0);
  const bad=fixture();putGrant(bad,next);await refused(bad.read());assert(bad.calls.some(c=>c.sql.startsWith('/*crm:count:os_task_recurrence_series*/')));
});
test('grant complete validator refuses unknown reserved version, damaged board and full SQL metadata',async()=>{
  for(const edit of [p=>p.schemaVersion=2,p=>p.boardProjection.sections.summary='changed',p=>p.command.future='opaque']) {
    const f=fixture(),p=clone(syntheticReport(grantSetup()));edit(p);putGrant(f,p);await refused(f.read());
  }
  for(const key of ['created_by','title','checksum','id']) {const f=fixture();putGrant(f,syntheticReport(grantSetup()));f.tables.os_reports[0][key]='mismatch';await refused(f.read());}
});
test('full live Learning history uses all actual accepted receipt/graph parsers, with no Contact refs',async()=>{
  const f=fixture(),data=putLearning(f),out=await f.read();assert(plan(out).proposal);assert.equal(out.plannerContext.references.length,0);
  assert(data.rows.historyRows.some(e=>e.row.receipt));assert.equal(f.tables.os_records.length,2);
  const page=f.calls.find(c=>c.sql.startsWith('/*crm:page:os_learning_history*/')).sql;
  for(const part of ['to_jsonb(t)','AS created_exact','octet_length(t.payload::text) AS payload_bytes','COALESCE(octet_length(t.receipt::text),0) AS receipt_bytes'])assert(page.includes(part));
});
test('complete recovered orphan Learning data remains historical without current records or receipts',async()=>{
  const f=fixture(),{rows}=putLearning(f,{recovered:true});assert(rows.historyRows.every(e=>e.row.receipt===null));
  const out=await f.read();assert.equal(out.plannerContext.references.length,0);assert(plan(out).proposal);assert.equal(f.tables.os_records.length,2);
});
test('missing Learning source/evidence/event/report cannot become passive',async()=>{
  for(const kind of ['source','evidence','event','report']) {const f=fixture();putLearning(f);if(kind==='report')f.tables.os_reports=[];else {const at=f.tables.os_learning_history.findIndex(r=>r.row_kind===kind);f.tables.os_learning_history.splice(at,1);}await refused(f.read());}
});
test('live malformed receipt is refused even with honestly recomputed byte aliases/budget',async()=>{
  const f=fixture(),{rows}=putLearning(f),e=rows.historyRows.find(e=>e.row.row_kind==='event');e.row.receipt.result.records=[];refreshBytes(e);await refused(f.read());
});
test('each new SQL alias is required, typed, and bound before context success',async()=>{
  for(const edit of [r=>delete r.created_exact,r=>r.created_exact='2026-11-08T20:00:00.123457Z',r=>r.payload_bytes++,r=>r.receipt_bytes++,r=>r.payload_bytes=String(r.payload_bytes)]) {
    const f=fixture();putLearning(f);f.pageMutation=(table,rows)=>{if(table==='os_learning_history'&&rows.length)edit(rows[0]);return rows;};await assert.rejects(f.read(),e=>e.name==='ContactContextError');
  }
  const f=fixture();putLearning(f);f.tables.os_learning_history[0].budget_bytes++;await refused(f.read());
});
test('same-origin Learning identity colliding with actual live or trash Contact refuses',async()=>{
  for(const trash of [false,true]) {const f=fixture();putLearning(f,{programId:'right'});if(trash)f.tables.os_records.push(raw('program-one','contacts',validateRecord('contacts',{title:'Other',kind:'person-reference'},{records:[]} ),{deleted_at:NOW}));await refused(f.read());}
  const f=fixture();putLearning(f,{programId:'historical-program'});f.tables.os_records.push(raw('historical-program','contacts',validateRecord('contacts',{title:'Old',kind:'person-reference'},{records:[]}),{deleted_at:NOW}));await refused(f.read());
});
test('foreign-origin recovered ID matching chosen Contact does not acquire destination identity',async()=>{
  const f=fixture();putLearning(f,{orgId:'foreign-origin',programId:'right',recovered:true});const out=await f.read();assert.equal(out.plannerContext.references.length,0);assert(plan(out).proposal);
});
test('mixed complete families reconcile origin-scoped declared types across both inventories',async()=>{
  const f=fixture();putGrant(f,syntheticReport(grantSetup()));putLearning(f);assert(plan(await f.read()).proposal);
  const bad=fixture();putGrant(bad,syntheticReport(grantSetup()));putLearning(bad,{programId:'application'});await refused(bad.read());
});
test('same-org grant typed source ID contradicting actual current module refuses',async()=>{
  const f=fixture();putGrant(f,syntheticReport(grantSetup()));f.tables.os_records.push(raw('application','programs',validateRecord('programs',{title:'Actual program',kind:'program'},{records:[]})));await refused(f.read());
});
test('account/editor IDs and JSON-looking native narrative stay literal in fully admitted families',async()=>{
  const f=fixture();putLearning(f,{actorId:'right',native:learningNativeToC({outcomeShort:'[Planning] {draft}\nright'})});
  putGrant(f,syntheticReport(grantSetup(g=>{g.records.find(r=>r.id==='manifest').data.summary='[Planning]';g.records.find(r=>r.id==='program').data.purpose='{draft}';g.member.userId='right';})));
  const out=await f.read();assert.equal(out.plannerContext.references.length,0);assert(plan(out).proposal);
});
test('known payload/SQL microstamp mutations either change the full context pin or refuse',async()=>{
  const f=fixture();putLearning(f);const before=(await f.read()).contextSha256;
  const row=f.tables.os_learning_history[0],a=f.aliases.get('os_learning_history:'+row.id);row.created_at='2026-11-08T20:00:00.123457Z';a.createdAtExact='2026-11-08T20:00:00.123457Z';assert.notEqual((await f.read()).contextSha256,before);
  const g=fixture();putGrant(g,syntheticReport(grantSetup()));const old=(await g.read()).contextSha256;g.tables.os_reports[0].created_at='2026-11-08T12:00:00.123457Z';g.aliases.set('os_reports:'+g.tables.os_reports[0].id,{createdAtExact:'2026-11-08T12:00:00.123457Z'});assert.notEqual((await g.read()).contextSha256,old);
});
test('unsupported grant/Learning audit, preview, invitation job and other packet families remain refusals',async()=>{
  for(const table of ['os_grant_report_previews','os_learning_previews','os_incubator_history']) {const f=fixture();putLearning(f);f.tables[table]=[{org_id:ORG,id:'unsupported',payload:{}}];await assert.rejects(f.read(),e=>e.code==='contact_context_unsupported');}
  for(const action of ['learning.mapped','grant-report.frozen']) {const f=fixture();putLearning(f);f.tables.os_events=[{org_id:ORG,id:'1',actor_id:'actor',action,record_id:null,module_id:null,detail:{},created_at:NOW}];await refused(f.read());}
  const f=fixture();putLearning(f);f.tables.os_jobs=[{org_id:ORG,id:'invite',kind:'invitation',payload:{}}];await assert.rejects(f.read(),e=>e.code==='contact_context_unsupported');
});
test('fresh member denial remains before catalog or private family enumeration',async()=>{
  const f=fixture();putLearning(f);f.role='board_reader';await assert.rejects(f.read(),e=>e.status===403);assert(!f.calls.some(c=>c.sql.includes('/*crm:catalog*/')||c.sql.includes('/*crm:page:')));
});
test('known family does not waive real projected census drift, 32MiB or row caps',async()=>{
  for(const fakeCount of [t=>t==='os_learning_history'?{n:'1',bytes:String(32*1048576+1)}:null,t=>t==='os_learning_history'?{n:'20001',bytes:'1'}:null,t=>t==='os_learning_history'?{n:'1',bytes:'1'}:null]){const f=fixture();putLearning(f);f.fakeCount=fakeCount;await assert.rejects(f.read(),e=>e.name==='ContactContextError');}
});

test('old absence uses actual preserved pre-integration golden with identical context digest and private metadata',async()=>{
  const out=await fixture().read(),expected=clone(absentGolden.result);
  expected.coverage.unsupportedPacketFamilies=expected.coverage.unsupportedPacketFamilies.filter(t=>t!=='os_learning_history');
  assert.deepEqual(out,expected);assert.equal(out.contextSha256,absentGolden.result.contextSha256);
});
test('a valid standalone orphan source is refused after complete Learning collection',async()=>{
  const f=fixture(),{rows}=putLearning(f),extra=clone(rows.historyRows.find(e=>e.row.row_kind==='source'));
  const {sha256,...core}=extra.row.payload;core.bindingId='orphan-binding';extra.row.payload=learningSeal('source',core);extra.row.id=extra.row.payload.sha256;extra.row.binding_id=core.bindingId;refreshBytes(extra);
  f.tables.os_learning_history.push(extra.row);f.aliases.set('os_learning_history:'+extra.row.id,extra);await refused(f.read());
});
test('live and recovered report copies cannot collide across both physical locations',async()=>{
  const f=fixture(),{source}=putLearning(f),recovered=learningRows(source,{tenant:ORG,recovered:true}).historyRows.find(e=>e.row.row_kind==='recovered-report');
  f.tables.os_learning_history.push(recovered.row);f.aliases.set('os_learning_history:'+recovered.row.id,recovered);await refused(f.read());
});
test('full Learning inventory is finalized after a genuine second ASCII-keyset page',async()=>{
  const source=learningMappedFixture({orgId:ORG});const points=[];
  for(let i=1;i<=15;i++)points.push(appendLearningTestMeasurement(source,i,{recordId:'day-'+i,period:{kind:'closed-days',startDate:'2026-01-'+String(i).padStart(2,'0'),endDate:'2026-01-'+String(i).padStart(2,'0')}}));
  const completed=finishLearningFixture(source,points);
  const f=fixture(),data=putLearning(f,{source:completed});assert(data.rows.historyRows.length>32);assert(plan(await f.read()).proposal);
  assert.equal(f.calls.filter(c=>c.sql.startsWith('/*crm:page:os_learning_history*/')).length,2);
});
test('late grant report page retains selected Contact blocker rather than admitting a prefix',async()=>{
  const f=fixture();for(let i=0;i<32;i++)putGrant(f,syntheticReport(grantSetup(),'early-'+String(i).padStart(2,'0')));
  putGrant(f,syntheticReport(grantSetup(g=>contactSources(g,'right',null,null)),'zz-late'));
  const out=await f.read();assert(out.reportDependencies.some(r=>r.reportId==='zz-late'&&r.contactIds.includes('right')));assert.equal(plan(out).proposal,null);
  assert.equal(f.calls.filter(c=>c.sql.startsWith('/*crm:page:os_reports*/')).length,2);
});

test('fully validated frozen reports still obey the existing128 Contact-reference ceiling',async()=>{
  const f=fixture();for(let i=0;i<65;i++)putGrant(f,syntheticReport(grantSetup(g=>contactSources(g,'left','right',null)),'bounded-'+String(i).padStart(2,'0')));
  await assert.rejects(f.read(),e=>e.name==='ContactContextError'&&e.code==='contact_context_limit'&&e.status===409);
});
