import { createHmac } from "node:crypto";
import { readBackupBody } from "./backup-json.mjs";
import { audit, saveRecord } from "./database.mjs";
import {
  FEEDBACK_UTC_STAMP, feedbackExactTime, feedbackIntakeHash, feedbackIntakeId, feedbackIntakeRevision,
  feedbackIntakeScope, feedbackStaffSelectors, feedbackStorageUnavailable, oneFeedbackRow, requireFeedbackIntakeStaff,
} from "./feedback-intake-access.mjs";
import { proposedFeedbackDraft } from "./feedback-intake-model.mjs";
import { publicationAccepting } from "./intake.mjs";
import { getModule, validateRecord } from "./modules.mjs";
import { checkCsrf, equal, fail, hash, HttpError, id, json, stable } from "./security.mjs";

const pathPattern = /^\/api\/orgs\/([A-Za-z0-9_-]{1,100})\/intake\/submissions\/([A-Za-z0-9_-]{1,100})\/feedback-draft$/;
export const isFeedbackIntakeDraftPath = path =>
  /^\/api\/orgs\/[^/]+\/intake\/submissions\/[^/]+\/feedback-draft(?:\/|$)/.test(path);
export const FEEDBACK_CONVERSION_ACTION = "intake.feedback-converted";
const headers = { "referrer-policy": "no-referrer" };
const lockedRead = { lock: true, readOnly: true };
const sha = value => typeof value === "string" && value.length === 64 && !/[^a-f0-9]/.test(value);
const requestKey = value => feedbackIntakeId(value) && value.length >= 16;
const fields = (value, keys) => value && typeof value === "object" &&
  Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
const requestFields = ["version", "revision", "scopeSha256", "reviewSha256", "idempotencyKey", "acknowledge"];
const receiptFields = ["version", "intakeId", "publicationId", "sourceRevision", "reviewedRevision",
  "submissionRevision", "draftRevision", "acceptedAtExact", "requestSha256", "authoritySha256"];
const intakeStates = new Set(["pending", "reviewed", "dismissed", "converted", "cancelled"]);
const draftModule = getModule("feedback");
const draftStates = new Set(draftModule.workflow.states.map(state => state.id));
const initialStatus = draftModule.workflow.initial;
const absent = () => fail(404, "feedback_draft_unavailable", "This feedback submission is unavailable.");
const stale = () => fail(409, "feedback_draft_stale", "The feedback review changed. Reload and review the draft.");
const conflict = () => fail(409, "feedback_draft_conflict", "This submission already has a recorded draft. Reload its history.");
const closed = () => fail(409, "feedback_draft_review", "Review a current submission before creating a draft.");
const unsettled = () => fail(503, "feedback_draft_unsettled", "The draft outcome could not be confirmed. Retry the same attempt.");
const badRequest = () => fail(422, "feedback_draft_request", "Send the exact reviewed feedback draft request.");
const okay = (context, value) => ({ ok: true, version: 1, orgId: context.org, scopeSha256: context.scopeSha256, ...value });

const submissionSql = `
  SELECT i.id,i.publication_id,i.revision,i.status,i.erased_at IS NOT NULL AS erased,
    i.receipt_hash IS NOT NULL AS has_receipt,
    CASE WHEN octet_length(i.converted_ids::text)<=512 THEN i.converted_ids END AS converted_ids
  FROM os_intake i JOIN os_publications p ON p.org_id=i.org_id AND p.id=i.publication_id
  WHERE i.org_id=$1 AND i.id=$2 AND p.kind='feedback'`;
