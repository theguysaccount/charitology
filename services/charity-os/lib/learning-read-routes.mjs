/** Current-authority, bounded read-only Learning routes. Authentication is owned by learningRoutes. */
import { fail } from "./security.mjs";
import { requireAdmin, inScope, requirePermission } from "./access.mjs";
import { rowRecord } from "./database.mjs";
import {
  learningHash as H,
  learningSame as same,
  learningObject,
  learningId,
  learningNumber,
  learningHashValue,
  parseLearningJSON,
  learningCanonical,
} from "./learning-json.mjs";
import {
  validateLearningHeadPin,
  learningEventRecordPins,
} from "./learning-model.mjs";
import { validateLearningBackup } from "./learning-report-model.mjs";
import { learningQuery } from "./learning-requests.mjs";
import {
  requireLearningMember,
  requireLearningScope,
  resolveLearningApproval,
  learningResolution,
  learningUnavailable,
} from "./learning-access.mjs";
import {
  loadLearningInventory,
  learningBinding,
  learningBindingSummary,
  currentLearningSource,
  decodeLearningCursor,
  encodeLearningCursor,
} from "./learning-history.mjs";
import { readLearningReport } from "./learning-reports.mjs";
import { selectRecoveredLearningHistory } from "./learning-backup.mjs";

const PAGE = 20,
  MAX = 4 * 1024 * 1024;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const headers = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
});
const unavailable = () =>
  fail(404, "learning_route", "This learning route is unavailable.");
const stale = () =>
  fail(
    409,
    "learning_stale",
    "The learning history or access changed. Read its current first page again.",
  );
const oversized = () =>
  fail(
    422,
    "learning_size",
    "This complete learning response exceeds its supported byte bound.",
  );
const body = (value) => JSON.stringify({ ok: true, ...value });
const fits = (value, max = MAX) => Buffer.byteLength(body(value)) <= max;
function response(value, max = MAX) {
  const encoded = body(value);
  if (Buffer.byteLength(encoded) > max) oversized();
  return streamResponse(encoded,headers);
}
function streamResponse(encoded,headers){
  const bytes=new TextEncoder().encode(encoded);let offset=0;
  return new Response(new ReadableStream({pull(controller){
    if(offset>=bytes.length){controller.close();return;}
    controller.enqueue(bytes.slice(offset,offset+65536));offset+=65536;
  }}), { headers });
}
function rawResponse(value, name) {
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded) > MAX) oversized();
  return streamResponse(encoded, {
      ...headers,
      "content-disposition": `attachment; filename="${name}"`,
  });
}
function queryCursor(url) {
  return learningQuery(url, ["cursor"]).get("cursor");
}
function parseCursor(encoded) {
  const bytes = decodeLearningCursor(encoded);
  return bytes === null ? null : parseLearningJSON(bytes, 2048);
}
function listCursor(encoded, head) {
  const c = parseCursor(encoded);
  if (c === null) return null;
  learningObject(c, ["version", "lastId", "headSha256"]);
  if (c.version !== 1)
    fail(422, "learning_cursor", "This learning cursor is invalid.");
  learningId(c.lastId);
  if (c.headSha256 !== null) learningHashValue(c.headSha256);
  if (c.headSha256 !== head) stale();
  return c;
}
function historyCursor(encoded, binding) {
  const c = parseCursor(encoded);
  if (c === null) return null;
  learningObject(c, ["version", "bindingId", "head", "beforeSequence"]);
  if (c.version !== 1)
    fail(422, "learning_cursor", "This learning cursor is invalid.");
  learningId(c.bindingId);
  validateLearningHeadPin(c.head);
  learningNumber(c.beforeSequence, 1, 1001);
  if (c.bindingId !== binding.bindingId || !same(c.head, binding.head)) stale();
  return c;
}
const listNext = (lastId, headSha256) =>
  encodeLearningCursor({ version: 1, lastId, headSha256 });
const eventNext = (binding, beforeSequence) =>
  encodeLearningCursor({
    version: 1,
    bindingId: binding.bindingId,
    head: binding.head,
    beforeSequence,
  });
