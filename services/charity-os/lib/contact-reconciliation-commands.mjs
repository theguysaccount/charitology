/** Caller owns one same-c tenant transaction/org lock. No nested transaction or inferred identity. */
import { isProxy } from "node:util/types";
import { id, hash, stable, fail } from "./security.mjs";
import { learningFreeze } from "./learning-transport.mjs";
import { validateGroupExactStamp } from "./participation-group-model.mjs";
import { validateRecord } from "./modules.mjs";
import { saveRecord, storePreview, commitPreview, audit, noteContactReconciliationReceiptReplay } from "./database.mjs";
import { checkWorkspaceExportCapacity } from "./workspace-backup.mjs";
import { currentContactReconciliationMember, readContactReconciliationContext, readContactReconciliationInverseContext } from "./contact-reconciliation-context.mjs";
import { planContactReconciliation } from "./contact-reconciliation-model.mjs";
import { makeContactReconciliationReport, planContactReconciliationReversal, planContactReconciliationInverseReview, makeContactReconciliationReportRow } from "./contact-reconciliation-report.mjs";
import { appendContactReconciliationReport, readContactReconciliationReport } from "./contact-reconciliation-store.mjs";
import { CONTACT_PREVIEW_KIND, makeContactReconciliationPreview, makeContactReconciliationReversePreview, validateContactReconciliationPreviewRow, makeContactReconciliationReceipt } from "./contact-reconciliation-preview.mjs";
import { contactRequestId, validateContactInspectRequest, validateContactPreviewRequest, validateContactReversePreviewRequest, validateContactCommitRequest } from "./contact-reconciliation-http.mjs";

