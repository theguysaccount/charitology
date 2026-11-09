/** Actual current tenant/session/member/typed rows. Caller owns outer org tx. */
import {getModule,modulePermissions,ROLES} from './modules.mjs';
import {requirePermission,inScope} from './access.mjs';
import {currentGroupMember,groupAuthority,groupRestoreEpoch} from './participation-group-access.mjs';
import {readParticipationGroupRowPin} from './participation-group-pins.mjs';
import {groupHash} from './participation-group-model.mjs';
import {need,id,stamp,fields,prop,rows,dense,owned,freeze,same} from './participation-recurrence-values.mjs';
const COPY={events:['title','kind','programId','startAt','endAt','timeZone','capacity','participationPurpose','participantInstructions','organizerEmail','organizerUrl','accessCoordinatorNeeded','joiningUrl'],volunteers:['title','kind','programId','startAt','endAt','timeZone','capacity','participationPurpose','participantInstructions','organizerEmail','organizerUrl','skills','safeguardingId','allowPartialIntervals']};
const summarySQL=`SELECT id,module_id,status,revision,data->>'programId' AS program_id,data->>'safeguardingId' AS safeguarding_id,deleted_at IS NOT NULL AS deleted,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_exact,to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_exact,to_char(deleted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS deleted_exact FROM os_records WHERE org_id=$1 AND id=ANY($2::text[]) ORDER BY module_id COLLATE "C",id COLLATE "C"`;
const absent=()=>need(false,'recurrence_unavailable',404);
function selectors(session){const s=prop(session,'session'),u=prop(session,'user');return{sessionId:id(prop(s,'id')),userId:id(prop(u,'id'))};}
/** POST module selector is inside body: allow actual writers of either family
 * before reading it; exact source-module permission follows body selection. */
export async function recurrencePreflight(c,{org,session,write}){
  id(org);need(typeof write==='boolean');const selected=selectors(session);
  const s=rows(await c.query('SELECT s.id AS session_id,s."userId" AS user_id,u.id AS current_user_id FROM "session" s JOIN "user" u ON u.id=s."userId" WHERE s.id=$1 AND s."userId"=$2 AND s."expiresAt">clock_timestamp()',[selected.sessionId,selected.userId]),1);
  need(s.length===1,'session',401);const actual=fields(s[0],['session_id','user_id','current_user_id']);need(actual.session_id===selected.sessionId&&actual.user_id===selected.userId&&actual.current_user_id===selected.userId,'session',401);
  const m=rows(await c.query("SELECT user_id,role,program_ids,revision,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_exact FROM os_members WHERE org_id=$1 AND user_id=$2",[org,selected.userId]),1);need(m.length===1,'membership',403);
  const r=fields(m[0],['user_id','role','program_ids','revision','created_exact']);need(r.user_id===selected.userId&&ROLES.includes(r.role)&&Number.isSafeInteger(r.revision)&&r.revision>=1&&r.revision<=2147483647);stamp(r.created_exact);
  const programs=dense(r.program_ids,100).map(id),member={userId:r.user_id,role:r.role,programIds:programs,revision:r.revision,createdAtExact:r.created_exact};
  const permitted=['events','volunteers'].filter(moduleId=>{const p=modulePermissions(moduleId,member.role);return p.read&&(!write||p.write);});need(permitted.length>0,'role',403);
  member.membershipSha256=groupHash('membership',{...member,programIds:[...programs].sort()});return freeze({member,permitted});
}
function fullView(moduleId,member){requirePermission(moduleId,member,'read');need(!getModule(moduleId).scopeRules.approvedSnapshotsOnly.includes(member.role),'recurrence_unavailable',404);}
function summary(raw,org){const r=fields(raw,['id','module_id','status','revision','program_id','safeguarding_id','deleted','created_exact','updated_exact','deleted_exact']);id(r.id);need(typeof r.module_id==='string');const module=getModule(r.module_id);need(typeof r.status==='string'&&module.workflow.states.some(s=>s.id===r.status),'recurrence_status');need(Number.isSafeInteger(r.revision)&&r.revision>=1&&r.revision<=2147483647&&typeof r.deleted==='boolean');if(r.program_id!==null)id(r.program_id);if(r.safeguarding_id!==null)id(r.safeguarding_id);stamp(r.created_exact);stamp(r.updated_exact);if(r.deleted_exact!==null)stamp(r.deleted_exact);need(r.deleted===(r.deleted_exact!==null));return r;}
function visible(r,org,member){fullView(r.module_id,member);need(inScope({id:r.id,moduleId:r.module_id,data:{programId:r.program_id}},member),'recurrence_unavailable',404);}
async function summaries(c,org,ids,write=false){need(new Set(ids).size===ids.length&&ids.length<=11);const result=rows(await c.query(summarySQL+(write?' FOR SHARE':''),[org,ids]),ids.length);return result.map(r=>summary(r,org));}
const refsFor=(s,moduleId)=>[[s.program_id,'programs'],...(moduleId==='volunteers'?[[s.safeguarding_id,'safeguarding']]:[])].filter(([x])=>x!==null).map(([id,moduleId])=>({id,moduleId})).sort((a,b)=>a.moduleId<b.moduleId?-1:a.moduleId>b.moduleId?1:a.id<b.id?-1:a.id>b.id?1:0);
const authorityFor=(member,session,epoch)=>{const g=groupAuthority(member,session,epoch);return{actorId:member.userId,sessionSha256:g.sessionSha256,membershipSha256:g.membershipSha256,memberCreatedAtExact:g.memberCreatedAtExact,restoreEpochSha256:g.restoreEpochSha256};};
async function pinned(c,org,r){const rowSha256=await readParticipationGroupRowPin(c,{orgId:org,table:'os_records',id:r.id});need(rowSha256!==null,'recurrence_stale',409);return{id:r.id,revision:r.revision,rowSha256,createdAtExact:r.created_exact,updatedAtExact:r.updated_exact,deletedAtExact:r.deleted_exact};}
/** Copies only typed safe operational fields. Full raw row bytes are pinned
 * separately; discarded counts/person/source fields are never DTO input. */
