/** Pure reminder values only. All IDs, SQL times and authority proofs are caller-supplied.
 * This module cannot authorize a recipient, schedule a job or accept a command. */
import { hash, stable } from "./security.mjs";
import { validInstant, validZone, agreesWithZone } from "./schedule.mjs";
import { ownGroupValue, validateGroupExactStamp } from "./participation-group-model.mjs";
import { validateParticipationReminderTemplate, participationReminderTemplateSha256 } from "./participation-reminder-template.mjs";

export const REMINDER_METHOD = "participation-reminder-v1";
export const REMINDER_CONSENT_VERSION = "participation-reminder-v1";
export const REMINDER_CONSENT_COPY = "Email me one reminder before this confirmed participation starts. I can turn it off here.";
export const REMINDER_LIMITS = Object.freeze({ selection: 20, requestBytes: 16384, packetBytes: 65536,
  receiptBytes: 16384, markerBytes: 2048, pendingReviews: 4, reviewMicroseconds: 600000000,
  leadMicroseconds: 86400000000, horizonMicroseconds: 366 * 86400000000 });
const REVIEW_US = BigInt(REMINDER_LIMITS.reviewMicroseconds), LEAD_US = BigInt(REMINDER_LIMITS.leadMicroseconds), HORIZON_US = BigInt(REMINDER_LIMITS.horizonMicroseconds);
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const KEY = /^[A-Za-z0-9_-]{16,100}$/;
const SHA = /^[a-f0-9]{64}$/;
const AUTHORITY = ["actorSha256", "sessionSha256", "membershipSha256", "memberCreatedAtExact", "restoreEpochSha256"];
const COMMITMENT = ["format", "version", "method", "orgId", "moduleId", "targetId", "participationId", "bookingRecordId", "intakeId", "contactId", "confirmedAtExact", "frozenSourceRevision", "frozenSha256", "frozenTermsSha256", "range"];
const ITEM = ["participationId", "participationRevision", "intakeRevision", "participationSha256", "intakeSha256", "deliveryConsentSha256", "reminderConsentSha256", "recipientBindingSha256", "linkBindingSha256", "commitment", "commitmentSha256", "dueAtExact"];
const PACKET = ["format", "version", "method", "previewId", "orgId", "actorId", "authority", "target", "policy", "template", "templateSha256", "items", "selectionSha256", "reviewSha256", "issuedAtExact", "expiresAtExact"];
const RECEIPT = ["format", "version", "method", "orgId", "previewId", "actorId", "authority", "commandSha256", "requestSha256", "reviewSha256", "acceptedAtExact", "result"];
const RESULT = ["previewId", "scheduledCount", "scheduled"];
const freeze = v => { if (v && typeof v === "object") { for (const c of Object.values(v)) freeze(c); Object.freeze(v); } return v; };
export class ParticipationReminderError extends Error {
  constructor(code = "participation_reminder_fields", status = 422) { super("Use the exact reminder fields and review the current participation."); this.name = "ParticipationReminderError"; this.code = code; this.status = status; }
}
const need = (v, code, status) => { if (!v) throw new ParticipationReminderError(code, status); };
function owned(v, limit = REMINDER_LIMITS.packetBytes) {
  try { return ownGroupValue(v, limit); }
  catch { throw new ParticipationReminderError("participation_reminder_owned"); }
}
const exact = (v, keys) => need(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k)));
const id = v => need(typeof v === "string" && ID.test(v));
const sha = v => need(typeof v === "string" && SHA.test(v));
const revision = v => need(Number.isSafeInteger(v) && v >= 1 && v <= 2147483647);
const moduleId = v => need(v === "events" || v === "volunteers");
function template(v) {
  try { return validateParticipationReminderTemplate(v); }
  catch { throw new ParticipationReminderError("participation_reminder_template"); }
}
function stamp(v) {
  try { validateGroupExactStamp(v); } catch { throw new ParticipationReminderError("participation_reminder_time"); }
  return BigInt(new Date(v.slice(0, 23) + "Z").getTime()) * 1000n + BigInt(v.slice(23, 26));
}
function time(us) {
  let ms = us / 1000n, rem = us % 1000n;
  if (rem < 0) { ms--; rem += 1000n; }
  const wire = new Date(Number(ms)).toISOString();
  const value = wire.slice(0, -1) + String(rem).padStart(3, "0") + "Z";
  stamp(value); return value;
}
function range(v) {
  exact(v, ["startAt", "endAt", "timeZone"]);
  need(validInstant(v.startAt) && validInstant(v.endAt) && validZone(v.timeZone) &&
    agreesWithZone(v.startAt, v.timeZone) && agreesWithZone(v.endAt, v.timeZone), "participation_reminder_range");
  need(Date.parse(v.startAt) < Date.parse(v.endAt), "participation_reminder_range");
}
function domain(kind, value) { return hash({ method: REMINDER_METHOD, kind, value }); }
function header(v, format) { need(v.format === format && v.version === 1 && v.method === REMINDER_METHOD); }
function authority(v, actorId) {
  exact(v, AUTHORITY); for (const k of AUTHORITY.filter(k => k !== "memberCreatedAtExact")) sha(v[k]); stamp(v.memberCreatedAtExact);
  if (actorId !== undefined) need(v.actorSha256 === domain("actor", actorId));
}
export function reminderActorSha256(actorId) { id(actorId); return domain("actor", actorId); }

