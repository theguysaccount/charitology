/** Offline Node adapter proposal. Supplied receipt clocks are not authenticated here. No I/O. */
import {types as native} from 'node:util';
import {observationClone,observationFreeze,observationFail,observationObjectHash,
  observationRawHash,strictObservationJson,canonicalObservationJson} from '../observation-canonical.mjs';
import {createObservationSourceContext,observationPin} from '../observation-sources.mjs';
import {observationDecimalFromLexeme} from '../observation-model.mjs';
import {parsePlanClusterCsv,PLAN_CLUSTER_DEFINITION as D,validatePlanClusterSourceDescriptor} from './model.mjs';
import {fundingDecimal} from '../humanitarian-funding/model.mjs';
import {PLAN_CLUSTER_PERIOD_LABEL,PLAN_CLUSTER_UNKNOWN_REMAINDER,PLAN_CLUSTER_IDENTITY_COLUMNS,
 PLAN_CLUSTER_MEASURES,PLAN_CLUSTER_METADATA_URL,PLAN_CLUSTER_EXCERPT_NOTICE} from './interpretation.mjs';

const fail = message => observationFail('invalid_source',message);
const same=(a,b)=>canonicalObservationJson(a)===canonicalObservationJson(b);
function object(value,keys) {
 if(!value||native.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)fail('Plain data-only plan-cluster input required');
 const ds=Object.getOwnPropertyDescriptors(value);
 if(Reflect.ownKeys(ds).length!==keys.length||keys.some(k=>!ds[k]?.enumerable||!Object.hasOwn(ds[k],'value')))fail('Closed plan-cluster input fields required');
 return Object.fromEntries(keys.map(k=>[k,ds[k].value]));
}
function copyBytes(value,max) {
 if(!value||native.isProxy(value)||!native.isUint8Array(value)||![Uint8Array.prototype,Buffer.prototype].includes(Object.getPrototypeOf(value)))fail('Native complete source bytes required');
 const proto=Object.getPrototypeOf(Uint8Array.prototype),get=k=>Object.getOwnPropertyDescriptor(proto,k).get;
 const buffer=get('buffer').call(value),length=get('byteLength').call(value),offset=get('byteOffset').call(value);
 if(native.isSharedArrayBuffer(buffer)||Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'resizable')?.get.call(buffer)||length<1||length>max)fail('Bounded immutable complete source bytes required');
 return new Uint8Array(new Uint8Array(buffer,offset,length));
}
function instant(value) {
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value))fail('Actual explicit client UTC millisecond receipt instant required');
 const n=Date.parse(value);if(!Number.isFinite(n)||new Date(n).toISOString()!==value)fail('Invalid client receipt instant');return n;
}
function receipt(value,max) {
 const v=object(value,['bytes','startedAt','completedAt','httpDate']),bytes=copyBytes(v.bytes,max);
 const started=instant(v.startedAt),completed=instant(v.completedAt);
 if(completed<started||completed-started>45000)fail('Receipt clock order/deadline exceeds declared bounds');
 if(v.httpDate!==null&&(typeof v.httpDate!=='string'||v.httpDate.length>240||/[\u0000-\u001f\u007f]/.test(v.httpDate)))fail('HTTP Date must remain a bounded literal or explicit null');
 return {bytes,startedAt:v.startedAt,completedAt:v.completedAt,httpDate:v.httpDate};
}
function metadata(receipt) {
 const tree=strictObservationJson(receipt.bytes,524288);
 if(!tree||tree.success!==true||!tree.result||Array.isArray(tree.result)||tree.result.id!==D.source.datasetId||tree.result.name!==D.source.packageName||!Array.isArray(tree.result.resources))fail('Exact successful HDX package metadata required');
 const d=tree.result,found=d.resources.map((value,index)=>({value,index})).filter(x=>x.value?.id===D.source.resourceId);
 if(found.length!==1)fail('Selected resource missing or duplicated in package metadata');
 const {value:r,index}=found[0];
 if(r.format!=='CSV')fail('Selected producer resource format changed');
 const descriptor=validatePlanClusterSourceDescriptor({datasetId:d.id,resourceId:r.id,resourceName:r.name,resourceUrl:r.url,resourceBytes:r.size,
  resourceModified:r.last_modified,metadataModified:d.metadata_modified,publisherHashLiteral:r.hash,
  license:{id:d.license_id,title:d.license_title,url:d.license_url},attribution:D.rights.attribution});
 return {descriptor,index};
}
function exactDecimal(token) {
 const d=fundingDecimal(token);if(!d)fail('Missing CSV token cannot create an observation');
 const negative=d.coefficient<0n,digits=String(negative?-d.coefficient:d.coefficient).padStart(d.scale+1,'0');
 const value=(negative?'-':'')+(d.scale?digits.slice(0,-d.scale)+'.'+digits.slice(-d.scale):digits);
 return observationDecimalFromLexeme(value);
}
function metadataExcerpt(descriptor,index,rawSha256) {
 const resource=`/result/resources/${index}`;
 const fields=[['/result/id',descriptor.datasetId],['/result/license_id',descriptor.license.id],['/result/license_title',descriptor.license.title],
 ['/result/license_url',descriptor.license.url],['/result/metadata_modified',descriptor.metadataModified],
 [resource+'/id',descriptor.resourceId],[resource+'/name',descriptor.resourceName],[resource+'/url',descriptor.resourceUrl],
 [resource+'/size',descriptor.resourceBytes],[resource+'/last_modified',descriptor.resourceModified],[resource+'/hash',descriptor.publisherHashLiteral]];
 const text=['Selected exact HDX licensing/resource metadata',`Source URL: ${PLAN_CLUSTER_METADATA_URL}`,`Private complete JSON SHA256: ${rawSha256}`,
 ...fields.map(([path,value])=>path+': '+JSON.stringify(value)),PLAN_CLUSTER_EXCERPT_NOTICE].join('\n')+'\n';
 if(Buffer.byteLength(text)>4096)fail('Selected licensing excerpt exceeds bound');return text;
}
function csvLocator(parsed,column) {
 return {kind:'csv',...parsed.selected.locator,column,
 matches:PLAN_CLUSTER_IDENTITY_COLUMNS.map(name=>({column:name,expected:parsed.selected.raw[name]}))};
}

