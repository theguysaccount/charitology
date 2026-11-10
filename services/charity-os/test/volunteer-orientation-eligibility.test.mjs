import assert from "node:assert/strict";
import test from "node:test";
import { hash } from "../lib/security.mjs";
import { decideVolunteerOrientation as decide, VOLUNTEER_ORIENTATION_PROOF as F } from "../lib/volunteer-orientation-eligibility.mjs";

const scope = {orgId:"fictional-org",programId:"fictional-program",shiftId:"fictional-shift"};
const DEFAULT_SHIFT = {
  ...scope, sourceRevision:3,termsSha256:"a".repeat(64),startAt:"2026-11-09T23:30:00-05:00",
  endAt:"2026-11-10T00:30:00-05:00",timeZone:"America/New_York",
};
const NOW = "2026-11-09T15:00:00.000001Z";
const CHECKED = "2026-11-09T14:30:00.000001Z";
const REVIEWED = "2026-11-08T12:00:00.000001Z";
const APPROVER = "fictional-policy-reviewer";
const shape = (state,reason,order="retained",basis=null) => ({state,reason,order,basis});

function facts({ shift={}, nowExact=NOW, reviewedAtExact=REVIEWED, equivalentCourseId=F.equivalentCourseId }={}) {
  const targetPins = {...DEFAULT_SHIFT,...shift};
  return {
    nowExact,
    target:{...targetPins,moduleId:"volunteers",kind:"shift",status:"open",mode:"managed",capacity:1,coverage:"full",approvedRevision:targetPins.sourceRevision},
    subject:{...scope,participationId:"fictional-participation",contactId:"fictional-contact",revision:7,state:"waitlisted",coverage:"full",origin:"live"},
    policy:{version:1,state:"active",requirementId:"fictional-orientation-policy",revision:2,target:{...targetPins},
      source:{registerId:F.registerId,sourceEdition:F.sourceEdition,primaryCourseId:F.primaryCourseId,equivalentCourseId},
      authoredBy:"fictional-policy-author",reviewedBy:APPROVER,reviewedAtExact},
    retainedObservation:null,incomingObservation:null,
  };
}
function observation(input, updates={}) {
  return {
    ...scope, requirementId:input.policy.requirementId,policyRevision:input.policy.revision,
    participationId:input.subject.participationId,contactId:input.subject.contactId,
    registerId:F.registerId,sourceEdition:F.sourceEdition,sourceRevision:8,status:"complete",courseId:F.primaryCourseId,
    checkedAtExact:CHECKED,completedOn:"2026-11-08",validThrough:"2026-11-10",recordedBy:"fictional-register-verifier",
    equivalentReview:null,...updates,
  };
}
const withdrawn = (input,updates={}) => observation(input,{
  status:"withdrawn",courseId:null,completedOn:null,validThrough:null,...updates,
});
function withReview(input, row, reviewUpdates={}) {
  const {equivalentReview:_unused,...core}=row;
  return {
    ...row,
    equivalentReview:{
      reason:F.equivalentReason,participationRevision:input.subject.revision,reviewedBy:APPROVER,
      reviewedAtExact:"2026-11-09T14:45:00.000001Z",
      observationSha256:hash(["charitology-volunteer-orientation-observation-v1",input.subject.revision,core]),
      ...reviewUpdates,
    },
  };
}

test("the exact current fictional completion covers one full shift and returns only a safe decision",()=>{
  const input=facts();
  input.retainedObservation=observation(input);
  const before=structuredClone(input);
  const result=decide(input);
  assert.deepEqual(result,shape("verified","full-shift-covered","retained","primary"));
  assert.deepEqual(input,before);
  assert(Object.isFrozen(result));
  assert(!JSON.stringify(result).includes(input.subject.contactId));
});

