/** Pure aggregate-file candidates. No result here grants live authority or evidence quality. */
import { isProxy, isUint8Array } from 'node:util/types';
import { hash } from './security.mjs';
import { learningBytes, learningCanonical, learningOwned, learningFreeze, learningRepresentable, parseLearningTransport } from './learning-transport.mjs';
import { getModule, validateRecord } from './modules.mjs';
import { validDate } from './schedule.mjs';

export const FIELD_METHOD = 'aggregate-service-visits-v1';
export const FIELD_FORMAT = 'charitology-aggregate-service-visits';
export const FIELD_LIMITS = Object.freeze({ fileBytes:262144, responses:100, contextBytes:524288, mappingBytes:16384, manifestBytes:524288, compilationBytes:1048576, targetCount:1000000000000 });
const ID=/^[A-Za-z0-9_-]{1,100}$/, SHA=/^[a-f0-9]{64}$/;
const ROW_KEYS=['responseId','startDate','endDate','geography','visitCount','denominator','excluded','exclusionReason'];
const domains=new Set(['schema','row','mapping','manifest']);
const inspections=new WeakSet();
export class FieldResponseError extends Error {
  constructor(code='field_fields',message='Use the documented aggregate-only fields.',field='',status=422){super(message);this.name='FieldResponseError';this.code=code;this.status=status;if(field)this.issues=[{field,message}];}
}
const bad=(code='field_fields',message,field='',status=422)=>{throw new FieldResponseError(code,message,field,status);};
const requireValue=(ok,code='field_fields',message,field='',status=422)=>{if(!ok)bad(code,message,field,status);};
const freeze=learningFreeze;
function transported(fn){try{return fn();}catch(e){if(e instanceof FieldResponseError)throw e;if(e?.name==='LearningError')bad(e.code==='learning_limit'?'field_limit':'field_json','Use complete bounded strict JSON with supported text.');throw e;}}

// Reject proxies before reflection and descriptor-validate the exact dense array
// indices. This does not invoke getters, toJSON, iterators or proxy traps.
function owned(value,max=FIELD_LIMITS.contextBytes){
 const stack=new Set();let nodes=0;
 const visit=(v,depth)=>{
  requireValue(++nodes<=200000&&depth<=32,'field_limit');
  if(v===null||typeof v==='boolean')return;
  if(typeof v==='number'){requireValue(Number.isFinite(v)&&!Object.is(v,-0));return;}
  if(typeof v==='string'){requireValue(v.length<=max&&learningRepresentable(v),'field_text');return;}
  requireValue(v&&typeof v==='object'&&!isProxy(v)&&!stack.has(v),'field_json');
  const array=Array.isArray(v),proto=Object.getPrototypeOf(v);requireValue(array?proto===Array.prototype:proto===Object.prototype||proto===null,'field_json');
  const names=Reflect.ownKeys(v);requireValue(names.every(k=>typeof k==='string'&&k.length<=100),'field_json');
  let ordered=names;
  if(array){const length=Object.getOwnPropertyDescriptor(v,'length');requireValue(length&&Object.hasOwn(length,'value')&&Number.isSafeInteger(length.value)&&length.value<=2000,'field_limit');ordered=Array.from({length:length.value},(_,i)=>String(i));const canonical=new Set(ordered);requireValue(names.length===length.value+1&&names.every(k=>k==='length'||canonical.has(k)),'field_json');}
  else requireValue(names.length<=100,'field_limit');
  stack.add(v);for(const k of ordered){const d=Object.getOwnPropertyDescriptor(v,k);requireValue(d?.enumerable&&Object.hasOwn(d,'value'),'field_json');visit(d.value,depth+1);}stack.delete(v);
 };
 visit(value,0);return transported(()=>learningOwned(value,{bytes:max}));
}
const exact=(v,keys)=>requireValue(v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),'field_shape');
const id=(v,field='')=>requireValue(typeof v==='string'&&ID.test(v),'field_id',undefined,field);
const digest=v=>requireValue(typeof v==='string'&&SHA.test(v),'field_checksum');
const revision=v=>requireValue(Number.isSafeInteger(v)&&v>=1&&v<=2147483647,'field_revision');
const count=(v,field='')=>requireValue(v===null||Number.isSafeInteger(v)&&v>=0&&!Object.is(v,-0),'field_count','Use null or an exact nonnegative safe integer.',field);
const text=(v,max,{nullable=false,multiline=false}={})=>{
 if(v===null&&nullable)return;
 requireValue(typeof v==='string'&&v.length>=1&&v.length<=max&&v===v.trim()&&learningRepresentable(v)&&!(multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/:/[\u0000-\u001f\u007f-\u009f]/).test(v),'field_text');
};
const canonical=v=>transported(()=>learningCanonical(v,{maxBytes:FIELD_LIMITS.compilationBytes}));
function domainHash(domain,value){requireValue(domains.has(domain),'field_hash_domain');return hash('charitology-field-response-v1:'+domain+'\n'+canonical(value));}
const same=(a,b)=>canonical(a)===canonical(b);
const seal=(domain,body)=>freeze({...body,sha256:domainHash(domain,body)});
const checkedSeal=(domain,v)=>{digest(v.sha256);const {sha256,...body}=v;requireValue(domainHash(domain,body)===sha256,'field_checksum');};

