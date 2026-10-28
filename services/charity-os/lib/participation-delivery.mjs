import {
  audit,
  allRecords,
  logicalBackupBytes,
  rowRecord,
} from "./database.mjs";
import { administrators, requireAdmin, visibleRecord } from "./access.mjs";
import { modulePermissions } from "./modules.mjs";
import {
  participantEmail,
  participantQuery,
  verifiedParticipant,
} from "./participants.mjs";
import { body, checkCsrf, fail, hash, id, json, stable } from "./security.mjs";

export const DELIVERY_CONSENT_VERSION = "participation-email-v1";
export const DELIVERY_TEMPLATE_VERSION = "participation-notice-v1";
export const DELIVERY_CONSENT_COPY =
  "Email me operational updates about this participation. I can turn them off here. This does not subscribe me to The Charitology Letter.";
export const DELIVERY_LIMITS = Object.freeze({
  page: 20,
  selection: 20,
  previews: 4,
  previewBytes: 65536,
  reserve: 8192,
  outbox: 8000,
  outboxBytes: 8 * 1024 * 1024,
  workspaceBytes: 60 * 1024 * 1024,
});
export const DELIVERY_STATES = Object.freeze([
  "paused",
  "pending",
  "leased",
  "accepted",
  "delivered",
  "suppressed",
  "failed",
  "unknown",
  "cancelled",
]);
const plain = (v) =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
const opaque = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v);
const digest = (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const positive = (v) => Number.isSafeInteger(v) && v > 0;
const iso = (v) => (v ? new Date(v).toISOString() : null);
const stamp = (v) =>
  typeof v === "string" &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
const okay = (v) =>
  json({ ok: true, ...v }, 200, { "referrer-policy": "no-referrer" });
const unavailable = () =>
  fail(
    404,
    "participation_delivery",
    "This participation delivery action is unavailable.",
  );
function exact(value, fields) {
  if (!plain(value) || Object.keys(value).some((k) => !fields.includes(k)))
    fail(
      422,
      "participation_delivery_fields",
      "Use only the documented delivery fields.",
    );
}
function expected(input, value, key = "revision") {
  if (!positive(input[key]) || input[key] !== value)
    fail(
      409,
      "revision",
      "This participation, request or delivery policy changed. Reload before continuing.",
    );
}
function intent(input, actor, action) {
  if (
    typeof input.idempotencyKey !== "string" ||
    !/^[A-Za-z0-9_-]{16,100}$/.test(input.idempotencyKey)
  )
    fail(
      422,
      "participation_delivery_intent",
      "Supply a random intent key of 16–100 characters.",
    );
  return {
    intentHash: hash({ actor, action, key: input.idempotencyKey }),
    payloadHash: hash(input),
    actorHash: hash(actor),
    action,
  };
}
function replay(last, next) {
  if (last?.intentHash !== next.intentHash) return false;
  if (last.payloadHash !== next.payloadHash)
    fail(
      409,
      "participation_delivery_intent",
      "This intent was already used with different fields. Reload the current state.",
    );
  return true;
}
const lock = (c, org) =>
  c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [org]);
const policyObject = (p) => ({
  revision: p?.revision || 1,
  enabled: p?.enabled === true,
  templateVersion: DELIVERY_TEMPLATE_VERSION,
});
async function policy(c, org, create = false) {
  if (create)
    await c.query(
      "INSERT INTO os_participation_delivery_policies(org_id,epoch,template_version) VALUES($1,$2,$3) ON CONFLICT(org_id) DO NOTHING",
      [org, id(), DELIVERY_TEMPLATE_VERSION],
    );
  return (
    (
      await c.query(
        "SELECT * FROM os_participation_delivery_policies WHERE org_id=$1",
        [org],
      )
    ).rows[0] || {
      org_id: org,
      revision: 1,
      enabled: false,
      epoch: null,
      template_version: DELIVERY_TEMPLATE_VERSION,
    }
  );
}
export function deliveryConsentValid(value) {
  return (
    plain(value) &&
    value.version === DELIVERY_CONSENT_VERSION &&
    value.enabled === true &&
    positive(value.revision) &&
    stamp(value.at) &&
    opaque(value.userId) &&
    /^[a-f0-9]{32}$/.test(value.linkId || "") &&
    positive(value.linkRevision) &&
    digest(value.recipientHash)
  );
}
export function deliveryMessage(settings, recipient) {
  const to = participantEmail(recipient);
  let url;
  try {
    url = new URL("/participant", settings.origin).toString();
  } catch {
    fail(
      503,
      "participation_delivery_configuration",
      "The participant portal has not been configured.",
    );
  }
  if (!to)
    fail(
      422,
      "participation_delivery_recipient",
      "The verified participant address is unavailable.",
    );
  return { purpose: "participation", to, url };
}
function gate(settings, email) {
  if (!settings?.participationDeliveryEnabled) return "service_disabled";
  if (
    settings.participationTestOnly !== false &&
    (!settings.participationTestRecipient ||
      participantEmail(settings.participationTestRecipient) !== email)
  )
    return "controlled_recipient_required";
  return null;
}

