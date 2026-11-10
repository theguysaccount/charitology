import { types as nodeTypes } from "node:util";
import { participationChargeJsonSQL } from "./participation-storage.mjs";
import { retainParticipationAuditOutcome } from "./participation-receipt.mjs";
import {
  validateRequestedInterval,
  requestedInterval,
  effectiveRequestedInterval,
  frozenParticipationInterval,
  peakOccupancy,
  sameInterval,
} from "./participation-intervals.mjs";
import {
  queueParticipationTransition,
  ownDeliverySummary,
  suppressParticipationDelivery,
} from "./participation-delivery.mjs";
import {
  audit,
  noteParticipationReceiptReplay,
  allRecords,
  rowRecord,
  saveRecord,
  logicalBackupBytes,
} from "./database.mjs";
import {
  requireAdmin,
  requirePermission,
  visibleRecord,
  membership,
  administrators,
} from "./access.mjs";
import { validateRecord, modulePermissions } from "./modules.mjs";
import { verifiedParticipant, participantQuery } from "./participants.mjs";
import { checkCsrf, body, hash, id, fail, json, stable } from "./security.mjs";
import {
  orientationOperation, orientationRequired, orientationUnavailable, refuseProtectedVolunteerOrientation,
  volunteerOrientationForTarget,
} from "./volunteer-orientation-marker.mjs";
import {
  makeOrientationAcceptance, orientationAcceptanceSummary, readVolunteerOrientationAcceptance,
  requireVolunteerOrientationStorage, retainVolunteerOrientationAcceptance,
} from "./volunteer-orientation-storage.mjs";
import {
  readDeclaredVolunteerOrientationPolicy, requireVolunteerOrientationForPlace,
} from "./volunteer-orientation-admission.mjs";
import {
  participationModule,
  targetKind,
  bookingKind,
  parentKey,
  legacyActive,
  intervalsOverlap,
} from "./participation-guards.mjs";

export const PARTICIPATION_LIMITS = Object.freeze({
  targets: 500,
  targetBytes: 2 * 1024 * 1024,
  participations: 2000,
  participationBytes: 8 * 1024 * 1024,
  outbox: 8000,
  outboxBytes: 8 * 1024 * 1024,
  payloadBytes: 2048,
  page: 20,
});
const okay = (value, status = 200) =>
  json({ ok: true, ...value }, status, { "referrer-policy": "no-referrer" });
const opaque = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v);
const iso = (v) => (v ? new Date(v).toISOString() : null);
const plain = (v) =>
  v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
const unavailable = () =>
  fail(404, "participation", "This participation is unavailable.");
const exact = (input, keys) => {
  if (!plain(input) || Object.keys(input).some((k) => !keys.includes(k)))
    fail(
      422,
      "participation_fields",
      "Use only the documented participation fields.",
    );
};
const revision = (input, value, key = "revision") => {
  if (!Number.isSafeInteger(input[key]) || input[key] !== value)
    fail(
      409,
      "revision",
      "This participation or source changed. Reload before continuing.",
    );
};
const text = (value, max, required = false) => {
  if (value == null && !required) return null;
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (required && !value.trim()) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    fail(
      422,
      "participation_text",
      "Use bounded operational text without control characters.",
    );
  return value.trim();
};
const independent = (r) =>
  !!r &&
  r.approval?.status === "approved" &&
  r.approval.revision === r.revision &&
  typeof r.approval.actorId === "string" &&
  !!r.approval.actorId &&
  r.approval.actorId !== r.lastEditedBy;
const open = (r) =>
  (r.moduleId === "events"
    ? ["scheduled", "open"]
    : ["open", "assigned"]
  ).includes(r.status);
const sourceApproved = (r) =>
  independent(r) &&
  ["approved", "scheduled", "open", "assigned", "completed"].includes(r.status);

// Internal misuse protection, not session, transaction-freshness or allocation
// authority. A caller must capture a fresh SQL clock for each new group command
// in its already-authorized/locked transaction and never cache it across calls.
const sqlDomainClocks = new WeakMap();
const LEGACY_DOMAIN_CLOCK = Object.freeze({});
const QUIET_SUBSTITUTION = Symbol("reviewed shift substitution");
const GROUP_CHILD = Symbol("reviewed group participation");
const TEN_MINUTES_MICROS = 600000000n;
function exactClockMicros(value) {
  if (
    typeof value !== "string" ||
    !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)
  )
    return null;
  const millisecondsText = value.slice(0, 23) + "Z";
  const milliseconds = Date.parse(millisecondsText);
  if (
    !Number.isSafeInteger(milliseconds) ||
    new Date(milliseconds).toISOString() !== millisecondsText
  )
    return null;
  return BigInt(milliseconds) * 1000n + BigInt(value.slice(23, 26));
}
function clockWindow(window) {
  if (window === undefined) return [null, null];
  if (
    !window ||
    typeof window !== "object" ||
    nodeTypes.isProxy(window) ||
    Object.getPrototypeOf(window) !== Object.prototype ||
    Object.getOwnPropertySymbols(window).length
  )
    fail(422, "participation_clock", "Use an exact SQL preview window.");
  const descriptors = Object.getOwnPropertyDescriptors(window);
  const keys = Object.keys(descriptors);
  if (
    keys.length !== 2 ||
    !["issuedAtExact", "expiresAtExact"].every(
      (key) =>
        descriptors[key]?.enumerable === true &&
        Object.hasOwn(descriptors[key], "value"),
    )
  )
    fail(422, "participation_clock", "Use an exact SQL preview window.");
  const issued = descriptors.issuedAtExact.value;
  const expires = descriptors.expiresAtExact.value;
  const issuedMicros = exactClockMicros(issued);
  const expiresMicros = exactClockMicros(expires);
  if (
    issuedMicros === null ||
    expiresMicros === null ||
    expiresMicros - issuedMicros !== TEN_MINUTES_MICROS
  )
    fail(422, "participation_clock", "Use an exact ten-minute preview window.");
  return [issued, expires];
}
export async function readParticipationDomainClock(c, window) {
  const parameters = clockWindow(window);
  const row = (
    await c.query(
      `WITH moment AS MATERIALIZED (SELECT clock_timestamp() AS n)
SELECT to_char(n AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at_exact,
       to_char((n + interval '10 minutes') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS expires_at_exact,
       ((extract(epoch FROM n) * 1000000)::bigint)::text AS epoch_microseconds,
       CASE WHEN $1::timestamptz IS NULL AND $2::timestamptz IS NULL THEN true
            ELSE $1::timestamptz <= n AND n < $2::timestamptz
                 AND $2::timestamptz - $1::timestamptz = interval '10 minutes'
       END AS within_window
FROM moment`,
      parameters,
    )
  ).rows[0];
  const atMicros = exactClockMicros(row?.at_exact);
  const expiresMicros = exactClockMicros(row?.expires_at_exact);
  if (
    atMicros === null ||
    expiresMicros === null ||
    expiresMicros - atMicros !== TEN_MINUTES_MICROS ||
    typeof row?.epoch_microseconds !== "string" ||
    !/^(?:0|[1-9]\d*|-[1-9]\d*)$/.test(row.epoch_microseconds) ||
    BigInt(row.epoch_microseconds) !== atMicros ||
    typeof row?.within_window !== "boolean"
  )
    fail(500, "participation_clock", "The SQL participation clock is unavailable.");
  if (!row.within_window)
    fail(409, "participation_clock", "This preview expired or is not current.");
  const clock = Object.freeze({
    atExact: row.at_exact,
    expiresAtExact: row.expires_at_exact,
  });
  sqlDomainClocks.set(clock, { c, atMicros });
  return clock;
}
function domainClock(c, clock) {
  if (clock === LEGACY_DOMAIN_CLOCK) return null;
  const profile = sqlDomainClocks.get(clock);
  if (!profile || profile.c !== c)
    fail(422, "participation_clock", "Capture a SQL clock in this transaction.");
  return profile;
}
function domainTimestamp(c, clock) {
  return domainClock(c, clock) ? clock.atExact : new Date().toISOString();
}

