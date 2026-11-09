import { validateReminderPreference } from './participation-reminder-model.mjs';
import {planRestoredParticipationRecurrenceReports,participationRecurrenceRestoreSummary,isParticipationRecurrenceRecoveryFamily,PARTICIPATION_RECURRENCE_REPORT_LIMITS} from './participation-recurrence-recovery.mjs';
import { participationChargeJsonSQL, participationIntervalChargeJsonSQL, legacyRecoveredParticipation } from "./participation-storage.mjs";
/** Read-only projection of the actual full-restore representation, never restore authority. */
import { makeBackup, validateBackup, restoredIntegrations } from './backup.mjs';
import { restoredIntake, exportIntake } from './intake-backup.mjs';
import { restoredParticipation, exportParticipation } from './participation-backup.mjs';
import { restoredDelivery, exportDelivery } from './participation-delivery-backup.mjs';
import { restoredTaskRecurrence, exportTaskRecurrence } from './task-recurrence-backup.mjs';
import { restoredDirectoryResources, exportDirectoryResources } from './directory-resource-backup.mjs';
import { restoredLearningBridge, measureLearningBackup, exportLearningBridge, isLearningReportFamily } from './learning-backup.mjs';
import { validateFile, FILE_QUOTA } from './files.mjs';
import { fail, clean } from './security.mjs';
import { rowRecord, logicalBackupBytes } from './database.mjs';
import { learningId, learningFreeze } from './learning-json.mjs';
import { DIRECTORY_LIMITS } from './directory-catalog.mjs';
import { directoryPrivateHash } from './directory-resource-model.mjs';
import { END_GROWTH_RESERVE_BYTES } from './task-recurrence.mjs';
import { participationQuota, PARTICIPATION_LIMITS } from './participation.mjs';
import { DELIVERY_CONSENT_VERSION } from './participation-delivery.mjs';
import { participationTimestampParameter } from './participation-timestamp.mjs';
import { restoredIncubatorBridge, measureIncubatorBackup, exportIncubatorBridge } from './incubator-bridge-backup.mjs';
import { restoredParticipantCheckins, exportParticipantCheckins } from './participant-check-in-backup.mjs';
import { checkInStorageRow } from './participant-check-in-store.mjs';
import { CHECK_IN_LIMITS } from './participant-check-in-model.mjs';
import { restoredParticipationGroups } from './participation-group-recovery.mjs';
import { makeParticipationGroupsBackup } from './participation-group-backup.mjs';
import { GROUP_LIMITS } from './participation-group-model.mjs';
import { planRestoredFieldResponseReports, fieldResponseRestoreSummary, isFieldResponseRecoveryFamily } from './field-response-recovery.mjs';
import { planRestoredContactReconciliationReports, contactReconciliationRestoreSummary, isContactReconciliationRecoveryFamily } from './contact-reconciliation-recovery.mjs';

import { restoredResourceReservations, resourceReservationRestoreSummary } from './resource-reservation-backup.mjs';
import { measureResourceReservationRestore } from './resource-reservation-capacity.mjs';
import { measureFeedbackIntakeRestore } from './feedback-intake-capacity.mjs';
import { isVolunteerSubstitutionNativeReport, planRestoredVolunteerSubstitutionReports } from './volunteer-substitution-native.mjs';
import { VOLUNTEER_SUBSTITUTION_STORAGE_LIMITS } from './volunteer-substitution-store.mjs';

export const LEARNING_RESTORE_CAPACITY = Object.freeze({ logicalBytes: 60 * 1024 * 1024, backupBytes: 64 * 1024 * 1024,
  auditCheckReserveBytes: 1000, worstOrgId: 'o'.repeat(100), worstActorId: 'u'.repeat(100),
  timestamp: '2200-12-31T23:59:59.999999Z', auditId: '9223372036854775807', archiveId: 'a'.repeat(32) });
const C = LEARNING_RESTORE_CAPACITY, wireTime = new Date(C.timestamp).toISOString();
export const LEARNING_OPERATIONAL_CAPACITY = Object.freeze({ attempts: 2147483647, state: 'suppressed',
  safeCode: 'a'.repeat(100), serviceTime: wireTime, providerTime: '+100000-12-31T23:59:59.999Z', providerPGTime: '100000-12-31T23:59:59.999Z',
  providerPhysicalTime: '0002-12-31T23:59:59.999999+00:00 BC', providerPhysicalWireTime: '-000001-12-31T23:59:59.999Z' });
