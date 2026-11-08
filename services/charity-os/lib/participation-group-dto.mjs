/** Bounded staff projections of a fresh, completely authorized private context.
 * The caller owns actual permission/visibility, transaction/locks and receipt
 * authority. These pure projections grant no access and perform no SQL. */
import { fail } from './security.mjs';
import { ownGroupValue, groupCanonical, validateGroupHistory, validateGroupReceipt } from './participation-group-model.mjs';

const ID=/^[A-Za-z0-9_-]{1,100}$/, STATES=['requested','waitlisted','confirmed','cancelled'];
const unavailable=()=>fail(404,'participation_group_unavailable','The complete group is unavailable.');
const need=value=>{if(!value)unavailable();};
const id=value=>typeof value==='string'&&ID.test(value);
const revision=value=>Number.isSafeInteger(value)&&value>=1&&value<=2147483647;
const same=(a,b)=>groupCanonical(a)===groupCanonical(b);
const closed=(value,keys)=>need(value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)));

function historyFor(context){
  const group=context?.group;need(group&&id(group.orgId)&&id(group.id));
  const history=validateGroupHistory(group.history);
  need(history.id===group.id&&history.moduleId===group.moduleId);
  return {group,history};
}
function live(context){
  const {group,history}=historyFor(context);
  need(context.originMode==='live'&&group.originMode==='live'&&history.originOrgId===group.orgId&&
    group.liveTargetId===history.targetId&&same(group.rosterIds,history.rosterIds)&&
    group.coordinatorIntakeId===history.coordinatorIntakeId&&group.revision===history.decisions.length&&
    group.state===history.decisions.at(-1).result.state);
  need(context.source?.orgId===group.orgId&&context.source.id===group.liveTargetId&&context.source.moduleId===group.moduleId);
  need(Array.isArray(context.roster)&&context.roster.length===history.rosterIds.length&&Array.isArray(context.records));
  const byId=new Map();
  for(const person of context.roster){
    need(person&&id(person.id)&&!byId.has(person.id)&&person.org_id===group.orgId&&
      person.target_id===group.liveTargetId&&person.module_id===group.moduleId&&
      id(person.booking_record_id)&&id(person.contact_id)&&revision(person.revision)&&
      STATES.includes(person.state)&&person.recovered===false);
    byId.set(person.id,person);
  }
  need(history.rosterIds.every(key=>byId.has(key)));
  const admitted=new Set(history.decisions.find(decision=>decision.operation==='admit')?.result.selected.map(person=>person.participationId)??[]);
  return {group,history,byId,admitted};
}
function currentMembers(value){
  return value.history.rosterIds.map(participationId=>{
    const person=value.byId.get(participationId);
    return {participationId,revision:person.revision,state:person.state};
  });
}
function contactLabel(context,value,person){
  const contacts=context.records.filter(record=>record.id===person.contact_id);
  need(contacts.length===1);const contact=contacts[0];
  need(contact.orgId===value.group.orgId&&contact.moduleId==='contacts'&&contact.data&&typeof contact.data==='object'&&!Array.isArray(contact.data));
  const title=contact.data.title;
  if(title===undefined||title===null||typeof title==='string'&&!title.trim())return 'Participant '+person.id;
  need(typeof title==='string'&&title.length<=180);
  // Existing record titles permit TAB/LF/CR. Format only these for display;
  // the original record and raw authority pins are never rewritten. All other
  // controls/unpaired surrogates still fail the detached DTO admission below.
  return title.replace(/[\t\r\n]/g,' ');
}

export function groupDetailDTO(context){
  const {group,history}=historyFor(context);
  if(context.originMode==='recovered'){
    need(group.originMode==='recovered'&&group.state==='archived'&&group.revision===1&&
      group.liveTargetId===null&&group.coordinatorIntakeId===null&&Array.isArray(group.rosterIds)&&group.rosterIds.length===0&&
      Array.isArray(group.receipts)&&group.receipts.length===0&&context.source===null&&
      Array.isArray(context.roster)&&context.roster.length===0&&
      ['owner','admin'].includes(context.member?.role)&&Array.isArray(context.member.programIds)&&context.member.programIds.length===0);
    return ownGroupValue({ok:true,targetId:history.targetId,group:{groupId:group.id,groupRevision:1,state:'archived',
      originMode:'recovered',coordinatorIntakeId:null,roster:[]}});
  }
  const value=live(context);
  const roster=value.history.rosterIds.map(participationId=>{
    const person=value.byId.get(participationId);
    return {participationId,label:contactLabel(context,value,person),revision:person.revision,state:person.state,admitted:value.admitted.has(participationId)};
  });
  return ownGroupValue({ok:true,targetId:group.liveTargetId,group:{groupId:group.id,groupRevision:group.revision,
    state:group.state,originMode:'live',coordinatorIntakeId:group.coordinatorIntakeId,roster}});
}

/** Only a complete authorized live context may contribute one collection row. */
export function groupSummaryDTO(context){
  const value=live(context);
  return ownGroupValue({groupId:value.group.id,groupRevision:value.group.revision,state:value.group.state,
    rosterCount:value.history.rosterIds.length});
}

/** Original accepted result and fresh disposition are deliberately separate.
 * Matching a receipt here is content integrity, not current session authority. */
export function groupCommandDTO(input){
  closed(input,['receipt','context','replayed']);need(typeof input.replayed==='boolean');
  const receipt=validateGroupReceipt(input.receipt),value=live(input.context),group=value.group;
  need(receipt.groupId===group.id&&Array.isArray(group.receipts)&&group.receipts.length===group.revision);
  const retained=group.receipts.filter(item=>item.commandHash===receipt.commandHash);
  need(retained.length===1&&same(validateGroupReceipt(retained[0]),receipt));
  const decision=value.history.decisions[receipt.result.groupRevision-1];
  need(decision&&decision.operation===receipt.operation&&decision.acceptedAtExact===receipt.acceptedAtExact&&same(decision.result,receipt.result));
  return ownGroupValue({ok:true,replayed:input.replayed,acceptedAtExact:receipt.acceptedAtExact,accepted:receipt.result,
    currentDisposition:{groupId:group.id,groupRevision:group.revision,state:group.state,members:currentMembers(value)}});
}