export function participationTerms(record) {
  if (
    !record ||
    !participationModule(record.moduleId) ||
    record.data?.kind !== targetKind(record.moduleId)
  )
    fail(422, "participation_target", "Choose a session or volunteer shift.");
  const d = record.data;
  // The shared typed validator proves dates, offsets, zones, bounds and fields.
  validateRecord(
    record.moduleId,
    Object.fromEntries(
      [
        "title",
        "kind",
        "startAt",
        "endAt",
        "timeZone",
        "participationPurpose",
        "participantInstructions",
        "organizerEmail",
        "organizerUrl",
        "allowPartialIntervals",
      ]
        .filter(
          (k) =>
            k !== "allowPartialIntervals" || record.moduleId === "volunteers",
        )
        .map((k) => [k, d[k]]),
    ),
    { recordId: record.id, orgId: record.orgId, status: "draft", records: [] },
  );
  if (
    !d.startAt ||
    !d.endAt ||
    !d.timeZone ||
    !Number.isFinite(Date.parse(d.startAt)) ||
    Date.parse(d.endAt) <= Date.parse(d.startAt)
  )
    fail(
      422,
      "participation_terms",
      "Publish a real complete occurrence with a named time zone.",
    );
  const terms = {
    title: text(d.title, 180, true),
    kind: d.kind,
    startAt: d.startAt,
    endAt: d.endAt,
    timeZone: d.timeZone,
    participationPurpose: text(d.participationPurpose, 600, true),
    participantInstructions: text(d.participantInstructions, 600) || null,
    organizerEmail: text(d.organizerEmail, 254) || null,
    organizerUrl: text(d.organizerUrl, 500) || null,
  };
  if (
    terms.organizerEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(terms.organizerEmail)
  )
    fail(422, "participation_terms", "Use a valid organizer email.");
  if (terms.organizerUrl) {
    let u;
    try {
      u = new URL(terms.organizerUrl);
    } catch {
      fail(422, "participation_terms", "Use a valid organizer HTTPS address.");
    }
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      /[\r\n]/.test(terms.organizerUrl)
    )
      fail(
        422,
        "participation_terms",
        "Use a credential-free organizer HTTPS address.",
      );
  }
  if (!terms.organizerEmail && !terms.organizerUrl)
    fail(
      422,
      "participation_terms",
      "Publish an organizer contact route before managing participation.",
    );
  if (record.moduleId === "volunteers" && d.allowPartialIntervals === true)
    terms.intervalPolicy = { version: 1, mode: "within-shift" };
  return terms;
}
export function participationAllocationHash(
  targetId,
  sourceRevision,
  termsHash,
  requestedInterval,
) {
  return hash({
    version: 1,
    targetId,
    sourceRevision,
    termsHash,
    requestedInterval,
  });
}
export function participationIntent(input, actor, action) {
  if (
    typeof input.idempotencyKey !== "string" ||
    !/^[A-Za-z0-9_-]{16,100}$/.test(input.idempotencyKey)
  )
    fail(
      422,
      "participation_intent",
      "Supply a random participation intent key of 16–100 characters.",
    );
  return {
    intentHash: hash({ actor, action, key: input.idempotencyKey }),
    payloadHash: hash(input),
    action,
    actorHash: hash(actor),
  };
}
export function participationReplay(last, intent) {
  if (last?.intentHash !== intent.intentHash) return false;
  if (last.payloadHash !== intent.payloadHash)
    fail(
      409,
      "participation_intent",
      "This intent was already used with different fields. Reload the current state.",
    );
  return true;
}
export async function participationQuota(c, org) {
  for (const [table, count, bytes] of [
    [
      "os_participation_targets",
      PARTICIPATION_LIMITS.targets,
      PARTICIPATION_LIMITS.targetBytes,
    ],
    [
      "os_participations",
      PARTICIPATION_LIMITS.participations,
      PARTICIPATION_LIMITS.participationBytes,
    ],
    [
      "os_participation_outbox",
      PARTICIPATION_LIMITS.outbox,
      PARTICIPATION_LIMITS.outboxBytes,
    ],
  ]) {
    const r = (
      await c.query(
        `SELECT count(*) AS count,COALESCE(sum(${table === "os_participation_outbox" ? "GREATEST(octet_length(to_jsonb(t)::text),COALESCE(budget_bytes,0))" : table === "os_participations" ? `octet_length(${participationChargeJsonSQL("t")}::text)` : "octet_length(to_jsonb(t)::text)"}),0) AS bytes FROM ${table} t WHERE org_id=$1`,
        [org],
      )
    ).rows[0];
    if (Number(r.count) > count || Number(r.bytes) > bytes)
      fail(
        422,
        "participation_quota",
        "This workspace reached its bounded participation storage limit. Existing places were kept.",
      );
  }
}
async function sources(c, org, targetId, { historical = false } = {}) {
  const records = await allRecords(c, org),
    current = records.find((r) => r.id === targetId);
  let source = current;
  if (!source && historical) {
    const raw = (
      await c.query("SELECT * FROM os_records WHERE org_id=$1 AND id=$2", [
        org,
        targetId,
      ])
    ).rows[0];
    if (raw)
      source = { ...rowRecord(raw), status: "cancelled", approval: null };
  }
  if (
    !source ||
    !participationModule(source.moduleId) ||
    source.data.kind !== targetKind(source.moduleId)
  )
    unavailable();
  return { records, source };
}
function permit(source, member, action = "write") {
  requirePermission(source.moduleId, member, action);
  if (!visibleRecord(source, member))
    fail(403, "scope", "This occurrence is outside your current scope.");
}
async function managed(c, org, targetId, { forUpdate = true } = {}) {
  return (
    await c.query(
      `SELECT * FROM os_participation_targets WHERE org_id=$1 AND target_id=$2${forUpdate ? " FOR UPDATE" : ""}`,
      [org, targetId],
    )
  ).rows[0];
}
async function entries(c, org, targetId) {
  return (
    await c.query(
      "SELECT p.*,i.status AS intake_status,i.cancelled_at AS intake_cancelled_at,i.revision AS intake_revision FROM os_participations p LEFT JOIN os_intake i ON i.org_id=p.org_id AND i.id=p.intake_id WHERE p.org_id=$1 AND p.target_id=$2 ORDER BY p.waitlist_sequence NULLS LAST,p.created_at,p.id",
      [org, targetId],
    )
  ).rows;
}
const targetObject = (
  t,
  source,
  occupied,
  peak = occupied,
  confirmedCount = occupied,
) => ({
  targetId: source.id,
  moduleId: source.moduleId,
  title: source.data.title,
  revision: t?.revision || 0,
  mode: t?.mode || "unmanaged",
  sourceRevision: t?.source_revision || source.revision,
  currentSourceRevision: source.revision,
  sourceApproved: sourceApproved(source),
  recoveryBlock: t?.recovery_block === true,
  capacity: source.data.capacity ?? null,
  occupied,
  confirmedCount,
  peakOccupied: peak,
  terms: t?.terms || null,
  termsHash: t?.terms_hash || null,
});
function currentTerms(source) {
  try {
    return {
      terms: participationTerms(source),
      termsHash: hash(participationTerms(source)),
    };
  } catch {
    return { terms: null, termsHash: null };
  }
}
function approvedTarget(source, t, c, serverClock = LEGACY_DOMAIN_CLOCK) {
  if (!t || t.mode !== "managed" || t.recovery_block)
    fail(
      409,
      "participation_reconcile",
      "An administrator must reconcile this occurrence before allocations.",
    );
  if (!sourceApproved(source) || !open(source))
    fail(
      409,
      "participation_approval",
      "The current occurrence needs independent approval and an open schedule.",
    );
  const clock = domainClock(c, serverClock);
  const start = Date.parse(source.data.startAt);
  if (
    clock
      ? Number.isSafeInteger(start) && BigInt(start) * 1000n <= clock.atMicros
      : start <= Date.now()
  )
    fail(
      409,
      "participation_started",
      "A new full-occurrence commitment must be confirmed before it starts.",
    );
  return participationTerms(source);
}
function candidateFor(records, p, member, { approval = true } = {}) {
  const r = records.find((r) => r.id === p.booking_record_id),
    contact = records.find((r) => r.id === p.contact_id);
  if (
    !r ||
    r.moduleId !== p.module_id ||
    r.data.kind !== bookingKind(p.module_id) ||
    r.data[parentKey(p.module_id)] !== p.target_id ||
    r.data.contactId !== p.contact_id ||
    !contact ||
    contact.moduleId !== "contacts" ||
    !visibleRecord(r, member) ||
    !visibleRecord(contact, member)
  )
    unavailable();
  if (approval && (!independent(r) || r.status !== "approved"))
    fail(
      409,
      "participation_candidate",
      "The candidate's current approved revision needs independent review.",
    );
  return r;
}
async function outbox(c, org, p, { safe = false, settings } = {}) {
  return queueParticipationTransition(c, {
    org,
    participation: p,
    settings,
    safe,
  });
}

const consentSummary = (p) =>
  p.consent
    ? {
        revision: p.consent.revision,
        sourceRevision: p.consent.sourceRevision,
        termsHash: p.consent.termsHash,
        at: p.consent.at,
        waitlistAllowed: p.consent.waitlistAllowed === true,
        emailUpdates: p.consent.emailUpdates === true,
        ...(p.consent.allocationHash
          ? { allocationHash: p.consent.allocationHash }
          : {}),
      }
    : null;
export function ownObject(p, t, source, intake) {
  // Working edits can contain private unpublished content. Only expose current
  // independent approval or the earlier deliberately approved stored terms.
  const current = sourceApproved(source)
      ? currentTerms(source)
      : { terms: t?.terms || null, termsHash: t?.terms_hash || null },
    valid =
      !!t &&
      !t.recovery_block &&
      t.mode === "managed" &&
      sourceApproved(source) &&
      open(source) &&
      Date.parse(source.data.startAt) > Date.now() &&
      ["requested", "waitlisted"].includes(p.state) &&
      !p.recovered;
  return {
    id: p.id,
    state: p.state,
    revision: p.revision,
    targetRevision: t?.revision || 0,
    sourceRevision: sourceApproved(source)
      ? source.revision
      : t?.source_revision || null,
    termsHash: current.termsHash,
    terms: current.terms,
    frozenTerms: p.frozen?.terms || null,
    requestedInterval: p.requested_interval || null,
    intervalChoiceLocked: !!(
      p.consent ||
      p.requested_interval != null ||
      p.source === "recovered"
    ),
    allocationHash: p.consent?.allocationHash || null,
    frozenInterval: p.frozen?.interval || null,
    consent: consentSummary(p),
    canConsent: valid && !!current.terms,
    consentUnavailableReason:
      valid && current.terms
        ? null
        : p.state === "confirmed"
          ? "Confirmation retains its saved terms. Changes require cancellation and a new request."
          : p.state === "cancelled"
            ? "This participation is cancelled. Reapplication requires a new request."
            : "This occurrence is closed, recovered or awaiting current approval.",
    canCancel: p.state !== "cancelled",
    withdrawalAcknowledgementRequired:
      (intake?.status || p.intake_status) === "cancelled" &&
      !(intake?.cancelled_at || p.intake_cancelled_at),
    recovered: p.recovered === true,
    notifications: {
      enabled: false,
      preferenceOnly: true,
      requested: p.consent?.emailUpdates === true,
      state: "paused",
    },
  };
}
function staffObject(p, t, source, records, member) {
  const r = records.find((r) => r.id === p.booking_record_id);
  return {
    ...ownObject(p, t, source, null),
    targetId: p.target_id,
    moduleId: p.module_id,
    bookingRecordId: p.booking_record_id,
    contactId: p.contact_id,
    intakeId: p.intake_id,
    intakeRevision: Number.isSafeInteger(p.intake_revision) && p.intake_revision >= 1 && p.intake_revision <= 2147483647 ? p.intake_revision : null,
    source: p.source,
    waitlistSequence:
      p.waitlist_sequence == null ? null : Number(p.waitlist_sequence),
    confirmedAt: iso(p.confirmed_at),
    cancelledAt: iso(p.cancelled_at),
    candidateRevision: r?.revision || null,
    candidateApproved: !!r && independent(r) && r.status === "approved",
    consent: p.consent
      ? {
          ...consentSummary(p),
          method: p.consent.method,
          evidenceRef: p.consent.evidenceRef || null,
        }
      : null,
  };
}
const entryReadable = (p, records, member) => {
  const booking = records.find((r) => r.id === p.booking_record_id),
    contact = records.find((r) => r.id === p.contact_id);
  return (
    !!booking &&
    !!contact &&
    !!visibleRecord(booking, member) &&
    !!visibleRecord(contact, member)
  );
};
// Hint policy deliberately remains weaker than NEW command eligibility.
function waitlistHintEligible(p, source, records, member, terms) {
  try {
    candidateFor(records, p, member);
  } catch {
    return false;
  }
  if (
    !p.consent ||
    p.consent.sourceRevision !== source.revision ||
    p.consent.termsHash !== hash(terms) ||
    !p.consent.waitlistAllowed
  )
    return false;
  if (
    p.intake_status === "cancelled" &&
    ((!p.intake_cancelled_at && !p.consent.withdrawalAcknowledged) ||
      (p.intake_cancelled_at &&
        Date.parse(p.consent.at) <= Date.parse(p.intake_cancelled_at)))
  )
    return false;
  return true;
}
function waitlistHintIntervalMatches(p, source, terms) {
  return (
    p.requested_interval == null ||
    p.consent.allocationHash ===
      participationAllocationHash(
        source.id,
        source.revision,
        hash(terms),
        requestedInterval(p, terms),
      )
  );
}
const hintAllocationRefusal = error =>
  ["participation_capacity", "participation_overlap", "participation_duplicate", "participation_interval"].includes(error.code);
