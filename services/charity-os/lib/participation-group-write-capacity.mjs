/** Ordinary GROUP admission only. Caller owns one fresh authorized tenant lock/
 * transaction. Every measurement uses that actual c; no projected SQL facade,
 * public override, permission grant, group ID or domain clock is created here. */
import { isProxy } from "node:util/types";
import { hash } from "./security.mjs";
import { GROUP_LIMITS as L, ParticipationGroupError, ownGroupValue, groupCanonical,
  validateGroupCreate, validateGroupReceipt, projectGroupHistory, groupCommandHashes } from "./participation-group-model.mjs";
import { groupStateCount, loadGroupInventory } from "./participation-group-store.mjs";
import { measureGroupCapacity, GROUP_CAPACITY_SQL } from "./participation-group-capacity.mjs";
import { projectGroupFutureExit, GROUP_EXIT_MAX_STAMP } from "./participation-group-exit-projection.mjs";
import { makeParticipationGroupsBackup } from "./participation-group-backup.mjs";
import { measureGroupRemainingParticipationSafety } from "./participation-group-safety-capacity.mjs";
import { assembleWorkspaceBackup, checkWorkspaceExportCapacity } from "./workspace-backup.mjs";
import { measureLearningOperationalCapacity, checkLearningRestoreCapacity } from "./learning-capacity.mjs";
import { checkCheckInCapacity } from "./participant-check-in-capacity.mjs";

