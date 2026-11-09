/** Closed transport only; router establishes current permission before body. */
import {readBackupBody} from './backup-json.mjs';
import {need,id,fields,owned} from './participation-recurrence-values.mjs';
const PREFIX=/^\/api\/orgs\/([A-Za-z0-9_-]{1,100})\/participation-recurrence(?:\/|$)/;
export function classifyParticipationRecurrenceRequest(path,method,search=''){
  if(typeof path!=='string'||!PREFIX.test(path))return null;
  const m=/^\/api\/orgs\/([A-Za-z0-9_-]{1,100})\/participation-recurrence\/(inspect|plan|preview|create|history)(?:\/([A-Za-z0-9_-]{1,100}))?$/.exec(path);need(m,'recurrence_path',404);
  const [,orgId,action,reportId]=m,read=action==='history';need(method===(read?'GET':'POST'),'recurrence_method',405);need(read||reportId===undefined,'recurrence_path',404);
  const q=new URLSearchParams(search);need([...q.keys()].every(k=>read&&reportId===undefined&&['after','limit'].includes(k))&&new Set(q.keys()).size===[...q].length,'recurrence_query');
  const after=q.has('after')?id(q.get('after')):null,raw=q.get('limit');need(raw===null||/^(?:[1-9]|1[0-9]|20)$/.test(raw));
  return{orgId:id(orgId),operation:reportId?'history-detail':action,reportId:reportId??null,after,limit:raw===null?20:Number(raw)};
}
export async function readParticipationRecurrenceBody(request){
  need(request.method==='POST','recurrence_method',405);need(/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''),'content_type',415);
  return owned(await readBackupBody(request,32768),32768);
}
