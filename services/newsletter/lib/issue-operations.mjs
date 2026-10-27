import { createHmac, timingSafeEqual } from "node:crypto";
import { FROM, CONSENT_VERSION } from "./config.mjs";
import { normalizeEmail } from "./security.mjs";
import {
  getMailIssue,
  resolveMailIssueCorrectionAncestors,
  validateMailIssueRegistry,
} from "./editions.mjs";
import {
  canonicalIssueJson,
  exactIssue,
  freezeIssue,
  issueDigest,
  issueHash,
  issueJson,
  plainIssueValue,
} from "./issue-json.mjs";

export const ISSUE_ACKNOWLEDGEMENT =
  "I CHECKED THIS EXACT ISSUE AND INTENDED NEWSLETTER AUDIENCE";
const states = [
  "creating",
  "draft",
  "create_unknown",
  "sending",
  "accepted",
  "send_unknown",
];
const stopped = ["creating", "create_unknown", "sending", "send_unknown"];
const messages = {
  unauthorized: "Authentication required.",
  forbidden_origin: "Origin is not allowed.",
  invalid_request: "The issue request is invalid.",
  issue_unknown: "The registered issue was not found.",
  content_mismatch: "The fixed issue content differs.",
  review_required: "Review this exact issue and intended audience first.",
  review_expired: "The operational review has expired.",
  facts_changed: "The reviewed issue or audience facts changed.",
  preference_sync_pending: "Resolve pending newsletter preferences first.",
  audience_mismatch: "The intended newsletter audience does not match.",
  native_draft_mismatch: "The saved native draft differs from this issue.",
  configuration_unavailable:
    "Newsletter delivery configuration is unavailable.",
  operation_busy: "Another newsletter operation is in progress.",
  limit_reached: "The bounded operation limit was reached.",
  stopped_uncertain:
    "The retained operation is stopped; no retry is authorized.",
  provider_unavailable: "The provider operation is unavailable.",
  provider_ambiguous:
    "The operation outcome is uncertain and will not be retried.",
  legacy_preflight_failed:
    "Existing campaign evidence needs private inspection.",
};
export const issueErrorStatus = (code) =>
  ({
    unauthorized: 401,
    forbidden_origin: 403,
    invalid_request: 400,
    issue_unknown: 404,
    configuration_unavailable: 503,
    provider_unavailable: 503,
    provider_ambiguous: 503,
    operation_busy: 409,
    limit_reached: 429,
  })[code] || 409;
export function issueFailure(code, campaign = null) {
  const safe = Object.hasOwn(messages, code) ? code : "provider_unavailable";
  return {
    ok: false,
    error: { code: safe, message: messages[safe] },
    campaign,
  };
}
export class IssueOperationError extends Error {
  constructor(code) {
    super(messages[code] || messages.provider_unavailable);
    this.issueCode = Object.hasOwn(messages, code)
      ? code
      : "provider_unavailable";
    this.status = issueErrorStatus(this.issueCode);
  }
}
const fail = (code) => {
  throw new IssueOperationError(code);
};
const iso = (v) => {
  if (v == null) return null;
  try {
    const d = new Date(v);
    return Number.isFinite(+d) ? d.toISOString() : null;
  } catch {
    return null;
  }
};
const hmac = (secret, domain, value) =>
  createHmac("sha256", secret)
    .update(
      domain +
        "\0" +
        (typeof value === "string" ? value : canonicalIssueJson(value)),
    )
    .digest("hex");