function commitment(v) {
  exact(v, COMMITMENT); header(v, "charitology-participation-reminder-commitment");
  for (const k of ["orgId", "targetId", "participationId", "bookingRecordId", "intakeId", "contactId"]) id(v[k]);
  moduleId(v.moduleId); stamp(v.confirmedAtExact); revision(v.frozenSourceRevision);
  sha(v.frozenSha256); sha(v.frozenTermsSha256); range(v.range); return v;
}
export function validateReminderCommitment(input) { return commitment(owned(input, REMINDER_LIMITS.requestBytes)); }
export function reminderCommitmentSha256(input) { return domain("original-confirmation", validateReminderCommitment(input)); }

/** Null/off removes authority. Enabled values are data pins, not an own-link proof. */
export function validateReminderPreference(input) {
  if (input === null) return null;
  const v = owned(input, 4096); need(v.version === REMINDER_CONSENT_VERSION && typeof v.enabled === "boolean");
  exact(v, ["version", "enabled", "revision", "atExact", ...(v.enabled ? ["userId", "linkId", "linkRevision", "recipientSha256", "commitmentSha256"] : [])]);
  revision(v.revision); stamp(v.atExact);
  if (v.enabled) { id(v.userId); need(typeof v.linkId === "string" && /^[a-f0-9]{32}$/.test(v.linkId)); revision(v.linkRevision); sha(v.recipientSha256); sha(v.commitmentSha256); }
  return v;
}

/** SQL clock must be supplied by the locked caller. No Date.now/default exists. */
export function reminderWindow(input, serverNowExact, operation) {
  const v = validateReminderCommitment(input), now = stamp(serverNowExact);
  need(operation === "schedule" || operation === "dispatch");
  const start = BigInt(Date.parse(v.range.startAt)) * 1000n, end = BigInt(Date.parse(v.range.endAt)) * 1000n;
  const due = start - LEAD_US;
  const reason = operation === "schedule"
    ? now >= due ? "too-late-to-schedule" : start - now > HORIZON_US ? "beyond-horizon" : null
    : now < due ? "not-due" : now >= start ? "window-closed" : null;
  return Object.freeze({ dueAtExact: time(due), startAtExact: time(start), endAtExact: time(end), eligible: reason === null, reason });
}

export function validateReminderReviewRequest(input) {
  const v = owned(input, REMINDER_LIMITS.requestBytes); exact(v, ["version", "target", "participations"]); need(v.version === 1);
  exact(v.target, ["moduleId", "targetId", "targetRevision", "sourceRevision"]); moduleId(v.target.moduleId); id(v.target.targetId); revision(v.target.targetRevision); revision(v.target.sourceRevision);
  need(Array.isArray(v.participations) && v.participations.length >= 1 && v.participations.length <= REMINDER_LIMITS.selection);
  for (const p of v.participations) { exact(p, ["participationId", "revision", "intakeRevision"]); id(p.participationId); revision(p.revision); revision(p.intakeRevision); }
  need(new Set(v.participations.map(p => p.participationId)).size === v.participations.length);
  return v;
}
export function validateReminderScheduleRequest(input) {
  const v = owned(input, REMINDER_LIMITS.requestBytes); exact(v, ["previewId", "commandKey"]); id(v.previewId); need(typeof v.commandKey === "string" && KEY.test(v.commandKey)); return v;
}
/** Stable key/content pins. Hashes are not authentication. */
export function reminderCommandPins(input) {
  const v = owned(input, REMINDER_LIMITS.requestBytes); exact(v, ["orgId", "actorId", "request"]);
  const { orgId, actorId, request } = v; id(orgId); id(actorId); const value = validateReminderScheduleRequest(request);
  return Object.freeze({ commandSha256: domain("schedule-key", { orgId, actorId, commandKey: value.commandKey }),
    requestSha256: domain("schedule-request", { orgId, actorId, action: "schedule", request: value }) });
}

