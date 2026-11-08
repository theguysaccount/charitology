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

const workspaceFeatures=async(c,org)=>(await c.query("SELECT EXISTS(SELECT 1 FROM os_learning_history WHERE org_id=$1) OR EXISTS(SELECT 1 FROM os_learning_previews WHERE org_id=$1) OR EXISTS(SELECT 1 FROM os_reports WHERE org_id=$1 AND (payload->>'kind'='learning-review' OR payload->>'methodVersion' LIKE 'learning-%')) AS present, EXISTS(SELECT 1 FROM os_incubator_history WHERE org_id=$1) OR EXISTS(SELECT 1 FROM os_previews WHERE org_id=$1 AND committed_at IS NULL AND kind IN ('incubator-source-inspection-v1','incubator-copy-preview-v1')) AS incubator",[org])).rows[0];

/** The HTTP export and transaction capacity check use this same exact inventory. */
export async function assembleWorkspaceBackup(c,org,{organization,records}={}){
  organization??=(await c.query('SELECT * FROM os_orgs WHERE id=$1',[org])).rows[0];
  if(!organization)fail(404,'organization','This organization is unavailable.');
  records??=await allRecords(c,org);
  const comments=(await c.query('SELECT * FROM os_comments WHERE org_id=$1',[org])).rows;
  const events=(await c.query('SELECT * FROM os_events WHERE org_id=$1 ORDER BY id',[org])).rows;
  const reports=(await c.query('SELECT * FROM os_reports WHERE org_id=$1',[org])).rows.filter(row=>!isLearningReportFamily(row.payload));
  const files=(await c.query("SELECT id,record_id AS \"recordId\",name,mime,checksum,size,encode(bytes,'base64') AS content FROM os_files WHERE org_id=$1 AND record_id IN (SELECT id FROM os_records WHERE org_id=$1 AND deleted_at IS NULL)",[org])).rows;
  const trash=(await c.query('SELECT * FROM os_records WHERE org_id=$1 AND deleted_at IS NOT NULL',[org])).rows.map(rowRecord);
  const trashFiles=(await c.query("SELECT id,record_id AS \"recordId\",name,mime,checksum,size,encode(bytes,'base64') AS content FROM os_files WHERE org_id=$1 AND record_id IN (SELECT id FROM os_records WHERE org_id=$1 AND deleted_at IS NOT NULL)",[org])).rows;
  const integrations=(await c.query('SELECT id,provider,name,config FROM os_integrations WHERE org_id=$1',[org])).rows;
  const learningBridge=await exportLearningBridge(c,org,{records,trash,legacyReports:reports,sourceOrgId:org});
  const incubatorBridge=await exportIncubatorBridge(c,org,{records,trash});
  return makeBackup(organization,records,{comments,events,reports,files,trash,trashFiles,integrations,
    intake:await exportIntake(c,org),participation:await exportParticipation(c,org),
    delivery:await exportDelivery(c,org),taskRecurrence:await exportTaskRecurrence(c,org),
    directoryResources:await exportDirectoryResources(c,org,{records,trash}),
    ...(learningBridge===undefined?{}:{learningBridge}),
    ...(incubatorBridge===undefined?{}:{incubatorBridge})});
}
export async function checkWorkspaceExportCapacity(c,org){
  const usage=await logicalBackupBytes(c,org);
  if(usage>60*1024*1024)fail(422,'quota','This workspace reached its 60 MiB retained record and history budget.');
  const backup=await assembleWorkspaceBackup(c,org),bytes=Buffer.byteLength(JSON.stringify(backup));
  if(bytes>64*1024*1024)fail(422,'learning_backup_size','The complete workspace backup would exceed 64 MiB. This change was rolled back.');
  const features=await workspaceFeatures(c,org);
  const needsProjection=features.present||features.incubator||backup.incubatorBridge!==undefined||backup.participation?.version===3;
  const operational=needsProjection?await measureLearningOperationalCapacity(c,org,backup.participation):null;
  const requiredUsage=usage+(operational?.sourceLogicalGrowthBytes||0),requiredBackupBytes=bytes+(operational?.sourceWireGrowthBytes||0);
  if(requiredUsage>60*1024*1024||requiredBackupBytes>64*1024*1024)
    fail(422,'learning_operational_capacity','The complete workspace cannot retain its bounded delivery status growth within the existing 60 MiB storage and 64 MiB backup limits.');
  const restore=needsProjection?await checkLearningRestoreCapacity(c,backup):null;
  return {usage,backupBytes:bytes,requiredUsage,requiredBackupBytes,operational,restore};
}

/** The optional export journal must not strand an already valid exit. This
 * adds no ordinary, restore or future-copy reserve and leaves the v3 safety
 * path unchanged. Failure to measure simply omits this optional journal. */
export async function canRetainIncubatorExportAudit(c, org, event) {
  try {
    if (!(await workspaceFeatures(c, org)).incubator) return true;
    if ((await exportParticipation(c, org)).version === 3) return true;
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
