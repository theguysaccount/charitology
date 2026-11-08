// Fictional pure data/fake SELECT fixtures only. No PostgreSQL/auth/rollback proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FieldResponseError, FIELD_FORMAT, FIELD_METHOD, inspectFieldAggregateFile, makeFieldMapping, compileFieldObservationDrafts } from '../lib/field-response-model.mjs';
import { validateRecord } from '../lib/modules.mjs';
import { HttpError } from '../lib/security.mjs';
import { isFieldResponseReportFamily, fieldResponseReportTitle, validateFieldResponseReportRow, makeFieldResponseReportRow, planRestoredFieldResponseReportRow,
  requireFieldResponseReportIdAvailable, appendFieldResponseReport, listFieldResponseReports, readFieldResponseReport, FIELD_REPORT_READ_LIMIT, FIELD_REPORT_ROW_JSON_LIMIT } from '../lib/field-response-store.mjs';

const ORG='fictional_org',ACTOR='fictional_staff',STAMP='2026-11-08T12:34:56.123456Z';
const clone=v=>structuredClone(v);
function manifest(org=ORG,programId='fictional_program') {
  const program={id:programId,orgId:org,moduleId:'programs',revision:1,data:validateRecord('programs',{title:'Fictional program',kind:'program'}),deletedAt:null};
  const indicator={id:'fictional_indicator',orgId:org,moduleId:'outcomes',revision:1,data:validateRecord('outcomes',{title:'Fictional indicator',kind:'indicator',programId,unit:'visits'},{orgId:org,recordId:'fictional_indicator',records:[program]}),deletedAt:null};
  const row={responseId:'aggregate_1',startDate:'2026-01-01',endDate:'2026-01-31',geography:null,visitCount:0,denominator:null,excluded:false,exclusionReason:null};
  const inspection=inspectFieldAggregateFile(Buffer.from(JSON.stringify({format:FIELD_FORMAT,version:1,formId:FIELD_METHOD,schemaVersion:1,responses:[row]})));
  const mapping=makeFieldMapping({orgId:org,program,indicator});
  return compileFieldObservationDrafts({inspection,mapping,orgId:org,actorId:ACTOR,integrationId:'fictional_integration',program,indicator,selection:{responseIds:['aggregate_1']},candidateIds:[{responseId:'aggregate_1',recordId:'fictional_observation'}]}).manifest;
}
const PAYLOAD=manifest();
const row=(id='report_1')=>makeFieldResponseReportRow({orgId:ORG,id,actorId:ACTOR,createdAtExact:STAMP,payload:PAYLOAD});
const member=(role='contributor',programIds=[])=>({userId:ACTOR,role,programIds,revision:3});
const current=(extra={})=>({org_id:ORG,id:'fictional_program',module_id:'programs',kind:'program',undeleted:true,...extra});
const joined=(value=row(),program=current())=>({...clone(value),current_program:program});
const rejected=(fn,code,status)=>assert.throws(fn,e=>(e instanceof FieldResponseError||e instanceof HttpError)&&(!code||e.code===code)&&(!status||e.status===status));
const refused=(promise,code,status)=>assert.rejects(promise,e=>(e instanceof FieldResponseError||e instanceof HttpError)&&(!code||e.code===code)&&(!status||e.status===status));
function reads(rows,{honorWhere=true}={}) {
  const calls=[];
  return {calls,client:{query:async(sql,args)=>{
    calls.push({sql,args:clone(args)});
    assert.match(sql,/^SELECT r\.org_id,r\.id,r\.created_by/);
    assert.match(sql,/LEFT JOIN os_records p ON p\.org_id=r\.org_id AND p\.id=r\.payload#>>/);
    assert.match(sql,/r\.payload->'version'='1'::jsonb/);
    assert.match(sql,/p\.module_id='programs'/);assert.match(sql,/p\.data->>'kind'='program'/);assert.match(sql,/p\.deleted_at IS NULL/);
    assert(!/\b(?:INSERT|UPDATE|DELETE|COUNT|FOR SHARE|FOR UPDATE)\b/.test(sql));
    let found=rows.filter(r=>!honorWhere||(r.org_id===args[0]&&isFieldResponseReportFamily(r.payload)&&(()=>{
      const p=r.current_program,typed=p&&p.org_id===args[0]&&p.module_id==='programs'&&p.kind==='program'&&p.undeleted;
      return typed?args[1].length===0||args[1].includes(p.id):args[2];
    })()));
    if(sql.includes('AND r.id=$4'))found=found.filter(r=>!honorWhere||r.id===args[3]);
    else {found=found.filter(r=>args[3]===null||r.id>args[3]).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).slice(0,args[4]);}
    return {rows:clone(found)};
  }}};
}

