import {exportVolunteerSubstitutionNative} from './volunteer-substitution-native.mjs';
import {PARTICIPATION_REMINDER_LEGACY_SQL} from './participation-storage.mjs';
import {exportParticipationRecurrenceReports,restoredParticipationRecurrenceReports} from './participation-recurrence-recovery.mjs';
import {fieldResponseNativeReports,inspectFieldResponseRecovery} from './field-response-recovery.mjs';
import {exportContactReconciliationReports,restoredContactReconciliationReports} from './contact-reconciliation-recovery.mjs';
import {makeBackup} from './backup.mjs';
import {allRecords,rowRecord,logicalBackupBytes} from './database.mjs';
import {exportIntake} from './intake-backup.mjs';
import {exportParticipation} from './participation-backup.mjs';
import {exportDelivery} from './participation-delivery-backup.mjs';
import {exportTaskRecurrence} from './task-recurrence-backup.mjs';
import {exportDirectoryResources} from './directory-resource-backup.mjs';
import {exportLearningBridge,isLearningReportFamily} from './learning-backup.mjs';
import {fail} from './security.mjs';
import {checkLearningRestoreCapacity,measureLearningOperationalCapacity} from './learning-capacity.mjs';
import {exportIncubatorBridge} from './incubator-bridge-backup.mjs';
import {exportParticipantCheckins} from './participant-check-in-backup.mjs';
import {exportParticipationGroups} from './participation-group-recovery.mjs';

import {exportResourceReservations} from './resource-reservation-backup.mjs';
import {measureResourceReservationRemaining} from './resource-reservation-capacity.mjs';
import {resourceReservationHistoryExpression} from './resource-reservation-schema.mjs';
import {FEEDBACK_INTAKE_HISTORY_SQL,measureFeedbackIntakeRemaining} from './feedback-intake-capacity.mjs';

export async function readWorkspaceFeatures(c, org) {
  const resourceHistory = await resourceReservationHistoryExpression(c);
  return (await c.query(`SELECT EXISTS(SELECT 1 FROM os_learning_history WHERE org_id=$1) OR EXISTS(SELECT 1 FROM os_learning_previews WHERE org_id=$1) OR EXISTS(SELECT 1 FROM os_reports WHERE org_id=$1 AND (payload->>'kind'='learning-review' OR payload->>'methodVersion' LIKE 'learning-%')) AS present, EXISTS(SELECT 1 FROM os_incubator_history WHERE org_id=$1) OR EXISTS(SELECT 1 FROM os_previews WHERE org_id=$1 AND committed_at IS NULL AND kind IN ('incubator-source-inspection-v1','incubator-copy-preview-v1')) AS incubator, EXISTS(SELECT 1 FROM os_participation_checkins WHERE org_id=$1) AS checkins, EXISTS(SELECT 1 FROM os_participation_groups WHERE org_id=$1) AS groups, EXISTS(SELECT 1 FROM os_reports WHERE org_id=$1 AND payload->>'format'='charitology-field-response-import') AS field, EXISTS(SELECT 1 FROM os_reports WHERE org_id=$1 AND payload->>'format'='charitology-contact-reconciliation') AS crm, EXISTS(SELECT 1 FROM os_reports WHERE org_id=$1 AND payload->>'format' LIKE 'charitology-participation-occurrence-generation%') OR EXISTS(SELECT 1 FROM os_previews WHERE org_id=$1 AND committed_at IS NULL AND kind='participation-recurrence-v1') AS recurrence, NOT ${PARTICIPATION_REMINDER_LEGACY_SQL} AS reminders, ${resourceHistory} AS reservations, ${FEEDBACK_INTAKE_HISTORY_SQL} AS feedback`,[org])).rows[0];
}