// Only a server-created consent may select another user context. Own-user link
// RLS stays unchanged, and this connection retains its strict tenant context.
export async function resolveDeliveryRecipient(c, { org, participation: p }) {
  const consent = p.delivery_consent;
  if (!p.intake_id || !deliveryConsentValid(consent)) return null;
  const previous =
    (await c.query("SELECT current_setting('app.user_id',true) AS user_id"))
      .rows[0]?.user_id || "";
  try {
    await c.query("SELECT set_config('app.user_id',$1,true)", [consent.userId]);
    const row = (
      await c.query(
        'SELECT l.id,l.revision,l.user_id,u.email,u."emailVerified" AS verified FROM os_participant_links l JOIN "user" u ON u.id=l.user_id JOIN os_intake i ON i.org_id=l.org_id AND i.id=l.intake_id AND i.publication_id=l.publication_id WHERE l.org_id=$1 AND l.intake_id=$2 AND l.user_id=$3 AND l.id=$4 AND l.revision=$5 AND l.revoked_at IS NULL AND i.erased_at IS NULL',
        [
          org,
          p.intake_id,
          consent.userId,
          consent.linkId,
          consent.linkRevision,
        ],
      )
    ).rows[0];
    const email = participantEmail(row?.email);
    return row?.verified === true &&
      email &&
      hash(email) === consent.recipientHash
      ? {
          email,
          userId: row.user_id,
          linkId: row.id,
          linkRevision: row.revision,
        }
      : null;
  } finally {
    await c.query("SELECT set_config('app.user_id',$1,true)", [previous]);
  }
}
async function ownBinding(c, { org, participation: p, intake, actor }) {
  if (
    !p.intake_id ||
    p.intake_id !== intake.id ||
    intake.erased_at ||
    participantEmail(intake.answers?.email) !== participantEmail(actor.email)
  )
    return null;
  const row = (
    await c.query(
      'SELECT l.id,l.revision,l.user_id,u.email,u."emailVerified" AS verified FROM os_participant_links l JOIN "user" u ON u.id=l.user_id WHERE l.org_id=$1 AND l.intake_id=$2 AND l.publication_id=$3 AND l.user_id=$4 AND l.revoked_at IS NULL',
      [org, intake.id, intake.publication_id, actor.id],
    )
  ).rows[0];
  const email = participantEmail(row?.email);
  return row?.verified === true && email === participantEmail(actor.email)
    ? { email, userId: actor.id, linkId: row.id, linkRevision: row.revision }
    : null;
}
async function targetState(c, org, p) {
  const t = (
    await c.query(
      "SELECT * FROM os_participation_targets WHERE org_id=$1 AND target_id=$2",
      [org, p.target_id],
    )
  ).rows[0];
  const raw = (
    await c.query(
      "SELECT * FROM os_records WHERE org_id=$1 AND id=$2 AND deleted_at IS NULL",
      [org, p.target_id],
    )
  ).rows[0];
  return { target: t, source: raw ? rowRecord(raw) : null };
}
const approved = (r) =>
  !!r &&
  r.approval?.status === "approved" &&
  r.approval.revision === r.revision &&
  !!r.approval.actorId &&
  r.approval.actorId !== r.lastEditedBy &&
  ["approved", "scheduled", "open", "assigned", "completed"].includes(r.status);
async function eligibility(
  c,
  {
    org,
    participation: p,
    settings,
    policy: pol,
    snapshot = false,
    requireGates = true,
  },
) {
  if (p.recovered || ["legacy", "recovered"].includes(p.source))
    return { reason: "recovered_or_legacy" };
  const { target, source } = await targetState(c, org, p);
  if (!target || target.recovery_block || target.mode !== "managed")
    return { reason: "target_unavailable" };
  if (!p.intake_id || !deliveryConsentValid(p.delivery_consent))
    return { reason: "fresh_consent_required" };
  if (!snapshot && !["waitlisted", "confirmed", "cancelled"].includes(p.state))
    return { reason: "state_ineligible" };
  if (
    snapshot &&
    (p.state !== "confirmed" || !plain(p.frozen) || !plain(p.frozen.terms))
  )
    return { reason: "confirmation_required" };
  if (p.state !== "cancelled") {
    if (!approved(source)) return { reason: "current_approval_required" };
    const end =
      p.state === "confirmed" ? p.frozen?.terms?.endAt : source.data?.endAt;
    if (
      !end ||
      !Number.isFinite(Date.parse(end)) ||
      Date.parse(end) <= Date.now()
    )
      return { reason: "occurrence_ended" };
  }
  const recipient = await resolveDeliveryRecipient(c, {
    org,
    participation: p,
  });
  if (!recipient) return { reason: "recipient_unavailable" };
  const local = gate(settings, recipient.email);
  if (requireGates && local) return { reason: local };
  if (requireGates && !pol.enabled) return { reason: "policy_disabled" };
  const message = deliveryMessage(settings, recipient.email);
  return {
    reason: null,
    recipient,
    message,
    payloadHash: hash(message),
    target,
    source,
  };
}
function binding(p, eligible) {
  if (eligible.reason)
    return {
      participationId: p.id,
      revision: p.revision,
      reason: eligible.reason,
    };
  return {
    participationId: p.id,
    revision: p.revision,
    consentRevision: p.delivery_consent.revision,
    consentHash: hash(p.delivery_consent),
    userId: eligible.recipient.userId,
    linkId: eligible.recipient.linkId,
    linkRevision: eligible.recipient.linkRevision,
    recipientHash: p.delivery_consent.recipientHash,
    templateVersion: DELIVERY_TEMPLATE_VERSION,
    payloadHash: eligible.payloadHash,
    reason: null,
  };
}
async function latest(c, org, pid) {
  const o = (
    await c.query(
      "SELECT state,safe_code,provider_event_at,last_checked_at FROM os_participation_outbox WHERE org_id=$1 AND participation_id=$2 AND intent_kind<>'legacy' ORDER BY event_revision DESC LIMIT 1",
      [org, pid],
    )
  ).rows[0];
  return o
    ? {
        state: o.state,
        safeCode: o.safe_code || null,
        providerEventAt: iso(o.provider_event_at),
        lastCheckedAt: iso(o.last_checked_at),
      }
    : null;
}
export async function ownDeliverySummary(
  c,
  { org, participation: p, intake, settings, actor },
) {
  const pol = await policy(c, org),
    own = await ownBinding(c, { org, participation: p, intake, actor }),
    { target } = await targetState(c, org, p);
  const canEnable =
    !!own &&
    !p.recovered &&
    !["legacy", "recovered"].includes(p.source) &&
    ["requested", "waitlisted", "confirmed"].includes(p.state) &&
    !!target &&
    !target.recovery_block &&
    target.mode === "managed";
  const consent = p.delivery_consent;
  const enabled =
    deliveryConsentValid(consent) &&
    consent.userId === actor.id &&
    consent.linkId === own?.linkId &&
    consent.linkRevision === own?.linkRevision &&
    consent.recipientHash === hash(own.email);
  let reason = !canEnable
    ? "This participation has no current verified request binding for new email consent."
    : gate(settings, own.email) === "controlled_recipient_required"
      ? "Email delivery is restricted to the controlled test recipient."
      : !settings.participationDeliveryEnabled
        ? "Operational email delivery is not active. Check this portal for updates."
        : !pol.enabled
          ? "The organization has not activated operational email delivery."
          : !enabled
            ? "Save the specific email preference before an update can be queued."
            : null;
  return {
    enabled,
    consentVersion: DELIVERY_CONSENT_VERSION,
    consentRevision: consent?.revision || 0,
    consentedAt: iso(consent?.at),
    available:
      enabled && canEnable && !gate(settings, own.email) && pol.enabled,
    canEnable,
    unavailableReason: reason,
    serviceEnabled: settings.participationDeliveryEnabled === true,
    policyEnabled: pol.enabled === true,
    controlledMode: settings.participationTestOnly !== false,
    templateVersion: DELIVERY_TEMPLATE_VERSION,
    latest: await latest(c, org, p.id),
  };
}

