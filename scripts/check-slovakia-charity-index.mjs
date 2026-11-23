import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// 1. Verify Slovakia 10-year 2%/3% recipient registry
const regDir = 'public/data/charity-registry/slovakia';
const regManifest = JSON.parse(readFileSync(`${regDir}/manifest.json`, 'utf8'));
assert.equal(regManifest.format, 'charitology-slovakia-registry-v1');
assert.equal(regManifest.counts.includedOrganizations, 26357);
assert.equal(regManifest.counts.active2025Organizations, 17457);
assert.equal(regManifest.counts.presentAll10Years, 5338);
assert.equal(regManifest.counts.total10YearEurCents, 78206365720);
assert.equal(regManifest.counts.total2025EurCents, 10704391000);

const seenOrgs = new Set();
let sum10y = 0;
let sum25 = 0;
let count25 = 0;
for (const [bkt, shard] of Object.entries(regManifest.shards.names)) {
  const gz = readFileSync(`${regDir}/${shard.path}`);
  assert.equal(gz.length, shard.bytes, `Byte mismatch ${bkt}`);
  assert.equal(sha256(gz), shard.sha256, `SHA mismatch ${bkt}`);
  const raw = gunzipSync(gz);
  assert.equal(raw.length, shard.decodedBytes, `Decoded len ${bkt}`);
  assert.equal(sha256(raw), shard.decodedSha256, `Decoded SHA ${bkt}`);
  const rows = JSON.parse(raw.toString('utf8'));
  assert.equal(rows.length, shard.rows, `Row count ${bkt}`);
  for (const row of rows) {
    assert.match(row.ico, /^[0-9]{8}$/, `Invalid 8-digit ICO ${row.ico}`);
    assert.ok(!seenOrgs.has(row.ico), `Duplicate ICO ${row.ico}`);
    seenOrgs.add(row.ico);
    assert.ok(row.name.trim().length > 0, `Empty name ${row.ico}`);
    sum10y += row.totalCents;
    if (row.y2025Cents !== null) {
      count25++;
      sum25 += row.y2025Cents;
    }
  }
}
assert.equal(seenOrgs.size, 26357);
assert.equal(count25, 17457);
assert.equal(sum10y, 78206365720);
assert.equal(sum25, 10704391000);

const idTotal = Object.entries(regManifest.shards.ids).reduce((acc, [pfx, shard]) => {
  const gz = readFileSync(`${regDir}/${shard.path}`);
  assert.equal(gz.length, shard.bytes, `ID shard len ${pfx}`);
  assert.equal(sha256(gz), shard.sha256, `ID shard sha ${pfx}`);
  const raw = gunzipSync(gz);
  assert.equal(sha256(raw), shard.decodedSha256, `ID decoded sha ${pfx}`);
  const rows = JSON.parse(raw.toString('utf8'));
  assert.equal(rows.length, shard.rows);
  return acc + rows.length;
}, 0);
assert.equal(idTotal, 26357);

// 2. Verify Slovakia funding flows ledger
const flowDir = 'public/data/funding-flows/slovakia-pit-2-percent';
const flowManifest = JSON.parse(readFileSync(`${flowDir}/manifest.json`, 'utf8'));
const anomalies = JSON.parse(readFileSync(`${flowDir}/anomalies.json`, 'utf8'));
assert.equal(flowManifest.format, 'charitology-slovakia-pit-2-percent-v1');
assert.equal(flowManifest.counts.distinctOrganizations10y, 26357);
assert.equal(flowManifest.counts.total10YearEurCents, 78206365720);
assert.equal(anomalies.duplicateIcoRowsInSameYear.count, 60);

const payGz = readFileSync(`${flowDir}/${flowManifest.artifacts.payouts.path}`);
assert.equal(payGz.length, flowManifest.artifacts.payouts.bytes);
assert.equal(sha256(payGz), flowManifest.artifacts.payouts.sha256);
const payRaw = gunzipSync(payGz);
assert.equal(sha256(payRaw), flowManifest.artifacts.payouts.decodedSha256);
const payouts = JSON.parse(payRaw.toString('utf8'));
assert.equal(payouts.length, 26357);

const csvLines = readFileSync(`${flowDir}/yearly-summary.csv`, 'utf8').trim().split('\n');
assert.equal(csvLines.length, 11);

// 3. Verify built HTML pages
const regHtml = readFileSync('dist/record/charity-index/slovakia/index.html', 'utf8');
assert.ok(regHtml.includes('26,357'), 'Slovakia registry page missing org count');
assert.ok(regHtml.includes('data-slovakia-registry'), 'Slovakia registry page missing mount');
assert.ok(regHtml.includes('data-site-symbol="tatraPeak"'), 'Slovakia registry page missing tatraPeak symbol');

const flowHtml = readFileSync('dist/record/funding-flows/slovakia-pit-2-percent/index.html', 'utf8');
assert.ok(flowHtml.includes('31784828'), 'Slovakia PIT page missing Nadácia Pontis ICO');
assert.ok(flowHtml.includes('data-sk-pit'), 'Slovakia PIT page missing mount');
assert.ok(flowHtml.includes('data-site-symbol="taxAssign"'), 'Slovakia PIT page missing taxAssign symbol');

const coverageHtml = readFileSync('dist/record/charity-index/coverage/index.html', 'utf8');
assert.ok(coverageHtml.includes('id="slovakia"'), 'Coverage page missing Slovakia card');

console.log(
  `Slovakia release verified: ${seenOrgs.size} unique 2%/3% recipients (2016-2025, EUR 782,063,657.20 cumulative, 17,457 active in 2025) and matching built pages.`
);
