/** Server composition of the staff review and paired command. Exact
 * cross-party authority and capacity are required ports. */
import { allRecords, noteParticipationReceiptReplay } from "./database.mjs";
import { currentGroupMember } from "./participation-group-access.mjs";
import {
  readParticipationDomainClock, readVolunteerSubstitutionRoster, stageVolunteerSubstitutionPlaces,
} from "./participation.mjs";
import { fail } from "./security.mjs";
import { createVolunteerSubstitutionCommand } from "./volunteer-substitution-command.mjs";
import { planVolunteerSubstitution } from "./volunteer-substitution-review.mjs";
import { readVolunteerSubstitutionOfferForStaff } from "./volunteer-substitution-offer.mjs";
import { consumeVolunteerSubstitutionFreshWrite } from "./volunteer-substitution-rate.mjs";
import {
  readVolunteerSubstitutionChoice, readVolunteerSubstitutionReceipt, retainVolunteerSubstitutionReceipt,
} from "./volunteer-substitution-store.mjs";
import {
  readVolunteerSubstitutionRestoreScope, readVolunteerSubstitutionStaffScope,
} from "./volunteer-substitution-staff-scope.mjs";

const ID=/^[A-Za-z0-9_-]{1,100}$/, INTENT=/^[a-f0-9]{32}$/;
const matches=(value,re)=>typeof value==="string"&&re.test(value);
const stale=()=>fail(409,"substitution_stale","Both current volunteer choices and an eligible shift are required.");
const unavailable=()=>fail(404,"substitution_unavailable","This shift change is unavailable.");
const sqlExact=expr=>`to_char((${expr}) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const safeLabel=record=>typeof record.data.title==="string"&&record.data.title.trim().length>0&&
  record.data.title.length<=180 ? record.data.title : "Volunteer assignment";
function compatibleChoice(raw,offer,p,party,nowExact) {
  return raw&&raw.orgId===offer.orgId&&raw.intentId===offer.intentId&&raw.party===party&&raw.shiftId===offer.shiftId&&
    raw.shiftRevision===offer.shiftRevision&&raw.participationId===p.id&&raw.participationRevision===p.revision&&
    raw.intakeId===p.intake_id&&raw.choiceRevision===1&&raw.withdrawnAtExact===null&&
    offer.issuedAtExact<=raw.acceptedAtExact&&raw.acceptedAtExact<=nowExact&&nowExact<raw.expiresAtExact&&
    raw.expiresAtExact<=offer.expiresAtExact;
}
const person=(p,b,v)=>({id:p.id,revision:p.revision,targetId:p.target_id,candidateRevision:b.revision,candidateCurrent:true,
  state:p.state,coverage:"full",origin:"live",groupLinked:false,personIdentitySha256:v.personIdentitySha256,
  linkScopeSha256:v.linkScopeSha256});
const willing=v=>({intentId:v.intentId,party:v.party,orgId:v.orgId,shiftId:v.shiftId,shiftRevision:v.shiftRevision,
  participationId:v.participationId,participationRevision:v.participationRevision,linkScopeSha256:v.linkScopeSha256,
  acceptedAt:v.acceptedAtExact,expiresAt:v.expiresAtExact,active:true});
const leg=(record,state,nextState)=>Object.freeze({label:safeLabel(record),state,nextState});

async function prepare(c,selector,session,base,readPairedOwnAuthority) {
  const {orgId:org,intentId,userId}=selector;
  const offer=await readVolunteerSubstitutionOfferForStaff(c,{orgId:org,intentId,session,readOnly:false});
  const member=await currentGroupMember(c,org,session,{moduleId:"volunteers",readOnly:false});
  const records=await allRecords(c,org),source=records.find(r=>r.id===offer.shiftId);
  const t=(await c.query("SELECT * FROM os_participation_targets WHERE org_id=$1 AND target_id=$2 FOR UPDATE",
    [org,offer.shiftId])).rows[0];
  const choices=(await c.query("SELECT * FROM os_participations WHERE org_id=$1 AND target_id=$2 AND id=ANY($3::text[]) ORDER BY id COLLATE \"C\" FOR UPDATE",
    [org,offer.shiftId,[offer.outgoing.id,offer.replacement.id]])).rows;
  const outgoing=choices.find(p=>p.id===offer.outgoing.id),replacement=choices.find(p=>p.id===offer.replacement.id);
  if(!source||source.revision!==offer.shiftRevision||!t||choices.length!==2||!outgoing||!replacement||
    outgoing.revision!==offer.outgoing.revision||replacement.revision!==offer.replacement.revision)stale();
  const oldAssignment=records.find(r=>r.id===outgoing.booking_record_id),
    newAssignment=records.find(r=>r.id===replacement.booking_record_id);
  if(!oldAssignment||!newAssignment||oldAssignment.moduleId!=="volunteers"||newAssignment.moduleId!=="volunteers")stale();
  const times=(await c.query(`SELECT ${sqlExact("$1::timestamptz")} AS "startsAt",${sqlExact("$2::timestamptz")} AS "endsAt"`,
    [source.data.startAt,source.data.endAt])).rows[0];
  const left=await readVolunteerSubstitutionChoice(c,{orgId:org,intentId,party:"leaving"});
  const right=await readVolunteerSubstitutionChoice(c,{orgId:org,intentId,party:"joining"});
  const serverClock=await readParticipationDomainClock(c);
  const writeContext={member,source,t,records,outgoing,replacement,serverClock};
  const roster=await readVolunteerSubstitutionRoster(c,selector,writeContext);
  const details={version:1,shift:Object.freeze({title:source.data.title,startsAt:times.startsAt,endsAt:times.endsAt,
    timeZone:source.data.timeZone}),outgoing:leg(oldAssignment,"confirmed","cancelled"),
    replacement:leg(newAssignment,"waitlisted","confirmed"),
    confirmedPlaces:Object.freeze({before:roster.confirmed,after:roster.confirmed})};
  const blocked=()=>({review:Object.freeze({...details,ready:false}),context:null});
  if(!compatibleChoice(left,offer,outgoing,"leaving",serverClock.atExact)||
    !compatibleChoice(right,offer,replacement,"joining",serverClock.atExact)||
    left.userId===right.userId||left.linkId===right.linkId||
    roster.nextEligibleId!==replacement.id||roster.replacementOverlap||roster.outgoingCheckedIn)
    return blocked();
  // The verifier returns only a boolean. It uses current own link pins and
  // never impersonates either volunteer or transfers their identity to staff.
  if(await readPairedOwnAuthority(c,{orgId:org,intentId,staffUserId:userId,staffSessionId:session.session.id})!==true)
    return blocked();
  const assignmentIds={outgoing:oldAssignment.id,replacement:newAssignment.id};
  const restoreScopeSha256=await readVolunteerSubstitutionRestoreScope(c,selector,
    {shiftId:source.id,outgoingAssignmentId:assignmentIds.outgoing,replacementAssignmentId:assignmentIds.replacement});
  const facts={...base,restoreScopeSha256,nowExact:serverClock.atExact,
    shift:{id:source.id,revision:source.revision,kind:"volunteer-shift",approved:true,state:"open",
      startsAt:times.startsAt,endsAt:times.endsAt,capacity:source.data.capacity,managed:true},
    outgoing:person(outgoing,oldAssignment,left),replacement:person(replacement,newAssignment,right),
    releaseConsent:willing(left),replacementConsent:willing(right),roster};
  const plan=planVolunteerSubstitution(facts);
  return {review:Object.freeze({...details,ready:true,reviewSha256:plan.reviewSha256}),
    context:{facts,assignmentIds,writeContext}};
}

const publicDecision=h=>Object.freeze({version:1,acceptedAtExact:h.acceptedAtExact,
  shift:Object.freeze({startsAtExact:h.shift.startsAtExact,endsAtExact:h.shift.endsAtExact}),
  outgoing:Object.freeze({fromState:h.outgoing.fromState,toState:h.outgoing.toState}),
  replacement:Object.freeze({fromState:h.replacement.fromState,toState:h.replacement.toState}),
  confirmedPlaces:h.confirmedPlaces});

export function createVolunteerSubstitutionStaff({db,readPairedOwnAuthority,checkProspectiveCapacity,checkFinalCapacity}) {
  if(typeof db?.tx!=="function"||![readPairedOwnAuthority,checkProspectiveCapacity,checkFinalCapacity].every(fn=>typeof fn==="function"))
    throw new TypeError("Provide the exact choice authority and both capacity checks.");
  const run = args=>{
    const {session,orgId,intentId}=args,userId=session?.user?.id;
    if(!matches(orgId,ID)||!matches(userId,ID)||!matches(intentId,INTENT))unavailable();
    const commit=createVolunteerSubstitutionCommand({
      db,readStaffAuthority:readVolunteerSubstitutionStaffScope,readRestoreScope:readVolunteerSubstitutionRestoreScope,
      async readLockedReview(c,selector,base) {
        const {context}=await prepare(c,selector,session,base,readPairedOwnAuthority);
        if(!context)stale();
        return context;
      },
      async readLocalAcceptance(c,org,receiptId) {
        const stored=await readVolunteerSubstitutionReceipt(c,{orgId:org,receiptId});
        if(stored&&stored.actorId!==userId)unavailable();
        return stored?.receipt??null;
      },
      consumeFreshWrite:consumeVolunteerSubstitutionFreshWrite,
      checkProspectiveCapacity,stagePair:stageVolunteerSubstitutionPlaces,
      async appendAcceptance(c,org,receipt,actorId) {
        await retainVolunteerSubstitutionReceipt(c,{orgId:org,receipt,actorId});
      },
      checkFinalCapacity,noteExactRetry:noteParticipationReceiptReplay,
    });
    return commit(args);
  };
  return Object.freeze({
    async review({session,orgId,intentId}) {
      const userId=session?.user?.id;
      if(!matches(orgId,ID)||!matches(userId,ID)||!matches(intentId,INTENT))unavailable();
      const selector=Object.freeze({orgId,intentId,userId});
      return db.tx(userId,orgId,async c=>{
        const base=await readVolunteerSubstitutionStaffScope(c,selector,session);
        const {review}=await prepare(c,selector,session,base,readPairedOwnAuthority);
        return Object.freeze({ok:true,review});
      },{lock:true});
    },
    async confirm(args) {
      const {decision,replayed}=await run(args);
      return Object.freeze({ok:true,decision:publicDecision(decision),replayed});
    },
  });
}
