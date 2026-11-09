/** Bounded tenant storage. Mutations run inside the existing org-locked
 * transaction. The caller owns authorization, audit and workspace admission. */
import { fail, stable } from "./security.mjs";
import { ownGroupValue } from "./participation-group-model.mjs";
import {
  RESOURCE_RESERVATION_LIMITS as limits,
  resourceReservationProofSha256,
  validateResourceReservationReceipt,
  validateResourceReservationRow,
  validateResourceReservationRows,
} from "./resource-reservation-ledger.mjs";

const need = (condition, code = "resource_reservation_storage") => {
  if (!condition) fail(409, code, "Reload the retained reservation history before continuing.");
};
const same = (a, b) => stable(a) === stable(b);
const selector = value => need(typeof value === "string" &&
  value.length >= 1 && value.length <= 100 && !/[^A-Za-z0-9_-]/.test(value));
const sha = value => need(typeof value === "string" && value.length === 64 && !/[^a-f0-9]/.test(value));
const exact = (value, keys) => need(value && !Array.isArray(value) && typeof value === "object" &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
const limited = (result, cap) => {
  need(Array.isArray(result?.rows) && result.rows.length <= cap && result.rowCount === result.rows.length);
  return result.rows;
};
const count = value => {
  need(typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value));
  const result = Number(value);
  need(Number.isSafeInteger(result));
  return result;
};

const reservationColumns = [
  "org_id", "id", "asset_id", "occurrence_id", "origin_mode", "state", "revision", "proof",
  "proof_sha256", "original_command_hash", "terminal_command_hash", "history_core", "disposition",
];
const commandColumns = ["org_id", "command_hash", "receipt", "previous_id", "next_id"];
const projections = reservationColumns.map(name => "r." + name).join(",");
const insertReservation = `INSERT INTO os_resource_reservations(${reservationColumns.join(",")})
 VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12::jsonb,$13::jsonb) RETURNING id`;

export function projectResourceReservationStorageRow(input) {
  const row = validateResourceReservationRow(input);
  const source = row.proof ?? row.history.proof;
  const disposition = row.history?.disposition ?? null;
  let historyCore = null;
  if (row.history) {
    const { disposition: _, ...core } = row.history;
    historyCore = Object.freeze(core);
  }
  return Object.freeze({
    org_id: row.orgId,
    id: row.id,
    asset_id: source.asset.id,
    occurrence_id: source.session.id,
    origin_mode: row.originMode,
    state: row.state,
    revision: row.revision,
    proof: row.proof,
    proof_sha256: resourceReservationProofSha256(source),
    original_command_hash: row.originalReceipt?.commandHash ?? null,
    terminal_command_hash: row.terminalReceipt?.commandHash ?? null,
    history_core: historyCore,
    disposition,
  });
}

export function projectResourceReservationCommandStorage(input) {
  const receipt = validateResourceReservationReceipt(input);
  return Object.freeze({
    org_id: receipt.decision.orgId,
    command_hash: receipt.commandHash,
    receipt,
    previous_id: receipt.decision.previous?.id ?? null,
    next_id: receipt.decision.next?.id ?? null,
  });
}

function rowFromSql(input, org) {
  const raw = ownGroupValue(input, 24 * 1024);
  exact(raw, [...reservationColumns, "original_receipt", "terminal_receipt"]);
  need(raw.org_id === org);
  const row = validateResourceReservationRow({
    version: 1, orgId: raw.org_id, id: raw.id, originMode: raw.origin_mode, state: raw.state,
    revision: raw.revision, proof: raw.proof, originalReceipt: raw.original_receipt,
    terminalReceipt: raw.terminal_receipt,
    history: raw.history_core === null ? null : { ...raw.history_core, disposition: raw.disposition },
  });
  const expected = projectResourceReservationStorageRow(row);
  for (const name of reservationColumns) need(same(raw[name], expected[name]));
  return row;
}

/** Actual complete SQL composites of both tables. The extra row detects
 * overflow without materializing an unbounded inventory. */
