import {
  audit,
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
      ].map((k) => [k, d[k]]),
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
  return terms;
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
        `SELECT count(*) AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0) AS bytes FROM ${table} t WHERE org_id=$1`,
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
async function managed(c, org, targetId) {
  return (
    await c.query(
      "SELECT * FROM os_participation_targets WHERE org_id=$1 AND target_id=$2 FOR UPDATE",
      [org, targetId],
    )
  ).rows[0];
}
async function entries(c, org, targetId) {
  return (
    await c.query(
      "SELECT p.*,i.status AS intake_status,i.cancelled_at AS intake_cancelled_at FROM os_participations p LEFT JOIN os_intake i ON i.org_id=p.org_id AND i.id=p.intake_id WHERE p.org_id=$1 AND p.target_id=$2 ORDER BY p.waitlist_sequence NULLS LAST,p.created_at,p.id",
      [org, targetId],
    )
  ).rows;
}
const targetObject = (t, source, occupied) => ({
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
function approvedTarget(source, t) {
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
  if (Date.parse(source.data.startAt) <= Date.now())
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
async function outbox(c, org, p, { safe = false } = {}) {
  const payload = {
    state: p.state,
    participationId: p.id,
    revision: p.revision,
  };
  if (
    Buffer.byteLength(JSON.stringify(payload)) >
    PARTICIPATION_LIMITS.payloadBytes
  )
    fail(422, "participation_outbox", "The notification event is too large.");
  const usage = (
    await c.query(
      "SELECT count(*) AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0) AS bytes FROM os_participation_outbox t WHERE org_id=$1",
      [org],
    )
  ).rows[0];
  const fits =
    Number(usage.count) < PARTICIPATION_LIMITS.outbox &&
    Number(usage.bytes) + Buffer.byteLength(JSON.stringify(payload)) + 1000 <=
      PARTICIPATION_LIMITS.outboxBytes &&
    (await logicalBackupBytes(c, org)) +
      Buffer.byteLength(JSON.stringify(payload)) +
      2000 <=
      60 * 1024 * 1024;
  if (!fits) {
    if (safe) return false;
    fail(
      422,
      "participation_quota",
      "The paused notification journal is full. No new allocation was recorded.",
    );
  }
  await c.query(
    "INSERT INTO os_participation_outbox(org_id,id,participation_id,event_revision,purpose,channel,state,payload) VALUES($1,$2,$3,$4,'participation','email','paused',$5) ON CONFLICT(org_id,participation_id,event_revision,purpose,channel) DO NOTHING",
    [org, id(), p.id, p.revision, JSON.stringify(payload)],
  );
  return true;
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
async function waitlistSuggestion(c, org, source, records, member) {
  const terms = participationTerms(source),
    all = (
      await c.query(
        "SELECT * FROM os_participations WHERE org_id=$1 AND state='confirmed'",
        [org],
      )
    ).rows,
    managedIds = new Set(
      (
        await c.query(
          "SELECT target_id FROM os_participation_targets WHERE org_id=$1",
          [org],
        )
      ).rows.map((t) => t.target_id),
    );
  for (const p of (await entries(c, org, source.id)).filter(
    (p) => p.state === "waitlisted" && !p.recovered,
  )) {
    try {
      candidateFor(records, p, member);
    } catch {
      continue;
    }
    if (
      !p.consent ||
      p.consent.sourceRevision !== source.revision ||
      p.consent.termsHash !== hash(terms) ||
      !p.consent.waitlistAllowed
    )
      continue;
    if (
      p.intake_status === "cancelled" &&
      ((!p.intake_cancelled_at && !p.consent.withdrawalAcknowledged) ||
        (p.intake_cancelled_at &&
          Date.parse(p.consent.at) <= Date.parse(p.intake_cancelled_at)))
    )
      continue;
    if (
      all.some(
        (x) => x.target_id === p.target_id && x.contact_id === p.contact_id,
      )
    )
      continue;
    if (
      source.moduleId === "volunteers" &&
      (all.some(
        (x) =>
          x.module_id === "volunteers" &&
          x.contact_id === p.contact_id &&
          intervalsOverlap(x.frozen?.terms, terms),
      ) ||
        records.some(
          (r) =>
            r.moduleId === "volunteers" &&
            r.data.kind === "assignment" &&
            r.data.contactId === p.contact_id &&
            legacyActive("volunteers", r.status) &&
            !managedIds.has(r.data.shiftId) &&
            intervalsOverlap(
              records.find((s) => s.id === r.data.shiftId)?.data,
              terms,
            ),
        ))
    )
      continue;
    return p.id;
  }
  return null;
}
async function update(c, org, p, changes, intent) {
  const row = {
    ...p,
    ...changes,
    revision: p.revision + 1,
    last_command: { ...intent, resultRevision: p.revision + 1 },
  };
  const saved = (
    await c.query(
      "UPDATE os_participations SET state=$3,revision=$4,consent=$5,frozen=$6,waitlist_sequence=$7,confirmed_at=$8,cancelled_at=$9,last_command=$10,updated_at=now(),recovered=$11,recovered_state=$12 WHERE org_id=$1 AND id=$2 RETURNING *",
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
      ],
    )
  ).rows[0];
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
async function allocationCheck(c, org, p, source, records, terms) {
  if (!Number.isSafeInteger(source.data.capacity) || source.data.capacity < 1)
    fail(
      409,
      "participation_capacity",
      "This occurrence has no known available capacity.",
    );
  const all = (
    await c.query(
      "SELECT * FROM os_participations WHERE org_id=$1 AND state='confirmed'",
      [org],
    )
  ).rows;
  if (
    all.filter((x) => x.target_id === p.target_id && x.id !== p.id).length >=
    source.data.capacity
  )
    fail(
      409,
      "participation_capacity",
      "This occurrence is full. Choose the waitlist explicitly if consent permits.",
    );
  if (
    all.some(
      (x) =>
        x.id !== p.id &&
        x.target_id === p.target_id &&
        x.contact_id === p.contact_id,
    )
  )
    fail(
      409,
      "participation_duplicate",
      "This contact already has a confirmed place.",
    );
  if (p.module_id === "volunteers") {
    if (
      all.some(
        (x) =>
          x.id !== p.id &&
          x.module_id === "volunteers" &&
          x.contact_id === p.contact_id &&
          intervalsOverlap(x.frozen?.terms, terms),
      )
    )
      fail(
        409,
        "participation_overlap",
        "This volunteer already has an overlapping confirmed assignment.",
      );
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
      if (shift && intervalsOverlap(shift.data, terms))
        fail(
          409,
          "participation_overlap",
          "This volunteer has an overlapping unmanaged assignment.",
        );
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
  if (
    !Number.isSafeInteger(source.data.capacity) ||
    source.data.capacity < occupants.length
  )
    issues.push("Known capacity cannot be lower than existing occupancy.");
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
    for (const o of occupants) {
      if (
        all.some(
          (x) =>
            x.contact_id === o.contactId &&
            intervalsOverlap(x.frozen?.terms, terms),
        )
      )
        issues.push("An occupant overlaps another managed assignment.");
      for (const r of records.filter(
        (r) =>
          r.moduleId === "volunteers" &&
          r.data.kind === "assignment" &&
          r.data.shiftId !== source.id &&
          r.data.contactId === o.contactId &&
          legacyActive("volunteers", r.status),
      )) {
        const shift = records.find((x) => x.id === r.data.shiftId);
        if (shift && intervalsOverlap(shift.data, terms))
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
      ]),
    }),
    occupants,
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
  if (participationReplay(t?.last_command, intent))
    return okay({
      target: targetObject(
        t,
        source,
        (await entries(c, org, source.id)).filter(
          (p) => p.state === "confirmed",
        ).length,
      ),
      adopted: t.last_command.adopted || 0,
    });
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
    target: targetObject(next, source, preview.occupants.length),
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
    if (participationReplay(old.last_command, intent))
      return okay({
        participation: staffObject(old, t, source, records, member),
      });
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
  if (participationReplay(p.last_command, intent)) return p;
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
  };
  const next = await update(c, org, p, { consent }, intent);
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
  if (participationReplay(p.last_command, intent)) return p;
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
  const next = await update(c, org, p, { consent }, intent);
  if (!input.emailUpdates)
    await c.query(
      "UPDATE os_participation_outbox SET state='cancelled' WHERE org_id=$1 AND participation_id=$2 AND state='paused'",
      [org, p.id],
    );
  if (input.emailUpdates) await participationQuota(c, org);
  await audit(
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
  return next;
}

async function cancel({
  c,
  org,
  user,
  p,
  records,
  input,
  own = false,
  intake = null,
}) {
  const intent = participationIntent(input, user, "cancel");
  if (participationReplay(p.last_command, intent))
    return {
      p,
      notificationQueued: p.last_command.notificationQueued === true,
    };
  revision(input, p.revision);
  if (own) revision(input, intake.revision, "intakeRevision");
  if (p.state === "cancelled")
    fail(
      409,
      "participation_state",
      "This participation was already cancelled. Reload its saved status.",
    );
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
    await audit(c, org, user, "participation.cancelled", record, {
      participationId: p.id,
      targetId: p.target_id,
    });
  }
  const changes = {
    state: "cancelled",
    cancelled_at: new Date().toISOString(),
  };
  const notificationQueued = await outbox(
    c,
    org,
    { ...p, ...changes, revision: p.revision + 1 },
    { safe: true },
  );
  const next = await update(c, org, p, changes, {
    ...intent,
    notificationQueued,
  });
  await audit(c, org, user, "participation.cancelled", null, {
    participationId: p.id,
    targetId: p.target_id,
    notificationQueued,
  });
  return { p: next, notificationQueued };
}

async function staffCommand({
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
}) {
  if (input.reason != null) text(input.reason, 300);
  exact(
    input,
    action === "consent"
      ? [
          "revision",
          "targetRevision",
          "sourceRevision",
          "termsHash",
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
          "reason",
          "idempotencyKey",
        ],
  );
  candidateFor(records, p, member, { approval: false });
  if (action === "cancel") {
    text(input.reason, 300, true);
    const result = await cancel({ c, org, user, p, records, input });
    return okay({
      participation: staffObject(result.p, t, source, records, member),
      notificationQueued: result.notificationQueued,
    });
  }
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
  const intent = participationIntent(input, user, action);
  if (participationReplay(p.last_command, intent))
    return okay({ participation: staffObject(p, t, source, records, member) });
  revision(input, p.revision);
  revision(input, t?.revision, "targetRevision");
  const terms = approvedTarget(source, t),
    candidate = candidateFor(records, p, member);
  revision(input, candidate.revision, "candidateRevision");
  revision(input, p.consent?.revision || 0, "consentRevision");
  await consentCheck(c, org, p, source, terms);
  if (p.recovered || p.state === "cancelled")
    fail(
      409,
      "participation_state",
      "This historical participation cannot allocate a new place.",
    );
  let changes;
  if (action === "waitlist") {
    if (p.state !== "requested" || !p.consent.waitlistAllowed)
      fail(
        409,
        "participation_waitlist",
        "Waitlisting requires a requested candidate and separate current waitlist consent.",
      );
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
    if (
      (action === "confirm" && p.state !== "requested") ||
      (action === "promote" && p.state !== "waitlisted")
    )
      fail(
        409,
        "participation_state",
        "Choose the explicit command for this participation state.",
      );
    if (action === "promote") {
      const suggested = await waitlistSuggestion(
        c,
        org,
        source,
        records,
        member,
      );
      if (suggested !== p.id) text(input.reason, 300, true);
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
    await audit(c, org, user, "record.transitioned", nextRecord, {
      viaParticipation: p.id,
      from: candidate.status,
      to: nextRecord.status,
    });
    changes = {
      state: "confirmed",
      confirmed_at: new Date().toISOString(),
      frozen: {
        terms,
        sourceRevision: source.revision,
        termsHash: hash(terms),
        candidateRevision: candidate.revision,
        candidateApproval: candidate.approval,
        programId: source.data.programId || null,
      },
    };
  }
  const next = await update(c, org, p, changes, intent);
  await outbox(c, org, next);
  await participationQuota(c, org);
  await audit(c, org, user, `participation.${next.state}`, null, {
    participationId: p.id,
    targetId: source.id,
    reason: input.reason || null,
  });
  return okay({ participation: staffObject(next, t, source, records, member) });
}

export async function participationRoutes({
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
          "SELECT target_id,count(*) AS count FROM os_participations WHERE org_id=$1 AND state='confirmed' GROUP BY target_id",
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
            Number(counts.find((x) => x.target_id === r.id)?.count || 0),
          ),
        ),
    });
  }
  const { source, records } = await sources(c, org, match[1]);
  // The fulfillment console is for scoped writers, never snapshot-only readers.
  permit(source, member, "write");
  const t = await managed(c, org, source.id);
  if (!match[2] && method === "GET") {
    const preview = await adoptionPreview(c, org, source, t, records),
      current = currentTerms(source);
    return okay({
      target: targetObject(t, source, preview.occupants.length),
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
      canAdopt: administrators(member.role) && preview.issues.length === 0,
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
          "SELECT i.id,i.revision,i.status,i.cancelled_at FROM os_participant_links l JOIN os_intake i ON i.org_id=l.org_id AND i.id=l.intake_id AND i.publication_id=l.publication_id WHERE l.user_id=$1 AND l.org_id=$2 AND l.intake_id=$3 AND l.revoked_at IS NULL FOR UPDATE OF i,l",
          [actor.id, org, intakeId],
        )
      ).rows[0];
      if (!intake) unavailable();
      const rows = (
        await c.query(
          "SELECT * FROM os_participations WHERE org_id=$1 AND intake_id=$2 ORDER BY created_at,id FOR UPDATE",
          [org, intakeId],
        )
      ).rows;
      const objects = [];
      for (const p of rows) {
        const { source, records } = await sources(c, org, p.target_id, {
            historical: true,
          }),
          t = await managed(c, org, p.target_id);
        if (!action) {
          objects.push(ownObject(p, t, source, intake));
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
          return okay({ participation: ownObject(next, t, source, intake) });
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
          return okay({ participation: ownObject(next, t, source, intake) });
        }
        const result = await cancel({
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
          participation: ownObject(result.p, t, source, intake),
          notificationQueued: result.notificationQueued,
        });
      }
      if (action) unavailable();
      return okay({ participations: objects });
    },
    { lock: true },
  );
}
