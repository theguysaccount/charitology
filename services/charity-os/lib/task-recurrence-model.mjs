/** IO-free recurrence calendar and preparation. The tenant service supplies current persisted authority. */
import {
  getModule,
  modulePermissions,
  ROLES,
  validDate,
  validateRecord,
} from "./modules.mjs";
import { inScope, visibleRecord } from "./access.mjs";
import { fail, hash, stable } from "./security.mjs";

export const TASK_RECURRENCE_METHOD = "task-recurrence-v1";
export const TASK_RECURRENCE_LIMITS = Object.freeze({
  sequence: 2000,
  references: 102,
  records: 2000,
  packet: 8192,
  endGrowthReserve: 2048,
});
export const taskRecurrenceHash = hash;
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const FREQUENCIES = ["weekly", "monthly", "quarterly"];
const ANCHOR_KEYS = [
  "method",
  "rootRecordId",
  "frequency",
  "originalDueAt",
  "anchorCivil",
  "anchorInstant",
  "originalTimeZone",
  "canonicalTimeZone",
  "programId",
  "monthPolicy",
  "weekPolicy",
  "gapPolicy",
  "foldPolicy",
];
const CANDIDATE_KEYS = ["choice", "dueAt", "instant", "offsetSeconds"];
const DATA_KEYS = getModule("projects").fields.map((f) => f.key);
const integer = (v, min = 1, max = 2147483647) =>
  Number.isInteger(v) && v >= min && v <= max;
const opaque = (v) => typeof v === "string" && ID.test(v);
const invalid = (
  message = "Use the documented bounded task recurrence fields.",
) => fail(422, "task_recurrence_fields", message);
const conflict = (message) => fail(409, "task_recurrence", message);
const freeze = (value) => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

