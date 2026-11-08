/** Pure ordinary draft compiler. Metadata, hashes and output confer no authority. */
import { isProxy } from "node:util/types";
import { createHash } from "node:crypto";
import { getModule, validateRecord } from "./modules.mjs";
import { RECURRING_METHOD, RecurringScheduleError, validateRecurringSchedule,
  planRecurringSchedule, recurringOccurrenceAnchor } from "./participation-recurrence-planner.mjs";

export const RECURRING_DRAFT_LIMITS = Object.freeze({ bytes: 131072, nodes: 4096, depth: 16, references: 2 });
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const COMMON = ["title", "kind", "programId", "startAt", "endAt", "timeZone", "capacity",
  "participationPurpose", "participantInstructions", "organizerEmail", "organizerUrl"];
const COPY = Object.freeze({ events: Object.freeze([...COMMON, "accessCoordinatorNeeded", "joiningUrl"]),
  volunteers: Object.freeze([...COMMON, "skills", "safeguardingId", "allowPartialIntervals"]) });
const need = (value, code = "recurrence_draft_fields") => { if (!value) throw new RecurringScheduleError(code); };
const freeze = value => { if (value && typeof value === "object") { for (const item of Object.values(value)) freeze(item); Object.freeze(value); } return value; };
const unicode = value => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
const stable = value => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value)
  ? `[${value.map(stable).join(",")}]` : `{${Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stable(value[key])).join(",")}}`;
const hash = value => createHash("sha256").update("charitology:participation-recurrence:v1:drafts\0" + stable(value)).digest("hex");
const id = value => { need(typeof value === "string" && ID.test(value)); return value; };
const exact = (value, keys) => need(value && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));

