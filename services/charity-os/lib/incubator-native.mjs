/** Exact selected provenance over the independently versioned native admission. */
import admission from './incubator-native-manifest.json' with { type: 'json' };
import { listIncubatorNativeSelections as list, inspectIncubatorNativeValue, validateIncubatorSelectedNative } from './incubator-native-admission.mjs';
import { IncubatorError, INCUBATOR_LIMITS as L, incubatorOwned as own, incubatorObject as obj, incubatorEnum as en, incubatorNumber as num, incubatorId as id, incubatorHashValue as hash, incubatorInstant as instant, incubatorHash as H, incubatorSeal as seal, incubatorCheckedHash as checked, incubatorFreeze as freeze, incubatorFail as fail } from './incubator-bridge-json.mjs';
export const INCUBATOR_ADAPTER = 'incubator-project-milestone-native-v1';
export const INCUBATOR_METHOD = 'incubator-project-milestone-v1';
export const INCUBATOR_NATIVE_REGISTRY = freeze({ format: 'charitology-incubator-native-registry', version: 1, adapter: INCUBATOR_ADAPTER, method: INCUBATOR_METHOD, key: 'charitology.partner-workspace-v1.charity-incubator', composedAdapter: 'partner-charity-incubator-v1', definitionSha256: 'eded5ab6727d9def42321ff1551fa22329f2281863ffdb60bb95a6efde697656', selection: 'one-project-and-one-milestone', retainedStringPolicy: 'postgres-jsonb-selected-scalars-v1', admission });
// This literal was obtained from the real checked bundle/complete source manifest.
// Version1 cannot silently track future producer edits.
export const INCUBATOR_NATIVE_REGISTRY_SHA256 = '9f7b99ebf552b116e33d8dda78bb463bb4dfd09da9da5cec2fa888fc690ff4bc';
if (H('registry', INCUBATOR_NATIVE_REGISTRY) !== INCUBATOR_NATIVE_REGISTRY_SHA256) throw Error('Incubator v1 native interpretation changed; introduce an explicit new version before admitting data.');
function call(fn) { try { return fn(); } catch (e) { if (e instanceof IncubatorError) throw e; if (e?.name === 'IncubatorError' && /^incubator_[a-z_]+$/.test(e.code)) throw new IncubatorError(e.code, e.message, e.issues?.[0]?.field ?? '', e.status); fail('incubator_native', 'Choose the complete supported native Incubator export.'); } }
const inspections = new WeakSet();
export const listIncubatorNativeSelections = (bytes, choice) => call(() => list(bytes, choice));
export function inspectIncubatorNative(bytes, choice) { const v = call(() => inspectIncubatorNativeValue(bytes, choice)); inspections.add(v); return v; }
export function validateIncubatorSourcePin(value) {
  const v = own(value, { bytes: 2048 }); obj(v, ['originOrgId','bindingId','sourceVersion','sha256']); id(v.originOrgId); id(v.bindingId); num(v.sourceVersion, 1, L.nativeVersions); hash(v.sha256); return v;
}
export function validateIncubatorSourceCapture(value) {
  const v = own(value, { bytes: L.sourceBytes });
  obj(v, ['format','version','adapter','registrySha256','originOrgId','bindingId','sourceVersion','previousNativeSource','preparedAt','originalBytes','originalSha256','selection','selected','sha256']);
  en(v.format, ['charitology-incubator-source']); en(v.version, [1]); en(v.adapter, [INCUBATOR_ADAPTER]);
  if (v.registrySha256 !== INCUBATOR_NATIVE_REGISTRY_SHA256) fail('incubator_registry', 'Unsupported native interpretation.');
  id(v.originOrgId); id(v.bindingId); num(v.sourceVersion, 1, L.nativeVersions); instant(v.preparedAt); num(v.originalBytes, 1, L.nativeBytes); hash(v.originalSha256);
  call(() => validateIncubatorSelectedNative(v.selection, v.selected));
  if (v.sourceVersion === 1) { if (v.previousNativeSource !== null) fail('incubator_source_chain', 'The first native capture has no local native parent.'); }
  else { const p = validateIncubatorSourcePin(v.previousNativeSource); if (p.originOrgId !== v.originOrgId || p.bindingId !== v.bindingId || p.sourceVersion !== v.sourceVersion - 1) fail('incubator_source_chain', 'Native versions must form the exact local chain.'); }
  checked('source', v); return v;
}
export const sourcePin = source => { const s = validateIncubatorSourceCapture(source); return freeze({ originOrgId: s.originOrgId, bindingId: s.bindingId, sourceVersion: s.sourceVersion, sha256: s.sha256 }); };
export function makeIncubatorSourceCapture(inspection, settings) {
  if (!inspections.has(inspection)) fail('incubator_native', 'Capture requires an actual owned complete native inspection.');
  const c = own(settings, { bytes: 4096 }); obj(c, ['originOrgId','bindingId','sourceVersion','previousNativeSource','preparedAt']);
  return validateIncubatorSourceCapture(seal('source', { format: 'charitology-incubator-source', version: 1, registrySha256: INCUBATOR_NATIVE_REGISTRY_SHA256, ...inspection, ...c }));
}
