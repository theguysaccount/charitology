/** Own choice only. Mount after the exact-offer issuer and choice store compose. */
import { createHmac } from "node:crypto";
import { isProxy } from "node:util/types";
import { readBackupBody } from "./backup-json.mjs";
import { participantEmail, participantQuery, verifiedParticipant } from "./participants.mjs";
import { participationTerms, readParticipationDomainClock } from "./participation.mjs";
import { validateGroupExactStamp } from "./participation-group-model.mjs";
import { frozenParticipationInterval } from "./participation-intervals.mjs";
import { checkCsrf, equal, fail, hash, json, stable } from "./security.mjs";
import { noteParticipationReceiptReplay, noteVolunteerSubstitutionWithdrawal } from "./database.mjs";
import { refuseProtectedVolunteerOrientation, volunteerOrientationForTarget } from "./volunteer-orientation-marker.mjs";

const PATH = /^\/api\/participant\/orgs\/([A-Za-z0-9_-]{1,100})\/requests\/([A-Za-z0-9_-]{1,100})\/participations\/([A-Za-z0-9_-]{1,100})\/substitution-choice$/;
const ID = /^[A-Za-z0-9_-]{1,100}$/, LINK = /^[a-f0-9]{32}$/, SHA = /^[a-f0-9]{64}$/;
const MAX_REVISION = 2147483647, REQUEST_BYTES = 2048;
const revision = value => Number.isInteger(value) && value >= 1 && value <= MAX_REVISION;
const matches = (regex, value) => typeof value === "string" && regex.test(value);
const unavailable = () => fail(404, "substitution_unavailable", "This shift substitution choice is unavailable.");
const stale = () => fail(409, "substitution_choice_changed", "Review the current shift substitution choice again.");
const fields = () => fail(422, "substitution_choice_fields", "Use the documented shift substitution choice fields.");
const okay = (choice, replayed = false) =>
  json({ ok: true, choice, replayed }, 200, { "referrer-policy": "no-referrer" });
const same = (row, keys) => Object.entries(keys).every(([key, value]) => row[key] === value);
const sqlExact = column => `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export const VOLUNTEER_SUBSTITUTION_OWN_SQL = Object.freeze({
  session: 'SELECT s.id AS session_id,s."userId" AS user_id,u.email,u."emailVerified" AS verified FROM "session" s JOIN "user" u ON u.id=s."userId" WHERE s.id=$1 AND u.id=$2 AND s."expiresAt">clock_timestamp()',
  index: "SELECT id FROM os_participant_links WHERE user_id=$1 AND org_id=$2 AND intake_id=$3 AND revoked_at IS NULL",
  link: `SELECT l.id AS link_id,l.revision AS link_revision,${sqlExact("l.created_at")} AS link_created_exact,
       i.id AS intake_id,i.revision AS intake_revision,i.publication_id,
       i.answers->>'email' AS intake_email,${sqlExact("i.created_at")} AS intake_created_exact,
       to_jsonb(p) AS participation,${sqlExact("p.created_at")} AS participation_created_exact,
       to_jsonb(t) AS target,${sqlExact("t.created_at")} AS target_created_exact,
       s.id AS shift_id,s.revision AS shift_revision,s.status AS shift_status,s.data AS shift_data,
       s.approval AS shift_approval,s.last_editor_id AS shift_editor,${sqlExact("s.created_at")} AS shift_created_exact,
       b.id AS assignment_id,b.revision AS assignment_revision,b.status AS assignment_status,b.approval AS assignment_approval,
       b.last_editor_id AS assignment_editor,b.data->>'programId' AS assignment_program,
       ${sqlExact("b.created_at")} AS assignment_created_exact,
       EXISTS (SELECT 1 FROM os_participation_groups g WHERE g.org_id=l.org_id
               AND g.live_target_id=p.target_id AND g.origin_mode='live' AND g.roster_ids ? p.id) AS group_linked
