import { validateInput, normalizeRaw } from './interpretations/v1/arithmetic.mjs';
import { quantile } from './interpretations/v1/random.mjs';
import { sha256, hashArray, inputHash, hashValue } from './interpretations/v1/encoding.mjs';
import { validateRecordedRun, validateNumericalIssue } from './content.mjs';
import { WORKER_FORMAT, WORKER_VERSION, ROWS, exactObject, cloneWorkerRequest, cloneBinding, requestBytes } from './worker-protocol.mjs';
import { createModelPayloadCoordinator, assertModelPayloadCoordinator } from './payload-lane.mjs';

const MESSAGES = Object.freeze({ timeout: 'This calculation exceeded its time limit. Your previous result and writing remain available.',
  unavailable: 'The calculation worker is unavailable. Your previous result and writing remain available.',
  protocol: 'The calculation result could not be validated. Your previous result and writing remain available.' });
export class ModelWorkerError extends Error {
  constructor(code) { super(MESSAGES[code] ?? MESSAGES.protocol); this.name = 'ModelWorkerError'; this.code = Object.hasOwn(MESSAGES, code) ? code : 'protocol'; }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const cancelled = () => ({ kind: 'cancelled' });
const platform = Object.freeze({
  createWorker: () => new Worker(new URL('./model-worker.mjs', import.meta.url), { type: 'module' }),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms), clearTimeout: timer => globalThis.clearTimeout(timer),
});
const fail = () => { throw new ModelWorkerError('protocol'); };

function arrays(outcome) {
  for (const [key, allowInfinity] of [['costs', true], ['outcomes', false]]) {
    const source = outcome[key];
    if (!(source instanceof Float64Array) || Object.getPrototypeOf(source) !== Float64Array.prototype ||
      source.length !== 5000 || source.byteLength !== 40000 || !(source.buffer instanceof ArrayBuffer) ||
      source.buffer.byteLength !== 40000 || source.byteOffset !== 0 || Reflect.ownKeys(source).length !== 5000) fail();
    let previous = -1, none = 0;
    for (const value of source) {
      if (Object.is(value, -0) || !(Number.isFinite(value) && (allowInfinity ? value > 0 : value >= 0) || allowInfinity && value === Infinity) || value < previous) fail();
      if (value === Infinity) none++;
      previous = value;
    }
    if (allowInfinity && none !== outcome.recorded.none) fail();
  }
}
function detachOutcome(message, owner) {
  exactObject(message, ['format', 'version', 'kind', 'requestSha256', 'enginePin', 'binding', 'outcome']);
  if (message.format !== WORKER_FORMAT || message.version !== WORKER_VERSION || message.kind !== 'result' ||
      message.requestSha256 !== owner.requestSha256 || !same(message.enginePin, owner.enginePin) || !same(cloneBinding(message.binding), owner.binding)) fail();
  const o = message.outcome;
  if (o?.kind === 'invalid') {
    exactObject(o, ['kind', 'errors']);
    if (!o.errors || Object.getPrototypeOf(o.errors) !== Object.prototype) fail();
    const keys = Reflect.ownKeys(o.errors), ds = Object.getOwnPropertyDescriptors(o.errors);
    if (!keys.length || keys.length > 8 || keys.some(k => typeof k !== 'string' || ![...ROWS, 'discount', 'seed'].includes(k) ||
      !Object.hasOwn(ds[k], 'value') || typeof ds[k].value !== 'string' || !ds[k].value || ds[k].value.length > 500)) fail();
    return { kind: 'invalid', errors: { ...o.errors } };
  }
  if (o?.kind === 'refused') { exactObject(o, ['kind', 'issue']); return { kind: 'refused', issue: validateNumericalIssue(o.issue) }; }
  exactObject(o, ['kind', 'input', 'recorded', 'runSha256', 'costs', 'outcomes']);
  if (o.kind !== 'success') fail();
  const input = validateInput(o.input), recorded = validateRecordedRun(o.recorded, input);
  const expectedInput = owner.request.kind === 'normalized-run' ? owner.request.input : normalizeRaw({ parser: 'legacy-amount-strip-v1', ...owner.request.raw });
  if (!same(input, expectedInput)) fail();
  arrays(o);
  const owned = { ...o, input, recorded, costs: o.costs.slice(), outcomes: o.outcomes.slice() };
  arrays(owned);
  for (const [series, summary] of [['costs', recorded.cost], ['outcomes', recorded.outcome]]) {
    for (const [key, q] of [['median', 0.5], ['p5', 0.05], ['p95', 0.95]]) {
      const value = quantile(owned[series], q, series), tag = summary[key];
      if (value === Infinity ? tag.kind !== 'no-outcome' : tag.kind !== 'finite' || tag.value !== value) fail();
    }
  }
  return { result: { kind: 'success', enginePin: structuredClone(owner.enginePin), input, recorded, costs: owned.costs, outcomes: owned.outcomes }, checks: [
    [() => inputHash(owner.enginePin, input), recorded.inputHash],
    [() => hashArray('costs', owned.costs), recorded.costsSha256],
    [() => hashArray('outcomes', owned.outcomes), recorded.outcomesSha256],
    [() => hashValue('run', recorded), o.runSha256],
  ] };
}
async function validateOutcome(detached, owner) {
  if (!detached.checks) return detached;
  for (const [hash, expected] of detached.checks) { if (!owner.current()) return cancelled(); if (await hash() !== expected) fail(); if (!owner.current()) return cancelled(); }
  return detached.result;
}

