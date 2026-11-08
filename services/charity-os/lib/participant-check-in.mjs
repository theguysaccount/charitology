/** Own-only unverified arrival, with no allocation/attendance/mail authority. */
import { isProxy } from "node:util/types";
import { id, hash, fail, json, checkCsrf } from "./security.mjs";
import { verifiedParticipant, participantQuery } from "./participants.mjs";
import { allRecords, audit, noteParticipationReceiptReplay } from "./database.mjs";
import { requirePermission, visibleRecord, inScope } from "./access.mjs";
import { parentKey, bookingKind, targetKind } from "./participation-guards.mjs";
import { frozenParticipationInterval } from "./participation-intervals.mjs";
import { readBackupBody } from "./backup-json.mjs";
import { resolveTaskCivil } from "./task-recurrence-model.mjs";
import { CHECK_IN_LIMITS as L, checkInCommitmentSha256, validateReportInput, validateWithdrawalInput,
  currentCheckInDisposition, reportCheckIn, withdrawCheckIn } from "./participant-check-in-model.mjs";
import { checkInParentRows, checkInRecordFromRow, checkInServerClock, insertCheckIn, saveCheckInWithdrawal } from "./participant-check-in-store.mjs";

const ownPath = /^\/api\/participant\/orgs\/([A-Za-z0-9_-]{1,100})\/requests\/([A-Za-z0-9_-]{1,100})\/participations\/([A-Za-z0-9_-]{1,100})\/check-in(?:\/(resolve-arrival|report|withdraw))?$/;
const staffPath = /^participation-targets\/([A-Za-z0-9_-]{1,100})\/participations\/([A-Za-z0-9_-]{1,100})\/check-in$/;
const okay = value => json({ ok: true, ...value }, 200, { "referrer-policy": "no-referrer" });
const unavailable = () => fail(404, "checkin", "This self-report is unavailable.");
const changed = () => fail(409, "checkin_context", "This commitment changed. Review its current state.");
const exact = (v, keys) => {
  if (!v || typeof v !== "object" || isProxy(v) || Object.getPrototypeOf(v) !== Object.prototype) fail(422, "checkin_fields", "Use the documented self-report fields.");
  const descriptors = Object.getOwnPropertyDescriptors(v);
  if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some(k => !descriptors[k]?.enumerable || !Object.hasOwn(descriptors[k], "value"))) fail(422, "checkin_fields", "Use the documented self-report fields.");
};
export const isParticipantCheckInPath = path => ownPath.test(path);
export const readCheckInBody = request => readBackupBody(request, L.requestBytes);
export function checkInSummary(record) {
  if (record === null) return null;
  const h = record.history;
  return { id: h.id, claimedArrivalAt: h.claimedArrivalAt, submittedAt: h.submittedAt,
    withdrawnAt: h.withdrawnAt, claimSha256: h.claimSha256, currentDisposition: currentCheckInDisposition(record) };
}
const replayContext = (org, p) => ({ orgId: org, participationId: p.id, moduleId: p.module_id, bookingRecordId: p.booking_record_id });

/** Only saved originals enter the pure hash. A fixed placeholder is not minted
 * authority: report identity is excluded by the frozen hash-domain contract. */
