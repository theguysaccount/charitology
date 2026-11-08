/** Actual leaf/context/store/DTO/review helpers over closed fake SELECTs.
 * No main handler, real authentication, transaction, PG or booking execution. */
import test from "node:test";
import assert from "node:assert/strict";
import { participationGroupReadRoutes, GROUP_COLLECTION_SQL } from "../lib/participation-group-read-routes.mjs";
import { GROUP_CONTEXT_SQL as SQL } from "../lib/participation-group-context.mjs";
import { projectGroupHistory } from "../lib/participation-group-model.mjs";
import { verifyGroupPreview } from "../lib/participation-group-preview.mjs";
import { participationTerms } from "../lib/participation.mjs";
import { hash } from "../lib/security.mjs";
import { ORG, SHA, stamp, session, result, fixture } from "./fixtures/group-context.mjs";

const secret="fictional-read-route-signing-secret-".repeat(3);
const admission=(selection={mode:"all",items:[]})=>({version:1,groupRevision:1,selection,reasons:[]});
const url=(tail,query="")=>new URL(`https://os.example.invalid/api/orgs/${ORG}/${tail}${query}`);
const invoke=(f,tail="participation-groups",options={})=>participationGroupReadRoutes({
  c:f.c,org:ORG,session:session(),tail,method:"GET",settings:{secret},url:url(tail),...options,
});
const status=n=>error=>error.status===n;
const snapshot=f=>JSON.stringify({tables:Object.fromEntries(Object.entries(f.tables).map(([table,rows])=>[table,[...rows]])),groups:[...f.groups]});
const noWrites=f=>assert(!f.calls.some(c=>/^(INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)|FOR UPDATE|FOR SHARE/.test(c.sql)));
const response=async value=>{assert.equal(value.status,200);assert.equal(value.headers.get("referrer-policy"),"no-referrer");return value.json();};
function groups(f,count){
  f.groups.clear();for(let i=1;i<=count;i++)f.addGroup("g"+String(i).padStart(3,"0"));
  const commands=[...f.groups.values()].flatMap(g=>g.receipts.map(r=>r.commandHash));
  assert.equal(new Set(commands).size,commands.length);assert(commands.every(v=>/^[a-f0-9]{64}$/.test(v)));
}
function admitted(f){
  const g=f.groups.get("group_1"),terms=participationTerms({id:f.source.id,orgId:ORG,moduleId:f.source.module_id,data:f.source.data});
  const value=structuredClone(f.receipt);Object.assign(value,{operation:"admit",commandHash:hash({fixture:"leaf-read",groupId:g.row.id,step:2}),reviewSha256:SHA});
  value.result={groupId:g.row.id,groupRevision:2,state:"admitted",selectionMode:"all",selected:["p1","p2"].map(participationId=>({participationId,
    action:"confirm",resultRevision:4,state:"confirmed",frozenSha256:SHA,allocationHash:null,notificationQueued:false,auditRetained:false})),unselectedIds:[],reasonHashes:[],auditRetained:false};
  g.receipts.push(value);Object.assign(g.row,{state:"admitted",revision:2,last_command_hash:value.commandHash});
  for(const p of [f.p1,f.p2])Object.assign(p,{state:"confirmed",revision:4,frozen:{terms,termsHash:hash(terms),sourceRevision:4}});
  return g;
}
function tokenPayload(review){
  assert.equal(typeof review.previewToken,"string");const payload=JSON.parse(Buffer.from(review.previewToken.split(".")[0],"base64url"));
  const bindings={...payload};for(const key of ["format","version","issuedAtExact","expiresAtExact"])delete bindings[key];
  assert.deepEqual(verifyGroupPreview(review.previewToken,secret,{nowExact:stamp,bindings}),payload);
  return payload;
}