function page(items, { cursor, head, key, value }) {
  const c = listCursor(cursor, head);
  if (c && !items.some((x) => key(x) === c.lastId)) stale();
  const remaining = items.filter((x) => !c || cmp(key(x), c.lastId) > 0),
    chosen = [];
  for (const item of remaining) {
    if (chosen.length === PAGE) break;
    const candidate = [...chosen, item],
      next =
        remaining.length > candidate.length ? listNext(key(item), head) : null;
    if (!fits(value(candidate, next))) {
      if (!chosen.length) oversized();
      break;
    }
    chosen.push(item);
  }
  const next =
    remaining.length > chosen.length
      ? listNext(key(chosen.at(-1)), head)
      : null;
  return value(chosen, next);
}
function inventoryHead(kind, org, member, identities) {
  return H("selection", {
    kind,
    orgId: org,
    actorId: member.userId,
    role: member.role,
    programIds: [...member.programIds].sort(),
    membershipSha256: member.membershipSha256 ?? null,
    identities,
  });
}
function evidenceScope(member, e) {
  requireLearningScope(
    member,
    e.pin.moduleId === "programs" ? e.pin.recordId : e.snapshot.data.programId,
  );
}
async function authorizeRecords(c, org, member, ids) {
  if (!ids.length) return;
  const rows = (
    await c.query(
      "SELECT * FROM os_records WHERE org_id=$1 AND id=ANY($2::text[])",
      [org, [...new Set(ids)].sort()],
    )
  ).rows;
  for (const raw of rows) {
    const record = rowRecord(raw);
    if (!inScope(record, member)) learningUnavailable();
    requirePermission(record.moduleId, member, "read");
  }
}
async function authorizeBinding(c, org, member, binding, inventory) {
  requireLearningScope(member, binding.programId);
  const proofs = new Set();
  for (const event of binding.events) {
    requireLearningScope(member, event.programId);
    for (const pin of learningEventRecordPins(event))
      proofs.add(learningCanonical(pin));
  }
  for (const e of inventory.approvedEvidence)
    if (proofs.has(learningCanonical(e.pin))) evidenceScope(member, e);
  await authorizeRecords(c, org, member, [
    binding.programId,
    ...binding.events.flatMap((event) =>
      learningEventRecordPins(event).map((pin) => pin.recordId),
    ),
  ]);
}
const relatedRecordIds = (binding) =>
  [
    ...new Set(
      binding.events.flatMap((e) => {
        const p = e.payload;
        if (["mapped", "adopted"].includes(p.kind))
          return p.records.map((r) => r.recordId);
        if (["measured", "corrected", "decided"].includes(p.kind))
          return [p.record.recordId];
        return [];
      }),
    ),
  ].sort();
async function currentResolution(c, org, id, member) {
  try {
    return await resolveLearningApproval(c, org, id, member, {
      allowUnavailable: true,
    });
  } catch (error) {
    if (error.status === 404 && error.code === "learning_unavailable")
      return learningResolution(id, null);
    throw error;
  }
}
async function bindingContext(c, org, member, binding, inventory, cursor) {
  requireLearningMember(member, { source: true });
  await authorizeBinding(c, org, member, binding, inventory);
  const summary = await learningBindingSummary(c, org, binding),
    source = currentLearningSource(inventory, binding),
    mapping = binding.mappingEvent,
    program = await currentResolution(c, org, binding.programId, member);
  if (
    program.record &&
    H("data", program.record.data) !== mapping.payload.program.dataSha256
  ) {
    program.pin = null;
    program.evidence = null;
    program.eligibility = {
      eligible: false,
      code: "program-data-changed",
      message:
        "The program changed after mapping. Inspect it and make a new explicit mapping.",
    };
  }
  const ids = relatedRecordIds(binding),
    head = inventoryHead("context", org, member, [binding.head]),
    prior = listCursor(cursor, head);
  if (prior && !ids.includes(prior.lastId)) stale();
  const remaining = ids.filter((id) => !prior || cmp(id, prior.lastId) > 0),
    records = [];
  const value = (rows, nextCursor) => ({
    binding: summary,
    mapping,
    source,
    program,
    records: rows,
    nextCursor,
  });
  if (!fits(value([], null))) oversized();
  for (const id of remaining) {
    if (records.length === PAGE) break;
    const item = await currentResolution(c, org, id, member),
      candidate = [...records, item],
      next = remaining.length > candidate.length ? listNext(id, head) : null;
    if (!fits(value(candidate, next))) {
      if (!records.length) oversized();
      break;
    }
    records.push(item);
  }
  return response(
    value(
      records,
      remaining.length > records.length
        ? listNext(records.at(-1).recordId, head)
        : null,
    ),
  );
}

