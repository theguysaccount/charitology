/** Private staff reservation routes. The handler and complete admission hooks are supplied separately. */
import { readBackupBody } from "./backup-json.mjs";
import { checkCsrf, fail, hash, id, json, HttpError } from "./security.mjs";
import { compareGroupExactStamps, ParticipationGroupError } from "./participation-group-model.mjs";
import { ResourceReservationError, reviewExclusiveResourceCapacity } from "./resource-reservation-model.mjs";
import {
  RESOURCE_RESERVATION_LIMITS as limits,
  planResourceReservationWrite, reconcileResourceReservationReceipt,
  resourceReservationCommandHashes, resourceReservationProofSha256,
} from "./resource-reservation-ledger.mjs";
import {
  applyResourceReservationPlan, findResourceReservationReceipt, loadResourceReservationInventory,
} from "./resource-reservation-store.mjs";
import {
  currentResourceReservationMember, readResourceReservationEffects, readResourceReservationSources,
  requireResourceReservationScope, resourceReservationClock, resourceReservationCommandAuthority,
  resourceReservationFuture, resourceReservationRowProof, resourceReservationScope,
} from "./resource-reservation-context.mjs";
import {
  makeResourceReservationPreview, readResourceReservationPreview, reservationHash, resourceReservationCommitInput,
  resourceReservationId, resourceReservationReviewHash, resourceReservationReviewInput,
} from "./resource-reservation-preview.mjs";

const matchPath = /^\/api\/orgs\/([A-Za-z0-9_-]{1,100})\/resource-reservations\/(workspace|review|commit)$/;
export const isResourceReservationPath = path => /^\/api\/orgs\/[^/]*\/resource-reservations(?:\/|$)/.test(path);
const headers = { "referrer-policy": "no-referrer" };
const lockedRead = { lock: true, readOnly: true };
const okay = (context, value) => ({
  ok: true, version: 1, orgId: context.org, scopeSha256: context.scopeSha256, ...value,
});
const response = value => json(value, 200, headers);
const pin = value => value && { id: value.id, revision: value.revision };

class ReservationRefusal extends Error {
  constructor(reasonCode) {
    super("The reservation command was refused.");
    this.reasonCode = reasonCode;
  }
}
class ReservationReadAgain extends Error {}
const refuse = reasonCode => { throw new ReservationRefusal(reasonCode); };
const stale = () => fail(409, "resource_reservation_stale", "A selected record changed. Reload and review it.");

function previousHold(rows, selected) {
  if (selected === null) return null;
  const row = rows.find(item => item.id === selected.id);
  if (row?.originMode !== "live" || row.state !== "reserved" || row.revision !== selected.revision) stale();
  return row;
}

function holdDto(row) {
  const proof = resourceReservationRowProof(row);
  const original = row.originalReceipt?.decision ?? row.history.original;
  const terminal = row.terminalReceipt?.decision ?? row.history?.terminal ?? null;
  const disposition = row.history?.disposition ?? null;
  return {
    id: row.id, revision: row.revision, originMode: row.originMode, state: row.state,
    sourceState: row.history?.sourceState ?? row.state,
    assetId: proof.asset.id, assetRevision: proof.asset.revision,
    sessionId: proof.session.id, sessionRevision: proof.session.revision,
    interval: proof.interval, proofSha256: resourceReservationProofSha256(proof),
    original: { operation: original.operation, acceptedAtExact: original.acceptedAtExact, replacesId: original.previous?.id ?? null },
    terminal: terminal && {
      operation: terminal.operation, acceptedAtExact: terminal.acceptedAtExact,
      reason: terminal.reason, replacedById: terminal.next?.id ?? null,
    },
    disposition: disposition && { acceptedAtExact: disposition.acceptedAtExact, reason: disposition.reason },
  };
}

