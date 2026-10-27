import {fail,stable} from "./security.mjs";
import {DIRECTORY_METHOD,DIRECTORY_LIMITS,directoryClosed,directoryOwned,directoryFreeze,directoryIsHash,validateCaptureFile} from "./directory-catalog.mjs";
import {validateDirectoryEvent,directoryEventSha256} from "./directory-resource-model.mjs";
import {directoryHistoryRows,directoryPayloadBytes,directoryBudgetBytes,ensureDirectoryCapture,insertDirectoryEvent} from "./directory-resource-store.mjs";
const opaque=v=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
const invalid=()=>fail(422,"directory_backup","The retained directory evidence is invalid or exceeds its limits.");
export function restoredDirectoryResources(input,{records=[],trash=[]}={}){
 if(input===undefined)return null;
 const value=directoryOwned(input,{bytes:DIRECTORY_LIMITS.featureBytes});
 directoryClosed(value,["format","version","method","captures","bindings"]);
 if(value.format!=="charitology-directory-resources"||value.version!==1||value.method!==DIRECTORY_METHOD||!Array.isArray(value.captures)||!Array.isArray(value.bindings)||value.bindings.length>DIRECTORY_LIMITS.bindings)invalid();
 const captures=new Map(),usedCaptures=new Set(),ids=new Set(),identities=new Set(),packetIds=new Set(),resourceIds=new Set(),sources=new Map();
 for(const record of [...records,...trash]){if(!opaque(record.id)||sources.has(record.id))invalid();sources.set(record.id,record);}
 let rows=0,bytes=0;
 for(const raw of value.captures){
  const c=validateCaptureFile(raw);
  if(captures.has(c.captureId)||directoryPayloadBytes(c)>DIRECTORY_LIMITS.payloadBytes)invalid();
  captures.set(c.captureId,c);rows++;bytes+=directoryBudgetBytes(c);
 }
 for(const binding of value.bindings){
  directoryClosed(binding,["id","resourceId","catalogKind","listingId","events"]);
  if(!opaque(binding.id)||!opaque(binding.resourceId)||ids.has(binding.id)||resourceIds.has(binding.resourceId)||!["tools","benefits"].includes(binding.catalogKind)||typeof binding.listingId!=="string"||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(binding.listingId)||!Array.isArray(binding.events)||!binding.events.length||binding.events.length>DIRECTORY_LIMITS.events)invalid();
  ids.add(binding.id);resourceIds.add(binding.resourceId);const identity=binding.catalogKind+":"+binding.listingId;if(identities.has(identity))invalid();identities.add(identity);
  const record=sources.get(binding.resourceId);if(record&&record.moduleId!=="resources")invalid();
  let previous=null;const entries=[];
  for(const event of binding.events){
   directoryClosed(event,["packet","packetSha256","provenance"]);
   if(!["live","recovered"].includes(event.provenance)||!directoryIsHash(event.packetSha256)||packetIds.has(event.packetSha256))invalid();
   if(!record&&event.provenance!=="recovered")invalid();
   const capture=captures.get(event.packet?.selection?.captureId);if(!capture)invalid();
   const packet=validateDirectoryEvent(event.packet,{captureFile:capture,previousPacket:previous,limitationsEntries:entries});
   if(directoryEventSha256(packet)!==event.packetSha256||packet.bindingId!==binding.id||packet.resourceId!==binding.resourceId||packet.catalogKind!==binding.catalogKind||packet.listingId!==binding.listingId)invalid();
   const payload={packet,packetSha256:event.packetSha256};if(directoryPayloadBytes(payload)>DIRECTORY_LIMITS.payloadBytes)invalid();
   packetIds.add(event.packetSha256);usedCaptures.add(capture.captureId);rows++;bytes+=directoryBudgetBytes(payload);
   previous=packet;entries.push(packet.frozenEntry);
  }
 }
 if(rows>DIRECTORY_LIMITS.rows||bytes>DIRECTORY_LIMITS.featureBytes||usedCaptures.size!==captures.size)invalid();
 return directoryFreeze(value);
}
export async function exportDirectoryResources(c,org,{records=[],trash=[]}={}){
 const rows=await directoryHistoryRows(c,org);if(!rows.length)return undefined;
 const captures=rows.filter(r=>r.row_kind==="capture").map(r=>r.payload),groups=new Map();
 for(const row of rows.filter(r=>r.row_kind==="event")){
  let binding=groups.get(row.binding_id);
  if(!binding){binding={id:row.binding_id,resourceId:row.resource_id,catalogKind:row.catalog_kind,listingId:row.listing_id,events:[]};groups.set(row.binding_id,binding);}
  binding.events.push({...row.payload,provenance:row.origin_mode});
 }
 for(const b of groups.values())b.events.sort((a,b)=>a.packet.sequence-b.packet.sequence);
 return restoredDirectoryResources({format:"charitology-directory-resources",version:1,method:DIRECTORY_METHOD,captures,bindings:[...groups.values()].sort((a,b)=>a.id.localeCompare(b.id))},{records,trash});
}
export async function restoreDirectoryResources(c,org,input,context){
 const admitted=restoredDirectoryResources(input,context);if(!admitted)return;
 if(Number((await c.query("SELECT count(*) AS count FROM os_resource_directory_history WHERE org_id=$1",[org])).rows[0].count))fail(409,"restore_conflict","Restore requires an organization without directory review history.");
 for(const capture of admitted.captures)await ensureDirectoryCapture(c,org,capture,"recovered");
 for(const binding of admitted.bindings)for(const {packet,packetSha256}of binding.events)await insertDirectoryEvent(c,org,{packet,packetSha256},{originMode:"recovered"});
}

