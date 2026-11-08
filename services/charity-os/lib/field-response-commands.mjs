/** Caller owns one correctly tenant-scoped transaction. No result grants source quality. */
import { isProxy } from 'node:util/types';
import { id, hash, fail } from './security.mjs';
import { requirePermission, inScope } from './access.mjs';
import { allRecords, rowRecord, saveRecord, audit, storePreview, commitPreview, PREVIEW_LIMITS } from './database.mjs';
import { validateRecord, getModule } from './modules.mjs';
import { checkWorkspaceExportCapacity } from './workspace-backup.mjs';
import { inspectFieldAggregateFile, makeFieldMapping, compileFieldObservationDrafts, validateFieldCompilation, FieldResponseError, FIELD_METHOD } from './field-response-model.mjs';
import { makeFieldResponseReportRow, appendFieldResponseReport, validateFieldResponseReportRow } from './field-response-store.mjs';
import { validateGroupExactStamp } from './participation-group-model.mjs';
import { fieldObject as object, fieldId as opaque, fieldIds, fieldDigest, validateFieldInspectRequest, validateFieldPreviewRequest, validateFieldCommitRequest } from './field-response-http.mjs';
export const FIELD_PREVIEW_KIND='field-response-v1';
const H=(domain,value)=>hash('charitology-field-command-v1:'+domain+'\n'+JSON.stringify(value));
const stale=()=>fail(409,'field_stale','Access, source definitions or the reviewed workspace changed. Inspect and preview again.');
const unavailable=()=>fail(404,'field_unavailable','This aggregate import context is unavailable.');
const need=(ok,code='field_state',status=422)=>{if(!ok)throw new FieldResponseError(code,'This aggregate import cannot be accepted.','',status);};
const ref=r=>({id:r.id,orgId:r.orgId,moduleId:r.moduleId,revision:r.revision,data:r.data,deletedAt:null});
const sorted=values=>[...values].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
function property(value,key){if(!value||typeof value!=='object'||isProxy(value))unavailable();const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))unavailable();return d.value;}
function sessionIds(session){return {sessionId:opaque(property(property(session,'session'),'id')),userId:opaque(property(property(session,'user'),'id'))};}
export async function currentFieldMember(c,org,session,{readOnly=false,write=false}={}){
 opaque(org);const s=sessionIds(session);
 const found=(await c.query('SELECT s.id AS session_id,s."userId" AS user_id,u.id AS current_user_id FROM "session" s JOIN "user" u ON u.id=s."userId" WHERE s.id=$1 AND s."userId"=$2 AND s."expiresAt">clock_timestamp()'+(readOnly?'':' FOR SHARE OF s'),[s.sessionId,s.userId])).rows;
 if(found.length!==1||found[0].session_id!==s.sessionId||found[0].user_id!==s.userId||found[0].current_user_id!==s.userId)fail(401,'session','Sign in again before continuing this aggregate import.');
 const rows=(await c.query("SELECT user_id,role,program_ids,revision,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_exact FROM os_members WHERE org_id=$1 AND user_id=$2"+(readOnly?'':' FOR SHARE'),[org,s.userId])).rows;
 if(rows.length!==1)fail(403,'membership','This organization is unavailable or your access has ended.');
 const r=object(rows[0],['user_id','role','program_ids','revision','created_exact']);need(r.user_id===s.userId&&Number.isSafeInteger(r.revision)&&r.revision>=1);validateGroupExactStamp(r.created_exact);
 const member={userId:r.user_id,role:r.role,programIds:fieldIds(r.program_ids),revision:r.revision};
 if(getModule('outcomes').scopeRules.approvedSnapshotsOnly.includes(member.role))fail(403,'field_role','Unapproved aggregate source material is available to authorized staff only.');
 requirePermission('programs',member,'read');requirePermission('outcomes',member,'read');if(write)requirePermission('outcomes',member,'write');
 return {member,createdAtExact:r.created_exact,sessionSha256:H('session',{id:s.sessionId}),membershipSha256:H('membership',{...member,programIds:[...member.programIds].sort(),createdAtExact:r.created_exact})};
}
async function restoreEpoch(c,org){const r=(await c.query("SELECT COALESCE(max(id)::text,'0') AS epoch FROM os_events WHERE org_id=$1 AND action IN ('backup.restored','record.restored')",[org])).rows;need(r.length===1&&/^(?:0|[1-9][0-9]*)$/.test(r[0].epoch));return H('restore',{epoch:r[0].epoch});}
async function authority(c,org,session,options){const current=await currentFieldMember(c,org,session,options);return {...current,restoreEpochSha256:await restoreEpoch(c,org)};}
const authorityPin=a=>({actorId:a.member.userId,sessionSha256:a.sessionSha256,membershipSha256:a.membershipSha256,memberCreatedAtExact:a.createdAtExact,restoreEpochSha256:a.restoreEpochSha256});
function scope(records,programId,member){const p=records.find(r=>r.id===programId&&!r.deletedAt&&r.moduleId==='programs'&&r.data.kind==='program');if(!p||!inScope(p,member))unavailable();return p;}
async function inventory(c,org){return [...await allRecords(c,org),...(await c.query('SELECT * FROM os_records WHERE org_id=$1 AND deleted_at IS NOT NULL ORDER BY id',[org])).rows.map(raw=>({...rowRecord(raw),deletedAt:true}))];}
const baseRevision=records=>H('workspace',sorted(records).map(r=>[r.id,r.revision,Boolean(r.deletedAt),hash(r.data),r.source]));
function safeConnection(raw){
 const r=object(raw,['id','provider','name','config','status','revision','has_credentials']);opaque(r.id);need(Number.isSafeInteger(r.revision)&&r.revision>=1&&typeof r.name==='string'&&r.name.length<=180&&typeof r.has_credentials==='boolean'&&['unconfigured','verified','error','disabled'].includes(r.status));
 if(r.provider!=='csv'||r.status==='disabled'||r.has_credentials)return null;
 const config=object(r.config,['baseUrl','moduleId','fieldMap']);if(config.baseUrl!==null||config.moduleId!=='outcomes')return null;
 need(config.fieldMap&&typeof config.fieldMap==='object'&&!isProxy(config.fieldMap)&&!Array.isArray(config.fieldMap));const names=Reflect.ownKeys(config.fieldMap);need(names.length<=50);const map={};for(const key of names){need(typeof key==='string'&&/^[A-Za-z0-9_ -]{1,100}$/.test(key));const d=Object.getOwnPropertyDescriptor(config.fieldMap,key);need(d?.enumerable&&Object.hasOwn(d,'value')&&getModule('outcomes').fields.some(f=>f.key===d.value));Object.defineProperty(map,key,{value:d.value,enumerable:true,writable:true,configurable:true});}
 return {id:r.id,provider:'csv',name:r.name,config:{baseUrl:null,moduleId:'outcomes',fieldMap:map},status:r.status,revision:r.revision};
}
async function connections(c,org){const rows=(await c.query('SELECT id,provider,name,config,status,revision,(encrypted_token IS NOT NULL) AS has_credentials FROM os_integrations WHERE org_id=$1 ORDER BY id',[org])).rows;need(rows.length<=30);return rows.map(safeConnection).filter(Boolean);}
const connectionPin=connection=>H('integration',connection);
async function history(c,org){const rows=(await c.query("SELECT org_id,id,created_by,title,checksum,payload,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at FROM os_reports WHERE org_id=$1 AND payload->>'format'='charitology-field-response-import' ORDER BY id COLLATE \"C\"",[org])).rows;return rows.map(r=>validateFieldResponseReportRow(r,{orgId:org}).payload);}
function dispositions(inspection,mapping,integrationId,records,reports){return inspection.rows.map(item=>{
 const row=item.row,retained=reports.filter(m=>m.integrationId===integrationId).flatMap(m=>m.rows.filter(r=>r.row.responseId===row.responseId).map(r=>({row:r,mapping:m.mapping.sha256}))),existing=records.filter(r=>r.source?.integrationId===integrationId&&r.source?.externalId===FIELD_METHOD+':'+row.responseId);
 const conflict=retained.some(r=>r.row.canonicalSha256!==item.canonicalSha256||r.mapping!==mapping.sha256)||existing.some(r=>r.moduleId!=='outcomes'||r.source.checksum!==item.canonicalSha256)||existing.length>0&&retained.length===0;
 const disposition=conflict?'conflict':retained.length?'already-recorded':row.excluded?'excluded':'new';
 return {index:item.index,...row,canonicalSha256:item.canonicalSha256,disposition,reason:disposition==='new'?null:disposition==='conflict'?'retained-source-conflict':disposition==='excluded'?'explicit-exclusion':'already-recorded'};
 });}
