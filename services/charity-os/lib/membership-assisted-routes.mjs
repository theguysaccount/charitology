import { readBackupBody } from "./backup-json.mjs";
import { audit, saveRecord } from "./database.mjs";
import {
  assertAssistedReplay, assistedAuthority, assistedCapture, assistedCaptureReview, assistedCaseId, assistedChanged,
  assistedClosed, assistedConflict, assistedFields, assistedInput, assistedPendingReview, assistedReceipt,
  assistedSource, assistedStorage, assistedTerminal, assistedUnavailable,
} from "./membership-assisted-model.mjs";
import { createMembershipAssistedStore } from "./membership-assisted-storage.mjs";
import {
  clock, currentMembershipStaff, digest, isMembershipRenewalStaff, membershipRecordUpdate,
  one, ownActor, readAssistedMembershipGraph, sqlStamp,
} from "./membership-renewal-access.mjs";
import { groupRestoreEpoch } from "./participation-group-access.mjs";
import { participantQuery } from "./participants.mjs";
import { checkCsrf, equal, fail, json } from "./security.mjs";

const PREFIX = /^\/api\/orgs\/([A-Za-z0-9_-]{1,100})\/membership-assistance(?:\/|$)/;
const PATH = /^\/api\/orgs\/([A-Za-z0-9_-]{1,100})\/membership-assistance\/(review|members\/([A-Za-z0-9_-]{1,100})|cases(?:\/([a-f0-9]{32})(?:\/(confirm|withdraw))?)?)$/;
const LOCK = "SELECT pg_advisory_xact_lock(hashtextextended($1,0))";
const DISCOVERY = "membership_assistance_discovery";
const okay = value => json({ok:true,version:1,...value},200,{"referrer-policy":"no-referrer"});
const expectedGraphRefusal = error =>
  ["membership_renewal_unavailable","membership_renewal_changed","membership_renewal_fields"].includes(error?.code);

async function body(request,settings,session,action) {
  checkCsrf(request,session,settings);
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? ""))
    fail(415,"content_type","Supply JSON.");
  try { return assistedInput(action,await readBackupBody(request,2048)); }
  catch (error) {
    if (error.code === "backup_json") assistedFields();
    throw error;
  }
}

async function source(c, org, selection, staff, nowExact, readOnly, finalWrite = false) {
  const graph = await readAssistedMembershipGraph(c,{org,memberId:selection.memberId,termId:selection.termId,staff,readOnly,finalWrite});
  return {graph,current:assistedSource(graph,nowExact)};
}

async function liveWitness(c, row, readOnly) {
  const capture = row.capture;
  const current = one(await c.query(`SELECT m.user_id,m.role,m.program_ids AS "programIds",m.revision,
    ${sqlStamp("m.created_at")} AS "createdAtExact" FROM public.os_members m JOIN public."user" u ON u.id=m.user_id
    WHERE m.org_id=$1 AND m.user_id=$2 AND u."emailVerified" IS TRUE` + (readOnly ? "" : " FOR SHARE OF m,u"),
  [row.orgId,capture.witnessId]));
  return !!current && current.user_id === capture.witnessId && isMembershipRenewalStaff(current) &&
    current.revision === capture.witnessMembershipRevision && current.createdAtExact === capture.witnessMembershipCreatedAtExact;
}

const summary = row => ({id:row.caseId,memberId:row.memberId,termId:row.termId,state:row.state,revision:row.revision});
const result = (row,review,replayed) => ({
  case:{...summary(row),witnessedAtExact:row.capture?.witnessedAtExact ?? null,actedAtExact:row.terminal?.actedAtExact ?? null,
    result:row.terminal?.result ?? null,review,canConfirm:typeof review?.reviewSha256 === "string",canWithdraw:row.state === "pending"},
  replayed,
});

/** One existing workspace transaction. The enabled switch covers fresh
 * authoring; known cases can still be read, withdrawn and exactly retried. */
