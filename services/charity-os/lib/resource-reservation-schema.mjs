import { fail } from "./security.mjs";

const layout = `
  WITH bindings AS (
    SELECT pg_catalog.to_regclass('os_records') AS records,
      pg_catalog.to_regclass('os_resource_reservations') AS holds,
      pg_catalog.to_regclass('os_resource_reservation_commands') AS commands
  )
  SELECT COALESCE(r.relkind='r', false) AS core,
    h.oid IS NOT NULL AS holds, k.oid IS NOT NULL AS commands,
    COALESCE(h.relkind='r' AND k.relkind='r'
      AND h.relnamespace=r.relnamespace AND k.relnamespace=r.relnamespace
      AND h.relrowsecurity AND h.relforcerowsecurity AND k.relrowsecurity AND k.relforcerowsecurity
      AND (SELECT count(*) FROM pg_catalog.pg_policy
        WHERE polrelid IN (h.oid,k.oid) AND polname='tenant')=2
      AND (SELECT count(*) FROM pg_catalog.pg_attribute
        WHERE attnum>0 AND NOT attisdropped AND (
          attrelid=h.oid AND attname IN ('org_id','id','asset_id','occurrence_id','origin_mode',
            'state','revision','proof','proof_sha256','original_command_hash','terminal_command_hash',
            'history_core','disposition')
          OR attrelid=k.oid AND attname IN ('org_id','command_hash','receipt','previous_id','next_id')
        ))=18
      AND (SELECT count(*) FROM pg_catalog.pg_trigger
        WHERE NOT tgisinternal AND tgenabled IN ('O','A') AND (
          tgrelid=h.oid AND tgname IN ('resource_reservation_guard','complete_resource_reservation')
          OR tgrelid=k.oid AND tgname IN ('immutable_resource_reservation_command',
            'complete_resource_reservation_command')
        ))=4, false) AS complete
  FROM bindings
  LEFT JOIN pg_catalog.pg_class r ON r.oid=bindings.records
  LEFT JOIN pg_catalog.pg_class h ON h.oid=bindings.holds
  LEFT JOIN pg_catalog.pg_class k ON k.oid=bindings.commands
`;

const access = `
  SELECT pg_catalog.has_table_privilege(pg_catalog.to_regclass('os_resource_reservations'), 'SELECT')
    AND pg_catalog.has_table_privilege(pg_catalog.to_regclass('os_resource_reservations'), 'INSERT')
    AND pg_catalog.has_table_privilege(pg_catalog.to_regclass('os_resource_reservation_commands'), 'SELECT')
    AND pg_catalog.has_table_privilege(pg_catalog.to_regclass('os_resource_reservation_commands'), 'INSERT')
    AND pg_catalog.has_column_privilege(pg_catalog.to_regclass('os_resource_reservations'), 'state', 'UPDATE')
    AND pg_catalog.has_column_privilege(pg_catalog.to_regclass('os_resource_reservations'), 'revision', 'UPDATE')
    AND pg_catalog.has_column_privilege(pg_catalog.to_regclass('os_resource_reservations'), 'terminal_command_hash', 'UPDATE')
    AND pg_catalog.has_column_privilege(pg_catalog.to_regclass('os_resource_reservations'), 'disposition', 'UPDATE')
    AS ready
`;

const unavailable = () => fail(503, "resource_reservation_schema",
  "Room and equipment reservations are temporarily unavailable.");

function booleanRow(result, keys) {
  const row = result?.rows?.[0];
  if (result?.rowCount !== 1 || result.rows?.length !== 1 || !row ||
      Object.keys(row).length !== keys.length ||
      !keys.every(key => Object.hasOwn(row, key) && typeof row[key] === "boolean")) unavailable();
  return row;
}

/** Resolve the same search-path bindings the actual queries will use. Only the
 * legacy layout with neither table present can bypass reservation accounting.
 * Catalog reads work under the existing application role and tenant RLS. */
export async function resourceReservationSchemaReady(c) {
  const row = booleanRow(await c.query(layout), ["core", "holds", "commands", "complete"]);
  if (!row.core || row.holds !== row.commands || row.complete !== row.holds) unavailable();
  return row.complete;
}

/** Call after current staff authorization. A partial layout is an error even
 * where an absent feature or a missing grant would hide the staff affordance. */
export async function resourceReservationAccessReady(c) {
  if (!await resourceReservationSchemaReady(c)) return false;
  return booleanRow(await c.query(access), ["ready"]).ready;
}

export async function requireResourceReservationAccess(c) {
  if (!await resourceReservationAccessReady(c)) unavailable();
}

export const RESOURCE_RESERVATION_HISTORY_SQL =
  "(EXISTS(SELECT 1 FROM os_resource_reservations WHERE org_id=$1) " +
  "OR EXISTS(SELECT 1 FROM os_resource_reservation_commands WHERE org_id=$1))";

/** Keep missing tables out of the parsed statement altogether. */
export async function resourceReservationHistoryExpression(c) {
  return await resourceReservationSchemaReady(c) ? RESOURCE_RESERVATION_HISTORY_SQL : "false";
}

export const RESOURCE_RESERVATION_SCHEMA_SQL = Object.freeze({ layout, access });
