/** Current-authority report preparation. These helpers never persist a proposal. */
import { fail } from './security.mjs';
import { inScope, requirePermission } from './access.mjs';
import { rowRecord } from './database.mjs';
import { validateRecord, validateTransition } from './modules.mjs';
import { learningHash as H, learningSame as same, learningOwned as own, learningFreeze as freeze,
  learningId, learningInstant, learningNumber } from './learning-json.mjs';
import { validateLearningSelection, validateLearningFinalSelection, validateLearningManifest } from './learning-validation.mjs';
import { makeLearningEvent, workingPin } from './learning-model.mjs';
import { selectLearningReportClosure, learningSelectionDigest, makeLearningReport, validateLearningReport } from './learning-report-model.mjs';
import { requireLearningMember, requireLearningScope, requireLearningApproval, resolveLearningApproval,
  learningUnavailable, learningStale } from './learning-access.mjs';
import { learningBinding, requireLearningHead, currentLearningSource } from './learning-history.mjs';

const selectedPins = s => [s.program, s.protocol, ...s.definitions, ...s.observations, s.decision];
const sortedIds = values => [...new Set(values)].sort();
const invalid = () => fail(422, 'learning_report', 'Use one current learning mapping, its exact approved selection and a matching private manifest.');
const checkScope = (member, report) => {
  requireLearningScope(member, report.manifest.programId);
  for (const event of report.events) requireLearningScope(member, event.programId);
  for (const evidence of report.approvedEvidence)
    requireLearningScope(member, evidence.pin.moduleId === 'programs' ? evidence.pin.recordId : evidence.snapshot.data.programId);
};

function contextWithProofs(inventory, proofs, records, reports = []) {
  const evidence = new Map(inventory.approvedEvidence.map(value => [value.sha256, value]));
  for (const value of proofs) {
    const existing = evidence.get(value.sha256);
    if (existing && !same(existing, value)) invalid();
    evidence.set(value.sha256, value);
  }
  return { sources: inventory.sources, approvedEvidence: [...evidence.values()], events: inventory.events, records, reports };
}

async function currentSelection(c, { org, user, member, inventory, selection, manifestRevision }) {
  requireLearningMember(member, { report: true, write: ['reporting'] });
  learningId(org); learningId(user);
  if (member.userId !== user) fail(403, 'learning_actor', 'This report requires the currently authenticated workspace member.');
  const selected = validateLearningSelection(selection);
  if (selected.head.originOrgId !== org) learningStale();
  const binding = learningBinding(inventory, org, selected.head.bindingId);
  requireLearningScope(member, binding.programId);
  requireLearningHead(binding, selected.head);
  if (binding.mappingEvent.sha256 !== selected.mappingEventSha256 || !same(binding.source, selected.source)) learningStale();
  currentLearningSource(inventory, binding);
  const resolved = [];
  for (const pin of selectedPins(selected)) resolved.push(await requireLearningApproval(c, org, pin, member));
  if (H('data', resolved[0].record.data) !== binding.mappingEvent.payload.program.dataSha256) learningStale();
  const manifest = await resolveLearningApproval(c, org, selected.manifestRecordId, member);
  if (!manifest.record || manifest.record.moduleId !== 'reporting') invalid();
  const record = manifest.record;
  if (manifestRevision !== undefined) {
    learningNumber(manifestRevision, 1, 2147483647, 'manifestRevision');
    if (record.revision !== manifestRevision) learningStale();
  }
  if (!['draft', 'review', 'approved'].includes(record.status)) learningStale();
  const data = validateLearningManifest(record.data);
  if (data.programId !== binding.programId || !same(data.outcomeIds, selected.observations.map(pin => pin.recordId))) invalid();
  const recordIds = sortedIds([record.id, ...resolved.map(item => item.record.id), ...binding.measurements.map(item => item.record.recordId)]);
  const rows = (await c.query('SELECT * FROM os_records WHERE org_id=$1 AND id=ANY($2::text[])', [org, recordIds])).rows;
  const records = rows.map(row => ({ ...rowRecord(row), ...(row.deleted_at ? { deletedAt: row.deleted_at.toISOString() } : {}) }));
  for (const current of records) if (!inScope(current, member)) learningUnavailable();
  const normalized = validateRecord('reporting', data, { orgId: org, recordId: record.id, status: record.status, records, previous: data });
  if (!same(normalized, data)) invalid();
  let prior = null;
  if (data.supersedesReportId !== null) {
    prior = await readLearningReport(c, { org, id: data.supersedesReportId, member });
    if (prior.manifest.programId !== data.programId) invalid();
  }
  const context = contextWithProofs(inventory, resolved.map(item => item.evidence), records, prior ? [prior] : []);
  const closure = selectLearningReportClosure(selected, context);
  const sourceDigest = learningSelectionDigest({ selection: selected, sources: closure.sources, approvedEvidence: closure.approvedEvidence, manifest: data });
  // Check actual selected measurement periods before a report candidate exists.
  for (const pin of selected.observations) {
    const proof = resolved.find(item => same(item.pin, pin));
    if (proof.record.data.startDate < data.startDate || proof.record.data.endDate > data.endDate) invalid();
  }
  for (const proof of closure.approvedEvidence)
    requireLearningScope(member, proof.pin.moduleId === 'programs' ? proof.pin.recordId : proof.snapshot.data.programId);
  return { selected, binding, record, manifest, data, prior, resolved, context, closure, sourceDigest, recordIds };
}