export function checkInCommitmentContext(org, p, intake) {
  return { id: "unminted_checkin", ...replayContext(org, p), revision: p.revision, intakeRevision: intake.revision,
    frozen: p.frozen, requestedInterval: p.requested_interval ?? null };
}
/** Relationship only: historical reads must survive cancellation/pausing. */
export function checkInRelationships(p, records) {
  const source = records.find(r => r.id === p.target_id), booking = records.find(r => r.id === p.booking_record_id), contact = records.find(r => r.id === p.contact_id);
  return !!(source && booking && contact && ["events", "volunteers"].includes(p.module_id) &&
    source.moduleId === p.module_id && source.data.kind === targetKind(p.module_id) &&
    booking.moduleId === p.module_id && booking.data.kind === bookingKind(p.module_id) &&
    booking.data[parentKey(p.module_id)] === p.target_id && booking.data.contactId === p.contact_id && contact.moduleId === "contacts");
}
export function checkInCurrentContext(org, p, intake, target, records) {
  if (p.state !== "confirmed") return { reason: "not-confirmed", context: null };
  if (p.recovered || !["staff", "intake"].includes(p.source)) return { reason: "unsupported-origin", context: null };
  const source = records.find(r => r.id === p.target_id), booking = records.find(r => r.id === p.booking_record_id), contact = records.find(r => r.id === p.contact_id);
  if (!source || !booking || !contact || source.status === "cancelled" || booking.status === "cancelled" || !target || target.recovery_block || !["managed", "paused"].includes(target.mode))
    return { reason: "parent-unavailable", context: null };
  const f = p.frozen, t = f?.terms;
  if (!checkInRelationships(p, records) ||
      (source.data.programId || null) !== f?.programId || (booking.data.programId || null) !== f?.programId ||
      ["startAt", "endAt", "timeZone"].some(k => source.data[k] !== t?.[k]) ||
      (source.moduleId === "volunteers" && (source.data.allowPartialIntervals === true) !== !!t?.intervalPolicy))
    return { reason: "commitment-changed", context: null };
  try {
    const original = checkInCommitmentContext(org, p, intake), commitmentSha256 = checkInCommitmentSha256(original), range = frozenParticipationInterval(p);
    return { reason: null, original, context: { title: t.title, kind: t.kind,
      occurrence: { startAt: t.startAt, endAt: t.endAt, timeZone: t.timeZone },
      effectiveRange: { startAt: range.startAt, endAt: range.endAt, timeZone: range.timeZone },
      participationPurpose: t.participationPurpose, participantInstructions: t.participantInstructions,
      organizerEmail: t.organizerEmail, organizerUrl: t.organizerUrl,
      sourceRevision: f.sourceRevision, termsHash: f.termsHash, commitmentSha256 } };
  } catch { return { reason: "commitment-changed", context: null }; }
}
function resolveInput(input, context, p, intake) {
  exact(input, ["revision", "intakeRevision", "commitmentSha256", "civil", "resolution"]);
  if (!Number.isSafeInteger(input.revision) || !Number.isSafeInteger(input.intakeRevision) || input.revision !== p.revision || input.intakeRevision !== intake.revision || input.commitmentSha256 !== context.commitmentSha256) changed();
  if (typeof input.civil !== "string" || input.civil.length > 23 || ![null, "earlier", "later"].includes(input.resolution)) fail(422, "checkin_fields", "Choose a valid local arrival time and any required repeated-time choice.");
  const resolved = resolveTaskCivil(input.civil, context.effectiveRange.timeZone);
  if (resolved.kind !== "fold" && input.resolution !== null) fail(422, "checkin_fields", "A repeated-time choice applies only to an ambiguous time.");
  const candidates = resolved.candidates.map(c => ({ choice: c.choice, claimedArrivalAt: c.dueAt }));
  return { participationId: p.id, revision: p.revision, intakeRevision: intake.revision, commitmentSha256: context.commitmentSha256,
    civil: input.civil, timeZone: context.effectiveRange.timeZone, kind: resolved.kind, reason: resolved.reason ?? null, candidates,
    claimedArrivalAt: resolved.kind === "unique" ? candidates[0].claimedArrivalAt : candidates.find(c => c.choice === input.resolution)?.claimedArrivalAt ?? null };
}
const commandResponse = value => okay({ result: value.result, currentDisposition: value.currentDisposition, replayed: value.replayed });