async function waitlistSuggestion(c, org, source, records, member, releasedId = null, orientation = {}) {
  const terms = participationTerms(source);
  const unavailableOrientation = error => ["volunteer_orientation_required", "volunteer_orientation_unavailable"].includes(error?.code);
  let declaration, clock, policy, target;
  try {
    declaration = orientation.declaration === undefined ? await volunteerOrientationForTarget(c, org, source) : orientation.declaration;
    if (declaration) {
      if (declaration.originMode !== "live") return null;
      if (!orientation.policy) await requireVolunteerOrientationStorage(c);
      policy = orientation.policy ?? await readDeclaredVolunteerOrientationPolicy(c, org, declaration);
      clock = orientation.clock ?? await readParticipationDomainClock(c);
      target = orientation.target ?? await managed(c, org, source.id, {forUpdate: false});
    }
  } catch (error) {
    if (unavailableOrientation(error)) return null;
    throw error;
  }
  for (const p of (await entries(c, org, source.id)).filter(
    (p) => p.state === "waitlisted" && !p.recovered,
  )) {
    if (!waitlistHintEligible(p, source, records, member, terms)) continue;
    try {
      if (!waitlistHintIntervalMatches(p, source, terms)) continue;
      if (declaration) await requireVolunteerOrientationForPlace({
        c, source, target, terms, p, action: "waitlist-hint", declaration, clock, policy,
      });
      await allocationCheck(c, org, p, source, records, terms, releasedId);
    } catch (error) {
      if (hintAllocationRefusal(error) || unavailableOrientation(error)) continue;
      throw error;
    }
    return p.id;
  }
  return null;
}
/** Complete private SQL-ordered queue and range inventory; never a staff DTO.
 * Caller owns the detached rows and their current scope/approval/range pins.
 * No sorting, SQL, command execution, consent renewal or authority is supplied.
 */
export function suggestParticipationFromInventory({
  source, records, member, orderedWaitlist, removedWaitlistIds, confirmed, unmanaged,
}) {
  const terms = participationTerms(source), removed = new Set(removedWaitlistIds);
  if (orderedWaitlist.length > PARTICIPATION_LIMITS.participations || confirmed.length + unmanaged.length > PARTICIPATION_LIMITS.participations)
    fail(409, "participation_interval", "The complete allocation inventory exceeds its retained limit.");
  for (const p of orderedWaitlist) {
    if (removed.has(p.id) || p.state !== "waitlisted" || p.recovered || !waitlistHintEligible(p, source, records, member, terms)) continue;
    try {
      if (!waitlistHintIntervalMatches(p, source, terms)) continue;
      assertParticipationAllocationCandidate({
        candidate: { participationId: p.id, bookingRecordId: p.booking_record_id, contactId: p.contact_id,
          targetId: p.target_id, moduleId: p.module_id, range: effectiveRequestedInterval(p, terms) },
        capacity: source.data.capacity, confirmed, unmanaged,
      });
    } catch (error) {
      if (hintAllocationRefusal(error)) continue;
      throw error;
    }
    return p.id;
  }
  return null;
}
export function requireParticipationPromotionReason({ participationId, suggestedId, reason }) {
  if (suggestedId !== participationId) text(reason, 300, true);
}
async function update(c, org, p, changes, intent, mode) {
  const row = {
    ...p,
    ...changes,
    revision: p.revision + 1,
    last_command: { ...intent, resultRevision: p.revision + 1 },
  };
  const quiet = mode === QUIET_SUBSTITUTION;
  const saved = (
    await c.query(
      "UPDATE os_participations SET state=$3,revision=$4,consent=$5,frozen=$6,waitlist_sequence=$7,confirmed_at=$8,cancelled_at=$9,last_command=$10,updated_at=now(),recovered=$11,recovered_state=$12,requested_interval=$13" +
        (quiet && row.state === "cancelled" ? ",reminder_consent=NULL" : "") +
        " WHERE org_id=$1 AND id=$2" + (quiet ? " AND revision=$14 AND state=$15" : "") + " RETURNING *",
      [
        org,
        row.id,
        row.state,
        row.revision,
        row.consent ? JSON.stringify(row.consent) : null,
        row.frozen ? JSON.stringify(row.frozen) : null,
        row.waitlist_sequence,
        row.confirmed_at,
        row.cancelled_at,
        JSON.stringify(row.last_command),
        row.recovered === true,
        row.recovered_state || null,
        row.requested_interval ? JSON.stringify(row.requested_interval) : null,
        ...(quiet ? [p.revision, p.state] : []),
      ],
    )
  ).rows[0];
  if (quiet && !saved) fail(409, "substitution_stale", "The reviewed place changed. Review the handoff again.");
  return {
    ...saved,
    intake_status: p.intake_status,
    intake_cancelled_at: p.intake_cancelled_at,
  };
}
async function consentCheck(c, org, p, source, terms) {
  if (
    !p.consent ||
    p.consent.sourceRevision !== source.revision ||
    p.consent.termsHash !== hash(terms)
  )
    fail(
      409,
      "participation_consent",
      "Renew specific participation consent for this exact approved occurrence revision.",
    );
  if (
    p.requested_interval != null &&
    p.consent.allocationHash !==
      participationAllocationHash(
        source.id,
        source.revision,
        hash(terms),
        requestedInterval(p, terms),
      )
  )
    fail(
      409,
      "participation_consent",
      "Renew consent for this exact requested interval.",
    );
  if (
    p.requested_interval != null &&
    (!p.consent.terms || hash(p.consent.terms) !== hash(terms))
  )
    fail(
      409,
      "participation_consent",
      "Renew consent with the exact approved public terms.",
    );
  if (p.intake_id) {
    const intake = (
      await c.query(
        "SELECT status,cancelled_at FROM os_intake WHERE org_id=$1 AND id=$2",
        [org, p.intake_id],
      )
    ).rows[0];
    if (!intake) unavailable();
    if (
      intake.status === "cancelled" &&
      !intake.cancelled_at &&
      !p.consent.withdrawalAcknowledged
    )
      fail(
        409,
        "participation_withdrawn",
        "Explicitly reaffirm a new participation request after the earlier withdrawal.",
      );
    if (
      intake.cancelled_at &&
      Date.parse(p.consent.at) <= Date.parse(intake.cancelled_at)
    )
      fail(
        409,
        "participation_withdrawn",
        "The request was withdrawn after this affirmation. Obtain a new specific participation request first.",
      );
  }
}
function knownAllocationCapacity(capacity) {
  if (!Number.isSafeInteger(capacity) || capacity < 1)
    fail(
      409,
      "participation_capacity",
      "This occurrence has no known available capacity.",
    );
}
// rangeOf is private and pure. The legacy adapter calls ONLY the frozen-range
// validator, lazily at the old filters so unrelated old rows stay untouched.
function confirmedAllocationCheck(candidate, capacity, confirmed, rangeOf) {
  if (
    peakOccupancy([
      ...confirmed
        .filter((x) => x.targetId === candidate.targetId && x.participationId !== candidate.participationId)
        .map(rangeOf),
      candidate.range,
    ]) > capacity
  )
    fail(
      409,
      "participation_capacity",
      "This occurrence is full. Choose the waitlist explicitly if consent permits.",
    );
  if (
    confirmed.some(
      (x) =>
        x.participationId !== candidate.participationId &&
        x.targetId === candidate.targetId &&
        x.contactId === candidate.contactId,
    )
  )
    fail(
      409,
      "participation_duplicate",
      "This contact already has a confirmed place.",
    );
  if (candidate.moduleId === "volunteers") {
    if (
      confirmed.some(
        (x) =>
          x.participationId !== candidate.participationId &&
          x.moduleId === "volunteers" &&
          x.contactId === candidate.contactId &&
          intervalsOverlap(rangeOf(x), candidate.range),
      )
    )
      fail(
        409,
        "participation_overlap",
        "This volunteer already has an overlapping confirmed assignment.",
      );
  }
}
function unmanagedAllocationCheck(candidate, unmanaged, rangeOf) {
  if (candidate.moduleId !== "volunteers") return;
  for (const row of unmanaged) {
    if (row.contactId === candidate.contactId && intervalsOverlap(rangeOf(row), candidate.range))
      fail(409, "participation_overlap", "This volunteer has an overlapping unmanaged assignment.");
  }
}
/** Private range-only inventory, not consent/approval/booking authority. The
 * combined group planner still owns all-selected and duplicate-booking checks.
 */