export async function suppressParticipationDelivery(
  c,
  { org, intakeId, participationId, reason = "preference_off" },
) {
  if (
    !opaque(org) ||
    (intakeId && !opaque(intakeId)) ||
    (participationId && !opaque(participationId))
  )
    fail(422, "participation_delivery_scope", "Use a bounded delivery scope.");
  if (["erased", "unlink"].includes(reason))
    await c.query(
      "UPDATE os_participations SET delivery_consent=jsonb_build_object('version',$4::text,'enabled',false,'revision',COALESCE((delivery_consent->>'revision')::integer,0)+1,'at',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')),revision=revision+1,updated_at=now() WHERE org_id=$1 AND ($2::text IS NULL OR intake_id=$2) AND ($3::text IS NULL OR id=$3) AND delivery_consent->>'enabled'='true'",
      [
        org,
        intakeId || null,
        participationId || null,
        DELIVERY_CONSENT_VERSION,
      ],
    );
  return (
    await c.query(
      "UPDATE os_participation_outbox o SET state='cancelled',safe_code=$4,lease_owner=NULL,lease_until=NULL FROM os_participations p WHERE p.org_id=o.org_id AND p.id=o.participation_id AND o.org_id=$1 AND ($2::text IS NULL OR p.intake_id=$2) AND ($3::text IS NULL OR p.id=$3) AND o.first_attempt_at IS NULL AND o.state IN ('paused','pending','leased')",
      [
        org,
        intakeId || null,
        participationId || null,
        [
          "erased",
          "unlink",
          "policy_disabled",
          "preference_off",
          "superseded",
        ].includes(reason)
          ? reason
          : "authority_withdrawn",
      ],
    )
  ).rowCount;
}

async function appendIntent(
  c,
  { org, participation: p, policy: pol, eligible, kind, safe = false },
) {
  const live = !eligible.reason && pol.enabled;
  const duplicate = live
    ? (
        await c.query(
          "SELECT id FROM os_participation_outbox WHERE org_id=$1 AND participation_id=$2 AND participation_revision=$3 AND consent_revision=$4 AND template_version=$5 AND intent_kind<>'legacy' LIMIT 1",
          [
            org,
            p.id,
            p.revision,
            p.delivery_consent.revision,
            DELIVERY_TEMPLATE_VERSION,
          ],
        )
      ).rows[0]
    : null;
  if (duplicate) return { queued: false, alreadyRecorded: true };
  if (
    !live &&
    (
      await c.query(
        "SELECT id FROM os_participation_outbox WHERE org_id=$1 AND participation_id=$2 AND participation_revision=$3 AND intent_kind='legacy' LIMIT 1",
        [org, p.id, p.revision],
      )
    ).rows.length
  )
    return { queued: false, alreadyRecorded: true };
  // Any earlier unsent causal state is stale, including a preflight-only defer.
  await c.query(
    "UPDATE os_participation_outbox SET state='cancelled',safe_code='superseded',lease_owner=NULL,lease_until=NULL WHERE org_id=$1 AND participation_id=$2 AND first_attempt_at IS NULL AND state IN ('pending','leased')",
    [org, p.id],
  );
  const usage = (
    await c.query(
      "SELECT count(*) AS count,COALESCE(sum(GREATEST(octet_length(to_jsonb(t)::text),budget_bytes)),0) AS bytes FROM os_participation_outbox t WHERE org_id=$1",
      [org],
    )
  ).rows[0];
  const reserve = live ? DELIVERY_LIMITS.reserve : 2048;
  if (
    Number(usage.count) >= DELIVERY_LIMITS.outbox ||
    Number(usage.bytes) + reserve > DELIVERY_LIMITS.outboxBytes ||
    (await logicalBackupBytes(c, org)) + reserve + 1000 >
      DELIVERY_LIMITS.workspaceBytes
  ) {
    if (safe) return { queued: false, alreadyRecorded: false };
    fail(
      422,
      "participation_delivery_quota",
      "The bounded notification journal is full. Export and review retention before queuing another notice.",
    );
  }
  const seq = Number(
    (
      await c.query(
        "SELECT COALESCE(max(event_revision),0)+1 AS revision FROM os_participation_outbox WHERE org_id=$1 AND participation_id=$2",
        [org, p.id],
      )
    ).rows[0].revision,
  );
  if (!positive(seq) || seq > 2147483647)
    fail(
      422,
      "participation_delivery_quota",
      "This notification sequence is exhausted.",
    );
  const payload = { state: p.state, participationId: p.id, revision: seq },
    consent = p.delivery_consent;
  await c.query(
    "INSERT INTO os_participation_outbox(org_id,id,participation_id,event_revision,participation_revision,purpose,channel,state,payload,intent_kind,consent_revision,consent_copy,user_id,link_id,link_revision,recipient_hash,policy_epoch,template_version,relay_key,payload_hash,budget_bytes) VALUES($1,$2,$3,$4,$5,'participation','email',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)",
    [
      org,
      id(),
      p.id,
      seq,
      p.revision,
      live ? "pending" : "paused",
      JSON.stringify(payload),
      live ? kind : "legacy",
      live ? consent.revision : 0,
      live ? DELIVERY_CONSENT_VERSION : null,
      live ? eligible.recipient.userId : null,
      live ? eligible.recipient.linkId : null,
      live ? eligible.recipient.linkRevision : null,
      live ? consent.recipientHash : null,
      live ? pol.epoch : null,
      live ? DELIVERY_TEMPLATE_VERSION : null,
      live ? "participation-" + id() : null,
      live ? eligible.payloadHash : null,
      live ? DELIVERY_LIMITS.reserve : 0,
    ],
  );
  if (live)
    await c.query(
      "INSERT INTO os_job_tenants(org_id) VALUES($1) ON CONFLICT(org_id) DO NOTHING",
      [org],
    );
  return { queued: true, alreadyRecorded: false };
}
export async function queueParticipationTransition(
  c,
  { org, participation, settings = {}, safe = false },
) {
  await lock(c, org);
  const pol = await policy(c, org);
  const eligible = await eligibility(c, {
    org,
    participation,
    settings,
    policy: pol,
  });
  return (
    await appendIntent(c, {
      org,
      participation,
      policy: pol,
      eligible,
      kind: "transition",
      safe,
    })
  ).queued;
}

