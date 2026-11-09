import { isProxy } from "node:util/types";
import { fail } from "./security.mjs";
import { intakeSchema, intakeAnswers, INTAKE_LIMITS } from "./intake.mjs";
import { participationTimestampParameter } from "./participation-timestamp.mjs";
import { feedbackSelection, requireFeedbackPublicationSchema } from "./feedback-intake-model.mjs";
import {
  exactFeedbackObject, feedbackDataField, feedbackPortableConversionEvent, isWithheldFeedbackDraft,
} from "./feedback-intake-safety.mjs";

const opaque = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v);
const stamp = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
const positive = (v) => Number.isSafeInteger(v) && v > 0;
const iso = (v) => v?.toISOString?.() || v;
const feedbackPublicationKeys = ["id", "recordId", "sourceRevision", "kind", "targetId", "targetModule",
  "targetRevision", "schema", "createdAt", "withdrawnAt"];
const feedbackSubmissionKeys = ["id", "publicationId", "answers", "consentAt", "status", "convertedIds",
  "createdAt", "erasedAt", "cancelledAt"];
const badFeedback = () => fail(422, "feedback_intake_backup", "Use the fixed anonymous feedback history and its original private draft links.");

function feedbackPublication(p) {
  if (!exactFeedbackObject(p, feedbackPublicationKeys) || p.targetId !== null || p.targetModule !== null ||
      p.targetRevision !== null || p.sourceRevision > 2147483647 ||
      p.withdrawnAt !== null && !stamp(p.withdrawnAt)) badFeedback();
  try { return requireFeedbackPublicationSchema(p.schema); }
  catch { badFeedback(); }
}
function feedbackSubmission(s, links) {
  if (!exactFeedbackObject(s, feedbackSubmissionKeys) || s.erasedAt !== null && !stamp(s.erasedAt) ||
      (s.status === "cancelled" ? !stamp(s.cancelledAt) : s.cancelledAt !== null)) badFeedback();
  const converted = s.convertedIds;
  if (isProxy(converted) || !Array.isArray(converted) || Object.getPrototypeOf(converted) !== Array.prototype || converted.length > 1 ||
      Reflect.ownKeys(converted).length !== converted.length + 1 ||
      s.status === "converted" && converted.length !== 1 ||
      !["converted", "cancelled"].includes(s.status) && converted.length !== 0) badFeedback();
  const convertedIds = [];
  if (converted.length) {
    const item = Object.getOwnPropertyDescriptor(converted, "0");
    const link = item?.enumerable && Object.hasOwn(item, "value") ? item.value : null;
    if (!exactFeedbackObject(link, ["id", "moduleId"]) || !opaque(link.id) || link.moduleId !== "feedback" ||
        links.has(link.id)) badFeedback();
    links.set(link.id, "feedback");
    convertedIds.push({ id: link.id, moduleId: "feedback" });
  }
  if (s.erasedAt !== null && !exactFeedbackObject(s.answers, [])) badFeedback();
  let answers = {};
  if (s.erasedAt === null) {
    try { answers = feedbackSelection(s.answers); }
    catch { badFeedback(); }
  }
  // Restored Feedback cannot re-enter the review-to-draft command path.
  const status = ["pending", "reviewed"].includes(s.status) ? "dismissed" : s.status;
  return { answers, status, convertedIds };
}
function checkFeedbackNativeLinks(backup, links, submissions, publications) {
  if (links.size) {
    const seen = new Set();
    for (const list of [backup.records ?? [], backup.trash ?? []]) {
      if (isProxy(list) || !Array.isArray(list)) badFeedback();
      for (const row of list) {
        const recordId = feedbackDataField(row, "id");
        const moduleId = links.get(recordId);
        if (!moduleId) continue;
        if (seen.has(recordId) || feedbackDataField(row, "moduleId") !== moduleId ||
            moduleId === "feedback" && !isWithheldFeedbackDraft(row)) badFeedback();
        seen.add(recordId);
      }
    }
    // A missing draft/source remains history. Restore does not recreate it.
  }
  if (!Array.isArray(backup.events)) {
    if (links.size && backup.events !== undefined) badFeedback();
    return;
  }
  const retained = new Map(submissions.map(row => [row.id, row])), seen = new Set();
  for (const row of backup.events) {
    const event = feedbackPortableConversionEvent(row);
    if (!event) continue;
    const { intakeId, publicationId, sourceRevision } = event.detail;
    const submission = retained.get(intakeId), publication = publications.get(publicationId);
    if (seen.has(intakeId) || publication?.kind !== "feedback" || publication.sourceRevision !== sourceRevision ||
        submission?.publicationId !== publicationId || submission.convertedIds[0]?.id !== event.record_id) badFeedback();
    seen.add(intakeId);
  }
}