export function assertParticipationAllocationCandidate({ candidate, capacity, confirmed, unmanaged }) {
  knownAllocationCapacity(capacity);
  if (confirmed.length + unmanaged.length > PARTICIPATION_LIMITS.participations)
    fail(409, "participation_interval", "The complete allocation inventory exceeds its retained limit.");
  // A missing applicable range cannot silently become a nonoverlap in NEW data.
  const rangeOf = row => { peakOccupancy([row.range]); return row.range; };
  confirmedAllocationCheck(candidate, capacity, confirmed, rangeOf);
  unmanagedAllocationCheck(candidate, unmanaged, rangeOf);
}
async function allocationCheck(c, org, p, source, records, terms, releasedId = null) {
  knownAllocationCapacity(source.data.capacity);
  const all = (
    await c.query(
      "SELECT * FROM os_participations WHERE org_id=$1 AND state='confirmed'" + (releasedId === null ? "" : " AND id<>$2"),
      releasedId === null ? [org] : [org, releasedId],
    )
  ).rows;
  if (releasedId !== null && all.length > PARTICIPATION_LIMITS.participations)
    fail(409, "participation_interval", "The complete allocation inventory exceeds its retained limit.");
  const candidate = { participationId: p.id, contactId: p.contact_id, targetId: p.target_id,
    moduleId: p.module_id, range: effectiveRequestedInterval(p, terms) };
  confirmedAllocationCheck(candidate, source.data.capacity,
    all.map(row => ({ participationId: row.id, contactId: row.contact_id, targetId: row.target_id, moduleId: row.module_id, row })),
    x => frozenParticipationInterval(x.row));
  if (p.module_id === "volunteers") {
    const managedIds = new Set(
      (
        await c.query(
          "SELECT target_id FROM os_participation_targets WHERE org_id=$1",
          [org],
        )
      ).rows.map((x) => x.target_id),
    );
    for (const r of records.filter(
      (r) =>
        r.moduleId === "volunteers" &&
        r.data.kind === "assignment" &&
        r.data.contactId === p.contact_id &&
        legacyActive("volunteers", r.status) &&
        !managedIds.has(r.data.shiftId),
    )) {
      const shift = records.find((x) => x.id === r.data.shiftId);
      if (releasedId !== null) {
        try {
          if (!shift || shift.moduleId !== "volunteers" || shift.data?.kind !== "shift") throw Error();
          peakOccupancy([shift.data]);
        } catch {
          fail(409, "participation_interval", "An existing volunteer assignment has an incomplete schedule.");
        }
      }
      if (shift)
        unmanagedAllocationCheck(candidate, [{ contactId: r.data.contactId, range: shift.data }], x => x.range);
    }
  }
}

async function adoptionPreview(c, org, source, t, records) {
  const ledger = await entries(c, org, source.id),
    mapped = new Set(ledger.map((p) => p.booking_record_id));
  const legacy = records.filter(
    (r) =>
      r.moduleId === source.moduleId &&
      r.data.kind === bookingKind(source.moduleId) &&
      r.data[parentKey(source.moduleId)] === source.id &&
      legacyActive(source.moduleId, r.status) &&
      !mapped.has(r.id),
  );
  const recovered = ledger.filter(
    (p) =>
      p.recovered &&
      p.state !== "cancelled" &&
      p.recovered_state === "confirmed",
  );
  const occupants = [
    ...ledger.filter((p) => p.state === "confirmed"),
    ...recovered,
  ].map((p) => ({
    bookingRecordId: p.booking_record_id,
    contactId: p.contact_id,
    revision:
      records.find((r) => r.id === p.booking_record_id)?.revision || null,
    kind: p.recovered ? "recovered" : "managed",
    frozen: p.frozen,
    entryId: p.id,
  }));
  for (const r of legacy)
    occupants.push({
      bookingRecordId: r.id,
      contactId: r.data.contactId,
      revision: r.revision,
      kind: "legacy",
      frozen: null,
      entryId: null,
    });
  const issues = [];
  let terms;
  try {
    terms = participationTerms(source);
  } catch {
    issues.push(
      "Publish complete typed participation terms and an organizer contact route.",
    );
  }
  if (!sourceApproved(source))
    issues.push("The current occurrence needs independent approval.");
  let peak = 0;
  const occupantIntervals = new Map();
  if (terms) {
    try {
      for (const o of occupants) {
        const p = ledger.find((p) => p.id === o.entryId);
        const range = p ? frozenParticipationInterval(p) : terms;
        if (p?.requested_interval != null)
          validateRequestedInterval(
            p.requested_interval,
            terms,
            source.moduleId,
          );
        occupantIntervals.set(o.bookingRecordId, range);
      }
      peak = peakOccupancy([...occupantIntervals.values()]);
    } catch {
      issues.push("Recorded allocation intervals need reconciliation.");
    }
  }
  if (
    !Number.isSafeInteger(source.data.capacity) ||
    source.data.capacity < peak
  )
    issues.push(
      "Known capacity cannot be lower than existing concurrent occupancy.",
    );
  const contacts = new Set();
  for (const o of occupants) {
    if (!records.some((r) => r.id === o.contactId && r.moduleId === "contacts"))
      issues.push("An occupant has a missing operational contact.");
    if (contacts.has(o.contactId))
      issues.push("Duplicate recorded contact occupancy needs reconciliation.");
    contacts.add(o.contactId);
    if (
      o.kind === "recovered" &&
      terms &&
      ["kind", "startAt", "endAt", "timeZone"].some(
        (k) => (o.frozen?.terms?.[k] ?? null) !== terms[k],
      )
    )
      issues.push(
        "Recovered confirmed occupancy does not match this occurrence's original schedule.",
      );
  }
  if (source.moduleId === "volunteers" && terms) {
    const all = (
      await c.query(
        "SELECT * FROM os_participations WHERE org_id=$1 AND module_id='volunteers' AND state='confirmed' AND target_id<>$2",
        [org, source.id],
      )
    ).rows;
    const managedIds = new Set(
      (
        await c.query(
          "SELECT target_id FROM os_participation_targets WHERE org_id=$1",
          [org],
        )
      ).rows.map((t) => t.target_id),
    );
    for (const o of occupants) {
      const range = occupantIntervals.get(o.bookingRecordId);
      if (!range) continue;
      if (
        all.some(
          (x) =>
            x.contact_id === o.contactId &&
            intervalsOverlap(frozenParticipationInterval(x), range),
        )
      )
        issues.push("An occupant overlaps another managed assignment.");
      for (const r of records.filter(
        (r) =>
          r.moduleId === "volunteers" &&
          r.data.kind === "assignment" &&
          r.data.shiftId !== source.id &&
          !managedIds.has(r.data.shiftId) &&
          r.data.contactId === o.contactId &&
          legacyActive("volunteers", r.status),
      )) {
        const shift = records.find((x) => x.id === r.data.shiftId);
        if (shift && intervalsOverlap(shift.data, range))
          issues.push("An occupant overlaps another recorded assignment.");
      }
    }
  }
  return {
    legacyHash: hash({
      sourceRevision: source.revision,
      targetRevision: t?.revision || 0,
      occupants: occupants.map((o) => ({ ...o, frozen: o.frozen || null })),
      ledger: ledger.map((p) => [
        p.id,
        p.revision,
        p.state,
        p.recovered,
        p.recovered_state,
        p.requested_interval || null,
      ]),
    }),
    occupants,
    peakOccupied: peak,
    issues: [...new Set(issues)],
    ledger,
    legacy,
    recovered,
    terms,
  };
}

async function adopt({ c, org, user, member, source, t, records, input }) {
  requireAdmin(member);
  exact(input, ["targetRevision", "expectedLegacyHash", "idempotencyKey"]);
  const intent = participationIntent(input, user, "adopt");
  if (participationReplay(t?.last_command, intent)) {
    noteParticipationReceiptReplay(c, org);
    const confirmed = (await entries(c, org, source.id)).filter(
      (p) => p.state === "confirmed",
    );
    return okay({
      target: targetObject(
        t,
        source,
        confirmed.length,
        peakOccupancy(confirmed.map(frozenParticipationInterval)),
      ),
      adopted: t.last_command.adopted || 0,
    });
  }
  await refuseProtectedVolunteerOrientation(c, org, source);
  revision(input, source.revision, "targetRevision");
  const preview = await adoptionPreview(c, org, source, t, records);
  if (input.expectedLegacyHash !== preview.legacyHash)
    fail(
      409,
      "participation_legacy",
      "Recorded occupancy changed. Review a new reconciliation preview.",
    );
  if (preview.issues.length)
    fail(409, "participation_legacy", preview.issues.join(" "));
  const terms = preview.terms;
  let next = (
    await c.query(
      "INSERT INTO os_participation_targets(org_id,target_id,module_id,revision,mode,source_revision,terms,terms_hash,recovery_block,created_by,last_command) VALUES($1,$2,$3,1,'managed',$4,$5,$6,false,$7,$8) ON CONFLICT(org_id,target_id) DO UPDATE SET revision=os_participation_targets.revision+1,mode='managed',source_revision=EXCLUDED.source_revision,terms=EXCLUDED.terms,terms_hash=EXCLUDED.terms_hash,recovery_block=false,last_command=EXCLUDED.last_command,updated_at=now() RETURNING *",
      [
        org,
        source.id,
        source.moduleId,
        source.revision,
        JSON.stringify(terms),
        hash(terms),
        user,
        JSON.stringify({
          ...intent,
          adopted: preview.legacy.length + preview.recovered.length,
        }),
      ],
    )
  ).rows[0];
  for (const r of preview.legacy)
    await c.query(
      "INSERT INTO os_participations(org_id,id,target_id,module_id,booking_record_id,contact_id,state,revision,source,consent,frozen,confirmed_at,created_by) VALUES($1,$2,$3,$4,$5,$6,'confirmed',1,'legacy',NULL,$7,now(),$8)",
      [
        org,
        id(),
        source.id,
        source.moduleId,
        r.id,
        r.data.contactId,
        JSON.stringify({
          terms,
          sourceRevision: source.revision,
          programId: source.data.programId || null,
          legacy: true,
          approvalKnown: false,
        }),
        user,
      ],
    );
  for (const p of preview.recovered)
    await c.query(
      "UPDATE os_participations SET state='confirmed',recovered=false,recovered_state=NULL,source='legacy',consent=NULL,revision=revision+1,last_command=NULL,updated_at=now() WHERE org_id=$1 AND id=$2",
      [org, p.id],
    );
  // Recovered non-reserving candidates require a new current candidate and consent.
  await c.query(
    "UPDATE os_participations SET recovered=false,recovered_state=NULL,consent=NULL,revision=revision+1,last_command=NULL,updated_at=now() WHERE org_id=$1 AND target_id=$2 AND recovered=true AND state<>'cancelled'",
    [org, source.id],
  );
  await participationQuota(c, org);
  await audit(c, org, user, "participation.adopted", null, {
    targetId: source.id,
    legacyCount: preview.legacy.length,
    recoveredCount: preview.recovered.length,
    sourceRevision: source.revision,
  });
  return okay({
    target: targetObject(
      next,
      source,
      preview.occupants.length,
      preview.peakOccupied,
    ),
    adopted: preview.legacy.length + preview.recovered.length,
  });
}