const same = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const providerId = (v) =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v);
function depsFor(deps) {
  const settings = Object.fromEntries(
    [
      "origin",
      "enabled",
      "testOnly",
      "testRecipient",
      "adminToken",
      "rateSecret",
      "domainId",
      "segmentId",
      "topicId",
    ].map((k) => [k, deps.settings[k]]),
  );
  const registry = validateMailIssueRegistry(deps.registry),
    deadline = Math.min(deps.deadline, Date.now() + 45000);
  if (!Number.isFinite(deadline) || deadline <= Date.now())
    fail("configuration_unavailable");
  const db = deps.db.withDeadline ? deps.db.withDeadline(deadline) : deps.db;
  const source = deps.mail.withDeadline
    ? deps.mail.withDeadline(deadline)
    : deps.mail;
  const run = async (method, ...args) => {
    let timer;
    const left = Math.min(8000, deadline - Date.now());
    if (left <= 0) fail("provider_unavailable");
    try {
      return await Promise.race([
        source[method](...args),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new IssueOperationError("provider_unavailable")),
            left,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  return { ...deps, settings, registry, db, run, deadline };
}
function secrets(d) {
  if (
    typeof d.settings.rateSecret !== "string" ||
    d.settings.rateSecret.length < 32 ||
    typeof d.settings.adminToken !== "string" ||
    d.settings.adminToken.length < 32
  )
    fail("configuration_unavailable");
}
const bearerHash = (d) =>
  hmac(
    d.settings.rateSecret,
    "newsletter-issue-bearer-v1",
    d.settings.adminToken,
  );
const transportHash = (d) =>
  issueHash({
    from: FROM,
    replyTo: ["hello@charitology.org"],
    domainId: d.settings.domainId,
    segmentId: d.settings.segmentId,
    topicId: d.settings.topicId,
  });
function summary(issue, row) {
  const observed = row?.provider_observation;
  let providerObservation = null;
  if (
    observed &&
    ["draft", "reported-sent", "other"].includes(observed.classification) &&
    iso(observed.observedAt)
  )
    providerObservation = {
      classification: observed.classification,
      observedAt: iso(observed.observedAt),
    };
  return {
    issueId: issue.id,
    publicationId: issue.publicationId,
    publicationHash: issue.publicationHash,
    contentHash:
      typeof row?.content_hash === "string" &&
      /^[a-f0-9]{64}$/.test(row.content_hash)
        ? row.content_hash
        : issue.hash,
    state: row
      ? states.includes(row.state)
        ? row.state
        : "unsupported"
      : "none",
    safeCode: Object.hasOwn(messages, row?.safe_error_code)
      ? row.safe_error_code
      : null,
    creatingAt: iso(row?.creating_at),
    sendAttemptedAt: iso(row?.send_attempted_at),
    acceptedAt: iso(row?.accepted_at),
    providerObservation,
  };
}
const readRow = async (c, id) =>
  (await c.query("SELECT * FROM newsletter_campaigns WHERE edition=$1", [id]))
    .rows[0] || null;
function rowContent(issue, row) {
  if (row && row.content_hash !== issue.hash) fail("content_mismatch");
}
async function ancestorsSafe(d, c, issue) {
  const ancestors = resolveMailIssueCorrectionAncestors(d.registry, issue.id),
    ids = ancestors.flatMap((a) =>
      d.registry.issues
        .filter(
          (x) =>
            x.publicationId === a.publicationId &&
            x.publicationHash === a.publicationHash,
        )
        .map((x) => x.id),
    );
  if (ids.length) {
    const { rows } = await c.query(
      "SELECT edition,state FROM newsletter_campaigns WHERE edition=ANY($1::text[])",
      [ids],
    );
    if (
      rows.some((x) => stopped.includes(x.state) || !states.includes(x.state))
    )
      fail("stopped_uncertain");
  }
}
async function audience(d, c) {
  const pending = await c.query(
    "SELECT count(*)::int AS count FROM newsletter_subscribers WHERE sync_pending",
  );
  if (pending.rows[0].count) fail("preference_sync_pending");
  const { rows } = await c.query(
    "SELECT email,consent_generation,consent_version FROM newsletter_subscribers WHERE state='active' AND consent_at IS NOT NULL AND unsubscribed_at IS NULL ORDER BY email LIMIT 3001",
  );
  if (!rows.length || rows.length > 3000)
    fail(rows.length ? "limit_reached" : "audience_mismatch");
  const expected = new Map();
  for (const x of rows) {
    if (
      normalizeEmail(x.email) !== x.email ||
      typeof x.consent_generation !== "string" ||
      x.consent_generation.length > 100 ||
      !x.consent_generation ||
      x.consent_version !== CONSENT_VERSION ||
      expected.has(x.email)
    )
      fail("audience_mismatch");
    expected.set(x.email, x.consent_generation);
  }
  const actual = await d.run("segmentContacts");
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.size ||
    actual.length > 3000
  )
    fail("audience_mismatch");
  const ids = new Set(),
    emails = new Set();
  for (const x of actual) {
    const email = normalizeEmail(x?.email);
    if (
      !providerId(x?.id) ||
      ids.has(x.id) ||
      !email ||
      emails.has(email) ||
      !expected.has(email) ||
      x.unsubscribed !== false
    )
      fail("audience_mismatch");
    ids.add(x.id);
    emails.add(email);
  }
  if (
    d.settings.testOnly &&
    (expected.size !== 1 || !expected.has(d.settings.testRecipient))
  )
    fail("audience_mismatch");
  return {
    count: expected.size,
    hash: hmac(
      d.settings.rateSecret,
      "newsletter-issue-audience-v1",
      [...expected].map(([email, generation]) => ({ email, generation })),
    ),
  };
}
function nativeDraft(d, issue, id, remote) {
  const replies = Array.isArray(remote?.reply_to)
    ? remote.reply_to
    : [remote?.reply_to];
  if (
    !remote ||
    remote.id !== id ||
    remote.status !== "draft" ||
    remote.segment_id !== d.settings.segmentId ||
    remote.topic_id !== d.settings.topicId ||
    remote.from !== FROM ||
    replies.length !== 1 ||
    replies[0] !== "hello@charitology.org" ||
    remote.subject !== issue.subject ||
    remote.html !== issue.html ||
    remote.text !== issue.text ||
    ["scheduled_at", "scheduledAt", "send_at", "sent_at"].some(
      (k) => remote[k] != null,
    )
  )
    fail("native_draft_mismatch");
  return hmac(d.settings.rateSecret, "newsletter-issue-native-draft-v1", {
    id,
    status: "draft",
    segmentId: remote.segment_id,
    topicId: remote.topic_id,
    from: remote.from,
    replyTo: replies,
    subject: remote.subject,
    html: remote.html,
    text: remote.text,
  });
}
async function facts(d, c, issue, phase, row) {
  const legacy = (
    await c.query(
      "SELECT edition,content_hash,state,broadcast_id FROM newsletter_campaigns LIMIT 101",
    )
  ).rows;
  if (
    legacy.length > 100 ||
    legacy.some(
      (r) =>
        !states.includes(r.state) ||
        !d.registry.issues.some(
          (x) => x.id === r.edition && x.hash === r.content_hash,
        ) ||
        (r.broadcast_id !== null && !providerId(r.broadcast_id)),
    )
  )
    fail("legacy_preflight_failed");
  secrets(d);
  if (
    d.settings.enabled !== true ||
    !d.settings.domainId ||
    !d.settings.segmentId ||
    !d.settings.topicId
  )
    fail("configuration_unavailable");
  await ancestorsSafe(d, c, issue);
  await d.run("ready", { campaign: true });
  let nativeDraftHash = null;
  if (phase === "send") {
    if (!row || row.state !== "draft" || !providerId(row.broadcast_id))
      fail("stopped_uncertain");
    nativeDraftHash = nativeDraft(
      d,
      issue,
      row.broadcast_id,
      await d.run("getBroadcast", row.broadcast_id),
    );
  } else if (row)
    fail(stopped.includes(row.state) ? "stopped_uncertain" : "facts_changed");
  const people = await audience(d, c);
  return {
    method: "newsletter-issue-review-v1",
    phase,
    issueId: issue.id,
    publicationId: issue.publicationId,
    publicationHash: issue.publicationHash,
    contentHash: issue.hash,
    mailRegistryHash: d.registry.hash,
    transportHash: transportHash(d),
    audienceHash: people.hash,
    intendedRecipientCount: people.count,
    nativeDraftHash,
  };
}
function phaseInput(input, names) {
  try {
    const v = plainIssueValue(input);
    exactIssue(v, names);
    if (!["prepare", "send"].includes(v.phase)) throw Error();
    issueDigest(v.contentHash);
    if (names.includes("previewHash")) issueDigest(v.previewHash);
    return v;
  } catch {
    fail("invalid_request");
  }
}
function signedPreview(d, value) {
  const encoded = Buffer.from(canonicalIssueJson(value)).toString("base64url");
  const mac = createHmac("sha256", d.settings.rateSecret)
    .update("newsletter-issue-preview-v1\0" + encoded)
    .digest("base64url");
  const token = encoded + "." + mac;
  if (token.length > 2048) fail("limit_reached");
  return token;
}
function tokenPreview(d, token) {
  if (
    typeof token !== "string" ||
    token.length > 2048 ||
    !/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]{43}$/.test(token)
  )
    fail("review_required");
  const [encoded, mac] = token.split("."),
    wanted = createHmac("sha256", d.settings.rateSecret)
      .update("newsletter-issue-preview-v1\0" + encoded)
      .digest("base64url");
  if (!same(mac, wanted)) fail("review_required");
  let v;
  try {
    v = issueJson(Buffer.from(encoded, "base64url"), 1536);
    exactIssue(v, [
      "version",
      "facts",
      "previewHash",
      "bearerHash",
      "issuedAt",
      "expiresAt",
    ]);
  } catch {
    fail("review_required");
  }
  const now = Date.parse(d.now());
  if (
    v.version !== 1 ||
    v.bearerHash !== bearerHash(d) ||
    !iso(v.issuedAt) ||
    !iso(v.expiresAt) ||
    iso(v.issuedAt) !== v.issuedAt ||
    iso(v.expiresAt) !== v.expiresAt ||
    Date.parse(v.expiresAt) - Date.parse(v.issuedAt) !== 900000 ||
    Date.parse(v.issuedAt) > now
  )
    fail("review_required");
  if (Date.parse(v.expiresAt) <= now) fail("review_expired");
  if (issueHash(v.facts) !== v.previewHash) fail("review_required");
  return v;
}
function proofDto(row) {
  return {
    ok: true,
    reviewId: row.id,
    reviewHash: row.proof_hash,
    phase: row.phase,
    previewHash: row.preview_hash,
    contentHash: row.facts.contentHash,
    intendedRecipientCount: row.facts.intendedRecipientCount,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
  };
}
async function exclusive(d, action) {
  try {
    return await d.db.exclusive(action);
  } catch (e) {
    if (e instanceof IssueOperationError) throw e;
    if (/Another preference or campaign/.test(e?.message || ""))
      fail("operation_busy");
    throw e;
  }
}
export async function previewIssueReview(deps, id, input) {
  const i = phaseInput(input, ["phase", "contentHash"]),
    d = depsFor(deps),
    issue = getMailIssue(d.registry, id);
  if (i.contentHash !== issue.hash) fail("content_mismatch");
  return exclusive(d, async (c) => {
    const row = await readRow(c, id);
    rowContent(issue, row);
    const f = await facts(d, c, issue, i.phase, row),
      previewHash = issueHash(f),
      issuedAt = d.now(),
      expiresAt = new Date(Date.parse(issuedAt) + 900000).toISOString();
    const body = {
      version: 1,
      facts: f,
      previewHash,
      bearerHash: bearerHash(d),
      issuedAt,
      expiresAt,
    };
    return freezeIssue({
      ok: true,
      facts: f,
      previewHash,
      previewToken: signedPreview(d, body),
      issuedAt,
      expiresAt,
    });
  });
}
export async function acknowledgeIssueReview(deps, id, input) {
  const i = phaseInput(input, [
      "phase",
      "previewHash",
      "previewToken",
      "contentHash",
      "acknowledgement",
    ]),
    d = depsFor(deps),
    issue = getMailIssue(d.registry, id);
  secrets(d);
  if (i.acknowledgement !== ISSUE_ACKNOWLEDGEMENT) fail("review_required");
  const token = tokenPreview(d, i.previewToken);
  if (
    i.contentHash !== issue.hash ||
    token.facts.issueId !== id ||
    token.facts.contentHash !== i.contentHash ||
    token.facts.phase !== i.phase ||
    i.previewHash !== token.previewHash
  )
    fail("facts_changed");
  const tokenHash = hmac(
    d.settings.rateSecret,
    "newsletter-issue-preview-token-v1",
    i.previewToken,
  );
  return exclusive(d, async (c) => {
    const row = await readRow(c, id);
    rowContent(issue, row);
    const f = await facts(d, c, issue, i.phase, row);
    if (issueHash(f) !== token.previewHash) fail("facts_changed");
    return d.db.tx(async (durable) => {
      const prior = (
        await durable.query(
          "SELECT * FROM newsletter_issue_reviews WHERE preview_token_hash=$1",
          [tokenHash],
        )
      ).rows[0];
      if (prior) return proofDto(prior);
      await durable.query(
        "DELETE FROM newsletter_issue_reviews WHERE consumed_at IS NULL AND expires_at<now()",
      );
      const q = (
        await durable.query(
          "SELECT count(*) FILTER(WHERE consumed_at IS NULL AND expires_at>now())::int AS live,COALESCE(sum(pg_column_size(r)),0)::bigint AS bytes FROM newsletter_issue_reviews r",
        )
      ).rows[0];
      if (q.live >= 20 || Number(q.bytes) + 8192 > 2097152)
        fail("limit_reached");
      const reviewId = d.makeReviewId();
      if (!/^[A-Za-z0-9_-]{43}$/.test(reviewId))
        fail("configuration_unavailable");
      const core = {
        reviewId,
        method: f.method,
        issueId: id,
        phase: i.phase,
        previewHash: token.previewHash,
        facts: f,
        acknowledgementHash: hmac(
          d.settings.rateSecret,
          "newsletter-issue-ack-v1",
          ISSUE_ACKNOWLEDGEMENT,
        ),
        bearerHash: bearerHash(d),
        previewTokenHash: tokenHash,
        createdAt: d.now(),
        expiresAt: token.expiresAt,
      };
      const proofHash = issueHash(core);
      const saved = (
        await durable.query(
          "INSERT INTO newsletter_issue_reviews(id,method,issue_id,phase,preview_hash,proof_hash,facts,acknowledgement_hash,bearer_hash,preview_token_hash,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *",
          [
            reviewId,
            f.method,
            id,
            i.phase,
            token.previewHash,
            proofHash,
            JSON.stringify(f),
            core.acknowledgementHash,
            core.bearerHash,
            tokenHash,
            core.createdAt,
            core.expiresAt,
          ],
        )
      ).rows[0];
      return proofDto(saved);
    });
  });
}
async function consume(d, c, issue, phase, input, currentFacts, operation) {
  if (
    typeof input.reviewId !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(input.reviewId) ||
    typeof input.reviewHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.reviewHash)
  )
    fail("review_required");
  const proof = (
    await c.query(
      "SELECT * FROM newsletter_issue_reviews WHERE id=$1 FOR UPDATE",
      [input.reviewId],
    )
  ).rows[0];
  if (
    !proof ||
    proof.issue_id !== issue.id ||
    proof.phase !== phase ||
    proof.proof_hash !== input.reviewHash ||
    proof.bearer_hash !== bearerHash(d) ||
    proof.consumed_at
  )
    fail("review_required");
  const core = {
    reviewId: proof.id,
    method: proof.method,
    issueId: proof.issue_id,
    phase: proof.phase,
    previewHash: proof.preview_hash,
    facts: proof.facts,
    acknowledgementHash: proof.acknowledgement_hash,
    bearerHash: proof.bearer_hash,
    previewTokenHash: proof.preview_token_hash,
    createdAt: iso(proof.created_at),
    expiresAt: iso(proof.expires_at),
  };
  if (issueHash(core) !== proof.proof_hash) fail("review_required");
  if (Date.parse(iso(proof.expires_at)) <= Date.parse(d.now()))
    fail("review_expired");
  if (
    canonicalIssueJson(proof.facts) !== canonicalIssueJson(currentFacts) ||
    proof.preview_hash !== issueHash(currentFacts)
  )
    fail("facts_changed");
  const changed = await c.query(
    "UPDATE newsletter_issue_reviews SET consumed_at=now(),consumed_operation_id=$2 WHERE id=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING id",
    [proof.id, operation],
  );
  if (!changed.rows.length) fail("review_expired");
  return proof;
}
export async function operateIssue(deps, id, command) {
  let d,
    issue,
    row = null;
  try {
    let cmd;
    try {
      cmd = plainIssueValue(command);
      exactIssue(cmd, ["action", "input"]);
    } catch {
      fail("invalid_request");
    }
    if (!["prepare", "send", "reconcile"].includes(cmd.action))
      fail("invalid_request");
    const i = cmd.input;
    if (
      !i ||
      Array.isArray(i) ||
      typeof i !== "object" ||
      Object.keys(i).some(
        (k) =>
          !(
            cmd.action === "reconcile"
              ? []
              : [
                  "contentHash",
                  "reviewId",
                  "reviewHash",
                  ...(cmd.action === "send" ? ["confirm"] : []),
                ]
          ).includes(k),
      )
    )
      fail("invalid_request");
    d = depsFor(deps);
    issue = getMailIssue(d.registry, id);
    if (cmd.action !== "reconcile" && i.contentHash !== issue.hash)
      fail("content_mismatch");
    return await exclusive(d, async (c) => {
      row = await readRow(c, id);
      rowContent(issue, row);
      if (cmd.action === "reconcile") {
        if (!row || !providerId(row.broadcast_id)) fail("stopped_uncertain");
        const remote = await d.run("getBroadcast", row.broadcast_id);
        if (
          !remote ||
          remote.id !== row.broadcast_id ||
          typeof remote.status !== "string" ||
          remote.status.length > 64
        )
          fail("provider_unavailable");
        const observed = {
          classification:
            remote.status === "draft"
              ? "draft"
              : remote.status === "sent"
                ? "reported-sent"
                : "other",
          observedAt: d.now(),
        };
        row = (
          await d.db.tx((x) =>
            x.query(
              "UPDATE newsletter_campaigns SET provider_status=$2,provider_observation=$3,updated_at=now() WHERE edition=$1 AND operation_id=$4 RETURNING *",
              [
                id,
                ["draft", "sent"].includes(remote.status)
                  ? remote.status
                  : "unknown",
                JSON.stringify(observed),
                row.operation_id,
              ],
            ),
          )
        ).rows[0];
        return {
          ok: true,
          result: "observed",
          campaign: summary(issue, row),
          intendedRecipientCount: null,
        };
      }
      if (
        (cmd.action === "prepare" && row) ||
        (cmd.action === "send" && row?.state === "accepted")
      )
        return {
          ok: true,
          result: "retained",
          campaign: summary(issue, row),
          intendedRecipientCount: null,
        };
      if (
        cmd.action === "send" &&
        (i.confirm !== "SEND THIS REVIEWED ISSUE" ||
          !row ||
          row.state !== "draft")
      )
        fail(
          row && stopped.includes(row.state)
            ? "stopped_uncertain"
            : "review_required",
        );
      if (
        typeof i.reviewId !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(i.reviewId) ||
        typeof i.reviewHash !== "string" ||
        !/^[a-f0-9]{64}$/.test(i.reviewHash)
      )
        fail("review_required");
      const f = await facts(d, c, issue, cmd.action, row);
      const operation = row?.operation_id || d.makeOperationId();
      if (
        typeof operation !== "string" ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(operation)
      )
        fail("configuration_unavailable");
      row = await d.db.tx(async (durable) => {
        const proof = await consume(
          d,
          durable,
          issue,
          cmd.action,
          i,
          f,
          operation,
        );
        if (cmd.action === "prepare") {
          const usage = (
            await durable.query(
              "SELECT COALESCE(sum(GREATEST(pg_column_size(c),reserved_bytes)),0)::bigint AS bytes FROM newsletter_campaigns c",
            )
          ).rows[0];
          if (Number(usage.bytes) + 8192 > 2097152) fail("limit_reached");
          return (
            await durable.query(
              "INSERT INTO newsletter_campaigns(edition,content_hash,state,operation_id,publication_id,publication_hash,registry_hash,transport_hash,prepare_review_id,prepare_review_hash,creating_at,reserved_bytes) VALUES($1,$2,'creating',$3,$4,$5,$6,$7,$8,$9,now(),8192) RETURNING *",
              [
                id,
                issue.hash,
                operation,
                issue.publicationId,
                issue.publicationHash,
                d.registry.hash,
                f.transportHash,
                proof.id,
                proof.proof_hash,
              ],
            )
          ).rows[0];
        }
        const saved = (
          await durable.query(
            "UPDATE newsletter_campaigns SET state='sending',send_review_id=$3,send_review_hash=$4,send_attempted_at=now(),updated_at=now() WHERE edition=$1 AND operation_id=$2 AND state='draft' RETURNING *",
            [id, operation, proof.id, proof.proof_hash],
          )
        ).rows[0];
        if (!saved) fail("stopped_uncertain");
        return saved;
      });
      try {
        const remote = await d.run(
          cmd.action === "prepare" ? "createBroadcast" : "sendBroadcast",
          cmd.action === "prepare" ? issue : row.broadcast_id,
        );
        if (
          !providerId(remote?.id) ||
          (cmd.action === "send" && remote.id !== row.broadcast_id)
        )
          throw new Error("Invalid native operation response");
        const sql =
          cmd.action === "prepare"
            ? "UPDATE newsletter_campaigns SET state='draft',broadcast_id=$3,provider_status='draft',updated_at=now() WHERE edition=$1 AND operation_id=$2 AND state='creating' AND prepare_review_id=$4 AND prepare_review_hash=$5 RETURNING *"
            : "UPDATE newsletter_campaigns SET state='accepted',provider_status='accepted',accepted_at=now(),updated_at=now() WHERE edition=$1 AND operation_id=$2 AND broadcast_id=$3 AND state='sending' AND send_review_id=$4 AND send_review_hash=$5 RETURNING *";
        const saved = (
          await d.db.tx((x) =>
            x.query(sql, [
              id,
              operation,
              remote.id,
              cmd.action === "prepare"
                ? row.prepare_review_id
                : row.send_review_id,
              cmd.action === "prepare"
                ? row.prepare_review_hash
                : row.send_review_hash,
            ]),
          )
        ).rows[0];
        if (!saved)
          throw new Error("Unconfirmed durable operation finalization");
        row = saved;
        return {
          ok: true,
          result: cmd.action === "prepare" ? "prepared" : "accepted",
          campaign: summary(issue, row),
          intendedRecipientCount: f.intendedRecipientCount,
        };
      } catch {
        const unknown =
            cmd.action === "prepare" ? "create_unknown" : "send_unknown",
          from = cmd.action === "prepare" ? "creating" : "sending";
        try {
          const saved = (
            await d.db.tx((x) =>
              x.query(
                "UPDATE newsletter_campaigns SET state=$3,safe_error_code='provider_ambiguous',updated_at=now() WHERE edition=$1 AND operation_id=$2 AND state=$4 RETURNING *",
                [id, operation, unknown, from],
              ),
            )
          ).rows[0];
          if (saved) row = saved;
          else row = (await d.db.tx((x) => readRow(x, id))) || row;
        } catch {}
        fail("provider_ambiguous");
      }
    });
  } catch (e) {
    const code =
      e?.issueCode && Object.hasOwn(messages, e.issueCode)
        ? e.issueCode
        : e?.status === 404
          ? "issue_unknown"
          : "provider_unavailable";
    return {
      ok: false,
      error: { code, message: messages[code] },
      campaign: issue ? summary(issue, row) : null,
    };
  }
}
export async function listIssueCampaigns({ db, registry }, cursor) {
  const v = validateMailIssueRegistry(registry);
  let start = 0;
  if (cursor !== null) {
    if (typeof cursor !== "string" || cursor.length > 120)
      fail("invalid_request");
    let decoded;
    try {
      decoded = Buffer.from(cursor, "base64url").toString();
    } catch {
      fail("invalid_request");
    }
    start = v.issues.findIndex((x) => x.id === decoded) + 1;
    if (!start || Buffer.from(decoded).toString("base64url") !== cursor)
      fail("invalid_request");
  }
  const selected = v.issues.slice(start, start + 20),
    rows = await db.tx(
      async (c) =>
        (
          await c.query(
            "SELECT * FROM newsletter_campaigns WHERE edition=ANY($1::text[])",
            [selected.map((x) => x.id)],
          )
        ).rows,
    );
  return {
    ok: true,
    issues: selected.map((x) =>
      summary(
        x,
        rows.find((r) => r.edition === x.id),
      ),
    ),
    nextCursor:
      start + 20 < v.issues.length
        ? Buffer.from(selected.at(-1).id).toString("base64url")
        : null,
  };
}