export async function participantCheckInRoutes({ request, url = new URL(request.url), db, settings, session, input }) {
  const match = ownPath.exec(url.pathname); if (!match) return null;
  const actor = verifiedParticipant(session); participantQuery(url);
  const [, org, intakeId, pid, action] = match, readOnly = request.method === "GET" || action === "resolve-arrival";
  if ((request.method === "GET" && action) || (request.method !== "GET" && (request.method !== "POST" || !action))) fail(405, "checkin_method", "Use a documented self-report method.");
  if (request.method === "POST") {
    checkCsrf(request, session, settings);
    if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || "")) fail(415, "content_type", "Supply JSON.");
    input ??= await readCheckInBody(request);
    if (action === "report") input = validateReportInput(input);
    if (action === "withdraw") input = validateWithdrawalInput(input);
  }
  await db.tx(actor.id, null, async c => {
    if (!(await c.query("SELECT id FROM os_participant_links WHERE user_id=$1 AND org_id=$2 AND intake_id=$3 AND revoked_at IS NULL", [actor.id, org, intakeId])).rows.length) unavailable();
  }, { readOnly: true });
  return db.tx(actor.id, org, async c => {
    const intake = (await c.query(`SELECT i.id,i.revision FROM os_participant_links l JOIN os_intake i ON i.org_id=l.org_id AND i.id=l.intake_id AND i.publication_id=l.publication_id WHERE l.user_id=$1 AND l.org_id=$2 AND l.intake_id=$3 AND l.revoked_at IS NULL${readOnly ? "" : " FOR UPDATE OF i,l"}`, [actor.id, org, intakeId])).rows[0];
    if (!intake) unavailable();
    const p = (await c.query(`SELECT * FROM os_participations WHERE org_id=$1 AND id=$2 AND intake_id=$3${readOnly ? "" : " FOR UPDATE"}`, [org, pid, intakeId])).rows[0];
    if (!p) unavailable();
    const rows = await checkInParentRows(c, org, pid, { forUpdate: !readOnly });
    const live = rows.filter(r => r.origin_mode === "live" && r.live_participation_id === p.id);
    if (live.length > 1) changed();
    const record = live.length ? checkInRecordFromRow(live[0]) : null;
    if (record && record.history.affirmation.actorHash !== hash(actor.id)) unavailable();
    // Current parent availability cannot invalidate a known accepted receipt.
    if (record && action === "report") {
      const result = reportCheckIn({ record, request: input, context: replayContext(org, p), actorId: actor.id, serverNow: null, auditRetained: false });
      noteParticipationReceiptReplay(c, org); return commandResponse(result);
    }
    if (action === "withdraw") {
      if (!record) unavailable();
      // A stored withdrawal receipt is tested before any new time or audit.
      if (record.withdrawalReceipt) {
        const result = withdrawCheckIn({ record, request: input, actorId: actor.id, serverNow: null, auditRetained: false });
        noteParticipationReceiptReplay(c, org); return commandResponse(result);
      }
      if (record.revision !== input.checkInRevision || record.history.claimSha256 !== input.reportSha256 || record.history.withdrawnAt !== null) changed();
      const { serverNow } = await checkInServerClock(c);
      const candidate = withdrawCheckIn({ record, request: input, actorId: actor.id, serverNow, auditRetained: false });
      const retained = await audit(c, org, actor.id, "participant-checkin.withdrawn", null, { checkInId: record.history.id, claimSha256: record.history.claimSha256 });
      const result = retained ? withdrawCheckIn({ record, request: input, actorId: actor.id, serverNow, auditRetained: true }) : candidate;
      await saveCheckInWithdrawal(c, org, record, result.record); return commandResponse(result);
    }
    const target = (await c.query("SELECT * FROM os_participation_targets WHERE org_id=$1 AND target_id=$2", [org, p.target_id])).rows[0];
    const current = checkInCurrentContext(org, p, intake, target, await allRecords(c, org));
    if (action === "resolve-arrival") {
      if (rows.length || !current.context) changed();
      return okay(resolveInput(input, current.context, p, intake));
    }
    if (action === "report") {
      if (rows.length) fail(409, "checkin_exists", "A retained assertion already exists for this historical participation.");
      if (!current.context || input.revision !== p.revision || input.intakeRevision !== intake.revision || input.commitmentSha256 !== current.context.commitmentSha256) changed();
    }
    const clock = await checkInServerClock(c, current.context?.effectiveRange ?? null, action === "report" ? input.claimedArrivalAt : null);
    if (!action) {
      const ownRecord = record && record.history.affirmation.actorHash === hash(actor.id) ? record : null;
      // A mismatched retained actor is not a route to private report content.
      const reason = rows.length ? "history-exists" : current.reason ?? clock.reason;
      return okay({ participationId: p.id, revision: p.revision, intakeRevision: intake.revision,
        checkInRevision: ownRecord?.revision ?? 0, context: current.context,
        window: current.context ? { opensAt: new Date(Date.parse(current.context.effectiveRange.startAt)).toISOString(), closesAt: new Date(Date.parse(current.context.effectiveRange.endAt) + L.afterEndMs).toISOString() } : null,
        serverNow: clock.serverNow, canReport: reason === null,
        canWithdraw: !!ownRecord && ownRecord.revision === 1, unavailableReason: reason, report: checkInSummary(ownRecord) });
    }
    if (clock.reason || clock.claimNotFuture !== true) fail(409, "checkin_window", "Review an arrival within the commitment and reporting window.");
    const context = { ...current.original, id: id() };
    const candidate = reportCheckIn({ record: null, request: input, context, actorId: actor.id, serverNow: clock.serverNow, auditRetained: false });
    const retained = await audit(c, org, actor.id, "participant-checkin.reported", null, { checkInId: context.id, claimSha256: candidate.record.history.claimSha256 });
    if (!retained) fail(422, "checkin_capacity", "The initial self-report journal could not be retained.");
    const result = reportCheckIn({ record: null, request: input, context, actorId: actor.id, serverNow: clock.serverNow, auditRetained: true });
    await insertCheckIn(c, org, result.record, clock.serverNow); return commandResponse(result);
  }, { lock: true, readOnly });
}

export async function staffCheckInRoutes({ c, org, member, tail, method, url }) {
  const match = staffPath.exec(tail); if (!match) return null;
  participantQuery(url); if (method !== "GET") fail(405, "checkin_method", "This staff view is read-only.");
  const p = (await c.query("SELECT * FROM os_participations WHERE org_id=$1 AND target_id=$2 AND id=$3", [org, match[1], match[2]])).rows[0];
  if (!p) unavailable(); requirePermission(p.module_id, member, "write");
  const records = await allRecords(c, org), ids = [p.target_id, p.booking_record_id, p.contact_id];
  if (ids.some(id => !records.some(r => r.id === id && visibleRecord(r, member))) || !checkInRelationships(p, records)) unavailable();
  const rows = await checkInParentRows(c, org, p.id);
  const found = rows.find(r => r.origin_mode === "live" && r.live_participation_id === p.id);
  const record = found ? checkInRecordFromRow(found) : null;
  if (record && !inScope({ moduleId: p.module_id, data: { programId: record.history.programId } }, member)) unavailable();
  return okay({ participationId: p.id, report: checkInSummary(record) });
}
