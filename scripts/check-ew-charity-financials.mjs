import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const root = new URL('../public/data/charity-financials/ew/', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = name => readFileSync(new URL(name, root));
const manifest = JSON.parse(read('manifest.json'));
const counts = manifest.counts;
const numberPattern = /^[0-9]{6,8}$/;
const amountPattern = /^-?[0-9]{1,13}(?:\.[0-9]{1,2})?$/;
const yearPattern = /^202[345]-/;

function day(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0, 10) === value;
}

function readShard(group, bucket, asset) {
  assert.equal(asset.path, `${group}/${bucket}.json.gz`);
  const packed = read(asset.path);
  assert.equal(packed.length, asset.bytes);
  assert.equal(hash(packed), asset.sha256);
  assert.ok(asset.decodedBytes > 0 && asset.decodedBytes <= 16_000_000);
  const raw = gunzipSync(packed, { maxOutputLength: asset.decodedBytes });
  assert.equal(raw.length, asset.decodedBytes);
  assert.equal(hash(raw), asset.decodedSha256);
  const rows = JSON.parse(raw);
  assert.equal(rows.length, asset.rows);
  return rows;
}

assert.equal(manifest.format, 'charitology-ew-returns-v1');
assert.equal(manifest.currency, 'GBP');
assert.ok(day(manifest.date));
assert.equal(manifest.registeredMain, 171945);
assert.equal(manifest.organizations, 157367);
assert.equal(manifest.multiPeriod, 151712);
assert.deepEqual(counts, {
  input: 1253044, suppressedOrUnknown: 3881, outsideRegisteredMainScope: 477079, outsidePeriod: 297691,
  returnNotReceived: 21999, included: 452394,
});
assert.equal(counts.input, Object.entries(counts).filter(([key]) => key !== 'input').reduce((sum, [, value]) => sum + value, 0));
for (const group of ['names', 'ids']) {
  assert.deepEqual(readdirSync(new URL(group, root)).sort(), Object.keys(manifest[group]).map(key => key + '.json.gz').sort());
}
for (const source of Object.values(manifest.sources)) {
  assert.match(source.url, /^https:\/\/ccewuksprdoneregsadata1\.blob\.core\.windows\.net\/data\/txt\/publicextract\.[a-z_]+\.zip$/);
  assert.match(source.sha256, /^[0-9a-f]{64}$/);
}

const directory = new Map();
const regulatorIds = new Set();
const records = new Set();
let multiPeriod = 0;
let filings = 0;
for (const [bucket, asset] of Object.entries(manifest.names)) {
  assert.match(bucket, /^[a-z0-9_]$/);
  for (const row of readShard('names', bucket, asset)) {
    assert.equal(row.length, 4);
    const [number, name, regulatorId, history] = row;
    assert.ok(typeof number === 'string' && numberPattern.test(number) && !directory.has(number));
    assert.ok(typeof name === 'string' && name === name.trim() && name.length > 0);
    assert.ok(typeof regulatorId === 'string' && /^[0-9]+$/.test(regulatorId) && !regulatorIds.has(regulatorId));
    const initial = name.normalize('NFKD').toLowerCase().match(/[\p{L}\p{N}]/u)?.[0] ?? '_';
    assert.equal(bucket, /^[a-z0-9]$/.test(initial) ? initial : '_');
    directory.set(number, bucket);
    regulatorIds.add(regulatorId);
    assert.ok(Array.isArray(history) && history.length > 0);
    if (history.length > 1) multiPeriod++;
    let previous = '';
    for (const filing of history) {
      assert.equal(filing.length, 6);
      const [start, end, received, income, expense, sourceRecord] = filing;
      assert.ok(day(start) && day(end) && day(received) && start <= end && yearPattern.test(end));
      for (const amount of [income, expense]) assert.ok(amount === null || (typeof amount === 'string' && amountPattern.test(amount)));
      const period = end + start;
      assert.ok(!previous || previous > period);
      previous = period;
      assert.ok(Number.isSafeInteger(sourceRecord) && sourceRecord >= 1 && sourceRecord <= counts.input && !records.has(sourceRecord));
      records.add(sourceRecord);
      filings++;
    }
  }
}
assert.equal(directory.size, manifest.organizations);
assert.equal(filings, counts.included);
assert.equal(multiPeriod, manifest.multiPeriod);
for (const [prefix, asset] of Object.entries(manifest.ids)) {
  assert.match(prefix, /^[0-9]{2}$/);
  for (const row of readShard('ids', prefix, asset)) {
    assert.equal(row.length, 2);
    const [number, bucket] = row;
    assert.ok(number.startsWith(prefix));
    assert.equal(directory.get(number), bucket);
    directory.delete(number);
  }
}
assert.equal(directory.size, 0);
console.log(`England and Wales financial snapshot verified across all shards: ${filings} annual returns.`);
