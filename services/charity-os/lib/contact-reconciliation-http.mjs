/** Closed request data only. Caller owns fresh authority/CSRF/rates before body reads. */
import {isProxy,isUint8Array} from 'node:util/types';
import {parseLearningTransport} from './learning-transport.mjs';
import {ContactReconciliationError,validateContactReconciliationDecision} from './contact-reconciliation-model.mjs';
export const CRM_BODY_BYTES=16384;
const ID=/^[A-Za-z0-9_-]{1,100}$/,SHA=/^[a-f0-9]{64}$/;
const bad=(code='contact_reconciliation_request',status=422)=>{const e=new ContactReconciliationError(code);e.status=status;throw e;};
const freeze=Object.freeze;
function object(v,keys){
 if(!v||typeof v!=='object'||isProxy(v)||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype)bad();
 const names=Reflect.ownKeys(v);if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k)))bad();
 const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();out[k]=d.value;}return out;
}
export const contactRequestId=v=>{if(typeof v!=='string'||!ID.test(v))bad();return v;};
const digest=v=>{if(typeof v!=='string'||!SHA.test(v))bad();return v;};
export function validateContactInspectRequest(input){const v=object(input,['leftId','rightId']);contactRequestId(v.leftId);contactRequestId(v.rightId);if(v.leftId===v.rightId)bad();return freeze(v);}
export function validateContactPreviewRequest(input){
 const v=object(input,['leftId','rightId','contextSha256','decision']);const pair=validateContactInspectRequest({leftId:v.leftId,rightId:v.rightId});digest(v.contextSha256);
 const decision=validateContactReconciliationDecision(v.decision);if(decision.operation==='merge'&&![pair.leftId,pair.rightId].includes(decision.survivorId))bad();
 return freeze({...pair,contextSha256:v.contextSha256,decision});
}
export function validateContactReversePreviewRequest(input){const v=object(input,['reportId']);contactRequestId(v.reportId);return freeze(v);}
export function validateContactCommitRequest(input){const v=object(input,['previewId','commandKey']);contactRequestId(v.previewId);contactRequestId(v.commandKey);return freeze(v);}
export const isContactReconciliationPath=p=>typeof p==='string'&&/^\/api\/orgs\/[A-Za-z0-9_-]{1,100}\/contact-reconciliation(?:\/|$)/.test(p);
export function classifyContactReconciliationRequest(pathname,method,search=''){
 if(!isContactReconciliationPath(pathname))return null;
 const m=/^\/api\/orgs\/([A-Za-z0-9_-]{1,100})\/contact-reconciliation\/(inspect|preview|reverse-preview|commit|history)(?:\/([A-Za-z0-9_-]{1,100}))?$/.exec(pathname);
 if(!m||m[3]&&m[2]!=='history')bad('contact_reconciliation_route',404);
 const [,orgId,action,reportId]=m,read=action==='history';if(method!==(read?'GET':'POST'))bad('contact_reconciliation_method',405);
 if(typeof search!=='string'||search.length>1024||search!==''&&!search.startsWith('?')||!read&&search||reportId&&search)bad('contact_reconciliation_query');
 let history=null;if(read&&!reportId){const params=new URLSearchParams(search),names=[...params.keys()];if(names.some(k=>!['after','limit'].includes(k))||new Set(names).size!==names.length)bad('contact_reconciliation_query');const after=params.get('after'),limit=params.get('limit');if(after!==null)contactRequestId(after);if(limit!==null&&!/^(?:[1-9]|1[0-9]|20)$/.test(limit))bad('contact_reconciliation_query');history=freeze({after,limit:limit===null?20:Number(limit)});}
 return freeze({orgId,operation:reportId?'history-detail':action,reportId:reportId??null,history});
}
const byteLength=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'byteLength').get;
export async function readContactReconciliationBody(request){
 if(!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(request.headers.get('content-type')||'')||!['','identity'].includes((request.headers.get('content-encoding')||'').toLowerCase()))bad('contact_reconciliation_body',415);
 const declared=request.headers.get('content-length');if(declared!==null&&(!/^(?:0|[1-9][0-9]*)$/.test(declared)||Number(declared)>CRM_BODY_BYTES))bad('contact_reconciliation_size',413);
 if(declared!==null&&request.headers.has('transfer-encoding'))bad('contact_reconciliation_body',400);
 const reader=request.body?.getReader(),chunks=[];let size=0,count=0;
 try{
  if(reader)while(true){const part=await reader.read();if(part.done)break;const v=part.value;if(isProxy(v)||!isUint8Array(v))bad('contact_reconciliation_body',400);const n=byteLength.call(v);size+=n;if(++count>CRM_BODY_BYTES+1||size>CRM_BODY_BYTES)bad('contact_reconciliation_size',413);const copy=new Uint8Array(n);Uint8Array.prototype.set.call(copy,v);chunks.push(copy);}
  if(declared!==null&&Number(declared)!==size)bad('contact_reconciliation_body',400);
  let value;try{value=parseLearningTransport(Buffer.concat(chunks,size),CRM_BODY_BYTES);}catch(e){if(e?.name==='LearningError')bad('contact_reconciliation_json');throw e;}
  if(!value||typeof value!=='object'||Array.isArray(value))bad('contact_reconciliation_json');return value;
 }catch(e){if(reader)try{await reader.cancel();}catch{}if(e instanceof ContactReconciliationError)throw e;bad('contact_reconciliation_body',400);}
 finally{if(reader)try{reader.releaseLock();}catch{}}
}
