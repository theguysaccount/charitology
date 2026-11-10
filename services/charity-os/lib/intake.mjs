import { suppressParticipationDelivery } from "./participation-delivery.mjs";
import { createHmac, randomBytes } from "node:crypto";
import { requireAdmin, visibleRecord } from "./access.mjs";
import { allRecords, rowRecord, saveRecord, audit, notePublicFeedbackReceiptReplay } from "./database.mjs";
import { getModule, validateRecord } from "./modules.mjs";
import { checkOrigin, fail, hash, id, json } from "./security.mjs";
import { parseBackupJson, readBackupBodyBytes } from "./backup-json.mjs";
import {
  FEEDBACK_INTAKE_CONSENT,
  feedbackSelection,
  requireFeedbackPublicationSchema,
} from "./feedback-intake-model.mjs";
import { feedbackSchemaFromReviewedFormData } from "./feedback-intake-form.mjs";
import { canManageFeedbackIntake, requireFeedbackIntakeStaff } from "./feedback-intake-access.mjs";
import { feedbackIntakeSchemaReady } from "./feedback-intake-schema.mjs";
import { isManagedParticipationTarget, participationValidationContext } from "./participation-guards.mjs";
import { refuseProtectedVolunteerOrientation } from "./volunteer-orientation-marker.mjs";

export const INTAKE_LIMITS = Object.freeze({
  requestBytes: 16384,
  schemaBytes: 12000,
  questions: 30,
  text: 300,
  daily: 100,
  pendingCount: 1000,
  pendingBytes: 8 * 1024 * 1024,
});
const kinds = ["contact", "event-interest", "volunteer-interest"];
const statuses = ["pending", "reviewed", "dismissed", "converted", "cancelled"];
const message =
  "Request received. This is not a confirmed booking, payment or newsletter subscription.";
const feedbackMessage = "Feedback received. The organization can review your selections privately.";
const feedbackNotice = "This form asks for no name or contact details. The organization uses a private review queue.";
export const consentText =
  "I agree that this organization may review these operational answers and contact me about this request. I will not include sensitive personal or case information.";
const opaque = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v);
const plain = (v) =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
const okay = (value, status = 200) =>
  json({ ok: true, ...value }, status, { "referrer-policy": "no-referrer" });