test("missing, explicit unknown, malformed and unrelated observations all refuse",()=>{
  const input=facts();
  assert.deepEqual(decide(input),shape("unknown","evidence-missing","none"));
  const unavailable=observation(input,{status:"unknown",courseId:null,completedOn:null,validThrough:null});
  assert.deepEqual(decide({...input,retainedObservation:unavailable}),shape("unknown","source-unknown"));
  for(const altered of [
    {orgId:"other-fictional-org"},{programId:"other-fictional-program"},{shiftId:"other-fictional-shift"},
    {contactId:"other-fictional-contact"},{participationId:"other-fictional-participation"},{policyRevision:1},
    {sourceEdition:"other-fictional-edition"},{registerId:"unapproved-register"},{sourceRevision:0},
    {completedOn:"2026-02-30"},{completedOn:"2026-11-11"},{status:"not-required"},
    {courseId:"fictional-unapproved-course"},{screeningReport:"should not be accepted"},
  ]) {
    assert.deepEqual(decide({...input,retainedObservation:observation(input,altered)}),
      shape("unknown","evidence-invalid","none"));
  }
  const future=observation(input,{checkedAtExact:"2026-11-09T15:00:00.000002Z"});
  assert.deepEqual(decide({...input,retainedObservation:future}),shape("unknown","evidence-invalid","none"));
});

test("live policy and subject pins cannot be replaced with stale, inactive or unreviewed claims",()=>{
  const input=facts(), retainedObservation=observation(input);
  const base={...input,retainedObservation};
  for(const policy of [null,{...input.policy,state:"inactive"},{...input.policy,reviewedBy:input.policy.authoredBy},
    {...input.policy,reviewedAtExact:"2026-11-09T15:00:00.000002Z"},
    {...input.policy,source:{...input.policy.source,registerId:"different-register"}}]){
    assert.deepEqual(decide({...base,policy}),shape("policy-review-needed","policy-unavailable","none"));
  }
  assert.deepEqual(decide({...base,target:{...input.target,termsSha256:"b".repeat(64)}}),
    shape("policy-review-needed","policy-unavailable","none"));
  for(const target of [{mode:"paused"},{capacity:2},{coverage:"partial"},{approvedRevision:2}]){
    assert.deepEqual(decide({...base,target:{...input.target,...target}}),
      shape("policy-review-needed","target-unavailable","none"));
  }
  for(const subject of [{origin:"recovered"},{state:"confirmed"},{programId:"another-program"}]){
    assert.deepEqual(decide({...base,subject:{...input.subject,...subject}}),shape("unknown","subject-unavailable","none"));
  }
});

test("freshness uses a strict 24-hour SQL microsecond boundary and does not infer a future completion",()=>{
  const input=facts();
  const checked = at => ({...input,retainedObservation:observation(input,{checkedAtExact:at})});
  assert.deepEqual(decide(checked("2026-11-08T15:00:00.000002Z")),shape("verified","full-shift-covered","retained","primary"));
  assert.deepEqual(decide(checked("2026-11-08T15:00:00.000001Z")),shape("unknown","evidence-stale"));
  assert.deepEqual(decide(checked("2026-11-08T15:00:00.000000Z")),shape("unknown","evidence-stale"));
  assert.deepEqual(decide({...input,retainedObservation:observation(input,{completedOn:"2026-11-10"})}),
    shape("unknown","completion-date-invalid"));
});

test("the first occupied day, last occupied day and exclusive midnight boundary are local",()=>{
  const input=facts({shift:{endAt:"2026-11-10T00:00:00-05:00"}});
  const atMidnight={...input,retainedObservation:observation(input,{validThrough:"2026-11-09"})};
  assert.deepEqual(decide(atMidnight),shape("verified","full-shift-covered","retained","primary"));
  const afterMidnight=facts({shift:{endAt:"2026-11-10T00:00:00.001-05:00"}});
  assert.deepEqual(decide({...afterMidnight,retainedObservation:observation(afterMidnight,{validThrough:"2026-11-09"})}),
    shape("expired","coverage-ended"));
  assert.deepEqual(decide({...input,retainedObservation:observation(input,{validThrough:"2026-11-08"})}),
    shape("expired","coverage-ended"));
  assert.deepEqual(decide({...input,nowExact:"2026-11-10T04:30:00.000000Z",retainedObservation:atMidnight.retainedObservation}),
    shape("policy-review-needed","target-unavailable","none"));
  assert.deepEqual(decide({...input,nowExact:"2026-11-10T04:29:59.999999Z",retainedObservation:atMidnight.retainedObservation}),
    shape("verified","full-shift-covered","retained","primary"));
});

