/** Whole-occurrence staff reports. A booking count is context, never attendance. */
import { createHmac } from "node:crypto";
import { allRecords, rowRecord, saveRecord, audit } from "./database.mjs";
import { requirePermission, visibleRecord } from "./access.mjs";
import { validateRecord } from "./modules.mjs";
import { participationTerms } from "./participation.mjs";
import { parentKey, targetKind, bookingKind } from "./participation-guards.mjs";
import { fail, hash, stable, equal, json } from "./security.mjs";
import { readLearningBytes } from "./learning-requests.mjs";
import { parseTaskRecurrenceJson } from "./task-recurrence.mjs";
import { checkWorkspaceExportCapacity } from "./workspace-backup.mjs";

export const ATTENDANCE_METHOD = "whole-occurrence-staff-reported-v1";
export const ATTENDANCE_LIMITS = Object.freeze({
  requestBytes: 8192,
  tokenBytes: 4096,
  reviewMs: 600000,
  count: 1_000_000_000,
  ledger: 2000,
});
const scope = "whole-occurrence",
  ID = /^[A-Za-z0-9_-]{1,100}$/,
  SHA = /^[a-f0-9]{64}$/;
const H = (kind, value) => hash({ method: ATTENDANCE_METHOD, kind, value });
const unavailable = () =>
  fail(
    404,
    "attendance_unavailable",
    "This occurrence or its complete attendance context is unavailable.",
  );
const stale = () =>
  fail(
    409,
    "attendance_stale",
    "This occurrence or its reviewed booking context changed. Reload and review attendance again.",
  );
const exact = (v, keys) => {
  if (
    !v ||
    Object.getPrototypeOf(v) !== Object.prototype ||
    Object.getOwnPropertySymbols(v).length ||
    !Object.keys(v).every((k) => keys.includes(k)) ||
    !keys.every((k) => Object.hasOwn(v, k)) ||
    Object.values(Object.getOwnPropertyDescriptors(v)).some(
      (d) => !Object.hasOwn(d, "value"),
    )
  )
    fail(
      422,
      "attendance_fields",
      "Use exactly the documented attendance fields.",
    );
};
const count = (v, optional = false) => {
  if (optional && v === null) return null;
  if (!Number.isSafeInteger(v) || v < 0 || v > ATTENDANCE_LIMITS.count)
    fail(
      422,
      "attendance_count",
      "Enter an explicit whole-occurrence integer count from zero through 1,000,000,000. Blank is unknown, not zero.",
    );
  return v;
};
export function attendanceInput(v) {
  exact(v, [
    "contextSha256",
    "title",
    "reportedAttendance",
    "registeredCount",
    "walkInCount",
    "wholeOccurrence",
  ]);
  if (
    !SHA.test(v.contextSha256) ||
    typeof v.title !== "string" ||
    !v.title.trim() ||
    v.title.length > 180 ||
    v.wholeOccurrence !== true
  )
    fail(
      422,
      "attendance_fields",
      "State a bounded title and explicitly affirm a whole-occurrence report. A booking subset is not a whole count.",
    );
  return {
    contextSha256: v.contextSha256,
    title: v.title,
    reportedAttendance: count(v.reportedAttendance),
    registeredCount: count(v.registeredCount, true),
    walkInCount: count(v.walkInCount, true),
    wholeOccurrence: true,
  };
}
export async function readAttendanceBody(request) {
  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      request.headers.get("content-type") || "",
    )
  )
    fail(415, "attendance_fields", "Use a bounded JSON attendance request.");
  try {
    const bytes = await readLearningBytes(
      request,
      ATTENDANCE_LIMITS.requestBytes,
    );
    return parseTaskRecurrenceJson(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes),
      ATTENDANCE_LIMITS.requestBytes,
    );
  } catch (error) {
    fail(
      [408, 413].includes(error.status) ? error.status : 422,
      "attendance_fields",
      "Use complete bounded UTF-8 JSON without duplicate or undocumented fields.",
    );
  }
}
const childId = (org, moduleId, target) =>
  "attendance_" + H("child", { org, moduleId, target }).slice(0, 64);
