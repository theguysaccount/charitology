/** Same-client, private pending offers. No route, delivery or booking write. */
import { isProxy } from "node:util/types";
import { modulePermissions } from "./modules.mjs";
import { allRecords, PREVIEW_LIMITS } from "./database.mjs";
import { currentGroupMember, groupRestoreEpoch } from "./participation-group-access.mjs";
import { groupHash, validateGroupExactStamp } from "./participation-group-model.mjs";
import { participationTerms, readParticipationDomainClock, readVolunteerSubstitutionRoster } from "./participation.mjs";
import { frozenParticipationInterval } from "./participation-intervals.mjs";
import { fail, hash, id } from "./security.mjs";
import { requireVolunteerSubstitutionAccess } from "./volunteer-substitution-schema.mjs";
import { consumeVolunteerSubstitutionFreshWrite } from "./volunteer-substitution-rate.mjs";
import { refuseProtectedVolunteerOrientation } from "./volunteer-orientation-marker.mjs";

export const VOLUNTEER_SUBSTITUTION_OFFER_KIND = "volunteer-substitution-offer-v1";
const FORMAT = "charitology-volunteer-substitution-offer";
const MAX_OFFER_BYTES = 2048, PRUNE_BATCH = 32, MAX_LIFETIME_MICROS = 600000000n;
const KIND = VOLUNTEER_SUBSTITUTION_OFFER_KIND;
const ID = /^[A-Za-z0-9_-]{1,100}$/, INTENT = /^[a-f0-9]{32}$/, SHA = /^[a-f0-9]{64}$/;
const SELECTOR = ["orgId","party","shiftId","shiftRevision","participationId","participationRevision","userId","intakeId",
  "linkId","linkRevision","personIdentitySha256","linkScopeSha256","commitmentSha256"];
const PACKET = ["format","version","state","orgId","intentId","shiftId","shiftRevision","outgoing","replacement",
  "scopeSha256","issuerMembershipSha256","issuedAtExact","expiresAtExact"];
