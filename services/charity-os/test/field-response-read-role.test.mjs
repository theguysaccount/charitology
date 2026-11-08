// Genuine negative tests against the retained pre-fix runtime. No database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { listFieldResponseReports, readFieldResponseReport } from '../lib/field-response-store.mjs';
import { FIELD_FORMAT,FIELD_METHOD,inspectFieldAggregateFile,makeFieldMapping,compileFieldObservationDrafts } from '../lib/field-response-model.mjs';
import { validateRecord } from '../lib/modules.mjs';
import { makeFieldResponseReportRow } from '../lib/field-response-store.mjs';
const org='fictional_org',actor='fictional_staff';
const program={id:'fictional_program',orgId:org,moduleId:'programs',revision:1,data:validateRecord('programs',{title:'Fictional program',kind:'program'}),deletedAt:null};
const indicator={id:'fictional_indicator',orgId:org,moduleId:'outcomes',revision:1,data:validateRecord('outcomes',{title:'Fictional indicator',kind:'indicator',programId:program.id,unit:'visits'},{orgId:org,recordId:'fictional_indicator',records:[program]}),deletedAt:null};
const source={responseId:'aggregate_1',startDate:'2026-01-01',endDate:'2026-01-31',geography:null,visitCount:0,denominator:null,excluded:false,exclusionReason:null};
const inspection=inspectFieldAggregateFile(Buffer.from(JSON.stringify({format:FIELD_FORMAT,version:1,formId:FIELD_METHOD,schemaVersion:1,responses:[source]})));
const mapping=makeFieldMapping({orgId:org,program,indicator});
const payload=compileFieldObservationDrafts({inspection,mapping,orgId:org,actorId:actor,integrationId:'fictional_integration',program,indicator,selection:{responseIds:['aggregate_1']},candidateIds:[{responseId:'aggregate_1',recordId:'fictional_observation'}]}).manifest;
const row=makeFieldResponseReportRow({orgId:org,id:'report_1',actorId:actor,createdAtExact:'2026-11-08T12:34:56.123456Z',payload});
for(const role of ['board_reader','external_reviewer'])for(const state of ['current-program','orphaned'])for(const action of ['list','detail'])test(role+' '+state+' '+action+' refuses unapproved FIELD history before SQL',async()=>{
 let calls=0;const current_program=state==='orphaned'?null:{org_id:org,id:program.id,module_id:'programs',kind:'program',undeleted:true};
 const c={query:async()=>{calls++;return{rows:[{...structuredClone(row),current_program}]};}};
 const member={userId:actor,role,programIds:[],revision:1};let error;
 try{await(action==='list'?listFieldResponseReports(c,{org,member,after:null,limit:1}):readFieldResponseReport(c,{org,id:row.id,member}));}catch(e){error=e;}
 assert.equal(calls,0,'snapshot-only role must not query FIELD history');assert.equal(error?.status,403);assert.equal(error?.code,'field_report_role');
});