const SCHEMA=freeze({format:FIELD_FORMAT,version:1,formId:FIELD_METHOD,schemaVersion:1,sourceUnit:'visits',responseKeys:ROW_KEYS,types:{responseId:'opaque-aggregate-id',startDate:'calendar-day-1900-2200',endDate:'calendar-day-1900-2200',geography:'nullable-aggregate-label-240',visitCount:'nullable-exact-nonnegative-safe-integer',denominator:'nullable-exact-nonnegative-safe-integer',excluded:'boolean',exclusionReason:'null-unless-explicitly-excluded-600'}});
export const FIELD_FORM_SCHEMA_SHA256=domainHash('schema',SCHEMA);
const FORM=freeze({format:FIELD_FORMAT,version:1,formId:FIELD_METHOD,schemaVersion:1,schemaSha256:FIELD_FORM_SCHEMA_SHA256});
const FIELDS=freeze({responseId:'source.externalId',visitCount:'data.value',denominator:'data.denominator',startDate:'data.startDate',endDate:'data.endDate',geography:'data.geography',excluded:'manifest.excluded',exclusionReason:'manifest.exclusionReason'});
function rowFields(v){
 exact(v,ROW_KEYS);id(v.responseId,'responseId');requireValue(validDate(v.startDate)&&validDate(v.endDate)&&v.startDate<=v.endDate,'field_period','Use a real ordered calendar-day period from1900 through2200.');
 text(v.geography,240,{nullable:true});count(v.visitCount,'visitCount');count(v.denominator,'denominator');requireValue(typeof v.excluded==='boolean','field_exclusion');
 if(v.excluded)text(v.exclusionReason,600,{multiline:true});else requireValue(v.exclusionReason===null,'field_exclusion','An included row cannot carry an ignored exclusion reason.');return v;
}
function fileFields(v){exact(v,['format','version','formId','schemaVersion','responses']);requireValue(v.format===FIELD_FORMAT&&v.version===1&&v.formId===FIELD_METHOD&&v.schemaVersion===1,'field_form');requireValue(Array.isArray(v.responses)&&v.responses.length<=FIELD_LIMITS.responses,'field_limit');const ids=new Set();for(const r of v.responses){rowFields(r);requireValue(!ids.has(r.responseId),'field_duplicate','Use distinct aggregate response IDs.');ids.add(r.responseId);}return v;}
export const validateFieldAggregateValue=input=>freeze(fileFields(owned(input,FIELD_LIMITS.fileBytes)));
export const fieldCanonicalRowSha256=input=>domainHash('row',rowFields(owned(input,16384)));

