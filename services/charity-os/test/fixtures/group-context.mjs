/** Shared closed fake SELECTs only. Actual context/access/store readers execute;
 * no PostgreSQL, row-lock, transaction, real session or booking proof. */
import { readGroupContext, GROUP_CONTEXT_SQL as SQL } from "../../lib/participation-group-context.mjs";
import { participationTerms } from "../../lib/participation.mjs";
import { hash } from "../../lib/security.mjs";
import { GROUP_COLLECTION_SQL } from "../../lib/participation-group-read-routes.mjs";

const ORG = "fictional_org", USER = "fictional_user", SID = "fictional_session", SHA = "a".repeat(64);
const stamp = "2026-11-08T12:00:00.123456Z", next = "2026-11-08T12:00:00.123457Z";
const session = () => ({ session: { id: SID }, user: { id: USER, emailVerified: false } });
const result = rows => ({ rows, rowCount: rows.length });
const code = expected => e => e.status === 404 && e.code === expected;
const keys = { os_records: "id", os_participation_targets: "target_id", os_participations: "id", os_intake: "id", os_publications: "id" };
const range = (a="09",b="11") => ({ startAt: `2099-01-02T${a}:00:00Z`, endAt: `2099-01-02T${b}:00:00Z`, timeZone: "UTC" });
function fixture({ moduleId = "events" } = {}) {
  const tables = Object.fromEntries(Object.keys(keys).map(t => [t,new Map()])), calls = [], restored = new Map();
  const member = { user_id: USER, role: "owner", program_ids: [], revision: 1, created_exact: stamp };
  function record(id,module_id,data,status="approved") {
    const row={org_id:ORG,id,module_id,data,status,revision:4,last_editor_id:"fictional_author",owner_id:USER,
      approval:{status:"approved",revision:4,actorId:"fictional_reviewer"},snapshot:null,source:null,deleted_at:null,created_at:stamp,updated_at:stamp};
    tables.os_records.set(id,row);return row;
  }
  const source=record("target",moduleId,{title:"Fictional occurrence",kind:moduleId==="events"?"session":"shift",...range(),capacity:2,
    participationPurpose:"Fictional scheduling only.",participantInstructions:null,organizerEmail:"organizer@example.invalid",organizerUrl:null,
    ...(moduleId==="volunteers"?{allowPartialIntervals:true}:{})},moduleId==="events"?"scheduled":"open");
  const terms=participationTerms({id:source.id,orgId:ORG,moduleId,data:source.data});
  const t={org_id:ORG,target_id:"target",module_id:moduleId,mode:"managed",revision:2,recovery_block:false};tables.os_participation_targets.set("target",t);
  function person(id,state="requested",targetId="target",contactId=id+"_contact") {
    record(id+"_booking",moduleId,{title:"Fictional candidate",kind:moduleId==="events"?"registration":"assignment",
      [moduleId==="events"?"eventId":"shiftId"]:targetId,contactId});
    record(contactId,"contacts",{title:"Fictional contact",kind:"person"});
    const row={org_id:ORG,id,target_id:targetId,module_id:moduleId,booking_record_id:id+"_booking",contact_id:contactId,intake_id:null,
      revision:3,state,source:"staff",recovered:false,recovered_state:null,requested_interval:null,frozen:null,confirmed_at:null,
      consent:{revision:1,sourceRevision:4,termsHash:hash(terms),terms:structuredClone(terms),at:"2026-11-01T00:00:00Z",waitlistAllowed:true,emailUpdates:false},
      created_at:stamp,updated_at:stamp};tables.os_participations.set(id,row);return row;
  }
  const p1=person("p1"),p2=person("p2"), queue=[];
  const receipt={version:1,groupId:"group_1",operation:"create",commandHash:SHA,requestHash:SHA,
    authority:{actorSha256:SHA,sessionSha256:SHA,membershipSha256:SHA,memberCreatedAtExact:stamp,restoreEpochSha256:SHA},
    reviewSha256:null,acceptedAtExact:stamp,result:{groupId:"group_1",groupRevision:1,state:"draft",target:{targetId:"target",moduleId},rosterIds:["p1","p2"],coordinatorIntakeId:null}};
  const group={org_id:ORG,id:"group_1",origin_mode:"live",module_id:moduleId,live_target_id:"target",roster_ids:["p1","p2"],coordinator_intake_id:null,
    state:"draft",revision:1,last_command_hash:SHA,history:null,created_at_exact:stamp,updated_at_exact:stamp};
  const groups=new Map([[group.id,{row:group,receipts:[receipt]}]]);
  const metadata=r=>({id:r.id,module_id:r.module_id,status:r.status,kind:r.data.kind??null,program_id:r.data.programId??null,
    contact_id:r.data.contactId??null,event_id:r.data.eventId??null,shift_id:r.data.shiftId??null,safeguarding_id:r.data.safeguardingId??null});
  const part=p=>Object.fromEntries(["id","target_id","module_id","booking_record_id","contact_id","intake_id","state","recovered","recovered_state"].map(k=>[k,p[k]]));
  const f={tables,calls,restored,member,source,t,p1,p2,group,receipt,groups,queue,record,person,missingSession:false};
  f.addGroup=(id,rosterIds=['p1','p2'])=>{
    const first=structuredClone(receipt),row=structuredClone(group);
    first.groupId=id;first.result.groupId=id;first.result.rosterIds=[...rosterIds].sort();
    first.commandHash=hash({fixture:'group-context',groupId:id,step:1});
    row.id=id;row.roster_ids=[...rosterIds].sort();row.last_command_hash=first.commandHash;
    const value={row,receipts:[first]};groups.set(id,value);return value;
  };
  f.c={async query(sql,args=[]) {
    calls.push({sql,args:structuredClone(args)});
    if(sql===SQL.lock||sql===SQL.utc)return result([]);
    if(sql===SQL.targetSeed){const row=tables.os_records.get(args[1]);return result(row&&row.deleted_at==null?[{id:row.id,module_id:row.module_id}]:[]);}
    if(sql===SQL.groupSeed||sql===SQL.receiptSeed){
      const value=sql===SQL.groupSeed?groups.get(args[1]):[...groups.values()].find(g=>g.receipts.some(r=>r.commandHash===args[1]));
      const row=value?.row;return result(row?[{id:row.id,module_id:row.module_id,live_target_id:row.live_target_id,origin_mode:row.origin_mode}]:[]);
    }
    if(sql===GROUP_COLLECTION_SQL)return result([...groups.values()].map(g=>g.row)
      .filter(g=>g.org_id===args[0]&&g.origin_mode==='live'&&g.live_target_id===args[1]&&(args[2]===null||g.id>args[2]))
      .sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).slice(0,101).map(g=>({id:g.id})));
    if(sql.startsWith('SELECT s.id AS session_id'))return result(f.missingSession?[]:[{session_id:SID,user_id:USER,current_user_id:USER}]);
    if(sql.startsWith('SELECT user_id,role,program_ids,revision,'))return result([member]);
    if(sql.startsWith('SELECT org_id,id,origin_mode,module_id,live_target_id,roster_ids,coordinator_intake_id,state,revision,last_command_hash,history,to_char'))return result(groups.has(args[1])?[groups.get(args[1]).row]:[]);
    if(sql==='SELECT org_id,command_hash,group_id,receipt FROM os_participation_group_receipts WHERE org_id=$1 AND group_id=$2 ORDER BY command_hash LIMIT 13')
      return result((groups.get(args[1])?.receipts??[]).filter(r=>groups.get(args[1]).row.origin_mode==='live')
        .sort((a,b)=>a.commandHash<b.commandHash?-1:1).map(receipt=>({org_id:ORG,group_id:args[1],command_hash:receipt.commandHash,receipt})));
    if(sql===SQL.records||sql===SQL.selectedRecords)return result([...tables.os_records.values()].filter(r=>r.deleted_at==null&&(sql===SQL.records||args[1].includes(r.id))).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(metadata));
    if(sql===SQL.parts||sql===SQL.roster)return result([...tables.os_participations.values()].filter(p=>sql===SQL.parts||args[1].includes(p.id)).sort((a,b)=>a.id<b.id?-1:1).map(part));
    if(sql===SQL.queue)return result(queue.map(id=>({id})));
    if(sql===SQL.targets)return result([...tables.os_participation_targets.keys()].sort().map(target_id=>({target_id})));
    if(sql===SQL.recordBudget||sql===SQL.partBudget){const values=[...(sql===SQL.recordBudget?tables.os_records:tables.os_participations).values()];const bytes=String(Buffer.byteLength(JSON.stringify(values)));return result([{count:values.length,bytes,...(sql===SQL.partBudget?{interval_charged_bytes:bytes,charged_bytes:bytes}:{})}]);}
    let sizes=sql.match(/^SELECT count\(\*\)::int AS count,COALESCE\(sum\(octet_length\(convert_to\(to_jsonb\(t\)::text,'UTF8'\)\)\),0\)::text AS bytes FROM (os_[a-z_]+) t WHERE org_id=\$1 AND (?:id|target_id)=ANY\(\$2::text\[\]\)$/);
    if(sizes&&Object.hasOwn(tables,sizes[1])){const values=[...new Set(args[1])].filter(id=>tables[sizes[1]].has(id)).map(id=>tables[sizes[1]].get(id));return result([{count:values.length,bytes:String(values.reduce((n,row)=>n+Buffer.byteLength(JSON.stringify(row)),0))}]);}
    let m=sql.match(/^SELECT (id|target_id) FROM (os_[a-z_]+) WHERE org_id=\$1 AND \1=ANY\(\$2::text\[\]\) ORDER BY \1 COLLATE "C" FOR UPDATE$/);
    if(m&&Object.hasOwn(tables,m[2]))return result([...new Set(args[1])].sort().filter(id=>tables[m[2]].has(id)).map(id=>({[m[1]]:id})));
    m=sql.match(/^SELECT octet_length\(convert_to\(to_jsonb\(t\)::text,'UTF8'\)\) AS bytes(?:,substring\(convert_to\(to_jsonb\(t\)::text,'UTF8'\) FROM \$3::integer FOR 65536\) AS chunk)? FROM (os_[a-z_]+) t WHERE org_id=\$1 AND (?:id|target_id)=\$2$/);
    if(m&&Object.hasOwn(tables,m[1])){const row=tables[m[1]].get(args[1]);if(!row)return result([]);const bytes=Buffer.from(JSON.stringify(row));return result([{bytes:bytes.length,...(args.length===3?{chunk:bytes.subarray(args[2]-1,args[2]-1+65536)}:{})}]);}
    m=sql.match(/^SELECT to_jsonb\(t\)::text AS json_text FROM (os_[a-z_]+) t WHERE org_id=\$1 AND (?:id|target_id)=\$2$/);
    if(m&&Object.hasOwn(tables,m[1])){const row=tables[m[1]].get(args[1]);return result(row?[{json_text:JSON.stringify(row)}]:[]);}
    if(sql.startsWith('WITH selected AS (SELECT record_id FROM unnest'))return result([{org_created_exact:stamp,backup_restored_id:null,records:args[1].map(recordId=>({recordId,lastRestoredAuditId:restored.get(recordId)??null}))}]);
    if(sql.startsWith('WITH moment AS MATERIALIZED'))return result([{at_exact:stamp,expires_at_exact:'2026-11-08T12:10:00.123456Z',epoch_microseconds:(BigInt(Date.parse(stamp.slice(0,23)+'Z'))*1000n+456n).toString(),within_window:true}]);
    if(sql==='SELECT status,cancelled_at FROM os_intake WHERE org_id=$1 AND id=$2'){const row=tables.os_intake.get(args[1]);return result(row?[{status:row.status,cancelled_at:row.cancelled_at}]:[]);}
    throw new Error('Unexpected closed context SQL: '+sql);
  }};
  f.args=(operation="read",patch={})=>({org:ORG,session:session(),seed:operation==="create"?{kind:"target",targetId:"target",rosterIds:["p2","p1"],coordinatorIntakeId:null}:{kind:"group",groupId:group.id},
    operation,readOnly:["read","admission-preview","cancellation-preview"].includes(operation),...patch});
  f.read=(operation="read",patch={})=>readGroupContext(f.c,f.args(operation,patch));
  return f;
}

export { ORG, USER, SID, SHA, stamp, next, session, result, code, range, fixture };
