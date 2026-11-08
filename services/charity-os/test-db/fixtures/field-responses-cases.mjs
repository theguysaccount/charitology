// Canonical fourteen FIELD case definitions. Import creates no resources.
// Synthetic auth and controlled expiry; no real-human/provider or natural30m claim.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=v=>createHash('sha256').update(v).digest('hex');
const ORIGIN='https://os.example.invalid',SECRET='fictional-field-profile-secret-'.repeat(3);
const STAFF='fd_staff',AUTH='fd_authority',READER='fd_reader';
const SOURCE='fd_source',DEST='fd_destination',SECOND='fd_second',WITNESS='fd_witness';
const MAX=2*1024*1024,MAX_TOTAL=32*1024*1024;
const clone=v=>structuredClone(v),opaque=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
const slug=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(v);
const own=(v,k)=>{try{const d=Object.getOwnPropertyDescriptor(v,k);return d&&Object.hasOwn(d,'value')?d.value:undefined;}catch{return undefined;}};
function diagnostics(error){
 const out={frames:[]};
 for(const k of ['assertion','actual','expected','actualScalar','actualType','actualStatus','expectedStatus','actualCode','expectedCode']){
  const v=own(error,k);if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||slug(v))out[k]=v;
 }
 // No standard Error.stack getter: explicit fixed assertion IDs identify sites.
 return out;
}
export const FIELD_CASE_NAMES=Object.freeze([
 'FD01 fresh target/source/authority baseline',
 'FD02 original file inspect and selected preview',
 'FD03 actual atomic import and immutable report',
 'FD04 concurrent same command one commit',
 'FD05 post-COMMIT value suppression and exact Retry',
 'FD06 current/trash/history/two-connection dedup',
 'FD07 last-record/report/audit faults roll back',
 'FD08 actual handler backup and two native restore hops',
 'FD09 malformed reserved report refuses before persistence',
 'FD10 occupied FIELD destination and legacy-ID collision',
 'FD11 actual small-state composite/native/inactive accounting',
 'FD12 absent legacy packet retains old fields and archival behavior',
 'FD13 controlled expired row and fresh authority Replay',
 'FD14 settled case work and bounded side effects',
]);
export async function runFieldCases({db,owner,modules:M,sql,healthy,onCase,onArtifact,providerCalls,expectedServerVersionNum,expectedRuntimeRole}){
 assert.equal(expectedServerVersionNum,170011);assert.equal(expectedRuntimeRole,"os_test_app");
  const results=[],calls=[],sessions=new Map(),actors=new Map(),active=new Set();let serial=0,artifactBytes=0,denied=0,otherAuth=0;
 const key=()=>`field_command_${String(++serial).padStart(8,'0')}`;
 const track=p=>{active.add(p);void p.then(()=>active.delete(p),()=>active.delete(p));return p;};
 const read=(org,fn,user=STAFF)=>db.tx(user,org,fn,{readOnly:true,lock:true});
 const edit=(org,fn,user=STAFF)=>db.tx(user,org,fn,{lock:true});
 const artifact=async(name,v)=>{assert(/^[a-z0-9-]+\.json$/.test(name));const b=JSON.stringify(v);assert(Buffer.byteLength(b)<=MAX);artifactBytes+=Buffer.byteLength(b);assert(artifactBytes<=MAX_TOTAL);await onArtifact(name,v);return{file:name,bytes:Buffer.byteLength(b),sha256:sha(b)};};
 const one=async(c,text,args=[])=>{const rows=(await c.query(text,args)).rows;assert.equal(rows.length,1);return rows[0];};
 const deny=()=>{denied++;throw Error('FIELD_PROVIDER_REFUSED');};
 const auth={api:{async getSession({headers}){const id=headers.get('x-fixture-user');assert(sessions.has(id));return sessions.get(id);},async signInMagicLink(){otherAuth++;throw Error('FIELD_AUTH_FLOW_REFUSED');}},async handler(){otherAuth++;throw Error('FIELD_AUTH_FLOW_REFUSED');}};
 const handle=M.handler.createHandler({settings:{origin:ORIGIN,secret:SECRET,relaySecret:null},db,auth,send:deny,participationTransport:deny});
 const path=(org,tail)=>`/api/orgs/${org}/${tail}`;
 async function api(org,tail,{body,method=body===undefined?'GET':'POST',user=actors.get(org)??STAFF,status=200,code}={}){
  healthy();assert(opaque(org));assert(/^[A-Za-z0-9_/-]+$/.test(tail));const session=sessions.get(user);assert(session);
  const raw=body===undefined?null:JSON.stringify(body);assert(raw===null||Buffer.byteLength(raw)<=MAX);
  const request=new Request(ORIGIN+path(org,tail),{method,headers:{'x-fixture-user':user,...(method==='GET'?{}:{origin:ORIGIN,'x-csrf-token':M.security.csrf(session.session.id,SECRET),'content-type':'application/json'})},...(raw===null?{}:{body:raw})});
  const response=await track(handle(request)),text=await response.text();assert(Buffer.byteLength(text)<=MAX);const value=JSON.parse(text);
  calls.push({org,user,tail,method,status:response.status,expectedStatus:status,code:slug(value.code)?value.code:null,expectedCode:code??null,bodyBytes:raw===null?0:Buffer.byteLength(raw),bodySha256:raw===null?null:sha(raw),keySha256:typeof body?.commandKey==='string'?sha(body.commandKey):null});
  try{assert.equal(response.status,status);if(code!==undefined)assert.equal(value.code,code);}catch(e){e.actualStatus=response.status;e.expectedStatus=status;if(slug(value.code))e.actualCode=value.code;if(slug(code))e.expectedCode=code;throw e;}
  healthy();return{value,text,headers:{contentType:response.headers.get('content-type'),contentDisposition:response.headers.get('content-disposition')}};
 }
 const accepted=v=>{assert.deepEqual(Object.keys(v).sort(),['ok','imported','recordIds','replayed','reportId'].sort());assert.equal(v.ok,true);assert.equal(typeof v.replayed,'boolean');assert(Number.isSafeInteger(v.imported)&&v.imported>=1);assert(opaque(v.reportId));assert(Array.isArray(v.recordIds)&&v.recordIds.every(opaque));return{imported:v.imported,reportId:v.reportId,recordIds:v.recordIds};};
 const snapshot=org=>read(org,async c=>{
  const tables={};for(const table of sql.snapshotTables){const rows=(await c.query(sql.snapshotSql[table],[org])).rows;assert(rows.length<=2000);tables[table]=rows.map(r=>r.body);}
  const b=JSON.stringify(tables);assert(Buffer.byteLength(b)<=MAX);return{sha256:sha(b),counts:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length])),tables,scope:'Constrained STAFF-visible application rows. Separate session/rate-limit witnesses; no hidden-org inventory claim.'};
 });
 const record=(org,id)=>read(org,async c=>one(c,'SELECT * FROM os_records WHERE org_id=$1 AND id=$2',[org,id]));
 async function put(org,id,moduleId,data,{source=null,status}={}){
  return edit(org,async c=>{const records=await M.database.allRecords(c,org),current=records.find(r=>r.id===id),r={id,orgId:org,moduleId,data,status:status??M.modules.getModule(moduleId).workflow.initial,ownerId:STAFF,lastEditedBy:STAFF,revision:(current?.revision??0)+1,approval:null,snapshot:null,source};
   r.data=M.modules.validateRecord(moduleId,data,{orgId:org,recordId:id,status:r.status,records:[...records.filter(r=>r.id!==id),r]});await M.database.saveRecord(c,r);await M.database.audit(c,org,STAFF,current?'record.updated':'record.created',r,{fictional:true});return r;});
 }
 async function tenant(org,{actor,definitions=true}={}){
  actor??='fd_actor_'+org;assert(opaque(actor));actors.set(org,actor);
  if(!sessions.has(actor)){await owner.query('INSERT INTO "user"(id,email,"emailVerified") VALUES($1,$2,true)',[actor,actor+'@example.invalid']);const sid='session_'+actor;await owner.query('INSERT INTO "session"(id,"userId","expiresAt") VALUES($1,$2,clock_timestamp()+interval \'48 hours\')',[sid,actor]);sessions.set(actor,{session:{id:sid},user:{id:actor,email:actor+'@example.invalid',emailVerified:true}});}
  await edit(org,async c=>{await c.query("INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional FIELD local software fixture',$1,'USD','UTC')",[org]);await c.query("INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'admin')",[org,STAFF]);if(actor!==STAFF)await c.query("INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'admin')",[org,actor]);await M.database.audit(c,org,STAFF,'organization.created');});
  if(!definitions)return{org,actor};
  await put(org,'program','programs',{title:'Fictional aggregate program',kind:'program'});
  await put(org,'indicator','outcomes',{title:'Fictional visits indicator',kind:'indicator',programId:'program',unit:'visits'});
  const connection=(await api(org,'integrations',{body:{provider:'csv',name:'Fictional local aggregate CSV metadata',moduleId:'outcomes',fieldMap:{}}})).value.integration;
  assert.equal(connection.status,'unconfigured');assert.equal(connection.credentialsConfigured,false);
  return{org,actor,integrationId:connection.id};
 }
 function file(prefix='row'){
  const row=(responseId,patch={})=>({responseId,startDate:'2026-01-01',endDate:'2026-01-31',geography:null,visitCount:0,denominator:null,excluded:false,exclusionReason:null,...patch});
  return Buffer.from(JSON.stringify({format:'charitology-aggregate-service-visits',version:1,formId:'aggregate-service-visits-v1',schemaVersion:1,responses:[row(prefix+'_zero'),row(prefix+'_unknown',{visitCount:null,geography:'Fictional aggregate 🌱'}),row(prefix+'_excluded',{excluded:true,exclusionReason:'Fictional excluded test row'}),row(prefix+'_unselected',{visitCount:7})]}));
 }
 function basic(f,bytes){return{fileBase64:bytes.toString('base64'),programId:'program',indicatorId:'indicator',integrationId:f.integrationId,privacyAcknowledged:true};}
 async function reviewed(f,bytes=file(),{user=f.actor,prefix='row'}={}){
  const input=basic(f,bytes),inspected=(await api(f.org,'field-responses/inspect',{body:input,user})).value;
  const selection={responseIds:[prefix+'_zero',prefix+'_unknown',prefix+'_excluded']};
  const preview=(await api(f.org,'field-responses/preview',{body:{...input,mappingSha256:inspected.mapping.sha256,selection},user})).value;
  assert.equal(preview.records.length,2);assert.equal(preview.manifest.rows.length,3);assert.equal(preview.manifest.summary.unselectedRows,1);
  return{fixture:f,bytes,input,inspected,preview,body:{previewId:preview.previewId,commandKey:key()},user};
 }
 const commit=(p,options={})=>api(p.fixture.org,'field-responses/commit',{body:p.body,user:p.user,...options});
 const retainedReports=org=>read(org,c=>c.query(sql.fieldReports,[org]).then(r=>r.rows));
 async function sourceExport(org,name){const response=await api(org,'export');assert.match(response.headers.contentType,/application\/json/);M.backup.validateBackup(response.value,org,STAFF);await artifact(name,{decodedBody:response.text,sha256:sha(response.text),headers:response.headers});return response.value;}
 async function restore(org,backup){const p=(await api(org,'import/preview',{body:{backup}})).value;assert.deepEqual(p.issues,[]);const result=(await api(org,'import/commit',{body:{previewId:p.previewId}})).value;return{preview:p,result};}
 const run=async(number,fn)=>{healthy();let result;try{result={number,name:FIELD_CASE_NAMES[number-1],status:'PASS',detail:await fn()};}catch(error){result={number,name:FIELD_CASE_NAMES[number-1],status:'FAIL',code:slug(own(error,'code'))?own(error,'code'):'UNCLASSIFIED',diagnostic:diagnostics(error),lastCalls:calls.slice(-8)};results.push(result);await onCase(result);try{error.fieldCaseWorkSettled=active.size===0;}catch{}throw error;}results.push(result);await onCase(result);healthy();};
 let source,sourceReview,sourceAccepted,sourceManifest,sourceReports,sourcePacket,d1Packet,d2Packet,legacyPreview;
 const fresh={};

 await run(1,async()=>{
  for(const user of [STAFF,AUTH,READER]){await owner.query('INSERT INTO "user"(id,email,"emailVerified") VALUES($1,$2,true)',[user,user+'@example.invalid']);const sid='session_'+user;await owner.query('INSERT INTO "session"(id,"userId","expiresAt") VALUES($1,$2,clock_timestamp()+interval \'48 hours\')',[sid,user]);sessions.set(user,{session:{id:sid},user:{id:user,email:user+'@example.invalid',emailVerified:true}});}
  source=await tenant(SOURCE);await tenant(DEST,{definitions:false});await tenant(SECOND,{definitions:false});await tenant(WITNESS,{definitions:false});
  await owner.query("INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'board_reader')",[SOURCE,READER]);
  const sourceIdentity=await read(SOURCE,c=>one(c,sql.runtimeIdentity));assert.equal(sourceIdentity.version_num,expectedServerVersionNum);assert.equal(sourceIdentity.memberships,0);for(const k of ['rolsuper','rolbypassrls','rolcreatedb','rolcreaterole','rolinherit','rolreplication'])assert.equal(sourceIdentity[k],false);
  const baseline=await snapshot(SOURCE),witness=await snapshot(WITNESS);await artifact('source-initial.json',baseline);await artifact('witness-initial.json',witness);fresh.witness=witness;
  return{sourceIdentity,sourceBaseline:baseline.sha256,witness:witness.sha256,syntheticAuth:true,realHumanConsent:false};
 });
 await run(2,async()=>{
  const context=(await api(SOURCE,'field-responses/context')).value;assert(context.programs.some(r=>r.id==='program'));assert(context.indicators.some(r=>r.id==='indicator'));assert(context.integrations.some(r=>r.id===source.integrationId));
  await api(SOURCE,'field-responses/context',{user:READER,status:403,code:'field_role'});
  sourceReview=await reviewed(source);sourceManifest=sourceReview.preview.manifest;
  assert.equal(sourceReview.inspected.rows[0].visitCount,0);assert.equal(sourceReview.inspected.rows[1].visitCount,null);assert.equal(sourceManifest.rows[2].row.exclusionReason,'Fictional excluded test row');
  assert(!JSON.stringify(sourceManifest).includes('row_unselected'));assert(!Object.hasOwn(sourceManifest,'accepted'));assert(!Object.hasOwn(sourceManifest,'fileBase64'));
  const before=await snapshot(SOURCE);assert.equal(before.counts.os_reports,0);assert.equal(sourceReview.preview.records.every(r=>r.status==='draft'&&r.approval===null),true);
  await artifact('selected-preview.json',{fileSha256:sha(sourceReview.bytes),mappingSha256:sourceReview.inspected.mapping.sha256,preview:sourceReview.preview});return{selected:3,createdCandidates:2,unselected:1,previewId:sourceReview.preview.previewId};
 });
 await run(3,async()=>{
  const response=(await commit(sourceReview)).value;sourceAccepted=accepted(response);assert.equal(response.replayed,false);assert.equal(response.imported,2);
  sourceReports=await retainedReports(SOURCE);assert.equal(sourceReports.length,1);const r=sourceReports[0];sourceManifest=r.payload;assert.equal(r.id,response.reportId);assert.equal(r.checksum,r.payload.sha256);assert.equal(r.title,'Aggregate visits import: '+r.payload.file.sha256.slice(0,12));assert.deepEqual(r.payload,sourceReview.preview.manifest);
  for(const id of response.recordIds){const row=await record(SOURCE,id);assert.equal(row.status,'draft');assert.equal(row.revision,1);assert.equal(row.approval,null);assert.equal(row.snapshot,null);assert.equal(row.source.integrationId,source.integrationId);assert.match(row.source.externalId,/^aggregate-service-visits-v1:row_/);}
  const receipt=await read(SOURCE,c=>one(c,sql.previewRow,[SOURCE,sourceReview.preview.previewId]));assert.equal(receipt.committed,true);assert.deepEqual(receipt.payload.accepted.result,sourceAccepted);
  await artifact('source-accepted-and-report.json',{accepted:sourceAccepted,reports:sourceReports,receipt});return{accepted:sourceAccepted,records:2,reports:1,committedPreview:true,after:await snapshot(SOURCE)};
 });
 await run(4,async()=>{
  const f=await tenant('fd_concurrent'),p=await reviewed(f,file('concurrent'),{prefix:'concurrent'}),before=await snapshot(f.org);
  const pair=await Promise.allSettled([commit(p),commit(p)]);assert(pair.every(r=>r.status==='fulfilled'));const [a,b]=pair.map(r=>r.value);assert.deepEqual(accepted(a.value),accepted(b.value));assert.equal([a.value,b.value].filter(r=>r.replayed===false).length,1);
  const after=await snapshot(f.org);assert.equal(after.counts.os_records-before.counts.os_records,2);assert.equal(after.counts.os_reports-before.counts.os_reports,1);
  const count=await read(f.org,c=>one(c,sql.fieldAcceptedCount,[f.org]));assert.equal(count.count,1);return{sameAccepted:accepted(a.value),replayed:[a.value.replayed,b.value.replayed],before:before.sha256,after:after.sha256,oneReceipt:count.count};
 });
 await run(5,async()=>{
  // The original FD03 handler already resolved COMMIT; withholding that value
  // from a fictitious caller never asserts a socket failure/unknown COMMIT.
  const before=await snapshot(SOURCE),a=(await commit(sourceReview)).value,b=(await commit(sourceReview)).value;assert.deepEqual(accepted(a),sourceAccepted);assert.deepEqual(accepted(b),sourceAccepted);assert(a.replayed&&b.replayed);assert.deepEqual(await snapshot(SOURCE),before);
  const other=await reviewed(source,file('other'),{prefix:'other'});await api(SOURCE,'field-responses/commit',{body:{...sourceReview.body,previewId:other.preview.previewId},status:409,code:'field_command_conflict'});
  const rows=calls.filter(c=>c.org===SOURCE&&c.tail==='field-responses/commit'&&c.bodySha256===sha(JSON.stringify(sourceReview.body)));assert(rows.length>=3);assert.equal(new Set(rows.map(r=>r.bodySha256)).size,1);assert.equal(new Set(rows.map(r=>r.keySha256)).size,1);
  return{accepted:sourceAccepted,exactBodySha256:rows[0].bodySha256,keySha256:rows[0].keySha256,manualAttempts:rows.length,afterCommitValueSuppressionOnly:true,automaticResend:false};
 });
 await run(6,async()=>{
  let r=(await api(SOURCE,'field-responses/inspect',{body:sourceReview.input})).value;assert.equal(r.summary.alreadyRecordedRows,3);
  const old=await record(SOURCE,sourceAccepted.recordIds[0]);await put(SOURCE,old.id,'outcomes',{...old.data,title:'Fictional later edit retained'},{source:old.source});
  await api(SOURCE,'modules/outcomes/records/'+old.id,{method:'DELETE',body:{revision:old.revision+1}});r=(await api(SOURCE,'field-responses/inspect',{body:sourceReview.input})).value;assert.equal(r.summary.alreadyRecordedRows,3);
  const connection=(await api(SOURCE,'integrations',{body:{provider:'csv',name:'Second fictional independent CSV',moduleId:'outcomes',fieldMap:{}}})).value.integration;
  const separate={...source,integrationId:connection.id},different=await reviewed(separate);const answer=(await commit(different)).value;assert.equal(answer.imported,2);assert.notEqual(answer.reportId,sourceAccepted.reportId);
  const f=await tenant('fd_wrongmodule'),raw=file('wrong'),inspected=(await api(f.org,'field-responses/inspect',{body:basic(f,raw)})).value;
  await put(f.org,'wrong_module_source','projects',{title:'Fictional wrong-module source conflict'},{source:{integrationId:f.integrationId,externalId:'aggregate-service-visits-v1:wrong_zero',checksum:inspected.rows[0].canonicalSha256}});
  const conflict=(await api(f.org,'field-responses/inspect',{body:basic(f,raw)})).value;assert.equal(conflict.rows[0].disposition,'conflict');
  return{currentAndTrashAlreadyRecorded:true,twoCsvConnectionsIndependent:true,wrongModuleSourceConflicts:true,secondReportId:answer.reportId};
 });
 await run(7,async()=>{
  const faultResults=[];
  for(const [label,table]of [['last-record','os_records'],['report','os_reports'],['audit','os_events']]){
   const f=await tenant('fd_fault_'+label.replaceAll('-','_')),p=await reviewed(f,file(label.replaceAll('-','_')),{prefix:label.replaceAll('-','_')}),before=await snapshot(f.org),role=await read(f.org,c=>one(c,'SELECT current_user AS role'));
   assert.equal(role.role,expectedRuntimeRole);const target=table==='os_records'?p.preview.records.at(-1).id:p.preview.manifest.sha256;assert(opaque(f.org)&&/^[a-f0-9]{32}$|^[a-f0-9]{64}$/.test(target));
   await owner.query(sql.createFaultSequence);await owner.query(sql.grantFaultSequence.replace('__RUNTIME__','"'+role.role+'"'));await owner.query(sql.createFaultFunction);
   const name='fd_fault_'+label.replaceAll('-','_');const predicate=table==='os_records'?target:table==='os_reports'?p.preview.manifest.sha256:'field-response.imported';
   assert(/^[a-z_-]+$/.test(name)&&/^[a-z0-9._-]+$/.test(predicate));
   await owner.query(`CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION os_field_fault_guard('${f.org}','${predicate}')`);
   await commit(p,{status:500,code:'internal'});const sequence=await one(owner,sql.faultSequenceValue);assert.equal(sequence.calls,1);assert.deepEqual(await snapshot(f.org),before);
   await owner.query(`DROP TRIGGER ${name} ON ${table}`);await owner.query('DROP FUNCTION os_field_fault_guard()');await owner.query('DROP SEQUENCE os_field_fault_seq');
   faultResults.push({point:label,reached:1,beforeSha256:before.sha256,completeBusinessRollback:true});
  }return{faults:faultResults,rawControllerMethodsUnchanged:true};
 });
 await run(8,async()=>{
  // Use the complete current source; its unrelated uncommitted preview is not
  // ordinary native state or restored accepted-command authority.
  sourcePacket=await sourceExport(SOURCE,'source-native.json');const expected=sourcePacket.reports.filter(r=>r.payload?.format==='charitology-field-response-import');assert.equal(expected.length,2);
  const first=await restore(DEST,sourcePacket);assert.equal(first.preview.summary.fieldResponseReportsRecovered,2);assert(first.preview.warnings.some(w=>w.field==='reports'));
  const originalArchive=await api(DEST,'backups/imports/'+first.preview.previewId);assert.deepEqual(originalArchive.value,sourcePacket);await artifact('original-source-archive.json',{decodedBody:originalArchive.text,sha256:sha(originalArchive.text)});
  d1Packet=await sourceExport(DEST,'first-restored-native.json');const second=await restore(SECOND,d1Packet);assert.equal(second.preview.summary.fieldResponseReportsRecovered,2);d2Packet=await sourceExport(SECOND,'second-restored-native.json');
  for(const org of[DEST,SECOND]){
   const reports=await retainedReports(org);assert.equal(reports.length,2);
   for(const original of expected){const retained=reports.find(r=>r.id===original.id);assert(retained);for(const k of['id','title','checksum','payload'])assert.deepEqual(retained[k],original[k]);assert.equal(retained.org_id,org);assert.equal(retained.created_by,actors.get(org));assert.match(retained.created_at,/\.\d{6}Z$/);assert.equal(retained.payload.originOrgId,SOURCE);}
   const connections=await read(org,c=>c.query(sql.connections,[org]).then(r=>r.rows));assert(connections.every(c=>c.status==='unconfigured'&&!c.has_credentials));
   const rows=await read(org,c=>M.database.allRecords(c,org));assert(rows.every(r=>r.approval===null&&r.snapshot===null));assert(rows.filter(r=>r.moduleId==='outcomes').every(r=>r.status==='draft'));
   assert.equal((await read(org,c=>one(c,sql.fieldAcceptedCount,[org]))).count,0);
  }
  const envelope=p=>p.reports.filter(r=>r.payload?.format==='charitology-field-response-import').map(r=>({id:r.id,title:r.title,checksum:r.checksum,payload:r.payload})).sort((a,b)=>a.id.localeCompare(b.id));assert.deepEqual(envelope(d1Packet),envelope(sourcePacket));assert.deepEqual(envelope(d2Packet),envelope(sourcePacket));
  const restoredIntegration=d1Packet.integrations.find(i=>i.id===source.integrationId);const historicalInspect=(await api(DEST,'field-responses/inspect',{body:{...sourceReview.input,integrationId:restoredIntegration.id}})).value;assert.equal(historicalInspect.summary.conflictRows,3);
  return{reportsPerHop:2,receiptCountPerDestination:0,payloadIdentityChecksumOriginExact:true,credentialsUnconfigured:true,unapprovedRecords:true,wholeWrapperByteEqualityClaimed:false,sourceArchivePreview:first.preview.previewId};
 });
 await run(9,async()=>{
  const f=await tenant('fd_malformed',{definitions:false}),before=await snapshot(f.org),refusals=[];
  for(const [kind,code,change]of [['version','field_report_row',r=>r.payload.version=2],['method','field_report_row',r=>r.payload.method='unsupported'],['checksum','field_report_row',r=>r.checksum='f'.repeat(64)],['title','field_report_row',r=>r.title='invalid']]){
   const backup=clone(sourcePacket);change(backup.reports.find(r=>r.payload?.format==='charitology-field-response-import'));const{checksum,...body}=backup;backup.checksum=M.security.hash(body);
   await api(f.org,'import/preview',{body:{backup},status:422,code});assert.deepEqual(await snapshot(f.org),before);refusals.push({kind,status:422,code});
  }return{refusals,before:before.sha256,noCommittedOrPendingArchive:true};
 });
 await run(10,async()=>{
  const legacy=M.backup.makeBackup({name:'Fictional legacy',currency:'USD',time_zone:'UTC'},[]),occupiedBefore=await snapshot(DEST);
  const rejected=(await api(DEST,'import/preview',{body:{backup:legacy}})).value;assert(rejected.issues.length>0);assert.equal(rejected.summary.accepted,0);
  await api(DEST,'import/commit',{body:{previewId:rejected.previewId},status:409,code:'restore_conflict'});const occupiedAfter=await snapshot(DEST);assert.equal(occupiedAfter.counts.os_records,occupiedBefore.counts.os_records);assert.equal(occupiedAfter.counts.os_reports,occupiedBefore.counts.os_reports);
  const f=await tenant('fd_collision',{definitions:false}),id=sourcePacket.reports[0].id;
  await edit(f.org,c=>c.query("INSERT INTO os_reports(org_id,id,created_by,title,checksum,payload) VALUES($1,$2,$3,'Fictional legacy collision',$4,'{\"legacy\":true}')",[f.org,id,STAFF,'0'.repeat(64)]));
  await api(f.org,'import/preview',{body:{backup:sourcePacket},status:409,code:'restore_conflict'});return{occupiedHistoryRefuses:true,legacyIdCollisionRefuses:true};
 });
 await run(11,async()=>{
  const measures=[];
  for(const org of[SOURCE,DEST,SECOND]){
   const value=await read(org,async c=>{const reports=(await c.query(sql.reportComposite,[org])).rows;const usage=await M.database.logicalBackupBytes(c,org),native=await M.workspace.assembleWorkspaceBackup(c,org),whole=await M.workspace.checkWorkspaceExportCapacity(c,org);return{org,reports,usage,nativeBytes:Buffer.byteLength(JSON.stringify(native)),whole};});
   // Artifact keys obey both existing hyphen-only filename guards.
   const artifactKey=org.replaceAll('_','-');
   // Capture actual SQL/projection values before ANY FD11 predicate.
   await artifact('capacity-'+artifactKey+'.json',value);
   await artifact('capacity-scalars-'+artifactKey+'.json',{org,usage:value.usage,usageType:typeof value.usage,nativeBytes:value.nativeBytes,nativeBytesType:typeof value.nativeBytes,reportCategoryCount:value.whole.restore.categories.os_reports.count,reportCategoryCountType:typeof value.whole.restore.categories.os_reports.count,reportBytes:value.reports.map(r=>({id:r.id,bytes:r.bytes,bytesType:typeof r.bytes}))});
   const named=(assertion,actual,expected,actualScalar)=>{try{assert.equal(actual,expected);}catch(error){Object.defineProperties(error,{assertion:{value:assertion,enumerable:true},actualScalar:{value:actualScalar,enumerable:true},actualType:{value:typeof actualScalar,enumerable:true}});throw error;}};
   named('FD11_USAGE_WITHIN_60MIB',value.usage<=60*1024*1024,true,value.usage);
   named('FD11_NATIVE_WITHIN_64MIB',value.nativeBytes<=64*1024*1024,true,value.nativeBytes);
   named('FD11_REPORT_CATEGORY_AT_LEAST_TWO',value.whole.restore.categories.os_reports.count>=2,true,value.whole.restore.categories.os_reports.count);
   for(const r of value.reports){named('FD11_REPORT_BYTE_SAFE_INTEGER',Number.isSafeInteger(r.bytes),true,r.bytes);named('FD11_REPORT_BYTE_POSITIVE',r.bytes>0,true,r.bytes);}
   measures.push({org,usage:value.usage,nativeBytes:value.nativeBytes,reportCount:value.reports.length,reportBytes:value.reports.reduce((n,r)=>n+r.bytes,0),inactiveReportCategory:value.whole.restore.categories.os_reports});
  }
  const r=await record(SOURCE,sourceAccepted.recordIds[1]);await put(SOURCE,r.id,'outcomes',{...r.data,title:'Fictional FIELD-only later ordinary edit'},{source:r.source});
  return{measures,actualFieldOnlyOrdinaryEditCommitted:true,mixedLiveGroupOrCheckInGraphClaimed:false,nativeOrRetainedMaximumAttainment:false};
 });
 await run(12,async()=>{
  const f=await tenant('fd_legacy',{definitions:false}),backup=M.backup.makeBackup({name:'Fictional old packet',currency:'USD',time_zone:'UTC'},[],{reports:[{id:'legacy_report',payload:{historical:'archived'}}]});
  legacyPreview=(await api(f.org,'import/preview',{body:{backup}})).value;assert(!Object.hasOwn(legacyPreview.summary,'fieldResponseReportsRecovered'));assert(!legacyPreview.warnings.some(w=>w.field==='reports'));
  await api(f.org,'import/commit',{body:{previewId:legacyPreview.previewId}});assert.deepEqual((await api(f.org,'backups/imports/'+legacyPreview.previewId)).value,backup);const last=await read(f.org,c=>one(c,sql.lastRestoreAudit,[f.org]));assert(!Object.hasOwn(last.detail,'fieldResponseReportsRecovered'));assert.equal((await retainedReports(f.org)).length,0);
  const measured=await read(f.org,c=>M.learning.measureLearningRestoreCapacity(c,backup));assert(!Object.hasOwn(measured.categories,'os_reports'));return{legacyArchiveRetained:true,newCounterAbsent:true,newCategoryAbsent:true,noFieldReportInserted:true,measurement:measured};
 });
 await run(13,async()=>{
  const expiry=await owner.query(sql.expireAccepted,[SOURCE,sourceReview.preview.previewId,sourceReview.user]);assert.equal(expiry.rowCount,1);const witness=await one(owner,sql.expiryWitness,[SOURCE,sourceReview.preview.previewId]);assert.equal(witness.expired,true);assert.match(witness.now_exact,/\.\d{6}Z$/);
  const p=await record(SOURCE,'program');await put(SOURCE,'program','programs',{...p.data,title:'Fictional changed definition after acceptance'});
  const conn=await read(SOURCE,c=>one(c,'SELECT revision FROM os_integrations WHERE org_id=$1 AND id=$2',[SOURCE,source.integrationId]));await api(SOURCE,'integrations/'+source.integrationId,{method:'PATCH',body:{revision:conn.revision,name:'Fictional changed CSV metadata',clearCredentials:true}});
  const before=await snapshot(SOURCE),response=(await commit(sourceReview)).value;assert.deepEqual(accepted(response),sourceAccepted);assert(response.replayed);assert.deepEqual(await snapshot(SOURCE),before);
  const refusals=[];
  for(const kind of ['membership','scope','restore']){
   const f=await tenant('fd_authority_'+kind,{actor:AUTH}),p=await reviewed(f,file(kind),{user:AUTH,prefix:kind});await commit(p);
   if(kind==='membership')await owner.query('DELETE FROM os_members WHERE org_id=$1 AND user_id=$2',[f.org,AUTH]);
   if(kind==='scope')await owner.query("UPDATE os_members SET program_ids='[\"unrelated_program\"]',revision=revision+1 WHERE org_id=$1 AND user_id=$2",[f.org,AUTH]);
   if(kind==='restore')await owner.query("INSERT INTO os_events(org_id,actor_id,action,detail) VALUES($1,$2,'backup.restored','{\"fictionalRestoreEpochStimulus\":true}')",[f.org,STAFF]);
   const expect=kind==='membership'?{status:403,code:'membership'}:{status:409,code:'field_stale'};await commit(p,expect);refusals.push({kind,...expect});
  }
  const f=await tenant('fd_authority_session',{actor:AUTH}),p2=await reviewed(f,file('session'),{user:AUTH,prefix:'session'});await commit(p2);await owner.query('UPDATE "session" SET "expiresAt"=clock_timestamp()-interval \'1 second\' WHERE id=$1 AND "userId"=$2',['session_'+AUTH,AUTH]);await commit(p2,{status:401,code:'session'});refusals.push({kind:'session',status:401,code:'session'});
  await artifact('expired-accepted-replay.json',{witness,accepted:sourceAccepted,refusals,expiryControlledFixtureSql:true,naturalThirtyMinuteElapsed:false});return{witness,accepted:sourceAccepted,refusals,expiredRowSeamNotNaturalWaiting:true};
 });
 await run(14,async()=>{
  const rateCounts={};for(const call of calls){if(!call.tail.startsWith('field-responses/'))continue;const n=rateCounts[call.user]??={inspect:0,write:0,read:0};if(call.method==='GET')n.read++;else n.write++;if(call.tail==='field-responses/inspect')n.inspect++;}assert(Object.values(rateCounts).every(n=>n.inspect<=6&&n.write<=60&&n.read<=120));
  assert.equal(active.size,0);assert.equal(denied,0);assert.equal(otherAuth,0);assert.equal(providerCalls(),0);assert.deepEqual(await snapshot(WITNESS),fresh.witness);
  await artifact('finite-request-digests.json',{calls,bodiesAndKeysRetainedAsDigests:true,authSyntheticNotBetterAuth:true,rateLimitRowsOutsideBusinessSnapshots:true});
  return{requests:calls.length,rateCounts,activeWork:0,providerCalls:0,otherAuthCalls:0,witnessUnchanged:true,ownedTargetTeardownAndFreshAbsenceRequiredByController:true};
 });
 return{tests:14,pass:14,caseResults:results,caseWorkSettled:active.size===0,providerCalls:providerCalls(),requests:calls.length,artifactBytes,actualHandlerAndDatabaseFactory:true,syntheticAuthNotRealSignIn:true,expiredRowSqlSeamNotNaturalExpiry:true,mixedLiveGroupOrCheckInGraphClaimed:false};
}
