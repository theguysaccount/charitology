import { fail, hash } from "./security.mjs";
import {
  taskSeriesRow,
  reserveSeriesEnd,
  checkRecurrenceCapacity,
} from "./task-recurrence.mjs";
import {
  TASK_RECURRENCE_METHOD,
  taskCivilAt,
  validateTaskAnchor,
  validateTaskCandidate,
  taskRecurrenceRecordId,
  taskRecurrenceSeriesId,
} from "./task-recurrence-model.mjs";
const ID = /^[A-Za-z0-9_-]{1,100}$/,
  HASH = /^[a-f0-9]{64}$/;
const opaque = (v) => typeof v === "string" && ID.test(v);
const digest = (v) => typeof v === "string" && HASH.test(v);
const plain = (v) =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
const invalid = () =>
  fail(
    422,
    "task_recurrence_backup",
    "The recurring-task history is invalid or exceeds its limits.",
  );
const closed = (v, keys) => {
  if (
    !plain(v) ||
    Object.keys(v).some((k) => !keys.includes(k)) ||
    keys.some((k) => !Object.hasOwn(v, k))
  )
    invalid();
};
const integer = (v, min = 1, max = 2147483647) =>
  Number.isInteger(v) && v >= min && v <= max;
const instant = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v &&
  v >= "1900" &&
  v < "2201";
const seriesKeys = [
  "id",
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
];
const occurrenceKeys = [
  "seriesId",
  "sequence",
  "sourceRecordId",
  "sourceRevision",
  "sourceDataHash",
  "capturedSource",
  "generatedRecordId",
  "initialGeneratedDataHash",
  "generatedModuleId",
  "generatedKindAtCreation",
  "method",
  "anchorHash",
  "selectedCivil",
  "chosen",
  "planHash",
  "originalActorId",
  "acceptedCommandHash",
  "acceptedRequestHash",
  "createdAt",
];
const detached = (v) => JSON.parse(JSON.stringify(v));

