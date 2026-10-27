import { audit, rowRecord } from "./database.mjs";
import {
  intakeAnswers,
  publicationAccepting,
  consentText,
  INTAKE_LIMITS,
} from "./intake.mjs";
import { body, checkCsrf, fail, hash, id, json } from "./security.mjs";

export const PARTICIPANT_LIMITS = Object.freeze({
  page: 20,
  userLinks: 100,
  organizationLinks: 1000,
  requestBytes: 16384,
});
const opaque = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const plain = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const iso = (value) => (value ? new Date(value).toISOString() : null);
const okay = (value, status = 200) =>
  json({ ok: true, ...value }, status, { "referrer-policy": "no-referrer" });
const unavailable = () =>
  fail(404, "participant_request", "This linked request is unavailable.");
function exact(input, allowed) {
  if (!plain(input) || Object.keys(input).some((key) => !allowed.includes(key)))
    fail(422, "participant_fields", "Use only the documented request fields.");
}

export function participantEmail(value) {
  if (typeof value !== "string" || value.length > 254) return null;
  const normalized = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}
export function verifiedParticipant(session) {
  const email = participantEmail(session?.user?.email);
  if (!session?.session?.id || !opaque(session?.user?.id))
    fail(401, "session", "Sign in to continue.");
  if (session.user.emailVerified !== true || !email)
    fail(
      403,
      "participant_verification",
      "Use a verified sign-in email before opening linked requests.",
    );
  return { id: session.user.id, email };
}
export function participantQuery(url, allowed = []) {
  const query = new URLSearchParams(url.search),
    paths = query.getAll("path");
  if (paths.length === 1 && paths[0] === url.pathname.slice("/api/".length))
    query.delete("path");
  if (
    [...query.keys()].some(
      (key) => !allowed.includes(key) || query.getAll(key).length !== 1,
    )
  )
    fail(
      400,
      "participant_query",
      "Use only the documented page cursor; private receipts belong in the request body.",
    );
  return query;
}
const hasEmailQuestion = (publication) =>
  publication?.schema?.questions?.some(
    (question) => question.key === "email" && question.type === "text",
  );
export function participantEditReason(row, publication, accepting, user) {
  if (row.erased_at)
    return "Submitted answers were erased. They cannot be edited.";
  if (row.status !== "pending")
    return "Only a pending request can be corrected.";
  if (!accepting)
    return "This published form version is no longer accepting answers.";
  if (
    !hasEmailQuestion(publication) ||
    participantEmail(row.answers?.email) !== user.email
  )
    return "The original request email must still match your verified account email. Its identity cannot be transferred.";
  return null;
}

// This intentionally does not reuse the staff queue serializer. Never add staff
// review actors, notes, hashes or converted contact/draft references here.
export function participantRequest(
  row,
  publication,
  { org, organizationName, linkedAt, accepting, user },
) {
  const questions = (publication.schema.questions || []).map((q) => ({
    key: q.key,
    label: q.label,
    type: q.type,
    required: q.required === true,
    ...(q.type === "select" ? { options: [...q.options] } : {}),
  }));
  const answers = {};
  if (!row.erased_at)
    for (const q of questions) {
      if (!Object.hasOwn(row.answers || {}, q.key)) continue;
      const value = row.answers[q.key];
      answers[q.key] =
        value === null || ["string", "number", "boolean"].includes(typeof value)
          ? value
          : null;
    }
  const reason = participantEditReason(row, publication, accepting, user);
  return {
    orgId: org,
    id: row.id,
    publicationId: row.publication_id,
    organizationName,
    title: publication.schema.title,
    status: row.status,
    revision: row.revision,
    erasedAt: iso(row.erased_at),
    linkedAt: iso(linkedAt),
    consentAt: iso(row.consent_at),
    createdAt: iso(row.created_at),
    editable: reason === null,
    editUnavailableReason: reason,
    answers,
    publication: {
      title: publication.schema.title,
      purpose: publication.schema.purpose,
      questions,
      retentionUntil: publication.schema.retentionUntil,
      kind: publication.kind,
      consentText,
    },
  };
}

async function ownLink(db, user, org, intakeId) {
  return db.tx(user.id, null, async (c) => {
    const row = (
      await c.query(
        "SELECT id,org_id,intake_id,publication_id,created_at,revision FROM os_participant_links WHERE user_id=$1 AND org_id=$2 AND intake_id=$3 AND revoked_at IS NULL",
        [user.id, org, intakeId],
      )
    ).rows[0];
    if (!row) unavailable();
    return row;
  });
}

