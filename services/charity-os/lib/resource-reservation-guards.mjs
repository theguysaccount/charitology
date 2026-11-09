/** Protect source-defining record writes while a live internal hold is reserved.
 * Always called with the tenant transaction client. No command bypass applies. */
import { isProxy } from "node:util/types";
import { fail, stable } from "./security.mjs";
import { validateHistoricalExclusiveResourceInterval } from "./resource-reservation-model.mjs";

const assetFields = ["kind", "programId", "assetCode", "locationCode", "quantity"];
const intervalFields = ["startAt", "endAt", "timeZone"];
const sessionFields = ["kind", "programId", ...intervalFields];
const id = value => typeof value === "string" && value.length >= 1 && value.length <= 100 &&
  !/[^A-Za-z0-9_-]/.test(value);
const sha = value => typeof value === "string" && value.length === 64 && !/[^a-f0-9]/.test(value);
const plain = value => value && typeof value === "object" && !isProxy(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Reflect.ownKeys(value).length === keys.length &&
  keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable && Object.hasOwn(descriptor, "value");
  });
const savedField = (value, key) => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return null;
  if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value"))
    throw new TypeError("Use typed reservation source data.");
  return descriptor.value ?? null;
};
const stateRefusal = () => fail(409, "resource_reservation_guard_state",
  "The saved hold and source record need reconciliation before this record can change.");
const holdRefusal = () => fail(409, "resource_reservation_guard",
  "Release or replace the live internal hold before changing this record's reserved details or moving it to trash.");
const sourceRetained = () => fail(409, "resource_reservation_source_retained",
  "Keep this record in the workspace. The retained reservation history needs it for export and recovery.");
const sourceRefusal = () => { throw new TypeError("Use typed capacity-one Asset or Events session data."); };
const optionalCode = value => value === null || typeof value === "string" && value.length <= 240;
const terminal = value => ["cancelled", "disposed"].includes(value);

// This same field projection can feed the selected proof's dataSha256. Frozen
// time-zone names remain literal here. Fresh admission still checks current
// named-zone agreement on the server.
export function resourceReservationDefiningData(moduleId, data) {
  const fields = moduleId === "assets" ? assetFields : moduleId === "events" ? sessionFields : null;
  if (!fields || !plain(data)) sourceRefusal();
  const defining = Object.fromEntries(fields.map(key => [key, savedField(data, key)]));
  if (defining.programId !== null && !id(defining.programId)) sourceRefusal();
  if (moduleId === "assets") {
    if (defining.kind !== "asset" || defining.quantity !== 1 ||
        !optionalCode(defining.assetCode) || !optionalCode(defining.locationCode)) sourceRefusal();
  } else {
    if (defining.kind !== "session") sourceRefusal();
    validateHistoricalExclusiveResourceInterval(Object.fromEntries(intervalFields.map(key => [key, defining[key]])));
  }
  return Object.freeze(defining);
}

const sourceValid = value => value === null || exact(value, ["integrationId", "externalId", "checksum"]) &&
  id(value.integrationId) && typeof value.externalId === "string" && value.externalId.length > 0 &&
  value.externalId.length <= 160 && sha(value.checksum);
const rowFields = ["org_id", "id", "module_id", "status", "trashed", "live_reserved",
  "proof_matches", "defining_data", "source", "source_fits"];
const jsonProjection = keys => "jsonb_build_object(" +
  keys.flatMap(key => ["'" + key + "'", "r.data->'" + key + "'"]).join(",") + ")";