function writer(member) {
  if (
    !["events", "volunteers"].some(
      (m) => modulePermissions(m, member.role).write,
    )
  )
    fail(403, "role", "A scoped event or volunteer writer is required.");
}
function readable(p, records, member) {
  if (!modulePermissions(p.module_id, member.role).write) return false;
  return [p.target_id, p.booking_record_id, p.contact_id].every((rid) =>
    records.some((r) => r.id === rid && !!visibleRecord(r, member)),
  );
}
function page(rows, cursor) {
  if (cursor && (!opaque(cursor) || !rows.some((r) => r.id === cursor)))
    fail(
      422,
      "participation_delivery_cursor",
      "Use the page cursor from this delivery console.",
    );
  const start = cursor ? rows.findIndex((r) => r.id === cursor) + 1 : 0,
    selected = rows.slice(start, start + DELIVERY_LIMITS.page);
  return {
    selected,
    nextCursor:
      rows.length > start + DELIVERY_LIMITS.page ? selected.at(-1).id : null,
  };
}
async function scopedRows(c, org, member) {
  writer(member);
  const records = await allRecords(c, org),
    entries = (
      await c.query(
        "SELECT * FROM os_participations WHERE org_id=$1 ORDER BY created_at,id",
        [org],
      )
    ).rows;
  return {
    records,
    entries: entries.filter((p) => readable(p, records, member)),
  };
}
export async function deliveryRoutes({
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
  if (!tail.startsWith("participation-delivery")) return null;
  const match =
    /^participation-delivery(?:\/(preview|activate|disable|outbox))?$/.exec(
      tail,
    );
  if (!match) unavailable();
  const action = match[1] || null;
  const query = participantQuery(
    url,
    method === "GET" && [null, "outbox"].includes(action) ? ["cursor"] : [],
  );
  writer(member);
  if (
    (method === "GET" && ![null, "outbox"].includes(action)) ||
    (method !== "GET" &&
      (method !== "POST" ||
        !["preview", "activate", "disable"].includes(action)))
  )
    fail(
      405,
      "participation_delivery_method",
      "Use the documented delivery command.",
    );
  await lock(c, org);
  if (method === "GET") {
    const pol = await policy(c, org),
      { records, entries } = await scopedRows(c, org, member),
      visible = new Set(entries.map((p) => p.id));
    const outbox = (
      await c.query(
        "SELECT id,participation_id,state,safe_code,provider_event_at,last_checked_at,created_at FROM os_participation_outbox WHERE org_id=$1 ORDER BY created_at DESC,id DESC",
        [org],
      )
    ).rows.filter((o) => visible.has(o.participation_id));
    if (action === "outbox") {
      const result = page(outbox, query.get("cursor"));
      return okay({
        outbox: result.selected.map((o) => ({
          id: o.id,
          participationId: o.participation_id,
          state: o.state,
          safeCode: o.safe_code || null,
          providerEventAt: iso(o.provider_event_at),
          lastCheckedAt: iso(o.last_checked_at),
          createdAt: iso(o.created_at),
        })),
        nextCursor: result.nextCursor,
      });
    }
    const result = page(
        entries.filter((p) => p.state === "confirmed"),
        query.get("cursor"),
      ),
      candidates = [];
    for (const p of result.selected) {
      const e = await eligibility(c, {
        org,
        participation: p,
        settings,
        policy: pol,
        snapshot: true,
        requireGates: false,
      });
      const reason = e.reason || gate(settings, e.recipient.email);
      candidates.push({
        participationId: p.id,
        label: p.frozen?.terms?.title || "Approved participation",
        revision: p.revision,
        state: p.state,
        eligible: !reason,
        reason,
      });
    }
    return okay({
      policy: policyObject(pol),
      available:
        settings.participationDeliveryEnabled === true &&
        (settings.participationTestOnly === false ||
          !!participantEmail(settings.participationTestRecipient)),
      controlledMode: settings.participationTestOnly !== false,
      canManage: administrators(member.role),
      counts: Object.fromEntries(
        DELIVERY_STATES.map((s) => [
          s,
          outbox.filter((o) => o.state === s).length,
        ]),
      ),
      candidates,
      nextCursor: result.nextCursor,
    });
  }
  requireAdmin(member);
  const pol = await policy(c, org, true);
  if (action === "disable") {
    exact(input, ["policyRevision", "idempotencyKey"]);
    const command = intent(input, user, "delivery.disable");
    if (replay(pol.last_command, command)) return okay(pol.last_command.result);
    expected(input, pol.revision, "policyRevision");
    const cancelled = await suppressParticipationDelivery(c, {
        org,
        reason: "policy_disabled",
      }),
      result = {
        policy: {
          revision: pol.revision + 1,
          enabled: false,
          templateVersion: DELIVERY_TEMPLATE_VERSION,
        },
        cancelled,
      };
    await c.query(
      "UPDATE os_participation_delivery_policies SET enabled=false,revision=revision+1,last_command=$2,updated_at=now() WHERE org_id=$1",
      [org, JSON.stringify({ ...command, result })],
    );
    await audit(c, org, user, "participation.delivery.disabled", null, {
      cancelled,
    });
    return okay(result);
  }
  if (action === "preview") {
    exact(input, ["policyRevision", "participationIds"]);
    expected(input, pol.revision, "policyRevision");
    if (
      !Array.isArray(input.participationIds) ||
      input.participationIds.length < 1 ||
      input.participationIds.length > DELIVERY_LIMITS.selection ||
      input.participationIds.some((p) => !opaque(p)) ||
      new Set(input.participationIds).size !== input.participationIds.length
    )
      fail(
        422,
        "participation_delivery_selection",
        "Choose 1–20 different current confirmations.",
      );
    const { entries } = await scopedRows(c, org, member),
      bindings = [];
    for (const pid of input.participationIds) {
      const p = entries.find((p) => p.id === pid);
      if (!p) unavailable();
      const e = await eligibility(c, {
        org,
        participation: p,
        settings,
        policy: pol,
        snapshot: true,
        requireGates: false,
      });
      if (!e.reason) e.reason = gate(settings, e.recipient.email);
      bindings.push(binding(p, e));
    }
    if (
      Buffer.byteLength(JSON.stringify(bindings)) > DELIVERY_LIMITS.previewBytes
    )
      fail(
        422,
        "participation_delivery_preview",
        "The bounded review selection is too large.",
      );
    await c.query(
      "DELETE FROM os_participation_delivery_previews WHERE org_id=$1 AND expires_at<=now()",
      [org],
    );
    if (
      Number(
        (
          await c.query(
            "SELECT count(*) AS count FROM os_participation_delivery_previews WHERE org_id=$1",
            [org],
          )
        ).rows[0].count,
      ) >= DELIVERY_LIMITS.previews
    )
      fail(
        422,
        "participation_delivery_preview",
        "Four delivery reviews are already retained. Wait for one to expire before preparing another.",
      );
    const previewId = id(),
      reviewHash = hash({ org, user, policyRevision: pol.revision, bindings }),
      expiresAt = new Date(Date.now() + 600000).toISOString();
    await c.query(
      "INSERT INTO os_participation_delivery_previews(org_id,id,actor_id,policy_revision,review_hash,bindings,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        org,
        previewId,
        user,
        pol.revision,
        reviewHash,
        JSON.stringify(bindings),
        expiresAt,
      ],
    );
    await audit(c, org, user, "participation.delivery.previewed", null, {
      previewId,
      selected: bindings.length,
    });
    const rows = bindings.map((b) => ({
      participationId: b.participationId,
      eligible: !b.reason,
      reason: b.reason,
    }));
    return okay({
      previewId,
      reviewHash,
      policyRevision: pol.revision,
      expiresAt,
      summary: {
        selected: rows.length,
        eligible: rows.filter((r) => r.eligible).length,
        ineligible: rows.filter((r) => !r.eligible).length,
      },
      rows,
    });
  }
  exact(input, ["previewId", "reviewHash", "policyRevision", "idempotencyKey"]);
  const command = intent(input, user, "delivery.activate");
  if (replay(pol.last_command, command)) return okay(pol.last_command.result);
  expected(input, pol.revision, "policyRevision");
  if (!opaque(input.previewId) || !digest(input.reviewHash))
    fail(
      422,
      "participation_delivery_preview",
      "Use the exact saved delivery review.",
    );
  const preview = (
    await c.query(
      "SELECT * FROM os_participation_delivery_previews WHERE org_id=$1 AND id=$2 AND actor_id=$3 AND expires_at>now() AND committed_at IS NULL",
      [org, input.previewId, user],
    )
  ).rows[0];
  if (
    !preview ||
    preview.review_hash !== input.reviewHash ||
    preview.policy_revision !== pol.revision ||
    !Array.isArray(preview.bindings)
  )
    fail(
      409,
      "participation_delivery_preview",
      "This review expired or changed. Prepare a new delivery review.",
    );
  const { entries } = await scopedRows(c, org, member),
    current = [];
  for (const b of preview.bindings) {
    const p = entries.find((p) => p.id === b.participationId);
    if (!p)
      fail(
        409,
        "participation_delivery_preview",
        "A selected participation changed. Prepare a new review.",
      );
    const e = await eligibility(c, {
      org,
      participation: p,
      settings,
      policy: pol,
      snapshot: true,
      requireGates: false,
    });
    if (!e.reason) e.reason = gate(settings, e.recipient.email);
    if (e.reason || stable(binding(p, e)) !== stable(b))
      fail(
        409,
        "participation_delivery_preview",
        "A selected consent, recipient or confirmation changed. Prepare a new review.",
      );
    current.push({ p, e });
  }
  const nextPolicy = {
    ...pol,
    revision: pol.revision + 1,
    enabled: true,
    epoch: pol.enabled ? pol.epoch : id(),
  };
  let queued = 0,
    alreadyRecorded = 0;
  for (const { p, e } of current) {
    const result = await appendIntent(c, {
      org,
      participation: p,
      policy: nextPolicy,
      eligible: e,
      kind: "snapshot",
    });
    queued += result.queued ? 1 : 0;
    alreadyRecorded += result.alreadyRecorded ? 1 : 0;
  }
  const result = { policy: policyObject(nextPolicy), queued, alreadyRecorded };
  await c.query(
    "UPDATE os_participation_delivery_policies SET enabled=true,revision=$2,epoch=$3,activated_at=COALESCE(activated_at,now()),template_version=$4,last_command=$5,updated_at=now() WHERE org_id=$1",
    [
      org,
      nextPolicy.revision,
      nextPolicy.epoch,
      DELIVERY_TEMPLATE_VERSION,
      JSON.stringify({ ...command, result }),
    ],
  );
  await c.query(
    "UPDATE os_participation_delivery_previews SET committed_at=now() WHERE org_id=$1 AND id=$2",
    [org, preview.id],
  );
  await audit(c, org, user, "participation.delivery.activated", null, {
    previewId: preview.id,
    queued,
    alreadyRecorded,
  });
  return okay(result);
}

