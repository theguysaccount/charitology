/** Pure fixed mapping and evidence validation. Tenant authority is read by the service. */
import { getModule, validateRecord, validDate } from "./modules.mjs";
import { inScope, requirePermission } from "./access.mjs";
import { fail, hash, stable } from "./security.mjs";
import {
  DIRECTORY_METHOD, DIRECTORY_MAPPING_VERSION, DIRECTORY_LIMITS,
  directoryOwned, directoryClosed, directoryFreeze, directoryIsHash,
  directoryIsListingId, directoryUtcInstant, validateDirectoryEntry,
  validateCaptureFile, directoryEntrySha256, getDirectorySelection,
  directoryCatalog, directoryRegistrySha256,
} from "./directory-catalog.mjs";

const FIELDS=getModule("resources").fields.map(f=>f.key);
const COPIED=["title","catalogUrl","sourceUrl"], ASSESSED=["providerName","eligibility","reviewedDate","renewalDate","cost","confirmationReference"];
const STATES=getModule("resources").workflow.states.map(s=>s.id);
const opaque=v=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
const integer=(v,min=1,max=2147483647)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const epoch=v=>v===null||(typeof v==="string"&&/^[1-9]\d*$/.test(v)&&v.length<=40);
const invalid=(message="Use the documented bounded directory Resource fields.")=>fail(422,"directory_input",message);
const conflict=(message)=>fail(409,"directory_ownership",message);
const clone=v=>directoryOwned(v);
const H=(tag,value)=>hash({namespace:`charitology:directory-resource:${tag}:v1`,value});
const TAGS=new Set(["binding","record","capture-row","membership","session","selection","before","plan","command","request","actor-binding"]);
export function directoryPrivateHash(tag,value){if(!TAGS.has(tag))invalid();return H(tag,value);}
export function directoryBindingId(orgId,catalogKind,listingId){if(!opaque(orgId)||!["tools","benefits"].includes(catalogKind)||!directoryIsListingId(listingId))invalid();return H("binding",{orgId,catalogKind,listingId});}
export function directoryResourceId(bindingId){if(!opaque(bindingId))invalid();return H("record",{bindingId});}
function notes(value){if(value===null)return null;if(typeof value!=="string"||value.length>4000||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value))invalid();return value.trim()||null;}
export function renderDirectoryBlock(raw){const {listing:l}=validateDirectoryEntry(raw);return [
  ["Summary",l.summary],["Cost model",l.costType],["Cost description",l.cost],
  ["Delivery",l.delivery],["Possible fit",l.fit],["Eligibility description",l.eligibility],
  ["Limits",l.limits],["Directory source checked",l.checked??"Unknown"],["Editorial review",l.review],
].map(([label,value])=>`${label}: ${value}`).join("\n").trim();}
export function renderLimitations(entry,adoptionNotes=null){const block=renderDirectoryBlock(entry),n=notes(adoptionNotes),rendered=(n===null?block:`${block}\n\nOrganization adoption notes:\n${n}`).trim();if(rendered.length>4000)invalid("The complete limitations text exceeds 4,000 characters.");return rendered;}
function mappedState(entry,adoptionNotes){const n=notes(adoptionNotes),rendered=renderLimitations(entry,n);return {ownership:"mapped",rendered,renderedSha256:hash(rendered),directoryBlock:renderDirectoryBlock(entry),directoryEntrySha256:directoryEntrySha256(entry),adoptionNotes:n};}
function unstructuredState(rendered){if(rendered!==null&&(typeof rendered!=="string"||rendered.length>4000||rendered.trim()!==rendered))invalid();return {ownership:"unstructured",rendered,renderedSha256:hash(rendered),directoryBlock:null,directoryEntrySha256:null,adoptionNotes:null};}
export function validateLimitationsState(value,{entries=[]}={}){
  const s=directoryOwned(value,{bytes:24000});directoryClosed(s,["ownership","rendered","renderedSha256","directoryBlock","directoryEntrySha256","adoptionNotes"]);
  if(!directoryIsHash(s.renderedSha256)||hash(s.rendered)!==s.renderedSha256)invalid("Limitations text hash does not match.");
  if(s.ownership==="unstructured"){if(stable(s)!==stable(unstructuredState(s.rendered)))invalid("Unstructured prose has no inferred directory ownership.");}
  else if(s.ownership==="mapped"){
    if(!directoryIsHash(s.directoryEntrySha256))invalid();const entry=entries.find(e=>directoryEntrySha256(e)===s.directoryEntrySha256);
    if(!entry||stable(s)!==stable(mappedState(entry,s.adoptionNotes)))invalid("Mapped limitations do not reproduce their retained source and notes.");
  }else invalid();return directoryFreeze(s);
}
function selection(value){const s=directoryOwned(value,{bytes:1024});directoryClosed(s,["captureId","catalogKind","listingId","entrySha256"]);if(!directoryIsHash(s.captureId)||!["tools","benefits"].includes(s.catalogKind)||!directoryIsListingId(s.listingId)||!directoryIsHash(s.entrySha256))invalid();return s;}
function sourceChoice(value,entry){if(value===null)return null;directoryClosed(value,value.kind==="source"?["kind","index"]:["kind"]);if(value.kind==="listing-url")return value;if(value.kind!=="source"||!integer(value.index,0,7)||(entry&&value.index>=entry.listing.sources.length))invalid("Choose an admitted frozen source link.");return value;}
function assessment(value,{now}={}){
  if(value===null)return null;directoryClosed(value,ASSESSED);
  if(!validDate(value.reviewedDate)||(now!==undefined&&value.reviewedDate>now.slice(0,10))||!['unknown','eligible','ineligible'].includes(value.eligibility))invalid("Use an explicit assessment date no later than the server UTC day.");
  for(const key of ["providerName","confirmationReference"]){if(value[key]!==null&&(typeof value[key]!=="string"||value[key].length>240))invalid();}
  if(value.renewalDate!==null&&!validDate(value.renewalDate))invalid();
  if(value.cost!==null){directoryClosed(value.cost,["minor","currency","precision"]);if(typeof value.cost.currency!=="string"||typeof value.cost.precision!=="number"||(value.cost.minor!==null&&!Number.isSafeInteger(value.cost.minor)))invalid();}
  const data=validateRecord("resources",{title:"Explicit directory assessment",kind:"tool",...value});
  return Object.fromEntries(ASSESSED.map(k=>[k,data[k]]));
}
export function validateDirectoryProposal(value,{entry=null,now=new Date().toISOString()}={}){
  if(!directoryUtcInstant(now))invalid();const p=directoryOwned(value,{bytes:32768,depth:8});directoryClosed(p,["intent","selection","acceptHistoricalVersion","target","copiedFields","sourceChoice","limitations","assessment"]);
  if(!["copy","recheck","adopt-recovered"].includes(p.intent)||typeof p.acceptHistoricalVersion!=="boolean")invalid();p.selection=selection(p.selection);
  if(p.target!==null){directoryClosed(p.target,["recordId","revision","historyHeadSha256"]);if(!opaque(p.target.recordId)||!integer(p.target.revision)||!directoryIsHash(p.target.historyHeadSha256))invalid();}
  if(!Array.isArray(p.copiedFields)||stable(p.copiedFields)!==stable(COPIED.filter(k=>p.copiedFields.includes(k))))invalid("Copied fields must be distinct and in the fixed order.");
  p.sourceChoice=sourceChoice(p.sourceChoice,entry);
  if(!p.copiedFields.includes("sourceUrl")&&p.sourceChoice!==null)invalid("A source choice requires selecting sourceUrl.");
  const l=p.limitations;if(!l||typeof l!=="object")invalid();
  if(l.kind==="keep-current")directoryClosed(l,["kind"]);
  else if(l.kind==="replace-all"){directoryClosed(l,["kind","adoptionNotes"]);l.adoptionNotes=notes(l.adoptionNotes);}
  else if(l.kind==="replace-mapped"){directoryClosed(l,["kind","notes"]);if(l.notes?.kind==="keep")directoryClosed(l.notes,["kind"]);else if(l.notes?.kind==="set"){directoryClosed(l.notes,["kind","text"]);l.notes.text=notes(l.notes.text);}else invalid();}else invalid();
  p.assessment=assessment(p.assessment,{now});if(p.assessment!==null&&(!p.copiedFields.includes("sourceUrl")||p.sourceChoice===null))invalid("An assessment requires an explicitly selected admitted source URL.");
  if(p.intent==="copy"){if(p.target!==null||p.assessment!==null||stable(p.copiedFields)!==stable(COPIED)||l.kind!=="replace-all"||l.adoptionNotes!==null)invalid("New copies use the complete fixed draft mapping without an assessment or adoption notes.");}else if(p.target===null)invalid();
  return directoryFreeze(p);
}
function chosenUrl(choice,entry){return choice===null?null:choice.kind==="listing-url"?entry.listing.url:entry.listing.sources[choice.index].url;}
function catalogUrl(entry){return `https://charitology.org/for-charities/${entry.catalogKind}/#${entry.listing.id}`;}
function priorEvents(binding){return binding?.events??[];}
function ownership(p,entry,previous,binding){
  if(p.intent==="copy")return mappedState(entry,null);const value=previous.data.limitations,last=priorEvents(binding).at(-1)?.packet?.limitationsState;
  const entries=[...priorEvents(binding).map(e=>e.packet.frozenEntry),entry];if(last)validateLimitationsState(last,{entries});
  if(p.limitations.kind==="keep-current")return last&&value===last.rendered?clone(last):unstructuredState(value);
  if(p.limitations.kind==="replace-mapped"){
    if(!last||last.ownership!=="mapped"||value!==last.rendered)conflict("The working limitations changed after the last mapped value. Keep current or explicitly replace all.");
    return mappedState(entry,p.limitations.notes.kind==="keep"?last.adoptionNotes:p.limitations.notes.text);
  }return mappedState(entry,p.limitations.adoptionNotes);
}
/** Typed backend context: current member, current ownerIds and actual current live tenant records. */
export function buildDirectoryPlan({proposal,orgId,actorId,membershipSha256,restoreEpoch,now=new Date().toISOString(),previous=null,binding=null,context}){
  if(!opaque(orgId)||!opaque(actorId)||!directoryIsHash(membershipSha256)||!epoch(restoreEpoch)||!directoryUtcInstant(now))invalid();
  if(!context||typeof context!=="object"||!context.member||context.member.userId!==actorId||!Array.isArray(context.ownerIds)||!Array.isArray(context.records))invalid("Current typed tenant context is required.");
  requirePermission("resources",context.member,"write");const source=getDirectorySelection(proposal?.selection,{now}),p=validateDirectoryProposal(proposal,{entry:source.entry,now}),entry=source.entry;
  if(source.comparison.historical&&!p.acceptHistoricalVersion)fail(422,"directory_historical","Acknowledge this historical or absent directory entry before continuing.");
  const events=priorEvents(binding),last=events.at(-1),copy=p.intent==="copy";
  if(copy&&(previous!==null||binding!==null))fail(409,"directory_identity","This catalog identity is already tracked.");
  if(!copy){
    if(!previous||previous.moduleId!=="resources"||previous.orgId!==orgId||previous.deletedAt||!inScope(previous,context.member)||!binding||!opaque(binding.id)||binding.resourceId!==previous.id||!last)fail(404,"unavailable","This Resource is unavailable.");
    if(p.target.recordId!==previous.id||p.target.revision!==previous.revision||p.target.historyHeadSha256!==last.packetSha256)fail(409,"directory_stale","This Resource or its source history changed. Preview it again.");
    if(last.packet.catalogKind!==p.selection.catalogKind||last.packet.listingId!==p.selection.listingId)fail(409,"directory_identity","The selected listing does not match this binding.");
    const live=events.some(e=>e.provenance==="live");if((p.intent==="adopt-recovered"&&live)||(p.intent==="recheck"&&!live))fail(409,"directory_identity","This binding requires its current adoption action.");
  }
  if(events.length>=DIRECTORY_LIMITS.events)invalid("This binding has reached its immutable event limit.");
  const bindingId=copy?directoryBindingId(orgId,p.selection.catalogKind,p.selection.listingId):binding.id,resourceId=copy?directoryResourceId(bindingId):previous.id;
  const status=copy?"discovered":previous.approval||previous.snapshot?"review":previous.status,ownerId=copy?actorId:previous.ownerId;
  if(!context.ownerIds.includes(ownerId))fail(422,"owner","The current Resource owner is unavailable.");
  const limitationsState=ownership(p,entry,previous,binding),data=copy?{
    title:entry.listing.name,kind:entry.catalogKind==="tools"?"tool":"benefit",providerName:null,catalogUrl:catalogUrl(entry),eligibility:"unknown",reviewedDate:null,renewalDate:null,cost:null,sourceUrl:chosenUrl(p.sourceChoice,entry),confirmationReference:null,limitations:limitationsState.rendered,
  }:clone(previous.data);
  if(!copy){for(const key of p.copiedFields)data[key]=key==="title"?entry.listing.name:key==="catalogUrl"?catalogUrl(entry):chosenUrl(p.sourceChoice,entry);data.limitations=limitationsState.rendered;if(p.assessment)Object.assign(data,p.assessment);}
  const normalized=validateRecord("resources",data,{orgId,recordId:resourceId,status,records:context.records,previous:previous?.data});
  if(!STATES.includes(status)||!inScope({id:resourceId,moduleId:"resources",data:normalized},context.member))invalid();
  const snapshotSha256=hash(previous?.snapshot??null),before=copy?null:{revision:previous.revision,dataSha256:hash(previous.data),approvalSha256:hash(previous.approval??null),snapshotSha256,restoreEpoch,historyHeadSha256:last.packetSha256};
  const changes=FIELDS.map(field=>({field,before:copy?null:clone(previous.data[field]),after:clone(normalized[field]),origin:p.assessment&&ASSESSED.includes(field)?"assessment":field==="limitations"?p.limitations.kind==="keep-current"?"preserved":"directory":copy||p.copiedFields.includes(field)?"directory":"preserved"}));
  const warnings=[];if(source.comparison.historical)warnings.push("historical-selection");if(source.comparison.absentFromHead)warnings.push("listing-absent-from-head");if(source.comparison.newerVersion)warnings.push("newer-version");if(entry.listing.checked===null)warnings.push("source-date-unknown");if(entry.listing.review==="draft")warnings.push("editorial-draft");
  if(limitationsState.ownership==="unstructured")warnings.push("unstructured-prose");else if(limitationsState.directoryEntrySha256!==p.selection.entrySha256)warnings.push("preserved-old-prose");
  const oldAssessment=assessmentDisposition({events,data:normalized,selection:p.selection,restoreEpoch,now});if(!p.assessment){if(oldAssessment.kind!=="current"&&oldAssessment.assessment)warnings.push("unbound-assessment");if(oldAssessment.reason==="working-data-changed")warnings.push("working-data-changed");if(oldAssessment.reason==="restore-since-assessment")warnings.push("restore-since-assessment");}
  if(normalized.renewalDate&&normalized.renewalDate<now.slice(0,10))warnings.push("renewal-date-passed");
  const plan={method:DIRECTORY_METHOD,mappingVersion:DIRECTORY_MAPPING_VERSION,orgId,intent:p.intent,selection:p.selection,registrySha256:directoryRegistrySha256,currentHeadCaptureId:directoryCatalog.registry.head.captureId,bindingId,nextSequence:events.length+1,resourceId,before,candidate:{moduleId:"resources",data:normalized,status,ownerId,lastEditedBy:actorId,revision:copy?1:previous.revision+1,approval:null,snapshotSha256},limitationsState,assessment:p.assessment,assessmentDataSha256:p.assessment?hash(normalized):null,restoreEpoch,membershipSha256,changes,warnings};
  return directoryFreeze({...plan,planSha256:H("plan",plan)});
}
export function assessmentDisposition({events,data,selection:chosen,restoreEpoch,now=new Date().toISOString()}){
  if(!Array.isArray(events)||!epoch(restoreEpoch)||!directoryUtcInstant(now))invalid();const last=[...events].reverse().find(e=>e.provenance==="live"&&e.packet.assessment!==null),historical=[...events].reverse().find(e=>e.packet.assessment!==null);
  if(!last)return directoryFreeze({kind:historical?"historical":"none",assessment:historical?.packet.assessment??null,reason:historical?"recovered-assessment":null,basis:historical?{selection:historical.packet.selection,dataSha256:historical.packet.assessmentDataSha256,restoreEpoch:historical.packet.restoreEpoch}:null});
  const p=last.packet,reason=p.restoreEpoch!==restoreEpoch?"restore-since-assessment":p.assessmentDataSha256!==hash(data)?"working-data-changed":p.selection.entrySha256!==chosen.entrySha256?"selected-entry-changed":null;
  return directoryFreeze({kind:reason?"unbound":"current",assessment:clone(p.assessment),reason,basis:{selection:clone(p.selection),dataSha256:p.assessmentDataSha256,restoreEpoch:p.restoreEpoch}});
}
export const directoryEventSha256=(packet)=>hash({namespace:"charitology:directory-resource-event:v1",packet});
export function buildDirectoryEvent(plan,{actorId,originOrgId,recordedAt,previousPacket=null,proposal}){
  const {planSha256,...basis}=plan;if(H("plan",basis)!==planSha256||actorId!==plan.candidate.lastEditedBy||originOrgId!==plan.orgId||!directoryUtcInstant(recordedAt))invalid("Event authority does not match its prepared plan.");
  const source=getDirectorySelection(plan.selection,{now:recordedAt}),p=validateDirectoryProposal(proposal,{entry:source.entry,now:recordedAt});if(stable(p.selection)!==stable(plan.selection)||p.intent!==plan.intent)invalid();
  const packet={format:"charitology-directory-resource-event",version:1,method:DIRECTORY_METHOD,mappingVersion:DIRECTORY_MAPPING_VERSION,event:plan.intent==="copy"?"copied":plan.intent==="recheck"?"rechecked":"adopted",bindingId:plan.bindingId,sequence:plan.nextSequence,parentPacketSha256:previousPacket?directoryEventSha256(previousPacket):null,resourceId:plan.resourceId,catalogKind:plan.selection.catalogKind,listingId:plan.selection.listingId,selection:plan.selection,frozenEntry:source.entry,originOrgId,actorId,recordedAt,before:plan.before?{resourceRevision:plan.before.revision,dataSha256:plan.before.dataSha256,restoreEpoch:plan.before.restoreEpoch}:null,resultingRevision:plan.candidate.revision,resultingDataSha256:hash(plan.candidate.data),resultingStatus:plan.candidate.status,copiedFields:p.copiedFields,sourceChoice:p.sourceChoice,limitationsState:plan.limitationsState,assessment:plan.assessment,assessmentDataSha256:plan.assessmentDataSha256,restoreEpoch:plan.restoreEpoch};
  return directoryFreeze({packet,packetSha256:directoryEventSha256(packet)});
}
export function validateDirectoryEvent(value,{captureFile,previousPacket=null,limitationsEntries=[]}={}){
  const p=directoryOwned(value,{bytes:DIRECTORY_LIMITS.payloadBytes});directoryClosed(p,["format","version","method","mappingVersion","event","bindingId","sequence","parentPacketSha256","resourceId","catalogKind","listingId","selection","frozenEntry","originOrgId","actorId","recordedAt","before","resultingRevision","resultingDataSha256","resultingStatus","copiedFields","sourceChoice","limitationsState","assessment","assessmentDataSha256","restoreEpoch"]);
  if(p.format!=="charitology-directory-resource-event"||p.version!==1||p.method!==DIRECTORY_METHOD||p.mappingVersion!==DIRECTORY_MAPPING_VERSION||!["copied","rechecked","adopted"].includes(p.event)||!opaque(p.bindingId)||!opaque(p.resourceId)||!opaque(p.originOrgId)||!opaque(p.actorId)||!integer(p.sequence,1,32)||!integer(p.resultingRevision)||!directoryUtcInstant(p.recordedAt)||!STATES.includes(p.resultingStatus)||!directoryIsHash(p.resultingDataSha256)||!epoch(p.restoreEpoch))invalid("Invalid historical directory event envelope.");
  const c=validateCaptureFile(captureFile),e=validateDirectoryEntry(p.frozenEntry,{capturedAt:c.core.capturedAt}),s=selection(p.selection),descriptor=c.core.catalogs.find(k=>k.kind===s.catalogKind)?.entries.find(d=>d.listingId===s.listingId);
  if(p.catalogKind!==s.catalogKind||p.listingId!==s.listingId||e.catalogKind!==s.catalogKind||e.listing.id!==s.listingId||s.captureId!==c.captureId||directoryEntrySha256(e)!==s.entrySha256||descriptor?.entrySha256!==s.entrySha256||p.recordedAt<c.core.capturedAt)invalid("Historical frozen entry does not match its retained capture.");
  if(!Array.isArray(p.copiedFields)||stable(p.copiedFields)!==stable(COPIED.filter(k=>p.copiedFields.includes(k))))invalid();sourceChoice(p.sourceChoice,e);
  const normalizedAssessment=assessment(p.assessment,{now:p.recordedAt});if(stable(normalizedAssessment)!==stable(p.assessment))invalid("Historical assessment must already be normalized.");
  if(p.assessment===null?p.assessmentDataSha256!==null:p.assessmentDataSha256!==p.resultingDataSha256||!p.copiedFields.includes("sourceUrl")||p.sourceChoice===null)invalid("Assessment basis does not match its explicit resulting data.");
  if(!Array.isArray(limitationsEntries)||limitationsEntries.length>32||limitationsEntries.some(raw=>{const prior=validateDirectoryEntry(raw);return prior.catalogKind!==p.catalogKind||prior.listing.id!==p.listingId;}))invalid("Limitations ownership must resolve within this binding's preceding source history.");
  validateLimitationsState(p.limitationsState,{entries:[...limitationsEntries,e]});
  if(previousPacket===null){
    const original=validateRecord("resources",{title:e.listing.name,kind:e.catalogKind==="tools"?"tool":"benefit",providerName:null,catalogUrl:catalogUrl(e),eligibility:"unknown",reviewedDate:null,renewalDate:null,cost:null,sourceUrl:chosenUrl(p.sourceChoice,e),confirmationReference:null,limitations:renderLimitations(e,null)});
    if(p.event!=="copied"||p.sequence!==1||p.parentPacketSha256!==null||p.before!==null||p.resultingRevision!==1||p.resultingStatus!=="discovered"||p.bindingId!==directoryBindingId(p.originOrgId,p.catalogKind,p.listingId)||p.resourceId!==directoryResourceId(p.bindingId)||stable(p.copiedFields)!==stable(COPIED)||p.assessment!==null||stable(p.limitationsState)!==stable(mappedState(e,null))||p.resultingDataSha256!==hash(original))invalid("Root directory event must be the complete fixed copied draft.");
  }
  else{
    if(p.event==="copied"||p.sequence!==previousPacket.sequence+1||p.parentPacketSha256!==directoryEventSha256(previousPacket)||p.bindingId!==previousPacket.bindingId||p.resourceId!==previousPacket.resourceId||p.catalogKind!==previousPacket.catalogKind||p.listingId!==previousPacket.listingId)invalid("Directory history parent or identity does not match.");
    directoryClosed(p.before,["resourceRevision","dataSha256","restoreEpoch"]);if(!integer(p.before.resourceRevision)||!directoryIsHash(p.before.dataSha256)||!epoch(p.before.restoreEpoch)||p.resultingRevision!==p.before.resourceRevision+1||(p.event!=="adopted"&&p.before.resourceRevision<previousPacket.resultingRevision)||p.before.restoreEpoch!==p.restoreEpoch||p.recordedAt<previousPacket.recordedAt)invalid("Directory history revision or restore basis does not match.");
  }return directoryFreeze(p);
}