async function associate({ c, org, user, member, source, t, records, input }) {
  exact(input, [
    "targetRevision",
    "candidateRevision",
    "bookingRecordId",
    "intakeId",
    "idempotencyKey",
  ]);
  const intent = participationIntent(input, user, "associate");
  if (
    !opaque(input.bookingRecordId) ||
    (input.intakeId != null && !opaque(input.intakeId))
  )
    fail(422, "participation_candidate", "Choose a typed booking candidate.");
  const old = (
    await c.query(
      "SELECT * FROM os_participations WHERE org_id=$1 AND booking_record_id=$2 FOR UPDATE",
      [org, input.bookingRecordId],
    )
  ).rows[0];
  if (old) {
    if (old.target_id !== source.id) unavailable();
    candidateFor(records, old, member, { approval: false });
    if (participationReplay(old.last_command, intent)) {
      noteParticipationReceiptReplay(c, org);
      return okay({
        participation: staffObject(old, t, source, records, member),
      });
    }
    fail(
      409,
      "participation_duplicate",
      "This candidate already has a participation history. Reload it.",
    );
  }
  revision(input, t?.revision, "targetRevision");
  approvedTarget(source, t);
  const candidate = records.find((r) => r.id === input.bookingRecordId);
  if (!candidate) unavailable();
  const p = {
    booking_record_id: candidate.id,
    contact_id: candidate.data.contactId,
    module_id: source.moduleId,
    target_id: source.id,
  };
  candidateFor(records, p, member);
  revision(input, candidate.revision, "candidateRevision");
  let intakeMeta = null;
  if (input.intakeId) {
    const intake = (
      await c.query(
        "SELECT converted_ids,status,cancelled_at FROM os_intake WHERE org_id=$1 AND id=$2",
        [org, input.intakeId],
      )
    ).rows[0];
    intakeMeta = intake;
    if (
      !intake ||
      !intake.converted_ids.some(
        (x) => x.id === candidate.id && x.moduleId === source.moduleId,
      ) ||
      !intake.converted_ids.some(
        (x) => x.id === candidate.data.contactId && x.moduleId === "contacts",
      )
    )
      fail(
        422,
        "participation_intake",
        "This request is not associated with the selected booking and contact.",
      );
  }
  if (
    (
      await c.query(
        "SELECT id FROM os_participations WHERE org_id=$1 AND target_id=$2 AND ((contact_id=$3 AND state<>'cancelled') OR ($4::text IS NOT NULL AND intake_id=$4)) LIMIT 1",
        [org, source.id, candidate.data.contactId, input.intakeId || null],
      )
    ).rows.length
  )
    fail(
      409,
      "participation_duplicate",
      "This contact or original request already has participation history for this occurrence. Reload its saved entry.",
    );
  const row = (
    await c.query(
      "INSERT INTO os_participations(org_id,id,target_id,module_id,booking_record_id,contact_id,intake_id,state,revision,source,created_by,last_command) VALUES($1,$2,$3,$4,$5,$6,$7,'requested',1,$8,$9,$10) RETURNING *",
      [
        org,
        id(),
        source.id,
        source.moduleId,
        candidate.id,
        candidate.data.contactId,
        input.intakeId || null,
        input.intakeId ? "intake" : "staff",
        user,
        JSON.stringify(intent),
      ],
    )
  ).rows[0];
  row.intake_status = intakeMeta?.status;
  row.intake_cancelled_at = intakeMeta?.cancelled_at;
  await participationQuota(c, org);
  await audit(c, org, user, "participation.requested", null, {
    participationId: row.id,
    targetId: source.id,
  });
  return okay(
    { participation: staffObject(row, t, source, records, member) },
    201,
  );
}

async function recordConsent({
  c,
  org,
  user,
  source,
  t,
  p,
  input,
  actor,
  own = false,
  intake = null,
}) {
  const intent = participationIntent(input, user, "consent");
  if (participationReplay(p.last_command, intent)) {
    noteParticipationReceiptReplay(c, org);
    return p;
  }
  revision(input, p.revision);
  revision(input, t?.revision, "targetRevision");
  const terms = approvedTarget(source, t);
  revision(input, source.revision, "sourceRevision");
  if (
    input.termsHash !== hash(terms) ||
    input.consent !== true ||
    typeof input.waitlistAllowed !== "boolean" ||
    typeof input.emailUpdates !== "boolean"
  )
    fail(
      422,
      "participation_consent",
      "Affirm these exact approved participation terms and choose each preference explicitly.",
    );
  if (!["requested", "waitlisted"].includes(p.state) || p.recovered)
    fail(
      409,
      "participation_state",
      "This participation cannot accept new consent.",
    );
  const requested = validateRequestedInterval(
    Object.hasOwn(input, "requestedInterval") ? input.requestedInterval : null,
    terms,
    p.module_id,
  );
  if (
    (p.consent || p.requested_interval != null || p.source === "recovered") &&
    !sameInterval(p.requested_interval ?? null, requested)
  )
    fail(
      409,
      "participation_interval",
      "Cancel and create a new request to change the consented interval.",
    );
  let at = new Date().toISOString(),
    method = "participant-portal",
    evidenceRef = null;
  if (!own) {
    method = text(input.method, 80, true);
    evidenceRef = text(input.evidenceRef, 200, true);
    if (
      typeof input.consentedAt !== "string" ||
      !Number.isFinite(Date.parse(input.consentedAt)) ||
      Date.parse(input.consentedAt) > Date.now() + 1000
    )
      fail(
        422,
        "participation_consent",
        "Record a real consent time that is not in the future.",
      );
    at = new Date(input.consentedAt).toISOString();
    if (input.emailUpdates)
      fail(
        422,
        "participation_consent",
        "Offline consent cannot opt an unverified recipient into email updates.",
      );
  }
  if (own) revision(input, intake.revision, "intakeRevision");
  const requestState =
    intake ||
    (p.intake_id
      ? (
          await c.query(
            "SELECT status,cancelled_at FROM os_intake WHERE org_id=$1 AND id=$2",
            [org, p.intake_id],
          )
        ).rows[0]
      : null);
  if (
    requestState?.status === "cancelled" &&
    !requestState.cancelled_at &&
    input.withdrawalAcknowledged !== true
  )
    fail(
      422,
      "participation_withdrawn",
      "Separately affirm that this is a new participation request despite the earlier withdrawal.",
    );
  if (
    requestState?.cancelled_at &&
    Date.parse(at) <= Date.parse(requestState.cancelled_at)
  )
    fail(
      422,
      "participation_withdrawn",
      "The participation affirmation must be later than the actual request withdrawal.",
    );
  const consent = {
    revision: p.revision + 1,
    sourceRevision: source.revision,
    termsHash: hash(terms),
    at,
    waitlistAllowed: input.waitlistAllowed,
    emailUpdates: input.emailUpdates,
    method,
    evidenceRef,
    actorHash: hash(user),
    recipientHash: own ? hash(actor.email) : null,
    withdrawalAcknowledged: input.withdrawalAcknowledged === true,
    ...(terms.intervalPolicy ? { terms } : {}),
    ...(requested
      ? {
          allocationHash: participationAllocationHash(
            source.id,
            source.revision,
            hash(terms),
            requested,
          ),
        }
      : {}),
  };
  const next = await update(
    c,
    org,
    p,
    { consent, requested_interval: requested },
    intent,
  );
  next.intake_status = requestState?.status;
  next.intake_cancelled_at = requestState?.cancelled_at;
  if (!consent.emailUpdates)
    await c.query(
      "UPDATE os_participation_outbox SET state='cancelled' WHERE org_id=$1 AND participation_id=$2 AND state='paused'",
      [org, p.id],
    );
  await participationQuota(c, org);
  await audit(c, org, user, "participation.consented", null, {
    participationId: p.id,
    targetId: source.id,
    sourceRevision: source.revision,
  });
  return next;
}

async function preferences({
  c,
  org,
  user,
  p,
  input,
  actor,
  intake,
  source,
  t,
}) {
  const intent = participationIntent(input, user, "preferences");
  if (participationReplay(p.last_command, intent)) {
    noteParticipationReceiptReplay(c, org);
    return p;
  }
  revision(input, p.revision);
  revision(input, intake.revision, "intakeRevision");
  if (typeof input.emailUpdates !== "boolean")
    fail(
      422,
      "participation_preferences",
      "Choose whether to retain this operational-email preference.",
    );
  if (input.emailUpdates) {
    const terms = approvedTarget(source, t);
    if (
      p.state === "cancelled" ||
      !p.consent ||
      p.consent.recipientHash !== hash(actor.email)
    )
      fail(
        409,
        "participation_preferences",
        "Renew specific verified participation consent before enabling this preference.",
      );
    await consentCheck(c, org, p, source, terms);
  }
  const consent = p.consent
    ? { ...p.consent, emailUpdates: input.emailUpdates }
    : null;
  let next = await update(c, org, p, { consent }, intent);
  if (!input.emailUpdates)
    await c.query(
      "UPDATE os_participation_outbox SET state='cancelled' WHERE org_id=$1 AND participation_id=$2 AND state='paused'",
      [org, p.id],
    );
  if (input.emailUpdates) await participationQuota(c, org);
  const auditRetained = await audit(
    c,
    org,
    user,
    input.emailUpdates
      ? "participation.preferences.enabled"
      : "participation.preferences",
    null,
    {
      participationId: p.id,
      targetId: p.target_id,
      emailUpdates: input.emailUpdates,
    },
  );
  next = await retainParticipationAuditOutcome(c, org, next, auditRetained);
  return next;
}