export async function ownDeliveryRoutes({
  request,
  url = new URL(request.url),
  db,
  settings,
  session,
  input,
}) {
  const match =
    /^\/api\/participant\/orgs\/([A-Za-z0-9_-]{1,100})\/requests\/([A-Za-z0-9_-]{1,100})\/participations\/([A-Za-z0-9_-]{1,100})\/(delivery|delivery-preference)$/.exec(
      url.pathname,
    );
  if (!match) return null;
  const actor = verifiedParticipant(session);
  participantQuery(url);
  if (!(
    (request.method === "GET" && match[4] === "delivery") ||
    (request.method === "POST" && match[4] === "delivery-preference")
  ))
    fail(
      405,
      "participation_delivery_method",
      "Use the documented delivery preference command.",
    );
  if (request.method === "POST") {
    checkCsrf(request, session, settings);
    if (
      !/^application\/json(?:;|$)/i.test(
        request.headers.get("content-type") || "",
      )
    )
      fail(415, "content_type", "Supply JSON.");
    input = input === undefined ? await body(request, 16384) : input;
    if (Buffer.byteLength(JSON.stringify(input)) > 16384)
      fail(413, "size", "This request is too large.");
    exact(input, [
      "revision",
      "intakeRevision",
      "enabled",
      "consentVersion",
      "idempotencyKey",
    ]);
  }
  const [, org, intakeId, pid] = match;
  await db.tx(actor.id, null, async (c) => {
    if (
      !(
        await c.query(
          "SELECT id FROM os_participant_links WHERE user_id=$1 AND org_id=$2 AND intake_id=$3 AND revoked_at IS NULL",
          [actor.id, org, intakeId],
        )
      ).rows.length
    )
      unavailable();
  });
  return db.tx(
    actor.id,
    org,
    async (c) => {
      const intake = (
        await c.query(
          `SELECT i.* FROM os_participant_links l JOIN os_intake i ON i.org_id=l.org_id AND i.id=l.intake_id AND i.publication_id=l.publication_id WHERE l.user_id=$1 AND l.org_id=$2 AND l.intake_id=$3 AND l.revoked_at IS NULL${request.method === "GET" ? "" : " FOR UPDATE OF i,l"}`,
          [actor.id, org, intakeId],
        )
      ).rows[0];
      const p =
        intake &&
        (
          await c.query(
            `SELECT * FROM os_participations WHERE org_id=$1 AND id=$2 AND intake_id=$3${request.method === "GET" ? "" : " FOR UPDATE"}`,
            [org, pid, intakeId],
          )
        ).rows[0];
      if (!p) unavailable();
      let current = p;
      if (request.method === "POST") {
        const command = intent(input, actor.id, "delivery.preference");
        if (!replay(p.last_command, command)) {
          expected(input, p.revision);
          expected(input, intake.revision, "intakeRevision");
          if (
            typeof input.enabled !== "boolean" ||
            input.consentVersion !== DELIVERY_CONSENT_VERSION
          )
            fail(
              422,
              "participation_delivery_consent",
              "Choose the current specific operational-email preference.",
            );
          const own = await ownBinding(c, {
              org,
              participation: p,
              intake,
              actor,
            }),
            summary = await ownDeliverySummary(c, {
              org,
              participation: p,
              intake,
              settings,
              actor,
            });
          if (input.enabled && (!own || !summary.canEnable))
            fail(
              409,
              "participation_delivery_consent",
              "A current verified original request binding is required to enable email updates.",
            );
          const consent = {
            version: DELIVERY_CONSENT_VERSION,
            enabled: input.enabled,
            revision: (p.delivery_consent?.revision || 0) + 1,
            at: new Date().toISOString(),
            ...(input.enabled
              ? {
                  userId: own.userId,
                  linkId: own.linkId,
                  linkRevision: own.linkRevision,
                  recipientHash: hash(own.email),
                }
              : {}),
          };
          current = (
            await c.query(
              "UPDATE os_participations SET delivery_consent=$3,revision=revision+1,last_command=$4,updated_at=now() WHERE org_id=$1 AND id=$2 RETURNING *",
              [org, pid, JSON.stringify(consent), JSON.stringify(command)],
            )
          ).rows[0];
          if (!input.enabled)
            await suppressParticipationDelivery(c, {
              org,
              participationId: pid,
              reason: "preference_off",
            });
          await audit(
            c,
            org,
            actor.id,
            input.enabled
              ? "participation.delivery.preference_enabled"
              : "participation.delivery.preference_off",
            null,
            { participationId: pid, enabled: input.enabled },
          );
        }
      }
      return okay({
        participationId: current.id,
        revision: current.revision,
        intakeRevision: intake.revision,
        delivery: await ownDeliverySummary(c, {
          org,
          participation: current,
          intake,
          settings,
          actor,
        }),
      });
    },
    { lock: true, readOnly: request.method === "GET" },
  );
}