// Module text keeps its real TAB/CR/LF policy. Semantic validators, rather than
// a global rewrite, reject controls in typed schedule/ID/title fields.
function owned(input) {
  const active = new Set(); let bytes = 0, nodes = 0;
  const charge = count => { bytes += count; need(bytes <= RECURRING_DRAFT_LIMITS.bytes, "recurrence_draft_limit"); };
  const visit = (value, depth) => {
    need(++nodes <= RECURRING_DRAFT_LIMITS.nodes && depth <= RECURRING_DRAFT_LIMITS.depth, "recurrence_draft_limit");
    if (value === null || typeof value === "boolean" || typeof value === "number") {
      need(typeof value !== "number" || Number.isFinite(value)); charge(Buffer.byteLength(JSON.stringify(value))); return value;
    }
    if (typeof value === "string") {
      need(value.length <= RECURRING_DRAFT_LIMITS.bytes && unicode(value)); charge(Buffer.byteLength(JSON.stringify(value))); return value;
    }
    need(value && typeof value === "object" && !isProxy(value) && !active.has(value));
    const array = Array.isArray(value); need(Object.getPrototypeOf(value) === (array ? Array.prototype : Object.prototype));
    const keys = Reflect.ownKeys(value); need(keys.every(key => typeof key === "string" && key.length <= 100 && unicode(key) && !/\p{Cc}/u.test(key)));
    let ordered = keys;
    if (array) {
      const d = Object.getOwnPropertyDescriptor(value, "length");
      need(d && Object.hasOwn(d, "value") && Number.isSafeInteger(d.value) && d.value >= 0 && d.value <= 8, "recurrence_draft_limit");
      ordered = Array.from({ length: d.value }, (_, i) => String(i)); const expected = new Set(ordered);
      need(keys.length === ordered.length + 1 && keys.every(key => key === "length" || expected.has(key)));
    } else need(keys.length <= 64, "recurrence_draft_limit");
    active.add(value); charge(2); const output = array ? [] : {}; let first = true;
    for (const key of ordered) {
      const d = Object.getOwnPropertyDescriptor(value, key); need(d?.enumerable && Object.hasOwn(d, "value"));
      if (!first) charge(1); first = false;
      if (!array) charge(Buffer.byteLength(JSON.stringify(key)) + 1);
      Object.defineProperty(output, key, { value: visit(d.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    active.delete(value); return output;
  };
  return visit(input, 0);
}
function ordinary(moduleId, data, context) {
  try { return validateRecord(moduleId, data, context); }
  catch (error) {
    if (error?.name === "ModuleValidationError") throw new RecurringScheduleError("recurrence_draft_record");
    throw error;
  }
}

/** Caller later proves fresh scope/raw pins and revalidates against real rows.
 * references are only exact typed lookup metadata, never permission proofs. */
export function compileRecurringOccurrenceDrafts(input) {
  const v = owned(input);
  exact(v, ["orgId", "actorId", "source", "schedule", "titles", "children", "references"]);
  id(v.orgId); id(v.actorId);
  const source = v.source; exact(source, ["id", "orgId", "moduleId", "revision", "data"]);
  id(source.id); need(source.orgId === v.orgId && ["events", "volunteers"].includes(source.moduleId) &&
    Number.isSafeInteger(source.revision) && source.revision >= 1 && source.revision <= 2147483647);
  const module = getModule(source.moduleId), data = source.data;
  need(data && !Array.isArray(data) && Object.getPrototypeOf(data) === Object.prototype &&
    Object.keys(data).every(key => module.fields.some(field => field.key === key)));
  need(data.kind === (source.moduleId === "events" ? "session" : "shift"));
  const schedule = validateRecurringSchedule(v.schedule), anchor = recurringOccurrenceAnchor({
    startAt: data.startAt, endAt: data.endAt, timeZone: data.timeZone, intervalWeeks: schedule.intervalWeeks,
  });
  need(schedule.timeZone === data.timeZone && stable(schedule.anchor) === stable(anchor), "recurrence_draft_anchor");
  const copied = Object.fromEntries(COPY[source.moduleId].filter(key => Object.hasOwn(data, key)).map(key => [key, data[key]]));
  const needed = [["programId", "programs"], ...(source.moduleId === "volunteers" ? [["safeguardingId", "safeguarding"]] : [])]
    .filter(([key]) => copied[key] !== null && copied[key] !== undefined && copied[key] !== "")
    .map(([key, moduleId]) => ({ id: id(copied[key]), orgId: v.orgId, moduleId }));
  need(Array.isArray(v.references) && v.references.length === needed.length && v.references.length <= RECURRING_DRAFT_LIMITS.references);
  const refs = new Map();
  for (const row of v.references) {
    exact(row, ["id", "orgId", "moduleId"]); id(row.id);
    need(row.orgId === v.orgId && !refs.has(row.id) && needed.some(n => stable(n) === stable(row)));
    refs.set(row.id, row);
  }
  const base = ordinary(source.moduleId, copied, { orgId: v.orgId, recordId: source.id, status: "draft", records: v.references });
  const plan = planRecurringSchedule(schedule); need(plan.state === "ready", "recurrence_draft_not_ready");
  const included = plan.occurrences.filter(row => row.range !== null);
  need(included.length > 0 && Array.isArray(v.children) && Array.isArray(v.titles) &&
    v.children.length === included.length && v.titles.length === included.length);
  const reserved = new Set([source.id, ...refs.keys()]), candidates = [];
  for (let i = 0; i < included.length; i++) {
    const o = included[i], child = v.children[i], title = v.titles[i];
    exact(child, ["sequence", "id"]); exact(title, ["sequence", "title"]);
    id(child.id); need(child.sequence === o.sequence && title.sequence === o.sequence &&
      typeof title.title === "string" && !reserved.has(child.id));
    reserved.add(child.id);
    const normalized = ordinary(source.moduleId, { ...copied, title: title.title, ...o.range },
      { orgId: v.orgId, recordId: child.id, status: "draft", records: v.references });
    candidates.push({ id: child.id, orgId: v.orgId, moduleId: source.moduleId, data: normalized,
      status: "draft", ownerId: v.actorId, lastEditedBy: v.actorId, revision: 1, approval: null, snapshot: null, source: null });
  }
  const snapshot = { id: source.id, moduleId: source.moduleId, revision: source.revision,
    data: Object.fromEntries(COPY[source.moduleId].map(key => [key, base[key]])) };
  const result = { format: "charitology-recurring-occurrence-draft-plan", version: 1, method: RECURRING_METHOD,
    orgId: v.orgId, actorId: v.actorId, source: snapshot, schedule, plan,
    children: included.map((row, i) => ({ sequence: row.sequence, recordId: candidates[i].id })), candidates };
  return freeze({ ...result, sha256: hash(result) });
}