// JSON.parse can round a fractional decimal into an integer. On this closed form
// every numeric token is an integer field. Check its exact decimal meaning too,
// without huge powers/BigInts. Exponents are allowed only when exact and bounded.
function exactUnsignedIntegerToken(token){
 if(token.startsWith('-'))return false;
 const m=/^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);if(!m)return false;
 const fraction=m[2]??'',significand=(m[1]+fraction).replace(/^0+/,'');if(!significand)return true;
 const exponentText=m[3]??'0',unsignedExponent=exponentText.replace(/^[+-]/,'').replace(/^0+/,'')||'0';if(unsignedExponent.length>6)return false;
 const exponent=Number(exponentText);if(!Number.isSafeInteger(exponent)||Math.abs(exponent)>FIELD_LIMITS.fileBytes+16)return false;
 const scale=fraction.length-exponent;let integer;
 if(scale>0){if(scale>=significand.length||!/^[0]+$/.test(significand.slice(-scale)))return false;integer=significand.slice(0,-scale);}
 else {if(significand.length-scale>16)return false;integer=significand+'0'.repeat(-scale);}
 return integer.length<=16&&BigInt(integer)<=BigInt(Number.MAX_SAFE_INTEGER);
}
function exactFileIntegers(bytes){
 const s=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);let at=0;
 while(at<s.length){const c=s[at];if(c==='"'){at++;while(at<s.length){const next=s[at++];if(next==='\\')at++;else if(next==='"')break;}continue;}
  if(c==='-'||c>='0'&&c<='9'){const token=s.slice(at).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)[0];requireValue(exactUnsignedIntegerToken(token),'field_count','File numbers must have exact nonnegative safe-integer meaning.');at+=token.length;}else at++;
 }
}
export function inspectFieldAggregateFile(raw){
 // Native brand admission precedes any instanceof in the unchanged shared
 // copier. Exact built-in prototypes exclude Proxy/custom prototype chains.
 requireValue(!isProxy(raw)&&isUint8Array(raw),'field_json');
 const prototype=Object.getPrototypeOf(raw);requireValue(prototype===Uint8Array.prototype||prototype===Buffer.prototype,'field_json');let bytes;
 try{bytes=learningBytes(raw,FIELD_LIMITS.fileBytes);}catch(e){if(e?.name==='LearningError')bad(e.code==='learning_limit'?'field_size':'field_json','Choose complete original UTF-8 aggregate JSON bytes.','',e.code==='learning_limit'?413:422);throw e;}
 const parsed=transported(()=>parseLearningTransport(bytes,FIELD_LIMITS.fileBytes));exactFileIntegers(bytes);const body=validateFieldAggregateValue(parsed);
 const file=freeze({...FORM,bytes:bytes.length,sha256:hash(Buffer.from(bytes)),sourceRows:body.responses.length});
 const result=freeze({format:'charitology-field-response-inspection',version:1,file,rows:body.responses.map((row,index)=>freeze({index,row,canonicalSha256:domainHash('row',row)}))});inspections.add(result);return result;
}