const ROW = ["org_id","id","actor_id","kind","payload","checksum","base_revision","issued_exact","expires_exact","committed"];
const sql6 = column => `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const projection = `p.org_id,p.id,p.actor_id,p.kind,p.payload,p.checksum,p.base_revision,
  ${sql6("p.created_at")} AS issued_exact,${sql6("p.expires_at")} AS expires_exact,(p.committed_at IS NOT NULL) AS committed`;
const current = "p.org_id=$1 AND p.kind=$2 AND p.committed_at IS NULL AND p.expires_at>clock_timestamp()";
const graphSql = `SELECT p.id,p.revision,p.state,p.source,p.recovered,p.requested_interval,p.frozen,p.consent,
  p.contact_id,p.booking_record_id,p.intake_id,t.revision AS target_revision,t.source_revision,t.mode,t.recovery_block,t.terms,t.terms_hash,
  s.id AS shift_id,s.revision AS shift_revision,s.data AS shift_data,s.status AS shift_status,s.approval AS shift_approval,
  s.last_editor_id AS shift_editor,b.status AS assignment_status,b.revision AS assignment_revision,
  b.approval AS assignment_approval,b.last_editor_id AS assignment_editor,b.data->>'programId' AS assignment_program,
  EXISTS(SELECT 1 FROM os_participation_groups g WHERE g.org_id=p.org_id AND g.live_target_id=p.target_id
    AND g.origin_mode='live' AND g.roster_ids ? p.id) AS group_linked,
  EXISTS(SELECT 1 FROM os_participation_checkins k WHERE k.org_id=p.org_id AND k.origin_mode='live'
    AND k.live_participation_id=p.id) AS checked_in,
  encode(sha256(convert_to(jsonb_build_array(to_jsonb(p),to_jsonb(t),to_jsonb(s),to_jsonb(b),
    jsonb_build_array(k.id,k.revision,${sql6("k.created_at")}),jsonb_build_array(i.id,i.revision,${sql6("i.created_at")}),
    jsonb_build_array(f.id,f.target_revision,${sql6("f.created_at")}))::text,'UTF8')),'hex') AS source_pin
  FROM os_participations p
  JOIN os_participation_targets t ON t.org_id=p.org_id AND t.target_id=p.target_id AND t.module_id='volunteers'
  JOIN os_records s ON s.org_id=t.org_id AND s.id=t.target_id AND s.module_id='volunteers' AND s.deleted_at IS NULL
  JOIN os_records b ON b.org_id=p.org_id AND b.id=p.booking_record_id AND b.module_id='volunteers' AND b.deleted_at IS NULL
  JOIN os_records k ON k.org_id=p.org_id AND k.id=p.contact_id AND k.module_id='contacts' AND k.deleted_at IS NULL
  JOIN os_intake i ON i.org_id=p.org_id AND i.id=p.intake_id AND i.status='converted'
    AND i.cancelled_at IS NULL AND i.erased_at IS NULL
  JOIN os_publications f ON f.org_id=i.org_id AND f.id=i.publication_id AND f.kind='volunteer-interest'
    AND f.target_module='volunteers' AND f.target_id=s.id
  WHERE p.org_id=$1 AND p.target_id=$2 AND p.id=ANY($3::text[]) AND p.module_id='volunteers'
    AND b.data->>'kind'='assignment' AND b.data->>'shiftId'=s.id AND b.data->>'contactId'=k.id
    AND i.converted_ids @> jsonb_build_array(jsonb_build_object('id',b.id,'moduleId','volunteers'),
      jsonb_build_object('id',k.id,'moduleId','contacts'))
  ORDER BY p.id COLLATE "C" LIMIT 3`;
const ownLookup = `SELECT ${projection} FROM os_previews p WHERE ${current}
  AND (p.payload#>>'{outgoing,id}'=$3 OR p.payload#>>'{replacement,id}'=$3) ORDER BY p.id COLLATE "C" LIMIT 2`;
const staffOverlap = `SELECT ${projection} FROM os_previews p WHERE ${current}
  AND (p.payload#>>'{outgoing,id}'=ANY($3::text[]) OR p.payload#>>'{replacement,id}'=ANY($3::text[]))
  ORDER BY p.id COLLATE "C" LIMIT 2`;
const firstSavedWaitlist = `SELECT * FROM os_participations WHERE org_id=$1 AND target_id=$2
  AND state='waitlisted' AND NOT recovered ORDER BY waitlist_sequence NULLS LAST,created_at,id LIMIT 1`;
const pruneSql = `DELETE FROM os_previews p WHERE p.org_id=$1 AND p.kind=$2 AND p.committed_at IS NULL
  AND p.expires_at<=clock_timestamp() AND p.id IN
  (SELECT id FROM os_previews WHERE org_id=$1 AND kind=$2 AND committed_at IS NULL AND expires_at<=clock_timestamp()
   ORDER BY expires_at,id LIMIT $3)`;
const insertSql = `INSERT INTO os_previews AS p(org_id,id,actor_id,kind,payload,checksum,base_revision,created_at,expires_at)
  SELECT $1,$2,$3,$4,$5::jsonb,$6,$7,$8::timestamptz,$9::timestamptz
  WHERE $8::timestamptz>=transaction_timestamp() AND $9::timestamptz>clock_timestamp()
  AND (SELECT count(*) FROM os_previews q WHERE q.org_id=$1 AND q.committed_at IS NULL
    AND q.expires_at>clock_timestamp())<$10
  AND NOT EXISTS (SELECT 1 FROM os_previews q WHERE q.org_id=$1 AND q.kind=$4 AND q.committed_at IS NULL
    AND q.expires_at>clock_timestamp() AND (q.payload#>>'{outgoing,id}'=ANY($11::text[]) OR q.payload#>>'{replacement,id}'=ANY($11::text[])))
  RETURNING ${projection}`;

const unavailable = () => fail(404,"substitution_offer_unavailable","This shift substitution offer is unavailable.");
const stale = () => fail(409,"substitution_offer_changed","Review the current shift and saved waitlist again.");
const invalid = () => fail(422,"substitution_offer_fields","Use the exact shift substitution offer selectors.");
const full = () => fail(409,"substitution_offer_pending","An offer already uses one of these places or the workspace pending limit is full.");
const need = (test, reject = unavailable) => { if (!test) reject(); };
const match = (value, regex) => typeof value === "string" && value.length <= 100 && regex.test(value);
const revision = value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
const sameLeg = (left,right) => left.id === right.id && left.revision === right.revision;
const exactRangeTime = value => new Date(value).toISOString().slice(0,-1)+"000Z";
const staffLabel = (value, fallback) =>
  typeof value === "string" && value.trim() && value.length <= 180 ? value : fallback;
function fields(value, keys, reject = invalid) {
  need(value && typeof value === "object" && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).length === keys.length, reject);
  return Object.fromEntries(keys.map(key => {
    const item = Object.getOwnPropertyDescriptor(value,key);
    need(item?.enumerable && Object.hasOwn(item,"value"),reject);
    return [key,item.value];
  }));
}
function exactTime(value, reject = invalid) {
  try { return validateGroupExactStamp(value); }
  catch { reject(); }
}
function micros(value) {
  return BigInt(Date.parse(value.slice(0,23)+"Z"))*1000n+BigInt(value.slice(23,26));
}
function resultRows(result, max) {
  need(Array.isArray(result?.rows) && result.rowCount === result.rows.length && result.rows.length <= max);
  return result.rows;
}
function leg(raw, reject = invalid) {
  const value = fields(raw,["id","revision"],reject);
  need(match(value.id,ID) && revision(value.revision),reject);
  return Object.freeze(value);
}
function packet(raw) {
  const p = fields(raw,PACKET,unavailable);
  need(p.format === FORMAT && p.version === 1 && p.state === "pending" && match(p.orgId,ID) && match(p.intentId,INTENT) &&
    match(p.shiftId,ID) && revision(p.shiftRevision) && match(p.scopeSha256,SHA) && match(p.issuerMembershipSha256,SHA));
  p.outgoing = leg(p.outgoing,unavailable);
  p.replacement = leg(p.replacement,unavailable);
  need(p.outgoing.id !== p.replacement.id);
  const issued = exactTime(p.issuedAtExact,unavailable), expires = exactTime(p.expiresAtExact,unavailable);
  const duration = micros(expires)-micros(issued);
  need(duration > 0n && duration <= MAX_LIFETIME_MICROS && Buffer.byteLength(JSON.stringify(p)) <= MAX_OFFER_BYTES);
  return Object.freeze(p);
}
function rowOf(raw, orgId) {
  const r = fields(raw,ROW,unavailable), p = packet(r.payload);
  need(r.org_id === orgId && p.orgId === orgId && r.id === p.intentId && r.kind === KIND && match(r.actor_id,ID) &&
    r.base_revision === p.scopeSha256 && r.checksum === hash(p) && r.issued_exact === p.issuedAtExact &&
    r.expires_exact === p.expiresAtExact && r.committed === false);
  return { actorId:r.actor_id, offer:p };
}
const approves = (approval, rev, editor) => approval?.status === "approved" && approval.revision === rev &&
  match(approval.actorId,ID) && approval.actorId !== editor;