// Refuse accessors, exotic prototypes, holes, cycles and non-JSON values before retention.
// These are data validators; the database boundary, not a caller-supplied array, grants authority.
function owned(value, { bytes = 32 * 1024 * 1024, nodes = 500000 } = {}) {
  const ancestors = new Set();
  let count = 0;
  const visit = (v, depth) => {
    if (++count > nodes || depth > 24) invalid();
    if (v === null || typeof v === "boolean" || typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (!v || typeof v !== "object" || ancestors.has(v)) invalid();
    const array = Array.isArray(v),
      proto = Object.getPrototypeOf(v);
    if (
      (array && proto !== Array.prototype) ||
      (!array && proto !== Object.prototype && proto !== null)
    )
      invalid();
    const descriptors = Object.getOwnPropertyDescriptors(v),
      keys = Reflect.ownKeys(descriptors);
    if (
      keys.some(
        (k) => typeof k !== "string" || !Object.hasOwn(descriptors[k], "value"),
      )
    )
      invalid();
    if (
      array &&
      (keys.length !== v.length + 1 ||
        keys.some((k) => k !== "length" && !/^(0|[1-9]\d*)$/.test(k)))
    )
      invalid();
    ancestors.add(v);
    const result = array ? [] : {};
    for (const key of keys) {
      if (array && key === "length") continue;
      if (!descriptors[key].enumerable) invalid();
      Object.defineProperty(result, key, {
        value: visit(descriptors[key].value, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    ancestors.delete(v);
    return result;
  };
  const result = visit(value, 0);
  if (Buffer.byteLength(stable(result)) > bytes)
    invalid("This task recurrence data exceeds its whole-byte limit.");
  return result;
}
function exact(v, keys) {
  if (
    !v ||
    Array.isArray(v) ||
    typeof v !== "object" ||
    Object.keys(v).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(v, k))
  )
    invalid();
}
function zone(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 100 ||
    /^[+-]/.test(value) ||
    value.trim() !== value
  )
    invalid("Supply an explicit recognized named time zone.");
  try {
    const formatter = new Intl.DateTimeFormat("en-CA-u-ca-gregory-nu-latn", {
      timeZone: value,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    return { formatter, canonical: formatter.resolvedOptions().timeZone };
  } catch {
    invalid("Supply an explicit recognized named time zone.");
  }
}
function civilParts(value) {
  const match =
    typeof value === "string" &&
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(value);
  if (
    !match ||
    !validDate(match[1]) ||
    +match[2] > 23 ||
    +match[3] > 59 ||
    +match[4] > 59
  )
    invalid(
      "Use a real civil date and clock from 1900 to 2200 with three millisecond digits.",
    );
  return [
    +match[1].slice(0, 4),
    +match[1].slice(5, 7),
    +match[1].slice(8, 10),
    +match[2],
    +match[3],
    +match[4],
    +match[5],
  ];
}
const utcMillis = (p) => Date.UTC(p[0], p[1] - 1, p[2], p[3], p[4], p[5], p[6]);
const renderCivil = (p) =>
  `${String(p[0]).padStart(4, "0")}-${String(p[1]).padStart(2, "0")}-${String(p[2]).padStart(2, "0")}T${String(p[3]).padStart(2, "0")}:${String(p[4]).padStart(2, "0")}:${String(p[5]).padStart(2, "0")}.${String(p[6]).padStart(3, "0")}`;
function instantParts(value) {
  const m =
    typeof value === "string" &&
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (
    !m ||
    (m[3] !== "Z" &&
      (+m[5] > 14 || +m[6] > 59 || (+m[5] === 14 && +m[6] !== 0)))
  )
    invalid("Supply a real due instant with a representable explicit offset.");
  const civil = `${m[1]}.${(m[2] || "").padEnd(3, "0")}`,
    parts = civilParts(civil);
  const offsetSeconds =
    m[3] === "Z" ? 0 : (m[4] === "-" ? -1 : 1) * (+m[5] * 3600 + +m[6] * 60);
  const millis = utcMillis(parts) - offsetSeconds * 1000,
    instant = new Date(millis).toISOString();
  if (!validDate(instant.slice(0, 10)))
    invalid("The UTC instant is outside the supported 1900–2200 range.");
  return { civil, parts, offsetSeconds, millis, instant };
}
function matches(formatter, millis, p) {
  const values = formatter.formatToParts(new Date(millis));
  let matched = 0;
  for (const x of values) {
    const i =
      x.type === "year"
        ? 0
        : x.type === "month"
          ? 1
          : x.type === "day"
            ? 2
            : x.type === "hour"
              ? 3
              : x.type === "minute"
                ? 4
                : x.type === "second"
                  ? 5
                  : -1;
    if (i >= 0) {
      if (+x.value !== p[i]) return false;
      matched++;
    }
  }
  return matched === 6;
}
function dueText(civil, offset) {
  if (offset === 0) return `${civil}Z`;
  const magnitude = Math.abs(offset);
  return `${civil}${offset < 0 ? "-" : "+"}${String(Math.floor(magnitude / 3600)).padStart(2, "0")}:${String((magnitude % 3600) / 60).padStart(2, "0")}`;
}

/** Historical admission proves the frozen arithmetic; it never changes an old instant to today's zone rules. */
export function validateTaskAnchor(input, options = {}) {
  const opts = owned(options, { bytes: 128 });
  if (
    Object.keys(opts).some((k) => k !== "historical") ||
    (Object.hasOwn(opts, "historical") && typeof opts.historical !== "boolean")
  )
    invalid();
  const historical = opts.historical === true;
  const a = owned(input, { bytes: 4096 });
  exact(a, ANCHOR_KEYS);
  if (
    a.method !== TASK_RECURRENCE_METHOD ||
    !opaque(a.rootRecordId) ||
    !FREQUENCIES.includes(a.frequency) ||
    (a.programId !== null && !opaque(a.programId)) ||
    a.monthPolicy !== "original-day-clamp" ||
    a.weekPolicy !== "local-calendar-days" ||
    a.gapPolicy !== "refuse" ||
    a.foldPolicy !== "explicit-each-occurrence"
  )
    invalid();
  for (const key of ["originalTimeZone", "canonicalTimeZone"])
    if (
      typeof a[key] !== "string" ||
      !a[key] ||
      a[key].length > 100 ||
      a[key].trim() !== a[key]
    )
      invalid();
  const original = instantParts(a.originalDueAt);
  if (a.anchorCivil !== original.civil || a.anchorInstant !== original.instant)
    invalid(
      "The anchor must retain the exact written civil time, offset and UTC instant.",
    );
  if (!historical) {
    const current = zone(a.originalTimeZone);
    if (
      current.canonical !== a.canonicalTimeZone ||
      !matches(current.formatter, original.millis, original.parts)
    )
      invalid("The anchor offset does not match its named time zone.");
  }
  return freeze(a);
}
export function taskAnchor(input) {
  const source = owned(input, { bytes: 1024 * 1024 });
  if (
    !opaque(source.id) ||
    source.moduleId !== "projects" ||
    !source.data ||
    source.data.kind !== "task" ||
    !FREQUENCIES.includes(source.data.recurrence)
  )
    invalid("Choose a saved weekly, monthly or quarterly task.");
  const original = instantParts(source.data.dueAt),
    current = zone(source.data.timeZone);
  return validateTaskAnchor({
    method: TASK_RECURRENCE_METHOD,
    rootRecordId: source.id,
    frequency: source.data.recurrence,
    originalDueAt: source.data.dueAt,
    anchorCivil: original.civil,
    anchorInstant: original.instant,
    originalTimeZone: source.data.timeZone,
    canonicalTimeZone: current.canonical,
    programId: source.data.programId,
    monthPolicy: "original-day-clamp",
    weekPolicy: "local-calendar-days",
    gapPolicy: "refuse",
    foldPolicy: "explicit-each-occurrence",
  });
}
export function taskCivilAt(input, sequence) {
  const anchor = validateTaskAnchor(input, { historical: true });
  if (!integer(sequence, 1, TASK_RECURRENCE_LIMITS.sequence))
    invalid("Use an occurrence sequence from 1 to 2,000.");
  const p = civilParts(anchor.anchorCivil);
  if (anchor.frequency === "weekly") {
    const next = new Date(utcMillis(p) + sequence * 7 * 86400000);
    p.splice(
      0,
      3,
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
    );
  } else {
    const months =
      p[0] * 12 +
      p[1] -
      1 +
      sequence * (anchor.frequency === "monthly" ? 1 : 3);
    const year = Math.floor(months / 12),
      month = (months % 12) + 1;
    p.splice(
      0,
      3,
      year,
      month,
      Math.min(p[2], new Date(Date.UTC(year, month, 0)).getUTCDate()),
    );
  }
  const result = renderCivil(p);
  civilParts(result);
  return result;
}
export function resolveTaskCivil(civil, timeZone) {
  let p, current;
  try {
    p = civilParts(civil);
  } catch {
    return freeze({
      kind: "unsupported",
      civil: null,
      reason: "date-range",
      candidates: [],
    });
  }
  try {
    current = zone(timeZone);
  } catch {
    return freeze({
      kind: "unsupported",
      civil,
      reason: "zone",
      candidates: [],
    });
  }
  const nominal = utcMillis(p),
    found = [];
  // Exhaust the complete supported integer-second offset interval; do not assume hour-sized transitions.
  for (let offset = -50400; offset <= 50400; offset++) {
    const millis = nominal - offset * 1000;
    if (matches(current.formatter, millis, p)) found.push({ millis, offset });
  }
  if (found.some((x) => x.offset % 60 !== 0))
    return freeze({
      kind: "unsupported",
      civil,
      reason: "offset",
      candidates: [],
    });
  if (found.length > 2)
    return freeze({
      kind: "unsupported",
      civil,
      reason: "multiplicity",
      candidates: [],
    });
  if (!found.length) return freeze({ kind: "gap", civil, candidates: [] });
  found.sort((a, b) => a.millis - b.millis);
  const candidates = found.map((x, i) => ({
    choice: found.length === 1 ? "unique" : i === 0 ? "earlier" : "later",
    dueAt: dueText(civil, x.offset),
    instant: new Date(x.millis).toISOString(),
    offsetSeconds: x.offset,
  }));
  if (candidates.some((x) => !validDate(x.instant.slice(0, 10))))
    return freeze({
      kind: "unsupported",
      civil,
      reason: "date-range",
      candidates: [],
    });
  return freeze({
    kind: found.length === 1 ? "unique" : "fold",
    civil,
    candidates,
  });
}
export function validateTaskCandidate(input, options = {}) {
  const opts = owned(options, { bytes: 1024 });
  if (
    Object.keys(opts).some(
      (k) => !["civil", "historical", "timeZone"].includes(k),
    ) ||
    (Object.hasOwn(opts, "historical") && typeof opts.historical !== "boolean")
  )
    invalid();
  const { civil, timeZone } = opts,
    historical = opts.historical === true;
  const candidate = owned(input, { bytes: 1024 });
  exact(candidate, CANDIDATE_KEYS);
  civilParts(civil);
  if (
    !["unique", "earlier", "later"].includes(candidate.choice) ||
    !integer(candidate.offsetSeconds, -50400, 50400) ||
    candidate.offsetSeconds % 60 !== 0
  )
    invalid();
  const written = instantParts(candidate.dueAt);
  if (
    written.civil !== civil ||
    written.offsetSeconds !== candidate.offsetSeconds ||
    written.instant !== candidate.instant
  )
    invalid("The frozen civil, offset and UTC instant must agree exactly.");
  if (!historical) {
    const resolved = resolveTaskCivil(civil, timeZone);
    if (!resolved.candidates.some((x) => stable(x) === stable(candidate)))
      conflict("The time-zone resolution changed. Review a new preview.");
  }
  return freeze(candidate);
}
export function taskRecurrenceSeriesId(orgId, rootId) {
  if (!opaque(orgId) || !opaque(rootId)) invalid();
  return hash({
    namespace: "charitology:task-recurrence:series:v1",
    method: TASK_RECURRENCE_METHOD,
    orgId,
    rootRecordId: rootId,
  });
}
export function taskRecurrenceRecordId(seriesId, sequence) {
  if (
    !opaque(seriesId) ||
    !integer(sequence, 1, TASK_RECURRENCE_LIMITS.sequence)
  )
    invalid();
  return hash({
    namespace: "charitology:task-recurrence:record:v1",
    method: TASK_RECURRENCE_METHOD,
    seriesId,
    sequence,
  });
}
export function taskMembershipHash(input) {
  const member = owned(input, { bytes: 256 * 1024 });
  exact(member, ["userId", "role", "programIds", "revision", "createdAtExact"]);
  const time =
    typeof member.createdAtExact === "string" &&
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/.exec(
      member.createdAtExact,
    );
  if (
    !opaque(member.userId) ||
    !ROLES.includes(member.role) ||
    !integer(member.revision) ||
    !Array.isArray(member.programIds) ||
    member.programIds.length > 2000 ||
    member.programIds.some((v) => !opaque(v)) ||
    !time ||
    !validDate(time[1]) ||
    +time[2] > 23 ||
    +time[3] > 59 ||
    +time[4] > 59
  )
    invalid(
      "Use the exact persisted membership incarnation and current scopes.",
    );
  return hash({
    method: TASK_RECURRENCE_METHOD,
    ...member,
    programIds: [...member.programIds].sort(),
  });
}
function saved(input) {
  const allowed = [
    "id",
    "orgId",
    "moduleId",
    "data",
    "status",
    "ownerId",
    "lastEditedBy",
    "revision",
    "approval",
    "snapshot",
    "source",
    "createdAt",
    "updatedAt",
  ];
  if (
    !input ||
    Object.keys(input).some((k) => !allowed.includes(k)) ||
    allowed.slice(0, 11).some((k) => !Object.hasOwn(input, k)) ||
    !opaque(input.id) ||
    !opaque(input.orgId) ||
    input.moduleId !== "projects" ||
    !opaque(input.ownerId) ||
    !opaque(input.lastEditedBy) ||
    !integer(input.revision) ||
    !getModule("projects").workflow.states.some((x) => x.id === input.status)
  )
    invalid("Choose a complete saved Projects record.");
  exact(input.data, DATA_KEYS);
  return input;
}
const unavailable = (code, message, resolution) =>
  freeze({
    kind: "unavailable",
    code,
    message,
    ...(resolution ? { resolution } : {}),
  });
// Project the current inventory before detachment. Recurrence needs complete source data,
// reference identities/revisions/scope and the full Projects dependency graph, but no
// unrelated approved snapshots, private narratives, files or historic approvals.
function dataFields(value, array = false) {
  if (!value || typeof value !== "object" || Array.isArray(value) !== array)
    invalid();
  const prototype = Object.getPrototypeOf(value);
  if (
    array
      ? prototype !== Array.prototype
      : prototype !== Object.prototype && prototype !== null
  )
    invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value),
    keys = Reflect.ownKeys(descriptors);
  if (
    keys.some(
      (k) =>
        typeof k !== "string" ||
        !Object.hasOwn(descriptors[k], "value") ||
        ((!array || k !== "length") && !descriptors[k].enumerable),
    )
  )
    invalid();
  if (
    array &&
    (keys.length !== value.length + 1 ||
      keys.some((k) => k !== "length" && !/^(0|[1-9]\d*)$/.test(k)))
  )
    invalid();
  return Object.fromEntries(
    keys
      .filter((k) => k !== "length" || !array)
      .map((k) => [k, descriptors[k].value]),
  );
}
function preparationRequest(input) {
  const fields = dataFields(input);
  exact(fields, ["source", "series", "member", "records", "resolution"]);
  const source = owned(fields.source),
    inventory = dataFields(fields.records, true);
  if (fields.records.length > TASK_RECURRENCE_LIMITS.records)
    invalid("Supply the complete bounded current organization records.");
  const records = Array.from({ length: fields.records.length }, (_, index) => {
    const r = dataFields(inventory[index]),
      data = dataFields(r.data);
    return {
      id: r.id,
      orgId: r.orgId,
      moduleId: r.moduleId,
      revision: r.revision,
      status: r.status,
      deletedAt: r.deletedAt ?? null,
      deleted_at: r.deleted_at ?? null,
      data:
        r.id === source.id
          ? data
          : {
              kind: data.kind ?? null,
              programId: data.programId ?? null,
              ...(r.moduleId === "projects"
                ? { dependencyIds: data.dependencyIds ?? null }
                : {}),
            },
    };
  });
  // A valid workspace already has <=60 MiB logical use and <=16 MiB structured
  // record data. This declared context bound includes only its smaller projection;
  // it does not clone every approved snapshot a second time.
  return owned({ ...fields, source, records }, { bytes: 64 * 1024 * 1024 });
}
export function taskRecurrenceSourceApproval(input) {
  const source = owned(input),
    approval = source.approval;
  let validTime = false;
  try {
    instantParts(approval?.at);
    validTime = true;
  } catch {
    /* Missing metadata confers no approval. */
  }
  return approval?.status === "approved" &&
    approval.revision === source.revision &&
    opaque(approval.actorId) &&
    approval.actorId !== source.lastEditedBy &&
    validTime
    ? "current"
    : "not-current";
}
/** Requires the actual current live tenant records and membership from the service transaction. */
export function prepareTaskRecurrence(input) {
  const request = preparationRequest(input);
  exact(request, ["source", "series", "member", "records", "resolution"]);
  const { source: rawSource, series, member, records, resolution } = request,
    source = saved(rawSource);
  if (![null, "unique", "earlier", "later"].includes(resolution))
    invalid("Choose the exact displayed time resolution.");
  const membershipHash = taskMembershipHash(member);
  if (
    !modulePermissions("projects", member.role).write ||
    !modulePermissions("projects", member.role).read ||
    !inScope(source, member) ||
    !visibleRecord(source, member)
  )
    fail(
      403,
      "role",
      "Your current role and scope do not permit task generation.",
    );
  if (
    !Array.isArray(records) ||
    records.length > TASK_RECURRENCE_LIMITS.records
  )
    invalid("Supply the complete bounded current organization records.");
  const indexed = new Map();
  for (const record of records) {
    if (
      !opaque(record?.id) ||
      record.orgId !== source.orgId ||
      record.deletedAt ||
      record.deleted_at ||
      indexed.has(record.id)
    )
      invalid("Use distinct current records from the same organization.");
    indexed.set(record.id, record);
  }
  const currentSource = indexed.get(source.id);
  if (
    !currentSource ||
    currentSource.moduleId !== "projects" ||
    currentSource.revision !== source.revision ||
    stable(currentSource.data) !== stable(source.data) ||
    currentSource.status !== source.status
  )
    conflict("The source changed. Reload the saved task before previewing.");
  if (source.status === "cancelled")
    return unavailable(
      "cancelled",
      "A cancelled task cannot generate another draft.",
    );
  if (
    source.data.kind !== "task" ||
    !FREQUENCIES.includes(source.data.recurrence) ||
    !source.data.dueAt ||
    !source.data.timeZone
  )
    return unavailable(
      "schedule",
      "Choose a saved weekly, monthly or quarterly task with a due instant and named time zone.",
    );
  const normalized = validateRecord("projects", source.data, {
    records,
    orgId: source.orgId,
    recordId: source.id,
    status: source.status,
  });
  if (stable(normalized) !== stable(source.data))
    invalid("The saved source must use the current normalized module shape.");
  let anchor, sequence, seriesId, seriesRevision;
  if (series === null) {
    anchor = taskAnchor(source);
    sequence = 1;
    seriesId = taskRecurrenceSeriesId(source.orgId, source.id);
    seriesRevision = null;
  } else {
    exact(series, [
      "id",
      "orgId",
      "rootRecordId",
      "method",
      "anchor",
      "state",
      "revision",
      "tipRecordId",
      "tipSequence",
      "createdBy",
      "createdAt",
      "endedAt",
      "endCode",
      "recoveredState",
      "budgetBytes",
      "lastEndCommand",
    ]);
    anchor = validateTaskAnchor(series.anchor, { historical: true });
    if (
      !opaque(series.id) ||
      series.orgId !== source.orgId ||
      series.method !== TASK_RECURRENCE_METHOD ||
      series.rootRecordId !== anchor.rootRecordId ||
      !integer(series.revision) ||
      !integer(series.tipSequence, 1, TASK_RECURRENCE_LIMITS.sequence)
    )
      invalid();
    if (series.state === "ended" || series.state === "recovered")
      return unavailable(
        series.state,
        series.state === "ended"
          ? "This recurrence ended permanently."
          : "Recovered recurrence is inactive historical provenance.",
      );
    if (series.state !== "active") invalid();
    if (series.id !== taskRecurrenceSeriesId(source.orgId, anchor.rootRecordId))
      invalid();
    if (
      series.tipRecordId !== source.id ||
      source.id !== taskRecurrenceRecordId(series.id, series.tipSequence)
    )
      conflict("Only the current recurrence tip can prepare a new draft.");
    if (
      source.data.programId !== anchor.programId ||
      source.data.timeZone !== anchor.originalTimeZone ||
      source.data.recurrence !== anchor.frequency ||
      instantParts(source.data.dueAt).civil !==
        taskCivilAt(anchor, series.tipSequence)
    )
      conflict(
        "The saved task no longer matches its frozen recurrence schedule.",
      );
    sequence = series.tipSequence + 1;
    seriesId = series.id;
    seriesRevision = series.revision;
    if (sequence > TASK_RECURRENCE_LIMITS.sequence)
      return unavailable(
        "sequence",
        "This series reached its retained occurrence limit.",
      );
  }
  let civil;
  try {
    civil = taskCivilAt(anchor, sequence);
  } catch {
    return unavailable(
      "date-range",
      "The next occurrence is outside the supported date range.",
    );
  }
  const resolved = resolveTaskCivil(civil, anchor.originalTimeZone);
  if (resolved.kind === "gap")
    return unavailable(
      "gap",
      "This local time does not exist. End this recurrence and deliberately create a new task to choose a different schedule.",
      resolved,
    );
  if (resolved.kind === "unsupported")
    return unavailable(
      resolved.reason,
      "This occurrence cannot be represented by the current task calendar method.",
      resolved,
    );
  if (resolved.kind === "fold" && resolution === null)
    return freeze({ kind: "needs-resolution", resolution: resolved });
  const chosen = resolved.candidates.find(
    (c) => c.choice === (resolution === null ? "unique" : resolution),
  );
  if (!chosen)
    conflict(
      "Choose one of this occurrence’s exact displayed time resolutions.",
    );
  const refs = [
    ...new Set(
      [
        source.data.programId,
        source.data.projectId,
        ...(source.data.dependencyIds || []),
      ].filter((v) => v !== null),
    ),
  ].sort();
  if (refs.length > TASK_RECURRENCE_LIMITS.references) invalid();
  const referenceRevisions = refs.map((id) => {
    const record = indexed.get(id);
    if (
      !record ||
      !integer(record.revision) ||
      !visibleRecord(record, member) ||
      !inScope(record, member)
    )
      fail(
        403,
        "task_recurrence_reference",
        "A current linked record is unavailable within your read scope.",
      );
    return { id, revision: record.revision };
  });
  const generatedRecordId = taskRecurrenceRecordId(seriesId, sequence);
  if (indexed.has(generatedRecordId))
    conflict(
      "The proposed generated identity already exists. Reload the current recurrence result.",
    );
  const candidateData = validateRecord(
    "projects",
    {
      ...normalized,
      dueAt: chosen.dueAt,
      timeZone: anchor.originalTimeZone,
      recurrence: anchor.frequency,
    },
    {
      records,
      orgId: source.orgId,
      recordId: generatedRecordId,
      status: "planned",
    },
  );
  const candidate = {
    moduleId: "projects",
    data: candidateData,
    status: "planned",
    ownerId: member.userId,
    lastEditedBy: member.userId,
    revision: 1,
    approval: null,
    snapshot: null,
    source: null,
  };
  if (Buffer.byteLength(stable(candidateData)) > 64000)
    invalid("The generated task exceeds the normalized record byte limit.");
  const sourceApproval = taskRecurrenceSourceApproval(source);
  const plan = {
    method: TASK_RECURRENCE_METHOD,
    orgId: source.orgId,
    seriesId,
    seriesRevision,
    sequence,
    sourceId: source.id,
    sourceRevision: source.revision,
    sourceDataHash: hash(normalized),
    sourceApproval,
    anchor,
    chosen,
    generatedRecordId,
    referenceRevisions,
    referenceHash: hash(referenceRevisions),
    membershipHash,
    candidate,
    candidateDataHash: hash(candidateData),
  };
  return freeze({ kind: "ready", plan: { ...plan, planHash: hash(plan) } });
}