export async function readRecurrenceSourceContext(c,{org,session,sourceId,write}){
  id(org);id(sourceId);need(typeof write==='boolean');await c.query("SET LOCAL TIME ZONE 'UTC'");
  const first=await summaries(c,org,[sourceId]);if(first.length!==1)absent();const initial=first[0];need(['events','volunteers'].includes(initial.module_id)&&!initial.deleted,'recurrence_unavailable',404);
  const member=await currentGroupMember(c,org,session,{moduleId:initial.module_id,readOnly:!write});visible(initial,org,member);
  const wanted=refsFor(initial,initial.module_id),ids=[sourceId,...wanted.map(r=>r.id)];need(new Set(ids).size===ids.length,'recurrence_dependencies');
  const selected=await summaries(c,org,ids,write);need(selected.length===ids.length,'recurrence_unavailable',404);const byId=new Map(selected.map(r=>[r.id,r])),source=byId.get(sourceId);need(source&&same(source,initial),'recurrence_stale',409);
  for(const r of selected){need(!r.deleted,'recurrence_unavailable',404);visible(r,org,member);}
  for(const r of wanted)need(byId.get(r.id)?.module_id===r.moduleId,'recurrence_dependencies');
  const copied=rows(await c.query("SELECT (SELECT jsonb_object_agg(key,value) FROM jsonb_each(data) WHERE key=ANY($3::text[])) AS data,(data-$4::text[]='{}'::jsonb) AS keys_valid FROM os_records WHERE org_id=$1 AND id=$2 AND deleted_at IS NULL",[org,sourceId,COPY[source.module_id],getModule(source.module_id).fields.map(f=>f.key)]),1);need(copied.length===1,'recurrence_unavailable',404);const core=fields(copied[0],['data','keys_valid']);need(core.keys_valid===true);const data=owned(core.data);need(data.kind===(source.module_id==='events'?'session':'shift'),'recurrence_template');
  const sourcePin=await pinned(c,org,source),references=[];for(const r of wanted)references.push({...await pinned(c,org,byId.get(r.id)),moduleId:r.moduleId});
  const epoch=await groupRestoreEpoch(c,org,ids);
  return freeze({member,source:{id:source.id,orgId:org,moduleId:source.module_id,revision:source.revision,data},references:wanted.map(r=>({...r,orgId:org})),dependencies:{source:sourcePin,references},authority:authorityFor(member,session,epoch)});
}
/** Exact accepted Retry checks identity/scope/incarnation, not fresh schedule,
 * revision, counts, text/status, expiry, quota or a new domain clock. */
export async function requireRecurrenceAcceptedContext(c,{org,session,manifest,authority}){
  await c.query("SET LOCAL TIME ZONE 'UTC'");const m=manifest,member=await currentGroupMember(c,org,session,{moduleId:m.source.moduleId,readOnly:true});
  const expected=[{id:m.source.id,moduleId:m.source.moduleId,createdAtExact:m.dependencies.source.createdAtExact},...m.dependencies.references],ids=expected.map(r=>r.id),selected=await summaries(c,org,ids);need(selected.length===ids.length,'recurrence_reconcile',409);
  const byId=new Map(selected.map(r=>[r.id,r]));for(const e of expected){const r=byId.get(e.id);need(r&&r.module_id===e.moduleId&&!r.deleted&&r.created_exact===e.createdAtExact,'recurrence_reconcile',409);visible(r,org,member);}
  const current=byId.get(m.source.id);need(current.program_id===m.source.data.programId&&(m.source.moduleId!=='volunteers'||current.safeguarding_id===m.source.data.safeguardingId),'recurrence_reconcile',409);
  const epoch=await groupRestoreEpoch(c,org,ids);need(same(authorityFor(member,session,epoch),authority),'recurrence_reconcile',409);return member;
}
/** Authorize every historical row, including extra cursor; no partial payload.
 * Missing historical IDs remain facts, not authority to recreate anything. */
export async function authorizeRecurrenceHistory(c,{org,session,manifest}){
  const {member}=await recurrencePreflight(c,{org,session,write:false}),m=manifest;fullView(m.source.moduleId,member);
  need(inScope({id:m.source.id,moduleId:m.source.moduleId,data:m.source.data},member),'recurrence_unavailable',404);
  const expected=[{id:m.source.id,moduleId:m.source.moduleId},...m.dependencies.references,...m.candidates.map(x=>({id:x.id,moduleId:x.moduleId}))];
  // Missing historical IDs remain facts. Their declared module role still
  // requires full current read permission before any disposition lookup.
  for(const e of expected)fullView(e.moduleId,member);
  const current=await summaries(c,org,expected.map(r=>r.id));const byId=new Map(expected.map(r=>[r.id,r]));
  for(const r of current){need(byId.get(r.id)?.moduleId===r.module_id,'recurrence_unavailable',404);visible(r,org,member);}
  return freeze({member,current:current.map(r=>({id:r.id,moduleId:r.module_id,revision:r.revision,deleted:r.deleted,status:r.status}))});
}
