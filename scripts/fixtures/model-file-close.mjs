// Real-file regression fixture. The parent supplies the one-worker pool before startup.
import assert from 'node:assert/strict';
import { open, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { constants, fstatSync, openSync, closeSync, renameSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeHeldModelRead } from '../model-bundle-verifier.mjs';

assert.equal(process.env.UV_THREADPOOL_SIZE, '1');
const dir = await mkdtemp(path.join(tmpdir(), 'charitology-model-close-'));
let handle, stream, gateOpening, gateReleased = false;
const gate = path.join(dir, 'close-gate');
function releaseGate() {
  if (gateOpening && !gateReleased) {
    const writer = openSync(gate, constants.O_WRONLY);
    closeSync(writer); gateReleased = true;
  }
}
const identity = fd => { const { dev, ino } = fstatSync(fd, { bigint: true }); return { dev, ino }; };
function closed(fd, original) {
  try { assert.notDeepEqual(identity(fd), original, 'The original held file must be closed.'); }
  catch (error) { if (error.code !== 'EBADF') throw error; }
}
try {
  const file = path.join(dir, 'replacement.json'); await writeFile(file, 'same-length');
  handle = await open(file, 'r'); const fd = handle.fd, original = identity(fd);
  renameSync(file, file + '.held'); writeFileSync(file, 'same-length');
  stream = handle.createReadStream({ autoClose: false, emitClose: true, start: 0, end: 2097152 });
  for await (const _chunk of stream) { /* Drain the actual held file. */ }
  // This actual FIFO open occupies the sole pool worker until we open its writer.
  // The later native close is queued behind it, independent of machine speed.
  execFileSync('mkfifo', [gate]);
  gateOpening = open(gate, constants.O_RDONLY);
  const order = []; stream.once('close', () => order.push('stream-close'));
  let settled = false;
  const closing = closeHeldModelRead(handle, stream).then(() => { settled = true; order.push('cleanup-return'); });
  closing.catch(() => {});
  let pendingBeforeRelease, heldBeforeRelease;
  try {
    await new Promise(resolve => setImmediate(resolve));
    pendingBeforeRelease = !settled;
    heldBeforeRelease = identity(fd);
  } finally { releaseGate(); }
  const gateHandle = await gateOpening; await gateHandle.close(); gateOpening = undefined;
  await closing;
  assert.equal(pendingBeforeRelease, true, 'Cleanup must wait for the manually held native close.');
  assert.deepEqual(heldBeforeRelease, original);
  assert.deepEqual(order, ['stream-close', 'cleanup-return']);
  assert.equal(stream.closed, true); closed(fd, original);
  // Repeated cleanup of an already-closed real stream remains harmless.
  await closeHeldModelRead(handle, stream);

  handle = await open(file, 'r'); const abortedFd = handle.fd, abortedOriginal = identity(abortedFd);
  const controller = new AbortController();
  stream = handle.createReadStream({ autoClose: false, emitClose: true, signal: controller.signal });
  controller.abort();
  await closeHeldModelRead(handle, stream);
  assert.equal(stream.closed, true); closed(abortedFd, abortedOriginal);
  await closeHeldModelRead(handle, stream);
  process.stdout.write(JSON.stringify({ endedReplacementClosed: true, abortedStreamClosed: true, repeatedCleanupPassed: true }) + '\n');
} finally {
  releaseGate();
  if (gateOpening) await (await gateOpening).close();
  if (handle) await closeHeldModelRead(handle, stream).catch(() => {});
  await rm(dir, { recursive: true, force: true });
}
