import { readBackupBody } from "./backup-json.mjs";
import { audit, saveRecord } from "./database.mjs";
import {
  bindingAuthority, bindingReview, changed, clock, currentMembershipStaff, currentOfferedMembershipLink,
  currentOwnMembershipLink, digest, discoverOwnMembershipLink, duplicate, id, membershipGraph,
  membershipRecordUpdate, offerEvidence, one, ownActor, sha, sqlStamp, unavailable,
} from "./membership-renewal-access.mjs";
import {
  planOwnDirectoryChoice, planOwnRenewalRequest, planStaffRenewalDecision,
  reviewOwnDirectory, reviewOwnRenewal, reviewStaffRenewal,
} from "./membership-renewal-model.mjs";
import {
  createMembershipRenewalStore, membershipRenewalConfiguration, membershipStorageUnavailable,
} from "./membership-renewal-storage.mjs";
import { participantQuery } from "./participants.mjs";
import { checkCsrf, equal, fail, json } from "./security.mjs";

export { membershipRenewalConfiguration };
export { isMembershipRenewalStaff } from "./membership-renewal-access.mjs";
const OWN = /^\/api\/participant\/orgs\/([A-Za-z0-9_-]{1,100})\/requests\/([A-Za-z0-9_-]{1,100})\/membership-renewal(?:\/(offer|request|directory))?$/;
const STAFF = /^\/api\/orgs\/([A-Za-z0-9_-]{1,100})\/membership-renewals\/([A-Za-z0-9_-]{1,100})(?:\/(binding-review|bind|confirm))?$/;
const LOCK = "SELECT pg_advisory_xact_lock(hashtextextended($1,0))";
const DISCOVERY = "membership_renewal_discovery";
const notice = Object.freeze({revision:1,available:true});
const okay = value => json({ok:true,version:1,...value},200,{"referrer-policy":"no-referrer"});
const fields = () => fail(422,"membership_renewal_fields","Use the exact membership review fields.");
const key = value => typeof value === "string" && /^[A-Za-z0-9_-]{16,100}$/.test(value);
const selectionFields = ["memberId","termId"];
const commandFields = ["reviewSha256","idempotencyKey","acknowledge"];
function exact(value, names) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).length !== names.length + 1 ||
      !names.every(name => Object.hasOwn(value,name)) || value.version !== 1) fields();
}
function checked(value, selection, command) {
  exact(value,[...(selection ? selectionFields : []),...(command ? commandFields : [])]);
  if ((selection && (!id(value.memberId) || !id(value.termId))) ||
      (command && (!sha(value.reviewSha256) || !key(value.idempotencyKey) || value.acknowledge !== true))) fields();
  return value;
}
async function requestBody(request, settings, session) {
  checkCsrf(request,session,settings);
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? ""))
    fail(415,"content_type","Supply JSON.");
  try { return await readBackupBody(request,2048); }
  catch (error) {
    if (error.code === "backup_json") fields();
    throw error;
  }
}
async function discovery(c, read) {
  await c.query("SAVEPOINT " + DISCOVERY);
  try { return await read(); }
  catch {
    await c.query("ROLLBACK TO SAVEPOINT " + DISCOVERY);
    return false;
  } finally { await c.query("RELEASE SAVEPOINT " + DISCOVERY); }
}
function assertOther(staff, offer) {
  if (staff.actor.id === offer.userId)
    fail(403,"membership_renewal_staff","Ask another Memberships administrator to review this request.");
}

/** Private default-off route. It uses the existing signed-in actor and
 * transaction; none of the sidecar state can grant account or staff access. */