const O = LEARNING_OPERATIONAL_CAPACITY, compactBytes = value => Buffer.byteLength(JSON.stringify(value));
const wider = (actual, bound) => compactBytes(actual ?? null) > compactBytes(bound) ? actual : bound;
function portableOutboxBound(value, bound, { restored = false } = {}) {
  return { ...value, state: restored ? value.state : bound.state, safeCode: wider(value.safeCode, bound.safeCode),
    attempts: Math.max(value.attempts || 0, bound.attempts), attemptedAt: wider(value.attemptedAt, bound.attemptedAt),
    lastCheckedAt: wider(value.lastCheckedAt, bound.lastCheckedAt), providerEventAt: wider(value.providerEventAt, bound.providerEventAt),
    ...(restored ? { recoveredState: wider(value.recoveredState, O.state) } : {}) };
}
/** Separate hypothetical metadata only. Never changes the source object, its checksum or any payload/proof. */
export function operationalGrowth(participation, { reminderChoiceIds = [] } = {}) {
  const outbox = participation?.outbox ?? [], participations = participation?.participations ?? [];
  if (!Array.isArray(outbox) || !Array.isArray(participations)) badSchema();
  if (!Array.isArray(reminderChoiceIds) || reminderChoiceIds.length > 2000 || reminderChoiceIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id))) badSchema();
  const affectedParticipationIds = [...new Set([...outbox.filter(value => ['snapshot', 'transition', 'reminder'].includes(value.intentKind)).map(value => value.participationId), ...reminderChoiceIds])].sort();
  const active = affectedParticipationIds.length > 0, ids = new Set(affectedParticipationIds);
  const outboxBounds = active ? outbox.map(value => ({ id: value.id, state: O.state, safeCode: O.safeCode,
    attempts: Math.max(value.attempts || 0, O.attempts), attemptedAt: wider(value.attemptedAt, O.serviceTime),
    lastCheckedAt: wider(value.lastCheckedAt, O.serviceTime), providerEventAt: wider(value.providerEventAt, O.providerTime) })) : [];
  const boundedOutbox = active ? outbox.map((value, index) => portableOutboxBound(value, outboxBounds[index])) : outbox;
  const boundedParticipations = active ? participations.map(value => ids.has(value.id) ? { ...value, revision: Math.max(value.revision || 1, O.attempts) } : value) : participations;
  const sourceOutboxWireBytes = compactBytes(boundedOutbox), sourceParticipationWireBytes = compactBytes(boundedParticipations);
  const sourceOutboxWireGrowthBytes = sourceOutboxWireBytes - compactBytes(outbox), sourceParticipationWireGrowthBytes = sourceParticipationWireBytes - compactBytes(participations);
  return frozen({ active, affectedParticipationIds, outboxBounds, sourceOutboxWireBytes, sourceParticipationWireBytes,
    sourceOutboxWireGrowthBytes, sourceParticipationWireGrowthBytes, sourceWireGrowthBytes: sourceOutboxWireGrowthBytes + sourceParticipationWireGrowthBytes });
}
const operationalFailure = () => fail(422, 'learning_operational_capacity', 'The existing delivery metadata cannot fit its bounded future status changes within the current workspace and participation limits.');
const longerJSONB = (key, bound) => `(CASE WHEN octet_length((to_jsonb(t)->'${key}')::text)>octet_length((${bound})::text) THEN to_jsonb(t)->'${key}' ELSE ${bound} END)`;
/** Fixed server-only SQL fragments shared with group safety measurement.
 * Alias and parameter positions are literal; callers supply no expressions. */
export function learningOperationalParticipationProjectionSQL() {
  const base = `to_jsonb(t)||jsonb_build_object('revision',${longerJSONB('revision', 'to_jsonb($3::integer)')},'updated_at',${longerJSONB('updated_at', 'to_jsonb($2::timestamptz)')})`;
  const reminderOff = `CASE WHEN t.reminder_consent->'enabled'='true'::jsonb THEN jsonb_build_object('version','participation-reminder-v1','enabled',false,'revision',$3::integer,'atExact','${C.timestamp}'::text) ELSE to_jsonb(t.reminder_consent) END`;
  const changed = `(${base})||jsonb_build_object('delivery_consent',jsonb_build_object('version',$4::text,'enabled',false,'revision',$3::integer,'at',$5::text),'reminder_consent',${reminderOff})`;
  return Object.freeze({ base, changed });
}
/** The same fixed operational envelope also measures an optional notice before
 * INSERT. No caller can supply an alias, expression or parameter position. */