async function cancel({
  settings,
  c,
  org,
  user,
  p,
  records,
  input,
  own = false,
  intake = null,
  serverClock = LEGACY_DOMAIN_CLOCK,
  mode,
}) {
  const intent = participationIntent(input, user, "cancel");
  const quiet = mode === QUIET_SUBSTITUTION;
  if (participationReplay(p.last_command, intent)) {
    noteParticipationReceiptReplay(c, org);
    return {
      p,
      replayed: true,
      notificationQueued: p.last_command.notificationQueued === true,
      auditRetained:
        typeof p.last_command.auditRetained === "boolean"
          ? p.last_command.auditRetained
          : null,
    };
  }
  revision(input, p.revision);
  if (own) revision(input, intake.revision, "intakeRevision");
  if (p.state === "cancelled")
    fail(
      409,
      "participation_state",
      "This participation was already cancelled. Reload its saved status.",
    );
  let auditRetained = true;
  const record = records.find((r) => r.id === p.booking_record_id);
  if (record) {
    const next = {
      ...record,
      status: "cancelled",
      revision: record.revision + 1,
      approval: null,
      lastEditedBy: user,
    };
    await saveRecord(c, next, { participationCommand: true });
    records.splice(records.indexOf(record), 1, next);
    if (!quiet) auditRetained = await audit(
      c,
      org,
      user,
      "participation.cancelled",
      record,
      {
        participationId: p.id,
        targetId: p.target_id,
      },
    );
  }
  const changes = {
    state: "cancelled",
    cancelled_at: domainTimestamp(c, serverClock),
  };
  const notificationQueued = !quiet && await outbox(
    c,
    org,
    { ...p, ...changes, revision: p.revision + 1 },
    { safe: true, settings },
  );
  let next = await update(c, org, p, changes, {
    ...intent,
    notificationQueued,
  }, mode);
  if (quiet) {
    await suppressParticipationDelivery(c, { org, participationId: p.id, reason: "superseded" });
    // The single mandatory pair audit is retained after both transitions.
    return { p: next, replayed: false, notificationQueued: false, auditRetained: null };
  }
  const finalAuditRetained = await audit(
    c,
    org,
    user,
    "participation.cancelled",
    null,
    {
      participationId: p.id,
      targetId: p.target_id,
      notificationQueued,
    },
  );
  auditRetained = auditRetained && finalAuditRetained;
  next = await retainParticipationAuditOutcome(c, org, next, auditRetained);
  return { p: next, replayed: false, notificationQueued, auditRetained };
}

function staffCommandInput(input, action) {
  if (input.reason != null) text(input.reason, 300);
  exact(
    input,
    action === "consent"
      ? [
          "revision",
          "targetRevision",
          "sourceRevision",
          "termsHash",
          "requestedInterval",
          "consent",
          "waitlistAllowed",
          "emailUpdates",
          "method",
          "evidenceRef",
          "consentedAt",
          "withdrawalAcknowledged",
          "idempotencyKey",
        ]
      : [
          "revision",
          "targetRevision",
          "candidateRevision",
          "consentRevision",
          "allocationHash",
          "reason",
          "idempotencyKey",
        ],
  );
}
async function schedulingEligibility({ c, org, member, source, t, records, input, p, action, serverClock }) {
  revision(input, p.revision);
  revision(input, t?.revision, "targetRevision");
  const terms = approvedTarget(source, t, c, serverClock),
    candidate = candidateFor(records, p, member);
  revision(input, candidate.revision, "candidateRevision");
  revision(input, p.consent?.revision || 0, "consentRevision");
  await consentCheck(c, org, p, source, terms);
  if (
    p.requested_interval != null &&
    input.allocationHash !== p.consent.allocationHash
  )
    fail(
      409,
      "participation_interval",
      "Review this exact requested interval before allocating a place.",
    );
  if (p.recovered || p.state === "cancelled")
    fail(
      409,
      "participation_state",
      "This historical participation cannot allocate a new place.",
    );
  if (action === "waitlist") {
    if (p.state !== "requested" || !p.consent.waitlistAllowed)
      fail(
        409,
        "participation_waitlist",
        "Waitlisting requires a requested candidate and separate current waitlist consent.",
      );
  } else if (
    (action === "confirm" && p.state !== "requested") ||
    (action === "promote" && p.state !== "waitlisted")
  )
    fail(409, "participation_state", "Choose the explicit command for this participation state.");
  return { terms, candidate };
}
/** NEW read-only eligibility, not readiness/allocation or current authority.
 * Caller owns fresh roster authorization/pins and the same outer transaction.
 * The only possible SQL here is the existing specific-intake SELECT.
 */
export async function readParticipationAdmissionEligibility({ c, org, member, source, t, records, input, p, action, serverClock }) {
  permit(source, member, "write");
  if (
    source.orgId !== org || p.org_id !== org || p.target_id !== source.id || p.module_id !== source.moduleId ||
    (t && (t.org_id !== org || t.target_id !== source.id || t.module_id !== source.moduleId))
  ) unavailable();
  candidateFor(records, p, member, { approval: false });
  if (!["confirm", "promote"].includes(action))
    fail(422, "participation_action", "Use a confirmation or promotion preview.");
  domainClock(c, serverClock);
  staffCommandInput(input, action);
  const { terms } = await schedulingEligibility({ c, org, member, source, t, records, input, p, action, serverClock });
  if (terms.intervalPolicy) Object.freeze(terms.intervalPolicy);
  return Object.freeze({ participationId: p.id, action, terms: Object.freeze(terms), termsHash: hash(terms) });
}
async function staffSchedulingCommand({
  settings, c, org, user, member, source, t, records, input, p, action, serverClock, mode,
}) {
  const quiet = mode === QUIET_SUBSTITUTION;
  const intent = participationIntent(input, user, action);
  if (participationReplay(p.last_command, intent)) {
    noteParticipationReceiptReplay(c, org);
    const accepted = p.last_command.orientationAcceptance;
    // These older receipts deliberately contain no journal/audit outcome.
    return { p, replayed: true, notificationQueued: null, auditRetained: null,
      ...(accepted ? {orientationAcceptance: orientationAcceptanceSummary(accepted)} : {}) };
  }
  let declaration = null, policy = null, observation = null, orientationAcceptance = null;
  if (action !== "waitlist") {
    declaration = await volunteerOrientationForTarget(c, org, source);
    if (declaration) {
      if (mode === GROUP_CHILD || quiet) orientationOperation();
      if (declaration.originMode !== "live") orientationRequired();
      await requireVolunteerOrientationStorage(c);
      const accepted = await readVolunteerOrientationAcceptance(c, org, source.id, p, intent);
      if (accepted) {
        noteParticipationReceiptReplay(c, org);
        return {p, replayed: true, notificationQueued: null, auditRetained: null, orientationAcceptance: accepted};
      }
      serverClock = await readParticipationDomainClock(c);
      policy = await readDeclaredVolunteerOrientationPolicy(c, org, declaration);
    }
  }
  const { terms, candidate } = await schedulingEligibility({ c, org, member, source, t, records, input, p, action, serverClock });
  if (declaration) {
    if (candidate.data.programId !== declaration.marker.programId) orientationRequired();
    observation = await requireVolunteerOrientationForPlace({
      c, source, target: t, terms, p, action, declaration, clock: serverClock, policy,
    });
    orientationAcceptance = makeOrientationAcceptance(action, p, serverClock.atExact, policy);
  }
  let changes;
  let recordAuditRetained = true;
  if (action === "waitlist") {
    const seq = Number(
      (
        await c.query(
          "SELECT COALESCE(max(waitlist_sequence),0)+1 AS sequence FROM os_participations WHERE org_id=$1 AND target_id=$2",
          [org, source.id],
        )
      ).rows[0].sequence,
    );
    changes = { state: "waitlisted", waitlist_sequence: seq };
  } else {
    if (action === "promote") {
      const suggested = await waitlistSuggestion(
        c,
        org,
        source,
        records,
        member,
        null,
        {declaration, target: t, policy, clock: declaration ? serverClock : null},
      );
      requireParticipationPromotionReason({ participationId: p.id, suggestedId: suggested, reason: input.reason });
    } else if (input.reason != null) text(input.reason, 300);
    await allocationCheck(c, org, p, source, records, terms);
    const nextRecord = {
      ...candidate,
      status: source.moduleId === "events" ? "scheduled" : "assigned",
      revision: candidate.revision + 1,
    };
    nextRecord.approval = {
      ...candidate.approval,
      revision: nextRecord.revision,
    };
    nextRecord.data = validateRecord(candidate.moduleId, candidate.data, {
      orgId: org,
      recordId: candidate.id,
      status: "draft",
      records,
    });
    await saveRecord(c, nextRecord, { participationCommand: true });
    records.splice(records.indexOf(candidate), 1, nextRecord);
    if (!quiet) recordAuditRetained = await audit(c, org, user, "record.transitioned", nextRecord, {
      viaParticipation: p.id,
      from: candidate.status,
      to: nextRecord.status,
    });
    changes = {
      state: "confirmed",
      confirmed_at: domainTimestamp(c, serverClock),
      frozen: {
        terms,
        sourceRevision: source.revision,
        termsHash: hash(terms),
        candidateRevision: candidate.revision,
        candidateApproval: candidate.approval,
        programId: source.data.programId || null,
        ...(p.requested_interval
          ? {
              interval: requestedInterval(p, terms),
              allocationHash: p.consent.allocationHash,
            }
          : {}),
      },
    };
  }
  const next = await update(c, org, p, changes, orientationAcceptance ? {...intent, orientationAcceptance} : intent, mode);
  const notificationQueued = !quiet && await outbox(c, org, next, { settings });
  await participationQuota(c, org);
  if (quiet) return { p: next, replayed: false, notificationQueued: false, auditRetained: null };
  const finalAuditRetained = await audit(c, org, user, `participation.${next.state}`, null, {
    participationId: p.id,
    targetId: source.id,
    reason: input.reason || null,
  });
  if (orientationAcceptance) {
    if (!recordAuditRetained || !finalAuditRetained || next.state !== "confirmed" ||
        next.revision !== orientationAcceptance.resultRevision) orientationUnavailable();
    await retainVolunteerOrientationAcceptance(c, org, source.id, p, intent, orientationAcceptance, observation);
  }
  return {
    p: next,
    replayed: false,
    notificationQueued,
    auditRetained: recordAuditRetained && finalAuditRetained,
    ...(orientationAcceptance ? {orientationAcceptance} : {}),
  };
}