/** The HTTP export and transaction capacity check use this same exact inventory. */
export async function assembleWorkspaceBackup(c,org,{organization,records,features}={}){
  organization??=(await c.query('SELECT * FROM os_orgs WHERE id=$1',[org])).rows[0];
  if(!organization)fail(404,'organization','This organization is unavailable.');
  records??=await allRecords(c,org);
  const comments=(await c.query('SELECT * FROM os_comments WHERE org_id=$1',[org])).rows;
  const events=(await c.query('SELECT * FROM os_events WHERE org_id=$1 ORDER BY id',[org])).rows;
  const rawReports=(await c.query('SELECT * FROM os_reports WHERE org_id=$1',[org])).rows;
  const intake=await exportIntake(c,org),participation=await exportParticipation(c,org);
  const substitutions=await exportVolunteerSubstitutionNative(c,{orgId:org,reports:rawReports,events,records,intake,participation});
  const reports=exportParticipationRecurrenceReports(exportContactReconciliationReports(fieldResponseNativeReports(substitutions.reports.filter(row=>!isLearningReportFamily(row.payload)),org),org),org);
  const files=(await c.query("SELECT id,record_id AS \"recordId\",name,mime,checksum,size,encode(bytes,'base64') AS content FROM os_files WHERE org_id=$1 AND record_id IN (SELECT id FROM os_records WHERE org_id=$1 AND deleted_at IS NULL)",[org])).rows;
  const trash=(await c.query('SELECT * FROM os_records WHERE org_id=$1 AND deleted_at IS NOT NULL',[org])).rows.map(rowRecord);
  const trashFiles=(await c.query("SELECT id,record_id AS \"recordId\",name,mime,checksum,size,encode(bytes,'base64') AS content FROM os_files WHERE org_id=$1 AND record_id IN (SELECT id FROM os_records WHERE org_id=$1 AND deleted_at IS NOT NULL)",[org])).rows;
  const integrations=(await c.query('SELECT id,provider,name,config FROM os_integrations WHERE org_id=$1',[org])).rows;
  const learningBridge=await exportLearningBridge(c,org,{records,trash,legacyReports:reports,sourceOrgId:org});
  const incubatorBridge=await exportIncubatorBridge(c,org,{records,trash});
  const participantCheckins=await exportParticipantCheckins(c,org);
  const participationGroups=await exportParticipationGroups(c,org);
  features??=await readWorkspaceFeatures(c,org);
  const resourceReservations=features?.reservations===true?await exportResourceReservations(c,org,{records,trash}):undefined;
  return makeBackup(organization,records,{comments,events:substitutions.events,reports,files,trash,trashFiles,integrations,
    intake,participation,
    delivery:await exportDelivery(c,org),taskRecurrence:await exportTaskRecurrence(c,org),
    directoryResources:await exportDirectoryResources(c,org,{records,trash}),
    ...(learningBridge===undefined?{}:{learningBridge}),
    ...(incubatorBridge===undefined?{}:{incubatorBridge}),
    ...(participantCheckins===undefined?{}:{participantCheckins}),
    ...(participationGroups===undefined?{}:{participationGroups}),
    ...(resourceReservations===undefined?{}:{resourceReservations}),
    ...(substitutions.volunteerSubstitutions===undefined?{}:{volunteerSubstitutions:substitutions.volunteerSubstitutions})});
}
export async function checkWorkspaceExportCapacity(c,org){
  const usage=await logicalBackupBytes(c,org);
  if(usage>60*1024*1024)fail(422,'quota','This workspace reached its 60 MiB retained record and history budget.');
  const features=await readWorkspaceFeatures(c,org);
  const backup=await assembleWorkspaceBackup(c,org,{features}),bytes=Buffer.byteLength(JSON.stringify(backup));
  if(bytes>64*1024*1024)fail(422,'learning_backup_size','The complete workspace backup would exceed 64 MiB. This change was rolled back.');
  const feedback=await measureFeedbackIntakeRemaining(c,org,backup.intake,{expected:features.feedback===true});
  const needsProjection=feedback!==null||backup.resourceReservations!==undefined||backup.volunteerSubstitutions!==undefined||features.present||features.incubator||features.checkins||features.groups||features.field||features.crm||features.recurrence||features.reminders||restoredParticipationRecurrenceReports(backup).present||restoredContactReconciliationReports(backup).present||inspectFieldResponseRecovery(backup).present||backup.participationGroups!==undefined||backup.participantCheckins!==undefined||backup.incubatorBridge!==undefined||[3,4].includes(backup.participation?.version);
  const operational=needsProjection?await measureLearningOperationalCapacity(c,org,backup.participation):null;
  const resources=await measureResourceReservationRemaining(c,org,backup.resourceReservations);
  const requiredUsage=usage+(operational?.sourceLogicalGrowthBytes||0)+(resources?.retainedGrowthBytes||0)+(feedback?.retainedGrowthBytes||0);
  const requiredBackupBytes=bytes+(operational?.sourceWireGrowthBytes||0)+(resources?.nativeGrowthBytes||0)+(feedback?.nativeGrowthBytes||0);
  if(feedback&&(requiredUsage>60*1024*1024||requiredBackupBytes>64*1024*1024))
    fail(422,'feedback_intake_capacity','The workspace must retain enough room for its remaining feedback and other workspace exits.');
  if(resources&&(requiredUsage>60*1024*1024||requiredBackupBytes>64*1024*1024))
    fail(422,'resource_reservation_capacity','The workspace must retain enough capacity for its remaining participation and reservation exits.');
  if(requiredUsage>60*1024*1024||requiredBackupBytes>64*1024*1024)
    fail(422,'learning_operational_capacity','The complete workspace cannot retain its bounded delivery status growth within the existing 60 MiB storage and 64 MiB backup limits.');
  const restore=needsProjection?await checkLearningRestoreCapacity(c,backup):null;
  return {usage,backupBytes:bytes,requiredUsage,requiredBackupBytes,operational,restore,...(resources?{resourceReservations:resources}:{}),...(feedback?{feedbackIntake:feedback}:{})};
}