test('family dispatch is exact format/version/method, without inventing kind',()=>{
  assert(isFieldResponseReportFamily(PAYLOAD));assert(!Object.hasOwn(PAYLOAD,'kind'));
  for(const patch of [{format:'other'},{version:2},{version:'1'},{method:'aggregate-service-visits-v2'},{format:null}])assert(!isFieldResponseReportFamily({...PAYLOAD,...patch}));
  assert(!isFieldResponseReportFamily(null));assert(!isFieldResponseReportFamily([]));
  let calls=0;const getter={version:1,method:FIELD_METHOD,get format(){calls++;return PAYLOAD.format;}};
  assert(!isFieldResponseReportFamily(getter));const p=new Proxy({}, {getPrototypeOf(){calls++;return null;},get(){calls++;return null;},getOwnPropertyDescriptor(){calls++;return null;}});
  assert(!isFieldResponseReportFamily(p));assert(!isFieldResponseReportFamily(Object.create(p)));assert.equal(calls,0);
});
test('immutable row binds deterministic title, manifest checksum and closed metadata',()=>{
  const r=row(),before=JSON.stringify(PAYLOAD);assert.equal(r.title,'Aggregate visits import: '+PAYLOAD.file.sha256.slice(0,12));assert.equal(r.title,fieldResponseReportTitle(PAYLOAD));assert.equal(r.checksum,PAYLOAD.sha256);
  assert.equal(r.created_at,STAMP);assert.equal(r.org_id,ORG);assert.equal(r.created_by,ACTOR);assert.deepEqual(validateFieldResponseReportRow(clone(r)),r);assert.equal(JSON.stringify(PAYLOAD),before);assert(Object.isFrozen(r)&&Object.isFrozen(r.payload.rows[0]));
  for(const change of [r=>r.checksum='f'.repeat(64),r=>r.title+=' altered',r=>r.id='bad:id',r=>r.created_by=null,r=>r.extra=true,r=>r.payload.kind='field-response-import-v1']){const r=clone(row());change(r);rejected(()=>validateFieldResponseReportRow(r));}
  assert(Buffer.byteLength(JSON.stringify(r))<FIELD_REPORT_ROW_JSON_LIMIT);
});
test('new live rows require exact current origin, caller IDs and SQL timestamp; no mint/clock',()=>{
  const input={orgId:ORG,id:'supplied_report',actorId:ACTOR,createdAtExact:STAMP,payload:PAYLOAD};
  const original=Date.now;Date.now=()=>{throw Error('No host clock authority');};try{assert.equal(makeFieldResponseReportRow(input).id,'supplied_report');}finally{Date.now=original;}
  for(const alter of [x=>x.orgId='different_org',x=>delete x.id,x=>delete x.actorId,x=>delete x.createdAtExact,x=>x.sessionSha256='f'.repeat(64)]){const x=clone(input);alter(x);rejected(()=>makeFieldResponseReportRow(x));}
});
test('exact SQL micros use existing validator; native millisecond metadata is historical transport only',()=>{
  for(const time of ['0001-01-01T00:00:00.000001Z','9999-12-31T23:59:59.999999Z'])assert.equal(makeFieldResponseReportRow({orgId:ORG,id:'time',actorId:ACTOR,createdAtExact:time,payload:PAYLOAD}).created_at,time);
  for(const time of ['2026-11-08T12:34:56.123Z','2026-02-30T00:00:00.000000Z','0000-01-01T00:00:00.000000Z','2026-11-08T12:34:56.123456+00:00',new Date(STAMP)])rejected(()=>makeFieldResponseReportRow({orgId:ORG,id:'time',actorId:ACTOR,createdAtExact:time,payload:PAYLOAD}));
  const native={...clone(row()),created_at:'2026-11-08T12:34:56.123Z'};assert.equal(validateFieldResponseReportRow(native).created_at,native.created_at);
});
test('row/context descriptors reject getters, proxies, hidden fields and source mutation without hooks',()=>{
  let calls=0;const r=clone(row());Object.defineProperty(r,'payload',{enumerable:true,get(){calls++;return PAYLOAD;}});rejected(()=>validateFieldResponseReportRow(r));
  const p=new Proxy({}, {getPrototypeOf(){calls++;return null;},ownKeys(){calls++;return[];}});rejected(()=>validateFieldResponseReportRow(p));rejected(()=>validateFieldResponseReportRow(Object.create(p)));
  const options={get orgId(){calls++;return ORG;}};rejected(()=>validateFieldResponseReportRow(row(),options));
  const hidden=clone(row());Object.defineProperty(hidden,'ignored',{value:1});rejected(()=>validateFieldResponseReportRow(hidden));assert.equal(calls,0);
});
test('per-row inactive plan preserves historical payload/id/title/checksum across repeat destinations',()=>{
  let old={...clone(row()),created_at:'2026-11-08T12:34:56.123Z'};const original=clone(old);
  for(let n=0;n<3;n++){old=planRestoredFieldResponseReportRow(JSON.parse(JSON.stringify(old)),{orgId:'destination_'+n,actorId:'restoring_actor_'+n,createdAtExact:STAMP});assert.equal(old.id,original.id);assert.equal(old.title,original.title);assert.equal(old.checksum,original.checksum);assert.deepEqual(old.payload,original.payload);assert.equal(old.payload.originOrgId,ORG);assert.equal(old.org_id,'destination_'+n);assert.equal(old.created_by,'restoring_actor_'+n);}
  assert(!Object.hasOwn(old,'receipt'));assert(!Object.hasOwn(old.payload,'sessionSha256'));assert.equal(original.org_id,ORG);
});
test('restore planner does not substitute current program data or grant destination authority',()=>{
  const r=planRestoredFieldResponseReportRow(row(),{orgId:'restored_org',actorId:'restorer',createdAtExact:STAMP});
  assert.equal(r.payload.mapping.program.revision,1);assert.equal(r.payload.mapping.orgId,ORG);assert.equal(r.payload.originOrgId,ORG);assert.equal(r.org_id,'restored_org');
  for(const patch of [{currentProgram:{id:'invented'}},{approval:{status:'approved'}},{live:true}])rejected(()=>planRestoredFieldResponseReportRow(row(),{orgId:'restored_org',actorId:'restorer',createdAtExact:STAMP,...patch}));
});
test('any retained same-org report identity collides, including unrelated report families',async()=>{
  const calls=[];const c={query:async(sql,args)=>{calls.push({sql,args});assert.equal(sql,'SELECT org_id,id FROM os_reports WHERE org_id=$1 AND id=$2 LIMIT 2');return{rows:[{org_id:ORG,id:'report_1'}]};}};
  await refused(appendFieldResponseReport(c,row()),'field_report_collision',409);assert.equal(calls.length,1);
  for(const rows of [[{org_id:'foreign',id:'report_1'}],[{org_id:ORG,id:'wrong'}],[{org_id:ORG,id:'report_1'},{org_id:ORG,id:'report_1'}]])await refused(requireFieldResponseReportIdAvailable({query:async()=>({rows})},ORG,'report_1'));
});
test('append issues one collision SELECT then exact INSERT, preserving supplied payload/time',async()=>{
  const calls=[],c={query:async(sql,args)=>{calls.push({sql,args});if(sql.startsWith('SELECT'))return{rows:[]};assert.equal(sql,'INSERT INTO os_reports(org_id,id,created_by,title,checksum,payload,created_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::timestamptz)');return{rowCount:1};}};
  const r=row(),saved=await appendFieldResponseReport(c,r);assert.deepEqual(saved,r);assert.equal(calls.length,2);assert.deepEqual(calls[1].args,[r.org_id,r.id,r.created_by,r.title,r.checksum,JSON.stringify(r.payload),STAMP]);assert(!calls.some(x=>/\b(?:UPDATE|DELETE|now\(|clock_timestamp|os_events)\b/.test(x.sql)));
});
test('invalid append is refused before lookup; failed INSERT is not announced saved',async()=>{
  let calls=0;const c={query:async()=>{calls++;return{rows:[]};}};await refused(appendFieldResponseReport(c,{...row(),checksum:'bad'}));assert.equal(calls,0);
  const failInsert={query:async sql=>sql.startsWith('SELECT')?{rows:[]}:(()=>{throw Error('fictional driver failure');})()};await assert.rejects(appendFieldResponseReport(failInsert,row()),/fictional driver failure/);
  const native={...row(),created_at:'2026-11-08T12:34:56.123Z'};await refused(appendFieldResponseReport(c,native));assert.equal(calls,0);
});
test('scoped read uses fresh actual typed program; historical origin/pin mismatch is not current authority',async()=>{
  const source=planRestoredFieldResponseReportRow(row(),{orgId:'restored_org',actorId:'restorer',createdAtExact:STAMP});
  const f=reads([{...clone(source),current_program:current({org_id:'restored_org'})}]);
  const result=await readFieldResponseReport(f.client,{org:'restored_org',id:source.id,member:member('contributor',['fictional_program'])});
  assert.deepEqual(result.payload,PAYLOAD);assert.equal(result.disposition,'current-program');assert.equal(f.calls.length,1);assert(!Object.hasOwn(result,'createdBy'));assert(!Object.hasOwn(result,'currentProgram'));
});
test('hidden current program refuses same generic404 and exposes no payload',async()=>{
  for(const role of ['contributor','admin']){const f=reads([joined()],{honorWhere:false});await refused(readFieldResponseReport(f.client,{org:ORG,id:'report_1',member:member(role,['another_program'])}),'field_report_unavailable',404);}
});
test('orphan history is available only to unscoped existing owner/admin roles',async()=>{
  for(const role of ['owner','admin']){const f=reads([joined(row(),null)]);const found=await readFieldResponseReport(f.client,{org:ORG,id:'report_1',member:member(role)});assert.equal(found.disposition,'orphaned');assert.deepEqual(found.payload,PAYLOAD);}
  for(const m of [member('contributor'),member('board_reader'),member('owner',['fictional_program']),member('admin',['fictional_program'])]){const f=reads([joined(row(),null)],{honorWhere:false});const snapshotOnly=m.role==='board_reader';await refused(readFieldResponseReport(f.client,{org:ORG,id:'report_1',member:m}),snapshotOnly?'field_report_role':'field_report_unavailable',snapshotOnly?403:404);if(snapshotOnly)assert.equal(f.calls.length,0);}
});
test('changed program kind/module/deletion is orphaned; historical matching scope is insufficient',async()=>{
  for(const patch of [{kind:'system-map'},{module_id:'outcomes'},{undeleted:false},{kind:null}]){const data=joined(row(),current(patch));const staff=reads([data],{honorWhere:false});await refused(readFieldResponseReport(staff.client,{org:ORG,id:'report_1',member:member('contributor',['fictional_program'])}),'field_report_unavailable',404);const admin=reads([data]);assert.equal((await readFieldResponseReport(admin.client,{org:ORG,id:'report_1',member:member('admin')})).disposition,'orphaned');}
});
test('foreign/wrong current program metadata and tenant row failclosed even for admin',async()=>{
  for(const data of [joined(row(),current({org_id:'foreign'})),joined(row(),current({id:'another'})),joined({...clone(row()),org_id:'foreign'})]){const f=reads([data],{honorWhere:false});await refused(readFieldResponseReport(f.client,{org:ORG,id:'report_1',member:member('admin')}),'field_report_unavailable',404);}
});
test('ordinary current definition edits do not reinterpret historical pins or demand approvals',async()=>{
  const f=reads([joined()]);const a=await readFieldResponseReport(f.client,{org:ORG,id:'report_1',member:member('contributor',['fictional_program'])});assert.equal(a.payload.mapping.program.revision,1);assert.equal(a.disposition,'current-program');assert.equal(f.calls.length,1);assert(!f.calls[0].sql.includes('approval'));assert(!f.calls[0].sql.includes('indicator'));
});
test('list pagination contains only authorized rows/cursor and never hidden/global counts',async()=>{
  const hiddenProgram=manifest(ORG,'hidden_program');const hidden=makeFieldResponseReportRow({orgId:ORG,id:'private_report',actorId:ACTOR,createdAtExact:STAMP,payload:hiddenProgram});
  const all=[joined(row('visible_a')),joined(row('visible_b')),joined(row('visible_c')),joined(hidden,current({id:'hidden_program'})),joined(row('orphan'),null)];const f=reads(all);
  const first=await listFieldResponseReports(f.client,{org:ORG,member:member('contributor',['fictional_program']),after:null,limit:2});assert.deepEqual(first.reports.map(r=>r.id),['visible_a','visible_b']);assert.equal(first.nextAfter,'visible_b');assert(!JSON.stringify(first).includes('private_report'));assert(!Object.hasOwn(first,'total'));assert(!Object.hasOwn(first,'hiddenCount'));assert(!Object.hasOwn(first.reports[0],'payload'));
  const next=await listFieldResponseReports(f.client,{org:ORG,member:member('contributor',['fictional_program']),after:first.nextAfter,limit:2});assert.deepEqual(next.reports.map(r=>r.id),['visible_c']);assert.equal(next.nextAfter,null);
});
test('defensive list scope check omits unavailable rows without returning their IDs/counts',async()=>{
  const f=reads([joined(row('a'),null),joined(row('b'))],{honorWhere:false});const value=await listFieldResponseReports(f.client,{org:ORG,member:member('contributor',['fictional_program']),after:null,limit:2});assert.deepEqual(value.reports.map(r=>r.id),['b']);assert.equal(value.nextAfter,null);
});
test('list/detail reject malformed known-family payloads and checksum/title drift, no partial detail',async()=>{
  for(const mutate of [r=>r.payload.rows[0].row.visitCount=1,r=>r.checksum='a'.repeat(64),r=>r.title='invented report',r=>r.payload.actorId='not-admitted']){const r=joined();mutate(r);const f=reads([r],{honorWhere:false});await refused(readFieldResponseReport(f.client,{org:ORG,id:r.id,member:member('admin')}),'field_report_unavailable',404);await refused(listFieldResponseReports(f.client,{org:ORG,member:member('admin'),after:null,limit:1}));}
});
test('ordinary outcomes permission and closed bounded selectors refuse before SQL',async()=>{
  const f=reads([]);await refused(readFieldResponseReport(f.client,{org:ORG,id:'report_1',member:member('not_a_role')}),'role',403);assert.equal(f.calls.length,0);
  for(const patch of [{org:'bad:org'},{id:'bad:id'},{token:'not-admitted'}])await refused(readFieldResponseReport(f.client,{org:ORG,id:'report_1',member:member(),...patch}));
  for(const patch of [{limit:0},{limit:FIELD_REPORT_READ_LIMIT+1},{limit:'1'},{after:'bad:cursor'},{includeHidden:true}])await refused(listFieldResponseReports(f.client,{org:ORG,member:member(),after:null,limit:2,...patch}));assert.equal(f.calls.length,0);
});
test('member program scopes preserve valid duplicate/order semantics and reject hostile arrays',async()=>{
  const f=reads([joined()]),m=member('contributor',['fictional_program','other','fictional_program']),before=clone(m);await readFieldResponseReport(f.client,{org:ORG,id:'report_1',member:m});assert.deepEqual(m,before);assert.deepEqual(f.calls[0].args[1],m.programIds);
  let calls=0;const getter={...member()};Object.defineProperty(getter,'role',{enumerable:true,get(){calls++;return'admin';}});await refused(readFieldResponseReport(f.client,{org:ORG,id:'report_1',member:getter}));
  const sparse=Array(1);sparse['4294967295']='fictional_program';await refused(readFieldResponseReport(f.client,{org:ORG,id:'report_1',member:member('admin',sparse)}));assert.equal(calls,0);assert.equal(f.calls.length,1);
});
test('empty reads have no hidden count; purported unsupported family cannot become a row',async()=>{
  const f=reads([]);assert.deepEqual(await listFieldResponseReports(f.client,{org:ORG,member:member(),after:null,limit:2}),{reports:[],nextAfter:null});await refused(readFieldResponseReport(f.client,{org:ORG,id:'missing',member:member()}),'field_report_unavailable',404);
  const unsupported=clone(row());unsupported.payload.version=2;rejected(()=>validateFieldResponseReportRow(unsupported));
});