export function learningOperationalOutboxProjectionSQL() {
  const mutable = { state: "to_jsonb('suppressed'::text)", safe_code: 'to_jsonb($4::text)', attempts: 'to_jsonb($5::integer)',
    first_attempt_at: 'to_jsonb($2::timestamptz)', last_checked_at: 'to_jsonb($2::timestamptz)', provider_event_at: "(CASE WHEN octet_length(to_jsonb($3::timestamptz)::text)>octet_length(to_jsonb($2::timestamptz)::text) THEN to_jsonb($3::timestamptz) ELSE to_jsonb($2::timestamptz) END)",
    lease_owner: 'to_jsonb($6::text)', lease_until: 'to_jsonb($2::timestamptz)', next_at: 'to_jsonb($2::timestamptz)' };
  const fields = Object.entries(mutable).flatMap(([key, value]) => [`'${key}'`, longerJSONB(key, value)]).join(',');
  return `to_jsonb(t)||jsonb_build_object(${fields})`;
}
/** Actual current-tenant PG rows; SELECT only, including legacy positive growth without a prepaid budget. */
export async function measureLearningOperationalCapacity(c, org, participation) {
  const choices = (await c.query("SELECT id,reminder_consent FROM os_participations WHERE org_id=$1 AND reminder_consent IS NOT NULL ORDER BY id LIMIT 2001", [org])).rows;
  if (!Array.isArray(choices) || choices.length > 2000) operationalFailure();
  const reminderChoiceIds = [], choiceIds = new Set();
  for (const row of choices) {
    if (typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(row.id) || choiceIds.has(row.id)) operationalFailure();
    choiceIds.add(row.id); let preference;
    try { preference = validateReminderPreference(row.reminder_consent); } catch { operationalFailure(); }
    if (!preference) operationalFailure();
    if (preference.enabled) reminderChoiceIds.push(row.id);
  }
  const growth = operationalGrowth(participation, { reminderChoiceIds });
  if (!growth.active) return frozen({ active: false, affectedParticipations: 0, reminderChoiceIds,
    sourceLogicalGrowthBytes: 0, sourceParticipationGrowthBytes: 0, sourceParticipationRawGrowthBytes: 0,
    sourceOutboxGrowthBytes: 0, sourceWireGrowthBytes: 0, sourceOutboxWireBytes: growth.sourceOutboxWireBytes, sourceParticipationWireBytes: growth.sourceParticipationWireBytes,
    sourceOutboxBytes: 0, sourceParticipationBytes: 0, nonlegacyRows: 0, maxNonlegacyRowBytes: 0 });
  const rows = (await c.query(`SELECT id,intent_kind,budget_bytes,octet_length(to_jsonb(t)::text) AS actual,octet_length((${learningOperationalOutboxProjectionSQL()})::text) AS projected FROM os_participation_outbox t WHERE org_id=$1`, [org, C.timestamp, O.providerPhysicalTime, O.safeCode, O.attempts, 'f'.repeat(32)])).rows;
  let sourceOutboxGrowthBytes = 0, sourceOutboxBytes = 0, nonlegacyRows = 0, maxNonlegacyRowBytes = 0;
  for (const value of rows) {
    const actual = Number(value.actual), projected = Number(value.projected), budget = Number(value.budget_bytes) || 0;
    if (![actual, projected, budget].every(Number.isSafeInteger) || actual < 0 || projected < actual || budget < 0) operationalFailure();
    if (value.intent_kind !== 'legacy' && (budget <= 0 || projected > budget)) operationalFailure();
    if (value.intent_kind !== 'legacy') { nonlegacyRows++; maxNonlegacyRowBytes = Math.max(maxNonlegacyRowBytes, projected); }
    const charged = Math.max(actual, budget), future = Math.max(projected, budget);
    sourceOutboxGrowthBytes += Math.max(0, future - charged); sourceOutboxBytes += future;
  }
  const { base, changed } = learningOperationalParticipationProjectionSQL();
  const people = (await c.query(`SELECT octet_length(${participationChargeJsonSQL("t")}::text) AS actual,GREATEST(octet_length(${participationChargeJsonSQL("r")}::text),octet_length(${participationChargeJsonSQL("p")}::text)) AS projected,octet_length(to_jsonb(t)::text) AS actual_raw,GREATEST(octet_length(to_jsonb(r)::text),octet_length(to_jsonb(p)::text)) AS projected_raw FROM os_participations t CROSS JOIN LATERAL jsonb_populate_record(NULL::os_participations,${base}) r CROSS JOIN LATERAL jsonb_populate_record(NULL::os_participations,${changed}) p WHERE t.org_id=$1 AND t.id=ANY($6::text[])`, [org, C.timestamp, O.attempts, DELIVERY_CONSENT_VERSION, O.serviceTime, growth.affectedParticipationIds])).rows;
  if (people.length !== growth.affectedParticipationIds.length) operationalFailure();
  let sourceParticipationGrowthBytes = 0, sourceParticipationRawGrowthBytes = 0;
  for (const row of people) {
    const values = [row.actual, row.projected, row.actual_raw, row.projected_raw].map(Number);
    if (!values.every(Number.isSafeInteger) || values.some(n => n < 0) || values[1] < values[0] || values[3] < values[2] || values[2] < values[0] || values[3] < values[1]) operationalFailure();
    sourceParticipationGrowthBytes += values[1] - values[0]; sourceParticipationRawGrowthBytes += values[3] - values[2];
  }
  const sourceParticipationBytes = Number((await c.query(`SELECT COALESCE(sum(octet_length(${participationChargeJsonSQL("t")}::text)),0) AS bytes FROM os_participations t WHERE org_id=$1`, [org])).rows[0].bytes) + sourceParticipationGrowthBytes;
  if (sourceOutboxBytes > PARTICIPATION_LIMITS.outboxBytes || sourceParticipationBytes > PARTICIPATION_LIMITS.participationBytes ||
      growth.sourceOutboxWireBytes > PARTICIPATION_LIMITS.outboxBytes || growth.sourceParticipationWireBytes > PARTICIPATION_LIMITS.participationBytes) operationalFailure();
  return frozen({ active: true, affectedParticipations: growth.affectedParticipationIds.length, reminderChoiceIds,
    sourceLogicalGrowthBytes: sourceParticipationGrowthBytes + sourceOutboxGrowthBytes,
    sourceParticipationGrowthBytes, sourceParticipationRawGrowthBytes, sourceOutboxGrowthBytes, sourceWireGrowthBytes: growth.sourceWireGrowthBytes,
    sourceOutboxWireBytes: growth.sourceOutboxWireBytes, sourceParticipationWireBytes: growth.sourceParticipationWireBytes, sourceOutboxBytes, sourceParticipationBytes,
    nonlegacyRows, maxNonlegacyRowBytes });
}
const columns = Object.freeze(Object.fromEntries(Object.entries({
  os_participation_checkins: 'org_id id origin_mode revision live_participation_id history report_receipt withdrawn_at withdrawal_receipt created_at updated_at',
  os_participation_groups: 'org_id id origin_mode module_id live_target_id roster_ids coordinator_intake_id state revision last_command_hash history created_at updated_at',
  os_participation_group_receipts: 'org_id command_hash group_id receipt',
  os_records: 'org_id id module_id data status owner_id last_editor_id revision approval snapshot source deleted_at created_at updated_at',
  os_events: 'org_id id actor_id action record_id module_id detail created_at',
  os_integrations: 'org_id id provider name config encrypted_token revision status last_checked_at last_error created_at',
  os_publications: 'org_id id record_id source_revision kind target_id target_module target_revision schema created_by created_at withdrawn_at',
  os_intake: 'org_id id publication_id answers consent_at status revision idempotency_hash payload_hash receipt_hash ip_hash reviewed_by reviewed_at converted_ids created_at updated_at erased_at cancelled_at',
  os_participation_targets: 'org_id target_id module_id revision mode source_revision terms terms_hash recovery_block created_by created_at updated_at last_command',
  os_participations: 'org_id id target_id module_id booking_record_id contact_id intake_id state revision source consent frozen waitlist_sequence confirmed_at cancelled_at created_by created_at updated_at recovered recovered_state last_command delivery_consent requested_interval reminder_consent',
  os_participation_outbox: 'org_id id participation_id event_revision purpose channel state payload created_at participation_revision intent_kind consent_revision consent_copy user_id link_id link_revision recipient_hash policy_epoch template_version relay_key payload_hash first_attempt_at attempts lease_owner lease_until next_at last_checked_at safe_code provider_event_at budget_bytes recovered_state',
  os_participation_delivery_policies: 'org_id revision enabled epoch activated_at template_version last_command updated_at',
  os_task_recurrence_series: 'org_id id root_record_id method anchor state revision tip_record_id tip_sequence created_by created_at ended_at end_code recovered_state budget_bytes last_end_command',
  os_task_recurrence_occurrences: 'org_id series_id sequence source_record_id generated_record_id accepted_command_hash packet',
  os_resource_directory_history: 'org_id id row_kind capture_id binding_id sequence resource_id catalog_kind listing_id origin_mode command_hash request_hash actor_binding_hash payload budget_bytes created_at',
  os_learning_history: 'org_id id row_kind origin_mode origin_org_id binding_id sequence source_version program_id payload receipt budget_bytes created_at',
  os_incubator_history: 'org_id id row_kind origin_mode origin_org_id binding_id sequence source_version program_id payload receipt budget_bytes created_at',
}).map(([table, value]) => [table, Object.freeze(value.split(' '))])));
const badSchema = () => fail(422, 'learning_capacity_schema', 'The restore capacity projection must be updated for this database schema before accepting learning changes.');
const over = () => fail(422, 'learning_restore_capacity', 'This complete workspace cannot fit a restored copy, including ordinary restore history, within the existing 60 MiB storage and 64 MiB backup limits.');
const fieldReportColumns = Object.freeze('org_id id created_by title checksum payload created_at'.split(' '));
const row = (table, values) => Object.fromEntries((table==='os_reports'?fieldReportColumns:columns[table]).map(key => [key, values[key] ?? null]));
const frozen = learningFreeze;

