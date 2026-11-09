/** GROUP-present remaining safety sizing. No mutation or authorization grant. */
import { fail, hash } from "./security.mjs";
import { ownGroupValue } from "./participation-group-model.mjs";
import { groupStateCount } from "./participation-group-store.mjs";
import { PARTICIPATION_LEGACY_SQL, PARTICIPATION_REMINDER_LEGACY_SQL } from "./participation-storage.mjs";
import { exportParticipation, participationNativeInventory } from "./participation-backup.mjs";
import { DELIVERY_CONSENT_VERSION, DELIVERY_TEMPLATE_VERSION, DELIVERY_LIMITS } from "./participation-delivery.mjs";
import {
  learningOperationalParticipationProjectionSQL,
  learningOperationalOutboxProjectionSQL,
  operationalGrowth, LEARNING_RESTORE_CAPACITY as C, LEARNING_OPERATIONAL_CAPACITY as O,
} from "./learning-capacity.mjs";

const MAX = 2147483647, DIGEST = "f".repeat(64), wireStamp = O.serviceTime;
const wireBytes = value => Buffer.byteLength(JSON.stringify(value));
const bad = () => fail(422, "participation_group_safety_capacity", "The complete current participation safety projection is unavailable or exceeds its existing limits.");
const need = value => { if (!value) bad(); };
const integer = value => {
  need(typeof value === "number" || (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)));
  const n = Number(value); need(Number.isSafeInteger(n) && n >= 0); return n;
};
const plus = (a, b) => { const n = a + b; need(Number.isSafeInteger(n) && n >= 0); return n; };
const freeze = value => {
  if (value && typeof value === "object") { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
};
const id = value => need(typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value));
const exact = (value, keys) => need(value && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)));
const largest = values => values.reduce((best, value) => wireBytes(value) > wireBytes(best) ? value : best);
const pCommand = Object.freeze({ intentHash: DIGEST, payloadHash: DIGEST, action: "delivery.preference", actorHash: DIGEST,
  resultRevision: MAX, notificationQueued: false, auditRetained: false });
const deliveryConsent = Object.freeze({ version: DELIVERY_CONSENT_VERSION, enabled: false, revision: MAX, at: wireStamp });
const policyCommand = Object.freeze({ intentHash: DIGEST, payloadHash: DIGEST, action: "delivery.disable", actorHash: DIGEST,
  result: { policy: { revision: MAX, enabled: false, templateVersion: DELIVERY_TEMPLATE_VERSION }, cancelled: DELIVERY_LIMITS.outbox, auditRetained: false } });
const reminderCommand = Object.freeze({ format: "charitology-participation-reminder-choice", version: 1, method: "participation-reminder-v1", action: "choice",
  actorSha256: DIGEST, sessionSha256: DIGEST, linkSha256: DIGEST, commandSha256: DIGEST, requestSha256: DIGEST, acceptedAtExact: C.timestamp,
  result: { participationId: "p".repeat(100), revision: MAX, intakeRevision: MAX,
    reminder: { version: "participation-reminder-v1", enabled: false, revision: MAX, atExact: C.timestamp }, auditRetained: false } });