export function makeReminderIntentMarker(input) {
  const v = owned(input, REMINDER_LIMITS.requestBytes); exact(v, ["commitment", "sourceSha256", "templateSha256"]); const c = commitment(v.commitment);
  sha(v.sourceSha256); sha(v.templateSha256);
  return freeze({ method: REMINDER_METHOD, version: 1, commitmentSha256: reminderCommitmentSha256(c), range: c.range,
    dueAtExact: time(BigInt(Date.parse(c.range.startAt)) * 1000n - LEAD_US), sourceSha256: v.sourceSha256, templateSha256: v.templateSha256 });
}
export function validateReminderIntentMarker(input) {
  const v = owned(input, REMINDER_LIMITS.markerBytes); exact(v, ["method", "version", "commitmentSha256", "range", "dueAtExact", "sourceSha256", "templateSha256"]);
  need(v.method === REMINDER_METHOD && v.version === 1); for (const k of ["commitmentSha256", "sourceSha256", "templateSha256"]) sha(v[k]); range(v.range);
  need(stamp(v.dueAtExact) === BigInt(Date.parse(v.range.startAt)) * 1000n - LEAD_US, "participation_reminder_time"); return v;
}

function item(v, packet) {
  exact(v, ITEM); id(v.participationId); revision(v.participationRevision); revision(v.intakeRevision);
  for (const k of ["participationSha256", "intakeSha256", "deliveryConsentSha256", "reminderConsentSha256", "recipientBindingSha256", "linkBindingSha256", "commitmentSha256"]) sha(v[k]);
  const c = commitment(v.commitment); need(v.participationId === c.participationId && v.commitmentSha256 === reminderCommitmentSha256(c));
  need(c.orgId === packet.orgId && c.moduleId === packet.target.moduleId && c.targetId === packet.target.targetId);
  const w = reminderWindow(c, packet.issuedAtExact, "schedule"); need(w.eligible && v.dueAtExact === w.dueAtExact, "participation_reminder_window");
}
function publicReview(packet) {
  return { template: packet.template, items: packet.items.map(i => ({ participationId: i.participationId, range: i.commitment.range, dueAtExact: i.dueAtExact })), bestEffort: true };
}
function previewBase(v) {
  id(v.previewId); id(v.orgId); id(v.actorId); authority(v.authority, v.actorId);
  exact(v.target, ["moduleId", "targetId", "targetRevision", "sourceRevision", "sourceSha256"]); moduleId(v.target.moduleId); id(v.target.targetId); revision(v.target.targetRevision); revision(v.target.sourceRevision); sha(v.target.sourceSha256);
  exact(v.policy, ["epoch", "revision"]); id(v.policy.epoch); revision(v.policy.revision);
  stamp(v.issuedAtExact); template(v.template);
  need(Array.isArray(v.items) && v.items.length >= 1 && v.items.length <= REMINDER_LIMITS.selection);
  for (const i of v.items) { item(i, v); need(stamp(i.commitment.confirmedAtExact) <= stamp(v.issuedAtExact), "participation_reminder_time"); }
  need(v.items.every((i, n) => n === 0 || v.items[n - 1].participationId < i.participationId), "participation_reminder_selection");
}
function packet(v) {
  exact(v, PACKET); header(v, "charitology-participation-reminder-preview"); previewBase(v);
  need(stamp(v.expiresAtExact) - stamp(v.issuedAtExact) === REVIEW_US, "participation_reminder_time");
  need(v.templateSha256 === participationReminderTemplateSha256(v.template));
  need(v.selectionSha256 === domain("selection", v.items) && v.reviewSha256 === domain("review", publicReview(v))); return v;
}
export function makeReminderPreviewPacket(input) {
  const v = owned(input); exact(v, ["previewId", "orgId", "actorId", "authority", "target", "policy", "template", "items", "issuedAtExact"]);
  previewBase(v);
  const value = { format: "charitology-participation-reminder-preview", version: 1, method: REMINDER_METHOD, ...v,
    templateSha256: participationReminderTemplateSha256(v.template), selectionSha256: domain("selection", v.items),
    reviewSha256: domain("review", publicReview(v)), expiresAtExact: time(stamp(v.issuedAtExact) + REVIEW_US) };
  return freeze(packet(owned(value)));
}
export function validateReminderPreviewPacket(input) { return packet(owned(input)); }
export function reminderPreviewResponse(input) {
  const v = validateReminderPreviewPacket(input);
  return freeze({ ok: true, previewId: v.previewId, expiresAtExact: v.expiresAtExact, review: publicReview(v) });
}
export function validateReminderPreviewResponse(input) {
  const v = owned(input); exact(v, ["ok", "previewId", "expiresAtExact", "review"]); need(v.ok === true); id(v.previewId); stamp(v.expiresAtExact);
  const review = v.review; exact(review, ["template", "items", "bestEffort"]); need(review.bestEffort === true); template(review.template);
  need(Array.isArray(review.items) && review.items.length >= 1 && review.items.length <= REMINDER_LIMITS.selection);
  for (const [n, i] of review.items.entries()) {
    exact(i, ["participationId", "range", "dueAtExact"]); id(i.participationId); range(i.range);
    need(stamp(i.dueAtExact) === BigInt(Date.parse(i.range.startAt)) * 1000n - LEAD_US, "participation_reminder_time");
    need(n === 0 || review.items[n - 1].participationId < i.participationId);
  }
  return v;
}