const proofSql = `
  SELECT p.record_id,p.source_revision,p.kind,p.target_id,p.target_module,p.target_revision,
    p.withdrawn_at IS NOT NULL AS withdrawn_at,
    CASE WHEN octet_length(p.schema::text)<=2048 THEN p.schema END AS schema,
    to_char(p.created_at AT TIME ZONE 'UTC','${FEEDBACK_UTC_STAMP}') AS publication_created,
    CASE WHEN octet_length(i.answers::text)<=256 THEN i.answers END AS answers,
    i.reviewed_by,i.cancelled_at IS NOT NULL AS cancelled,
    to_char(i.created_at AT TIME ZONE 'UTC','${FEEDBACK_UTC_STAMP}') AS received_exact,
    to_char(i.consent_at AT TIME ZONE 'UTC','${FEEDBACK_UTC_STAMP}') AS consent_exact,
    to_char(i.reviewed_at AT TIME ZONE 'UTC','${FEEDBACK_UTC_STAMP}') AS reviewed_exact,
    COALESCE(i.idempotency_hash ~ '^[a-f0-9]{64}$' AND i.payload_hash ~ '^[a-f0-9]{64}$'
      AND i.receipt_hash ~ '^[a-f0-9]{64}$' AND i.ip_hash IS NULL,false) AS live_collection,
    r.module_id,r.status,r.revision,r.last_editor_id,
    to_char(r.created_at AT TIME ZONE 'UTC','${FEEDBACK_UTC_STAMP}') AS form_created,
    to_char(r.updated_at AT TIME ZONE 'UTC','${FEEDBACK_UTC_STAMP}') AS form_updated,
    CASE WHEN octet_length(r.approval::text)<=4096 THEN jsonb_build_object(
      'status',r.approval->'status','revision',r.approval->'revision','actorId',r.approval->'actorId','at',r.approval->'at') END AS approval,
    CASE WHEN jsonb_typeof(r.data)='object' AND octet_length(r.data::text)<=8192 THEN (
      SELECT jsonb_object_agg(key,value) FROM jsonb_each(r.data) WHERE key IN
        ('kind','version','title','purpose','definition','anonymous','consentRequired','collectionUrl','retentionUntil')
    ) END AS form_data
  FROM os_intake i JOIN os_publications p ON p.org_id=i.org_id AND p.id=i.publication_id
  LEFT JOIN os_records r ON r.org_id=p.org_id AND r.id=p.record_id AND r.deleted_at IS NULL
  WHERE i.org_id=$1 AND i.id=$2 AND p.kind='feedback'`;
const receiptSql = `
  SELECT actor_id,record_id,module_id,CASE WHEN octet_length(detail::text)<=2048 THEN detail END AS detail
  FROM os_events WHERE org_id=$1 AND action='${FEEDBACK_CONVERSION_ACTION}' AND detail->>'intakeId'=$2 LIMIT 2`;

function commitInput(value) {
  if (!fields(value, requestFields) || value.version !== 1 || !feedbackIntakeRevision(value.revision) ||
      !sha(value.scopeSha256) || !sha(value.reviewSha256) || !requestKey(value.idempotencyKey) || value.acknowledge !== true)
    badRequest();
  return value;
}

async function submission(c, org, intakeId) {
  const row = oneFeedbackRow(await c.query(submissionSql, [org, intakeId]));
  if (!row) return null;
  if (row.id !== intakeId || !feedbackIntakeId(row.publication_id) || !feedbackIntakeRevision(row.revision) ||
      !intakeStates.has(row.status) || typeof row.erased !== "boolean" || typeof row.has_receipt !== "boolean" ||
      !Array.isArray(row.converted_ids) || row.converted_ids.length > 1) feedbackStorageUnavailable();
  const [link] = row.converted_ids;
  if (row.converted_ids.length && (!fields(link, ["id", "moduleId"]) ||
      link.moduleId !== "feedback" || !feedbackIntakeId(link.id))) feedbackStorageUnavailable();
  return { publicationId: row.publication_id, hasReceipt: row.has_receipt, draftId: link?.id ?? null,
    current: { id: intakeId, revision: row.revision, status: row.status, erased: row.erased } };
}

async function draftDisposition(c, org, draftId) {
  const row = oneFeedbackRow(await c.query(
    "SELECT id,module_id,status,revision,deleted_at IS NOT NULL AS trashed FROM os_records WHERE org_id=$1 AND id=$2",
    [org, draftId],
  ));
  if (!row) return { id: draftId, moduleId: "feedback", status: null, revision: null, disposition: "missing" };
  if (row.id !== draftId || row.module_id !== "feedback" || !draftStates.has(row.status) ||
      !feedbackIntakeRevision(row.revision) || typeof row.trashed !== "boolean") feedbackStorageUnavailable();
  return { id: draftId, moduleId: "feedback", status: row.status, revision: row.revision,
    disposition: row.trashed ? "trashed" : "active" };
}