const bounds = Object.freeze({ pCommand, deliveryConsent, policyCommand, reminderCommand });
/** Fixed shared projection policy, never caller SQL or an authority token. */
export function participationSafetyProjectionBindings(org, affectedIds) {
  id(org); need(Array.isArray(affectedIds) && affectedIds.length <= 2000);
  const ids = affectedIds.slice(); ids.forEach(id);
  need(new Set(ids).size === ids.length);
  return [org, C.timestamp, O.attempts, DELIVERY_CONSENT_VERSION, O.serviceTime, ids, JSON.stringify(bounds)];
}
// All fragments/aliases/parameter positions below are server constants.
const wider = (actual, bound) => `(CASE WHEN octet_length((${actual})::text)>octet_length((${bound})::text) THEN ${actual} ELSE ${bound} END)`;
const charge = value => {
  const interval = `(CASE WHEN ${PARTICIPATION_LEGACY_SQL} THEN (${value})-'requested_interval' ELSE ${value} END)`;
  return `(CASE WHEN ${PARTICIPATION_REMINDER_LEGACY_SQL} THEN (${interval})-'reminder_consent' ELSE ${interval} END)`;
};
const pOp = learningOperationalParticipationProjectionSQL();
const reminderExit = `jsonb_set($7::jsonb->'reminderCommand','{result,participationId}',to_jsonb(t.id))`;
const reminderEnabled = `t.reminder_consent->'enabled'='true'::jsonb`;
const commandBound = `CASE WHEN ${reminderEnabled} THEN ${wider(wider("to_jsonb(t.last_command)", "$7::jsonb->'pCommand'"), reminderExit)} ELSE ${wider("to_jsonb(t.last_command)", "$7::jsonb->'pCommand'")} END`;
const pFuture = `(${pOp.base})||jsonb_build_object('state','cancelled','cancelled_at',CASE WHEN t.state='cancelled' THEN to_jsonb(t.cancelled_at) ELSE to_jsonb($2::timestamptz) END,'last_command',${commandBound},'consent',CASE WHEN jsonb_typeof(t.consent)='object' THEN t.consent||jsonb_build_object('emailUpdates',false) ELSE t.consent END,'delivery_consent',${wider("to_jsonb(t.delivery_consent)", "$7::jsonb->'deliveryConsent'")},'reminder_consent',CASE WHEN ${reminderEnabled} THEN ${wider("to_jsonb(t.reminder_consent)", "("+reminderExit+")->'result'->'reminder'")} ELSE to_jsonb(t.reminder_consent) END)`;
const pOperationalRaw = `CASE WHEN t.id=ANY($6::text[]) THEN GREATEST(octet_length((${pOp.base})::text),octet_length((${pOp.changed})::text)) ELSE octet_length(to_jsonb(t)::text) END`;
const pOperationalCharge = `CASE WHEN t.id=ANY($6::text[]) THEN GREATEST(octet_length(${charge(pOp.base)}::text),octet_length(${charge(pOp.changed)}::text)) ELSE octet_length(${charge("to_jsonb(t)")}::text) END`;
const oOp = learningOperationalOutboxProjectionSQL();
const oSuppression = `to_jsonb(t)||jsonb_build_object('state','cancelled','safe_code',${wider("to_jsonb(t.safe_code)", "to_jsonb('authority_withdrawn'::text)")},'lease_owner',NULL,'lease_until',NULL)`;

