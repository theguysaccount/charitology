import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function sloveniaTinValid(s) {
  if (!/^\d{8}$/.test(s)) return false;
  const weights = [8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(s[i]) * weights[i];
  let chk = 11 - (sum % 11);
  if (chk === 10) chk = 0;
  if (chk === 11) return false;
  return Number(s[7]) === chk;
}

const regDir = 'public/data/charity-registry/slovenia';
const flowDir = 'public/data/funding-flows/slovenia-dohodnina-1-percent';

const manifest = JSON.parse(readFileSync(`${regDir}/manifest.json`, 'utf8'));
assert.equal(manifest.format, 'charitology-slovenia-registry-v1');
assert.equal(manifest.counts.includedOrganizations, 7567);
assert.equal(manifest.counts.uniqueTaxNumbers2023To2025, 7567);
assert.equal(manifest.counts.modulo11ValidTins, 7567);
assert.equal(manifest.counts.recipientsIn2025, 7434);
assert.equal(manifest.counts.disclosedIn2025, 6326);
assert.equal(manifest.counts.privacyRedactedIn2025, 1109);
assert.equal(manifest.annualSeries.length, 7);

const art = manifest.artifacts.organizations;
const gz = readFileSync(`${regDir}/${art.path}`);
assert.equal(gz.length, art.bytes);
assert.equal(sha256(gz), art.sha256);
const raw = gunzipSync(gz);
assert.equal(raw.length, art.decodedBytes);
assert.equal(sha256(raw), art.decodedSha256);

const rows = JSON.parse(raw.toString('utf8'));
assert.equal(rows.length, 7567);

const seen = new Set();
let cents2025 = 0;
let donors2025 = 0;
let redacted2025Count = 0;
const byTin = new Map();

for (const r of rows) {
  assert.ok(sloveniaTinValid(r.tin), `Invalid Slovenian mod-11 TIN ${r.tin}`);
  assert.ok(!seen.has(r.tin), `Duplicate TIN ${r.tin}`);
  seen.add(r.tin);
  byTin.set(r.tin, r);
  assert.ok(r.name.trim().length > 0);
  if (r.redacted2025) {
    redacted2025Count++;
    assert.equal(r.eur2025, null, `Redacted row must keep eur2025 null: ${r.tin}`);
    assert.equal(r.donors2025, null, `Redacted row must keep donors2025 null: ${r.tin}`);
  } else if (r.eur2025 !== null) {
    cents2025 += Math.round(r.eur2025 * 100);
    donors2025 += r.donors2025;
  }
}

assert.equal(redacted2025Count, 1109);
assert.equal(cents2025, 1924211709, '2025 exact euro-cent reconciliation mismatch');
assert.equal(donors2025, 737819, '2025 exact donor count mismatch');
assert.equal(byTin.get('53655869')?.name, 'DRUŠTVO ZA SRČNO ŽILNE BOLEZNI AED');
assert.equal(byTin.get('42192790')?.sharedTin, true);

const csvBuf = readFileSync(`${regDir}/${manifest.artifacts.csv.path}`);
assert.equal(csvBuf.length, manifest.artifacts.csv.bytes);
assert.equal(sha256(csvBuf), manifest.artifacts.csv.sha256);
assert.ok(csvBuf.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), 'Slovenia CSV missing UTF-8 BOM');

const anomBuf = readFileSync(`${regDir}/${manifest.artifacts.anomalies.path}`);
assert.equal(anomBuf.length, manifest.artifacts.anomalies.bytes);
assert.equal(sha256(anomBuf), manifest.artifacts.anomalies.sha256);
const anomalies = JSON.parse(anomBuf.toString('utf8'));
assert.equal(anomalies.summary.sharedTinInstances2023To2025, 3);

// Flow artifacts
const flowManifest = JSON.parse(readFileSync(`${flowDir}/manifest.json`, 'utf8'));
assert.equal(flowManifest.format, 'charitology-slovenia-dohodnina-flow-v1');
assert.equal(flowManifest.sevenYearTotals.disclosedTotalCents, 9347032060);
assert.equal(flowManifest.sevenYearTotals.disclosedTaxpayerChoices, 4185737);

const topGz = readFileSync(`${flowDir}/${flowManifest.artifacts.top250.path}`);
assert.equal(topGz.length, flowManifest.artifacts.top250.bytes);
assert.equal(sha256(topGz), flowManifest.artifacts.top250.sha256);
const topRows = JSON.parse(gunzipSync(topGz).toString('utf8'));
assert.equal(topRows.length, 250);

const annualCsv = readFileSync(`${flowDir}/${flowManifest.artifacts.annualCsv.path}`);
assert.equal(annualCsv.length, flowManifest.artifacts.annualCsv.bytes);
assert.equal(sha256(annualCsv), flowManifest.artifacts.annualCsv.sha256);

// Built HTML checks
const regHtml = readFileSync('dist/record/charity-index/slovenia/index.html', 'utf8');
assert.ok(regHtml.includes('7,567'), 'Slovenia registry page missing 7,567 count');
assert.ok(regHtml.includes('data-si-registry'), 'Slovenia registry page missing mount');
assert.ok(regHtml.includes('data-site-symbol="triglavPeak"'), 'Slovenia registry page missing triglavPeak symbol');

const flowHtml = readFileSync('dist/record/funding-flows/slovenia-dohodnina-1-percent/index.html', 'utf8');
assert.ok(flowHtml.includes('EUR 93.47M'), 'Slovenia flow page missing EUR 93.47M');
assert.ok(flowHtml.includes('data-si-flow'), 'Slovenia flow page missing mount');
assert.ok(flowHtml.includes('data-site-symbol="alpineOnePct"'), 'Slovenia flow page missing alpineOnePct symbol');

const coverageHtml = readFileSync('dist/record/charity-index/coverage/index.html', 'utf8');
assert.ok(coverageHtml.includes('id="slovenia"'), 'Coverage page missing Slovenia card');

console.log(
  `Slovenia FURS 1% release verified: ${seen.size} unique mod-11 TINs (2023–2025), 7-year EUR 93.47M across 4,185,737 choices, 2025 exact EUR ${(cents2025 / 100).toFixed(2)} and matching built pages.`,
);
