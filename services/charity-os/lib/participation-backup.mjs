import {
  validateRequestedInterval,
  frozenParticipationInterval,
  peakOccupancy,
  sameInterval,
} from "./participation-intervals.mjs";
import { fail, hash, stable } from "./security.mjs";
import { participationTimestampParameter } from "./participation-timestamp.mjs";
import {
  participationTerms,
  participationAllocationHash,
  participationQuota,
  PARTICIPATION_LIMITS,
} from "./participation.mjs";
import { targetKind, bookingKind, parentKey } from "./participation-guards.mjs";
const opaque = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v);
const stamp = (v) =>
  typeof v === "string" &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
const positive = (v) => Number.isSafeInteger(v) && v > 0;
const plain = (v) =>
  v !== null &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
const iso = (v) => v?.toISOString?.() || v || null;
const bad = () =>
  fail(
    422,
    "participation_backup",
    "Invalid, inconsistent or oversized participation history. No authority was imported.",
  );
const terms = (value, moduleId) => {
  if (!value || !["events", "volunteers"].includes(moduleId)) bad();
  let normalized;
  try {
    normalized = participationTerms({
      id: "recovered-source",
      orgId: "recovered-org",
      moduleId,
      data: {
        ...value,
        ...(Object.hasOwn(value, "intervalPolicy")
          ? { allowPartialIntervals: true }
          : {}),
      },
    });
  } catch {
    bad();
  }
  if (stable(value) !== stable(normalized)) bad();
  return normalized;
};
const historicalConsent = (c) =>
  c
    ? {
        revision: c.revision,
        sourceRevision: c.sourceRevision,
        termsHash: c.termsHash,
        at: c.at,
        waitlistAllowed: c.waitlistAllowed === true,
        emailUpdates: c.emailUpdates === true,
        method: c.method || null,
        evidenceRef: c.evidenceRef || null,
        withdrawalAcknowledged: c.withdrawalAcknowledged === true,
        ...(Object.hasOwn(c, "allocationHash")
          ? { allocationHash: c.allocationHash }
          : {}),
      }
    : null;

