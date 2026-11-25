import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const regDir = 'public/data/charity-registry/colombia';
const manifest = JSON.parse(readFileSync(`${regDir}/manifest.json`, 'utf8'));

assert.equal(manifest.format, 'charitology-colombia-registry-v1');
assert.equal(manifest.asOf, '2022');
assert.equal(manifest.counts.includedOrganizations, 112201);
assert.equal(manifest.counts.uniqueNits, 112201);
assert.equal(manifest.counts.activeIn2022, 45171);
assert.equal(manifest.counts.continuousAllFiveYears, 38624);
assert.equal(manifest.counts.droppedBefore2020, 59348);
assert.equal(manifest.counts.sameYearDuplicateRowsRemoved, 400);
assert.equal(manifest.annualSeries.length, 5);

// Verify all ID shards sum cleanly to 112,201 unique 9-digit NITs
const seenIdNits = new Set();
let active2022 = 0;
let all5 = 0;
let eternitFound = false;

for (const [pref, art] of Object.entries(manifest.artifacts.idShards)) {
  const gz = readFileSync(`${regDir}/${art.path}`);
  assert.equal(gz.length, art.bytes, `Colombia id shard ${pref} bytes mismatch`);
  assert.equal(sha256(gz), art.sha256, `Colombia id shard ${pref} sha256 mismatch`);
  const raw = gunzipSync(gz);
  assert.equal(raw.length, art.decodedBytes, `Colombia id shard ${pref} decodedBytes mismatch`);
  assert.equal(sha256(raw), art.decodedSha256, `Colombia id shard ${pref} decodedSha256 mismatch`);
  const rows = JSON.parse(raw.toString('utf8'));
  assert.equal(rows.length, art.rows);
  for (const r of rows) {
    assert.match(r.n, /^\d{9}$/, `Invalid NIT ${r.n}`);
    assert.equal(r.n.slice(0, 2), pref);
    assert.ok(!seenIdNits.has(r.n), `Duplicate NIT ${r.n}`);
    seenIdNits.add(r.n);
    assert.ok(r.nm.trim().length > 0);
    if (r.a22) active2022++;
    if (r.a5) all5++;
    if (r.n === '800000383' && r.nm === 'FUNDACION ETERNIT') eternitFound = true;
  }
}

assert.equal(seenIdNits.size, 112201);
assert.equal(active2022, 45171);
assert.equal(all5, 38624);
assert.equal(eternitFound, true, 'Missing spot-check NIT 800000383 FUNDACION ETERNIT');

// Verify all name shards hash cleanly and sum to 112,201
let nameTotal = 0;
for (const [key, art] of Object.entries(manifest.artifacts.nameShards)) {
  const gz = readFileSync(`${regDir}/${art.path}`);
  assert.equal(gz.length, art.bytes, `Colombia name shard ${key} bytes mismatch`);
  assert.equal(sha256(gz), art.sha256, `Colombia name shard ${key} sha256 mismatch`);
  const raw = gunzipSync(gz);
  assert.equal(raw.length, art.decodedBytes);
  assert.equal(sha256(raw), art.decodedSha256);
  const rows = JSON.parse(raw.toString('utf8'));
  assert.equal(rows.length, art.rows);
  nameTotal += rows.length;
}
assert.equal(nameTotal, 112201);

const annualCsv = readFileSync(`${regDir}/${manifest.artifacts.annualCsv.path}`);
assert.equal(annualCsv.length, manifest.artifacts.annualCsv.bytes);
assert.equal(sha256(annualCsv), manifest.artifacts.annualCsv.sha256);

const anomBuf = readFileSync(`${regDir}/${manifest.artifacts.anomalies.path}`);
assert.equal(anomBuf.length, manifest.artifacts.anomalies.bytes);
assert.equal(sha256(anomBuf), manifest.artifacts.anomalies.sha256);

const regHtml = readFileSync('dist/record/charity-index/colombia/index.html', 'utf8');
assert.ok(regHtml.includes('112,201'), 'Colombia registry page missing 112,201 count');
assert.ok(regHtml.includes('data-co-registry'), 'Colombia registry page missing mount');
assert.ok(regHtml.includes('data-site-symbol="emeraldPrism"'), 'Colombia registry page missing emeraldPrism symbol');

const coverageHtml = readFileSync('dist/record/charity-index/coverage/index.html', 'utf8');
assert.ok(coverageHtml.includes('id="colombia"'), 'Coverage page missing Colombia card');

console.log(
  `Colombia DIAN RTE release verified: ${seenIdNits.size} unique 9-digit NITs (${active2022} active in 2022, ${all5} continuous 2018–2022, 9 ID shards + 27 name shards) and matching built pages.`,
);