export const GROUP_SAFETY_SQL = Object.freeze({
  participations: `SELECT t.id,to_jsonb(t) AS row,to_jsonb(p) AS future_row,octet_length(${charge("to_jsonb(t)")}::text)::text AS actual,octet_length(to_jsonb(t)::text)::text AS actual_raw,(${pOperationalCharge})::text AS operational,(${pOperationalRaw})::text AS operational_raw,GREATEST(octet_length(${charge("to_jsonb(t)")}::text),${pOperationalCharge},octet_length(${charge("to_jsonb(p)")}::text))::text AS projected,GREATEST(octet_length(to_jsonb(t)::text),${pOperationalRaw},octet_length(to_jsonb(p)::text))::text AS projected_raw FROM os_participations t CROSS JOIN LATERAL jsonb_populate_record(NULL::os_participations,${pFuture}) p WHERE t.org_id=$1 ORDER BY t.id LIMIT 2001`,
  bookings: "SELECT t.id,to_jsonb(t) AS row,to_jsonb(p) AS future_row,octet_length(to_jsonb(t)::text)::text AS actual,GREATEST(octet_length(to_jsonb(t)::text),octet_length(to_jsonb(p)::text))::text AS projected FROM os_records t CROSS JOIN LATERAL jsonb_populate_record(NULL::os_records,to_jsonb(t)||jsonb_build_object('status','cancelled','revision',$3::integer,'last_editor_id',$4::text,'updated_at',$2::timestamptz,'approval',NULL)) p WHERE t.org_id=$1 AND t.id IN(SELECT booking_record_id FROM os_participations WHERE org_id=$1 AND state<>'cancelled') ORDER BY t.id LIMIT 2001",
  policy: "WITH original AS (SELECT to_jsonb(t) AS row FROM os_participation_delivery_policies t WHERE org_id=$1), source AS (SELECT row,true AS present FROM original UNION ALL SELECT jsonb_build_object('org_id',$1::text,'revision',1,'enabled',false,'epoch',repeat('f',32),'activated_at',NULL,'template_version',$4::text,'last_command',NULL,'updated_at',$2::timestamptz),false WHERE NOT EXISTS(SELECT 1 FROM original)) SELECT source.present,source.row,to_jsonb(p) AS future_row,CASE WHEN present THEN octet_length(source.row::text) ELSE 0 END::text AS actual,GREATEST(CASE WHEN present THEN octet_length(source.row::text) ELSE 0 END,octet_length(to_jsonb(p)::text))::text AS projected FROM source CROSS JOIN LATERAL jsonb_populate_record(NULL::os_participation_delivery_policies,source.row||jsonb_build_object('revision',$3::integer,'enabled',false,'last_command',CASE WHEN octet_length((source.row->'last_command')::text)>octet_length(($5::jsonb)::text) THEN source.row->'last_command' ELSE $5::jsonb END,'updated_at',$2::timestamptz)) p",
  outbox: `SELECT t.id,octet_length(to_jsonb(t)::text)::text AS actual_raw,GREATEST(octet_length(to_jsonb(t)::text),t.budget_bytes)::text AS actual,CASE WHEN $7::boolean THEN GREATEST(octet_length(to_jsonb(t)::text),t.budget_bytes,octet_length((${oOp})::text)) ELSE GREATEST(octet_length(to_jsonb(t)::text),t.budget_bytes) END::text AS operational,GREATEST(octet_length(to_jsonb(t)::text),t.budget_bytes,CASE WHEN $7::boolean THEN octet_length((${oOp})::text) ELSE 0 END,CASE WHEN t.first_attempt_at IS NULL AND t.state IN('paused','pending','leased') THEN octet_length((${oSuppression})::text) ELSE 0 END)::text AS projected FROM os_participation_outbox t WHERE t.org_id=$1 ORDER BY t.id LIMIT 8001`,
});

function resultRows(result, limit) {
  need(result && Array.isArray(result.rows) && result.rows.length <= limit);
  return result.rows;
}
function indexed(values) {
  const map = new Map();
  for (const value of values) { id(value.id); need(!map.has(value.id)); map.set(value.id, value); }
  return map;
}
function sumRows(values, fields) {
  const totals = Object.fromEntries(fields.map(key => [key, 0]));
  for (const value of values) for (const key of fields) totals[key] = plus(totals[key], integer(value[key]));
  return totals;
}

// Reuse the actual native exporter for requestHistory/interval semantics. Only
// top-level SQL temporal transport is replaced with its already-admitted wire
// equivalent; nested historical strings/terms/consents are never normalized.
async function futureParticipationNative(org, source, measured) {
  const actual = indexed(source.participations);
  need(measured.length === actual.size);
  const futureRows = measured.map(value => {
    const original = actual.get(value.id); need(original && value.row.id === value.id && value.row.org_id === org && value.future_row.id === value.id && value.future_row.org_id === org);
    return { ...value.future_row, created_at: original.createdAt, confirmed_at: original.confirmedAt,
      cancelled_at: original.state === "cancelled" ? original.cancelledAt : wireStamp,
      updated_at: wireStamp, waitlist_sequence: original.waitlistSequence };
  });
  const targets = source.targets.map(t => ({ target_id: t.targetId, module_id: t.moduleId, revision: t.revision,
    mode: t.mode, source_revision: t.sourceRevision, terms: t.terms, terms_hash: t.termsHash,
    recovery_block: t.recoveryBlock, created_at: t.createdAt }));
  const outbox = source.outbox.map(o => ({ id: o.id, participation_id: o.participationId, event_revision: o.eventRevision,
    purpose: o.purpose, channel: o.channel, state: o.state, payload: o.payload, created_at: o.createdAt,
    participation_revision: o.participationRevision, intent_kind: o.intentKind, consent_revision: o.consentRevision,
    consent_copy: o.consentCopy, template_version: o.templateVersion, first_attempt_at: o.attemptedAt,
    attempts: o.attempts, last_checked_at: o.lastCheckedAt, safe_code: o.safeCode,
    provider_event_at: o.providerEventAt, recovered_state: o.recoveredState }));
  const result = participationNativeInventory(targets, futureRows, outbox);
  need(result.version === source.version && result.participations.length === source.participations.length);
  return indexed(result.participations);
}