const digest = (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const exactKeys = (v, keys) =>
  plain(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
function validHistoricalConsent(c) {
  return (
    plain(c) &&
    positive(c.revision) &&
    positive(c.sourceRevision) &&
    digest(c.termsHash) &&
    stamp(c.at) &&
    typeof c.waitlistAllowed === "boolean" &&
    typeof c.emailUpdates === "boolean" &&
    typeof c.method === "string" &&
    c.method.length <= 80 &&
    (c.evidenceRef == null ||
      (typeof c.evidenceRef === "string" && c.evidenceRef.length <= 200))
  );
}
function admitNonallocatingHistory(
  value,
  former,
  requested,
  moduleId,
  targetId,
) {
  if (
    !exactKeys(value, ["version", "allocationKnown", "sourceHistory"]) ||
    value.version !== 1 ||
    value.allocationKnown !== false ||
    former === "confirmed"
  )
    bad();
  const h = value.sourceHistory;
  if (
    !exactKeys(h, [
      "state",
      "terms",
      "sourceRevision",
      "termsHash",
      "consent",
    ]) ||
    !["requested", "waitlisted", "cancelled"].includes(h.state) ||
    (h.state === "cancelled" && former !== "cancelled") ||
    !positive(h.sourceRevision) ||
    !digest(h.termsHash)
  )
    bad();
  const originalTerms = h.terms === null ? null : terms(h.terms, moduleId);
  if (originalTerms && hash(originalTerms) !== h.termsHash) bad();
  if (h.consent !== null) {
    const keys = [
      "revision",
      "sourceRevision",
      "termsHash",
      "at",
      "waitlistAllowed",
      "emailUpdates",
      "method",
      "evidenceRef",
      "withdrawalAcknowledged",
      ...(Object.hasOwn(h.consent || {}, "allocationHash")
        ? ["allocationHash"]
        : []),
    ];
    if (
      !exactKeys(h.consent, keys) ||
      !validHistoricalConsent(h.consent) ||
      typeof h.consent.withdrawalAcknowledged !== "boolean" ||
      h.consent.sourceRevision !== h.sourceRevision ||
      h.consent.termsHash !== h.termsHash
    )
      bad();
    if (
      requested
        ? h.consent.allocationHash !==
          participationAllocationHash(
            targetId,
            h.sourceRevision,
            h.termsHash,
            requested,
          )
        : Object.hasOwn(h.consent, "allocationHash")
    )
      bad();
  }
  return {
    version: 1,
    allocationKnown: false,
    sourceHistory: {
      state: h.state,
      terms: originalTerms,
      sourceRevision: h.sourceRevision,
      termsHash: h.termsHash,
      consent: historicalConsent(h.consent),
    },
  };
}
function requestHistory(row, target) {
  if (row.frozen) return row.frozen;
  const state = row.recovered_state || row.state;
  if (state === "confirmed") return null;
  const consent = historicalConsent(row.consent);
  const termsHash = consent?.termsHash || target?.termsHash;
  const sourceRevision = consent?.sourceRevision || target?.sourceRevision;
  // A public snapshot is original only when its content hash matches the stored pin.
  const originalTerms =
    [row.consent?.terms, target?.terms].find(
      (t) => plain(t) && hash(t) === termsHash,
    ) || null;
  return {
    version: 1,
    allocationKnown: false,
    sourceHistory: {
      state,
      terms: originalTerms,
      sourceRevision,
      termsHash,
      consent,
    },
  };
}

export async function exportParticipation(c, org) {
  const targets = (
    await c.query(
      "SELECT * FROM os_participation_targets WHERE org_id=$1 ORDER BY target_id",
      [org],
    )
  ).rows.map((t) => ({
    targetId: t.target_id,
    moduleId: t.module_id,
    revision: t.revision,
    mode: t.mode,
    sourceRevision: t.source_revision,
    terms: t.terms,
    termsHash: t.terms_hash,
    recoveryBlock: t.recovery_block,
    createdAt: iso(t.created_at),
  }));
  const rows = (
    await c.query(
      "SELECT * FROM os_participations WHERE org_id=$1 ORDER BY created_at,id",
      [org],
    )
  ).rows;
  const version =
    targets.some((t) => Object.hasOwn(t.terms || {}, "intervalPolicy")) ||
    rows.some(
      (p) =>
        p.requested_interval != null ||
        ["interval", "allocationHash", "allocationKnown"].some((k) =>
          Object.hasOwn(p.frozen || {}, k),
        ) ||
        Object.hasOwn(p.consent || {}, "allocationHash") ||
        Object.hasOwn(p.consent?.terms || {}, "intervalPolicy") ||
        Object.hasOwn(p.frozen?.terms || {}, "intervalPolicy"),
    )
      ? 3
      : 2;
  const participations = rows.map((p) => ({
    id: p.id,
    targetId: p.target_id,
    moduleId: p.module_id,
    bookingRecordId: p.booking_record_id,
    contactId: p.contact_id,
    intakeId: p.intake_id,
    state: p.state,
    revision: p.revision,
    source: p.source,
    consent: historicalConsent(p.consent),
    ...(version === 3
      ? { requestedInterval: p.requested_interval || null }
      : {}),
    frozen:
      version === 3
        ? requestHistory(
            p,
            targets.find((t) => t.targetId === p.target_id),
          )
        : p.frozen,
    waitlistSequence:
      p.waitlist_sequence == null ? null : Number(p.waitlist_sequence),
    confirmedAt: iso(p.confirmed_at),
    cancelledAt: iso(p.cancelled_at),
    recovered: p.recovered,
    recoveredState: p.recovered_state,
    createdAt: iso(p.created_at),
  }));
  const outbox = (
    await c.query(
      "SELECT * FROM os_participation_outbox WHERE org_id=$1 ORDER BY created_at,id",
      [org],
    )
  ).rows.map((o) => ({
    id: o.id,
    participationId: o.participation_id,
    eventRevision: o.event_revision,
    purpose: o.purpose,
    channel: o.channel,
    state: o.state,
    payload: o.payload,
    createdAt: iso(o.created_at),
    participationRevision: o.participation_revision || o.event_revision,
    intentKind: o.intent_kind || "legacy",
    consentRevision: o.consent_revision || 0,
    consentCopy: o.consent_copy || null,
    templateVersion: o.template_version || null,
    attemptedAt: iso(o.first_attempt_at),
    attempts: o.attempts || 0,
    lastCheckedAt: iso(o.last_checked_at),
    safeCode: o.safe_code || null,
    providerEventAt: iso(o.provider_event_at),
    recoveredState: o.recovered_state || null,
  }));
  return { version, targets, participations, outbox };
}

export function restoredParticipation(backup) {
  if (!plain(backup)) bad();
  const input = backup.participation;
  if (input === undefined)
    return { targets: [], participations: [], outbox: [], warnings: [] };
  if (
    !plain(input) ||
    ![1, 2, 3].includes(input.version) ||
    !Array.isArray(input.targets) ||
    !Array.isArray(input.participations) ||
    !Array.isArray(input.outbox) ||
    input.targets.length > PARTICIPATION_LIMITS.targets ||
    input.participations.length > PARTICIPATION_LIMITS.participations ||
    input.outbox.length > PARTICIPATION_LIMITS.outbox
  )
    bad();
  if (
    Buffer.byteLength(JSON.stringify(input.targets)) >
      PARTICIPATION_LIMITS.targetBytes ||
    Buffer.byteLength(JSON.stringify(input.participations)) >
      PARTICIPATION_LIMITS.participationBytes ||
    Buffer.byteLength(JSON.stringify(input.outbox)) >
      PARTICIPATION_LIMITS.outboxBytes
  )
    bad();
  if (
    !Array.isArray(backup.records) ||
    backup.records.some(
      (r) =>
        !plain(r) ||
        !opaque(r.id) ||
        typeof r.moduleId !== "string" ||
        !plain(r.data),
    ) ||
    new Set(backup.records.map((r) => r.id)).size !== backup.records.length
  )
    bad();
  if (
    backup.intake !== undefined &&
    (!plain(backup.intake) ||
      !Array.isArray(backup.intake.submissions) ||
      backup.intake.submissions.some((i) => !plain(i) || !opaque(i.id)))
  )
    bad();
  const records = new Map(backup.records.map((r) => [r.id, r])),
    intakes = new Set((backup.intake?.submissions || []).map((i) => i.id)),
    targetIds = new Set(),
    ids = new Set(),
    bookingIds = new Set(),
    pairs = new Set(),
    intakePairs = new Set(),
    warnings = [];
  let omitted = 0;
  const allTargets = new Map();
  for (const t of input.targets) {
    if (
      !plain(t) ||
      !opaque(t.targetId) ||
      targetIds.has(t.targetId) ||
      !positive(t.sourceRevision) ||
      !stamp(t.createdAt)
    )
      bad();
    targetIds.add(t.targetId);
    if (input.version < 3 && Object.hasOwn(t.terms || {}, "intervalPolicy"))
      bad();
    const normalized = terms(t.terms, t.moduleId);
    if (t.termsHash !== hash(normalized)) bad();
    const r = records.get(t.targetId);
    if (
      r &&
      (r.moduleId !== t.moduleId || r.data.kind !== targetKind(t.moduleId))
    )
      bad();
    allTargets.set(t.targetId, {
      targetId: t.targetId,
      moduleId: t.moduleId,
      sourceRevision: t.sourceRevision,
      terms: normalized,
      termsHash: hash(normalized),
      createdAt: t.createdAt,
      available: !!r,
    });
  }
  const participations = [];
  for (const p of input.participations) {
    if (
      !plain(p) ||
      !opaque(p.id) ||
      ids.has(p.id) ||
      !opaque(p.bookingRecordId) ||
      !opaque(p.contactId) ||
      !allTargets.has(p.targetId) ||
      !["requested", "waitlisted", "confirmed", "cancelled"].includes(
        p.state,
      ) ||
      !stamp(p.createdAt) ||
      (p.intakeId != null && !opaque(p.intakeId))
    )
      bad();
    ids.add(p.id);
    if (bookingIds.has(p.bookingRecordId)) bad();
    bookingIds.add(p.bookingRecordId);
    const t = allTargets.get(p.targetId);
    if (p.moduleId !== t.moduleId) bad();
    if (
      input.version < 3 &&
      (Object.hasOwn(p, "requestedInterval") ||
        Object.hasOwn(p.frozen || {}, "interval") ||
        Object.hasOwn(p.frozen || {}, "allocationHash") ||
        Object.hasOwn(p.frozen || {}, "allocationKnown") ||
        Object.hasOwn(p.consent || {}, "allocationHash") ||
        Object.hasOwn(p.consent?.terms || {}, "intervalPolicy") ||
        Object.hasOwn(p.frozen?.terms || {}, "intervalPolicy"))
    )
      bad();
    if (input.version === 3 && !Object.hasOwn(p, "requestedInterval")) bad();
    let requested;
    try {
      requested = validateRequestedInterval(
        input.version === 3 ? p.requestedInterval : null,
        p.frozen?.allocationKnown === false
          ? p.frozen.sourceHistory?.terms ||
              (p.requestedInterval
                ? {
                    ...p.requestedInterval,
                    kind: "shift",
                    intervalPolicy: { version: 1, mode: "within-shift" },
                  }
                : t.terms)
          : p.frozen?.terms || t.terms,
        p.moduleId,
      );
    } catch {
      bad();
    }
    const former =
      p.state === "cancelled"
        ? "cancelled"
        : p.state === "confirmed"
          ? "confirmed"
          : p.recovered === true
            ? p.recoveredState
            : p.state;
    if (!["requested", "waitlisted", "confirmed", "cancelled"].includes(former))
      bad();
    const booking = records.get(p.bookingRecordId),
      contact = records.get(p.contactId);
    const available =
      t.available &&
      !!booking &&
      !!contact &&
      (!p.intakeId || intakes.has(p.intakeId));
    if (!available) {
      if (former === "confirmed") bad();
      omitted++;
      continue;
    }
    if (
      booking.moduleId !== p.moduleId ||
      booking.data.kind !== bookingKind(p.moduleId) ||
      booking.data[parentKey(p.moduleId)] !== p.targetId ||
      booking.data.contactId !== p.contactId ||
      contact.moduleId !== "contacts"
    )
      bad();
    if (p.state !== "cancelled") {
      const pair = p.targetId + ":" + p.contactId;
      if (pairs.has(pair)) bad();
      pairs.add(pair);
    }
    if (p.intakeId) {
      const pair = p.targetId + ":" + p.intakeId;
      if (intakePairs.has(pair)) bad();
      intakePairs.add(pair);
    }
    let frozen = null;
    const priorConsent =
      p.consent ||
      (input.version === 3 && p.frozen?.allocationKnown !== false
        ? p.frozen?.sourceHistory?.consent
        : null) ||
      null;
    if (input.version === 3 && p.frozen?.allocationKnown === false) {
      frozen = admitNonallocatingHistory(
        p.frozen,
        former,
        requested,
        p.moduleId,
        p.targetId,
      );
    } else if (p.frozen) {
      if (Object.hasOwn(p.frozen, "allocationKnown")) bad();
      const ft = terms(p.frozen.terms, p.moduleId);
      if (
        !positive(p.frozen.sourceRevision) ||
        (p.frozen.termsHash != null && p.frozen.termsHash !== hash(ft))
      )
        bad();
      let intervalFields = {};
      if (requested) {
        if (
          !sameInterval(p.frozen.interval, requested) ||
          p.frozen.allocationHash !==
            participationAllocationHash(
              p.targetId,
              p.frozen.sourceRevision,
              hash(ft),
              requested,
            )
        )
          bad();
        intervalFields = {
          interval: requested,
          allocationHash: p.frozen.allocationHash,
        };
      } else if (
        Object.hasOwn(p.frozen, "interval") ||
        Object.hasOwn(p.frozen, "allocationHash")
      )
        bad();
      frozen = {
        ...intervalFields,
        terms: ft,
        sourceRevision: p.frozen.sourceRevision,
        termsHash: hash(ft),
        programId: opaque(p.frozen.programId) ? p.frozen.programId : null,
        legacy: true,
        approvalKnown: false,
        sourceHistory: {
          state: former,
          consent: historicalConsent(priorConsent),
          confirmedAt: stamp(p.confirmedAt)
            ? p.confirmedAt
            : input.version === 3 && stamp(p.frozen.sourceHistory?.confirmedAt)
              ? p.frozen.sourceHistory.confirmedAt
              : null,
        },
      };
    }
    if (former === "confirmed" && (!frozen || frozen.allocationKnown === false))
      bad();
    if (input.version === 3 && !frozen) {
      frozen = admitNonallocatingHistory(
        requestHistory(
          { state: former, consent: p.consent, requested_interval: requested },
          t,
        ),
        former,
        requested,
        p.moduleId,
        p.targetId,
      );
    }
    if (
      priorConsent &&
      (requested
        ? priorConsent.allocationHash !==
          participationAllocationHash(
            p.targetId,
            priorConsent.sourceRevision,
            priorConsent.termsHash,
            requested,
          )
        : Object.hasOwn(priorConsent, "allocationHash"))
    )
      bad();
    if (priorConsent && !validHistoricalConsent(priorConsent)) bad();
    participations.push({
      id: p.id,
      targetId: p.targetId,
      moduleId: p.moduleId,
      bookingRecordId: p.bookingRecordId,
      contactId: p.contactId,
      intakeId: p.intakeId || null,
      state: p.state === "cancelled" ? "cancelled" : "requested",
      recoveredState: former,
      requestedInterval: requested,
      frozen,
      createdAt: p.createdAt,
      cancelledAt:
        p.state === "cancelled" && stamp(p.cancelledAt) ? p.cancelledAt : null,
    });
  }
  if (input.version === 3) {
    for (const t of allTargets.values()) {
      const occupants = participations.filter(
        (p) =>
          p.targetId === t.targetId &&
          p.state !== "cancelled" &&
          p.recoveredState === "confirmed",
      );
      if (!occupants.length) continue;
      try {
        const capacity = records.get(t.targetId)?.data.capacity;
        const peak = peakOccupancy(
          occupants.map((p) =>
            frozenParticipationInterval({
              frozen: p.frozen,
              requested_interval: p.requestedInterval,
              module_id: p.moduleId,
            }),
          ),
        );
        if (!Number.isSafeInteger(capacity) || capacity < peak) bad();
      } catch {
        bad();
      }
    }
  }
  const retained = new Set(participations.map((p) => p.id)),
    outbox = [],
    outboxIds = new Set(),
    eventKeys = new Set();
  for (const o of input.outbox) {
    if (
      !plain(o) ||
      !opaque(o.id) ||
      outboxIds.has(o.id) ||
      !ids.has(o.participationId) ||
      !positive(o.eventRevision) ||
      o.purpose !== "participation" ||
      o.channel !== "email" ||
      !(
        input.version === 1
          ? ["paused", "cancelled"]
          : [
              "paused",
              "pending",
              "leased",
              "accepted",
              "delivered",
              "suppressed",
              "failed",
              "unknown",
              "cancelled",
            ]
      ).includes(o.state) ||
      !stamp(o.createdAt) ||
      !o.payload ||
      Object.keys(o.payload).some(
        (k) => !["state", "participationId", "revision"].includes(k),
      ) ||
      o.payload.participationId !== o.participationId ||
      o.payload.revision !== o.eventRevision ||
      !["requested", "waitlisted", "confirmed", "cancelled"].includes(
        o.payload.state,
      ) ||
      Buffer.byteLength(JSON.stringify(o.payload)) > 2048
    )
      bad();
    if (
      input.version >= 2 &&
      (!positive(o.participationRevision) ||
        !["legacy", "snapshot", "transition"].includes(o.intentKind) ||
        !Number.isSafeInteger(o.consentRevision) ||
        o.consentRevision < 0 ||
        !Number.isSafeInteger(o.attempts) ||
        o.attempts < 0 ||
        [o.attemptedAt, o.lastCheckedAt, o.providerEventAt].some(
          (v) => v != null && !stamp(v),
        ) ||
        [o.consentCopy, o.templateVersion].some(
          (v) => v != null && (typeof v !== "string" || v.length > 100),
        ) ||
        (o.safeCode != null &&
          (typeof o.safeCode !== "string" ||
            !/^[a-z_]{1,100}$/.test(o.safeCode))) ||
        (o.recoveredState != null &&
          ![
            "paused",
            "pending",
            "leased",
            "accepted",
            "delivered",
            "suppressed",
            "failed",
            "unknown",
            "cancelled",
          ].includes(o.recoveredState)))
    )
      bad();
    outboxIds.add(o.id);
    const key = o.participationId + ":" + o.eventRevision;
    if (eventKeys.has(key)) bad();
    eventKeys.add(key);
    if (retained.has(o.participationId))
      outbox.push({
        id: o.id,
        participationId: o.participationId,
        eventRevision: o.eventRevision,
        purpose: "participation",
        channel: "email",
        state: "cancelled",
        payload: o.payload,
        createdAt: o.createdAt,
        participationRevision:
          input.version >= 2 ? o.participationRevision : o.eventRevision,
        intentKind: "legacy",
        recoveredState:
          input.version >= 2 ? o.recoveredState || o.state : o.state,
        consentRevision: input.version >= 2 ? o.consentRevision : 0,
        consentCopy: input.version >= 2 ? o.consentCopy || null : null,
        templateVersion: input.version >= 2 ? o.templateVersion || null : null,
        attemptedAt: input.version >= 2 ? o.attemptedAt || null : null,
        attempts: input.version >= 2 ? o.attempts : 0,
        lastCheckedAt: input.version >= 2 ? o.lastCheckedAt || null : null,
        safeCode: input.version >= 2 ? o.safeCode || null : null,
        providerEventAt: input.version >= 2 ? o.providerEventAt || null : null,
      });
    else omitted++;
  }
  const used = new Set(participations.map((p) => p.targetId)),
    targets = [...allTargets.values()]
      .filter((t) => t.available || used.has(t.targetId))
      .map(({ available, ...t }) => t);
  if (omitted)
    warnings.push({
      field: "participation",
      message: `${omitted} closed history or notification entries have unavailable current references and remain only in the private source archive. No confirmed occupancy was omitted.`,
    });
  if (targets.length)
    warnings.push({
      field: "participation",
      message:
        "Participation restores as blocked, inactive provenance. An administrator must freshly approve sources and reconcile all former confirmed occupancy before enabling this occurrence. No participant access or notification delivery is restored.",
    });
  // Normalization can retain an additional historical envelope. Bound the actual
  // prepared output as well as the incoming wrapper before any restore writes.
  if (
    Buffer.byteLength(JSON.stringify(targets)) >
      PARTICIPATION_LIMITS.targetBytes ||
    Buffer.byteLength(JSON.stringify(participations)) >
      PARTICIPATION_LIMITS.participationBytes ||
    Buffer.byteLength(JSON.stringify(outbox)) > PARTICIPATION_LIMITS.outboxBytes
  )
    bad();
  return { targets, participations, outbox, warnings };
}

export async function restoreParticipation(c, org, user, normalized) {
  if (
    !normalized.targets.length &&
    !normalized.participations.length &&
    !normalized.outbox.length
  )
    return;
  for (const t of normalized.targets)
    await c.query(
      "INSERT INTO os_participation_targets(org_id,target_id,module_id,revision,mode,source_revision,terms,terms_hash,recovery_block,created_by,created_at) VALUES($1,$2,$3,1,'paused',$4,$5,$6,true,$7,$8)",
      [
        org,
        t.targetId,
        t.moduleId,
        t.sourceRevision,
        JSON.stringify(t.terms),
        t.termsHash,
        user,
        participationTimestampParameter(t.createdAt),
      ],
    );
  for (const p of normalized.participations)
    await c.query(
      "INSERT INTO os_participations(org_id,id,target_id,module_id,booking_record_id,contact_id,intake_id,state,revision,source,consent,frozen,cancelled_at,created_by,created_at,recovered,recovered_state,requested_interval) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,'recovered',NULL,$9,$10,$11,$12,true,$13,$14)",
      [
        org,
        p.id,
        p.targetId,
        p.moduleId,
        p.bookingRecordId,
        p.contactId,
        p.intakeId,
        p.state,
        p.frozen ? JSON.stringify(p.frozen) : null,
        participationTimestampParameter(p.cancelledAt),
        user,
        participationTimestampParameter(p.createdAt),
        p.recoveredState,
        p.requestedInterval ? JSON.stringify(p.requestedInterval) : null,
      ],
    );
  for (const o of normalized.outbox)
    await c.query(
      "INSERT INTO os_participation_outbox(org_id,id,participation_id,event_revision,purpose,channel,state,payload,created_at,participation_revision,intent_kind,recovered_state,consent_revision,consent_copy,template_version,first_attempt_at,attempts,last_checked_at,safe_code,provider_event_at) VALUES($1,$2,$3,$4,'participation','email','cancelled',$5,$6,$7,'legacy',$8,$9,$10,$11,$12,$13,$14,$15,$16)",
      [
        org,
        o.id,
        o.participationId,
        o.eventRevision,
        JSON.stringify(o.payload),
        participationTimestampParameter(o.createdAt),
        o.participationRevision,
        o.recoveredState,
        o.consentRevision,
        o.consentCopy,
        o.templateVersion,
        participationTimestampParameter(o.attemptedAt),
        o.attempts,
        participationTimestampParameter(o.lastCheckedAt),
        o.safeCode,
        participationTimestampParameter(o.providerEventAt),
      ],
    );
  await participationQuota(c, org);
}