async function schemaCheck(c, reportsPresent=false) {
  const required=reportsPresent?{...columns,os_reports:fieldReportColumns}:columns;
  const result = await c.query("SELECT t.relname AS table_name,a.attname AS column_name FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_attribute a ON a.attrelid=t.oid WHERE n.nspname=current_schema() AND t.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY t.relname,a.attnum", [Object.keys(required)]);
  const actual = new Map();
  for (const item of result.rows) { if (!actual.has(item.table_name)) actual.set(item.table_name, []); actual.get(item.table_name).push(item.column_name); }
  for (const [table, expected] of Object.entries(required))
    if (JSON.stringify([...(actual.get(table) ?? [])].sort()) !== JSON.stringify([...expected].sort())) badSchema();
}
async function measure(c, table, rows, legacyParticipation = false, reminderHistory = false) {
  if (!rows.length) return [];
  // Composite JSON timestamp transport only: payload/data/proof objects retain their exact original strings.
  const sqlRows = rows.map(value => Object.fromEntries(Object.entries(value).map(([key, field]) => [key,
    typeof field === 'string' && key.endsWith('_at') ? participationTimestampParameter(field) : field])));
  const interval = table === 'os_participations' && legacyParticipation ? "(to_jsonb(r)-'requested_interval')" : 'to_jsonb(r)';
  const charged = table === 'os_participations' && !reminderHistory ? `(${interval})-'reminder_consent'` : interval;
  const result = await c.query(`SELECT item.ordinality::integer AS position,octet_length((${charged})::text) AS bytes${table === 'os_participations' ? `,octet_length(to_jsonb(r)::text) AS raw_bytes,octet_length((${interval})::text) AS interval_bytes` : ''}${table === 'os_records' ? ',octet_length(r.data::text) AS data_bytes' : ''}${table === 'os_participation_groups' ? ',octet_length(r.history::text) AS history_bytes' : ''} FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS item(value,ordinality) CROSS JOIN LATERAL jsonb_populate_record(NULL::${table},item.value) AS r ORDER BY item.ordinality`, [JSON.stringify(sqlRows)]);
  if (result.rows.length !== rows.length) badSchema();
  return result.rows.map((value, index) => {
    if (Number(value.position) !== index + 1 || !Number.isSafeInteger(Number(value.bytes)) || Number(value.bytes) < 0) badSchema();
    if (table === 'os_participation_groups' && (!Number.isSafeInteger(value.history_bytes) || value.history_bytes < 1 || value.history_bytes > GROUP_LIMITS.historyBytes)) over();
    const rawBytes = Number(value.raw_bytes ?? value.bytes), intervalBytes = Number(value.interval_bytes ?? value.bytes), chargedBytes = Number(value.bytes);
    if (![rawBytes, intervalBytes].every(Number.isSafeInteger) || rawBytes < intervalBytes || intervalBytes < chargedBytes) badSchema();
    return { bytes: chargedBytes, rawBytes, intervalCreditBytes: rawBytes - intervalBytes, reminderNullCreditBytes: intervalBytes - chargedBytes, dataBytes: Number(value.data_bytes) || 0 };
  });
}
function wireRow(value) {
  return Object.fromEntries(Object.entries(value).map(([key, field]) => [key,
    field !== null && (key.endsWith('_at') || key === 'consent_at') ? new Date(field === O.providerPhysicalTime ? O.providerPhysicalWireTime : field) : field]));
}

/** SELECT only. Omitted baselineOrgId bounds a fresh API target, including its creation audit.
 * Present baselineOrgId must equal orgId and reads original target events and legacy reports with exact PG charges.
 * All other retained record/file/feature state must be empty; source archives remain under their existing separate quota.
 */