const identity = (m) =>
  H("actor", { userId: m.userId, createdAtExact: m.createdAtExact });
const membershipHash = (m) =>
  H("membership", { ...m, programIds: [...m.programIds].sort() });
const sessionHash = (session) => H("session", session.session.id);
const sign = (kind, value, secret) =>
  createHmac("sha256", secret)
    .update("charitology:attendance:" + kind + ":v1:" + stable(value))
    .digest("base64url");
function token(value, secret) {
  const raw = Buffer.from(stable(value)).toString("base64url");
  if (raw.length > ATTENDANCE_LIMITS.tokenBytes - 100)
    fail(422, "attendance_preview", "The attendance review exceeds its bound.");
  return raw + "." + sign("preview", raw, secret);
}
function readToken(value, secret) {
  const bad = () =>
    fail(
      409,
      "attendance_preview",
      "Reload and explicitly review this attendance draft.",
    );
  if (
    typeof value !== "string" ||
    value.length > ATTENDANCE_LIMITS.tokenBytes ||
    !/^[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+$/.test(value)
  )
    bad();
  const [raw, sig] = value.split(".");
  if (!equal(sig, sign("preview", raw, secret))) bad();
  const bytes = Buffer.from(raw, "base64url");
  if (bytes.toString("base64url") !== raw) bad();
  let p;
  try {
    p = parseTaskRecurrenceJson(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes),
      4096,
    );
  } catch {
    bad();
  }
  exact(p, [
    "version",
    "method",
    "scope",
    "orgId",
    "targetId",
    "moduleId",
    "actorHash",
    "membershipHash",
    "sessionHash",
    "contextSha256",
    "candidateSha256",
    "input",
    "issuedAt",
    "expiresAt",
  ]);
  if (
    p.version !== 1 ||
    p.method !== ATTENDANCE_METHOD ||
    p.scope !== scope ||
    !Number.isSafeInteger(p.issuedAt) ||
    p.expiresAt - p.issuedAt !== ATTENDANCE_LIMITS.reviewMs
  )
    bad();
  attendanceInput(p.input);
  return p;
}
async function currentMember(c, org, user, session, readOnly = false) {
  if (!session?.session?.id || session.user?.id !== user)
    fail(401, "session", "Sign in again before reviewing attendance.");
  const live = await c.query(
    'SELECT 1 FROM "session" s JOIN "user" u ON u.id=s."userId" WHERE s.id=$1 AND s."userId"=$2 AND s."expiresAt">clock_timestamp() AND u."emailVerified"=true' +
      (readOnly ? "" : " FOR SHARE OF s"),
    [session.session.id, user],
  );
  if (!live.rowCount)
    fail(401, "session", "Sign in again before reviewing attendance.");
  const row = (
    await c.query(
      `SELECT user_id,role,program_ids,revision,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS incarnation FROM os_members WHERE org_id=$1 AND user_id=$2`,
      [org, user],
    )
  ).rows[0];
  if (!row) fail(403, "membership", "Current organization access is required.");
  return {
    userId: row.user_id,
    role: row.role,
    programIds: row.program_ids,
    revision: row.revision,
    createdAtExact: row.incarnation,
  };
}
const fullyVisible = (record, member) =>
  !!record && visibleRecord(record, member) === record;
