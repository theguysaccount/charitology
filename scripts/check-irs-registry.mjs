// Integrity and cross-index verification of every committed public IRS identity.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import ts from 'typescript';
import { validateRegistryManifest, validateIdentityRows, createRegistry } from '../src/lib/irs-registry.mjs';
const directory = path.resolve('public/data/irs-registry');
const manifest = validateRegistryManifest(JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = new Map(); let count = 0, leadingZero = 0, missingState = 0, totalBytes = 0;
function read(spec) {
  const raw = fs.readFileSync(path.join(directory, spec.path)); totalBytes += raw.length;
  assert.equal(raw.length, spec.bytes, `${spec.path} compressed bytes`); assert.equal(sha(raw), spec.sha256, `${spec.path} digest`);
  const decoded = gunzipSync(raw, { maxOutputLength: spec.decodedBytes + 1 }); assert.equal(decoded.length, spec.decodedBytes, `${spec.path} decoded bytes`);
  assert.equal(sha(decoded), spec.decodedSha256, `${spec.path} decoded digest`);
  return decoded.toString('utf8');
}
for (const [bucket, spec] of Object.entries(manifest.shards.names)) {
  const rows = validateIdentityRows(JSON.parse(read(spec)), spec, bucket);
  for (const row of rows) {
    assert.equal(expected.has(row[0]), false, 'cross-shard duplicate EIN'); expected.set(row[0], bucket); count++;
    if (row[0].startsWith('0')) leadingZero++; if (row[3] === null) missingState++;
  }
}
for (const [prefix, spec] of Object.entries(manifest.shards.eins)) {
  const rows = read(spec).split('\n'); assert.equal(rows.length, spec.rows);
  let previous = '';
  for (const row of rows) {
    assert.match(row, /^\d{7}[A-Z0-9_]$/); assert.ok(row.slice(0, 7) > previous, 'EIN directory is sorted and unique'); previous = row.slice(0, 7);
    const ein = prefix + row.slice(0, 7); assert.equal(expected.get(ein), row[7], 'directory points to actual identity shard'); expected.delete(ein);
  }
}
assert.equal(expected.size, 0, 'every identity is reachable by exact EIN'); assert.equal(count, manifest.recordCount);
assert.equal(totalBytes, manifest.compressedBytes); assert.ok(totalBytes < 50 * 1024 ** 2); assert.ok(leadingZero > 0); assert.ok(missingState > 0);
assert.deepEqual(manifest.fields, ['ein', 'name', 'city', 'state', 'subsection', 'status', 'deductibility', 'region'], 'no contact, street, financial, scoring or private OS columns');
// Exercise real browser-compatible gzip + integrity + exact-EIN path, using the
// actual committed leading-zero record and only local synthetic HTTP responses.
const calls = [];
const registry = createRegistry({ base: 'https://charitology.org/data/irs-registry/', fetcher: async (url, options) => {
  calls.push(url); assert.equal(options.credentials, 'omit');
  const relative = new URL(url).pathname.replace('/data/irs-registry/', '');
  assert.match(relative, /^(?:manifest\.json|(?:names\/[A-Z0-9_]\.json|eins\/\d{2}\.txt)\.gz)$/);
  return new Response(fs.readFileSync(path.join(directory, relative)));
} });
const found = await registry.search({ ein: '01-0674605' });
assert.equal(found.organizations[0]?.ein, '010674605'); assert.equal(found.organizations[0]?.sourceRegion, 4); assert.equal(found.organizations[0]?.country, null);
assert.equal(found.organizations[0]?.sourceSha256, manifest.sources[3].sha256); assert.equal(calls.length, 3);
// Strict-check both executable UI scripts, using their real relative imports.
const virtual = new Map();
for (const file of ['src/components/RegistrySearch.astro', 'src/components/tools/charity-lookup.astro']) {
  const source = fs.readFileSync(file, 'utf8'); let i = 0;
  for (const match of source.matchAll(/<script>([\s\S]*?)<\/script>/g)) virtual.set(`${path.resolve(file)}.registry-${i++}.ts`, `${match[1]}\nexport {};`);
}
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile), parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const options = { ...parsed.options, lib: ['lib.esnext.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'], noEmit: true };
const host = ts.createCompilerHost(options), get = host.getSourceFile.bind(host), exists = host.fileExists.bind(host), readFile = host.readFile.bind(host);
host.getSourceFile = (name, language, onError, create) => virtual.has(name) ? ts.createSourceFile(name, virtual.get(name), language, true) : get(name, language, onError, create);
host.fileExists = name => virtual.has(name) || exists(name); host.readFile = name => virtual.get(name) ?? readFile(name);
const program = ts.createProgram([...virtual.keys(), path.resolve('node_modules/astro/client.d.ts')], options, host), diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length, 0, diagnostics.map(d => `${d.file?.fileName ?? ''}:${d.start == null ? '' : d.file.getLineAndCharacterOfPosition(d.start).line + 1} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`).join('\n'));
console.log(`✓ IRS registry: ${count.toLocaleString('en-US')} identities, ${Object.keys(manifest.shards.names).length + Object.keys(manifest.shards.eins).length} hashed gzip shards, ${(totalBytes / 1024 ** 2).toFixed(2)} MiB; all EIN routes and two strict UI modules verified. Leading-zero EINs: ${leadingZero.toLocaleString('en-US')}; unknown filing states preserved: ${missingState.toLocaleString('en-US')}.`);