/** Internal actual-source snapshot only. Inputs are NOT HTTP flags or authority.
 * The caller supplies the complete backup and its actual operational measure
 * from the same locked tenant snapshot. Results are additional to whole.required*.
 */
async function measureRemaining(c, org, context, append) {
  id(org); exact(context, ["backup", "operational"]);
  const { backup, operational } = context, source = backup.participation;
  need(source && Array.isArray(source.participations) && source.participations.length <= 2000 && Array.isArray(source.outbox) && source.outbox.length <= DELIVERY_LIMITS.outbox);
  const growth = operationalGrowth(source, { reminderChoiceIds: operational.reminderChoiceIds || [] });
  need(growth.sourceWireGrowthBytes === operational.sourceWireGrowthBytes);
  const params = participationSafetyProjectionBindings(org, growth.affectedParticipationIds);
  const people = resultRows(await c.query(GROUP_SAFETY_SQL.participations, params), 2000);
  const peopleById = indexed(people); need(peopleById.size === source.participations.length && source.participations.every(p => peopleById.has(p.id)));
  const p = sumRows(people, ["actual", "actual_raw", "operational", "operational_raw", "projected", "projected_raw"]);
  for (const row of people) need(integer(row.actual_raw) >= integer(row.actual) && integer(row.operational) >= integer(row.actual) && integer(row.operational_raw) >= integer(row.operational) && integer(row.projected) >= integer(row.operational) && integer(row.projected_raw) >= integer(row.operational_raw) && integer(row.projected_raw) >= integer(row.projected));
  need(p.operational - p.actual === integer(operational.sourceParticipationGrowthBytes));
  need(p.operational_raw - p.actual_raw === integer(operational.sourceParticipationRawGrowthBytes ?? operational.sourceParticipationGrowthBytes));
  if (p.projected > 8 * 1024 * 1024) bad();

  const bookings = resultRows(await c.query(GROUP_SAFETY_SQL.bookings, [org, C.timestamp, MAX, C.worstActorId]), 2000);
  const bookingById = indexed(bookings), records = indexed([...(backup.records || []), ...(backup.trash || [])]);
  const expectedBookings = new Set(source.participations.filter(p => p.state !== "cancelled").map(p => p.bookingRecordId));
  need(bookingById.size === expectedBookings.size && [...expectedBookings].every(key => bookingById.has(key)));
  let bookingRetainedGrowth = 0, bookingNativeGrowth = 0;
  for (const row of bookings) {
    const actual = integer(row.actual), projected = integer(row.projected); need(projected >= actual && row.row.org_id === org && row.future_row.org_id === org);
    bookingRetainedGrowth = plus(bookingRetainedGrowth, projected - actual);
    const original = records.get(row.id); need(original && row.row.id === row.id && row.future_row.id === row.id);
    const future = { ...original, status: "cancelled", revision: MAX, lastEditedBy: C.worstActorId, updatedAt: wireStamp, approval: null };
    bookingNativeGrowth = plus(bookingNativeGrowth, Math.max(0, wireBytes(future) - wireBytes(original)));
  }

  const policyRows = resultRows(await c.query(GROUP_SAFETY_SQL.policy, [org, C.timestamp, MAX, DELIVERY_TEMPLATE_VERSION, JSON.stringify(policyCommand)]), 1);
  need(policyRows.length === 1); const policy = policyRows[0];
  need(typeof policy.present === "boolean" && policy.future_row.org_id === org);
  exact(policy.future_row, ["org_id", "revision", "enabled", "epoch", "activated_at", "template_version", "last_command", "updated_at"]);
  const policyActual = integer(policy.actual), policyProjected = integer(policy.projected); need(policyProjected >= policyActual);
  const sourcePolicy = backup.delivery?.policy ?? null;
  need(policy.present === (sourcePolicy !== null));
  const futurePolicy = { revision: MAX, enabled: false, activatedAt: sourcePolicy?.activatedAt ?? null,
    templateVersion: sourcePolicy?.templateVersion ?? DELIVERY_TEMPLATE_VERSION, updatedAt: wireStamp };
  const policyNativeGrowth = Math.max(0, wireBytes(futurePolicy) - wireBytes(sourcePolicy));

  const outboxRows = resultRows(await c.query(GROUP_SAFETY_SQL.outbox, [org, C.timestamp, O.providerPhysicalTime, O.safeCode, O.attempts, "f".repeat(32), growth.active]), DELIVERY_LIMITS.outbox).slice();
  if (append) { need(!outboxRows.some(r => r.id === append.row.id)); outboxRows.push(append.measure); }
  const outboxById = indexed(outboxRows); need(outboxById.size === source.outbox.length && source.outbox.every(o => outboxById.has(o.id)));
  const outbox = sumRows(outboxRows, ["actual", "actual_raw", "operational", "projected"]);
  for (const row of outboxRows) need(integer(row.actual) >= integer(row.actual_raw) && integer(row.operational) >= integer(row.actual) && integer(row.projected) >= integer(row.operational));
  need(outbox.operational - outbox.actual === integer(operational.sourceOutboxGrowthBytes) + (append ? integer(append.measure.operational) - integer(append.measure.actual) : 0));
  if (outbox.projected > DELIVERY_LIMITS.outboxBytes) bad();

  const nativeFuture = await futureParticipationNative(org, source, people), affected = new Set(growth.affectedParticipationIds);
  let nativePeopleGrowth = 0, operationalPeopleBytes = 2;
  for (let n = 0; n < source.participations.length; ++n) {
    const original = source.participations[n], op = affected.has(original.id) ? { ...original, revision: Math.max(original.revision, O.attempts) } : original;
    const future = nativeFuture.get(original.id); need(future);
    operationalPeopleBytes = plus(operationalPeopleBytes, wireBytes(op) + (n ? 1 : 0));
    nativePeopleGrowth = plus(nativePeopleGrowth, wireBytes(largest([original, op, future])) - wireBytes(op));
  }
  need(operationalPeopleBytes === growth.sourceParticipationWireBytes);
  let nativeSuppressionGrowth = 0;
  if (!growth.active) for (const item of source.outbox) {
    if (item.attemptedAt !== null || !["paused", "pending", "leased"].includes(item.state)) continue;
    const future = { ...item, state: "cancelled", safeCode: largest([item.safeCode, "authority_withdrawn"]) };
    nativeSuppressionGrowth = plus(nativeSuppressionGrowth, Math.max(0, wireBytes(future) - wireBytes(item)));
  }
  const projectedParticipationNativeBytes = plus(growth.sourceParticipationWireBytes, nativePeopleGrowth);
  const projectedOutboxNativeBytes = plus(growth.sourceOutboxWireBytes, nativeSuppressionGrowth);
  if (projectedParticipationNativeBytes > 8 * 1024 * 1024 || projectedOutboxNativeBytes > DELIVERY_LIMITS.outboxBytes) bad();
  // When operational is active it already uses suppressed(10)>cancelled(9),
  // safeCode100 and wider current timestamps for EVERY portable outbox item.
  const retainedGrowthAboveOperational = (p.projected - p.operational) + bookingRetainedGrowth + (policyProjected - policyActual) + (outbox.projected - outbox.operational);
  const nativeGrowthAboveOperational = nativePeopleGrowth + bookingNativeGrowth + policyNativeGrowth + nativeSuppressionGrowth;
  need(Number.isSafeInteger(retainedGrowthAboveOperational) && Number.isSafeInteger(nativeGrowthAboveOperational));
  return freeze({ participationCount: people.length, outboxCount: outboxRows.length,
    actualParticipationChargedBytes: p.actual, actualParticipationRawBytes: p.actual_raw,
    projectedParticipationChargedBytes: p.projected, projectedParticipationRawBytes: p.projected_raw,
    existingOperationalParticipationGrowth: p.operational - p.actual, existingOperationalParticipationRawGrowth: p.operational_raw - p.actual_raw,
    remainingParticipationGrowthAboveOperational: p.projected - p.operational,
    bookingRetainedGrowth, bookingNativeGrowth, policyRetainedGrowth: policyProjected - policyActual, policyNativeGrowth,
    actualOutboxBytes: outbox.actual, projectedOutboxBytes: outbox.projected,
    existingOperationalOutboxGrowth: outbox.operational - outbox.actual,
    remainingSuppressionGrowthAboveOperational: outbox.projected - outbox.operational,
    nativePeopleGrowth, nativeSuppressionGrowth, projectedParticipationNativeBytes, projectedOutboxNativeBytes, retainedGrowthAboveOperational, nativeGrowthAboveOperational,
    operationalSourceLogicalGrowthBytes: operational.sourceLogicalGrowthBytes + (append ? integer(append.measure.operational) - integer(append.measure.actual) : 0),
    operationalSourceWireGrowthBytes: operational.sourceWireGrowthBytes });
}