function referenceFields(orgId,program,indicator,status=422){
 for(const r of [program,indicator]){exact(r,['id','orgId','moduleId','revision','data','deletedAt']);id(r.id);id(r.orgId);revision(r.revision);requireValue(r.orgId===orgId&&r.deletedAt===null,'field_dependencies','Choose current same-workspace definitions.','',status);requireValue(r.data&&typeof r.data==='object'&&!Array.isArray(r.data),'field_dependencies',undefined,'',status);}
 requireValue(program.id!==indicator.id&&program.moduleId==='programs'&&program.data.kind==='program'&&indicator.moduleId==='outcomes'&&indicator.data.kind==='indicator'&&indicator.data.programId===program.id,'field_dependencies','Choose a typed program and its indicator.','',status);
 for(const r of [program,indicator])exact(r.data,getModule(r.moduleId).fields.map(f=>f.key));
 // Current definitions are caller-supplied data, not authority. Still require the
 // exact ordinary normalized schema; hashing malformed fields is not admission.
 try{requireValue(same(validateRecord('programs',program.data),program.data)&&same(validateRecord('outcomes',indicator.data,{orgId,recordId:indicator.id,records:[program]}),indicator.data),'field_dependencies','Choose ordinary normalized definitions.','',status);}catch(e){if(e instanceof FieldResponseError)throw e;bad('field_dependencies','Choose ordinary normalized definitions.','',status);}
 return [program,indicator];
}
const recordPin=r=>freeze({recordId:r.id,revision:r.revision,dataSha256:hash(r.data)});
function pinFields(v){exact(v,['recordId','revision','dataSha256']);id(v.recordId);revision(v.revision);digest(v.dataSha256);}
function mappingFields(v){
 exact(v,['format','version','adapterVersion','orgId','form','sourceUnit','program','indicator','fields','externalIdentity','sha256']);requireValue(v.format==='charitology-field-response-mapping'&&v.version===1&&v.adapterVersion===FIELD_METHOD,'field_mapping');id(v.orgId);requireValue(same(v.form,FORM)&&same(v.fields,FIELDS)&&v.sourceUnit==='visits'&&v.externalIdentity==='formId:responseId','field_mapping','This version maps only the declared visits fields without conversion.');pinFields(v.program);pinFields(v.indicator);requireValue(v.program.recordId!==v.indicator.recordId,'field_mapping');checkedSeal('mapping',v);return v;
}
export const validateFieldMapping=input=>freeze(mappingFields(owned(input,FIELD_LIMITS.mappingBytes)));
export function makeFieldMapping(input){
 const v=owned(input,FIELD_LIMITS.contextBytes);exact(v,['orgId','program','indicator']);id(v.orgId);referenceFields(v.orgId,v.program,v.indicator);requireValue(v.indicator.data.unit==='visits','field_unit','Choose an indicator whose exact unit is visits.');return validateFieldMapping(seal('mapping',{format:'charitology-field-response-mapping',version:1,adapterVersion:FIELD_METHOD,orgId:v.orgId,form:FORM,sourceUnit:'visits',program:recordPin(v.program),indicator:recordPin(v.indicator),fields:FIELDS,externalIdentity:'formId:responseId'}));
}
function targetCounts(row){for(const k of ['visitCount','denominator'])requireValue(row[k]===null||row[k]<=FIELD_LIMITS.targetCount,'field_target_bound','This selected count exceeds the ordinary Outcomes field limit.',k);}
function observationData(row,file,mapping,index){
 targetCounts(row);
 return{title:'Imported visits: '+row.responseId,kind:'observation',programId:mapping.program.recordId,indicatorId:mapping.indicator.recordId,value:row.visitCount,unit:'visits',denominator:row.denominator,startDate:row.startDate,endDate:row.endDate,geography:row.geography,method:'administrative',evidence:'unknown',sourceUrl:null,limitations:[`Aggregate response ${row.responseId}; source array index ${index}.`,`File SHA256 ${file.sha256}.`,`Form ${FIELD_METHOD}; schema1; mapping SHA256 ${mapping.sha256}.`,row.visitCount===null?'Observed value is unknown.':'A visit count was supplied; collection is unverified.',row.denominator===null?'Denominator is unknown.':'A denominator was explicitly supplied.',row.geography===null?'Aggregate geography is unknown.':'Aggregate geography was explicitly supplied.','Imported draft; collection and interpretation not independently reviewed.'].join('\n')};
}
const externalId=row=>FIELD_METHOD+':'+row.responseId;
function summary(file,rows){const created=rows.filter(r=>!r.row.excluded);return{sourceRows:file.sourceRows,selectedRows:rows.length,createdRows:created.length,excludedRows:rows.length-created.length,unselectedRows:file.sourceRows-rows.length,unknownValueRows:created.filter(r=>r.row.visitCount===null).length,unknownDenominatorRows:created.filter(r=>r.row.denominator===null).length};}
function fileMetadata(v){exact(v,['format','version','formId','schemaVersion','schemaSha256','bytes','sha256','sourceRows']);requireValue(same({...FORM,bytes:v.bytes,sha256:v.sha256,sourceRows:v.sourceRows},v),'field_form');requireValue(Number.isSafeInteger(v.bytes)&&v.bytes>0&&v.bytes<=FIELD_LIMITS.fileBytes&&Number.isSafeInteger(v.sourceRows)&&v.sourceRows>=0&&v.sourceRows<=FIELD_LIMITS.responses,'field_limit');digest(v.sha256);}
function manifestFields(v){
 exact(v,['format','version','method','originOrgId','integrationId','file','mapping','rows','created','summary','sha256']);requireValue(v.format==='charitology-field-response-import'&&v.version===1&&v.method===FIELD_METHOD,'field_manifest');id(v.originOrgId);id(v.integrationId);fileMetadata(v.file);mappingFields(v.mapping);requireValue(v.mapping.orgId===v.originOrgId,'field_manifest');requireValue(Array.isArray(v.rows)&&v.rows.length<=v.file.sourceRows&&Array.isArray(v.created),'field_manifest');
 const ids=new Set();let previous=-1;for(const r of v.rows){exact(r,['index','row','canonicalSha256','disposition']);rowFields(r.row);requireValue(Number.isSafeInteger(r.index)&&r.index>previous&&r.index<v.file.sourceRows,'field_manifest');previous=r.index;requireValue(!ids.has(r.row.responseId),'field_duplicate');ids.add(r.row.responseId);requireValue(r.canonicalSha256===domainHash('row',r.row),'field_checksum');requireValue(r.disposition===(r.row.excluded?'excluded':'created'),'field_manifest');}
 const included=v.rows.filter(r=>!r.row.excluded);requireValue(v.created.length===included.length,'field_manifest');const targets=new Set();for(let i=0;i<v.created.length;i++){const c=v.created[i],r=included[i];exact(c,['responseId','recordId','moduleId','revision','status','dataSha256']);id(c.recordId);requireValue(c.responseId===r.row.responseId&&!targets.has(c.recordId)&&![v.mapping.program.recordId,v.mapping.indicator.recordId].includes(c.recordId)&&c.moduleId==='outcomes'&&c.revision===1&&c.status==='draft','field_manifest');targets.add(c.recordId);requireValue(c.dataSha256===hash(observationData(r.row,v.file,v.mapping,r.index)),'field_checksum');}
 requireValue(same(v.summary,summary(v.file,v.rows)),'field_manifest');checkedSeal('manifest',v);return v;
}
export const validateFieldImportManifest=input=>freeze(manifestFields(owned(input,FIELD_LIMITS.manifestBytes)));
export function compileFieldObservationDrafts(input){
 const v=owned(input,FIELD_LIMITS.compilationBytes);exact(v,['inspection','mapping','selection','orgId','actorId','integrationId','candidateIds','program','indicator']);
 const original=Object.getOwnPropertyDescriptor(input,'inspection');requireValue(original&&Object.hasOwn(original,'value')&&inspections.has(original.value),'field_inspection','Inspect original bytes before compiling candidates.');for(const k of ['orgId','actorId','integrationId'])id(v[k]);
 const mapping=validateFieldMapping(v.mapping);requireValue(mapping.orgId===v.orgId,'field_stale','The reviewed definitions changed.','',409);const records=referenceFields(v.orgId,v.program,v.indicator,409);requireValue(same(recordPin(v.program),mapping.program)&&same(recordPin(v.indicator),mapping.indicator),'field_stale','The reviewed definitions changed.','',409);requireValue(v.indicator.data.unit==='visits','field_stale','The reviewed indicator unit changed.','',409);
 exact(v.selection,['responseIds']);requireValue(Array.isArray(v.selection.responseIds)&&v.selection.responseIds.length<=FIELD_LIMITS.responses,'field_selection');const selected=new Set();for(const responseId of v.selection.responseIds){id(responseId);requireValue(!selected.has(responseId)&&v.inspection.rows.some(r=>r.row.responseId===responseId),'field_selection');selected.add(responseId);}
 requireValue(Array.isArray(v.candidateIds)&&v.candidateIds.length<=FIELD_LIMITS.responses,'field_selection');const wanted=new Map(),targets=new Set();for(const c of v.candidateIds){exact(c,['responseId','recordId']);id(c.responseId);id(c.recordId);requireValue(!wanted.has(c.responseId)&&!targets.has(c.recordId)&&![v.program.id,v.indicator.id].includes(c.recordId),'field_selection');wanted.set(c.responseId,c.recordId);targets.add(c.recordId);}
 const rows=v.inspection.rows.filter(r=>selected.has(r.row.responseId)),included=rows.filter(r=>!r.row.excluded);requireValue(wanted.size===included.length&&included.every(r=>wanted.has(r.row.responseId)),'field_selection');
 const candidates=[];for(const r of included){const recordId=wanted.get(r.row.responseId),expected=observationData(r.row,v.inspection.file,mapping,r.index);const data=validateRecord('outcomes',expected,{orgId:v.orgId,recordId,status:'draft',records});requireValue(same(data,expected),'field_normalization','Source values must already match ordinary field admission.');candidates.push(freeze({id:recordId,moduleId:'outcomes',data,status:'draft',ownerId:v.actorId,revision:1,approval:null,snapshot:null,source:{integrationId:v.integrationId,externalId:externalId(r.row),checksum:r.canonicalSha256},lastEditedBy:v.actorId}));}
 const manifest=validateFieldImportManifest(seal('manifest',{format:'charitology-field-response-import',version:1,method:FIELD_METHOD,originOrgId:v.orgId,integrationId:v.integrationId,file:v.inspection.file,mapping,rows:rows.map(r=>({...r,disposition:r.row.excluded?'excluded':'created'})),created:candidates.map(c=>({responseId:included.find(r=>wanted.get(r.row.responseId)===c.id).row.responseId,recordId:c.id,moduleId:'outcomes',revision:1,status:'draft',dataSha256:hash(c.data)})),summary:summary(v.inspection.file,rows)}));
 return validateFieldCompilation({format:'charitology-field-response-compilation',version:1,method:FIELD_METHOD,candidates,manifest,summary:manifest.summary});
}
export function validateFieldCompilation(input){
 const v=owned(input,FIELD_LIMITS.compilationBytes);exact(v,['format','version','method','candidates','manifest','summary']);requireValue(v.format==='charitology-field-response-compilation'&&v.version===1&&v.method===FIELD_METHOD,'field_compilation');const m=validateFieldImportManifest(v.manifest);requireValue(same(v.summary,m.summary)&&Array.isArray(v.candidates)&&v.candidates.length===m.created.length,'field_compilation');const rows=m.rows.filter(r=>!r.row.excluded);let actor=null;
 for(let i=0;i<v.candidates.length;i++){const c=v.candidates[i],d=m.created[i],r=rows[i];exact(c,['id','moduleId','data','status','ownerId','revision','approval','snapshot','source','lastEditedBy']);id(c.ownerId);if(actor===null)actor=c.ownerId;requireValue(c.id===d.recordId&&c.moduleId==='outcomes'&&c.status==='draft'&&c.revision===1&&c.approval===null&&c.snapshot===null&&c.ownerId===actor&&c.lastEditedBy===actor,'field_compilation');exact(c.source,['integrationId','externalId','checksum']);requireValue(same(c.source,{integrationId:m.integrationId,externalId:externalId(r.row),checksum:r.canonicalSha256})&&same(c.data,observationData(r.row,m.file,m.mapping,r.index))&&hash(c.data)===d.dataSha256,'field_compilation');}
 return freeze(v);
}