async function workspace(c, args) {
  const context = await resourceReservationScope(c, { ...args, readOnly: true });
  const { rows } = await loadResourceReservationInventory(c, context.org);
  const sources = await readResourceReservationSources(c, context.org);
  const nowExact = await resourceReservationClock(c);
  return okay(context, {
    assets: sources.filter(row => row.pin.moduleId === "assets").map(row => row.dto),
    sessions: sources.filter(row => row.pin.moduleId === "events" && resourceReservationFuture(row.dto.interval, nowExact))
      .map(row => row.dto),
    reservations: rows.map(holdDto),
  });
}

async function review(c, args) {
  const { input, secret } = args;
  const context = await resourceReservationScope(c, { ...args, readOnly: true });
  requireResourceReservationScope(context, input.scopeSha256);
  const { rows } = await loadResourceReservationInventory(c, context.org);
  const old = previousHold(rows, input.previous);
  const previous = old ? holdDto(old) : null;
  if (input.operation === "release") {
    await resourceReservationCommandAuthority(c, context, [old.proof]);
    return okay(context, { state: "ready", input, previous, next: null, preview: null });
  }
  const chosen = await readResourceReservationSources(c, context.org, input);
  const commandAuthority = await resourceReservationCommandAuthority(c, context, old ? [old.proof, chosen.proof] : [chosen.proof]);
  const issuedAtExact = await resourceReservationClock(c);
  if (!resourceReservationFuture(chosen.session.interval, issuedAtExact)) stale();

  const { state } = reviewExclusiveResourceCapacity({
    capacity: chosen.proof.quantity,
    candidate: { assetId: chosen.asset.id, occurrenceId: chosen.session.id, interval: chosen.session.interval },
    reservations: rows.map(row => {
      const proof = resourceReservationRowProof(row);
      return { id: row.id, assetId: proof.asset.id, occurrenceId: proof.session.id,
        originMode: row.originMode, state: row.state, interval: proof.interval };
    }),
    replacingReservationId: old?.id ?? null,
  });
  const nextId = state === "ready" ? id() : null;
  const next = { id: nextId, proofSha256: chosen.proofSha256, asset: chosen.asset, session: chosen.session };
  const preview = state === "ready" ? makeResourceReservationPreview({
    orgId: context.org, scopeSha256: context.scopeSha256, operation: input.operation,
    asset: input.asset, session: input.session, nextId, proofSha256: chosen.proofSha256,
    inventorySha256: reservationHash("inventory", rows), authoritySha256: reservationHash("authority", commandAuthority),
    issuedAtExact,
  }, input.previous, input.reason, secret) : null;
  return okay(context, { state, input, previous, next, preview });
}

function accepted(context, request, decision, current, replayed) {
  const { operation, acceptedAtExact, previous, next, reason } = decision;
  return okay(context, {
    state: "accepted", idempotencyKey: request.idempotencyKey, replayed,
    decision: { operation, acceptedAtExact, previous, next, reason }, current,
  });
}

async function acceptedRead(c, args, command) {
  const { input } = args;
  const context = await resourceReservationScope(c, { ...args, readOnly: true });
  requireResourceReservationScope(context, input.scopeSha256);
  const receipt = await findResourceReservationReceipt(c, context.org, command.commandHash);
  if (!receipt) return { context, result: null };
  if (receipt.requestHash !== command.requestHash || receipt.decision.operation !== input.operation)
    fail(409, "resource_reservation_reconcile", "The recorded command does not match this request.");
  const { current, proofs } = await readResourceReservationEffects(c, context.org, receipt);
  const authority = await resourceReservationCommandAuthority(c, context, proofs, true);
  const decision = reconcileResourceReservationReceipt({
    orgId: context.org, actorId: context.member.userId, operation: input.operation,
    request: input.request, authority, receipt,
  });
  return { context, result: accepted(context, input.request, decision, current, true) };
}

