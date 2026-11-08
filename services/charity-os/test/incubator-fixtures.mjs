/** Explicitly fictional pure fixtures. No database/session/provider or operating claim. */
import { inspectIncubatorNative, makeIncubatorSourceCapture, INCUBATOR_ADAPTER, sourcePin } from '../lib/incubator-native.mjs';
import { compileIncubatorCandidates, makeIncubatorEvent, makeIncubatorReceipt } from '../lib/incubator-bridge-model.mjs';
import { incubatorHash as H } from '../lib/incubator-bridge-json.mjs';
import { validateRecord } from '../lib/modules.mjs';
export const AT = '2026-11-07T00:00:00.000Z';
export const clone = value => structuredClone(value);
export const encode = value => new TextEncoder().encode(JSON.stringify(value));
export const selection = { projectId: 'native-project', milestoneId: 'native-milestone' };
export const nativeRow = (id, kind = 'projects') => ({ id, values: kind === 'projects' ? { title: 'Same visible code', gap: 'Unknown gap', model: 'A hypothesis, not a result.', status: 'Closed', roles: 'Role prose, not an account.', governance: 'No consent or operation granted.', date: '' } : { title: 'Same visible code', project: 'A deliberately unmatched free-text reference', acceptance: 'Proposed acceptance evidence', owner: 'Not an account', date: '', status: 'Accepted locally', next: 'Review before operation.' } });
export function nativeFixture() { return { version: 1, program: 'charity-incubator', updated: 'November 7, 2026', context: { name: 'Fictional cycle', scope: '', period: '', authority: '', privacy: '' }, records: { gaps: [], projects: [nativeRow(selection.projectId)], experiments: [], milestones: [nativeRow(selection.milestoneId, 'milestones')], readiness: [] } }; }
export const mapping = { project: { title: '  Authored project  ', deliverable: null }, milestone: { title: 'Authored milestone', deliverable: '  Review the proposal.\n  ' }, relationship: { kind: 'milestone-of-selected-project', confirmed: true, reason: 'The user deliberately selected both rows despite unmatched source reference.' } };
export function programRecord(orgId = 'org-a', id = 'program-a') { return { id, orgId, moduleId: 'programs', data: validateRecord('programs', { title: 'Fictional unapproved program', kind: 'program', evidence: null }, { status: 'draft', records: [] }), status: 'draft', revision: 1, approval: null }; }
export function sourceFixture({ native = nativeFixture(), org = 'org-a', binding = 'binding-a', version = 1, previous = null, at = AT } = {}) { return makeIncubatorSourceCapture(inspectIncubatorNative(encode(native), { adapter: INCUBATOR_ADAPTER, selection }), { originOrgId: org, bindingId: binding, sourceVersion: version, previousNativeSource: previous, preparedAt: at }); }
export function eventFixture(source, { org = 'org-a', binding = 'binding-a', sequence = 1, previous = null, operation = 'copy', recoveredHead = null, suffix = 'one', authored = mapping, at = AT } = {}) {
  const program = programRecord(org), actor = 'acting-member';
  const candidates = compileIncubatorCandidates({ orgId: org, actorId: actor, programId: program.id, projectId: 'project-' + suffix, milestoneId: 'milestone-' + suffix, mapping: authored, records: [program] });
  return makeIncubatorEvent({ originOrgId: org, bindingId: binding, sequence, previous, preparedAt: at, actorId: actor, program: { recordId: program.id, revision: program.revision, dataSha256: H('program-data', program.data) }, operation, source: sourcePin(source), recoveredHead, mapping: authored, candidates });
}
export function receiptFixture(event, suffix = 'one') { return makeIncubatorReceipt({ operation: event.operation, commandHash: H('command', suffix), requestHash: H('request', suffix), actorBindingHash: H('actor-binding', suffix), actorId: event.actorId, sessionSha256: H('session', suffix), membershipSha256: H('membership', suffix), memberCreatedAtExact: '2026-11-07T00:00:00.000001Z', restoreEpochSha256: H('restore-epoch', suffix), previewId: 'preview-' + suffix, reviewSha256: H('review', suffix), acceptedAt: event.preparedAt }, event); }
export function entry(event, mode = 'live', suffix = 'one') { return { event, originMode: mode, acceptedReceipt: receiptFixture(event, suffix) }; }