async function receipt(c, org, intakeId) {
  const row = oneFeedbackRow(await c.query(receiptSql, [org, intakeId]));
  if (!row) return null;
  const detail = row.detail;
  if (!fields(detail, receiptFields) || detail.version !== 1 || detail.intakeId !== intakeId ||
      !feedbackIntakeId(detail.publicationId) || !feedbackIntakeRevision(detail.sourceRevision) ||
      !feedbackIntakeRevision(detail.reviewedRevision) || detail.submissionRevision !== detail.reviewedRevision + 1 ||
      !feedbackIntakeRevision(detail.submissionRevision) || detail.draftRevision !== 1 ||
      !feedbackIntakeId(row.actor_id) || !feedbackIntakeId(row.record_id) || row.module_id !== "feedback" ||
      !sha(detail.requestSha256) || !sha(detail.authoritySha256)) feedbackStorageUnavailable();
  const decision = {
    submissionId: intakeId, publicationId: detail.publicationId, sourceRevision: detail.sourceRevision,
    reviewedRevision: detail.reviewedRevision, submissionRevision: detail.submissionRevision,
    acceptedAtExact: feedbackExactTime(detail.acceptedAtExact),
    draft: { id: row.record_id, moduleId: "feedback", status: initialStatus, revision: 1 },
  };
  return { actorId: row.actor_id, requestSha256: detail.requestSha256, authoritySha256: detail.authoritySha256, decision };
}

async function accepted(c, context, saved, replay = null) {
  const { decision } = saved;
  const entry = await submission(c, context.org, decision.submissionId);
  if (entry && (entry.publicationId !== decision.publicationId || entry.draftId !== decision.draft.id ||
      entry.current.revision < decision.submissionRevision || !["converted", "cancelled"].includes(entry.current.status)))
    feedbackStorageUnavailable();
  const draft = await draftDisposition(c, context.org, decision.draft.id);
  return okay(context, { state: "accepted", decision, current: { submission: entry?.current ?? null, draft },
    ...(replay ?? {}) });
}

const requestDigest = (context, intakeId, input) =>
  feedbackIntakeHash("request", { orgId: context.org, intakeId, input });

function requireScope(context, input) {
  if (!equal(context.scopeSha256, input.scopeSha256))
    fail(403, "feedback_draft_scope", "Your feedback review access changed. Reload this workspace.");
}

async function acceptedRetry(c, context, intakeId, input) {
  requireScope(context, input);
  const saved = await receipt(c, context.org, intakeId);
  if (!saved) return null;
  if (saved.actorId !== context.member.userId || !equal(saved.authoritySha256, context.scopeSha256) ||
      !equal(saved.requestSha256, requestDigest(context, intakeId, input))) conflict();
  return accepted(c, context, saved, { idempotencyKey: input.idempotencyKey, replayed: true });
}

async function freshReview(c, context, entry, secret) {
  const { org, scopeSha256 } = context, { id: intakeId, revision, status, erased } = entry.current;
  if (status !== "reviewed" || erased || !entry.hasReceipt || entry.draftId ||
      !feedbackIntakeRevision(revision + 1)) closed();
  const proof = oneFeedbackRow(await c.query(proofSql, [org, intakeId]));
  if (!proof || proof.live_collection !== true || proof.cancelled !== false ||
      !feedbackIntakeId(proof.record_id) || !feedbackIntakeId(proof.reviewed_by) ||
      !feedbackIntakeId(proof.last_editor_id) || !feedbackIntakeId(proof.approval?.actorId) ||
      !feedbackIntakeRevision(proof.source_revision)) stale();
  const clock = oneFeedbackRow(await c.query(
    `SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','${FEEDBACK_UTC_STAMP}') AS now_exact`,
  ));
  const nowExact = feedbackExactTime(clock?.now_exact);
  const today = nowExact.slice(0, 10);
  const source = { moduleId: proof.module_id, status: proof.status, revision: proof.revision,
    lastEditedBy: proof.last_editor_id, approval: proof.approval, data: proof.form_data };
  let proposed;
  const receivedAt = feedbackExactTime(proof.received_exact);
  try {
    if (!publicationAccepting(proof, source, null, { today })) stale();
    const candidate = proposedFeedbackDraft({ answers: proof.answers, receivedAt });
    if (candidate.status !== initialStatus) feedbackStorageUnavailable();
    proposed = { ...candidate, data: validateRecord("feedback", candidate.data, { status: initialStatus }) };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    stale();
  }
  if (typeof secret !== "string" || secret.length < 32) feedbackStorageUnavailable();
  const pin = {
    scopeSha256, intakeId, revision, publicationId: entry.publicationId,
    publicationCreatedAt: feedbackExactTime(proof.publication_created), schema: proof.schema,
    sourceId: proof.record_id, sourceRevision: proof.source_revision,
    sourceCreatedAt: feedbackExactTime(proof.form_created), sourceUpdatedAt: feedbackExactTime(proof.form_updated),
    approval: proof.approval, lastEditedBy: proof.last_editor_id,
    receivedAt, consentAt: feedbackExactTime(proof.consent_exact),
    reviewedAt: feedbackExactTime(proof.reviewed_exact), reviewedBy: proof.reviewed_by, proposed,
  };
  const reviewSha256 = createHmac("sha256", secret).update("charitology-feedback-draft-v1:review\n")
    .update(stable(pin)).digest("hex");
  return { proposed, reviewSha256, sourceRevision: proof.source_revision, nowExact };
}