// Capabilities and recipient/IP hashes are deliberately absent from backups.
export async function exportIntake(c, org) {
  const publications = (
    await c.query(
      "SELECT id,record_id,source_revision,kind,target_id,target_module,target_revision,schema,created_at,withdrawn_at FROM os_publications WHERE org_id=$1 ORDER BY created_at,id",
      [org],
    )
  ).rows.map((r) => ({
    id: r.id,
    recordId: r.record_id,
    sourceRevision: r.source_revision,
    kind: r.kind,
    targetId: r.target_id,
    targetModule: r.target_module,
    targetRevision: r.target_revision,
    schema: r.schema,
    createdAt: iso(r.created_at),
    withdrawnAt: iso(r.withdrawn_at),
  }));
  const submissions = (
    await c.query(
      "SELECT id,publication_id,answers,consent_at,status,converted_ids,created_at,erased_at,cancelled_at FROM os_intake WHERE org_id=$1 ORDER BY created_at,id",
      [org],
    )
  ).rows.map((r) => ({
    id: r.id,
    publicationId: r.publication_id,
    answers: r.answers,
    consentAt: iso(r.consent_at),
    status: r.status,
    convertedIds: r.converted_ids,
    createdAt: iso(r.created_at),
    erasedAt: iso(r.erased_at),
    cancelledAt: iso(r.cancelled_at),
  }));
  const feedback = new Set(), links = new Map();
  for (const publication of publications) if (publication.kind === "feedback") {
    feedbackPublication(publication);
    feedback.add(publication.id);
    links.set(publication.recordId, "forms");
  }
  if (feedback.size) for (const submission of submissions) if (feedback.has(submission.publicationId))
    feedbackSubmission(submission, links);
  return { version: 1, publications, submissions };
}

