import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// 1. Verify Czechia Public Registers nonprofit edition
const regDir = 'public/data/charity-registry/czechia';
const regManifest = JSON.parse(readFileSync(`${regDir}/manifest.json`, 'utf8'));
assert.equal(regManifest.format, 'charitology-czechia-registry-v1');
assert.equal(regManifest.counts.includedOrganizations, 135532);
assert.equal(regManifest.counts.byForm.spolek, 101988);
assert.equal(regManifest.counts.byForm.pobspolek, 25054);
assert.equal(regManifest.counts.byForm.nadf, 3445);
assert.equal(regManifest.counts.byForm.ops, 2390);
assert.equal(regManifest.counts.byForm.ustav, 2024);
assert.equal(regManifest.counts.byForm.nad, 631);
assert.equal(regManifest.counts.byStatus.active, 126730);
assert.equal(regManifest.counts.byStatus.liquidation, 5935);
assert.equal(regManifest.counts.byStatus.deleted, 2817);
assert.equal(regManifest.counts.byStatus.insolvency, 50);
assert.equal(regManifest.counts.withRegisteredCapital, 3982);
assert.equal(regManifest.counts.totalRegisteredCapitalHaler, 1732592414039);
assert.equal(regManifest.counts.withEuProjects2021to2027, 1669);

const seenOrgs = new Set();
let capCount = 0;
let capSum = 0;
let euOrgCount = 0;
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
    if (row.capHaler !== null) {
      capCount++;
      capSum += row.capHaler;
    }
    if (row.euCount > 0) euOrgCount++;
  }
}
assert.equal(seenOrgs.size, regManifest.counts.includedOrganizations);
assert.equal(capCount, 3982);
assert.equal(capSum, 1732592414039);
assert.equal(euOrgCount, 1669);

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

// 2. Verify Czechia EU Cohesion Policy 2021-2027 projects
const flowDir = 'public/data/funding-flows/czechia-eu-funds';
const flowManifest = JSON.parse(readFileSync(`${flowDir}/manifest.json`, 'utf8'));
const anomalies = JSON.parse(readFileSync(`${flowDir}/anomalies.json`, 'utf8'));
assert.equal(flowManifest.format, 'charitology-czechia-eu-funds-v1');
assert.equal(flowManifest.counts.nonprofitProjects, 3906);
assert.equal(flowManifest.counts.distinctNonprofitRecipients, 1669);
assert.equal(flowManifest.counts.totalCostHaler, 2382766793219);
assert.equal(flowManifest.counts.totalEuSupportHaler, 1785050886214);
assert.equal(flowManifest.counts.totalPaidEligibleHaler, 1188545611625);
assert.equal(anomalies.multiProcurementRowExpansion.collapsedProcurementRows, 8194);
assert.equal(anomalies.unmatchedNonprofitLabeledOperations.count, 1);

const projGz = readFileSync(`${flowDir}/${flowManifest.artifacts.projects.path}`);
assert.equal(projGz.length, flowManifest.artifacts.projects.bytes);
assert.equal(sha256(projGz), flowManifest.artifacts.projects.sha256);
const projRaw = gunzipSync(projGz);
assert.equal(sha256(projRaw), flowManifest.artifacts.projects.decodedSha256);
const projects = JSON.parse(projRaw.toString('utf8'));
assert.equal(projects.length, 3906);

let sumCost = 0;
let sumEu = 0;
let sumPaid = 0;
const seenProj = new Set();
for (const p of projects) {
  assert.ok(!seenProj.has(p.id), `Duplicate project ID ${p.id}`);
  seenProj.add(p.id);
  assert.ok(seenOrgs.has(p.ico), `Recipient absent from Czechia registry: ${p.ico}`);
  sumCost += p.costHaler;
  sumEu += p.euHaler;
  sumPaid += p.paidEligibleHaler;
}
assert.equal(sumCost, 2382766793219);
assert.equal(sumEu, 1785050886214);
assert.equal(sumPaid, 1188545611625);

const csvLines = readFileSync(`${flowDir}/funds-summary.csv`, 'utf8').trim().split('\n');
assert.equal(csvLines.length, 7);

// 3. Verify built HTML pages
const regHtml = readFileSync('dist/record/charity-index/czechia/index.html', 'utf8');
assert.ok(regHtml.includes('135,532'), 'Czechia registry page missing org count');
assert.ok(regHtml.includes('data-czechia-registry'), 'Czechia registry page missing mount');
assert.ok(regHtml.includes('data-site-symbol="lindenLeaf"'), 'Czechia registry page missing lindenLeaf symbol');

const flowHtml = readFileSync('dist/record/funding-flows/czechia-eu-funds/index.html', 'utf8');
assert.ok(flowHtml.includes('25755277'), 'Czechia EU page missing People in Need (Člověk v tísni) ICO');
assert.ok(flowHtml.includes('data-cz-eu'), 'Czechia EU page missing mount');
assert.ok(flowHtml.includes('data-site-symbol="endowmentVault"'), 'Czechia EU page missing endowmentVault symbol');

const coverageHtml = readFileSync('dist/record/charity-index/coverage/index.html', 'utf8');
assert.ok(coverageHtml.includes('id="czechia"'), 'Coverage page missing Czechia card');

console.log(
  `Czechia release verified: ${seenOrgs.size} nonprofits (${capCount} with registered CZK capital totaling CZK 17,325,924,140.39) + ${projects.length} EU 2021-2027 projects (CZK 23,827,667,932.19 total cost) and matching built pages.`
);
