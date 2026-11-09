/** Test helpers minted only from a genuine active owned fixture. Import is inert.
 * No caller-supplied database, modules, policy/recipient authority or clock. */
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {isProxy} from 'node:util/types';
import {requireReminderFixture} from './participation-reminder.mjs';
import sql from './participation-reminder-sql.json' with {type:'json'};
const contexts=new WeakMap(),fixtures=new WeakSet();
const ORIGIN='https://os.example.invalid',SECRET='fictional-reminder-pg-secret-longer-than-thirty-two';
const MAX=2097152,opaque=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v),sha=v=>createHash('sha256').update(v).digest('hex');
const stamp=v=>assert(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(v));
export function createReminderTestContext(fixture,options){
 assert.equal(arguments.length,2);const caps=requireReminderFixture(fixture);assert(!fixtures.has(fixture),'One test context per owned fixture');
 assert(options&&!isProxy(options)&&Object.getPrototypeOf(options)===Object.prototype&&Reflect.ownKeys(options).length===1);const descriptor=Object.getOwnPropertyDescriptor(options,'onArtifact');assert(descriptor?.enumerable&&Object.hasOwn(descriptor,'value')&&typeof descriptor.value==='function');const onArtifact=descriptor.value;
 const {db,owner,modules:M,healthy,upgrade,identity,authAcl,authCatalog,readAuthFacts,trace,providerCalls,track}=caps;
 assert([170011,180006].includes(identity.version_num));
 const issuedTenants=new WeakSet(),sessions=new Map(),calls=[],observations=[],active=new Set();let serial=0,faultPhase=null,refusedProviderCalls=0;
 const key=()=>`reminder_pg_command_${String(++serial).padStart(12,'0')}`;
 const work=p=>{assert(p instanceof Promise);active.add(p);track(p);void p.then(()=>active.delete(p),()=>active.delete(p));return p;};
 const one=async(c,q,a=[])=>{const r=(await c.query(q,a)).rows;assert.equal(r.length,1);return r[0];};
 const read=(f,fn)=>{assert(issuedTenants.has(f),'Use a genuine fixture tenant');return work(db.tx(f.actor,f.org,fn,{lock:true,readOnly:true}));};
 const edit=(f,fn)=>{assert(issuedTenants.has(f),'Use a genuine fixture tenant');return work(db.tx(f.actor,f.org,fn,{lock:true}));};
 const artifact=async(name,v)=>{assert(/^[a-z0-9-]+\.json$/.test(name));assert(Buffer.byteLength(JSON.stringify(v))<=MAX);await onArtifact(name,v);};
 const snapshot=async f=>read(f,async c=>{const value={};for(const t of sql.snapshotTables){const rows=(await c.query(sql.snapshotSql[t],[f.org])).rows;assert(rows.length<=2000);value[t]=rows.map(r=>r.row);}assert(Buffer.byteLength(JSON.stringify(value))<=MAX);return value;});
 const noDml=offset=>assert.equal(trace.slice(offset).filter(r=>['INSERT','UPDATE','DELETE'].includes(r.kind)&&!r.rateLimitBookkeeping).length,0);
 const noClock=offset=>assert.equal(trace.slice(offset).filter(r=>r.kind==='REMINDER_DOMAIN_CLOCK').length,0);
 const observed={...db,tx:(u,o,fn,options)=>db.tx(u,o,async c=>{
  const state=await one(c,"SELECT current_setting('transaction_read_only') AS read_only");observations.push({org:o,declaredReadOnly:options?.readOnly===true,actualReadOnly:state.read_only==='on'});
  if(faultPhase)await c.query("SELECT set_config('app.reminder_test_fault',$1,true)",[faultPhase]);
  return fn(c);
 },options)};
 const settings=Object.freeze({origin:ORIGIN,secret:SECRET,production:false,participationDeliveryEnabled:true,participationTestOnly:true,participationTestRecipient:'participant@example.invalid'});
 const refuse=()=>{refusedProviderCalls++;throw Error('REMINDER_PG_PROVIDER_REFUSED');};
 const auth={api:{getSession:async({headers})=>sessions.get(headers.get('x-reminder-fixture-user'))||null,signInMagicLink:refuse},handler:refuse};
 const handler=M.handler.createHandler({settings,db:observed,auth,send:refuse,participationTransport:refuse});
 async function api(f,tail,{body,user=f.actor,status=200,headers:extra={},throughHandler=false}={}){
  healthy();assert(issuedTenants.has(f));assert(opaque(f.org));assert(/^\/(?:api\/participant\/orgs\/[A-Za-z0-9_-]+\/requests\/[A-Za-z0-9_-]+\/participations\/[A-Za-z0-9_-]+\/(?:reminder|reminder-preference)|api\/orgs\/[A-Za-z0-9_-]+\/participation-reminders\/(?:preview|schedule))$/.test(tail));
  const session=sessions.get(user)||null,method=body===undefined?'GET':'POST',raw=body===undefined?null:JSON.stringify(body);assert(raw===null||Buffer.byteLength(raw)<=16384);
  const request=new Request(ORIGIN+tail,{method,headers:{'x-reminder-fixture-user':user,...(raw===null?{}:{origin:ORIGIN,'content-type':'application/json','x-csrf-token':session?M.security.csrf(session.session.id,SECRET):'fictional-anonymous'}),...extra},...(raw===null?{}:{body:raw})});
  let response,value;
  if(throughHandler){response=await work(handler(request));value=await response.json();}
  else try{response=await work((tail.startsWith('/api/participant/')?M.routes.ownParticipationReminderRoutes:M.routes.participationReminderRoutes)({request,db:observed,settings,session}));assert(response);value=await response.json();}
  catch(error){if(!Number.isInteger(error.status)||error.status<400||error.status>599)throw error;response={status:error.status,headers:new Headers()};value={code:error.code};}
  calls.push({org:f.org,tail,method,user,status:response.status,expectedStatus:status,code:typeof value.code==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value.code)?value.code:null,bodySha256:raw===null?null:sha(raw),commandSha256:typeof body?.commandKey==='string'?sha(body.commandKey):null,throughHandler});
  assert.equal(response.status,status,'actual route/handler status');if(response.status===200)assert.equal(response.headers.get('referrer-policy'),'no-referrer');healthy();return value;
 }
 const ownPath=(f,p)=>`/api/participant/orgs/${f.org}/requests/${p.intakeId}/participations/${p.id}`;
 const staffPath=(f,op)=>`/api/orgs/${f.org}/participation-reminders/${op}`;
 async function actor(f,id,email='participant@example.invalid'){
  assert(issuedTenants.has(f)&&opaque(id)&&id.length<=90);assert(typeof email==='string'&&email.length<=254&&/^[a-z0-9._+-]+@example\.invalid$/.test(email));await owner.query('INSERT INTO "user"(id,email,"emailVerified") VALUES($1,$2,true)',[id,email]);
  const sid='session_'+id;await owner.query('INSERT INTO "session"(id,"userId","expiresAt") VALUES($1,$2,clock_timestamp()+interval \'48 hours\')',[sid,id]);
  sessions.set(id,Object.freeze({user:Object.freeze({id,email,emailVerified:true}),session:Object.freeze({id:sid})}));return id;
 }
 async function tenant(name){
  const f={org:'rm_'+name,actor:'rm_admin_'+name,own:'rm_own_'+name,people:[],records:[]};assert([f.org,f.actor,f.own].every(v=>opaque(v)&&v.length<=90));issuedTenants.add(f);await actor(f,f.actor,'admin@example.invalid');await actor(f,f.own);
  await owner.query("INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional reminder SQL fixture',$1,'USD','UTC')",[f.org]);
  await owner.query("INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'admin')",[f.org,f.actor]);return f;
 }
 async function put(f,id,moduleId,data,status='draft',revision=1){
  assert(issuedTenants.has(f)&&f.clock);const r={id,orgId:f.org,moduleId,status,revision,ownerId:'fictional-author',lastEditedBy:'fictional-author',approval:status==='draft'?null:{status:'approved',revision,actorId:'fictional-reviewer'},snapshot:null,source:null};
  r.data=M.modules.validateRecord(moduleId,data,{records:f.records,orgId:f.org,recordId:id,status,participation:moduleId==='volunteers'?await M.guards.participationValidationContext(owner,f.org):undefined});f.records.push(r);
  await owner.query('INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision,approval,created_at,updated_at) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9::jsonb,$10::timestamptz,$10::timestamptz)',[f.org,id,moduleId,JSON.stringify(r.data),status,r.ownerId,r.lastEditedBy,revision,JSON.stringify(r.approval),f.clock.history_exact]);return r;
 }
 function seedOptions(input={}){
  const value=M.groupModel.ownGroupValue(input,1024);assert(value&&!Array.isArray(value));assert(Object.keys(value).every(k=>['moduleId','count','interval','startOffsetSeconds'].includes(k)));
  const {moduleId='events',count=1,interval=false,startOffsetSeconds=604800}=value;assert(['events','volunteers'].includes(moduleId));assert(Number.isSafeInteger(count)&&count>=1&&count<=20);assert(typeof interval==='boolean'&&(!interval||moduleId==='volunteers'));assert([-3600,0,3600,604800,31968000].includes(startOffsetSeconds));
  return Object.freeze({moduleId,count,interval,startOffsetSeconds});
 }
 async function seed(f,input={}){
  assert(issuedTenants.has(f)&&f.people.length===0&&!Object.hasOwn(f,'clock'));const {moduleId,count,interval,startOffsetSeconds}=seedOptions(input);
  const clock=Object.freeze(await one(owner,sql.sample,[startOffsetSeconds]));Object.defineProperty(f,'clock',{value:clock,enumerable:true});stamp(clock.at_exact);stamp(clock.history_exact);f.moduleId=moduleId;
  const program=await put(f,'rm_program','programs',{title:'Fictional program',kind:'program'});
  if(moduleId==='volunteers')await put(f,'rm_safeguarding','safeguarding',{title:'Fictional training',kind:'training',completion:'pending'},'pending');
  f.source=await put(f,'rm_target',moduleId,{title:'Fictional confirmed future occurrence',kind:moduleId==='events'?'session':'shift',programId:program.id,startAt:f.clock.start_at,endAt:f.clock.end_at,timeZone:'UTC',capacity:25,participationPurpose:'Finite fictional software verification only.',participantInstructions:'Fictional instructions.',organizerEmail:'organizer@example.invalid',...(moduleId==='volunteers'?{allowPartialIntervals:true,safeguardingId:'rm_safeguarding'}:{})},moduleId==='events'?'scheduled':'open',4);
  const terms=M.participation.participationTerms(f.source),termsHash=M.security.hash(terms);
  await owner.query("INSERT INTO os_participation_targets(org_id,target_id,module_id,mode,source_revision,terms,terms_hash,created_by,created_at,updated_at) VALUES($1,$2,$3,'managed',4,$4::jsonb,$5,$6,$7::timestamptz,$7::timestamptz)",[f.org,f.source.id,moduleId,JSON.stringify(terms),termsHash,f.actor,f.clock.history_exact]);
  await owner.query("INSERT INTO os_participation_delivery_policies(org_id,enabled,epoch,template_version) VALUES($1,true,$2,'participation-notice-v1')",[f.org,randomBytes(16).toString('hex')]);
  for(let n=1;n<=count;n++){
   const suffix=String(n).padStart(2,'0'),id='rm_person_'+suffix,contact=await put(f,'rm_contact_'+suffix,'contacts',{title:'Fictional linked contact '+suffix,kind:'person-reference',contactPreference:'permission-needed'});
   const booking=await put(f,'rm_booking_'+suffix,moduleId,{title:'Fictional approved booking '+suffix,kind:moduleId==='events'?'registration':'assignment',[moduleId==='events'?'eventId':'shiftId']:f.source.id,contactId:contact.id,programId:program.id},'approved',3);
   const form=await put(f,'rm_form_'+suffix,'forms',{title:'Fictional request',kind:'form',version:1,purpose:'Fictional test request only.',anonymous:false,consentRequired:true,retentionUntil:'2099-12-31',definition:JSON.stringify([{key:'email',label:'Email',type:'text',required:true}])},'published',4);
   const intakeId='rm_intake_'+suffix,publicationId='rm_publication_'+suffix,linkId=randomBytes(16).toString('hex');
   await owner.query('INSERT INTO os_publications(org_id,id,record_id,source_revision,kind,target_id,target_module,target_revision,schema,created_by,created_at) VALUES($1,$2,$3,4,$4,$5,$6,4,$7::jsonb,$8,$9::timestamptz)',[f.org,publicationId,form.id,moduleId==='events'?'event-interest':'volunteer-interest',f.source.id,moduleId,JSON.stringify(M.intake.intakeSchema(form,moduleId==='events'?'event-interest':'volunteer-interest')),f.actor,f.clock.history_exact]);
   await owner.query("INSERT INTO os_intake(org_id,id,publication_id,answers,consent_at,status,converted_ids,created_at,updated_at) VALUES($1,$2,$3,$4::jsonb,$5::timestamptz,'converted',$6::jsonb,$5::timestamptz,$5::timestamptz)",[f.org,intakeId,publicationId,JSON.stringify({email:'participant@example.invalid'}),f.clock.history_exact,JSON.stringify([{id:booking.id,moduleId},{id:contact.id,moduleId:'contacts'}])]);
   await owner.query('INSERT INTO os_participant_links(id,org_id,intake_id,publication_id,user_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6::timestamptz,$6::timestamptz)',[linkId,f.org,intakeId,publicationId,f.own,f.clock.history_exact]);
   const range=interval?{version:1,startAt:new Date(Date.parse(terms.startAt)+900000).toISOString(),endAt:new Date(Date.parse(terms.endAt)-900000).toISOString(),timeZone:'UTC'}:null;
   const frozen={terms,sourceRevision:4,termsHash,candidateRevision:3,candidateApproval:booking.approval,programId:program.id,...(range?{interval:range,allocationHash:M.participation.participationAllocationHash(f.source.id,4,termsHash,range)}:{})};
   const consent={revision:2,sourceRevision:4,termsHash,at:f.clock.history_exact.slice(0,23)+'Z',waitlistAllowed:false,emailUpdates:false,method:'verified-participant',actorHash:M.security.hash(f.own),recipientHash:M.security.hash('participant@example.invalid'),withdrawalAcknowledged:false,...(terms.intervalPolicy?{terms}:{}),...(range?{allocationHash:frozen.allocationHash}:{})};
   const delivery={version:'participation-email-v1',enabled:true,revision:1,at:f.clock.history_exact.slice(0,23)+'Z',userId:f.own,linkId,linkRevision:1,recipientHash:M.security.hash('participant@example.invalid')};
   await owner.query("INSERT INTO os_participations(org_id,id,target_id,module_id,booking_record_id,contact_id,intake_id,state,revision,source,consent,frozen,requested_interval,delivery_consent,created_by,confirmed_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,'confirmed',3,'intake',$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13::timestamptz,$13::timestamptz,$13::timestamptz)",[f.org,id,f.source.id,moduleId,booking.id,contact.id,intakeId,JSON.stringify(consent),JSON.stringify(frozen),range?JSON.stringify(range):null,JSON.stringify(delivery),f.actor,f.clock.history_exact]);
   f.people.push({id,intakeId,linkId,bookingId:booking.id,contactId:contact.id});
  }
  return f;
 }
 const fresh=async(name,options)=>{const checked=seedOptions(options);return seed(await tenant(name),checked);};
 const ownGet=(f,p=f.people[0],options={})=>api(f,ownPath(f,p)+'/reminder',{user:f.own,...options});
 async function choice(f,p=f.people[0],enabled=true,options={}){
  const v=await ownGet(f,p),body={version:1,revision:v.revision,intakeRevision:v.intakeRevision,reminderRevision:v.reminder.revision,enabled,consentVersion:'participation-reminder-v1',commandKey:key(),...(enabled?{commitmentSha256:v.reminder.currentCommitmentSha256}:{})};
  return{body,value:await api(f,ownPath(f,p)+'/reminder-preference',{body,user:f.own,...options}),p};
 }
 async function enableAll(f){for(const p of f.people)await choice(f,p);return f;}
 async function preview(f){
  const participations=[];for(const p of f.people){const v=await ownGet(f,p);participations.push({participationId:p.id,revision:v.revision,intakeRevision:v.intakeRevision});}
  const body={version:1,target:{moduleId:f.moduleId,targetId:f.source.id,targetRevision:1,sourceRevision:4},participations};
  const value=await api(f,staffPath(f,'preview'),{body});return{f,body,value,schedule:{previewId:value.previewId,commandKey:key()}};
 }
 const schedule=(p,options={})=>api(p.f,staffPath(p.f,'schedule'),{body:p.schedule,...options});
 const accepted=v=>{const {replayed,...rest}=M.model.validateReminderAcceptedResponse(v);return rest;};
 async function verifyScheduled(p,value){
  M.model.validateReminderAcceptedResponse(value);const rows=await read(p.f,c=>c.query(sql.outbox,[p.f.org]).then(r=>r.rows));assert.equal(rows.length,p.f.people.length);
  const stored=(await read(p.f,c=>c.query(sql.previews,[p.f.org]).then(r=>r.rows))).map(M.store.validateReminderStoredRow);assert.equal(stored.length,1);assert.equal(stored[0].payload.state,'accepted');const receipt=stored[0].payload.receipt;M.model.validateReminderReceipt(receipt);
  for(const r of rows){const marker=M.model.validateReminderIntentMarker(r.row.payload.reminder);assert.equal(r.row.intent_kind,'reminder');assert.equal(r.row.budget_bytes,8192);assert.equal(r.row.state,'pending');assert.equal(r.row.first_attempt_at,null);assert.equal(r.row.attempts,0);assert.equal(r.created_exact,receipt.acceptedAtExact);assert.equal(r.next_exact,marker.dueAtExact);assert.equal(Buffer.byteLength(JSON.stringify(r.row.payload))<=2048,true);assert.deepEqual(Object.keys(r.row.payload).sort(),['state','participationId','revision','reminder'].sort());}
  assert.deepEqual(await read(p.f,c=>one(c,sql.counts,[p.f.org])),{outbox:p.f.people.length,receipts:1,tenants:1,audits:1});
  return{rows,stored,receipt};
 }
 const context=Object.freeze({format:'charitology-owned-reminder-test-context',version:1});
 const helpers=Object.freeze({...caps,M,sql,key,one,read,edit,artifact,snapshot,noDml,noClock,settings,api,actor,tenant,put,seedTenant:fresh,ownPath,staffPath,ownGet,choice,enableAll,preview,schedule,accepted,verifyScheduled,calls,observations,
  sessionFor:id=>{assert(sessions.has(id));return sessions.get(id);},
  activeCount:()=>active.size,settle:()=>Promise.allSettled([...active]),refusedCount:()=>refusedProviderCalls,
  setFaultPhase:value=>{assert([null,'outbox','audit','receipt'].includes(value));faultPhase=value;}});
 contexts.set(context,helpers);fixtures.add(fixture);return context;
}
export function requireReminderTestContext(context){const value=contexts.get(context);assert(value,'Use a genuine reminder test context');value.healthy();return value;}

