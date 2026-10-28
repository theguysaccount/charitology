import { LIMITS, object, id, integer } from './codec.mjs';
import { validateInstant } from './content.mjs';
import { assertModelPayloadCoordinator } from './payload-lane.mjs';

const MESSAGES = Object.freeze({
  'invalid-request': 'Choose a supported file operation and a current source before selecting a file.',
  'invalid-job': 'This file choice no longer has a current view. Choose the file again.',
  'invalid-file': 'Choose exactly one file. Keep the original file for recovery.',
  'file-size': 'This file exceeds the bounded size for this operation. Keep the original file.',
  unavailable: 'An abortable file reader is unavailable. Keep the original file and use a supported browser.',
  'read-failed': 'This file could not be read. Keep the original and choose it again.',
  'byte-mismatch': 'The actual file bytes do not match this bounded file choice. Keep the original.',
  timeout: 'File processing exceeded its time limit. Keep the original. If an earlier checksum is still settling, reload before trying again.',
  'invalid-data': 'The complete file could not be admitted. Keep the original; no imported data was saved.',
});
const cancelled = () => Object.freeze({ kind: 'cancelled' });
const refused = code => Object.freeze({ kind: 'refused', code, message: MESSAGES[code] });
const platform = Object.freeze({ createReader: () => typeof FileReader === 'function' ? new FileReader() : null,
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms), clearTimeout: timer => globalThis.clearTimeout(timer) });
const blobSize = Object.getOwnPropertyDescriptor(Blob.prototype, 'size').get;
const bufferSize = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;

function request(value) {
  const kind = Object.getOwnPropertyDescriptor(value ?? {}, 'kind');
  if (!kind || !('value' in kind)) throw new Error('request');
  if (kind.value === 'selected' || kind.value === 'backup') { object(value, ['kind']); return Object.freeze({ kind: kind.value }); }
  object(value, ['kind', 'sourceId', 'hashedAt']);
  if (value.kind !== 'checksum') throw new Error('request');
  id(value.sourceId); validateInstant(value.hashedAt);
  return Object.freeze({ kind: 'checksum', sourceId: value.sourceId, hashedAt: value.hashedAt });
}
function binding(job) {
  integer(job.epoch, 1, Number.MAX_SAFE_INTEGER); integer(job.formGeneration, 0, Number.MAX_SAFE_INTEGER);
  integer(job.storeGeneration, 1, Number.MAX_SAFE_INTEGER);
  const signal = job.signal, check = job.isCurrent;
  if (!signal || typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function' ||
      typeof signal.removeEventListener !== 'function' || typeof check !== 'function') throw new Error('job');
  const captured = { epoch: job.epoch, formGeneration: job.formGeneration, storeGeneration: job.storeGeneration };
  return { signal, captured, current() {
    const same = () => job.epoch === captured.epoch && job.formGeneration === captured.formGeneration &&
      job.storeGeneration === captured.storeGeneration && job.signal === signal && job.isCurrent === check && !signal.aborted;
    try { return same() && check() === true && same(); } catch { return false; }
  } };
}

