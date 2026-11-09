/** Normal created-audit projection from an exact supplied SQL row. No clock,
 * authority, lookup or write. Capacity also uses explicitly budget-only rows. */
import {compareGroupExactStamps} from './participation-group-model.mjs';
import {need,fields,owned,id,stamp,same,freeze} from './participation-recurrence-values.mjs';
const ROW='org_id id module_id data status owner_id last_editor_id revision approval snapshot source deleted_at created_at updated_at'.split(' ');
const CANDIDATE='id orgId moduleId data status ownerId lastEditedBy revision approval snapshot source'.split(' ');
export function recurrenceCreatedAuditRecord(sqlRow,candidate){
  const r=fields(owned(sqlRow),ROW),c=fields(owned(candidate),CANDIDATE);for(const x of [r.org_id,r.id,r.owner_id,r.last_editor_id])id(x);stamp(r.created_at);stamp(r.updated_at);
  need(compareGroupExactStamps(r.created_at,r.updated_at)<=0,'recurrence_created_row');
  need(['events','volunteers'].includes(r.module_id)&&r.status==='draft'&&r.revision===1&&r.approval===null&&r.snapshot===null&&r.source===null&&r.deleted_at===null,'recurrence_created_row');
  const actual={id:r.id,orgId:r.org_id,moduleId:r.module_id,data:r.data,status:r.status,ownerId:r.owner_id,lastEditedBy:r.last_editor_id,revision:r.revision,approval:r.approval,snapshot:r.snapshot,source:r.source};
  need(same(actual,c),'recurrence_created_row');
  // Exactly ordinary rowRecord display fields, with source omitted ONLY for
  // the normal record.created grammar. Dates format actual supplied SQL times
  // to that established UTC-millisecond view; no Date.now/new processing time.
  const {source,...record}=actual;
  return freeze({...record,createdAt:new Date(r.created_at).toISOString(),updatedAt:new Date(r.updated_at).toISOString()});
}
