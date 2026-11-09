/** Same-client measured reminder capacity. No permission or command acceptance
 * originates here. Counterfactuals are sizing-only and never persisted. */
import { isProxy } from 'node:util/types';
import { hash, fail } from './security.mjs';
import { participationChargeJsonSQL, participationIntervalChargeJsonSQL,
  PARTICIPATION_REMINDER_LEGACY_SQL } from './participation-storage.mjs';
import { participationNativeInventory } from './participation-backup.mjs';
import { ownReminderProjectionValue } from './participation-reminder-backup.mjs';
import { validateReminderPreference, validateReminderPreviewPacket, validateReminderReceipt } from './participation-reminder-model.mjs';
import { validateReminderChoiceReceipt, reminderChoiceRevisions } from './participation-reminder-choice.mjs';
import { validateReminderEnvelope, validateReminderStoredRow, REMINDER_PREVIEW_KIND } from './participation-reminder-store.mjs';
import { reminderChoiceAuditCandidates, reminderScheduleAuditCandidate } from './participation-reminder-audit.mjs';
import { REMINDER_OUTBOX_COLUMNS } from './participation-reminder-outbox.mjs';
import { GROUP_SAFETY_SQL } from './participation-group-safety-capacity.mjs';
import { measureResourceReservationRemaining } from './resource-reservation-capacity.mjs';
import { learningOperationalOutboxProjectionSQL, LEARNING_RESTORE_CAPACITY as C,
  LEARNING_OPERATIONAL_CAPACITY as O } from './learning-capacity.mjs';

const LIMIT = Object.freeze({ ordinary: 60 * 1024 * 1024, safety: 61 * 1024 * 1024,
  native: 64 * 1024 * 1024, family: 8 * 1024 * 1024, people: 2000, outbox: 8000 });
const P_COLUMNS = 'org_id id target_id module_id booking_record_id contact_id intake_id state revision source consent frozen waitlist_sequence confirmed_at cancelled_at created_by created_at updated_at recovered recovered_state last_command delivery_consent requested_interval reminder_consent'.split(' ');
const PREVIEW_COLUMNS = 'org_id id actor_id kind payload checksum base_revision expires_at committed_at created_at'.split(' ');
const EVENT_COLUMNS = 'org_id id actor_id action record_id module_id detail created_at'.split(' ');
const bad = (code = 'participation_reminder_capacity', status = 422) => fail(status, code, 'This complete reminder operation and its remaining safe exits do not fit the current workspace limits.');
const need = v => { if (!v) bad(); };
const bytes = v => Buffer.byteLength(JSON.stringify(v));
const n = value => { need(typeof value === 'number' || typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)); const v = Number(value); need(Number.isSafeInteger(v) && v >= 0); return v; };
const sum = values => { const v = values.reduce((a, b) => a + n(b), 0); need(Number.isSafeInteger(v)); return v; };
const id = value => need(typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value));
const frozen = value => { if (value && typeof value === 'object') { for (const v of Object.values(value)) frozen(v); Object.freeze(value); } return value; };
const exact = (v, keys) => { need(v && typeof v === 'object' && !isProxy(v) && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype);
  const own = Reflect.ownKeys(v); need(own.length === keys.length && keys.every(key => own.includes(key)));
  for (const key of keys) { const d = Object.getOwnPropertyDescriptor(v, key); need(d?.enumerable && Object.hasOwn(d, 'value')); } return v; };
const rows = (r, max) => { need(r && typeof r === 'object' && !isProxy(r));
  const d = Object.getOwnPropertyDescriptor(r, 'rows'); need(d && Object.hasOwn(d, 'value'));
  const list = d.value; need(Array.isArray(list) && !isProxy(list) && Object.getPrototypeOf(list) === Array.prototype && list.length <= max);
  need(Reflect.ownKeys(list).length === list.length + 1);
  for (let n = 0; n < list.length; n++) { const item = Object.getOwnPropertyDescriptor(list, String(n)); need(item?.enumerable && Object.hasOwn(item, 'value')); }
  return list;
};
const json = v => ownReminderProjectionValue(v);

