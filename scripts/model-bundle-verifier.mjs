import { constants } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { validateNumericalIssue, validateFingerprint, validateCopyObservation, RUN_FIELDS } from '../src/lib/model-bundles/content.mjs';
import { knownEnginePin } from '../src/lib/model-bundles/registry.mjs';
import { equal } from '../src/lib/model-bundles/codec.mjs';

export const CLI_LIMITS = Object.freeze({ bytes: 2 * 1024 * 1024, chunk: 64 * 1024, deadline: 30000, output: 8192 });
export const CLI_MESSAGES = Object.freeze({
  matched: 'The recorded calculation matches this installed engine on this runtime.',
  mismatched: 'The recorded calculation differs from this installed engine on this runtime.',
  invalid: 'The selected file is not a valid model bundle.',
  unsupported: 'The selected file uses an unsupported engine.',
  'numeric-refusal': "The declared inputs cannot be calculated under this engine's numerical policy.",
  unavailable: 'The selected file could not be verified on this runtime.',
  arguments: 'Use one explicit regular file followed optionally by --json.',
  regular: 'Choose one regular file; directories, links and special files are not accepted.',
  platform: 'Safe regular-file inspection is unavailable on this platform.',
  size: 'The selected file exceeds the 2 MiB limit.',
  changed: 'The selected file changed during reading.',
  readDeadline: 'The file read exceeded the 30-second limit.',
  calculationDeadline: 'The calculation exceeded the 30-second limit.',
  cancelled: 'The verification was cancelled.',
});
const statuses = Object.freeze({ matched: 0, mismatched: 1, invalid: 2, unsupported: 2, 'numeric-refusal': 3, unavailable: 4 });
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const keys = ['format', 'version', 'status', 'chosenFileSha256', 'versionHash', 'enginePin', 'declared', 'recalculated', 'differences', 'issue', 'message'];
const exact = (value, expected) => value && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
export function verificationResult(status, values = {}, message = CLI_MESSAGES[status]) {
  return { format: 'charitology-model-verification', version: 1, status, chosenFileSha256: null, versionHash: null,
    enginePin: null, declared: null, recalculated: null, differences: [], issue: null, ...values, message };
}
export function exitCode(result) { return statuses[result.status] ?? 4; }
export class ModelBundleFileError extends Error {
  constructor(status, reason) { super(CLI_MESSAGES[reason]); this.name = 'ModelBundleFileError'; this.status = status; this.reason = reason; }
}
const refused = (status, reason) => { throw new ModelBundleFileError(status, reason); };
function deadline(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > CLI_LIMITS.deadline) refused('unavailable', 'unavailable');
  return value;
}
export function parseArguments(args) {
  if (!Array.isArray(args) || args.length < 1 || args.length > 2 || args.some(value => typeof value !== 'string') ||
      args.length === 2 && args[1] !== '--json' || !args[0] || args[0].startsWith('-') || args[0].includes('\0') ||
      /^[A-Za-z][A-Za-z0-9+.-]*:/.test(args[0])) refused('invalid', 'arguments');
  return Object.freeze({ file: args[0], json: args.length === 2 });
}
function metadata(stat) {
  if (![stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].every(value => typeof value === 'bigint')) refused('unavailable', 'platform');
  return { dev: stat.dev, ino: stat.ino, size: stat.size, mtimeNs: stat.mtimeNs, ctimeNs: stat.ctimeNs };
}
const same = (a, b) => ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(key => a[key] === b[key]);

/** Real held regular-file I/O. Observer/chunk/deadline controls are trusted test scheduling only;
 * the CLI supplies none and no file/argument can choose a filesystem, validator or engine. */