export function createMembershipRenewalRoute(config) {
  const store = createMembershipRenewalStore(config), s = store.schema;
  const getOffer = async (c, org, intake) => one(await c.query(`SELECT user_id AS "userId",link_id AS "linkId",
    link_revision AS "linkRevision",${sqlStamp("link_created_at")} AS "linkCreatedAtExact",
    intake_revision AS "intakeRevision",${sqlStamp("intake_created_at")} AS "intakeCreatedAtExact",
    publication_id AS "publicationId",${sqlStamp("publication_created_at")} AS "publicationCreatedAtExact",
    evidence_sha256 AS "evidenceSha256",key_sha256 AS key,command_sha256 AS command,actor_sha256 AS actor,
    ${sqlStamp("created_at")} AS "createdAtExact" FROM ${s}.offers WHERE org_id=$1 AND intake_id=$2`,[org,intake]));
  const getBinding = async (c, org, intake) => one(await c.query(`SELECT member_id AS "memberId",
    ${sqlStamp("member_created_at")} AS "memberCreatedAtExact",term_id AS "termId",${sqlStamp("term_created_at")} AS "termCreatedAtExact",
    opens_on::text AS "opensOn",closes_on::text AS "closesOn",contact_sha256 AS "contactSha256",
    key_sha256 AS key,command_sha256 AS command,authority_sha256 AS authority,${sqlStamp("created_at")} AS "createdAtExact"
    FROM ${s}.bindings WHERE org_id=$1 AND intake_id=$2`,[org,intake]));
  async function getReceipt(c, table, org, intake) {
    return one(await c.query(`SELECT receipt FROM ${s}.${table} WHERE org_id=$1 AND intake_id=$2`,[org,intake]))?.receipt ?? null;
  }
  async function insertReceipt(c, table, org, intake, receipt) {
    const result = await c.query(`INSERT INTO ${s}.${table}(org_id,intake_id,receipt)
      VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING`,[org,intake,JSON.stringify(receipt)]);
    if (result.rowCount !== 1) duplicate();
  }
  async function saveChoice(c, org, intake, receipt) {
    const {revision} = receipt;
    const result = revision === 1 ?
      await c.query(`INSERT INTO ${s}.directory_choices(org_id,intake_id,revision,receipt)
        VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING`,[org,intake,revision,JSON.stringify(receipt)]) :
      await c.query(`UPDATE ${s}.directory_choices SET revision=$3,receipt=$4::jsonb
        WHERE org_id=$1 AND intake_id=$2 AND revision=$3-1`,[org,intake,revision,JSON.stringify(receipt)]);
    if (result.rowCount !== 1) changed();
  }
  async function gate(c) {
    if (await store.ready(c) !== true) membershipStorageUnavailable();
  }
  const state = (offer,binding) => binding ? "bound" : offer ? "offered" : "unlinked";
  const offerReview = (link,actor) => digest("offer-review",[offerEvidence(link),actor.sessionSha256]);
  function offerKeys(link,actor,body) {
    return {evidence:offerEvidence(link),key:digest("offer-key",body.idempotencyKey),
      command:digest("offer-command",body),actor:digest("offer-actor",[link.userId,actor.sessionSha256])};
  }
  async function insertOffer(c, link, pins, nowExact) {
    const written = await c.query(`INSERT INTO ${s}.offers(org_id,intake_id,user_id,link_id,link_revision,
      link_created_at,intake_revision,intake_created_at,publication_id,publication_created_at,evidence_sha256,
      key_sha256,command_sha256,actor_sha256,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT DO NOTHING`,
      [link.org,link.intake,link.userId,link.linkId,link.linkRevision,link.linkCreatedAtExact,link.intakeRevision,
        link.intakeCreatedAtExact,link.publicationId,link.publicationCreatedAtExact,pins.evidence,pins.key,pins.command,pins.actor,nowExact]);
    if (written.rowCount !== 1) duplicate();
  }
  async function insertBinding(c, link, graph, pins, nowExact) {
    const written = await c.query(`INSERT INTO ${s}.bindings(org_id,intake_id,member_id,member_created_at,
      term_id,term_created_at,opens_on,closes_on,contact_sha256,key_sha256,command_sha256,authority_sha256,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
      [link.org,link.intake,graph.member.id,graph.member.createdAtExact,graph.termRow.id,graph.termRow.createdAtExact,
        graph.window.opensOn,graph.window.closesOn,graph.contactSha256,pins.key,pins.command,pins.authority,nowExact]);
    if (written.rowCount !== 1) duplicate();
  }
  async function records(c, org, intake) {
    const request = await getReceipt(c,"requests",org,intake), decision = await getReceipt(c,"decisions",org,intake);
    return {request,decision};
  }
  async function ownView(c, link, offer, binding, actor, nowExact, replayed) {
    if (!binding) return {state:state(offer,binding),offerReviewSha256:offer ? null : offerReview(link,actor),
      renewal:null,directory:null,replayed};
    const graph = await membershipGraph(c,{link,selection:binding,offer,binding,nowExact,readOnly:true});
    const context = {...graph,actor:actor.model,nowExact,...await records(c,link.org,link.intake)};
    const choice = await getReceipt(c,"directory_choices",link.org,link.intake);
    let renewal;
    try { renewal = reviewOwnRenewal(context); }
    catch (error) {
      // A separately restored renewal source can invalidate its retained
      // request without ending the current member's directory withdrawal.
      if (error.code !== "membership_renewal_unavailable") throw error;
      renewal = null;
    }
    return {state:"bound",offerReviewSha256:null,renewal,
      directory:reviewOwnDirectory({subject:graph.directorySubject,actor:actor.model,notice,choice,nowExact}),replayed};
  }
  async function ownRoute(c, {org,intake,action,actor,linkId,body,readOnly}) {
    const link = await currentOwnMembershipLink(c,org,intake,linkId,actor,readOnly);
    await gate(c);
    const nowExact = await clock(c);
    let offer = await getOffer(c,org,intake);
    if (offer && (!equal(offer.evidenceSha256,offerEvidence(link)) || offer.userId !== actor.id)) unavailable();
    const binding = offer ? await getBinding(c,org,intake) : null;
    let replayed = false;
    if (action === "offer") {
      checked(body,false,true);
      const pins = offerKeys(link,actor,body);
      if (offer) {
        if (offer.key !== pins.key || offer.command !== pins.command) duplicate();
        if (offer.actor !== pins.actor) changed();
        replayed = true;
      } else {
        if (!equal(body.reviewSha256,offerReview(link,actor))) changed();
        await insertOffer(c,link,pins,nowExact);
        offer = await getOffer(c,org,intake);
        if (!offer) membershipStorageUnavailable();
      }
    } else if (action) {
      if (!binding) unavailable();
      const graph = await membershipGraph(c,{link,selection:binding,offer,binding,nowExact,readOnly});
      if (action === "request") {
        const plan = planOwnRenewalRequest({...graph,actor:actor.model,nowExact,...await records(c,org,intake)},body);
        if (plan.requestWrite) await insertReceipt(c,"requests",org,intake,plan.requestWrite);
        replayed = plan.replayed;
      } else {
        const choice = await getReceipt(c,"directory_choices",org,intake);
        const plan = planOwnDirectoryChoice({subject:graph.directorySubject,actor:actor.model,notice,choice,nowExact},body);
        if (plan.choiceWrite) await saveChoice(c,org,intake,plan.choiceWrite);
        replayed = plan.replayed;
      }
    }
    return ownView(c,link,offer,binding,actor,nowExact,replayed);
  }
  async function staffView(c, link, offer, binding, staff, nowExact, replayed) {
    if (!binding) return {state:"offered",binding:null,renewal:null,replayed};
    const graph = await membershipGraph(c,{link,selection:binding,offer,binding,staff,nowExact,readOnly:true});
    return {state:"bound",binding:{memberId:binding.memberId,termId:binding.termId},
      renewal:reviewStaffRenewal({...graph,staff:staff.model,nowExact,...await records(c,link.org,link.intake)}),replayed};
  }
  async function staffRoute(c, {org,intake,action,session,body,readOnly}) {
    const staff = await currentMembershipStaff(c,org,session,readOnly);
    await gate(c);
    const offer = await getOffer(c,org,intake);
    if (!offer) unavailable();
    assertOther(staff,offer);
    const link = await currentOfferedMembershipLink(c,org,intake,offer,readOnly), nowExact = await clock(c);
    let binding = await getBinding(c,org,intake), replayed = false;
    if (action === "binding-review" || action === "bind") {
      checked(body,true,action === "bind");
      const selection = {memberId:body.memberId,termId:body.termId};
      const pins = action === "bind" ? {key:digest("binding-key",body.idempotencyKey),command:digest("binding-command",body)} : null;
      if (binding) {
        if (!pins || binding.key !== pins.key || binding.command !== pins.command ||
            binding.memberId !== selection.memberId || binding.termId !== selection.termId) duplicate();
        const graph = await membershipGraph(c,{link,selection,offer,binding,staff,nowExact,readOnly});
        if (binding.authority !== bindingAuthority(staff,graph.subject.restoreEpochSha256)) changed();
        replayed = true;
      } else {
        const graph = await membershipGraph(c,{link,selection,offer,binding,staff,nowExact,readOnly});
        const {authority,review} = bindingReview(graph,link,offer,staff,nowExact);
        if (action === "binding-review") return review;
        if (!equal(body.reviewSha256,review.reviewSha256)) changed();
        await insertBinding(c,link,graph,{...pins,authority},nowExact);
        binding = await getBinding(c,org,intake);
        if (!binding) membershipStorageUnavailable();
      }
    } else if (action === "confirm") {
      if (!binding) unavailable();
      const graph = await membershipGraph(c,{link,selection:binding,offer,binding,staff,nowExact,readOnly,finalWrite:true});
      const plan = planStaffRenewalDecision({...graph,staff:staff.model,nowExact,...await records(c,org,intake)},body);
      if (plan.memberWrite) {
        const next = membershipRecordUpdate(graph,plan.memberWrite,staff.actor.id);
        await saveRecord(c,next);
        await audit(c,org,staff.actor.id,"record.updated",next,{record:next});
        await insertReceipt(c,"decisions",org,intake,plan.decisionWrite);
      }
      replayed = plan.replayed;
    }
    return staffView(c,link,offer,binding,staff,nowExact,replayed);
  }
  async function route({request,url = new URL(request.url),db,settings,session}) {
    const own = OWN.exec(url.pathname), staff = own ? null : STAFF.exec(url.pathname), match = own || staff;
    if (!match) return null;
    const [,org,intake,action] = match;
    const actor = ownActor(session);
    participantQuery(url);
    const get = action === undefined, readOnly = get || action === "binding-review";
    if (request.method !== (get ? "GET" : "POST"))
      fail(405,"membership_renewal_method","Use the documented membership review action.");
    if (get && (request.body !== null || request.headers.has("transfer-encoding") ||
        (request.headers.has("content-length") && request.headers.get("content-length") !== "0")))
      fail(400,"membership_renewal_body","Read membership review without a request body.");
    const body = get ? null : await requestBody(request,settings,session);
    await db.limit("membership-renewal:"+(own ? "own" : "staff")+":"+(action ?? "read")+":"+digest("actor-rate",actor.id),
      get ? 120 : 60,3600);
    const linkId = own ? await db.tx(actor.id,null,c => discoverOwnMembershipLink(c,org,intake,actor.id),{readOnly:true}) : null;
    const result = await db.tx(actor.id,org,async c => {
      // Private sidecar mutations share the same tenant lock. Only an actual
      // Membership record/audit write enters the ordinary workspace budget.
      if (!readOnly) await c.query(LOCK,[org]);
      return own ? ownRoute(c,{org,intake,action,actor,linkId,body,readOnly}) :
        staffRoute(c,{org,intake,action,session,body,readOnly});
    },{readOnly});
    return okay(result);
  }
  return Object.freeze(Object.assign(route,{
    available(c,{orgId,intakeId,linkId,linkRevision,intakeRevision,publicationId,session}) {
      return discovery(c,async () => {
        if (await store.ready(c) !== true) return false;
        const linked = await currentOwnMembershipLink(c,orgId,intakeId,linkId,ownActor(session),true);
        return linked.linkRevision === linkRevision && linked.intakeRevision === intakeRevision && linked.publicationId === publicationId;
      });
    },
    staffAvailable(c,{orgId,session}) {
      return discovery(c,async () => {
        await currentMembershipStaff(c,orgId,session,true);
        return await store.ready(c) === true;
      });
    },
  }));
}