const time = (v) => (v ? new Date(v).toISOString() : null);
function exact(value, allowed) {
  if (!plain(value) || Object.keys(value).some((key) => !allowed.includes(key)))
    fail(422, "intake_fields", "Use only the documented intake fields.");
}
function text(value, max, required = true) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim()) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    fail(
      422,
      "intake_text",
      `Use ${required ? "1–" : "at most "}${max} characters of plain text.`,
    );
  return value.trim();
}
function date(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
const sensitive =
  /\b(?:medical|diagnos(?:is|es)|medication|disabilit\w*|mental health|sexual|religio\w*|ethnic\w*|race|racial|passport|social security|bank account|credit card|criminal|allegation|abuse|case histor\w*|case notes|immigration|birth ?date|date of birth)\b/i;

export function intakeSchema(record, kind, { allowExpired = false } = {}) {
  if (!kinds.includes(kind))
    fail(422, "intake_kind", "Choose a supported operational intake kind.");
  let questions;
  try {
    questions = JSON.parse(record.data.definition);
  } catch {
    fail(422, "intake_schema", "The form needs valid question JSON.");
  }
  if (
    !Array.isArray(questions) ||
    !questions.length ||
    questions.length > INTAKE_LIMITS.questions
  )
    fail(
      422,
      "intake_schema",
      "Publish between 1 and 30 operational questions.",
    );
  const keys = new Set();
  questions = questions.map((q) => {
    exact(q, ["key", "label", "type", "required", "options"]);
    if (
      !opaque(q.key) ||
      q.key.length > 40 ||
      ["__proto__", "constructor", "prototype"].includes(q.key) ||
      keys.has(q.key)
    )
      fail(
        422,
        "intake_schema",
        "Question keys must be distinct, simple identifiers of at most 40 characters.",
      );
    keys.add(q.key);
    const label = text(q.label, 180);
    if (sensitive.test(`${q.key.replaceAll("_", " ")} ${label}`))
      fail(
        422,
        "intake_sensitive",
        "This intake accepts low-risk operational questions only. Use a specialist system for sensitive information.",
      );
    if (
      !["text", "number", "boolean", "date", "select"].includes(q.type) ||
      (q.required !== undefined && typeof q.required !== "boolean")
    )
      fail(
        422,
        "intake_schema",
        "Choose a supported question type and a boolean required flag.",
      );
    if (["name", "email"].includes(q.key) && q.type !== "text")
      fail(
        422,
        "intake_schema",
        "Reserved name and email questions must use the text type.",
      );
    const next = {
      key: q.key,
      label,
      type: q.type,
      required: q.required === true,
    };
    if (q.type === "select") {
      if (
        !Array.isArray(q.options) ||
        !q.options.length ||
        q.options.length > 30
      )
        fail(422, "intake_schema", "Select questions need 1–30 choices.");
      next.options = q.options.map((v) => text(v, 120));
      if (
        new Set(next.options).size !== next.options.length ||
        next.options.some((v) => sensitive.test(v))
      )
        fail(422, "intake_schema", "Use distinct, non-sensitive choices.");
    } else if (q.options !== undefined)
      fail(422, "intake_schema", "Only select questions accept choices.");
    return next;
  });
  const schema = {
    title: text(record.data.title, 180),
    purpose: text(record.data.purpose, 1200),
    questions,
    retentionUntil: record.data.retentionUntil,
    kind,
  };
  if (
    !date(schema.retentionUntil) ||
    (!allowExpired &&
      schema.retentionUntil < new Date().toISOString().slice(0, 10))
  )
    fail(
      422,
      "intake_retention",
      "Choose a current or future retention review date before publishing.",
    );
  if (Buffer.byteLength(JSON.stringify(schema)) > INTAKE_LIMITS.schemaBytes)
    fail(422, "intake_schema", "The published schema must fit 12,000 bytes.");
  return schema;
}

export function intakeAnswers(schema, input) {
  if (!plain(input)) fail(422, "intake_answers", "Answers must be an object.");
  const questions = new Map(schema.questions.map((q) => [q.key, q]));
  if (Object.keys(input).some((key) => !questions.has(key)))
    fail(422, "intake_answers", "Remove answers to unknown questions.");
  const answers = {};
  for (const q of schema.questions) {
    const v = Object.hasOwn(input, q.key) ? input[q.key] : undefined;
    if (v === undefined || v === null || v === "") {
      if (q.required) fail(422, "intake_required", `Answer ${q.label}.`);
      answers[q.key] = null;
    } else if (q.type === "text") {
      const value = text(
        v,
        q.key === "email" ? 254 : q.key === "name" ? 180 : INTAKE_LIMITS.text,
        q.required,
      );
      if (
        q.key === "email" &&
        value &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      )
        fail(422, "intake_email", "Enter a valid operational email address.");
      answers[q.key] = value || null;
    } else if (q.type === "number") {
      if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 1e9)
        fail(
          422,
          "intake_number",
          "Use a finite number between −1 billion and 1 billion.",
        );
      answers[q.key] = v;
    } else if (q.type === "boolean") {
      if (typeof v !== "boolean")
        fail(422, "intake_boolean", "Use true or false for a yes/no answer.");
      answers[q.key] = v;
    } else if (q.type === "date") {
      if (!date(v))
        fail(422, "intake_date", "Use a valid date in YYYY-MM-DD format.");
      answers[q.key] = v;
    } else if (q.type === "select") {
      if (!q.options.includes(v))
        fail(422, "intake_select", "Choose one of the published options.");
      answers[q.key] = v;
    } else fail(422, "intake_schema", "This question type is unavailable.");
  }
  if (Buffer.byteLength(JSON.stringify(answers)) > INTAKE_LIMITS.requestBytes)
    fail(413, "intake_size", "These answers are too large.");
  return answers;
}

function approved(record, revision, allowed) {
  return (
    !!record &&
    record.revision === revision &&
    allowed.includes(record.status) &&
    record.approval?.status === "approved" &&
    record.approval.revision === record.revision &&
    typeof record.approval.actorId === "string" &&
    !!record.approval.actorId &&
    record.approval.actorId !== record.lastEditedBy
  );
}
function savedFeedbackSchema(publication) {
  if (publication.target_id !== null || publication.target_module !== null || publication.target_revision !== null)
    return null;
  try {
    return requireFeedbackPublicationSchema(publication.schema);
  } catch (error) {
    if (["feedback_schema", "feedback_retention"].includes(error?.code)) return null;
    throw error;
  }
}

function exactFeedbackBody(bytes, fields) {
  let parsed;
  try {
    parsed = parseBackupJson(bytes, INTAKE_LIMITS.requestBytes);
  } catch (error) {
    if (error?.code === "backup_json")
      fail(400, "intake_json", "Supply valid UTF-8 JSON with each field used once.");
    throw error;
  }
  exact(parsed, fields);
  if (Object.keys(parsed).length !== fields.length)
    fail(422, "intake_fields", "Supply all documented feedback fields.");
  return parsed;
}

function feedbackAnswers(input) {
  try {
    return feedbackSelection(input);
  } catch (error) {
    if (error?.code === "feedback_choices") fail(422, error.code, error.message);
    throw error;
  }
}

function fixedFeedbackSchema(record) {
  if (!record || record.moduleId !== "forms") return null;
  try { return feedbackSchemaFromReviewedFormData(record.data); }
  catch (error) {
    if (["feedback_form_profile", "feedback_retention"].includes(error?.code)) return null;
    throw error;
  }
}