/**
 * Same-client domain seam. Caller owns fresh session/membership/program/record
 * pins, all row locks and the ONE outer transaction. A clock is not authority.
 * @returns {Promise<{p: object, replayed: boolean, notificationQueued: boolean|null, auditRetained: boolean|null}>}
 */
export async function applyParticipationDomainCommand(args, operation = null) {
  return applyScopedParticipationCommand(args, operation === "group" ? GROUP_CHILD : undefined);
}
async function applyScopedParticipationCommand({
  settings,
  c,
  org,
  user,
  member,
  source,
  t,
  records,
  input,
  p,
  action,
  serverClock,
}, mode) {
  if (!["confirm", "promote", "cancel"].includes(action))
    fail(422, "participation_action", "Use a confirmation, promotion or cancellation.");
  domainClock(c, serverClock);
  permit(source, member, "write");
  if (
    source.orgId !== org ||
    p.org_id !== org ||
    p.target_id !== source.id ||
    p.module_id !== source.moduleId ||
    (t &&
      (t.org_id !== org ||
        t.target_id !== source.id ||
        t.module_id !== source.moduleId))
  )
    unavailable();
  staffCommandInput(input, action);
  candidateFor(records, p, member, { approval: false });
  if (action === "cancel") {
    text(input.reason, 300, true);
    return cancel({ c, org, user, p, records, input, settings, serverClock, mode });
  }
  return staffSchedulingCommand({
    settings, c, org, user, member, source, t, records, input, p, action,
    serverClock, mode,
  });
}

/** The hypothetical release is an internal read, never an allocation or a
 * caller-supplied list of places to ignore. Compare the same known contact
 * references and managed/unmanaged ranges used by ordinary promotion. */
export async function readVolunteerSubstitutionRoster(c, selector, context) {
  const { orgId: org, userId: user } = selector;
  const { member, source, t, records, outgoing, replacement, serverClock } = context;
  const stale = () => fail(409, "substitution_stale", "The shift or its places changed. Review the handoff again.");
  if (!domainClock(c, serverClock) || source.orgId !== org || source.moduleId !== "volunteers" ||
      source.data.kind !== "shift" || source.status !== "open" || member.userId !== user ||
      !Array.isArray(member.programIds) || member.programIds.length !== 0 ||
      t?.org_id !== org || t.target_id !== source.id || t.module_id !== "volunteers" ||
      [outgoing,replacement].some(p=>p.org_id!==org || p.target_id!==source.id || p.module_id!=="volunteers" ||
        p.source!=="intake" || !p.intake_id || p.recovered || p.requested_interval!=null) ||
      outgoing.state!=="confirmed" || replacement.state!=="waitlisted" ||
      outgoing.id===replacement.id || outgoing.contact_id===replacement.contact_id)
    stale();
  permit(source,member,"write");
  const terms = approvedTarget(source,t,c,serverClock);
  const evidence=(await c.query(`SELECT
    (SELECT count(*)::int FROM os_participations WHERE org_id=$1 AND target_id=$2 AND state='confirmed') AS confirmed,
    EXISTS(SELECT 1 FROM os_participation_checkins WHERE org_id=$1 AND origin_mode='live'
      AND live_participation_id=$3 AND withdrawn_at IS NULL) AS arrived`,[org,source.id,outgoing.id])).rows[0];
  if (!evidence || !Number.isSafeInteger(evidence.confirmed) || evidence.confirmed<1 ||
      evidence.confirmed>source.data.capacity || typeof evidence.arrived!=="boolean") stale();
  let replacementOverlap=false;
  try { await allocationCheck(c,org,replacement,source,records,terms,outgoing.id); }
  catch (error) {
    if (!["participation_overlap","participation_duplicate"].includes(error.code)) throw error;
    replacementOverlap=true;
  }
  return Object.freeze({
    confirmed:evidence.confirmed,
    nextEligibleId:await waitlistSuggestion(c,org,source,records,member,outgoing.id),
    replacementOverlap,outgoingCheckedIn:evidence.arrived,sourceComplete:true,
  });
}

/**
 * Stage the two actual participation and assignment transitions without
 * queuing notice mail. This is an internal write port, never a route. The
 * substitution command owns current staff/own-choice validation, the single
 * locked outer transaction, and its mandatory receipt and capacity checks.
 */
export async function stageVolunteerSubstitutionPlaces(c, selector, context, plan) {
  const { orgId: org, userId: user, intentId } = selector;
  const { member, source, t, records, outgoing, replacement, serverClock } = context;
  const stale = () => fail(409, "substitution_stale", "The shift or its places changed. Review the handoff again.");
  if (!domainClock(c, serverClock) ||
      plan.orgId !== org || plan.intentId !== intentId || source.orgId !== org ||
      source.id !== plan.shift.id || source.revision !== plan.shift.revision ||
      source.moduleId !== "volunteers" || source.data.kind !== "shift" || source.status !== "open" ||
      !Number.isFinite(Date.parse(source.data.startAt)) || !Number.isFinite(Date.parse(source.data.endAt)) ||
      Date.parse(source.data.startAt) !== Date.parse(plan.shift.startsAt) ||
      Date.parse(source.data.endAt) !== Date.parse(plan.shift.endsAt) ||
      member.userId !== user || !Array.isArray(member.programIds) || member.programIds.length !== 0 ||
      !t || t.org_id !== org || t.target_id !== source.id || t.module_id !== "volunteers")
    stale();
  permit(source, member, "write");
  await refuseProtectedVolunteerOrientation(c, org, source);
  approvedTarget(source, t, c, serverClock);
  const matches = (p, leg, from, to) => p.org_id === org && p.module_id === "volunteers" &&
    p.target_id === source.id && p.id === leg.id && p.revision === leg.revision &&
    p.revision + 1 === leg.nextRevision && p.state === from && leg.state === to &&
    p.source === "intake" && p.intake_id && !p.recovered && p.requested_interval == null;
  if (!matches(outgoing, plan.outgoing, "confirmed", "cancelled") ||
      !matches(replacement, plan.replacement, "waitlisted", "confirmed") ||
      outgoing.id === replacement.id || outgoing.intake_id === replacement.intake_id ||
      outgoing.booking_record_id === replacement.booking_record_id || outgoing.contact_id === replacement.contact_id)
    stale();
  const oldAssignment = candidateFor(records, outgoing, member, { approval: false });
  const newAssignment = candidateFor(records, replacement, member);
  if (oldAssignment.status !== "assigned") stale();
  const blocking = (await c.query(`SELECT
    EXISTS(SELECT 1 FROM os_participation_groups WHERE org_id=$1 AND origin_mode='live'
      AND live_target_id=$2 AND roster_ids ?| $3::text[]) AS grouped,
    EXISTS(SELECT 1 FROM os_participation_checkins WHERE org_id=$1 AND origin_mode='live'
      AND live_participation_id=ANY($3::text[]) AND withdrawn_at IS NULL) AS arrived`,
    [org, source.id, [outgoing.id, replacement.id]])).rows[0];
  if (blocking?.grouped !== false || blocking?.arrived !== false) stale();
  const childKey = p => hash(["reviewed-volunteer-substitution-v1", org, intentId, plan.reviewSha256, p.id]);
  const common = { c, org, user, member, source, t, records, serverClock };
  const former = await applyScopedParticipationCommand({
    ...common, p: outgoing, action: "cancel",
    input: { revision: outgoing.revision, reason: "Reviewed volunteer shift handoff.", idempotencyKey: childKey(outgoing) },
  }, QUIET_SUBSTITUTION);
  if (former.replayed || former.notificationQueued !== false || former.auditRetained !== null ||
      former.p.state !== "cancelled" || former.p.revision !== plan.outgoing.nextRevision)
    stale();
  // The existing promote path evaluates the live queue and allocation after
  // the released place is staged. With no reason supplied it cannot skip an
  // earlier eligible volunteer. Its refusal rolls back the staged release.
  const next = await applyScopedParticipationCommand({
    ...common, p: replacement, action: "promote",
    input: { revision: replacement.revision, targetRevision: t.revision, candidateRevision: newAssignment.revision,
      consentRevision: replacement.consent?.revision ?? 0, idempotencyKey: childKey(replacement) },
  }, QUIET_SUBSTITUTION);
  if (next.replayed || next.notificationQueued !== false || next.auditRetained !== null ||
      next.p.state !== "confirmed" || next.p.revision !== plan.replacement.nextRevision)
    stale();
  const saved = (await c.query(`SELECT p.org_id AS "orgId",p.target_id AS "shiftId",p.id AS "participationId",
    p.revision,p.state,b.id AS "assignmentId",b.revision AS "assignmentRevision",b.status AS "assignmentState",
    to_char((CASE WHEN p.state='cancelled' THEN p.cancelled_at ELSE p.confirmed_at END)
      AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "atExact"
    FROM os_participations p JOIN os_records b ON b.org_id=p.org_id AND b.id=p.booking_record_id
    WHERE p.org_id=$1 AND p.target_id=$2 AND p.id=ANY($3::text[]) AND b.deleted_at IS NULL`,
    [org, source.id, [outgoing.id, replacement.id]])).rows;
  const row = (p, assignment, leg, assignmentState) => {
    const savedRow = saved.find(x => x.participationId === p.id);
    if (!savedRow || savedRow.assignmentId !== assignment.id || savedRow.assignmentRevision !== assignment.revision + 1 ||
        savedRow.assignmentState !== assignmentState || savedRow.revision !== leg.nextRevision ||
        savedRow.state !== leg.state || savedRow.atExact !== serverClock.atExact)
      stale();
    return savedRow;
  };
  if (saved.length !== 2) stale();
  const outcomes = Object.freeze({
    outgoing: Object.freeze(row(outgoing, oldAssignment, plan.outgoing, "cancelled")),
    replacement: Object.freeze(row(replacement, newAssignment, plan.replacement, "assigned")),
  });
  if (await audit(c, org, user, "participation.substituted", source, {
    outgoingId: outgoing.id, replacementId: replacement.id,
  }) !== true) stale();
  await retainParticipationAuditOutcome(c, org, former.p, true);
  return outcomes;
}

