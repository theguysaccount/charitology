/** Private pure candidate. A schedule review is never participation authority. */
import { isProxy } from "node:util/types";
import { createHash } from "node:crypto";
import { validDate, validInstant, agreesWithZone } from "./schedule.mjs";
import { resolveTaskCivil, validateTaskCandidate } from "./task-recurrence-model.mjs";

export const RECURRING_METHOD = "participation-weekly-v1";
export const RECURRING_LIMITS = Object.freeze({
  occurrences: 8, intervalWeeks: 4, inputBytes: 16384, nodes: 512,
  depth: 12, durationCivilDays: 7, horizonCivilDays: 366,
});
const FORMAT = "charitology-participation-recurrence";
const DAY = 86400000;
const safe = v => !/\p{Cc}/u.test(v) && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v);
const freeze = v => {
  if (v && typeof v === "object") { for (const x of Object.values(v)) freeze(x); Object.freeze(v); }
  return v;
};
export class RecurringScheduleError extends Error {
  constructor(code = "recurrence_fields") {
    super("Review the exact bounded recurring schedule fields.");
    this.name = "RecurringScheduleError"; this.code = code; this.status = 422;
  }
}
const need = (v, code) => { if (!v) throw new RecurringScheduleError(code); };
const integer = (v, low, high) => Number.isSafeInteger(v) && v >= low && v <= high;
const stable = v => v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v)
  ? `[${v.map(stable).join(",")}]`
  : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
const digest = (kind, v) => createHash("sha256").update(`charitology:participation-recurrence:v1:${kind}\0${stable(v)}`).digest("hex");

