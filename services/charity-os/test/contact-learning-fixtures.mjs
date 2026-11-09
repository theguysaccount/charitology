// Fictional pure producer fixtures. Synthetic receipts establish shape only,
// never actual acceptance, session, account, independent review or SQL authority.
import { buildLearningFixture, learningMappedFixture, appendLearningTestMeasurement,
  appendLearningTestEvent, finishLearningFixture } from './learning-fixtures.mjs';
import { learningHash as H } from '../lib/learning-json.mjs';
import { headPin } from '../lib/learning-model.mjs';
import { learningJSONBBytes } from '../lib/learning-backup.mjs';
export const EXACT='2026-11-08T20:00:00.123456Z';
export const clone=v=>structuredClone(v);
export function fixture({corrections=false,...options}={}) {
  if(!corrections)return buildLearningFixture(options);
  const f=learningMappedFixture(options),old=appendLearningTestMeasurement(f,0,{recordId:'original'});
  const bad=appendLearningTestMeasurement(f,5,{recordId:'bad',approved:false,correction:old.proof.evidence.pin});
  appendLearningTestEvent(f,{kind:'correction-abandoned',correctionEventSha256:bad.event.sha256,
    candidateRecordId:'bad',reason:'[Planning] {draft}\nFictional candidate, not identity'});
  const good=appendLearningTestMeasurement(f,4,{recordId:'good',correction:old.proof.evidence.pin});
  appendLearningTestEvent(f,{kind:'correction-applied',correctionEventSha256:good.event.sha256,
    replaces:old.proof.evidence.pin,replacement:good.proof.evidence.pin});
  return finishLearningFixture(f,[good]);
}
export function receipt(event,proofs) {
  const p=event.payload,operation={mapped:'map',adopted:'adopt',measured:'measure',corrected:'correct',
    'correction-applied':'apply-correction','correction-abandoned':'abandon-correction',decided:'decide','report-frozen':'freeze'}[p.kind];
  let records=['mapped','adopted'].includes(p.kind)?p.records:['measured','corrected','decided'].includes(p.kind)?[p.record]:
    p.kind==='report-frozen'?[p.frozenManifest]:[];
  if(p.kind==='correction-applied') {
    const e=proofs.find(e=>e.pin.recordId===p.replacement.recordId);
    records=[{moduleId:'outcomes',recordId:e.pin.recordId,revision:e.pin.revision,dataSha256:H('data',e.snapshot.data)}];
  }
  return {version:1,operation,commandHash:H('command',event.sha256),requestHash:'2'.repeat(64),
    actorBindingHash:'3'.repeat(64),actorId:event.actorId,sessionSha256:'4'.repeat(64),membershipSha256:'5'.repeat(64),
    memberCreatedAtExact:'2026-10-27T00:00:00.000000Z',restoreEpochSha256:'6'.repeat(64),
    previewId:'fictional-preview',reviewSha256:'7'.repeat(64),acceptedAt:'2026-10-27T00:00:01.000Z',
    result:{outcome:p.kind==='report-frozen'?'frozen':p.kind,head:headPin(event),records,
      report:p.kind==='report-frozen'?{id:p.reportId,checksum:p.reportChecksum}:null}};
}
export function refreshBytes(entry) {
  entry.payloadBytes=learningJSONBBytes(entry.row.payload);
  entry.receiptBytes=entry.row.receipt===null?0:learningJSONBBytes(entry.row.receipt);
  entry.row.budget_bytes=entry.payloadBytes+entry.receiptBytes+4096;return entry;
}
export function rows(f,{recovered=false,tenant=recovered?'destination':f.orgId}={}) {
  const historyRows=[];
  function put(kind,payload) {
    const event=kind==='event',source=kind==='source',evidence=kind==='evidence';
    const row={org_id:tenant,id:kind==='recovered-report'?payload.checksum:payload.sha256,row_kind:kind,
      origin_mode:recovered?'recovered':'live',origin_org_id:evidence?payload.pin.originOrgId:payload.originOrgId??payload.orgId,
      binding_id:source||event?payload.bindingId:null,sequence:event?payload.sequence:null,
      source_version:source?payload.sourceVersion:null,program_id:event?payload.programId:kind==='recovered-report'?payload.manifest.programId:null,
      payload:clone(payload),receipt:event&&!recovered?receipt(payload,f.approvedEvidence):null,
      budget_bytes:0,created_at:'2026-11-08T12:00:00.123456-08:00'};
    historyRows.push(refreshBytes({row,createdAtExact:EXACT,payloadBytes:0,receiptBytes:0}));
  }
  for(const p of f.backup.sources)put('source',p);
  for(const p of f.backup.approvedEvidence)put('evidence',p);
  for(const p of f.backup.events)put('event',p);
  let reportRows=[];
  if(recovered)for(const p of f.backup.reports)put('recovered-report',p);
  else reportRows=f.backup.reports.map(p=>({row:{org_id:p.orgId,id:p.id,created_by:p.createdBy,title:p.title,
    checksum:p.checksum,payload:clone(p),created_at:'2026-11-08T20:00:00.123456Z'},createdAtExact:EXACT}));
  return {historyRows,reportRows};
}
