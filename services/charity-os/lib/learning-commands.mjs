/** Authenticated orchestration. Plans are server-owned and recompiled under the organization lock. */
import {randomUUID} from 'node:crypto';
import {fail} from './security.mjs';
import {requireAdmin,inScope,requirePermission} from './access.mjs';
import {allRecords,rowRecord,saveRecord,audit} from './database.mjs';
import {learningHash as H,learningSame as same,learningOwned as own,learningObject as obj,
 learningEnum as en,learningId as id,learningHashValue as hash,learningNumber as num,learningInstant as instant} from './learning-json.mjs';
import {inspectLearningNative,makeLearningSourceCapture,validateLearningSourceCapture,sourcePin} from './learning-native.mjs';
import {validateLearningWorkingPin,validateLearningHeadPin,validateLearningSourcePin,validateLearningMapping,
 validateLearningMeasurement,validateLearningCorrection,validateLearningCorrectionApply,validateLearningCorrectionAbandon,
 validateLearningDecision,compileLearningMapping,compileLearningMeasurement,compileLearningDecision,
 makeLearningEvent,validateLearningEvent,foldLearningHistory,headPin,workingPin,learningEventRecordPins} from './learning-model.mjs';
import {requireLearningMember,requireLearningScope,currentLearningWorking,requireLearningApproval,resolveLearningApproval,
 learningStale,learningUnavailable,learningSessionHash,learningActorHash,learningRestoreEpoch,learningInspectionEpoch} from './learning-access.mjs';
import {loadLearningInventory,learningBinding,requireLearningHead,currentLearningSource,insertLearningHistory,
 checkLearningCategories,checkLearningActiveRecords,storeLearningPreview,readLearningPreview,acceptedLearningCommand} from './learning-history.mjs';
import {previewLearningReport,readLearningReport} from './learning-reports.mjs';
import {learningWriteCapability} from './learning-guards.mjs';
import {learningCommitInput} from './learning-requests.mjs';

const kinds={map:'mapped',adopt:'adopted',measure:'measured',correct:'corrected',
 'apply-correction':'correction-applied','abandon-correction':'correction-abandoned',decide:'decided',freeze:'frozen'};
const writeModules=operation=>operation==='freeze'?['reporting']:operation==='decide'?['evaluation']:
 ['map','adopt'].includes(operation)?['outcomes','evaluation']:['outcomes'];
const dedupe=values=>[...new Map(values.map(value=>[value.sha256,value])).values()].sort((a,b)=>a.sha256<b.sha256?-1:1);
const candidate=(moduleId,data,user,recordId)=>({id:recordId,moduleId,data,status:'draft',ownerId:user,revision:1});
const descriptor=r=>({moduleId:r.moduleId,recordId:r.id,revision:1,dataSha256:H('data',r.data)});
const programOfPin=(inventory,pin)=>inventory.approvedEvidence.find(e=>same(e.pin,pin));
const invalid=()=>fail(422,'learning_request','Use the documented current learning selection.');

