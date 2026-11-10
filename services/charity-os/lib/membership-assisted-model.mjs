import { isProxy } from "node:util/types";
import { reviewAssistedMembershipTermEligibility } from "./membership-renewal-model.mjs";
import { fail, hash } from "./security.mjs";

export const MEMBERSHIP_ASSISTANCE_NOTICE = Object.freeze({revision: 1, text:
  "Renew my membership for the dates shown. This term is free to renew. I can ask staff in person to withdraw my choice until they confirm the renewal."});
const ID = /^[A-Za-z0-9_-]{1,100}$/, SHA = /^[a-f0-9]{64}$/, KEY = /^[A-Za-z0-9_-]{16,100}$/;
const matched = (value, pattern) => typeof value === "string" && pattern.test(value);
const revision = value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
const fields = {
  review: ["memberId","termId"],
  capture: ["memberId","termId","noticeRevision","reviewSha256","idempotencyKey","acknowledge"],
  confirm: ["revision","reviewSha256","idempotencyKey","acknowledge"],
  withdraw: ["revision","idempotencyKey","acknowledge"],
};
const H = (domain,value) => hash(["charitology-membership-assistance-v1",domain,value]);
export const assistedFields = () => fail(422,"membership_assistance_fields","Use the exact staff-assisted renewal fields.");
export const assistedChanged = () => fail(409,"membership_assistance_changed","Review the current membership and approved term again.");
export const assistedConflict = () => fail(409,"membership_assistance_conflict","This member or term already has a renewal review.");
export const assistedClosed = () => fail(409,"membership_assistance_closed","This assisted renewal action is currently closed.");
export const assistedUnavailable = () => fail(404,"membership_assistance_unavailable","This staff-assisted renewal is unavailable.");
export const assistedStorage = () => fail(503,"membership_assistance_storage","Staff-assisted renewal is temporarily unavailable.");

export function assistedInput(action, raw) {
  if (!Object.hasOwn(fields,action)) assistedFields();
  const keys = ["version",...fields[action]];
  if (!raw || typeof raw !== "object" || isProxy(raw) || Object.getPrototypeOf(raw) !== Object.prototype ||
      Reflect.ownKeys(raw).length !== keys.length) assistedFields();
  const out = {};
  for (const key of keys) {
    const field = Object.getOwnPropertyDescriptor(raw,key);
    if (!field?.enumerable || !Object.hasOwn(field,"value")) assistedFields();
    out[key] = field.value;
  }
  if (out.version !== 1 ||
      (["review","capture"].includes(action) && (!matched(out.memberId,ID) || !matched(out.termId,ID) || out.memberId === out.termId)) ||
      (["capture","confirm"].includes(action) && !matched(out.reviewSha256,SHA)) ||
      (action === "capture" && out.noticeRevision !== MEMBERSHIP_ASSISTANCE_NOTICE.revision) ||
      (["confirm","withdraw"].includes(action) && !revision(out.revision)) ||
      (action !== "review" && (!matched(out.idempotencyKey,KEY) || out.acknowledge !== true))) assistedFields();
  return Object.freeze(out);
}

export const assistedCaseId = (org, actor, key) => H("case-id",[org,actor,key]).slice(0,32);
export const assistedAuthority = (staff, epoch) => H("staff-authority",[staff.model,epoch]);
export const assistedReceipt = (action, input, authoritySha256) => Object.freeze({
  keySha256:H(action+"-key",input.idempotencyKey),commandSha256:H(action+"-command",input),authoritySha256,
});
export function assertAssistedReplay(saved, expected) {
  if (!saved || saved.keySha256 !== expected.keySha256 || saved.commandSha256 !== expected.commandSha256) assistedConflict();
  if (saved.authoritySha256 !== expected.authoritySha256) assistedChanged();
}

const period = data => ({startDate:data.startDate,endDate:data.endDate,renewalDate:data.renewalDate});
const recordView = record => ({id:record.id,title:record.data.title,revision:record.revision,...period(record.data)});

export function assistedSource(graph, nowExact) {
  const {ready,today,proposed} = reviewAssistedMembershipTermEligibility({
    member:graph.memberFacts,workspaceTimeZone:graph.workspaceTimeZone,term:graph.term,nowExact,
  });
  if (!ready) return null;
  const member = recordView(graph.member), term = recordView(graph.termRow);
  const chapter = graph.chapter ? [graph.chapter.id,graph.chapter.revision,graph.chapter.createdAtExact] : null;
  const sourceSha256 = H("source",[graph.memberFacts,graph.term,graph.contactSha256,graph.contact.revision,chapter,graph.workspaceTimeZone,
    graph.restoreEpochSha256,member,term]);
  return Object.freeze({member,term,today,sourceSha256,effect:Object.freeze({
    orgId:graph.member.orgId,id:graph.member.id,expectedRevision:graph.member.revision,revision:graph.member.revision+1,
    status:"active",startDate:graph.member.data.startDate,endDate:proposed.endDate,renewalDate:proposed.renewalDate,
  })});
}

const review = (source, reviewSha256) => ({
  member:source.member,term:source.term,noticeRevision:MEMBERSHIP_ASSISTANCE_NOTICE.revision,reviewSha256,
});
export const assistedCaptureReview = (source,authority) => review(source,
  H("capture-review",[authority,source.sourceSha256,source.today,MEMBERSHIP_ASSISTANCE_NOTICE]));

export function assistedCapture(graph, source, staff, nowExact) {
  const {member,termRow,contact,restoreEpochSha256} = graph;
  return Object.freeze({version:1,contactId:contact.id,memberRevision:member.revision,
    memberCreatedAtExact:member.createdAtExact,termRevision:termRow.revision,termCreatedAtExact:termRow.createdAtExact,
    contactCreatedAtExact:contact.createdAtExact,restoreEpochSha256,sourceSha256:source.sourceSha256,
    noticeRevision:MEMBERSHIP_ASSISTANCE_NOTICE.revision,witnessId:staff.actor.id,
    witnessMembershipRevision:staff.model.membershipRevision,witnessMembershipCreatedAtExact:staff.model.membershipCreatedAtExact,
    witnessedAtExact:nowExact});
}

export function assistedPendingReview(row, graph, source, staff, authority, nowExact, canWrite) {
  const saved = row.capture;
  if (!source || saved.witnessedAtExact > nowExact) return null;
  const current = assistedCapture(graph,source,staff,nowExact);
  const pins = ["contactId","memberRevision","memberCreatedAtExact","termRevision","termCreatedAtExact",
    "contactCreatedAtExact","restoreEpochSha256","sourceSha256","noticeRevision"];
  if (pins.some(key => saved[key] !== current[key])) return null;
  const eligible = canWrite && staff.actor.id !== saved.witnessId && staff.actor.id !== graph.member.lastEditedBy;
  return review(source,eligible ? H("confirm-review",[row.caseId,row.revision,saved,authority,source.today]) : null);
}

export function assistedTerminal(action, staff, receipt, nowExact, effect = null) {
  return Object.freeze({version:1,action,actorId:staff.actor.id,actorMembershipRevision:staff.model.membershipRevision,
    actorMembershipCreatedAtExact:staff.model.membershipCreatedAtExact,actedAtExact:nowExact,receipt,
    result:effect ? {memberRevision:effect.revision,...period(effect)} : null});
}
