import assert from "node:assert/strict";
import test from "node:test";
import {
  reviewOwnRenewal, planOwnRenewalRequest, reviewStaffRenewal, planStaffRenewalDecision,
  reviewOwnDirectory, planOwnDirectoryChoice,
} from "../lib/membership-renewal-model.mjs";

const stamp = day => day + "T15:00:00.000007Z";
const codes = {
  unavailable:{status:404,code:"membership_renewal_unavailable"},
  staff:{status:403,code:"membership_renewal_staff"},
  changed:{status:409,code:"membership_renewal_changed"},
  duplicate:{status:409,code:"membership_renewal_duplicate"},
  fields:{status:422,code:"membership_renewal_fields"},
};
function fixture() {
  const member = {
    orgId:"fictional-garden",id:"fictional-member",kind:"member",status:"renewal-due",revision:7,
    createdAtExact:stamp("2025-12-01"),lastEditedBy:"fictional-member-editor",startDate:"2026-01-01",
    endDate:"2026-12-31",renewalDate:"2026-11-01",duesReferencePresent:true,
  };
  const link = {
    orgId:member.orgId,memberId:member.id,ownerUserId:"fictional-account",id:"a".repeat(32),revision:2,
    createdAtExact:stamp("2026-01-02"),intakeId:"fictional-intake",intakeRevision:4,
    intakeCreatedAtExact:stamp("2026-01-02"),publicationId:"fictional-form",publicationCreatedAtExact:stamp("2026-01-01"),
    bindingRevision:1,bindingCreatedAtExact:stamp("2026-01-02"),active:true,verifiedEmailMatches:true,
  };
  const subject = {member,link,workspaceTimeZone:"America/New_York",restoreEpochSha256:"1".repeat(64)};
  const term = {
    orgId:member.orgId,id:"fictional-next-term",kind:"renewal",memberId:member.id,revision:3,
    createdAtExact:stamp("2026-10-25"),status:"approved",lastEditedBy:"fictional-term-editor",
    approval:{status:"approved",revision:3,actorId:"fictional-independent-reviewer",atExact:stamp("2026-10-31")},
    previousEndDate:"2026-12-31",startDate:"2027-01-01",endDate:"2027-12-31",renewalDate:"2027-11-01",
    opensOn:"2026-11-01",closesOn:"2026-12-15",duesPolicy:"no-payment-required",
  };
  const actor = {userId:link.ownerUserId,verified:true,sessionSha256:"2".repeat(64)};
  const staff = {
    orgId:member.orgId,userId:"fictional-staff",role:"program_lead",wholeWorkspace:true,verified:true,
    sessionSha256:"3".repeat(64),membershipRevision:2,membershipCreatedAtExact:stamp("2026-01-01"),
  };
  const nowExact = stamp("2026-11-09"), notice = {revision:1,available:true};
  return {subject,term,actor,staff,nowExact,notice};
}
const command = (reviewSha256,idempotencyKey = "fictional-request-key") =>
  ({version:1,reviewSha256,idempotencyKey,acknowledge:true});
const choiceCommand = (operation, view) => ({version:1,operation,acknowledge:true,expectedRevision:view.revision,
  reviewSha256:operation === "opt-in" ? view.optInReviewSha256 : view.withdrawReviewSha256});
const submit = context => {
  const body = command(reviewOwnRenewal(context).reviewSha256);
  const first = planOwnRenewalRequest(context,body);
  return {body,first,context:{...context,request:JSON.parse(JSON.stringify(first.requestWrite))}};
};
const withMember = (context, patch) => ({...context,subject:{...context.subject,member:{...context.subject.member,...patch}}});
const withLink = (context, patch) => ({...context,subject:{...context.subject,link:{...context.subject.link,...patch}}});
const admit = (context, effect) => {
  const {status,revision,startDate,endDate,renewalDate} = effect.memberWrite;
  return {...withMember(context,{status,revision,startDate,endDate,renewalDate,lastEditedBy:context.staff.userId}),
    decision:JSON.parse(JSON.stringify(effect.decisionWrite))};
};

