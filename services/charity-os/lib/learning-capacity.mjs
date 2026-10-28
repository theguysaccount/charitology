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
export function operationalGrowth(participation) {
  const outbox = participation?.outbox ?? [], participations = participation?.participations ?? [];
  if (!Array.isArray(outbox) || !Array.isArray(participations)) badSchema();
  const affectedParticipationIds = [...new Set(outbox.filter(value => ['snapshot', 'transition'].includes(value.intentKind)).map(value => value.participationId))].sort();
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
/** Actual current-tenant PG rows; SELECT only, including legacy positive growth without a prepaid budget. */
export async function measureLearningOperationalCapacity(c, org, participation) {
  const growth = operationalGrowth(participation);
  if (!growth.active) return frozen({ active: false, affectedParticipations: 0, sourceLogicalGrowthBytes: 0, sourceParticipationGrowthBytes: 0,
    sourceOutboxGrowthBytes: 0, sourceWireGrowthBytes: 0, sourceOutboxWireBytes: growth.sourceOutboxWireBytes, sourceParticipationWireBytes: growth.sourceParticipationWireBytes,
    sourceOutboxBytes: 0, sourceParticipationBytes: 0, nonlegacyRows: 0, maxNonlegacyRowBytes: 0 });
  const mutable = { state: "to_jsonb('suppressed'::text)", safe_code: 'to_jsonb($4::text)', attempts: 'to_jsonb($5::integer)',
    first_attempt_at: 'to_jsonb($2::timestamptz)', last_checked_at: 'to_jsonb($2::timestamptz)', provider_event_at: "(CASE WHEN octet_length(to_jsonb($3::timestamptz)::text)>octet_length(to_jsonb($2::timestamptz)::text) THEN to_jsonb($3::timestamptz) ELSE to_jsonb($2::timestamptz) END)",
    lease_owner: 'to_jsonb($6::text)', lease_until: 'to_jsonb($2::timestamptz)', next_at: 'to_jsonb($2::timestamptz)' };
  const fields = Object.entries(mutable).flatMap(([key, value]) => [`'${key}'`, longerJSONB(key, value)]).join(',');
  const rows = (await c.query(`SELECT id,intent_kind,budget_bytes,octet_length(to_jsonb(t)::text) AS actual,octet_length((to_jsonb(t)||jsonb_build_object(${fields}))::text) AS projected FROM os_participation_outbox t WHERE org_id=$1`, [org, C.timestamp, O.providerPhysicalTime, O.safeCode, O.attempts, 'f'.repeat(32)])).rows;
  let sourceOutboxGrowthBytes = 0, sourceOutboxBytes = 0, nonlegacyRows = 0, maxNonlegacyRowBytes = 0;
  for (const value of rows) {
    const actual = Number(value.actual), projected = Number(value.projected), budget = Number(value.budget_bytes) || 0;
    if (value.intent_kind !== 'legacy' && (budget <= 0 || projected > budget)) operationalFailure();
    if (value.intent_kind !== 'legacy') { nonlegacyRows++; maxNonlegacyRowBytes = Math.max(maxNonlegacyRowBytes, projected); }
    const charged = Math.max(actual, budget), future = Math.max(projected, budget);
    sourceOutboxGrowthBytes += Math.max(0, future - charged); sourceOutboxBytes += future;
  }
  const base = `to_jsonb(t)||jsonb_build_object('revision',${longerJSONB('revision', 'to_jsonb($3::integer)')},'updated_at',${longerJSONB('updated_at', 'to_jsonb($2::timestamptz)')})`;
  const changed = `(${base})||jsonb_build_object('delivery_consent',jsonb_build_object('version',$4::text,'enabled',false,'revision',$3::integer,'at',$5::text))`;
  const people = (await c.query(`SELECT octet_length(to_jsonb(t)::text) AS actual,GREATEST(octet_length((${base})::text),octet_length((${changed})::text)) AS projected FROM os_participations t WHERE org_id=$1 AND id=ANY($6::text[])`, [org, C.timestamp, O.attempts, DELIVERY_CONSENT_VERSION, O.serviceTime, growth.affectedParticipationIds])).rows;
  const sourceParticipationGrowthBytes = people.reduce((sum, value) => sum + Math.max(0, Number(value.projected) - Number(value.actual)), 0);
  const sourceParticipationBytes = Number((await c.query('SELECT COALESCE(sum(octet_length(to_jsonb(t)::text)),0) AS bytes FROM os_participations t WHERE org_id=$1', [org])).rows[0].bytes) + sourceParticipationGrowthBytes;
  if (sourceOutboxBytes > PARTICIPATION_LIMITS.outboxBytes || sourceParticipationBytes > PARTICIPATION_LIMITS.participationBytes ||
      growth.sourceOutboxWireBytes > PARTICIPATION_LIMITS.outboxBytes || growth.sourceParticipationWireBytes > PARTICIPATION_LIMITS.participationBytes) operationalFailure();
  return frozen({ active: true, affectedParticipations: growth.affectedParticipationIds.length, sourceLogicalGrowthBytes: sourceParticipationGrowthBytes + sourceOutboxGrowthBytes,
    sourceParticipationGrowthBytes, sourceOutboxGrowthBytes, sourceWireGrowthBytes: growth.sourceWireGrowthBytes,
    sourceOutboxWireBytes: growth.sourceOutboxWireBytes, sourceParticipationWireBytes: growth.sourceParticipationWireBytes, sourceOutboxBytes, sourceParticipationBytes,
    nonlegacyRows, maxNonlegacyRowBytes });
}
const columns = Object.freeze(Object.fromEntries(Object.entries({
  os_records: 'org_id id module_id data status owner_id last_editor_id revision approval snapshot source deleted_at created_at updated_at',
  os_events: 'org_id id actor_id action record_id module_id detail created_at',
  os_integrations: 'org_id id provider name config encrypted_token revision status last_checked_at last_error created_at',
  os_publications: 'org_id id record_id source_revision kind target_id target_module target_revision schema created_by created_at withdrawn_at',
  os_intake: 'org_id id publication_id answers consent_at status revision idempotency_hash payload_hash receipt_hash ip_hash reviewed_by reviewed_at converted_ids created_at updated_at erased_at cancelled_at',
  os_participation_targets: 'org_id target_id module_id revision mode source_revision terms terms_hash recovery_block created_by created_at updated_at last_command',
  os_participations: 'org_id id target_id module_id booking_record_id contact_id intake_id state revision source consent frozen waitlist_sequence confirmed_at cancelled_at created_by created_at updated_at recovered recovered_state last_command delivery_consent',
  os_participation_outbox: 'org_id id participation_id event_revision purpose channel state payload created_at participation_revision intent_kind consent_revision consent_copy user_id link_id link_revision recipient_hash policy_epoch template_version relay_key payload_hash first_attempt_at attempts lease_owner lease_until next_at last_checked_at safe_code provider_event_at budget_bytes recovered_state',
  os_participation_delivery_policies: 'org_id revision enabled epoch activated_at template_version last_command updated_at',
  os_task_recurrence_series: 'org_id id root_record_id method anchor state revision tip_record_id tip_sequence created_by created_at ended_at end_code recovered_state budget_bytes last_end_command',
  os_task_recurrence_occurrences: 'org_id series_id sequence source_record_id generated_record_id accepted_command_hash packet',
  os_resource_directory_history: 'org_id id row_kind capture_id binding_id sequence resource_id catalog_kind listing_id origin_mode command_hash request_hash actor_binding_hash payload budget_bytes created_at',
  os_learning_history: 'org_id id row_kind origin_mode origin_org_id binding_id sequence source_version program_id payload receipt budget_bytes created_at',
}).map(([table, value]) => [table, Object.freeze(value.split(' '))])));
const badSchema = () => fail(422, 'learning_capacity_schema', 'The restore capacity projection must be updated for this database schema before accepting learning changes.');
const over = () => fail(422, 'learning_restore_capacity', 'This complete workspace cannot fit a restored copy, including ordinary restore history, within the existing 60 MiB storage and 64 MiB backup limits.');
const row = (table, values) => Object.fromEntries(columns[table].map(key => [key, values[key] ?? null]));
const frozen = learningFreeze;

async function schemaCheck(c) {
  const result = await c.query("SELECT t.relname AS table_name,a.attname AS column_name FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_attribute a ON a.attrelid=t.oid WHERE n.nspname=current_schema() AND t.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY t.relname,a.attnum", [Object.keys(columns)]);
  const actual = new Map();
  for (const item of result.rows) { if (!actual.has(item.table_name)) actual.set(item.table_name, []); actual.get(item.table_name).push(item.column_name); }
  for (const [table, expected] of Object.entries(columns))
    if (JSON.stringify([...(actual.get(table) ?? [])].sort()) !== JSON.stringify([...expected].sort())) badSchema();
}
async function measure(c, table, rows) {
  if (!rows.length) return [];
  // Composite JSON timestamp transport only: payload/data/proof objects retain their exact original strings.
  const sqlRows = rows.map(value => Object.fromEntries(Object.entries(value).map(([key, field]) => [key,
    typeof field === 'string' && key.endsWith('_at') ? participationTimestampParameter(field) : field])));
  const result = await c.query(`SELECT item.ordinality::integer AS position,octet_length(to_jsonb(r)::text) AS bytes${table === 'os_records' ? ',octet_length(r.data::text) AS data_bytes' : ''} FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS item(value,ordinality) CROSS JOIN LATERAL jsonb_populate_record(NULL::${table},item.value) AS r ORDER BY item.ordinality`, [JSON.stringify(sqlRows)]);
  if (result.rows.length !== rows.length) badSchema();
  return result.rows.map((value, index) => {
    if (Number(value.position) !== index + 1 || !Number.isSafeInteger(Number(value.bytes)) || Number(value.bytes) < 0) badSchema();
    return { bytes: Number(value.bytes), dataBytes: Number(value.data_bytes) || 0 };
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
    learning = restoredLearningBridge(backup.learningBridge, context), integrations = restoredIntegrations(backup);
  const operational = operationalGrowth(backup.participation), operationalBounds = new Map(operational.outboxBounds.map(value => [value.id, value]));
  if (operational.active && (operational.sourceOutboxWireBytes > PARTICIPATION_LIMITS.outboxBytes || operational.sourceParticipationWireBytes > PARTICIPATION_LIMITS.participationBytes)) operationalFailure();
  await schemaCheck(c);
  const baseline = { events: [], reports: [], bytes: 0 };
  if (baselineOrgId !== undefined) {
    for (const [key, table] of [['events', 'os_events'], ['reports', 'os_reports']]) {
      const result = await c.query(`SELECT t.*,octet_length(to_jsonb(t)::text) AS capacity_bytes FROM ${table} t WHERE org_id=$1 ORDER BY id`, [baselineOrgId]);
      for (const { capacity_bytes, ...original } of result.rows) {
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
    state: value.state, revision: 1, source: 'recovered', frozen: value.frozen, cancelled_at: value.cancelledAt,
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
  audit('backup.restored', null, { count: records.length, checksum: backup.checksum, sourceArchiveId: C.archiveId,
    // Projection only: the largest possible JS array length fixes count width across optional export audits and re-restores.
    sourceHistoryCount: 4294967295, sourceCommentCount: backup.comments?.length || 0, sourceReportCount: backup.reports?.length || 0,
    learningSourcesRecovered: learning?.sources.length || 0, learningEventsRetained: learning?.events.length || 0,
    learningReportsRecovered: learning?.reports.length || 0, intakePublicationsClosed: intake.publications.length, intakeRequests: intake.submissions.length,
    participationTargetsRecovered: participation.targets.length, participationsRecovered: participation.participations.length,
    taskRecurrenceSeriesRecovered: recurrence.series.length, taskRecurrenceOccurrencesRetained: recurrence.occurrences.length });
  tables.os_events.forEach((value, index, all) => { value.id = (BigInt(C.auditId) - BigInt(all.length - 1 - index)).toString(); });
  const sizes = {}, categories = {};
  let logicalBytes = baseline.bytes, structuredRecordBytes = 0;
  for (const [table, values] of Object.entries(tables)) {
    sizes[table] = await measure(c, table, values);
    const charges = sizes[table].map((value, index) => Math.max(value.bytes, Number(values[index].budget_bytes) || 0));
    for (const [index, value] of values.entries()) if (['os_learning_history', 'os_resource_directory_history'].includes(table) && sizes[table][index].bytes > value.budget_bytes) over();
    categories[table] = { count: values.length, bytes: charges.reduce((sum, value) => sum + value, 0) };
    logicalBytes += categories[table].bytes;
    if (table === 'os_records') structuredRecordBytes = sizes[table].reduce((sum, value) => sum + value.dataBytes, 0);
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
    if (table === 'os_reports') return { rows: [] }; // Learning reports recover only in history; old reports remain archived.
    if (!table || !Object.hasOwn(tables, table)) badSchema();
    if (table === 'os_learning_history') return { rows: tables[table].map((value, index) => ({ ...wireRow(value),
      learning_payload_bytes: learned.rows[index].payloadBytes, learning_receipt_bytes: 0, learning_row_bytes: sizes[table][index].bytes })) };
    return { rows: tables[table].map(wireRow) };
  } };
  await participationQuota({ query: async sql => {
    const table = sql.match(/FROM (os_[a-z_]+) t/)?.[1]; if (!categories[table]) badSchema();
    return { rows: [categories[table]] };
  } }, orgId);
  if (tables.os_intake.reduce((sum, value, index) => sum + (['pending', 'reviewed'].includes(value.status) ? sizes.os_intake[index].bytes : 0), 0) > 8 * 1024 * 1024) over();
  if (categories.os_task_recurrence_series.bytes + categories.os_task_recurrence_occurrences.bytes > 4 * 1024 * 1024) over();
  if (categories.os_resource_directory_history.bytes > DIRECTORY_LIMITS.featureBytes) over();
  const projectedRecords = tables.os_records.map(value => rowRecord(wireRow(value)));
  const extras = { comments: [], events: [...baseline.events, ...tables.os_events.map(wireRow)], reports: baseline.reports, files, trash: [], trashFiles: [],
    integrations: tables.os_integrations.map(value => ({ id: value.id, provider: value.provider, name: value.name, config: value.config })),
    intake: await exportIntake(projectedClient, orgId), participation: await exportParticipation(projectedClient, orgId),
    delivery: await exportDelivery(projectedClient, orgId), taskRecurrence: await exportTaskRecurrence(projectedClient, orgId),
    directoryResources: await exportDirectoryResources(projectedClient, orgId, { records: projectedRecords }) };
  const projectedLearning = await exportLearningBridge(projectedClient, orgId, { records: projectedRecords, legacyReports: [], sourceOrgId: orgId });
  if (projectedLearning !== undefined) extras.learningBridge = projectedLearning;
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
  const backupBytes = Buffer.byteLength(JSON.stringify(projected));
  return frozen({ logicalBytes, requiredLogicalBytes: logicalBytes + C.auditCheckReserveBytes, backupBytes,
    auditCheckReserveBytes: C.auditCheckReserveBytes, structuredRecordBytes, categories,
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
