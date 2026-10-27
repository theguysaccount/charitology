import { createHmac } from "node:crypto";
import {
  allRecords,
  audit,
  logicalBackupBytes,
  rowRecord,
  saveRecord,
} from "./database.mjs";
import {
  administrators,
  inScope,
  requirePermission,
  visibleRecord,
} from "./access.mjs";
import { fail, hash, equal, json, stable } from "./security.mjs";
import {
  prepareTaskRecurrence,
  taskMembershipHash,
  TASK_RECURRENCE_METHOD,
  taskRecurrenceSourceApproval,
} from "./task-recurrence-model.mjs";

export const END_GROWTH_RESERVE_BYTES = 2048;
export const TASK_RECURRENCE_STORAGE_LIMITS = Object.freeze({
  series: 250,
  occurrences: 2000,
  bytes: 4 * 1024 * 1024,
  packet: 8192,
  body: 8192,
  token: 4096,
  payload: 2048,
  ttl: 600000,
});
const ID = /^[A-Za-z0-9_-]{1,100}$/,
  HASH = /^[a-f0-9]{64}$/;
const plain = (v) =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
const okay = (v) => json({ ok: true, ...v });
const unavailable = () =>
  fail(404, "task_recurrence", "This task or its recurrence is unavailable.");
const exact = (v, keys) => {
  if (
    !plain(v) ||
    Object.keys(v).some((k) => !keys.includes(k)) ||
    keys.some((k) => !Object.hasOwn(v, k))
  )
    fail(
      422,
      "task_recurrence_fields",
      "Use the documented recurrence fields.",
    );
};
const positive = (v) => Number.isInteger(v) && v > 0 && v <= 2147483647;
const clone = (v) => JSON.parse(JSON.stringify(v));

