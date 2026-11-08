/** Canonical BG01–BG15 test journey. Import creates no resources or driver. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { requireGroupCi17BusinessFixture } from "./participation-groups.mjs";
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
const SECRET="fictional-group-business-secret-".repeat(3);
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const snapshotTables=["os_records","os_participation_targets","os_participations","os_participation_delivery_policies","os_participation_outbox","os_events","os_participation_groups","os_participation_group_receipts","os_intake","os_publications","os_participant_links","os_participation_checkins"];
const names=["read","incomplete","flow","queue","interval","cancel","close","own","collision","fault","authority","restore","race","loss"];
function failureDiagnostics(error){
 const result={frames:[]};
 try{
  for(const key of ["actual","expected","actualStatus","actualCode","expectedStatus","expectedCode"]){
   const descriptor=Object.getOwnPropertyDescriptor(error,key);
   if(!descriptor)continue;
   const value=Object.hasOwn(descriptor,"value")?descriptor.value:undefined;
   if(value===null||typeof value==="boolean"||typeof value==="number"&&Number.isFinite(value)||typeof value==="string"&&/^[A-Za-z0-9_-]{1,64}$/.test(value))result[key]=value;
   else result[key+"Omitted"]=true;
  }
  const stack=error?.stack;
  if(typeof stack==="string")for(const line of stack.slice(0,16384).split("\n",33).slice(1)){
   if(!/^\s+at\s/.test(line))continue;
   const match=/(?:\/[^()\r\n]+)\/([A-Za-z0-9_-]{1,100}\.(?:mjs|js)):([1-9][0-9]{0,6}):([1-9][0-9]{0,6})\)?$/.exec(line.trimEnd());
   if(match)result.frames.push({source:match[1],line:Number(match[2]),column:Number(match[3])});
   if(result.frames.length===8)break;
  }
 }catch{} // Diagnostics must never replace or expose the original failure.
 return result;
}
const BUSINESS_CASE_NAMES=Object.freeze([
 "BG01 actual target/session/member access and source baseline",
 "BG02 incomplete draft creation allocates nobody",
 "BG03 all3 capacity2 refusal and deliberate subset review",
 "BG04 real atomic subset admission and exact child intents",
 "BG05 actual waitlist order and explicit bypass reasons",
 "BG06 actual half-open volunteer ranges and overlap refusal",
 "BG07 actual group cancellation with immutable prior history",
 "BG08 actual draft close and exact no-write Replay",
 "BG09 later own cancellation and aggregate Replay under changed source/key",
 "BG10 same-key changed-body/action collision and no-op refusal",
 "BG11 last real child SQL failure rolls back the complete aggregate",
 "BG12 fresh session/member/scope authority before accepted Replay",
 "BG13 bigint restore epoch and ignored coordinator erasure",
 "BG14 two real concurrent capacity contenders serialize",
 "BG15 post-COMMIT local result suppression and manual exact Retry",
]);

const SAMPLE_STAMP_SQL="WITH moment AS MATERIALIZED (SELECT clock_timestamp() AS n) SELECT to_char(n AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS at_exact,to_char((n-interval '1 microsecond') AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS member_exact,to_char((n+interval '1 second') AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS future_exact FROM moment";
async function actualModules(){
 return {
  database:await import("../../lib/database.mjs"),
  modules:await import("../../lib/modules.mjs"),
  security:await import("../../lib/security.mjs"),
  access:await import("../../lib/access.mjs"),
  guards:await import("../../lib/participation-guards.mjs"),
  store:await import("../../lib/participation-group-store.mjs"),
  model:await import("../../lib/participation-group-model.mjs"),
  context:await import("../../lib/participation-group-context.mjs"),
  preview:await import("../../lib/participation-group-preview.mjs"),
  readRoutes:await import("../../lib/participation-group-read-routes.mjs"),
  writeRoutes:await import("../../lib/participation-group-write-routes.mjs"),
  http:await import("../../lib/participation-group-http.mjs"),
  participation:await import("../../lib/participation.mjs"),
  intake:await import("../../lib/intake.mjs"),
  workspace:await import("../../lib/workspace-backup.mjs"),
  backup:await import("../../lib/backup.mjs"),
  learning:await import("../../lib/learning-capacity.mjs"),
 };
}
/** All actors are distinct synthetic software rows, not real BetterAuth/humans. */
async function seedBusinessFixtures({db,owner,modules,sql,healthy}){
 const fixtures=new Map();let serial=0;const calls=[];
 const key=()=>"fictional_business_intent_"+String(++serial).padStart(10,"0");
 const row=async(c,text,args)=>(await c.query(text,args)).rows[0];
 const settings=f=>({origin:"https://os.example.invalid",secret:f.secret});
 const read=(f,fn)=>db.tx(f.staff,f.org,fn,{lock:true,readOnly:true});
 const edit=(f,fn)=>db.tx(f.staff,f.org,fn,{lock:true});
 const observe=async f=>{
  const tables={};for(const table of snapshotTables){
   const found=(await owner.query(`SELECT to_jsonb(t)::text AS body FROM ${table} t WHERE org_id=$1 ORDER BY to_jsonb(t)::text COLLATE "C"`,[f.org])).rows;
   assert(found.length<=2000);tables[table]=found.map(r=>r.body);
  }
  const text=JSON.stringify(tables);assert(Buffer.byteLength(text)<2*1024*1024);
  return {sha256:digest(text),counts:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length])),tables};
 };
 const groupCall=async(f,tail,input,{session=f.session,secret=f.secret,query=""}={})=>{
  healthy();const method=input===undefined?"GET":"POST",path=`/api/orgs/${f.org}/${tail}`;
  const raw=input===undefined?null:Buffer.from(JSON.stringify(input));
  const request=new Request(settings(f).origin+path+query,{method,...(raw?{headers:{"content-type":"application/json"},body:raw}:{})});
  const admitted=raw?await modules.http.readParticipationGroupBody(request):{};
  const readOnly=method==="GET"||modules.http.isParticipationGroupPreview(path,method);
  let backendPid,response;
  try{response=await db.tx(session.user.id,f.org,async c=>{
   backendPid=c.processID;
   const options={c,org:f.org,session,tail,method,input:admitted,url:new URL(request.url),settings:{...settings(f),secret}};
   const response=await modules.readRoutes.participationGroupReadRoutes(options)??await modules.writeRoutes.participationGroupWriteRoutes(options);
   assert(response instanceof Response);return response;
  },{lock:true,readOnly});}
  catch(error){calls.push({org:f.org,tail,method,readOnly,backendPid:backendPid??null,bodyBytes:raw?.length??0,bodySha256:raw?digest(raw):null,keySha256:input?.idempotencyKey?digest(input.idempotencyKey):null,status:Number.isInteger(error?.status)?error.status:null,code:typeof error?.code==="string"&&/^[A-Za-z0-9_]{1,64}$/.test(error.code)?error.code:"UNCLASSIFIED"});throw error;}
  // This line is reached only AFTER actual database.tx resolved COMMIT.
  const value={status:response.status,body:await response.json(),committed:true,backendPid};
  calls.push({org:f.org,tail,method,readOnly,backendPid,bodyBytes:raw?.length??0,bodySha256:raw?digest(raw):null,keySha256:input?.idempotencyKey?digest(input.idempotencyKey):null,status:value.status});
  healthy();return value;
 };
 const staffCall=(f,tail,input)=>db.tx(f.staff,f.org,async c=>{
  const member=await modules.access.membership(c,f.org,f.staff);
  const response=await modules.participation.participationRoutes({c,org:f.org,user:f.staff,member,tail:"participation-targets/"+tail,
   method:input===undefined?"GET":"POST",input:input??{},url:new URL(settings(f).origin+"/api/orgs/"+f.org+"/participation-targets/"+tail),settings:settings(f)});
  assert(response instanceof Response);return {status:response.status,...await response.json()};
 },{lock:true,readOnly:input===undefined});
 const parts=f=>read(f,async c=>(await c.query("SELECT * FROM os_participations WHERE org_id=$1 ORDER BY id COLLATE \"C\"",[f.org])).rows);
 const target=f=>read(f,c=>row(c,"SELECT * FROM os_participation_targets WHERE org_id=$1 AND target_id=$2",[f.org,f.target]));
 const receiptRows=(f,groupId)=>read(f,async c=>(await c.query("SELECT receipt FROM os_participation_group_receipts WHERE org_id=$1 AND group_id=$2 ORDER BY (receipt#>>'{result,groupRevision}')::int",[f.org,groupId])).rows.map(r=>r.receipt));
 const create=async(f,ids=f.people.map(p=>p.id),coordinatorIntakeId=null)=>{
  const people=await parts(f),t=await target(f);
  const source=await read(f,c=>row(c,"SELECT revision FROM os_records WHERE org_id=$1 AND id=$2",[f.org,f.target]));
  const input={version:1,target:{targetId:f.target,targetRevision:t.revision,sourceRevision:source.revision},members:ids.map(id=>({participationId:id,revision:people.find(p=>p.id===id).revision})),coordinatorIntakeId,idempotencyKey:key()};
  const response=await groupCall(f,"participation-groups",input);assert.equal(response.status,201);return {input,response,id:response.body.accepted.groupId};
 };
 const preview=(f,g,selection={mode:"all",items:[]},reasons=[])=>groupCall(f,`participation-groups/${g.id}/preview-admission`,{version:1,groupRevision:1,selection,reasons});
 const commitBody=(review,idempotencyKey=key())=>({version:1,selection:review.selection,reasons:review.reasons??[],previewToken:review.previewToken,reviewSha256:review.reviewSha256,idempotencyKey});
 const admit=async(f,g,selection={mode:"all",items:[]},reasons=[])=>{
  const reviewed=await preview(f,g,selection,reasons);assert.equal(reviewed.body.ready,true);
  const input={...commitBody(reviewed.body),reasons};const response=await groupCall(f,`participation-groups/${g.id}/admit`,input);
  assert.equal(response.status,200);assert.equal(response.body.replayed,false);return {input,response,review:reviewed.body};
 };
 const put=async(f,id,moduleId,data,status="approved")=>edit(f,async c=>{
  const records=await modules.database.allRecords(c,f.org),record={id,orgId:f.org,moduleId,data,status,ownerId:f.author,lastEditedBy:f.author,revision:4,
   approval:{status:"approved",revision:4,actorId:f.reviewer},snapshot:null,source:null};
  record.data=modules.modules.validateRecord(moduleId,data,{orgId:f.org,recordId:id,status,records:[...records,record],
   ...(moduleId==="volunteers"?{participation:await modules.guards.participationValidationContext(c,f.org)}:{})});
  await modules.database.saveRecord(c,record);return record;
 });
 const intake=async(f,label,{own=false,converted=[]}={})=>{
  if(!f.form){
   f.form=await put(f,"form","forms",{title:"Fictional operational request",kind:"form",version:1,purpose:"Coordinate this fictional occurrence only.",definition:JSON.stringify([{key:"email",label:"Contact email",type:"text",required:true}]),retentionUntil:"2099-12-31",consentRequired:true,anonymous:false},"approved");
  }
  const pub="pub_"+label,id="intake_"+label,kind=f.module==="events"?"event-interest":"volunteer-interest";
  const schema=modules.intake.intakeSchema(f.form,kind),answers=modules.intake.intakeAnswers(schema,{email:f.ownEmail});
  await owner.query("INSERT INTO os_publications(org_id,id,record_id,source_revision,kind,target_id,target_module,target_revision,schema,created_by) VALUES($1,$2,$3,4,$4,$5,$6,4,$7::jsonb,$8)",[f.org,pub,f.form.id,kind,f.target,f.module,JSON.stringify(schema),f.staff]);
  await owner.query("INSERT INTO os_intake(org_id,id,publication_id,answers,consent_at,status,converted_ids) VALUES($1,$2,$3,$4::jsonb,clock_timestamp(),'converted',$5::jsonb)",[f.org,id,pub,JSON.stringify(answers),JSON.stringify(converted)]);
  if(own){
   await owner.query("INSERT INTO os_participant_links(id,org_id,intake_id,publication_id,user_id) VALUES($1,$2,$3,$4,$5)",[digest(f.org+label).slice(0,32),f.org,id,pub,f.own]);
   await owner.query("INSERT INTO os_participant_org_usage(org_id,total) VALUES($1,1)",[f.org]);
  }
  return id;
 };
 for(const name of names){
  const f={name,org:"gb_"+name,staff:"staff_"+name,author:"author_"+name,reviewer:"reviewer_"+name,own:"own_"+name,
   sid:"session_staff_"+name,ownSid:"session_own_"+name,ownEmail:`fixture-${name}@example.invalid`,secret:SECRET,
   module:name==="interval"?"volunteers":"events",target:"source",program:"program",people:[]};
  f.session={session:{id:f.sid},user:{id:f.staff,email:`staff-${name}@example.invalid`,emailVerified:true}};
  f.ownSession={session:{id:f.ownSid},user:{id:f.own,email:f.ownEmail,emailVerified:true}};
  for(const user of [f.staff,f.author,f.reviewer,f.own])await owner.query('INSERT INTO "user"(id,email,"emailVerified") VALUES($1,$2,true)',[user,user+"@example.invalid"]);
  await owner.query('UPDATE "user" SET email=$2 WHERE id=$1',[f.own,f.ownEmail]);
  await owner.query('INSERT INTO "session"(id,"userId","expiresAt") VALUES($1,$2,clock_timestamp()+interval \'48 hours\'),($3,$4,clock_timestamp()+interval \'48 hours\')',[f.sid,f.staff,f.ownSid,f.own]);
  await owner.query("INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional group business fixture',$1,'USD','UTC')",[f.org]);
  await owner.query("INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'admin'),($1,$3,'program_lead'),($1,$4,'program_lead')",[f.org,f.staff,f.author,f.reviewer]);
  await put(f,f.program,"programs",{title:"Fictional program",purpose:"Rehearse actual group atomic commands.",community:"Synthetic software references only.",mechanism:"Bounded local software checks.",evidence:"hypothesis"},"draft");
  const range={startAt:"2099-01-02T09:00:00+00:00",endAt:"2099-01-02T12:00:00+00:00",timeZone:"UTC"};
  await put(f,f.target,f.module,{title:"Fictional occurrence",kind:f.module==="events"?"session":"shift",programId:f.program,...range,capacity:name==="interval"?1:2,
   ...(f.module==="volunteers"?{allowPartialIntervals:true}:{}),participationPurpose:"Coordinate fictional local operations.",participantInstructions:null,organizerEmail:"organizer@example.invalid",organizerUrl:null},f.module==="events"?"scheduled":"open");
  const view=await staffCall(f,f.target);await staffCall(f,f.target+"/adopt",{targetRevision:view.currentSourceRevision,expectedLegacyHash:view.preview.legacyHash,idempotencyKey:key()});
  if(name==="authority")await put(f,"other_program","programs",{title:"Other fictional program",purpose:"Scoped original roster reference.",community:"Synthetic references only.",mechanism:"Exercise whole-roster visibility.",evidence:"hypothesis"},"draft");
  const count=["flow","queue","authority"].includes(name)?3:name==="race"?4:2;
  for(let i=1;i<=count;i++){
   const contact="contact_"+i,booking="booking_"+i;
   await put(f,contact,"contacts",{title:"Fictional contact "+i,kind:"person-reference",displayLabel:"Synthetic reference "+i,relationship:"volunteer",contactPreference:"permission-needed"},"draft");
   await put(f,booking,f.module,{title:"Fictional booking "+i,kind:f.module==="events"?"registration":"assignment",programId:name==="authority"&&i===3?"other_program":f.program,[f.module==="events"?"eventId":"shiftId"]:f.target,contactId:contact});
   const ownIntake=name==="own"&&i===1?await intake(f,"own",{own:true,converted:[{id:booking,moduleId:f.module},{id:contact,moduleId:"contacts"}]}):null;
   const t=await target(f),associated=await staffCall(f,f.target+"/participations",{targetRevision:t.revision,candidateRevision:4,bookingRecordId:booking,intakeId:ownIntake,idempotencyKey:key()});
   const p={id:associated.participation.id,booking,contact,intake:ownIntake};f.people.push(p);
   if(name!=="incomplete"){
    const view=await staffCall(f,f.target),current=(await parts(f)).find(v=>v.id===p.id),clock=await read(f,c=>row(c,sql.sampleStamp));
    const requested=name==="interval"?{version:1,startAt:`2099-01-02T${i===1?"09":"10"}:00:00+00:00`,endAt:`2099-01-02T${i===1?"10":"11"}:00:00+00:00`,timeZone:"UTC"}:null;
    await staffCall(f,`${f.target}/participations/${p.id}/consent`,{revision:current.revision,targetRevision:view.target.revision,sourceRevision:view.currentSourceRevision,termsHash:view.termsHash,requestedInterval:requested,
     consent:true,waitlistAllowed:true,emailUpdates:false,withdrawalAcknowledged:false,method:"fictional-local-software-fixture",evidenceRef:"No human participation is asserted.",consentedAt:clock.at_exact,idempotencyKey:key()});
   }
  }
  if(name==="incomplete")await edit(f,async c=>{
   const records=await modules.database.allRecords(c,f.org),r=records.find(r=>r.id===f.people[1].booking);
   r.revision++;r.status="draft";r.approval=null;r.lastEditedBy=f.author;await modules.database.saveRecord(c,r);
  });
  fixtures.set(name,f);healthy();
 }
 const backup=f=>read(f,async c=>{
  const packet=await modules.workspace.assembleWorkspaceBackup(c,f.org);modules.backup.validateBackup(packet,"fictional_restore_destination",f.staff);
  const native=JSON.stringify(packet),restore=await modules.learning.measureLearningRestoreCapacity(c,packet);
  return {nativeBytes:Buffer.byteLength(native),nativeSha256:digest(native),checksum:packet.checksum,groups:packet.participationGroups?.groups.length??0,restore};
 });
 const seedProof=[];for(const f of fixtures.values())seedProof.push({name:f.name,org:f.org,proof:await backup(f)});
 return {fixtures,seedProof,tools:{key,row,read,edit,observe,groupCall,staffCall,parts,target,receiptRows,create,preview,admit,put,intake,backup,calls,settings}};
}