export async function measureResourceReservationStorage(c, org) {
  selector(org);
  const result = limited(await c.query(`
    WITH holds AS (
      SELECT count(*)::text AS n,COALESCE(sum(octet_length(to_jsonb(r)::text)),0)::text AS bytes
      FROM (SELECT t.* FROM os_resource_reservations t WHERE t.org_id=$1 LIMIT ${limits.rows + 1}) r
    ), commands AS (
      SELECT count(*)::text AS n,COALESCE(sum(octet_length(to_jsonb(r)::text)),0)::text AS bytes
      FROM (SELECT t.* FROM os_resource_reservation_commands t WHERE t.org_id=$1 LIMIT ${2 * limits.rows + 1}) r
    )
    SELECT holds.n AS reservation_count,commands.n AS command_count,
      holds.bytes AS reservation_bytes,commands.bytes AS command_bytes FROM holds,commands`, [org]), 1);
  need(result.length === 1);
  const value = ownGroupValue(result[0], 1024);
  exact(value, ["reservation_count", "command_count", "reservation_bytes", "command_bytes"]);
  const reservations = count(value.reservation_count);
  const commands = count(value.command_count);
  const reservationBytes = count(value.reservation_bytes);
  const commandBytes = count(value.command_bytes);
  const bytes = reservationBytes + commandBytes;
  if (reservations > limits.rows || commands > 2 * reservations || bytes > limits.familyBytes)
    fail(422, "resource_reservation_quota", "The retained resource history exceeds its bounded storage.");
  return Object.freeze({ reservations, commands, reservationBytes, commandBytes, bytes });
}

export async function loadResourceReservationInventory(c, org) {
  const quota = await measureResourceReservationStorage(c, org);
  const raw = limited(await c.query(`
    SELECT ${projections},a.receipt AS original_receipt,z.receipt AS terminal_receipt
    FROM os_resource_reservations r
    LEFT JOIN os_resource_reservation_commands a ON a.org_id=r.org_id AND a.command_hash=r.original_command_hash
    LEFT JOIN os_resource_reservation_commands z ON z.org_id=r.org_id AND z.command_hash=r.terminal_command_hash
    WHERE r.org_id=$1 ORDER BY r.id COLLATE "C" LIMIT ${limits.rows + 1}`, [org]), limits.rows + 1);
  need(raw.length === quota.reservations);
  const rows = validateResourceReservationRows(org, raw.map(item => rowFromSql(item, org)));
  const keys = new Set();
  for (const row of rows) {
    for (const receipt of [row.originalReceipt, row.terminalReceipt]) {
      if (receipt) keys.add(receipt.commandHash);
    }
  }
  need(keys.size === quota.commands);
  return Object.freeze({ rows, quota });
}

/** The current access and incarnation checks belong to the caller. This
 * lookup deliberately does not inspect preview expiry or inventory quota. */
export async function findResourceReservationReceipt(c, org, commandHash) {
  selector(org);
  sha(commandHash);
  const raw = limited(await c.query(`SELECT ${commandColumns.join(",")}
    FROM os_resource_reservation_commands WHERE org_id=$1 AND command_hash=$2`, [org, commandHash]), 1);
  if (!raw.length) return null;
  const value = ownGroupValue(raw[0], 8192);
  exact(value, commandColumns);
  need(value.org_id === org && value.command_hash === commandHash);
  const projected = projectResourceReservationCommandStorage(value.receipt);
  need(same(value, projected));
  return projected.receipt;
}

function changed(result, id) {
  const rows = limited(result, 1);
  need(rows.length === 1 && rows[0]?.id === id, "resource_reservation_stale");
}

function json(value) {
  return value === null ? null : JSON.stringify(value);
}

async function insertOne(c, row) {
  const values = reservationColumns.map(name =>
    ["proof", "history_core", "disposition"].includes(name) ? json(row[name]) : row[name]);
  changed(await c.query(insertReservation, values), row.id);
}

