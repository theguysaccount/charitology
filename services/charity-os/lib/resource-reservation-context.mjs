/** Current typed sources and authority. The caller supplies the actual org-locked transaction. */
import { requireAdmin, requirePermission } from "./access.mjs";
import { fail } from "./security.mjs";
import { validInstant } from "./schedule.mjs";
import { currentGroupMember, groupRestoreEpoch } from "./participation-group-access.mjs";
import { compareGroupExactStamps, validateGroupExactStamp } from "./participation-group-model.mjs";
import {
  freezeResourceReservationProof, makeResourceReservationAuthority, resourceReservationProofSha256,
} from "./resource-reservation-ledger.mjs";
import { ResourceReservationError, validateExclusiveResourceInterval } from "./resource-reservation-model.mjs";
import {
  reservationHash, resourceReservationId, resourceReservationRevision, resourceReservationSha256,
} from "./resource-reservation-preview.mjs";

const UTC = 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"';
const sourceLimit = 2000;
const unavailable = () => fail(500, "resource_reservation_context", "The current reservation context is unavailable.");
const stale = () => fail(409, "resource_reservation_stale", "A selected record changed. Reload and review it.");
const reconcile = () => fail(409, "resource_reservation_reconcile", "The recorded command cannot be reconciled with its current source identities.");
const boundedText = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;

function rows(result, max) {
  if (!Array.isArray(result?.rows) || result.rowCount !== result.rows.length || result.rows.length > max)
    unavailable();
  return result.rows;
}

export async function currentResourceReservationMember(c, org, session, readOnly) {
  const member = await currentGroupMember(c, org, session, { moduleId: "events", readOnly });
  requireAdmin(member);
  if (member.programIds.length !== 0)
    fail(403, "scope", "An unrestricted organization administrator is required.");
  requirePermission("assets", member, "read");
  requirePermission("assets", member, "write");
  return member;
}

function authority(context, restoreEpochSha256) {
  const { org, session, member } = context;
  return makeResourceReservationAuthority({
    orgId: org, actorId: member.userId, sessionId: session.session.id, role: member.role,
    programIds: member.programIds, memberRevision: member.revision, memberCreatedAtExact: member.createdAtExact,
    restoreEpochSha256,
  });
}

export async function resourceReservationScope(c, { org, session, readOnly }) {
  const member = await currentResourceReservationMember(c, org, session, readOnly);
  const [epoch] = rows(await c.query(`
    SELECT to_char(o.created_at AT TIME ZONE 'UTC','${UTC}') AS created_exact,
      (SELECT max(e.id)::text FROM os_events e WHERE e.org_id=o.id AND e.action='backup.restored') AS restored_id
    FROM os_orgs o WHERE o.id=$1`, [org]), 1);
  if (!epoch) fail(403, "scope", "This organization is unavailable or your access has ended.");
  validateGroupExactStamp(epoch.created_exact);
  if (epoch.restored_id !== null && (typeof epoch.restored_id !== "string" ||
      !/^[1-9]\d{0,18}$/.test(epoch.restored_id) || BigInt(epoch.restored_id) > 9223372036854775807n))
    unavailable();
  const context = { org, session, member };
  const organizationEpoch = reservationHash("organization-restore", { org, ...epoch });
  return { ...context, scopeSha256: reservationHash("workspace-scope", authority(context, organizationEpoch)) };
}

export function requireResourceReservationScope(context, supplied) {
  if (context.scopeSha256 !== supplied)
    fail(403, "scope", "Your reservation scope changed. Reload this workspace.");
}

export async function resourceReservationClock(c) {
  const [clock] = rows(await c.query(
    `SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','${UTC}') AS now_exact`,
  ), 1);
  return validateGroupExactStamp(clock?.now_exact);
}

export function resourceReservationFuture(interval, nowExact) {
  const start = new Date(Date.parse(interval.startAt)).toISOString().replace("Z", "000Z");
  return compareGroupExactStamps(nowExact, start) < 0;
}