function mapProposal(value){
 const mode=value?.mode;en(mode,['new','refresh','remap','adopt-recovered']);
 obj(value,mode==='new'?['mode','inspectionId','program','mapping']:mode==='refresh'?['mode','inspectionId','head','program','mapping']:
  mode==='remap'?['mode','head','source','program','mapping']:['mode','recoveredHead','source','program','mapping']);
 validateLearningWorkingPin(value.program);if(value.program.moduleId!=='programs')invalid();
 if(mode==='new'||mode==='refresh')id(value.inspectionId);
 if(mode==='refresh'||mode==='remap')validateLearningHeadPin(value.head);
 if(mode==='remap'||mode==='adopt-recovered')validateLearningSourcePin(value.source);
 if(mode==='adopt-recovered')validateLearningHeadPin(value.recoveredHead);
 return own(value);
}
function targetShape(target){
 en(target?.kind,['new','refresh']);obj(target,target.kind==='new'?['kind','program']:['kind','program','head']);
 validateLearningWorkingPin(target.program);if(target.program.moduleId!=='programs')invalid();
 if(target.kind==='refresh')validateLearningHeadPin(target.head);return target;
}
async function exactProgram(c,org,pin,member){
 const record=await currentLearningWorking(c,org,pin,member);
 if(record.moduleId!=='programs'||record.data.kind!=='program')invalid();
 requireLearningScope(member,record.id);return record;
}
function scopedInventory(member,inventory){
 for(const binding of inventory.bindings)if(inventory.modes.get(binding.events[0].sha256)==='recovered')requireLearningScope(member,binding.programId);
 for(const proof of inventory.approvedEvidence)if(inventory.modes.get(proof.sha256)==='recovered')requireLearningScope(member,proof.pin.moduleId==='programs'?proof.pin.recordId:proof.snapshot.data.programId);
}
function liveBinding(inventory,org,pin,member){
 validateLearningHeadPin(pin);if(pin.originOrgId!==org)learningStale();
 const binding=learningBinding(inventory,org,pin.bindingId);requireLearningScope(member,binding.programId);
 requireLearningHead(binding,pin);return binding;
}
async function programUnchanged(c,org,binding,member){
 const row=(await c.query('SELECT * FROM os_records WHERE org_id=$1 AND id=$2 AND deleted_at IS NULL',[org,binding.programId])).rows[0];
 if(!row)learningUnavailable();const record=rowRecord(row);
 if(!inScope(record,member)||record.moduleId!=='programs')learningUnavailable();
 if(H('data',record.data)!==binding.mappingEvent.payload.program.dataSha256)learningStale();return record;
}
async function currentProofs(c,org,pins,member){
 const proofs=[];
 for(const pin of pins)proofs.push((await requireLearningApproval(c,org,pin,member)).evidence);
 return dedupe(proofs);
}
function withPlanInventory(inventory,source,proofs,event){
 const sources=new Map(inventory.sources.map(s=>[s.sha256,s]));if(source)sources.set(source.sha256,source);
 return foldLearningHistory({sources:[...sources.values()],approvedEvidence:dedupe([...inventory.approvedEvidence,...proofs]),events:[...inventory.events,event]});
}
function eventCore(org,user,preparedAt,bindingId,binding,programId,payload){
 return makeLearningEvent({format:'charitology-learning-event',version:1,originOrgId:org,bindingId,
  sequence:binding?binding.head.sequence+1:1,previous:binding?.head??null,actorId:user,
  recordedAt:preparedAt,programId,payload});
}

export async function inspectLearningSource(c,{org,user,member,session,metadata,native}){
 requireLearningMember(member,{source:true});const target=targetShape(metadata.target);
 await exactProgram(c,org,target.program,member);
 const inventory=await loadLearningInventory(c,org);let binding=null;
 if(target.kind==='refresh'){
  binding=liveBinding(inventory,org,target.head,member);
  if(binding.programId!==target.program.recordId)invalid();
 }
 const inspection=inspectLearningNative(native,{adapter:metadata.adapter,selection:metadata.selection});
 let previous=null;
 if(binding){
  const existing=currentLearningSource(inventory,binding);
  if(existing.adapter!==inspection.adapter||existing.nativeIdentity!==inspection.nativeIdentity||!same(existing.selection,inspection.selection))
   fail(422,'learning_native_identity','A refresh must use the same native identity and explicit selection.');
  const local=inventory.sources.filter(s=>s.originOrgId===org&&s.bindingId===binding.bindingId).sort((a,b)=>a.sourceVersion-b.sourceVersion);
  previous=local.at(-1)??null;
  if(local.length>=8)fail(422,'learning_limit','This binding has retained eight native source versions.');
 }else if(inventory.bindings.length>=20)fail(422,'learning_limit','This workspace has retained twenty learning bindings.');
 const receivedAt=new Date().toISOString(),bindingId=binding?.bindingId??randomUUID();
 const source=makeLearningSourceCapture(inspection,{originOrgId:org,bindingId,sourceVersion:(previous?.sourceVersion??0)+1,
  previousSource:previous?sourcePin(previous):null,receivedAt});
 const inspectionId=randomUUID(),epoch=await learningInspectionEpoch(c,org,target);
 const payload={version:1,target:own(target),source};
 const stored=await storeLearningPreview(c,org,member,learningSessionHash(session),'inspection',payload,
  {id:inspectionId,reviewSha256:H('review',payload),restoreEpochSha256:epoch});
 return {inspectionId,expiresAt:stored.expiresAt,source,
  retainedScope:source.adapter==='theory-of-change-native-v1'?'whole-toc-export':'context-and-one-learning-row',
  existingSource:binding?.source??null};
}