FROM os_participant_links l
JOIN os_intake i ON i.org_id=l.org_id AND i.id=l.intake_id AND i.publication_id=l.publication_id
JOIN os_publications f ON f.org_id=i.org_id AND f.id=i.publication_id
JOIN os_participations p ON p.org_id=i.org_id AND p.intake_id=i.id AND p.id=$4
JOIN os_participation_targets t ON t.org_id=p.org_id AND t.target_id=p.target_id AND t.module_id='volunteers'
JOIN os_records s ON s.org_id=t.org_id AND s.id=t.target_id AND s.module_id='volunteers' AND s.deleted_at IS NULL
JOIN os_records b ON b.org_id=p.org_id AND b.id=p.booking_record_id AND b.module_id='volunteers' AND b.deleted_at IS NULL
JOIN os_records k ON k.org_id=p.org_id AND k.id=p.contact_id AND k.module_id='contacts' AND k.deleted_at IS NULL
WHERE l.user_id=$1 AND l.org_id=$2 AND l.intake_id=$3 AND l.revoked_at IS NULL
  AND i.status='converted' AND i.erased_at IS NULL AND i.cancelled_at IS NULL
  AND i.converted_ids @> jsonb_build_array(jsonb_build_object('id',b.id,'moduleId','volunteers'),
                                          jsonb_build_object('id',k.id,'moduleId','contacts'))
  AND f.kind='volunteer-interest' AND f.target_module='volunteers' AND f.target_id=s.id
  AND p.module_id='volunteers' AND b.data->>'kind'='assignment'
  AND b.data->>'shiftId'=s.id AND b.data->>'contactId'=k.id`,
});

function exact(value, keys, refuse = unavailable) {
  if (!value || typeof value !== "object" || isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype)
    refuse();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length ||
      keys.some(key => !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], "value"))) refuse();
}
function stamp(value) {
  try { return validateGroupExactStamp(value); }
  catch { unavailable(); }
}
function keyed(secret, domain, value) {
  if (typeof secret !== "string" || secret.length < 32)
    fail(503, "substitution_unavailable", "Shift substitution choices are currently unavailable.");
  return createHmac("sha256", secret).update(stable(["volunteer-substitution-own-v1", domain, value])).digest("hex");
}
const IDENTITY_KEYS = ["orgId", "userId", "email", "intakeId", "intakeRevision", "intakeCreatedAtExact",
  "publicationId", "participationId", "participationRevision", "participationCreatedAtExact",
  "linkId", "linkRevision", "linkCreatedAtExact"];

/** Derive both from trusted current SQL facts, never from a proposed browser identity. */
export function volunteerSubstitutionLinkIdentity(secret, value) {
  exact(value, IDENTITY_KEYS);
  if (!["orgId", "userId", "intakeId", "publicationId", "participationId"].every(key => matches(ID, value[key])) ||
      !matches(LINK, value.linkId) || !["intakeRevision", "participationRevision", "linkRevision"].every(key => revision(value[key])) ||
      !value.email || participantEmail(value.email) !== value.email) unavailable();
  for (const key of ["intakeCreatedAtExact", "participationCreatedAtExact", "linkCreatedAtExact"]) stamp(value[key]);
  return Object.freeze({
    personIdentitySha256: keyed(secret, "verified-account", [value.orgId, value.userId]),
    linkScopeSha256: keyed(secret, "own-link", value),
  });
}

async function currentSession(c, actor, sessionId, write = false) {
  const { rows } = await c.query(VOLUNTEER_SUBSTITUTION_OWN_SQL.session + (write ? " FOR SHARE OF s,u" : ""), [sessionId, actor.id]);
  const row = rows[0];
  if (rows.length !== 1 || !same(row, { session_id: sessionId, user_id: actor.id }))
    fail(401, "session", "Sign in again before reviewing this choice.");
  if (row.verified !== true || participantEmail(row.email) !== actor.email)
    fail(403, "participant_verification", "Use the current verified sign-in email.");
}
function approved(approval, revisionValue, editor) {
  return approval?.status === "approved" && approval.revision === revisionValue &&
    matches(ID, approval.actorId) && approval.actorId !== editor;
}
function fullShift(row, terms, termsHash) {
  const p = row.participation;
  if (p.state === "waitlisted") {
    return p.frozen === null && p.consent?.waitlistAllowed === true &&
      p.consent.sourceRevision === row.shift_revision && p.consent.termsHash === termsHash;
  }
  if (!p.frozen?.terms || p.frozen.sourceRevision !== row.shift_revision || p.frozen.termsHash !== termsHash ||
      hash(p.frozen.terms) !== termsHash || (p.frozen.programId || null) !== (row.shift_data.programId || null))
    return false;
  try {
    const range = frozenParticipationInterval(p);
    return same(range, { startAt: terms.startAt, endAt: terms.endAt, timeZone: terms.timeZone });
  } catch { return false; }
}
async function currentContext(c, { orgId, intakeId, participationId, actor, linkId, secret, write }) {
  const { rows } = await c.query(
    VOLUNTEER_SUBSTITUTION_OWN_SQL.link + (write ? " FOR UPDATE OF l,i,p FOR SHARE OF f,t,s,b,k" : ""),
    [actor.id, orgId, intakeId, participationId],
  );
  const row = rows[0];
  if (rows.length !== 1 || row.link_id !== linkId || row.intake_id !== intakeId ||
      participantEmail(row.intake_email) !== actor.email) unavailable();
  const p = row.participation, t = row.target;
  if (!p || !t || !same(p, { org_id: orgId, id: participationId, intake_id: intakeId, target_id: row.shift_id,
    booking_record_id: row.assignment_id, module_id: "volunteers", recovered: false, requested_interval: null }) ||
    !same(t, { org_id: orgId, target_id: row.shift_id, module_id: "volunteers", mode: "managed",
      recovery_block: false, source_revision: row.shift_revision }) ||
    p.source !== "intake" || row.group_linked !== false ||
    !["confirmed", "waitlisted"].includes(p.state) || row.shift_status !== "open" ||
    row.assignment_status !== (p.state === "confirmed" ? "assigned" : "approved") ||
    ![p.revision, t.revision, row.shift_revision, row.assignment_revision].every(revision) ||
    p.revision === MAX_REVISION || row.assignment_revision === MAX_REVISION ||
    ![row.shift_id, row.assignment_id, p.contact_id].every(id => matches(ID, id)) ||
    !approved(row.shift_approval, row.shift_revision, row.shift_editor) ||
    !approved(row.assignment_approval, row.assignment_revision, row.assignment_editor) ||
    !Number.isSafeInteger(row.shift_data?.capacity) || row.shift_data.capacity < 1 ||
    (row.shift_data.programId || null) !== (row.assignment_program || null)) unavailable();
  const shift = { id: row.shift_id, orgId, moduleId: "volunteers", data: row.shift_data };
  let terms;
  try { terms = participationTerms(shift); } catch { unavailable(); }
  const termsHash = hash(terms);
  if (!t.terms || t.terms_hash !== termsHash || hash(t.terms) !== termsHash || !fullShift(row, terms, termsHash))
    unavailable();
  const identity = volunteerSubstitutionLinkIdentity(secret, { orgId, userId: actor.id, email: actor.email,
    intakeId, intakeRevision: row.intake_revision, intakeCreatedAtExact: row.intake_created_exact,
    publicationId: row.publication_id, participationId, participationRevision: p.revision,
    participationCreatedAtExact: row.participation_created_exact, linkId, linkRevision: row.link_revision,
    linkCreatedAtExact: row.link_created_exact });
  const binding = Object.freeze({ orgId, party: p.state === "confirmed" ? "leaving" : "joining",
    shiftId: row.shift_id, shiftRevision: row.shift_revision, participationId, participationRevision: p.revision,
    userId: actor.id, intakeId, linkId, linkRevision: row.link_revision, ...identity });
  const commitmentSha256 = keyed(secret, "shift-and-assignment", [binding, termsHash, t.revision,
    stamp(row.target_created_exact), stamp(row.shift_created_exact), row.assignment_id, row.assignment_revision,
    stamp(row.assignment_created_exact), p.contact_id, row.shift_approval, row.assignment_approval, p.consent, p.frozen]);
  return { binding, commitmentSha256, terms };
}

function choiceInput(input) {
  exact(input, ["version", "choice", "reviewSha256", "expectedChoiceRevision", "acknowledge"], fields);
  if (input.version !== 1 || !["accept", "withdraw"].includes(input.choice) ||
      !matches(SHA, input.reviewSha256) || input.expectedChoiceRevision !== (input.choice === "accept" ? 0 : 1) ||
      input.acknowledge !== true) fields();
  return input;
}
async function readChoiceInput(request) {
  let input;
  try { input = await readBackupBody(request, REQUEST_BYTES); }
  catch (error) {
    if (error.code === "backup_json") fields();
    if (error.code === "size") fail(413, "size", "This shift substitution choice is too large.");
    throw error;
  }
  return choiceInput(input);
}
function storeChoice(row, binding) {
  if (row === null) return null;
  exact(row, [...Object.keys(binding), "choiceRevision", "acceptedAtExact", "expiresAtExact", "withdrawnAtExact"]);
  if (!same(row, binding) || ![1, 2].includes(row.choiceRevision) ||
      stamp(row.acceptedAtExact) >= stamp(row.expiresAtExact) ||
      (row.choiceRevision === 1 ? row.withdrawnAtExact !== null :
        stamp(row.withdrawnAtExact) < row.acceptedAtExact)) unavailable();
  return row;
}

/**
 * The offer issuer is a trusted server dependency. Its own-only read must
 * return the exact selector plus {intentId, issuedAtExact, expiresAtExact}.
 * A choice is not a booking, and this boundary never reads the counterpart.
 */
export async function participantVolunteerSubstitutionRoutes({
  request, url = new URL(request.url), db, settings, session, readOwnOffer, readChoice, recordChoice, withdrawChoice,
}) {
  const match = PATH.exec(url.pathname);
  if (!match) return null;
  const actor = verifiedParticipant(session), sessionId = session.session.id;
  if (!matches(ID, sessionId)) fail(401, "session", "Sign in again before reviewing this choice.");
  participantQuery(url);
  const write = request.method === "POST";
  if (!write && request.method !== "GET") fail(405, "substitution_method", "Use GET or POST for this shift substitution choice.");
  let input;
  if (write) {
    checkCsrf(request, session, settings);
    if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || ""))
      fail(415, "content_type", "Supply JSON.");
    input = await readChoiceInput(request);
  } else if (request.body !== null || request.headers.has("transfer-encoding") ||
      (request.headers.has("content-length") && request.headers.get("content-length") !== "0")) {
    fail(400, "substitution_body", "Read this choice without a request body.");
  }
  if (![readOwnOffer, readChoice, recordChoice, withdrawChoice].every(operation => typeof operation === "function"))
    fail(503, "substitution_unavailable", "Shift substitution choices are currently unavailable.");
  const [, orgId, intakeId, participationId] = match;
  const linkId = await db.tx(actor.id, null, async c => {
    await currentSession(c, actor, sessionId);
    const { rows } = await c.query(VOLUNTEER_SUBSTITUTION_OWN_SQL.index, [actor.id, orgId, intakeId]);
    if (rows.length !== 1 || !matches(LINK, rows[0].id)) unavailable();
    return rows[0].id;
  }, { readOnly: true });
  return db.tx(actor.id, orgId, async c => {
    await currentSession(c, actor, sessionId, write);
    const { binding, commitmentSha256, terms } = await currentContext(c, {
      orgId, intakeId, participationId, actor, linkId, secret: settings.secret, write,
    });
    const selector = Object.freeze({ ...binding, commitmentSha256 });
    const offer = await readOwnOffer(c, selector);
    exact(offer, [...Object.keys(selector), "intentId", "issuedAtExact", "expiresAtExact"]);
    if (!same(offer, selector) || !matches(ID, offer.intentId)) unavailable();
    const issued = stamp(offer.issuedAtExact), expires = stamp(offer.expiresAtExact);
    const clock = await readParticipationDomainClock(c);
    const starts = new Date(terms.startAt).toISOString().slice(0, -1) + "000Z";
    if (issued > clock.atExact || clock.atExact >= expires || clock.atExact >= starts) unavailable();
    const choiceDeadline = [clock.expiresAtExact, expires, starts].sort()[0];
    const bound = Object.freeze({ ...binding, intentId: offer.intentId });
    const lookup = { orgId, intentId: offer.intentId, party: binding.party };
    const existing = storeChoice(await readChoice(c, lookup), bound);
    if (existing && (existing.acceptedAtExact < issued || existing.acceptedAtExact > clock.atExact ||
        existing.expiresAtExact > choiceDeadline ||
        (existing.withdrawnAtExact !== null && existing.withdrawnAtExact > clock.atExact))) unavailable();
    const review = choiceRevision => keyed(settings.secret, "own-review", [sessionId, offer, choiceRevision]);
    const summary = row => {
      const choiceRevision = row?.choiceRevision ?? 0;
      const expiresAtExact = row?.expiresAtExact ?? null;
      const state = !row ? "unanswered" : row.withdrawnAtExact ? "withdrawn" :
        expiresAtExact <= clock.atExact ? "expired" : "accepted";
      return { version: 1, party: binding.party,
        shift: { title: terms.title, startAt: terms.startAt, endAt: terms.endAt, timeZone: terms.timeZone },
        offerExpiresAtExact: expires, state, choiceRevision, canAccept: state === "unanswered", canWithdraw: state === "accepted",
        acceptedAtExact: row?.acceptedAtExact ?? null, expiresAtExact, withdrawnAtExact: row?.withdrawnAtExact ?? null,
        reviewSha256: review(choiceRevision) };
    };
    const shift = {id: binding.shiftId, moduleId: "volunteers"};
    if (!write) {
      const current = summary(existing);
      if (current.canAccept) {
        try { current.canAccept = !await volunteerOrientationForTarget(c, orgId, shift); }
        catch (error) {
          if (error?.code !== "volunteer_orientation_unavailable") throw error;
          current.canAccept = false;
        }
      }
      return okay(current);
    }
    if (!equal(input.reviewSha256, review(input.expectedChoiceRevision))) stale();
    if (input.choice === "accept") {
      if (existing?.choiceRevision === 1) {
        noteParticipationReceiptReplay(c, orgId);
        return okay(summary(existing), true);
      }
      if (existing) stale();
      await refuseProtectedVolunteerOrientation(c, orgId, shift);
      const saved = storeChoice(await recordChoice(c, { ...bound, acceptedAtExact: clock.atExact,
        expiresAtExact: choiceDeadline }), bound);
      if (saved?.choiceRevision !== 1 || saved.acceptedAtExact !== clock.atExact ||
          saved.expiresAtExact !== choiceDeadline) stale();
      return okay(summary(saved));
    }
    if (existing) {
      if (existing.choiceRevision === 2) {
        noteParticipationReceiptReplay(c, orgId);
        return okay(summary(existing), true);
      }
      if (!summary(existing).canWithdraw) stale();
      const saved = storeChoice(await withdrawChoice(c, { ...lookup, participationId, userId: actor.id,
        linkId, expectedRevision: 1, atExact: clock.atExact }), bound);
      if (saved?.choiceRevision !== 2 || saved.withdrawnAtExact !== clock.atExact ||
          !same(saved, { acceptedAtExact: existing.acceptedAtExact, expiresAtExact: existing.expiresAtExact })) stale();
      noteVolunteerSubstitutionWithdrawal(c, orgId);
      return okay(summary(saved));
    }
    stale();
  }, { lock: true, readOnly: !write });
}
