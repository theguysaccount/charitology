/** Exactly one existing native producer. Complete admission precedes any selection. */
import { parseRemainingRecordBackup, remainingRecordBackup } from '../../../src/lib/client/remaining-record-recovery-formats';
import { incubatorBytes, incubatorFail, incubatorFreeze, incubatorOwned, incubatorObject, incubatorId, incubatorRawHash, incubatorRepresentable, parseIncubatorJSON, INCUBATOR_LIMITS } from './incubator-bridge-json.mjs';
const KEY = 'charitology.partner-workspace-v1.charity-incubator' as const;
const ADAPTER = 'incubator-project-milestone-native-v1';
function complete(bytes: Uint8Array, adapter: string): any {
  if (adapter !== ADAPTER) incubatorFail('incubator_adapter', 'Choose the supported Incubator native export.');
  const owned = incubatorBytes(bytes, INCUBATOR_LIMITS.nativeBytes);
  const parsed = parseIncubatorJSON(owned, INCUBATOR_LIMITS.nativeBytes, { nativeStrings: true });
  try { parseRemainingRecordBackup(owned, KEY); } catch { incubatorFail('incubator_native', 'Choose a complete valid native Incubator v1 export.'); }
  return parsed;
}
function selectionValue(value: any) {
  const v = incubatorOwned(value, { bytes: 1024 }); incubatorObject(v, ['projectId', 'milestoneId']);
  incubatorId(v.projectId, 'selection.projectId'); incubatorId(v.milestoneId, 'selection.milestoneId');
  if (v.projectId === v.milestoneId) incubatorFail('incubator_selection', 'Choose two distinct saved row IDs.');
  return v;
}
function representable(value: any, field = 'selected') {
  if (typeof value === 'string' && !incubatorRepresentable(value)) incubatorFail('incubator_native_text_unsupported', 'Valid native source; this selected text cannot be retained by PostgreSQL. The original file was not changed.', field);
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) representable(v, field + '.' + k);
}
export function listIncubatorNativeSelections(bytes: Uint8Array, choice: any = { adapter: ADAPTER }) {
  const c = incubatorOwned(choice, { bytes: 1024 }); incubatorObject(c, ['adapter']);
  const v = complete(bytes, c.adapter);
  // Listing does not assign a relationship or apply hosted selected-string restrictions.
  return incubatorFreeze({ projects: v.records.projects.map((r: any) => ({ id: r.id, title: r.values.title })), milestones: v.records.milestones.map((r: any) => ({ id: r.id, title: r.values.title, projectReference: r.values.project })) });
}
export function validateIncubatorSelectedNative(selection: any, selected: any) {
  const choice = selectionValue(selection);
  const v = incubatorOwned(selected, { bytes: INCUBATOR_LIMITS.selectedBytes, nativeStrings: true });
  incubatorObject(v, ['version','program','updated','context','project','milestone']);
  if (v.project?.id !== choice.projectId || v.milestone?.id !== choice.milestoneId) incubatorFail('incubator_selection', 'The selected native identities differ.');
  representable(v);
  const native = { version: v.version, program: v.program, updated: v.updated, context: v.context, records: { gaps: [], projects: [v.project], experiments: [], milestones: [v.milestone], readiness: [] } };
  try { parseRemainingRecordBackup(remainingRecordBackup(KEY, native), KEY); } catch { incubatorFail('incubator_native', 'Retained selection differs from the native schema.'); }
  return incubatorOwned(v, { bytes: INCUBATOR_LIMITS.selectedBytes });
}
export function inspectIncubatorNativeValue(bytes: Uint8Array, input: any) {
  const c = incubatorOwned(input, { bytes: 2048 }); incubatorObject(c, ['adapter','selection']);
  const adapter = c.adapter, owned = incubatorBytes(bytes, INCUBATOR_LIMITS.nativeBytes), originalSha256 = incubatorRawHash(owned);
  const v = complete(owned, adapter), choice = selectionValue(c.selection);
  const project = v.records.projects.find((r: any) => r.id === choice.projectId), milestone = v.records.milestones.find((r: any) => r.id === choice.milestoneId);
  if (!project || !milestone) incubatorFail('incubator_selection', 'Choose one saved project and one saved milestone.');
  const selected = validateIncubatorSelectedNative(choice, { version: v.version, program: v.program, updated: v.updated, context: v.context, project, milestone });
  return incubatorOwned({ adapter, selection: choice, selected, originalBytes: owned.length, originalSha256 }, { bytes: INCUBATOR_LIMITS.sourceBytes });
}