const sameRange = (left,right) => ["startAt","endAt","timeZone"].every(key => left[key] === right[key]);
async function currentActor(c, orgId, userId) {
  const [row] = resultRows(await c.query(
    "SELECT current_setting('app.org_id',true)=$1 AND current_setting('app.user_id',true)=$2 AS matches",
    [orgId,userId]),1);
  need(row?.matches === true);
}
async function readGraph(c, p, write, changed = stale) {
  await c.query("SET LOCAL TIME ZONE 'UTC'");
  const ids = [p.outgoing.id,p.replacement.id];
  const rows = resultRows(await c.query(graphSql+(write?" FOR SHARE OF p,t,s,b,k,i,f":""),[p.orgId,p.shiftId,ids]),2);
  const outgoing = rows.find(row => row.id === p.outgoing.id), replacement = rows.find(row => row.id === p.replacement.id);
  need(outgoing && replacement,changed);
  const ready = (row, leg, state, assignment) => row.id === leg.id && row.revision === leg.revision &&
    row.revision < 2147483647 && revision(row.assignment_revision) && row.assignment_revision < 2147483647 &&
    row.shift_id === p.shiftId && row.shift_revision === p.shiftRevision && row.source_revision === p.shiftRevision &&
    row.shift_status === "open" && approves(row.shift_approval,row.shift_revision,row.shift_editor) &&
    row.assignment_status === assignment && approves(row.assignment_approval,row.assignment_revision,row.assignment_editor) &&
    row.mode === "managed" && row.recovery_block === false && row.source === "intake" && row.recovered === false &&
    row.requested_interval === null && row.state === state && row.group_linked === false && row.checked_in === false &&
    (row.shift_data?.programId || null) === (row.assignment_program || null) && match(row.source_pin,SHA);
  need(ready(outgoing,p.outgoing,"confirmed","assigned") && ready(replacement,p.replacement,"waitlisted","approved") &&
    outgoing.contact_id !== replacement.contact_id && outgoing.intake_id !== replacement.intake_id,changed);
  let terms, range;
  try {
    terms = participationTerms({id:p.shiftId,orgId:p.orgId,moduleId:"volunteers",data:outgoing.shift_data});
    range = frozenParticipationInterval({module_id:"volunteers",frozen:outgoing.frozen,requested_interval:null});
  } catch { changed(); }
  const termsHash = hash(terms);
  need(Number.isSafeInteger(outgoing.shift_data.capacity) && outgoing.shift_data.capacity > 0 &&
    outgoing.terms_hash === termsHash && replacement.terms_hash === termsHash && hash(outgoing.terms) === termsHash &&
    outgoing.frozen?.sourceRevision === p.shiftRevision && outgoing.frozen?.termsHash === termsHash &&
    hash(outgoing.frozen.terms) === termsHash && sameRange(range,terms) &&
    (outgoing.frozen.programId || null) === (outgoing.shift_data.programId || null) &&
    replacement.frozen === null && replacement.consent?.waitlistAllowed === true &&
    replacement.consent?.sourceRevision === p.shiftRevision && replacement.consent?.termsHash === termsHash,changed);
  // The offer uses the first saved active queue entry. A possibly ineligible
  // earlier entry must be reconciled before this finite path may invite later.
  const [first] = resultRows(await c.query(firstSavedWaitlist,[p.orgId,p.shiftId]),1);
  need(first?.id === replacement.id,changed);
  const sources = [p.shiftId,outgoing.booking_record_id,replacement.booking_record_id,outgoing.contact_id,replacement.contact_id];
  need(sources.every(value=>match(value,ID)) && new Set(sources).size === sources.length,changed);
  const epoch = await groupRestoreEpoch(c,p.orgId,sources);
  const scopeSha256 = hash(["volunteer-substitution-offer-v1",p.orgId,p.shiftId,p.shiftRevision,
    outgoing.source_pin,replacement.source_pin,epoch]);
  const startsAtExact = exactRangeTime(terms.startAt);
  return {scopeSha256,startsAtExact};
}
function selectorOf(raw) {
  const s = fields(raw,SELECTOR,unavailable);
  need(["orgId","shiftId","participationId","userId","intakeId"].every(key=>match(s[key],ID)) &&
    ["shiftRevision","participationRevision","linkRevision"].every(key=>revision(s[key])) &&
    ["personIdentitySha256","linkScopeSha256","commitmentSha256"].every(key=>match(s[key],SHA)) &&
    match(s.linkId,INTENT) && ["leaving","joining"].includes(s.party));
  return s;
}
async function requireCurrentIssuer(c, row) {
  const [member] = resultRows(await c.query(`SELECT user_id,role,program_ids,revision,${sql6("created_at")} AS created_exact
    FROM os_members WHERE org_id=$1 AND user_id=$2`,[row.offer.orgId,row.actorId]),1);
  need(member?.user_id === row.actorId && Array.isArray(member.program_ids) && member.program_ids.length === 0 &&
    revision(member.revision) && typeof member.role === "string");
  const permitted = modulePermissions("volunteers",member.role);
  need(permitted.read && permitted.write);
  const membership = groupHash("membership",{userId:member.user_id,role:member.role,programIds:[],
    revision:member.revision,createdAtExact:exactTime(member.created_exact,unavailable)});
  need(membership === row.offer.issuerMembershipSha256);
}