/** The optional export journal must not strand an already valid exit. This
 * adds no ordinary, restore or future-copy reserve and leaves the v3 safety
 * path unchanged. Failure to measure simply omits this optional journal. */
export async function canRetainIncubatorExportAudit(c, org, event) {
  try {
    const features = await readWorkspaceFeatures(c, org);
    if ((features.reservations || features.feedback) && (!features.recurrence || features.reminders)) {
      const {canRetainWorkspaceExitAudit} = await import('./resource-reservation-capacity.mjs');
      return (await canRetainWorkspaceExitAudit(c,org,event)) === true;
    }
    if (features.reminders) {
      const {canRetainReminderSafetyAudit} = await import('./participation-reminder-capacity.mjs');
      return canRetainReminderSafetyAudit(c,org,event);
    }
    if (!features.incubator && !features.field && !features.crm && !features.recurrence) return true;
    if (!features.recurrence && (await exportParticipation(c, org)).version === 3) return true;
    const backup = await assembleWorkspaceBackup(c, org),
      usage = await logicalBackupBytes(c, org);
    const candidate = {
      ...event,
      id: "9223372036854775807",
      created_at: "2200-12-31T23:59:59.999999+14:00",
    };
    const measured = (
      await c.query(
        "SELECT octet_length(to_jsonb(candidate)::text) AS bytes,to_jsonb(candidate)-'id'-'created_at' AS fields FROM jsonb_populate_record(NULL::os_events,$1::jsonb) AS candidate",
        [JSON.stringify(candidate)],
      )
    ).rows[0];
    if (
      !measured ||
      !Number.isSafeInteger(Number(measured.bytes)) ||
      Number(measured.bytes) < 1 ||
      Object.keys(measured.fields).sort().join(",") !==
        "action,actor_id,detail,module_id,org_id,record_id"
    )
      return false;
    // Native bigint IDs are strings and timestamps use the pg Date wire shape.
    // Include a comma and an extra separator byte, independently of SQL spaces.
    const wireBound =
      Buffer.byteLength(
        JSON.stringify({
          ...measured.fields,
          id: candidate.id,
          created_at: "2200-12-31T23:59:59.999Z",
        }),
      ) + 2;
    if (features.recurrence) {
      const { measureParticipationRecurrenceSourceCapacity } = await import('./participation-recurrence-capacity.mjs');
      const remaining = await measureParticipationRecurrenceSourceCapacity(c, org, backup);
      return remaining.requiredUsage + Number(measured.bytes) <= 60 * 1024 * 1024 &&
        remaining.requiredBackupBytes + wireBound <= 64 * 1024 * 1024;
    }
    return (
      usage + Number(measured.bytes) <= 60 * 1024 * 1024 &&
      Buffer.byteLength(JSON.stringify(backup)) + wireBound <= 64 * 1024 * 1024
    );
  } catch {
    return false;
  }
}

/** Accepted no-write receipt reads retain actual hard caps without purchasing
 * a new ordinary mutation's operational/restore reserve a second time. */
export async function checkActualWorkspaceBackupCapacity(c, org) {
  const usage = await logicalBackupBytes(c, org);
  if (usage > 60 * 1024 * 1024)
    fail(
      422,
      "quota",
      "The complete workspace exceeds its retained record and history budget.",
    );
  const backup = await assembleWorkspaceBackup(c, org),
    backupBytes = Buffer.byteLength(JSON.stringify(backup));
  if (backupBytes > 64 * 1024 * 1024)
    fail(422, "backup_size", "The complete workspace backup exceeds 64 MiB.");
  return { usage, backupBytes };
}
