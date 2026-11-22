import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseCsv } from '../src/lib/client/csv.ts';

const regSrc = 'public/data/charity-registry/israel';
const regDist = 'dist/data/charity-registry/israel';
const flowSrc = 'public/data/funding-flows/israel-foreign-state-donations';
const flowDist = 'dist/data/funding-flows/israel-foreign-state-donations';

const sha = data => createHash('sha256').update(data).digest('hex');

function verifyShard(srcDir, distDir, asset) {
  const packed = readFileSync(join(srcDir, asset.path));
  assert.equal(packed.length, asset.bytes, asset.path);
  assert.equal(sha(packed), asset.sha256, asset.path);
  assert.deepEqual(readFileSync(join(distDir, asset.path)), packed);
  const decoded = gunzipSync(packed);
  assert.equal(decoded.length, asset.decodedBytes, asset.path);
  assert.ok(decoded.length <= 16_000_000, asset.path);
  assert.equal(sha(decoded), asset.decodedSha256, asset.path);
  const rows = JSON.parse(decoded);
  assert.equal(rows.length, asset.rows, asset.path);
  return rows;
}

const pins = Object.fromEntries(
  readFileSync('src/data/israel-index-sources.tsv', 'utf8')
    .trimEnd()
    .split('\n')
    .slice(1)
    .map(line => {
      const [name, url, bytes, hash] = line.split('\t');
      return [name, { url, bytes: Number(bytes), sha256: hash }];
    }),
);

// 1. Verify merged Israel Amutot + PBC registry manifest & all shards
const regManifest = JSON.parse(readFileSync(join(regSrc, 'manifest.json'), 'utf8'));
assert.equal(regManifest.format, 'charitology-israel-moj-v1');
assert.equal(regManifest.sources.amutot.sha256, pins['amutot.json.gz'].sha256);
assert.equal(regManifest.sources.pbc.sha256, pins['pbc.json.gz'].sha256);
assert.equal(regManifest.sources.properManagement.sha256, pins['proper_management.json.gz'].sha256);
assert.deepEqual(readdirSync(regSrc).sort(), ['en.json.gz', 'ids', 'manifest.json', 'names']);

for (const section of ['ids', 'names']) {
  assert.deepEqual(
    readdirSync(join(regSrc, section)).sort(),
    Object.keys(regManifest[section]).map(k => k + '.json.gz').sort(),
  );
}

const regIds = new Map();
const regEn = new Map();
let activeCount = 0;
let pbcCount = 0;
let withRev = 0;
let revSum = 0;
let fsdFlagged = 0;
let pm2026Plus = 0;

for (const [bucket, asset] of Object.entries(regManifest.names)) {
  for (const row of verifyShard(regSrc, regDist, asset)) {
    assert.equal(row.length, regManifest.fields.length);
    const [id, type, heName, enName, statusCode, , , , , , revenueIls, , , , pmApproved, , hasFsd] = row;
    assert.ok(/^[0-9]{9,10}$/.test(id) && !regIds.has(id) && (heName.trim().length > 0 || (enName && enName.trim().length > 0)), id);
    assert.ok(type === 'A' || type === 'P', type);
    assert.ok(['A', 'P', 'L', 'D'].includes(statusCode), statusCode);
    if (statusCode === 'A') activeCount++;
    if (type === 'P') pbcCount++;
    if (revenueIls !== null) { withRev++; revSum += revenueIls; }
    if (pmApproved !== null && pmApproved >= 2026) pm2026Plus++;
    if (hasFsd) fsdFlagged++;
    if (enName) regEn.set(id, { bucket, enName });
    regIds.set(id, bucket);
  }
}

const directed = new Set();
for (const [prefix, asset] of Object.entries(regManifest.ids)) {
  for (const [id, bucket] of verifyShard(regSrc, regDist, asset)) {
    assert.equal(id.slice(0, 2), prefix);
    assert.equal(regIds.get(id), bucket);
    assert.ok(!directed.has(id));
    directed.add(id);
  }
}

const enIndex = verifyShard(regSrc, regDist, regManifest.englishIndex);
assert.equal(enIndex.length, regEn.size);
for (const [id, bucket, enName] of enIndex) {
  const expected = regEn.get(id);
  assert.ok(expected && expected.bucket === bucket && expected.enName === enName, id);
}

assert.equal(regIds.size, 76_203);
assert.equal(regIds.size, directed.size);
assert.equal(regIds.size, regManifest.counts.includedOrganizations);
assert.equal(activeCount, regManifest.counts.byStatus.active);
assert.equal(pbcCount, regManifest.counts.byType.PublicBenefitCompany);
assert.equal(withRev, regManifest.counts.withReportedRevenue);
assert.equal(revSum, regManifest.counts.reportedRevenueSumIls);
assert.equal(pm2026Plus, regManifest.counts.withProperManagement2026Or2027);
assert.equal(fsdFlagged, regManifest.counts.matchedForeignStateDonations2012to2026);

