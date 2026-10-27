import { allRecords, audit, logicalBackupBytes } from "./database.mjs";
import { inScope, membership } from "./access.mjs";
import { modulePermissions } from "./modules.mjs";
import { fail, hash, id, json, stable } from "./security.mjs";
import {
  compileGrantReport,
  finalizeGrantReport,
} from "./grant-report-model.mjs";

const METHOD = "grant-report-v1";
export const GRANT_REPORT_LIMITS = Object.freeze({
  body: 16384,
  report: 2 * 1024 * 1024,
  previewPayload: 2105344,
  previews: 4,
  previewBytes: 8 * 1024 * 1024,
  page: 20,
});
const plain = (value) =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const opaque = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const digest = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const okay = (value) => json({ ok: true, ...value });
const unavailable = () =>
  fail(
    404,
    "grant_report",
    "This grant report or required source is unavailable.",
  );
const exact = (input, keys) => {
  if (!plain(input) || Object.keys(input).some((key) => !keys.includes(key)))
    fail(
      422,
      "grant_report_fields",
      "Use only the documented grant-report fields.",
    );
};
const fingerprint = (member, user) => ({
  userId: user,
  role: member.role,
  programIds: [...(member.programIds || [])].sort(),
  revision: member.revision,
});
const permissions = (moduleId, member) => {
  try {
    return modulePermissions(moduleId, member.role);
  } catch {
    return {};
  }
};
const scope = (programId, member) =>
  opaque(programId) &&
  (!(member.programIds || []).length || member.programIds.includes(programId));

/** Discriminate before legacy readers inspect modules; unsupported versions fail closed. */
export function isGrantReport(payload) {
  return plain(payload) && payload.kind === "grant-period";
}

/** Current authority chooses a stored view; historical creator/approval flags grant nothing. */
export function grantReportForReader(payload, member) {
  if (
    !isGrantReport(payload) ||
    payload.format !== "charitology-os-report" ||
    payload.schemaVersion !== 1 ||
    payload.methodVersion !== METHOD ||
    !plain(member) ||
    member.role === "external_reviewer" ||
    !permissions("reporting", member).read ||
    !scope(payload.agreement?.programId, member)
  )
    return null;
  if (member.role === "board_reader") {
    const board = payload.boardProjection;
    return payload.manifest?.audience === "board" &&
      plain(board) &&
      board.kind === "grant-period-board" &&
      board.id === payload.id &&
      board.orgId === payload.orgId &&
      digest(board.checksum)
      ? board
      : null;
  }
  if (
    !permissions("reporting", member).export ||
    !Array.isArray(payload.modules) ||
    !payload.modules.length
  )
    return null;
  for (const module of payload.modules) {
    const access = permissions(module.id, member);
    if (!access.read || !access.export || !Array.isArray(module.records))
      return null;
    for (const record of module.records) {
      if (
        !plain(record) ||
        !plain(record.data) ||
        record.moduleId !== module.id ||
        record.orgId !== payload.orgId ||
        !inScope(record, member)
      )
        return null;
      const anchor =
        record.moduleId === "programs" ? record.id : record.data?.programId;
      if (anchor !== payload.agreement.programId) return null;
    }
  }
  return payload;
}

function requireCreator(member) {
  const p = permissions("reporting", member);
  if (!p.write || !p.export || member.role === "external_reviewer")
    fail(
      403,
      "role",
      "Current Reporting write and export permission is required.",
    );
}
function requireReader(member) {
  if (
    member.role === "external_reviewer" ||
    !permissions("reporting", member).read
  )
    fail(403, "role", "Current grant-report read permission is required.");
}
function allowedSource(record, member) {
  if (!record) unavailable();
  const p = permissions(record.moduleId, member);
  if (!p.read || !p.export || !inScope(record, member))
    fail(
      403,
      "grant_report_source",
      "A required source is outside current read/export authority.",
    );
  return record;
}
function query(url, allowCursor) {
  const values = new URLSearchParams(url.search),
    captures = values.getAll("path");
  if (captures.length === 1 && captures[0] === url.pathname.slice(5))
    values.delete("path");
  if (
    [...values.keys()].some((key) => !allowCursor || key !== "cursor") ||
    values.getAll("cursor").length > 1
  )
    fail(
      400,
      "grant_report_query",
      "Use only the documented report page cursor; private fields belong in JSON.",
    );
  const cursor = values.get("cursor");
  if (cursor !== null && !opaque(cursor))
    fail(
      422,
      "grant_report_cursor",
      "Use the cursor returned by this report list.",
    );
  return cursor;
}