export const REMINDER_CAPACITY_SQL = Object.freeze({
  accounting: `SELECT count(*) AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0) AS raw_bytes,COALESCE(sum(octet_length(${participationIntervalChargeJsonSQL('t')}::text)),0) AS interval_bytes,COALESCE(sum(octet_length(${participationChargeJsonSQL('t')}::text)),0) AS charged_bytes,${PARTICIPATION_REMINDER_LEGACY_SQL} AS reminder_absent FROM os_participations t WHERE org_id=$1`,
  reservedPreviews: "SELECT id,payload,committed_at IS NOT NULL AS committed,octet_length(payload::text) AS payload_bytes FROM os_previews WHERE org_id=$1 AND kind='participation-reminder-v1' ORDER BY id LIMIT 37",
  choices: 'SELECT id,reminder_consent FROM os_participations WHERE org_id=$1 AND reminder_consent IS NOT NULL ORDER BY id LIMIT 2001',
  original: 'SELECT to_jsonb(t) AS row FROM os_participations t WHERE org_id=$1 AND id=$2 AND to_jsonb(t)=$3::jsonb',
  schema: "SELECT t.relname AS table_name,a.attname AS column_name FROM pg_class t JOIN pg_namespace ns ON ns.oid=t.relnamespace JOIN pg_attribute a ON a.attrelid=t.oid WHERE ns.nspname=current_schema() AND t.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY t.relname,a.attnum",
  previewUsage: 'SELECT count(*) FILTER(WHERE committed_at IS NULL) AS pending_count,COALESCE(sum(octet_length(payload::text)) FILTER(WHERE committed_at IS NULL),0) AS pending_bytes,count(*) FILTER(WHERE committed_at IS NOT NULL) AS committed_count,COALESCE(sum(octet_length(payload::text)) FILTER(WHERE committed_at IS NOT NULL),0) AS committed_bytes FROM os_previews WHERE org_id=$1',
  previewOriginal: 'SELECT octet_length(to_jsonb(t)::text) AS bytes FROM os_previews t WHERE org_id=$1 AND id=$2 AND actor_id=$3 AND kind=$4 AND committed_at IS NULL AND checksum=$5 AND payload=$6::jsonb AND base_revision=$7 AND created_at=$8::timestamptz AND expires_at=$9::timestamptz',
  previews: 'SELECT to_jsonb(r) AS row,octet_length(to_jsonb(r)::text) AS bytes,octet_length(r.payload::text) AS payload_bytes FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY a(value,n) CROSS JOIN LATERAL jsonb_populate_record(NULL::os_previews,a.value) r ORDER BY a.n',
  audits: 'SELECT to_jsonb(r) AS row,octet_length(to_jsonb(r)::text) AS bytes FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY a(value,n) CROSS JOIN LATERAL jsonb_populate_record(NULL::os_events,a.value) r ORDER BY a.n',
});

// Actual source rows are UNIONed with typed counterfactual rows, never a fake c
// or caller-supplied usage scalar. New-feature projections deliberately pay all
// NULL-column activation cost. The old interval predicate remains independent.
const PEOPLE_SOURCE = "WITH candidate AS(SELECT r.* FROM jsonb_array_elements($8::jsonb) a(value) CROSS JOIN LATERAL jsonb_populate_record(NULL::os_participations,a.value) r), source AS(SELECT t.* FROM os_participations t WHERE t.org_id=$1 AND NOT EXISTS(SELECT 1 FROM candidate p WHERE p.id=t.id) UNION ALL SELECT * FROM candidate) ";
const originalPeopleSQL = GROUP_SAFETY_SQL.participations;
if (originalPeopleSQL.split('FROM os_participations t').length !== 2 || !originalPeopleSQL.endsWith('ORDER BY t.id LIMIT 2001')) throw new Error('Reminder projection source changed.');
const PEOPLE_BODY = originalPeopleSQL.replace('FROM os_participations t', 'FROM source t').replace('ORDER BY t.id LIMIT 2001', 'ORDER BY t.created_at,t.id LIMIT 2001').split(PARTICIPATION_REMINDER_LEGACY_SQL).join('FALSE');
export const REMINDER_PEOPLE_SQL = PEOPLE_SOURCE + PEOPLE_BODY;
const outboxOp = learningOperationalOutboxProjectionSQL();
const outboxSuppress = "to_jsonb(t)||jsonb_build_object('state','cancelled','safe_code',CASE WHEN octet_length(to_jsonb(t.safe_code)::text)>octet_length(to_jsonb('authority_withdrawn'::text)::text) THEN to_jsonb(t.safe_code) ELSE to_jsonb('authority_withdrawn'::text) END,'lease_owner',NULL,'lease_until',NULL)";
export const REMINDER_OUTBOX_SQL = `WITH source AS(SELECT * FROM os_participation_outbox WHERE org_id=$1 UNION ALL SELECT r.* FROM jsonb_array_elements($8::jsonb) a(value) CROSS JOIN LATERAL jsonb_populate_record(NULL::os_participation_outbox,a.value) r) SELECT t.id,to_jsonb(t) AS row,octet_length(to_jsonb(t)::text) AS raw,GREATEST(octet_length(to_jsonb(t)::text),t.budget_bytes) AS actual,GREATEST(octet_length(to_jsonb(t)::text),t.budget_bytes,CASE WHEN $7::boolean THEN octet_length((${outboxOp})::text) ELSE 0 END) AS operational,GREATEST(octet_length(to_jsonb(t)::text),t.budget_bytes,CASE WHEN $7::boolean THEN octet_length((${outboxOp})::text) ELSE 0 END,CASE WHEN t.first_attempt_at IS NULL AND t.state IN('paused','pending','leased') THEN octet_length((${outboxSuppress})::text) ELSE 0 END) AS projected FROM source t WHERE t.org_id=$1 ORDER BY t.created_at,t.id LIMIT 8001`;