async function staffCommand(args) {
  const { c, org, user, member, source, t, records, input, p, action } = args;
  if (["confirm", "promote", "cancel"].includes(action)) {
    const result = await applyParticipationDomainCommand({
      ...args,
      serverClock: LEGACY_DOMAIN_CLOCK,
    });
    return okay({
      participation: staffObject(result.p, t, source, records, member),
      ...(result.orientationAcceptance ? {orientationAcceptance: result.orientationAcceptance, replayed: result.replayed} : {}),
      ...(action === "cancel"
        ? {
            notificationQueued: result.notificationQueued,
            auditRetained: result.auditRetained,
          }
        : {}),
    });
  }
  staffCommandInput(input, action);
  candidateFor(records, p, member, { approval: false });
  if (action === "consent") {
    const r = candidateFor(records, p, member);
    const next = await recordConsent({
      c,
      org,
      user,
      source,
      t,
      p,
      input,
      actor: {},
      own: false,
    });
    return okay({
      participation: staffObject(next, t, source, records, member),
    });
  }
  const result = await staffSchedulingCommand({
    ...args,
    serverClock: LEGACY_DOMAIN_CLOCK,
  });
  return okay({
    participation: staffObject(result.p, t, source, records, member),
  });
}

export async function participationRoutes({
  settings,
  c,
  org,
  user,
  member,
  tail,
  method,
  input = {},
  url,
}) {
  if (!tail.startsWith("participation-targets")) return null;
  const match =
    /^participation-targets(?:\/([A-Za-z0-9_-]{1,100})(?:\/(adopt|participations)(?:\/([A-Za-z0-9_-]{1,100})(?:\/(consent|waitlist|confirm|promote|cancel))?)?)?)?$/.exec(
      tail,
    );
  if (!match)
    fail(
      404,
      "participation_route",
      "This participation action is unavailable.",
    );
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [org]);
  const query = participantQuery(
    url || new URL("https://os.invalid/api/" + tail),
    method === "GET" && match[2] === "participations" ? ["cursor"] : [],
  );
  if (!match[1] && method === "GET") {
    const records = await allRecords(c, org),
      targets = (
        await c.query(
          "SELECT * FROM os_participation_targets WHERE org_id=$1",
          [org],
        )
      ).rows,
      counts = (
        await c.query(
          "SELECT * FROM os_participations WHERE org_id=$1 AND state='confirmed'",
          [org],
        )
      ).rows;
    return okay({
      targets: records
        .filter(
          (r) =>
            participationModule(r.moduleId) &&
            r.data.kind === targetKind(r.moduleId) &&
            modulePermissions(r.moduleId, member.role).write &&
            visibleRecord(r, member),
        )
        .map((r) =>
          targetObject(
            targets.find((t) => t.target_id === r.id),
            r,
            counts.filter((x) => x.target_id === r.id).length,
            peakOccupancy(
              counts
                .filter((x) => x.target_id === r.id)
                .map(frozenParticipationInterval),
            ),
          ),
        ),
    });
  }
  const { source, records } = await sources(c, org, match[1]);
  // The fulfillment console is for scoped writers, never snapshot-only readers.
  permit(source, member, "write");
  const t = await managed(c, org, source.id, {
    forUpdate: !["GET", "HEAD"].includes(method),
  });
  if (!match[2] && method === "GET") {
    const preview = await adoptionPreview(c, org, source, t, records),
      current = currentTerms(source);
    const protectedTarget = await volunteerOrientationForTarget(c, org, source);
    return okay({
      target: targetObject(
        t,
        source,
        preview.occupants.length,
        preview.peakOccupied,
        preview.ledger.filter((p) => p.state === "confirmed").length,
      ),
      preview: {
        legacyHash: preview.legacyHash,
        occupants: preview.occupants
          .filter(
            (o) =>
              administrators(member.role) ||
              (records.some(
                (r) => r.id === o.bookingRecordId && visibleRecord(r, member),
              ) &&
                records.some(
                  (r) => r.id === o.contactId && visibleRecord(r, member),
                )),
          )
          .map((o) => ({
            bookingRecordId: o.bookingRecordId,
            contactId: o.contactId,
            revision: o.revision,
            kind: o.kind,
          })),
        issues: preview.issues,
      },
      ...current,
      currentSourceRevision: source.revision,
      sourceApproved: sourceApproved(source),
      capacity: source.data.capacity ?? null,
      occupied: preview.occupants.length,
      canAdopt: !protectedTarget && administrators(member.role) && preview.issues.length === 0,
    });
  }
  if (match[2] === "adopt" && method === "POST")
    return adopt({ c, org, user, member, source, t, records, input });
  if (match[2] === "participations" && !match[3] && method === "POST")
    return associate({ c, org, user, member, source, t, records, input });
  if (match[2] === "participations" && !match[3] && method === "GET") {
    const all = (await entries(c, org, source.id)).filter((p) =>
        entryReadable(p, records, member),
      ),
      cursor = query.get("cursor");
    if (cursor && !all.some((p) => p.id === cursor))
      fail(
        422,
        "participation_cursor",
        "Use a page cursor from this occurrence.",
      );
    const start = cursor ? all.findIndex((p) => p.id === cursor) + 1 : 0,
      page = all.slice(start, start + 20);
    return okay({
      participations: page.map((p) =>
        staffObject(p, t, source, records, member),
      ),
      nextCursor: all.length > start + 20 ? page.at(-1).id : null,
      suggestedWaitlistId:
        sourceApproved(source) && currentTerms(source).terms
          ? await waitlistSuggestion(c, org, source, records, member)
          : null,
    });
  }
  if (match[3] && match[4] && method === "POST") {
    const p = (
      await c.query(
        "SELECT p.*,i.status AS intake_status,i.cancelled_at AS intake_cancelled_at FROM os_participations p LEFT JOIN os_intake i ON i.org_id=p.org_id AND i.id=p.intake_id WHERE p.org_id=$1 AND p.target_id=$2 AND p.id=$3 FOR UPDATE OF p",
        [org, source.id, match[3]],
      )
    ).rows[0];
    if (!p) unavailable();
    return staffCommand({
      settings,
      c,
      org,
      user,
      member,
      source,
      t,
      records,
      input,
      p,
      action: match[4],
    });
  }
  fail(
    405,
    "participation_method",
    "Use the documented participation command.",
  );
}

export async function participantParticipationRoutes({
  request,
  url = new URL(request.url),
  db,
  settings,
  session,
  input,
}) {
  const match =
    /^\/api\/participant\/orgs\/([A-Za-z0-9_-]{1,100})\/requests\/([A-Za-z0-9_-]{1,100})\/participations(?:\/([A-Za-z0-9_-]{1,100})\/(consent|cancel|preferences))?$/.exec(
      url.pathname,
    );
  if (!match) return null;
  const actor = verifiedParticipant(session);
  participantQuery(url);
  if (request.method !== "GET") {
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
  }
  if (
    (request.method === "GET" && match[3]) ||
    (request.method !== "GET" && (request.method !== "POST" || !match[4]))
  )
    fail(
      405,
      "participation_method",
      "Use the documented participation command.",
    );
  const [, org, intakeId, pid, action] = match;
  // Prove the own index first; no tenant data is read account-wide.
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
          `SELECT i.id,i.revision,i.status,i.cancelled_at,i.publication_id,i.answers,i.erased_at FROM os_participant_links l JOIN os_intake i ON i.org_id=l.org_id AND i.id=l.intake_id AND i.publication_id=l.publication_id WHERE l.user_id=$1 AND l.org_id=$2 AND l.intake_id=$3 AND l.revoked_at IS NULL${request.method === "GET" ? "" : " FOR UPDATE OF i,l"}`,
          [actor.id, org, intakeId],
        )
      ).rows[0];
      if (!intake) unavailable();
      const rows = (
        await c.query(
          `SELECT * FROM os_participations WHERE org_id=$1 AND intake_id=$2 ORDER BY created_at,id${request.method === "GET" ? "" : " FOR UPDATE"}`,
          [org, intakeId],
        )
      ).rows;
      const safeOwn = async (row, target, source) => ({
        ...ownObject(row, target, source, intake),
        delivery: await ownDeliverySummary(c, {
          org,
          participation: row,
          intake,
          settings,
          actor,
        }),
      });
      const objects = [];
      for (const p of rows) {
        const { source, records } = await sources(c, org, p.target_id, {
            historical: true,
          }),
          t = await managed(c, org, p.target_id, {
            forUpdate: request.method !== "GET",
          });
        if (!action) {
          objects.push(await safeOwn(p, t, source));
          continue;
        }
        if (p.id !== pid) continue;
        exact(
          input,
          action === "consent"
            ? [
                "revision",
                "intakeRevision",
                "targetRevision",
                "sourceRevision",
                "termsHash",
                "requestedInterval",
                "consent",
                "waitlistAllowed",
                "emailUpdates",
                "withdrawalAcknowledged",
                "idempotencyKey",
              ]
            : action === "preferences"
              ? ["revision", "intakeRevision", "emailUpdates", "idempotencyKey"]
              : ["revision", "intakeRevision", "idempotencyKey"],
        );
        if (action === "consent") {
          const next = await recordConsent({
            c,
            org,
            user: actor.id,
            source,
            t,
            p,
            input,
            actor,
            own: true,
            intake,
          });
          return okay({ participation: await safeOwn(next, t, source) });
        }
        if (action === "preferences") {
          const next = await preferences({
            c,
            org,
            user: actor.id,
            p,
            input,
            actor,
            intake,
            source,
            t,
          });
          return okay({
            participation: await safeOwn(next, t, source),
            auditRetained: next.last_command?.auditRetained ?? null,
          });
        }
        const result = await cancel({
          settings,
          c,
          org,
          user: actor.id,
          p,
          records,
          input,
          own: true,
          intake,
        });
        return okay({
          participation: await safeOwn(result.p, t, source),
          notificationQueued: result.notificationQueued,
          auditRetained: result.auditRetained,
        });
      }
      if (action) unavailable();
      return okay({ participations: objects });
    },
    { lock: true, readOnly: request.method === "GET" },
  );
}