export function restoredIntake(backup) {
  if (backup.intake === undefined) {
    checkFeedbackNativeLinks(backup, new Map(), [], new Map());
    return { publications: [], submissions: [] };
  }
  const input = backup.intake;
  if (
    !input ||
    input.version !== 1 ||
    !Array.isArray(input.publications) ||
    !Array.isArray(input.submissions) ||
    input.publications.length > 10000 ||
    input.submissions.length > 50000
  )
    fail(422, "intake_backup", "Invalid or oversized public intake backup.");
  const pubIds = new Set(),
    ids = new Set(), feedbackLinks = new Map();
  const publications = input.publications.map((p) => {
    if (
      !p ||
      !opaque(p.id) ||
      pubIds.has(p.id) ||
      !opaque(p.recordId) ||
      !positive(p.sourceRevision) ||
      !stamp(p.createdAt)
    )
      fail(
        422,
        "intake_backup",
        "Invalid or duplicate intake publication identity.",
      );
    pubIds.add(p.id);
    const kind = feedbackDataField(p, "kind");
    if (kind === "feedback") {
      const schema = feedbackPublication(p);
      feedbackLinks.set(p.recordId, "forms");
      return { id: p.id, recordId: p.recordId, sourceRevision: p.sourceRevision, kind,
        targetId: null, targetModule: null, targetRevision: null, schema, createdAt: p.createdAt };
    }
    if (
      p.targetId != null &&
      (!opaque(p.targetId) ||
        !positive(p.targetRevision) ||
        p.targetModule !==
          (kind === "event-interest"
            ? "events"
            : kind === "volunteer-interest"
              ? "volunteers"
              : null))
    )
      fail(422, "intake_backup", "Invalid intake target reference.");
    if (p.targetId == null && p.targetRevision != null)
      fail(422, "intake_backup", "An intake target revision needs a target.");
    const source = p.schema;
    if (!source || source.kind !== kind)
      fail(422, "intake_backup", "Invalid published form schema.");
    const schema = intakeSchema(
      {
        data: {
          title: source.title,
          purpose: source.purpose,
          definition: JSON.stringify(source.questions),
          retentionUntil: source.retentionUntil,
        },
      },
      kind,
      { allowExpired: true },
    );
    return {
      id: p.id,
      recordId: p.recordId,
      sourceRevision: p.sourceRevision,
      kind,
      targetId: p.targetId || null,
      targetModule: p.targetId ? p.targetModule : null,
      targetRevision: p.targetId ? p.targetRevision : null,
      schema,
      createdAt: p.createdAt,
    };
  });
  const byId = new Map(publications.map((p) => [p.id, p]));
  let pending = 0,
    pendingBytes = 0;
  const submissions = input.submissions.map((s) => {
    if (
      !s ||
      !opaque(s.id) ||
      ids.has(s.id) ||
      !byId.has(s.publicationId) ||
      !stamp(s.consentAt) ||
      !stamp(s.createdAt) ||
      !["pending", "reviewed", "dismissed", "converted", "cancelled"].includes(
        s.status,
      )
    )
      fail(
        422,
        "intake_backup",
        "Invalid or duplicate intake submission identity.",
      );
    ids.add(s.id);
    if (byId.get(s.publicationId).kind === "feedback") {
      const { answers, status, convertedIds } = feedbackSubmission(s, feedbackLinks);
      return { id: s.id, publicationId: s.publicationId, answers, consentAt: s.consentAt, status,
        convertedIds, createdAt: s.createdAt, erasedAt: s.erasedAt, cancelledAt: s.cancelledAt };
    }
    if (s.cancelledAt != null && !stamp(s.cancelledAt))
      fail(422, "intake_backup", "Invalid request withdrawal timestamp.");
    if (
      s.erasedAt != null &&
      (!stamp(s.erasedAt) ||
        !s.answers ||
        Array.isArray(s.answers) ||
        Object.keys(s.answers).length)
    )
      fail(
        422,
        "intake_backup",
        "An erased request must have a valid erasure date and no retained answers.",
      );
    const answers = s.erasedAt
      ? {}
      : intakeAnswers(byId.get(s.publicationId).schema, s.answers);
    // Withdrawals and closed requests remain closed. A previous human review is
    // source provenance, not authority in the restored organization.
    const status = ["pending", "reviewed"].includes(s.status)
      ? s.erasedAt
        ? "dismissed"
        : "pending"
      : s.status;
    const convertedIds = s.convertedIds || [];
    if (
      !Array.isArray(convertedIds) ||
      convertedIds.length > 2 ||
      convertedIds.some(
        (r) =>
          !r ||
          !opaque(r.id) ||
          !["contacts", "events", "volunteers"].includes(r.moduleId),
      )
    )
      fail(422, "intake_backup", "Invalid converted intake record references.");
    if (status === "pending") {
      pending++;
      pendingBytes += Buffer.byteLength(JSON.stringify(answers)) + 1000;
    }
    return {
      id: s.id,
      publicationId: s.publicationId,
      answers,
      consentAt: s.consentAt,
      status,
      convertedIds,
      createdAt: s.createdAt,
      erasedAt: s.erasedAt || null,
      cancelledAt: s.cancelledAt || null,
    };
  });
  if (
    pending > INTAKE_LIMITS.pendingCount ||
    pendingBytes > INTAKE_LIMITS.pendingBytes
  )
    fail(
      422,
      "intake_backup",
      "The restored intake queue exceeds 1,000 pending requests or its 8 MiB limit.",
    );
  checkFeedbackNativeLinks(backup, feedbackLinks, submissions, byId);
  return { publications, submissions };
}

export async function restoreIntake(c, org, user, intake) {
  for (const p of intake.publications)
    await c.query(
      "INSERT INTO os_publications(org_id,id,record_id,source_revision,kind,target_id,target_module,target_revision,schema,created_by,created_at,withdrawn_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())",
      [
        org,
        p.id,
        p.recordId,
        p.sourceRevision,
        p.kind,
        p.targetId,
        p.targetModule,
        p.targetRevision,
        JSON.stringify(p.schema),
        user,
        participationTimestampParameter(p.createdAt),
      ],
    );
  for (const s of intake.submissions)
    await c.query(
      "INSERT INTO os_intake(org_id,id,publication_id,answers,consent_at,status,revision,converted_ids,created_at,erased_at,cancelled_at) VALUES($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10)",
      [
        org,
        s.id,
        s.publicationId,
        JSON.stringify(s.answers),
        participationTimestampParameter(s.consentAt),
        s.status,
        JSON.stringify(s.convertedIds),
        participationTimestampParameter(s.createdAt),
        participationTimestampParameter(s.erasedAt),
        participationTimestampParameter(s.cancelledAt),
      ],
    );
  if (!intake.submissions.length) return;
  const usage = (
    await c.query(
      "SELECT count(*) AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0) AS bytes FROM os_intake t WHERE org_id=$1 AND status IN ('pending','reviewed')",
      [org],
    )
  ).rows[0];
  if (
    Number(usage.count) > INTAKE_LIMITS.pendingCount ||
    Number(usage.bytes) > INTAKE_LIMITS.pendingBytes
  )
    fail(
      422,
      "intake_backup",
      "The restored intake queue exceeds its database storage limit. Nothing was imported.",
    );
}
