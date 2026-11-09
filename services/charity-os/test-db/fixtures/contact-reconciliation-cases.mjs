// Portable CRM business definitions. Import opens no driver, environment or resource.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import handoffCatalog from './volunteer-substitution-catalog-v1.json' with {type:'json'};
const sha=v=>createHash('sha256').update(v).digest('hex'),clone=v=>structuredClone(v);
const ORIGIN='https://os.example.invalid',SECRET='fictional-crm-fixture-only-secret-'.repeat(3);
const MAX=2*1024*1024,TOTAL=32*1024*1024;
const opaque=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
const slug=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(v);
const own=(v,k)=>{try{const d=Object.getOwnPropertyDescriptor(v,k);return d&&Object.hasOwn(d,'value')?d.value:undefined;}catch{return undefined;}};
function diagnosis(e){const out={};for(const k of ['assertion','actual','expected','actualStatus','expectedStatus','actualCode','expectedCode']){const v=own(e,k);if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||slug(v))out[k]=v;}return out;}
function equal(id,a,b){try{assert.deepEqual(a,b);}catch(e){e.assertion=id;throw e;}}
function truth(id,v){try{assert.equal(v,true);}catch(e){e.assertion=id;throw e;}}
export const CRM_CASE_NAMES=Object.freeze([
 "CRM01 actual catalog, identity, auth ACL and RLS baseline",
 "CRM02 explicit no-merge immutable history",
 "CRM03 merge after its own passive preview",
 "CRM04 concurrent same key and post-COMMIT suppression",
 "CRM05 expired accepted Replay with current authority",
 "CRM06 key/body collisions and stale pair",
 "CRM07 fresh authority and restoration epoch",
 "CRM08 genuine accepted-original inverse",
 "CRM09 inverse refuses later changes or history-only provenance",
 "CRM10 last record fault rolls back full command",
 "CRM11 report, required audit and compact receipt faults",
 "CRM12 final actual quota guard rolls back command",
 "CRM13 actual full native export and two restores",
 "CRM14 reserved namespace occupancy, ID collision and malformed report",
 "CRM15 old absence golden and actual small capacity vectors",
 "CRM16 final raw permission and side-effect readback"
]);
export async function runCrmCases({db,owner,modules:M,sql,healthy,onCase,onArtifact,providerCalls,trace,absentGolden,catalogVectors,resourceCatalogVectors,expectedServerVersionNum=180006}){
 assert(expectedServerVersionNum===180006||expectedServerVersionNum===170011);
 const results=[],calls=[],sessions=new Map(),actors=new Map(),active=new Set();let serial=0,artifactBytes=0,denied=0,otherAuth=0;
 const key=()=>`crm_command_${String(++serial).padStart(8,'0')}`;
 const track=p=>{active.add(p);void p.then(()=>active.delete(p),()=>active.delete(p));return p;};
 const userFor=org=>{const v=actors.get(org);assert(opaque(v));return v;};
 const read=(org,fn,user=userFor(org))=>db.tx(user,org,fn,{readOnly:true,lock:true});
 const edit=(org,fn,user=userFor(org))=>db.tx(user,org,fn,{lock:true});
 const one=async(c,text,args=[])=>{const r=(await c.query(text,args)).rows;assert.equal(r.length,1);return r[0];};
 const artifact=async(name,value)=>{assert(/^[a-z0-9-]+\.json$/.test(name));const b=JSON.stringify(value);assert(Buffer.byteLength(b)<=MAX);artifactBytes+=Buffer.byteLength(b);assert(artifactBytes<=TOTAL);await onArtifact(name,value);return{name,bytes:Buffer.byteLength(b),sha256:sha(b)};};
 const deny=()=>{denied++;throw Error('CRM_PROVIDER_REFUSED');};
 const auth={api:{async getSession({headers}){const id=headers.get('x-fixture-user');assert(sessions.has(id));return sessions.get(id);},async signInMagicLink(){otherAuth++;throw Error('CRM_REAL_AUTH_REFUSED');}},async handler(){otherAuth++;throw Error('CRM_REAL_AUTH_REFUSED');}};
 const handle=M.handler.createHandler({settings:{origin:ORIGIN,secret:SECRET,relaySecret:null},db,auth,send:deny,participationTransport:deny});
 async function api(org,tail,{body,method=body===undefined?'GET':'POST',user=userFor(org),status=200,code}={}){
  healthy();assert(opaque(org)&&/^[A-Za-z0-9_/-]+$/.test(tail));const session=sessions.get(user);assert(session);
  const raw=body===undefined?null:JSON.stringify(body);assert(raw===null||Buffer.byteLength(raw)<=MAX);
  const request=new Request(`${ORIGIN}/api/orgs/${org}/${tail}`,{method,headers:{'x-fixture-user':user,...(method==='GET'?{}:{origin:ORIGIN,'x-csrf-token':M.security.csrf(session.session.id,SECRET),'content-type':'application/json'})},...(raw===null?{}:{body:raw})});
  const response=await track(handle(request)),text=await response.text();assert(Buffer.byteLength(text)<=MAX);const value=JSON.parse(text);
  calls.push({org,user,tail,method,status:response.status,expectedStatus:status,code:slug(value.code)?value.code:null,expectedCode:code??null,bodyBytes:raw===null?0:Buffer.byteLength(raw),bodySha256:raw===null?null:sha(raw),keySha256:typeof body?.commandKey==='string'?sha(body.commandKey):null});
  try{assert.equal(response.status,status);if(code!==undefined)assert.equal(value.code,code);}catch(e){e.actualStatus=response.status;e.expectedStatus=status;if(slug(value.code))e.actualCode=value.code;if(slug(code))e.expectedCode=code;throw e;}
  healthy();return{value,text};
 }
 const accepted=v=>{equal('accepted-shape',Object.keys(v).sort(),['ok','operation','recordIds','replayed','reportId','reportSha256'].sort());truth('accepted-ok',v.ok);assert(['merge','no-merge','reverse'].includes(v.operation)&&opaque(v.reportId)&&/^[a-f0-9]{64}$/.test(v.reportSha256)&&typeof v.replayed==='boolean');assert(Array.isArray(v.recordIds)&&v.recordIds.every(opaque));return{operation:v.operation,recordIds:v.recordIds,reportId:v.reportId,reportSha256:v.reportSha256};};
 const snapshot=org=>read(org,async c=>{const tables={};for(const t of sql.snapshotTables){const rows=(await c.query(sql.snapshotSql[t],[org])).rows;assert(rows.length<=2000);tables[t]=rows.map(r=>r.body);}const b=JSON.stringify(tables);assert(Buffer.byteLength(b)<=MAX);return{sha256:sha(b),counts:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length])),tables,scope:'32 domain tables under actual fixture org and actor, excluding os_rate_limits bookkeeping; own-link rows absent in this fixture, not a hidden-own-link inventory proof.'};});
 const records=org=>read(org,c=>c.query(sql.exactRecords,[org]).then(r=>r.rows));
 const reports=org=>read(org,c=>c.query(sql.crmReports,[org]).then(r=>r.rows));
 const counts=org=>read(org,c=>one(c,sql.crmCounts,[org]));
 const inspect=async f=>(await api(f.org,'contact-reconciliation/inspect',{body:{leftId:f.left.id,rightId:f.right.id}})).value.context;
 const mergeDecision=f=>({operation:'merge',survivorId:f.left.id,fields:{title:'left',displayLabel:'unknown',email:'unknown'},basis:'record-comparison',reason:'Fictional local draft comparison'});
 const separateDecision=()=>({operation:'no-merge',assertion:'unresolved',basis:'record-comparison',reason:'Fictional uncertain comparison'});
 async function preview(f,decision=mergeDecision(f)){
  const context=await inspect(f),p=(await api(f.org,'contact-reconciliation/preview',{body:{leftId:f.left.id,rightId:f.right.id,contextSha256:context.contextSha256,decision}})).value;
  assert(opaque(p.previewId)&&p.processingTime==='assigned-on-commit');M.crmPreview.validateContactReconciliationPreview(p.review);
  return{f,context,preview:p,body:{previewId:p.previewId,commandKey:key()}};
 }
 const commit=(p,options={})=>api(p.f.org,'contact-reconciliation/commit',{body:p.body,...options});
 async function tenant(org,{pair=true}={}){
  assert(opaque(org));const actor='crm_actor_'+org;assert(opaque(actor));actors.set(org,actor);const sid='session_'+actor;
  await owner.query('INSERT INTO "user"(id,email,"emailVerified") VALUES($1,$2,true)',[actor,actor+'@example.invalid']);await owner.query('INSERT INTO "session"(id,"userId","expiresAt") VALUES($1,$2,clock_timestamp()+interval \'48 hours\')',[sid,actor]);sessions.set(actor,{session:{id:sid},user:{id:actor,email:actor+'@example.invalid',emailVerified:true}});
  await edit(org,async c=>{await c.query("INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional CRM local software fixture',$1,'USD','UTC')",[org]);await c.query("INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'owner')",[org,actor]);await M.database.audit(c,org,actor,'organization.created');});
  const f={org,actor};if(pair){
   const create=title=>api(org,'modules/contacts/records',{body:{data:{title,kind:'person-reference',contactPreference:'permission-needed',purpose:'Fictional coordination only'}}});
   f.left=(await create('Fictional left')).value.record;f.right=(await create('Fictional right')).value.record;assert(f.left.id!==f.right.id);
  }return f;
 }
 async function verifyAccepted(p,response){
  const a=accepted(response.value),rs=await reports(p.f.org);equal('one-report',rs.length,1);const r=rs[0];M.crmReport.validateContactReconciliationReportRow(r);
  equal('report-id',r.id,a.reportId);equal('report-sha',r.checksum,a.reportSha256);equal('report-title',r.title,M.crmReport.contactReconciliationReportTitle(r.payload));
  const receipt=await read(p.f.org,c=>one(c,'SELECT to_jsonb(t) AS row FROM os_previews t WHERE org_id=$1 AND id=$2',[p.f.org,p.body.previewId]));
  const parsed=M.crmPreview.validateContactReconciliationPreviewRow(receipt.row);equal('receipt-state',parsed.state,'committed');equal('receipt-result',parsed.payload.result,a);
  equal('one-accepted-counter',await counts(p.f.org),{reports:1,audits:1,receipts:1});return{a,r,receipt:receipt.row};
 }
 async function exportPacket(org,name){const r=await api(org,'export');M.backup.validateBackup(r.value,org,userFor(org));await artifact(name,{decodedBody:r.text,bodySha256:sha(r.text)});return r.value;}
 async function restore(org,backup){const p=(await api(org,'import/preview',{body:{backup}})).value;equal('restore-issues',p.issues,[]);const response=(await api(org,'import/commit',{body:{previewId:p.previewId}})).value;return{preview:p,response};}
 const quoted=v=>{assert(opaque(v));return "'"+v+"'";};
 const quotedAuditAction=v=>{assert.equal(v,'contact-reconciliation.recorded');return "'contact-reconciliation.recorded'";};
 const createTrigger=async(name,table,org,match,event)=>{assert(/^crm_[a-z_]+$/.test(name)&&['os_records','os_reports','os_events','os_previews'].includes(table)&&['UPDATE','INSERT'].includes(event));await owner.query(`CREATE TRIGGER ${name} BEFORE ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION os_crm_fault_guard(${quoted(org)},${table==='os_events'?quotedAuditAction(match):quoted(match)})`);};
 const dropTrigger=(name,table)=>{assert(/^crm_[a-z_]+$/.test(name)&&['os_records','os_reports','os_events','os_previews'].includes(table));return owner.query(`DROP TRIGGER ${name} ON ${table}`);};
 const faultCalls=()=>one(owner,sql.faultSequenceValue);
 async function fault(f,which){const p=await preview(f),before=await snapshot(f.org),prior=await faultCalls();const table={record:'os_records',report:'os_reports',audit:'os_events',receipt:'os_previews'}[which],match=which==='record'?f.right.id:which==='report'?p.preview.review.reportId:which==='audit'?'contact-reconciliation.recorded':p.body.previewId;
  await createTrigger('crm_failure',table,f.org,match,which==='record'||which==='receipt'?'UPDATE':'INSERT');
  try{await commit(p,{status:500,code:'internal'});equal('fault-state-exact',await snapshot(f.org),before);equal('fault-reached',(await faultCalls()).calls,prior.calls+1);}
  finally{await dropTrigger('crm_failure',table);}return{phase:which,beforeSha256:before.sha256,afterSha256:(await snapshot(f.org)).sha256,sequenceCalls:(await faultCalls()).calls};
 }
 const run=async(number,fn)=>{healthy();let r;try{r={number,name:CRM_CASE_NAMES[number-1],status:'PASS',detail:await fn()};}catch(e){r={number,name:CRM_CASE_NAMES[number-1],status:'FAIL',code:slug(own(e,'code'))?own(e,'code'):'UNCLASSIFIED',diagnostic:diagnosis(e),lastCalls:calls.slice(-8)};results.push(r);await onCase(r);try{e.crmCaseWorkSettled=active.size===0;}catch{}throw e;}results.push(r);await onCase(r);healthy();};
 let source,sourceReview,sourceAccepted,sourceReport,sourcePacket,replay;

 await run(1,async()=>{
  source=await tenant('crm_source');await tenant('crm_witness',{pair:false});
  const identity=await read(source.org,c=>one(c,sql.runtimeIdentity));equal('actual-server-version',identity.version_num,expectedServerVersionNum);equal('runtime-no-memberships',identity.memberships,0);for(const k of ['rolsuper','rolbypassrls','rolcreatedb','rolcreaterole','rolinherit','rolreplication'])equal('six-false-'+k,identity[k],false);
  const catalogResult=await owner.query(sql.catalogVector);
  await artifact('catalog-driver-raw-before-assertions.json',{fields:catalogResult.fields.map(({name,dataTypeID})=>({name,dataTypeID})),rows:catalogResult.rows,arrayFlags:catalogResult.rows.map(row=>({tableName:row.table_name,isArray:Array.isArray(row.columns),jsType:typeof row.columns}))});
  const catalog=catalogResult.rows;
  equal('source-catalog-independent-vector',M.crmCatalog.CONTACT_CONTEXT_CATALOG,catalogVectors);
  const resources=catalog.some(r=>r.table_name==='os_resource_reservations');
  const handoffs=catalog.some(r=>r.table_name==='os_participation_substitution_choices');
  if(resources)equal('resource-catalog-independent-vector',M.crmCatalog.CONTACT_RESOURCE_RESERVATION_CATALOG,resourceCatalogVectors);
  if(handoffs)equal('handoff-catalog-independent-vector',M.crmCatalog.CONTACT_SUBSTITUTION_CHOICE_CATALOG,handoffCatalog.os_participation_substitution_choices);
  const expected={...catalogVectors,...(resources?resourceCatalogVectors:{}),...(handoffs?handoffCatalog:{})};
  const columns=catalog.reduce((n,r)=>n+r.columns.length,0);
  equal('catalog-tables',catalog.length,33+(resources?2:0)+(handoffs?1:0));
  equal('catalog-columns',columns,355+(resources?18:0)+(handoffs?17:0));
  equal('catalog-exact-table-names',catalog.map(r=>r.table_name).sort(),Object.keys(expected).sort());
  for(const r of catalog)equal('catalog-vector-'+r.table_name,[...r.columns].sort(),[...expected[r.table_name]].sort());
  const context=await inspect(source);truth('actual-catalog-context',M.crmModel.planContactReconciliation({...context.plannerContext,decision:mergeDecision(source)}).proposal!==null);
  const free=await db.tx('', '',c=>one(c,sql.contextFree),{readOnly:true});equal('context-free-rows',free,{records:0,reports:0,previews:0});
  const cross=await read(source.org,c=>one(c,'SELECT count(*)::int AS n FROM os_records WHERE org_id=$1',['crm_witness']));equal('cross-org-rows',cross.n,0);
  await owner.query(sql.createFaultSequence);await owner.query(sql.grantFaultSequence.replace('__RUNTIME__','"'+identity.role+'"'));await owner.query(sql.createFaultFunction);
  await artifact('actual-catalog-identity.json',{identity,catalog,context,contextFree:free,crossOrg:cross});return{actualPg:identity.version_num,actualCatalogTables:catalog.length,actualCatalogColumns:columns,syntheticAuthNotBetterAuth:true,fixtureNativePressure:false};
 });
 await run(2,async()=>{
  const f=await tenant('crm_no_merge'),p=await preview(f,separateDecision()),before=await records(f.org),response=await commit(p),v=await verifyAccepted(p,response);
  equal('no-merge-op',v.a.operation,'no-merge');equal('no-merge-recordIds',v.a.recordIds,[]);equal('no-merge-records-unchanged',await records(f.org),before);equal('no-merge-history-changes',v.r.payload.changes,[]);
  await artifact('no-merge-accepted.json',v);return{accepted:v.a,recordsUnchanged:true};
 });
 await run(3,async()=>{
  sourceReview=await preview(source);const afterPreview=await inspect(source);assert.notEqual(afterPreview.contextSha256,sourceReview.context.contextSha256);equal('own-preview-plan-unchanged',afterPreview.plannerContext,sourceReview.context.plannerContext);
  const response=await commit(sourceReview),v=await verifyAccepted(sourceReview,response);sourceAccepted=v.a;sourceReport=v.r;
  const rows=await records(source.org),byId=new Map(rows.map(x=>[x.row.id,x]));
  for(const change of v.r.payload.changes){const r=byId.get(change.after.id);equal('exact-record-revision',r.row.revision,change.after.revision);equal('exact-record-data',r.row.data,change.after.data);equal('exact-SQL6-trash',r.deleted_exact,change.after.deletedAt);equal('preserved-owner',r.row.owner_id,source.actor);equal('unapproved',r.row.approval,null);equal('no-snapshot',r.row.snapshot,null);equal('local-source',r.row.source,null);}
  truth('actual-six-micro-trash',/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(byId.get(source.right.id).deleted_exact));
  const history=(await api(source.org,'contact-reconciliation/history')).value;equal('history-one',history.reports.length,1);const detail=(await api(source.org,'contact-reconciliation/history/'+v.a.reportId)).value;equal('history-exact-payload',detail.report.payload,v.r.payload);
  await artifact('merge-accepted-rows-history.json',{...v,rows,history,detail});return{accepted:v.a,ownPreviewPassive:true,sqlTrashExact:true};
 });
 await run(4,async()=>{
  const f=await tenant('crm_concurrent'),p=await preview(f),before=await counts(f.org),all=await Promise.allSettled([commit(p),commit(p)]);truth('both-concurrent-complete',all.every(r=>r.status==='fulfilled'));const a=all.map(r=>r.value);
  equal('same-concurrent-result',accepted(a[0].value),accepted(a[1].value));equal('one-concurrent-new',a.filter(r=>r.value.replayed===false).length,1);equal('one-concurrent-replay',a.filter(r=>r.value.replayed===true).length,1);equal('one-concurrent-mutation',await counts(f.org),{reports:before.reports+1,audits:before.audits+1,receipts:before.receipts+1});
  const lost=await preview(await tenant('crm_lost_response')),committed=await commit(lost),beforeRetry=await snapshot(lost.f.org); // Fixture suppresses this already completed value only.
  const retry=await commit(lost);equal('post-commit-retry-result',accepted(retry.value),accepted(committed.value));truth('post-commit-replay',retry.value.replayed);equal('post-commit-no-domain-write',await snapshot(lost.f.org),beforeRetry);
  const relevant=calls.filter(r=>r.org===lost.f.org&&r.tail.endsWith('/commit'));equal('same-body-hash',relevant[0].bodySha256,relevant[1].bodySha256);equal('same-key-hash',relevant[0].keySha256,relevant[1].keySha256);
  await artifact('concurrent-and-lost-result.json',{concurrent:a.map(r=>r.value),suppressedAfterCompletedCommit:true,retry:retry.value,requestDigests:relevant});return{oneConcurrentCommit:true,lostResponseScope:'fixture-suppressed-value-after-actual-COMMIT-not-socket'};
 });
 await run(5,async()=>{
  const f=await tenant('crm_replay');replay=await preview(f);const acceptedFirst=accepted((await commit(replay)).value);
  equal('expire-accepted-row',(await owner.query(sql.expireAccepted,[f.org,replay.body.previewId,f.actor])).rowCount,1);const witness=await one(owner,sql.expiryWitness,[f.org,replay.body.previewId]);truth('expired-real-row',witness.expired);truth('negative-expiry-ms',BigInt(witness.remaining_ms)<0n);
  const survivor=(await records(f.org)).find(r=>r.row.id===f.left.id).row;await api(f.org,'modules/contacts/records/'+f.left.id,{method:'PATCH',body:{revision:survivor.revision,data:{...survivor.data,title:'Fictional later ordinary edit'}}});
  const before=await snapshot(f.org),offset=trace.length,r=await commit(replay);equal('expired-replay-result',accepted(r.value),acceptedFirst);truth('expired-replayed',r.value.replayed);equal('expired-replay-no-domain-write',await snapshot(f.org),before);
  const commands=trace.slice(offset);equal('expired-replay-no-domain-clock',commands.filter(r=>r.kind==='CRM_COMMAND_CLOCK').length,0);equal('expired-replay-no-domain-DML',commands.filter(r=>['INSERT','UPDATE','DELETE'].includes(r.kind)&&!r.rateLimitBookkeeping).length,0);
  await artifact('controlled-expiry-replay.json',{witness,accepted:acceptedFirst,replay:r.value,trace:commands,expiredRowSqlSeamNotNaturalElapsedExpiry:true});return{expiredSqlRow:true,domainClockCalls:0,domainWrites:0};
 });
 await run(6,async()=>{
  const f=await tenant('crm_collision'),p=await preview(f);await commit(p);const before=await snapshot(f.org);
  await api(f.org,'contact-reconciliation/commit',{body:{...p.body,commandKey:key()},status:409,code:'contact_command_conflict'});
  await api(f.org,'contact-reconciliation/commit',{body:{...p.body,previewId:'different-preview'},status:409,code:'contact_command_conflict'});equal('collision-preserves-domain',await snapshot(f.org),before);
  const stale=await preview(await tenant('crm_stale')),old=stale.f.left;
  await api(stale.f.org,'modules/contacts/records/'+old.id,{method:'PATCH',body:{revision:old.revision,data:{...old.data,title:'Fictional changed after preview'}}});const saved=await snapshot(stale.f.org);
  await commit(stale,{status:409,code:'contact_command_stale'});equal('stale-preserves-domain',await snapshot(stale.f.org),saved);return{exactCollision409:true,exactStale409:true};
 });
 await run(7,async()=>{
  const f=await tenant('crm_authority'),p=await preview(f);await commit(p);
  const call=()=>read(f.org,c=>M.crmContext.currentContactReconciliationMember(c,{org:f.org,session:sessions.get(f.actor)}));
  const rejected=async(p,code,status)=>assert.rejects(p,e=>e.code===code&&e.status===status);
  for(const [role,programs]of [['contributor',[]],['admin',['restricted']]]){await owner.query('UPDATE os_members SET role=$3,program_ids=$4::jsonb WHERE org_id=$1 AND user_id=$2',[f.org,f.actor,role,JSON.stringify(programs)]);await rejected(call(),'contact_context_role',403);}
  await owner.query("UPDATE os_members SET role='owner',program_ids='[]' WHERE org_id=$1 AND user_id=$2",[f.org,f.actor]);
  await owner.query('UPDATE "session" SET "expiresAt"=clock_timestamp()-interval \'1 second\' WHERE id=$1',[sessions.get(f.actor).session.id]);await rejected(call(),'session',401);
  await owner.query('UPDATE "session" SET "expiresAt"=clock_timestamp()+interval \'48 hours\' WHERE id=$1',[sessions.get(f.actor).session.id]);
  await owner.query('DELETE FROM os_members WHERE org_id=$1 AND user_id=$2',[f.org,f.actor]);await rejected(call(),'membership',403);
  await owner.query("INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'owner')",[f.org,f.actor]);await commit(p,{status:409,code:'contact_command_stale'});
  const epoch=await tenant('crm_epoch'),q=await preview(epoch);await commit(q);await owner.query("INSERT INTO os_events(org_id,actor_id,action,detail) VALUES($1,$2,'backup.restored','{}')",[epoch.org,epoch.actor]);await commit(q,{status:409,code:'contact_command_stale'});
  return{expiredActualSessionDenied:true,actualRemovedMemberDenied:true,scopedAndContributorDenied:true,readdedIncarnationAndRestoreEpochStale:true,replayTenantUntouched:true};
 });
 await run(8,async()=>{
  const f=await tenant('crm_inverse'),p=await preview(f),first=await verifyAccepted(p,await commit(p));
  const inverse=await read(f.org,c=>M.crmContext.readContactReconciliationInverseContext(c,{org:f.org,session:sessions.get(f.actor),leftId:f.left.id,rightId:f.right.id}));equal('inverse-real-trash',inverse.inverseContext.pair[1].deletedAt,first.r.payload.recordedAtExact);
  const rev=(await api(f.org,'contact-reconciliation/reverse-preview',{body:{reportId:first.r.id}})).value,body={previewId:rev.previewId,commandKey:key()},acceptedReverse=accepted((await api(f.org,'contact-reconciliation/commit',{body})).value);equal('inverse-operation',acceptedReverse.operation,'reverse');
  const history=await reports(f.org);equal('inverse-two-reports',history.length,2);equal('original-immutable',history.find(r=>r.id===first.r.id),first.r);
  const after=await records(f.org);for(const c of first.r.payload.changes){const r=after.find(r=>r.row.id===c.before.id);equal('inverse-next-revision',r.row.revision,c.after.revision+1);equal('inverse-original-data',r.row.data,c.before.data);equal('inverse-cleared-trash',r.deleted_exact,null);}
  await artifact('genuine-original-inverse.json',{original:first,inversePreview:rev,accepted:acceptedReverse,history,records:after});return{genuineCommittedReceipt:true,originalReportPreserved:true,sqlTrashRestored:true};
 });
 await run(9,async()=>{
  for(const kind of ['row','reference','history']){
   const f=await tenant('crm_inverse_'+kind),p=await preview(f),v=await verifyAccepted(p,await commit(p));
   if(kind==='row'){const row=(await records(f.org)).find(r=>r.row.id===f.left.id).row;await api(f.org,'modules/contacts/records/'+f.left.id,{method:'PATCH',body:{revision:row.revision,data:{...row.data,title:'Fictional later edit'}}});}
   if(kind==='reference')await api(f.org,'modules/fundraising/records',{body:{data:{title:'Fictional later pledge',kind:'pledge',contactId:f.left.id}}});
   if(kind==='history')await edit(f.org,async c=>{const {member}=await M.crmContext.currentContactReconciliationMember(c,{org:f.org,session:sessions.get(f.actor)},{readOnly:false});const at=(await one(c,sql.sampleStamp)).at_exact;const payload=M.crmReport.makeContactReconciliationReport({reportId:'later-report',recordedAtExact:at,input:{...v.r.payload.review.input,decision:separateDecision()}});await M.crmStore.appendContactReconciliationReport(c,{org:f.org,member,row:M.crmReport.makeContactReconciliationReportRow({orgId:f.org,id:payload.reportId,actorId:f.actor,createdAtExact:at,payload})});});
   const before=await snapshot(f.org);await api(f.org,'contact-reconciliation/reverse-preview',{body:{reportId:v.r.id},status:409,code:'contact_report_stale'});equal('inverse-'+kind+'-no-write',await snapshot(f.org),before);
  }
  sourcePacket=await exportPacket(source.org,'source-native.json');const dest=await tenant('crm_history_only',{pair:false});await restore(dest.org,sourcePacket);
  await api(dest.org,'contact-reconciliation/reverse-preview',{body:{reportId:sourceReport.id},status:409,code:'contact_command_stale'});
  return{laterRowReferenceAndHistoryRefused:true,restoredHistoryHasNoAcceptedOriginal:true};
 });
 await run(10,async()=>{const value=await fault(await tenant('crm_fault_record'),'record');await artifact('last-record-rollback.json',value);return value;});
 await run(11,async()=>{const values=[];for(const phase of ['report','audit','receipt'])values.push(await fault(await tenant('crm_fault_'+phase),phase));await artifact('mandatory-history-receipt-rollbacks.json',values);return{phases:values};});
 await run(12,async()=>{
  const f=await tenant('crm_quota'),p=await preview(f),before=await snapshot(f.org),identity=await read(f.org,c=>one(c,sql.runtimeIdentity));await owner.query(sql.createBallastSequences);await owner.query(sql.grantBallastSequences.replace('__RUNTIME__','"'+identity.role+'"'));await owner.query(sql.createBallastFunction);
  await owner.query('CREATE TRIGGER crm_ballast AFTER UPDATE ON os_previews FOR EACH ROW EXECUTE FUNCTION os_crm_ballast_guard()');
  try{await commit(p,{status:422,code:'quota'});}finally{await dropTrigger('crm_ballast','os_previews');}
  const witness=await one(owner,sql.ballastWitness);equal('ballast-one-final-transition',witness.fired,'1');truth('actual-retained-over60',BigInt(witness.bytes)>60n*1024n*1024n);equal('ballast-rolled-back',witness.rows,0);equal('whole-command-quota-rollback',await snapshot(f.org),before);
  await artifact('synthetic-quota-scalar-rollback.json',{witness,beforeSha256:before.sha256,afterSha256:(await snapshot(f.org)).sha256,syntheticCounterfactualServerBallast:true,largePayloadSerialized:false,validCrmMaximumOrNative64AttainmentClaimed:false});return{actualQuotaRefusal:true,syntheticBallastBytes:witness.bytes,allDomainAndBallastRolledBack:true};
 });
 await run(13,async()=>{
  assert(sourcePacket);const first=await tenant('crm_restore_one',{pair:false}),second=await tenant('crm_restore_two',{pair:false});const initial=clone(sourceReport);
  const r1=await restore(first.org,sourcePacket),b1=await exportPacket(first.org,'restore-one-native.json'),r2=await restore(second.org,b1),b2=await exportPacket(second.org,'restore-two-native.json');
  for(const [f,b]of [[first,b1],[second,b2]]){
   const rs=await reports(f.org);equal('restore-one-reserved-report',rs.length,1);const r=rs[0];for(const k of ['id','title','checksum','payload'])equal('two-hop-preserved-'+k,r[k],initial[k]);equal('dest-metadata-org',r.org_id,f.org);equal('dest-metadata-creator',r.created_by,f.actor);truth('dest-SQL6-time',/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(r.created_at));equal('origin-history-not-retargeted',r.payload.originOrgId,source.org);
   equal('no-restored-authority',await read(f.org,c=>one(c,sql.noCrmAuthority,[f.org])),{previews:0,links:0,outbox:0,credentials:0});
   const arch=await read(f.org,c=>c.query("SELECT payload,checksum FROM os_previews WHERE org_id=$1 AND kind='backup' AND committed_at IS NOT NULL",[f.org]).then(x=>x.rows));equal('one-complete-source-archive',arch.length,1);equal('archive-checksum',arch[0].checksum,arch[0].payload.checksum);equal('exact-incoming-archive-json',arch[0].payload,f===first?sourcePacket:b1);if(f===first)truth('original-source-raw-trash-in-first-archive',arch[0].payload.trash.some(x=>x.id===source.right.id));else truth('original-trash-stamp-remains-in-history',arch[0].payload.reports.find(x=>x.id===sourceReport.id).payload.changes.some(x=>x.after.deletedAt!==null));
   truth('export-present-historical-report',b.reports.some(x=>x.id===initial.id&&x.checksum===initial.checksum));equal('no-live-loser-after-restore',(await records(f.org)).some(x=>x.row.id===source.right.id),false);
  }
  await artifact('two-native-hops-result.json',{first:r1,second:r2,firstReports:await reports(first.org),secondReports:await reports(second.org)});return{twoActualHandlerRestores:true,reportPayloadIdentityPreserved:true,noCommandsOrApprovalsRestored:true};
 });
 await run(14,async()=>{
  const occupied=await tenant('crm_occupied',{pair:false});await restore(occupied.org,sourcePacket);
  // Reserve-only destination has no ordinary records: local fixture removes its
  // ordinary drafts with bootstrap, retaining the real immutable reserved row.
  await owner.query('DELETE FROM os_records WHERE org_id=$1',[occupied.org]);const empty=M.backup.makeBackup({name:'Fictional absent source',currency:'USD',time_zone:'UTC'},[]),p=(await api(occupied.org,'import/preview',{body:{backup:empty}})).value;
  truth('occupied-preview-issue',p.issues.some(x=>x.field==='organization'));await api(occupied.org,'import/commit',{body:{previewId:p.previewId},status:409,code:'restore_conflict'});
  const collision=await tenant('crm_legacy_collision',{pair:false});await owner.query("INSERT INTO os_reports(org_id,id,created_by,title,checksum,payload) VALUES($1,$2,$3,'Fictional existing legacy ID',repeat('0',64),'{\"ordinary\":true}')",[collision.org,sourceReport.id,collision.actor]);
  const before=await snapshot(collision.org);await assert.rejects(edit(collision.org,async c=>{const {member}=await M.crmContext.currentContactReconciliationMember(c,{org:collision.org,session:sessions.get(collision.actor)},{readOnly:false});const at=(await one(c,sql.sampleStamp)).at_exact;return M.crmRecovery.restoreContactReconciliationReports(c,sourcePacket,{orgId:collision.org,member,createdAtExact:at});}),e=>e.code==='contact_report_collision'&&e.status===409);equal('collision-full-state',await snapshot(collision.org),before);
  const malformed=await tenant('crm_malformed',{pair:false}),bad=clone(sourcePacket);bad.reports.find(x=>x.id===sourceReport.id).payload.version=2;const {checksum,...body}=bad;bad.checksum=M.security.hash(body);const prior=await snapshot(malformed.org);
  await api(malformed.org,'import/preview',{body:{backup:bad},status:422,code:'contact_report_fields'});equal('malformed-before-persistence',await snapshot(malformed.org),prior);return{reservedOnlyDestinationBlocksAbsentSource:true,anyReportIdCollisionRefuses:true,malformedVersion422BeforePersistence:true};
 });
 await run(15,async()=>{
  const absent=await tenant('crm_absent',{pair:false}),empty=M.backup.makeBackup({name:'Fictional absent source',currency:'USD',time_zone:'UTC'},[]);equal('old-absence-validated-golden',M.backup.validateBackup(empty,'destination','restorer'),absentGolden.absentValidated);
  const p=(await api(absent.org,'import/preview',{body:{backup:empty}})).value;equal('absent-issues',p.issues,[]);equal('no-new-absent-preview-counter',Object.hasOwn(p.summary,'contactReconciliationReportsRecovered'),false);await api(absent.org,'import/commit',{body:{previewId:p.previewId}});
  const audit=await read(absent.org,c=>one(c,sql.lastRestoreAudit,[absent.org]));equal('no-new-absent-audit-counter',Object.hasOwn(audit.detail,'contactReconciliationReportsRecovered'),false);
  const vectors={};for(const org of [source.org,'crm_restore_one','crm_restore_two'])vectors[org]=await read(org,async c=>{const rows=(await c.query(sql.reportComposite,[org])).rows;const backup=await M.workspace.assembleWorkspaceBackup(c,org),measured=await M.learning.measureLearningRestoreCapacity(c,backup,{orgId:'crm_future_destination',actorId:userFor(org)}),usage=await M.database.logicalBackupBytes(c,org);truth('small-actual-logical-under60',usage<=60*1024*1024);truth('small-actual-wire-under64',Buffer.byteLength(JSON.stringify(backup))<64*1024*1024);assert(rows.length===1&&rows[0].bytes>0&&measured.categories.os_reports.bytes>0);return{reportRows:rows,usage,nativeBytes:Buffer.byteLength(JSON.stringify(backup)),restore:measured};});
  await artifact('small-native-restore-budget-vectors.json',{vectors,absentPreview:p.summary,absentAudit:audit.detail,oldAbsenceGoldenSource:absentGolden.sourceCommit,scope:'Actual small vectors; golden absence validation/field shape only, no fake-SQL byte-golden relabeled as actual PG.'});return{actualSmallVectors:3,oldAbsentCounterShapePreserved:true,naturalMaximumClaimed:false};
 });
 await run(16,async()=>{
  const acl=await read(source.org,c=>one(c,sql.reportAcl));truth('report-select',acl.can_select);truth('report-insert',acl.can_insert);for(const k of ['can_update','can_delete','can_truncate'])equal('report-no-'+k,acl[k],false);
  for(const text of ['UPDATE os_reports SET title=title WHERE org_id=$1','DELETE FROM os_reports WHERE org_id=$1'])await assert.rejects(edit(source.org,c=>c.query(text,[source.org])),e=>e.code==='42501');
  const free=await db.tx('', '',c=>one(c,sql.contextFree),{readOnly:true});equal('fresh-context-free-zero',free,{records:0,reports:0,previews:0});
  for(const org of actors.keys())await read(org,async c=>{const s=await one(c,sql.noCrmAuthority,[org]);equal('no-unintended-links',s.links,0);equal('no-unintended-outbox',s.outbox,0);equal('no-credentials',s.credentials,0);const a=await one(c,'SELECT count(*)::int AS n FROM os_records WHERE org_id=$1 AND (approval IS NOT NULL OR snapshot IS NOT NULL)',[org]);equal('no-approvals-or-snapshots',a.n,0);});
  equal('no-provider-calls',providerCalls(),0);equal('no-fixture-delivery',denied,0);equal('no-real-sign-in-flow',otherAuth,0);equal('all-current-promises-settled',active.size,0);await artifact('final-routes-and-side-effects.json',{calls,acl,contextFree:free,providerCalls:providerCalls(),syntheticAuth:true,actualNetworkServer:false});return{providerCalls:0,constrainedRole:true,actualWorkSettled:true};
 });
 equal('all16results',results.length,16);truth('all16pass',results.every((r,i)=>r.number===i+1&&r.name===CRM_CASE_NAMES[i]&&r.status==='PASS'));equal('all-handler-promises-settled',active.size,0);
 return{tests:16,pass:16,fail:0,skip:0,caseWorkSettled:active.size===0,providerCalls:providerCalls(),caseResults:results,syntheticAuthNotRealBetterAuth:true,actualHandlerAndDatabase:true,networkServerOrBrowser:false,expiredRowSqlSeamNotNaturalElapsedExpiry:true,quotaBallastCounterfactualNotCrmMaximum:true,actualNative64Attainment:false};
}