/** Reject duplicate decoded names and depth before ordinary JSON.parse loses evidence. */
export function parseTaskRecurrenceJson(text, limit = 8192) {
  if (typeof text !== "string" || Buffer.byteLength(text) > limit)
    fail(413, "size", "This recurrence request is too large.");
  if (text.charCodeAt(0) === 0xfeff)
    fail(
      422,
      "task_recurrence_json",
      "Supply strict UTF-8 JSON without a byte-order mark.",
    );
  let i = 0;
  const bad = () =>
    fail(
      422,
      "task_recurrence_json",
      "Supply strict JSON without duplicate fields.",
    );
  const space = () => {
    while (/[\x20\t\r\n]/.test(text[i] || "!")) i++;
  };
  const string = () => {
    let start = i++;
    while (i < text.length) {
      const c = text[i++];
      if (c === '"') {
        try {
          return JSON.parse(text.slice(start, i));
        } catch {
          bad();
        }
      }
      if (c === "\\") {
        if (text[i] === "u") {
          i++;
          if (!/^[a-fA-F0-9]{4}$/.test(text.slice(i, i + 4))) bad();
          i += 4;
        } else {
          if (!/["\\/bfnrt]/.test(text[i] || "!")) bad();
          i++;
        }
      } else if (c.charCodeAt(0) < 32) bad();
    }
    bad();
  };
  const value = (depth) => {
    if (depth > 8) bad();
    space();
    const ch = text[i];
    if (ch === '"') {
      string();
      return;
    }
    if (ch === "{") {
      i++;
      space();
      const seen = new Set();
      if (text[i] === "}") {
        i++;
        return;
      }
      while (true) {
        space();
        if (text[i] !== '"') bad();
        const key = string();
        if (seen.has(key)) bad();
        seen.add(key);
        space();
        if (text[i++] !== ":") bad();
        value(depth + 1);
        space();
        if (text[i] === "}") {
          i++;
          return;
        }
        if (text[i++] !== ",") bad();
      }
    } else if (ch === "[") {
      i++;
      space();
      if (text[i] === "]") {
        i++;
        return;
      }
      while (true) {
        value(depth + 1);
        space();
        if (text[i] === "]") {
          i++;
          return;
        }
        if (text[i++] !== ",") bad();
      }
    } else {
      const found =
        /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
          text.slice(i),
        );
      if (!found) bad();
      i += found[0].length;
    }
  };
  value(1);
  space();
  if (i !== text.length) bad();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    bad();
  }
  if (!plain(parsed)) bad();
  return parsed;
}
export async function readTaskRecurrenceBody(request) {
  if (Number(request.headers.get("content-length") || 0) > 8192)
    fail(413, "size", "This recurrence request is too large.");
  const chunks = [];
  let bytes = 0;
  const reader = request.body?.getReader();
  try {
    if (reader)
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 8192) {
          await reader.cancel();
          fail(413, "size", "This recurrence request is too large.");
        }
        chunks.push(value);
      }
  } finally {
    reader?.releaseLock();
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      Buffer.concat(chunks),
    );
  } catch {
    fail(422, "task_recurrence_json", "Supply valid UTF-8 JSON.");
  }
  return parseTaskRecurrenceJson(text || "{}");
}
export async function recurrenceMembership(c, org, user) {
  const row = (
    await c.query(
      `SELECT user_id,role,program_ids,revision,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS incarnation FROM os_members WHERE org_id=$1 AND user_id=$2`,
      [org, user],
    )
  ).rows[0];
  if (!row)
    fail(
      403,
      "membership",
      "This organization is unavailable or your access has ended.",
    );
  return {
    userId: row.user_id,
    role: row.role,
    programIds: row.program_ids,
    revision: row.revision,
    createdAtExact: row.incarnation,
  };
}
export function taskSeriesRow(r) {
  return {
    id: r.id,
    orgId: r.org_id,
    rootRecordId: r.root_record_id,
    method: r.method,
    anchor: r.anchor,
    state: r.state,
    revision: r.revision,
    tipRecordId: r.tip_record_id,
    tipSequence: r.tip_sequence,
    createdBy: r.created_by,
    createdAt: r.created_at.toISOString(),
    endedAt: r.ended_at?.toISOString() || null,
    endCode: r.end_code,
    recoveredState: r.recovered_state,
    budgetBytes: r.budget_bytes,
    lastEndCommand: r.last_end_command,
  };
}
async function findSeries(c, org, recordId) {
  return (
    await c.query(
      `SELECT s.* FROM os_task_recurrence_series s WHERE s.org_id=$1 AND (s.root_record_id=$2 OR EXISTS(SELECT 1 FROM os_task_recurrence_occurrences o WHERE o.org_id=s.org_id AND o.series_id=s.id AND (o.source_record_id=$2 OR o.generated_record_id=$2)))`,
      [org, recordId],
    )
  ).rows.map(taskSeriesRow);
}
const seriesView = (s) =>
  s
    ? Object.fromEntries(
        Object.entries(s).filter(
          ([k]) =>
            !["orgId", "createdBy", "lastEndCommand", "budgetBytes"].includes(
              k,
            ),
        ),
      )
    : null;