export async function measureReminderParticipationAccounting(c, org) {
  id(org); const found = rows(await c.query(REMINDER_CAPACITY_SQL.accounting, [org]), 1); need(found.length === 1);
  const r = found[0], rawBytes = n(r.raw_bytes), intervalBytes = n(r.interval_bytes), chargedBytes = n(r.charged_bytes), count = n(r.count);
  need(typeof r.reminder_absent === 'boolean' && rawBytes >= intervalBytes && intervalBytes >= chargedBytes && count <= LIMIT.people && chargedBytes <= LIMIT.family);
  if (!r.reminder_absent) need(intervalBytes === chargedBytes);
  const choices = rows(await c.query(REMINDER_CAPACITY_SQL.choices, [org]), LIMIT.people), enabledIds = [], unique = new Set();
  for (const row of choices) { id(row.id); need(!unique.has(row.id)); unique.add(row.id); const preference = validateReminderPreference(row.reminder_consent); need(preference !== null); if (preference.enabled) enabledIds.push(row.id); }
  if (choices.length) need(!r.reminder_absent);
  return frozen({ present: !r.reminder_absent, count, rawBytes, intervalCompatibilityCreditBytes: rawBytes - intervalBytes,
    reminderNullCompatibilityCreditBytes: intervalBytes - chargedBytes, chargedBytes, enabledIds });
}

async function schema(c) {
  const tables = { os_participations: P_COLUMNS, os_participation_outbox: REMINDER_OUTBOX_COLUMNS, os_previews: PREVIEW_COLUMNS, os_events: EVENT_COLUMNS };
  const list = rows(await c.query(REMINDER_CAPACITY_SQL.schema, [Object.keys(tables)]), 200), actual = new Set(), ordered = Object.fromEntries(Object.keys(tables).map(k=>[k,[]]));
  for (const row of list) { need(Object.hasOwn(tables, row.table_name) && tables[row.table_name].includes(row.column_name)); const key = row.table_name + ':' + row.column_name; need(!actual.has(key)); actual.add(key); ordered[row.table_name].push(row.column_name); }
  need(actual.size === Object.values(tables).reduce((a, x) => a + x.length, 0));
  for(const [table,columns] of Object.entries(tables)) need(ordered[table].slice().sort().join(',')===columns.slice().sort().join(','));
}
function wireRow(row) {
  const v = { ...row };
  for (const key of ['created_at', 'confirmed_at', 'cancelled_at', 'first_attempt_at', 'last_checked_at', 'provider_event_at']) if (v[key] != null) {
    const date = new Date(v[key]); need(Number.isFinite(date.getTime())); v[key] = date.toISOString();
  }
  return v;
}
const packet = (backup, changes) => { const { checksum, ...body } = backup; const value = { ...body, ...changes }; return { ...value, checksum: hash(value) }; };

async function current(c, org) {
  const { assembleWorkspaceBackup } = await import('./workspace-backup.mjs');
  const { logicalBackupBytes } = await import('./database.mjs');
  const { measureLearningOperationalCapacity } = await import('./learning-capacity.mjs');
  const { measureGroupRemainingParticipationSafety } = await import('./participation-group-safety-capacity.mjs');
  const { measureGroupCapacity } = await import('./participation-group-capacity.mjs');
  const { checkCheckInCapacity } = await import('./participant-check-in-capacity.mjs');
  const accounting = await measureReminderParticipationAccounting(c, org);
  const previewUsage = rows(await c.query(REMINDER_CAPACITY_SQL.previewUsage,[org]),1); need(previewUsage.length===1);
  const u=previewUsage[0]; need(n(u.pending_count)<=4 && n(u.committed_count)<=32 && n(u.pending_bytes)<=128*1024*1024 && n(u.committed_bytes)<=128*1024*1024);
  const previews=rows(await c.query(REMINDER_CAPACITY_SQL.reservedPreviews,[org]),36),previewIds=new Set();
  for(const row of previews){id(row.id);need(!previewIds.has(row.id));previewIds.add(row.id);need(typeof row.committed==='boolean');
    const envelope=validateReminderEnvelope(row.payload);need((envelope.state==='accepted')===row.committed);
    need(n(row.payload_bytes)<=(row.committed?16384:65536));}

  const backup = await assembleWorkspaceBackup(c, org), usage = n(await logicalBackupBytes(c, org));
  const operational = await measureLearningOperationalCapacity(c, org, backup.participation);
  const remaining = await measureGroupRemainingParticipationSafety(c, org, { backup, operational });
  const group = await measureGroupCapacity(c, org), checkins = await checkCheckInCapacity(c, org);
  const targets = rows(await c.query('SELECT * FROM os_participation_targets WHERE org_id=$1 ORDER BY target_id', [org]), 500);
  need(backup.participation.participations.length === accounting.count);
  const resources = await measureResourceReservationRemaining(c, org, backup.resourceReservations);
  return { backup, usage, accounting, operational, remaining, group, checkins, targets, previews, resources };
}

