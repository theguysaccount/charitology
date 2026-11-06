import { LIMITS, cloneJson, object, array, text, oneOf, integer, hash, id, equal, fail, hashValue, canonicalBytes, prettyBytes, parseJsonBytes } from './codec.mjs';
import { ROWS, validateRaw, validateContent, validateOrigin, validateHead, validateInstant } from './content.mjs';
export const LOCAL_KEY = 'charitology.model-bundles.v1';
export const SELECTED_LABEL = 'User-entered model; not measured or independently reviewed.';
export const SELECTED_OMISSION = 'Other versions, unrelated models and unfinished private writing are excluded.';
export const TEXT_FORM_KEYS = Object.freeze(['classification', 'title', 'purpose', 'programDescription',
  'populationDescription', 'populationGeography', 'populationEligibility', 'populationTimeHorizon',
  'periodLabel', 'periodFrom', 'periodTo', 'outcomeName', 'outcomeDefinition', 'outcomeMeasurement',
  'moneyPriceYear', 'moneyBasis', 'moneyInclusions', 'moneyExclusions', 'moneyAdjustment', 'independence',
  'chanceAsScale', 'counterfactual', 'discountRationale', 'harmsAndSpillovers', 'sourceDepthLimit', 'other', 'amendmentReason']);
export const JSON_FORM_KEYS = Object.freeze(['sources', 'sourceModel', ...ROWS.map(row => `${row}Basis`), 'discountBasis']);
export function validateEditorForm(value) {
  const v = cloneJson(value, { maxBytes: LIMITS.form });
  object(v, ['raw', 'text', 'json'], '$.form'); validateRaw(v.raw, { draft: true });
  object(v.text, TEXT_FORM_KEYS, '$.form.text'); object(v.json, JSON_FORM_KEYS, '$.form.json');
  for (const key of TEXT_FORM_KEYS) text(v.text[key], LIMITS.leaf, `$.form.text.${key}`);
  for (const key of JSON_FORM_KEYS) text(v.json[key], LIMITS.leaf, `$.form.json.${key}`);
  // Exact shape is 22 raw text leaves + 27 TextForm + 9 JsonForm, plus one parser selector.
  return v;
}
export function validateDraft(value) {
  const v = cloneJson(value, { maxBytes: LIMITS.backup });
  object(v, ['mode', 'modelId', 'expectedHead', 'origin', 'form', 'dirty'], '$.draft');
  oneOf(v.mode, ['new', 'amend', 'copy']); if (typeof v.dirty !== 'boolean') fail('draft-dirty');
  validateOrigin(v.origin); validateEditorForm(v.form);
  if (v.mode === 'amend') { id(v.modelId); validateHead(v.expectedHead); }
  else if (v.modelId !== null || v.expectedHead !== null) fail('draft-target');
  if (v.mode === 'new' && v.origin !== null || v.mode === 'copy' && v.origin === null) fail('draft-origin');
  return v;
}
const without = (value, key) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
export async function validateFrozenVersion(value) {
  const v = cloneJson(value, { maxBytes: LIMITS.selected });
  object(v, ['id', 'modelId', 'sequence', 'previous', 'recordedAt', 'amendmentReason', 'origin', 'content', 'contentHash', 'hash']);
  id(v.id); id(v.modelId); if (v.id === v.modelId) fail('owned-id-collision');
  integer(v.sequence, 1, LIMITS.versions); validateInstant(v.recordedAt); validateOrigin(v.origin);
  if (v.sequence === 1) { if (v.previous !== null || v.amendmentReason !== null) fail('root-version'); }
  else { validateHead(v.previous); if (v.previous.id === v.id) fail('version-cycle'); text(v.amendmentReason, 2000, '$.amendmentReason', true); }
  if (v.origin?.kind === 'local-version-copy' && (v.origin.sourceVersionId === v.id || v.origin.sourceModelId === v.modelId)) fail('copy-cycle');
  if (v.origin?.kind === 'selected-bundle-copy' && v.origin.sourceVersionId === v.id) fail('copy-cycle');
  await validateContent(v.content); hash(v.contentHash); hash(v.hash);
  if (v.contentHash !== await hashValue('content', v.content)) fail('content-hash');
  if (v.hash !== await hashValue('version', without(v, 'hash'))) fail('version-hash');
  return v;
}
async function knownEngine(engine) {
  // This fixed static module compares installed inert source bytes. It never dispatches supplied source.
  const { assertKnownEngine } = await import('./registry.mjs'); await assertKnownEngine(engine);
}
export async function validateSelected(value) {
  const v = cloneJson(value, { maxBytes: LIMITS.selected });
  object(v, ['format', 'schemaVersion', 'exportedAt', 'label', 'engine', 'modelVersion', 'omissions', 'checksum']);
  if (v.format !== 'charitology-cost-effectiveness-bundle' || v.schemaVersion !== 1 || v.label !== SELECTED_LABEL || !equal(v.omissions, [SELECTED_OMISSION])) fail('selected-envelope');
  validateInstant(v.exportedAt); hash(v.checksum);
  if (prettyBytes(v.engine, LIMITS.engine).byteLength > LIMITS.engine) fail('engine-byte-limit');
  await knownEngine(v.engine);
  const expectedPin = { id: v.engine.definition.id, version: v.engine.definition.version, definitionHash: v.engine.definitionHash };
  if (!v.modelVersion?.content?.enginePin || !equal(v.modelVersion.content.enginePin, expectedPin)) fail('engine-reference');
  await validateFrozenVersion(v.modelVersion);
  if (v.modelVersion.content.enginePin.definitionHash !== v.engine.definitionHash) fail('engine-reference');
  if (v.checksum !== await hashValue('selected', without(v, 'checksum'))) fail('selected-checksum');
  prettyBytes(v, LIMITS.selected); return v;
}
export async function parseSelected(bytes) { return validateSelected(parseJsonBytes(bytes, { maxBytes: LIMITS.selected })); }
export async function validateState(value) {
  const v = cloneJson(value, { maxBytes: LIMITS.backup });
  object(v, ['format', 'schemaVersion', 'id', 'revision', 'createdAt', 'updatedAt', 'engines', 'models', 'versions', 'imports', 'draft']);
  if (v.format !== 'charitology-model-bundles' || v.schemaVersion !== 1) fail('state-envelope');
  id(v.id); integer(v.revision, 1, Number.MAX_SAFE_INTEGER); validateInstant(v.createdAt); validateInstant(v.updatedAt);
  array(v.engines, 1); array(v.models, LIMITS.models); array(v.versions, LIMITS.versions); array(v.imports, LIMITS.receipts);
  let previousEngine = '';
  for (const engine of v.engines) {
    prettyBytes(engine, LIMITS.engine); await knownEngine(engine);
    if (engine.definitionHash <= previousEngine) fail('engine-order'); previousEngine = engine.definitionHash;
  }
  const owned = new Set([v.id]), models = new Map(), versions = new Map(), roots = new Map();
  let previousModel = '';
  for (const model of v.models) {
    object(model, ['id', 'title', 'currentVersionId']); id(model.id); id(model.currentVersionId); text(model.title, 120, '$.model.title', true);
    if (owned.has(model.id)) fail('owned-id-collision'); owned.add(model.id);
    if (model.id <= previousModel) fail('model-order'); previousModel = model.id; models.set(model.id, model);
  }
  let previousVersionModel = '', previousSequence = 0;
  const perModel = new Map();
  for (const version of v.versions) {
    if (!version?.content?.enginePin || !v.engines.some(engine => equal(version.content.enginePin,
      { id: engine.definition.id, version: engine.definition.version, definitionHash: engine.definitionHash }))) fail('engine-reference');
    await validateFrozenVersion(version);
    if (owned.has(version.id)) fail('owned-id-collision'); owned.add(version.id);
    if (!models.has(version.modelId)) fail('orphan-version');
    if (version.modelId < previousVersionModel || version.modelId === previousVersionModel && version.sequence <= previousSequence) fail('version-order');
    previousVersionModel = version.modelId; previousSequence = version.sequence;
    const history = perModel.get(version.modelId) ?? [];
    if (version.sequence !== history.length + 1) fail('noncontiguous-sequence');
    if (history.length) {
      const predecessor = history[history.length - 1];
      if (!equal(version.previous, { id: predecessor.id, hash: predecessor.hash })) fail('predecessor');
      if (!equal(version.origin, history[0].origin)) fail('amendment-origin');
    } else roots.set(version.modelId, version);
    if (!v.engines.some(engine => engine.definitionHash === version.content.enginePin.definitionHash)) fail('missing-engine');
    history.push(version); perModel.set(version.modelId, history); versions.set(version.id, version);
  }
  for (const model of v.models) {
    const history = perModel.get(model.id); if (!history?.length) fail('empty-model');
    const head = history[history.length - 1];
    if (head.id !== model.currentVersionId || head.content.title !== model.title) fail('model-head');
  }
  const edges = new Map();
  for (const root of roots.values()) if (root.origin?.kind === 'local-version-copy') {
    const origin = root.origin, source = versions.get(origin.sourceVersionId);
    if (!source || source.modelId !== origin.sourceModelId || source.hash !== origin.sourceVersionHash || source.contentHash !== origin.sourceContentHash) fail('local-copy-reference');
    edges.set(root.modelId, source.modelId);
  }
  for (const start of edges.keys()) {
    const seen = new Set(); let current = start;
    while (edges.has(current)) { if (seen.has(current)) fail('copy-cycle'); seen.add(current); current = edges.get(current); }
  }
  const incomingIds = new Set(); let previousReceipt = null;
  for (const receipt of v.imports) {
    object(receipt, ['sourceVersionId', 'sourceVersionHash', 'sourceContentHash', 'chosenFileSha256', 'localModelId', 'localVersionId']);
    for (const key of ['sourceVersionId', 'localModelId', 'localVersionId']) id(receipt[key]);
    for (const key of ['sourceVersionHash', 'sourceContentHash', 'chosenFileSha256']) hash(receipt[key]);
    if (incomingIds.has(receipt.sourceVersionId)) fail('duplicate-receipt'); incomingIds.add(receipt.sourceVersionId);
    if (previousReceipt && (receipt.sourceVersionId < previousReceipt.sourceVersionId || receipt.sourceVersionId === previousReceipt.sourceVersionId && receipt.sourceVersionHash <= previousReceipt.sourceVersionHash)) fail('receipt-order');
    previousReceipt = receipt;
    const root = roots.get(receipt.localModelId), origin = root?.origin;
    if (!root || root.id !== receipt.localVersionId || origin?.kind !== 'selected-bundle-copy') fail('receipt-root');
    for (const key of ['sourceVersionId', 'sourceVersionHash', 'sourceContentHash', 'chosenFileSha256']) if (origin[key] !== receipt[key]) fail('receipt-origin');
  }
  validateDraft(v.draft);
  if (v.draft.mode === 'amend') {
    const basis = versions.get(v.draft.expectedHead.id);
    if (!basis || basis.modelId !== v.draft.modelId || basis.hash !== v.draft.expectedHead.hash) fail('draft-basis');
    if (!equal(v.draft.origin, roots.get(v.draft.modelId).origin)) fail('draft-amendment-origin');
  }
  if (v.draft.origin?.kind === 'local-version-copy') {
    const origin = v.draft.origin, source = versions.get(origin.sourceVersionId);
    if (!source || source.modelId !== origin.sourceModelId || source.hash !== origin.sourceVersionHash || source.contentHash !== origin.sourceContentHash) fail('draft-local-copy-reference');
  }
  const incomingPins = new Map();
  for (const origin of [...roots.values()].map(root => root.origin).concat(v.draft.origin)) {
    if (origin?.kind !== 'selected-bundle-copy') continue;
    const pin = { version: origin.sourceVersionHash, content: origin.sourceContentHash };
    const retained = incomingPins.get(origin.sourceVersionId);
    if (retained && !equal(pin, retained)) fail('incoming-version-conflict');
    incomingPins.set(origin.sourceVersionId, pin);
  }
  // A future complete backup, rather than just state JSON, must always fit.
  prettyBytes({ format: 'charitology-model-bundles-backup', schemaVersion: 1, exportedAt: v.updatedAt,
    state: v, checksum: '0'.repeat(64) }, LIMITS.backup);
  return v;
}
export async function validateBackup(value) {
  const v = cloneJson(value, { maxBytes: LIMITS.backup });
  object(v, ['format', 'schemaVersion', 'exportedAt', 'state', 'checksum']);
  if (v.format !== 'charitology-model-bundles-backup' || v.schemaVersion !== 1) fail('backup-envelope');
  validateInstant(v.exportedAt); hash(v.checksum); await validateState(v.state);
  if (v.checksum !== await hashValue('backup', without(v, 'checksum'))) fail('backup-checksum');
  prettyBytes(v, LIMITS.backup); return v;
}
export async function parseBackup(bytes) { return (await validateBackup(parseJsonBytes(bytes, { maxBytes: LIMITS.backup }))).state; }
export async function makeBackup(state, exportedAt) {
  const checked = await validateState(state); validateInstant(exportedAt);
  const body = { format: 'charitology-model-bundles-backup', schemaVersion: 1, exportedAt, state: checked };
  const complete = { ...body, checksum: await hashValue('backup', body) };
  await validateBackup(complete); return prettyBytes(complete, LIMITS.backup);
}
export async function makeSelected(state, versionId, exportedAt) {
  const checked = await validateState(state); id(versionId); validateInstant(exportedAt);
  const version = checked.versions.find(version => version.id === versionId); if (!version) fail('missing-version');
  const engine = checked.engines.find(engine => engine.definitionHash === version.content.enginePin.definitionHash); if (!engine) fail('missing-engine');
  const body = { format: 'charitology-cost-effectiveness-bundle', schemaVersion: 1, exportedAt, label: SELECTED_LABEL,
    engine, modelVersion: version, omissions: [SELECTED_OMISSION] };
  const complete = { ...body, checksum: await hashValue('selected', body) };
  await validateSelected(complete); return prettyBytes(complete, LIMITS.selected);
}
/** An ordinary semantic write may append history, never reseal or delete retained history. */
export async function assertGraphExtension(before, after) {
  const oldSnapshot = cloneJson(before, { maxBytes: LIMITS.backup }), nextSnapshot = cloneJson(after, { maxBytes: LIMITS.backup });
  const old = await validateState(oldSnapshot), next = await validateState(nextSnapshot);
  if (old.id !== next.id || old.createdAt !== next.createdAt || next.revision !== old.revision + 1) fail('state-extension');
  for (const [field, key] of [['versions', 'id'], ['imports', 'sourceVersionId'], ['engines', 'definitionHash']]) {
    for (const retained of old[field]) {
      const current = next[field].find(value => value[key] === retained[key]);
      if (!current || !equal(retained, current)) fail('immutable-history');
    }
  }
  for (const model of old.models) if (!next.models.some(current => current.id === model.id)) fail('immutable-model');
  return next;
}
/** Count/byte facts use the actual admitted production representation. */
export function formSize(value) { const v = validateEditorForm(value); return { leaves: 58, canonicalBytes: canonicalBytes(v).byteLength }; }