async function preview(c, { org, intakeId, session, secret }) {
  const context = await feedbackIntakeScope(c, org, session, true);
  const saved = await receipt(c, org, intakeId);
  if (saved) return accepted(c, context, saved);
  const entry = await submission(c, org, intakeId);
  if (!entry) absent();
  if (entry.draftId && !entry.hasReceipt && ["converted", "cancelled"].includes(entry.current.status))
    return okay(context, { state: "historical",
      current: { submission: entry.current, draft: await draftDisposition(c, org, entry.draftId) } });
  const { proposed, reviewSha256 } = await freshReview(c, context, entry, secret);
  return okay(context, { state: "ready", submission: { id: intakeId, revision: entry.current.revision, status: "reviewed" },
    proposed, reviewSha256 });
}

class FeedbackReadAgain extends Error {}

async function writeDraft(c, { org, intakeId, session, secret, input, admitWorkspace }) {
  const context = await feedbackIntakeScope(c, org, session, false);
  requireScope(context, input);
  // Accepted intent never returns through a writable transaction's ordinary capacity gate.
  if (await receipt(c, org, intakeId)) throw new FeedbackReadAgain();
  const entry = await submission(c, org, intakeId);
  if (!entry) absent();
  if (entry.current.revision !== input.revision) stale();
  const review = await freshReview(c, context, entry, secret);
  if (!equal(review.reviewSha256, input.reviewSha256)) stale();
  if (typeof admitWorkspace !== "function") feedbackStorageUnavailable();
  const draftId = id(), actor = context.member.userId;
  if (oneFeedbackRow(await c.query("SELECT id FROM os_records WHERE org_id=$1 AND id=$2", [org, draftId])))
    feedbackStorageUnavailable();
  const draft = {
    id: draftId, orgId: org, ...review.proposed, ownerId: actor, lastEditedBy: actor,
    revision: 1, approval: null, snapshot: null, source: null,
  };
  await saveRecord(c, draft);
  const changed = oneFeedbackRow(await c.query(`
    UPDATE os_intake SET status='converted',revision=revision+1,converted_ids=$4::jsonb,updated_at=now()
    WHERE org_id=$1 AND id=$2 AND revision=$3 AND status='reviewed' AND erased_at IS NULL
      AND cancelled_at IS NULL AND converted_ids='[]'::jsonb RETURNING id,revision`,
    [org, intakeId, input.revision, JSON.stringify([{ id: draftId, moduleId: "feedback" }])]));
  if (changed?.id !== intakeId || changed.revision !== input.revision + 1) stale();
  const detail = {
    version: 1, intakeId, publicationId: entry.publicationId, sourceRevision: review.sourceRevision,
    reviewedRevision: input.revision, submissionRevision: changed.revision, draftRevision: draft.revision,
    acceptedAtExact: review.nowExact, requestSha256: requestDigest(context, intakeId, input),
    authoritySha256: context.scopeSha256,
  };
  if (await audit(c, org, actor, FEEDBACK_CONVERSION_ACTION, draft, detail) !== true)
    feedbackStorageUnavailable();
  const saved = await receipt(c, org, intakeId);
  if (!saved || saved.decision.draft.id !== draftId || saved.actorId !== actor ||
      !equal(saved.requestSha256, detail.requestSha256) || !equal(saved.authoritySha256, detail.authoritySha256))
    feedbackStorageUnavailable();
  if (await admitWorkspace(c, org) !== true)
    fail(422, "feedback_draft_capacity", "This workspace lacks capacity to retain the draft safely.");
  return accepted(c, context, saved, { idempotencyKey: input.idempotencyKey, replayed: false });
}

