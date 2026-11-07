/** Original native bytes, transient and purpose/session separated from backup uploads. */
import { uploadPart } from './uploads.mjs';
import { fail, hash } from './security.mjs';
import { learningActorHash } from './learning-access.mjs';
import { learningObject, learningNumber, learningHashValue, LEARNING_LIMITS } from './learning-json.mjs';
import { learningSourceMetadata } from './learning-requests.mjs';

export const LEARNING_CHUNK_BYTES = 1500000;
const bad = () => fail(422,'learning_upload','Use the documented complete native upload.');
const uploadId = value => { if(typeof value!=='string'||!/^[a-f0-9]{32}$/.test(value))bad();return value; };
export const learningUploadActor = (member,session) => hash({kind:'charitology-learning-source-upload-v1',actor:learningActorHash(member,session)});
export function learningUploadPart(input){
 learningObject(input,Object.hasOwn(input??{},'uploadId')?['uploadId','index','total','chunk']:['index','total','chunk']);
 if(Object.hasOwn(input,'uploadId'))uploadId(input.uploadId);
 learningNumber(input.total,1,Math.ceil(LEARNING_LIMITS.nonprofitBytes/LEARNING_CHUNK_BYTES));
 learningNumber(input.index,0,input.total-1);
 if(input.index>0&&!input.uploadId)bad();
 if(typeof input.chunk!=='string'||input.chunk.length>2000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.chunk))bad();
 const bytes=Buffer.from(input.chunk,'base64');
 if(bytes.toString('base64')!==input.chunk||bytes.length<1||bytes.length>LEARNING_CHUNK_BYTES||
   (input.index<input.total-1&&bytes.length!==LEARNING_CHUNK_BYTES)||
   (input.index===input.total-1&&bytes.length>LEARNING_LIMITS.nonprofitBytes-(input.total-1)*LEARNING_CHUNK_BYTES))bad();
 return input;
}
export async function storeLearningUploadPart(c,{org,member,session,input}){
 learningUploadPart(input);const actor=learningUploadActor(member,session);
 if(input.index>0&&!(await c.query('SELECT 1 FROM os_uploads WHERE org_id=$1 AND id=$2 AND actor_id=$3 AND part=0 AND total=$4 AND expires_at>now()',[org,input.uploadId,actor,input.total])).rowCount)
   fail(409,'learning_upload','Start this complete native upload at its first part.');
 return uploadPart({c,org,user:actor,input});
}
export async function assembledLearningUpload(c,{org,member,session,input}){
 learningObject(input,['metadata','upload']);
 const metadata=learningSourceMetadata(input.metadata),upload=input.upload;
 if(Buffer.byteLength(JSON.stringify(metadata))>8192)bad();
 learningObject(upload,['uploadId','byteLength','sha256']);uploadId(upload.uploadId);learningHashValue(upload.sha256);
 const max=metadata.adapter==='theory-of-change-native-v1'?LEARNING_LIMITS.tocBytes:LEARNING_LIMITS.nonprofitBytes;
 learningNumber(upload.byteLength,1,max);
 const actor=learningUploadActor(member,session),rows=(await c.query('SELECT * FROM os_uploads WHERE org_id=$1 AND id=$2 AND actor_id=$3 AND expires_at>now() ORDER BY part',[org,upload.uploadId,actor])).rows;
 const total=Math.ceil(upload.byteLength/LEARNING_CHUNK_BYTES);
 if(rows.length!==total||rows.some((row,index)=>row.part!==index||row.total!==total||hash(row.bytes)!==row.checksum||
   row.bytes.length!==(index===total-1?upload.byteLength-index*LEARNING_CHUNK_BYTES:LEARNING_CHUNK_BYTES)))
   fail(409,'learning_upload','This native upload is incomplete, expired or belongs to a different session. Choose the original file again.');
 const native=Buffer.concat(rows.map(row=>row.bytes),upload.byteLength);
 if(native.length!==upload.byteLength||hash(native)!==upload.sha256)fail(409,'learning_upload','The complete uploaded bytes differ from the selected file. Choose the original file again.');
 return {metadata,native,uploadId:upload.uploadId,uploadActor:actor};
}
export async function removeLearningUpload(c,org,value){
 await c.query('DELETE FROM os_uploads WHERE org_id=$1 AND id=$2 AND actor_id=$3',[org,value.uploadId,value.uploadActor]);
}