export async function readHeldModelFile(file, { signal, deadlineMs = CLI_LIMITS.deadline, chunkBytes = CLI_LIMITS.chunk, observer } = {}) {
  const duration = deadline(deadlineMs);
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > CLI_LIMITS.chunk) refused('unavailable', 'unavailable');
  if (![constants.O_NOFOLLOW, constants.O_NONBLOCK].every(value => Number.isInteger(value) && value > 0)) refused('unavailable', 'platform');
  const started = performance.now(), controller = new AbortController(); let handle, stream, expired = false;
  const abort = () => controller.abort();
  const timer = setTimeout(() => { expired = true; controller.abort(); stream?.destroy(); }, duration);
  signal?.addEventListener('abort', abort, { once: true });
  const check = () => {
    if (expired || performance.now() - started >= duration) refused('unavailable', 'readDeadline');
    if (controller.signal.aborted || signal?.aborted) refused('unavailable', 'cancelled');
  };
  try {
    check();
    try { handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
    catch (error) { if (error.code === 'ELOOP') refused('invalid', 'regular'); throw error; }
    check();
    const initialStat = await handle.stat({ bigint: true }); check();
    if (!initialStat.isFile()) refused('invalid', 'regular');
    const initial = metadata(initialStat);
    if (initial.size < 0n || initial.size > BigInt(CLI_LIMITS.bytes)) refused('invalid', 'size');
    observer?.opened?.(handle.fd); check();
    // Inclusive end is the cap+1 sentinel. No growing file can allocate/read beyond it.
    stream = handle.createReadStream({ autoClose: false, highWaterMark: chunkBytes, start: 0, end: CLI_LIMITS.bytes, signal: controller.signal });
    const chunks = []; let total = 0;
    for await (const chunk of stream) {
      check(); total += chunk.byteLength; observer?.chunk?.(chunk.byteLength, total); check();
      if (chunk.byteLength > CLI_LIMITS.chunk || total > CLI_LIMITS.bytes) refused('invalid', 'size');
      chunks.push(chunk);
    }
    check(); observer?.beforeRecheck?.(); check();
    const finalStat = await handle.stat({ bigint: true }); check();
    if (!finalStat.isFile() || !same(initial, metadata(finalStat)) || BigInt(total) !== initial.size) refused('unavailable', 'changed');
    const namedStat = await lstat(file, { bigint: true }); check();
    if (!namedStat.isFile() || !same(initial, metadata(namedStat))) refused('unavailable', 'changed');
    return Buffer.concat(chunks, total);
  } catch (error) {
    if (error instanceof ModelBundleFileError) throw error;
    if (expired || performance.now() - started >= duration) refused('unavailable', 'readDeadline');
    if (controller.signal.aborted || signal?.aborted) refused('unavailable', 'cancelled');
    refused('unavailable', 'unavailable');
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
    stream?.destroy();
    if (stream) await finished(stream, { cleanup: true }).catch(() => {});
    if (handle) { await handle.close(); observer?.closed?.(); }
  }
}

export function checkedVerification(value, chosenFileSha256) {
  if (!exact(value, keys) || value.format !== 'charitology-model-verification' || value.version !== 1 || !Object.hasOwn(statuses, value.status) ||
      value.chosenFileSha256 !== chosenFileSha256 || !Object.values(CLI_MESSAGES).includes(value.message) ||
      value.versionHash !== null && !hash(value.versionHash) || !Array.isArray(value.differences) || value.differences.length > RUN_FIELDS.length ||
      JSON.stringify(value).length > CLI_LIMITS.output || Buffer.byteLength(JSON.stringify(value) + '\n') > CLI_LIMITS.output) throw new TypeError('Invalid fixed verifier result.');
  if (value.enginePin !== null && (!exact(value.enginePin, ['id', 'version', 'definitionHash']) || value.enginePin.id !== 'charitology-ce-triangular-js-v1' || value.enginePin.version !== 1 || !hash(value.enginePin.definitionHash))) throw new TypeError('Invalid fixed verifier result.');
  for (const fingerprint of [value.declared, value.recalculated]) if (fingerprint !== null) validateFingerprint(fingerprint);
  if (value.issue !== null) validateNumericalIssue(value.issue);
  let prior = -1;
  for (const field of value.differences) { const index = RUN_FIELDS.indexOf(field); if (index <= prior) throw new TypeError('Invalid fixed verifier result.'); prior = index; }
  if (['matched', 'mismatched', 'numeric-refusal'].includes(value.status)) {
    if (!value.versionHash || !value.enginePin || !equal(value.enginePin, knownEnginePin()) || !value.declared) throw new TypeError('Invalid fixed verifier result.');
    if (value.status === 'numeric-refusal' ? value.recalculated !== null || value.issue === null || value.differences.length !== 0 : value.recalculated === null || value.issue !== null || (value.status === 'matched') !== (value.differences.length === 0)) throw new TypeError('Invalid fixed verifier result.');
    validateCopyObservation({ kind: value.status === 'numeric-refusal' ? 'arithmetic-refusal' : value.status,
      declared: value.declared, recalculated: value.recalculated, differences: value.differences,
      ...(value.status === 'numeric-refusal' ? { issue: value.issue } : {}) });
  } else if (value.versionHash !== null || value.enginePin !== null || value.declared !== null || value.recalculated !== null || value.issue !== null || value.differences.length) throw new TypeError('Invalid fixed verifier result.');
  return value;
}

