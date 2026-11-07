import {fail} from './security.mjs';
import {learningHash as H,learningSame} from './learning-json.mjs';
import {validateLearningEvent} from './learning-model.mjs';

const capabilities=new WeakMap();
const binding=r=>({id:r.id,moduleId:r.moduleId,data:r.data,status:r.status,revision:r.revision,
  ownerId:r.ownerId,approval:r.approval??null,snapshot:r.snapshot??null,source:r.source??null});
/** Server-only, exact one-use record capabilities; never accepted from an HTTP body. */
export function learningWriteCapability(operation,records){
  if(!['create','freeze','restore'].includes(operation))throw new Error('Unknown internal learning write.');
  const token=Object.freeze({}),expected=new Map(records.map(record=>[record.id,H('data',binding(record))]));
  capabilities.set(token,{operation,expected});return token;
}
function consume(record,token){
  const capability=capabilities.get(token);
  if(!capability||capability.expected.get(record.id)!==H('data',binding(record)))
    fail(409,'learning_write','The internal learning record changed before its write.');
  capability.expected.delete(record.id);if(!capability.expected.size)capabilities.delete(token);
  return capability.operation;
}
export async function guardLearningWrite(c,record,options={}){
  if(options.learningCapability){consume(record,options.learningCapability);return;}
  if(!['outcomes','evaluation','reporting'].includes(record.moduleId))return;
  const current=(await c.query('SELECT data,status FROM os_records WHERE org_id=$1 AND id=$2',[record.orgId,record.id])).rows[0];
  const previousLearning=current?.data?.assemblyMethod==='learning-review-v1';
  const nextLearning=record.moduleId==='reporting'&&record.data.assemblyMethod==='learning-review-v1';
  if(previousLearning&&['frozen','issued'].includes(current.status)&&!['delete','restore','file'].includes(options.operation))
    fail(409,'learning_frozen','This learning manifest is frozen. Create a new manifest and report edition.');
  if(nextLearning&&['frozen','issued'].includes(record.status)&&!['delete','restore'].includes(options.operation))
    fail(409,'learning_freeze','Use the Learning report preview and freeze action for this manifest.');
  if((previousLearning||nextLearning)&&options.operation==='file')
    fail(409,'learning_files','Learning manifests do not accept new file attachments.');

  const rows=(await c.query("SELECT payload,origin_mode FROM os_learning_history WHERE org_id=$1 AND row_kind='event' AND (payload#>>'{payload,record,recordId}'=$2 OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(payload#>'{payload,records}','[]'::jsonb)) item WHERE item->>'recordId'=$2)) LIMIT 2",[record.orgId,record.id])).rows;
  if(!rows.length)return;
  if(rows.length!==1)fail(422,'learning_history','This record has conflicting retained learning origins.');
  const created=validateLearningEvent(rows[0].payload),payload=created.payload;
  const descriptor=payload.record??payload.records?.find(item=>item.recordId===record.id);
  if(!descriptor||descriptor.moduleId!==record.moduleId||H('data',record.data)!==descriptor.dataSha256)
    fail(409,'learning_owned','Use a new mapping, measurement correction or new decision to change these learning fields. Your form has not been saved.');
  if(options.operation==='file')fail(409,'learning_files','Learning-created records do not accept new file attachments.');
  if(payload.kind!=='corrected')return;
  const terminals=(await c.query("SELECT payload FROM os_learning_history WHERE org_id=$1 AND row_kind='event' AND origin_org_id=$2 AND binding_id=$3 AND payload#>>'{payload,correctionEventSha256}'=$4 ORDER BY sequence",[record.orgId,created.originOrgId,created.bindingId,created.sha256])).rows.map(row=>validateLearningEvent(row.payload));
  if(terminals.length>1)fail(422,'learning_history','The correction has conflicting terminal dispositions.');
  const state=terminals[0]?.payload.kind??'pending';
  if(state==='pending'&&options.operation==='delete')
    fail(409,'learning_correction','Abandon this correction attempt before putting its draft in trash.');
  if(state==='correction-abandoned'&&options.operation!=='delete'&&options.operation!=='restore'&&record.approval!==null)
    fail(409,'learning_correction','This correction attempt was abandoned. Create a fresh correction instead of approving or reusing it.');
}