export function publicationAccepting(publication, source, target, { today = new Date().toISOString().slice(0, 10) } = {}) {
  if (
    publication.withdrawn_at ||
    !approved(source, publication.source_revision, ["published"]) ||
    source.moduleId !== "forms" ||
    source.data.kind !== "form"
  )
    return false;
  if (publication.kind === "feedback") {
    const saved = savedFeedbackSchema(publication);
    if (!saved || !date(today) || saved.retentionUntil < today) return false;
    return fixedFeedbackSchema(source)?.retentionUntil === saved.retentionUntil;
  }
  if (
    !date(publication.schema.retentionUntil) ||
    publication.schema.retentionUntil < today
  )
    return false;
  if (!publication.target_id) return true;
  const volunteer = publication.kind === "volunteer-interest";
  return (
    approved(
      target,
      publication.target_revision,
      volunteer ? ["approved", "open"] : ["approved", "scheduled", "open"],
    ) &&
    target.moduleId === (volunteer ? "volunteers" : "events") &&
    target.data.kind === (volunteer ? "shift" : "session")
  );
}
async function readPublication(c, org, publicationId, required = true) {
  const publication = (
    await c.query("SELECT * FROM os_publications WHERE org_id=$1 AND id=$2", [
      org,
      publicationId,
    ])
  ).rows[0];
  if (!publication && required)
    fail(404, "intake_unavailable", "This intake is unavailable.");
  return publication;
}

export async function publicationState(c, org, publicationId, unavailable = true) {
  return currentPublicationState(c, org, await readPublication(c, org, publicationId), unavailable);
}

async function currentPublicationState(c, org, publication, unavailable = true) {
  const records = (
    await c.query(
      "SELECT * FROM os_records WHERE org_id=$1 AND deleted_at IS NULL AND id=ANY($2::text[])",
      [org, [publication.record_id, publication.target_id].filter(Boolean)],
    )
  ).rows.map(rowRecord);
  const accepting = publicationAccepting(
    publication,
    records.find((r) => r.id === publication.record_id),
    records.find((r) => r.id === publication.target_id),
  );
  if (unavailable && !accepting)
    fail(
      404,
      "intake_unavailable",
      "This intake is closed or its published version has changed.",
    );
  return { publication, accepting, records };
}
const publicUrl = (settings, org, publicationId) =>
  `${settings.origin}/p/${org}.${publicationId}`;
const safeSubmission = (r, feedback = false) => ({
  id: r.id,
  publicationId: r.publication_id,
  status: r.status,
  revision: r.revision,
  answers: r.answers,
  consentAt: time(r.consent_at),
  createdAt: time(r.created_at),
  reviewedAt: time(r.reviewed_at),
  erasedAt: time(r.erased_at),
  convertedIds: r.converted_ids,
  ...(feedback ? { kind: "feedback" } : {}),
});
const publicStatus = (row) => ({ status: row.status });
async function lock(c, org) {
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [org]);
}

async function requireFeedbackCollectionLayout(c) {
  if (!(await feedbackIntakeSchemaReady(c)))
    fail(404, "intake_unavailable", "This feedback form is not accepting new responses.");
}