export async function exportTaskRecurrence(c, org) {
  const series = (
    await c.query(
      "SELECT * FROM os_task_recurrence_series WHERE org_id=$1 ORDER BY id",
      [org],
    )
  ).rows.map((row) => {
    const s = taskSeriesRow(row);
    return Object.fromEntries(seriesKeys.map((k) => [k, s[k]]));
  });
  const occurrences = (
    await c.query(
      "SELECT packet FROM os_task_recurrence_occurrences WHERE org_id=$1 ORDER BY series_id,sequence",
      [org],
    )
  ).rows.map((r) => r.packet);
  return {
    format: "charitology-os-task-recurrence",
    version: 1,
    series,
    occurrences,
  };
}
/** Historical assertions come from immutable packets, not later mutable ordinary records. */
export function restoredTaskRecurrence(
  value,
  { records = [], trash = [] } = {},
) {
  if (value === undefined)
    return Object.freeze({
      format: "charitology-os-task-recurrence",
      version: 1,
      series: Object.freeze([]),
      occurrences: Object.freeze([]),
    });
  closed(value, ["format", "version", "series", "occurrences"]);
  if (
    value.format !== "charitology-os-task-recurrence" ||
    value.version !== 1 ||
    !Array.isArray(value.series) ||
    !Array.isArray(value.occurrences) ||
    value.series.length > 250 ||
    value.occurrences.length > 2000 ||
    Buffer.byteLength(JSON.stringify(value)) > 4 * 1024 * 1024 ||
    !Array.isArray(records) ||
    !Array.isArray(trash)
  )
    invalid();
  const result = detached(value),
    ids = new Map(),
    allRows = new Map(),
    usedMember = new Map(),
    usedCommand = new Set();
  for (const r of [...records, ...trash]) {
    if (!r || !opaque(r.id) || allRows.has(r.id)) invalid();
    allRows.set(r.id, r);
  }
  for (const s of result.series) {
    closed(s, seriesKeys);
    if (
      !opaque(s.id) ||
      !opaque(s.rootRecordId) ||
      !opaque(s.tipRecordId) ||
      !opaque(s.createdBy) ||
      ids.has(s.id) ||
      s.method !== TASK_RECURRENCE_METHOD ||
      !["active", "ended", "recovered"].includes(s.state) ||
      !integer(s.revision) ||
      !integer(s.tipSequence, 1, 2000) ||
      !integer(s.budgetBytes, 1, 4 * 1024 * 1024) ||
      !instant(s.createdAt) ||
      !(s.endedAt === null || instant(s.endedAt)) ||
      ![
        null,
        "explicit",
        "record-cancelled",
        "record-deleted",
        "backup-recovery",
      ].includes(s.endCode) ||
      ![null, "active", "ended", "recovered"].includes(s.recoveredState)
    )
      invalid();
    try {
      validateTaskAnchor(s.anchor, { historical: true });
    } catch {
      invalid();
    }
    if (
      s.anchor.rootRecordId !== s.rootRecordId ||
      s.anchor.method !== s.method ||
      (s.state === "active" &&
        (s.endCode !== null ||
          s.endedAt !== null ||
          s.recoveredState !== null)) ||
      (s.state === "ended" &&
        (!s.endedAt || !s.endCode || s.recoveredState !== null)) ||
      (s.state === "recovered" &&
        (!s.recoveredState || s.endCode !== "backup-recovery"))
    )
      invalid();
    ids.set(s.id, s);
  }
  const bySeries = new Map();
  for (const o of result.occurrences) {
    closed(o, occurrenceKeys);
    closed(o.capturedSource, [
      "moduleId",
      "kind",
      "programId",
      "dueAt",
      "timeZone",
      "recurrence",
    ]);
    const s = ids.get(o.seriesId);
    if (
      !s ||
      !integer(o.sequence, 1, 2000) ||
      !integer(o.sourceRevision) ||
      ![
        "seriesId",
        "sourceRecordId",
        "generatedRecordId",
        "originalActorId",
      ].every((k) => opaque(o[k])) ||
      ![
        "sourceDataHash",
        "initialGeneratedDataHash",
        "anchorHash",
        "planHash",
        "acceptedCommandHash",
        "acceptedRequestHash",
      ].every((k) => digest(o[k])) ||
      o.method !== TASK_RECURRENCE_METHOD ||
      o.generatedModuleId !== "projects" ||
      o.generatedKindAtCreation !== "task" ||
      o.capturedSource.moduleId !== "projects" ||
      o.capturedSource.kind !== "task" ||
      o.sourceRecordId === o.generatedRecordId ||
      !instant(o.createdAt) ||
      Buffer.byteLength(JSON.stringify(o)) > 8192 ||
      usedCommand.has(o.acceptedCommandHash)
    )
      invalid();
    usedCommand.add(o.acceptedCommandHash);
    if (
      o.anchorHash !== hash(s.anchor) ||
      o.capturedSource.programId !== s.anchor.programId ||
      o.capturedSource.timeZone !== s.anchor.originalTimeZone ||
      o.capturedSource.recurrence !== s.anchor.frequency ||
      taskRecurrenceRecordId(s.id, o.sequence) !== o.generatedRecordId
    )
      invalid();
    let civil;
    try {
      civil = taskCivilAt(s.anchor, o.sequence);
      validateTaskCandidate(o.chosen, {
        civil,
        historical: true,
        timeZone: s.anchor.originalTimeZone,
      });
    } catch {
      invalid();
    }
    if (o.selectedCivil !== civil) invalid();
    // The source's original occurrence is frozen here even after ordinary post-End edits.
    let previousCivil;
    try {
      previousCivil =
        o.sequence === 1
          ? s.anchor.anchorCivil
          : taskCivilAt(s.anchor, o.sequence - 1);
      validateTaskCandidate(
        {
          choice: "unique",
          dueAt: o.capturedSource.dueAt,
          instant: new Date(o.capturedSource.dueAt).toISOString(),
          offsetSeconds: offset(o.capturedSource.dueAt),
        },
        {
          civil: previousCivil,
          historical: true,
          timeZone: s.anchor.originalTimeZone,
        },
      );
    } catch {
      invalid();
    }
    const list = bySeries.get(s.id) || [];
    list.push(o);
    bySeries.set(s.id, list);
  }
  for (const s of result.series) {
    const list = (bySeries.get(s.id) || []).sort(
      (a, b) => a.sequence - b.sequence,
    );
    if (list.length !== s.tipSequence) invalid();
    let predecessor = s.rootRecordId;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (
        o.capturedSource.dueAt !==
        (i === 0 ? s.anchor.originalDueAt : list[i - 1].chosen.dueAt)
      )
        invalid();
      if (o.sequence !== i + 1 || o.sourceRecordId !== predecessor) invalid();
      predecessor = o.generatedRecordId;
    }
    if (predecessor !== s.tipRecordId) invalid();
    const members = [s.rootRecordId, ...list.map((o) => o.generatedRecordId)];
    let sourceOrg = null;
    for (const id of members) {
      if (usedMember.has(id)) invalid();
      usedMember.set(id, s.id);
      const record = allRows.get(id);
      if (record && (record.moduleId !== "projects" || !opaque(record.orgId)))
        invalid();
      if (record) {
        if (sourceOrg !== null && sourceOrg !== record.orgId) invalid();
        sourceOrg = record.orgId;
      }

      if (s.state !== "recovered" && !record) invalid();
    }
    if (
      s.state !== "recovered" &&
      s.id !== taskRecurrenceSeriesId(sourceOrg, s.rootRecordId)
    )
      invalid();
    // Recovery deactivates every chain and never imports last-command replay authority.
    s.recoveredState = s.state === "recovered" ? s.recoveredState : s.state;
    s.state = "recovered";
    s.endCode = "backup-recovery";
  }
  return deepFreeze(result);
}
function offset(dueAt) {
  if (dueAt.endsWith("Z")) return 0;
  const m = /([+-])(\d\d):(\d\d)$/.exec(dueAt);
  if (!m) invalid();
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60);
}
function deepFreeze(v) {
  if (v && typeof v === "object") {
    for (const x of Object.values(v)) deepFreeze(x);
    Object.freeze(v);
  }
  return v;
}
export async function restoreTaskRecurrence(c, org, user, prepared) {
  if (
    (
      await c.query(
        "SELECT 1 FROM os_task_recurrence_series WHERE org_id=$1 LIMIT 1",
        [org],
      )
    ).rows.length
  )
    fail(
      409,
      "restore_conflict",
      "Restore requires an organization without recurrence history.",
    );
  if (!prepared.series.length && !prepared.occurrences.length) return;
  for (const s of prepared.series) {
    await c.query(
      `INSERT INTO os_task_recurrence_series(org_id,id,root_record_id,method,anchor,state,revision,tip_record_id,tip_sequence,created_by,created_at,ended_at,end_code,recovered_state,budget_bytes,last_end_command) VALUES($1,$2,$3,$4,$5,'recovered',$6,$7,$8,$9,$10,$11,'backup-recovery',$12,2147483647,NULL)`,
      [
        org,
        s.id,
        s.rootRecordId,
        s.method,
        JSON.stringify(s.anchor),
        s.revision,
        s.tipRecordId,
        s.tipSequence,
        s.createdBy,
        s.createdAt,
        s.endedAt,
        s.recoveredState,
      ],
    );
    await reserveSeriesEnd(c, org, s.id);
  }
  for (const o of prepared.occurrences)
    await c.query(
      "INSERT INTO os_task_recurrence_occurrences(org_id,series_id,sequence,source_record_id,generated_record_id,accepted_command_hash,packet) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        org,
        o.seriesId,
        o.sequence,
        o.sourceRecordId,
        o.generatedRecordId,
        o.acceptedCommandHash,
        JSON.stringify(o),
      ],
    );
  await checkRecurrenceCapacity(c, org);
}