/** Fixed IDs, time and native selection are assigned once before this compiler. */
export async function compileLearningCommand(c,{org,user,member,inventory,operation,input,fixed}){
 requireLearningMember(member,{report:operation==='freeze',source:operation!=='freeze',write:writeModules(operation)});
 let binding=null,source=null,programId,payload,candidates=[],proofs=[],samePeriodRecordIds=[],transition=null,report=null;
 const records=await allRecords(c,org);let additionalEpochIds=[];
 if(['map','adopt'].includes(operation)){
  const proposal=mapProposal(input);const program=await exactProgram(c,org,proposal.program,member);programId=program.id;
  if(proposal.mode==='adopt-recovered'){
   requireAdmin(member);scopedInventory(member,inventory);
   const recovered=inventory.bindings.find(b=>same(b.head,proposal.recoveredHead)&&inventory.modes.get(b.events[0].sha256)==='recovered');
   if(!recovered||!same(recovered.source,proposal.source))learningUnavailable();
   source=inventory.sources.find(s=>same(sourcePin(s),proposal.source));
   if(!source)learningUnavailable();
   if(inventory.bindings.length>=20)fail(422,'learning_limit','This workspace has retained twenty learning bindings.');
  }else if(proposal.mode==='remap'){
   binding=liveBinding(inventory,org,proposal.head,member);
   if(binding.programId!==programId)invalid();
   if(!binding.events.some(e=>['mapped','adopted'].includes(e.payload.kind)&&same(e.payload.source,proposal.source)))invalid();
   source=inventory.sources.find(s=>same(sourcePin(s),proposal.source));if(!source)learningUnavailable();
  }else{
   source=validateLearningSourceCapture(fixed.source);
   const expectedTarget=proposal.mode==='new'?{kind:'new',program:proposal.program}:{kind:'refresh',program:proposal.program,head:proposal.head};
   if(!same(fixed.inspection.target,expectedTarget)||fixed.inspectionEpoch!==await learningInspectionEpoch(c,org,expectedTarget))learningStale();
   if(proposal.mode==='refresh'){
    binding=liveBinding(inventory,org,proposal.head,member);if(binding.programId!==programId||source.bindingId!==binding.bindingId)invalid();
   }else if(inventory.bindings.some(b=>b.originOrgId===org&&b.bindingId===source.bindingId)||inventory.bindings.length>=20)learningStale();
  }
  if(binding&&binding.mappingNumber>=8)fail(422,'learning_limit','This binding has retained eight mapping versions.');
  const compiled=compileLearningMapping(source,proposal.mapping,programId,{records});
  if(fixed.recordIds.length!==compiled.indicators.length+1)invalid();
  candidates=compiled.indicators.map((item,index)=>candidate('outcomes',item.data,user,fixed.recordIds[index]));
  candidates.push(candidate('evaluation',compiled.protocol,user,fixed.recordIds.at(-1)));
  payload=proposal.mode==='adopt-recovered'?{kind:'adopted',recoveredHead:proposal.recoveredHead,source:sourcePin(source),program:proposal.program,
   mapping:compiled.mapping,mappingNumber:1,records:candidates.map(descriptor)}:
   {kind:'mapped',mode:proposal.mode,source:sourcePin(source),program:proposal.program,mapping:compiled.mapping,
    mappingNumber:(binding?.mappingNumber??0)+1,records:candidates.map(descriptor)};
 }else if(operation==='freeze'){
  const compiled=await previewLearningReport(c,{org,user,member,inventory,finalSelection:input,reportId:fixed.reportId,preparedAt:fixed.preparedAt});
  ({report,transition,approvedEvidence:proofs}=compiled);const event=compiled.event;
  return own({operation,input,fixed,source:null,candidates:[],event,approvedEvidence:proofs,samePeriodRecordIds:[],
   report,transition,recordIds:compiled.recordIds});
 }else{
  const raw=operation==='correct'?validateLearningCorrection(input).measurement:input;
  if(operation==='measure')validateLearningMeasurement(input);
  if(operation==='decide')validateLearningDecision(input);
  if(operation==='apply-correction')validateLearningCorrectionApply(input);
  if(operation==='abandon-correction')validateLearningCorrectionAbandon(input);
  binding=liveBinding(inventory,org,raw.head,member);programId=binding.programId;
  source=currentLearningSource(inventory,binding);
  if(operation!=='abandon-correction')await programUnchanged(c,org,binding,member);
  if(operation==='measure'||operation==='correct'){
   proofs=await currentProofs(c,org,[raw.program,raw.protocol,raw.definition],member);
   if(operation==='correct'){
    const old=programOfPin(inventory,input.replaces);
    if(old){
     requireLearningScope(member,old.snapshot.data.programId);
     const row=(await c.query('SELECT * FROM os_records WHERE org_id=$1 AND id=$2',[org,input.replaces.recordId])).rows[0];
     if(row&&H('data',row.data)!==H('data',old.snapshot.data))learningStale();
     proofs=dedupe([...proofs,old]);
    }else proofs=dedupe([...proofs,...await currentProofs(c,org,[input.replaces],member)]);
   }
   const compiled=compileLearningMeasurement(raw,{source,mappingEvent:binding.mappingEvent,evidence:dedupe([...inventory.approvedEvidence,...proofs]),records});
   candidates=[candidate('outcomes',compiled.data,user,fixed.recordIds[0])];
   payload=operation==='measure'?{kind:'measured',input:compiled.input,record:descriptor(candidates[0])}:
    {kind:'corrected',input:{...input,measurement:compiled.input},record:descriptor(candidates[0])};
   samePeriodRecordIds=binding.measurements.filter(m=>m.input.definition.recordId===raw.definition.recordId&&
    m.input.period.startDate<=raw.period.endDate&&m.input.period.endDate>=raw.period.startDate).map(m=>m.record.recordId).sort();
  }else if(operation==='decide'){
   proofs=await currentProofs(c,org,[input.program,input.protocol,...input.observations,...input.discussedDefinitions],member);
   const compiled=compileLearningDecision(input,{source,mappingEvent:binding.mappingEvent,evidence:dedupe([...inventory.approvedEvidence,...proofs]),events:inventory.events,records});
   candidates=[candidate('evaluation',compiled.data,user,fixed.recordIds[0])];payload={kind:'decided',input:compiled.input,record:descriptor(candidates[0])};
  }else{
   const attempt=binding.corrections.find(a=>a.eventSha256===input.correctionEventSha256);
   if(!attempt||attempt.state!=='pending')learningStale();
   const created=binding.measurements.find(m=>m.record.recordId===attempt.candidateRecordId);
   additionalEpochIds=[attempt.replaces.recordId,created.input.program.recordId,created.input.protocol.recordId,created.input.definition.recordId];
   if(operation==='apply-correction'){
    if(input.replacement.recordId!==attempt.candidateRecordId)invalid();
    proofs=await currentProofs(c,org,[created.input.program,created.input.protocol,created.input.definition,input.replacement],member);
    payload={kind:'correction-applied',correctionEventSha256:attempt.eventSha256,replaces:attempt.replaces,replacement:input.replacement};
   }else payload={kind:'correction-abandoned',correctionEventSha256:attempt.eventSha256,candidateRecordId:attempt.candidateRecordId,reason:input.reason};
  }
 }
 const bindingId=binding?.bindingId??(operation==='adopt'?fixed.bindingId:source.bindingId);
 const event=eventCore(org,user,fixed.preparedAt,bindingId,binding,programId,payload);
 withPlanInventory(inventory,source,proofs,event);
 await checkLearningActiveRecords(c,org,{inventory,additional:candidates.map(r=>r.id)});
 const recordIds=[...new Set([programId,...candidates.map(r=>r.id),...learningEventRecordPins(event).map(p=>p.recordId),...proofs.map(p=>p.pin.recordId),
  ...(payload.kind==='correction-abandoned'?[payload.candidateRecordId]:[]),...additionalEpochIds,...samePeriodRecordIds])].sort();
 return own({operation,input,fixed,source:['map','adopt'].includes(operation)?source:null,candidates,event,
  approvedEvidence:proofs,samePeriodRecordIds,report,transition,recordIds});
}