function own(input, limits = RECURRING_LIMITS) {
  const active = new Set(); let nodes = 0, bytes = 0;
  const charge = n => { bytes += n; need(bytes <= limits.inputBytes, "recurrence_limit"); };
  const visit = (v, depth) => {
    need(++nodes <= limits.nodes && depth <= limits.depth, "recurrence_limit");
    if (v === null || typeof v === "boolean" || typeof v === "number") {
      need(typeof v !== "number" || Number.isFinite(v)); charge(Buffer.byteLength(JSON.stringify(v))); return v;
    }
    if (typeof v === "string") {
      need(v.length <= limits.inputBytes && safe(v)); charge(Buffer.byteLength(JSON.stringify(v))); return v;
    }
    need(v && typeof v === "object" && !isProxy(v) && !active.has(v));
    const array = Array.isArray(v), proto = Object.getPrototypeOf(v);
    need(array ? proto === Array.prototype : proto === Object.prototype);
    const keys = Reflect.ownKeys(v);
    need(keys.every(k => typeof k === "string" && k.length <= 100 && safe(k)));
    let ordered = keys;
    if (array) {
      const d = Object.getOwnPropertyDescriptor(v, "length");
      need(d && Object.hasOwn(d, "value") && integer(d.value, 0, RECURRING_LIMITS.occurrences), "recurrence_limit");
      ordered = Array.from({ length: d.value }, (_, i) => String(i));
      const set = new Set(ordered);
      need(keys.length === ordered.length + 1 && keys.every(k => k === "length" || set.has(k)));
    } else need(keys.length <= 16, "recurrence_limit");
    active.add(v); charge(2); const out = array ? [] : {}; let first = true;
    for (const k of ordered) {
      const d = Object.getOwnPropertyDescriptor(v, k);
      need(d?.enumerable && Object.hasOwn(d, "value"));
      if (!first) charge(1); first = false;
      if (!array) charge(Buffer.byteLength(JSON.stringify(k)) + 1);
      Object.defineProperty(out, k, { value: visit(d.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    active.delete(v); return out;
  };
  return visit(input, 0);
}
const exact = (v, keys) => need(v && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype &&
  Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k)));
function civil(value) {
  const m = typeof value === "string" && /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(value);
  need(m && validDate(m[1]) && +m[2] < 24 && +m[3] < 60 && +m[4] < 60, "recurrence_civil");
  return Date.UTC(+m[1].slice(0, 4), +m[1].slice(5, 7) - 1, +m[1].slice(8, 10), +m[2], +m[3], +m[4], +m[5]);
}
function advance(value, days) {
  const text = new Date(civil(value) + days * DAY).toISOString().slice(0, -1);
  civil(text); return text;
}
function zoneText(value) {
  need(typeof value === "string" && /^[A-Za-z0-9_+./-]{1,100}$/.test(value) && !/^[+-]/.test(value), "recurrence_zone");
  return value;
}
function zone(value) {
  zoneText(value);
  try { return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone; }
  catch { throw new RecurringScheduleError("recurrence_zone"); }
}
function pair(start, end, base) {
  const a = civil(start), b = civil(end);
  need(b > a && b - a <= RECURRING_LIMITS.durationCivilDays * DAY, "recurrence_duration");
  need(a >= base && b <= base + RECURRING_LIMITS.horizonCivilDays * DAY, "recurrence_horizon");
}
function fields(v, historical = false) {
  exact(v, ["format", "version", "method", "timeZone", "anchor", "intervalWeeks", "count", "exceptions", "resolutions"]);
  need(v.format === FORMAT && v.version === 1 && v.method === RECURRING_METHOD);
  if (historical) zoneText(v.timeZone); else zone(v.timeZone);
  exact(v.anchor, ["startCivil", "endCivil"]);
  need(integer(v.count, 1, RECURRING_LIMITS.occurrences) && integer(v.intervalWeeks, 1, RECURRING_LIMITS.intervalWeeks), "recurrence_limit");
  const base = civil(v.anchor.startCivil);
  pair(v.anchor.startCivil, v.anchor.endCivil, base);
  pair(advance(v.anchor.startCivil, (v.count - 1) * v.intervalWeeks * 7), advance(v.anchor.endCivil, (v.count - 1) * v.intervalWeeks * 7), base);
  need(Array.isArray(v.exceptions) && Array.isArray(v.resolutions) && v.resolutions.length === v.count);
  let prior = 0;
  for (const e of v.exceptions) {
    need(e && ["skip", "replace"].includes(e.kind));
    exact(e, e.kind === "skip" ? ["sequence", "kind", "reason"] : ["sequence", "kind", "reason", "startCivil", "endCivil"]);
    need(integer(e.sequence, 1, v.count) && e.sequence > prior && typeof e.reason === "string" && e.reason.trim().length > 0 && e.reason.length <= 300);
    if (e.kind === "replace") pair(e.startCivil, e.endCivil, base);
    prior = e.sequence;
  }
  for (let i = 0; i < v.count; i++) {
    const r = v.resolutions[i]; exact(r, ["sequence", "start", "end"]);
    need(r.sequence === i + 1 && [null, "earlier", "later"].includes(r.start) && [null, "earlier", "later"].includes(r.end));
    if (v.exceptions.some(e => e.sequence === r.sequence && e.kind === "skip")) need(r.start === null && r.end === null);
  }
  return v;
}
export const validateRecurringSchedule = input => freeze(fields(own(input)));
export const recurringScheduleHash = input => digest("input", fields(own(input)));

export function planRecurringSchedule(input) {
  const v = fields(own(input)), canonicalTimeZone = zone(v.timeZone), cache = new Map();
  const resolve = text => {
    if (!cache.has(text)) {
      const r = resolveTaskCivil(text, v.timeZone);
      cache.set(text, { kind: r.kind, civil: r.civil, reason: r.reason ?? null, candidates: r.candidates });
    }
    return cache.get(text);
  };
  const occurrences = []; let previousEnd = null, included = 0;
  for (let sequence = 1; sequence <= v.count; sequence++) {
    const days = (sequence - 1) * v.intervalWeeks * 7;
    const nominal = { startCivil: advance(v.anchor.startCivil, days), endCivil: advance(v.anchor.endCivil, days) };
    const exception = v.exceptions.find(e => e.sequence === sequence) ?? null;
    const effective = exception?.kind === "replace" ? { startCivil: exception.startCivil, endCivil: exception.endCivil } : { ...nominal };
    const item = { sequence, nominal, exception, effective, startResolution: null, endResolution: null, range: null, blockers: [] };
    if (exception?.kind !== "skip") {
      included++;
      const choice = v.resolutions[sequence - 1];
      let start = null, end = null;
      for (const side of ["start", "end"]) {
        const r = resolve(effective[side + "Civil"]); item[side + "Resolution"] = r;
        if (r.kind !== "fold") need(choice[side] === null, "recurrence_choice");
        if (r.kind === "gap" || r.kind === "unsupported") item.blockers.push(side + "-" + r.kind);
        else if (r.kind === "fold" && choice[side] === null) item.blockers.push(side + "-choice-required");
        else {
          const selected = r.candidates.find(c => c.choice === (choice[side] ?? "unique"));
          need(selected, "recurrence_choice");
          if (side === "start") start = selected; else end = selected;
        }
      }
      if (start && end) {
        const a = Date.parse(start.instant), b = Date.parse(end.instant);
        if (a >= b) item.blockers.push("instant-order");
        else {
          item.range = { startAt: start.dueAt, endAt: end.dueAt, timeZone: v.timeZone };
          if (previousEnd !== null && a < previousEnd) item.blockers.push("prior-order-or-overlap");
          previousEnd = Math.max(previousEnd ?? b, b);
        }
      }
    }
    occurrences.push(item);
  }
  const plan = { format: FORMAT + "-plan", version: 1, method: RECURRING_METHOD, inputSha256: digest("input", v),
    timeZone: v.timeZone, canonicalTimeZone,
    state: !included ? "empty" : occurrences.some(o => o.blockers.length) ? "needs-review" : "ready", occurrences };
  return freeze({ ...plan, planSha256: digest("plan", plan) });
}

/** Real occurrence schedule only. No fake task, current clock or authority. */
export function recurringOccurrenceAnchor(input) {
  const v = own(input);
  exact(v, ["startAt", "endAt", "timeZone", "intervalWeeks"]);
  zone(v.timeZone);
  need(integer(v.intervalWeeks, 1, RECURRING_LIMITS.intervalWeeks), "recurrence_limit");
  need(validInstant(v.startAt) && validInstant(v.endAt) &&
    Date.parse(v.endAt) > Date.parse(v.startAt), "recurrence_civil");
  need(agreesWithZone(v.startAt, v.timeZone) && agreesWithZone(v.endAt, v.timeZone), "recurrence_zone");
  const local = value => {
    const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,3}))?(?:Z|[+-]\d\d:\d\d)$/.exec(value);
    need(m, "recurrence_civil");
    return m[1] + "." + (m[2] ?? "").padEnd(3, "0");
  };
  const start = local(v.startAt), end = local(v.endAt), base = civil(start);
  pair(start, end, base);
  const days = v.intervalWeeks * 7;
  return freeze({ startCivil: advance(start, days), endCivil: advance(end, days) });
}