test("valid offset-qualified repeated and skipped-hour shifts use real instants",()=>{
  const fold=facts({
    shift:{startAt:"2026-11-01T01:15:00-04:00",endAt:"2026-11-01T01:15:00-05:00"},
    nowExact:"2026-11-01T04:50:00.000001Z",reviewedAtExact:"2026-10-31T20:00:00.000000Z",
  });
  const foldRow=observation(fold,{checkedAtExact:"2026-11-01T04:49:00.000000Z",completedOn:"2026-10-31",validThrough:"2026-11-01"});
  assert.deepEqual(decide({...fold,retainedObservation:foldRow}),shape("verified","full-shift-covered","retained","primary"));
  const spring=facts({
    shift:{startAt:"2026-03-08T01:30:00-05:00",endAt:"2026-03-08T03:30:00-04:00"},
    nowExact:"2026-03-08T06:00:00.000000Z",reviewedAtExact:"2026-03-07T20:00:00.000000Z",
  });
  const springRow=observation(spring,{checkedAtExact:"2026-03-08T05:00:00.000000Z",completedOn:"2026-03-07",validThrough:"2026-03-08"});
  assert.deepEqual(decide({...spring,retainedObservation:springRow}),shape("verified","full-shift-covered","retained","primary"));
  const invalidSpring=facts({
    shift:{startAt:"2026-03-08T02:00:00-05:00",endAt:"2026-03-08T03:30:00-04:00"},
    nowExact:spring.nowExact,reviewedAtExact:spring.policy.reviewedAtExact,
  });
  assert.deepEqual(decide({...invalidSpring,retainedObservation:springRow}),shape("policy-review-needed","target-unavailable","none"));
});

test("withdrawal survives older or equal revisions and only a newer verified correction can restore the criterion",()=>{
  const input=facts(), gone=withdrawn(input);
  const check=(retainedObservation,incomingObservation=null)=>decide({...input,retainedObservation,incomingObservation});
  assert.deepEqual(check(gone),shape("withdrawn","source-withdrawn"));
  assert.deepEqual(check(gone,observation(input,{sourceRevision:7,checkedAtExact:"2026-11-09T14:59:00.000000Z"})),
    shape("withdrawn","source-withdrawn","older"));
  assert.deepEqual(check(gone,structuredClone(gone)),shape("withdrawn","source-withdrawn","same"));
  assert.deepEqual(check(gone,observation(input,{checkedAtExact:"2026-11-09T14:59:00.000000Z"})),
    shape("unknown","source-order-conflict","conflict"));
  assert.deepEqual(check(gone,observation(input,{sourceRevision:9,checkedAtExact:"2026-11-09T14:59:00.000000Z"})),
    shape("verified","full-shift-covered","newer","primary"));
  assert.deepEqual(check(gone,observation(input,{sourceRevision:9,checkedAtExact:"2026-11-09T14:00:00.000000Z"})),
    shape("unknown","source-order-conflict","conflict"));
  assert.deepEqual(check(observation(input),withdrawn(input,{sourceRevision:9,checkedAtExact:"2026-11-09T14:59:00.000000Z"})),
    shape("withdrawn","source-withdrawn","newer"));
  const uncertain = observation(input,{status:"unknown",courseId:null,completedOn:null,validThrough:null,
    sourceRevision:9,checkedAtExact:"2026-11-09T14:59:00.000000Z"});
  assert.deepEqual(check(observation(input),uncertain),shape("unknown","source-unknown","newer"));
  const priorWithdrawal=withdrawn(input,{checkedAtExact:"2026-11-08T14:00:00.000000Z"});
  assert.deepEqual(check(priorWithdrawal),shape("withdrawn","source-withdrawn"));
});