function visiblePlan(plan){return plan.operation==='freeze'?{operation:'freeze',report:plan.report,frozenManifest:workingPin(plan.transition)}:
 {operation:plan.operation,plan:{source:plan.source,event:plan.event,candidates:plan.candidates,approvedEvidence:plan.approvedEvidence,samePeriodRecordIds:plan.samePeriodRecordIds}};}
async function planEpoch(c,org,inventory,plan){
 const root=plan.event.sequence===1?headPin(plan.event):headPin(inventory.events.find(e=>e.originOrgId===org&&e.bindingId===plan.event.bindingId&&e.sequence===1));
 return H('restore-epoch',await learningRestoreEpoch(c,org,root,plan.recordIds));
}

export async function previewLearningCommand(c,{org,user,member,session,operation,input}){
 const inventory=await loadLearningInventory(c,org);
 const fixed={preparedAt:new Date().toISOString(),recordIds:[],bindingId:null,reportId:null,source:null,inspection:null,inspectionEpoch:null};
 if(operation==='map'||operation==='adopt'){
  input=mapProposal(input);operation=input.mode==='adopt-recovered'?'adopt':'map';
  if(input.mode==='new'||input.mode==='refresh'){
   const row=await readLearningPreview(c,org,input.inspectionId,member,learningSessionHash(session));
   if(row.kind!=='inspection')invalid();
   fixed.source=row.payload.source;fixed.inspection=row.payload;fixed.inspectionEpoch=row.restore_epoch_sha256;
  }
  if(!Array.isArray(input.mapping?.indicators)||input.mapping.indicators.length<1||input.mapping.indicators.length>10)invalid();
  fixed.recordIds=Array.from({length:input.mapping.indicators.length+1},()=>randomUUID());
  if(operation==='adopt')fixed.bindingId=randomUUID();
 }else if(['measure','correct','decide'].includes(operation))fixed.recordIds=[randomUUID()];
 else if(operation==='freeze')fixed.reportId=randomUUID();
 const plan=await compileLearningCommand(c,{org,user,member,inventory,operation,input,fixed});
 const publicPlan=visiblePlan(plan),reviewSha256=H('review',publicPlan),restoreEpochSha256=await planEpoch(c,org,inventory,plan);
 const stored=await storeLearningPreview(c,org,member,learningSessionHash(session),operation,plan,
  {id:randomUUID(),reviewSha256,restoreEpochSha256});
 return {...stored,...publicPlan};
}

