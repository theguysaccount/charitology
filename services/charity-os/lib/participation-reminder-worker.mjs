/** A branch of the existing bounded worker, not another scheduler.
 * Current recipient/authority comes only from the actual sealed context reader.
 * A process clock is never an occurrence permission clock. */
import { fail, hash, stable } from "./security.mjs";
import { ownGroupValue, validateGroupExactStamp } from "./participation-group-model.mjs";
import { readReminderWorkerContext } from "./participation-reminder-context.mjs";
import { reminderWindow, validateReminderIntentMarker, validateReminderPreference, REMINDER_CONSENT_VERSION } from "./participation-reminder-model.mjs";
import { participationReminderTemplateSha256, PARTICIPATION_REMINDER_VARIANT, PARTICIPATION_REMINDER_TEMPLATE_VERSION } from "./participation-reminder-template.mjs";
import { participationDeliveryGate } from "./participation-delivery.mjs";

const opaque=value=>typeof value==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const digest=value=>typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);
const bad=()=>fail(503,"participation_reminder_clock","The bounded SQL reminder checkpoint is unavailable. No delivery was authorized.");

// One actual post-lock clock. The same value is the first-attempt timestamp and
// both sides of [due,start); SQL never substitutes transaction now() or JS time.
// The outer SELECT always returns that moment even when no attempt is allowed.
export const REMINDER_FIRST_ATTEMPT_SQL=`WITH moment AS MATERIALIZED (SELECT clock_timestamp() AS n),
attempt AS (
 UPDATE os_participation_outbox o SET first_attempt_at=moment.n,attempts=o.attempts+1
 FROM moment
 WHERE o.org_id=$1 AND o.id=$2 AND o.lease_owner=$3
   AND o.lease_until>moment.n AND o.state='leased' AND o.first_attempt_at IS NULL
   AND o.purpose='participation' AND o.channel='email' AND o.intent_kind='reminder'
   AND $6::boolean AND $4::timestamptz<=moment.n AND moment.n<$5::timestamptz
 RETURNING o.id
)
SELECT to_char(moment.n AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at_exact,
       $4::timestamptz<=moment.n AS is_due,
       moment.n<$5::timestamptz AS before_start,
       EXISTS(SELECT 1 FROM attempt) AS attempted
FROM moment`;

/** Removes authority only; it never manufactures a participant OFF decision.
 * A provider fact can clear only the still-matching recipient binding. */
export async function clearParticipationReminderAuthority(c,{org,intakeId=null,participationId=null,recipientSha256=null}){
  if(!opaque(org)||(!intakeId&&!participationId)||(intakeId!==null&&!opaque(intakeId))||(participationId!==null&&!opaque(participationId))||(recipientSha256!==null&&!digest(recipientSha256)))
    fail(422,"participation_reminder_scope","Use a bounded reminder privacy scope.");
  return (await c.query(
    "UPDATE os_participations SET reminder_consent=NULL,revision=LEAST(revision::bigint+1,2147483647)::integer,updated_at=now() WHERE org_id=$1 AND ($2::text IS NULL OR intake_id=$2) AND ($3::text IS NULL OR id=$3) AND reminder_consent IS NOT NULL AND ($4::text IS NULL OR reminder_consent->>'recipientSha256'=$4)",
    [org,intakeId,participationId,recipientSha256],
  )).rowCount;
}

async function cancel(c,org,row,owner,code="authority_withdrawn"){
  await c.query(
    "UPDATE os_participation_outbox SET state='cancelled',safe_code=$4,lease_owner=NULL,lease_until=NULL WHERE org_id=$1 AND id=$2 AND lease_owner=$3 AND intent_kind='reminder' AND first_attempt_at IS NULL AND state='leased'",
    [org,row.id,owner,code],
  );
  return {cancelled:true};
}
async function defer(c,org,row,owner,window,atExact,code){
  await c.query(
    "UPDATE os_participation_outbox SET state='pending',safe_code=$4,lease_owner=NULL,lease_until=NULL,next_at=CASE WHEN $5::boolean THEN $6::timestamptz ELSE LEAST($7::timestamptz,$8::timestamptz+interval '1 hour') END WHERE org_id=$1 AND id=$2 AND lease_owner=$3 AND intent_kind='reminder' AND first_attempt_at IS NULL AND state='leased'",
    [org,row.id,owner,code,window.reason==="not-due",window.dueAtExact,window.startAtExact,atExact],
  );
  return {deferred:true};
}

