/** Pure interval arithmetic and owned validation profiles. No storage or authority is imported. */
import { validInstant, validZone, agreesWithZone } from "./schedule.mjs";

export const PARTICIPATION_INTERVAL_BYTES = 1024;
const MAX_PARTICIPATIONS = 2000;
const profiles = new WeakMap();
const plain = (v) =>
  v !== null &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
const own = (v, k) => Object.hasOwn(v, k);
const sameInterval = (a, b) =>
  a === b ||
  (!!a &&
    !!b &&
    ["version", "startAt", "endAt", "timeZone"].every((k) => a[k] === b[k]));
export { sameInterval };
export class ParticipationIntervalError extends Error {
  constructor(
    message = "Review a valid requested interval within the approved shift.",
    status = 422,
  ) {
    super(message);
    this.name = "ParticipationIntervalError";
    this.status = status;
    this.code = "participation_interval";
  }
}
function bad(message, status) {
  throw new ParticipationIntervalError(message, status);
}
function schedule(v) {
  if (
    !plain(v) ||
    !validInstant(v.startAt) ||
    !validInstant(v.endAt) ||
    !validZone(v.timeZone) ||
    !agreesWithZone(v.startAt, v.timeZone) ||
    !agreesWithZone(v.endAt, v.timeZone) ||
    Date.parse(v.startAt) >= Date.parse(v.endAt)
  )
    bad();
  return Object.freeze({
    startAt: v.startAt,
    endAt: v.endAt,
    timeZone: v.timeZone,
  });
}
export function validateRequestedInterval(
  input,
  terms,
  moduleId = "volunteers",
) {
  const parent = schedule(terms);
  if (input === null) return null;
  if (
    !plain(input) ||
    Object.keys(input).length !== 4 ||
    !["version", "startAt", "endAt", "timeZone"].every((k) => own(input, k)) ||
    input.version !== 1 ||
    moduleId !== "volunteers" ||
    terms.kind !== "shift" ||
    !plain(terms.intervalPolicy) ||
    terms.intervalPolicy.version !== 1 ||
    terms.intervalPolicy.mode !== "within-shift" ||
    Object.keys(terms.intervalPolicy).length !== 2
  )
    bad();
  const range = schedule(input);
  if (
    range.timeZone !== parent.timeZone ||
    Date.parse(range.startAt) < Date.parse(parent.startAt) ||
    Date.parse(range.endAt) > Date.parse(parent.endAt)
  )
    bad();
  const result = Object.freeze({ version: 1, ...range });
  // Four fields: PostgreSQL jsonb text adds one space after each of
  // the four colons and three commas, regardless of its key order.
  const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength + 7;
  if (bytes > PARTICIPATION_INTERVAL_BYTES)
    bad("This requested interval exceeds its retained limit.");
  return result;
}
export function requestedInterval(row, terms, moduleId) {
  return validateRequestedInterval(
    row.requested_interval ?? null,
    terms,
    moduleId || row.module_id,
  );
}
export function effectiveRequestedInterval(row, terms, moduleId) {
  return requestedInterval(row, terms, moduleId) || schedule(terms);
}
export function frozenParticipationInterval(row) {
  try {
    if (
      !plain(row.frozen) ||
      own(row.frozen, "allocationKnown") ||
      !plain(row.frozen.terms)
    )
      bad();
    const terms = row.frozen.terms;
    if (own(row.frozen, "interval")) {
      const range = validateRequestedInterval(
        row.frozen.interval,
        terms,
        row.module_id,
      );
      if (
        !range ||
        !sameInterval(range, row.requested_interval) ||
        !/^[a-f0-9]{64}$/.test(row.frozen.allocationHash)
      )
        bad();
      return range;
    }
    if (row.requested_interval != null || own(row.frozen, "allocationHash"))
      bad();
    return schedule(terms);
  } catch {
    bad(
      "Recorded allocation intervals need reconciliation before another mutation.",
      409,
    );
  }
}
export function intervalsOverlap(a, b) {
  // Keep the original boolean utility contract. Allocating callers first use
  // strict requested/frozen admission; generic schedules pass typed admission.
  const aa = Date.parse(a?.startAt),
    az = Date.parse(a?.endAt),
    ba = Date.parse(b?.startAt),
    bz = Date.parse(b?.endAt);
  return [aa, az, ba, bz].every(Number.isFinite) && aa < bz && ba < az;
}
export function peakOccupancy(intervals) {
  if (!Array.isArray(intervals) || intervals.length > MAX_PARTICIPATIONS)
    bad("The complete allocation inventory exceeds its retained limit.", 409);
  const endpoints = [];
  for (const value of intervals) {
    const s = schedule(value);
    endpoints.push([Date.parse(s.startAt), 1], [Date.parse(s.endAt), -1]);
  }
  endpoints.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let occupied = 0,
    peak = 0;
  for (const [, delta] of endpoints) {
    occupied += delta;
    peak = Math.max(peak, occupied);
  }
  return peak;
}
// Internal server construction only. An unowned JSON lookalike cannot supply validation authority.
export function createParticipationAllocationContext(targets, rows) {
  if (
    !Array.isArray(targets) ||
    targets.length > 500 ||
    !Array.isArray(rows) ||
    rows.length > MAX_PARTICIPATIONS
  )
    bad("The complete allocation inventory exceeds its retained limit.", 409);
  const byTarget = new Map(targets.map((t) => [t.target_id, []])),
    byBooking = new Map();
  for (const row of rows) {
    if (
      row.state !== "confirmed" &&
      !(
        row.recovered === true &&
        row.state !== "cancelled" &&
        row.recovered_state === "confirmed"
      )
    )
      continue;
    const range = frozenParticipationInterval(row);
    if (!byTarget.has(row.target_id) || byBooking.has(row.booking_record_id))
      bad("Recorded allocation identities need reconciliation.", 409);
    byTarget.get(row.target_id).push(range);
    byBooking.set(row.booking_record_id, range);
  }
  const summaries = new Map(
    [...byTarget].map(([id, ranges]) => [
      id,
      Object.freeze({
        confirmedCount: ranges.length,
        peakOccupied: peakOccupancy(ranges),
      }),
    ]),
  );
  const context = Object.freeze({});
  profiles.set(context, { summaries, byBooking });
  return context;
}
export function hasParticipationAllocationContext(context) {
  return profiles.has(context);
}
export function managedAllocationProfile(context, targetId) {
  return profiles.get(context)?.summaries.get(targetId);
}
export function validationInterval(context, bookingId, fallback) {
  return profiles.get(context)?.byBooking.get(bookingId) || fallback;
}