// The global index never joins private tenant data. Only this separately scoped
// transaction can read answers, and every join rechecks the active own link.
async function loadOwn(c, user, org, intakeIds, { forUpdate = false } = {}) {
  const rows = (
    await c.query(
      `SELECT l.id AS link_id,l.created_at AS linked_at,i.id,i.publication_id,i.answers,i.status,i.revision,i.consent_at,i.created_at,i.erased_at FROM os_participant_links l JOIN os_intake i ON i.org_id=l.org_id AND i.id=l.intake_id AND i.publication_id=l.publication_id WHERE l.user_id=$1 AND l.org_id=$2 AND l.intake_id=ANY($3::text[]) AND l.revoked_at IS NULL${forUpdate ? " FOR UPDATE OF i,l" : ""}`,
      [user.id, org, intakeIds],
    )
  ).rows;
  if (!rows.length) return [];
  const publications = (
    await c.query(
      "SELECT * FROM os_publications WHERE org_id=$1 AND id=ANY($2::text[])",
      [org, [...new Set(rows.map((r) => r.publication_id))]],
    )
  ).rows;
  const sourceIds = [
    ...new Set(
      publications.flatMap((p) => [p.record_id, p.target_id]).filter(Boolean),
    ),
  ];
  const records = sourceIds.length
    ? (
        await c.query(
          "SELECT * FROM os_records WHERE org_id=$1 AND deleted_at IS NULL AND id=ANY($2::text[])",
          [org, sourceIds],
        )
      ).rows.map(rowRecord)
    : [];
  const organizationName = (
    await c.query("SELECT name FROM os_orgs WHERE id=$1", [org])
  ).rows[0]?.name;
  return rows.flatMap((row) => {
    const publication = publications.find((p) => p.id === row.publication_id);
    if (!publication || !organizationName) return [];
    const accepting = publicationAccepting(
      publication,
      records.find((r) => r.id === publication.record_id),
      records.find((r) => r.id === publication.target_id),
    );
    return [
      {
        row,
        publication,
        accepting,
        linkedAt: row.linked_at,
        organizationName,
      },
    ];
  });
}
const serialize = (loaded, user, org) =>
  participantRequest(loaded.row, loaded.publication, { ...loaded, user, org });
const summary = (detail) =>
  Object.fromEntries(
    [
      "orgId",
      "id",
      "publicationId",
      "organizationName",
      "title",
      "status",
      "revision",
      "erasedAt",
      "editable",
      "linkedAt",
    ].map((key) => [key, detail[key]]),
  );

async function listRequests({ db, user, query }) {
  const cursor = query.get("cursor");
  if (cursor && !/^[a-f0-9]{32}$/.test(cursor))
    fail(
      422,
      "participant_cursor",
      "Use the page cursor returned by this portal.",
    );
  const links = await db.tx(user.id, null, async (c) => {
    if (
      cursor &&
      !(
        await c.query(
          "SELECT id FROM os_participant_links WHERE user_id=$1 AND id=$2 AND revoked_at IS NULL",
          [user.id, cursor],
        )
      ).rows.length
    )
      fail(422, "participant_cursor", "This page cursor is unavailable.");
    return (
      await c.query(
        "SELECT id,org_id,intake_id,publication_id,created_at FROM os_participant_links WHERE user_id=$1 AND revoked_at IS NULL AND ($2::text IS NULL OR (created_at,id)<(SELECT created_at,id FROM os_participant_links WHERE user_id=$1 AND id=$2)) ORDER BY created_at DESC,id DESC LIMIT 21",
        [user.id, cursor || null],
      )
    ).rows;
  });
  const page = links.slice(0, PARTICIPANT_LIMITS.page),
    groups = new Map();
  for (const link of page)
    groups.set(link.org_id, [
      ...(groups.get(link.org_id) || []),
      link.intake_id,
    ]);
  const loaded = (
    await Promise.all(
      [...groups].map(([org, ids]) =>
        db.tx(
          user.id,
          org,
          async (c) =>
            (await loadOwn(c, user, org, ids)).map((item) =>
              serialize(item, user, org),
            ),
          { lock: true },
        ),
      ),
    )
  ).flat();
  const byId = new Map(
    loaded.map((item) => [`${item.orgId}:${item.id}`, item]),
  );
  return okay({
    requests: page.flatMap((link) => {
      const detail = byId.get(`${link.org_id}:${link.intake_id}`);
      return detail ? [summary(detail)] : [];
    }),
    nextCursor: links.length > PARTICIPANT_LIMITS.page ? page.at(-1).id : null,
  });
}