test("own request leaves the period intact until one exact independent staff decision", () => {
  const f = fixture(), ownView = reviewOwnRenewal(f);
  assert.equal(ownView.state,"open");
  assert.equal(ownView.dues,"reference-recorded-unverified");
  assert.equal(ownView.current.endDate,"2026-12-31");
  assert.equal(ownView.proposed.startDate,"2027-01-01");
  assert.doesNotMatch(JSON.stringify(ownView),/fictional-|external.*verified|directory|payment/);
  assert.equal(reviewStaffRenewal(f).ready,false);
  const {body,first,context} = submit(f);
  assert.deepEqual(Object.keys(first),["replayed","requestWrite","requestedAtExact"]);
  assert.equal(first.replayed,false);
  assert.equal(reviewOwnRenewal(context).state,"request-recorded");
  assert.equal(reviewOwnRenewal(context).current.endDate,"2026-12-31");
  assert.deepEqual(planOwnRenewalRequest(context,body),{replayed:true,requestWrite:null,requestedAtExact:f.nowExact});
  const staffView = reviewStaffRenewal(context);
  assert.equal(staffView.ready,true);
  assert.equal(staffView.dues,"reference-recorded-unverified");
  assert.doesNotMatch(JSON.stringify(staffView),/fictional-|actor|session|link/);
  assert.throws(() => planStaffRenewalDecision(context,body),codes.changed);
  const staffBody = command(staffView.reviewSha256,"fictional-decision-key");
  const result = planStaffRenewalDecision(context,staffBody);
  assert.deepEqual(result.memberWrite,{orgId:f.subject.member.orgId,id:f.subject.member.id,expectedRevision:7,revision:8,
    status:"active",startDate:"2026-01-01",endDate:"2027-12-31",renewalDate:"2027-11-01"});
  assert.deepEqual(result.decision.period,{startDate:"2027-01-01",endDate:"2027-12-31",renewalDate:"2027-11-01"});
  assert.throws(() => reviewOwnRenewal({...context,decision:result.decisionWrite}),codes.unavailable);
  const next = admit(context,result);
  const recorded = reviewOwnRenewal(next), decisionDay = f.nowExact.slice(0,10);
  assert.equal(recorded.state,"renewal-recorded");
  assert.equal(recorded.current.endDate,"2027-12-31");
  assert.equal(recorded.current.startDate,f.subject.member.startDate);
  assert.ok(recorded.current.startDate <= decisionDay && decisionDay <= recorded.current.endDate);
  assert.ok(decisionDay < recorded.decision.period.startDate);
  assert.deepEqual(recorded.decision,result.decision);
  assert.ok(reviewOwnDirectory(next).optInReviewSha256);
  assert.deepEqual(planStaffRenewalDecision(next,staffBody),
    {replayed:true,memberWrite:null,decisionWrite:null,decision:result.decision});
  assert.deepEqual(planOwnRenewalRequest(next,body),{replayed:true,requestWrite:null,requestedAtExact:f.nowExact});
  assert.equal(reviewOwnDirectory(next).state,"withheld");
  assert.equal(f.subject.member.revision,7);
});

test("missing, revoked, erased or unrelated link exposes no member data or receipts", () => {
  const {context,body} = submit(fixture());
  const scopes = [
    {...context,actor:null}, {...context,actor:{...context.actor,verified:false}},
    {...context,actor:{...context.actor,userId:"different-account"}},
    {...context,subject:{...context.subject,link:null}},
    withLink(context,{active:false}), withLink(context,{verifiedEmailMatches:false}),
    withLink(context,{memberId:"different-member"}), withLink(context,{orgId:"different-org"}),
    withLink(context,{id:"b".repeat(32)}), withLink(context,{bindingRevision:2}),
    withLink(context,{createdAtExact:stamp("2026-01-03"),bindingCreatedAtExact:stamp("2026-01-03")}),
    withLink(context,{intakeCreatedAtExact:"2026-01-02T14:00:00.000008Z"}),
    withLink(context,{publicationCreatedAtExact:stamp("2025-12-31")}),
    {...context,subject:{...context.subject,restoreEpochSha256:"4".repeat(64)}},
  ];
  for (const wrong of scopes) {
    assert.throws(() => reviewOwnRenewal(wrong),codes.unavailable);
    assert.throws(() => planOwnRenewalRequest(wrong,body),codes.unavailable);
  }
  for (const wrong of [withLink(context,{active:false}),withLink(context,{bindingRevision:2})])
    assert.throws(() => reviewStaffRenewal(wrong),codes.unavailable);
  assert.throws(() => planOwnRenewalRequest(context,{...body,memberId:"different-member"}),codes.fields);
  assert.throws(() => planOwnRenewalRequest(context,{...body,duesReference:"fictional-private-reference"}),codes.fields);
});

