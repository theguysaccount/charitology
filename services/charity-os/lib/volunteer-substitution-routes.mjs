/** Closed staff transport for volunteer shift handoffs. */
import {readBackupBody} from "./backup-json.mjs";
import {checkCsrf,fail,hash,HttpError,json} from "./security.mjs";
import {issueVolunteerSubstitutionOffer,readVolunteerSubstitutionOptions} from "./volunteer-substitution-offer.mjs";
import {readVolunteerSubstitutionStaffScope} from "./volunteer-substitution-staff-scope.mjs";

const PREFIX=/^\/api\/orgs\/([A-Za-z0-9_-]{1,100})\/volunteer-substitutions(?:\/|$)/;
const ROUTE=/^\/api\/orgs\/([A-Za-z0-9_-]{1,100})\/volunteer-substitutions\/(?:([a-f0-9]{32})\/(review|confirm)|(offers)|shifts\/([A-Za-z0-9_-]{1,100})\/([A-Za-z0-9_-]{1,100}))$/;
const ID=/^[A-Za-z0-9_-]{1,100}$/, KEY=/^[A-Za-z0-9_-]{16,100}$/, SHA=/^[a-f0-9]{64}$/;
const exact=(o,keys)=>o&&Object.getPrototypeOf(o)===Object.prototype&&
  Object.keys(o).length===keys.length&&keys.every(key=>Object.hasOwn(o,key));
const matches=(v,re)=>typeof v==="string"&&re.test(v);
const revision=v=>Number.isInteger(v)&&v>0&&v<=2147483647;
const invalid=()=>fail(422,"substitution_fields","Use the exact shift change fields.");
const leg=p=>exact(p,["id","revision"])&&matches(p.id,ID)&&revision(p.revision);
const reply=(value,status=200)=>json(value,status,{"referrer-policy":"no-referrer"});

/** Permission or database guards supplied by the installed staff service
 * still govern every read/write. Request bodies never choose the service. */
export async function volunteerSubstitutionStaffRoutes({request,session,settings,db,staff,enabled}) {
  const url=new URL(request.url);
  if(enabled!==true||!PREFIX.test(url.pathname))return null;
  const m=ROUTE.exec(url.pathname);
  if(!m||url.search||url.hash)fail(404,"substitution_path","This shift change page is unavailable.");
  const [,orgId,intentId,action,offers,shiftId,outgoingId]=m;
  const operation=offers?"issue":shiftId?"options":action,read=operation==="review"||operation==="options";
  if(request.method!==(read?"GET":"POST"))fail(405,"substitution_method","Use the supported shift change action.");
  const userId=session?.user?.id;
  if(!matches(userId,ID)||!matches(session?.session?.id,ID)||session.user.emailVerified!==true)
    fail(401,"session","Sign in again before continuing.");
  if(!read)checkCsrf(request,session,settings);
  if(read&&(request.body!==null||request.headers.has("transfer-encoding")||
    (request.headers.has("content-length")&&request.headers.get("content-length")!=="0")))invalid();
  try {
    // This bounds transport attempts, including receipt reads. Only a fresh
    // authorized write spends the separate same-transaction 30/hour budget.
    const attempt = read ? "read" : operation;
    await db.limit(`shift-substitution:${attempt}:${hash([orgId,userId])}`,120,3600);
    if(operation==="options")return await db.tx(userId,orgId,async c=>
      reply({ok:true,options:await readVolunteerSubstitutionOptions(c,{orgId,session,shiftId,outgoingId})}),
    {lock:true,readOnly:true});
    if(read)return reply(await staff.review({orgId,intentId,session}));
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type")??""))
      fail(415,"content_type","Send this request as JSON.");
    let input;
    try{input=await readBackupBody(request,1024);}
    catch(error) {
      if(error?.status===413)throw error;
      fail(422,"substitution_json","Use valid JSON with no repeated fields.");
    }
    if(operation==="confirm"){
      if(!exact(input,["version","reviewSha256","idempotencyKey","acknowledge"])||
        input.version!==1||!matches(input.reviewSha256,SHA)||!matches(input.idempotencyKey,KEY)||input.acknowledge!==true)
        invalid();
      return reply(await staff.confirm({orgId,intentId,session,request:input}));
    }
    if(!exact(input,["version","shiftId","shiftRevision","outgoing","replacement"])||input.version!==1||
      !matches(input.shiftId,ID)||!revision(input.shiftRevision)||!leg(input.outgoing)||!leg(input.replacement)||
      input.outgoing.id===input.replacement.id)invalid();
    return await db.tx(userId,orgId,async c=>{
      await readVolunteerSubstitutionStaffScope(c,{orgId,intentId:"new-staff-offer",userId},session);
      const result=await issueVolunteerSubstitutionOffer(c,{orgId,session,shiftId:input.shiftId,shiftRevision:input.shiftRevision,
        outgoing:input.outgoing,replacement:input.replacement});
      return reply({ok:true,offer:{version:1,intentId:result.intentId,expiresAtExact:result.expiresAtExact}},201);
    },{lock:true});
  } catch(error) {
    if(error instanceof HttpError)throw error;
    if([400,401,403,404,409,422,429,503].includes(error?.status)&&/^substitution_[a-z_]+$/.test(error?.code??""))
      fail(error.status,error.code,"Review this shift change again before continuing.");
    throw error;
  }
}