// Source-derived fixed bounds from the SAME remaining-union implementation.
// Exporting its parameters avoids a second independent OFF policy/template.
async function people(c, org, source, candidate) {
  const { participationSafetyProjectionBindings } = await import('./participation-group-safety-capacity.mjs');
  const params = participationSafetyProjectionBindings(org, [...new Set([...(source.operational.reminderChoiceIds || []), ...source.backup.participation.outbox.filter(o => ['snapshot', 'transition', 'reminder'].includes(o.intentKind)).map(o => o.participationId), ...(candidate?.reminder_consent?.enabled ? [candidate.id] : [])])]);
  const list = rows(await c.query(REMINDER_PEOPLE_SQL, [...params, JSON.stringify(candidate ? [candidate] : [])]), LIMIT.people);
  need(list.length === source.accounting.count);
  const ids = new Set(); for (const row of list) { id(row.id); need(!ids.has(row.id) && row.row.id === row.id && row.row.org_id === org && row.future_row.id === row.id && row.future_row.org_id === org); ids.add(row.id);
    for (const key of ['actual', 'actual_raw', 'operational', 'operational_raw', 'projected', 'projected_raw']) n(row[key]);
    need(n(row.projected) >= n(row.operational) && n(row.operational) >= n(row.actual) && n(row.projected_raw) >= n(row.projected) && n(row.actual_raw) >= n(row.actual)); }
  const projected = sum(list.map(r => r.projected)); need(projected <= LIMIT.family);
  return { rows: list, projected, actual: sum(list.map(r => r.actual)), raw: sum(list.map(r => r.actual_raw)), projectedRaw: sum(list.map(r => r.projected_raw)) };
}

async function outbox(c, org, source, added, active) {
  const list = rows(await c.query(REMINDER_OUTBOX_SQL, [org, C.timestamp, O.providerPhysicalTime, O.safeCode, O.attempts, 'f'.repeat(32), active, JSON.stringify(added)]), LIMIT.outbox);
  need(list.length === source.backup.participation.outbox.length + added.length);
  const ids = new Set(); for (const r of list) { id(r.id); need(!ids.has(r.id)); ids.add(r.id); exact(r.row, REMINDER_OUTBOX_COLUMNS); need(r.row.org_id === org && r.row.id === r.id);
    for (const key of ['raw', 'actual', 'operational', 'projected']) n(r[key]); need(n(r.projected) >= n(r.operational) && n(r.operational) >= n(r.actual) && n(r.actual) >= n(r.raw));
    if (r.row.intent_kind !== 'legacy') need(n(r.row.budget_bytes) > 0 && n(r.projected) <= n(r.row.budget_bytes));
    if (r.row.intent_kind === 'reminder') need(n(r.row.budget_bytes) === 8192);
  }
  const actual = sum(list.map(r => r.actual)), projected = sum(list.map(r => r.projected)); need(projected <= LIMIT.family);
  return { rows: list, actual, projected };
}

async function auditRows(c, org, audits) {
  const candidates = audits.map(event => { exact(event, ['org_id', 'actor_id', 'action', 'record_id', 'module_id', 'detail']); need(event.org_id === org); if (event.actor_id !== null) id(event.actor_id); return { ...event, id: C.auditId, created_at: C.timestamp }; });
  if (!candidates.length) return { retained: 0, native: [] };
  need(candidates.length === 1); const list = rows(await c.query(REMINDER_CAPACITY_SQL.audits, [JSON.stringify(candidates)]), 1); need(list.length === 1); exact(list[0].row, EVENT_COLUMNS);
  return { retained: n(list[0].bytes), native: [{ ...list[0].row, id: C.auditId, created_at: O.serviceTime }] };
}

async function projectedGroupNamespace(c, org, source) {
  if (!source.group.groups) return undefined;
  const { loadGroupInventory } = await import('./participation-group-store.mjs');
  const { projectGroupFutureExit } = await import('./participation-group-exit-projection.mjs');
  const { projectGroupHistory, validateGroupReceipt } = await import('./participation-group-model.mjs');
  const { makeParticipationGroupsBackup } = await import('./participation-group-backup.mjs');
  const inventory = await loadGroupInventory(c, org), used = new Set(inventory.groups.flatMap(g => g.receipts.map(r => r.commandHash))); let slot = 0;
  const histories = inventory.groups.map(group => { const future = projectGroupFutureExit({ originMode: group.originMode, orgId: org, history: group.history, receipts: group.receipts }).futureReceipts.map(receipt => {
    let key; do { need(slot < 2400); key = 'f'.repeat(56) + (slot++).toString(16).padStart(8, '0'); } while (used.has(key)); used.add(key); return validateGroupReceipt({ ...receipt, commandHash: key });
  }); return future.length ? projectGroupHistory({ originOrgId: org, receipts: [...group.receipts, ...future] }) : group.history; });
  const namespace = makeParticipationGroupsBackup(histories); need(bytes(namespace) === source.group.projectedNativeBytes); return namespace;
}