export const measureGroupRemainingParticipationSafety = (c, org, context) => measureRemaining(c, org, context);

const noticeKeys = ["org_id", "id", "participation_id", "event_revision", "participation_revision", "purpose", "channel", "state", "payload", "intent_kind", "consent_revision", "consent_copy", "user_id", "link_id", "link_revision", "recipient_hash", "policy_epoch", "template_version", "relay_key", "payload_hash", "budget_bytes"];
const outboxPhysicalKeys = [...noticeKeys, "created_at", "first_attempt_at", "attempts", "lease_owner", "lease_until", "next_at", "last_checked_at", "safe_code", "provider_event_at", "recovered_state"];
const nullableLinkKeys = ["user_id", "link_id", "link_revision", "recipient_hash", "policy_epoch", "template_version", "relay_key", "payload_hash"];
const digest = value => need(typeof value === "string" && /^[a-f0-9]{64}$/.test(value));
const revision = value => need(Number.isSafeInteger(value) && value >= 1 && value <= MAX);

/** Exact existing queue INSERT values, already derived by the server. This
 * validates storage shape, never current recipient/consent/queue eligibility. */
export function validateGroupParticipationNotice(input, org) {
  id(org); const row = ownGroupValue(input, 16384); exact(row, noticeKeys);
  need(row.org_id === org); id(row.id); id(row.participation_id);
  revision(row.event_revision); revision(row.participation_revision);
  need(row.purpose === "participation" && row.channel === "email" && ["legacy", "snapshot", "transition"].includes(row.intent_kind));
  exact(row.payload, ["state", "participationId", "revision"]);
  need(["requested", "waitlisted", "confirmed", "cancelled"].includes(row.payload.state) && row.payload.participationId === row.participation_id && row.payload.revision === row.event_revision);
  need(Number.isSafeInteger(row.consent_revision) && row.consent_revision >= 0 && row.consent_revision <= MAX);
  if (row.intent_kind === "legacy") {
    need(row.state === "paused" && row.consent_revision === 0 && row.consent_copy === null && row.budget_bytes === 0);
    need(nullableLinkKeys.every(key => row[key] === null));
  } else {
    need(row.state === "pending" && row.consent_revision >= 1 && row.consent_copy === DELIVERY_CONSENT_VERSION && row.budget_bytes === DELIVERY_LIMITS.reserve);
    id(row.user_id); id(row.link_id); revision(row.link_revision); digest(row.recipient_hash); digest(row.payload_hash);
    need(typeof row.policy_epoch === "string" && /^[a-f0-9]{32}$/.test(row.policy_epoch));
    need(row.template_version === DELIVERY_TEMPLATE_VERSION && typeof row.relay_key === "string" && /^participation-[a-f0-9]{32}$/.test(row.relay_key));
  }
  return row;
}