export async function applyResourceReservationPlan(c, org, input) {
  selector(org);
  const plan = ownGroupValue(input, 40 * 1024);
  exact(plan, ["state", "insert", "update", "receipt"]);
  need(plan.state === "ready");
  const receipt = projectResourceReservationCommandStorage(plan.receipt);
  const added = plan.insert === null ? null : projectResourceReservationStorageRow(plan.insert);
  const terminal = plan.update === null ? null : projectResourceReservationStorageRow(plan.update);
  need(receipt.org_id === org);
  if (added) {
    need(added.org_id === org && added.origin_mode === "live" && added.state === "reserved" &&
      added.id === receipt.next_id && same(plan.insert.originalReceipt, receipt.receipt));
  } else need(receipt.next_id === null);
  if (terminal) {
    need(terminal.org_id === org && terminal.origin_mode === "live" && terminal.state === "released" &&
      terminal.id === receipt.previous_id && same(plan.update.terminalReceipt, receipt.receipt));
  } else need(receipt.previous_id === null);

  const stored = limited(await c.query(`INSERT INTO os_resource_reservation_commands(org_id,command_hash,receipt)
    VALUES($1,$2,$3::jsonb) RETURNING command_hash,previous_id,next_id`,
    [org, receipt.command_hash, JSON.stringify(receipt.receipt)]), 1);
  need(stored.length === 1 && stored[0].command_hash === receipt.command_hash &&
    stored[0].previous_id === receipt.previous_id && stored[0].next_id === receipt.next_id);

  if (terminal) {
    changed(await c.query(`UPDATE os_resource_reservations SET state='released',revision=2,terminal_command_hash=$3
      WHERE org_id=$1 AND id=$2 AND origin_mode='live' AND state='reserved' AND revision=1
       AND terminal_command_hash IS NULL AND proof_sha256=$4 AND original_command_hash=$5 AND proof=$6::jsonb
      RETURNING id`,
      [org, terminal.id, receipt.command_hash, terminal.proof_sha256,
        terminal.original_command_hash, JSON.stringify(terminal.proof)]), terminal.id);
  }
  if (added) await insertOne(c, added);
  const quota = await measureResourceReservationStorage(c, org);
  return Object.freeze({ receipt: receipt.receipt, insertedId: added?.id ?? null, releasedId: terminal?.id ?? null, quota });
}

/** Restore already-admitted recovered rows under the same tenant lock. */
export async function insertRecoveredResourceReservations(c, org, input) {
  const rows = validateResourceReservationRows(org, input);
  need(rows.every(row => row.originMode === "recovered"));
  if (rows.length) {
    const columns = reservationColumns.join(",");
    const projected = rows.map(projectResourceReservationStorageRow);
    const inserted = limited(await c.query(`INSERT INTO os_resource_reservations(${columns})
      SELECT ${columns} FROM jsonb_populate_recordset(NULL::os_resource_reservations,$2::jsonb)
      WHERE org_id=$1 ORDER BY id COLLATE "C" RETURNING id`, [org, JSON.stringify(projected)]), rows.length);
    const ids = new Set(inserted.map(item => item.id));
    need(ids.size === rows.length && rows.every(row => ids.has(row.id)), "resource_reservation_stale");
  }
  return measureResourceReservationStorage(c, org);
}

export async function recordResourceReservationDisposition(c, org, input) {
  selector(org);
  const row = projectResourceReservationStorageRow(input);
  need(row.org_id === org && row.origin_mode === "recovered" && row.revision === 2 &&
    row.state === "released" && row.disposition?.orgId === org);
  changed(await c.query(`UPDATE os_resource_reservations SET state='released',revision=2,disposition=$3::jsonb
    WHERE org_id=$1 AND id=$2 AND origin_mode='recovered' AND state='reserved' AND revision=1
     AND disposition IS NULL AND proof_sha256=$4 AND history_core=$5::jsonb RETURNING id`,
    [org, row.id, JSON.stringify(row.disposition), row.proof_sha256, JSON.stringify(row.history_core)]), row.id);
  return measureResourceReservationStorage(c, org);
}