async function compileCurrent(c, { org, user, member, input, mode }) {
  requireCreator(member);
  if (
    !opaque(input.reportingRecordId) ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 1
  )
    fail(
      422,
      "grant_report_manifest",
      "Choose a saved Reporting manifest and its current revision.",
    );
  const records = await allRecords(c, org);
  const manifest = records.find(
    (record) =>
      record.id === input.reportingRecordId && record.moduleId === "reporting",
  );
  allowedSource(manifest, member);
  if (manifest.revision !== input.revision)
    fail(
      409,
      "revision",
      "The manifest changed. Reload it before preparing another report.",
    );
  const agreement = records.find(
    (record) =>
      record.id === manifest.data.agreementId &&
      record.moduleId === "grant-delivery",
  );
  if (agreement) allowedSource(agreement, member);
  const application =
    agreement &&
    records.find(
      (record) =>
        record.id === agreement.data.applicationId &&
        record.moduleId === "grant-seeking",
    );
  let submissionEvents = [];
  if (application) {
    allowedSource(application, member);
    // Read only this authorized application's matching server submission. A
    // later working approval can replace record.snapshot, never the audit row.
    submissionEvents = (
      await c.query(
        "SELECT id::text,record_id AS \"recordId\",created_at AS \"createdAt\",detail->'record' AS record FROM os_events WHERE org_id=$1 AND record_id=$2 AND module_id='grant-seeking' AND action='record.transitioned' AND detail#>>'{record,status}'='submitted' AND detail#>>'{record,data,applicationVersion}'=$3 AND detail#>>'{record,data,submissionReference}'=$4 ORDER BY id",
        [
          org,
          application.id,
          String(application.data.applicationVersion),
          application.data.submissionReference,
        ],
      )
    ).rows;
    submissionEvents = submissionEvents.map((event) => ({
      ...event,
      createdAt:
        event.createdAt instanceof Date
          ? event.createdAt.toISOString()
          : event.createdAt,
    }));
  }
  let previousReport = null;
  if (manifest.data.supersedesReportId) {
    if (!opaque(manifest.data.supersedesReportId))
      fail(
        422,
        "grant_report_correction",
        "Choose a valid earlier grant report.",
      );
    previousReport = (
      await c.query(
        "SELECT payload FROM os_reports WHERE org_id=$1 AND id=$2",
        [org, manifest.data.supersedesReportId],
      )
    ).rows[0]?.payload;
    if (!previousReport || !grantReportForReader(previousReport, member))
      unavailable();
  }
  return compileGrantReport({
    org,
    member: { ...member, userId: user },
    records,
    reportingRecordId: manifest.id,
    revision: input.revision,
    submissionEvents,
    previousReport,
    mode,
  });
}
const proofFor = (compiled, member, user) => ({
  compiled,
  authorization: fingerprint(member, user),
});
function canonicalReportBound(report) {
  if (Buffer.byteLength(stable(report)) > GRANT_REPORT_LIMITS.report)
    fail(
      422,
      "grant_report_size",
      "This complete report exceeds the 2 MiB bound. Reduce the manifest selection; nothing was frozen.",
    );
}
function commandInput(input) {
  exact(input, ["previewId", "reviewHash", "idempotencyKey"]);
  if (
    !opaque(input.previewId) ||
    !digest(input.reviewHash) ||
    typeof input.idempotencyKey !== "string" ||
    !/^[A-Za-z0-9_-]{16,100}$/.test(input.idempotencyKey)
  )
    fail(
      422,
      "grant_report_command",
      "Use the exact reviewed preview and a random command key of 16–100 characters.",
    );
  return hash({ method: METHOD, key: input.idempotencyKey });
}
function listMetadata(row, report) {
  return {
    id: row.id,
    title: report.title,
    kind: report.kind,
    methodVersion: report.methodVersion,
    programId: report.agreement.programId,
    audience: report.manifest.audience,
    period: report.period,
    checksum: report.checksum,
    createdAt: report.createdAt,
    supersedes: report.supersedes || null,
  };
}

