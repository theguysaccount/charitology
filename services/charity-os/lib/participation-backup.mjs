import { fail, hash, stable } from "./security.mjs";
import {
  participationTerms,
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
      data: value,
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
      }
    : null;

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
  const participations = (
    await c.query(
      "SELECT * FROM os_participations WHERE org_id=$1 ORDER BY created_at,id",
      [org],
    )
  ).rows.map((p) => ({
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
    frozen: p.frozen,
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
      "SELECT id,participation_id,event_revision,purpose,channel,state,payload,created_at FROM os_participation_outbox WHERE org_id=$1 ORDER BY created_at,id",
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
  }));
  return { version: 1, targets, participations, outbox };
}

export function restoredParticipation(backup) {
  if (!plain(backup)) bad();
  const input = backup.participation;
  if (input === undefined)
    return { targets: [], participations: [], outbox: [], warnings: [] };
  if (
    !plain(input) ||
    input.version !== 1 ||
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
    if (p.frozen) {
      const ft = terms(p.frozen.terms, p.moduleId);
      if (
        !positive(p.frozen.sourceRevision) ||
        (p.frozen.termsHash != null && p.frozen.termsHash !== hash(ft))
      )
        bad();
      frozen = {
        terms: ft,
        sourceRevision: p.frozen.sourceRevision,
        termsHash: hash(ft),
        programId: opaque(p.frozen.programId) ? p.frozen.programId : null,
        legacy: true,
        approvalKnown: false,
        sourceHistory: {
          state: former,
          consent: historicalConsent(p.consent),
          confirmedAt: stamp(p.confirmedAt) ? p.confirmedAt : null,
        },
      };
    }
    if (former === "confirmed" && !frozen) bad();
    if (
      p.consent &&
      (!positive(p.consent.revision) ||
        !positive(p.consent.sourceRevision) ||
        !/^[a-f0-9]{64}$/.test(p.consent.termsHash) ||
        !stamp(p.consent.at) ||
        typeof p.consent.waitlistAllowed !== "boolean" ||
        typeof p.consent.emailUpdates !== "boolean" ||
        typeof p.consent.method !== "string" ||
        p.consent.method.length > 80 ||
        (p.consent.evidenceRef != null &&
          (typeof p.consent.evidenceRef !== "string" ||
            p.consent.evidenceRef.length > 200)))
    )
      bad();
    participations.push({
      id: p.id,
      targetId: p.targetId,
      moduleId: p.moduleId,
      bookingRecordId: p.bookingRecordId,
      contactId: p.contactId,
      intakeId: p.intakeId || null,
      state: p.state === "cancelled" ? "cancelled" : "requested",
      recoveredState: former,
      frozen,
      createdAt: p.createdAt,
      cancelledAt:
        p.state === "cancelled" && stamp(p.cancelledAt) ? p.cancelledAt : null,
    });
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
      !["paused", "cancelled"].includes(o.state) ||
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
    outboxIds.add(o.id);
    const key = o.participationId + ":" + o.eventRevision;
    if (eventKeys.has(key)) bad();
    eventKeys.add(key);
    if (retained.has(o.participationId))
      outbox.push({ ...o, state: "cancelled" });
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
        t.createdAt,
      ],
    );
  for (const p of normalized.participations)
    await c.query(
      "INSERT INTO os_participations(org_id,id,target_id,module_id,booking_record_id,contact_id,intake_id,state,revision,source,consent,frozen,cancelled_at,created_by,created_at,recovered,recovered_state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,'recovered',NULL,$9,$10,$11,$12,true,$13)",
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
        p.cancelledAt,
        user,
        p.createdAt,
        p.recoveredState,
      ],
    );
  for (const o of normalized.outbox)
    await c.query(
      "INSERT INTO os_participation_outbox(org_id,id,participation_id,event_revision,purpose,channel,state,payload,created_at) VALUES($1,$2,$3,$4,'participation','email','cancelled',$5,$6)",
      [
        org,
        o.id,
        o.participationId,
        o.eventRevision,
        JSON.stringify(o.payload),
        o.createdAt,
      ],
    );
  await participationQuota(c, org);
}