async function restoreEpoch(c, org, ids) {
  const rows = (
    await c.query(
      "SELECT record_id,max(id)::text AS id FROM os_events WHERE org_id=$1 AND action='record.restored' AND record_id=ANY($2::text[]) GROUP BY record_id ORDER BY record_id",
      [org, [...new Set(ids)].sort()],
    )
  ).rows;
  return H("restore-epoch", rows);
}
const targetDto = (r) => ({
  id: r.id,
  orgId: r.orgId,
  moduleId: r.moduleId,
  programId: r.data.programId ?? null,
  title: r.data.title,
  status: r.status,
  revision: r.revision,
  startAt: r.data.startAt,
  endAt: r.data.endAt,
  timeZone: r.data.timeZone,
});
async function context(c, org, targetId, member, readOnly = false) {
  const records = await allRecords(c, org),
    source = records.find((r) => r.id === targetId);
  if (
    !source ||
    !["events", "volunteers"].includes(source.moduleId) ||
    source.data.kind !== targetKind(source.moduleId)
  )
    unavailable();
  requirePermission(source.moduleId, member, "read");
  requirePermission(source.moduleId, member, "write");
  if (!fullyVisible(source, member)) unavailable();
  const program = source.data.programId
    ? records.find((r) => r.id === source.data.programId)
    : null;
  if (
    source.data.programId &&
    (!program ||
      program.moduleId !== "programs" ||
      !fullyVisible(program, member))
  )
    unavailable();
  const managed = (
    await c.query(
      "SELECT * FROM os_participation_targets WHERE org_id=$1 AND target_id=$2" +
        (readOnly ? "" : " FOR UPDATE"),
      [org, targetId],
    )
  ).rows[0];
  const ledger = (
    await c.query(
      "SELECT * FROM os_participations WHERE org_id=$1 AND target_id=$2 ORDER BY id LIMIT 2001",
      [org, targetId],
    )
  ).rows;
  if (ledger.length > ATTENDANCE_LIMITS.ledger)
    fail(
      422,
      "attendance_limit",
      "The complete attendance context exceeds its bound.",
    );
  const confirmed = ledger.filter((p) => p.state === "confirmed"),
    linked = [];
  const contacts = new Set();
  for (const p of confirmed) {
    const booking = records.find((r) => r.id === p.booking_record_id),
      contact = records.find((r) => r.id === p.contact_id);
    if (
      !fullyVisible(booking, member) ||
      !fullyVisible(contact, member) ||
      contact.moduleId !== "contacts" ||
      booking.moduleId !== source.moduleId ||
      p.module_id !== source.moduleId ||
      booking.data.kind !== bookingKind(source.moduleId) ||
      booking.data[parentKey(source.moduleId)] !== targetId ||
      booking.data.contactId !== p.contact_id ||
      (booking.data.programId ?? null) !== (source.data.programId ?? null) ||
      contacts.has(p.contact_id)
    )
      unavailable();
    contacts.add(p.contact_id);
    linked.push({ booking, contact });
  }
  const id = childId(org, source.moduleId, targetId),
    existingRows = (
      await c.query(
        "SELECT * FROM os_records WHERE org_id=$1 AND ((module_id=$2 AND data->>'kind'='attendance' AND data->>$3=$4) OR id=$5) ORDER BY id",
        [org, source.moduleId, parentKey(source.moduleId), targetId, id],
      )
    ).rows;
  if (existingRows.some((r) => !fullyVisible(rowRecord(r), member)))
    unavailable();
  const existing =
    existingRows.length === 1
      ? {
          record: rowRecord(existingRows[0]),
          disposition: existingRows[0].deleted_at ? "trash" : "active",
        }
      : null;
  let reason = null,
    terms = null;
  if (!managed || managed.mode !== "managed" || managed.recovery_block)
    reason = "Reconcile this managed occurrence before reporting attendance.";
  else if (
    !source.approval ||
    source.approval.status !== "approved" ||
    source.approval.revision !== source.revision ||
    source.approval.actorId === source.lastEditedBy ||
    !source.approval.actorId ||
    !["approved", "scheduled", "open", "assigned", "completed"].includes(
      source.status,
    )
  )
    reason = "The current occurrence needs independent final-state approval.";
  else {
    terms = participationTerms(source);
    if (Date.parse(terms.endAt) > Date.now())
      reason = "Attendance is available only after this whole occurrence ends.";
    else if (
      managed.terms_hash !== hash(terms) ||
      stable(managed.terms) !== stable(terms)
    )
      reason = "The managed occurrence terms changed; reconcile them first.";
    else if (!confirmed.length)
      reason =
        "At least one current confirmed booking is required as context; confirmations are not attendance.";
    else if (
      confirmed.some(
        (p) =>
          p.recovered ||
          !p.frozen ||
          p.frozen.termsHash !== hash(terms) ||
          stable(p.frozen.terms) !== stable(terms) ||
          (p.frozen.programId ?? null) !== (source.data.programId ?? null),
      )
    )
      reason =
        "Historical or changed booking commitments require reconciliation first.";
  }
  if (existingRows.length > 1)
    reason =
      "Multiple existing attendance records require ordinary review; no aggregate is selected automatically.";
  else if (existingRows.length)
    reason =
      "An attendance record already reserves this occurrence. Review or recover that existing record.";
  const epoch = await restoreEpoch(c, org, [
    targetId,
    id,
    ...(program ? [program.id] : []),
  ]);
  let sourceContext = null,
    contextSha256 = null;
  if (!reason) {
    const ledgerSha256 = H("ledger", { ledger, linked, program });
    sourceContext = {
      method: ATTENDANCE_METHOD,
      scope,
      targetId,
      moduleId: source.moduleId,
      sourceRevision: source.revision,
      sourceStatus: source.status,
      managedRevision: managed.revision,
      termsHash: managed.terms_hash,
      programId: source.data.programId ?? null,
      title: source.data.title,
      startAt: terms.startAt,
      endAt: terms.endAt,
      timeZone: terms.timeZone,
      confirmedPlaces: confirmed.length,
      knownRegisteredCount:
        source.moduleId === "events"
          ? (source.data.registeredCount ?? null)
          : null,
      knownWalkInCount:
        source.moduleId === "events" ? (source.data.walkInCount ?? null) : null,
      ledgerSha256,
      restoreEpochSha256: epoch,
    };
    contextSha256 = H("context", { sourceContext, source, managed, program });
  }
  return {
    records,
    source,
    managed,
    id,
    epoch,
    sourceContext,
    contextSha256,
    existing,
    existingRows,
    canPrepare: !reason,
    reason,
  };
}
export function attendanceCandidate(input, ctx, user, org) {
  const x = attendanceInput(input),
    s = ctx.source,
    m = s.moduleId;
  if (
    m === "volunteers" &&
    (x.registeredCount !== null || x.walkInCount !== null)
  )
    fail(
      422,
      "attendance_fields",
      "Volunteer attendance has no event registration or walk-in counts.",
    );
  const known = (key, value) => {
    const previous = s.data[key] ?? null;
    if (previous !== null && value !== null && previous !== value)
      fail(
        422,
        "attendance_count",
        "Preserve the occurrence’s known registration and walk-in facts; correct those separately before reviewing this draft.",
      );
    return previous ?? value;
  };
  const data = validateRecord(
    m,
    {
      title: x.title,
      kind: "attendance",
      programId: s.data.programId ?? null,
      [parentKey(m)]: s.id,
      contactId: null,
      ...(m === "events"
        ? {
            attendanceCount: x.reportedAttendance,
            registeredCount: known("registeredCount", x.registeredCount),
            walkInCount: known("walkInCount", x.walkInCount),
          }
        : { participants: x.reportedAttendance, minutes: null }),
    },
    { orgId: org, recordId: ctx.id, status: "draft", records: ctx.records },
  );
  return {
    id: ctx.id,
    orgId: org,
    moduleId: m,
    status: "draft",
    revision: 1,
    data,
    ownerId: user,
    lastEditedBy: user,
    approval: null,
    snapshot: null,
    source: null,
  };
}
const publicContext = (ctx) => ({
  target: targetDto(ctx.source),
  contextSha256: ctx.contextSha256,
  sourceContext: ctx.sourceContext,
  canPrepare: ctx.canPrepare,
  reason: ctx.reason,
  existing: ctx.existing,
});
async function replay(c, org, member, session, p, input, ctx, settings) {
  const commandHash = H("command", {
      org,
      actor: identity(member),
      key: input.idempotencyKey,
    }),
    requestHash = H("request", { previewToken: input.previewToken });
  const rows = (
    await c.query(
      "SELECT * FROM os_events WHERE org_id=$1 AND action='attendance.draft-created' AND detail#>>'{attendanceReceipt,commandHash}'=$2 ORDER BY id LIMIT 2",
      [org, commandHash],
    )
  ).rows;
  if (!rows.length) return { commandHash, requestHash };
  const conflict = () =>
    fail(
      409,
      "attendance_command",
      "This command identity already belongs to a different accepted request or incarnation. Reconcile the existing attendance record.",
    );
  if (rows.length !== 1) conflict();
  const receipt = rows[0].detail?.attendanceReceipt,
    signature = rows[0].detail?.attendanceSignature;
  if (!receipt || !equal(signature, sign("receipt", receipt, settings.secret)))
    conflict();
  exact(receipt, [
    "version",
    "method",
    "scope",
    "orgId",
    "targetId",
    "moduleId",
    "recordId",
    "candidateSha256",
    "contextSha256",
    "confirmedPlaces",
    "reportedAttendance",
    "actorHash",
    "membershipHash",
    "sessionHash",
    "restoreEpochSha256",
    "commandHash",
    "requestHash",
    "acceptedAt",
  ]);
  if (
    receipt.version !== 1 ||
    receipt.method !== ATTENDANCE_METHOD ||
    receipt.scope !== scope ||
    rows[0].actor_id !== member.userId ||
    rows[0].record_id !== ctx.id ||
    receipt.orgId !== org ||
    receipt.targetId !== ctx.source.id ||
    receipt.moduleId !== ctx.source.moduleId ||
    receipt.recordId !== ctx.id ||
    receipt.commandHash !== commandHash ||
    receipt.candidateSha256 !== p.candidateSha256 ||
    receipt.contextSha256 !== p.contextSha256 ||
    receipt.reportedAttendance !== p.input.reportedAttendance ||
    receipt.requestHash !== requestHash ||
    receipt.actorHash !== identity(member) ||
    receipt.membershipHash !== membershipHash(member) ||
    receipt.sessionHash !== sessionHash(session) ||
    receipt.restoreEpochSha256 !== ctx.epoch
  )
    conflict();
  const row = (
    await c.query("SELECT * FROM os_records WHERE org_id=$1 AND id=$2", [
      org,
      receipt.recordId,
    ])
  ).rows[0];
  if (
    !row ||
    row.module_id !== receipt.moduleId ||
    !fullyVisible(rowRecord(row), member)
  )
    unavailable();
  return {
    response: json({
      ok: true,
      kind: "already-created",
      record: rowRecord(row),
      disposition: row.deleted_at ? "trash" : "active",
    }),
  };
}
export async function attendanceRoutes({
  c,
  org,
  user,
  session,
  tail,
  method,
  input = {},
  url,
  settings,
}) {
  if (!/^participation-targets\/[A-Za-z0-9_-]+\/attendance(?:\/|$)/.test(tail))
    return null;
  const match =
    /^participation-targets\/([A-Za-z0-9_-]{1,100})\/attendance(?:\/(preview|create))?$/.exec(
      tail,
    );
  if (!match)
    fail(404, "attendance_route", "Use the documented staff attendance route.");
  const query = new URLSearchParams(url.search);
  if (
    query.getAll("path").length === 1 &&
    query.get("path") === url.pathname.slice(5)
  )
    query.delete("path");
  if ([...query.keys()].length)
    fail(
      422,
      "attendance_fields",
      "Do not put private attendance data in a query.",
    );
  if ((match[2] && method !== "POST") || (!match[2] && method !== "GET"))
    fail(
      405,
      "attendance_route",
      "Use GET context or an explicit POST attendance command.",
    );
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [org]);
  const member = await currentMember(c, org, user, session, method === "GET"),
    ctx = await context(c, org, match[1], member, method === "GET");
  if (!match[2]) return json({ ok: true, ...publicContext(ctx) });
  if (match[2] === "preview") {
    const x = attendanceInput(input);
    if (ctx.existingRows.length)
      fail(
        409,
        "attendance_exists",
        "This occurrence already has attendance. Review its ordinary record.",
      );
    if (!ctx.canPrepare || x.contextSha256 !== ctx.contextSha256) stale();
    const candidate = attendanceCandidate(x, ctx, user, org),
      issuedAt = Date.now(),
      expiresAt = issuedAt + ATTENDANCE_LIMITS.reviewMs;
    const p = {
      version: 1,
      method: ATTENDANCE_METHOD,
      scope,
      orgId: org,
      targetId: ctx.source.id,
      moduleId: ctx.source.moduleId,
      actorHash: identity(member),
      membershipHash: membershipHash(member),
      sessionHash: sessionHash(session),
      contextSha256: ctx.contextSha256,
      candidateSha256: H("candidate", candidate),
      input: x,
      issuedAt,
      expiresAt,
    };
    return json({
      ok: true,
      previewToken: token(p, settings.secret),
      expiresAt: new Date(expiresAt).toISOString(),
      preview: {
        method: ATTENDANCE_METHOD,
        scope,
        sourceContext: ctx.sourceContext,
        candidate,
      },
    });
  }
  exact(input, ["previewToken", "idempotencyKey"]);
  if (
    typeof input.idempotencyKey !== "string" ||
    !/^[A-Za-z0-9_-]{16,100}$/.test(input.idempotencyKey)
  )
    fail(
      422,
      "attendance_fields",
      "Use one bounded command identity for this exact create.",
    );
  const p = readToken(input.previewToken, settings.secret);
  const accepted = await replay(
    c,
    org,
    member,
    session,
    p,
    input,
    ctx,
    settings,
  );
  if (accepted.response) return accepted.response;
  if (
    p.orgId !== org ||
    p.targetId !== ctx.source.id ||
    p.moduleId !== ctx.source.moduleId ||
    p.actorHash !== identity(member) ||
    p.membershipHash !== membershipHash(member) ||
    p.sessionHash !== sessionHash(session)
  )
    stale();
  if (ctx.existingRows.length)
    fail(
      409,
      "attendance_exists",
      "This occurrence already has attendance. Review its ordinary record.",
    );
  if (
    !ctx.canPrepare ||
    p.expiresAt <= Date.now() ||
    p.issuedAt > Date.now() ||
    p.contextSha256 !== ctx.contextSha256
  )
    stale();
  const candidate = attendanceCandidate(p.input, ctx, user, org);
  if (H("candidate", candidate) !== p.candidateSha256) stale();
  await saveRecord(c, candidate);
  const receipt = {
    version: 1,
    method: ATTENDANCE_METHOD,
    scope,
    orgId: org,
    targetId: ctx.source.id,
    moduleId: ctx.source.moduleId,
    recordId: ctx.id,
    candidateSha256: p.candidateSha256,
    contextSha256: p.contextSha256,
    confirmedPlaces: ctx.sourceContext.confirmedPlaces,
    reportedAttendance: p.input.reportedAttendance,
    actorHash: p.actorHash,
    membershipHash: p.membershipHash,
    sessionHash: p.sessionHash,
    restoreEpochSha256: ctx.epoch,
    commandHash: accepted.commandHash,
    requestHash: accepted.requestHash,
    acceptedAt: new Date().toISOString(),
  };
  await audit(c, org, user, "attendance.draft-created", candidate, {
    record: candidate,
    attendanceReceipt: receipt,
    attendanceSignature: sign("receipt", receipt, settings.secret),
  });
  await checkWorkspaceExportCapacity(c, org);
  const saved = (
    await c.query("SELECT * FROM os_records WHERE org_id=$1 AND id=$2", [
      org,
      ctx.id,
    ])
  ).rows[0];
  return json({
    ok: true,
    kind: "created",
    record: rowRecord(saved),
    disposition: "active",
  });
}
