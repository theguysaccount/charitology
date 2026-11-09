/** Main handler already established actual sign-in and CSRF. No auto Retry. */
import {hash,json,fail} from './security.mjs';
import {classifyParticipationRecurrenceRequest,readParticipationRecurrenceBody} from './participation-recurrence-http.mjs';
import {recurrencePreflight} from './participation-recurrence-context.mjs';
import {inspectParticipationRecurrence,planParticipationRecurrence,previewParticipationRecurrence,recurrenceCreateRequest,acceptedParticipationRecurrence,createParticipationRecurrence,participationRecurrenceHistory} from './participation-recurrence-commands.mjs';
import {id,prop,need} from './participation-recurrence-values.mjs';
const okay=v=>json({ok:true,...v},200,{'referrer-policy':'no-referrer'});
export async function participationRecurrenceRoutes({request,url=new URL(request.url),db,session}){
  try{
    const route=classifyParticipationRecurrenceRequest(url.pathname,request.method,url.search);if(!route)return null;
    const org=route.orgId,user=id(prop(prop(session,'user'),'id')),read=route.operation.startsWith('history');
    if(read)need(request.body===null&&!request.headers.has('transfer-encoding')&&(!request.headers.has('content-length')||request.headers.get('content-length')==='0'),'recurrence_body',400);
    await db.tx(user,org,c=>recurrencePreflight(c,{org,session,write:!read}),{readOnly:true});
    await db.limit('participation-recurrence-'+(read?'read:':'write:')+hash(user),read?120:60,3600);
    if(read)return okay(await db.tx(user,org,c=>participationRecurrenceHistory(c,{org,session,reportId:route.reportId,after:route.after,limit:route.limit}),{readOnly:true}));
    if(['plan','preview'].includes(route.operation))await db.limit('participation-recurrence-calendar:'+hash(user),6,900);
    const input=await readParticipationRecurrenceBody(request),args={org,session,input};
    if(route.operation==='inspect')return okay(await db.tx(user,org,c=>inspectParticipationRecurrence(c,args),{lock:true,readOnly:true}));
    if(route.operation==='plan')return okay(await db.tx(user,org,c=>planParticipationRecurrence(c,args),{lock:true,readOnly:true}));
    if(route.operation==='preview')return okay(await db.tx(user,org,c=>previewParticipationRecurrence(c,args),{lock:true}));
    recurrenceCreateRequest(input);
    const accepted=await db.tx(user,org,c=>acceptedParticipationRecurrence(c,args),{readOnly:true});if(accepted)return okay(accepted);
    try{return okay(await db.tx(user,org,c=>createParticipationRecurrence(c,args),{lock:true}));}
    catch(error){
      // After uncertain/racing write settlement, read only an already accepted
      // exact original intent. No second mutation or new key is attempted.
      try{const saved=await db.tx(user,org,c=>acceptedParticipationRecurrence(c,args),{readOnly:true});if(saved)return okay(saved);}catch{}
      throw error;
    }
  }catch(error){
    if(['RecurringOccurrenceError','RecurringOccurrencePacketError','RecurringScheduleError'].includes(error?.name))fail(error.status||422,error.code||'recurrence_fields','Review this finite draft batch or reconcile its retained history.');
    throw error;
  }
}