export async function measureLearningRestoreCapacity(c, backup, { orgId = C.worstOrgId, actorId = C.worstActorId,
  baselineOrgId } = {}) {
  learningId(orgId); learningId(actorId);
  if (baselineOrgId !== undefined && baselineOrgId !== orgId) badSchema();
  const records = validateBackup(backup, orgId, actorId), context = { records: backup.records, trash: backup.trash || [], legacyReports: backup.reports || [] };
  const intake = restoredIntake(backup), participation = restoredParticipation(backup), delivery = restoredDelivery(backup),
    recurrence = restoredTaskRecurrence(backup.taskRecurrence, context), directory = restoredDirectoryResources(backup.directoryResources, context),
    learning = restoredLearningBridge(backup.learningBridge, context), incubator = restoredIncubatorBridge(backup.incubatorBridge, context), integrations = restoredIntegrations(backup);
  const checkins = restoredParticipantCheckins(backup.participantCheckins);
  const groups = restoredParticipationGroups(backup.participationGroups);
  const reservationRecovery = restoredResourceReservations(backup, orgId);
  const field=planRestoredFieldResponseReports(backup,{orgId,actorId,createdAtExact:C.timestamp});
  const crm=planRestoredContactReconciliationReports(backup,{orgId,actorId,createdAtExact:C.timestamp});
  const occurrence=planRestoredParticipationRecurrenceReports(backup,{orgId,actorId,createdAtExact:C.timestamp});
  const substitution=planRestoredVolunteerSubstitutionReports(backup,{
    orgId,actorId,createdAtExact:'9999-12-31T23:59:59.999999Z',
  });
  const reportsPresent=field.present||crm.present||occurrence.present||substitution.present;
  const incomingReportIds=new Set(occurrence.reports.map(report=>report.id));
  const substitutionReportIds=new Set(substitution.reports.map(report=>report.id));
  const operational = operationalGrowth(backup.participation), operationalBounds = new Map(operational.outboxBounds.map(value => [value.id, value]));
  if (operational.active && (operational.sourceOutboxWireBytes > PARTICIPATION_LIMITS.outboxBytes || operational.sourceParticipationWireBytes > PARTICIPATION_LIMITS.participationBytes)) operationalFailure();
  await schemaCheck(c,reportsPresent);
  const resourceRestore = await measureResourceReservationRestore(c, orgId, reservationRecovery);
  const baseline = { events: [], reports: [], bytes: 0 };
  if (baselineOrgId !== undefined) {
    for (const [key, table] of [['events', 'os_events'], ['reports', 'os_reports']]) {
      const result = await c.query(`SELECT t.*,octet_length(to_jsonb(t)::text) AS capacity_bytes FROM ${table} t WHERE org_id=$1 ORDER BY id`, [baselineOrgId]);
      for (const { capacity_bytes, ...original } of result.rows) {
        if (table === 'os_reports' && isParticipationRecurrenceRecoveryFamily(original.payload)) fail(409,'restore_conflict','Restore requires a destination without recurring draft history.');
        if (table === 'os_reports' && incomingReportIds.has(original.id)) fail(409,'restore_conflict','A destination report collides with recovered report history.');
        if (table === 'os_reports' && isContactReconciliationRecoveryFamily(original.payload)) fail(409,'restore_conflict','Restore requires a destination without contact reconciliation history.');
        if (table === 'os_reports' && crm.reports.some(report=>report.id===original.id)) fail(409,'restore_conflict','A destination report collides with recovered contact reconciliation history.');
        if (table === 'os_reports' && isFieldResponseRecoveryFamily(original.payload)) fail(409,'restore_conflict','Restore requires a destination without aggregate import history.');
        if (table === 'os_reports' && field.reports.some(report=>report.id===original.id)) fail(409,'restore_conflict','A destination report collides with recovered aggregate import history.');
        if (table === 'os_reports' && (isVolunteerSubstitutionNativeReport(original) || substitutionReportIds.has(original.id)))
          fail(409,'restore_conflict','Restore requires a destination without volunteer substitution history or a colliding report.');
        if (table === 'os_reports' && isLearningReportFamily(original.payload)) fail(409, 'restore_conflict', 'Restore requires a destination without learning reports.');
        if (table === 'os_reports' && learning?.reports.some(report => original.id === report.id || original.checksum === report.checksum || original.payload?.id === report.id || original.payload?.checksum === report.checksum))
          fail(409, 'restore_conflict', 'An original destination report collides with recovered learning report identity.');
        baseline[key].push(original); baseline.bytes += Number(capacity_bytes);
      }
    }
    if (await logicalBackupBytes(c, baselineOrgId) !== baseline.bytes)
      fail(409, 'restore_conflict', 'Restore requires a destination without retained records, files or feature sidecars. Original audit history and legacy reports are preserved.');
  }
  const tables = Object.fromEntries(Object.keys(columns).map(table => [table, []]));
  if (reportsPresent) tables.os_reports=[];
  const add = (table, fields) => { const value = row(table, fields); tables[table].push(value); return value; };
  const audit = (action, record, detail) => add('os_events', { org_id: orgId, id: C.auditId, actor_id: actorId, action,
    record_id: record?.id, module_id: record?.moduleId, detail, created_at: C.timestamp });
  if (baselineOrgId === undefined) audit('organization.created', null, {});
  for (const record of records) {
    add('os_records', { org_id: orgId, id: record.id, module_id: record.moduleId, data: record.data, status: record.status,
      owner_id: actorId, last_editor_id: actorId, revision: 1, source: record.source, created_at: C.timestamp, updated_at: C.timestamp });
    // validateBackup's returned object has no createdAt; saveRecord adds only updatedAt before the real restored audit.
    audit('record.restored', record, { record: { ...record, updatedAt: wireTime }, sourceChecksum: backup.checksum });
  }
  for (const value of integrations) add('os_integrations', { org_id: orgId, id: value.id, provider: value.provider, name: value.name,
    config: value.config, revision: 1, status: 'unconfigured', created_at: C.timestamp });
  for (const value of intake.publications) add('os_publications', { org_id: orgId, id: value.id, record_id: value.recordId,
    source_revision: value.sourceRevision, kind: value.kind, target_id: value.targetId, target_module: value.targetModule,
    target_revision: value.targetRevision, schema: value.schema, created_by: actorId, created_at: value.createdAt, withdrawn_at: C.timestamp });
  for (const value of intake.submissions) add('os_intake', { org_id: orgId, id: value.id, publication_id: value.publicationId,
    answers: value.answers, consent_at: value.consentAt, status: value.status, revision: 1, converted_ids: value.convertedIds,
    created_at: value.createdAt, updated_at: C.timestamp, erased_at: value.erasedAt, cancelled_at: value.cancelledAt });
  for (const value of participation.targets) add('os_participation_targets', { org_id: orgId, target_id: value.targetId,
    module_id: value.moduleId, revision: 1, mode: 'paused', source_revision: value.sourceRevision, terms: value.terms,
    terms_hash: value.termsHash, recovery_block: true, created_by: actorId, created_at: value.createdAt, updated_at: C.timestamp });
  for (const value of participation.participations) add('os_participations', { org_id: orgId, id: value.id, target_id: value.targetId,
    module_id: value.moduleId, booking_record_id: value.bookingRecordId, contact_id: value.contactId, intake_id: value.intakeId,
    state: value.state, revision: 1, source: 'recovered', reminder_consent: null, requested_interval: value.requestedInterval, frozen: value.frozen, cancelled_at: value.cancelledAt,
    created_by: actorId, created_at: value.createdAt, updated_at: C.timestamp, recovered: true, recovered_state: value.recoveredState });
  for (const value of participation.outbox) add('os_participation_outbox', { org_id: orgId, id: value.id, participation_id: value.participationId,
    event_revision: value.eventRevision, purpose: 'participation', channel: 'email', state: 'cancelled', payload: value.payload,
    created_at: value.createdAt, participation_revision: value.participationRevision, intent_kind: 'legacy', recovered_state: value.recoveredState,
    consent_revision: value.consentRevision, consent_copy: value.consentCopy, template_version: value.templateVersion,
    first_attempt_at: value.attemptedAt, attempts: value.attempts, next_at: C.timestamp, last_checked_at: value.lastCheckedAt,
    safe_code: value.safeCode, provider_event_at: value.providerEventAt, budget_bytes: 0 });
  let unboundedOutboxBytes = 0;
  if (operational.active) {
    // First cast the actual admitted values too; an operational bound must never conceal an unrestorable SQL value.
    unboundedOutboxBytes = (await measure(c, 'os_participation_outbox', tables.os_participation_outbox)).reduce((sum, value) => sum + value.bytes, 0);
    for (const value of tables.os_participation_outbox) if (operationalBounds.has(value.id)) {
      const bound = operationalBounds.get(value.id);
      Object.assign(value, { safe_code: bound.safeCode, attempts: bound.attempts, first_attempt_at: C.timestamp,
        last_checked_at: C.timestamp, provider_event_at: O.providerPhysicalTime, recovered_state: O.state });
    }
  }
  if (delivery.policy) add('os_participation_delivery_policies', { org_id: orgId, revision: 1, enabled: false,
    epoch: 'e'.repeat(32), template_version: delivery.policy.templateVersion, updated_at: C.timestamp });
  for (const value of recurrence.series) add('os_task_recurrence_series', { org_id: orgId, id: value.id, root_record_id: value.rootRecordId,
    method: value.method, anchor: value.anchor, state: 'recovered', revision: value.revision, tip_record_id: value.tipRecordId,
    tip_sequence: value.tipSequence, created_by: value.createdBy, created_at: value.createdAt, ended_at: value.endedAt,
    end_code: 'backup-recovery', recovered_state: value.recoveredState, budget_bytes: 2147483647 });
  const seriesSizes = await measure(c, 'os_task_recurrence_series', tables.os_task_recurrence_series);
  tables.os_task_recurrence_series.forEach((value, index) => { value.budget_bytes = seriesSizes[index].bytes + END_GROWTH_RESERVE_BYTES; });
  for (const value of recurrence.occurrences) add('os_task_recurrence_occurrences', { org_id: orgId, series_id: value.seriesId,
    sequence: value.sequence, source_record_id: value.sourceRecordId, generated_record_id: value.generatedRecordId,
    accepted_command_hash: value.acceptedCommandHash, packet: value });
  if (directory) {
    for (const value of directory.captures) add('os_resource_directory_history', { org_id: orgId,
      id: directoryPrivateHash('capture-row', { captureId: value.captureId }), row_kind: 'capture', capture_id: value.captureId,
      origin_mode: 'recovered', payload: value, budget_bytes: 0, created_at: C.timestamp });
    for (const binding of directory.bindings) for (const value of binding.events) add('os_resource_directory_history', { org_id: orgId,
      id: value.packetSha256, row_kind: 'event', capture_id: value.packet.selection.captureId, binding_id: value.packet.bindingId,
      sequence: value.packet.sequence, resource_id: value.packet.resourceId, catalog_kind: value.packet.catalogKind, listing_id: value.packet.listingId,
      origin_mode: 'recovered', payload: { packet: value.packet, packetSha256: value.packetSha256 }, budget_bytes: 0, created_at: C.timestamp });
    for (const value of tables.os_resource_directory_history)
      value.budget_bytes = Number((await c.query('SELECT octet_length($1::jsonb::text) AS bytes', [JSON.stringify(value.payload)])).rows[0].bytes) + 4096;
  }
  const learned = learning ? await measureLearningBackup(c, learning) : null;
  for (const value of learned?.rows ?? []) add('os_learning_history', { org_id: orgId, id: value.id, row_kind: value.rowKind,
    origin_mode: 'recovered', origin_org_id: value.originOrgId, binding_id: value.bindingId, sequence: value.sequence,
    source_version: value.sourceVersion, program_id: value.programId, payload: value.payload, budget_bytes: value.budgetBytes, created_at: C.timestamp });
  const copied = incubator ? await measureIncubatorBackup(c, incubator, context) : null;
  for (const value of copied?.rows ?? []) add('os_incubator_history', { org_id: orgId, id: value.id, row_kind: value.rowKind,
    origin_mode: 'recovered', origin_org_id: value.originOrgId, binding_id: value.bindingId, sequence: value.sequence,
    source_version: value.sourceVersion, program_id: value.programId, payload: value.payload, receipt: value.receipt,
    budget_bytes: value.budgetBytes, created_at: C.timestamp });
  for (const value of checkins ?? []) add('os_participation_checkins', checkInStorageRow(value, orgId, wireTime));
  for (const history of groups?.groups ?? []) add('os_participation_groups', {
    org_id: orgId, id: history.id, origin_mode: 'recovered', module_id: history.moduleId,
    live_target_id: null, roster_ids: [], coordinator_intake_id: null, state: 'archived',
    revision: 1, last_command_hash: null, history, created_at: C.timestamp, updated_at: C.timestamp,
  });
  for (const report of field.reports) add('os_reports',report);
  for (const report of crm.reports) add('os_reports',report);
  for (const report of occurrence.reports) add('os_reports',report);
  for (const report of substitution.reports) add('os_reports',report);
  audit('backup.restored', null, { ...fieldResponseRestoreSummary(field), ...contactReconciliationRestoreSummary(crm), ...participationRecurrenceRestoreSummary(occurrence), count: records.length, checksum: backup.checksum, sourceArchiveId: C.archiveId,
    // Projection only: the largest possible JS array length fixes count width across optional export audits and re-restores.
    sourceHistoryCount: 4294967295, sourceCommentCount: backup.comments?.length || 0, sourceReportCount: backup.reports?.length || 0,
    learningSourcesRecovered: learning?.sources.length || 0, learningEventsRetained: learning?.events.length || 0,
    learningReportsRecovered: learning?.reports.length || 0, intakePublicationsClosed: intake.publications.length, intakeRequests: intake.submissions.length,
    ...(checkins === null ? {} : { participantCheckinsRecovered: checkins.length }),
    ...(groups === null ? {} : { participationGroupsRecovered: groups.groups.length }),
    ...(substitution.present ? { volunteerSubstitutionsRecovered: substitution.reports.length } : {}),
    ...resourceReservationRestoreSummary(reservationRecovery),
    ...(incubator ? { incubatorSourcesRecovered: incubator.sources.length, incubatorEventsRetained: incubator.events.length } : {}),
    participationTargetsRecovered: participation.targets.length, participationsRecovered: participation.participations.length,
    taskRecurrenceSeriesRecovered: recurrence.series.length, taskRecurrenceOccurrencesRetained: recurrence.occurrences.length });
  tables.os_events.forEach((value, index, all) => { value.id = (BigInt(C.auditId) - BigInt(all.length - 1 - index)).toString(); });
  const sizes = {}, categories = {};
  let logicalBytes = baseline.bytes, structuredRecordBytes = 0;
  for (const [table, values] of Object.entries(tables)) {
    sizes[table] = await measure(c, table, values, table === 'os_participations' && legacyRecoveredParticipation(backup, participation), backup.participation?.version === 4);
    const charges = sizes[table].map((value, index) => Math.max(value.bytes, Number(values[index].budget_bytes) || 0));
    for (const [index, value] of values.entries()) if (['os_learning_history', 'os_resource_directory_history', 'os_incubator_history'].includes(table) && sizes[table][index].bytes > value.budget_bytes) over();
    categories[table] = { count: values.length, bytes: charges.reduce((sum, value) => sum + value, 0), ...(table === 'os_participations' && backup.participation?.version === 4 ? { intervalCompatibilityCreditBytes: sizes[table].reduce((sum, value) => sum + value.intervalCreditBytes, 0), reminderNullCompatibilityCreditBytes: sizes[table].reduce((sum, value) => sum + value.reminderNullCreditBytes, 0) } : {}), rawBytes: sizes[table].reduce((sum,value,index)=>sum+Math.max(value.rawBytes,Number(values[index].budget_bytes)||0),0) };
    logicalBytes += categories[table].bytes;
    if (table === 'os_records') structuredRecordBytes = sizes[table].reduce((sum, value) => sum + value.dataBytes, 0);
  }
  if (resourceRestore !== null) {
    categories.os_resource_reservations = {
      count: resourceRestore.count, bytes: resourceRestore.projectedRetainedBytes,
      rawBytes: resourceRestore.retainedBytes,
    };
    categories.os_resource_reservation_commands = { count: 0, bytes: 0, rawBytes: 0 };
    logicalBytes += resourceRestore.projectedRetainedBytes;
  }
  if (occurrence.present) {
    const familyBytes=tables.os_reports.reduce((total,value,index)=>total+(isParticipationRecurrenceRecoveryFamily(value.payload)?sizes.os_reports[index].bytes:0),0);
    if (occurrence.reports.length>PARTICIPATION_RECURRENCE_REPORT_LIMITS.reports||familyBytes>PARTICIPATION_RECURRENCE_REPORT_LIMITS.familyBytes) over();
  }
  let substitutionCapacity;
  if (substitution.present) {
    const count=substitution.reports.length;
    const bytes=tables.os_reports.reduce((total,value,index)=>total+
      (substitutionReportIds.has(value.id)?sizes.os_reports[index].bytes:0),0);
    if (count>VOLUNTEER_SUBSTITUTION_STORAGE_LIMITS.receipts || bytes>VOLUNTEER_SUBSTITUTION_STORAGE_LIMITS.receiptFamilyBytes) over();
    substitutionCapacity={count,bytes,nativeBytes:compactBytes(substitution.namespace)};
  }
  const files = [], inputFiles = backup.files || [];
  if (!Array.isArray(inputFiles) || inputFiles.length > 1000) over();
  let fileBytes = 0, fileCharge = 0;
  for (const [index, value] of inputFiles.entries()) {
    if (!records.some(record => record.id === value.recordId && record.moduleId === 'documents')) over();
    const verified = validateFile(value); fileBytes += verified.size; fileCharge += Math.ceil(verified.size / 3) * 4 + 1000;
    // PostgreSQL's exported base64 wraps at 76 columns. Its escaped line breaks count in the actual JSON body.
    const content = (await c.query("SELECT encode($1::bytea,'base64') AS content", [verified.bytes])).rows[0].content;
    files.push({ id: index.toString(16).padStart(32, '0'), recordId: value.recordId, name: clean(value.name, 180), mime: clean(value.mime, 100),
      checksum: verified.checksum, size: verified.size, content });
  }
  if (fileBytes > FILE_QUOTA || structuredRecordBytes > 16 * 1024 * 1024) over();
  categories.os_files = { count: files.length, bytes: fileCharge }; logicalBytes += fileCharge;
  categories.targetBaseline = { count: baseline.events.length + baseline.reports.length, bytes: baseline.bytes };
  const projectedClient = { query: async sql => {
    const match = sql.match(/\bFROM (os_[a-z_]+)\b/), table = match?.[1];
    if (table === 'os_reports') return { rows: [] }; // Learning-only reader. Other reports use the explicit projections below.
    if (!table || !Object.hasOwn(tables, table)) badSchema();
    if (table === 'os_learning_history') return { rows: tables[table].map((value, index) => ({ ...wireRow(value),
      learning_payload_bytes: learned.rows[index].payloadBytes, learning_receipt_bytes: 0, learning_row_bytes: sizes[table][index].bytes })) };
    if (table === 'os_incubator_history') return { rows: tables[table].map((value,index)=>({...wireRow(value),incubator_row_bytes:sizes[table][index].bytes})) };
    return { rows: tables[table].map(wireRow) };
  } };
  await participationQuota({ query: async sql => {
    const table = sql.match(/FROM (os_[a-z_]+) t/)?.[1]; if (!categories[table]) badSchema();
    return { rows: [categories[table]] };
  } }, orgId);
  if (tables.os_intake.reduce((sum, value, index) => sum + (['pending', 'reviewed'].includes(value.status) ? sizes.os_intake[index].bytes : 0), 0) > 8 * 1024 * 1024) over();
  if (categories.os_task_recurrence_series.bytes + categories.os_task_recurrence_occurrences.bytes > 4 * 1024 * 1024) over();
  if (categories.os_resource_directory_history.bytes > DIRECTORY_LIMITS.featureBytes) over();
  if (categories.os_participation_checkins.count > CHECK_IN_LIMITS.records || categories.os_participation_checkins.bytes > CHECK_IN_LIMITS.familyBytes || sizes.os_participation_checkins.some(v => v.bytes > CHECK_IN_LIMITS.rowBytes)) over();
  if (categories.os_participation_groups.count > GROUP_LIMITS.groups ||
      categories.os_participation_groups.bytes + categories.os_participation_group_receipts.bytes > GROUP_LIMITS.familyBytes) over();
  if (categories.os_incubator_history.count>1000 || categories.os_incubator_history.bytes>16777216) over();
  const projectedRecords = tables.os_records.map(value => rowRecord(wireRow(value)));
  const extras = { comments: [], events: [...baseline.events, ...tables.os_events.map(wireRow)], reports: reportsPresent?[...baseline.reports,...tables.os_reports.filter(value=>!isVolunteerSubstitutionNativeReport(value)).map(wireRow)]:baseline.reports, files, trash: [], trashFiles: [],
    integrations: tables.os_integrations.map(value => ({ id: value.id, provider: value.provider, name: value.name, config: value.config })),
    intake: await exportIntake(projectedClient, orgId), participation: await exportParticipation(projectedClient, orgId),
    delivery: await exportDelivery(projectedClient, orgId), taskRecurrence: await exportTaskRecurrence(projectedClient, orgId),
    directoryResources: await exportDirectoryResources(projectedClient, orgId, { records: projectedRecords }) };
  const projectedLearning = await exportLearningBridge(projectedClient, orgId, { records: projectedRecords, legacyReports: [], sourceOrgId: orgId });
  if (projectedLearning !== undefined) extras.learningBridge = projectedLearning;
  const projectedIncubator = await exportIncubatorBridge(projectedClient,orgId,{records:projectedRecords});
  if (projectedIncubator !== undefined) extras.incubatorBridge = projectedIncubator;
  const projectedCheckins = await exportParticipantCheckins(projectedClient, orgId);
  if (projectedCheckins !== undefined) extras.participantCheckins = projectedCheckins;
  // Restored groups are inactive histories; they have no executable receipts.
  const projectedGroups = makeParticipationGroupsBackup(groups?.groups ?? []);
  if (projectedGroups !== undefined) extras.participationGroups = projectedGroups;
  if (resourceRestore?.namespace !== undefined) extras.resourceReservations = resourceRestore.namespace;
  if (substitution.present) extras.volunteerSubstitutions = substitution.namespace;
  let destinationWireMetadataExtraBytes = 0;
  if (operational.active) {
    const originalWireBytes = compactBytes(extras.participation.outbox);
    extras.participation.outbox = extras.participation.outbox.map(value => operationalBounds.has(value.id)
      ? portableOutboxBound(value, operationalBounds.get(value.id), { restored: true }) : value);
    destinationWireMetadataExtraBytes = compactBytes(extras.participation.outbox) - originalWireBytes;
    if (compactBytes(extras.participation.outbox) > PARTICIPATION_LIMITS.outboxBytes) operationalFailure();
  }
  // Real organization API bounds: name180 and time-zone100 UTF-16 units. Escaped controls maximize their wire size.
  const projected = makeBackup({ name: '\u0001'.repeat(180), currency: 'XXX', time_zone: '\u0001'.repeat(100) }, projectedRecords, extras);
  const feedback = await measureFeedbackIntakeRestore(c, orgId, extras.intake, {
    publications: tables.os_publications, submissions: tables.os_intake,
  });
  logicalBytes += feedback?.retainedGrowthBytes ?? 0;
  const backupBytes = Buffer.byteLength(JSON.stringify(projected)) + (feedback?.nativeGrowthBytes ?? 0);
  if (checkins === null) delete categories.os_participation_checkins;
  return frozen({ logicalBytes, requiredLogicalBytes: logicalBytes + C.auditCheckReserveBytes, backupBytes,
    auditCheckReserveBytes: C.auditCheckReserveBytes, structuredRecordBytes, categories,
    ...(feedback === null ? {} : { feedbackIntake: feedback }),
    ...(substitutionCapacity === undefined ? {} : { volunteerSubstitutions: substitutionCapacity }),
    ...(resourceRestore === null ? {} : { resourceReservations: {
      retainedBytes: resourceRestore.retainedBytes,
      projectedRetainedBytes: resourceRestore.projectedRetainedBytes,
      nativeBytes: resourceRestore.nativeBytes,
      projectedNativeBytes: resourceRestore.projectedNativeBytes,
      pendingDispositions: resourceRestore.pendingDispositions,
    } }),
    operational: { active: operational.active, affectedParticipations: operational.affectedParticipationIds.length,
      sourceWireGrowthBytes: operational.sourceWireGrowthBytes, sourceOutboxWireBytes: operational.sourceOutboxWireBytes,
      sourceParticipationWireBytes: operational.sourceParticipationWireBytes,
      destinationOutboxGrowthBytes: operational.active ? categories.os_participation_outbox.bytes - unboundedOutboxBytes : 0,
      destinationWireMetadataExtraBytes } });
}
export async function checkLearningRestoreCapacity(c, backup, options) {
  const value = await measureLearningRestoreCapacity(c, backup, options);
  if (value.requiredLogicalBytes > C.logicalBytes || value.backupBytes > C.backupBytes) over();
  return value;
}