function result(v) {
  exact(v, RESULT); id(v.previewId); need(Number.isSafeInteger(v.scheduledCount) && v.scheduledCount >= 1 && v.scheduledCount <= REMINDER_LIMITS.selection);
  need(Array.isArray(v.scheduled) && v.scheduled.length === v.scheduledCount);
  const outboxes = new Set();
  for (const [n, row] of v.scheduled.entries()) {
    exact(row, ["participationId", "outboxId", "commitmentSha256", "dueAtExact"]); id(row.participationId); id(row.outboxId); sha(row.commitmentSha256); stamp(row.dueAtExact);
    need(!outboxes.has(row.outboxId) && (n === 0 || v.scheduled[n - 1].participationId < row.participationId)); outboxes.add(row.outboxId);
  }
}
function receipt(v) {
  exact(v, RECEIPT); header(v, "charitology-participation-reminder-receipt"); id(v.orgId); id(v.previewId); id(v.actorId); authority(v.authority, v.actorId);
  for (const k of ["commandSha256", "requestSha256", "reviewSha256"]) sha(v[k]); const at = stamp(v.acceptedAtExact); result(v.result);
  need(v.result.previewId === v.previewId && v.result.scheduled.every(row => at < stamp(row.dueAtExact)), "participation_reminder_time"); return v;
}
/** Candidate value only; trusted caller must prove locked current pins, clock,
 * capacities, actual inserts and accepted receipt atomicity before retention. */
export function makeReminderReceipt(input) {
  const v = owned(input); exact(v, ["packet", "request", "acceptedAtExact", "scheduled"]); const p = packet(v.packet), r = validateReminderScheduleRequest(v.request);
  need(r.previewId === p.previewId && stamp(v.acceptedAtExact) >= stamp(p.issuedAtExact) && stamp(v.acceptedAtExact) < stamp(p.expiresAtExact), "participation_reminder_preview", 409);
  const scheduled = v.scheduled;
  need(Array.isArray(scheduled) && scheduled.length === p.items.length);
  for (let n = 0; n < scheduled.length; n++) { const a = scheduled[n], b = p.items[n];
    need(a && a.participationId === b.participationId && a.commitmentSha256 === b.commitmentSha256 && a.dueAtExact === b.dueAtExact); }
  const pins = reminderCommandPins({ orgId: p.orgId, actorId: p.actorId, request: r });
  return freeze(receipt(owned({ format: "charitology-participation-reminder-receipt", version: 1, method: REMINDER_METHOD,
    orgId: p.orgId, previewId: p.previewId, actorId: p.actorId, authority: p.authority, ...pins,
    reviewSha256: p.reviewSha256, acceptedAtExact: v.acceptedAtExact,
    result: { previewId: p.previewId, scheduledCount: scheduled.length, scheduled } }, REMINDER_LIMITS.receiptBytes)));
}
export function validateReminderReceipt(input) { return receipt(owned(input, REMINDER_LIMITS.receiptBytes)); }
export function reminderAcceptedResponse(input, replayed) {
  const v = validateReminderReceipt(input); need(typeof replayed === "boolean"); return freeze({ ok: true, ...v.result, replayed });
}
export function validateReminderAcceptedResponse(input) {
  const v = owned(input, REMINDER_LIMITS.receiptBytes); exact(v, ["ok", ...RESULT, "replayed"]); need(v.ok === true && typeof v.replayed === "boolean");
  result({ previewId: v.previewId, scheduledCount: v.scheduledCount, scheduled: v.scheduled }); return v;
}