// Real SQL defaults for the existing queue INSERT, not a guessed DTO charge.
// Query remains SELECT-only; row/operational/suppression bytes are independent.
export const GROUP_NOTICE_SQL = `WITH t AS(SELECT * FROM jsonb_populate_record(NULL::os_participation_outbox,jsonb_build_object('created_at',transaction_timestamp(),'next_at',transaction_timestamp(),'attempts',0)||$7::jsonb)) SELECT to_jsonb(t) AS row,octet_length(to_jsonb(t)::text)::text AS actual_raw,octet_length((${oOp})::text)::text AS operational_raw,octet_length((${oSuppression})::text)::text AS suppression_raw FROM t WHERE t.org_id=$1`;

function noticeNative(row) {
  const stamp = value => { if (value === null) return null; const date = new Date(value); need(Number.isFinite(date.getTime())); return date.toISOString(); };
  return { id: row.id, participationId: row.participation_id, eventRevision: row.event_revision, purpose: row.purpose,
    channel: row.channel, state: row.state, payload: row.payload, createdAt: stamp(row.created_at),
    participationRevision: row.participation_revision, intentKind: row.intent_kind, consentRevision: row.consent_revision,
    consentCopy: row.consent_copy, templateVersion: row.template_version, attemptedAt: null, attempts: 0,
    lastCheckedAt: null, safeCode: null, providerEventAt: null, recoveredState: null };
}

