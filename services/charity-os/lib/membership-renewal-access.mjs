import { visibleRecord } from "./access.mjs";
import { rowRecord } from "./database.mjs";
import { reviewMembershipTermEligibility } from "./membership-renewal-model.mjs";
import { membershipStorageUnavailable } from "./membership-renewal-storage.mjs";
import { modulePermissions, validateRecord } from "./modules.mjs";
import { groupRestoreEpoch, groupSessionHash } from "./participation-group-access.mjs";
import { validateGroupExactStamp } from "./participation-group-model.mjs";
import { participantEmail, verifiedParticipant } from "./participants.mjs";
import { validDate } from "./schedule.mjs";
import { fail, hash, stable } from "./security.mjs";

export const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
export const sha = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const rev = value => Number.isSafeInteger(value) && value >= 1 && value <= 2147483647;
export const unavailable = () => fail(404,"membership_renewal_unavailable","This member review is unavailable.");
export const changed = () => fail(409,"membership_renewal_changed","Read the current member review before saving again.");
export const duplicate = () => fail(409,"membership_renewal_duplicate","This renewal review already has a recorded request or decision.");
const denied = () => fail(403,"membership_renewal_staff","An unrestricted Memberships administrator is required.");
export const digest = (domain,value) => hash(["membership-renewal-route-v1",domain,value]);
export const sqlStamp = expression => `to_char(${expression} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
export function one(result) {
  if (!Array.isArray(result?.rows) || result.rows.length > 1 || result.rowCount !== result.rows.length)
    membershipStorageUnavailable();
  return result.rows[0] ?? null;
}
function stamp(value) {
  try { return validateGroupExactStamp(value); }
  catch { return membershipStorageUnavailable(); }
}
export async function clock(c) {
  return stamp(one(await c.query("SELECT "+sqlStamp("statement_timestamp()")+" AS now"))?.now);
}
function sessionFacts(session) {
  const actor = verifiedParticipant(session), sessionId = session.session.id;
  if (!id(sessionId)) fail(401,"session","Sign in again to open membership renewal.");
  return {...actor,sessionId,sessionSha256:groupSessionHash(session)};
}
export function ownActor(session) {
  const actor = sessionFacts(session);
  return {...actor,model:{userId:actor.id,verified:true,sessionSha256:actor.sessionSha256}};
}
export function isMembershipRenewalStaff(value) {
  const permission = modulePermissions("memberships",value?.role);
  return ["owner","admin"].includes(value?.role) && Array.isArray(value?.programIds) &&
    value.programIds.length === 0 && permission.read && permission.write && permission.approve;
}
export async function currentMembershipStaff(c, org, session, readOnly) {
  const actor = sessionFacts(session);
  const live = one(await c.query(`SELECT u.email
    FROM public."session" s JOIN public."user" u ON u.id=s."userId"
    WHERE s.id=$1 AND s."userId"=$2 AND s."expiresAt">statement_timestamp() AND u."emailVerified" IS TRUE` +
    (readOnly ? "" : " FOR SHARE OF s,u"),[actor.sessionId,actor.id]));
  if (!live || participantEmail(live.email) !== actor.email)
    fail(401,"session","Sign in again to open membership renewal.");
  const member = one(await c.query(`SELECT user_id,role,program_ids AS "programIds",revision,
    ${sqlStamp("created_at")} AS "createdAtExact" FROM public.os_members WHERE org_id=$1 AND user_id=$2` +
    (readOnly ? "" : " FOR SHARE"),[org,actor.id]));
  if (!isMembershipRenewalStaff(member) || member.user_id !== actor.id || !rev(member.revision)) denied();
  return {
    member,actor,
    model:{orgId:org,userId:actor.id,role:member.role,wholeWorkspace:true,verified:true,
      sessionSha256:actor.sessionSha256,membershipRevision:member.revision,membershipCreatedAtExact:stamp(member.createdAtExact)},
  };
}
export async function discoverOwnMembershipLink(c, org, intake, userId) {
  const link = one(await c.query(`SELECT id FROM public.os_participant_links
    WHERE org_id=$1 AND intake_id=$2 AND user_id=$3 AND revoked_at IS NULL`,[org,intake,userId]));
  if (typeof link?.id !== "string" || !/^[a-f0-9]{32}$/.test(link.id)) unavailable();
  return link.id;
}
const intakeFields = `i.revision AS "intakeRevision",${sqlStamp("i.created_at")} AS "intakeCreatedAtExact",
    i.converted_ids AS converted,p.id AS "publicationId",${sqlStamp("p.created_at")} AS "publicationCreatedAtExact",
    o.time_zone AS "workspaceTimeZone",u.email AS "accountEmail",i.answers->>'email' AS "requestEmail",
    ${sqlStamp('u."createdAt"')} AS "accountCreatedAtExact"`;
const intakeJoin = `JOIN public.os_publications p ON p.org_id=i.org_id AND p.id=i.publication_id AND p.kind='contact'
    JOIN public.os_orgs o ON o.id=i.org_id`;
const intakeActive = `i.status='converted' AND i.cancelled_at IS NULL AND i.erased_at IS NULL`;
const actualContact = value => Array.isArray(value) && value.length === 1 && value[0] &&
  Object.keys(value[0]).length === 2 && value[0].moduleId === "contacts" && id(value[0].id) ? value[0].id : null;
function accountFacts(row, ownEmail) {
  if (!row) unavailable();
  const account = participantEmail(row.accountEmail), contactId = actualContact(row.converted);
  if (!account || account !== participantEmail(row.requestEmail) || (ownEmail !== undefined && account !== ownEmail) ||
      !contactId || !rev(row.intakeRevision) || !id(row.publicationId)) unavailable();
  for (const value of [row.intakeCreatedAtExact,row.publicationCreatedAtExact,row.accountCreatedAtExact]) stamp(value);
  return {contactId,intakeRevision:row.intakeRevision,intakeCreatedAtExact:row.intakeCreatedAtExact,
    publicationId:row.publicationId,publicationCreatedAtExact:row.publicationCreatedAtExact,
    workspaceTimeZone:row.workspaceTimeZone,accountCreatedAtExact:row.accountCreatedAtExact};
}
export async function currentOwnMembershipLink(c, org, intake, linkId, actor, readOnly) {
  const row = one(await c.query(`SELECT l.id AS "linkId",l.revision AS "linkRevision",
    ${sqlStamp("l.created_at")} AS "linkCreatedAtExact",${intakeFields}
    FROM public.os_participant_links l JOIN public.os_intake i
      ON i.org_id=l.org_id AND i.id=l.intake_id AND i.publication_id=l.publication_id
    ${intakeJoin}
    JOIN public."user" u ON u.id=l.user_id AND u."emailVerified" IS TRUE
    JOIN public."session" s ON s."userId"=u.id AND s.id=$5 AND s."expiresAt">statement_timestamp()
    WHERE l.org_id=$1 AND l.intake_id=$2 AND l.user_id=$3 AND l.id=$4 AND l.revoked_at IS NULL AND ${intakeActive}` +
    (readOnly ? "" : " FOR SHARE OF l,i,p,o,u,s"),[org,intake,actor.id,linkId,actor.sessionId]));
  const source = accountFacts(row,actor.email);
  if (row.linkId !== linkId || !rev(row.linkRevision)) unavailable();
  return {org,intake,userId:actor.id,linkId,linkRevision:row.linkRevision,
    linkCreatedAtExact:stamp(row.linkCreatedAtExact),...source};
}
/** Only reads the offered row and its current intake/account, never the
 * participant own-link index under staff authority. */
export async function currentOfferedMembershipLink(c, org, intake, offer, readOnly) {
  const row = one(await c.query(`SELECT ${intakeFields} FROM public.os_intake i ${intakeJoin}
    JOIN public."user" u ON u.id=$3 AND u."emailVerified" IS TRUE
    WHERE i.org_id=$1 AND i.id=$2 AND ${intakeActive}` +
    (readOnly ? "" : " FOR SHARE OF i,p,o,u"),[org,intake,offer.userId]));
  const source = accountFacts(row);
  if (source.intakeRevision !== offer.intakeRevision || source.intakeCreatedAtExact !== offer.intakeCreatedAtExact ||
      source.publicationId !== offer.publicationId || source.publicationCreatedAtExact !== offer.publicationCreatedAtExact)
    unavailable();
  const link = {org,intake,userId:offer.userId,linkId:offer.linkId,linkRevision:offer.linkRevision,
    linkCreatedAtExact:offer.linkCreatedAtExact,...source};
  if (offer.evidenceSha256 !== offerEvidence(link)) unavailable();
  return link;
}
export const offerEvidence = ({workspaceTimeZone:_,...link}) => digest("offered-link",link);
export function bindingAuthority(staff, restoreEpochSha256) {
  return digest("binding-authority",[staff.model,restoreEpochSha256]);
}

async function record(c, org, recordId, moduleId, readOnly, lock = "SHARE") {
  const found = one(await c.query(`SELECT r.*,${sqlStamp("r.created_at")} AS "createdAtExact"
    FROM public.os_records r WHERE r.org_id=$1 AND r.id=$2 AND r.module_id=$3 AND r.deleted_at IS NULL` +
    (readOnly ? "" : " FOR " + lock + " OF r"),[org,recordId,moduleId]));
  return found ? {...rowRecord(found),createdAtExact:stamp(found.createdAtExact)} : null;
}
const contactIdentity = contact => digest("contact-identity",[contact.orgId,contact.id,contact.createdAtExact]);
function previousDay(day) {
  return new Date(Date.parse(day + "T00:00:00.000Z") - 86400000).toISOString().slice(0,10);
}
function approval(value) {
  if (!value || value.status !== "approved" || !rev(value.revision) || !id(value.actorId) ||
      typeof value.at !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.at))
    return null;
  try {
    return {status:"approved",revision:value.revision,actorId:value.actorId,
      atExact:validateGroupExactStamp(value.at.slice(0,-1)+"000Z")};
  } catch { return null; }
}
const dates = data => ({startDate:data.startDate,endDate:data.endDate,renewalDate:data.renewalDate});
function reviewedTerm(term, member, window) {
  if (!term || term.data.kind !== "renewal" || term.data.contactId !== member.data.contactId ||
      (term.data.chapterId ?? null) !== (member.data.chapterId ?? null) || !validDate(term.data.startDate) ||
      !validDate(term.data.endDate) || term.data.endDate < term.data.startDate ||
      (term.data.renewalDate !== null && (!validDate(term.data.renewalDate) ||
        term.data.renewalDate < term.data.startDate || term.data.renewalDate > term.data.endDate)) ||
      !["draft","review","approved","cancelled"].includes(term.status)) return null;
  const reviewed = term.snapshot?.orgId === term.orgId && term.snapshot?.id === term.id &&
    term.snapshot.moduleId === "memberships" && stable(term.snapshot.data) === stable(term.data)
    ? approval(term.approval) : null;
  const noDues = term.data.duesStatus === "not-required" && !term.data.duesReference &&
    (term.data.dues === null || term.data.dues?.minor === 0);
  return {orgId:term.orgId,id:term.id,kind:"renewal",memberId:member.id,revision:term.revision,
    createdAtExact:term.createdAtExact,status:term.status,lastEditedBy:term.lastEditedBy,approval:reviewed,
    previousEndDate:previousDay(term.data.startDate),...dates(term.data),...window,
    duesPolicy:noDues ? "no-payment-required" : "external-settlement-required"};
}
async function membershipCoverage(c, {org,memberId,termId,linkedContactId,binding,staff,readOnly,finalWrite=false}) {
  if (memberId === termId) changed();
  let contact = linkedContactId === undefined ? null : await record(c,org,linkedContactId,"contacts",readOnly);
  const member = await record(c,org,memberId,"memberships",readOnly,finalWrite ? "UPDATE" : "SHARE");
  const term = await record(c,org,termId,"memberships",readOnly);
  if (linkedContactId === undefined && id(member?.data.contactId)) contact = await record(c,org,member.data.contactId,"contacts",readOnly);
  if (!contact || contact.data.kind !== "person-reference" || contact.status === "archived" || !member ||
      member.data.kind !== "member" || member.data.contactId !== contact.id ||
      !["active","renewal-due","expired","cancelled"].includes(member.status)) unavailable();
  if (binding && (binding.memberCreatedAtExact !== member.createdAtExact || binding.contactSha256 !== contactIdentity(contact)))
    unavailable();
  if (staff && (!visibleRecord(contact,staff.member) || !visibleRecord(member,staff.member) ||
      (term && !visibleRecord(term,staff.member)))) unavailable();
  const chapter = member.data.chapterId ? await record(c,org,member.data.chapterId,"memberships",readOnly) : null;
  if (member.data.chapterId && (!chapter || chapter.data.kind !== "chapter" || (staff && !visibleRecord(chapter,staff.member))))
    unavailable();
  const window = binding ? {opensOn:binding.opensOn,closesOn:binding.closesOn} :
    {opensOn:member.data.renewalDate,closesOn:member.data.endDate};
  if (!validDate(window.opensOn) || !validDate(window.closesOn) || window.opensOn > window.closesOn) changed();
  const usableTerm = !binding || binding.termCreatedAtExact === term?.createdAtExact ? reviewedTerm(term,member,window) : null;
  const memberFacts = {orgId:org,id:member.id,kind:"member",status:member.status,revision:member.revision,createdAtExact:member.createdAtExact,
    lastEditedBy:member.lastEditedBy,...dates(member.data),duesReferencePresent:typeof member.data.duesReference === "string" && !!member.data.duesReference.trim()};
  return {memberFacts,term:usableTerm,member,contact,chapter,termRow:term,contactSha256:contactIdentity(contact),window};
}
export async function membershipGraph(c, {link,selection,offer,binding,staff,nowExact,readOnly,finalWrite=false}) {
  const {org} = link, {memberId,termId} = selection;
  const coverage = await membershipCoverage(c,{org,memberId,termId,linkedContactId:link.contactId,binding,staff,readOnly,finalWrite});
  const {memberFacts,term,member,contact,chapter,termRow,contactSha256,window} = coverage;
  const restoreEpochSha256 = await groupRestoreEpoch(c,org,[memberId,termId,contact.id]);
  const subject = {
    member:memberFacts,
    link:{orgId:org,memberId,ownerUserId:link.userId,id:link.linkId,revision:link.linkRevision,
      createdAtExact:link.linkCreatedAtExact,intakeId:link.intake,intakeRevision:link.intakeRevision,
      intakeCreatedAtExact:link.intakeCreatedAtExact,publicationId:link.publicationId,publicationCreatedAtExact:link.publicationCreatedAtExact,
      bindingRevision:1,bindingCreatedAtExact:binding?.createdAtExact ?? offer.createdAtExact,active:true,verifiedEmailMatches:true},
    workspaceTimeZone:link.workspaceTimeZone,restoreEpochSha256,
  };
  const directorySubject = staff ? null : {...subject,restoreEpochSha256:await groupRestoreEpoch(c,org,[memberId,contact.id])};
  return {subject,directorySubject,term,member,contact,chapter,termRow,contactSha256,window};
}
export async function readAssistedMembershipGraph(c, {org,memberId,termId,staff,readOnly,finalWrite=false}) {
  const coverage = await membershipCoverage(c,{org,memberId,termId,staff,readOnly,finalWrite});
  const workspace = one(await c.query("SELECT time_zone FROM public.os_orgs WHERE id=$1" + (readOnly ? "" : " FOR SHARE"),[org]));
  if (!workspace) unavailable();
  const restoreEpochSha256 = await groupRestoreEpoch(c,org,
    [memberId,termId,coverage.contact.id,...(coverage.chapter ? [coverage.chapter.id] : [])]);
  return {...coverage,workspaceTimeZone:workspace.time_zone,restoreEpochSha256};
}
export function bindingReview(graph, link, offer, staff, nowExact) {
  if (staff.actor.id === link.userId) denied();
  const {ready,dues} = reviewMembershipTermEligibility({subject:graph.subject,term:graph.term,nowExact});
  if (!ready) changed();
  const row = record => ({id:record.id,title:record.data.title,revision:record.revision,...dates(record.data)});
  const authority = bindingAuthority(staff,graph.subject.restoreEpochSha256);
  const member = row(graph.member), term = row(graph.termRow);
  const reviewSha256 = digest("binding-review",[offer.evidenceSha256,offer.createdAtExact,authority,graph.contactSha256,
    graph.subject.member,graph.term,graph.subject.workspaceTimeZone,member,term]);
  return {authority,review:{member,term,dues,reviewSha256}};
}
export function membershipRecordUpdate(graph, effect, actorId) {
  const {member,contact,chapter} = graph;
  if (member.id !== effect.id || member.orgId !== effect.orgId || member.revision !== effect.expectedRevision ||
      effect.revision !== member.revision+1 || effect.startDate !== member.data.startDate) changed();
  const data = validateRecord("memberships",{...member.data,...dates(effect)},{
    orgId:member.orgId,recordId:member.id,status:effect.status,records:[contact,chapter].filter(Boolean),previous:member.data,
  });
  const {createdAtExact:_,...ordinary} = member;
  return {...ordinary,data,status:effect.status,revision:effect.revision,lastEditedBy:actorId,approval:null};
}