export async function publicIntakeRoutes({
  request,
  url = new URL(request.url),
  db,
  settings,
}) {
  const match =
    /^\/api\/public\/intake\/([A-Za-z0-9_-]{1,100})\/([A-Za-z0-9_-]{1,100})(?:\/(submissions|receipt))?$/.exec(
      url.pathname,
    );
  if (!match) return null;
  // Vercel forwards the unused /api/:path* rewrite capture as a query field.
  // Ignore only that single, exact routing value; receipt/query data stays forbidden.
  const query = new URLSearchParams(url.search),
    routingPaths = query.getAll("path");
  if (
    routingPaths.length === 1 &&
    routingPaths[0] === url.pathname.slice("/api/".length)
  )
    query.delete("path");
  if (query.size)
    fail(
      400,
      "intake_query",
      "Use the request body for intake actions; query tokens are not accepted.",
    );
  const [, org, publicationId, action] = match;
  if (request.method === "GET" && !action)
    return db.tx(null, org, async (c) => {
      const { publication } = await publicationState(c, org, publicationId);
      const feedback = publication.kind === "feedback";
      if (feedback) await requireFeedbackCollectionLayout(c);
      const organizationName = (
        await c.query("SELECT name FROM os_orgs WHERE id=$1", [org])
      ).rows[0]?.name;
      return okay({
        publication: {
          id: publication.id,
          organizationName,
          ...publication.schema,
          consentText: feedback ? FEEDBACK_INTAKE_CONSENT : consentText,
          message: feedback ? feedbackMessage : message,
          ...(feedback ? { notice: feedbackNotice } : {}),
          limits: INTAKE_LIMITS,
          url: publicUrl(settings, org, publicationId),
        },
      });
    });
  if (request.method !== "POST" || !["submissions", "receipt"].includes(action))
    fail(405, "method", "Use the documented intake method.");
  checkOrigin(request, settings.origin);
  if (
    !/^application\/json(?:;|$)/i.test(
      request.headers.get("content-type") || "",
    )
  )
    fail(415, "content_type", "Supply JSON.");
  let bytes, input;
  try { bytes = await readBackupBodyBytes(request, INTAKE_LIMITS.requestBytes); }
  catch (error) {
    if (error?.status === 413) fail(413, "size", "This request is too large.");
    throw error;
  }
  // Preserve the existing parsing semantics for the three ordinary kinds.
  // Feedback rechecks the same wire bytes with the stricter lexical reader.
  try { input = JSON.parse(bytes.toString("utf8") || "{}"); }
  catch { fail(400, "json", "Supply valid JSON."); }
  const ip = (
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown"
  )
    .split(",")[0]
    .trim()
    .slice(0, 100);
  const ipHash = createHmac("sha256", settings.secret)
    .update(`intake-ip:${ip}`)
    .digest("hex");
  await db.limit(`intake-ip:${ipHash}`, action === "receipt" ? 60 : 20, 3600);
  if (action === "receipt") {
    exact(input, ["receipt", "action"]);
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(input.receipt || "") ||
      !["status", "cancel"].includes(input.action)
    )
      fail(404, "intake_receipt", "This receipt is unavailable.");
    return db.tx(
      null,
      org,
      async (c) => {
        await lock(c, org);
        const row = (
          await c.query(
            "SELECT * FROM os_intake WHERE org_id=$1 AND publication_id=$2 AND receipt_hash=$3 FOR UPDATE",
            [org, publicationId, hash(input.receipt)],
          )
        ).rows[0];
        if (!row) fail(404, "intake_receipt", "This receipt is unavailable.");
        const publication = await readPublication(c, org, publicationId, false);
        const feedback = publication?.kind === "feedback";
        if (feedback) exactFeedbackBody(bytes, ["receipt", "action"]);
        if (input.action === "cancel" && row.status !== "cancelled") {
          await c.query(
            "UPDATE os_intake SET status='cancelled',cancelled_at=now(),revision=revision+1,updated_at=now() WHERE org_id=$1 AND id=$2",
            [org, row.id],
          );
          await audit(c, org, "public-intake", "intake.cancelled", null, {
            intakeId: row.id,
            converted: row.converted_ids.length > 0,
          });
          row.status = "cancelled";
        } else if (feedback) notePublicFeedbackReceiptReplay(c, org);
        return okay({
          ...publicStatus(row),
          ...(feedback ? { kind: "feedback" } : {}),
          participantClaimAvailable:
            !feedback &&
            !row.erased_at &&
            typeof row.answers?.email === "string" &&
            !!row.answers.email.trim() &&
            publication?.schema?.questions?.some((q) => q.key === "email") ===
              true,
        });
      },
      { lock: true },
    );
  }
  exact(input, ["answers", "consent", "website", "idempotencyKey"]);
  if (input.consent !== true)
    fail(
      422,
      "intake_consent",
      "Explicit agreement to this collection purpose is required.",
    );
  if (input.website !== undefined && input.website !== "")
    fail(422, "intake_honeypot", "Leave the website field blank.");
  if (
    typeof input.idempotencyKey !== "string" ||
    !/^[A-Za-z0-9_-]{16,100}$/.test(input.idempotencyKey)
  )
    fail(
      422,
      "intake_identity",
      "Supply a client request identifier of 16–100 simple characters.",
    );
  return db.tx(
    null,
    org,
    async (c) => {
      await lock(c, org);
      const publication = await readPublication(c, org, publicationId);
      const feedback = publication.kind === "feedback";
      let answers;
      if (feedback) {
        const received = exactFeedbackBody(bytes, ["answers", "consent", "website", "idempotencyKey"]);
        if (!savedFeedbackSchema(publication))
          fail(404, "intake_unavailable", "This intake is unavailable.");
        answers = feedbackAnswers(received.answers);
      } else {
        await currentPublicationState(c, org, publication);
        answers = intakeAnswers(publication.schema, input.answers);
      }
      const payloadHash = hash({ answers, consent: true });
      const old = (
        await c.query(
          "SELECT * FROM os_intake WHERE org_id=$1 AND publication_id=$2 AND idempotency_hash=$3",
          [org, publicationId, hash(input.idempotencyKey)],
        )
      ).rows[0];
      if (old) {
        if ((feedback && old.erased_at) || old.payload_hash !== payloadHash)
          fail(
            409,
            "intake_identity",
            "This request identifier was already used for different answers.",
          );
        if (feedback) notePublicFeedbackReceiptReplay(c, org);
        return okay(publicStatus(old));
      }
      if (feedback) {
        await requireFeedbackCollectionLayout(c);
        await currentPublicationState(c, org, publication);
      }
      const submissionIpHash = feedback ? null : ipHash;
      const receipt = randomBytes(32).toString("base64url"),
        submissionId = id(),
        encoded = JSON.stringify(answers);
      const candidate = {
        org_id: org,
        id: submissionId,
        publication_id: publicationId,
        answers,
        consent_at: new Date().toISOString(),
        status: "pending",
        revision: 1,
        idempotency_hash: hash(input.idempotencyKey),
        payload_hash: payloadHash,
        receipt_hash: hash(receipt),
        ip_hash: submissionIpHash,
        reviewed_by: null,
        reviewed_at: null,
        converted_ids: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const usage = (
        await c.query(
          "SELECT count(*) FILTER (WHERE status IN ('pending','reviewed')) AS count,COALESCE(sum(octet_length(to_jsonb(i)::text)) FILTER (WHERE status IN ('pending','reviewed')),0) AS bytes,count(*) FILTER (WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS daily,octet_length($2::jsonb::text)+1000 AS candidate_bytes FROM os_intake i WHERE org_id=$1",
          [org, JSON.stringify(candidate)],
        )
      ).rows[0];
      if (Number(usage.daily) >= INTAKE_LIMITS.daily)
        fail(
          429,
          "intake_daily",
          "This organization has reached its daily request limit. Please try another day.",
        );
      if (
        Number(usage.count) >= INTAKE_LIMITS.pendingCount ||
        Number(usage.bytes) + Number(usage.candidate_bytes) >
          INTAKE_LIMITS.pendingBytes
      )
        fail(
          422,
          "intake_quota",
          "This organization's review queue is full. Please contact the organizer another way.",
        );
      await c.query(
        "INSERT INTO os_intake(org_id,id,publication_id,answers,consent_at,status,revision,idempotency_hash,payload_hash,receipt_hash,ip_hash) VALUES($1,$2,$3,$4,now(),'pending',1,$5,$6,$7,$8)",
        [
          org,
          submissionId,
          publicationId,
          encoded,
          hash(input.idempotencyKey),
          payloadHash,
          hash(receipt),
          submissionIpHash,
        ],
      );
      await audit(c, org, "public-intake", "intake.received", null, {
        intakeId: submissionId,
        publicationId,
      });
      return okay(
        {
          status: "pending",
          receipt,
          receiptUrl: `${settings.origin}/p/receipt#${org}.${publicationId}.${receipt}`,
          message: feedback ? feedbackMessage : message,
        },
        201,
      );
    },
    { lock: true },
  );
}

