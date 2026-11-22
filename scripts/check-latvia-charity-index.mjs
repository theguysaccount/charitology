import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// 1. Verify Latvia nonprofit & SLO registry
const regDir = 'public/data/charity-registry/latvia';
const regManifest = JSON.parse(readFileSync(`${regDir}/manifest.json`, 'utf8'));
assert.equal(regManifest.format, 'charitology.latvia-nonprofit-registry.v1');
assert.equal(regManifest.counts.includedOrganizations, 34057);
assert.equal(regManifest.counts.byStatus.active, 29191);
assert.equal(regManifest.counts.byStatus.liquidated, 4782);
assert.equal(regManifest.counts.byStatus.reorganized, 83);
assert.equal(regManifest.counts.byStatus.absentFromUr, 1);
assert.equal(regManifest.counts.vidSloByStatus.activeSlo, 1689);
assert.equal(regManifest.counts.vidSloByStatus.revokedSlo, 2403);
assert.equal(regManifest.counts.vidSloByStatus.liquidatedSlo, 81);
assert.equal(regManifest.counts.housingManagementAssociations, 4897);

const seenOrgs = new Set();
let activeSloCheck = 0;
let revokedSloCheck = 0;
let leadOrgCheck = 0;
for (const [bkt, shard] of Object.entries(regManifest.names)) {
  const gz = readFileSync(`${regDir}/${shard.path}`);
  assert.equal(gz.length, shard.bytes, `Byte mismatch ${bkt}`);
  assert.equal(sha256(gz), shard.sha256, `SHA mismatch ${bkt}`);
  const raw = gunzipSync(gz);
  assert.equal(raw.length, shard.decodedBytes, `Decoded len ${bkt}`);
  assert.equal(sha256(raw), shard.decodedSha256, `Decoded SHA ${bkt}`);
  const rows = JSON.parse(raw.toString('utf8'));
  assert.equal(rows.length, shard.rows, `Row count ${bkt}`);
  for (const row of rows) {
    const [rc, name, , , , , sloSt, , , , , euLeadCnt] = row;
    assert.match(rc, /^[0-9]{11}$/, `Invalid 11-digit regcode ${rc}`);
    assert.ok(!seenOrgs.has(rc), `Duplicate regcode ${rc}`);
    seenOrgs.add(rc);
    assert.ok(name.trim().length > 0, `Empty name ${rc}`);
    if (sloSt === 'A') activeSloCheck++;
    if (sloSt === 'R') revokedSloCheck++;
    if (euLeadCnt > 0) leadOrgCheck++;
  }
}
assert.equal(seenOrgs.size, regManifest.counts.includedOrganizations);
assert.equal(activeSloCheck, 1689);
assert.equal(revokedSloCheck, 2403);
assert.equal(leadOrgCheck, 146);

const idTotal = Object.entries(regManifest.ids).reduce((acc, [pfx, shard]) => {
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

// 2. Verify Latvia EU Cohesion & Recovery Fund flows
const flowDir = 'public/data/funding-flows/latvia-eu-funds';
const flowManifest = JSON.parse(readFileSync(`${flowDir}/manifest.json`, 'utf8'));
const anomalies = JSON.parse(readFileSync(`${flowDir}/anomalies.json`, 'utf8'));
assert.equal(flowManifest.format, 'charitology.latvia-eu-funds.v1');
assert.equal(flowManifest.counts.nonprofitLeadProjects, 292);
assert.equal(flowManifest.counts.distinctLeadNonprofits, 146);
assert.equal(flowManifest.counts.totalLeadCents, 23347370090);
assert.equal(flowManifest.counts.euCofinancingCents, 18008746950);
assert.equal(flowManifest.counts.nonprofitPartnerParticipations, 260);
assert.equal(anomalies.sloAbsentFromEnterpriseRegister.length, 1);
assert.equal(anomalies.sloAbsentFromEnterpriseRegister[0].regcode, '90002493065');

const projGz = readFileSync(`${flowDir}/${flowManifest.projectsAsset.path}`);
assert.equal(projGz.length, flowManifest.projectsAsset.bytes);
assert.equal(sha256(projGz), flowManifest.projectsAsset.sha256);
const projRaw = gunzipSync(projGz);
assert.equal(sha256(projRaw), flowManifest.projectsAsset.decodedSha256);
const projects = JSON.parse(projRaw.toString('utf8'));
assert.equal(projects.length, 292);

let sumTot = 0;
let sumEu = 0;
for (const p of projects) {
  assert.ok(seenOrgs.has(p[4]), `Lead regcode absent from Latvia registry: ${p[4]}`);
  sumTot += p[12];
  sumEu += p[13];
}
assert.equal(sumTot, 23347370090);
assert.equal(sumEu, 18008746950);

const partGz = readFileSync(`${flowDir}/${flowManifest.partnersAsset.path}`);
assert.equal(partGz.length, flowManifest.partnersAsset.bytes);
assert.equal(sha256(partGz), flowManifest.partnersAsset.sha256);
const partRaw = gunzipSync(partGz);
assert.equal(sha256(partRaw), flowManifest.partnersAsset.decodedSha256);
const partners = JSON.parse(partRaw.toString('utf8'));
assert.equal(partners.length, 260);
for (const pt of partners) {
  assert.ok(seenOrgs.has(pt[2]), `Partner regcode absent from Latvia registry: ${pt[2]}`);
}

const csvLines = readFileSync(`${flowDir}/programs-summary.csv`, 'utf8').trim().split('\n');
assert.equal(csvLines.length, 6);

// 3. Verify built HTML pages
const regHtml = readFileSync('dist/record/charity-index/latvia/index.html', 'utf8');
assert.ok(regHtml.includes('34,057'), 'Latvia registry page missing org count');
assert.ok(regHtml.includes('data-latvia-registry'), 'Latvia registry page missing mount');
assert.ok(regHtml.includes('data-site-symbol="amber"'), 'Latvia registry page missing amber symbol');

const flowHtml = readFileSync('dist/record/funding-flows/latvia-eu-funds/index.html', 'utf8');
assert.ok(flowHtml.includes('40008001803'), 'Latvia EU page missing Samaritan Association regcode');
assert.ok(flowHtml.includes('data-lv-eu'), 'Latvia EU page missing mount');
assert.ok(flowHtml.includes('data-site-symbol="cohesion"'), 'Latvia EU page missing cohesion symbol');

const coverageHtml = readFileSync('dist/record/charity-index/coverage/index.html', 'utf8');
assert.ok(coverageHtml.includes('id="latvia"'), 'Coverage page missing Latvia card');

console.log(
  `Latvia release verified: ${seenOrgs.size} nonprofits (${activeSloCheck} active SLO, ${revokedSloCheck} revoked SLO, 1 SLO-only parish) + ${projects.length} EU projects (EUR 233,473,700.90 total, ${partners.length} partner roles) and matching built pages.`
);