/** Same actual check-in source/model path as its existing withdrawal reserve.
 * Only the future inactive packet changes; retained authority is never copied. */
async function projectedCheckInNamespace(c, org, source) {
  const {loadCheckInInventory}=await import('./participant-check-in-store.mjs');
  const {boundedCheckInWithdrawal}=await import('./participant-check-in-capacity.mjs');
  const {makeCheckInBackup}=await import('./participant-check-in-model.mjs');
  const inventory=await loadCheckInInventory(c,org), actual=makeCheckInBackup(inventory.records);
  const future=makeCheckInBackup(inventory.records.map(record=>record.originMode==='live'&&record.revision===1?boundedCheckInWithdrawal(record):record));
  const original=source.backup.participantCheckins;
  need((actual===undefined&&original===undefined)||(actual!==undefined&&original!==undefined&&hash(actual)===hash(original)));
  const actualBytes=actual===undefined?0:bytes(actual),futureBytes=future===undefined?0:bytes(future);
  need(inventory.records.length===source.checkins.count && actualBytes===source.checkins.nativeBytes &&
    Math.max(0,futureBytes-actualBytes)===source.checkins.nativeGrowth);
  return future;
}

async function evaluate(c, org, source, { person = null, added = [], audits = [], pending = null, replacedPending = 0, mode = 'ordinary' } = {}) {
  need(mode === 'ordinary' || mode === 'safety');
  const allPeople = await people(c, org, source, person);
  const activeIds = [...new Set([...(source.operational.reminderChoiceIds || []), ...(person?.reminder_consent?.enabled ? [person.id] : [])])];
  const active = activeIds.length > 0 || added.length > 0 || source.backup.participation.outbox.some(o => ['snapshot', 'transition', 'reminder'].includes(o.intentKind));
  const boxes = await outbox(c, org, source, added, active), journal = await auditRows(c, org, audits);
  const actualBoxIds = new Set(source.backup.participation.outbox.map(o => o.id));
  const currentOutbox = sum(boxes.rows.filter(r => actualBoxIds.has(r.id)).map(r => r.actual));
  need(source.usage >= source.accounting.chargedBytes + currentOutbox + replacedPending);
  const retained = sum([source.usage - source.accounting.chargedBytes - currentOutbox - replacedPending,
    allPeople.projected, boxes.projected, source.remaining.bookingRetainedGrowth, source.remaining.policyRetainedGrowth,
    source.group.retainedGrowthBytes, source.checkins.wholeRetainedReserve, source.resources?.retainedGrowthBytes ?? 0, journal.retained, pending?.bytes || 0]);
  // Reuse already-admitted native temporal transports for source rows (including
  // extended/BC provider dates). Only new SQL6 candidate rows use Date transport.
  const originalPeople = new Map(source.backup.participation.participations.map(p => [p.id, p]));
  const originalBoxes = new Map(source.backup.participation.outbox.map(o => [o.id, o]));
  const nativePerson = (row, future = false) => { const original = originalPeople.get(row.id); need(original);
    return { ...row, created_at: original.createdAt, confirmed_at: original.confirmedAt,
      cancelled_at: original.state === 'cancelled' ? original.cancelledAt : future ? O.serviceTime : original.cancelledAt };
  };
  const actualPeopleRows = allPeople.rows.map(r => nativePerson(r.row));
  const actualBoxes = boxes.rows.map(r => { const original = originalBoxes.get(r.id); return original ? { ...r.row,
    created_at: original.createdAt, first_attempt_at: original.attemptedAt, last_checked_at: original.lastCheckedAt,
    provider_event_at: original.providerEventAt } : wireRow(r.row); });
  const actualParticipation = participationNativeInventory(source.targets, actualPeopleRows, actualBoxes);
  const actualPacket = packet(source.backup, { participation: actualParticipation, events: [...(source.backup.events || []), ...journal.native] });
  const { operationalGrowth } = await import('./learning-capacity.mjs');
  const growth = operationalGrowth(actualParticipation, { reminderChoiceIds: activeIds });
  const futureParticipation = participationNativeInventory(source.targets, allPeople.rows.map(r => nativePerson(r.future_row, true)), actualBoxes);
  let personGrowth = 0;
  const futureById = new Map(futureParticipation.participations.map(p => [p.id, p]));
  for (const p of actualParticipation.participations) { const op = growth.affectedParticipationIds.includes(p.id) ? { ...p, revision: Math.max(p.revision, O.attempts) } : p;
    personGrowth += Math.max(bytes(p), bytes(op), bytes(futureById.get(p.id))) - bytes(p); }
  const futureBoxes = actualParticipation.outbox.map(o => {
    if (growth.active) { const b = growth.outboxBounds.find(b => b.id === o.id); need(b); return { ...o, state: b.state, safeCode: b.safeCode,
      attempts: b.attempts, attemptedAt: b.attemptedAt, lastCheckedAt: b.lastCheckedAt, providerEventAt: b.providerEventAt }; }
    if (o.attemptedAt === null && ['paused', 'pending', 'leased'].includes(o.state)) return { ...o, state: 'cancelled', safeCode: bytes(o.safeCode) > bytes('authority_withdrawn') ? o.safeCode : 'authority_withdrawn' };
    return o;
  });
  const outboxGrowth = Math.max(0, bytes(futureBoxes) - bytes(actualParticipation.outbox));
  need(bytes(actualParticipation.targets)<=LIMIT.family && bytes(actualParticipation.participations)+personGrowth<=LIMIT.family &&
    bytes(actualParticipation.outbox)+outboxGrowth<=LIMIT.family);
  const requiredBackupBytes = sum([bytes(actualPacket), personGrowth, outboxGrowth, source.remaining.bookingNativeGrowth,
    source.remaining.policyNativeGrowth, source.group.nativeGrowthBytes, source.checkins.wholeNativeReserve, source.resources?.nativeGrowthBytes ?? 0]);
  need(retained <= LIMIT[mode] && requiredBackupBytes <= LIMIT.native);
  const metrics = { requiredUsage: retained, requiredBackupBytes, actualProspectiveBackupBytes: bytes(actualPacket),
    accounting: source.accounting, actualExistingOutboxChargedBytes: currentOutbox, projectedOutboxChargedBytes: boxes.projected,
    remainingByFamily: { bookingRetainedBytes: source.remaining.bookingRetainedGrowth, policyRetainedBytes: source.remaining.policyRetainedGrowth,
      groupRetainedBytes: source.group.retainedGrowthBytes, checkInRetainedBytes: source.checkins.wholeRetainedReserve,
      bookingNativeBytes: source.remaining.bookingNativeGrowth, policyNativeBytes: source.remaining.policyNativeGrowth,
      groupNativeBytes: source.group.nativeGrowthBytes, checkInNativeBytes: source.checkins.wholeNativeReserve },
    prospectiveParticipationChargedBytes: allPeople.actual, prospectiveParticipationRawBytes: allPeople.raw,
    projectedParticipationChargedBytes: allPeople.projected, projectedParticipationRawBytes: allPeople.projectedRaw,
    lostReminderNullCreditBytes: source.accounting.reminderNullCompatibilityCreditBytes, actualProspectivePacketSha256: hash(actualPacket),
    replacedPendingBytes: replacedPending, pendingCompositeBytes: pending?.bytes || 0, mandatoryAuditBytes: journal.retained,
    ...(source.resources ? { resourceReservations: source.resources } : {}) };
  if (mode === 'ordinary') {
    const { checkLearningRestoreCapacity } = await import('./learning-capacity.mjs');
    const namespace = await projectedGroupNamespace(c, org, source), checkInNamespace=await projectedCheckInNamespace(c,org,source);
    const futurePacket = packet(actualPacket, { ...(namespace === undefined ? {} : { participationGroups: namespace }),
      ...(checkInNamespace===undefined?{}:{participantCheckins:checkInNamespace}),
      participation: { ...futureParticipation, outbox: futureBoxes } });
    const actualInactive = await checkLearningRestoreCapacity(c, actualPacket), futureInactive = await checkLearningRestoreCapacity(c, futurePacket);
    metrics.actualInactive = actualInactive; metrics.futureInactive = futureInactive;
  }
  return frozen(metrics);
}