async function currentStaff(c,orgId,session,readOnly) {
  const member = await currentGroupMember(c,orgId,session,{moduleId:"volunteers",readOnly});
  if (member.programIds.length !== 0) fail(403,"substitution_offer_staff","Whole-workspace Volunteers access is required.");
  await currentActor(c,orgId,member.userId);
  await requireVolunteerSubstitutionAccess(c);
  return member;
}

/** Read the first saved candidate with the outgoing place excluded from the
 * allocation check. Return only the fields already available to this staff
 * member in Volunteers, plus their own still-current offer if one exists. */
export async function readVolunteerSubstitutionOptions(c, raw) {
  const {orgId,session,shiftId,outgoingId} = fields(raw,["orgId","session","shiftId","outgoingId"]);
  need([orgId,shiftId,outgoingId].every(value=>match(value,ID)),invalid);
  const member = await currentStaff(c,orgId,session,true);
  const [account] = resultRows(await c.query('SELECT "emailVerified" AS verified FROM "user" WHERE id=$1',[member.userId]),1);
  if (account?.verified !== true) fail(401,"session","Sign in again before continuing.");
  const [outgoing] = resultRows(await c.query(`SELECT * FROM os_participations WHERE org_id=$1 AND target_id=$2
    AND id=$3 AND module_id='volunteers' AND state='confirmed' AND source='intake'
    AND requested_interval IS NULL AND NOT recovered`,[orgId,shiftId,outgoingId]),1);
  need(outgoing);
  const [t] = resultRows(await c.query(`SELECT * FROM os_participation_targets WHERE org_id=$1
    AND target_id=$2 AND module_id='volunteers'`,[orgId,shiftId]),1);
  const records = await allRecords(c,orgId), source = records.find(record=>record.id===shiftId);
  const outgoingAssignment = records.find(record=>record.id===outgoing.booking_record_id);
  need(t?.mode==="managed" && t.recovery_block===false && source?.moduleId==="volunteers" &&
    source.data.kind==="shift" && source.status==="open" && source.revision===t.source_revision &&
    outgoingAssignment?.moduleId==="volunteers" && outgoingAssignment.data.kind==="assignment" &&
    outgoingAssignment.data.shiftId===shiftId && outgoingAssignment.data.contactId===outgoing.contact_id &&
    outgoingAssignment.status==="assigned" && revision(outgoing.revision));
  await refuseProtectedVolunteerOrientation(c, orgId, source);
  const terms = participationTerms(source);
  const startsAt = exactRangeTime(terms.startAt), endsAt = exactRangeTime(terms.endAt);
  const serverClock = await readParticipationDomainClock(c);
  need(serverClock.atExact < startsAt,stale);
  const options = {version:1,shift:{id:source.id,revision:source.revision,
    title:staffLabel(source.data.title,"Volunteer shift"),startsAt,endsAt,timeZone:terms.timeZone},
    outgoing:{id:outgoing.id,revision:outgoing.revision,label:staffLabel(outgoingAssignment.data.title,"Volunteer assignment")},
    replacement:null,offer:null};
  const [replacement] = resultRows(await c.query(firstSavedWaitlist,[orgId,shiftId]),1);
  if (!replacement || !revision(replacement.revision)) return options;
  const pair = {orgId,shiftId,shiftRevision:source.revision,
    outgoing:{id:outgoing.id,revision:outgoing.revision},replacement:{id:replacement.id,revision:replacement.revision}};
  const assignment = records.find(record=>record.id===replacement.booking_record_id);
  let graph;
  try {
    graph = await readGraph(c,pair,false);
    const roster = await readVolunteerSubstitutionRoster(c,{orgId,userId:member.userId},
      {member,source,t,records,outgoing,replacement,serverClock});
    if (roster.nextEligibleId!==replacement.id || roster.replacementOverlap || roster.outgoingCheckedIn)
      return options;
  } catch (error) {
    if (["substitution_offer_changed","substitution_stale","participation_capacity","participation_interval",
      "participation_terms","participation_recovered","participation_target"].includes(error?.code)) return options;
    throw error;
  }
  const pending = resultRows(await c.query(staffOverlap,[orgId,KIND,[outgoing.id,replacement.id]]),2);
  if (pending.length) {
    if (pending.length !== 1) return options;
    const {actorId,offer} = rowOf(pending[0],orgId);
    if (actorId!==member.userId || offer.issuerMembershipSha256!==member.membershipSha256 ||
        offer.scopeSha256!==graph.scopeSha256 || offer.shiftId!==shiftId || offer.shiftRevision!==source.revision ||
        !sameLeg(offer.outgoing,pair.outgoing) || !sameLeg(offer.replacement,pair.replacement) ||
        !(offer.issuedAtExact<=serverClock.atExact && serverClock.atExact<offer.expiresAtExact &&
          offer.expiresAtExact<=startsAt)) return options;
    options.offer = {version:1,intentId:offer.intentId,expiresAtExact:offer.expiresAtExact};
  }
  options.replacement = {...pair.replacement,label:staffLabel(assignment?.data.title,"Volunteer assignment")};
  return options;
}