test("fresh term version, independent approval, current membership period and eligibility are required", () => {
  const f = fixture();
  const {body,context} = submit(f);
  const staffBody = command(reviewStaffRenewal(context).reviewSha256,"fictional-decision-key");
  const invalidTerms = [
    null, {...f.term,status:"draft"}, {...f.term,status:"cancelled"}, {...f.term,approval:null},
    {...f.term,revision:4}, {...f.term,approval:{...f.term.approval,actorId:f.term.lastEditedBy}},
    {...f.term,approval:{...f.term.approval,atExact:stamp("2026-11-10")}},
    {...f.term,memberId:"different-member"}, {...f.term,orgId:"different-org"},
    {...f.term,previousEndDate:"2026-12-30"}, {...f.term,startDate:"2027-01-02"},
    {...f.term,duesPolicy:"external-settlement-required"},
  ];
  for (const term of invalidTerms) {
    assert.equal(reviewOwnRenewal({...f,term}).reviewSha256,null);
    assert.throws(() => planOwnRenewalRequest({...f,term},body),codes.changed);
    assert.equal(reviewStaffRenewal({...context,term}).ready,false);
    assert.throws(() => planStaffRenewalDecision({...context,term},staffBody),codes.changed);
  }
  const sameDatesNewApproval = {...f.term,revision:4,approval:{...f.term.approval,revision:4}};
  assert.notEqual(reviewOwnRenewal({...f,term:sameDatesNewApproval}).reviewSha256,body.reviewSha256);
  assert.equal(reviewOwnRenewal({...context,term:sameDatesNewApproval}).state,"review-again");
  assert.equal(reviewStaffRenewal({...context,term:sameDatesNewApproval}).ready,false);
  assert.equal(reviewStaffRenewal(withMember(context,{revision:8})).ready,false);
  assert.equal(reviewStaffRenewal(withMember(context,{lastEditedBy:f.staff.userId})).ready,false);
  assert.equal(reviewOwnRenewal(withMember(f,{duesReferencePresent:false})).dues,"unknown");
});

test("review window closes at the workspace's civil-day boundary", () => {
  const f = fixture();
  const before = {...f,nowExact:"2026-12-16T04:59:59.999999Z"};
  assert.equal(reviewOwnRenewal(before).state,"open");
  const {context} = submit(before);
  const after = {...context,nowExact:"2026-12-16T05:00:00.000000Z"};
  assert.equal(reviewOwnRenewal(after).state,"review-again");
  assert.equal(reviewStaffRenewal(after).ready,false);
});

test("duplicate requests and confirmations bind the original command, session and reviewed scope", () => {
  const {body,context} = submit(fixture());
  assert.throws(() => planOwnRenewalRequest(context,{...body,reviewSha256:"9".repeat(64)}),codes.duplicate);
  assert.throws(() => planOwnRenewalRequest(context,{...body,idempotencyKey:"fictional-other-key"}),codes.duplicate);
  assert.throws(() => planOwnRenewalRequest(withLink(context,{intakeRevision:5}),body),codes.changed);
  assert.throws(() => planOwnRenewalRequest({...context,actor:{...context.actor,sessionSha256:"4".repeat(64)}},body),codes.changed);
  const staffBody = command(reviewStaffRenewal(context).reviewSha256,"fictional-decision-key");
  const result = planStaffRenewalDecision(context,staffBody), next = admit(context,result);
  assert.throws(() => planStaffRenewalDecision(next,{...staffBody,reviewSha256:"9".repeat(64)}),codes.duplicate);
  assert.throws(() => planStaffRenewalDecision({...next,staff:{...next.staff,membershipRevision:3}},staffBody),codes.changed);
  assert.throws(() => planStaffRenewalDecision(withLink(next,{intakeRevision:5}),staffBody),codes.changed);
});

test("current separate whole-workspace staff permission and approval independence govern the decision", () => {
  const {context} = submit(fixture());
  const body = command(reviewStaffRenewal(context).reviewSha256,"fictional-decision-key");
  for (const staff of [null,{...context.staff,role:"contributor"},{...context.staff,role:"board_reader"},
    {...context.staff,wholeWorkspace:false},{...context.staff,verified:false},{...context.staff,orgId:"different-org"},
    {...context.staff,userId:context.actor.userId}]) {
    assert.throws(() => reviewStaffRenewal({...context,staff}),codes.staff);
    assert.throws(() => planStaffRenewalDecision({...context,staff},body),codes.staff);
  }
  const replaced = {...context,staff:{...context.staff,membershipCreatedAtExact:stamp("2026-01-02")}};
  assert.notEqual(reviewStaffRenewal(replaced).reviewSha256,body.reviewSha256);
  assert.throws(() => planStaffRenewalDecision(replaced,body),codes.changed);
});