/** Full history never exposes a currently unreadable root, tip or old program. */
async function assertSeriesDisclosure(c, org, series, member) {
  const references = [
    { id: series.rootRecordId, moduleId: "projects" },
    { id: series.tipRecordId, moduleId: "projects" },
    ...(series.anchor.programId
      ? [{ id: series.anchor.programId, moduleId: "programs" }]
      : []),
  ];
  for (const reference of references) {
    const row = (
      await c.query("SELECT * FROM os_records WHERE org_id=$1 AND id=$2", [
        org,
        reference.id,
      ])
    ).rows[0];
    if (!row) {
      if (!administrators(member.role)) unavailable();
      continue;
    }
    const record = rowRecord(row);
    if (
      record.moduleId !== reference.moduleId ||
      !visibleRecord(record, member) ||
      !inScope(record, member)
    )
      unavailable();
  }
}
async function currentTask(c, org, id, member, { trash = false } = {}) {
  const row = (
    await c.query("SELECT * FROM os_records WHERE org_id=$1 AND id=$2", [
      org,
      id,
    ])
  ).rows[0];
  if (!row || row.module_id !== "projects" || (!trash && row.deleted_at))
    unavailable();
  const r = rowRecord(row);
  if (!visibleRecord(r, member) || !inScope(r, member)) unavailable();
  return { record: r, deleted: !!row.deleted_at };
}
async function successor(c, org, source) {
  return (
    (
      await c.query(
        "SELECT * FROM os_task_recurrence_occurrences WHERE org_id=$1 AND source_record_id=$2",
        [org, source],
      )
    ).rows[0] || null
  );
}
async function disposition(c, org, occ, series, member, replayed = true) {
  const row = (
    await c.query("SELECT * FROM os_records WHERE org_id=$1 AND id=$2", [
      org,
      occ.generated_record_id,
    ])
  ).rows[0];
  if (!row) {
    if (series.state === "recovered" && administrators(member.role))
      return {
        kind: "historical-only",
        seriesId: series.id,
        sequence: occ.sequence,
        replayed: false,
        recoveryAvailable: false,
      };
    unavailable();
  }
  const record = rowRecord(row);
  if (
    record.moduleId !== "projects" ||
    !visibleRecord(record, member) ||
    !inScope(record, member)
  )
    unavailable();
  return row.deleted_at
    ? {
        kind: "trashed-record",
        recordId: record.id,
        seriesId: series.id,
        sequence: occ.sequence,
        replayed: true,
        recoveryAvailable: true,
      }
    : {
        kind: "active-record",
        record,
        seriesId: series.id,
        sequence: occ.sequence,
        replayed,
      };
}
const actorHash = (m) =>
  hash({
    method: TASK_RECURRENCE_METHOD,
    userId: m.userId,
    createdAtExact: m.createdAtExact,
  });
const commandHash = (m, key) => hash({ actor: actorHash(m), key });
function keyInput(key) {
  if (typeof key !== "string" || !ID.test(key) || key.length < 16)
    fail(422, "idempotency", "Use a bounded command identity.");
  return key;
}
function sign(payload, secret) {
  const encoded = Buffer.from(stable(payload)).toString("base64url");
  if (Buffer.byteLength(Buffer.from(encoded, "base64url")) > 2048)
    fail(422, "preview", "This recurrence preview exceeds its token limit.");
  return (
    encoded +
    "." +
    createHmac("sha256", secret)
      .update("charitology:task-recurrence:v1:" + encoded)
      .digest("base64url")
  );
}
function readToken(token, secret) {
  if (
    typeof token !== "string" ||
    Buffer.byteLength(token) > 4096 ||
    !/^[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+$/.test(token)
  )
    fail(409, "preview", "Reload and review this recurrence preview.");
  const [raw, sig] = token.split("."),
    wanted = createHmac("sha256", secret)
      .update("charitology:task-recurrence:v1:" + raw)
      .digest("base64url");
  if (!equal(sig, wanted))
    fail(409, "preview", "Reload and review this recurrence preview.");
  const bytes = Buffer.from(raw, "base64url");
  if (bytes.length > 2048 || bytes.toString("base64url") !== raw)
    fail(409, "preview", "Reload and review this recurrence preview.");
  let p;
  try {
    p = parseTaskRecurrenceJson(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes),
      2048,
    );
  } catch {
    fail(409, "preview", "Reload and review this recurrence preview.");
  }
  exact(p, [
    "version",
    "method",
    "orgId",
    "sourceId",
    "sourceRevision",
    "seriesId",
    "seriesRevision",
    "sequence",
    "actorId",
    "actorHash",
    "sessionHash",
    "membershipHash",
    "sourceDataHash",
    "referenceHash",
    "planHash",
    "choice",
    "dueAt",
    "instant",
    "offsetSeconds",
    "civil",
    "issuedAt",
    "expiresAt",
  ]);
  if (
    p.version !== 1 ||
    p.method !== TASK_RECURRENCE_METHOD ||
    !["unique", "earlier", "later"].includes(p.choice) ||
    !positive(p.sourceRevision) ||
    !(p.seriesRevision === null || positive(p.seriesRevision)) ||
    !positive(p.sequence) ||
    p.sequence > 2000 ||
    !["orgId", "sourceId", "seriesId", "actorId"].every((k) => ID.test(p[k])) ||
    ![
      "actorHash",
      "sessionHash",
      "membershipHash",
      "sourceDataHash",
      "referenceHash",
      "planHash",
    ].every((k) => HASH.test(p[k])) ||
    !Number.isSafeInteger(p.issuedAt) ||
    !Number.isSafeInteger(p.expiresAt) ||
    p.expiresAt - p.issuedAt !== 600000
  )
    fail(409, "preview", "Reload and review this recurrence preview.");
  return p;
}
function tokenFor(plan, member, session, secret) {
  const now = Date.now();
  return {
    version: 1,
    method: TASK_RECURRENCE_METHOD,
    orgId: plan.orgId,
    sourceId: plan.sourceId,
    sourceRevision: plan.sourceRevision,
    seriesId: plan.seriesId,
    seriesRevision: plan.seriesRevision,
    sequence: plan.sequence,
    actorId: member.userId,
    actorHash: actorHash(member),
    sessionHash: hash(session.session.id),
    membershipHash: plan.membershipHash,
    sourceDataHash: plan.sourceDataHash,
    referenceHash: plan.referenceHash,
    planHash: plan.planHash,
    choice: plan.chosen.choice,
    dueAt: plan.chosen.dueAt,
    instant: plan.chosen.instant,
    offsetSeconds: plan.chosen.offsetSeconds,
    civil: plan.chosen.dueAt.slice(0, 23),
    issuedAt: now,
    expiresAt: now + 600000,
  };
}

