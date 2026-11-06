import { LIMITS, cloneJson, object, id, hash, integer, equal, fail, hashValue, sha256Bytes, prettyBytes, snapshotBytes, canonicalJson } from './codec.mjs';
import { validateState, validateDraft, parseSelected, parseBackup, makeSelected, makeBackup, TEXT_FORM_KEYS, JSON_FORM_KEYS } from './graph.mjs';
import { ROWS, RUN_FIELDS, validateInstant, validateNumericalIssue, validateContent, compileEditorContent, editorFormFromContent, runFingerprint } from './content.mjs';
import { normalizeRaw, NumericalError } from './interpretations/v1/arithmetic.mjs';
import { knownEngine, knownEnginePin } from './registry.mjs';
import { createModelWorkerClientForPayload } from './worker-client.mjs';
import { createModelPayloadCoordinator } from './payload-lane.mjs';
const NOTICE = 'Only this exact reviewed local command is authorized.';
const ACK = 'Copy inputs to a new draft without a reproduction claim.';
const encoder = new TextEncoder();
const handle = () => Object.freeze({});
function jobBinding(job) {
  object(job, ['epoch', 'formGeneration', 'storeGeneration', 'isCurrent', 'signal']);
  integer(job.epoch, 1, Number.MAX_SAFE_INTEGER); integer(job.formGeneration, 0, Number.MAX_SAFE_INTEGER); integer(job.storeGeneration, 1, Number.MAX_SAFE_INTEGER);
  if (typeof job.isCurrent !== 'function' || !job.signal || typeof job.signal.aborted !== 'boolean') fail('invalid-job');
  const binding = { epoch: job.epoch, formGeneration: job.formGeneration, storeGeneration: job.storeGeneration };
  const signal = job.signal, check = job.isCurrent;
  return { job, binding, current() {
    try {
      const bound = () => !signal.aborted && job.signal === signal && job.isCurrent === check && job.epoch === binding.epoch
        && job.formGeneration === binding.formGeneration && job.storeGeneration === binding.storeGeneration;
      return bound() && check() === true && bound();
    }
    catch { return false; }
  } };
}
function ids(context) {
  validateInstant(context.now);
  for (const key of ['newModelId', 'newVersionId']) if (context[key] !== null) id(context[key]);
  if (!(context.sourceChecksums instanceof Map) || Object.getPrototypeOf(context.sourceChecksums) !== Map.prototype) fail('checksum-handles');
}
function commandSnapshot(command) {
  if (!command || typeof command !== 'object') fail('command');
  const descriptor = Object.getOwnPropertyDescriptor(command, 'kind'); if (!descriptor || !('value' in descriptor)) fail('command');
  const kind = descriptor.value;
  const keys = { 'save-draft': ['kind', 'draft'], freeze: ['kind', 'draft'], 'copy-reproduced': ['kind', 'selected', 'comparison'],
    'new-draft': ['kind', 'discardCurrentDraft'], 'amend-draft': ['kind', 'sourceModelId', 'source', 'discardCurrentDraft'],
    'copy-selected-draft': ['kind', 'selected', 'comparison', 'purpose', 'acknowledge'], 'copy-local-draft': ['kind', 'sourceModelId', 'source'],
    restore: ['kind', 'backup', 'discardLocal'], clear: ['kind', 'discardLocal'], undo: ['kind', 'undo'] }[kind];
  if (!keys) fail('command'); object(command, keys);
  const result = Object.fromEntries(keys.map(key => [key, command[key]]));
  if (kind === 'save-draft' || kind === 'freeze') result.draft = validateDraft(result.draft);
  if (kind === 'copy-local-draft' || kind === 'amend-draft') { id(result.sourceModelId); result.source = cloneJson(result.source); object(result.source, ['id', 'hash']); id(result.source.id); hash(result.source.hash); }
  if (kind === 'new-draft' || kind === 'amend-draft') if (result.discardCurrentDraft !== true) fail('discard-required');
  if (kind === 'restore' || kind === 'clear') if (result.discardLocal !== true) fail('discard-required');
  if (kind === 'copy-selected-draft' && (!['comparison-mismatch-or-refusal', 'intentional-new-branch'].includes(result.purpose) || result.acknowledge !== ACK)) fail('copy-acknowledgement');
  return result;
}
function bridge(client, payload) {
  let life = 1, selectionEpoch = 1, calculationEpoch = 1, disposed = false;
  const selections = new WeakMap(), backups = new WeakMap(), comparisons = new WeakMap(), prepared = new WeakMap(), undos = new WeakMap(), checksums = new WeakMap();
  const sourceChoices = new Map(), sourceHashEpoch = new Map(), copiedSources = new Map();
  function ownJob(job) { const base = jobBinding(job), capturedLife = life; return { ...base, current: () => capturedLife === life && base.current() }; }
  function calculationJob(job) { const owned = ownJob(job), epoch = calculationEpoch;
    return Object.freeze({ ...owned.binding, signal: job.signal, isCurrent: () => epoch === calculationEpoch && owned.current() }); }
  const currentLife = value => { if (disposed || value.life !== life) fail('stale'); };
  const check = owned => { if (disposed || !owned.current()) fail('stale'); };
  const awaitCurrent = async (promise, owned) => { const value = await promise; check(owned); return value; };
  function selected(value) {
    const found = selections.get(value); if (!found) fail('selected-handle'); currentLife(found);
    if (found.selectionEpoch !== selectionEpoch) fail('stale'); return found;
  }
  function comparison(value, selection = null) {
    const found = comparisons.get(value); if (!found) fail('comparison-handle'); currentLife(found); check(found.owned);
    if (selected(found.selected) !== found.selection || selection !== null && found.selected !== selection) fail('comparison-selection'); return found;
  }
  function fingerprintOrigin(selection, observation) {
    const v = selection.bundle.modelVersion;
    return cloneJson({ kind: 'selected-bundle-copy', sourceVersionId: v.id, sourceVersionHash: v.hash, sourceContentHash: v.contentHash,
      chosenFileSha256: selection.chosenFileSha256, observation });
  }
  function historicalSources(state, draft) {
    if (draft.mode === 'amend') return state.versions.find(version => version.id === draft.expectedHead.id)?.content.sources ?? [];
    if (draft.origin?.kind === 'local-version-copy') return state.versions.find(version => version.id === draft.origin.sourceVersionId)?.content.sources ?? [];
    if (draft.origin?.kind === 'selected-bundle-copy') return copiedSources.get(canonicalJson(draft.origin)) ?? [];
    return [];
  }
  function checkSourceClaims(content, historical, supplied) {
    for (const source of content.sources) {
      if (source.checksum?.kind !== 'local-bytes') continue;
      if (historical.some(old => old.id === source.id && equal(old.checksum, source.checksum))) continue;
      const token = supplied.get(source.id), found = checksums.get(token);
      if (!found || found.life !== life || sourceChoices.get(source.id) !== token || found.sourceId !== source.id || !equal(found.checksum, source.checksum)) fail('source-checksum-handle');
    }
  }
  function requireIds(state, context, model) {
    if (context.newVersionId === null || model && context.newModelId === null || !model && context.newModelId !== null) fail('new-id-required');
    const used = new Set([state.id, ...state.models.map(value => value.id), ...state.versions.map(value => value.id)]);
    if (used.has(context.newVersionId) || model && (used.has(context.newModelId) || context.newModelId === context.newVersionId)) fail('owned-id-collision');
  }
  async function sealVersion(body, owned) {
    const contentHash = await awaitCurrent(hashValue('content', body.content), owned);
    const value = { ...body, contentHash }; const versionHash = await awaitCurrent(hashValue('version', value), owned);
    return cloneJson({ ...value, hash: versionHash });
  }
  function baseCandidate(state, now) { return { ...cloneJson(state), revision: state.revision + 1, updatedAt: now }; }
  function sort(candidate) {
    candidate.models.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    candidate.versions.sort((a, b) => a.modelId < b.modelId ? -1 : a.modelId > b.modelId ? 1 : a.sequence - b.sequence);
    candidate.engines.sort((a, b) => a.definitionHash < b.definitionHash ? -1 : a.definitionHash > b.definitionHash ? 1 : 0);
    candidate.imports.sort((a, b) => a.sourceVersionId < b.sourceVersionId ? -1 : a.sourceVersionId > b.sourceVersionId ? 1 : a.sourceVersionHash < b.sourceVersionHash ? -1 : 1);
    return candidate;
  }
  async function appendNew(state, draft, content, context, owned, receipt = null) {
    requireIds(state, context, true);
    const version = await sealVersion({ id: context.newVersionId, modelId: context.newModelId, sequence: 1, previous: null,
      recordedAt: context.now, amendmentReason: null, origin: draft.origin, content }, owned);
    const candidate = baseCandidate(state, context.now);
    candidate.models = [...state.models, { id: version.modelId, title: content.title, currentVersionId: version.id }];
    candidate.versions = [...state.versions, version];
    candidate.engines = state.engines.length ? [...state.engines] : [knownEngine()];
    candidate.imports = receipt ? [...state.imports, { ...receipt, localModelId: version.modelId, localVersionId: version.id }] : [...state.imports];
    candidate.draft = { mode: 'amend', modelId: version.modelId, expectedHead: { id: version.id, hash: version.hash }, origin: draft.origin,
      form: draft.form ?? await awaitCurrent(editorFormFromContent(content), owned), dirty: false };
    return { candidate: sort(candidate), createdVersion: { id: version.id, hash: version.hash }, noop: false };
  }
  const rawApi = Object.freeze({
    async admitSelected(value) {
      const capturedLife = life, capturedSelection = selectionEpoch;
      const bytes = snapshotBytes(value), bundle = await parseSelected(bytes);
      if (disposed || life !== capturedLife || selectionEpoch !== capturedSelection) fail('stale');
      const chosenFileSha256 = await sha256Bytes(bytes);
      if (disposed || life !== capturedLife || selectionEpoch !== capturedSelection) fail('stale');
      const token = handle(); selections.set(token, { bundle, chosenFileSha256, bytes, life, selectionEpoch }); return token;
    },
    inspectSelected(value) { const record = selected(value); return cloneJson({ bundle: record.bundle, chosenFileSha256: record.chosenFileSha256, reproduction: 'not-checked-here' }); },
    async recalculate(value, job, lease, executionJob) {
      const record = selected(value), originalOwned = ownJob(job), owned = ownJob(executionJob); check(owned);
      const outcome = await awaitCurrent(client.runWithin(lease, { kind: 'normalized-run', input: record.bundle.modelVersion.content.input }, executionJob), owned);
      if (selected(value) !== record) fail('stale');
      const declared = await awaitCurrent(runFingerprint(record.bundle.modelVersion.content.run), owned);
      let observation, arrays = null, recalculated = null;
      if (outcome.kind === 'refused') observation = { kind: 'arithmetic-refusal', declared, recalculated: null, differences: [], issue: validateNumericalIssue(outcome.issue) };
      else if (outcome.kind === 'success') {
        if (!equal(outcome.enginePin, knownEnginePin()) || !equal(outcome.input, record.bundle.modelVersion.content.input)) fail('worker-result');
        recalculated = outcome.recorded; const fingerprint = await awaitCurrent(runFingerprint(recalculated), owned);
        const differences = RUN_FIELDS.filter(field => !equal(record.bundle.modelVersion.content.run[field], recalculated[field]));
        observation = { kind: differences.length ? 'mismatched' : 'matched', declared, recalculated: fingerprint, differences };
        if (!differences.length) arrays = { costs: outcome.costs.slice(), outcomes: outcome.outcomes.slice() };
      } else fail(outcome.kind === 'cancelled' ? 'stale' : 'worker-result');
      check(owned); const token = handle(); comparisons.set(token, { life, selected: value, selection: record, owned: originalOwned, observation: cloneJson(observation), arrays, recorded: recalculated }); return token;
    },
    inspectComparison(value) { return cloneJson(comparison(value).observation); },
    async admitBackup(value) {
      const captured = life, capturedSelection = selectionEpoch, bytes = snapshotBytes(value), state = await parseBackup(bytes);
      if (disposed || life !== captured || selectionEpoch !== capturedSelection) fail('stale'); const chosenFileSha256 = await sha256Bytes(bytes);
      if (disposed || life !== captured || selectionEpoch !== capturedSelection) fail('stale'); const token = handle(); backups.set(token, { life, state, bytes, chosenFileSha256, selectionEpoch }); return token;
    },
    parseBackup, makeSelected, makeBackup,
    async makeDraws(value) {
      const found = comparison(value); if (found.observation.kind !== 'matched' || !found.arrays) fail('matched-comparison-required');
      const version = found.selection.bundle.modelVersion;
      const body = { format: 'charitology-model-draws', schemaVersion: 1, versionId: version.id, versionHash: version.hash, enginePin: version.content.enginePin,
        inputHash: found.recorded.inputHash, costsSha256: found.recorded.costsSha256, outcomesSha256: found.recorded.outcomesSha256,
        costs: Array.from(found.arrays.costs, number => number === Infinity ? { kind: 'no-outcome' } : { kind: 'finite', value: number }),
        outcomes: Array.from(found.arrays.outcomes, number => ({ kind: 'finite', value: number })), notice: 'Arrays are separately sorted; paired simulation indices are absent.' };
      const checksum = await awaitCurrent(hashValue('draws', body), found.owned); comparison(value);
      return prettyBytes({ ...body, checksum }, LIMITS.draws);
    },
    async makeProposal(value) {
      const found = selected(value), version = found.bundle.modelVersion;
      const outgoing = { selectedFileSha256: found.chosenFileSha256, versionHash: version.hash, contentHash: version.contentHash,
        enginePin: version.content.enginePin, equation: 'D=(1-pow(1/(1+r),years))/(1-1/(1+r)); O=(((people*works)*effect)*D)*(1-anyway); C=cost/O. Zero years and zero discount use the pinned special branches.', modelVersion: version };
      const output = 'User-submitted model proposal, not published or independently reviewed\n\n'
        + 'Citation and model text may be private. Source descriptions do not establish rights or independent review.\n\n'
        + JSON.stringify(outgoing, null, 2).split('\n').map(line => `    ${line}`).join('\n') + '\n';
      const bytes = encoder.encode(output); if (bytes.byteLength > LIMITS.proposal) fail('byte-limit'); selected(value); return bytes;
    },
    async prepareCommand(stateValue, commandValue, contextValue, lease) {
      const stateSnapshot = cloneJson(stateValue), command = commandSnapshot(commandValue);
      object(contextValue, ['job', 'now', 'newModelId', 'newVersionId', 'sourceChecksums']); ids(contextValue);
      const context = { now: contextValue.now, newModelId: contextValue.newModelId, newVersionId: contextValue.newVersionId, sourceChecksums: new Map(contextValue.sourceChecksums) };
      const sourceJob = contextValue.job, owned = ownJob(sourceJob); check(owned); const preparedLife = life;
      const state = await awaitCurrent(validateState(stateSnapshot), owned), beforeStateHash = await awaitCurrent(hashValue('state', state), owned);
      let candidate = null, createdVersion = null, chosenFileSha256 = null, noop = false;
      if (!['freeze', 'copy-reproduced'].includes(command.kind) && (context.newModelId !== null || context.newVersionId !== null)) fail('unexpected-new-id');
      if (command.kind === 'freeze' && command.draft.mode === 'amend' && context.newModelId !== null) fail('unexpected-new-id');
      if (command.kind === 'clear') candidate = null;
      else if (command.kind === 'new-draft') {
        const form = { raw: { parser: 'strict-decimal-v1', name: '', unit: '', values: Object.fromEntries(ROWS.map(row => [row, ['', '', '']])), discount: '', seed: '' },
          text: Object.fromEntries(TEXT_FORM_KEYS.map(key => [key, key === 'classification' ? 'user-authored' : ''])), json: Object.fromEntries(JSON_FORM_KEYS.map(key => [key, ''])) };
        candidate = { ...baseCandidate(state, context.now), draft: { mode: 'new', modelId: null, expectedHead: null, origin: null, form, dirty: false } };
      }
      else if (command.kind === 'amend-draft') {
        const model = state.models.find(model => model.id === command.sourceModelId);
        const source = state.versions.find(version => version.id === command.source.id && version.hash === command.source.hash && version.modelId === command.sourceModelId);
        if (!model || !source || model.currentVersionId !== source.id) fail('stale-head');
        candidate = { ...baseCandidate(state, context.now), draft: { mode: 'amend', modelId: source.modelId, expectedHead: { id: source.id, hash: source.hash },
          origin: source.origin, form: await awaitCurrent(editorFormFromContent(source.content), owned), dirty: false } };
      }
      else if (command.kind === 'restore') { const found = backups.get(command.backup); if (!found) fail('backup-handle'); currentLife(found); if (found.selectionEpoch !== selectionEpoch) fail('stale'); candidate = found.state; chosenFileSha256 = found.chosenFileSha256; }
      else if (command.kind === 'undo') {
        const found = undos.get(command.undo); if (!found) fail('undo-handle'); currentLife(found);
        if (found.beforeStateHash !== beforeStateHash || found.storeGeneration !== owned.binding.storeGeneration || found.formGeneration !== owned.binding.formGeneration) fail('stale');
        candidate = found.prior;
      } else if (command.kind === 'save-draft') {
        if (!equal(command.draft.origin, state.draft.origin)) fail('draft-origin-authority');
        if (!equal([command.draft.mode, command.draft.modelId, command.draft.expectedHead], [state.draft.mode, state.draft.modelId, state.draft.expectedHead])) fail('draft-target-authority');
        candidate = equal(command.draft, state.draft) ? state : { ...baseCandidate(state, context.now), draft: command.draft }; noop = candidate === state;
      } else if (command.kind === 'copy-local-draft') {
        const source = state.versions.find(version => version.id === command.source.id && version.hash === command.source.hash && version.modelId === command.sourceModelId); if (!source) fail('local-copy-reference');
        const origin = { kind: 'local-version-copy', sourceModelId: source.modelId, sourceVersionId: source.id, sourceVersionHash: source.hash, sourceContentHash: source.contentHash };
        candidate = { ...baseCandidate(state, context.now), draft: { mode: 'copy', modelId: null, expectedHead: null, origin, form: await awaitCurrent(editorFormFromContent(source.content), owned), dirty: true } };
      } else if (command.kind === 'copy-selected-draft' || command.kind === 'copy-reproduced') {
        const source = selected(command.selected), outcome = comparison(command.comparison, command.selected); chosenFileSha256 = source.chosenFileSha256;
        const incoming = source.bundle.modelVersion, receipt = state.imports.find(item => item.sourceVersionId === incoming.id);
        if (receipt && (receipt.sourceVersionHash !== incoming.hash || receipt.sourceContentHash !== incoming.contentHash)) fail('incoming-version-conflict');
        const origin = fingerprintOrigin(source, outcome.observation);
        if (command.kind === 'copy-selected-draft') {
          if (command.purpose === 'comparison-mismatch-or-refusal' && outcome.observation.kind === 'matched') fail('copy-purpose');
          const form = await awaitCurrent(editorFormFromContent(incoming.content), owned);
          candidate = { ...baseCandidate(state, context.now), draft: { mode: 'copy', modelId: null, expectedHead: null, origin, form, dirty: true } };
          copiedSources.set(canonicalJson(origin), incoming.content.sources);
        } else {
          if (outcome.observation.kind !== 'matched') fail('matched-comparison-required');
          if (receipt) { candidate = state; noop = true; }
          else {
            const content = await awaitCurrent(validateContent({ ...incoming.content, run: outcome.recorded }), owned);
            const result = await appendNew(state, { origin }, content, context, owned, { sourceVersionId: incoming.id, sourceVersionHash: incoming.hash,
              sourceContentHash: incoming.contentHash, chosenFileSha256: source.chosenFileSha256 });
            ({ candidate, createdVersion, noop } = result);
          }
        }
      } else if (command.kind === 'freeze') {
        const draft = command.draft;
        if (!equal(draft.origin, state.draft.origin)) fail('draft-origin-authority');
        if (!equal([draft.mode, draft.modelId, draft.expectedHead], [state.draft.mode, state.draft.modelId, state.draft.expectedHead])) fail('draft-target-authority');
        let previous = null;
        if (draft.mode === 'amend') {
          const model = state.models.find(model => model.id === draft.modelId), source = state.versions.find(version => version.id === draft.expectedHead.id && version.hash === draft.expectedHead.hash && version.modelId === draft.modelId);
          if (!model || !source || model.currentVersionId !== source.id) fail('stale-head'); previous = source;
        }
        const input = normalizeRaw(draft.form.raw);
        const outcome = await awaitCurrent(client.runWithin(lease, { kind: 'normalized-run', input }, sourceJob), owned);
        if (outcome.kind === 'refused') throw new NumericalError(outcome.issue.code, outcome.issue.path, outcome.issue.context);
        if (outcome.kind !== 'success') fail(outcome.kind === 'cancelled' ? 'stale' : 'worker-result');
        const content = await awaitCurrent(compileEditorContent(draft.form, { enginePin: outcome.enginePin, input: outcome.input, run: outcome.recorded }), owned);
        checkSourceClaims(content, historicalSources(state, draft), context.sourceChecksums);
        if (previous && equal(content, previous.content)) { candidate = state; noop = true; }
        else if (!previous) ({ candidate, createdVersion, noop } = await appendNew(state, draft, content, context, owned));
        else {
          requireIds(state, context, false);
          const reason = draft.form.text.amendmentReason;
          if (typeof reason !== 'string' || !reason.trim() || reason.length > 2000) fail('amendment-reason');
          const version = await sealVersion({ id: context.newVersionId, modelId: previous.modelId, sequence: previous.sequence + 1,
            previous: { id: previous.id, hash: previous.hash }, recordedAt: context.now, amendmentReason: reason, origin: previous.origin, content }, owned);
          candidate = baseCandidate(state, context.now); candidate.versions = [...state.versions, version];
          candidate.models = state.models.map(model => model.id === version.modelId ? { id: model.id, title: content.title, currentVersionId: version.id } : model);
          candidate.draft = { ...draft, expectedHead: { id: version.id, hash: version.hash }, form: draft.form, dirty: false };
          createdVersion = { id: version.id, hash: version.hash };
        }
      }
      if (candidate !== null) candidate = await awaitCurrent(validateState(candidate), owned);
      const candidateStateHash = candidate === null ? null : await awaitCurrent(hashValue('state', candidate), owned);
      const candidateBackupBytes = candidate === null ? 0 : (await awaitCurrent(makeBackup(candidate, context.now), owned)).byteLength;
      const reviewBody = { operation: command.kind, beforeStateHash, candidateStateHash, candidateBackupBytes, candidate,
        createdVersion, chosenFileSha256, notice: NOTICE };
      const review = cloneJson({ ...reviewBody, reviewHash: await awaitCurrent(hashValue('review', reviewBody), owned) });
      if (life !== preparedLife) fail('stale');
      const token = handle(); prepared.set(token, { life, owned, review, candidate, noop, undoToken: command.kind === 'undo' ? command.undo : null }); return token;
    }
  });
  async function runPayload(current, work, lease) { const result = await payload.run(current, work, lease); if (payload.isCancelled(result) || !current()) fail('stale'); return result; }
  function live(selectedEpoch = null) { const captured = life; return () => !disposed && captured === life && (selectedEpoch === null || selectedEpoch === selectionEpoch); }
  function commandArguments(stateValue, commandValue, contextValue) {
    const state = cloneJson(stateValue), command = commandSnapshot(commandValue);
    object(contextValue, ['job', 'now', 'newModelId', 'newVersionId', 'sourceChecksums']); ids(contextValue);
    const context = { job: contextValue.job, now: contextValue.now, newModelId: contextValue.newModelId,
      newVersionId: contextValue.newVersionId, sourceChecksums: new Map(contextValue.sourceChecksums) };
    return { state, command, context, owned: ownJob(context.job) };
  }
  const api = Object.freeze({
    async admitSelected(value) { const bytes = snapshotBytes(value), current = live(selectionEpoch); return runPayload(current, () => rawApi.admitSelected(bytes)); },
    inspectSelected: rawApi.inspectSelected,
    async recalculate(value, job) { selected(value); const executionJob = calculationJob(job), owned = ownJob(executionJob); check(owned);
      return runPayload(owned.current, lease => rawApi.recalculate(value, job, lease, executionJob)); },
    inspectComparison: rawApi.inspectComparison,
    async admitBackup(value) { const bytes = snapshotBytes(value), current = live(selectionEpoch); return runPayload(current, () => rawApi.admitBackup(bytes)); },
    async parseBackup(value) { const bytes = snapshotBytes(value); return runPayload(live(), () => rawApi.parseBackup(bytes)); },
    async makeSelected(state, versionId, now) { const captured = cloneJson(state); return runPayload(live(), () => rawApi.makeSelected(captured, versionId, now)); },
    async makeBackup(state, now) { const captured = cloneJson(state); return runPayload(live(), () => rawApi.makeBackup(captured, now)); },
    async makeDraws(value) { const found = comparison(value); return runPayload(found.owned.current, () => rawApi.makeDraws(value)); },
    async makeProposal(value) { selected(value); return runPayload(live(selectionEpoch), () => rawApi.makeProposal(value)); },
    async prepareCommand(state, command, context) { const captured = commandArguments(state, command, context); check(captured.owned);
      const executionJob = calculationJob(captured.context.job), owned = ownJob(executionJob), guardedContext = { ...captured.context, job: executionJob };
      return runPayload(owned.current, lease => rawApi.prepareCommand(captured.state, captured.command, guardedContext, lease)); },
  });
  function inspectPrepared(token) { const found = prepared.get(token); if (!found) fail('prepared-handle'); currentLife(found); check(found.owned); return cloneJson(found.review); }
  function consumePrepared(token, bindings) {
    const found = prepared.get(token); if (!found) fail('prepared-handle'); currentLife(found); check(found.owned);
    object(bindings, ['beforeStateHash', 'formGeneration', 'storeGeneration']);
    if (bindings.beforeStateHash !== found.review.beforeStateHash || bindings.formGeneration !== found.owned.binding.formGeneration || bindings.storeGeneration !== found.owned.binding.storeGeneration) fail('stale');
    if (found.undoToken !== null) { const undo = undos.get(found.undoToken); if (!undo) fail('undo-handle'); currentLife(undo); undos.delete(found.undoToken); }
    prepared.delete(token); return Object.freeze({ review: cloneJson(found.review), candidate: found.candidate === null ? null : cloneJson(found.candidate), noop: found.noop });
  }
  function registerUndo(prior, bindings) {
    object(bindings, ['beforeStateHash', 'formGeneration', 'storeGeneration']); hash(bindings.beforeStateHash); integer(bindings.formGeneration, 0, Number.MAX_SAFE_INTEGER); integer(bindings.storeGeneration, 1, Number.MAX_SAFE_INTEGER);
    const token = handle(); undos.set(token, { life, prior: prior === null ? null : cloneJson(prior), ...bindings }); return token;
  }
  async function rawHashSourceFile(sourceId, value, hashedAt, job) {
    id(sourceId); validateInstant(hashedAt); sourceChoices.delete(sourceId);
    const sourceEpoch = (sourceHashEpoch.get(sourceId) ?? 0) + 1; sourceHashEpoch.set(sourceId, sourceEpoch); const capturedLife = life;
    const owned = ownJob(job); check(owned); const bytes = snapshotBytes(value, LIMITS.checksumFile);
    const checksum = cloneJson({ kind: 'local-bytes', sha256: await awaitCurrent(sha256Bytes(bytes), owned), byteLength: bytes.byteLength, hashedAt });
    if (life !== capturedLife || sourceHashEpoch.get(sourceId) !== sourceEpoch) fail('stale');
    const token = handle(); checksums.set(token, { life, sourceId, checksum }); sourceChoices.set(sourceId, token); return token;
  }
  function inspectSourceChecksum(token) { const found = checksums.get(token); if (!found || found.life !== life || sourceChoices.get(found.sourceId) !== token) fail('source-checksum-handle'); return cloneJson(found.checksum); }
  async function hashSourceFile(sourceId, value, hashedAt, job) {
    id(sourceId); validateInstant(hashedAt); const bytes = snapshotBytes(value, LIMITS.checksumFile), owned = ownJob(job); check(owned);
    sourceChoices.delete(sourceId); sourceHashEpoch.set(sourceId, (sourceHashEpoch.get(sourceId) ?? 0) + 1);
    return runPayload(owned.current, () => rawHashSourceFile(sourceId, bytes, hashedAt, job));
  }
  function admitFile(lease, operation, value, job) {
    const op = cloneJson(operation), owned = ownJob(job); check(owned); const current = live(selectionEpoch);
    if (op.kind === 'selected' || op.kind === 'backup') {
      object(op, ['kind']); const bytes = snapshotBytes(value);
      return runPayload(() => current() && owned.current(), () => op.kind === 'selected' ? rawApi.admitSelected(bytes) : rawApi.admitBackup(bytes), lease);
    }
    object(op, ['kind', 'sourceId', 'hashedAt']); if (op.kind !== 'checksum') fail('file-operation');
    id(op.sourceId); validateInstant(op.hashedAt); const bytes = snapshotBytes(value, LIMITS.checksumFile);
    return runPayload(() => current() && owned.current(), () => rawHashSourceFile(op.sourceId, bytes, op.hashedAt, job), lease);
  }
  function cancelCalculations() { calculationEpoch++; client.cancel(); }
  function revokeSelections() { selectionEpoch++; cancelCalculations(); }
  function invalidate() { life++; selectionEpoch++; sourceChoices.clear(); copiedSources.clear(); cancelCalculations(); }
  return Object.freeze({ api, payload, admitFile, inspectPrepared, consumePrepared, registerUndo, hashSourceFile, inspectSourceChecksum,
    cancelCalculations,
    revokeSourceChecksum(sourceId) { sourceChoices.delete(sourceId); sourceHashEpoch.set(sourceId, (sourceHashEpoch.get(sourceId) ?? 0) + 1); }, revokeSelections, invalidate,
    dispose() { disposed = true; invalidate(); client.dispose(); } });
}
export function createPureSessionBridge() { const payload = createModelPayloadCoordinator(); return bridge(createModelWorkerClientForPayload(payload), payload); }
export function createPureSessionBridgeForTesting(platform) { const payload = createModelPayloadCoordinator(); return bridge(createModelWorkerClientForPayload(payload, platform), payload); }