async function sourceSnapshot(c, org, candidate) {
  const { assembleWorkspaceBackup } = await import("./workspace-backup.mjs");
  const { logicalBackupBytes } = await import("./database.mjs");
  const { measureLearningOperationalCapacity } = await import("./learning-capacity.mjs");
  const { measureGroupCapacity } = await import("./participation-group-capacity.mjs");
  const { checkCheckInCapacity } = await import("./participant-check-in-capacity.mjs");
  let backup = await assembleWorkspaceBackup(c, org);
  let usage = integer(await logicalBackupBytes(c, org)), append;
  if (candidate) {
    need(backup.participation.outbox.length < DELIVERY_LIMITS.outbox);
    const found = resultRows(await c.query(GROUP_NOTICE_SQL, [org, C.timestamp, O.providerPhysicalTime, O.safeCode, O.attempts, "f".repeat(32), JSON.stringify(candidate)]), 1);
    need(found.length === 1); const value = found[0], row = value.row;
    need(row.org_id === org && row.id === candidate.id && row.participation_id === candidate.participation_id);
    exact(row, outboxPhysicalKeys);
    need(noticeKeys.every(key => hash(row[key]) === hash(candidate[key])));
    need(row.attempts === 0 && row.first_attempt_at === null && row.safe_code === null && row.lease_owner === null && row.lease_until === null && row.last_checked_at === null && row.provider_event_at === null && row.recovered_state === null);
    need(!backup.participation.outbox.some(item => item.id === row.id));
    const raw = integer(value.actual_raw), opRaw = integer(value.operational_raw), suppressionRaw = integer(value.suppression_raw);
    need(raw > 0 && opRaw > 0 && suppressionRaw > 0);
    if (candidate.intent_kind !== "legacy") need(Math.max(raw, opRaw, suppressionRaw) <= candidate.budget_bytes);
    const native = noticeNative(row), participation = { ...backup.participation, outbox: [...backup.participation.outbox, native] };
    const growth = operationalGrowth(participation);
    const actual = Math.max(raw, candidate.budget_bytes), operational = Math.max(actual, growth.active ? opRaw : 0);
    append = { row, measure: { id: row.id, actual: String(actual), actual_raw: String(raw), operational: String(operational), projected: String(Math.max(operational, suppressionRaw)) } };
    usage = plus(usage, actual);
    const { checksum, ...payload } = backup;
    const prospective = { ...payload, participation }; backup = { ...prospective, checksum: hash(prospective) };
  }
  const operational = await measureLearningOperationalCapacity(c, org, backup.participation);
  const remaining = await measureRemaining(c, org, { backup, operational }, append);
  const group = await measureGroupCapacity(c, org), checkins = await checkCheckInCapacity(c, org);
  const requiredUsage = usage + remaining.operationalSourceLogicalGrowthBytes + remaining.retainedGrowthAboveOperational + group.retainedGrowthBytes + checkins.wholeRetainedReserve;
  const requiredBackupBytes = wireBytes(backup) + operational.sourceWireGrowthBytes + remaining.nativeGrowthAboveOperational + group.nativeGrowthBytes + checkins.wholeNativeReserve;
  need(Number.isSafeInteger(requiredUsage) && Number.isSafeInteger(requiredBackupBytes));
  return { requiredUsage, requiredBackupBytes, usage, backupBytes: wireBytes(backup), remaining, group, checkins };
}
// Existing trusted emergency policy only. Ordinary60MiB/restore admission is
// the caller's separate path; no HTTP or request-supplied mode is accepted.
const fits = value => value.requiredUsage <= 61 * 1024 * 1024 && value.requiredBackupBytes <= 64 * 1024 * 1024;