// Only these bounded outcomes may reach status DTOs. Unknown/malformed transport
// responses never create permission to resend an ambiguous provider attempt.
const safeCodes = new Set([
  "accepted",
  "delivered",
  "suppressed",
  "failed",
  "unknown",
  "creating",
  "limited",
  "preflight_unavailable",
  "participation_disabled",
  "controlled_recipient_required",
  "rate_limited",
  "status_rate_limited",
  "intent_not_found",
  "attempt_unconfirmed",
  "recipient_suppressed",
  "provider_accepted",
  "provider_delivered",
  "provider_failed",
  "provider_suppressed",
  "provider_bounced",
  "provider_complained",
  "provider_delayed",
  "payload_conflict",
  "invalid_request",
  "transport_unavailable",
  "response_unconfirmed",
  "intent_unknown",
  "intent_in_progress",
  "intent_lookup_unavailable",
  "intent_conflict",
  "reservation_unconfirmed",
  "provider_rejected",
  "provider_sent",
  "provider_delivery_delayed",
  "provider_canceled",
  "authentication_required",
  "server_only",
  "status_unavailable",
]);
export function deliveryOutcome(value, { status = false } = {}) {
  if (
    !plain(value) ||
    !safeCodes.has(value.safeCode) ||
    (value.providerEventAt != null && !stamp(value.providerEventAt))
  )
    return {
      state: "unknown",
      safeCode: "response_unconfirmed",
      providerEventAt: null,
    };
  const { state, safeCode, providerEventAt = null } = value;
  const facts = {
    accepted: [
      "provider_accepted",
      "provider_sent",
      "provider_delivery_delayed",
      "accepted",
    ],
    delivered: ["provider_delivered", "delivered"],
    suppressed: [
      "provider_bounced",
      "provider_complained",
      "provider_suppressed",
      "recipient_suppressed",
      "suppressed",
    ],
    failed: [
      "provider_failed",
      "provider_canceled",
      "provider_rejected",
      "invalid_request",
      "failed",
    ],
    creating: ["intent_in_progress", "creating"],
    limited: ["rate_limited", "limited"],
    unknown: [
      "intent_unknown",
      "intent_conflict",
      "intent_lookup_unavailable",
      "reservation_unconfirmed",
      "attempt_unconfirmed",
      "response_unconfirmed",
      "unknown",
    ],
    unavailable: [
      "preflight_unavailable",
      "authentication_required",
      "server_only",
      "invalid_request",
      "status_rate_limited",
      "status_unavailable",
      "transport_unavailable",
      "participation_disabled",
      "controlled_recipient_required",
    ],
  };
  if (!facts[state] || !facts[state].includes(safeCode))
    return {
      state: "unknown",
      safeCode: "response_unconfirmed",
      providerEventAt: null,
    };
  if (
    ["accepted", "delivered", "suppressed", "failed", "unknown"].includes(state)
  )
    return { state, safeCode, providerEventAt };
  if (state === "limited")
    return { state: "failed", safeCode, providerEventAt };
  if (
    !status &&
    state === "unavailable" &&
    safeCode === "preflight_unavailable"
  )
    return {
      state: "pending",
      safeCode,
      providerEventAt: null,
      provenNoAttempt: true,
    };
  return { state: "unknown", safeCode, providerEventAt };
}
async function workerTransaction(
  db,
  org,
  budget,
  fn,
  { waitForLock = false } = {},
) {
  if (Date.now() >= budget.deadline - 3000) return null;
  try {
    return await db.tx("", org, async (c) => {
      await c.query("SELECT set_config('statement_timeout',$1,true)", [
        String(
          Math.max(1, Math.min(2000, budget.deadline - Date.now() - 3000)),
        ),
      ]);
      const bounded = {
        query(text, values) {
          const milliseconds = Math.floor(budget.deadline - Date.now() - 3000);
          if (milliseconds < 1)
            fail(
              503,
              "participation_delivery_deadline",
              "The bounded dispatch window ended; saved work remains recoverable.",
            );
          return c.query({
            text,
            values,
            query_timeout: Math.min(2000, milliseconds),
          });
        },
      };
      let acquired;
      if (waitForLock) {
        // A completed provider attempt must not lose its known outcome merely
        // because another worker is briefly scanning this tenant. The statement
        // and query timeouts still bound this wait to the remaining window.
        await bounded.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [org],
        );
        acquired = true;
      } else {
        acquired = (
          await bounded.query(
            "SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked",
            [org],
          )
        ).rows[0]?.locked;
      }
      return acquired ? fn(bounded) : null;
    });
  } catch (e) {
    if (
      ["57014", "55P03", "participation_delivery_deadline"].includes(e.code) ||
      e.message === "Query read timeout"
    )
      return null;
    throw e;
  }
}
async function leaseWork(db, org, budget) {
  return workerTransaction(db, org, budget, async (c) => {
    await c.query(
      "UPDATE os_participation_outbox SET state=CASE WHEN first_attempt_at IS NULL THEN 'pending' ELSE 'unknown' END,safe_code=CASE WHEN first_attempt_at IS NULL THEN safe_code ELSE 'attempt_unconfirmed' END,lease_owner=NULL,lease_until=NULL WHERE org_id=$1 AND intent_kind<>'legacy' AND state='leased' AND lease_until<now()",
      [org],
    );
    const row = (
      await c.query(
        "SELECT * FROM os_participation_outbox WHERE org_id=$1 AND intent_kind<>'legacy' AND relay_key IS NOT NULL AND state IN ('pending','unknown','accepted','delivered') AND next_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_at,created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",
        [org],
      )
    ).rows[0];
    if (!row) return null;
    const owner = id();
    await c.query(
      "UPDATE os_participation_outbox SET lease_owner=$3,lease_until=now()+interval '2 minutes',state=CASE WHEN state='pending' THEN 'leased' ELSE state END WHERE org_id=$1 AND id=$2",
      [org, row.id, owner],
    );
    return {
      ...row,
      lease_owner: owner,
      operation:
        row.first_attempt_at || ["unknown", "accepted"].includes(row.state)
          ? "status"
          : "send",
    };
  });
}
async function finalCheck(db, org, job, settings, budget) {
  return workerTransaction(db, org, budget, async (c) => {
    const row = (
      await c.query(
        "SELECT * FROM os_participation_outbox WHERE org_id=$1 AND id=$2 AND lease_owner=$3 AND lease_until>now() FOR UPDATE",
        [org, job.id, job.lease_owner],
      )
    ).rows[0];
    if (!row) return null;
    if (job.operation === "status") return { job: row, message: null };
    if (row.state !== "leased" || row.first_attempt_at) return null;
    const p = (
        await c.query(
          "SELECT * FROM os_participations WHERE org_id=$1 AND id=$2",
          [org, row.participation_id],
        )
      ).rows[0],
      pol = await policy(c, org);
    let e = p
      ? await eligibility(c, { org, participation: p, settings, policy: pol })
      : { reason: "state_ineligible" };
    const consent = p?.delivery_consent;
    const stale =
      !p ||
      p.revision !== row.participation_revision ||
      p.state !== row.payload?.state ||
      consent?.revision !== row.consent_revision ||
      consent?.version !== row.consent_copy ||
      consent?.userId !== row.user_id ||
      consent?.linkId !== row.link_id ||
      consent?.linkRevision !== row.link_revision ||
      consent?.recipientHash !== row.recipient_hash ||
      row.policy_epoch !== pol.epoch ||
      row.template_version !== DELIVERY_TEMPLATE_VERSION ||
      (!e.reason && e.payloadHash !== row.payload_hash);
    if (
      stale ||
      (e.reason &&
        !["service_disabled", "controlled_recipient_required"].includes(
          e.reason,
        ))
    ) {
      await c.query(
        "UPDATE os_participation_outbox SET state='cancelled',safe_code='authority_withdrawn',lease_owner=NULL,lease_until=NULL WHERE org_id=$1 AND id=$2 AND lease_owner=$3",
        [org, row.id, job.lease_owner],
      );
      return { cancelled: true };
    }
    if (e.reason) {
      await c.query(
        "UPDATE os_participation_outbox SET state='pending',safe_code=$4,lease_owner=NULL,lease_until=NULL,next_at=now()+interval '1 hour' WHERE org_id=$1 AND id=$2 AND lease_owner=$3",
        [
          org,
          row.id,
          job.lease_owner,
          e.reason === "service_disabled" ? "participation_disabled" : e.reason,
        ],
      );
      return { deferred: true };
    }
    if (Date.now() >= budget.deadline - 4000) return null;
    await c.query(
      "UPDATE os_participation_outbox SET first_attempt_at=now(),attempts=attempts+1 WHERE org_id=$1 AND id=$2 AND lease_owner=$3 AND first_attempt_at IS NULL",
      [org, row.id, job.lease_owner],
    );
    return { job: row, message: e.message };
  });
}
async function releaseUnattempted(db, org, job, budget) {
  if (Date.now() >= budget.deadline - 4000) return;
  try {
    await db.tx("", org, async (c) => {
      await c.query("SELECT set_config('statement_timeout','2000',true)");
      // No allocation lock is needed for this nonce-conditional lease release.
      // An attempted, cancelled or superseded row can never become pending here.
      await c.query(
        "UPDATE os_participation_outbox SET state='pending',lease_owner=NULL,lease_until=NULL WHERE org_id=$1 AND id=$2 AND lease_owner=$3 AND state='leased' AND first_attempt_at IS NULL",
        [org, job.id, job.lease_owner],
      );
    });
  } catch (e) {
    if (!["57014", "55P03"].includes(e.code)) throw e;
  }
}
async function completeWork(db, org, job, result, budget) {
  return workerTransaction(
    db,
    org,
    budget,
    async (c) => {
      const row = (
        await c.query(
          "SELECT * FROM os_participation_outbox WHERE org_id=$1 AND id=$2 AND lease_owner=$3 FOR UPDATE",
          [org, job.id, job.lease_owner],
        )
      ).rows[0];
      if (!row) return false;
      let next = result.state;
      // Older status snapshots cannot downgrade already recorded provider facts.
      if (
        ["delivered", "suppressed", "failed"].includes(row.state) &&
        !["suppressed", "failed"].includes(next)
      )
        next = row.state;
      if (row.state === "accepted" && next === "unknown") next = "accepted";
      let safeCode = result.safeCode,
        providerEventAt = result.providerEventAt;
      if (
        next !== result.state ||
        (next === row.state &&
          row.provider_event_at &&
          providerEventAt &&
          Date.parse(providerEventAt) < Date.parse(row.provider_event_at))
      ) {
        safeCode = row.safe_code;
        providerEventAt = iso(row.provider_event_at);
      }
      await c.query(
        "UPDATE os_participation_outbox SET state=$4,safe_code=$5,provider_event_at=$6::timestamptz,last_checked_at=now(),first_attempt_at=CASE WHEN $7::boolean THEN NULL ELSE first_attempt_at END,lease_owner=NULL,lease_until=NULL,next_at=now()+CASE WHEN $7::boolean THEN interval '1 hour' WHEN $4='delivered' THEN interval '1 day' ELSE interval '30 minutes' END WHERE org_id=$1 AND id=$2 AND lease_owner=$3",
        [
          org,
          job.id,
          job.lease_owner,
          next,
          safeCode,
          providerEventAt == null ? null : new Date(providerEventAt),
          result.provenNoAttempt === true && job.operation === "send",
        ],
      );
      if (result.state === "suppressed") {
        await c.query(
          "UPDATE os_participations SET delivery_consent=jsonb_build_object('version',$4::text,'enabled',false,'revision',COALESCE((delivery_consent->>'revision')::integer,0)+1,'at',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')),revision=revision+1,updated_at=now() WHERE org_id=$1 AND id=$2 AND delivery_consent->>'recipientHash'=$3 AND delivery_consent->>'enabled'='true'",
          [
            org,
            row.participation_id,
            row.recipient_hash,
            DELIVERY_CONSENT_VERSION,
          ],
        );
        await suppressParticipationDelivery(c, {
          org,
          participationId: row.participation_id,
          reason: "recipient_blocked",
        });
      }
      return true;
    },
    { waitForLock: true },
  );
}
export async function runParticipationDelivery({
  db,
  transport,
  settings,
  budget = { deadline: Date.now() + 45000, remaining: 20 },
}) {
  if (
    !Number.isSafeInteger(budget.remaining) ||
    budget.remaining < 0 ||
    !Number.isFinite(budget.deadline)
  )
    fail(
      422,
      "participation_delivery_budget",
      "Use a bounded shared delivery budget.",
    );
  const result = {
    attempted: 0,
    reconciled: 0,
    cancelled: 0,
    deferred: 0,
    visited: 0,
    budgetLimited: false,
  };
  if (
    !transport?.sendParticipation ||
    !transport?.participationStatus ||
    budget.remaining === 0
  )
    return result;
  const orgs = (
    await db.pool.query(
      "SELECT org_id FROM os_job_tenants ORDER BY participation_last_run_at,org_id LIMIT 50",
    )
  ).rows.map((r) => r.org_id);
  let work = true,
    rounds = 0;
  while (
    work &&
    rounds++ < 20 &&
    budget.remaining > 0 &&
    Date.now() < budget.deadline - 5000
  ) {
    work = false;
    for (const org of orgs) {
      if (budget.remaining <= 0 || Date.now() >= budget.deadline - 5000) break;
      await db.pool.query(
        "UPDATE os_job_tenants SET participation_last_run_at=now() WHERE org_id=$1",
        [org],
      );
      const job = await leaseWork(db, org, budget);
      result.visited++;
      if (!job) continue;
      // Reserving the operation at lease selection bounds privacy cancellation
      // and config deferral too. This final reserved operation may still send
      // or reconcile when the shared remaining counter has just reached zero.
      budget.remaining--;
      work = true;
      let checked = await finalCheck(db, org, job, settings, budget);
      // A concurrent worker's empty lease scan may briefly own this tenant
      // lock. Recheck the same charged lease once; this is never a mail retry.
      if (!checked && Date.now() < budget.deadline - 6000)
        checked = await finalCheck(db, org, job, settings, budget);
      if (checked?.cancelled) {
        result.cancelled++;
        continue;
      }
      if (checked?.deferred) {
        result.deferred++;
        continue;
      }
      if (!checked) {
        await releaseUnattempted(db, org, job, budget);
        continue;
      }
      if (Date.now() >= budget.deadline - 3000) continue;
      let response;
      try {
        response =
          job.operation === "send"
            ? await transport.sendParticipation(
                checked.message,
                job.relay_key,
                { deadline: budget.deadline },
              )
            : await transport.participationStatus(job.relay_key, {
                deadline: budget.deadline,
              });
      } catch {
        response = {
          state: "unknown",
          safeCode: "response_unconfirmed",
          providerEventAt: null,
        };
      }
      const outcome = deliveryOutcome(response, {
        status: job.operation === "status",
      });
      await completeWork(db, org, job, outcome, budget);
      if (job.operation === "send") result.attempted++;
      else result.reconciled++;
    }
  }
  result.budgetLimited =
    budget.remaining === 0 || Date.now() >= budget.deadline - 5000;
  return result;
}