// 2. Verify Foreign State Donations 2012-2026 edition
const flowManifest = JSON.parse(readFileSync(join(flowSrc, 'manifest.json'), 'utf8'));
assert.equal(flowManifest.format, 'charitology-israel-foreign-state-donations-v1');
assert.equal(flowManifest.currency, 'ILS');
assert.equal(flowManifest.source.sha256, pins['foreign_state_donations.json.gz'].sha256);
assert.equal(flowManifest.registrySnapshot.amutotSha256, regManifest.sources.amutot.sha256);

const recipients = verifyShard(flowSrc, flowDist, flowManifest.asset);
assert.equal(recipients.length, 516);
assert.equal(recipients.length, flowManifest.counts.distinctRecipients);

const byId = new Map();
let totalIls = 0;
let totalRows = 0;
let matchedCount = 0;

for (const row of recipients) {
  assert.equal(row.length, flowManifest.fields.length);
  const [id, heName, , type, inReg, , , orgIls, rowCount, , , , , , byYear] = row;
  assert.ok(/^[0-9]{9}$/.test(id) && heName.trim().length > 0 && !byId.has(id), id);
  assert.ok(['A', 'P', 'U'].includes(type), type);
  assert.equal(inReg, regIds.has(id), id);
  if (inReg) matchedCount++;
  const yrSum = Object.values(byYear).reduce((a, b) => a + b, 0);
  assert.equal(yrSum, orgIls, id);
  totalIls += orgIls;
  totalRows += rowCount;
  byId.set(id, row);
}

assert.equal(matchedCount, fsdFlagged);
assert.equal(matchedCount, flowManifest.counts.matchedInRegistry);
assert.equal(totalIls, flowManifest.counts.netIls);
assert.equal(totalRows, flowManifest.counts.totalDisclosureRows);

// Verify flagship recipient + 2 leaked production test IDs + self-donor anomaly
const holocaustFund = byId.get('580185700');
assert.ok(holocaustFund && holocaustFund[7] === 5_043_142_896 && holocaustFund[4] === true);
assert.ok(byId.get('580666667')?.[4] === false);
assert.ok(byId.get('580666683')?.[4] === false);

const anomaliesBytes = readFileSync(join(flowSrc, 'anomalies.json'));
assert.equal(anomaliesBytes.length, flowManifest.anomalies.bytes);
assert.equal(sha(anomaliesBytes), flowManifest.anomalies.sha256);
const anomalies = JSON.parse(anomaliesBytes);
assert.equal(anomalies.suspectedProductionTestRecipientsCount, 2);
assert.equal(anomalies.selfDonorFilingAnomaliesCount, 1);
assert.equal(anomalies.negativeAdjustmentRowsCount, 2);

const csvBytes = readFileSync(join(flowSrc, 'yearly-2012-2026.csv'));
assert.equal(csvBytes.length, flowManifest.yearlyCsv.bytes);
assert.equal(sha(csvBytes), flowManifest.yearlyCsv.sha256);
const [, ...csvRows] = parseCsv(csvBytes.toString('utf8').replace(/^\uFEFF/, ''));
assert.equal(csvRows.length, 15);
assert.equal(csvRows.reduce((acc, r) => acc + Number(r[6]), 0), flowManifest.counts.netIls);

for (const [srcDir, distDir, file] of [
  [regSrc, regDist, 'manifest.json'],
  [flowSrc, flowDist, 'manifest.json'],
  [flowSrc, flowDist, 'anomalies.json'],
  [flowSrc, flowDist, 'yearly-2012-2026.csv'],
]) {
  assert.deepEqual(readFileSync(join(distDir, file)), readFileSync(join(srcDir, file)), file);
}

// 3. Verify built HTML pages and cross-links
const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const regRoute = '/record/charity-index/israel/';
const flowRoute = '/record/funding-flows/israel-foreign-state-donations/';
const page = route => readFileSync('dist' + route + 'index.html', 'utf8');

const regHtml = page(regRoute);
const flowHtml = page(flowRoute);
assert.ok(regHtml.includes('data-israel-registry'));
assert.ok(regHtml.includes(`href="${base}${flowRoute}"`));
assert.ok(regHtml.includes('76,203'));
assert.ok(flowHtml.includes('data-il-fsd'));
assert.ok(flowHtml.includes(`href="${base}${regRoute}"`));
assert.ok(flowHtml.includes('580185700'));
assert.ok(flowHtml.includes('580666667'));
assert.ok(flowHtml.includes('ILS 7,525,406,162'));
for (const html of [regHtml, flowHtml]) {
  assert.ok(html.includes('github.com/theguysaccount/charitology/issues/new'));
}
assert.ok(page('/record/charity-index/coverage/').includes(`href="${base}${regRoute}"`));
assert.ok(page('/record/charity-index/coverage/').includes(`href="${base}${flowRoute}"`));
assert.ok(page('/record/funding-flows/').includes(`href="${base}${flowRoute}"`));
console.log(`Israel release verified: ${regIds.size} merged orgs (${enIndex.length} English names) + ${byId.size} foreign-state donation recipients (${totalRows} rows, ILS ${totalIls.toLocaleString('en-US')} net, 2 test IDs flagged) and matching built pages.`);