test("empty target collection still proves fresh actual target/session/member access",async()=>{
  const f=fixture();f.groups.clear();f.tables.os_participations.clear();f.source.approval=null;f.source.status="cancelled";
  const before=snapshot(f),body=await response(await invoke(f,undefined,{url:url("participation-groups","?targetId=target")}));
  assert.deepEqual(body,{ok:true,targetId:"target",groups:[],nextCursor:null});assert.equal(snapshot(f),before);
  assert(f.calls.some(c=>c.sql.startsWith('SELECT s.id AS session_id')));assert(f.calls.some(c=>c.sql===SQL.targetSeed));
  assert(f.calls.some(c=>c.sql===GROUP_COLLECTION_SQL));noWrites(f);
  const denied=fixture();denied.groups.clear();denied.missingSession=true;
  await assert.rejects(invoke(denied,undefined,{url:url("participation-groups","?targetId=target")}),status(401));
  assert(!denied.calls.some(c=>c.sql===GROUP_COLLECTION_SQL));
});

test("21 completely visible groups paginate20 using only the last visible group ID",async()=>{
  const f=fixture();groups(f,21);const before=snapshot(f);
  const first=await response(await invoke(f,undefined,{url:url("participation-groups","?targetId=target")}));
  assert.deepEqual(Object.keys(first).sort(),["groups","nextCursor","ok","targetId"]);
  assert.deepEqual(first.groups.map(g=>g.groupId),Array.from({length:20},(_,i)=>"g"+String(i+1).padStart(3,"0")));
  assert(first.groups.every(g=>g.rosterCount===2));assert.equal(first.nextCursor,"g020");
  assert.equal(f.calls.filter(c=>c.sql.startsWith('SELECT s.id AS session_id')).length,22);
  const second=await response(await invoke(f,undefined,{url:url("participation-groups","?targetId=target&cursor=g020")}));
  assert.deepEqual(second.groups,[{groupId:"g021",groupRevision:1,state:"draft",rosterCount:2}]);assert.equal(second.nextCursor,null);
  assert(f.calls.filter(c=>c.sql===GROUP_COLLECTION_SQL).every(c=>c.args[0]===ORG&&c.args[1]==="target"));
  assert.equal(snapshot(f),before);noWrites(f);
});

test("one hidden member conceals the entire group and never supplies a hidden cursor or total",async()=>{
  const f=fixture();groups(f,24);f.person("private_person");f.member.role="program_lead";f.member.program_ids=["visible_program"];
  for(const row of f.tables.os_records.values())row.data.programId="visible_program";
  f.record("visible_program","programs",{title:"Visible program",kind:"program"});
  f.record("hidden_program","programs",{title:"Private program",kind:"program"});
  f.tables.os_records.get("private_person_booking").data.programId="hidden_program";
  for(const id of ["g005","g015","g021"])f.addGroup(id,["p1","private_person"]);
  const first=await response(await invoke(f,undefined,{url:url("participation-groups","?targetId=target")}));
  assert.equal(first.groups.length,20);assert.equal(first.nextCursor,"g023");
  const literal=JSON.stringify(first);for(const hidden of ["g005","g015","g021","private_person","hidden_program","Private program"])assert(!literal.includes(hidden));
  assert(!Object.hasOwn(first,"total"));assert(!Object.hasOwn(first,"scanned"));
  const next=await response(await invoke(f,undefined,{url:url("participation-groups","?targetId=target&cursor=g023")}));
  assert.deepEqual(next.groups.map(g=>g.groupId),["g024"]);assert.equal(next.nextCursor,null);
  await assert.rejects(invoke(f,"participation-groups/g005"),status(404));noWrites(f);
});

test("access loss or an unexpected SQL error during scanning stops the whole response",async()=>{
  const lost=fixture();groups(lost,3);let sessions=0;const original=lost.c.query;
  lost.c.query=async(sql,args)=>{
    if(sql.startsWith('SELECT s.id AS session_id')&&++sessions===3)return result([]);
    return original(sql,args);
  };
  await assert.rejects(invoke(lost,undefined,{url:url("participation-groups","?targetId=target")}),status(401));
  const broken=fixture();groups(broken,2);const query=broken.c.query,failure=new Error("Fictional driver error");
  broken.c.query=(sql,args)=>{if(sql===SQL.groupSeed&&args[1]==="g002")throw failure;return query(sql,args);};
  await assert.rejects(invoke(broken,undefined,{url:url("participation-groups","?targetId=target")}),e=>e===failure);
  noWrites(lost);noWrites(broken);
});