/** Current actual caps plus remaining prepaid exits, no ordinary restore buy. */
export async function checkGroupSafetyCapacity(c, org) {
  id(org); if (!(await groupStateCount(c, org))) return null;
  const value = await sourceSnapshot(c, org); if (!fits(value)) bad();
  return freeze(value);
}

/** Optional append only. Absent groups keep their old queue behavior. Failure
 * or an incomplete intermediate graph omits the notice, never spends exits. */
export async function canRetainGroupParticipationNotice(c, org, input) {
  try {
    id(org); if (!(await groupStateCount(c, org))) return true;
    const candidate = validateGroupParticipationNotice(input, org);
    return fits(await sourceSnapshot(c, org, candidate));
  } catch { return false; }
}

export const GROUP_AUDIT_SQL = "SELECT octet_length(to_jsonb(p)::text)::text AS bytes,to_jsonb(p) AS row FROM jsonb_populate_record(NULL::os_events,$1::jsonb) p";
/** Optional source audit only. Its omission is separate from committed result
 * receipts; the caller must retain false in its normal success/Replay result. */
export async function canRetainGroupSafetyAudit(c, org, input) {
  try {
    id(org); if (!(await groupStateCount(c, org))) return true;
    const event = ownGroupValue(input); exact(event, ["org_id", "actor_id", "action", "record_id", "module_id", "detail"]);
    need(event.org_id === org); if (event.actor_id !== null) id(event.actor_id);
    if (event.record_id !== null) id(event.record_id);
    if (event.module_id !== null) id(event.module_id);
    need(typeof event.action === "string" && event.action.length <= 100);
    const rows = resultRows(await c.query(GROUP_AUDIT_SQL, [JSON.stringify({ ...event, id: "9223372036854775807", created_at: C.timestamp })]), 1);
    need(rows.length === 1); const row = rows[0].row;
    exact(row, ["id", "org_id", "actor_id", "action", "record_id", "module_id", "detail", "created_at"]);
    const value = await sourceSnapshot(c, org), eventBytes = integer(rows[0].bytes);
    // pg returns SELECT * bigint IDs as strings; JSONB's numeric decoder must
    // not erase the two native quote bytes at this maximum audit ID.
    const eventNative = { ...row, id: "9223372036854775807", created_at: wireStamp };
    return value.requiredUsage + eventBytes <= 61 * 1024 * 1024 && value.requiredBackupBytes + wireBytes(eventNative) + 2 <= 64 * 1024 * 1024;
  } catch { return false; }
}
