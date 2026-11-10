/** IO-free prototype. Only a trusted gateway can supply current subject and staff facts. */
import { isProxy } from "node:util/types";
import { modulePermissions } from "./modules.mjs";
import { validateGroupExactStamp } from "./participation-group-model.mjs";
import { validDate, validZone } from "./schedule.mjs";
import { fail, hash } from "./security.mjs";

const ID = /^[A-Za-z0-9_-]{1,100}$/, LINK = /^[a-f0-9]{32}$/, SHA = /^[a-f0-9]{64}$/;
const KEY = /^[A-Za-z0-9_-]{16,100}$/, MAX_REVISION = 2147483647;
const memberStatuses = ["active","renewal-due","expired","cancelled"];
const liveStatus = status => status === "active" || status === "renewal-due";
const matches = (value,pattern) => typeof value === "string" && pattern.test(value);
const rev = value => Number.isSafeInteger(value) && value > 0 && value <= MAX_REVISION;
const H = (domain,value) => hash(["membership-renewal-v1",domain,value]);
const invalid = () => fail(422,"membership_renewal_fields","Use the exact review fields.");
const inaccessible = () => fail(404,"membership_renewal_unavailable","This member review is unavailable.");
const forbidden = () => fail(403,"membership_renewal_staff","This member review is unavailable to your current staff role.");
const changed = () => fail(409,"membership_renewal_changed","Read the current member review before saving again.");
const duplicate = () => fail(409,"membership_renewal_duplicate","This renewal review already has a recorded request or decision.");
function need(condition, refusal = invalid) { if (!condition) refusal(); }
function closed(value, keys) {
  need(value && typeof value === "object" && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype);
  const fields = Object.getOwnPropertyDescriptors(value);
  need(Reflect.ownKeys(fields).length === keys.length && keys.every(key =>
    fields[key]?.enumerable && Object.hasOwn(fields[key],"value")));
  return value;
}
function exactStamp(value) {
  try { return validateGroupExactStamp(value); }
  catch { invalid(); }
}
function dates(value) {
  need(validDate(value.startDate) && validDate(value.endDate) && value.startDate <= value.endDate &&
    (value.renewalDate === null || (validDate(value.renewalDate) &&
      value.startDate <= value.renewalDate && value.renewalDate <= value.endDate)));
  return {startDate:value.startDate,endDate:value.endDate,renewalDate:value.renewalDate};
}
function dayAfter(day) {
  return new Date(Date.parse(day + "T00:00:00.000Z") + 86400000).toISOString().slice(0,10);
}
function localDay(nowExact, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US",{
    timeZone,year:"numeric",month:"2-digit",day:"2-digit",
  }).formatToParts(new Date(nowExact));
  const values = Object.fromEntries(parts.map(part => [part.type,part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}
function subject(value, nowExact) {
  closed(value,["member","link","workspaceTimeZone","restoreEpochSha256"]);
  const {member,link,workspaceTimeZone,restoreEpochSha256} = value;
  if (member === null || link === null) inaccessible();
  closed(member,["orgId","id","kind","status","revision","createdAtExact","lastEditedBy",
    "startDate","endDate","renewalDate","duesReferencePresent"]);
  closed(link,["orgId","memberId","ownerUserId","id","revision","createdAtExact","intakeId","intakeRevision",
    "intakeCreatedAtExact","publicationId","publicationCreatedAtExact","bindingRevision","bindingCreatedAtExact",
    "active","verifiedEmailMatches"]);
  const ids = [member.orgId,member.id,member.lastEditedBy,link.orgId,link.memberId,link.ownerUserId,
    link.intakeId,link.publicationId];
  need(ids.every(value => matches(value,ID)) && matches(link.id,LINK) && matches(restoreEpochSha256,SHA) &&
    [member.revision,link.revision,link.intakeRevision,link.bindingRevision].every(rev) &&
    member.kind === "member" && memberStatuses.includes(member.status) &&
    typeof member.duesReferencePresent === "boolean" && typeof link.active === "boolean" &&
    typeof link.verifiedEmailMatches === "boolean" && typeof workspaceTimeZone === "string" &&
    validZone(workspaceTimeZone) && !/^[+-]/.test(workspaceTimeZone));
  const now = exactStamp(nowExact);
  const incarnations = [link.publicationCreatedAtExact,link.intakeCreatedAtExact,link.createdAtExact,link.bindingCreatedAtExact];
  need(exactStamp(member.createdAtExact) <= now && incarnations.every(stamp => exactStamp(stamp) <= now),inaccessible);
  need(incarnations.every((stamp,index) => index === 0 || stamp >= incarnations[index - 1]),inaccessible);
  need(link.active && link.verifiedEmailMatches && member.orgId === link.orgId && member.id === link.memberId,inaccessible);
  const current = dates(member);
  const memberIdentity = H("member-incarnation",[member.orgId,member.id,member.createdAtExact,restoreEpochSha256]);
  const binding = H("own-binding",[memberIdentity,link.ownerUserId,link.id,link.revision,link.createdAtExact,
    link.intakeId,link.intakeCreatedAtExact,link.publicationId,link.publicationCreatedAtExact,
    link.bindingRevision,link.bindingCreatedAtExact]);
  return {member,link,current,now,today:localDay(now,workspaceTimeZone),binding,memberIdentity,
    version:H("own-link-version",[binding,link.intakeRevision,workspaceTimeZone]),memberSha256:H("member",member)};
}
const hasCoverage = ({member,current,today}) => liveStatus(member.status) &&
  current.startDate <= today && today <= current.endDate;
function own(actor, facts) {
  if (actor === null) inaccessible();
  closed(actor,["userId","verified","sessionSha256"]);
  need(actor.verified === true && actor.userId === facts.link.ownerUserId && matches(actor.sessionSha256,SHA),inaccessible);
  return H("own-actor",[facts.binding,actor.sessionSha256]);
}
function staffAuthority(staff, facts) {
  if (staff === null) forbidden();
  closed(staff,["orgId","userId","role","wholeWorkspace","verified","sessionSha256","membershipRevision","membershipCreatedAtExact"]);
  const permission = modulePermissions("memberships",staff.role);
  need(staff.verified === true && staff.wholeWorkspace === true && staff.orgId === facts.member.orgId &&
    matches(staff.userId,ID) && staff.userId !== facts.link.ownerUserId && matches(staff.sessionSha256,SHA) &&
    rev(staff.membershipRevision) && permission.read && permission.write && permission.approve,forbidden);
  need(exactStamp(staff.membershipCreatedAtExact) <= facts.now,forbidden);
  return H("staff-authority",[facts.memberIdentity,staff]);
}
function checkedTerm(value, facts) {
  if (value === null) return null;
  closed(value,["orgId","id","kind","memberId","revision","createdAtExact","status","lastEditedBy","approval",
    "previousEndDate","startDate","endDate","renewalDate","opensOn","closesOn","duesPolicy"]);
  need([value.orgId,value.id,value.memberId,value.lastEditedBy].every(value => matches(value,ID)) &&
    value.kind === "renewal" && rev(value.revision) && exactStamp(value.createdAtExact) <= facts.now &&
    ["draft","review","approved","cancelled"].includes(value.status) &&
    [value.previousEndDate,value.opensOn,value.closesOn].every(validDate) && value.opensOn <= value.closesOn &&
    ["no-payment-required","external-settlement-required"].includes(value.duesPolicy));
  const period = dates(value);
  const a = value.approval;
  if (a !== null) {
    closed(a,["status","revision","actorId","atExact"]);
    need(a.status === "approved" && rev(a.revision) && matches(a.actorId,ID));
    exactStamp(a.atExact);
  }
  const ready = value.orgId === facts.member.orgId && value.memberId === facts.member.id &&
    value.status === "approved" && a?.revision === value.revision && a.actorId !== value.lastEditedBy &&
    value.createdAtExact <= a.atExact && a.atExact <= facts.now && value.duesPolicy === "no-payment-required" &&
    hasCoverage(facts) &&
    value.previousEndDate === facts.current.endDate && value.startDate === dayAfter(facts.current.endDate) &&
    value.closesOn <= facts.current.endDate && value.opensOn <= facts.today && facts.today <= value.closesOn &&
    facts.member.revision < MAX_REVISION;
  return {period,ready,sha256:H("term",value)};
}
function renewalRecords(request, decision, facts) {
  if (request === null) {
    need(decision === null,inaccessible);
    return;
  }
  closed(request,["binding","linkVersion","actor","sourceMember","term","key","command","requestedAtExact"]);
  need([request.binding,request.linkVersion,request.actor,request.sourceMember,request.term,request.key,request.command]
    .every(value => matches(value,SHA)) && exactStamp(request.requestedAtExact) <= facts.now);
  need(request.binding === facts.binding,inaccessible);
  if (decision === null) return;
  closed(decision,["request","authority","key","command","recordedAtExact","period","memberRevision"]);
  need([decision.request,decision.authority,decision.key,decision.command].every(value => matches(value,SHA)) &&
    rev(decision.memberRevision) && exactStamp(decision.recordedAtExact) <= facts.now);
  need(decision.request === H("saved-request",request) && decision.recordedAtExact >= request.requestedAtExact &&
    decision.memberRevision <= facts.member.revision,inaccessible);
  closed(decision.period,["startDate","endDate","renewalDate"]);
  dates(decision.period);
}
function ownRenewal(context) {
  const {subject:input, actor, term, request = null, decision = null, nowExact} = context;
  const facts = subject(input,nowExact);
  const authority = own(actor,facts);
  renewalRecords(request,decision,facts);
  const source = checkedTerm(term,facts);
  return {facts,authority,source,request,decision};
}
function staffRenewal(context) {
  const {subject:input, staff, term, request = null, decision = null, nowExact} = context;
  const facts = subject(input,nowExact);
  const authority = staffAuthority(staff,facts);
  renewalRecords(request,decision,facts);
  const source = checkedTerm(term,facts);
  return {facts,authority,source,request,decision};
}
const pendingCurrent = ({facts,source,request}) => source?.ready && request?.term === source.sha256 &&
  request.sourceMember === facts.memberSha256 && request.linkVersion === facts.version;
const ownDigest = ({facts,authority,source}) =>
  H("own-review",[facts.version,authority,facts.memberSha256,source.sha256]);
const staffDigest = ({facts,authority,request}) =>
  H("staff-review",[facts.version,authority,H("saved-request",request)]);
const currentView = facts => ({...facts.current,status:facts.member.status});
const duesView = facts => facts.member.duesReferencePresent ? "reference-recorded-unverified" : "unknown";
const decisionView = decision => decision ? {
  recordedAtExact:decision.recordedAtExact,period:{...decision.period},
} : null;
/** Used only after a caller has independently authorized staff binding review. */
export function reviewMembershipTermEligibility({subject:input,term,nowExact}) {
  const facts = subject(input,nowExact), source = checkedTerm(term,facts);
  return {ready:source?.ready === true,dues:duesView(facts)};
}
function command(value) {
  closed(value,["version","reviewSha256","idempotencyKey","acknowledge"]);
  need(value.version === 1 && matches(value.reviewSha256,SHA) && matches(value.idempotencyKey,KEY) && value.acknowledge === true);
  return value;
}

export function reviewOwnRenewal(context) {
  const current = ownRenewal(context);
  const {facts,source,request,decision} = current;
  const open = source?.ready && !request;
  const pending = !!request && pendingCurrent(current);
  return {
    version:1,state:decision ? "renewal-recorded" : request ? (pending ? "request-recorded" : "review-again")
      : open ? "open" : "unavailable",
    current:currentView(facts),proposed:open || pending ? source.period : null,dues:duesView(facts),
    requestedAtExact:request?.requestedAtExact ?? null,decision:decisionView(decision),
    reviewSha256:open ? ownDigest(current) : null,
  };
}
export function planOwnRenewalRequest(context, input) {
  const current = ownRenewal(context);
  const {facts,authority,source,request} = current;
  const body = command(input), key = H("own-key",body.idempotencyKey), fingerprint = H("own-command",body);
  if (request) {
    need(request.key === key && request.command === fingerprint,duplicate);
    need(request.actor === authority && request.linkVersion === facts.version,changed);
    return {replayed:true,requestWrite:null,requestedAtExact:request.requestedAtExact};
  }
  need(source?.ready && body.reviewSha256 === ownDigest(current),changed);
  const requestWrite = {binding:facts.binding,linkVersion:facts.version,actor:authority,sourceMember:facts.memberSha256,
    term:source.sha256,key,command:fingerprint,requestedAtExact:facts.now};
  return {replayed:false,requestWrite,requestedAtExact:facts.now};
}
export function reviewStaffRenewal(context) {
  const current = staffRenewal(context);
  const {facts,source,request,decision} = current;
  const ready = !decision && !!pendingCurrent(current) && context.staff.userId !== facts.member.lastEditedBy;
  return {
    version:1,ready,current:currentView(facts),proposed:ready ? source.period : null,dues:duesView(facts),
    requestedAtExact:request?.requestedAtExact ?? null,decision:decisionView(decision),
    reviewSha256:ready ? staffDigest(current) : null,
  };
}
export function planStaffRenewalDecision(context, input) {
  const current = staffRenewal(context);
  const {facts,authority,source,request,decision} = current;
  const body = command(input), key = H("staff-key",body.idempotencyKey), fingerprint = H("staff-command",body);
  if (decision) {
    need(decision.key === key && decision.command === fingerprint,duplicate);
    need(decision.authority === authority && request.linkVersion === facts.version,changed);
    return {replayed:true,memberWrite:null,decisionWrite:null,decision:decisionView(decision)};
  }
  need(pendingCurrent(current) && context.staff.userId !== facts.member.lastEditedBy &&
    body.reviewSha256 === staffDigest(current),changed);
  const memberRevision = facts.member.revision + 1;
  const decisionWrite = {request:H("saved-request",request),authority,key,command:fingerprint,
    recordedAtExact:facts.now,period:source.period,memberRevision};
  const memberWrite = {orgId:facts.member.orgId,id:facts.member.id,expectedRevision:facts.member.revision,
    revision:memberRevision,status:"active",startDate:facts.current.startDate,
    endDate:source.period.endDate,renewalDate:source.period.renewalDate};
  return {replayed:false,memberWrite,decisionWrite,decision:decisionView(decisionWrite)};
}

const noticeDetails = notice => ({
  revision:notice.revision,audience:"members-of-this-organization",field:"display-name",
});
function directory(context) {
  const {subject:input,actor,notice,choice = null,nowExact} = context;
  const facts = subject(input,nowExact);
  const authority = own(actor,facts);
  if (notice !== null) {
    closed(notice,["revision","available"]);
    need(rev(notice.revision) && typeof notice.available === "boolean");
  }
  if (choice !== null) {
    closed(choice,["binding","linkVersion","authority","revision","state","notice","command","changedAtExact"]);
    need([choice.binding,choice.linkVersion,choice.authority,choice.command].every(value => matches(value,SHA)) &&
      rev(choice.revision) && exactStamp(choice.changedAtExact) <= facts.now &&
      ((choice.state === "opt-in-recorded" && matches(choice.notice,SHA)) ||
        (choice.state === "withdrawn" && choice.notice === null)));
    need(choice.binding === facts.binding,inaccessible);
  }
  const audience = notice?.available ? noticeDetails(notice) : null;
  const noticeSha256 = audience ? H("directory-notice",audience) : null;
  const opted = choice?.state === "opt-in-recorded";
  const covered = hasCoverage(facts);
  const current = opted && choice.notice === noticeSha256 && choice.linkVersion === facts.version && covered;
  const revision = choice?.revision ?? 0;
  const review = {
    version:1,revision,notice:audience,state:opted ? (current ? "opt-in-recorded" : "review-again") : choice?.state ?? "withheld",
    optInReviewSha256:noticeSha256 && !current && covered && revision < MAX_REVISION - 1
      ? H("directory-opt-in",[facts.version,authority,revision,noticeSha256]) : null,
    withdrawReviewSha256:opted && revision < MAX_REVISION
      ? H("directory-withdraw",[facts.version,authority,revision,choice.notice]) : null,
  };
  return {facts,authority,choice,noticeSha256,review};
}
export function reviewOwnDirectory(context) {
  return directory(context).review;
}
export function planOwnDirectoryChoice(context, input) {
  const {facts,authority,choice,noticeSha256,review} = directory(context);
  const body = closed(input,["version","operation","reviewSha256","expectedRevision","acknowledge"]);
  need(body.version === 1 && ["opt-in","withdraw"].includes(body.operation) && matches(body.reviewSha256,SHA) &&
    (body.expectedRevision === 0 || rev(body.expectedRevision)) && body.acknowledge === true);
  const fingerprint = H("directory-command",body);
  if (choice?.command === fingerprint) {
    need(choice.authority === authority && choice.linkVersion === facts.version && review.state === choice.state,changed);
    return {replayed:true,choiceWrite:null,state:review.state,revision:review.revision};
  }
  const withdrawal = body.operation === "withdraw";
  need(body.expectedRevision === review.revision && body.reviewSha256 ===
    (withdrawal ? review.withdrawReviewSha256 : review.optInReviewSha256),changed);
  const revision = review.revision + 1, state = withdrawal ? "withdrawn" : "opt-in-recorded";
  const choiceWrite = {binding:facts.binding,linkVersion:facts.version,authority,revision,state,
    notice:withdrawal ? null : noticeSha256,command:fingerprint,changedAtExact:facts.now};
  return {replayed:false,choiceWrite,state,revision};
}