/** Caller later proves real acquisition receipts and actual prior registry. No edition/write here. */
export function preparePlanClusterObservationRecords(input,previousRecords=[]) {
 const v=object(input,['csv','metadataBefore','metadataAfter','entity']);
 const csv=receipt(v.csv,1048576),before=receipt(v.metadataBefore,524288),after=receipt(v.metadataAfter,524288);
 if(instant(before.completedAt)>instant(csv.startedAt)||instant(csv.completedAt)>instant(after.startedAt))fail('Metadata-before/CSV/metadata-after clocks must be ordered');
 const a=metadata(before),b=metadata(after);
 if(!same(a.descriptor,b.descriptor))fail('Selected resource/license changed between metadata receipts');
 const parsed=parsePlanClusterCsv(csv.bytes);if(parsed.sourceBytes!==b.descriptor.resourceBytes)fail('Actual complete CSV size differs from metadata');
 const entity=observationClone(v.entity);
 if(entity.kind!=='entity'||entity.entityKind!=='country-economy'||entity.id!=='country-afg'||
 !Array.isArray(entity.identifiers)||!entity.identifiers.some(i=>i.kind==='iso3'&&i.value==='AFG')||observationObjectHash(entity)!==entity.hash)fail('Actual pinned Afghanistan country entity required');
 // Same unchanged record-version/blob builder as existing adapters; no callback authority.
 const previous=[];
 if(!Array.isArray(previousRecords)||native.isProxy(previousRecords)||Object.getPrototypeOf(previousRecords)!==Array.prototype)fail('Owned prior-record inventory required');
 const ds=Object.getOwnPropertyDescriptors(previousRecords),length=ds.length?.value;
 if(!Number.isSafeInteger(length)||length<0||length>14000||Reflect.ownKeys(ds).length!==length+1)fail('Dense bounded prior-record inventory required');
 let priorBytes=0;
 for(let i=0;i<length;i++) {
  if(!ds[i]?.enumerable||!Object.hasOwn(ds[i],'value'))fail('Sparse/accessor prior-record inventory refused');
  const row=observationClone(ds[i].value);priorBytes+=Buffer.byteLength(canonicalObservationJson(row));
  if(priorBytes>20*1024*1024)fail('Prior record inventory exceeds whole-history bound');previous.push(row);
 }
 const context=createObservationSourceContext(D,null,previous),notes=[...D.limitations],tail={limitations:notes,review:'draft'};
 const rawHash=observationRawHash(after.bytes),excerpt=metadataExcerpt(b.descriptor,b.index,rawHash),evidenceBlob=context.blob(excerpt,'evidence','text/plain');
 const evidence=context.add({format:'charitology-observation-record',schemaVersion:1,kind:'source',id:'hdx-afg-education-2024-license',
 url:PLAN_CLUSTER_METADATA_URL,publisher:'OCHA via HDX',title:'Selected HDX licensing and resource metadata',retrievedAt:after.completedAt,
 sourceUpdatedDay:null,reportDay:null,publishedAt:null,rawSha256:rawHash,rawBytes:after.bytes.length,
 payload:{kind:'external-document',mediaType:'application/json',publicExcerpt:evidenceBlob},
 producerMetadata:[{field:'completePrivateJsonSha256',literal:rawHash},{field:'resourceJsonPointer',literal:`/result/resources/${b.index}`},
 {field:'clientRequestStartedAt',literal:after.startedAt},...(after.httpDate===null?[]:[{field:'responseHttpDate',literal:after.httpDate}])],
 rights:{returnedLicense:null,publicReuse:{kind:'linked-document-only',note:'The complete HDX JSON wrapper is private. Only the exact bounded selected licensing/resource excerpt is retained; this does not relicense the wrapper.'},
 attribution:'HDX/OCHA licensing metadata; exact selected fields quoted with JSON paths.',originalProducerCredit:'OCHA Financial Tracking Service (FTS), via HDX',limitations:[PLAN_CLUSTER_EXCERPT_NOTICE]},...tail});
 const rightsRef={source:observationPin(evidence),role:'rights',locator:{kind:'text',section:['Selected HDX licensing metadata',D.source.resourceId],excerpt:excerpt.trimEnd()}};
 const csvBlob=context.blob(csv.bytes,'raw','text/plain');
 const source=context.add({format:'charitology-observation-record',schemaVersion:1,kind:'source',id:'fts-afg-education-2024-cluster',url:D.source.resourceUrl,
 publisher:'OCHA Financial Tracking Service (FTS), via HDX',title:'Afghanistan HNRP2024 Education requirements and reported funding',retrievedAt:csv.completedAt,
 sourceUpdatedDay:null,reportDay:null,publishedAt:null,rawSha256:parsed.sourceSha256,rawBytes:parsed.sourceBytes,
 payload:{kind:'public-csv',raw:csvBlob,adapter:D.method},producerMetadata:[{field:'datasetId',literal:D.source.datasetId},{field:'resourceId',literal:D.source.resourceId},
 {field:'resourceModifiedLiteral',literal:b.descriptor.resourceModified},{field:'metadataModifiedLiteral',literal:b.descriptor.metadataModified},
 {field:'publisherHashLiteral',literal:b.descriptor.publisherHashLiteral},{field:'clientRequestStartedAt',literal:csv.startedAt},
 ...(csv.httpDate===null?[]:[{field:'responseHttpDate',literal:csv.httpDate}]),{field:'selectedSourcePercentFunded',literal:parsed.selected.raw.percentFunded}],
 rights:{returnedLicense:null,publicReuse:{kind:'explicit-license',label:D.rights.title,termsUrl:D.rights.termsUrl,evidence:[rightsRef]},
 attribution:D.rights.attribution,originalProducerCredit:'OCHA Financial Tracking Service (FTS)',limitations:['Charitology selected one row and added typed locators/definitions and exact-decimal interpretation; no OCHA endorsement is implied.']},...tail});
 const sourcePin=observationPin(source),entityPin=observationPin(entity),scope=context.add({format:'charitology-observation-record',schemaVersion:1,kind:'scope',id:'afg-education-hnrp-2024',
 entity:entityPin,scopeKind:'humanitarian-plan-cluster',label:'Afghanistan HNRP2024 — Education plan cluster',includedEntities:[entityPin],consolidation:'not-applicable',
 geography:{kind:'country-economy',entity:entityPin},planCluster:{source:sourcePin,...Object.fromEntries(['countryCode','planId','planCode','planName','clusterCode','clusterName','referenceYear'].map(k=>[k,D.selection[k]])),
 period:{start:D.selection.start,end:D.selection.end},causeBinding:D.causeBinding},exclusions:[PLAN_CLUSTER_UNKNOWN_REMAINDER],sourceRefs:[{source:sourcePin,role:'scope',locator:csvLocator(parsed,'cluster')}],...tail});
 const measures=[],cells=[];
 for(const column of ['requirements','funding']) {
  const def=PLAN_CLUSTER_MEASURES[column],measure=context.add({format:'charitology-observation-record',schemaVersion:1,kind:'measure',id:'afg-education-2024-'+column,
  label:def.label,measureKind:column==='requirements'?'planning-budget':'reported-funding',family:'humanitarian-plan-'+column,producerCode:column,
  definition:def.definition,unit:{kind:'currency',label:'USD',currency:'USD',denominator:null},method:def.method,legacyCountry:null,
  sourceRefs:[{source:sourcePin,role:'definition',locator:csvLocator(parsed,column)}],...tail});
  const measurePin=observationPin(measure),ref={source:sourcePin,role:'value',locator:csvLocator(parsed,column)},token=parsed.selected.raw[column];measures.push(measurePin);
  if(token==='')cells.push({state:'missing',entity:entityPin,scope:observationPin(scope),measure:measurePin,reason:'producer-empty-source-field',sourceRefs:[ref]});
  else {
   const observation=context.add({format:'charitology-observation-record',schemaVersion:1,kind:'observation',id:'afg-education-2024-'+column,
   entity:entityPin,scope:observationPin(scope),measure:measurePin,period:{kind:'closed-interval',start:D.selection.start,end:D.selection.end,sourceLabel:PLAN_CLUSTER_PERIOD_LABEL},
   reported:{token,parser:'csv-decimal-v1',scale:{coefficient:'1',exponent:0},valueRef:ref},value:exactDecimal(token),precision:{kind:'unknown'},uncertainty:null,
   producerStatus:null,producerUnit:null,producerDecimal:null,annotations:[],priceBasis:{kind:'unknown'},sourceRefs:[ref],...tail});
   cells.push({state:'present',observation:observationPin(observation)});
  }
 }
 context.add({format:'charitology-observation-record',schemaVersion:1,kind:'coverage',id:'afg-education-hnrp-2024',selection:{kind:'explicit-plan-cluster',rule:'one-selected-source-plan-cluster',
 source:sourcePin,scope:observationPin(scope),measures,tuple:{countryCode:'AFG',planId:'1185',clusterCode:'7415',year:2024},unknownRemainder:PLAN_CLUSTER_UNKNOWN_REMAINDER},
 cells,sourceRefs:[{source:sourcePin,role:'scope',locator:csvLocator(parsed,'cluster')}],exclusions:[PLAN_CLUSTER_UNKNOWN_REMAINDER],...tail});
 return observationFreeze({format:'charitology-plan-cluster-record-preparation',version:1,
 records:[...context.selected.values()].sort((a,b)=>a.kind<b.kind?-1:a.kind>b.kind?1:a.id<b.id?-1:a.id>b.id?1:0),files:context.files,
 report:{newCaptureProved:false,declaredClocksOnly:true,selectedTuple:parsed.selected.key,csvSha256:parsed.sourceSha256,csvBytes:parsed.sourceBytes,
 records:parsed.totalRecords,metadataBefore:{sha256:observationRawHash(before.bytes),bytes:before.bytes.length,startedAt:before.startedAt,completedAt:before.completedAt},
 metadataAfter:{sha256:rawHash,bytes:after.bytes.length,startedAt:after.startedAt,completedAt:after.completedAt},fullMetadataPublic:false,publicEvidenceBytes:evidenceBlob.bytes}});
}