/** Trusted session capability only. File contents never select an admission function. */
function lane(bridge, p) {
  const payload = assertModelPayloadCoordinator(bridge?.payload);
  if (typeof bridge?.admitFile !== 'function') throw new TypeError('A model session file capability is required.');
  for (const fn of ['revokeSelections', 'revokeSourceChecksum', 'hashSourceFile', 'inspectSourceChecksum'])
    if (typeof bridge?.[fn] !== 'function') throw new TypeError('A model session capability is required.');
  for (const fn of ['admitSelected', 'inspectSelected', 'admitBackup'])
    if (typeof bridge?.api?.[fn] !== 'function') throw new TypeError('A model session capability is required.');
  let epoch = 0, disposed = false, active = null, reading = null, payloadBusy = false, queued = null;

  function stopRead(owner, abort, reason = 'stale') {
    if (reading?.owner !== owner) return;
    const { reader, reject } = reading; reading = null;
    // Detach first. Native abort and a retained synthetic callback have no authority.
    reader.onload = reader.onerror = reader.onabort = null;
    if (abort) {
      if (owner.timer !== null) p.clearTimeout(owner.timer);
      owner.timer = null;
      try { reader.abort(); } catch { /* Owned read already ended. */ }
      reject(reason);
    }
  }
  function cleanup(owner, abort = true) {
    if (owner.timer !== null) p.clearTimeout(owner.timer);
    owner.timer = null;
    owner.bound?.signal.removeEventListener('abort', owner.abort);
    stopRead(owner, abort);
    owner.file = null;
    if (queued === owner) queued = null;
  }
  function settle(owner, result) {
    if (owner.settled) return;
    owner.settled = true; cleanup(owner);
    if (active === owner) active = null;
    owner.resolve(result);
  }
  function revokePending() {
    epoch++;
    bridge.revokeSelections(); // Also terminates this session's owned calculation worker.
    const owner = active;
    if (owner) {
      if (owner.request?.kind === 'checksum') bridge.revokeSourceChecksum(owner.request.sourceId);
      settle(owner, cancelled());
    }
  }
  function current(owner) { return !disposed && !owner.settled && active === owner && owner.epoch === epoch && owner.bound.current(); }
  function revokeAuthority(owner) {
    if (owner.request.kind === 'checksum') bridge.revokeSourceChecksum(owner.request.sourceId);
    else bridge.revokeSelections();
  }
  async function admit(owner, bytes, lease) {
    const op = owner.request;
    const owned = { ...owner.bound.captured, signal: owner.bound.signal, isCurrent: () => current(owner) };
    const handle = await bridge.admitFile(lease, op, bytes, owned);
    if (!current(owner)) return cancelled();
    if (op.kind === 'selected') {
      return Object.freeze({ kind: 'selected', handle, inspection: bridge.api.inspectSelected(handle) });
    }
    if (op.kind === 'backup') {
      return Object.freeze({ kind: 'backup', handle });
    }
    return Object.freeze({ kind: 'checksum', sourceId: op.sourceId, handle, checksum: bridge.inspectSourceChecksum(handle) });
  }
  function read(owner) {
    return new Promise((resolve, reject) => {
      let reader;
      try { reader = p.createReader(); } catch { reject('unavailable'); return; }
      if (!reader || typeof reader.readAsArrayBuffer !== 'function' || typeof reader.abort !== 'function') { reject('unavailable'); return; }
      if (!current(owner)) { reject('stale'); return; }
      reading = { owner, reader, reject };
      reader.onload = () => {
        if (reading?.owner !== owner) return;
        if (!current(owner)) { stopRead(owner, true); reject('stale'); return; }
        try {
          const buffer = reader.result;
          if (!(buffer instanceof ArrayBuffer) || Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype ||
              bufferSize.call(buffer) !== owner.size || bufferSize.call(buffer) > owner.cap) {
            stopRead(owner, true, 'byte-mismatch'); return;
          }
          stopRead(owner, false); owner.file = null;
          resolve(new Uint8Array(buffer));
        } catch { stopRead(owner, true, 'byte-mismatch'); }
      };
      reader.onerror = () => { if (reading?.owner === owner) stopRead(owner, true, 'read-failed'); };
      reader.onabort = () => { if (reading?.owner === owner) stopRead(owner, true, 'read-failed'); };
      try { reader.readAsArrayBuffer(owner.file); } catch { stopRead(owner, true, 'read-failed'); }
    });
  }
  async function pump() {
    if (payloadBusy || !queued) return;
    const owner = queued; queued = null; payloadBusy = true;
    let bytes = null;
    try {
      const result = await payload.run(() => current(owner), async lease => {
        bytes = await read(owner);
        if (!current(owner)) return cancelled();
        return admit(owner, bytes, lease);
      });
      if (payload.isCancelled(result)) { settle(owner, cancelled()); return; }
      if (!current(owner)) { revokeAuthority(owner); settle(owner, cancelled()); }
      else settle(owner, result);
    } catch (error) {
      if (!current(owner)) settle(owner, cancelled());
      else {
        revokeAuthority(owner);
        settle(owner, refused(typeof error === 'string' && Object.hasOwn(MESSAGES, error) ? error : 'invalid-data'));
      }
    } finally {
      bytes = null; owner.file = null;
      // Never release this semaphore on cancellation/deadline while native digest is unresolved.
      payloadBusy = false; void pump();
    }
  }
  function choose(files, operation, job) {
    revokePending(); // Invalid/empty/multiple choices revoke older authority before inspection.
    if (disposed) return Promise.resolve(cancelled());
    // An invalid new date/shape cannot silently preserve the intended source's old proof.
    try {
      const fields = Object.getOwnPropertyDescriptors(operation);
      if (fields.kind?.value === 'checksum' && Object.hasOwn(fields.sourceId ?? {}, 'value')) {
        id(fields.sourceId.value); bridge.revokeSourceChecksum(fields.sourceId.value);
      }
    } catch { /* Full closed admission below refuses the request. No inferred source ID. */ }
    let op, bound, file, size, cap;
    try { op = request(operation); } catch { return Promise.resolve(refused('invalid-request')); }
    try { bound = binding(job); } catch { return Promise.resolve(refused('invalid-job')); }
    try {
      if (!files || files.length !== 1 || typeof File !== 'function' || !(files[0] instanceof File)) return Promise.resolve(refused('invalid-file'));
      file = files[0]; size = blobSize.call(file);
      cap = op.kind === 'checksum' ? LIMITS.checksumFile : LIMITS[op.kind];
      if (!Number.isSafeInteger(size) || size < 0 || size > cap) return Promise.resolve(refused('file-size'));
    } catch { return Promise.resolve(refused('invalid-file')); }
    return new Promise(resolve => {
      const owner = { epoch, request: op, bound, file, size, cap, resolve, timer: null, settled: false };
      owner.abort = () => {
        if (owner.settled) return;
        revokeAuthority(owner); settle(owner, cancelled());
      };
      active = owner;
      bound.signal.addEventListener('abort', owner.abort, { once: true });
      if (!current(owner)) { owner.abort(); return; }
      try { owner.timer = p.setTimeout(() => {
        if (owner.settled) return;
        const isCurrent = current(owner);
        revokeAuthority(owner); settle(owner, isCurrent ? refused('timeout') : cancelled());
      }, 30000); } catch { settle(owner, refused('unavailable')); return; }
      queued = owner; void pump();
    });
  }
  return Object.freeze({ choose,
    revoke() { revokePending(); },
    dispose() { if (disposed) return; disposed = true; revokePending(); },
    snapshot() { return Object.freeze({ pending: active !== null, reading: reading !== null, payloadBusy, queued: queued !== null }); } });
}

/** Snapshot files synchronously, then clear the caller's chooser value so the same file may be chosen again. */
export function createModelFileLane(bridge) { return lane(bridge, platform); }
/** Scheduling adapter only: production admission, hashing and opaque session handles remain fixed. */
export function createModelFileLaneForTesting(bridge, adapter) {
  object(adapter, ['createReader', 'setTimeout', 'clearTimeout']);
  for (const key of ['createReader', 'setTimeout', 'clearTimeout']) if (typeof adapter[key] !== 'function') throw new TypeError('Invalid file platform.');
  return lane(bridge, adapter);
}