async function commit(c, args, command, hooks) {
  const { input, secret } = args, { operation, request } = input;
  const context = await resourceReservationScope(c, { ...args, readOnly: false });
  requireResourceReservationScope(context, input.scopeSha256);
  const orgId = context.org, actorId = context.member.userId;

  // A concurrent acceptance goes back to the genuinely read-only path.
  if (await findResourceReservationReceipt(c, orgId, command.commandHash)) throw new ReservationReadAgain();

  try {
    const preview = operation === "release" ? null : readResourceReservationPreview(request.previewToken, secret);
    if (preview && (preview.orgId !== orgId || preview.scopeSha256 !== context.scopeSha256 ||
        preview.operation !== operation || preview.reviewSha256 !== request.reviewSha256)) refuse("stale");

    const { rows } = await loadResourceReservationInventory(c, orgId);
    const previous = operation === "reserve" ? null : { id: request.reservationId, revision: request.reservationRevision };
    const old = previousHold(rows, previous);
    const chosen = preview && await readResourceReservationSources(c, orgId, preview);
    const proofs = [old?.proof, chosen?.proof].filter(Boolean);
    const authority = await resourceReservationCommandAuthority(c, context, proofs);
    const nowExact = await resourceReservationClock(c);
    if (preview) {
      if (compareGroupExactStamps(nowExact, preview.expiresAtExact) >= 0) refuse("expired");
      if (compareGroupExactStamps(nowExact, preview.issuedAtExact) < 0 ||
          !resourceReservationFuture(chosen.session.interval, nowExact) ||
          preview.proofSha256 !== chosen.proofSha256 ||
          preview.authoritySha256 !== reservationHash("authority", authority) ||
          preview.inventorySha256 !== reservationHash("inventory", rows) ||
          preview.reviewSha256 !== resourceReservationReviewHash(preview, previous, request.reason ?? null)) refuse("stale");
    }

    const plan = planResourceReservationWrite({
      orgId, actorId, authority, operation, request, acceptedAtExact: nowExact, rows,
      newReservation: preview ? { id: preview.nextId, proof: chosen.proof } : null,
    });
    if (plan.state !== "ready") refuse(plan.state);
    const stored = await applyResourceReservationPlan(c, orgId, plan);
    const { decision } = stored.receipt;
    if (operation !== "release") {
      const savedAudit = await hooks.auditReservation(
        c, orgId, actorId, operation === "reserve" ? "resource-reservation.reserved" : "resource-reservation.replaced",
        { id: chosen.session.id, moduleId: "events" },
        { previousId: decision.previous?.id ?? null, reservationId: decision.next.id, assetId: chosen.asset.id,
          proofSha256: decision.next.proofSha256, acceptedAtExact: decision.acceptedAtExact },
      );
      if (savedAudit !== true)
        fail(503, "resource_reservation_audit", "The reservation audit was not recorded.");
    }
    // The Release receipt is mandatory. Release uses prepaid safety growth and
    // omits its optional audit. The integration hook owns central classification.
    const admitted = await hooks.admitWorkspace(c, {
      orgId, operation, mode: operation === "release" ? "release-safety" : "ordinary", plan, stored,
    });
    if (admitted === false) refuse("capacity");
    if (admitted !== true)
      fail(503, "resource_reservation_admission", "The reservation admission check did not settle.");
    return accepted(context, request, decision, [decision.previous, decision.next].filter(Boolean), false);
  } catch (error) {
    if (error instanceof HttpError && error.code === "resource_reservation_stale") refuse("stale");
    if ((error instanceof ResourceReservationError && error.code === "resource_reservation_limit") ||
        (error instanceof HttpError && error.code === "resource_reservation_quota")) refuse("capacity");
    throw error;
  }
}