test("live detail is a complete fresh DTO; unavailable roster identities produce no partial view",async()=>{
  const f=fixture();f.tables.os_records.get("p1_contact").data.title="Literal\tfictional\nreference";
  const before=snapshot(f),body=await response(await invoke(f,"participation-groups/group_1"));
  assert.deepEqual(body,{ok:true,targetId:"target",group:{groupId:"group_1",groupRevision:1,state:"draft",originMode:"live",coordinatorIntakeId:null,
    roster:[{participationId:"p1",label:"Literal fictional reference",revision:3,state:"requested",admitted:false},
      {participationId:"p2",label:"Fictional contact",revision:3,state:"requested",admitted:false}]}});
  assert.equal(snapshot(f),before);for(const privateKey of ["authority","membershipSha256","contact_id","booking_record_id","receipts","frozen"])assert(!JSON.stringify(body).includes(privateKey));
  f.tables.os_records.delete("p2_contact");await assert.rejects(invoke(f,"participation-groups/group_1"),status(404));noWrites(f);
});

test("recovered detail is opaque and administrator-only, without loading missing live identities",async()=>{
  const f=fixture(),g=f.groups.get("group_1"),history=projectGroupHistory({originOrgId:"fictional_historical_org",receipts:g.receipts});
  Object.assign(g.row,{origin_mode:"recovered",state:"archived",revision:1,live_target_id:null,roster_ids:[],coordinator_intake_id:null,last_command_hash:null,history});g.receipts=[];
  f.tables.os_records.clear();f.tables.os_participations.clear();
  const body=await response(await invoke(f,"participation-groups/group_1"));
  assert.deepEqual(body,{ok:true,targetId:"target",group:{groupId:"group_1",groupRevision:1,state:"archived",originMode:"recovered",coordinatorIntakeId:null,roster:[]}});
  assert(!JSON.stringify(body).includes("p1"));assert(!f.calls.some(c=>c.sql===SQL.selectedRecords||c.sql===SQL.roster||c.sql.startsWith("SELECT to_jsonb")));
  f.member.role="contributor";await assert.rejects(invoke(f,"participation-groups/group_1"),status(404));noWrites(f);
});

test("actual readonly preview blocks all three at capacity two and signs only the deliberate proper subset",async()=>{
  const f=fixture();f.person("p3");f.group.roster_ids=["p1","p2","p3"];f.receipt.result.rosterIds=["p1","p2","p3"];
  const tail="participation-groups/group_1/preview-admission",before=snapshot(f);
  const all=await response(await invoke(f,tail,{method:"POST",input:admission()}));
  assert.equal(all.ready,false);assert.deepEqual(all.selectedIds,["p1","p2","p3"]);assert.deepEqual(all.unselectedIds,[]);
  assert.deepEqual(all.blockers,["p1","p2","p3"].map(participationId=>({participationId,code:"capacity"})));
  assert.equal(all.previewToken,null);assert.equal(all.reviewSha256,null);assert.equal(all.expiresAtExact,null);assert.equal(snapshot(f),before);
  const subset=await response(await invoke(f,tail,{method:"POST",input:admission({mode:"subset",items:["p2","p1"]})}));
  assert.equal(subset.ready,true);assert.deepEqual(subset.selectedIds,["p1","p2"]);assert.deepEqual(subset.unselectedIds,["p3"]);
  const payload=tokenPayload(subset);assert.equal(payload.orgId,ORG);assert.equal(payload.groupId,"group_1");assert.equal(payload.groupRevision,1);assert.equal(payload.operation,"admit");
  assert.equal(payload.reviewSha256,subset.reviewSha256);assert.equal(payload.expiresAtExact,"2026-11-08T12:10:00.123456Z");
  assert(!Object.hasOwn(subset,"steps"));assert(!Object.hasOwn(subset,"inventory"));assert(!Object.hasOwn(subset,"authority"));
  assert.equal(snapshot(f),before);assert(f.calls.some(c=>c.sql===SQL.parts));noWrites(f);
});