async function retainedPreview(c, row) {
  const r = validateReminderStoredRow(row); need(r.payload.state === 'pending');
  const list = rows(await c.query(REMINDER_CAPACITY_SQL.previewOriginal, [r.org_id, r.id, r.actor_id, REMINDER_PREVIEW_KIND,
    r.checksum, JSON.stringify(r.payload), r.base_revision, r.created_exact, r.expires_exact]), 1);
  need(list.length === 1); return n(list[0].bytes);
}
async function previewCandidate(c, row, replace = false) {
  exact(row, PREVIEW_COLUMNS); const list = rows(await c.query(REMINDER_CAPACITY_SQL.previews, [JSON.stringify([row])]), 1); need(list.length === 1); const value = list[0];
  const usage = rows(await c.query(REMINDER_CAPACITY_SQL.previewUsage, [row.org_id]), 1); need(usage.length === 1); const u = usage[0];
  const committed = row.committed_at !== null;
  if (!committed) need(n(u.pending_count) + (replace ? 0 : 1) <= 4 && n(value.payload_bytes) <= 65536 && n(u.pending_bytes) + n(value.payload_bytes) <= 128 * 1024 * 1024);
  need(n(u.committed_count) + 1 <= 32 && n(u.committed_bytes) + n(value.payload_bytes) <= 128 * 1024 * 1024);
  if (committed) need(n(value.payload_bytes) <= 16384);
  return { bytes: n(value.bytes), payloadBytes: n(value.payload_bytes) };
}

