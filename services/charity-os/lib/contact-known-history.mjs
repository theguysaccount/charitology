/** Complete retained Learning row admission only; no current authority or IO. */
import { isProxy } from 'node:util/types';
import { getModule, validDate } from './modules.mjs';
import { hash, stable } from './security.mjs';
import { learningOwned as own, learningObject as obj, learningArray as arr,
  learningId as id, learningFreeze as freeze } from './learning-json.mjs';
import { learningJSONBBytes } from './learning-backup.mjs';
import { validateLearningBackup, validateLearningReport } from './learning-report-model.mjs';
import { validateAcceptedLearningReceipt } from './learning-commands.mjs';
import { learningEventRecordPins } from './learning-model.mjs';

export class ContactLearningHistoryError extends Error {
  constructor() { super('The complete retained Learning history is invalid or unsupported.');
    this.name='ContactLearningHistoryError'; this.code='contact_learning_history'; this.status=422; }
}
const need = ok => { if (!ok) throw new ContactLearningHistoryError(); };
const MIB=1048576, INPUT_BYTES=32*MIB;
const HISTORY=['org_id','id','row_kind','origin_mode','origin_org_id','binding_id','sequence',
  'source_version','program_id','payload','receipt','budget_bytes','created_at'];
const REPORT=['org_id','id','created_by','title','checksum','payload','created_at'];
const LIMIT={source:1056768,evidence:262144,event:131072,'recovered-report':4194304};
const MODULES=['programs','outcomes','evaluation','reporting'];
export const CONTACT_LEARNING_REFERENCE_PROFILE_SHA256='b188442eaacd90a64c050167805360b0d703ec1e19059c7eb3bfc405575bfd9a';
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const origin=(a,b)=>cmp(a.originOrgId,b.originOrgId)||cmp(a.bindingId,b.bindingId);
const digest=v=>need(typeof v==='string'&&/^[a-f0-9]{64}$/.test(v));
const integer=v=>need(Number.isSafeInteger(v)&&v>=0);