async function claimRequest({ db, user, org, publicationId, input }) {
  exact(input, ["receipt", "consent"]);
  if (input.consent !== true)
    fail(
      422,
      "participant_consent",
      "Explicitly agree to link this request to your account.",
    );
  if (
    typeof input.receipt !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(input.receipt)
  )
    unavailable();
  return db.tx(
    user.id,
    org,
    async (c) => {
      // The organization transaction lock is always acquired before this user
      // quota lock. No path holding this lock starts another organization tx.
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `participant-user:${user.id}`,
      ]);
      const row = (
        await c.query(
          "SELECT id,publication_id,answers,erased_at FROM os_intake WHERE org_id=$1 AND publication_id=$2 AND receipt_hash=$3 FOR UPDATE",
          [org, publicationId, hash(input.receipt)],
        )
      ).rows[0];
      const publication = (
        await c.query(
          "SELECT * FROM os_publications WHERE org_id=$1 AND id=$2",
          [org, publicationId],
        )
      ).rows[0];
      if (
        !row ||
        row.erased_at ||
        !hasEmailQuestion(publication) ||
        participantEmail(row.answers?.email) !== user.email
      )
        unavailable();
      const old = (
        await c.query(
          "SELECT id,revoked_at FROM os_participant_links WHERE user_id=$1 AND org_id=$2 AND intake_id=$3",
          [user.id, org, row.id],
        )
      ).rows[0];
      if (old?.revoked_at)
        fail(
          409,
          "participant_link",
          "This request cannot be linked to this account.",
        );
      let created = false;
      if (!old) {
        const inserted = (
          await c.query(
            "INSERT INTO os_participant_links(id,org_id,intake_id,publication_id,user_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(org_id,intake_id) DO NOTHING RETURNING id",
            [id(), org, row.id, publicationId, user.id],
          )
        ).rows;
        if (!inserted.length)
          fail(
            409,
            "participant_link",
            "This request cannot be linked to this account.",
          );
        const userCount = Number(
          (
            await c.query(
              "SELECT count(*) AS count FROM os_participant_links WHERE user_id=$1",
              [user.id],
            )
          ).rows[0].count,
        );
        if (userCount > PARTICIPANT_LIMITS.userLinks)
          fail(
            422,
            "participant_quota",
            "This account reached its limit of 100 request links, including removed links.",
          );
        await c.query(
          "INSERT INTO os_participant_org_usage(org_id,total) VALUES($1,0) ON CONFLICT(org_id) DO NOTHING",
          [org],
        );
        const usage = Number(
          (
            await c.query(
              "SELECT total FROM os_participant_org_usage WHERE org_id=$1 FOR UPDATE",
              [org],
            )
          ).rows[0].total,
        );
        if (usage >= PARTICIPANT_LIMITS.organizationLinks)
          fail(
            422,
            "participant_quota",
            "This organization reached its participant-link limit.",
          );
        await c.query(
          "UPDATE os_participant_org_usage SET total=total+1 WHERE org_id=$1",
          [org],
        );
        await audit(c, org, user.id, "participant.linked", null, {
          intakeId: row.id,
          publicationId,
        });
        created = true;
      }
      const loaded = (await loadOwn(c, user, org, [row.id]))[0];
      if (!loaded) unavailable();
      return okay(
        { request: serialize(loaded, user, org) },
        created ? 201 : 200,
      );
    },
    { lock: true },
  );
}