export async function prepareLearningReport(c, args) {
  if (args.manifestRevision === undefined) invalid();
  const state = await currentSelection(c, args);
  const requiresSave = state.data.sourceDigest !== state.sourceDigest;
  return freeze({ sourceDigest: state.sourceDigest, selectionSha256: H('selection', state.selected), manifest: workingPin(state.record),
    requiresSave, requiresApproval: requiresSave || !state.manifest.eligibility.eligible, exclusions: state.closure.exclusions });
}

export async function previewLearningReport(c, { org, user, member, inventory, finalSelection, reportId, preparedAt }) {
  learningId(reportId); learningInstant(preparedAt);
  const selected = validateLearningFinalSelection(finalSelection);
  const state = await currentSelection(c, { org, user, member, inventory, selection: selected.selection, manifestRevision: selected.manifest.revision });
  if (!state.manifest.eligibility.eligible || !same(selected.manifest, state.manifest.pin) ||
    selected.sourceDigest !== state.sourceDigest || state.data.sourceDigest !== state.sourceDigest) learningStale();
  if (state.prior?.id === reportId) invalid();
  const context = contextWithProofs(inventory, [...state.resolved.map(item => item.evidence), state.manifest.evidence], state.context.records, state.context.reports);
  const supersedes = state.prior ? { reportId: state.prior.id, checksum: state.prior.checksum, reason: state.data.revisionReason } : null;
  const report = makeLearningReport({ id: reportId, orgId: org, title: state.data.title, createdBy: user,
    createdAt: preparedAt, selection: selected, manifest: state.data, supersedes }, context);
  checkScope(member, report);
  const payloadBytes = Number((await c.query('SELECT octet_length($1::jsonb::text) AS bytes', [JSON.stringify(report)])).rows[0]?.bytes);
  if (!Number.isSafeInteger(payloadBytes) || payloadBytes > 4194304)
    fail(422, 'learning_size', 'This complete learning report exceeds its 4 MiB retained representation bound.');
  validateTransition('reporting', state.record.status, 'frozen', { role: member.role, actorId: user,
    ownerId: state.record.lastEditedBy, approved: true, snapshotApproved: true });
  const transition = own(state.record);
  const frozenData = validateRecord('reporting', transition.data, { orgId: org, recordId: transition.id,
    status: 'frozen', records: state.context.records, previous: transition.data });
  const next = { ...transition, data: frozenData, status: 'frozen', revision: transition.revision + 1,
    approval: { ...transition.approval, revision: transition.revision + 1 } };
  next.snapshot = { id: next.id, orgId: next.orgId, moduleId: next.moduleId, data: next.data, status: next.status,
    ownerId: next.ownerId, revision: next.revision, createdAt: next.createdAt, updatedAt: next.updatedAt,
    files: transition.snapshot.files };
  const event = makeLearningEvent({ format: 'charitology-learning-event', version: 1, originOrgId: org,
    bindingId: state.binding.bindingId, sequence: state.binding.head.sequence + 1, previous: state.binding.head,
    actorId: user, recordedAt: preparedAt, programId: state.binding.programId,
    payload: { kind: 'report-frozen', selection: selected, reportId, reportChecksum: report.checksum, frozenManifest: workingPin(next) } });
  return freeze({ report, event, transition: next, approvedEvidence: [...state.resolved.map(item => item.evidence), state.manifest.evidence]
    .filter((proof, index, all) => all.findIndex(item => item.sha256 === proof.sha256) === index).sort((a, b) => a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0),
  recordIds: sortedIds([...state.recordIds, ...report.approvedEvidence.map(proof => proof.pin.recordId)]) });
}

/** Current permissions choose access to immutable report bytes, never old approval authority. */
export async function readLearningReport(c, { org, id, member }) {
  requireLearningMember(member, { report: true });
  learningId(org); learningId(id);
  const row = (await c.query('SELECT r.*,octet_length(payload::text) AS learning_payload_bytes FROM os_reports r WHERE org_id=$1 AND id=$2', [org, id])).rows[0];
  if (!row) learningUnavailable();
  const report = validateLearningReport(row.payload);
  if (row.org_id !== org || report.orgId !== org || row.id !== report.id || row.checksum !== report.checksum ||
    row.created_by !== report.createdBy || row.title !== report.title) learningUnavailable();
  if (!Number.isSafeInteger(Number(row.learning_payload_bytes)) || Number(row.learning_payload_bytes) > 4194304)
    fail(422, 'learning_size', 'This retained learning report exceeds its 4 MiB representation bound.');
  checkScope(member, report);
  const recordIds = sortedIds([...report.approvedEvidence.map(proof => proof.pin.recordId), ...report.exclusions.map(item => item.recordId)]);
  const rows = (await c.query('SELECT * FROM os_records WHERE org_id=$1 AND id=ANY($2::text[])', [org, recordIds])).rows;
  for (const raw of rows) {
    const record = rowRecord(raw);
    if (!inScope(record, member) || report.approvedEvidence.some(proof => proof.pin.recordId === record.id && proof.pin.moduleId !== record.moduleId)) learningUnavailable();
    requirePermission(record.moduleId, member, 'read');
    requirePermission(record.moduleId, member, 'export');
  }
  return report;
}