// The approval object tracks the current revision through valid workflow transitions.
// The published snapshot may be older. Neither its data nor supplier/contact fields are read.
function approvedSource(row) {
  const a = row.approval;
  if (!a || typeof a !== "object" || Array.isArray(a) || Object.keys(a).length !== 5 ||
      !["status", "revision", "actorId", "reason", "at"].every(key => Object.hasOwn(a, key)) ||
      a.status !== "approved" || a.revision !== row.revision || !resourceReservationId(a.actorId) ||
      !resourceReservationId(row.last_editor_id) || a.actorId === row.last_editor_id ||
      !boundedText(a.reason, 2000) || typeof a.at !== "string" || !validInstant(a.at) ||
      !resourceReservationId(row.id) || !resourceReservationRevision(row.revision) || !boundedText(row.title, 180))
    return null;

  const data = row.defining;
  if (!data || (data.programId !== null && !resourceReservationId(data.programId))) return null;
  const dto = { id: row.id, revision: row.revision, title: row.title };
  if (row.module_id === "assets") {
    if (data.kind !== "asset" || data.quantity !== 1 ||
        [data.assetCode, data.locationCode].some(value => value !== null && !boundedText(value, 240))) return null;
    dto.quantity = 1;
  } else {
    if (row.module_id !== "events" || data.kind !== "session") return null;
    const { startAt, endAt, timeZone } = data;
    try { dto.interval = validateExclusiveResourceInterval({ startAt, endAt, timeZone }); }
    catch (error) {
      if (error instanceof ResourceReservationError) return null;
      throw error;
    }
  }
  return {
    dto,
    pin: {
      id: row.id, moduleId: row.module_id, kind: data.kind, revision: row.revision,
      createdAtExact: validateGroupExactStamp(row.created_exact),
      dataSha256: reservationHash("source-data", { title: row.title, ...data }),
      approvalSha256: reservationHash("source-approval", a),
    },
  };
}

/** Complete eligible view, or the two exact current typed selections. */
export async function readResourceReservationSources(c, org, selection = null) {
  const cap = selection === null ? sourceLimit + 1 : 2;
  const selected = selection === null ? null : [selection.asset.id, selection.session.id];
  const found = rows(await c.query(`
    SELECT r.id,r.module_id,r.revision,r.last_editor_id,r.data->'title' AS title,r.approval,d.defining,
      to_char(r.created_at AT TIME ZONE 'UTC','${UTC}') AS created_exact
    FROM os_records r CROSS JOIN LATERAL (
      SELECT CASE WHEN r.module_id='assets' THEN jsonb_build_object(
        'kind',r.data->'kind','programId',r.data->'programId','assetCode',r.data->'assetCode',
        'locationCode',r.data->'locationCode','quantity',r.data->'quantity')
      ELSE jsonb_build_object(
        'kind',r.data->'kind','programId',r.data->'programId','startAt',r.data->'startAt',
        'endAt',r.data->'endAt','timeZone',r.data->'timeZone') END AS defining
    ) d
    WHERE r.org_id=$1 AND ($2::text[] IS NULL OR r.id=ANY($2::text[])) AND r.deleted_at IS NULL
      AND r.approval->>'status'='approved' AND r.approval->'revision'=to_jsonb(r.revision)
      AND octet_length(r.approval::text)<=16384 AND octet_length((r.data->'title')::text)<=2048
      AND octet_length(d.defining::text)<=4096
      AND ((r.module_id='assets' AND r.data->>'kind'='asset' AND r.data->'quantity'='1'::jsonb
            AND r.status IN ('approved','received','assigned'))
        OR (r.module_id='events' AND r.data->>'kind'='session' AND r.status IN ('approved','scheduled','open')))
    ORDER BY r.id COLLATE "C" LIMIT ${cap}`, [org, selected]), cap);
  if (found.length > sourceLimit)
    fail(422, "resource_reservation_limit", "The reservation workspace exceeds its source limit.");
  const sources = found.map(approvedSource).filter(Boolean);
  if (!selection) return sources;
  const asset = sources.find(row => row.pin.moduleId === "assets" &&
    row.dto.id === selection.asset.id && row.dto.revision === selection.asset.revision);
  const session = sources.find(row => row.pin.moduleId === "events" &&
    row.dto.id === selection.session.id && row.dto.revision === selection.session.revision);
  if (!asset || !session) stale();
  const proof = freezeResourceReservationProof({
    version: 1, orgId: org, asset: asset.pin, session: session.pin, quantity: 1, interval: session.dto.interval,
  });
  return { asset: asset.dto, session: session.dto, proof, proofSha256: resourceReservationProofSha256(proof) };
}