async function ownRequest({ db, user, org, intakeId, action, input }) {
  await ownLink(db, user, org, intakeId);
  return db.tx(
    user.id,
    org,
    async (c) => {
      const loaded = (
        await loadOwn(c, user, org, [intakeId], { forUpdate: !!action })
      )[0];
      if (!loaded) unavailable();
      if (!action) return okay({ request: serialize(loaded, user, org) });
      exact(
        input,
        action === "correct"
          ? ["revision", "answers", "consent"]
          : ["revision"],
      );
      const { row, publication } = loaded;
      if (
        !Number.isSafeInteger(input.revision) ||
        input.revision !== row.revision
      )
        fail(
          409,
          "revision",
          "This request changed. Reload it before continuing.",
        );
      if (action === "unlink") {
        await c.query(
          "UPDATE os_participant_links SET revoked_at=now(),updated_at=now(),revision=revision+1 WHERE user_id=$1 AND org_id=$2 AND intake_id=$3 AND revoked_at IS NULL",
          [user.id, org, intakeId],
        );
        await audit(c, org, user.id, "participant.unlinked", null, {
          intakeId,
          publicationId: row.publication_id,
        });
        return okay({ unlinked: true });
      }
      if (action === "correct") {
        const reason = participantEditReason(
          row,
          publication,
          loaded.accepting,
          user,
        );
        if (reason) fail(409, "participant_edit", reason);
        if (input.consent !== true)
          fail(
            422,
            "participant_consent",
            "Agree again to the published collection purpose before correcting answers.",
          );
        const answers = intakeAnswers(publication.schema, input.answers);
        if (
          participantEmail(answers.email) !== user.email ||
          participantEmail(answers.email) !==
            participantEmail(row.answers.email)
        )
          fail(
            422,
            "participant_email",
            "The original verified request email cannot be changed.",
          );
        loaded.row = (
          await c.query(
            "UPDATE os_intake SET answers=$3,consent_at=now(),payload_hash=$4,revision=revision+1,updated_at=now() WHERE org_id=$1 AND id=$2 RETURNING id,publication_id,answers,status,revision,consent_at,created_at,erased_at",
            [
              org,
              intakeId,
              JSON.stringify(answers),
              hash({ answers, consent: true }),
            ],
          )
        ).rows[0];
        const size = Number(
          (
            await c.query(
              "SELECT COALESCE(sum(octet_length(to_jsonb(i)::text)),0) AS bytes FROM os_intake i WHERE org_id=$1 AND status IN ('pending','reviewed')",
              [org],
            )
          ).rows[0].bytes,
        );
        if (size > INTAKE_LIMITS.pendingBytes)
          fail(
            422,
            "intake_quota",
            "This organization's review queue reached its storage limit. Your previous answers were kept.",
          );
        await audit(c, org, user.id, "participant.corrected", null, {
          intakeId,
          publicationId: row.publication_id,
          fromRevision: row.revision,
          toRevision: loaded.row.revision,
        });
      } else if (action === "withdraw" && row.status !== "cancelled") {
        loaded.row = (
          await c.query(
            "UPDATE os_intake SET status='cancelled',revision=revision+1,updated_at=now() WHERE org_id=$1 AND id=$2 RETURNING id,publication_id,answers,status,revision,consent_at,created_at,erased_at",
            [org, intakeId],
          )
        ).rows[0];
        await audit(c, org, user.id, "intake.cancelled", null, {
          intakeId,
          publicationId: row.publication_id,
          via: "participant",
        });
      } else if (action === "erase" && !row.erased_at) {
        loaded.row = (
          await c.query(
            "UPDATE os_intake SET answers='{}'::jsonb,erased_at=now(),status=CASE WHEN status IN ('pending','reviewed') THEN 'dismissed' ELSE status END,ip_hash=NULL,payload_hash=NULL,revision=revision+1,updated_at=now() WHERE org_id=$1 AND id=$2 RETURNING id,publication_id,answers,status,revision,consent_at,created_at,erased_at",
            [org, intakeId],
          )
        ).rows[0];
        await audit(c, org, user.id, "intake.erased", null, {
          intakeId,
          publicationId: row.publication_id,
          via: "participant",
        });
      }
      return okay({ request: serialize(loaded, user, org) });
    },
    { lock: true },
  );
}

// The dispatcher owns the agreed durable rate limits. This module repeats the
// session/origin/CSRF checks so direct invocation cannot silently skip them.
export async function participantRoutes({
  request,
  url = new URL(request.url),
  db,
  settings,
  session,
  input,
}) {
  if (!url.pathname.startsWith("/api/participant/")) return null;
  if (url.pathname === "/api/participant/session") return null;
  const user = verifiedParticipant(session),
    list = url.pathname === "/api/participant/requests";
  const query = participantQuery(
    url,
    list && request.method === "GET" ? ["cursor"] : [],
  );
  if (list && request.method === "GET")
    return listRequests({ db, user, query });
  const claim =
    /^\/api\/participant\/intake\/([A-Za-z0-9_-]{1,100})\/([A-Za-z0-9_-]{1,100})\/link$/.exec(
      url.pathname,
    );
  const own =
    /^\/api\/participant\/orgs\/([A-Za-z0-9_-]{1,100})\/requests\/([A-Za-z0-9_-]{1,100})(?:\/(correct|withdraw|erase|unlink))?$/.exec(
      url.pathname,
    );
  if (own && !own[3] && request.method === "GET")
    return ownRequest({ db, user, org: own[1], intakeId: own[2] });
  if (request.method !== "POST" || (!claim && !own?.[3]))
    fail(404, "participant_route", "This participant action is unavailable.");
  checkCsrf(request, session, settings);
  if (
    !/^application\/json(?:;|$)/i.test(
      request.headers.get("content-type") || "",
    )
  )
    fail(415, "content_type", "Supply JSON.");
  const payload =
    input === undefined
      ? await body(request, PARTICIPANT_LIMITS.requestBytes)
      : input;
  if (
    Buffer.byteLength(JSON.stringify(payload)) > PARTICIPANT_LIMITS.requestBytes
  )
    fail(413, "size", "This request is too large.");
  if (claim)
    return claimRequest({
      db,
      user,
      org: claim[1],
      publicationId: claim[2],
      input: payload,
    });
  return ownRequest({
    db,
    user,
    org: own[1],
    intakeId: own[2],
    action: own[3],
    input: payload,
  });
}