const LOGICAL=60*1024*1024, NATIVE=64*1024*1024, DIGEST="f".repeat(64);
const MAX_AUDIT_ID="9223372036854775807", MAX_WIRE="9999-12-31T23:59:59.999Z";
const authorityKeys=["actorSha256","sessionSha256","membershipSha256","memberCreatedAtExact","restoreEpochSha256"];
const budgets=new WeakMap();
const refuse=(code="participation_group_write_capacity")=>{throw new ParticipationGroupError(code,422);};
const need=(value,code)=>{if(!value)refuse(code);};
const id=value=>need(typeof value==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(value));
const revision=value=>need(Number.isSafeInteger(value)&&value>=1&&value<=2147483647);
const number=value=>{
  need(typeof value==="number"||typeof value==="string"&&/^(0|[1-9][0-9]*)$/.test(value));
  const n=Number(value);need(Number.isSafeInteger(n)&&n>=0);return n;
};
const sum=(...values)=>{const n=values.reduce((n,value)=>n+number(value),0);need(Number.isSafeInteger(n));return n;};
const bytes=value=>value===undefined?0:Buffer.byteLength(JSON.stringify(value));
const same=(a,b)=>groupCanonical(a)===groupCanonical(b);
const freeze=value=>{if(value&&typeof value==="object"){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;};
function property(value,key){
  need(value&&typeof value==="object"&&!isProxy(value));
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  need(descriptor?.enumerable&&Object.hasOwn(descriptor,"value"));return descriptor.value;
}
function closed(value,keys){
  need(value&&typeof value==="object"&&!isProxy(value)&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype);
  const found=Reflect.ownKeys(value);need(found.length===keys.length&&found.every(key=>keys.includes(key)));
  for(const key of keys)property(value,key);
}
function dense(value,maximum){
  need(value&&typeof value==="object"&&!isProxy(value)&&Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype);
  const length=Object.getOwnPropertyDescriptor(value,"length")?.value;need(Number.isSafeInteger(length)&&length>=0&&length<=maximum);
  const keys=Reflect.ownKeys(value),indices=new Set(Array.from({length},(_,index)=>String(index)));
  need(keys.length===length+1&&keys.every(key=>key==="length"||indices.has(key)));
  return Array.from({length},(_,index)=>property(value,String(index)));
}
function rows(result,maximum){return dense(property(result,"rows"),maximum).map(value=>ownGroupValue(value));}
function first(result){const found=rows(result,1);need(found.length===1);return found[0];}

export const GROUP_WRITE_SQL=Object.freeze({
  source:"SELECT id,module_id,revision,deleted_at FROM os_records WHERE org_id=$1 AND id=$2",
  target:"SELECT target_id,module_id,revision,source_revision,mode,recovery_block FROM os_participation_targets WHERE org_id=$1 AND target_id=$2",
  roster:"SELECT id,target_id,module_id,revision,state,source,recovered,confirmed_at,frozen FROM os_participations WHERE org_id=$1 AND id=ANY($2::text[]) ORDER BY id",
  audit:"SELECT octet_length(to_jsonb(p)::text)::text AS bytes,to_jsonb(p) AS row FROM jsonb_populate_record(NULL::os_events,$1::jsonb) p",
});

// Select only small scalar pins from the real server context; do not clone its
// session Dates, raw records, mutable arrays or optional simulation functions.
function createSelection(org,input,context){
  need(property(context,"originMode")==="live"&&property(context,"group")===null&&property(context,"inventory")===null);
  const source=property(context,"source"),target=property(context,"t"),member=property(context,"member");
  const actorId=property(member,"userId");id(actorId);
  const selected={actorId,source:{id:property(source,"id"),orgId:property(source,"orgId"),moduleId:property(source,"moduleId"),revision:property(source,"revision")},
    target:{orgId:property(target,"org_id"),targetId:property(target,"target_id"),moduleId:property(target,"module_id"),revision:property(target,"revision"),sourceRevision:property(target,"source_revision"),mode:property(target,"mode"),recoveryBlock:property(target,"recovery_block")},
    authority:ownGroupValue(property(context,"authority"),2048),roster:dense(property(context,"roster"),L.members).map(person=>({
      id:property(person,"id"),orgId:property(person,"org_id"),targetId:property(person,"target_id"),moduleId:property(person,"module_id"),revision:property(person,"revision"),
      state:property(person,"state"),source:property(person,"source"),recovered:property(person,"recovered"),confirmedAt:property(person,"confirmed_at"),frozen:property(person,"frozen"),
    }))};
  id(selected.source.id);revision(selected.source.revision);revision(selected.target.revision);revision(selected.target.sourceRevision);
  need(["events","volunteers"].includes(selected.source.moduleId)&&selected.source.orgId===org&&selected.target.orgId===org&&selected.target.targetId===selected.source.id&&selected.target.moduleId===selected.source.moduleId);
  need(selected.target.mode==="managed"&&selected.target.recoveryBlock===false);
  closed(selected.authority,authorityKeys);
  need(input.target.targetId===selected.source.id&&input.target.targetRevision===selected.target.revision&&input.target.sourceRevision===selected.source.revision,"participation_group_revision");
  selected.roster.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  need(selected.roster.length===input.members.length&&new Set(selected.roster.map(person=>person.id)).size===selected.roster.length);
  selected.roster.forEach((person,index)=>{
    id(person.id);revision(person.revision);const expected=input.members[index];
    need(person.orgId===org&&person.targetId===selected.source.id&&person.moduleId===selected.source.moduleId&&person.id===expected.participationId&&person.revision===expected.revision,"participation_group_revision");
    need(["requested","waitlisted"].includes(person.state)&&["staff","intake"].includes(person.source)&&person.recovered===false&&person.confirmedAt===null&&person.frozen===null);
  });
  return freeze(selected);
}
async function currentCreatePins(c,org,input,selected){
  const source=first(await c.query(GROUP_WRITE_SQL.source,[org,selected.source.id]));
  closed(source,["id","module_id","revision","deleted_at"]);
  need(source.id===selected.source.id&&source.module_id===selected.source.moduleId&&source.revision===selected.source.revision&&source.deleted_at===null,"participation_group_revision");
  const target=first(await c.query(GROUP_WRITE_SQL.target,[org,selected.source.id]));
  closed(target,["target_id","module_id","revision","source_revision","mode","recovery_block"]);
  need(target.target_id===selected.target.targetId&&target.module_id===selected.target.moduleId&&target.revision===selected.target.revision&&target.source_revision===selected.target.sourceRevision&&target.mode===selected.target.mode&&target.recovery_block===false,"participation_group_revision");
  const actual=rows(await c.query(GROUP_WRITE_SQL.roster,[org,input.members.map(person=>person.participationId)]),L.members);
  need(actual.length===selected.roster.length);
  actual.forEach((person,index)=>{
    closed(person,["id","target_id","module_id","revision","state","source","recovered","confirmed_at","frozen"]);
    const old=selected.roster[index];need(old&&person.id===old.id&&person.target_id===old.targetId&&person.module_id===old.moduleId&&person.revision===old.revision&&person.state===old.state&&person.source===old.source&&person.recovered===false&&person.confirmed_at===null&&person.frozen===null,"participation_group_revision");
  });
}

function auditFields(org,actorId,groupId,targetId,moduleId,rosterCount,coordinatorIntakeId){
  id(org);id(actorId);id(groupId);id(targetId);need(["events","volunteers"].includes(moduleId));
  need(Number.isSafeInteger(rosterCount)&&rosterCount>=2&&rosterCount<=L.members);if(coordinatorIntakeId!==null)id(coordinatorIntakeId);
  return freeze({org_id:org,actor_id:actorId,action:"participation-group.created",record_id:targetId,module_id:moduleId,
    detail:{groupId,rosterCount,coordinatorIntakeId}});
}
/** Exact mandatory create journal grammar. Coordinator comes from the freshly
 * admitted create body, not a nonexistent property on the private context. */
export function groupCreateAudit(args){
  closed(args,["org","context","groupId","coordinatorIntakeId"]);
  const org=property(args,"org"),context=property(args,"context"),source=property(context,"source");
  need(property(source,"orgId")===org);
  return auditFields(org,property(property(context,"member"),"userId"),property(args,"groupId"),property(source,"id"),property(source,"moduleId"),dense(property(context,"roster"),L.members).length,property(args,"coordinatorIntakeId"));
}
async function auditBound(c,event){
  const measured=first(await c.query(GROUP_WRITE_SQL.audit,[JSON.stringify({...event,id:MAX_AUDIT_ID,created_at:GROUP_EXIT_MAX_STAMP})]));
  closed(measured,["bytes","row"]);closed(measured.row,["org_id","id","actor_id","action","record_id","module_id","detail","created_at"]);
  const retainedBytes=number(measured.bytes);need(retainedBytes>0);
  for(const key of ["org_id","actor_id","action","record_id","module_id","detail"])need(hash(measured.row[key])===hash(event[key]));
  // SELECT * uses string bigint IDs and Date's UTC millisecond wire form.
  return {retainedBytes,native:{...event,id:MAX_AUDIT_ID,created_at:MAX_WIRE}};
}
async function typed(c,sql,values,key){
  if(!values.length)return[];
  const found=rows(await c.query(sql,[JSON.stringify(values)]),values.length);need(found.length===values.length);
  return found.map((value,index)=>{
    closed(value,["position","key","bytes"]);need(number(value.position)===index+1&&value.key===values[index][key]);const n=number(value.bytes);need(n>0);return n;
  });
}
function packet(backup,namespace,audit){
  const {checksum,...body}=backup;need(typeof checksum==="string"&&/^[a-f0-9]{64}$/.test(checksum));
  const value={...body,...(namespace===undefined?{}:{participationGroups:namespace}),...(audit?{events:[...body.events,audit]}:{})};
  return {...value,checksum:hash(value)};
}
function commandSlots(inventory,extra=[],skip=0){
  const used=new Set([...inventory.groups.flatMap(group=>group.receipts.map(receipt=>receipt.commandHash)),...extra]);let index=0;
  const next=()=>{
    while(index<L.groups*L.receipts*2+1){const value="f".repeat(56)+(index++).toString(16).padStart(8,"0");if(!used.has(value)){used.add(value);return value;}}
    refuse();
  };
  for(let n=0;n<skip;n++)next();
  return next;
}
function budgetFirst(org,input,selected,inventory,reservedFutureCount){
  const used=new Set(inventory.groups.map(group=>group.id));let groupId;
  for(let index=0;index<=L.groups;index++){
    const value="BUDGET_ONLY_".padEnd(92,"g")+index.toString(16).padStart(8,"0");if(!used.has(value)){groupId=value;break;}
  }
  need(groupId);const next=commandSlots(inventory,[],reservedFutureCount);
  return validateGroupReceipt({version:1,groupId,operation:"create",commandHash:next(),requestHash:DIGEST,
    authority:{actorSha256:DIGEST,sessionSha256:DIGEST,membershipSha256:DIGEST,memberCreatedAtExact:GROUP_EXIT_MAX_STAMP,restoreEpochSha256:DIGEST},reviewSha256:null,acceptedAtExact:GROUP_EXIT_MAX_STAMP,
    result:{groupId,groupRevision:1,state:"draft",target:{targetId:selected.source.id,moduleId:selected.source.moduleId},rosterIds:input.members.map(person=>person.participationId),coordinatorIntakeId:input.coordinatorIntakeId}});
}
function nextHistories(org,inventory,candidate,reservedFutureCount){
  const next=commandSlots(inventory,candidate?[candidate.commandHash]:[],reservedFutureCount),future=inventory.groups.map(group=>{
    const projection=projectGroupFutureExit({originMode:group.originMode,orgId:org,history:group.history,receipts:group.receipts});
    return projection.futureReceipts.length?projectGroupHistory({originOrgId:org,receipts:[...group.receipts,...projection.futureReceipts]}):group.history;
  });
  if(!candidate)return {future,candidate:null};
  need(!inventory.groups.some(group=>group.id===candidate.groupId)&&!inventory.groups.some(group=>group.receipts.some(receipt=>receipt.commandHash===candidate.commandHash)),"participation_group_capacity_conflict");
  const history=projectGroupHistory({originOrgId:org,receipts:[candidate]});
  const projection=projectGroupFutureExit({originMode:"live",orgId:org,history,receipts:[candidate]});
  const receipts=[candidate,...projection.futureReceipts.map(receipt=>validateGroupReceipt({...receipt,commandHash:next()}))];
  // The candidate itself also occupies its command slot, so a budget future
  // digest may not collide with its header's accepted create reference.
  need(new Set(receipts.map(receipt=>receipt.commandHash)).size===receipts.length);
  const finalHistory=projectGroupHistory({originOrgId:org,receipts});future.push(finalHistory);
  return {future,candidate:{history,finalHistory,receipts}};
}
async function actual(c,org){
  const whole=await checkWorkspaceExportCapacity(c,org),backup=await assembleWorkspaceBackup(c,org);
  need(bytes(backup)===number(whole.backupBytes));
  const operational=await measureLearningOperationalCapacity(c,org,backup.participation);
  const oldLogical=number(whole.operational?.sourceLogicalGrowthBytes??0),oldNative=number(whole.operational?.sourceWireGrowthBytes??0);
  need(number(whole.requiredUsage)===sum(whole.usage,oldLogical)&&number(whole.requiredBackupBytes)===sum(whole.backupBytes,oldNative));
  need(number(operational.sourceLogicalGrowthBytes)>=oldLogical&&number(operational.sourceWireGrowthBytes)>=oldNative);
  const missingOperationalRetained=operational.sourceLogicalGrowthBytes-oldLogical,missingOperationalNative=operational.sourceWireGrowthBytes-oldNative;
  const remaining=await measureGroupRemainingParticipationSafety(c,org,{backup,operational});
  need(remaining.operationalSourceLogicalGrowthBytes===operational.sourceLogicalGrowthBytes&&remaining.operationalSourceWireGrowthBytes===operational.sourceWireGrowthBytes);
  const core=await measureGroupCapacity(c,org),inventory=await loadGroupInventory(c,org),checkins=await checkCheckInCapacity(c,org);
  need(inventory.quota.groups===core.groups&&inventory.quota.bytes===core.actualRetainedBytes&&inventory.quota.receipts===core.retainedReceipts);
  const actualNamespace=makeParticipationGroupsBackup(inventory.groups.map(group=>group.history));
  need(actualNamespace===undefined?backup.participationGroups===undefined:backup.participationGroups!==undefined&&hash(actualNamespace)===hash(backup.participationGroups));
  return {whole,backup,operational,remaining,core,inventory,checkins,missingOperationalRetained,missingOperationalNative};
}
async function admission(c,org,value,candidate,actorId){
  const {whole,backup,core,inventory,remaining,checkins}=value;
  if(candidate)need(core.groups<L.groups,"participation_group_limit");
  const projected=nextHistories(org,inventory,candidate,core.futureReceiptCount),namespace=makeParticipationGroupsBackup(projected.future);
  let candidateRetained=0,actualCandidateRetained=0,audit=null;
  if(candidate){
    const header={org_id:org,id:candidate.groupId,origin_mode:"live",module_id:candidate.result.target.moduleId,live_target_id:candidate.result.target.targetId,roster_ids:candidate.result.rosterIds,
      coordinator_intake_id:candidate.result.coordinatorIntakeId,state:"draft",revision:1,last_command_hash:candidate.commandHash,history:null,created_at:candidate.acceptedAtExact,updated_at:candidate.acceptedAtExact};
    const last=projected.candidate.receipts.at(-1),finalHeader={...header,state:last.result.state,revision:last.result.groupRevision,last_command_hash:last.commandHash,updated_at:last.acceptedAtExact};
    const headers=await typed(c,GROUP_CAPACITY_SQL.futureHeaders,[header,finalHeader],"id");
    const receipts=await typed(c,GROUP_CAPACITY_SQL.futureReceipts,projected.candidate.receipts.map(receipt=>({org_id:org,command_hash:receipt.commandHash,group_id:candidate.groupId,receipt})),"command_hash");
    actualCandidateRetained=sum(headers[0],receipts[0]);candidateRetained=sum(Math.max(headers[0],headers[1]),...receipts);
    need(core.actualRetainedBytes+actualCandidateRetained<=L.familyBytes&&core.projectedRetainedBytes+candidateRetained<=L.familyBytes,"participation_group_capacity");
    need(core.retainedReceipts+core.futureReceiptCount+receipts.length<=L.groups*L.receipts);
    audit=await auditBound(c,auditFields(org,actorId,candidate.groupId,candidate.result.target.targetId,candidate.result.target.moduleId,candidate.result.rosterIds.length,candidate.result.coordinatorIntakeId));
  }
  const futurePacket=packet(backup,namespace,audit?.native),futureBytes=bytes(futurePacket);
  need(futureBytes>=whole.backupBytes);
  const nativeGrowth=futureBytes-whole.backupBytes;
  if(!candidate)need(nativeGrowth===core.nativeGrowthBytes);
  const requiredUsage=sum(whole.requiredUsage,value.missingOperationalRetained,remaining.retainedGrowthAboveOperational,checkins.wholeRetainedReserve,core.retainedGrowthBytes,candidateRetained,audit?.retainedBytes??0);
  const requiredBackupBytes=sum(whole.requiredBackupBytes,value.missingOperationalNative,remaining.nativeGrowthAboveOperational,checkins.wholeNativeReserve,nativeGrowth);
  need(requiredUsage<=LOGICAL&&requiredBackupBytes<=NATIVE);
  // Full recovery casts every actual source family. Recovered GROUP/check-in
  // histories have no live receipts or executable future-withdrawal reserve.
  const inactive=await checkLearningRestoreCapacity(c,futurePacket);
  let actualPacketBytes=null,actualInactive=null;
  if(candidate){
    const actualNamespace=makeParticipationGroupsBackup([...inventory.groups.map(group=>group.history),projected.candidate.history]);
    const actualPacket=packet(backup,actualNamespace,audit.native);actualPacketBytes=bytes(actualPacket);need(actualPacketBytes<=NATIVE);
    actualInactive=await checkLearningRestoreCapacity(c,actualPacket);
  }
  return freeze({requiredUsage,requiredBackupBytes,whole,operational:value.operational,missingOperationalRetained:value.missingOperationalRetained,missingOperationalNative:value.missingOperationalNative,
    remaining,checkins,core,candidateRetainedBytes:candidateRetained,actualCandidateRetainedBytes:actualCandidateRetained,mandatoryAuditRetainedBytes:audit?.retainedBytes??0,
    actualProspectiveBackupBytes:actualPacketBytes,futureCompleteBackupBytes:futureBytes,futureCompleteBackupSha256:hash(futurePacket),inactive,actualInactive,
    prospectiveGroups:core.groups+(candidate?1:0),projectionOnly:true,unadmittedChildSnapshotsPredicted:false});
}

/** Ordinary admission after real changes; absent groups preserve old handling. */
export async function checkGroupOrdinaryCapacity(c,org){
  id(org);if(!(await groupStateCount(c,org)))return null;
  return admission(c,org,await actual(c,org));
}

/** BEFORE new ID or domain clock. Legal synthetic values are BUDGET ONLY and
 * never leave this module as accepted receipts, persisted rows or authority. */
export async function checkGroupCreateBudget(c,org,args){
  id(org);closed(args,["input","context"]);
  const input=validateGroupCreate(property(args,"input")),selected=createSelection(org,input,property(args,"context"));
  await currentCreatePins(c,org,input,selected);
  const value=await actual(c,org),candidate=budgetFirst(org,input,selected,value.inventory,value.core.futureReceiptCount);
  const metrics=await admission(c,org,value,candidate,selected.actorId),handle=freeze({phase:"pre-id",...metrics});
  budgets.set(handle,{c,org,input,selected});return handle;
}

/** AFTER real ID/SQL time, BEFORE insertDraftGroup/audit. Exact accepted Retry
 * never enters either NEW-create helper. Final post-insert ordinary check still
 * runs after the real receipt and mandatory audit; any failure rolls back all. */
export async function checkGroupCreateReceiptCapacity(c,org,args){
  id(org);closed(args,["budget","receipt"]);
  const handle=property(args,"budget");need(handle&&typeof handle==="object"&&!isProxy(handle));const budget=budgets.get(handle);
  need(budget&&budget.c===c&&budget.org===org,"participation_group_capacity_context");
  const receipt=validateGroupReceipt(property(args,"receipt"));need(receipt.operation==="create");
  const {input,selected}=budget,hashes=groupCommandHashes({orgId:org,actorId:selected.actorId,groupId:null,operation:"create",input});
  need(receipt.commandHash===hashes.commandHash&&receipt.requestHash===hashes.requestHash&&same(receipt.authority,selected.authority));
  need(receipt.result.target.targetId===selected.source.id&&receipt.result.target.moduleId===selected.source.moduleId&&same(receipt.result.rosterIds,input.members.map(person=>person.participationId))&&receipt.result.coordinatorIntakeId===input.coordinatorIntakeId);
  await currentCreatePins(c,org,input,selected);
  return admission(c,org,await actual(c,org),receipt,selected.actorId);
}

export const GROUP_WRITE_CAPACITY_CONTRACT=freeze({
  scope:"Standalone ordinary/first-draft SELECT measurements; no HTTP/schema/transaction wiring or authorization grant.",
  createAudit:{action:"participation-group.created",detailKeys:["groupId","rosterCount","coordinatorIntakeId"]},
  limits:{logicalBytes:LOGICAL,nativeBytes:NATIVE,groups:L.groups,receipts:L.receipts,familyBytes:L.familyBytes},
  order:"Fresh authority/context and exact pins -> pre-ID budget -> real SQL domain clock/ID -> exact receipt capacity -> actual insert+mandatory audit -> final ordinary capacity -> outer COMMIT.",
  composition:"whole.required* plus only missing operational activation, remaining participation fields ABOVE SAME operational, remaining check-in and GROUP growth once; full actual/future complete inactive packet measured separately.",
  safety:"This ordinary60 gate must never replace the separate GROUP-present61 emergency safety gate.",
  notClaimed:["actual PG from fake-SQL tests","maximum attainability","future unadmitted child snapshot or optional notice admission","business authority","guaranteed future admission","production release"],
});
