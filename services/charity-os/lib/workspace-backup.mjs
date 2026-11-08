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
  const learningPresent=(await c.query("SELECT EXISTS(SELECT 1 FROM os_learning_history WHERE org_id=$1) OR EXISTS(SELECT 1 FROM os_learning_previews WHERE org_id=$1) OR EXISTS(SELECT 1 FROM os_reports WHERE org_id=$1 AND (payload->>'kind'='learning-review' OR payload->>'methodVersion' LIKE 'learning-%')) AS present",[org])).rows[0].present;
  const operational=learningPresent||backup.incubatorBridge!==undefined||backup.participation?.version===3?await measureLearningOperationalCapacity(c,org,backup.participation):null;
  const requiredUsage=usage+(operational?.sourceLogicalGrowthBytes||0),requiredBackupBytes=bytes+(operational?.sourceWireGrowthBytes||0);
  if(requiredUsage>60*1024*1024||requiredBackupBytes>64*1024*1024)
    fail(422,'learning_operational_capacity','The complete workspace cannot retain its bounded delivery status growth within the existing 60 MiB storage and 64 MiB backup limits.');
  const restore=learningPresent||backup.incubatorBridge!==undefined||backup.participation?.version===3?await checkLearningRestoreCapacity(c,backup):null;
  return {usage,backupBytes:bytes,requiredUsage,requiredBackupBytes,operational,restore};
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
