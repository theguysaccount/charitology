import {createHmac} from "node:crypto";
import {fail,hash,equal,stable,json} from "./security.mjs";
import {allRecords,rowRecord,saveRecord,audit} from "./database.mjs";
import {administrators,requirePermission,inScope,visibleRecord} from "./access.mjs";
import {DIRECTORY_METHOD,directoryCatalog,directoryRegistrySha256,directoryClosed,directoryOwned,directoryIsHash,directoryIsListingId,getDirectorySelection,listDirectoryCaptures} from "./directory-catalog.mjs";
import {validateDirectoryProposal,buildDirectoryPlan,buildDirectoryEvent,directoryPrivateHash,assessmentDisposition} from "./directory-resource-model.mjs";
import {readDirectoryResourceBody,parseDirectoryResourceJson} from "./directory-resource-json.mjs";
import {bindingByResource,bindingByIdentity,directoryRestoreEpoch,ensureDirectoryCapture,insertDirectoryEvent,directoryAcceptedCommand} from "./directory-resource-store.mjs";
import {exportDirectoryResources} from "./directory-resource-backup.mjs";

const okay=v=>json({ok:true,...v}),ID=/^[A-Za-z0-9_-]{1,100}$/,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
 unavailable=()=>fail(404,"directory_resource","This Resource or its retained history is unavailable."),
 stale=()=>fail(409,"directory_stale","This source, membership or Resource changed. Inspect it and preview again.");