export function createMembershipAssistedRoute(config) {
  const store = createMembershipAssistedStore(config), enabled = config.enabled === true;
  const canStart = rows => enabled && rows.every(row => row.state !== "pending");
  const selection = (org, value) => ({orgId:org,memberId:value.memberId,termId:value.termId});
  const authority = async (c, org, value, staff) =>
    assistedAuthority(staff,await groupRestoreEpoch(c,org,[value.memberId,value.termId]));

  async function requireOpenLane(c,org,value) {
    const chosen = selection(org,value);
    if (await store.readOnlineConflict(c,chosen) || await store.readConflict(c,chosen)) assistedConflict();
  }
  async function requireWriteStorage(c) {
    if (await store.ready(c) !== true) assistedStorage();
  }
  async function caseReview(c,org,row,staff,nowExact,readOnly) {
    if (row.state !== "pending") return null;
    try {
      const {graph,current} = await source(c,org,row,staff,nowExact,readOnly);
      const currentAuthority = await authority(c,org,row,staff);
      const writable = enabled && await store.ready(c) === true && await liveWitness(c,row,readOnly) &&
        !await store.readOnlineConflict(c,selection(org,row));
      return assistedPendingReview(row,graph,current,staff,currentAuthority,nowExact,writable);
    } catch (error) {
      if (expectedGraphRefusal(error) || error?.code === "membership_assisted_storage" ||
          error?.code === "membership_renewal_storage") return null;
      throw error;
    }
  }
  async function readCase(c,org,caseId) {
    const row = await store.read(c,org,caseId);
    if (!row) assistedUnavailable();
    return row;
  }
  async function chosenSource(c,org,chosen,staff,nowExact,readOnly,finalWrite = false) {
    try { return await source(c,org,chosen,staff,nowExact,readOnly,finalWrite); }
    catch (error) {
      if (error?.code === "membership_renewal_unavailable") assistedUnavailable();
      if (expectedGraphRefusal(error)) assistedChanged();
      throw error;
    }
  }
  async function capture(c,org,input,staff,nowExact) {
    const caseId = assistedCaseId(org,staff.actor.id,input.idempotencyKey);
    const prior = await store.read(c,org,caseId);
    const currentAuthority = await authority(c,org,prior ?? input,staff);
    const receipt = assistedReceipt("capture",input,currentAuthority);
    if (prior) {
      assertAssistedReplay(prior.captureReceipt,receipt);
      return result(prior,await caseReview(c,org,prior,staff,nowExact,false),true);
    }
    if (!enabled) assistedClosed();
    await requireWriteStorage(c);
    const {graph,current} = await chosenSource(c,org,input,staff,nowExact,false);
    if (!current || !equal(input.reviewSha256,assistedCaptureReview(current,currentAuthority).reviewSha256)) assistedChanged();
    await requireOpenLane(c,org,input);
    await store.insert(c,{...selection(org,input),caseId,capture:assistedCapture(graph,current,staff,nowExact),captureReceipt:receipt});
    const saved = await readCase(c,org,caseId);
    if (saved.state !== "pending" || saved.revision !== 1) assistedStorage();
    assertAssistedReplay(saved.captureReceipt,receipt);
    return result(saved,assistedPendingReview(saved,graph,current,staff,currentAuthority,nowExact,false),false);
  }
  async function resolve(c,org,row,action,input,staff,nowExact) {
    const currentAuthority = await authority(c,org,row,staff), receipt = assistedReceipt(action,input,currentAuthority);
    if (row.terminal) {
      if (row.terminal.action !== action) assistedClosed();
      assertAssistedReplay(row.terminal.receipt,receipt);
      return result(row,null,true);
    }
    if (row.state !== "pending" || row.revision !== input.revision) assistedChanged();
    const state = action === "confirm" ? "confirmed" : "withdrawn";
    let next = null, effect = null;
    if (action === "confirm") {
      if (!enabled) assistedClosed();
      await requireWriteStorage(c);
      const {graph,current} = await chosenSource(c,org,row,staff,nowExact,false,true);
      const review = assistedPendingReview(row,graph,current,staff,currentAuthority,nowExact,await liveWitness(c,row,false));
      if (!review?.reviewSha256 || !equal(input.reviewSha256,review.reviewSha256)) assistedChanged();
      if (await store.readOnlineConflict(c,selection(org,row))) assistedConflict();
      effect = current.effect;
      next = membershipRecordUpdate(graph,effect,staff.actor.id);
    }
    await store.transition(c,{orgId:org,caseId:row.caseId,expectedRevision:row.revision,state,
      terminal:assistedTerminal(action,staff,receipt,nowExact,effect)});
    if (next) {
      await saveRecord(c,next);
      if (!await audit(c,org,staff.actor.id,"record.updated",next,{record:next})) assistedStorage();
    }
    const saved = await readCase(c,org,row.caseId);
    if (saved.state !== state || saved.revision !== row.revision+1) assistedStorage();
    assertAssistedReplay(saved.terminal?.receipt,receipt);
    return result(saved,null,false);
  }
  async function route({request,url = new URL(request.url),db,settings,session}) {
    if (!PREFIX.test(url.pathname)) return null;
    const match = PATH.exec(url.pathname);
    if (!match) assistedUnavailable();
    const [,org,tail,memberId,caseId,operation] = match, actor = ownActor(session);
    participantQuery(url);
    const action = operation || (memberId || caseId ? "read" : tail === "review" ? "review" : "capture");
    if (request.method !== (action === "read" ? "GET" : "POST"))
      fail(405,"membership_assistance_method","Use the documented staff-assisted renewal action.");
    if (action === "read" && (request.body !== null || request.headers.has("transfer-encoding") ||
        (request.headers.has("content-length") && request.headers.get("content-length") !== "0")))
      fail(400,"membership_assistance_body","Read the assisted renewal without a request body.");
    const input = action === "read" ? null : await body(request,settings,session,action);
    const readOnly = action === "read" || action === "review";
    await db.limit("membership-assistance:"+action+":"+digest("actor-rate",actor.id),readOnly ? 120 : 60,3600);
    const response = await db.tx(actor.id,org,async c => {
      if (!readOnly) await c.query(LOCK,[org]);
      const staff = await currentMembershipStaff(c,org,session,readOnly);
      if (await store.caseReady(c) !== true) assistedStorage();
      if (memberId) {
        const rows = await store.list(c,{orgId:org,memberId});
        const live = one(await c.query(`SELECT EXISTS(SELECT 1 FROM public.os_records WHERE org_id=$1 AND id=$2
          AND module_id='memberships' AND data->>'kind'='member' AND deleted_at IS NULL
          AND status IN ('active','renewal-due')) AS available`,[org,memberId]));
        return {cases:rows.map(summary),canStart:live?.available === true && canStart(rows) && await store.ready(c) === true};
      }
      const nowExact = await clock(c);
      if (action === "review") {
        if (!enabled) assistedClosed();
        await requireWriteStorage(c);
        const {current} = await chosenSource(c,org,input,staff,nowExact,true);
        if (!current) assistedChanged();
        await requireOpenLane(c,org,input);
        return {review:assistedCaptureReview(current,await authority(c,org,input,staff))};
      }
      if (action === "capture") return capture(c,org,input,staff,nowExact);
      const row = await readCase(c,org,caseId);
      return action === "read" ? result(row,await caseReview(c,org,row,staff,nowExact,true),false) :
        resolve(c,org,row,action,input,staff,nowExact);
    },{readOnly});
    return okay(response);
  }
  return Object.freeze(Object.assign(route,{
    async staffAvailable(c,{orgId,session}) {
      await c.query("SAVEPOINT " + DISCOVERY);
      try {
        await currentMembershipStaff(c,orgId,session,true);
        return await store.caseReady(c) === true;
      } catch {
        await c.query("ROLLBACK TO SAVEPOINT " + DISCOVERY);
        return false;
      } finally { await c.query("RELEASE SAVEPOINT " + DISCOVERY); }
    },
  }));
}