/** Trusted staff server entry point. Caller owns the existing tenant lock and
 * write transaction. The issuer never reads or impersonates a participant. */
export async function issueVolunteerSubstitutionOffer(c, raw) {
  const input = fields(raw,["orgId","session","shiftId","shiftRevision","outgoing","replacement"]);
  need(match(input.orgId,ID) && match(input.shiftId,ID) && revision(input.shiftRevision),invalid);
  input.outgoing = leg(input.outgoing);
  input.replacement = leg(input.replacement);
  need(input.outgoing.id !== input.replacement.id,invalid);
  const issuer = await currentStaff(c,input.orgId,input.session,false);
  const graph = await readGraph(c,input,true);
  await refuseProtectedVolunteerOrientation(c, input.orgId, {id: input.shiftId, moduleId: "volunteers"});
  const placeIds = [input.outgoing.id,input.replacement.id];
  const pending = resultRows(await c.query(staffOverlap+" FOR SHARE OF p",[input.orgId,KIND,placeIds]),2);
  const clock = await readParticipationDomainClock(c);
  if (pending.length) {
    need(pending.length === 1,full);
    const {actorId,offer} = rowOf(pending[0],input.orgId);
    need(actorId === issuer.userId && offer.issuerMembershipSha256 === issuer.membershipSha256 &&
      offer.scopeSha256 === graph.scopeSha256 && offer.shiftId === input.shiftId &&
      offer.shiftRevision === input.shiftRevision && sameLeg(offer.outgoing,input.outgoing) &&
      sameLeg(offer.replacement,input.replacement),full);
    need(offer.issuedAtExact <= clock.atExact && clock.atExact < offer.expiresAtExact &&
      offer.expiresAtExact <= graph.startsAtExact,stale);
    return offer;
  }
  const expires = [clock.expiresAtExact,graph.startsAtExact].sort()[0];
  need(clock.atExact < expires,stale);
  await consumeVolunteerSubstitutionFreshWrite(c,{orgId:input.orgId,userId:issuer.userId});
  const offer = packet({format:FORMAT,version:1,state:"pending",orgId:input.orgId,intentId:id(),shiftId:input.shiftId,
    shiftRevision:input.shiftRevision,outgoing:input.outgoing,replacement:input.replacement,scopeSha256:graph.scopeSha256,
    issuerMembershipSha256:issuer.membershipSha256,issuedAtExact:clock.atExact,expiresAtExact:expires});
  await c.query(pruneSql,[offer.orgId,KIND,PRUNE_BATCH]);
  const [written] = resultRows(await c.query(insertSql,[offer.orgId,offer.intentId,issuer.userId,KIND,JSON.stringify(offer),
    hash(offer),offer.scopeSha256,offer.issuedAtExact,offer.expiresAtExact,PREVIEW_LIMITS.pendingCount,
    placeIds]),1);
  need(written,full);
  const retained = rowOf(written,offer.orgId);
  need(retained.actorId === issuer.userId && hash(retained.offer) === hash(offer));
  return retained.offer;
}