/** A single fixed Node module worker; no caller/file can select its code or resource limits. */
export async function verifyInFixedWorker(bytes, { signal, deadlineMs = CLI_LIMITS.deadline, observer } = {}) {
  const duration = deadline(deadlineMs);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > CLI_LIMITS.bytes) return verificationResult('invalid', {}, CLI_MESSAGES.size);
  const chosenFileSha256 = createHash('sha256').update(bytes).digest('hex');
  if (signal?.aborted) return verificationResult('unavailable', { chosenFileSha256 }, CLI_MESSAGES.cancelled);
  const payload = new Uint8Array(bytes);
  const started = performance.now(); let worker, timer, abort, result;
  try {
    result = await new Promise(resolve => {
      worker = new Worker(new URL('./model-bundle-verifier-worker.mjs', import.meta.url), {
        argv: [], execArgv: [], env: {}, stdout: true, stderr: true,
        resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32 },
      });
      observer?.started?.(worker);
      const unavailable = message => resolve(verificationResult('unavailable', { chosenFileSha256 }, message));
      abort = () => unavailable(CLI_MESSAGES.cancelled); signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => unavailable(CLI_MESSAGES.calculationDeadline), duration);
      worker.stdout.on('data', () => unavailable(CLI_MESSAGES.unavailable));
      worker.stderr.on('data', () => unavailable(CLI_MESSAGES.unavailable));
      worker.once('error', () => unavailable(CLI_MESSAGES.unavailable));
      worker.once('exit', () => unavailable(CLI_MESSAGES.unavailable));
      worker.once('message', value => {
        if (performance.now() - started >= duration) { unavailable(CLI_MESSAGES.calculationDeadline); return; }
        try { resolve(checkedVerification(value, chosenFileSha256)); } catch { unavailable(CLI_MESSAGES.unavailable); }
      });
      if (signal?.aborted) { abort(); return; }
      worker.postMessage({ format: 'charitology-model-cli-job', version: 1, bytes: payload }, [payload.buffer]);
    });
  } catch { result = verificationResult('unavailable', { chosenFileSha256 }); }
  finally {
    clearTimeout(timer); if (abort) signal?.removeEventListener('abort', abort);
    if (worker) { await worker.terminate(); worker.removeAllListeners(); observer?.terminated?.(); }
  }
  return signal?.aborted ? verificationResult('unavailable', { chosenFileSha256 }, CLI_MESSAGES.cancelled) : result;
}
export async function verifyExplicitFile(file) {
  try { return await verifyInFixedWorker(await readHeldModelFile(file)); }
  catch (error) { return verificationResult(error instanceof ModelBundleFileError ? error.status : 'unavailable', {}, error instanceof ModelBundleFileError ? error.message : CLI_MESSAGES.unavailable); }
}
export function formatVerification(value, json) {
  const text = json ? JSON.stringify(value) + '\n' : [
    'Model bundle verification: ' + value.status, value.message,
    ...(value.chosenFileSha256 ? ['Chosen file SHA-256: ' + value.chosenFileSha256] : []),
    ...(value.versionHash ? ['Version SHA-256: ' + value.versionHash] : []),
    ...(value.enginePin ? ['Engine: ' + value.enginePin.id + '@' + value.enginePin.version + ' ' + value.enginePin.definitionHash] : []),
    ...(value.declared ? ['Declared run SHA-256: ' + value.declared.runHash] : []),
    ...(value.recalculated ? ['Recalculated run SHA-256: ' + value.recalculated.runHash] : []),
    'Differing fields: ' + (value.differences.join(', ') || 'none'),
    ...(value.issue ? ['Numerical issue: ' + JSON.stringify(value.issue)] : []), '',
  ].join('\n');
  if (Buffer.byteLength(text) > CLI_LIMITS.output) return formatVerification(verificationResult('unavailable'), json);
  return text;
}
