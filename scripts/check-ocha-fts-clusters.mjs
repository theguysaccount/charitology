import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const dir = 'public/data/funding-flows/ocha-fts-global-clusters';
const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
assert.equal(manifest.format, 'charitology-ocha-fts-global-clusters-v1');
assert.equal(manifest.counts.rows, 3958);
assert.equal(manifest.counts.distinctPlans, 313);
assert.equal(manifest.counts.distinctCountryCodes, 58);
assert.equal(manifest.counts.totalRequirementsUsd, 269485890686);
assert.equal(manifest.counts.totalReportedFundingUsd, 147196678998);

const gz = readFileSync(`${dir}/${manifest.artifacts.clusters.path}`);
assert.equal(gz.length, manifest.artifacts.clusters.bytes);
assert.equal(sha256(gz), manifest.artifacts.clusters.sha256);
const raw = gunzipSync(gz);
assert.equal(raw.length, manifest.artifacts.clusters.decodedBytes);
assert.equal(sha256(raw), manifest.artifacts.clusters.decodedSha256);
const rows = JSON.parse(raw.toString('utf8'));
assert.equal(rows.length, 3958);

let sumReq = 0;
let sumFund = 0;
for (const r of rows) {
  assert.ok(r.y >= 2019 && r.y <= 2026);
  sumReq += r.req ?? 0;
  sumFund += r.fund ?? 0;
}
assert.equal(sumReq, 269485890686);
assert.equal(sumFund, 147196678998);

const csvLines = readFileSync(`${dir}/yearly-summary.csv`, 'utf8').trim().split('\n');
assert.equal(csvLines.length, 9);

const html = readFileSync('dist/record/funding-flows/ocha-fts-global-clusters/index.html', 'utf8');
assert.ok(html.includes('3,958'), 'OCHA FTS page missing row count');
assert.ok(html.includes('data-ocha-fts'), 'OCHA FTS page missing mount');
assert.ok(html.includes('data-site-symbol="aidGap"'), 'OCHA FTS page missing aidGap symbol');

const gapMapHtml = readFileSync('dist/record/gap-map/index.html', 'utf8');
assert.ok(gapMapHtml.includes('/record/funding-flows/ocha-fts-global-clusters/'), 'Gap Map missing link to OCHA FTS global explorer');

console.log(
  `OCHA FTS Global Clusters verified: ${rows.length} rows across ${manifest.counts.distinctPlans} plans and ${manifest.counts.distinctCountryCodes} countries ($269.49B required / $147.20B funded) and matching built pages.`
);
