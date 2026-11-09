/** Application wiring is opt-in through a reviewed server dependency, not
 * through an HTTP field or a boolean environment switch by itself. */
import { fail, hash } from "./security.mjs";
import { createVolunteerSubstitutionAuthorityReader, volunteerSubstitutionAuthorityReady } from "./volunteer-substitution-authority.mjs";
import { checkActualWorkspaceBackupCapacity, checkWorkspaceExportCapacity } from "./workspace-backup.mjs";
import { readOwnVolunteerSubstitutionOffer } from "./volunteer-substitution-offer.mjs";
import { bindVolunteerSubstitutionOwnStore } from "./volunteer-substitution-own-store.mjs";
import { participantVolunteerSubstitutionRoutes } from "./volunteer-substitution-own.mjs";
import { volunteerSubstitutionStaffRoutes } from "./volunteer-substitution-routes.mjs";
import { createVolunteerSubstitutionStaff } from "./volunteer-substitution-staff.mjs";

const STAFF=/^\/api\/orgs\/([A-Za-z0-9_-]{1,100})\/volunteer-substitutions(?:\/|$)/;
const OWN=/^\/api\/participant\/orgs\/([A-Za-z0-9_-]{1,100})\/requests\/[A-Za-z0-9_-]{1,100}\/participations\/[A-Za-z0-9_-]{1,100}\/substitution-choice$/;
const installed=new WeakSet();
export const isVolunteerSubstitutionRuntime=v=>v!==null&&typeof v==="object"&&installed.has(v);

export function createVolunteerSubstitutionRuntime({
  db, verifyReadiness, readPairedOwnAuthority, checkProspectiveCapacity, checkFinalCapacity,
}) {
  if(typeof verifyReadiness!=="function")throw new TypeError("Supply the exact verifier, storage and capacity readiness check.");
  const staff=createVolunteerSubstitutionStaff({db,readPairedOwnAuthority,checkProspectiveCapacity,checkFinalCapacity});
  const own=bindVolunteerSubstitutionOwnStore(readOwnVolunteerSubstitutionOffer);
  const available=async (session,orgId)=>{
    if(session?.user?.emailVerified!==true || !session?.user?.id || !session?.session?.id) return false;
    try { return await verifyReadiness({db,orgId,session})===true; }
    catch { return false; }
  };
  const runtime=Object.freeze({
    discover(session) { return available(session,null); },
    async route({request,url=new URL(request.url),session,settings,db:configuredDb}) {
      const ownerPath=OWN.exec(url.pathname),staffPath=STAFF.exec(url.pathname);
      const match=ownerPath??staffPath;
      if(!match)return null;
      if(configuredDb!==db)throw new Error("Shift handoff database does not match its reviewed runtime.");
      if(!session?.user?.id||session.user.emailVerified!==true)fail(401,"session","Sign in to continue.");
      // Bound an authenticated actor before catalog checks or tenant locks.
      // Own requests share the portal's existing read/write budget.
      const bucket=hash(session.user.id);
      if(ownerPath) {
        const read=request.method==="GET";
        await db.limit(`participant-${read?"read":"write"}:${bucket}`,read?120:60,3600);
      } else await db.limit(`shift-substitution:staff-transport:${bucket}`,180,3600);
      if(!await available(session,match[1]))
        fail(503,"substitution_unavailable","Shift handoffs are currently unavailable.");
      return ownerPath
        ? participantVolunteerSubstitutionRoutes({request,url,db,session,settings,...own})
        : volunteerSubstitutionStaffRoutes({request,session,settings,db,staff,enabled:true});
    },
  });
  installed.add(runtime);
  return runtime;
}

/** Server composition. Configuration can hide the workflow. It cannot grant
 * permissions or bypass the live, scoped database and verifier checks. */
export function createHostedVolunteerSubstitutionRuntime({db,enabled,authorityOptions={
  managedDatabaseOwner:true,
}}) {
  if(enabled!==true) return null;
  const authority=Object.freeze({...authorityOptions});
  return createVolunteerSubstitutionRuntime({
    db,
    readPairedOwnAuthority:createVolunteerSubstitutionAuthorityReader(authority),
    verifyReadiness:({orgId,session})=>db.tx(session.user.id,orgId,async c=>{
      const active=(await c.query(`SELECT EXISTS(SELECT 1 FROM "session" s JOIN "user" u ON u.id=s."userId"
        WHERE s.id=$1 AND s."userId"=$2 AND s."expiresAt">clock_timestamp() AND u."emailVerified" IS TRUE) AS active`,
      [session.session.id,session.user.id])).rows[0]?.active;
      return active===true && await volunteerSubstitutionAuthorityReady(c,authority);
    },{readOnly:true}),
    checkProspectiveCapacity:(c,{orgId})=>checkActualWorkspaceBackupCapacity(c,orgId),
    checkFinalCapacity:(c,{orgId})=>checkWorkspaceExportCapacity(c,orgId),
  });
}
