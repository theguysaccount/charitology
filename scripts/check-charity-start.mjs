import test from 'node:test';
import assert from 'node:assert/strict';
import {charityStartJobs, prepareCharityStartPlan, CharityStartError} from '../src/data/charity-start.mjs';
const input=(extra={})=>({jobId:'donor-follow-up',ownerRole:'',reviewDate:'',completed:[false,false,false,false],...extra});
const rejected=(raw,field)=>assert.throws(()=>prepareCharityStartPlan(raw),error=>error instanceof CharityStartError&&error.field===field);

test('a plan requires an actual selected job and refuses unsupported or stale field shapes',()=>{
  rejected(input({jobId:''}),'jobId');rejected(input({jobId:'made-up'}),'jobId');
  rejected({...input(),email:'person@example.invalid'},'jobId');
  rejected(input({completed:[true]}),'completed');rejected(input({completed:[false,0,false,false]}),'completed');
});
test('blank optional values stay unknown and unchecked steps are not reported complete',()=>{
  const plan=prepareCharityStartPlan(input());assert.equal(plan.ownerRole,null);assert.equal(plan.reviewDate,null);
  assert.match(plan.markdown,/Unknown — not assigned/);assert.match(plan.markdown,/Unknown — no date supplied/);
  assert.equal((plan.markdown.match(/^- \[ \] Not marked complete:/gm)||[]).length,4);assert.doesNotMatch(plan.markdown,/^- \[x\]/m);
  assert.match(plan.markdown,/not evidence of failure/);assert.match(plan.markdown,/Completion has not been independently verified/);
});
test('calendar admission distinguishes real leap days and never chooses a date',()=>{
  assert.equal(prepareCharityStartPlan(input({reviewDate:'2000-02-29'})).reviewDate,'2000-02-29');
  assert.equal(prepareCharityStartPlan(input({reviewDate:'2024-02-29'})).reviewDate,'2024-02-29');
  for(const reviewDate of ['1900-02-29','2026-02-29','2026-04-31','0000-01-01','2026-13-01','2026-00-01','2026-01-00','2026-1-01','tomorrow'])rejected(input({reviewDate}),'reviewDate');
  assert.equal(prepareCharityStartPlan(input({reviewDate:'0001-01-01'})).reviewDate,'0001-01-01');
});
test('role markup and control characters cannot become new plan sections or executable HTML',()=>{
  const role='Coordinación <script>alert(1)</script> [link](https://example.invalid)';
  const plan=prepareCharityStartPlan(input({ownerRole:role}));assert.equal(plan.ownerRole,role);assert.doesNotMatch(plan.markdown,/<script>|\[link\]\(https:/);assert.match(plan.markdown,/&lt;script&gt;/);
  rejected(input({ownerRole:'lead\n# Forged approval'}),'ownerRole');rejected(input({ownerRole:'lead\u0000'}),'ownerRole');rejected(input({ownerRole:'x'.repeat(121)}),'ownerRole');
});
test('exports preserve the exact selected job and explicit self-reported step marks',()=>{
  for(const job of charityStartJobs){const raw=input({jobId:job.id,ownerRole:'Grants lead',reviewDate:'2026-11-09',completed:[true,false,true,false]});const plan=prepareCharityStartPlan(raw);assert.equal(plan.jobId,job.id);assert.equal(plan.filename,'charitology-start-'+job.id+'.md');assert.deepEqual(plan.completed,[true,false,true,false]);assert.equal((plan.markdown.match(/^- \[x\] Marked complete:/gm)||[]).length,2);for(const link of job.links)assert.ok(plan.markdown.includes('https://charitology.org'+link.path));for(const module of job.os)assert.ok(plan.markdown.includes('https://os.charitology.org/#module/'+module.id));assert.match(plan.markdown,/No charity is rated or ranked/);assert.match(plan.markdown,/no field, task, message or record is transferred/);assert.match(plan.markdown,/Hypothesis/);}
});
test('a review signature changes with literal fields, selected job and marks without mutating inputs',()=>{
  const raw=input({ownerRole:'Lead',completed:[true,false,false,false]});const before=JSON.stringify(raw);const plan=prepareCharityStartPlan(raw);assert.equal(JSON.stringify(raw),before);assert.ok(Object.isFrozen(plan)&&Object.isFrozen(plan.completed));
  for(const change of [{ownerRole:' Lead '},{reviewDate:'2026-11-09'},{jobId:'grant-deadlines'},{completed:[false,false,false,false]}])assert.notEqual(prepareCharityStartPlan({...raw,...change}).signature,plan.signature);
  rejected({...raw,ownerRole:'lead\n'},'ownerRole');assert.equal(JSON.stringify(raw),before);
});
