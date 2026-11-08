/** Closed FIELD envelopes. Original file JSON is admitted only by the separate byte model. */
import { isProxy, isUint8Array } from 'node:util/types';
import { parseLearningTransport } from './learning-transport.mjs';
import { FieldResponseError, FIELD_LIMITS } from './field-response-model.mjs';
export const FIELD_BODY_BYTES=524288;
const ID=/^[A-Za-z0-9_-]{1,100}$/,SHA=/^[a-f0-9]{64}$/;
const bad=(code='field_request',status=422)=>{throw new FieldResponseError(code,'Use the documented aggregate import fields.','',status);};
export function fieldObject(value,keys){
 if(!value||typeof value!=='object'||isProxy(value)||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))bad();
 const names=Reflect.ownKeys(value);if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k)))bad();
 const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();out[key]=d.value;}return out;
}
export const fieldId=value=>{if(typeof value!=='string'||!ID.test(value))bad();return value;};
export const fieldDigest=value=>{if(typeof value!=='string'||!SHA.test(value))bad();return value;};
export function fieldIds(value,max=100){
 if(!value||typeof value!=='object'||isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)bad();
 const length=Object.getOwnPropertyDescriptor(value,'length');if(!length||!Object.hasOwn(length,'value')||!Number.isSafeInteger(length.value)||length.value>max)bad();
 const names=Reflect.ownKeys(value),indices=new Set(Array.from({length:length.value},(_,i)=>String(i)));if(names.length!==length.value+1||names.some(k=>k!=='length'&&!indices.has(k)))bad();
 const out=[];for(let i=0;i<length.value;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();out.push(fieldId(d.value));}return out;
}
function originalBytes(value){
 if(typeof value!=='string'||value.length>4*Math.ceil(FIELD_LIMITS.fileBytes/3)||!value.length||value.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))bad('field_file');
 const bytes=Buffer.from(value,'base64');if(!bytes.length||bytes.length>FIELD_LIMITS.fileBytes||bytes.toString('base64')!==value)bad('field_file');return bytes;
}
export function validateFieldInspectRequest(input){
 const v=fieldObject(input,['fileBase64','programId','indicatorId','integrationId','privacyAcknowledged']);for(const k of ['programId','indicatorId','integrationId'])fieldId(v[k]);if(v.privacyAcknowledged!==true)bad('field_privacy');return {...v,fileBytes:originalBytes(v.fileBase64)};
}
export function validateFieldPreviewRequest(input){
 const v=fieldObject(input,['fileBase64','programId','indicatorId','integrationId','privacyAcknowledged','mappingSha256','selection']);
 const basic=validateFieldInspectRequest(Object.fromEntries(['fileBase64','programId','indicatorId','integrationId','privacyAcknowledged'].map(k=>[k,v[k]])));fieldDigest(v.mappingSha256);
 const selection=fieldObject(v.selection,['responseIds']),ids=fieldIds(selection.responseIds);if(!ids.length||new Set(ids).size!==ids.length)bad('field_selection');return {...basic,mappingSha256:v.mappingSha256,selection:{responseIds:ids}};
}
export function validateFieldCommitRequest(input){const v=fieldObject(input,['previewId','commandKey']);fieldId(v.previewId);fieldId(v.commandKey);return v;}
export function isFieldResponsePath(path){return /^\/api\/orgs\/[A-Za-z0-9_-]{1,100}\/field-responses(?:\/|$)/.test(path);}
export function isFieldResponseInspect(path,method){return method==='POST'&&/^\/api\/orgs\/[A-Za-z0-9_-]{1,100}\/field-responses\/inspect$/.test(path);}
export async function readFieldResponseBody(request){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||'')||!['','identity'].includes(request.headers.get('content-encoding')||''))bad('field_body',415);
 const declared=request.headers.get('content-length');if(declared!==null&&(!/^(?:0|[1-9][0-9]*)$/.test(declared)||Number(declared)>FIELD_BODY_BYTES))bad('field_size',413);
 const reader=request.body?.getReader(),chunks=[];let total=0;try{if(reader)while(true){const part=await reader.read();if(part.done)break;if(isProxy(part.value)||!isUint8Array(part.value))bad('field_body');total+=part.value.byteLength;if(total>FIELD_BODY_BYTES){await reader.cancel();bad('field_size',413);}chunks.push(part.value);}}finally{reader?.releaseLock();}
 try{return parseLearningTransport(Buffer.concat(chunks,total),FIELD_BODY_BYTES);}catch(e){if(e?.name==='LearningError')bad('field_json');throw e;}
}
