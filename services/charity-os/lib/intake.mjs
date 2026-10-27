import { createHmac, randomBytes } from "node:crypto";
import { requireAdmin, visibleRecord } from "./access.mjs";
import { allRecords, rowRecord, saveRecord, audit } from "./database.mjs";
import { getModule, validateRecord } from "./modules.mjs";
import { body, checkOrigin, fail, hash, id, json } from "./security.mjs";

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
export function publicationAccepting(publication, source, target) {
  if (
    publication.withdrawn_at ||
    !approved(source, publication.source_revision, ["published"]) ||
    source.moduleId !== "forms" ||
    source.data.kind !== "form"
  )
    return false;
  if (
    !date(publication.schema.retentionUntil) ||
    publication.schema.retentionUntil < new Date().toISOString().slice(0, 10)
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
export async function publicationState(
  c,
  org,
  publicationId,
  unavailable = true,
) {
  const publication = (
    await c.query("SELECT * FROM os_publications WHERE org_id=$1 AND id=$2", [
      org,
      publicationId,
    ])
  ).rows[0];
  if (!publication)
    fail(404, "intake_unavailable", "This intake is unavailable.");
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
const safeSubmission = (r) => ({
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
});
const publicStatus = (row) => ({ status: row.status });
async function lock(c, org) {
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [org]);
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
      const organizationName = (
        await c.query("SELECT name FROM os_orgs WHERE id=$1", [org])
      ).rows[0]?.name;
      return okay({
        publication: {
          id: publication.id,
          organizationName,
          ...publication.schema,
          consentText,
          message,
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
  const input = await body(request, INTAKE_LIMITS.requestBytes);
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
        if (input.action === "cancel" && row.status !== "cancelled") {
          await c.query(
            "UPDATE os_intake SET status='cancelled',revision=revision+1,updated_at=now() WHERE org_id=$1 AND id=$2",
            [org, row.id],
          );
          await audit(c, org, "public-intake", "intake.cancelled", null, {
            intakeId: row.id,
            converted: row.converted_ids.length > 0,
          });
          row.status = "cancelled";
        }
        const publication = (
          await c.query(
            "SELECT * FROM os_publications WHERE org_id=$1 AND id=$2",
            [org, publicationId],
          )
        ).rows[0];
        return okay({
          ...publicStatus(row),
          participantClaimAvailable:
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
      const { publication } = await publicationState(c, org, publicationId);
      const answers = intakeAnswers(publication.schema, input.answers),
        payloadHash = hash({ answers, consent: true });
      const old = (
        await c.query(
          "SELECT * FROM os_intake WHERE org_id=$1 AND publication_id=$2 AND idempotency_hash=$3",
          [org, publicationId, hash(input.idempotencyKey)],
        )
      ).rows[0];
      if (old) {
        if (old.payload_hash !== payloadHash)
          fail(
            409,
            "intake_identity",
            "This request identifier was already used for different answers.",
          );
        return okay(publicStatus(old));
      }
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
        ip_hash: ipHash,
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
          ipHash,
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
          message,
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
  tail,
  method,
  input = {},
  url,
  settings,
}) {
  if (!/^intake(?:\/|$)/.test(tail)) return null;
  requireAdmin(member);
  if (tail === "intake/publications" && method === "GET") {
    const rows = (
      await c.query(
        "SELECT * FROM os_publications WHERE org_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1000",
        [org],
      )
    ).rows;
    const records = await allRecords(c, org);
    return okay({
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
        accepting: publicationAccepting(
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
    const rows = (
      await c.query(
        "SELECT * FROM os_intake WHERE org_id=$1 AND ($2::text IS NULL OR publication_id=$2) AND ($3::text IS NULL OR status=$3) AND ($4::text IS NULL OR (created_at,id)<(SELECT created_at,id FROM os_intake WHERE org_id=$1 AND id=$4)) ORDER BY created_at DESC,id DESC LIMIT 101",
        [org, publicationId, status, cursor],
      )
    ).rows;
    return okay({
      submissions: rows.slice(0, 100).map(safeSubmission),
      nextCursor: rows.length > 100 ? rows[99].id : null,
    });
  }
  const item =
    /^intake\/submissions\/([A-Za-z0-9_-]{1,100})(?:\/(review))?$/.exec(tail);
  if (!item) fail(404, "intake_route", "This intake action is unavailable.");
  const row = (
    await c.query(
      "SELECT * FROM os_intake WHERE org_id=$1 AND id=$2 FOR UPDATE",
      [org, item[1]],
    )
  ).rows[0];
  if (!row) fail(404, "intake_submission", "This request is unavailable.");
  if (method === "GET" && !item[2])
    return okay({ submission: safeSubmission(row) });
  if (method !== "POST" || item[2] !== "review")
    fail(405, "method", "Use the documented intake method.");
  exact(input, ["revision", "action", "contactId"]);
  if (!Number.isInteger(input.revision) || input.revision !== row.revision)
    fail(409, "revision", "Reload this request before reviewing it.");
  if (input.action === "erase") {
    const erased = (
      await c.query(
        "UPDATE os_intake SET answers='{}'::jsonb,erased_at=COALESCE(erased_at,now()),status=CASE WHEN status IN ('pending','reviewed') THEN 'dismissed' ELSE status END,ip_hash=NULL,payload_hash=NULL,revision=revision+1,updated_at=now() WHERE org_id=$1 AND id=$2 RETURNING *",
        [org, row.id],
      )
    ).rows[0];
    await audit(c, org, user, "intake.erased", null, {
      intakeId: row.id,
      converted: row.converted_ids.length > 0,
    });
    return okay({ submission: safeSubmission(erased), records: [] });
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
      // Check live capacity/duplicates/overlaps without representing the result as a booking.
      validateRecord(moduleId, draft.data, {
        orgId: org,
        recordId: draft.id,
        status: moduleId === "events" ? "scheduled" : "assigned",
        records,
      });
      draft.data = validateRecord(moduleId, draft.data, {
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
    submission: safeSubmission(changed),
    records: converted.map((r) => ({
      id: r.id,
      moduleId: r.moduleId,
      status: r.status,
    })),
  });
}
