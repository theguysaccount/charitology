import { LOCAL_KEY, TEXT_FORM_KEYS, JSON_FORM_KEYS, validateState, makeBackup } from './graph.mjs';
import { ROWS, validateInstant } from './content.mjs';
import { LIMITS, cloneJson, canonicalJson, parseJsonBytes, prettyBytes, hashValue, savedStringHash, wellFormed, object, id, fail } from './codec.mjs';
import { createPureSessionBridge, createPureSessionBridgeForTesting } from './pure.mjs';
const UNREADABLE = Symbol('unreadable');
const encoder = new TextEncoder();
const RECOVERY_PREFIX = 'Model bundle saved-string recovery; not a valid bundle or workspace backup\n\n';
const RECOVERY_OVERHEAD = encoder.encode(RECOVERY_PREFIX + '{\n  "savedString": \n}\n').byteLength;
const FINGERPRINT_OVERHEAD = encoder.encode('charitology-model-bundles/v1/saved-string\n\n').byteLength;
function escapedStringFits(value, maxBytes) {
  if (value.length > maxBytes) return false;
  let bytes = 2;
  for (let at = 0; at < value.length; at++) {
    const unit = value.charCodeAt(at);
    if (unit === 34 || unit === 92 || unit === 8 || unit === 9 || unit === 10 || unit === 12 || unit === 13) bytes += 2;
    else if (unit < 32) bytes += 6;
    else if (unit >= 0xd800 && unit <= 0xdbff) { const next = value.charCodeAt(at + 1); if (next >= 0xdc00 && next <= 0xdfff) { bytes += 4; at++; } else bytes += 6; }
    else if (unit >= 0xdc00 && unit <= 0xdfff) bytes += 6;
    else bytes += unit < 128 ? 1 : unit < 2048 ? 2 : 3;
    if (bytes > maxBytes) return false;
  }
  return true;
}
const MESSAGES = Object.freeze({ opening: 'Reading this model bundle workspace.', absent: 'No model bundle workspace is saved here.',
  saved: 'The complete workspace is saved in this browser.', corrupt: 'The saved string is protected because it is not a valid workspace. Download its raw recovery before deliberately replacing or clearing it. Undo cannot restore an invalid saved string.',
  unavailable: 'This browser cannot safely persist the workspace. Current writing and available recovery remain here.',
  conflict: 'The saved string changed elsewhere. Current writing and any pending candidate remain here. Review a fresh reload before another change.',
  quota: 'The complete candidate did not fit browser storage. It remains available for deliberate Retry or recovery.',
  unconfirmed: 'Persistence is unconfirmed and may already have succeeded. Retry checks the same exact candidate before writing.',
  stale: 'This action is no longer current. Current writing remains here.', invalid: 'This command could not be admitted. Current writing remains here.',
  pending: 'Resolve the retained candidate with Retry or an explicit reload before another saved change.' });