test("directory choice is independent, explicit and withdrawable after term or notice expiry", () => {
  const f = fixture(), view = reviewOwnDirectory(f);
  assert.equal(view.state,"withheld");
  assert.deepEqual(view.notice,{revision:1,audience:"members-of-this-organization",field:"display-name"});
  assert.doesNotMatch(JSON.stringify(view),/fictional-|contact|email/);
  assert.throws(() => reviewOwnDirectory(withMember(f,{directoryConsent:true})),codes.fields);
  assert.throws(() => planOwnDirectoryChoice(f,{...choiceCommand("opt-in",view),
    reviewSha256:reviewOwnRenewal(f).reviewSha256}),codes.changed);
  const allow = choiceCommand("opt-in",view);
  assert.throws(() => planOwnDirectoryChoice(f,{...allow,acknowledge:false}),codes.fields);
  const opted = planOwnDirectoryChoice(f,allow);
  const context = {...f,choice:JSON.parse(JSON.stringify(opted.choiceWrite))};
  assert.equal(reviewOwnDirectory(context).state,"opt-in-recorded");
  assert.deepEqual(planOwnDirectoryChoice(context,allow),
    {replayed:true,choiceWrite:null,state:"opt-in-recorded",revision:1});
  assert.equal(reviewOwnRenewal(context).reviewSha256,reviewOwnRenewal(f).reviewSha256);
  assert.equal(reviewOwnDirectory(withLink(context,{intakeRevision:5})).state,"review-again");
  assert.equal(reviewOwnDirectory({...context,notice:{revision:2,available:true}}).state,"review-again");
  const retired = {...withMember(context,{status:"expired"}),term:null,notice:null};
  assert.equal(reviewOwnDirectory(retired).state,"review-again");
  assert.equal(reviewOwnDirectory(retired).optInReviewSha256,null);
  assert.throws(() => planOwnDirectoryChoice(retired,allow),codes.changed);
  const withdraw = choiceCommand("withdraw",reviewOwnDirectory(retired));
  const withdrawn = planOwnDirectoryChoice(retired,withdraw);
  assert.equal(withdrawn.choiceWrite.notice,null);
  assert.equal(withdrawn.state,"withdrawn");
  const next = {...retired,choice:withdrawn.choiceWrite};
  assert.deepEqual(planOwnDirectoryChoice(next,withdraw),
    {replayed:true,choiceWrite:null,state:"withdrawn",revision:2});
  assert.throws(() => planOwnDirectoryChoice(next,allow),codes.changed);
  assert.throws(() => reviewOwnDirectory(withLink(next,{active:false})),codes.unavailable);
  assert.throws(() => reviewOwnDirectory(withLink(next,{bindingRevision:2})),codes.unavailable);
});

test("directory opt-in needs civil-date coverage even when the stored status still says active", () => {
  const f = withMember(fixture(),{status:"active"});
  const early = withMember(f,{startDate:"2026-11-10",renewalDate:"2026-12-01"});
  assert.equal(reviewOwnDirectory(early).optInReviewSha256,null);
  const view = reviewOwnDirectory(f), optIn = choiceCommand("opt-in",view);
  const choice = planOwnDirectoryChoice(f,optIn).choiceWrite;
  const expired = {...f,choice,nowExact:"2027-01-01T05:00:00.000000Z"};
  assert.equal(expired.subject.member.status,"active");
  const after = reviewOwnDirectory(expired);
  assert.equal(after.state,"review-again");
  assert.equal(after.optInReviewSha256,null);
  assert.throws(() => planOwnDirectoryChoice(expired,optIn),codes.changed);
  assert.equal(planOwnDirectoryChoice(expired,choiceCommand("withdraw",after)).state,"withdrawn");
});

test("command shapes reject getters, extra fields and unacknowledged choices", () => {
  const f = fixture(), request = command(reviewOwnRenewal(f).reviewSha256);
  let touched = false;
  const accessor = {...request,get acknowledge() { touched = true; return true; }};
  assert.throws(() => planOwnRenewalRequest(f,accessor),codes.fields);
  assert.equal(touched,false);
  assert.throws(() => planOwnRenewalRequest(f,new Proxy(request,{})),codes.fields);
  assert.throws(() => planOwnRenewalRequest(f,{...request,acknowledge:false}),codes.fields);
  assert.throws(() => planOwnRenewalRequest(f,{...request,[Symbol("other")]:true}),codes.fields);
});