async function recoveredHistory(c, org, member) {
  requireAdmin(member);
  requireLearningMember(member, { source: true });
  const inventory = await loadLearningInventory(c, org, {
    recoveredOnly: true,
  });
  for (const binding of inventory.bindings)
    await authorizeBinding(c, org, member, binding, inventory);
  const rows = (
    await c.query(
      "SELECT * FROM os_learning_history WHERE org_id=$1 AND origin_mode='recovered' AND row_kind='recovered-report' ORDER BY id LIMIT 21",
      [org],
    )
  ).rows;
  if (rows.length > 20) oversized();
  const reports = [];
  for (const row of rows) {
    const r = row.payload;
    if (
      row.origin_mode !== "recovered" ||
      row.row_kind !== "recovered-report" ||
      row.receipt !== null ||
      row.id !== r?.checksum ||
      row.origin_org_id !== r?.orgId ||
      row.program_id !== r?.manifest?.programId ||
      row.binding_id !== null ||
      row.sequence !== null ||
      row.source_version !== null
    )
      fail(
        422,
        "learning_history",
        "The retained recovered report identity and bytes differ.",
      );
    reports.push(r);
  }
  reports.sort((a, b) => cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id));
  const history = validateLearningBackup({
    format: "charitology-learning-backup",
    version: 1,
    method: "learning-review-v1",
    sources: [...inventory.sources].sort(
      (a, b) =>
        cmp(a.originOrgId, b.originOrgId) ||
        cmp(a.bindingId, b.bindingId) ||
        a.sourceVersion - b.sourceVersion,
    ),
    approvedEvidence: [...inventory.approvedEvidence].sort((a, b) =>
      cmp(a.sha256, b.sha256),
    ),
    events: [...inventory.events].sort(
      (a, b) =>
        cmp(a.originOrgId, b.originOrgId) ||
        cmp(a.bindingId, b.bindingId) ||
        a.sequence - b.sequence,
    ),
    reports,
  });
  for (const proof of history.approvedEvidence) evidenceScope(member, proof);
  for (const report of history.reports) {
    requireLearningScope(member, report.manifest.programId);
    for (const proof of report.approvedEvidence) evidenceScope(member, proof);
    await authorizeRecords(
      c,
      org,
      member,
      report.approvedEvidence.map((p) => p.pin.recordId),
    );
  }
  return { inventory, history };
}