function requestHash(input,operation){return H('request',{method:'POST',route:'learning/commit',operation,
 previewId:input.previewId,reviewSha256:input.reviewSha256});}
export function validateAcceptedLearningReceipt(value,inventory){
 const event=validateLearningEvent(value.payload),receipt=own(value.receipt,{bytes:32768});
 obj(receipt,['version','operation','commandHash','requestHash','actorBindingHash','actorId','sessionSha256',
  'membershipSha256','memberCreatedAtExact','restoreEpochSha256','previewId','reviewSha256','acceptedAt','result']);
 en(receipt.version,[1]);en(receipt.operation,Object.keys(kinds));id(receipt.actorId);id(receipt.previewId);
 for(const key of ['commandHash','requestHash','actorBindingHash','sessionSha256','membershipSha256','restoreEpochSha256','reviewSha256'])hash(receipt[key]);
 instant(receipt.memberCreatedAtExact,'memberCreatedAtExact',true);instant(receipt.acceptedAt);
 const result=receipt.result;obj(result,['outcome','head','records','report']);
 if(result.outcome!==kinds[receipt.operation]||event.actorId!==receipt.actorId||!same(result.head,headPin(event)))invalid();
 const payload=event.payload,expectedKind=receipt.operation==='freeze'?'report-frozen':kinds[receipt.operation];
 if(payload.kind!==expectedKind||!Array.isArray(result.records))invalid();
 const descriptors=['mapped','adopted'].includes(payload.kind)?payload.records:
  ['measured','corrected','decided'].includes(payload.kind)?[payload.record]:[];
 let expected=payload.kind==='report-frozen'?[payload.frozenManifest]:descriptors.map(p=>({moduleId:p.moduleId,recordId:p.recordId,revision:p.revision,dataSha256:p.dataSha256}));
 if(payload.kind==='correction-applied'){
  const proof=inventory?.approvedEvidence.find(p=>same(p.pin,payload.replacement));if(!proof)invalid();
  expected=[{moduleId:'outcomes',recordId:proof.pin.recordId,revision:proof.pin.revision,dataSha256:H('data',proof.snapshot.data)}];
 }
 if(!same(result.records,expected))invalid();
 for(const pin of result.records)validateLearningWorkingPin(pin);
 const report=payload.kind==='report-frozen'?{id:payload.reportId,checksum:payload.reportChecksum}:null;
 if(!same(result.report,report))invalid();
 return {event,receipt};
}
function eventRecordIds(event,result,report){
 const payload=event.payload;
 return [...new Set([event.programId,...result.records.map(p=>p.recordId),...learningEventRecordPins(event).map(p=>p.recordId),
  ...(['mapped','adopted'].includes(payload.kind)?payload.records.map(p=>p.recordId):[]),
  ...(['measured','corrected','decided'].includes(payload.kind)?[payload.record.recordId]:[]),
  ...(payload.kind==='correction-abandoned'?[payload.candidateRecordId]:[]),
  ...(report?[...report.approvedEvidence.map(p=>p.pin.recordId),...report.exclusions.map(p=>p.recordId)]:[])])].sort();
}
async function disposition(c,org,ids){
 const rows=(await c.query('SELECT id,deleted_at FROM os_records WHERE org_id=$1 AND id=ANY($2::text[])',[org,ids])).rows;
 return rows.length!==ids.length?'historical-only':rows.some(r=>r.deleted_at)?'trash':'active';
}