// Check proxies before any reflection; the unchanged Learning owner then handles
// accessors, dense arrays, exotic objects, symbols, cycles and Unicode.
function noProxy(input) {
  let nodes=0;const active=new Set();
  function walk(v,depth) {
    need(++nodes<=INPUT_BYTES&&depth<=32);
    if(v===null||typeof v!=='object')return;
    need(!isProxy(v)&&!active.has(v));active.add(v);
    const ds=Object.getOwnPropertyDescriptors(v);
    for(const k of Reflect.ownKeys(ds)) {
      const d=ds[k];need(Object.hasOwn(d,'value'));
      walk(d.value,depth+1);
    }
    active.delete(v);
  }
  walk(input,1);
}
function sqlMicros(value,exact=false) {
  need(typeof value==='string');
  const m=/^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,6}))?(Z|([+-])(\d\d):(\d\d))$/.exec(value);
  need(m&&validDate(m[1])&&+m[2]<24&&+m[3]<60&&+m[4]<60&&
    (!m[7]||+m[8]<=14&&+m[9]<60&&(+m[8]<14||+m[9]===0)));
  need(!exact||m[5]?.length===6&&m[6]==='Z');
  const ms=Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}${m[6]}`);need(Number.isFinite(ms));
  return BigInt(ms)*1000n+BigInt((m[5]??'').padEnd(6,'0'));
}
function referenceProfile() {
  const p=Object.fromEntries(MODULES.map(m=>[m,getModule(m).fields
    .filter(f=>['reference','references'].includes(f.type)).map(({key,type,target})=>({key,type,target}))]));
  need(hash(p)===CONTACT_LEARNING_REFERENCE_PROFILE_SHA256);
  need(Object.values(p).flat().every(f=>f.target!=='contacts'));
  return p;
}

/** Input rows are complete current-tenant SQL projections, not an authorization claim.
 * Receipt bytes and payload bytes must be actual SQL octet_length values. */
export function validateContactLearningClosure(input) {
  noProxy(input);
  const value=own(input,{bytes:INPUT_BYTES});obj(value,['historyRows','reportRows']);
  arr(value.historyRows,1020);arr(value.reportRows,20);
  const profile=referenceProfile(),sources=[],approvedEvidence=[],events=[],reports=[];
  const rowIds=new Set(),reportIds=new Set(),checksums=new Set(),commands=new Set(),liveEvents=[];
  let tenant=null,nonreportBytes=0,reportBytes=0,nonreportCount=0;
  function org(orgId) { id(orgId);if(tenant===null)tenant=orgId;need(tenant===orgId); }
  function stamp(row,exact) {need(sqlMicros(row.created_at)===sqlMicros(exact,true));}
  function report(payload) {
    // Full validation against all rows follows after collection, not a prefix.
    need(!reportIds.has(payload.id)&&!checksums.has(payload.checksum));
    reportIds.add(payload.id);checksums.add(payload.checksum);reports.push(payload);
  }
  for(const entry of value.historyRows) {
    obj(entry,['row','createdAtExact','payloadBytes','receiptBytes']);
    const r=entry.row;obj(r,HISTORY);org(r.org_id);stamp(r,entry.createdAtExact);
    digest(r.id);need(!rowIds.has(r.id));rowIds.add(r.id);
    need(Object.hasOwn(LIMIT,r.row_kind)&&['live','recovered'].includes(r.origin_mode));
    id(r.origin_org_id);const p=r.payload;need(p&&typeof p==='object'&&!Array.isArray(p));
    integer(entry.payloadBytes);integer(entry.receiptBytes);integer(r.budget_bytes);
    need(entry.payloadBytes===learningJSONBBytes(p)&&entry.payloadBytes<=LIMIT[r.row_kind]);
    need(entry.receiptBytes===(r.receipt===null?0:learningJSONBBytes(r.receipt))&&entry.receiptBytes<=8192);
    need(r.budget_bytes===entry.payloadBytes+entry.receiptBytes+4096);
    let expected;
    if(r.row_kind==='source') {
      expected=[p.sha256,p.originOrgId,p.bindingId,null,p.sourceVersion,null];sources.push(p);
    } else if(r.row_kind==='evidence') {
      expected=[p.sha256,p.pin?.originOrgId,null,null,null,null];approvedEvidence.push(p);
    } else if(r.row_kind==='event') {
      expected=[p.sha256,p.originOrgId,p.bindingId,p.sequence,null,p.programId];events.push(p);
      if(r.origin_mode==='live') {need(r.receipt&&typeof r.receipt==='object'&&!Array.isArray(r.receipt));digest(r.receipt.commandHash);
        need(!commands.has(r.receipt.commandHash));commands.add(r.receipt.commandHash);liveEvents.push(r);}
    } else {
      need(r.origin_mode==='recovered');
      expected=[p.checksum,p.orgId,null,null,null,p.manifest?.programId];report(p);
    }
    need(stable([r.id,r.origin_org_id,r.binding_id,r.sequence,r.source_version,r.program_id])===stable(expected));
    if(r.row_kind!=='event'||r.origin_mode==='recovered')need(r.receipt===null);
    if(r.row_kind==='recovered-report')reportBytes+=r.budget_bytes;
    else {nonreportCount++;nonreportBytes+=r.budget_bytes;}
  }
  for(const entry of value.reportRows) {
    obj(entry,['row','createdAtExact']);const r=entry.row;obj(r,REPORT);org(r.org_id);stamp(r,entry.createdAtExact);
    const p=r.payload;need(p&&typeof p==='object'&&!Array.isArray(p));
    need(r.id===p.id&&r.org_id===p.orgId&&r.created_by===p.createdBy&&r.title===p.title&&r.checksum===p.checksum);
    need(!rowIds.has(r.id));rowIds.add(r.id);
    const bytes=learningJSONBBytes(p);need(bytes<=LIMIT['recovered-report']);
    reportBytes+=bytes+4096;report(p);
  }
  need(nonreportCount<=1000&&nonreportBytes<=16*MIB&&reports.length<=20&&
    reportBytes<=60*MIB&&nonreportBytes+reportBytes<=60*MIB);
  sources.sort((a,b)=>origin(a,b)||a.sourceVersion-b.sourceVersion);
  approvedEvidence.sort((a,b)=>cmp(a.sha256,b.sha256));
  events.sort((a,b)=>origin(a,b)||a.sequence-b.sequence);
  reports.sort((a,b)=>cmp(a.createdAt,b.createdAt)||cmp(a.id,b.id));
  const backup=validateLearningBackup({format:'charitology-learning-backup',version:1,
    method:'learning-review-v1',sources,approvedEvidence,events,reports});
  for(const r of backup.reports)validateLearningReport(r,backup);
  const byEvent=new Map();
  for(const r of liveEvents) {
    const admitted=validateAcceptedLearningReceipt({payload:r.payload,receipt:r.receipt},backup);
    byEvent.set(admitted.event.sha256,{eventSha256:admitted.event.sha256,bindingId:admitted.event.bindingId,
      result:admitted.receipt.result});
  }
  // Preserve declared record types/IDs, including creation descriptors not yet
  // approved and literal snapshots. No fake current target rows are created.
  const identities=new Map(),types=new Map();
  function identity(originOrgId,moduleId,recordId) {
    id(originOrgId);id(recordId);need(MODULES.includes(moduleId));
    const key=stable([originOrgId,recordId]);need(!types.has(key)||types.get(key)===moduleId);types.set(key,moduleId);
    identities.set(stable([originOrgId,moduleId,recordId]),{originOrgId,moduleId,recordId});
  }
  for(const e of backup.approvedEvidence) {
    const s=e.snapshot;identity(e.pin.originOrgId,s.moduleId,s.id);
    for(const f of profile[s.moduleId]) {
      const refs=f.type==='references'?(s.data[f.key]??[]):s.data[f.key]===null?[]:[s.data[f.key]];
      for(const target of refs)identity(e.pin.originOrgId,f.target,target);
    }
  }
  for(const e of backup.events) {
    identity(e.originOrgId,'programs',e.programId);
    for(const p of learningEventRecordPins(e))identity(p.originOrgId,p.moduleId,p.recordId);
    const p=e.payload;
    for(const r of ['mapped','adopted'].includes(p.kind)?p.records:
      ['measured','corrected','decided'].includes(p.kind)?[p.record]:p.kind==='report-frozen'?[p.frozenManifest]:[])
      identity(e.originOrgId,r.moduleId,r.recordId);
    if(p.kind==='correction-abandoned')identity(e.originOrgId,'outcomes',p.candidateRecordId);
  }
  return freeze({backup,eventResults:backup.events.flatMap(e=>byEvent.has(e.sha256)?[byEvent.get(e.sha256)]:[]),
    reportIdentities:backup.reports.map(r=>({id:r.id,originOrgId:r.orgId,checksum:r.checksum})),
    recordIdentities:[...identities.values()].sort((a,b)=>cmp(stable(a),stable(b))),recordRefs:[]});
}
