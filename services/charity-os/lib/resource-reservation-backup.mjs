/** Full native workspace history. Current source records are required for
 * restored foreign keys. Source trash remains part of the private archive. */
import { isProxy } from "node:util/types";
import { fail } from "./security.mjs";
import {
  RESOURCE_RESERVATION_LIMITS as limits,
  makeResourceReservationsBackup,
  restoreResourceReservationRows,
  validateResourceReservationsBackup,
} from "./resource-reservation-ledger.mjs";
import {
  insertRecoveredResourceReservations,
  loadResourceReservationInventory,
  measureResourceReservationStorage,
} from "./resource-reservation-store.mjs";

const badHistory = () => fail(422, "resource_reservation_history", "Use a complete resource reservation history.");
function data(value, key, optional = false) {
  if (!value || typeof value !== "object" || isProxy(value)) badHistory();
  const field = Object.getOwnPropertyDescriptor(value, key);
  if (field === undefined && optional) return undefined;
  if (!field?.enumerable || !Object.hasOwn(field, "value")) badHistory();
  return field.value;
}

function array(value, limit) {
  if (!Array.isArray(value) || isProxy(value) || value.length > limit) badHistory();
  return Array.from({ length: value.length }, (_, index) => data(value, String(index)));
}

function selectedSources(proofs) {
  const selected = new Map();
  for (const proof of proofs) {
    for (const [key, moduleId] of [["asset", "assets"], ["session", "events"]]) {
      const id = data(data(proof, key), "id");
      if (typeof id !== "string" || id.length < 1 || id.length > 100 || /[^A-Za-z0-9_-]/.test(id))
        badHistory();
      if (selected.has(id) && selected.get(id) !== moduleId) badHistory();
      selected.set(id, moduleId);
    }
  }
  return selected;
}

function references(selected, records, trash, restore) {
  if (!selected.size) return [];
  const found = new Map();
  for (const [items, archived] of [[records, false], [trash, true]]) {
    if (!Array.isArray(items) || isProxy(items) || (!archived && items.length > 2000)) badHistory();
    // Trash is already part of the bounded native packet. Do not impose a new
    // item ceiling on unrelated archived records.
    for (let index = 0; index < items.length; index++) {
      const item = data(items, String(index));
      const id = data(item, "id");
      if (!selected.has(id)) continue;
      const moduleId = data(item, "moduleId");
      if (found.has(id) || selected.get(id) !== moduleId)
        fail(422, "resource_reservation_source", "A reservation source has an inconsistent record identity.");
      found.set(id, { id, moduleId, archived });
    }
  }
  for (const id of selected.keys()) {
    const source = found.get(id);
    if (!source)
      fail(422, "resource_reservation_source", "The backup is missing a retained reservation source.");
    if (source.archived && restore)
      fail(422, "resource_reservation_archive_source", "Restore the reservation's Asset and Events source records from trash in the original workspace, then export a new backup.");
  }
  return [...found.values()].map(({ id, moduleId }) => ({ id, moduleId }));
}

export async function exportResourceReservations(c, org, { records, trash = [] }) {
  const { rows } = await loadResourceReservationInventory(c, org);
  if (!rows.length) return undefined;
  const selected = selectedSources(rows.map(row => row.proof ?? row.history.proof));
  return makeResourceReservationsBackup(org, rows, references(selected, records, trash, false));
}

export function restoredResourceReservations(backup, orgId) {
  const input = data(backup, "resourceReservations", true);
  if (input === undefined) return null;
  const sourceOrgId = data(input, "sourceOrgId");
  const histories = array(data(input, "histories"), limits.rows);
  const selected = selectedSources(histories.map(history => data(history, "proof")));
  const refs = references(selected, data(backup, "records"), data(backup, "trash", true) ?? [], true);
  const block = validateResourceReservationsBackup(input, sourceOrgId, refs);
  const rows = restoreResourceReservationRows(orgId, block, sourceOrgId, refs);
  return Object.freeze({ rows, block });
}

export const resourceReservationRestoreSummary = recovery =>
  recovery === null ? {} : { resourceReservationsRecovered: recovery.rows.length };

export async function restoreResourceReservations(c, orgId, recovery) {
  if (recovery === null) return null;
  const current = await measureResourceReservationStorage(c, orgId);
  if (current.reservations || current.commands)
    fail(409, "restore_conflict", "Restore requires a destination without resource reservation history.");
  await insertRecoveredResourceReservations(c, orgId, recovery.rows);
  return recovery.rows.length;
}