async function commitWithReconciliation(db, actorId, args, hooks) {
  const { org, input } = args;
  const command = resourceReservationCommandHashes({ orgId: org, actorId, operation: input.operation, request: input.request });
  const read = () => db.tx(actorId, org, c => acceptedRead(c, args, command), lockedRead);
  const initial = await read();
  if (initial.result) return initial.result;
  if (typeof hooks.admitWorkspace !== "function" || typeof hooks.auditReservation !== "function")
    fail(503, "resource_reservation_admission", "The reservation admission and audit hooks are required.");

  const release = input.operation === "release";
  await db.limit("resource-reservation-" + (release ? "release:" : "write:") + hash(actorId), release ? 120 : 60, 3600);
  try {
    return await db.tx(actorId, org, c => commit(c, args, command, hooks), { lock: true });
  } catch (error) {
    // A failed or uncertain write never runs twice. A successful locked read is
    // required before returning an accepted replay or a definitive refusal.
    const settled = await read();
    if (settled.result) return settled.result;
    if (error instanceof ReservationRefusal) return okay(settled.context, {
      state: "refused", idempotencyKey: input.request.idempotencyKey, reasonCode: error.reasonCode,
    });
    if (error instanceof ReservationReadAgain)
      fail(409, "resource_reservation_reconcile", "Retry the exact reservation command.");
    throw error;
  }
}

const errors = {
  400: ["request", "Use the reservation workspace without a query or unexpected body."],
  401: ["session", "Sign in again before using reservations."],
  403: ["scope", "Your reservation access changed. Reload this workspace."],
  404: ["path", "This reservation route is unavailable."],
  405: ["method", "This method is unavailable for reservations."],
  409: ["reconcile", "Reload the reservation workspace or retry the exact pending command."],
  413: ["size", "The reservation request exceeds its size limit."],
  415: ["content_type", "Send the reservation request as JSON."],
  422: ["fields", "Use the exact bounded reservation fields and current selections."],
  429: ["rate", "Please wait before trying reservations again."],
  500: ["internal", "The reservation service could not settle this request."],
  503: ["unavailable", "The reservation service cannot complete this request right now."],
};

export async function resourceReservationRoutes({ request, url = new URL(request.url), db, settings, session,
  admitWorkspace, auditReservation }) {
  if (!isResourceReservationPath(url.pathname)) return null;
  try {
    const match = matchPath.exec(url.pathname);
    if (!match) fail(404, "resource_reservation_path", "This reservation route is unavailable.");
    const [, org, action] = match, read = action === "workspace";
    if (request.method !== (read ? "GET" : "POST")) fail(405, "method", "Use the reservation route's method.");
    if (url.search || read && (request.body !== null || request.headers.has("transfer-encoding") ||
        request.headers.has("content-length") && request.headers.get("content-length") !== "0"))
      fail(400, "request", "Use the exact reservation request.");
    const actorId = session?.user?.id;
    if (!resourceReservationId(actorId)) fail(401, "session", "Sign in to use reservations.");
    await db.tx(actorId, org, c => currentResourceReservationMember(c, org, session, true), { readOnly: true });
    if (!read) checkCsrf(request, session, settings);
    await db.limit("resource-reservation-route:" + hash(actorId), 120, 3600);
    const args = { org, session, secret: settings?.secret };
    if (read) return response(await db.tx(actorId, org, c => workspace(c, args), lockedRead));
    if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || ""))
      fail(415, "content_type", "Send the reservation request as JSON.");
    const body = await readBackupBody(request, limits.requestBytes);
    if (action === "review") {
      args.input = resourceReservationReviewInput(body);
      return response(await db.tx(actorId, org, c => review(c, args), lockedRead));
    }
    args.input = resourceReservationCommitInput(body);
    return response(await commitWithReconciliation(db, actorId, args, { admitWorkspace, auditReservation }));
  } catch (error) {
    // The wire never exposes database diagnostics, approval data or private hook errors.
    const known = error instanceof HttpError || error instanceof ParticipationGroupError || error instanceof ResourceReservationError;
    const status = known && Object.hasOwn(errors, error.status) ? error.status : 500;
    const [code, message] = errors[status];
    return json({ ok: false, code, message }, status, headers);
  }
}
