/** Data-only, capacity-one interval review. No source, identity, permission,
 * approval, SQL clock, complete-inventory proof or reservation authority is
 * established here. A ready result is never a command or a retained hold. */
import { isProxy } from 'node:util/types';
import { validInstant, validZone, agreesWithZone } from './schedule.mjs';
import { intervalsOverlap } from './participation-intervals.mjs';

export const EXCLUSIVE_RESOURCE_LIMITS = Object.freeze({ reservations: 1000 });
const INVALID_ID_CHARACTER = /[^A-Za-z0-9_-]/;
export class ResourceReservationError extends Error {
  constructor(code = 'resource_reservation_shape') {
    super('Review the complete capacity-one resource inventory.');
    this.name = 'ResourceReservationError';
    this.code = code;
    this.status = 422;
  }
}
const invalid = (code) => { throw new ResourceReservationError(code); };
const id = (value) => {
  if (typeof value !== 'string' || value.length < 1 || value.length > 100 || INVALID_ID_CHARACTER.test(value)) invalid();
  return value;
};
function fields(input, keys) {
  if (!input || typeof input !== 'object' || isProxy(input) || Array.isArray(input) ||
      Object.getPrototypeOf(input) !== Object.prototype) invalid();
  const actual = Reflect.ownKeys(input);
  if (actual.length !== keys.length || !actual.every(key => keys.includes(key))) invalid();
  const detached = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
    Object.defineProperty(detached, key, { enumerable: true, value: descriptor.value });
  }
  return detached;
}
function list(input) {
  if (!input || typeof input !== 'object' || isProxy(input) || !Array.isArray(input) ||
      Object.getPrototypeOf(input) !== Array.prototype) invalid();
  const descriptor = Object.getOwnPropertyDescriptor(input, 'length');
  if (!descriptor || !Object.hasOwn(descriptor, 'value') || !Number.isSafeInteger(descriptor.value) ||
      descriptor.value < 0 || descriptor.value > EXCLUSIVE_RESOURCE_LIMITS.reservations)
    invalid('resource_reservation_limit');
  const allowed = new Set(['length']);
  for (let i = 0; i < descriptor.value; i++) allowed.add(String(i));
  const actual = Reflect.ownKeys(input);
  if (actual.length !== allowed.size || !actual.every(key => allowed.has(key))) invalid();
  const detached = [];
  for (let i = 0; i < descriptor.value; i++) {
    const item = Object.getOwnPropertyDescriptor(input, String(i));
    if (!item?.enumerable || !Object.hasOwn(item, 'value')) invalid();
    detached.push(item.value);
  }
  return detached;
}
export function validateExclusiveResourceInterval(input) {
  const value = fields(input, ['startAt', 'endAt', 'timeZone']);
  if (typeof value.timeZone !== 'string' || !validInstant(value.startAt) || !validInstant(value.endAt) ||
      !validZone(value.timeZone) || !agreesWithZone(value.startAt, value.timeZone) ||
      !agreesWithZone(value.endAt, value.timeZone) ||
      Date.parse(value.startAt) >= Date.parse(value.endAt))
    invalid('resource_reservation_interval');
  return Object.freeze(value);
}
/** Literal frozen-history syntax only. Later zone-rule changes must not
 * reinterpret or erase an already recorded interval. This proves neither
 * original current-zone agreement nor source approval or live authority. */
export function validateHistoricalExclusiveResourceInterval(input) {
  const value = fields(input, ['startAt', 'endAt', 'timeZone']);
  if (!validInstant(value.startAt) || !validInstant(value.endAt) ||
      typeof value.timeZone !== 'string' || value.timeZone.length < 1 || value.timeZone.length > 100 ||
      /[^A-Za-z0-9_+./-]/.test(value.timeZone) ||
      /^[+-]/.test(value.timeZone) || Date.parse(value.startAt) >= Date.parse(value.endAt))
    invalid('resource_reservation_interval');
  return Object.freeze(value);
}
function candidate(input) {
  const value = fields(input, ['assetId', 'occurrenceId', 'interval']);
  return Object.freeze({ assetId: id(value.assetId), occurrenceId: id(value.occurrenceId),
    interval: validateExclusiveResourceInterval(value.interval) });
}
function row(input) {
  const value = fields(input, ['id', 'assetId', 'occurrenceId', 'originMode', 'state', 'interval']);
  if (!['live', 'recovered'].includes(value.originMode) || !['reserved', 'released'].includes(value.state)) invalid();
  return Object.freeze({ id: id(value.id), assetId: id(value.assetId), occurrenceId: id(value.occurrenceId),
    originMode: value.originMode, state: value.state, interval: validateHistoricalExclusiveResourceInterval(value.interval) });
}
const liveHold = value => value.originMode === 'live' && value.state === 'reserved';
function inventory(input) {
  const rows = list(input).map(row), ids = new Set(), pairs = new Set(), byAsset = new Map();
  for (const value of rows) {
    if (ids.has(value.id)) invalid('resource_reservation_inventory');
    ids.add(value.id);
    if (!liveHold(value)) continue;
    const pair = `${value.assetId}\0${value.occurrenceId}`;
    if (pairs.has(pair)) invalid('resource_reservation_inventory');
    pairs.add(pair);
    if (!byAsset.has(value.assetId)) byAsset.set(value.assetId, []);
    byAsset.get(value.assetId).push(value.interval);
  }
  // Existing live overlaps are a reconciliation issue. A new plan must not
  // selectively omit one of those claims to make its inventory appear valid.
  for (const ranges of byAsset.values()) {
    ranges.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
    for (let i = 1; i < ranges.length; i++)
      if (Date.parse(ranges[i].startAt) < Date.parse(ranges[i - 1].endAt))
        invalid('resource_reservation_inventory');
  }
  return Object.freeze(rows);
}
const sameRange = (a, b) => ['startAt', 'endAt', 'timeZone'].every(key => a[key] === b[key]);

/** Internal detached projection only. The server must supply its complete
 * current tenant inventory under its organization lock, check both selected
 * records and current independent approvals, and atomically write/recheck.
 * Recovered reserved history blocks an asset until explicit reconciliation;
 * it is never treated as a live external reservation. */
export function reviewExclusiveResourceCapacity(input) {
  const value = fields(input, ['capacity', 'candidate', 'reservations', 'replacingReservationId']);
  if (value.capacity !== 1) invalid('resource_reservation_known_capacity');
  const proposed = candidate(value.candidate), retained = inventory(value.reservations);
  const replacingId = value.replacingReservationId === null ? null : id(value.replacingReservationId);
  const previous = replacingId === null ? null : retained.find(item => item.id === replacingId);
  if (replacingId !== null && (!previous || !liveHold(previous))) invalid('resource_reservation_replacement');
  const result = (state) => Object.freeze({ state, capacity: 1, replacingReservationId: replacingId });
  if (previous && previous.assetId === proposed.assetId && previous.occurrenceId === proposed.occurrenceId &&
      sameRange(previous.interval, proposed.interval)) return result('unchanged');
  if (retained.some(item => item.assetId === proposed.assetId && item.originMode === 'recovered' && item.state === 'reserved'))
    return result('recovery-required');
  const others = retained.filter(item => item.id !== replacingId && liveHold(item) && item.assetId === proposed.assetId);
  if (others.some(item => item.occurrenceId === proposed.occurrenceId || intervalsOverlap(item.interval, proposed.interval)))
    return result('conflict');
  return result('ready');
}
