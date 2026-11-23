import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// 1. Verify Estonia nonprofit, TMNSN & annual XBRL financials registry
const regDir = 'public/data/charity-registry/estonia';
const regManifest = JSON.parse(readFileSync(`${regDir}/manifest.json`, 'utf8'));
assert.equal(regManifest.format, 'charitology-estonia-registry-v1');
assert.equal(regManifest.counts.includedOrganizations, 24155);
assert.equal(regManifest.counts.byForm.MTU, 23210);
assert.equal(regManifest.counts.byForm.SA, 784);
assert.equal(regManifest.counts.byForm.AU, 161);
assert.equal(regManifest.counts.byStatus.active, 23635);
assert.equal(regManifest.counts.byStatus.absent_from_rik, 13);
assert.equal(regManifest.counts.byTmnsn.active, 2974);
assert.equal(regManifest.counts.byTmnsn.removed2025, 4);
assert.equal(regManifest.counts.rikApartmentAssociationsExcluded, 25709);
assert.equal(regManifest.counts.withFinancialReports2023to2025, 19238);
assert.equal(regManifest.counts.withEuEeaProjects, 697);

const seenOrgs = new Set();
let activeTmnsnCheck = 0;
let removedTmnsnCheck = 0;
let finOrgCheck = 0;
let euOrgCheck = 0;
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
    assert.match(row.reg, /^[0-9]{8}$/, `Invalid 8-digit regcode ${row.reg}`);
    assert.ok(!seenOrgs.has(row.reg), `Duplicate regcode ${row.reg}`);
    seenOrgs.add(row.reg);
    assert.ok(row.name.trim().length > 0, `Empty name ${row.reg}`);
    if (row.tmnsn === 'active') activeTmnsnCheck++;
    if (row.tmnsn === 'removed_2025') removedTmnsnCheck++;
    if (row.fin.length > 0) finOrgCheck++;
    if (row.euCount > 0) euOrgCheck++;
  }
}
assert.equal(seenOrgs.size, regManifest.counts.includedOrganizations);
assert.equal(activeTmnsnCheck, 2974);
assert.equal(removedTmnsnCheck, 4);
assert.equal(finOrgCheck, 19238);
assert.equal(euOrgCheck, 697);

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
assert.equal(idTotal, regManifest.counts.includedOrganizations);

// 2. Verify Estonia EU Cohesion, JTF, RRF & EEA/Norway projects
const flowDir = 'public/data/funding-flows/estonia-eu-funds';
const flowManifest = JSON.parse(readFileSync(`${flowDir}/manifest.json`, 'utf8'));
const anomalies = JSON.parse(readFileSync(`${flowDir}/anomalies.json`, 'utf8'));
assert.equal(flowManifest.format, 'charitology-estonia-eu-funds-v1');
assert.equal(flowManifest.counts.nonprofitProjects, 1566);
assert.equal(flowManifest.counts.distinctNonprofitRecipients, 697);
assert.equal(flowManifest.counts.totalBudgetCents, 262226192919);
assert.equal(flowManifest.counts.totalGrantCents, 180584775983);
assert.equal(flowManifest.counts.totalPaidCents, 147749765539);
assert.equal(anomalies.emtaActiveAbsentFromRik.count, 13);

const projGz = readFileSync(`${flowDir}/${flowManifest.artifacts.projects.path}`);
assert.equal(projGz.length, flowManifest.artifacts.projects.bytes);
assert.equal(sha256(projGz), flowManifest.artifacts.projects.sha256);
const projRaw = gunzipSync(projGz);
assert.equal(sha256(projRaw), flowManifest.artifacts.projects.decodedSha256);
const projects = JSON.parse(projRaw.toString('utf8'));
assert.equal(projects.length, 1566);

let sumBud = 0;
let sumGrant = 0;
let sumPaid = 0;
for (const p of projects) {
  assert.ok(seenOrgs.has(p.reg), `Recipient absent from Estonia registry: ${p.reg}`);
  sumBud += p.budgetCents;
  sumGrant += p.grantCents;
  sumPaid += p.paidCents;
}
assert.equal(sumBud, 262226192919);
assert.equal(sumGrant, 180584775983);
assert.equal(sumPaid, 147749765539);

const csvLines = readFileSync(`${flowDir}/programs-summary.csv`, 'utf8').trim().split('\n');
assert.equal(csvLines.length, 8);

// 3. Verify built HTML pages
const regHtml = readFileSync('dist/record/charity-index/estonia/index.html', 'utf8');
assert.ok(regHtml.includes('24,155'), 'Estonia registry page missing org count');
assert.ok(regHtml.includes('data-estonia-registry'), 'Estonia registry page missing mount');
assert.ok(regHtml.includes('data-site-symbol="balticPine"'), 'Estonia registry page missing balticPine symbol');

const flowHtml = readFileSync('dist/record/funding-flows/estonia-eu-funds/index.html', 'utf8');
assert.ok(flowHtml.includes('90006012'), 'Estonia EU page missing EIS top recipient regcode');
assert.ok(flowHtml.includes('data-ee-eu'), 'Estonia EU page missing mount');
assert.ok(flowHtml.includes('data-site-symbol="euGrant"'), 'Estonia EU page missing euGrant symbol');

const coverageHtml = readFileSync('dist/record/charity-index/coverage/index.html', 'utf8');
assert.ok(coverageHtml.includes('id="estonia"'), 'Coverage page missing Estonia card');

console.log(
  `Estonia release verified: ${seenOrgs.size} nonprofits (${activeTmnsnCheck} active TMNSN, ${removedTmnsnCheck} removed 2025, 13 EMTA-only, ${finOrgCheck} with 2023-2025 XBRL financials) + ${projects.length} EU/EEA projects (EUR 2,622,261,929.19 budget) and matching built pages.`
);