test("an exact newer check can refresh unchanged external facts without changing the source revision",()=>{
  const input=facts(), prior=observation(input,{checkedAtExact:"2026-11-08T14:00:00.000000Z"});
  const check=(retainedObservation,incomingObservation=null)=>decide({...input,retainedObservation,incomingObservation});
  assert.deepEqual(check(prior),shape("unknown","evidence-stale"));
  assert.deepEqual(check(prior,observation(input)),shape("verified","full-shift-covered","rechecked","primary"));
  assert.deepEqual(check(observation(input),prior),shape("verified","full-shift-covered","older-check","primary"));
  assert.deepEqual(check(prior,observation(input,{validThrough:"2026-11-11"})),
    shape("unknown","source-order-conflict","conflict"));
  assert.deepEqual(check(observation(input),observation(input,{recordedBy:"fictional-other-verifier"})),
    shape("unknown","source-order-conflict","conflict"));
});

test("the equivalent requires a separate exact current review for this policy, observation and participation revision",()=>{
  const input=facts(), row=observation(input,{courseId:F.equivalentCourseId});
  assert.deepEqual(decide({...input,retainedObservation:row}),shape("unknown","equivalent-review-needed"));
  const approved=withReview(input,row);
  assert.deepEqual(decide({...input,retainedObservation:approved}),shape("verified","full-shift-covered","retained","equivalent"));
  const short=withReview(input,{...row,validThrough:"2026-11-09"});
  assert.deepEqual(decide({...input,retainedObservation:short}),shape("expired","coverage-ended"));
  const afterWithdrawal=withdrawn(input,{sourceRevision:9,checkedAtExact:"2026-11-09T14:50:00.000001Z"});
  assert.deepEqual(decide({...input,retainedObservation:afterWithdrawal,incomingObservation:approved}),
    shape("withdrawn","source-withdrawn","older"));
  for(const invalid of [
    {...approved,validThrough:"2026-11-11"},
    withReview(input,row,{reviewedBy:"fictional-other-reviewer"}),
    withReview(input,row,{reviewedAtExact:"2026-11-09T14:00:00.000001Z"}),
    withReview(input,row,{reviewedAtExact:"2026-11-09T15:00:00.000002Z"}),
    withReview(input,{...row,recordedBy:APPROVER}),
  ]) assert.deepEqual(decide({...input,retainedObservation:invalid}),shape("unknown","equivalent-review-needed"));
  assert.deepEqual(decide({...input,subject:{...input.subject,revision:8},retainedObservation:approved}),
    shape("unknown","equivalent-review-needed"));
  const unlisted=facts({equivalentCourseId:null});
  assert.deepEqual(decide({...unlisted,retainedObservation:approved}),shape("unknown","evidence-invalid","none"));
  const badReason=withReview(input,row,{reason:"urgent-staffing"});
  assert.deepEqual(decide({...input,retainedObservation:badReason}),shape("unknown","evidence-invalid","none"));
});

test("open shapes, getters and proxies cannot supply an override or evidence",()=>{
  const input=facts(), retainedObservation=observation(input);
  assert.deepEqual(decide({...input,retainedObservation,overrideReason:"urgent-staffing"}),
    shape("policy-review-needed","context-invalid","none"));
  const trapped={...retainedObservation};
  Object.defineProperty(trapped,"courseId",{enumerable:true,get(){throw Error("must not read");}});
  assert.deepEqual(decide({...input,retainedObservation:trapped}),shape("unknown","evidence-invalid","none"));
  const proxy=new Proxy(input,{ownKeys(){throw Error("must not traverse");}});
  assert.deepEqual(decide(proxy),shape("policy-review-needed","context-invalid","none"));
});