class DefinitiveFeedbackRefusal extends HttpError {
  constructor(error) { super(error.status, error.code, error.message); }
}

async function commit(db, user, args) {
  const { org, intakeId, session, input } = args;
  const lookup = () => db.tx(user, org, async c =>
    acceptedRetry(c, await feedbackIntakeScope(c, org, session, true), intakeId, input), lockedRead);
  const existing = await lookup();
  if (existing) return existing;
  try {
    return await db.tx(user, org, c => writeDraft(c, args), { lock: true });
  } catch (error) {
    // Reconcile a possible lost COMMIT response with one fresh locked read.
    // The retry path itself never sends the mutation again.
    let reconciled;
    try { reconciled = await lookup(); }
    catch (recheck) {
      if (recheck instanceof HttpError && [401, 403, 409].includes(recheck.status)) throw recheck;
      unsettled();
    }
    if (reconciled) return reconciled;
    if (error instanceof HttpError && [409, 422].includes(error.status))
      throw new DefinitiveFeedbackRefusal(error);
    if (error instanceof HttpError) throw error;
    unsettled();
  }
}

function errorReply(error) {
  const known = error instanceof HttpError;
  const status = known ? error.status : 503;
  const reason = known && typeof error.code === "string" && (error.code.startsWith("feedback_draft_") ||
    ["session", "membership", "origin", "csrf", "rate"].includes(error.code));
  const code = reason ? error.code : status === 422 ? "feedback_draft_capacity" :
    status === 413 ? "feedback_draft_size" : "feedback_draft_unsettled";
  const message = reason ? error.message : status === 422 ? "This workspace lacks capacity to retain the draft safely." :
    status === 413 ? "The feedback draft request is too large." : "The draft outcome could not be confirmed. Retry the same attempt.";
  return json({ ok: false, code, message, ...(error instanceof DefinitiveFeedbackRefusal ? { definitive: true } : {}) },
    status, headers);
}

/** Mount before the generic intake parser. The trusted capacity hook admits the
 * complete current and inactive workspace or throws, returning true on success. */
export async function feedbackIntakeDraftRoutes({ request, url = new URL(request.url), db, session, settings,
  admitWorkspace }) {
  if (!isFeedbackIntakeDraftPath(url.pathname)) return null;
  try {
    const match = pathPattern.exec(url.pathname);
    if (!match) absent();
    const [, org, intakeId] = match;
    const read = request.method === "GET";
    if (!read && request.method !== "POST")
      fail(405, "feedback_draft_method", "Use GET to review or POST to save the private draft.");
    const query = new URLSearchParams(url.search);
    // Vercel can forward the unused rewrite capture as this exact path value.
    if (query.getAll("path").length === 1 && query.get("path") === url.pathname.slice("/api/".length))
      query.delete("path");
    if (query.size || read && (request.body !== null || request.headers.has("transfer-encoding") ||
        request.headers.has("content-length") && request.headers.get("content-length") !== "0"))
      fail(400, "feedback_draft_request", "Use the feedback draft route without query fields or a GET body.");
    const { userId } = feedbackStaffSelectors(session);
    if (!read) {
      checkCsrf(request, session, settings);
      await db.tx(userId, org, c => requireFeedbackIntakeStaff(c, org, session, { readOnly: true }), { readOnly: true });
      if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? ""))
        fail(415, "feedback_draft_content_type", "Send the feedback draft request as JSON.");
    }
    await db.limit("feedback-draft:" + hash(userId), 120, 3600);
    const args = { org, intakeId, session, secret: settings?.secret, admitWorkspace };
    if (read) return json(await db.tx(userId, org, c => preview(c, args), lockedRead), 200, headers);
    try { args.input = commitInput(await readBackupBody(request, 4096)); }
    catch (error) {
      if (error instanceof HttpError && error.status === 413) throw error;
      badRequest();
    }
    return json(await commit(db, userId, args), 200, headers);
  } catch (error) {
    return errorReply(error);
  }
}