const H = (kind, value) => hash({ method: "contact-reconciliation-command-v1", kind, value });
const contextHash = (kind, value) => hash({ method: "contact-reconciliation-context-v1", kind, value });
const same = (a, b) => stable(a) === stable(b), freeze = learningFreeze;
const refuse = (code = "contact_command_conflict", status = 409) => fail(status, code, "This contact command needs reconciliation. No automatic replacement command was made.");
const need = (v, code, status) => { if (!v) refuse(code, status); };
const stale = () => refuse("contact_command_stale");
function prop(v, key) {
  need(v && typeof v === "object" && !isProxy(v)); const d = Object.getOwnPropertyDescriptor(v, key);
  need(d?.enumerable && Object.hasOwn(d, "value")); return d.value;
}
function fields(v, keys) {
  need(v && typeof v === "object" && !isProxy(v) && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype);
  const names = Reflect.ownKeys(v); need(names.length === keys.length && names.every(k => typeof k === "string" && keys.includes(k)));
  return Object.fromEntries(keys.map(k => [k, prop(v, k)]));
}
function rows(result, max) {
  const v = prop(result, "rows"); need(v && !isProxy(v) && Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype);
  const d = Object.getOwnPropertyDescriptor(v, "length"); need(d && Object.hasOwn(d, "value") && Number.isSafeInteger(d.value) && d.value >= 0 && d.value <= max);
  const keys = Reflect.ownKeys(v); need(keys.length === d.value + 1 && keys.every(k => typeof k === "string" && (k === "length" || /^(0|[1-9][0-9]*)$/.test(k) && Number(k) < d.value)));
  return Array.from({ length: d.value }, (_, i) => prop(v, String(i)));
}
const args = input => { const v = fields(input, ["org", "session", "input"]); contactRequestId(v.org); return v; };
const result = (receipt, replayed) => freeze({ ...receipt.result, replayed });
const commandPins = (org, actorId, request) => ({ command: H("command", { org, actorId, commandKey: request.commandKey }), request: H("request", request) });
const rowText = v => {
  need(typeof v === "string" && Buffer.byteLength(v) <= 2097152);
  let parsed; try { parsed = JSON.parse(v); } catch { refuse(); } return parsed;
};
export const CONTACT_COMMAND_SQL = Object.freeze({
  lookup: `/*crm:command:lookup*/ SELECT to_jsonb(t)::text AS row_json,(t.expires_at>clock_timestamp()) AS current
FROM os_previews t WHERE t.org_id=$1 AND t.actor_id=$2 AND t.kind=$3
AND (t.id=$4 OR (t.committed_at IS NOT NULL AND t.payload->>'commandSha256'=$5)) ORDER BY t.id COLLATE "C" LIMIT 3`,
  originalReceipt: `/*crm:command:original-receipt*/ SELECT to_jsonb(t)::text AS row_json,(t.expires_at>clock_timestamp()) AS current
FROM os_previews t WHERE t.org_id=$1 AND t.kind=$2 AND t.committed_at IS NOT NULL AND t.payload#>>'{result,reportId}'=$3 ORDER BY t.id COLLATE "C" LIMIT 2`,
  previewTime: `/*crm:command:preview-time*/ SELECT to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS expires_exact
FROM os_previews WHERE org_id=$1 AND id=$2 AND actor_id=$3 AND kind=$4 AND committed_at IS NULL`,
  lockPair: `/*crm:command:lock-pair*/ SELECT to_jsonb(t)::text AS row_json,
to_char(t.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_exact,
to_char(t.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_exact,
to_char(t.deleted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS deleted_exact
FROM os_records t WHERE t.org_id=$1 AND t.id=ANY($2::text[]) ORDER BY t.id COLLATE "C" FOR UPDATE OF t`,
  owners: "/*crm:command:owners*/ SELECT user_id FROM os_members WHERE org_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id COLLATE \"C\" FOR SHARE",
  clock: `/*crm:command:clock*/ WITH processing AS MATERIALIZED (SELECT clock_timestamp() AS at)
SELECT to_char(at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at_exact FROM processing`,
  trash: "/*crm:command:trash*/ UPDATE os_records SET deleted_at=$4::timestamptz WHERE org_id=$1 AND id=$2 AND revision=$3 AND deleted_at IS NOT DISTINCT FROM $5::timestamptz",
  receipt: `/*crm:command:receipt*/ UPDATE os_previews SET payload=$5::jsonb,checksum=$6
WHERE org_id=$1 AND id=$2 AND actor_id=$3 AND kind=$4 AND committed_at IS NULL AND expires_at>clock_timestamp() AND checksum=$7 AND payload=$8::jsonb`,
});
function parsedPreviewEntry(raw) {
  const e = fields(raw, ["row_json", "current"]); need(typeof e.current === "boolean");
  const row = rowText(e.row_json), admitted = validateContactReconciliationPreviewRow(row);
  return { row, ...admitted, current: e.current };
}
async function lookup(c, org, auth, request, pins, write = false) {
  const found = rows(await c.query(CONTACT_COMMAND_SQL.lookup + (write ? " FOR UPDATE OF t" : ""), [org, auth.member.userId, CONTACT_PREVIEW_KIND, request.previewId, pins.command]), 3);
  need(found.length <= 2); const entries = found.map(parsedPreviewEntry); let pending = null, accepted = null;
  for (const e of entries) {
    need(e.row.org_id === org && e.row.actor_id === auth.member.userId && e.row.kind === CONTACT_PREVIEW_KIND);
    if (e.state === "committed") {
      need(e.row.id === request.previewId && e.payload.commandSha256 === pins.command && e.payload.requestSha256 === pins.request);
      if (!same(e.payload.authority, auth.authority)) stale(); need(!accepted); accepted = e;
    } else { need(e.row.id === request.previewId && !pending); pending = e; }
  }
  need(!(accepted && pending)); return { accepted, pending };
}
export async function acceptedContactReconciliationCommand(c, input) {
  const v = args(input), request = validateContactCommitRequest(v.input), auth = await currentContactReconciliationMember(c, { org: v.org, session: v.session });
  const pins = commandPins(v.org, auth.member.userId, request), found = await lookup(c, v.org, auth, request, pins);
  return found.accepted ? result(found.accepted.payload, true) : null;
}
export async function inspectContactReconciliation(c, input) {
  const v = args(input), request = validateContactInspectRequest(v.input);
  return freeze({ context: await readContactReconciliationContext(c, { org: v.org, session: v.session, ...request }) });
}
async function writer(c, v) { return currentContactReconciliationMember(c, { org: v.org, session: v.session }, { readOnly: false }); }
const common = (v, auth, context, reportId) => ({ orgId: v.org, actorId: auth.member.userId, reportId, authority: auth.authority,
  reviewedContextSha256: context.contextSha256, rowStamps: context.rowStamps });