export async function commitLearningCommand(c,{org,user,member,session,input}){
 input=learningCommitInput(input);
 const commandHash=H('command',{orgId:org,actorId:user,memberCreatedAtExact:member.createdAtExact,commandKey:input.commandKey});
 const accepted=await acceptedLearningCommand(c,org,commandHash);
 const inventory=await loadLearningInventory(c,org),sessionSha256=learningSessionHash(session);
 if(accepted){
  const {receipt,event}=validateAcceptedLearningReceipt(accepted,inventory);
  requireLearningMember(member,{report:receipt.operation==='freeze',source:receipt.operation!=='freeze',write:writeModules(receipt.operation)});
  requireLearningScope(member,event.programId);
  if(receipt.actorId!==user||receipt.sessionSha256!==sessionSha256||receipt.actorBindingHash!==learningActorHash(member,session)||
   receipt.membershipSha256!==member.membershipSha256||receipt.memberCreatedAtExact!==member.createdAtExact||
   receipt.previewId!==input.previewId||receipt.reviewSha256!==input.reviewSha256||receipt.requestHash!==requestHash(input,receipt.operation))learningStale();
  let report=null;if(receipt.result.report){
   report=await readLearningReport(c,{org,id:receipt.result.report.id,member});
   if(!report||report.checksum!==receipt.result.report.checksum)learningStale();
  }
  const binding=learningBinding(inventory,org,event.bindingId),root=headPin(binding.events[0]);
  const ids=eventRecordIds(event,receipt.result,report);
  // The event binds this command's inspected overlaps, never a later enlarged binding.
  if(['measured','corrected'].includes(event.payload.kind)){
   const point=event.payload.kind==='measured'?event.payload.input:event.payload.input.measurement;
   for(const old of binding.measurements.filter(m=>m.event.sequence<event.sequence&&m.input.definition.recordId===point.definition.recordId&&m.input.period.startDate<=point.period.endDate&&m.input.period.endDate>=point.period.startDate))ids.push(old.record.recordId);
  }
  if(['correction-applied','correction-abandoned'].includes(event.payload.kind)){
   const created=binding.measurements.find(m=>m.event.sha256===event.payload.correctionEventSha256);
   if(!created)learningStale();
   ids.push(created.input.program.recordId,created.input.protocol.recordId,created.input.definition.recordId);
   ids.push(created.event.payload.input.replaces.recordId);
  }
  const exactIds=[...new Set(ids)].sort();
  for(const proof of report?.approvedEvidence??[])requireLearningScope(member,proof.pin.moduleId==='programs'?proof.pin.recordId:proof.snapshot.data.programId);
  for(const raw of (await c.query('SELECT * FROM os_records WHERE org_id=$1 AND id=ANY($2::text[])',[org,exactIds])).rows)if(!inScope(rowRecord(raw),member))learningUnavailable();
  if(receipt.restoreEpochSha256!==H('restore-epoch',await learningRestoreEpoch(c,org,root,exactIds)))learningStale();
  return {kind:'already-committed',result:receipt.result,disposition:await disposition(c,org,exactIds)};
 }
 const preview=await readLearningPreview(c,org,input.previewId,member,sessionSha256);
 if(preview.kind==='inspection'||preview.review_sha256!==input.reviewSha256)learningStale();
 const previous=preview.payload;
 const plan=await compileLearningCommand(c,{org,user,member,inventory,operation:preview.kind,input:previous.input,fixed:previous.fixed});
 if(!same(plan,previous)||H('review',visiblePlan(plan))!==input.reviewSha256||await planEpoch(c,org,inventory,plan)!==preview.restore_epoch_sha256)learningStale();
 for(const row of plan.candidates){
  if((await c.query('SELECT 1 FROM os_records WHERE org_id=$1 AND id=$2',[org,row.id])).rowCount)learningStale();
 }
 const event=plan.event,result={outcome:kinds[plan.operation],head:headPin(event),records:plan.candidates.map(workingPin),
  report:plan.report?{id:plan.report.id,checksum:plan.report.checksum}:null};
 if(plan.transition)result.records=[workingPin(plan.transition)];
 if(event.payload.kind==='correction-applied'){
  const proof=plan.approvedEvidence.find(p=>same(p.pin,event.payload.replacement));
  result.records=[{moduleId:'outcomes',recordId:proof.pin.recordId,revision:proof.pin.revision,dataSha256:H('data',proof.snapshot.data)}];
 }
 const receipt={version:1,operation:plan.operation,commandHash,requestHash:requestHash(input,plan.operation),
  actorBindingHash:learningActorHash(member,session),actorId:user,sessionSha256,membershipSha256:member.membershipSha256,
  memberCreatedAtExact:member.createdAtExact,restoreEpochSha256:preview.restore_epoch_sha256,
  previewId:input.previewId,reviewSha256:input.reviewSha256,acceptedAt:new Date().toISOString(),result};
 if(plan.source)await insertLearningHistory(c,org,'source',plan.source,{mode:inventory.modes.get(plan.source.sha256)??'live'});
 for(const evidence of plan.approvedEvidence)await insertLearningHistory(c,org,'evidence',evidence);
 await insertLearningHistory(c,org,'event',event,{receipt});
 const drafts=plan.candidates.map(r=>({...r,orgId:org,lastEditedBy:user,approval:null,snapshot:null,source:null,
  createdAt:plan.fixed.preparedAt,updatedAt:plan.fixed.preparedAt}));
 const capability=learningWriteCapability('create',drafts);
 for(const record of drafts){await saveRecord(c,record,{learningCapability:capability});await audit(c,org,user,'record.created',record,{record});}
 if(plan.report){
  await c.query('INSERT INTO os_reports(org_id,id,created_by,title,checksum,payload) VALUES($1,$2,$3,$4,$5,$6)',
   [org,plan.report.id,user,plan.report.title,plan.report.checksum,JSON.stringify(plan.report)]);
  const transition=JSON.parse(JSON.stringify(plan.transition));
  await saveRecord(c,transition,{learningCapability:learningWriteCapability('freeze',[transition])});
  await audit(c,org,user,'record.transitioned',transition,{from:'approved',to:'frozen',record:transition});
 }
 await audit(c,org,user,'learning.'+event.payload.kind,null,{eventSha256:event.sha256,bindingId:event.bindingId,result});
 await c.query('DELETE FROM os_learning_previews WHERE org_id=$1 AND id=ANY($2::text[])',[org,[input.previewId,...(plan.fixed.inspection?[plan.input.inspectionId]:[])]]);
 // database.tx checks the complete source and future restored copy once all
 // command writes and mandatory audits exist, before COMMIT.
 await checkLearningCategories(c,org);await loadLearningInventory(c,org);
 return {kind:'committed',result,disposition:'active'};
}