/** `tail` is the suffix after /learning/. The caller invokes this only for GET. */
export async function learningReadRoute({ c, org, member, tail, url }) {
  if (typeof tail !== "string" || !(url instanceof URL)) unavailable();
  learningId(org);
  requireLearningMember(member);
  if (tail === "bindings") {
    const cursor = queryCursor(url),
      inventory = await loadLearningInventory(c, org),
      bindings = inventory.bindings
        .filter(
          (b) =>
            b.originOrgId === org &&
            inventory.modes.get(b.events[0].sha256) === "live" &&
            (!member.programIds.length ||
              member.programIds.includes(b.programId)),
        )
        .sort((a, b) => cmp(a.bindingId, b.bindingId));
    const summaries = [];
    for (const b of bindings)
      summaries.push(await learningBindingSummary(c, org, b));
    const head = inventoryHead(
      "bindings",
      org,
      member,
      bindings.map((b) => b.head),
    );
    return response(
      page(summaries, {
        cursor,
        head,
        key: (x) => x.bindingId,
        value: (bindings, nextCursor) => ({ bindings, nextCursor }),
      }),
    );
  }
  let match = tail.match(/^bindings\/([A-Za-z0-9_-]{1,100})(\/context)?$/);
  if (match) {
    const cursor = queryCursor(url);
    requireLearningMember(member, { source: true });
    const inventory = await loadLearningInventory(c, org),
      binding = learningBinding(inventory, org, match[1]);
    if (match[2])
      return bindingContext(c, org, member, binding, inventory, cursor);
    await authorizeBinding(c, org, member, binding, inventory);
    const parsed = historyCursor(cursor, binding),
      before = parsed?.beforeSequence ?? binding.head.sequence + 1;
    if (
      before > binding.head.sequence + 1 ||
      (!binding.events.some((e) => e.sequence === before - 1) && before !== 1)
    )
      stale();
    const remaining = binding.events
        .filter((e) => e.sequence < before)
        .sort((a, b) => b.sequence - a.sequence),
      events = remaining.slice(0, PAGE),
      nextCursor =
        remaining.length > events.length
          ? eventNext(binding, events.at(-1).sequence)
          : null;
    return response({
      binding: await learningBindingSummary(c, org, binding),
      events,
      nextCursor,
    });
  }
  match = tail.match(/^records\/([A-Za-z0-9_-]{1,100})\/approval$/);
  if (match) {
    learningQuery(url, []);
    return response({
      resolution: await resolveLearningApproval(c, org, match[1], member),
    });
  }
  if (tail === "reports") {
    const cursor = queryCursor(url);
    requireLearningMember(member, { report: true });
    const rows = (
      await c.query(
        "SELECT id FROM os_reports WHERE org_id=$1 AND (payload->>'kind'='learning-review' OR payload->>'methodVersion' LIKE 'learning-%') ORDER BY id LIMIT 21",
        [org],
      )
    ).rows;
    if (rows.length > 20) oversized();
    const reports = [];
    for (const row of rows) {
      try {
        const report = await readLearningReport(c, { org, id: row.id, member });
        reports.push({
          id: report.id,
          title: report.title,
          checksum: report.checksum,
          createdAt: report.createdAt,
          programId: report.manifest.programId,
          sourceDigest: report.selection.sourceDigest,
          supersedesReportId: report.supersedes?.reportId ?? null,
        });
      } catch (error) {
        if (error.status === 404 && error.code === "learning_unavailable")
          continue;
        throw error;
      }
    }
    reports.sort((a, b) => cmp(a.id, b.id));
    const head = inventoryHead(
      "reports",
      org,
      member,
      reports.map((r) => ({ id: r.id, checksum: r.checksum })),
    );
    return response(
      page(reports, {
        cursor,
        head,
        key: (x) => x.id,
        value: (reports, nextCursor) => ({ reports, nextCursor }),
      }),
    );
  }
  match = tail.match(/^reports\/([A-Za-z0-9_-]{1,100})(\/export)?$/);
  if (match) {
    learningQuery(url, []);
    const report = await readLearningReport(c, { org, id: match[1], member });
    return match[2]
      ? rawResponse(report, `charitology-learning-report-${report.id}.json`)
      : response({ report }, MAX + 8192);
  }
  if (tail === "recovered") {
    const cursor = queryCursor(url);
    requireAdmin(member);
    requireLearningMember(member, { source: true });
    const inventory = await loadLearningInventory(c, org, {
        recoveredOnly: true,
      }),
      bindings = inventory.bindings
        .filter(
          (b) =>
            !member.programIds.length ||
            member.programIds.includes(b.programId),
        )
        .sort((a, b) => cmp(a.head.eventSha256, b.head.eventSha256)),
      summaries = [];
    for (const b of bindings)
      summaries.push(await learningBindingSummary(c, org, b, "recovered"));
    const head = inventoryHead(
      "recovered",
      org,
      member,
      bindings.map((b) => b.head),
    );
    return response(
      page(summaries, {
        cursor,
        head,
        key: (x) => x.head.eventSha256,
        value: (bindings, nextCursor) => ({ bindings, nextCursor }),
      }),
    );
  }
  match = tail.match(/^recovered\/([a-f0-9]{64})$/);
  if (match) {
    learningQuery(url, []);
    const { history } = await recoveredHistory(c, org, member);
    return response(
      selectRecoveredLearningHistory(history, match[1]),
      64 * 1024 * 1024,
    );
  }
  learningQuery(url, []);
  return null;
}