/** Sizing-only identity slots, same legal byte widths; never persisted or used
 * as accepted command authority. Imported history may already own probe IDs. */
export function reminderSizingIdentities(inputRows, inputReceipt, occupiedIds) {
  const candidates = json(inputRows), receipt = validateReminderReceipt(inputReceipt), occupied = json(occupiedIds);
  need(Array.isArray(candidates) && Array.isArray(occupied) && occupied.length <= LIMIT.outbox);
  const used = new Set(); for (const key of occupied) { id(key); need(!used.has(key)); used.add(key); }
  let slot = 1; const changed = new Map();
  const output = candidates.map(row => { exact(row, REMINDER_OUTBOX_COLUMNS); need(typeof row.id === 'string' && /^[a-f0-9]{32}$/.test(row.id));
    let key = row.id; if (used.has(key)) { do { need(slot <= LIMIT.outbox + 20); key = (slot++).toString(16).padStart(32, '0'); } while (used.has(key)); }
    need(!changed.has(row.id)); changed.set(row.id, key); used.add(key);
    return { ...row, id: key, relay_key: 'participation-reminder-' + key };
  });
  need(output.length === receipt.result.scheduledCount);
  const result = validateReminderReceipt({ ...receipt, result: { ...receipt.result,
    scheduled: receipt.result.scheduled.map(item => { const key = changed.get(item.outboxId); need(key); return { ...item, outboxId: key }; }) } });
  return frozen({ rows: output, receipt: result });
}

/** Closed server-internal phase grammar. No request body or callback can choose
 * a capacity override; the caller must prove fresh authority separately. */
export async function requireReminderMeasuredCapacity(c, org, input) {
  id(org); need(input && !isProxy(input)); const phase = Object.getOwnPropertyDescriptor(input, 'phase'); need(phase?.enumerable && Object.hasOwn(phase, 'value'));
  const schemas = {
    'choice-before-write': ['phase', 'enabled', 'audits', 'participation', 'participationRevision', 'preference', 'atExact', 'receiptVariants'],
    'choice-final': ['phase', 'enabled', 'participationId'], 'preview-before-id': ['phase', 'packet', 'access', 'audits'],
    'preview-final': ['phase', 'previewId'], 'schedule-before-id': ['phase', 'row', 'atExact', 'audits', 'proposedRows', 'receipt'], 'schedule-final': ['phase', 'previewId'],
  };
  need(typeof phase.value === 'string');
  need(Object.hasOwn(schemas, phase.value)); exact(input, schemas[phase.value]); input = json(input); await schema(c);
  const source = await current(c, org);
  if (phase.value.endsWith('-final')) {
    need(source.accounting.present);
    if (phase.value === 'choice-final') { need(typeof input.enabled === 'boolean'); id(input.participationId);
      const actualChoices=rows(await c.query(REMINDER_CAPACITY_SQL.choices,[org]),LIMIT.people),found=actualChoices.find(row=>row.id===input.participationId);
      need(found && validateReminderPreference(found.reminder_consent)?.enabled===input.enabled);
    } else {id(input.previewId);const found=source.previews.find(row=>row.id===input.previewId);
      need(found && found.committed===(phase.value==='schedule-final'));} 
    return evaluate(c, org, source, { mode: phase.value === 'choice-final' && input.enabled === false ? 'safety' : 'ordinary' });
  }
  if (phase.value === 'choice-before-write') {
    need(typeof input.enabled === 'boolean'); const original = json(input.participation); exact(original, P_COLUMNS); need(original.org_id === org); id(original.id);
    const match = rows(await c.query(REMINDER_CAPACITY_SQL.original, [org, original.id, JSON.stringify(original)]), 1); need(match.length === 1);
    const preference = validateReminderPreference(input.preference); need(preference?.enabled === input.enabled && preference.atExact === input.atExact);
    const priorPreference = validateReminderPreference(original.reminder_consent);
    if (!input.enabled) need(priorPreference?.enabled === true);
    const revisions=reminderChoiceRevisions(original.revision,priorPreference?.revision??0,input.enabled,priorPreference?.enabled===true);
    need(input.participationRevision===revisions.participation && preference.revision===revisions.preference);
    need(Number.isSafeInteger(input.participationRevision) && input.participationRevision >= 1 && input.participationRevision <= O.attempts);
    const choices = input.receiptVariants.map(validateReminderChoiceReceipt); need(choices.length === (input.enabled ? 1 : 2));
    need(new Set(choices.map(r => r.result.auditRetained)).size === choices.length && (!input.enabled || choices[0].result.auditRetained));
    need(input.audits.length === (input.enabled ? 1 : 2));
    const expectedAudits = reminderChoiceAuditCandidates({ org, actorId: input.audits[0]?.actor_id, participationId: original.id, enabled: input.enabled });
    need(hash(input.audits) === hash(expectedAudits));
    const results = [];
    for (const receipt of choices) {
      need(receipt.result.participationId === original.id && receipt.result.revision === input.participationRevision && receipt.acceptedAtExact === input.atExact && receipt.result.reminder.enabled === input.enabled && receipt.result.reminder.revision === preference.revision && receipt.result.reminder.atExact === preference.atExact);
      const audits = receipt.result.auditRetained ? json(input.audits) : [null];
      for (const audit of audits) results.push(await evaluate(c, org, source, { person: { ...original, reminder_consent: preference,
        revision: input.participationRevision, updated_at: input.atExact, last_command: receipt }, audits: audit ? [audit] : [], mode: input.enabled ? 'ordinary' : 'safety' }));
    }
    return frozen({ phase: phase.value, variants: results });
  }
  if (phase.value === 'preview-before-id') {
    const p = validateReminderPreviewPacket(input.packet); need(p.orgId === org && json(input.audits).length === 0);
    const envelope = validateReminderEnvelope({ version: 1, state: 'pending', packet: p, access: input.access });
    const row = { org_id: org, id: p.previewId, actor_id: p.actorId, kind: REMINDER_PREVIEW_KIND, payload: envelope,
      checksum: hash(envelope), base_revision: hash(envelope.access), expires_at: p.expiresAtExact, committed_at: null, created_at: p.issuedAtExact };
    const pending = await previewCandidate(c, row); return evaluate(c, org, source, { pending });
  }
  const row = validateReminderStoredRow(input.row); let receipt = validateReminderReceipt(input.receipt);
  need(row.org_id === org && row.payload.state === 'pending' && receipt.previewId === row.id && receipt.acceptedAtExact === input.atExact);
  let added = json(input.proposedRows); need(Array.isArray(added) && added.length === receipt.result.scheduledCount && added.length >= 1 && added.length <= 20);
  for (const [index, r] of added.entries()) { exact(r, REMINDER_OUTBOX_COLUMNS); need(r.org_id === org && r.intent_kind === 'reminder' && r.budget_bytes === 8192 && r.id === receipt.result.scheduled[index].outboxId && r.participation_id === receipt.result.scheduled[index].participationId); }
  const normalized = reminderSizingIdentities(added, receipt, source.backup.participation.outbox.map(o => o.id));
  added = normalized.rows; receipt = normalized.receipt;
  need(hash(input.audits) === hash([reminderScheduleAuditCandidate({ org, actorId: receipt.actorId, previewId: receipt.previewId,
    participationIds: receipt.result.scheduled.map(s => s.participationId) })]));
  const envelope = validateReminderEnvelope({ version: 1, state: 'accepted', receipt, access: row.payload.access });
  await previewCandidate(c, { org_id: org, id: row.id, actor_id: row.actor_id, kind: REMINDER_PREVIEW_KIND, payload: envelope,
    checksum: hash(envelope), base_revision: row.base_revision, expires_at: row.expires_exact, committed_at: input.atExact, created_at: row.created_exact }, true);
  const replacedPending = await retainedPreview(c, row); need(json(input.audits).length === 1);
  return evaluate(c, org, source, { added, audits: json(input.audits), replacedPending });
}