test("cancellation review uses accepted membership/current confirmation without NEW admission inventory or source policy",async()=>{
  const f=fixture();admitted(f);f.source.status="cancelled";f.source.approval=null;f.source.data.startAt="invalid-current-source";
  f.t.mode="paused";f.t.recovery_block=true;f.p1.consent=null;f.p2.consent=null;
  const tail="participation-groups/group_1/preview-cancellation",before=snapshot(f);
  const body=await response(await invoke(f,tail,{method:"POST",input:{version:1,groupRevision:2,selected:["p2"],reason:"Explicit fictional cancellation"}}));
  assert.equal(body.ready,true);assert.deepEqual(body.selectedIds,["p2"]);assert.equal(tokenPayload(body).operation,"cancel");
  assert(!f.calls.some(c=>[SQL.records,SQL.parts,SQL.queue,SQL.targets,SQL.partBudget,SQL.recordBudget].includes(c.sql)));
  assert.equal(f.calls.filter(c=>c.sql.startsWith("WITH moment AS MATERIALIZED")).length,1);assert.equal(snapshot(f),before);noWrites(f);
});

test("URL query grammar rejects duplicate/unknown/private and wrong transport path fields before SQL",async()=>{
  for(const query of ["?targetId=target&targetId=target","?targetId=target&cursor=g1&cursor=g2","?targetId=target&token=private",
    "?targetId=target&skip=true","?targetId=target&path=wrong","?targetId=target&path=wrong&path=wrong","?targetId=target&cursor=%2Fbad","?targetId=%74arget%2F"]){
    const f=fixture();await assert.rejects(invoke(f,undefined,{url:url("participation-groups",query)}),status(400));assert.equal(f.calls.length,0);
  }
  for(const tail of ["participation-groups/group_1","participation-groups/group_1/preview-admission"]){
    const f=fixture();await assert.rejects(invoke(f,tail,{method:tail.endsWith("preview-admission")?"POST":"GET",url:url(tail,"?cursor=g1"),input:admission()}),status(400));assert.equal(f.calls.length,0);
  }
  const f=fixture();const address=url("participation-groups","?targetId=target");address.searchParams.set("path",address.pathname.slice("/api/".length));
  const allowed=await response(await invoke(f,undefined,{url:address}));assert.equal(allowed.targetId,"target");noWrites(f);
});

test("HEAD and unsupported methods return405 before queries; malformed feature paths return404",async()=>{
  for(const tail of ["participation-groups","participation-groups/group_1","participation-groups/group_1/preview-admission"])
    for(const method of ["HEAD","PUT","PATCH","DELETE","OPTIONS","TRACE"]){
      const f=fixture();await assert.rejects(invoke(f,tail,{method,url:url(tail,"?unknown=1")}),status(405));assert.equal(f.calls.length,0);
    }
  for(const tail of ["participation-groups/","participation-groups/%67roup_1","participation-groups/group_1/extra",
    "participation-groups/group_1/preview-admission/","participation-groups//group_1","participation-groups/"+"x".repeat(101)]){
    const f=fixture();await assert.rejects(invoke(f,tail),status(404));assert.equal(f.calls.length,0);
  }
});

test("known write commands hand off with null and never return accepted/dry-run success",async()=>{
  const f=fixture();for(const tail of ["participation-groups","participation-groups/group_1/admit","participation-groups/group_1/cancel","participation-groups/group_1/close"])
    assert.equal(await invoke(f,tail,{method:"POST",input:{clientInventedAuthority:true},url:url(tail,"?write=coordinator-duty")}),null);
  assert.equal(await invoke(f,"ordinary-other-module"),null);assert.equal(f.calls.length,0);
  await assert.rejects(invoke(f,"participation-groups/group_1",{method:"POST"}),status(405));assert.equal(f.calls.length,0);
});

test("malformed collection identity/order or a family cap contradiction refuses instead of publishing a partial page",async()=>{
  for(const rows of [[{id:"g2"},{id:"g1"}],[{id:"g1"},{id:"g1"}],[{id:"g1",hiddenCount:3}],Array.from({length:101},(_,n)=>({id:"g"+String(n).padStart(3,"0")}))]){
    const f=fixture(),query=f.c.query;f.c.query=(sql,args)=>sql===GROUP_COLLECTION_SQL?Promise.resolve(result(rows)):query(sql,args);
    await assert.rejects(invoke(f,undefined,{url:url("participation-groups","?targetId=target")}),status(409));
    assert(!f.calls.some(c=>c.sql===SQL.groupSeed));noWrites(f);
  }
});
