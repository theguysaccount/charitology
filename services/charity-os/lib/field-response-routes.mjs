/** Dispatch before the generic org body/transaction. All mutations use the real DB factory. */
import { fail, json, hash } from './security.mjs';
import { isFieldResponsePath, readFieldResponseBody, fieldId, validateFieldCommitRequest } from './field-response-http.mjs';
import { fieldResponseContext, inspectFieldResponses, previewFieldResponses, acceptedFieldResponseCommand, commitFieldResponses } from './field-response-commands.mjs';
import { currentFieldMember } from './field-response-commands.mjs';
import { listFieldResponseReports, readFieldResponseReport } from './field-response-store.mjs';
const okay=value=>json({ok:true,...value});
export async function fieldResponseRoutes({request,url=new URL(request.url),db,session}){
 if(!isFieldResponsePath(url.pathname))return null;
 const match=/^\/api\/orgs\/([A-Za-z0-9_-]{1,100})\/field-responses\/(context|inspect|preview|commit|history)(?:\/([A-Za-z0-9_-]{1,100}))?$/.exec(url.pathname);if(!match)fail(404,'field_route','This aggregate import route is unavailable.');
 const [,org,action,reportId]=match,method=request.method;if(method==='HEAD')fail(405,'field_method','Use GET to read aggregate import history.');
 const read=['context','history'].includes(action),allowed=read?'GET':'POST';if(method!==allowed||reportId&&action!=='history')fail(405,'field_method','Use the documented aggregate import operation.');
 if(read&&(request.body!==null||request.headers.has('transfer-encoding')||request.headers.has('content-length')&&request.headers.get('content-length')!=='0'))fail(400,'field_body','Read aggregate imports without a body.');
 if(action!=='history'&&url.search)fail(422,'field_query','This operation takes no query fields.');
 const user=fieldId(session.user.id);
 await db.limit('field-response-'+(read?'read':'write')+':'+hash(user),read?120:60,3600);
 if(action==='inspect')await db.limit('field-response-inspect:'+hash(user),6,900);
 // Admit fresh staff/creation permission before allocating the bounded POST body.
 if(!read)await db.tx(user,org,c=>currentFieldMember(c,org,session,{readOnly:true,write:true}),{readOnly:true});
 if(action==='context')return okay(await db.tx(user,org,c=>fieldResponseContext(c,{org,session}),{readOnly:true}));
 if(action==='history'){
  const names=[...url.searchParams.keys()];if(names.some(k=>!['after','limit'].includes(k))||new Set(names).size!==names.length||reportId&&names.length)fail(422,'field_query','Use one bounded history page.');
  const after=url.searchParams.get('after'),text=url.searchParams.get('limit')||'20';if(after!==null)fieldId(after);if(!/^(?:[1-9]|1[0-9]|20)$/.test(text))fail(422,'field_query','Read at most twenty imports per page.');
  return okay(await db.tx(user,org,async c=>{const{member}=await currentFieldMember(c,org,session,{readOnly:true});return reportId?{report:await readFieldResponseReport(c,{org,id:reportId,member})}:await listFieldResponseReports(c,{org,member,after,limit:Number(text)});},{readOnly:true}));
 }
 const input=await readFieldResponseBody(request);
 if(action==='inspect')return okay(await db.tx(user,org,c=>inspectFieldResponses(c,{org,session,input}),{readOnly:true}));
 if(action==='preview')return okay(await db.tx(user,org,c=>previewFieldResponses(c,{org,session,input}),{lock:true}));
 validateFieldCommitRequest(input);const args={org,session,input};
 const accepted=await db.tx(user,org,c=>acceptedFieldResponseCommand(c,args),{readOnly:true});if(accepted)return okay(accepted);
 try{return okay(await db.tx(user,org,c=>commitFieldResponses(c,args),{lock:true}));}
 catch(error){
  // Read only: reconcile a concurrent accepted result, never resubmit a mutation.
  try{const saved=await db.tx(user,org,c=>acceptedFieldResponseCommand(c,args),{readOnly:true});if(saved)return okay(saved);}catch{}
  throw error;
 }
}
