/** Publish exactly one current approved fixed anonymous feedback form.
 * The handler owns the transaction and authenticated session. */
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {feedbackSchemaFromReviewedFormData} from './feedback-intake-form.mjs';

const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
const revision=v=>Number.isSafeInteger(v)&&v>0&&v<=2147483647;
const fail=(status,code,message)=>{throw Object.assign(Error(message),{status,code});};
const row=(r)=>Array.isArray(r?.rows)&&r.rows.length===1?r.rows[0]:null;
const SQL=Object.freeze({
  lock:"SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
  clock:"SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD') AS utc_day",
  existing:"SELECT id,record_id,source_revision,kind,target_id,target_module,target_revision,schema,withdrawn_at FROM os_publications WHERE org_id=$1 AND id=$2 FOR SHARE",
  daily:"SELECT count(*)::text AS count FROM os_publications WHERE org_id=$1 AND created_at >= ($2::date::timestamp AT TIME ZONE 'UTC')",
  insert:"INSERT INTO os_publications(org_id,id,record_id,source_revision,kind,target_id,target_module,target_revision,schema,created_by) VALUES($1,$2,$3,$4,'feedback',NULL,NULL,NULL,$5::jsonb,$6) RETURNING id",
});
export const FEEDBACK_PUBLICATION_SQL=SQL;
const publicationId=(orgId,recordId,sourceRevision)=>createHash('sha256')
  .update(JSON.stringify(['charitology-feedback-publication-v1',orgId,recordId,sourceRevision])).digest('hex').slice(0,32);

export async function recordFeedbackPublication(c,{
  orgId,input,authenticate,loadSource,isAccepting,saveAudit,admit,urlFor,
}){
  if(!id(orgId)||!input||Object.getPrototypeOf(input)!==Object.prototype||
    Object.keys(input).sort().join(',')!=='recordId,revision'||!id(input.recordId)||!revision(input.revision))
    fail(422,'feedback_publication_fields','Choose the exact reviewed feedback form revision.');
  if([authenticate,loadSource,isAccepting,saveAudit,admit,urlFor].some(f=>typeof f!=='function'))
    throw TypeError('The feedback publication route is missing its server checks.');
  await c.query(SQL.lock,[orgId]);
  const actor=await authenticate(c,orgId);
  if(!id(actor))fail(403,'feedback_staff_authority','Current organization-wide Forms and Feedback access is required.');
  const source=await loadSource(c,orgId,input.recordId);
  if(!source||source.orgId!==orgId||source.id!==input.recordId||source.moduleId!=='forms'||source.revision!==input.revision)
    fail(409,'feedback_publication_revision','Read the current approved form before publishing.');
  const schema=feedbackSchemaFromReviewedFormData(source.data);
  const today=row(await c.query(SQL.clock))?.utc_day;
  if(typeof today!=='string'||!/^\d{4}-\d\d-\d\d$/.test(today))throw Error('The feedback publication day could not be measured.');
  const p={id:publicationId(orgId,source.id,source.revision),record_id:source.id,source_revision:source.revision,
    kind:'feedback',target_id:null,target_module:null,target_revision:null,schema,withdrawn_at:null};
  if(isAccepting(p,source,null,{today})!==true)fail(409,'feedback_publication_approval','Publish only the current independently approved fixed form.');
  const result=replayed=>({publication:{id:p.id,recordId:source.id,sourceRevision:source.revision,kind:'feedback',
    targetId:null,targetRevision:null,title:schema.title,accepting:true,url:urlFor(orgId,p.id)},replayed});
  const existingResult=await c.query(SQL.existing,[orgId,p.id]);
  if(!Array.isArray(existingResult.rows)||existingResult.rows.length>1)throw Error('The retained publication could not be identified.');
  if(existingResult.rows.length===1){
    const held=existingResult.rows[0];
    if(held.record_id!==p.record_id||held.source_revision!==p.source_revision||held.kind!==p.kind||
      held.target_id!==null||held.target_module!==null||held.target_revision!==null||held.withdrawn_at!==null||
      isAccepting(held,source,null,{today})!==true||!isDeepStrictEqual(held.schema,schema))
      fail(409,'feedback_publication_previous','This form revision already has a withdrawn or changed link. Review a new form revision.');
    return result(true);
  }
  const count=row(await c.query(SQL.daily,[orgId,today]))?.count;
  if(typeof count!=='string'||!/^\d+$/.test(count)||!Number.isSafeInteger(Number(count)))throw Error('The feedback publication count could not be measured.');
  if(Number(count)>=100)fail(429,'intake_daily','This organization has reached its daily publication limit.');
  const saved=row(await c.query(SQL.insert,[orgId,p.id,source.id,source.revision,JSON.stringify(schema),actor]));
  if(saved?.id!==p.id)throw Error('The feedback publication was not confirmed.');
  await saveAudit(c,{orgId,actor,action:'intake.published',record:source,detail:{publicationId:p.id,kind:'feedback',targetId:null}});
  if(await admit(c,orgId)!==true)fail(422,'feedback_publication_capacity','This workspace cannot retain the feedback link and its future withdrawal.');
  return result(false);
}