const sourcePin = "h.org_id=r.org_id AND (h.asset_id=r.id OR h.occurrence_id=r.id)";
const livePin = sourcePin + " AND h.origin_mode='live' AND h.state='reserved'";
export const RESOURCE_RESERVATION_GUARD_SQL = Object.freeze({
  lock: "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
  projection: /* sql */ "SELECT r.org_id,r.id," +
    "CASE WHEN octet_length(r.module_id)<=32 THEN r.module_id END AS module_id," +
    "CASE WHEN octet_length(r.status)<=64 THEN r.status END AS status,r.deleted_at IS NOT NULL AS trashed," +
    "EXISTS(SELECT 1 FROM os_resource_reservations h WHERE " + livePin + ") AS live_reserved," +
    "NOT EXISTS(SELECT 1 FROM os_resource_reservations h WHERE " + livePin +
      " AND CASE r.module_id WHEN 'assets' THEN h.asset_id IS DISTINCT FROM r.id" +
      " OR h.proof->'quantity' IS DISTINCT FROM '1'::jsonb" +
      " WHEN 'events' THEN h.occurrence_id IS DISTINCT FROM r.id" +
      " OR h.proof->'interval' IS DISTINCT FROM " + jsonProjection(intervalFields) +
      " ELSE true END) AS proof_matches," +
    "CASE WHEN octet_length(p.defining_data::text)<=4096 THEN p.defining_data END AS defining_data," +
    "CASE WHEN octet_length(r.source::text)<=2048 THEN r.source END AS source," +
    "(r.source IS NULL OR octet_length(r.source::text)<=2048) AS source_fits " +
    "FROM os_records r CROSS JOIN LATERAL (SELECT CASE r.module_id WHEN 'assets' THEN " +
    jsonProjection(assetFields) + " WHEN 'events' THEN " + jsonProjection(sessionFields) +
    " END AS defining_data) p WHERE r.org_id=$1 AND r.id=$2 " +
    "AND EXISTS(SELECT 1 FROM os_resource_reservations h WHERE " + sourcePin + ") LIMIT 1",
  destination: "SELECT EXISTS(SELECT 1 FROM os_resource_reservations WHERE org_id=$1) " +
    "OR EXISTS(SELECT 1 FROM os_resource_reservation_commands WHERE org_id=$1) AS occupied",
});
function checkedRows(result) {
  if (!Array.isArray(result?.rows) || result.rowCount !== result.rows.length ||
      result.rows.length > 1) stateRefusal();
  return result.rows;
}

export async function guardResourceReservationWrite(c, record, { operation = "save" } = {}) {
  const { orgId, id: recordId, moduleId, data, status, source } = record ?? {};
  if (!id(orgId) || !id(recordId) || !["save", "delete", "restore"].includes(operation)) stateRefusal();
  // Take the lock first in its own statement. The next READ COMMITTED snapshot
  // must include a reservation committed by any writer this lock waited for.
  await c.query(RESOURCE_RESERVATION_GUARD_SQL.lock, [orgId]);
  const [before] = checkedRows(await c.query(RESOURCE_RESERVATION_GUARD_SQL.projection, [orgId, recordId]));
  if (!before) return;
  if (!exact(before, rowFields) || before.org_id !== orgId || before.id !== recordId ||
      typeof before.live_reserved !== "boolean") stateRefusal();
  // Retain the typed FK source for native export/recovery, including closed and
  // recovered history. Other protections below apply only to live holds.
  if (operation === "delete") sourceRetained();
  if (!before.live_reserved) return;
  // Relevance comes from the stored ID. The shared upsert preserves module_id,
  // so an unrelated incoming module name cannot be used as an early exit.
  if (moduleId !== before.module_id || operation !== "save" ||
      typeof status !== "string" || status.length < 1 || status.length > 64 || terminal(status)) holdRefusal();
  if (!["assets", "events"].includes(before.module_id) || before.trashed !== false ||
      typeof before.status !== "string" || !before.status || before.status.length > 64 ||
      terminal(before.status) || before.proof_matches !== true || before.source_fits !== true ||
      !sourceValid(before.source)) stateRefusal();

  let existing;
  try {
    const keys = moduleId === "assets" ? assetFields : sessionFields;
    if (!exact(before.defining_data, keys)) stateRefusal();
    existing = resourceReservationDefiningData(moduleId, before.defining_data);
  } catch { stateRefusal(); }

  let next;
  try { next = resourceReservationDefiningData(moduleId, data); }
  catch { holdRefusal(); }
  const nextSource = source ?? null;
  if (!sourceValid(nextSource) || stable(before.source) !== stable(nextSource) ||
      stable(existing) !== stable(next)) holdRefusal();
  // Ordinary safe revisions may clear or renew current approval or complete
  // the session. The ledger's original proof and accepted decision stay fixed.
}

/** Use in both full import checks under their existing organization lock. */
export async function resourceReservationHistoryPresent(c, orgId) {
  if (!id(orgId)) stateRefusal();
  const [row] = checkedRows(await c.query(RESOURCE_RESERVATION_GUARD_SQL.destination, [orgId]));
  if (!exact(row, ["occupied"]) || typeof row.occupied !== "boolean") stateRefusal();
  return row.occupied;
}