export async function checkReminderOrdinaryCapacity(c, org) { if (!(await measureReminderParticipationAccounting(c, org)).present) return null; const source = await current(c, org); return evaluate(c, org, source); }
export async function checkReminderSafetyCapacity(c, org) { if (!(await measureReminderParticipationAccounting(c, org)).present) return null; const source = await current(c, org); return evaluate(c, org, source, { mode: 'safety' }); }
export async function canRetainReminderSafetyAudit(c, org, event) {
  try { if (!(await measureReminderParticipationAccounting(c, org)).present) return true; const source = await current(c, org); return Boolean(await evaluate(c, org, source, { audits: [json(event)], mode: 'safety' })); }
  catch { return false; }
}

/** Optional existing 21-field notice. Its INSERT defaults are measured through
 * the existing fixed typed builder; failure omits it, never spends OFF space. */
export async function canRetainReminderParticipationNotice(c, org, input) {
  try {
    if (!(await measureReminderParticipationAccounting(c, org)).present) return true;
    const {validateGroupParticipationNotice,GROUP_NOTICE_SQL}=await import('./participation-group-safety-capacity.mjs');
    const candidate=validateGroupParticipationNotice(input,org), source=await current(c,org);
    need(source.backup.participation.outbox.length < LIMIT.outbox);
    const found=rows(await c.query(GROUP_NOTICE_SQL,[org,C.timestamp,O.providerPhysicalTime,O.safeCode,O.attempts,'f'.repeat(32),JSON.stringify(candidate)]),1);
    need(found.length===1); const row=json(found[0].row); exact(row,REMINDER_OUTBOX_COLUMNS);
    need(row.org_id===org && Object.keys(candidate).every(key=>hash(row[key])===hash(candidate[key])));
    return Boolean(await evaluate(c,org,source,{added:[row],mode:'safety'}));
  } catch {return false;}
}