/** Fresh final proof AFTER the composed suites have settled. Uses the same
 * genuine context and actual clients; it owns no profile or teardown. */
export async function verifyReminderContextFinalState(context){
 assert.equal(arguments.length,1);
 const H=requireReminderTestContext(context),{M,db,owner,sql,one,read,tenant,artifact,authAcl,authCatalog,readAuthFacts,trace,identity}=H;
 H.healthy();assert.equal(H.activeCount(),0);assert.equal(H.providerCalls()+H.refusedCount(),0);
 const f=await tenant('after_addon_final');
 const finalAuth=await readAuthFacts();assert.deepEqual(finalAuth.acl,authAcl);assert.deepEqual(finalAuth.catalog,authCatalog);
 const faultObjects=(await owner.query(sql.faultObjects)).rows;assert.deepEqual(faultObjects,[]);
 const column=await read(f,c=>one(c,sql.column));assert.deepEqual(column,{type:'jsonb',not_null:false,default_value:null});
 const constraints=await read(f,c=>c.query(sql.constraints).then(r=>r.rows));assert.equal(constraints.length,3);
 const role=await read(f,c=>one(c,sql.noDdl));
 for(const k of ['schema_create','rolsuper','rolcreatedb','rolcreaterole','rolinherit','rolreplication','rolbypassrls'])assert.equal(role[k],false);assert.equal(role.memberships,0);
 const rls=await read(f,c=>c.query(sql.rls).then(r=>r.rows));assert(rls.length===3&&rls.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
 const index=await read(f,c=>one(c,sql.originalIndex));assert(index.unique_index&&index.valid);assert.match(index.definition,/commitmentSha256/);assert.match(index.predicate,/intent_kind/);assert.doesNotMatch(index.predicate,/state/);
 const pids=[...new Set(trace.map(v=>v.backendPid).filter(Number.isSafeInteger))],observer=await db.pool.connect();let activities;
 try{activities=(await observer.query(sql.poolActivity,[pids])).rows;}finally{observer.release();}
 const pool={total:db.pool.totalCount,idle:db.pool.idleCount,waiting:db.pool.waitingCount,borrowed:db.pool.totalCount-db.pool.idleCount};
 assert(pool.total>=1&&pool.total<=5);assert.equal(pool.borrowed,0);assert.equal(pool.waiting,0);assert(activities.every(r=>r.no_transaction&&r.state==='idle'));
 H.healthy();assert.equal(H.activeCount(),0);const providerCalls=H.providerCalls()+H.refusedCount();assert.equal(providerCalls,0);
 await artifact('after-addon-final-state.json',{source:M.sourceProof,identity,finalTenant:f.org,authAcl,authCatalog,finalAuth,column,constraints,role,rls,index,faultObjects,pids,activities,pool,providerCalls,activeWork:0,lifetimePidListNotPoolMaximum:true,syntheticAuthOnly:true,localTransportNotProvider:true,outerCleanupSeparate:true});
 return Object.freeze({verified:true,finalTenant:f.org,authAclCatalogExact:true,roleRestricted:true,forcedRls:true,originalIndexValid:true,faultObjectsAbsent:true,borrowedClientsZero:true,pool:Object.freeze(pool),providerCalls,activeWork:0,outerCleanupSeparate:true});
}
