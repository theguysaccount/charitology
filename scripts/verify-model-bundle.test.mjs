import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, stat, readdir } from 'node:fs/promises';
import { appendFileSync, fstatSync, renameSync, writeFileSync, utimesSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { CLI_LIMITS, CLI_MESSAGES, ModelBundleFileError, readHeldModelFile, verifyInFixedWorker, parseArguments, checkedVerification } from './model-bundle-verifier.mjs';
import { fixtureSelected, sealFixtureVersion } from '../src/lib/model-bundles/test-fixtures.mjs';
import { hashValue, prettyBytes, sha256Bytes } from '../src/lib/model-bundles/codec.mjs';
import { inputHash } from '../src/lib/model-bundles/interpretations/v1/encoding.mjs';
const run = promisify(execFile), cli = fileURLToPath(new URL('./verify-model-bundle.mjs', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function temporary(t) { const dir = await mkdtemp(path.join(tmpdir(), 'charitology-model-cli-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }
async function invoke(args) {
  try { const result = await run(process.execPath, [cli, ...args], { timeout: 10000, maxBuffer: CLI_LIMITS.output * 2 }); return { ...result, code: 0 }; }
  catch (error) { if (!Number.isInteger(error.code)) throw error; return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
}
function closed(fd) { assert.throws(() => fstatSync(fd), error => error.code === 'EBADF'); }

test('exact arguments reject alternate inputs and never grant a caller-raised deadline or read chunk', async () => {
  assert.deepEqual(parseArguments(['chosen.json', '--json']), { file: 'chosen.json', json: true });
  for (const args of [[], ['-'], ['--json'], ['--json', 'chosen.json'], ['chosen.json', '--json', '--json'], ['chosen.json', '--wat'], ['a', 'b'], ['https://example.invalid/private'], ['file:///private/file'], ['stdin:'], ['a\0b']]) assert.throws(() => parseArguments(args), error => error instanceof ModelBundleFileError && error.status === 'invalid');
  await assert.rejects(readHeldModelFile('never-opened', { deadlineMs: 30001 }), ModelBundleFileError);
  await assert.rejects(readHeldModelFile('never-opened', { chunkBytes: 65537 }), ModelBundleFileError);
});

test('actual held temporary files enforce exact cap, cap+1, short chunks and finally close without source writes', async t => {
  const dir = await temporary(t), file = path.join(dir, 'exact-private-cap.json'), bytes = Buffer.alloc(CLI_LIMITS.bytes, 120);
  await writeFile(file, bytes); const before = await stat(file, { bigint: true }); let fd, closes = 0, maximum = 0, total = 0;
  const result = await readHeldModelFile(file, { observer: { opened: value => { fd = value; }, chunk: (size, read) => { maximum = Math.max(maximum, size); total = read; }, closed: () => { closes++; } } });
  assert.equal(result.byteLength, CLI_LIMITS.bytes); assert.equal(total, CLI_LIMITS.bytes); assert.ok(maximum <= CLI_LIMITS.chunk); assert.equal(closes, 1); closed(fd);
  const after = await stat(file, { bigint: true }); for (const key of ['size', 'mtimeNs', 'ctimeNs', 'dev', 'ino']) assert.equal(after[key], before[key]);
  assert.equal(sha(result), sha(bytes));
  const short = path.join(dir, 'short.json'); await writeFile(short, Buffer.from('abcdefghij')); const chunks = [];
  assert.equal((await readHeldModelFile(short, { chunkBytes: 3, observer: { chunk: size => chunks.push(size) } })).toString(), 'abcdefghij');
  assert.ok(chunks.every(size => size <= 3)); assert.equal(chunks.reduce((sum, size) => sum + size, 0), 10);
  await appendFileSync(file, 'x'); let oversizedFd;
  await assert.rejects(readHeldModelFile(file, { observer: { opened: value => { oversizedFd = value; } } }), error => error.reason === 'size');
  assert.equal(oversizedFd, undefined, 'An initially oversized file is refused before any payload read.');
});

test('growth, replacement, final symlink and submillisecond metadata changes refuse the held file identity', async t => {
  const dir = await temporary(t), grow = path.join(dir, 'growing.json'); await writeFile(grow, 'small'); let growthTotal = 0, growthFd;
  await assert.rejects(readHeldModelFile(grow, { observer: { opened: value => { growthFd = value; appendFileSync(grow, Buffer.alloc(CLI_LIMITS.bytes + 100, 120)); }, chunk: (_size, total) => { growthTotal = total; } } }), error => error.reason === 'size');
  assert.equal(growthTotal, CLI_LIMITS.bytes + 1); closed(growthFd);
  const replace = path.join(dir, 'replaced.json'); await writeFile(replace, 'same-length'); let replacedFd;
  await assert.rejects(readHeldModelFile(replace, { observer: { opened: value => { replacedFd = value; renameSync(replace, replace + '.held'); writeFileSync(replace, 'same-length'); } } }), error => error.reason === 'changed'); closed(replacedFd);
  const linked = path.join(dir, 'later-link.json'); await writeFile(linked, 'original');
  await assert.rejects(readHeldModelFile(linked, { observer: { beforeRecheck: () => { renameSync(linked, linked + '.held'); symlinkSync(linked + '.held', linked); } } }), error => error.reason === 'changed');
  const changed = path.join(dir, 'metadata.json'); await writeFile(changed, 'unchanged-content'); utimesSync(changed, 1700000000, 1700000000.000123);
  const initial = statSync(changed, { bigint: true }); let ending;
  await assert.rejects(readHeldModelFile(changed, { observer: { beforeRecheck: () => { utimesSync(changed, 1700000000, 1700000000.000124); ending = statSync(changed, { bigint: true }); } } }), error => error.reason === 'changed');
  assert.equal(initial.mtimeNs / 1000000n, ending.mtimeNs / 1000000n); assert.notEqual(initial.mtimeNs, ending.mtimeNs);
});

test('actual directory, final symlink and FIFO refuse promptly without following or blocking', async t => {
  const dir = await temporary(t), file = path.join(dir, 'source.json'), link = path.join(dir, 'link.json'); await writeFile(file, '{}'); symlinkSync(file, link);
  for (const input of [dir, link]) await assert.rejects(readHeldModelFile(input), error => error.status === 'invalid' && error.reason === 'regular');
  if (process.platform !== 'win32') { const fifo = path.join(dir, 'never-open-as-a-stream'); execFileSync('mkfifo', [fifo]); const started = Date.now();
    await assert.rejects(readHeldModelFile(fifo), error => error.status === 'invalid' && error.reason === 'regular'); assert.ok(Date.now() - started < 2000); }
});

test('real regular-file deadline and cancellation destroy the read and close its exact held descriptor', async t => {
  const dir = await temporary(t), file = path.join(dir, 'deadline.json'); await writeFile(file, Buffer.alloc(CLI_LIMITS.bytes, 120)); let fd, closes = 0;
  await assert.rejects(readHeldModelFile(file, { deadlineMs: 500, chunkBytes: 1, observer: { opened: value => { fd = value; }, closed: () => { closes++; } } }), error => error.reason === 'readDeadline');
  assert.equal(closes, 1); closed(fd);
  const controller = new AbortController(); let cancelledFd;
  await assert.rejects(readHeldModelFile(file, { signal: controller.signal, observer: { opened: value => { cancelledFd = value; controller.abort(); } } }), error => error.reason === 'cancelled'); closed(cancelledFd);
});

test('fixed actual worker compares installed engine results, full-array hashes, refused numerics and unknown descriptors', async () => {
  for (const [kind, expected] of [['matched', 'matched'], ['mismatched', 'mismatched'], ['refused', 'numeric-refusal'], ['unsupported', 'unsupported']]) {
    const bytes = await fixtureSelected(kind), result = await verifyInFixedWorker(bytes);
    assert.equal(result.status, expected); assert.equal(result.chosenFileSha256, sha(bytes)); assert.ok(Buffer.byteLength(JSON.stringify(result) + '\n') <= CLI_LIMITS.output);
    if (kind === 'matched') { assert.deepEqual(result.declared, result.recalculated); assert.deepEqual(result.differences, []); }
    if (kind === 'mismatched') { assert.deepEqual(result.differences, ['cost']); assert.notEqual(result.declared.runHash, result.recalculated.runHash); assert.equal(result.declared.costsSha256, result.recalculated.costsSha256); }
    if (kind === 'refused') { assert.equal(result.issue.path, 'discount.v'); assert.equal(result.recalculated, null); }
    if (kind === 'unsupported') { assert.equal(result.versionHash, null); assert.equal(result.declared, null); }
  }
  const malformed = JSON.parse(new TextDecoder().decode(await fixtureSelected())); malformed.engine = {};
  assert.equal((await verifyInFixedWorker(new TextEncoder().encode(JSON.stringify(malformed)))).status, 'invalid');
  assert.equal((await verifyInFixedWorker(new Uint8Array([0xef, 0xbb, 0xbf, 123, 125]))).status, 'invalid');
  const inconsistent = JSON.parse(new TextDecoder().decode(await fixtureSelected()));
  inconsistent.modelVersion.content.enginePin.definitionHash = '0'.repeat(64);
  inconsistent.modelVersion.content.run.inputHash = await inputHash(inconsistent.modelVersion.content.enginePin, inconsistent.modelVersion.content.input);
  inconsistent.modelVersion = await sealFixtureVersion(inconsistent.modelVersion); delete inconsistent.checksum;
  inconsistent.checksum = await hashValue('selected', inconsistent);
  assert.equal((await verifyInFixedWorker(prettyBytes(inconsistent))).status, 'invalid', 'A known engine paired with a different content pin is a broken internal reference.');
});

test('actual fixed worker deadline and abort terminate it without retaining a completed comparison', async () => {
  const bytes = await fixtureSelected(); let worker, terminated = 0;
  const result = await verifyInFixedWorker(bytes, { deadlineMs: 1, observer: { started: value => { worker = value; }, terminated: () => { terminated++; } } });
  assert.equal(result.status, 'unavailable'); assert.equal(result.message, CLI_MESSAGES.calculationDeadline); assert.equal(terminated, 1); assert.equal(worker.threadId, -1);
  const controller = new AbortController(); const cancelled = await verifyInFixedWorker(bytes, { signal: controller.signal, observer: { started: () => controller.abort() } });
  assert.equal(cancelled.status, 'unavailable'); assert.equal(cancelled.message, CLI_MESSAGES.cancelled);
});

test('parent admission rejects forged comparison fingerprints and a different engine pin in fixed-worker results', async () => {
  const bytes = await fixtureSelected(), result = await verifyInFixedWorker(bytes);
  assert.equal(result.status, 'matched');
  for (const mutate of [value => { value.recalculated.runHash = '0'.repeat(64); },
    value => { value.enginePin.definitionHash = '0'.repeat(64); },
    value => { value.status = 'mismatched'; value.differences = ['cost']; },
    value => { value.status = 'mismatched'; value.differences = ['cost']; value.recalculated.costsSha256 = '0'.repeat(64); value.recalculated.runHash = '1'.repeat(64); },
    value => { value.differences = Array(100000).fill('cost'); }]) {
    const changed = structuredClone(result); mutate(changed); assert.throws(() => checkedVerification(changed, result.chosenFileSha256));
  }
});

test('actual CLI exit codes, fixed bounded output and file fingerprints contain no selected path or private narrative', async t => {
  const dir = await temporary(t);
  for (const [kind, code, status] of [['matched', 0, 'matched'], ['mismatched', 1, 'mismatched'], ['refused', 3, 'numeric-refusal'], ['unsupported', 2, 'unsupported']]) {
    const bytes = await fixtureSelected(kind), file = path.join(dir, 'private-narrative-' + kind + '.json'); await writeFile(file, bytes);
    const before = await stat(file, { bigint: true }), listing = await readdir(dir), actual = await invoke([file, '--json']), report = JSON.parse(actual.stdout);
    assert.equal(actual.code, code); assert.equal(report.status, status); assert.equal(actual.stderr, ''); assert.equal(report.chosenFileSha256, sha(bytes));
    assert.ok(Buffer.byteLength(actual.stdout) <= CLI_LIMITS.output); assert.equal(actual.stdout.includes(dir), false); assert.equal(actual.stdout.includes('Fictional test model'), false);
    assert.deepEqual(await readFile(file), Buffer.from(bytes)); const after = await stat(file, { bigint: true });
    for (const key of ['size', 'mtimeNs', 'ctimeNs']) assert.equal(after[key], before[key]); assert.deepEqual(await readdir(dir), listing);
  }
  const missing = await invoke([path.join(dir, 'secret-unavailable-path'), '--json']); assert.equal(missing.code, 4); assert.equal(JSON.parse(missing.stdout).status, 'unavailable'); assert.equal(missing.stdout.includes(dir), false); assert.equal(missing.stderr, '');
  for (const args of [[], ['-'], ['https://example.invalid/private', '--json'], ['a', '--json', '--json'], ['a', '--unknown']]) {
    const result = await invoke(args); assert.equal(result.code, 2); assert.equal(result.stderr, ''); assert.ok(Buffer.byteLength(result.stdout) <= CLI_LIMITS.output); assert.equal(result.stdout.includes('example.invalid'), false);
  }
});

test('an actual admitted selected bundle at the complete file cap reproduces and cap+1 refuses before parsing', async t => {
  const dir = await temporary(t), file = path.join(dir, 'exact-complete-selected.json'), bytes = await fixtureSelected();
  const complete = Buffer.concat([Buffer.from(bytes), Buffer.alloc(CLI_LIMITS.bytes - bytes.byteLength, 32)]);
  await writeFile(file, complete);
  const matched = await invoke([file, '--json']); assert.equal(matched.code, 0); assert.equal(JSON.parse(matched.stdout).chosenFileSha256, sha(complete));
  const text = await invoke([file]); assert.equal(text.code, 0); assert.match(text.stdout, /^Model bundle verification: matched\n/); assert.ok(Buffer.byteLength(text.stdout) <= CLI_LIMITS.output); assert.equal(text.stdout.includes(dir), false);
  appendFileSync(file, ' '); const refused = await invoke([file, '--json']); assert.equal(refused.code, 2);
  const report = JSON.parse(refused.stdout); assert.equal(report.status, 'invalid'); assert.equal(report.chosenFileSha256, null); assert.equal(report.message, CLI_MESSAGES.size);
});

test('resealed unknown supplied source stays inert and never falls back to the installed numerical implementation', async () => {
  const bundle = JSON.parse(new TextDecoder().decode(await fixtureSelected())), engine = bundle.engine;
  engine.files[0].rawUtf8 += '\nthrow new Error("PRIVATE-SUPPLIED-SOURCE-MUST-NOT-EXECUTE");\n';
  const raw = new TextEncoder().encode(engine.files[0].rawUtf8); engine.files[0].byteLength = raw.length; engine.files[0].sha256 = await sha256Bytes(raw);
  engine.definition.sourceFiles[0] = { path: engine.files[0].path, byteLength: raw.length, sha256: engine.files[0].sha256 };
  engine.definitionHash = await hashValue('engine', engine.definition); bundle.modelVersion.content.enginePin.definitionHash = engine.definitionHash;
  bundle.modelVersion.content.run.inputHash = await inputHash(bundle.modelVersion.content.enginePin, bundle.modelVersion.content.input);
  bundle.modelVersion = await sealFixtureVersion(bundle.modelVersion); delete bundle.checksum; bundle.checksum = await hashValue('selected', bundle);
  const result = await verifyInFixedWorker(prettyBytes(bundle)); assert.equal(result.status, 'unsupported'); assert.equal(JSON.stringify(result).includes('PRIVATE-SUPPLIED-SOURCE'), false);
});