/** Historical ready-plan arithmetic, not today's zone truth or live authority.
 * It deliberately does not consult Intl or call resolveTaskCivil. */
export function validateFrozenRecurringPlan(input) {
  const v = own(input, { inputBytes: 131072, nodes: 4096, depth: 16 });
  exact(v, ["schedule", "plan"]);
  const schedule = fields(v.schedule, true), p = v.plan;
  exact(p, ["format", "version", "method", "inputSha256", "timeZone", "canonicalTimeZone", "state", "occurrences", "planSha256"]);
  need(p.format === FORMAT + "-plan" && p.version === 1 && p.method === RECURRING_METHOD &&
    p.state === "ready" && p.timeZone === schedule.timeZone &&
    p.inputSha256 === digest("input", schedule), "recurrence_history");
  zoneText(p.canonicalTimeZone);
  const { planSha256, ...header } = p;
  need(typeof planSha256 === "string" && /^[a-f0-9]{64}$/.test(planSha256) &&
    planSha256 === digest("plan", header), "recurrence_history");
  need(Array.isArray(p.occurrences) && p.occurrences.length === schedule.count, "recurrence_history");
  let previousEnd = null, included = 0;
  const candidate = (r, value, choice) => {
    exact(r, ["kind", "civil", "reason", "candidates"]);
    need(["unique", "fold"].includes(r.kind) && r.civil === value && r.reason === null &&
      Array.isArray(r.candidates) && r.candidates.length === (r.kind === "fold" ? 2 : 1), "recurrence_history");
    let prior = null;
    for (let i = 0; i < r.candidates.length; i++) {
      const c = r.candidates[i];
      try { validateTaskCandidate(c, { civil: value, timeZone: p.timeZone, historical: true }); }
      catch { throw new RecurringScheduleError("recurrence_history"); }
      need(c.choice === (r.kind === "unique" ? "unique" : i === 0 ? "earlier" : "later"), "recurrence_history");
      const offset = Math.abs(c.offsetSeconds), dueAt = value + (offset === 0 ? "Z" :
        (c.offsetSeconds < 0 ? "-" : "+") + String(Math.floor(offset / 3600)).padStart(2, "0") + ":" + String(offset % 3600 / 60).padStart(2, "0"));
      const at = Date.parse(c.instant);
      need(c.dueAt === dueAt && (prior === null || at > prior), "recurrence_history");
      prior = at;
    }
    need(r.kind === "fold" ? ["earlier", "later"].includes(choice) : choice === null, "recurrence_history");
    return r.candidates.find(c => c.choice === (choice ?? "unique"));
  };
  for (let i = 0; i < schedule.count; i++) {
    const o = p.occurrences[i], sequence = i + 1, days = i * schedule.intervalWeeks * 7;
    exact(o, ["sequence", "nominal", "exception", "effective", "startResolution", "endResolution", "range", "blockers"]);
    const nominal = { startCivil: advance(schedule.anchor.startCivil, days), endCivil: advance(schedule.anchor.endCivil, days) };
    const exception = schedule.exceptions.find(e => e.sequence === sequence) ?? null;
    const effective = exception?.kind === "replace" ? { startCivil: exception.startCivil, endCivil: exception.endCivil } : nominal;
    need(o.sequence === sequence && stable(o.nominal) === stable(nominal) &&
      stable(o.exception) === stable(exception) && stable(o.effective) === stable(effective) &&
      Array.isArray(o.blockers) && o.blockers.length === 0, "recurrence_history");
    if (exception?.kind === "skip") {
      need(o.startResolution === null && o.endResolution === null && o.range === null, "recurrence_history");
      continue;
    }
    included++;
    const choices = schedule.resolutions[i], start = candidate(o.startResolution, effective.startCivil, choices.start),
      end = candidate(o.endResolution, effective.endCivil, choices.end);
    exact(o.range, ["startAt", "endAt", "timeZone"]);
    const a = Date.parse(start.instant), b = Date.parse(end.instant);
    need(o.range.startAt === start.dueAt && o.range.endAt === end.dueAt && o.range.timeZone === schedule.timeZone &&
      a < b && (previousEnd === null || a >= previousEnd), "recurrence_history");
    previousEnd = b;
  }
  need(included > 0, "recurrence_history");
  return freeze(v);
}