export async function intakeRoutes({
  c,
  org,
  user,
  member,
  session,
  tail,
  method,
  input = {},
  url,
  settings,
}) {
  if (!/^intake(?:\/|$)/.test(tail)) return null;
  requireAdmin(member);
  let feedbackAccess;
  async function canReadFeedback() {
    if (feedbackAccess !== undefined) return feedbackAccess;
    feedbackAccess = false;
    if (session && canManageFeedbackIntake(member)) {
      await lock(c, org);
      await requireFeedbackIntakeStaff(c, org, session, { readOnly: method === "GET" });
      feedbackAccess = true;
    }
    return feedbackAccess;
  }
  if (tail === "intake/publications" && method === "GET") {
    const includeFeedback = await canReadFeedback();
    const rows = (
      await c.query(
        "SELECT * FROM os_publications WHERE org_id=$1 AND ($2::boolean OR kind<>'feedback') ORDER BY created_at DESC,id DESC LIMIT 1000",
        [org, includeFeedback],
      )
    ).rows;
    const records = await allRecords(c, org);
    const enabled = includeFeedback && await feedbackIntakeSchemaReady(c);
    const today = enabled ? (await c.query(
      "SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD') AS day",
    )).rows[0]?.day : null;
    const linked = new Set(rows.filter(r => r.kind === "feedback").map(r => `${r.record_id}:${r.source_revision}`));
    const feedbackFormCandidates = enabled && date(today) ? records.flatMap(record => {
      if (!approved(record, record.revision, ["published"]) || linked.has(`${record.id}:${record.revision}`))
        return [];
      const schema = fixedFeedbackSchema(record);
      return schema && schema.retentionUntil >= today
        ? [{ id: record.id, revision: record.revision, title: schema.title, retentionUntil: schema.retentionUntil }] : [];
    }) : [];
    return okay({
      ...(enabled ? { feedbackIntakeAvailable: true, feedbackFormCandidates } : {}),
      publications: rows.map((r) => ({
        id: r.id,
        recordId: r.record_id,
        sourceRevision: r.source_revision,
        kind: r.kind,
        targetId: r.target_id,
        targetRevision: r.target_revision,
        title: r.schema.title,
        createdAt: time(r.created_at),
        withdrawnAt: time(r.withdrawn_at),
        accepting: (r.kind !== "feedback" || enabled) && publicationAccepting(
          r,
          records.find((x) => x.id === r.record_id),
          records.find((x) => x.id === r.target_id),
        ),
        url: publicUrl(settings, org, r.id),
      })),
    });
  }
  if (tail === "intake/publications" && method === "POST") {
    exact(input, [
      "recordId",
      "revision",
      "kind",
      "targetId",
      "targetRevision",
    ]);
    await lock(c, org);
    const records = await allRecords(c, org),
      source = records.find((r) => r.id === input.recordId),
      target = records.find((r) => r.id === input.targetId);
    if (
      !source ||
      !Number.isInteger(input.revision) ||
      source.revision !== input.revision
    )
      fail(409, "revision", "Reload the form before publishing.");
    if (fixedFeedbackSchema(source))
      fail(422, "feedback_publication_route", "Publish a fixed feedback form through the anonymous feedback setup.");
    const schema = intakeSchema(source, input.kind),
      publication = {
        id: id(),
        record_id: source.id,
        source_revision: source.revision,
        kind: input.kind,
        schema,
        target_id: input.targetId || null,
        target_module:
          input.kind === "event-interest"
            ? "events"
            : input.kind === "volunteer-interest"
              ? "volunteers"
              : null,
        target_revision: input.targetRevision || null,
      };
    if (
      (input.kind === "contact" && input.targetId) ||
      (!input.targetId && input.targetRevision) ||
      (input.targetId &&
        (!Number.isInteger(input.targetRevision) || !opaque(input.targetId)))
    )
      fail(
        422,
        "intake_target",
        "Use a matching reviewed target and revision, or omit both target fields.",
      );
    if (!publicationAccepting(publication, source, target))
      fail(
        409,
        "intake_approval",
        "Publish only the current independently approved form revision and, when linked, its current approved session or shift.",
      );
    if (input.kind === "volunteer-interest" && target) await refuseProtectedVolunteerOrientation(c, org, target);
    const daily = Number(
      (
        await c.query(
          "SELECT count(*) AS count FROM os_publications WHERE org_id=$1 AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
          [org],
        )
      ).rows[0].count,
    );
    if (daily >= INTAKE_LIMITS.daily)
      fail(
        429,
        "intake_daily",
        "This organization has reached its daily publication limit.",
      );
    await c.query(
      "INSERT INTO os_publications(org_id,id,record_id,source_revision,kind,target_id,target_module,target_revision,schema,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        org,
        publication.id,
        source.id,
        source.revision,
        input.kind,
        publication.target_id,
        publication.target_module,
        publication.target_revision,
        JSON.stringify(schema),
        user,
      ],
    );
    await audit(c, org, user, "intake.published", source, {
      publicationId: publication.id,
      kind: input.kind,
      targetId: publication.target_id,
    });
    return okay(
      {
        publication: {
          id: publication.id,
          recordId: source.id,
          sourceRevision: source.revision,
          kind: input.kind,
          targetId: publication.target_id,
          targetRevision: publication.target_revision,
          title: schema.title,
          accepting: true,
          url: publicUrl(settings, org, publication.id),
        },
      },
      201,
    );
  }
  const withdraw =
    /^intake\/publications\/([A-Za-z0-9_-]{1,100})\/withdraw$/.exec(tail);
  if (withdraw && method === "POST") {
    const { publication } = await publicationState(c, org, withdraw[1], false);
    if (publication.kind === "feedback" && !(await canReadFeedback()))
      fail(404, "intake_unavailable", "This intake is unavailable.");
    if (publication.kind === "feedback" && publication.withdrawn_at)
      notePublicFeedbackReceiptReplay(c, org);
    if (!publication.withdrawn_at) {
      await c.query(
        "UPDATE os_publications SET withdrawn_at=now() WHERE org_id=$1 AND id=$2",
        [org, publication.id],
      );
      await audit(c, org, user, "intake.publication.withdrawn", null, {
        publicationId: publication.id,
      });
    }
    return okay({ withdrawn: true });
  }
  if (tail === "intake/submissions" && method === "GET") {
    const publicationId = url?.searchParams.get("publicationId") || null,
      status = url?.searchParams.get("status") || null,
      cursor = url?.searchParams.get("cursor") || null;
    if (
      (publicationId && !opaque(publicationId)) ||
      (cursor && !opaque(cursor)) ||
      (status && !statuses.includes(status))
    )
      fail(
        422,
        "intake_filter",
        "Choose a valid publication, status or page cursor.",
      );
    const includeFeedback = await canReadFeedback();
    const visible = "(p.kind<>'feedback' OR $5::boolean)";
    // An excluded cursor must not establish an ordering cut in a visible queue.
    if (publicationId && !(await c.query(
      "SELECT 1 FROM os_publications p WHERE org_id=$1 AND id=$2 AND (p.kind<>'feedback' OR $3::boolean)",
      [org, publicationId, includeFeedback],
    )).rows.length) fail(404, "intake_submission", "This request is unavailable.");
    if (cursor && !(await c.query(
      "SELECT 1 FROM os_intake i JOIN os_publications p ON p.org_id=i.org_id AND p.id=i.publication_id " +
      "WHERE i.org_id=$1 AND i.id=$2 AND (p.kind<>'feedback' OR $3::boolean)",
      [org, cursor, includeFeedback],
    )).rows.length) fail(404, "intake_submission", "This request is unavailable.");
    const rows = (
      await c.query(
        `SELECT i.*,p.kind AS publication_kind FROM os_intake i
         JOIN os_publications p ON p.org_id=i.org_id AND p.id=i.publication_id
         WHERE i.org_id=$1 AND ($2::text IS NULL OR i.publication_id=$2) AND ($3::text IS NULL OR i.status=$3)
           AND ($4::text IS NULL OR (i.created_at,i.id)<(SELECT created_at,id FROM os_intake WHERE org_id=$1 AND id=$4))
           AND ${visible} ORDER BY i.created_at DESC,i.id DESC LIMIT 101`,
        [org, publicationId, status, cursor, includeFeedback],
      )
    ).rows;
    return okay({
      submissions: rows.slice(0, 100).map(r => safeSubmission(r, r.publication_kind === "feedback")),
      nextCursor: rows.length > 100 ? rows[99].id : null,
    });
  }
  const item =
    /^intake\/submissions\/([A-Za-z0-9_-]{1,100})(?:\/(review))?$/.exec(tail);
  if (!item) fail(404, "intake_route", "This intake action is unavailable.");
  const row = (
    await c.query(
      `SELECT *, (SELECT p.kind FROM os_publications p WHERE p.org_id=os_intake.org_id AND p.id=os_intake.publication_id)
         AS publication_kind FROM os_intake WHERE org_id=$1 AND id=$2${["GET", "HEAD"].includes(method) ? "" : " FOR UPDATE"}`,
      [org, item[1]],
    )
  ).rows[0];
  if (!row) fail(404, "intake_submission", "This request is unavailable.");
  const feedback = row.publication_kind === "feedback";
  if (feedback && !(await canReadFeedback()))
    fail(404, "intake_submission", "This request is unavailable.");
  if (method === "GET" && !item[2])
    return okay({ submission: safeSubmission(row, feedback) });
  if (method !== "POST" || item[2] !== "review")
    fail(405, "method", "Use the documented intake method.");
  exact(input, ["revision", "action", "contactId"]);
  if (feedback && (input.contactId !== undefined || input.action === "convert"))
    fail(409, "feedback_conversion", "Use the anonymous feedback draft workflow for this submission.");
  if (feedback && input.action === "erase" && row.erased_at &&
      Number.isInteger(input.revision) && input.revision > 0 && input.revision <= row.revision) {
    notePublicFeedbackReceiptReplay(c, org);
    return okay({ submission: safeSubmission(row, true), records: [] });
  }
  if (!Number.isInteger(input.revision) || input.revision !== row.revision)
    fail(409, "revision", "Reload this request before reviewing it.");
  if (input.action === "erase") {
    const erased = (
      await c.query(
        "UPDATE os_intake SET answers='{}'::jsonb,erased_at=COALESCE(erased_at,now()),status=CASE WHEN status IN ('pending','reviewed') THEN 'dismissed' ELSE status END,ip_hash=NULL,payload_hash=NULL,revision=revision+1,updated_at=now() WHERE org_id=$1 AND id=$2 RETURNING *",
        [org, row.id],
      )
    ).rows[0];
    if (!feedback) await suppressParticipationDelivery(c, {
      org,
      intakeId: row.id,
      reason: "erased",
    });
    await audit(c, org, user, "intake.erased", null, {
      intakeId: row.id,
      converted: row.converted_ids.length > 0,
    });
    return okay({ submission: safeSubmission(erased, feedback), records: [] });
  }
  if (!["review", "dismiss", "convert"].includes(input.action))
    fail(422, "intake_review", "Choose review, dismiss, convert or erase.");
  if (row.erased_at)
    fail(
      409,
      "intake_erased",
      "Submitted answers were erased. This request cannot create new drafts.",
    );
  if (!["pending", "reviewed"].includes(row.status))
    fail(
      409,
      "intake_state",
      "This request has already been closed or converted.",
    );
  const converted = [],
    conversionIds = [];
  if (input.action === "convert") {
    if (row.status !== "reviewed")
      fail(
        409,
        "intake_review",
        "Review this request before converting it into drafts.",
      );
    const { publication, records: sources } = await publicationState(
      c,
      org,
      row.publication_id,
    );
    if (publication.kind === "feedback")
      fail(409, "feedback_conversion", "Use the anonymous feedback draft workflow for this submission.");
    const records = await allRecords(c, org),
      contactId = input.contactId || id();
    let contact = records.find((r) => r.id === input.contactId);
    if (
      input.contactId &&
      (!opaque(input.contactId) ||
        !contact ||
        contact.moduleId !== "contacts" ||
        !visibleRecord(contact, member))
    )
      fail(
        422,
        "intake_contact",
        "Choose a readable operational contact in this organization.",
      );
    const envelope = (moduleId, recordId, data) => ({
      id: recordId,
      orgId: org,
      moduleId,
      data,
      status: getModule(moduleId).workflow.initial,
      ownerId: user,
      lastEditedBy: user,
      revision: 1,
      approval: null,
      snapshot: null,
      source: null,
    });
    if (!contact) {
      const name =
          typeof row.answers.name === "string" ? row.answers.name : null,
        address =
          typeof row.answers.email === "string" ? row.answers.email : null;
      if (!name && !address)
        fail(
          422,
          "intake_contact",
          "Choose an existing contact, or collect a minimal name or operational email in the reserved name/email questions.",
        );
      if (
        address &&
        records.some(
          (r) =>
            r.moduleId === "contacts" &&
            r.data.email?.toLowerCase() === address.toLowerCase(),
        )
      )
        fail(
          409,
          "intake_contact",
          "An operational contact already uses this email. Choose that contact explicitly after reviewing identity.",
        );
      contact = envelope("contacts", contactId, {
        title: name || "Intake contact",
        kind: "person-reference",
        displayLabel: name || "Intake contact",
        email: address,
        contactPreference: "permission-needed",
        purpose: publication.schema.purpose,
      });
      contact.data = validateRecord("contacts", contact.data, {
        orgId: org,
        recordId: contact.id,
        status: "draft",
        records,
      });
      records.push(contact);
      converted.push(contact);
    }
    conversionIds.push({ id: contact.id, moduleId: "contacts" });
    if (publication.target_id) {
      const moduleId = publication.target_module,
        target = sources.find((r) => r.id === publication.target_id),
        key = moduleId === "events" ? "eventId" : "shiftId";
      const draft = envelope(moduleId, id(), {
        title: `Intake request ${row.id.slice(0, 8)}`,
        kind: moduleId === "events" ? "registration" : "assignment",
        contactId: contact.id,
        [key]: target.id,
        programId: target.data.programId,
      });
      // Managed targets prepare nonallocating candidates, including waitlists.
      // Their allocation gateway owns the final capacity/overlap check.
      if (!(await isManagedParticipationTarget(c, org, target.id)))
        validateRecord(moduleId, draft.data, {
          participation: moduleId === "volunteers" ? await participationValidationContext(c, org) : undefined,
          orgId: org,
          recordId: draft.id,
          status: moduleId === "events" ? "scheduled" : "assigned",
          records,
        });
      draft.data = validateRecord(moduleId, draft.data, {
        participation: moduleId === "volunteers" ? await participationValidationContext(c, org) : undefined,
        orgId: org,
        recordId: draft.id,
        status: "draft",
        records,
      });
      converted.push(draft);
      conversionIds.push({ id: draft.id, moduleId: draft.moduleId });
    }
    for (const record of converted) {
      await saveRecord(c, record);
      await audit(c, org, user, "record.created", record, {
        viaIntake: row.id,
        publicationId: row.publication_id,
      });
    }
  }
  const next =
    input.action === "convert"
      ? "converted"
      : input.action === "dismiss"
        ? "dismissed"
        : "reviewed";
  const changed = (
    await c.query(
      "UPDATE os_intake SET status=$3,revision=revision+1,reviewed_by=$4,reviewed_at=now(),converted_ids=$5,updated_at=now() WHERE org_id=$1 AND id=$2 RETURNING *",
      [org, row.id, next, user, JSON.stringify(conversionIds)],
    )
  ).rows[0];
  if (next === "reviewed") {
    const pending = (
      await c.query(
        "SELECT COALESCE(sum(octet_length(to_jsonb(i)::text)),0) AS bytes FROM os_intake i WHERE org_id=$1 AND status IN ('pending','reviewed')",
        [org],
      )
    ).rows[0];
    if (Number(pending.bytes) > INTAKE_LIMITS.pendingBytes)
      fail(
        422,
        "intake_quota",
        "This review queue reached its 8 MiB limit. Dismiss or erase older requests before continuing.",
      );
  }
  await audit(c, org, user, `intake.${next}`, null, {
    intakeId: row.id,
    publicationId: row.publication_id,
    recordIds: conversionIds.map((r) => r.id),
  });
  return okay({
    submission: safeSubmission(changed, feedback),
    records: converted.map((r) => ({
      id: r.id,
      moduleId: r.moduleId,
      status: r.status,
    })),
  });
}
