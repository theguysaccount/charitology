import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { getMigrations } from "better-auth/db/migration";
import { magicLink } from "better-auth/plugins/magic-link";
import { database, logicalBackupBytes } from "../lib/database.mjs";
import { authentication } from "../lib/auth.mjs";
import { createHandler } from "../lib/handler.mjs";
import { applicationGrantsSql } from "../lib/migration-grants.mjs";
import { validateRecord } from "../lib/modules.mjs";
import { hash, stable } from "../lib/security.mjs";
import { directoryCatalog, headDirectoryEntries, directoryEntrySha256 } from "../lib/directory-catalog.mjs";
import { directoryPayloadBytes, directoryTableUsage, insertDirectoryRow } from "../lib/directory-resource-store.mjs";

const configured=!!(process.env.DATABASE_URL&&process.env.OS_DATABASE_URL),quote=v=>'"'+v.replaceAll('"','""')+'"';
const direct=v=>{const u=new URL(v);u.hostname=u.hostname.replace(/-pooler(?=\.)/,"");return u.toString();};
const clone=v=>JSON.parse(JSON.stringify(v));

test("real Better Auth and constrained PostgreSQL retained directory reviews",{skip:configured?false:"Private owner/constrained URLs are required for an isolated schema.",timeout:1200000},async t=>{
 const suffix=randomBytes(7).toString("hex"),schema="os_directory_bridge_"+suffix,owner=database(process.env.DATABASE_URL);
 let migration,db,handle;
 const settings={origin:"http://localhost:4381",secret:"fictional-directory-secret-at-least-thirty-two-characters",encryptionKey:"fictional-unused-directory-encryption-key",production:false},sent=[];
 const send=async(message)=>{assert.ok(String(message.to).endsWith("@example.invalid"));assert.equal(message.purpose,"login","The bridge must never send non-login mail.");sent.push(message);return {accepted:true};};
 const p=(org,tail)=>`/api/orgs/${org}/directory-resources/${tail}`,r=(org,id)=>`/api/orgs/${org}/modules/resources/records/${id}`;
 let ipCounter=20;
 async function call(actor,path,{method="GET",body,raw,expect=200,headers={}}={}){
  const h=new Headers(headers);h.set("x-forwarded-for",actor?.ip||"192.0.2.1");if(actor?.cookie)h.set("cookie",actor.cookie);
  if(method!=="GET"){h.set("origin",settings.origin);if(actor?.csrf)h.set("x-csrf-token",actor.csrf);h.set("content-type","application/json");}
  const response=await handle(new Request(settings.origin+path,{method,headers:h,...(method!=="GET"?{body:raw??JSON.stringify(body??{})}:{}),...(raw instanceof ReadableStream?{duplex:"half"}:{})}));
  const value=(response.headers.get("content-type")||"").includes("json")?await response.json():await response.text();
  if(expect!==null)assert.equal(response.status,expect,`${method} ${path.split("?")[0]} HTTP${response.status} ${value?.code||""} ${value?.message||""}`);
  return {response,value};
 }
 async function signIn(label){
  const email=`directory-${label}-${suffix}@example.invalid`,ip=`192.0.2.${++ipCounter}`;
  await call({ip},"/api/auth/request-link",{method:"POST",body:{email}});
  const message=sent.findLast(v=>v.to===email);assert.ok(message);const url=new URL(message.url),token=url.searchParams.get("token");assert.ok(token);
  const before=Number((await migration.pool.query('SELECT count(*) FROM "session" s JOIN "user" u ON s."userId"=u.id WHERE u.email=$1',[email])).rows[0].count);
  await call({ip},url.pathname+url.search);assert.equal(Number((await migration.pool.query('SELECT count(*) FROM "session" s JOIN "user" u ON s."userId"=u.id WHERE u.email=$1',[email])).rows[0].count),before,"A mail scanner GET never authenticates.");
  const response=await handle(new Request(settings.origin+"/auth/confirm",{method:"POST",headers:{origin:"null","x-forwarded-for":ip,"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({token}).toString()}));
  assert.ok([302,303].includes(response.status));const cookies=response.headers.getSetCookie();assert.ok(cookies.some(v=>/httponly/i.test(v)));
  const actor={cookie:cookies.map(v=>v.split(";")[0]).join("; "),ip};const session=(await call(actor,"/api/session")).value;assert.equal(session.user.email,email);assert.equal((await migration.pool.query('SELECT "emailVerified" FROM "user" WHERE id=$1',[session.user.id])).rows[0].emailVerified,true);Object.assign(actor,{id:session.user.id,csrf:session.csrfToken});assert.ok(actor.csrf);return actor;
 }
 async function org(actor,name){return (await call(actor,"/api/orgs",{method:"POST",body:{name,currency:"USD",timeZone:"UTC"}})).value.org.id;}
 const selection=(index=0)=>{const e=headDirectoryEntries("tools")[index],c=directoryCatalog.captures.at(-1);return {captureId:c.captureId,catalogKind:e.catalogKind,listingId:e.listing.id,entrySha256:directoryEntrySha256(e)};};
 const copy=(index=0)=>({intent:"copy",selection:selection(index),acceptHistoricalVersion:false,target:null,copiedFields:["title","catalogUrl","sourceUrl"],sourceChoice:null,limitations:{kind:"replace-all",adoptionNotes:null},assessment:null});
 const preview=async(a,o,proposal,expect=200)=>(await call(a,p(o,"preview"),{method:"POST",body:proposal,expect})).value;
 const commit=async(a,o,proposal,ready,key=randomUUID(),expect=200)=>(await call(a,p(o,"commit"),{method:"POST",body:{previewToken:ready.previewToken,commandKey:key,proposal},expect})).value;
 const panel=async(a,o,id)=>(await call(a,p(o,"records/"+id))).value;
 const recheck=(record,head,more={})=>({...copy(),intent:"recheck",target:{recordId:record.id,revision:record.revision,historyHeadSha256:head},copiedFields:[],limitations:{kind:"keep-current"},...more});
 let a,b,contributor,reader,external,admin,orgA,orgB,record,head,initial,accepted,key,approvedSnapshot;
 const tx=(fn,organization=orgA,user=a?.id)=>db.tx(user,organization,fn,{lock:true});
 try{
  await owner.pool.query(`CREATE SCHEMA ${quote(schema)}`);migration=database(direct(process.env.DATABASE_URL),{schema});
  assert.equal((await migration.pool.query("SELECT current_schema() AS schema")).rows[0].schema,schema);
  const migrations=await getMigrations({database:migration.pool,rateLimit:{enabled:true,storage:"database"},plugins:[magicLink({storeToken:"hashed",sendMagicLink:async()=>{}})],logger:{disabled:true}});
  assert.doesNotMatch(await migrations.compileMigrations(),/(?:"public"\s*\.|\bpublic\s*\.)/i);await migrations.runMigrations();await migration.migrate();
  const role=decodeURIComponent(new URL(process.env.OS_DATABASE_URL).username);assert.notEqual(role,decodeURIComponent(new URL(process.env.DATABASE_URL).username));
  await migration.pool.query(applicationGrantsSql(role,schema));db=database(direct(process.env.OS_DATABASE_URL),{schema});
  const auth=authentication({settings,db,send});handle=createHandler({settings,db,auth,send});
  await t.test("actual deliberate magic-link sessions, two organizations and fictional role fixtures",async()=>{
   a=await signIn("owner-a");b=await signIn("owner-b");contributor=await signIn("contributor");reader=await signIn("board");external=await signIn("external");admin=await signIn("admin");
   orgA=await org(a,"Fictional directory organization A");orgB=await org(b,"Fictional directory organization B");
   // Fixture assistance creates memberships only after each actual verified auth session.
   await tx(async c=>{for(const [actor,role]of[[contributor,"contributor"],[reader,"board_reader"],[external,"external_reviewer"],[admin,"admin"]])await c.query("INSERT INTO os_members(org_id,user_id,role,program_ids) VALUES($1,$2,$3,$4)",[orgA,actor.id,role,JSON.stringify(role==="contributor"?["fictional-different-program"]:[])]);});
   const info=(await db.pool.query("SELECT r.rolsuper,r.rolbypassrls FROM pg_roles r WHERE rolname=current_user")).rows[0];assert.deepEqual(info,{rolsuper:false,rolbypassrls:false});
   const table=(await migration.pool.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass",[schema+".os_resource_directory_history"])).rows[0];assert.deepEqual(table,{relrowsecurity:true,relforcerowsecurity:true});
   assert.equal((await call(a,"/api/modules")).value.modules.length,26);assert.equal((await call(null,"/api/directory-resources/catalogs",{expect:401})).response.status,401);
  });assert.ok(a&&b&&orgA&&orgB);
  await t.test("signed-in catalogs return retained entries and exact source selection",async()=>{
   const catalogs=(await call(a,"/api/directory-resources/catalogs")).value;assert.equal(catalogs.captures.length,1);const s=selection();const entry=(await call(a,`/api/directory-resources/catalogs/${s.captureId}/${s.catalogKind}/${s.listingId}`)).value;assert.deepEqual(entry.selection,s);assert.equal(entry.comparison.editorialReview,"draft");assert.equal(entry.comparison.checkedAgeDays,null===entry.entry.listing.checked?null:entry.comparison.checkedAgeDays);
   await call(a,"/api/directory-resources/catalogs?cursor=bad",{expect:422});await call(a,"/api/directory-resources/catalogs?unknown=1",{expect:422});
  });
  await t.test("streaming reader rejects decoded duplicate names, invalid UTF-8, BOM, depth and actual size before generic intake",async()=>{
   for(const raw of ['{"intent":"copy","\\u0069ntent":"copy"}','\ufeff{}','{"a":{"b":{"c":{"d":{"e":{"f":{"g":{"h":1}}}}}}}}'])await call(a,p(orgA,"preview"),{method:"POST",raw,expect:422});
   await call(a,p(orgA,"preview"),{method:"POST",raw:Buffer.from([123,34,120,34,58,34,0xff,34,125]),expect:422});
   let cancelled=false;const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(20000).fill(32));controller.enqueue(new Uint8Array(20000).fill(32));},cancel(){cancelled=true;}});await call(a,p(orgA,"preview"),{method:"POST",raw:stream,expect:413});assert.equal(cancelled,true);
  });
  await t.test("organization-wide scoped contributor copy creates exactly eleven defaults and immutable receipt without provider inference",async()=>{
   initial=copy();const ready=await preview(contributor,orgA,initial);assert.equal(ready.kind,"ready");key=randomUUID();accepted=await commit(contributor,orgA,initial,ready,key);record=accepted.disposition.record;head=accepted.historyHeadSha256;
   assert.equal(accepted.kind,"copied");assert.equal(accepted.auditRecorded,true);assert.equal(Object.keys(record.data).length,11);assert.equal(record.status,"discovered");assert.equal(record.data.eligibility,"unknown");for(const field of["providerName","sourceUrl","cost","reviewedDate","renewalDate","confirmationReference"])assert.equal(record.data[field],null);assert.equal(record.approval,null);assert.equal(record.snapshot,null);assert.equal(record.ownerId,contributor.id);
   const rows=await tx(c=>c.query("SELECT row_kind,origin_mode,command_hash,request_hash,actor_binding_hash,budget_bytes,octet_length(payload::text) AS payload_bytes,octet_length(to_jsonb(t)::text) AS actual FROM os_resource_directory_history t WHERE org_id=$1",[orgA]));assert.equal(rows.rowCount,2);for(const row of rows.rows){assert.equal(Number(row.budget_bytes),row.payload_bytes+4096);assert.ok(row.actual<=row.budget_bytes);}assert.equal(rows.rows.find(v=>v.row_kind==="event").command_hash.length,64);
   const replay=await commit(contributor,orgA,initial,ready,key);assert.equal(replay.kind,"existing");assert.equal(replay.disposition.record.id,record.id);assert.equal((await tx(c=>c.query("SELECT count(*) FROM os_resource_directory_history WHERE org_id=$1",[orgA]))).rows[0].count,"2");
   await commit(contributor,orgA,{...initial,sourceChoice:{kind:"listing-url"}},ready,key,409);
   assert.equal((await preview(a,orgA,copy())).kind,"existing");await preview(b,orgA,copy(),403);
  });assert.ok(record&&head);
  await t.test("copy proof cannot select another existing binding or altered source choice",async()=>{
   const proposal=copy(6),ready=await preview(a,orgA,proposal);
   await commit(a,orgA,copy(),ready,randomUUID(),409);
   const existingCopy=copy();existingCopy.sourceChoice={kind:"listing-url"};await commit(a,orgA,existingCopy,ready,randomUUID(),409);
   const fresh=copy(5),own=await preview(a,orgA,fresh);await commit(a,orgA,fresh,own);await commit(a,orgA,{...fresh,sourceChoice:{kind:"listing-url"}},own,randomUUID(),409);
  });
  await t.test("exact raw proposal MAC distinguishes admitted equivalent URLs and normalized notes before any write",async()=>{
   const proposal=copy(6);proposal.sourceChoice={kind:"listing-url"};const chosen=headDirectoryEntries("tools")[6];assert.equal(chosen.listing.url,chosen.listing.sources[0].url);
   const ready=await preview(a,orgA,proposal),altered={...proposal,sourceChoice:{kind:"source",index:0}},before=(await tx(c=>c.query("SELECT count(*) FROM os_resource_directory_history WHERE org_id=$1",[orgA]))).rows[0].count;
   await commit(a,orgA,altered,ready,randomUUID(),409);assert.equal((await tx(c=>c.query("SELECT count(*) FROM os_resource_directory_history WHERE org_id=$1",[orgA]))).rows[0].count,before);
   const result=await commit(a,orgA,proposal,ready);assert.equal(result.kind,"copied");assert.deepEqual((await panel(a,orgA,result.disposition.record.id)).binding.headEvent.packet.sourceChoice,{kind:"listing-url"});
   const noteProposal=recheck(result.disposition.record,result.historyHeadSha256,{selection:proposal.selection,limitations:{kind:"replace-all",adoptionNotes:"  Exact private note  "}}),noteReady=await preview(a,orgA,noteProposal);await commit(a,orgA,{...noteProposal,limitations:{kind:"replace-all",adoptionNotes:"Exact private note"}},noteReady,randomUUID(),409);assert.equal((await commit(a,orgA,noteProposal,noteReady)).kind,"rechecked");
  });
  await t.test("all actual staff role memberships can review organization-wide sources without a fictitious program scope",async()=>{
   for(const role of["program_lead","grants_lead","finance_reviewer"]){await tx(c=>c.query("UPDATE os_members SET role=$3,revision=revision+1 WHERE org_id=$1 AND user_id=$2",[orgA,admin.id,role]));assert.equal((await preview(admin,orgA,copy(9))).kind,"ready");}
   await tx(c=>c.query("UPDATE os_members SET role='admin',revision=revision+1 WHERE org_id=$1 AND user_id=$2",[orgA,admin.id]));
  });
  await t.test("all reader roles retain snapshot-only visibility and no bridge history, contributors cannot independently approve",async()=>{
   for(const actor of[reader,external]){await call(actor,p(orgA,"records/"+record.id),{expect:403});await preview(actor,orgA,copy(1),403);await call(actor,r(orgA,record.id),{expect:404});}
   await call(contributor,r(orgA,record.id)+"/approve",{method:"POST",body:{revision:record.revision,reason:"Cannot approve own copy"},expect:403});
   const approved=(await call(admin,r(orgA,record.id)+"/approve",{method:"POST",body:{revision:record.revision,reason:"Fictional independent review"}})).value.record;record=approved;approvedSnapshot=clone(approved.snapshot);
   assert.deepEqual((await call(reader,r(orgA,record.id))).value.record.data,approvedSnapshot.data);assert.deepEqual((await call(external,r(orgA,record.id))).value.history,[]);
  });
  await t.test("explicit assessment recheck uses ordinary PATCH, preserved owner and approved snapshot, typed zero and current basis",async()=>{
   const proposal=recheck(record,head,{copiedFields:["sourceUrl"],sourceChoice:{kind:"listing-url"},assessment:{providerName:"Fictional declared provider",eligibility:"eligible",reviewedDate:new Date().toISOString().slice(0,10),renewalDate:null,cost:{minor:0,currency:"USD",precision:2},confirmationReference:null}}),ready=await preview(a,orgA,proposal),result=await commit(a,orgA,proposal,ready);record=result.disposition.record;head=result.historyHeadSha256;
   assert.equal(result.kind,"rechecked");assert.equal(record.status,"review");assert.equal(record.ownerId,contributor.id);assert.equal(record.approval,null);assert.deepEqual(record.snapshot,approvedSnapshot);assert.deepEqual(record.data.cost,{minor:0,currency:"USD",precision:2});assert.equal((await panel(contributor,orgA,record.id)).assessment.kind,"current");assert.deepEqual((await call(reader,r(orgA,record.id))).value.record.data,approvedSnapshot.data);
  });
  await t.test("numeric overflow cannot alias an exact accepted nullable assessment request",async()=>{
   const proposal=recheck(record,head,{copiedFields:["sourceUrl"],sourceChoice:{kind:"listing-url"},assessment:{providerName:null,eligibility:"eligible",reviewedDate:new Date().toISOString().slice(0,10),renewalDate:null,cost:{minor:null,currency:"USD",precision:2},confirmationReference:null}}),ready=await preview(a,orgA,proposal),key=randomUUID(),result=await commit(a,orgA,proposal,ready,key);record=result.disposition.record;head=result.historyHeadSha256;
   const raw=JSON.stringify({previewToken:ready.previewToken,commandKey:key,proposal}).replace('"minor":null','"minor":1e309');await call(a,p(orgA,"commit"),{method:"POST",raw,expect:422});assert.equal((await panel(a,orgA,record.id)).binding.historyHeadSha256,head);
  });
  await t.test("working prose, approved-only changes and record restore invalidate the proper basis without overwriting notes",async()=>{
   const proposal=recheck(record,head,{limitations:{kind:"replace-mapped",notes:{kind:"keep"}}}),ready=await preview(a,orgA,proposal);
   record=(await call(a,r(orgA,record.id),{method:"PATCH",body:{revision:record.revision,data:{...record.data,limitations:"Fictional organization notes kept exactly."}}})).value.record;
   await commit(a,orgA,proposal,ready,randomUUID(),409);assert.equal((await panel(a,orgA,record.id)).assessment.reason,"working-data-changed");
   await preview(a,orgA,recheck(record,head,{limitations:{kind:"replace-mapped",notes:{kind:"keep"}}}),409);
   const keep=recheck(record,head),kept=await commit(a,orgA,keep,await preview(a,orgA,keep));record=kept.disposition.record;head=kept.historyHeadSha256;assert.equal(record.data.limitations,"Fictional organization notes kept exactly.");
   assert.equal((await panel(a,orgA,record.id)).binding.headEvent.packet.limitationsState.ownership,"unstructured");
  });
  await t.test("current membership scope/revision and incarnation changes invalidate exact proofs and accepted replays",async()=>{
   const proposal=copy(1),ready=await preview(contributor,orgA,proposal);
   await tx(c=>c.query("UPDATE os_members SET program_ids=$3,revision=revision+1 WHERE org_id=$1 AND user_id=$2",[orgA,contributor.id,JSON.stringify(["different-but-still-org-wide"])]));
   await commit(contributor,orgA,proposal,ready,randomUUID(),409);
   const fresh=await preview(contributor,orgA,proposal),key=randomUUID();await commit(contributor,orgA,proposal,fresh,key);
   await tx(c=>c.query("DELETE FROM os_members WHERE org_id=$1 AND user_id=$2",[orgA,contributor.id]));await commit(contributor,orgA,proposal,fresh,key,403);
   await tx(c=>c.query("INSERT INTO os_members(org_id,user_id,role,program_ids,revision) VALUES($1,$2,'contributor',$3,1)",[orgA,contributor.id,JSON.stringify(["different-but-still-org-wide"])]));await commit(contributor,orgA,proposal,fresh,key,409);
   for(const commandKey of["ABCDEFAB-1234-4234-8234-123456789abc","00000000-0000-1000-8000-000000000000",123])await call(a,p(orgA,"commit"),{method:"POST",body:{previewToken:ready.previewToken,proposal,commandKey},expect:422});
  });
  await t.test("revoked session waiting behind the org lock cannot write after initial real authentication",async()=>{
   const queued=await signIn("queued"),orgQ=await org(queued,"Fictional queued session organization"),proposal=copy(2),ready=await preview(queued,orgQ,proposal);
   const lock=await db.pool.connect();await lock.query("BEGIN");await lock.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[orgQ]);
   const pending=commit(queued,orgQ,proposal,ready,randomUUID(),401);
   try{
    let waiting=false;for(let i=0;i<200;i++){waiting=(await migration.pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT pg_advisory_xact_lock%') AS waiting")).rows[0].waiting;if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(waiting,true,"Request must have passed initial auth and reached its org lock.");
    await migration.pool.query('DELETE FROM "session" WHERE "userId"=$1',[queued.id]);await lock.query("COMMIT");await pending;
   }finally{await lock.query("ROLLBACK");lock.release();}
   assert.equal((await db.tx(queued.id,orgQ,c=>c.query("SELECT count(*) FROM os_resource_directory_history WHERE org_id=$1",[orgQ]))).rows[0].count,"0");
  });
  await t.test("session expiry while queued uses time after lock acquisition rather than transaction BEGIN",async()=>{
   const expiring=await signIn("expiring"),orgE=await org(expiring,"Fictional expiring session organization"),proposal=copy(2),ready=await preview(expiring,orgE,proposal);
   const lock=await db.pool.connect();await lock.query("BEGIN");await lock.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[orgE]);
   const pending=commit(expiring,orgE,proposal,ready,randomUUID(),401);
   try{let waiting=false;for(let i=0;i<200;i++){waiting=(await migration.pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT pg_advisory_xact_lock%') AS waiting")).rows[0].waiting;if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(waiting,true);await migration.pool.query(`UPDATE "session" SET "expiresAt"=clock_timestamp()+interval '100 milliseconds' WHERE "userId"=$1`,[expiring.id]);await new Promise(resolve=>setTimeout(resolve,150));await lock.query("COMMIT");await pending;}finally{await lock.query("ROLLBACK");lock.release();}
   assert.equal((await db.tx(expiring.id,orgE,c=>c.query("SELECT count(*) FROM os_records WHERE org_id=$1",[orgE]))).rows[0].count,"0");
  });
  await t.test("concurrent copies serialize one root and one current result; private tenant RLS remains empty",async()=>{
   const proposal=copy(3),readyA=await preview(a,orgA,proposal),readyB=await preview(admin,orgA,proposal);const results=await Promise.all([commit(a,orgA,proposal,readyA),commit(admin,orgA,proposal,readyB)]);assert.deepEqual(results.map(v=>v.kind).sort(),["copied","existing"]);assert.equal(new Set(results.map(v=>v.disposition.record.id)).size,1);
   assert.equal((await db.pool.query("SELECT count(*) FROM os_resource_directory_history")).rows[0].count,"0");assert.equal((await tx(c=>c.query("SELECT count(*) FROM os_resource_directory_history WHERE org_id=$1",[orgA]),orgB,b.id)).rows[0].count,"0");
  });
  await t.test("trash and exact replay return current disposition without creating another Resource or event",async()=>{
   const proposal=copy(4),ready=await preview(a,orgA,proposal),key=randomUUID(),result=await commit(a,orgA,proposal,ready,key),id=result.disposition.record.id;
   await call(a,r(orgA,id),{method:"DELETE",body:{revision:1}});assert.equal((await commit(a,orgA,proposal,ready,key)).disposition.kind,"trash");assert.equal((await preview(a,orgA,proposal)).disposition.kind,"trash");
   const exported=(await call(a,`/api/orgs/${orgA}/export`)).value;assert.ok(exported.trash.some(v=>v.id===id));assert.ok(exported.directoryResources.bindings.some(v=>v.resourceId===id));
  });
  await t.test("full export/recovery retains complete inert history and archive-only trash, explicit adoption appends authority",async()=>{
   const backup=(await call(a,`/api/orgs/${orgA}/export`)).value;assert.ok(backup.directoryResources);assert.doesNotMatch(stable(backup.directoryResources),/previewToken|commandKey|command_hash|request_hash|actor_binding_hash|cookie/);
   const orgR=await org(b,"Fictional recovered directory organization"),before=(await call(b,`/api/orgs/${orgR}/import/preview`,{method:"POST",body:{backup}})).value;assert.equal(before.summary.rejected,0);assert.ok(before.summary.directoryResourceBindingsRecovered>0);
   await call(b,`/api/orgs/${orgR}/import/commit`,{method:"POST",body:{previewId:before.previewId}});
   const recovered=await panel(b,orgR,record.id);assert.equal(recovered.binding.originMode,"recovered");assert.equal(recovered.assessment.kind,"historical");assert.equal(recovered.disposition.record.revision,1);assert.equal(recovered.disposition.record.approval,null);assert.equal(recovered.disposition.record.snapshot,null);
   const trashId=backup.trash[0].id,archived=await panel(b,orgR,trashId);assert.equal(archived.disposition.kind,"historical-only");assert.equal(archived.disposition.recoveryAvailable,false);
   const again=(await call(b,`/api/orgs/${orgR}/export`)).value;assert.equal(again.directoryResources.bindings.length,backup.directoryResources.bindings.length);for(const binding of again.directoryResources.bindings)for(const e of binding.events)assert.equal(e.provenance,"recovered");assert.equal(again.directoryResources.captures.length,backup.directoryResources.captures.length);
   const proposal=recheck(recovered.disposition.record,recovered.binding.historyHeadSha256,{intent:"adopt-recovered"}),adopted=await commit(b,orgR,proposal,await preview(b,orgR,proposal));assert.equal(adopted.kind,"adopted");assert.equal(adopted.disposition.record.revision,2);assert.equal((await panel(b,orgR,record.id)).binding.sequence,recovered.binding.sequence+1);await preview(b,orgR,recheck(adopted.disposition.record,adopted.historyHeadSha256,{intent:"adopt-recovered"}),409);
   const evidence=(await call(b,p(orgR,"records/"+record.id+"/export"))).value;assert.equal(evidence.partial,true);assert.equal(evidence.directoryResources.bindings.length,1);assert.equal(evidence.format,"charitology-directory-resource-evidence");
  });
  await t.test("older full backups without directory history restore, while present null fails before writes",async()=>{
   const original=(await call(a,`/api/orgs/${orgA}/export`)).value,{checksum,directoryResources,...old}=original,backup={...old,checksum:hash(old)},orgOld=await org(b,"Fictional old format recovery");
   const preview=(await call(b,`/api/orgs/${orgOld}/import/preview`,{method:"POST",body:{backup}})).value;assert.equal(preview.summary.rejected,0);await call(b,`/api/orgs/${orgOld}/import/commit`,{method:"POST",body:{previewId:preview.previewId}});
   const malformed={...old,directoryResources:null};malformed.checksum=hash(malformed);await call(b,`/api/orgs/${orgB}/import/preview`,{method:"POST",body:{backup:malformed},expect:422});
  });
  await t.test("whole direct and chunked backup transports reject duplicate packet/source keys and invalid UTF-8 before preview writes",async()=>{
   const backup=(await call(a,`/api/orgs/${orgA}/export`)).value,raw=JSON.stringify({backup}),packet=raw.replace('"packet":{','"packet":{"event":"copied",'),source=raw.replace('"frozenEntry":{','"frozenEntry":{"catalogKind":"tools",');
   for(const invalid of[packet,source]){assert.notEqual(invalid,raw);await call(b,`/api/orgs/${orgB}/import/preview`,{method:"POST",raw:invalid,expect:422});}
   const replacement=clone(backup);replacement.organization.name="Fictional \ufffd replacement";delete replacement.checksum;replacement.checksum=hash(replacement);const encoded=Buffer.from(JSON.stringify(replacement)),at=encoded.indexOf(Buffer.from("\ufffd"));assert.ok(at>0);const broken=Buffer.concat([encoded.subarray(0,at),Buffer.from([0xff]),encoded.subarray(at+3)]);
   await call(b,`/api/orgs/${orgB}/import/preview`,{method:"POST",raw:Buffer.concat([Buffer.from('{"backup":'),broken,Buffer.from("}")]),expect:422});
   const upload=(await call(b,`/api/orgs/${orgB}/import/upload`,{method:"POST",body:{index:0,total:1,chunk:broken.toString("base64")}})).value;await call(b,`/api/orgs/${orgB}/import/preview`,{method:"POST",body:{uploadId:upload.uploadId},expect:422});
   const packetBytes=Buffer.from(packet.slice('{"backup":'.length,-1)),upload2=(await call(b,`/api/orgs/${orgB}/import/upload`,{method:"POST",body:{index:0,total:1,chunk:packetBytes.toString("base64")}})).value;await call(b,`/api/orgs/${orgB}/import/preview`,{method:"POST",body:{uploadId:upload2.uploadId},expect:422});
   assert.equal((await tx(c=>c.query("SELECT count(*) FROM os_records WHERE org_id=$1",[orgB]),orgB,b.id)).rows[0].count,"0");
  });
  await t.test("actual PostgreSQL sizing, recovery reserve, immutable grants and rerunnable grant path preserve old rows",async()=>{
   for(const value of [{unicode:"é ☺ 漢字",nested:[1,null,{escaped:'a\n"b\\c'}]},directoryCatalog.captures[0].core])assert.equal(Number((await migration.pool.query("SELECT octet_length($1::jsonb::text) AS bytes",[JSON.stringify(value)])).rows[0].bytes),directoryPayloadBytes(value));
   const oldRows=await tx(c=>c.query("SELECT hashtextextended(string_agg(row_to_json(t)::text,'' ORDER BY id),0)::text AS checksum FROM os_records t WHERE org_id=$1",[orgA]));
   const acl=async()=> (await migration.pool.query("SELECT c.relname,has_table_privilege($1,c.oid,'SELECT') AS read,has_table_privilege($1,c.oid,'INSERT') AS insert,has_table_privilege($1,c.oid,'UPDATE') AS update,has_table_privilege($1,c.oid,'DELETE') AS delete FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$2 AND c.relkind='r' ORDER BY c.relname",[role,schema])).rows;
   const before=await acl();await migration.pool.query(applicationGrantsSql(role,schema));await migration.pool.query(applicationGrantsSql(role,schema));assert.deepEqual(await acl(),before);
   for(const name of["os_task_recurrence_occurrences","os_resource_directory_history"]){const row=before.find(v=>v.relname===name);assert.equal(row.read,true);assert.equal(row.insert,true);assert.equal(row.update,false);assert.equal(row.delete,false);}
   await assert.rejects(tx(c=>c.query("UPDATE os_resource_directory_history SET origin_mode='recovered' WHERE org_id=$1",[orgA])),e=>e.code==="42501");
   await assert.rejects(migration.pool.query("UPDATE os_resource_directory_history SET origin_mode='recovered' WHERE org_id=$1",[orgA]),/immutable|append.only/i);
   assert.deepEqual(await tx(c=>c.query("SELECT hashtextextended(string_agg(row_to_json(t)::text,'' ORDER BY id),0)::text AS checksum FROM os_records t WHERE org_id=$1",[orgA])),oldRows);
   const usage=await tx(c=>directoryTableUsage(c,orgA));assert.ok(usage.bytes>0);assert.ok(await tx(c=>logicalBackupBytes(c,orgA))>=usage.bytes);
   // Exercise the actual bounded insertion primitive at a row payload boundary; rollback proves no orphan capture survives.
   const count=usage.rows;await assert.rejects(tx(c=>insertDirectoryRow(c,orgA,{id:hash("fictional-too-large-row"),rowKind:"capture",captureId:hash("fictional-too-large-capture"),originMode:"recovered",payload:{text:"x".repeat(32769)}})),e=>e.code==="directory_quota");assert.equal((await tx(c=>directoryTableUsage(c,orgA))).rows,count);
  });
  await t.test("event32 cap and latest20 history pagination use exact current history head",async()=>{
   const orgH=await org(b,"Fictional complete history"),proposal=copy(),first=await commit(b,orgH,proposal,await preview(b,orgH,proposal));let current=first.disposition.record,latest=first.historyHeadSha256,oldCursor;
   for(let n=1;n<32;n++){
    // Fixture-only window expiry permits a sequence that normally spans account rate windows.
    if(n===18)await migration.pool.query("UPDATE os_rate_limits SET expires_at='1970-01-01' WHERE key=$1",["directory-resource-write:"+hash(b.id)]);
    const proposal=recheck(current,latest),changed=await commit(b,orgH,proposal,await preview(b,orgH,proposal));current=changed.disposition.record;latest=changed.historyHeadSha256;
    if(n===21)oldCursor=(await panel(b,orgH,current.id)).nextCursor;
   }
   const page=await panel(b,orgH,current.id);assert.equal(page.binding.sequence,32);assert.deepEqual(page.events.map(v=>v.packet.sequence),Array.from({length:20},(_,i)=>i+13));assert.ok(page.nextCursor);
   const older=(await call(b,p(orgH,"records/"+current.id)+"?cursor="+page.nextCursor)).value;assert.deepEqual(older.events.map(v=>v.packet.sequence),Array.from({length:12},(_,i)=>i+1));assert.equal(older.binding.headEvent.packet.sequence,32);assert.equal(older.nextCursor,null);
   await call(b,p(orgH,"records/"+current.id)+"?cursor="+oldCursor,{expect:409});await preview(b,orgH,recheck(current,latest),422);assert.equal((await panel(b,orgH,current.id)).binding.sequence,32);
  });
  await t.test("actual storage row1000, binding250 and charged4MiB limits refuse before mutation",async()=>{
   // Explicit isolated storage-capacity fixtures; these rows are not admitted as source evidence or API authority.
   const seed=async(organization,count,kind,padding=0)=>db.tx(b.id,organization,c=>c.query(`INSERT INTO os_resource_directory_history(org_id,id,row_kind,capture_id,binding_id,sequence,resource_id,catalog_kind,listing_id,origin_mode,payload,budget_bytes) SELECT $1,md5($2||n::text)||md5($2||n::text),$3,md5('capture'||$2||n::text)||md5('capture'||$2||n::text),CASE WHEN $3='event' THEN md5('binding'||$2||n::text)||md5('binding'||$2||n::text) ELSE NULL END,CASE WHEN $3='event' THEN 1 ELSE NULL END,CASE WHEN $3='event' THEN md5('record'||$2||n::text) ELSE NULL END,CASE WHEN $3='event' THEN 'tools' ELSE NULL END,CASE WHEN $3='event' THEN 'capacity-'||n::text ELSE NULL END,'recovered',jsonb_build_object('padding',repeat('x',$4)),octet_length(jsonb_build_object('padding',repeat('x',$4))::text)+4096 FROM generate_series(1,$5::integer)n`,[organization,organization,kind,padding,count]),{lock:true});
   for(const [name,count,kind,padding]of[["rows",1000,"capture",0],["bindings",250,"event",0],["bytes",116,"capture",32000]]){
    const organization=await org(b,"Fictional capacity "+name);await seed(organization,count,kind,padding);const before=await db.tx(b.id,organization,c=>directoryTableUsage(c,organization));assert.ok(before.bytes<4*1024*1024);
    const payload=padding?{padding:"x".repeat(padding)}:{};await assert.rejects(db.tx(b.id,organization,c=>insertDirectoryRow(c,organization,{id:hash(name+" extra"),rowKind:kind,captureId:hash(name+" extra capture"),bindingId:kind==="event"?hash(name+" extra binding"):null,sequence:kind==="event"?1:null,resourceId:kind==="event"?"fictional-extra-resource":null,catalogKind:kind==="event"?"tools":null,listingId:kind==="event"?"capacity-extra":null,originMode:"recovered",payload}),{lock:true}),e=>e.code==="directory_quota");assert.deepEqual(await db.tx(b.id,organization,c=>directoryTableUsage(c,organization)),before);
   }
   const worst={org_id:"o".repeat(100),id:"a".repeat(64),row_kind:"event",capture_id:"c".repeat(64),binding_id:"b".repeat(100),sequence:32,resource_id:"r".repeat(100),catalog_kind:"benefits",listing_id:"l".repeat(64),origin_mode:"live",command_hash:"d".repeat(64),request_hash:"e".repeat(64),actor_binding_hash:"f".repeat(64),payload:{padding:"界".repeat(1000)},budget_bytes:36864,created_at:"2200-12-31T23:59:59.999999Z"};
   const overhead=Number((await migration.pool.query("SELECT octet_length(to_jsonb(t)::text)-octet_length(t.payload::text) AS bytes FROM jsonb_populate_record(null::os_resource_directory_history,$1::jsonb)t",[JSON.stringify(worst)])).rows[0].bytes);assert.ok(overhead<4096);console.log("# actual PostgreSQL worst fixed directory column overhead "+overhead+" bytes");
  });
  await t.test("ordinary active2000 and structured16MiB budgets still block bridge writes atomically",async()=>{
   const orgCount=await org(b,"Fictional ordinary active-record capacity"),data=validateRecord("resources",{title:"Fictional capacity",kind:"tool"});
   await db.tx(b.id,orgCount,c=>c.query("INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision) SELECT $1,'fictional-row-'||n,'resources',$2::jsonb,'discovered',$3,$3,1 FROM generate_series(1,2000)n",[orgCount,JSON.stringify(data),b.id]),{lock:true});
   const proposal=copy(7),ready=await preview(b,orgCount,proposal);await commit(b,orgCount,proposal,ready,randomUUID(),422);assert.equal((await db.tx(b.id,orgCount,c=>directoryTableUsage(c,orgCount))).rows,0);
   const orgBytes=await org(b,"Fictional ordinary structured capacity"),large=validateRecord("projects",{title:"x".repeat(180),kind:"task",deliverable:"界".repeat(4000)}),size=Number((await migration.pool.query("SELECT octet_length($1::jsonb::text) AS size",[JSON.stringify(large)])).rows[0].size),count=Math.floor((16*1024*1024)/size);
   await db.tx(b.id,orgBytes,c=>c.query("INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision) SELECT $1,'fictional-bytes-'||n,'projects',$2::jsonb,'planned',$3,$3,1 FROM generate_series(1,$4::integer)n",[orgBytes,JSON.stringify(large),b.id,count]),{lock:true});
   const remaining=16*1024*1024-size*count,smallBase=validateRecord("projects",{title:"Fictional remainder",kind:"task",deliverable:"x"}),smallSize=Number((await migration.pool.query("SELECT octet_length($1::jsonb::text) AS size",[JSON.stringify(smallBase)])).rows[0].size),chars=Math.floor((remaining-smallSize-128+1)/3);if(chars>0){const small=validateRecord("projects",{...smallBase,deliverable:"界".repeat(chars)});await db.tx(b.id,orgBytes,c=>c.query("INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision) VALUES($1,'fictional-remainder','projects',$2::jsonb,'planned',$3,$3,1)",[orgBytes,JSON.stringify(small),b.id]),{lock:true});}
   const structured=Number((await db.tx(b.id,orgBytes,c=>c.query("SELECT sum(octet_length(data::text)) AS bytes,count(*) AS count FROM os_records WHERE org_id=$1",[orgBytes]))).rows[0].bytes);assert.ok(structured<=16*1024*1024);assert.ok(16*1024*1024-structured<1000);assert.ok(count+1<2000);
   const readyBytes=await preview(b,orgBytes,proposal);await commit(b,orgBytes,proposal,readyBytes,randomUUID(),422);assert.equal((await db.tx(b.id,orgBytes,c=>directoryTableUsage(c,orgBytes))).rows,0);
  });
  await t.test("whole60MiB budget and an actual audit insertion failure roll back Resource, capture and history together",async()=>{
   const orgWhole=await org(b,"Fictional whole export budget"),base=await db.tx(b.id,orgWhole,c=>logicalBackupBytes(c,orgWhole));
   await db.tx(b.id,orgWhole,c=>c.query("INSERT INTO os_reports(org_id,id,created_by,title,checksum,payload) VALUES($1,'fictional-large-report',$2,'Fictional capacity report',$3,jsonb_build_object('padding',repeat('x',$4)))",[orgWhole,b.id,hash("fictional capacity"),60*1024*1024-base-2048]),{lock:true});
   const usage=await db.tx(b.id,orgWhole,c=>logicalBackupBytes(c,orgWhole));assert.ok(usage<60*1024*1024);assert.ok(60*1024*1024-usage<2048);
   const proposal=copy(8),ready=await preview(b,orgWhole,proposal);await commit(b,orgWhole,proposal,ready,randomUUID(),422);assert.equal((await db.tx(b.id,orgWhole,c=>directoryTableUsage(c,orgWhole))).rows,0);assert.equal((await db.tx(b.id,orgWhole,c=>c.query("SELECT count(*) FROM os_records WHERE org_id=$1",[orgWhole]))).rows[0].count,"0");
   await migration.pool.query("UPDATE os_rate_limits SET expires_at='1970-01-01' WHERE key=$1",["orgs:"+b.id]);const orgAudit=await org(b,"Fictional atomic audit failure"),readyAudit=await preview(b,orgAudit,proposal);
   await migration.pool.query("CREATE FUNCTION os_directory_fixture_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'directory-resource.%' THEN RAISE EXCEPTION 'Fictional audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER directory_fixture_fail_audit BEFORE INSERT ON os_events FOR EACH ROW EXECUTE FUNCTION os_directory_fixture_fail_audit()");
   try{await commit(b,orgAudit,proposal,readyAudit,randomUUID(),500);}finally{await migration.pool.query("DROP TRIGGER directory_fixture_fail_audit ON os_events; DROP FUNCTION os_directory_fixture_fail_audit()");}
   assert.equal((await db.tx(b.id,orgAudit,c=>directoryTableUsage(c,orgAudit))).rows,0);assert.equal((await db.tx(b.id,orgAudit,c=>c.query("SELECT count(*) FROM os_records WHERE org_id=$1",[orgAudit]))).rows[0].count,"0");
   assert.equal((await commit(b,orgAudit,proposal,readyAudit)).kind,"copied");
  });
  await t.test("feature actions created no provider connections, jobs, reminders or extra mail",async()=>{
   for(const table of["os_jobs","os_integrations","os_participation_outbox"])assert.equal((await tx(c=>c.query(`SELECT count(*) FROM ${table} WHERE org_id=$1`,[orgA]))).rows[0].count,"0");assert.equal(sent.length,8,"Only the eight actual fictional sign-in messages were captured.");
  });
 }finally{
  await db?.close();await migration?.close();await owner.pool.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);assert.equal((await owner.pool.query("SELECT count(*) FROM pg_namespace WHERE nspname=$1",[schema])).rows[0].count,"0");await owner.close();console.log("# isolated directory fixture cleaned "+schema);
 }
});