/** A later staff decision can load this exact pending scope. This helper
 * proves no participant authority and does not allocate, audit or send. */
export async function readVolunteerSubstitutionOfferForStaff(c, raw) {
  const input = fields(raw,["orgId","intentId","session","readOnly"]);
  need(match(input.orgId,ID) && match(input.intentId,INTENT) && typeof input.readOnly === "boolean",invalid);
  await currentStaff(c,input.orgId,input.session,input.readOnly);
  const sql = `SELECT ${projection} FROM os_previews p WHERE ${current} AND p.id=$3 LIMIT 1`;
  const [found] = resultRows(await c.query(sql+(input.readOnly?"":" FOR SHARE OF p"),
    [input.orgId,KIND,input.intentId]),1);
  need(found);
  const retained = rowOf(found,input.orgId);
  await requireCurrentIssuer(c,retained);
  const graph = await readGraph(c,retained.offer,!input.readOnly);
  await refuseProtectedVolunteerOrientation(c, input.orgId, {id: retained.offer.shiftId, moduleId: "volunteers"});
  const clock = await readParticipationDomainClock(c);
  need(graph.scopeSha256 === retained.offer.scopeSha256 && retained.offer.issuedAtExact <= clock.atExact &&
    clock.atExact < retained.offer.expiresAtExact && retained.offer.expiresAtExact <= graph.startsAtExact,stale);
  return retained.offer;
}

/** The own adapter already proved this exact current account and link. This
 * dependency never reads the link table and returns no counterpart fields. */
export async function readOwnVolunteerSubstitutionOffer(c, raw) {
  const s = selectorOf(raw);
  await currentActor(c,s.orgId,s.userId);
  await requireVolunteerSubstitutionAccess(c);
  const found = resultRows(await c.query(ownLookup,[s.orgId,KIND,s.participationId]),2);
  if (!found.length) return null;
  need(found.length === 1);
  const retained = rowOf(found[0],s.orgId), p = retained.offer;
  const choice = s.party === "leaving" ? p.outgoing : p.replacement;
  need(p.shiftId === s.shiftId && p.shiftRevision === s.shiftRevision &&
    choice.id === s.participationId && choice.revision === s.participationRevision);
  await requireCurrentIssuer(c,retained);
  // Pending offers are not transferable to changed source or restore context.
  const graph = await readGraph(c,p,false,unavailable);
  need(graph.scopeSha256 === p.scopeSha256);
  return Object.freeze({...s,intentId:p.intentId,issuedAtExact:p.issuedAtExact,expiresAtExact:p.expiresAtExact});
}
