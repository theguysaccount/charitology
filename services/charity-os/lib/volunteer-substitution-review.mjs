/** Pure proposal. These facts must come from one locked tenant read.
 * Never pass a browser request or its booleans to this compiler. */
import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const revision = value => Number.isSafeInteger(value) && value >= 1 && value <= 2147483647;
const next = value => revision(value) && value < 2147483647;
const nonnegative = value => Number.isSafeInteger(value) && value >= 0 && value <= 2147483647;
const digest = (domain,value) => createHash("sha256").update(JSON.stringify(["charitology-shift-substitution-v1",domain,value])).digest("hex");
function refuse(code,message,status=409){ throw Object.assign(new Error(message),{code,status}); }
const malformed=()=>refuse("substitution_context","Read the exact shift, both places and the current permissions.",422);
function shape(value,keys){
  if(!value||typeof value!=="object"||isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)malformed();
  const own=Object.getOwnPropertyDescriptors(value);
  if(Reflect.ownKeys(own).length!==keys.length||
    !keys.every(key=>own[key]?.enumerable&&Object.hasOwn(own[key],"value")))malformed();
  return Object.fromEntries(keys.map(key=>[key,own[key].value]));
}
function time(value){
  if(typeof value!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(value))malformed();
  const iso=value.slice(0,23)+"Z",d=new Date(iso);
  if(!Number.isFinite(+d)||d.toISOString()!==iso)malformed();
  return BigInt(+d)*1000n+BigInt(value.slice(23,26));
}
const SHIFT=["id","revision","kind","approved","state","startsAt","endsAt","capacity","managed"];
const PERSON=["id","revision","targetId","candidateRevision","candidateCurrent","state","coverage","origin",
  "groupLinked","personIdentitySha256","linkScopeSha256"];
const WILLINGNESS=["intentId","party","orgId","shiftId","shiftRevision","participationId","participationRevision",
  "linkScopeSha256","acceptedAt","expiresAt","active"];
const LOCKED=["orgId","staffScopeSha256","restoreScopeSha256","intentId","nowExact","shift",
  "outgoing","replacement","releaseConsent","replacementConsent","roster"];
const ROSTER=["confirmed","nextEligibleId","replacementOverlap","outgoingCheckedIn","sourceComplete"];
function person(value){
  const p=shape(value,PERSON);
  if(!id(p.id)||!id(p.targetId)||!next(p.revision)||!revision(p.candidateRevision)||!hash(p.linkScopeSha256)||
    !hash(p.personIdentitySha256)||typeof p.groupLinked!=="boolean"||typeof p.candidateCurrent!=="boolean")malformed();
  return p;
}
function willingness(value,root,shift,row,party,now){
  const consent=shape(value,WILLINGNESS);
  if(consent.party!==party||consent.orgId!==root.orgId||consent.intentId!==root.intentId||
    consent.shiftId!==shift.id||consent.shiftRevision!==shift.revision||
    consent.participationId!==row.id||consent.participationRevision!==row.revision||
    consent.linkScopeSha256!==row.linkScopeSha256||consent.active!==true)
    refuse("substitution_consent","Both volunteers must give current permission for this shift change.");
  const accepted=time(consent.acceptedAt),expires=time(consent.expiresAt);
  if(accepted>now||expires<=now||accepted>=expires)
    refuse("substitution_consent","Both permissions must still be active.");
  return consent;
}
function freeze(value){
  if(value&&typeof value==="object"){for(const item of Object.values(value))freeze(item);Object.freeze(value);}
  return value;
}

export function planVolunteerSubstitution(value){
  const current=shape(value,LOCKED),now=time(current.nowExact);
  if(!id(current.orgId)||!id(current.intentId)||!hash(current.staffScopeSha256)||!hash(current.restoreScopeSha256))malformed();
  const shift=shape(current.shift,SHIFT),starts=time(shift.startsAt),ends=time(shift.endsAt);
  if(!id(shift.id)||!revision(shift.revision)||!nonnegative(shift.capacity))malformed();
  if(shift.kind!=="volunteer-shift"||shift.approved!==true||shift.managed!==true||shift.state!=="open"||
    starts<=now||ends<=starts)
    refuse("substitution_shift","Choose the exact approved future volunteer shift.");
  const outgoing=person(current.outgoing),replacement=person(current.replacement);
  if(outgoing.id===replacement.id||outgoing.linkScopeSha256===replacement.linkScopeSha256||
    outgoing.personIdentitySha256===replacement.personIdentitySha256||
    outgoing.targetId!==shift.id||replacement.targetId!==shift.id||outgoing.state!=="confirmed"||
    replacement.state!=="waitlisted"||[outgoing,replacement].some(row=>row.coverage!=="full"||row.origin!=="live"||row.groupLinked||!row.candidateCurrent))
    refuse("substitution_places","Use one live confirmed place and one distinct full-shift candidate on this roster.");
  const release=willingness(current.releaseConsent,current,shift,outgoing,"leaving",now);
  const take=willingness(current.replacementConsent,current,shift,replacement,"joining",now);
  const roster=shape(current.roster,ROSTER);
  if(!nonnegative(roster.confirmed)||typeof roster.replacementOverlap!=="boolean"||
    typeof roster.outgoingCheckedIn!=="boolean"||typeof roster.sourceComplete!=="boolean"||
    !(roster.nextEligibleId===null||id(roster.nextEligibleId)))malformed();
  if(!roster.sourceComplete||roster.confirmed===0||roster.confirmed>shift.capacity||roster.outgoingCheckedIn)
    refuse("substitution_capacity","The reviewed roster no longer permits an exchange.");
  if(roster.nextEligibleId!==replacement.id)
    refuse("substitution_priority","Review the next eligible volunteer in the waitlist order.");
  if(roster.replacementOverlap)
    refuse("substitution_overlap","The replacement has an overlapping confirmed commitment in this workspace.");

  const facts={orgId:current.orgId,staffScopeSha256:current.staffScopeSha256,restoreScopeSha256:current.restoreScopeSha256,
    intentId:current.intentId,shift,outgoing,replacement,release,take,roster};
  const plan={version:1,orgId:current.orgId,intentId:current.intentId,
    shift:{id:shift.id,revision:shift.revision,startsAt:shift.startsAt,endsAt:shift.endsAt},
    reviewSha256:digest("review",facts),
    outgoing:{id:outgoing.id,revision:outgoing.revision,nextRevision:outgoing.revision+1,state:"cancelled"},
    replacement:{id:replacement.id,revision:replacement.revision,nextRevision:replacement.revision+1,state:"confirmed"},
    confirmedPlaces:{before:roster.confirmed,after:roster.confirmed},
  };
  return freeze(plan);
}

/** The caller must look up the exact prior decision before asking for fresh
 * facts. A matching review only proposes changes; it writes nothing. */
export function authorizeVolunteerSubstitution(value,raw){
  const request=shape(raw,["version","reviewSha256","idempotencyKey","acknowledge"]);
  if(request.version!==1||!hash(request.reviewSha256)||!id(request.idempotencyKey)||
    request.idempotencyKey.length<16||request.acknowledge!==true)
    refuse("substitution_acknowledgement","Review both effects and explicitly accept the change.",422);
  const plan=planVolunteerSubstitution(value);
  if(request.reviewSha256!==plan.reviewSha256)
    refuse("substitution_stale","The shift, participants or permission changed. Review again.");
  return freeze({plan,requestSha256:digest("request",[plan.orgId,plan.intentId,request])});
}