async function defineBusinessCases({db,owner,modules,sql,fixture,healthy,trace}){
 const {fixtures:F,tools:T}=fixture,definitions=[];
 const fixedReject=async(fn,status,code)=>{
  let caught;try{await fn();}catch(error){caught=error;}
  try{assert(caught);assert.equal(caught.status,status);assert.equal(caught.code,code);}
  catch(error){
   if(Number.isInteger(caught?.status))error.actualStatus=caught.status;
   if(typeof caught?.code==="string"&&/^[A-Za-z0-9_-]{1,64}$/.test(caught.code))error.actualCode=caught.code;
   if(Number.isInteger(status))error.expectedStatus=status;
   error.expectedCode=code;throw error;
  }
  return {status:status??null,code};
 };
 const unchanged=async(f,before)=>assert.deepEqual(await T.observe(f),before);
 const group=f=>T.create(f);
 const frozen=f=>T.read(f,async c=>(await c.query("SELECT id,frozen,requested_interval FROM os_participations WHERE org_id=$1 AND id=ANY($2::text[]) ORDER BY id",[f.org,f.people.map(p=>p.id)])).rows);
 const currentGroup=(f,id)=>T.read(f,c=>modules.store.getGroup(c,f.org,id));
 const proveChildren=async(f,g,input,accepted)=>{
  const hashes=modules.model.groupCommandHashes({orgId:f.org,actorId:f.staff,groupId:g.id,operation:"admit",input});
  const people=await T.parts(f),rows=[];
  for(const item of accepted.selected){
   const childKey=modules.model.deriveGroupChildKey({groupId:g.id,commandHash:hashes.commandHash,operation:"admit",participationId:item.participationId,action:item.action});
   const p=people.find(p=>p.id===item.participationId);assert.equal(p.last_command.intentHash,modules.security.hash({actor:f.staff,action:item.action,key:childKey}));
   assert.equal(p.state,"confirmed");assert.equal(item.resultRevision,p.revision);assert.equal(item.frozenSha256,modules.security.hash(p.frozen));
   assert.equal(item.notificationQueued,true);assert.equal(item.auditRetained,true);rows.push({id:p.id,action:item.action,childKeySha256:digest(childKey),intentHash:p.last_command.intentHash});
  }
  return rows;
 };
 const run=async(index,fn)=>{definitions.push({number:index,name:BUSINESS_CASE_NAMES[index-1],execute:fn});};
 await run(1,async()=>{
  const f=F.get("read"),before=await T.observe(f),response=await T.groupCall(f,"participation-groups?invalid").catch(e=>e);
  // Exercise the exact URL collection separately; the invalid tail is fixed404.
  assert.equal(response.status,404);assert.equal(response.code,"route");
  const collection=await T.groupCall(f,"participation-groups",undefined,{query:"?targetId="+f.target});assert.deepEqual(collection.body,{ok:true,targetId:f.target,groups:[],nextCursor:null});
  const c=await T.read(f,c=>modules.context.readGroupTargetAccess(c,{org:f.org,session:f.session,targetId:f.target}));assert.equal(c.member.role,"admin");
  const denied={session:{id:"nonexistent_session"},user:{id:f.staff}};
  const rejected=await fixedReject(()=>T.groupCall(f,"participation-groups",undefined,{session:denied,query:"?targetId="+f.target}),401,"session");
  await owner.query("UPDATE os_members SET role='board_reader',revision=revision+1 WHERE org_id=$1 AND user_id=$2",[f.org,f.staff]);
  const reader=await fixedReject(()=>T.groupCall(f,"participation-groups",undefined,{query:"?targetId="+f.target}),403,"role");
  await owner.query("UPDATE os_members SET role='admin',revision=revision+1 WHERE org_id=$1 AND user_id=$2",[f.org,f.staff]);
  await unchanged(f,before);return {target:f.target,freshSqlTargetMember:true,rejected,reader,realBetterAuth:false};
 });
 await run(2,async()=>{
  const f=F.get("incomplete"),before=await T.observe(f),g=await group(f),after=await T.observe(f);
  assert.equal(after.counts.os_participation_groups,before.counts.os_participation_groups+1);assert.equal(after.counts.os_participation_group_receipts,before.counts.os_participation_group_receipts+1);
  assert.equal(after.counts.os_participation_outbox,before.counts.os_participation_outbox);assert((await T.parts(f)).every(p=>p.state==="requested"&&p.consent===null));
  const preview=await T.preview(f,g);assert.equal(preview.body.ready,false);assert.equal(preview.body.previewToken,null);
  return {createStatus:g.response.status,groupId:g.id,before,after,backup:await T.backup(f),nonallocating:true};
 });
 let flowGroup,flowReview;
 await run(3,async()=>{
  const f=F.get("flow"),g=await group(f);flowGroup=g;const before=await T.observe(f),all=await T.preview(f,g);
  assert.equal(all.body.ready,false);assert.equal(all.body.previewToken,null);assert.equal(all.body.blockers.length,3);assert(all.body.blockers.every(r=>r.code==="capacity"));
  const ids=f.people.slice(0,2).map(p=>p.id).sort();flowReview=await T.preview(f,g,{mode:"subset",items:ids});assert.equal(flowReview.body.ready,true);assert.equal(typeof flowReview.body.previewToken,"string");
  await unchanged(f,before);return {groupId:g.id,blocked:all.body.blockers,chosen:ids,unselected:flowReview.body.unselectedIds,readonlyNoApplicationWrites:true};
 });
 await run(4,async()=>{
  const f=F.get("flow"),g=flowGroup,input={version:1,selection:flowReview.body.selection,reasons:[],previewToken:flowReview.body.previewToken,reviewSha256:flowReview.body.reviewSha256,idempotencyKey:T.key()};
  const before=await T.observe(f),response=await T.groupCall(f,`participation-groups/${g.id}/admit`,input),after=await T.observe(f);
  assert.equal(response.body.replayed,false);assert.equal(response.body.accepted.groupRevision,2);assert.equal(response.body.accepted.selected.length,2);assert.equal(after.counts.os_participation_group_receipts,before.counts.os_participation_group_receipts+1);
  const people=await T.parts(f);assert.equal(people.filter(p=>p.state==="confirmed").length,2);assert.equal(people.filter(p=>p.state==="requested").length,1);
  const children=await proveChildren(f,g,input,response.body.accepted),outbox=after.tables.os_participation_outbox.map(JSON.parse);
  assert.equal(outbox.length,2);assert(outbox.every(r=>r.state==="paused"&&r.intent_kind==="legacy"&&r.budget_bytes===0));
  const payload=JSON.parse(Buffer.from(input.previewToken.split(".")[0],"base64url"));
  return {groupId:g.id,before,after,children,bodySha256:digest(JSON.stringify(input)),keySha256:digest(input.idempotencyKey),expiresAtExact:payload.expiresAtExact,backup:await T.backup(f),notificationMeansPausedJournal:true};
 });
 await run(5,async()=>{
  const f=F.get("queue"),ordered=[...(await T.parts(f))].sort((a,b)=>a.id>b.id?-1:1);
  for(const p of ordered){
   const view=await T.staffCall(f,f.target),current=(await T.parts(f)).find(row=>row.id===p.id);
   const candidate=await T.read(f,c=>T.row(c,"SELECT revision FROM os_records WHERE org_id=$1 AND id=$2",[f.org,current.booking_record_id]));
   await T.staffCall(f,`${f.target}/participations/${p.id}/waitlist`,{revision:current.revision,targetRevision:view.target.revision,
    candidateRevision:candidate.revision,consentRevision:current.consent.revision,
    ...(current.requested_interval!=null?{allocationHash:current.consent.allocationHash}:{}),idempotencyKey:T.key()});
  }
  const selected=ordered.slice(1).map(p=>p.id).sort(),g=await T.create(f),before=await T.observe(f),noReason=await T.preview(f,g,{mode:"subset",items:selected});
  assert.equal(noReason.body.ready,false);assert(noReason.body.blockers.every(b=>b.code==="bypass-reason"));await unchanged(f,before);
  const reasons=selected.map(participationId=>({participationId,reason:"Explicit fictional queue bypass"})),traceStart=trace.length,accepted=await T.admit(f,g,{mode:"subset",items:selected},reasons);
  const children=await proveChildren(f,g,accepted.input,accepted.response.body.accepted),people=await T.parts(f);assert.equal(people.find(p=>p.id===ordered[0].id).state,"waitlisted");
  const queue=(await T.read(f,c=>c.query("SELECT id,waitlist_sequence::text FROM os_participations WHERE org_id=$1 ORDER BY waitlist_sequence NULLS LAST,created_at,id",[f.org]))).rows;
  const actualOrder=[...new Set(trace.slice(traceStart).filter(r=>r.participationId&&selected.includes(r.participationId)).map(r=>r.participationId))];
  assert.deepEqual(actualOrder,ordered.slice(1).map(p=>p.id));assert.deepEqual(queue.map(p=>p.id),ordered.map(p=>p.id));return {groupId:g.id,queue,children,actualOrder,backendPid:accepted.response.backendPid,actualDomainPromotions:true,backup:await T.backup(f)};
 });
 await run(6,async()=>{
  const f=F.get("interval"),range={startAt:"2099-01-02T09:00:00+00:00",endAt:"2099-01-02T10:00:00+00:00",timeZone:"UTC"};
  await T.put(f,"external_shift","volunteers",{title:"Fictional external managed shift",kind:"shift",programId:f.program,...range,capacity:1,allowPartialIntervals:false,participationPurpose:"Fictional local overlap check.",organizerEmail:"organizer@example.invalid"},"open");
  await T.put(f,"external_booking","volunteers",{title:"Fictional external assignment",kind:"assignment",programId:f.program,shiftId:"external_shift",contactId:f.people[0].contact});
  const externalView=await T.staffCall(f,"external_shift");await T.staffCall(f,"external_shift/adopt",{targetRevision:externalView.currentSourceRevision,expectedLegacyHash:externalView.preview.legacyHash,idempotencyKey:T.key()});
  let external=(await T.staffCall(f,"external_shift/participations",{targetRevision:1,candidateRevision:4,bookingRecordId:"external_booking",intakeId:null,idempotencyKey:T.key()})).participation;
  const current=await T.staffCall(f,"external_shift"),at=await T.read(f,c=>T.row(c,sql.sampleStamp));
  await T.staffCall(f,`external_shift/participations/${external.id}/consent`,{revision:external.revision,targetRevision:1,sourceRevision:4,termsHash:current.termsHash,requestedInterval:null,consent:true,waitlistAllowed:true,emailUpdates:false,withdrawalAcknowledged:false,method:"fictional-local-software-fixture",evidenceRef:"No human participation is asserted.",consentedAt:at.at_exact,idempotencyKey:T.key()});
  external=(await T.parts(f)).find(p=>p.id===external.id);
  await T.staffCall(f,`external_shift/participations/${external.id}/confirm`,{revision:external.revision,targetRevision:1,candidateRevision:4,consentRevision:external.consent.revision,idempotencyKey:T.key()});
  const g=await T.create(f,f.people.map(p=>p.id)),before=await T.observe(f),blocked=await T.preview(f,g);assert.equal(blocked.body.ready,false);assert(blocked.body.blockers.some(b=>b.code==="overlap"));await unchanged(f,before);
  external=(await T.parts(f)).find(p=>p.id===external.id);await T.staffCall(f,`external_shift/participations/${external.id}/cancel`,{revision:external.revision,reason:"Fictional managed-overlap fixture resolved",idempotencyKey:T.key()});
  await T.put(f,"unmanaged_shift","volunteers",{title:"Fictional external unmanaged shift",kind:"shift",programId:f.program,...range,capacity:1,participationPurpose:"Fictional local overlap check.",organizerEmail:"organizer@example.invalid"},"open");
  await T.put(f,"unmanaged_booking","volunteers",{title:"Fictional unmanaged assignment",kind:"assignment",programId:f.program,shiftId:"unmanaged_shift",contactId:f.people[0].contact},"assigned");
  const unmanagedBefore=await T.observe(f),unmanagedBlocked=await T.preview(f,g);assert.equal(unmanagedBlocked.body.ready,false);assert(unmanagedBlocked.body.blockers.some(b=>b.code==="overlap"));await unchanged(f,unmanagedBefore);
  await T.edit(f,async c=>{const records=await modules.database.allRecords(c,f.org),r=records.find(r=>r.id==="unmanaged_booking");r.status="cancelled";r.revision++;r.approval=null;await modules.database.saveRecord(c,r);});
  const accepted=await T.admit(f,g);assert.equal(accepted.response.body.accepted.selected.length,2);
  const saved=await frozen(f);assert(saved.every(p=>p.frozen.interval.version===1));
  // Current editable source data never replaces either saved interval.
  const savedBaseline=await T.observe(f);await T.groupCall(f,`participation-groups/${g.id}`);await unchanged(f,savedBaseline);
  return {groupId:g.id,accepted:accepted.response.body.accepted,saved,managedBlockers:blocked.body.blockers,unmanagedBlockers:unmanagedBlocked.body.blockers,halfOpenAdjacentActualCommands:true,sourceCapacity:1,backup:await T.backup(f)};
 });
 await run(7,async()=>{
  const f=F.get("cancel"),g=await group(f),a=await T.admit(f,g),prior=await T.receiptRows(f,g.id),saved=await frozen(f),id=a.response.body.accepted.selected[0].participationId;
  const preview=await T.groupCall(f,`participation-groups/${g.id}/preview-cancellation`,{version:1,groupRevision:2,selected:[id],reason:"Explicit fictional cancellation"});assert.equal(preview.body.ready,true);
  const input={version:1,selection:preview.body.selection,reasons:[{participationId:id,reason:"Explicit fictional cancellation"}],previewToken:preview.body.previewToken,reviewSha256:preview.body.reviewSha256,idempotencyKey:T.key()};
  const response=await T.groupCall(f,`participation-groups/${g.id}/cancel`,input),receipts=await T.receiptRows(f,g.id);assert.deepEqual(receipts.slice(0,2),prior);assert.equal(receipts.length,3);assert.deepEqual(await frozen(f),saved);
  const before=await T.observe(f),refusal=await fixedReject(()=>T.groupCall(f,`participation-groups/${g.id}/cancel`,{...input,idempotencyKey:T.key()}),409,"participation_group_stale");await unchanged(f,before);
  return {groupId:g.id,accepted:response.body.accepted,priorReceipts:prior,receiptCount:receipts.length,refusal,backup:await T.backup(f)};
 });
 await run(8,async()=>{
  const f=F.get("close"),g=await group(f),input={version:1,groupRevision:1,reason:"Fictional draft closed",idempotencyKey:T.key()};
  const response=await T.groupCall(f,`participation-groups/${g.id}/close`,input),before=await T.observe(f),replay=await T.groupCall(f,`participation-groups/${g.id}/close`,input);assert.deepEqual(replay.body.accepted,response.body.accepted);assert.equal(replay.body.replayed,true);await unchanged(f,before);
  const refusal=await fixedReject(()=>T.groupCall(f,`participation-groups/${g.id}/close`,{...input,idempotencyKey:T.key()}),409,"participation_group_stale");await unchanged(f,before);assert((await T.parts(f)).every(p=>p.state==="requested"));
  return {groupId:g.id,accepted:response.body.accepted,refusal,backup:await T.backup(f)};
 });
 await run(9,async()=>{
  const f=F.get("own"),g=await group(f),a=await T.admit(f,g),person=f.people.find(p=>p.intake),p=(await T.parts(f)).find(p=>p.id===person.id);
  const intake=(await owner.query("SELECT revision FROM os_intake WHERE org_id=$1 AND id=$2",[f.org,person.intake])).rows[0];
  const request=new Request(`https://os.example.invalid/api/participant/orgs/${f.org}/requests/${person.intake}/participations/${p.id}/cancel`,{method:"POST",headers:{"content-type":"application/json","origin":"https://os.example.invalid","x-csrf-token":modules.security.csrf(f.ownSid,f.secret)},body:JSON.stringify({revision:p.revision,intakeRevision:intake.revision,idempotencyKey:T.key()})});
  const own=await modules.participation.participantParticipationRoutes({request,db,settings:T.settings(f),session:f.ownSession});assert.equal(own.status,200);
  // Normal source editing permits completion/unapproval while commitments remain;
  // ordinary cancellation correctly requires resolving every live participation.
  await T.edit(f,async c=>{const records=await modules.database.allRecords(c,f.org),r=records.find(r=>r.id===f.target);r.status="completed";r.approval=null;r.revision++;await modules.database.saveRecord(c,r);});
  const before=await T.observe(f),replay=await T.groupCall(f,`participation-groups/${g.id}/admit`,a.input,{secret:SECRET+"rotated"});
  assert.deepEqual(replay.body.accepted,a.response.body.accepted);assert.equal(replay.body.replayed,true);assert(replay.body.currentDisposition.members.some(m=>m.participationId===p.id&&m.state==="cancelled"));await unchanged(f,before);
  return {groupId:g.id,ownResponse:await own.json(),originalAccepted:a.response.body.accepted,currentDisposition:replay.body.currentDisposition,secretRotationBypassedOnlyForAcceptedReplay:true,backup:await T.backup(f)};
 });
 await run(10,async()=>{
  const f=F.get("collision"),g=await group(f),a=await T.admit(f,g),before=await T.observe(f),id=a.response.body.accepted.selected[0].participationId;
  const changed=await fixedReject(()=>T.groupCall(f,`participation-groups/${g.id}/admit`,{...a.input,reasons:[{participationId:id,reason:"Changed valid reason"}]}),409,"participation_group_intent");
  const otherAction=await fixedReject(()=>T.groupCall(f,`participation-groups/${g.id}/close`,{version:1,groupRevision:1,reason:"Other valid action",idempotencyKey:a.input.idempotencyKey}),409,"participation_group_intent");
  const fresh=await fixedReject(()=>T.groupCall(f,`participation-groups/${g.id}/admit`,{...a.input,idempotencyKey:T.key()}),409,"participation_group_stale");await unchanged(f,before);
  return {groupId:g.id,changed,otherAction,fresh};
 });
 await run(11,async()=>{
  const f=F.get("fault"),g=await group(f),review=await T.preview(f,g),input={version:1,selection:review.body.selection,reasons:[],previewToken:review.body.previewToken,reviewSha256:review.body.reviewSha256,idempotencyKey:T.key()};
  const ids=f.people.map(p=>p.id).sort(),last=ids.at(-1),before=await T.observe(f);
  assert(/^[a-f0-9]{32}$/.test(last));
  const schema=(await owner.query("SELECT current_schema() AS schema")).rows[0].schema;
  const role=(await db.pool.query("SELECT current_user AS role")).rows[0].role;
  assert.equal(schema,fixture.identity.schema);assert.equal(role,"os_test_app");
  await owner.query("CREATE SEQUENCE gb_last_child_witness");await owner.query("GRANT USAGE ON SEQUENCE gb_last_child_witness TO "+quote(role));
  await owner.query("CREATE FUNCTION gb_last_child_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id="+"'"+last+"'"+" AND NEW.state='confirmed' THEN PERFORM nextval('gb_last_child_witness'); RAISE EXCEPTION 'FIXED_LOCAL_LAST_CHILD_FAULT' USING ERRCODE='ZGB01'; END IF; RETURN NEW; END $$");
  await owner.query("CREATE TRIGGER gb_last_child_fault BEFORE UPDATE ON os_participations FOR EACH ROW EXECUTE FUNCTION gb_last_child_fault()");
  let refusal,witness;
  try{refusal=await fixedReject(()=>T.groupCall(f,`participation-groups/${g.id}/admit`,input),undefined,"ZGB01");witness=(await owner.query("SELECT last_value::text,is_called FROM gb_last_child_witness")).rows[0];assert.equal(witness.is_called,true);assert.equal(witness.last_value,"1");await unchanged(f,before);}
  finally{await owner.query("DROP TRIGGER gb_last_child_fault ON os_participations");await owner.query("DROP FUNCTION gb_last_child_fault()");await owner.query("DROP SEQUENCE gb_last_child_witness");}
  return {groupId:g.id,refusal,witness,before,after:await T.observe(f),allActualChildrenAndJournalsRolledBack:true};
 });
 await run(12,async()=>{
  const f=F.get("authority"),g=await group(f),a=await T.admit(f,g,{mode:"subset",items:f.people.slice(0,2).map(p=>p.id).sort()}),rejects=[],baseline=await T.observe(f);
  const oldCreation=(await owner.query("SELECT to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS value FROM os_members WHERE org_id=$1 AND user_id=$2",[f.org,f.staff])).rows[0].value;
  const replay=options=>T.groupCall(f,`participation-groups/${g.id}/admit`,a.input,options);
  await owner.query('UPDATE "session" SET "expiresAt"=clock_timestamp()-interval \'1 microsecond\' WHERE id=$1',[f.sid]);
  rejects.push(await fixedReject(()=>replay(),401,"session"));
  await owner.query('UPDATE "session" SET "expiresAt"=clock_timestamp()+interval \'48 hours\' WHERE id=$1',[f.sid]);
  await owner.query('INSERT INTO "session"(id,"userId","expiresAt") VALUES($1,$2,clock_timestamp()+interval \'48 hours\')',[f.sid+"_replacement",f.staff]);
  rejects.push(await fixedReject(()=>replay({session:{...f.session,session:{id:f.sid+"_replacement"}}}),409,"participation_group_stale"));
  await owner.query("DELETE FROM os_members WHERE org_id=$1 AND user_id=$2",[f.org,f.staff]);rejects.push(await fixedReject(()=>replay(),403,"membership"));
  await owner.query("INSERT INTO os_members(org_id,user_id,role,created_at) VALUES($1,$2,'admin',clock_timestamp())",[f.org,f.staff]);rejects.push(await fixedReject(()=>replay(),409,"participation_group_stale"));
  const newCreation=(await owner.query("SELECT to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS value FROM os_members WHERE org_id=$1 AND user_id=$2",[f.org,f.staff])).rows[0].value;assert.notEqual(newCreation,oldCreation);
  await owner.query("UPDATE os_members SET program_ids='[\"program\"]'::jsonb,revision=revision+1 WHERE org_id=$1 AND user_id=$2",[f.org,f.staff]);
  rejects.push(await fixedReject(()=>replay(),404,"participation_group_unavailable"));
  await owner.query("UPDATE os_members SET program_ids='[]'::jsonb,revision=revision+1 WHERE org_id=$1 AND user_id=$2",[f.org,f.staff]);
  rejects.push(await fixedReject(()=>replay(),409,"participation_group_stale"));
  rejects.push(await fixedReject(()=>T.groupCall(F.get("read"),`participation-groups/${g.id}/admit`,a.input),404,"participation_group_unavailable"));
  await unchanged(f,baseline);return {groupId:g.id,rejects,memberCreationBefore:oldCreation,memberCreationAfter:newCreation,hiddenUnselectedOriginalMember:true,acceptedReceiptPreserved:(await T.receiptRows(f,g.id)).length===2,baseline};
 });
 await run(13,async()=>{
  const f=F.get("restore"),coordinator=await T.intake(f,"coordinator"),g=await T.create(f,undefined,coordinator),a=await T.admit(f,g);
  await owner.query("UPDATE os_intake SET erased_at=clock_timestamp(),answers='{}'::jsonb WHERE org_id=$1 AND id=$2",[f.org,coordinator]);
  const baseline=await T.observe(f),unchangedReplay=await T.groupCall(f,`participation-groups/${g.id}/admit`,a.input);assert.deepEqual(unchangedReplay.body.accepted,a.response.body.accepted);await unchanged(f,baseline);
  const seq=(await owner.query("SELECT pg_get_serial_sequence('os_events','id') AS name")).rows[0].name;assert.equal(seq,fixture.identity.schema+".os_events_id_seq");
  await owner.query("SELECT setval($1::regclass,9007199254740993,false)",[seq]);
  await T.put(f,"unrelated_program","programs",{title:"Unrelated fictional program",purpose:"Unrelated restore control.",community:"No real people.",mechanism:"Exercise epoch scoping.",evidence:"hypothesis"},"draft");
  await T.edit(f,c=>modules.database.audit(c,f.org,f.staff,"record.restored",{id:"unrelated_program",moduleId:"programs"},{fixtureOnly:true}));
  const afterUnrelated=await T.observe(f),stillAccepted=await T.groupCall(f,`participation-groups/${g.id}/admit`,a.input);assert.deepEqual(stillAccepted.body.accepted,a.response.body.accepted);await unchanged(f,afterUnrelated);
  await T.edit(f,c=>modules.database.audit(c,f.org,f.staff,"record.restored",{id:f.target,moduleId:f.module},{fixtureOnly:true}));
  const restored=(await owner.query("SELECT max(id)::text AS id FROM os_events WHERE org_id=$1 AND action='record.restored'",[f.org])).rows[0].id;assert.equal(restored,"9007199254740994");
  const before=await T.observe(f),refusal=await fixedReject(()=>T.groupCall(f,`participation-groups/${g.id}/admit`,a.input),409,"participation_group_stale");await unchanged(f,before);
  return {groupId:g.id,coordinatorErasureDoesNotRevoke:true,unrelatedRestoreDoesNotRevoke:true,chosenRestoredAuditId:restored,refusal,fullRestoreWorkflowClaimed:false};
 });
 await run(14,async()=>{
  const f=F.get("race"),left=await T.create(f,f.people.slice(0,2).map(p=>p.id)),right=await T.create(f,f.people.slice(2).map(p=>p.id));
  const reviews=[await T.preview(f,left),await T.preview(f,right)];assert(reviews.every(r=>r.body.ready));
  const bodies=reviews.map(r=>({version:1,selection:r.body.selection,reasons:[],previewToken:r.body.previewToken,reviewSha256:r.body.reviewSha256,idempotencyKey:T.key()}));
  // Both started promises are always awaited, even when one rejects.
  const settled=await Promise.allSettled([T.groupCall(f,`participation-groups/${left.id}/admit`,bodies[0]),T.groupCall(f,`participation-groups/${right.id}/admit`,bodies[1])]);
  assert.equal(settled.filter(r=>r.status==="fulfilled").length,1);const failed=settled.find(r=>r.status==="rejected").reason;assert.equal(failed.status,409);assert.equal(failed.code,"participation_group_stale");
  const contenders=T.calls.filter(c=>c.org===f.org&&/\/admit$/.test(c.tail));assert.equal(contenders.length,2);assert.equal(new Set(contenders.map(c=>c.backendPid)).size,2);
  const people=await T.parts(f),state=await T.observe(f);assert.equal(people.filter(p=>p.state==="confirmed").length,2);assert.equal(state.counts.os_participation_group_receipts,3);assert.equal(state.counts.os_participation_outbox,2);
  return {groups:[left.id,right.id],contenders,winner:settled.find(r=>r.status==="fulfilled").value.body.accepted,loser:{status:failed.status,code:failed.code},state,bothActualTransactionsSettled:true};
 });
 await run(15,async()=>{
  const f=F.get("loss"),people=await T.parts(f),t=await T.target(f),createInput={version:1,target:{targetId:f.target,targetRevision:t.revision,sourceRevision:4},members:people.map(p=>({participationId:p.id,revision:p.revision})),coordinatorIntakeId:null,idempotencyKey:T.key()};
  const drops=[];let oracle;
  const suppressAfterCommit=async(call)=>{const value=await call();assert(value.committed);oracle=value.body.accepted;drops.push({afterActualCommit:true,status:value.status,acceptedSha256:modules.security.hash(oracle)});const error=new Error("FIXED_LOCAL_RESULT_SUPPRESSION");error.code="LOCAL_RESULT_DROPPED";throw error;};
  await fixedReject(()=>suppressAfterCommit(()=>T.groupCall(f,"participation-groups",createInput)),undefined,"LOCAL_RESULT_DROPPED");
  const afterCreate=await T.observe(f),createOracle=oracle;
  const retry=await T.groupCall(f,"participation-groups",createInput);assert.equal(retry.body.replayed,true);assert.deepEqual(retry.body.accepted,createOracle);await unchanged(f,afterCreate);
  const g={id:retry.body.accepted.groupId},review=await T.preview(f,g),input={version:1,selection:review.body.selection,reasons:[],previewToken:review.body.previewToken,reviewSha256:review.body.reviewSha256,idempotencyKey:T.key()};
  await fixedReject(()=>suppressAfterCommit(()=>T.groupCall(f,`participation-groups/${g.id}/admit`,input)),undefined,"LOCAL_RESULT_DROPPED");
  const afterAdmit=await T.observe(f),admitOracle=oracle;
  const replay=await T.groupCall(f,`participation-groups/${g.id}/admit`,input);assert.equal(replay.body.replayed,true);assert.deepEqual(replay.body.accepted,admitOracle);await unchanged(f,afterAdmit);
  const attempts=T.calls.filter(c=>c.org===f.org&&c.method==="POST"&&!c.tail.includes("preview"));assert.equal(attempts.length,4);
  assert.equal(attempts[0].bodySha256,attempts[1].bodySha256);assert.equal(attempts[2].bodySha256,attempts[3].bodySha256);assert.equal(attempts[2].keySha256,attempts[3].keySha256);
  assert.equal(drops.length,2);return {groupId:g.id,drops,attempts,afterCreate,afterAdmit,accepted:replay.body.accepted,resultSuppressedAfterActualCommit:true,httpSocketDropClaimed:false,automaticRetry:false};
 });
 assert.equal(definitions.length,15);return definitions;
}

