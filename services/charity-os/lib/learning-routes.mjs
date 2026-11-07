import {fail,hash} from './security.mjs';
import {learningObject,learningEnum,learningNumber,LearningError} from './learning-json.mjs';
import {currentLearningMember} from './learning-access.mjs';
import {loadLearningInventory} from './learning-history.mjs';
import {readLearningJSON,readLearningUpload,learningCommitInput,learningQuery} from './learning-requests.mjs';
import {inspectLearningSource,previewLearningCommand,commitLearningCommand} from './learning-commands.mjs';
import {prepareLearningReport} from './learning-reports.mjs';
import {learningReadRoute} from './learning-read-routes.mjs';
import {learningUploadPart,storeLearningUploadPart,assembledLearningUpload,removeLearningUpload} from './learning-uploads.mjs';

const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const okay=value=>new Response(JSON.stringify({ok:true,...value}),{headers});
const operations={'mapping/preview':'map','measurements/preview':null,'corrections/apply/preview':'apply-correction',
 'corrections/abandon/preview':'abandon-correction','decisions/preview':'decide','reports/preview':'freeze'};

/** Invoked only after the handler's real authentication and CSRF gates. */
export async function learningRoutes({request,url,db,settings,session}){
 const match=url.pathname.match(/^\/api\/orgs\/([A-Za-z0-9_-]{1,100})\/learning(?:\/(.*))?$/);
 if(!match)return null;
 const [,org,tail='']=match,method=request.method;
 try{
  if(!['GET','POST'].includes(method))fail(405,'learning_method','Use the documented Learning action.');
  await db.limit(`learning-${method==='GET'?'read':'write'}:${hash(session.user.id)}`,method==='GET'?120:60,3600);
  if(method==='POST'&&tail==='source/inspect')await db.limit(`learning-upload:${hash(session.user.id)}`,6,900);
  if(method==='GET')return await db.tx(session.user.id,org,async c=>{
   const member=await currentLearningMember(c,org,session,{readOnly:true});
   const response=await learningReadRoute({c,org,member,tail,url});
   if(!response)fail(404,'learning_route','This learning route is unavailable.');return response;
  },{readOnly:true});
  learningQuery(url,[]);
  if(tail!=='source/inspect'&&tail!=='source/upload'&&tail!=='commit'&&tail!=='reports/prepare'&&!Object.hasOwn(operations,tail))
   fail(404,'learning_route','This learning route is unavailable.');
  // Refuse unauthorized uploads before allocating native file/parser work.
  await db.tx(session.user.id,org,c=>currentLearningMember(c,org,session,{source:tail.startsWith('source/')}));
  const chunkInspection=tail==='source/inspect'&&/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||'');
  const parsed=tail==='source/inspect'&&!chunkInspection?await readLearningUpload(request):await readLearningJSON(request,
   tail==='source/upload'?2008192:chunkInspection?16384:tail==='commit'?4096:131072);
  if(tail==='source/upload'){
   learningUploadPart(parsed);
   if(parsed.index===0)await db.limit(`learning-upload-start:${hash(session.user.id)}`,6,900);
  }
  return await db.tx(session.user.id,org,async c=>{
   const member=await currentLearningMember(c,org,session),args={org,user:session.user.id,member,session};
   if(tail==='source/upload')return storeLearningUploadPart(c,{...args,input:parsed});
   if(tail==='source/inspect'){
    const source=chunkInspection?await assembledLearningUpload(c,{...args,input:parsed}):parsed;
    const inspected=await inspectLearningSource(c,{...args,metadata:source.metadata,native:source.native});
    if(chunkInspection)await removeLearningUpload(c,org,source);
    return okay(inspected);
   }
   if(tail==='commit')return okay(await commitLearningCommand(c,{...args,input:learningCommitInput(parsed)}));
   if(tail==='reports/prepare'){
    learningObject(parsed,['selection','manifestRevision']);learningNumber(parsed.manifestRevision,1,2147483647);
    return okay(await prepareLearningReport(c,{...args,inventory:await loadLearningInventory(c,org),...parsed}));
   }
   let operation=operations[tail],input=parsed;
   if(tail==='measurements/preview'){
    learningObject(parsed,['kind','input']);learningEnum(parsed.kind,['measurement','correction']);
    operation=parsed.kind==='measurement'?'measure':'correct';input=parsed.input;
   }
   return okay(await previewLearningCommand(c,{...args,operation,input}));
  },{lock:true});
 }catch(error){
  if(error instanceof LearningError)return new Response(JSON.stringify({ok:false,code:error.code,message:error.message,
   ...(error.issues?{issues:error.issues}:{})}),{status:error.status,headers});
  throw error;
 }
}
