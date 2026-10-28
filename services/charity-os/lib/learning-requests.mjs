import {fail} from './security.mjs';
import {parseLearningJSON,learningObject,learningEnum,learningId,learningHashValue,learningNumber,LEARNING_LIMITS} from './learning-json.mjs';

/** A deadline cancels the underlying request reader, not only its delivery. */
export async function readLearningBytes(request,limit){
  const length=request.headers.get('content-length');
  if(length!==null&&(!/^\d{1,10}$/.test(length)||Number(length)>limit))
    fail(413,'learning_size','This complete learning request exceeds its byte limit.');
  if(request.signal.aborted)fail(408,'learning_request','This learning request was cancelled.');
  const reader=request.body?.getReader();
  if(!reader)return new Uint8Array();
  const chunks=[];let size=0,rejectDeadline,finished=false,cancelled=false;
  const deadline=new Promise((_,reject)=>{rejectDeadline=reject;});
  const cancel=()=>{
    if(finished)return;
    cancelled=true;
    rejectDeadline(Object.assign(new Error('The learning request timed out or was cancelled.'),{learningRequestCancelled:true}));
    void reader.cancel().catch(()=>{});
  };
  const timer=setTimeout(cancel,30000);timer.unref?.();
  request.signal.addEventListener('abort',cancel,{once:true});
  try{
    while(true){
      const {done,value}=await Promise.race([reader.read(),deadline]);
      if(cancelled||request.signal.aborted)fail(408,'learning_request','This learning request timed out or was cancelled.');
      if(done)break;
      size+=value.byteLength;
      if(size>limit){await reader.cancel().catch(()=>{});fail(413,'learning_size','This complete learning request exceeds its byte limit.');}
      chunks.push(Buffer.from(value));
    }
    if(cancelled||request.signal.aborted)fail(408,'learning_request','This learning request timed out or was cancelled.');
    return Buffer.concat(chunks,size);
  }catch(error){
    if(error.learningRequestCancelled)fail(408,'learning_request','The learning request timed out or was cancelled. Choose the file again.');
    throw error;
  }finally{
    finished=true;clearTimeout(timer);request.signal.removeEventListener('abort',cancel);reader.releaseLock();
  }
}

export async function readLearningJSON(request,limit=LEARNING_LIMITS.requestBytes){
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')||''))
    fail(415,'learning_content_type','Use the documented JSON request.');
  return parseLearningJSON(await readLearningBytes(request,limit),limit);
}

/** Parsing formData is allowed only after the entire original transport is bounded. */
export async function readLearningUpload(request){
  const type=request.headers.get('content-type')||'';
  if(type.length>240||!/^multipart\/form-data\s*;\s*boundary=(?:[A-Za-z0-9'()+_,.\/:=?-]{1,120}|"[A-Za-z0-9'()+_,.\/:=?-]{1,120}")$/i.test(type))
    fail(415,'learning_content_type','Choose a native JSON export using the Learning file control.');
  const bytes=await readLearningBytes(request,LEARNING_LIMITS.nonprofitBytes+24576);
  let form;
  try{form=await new Request('http://localhost/learning-upload',{method:'POST',headers:{'content-type':type},body:bytes}).formData();}
  catch{fail(422,'learning_multipart','Use exactly one metadata field and one native file.');}
  const keys=[...form.keys()];
  if(keys.length!==2||new Set(keys).size!==2||!keys.includes('metadata')||!keys.includes('native'))
    fail(422,'learning_multipart','Use exactly one metadata field and one native file.');
  const metadata=form.get('metadata'),file=form.get('native');
  if(typeof metadata!=='string'||typeof file==='string'||!file||typeof file.arrayBuffer!=='function')
    fail(422,'learning_multipart','Supply metadata JSON and the actual native file.');
  const meta=learningSourceMetadata(parseLearningJSON(metadata,8192));
  const max=meta.adapter==='theory-of-change-native-v1'?LEARNING_LIMITS.tocBytes:LEARNING_LIMITS.nonprofitBytes;
  if(file.size<1||file.size>max||bytes.length>max+24576||bytes.length-file.size-Buffer.byteLength(metadata)>16384)
    fail(413,'learning_size','The native file or complete multipart request exceeds its byte limit.');
  const native=new Uint8Array(await file.arrayBuffer());
  if(request.signal.aborted)fail(408,'learning_request','This learning request was cancelled.');
  if(native.byteLength!==file.size||native.byteLength>max)fail(413,'learning_size','The actual native bytes exceed their limit.');
  // Neither filename nor browser MIME becomes source provenance.
  return {metadata:meta,native};
}

export function learningSourceMetadata(meta){
  learningObject(meta,['version','adapter','selection','target']);learningEnum(meta.version,[1]);
  learningEnum(meta.adapter,['theory-of-change-native-v1','nonprofit-learning-native-v1']);
  if(meta.adapter==='theory-of-change-native-v1'){
    learningObject(meta.selection,['kind']);learningEnum(meta.selection.kind,['whole-draft']);
  }else{
    learningObject(meta.selection,['kind','recordId']);learningEnum(meta.selection.kind,['learning-row']);learningId(meta.selection.recordId);
  }
  return meta;
}

export function learningQuery(url,allowed=[]){
  const query=new URLSearchParams(url.search);
  if(query.getAll('path').length===1&&query.get('path')===url.pathname.slice(5))query.delete('path');
  for(const key of query.keys())if(!allowed.includes(key)||query.getAll(key).length!==1)
    fail(422,'learning_query','Use only the documented learning query.');
  return query;
}
export function learningCommitInput(value){
  learningObject(value,['previewId','reviewSha256','commandKey']);learningId(value.previewId);learningHashValue(value.reviewSha256);
  if(typeof value.commandKey!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.commandKey))
    fail(422,'learning_command','Use one lowercase UUIDv4 command key.');
  return value;
}