export async function recurrenceTableUsage(c, org) {
  return (
    await c.query(
      `SELECT (SELECT count(*) FROM os_task_recurrence_series WHERE org_id=$1) AS series,(SELECT count(*) FROM os_task_recurrence_occurrences WHERE org_id=$1) AS occurrences,(SELECT COALESCE(sum(GREATEST(octet_length(to_jsonb(s)::text),budget_bytes)),0) FROM os_task_recurrence_series s WHERE org_id=$1)+(SELECT COALESCE(sum(octet_length(to_jsonb(o)::text)),0) FROM os_task_recurrence_occurrences o WHERE org_id=$1) AS bytes`,
      [org],
    )
  ).rows[0];
}
export async function checkRecurrenceCapacity(c, org) {
  const u = await recurrenceTableUsage(c, org);
  if (
    Number(u.series) > 250 ||
    Number(u.occurrences) > 2000 ||
    Number(u.bytes) > 4 * 1024 * 1024
  )
    fail(
      422,
      "quota",
      "This workspace reached its recurring-task history limit.",
    );
}
/** Every accepted row prepays its bounded permanent End transition. */
export async function reserveSeriesEnd(c, org, seriesId) {
  const measured = (
    await c.query(
      `SELECT octet_length((to_jsonb(s)||jsonb_build_object('budget_bytes',2147483647))::text) AS bytes FROM os_task_recurrence_series s WHERE org_id=$1 AND id=$2`,
      [org, seriesId],
    )
  ).rows[0];
  const budget = Number(measured.bytes) + END_GROWTH_RESERVE_BYTES;
  const max = (
    await c.query(
      `SELECT octet_length((to_jsonb(s)||jsonb_build_object(
    'budget_bytes',2147483647,'revision',2147483647,'state','ended',
    'end_code','record-cancelled','ended_at','2200-12-31T23:59:59.999999+00:00',
    'last_end_command',jsonb_build_object('maximum',repeat('x',497))))::text) AS bytes
    FROM os_task_recurrence_series s WHERE org_id=$1 AND id=$2`,
      [org, seriesId],
    )
  ).rows[0];
  if (Number(max.bytes) > budget)
    fail(
      422,
      "quota",
      "This recurrence cannot reserve its permanent End transition.",
    );
  await c.query(
    "UPDATE os_task_recurrence_series SET budget_bytes=$3 WHERE org_id=$1 AND id=$2",
    [org, seriesId, budget],
  );
  return budget;
}
export async function endTaskRecurrence(
  c,
  {
    org,
    user,
    member,
    series,
    expectedRevision,
    reason = "",
    key = null,
    endCode = "explicit",
  },
) {
  const intent = key ? commandHash(member, key) : null,
    request = hash({ expectedRevision, reason, endCode });
  if (series.state === "recovered")
    fail(409, "recovered", "Recovered recurrence history stays inactive.");
  if (series.state === "ended") {
    const old = series.lastEndCommand;
    if (
      key &&
      old?.actorHash === actorHash(member) &&
      old.intentHash === intent
    ) {
      if (old.requestHash !== request)
        fail(
          409,
          "idempotency",
          "This command identity was already used for a different request.",
        );
      return {
        series: seriesView(series),
        auditRecorded: old.auditRecorded,
        replayed: true,
      };
    }
    if (key) fail(409, "ended", "This recurrence has ended permanently.");
    return { series: seriesView(series), auditRecorded: false, replayed: true };
  }
  if (expectedRevision !== series.revision)
    fail(409, "revision", "This recurrence changed. Reload it before ending.");
  if (series.revision >= 2147483647)
    fail(409, "revision", "This recurrence revision limit was reached.");
  const auditRecorded = await audit(
    c,
    org,
    user,
    "task-recurrence.ended",
    null,
    { id: series.id, reason, endCode },
  );
  const packet = key
    ? {
        actorHash: actorHash(member),
        intentHash: intent,
        requestHash: request,
        resultRevision: series.revision + 1,
        auditRecorded,
      }
    : null;
  if (packet && Buffer.byteLength(JSON.stringify(packet)) > 512)
    fail(422, "end", "This End command exceeds its bounded packet.");
  await c.query(
    `UPDATE os_task_recurrence_series SET state='ended',revision=revision+1,ended_at=now(),end_code=$3,last_end_command=$4 WHERE org_id=$1 AND id=$2`,
    [org, series.id, endCode, packet ? JSON.stringify(packet) : null],
  );
  const row = (
    await c.query(
      "SELECT *,octet_length(to_jsonb(s)::text) AS measured FROM os_task_recurrence_series s WHERE org_id=$1 AND id=$2",
      [org, series.id],
    )
  ).rows[0];
  if (Number(row.measured) > row.budget_bytes)
    fail(422, "end", "This End transition exceeds its prepaid reservation.");
  return {
    series: seriesView(taskSeriesRow(row)),
    auditRecorded,
    replayed: false,
  };
}
/** Central ordinary save/import guard. Never trusts a supplied previous record. */
export async function guardTaskRecurrenceWrite(
  c,
  next,
  { operation = "save" } = {},
) {
  if (next.moduleId !== "projects") return;
  const rows = await findSeries(c, next.orgId, next.id);
  if (rows.length > 1)
    fail(
      409,
      "identity_conflict",
      "This task has conflicting recurrence history.",
    );
  const series = rows[0];
  if (!series) return;
  const previous = (
    await c.query("SELECT * FROM os_records WHERE org_id=$1 AND id=$2", [
      next.orgId,
      next.id,
    ])
  ).rows[0];
  if (!previous)
    fail(
      409,
      "recurrence_identity",
      "A retained recurrence identity cannot be recreated as a new task.",
    );
  if (series.state !== "active") return;
  if (
    ["kind", "programId", "dueAt", "timeZone", "recurrence"].some(
      (k) => stable(previous.data[k] ?? null) !== stable(next.data[k] ?? null),
    )
  )
    fail(
      409,
      "recurrence_fields",
      "End this recurrence before changing its kind, program or schedule.",
    );
  if (
    operation === "restore" ||
    operation === "delete" ||
    (previous.status !== "cancelled" && next.status === "cancelled")
  ) {
    const user = (
      await c.query("SELECT current_setting('app.user_id',true) AS user_id")
    ).rows[0].user_id;
    const member = await recurrenceMembership(c, next.orgId, user);
    await endTaskRecurrence(c, {
      org: next.orgId,
      user,
      member,
      series,
      expectedRevision: series.revision,
      endCode: operation === "delete" ? "record-deleted" : "record-cancelled",
    });
    return;
  }
}
export async function taskRecurrenceRoutes({
  c,
  org,
  user,
  session,
  tail,
  method,
  input,
  url,
  settings,
}) {
  if (!tail.startsWith("task-recurrence/")) return null;
  const query = new URLSearchParams(url.search);
  if (
    query.getAll("path").length === 1 &&
    query.get("path") === url.pathname.slice(5)
  )
    query.delete("path");
  if ([...query.keys()].length)
    fail(
      422,
      "task_recurrence_query",
      "Do not put recurrence data in query parameters.",
    );
  const member = await recurrenceMembership(c, org, user);
  requirePermission("projects", member, "read");
  requirePermission("projects", member, "write");
  const taskMatch =
      /^task-recurrence\/tasks\/([A-Za-z0-9_-]{1,100})(?:\/(preview|generate))?$/.exec(
        tail,
      ),
    endMatch = /^task-recurrence\/series\/([A-Za-z0-9_-]{1,100})\/end$/.exec(
      tail,
    );
  if (endMatch && method === "POST") {
    exact(input, ["seriesRevision", "idempotencyKey", "reason"]);
    if (
      !positive(input.seriesRevision) ||
      typeof input.reason !== "string" ||
      input.reason.length > 2000
    )
      fail(
        422,
        "end",
        "Supply the current revision and a reason of at most 2,000 characters.",
      );
    keyInput(input.idempotencyKey);
    const row = (
      await c.query(
        "SELECT * FROM os_task_recurrence_series WHERE org_id=$1 AND id=$2",
        [org, endMatch[1]],
      )
    ).rows[0];
    if (!row) unavailable();
    const series = taskSeriesRow(row);
    await currentTask(c, org, series.tipRecordId, member, { trash: true });
    await assertSeriesDisclosure(c, org, series, member);
    return okay({
      kind: "ended",
      ...(await endTaskRecurrence(c, {
        org,
        user,
        member,
        series,
        expectedRevision: input.seriesRevision,
        reason: input.reason,
        key: input.idempotencyKey,
      })),
    });
  }
  if (!taskMatch) unavailable();
  const [, sourceId, action] = taskMatch;
  const { record: source, deleted: sourceDeleted } = await currentTask(
    c,
    org,
    sourceId,
    member,
    {
      trash: action === "generate" || (!action && method === "GET"),
    },
  );
  const chains = await findSeries(c, org, sourceId);
  if (chains.length > 1)
    fail(
      409,
      "identity_conflict",
      "This task has conflicting recurrence history.",
    );
  const series = chains[0] || null;
  const existing = await successor(c, org, sourceId),
    sourceMeta = {
      id: source.id,
      revision: source.revision,
      approval: taskRecurrenceSourceApproval(source),
    };
  if (!action && method === "GET") {
    if (series) await assertSeriesDisclosure(c, org, series, member);
    const response = { source: sourceMeta, series: seriesView(series) };
    if (existing)
      return okay({
        kind: "series",
        ...response,
        existing: await disposition(c, org, existing, series, member),
      });
    if (series) return okay({ kind: "series", ...response });
    if (
      sourceDeleted ||
      source.data.kind !== "task" ||
      !["weekly", "monthly", "quarterly"].includes(source.data.recurrence) ||
      !source.data.dueAt ||
      !source.data.timeZone ||
      source.status === "cancelled"
    )
      return okay({
        kind: "unavailable",
        code: "schedule",
        message:
          "A saved task needs a due time, named zone and supported recurrence.",
        ...response,
      });
    return okay({ kind: "eligible", ...response });
  }
  if (action === "preview" && method === "POST") {
    exact(input, ["sourceRevision", "seriesRevision", "resolution"]);
    if (
      !positive(input.sourceRevision) ||
      !(input.seriesRevision === null || positive(input.seriesRevision)) ||
      ![null, "unique", "earlier", "later"].includes(input.resolution)
    )
      fail(
        422,
        "preview",
        "Supply the saved source revision and an explicit resolution choice.",
      );
    if (
      input.sourceRevision !== source.revision ||
      input.seriesRevision !== (series?.revision ?? null)
    )
      fail(409, "revision", "This task or recurrence changed. Reload it.");
    if (existing)
      return okay({
        kind: "existing",
        existing: await disposition(c, org, existing, series, member),
      });
    if (series) await assertSeriesDisclosure(c, org, series, member);
    if (series && series.state !== "active")
      return okay({
        kind: "unavailable",
        code: series.state,
        message:
          series.state === "recovered"
            ? "Recovered recurrence history stays inactive."
            : "This recurrence ended permanently.",
      });
    const prepared = prepareTaskRecurrence({
      source,
      series,
      member,
      records: await allRecords(c, org),
      resolution: input.resolution,
    });
    if (prepared.kind !== "ready") return okay(prepared);
    const token = tokenFor(prepared.plan, member, session, settings.secret);
    return okay({
      kind: "ready",
      preview: prepared.plan,
      previewToken: sign(token, settings.secret),
      expiresAt: new Date(token.expiresAt).toISOString(),
    });
  }
  if (action === "generate" && method === "POST") {
    exact(input, ["previewToken", "idempotencyKey"]);
    keyInput(input.idempotencyKey);
    const p = readToken(input.previewToken, settings.secret);
    if (
      p.orgId !== org ||
      p.sourceId !== sourceId ||
      p.actorId !== user ||
      p.actorHash !== actorHash(member) ||
      p.sessionHash !== hash(session.session.id)
    )
      fail(
        409,
        "preview",
        "This preview belongs to another session or membership. Reload it.",
      );
    const command = commandHash(member, input.idempotencyKey),
      requestHash = hash(input),
      accepted = (
        await c.query(
          "SELECT * FROM os_task_recurrence_occurrences WHERE org_id=$1 AND accepted_command_hash=$2",
          [org, command],
        )
      ).rows[0];
    if (accepted) {
      if (accepted.packet.acceptedRequestHash !== requestHash)
        fail(
          409,
          "idempotency",
          "This command identity was already used for a different request.",
        );
      if (series?.state === "recovered")
        fail(409, "recovered", "Recovered recurrence history stays inactive.");
      return okay({
        kind: "existing",
        existing: await disposition(c, org, accepted, series, member),
      });
    }
    if (existing) {
      if (series?.state === "recovered")
        fail(409, "recovered", "Recovered recurrence history stays inactive.");
      return okay({
        kind: "existing",
        existing: await disposition(c, org, existing, series, member),
      });
    }
    if (sourceDeleted) unavailable();
    if (
      p.expiresAt < Date.now() ||
      p.issuedAt > Date.now() + 5000 ||
      p.membershipHash !== taskMembershipHash(member) ||
      p.sourceRevision !== source.revision ||
      p.seriesRevision !== (series?.revision ?? null)
    )
      fail(
        409,
        "preview",
        "This preview changed or expired. Reload and review it.",
      );
    if (series) await assertSeriesDisclosure(c, org, series, member);
    const prepared = prepareTaskRecurrence({
      source,
      series,
      member,
      records: await allRecords(c, org),
      resolution: p.choice,
    });
    if (
      prepared.kind !== "ready" ||
      prepared.plan.planHash !== p.planHash ||
      prepared.plan.referenceHash !== p.referenceHash ||
      prepared.plan.sourceDataHash !== p.sourceDataHash ||
      prepared.plan.chosen.dueAt !== p.dueAt ||
      prepared.plan.chosen.instant !== p.instant ||
      prepared.plan.chosen.offsetSeconds !== p.offsetSeconds
    )
      fail(409, "preview", "This preview changed. Reload and review it.");
    const plan = prepared.plan;
    if (series && series.revision >= 2147483647)
      fail(409, "revision", "This recurrence revision limit was reached.");
    if (
      (
        await c.query("SELECT 1 FROM os_records WHERE org_id=$1 AND id=$2", [
          org,
          plan.generatedRecordId,
        ])
      ).rows.length
    )
      fail(
        409,
        "identity_conflict",
        "The proposed task identity already exists. No replacement was created.",
      );
    if (!series) {
      if (
        (
          await c.query(
            "SELECT 1 FROM os_task_recurrence_series WHERE org_id=$1 AND id=$2",
            [org, plan.seriesId],
          )
        ).rows.length
      )
        fail(
          409,
          "identity_conflict",
          "The proposed recurrence identity already exists.",
        );
      await c.query(
        `INSERT INTO os_task_recurrence_series(org_id,id,root_record_id,method,anchor,state,revision,tip_record_id,tip_sequence,created_by,budget_bytes) VALUES($1,$2,$3,$4,$5,'active',1,$3,0,$6,2147483647)`,
        [
          org,
          plan.seriesId,
          sourceId,
          TASK_RECURRENCE_METHOD,
          JSON.stringify(plan.anchor),
          user,
        ],
      );
    }
    const now = new Date().toISOString(),
      packet = {
        seriesId: plan.seriesId,
        sequence: plan.sequence,
        sourceRecordId: sourceId,
        sourceRevision: source.revision,
        sourceDataHash: plan.sourceDataHash,
        capturedSource: {
          moduleId: "projects",
          kind: "task",
          programId: source.data.programId,
          dueAt: source.data.dueAt,
          timeZone: source.data.timeZone,
          recurrence: source.data.recurrence,
        },
        generatedRecordId: plan.generatedRecordId,
        initialGeneratedDataHash: plan.candidateDataHash,
        generatedModuleId: "projects",
        generatedKindAtCreation: "task",
        method: TASK_RECURRENCE_METHOD,
        anchorHash: hash(plan.anchor),
        selectedCivil: p.civil,
        chosen: plan.chosen,
        planHash: plan.planHash,
        originalActorId: user,
        acceptedCommandHash: command,
        acceptedRequestHash: requestHash,
        createdAt: now,
      };
    if (Buffer.byteLength(JSON.stringify(packet)) > 8192)
      fail(422, "quota", "This recurrence packet exceeds its history limit.");
    const child = {
      ...clone(plan.candidate),
      id: plan.generatedRecordId,
      orgId: org,
      createdAt: now,
      updatedAt: now,
    };
    await saveRecord(c, child);
    await c.query(
      `INSERT INTO os_task_recurrence_occurrences(org_id,series_id,sequence,source_record_id,generated_record_id,accepted_command_hash,packet) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        org,
        plan.seriesId,
        plan.sequence,
        sourceId,
        plan.generatedRecordId,
        command,
        JSON.stringify(packet),
      ],
    );
    await c.query(
      "UPDATE os_task_recurrence_series SET tip_record_id=$3,tip_sequence=$4,revision=revision+1 WHERE org_id=$1 AND id=$2",
      [org, plan.seriesId, child.id, plan.sequence],
    );
    await reserveSeriesEnd(c, org, plan.seriesId);
    await checkRecurrenceCapacity(c, org);
    await audit(c, org, user, "task-recurrence.generated", child, {
      record: child,
      provenance: packet,
    });
    if ((await logicalBackupBytes(c, org)) > 60 * 1024 * 1024)
      fail(422, "quota", "This workspace reached its export budget.");
    const saved = (
      await c.query("SELECT * FROM os_records WHERE org_id=$1 AND id=$2", [
        org,
        child.id,
      ])
    ).rows[0];
    return okay({
      kind: "generated",
      existing: {
        kind: "active-record",
        record: rowRecord(saved),
        seriesId: plan.seriesId,
        sequence: plan.sequence,
        replayed: false,
      },
    });
  }
  unavailable();
}