async function persistPreview(c, v, auth, packet) {
  const previewId = id(); await storePreview(c, { org: v.org, previewId, actorId: auth.member.userId, kind: CONTACT_PREVIEW_KIND,
    payload: packet, checksum: hash(packet), baseRevision: packet.reviewedContextSha256 });
  const times = rows(await c.query(CONTACT_COMMAND_SQL.previewTime, [v.org, previewId, auth.member.userId, CONTACT_PREVIEW_KIND]), 1);
  need(times.length === 1); const expiresAt = fields(times[0], ["expires_exact"]).expires_exact; validateGroupExactStamp(expiresAt);
  return freeze({ previewId, expiresAt, review: packet, processingTime: "assigned-on-commit" });
}
export async function previewContactReconciliation(c, input) {
  const v = args(input), request = validateContactPreviewRequest(v.input), auth = await writer(c, v);
  const context = await readContactReconciliationContext(c, { org: v.org, session: v.session, leftId: request.leftId, rightId: request.rightId });
  if (!same(context.authority, auth.authority) || context.contextSha256 !== request.contextSha256) stale();
  const packet = makeContactReconciliationPreview({ ...common(v, auth, context, id()), input: { ...context.plannerContext, decision: request.decision } });
  return persistPreview(c, v, auth, packet);
}
async function originalProof(c, org, auth, reportId) {
  const report = await readContactReconciliationReport(c, { org, member: auth.member, id: reportId }), original = report.payload;
  need(original.originOrgId === org && original.operation === "merge" && report.id === reportId && report.checksum === original.sha256, "contact_command_stale");
  const found = rows(await c.query(CONTACT_COMMAND_SQL.originalReceipt, [org, CONTACT_PREVIEW_KIND, reportId]), 2); need(found.length === 1, "contact_command_stale");
  const e = parsedPreviewEntry(found[0]); need(e.state === "committed" && e.row.org_id === org, "contact_command_stale");
  const r = e.payload;
  need(r.result.operation === "merge" && r.result.reportId === original.reportId && r.result.reportSha256 === original.sha256 &&
    same(r.result.recordIds, original.changes.map(change => change.after.id)) && r.acceptedAtExact === original.recordedAtExact &&
    r.authority.restoreEpochSha256 === auth.authority.restoreEpochSha256, "contact_command_stale");
  return { original, receiptPin: { previewId: e.row.id, actorId: e.row.actor_id, commandSha256: r.commandSha256,
    reportId: original.reportId, reportSha256: original.sha256, restoreEpochSha256: r.authority.restoreEpochSha256 } };
}
function withoutOriginalReport(context, original) {
  const pair = context.inverseContext.pair, ids = new Set(pair.map(r => r.id));
  const candidates = context.reportDependencies.filter(d => d.reportId === original.reportId && d.checksum === original.sha256);
  need(candidates.length === 1, "contact_command_stale"); const dependency = candidates[0];
  need(dependency.classification === "frozen-report" && dependency.referenceId === contextHash("reference-id", { table: "os_reports", key: original.reportId }) &&
    Array.isArray(dependency.contactIds) && dependency.contactIds.length > 0 && new Set(dependency.contactIds).size === dependency.contactIds.length && dependency.contactIds.every(x => ids.has(x)), "contact_command_stale");
  const matching = context.inverseContext.references.filter(r => r.id === dependency.referenceId);
  need(matching.length === dependency.contactIds.length && matching.every(r => r.family === "immutable-history" && dependency.contactIds.includes(r.contactId)), "contact_command_stale");
  return { ...context.inverseContext, references: context.inverseContext.references.filter(r => r.id !== dependency.referenceId) };
}
async function reverseContext(c, v, auth, reportId) {
  const proof = await originalProof(c, v.org, auth, reportId), ids = proof.original.changes.map(change => change.after.id);
  const context = await readContactReconciliationInverseContext(c, { org: v.org, session: v.session, leftId: ids[0], rightId: ids[1] });
  if (!same(context.authority, auth.authority)) stale();
  return { ...proof, context, current: withoutOriginalReport(context, proof.original) };
}
export async function previewContactReconciliationReversal(c, input) {
  const v = args(input), request = validateContactReversePreviewRequest(v.input), auth = await writer(c, v), s = await reverseContext(c, v, auth, request.reportId);
  const packet = makeContactReconciliationReversePreview({ ...common(v, auth, s.context, id()), original: s.original, receiptPin: s.receiptPin, current: s.current });
  return persistPreview(c, v, auth, packet);
}
async function currentReview(c, v, auth, packet) {
  let context, meaningful, current;
  if (packet.operation === "reverse") {
    const s = await reverseContext(c, v, auth, packet.review.original.reportId); context = s.context; current = s.current;
    if (!same(s.receiptPin, packet.review.receiptPin)) stale();
    try { meaningful = planContactReconciliationInverseReview({ original: s.original, current }); }
    catch (e) { if (e?.code === "contact_report_stale" || e?.code === "contact_report_context") stale(); throw e; }
  } else {
    const pair = packet.review.input.pair;
    context = await readContactReconciliationContext(c, { org: v.org, session: v.session, leftId: pair[0].id, rightId: pair[1].id });
    current = { ...context.plannerContext, decision: packet.review.input.decision }; meaningful = planContactReconciliation(current);
  }
  if (!same(context.authority, auth.authority) || !same(context.rowStamps, packet.rowStamps) || !same(meaningful, packet.review.plan)) stale();
  return { context, current };
}
async function lockPair(c, org, context, pair, verifyOwners) {
  const ids = pair.map(r => r.id), locked = rows(await c.query(CONTACT_COMMAND_SQL.lockPair, [org, [...ids].sort()]), 2); if (locked.length !== 2) stale();
  const byId = new Map();
  for (const entry of locked) {
    const e = fields(entry, ["row_json", "created_exact", "updated_exact", "deleted_exact"]), raw = rowText(e.row_json);
    need(raw.org_id === org && raw.module_id === "contacts" && ids.includes(raw.id) && !byId.has(raw.id), "contact_command_stale");
    for (const t of [e.created_exact, e.updated_exact]) validateGroupExactStamp(t); if (e.deleted_exact !== null) validateGroupExactStamp(e.deleted_exact);
    const pin = { id: raw.id, createdAtExact: e.created_exact, updatedAtExact: e.updated_exact, deletedAtExact: e.deleted_exact,
      rowSha256: contextHash("row", { table: "os_records", value: raw }) };
    if (!same(pin, context.rowStamps.find(r => r.id === raw.id))) stale(); byId.set(raw.id, raw);
  }
  if (verifyOwners) {
    const owners = [...new Set([...byId.values()].map(r => contactRequestId(r.owner_id)))].sort();
    const currentOwners = rows(await c.query(CONTACT_COMMAND_SQL.owners, [org, owners]), 2).map(r => fields(r, ["user_id"]).user_id).sort();
    need(same(currentOwners, owners), "owner", 422);
  }
  return byId;
}
async function processingTime(c) {
  const values = rows(await c.query(CONTACT_COMMAND_SQL.clock, []), 1); need(values.length === 1); const at = fields(values[0], ["at_exact"]).at_exact; validateGroupExactStamp(at); return at;
}
async function applyChanges(c, org, auth, report, locked, organizations) {
  const recordContext = [...report.changes.map(change => change.after), ...organizations.map(o => ({ ...o, data: { kind: o.kind } }))];
  for (const change of report.changes) {
    const after = change.after, raw = locked.get(after.id); need(raw && after.revision === raw.revision + 1);
    const data = validateRecord("contacts", after.data, { orgId: org, recordId: after.id, status: after.status, records: recordContext, previous: change.before.data });
    need(same(data, after.data)); const operation = change.before.deletedAt !== null && after.deletedAt === null ? "restore" : after.deletedAt !== null ? "delete" : "save";
    await saveRecord(c, { ...after, data, ownerId: raw.owner_id, lastEditedBy: auth.member.userId, createdAt: raw.created_at, updatedAt: raw.updated_at }, { operation });
    const changed = await c.query(CONTACT_COMMAND_SQL.trash, [org, after.id, after.revision, after.deletedAt, change.before.deletedAt]); need(prop(changed, "rowCount") === 1);
  }
}
export async function commitContactReconciliation(c, input) {
  const v = args(input), request = validateContactCommitRequest(v.input), auth = await writer(c, v), pins = commandPins(v.org, auth.member.userId, request);
  const found = await lookup(c, v.org, auth, request, pins, true);
  if (found.accepted) { noteContactReconciliationReceiptReplay(c, v.org); return result(found.accepted.payload, true); }
  if (!found.pending || !found.pending.current) refuse("contact_preview_expired");
  const pending = found.pending, packet = pending.payload; if (!same(packet.authority, auth.authority)) stale();
  const s = await currentReview(c, v, auth, packet), pair = s.current.pair;
  const locked = await lockPair(c, v.org, s.context, pair, packet.operation !== "no-merge"), at = await processingTime(c);
  const report = packet.operation === "reverse" ? planContactReconciliationReversal({ original: packet.review.original, current: s.current, reportId: packet.reportId, recordedAtExact: at }) :
    makeContactReconciliationReport({ reportId: packet.reportId, recordedAtExact: at, input: s.current });
  await applyChanges(c, v.org, auth, report, locked, s.current.organizations);
  const row = makeContactReconciliationReportRow({ orgId: v.org, id: report.reportId, actorId: auth.member.userId, createdAtExact: at, payload: report });
  await appendContactReconciliationReport(c, { org: v.org, member: auth.member, row });
  need(await audit(c, v.org, auth.member.userId, "contact-reconciliation.recorded", null, { reportId: report.reportId, reportSha256: report.sha256, operation: report.operation }), "contact_command_audit");
  const receipt = makeContactReconciliationReceipt({ report, authority: auth.authority, keyHash: pins.command, requestHash: pins.request });
  const replaced = await c.query(CONTACT_COMMAND_SQL.receipt, [v.org, request.previewId, auth.member.userId, CONTACT_PREVIEW_KIND, JSON.stringify(receipt), hash(receipt), pending.row.checksum, JSON.stringify(packet)]);
  need(prop(replaced, "rowCount") === 1); await commitPreview(c, v.org, request.previewId); await checkWorkspaceExportCapacity(c, v.org);
  return result(receipt, false);
}
