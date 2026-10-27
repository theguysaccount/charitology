import {fail,hash,stable} from "./security.mjs";
import {logicalBackupBytes} from "./database.mjs";
import {DIRECTORY_LIMITS,directoryClosed,directoryIsHash,validateCaptureFile} from "./directory-catalog.mjs";
import {directoryPrivateHash} from "./directory-resource-model.mjs";

export const DIRECTORY_TABLE="os_resource_directory_history";
export const jsonbText=value=>{
 if(value===null||typeof value!=="object")return JSON.stringify(value);
 if(Array.isArray(value))return "["+value.map(jsonbText).join(", ")+"]";
 return "{"+Object.keys(value).map(k=>JSON.stringify(k)+": "+jsonbText(value[k])).join(", ")+"}";
};
export const directoryPayloadBytes=value=>Buffer.byteLength(jsonbText(value));
export const directoryBudgetBytes=value=>directoryPayloadBytes(value)+DIRECTORY_LIMITS.reserveBytes;
const quota=()=>fail(422,"directory_quota","This organization reached its retained directory history limit. Export existing evidence before continuing.");
const conflict=()=>fail(409,"directory_identity","This Resource has conflicting retained directory history.");
export async function directoryHistoryRows(c,org){
 return (await c.query("SELECT * FROM os_resource_directory_history WHERE org_id=$1 ORDER BY row_kind,capture_id,binding_id,sequence,id",[org])).rows;
}
export function directoryBinding(rows){
 if(!rows.length)return null;
 const events=rows.filter(r=>r.row_kind==="event").sort((a,b)=>a.sequence-b.sequence);
 if(!events.length)return null;
 const first=events[0],last=events.at(-1);
 if(first.sequence!==1||events.some((r,i)=>r.sequence!==i+1||r.binding_id!==first.binding_id||r.resource_id!==first.resource_id||r.catalog_kind!==first.catalog_kind||r.listing_id!==first.listing_id))conflict();
 return {id:first.binding_id,resourceId:first.resource_id,catalogKind:first.catalog_kind,listingId:first.listing_id,originMode:last.origin_mode,historyHeadSha256:last.payload.packetSha256,sequence:last.sequence,selection:last.payload.packet.selection,events:events.map(r=>({...r.payload,provenance:r.origin_mode}))};
}
export async function bindingByResource(c,org,resourceId){
 return directoryBinding((await c.query("SELECT * FROM os_resource_directory_history WHERE org_id=$1 AND row_kind='event' AND resource_id=$2 ORDER BY sequence",[org,resourceId])).rows);
}
export async function bindingByIdentity(c,org,kind,listingId){
 return directoryBinding((await c.query("SELECT * FROM os_resource_directory_history WHERE org_id=$1 AND row_kind='event' AND catalog_kind=$2 AND listing_id=$3 ORDER BY sequence",[org,kind,listingId])).rows);
}
export async function directoryRestoreEpoch(c,org,recordId){
 return (await c.query("SELECT max(id)::text AS epoch FROM os_events WHERE org_id=$1 AND record_id=$2 AND action='record.restored'",[org,recordId])).rows[0].epoch;
}
export async function directoryTableUsage(c,org){
 const r=(await c.query("SELECT count(*) AS rows,count(*) FILTER(WHERE row_kind='event' AND sequence=1) AS bindings,COALESCE(sum(GREATEST(octet_length(to_jsonb(t)::text),budget_bytes)),0) AS bytes FROM os_resource_directory_history t WHERE org_id=$1",[org])).rows[0];
 return Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Number(v)]));
}
export async function insertDirectoryRow(c,org,row){
 const {payload}=row;
 const measured=Number((await c.query("SELECT octet_length($1::jsonb::text) AS bytes",[JSON.stringify(payload)])).rows[0].bytes);
 if(measured!==directoryPayloadBytes(payload))fail(422,"directory_size","The measured directory packet does not match its admitted serialization.");
 if(measured>DIRECTORY_LIMITS.payloadBytes)quota();
 const budget=measured+DIRECTORY_LIMITS.reserveBytes,usage=await directoryTableUsage(c,org);
 if(usage.rows+1>DIRECTORY_LIMITS.rows||usage.bytes+budget>DIRECTORY_LIMITS.featureBytes||(row.rowKind==="event"&&row.sequence===1&&usage.bindings+1>DIRECTORY_LIMITS.bindings))quota();
 if(await logicalBackupBytes(c,org)+budget>60*1024*1024)fail(422,"quota","This workspace reached its logical export budget.");
 const result=await c.query("INSERT INTO os_resource_directory_history(org_id,id,row_kind,capture_id,binding_id,sequence,resource_id,catalog_kind,listing_id,origin_mode,command_hash,request_hash,actor_binding_hash,payload,budget_bytes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING GREATEST(octet_length(to_jsonb(os_resource_directory_history)::text),budget_bytes) AS charged",[org,row.id,row.rowKind,row.captureId,row.bindingId??null,row.sequence??null,row.resourceId??null,row.catalogKind??null,row.listingId??null,row.originMode,row.commandHash??null,row.requestHash??null,row.actorBindingHash??null,JSON.stringify(payload),budget]);
 if(Number(result.rows[0].charged)>budget)fail(422,"directory_size","The directory row exceeded its fixed recovery allowance.");
}
export async function ensureDirectoryCapture(c,org,value,originMode="live"){
 const file=validateCaptureFile(value),existing=(await c.query("SELECT * FROM os_resource_directory_history WHERE org_id=$1 AND row_kind='capture' AND capture_id=$2",[org,file.captureId])).rows[0];
 if(existing){if(stable(existing.payload)!==stable(file))conflict();return;}
 await insertDirectoryRow(c,org,{id:directoryPrivateHash("capture-row",{captureId:file.captureId}),rowKind:"capture",captureId:file.captureId,originMode,payload:file});
}
export async function insertDirectoryEvent(c,org,event,{originMode="live",commandHash=null,requestHash=null,actorBindingHash=null}={}){
 directoryClosed(event,["packet","packetSha256"]);const p=event.packet;
 if(!directoryIsHash(event.packetSha256))conflict();
 await insertDirectoryRow(c,org,{id:event.packetSha256,rowKind:"event",captureId:p.selection.captureId,bindingId:p.bindingId,sequence:p.sequence,resourceId:p.resourceId,catalogKind:p.catalogKind,listingId:p.listingId,originMode,commandHash,requestHash,actorBindingHash,payload:event});
}
export async function directoryAcceptedCommand(c,org,commandHash){
 return (await c.query("SELECT * FROM os_resource_directory_history WHERE org_id=$1 AND row_kind='event' AND origin_mode='live' AND command_hash=$2",[org,commandHash])).rows[0]??null;
}