function currentBinding(row,context,org,settings){
  const payload=ownGroupValue(row.payload,2048);
  if(Object.keys(payload).length!==4||!["state","participationId","revision","reminder"].every(k=>Object.hasOwn(payload,k)))return null;
  const marker=validateReminderIntentMarker(payload.reminder),item=context.item;
  const p=context.selected.find(value=>value.participation.id===row.participation_id)?.participation;
  const preference=validateReminderPreference(item.preference),scheduled=context.scheduled;
  const receipt=context.schedule.payload.receipt;
  const message={purpose:"participation",to:item.recipient.email,url:context.template.url,variant:PARTICIPATION_REMINDER_VARIANT};
  const matching=receipt.result.scheduled.filter(value=>value.outboxId===row.id);
  if(row.org_id!==org||row.purpose!=="participation"||row.channel!=="email"||row.intent_kind!=="reminder"||
      !p||p.state!=="confirmed"||p.recovered===true||["legacy","recovered"].includes(p.source)||
      p.id!==row.participation_id||p.revision!==row.participation_revision||item.participationId!==p.id||item.participationRevision!==p.revision||
      payload.state!=="confirmed"||payload.participationId!==p.id||payload.revision!==row.event_revision||
      !preference?.enabled||preference.version!==REMINDER_CONSENT_VERSION||preference.revision!==row.consent_revision||row.consent_copy!==REMINDER_CONSENT_VERSION||
      preference.userId!==row.user_id||preference.linkId!==row.link_id||preference.linkRevision!==row.link_revision||preference.recipientSha256!==row.recipient_hash||
      item.recipient.userId!==row.user_id||item.recipient.linkId!==row.link_id||item.recipient.linkRevision!==row.link_revision||hash(item.recipient.email)!==row.recipient_hash||
      preference.commitmentSha256!==item.commitmentSha256||marker.commitmentSha256!==item.commitmentSha256||
      stable(marker.range)!==stable(item.commitment.range)||marker.sourceSha256!==context.target.sourceSha256||
      marker.templateSha256!==participationReminderTemplateSha256(context.template)||row.template_version!==PARTICIPATION_REMINDER_TEMPLATE_VERSION||
      context.policy.enabled!==true||context.policy.epoch!==row.policy_epoch||row.payload_hash!==hash(message)||
      context.template.url!==new URL("/participant",settings.origin).toString()||
      receipt.orgId!==org||matching.length!==1||scheduled.outboxId!==row.id||scheduled.participationId!==p.id||
      matching[0].participationId!==p.id||matching[0].commitmentSha256!==marker.commitmentSha256||matching[0].dueAtExact!==marker.dueAtExact||
      scheduled.commitmentSha256!==marker.commitmentSha256||scheduled.dueAtExact!==marker.dueAtExact)return null;
  return {item,marker,message};
}

/** Called inside the existing tenant lock and owned outbox FOR UPDATE transaction.
 * An attempted job never enters here; its only operation is keyed status.
 * No externally supplied context, actor, recipient, clock or retry authority. */
export async function checkReminderDispatch(c,{org,row,owner,settings}){
  if(row.intent_kind!=="reminder"||row.state!=="leased"||row.first_attempt_at||row.lease_owner!==owner)return null;
  let context,binding;
  try{
    context=await readReminderWorkerContext(c,{org,outboxId:row.id,settings});
    binding=currentBinding(row,context,org,settings);
  }catch(error){
    if(error?.status>=400&&error.status<500)return cancel(c,org,row,owner);
    throw error;
  }
  if(!binding)return cancel(c,org,row,owner);
  const reason=participationDeliveryGate(settings,binding.item.recipient.email);
  const clock=(await c.query(REMINDER_FIRST_ATTEMPT_SQL,[org,row.id,owner,binding.marker.dueAtExact,binding.marker.range.startAt,reason===null])).rows;
  if(!Array.isArray(clock)||clock.length!==1)bad();
  const value=clock[0];
  try{validateGroupExactStamp(value.at_exact);}catch{bad();}
  if(typeof value.is_due!=="boolean"||typeof value.before_start!=="boolean"||typeof value.attempted!=="boolean")bad();
  const window=reminderWindow(binding.item.commitment,value.at_exact,"dispatch");
  if(value.is_due!==(window.reason!=="not-due")||value.before_start!==(window.reason!=="window-closed")||
      (value.attempted&&(!window.eligible||reason!==null)))bad();
  if(window.reason==="window-closed")return cancel(c,org,row,owner,"reminder_window_closed");
  if(window.reason==="not-due")return defer(c,org,row,owner,window,value.at_exact,"reminder_not_due");
  if(reason)return defer(c,org,row,owner,window,value.at_exact,reason==="service_disabled"?"participation_disabled":reason);
  if(!value.attempted)return null;
  return {job:row,message:binding.message};
}
