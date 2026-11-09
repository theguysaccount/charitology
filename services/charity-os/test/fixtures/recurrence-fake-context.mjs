/** Fictional query results only. Not PostgreSQL, BetterAuth, a transaction,
 * row-origin, SQL-composite byte measurement, actual clock or COMMIT proof. */
import {validateRecord,getModule} from '../../lib/modules.mjs';
import {readRecurrenceSourceContext} from '../../lib/participation-recurrence-context.mjs';
import {recurringOccurrenceAnchor,RECURRING_METHOD} from '../../lib/participation-recurrence-planner.mjs';
import {makeRecurringOccurrencePreview,makeRecurringOccurrenceManifest,makeRecurringOccurrenceReportRow,makeRecurringOccurrenceReceipt,recurringOccurrenceCommandHashes,RECURRENCE_PACKET_KIND} from '../../lib/participation-recurrence-packets.mjs';
import {hash,stable} from '../../lib/security.mjs';
export const ORG='fictional-org',ACTOR='fictional-writer',AT='2026-11-02T00:00:00.000001Z',CREATED='2026-10-31T00:00:00.123456Z',UPDATED='2026-11-01T00:00:00.654321Z';
export const session=()=>({user:{id:ACTOR},session:{id:'fictional-session'}});
export const request=()=>({previewId:'fictional-preview',commandKey:'fictional-original-command-0001'});
const result=rows=>({rows,rowCount:rows.length});
export function fakeContext(moduleId='events'){
  const f={org:ORG,role:'program_lead',programIds:['fictional-program'],sessionValid:true,memberRevision:1,memberCreated:CREATED,epoch:null,calls:[],previews:[],reports:[],writes:0,domainClocks:0,current:true,stopAtCapacity:false,previewEligible:true,previewEligibilityChecks:0,transactions:[],onTxEnd:null};
  const program={id:'fictional-program',orgId:ORG,moduleId:'programs'},training={id:'fictional-training',orgId:ORG,moduleId:'safeguarding'};
  const data=validateRecord(moduleId,{title:'Fictional template',kind:moduleId==='events'?'session':'shift',programId:program.id,startAt:'2026-11-01T09:00:00.123Z',endAt:'2026-11-01T10:00:00.456Z',timeZone:'UTC',capacity:3,participantInstructions:'Fictional first line\nSecond line',organizerEmail:'invalid',...(moduleId==='volunteers'?{skills:'Fictional skill',safeguardingId:training.id,allowPartialIntervals:true}:{})},{orgId:ORG,recordId:'fictional-template',status:'draft',records:[program,training]});
  const raw=(id,module_id,data)=>({org_id:ORG,id,module_id,data,status:getModule(module_id).workflow.initial,owner_id:ACTOR,last_editor_id:ACTOR,revision:1,approval:null,snapshot:null,source:null,deleted_at:null,created_at:CREATED,updated_at:UPDATED});
  f.records=[raw('fictional-template',moduleId,data),raw(program.id,'programs',{title:'Fictional program',programId:null}),...(moduleId==='volunteers'?[raw(training.id,'safeguarding',{title:'Fictional training',programId:program.id})]:[])];
  const member=()=>({user_id:ACTOR,role:f.role,program_ids:[...f.programIds],revision:f.memberRevision,created_exact:f.memberCreated});
  f.c={async query(sql,args=[]){
    f.calls.push({sql,args:structuredClone(args)});if(/^(?:INSERT|UPDATE|DELETE)/.test(sql))f.writes++;if(sql.includes('WITH processing AS MATERIALIZED')){f.domainClocks++;throw Object.assign(Error('Intentional fake clock boundary'),{code:'fake_clock_boundary'});}
    if(sql.startsWith('WITH preview_eligibility AS MATERIALIZED')){f.previewEligibilityChecks++;return result([{eligible:f.previewEligible}]);}
    if(sql==="SET LOCAL TIME ZONE 'UTC'")return result([]);
    if(sql.startsWith('SELECT s.id AS session_id'))return result(f.sessionValid?[{session_id:args[0],user_id:args[1],current_user_id:args[1]}]:[]);
    if(sql.startsWith('SELECT user_id,role,program_ids,revision'))return result(args[0]===ORG?[member()]:[]);
    if(sql.startsWith('SELECT id,module_id,status,revision,data->>')){
      return result(f.records.filter(r=>r.org_id===args[0]&&args[1].includes(r.id)).sort((a,b)=>a.module_id<b.module_id?-1:a.module_id>b.module_id?1:a.id<b.id?-1:1).map(r=>({id:r.id,module_id:r.module_id,status:r.status,revision:r.revision,program_id:r.data.programId??null,safeguarding_id:r.data.safeguardingId??null,deleted:r.deleted_at!==null,created_exact:r.created_at,updated_exact:r.updated_at,deleted_exact:r.deleted_at})));
    }
    if(sql.startsWith('SELECT (SELECT jsonb_object_agg')){const r=f.records.find(r=>r.org_id===args[0]&&r.id===args[1]&&r.deleted_at===null);return result(r?[{data:Object.fromEntries(Object.entries(r.data).filter(([k])=>args[2].includes(k))),keys_valid:Object.keys(r.data).every(k=>args[3].includes(k))}]:[]);}
    if(sql.startsWith('SELECT octet_length(convert_to(to_jsonb(t)::text')){
      const r=f.records.find(r=>r.org_id===args[0]&&r.id===args[1]);if(!r)return result([]);const b=Buffer.from(JSON.stringify(r));return result([{bytes:b.length,...(sql.includes('substring(')?{chunk:b.subarray(args[2]-1,args[2]-1+65536)}:{})}]);
    }
    if(sql.startsWith('WITH selected AS (SELECT record_id'))return result([{org_created_exact:CREATED,backup_restored_id:f.epoch,records:[...args[1]].sort().map(recordId=>({recordId,lastRestoredAuditId:null}))}]);
    if(sql.startsWith('SELECT t.org_id,t.id,t.actor_id,t.kind')){
      const all=f.previews.filter(r=>r.org_id===args[0]&&(args[1]===null||r.actor_id===args[1])&&r.kind===args[2]);
      const chosen=sql.includes("t.payload->>'commandSha256'")?all.filter(r=>r.id===args[3]||r.committed_at!==null&&r.payload.commandSha256===args[4]):sql.includes('t.committed_at IS NULL AND ($4')?all.filter(r=>r.committed_at===null&&r.id!==args[3]):all.filter(r=>r.id===args[3]);
      return result(chosen.map(r=>({...structuredClone(r),current:r.committed_at===null?f.current:false})));
    }
    if(sql.startsWith('SELECT r.org_id,r.id,r.created_by')){
      let chosen=f.reports.filter(r=>r.org_id===args[0]);if(sql.includes('r.id=$2'))chosen=chosen.filter(r=>r.id===args[1]);else chosen=chosen.filter(r=>r.payload.format.startsWith('charitology-participation-occurrence-generation'));
      if(sql.includes('r.id COLLATE "C">'))chosen=chosen.filter(r=>args[1]===null||r.id>args[1]);chosen.sort((a,b)=>a.id<b.id?-1:1);if(args[2]!==undefined)chosen=chosen.slice(0,args[2]);return result(structuredClone(chosen));
    }
    if(sql.startsWith('SELECT id FROM os_records WHERE'))return result(f.records.filter(r=>r.org_id===args[0]&&args[1].includes(r.id)).slice(0,1).map(r=>({id:r.id})));
    if(sql.startsWith('SELECT id FROM os_reports WHERE'))return result(f.reports.filter(r=>r.org_id===args[0]&&(Array.isArray(args[1])?args[1].includes(r.id):r.id===args[1])).slice(0,1).map(r=>({id:r.id})));
    if(sql.startsWith('SELECT id FROM os_previews WHERE'))return result(f.previews.filter(r=>r.org_id===args[0]&&args[1].includes(r.id)&&r.id!==args[2]).slice(0,1).map(r=>({id:r.id})));
    if(sql.startsWith('SELECT octet_length(to_jsonb(t)::text) AS bytes FROM os_previews')){
      const r=f.previews.find(r=>r.org_id===args[0]&&r.id===args[1]&&r.actor_id===args[2]&&r.kind===args[3]&&r.checksum===args[4]&&stable(r.payload)===stable(JSON.parse(args[5]))&&r.expires_at===args[6]&&r.created_at===args[7]&&r.base_revision===args[8]&&r.committed_at===null&&f.current);return result(r?[{bytes:Buffer.byteLength(JSON.stringify(r))}]:[]);
    }
    if(sql.startsWith('SELECT t.relname AS table_name')&&f.stopAtCapacity)throw Object.assign(Error('Intentional fake capacity boundary'),{code:'fake_capacity_boundary'});
    throw Error('Unimplemented fictional query: '+sql.slice(0,90));
  }};
  f.db={async tx(user,org,fn,options={}){const entry={user,org,...options,settled:false,error:null};f.transactions.push(entry);try{const out=await fn(f.c);entry.settled=true;if(f.onTxEnd)await f.onTxEnd(f.transactions.length,out);return out;}catch(e){entry.settled=true;entry.error=e.code??e.name;throw e;}},async limit(...args){f.calls.push({rate:args});}};
  return f;
}
export async function packets(f,{committed=true}={}){
  const context=await readRecurrenceSourceContext(f.c,{org:ORG,session:session(),sourceId:'fictional-template',write:false});
  const schedule={format:'charitology-participation-recurrence',version:1,method:RECURRING_METHOD,timeZone:'UTC',anchor:recurringOccurrenceAnchor({startAt:context.source.data.startAt,endAt:context.source.data.endAt,timeZone:context.source.data.timeZone,intervalWeeks:1}),intervalWeeks:1,count:2,exceptions:[],resolutions:[1,2].map(sequence=>({sequence,start:null,end:null}))};
  const input={orgId:ORG,actorId:ACTOR,source:context.source,schedule,titles:[1,2].map(sequence=>({sequence,title:'Fictional occurrence '+sequence})),children:[1,2].map(sequence=>({sequence,id:'fictional-child-'+sequence})),references:context.references};
  const preview=makeRecurringOccurrencePreview({orgId:ORG,actorId:ACTOR,reportId:'fictional-report',authority:context.authority,dependencies:context.dependencies,input});
  const manifest=makeRecurringOccurrenceManifest({reportId:'fictional-report',recordedAtExact:AT,compiled:preview.review.compiled,dependencies:context.dependencies}),report=makeRecurringOccurrenceReportRow({orgId:ORG,id:manifest.reportId,actorId:ACTOR,createdAtExact:AT,payload:manifest});
  const hashes=recurringOccurrenceCommandHashes({orgId:ORG,actorId:ACTOR,...request()}),receipt=makeRecurringOccurrenceReceipt({manifest,authority:context.authority,keyHash:hashes.commandSha256,requestHash:hashes.requestSha256});
  const payload=committed?receipt:preview,row={org_id:ORG,id:request().previewId,actor_id:ACTOR,kind:RECURRENCE_PACKET_KIND,payload,checksum:hash(payload),base_revision:preview.dependenciesSha256,created_at:AT,expires_at:'2026-11-02T00:30:00.000001Z',committed_at:committed?AT:null};
  f.previews=[row];f.reports=committed?[structuredClone(report)]:[];f.calls.length=0;return{context,input,preview,manifest,report,receipt,row};
}