function blankState(workspaceId, now) {
  id(workspaceId); validateInstant(now);
  return cloneJson({ format: 'charitology-model-bundles', schemaVersion: 1, id: workspaceId, revision: 1, createdAt: now, updatedAt: now,
    engines: [], models: [], versions: [], imports: [], draft: { mode: 'new', modelId: null, expectedHead: null, origin: null, dirty: false,
      form: { raw: { parser: 'strict-decimal-v1', name: '', unit: '', values: Object.fromEntries(ROWS.map(row => [row, ['', '', '']])), discount: '', seed: '' },
        text: Object.fromEntries(TEXT_FORM_KEYS.map(key => [key, key === 'classification' ? 'user-authored' : ''])), json: Object.fromEntries(JSON_FORM_KEYS.map(key => [key, ''])) } } });
}
function commandCopy(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) fail('command');
  const keys = Reflect.ownKeys(command); object(command, keys);
  return Object.fromEntries(keys.map(key => [key, key === 'draft' || key === 'source' ? cloneJson(command[key]) : command[key]]));
}
const nativePlatform = () => ({
  get storage() { try { return globalThis.localStorage; } catch { return null; } },
  get locks() { try { return globalThis.navigator?.locks ?? null; } catch { return null; } },
  newId: kind => `${kind}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${++fallbackIds}`}`,
  now: () => new Date().toISOString(), workerPlatform: null, disableSecureHash: false,
});
let fallbackIds = 0;
function controller(platform, testing) {
  const storage = platform.storage, locks = platform.locks;
  const secureHash = !!globalThis.crypto?.subtle && platform.disableSecureHash !== true;
  const lockCapable = !!locks && typeof locks.request === 'function';
  const storageCapable = !!storage && ['getItem', 'setItem', 'removeItem'].every(key => typeof storage[key] === 'function');
  const canCalculate = secureHash && (testing ? !!platform.workerPlatform : typeof globalThis.Worker === 'function');
  const fullBridge = testing && platform.workerPlatform ? createPureSessionBridgeForTesting(platform.workerPlatform) : createPureSessionBridge();
  const sourceChecksums = new Map(), previews = new WeakMap();
  let memory = blankState(platform.newId('workspace'), platform.now()), storeGeneration = 1, formGeneration = 0, jobEpoch = 1, previewSerial = 1;
  let baseline = UNREADABLE, observed = UNREADABLE, savedSha256 = null, persistence = 'unavailable', baselineKind = 'unavailable', message = MESSAGES.opening;
  let disposed = false, suspended = false, opened = false, resumeCheck = false, pending = null, undoRecord = null, ceiling = false, lifecycleSerial = 1, conflict = false;
  let resumeGate = null, resumeOpening = null, statusSerial = 1;
  let signals = new AbortController();
  const supported = () => secureHash && lockCapable && storageCapable && !ceiling && !disposed;
  function snapshot() { return Object.freeze({ generation: storeGeneration, memory: cloneJson(memory), persistence, pending: pending ? 'retry' : 'none', savedSha256,
    message, capabilities: Object.freeze({ canCalculate: canCalculate && !disposed && !ceiling, canPersist: supported() && !conflict && baseline !== UNREADABLE && !['corrupt', 'unavailable', 'conflict'].includes(persistence),
      canReadNative: secureHash && typeof globalThis.FileReader === 'function' && !disposed }) }); }
  function advance(value) { if (value >= Number.MAX_SAFE_INTEGER) { ceiling = true; fail('generation-ceiling'); } return value + 1; }
  function revoke({ reset = false, incrementStore = false } = {}) {
    signals.abort(); signals = new AbortController(); jobEpoch = advance(jobEpoch); previewSerial = advance(previewSerial);
    if (incrementStore) storeGeneration = advance(storeGeneration);
    undoRecord = null; fullBridge.cancelCalculations();
    if (reset) { lifecycleSerial = advance(lifecycleSerial); sourceChecksums.clear(); fullBridge.invalidate(); }
  }
  function ownedJob(serial = null) {
    const epoch = jobEpoch, form = formGeneration, store = storeGeneration, signal = signals.signal;
    return Object.freeze({ epoch, formGeneration: form, storeGeneration: store, signal,
      isCurrent: () => !disposed && !suspended && !ceiling && epoch === jobEpoch && form === formGeneration && store === storeGeneration && !signal.aborted && (serial === null || serial === previewSerial) });
  }
  function current(job) { return job.isCurrent() === true; }
  function requireCurrent(job) { if (!current(job)) fail('stale'); }
  async function payload(work) { const life = lifecycleSerial; const value = await fullBridge.payload.run(() => !disposed && life === lifecycleSerial, work);
    if (fullBridge.payload.isCancelled(value) || disposed || life !== lifecycleSerial) fail('stale'); return value; }
  async function fingerprint(raw) { if (!secureHash || raw === UNREADABLE || typeof raw === 'string' && !escapedStringFits(raw, LIMITS.checksumFile - FINGERPRINT_OVERHEAD)) return null;
    try { return await payload(() => savedStringHash(raw)); } catch { return null; } }
  async function read() { if (!storageCapable) throw new Error('storage'); const value = await storage.getItem(LOCAL_KEY); if (value !== null && typeof value !== 'string') throw new Error('storage'); return value; }
  async function admitSaved(raw) {
    if (raw === null) return null;
    if (!secureHash) return UNREADABLE;
    if (raw.length > LIMITS.backup) fail('byte-limit');
    if (!wellFormed(raw)) fail('unpaired-surrogate');
    return payload(() => validateState(parseJsonBytes(encoder.encode(raw), { maxBytes: LIMITS.backup })));
  }
  const openingPromise = (async () => {
    try {
      while (!disposed) {
        resumeCheck = false; const raw = await read();
        if (suspended && resumeGate) await resumeGate;
        if (disposed) break; if (resumeCheck) continue;
        const sha = await fingerprint(raw); let admitted;
        try { admitted = await admitSaved(raw); } catch (error) { admitted = error?.code === 'stale' ? UNREADABLE : undefined; }
        if (suspended && resumeGate) await resumeGate;
        if (disposed) break; if (resumeCheck) continue;
        baseline = observed = raw; savedSha256 = sha;
        if (admitted === undefined) { baselineKind = persistence = 'corrupt'; message = MESSAGES.corrupt; }
        else if (admitted === UNREADABLE) { baselineKind = persistence = 'unavailable'; message = MESSAGES.unavailable; }
        else { if (admitted !== null) memory = admitted; baselineKind = persistence = raw === null ? 'absent' : 'saved'; message = MESSAGES[persistence]; }
        break;
      }
    } catch { if (!disposed) { baseline = observed = UNREADABLE; persistence = 'unavailable'; message = MESSAGES.unavailable; savedSha256 = null; } }
    opened = true; return snapshot();
  })();
  function refused(code, text = MESSAGES[code] ?? MESSAGES.invalid) { return Object.freeze({ kind: 'refused', code, message: text, snapshot: snapshot() }); }
  async function foreign(raw) {
    const serial = statusSerial = advance(statusSerial);
    revoke({ reset: true }); conflict = true; observed = raw; savedSha256 = null; persistence = 'conflict'; message = MESSAGES.conflict;
    const sha = await fingerprint(raw); if (!disposed && statusSerial === serial) savedSha256 = sha;
  }
  async function lock(action) {
    if (!supported()) fail('unavailable');
    let called = false;
    return locks.request(LOCAL_KEY, async () => { if (called) fail('unavailable'); called = true; return action(); });
  }
  function priorForUndo() {
    return { admitted: baselineKind === 'saved' || baselineKind === 'absent', persisted: baselineKind === 'saved' ? memory : null, memory, raw: baseline };
  }
  async function confirm(candidate) {
    const previous = candidate.prior, capturedLife = lifecycleSerial, capturedForm = candidate.job.formGeneration, sha = await fingerprint(candidate.target);
    if (disposed || suspended || lifecycleSerial !== capturedLife) {
      if (pending === candidate) { message = MESSAGES.unconfirmed; return Object.freeze({ kind: 'unconfirmed', candidateStateHash: candidate.targetStateHash, retryAvailable: true, snapshot: snapshot() }); }
      return refused('stale');
    }
    statusSerial = advance(statusSerial); memory = candidate.nextMemory; baseline = observed = candidate.target; savedSha256 = sha;
    pending = null; conflict = false; baselineKind = persistence = candidate.target === null ? 'absent' : 'saved'; message = candidate.target === null ? MESSAGES.absent : MESSAGES.saved;
    revoke({ reset: ['restore', 'clear', 'undo'].includes(candidate.operation), incrementStore: true });
    if (['restore', 'clear'].includes(candidate.operation) && previous.admitted && capturedForm === formGeneration) {
      const bindings = { beforeStateHash: candidate.targetStateHash, formGeneration, storeGeneration };
      undoRecord = { handle: fullBridge.registerUndo(previous.persisted, bindings), priorMemory: previous.memory, priorRaw: previous.raw };
    }
    return Object.freeze({ kind: candidate.target === null ? 'removed' : 'saved', snapshot: snapshot() });
  }
  async function attempt(candidate, job, retry, retryLife = null) {
    return lock(async () => {
      if (retry && pending !== candidate) return Object.freeze({ kind: 'noop', snapshot: snapshot() });
      if (retry && (disposed || suspended || retryLife !== lifecycleSerial)) return refused('stale');
      if (!retry) requireCurrent(job);
      let fresh;
      try { fresh = await read(); } catch { persistence = 'unavailable'; message = MESSAGES.unavailable; return refused('unavailable'); }
      if (!retry) requireCurrent(job);
      if (retry && (disposed || suspended || retryLife !== lifecycleSerial || pending !== candidate)) return refused('stale');
      if (retry && fresh === candidate.target) return confirm(candidate);
      if (retry && conflict) return refused('foreign-save', MESSAGES.conflict);
      if (fresh !== candidate.beforeRaw) { await foreign(fresh); return refused('foreign-save', MESSAGES.conflict); }
      await payload(async () => {
        const admitted = await validateState(candidate.nextMemory);
        if (await hashValue('state', admitted) !== candidate.targetStateHash) fail('stale');
        await makeBackup(admitted, candidate.preparedAt);
      });
      if (retry ? disposed || suspended || retryLife !== lifecycleSerial || pending !== candidate : !current(job)) return refused('stale');
      if (!retry) {
        if (await payload(() => hashValue('state', memory)) !== candidate.review.beforeStateHash) return refused('stale');
        requireCurrent(job);
        const consumed = fullBridge.consumePrepared(candidate.handle, { beforeStateHash: candidate.review.beforeStateHash,
          formGeneration: job.formGeneration, storeGeneration: job.storeGeneration });
        if (consumed.noop) return Object.freeze({ kind: 'noop', snapshot: snapshot() });
      }
      pending = candidate;
      try {
        if (candidate.target === null) await storage.removeItem(LOCAL_KEY); else await storage.setItem(LOCAL_KEY, candidate.target);
      } catch (error) {
        const quota = error?.name === 'QuotaExceededError'; message = quota ? MESSAGES.quota : MESSAGES.unconfirmed;
        if (quota) return refused('quota');
        return Object.freeze({ kind: 'unconfirmed', candidateStateHash: candidate.targetStateHash, retryAvailable: true, snapshot: snapshot() });
      }
      if (retry ? disposed || suspended || retryLife !== lifecycleSerial : !current(job)) {
        message = MESSAGES.unconfirmed;
        return Object.freeze({ kind: 'unconfirmed', candidateStateHash: candidate.targetStateHash, retryAvailable: true, snapshot: snapshot() });
      }
      try {
        const actual = await read();
        if (actual !== candidate.target) { await foreign(actual); return refused('foreign-save', MESSAGES.conflict); }
        if (retry ? disposed || suspended || retryLife !== lifecycleSerial : !current(job)) { message = MESSAGES.unconfirmed; return Object.freeze({ kind: 'unconfirmed', candidateStateHash: candidate.targetStateHash, retryAvailable: true, snapshot: snapshot() }); }
        return confirm(candidate);
      } catch { message = MESSAGES.unconfirmed; return Object.freeze({ kind: 'unconfirmed', candidateStateHash: candidate.targetStateHash, retryAvailable: true, snapshot: snapshot() }); }
    });
  }
  const session = Object.freeze({
    snapshot,
    async preview(commandValue) {
      const command = commandCopy(commandValue), now = platform.now(); validateInstant(now);
      const ids = command.kind === 'copy-reproduced' || command.kind === 'freeze' && command.draft.mode !== 'amend'
        ? { newModelId: platform.newId('model'), newVersionId: platform.newId('version') }
        : command.kind === 'freeze' ? { newModelId: null, newVersionId: platform.newId('version') } : { newModelId: null, newVersionId: null };
      const undo = command.kind === 'undo' && command.undo === undoRecord?.handle ? undoRecord : null;
      const clearMemory = command.kind === 'clear' ? blankState(platform.newId('workspace'), now) : undo?.priorMemory ?? null;
      previewSerial = advance(previewSerial); fullBridge.cancelCalculations(); const job = ownedJob(previewSerial);
      await openingPromise; requireCurrent(job);
      if (pending) fail('pending-retry'); if (!supported() || baseline === UNREADABLE || persistence === 'unavailable') fail('unavailable');
      if (conflict) fail('foreign-save');
      if (persistence === 'corrupt' && !['restore', 'clear'].includes(command.kind)) fail('protected-saved-string');
      const beforeRaw = baseline, prior = priorForUndo();
      const handle = await fullBridge.api.prepareCommand(memory, command, { job, now, ...ids, sourceChecksums: new Map(sourceChecksums) }); requireCurrent(job);
      const review = fullBridge.inspectPrepared(handle), nextMemory = review.candidate ?? clearMemory;
      if (!nextMemory) fail('undo-handle');
      const target = command.kind === 'undo' ? undo?.priorRaw : review.candidate === null ? null : canonicalJson(review.candidate);
      if (target === undefined || target === UNREADABLE) fail('undo-handle');
      const targetStateHash = review.candidateStateHash ?? await payload(() => hashValue('state', nextMemory)); requireCurrent(job);
      previews.set(handle, { handle, job, review, beforeRaw, prior, target, nextMemory, targetStateHash, preparedAt: now, operation: command.kind });
      return Object.freeze({ review, handle });
    },
    async commit(handle) {
      const candidate = previews.get(handle); if (!candidate) return refused('invalid');
      previews.delete(handle);
      if (pending) return refused('invalid', MESSAGES.pending);
      if (!current(candidate.job)) return refused('stale');
      try { return await attempt(candidate, candidate.job, false); }
      catch { return refused(supported() ? 'stale' : 'unavailable'); }
    },
    async retry() {
      await openingPromise;
      if (!pending || disposed || suspended) return refused('stale');
      const candidate = pending, retryLife = lifecycleSerial;
      try { return await attempt(candidate, null, true, retryLife); }
      catch { return refused('unavailable'); }
    },
    async reload(options) {
      object(options, ['discardLocal']); if (options.discardLocal !== true) fail('discard-required');
      revoke({ reset: true }); const job = ownedJob(); await openingPromise; requireCurrent(job);
      let raw; try { raw = await read(); } catch { if (!current(job)) return snapshot(); persistence = 'unavailable'; message = MESSAGES.unavailable; return snapshot(); }
      requireCurrent(job); let admitted;
      try { admitted = await admitSaved(raw); } catch (error) { if (error?.code === 'stale') return snapshot(); admitted = undefined; }
      requireCurrent(job); const sha = await fingerprint(raw); requireCurrent(job);
      statusSerial = advance(statusSerial); baseline = observed = raw; savedSha256 = sha; pending = null; conflict = false;
      if (admitted === undefined) { baselineKind = persistence = 'corrupt'; message = MESSAGES.corrupt; }
      else if (admitted === UNREADABLE) { baselineKind = persistence = 'unavailable'; message = MESSAGES.unavailable; }
      else { memory = admitted ?? blankState(platform.newId('workspace'), platform.now()); baselineKind = persistence = raw === null ? 'absent' : 'saved'; message = raw === null ? MESSAGES.absent : MESSAGES.saved; }
      storeGeneration = advance(storeGeneration); return snapshot();
    },
    async rereadStatus() {
      if (!opened) { resumeCheck = true; await openingPromise; return snapshot(); }
      if (disposed) return snapshot();
      const serial = statusSerial = advance(statusSerial);
      let raw; try { raw = await read(); } catch { if (!disposed && serial === statusSerial) { persistence = 'unavailable'; message = MESSAGES.unavailable; } return snapshot(); }
      if (disposed || serial !== statusSerial) return snapshot();
      if (baseline === UNREADABLE || raw !== baseline) await foreign(raw);
      else { const sha = await fingerprint(raw); if (!disposed && serial === statusSerial) { observed = raw; savedSha256 = sha; persistence = conflict ? 'conflict' : baselineKind; message = conflict ? MESSAGES.conflict : pending ? MESSAGES.unconfirmed : MESSAGES[persistence]; } }
      return snapshot();
    },
    async rawSavedRecovery() {
      await openingPromise; if (typeof observed !== 'string') return null;
      if (!escapedStringFits(observed, LIMITS.checksumFile - RECOVERY_OVERHEAD)) fail('byte-limit');
      const bytes = encoder.encode(RECOVERY_PREFIX + JSON.stringify({ savedString: observed }, null, 2) + '\n');
      if (bytes.byteLength > LIMITS.checksumFile) fail('byte-limit'); return bytes;
    },
    undo() { return undoRecord?.handle ?? null; },
    dispose() { if (!disposed) { disposed = true; signals.abort(); undoRecord = null; fullBridge.dispose(); sourceChecksums.clear(); resumeOpening?.(); resumeOpening = null; resumeGate = null; } },
  });
  const fileBridge = Object.freeze({ api: fullBridge.api, payload: fullBridge.payload,
    async admitFile(lease, operation, bytes, job) { const sourceId = operation.kind === 'checksum' ? operation.sourceId : null;
      const handle = await fullBridge.admitFile(lease, operation, bytes, job); if (sourceId !== null) sourceChecksums.set(sourceId, handle); return handle; },
    async hashSourceFile(sourceId, bytes, now, job) { const handle = await fullBridge.hashSourceFile(sourceId, bytes, now, job); sourceChecksums.set(sourceId, handle); return handle; },
    inspectSourceChecksum: fullBridge.inspectSourceChecksum,
    revokeSourceChecksum(sourceId) { sourceChecksums.delete(sourceId); fullBridge.revokeSourceChecksum(sourceId); },
    revokeSelections: fullBridge.revokeSelections, cancelCalculations: fullBridge.cancelCalculations });
  const hooks = Object.freeze({ ownedJob,
    noteFormChanged() { if (disposed) return; formGeneration = advance(formGeneration); revoke(); },
    suspend() { if (disposed) return; suspended = true; if (!opened) { resumeCheck = true; if (!resumeGate) resumeGate = new Promise(resolve => { resumeOpening = resolve; }); } revoke({ reset: true }); },
    async resume() { if (disposed) return snapshot(); suspended = false; if (!opened) { resumeCheck = true; resumeOpening?.(); resumeOpening = null; resumeGate = null; return openingPromise; } return session.rereadStatus(); },
    noticeForeignStorage: () => session.rereadStatus(), dispose: session.dispose });
  return Object.freeze({ session, openingPromise, bridge: fileBridge, hooks });
}
export function createModelBundleController() { return controller(nativePlatform(), false); }
export function createModelBundleControllerForTesting(platform) {
  object(platform, ['storage', 'locks', 'newId', 'now', 'workerPlatform', 'disableSecureHash']);
  if (typeof platform.newId !== 'function' || typeof platform.now !== 'function' || typeof platform.disableSecureHash !== 'boolean') fail('test-platform');
  return controller(platform, true);
}