/** One owned worker and one nonabortable hash task, with only the latest queued replacement. */
function client(p, payload = createModelPayloadCoordinator()) {
  assertModelPayloadCoordinator(payload);
  let disposed = false, active = null, busy = false, queued = null;
  function cleanup(owner) {
    if (owner.timer !== null) p.clearTimeout(owner.timer);
    owner.timer = null;
    owner.signal.removeEventListener('abort', owner.abort);
    const worker = owner.worker;
    if (worker) {
      worker.removeEventListener('message', owner.message);
      worker.removeEventListener('error', owner.error);
      worker.removeEventListener('messageerror', owner.error);
      owner.worker = null;
      try { worker.terminate(); } catch { /* Owned teardown has no result authority. */ }
    }
  }
  function settle(owner, value, error = null) {
    if (owner.settled) { cleanup(owner); return; }
    owner.settled = true; cleanup(owner);
    if (active === owner) active = null;
    if (queued?.owner === owner) queued = null;
    if (error) owner.reject(error); else owner.resolve(value);
    if (owner.work === 0) owner.releasePhysical();
  }
  function cancel() { if (active) settle(active, cancelled()); }
  async function pump() {
    if (busy || !queued) return;
    const task = queued; queued = null; busy = true;
    task.owner.work++;
    try { if (task.owner.current()) await task.action(); else settle(task.owner, cancelled()); }
    catch (error) { if (task.owner.current()) settle(task.owner, null, error instanceof ModelWorkerError ? error : new ModelWorkerError('protocol')); else settle(task.owner, cancelled()); }
    finally {
      task.owner.work--;
      if (task.owner.settled && task.owner.work === 0) task.owner.releasePhysical();
      busy = false; void pump();
    }
  }
  function enqueue(owner, action) { queued = { owner, action }; void pump(); }
  function run(value, job, lease = undefined) {
    cancel(); // New invalid/empty choices revoke old work before inspection.
    if (disposed) return Promise.resolve(cancelled());
    let request, binding, signal;
    try {
      request = cloneWorkerRequest(value);
      binding = cloneBinding({ epoch: job.epoch, formGeneration: job.formGeneration, storeGeneration: job.storeGeneration ?? null });
      signal = job.signal;
      if (!signal || typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function' || typeof job.isCurrent !== 'function') fail();
    } catch { return Promise.reject(new ModelWorkerError('protocol')); }
    return new Promise((resolve, reject) => {
      const owner = { request, binding, signal, resolve, reject, settled: false, worker: null, timer: null };
      owner.work = 0;
      owner.physical = new Promise(release => { owner.releasePhysical = release; });
      owner.current = () => {
        try {
          const bound = () => !disposed && active === owner && !owner.settled && !signal.aborted && job.epoch === binding.epoch &&
            job.formGeneration === binding.formGeneration && (job.storeGeneration ?? null) === binding.storeGeneration;
          return bound() && job.isCurrent() === true && bound();
        }
        catch { return false; }
      };
      owner.abort = () => settle(owner, cancelled());
      owner.error = () => { if (!owner.received) owner.current() ? settle(owner, null, new ModelWorkerError('unavailable')) : settle(owner, cancelled()); };
      owner.message = event => {
        if (!owner.current()) { settle(owner, cancelled()); return; }
        if (owner.received) return;
        // Stop the worker immediately; its result is not exposed until detached validation finishes.
        let detached;
        try { detached = detachOutcome(event.data, owner); }
        catch { settle(owner, null, new ModelWorkerError('protocol')); return; }
        owner.received = true;
        if (owner.worker) {
          const worker = owner.worker; owner.worker = null;
          worker.removeEventListener('message', owner.message);
          worker.removeEventListener('error', owner.error);
          worker.removeEventListener('messageerror', owner.error);
          try { worker.terminate(); } catch { /* Still validate only owned data. */ }
        }
        enqueue(owner, async () => {
          const result = await validateOutcome(detached, owner);
          if (!owner.current()) settle(owner, cancelled()); else settle(owner, result);
        });
      };
      active = owner;
      signal.addEventListener('abort', owner.abort, { once: true });
      try { owner.timer = p.setTimeout(() => owner.current() ? settle(owner, null, new ModelWorkerError('timeout')) : settle(owner, cancelled()), 30000); }
      catch { settle(owner, null, new ModelWorkerError('unavailable')); return; }
      if (!owner.current()) { settle(owner, cancelled()); return; }
      void payload.run(owner.current, async () => {
        enqueue(owner, async () => {
        const { knownEnginePin } = await import('./registry.mjs');
        if (!owner.current()) { settle(owner, cancelled()); return; }
        owner.enginePin = knownEnginePin();
        owner.requestSha256 = await sha256(requestBytes(request));
        if (!owner.current()) { settle(owner, cancelled()); return; }
        try {
          const worker = p.createWorker();
          if (!worker || ['addEventListener', 'removeEventListener', 'postMessage', 'terminate'].some(key => typeof worker[key] !== 'function')) {
            try { worker?.terminate?.(); } catch { /* No authority from a malformed platform handle. */ }
            throw new ModelWorkerError('unavailable');
          }
          owner.worker = worker;
        } catch { throw new ModelWorkerError('unavailable'); }
        if (!owner.current()) { settle(owner, cancelled()); return; }
        owner.worker.addEventListener('message', owner.message);
        owner.worker.addEventListener('error', owner.error);
        owner.worker.addEventListener('messageerror', owner.error);
        owner.worker.postMessage({ format: WORKER_FORMAT, version: WORKER_VERSION, request,
          requestSha256: owner.requestSha256, enginePin: owner.enginePin, binding });
        });
        await owner.physical;
      }, lease).then(result => {
        if (payload.isCancelled(result) && !owner.settled) settle(owner, cancelled());
      }).catch(error => {
        if (!owner.settled) owner.current() ? settle(owner, null, error instanceof ModelWorkerError ? error : new ModelWorkerError('protocol')) : settle(owner, cancelled());
      });
    });
  }
  return Object.freeze({ run: (value, job) => run(value, job), runWithin: (lease, value, job) => run(value, job, lease), cancel, dispose() { disposed = true; cancel(); queued = null; } });
}
export function createModelWorkerClient() { return client(platform); }
/** Controlled platform tests only: admission, math, registry and URL are not injectable. */
export function createModelWorkerClientForTesting(adapter) {
  exactObject(adapter, ['createWorker', 'setTimeout', 'clearTimeout']);
  if (Object.values(adapter).some(v => typeof v !== 'function')) throw new TypeError('A complete worker platform adapter is required.');
  return client(adapter);
}
/** Same-bridge capability only; imported DTOs cannot supply the coordinator or its active lease. */
export function createModelWorkerClientForPayload(payload, adapter = undefined) {
  assertModelPayloadCoordinator(payload);
  if (adapter !== undefined) {
    exactObject(adapter, ['createWorker', 'setTimeout', 'clearTimeout']);
    if (Object.values(adapter).some(v => typeof v !== 'function')) throw new TypeError('A complete worker platform adapter is required.');
  }
  return client(adapter ?? platform, payload);
}
