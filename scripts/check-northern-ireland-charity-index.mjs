import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const regDir = 'public/data/charity-registry/northern-ireland';
const manifest = JSON.parse(readFileSync(`${regDir}/manifest.json`, 'utf8'));

assert.equal(manifest.format, 'charitology-northern-ireland-registry-v1');
assert.equal(manifest.asOf, '2026-11-25');
assert.equal(manifest.counts.includedOrganizations, 8396);
assert.equal(manifest.counts.uniqueCharityNumbers, 8396);
assert.equal(manifest.counts.activeOrganizations, 7002);
assert.equal(manifest.counts.removedOrganizations, 1394);
assert.equal(manifest.counts.byStatusBucket.received_on_time, 4921);
assert.equal(manifest.counts.byStatusBucket.received_late, 778);
assert.equal(manifest.counts.byStatusBucket.overdue, 958);
assert.equal(manifest.counts.byStatusBucket.registered_no_return_due, 345);
assert.equal(manifest.counts.byStatusBucket.removed, 1394);
assert.equal(manifest.purposes.length, 12);
assert.equal(manifest.top20ActiveByIncome.length, 20);

const art = manifest.artifacts.organizations;
const gz = readFileSync(`${regDir}/${art.path}`);
assert.equal(gz.length, art.bytes, 'NI gzip byte length mismatch');
assert.equal(sha256(gz), art.sha256, 'NI gzip sha256 mismatch');
const raw = gunzipSync(gz);
assert.equal(raw.length, art.decodedBytes, 'NI decoded byte length mismatch');
assert.equal(sha256(raw), art.decodedSha256, 'NI decoded sha256 mismatch');

const rows = JSON.parse(raw.toString('utf8'));
assert.equal(rows.length, 8396);

const seen = new Set();
let activeCount = 0;
let removedCount = 0;
let activeIncomeSum = 0;
let activeSpendingSum = 0;
const byRegId = new Map();

for (const r of rows) {
  assert.match(r.regId, /^\d{6}$/, `Invalid regId ${r.regId}`);
  assert.equal(r.nic, `NIC${r.regId}`);
  assert.ok(!seen.has(r.regId), `Duplicate regId ${r.regId}`);
  seen.add(r.regId);
  byRegId.set(r.regId, r);
  assert.ok(r.name.trim().length > 0, `Empty name for ${r.regId}`);
  assert.match(r.registered, /^\d{4}-\d{2}-\d{2}$/, `Invalid registered date ${r.registered}`);
  // Privacy guard: ensure no PII fields leak into JSON
  assert.equal('email' in r, false, 'PII leak: email');
  assert.equal('telephone' in r, false, 'PII leak: telephone');
  assert.equal('publicAddress' in r, false, 'PII leak: publicAddress');
  if (r.website !== null) {
    assert.match(r.website, /^https?:\/\//, `Unsafe website scheme for ${r.regId}: ${r.website}`);
  }
  if (r.active) {
    activeCount++;
    if (r.income !== null) activeIncomeSum += r.income;
    if (r.spending !== null) activeSpendingSum += r.spending;
  } else {
    removedCount++;
  }
}

assert.equal(activeCount, 7002);
assert.equal(removedCount, 1394);
assert.equal(activeIncomeSum, manifest.financialTotalsGbp.activeTotalIncomeGbp);
assert.equal(activeSpendingSum, manifest.financialTotalsGbp.activeTotalSpendingGbp);

// Spot-check canonical institutions
assert.equal(byRegId.get('101788')?.name, "The Queen's University of Belfast");
assert.equal(byRegId.get('100166')?.name, 'University of Ulster');
assert.equal(byRegId.get('100002')?.name, 'Cancer Lifeline');

const csvBuf = readFileSync(`${regDir}/${manifest.artifacts.csv.path}`);
assert.equal(csvBuf.length, manifest.artifacts.csv.bytes);
assert.equal(sha256(csvBuf), manifest.artifacts.csv.sha256);
assert.ok(csvBuf.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), 'NI CSV missing UTF-8 BOM');

const anomBuf = readFileSync(`${regDir}/${manifest.artifacts.anomalies.path}`);
assert.equal(anomBuf.length, manifest.artifacts.anomalies.bytes);
assert.equal(sha256(anomBuf), manifest.artifacts.anomalies.sha256);
const anomalies = JSON.parse(anomBuf.toString('utf8'));
assert.equal(anomalies.summary.negativeFinancialRowsCount, 3);
assert.equal(anomalies.summary.largeUnverifiedOutliersCount, 1);

const regHtml = readFileSync('dist/record/charity-index/northern-ireland/index.html', 'utf8');
assert.ok(regHtml.includes('8,396'), 'NI registry page missing 8,396 count');
assert.ok(regHtml.includes('data-ni-registry'), 'NI registry page missing mount');
assert.ok(regHtml.includes('data-site-symbol="basaltColumn"'), 'NI registry page missing basaltColumn symbol');

const coverageHtml = readFileSync('dist/record/charity-index/coverage/index.html', 'utf8');
assert.ok(coverageHtml.includes('id="northern-ireland"'), 'Coverage page missing Northern Ireland card');

console.log(
  `Northern Ireland CCNI release verified: ${seen.size} unique NIC charities (${activeCount} active, ${removedCount} removed, £${activeIncomeSum.toLocaleString('en-US')} active income, 12 statutory purposes) and matching built pages.`,
);
