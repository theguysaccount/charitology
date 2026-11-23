import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// 1. Verify Sweden 90-konto registry
const regDir = 'public/data/charity-registry/sweden';
const regManifest = JSON.parse(readFileSync(`${regDir}/manifest.json`, 'utf8'));
assert.equal(regManifest.format, 'charitology-sweden-registry-v1');
assert.equal(regManifest.counts.includedOrganizations, 741);
assert.equal(regManifest.counts.byStatus.active, 487);
assert.equal(regManifest.counts.byStatus.withdrawn, 36);
assert.equal(regManifest.counts.byStatus.finished, 218);
assert.equal(regManifest.counts.activeWithOrgNr, 487);
assert.equal(regManifest.counts.activeWith2025Revenue, 456);
assert.equal(regManifest.counts.activeSumRevenue2025Tkr, 29279441);
assert.equal(regManifest.counts.activeSumEquity2025Tkr, 36424291);
assert.equal(regManifest.counts.duplicateYearHeaderCards, 17);

const regArt = regManifest.artifacts.organizations;
const regGz = readFileSync(`${regDir}/${regArt.path}`);
assert.equal(regGz.length, regArt.bytes);
assert.equal(sha256(regGz), regArt.sha256);
const regRaw = gunzipSync(regGz);
assert.equal(regRaw.length, regArt.decodedBytes);
assert.equal(sha256(regRaw), regArt.decodedSha256);
const rawText = regRaw.toString('utf8');
assert.ok(!rawText.includes('mailto:'), 'Personal/contact email markup leaked into Sweden registry');
assert.ok(!rawText.includes('tel:'), 'Phone markup leaked into Sweden registry');

const rows = JSON.parse(rawText);
assert.equal(rows.length, 741);
const activeSlugs = new Set();
let activeCount = 0;
let withdrawnCount = 0;
let finishedCount = 0;
let standardOrgNrCount = 0;
let nonStandardOrgNrCount = 0;
for (const r of rows) {
  assert.ok(r.slug && r.name.trim().length > 0);
  if (r.status === 'active') {
    activeCount++;
    assert.ok(r.orgNr && /^[0-9]{5,6}-[0-9]{4}$/.test(r.orgNr), `Invalid Swedish Org nr ${r.orgNr} on ${r.slug}`);
    if (/^[0-9]{6}-[0-9]{4}$/.test(r.orgNr)) standardOrgNrCount++;
    else nonStandardOrgNrCount++;
    activeSlugs.add(r.slug);
  } else if (r.status === 'withdrawn') {
    withdrawnCount++;
  } else if (r.status === 'finished') {
    finishedCount++;
  } else {
    assert.fail(`Unexpected status ${r.status}`);
  }
}
assert.equal(activeCount, 487);
assert.equal(standardOrgNrCount, 486);
assert.equal(nonStandardOrgNrCount, 1);
assert.equal(withdrawnCount, 36);
assert.equal(finishedCount, 218);

const regCsv = readFileSync(`${regDir}/${regManifest.artifacts.csv.path}`);
assert.equal(regCsv.length, regManifest.artifacts.csv.bytes);
assert.equal(sha256(regCsv), regManifest.artifacts.csv.sha256);
assert.equal(regCsv.toString('utf8').trim().split('\n').length, 742);

// 2. Verify Sweden 90-konto 2025 audited giving flows
const flowDir = 'public/data/funding-flows/sweden-90-konto';
const flowManifest = JSON.parse(readFileSync(`${flowDir}/manifest.json`, 'utf8'));
const anomalies = JSON.parse(readFileSync(`${flowDir}/anomalies.json`, 'utf8'));

assert.equal(flowManifest.format, 'charitology-sweden-90-konto-flows-v1');
assert.equal(flowManifest.counts.auditedOrganizations2025, 481);
assert.equal(flowManifest.counts.totalRevenue2025Mkr, 29482);
assert.equal(flowManifest.counts.collectedGiftsAndGrants2025Mkr, 23090);
assert.equal(flowManifest.counts.privateIndividuals2025Mkr, 10987);
assert.equal(flowManifest.counts.publicAuthorities2025Mkr, 7092);
assert.equal(flowManifest.counts.foundationsAndOrgs2025Mkr, 3287);
assert.equal(flowManifest.counts.corporations2025Mkr, 1724);
assert.equal(flowManifest.counts.top110Rows, 110);
assert.equal(flowManifest.counts.top110SumMkr, 21040);
assert.equal(flowManifest.counts.top100PrivateRows, 100);
assert.equal(flowManifest.counts.top100PrivateSumMkr, 10400);
assert.equal(flowManifest.counts.top110MatchedToActiveDirectory, 110);
assert.equal(anomalies.duplicateYearColumns.count, 17);

const topArt = flowManifest.artifacts.topOrganizations2025;
const topGz = readFileSync(`${flowDir}/${topArt.path}`);
assert.equal(topGz.length, topArt.bytes);
assert.equal(sha256(topGz), topArt.sha256);
const topRaw = gunzipSync(topGz);
assert.equal(sha256(topRaw), topArt.decodedSha256);
const topData = JSON.parse(topRaw.toString('utf8'));
assert.equal(topData.top110Total.length, 110);
assert.equal(topData.top100PrivateOnly.length, 100);
for (const entry of topData.top110Total) {
  assert.ok(activeSlugs.has(entry.matchedSlug), `Top-110 slug not in active directory: ${entry.matchedSlug}`);
}

const flowCsv = readFileSync(`${flowDir}/${flowManifest.artifacts.sectorSeriesCsv.path}`);
assert.equal(flowCsv.length, flowManifest.artifacts.sectorSeriesCsv.bytes);
assert.equal(sha256(flowCsv), flowManifest.artifacts.sectorSeriesCsv.sha256);
assert.equal(flowCsv.toString('utf8').trim().split('\n').length, 4);

// 3. Verify built HTML pages
const regHtml = readFileSync('dist/record/charity-index/sweden/index.html', 'utf8');
assert.ok(regHtml.includes('741'), 'Sweden registry page missing 741 org count');
assert.ok(regHtml.includes('data-sweden-registry'), 'Sweden registry page missing mount');
assert.ok(regHtml.includes('data-site-symbol="nordicStar"'), 'Sweden registry page missing nordicStar symbol');

const flowHtml = readFileSync('dist/record/funding-flows/sweden-90-konto/index.html', 'utf8');
assert.ok(flowHtml.includes('23,090'), 'Sweden flows page missing 23,090 Mkr gifts total');
assert.ok(flowHtml.includes('data-se-90konto'), 'Sweden flows page missing mount');
assert.ok(flowHtml.includes('data-site-symbol="auditSeal"'), 'Sweden flows page missing auditSeal symbol');

const coverageHtml = readFileSync('dist/record/charity-index/coverage/index.html', 'utf8');
assert.ok(coverageHtml.includes('id="sweden"'), 'Coverage page missing Sweden card');

console.log(
  `Sweden release verified: ${rows.length} 90-konto profiles (${activeCount} active, ${withdrawnCount} revoked, ${finishedCount} closed) + 2025 audited flows (SEK 23,090M gifts & grants; 110/110 Top-110 linked) and matching built pages.`,
);