const inspectionSummary=rows=>({sourceRows:rows.length,newRows:rows.filter(r=>r.disposition==='new').length,excludedRows:rows.filter(r=>r.disposition==='excluded').length,alreadyRecordedRows:rows.filter(r=>r.disposition==='already-recorded').length,conflictRows:rows.filter(r=>r.disposition==='conflict').length});
async function resolved(c,org,session,input,{readOnly=false}={}){
 const auth=await authority(c,org,session,{readOnly,write:true}),records=await inventory(c,org),program=scope(records,input.programId,auth.member),indicator=records.find(r=>r.id===input.indicatorId&&!r.deletedAt&&r.moduleId==='outcomes'&&r.data.kind==='indicator'&&r.data.programId===program.id&&inScope(r,auth.member));if(!indicator)unavailable();
 const integration=(await connections(c,org)).find(r=>r.id===input.integrationId);if(!integration)unavailable();
 const inspection=inspectFieldAggregateFile(input.fileBytes),mapping=makeFieldMapping({orgId:org,program:ref(program),indicator:ref(indicator)}),reports=await history(c,org),rows=dispositions(inspection,mapping,integration.id,records,reports);
 return {auth,records,program,indicator,integration,inspection,mapping,rows};
}
export async function fieldResponseContext(c,{org,session}){
 const {member}=await currentFieldMember(c,org,session,{readOnly:true,write:false}),records=await allRecords(c,org),programs=records.filter(r=>r.moduleId==='programs'&&r.data.kind==='program'&&inScope(r,member));
 const indicators=records.filter(r=>r.moduleId==='outcomes'&&r.data.kind==='indicator'&&r.data.unit==='visits'&&inScope(r,member)&&programs.some(p=>p.id===r.data.programId));return {programs:programs.map(ref),indicators:indicators.map(ref),integrations:await connections(c,org)};
}
export async function inspectFieldResponses(c,{org,session,input}){const request=validateFieldInspectRequest(input),s=await resolved(c,org,session,request,{readOnly:true});return {file:s.inspection.file,mapping:s.mapping,rows:s.rows,summary:inspectionSummary(s.rows)};}
async function receiptHeadroom(c,org,payload){
 const encoded=JSON.stringify(payload),r=(await c.query('SELECT count(*) FILTER (WHERE committed_at IS NOT NULL) AS count,COALESCE(sum(octet_length(payload::text)) FILTER (WHERE committed_at IS NOT NULL),0) AS bytes,octet_length($2::jsonb::text) AS candidate_bytes FROM os_previews WHERE org_id=$1',[org,encoded])).rows[0];
 need(r&&[r.count,r.bytes,r.candidate_bytes].every(v=>Number.isSafeInteger(Number(v))&&Number(v)>=0));if(Number(r.count)+1>PREVIEW_LIMITS.committedCount||Number(r.bytes)+Number(r.candidate_bytes)>PREVIEW_LIMITS.committedBytes)fail(422,'archive_quota','This import and its accepted receipt cannot fit the retained source archive.');
}
const resultFor=p=>({imported:p.compilation.candidates.length,reportId:p.reportId,recordIds:p.compilation.candidates.map(r=>r.id)});
export async function previewFieldResponses(c,{org,session,input}){
 const request=validateFieldPreviewRequest(input),s=await resolved(c,org,session,request);if(s.mapping.sha256!==request.mappingSha256)stale();
 const selected=request.selection.responseIds.map(responseId=>s.rows.find(r=>r.responseId===responseId));need(selected.every(r=>r&&['new','excluded'].includes(r.disposition)),'field_selection');need(selected.some(r=>r.disposition==='new'),'field_empty');
 const candidateIds=selected.filter(r=>r.disposition==='new').map(r=>({responseId:r.responseId,recordId:id()}));need(candidateIds.every(r=>!s.records.some(v=>v.id===r.recordId)),'field_identity',409);
 const compilation=compileFieldObservationDrafts({inspection:s.inspection,mapping:s.mapping,selection:request.selection,orgId:org,actorId:s.auth.member.userId,integrationId:s.integration.id,candidateIds,program:ref(s.program),indicator:ref(s.indicator)});
 const payload={version:1,purpose:FIELD_PREVIEW_KIND,authority:authorityPin(s.auth),programId:s.program.id,indicatorId:s.indicator.id,integrationId:s.integration.id,mappingSha256:s.mapping.sha256,integrationSha256:connectionPin(s.integration),baseRevision:baseRevision(s.records),reportId:id(),compilation,accepted:null};
 const template={...payload,accepted:{keyHash:'f'.repeat(64),requestHash:'f'.repeat(64),result:resultFor(payload)}};await receiptHeadroom(c,org,template);
 const previewId=id();await storePreview(c,{org,previewId,actorId:s.auth.member.userId,kind:FIELD_PREVIEW_KIND,payload,checksum:hash(payload),baseRevision:payload.baseRevision});
 const row=(await c.query("SELECT to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS expires_at FROM os_previews WHERE org_id=$1 AND id=$2 AND actor_id=$3 AND kind=$4 AND committed_at IS NULL",[org,previewId,s.auth.member.userId,FIELD_PREVIEW_KIND])).rows;need(row.length===1);validateGroupExactStamp(row[0].expires_at);
 return {previewId,expiresAt:row[0].expires_at,manifest:compilation.manifest,records:compilation.candidates,summary:compilation.summary};
}
function payloadValue(input){
 const p=object(input,['version','purpose','authority','programId','indicatorId','integrationId','mappingSha256','integrationSha256','baseRevision','reportId','compilation','accepted']);need(p.version===1&&p.purpose===FIELD_PREVIEW_KIND);for(const key of ['programId','indicatorId','integrationId','reportId'])opaque(p[key]);for(const key of ['mappingSha256','integrationSha256','baseRevision'])fieldDigest(p[key]);p.compilation=validateFieldCompilation(p.compilation);need(p.compilation.candidates.length>0&&p.compilation.manifest.mapping.sha256===p.mappingSha256&&p.compilation.manifest.integrationId===p.integrationId&&p.compilation.manifest.mapping.program.recordId===p.programId&&p.compilation.manifest.mapping.indicator.recordId===p.indicatorId);object(p.authority,['actorId','sessionSha256','membershipSha256','memberCreatedAtExact','restoreEpochSha256']);opaque(p.authority.actorId);for(const key of ['sessionSha256','membershipSha256','restoreEpochSha256'])fieldDigest(p.authority[key]);validateGroupExactStamp(p.authority.memberCreatedAtExact);need(p.compilation.candidates.every(c=>c.ownerId===p.authority.actorId&&c.lastEditedBy===p.authority.actorId));
 if(p.accepted!==null){object(p.accepted,['keyHash','requestHash','result']);fieldDigest(p.accepted.keyHash);fieldDigest(p.accepted.requestHash);need(hash(p.accepted.result)===hash(resultFor(p)));}return p;
}
async function commandState(c,{org,session,input,readOnly}){
 const request=validateFieldCommitRequest(input),auth=await authority(c,org,session,{readOnly,write:true}),keyHash=H('key',{actorId:auth.member.userId,key:request.commandKey}),requestHash=H('request',request);
 const found=(await c.query("SELECT id,actor_id,kind,payload,committed_at IS NOT NULL AS committed,expires_at>clock_timestamp() AS current FROM os_previews WHERE org_id=$1 AND actor_id=$2 AND kind=$3 AND (id=$4 OR payload#>>'{accepted,keyHash}'=$5) ORDER BY id",[org,auth.member.userId,FIELD_PREVIEW_KIND,request.previewId,keyHash])).rows;
 if(!found.length)return {request,auth,keyHash,requestHash,row:null,payload:null};
 need(found.length===1,'field_command_conflict',409);const row=object(found[0],['id','actor_id','kind','payload','committed','current']);need(row.id===request.previewId&&row.actor_id===auth.member.userId&&row.kind===FIELD_PREVIEW_KIND&&typeof row.committed==='boolean'&&typeof row.current==='boolean','field_command_conflict',409);const payload=payloadValue(row.payload);
 if(hash(payload.authority)!==hash(authorityPin(auth)))stale();scope(await allRecords(c,org),payload.programId,auth.member);
 if(payload.accepted!==null){need(row.committed&&payload.accepted.keyHash===keyHash&&payload.accepted.requestHash===requestHash,'field_command_conflict',409);return {request,auth,keyHash,requestHash,row,payload,accepted:{...payload.accepted.result,replayed:true}};}
 need(!row.committed,'field_state',409);return {request,auth,keyHash,requestHash,row,payload};
}
export async function acceptedFieldResponseCommand(c,args){const s=await commandState(c,{...args,readOnly:true});return s.accepted||null;}
export async function commitFieldResponses(c,args){
 const s=await commandState(c,{...args,readOnly:false});if(s.accepted)return s.accepted;need(s.row&&s.row.current,'field_preview',409);const {org,session}=args,p=s.payload,records=await inventory(c,org),program=scope(records,p.programId,s.auth.member),indicator=records.find(r=>r.id===p.indicatorId&&!r.deletedAt&&r.moduleId==='outcomes'&&r.data.kind==='indicator'&&r.data.programId===program.id);if(!indicator)stale();
 const mapping=makeFieldMapping({orgId:org,program:ref(program),indicator:ref(indicator)}),integration=(await connections(c,org)).find(r=>r.id===p.integrationId);if(!integration||mapping.sha256!==p.mappingSha256||connectionPin(integration)!==p.integrationSha256||baseRevision(records)!==p.baseRevision)stale();
 const current=dispositions({rows:p.compilation.manifest.rows.map(({index,row,canonicalSha256})=>({index,row,canonicalSha256}))},mapping,p.integrationId,records,await history(c,org));need(current.every(r=>['new','excluded'].includes(r.disposition)),'field_source_conflict',409);
 const drafts=p.compilation.candidates.map(c=>({...c,orgId:org}));need(drafts.every(d=>!records.some(r=>r.id===d.id)),'field_identity',409);
 for(const draft of drafts){const checked=validateRecord('outcomes',draft.data,{orgId:org,recordId:draft.id,status:'draft',records:[...records,...drafts]});need(hash(checked)===hash(draft.data),'field_normalization');}
 const time=(await c.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS exact",[])).rows;need(time.length===1);validateGroupExactStamp(time[0].exact);
 for(const draft of drafts)await saveRecord(c,draft);
 const report=makeFieldResponseReportRow({orgId:org,id:p.reportId,actorId:s.auth.member.userId,createdAtExact:time[0].exact,payload:p.compilation.manifest});await appendFieldResponseReport(c,report);
 await audit(c,org,s.auth.member.userId,'field-response.imported',null,{reportId:report.id,checksum:report.checksum,recordIds:drafts.map(r=>r.id),excluded:p.compilation.summary.excludedRows,fileSha256:p.compilation.manifest.file.sha256});
 const result=resultFor(p),next={...p,accepted:{keyHash:s.keyHash,requestHash:s.requestHash,result}};await receiptHeadroom(c,org,next);
 const updated=await c.query('UPDATE os_previews SET payload=$5::jsonb,checksum=$6 WHERE org_id=$1 AND id=$2 AND actor_id=$3 AND kind=$4 AND committed_at IS NULL AND expires_at>clock_timestamp() RETURNING id',[org,s.request.previewId,s.auth.member.userId,FIELD_PREVIEW_KIND,JSON.stringify(next),hash(next)]);need(updated.rowCount===1,'field_preview',409);
 await commitPreview(c,org,s.request.previewId);await checkWorkspaceExportCapacity(c,org);return {...result,replayed:false};
}
