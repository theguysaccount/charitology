/** Pure and strict fake-query tests only. No PostgreSQL, actual session,
 * transaction rollback, SQL-clock, capacity attainability, CI or release proof. */
import test from 'node:test';import assert from 'node:assert/strict';
import {hash} from '../lib/security.mjs';
import {validateRecurringOccurrenceManifest,RECURRENCE_PACKET_KIND} from '../lib/participation-recurrence-packets.mjs';
import {recurrencePreflight,readRecurrenceSourceContext,authorizeRecurrenceHistory} from '../lib/participation-recurrence-context.mjs';
import {acceptedParticipationRecurrence,createParticipationRecurrence,participationRecurrenceHistory} from '../lib/participation-recurrence-commands.mjs';
import {requireRecurrenceIdsAvailable} from '../lib/participation-recurrence-store.mjs';
import {classifyParticipationRecurrenceRequest,readParticipationRecurrenceBody} from '../lib/participation-recurrence-http.mjs';
import {participationRecurrenceRoutes} from '../lib/participation-recurrence-routes.mjs';
import {restoredParticipationRecurrenceReports as recover,planRestoredParticipationRecurrenceReports as planRestore,participationRecurrenceRestoreSummary as summary,participationRecurrenceRestoreWarning as warning,exportParticipationRecurrenceReports as nativeReports,assertParticipationRecurrenceRestoreDestination as destination} from '../lib/participation-recurrence-recovery.mjs';
import {makeBackup,validateBackup} from '../lib/backup.mjs';
import {recurrenceCreatedAuditRecord} from '../lib/participation-recurrence-records.mjs';
import {makeRecurringOccurrencePreview,makeRecurringOccurrenceReceipt,recurringOccurrenceReportTitle} from '../lib/participation-recurrence-packets.mjs';
import {stable} from '../lib/security.mjs';
import {fakeContext,packets,ORG,ACTOR,AT,CREATED,session,request} from './fixtures/recurrence-fake-context.mjs';
import {fixture as crmFixture,ORG as CRM_ORG,USER as CRM_USER,NOW as CRM_NOW,raw as crmRaw} from './contact-known-context-fixtures.mjs';
const args=()=>({org:ORG,session:session(),input:request()}),reject=(fn,code)=>assert.rejects(fn,e=>e.code===code),syncReject=(fn,code)=>assert.throws(fn,e=>e.code===code);
const seal=m=>{const {sha256,...body}=m;return{...body,sha256:hash({method:'participation-weekly-v1',purpose:RECURRENCE_PACKET_KIND,kind:'manifest',value:body})};};
test('historical normalized prose rejects coherently rehashed empty text while retaining explicit null',async()=>{
  for(const module of ['events','volunteers']){const f=fakeContext(module),{manifest}=await packets(f);for(const field of ['organizerEmail','participantInstructions',...(module==='volunteers'?['skills']:[])]){
    const empty=structuredClone(manifest);empty.source.data[field]='';for(const c of empty.candidates)c.data[field]='';syncReject(()=>validateRecurringOccurrenceManifest(seal(empty)),'recurrence_packet_fields');
    const unknown=structuredClone(manifest);unknown.source.data[field]=null;for(const c of unknown.candidates)c.data[field]=null;assert.equal(validateRecurringOccurrenceManifest(seal(unknown)).source.data[field],null);
  }}
});
test('actual declared organizerEmail remains bounded text, without invented email-format restriction',async()=>{const {manifest}=await packets(fakeContext());assert.equal(manifest.source.data.organizerEmail,'invalid');assert.equal(validateRecurringOccurrenceManifest(manifest).candidates[0].data.organizerEmail,'invalid');});
test('Events-only current writer passes union preflight; exact Volunteers writer permission still refuses',async()=>{
  const events=fakeContext();events.role='grants_lead';assert.deepEqual((await recurrencePreflight(events.c,{org:ORG,session:session(),write:true})).permitted,['events']);await readRecurrenceSourceContext(events.c,{org:ORG,session:session(),sourceId:'fictional-template',write:false});
  const shifts=fakeContext('volunteers');shifts.role='grants_lead';await reject(()=>readRecurrenceSourceContext(shifts.c,{org:ORG,session:session(),sourceId:'fictional-template',write:false}),'role');
});
test('permission preflight precedes any POST body read',async()=>{
  const f=fakeContext();f.role='board_reader';let reads=0;const fakeRequest={method:'POST',url:`https://os.invalid/api/orgs/${ORG}/participation-recurrence/preview`,headers:new Headers({'content-type':'application/json'}),get body(){reads++;throw Error('The body must not be read');}};
  await reject(()=>participationRecurrenceRoutes({request:fakeRequest,url:new URL(fakeRequest.url),db:f.db,session:session()}),'role');assert.equal(reads,0);assert.equal(f.writes,0);
});
test('fresh session/member loss and same-org scope never borrow a stored packet authority',async()=>{
  const f=fakeContext();await packets(f);f.sessionValid=false;await reject(()=>acceptedParticipationRecurrence(f.c,args()),'session');assert.equal(f.writes,0);
  const scoped=fakeContext();scoped.programIds=['another-program'];await reject(()=>readRecurrenceSourceContext(scoped.c,{org:ORG,session:session(),sourceId:'fictional-template',write:false}),'recurrence_unavailable');
  await reject(()=>recurrencePreflight(fakeContext().c,{org:'different-org',session:session(),write:true}),'membership');
});
test('source context streams raw pins, retains SQL6 and copies only safe operational data',async()=>{
  const f=fakeContext();Object.assign(f.records[0].data,{contactId:'discarded-person',registeredCount:2,attendanceCount:1,walkInCount:1});
  const c=await readRecurrenceSourceContext(f.c,{org:ORG,session:session(),sourceId:'fictional-template',write:true});assert.equal(c.dependencies.source.createdAtExact,CREATED);assert(c.dependencies.source.rowSha256.match(/^[a-f0-9]{64}$/));assert.equal(c.source.data.participantInstructions,'Fictional first line\nSecond line');assert(!JSON.stringify(c).includes('discarded-person'));assert(!Object.hasOwn(c.source.data,'registeredCount'));
  assert(f.calls.some(x=>x.sql?.includes('substring(convert_to(to_jsonb(t)::text')));assert(f.calls.some(x=>x.sql?.endsWith('FOR SHARE')));assert(f.calls.some(x=>x.sql?.includes('FOR SHARE OF s')));
});
test('source/reference type, alias and full-view policy refuse before copying a review',async()=>{
  const f=fakeContext();f.records[1].module_id='contacts';await reject(()=>readRecurrenceSourceContext(f.c,{org:ORG,session:session(),sourceId:'fictional-template',write:false}),'recurrence_dependencies');
  const g=fakeContext();g.programIds=[];g.records[0].data.programId='fictional-template';await reject(()=>readRecurrenceSourceContext(g.c,{org:ORG,session:session(),sourceId:'fictional-template',write:false}),'recurrence_dependencies');
});
test('accepted READ ONLY reconciliation ignores expiry and ordinary source edits, keeps missing-child result without clock/quota',async()=>{
  const f=fakeContext(),saved=await packets(f);f.current=false;f.stopAtCapacity=true;Object.assign(f.records[0],{revision:9,status:'review',updated_at:'2026-11-09T12:00:00.999999Z'});f.records[0].data.title='Current text changed';
  const oldIntl=Intl.DateTimeFormat,oldNow=Date.now;Intl.DateTimeFormat=()=>{throw Error('No current calendar for accepted Retry');};Date.now=()=>{throw Error('No new domain clock');};
  try{assert.deepEqual(await acceptedParticipationRecurrence(f.c,args()),{...saved.receipt.result,replayed:true});}finally{Intl.DateTimeFormat=oldIntl;Date.now=oldNow;}
  assert.equal(f.domainClocks,0);assert.equal(f.writes,0);assert(!f.calls.some(x=>x.sql?.includes('FROM pg_class')));
});
test('accepted receipt requires exact body/key/preview identity and original immutable report result',async()=>{
  for(const change of [q=>q.commandKey='different-original-command',q=>q.previewId='different-preview']){const f=fakeContext();await packets(f);const input=request();change(input);await reject(()=>acceptedParticipationRecurrence(f.c,{...args(),input}),'recurrence_intent');assert.equal(f.writes,0);}
  const f=fakeContext();await packets(f);f.reports[0].created_by='another-writer';await reject(()=>acceptedParticipationRecurrence(f.c,args()),'recurrence_intent');
});
test('member incarnation, restore epoch and selected typed-link identity changes require history reconciliation',async()=>{
  const a=fakeContext();await packets(a);a.memberCreated='2026-10-31T00:00:00.123457Z';await reject(()=>acceptedParticipationRecurrence(a.c,args()),'recurrence_reconcile');
  const b=fakeContext();await packets(b);b.epoch='1';await reject(()=>acceptedParticipationRecurrence(b.c,args()),'recurrence_reconcile');
  const c=fakeContext();c.programIds=[];await packets(c);c.records[0].data.programId='different-program';await reject(()=>acceptedParticipationRecurrence(c.c,args()),'recurrence_reconcile');
  const d=fakeContext();await packets(d);d.records[1].created_at='2026-10-31T00:00:00.123457Z';await reject(()=>acceptedParticipationRecurrence(d.c,args()),'recurrence_reconcile');
});
test('expired pending and changed complete raw source refuse before domain clock or writes',async()=>{
  const f=fakeContext();await packets(f,{committed:false});f.current=false;await reject(()=>createParticipationRecurrence(f.c,args()),'recurrence_preview');assert.equal(f.domainClocks,0);assert.equal(f.writes,0);
  const g=fakeContext();await packets(g,{committed:false});g.records[0].data.registeredCount=2;await reject(()=>createParticipationRecurrence(g.c,args()),'recurrence_stale');assert.equal(g.domainClocks,0);assert.equal(g.writes,0);
  const h=fakeContext();await packets(h,{committed:false});h.records[0].updated_at='2026-11-01T00:00:00.654322Z';await reject(()=>createParticipationRecurrence(h.c,args()),'recurrence_stale');
});
test('unchanged stored review reaches bounded capacity admission after pins, before final clock or writes',async()=>{
  const f=fakeContext();await packets(f,{committed:false});f.stopAtCapacity=true;await reject(()=>createParticipationRecurrence(f.c,args()),'fake_capacity_boundary');assert.equal(f.domainClocks,0);assert.equal(f.writes,0);
});
test('accepted race aborts the write-classified path for fresh READ ONLY reconciliation',async()=>{
  const f=fakeContext();await packets(f);await reject(()=>createParticipationRecurrence(f.c,args()),'recurrence_read_reconcile');assert.equal(f.domainClocks,0);assert.equal(f.writes,0);
});
test('router reconciles a commit race via read-only lookup, with no second mutation or Replay marker',async()=>{
  const f=fakeContext(),saved=await packets(f),row=structuredClone(saved.row);f.previews=[];f.onTxEnd=(number)=>{if(number===2)f.previews=[row];};
  const req=new Request(`https://os.invalid/api/orgs/${ORG}/participation-recurrence/create`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request())});
  const response=await participationRecurrenceRoutes({request:req,db:f.db,session:session()}),value=await response.json();assert.equal(value.replayed,true);assert.deepEqual(value.recordIds,saved.receipt.result.recordIds);assert.deepEqual(f.transactions.map(t=>!!t.readOnly),[true,true,false,true]);assert.equal(f.transactions[2].error,'recurrence_read_reconcile');assert.equal(f.writes,0);assert.equal(f.domainClocks,0);
});
test('current/trash IDs, retained historical roots and other pending review IDs reserve new identities',async()=>{
  const f=fakeContext();await packets(f,{committed:false});const plan={org:ORG,sourceId:'another-template',previewId:'new-preview',reportId:'new-report',recordIds:['fictional-template']};await reject(()=>requireRecurrenceIdsAvailable(f.c,plan),'recurrence_identity');
  f.records[0].deleted_at=AT;await reject(()=>requireRecurrenceIdsAvailable(f.c,plan),'recurrence_identity');
  await reject(()=>requireRecurrenceIdsAvailable(f.c,{...plan,recordIds:['fictional-child-1']}),'recurrence_identity');
  const g=fakeContext();await packets(g);await reject(()=>requireRecurrenceIdsAvailable(g.c,{...plan,sourceId:'fictional-template',recordIds:['new-child']}),'recurrence_existing_batch');
});
test('history needs current read/full-view scope including extra cursor row; no partial roster',async()=>{
  const f=fakeContext();await packets(f);const history=await participationRecurrenceHistory(f.c,{org:ORG,session:session(),reportId:'fictional-report'});assert.equal(history.report.acceptance,'historical-data-only');assert.equal(history.report.currentDisposition.length,2);
  f.role='board_reader';await reject(()=>authorizeRecurrenceHistory(f.c,{org:ORG,session:session(),manifest:f.reports[0].payload}),'recurrence_unavailable');
  const g=fakeContext();const saved=await packets(g);const hidden=structuredClone(saved.report);hidden.id=hidden.payload.reportId='z-hidden-report';hidden.payload.source.data.programId='outside-program';for(const c of hidden.payload.candidates)c.data.programId='outside-program';hidden.payload.dependencies.references[0].id='outside-program';hidden.payload=seal(hidden.payload);hidden.checksum=hidden.payload.sha256;g.reports.push(hidden);await reject(()=>participationRecurrenceHistory(g.c,{org:ORG,session:session(),limit:1}),'recurrence_unavailable');
});
test('closed HTTP refuses unknown suffix/query/HEAD/body and duplicate/nonfinite JSON',async()=>{
  const path=`/api/orgs/${ORG}/participation-recurrence/preview`;syncReject(()=>classifyParticipationRecurrenceRequest(path,'HEAD'),'recurrence_method');syncReject(()=>classifyParticipationRecurrenceRequest(path+'/extra','POST'),'recurrence_path');syncReject(()=>classifyParticipationRecurrenceRequest(path,'POST','?sourceId=hidden'),'recurrence_query');
  assert.equal(classifyParticipationRecurrenceRequest(`/api/orgs/${ORG}/participation-recurrence/history`,'GET','?limit=20&after=opaque').limit,20);
  for(const body of ['{"sourceId":"a","sourceId":"b"}','{"n":1e999}'])await assert.rejects(()=>readParticipationRecurrenceBody(new Request('https://os.invalid',{method:'POST',headers:{'content-type':'application/json'},body})),e=>e.code==='backup_json');
});
test('native report metadata moves across two inactive destinations while payload/IDs/hash remain exact',async()=>{
  const {report}=await packets(fakeContext());const source={reports:[report]},first=planRestore(source,{orgId:'first-destination',actorId:'first-admin',createdAtExact:'2027-01-01T00:00:00.000001Z'}),second=planRestore({reports:first.reports},{orgId:'second-destination',actorId:'second-admin',createdAtExact:'2028-01-01T00:00:00.999999Z'});
  assert.deepEqual(second.reports[0].payload,report.payload);assert.equal(second.reports[0].checksum,report.checksum);assert.equal(second.reports[0].id,report.id);assert.equal(second.reports[0].org_id,'second-destination');assert.equal(Object.hasOwn(second.reports[0].payload,'authority'),false);assert.equal(summary(second).participationRecurrenceReportsRecovered,1);
  const driver={...report,created_at:new Date(AT)};assert.deepEqual(nativeReports([driver],ORG)[0].payload,report.payload);
});
test('shared backup admission preserves orphan historical manifests without restoring command receipts',async()=>{
  const {report}=await packets(fakeContext());const native=makeBackup({name:'Fictional',currency:'USD',time_zone:'UTC'},[],{reports:[report]});assert.deepEqual(validateBackup(native,'destination','new-admin'),[]);assert.equal(recover(native).reports.length,1);assert.equal(Object.hasOwn(native,'previews'),false);assert.deepEqual(summary({present:false,reports:[]}),{});assert.equal(warning({present:false,reports:[]}),null);
});
test('malformed reserved version/suffix and all-family duplicate report IDs refuse native admission',async()=>{
  const {report}=await packets(fakeContext());for(const edit of [r=>r.payload.version=2,r=>r.payload.format+='-unknown']){const r=structuredClone(report);edit(r);assert.throws(()=>recover({reports:[r]}));}
  assert.throws(()=>recover({reports:[report,{id:report.id,payload:{format:'another-family'}}]}),e=>e.code==='recurrence_report_duplicate');
});
test('legacy-absent destination guard still checks existing family and any incoming report ID before writes',async()=>{
  const calls=[];const c={async query(sql,args){calls.push({sql,args});return{rows:[{occupied:true,collision:false}]};}};await reject(()=>destination(c,ORG,{reports:[]}), 'restore_conflict');assert.equal(calls.length,1);assert(!calls.some(x=>/INSERT|UPDATE|DELETE/.test(x.sql)));
  const collision={async query(){return{rows:[{occupied:false,collision:true}]};}};await reject(()=>destination(collision,ORG,{reports:[{id:'generic-report',payload:{}}]}),'restore_conflict');
});
test('RR-HISTORY-ROLE-02 orphan safeguarding still needs that declared module read permission',async()=>{
  const f=fakeContext('volunteers'),{manifest}=await packets(f);f.records=[];f.role='grants_lead';await reject(()=>authorizeRecurrenceHistory(f.c,{org:ORG,session:session(),manifest}),'role');
  f.role='program_lead';assert.deepEqual((await authorizeRecurrenceHistory(f.c,{org:ORG,session:session(),manifest})).current,[]);
});
test('RR-CRM-AUDIT-01 a generated draft batch plus unrelated Contacts remains inspectable by strict ordinary audit admission',async()=>{
  const f=fakeContext(),saved=await packets(f),crm=crmFixture();const manifest=seal({...structuredClone(saved.manifest),originOrgId:CRM_ORG});
  crm.tables.os_records.push(crmRaw('fictional-program','programs',{title:'Fictional program'}),crmRaw(manifest.source.id,'events',manifest.source.data),...manifest.candidates.map(c=>crmRaw(c.id,c.moduleId,c.data)));
  crm.tables.os_reports=[{...saved.report,org_id:CRM_ORG,created_by:CRM_USER,payload:manifest,checksum:manifest.sha256}];
  // Same builder consumes explicit SQL-shaped driver facts here and actual
  // postinsert rows in commands; this fake fixture does not prove SQL origin.
  crm.tables.os_events=manifest.candidates.map((c,index)=>{const candidate={id:c.id,orgId:CRM_ORG,moduleId:c.moduleId,data:c.data,status:'draft',ownerId:CRM_USER,lastEditedBy:CRM_USER,revision:1,approval:null,snapshot:null,source:null};const row=crmRaw(c.id,c.moduleId,c.data);return{org_id:CRM_ORG,id:String(index+1),actor_id:CRM_USER,action:'record.created',record_id:c.id,module_id:c.moduleId,detail:{record:recurrenceCreatedAuditRecord(row,candidate)},created_at:CRM_NOW};});
  crm.tables.os_events.push({org_id:CRM_ORG,id:'3',actor_id:CRM_USER,action:'participation-recurrence.generated',record_id:null,module_id:null,detail:{reportId:manifest.reportId,reportSha256:manifest.sha256,sourceId:manifest.source.id,recordIds:manifest.candidates.map(c=>c.id)},created_at:CRM_NOW});
  await assert.doesNotReject(()=>crm.read());
});
test('created-audit builder uses supplied persisted SQL timestamps and omits source only from created projection',async()=>{
  const {preview}=await packets(fakeContext()),candidate=preview.review.compiled.candidates[0],row={org_id:candidate.orgId,id:candidate.id,module_id:candidate.moduleId,data:candidate.data,status:'draft',owner_id:candidate.ownerId,last_editor_id:candidate.lastEditedBy,revision:1,approval:null,snapshot:null,source:null,deleted_at:null,created_at:'2026-11-02T00:01:11.123456Z',updated_at:'2026-11-02T00:01:12.654321Z'};
  const result=recurrenceCreatedAuditRecord(row,candidate);assert.equal(result.createdAt,'2026-11-02T00:01:11.123Z');assert.equal(result.updatedAt,'2026-11-02T00:01:12.654Z');assert.notEqual(result.createdAt,AT.slice(0,23)+'Z');assert.equal(Object.hasOwn(result,'source'),false);assert.equal(candidate.source,null);
  for(const changed of [{...row,owner_id:'different-writer'},{...row,revision:2},{...row,source:{}},{...row,created_at:row.updated_at,updated_at:row.created_at}])assert.throws(()=>recurrenceCreatedAuditRecord(changed,candidate),e=>e.code==='recurrence_created_row');
});
test('RR-CRM-ORIGIN-05 foreign same-spelled orphan IDs remain passive; same-origin typed contradiction refuses',async()=>{
  const {report}=await packets(fakeContext());
  for(const foreign of [true,false]){const crm=crmFixture(),payload=structuredClone(report.payload);payload.originOrgId=foreign?'foreign-origin':CRM_ORG;payload.source.id='left';payload.dependencies.source.id='left';const m=seal(payload);crm.tables.os_reports=[{...report,org_id:CRM_ORG,created_by:CRM_USER,title:recurringOccurrenceReportTitle(m),payload:m,checksum:m.sha256}];
    if(foreign)await assert.doesNotReject(()=>crm.read());else await assert.rejects(()=>crm.read());
  }
});
test('strict passive recurrence preview and receipt bookkeeping can coexist with unrelated Contacts',async()=>{
  const saved=await packets(fakeContext());const input={...saved.input,orgId:CRM_ORG,actorId:CRM_USER,source:{...saved.input.source,orgId:CRM_ORG},references:saved.input.references.map(r=>({...r,orgId:CRM_ORG}))};
  const preview=makeRecurringOccurrencePreview({orgId:CRM_ORG,actorId:CRM_USER,reportId:'historical-report',authority:{...saved.context.authority,actorId:CRM_USER},dependencies:saved.context.dependencies,input});
  const crm=crmFixture();crm.tables.os_previews=[{org_id:CRM_ORG,id:'retained-preview',actor_id:CRM_USER,kind:RECURRENCE_PACKET_KIND,payload:preview,checksum:hash(preview),base_revision:preview.dependenciesSha256,created_at:CRM_NOW,expires_at:'2026-11-08T12:30:00.123456Z',committed_at:null}];
  crm.pageMutation=(table,output)=>table==='os_previews'?output.map(x=>{const r=JSON.parse(x.row_json);return{...x,preview_created_exact:r.created_at,preview_expires_exact:r.expires_at,preview_committed_exact:r.committed_at};}):output;
  await assert.doesNotReject(()=>crm.read());crm.tables.os_previews[0].kind='unsupported-purpose';await assert.rejects(()=>crm.read(),e=>e.code==='contact_context_unsupported');
});
test('recurrence-purpose preview exact SQL6 aliases bind CRM digest while raw row JSON stays unchanged',async()=>{
  const saved=await packets(fakeContext()),input={...saved.input,orgId:CRM_ORG,actorId:CRM_USER,source:{...saved.input.source,orgId:CRM_ORG},references:saved.input.references.map(r=>({...r,orgId:CRM_ORG}))};
  const preview=makeRecurringOccurrencePreview({orgId:CRM_ORG,actorId:CRM_USER,reportId:'alias-report',authority:{...saved.context.authority,actorId:CRM_USER},dependencies:saved.context.dependencies,input}),crm=crmFixture();
  crm.tables.os_previews=[{org_id:CRM_ORG,id:'alias-preview',actor_id:CRM_USER,kind:RECURRENCE_PACKET_KIND,payload:preview,checksum:hash(preview),base_revision:preview.dependenciesSha256,created_at:CRM_NOW,expires_at:'2026-11-08T12:30:00.123456Z',committed_at:null}];const original=JSON.stringify(crm.tables.os_previews),changes={};
  crm.pageMutation=(table,output)=>table==='os_previews'?output.map(x=>{const r=JSON.parse(x.row_json);return{...x,preview_created_exact:r.created_at,preview_expires_exact:r.expires_at,preview_committed_exact:r.committed_at,...changes};}):output;
  const before=await crm.read();
  for(const [field,value]of [['preview_created_exact','2026-11-08T12:00:00.123457Z'],['preview_expires_exact','2026-11-08T12:30:00.123457Z']]){changes[field]=value;assert.notEqual((await crm.read()).contextSha256,before.contextSha256);assert.equal(JSON.stringify(crm.tables.os_previews),original);delete changes[field];}
  changes.preview_committed_exact='2026-11-08T12:01:00.123456Z';await assert.rejects(()=>crm.read());assert.equal(JSON.stringify(crm.tables.os_previews),original);
});
test('ordinary CRM-purpose preview row digest remains independent of added recurrence-only SQL aliases',async()=>{
  const {makeContactReconciliationPreview,CONTACT_PREVIEW_KIND}=await import('../lib/contact-reconciliation-preview.mjs'),crm=crmFixture(),before=await crm.read();
  const payload=makeContactReconciliationPreview({orgId:CRM_ORG,actorId:CRM_USER,reportId:'crm-future-report',authority:before.authority,reviewedContextSha256:before.contextSha256,rowStamps:before.rowStamps,input:{...before.plannerContext,decision:{operation:'merge',survivorId:'left',fields:{title:'left',email:'unknown',displayLabel:'unknown'},basis:'record-comparison',reason:'Fictional duplicate drafts'}}});
  crm.tables.os_previews=[{org_id:CRM_ORG,id:'ordinary-crm-preview',actor_id:CRM_USER,kind:CONTACT_PREVIEW_KIND,payload,checksum:hash(payload),base_revision:payload.reviewedContextSha256,created_at:CRM_NOW,expires_at:'2026-11-08T12:30:00.123456Z',committed_at:null}];const changes={};
  crm.pageMutation=(table,output)=>table==='os_previews'?output.map(x=>{const r=JSON.parse(x.row_json);return{...x,preview_created_exact:r.created_at,preview_expires_exact:r.expires_at,preview_committed_exact:r.committed_at,...changes};}):output;
  const pinned=await crm.read();Object.assign(changes,{preview_created_exact:'2026-11-08T12:00:00.123457Z',preview_expires_exact:'2026-11-08T12:30:00.123457Z',preview_committed_exact:'2026-11-08T12:01:00.123456Z'});assert.equal((await crm.read()).contextSha256,pinned.contextSha256);
});