export const GROUP_BUSINESS_CASE_MANIFEST=Object.freeze(BUSINESS_CASE_NAMES.map((name,i)=>Object.freeze({id:"BG"+String(i+1).padStart(2,"0"),name})));
export function checkedGroupBusinessCaseId(id,index){
 if(typeof id!=="string"||!Number.isSafeInteger(index)||index<0||index>=15||id!==GROUP_BUSINESS_CASE_MANIFEST[index].id)throw Object.assign(Error("GROUP_BUSINESS_CASE_ORDER"),{code:"GROUP_BUSINESS_CASE_ORDER"});
 return id;
}
const journeys=new WeakMap();
const refuse=()=>{throw Object.assign(Error("GROUP_BUSINESS_CONTRACT"),{code:"GROUP_BUSINESS_CONTRACT"});};
const journeyFor=value=>journeys.get(value)??refuse();
export async function prepareGroupBusinessJourney(handle){
 if(arguments.length!==1)refuse();
 const caps=requireGroupCi17BusinessFixture(handle);caps.healthy();
 const modules=await actualModules(),sql=Object.freeze({sampleStamp:SAMPLE_STAMP_SQL});
 const work=seedBusinessFixtures({db:caps.db,owner:caps.owner,modules,sql,healthy:caps.healthy});caps.track(work);
 const fixture=await work;fixture.identity=caps.identity;
 const definitions=await defineBusinessCases({db:caps.db,owner:caps.owner,modules,sql,fixture,healthy:caps.healthy,trace:caps.trace});
 const token=Object.freeze({format:"group-business-journey",version:1});
 journeys.set(token,{caps,fixture,definitions,next:0,failed:false,active:false,records:[],baselines:[]});return token;
}
export async function runGroupBusinessCase(handle,id){
 if(arguments.length!==2)refuse();const state=journeyFor(handle),item=GROUP_BUSINESS_CASE_MANIFEST[state.next];
 checkedGroupBusinessCaseId(id,state.next);if(state.failed||state.active||!item)refuse();state.caps.healthy();state.active=true;
 const execution=(async()=>{
  const names=["read","incomplete","flow","flow","queue","interval","cancel","close","own","collision","fault","authority","restore","race","loss"];
  const baseline=await state.fixture.tools.observe(state.fixture.fixtures.get(names[state.next]));
  state.baselines.push({id,sha256:baseline.sha256,counts:baseline.counts});
  let value;
  try{value={id,number:state.next+1,name:item.name,status:"PASS",detail:await state.definitions[state.next].execute()};}
  catch(error){state.failed=true;value={id,number:state.next+1,name:item.name,status:"FAIL",expectedFailureWasNotAccepted:true,errorCode:typeof error?.code==="string"&&/^[A-Za-z0-9_]{1,64}$/.test(error.code)?error.code:"UNCLASSIFIED",diagnostic:failureDiagnostics(error)};state.records.push(value);throw error;}
  state.records.push(value);state.next++;state.caps.healthy();return Object.freeze({id,name:item.name,status:value.status,detailSha256:digest(JSON.stringify(value.detail))});
 })();state.caps.track(execution);
 try{return await execution;}catch(error){state.failed=true;throw error;}finally{state.active=false;}
}
export function readGroupBusinessEvidence(handle){
 const s=journeyFor(handle);
 return Object.freeze({format:"group-business-cases",version:1,tests:15,pass:s.records.filter(r=>r.status==="PASS").length,fail:s.records.filter(r=>r.status==="FAIL").length,
  next:s.next,failed:s.failed,active:s.active,baselines:structuredClone(s.baselines),cases:s.records.map(r=>r.status==="PASS"?{id:r.id,name:r.name,status:r.status,detailSha256:digest(JSON.stringify(r.detail))}:structuredClone(r)),
  providerCalls:s.caps.providerCalls(),actualDatabaseTransactions:true,actualContextDomainQueueAuditCapacity:true,syntheticSoftwareActorsNotRealBetterAuthOrHumans:true,actualHttpSocketDrop:false,bg16Excluded:true});
}
