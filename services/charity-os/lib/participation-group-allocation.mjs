/** Pure prospective ledger only; no consent, approval, SQL or live authority. */
import { isProxy } from "node:util/types";
import { ownGroupValue, validateGroupSelection } from "./participation-group-model.mjs";
import { validInstant, validZone, agreesWithZone } from "./schedule.mjs";
import { peakOccupancy, intervalsOverlap } from "./participation-intervals.mjs";

export const GROUP_ALLOCATION_METHOD = "participation-group-allocation-v1";
export const GROUP_ALLOCATION_LIMITS = Object.freeze({ inventory: 2000, selected: 10, rowBytes: 4096, blockers: 6 });
const SELECTED = ["orgId", "participationId", "bookingRecordId", "contactId", "targetId", "moduleId", "range"];
const EXISTING = ["kind", "orgId", "id", "bookingRecordId", "contactId", "targetId", "moduleId", "range"];
const CODES = ["capacity-unknown", "capacity-zero", "capacity-exceeded", "duplicate-contact", "duplicate-booking", "volunteer-overlap"];
const freeze = v => {
  if (v && typeof v === "object") { for (const x of Object.values(v)) freeze(x); Object.freeze(v); }
  return v;
};
export class ParticipationGroupAllocationError extends Error {
  constructor(code = "participation_group_allocation_fields") {
    super(code === "participation_group_allocation_ledger" ? "Current source and saved allocations require reconciliation before another allocation." : "Use the complete bounded group selection and allocation projection.");
    this.name = "ParticipationGroupAllocationError"; this.code = code;
    this.status = code === "participation_group_allocation_ledger" ? 409 : 422;
  }
}
const bad = code => { throw new ParticipationGroupAllocationError(code); };
const need = (v, code) => { if (!v) bad(code); };
const id = (v, code) => need(typeof v === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v), code);
const moduleId = (v, code) => need(["events", "volunteers"].includes(v), code);
const exact = (v, keys, code) => need(v && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k)), code);
function owned(v, code) { try { return ownGroupValue(v, GROUP_ALLOCATION_LIMITS.rowBytes); } catch { bad(code); } }

// Inspect only descriptors here: cloning a 2000-row family through the model's
// 128 KiB graph API would incorrectly impose that unrelated whole-input cap.
function envelope(v) {
  need(v && typeof v === "object" && !isProxy(v) && Object.getPrototypeOf(v) === Object.prototype);
  const keys = ["orgId", "target", "rosterIds", "selection", "selected", "existing"], actual = Reflect.ownKeys(v);
  need(actual.length === keys.length && actual.every(k => typeof k === "string" && keys.includes(k)));
  const out = {};
  for (const k of keys) {
    const d = Object.getOwnPropertyDescriptor(v, k); need(d?.enumerable && Object.hasOwn(d, "value")); out[k] = d.value;
  }
  return out;
}
function dense(v, max) {
  need(v && typeof v === "object" && !isProxy(v) && Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype);
  const length = Object.getOwnPropertyDescriptor(v, "length");
  need(length && Object.hasOwn(length, "value") && Number.isSafeInteger(length.value) && length.value >= 0 && length.value <= max, "participation_group_allocation_limit");
  const keys = Reflect.ownKeys(v), indices = Array.from({ length: length.value }, (_, i) => String(i)), set = new Set(indices);
  need(keys.length === indices.length + 1 && keys.every(k => typeof k === "string" && (k === "length" || set.has(k))));
  return indices.map(k => { const d = Object.getOwnPropertyDescriptor(v, k); need(d?.enumerable && Object.hasOwn(d, "value")); return d.value; });
}
function range(v, code) {
  exact(v, ["startAt", "endAt", "timeZone"], code);
  need(validInstant(v.startAt) && validInstant(v.endAt) && validZone(v.timeZone) && agreesWithZone(v.startAt, v.timeZone) && agreesWithZone(v.endAt, v.timeZone) && Date.parse(v.startAt) < Date.parse(v.endAt), code);
}
const sameRange = (a, b) => ["startAt", "endAt", "timeZone"].every(k => a[k] === b[k]);
const within = (a, b) => a.timeZone === b.timeZone && Date.parse(a.startAt) >= Date.parse(b.startAt) && Date.parse(a.endAt) <= Date.parse(b.endAt);
function row(raw, orgId, existing) {
  const code = existing ? "participation_group_allocation_ledger" : "participation_group_allocation_fields", v = owned(raw, code);
  exact(v, existing ? EXISTING : SELECTED, code);
  for (const k of ["orgId", "bookingRecordId", "contactId", "targetId", existing ? "id" : "participationId"]) id(v[k], code);
  need(v.orgId === orgId, code); moduleId(v.moduleId, code); range(v.range, code);
  if (existing) { need(["managed", "unmanaged"].includes(v.kind), code); if (v.kind === "unmanaged") need(v.id === v.bookingRecordId, code); }
  return v;
}