/** Invoked inside the existing tenant tx and mutation lock, with outer CSRF/body/rate guards. */
export async function grantReportRoutes({
  c,
  org,
  user,
  member,
  tail,
  method,
  input = {},
  url,
}) {
  if (!/^grant-reports(?:\/|$)/.test(tail)) return null;
  const match = /^grant-reports(?:\/([A-Za-z0-9_-]{1,100}))?$/.exec(tail);
  if (!match) unavailable();
  const action = match[1] || null;
  const cursor = query(url, method === "GET" && !action);
  member = await membership(c, org, user);
  if (method === "GET") {
    requireReader(member);
    if (action) {
      const row = (
        await c.query(
          "SELECT id,payload FROM os_reports WHERE org_id=$1 AND id=$2",
          [org, action],
        )
      ).rows[0];
      const report = row && grantReportForReader(row.payload, member);
      if (!report) unavailable();
      return okay({ report });
    }
    const rows = (
      await c.query(
        "SELECT id,payload FROM os_reports WHERE org_id=$1 AND payload->>'kind'='grant-period' ORDER BY created_at DESC,id DESC",
        [org],
      )
    ).rows;
    const readable = rows
      .map((row) => ({
        row,
        report: grantReportForReader(row.payload, member),
      }))
      .filter((entry) => entry.report);
    const start = cursor
      ? readable.findIndex((entry) => entry.row.id === cursor) + 1
      : 0;
    if (cursor && start === 0)
      fail(
        422,
        "grant_report_cursor",
        "Use a current page cursor from this report list.",
      );
    const selected = readable.slice(start, start + GRANT_REPORT_LIMITS.page);
    return okay({
      reports: selected.map(({ row, report }) => listMetadata(row, report)),
      nextCursor:
        readable.length > start + GRANT_REPORT_LIMITS.page
          ? selected.at(-1).row.id
          : null,
    });
  }
  if (method !== "POST" || !["prepare", "preview", "freeze"].includes(action))
    fail(
      405,
      "grant_report_method",
      "Use the documented grant-report command.",
    );
  if (!plain(input))
    fail(422, "grant_report_fields", "Use a JSON grant-report command object.");
  if (Buffer.byteLength(JSON.stringify(input)) > GRANT_REPORT_LIMITS.body)
    fail(413, "size", "This grant-report command exceeds 16 KiB.");
  if (action !== "freeze") {
    exact(input, ["reportingRecordId", "revision"]);
    const compiled = await compileCurrent(c, {
      org,
      user,
      member,
      input,
      mode: action === "prepare" ? "prepare" : "preview",
    });
    canonicalReportBound(compiled.report);
    if (action === "prepare")
      return okay({
        sourceDigest: compiled.sourceDigest,
        report: compiled.report,
        issues: [],
      });
    // Account for the exact-size server envelope before offering a committable
    // preview. Real IDs/hashes and canonical timestamps have these fixed sizes.
    canonicalReportBound(
      finalizeGrantReport(compiled, {
        id: "f".repeat(32),
        org,
        user,
        member,
        createdAt: "2200-12-31T23:59:59.999Z",
        command: {
          keyHash: "f".repeat(64),
          previewId: "f".repeat(32),
          reviewHash: "f".repeat(64),
        },
      }),
    );
    const proof = proofFor(compiled, member, user),
      reviewHash = hash(proof),
      previewId = id();
    const bytes = Number(
      (
        await c.query("SELECT octet_length($1::jsonb::text) AS bytes", [
          JSON.stringify(proof),
        ])
      ).rows[0].bytes,
    );
    if (bytes > GRANT_REPORT_LIMITS.previewPayload)
      fail(
        422,
        "grant_report_preview_size",
        "The reviewed proof exceeds its bound. Reduce the selection.",
      );
    await c.query(
      "DELETE FROM os_grant_report_previews WHERE org_id=$1 AND expires_at<=now()",
      [org],
    );
    const expiresAt = new Date(Date.now() + 600000).toISOString();
    await c.query(
      "INSERT INTO os_grant_report_previews(org_id,id,actor_id,manifest_id,manifest_revision,review_hash,payload,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        org,
        previewId,
        user,
        input.reportingRecordId,
        input.revision,
        reviewHash,
        JSON.stringify(proof),
        expiresAt,
      ],
    );
    const usage = (
      await c.query(
        "SELECT count(*) AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0) AS bytes FROM os_grant_report_previews t WHERE org_id=$1",
        [org],
      )
    ).rows[0];
    if (
      Number(usage.count) > GRANT_REPORT_LIMITS.previews ||
      Number(usage.bytes) > GRANT_REPORT_LIMITS.previewBytes
    )
      fail(
        422,
        "grant_report_preview_quota",
        "Four live report previews or their 8 MiB byte budget are already retained. Wait for expiry or reduce the selection.",
      );
    await audit(c, org, user, "grant-report.previewed", null, {
      id: previewId,
      manifestId: input.reportingRecordId,
      sourceCount: compiled.report.sourceRevisions.length,
      reviewHash,
    });
    return okay({
      sourceDigest: compiled.sourceDigest,
      previewId,
      reviewHash,
      expiresAt,
      report: compiled.report,
      issues: [],
    });
  }
  const keyHash = commandInput(input);
  const previous = (
    await c.query(
      "SELECT payload FROM os_reports WHERE org_id=$1 AND payload->>'kind'='grant-period' AND payload->>'methodVersion'=$2 AND payload#>>'{command,actorId}'=$3 AND payload#>>'{command,keyHash}'=$4",
      [org, METHOD, user, keyHash],
    )
  ).rows[0]?.payload;
  if (previous) {
    if (
      previous.command.previewId !== input.previewId ||
      previous.command.reviewHash !== input.reviewHash
    )
      fail(
        409,
        "grant_report_command",
        "This command key already belongs to a different reviewed preview.",
      );
    const report = grantReportForReader(previous, member);
    if (!report) unavailable();
    return okay({ report, reused: true, commandRecorded: true });
  }
  requireCreator(member);
  const preview = (
    await c.query(
      "SELECT * FROM os_grant_report_previews WHERE org_id=$1 AND id=$2 AND actor_id=$3 AND expires_at>now() FOR UPDATE",
      [org, input.previewId, user],
    )
  ).rows[0];
  if (!preview || preview.review_hash !== input.reviewHash)
    fail(
      409,
      "grant_report_preview",
      "This preview expired or changed. Prepare and review the current report again.",
    );
  const compiled = await compileCurrent(c, {
    org,
    user,
    member,
    input: {
      reportingRecordId: preview.manifest_id,
      revision: preview.manifest_revision,
    },
    mode: "preview",
  });
  const proof = proofFor(compiled, member, user);
  if (
    hash(proof) !== input.reviewHash ||
    hash(preview.payload) !== input.reviewHash
  )
    fail(
      409,
      "grant_report_preview",
      "A source, approval, manifest or membership changed. Prepare and review the current report again.",
    );
  // A lost response followed by a fresh command cannot create another copy of
  // the same approved edition. Recompute current authority BEFORE this lookup.
  const edition = (
    await c.query(
      "SELECT payload FROM os_reports WHERE org_id=$1 AND payload->>'kind'='grant-period' AND payload->>'methodVersion'=$2 AND payload#>>'{manifest,id}'=$3 AND payload#>>'{manifest,revision}'=$4 AND payload#>>'{manifest,sourceDigest}'=$5",
      [
        org,
        METHOD,
        compiled.report.manifest.id,
        String(compiled.report.manifest.revision),
        compiled.sourceDigest,
      ],
    )
  ).rows[0]?.payload;
  if (edition) {
    const report = grantReportForReader(edition, member);
    if (!report) unavailable();
    await c.query(
      "DELETE FROM os_grant_report_previews WHERE org_id=$1 AND id=$2",
      [org, preview.id],
    );
    return okay({ report, reused: true, commandRecorded: false });
  }
  const report = finalizeGrantReport(compiled, {
    id: id(),
    org,
    user,
    member,
    createdAt: new Date().toISOString(),
    command: { keyHash, previewId: preview.id, reviewHash: input.reviewHash },
  });
  canonicalReportBound(report);
  await c.query(
    "DELETE FROM os_grant_report_previews WHERE org_id=$1 AND id=$2",
    [org, preview.id],
  );
  await c.query(
    "INSERT INTO os_reports(org_id,id,created_by,title,checksum,payload) VALUES($1,$2,$3,$4,$5,$6)",
    [
      org,
      report.id,
      user,
      report.title,
      report.checksum,
      JSON.stringify(report),
    ],
  );
  await audit(c, org, user, "grant-report.frozen", null, {
    id: report.id,
    checksum: report.checksum,
    manifestId: report.manifest.id,
    manifestRevision: report.manifest.revision,
    sourceDigest: report.manifest.sourceDigest,
    sourceCount: report.sourceRevisions.length,
  });
  // Audit admission includes actual PostgreSQL report/preview row representation.
  if ((await logicalBackupBytes(c, org)) > 60 * 1024 * 1024)
    fail(
      422,
      "quota",
      "This report exceeds the ordinary workspace budget. Nothing was frozen.",
    );
  return okay({ report, reused: false, commandRecorded: true });
}