const opaque=v=>typeof v==="string"&&ID.test(v),H=directoryPrivateHash;
function query(url,allowed=[]){
 const p=new URLSearchParams(url.search);
 if(p.getAll("path").length===1&&p.get("path")===url.pathname.slice(5))p.delete("path");
 for(const key of p.keys())if(!allowed.includes(key)||p.getAll(key).length!==1)fail(422,"directory_query","Use only the documented directory query.");
 return p;
}
function cursor(value){
 if(value===null)return null;
 if(typeof value!=="string"||value.length>2048||!/^[A-Za-z0-9_-]+$/.test(value))fail(422,"directory_cursor","This evidence cursor is invalid.");
 const bytes=Buffer.from(value,"base64url");if(bytes.toString("base64url")!==value)fail(422,"directory_cursor","This evidence cursor is invalid.");
 let text;try{text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}catch{fail(422,"directory_cursor","This evidence cursor is invalid.");}
 return parseDirectoryResourceJson(text,2048);
}
const encoded=v=>v===null?null:Buffer.from(stable(v)).toString("base64url");
function mac(encoded,secret,proposal){return createHmac("sha256",secret).update("os:directory-resource:v1:"+H("proposal",proposal)+"\0"+encoded).digest("base64url");}
function sign(value,secret,proposal){const bytes=Buffer.from(stable(value));if(bytes.length>2048)fail(422,"directory_proof","This preview exceeds its proof limit.");const p=bytes.toString("base64url"),token=p+"."+mac(p,secret,proposal);if(token.length>4096)fail(422,"directory_proof","This preview exceeds its proof limit.");return token;}
function proof(token,secret,proposal){
 if(typeof token!=="string"||token.length>4096)stale();const parts=token.split(".");
 if(parts.length!==2||!/^[A-Za-z0-9_-]+$/.test(parts[0])||!/^[A-Za-z0-9_-]{43}$/.test(parts[1])||!equal(mac(parts[0],secret,proposal),parts[1]))stale();
 const bytes=Buffer.from(parts[0],"base64url");if(bytes.length>2048||bytes.toString("base64url")!==parts[0])stale();
 let text;try{text=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes);}catch{stale();}
 const p=parseDirectoryResourceJson(text,2048);
 directoryClosed(p,["version","method","orgId","intent","bindingId","resourceId","actorId","sessionSha256","membershipSha256","selectionSha256","registrySha256","beforeSha256","planSha256","issuedAt","expiresAt"]);
 if(p.version!==1||p.method!==DIRECTORY_METHOD||!["copy","recheck","adopt-recovered"].includes(p.intent)||![p.orgId,p.bindingId,p.resourceId,p.actorId].every(opaque)||![p.sessionSha256,p.membershipSha256,p.selectionSha256,p.registrySha256,p.beforeSha256,p.planSha256].every(directoryIsHash)||!Number.isSafeInteger(p.issuedAt)||!Number.isSafeInteger(p.expiresAt)||p.expiresAt!==p.issuedAt+600000||p.issuedAt>Date.now()+1000||p.expiresAt<=Date.now())stale();
 return p;
}
export async function directoryMembership(c,org,user){
 const row=(await c.query("SELECT user_id,role,program_ids,revision,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_exact FROM os_members WHERE org_id=$1 AND user_id=$2",[org,user])).rows[0];
 if(!row)fail(403,"membership","This organization is unavailable or your access has ended.");
 return {userId:row.user_id,role:row.role,programIds:row.program_ids,revision:row.revision,createdAtExact:row.created_exact};
}
function membershipHash(member){
 return H("membership",{userId:member.userId,role:member.role,programIds:[...member.programIds].sort(),revision:member.revision,createdAtExact:member.createdAtExact});
}
async function currentResource(c,org,id,member,{trash=false}={}){
 const raw=(await c.query("SELECT * FROM os_records WHERE org_id=$1 AND id=$2",[org,id])).rows[0];
 if(!raw||raw.module_id!=="resources"||(!trash&&raw.deleted_at))unavailable();
 const record=rowRecord(raw);if(!inScope(record,member)||!visibleRecord(record,member))unavailable();
 return {record,deleted:!!raw.deleted_at};
}
async function disposition(c,org,binding,member){
 const raw=(await c.query("SELECT * FROM os_records WHERE org_id=$1 AND id=$2",[org,binding.resourceId])).rows[0];
 if(!raw){if(administrators(member.role))return {kind:"historical-only",recoveryAvailable:false};unavailable();}
 if(raw.module_id!=="resources")unavailable();const record=rowRecord(raw);
 if(!inScope(record,member)||!visibleRecord(record,member))unavailable();
 return raw.deleted_at?{kind:"trash",recordId:record.id,recoveryAvailable:true}:{kind:"active-record",record};
}
const info=b=>b?{id:b.id,resourceId:b.resourceId,catalogKind:b.catalogKind,listingId:b.listingId,originMode:b.originMode,historyHeadSha256:b.historyHeadSha256,sequence:b.sequence,selection:b.selection,headEvent:b.events.at(-1)}:null;
async function prepared(c,org,actor,member,input,now,{proveExisting=false}={}){
 const proposal=validateDirectoryProposal(input,{now}),source=getDirectorySelection(proposal.selection,{now});
 let previous=null,binding;
 if(proposal.intent==="copy")binding=await bindingByIdentity(c,org,proposal.selection.catalogKind,proposal.selection.listingId);
 else{
  previous=(await currentResource(c,org,proposal.target.recordId,member)).record;
  binding=await bindingByResource(c,org,previous.id);if(!binding)unavailable();
 }
 const existing=proposal.intent==="copy"&&binding?await disposition(c,org,binding,member):null;
 if(existing&&!proveExisting)return {proposal,source,binding,existing};
 const restoreEpoch=previous?await directoryRestoreEpoch(c,org,previous.id):null;
 const owners=(await c.query("SELECT user_id FROM os_members WHERE org_id=$1",[org])).rows.map(r=>r.user_id);
 const context={member,ownerIds:owners,records:await allRecords(c,org)};
 const plan=buildDirectoryPlan({proposal,orgId:org,actorId:actor,membershipSha256:membershipHash(member),restoreEpoch,now,previous,binding:existing?null:binding,context});
 if(existing)return {proposal,source,binding,existing,plan};
 if(proposal.intent==="copy"&&(await c.query("SELECT 1 FROM os_records WHERE org_id=$1 AND id=$2",[org,plan.resourceId])).rowCount)fail(409,"directory_identity","The proposed Resource identity is already in use.");
 return {proposal,source,binding,previous,plan};
}
async function panel(c,org,id,member,url){
 const params=query(url,["cursor"]),binding=await bindingByResource(c,org,id);
 if(!binding){const {record}=await currentResource(c,org,id,member);return okay({binding:null,events:[],disposition:{kind:"active-record",record},nextCursor:null,currentRestoreEpoch:await directoryRestoreEpoch(c,org,id),assessment:null});}
 const current=await disposition(c,org,binding,member),restoreEpoch=current.kind==="active-record"?await directoryRestoreEpoch(c,org,id):null;
 let end=binding.events.length,cur=cursor(params.get("cursor"));
 if(cur){directoryClosed(cur,["bindingId","headSha256","nextSequence"]);if(cur.bindingId!==binding.id||cur.headSha256!==binding.historyHeadSha256)stale();if(!Number.isInteger(cur.nextSequence)||cur.nextSequence<1||cur.nextSequence>=end)fail(422,"directory_cursor","This evidence cursor is invalid.");end=cur.nextSequence;}
 const start=Math.max(0,end-20),events=binding.events.slice(start,end),nextCursor=start?encoded({bindingId:binding.id,headSha256:binding.historyHeadSha256,nextSequence:start}):null;
 const assessment=current.kind==="active-record"?assessmentDisposition({events:binding.events,data:current.record.data,selection:binding.selection,restoreEpoch}):null;
 let comparison=null;try{comparison=getDirectorySelection(binding.selection).comparison;}catch(error){if(error.code!=="directory_source")throw error;}
 return okay({binding:info(binding),events,disposition:current,nextCursor,currentRestoreEpoch:restoreEpoch,assessment,comparison});
}
export async function directoryResourceRoutes({request,url,db,settings,session}){
 const path=url.pathname,method=request.method.toUpperCase(),global=path.startsWith("/api/directory-resources"),match=path.match(/^\/api\/orgs\/([A-Za-z0-9_-]{1,100})\/directory-resources(?:\/(.*))?$/);
 if(!global&&!match)return null;
 if(session.user.emailVerified!==true)fail(403,"verified_email","A verified sign-in is required.");
 await db.limit("directory-resource-"+(["GET","HEAD"].includes(method)?"read:":"write:")+hash(session.user.id),["GET","HEAD"].includes(method)?120:60,3600);
 if(global){
  if(method!=="GET")fail(405,"directory_method","This directory action is unavailable.");
  if(path==="/api/directory-resources/catalogs"){
   const q=query(url,["cursor"]),result=listDirectoryCaptures({cursor:cursor(q.get("cursor"))});
   return okay({registrySha256:result.registrySha256,head:result.head,captures:result.captures.map(c=>({...c,capturedAt:c.core.capturedAt})),nextCursor:encoded(result.nextCursor)});
  }
  const entry=path.match(/^\/api\/directory-resources\/catalogs\/([a-f0-9]{64})\/(tools|benefits)\/([a-z0-9][a-z0-9-]{0,63})$/);
  if(!entry)unavailable();query(url);
  const [,captureId,catalogKind,listingId]=entry,capture=directoryCatalog.captures.find(c=>c.captureId===captureId),descriptor=capture?.core.catalogs.find(c=>c.kind===catalogKind)?.entries.find(e=>e.listingId===listingId);
  if(!descriptor)unavailable();return okay(getDirectorySelection({captureId,catalogKind,listingId,entrySha256:descriptor.entrySha256}));
 }
 const [,org,tail=""]=match,user=session.user.id;
 const input=method==="POST"?directoryOwned(await readDirectoryResourceBody(request),{bytes:32768,depth:8}):null;
 if(!["GET","POST"].includes(method))fail(405,"directory_method","This directory action is unavailable.");
 return db.tx(user,org,async c=>{
  // The initial authenticated request can wait behind an organization writer.
  // Recheck the real Better Auth session after that lock, without another pool.
  if(!(await c.query('SELECT 1 FROM "session" WHERE id=$1 AND "userId"=$2 AND "expiresAt">clock_timestamp() FOR SHARE', [session.session.id,user])).rowCount)
   fail(401,"session","Sign in again before reviewing this directory source.");
  const member=await directoryMembership(c,org,user);requirePermission("resources",member,"read");
  if(method==="GET"&&/^records\/[A-Za-z0-9_-]{1,100}\/export$/.test(tail)){
   requirePermission("resources",member,"export");query(url);const id=tail.split("/")[1],current=await currentResource(c,org,id,member,{trash:true}),records=await allRecords(c,org),trash=(await c.query("SELECT * FROM os_records WHERE org_id=$1 AND deleted_at IS NOT NULL",[org])).rows.map(rowRecord),all=await exportDirectoryResources(c,org,{records,trash}),binding=all?.bindings.find(b=>b.resourceId===id);
   if(!binding)unavailable();const selected=new Set(binding.events.map(e=>e.packet.selection.captureId));
   return new Response(stable({format:"charitology-directory-resource-evidence",version:1,partial:true,resource:current.record,directoryResources:{...all,captures:all.captures.filter(v=>selected.has(v.captureId)),bindings:[binding]}}),{headers:{"content-type":"application/json; charset=utf-8","content-disposition":'attachment; filename="resource-evidence.json"',"cache-control":"no-store"}});
  }
  requirePermission("resources",member,"write");
  if(method==="GET"&&/^records\/[A-Za-z0-9_-]{1,100}$/.test(tail))return panel(c,org,tail.split("/")[1],member,url);
  query(url);
  if(method==="POST"&&tail==="preview"){
   const p=await prepared(c,org,user,member,input,new Date().toISOString());if(p.existing)return okay({kind:"existing",disposition:p.existing});
   const {plan}=p,issuedAt=Date.now(),token={version:1,method:DIRECTORY_METHOD,orgId:org,intent:plan.intent,bindingId:plan.bindingId,resourceId:plan.resourceId,actorId:user,sessionSha256:H("session",{sessionId:session.session.id}),membershipSha256:plan.membershipSha256,selectionSha256:H("selection",plan.selection),registrySha256:plan.registrySha256,beforeSha256:H("before",plan.before),planSha256:plan.planSha256,issuedAt,expiresAt:issuedAt+600000};
   return okay({kind:"ready",plan,previewToken:sign(token,settings.secret,input),expiresAt:new Date(token.expiresAt).toISOString()});
  }
  if(method==="POST"&&tail==="commit"){
   directoryClosed(input,["previewToken","commandKey","proposal"]);if(typeof input.commandKey!=="string"||!UUID.test(input.commandKey))fail(422,"directory_command","Use a lowercase UUIDv4 command key.");
   validateDirectoryProposal(input.proposal);
   const token=proof(input.previewToken,settings.secret,input.proposal),memberSha=membershipHash(member),sessionSha=H("session",{sessionId:session.session.id});
   if(token.orgId!==org||token.actorId!==user||token.sessionSha256!==sessionSha||token.membershipSha256!==memberSha)stale();
   const commandHash=H("command",{orgId:org,actorId:user,createdAtExact:member.createdAtExact,commandKey:input.commandKey}),requestHash=H("request",{previewToken:input.previewToken,proposal:input.proposal}),actorBindingHash=H("actor-binding",{actorId:user,sessionSha256:sessionSha,createdAtExact:member.createdAtExact});
   const accepted=await directoryAcceptedCommand(c,org,commandHash);
   if(accepted){if(accepted.request_hash!==requestHash||accepted.actor_binding_hash!==actorBindingHash||accepted.binding_id!==token.bindingId||accepted.resource_id!==token.resourceId)fail(409,"directory_idempotency","This command key already belongs to another exact request.");const b=await bindingByResource(c,org,accepted.resource_id);if(!b)unavailable();return okay({kind:"existing",disposition:await disposition(c,org,b,member),historyHeadSha256:b.historyHeadSha256,auditRecorded:true});}
   const p=await prepared(c,org,user,member,input.proposal,new Date().toISOString(),{proveExisting:true});
   const {plan}=p;
   if(token.intent!==plan.intent||token.bindingId!==plan.bindingId||token.resourceId!==plan.resourceId||token.selectionSha256!==H("selection",plan.selection)||token.registrySha256!==plan.registrySha256||token.beforeSha256!==H("before",plan.before)||token.planSha256!==plan.planSha256)stale();
   if(p.existing){if(p.binding.originMode!=="live"||p.binding.id!==token.bindingId||p.binding.resourceId!==token.resourceId)stale();return okay({kind:"existing",disposition:p.existing,historyHeadSha256:p.binding.historyHeadSha256,auditRecorded:true});}
   const createdAt=new Date().toISOString(),candidate={...(p.previous??{}),id:plan.resourceId,orgId:org,moduleId:"resources",data:plan.candidate.data,status:plan.candidate.status,ownerId:plan.candidate.ownerId,lastEditedBy:user,revision:plan.candidate.revision,approval:null,snapshot:p.previous?.snapshot??null,source:p.previous?.source??null,createdAt:p.previous?.createdAt??createdAt,updatedAt:createdAt};
   const event=buildDirectoryEvent(plan,{actorId:user,originOrgId:org,recordedAt:createdAt,previousPacket:p.binding?.events.at(-1)?.packet??null,proposal:p.proposal});
   await saveRecord(c,candidate);await ensureDirectoryCapture(c,org,{captureId:p.source.captureId,core:p.source.core});await insertDirectoryEvent(c,org,event,{commandHash,requestHash,actorBindingHash});
   const recorded=await audit(c,org,user,"directory-resource."+event.packet.event,candidate,{bindingId:plan.bindingId,packetSha256:event.packetSha256,record:candidate});if(!recorded)fail(422,"quota","This directory review could not record its audit.");
   return okay({kind:event.packet.event==="copied"?"copied":event.packet.event==="adopted"?"adopted":"rechecked",disposition:{kind:"active-record",record:candidate},historyHeadSha256:event.packetSha256,auditRecorded:true});
  }
  fail(404,"directory_route","This directory action is unavailable.");
 },{lock:true});
}