export function planGroupAllocation(input) {
  const e = envelope(input), orgId = owned(e.orgId), target = owned(e.target); id(orgId);
  exact(target, ["targetId", "moduleId", "capacity", "range"]); id(target.targetId); moduleId(target.moduleId); range(target.range);
  need(target.capacity === null || (Number.isSafeInteger(target.capacity) && target.capacity >= 0));
  const supplied = dense(e.selected, GROUP_ALLOCATION_LIMITS.selected), prior = dense(e.existing, GROUP_ALLOCATION_LIMITS.inventory);
  need(supplied.length + prior.length <= GROUP_ALLOCATION_LIMITS.inventory, "participation_group_allocation_limit");
  let roster, selection;
  try {
    roster = ownGroupValue(e.rosterIds, 4096); selection = validateGroupSelection(e.selection, roster);
  } catch { bad("participation_group_allocation_selection"); }
  const selectedIds = selection.mode === "all" ? [...roster].sort() : selection.items;
  const selected = supplied.map(v => row(v, orgId, false)), existing = prior.map(v => row(v, orgId, true));
  need(selected.length === selectedIds.length && new Set(selected.map(v => v.participationId)).size === selected.length && selected.every(v => selectedIds.includes(v.participationId)), "participation_group_allocation_selection");
  for (const v of selected) {
    need(v.targetId === target.targetId && v.moduleId === target.moduleId);
    need(target.moduleId === "events" ? sameRange(v.range, target.range) : within(v.range, target.range));
  }
  const namespace = new Set(), bookings = new Set(), contacts = new Set(), targetModules = new Map([[target.targetId, target.moduleId]]), selectedById = new Map(selected.map(v => [v.participationId, v]));
  for (const v of existing) {
    const code = "participation_group_allocation_ledger", key = v.kind + ":" + v.id;
    need(!namespace.has(key) && !bookings.has(v.bookingRecordId), code); namespace.add(key); bookings.add(v.bookingRecordId);
    need(!targetModules.has(v.targetId) || targetModules.get(v.targetId) === v.moduleId, code); targetModules.set(v.targetId, v.moduleId);
    const personTarget = v.targetId + ":" + v.contactId; need(!contacts.has(personTarget), code); contacts.add(personTarget);
    if (v.kind === "managed" && selectedById.has(v.id)) {
      const s = selectedById.get(v.id);
      need(["bookingRecordId", "contactId", "targetId", "moduleId"].every(k => s[k] === v[k]) && sameRange(s.range, v.range), code);
    }
    if (v.targetId === target.targetId) {
      // This target is managed by the caller. Unadopted legacy bookings or a
      // current source/frozen-range mismatch require reconciliation; never
      // rewrite, discard or relabel the valid historical commitment.
      need(v.kind === "managed", code);
      need(target.moduleId === "events" ? sameRange(v.range, target.range) : within(v.range, target.range), code);
    }
  }
  const blocked = new Map(CODES.map(code => [code, new Set()]));
  const mark = (code, ids) => { for (const id of ids) blocked.get(code).add(id); };
  for (let i = 0; i < selected.length; ++i) {
    const s = selected[i];
    for (const x of existing) {
      if (x.bookingRecordId === s.bookingRecordId || (x.kind === "managed" && x.id === s.participationId)) mark("duplicate-booking", [s.participationId]);
      if (x.targetId === s.targetId && x.contactId === s.contactId) mark("duplicate-contact", [s.participationId]);
      if (s.moduleId === "volunteers" && x.moduleId === "volunteers" && x.contactId === s.contactId && intervalsOverlap(x.range, s.range)) mark("volunteer-overlap", [s.participationId]);
    }
    for (const other of selected.slice(i + 1)) {
      const pair = [s.participationId, other.participationId];
      if (s.bookingRecordId === other.bookingRecordId) mark("duplicate-booking", pair);
      if (s.contactId === other.contactId) {
        mark("duplicate-contact", pair);
        if (s.moduleId === "volunteers" && intervalsOverlap(s.range, other.range)) mark("volunteer-overlap", pair);
      }
    }
  }
  const atTarget = existing.filter(x => x.targetId === target.targetId), ranges = [...atTarget.map(x => x.range), ...selected.map(x => x.range)], targetPeak = peakOccupancy(ranges);
  if (target.capacity === null) mark("capacity-unknown", selectedIds);
  else if (target.capacity === 0) mark("capacity-zero", selectedIds);
  else if (targetPeak > target.capacity) mark("capacity-exceeded", selectedIds);
  const blockers = CODES.filter(code => blocked.get(code).size).map(code => ({ code, participationIds: [...blocked.get(code)].sort() }));
  return freeze({ method: GROUP_ALLOCATION_METHOD, version: 1, ready: blockers.length === 0, selectedIds, blockers,
    counts: { roster: roster.length, selected: selectedIds.length, unchanged: roster.length - selectedIds.length, targetExisting: atTarget.length, targetProspective: atTarget.length + selectedIds.length, targetPeak, capacity: target.capacity } });
}

export const GROUP_ALLOCATION_CONTRACT = freeze({
  method: GROUP_ALLOCATION_METHOD, candidateOnly: true,
  inputKeys: ["orgId", "target", "rosterIds", "selection", "selected", "existing"],
  targetKeys: ["targetId", "moduleId", "capacity", "range"], selectedKeys: SELECTED, existingKeys: EXISTING,
  rangeKeys: ["startAt", "endAt", "timeZone"], blockerCodes: CODES,
  outputKeys: ["method", "version", "ready", "selectedIds", "blockers", "counts"],
  countKeys: ["roster", "selected", "unchanged", "targetExisting", "targetProspective", "targetPeak", "capacity"],
  callerDuties: ["derive every old managed range ONLY from frozenParticipationInterval, never editable fallback", "include complete applicable managed and unmanaged allocations", "prove real session/scope/source/consent/approval authority", "one locked transaction and full fresh pins", "SQL/native/inactive/future-exit capacity admission"],
  conservativeRefusal: "Current source/saved range mismatch or conflicting old identities require reconciliation; saved history is never changed or labeled false.",
  privacy: "No org inventory length, hidden IDs/records/times or inventory digest. Only selected IDs, generic blockers and authorized-target occupancy aggregates.",
  notImplemented: ["booking mutation", "confirmation", "HMAC preview", "live authorization", "SQL", "capacity reserve measurement", "inventory digest"],
});