export const resourceReservationRowProof = row => row.proof ?? row.history.proof;

/** Check all affected source incarnations and their restore markers. Old sources
 * may be unapproved or in trash. They carry no fresh booking authority. */
export async function resourceReservationCommandAuthority(c, context, proofs, replay = false) {
  const mismatch = replay ? reconcile : stale;
  const expected = new Map();
  for (const proof of proofs) {
    for (const pin of [proof.asset, proof.session]) {
      const prior = expected.get(pin.id);
      if (prior && (prior.createdAtExact !== pin.createdAtExact || prior.moduleId !== pin.moduleId)) mismatch();
      expected.set(pin.id, pin);
    }
  }
  const ids = [...expected.keys()];
  if (ids.length < 2 || ids.length > 4) unavailable();
  const found = rows(await c.query(`
    SELECT id,module_id,to_char(created_at AT TIME ZONE 'UTC','${UTC}') AS created_exact
    FROM os_records WHERE org_id=$1 AND id=ANY($2::text[])`, [context.org, ids]), ids.length);
  if (found.length !== ids.length || new Set(found.map(row => row.id)).size !== ids.length) mismatch();
  for (const row of found) {
    const pin = expected.get(row.id);
    if (!pin || row.module_id !== pin.moduleId || row.created_exact !== pin.createdAtExact) mismatch();
  }
  return authority(context, await groupRestoreEpoch(c, context.org, ids));
}

/** The effect-only lookup deliberately avoids physical quota and complete inventory reads. */
export async function readResourceReservationEffects(c, org, receipt) {
  const { decision, commandHash } = receipt;
  const effects = [decision.previous, decision.next].filter(Boolean);
  const found = rows(await c.query(`
    SELECT id,asset_id,occurrence_id,origin_mode,state,revision,proof,proof_sha256,original_command_hash,terminal_command_hash
    FROM os_resource_reservations WHERE org_id=$1 AND id=ANY($2::text[])`,
  [org, effects.map(effect => effect.id)]), effects.length);
  if (found.length !== effects.length) reconcile();
  const proofs = [];
  const current = effects.map(effect => {
    const row = found.find(item => item.id === effect.id);
    if (!row || row.origin_mode !== "live" || row.proof_sha256 !== effect.proofSha256 ||
        row.proof?.orgId !== org || resourceReservationProofSha256(row.proof) !== effect.proofSha256 ||
        row.asset_id !== row.proof.asset.id || row.occurrence_id !== row.proof.session.id) reconcile();
    if (effect === decision.previous) {
      if (row.state !== "released" || row.revision !== 2 || row.terminal_command_hash !== commandHash) reconcile();
    } else if (row.original_command_hash !== commandHash ||
        !(row.state === "reserved" && row.revision === 1 && row.terminal_command_hash === null ||
          row.state === "released" && row.revision === 2 && resourceReservationSha256(row.terminal_command_hash))) reconcile();
    proofs.push(row.proof);
    return { id: row.id, proofSha256: row.proof_sha256, state: row.state, revision: row.revision };
  });
  return { current, proofs };
}
