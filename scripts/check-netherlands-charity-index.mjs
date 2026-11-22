import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseCsv } from '../src/lib/client/csv.ts';

const regSrc = 'public/data/charity-registry/netherlands';
const regDist = 'dist/data/charity-registry/netherlands';
const flowSrc = 'public/data/funding-flows/netherlands-rijksfinancien';
const flowDist = 'dist/data/funding-flows/netherlands-rijksfinancien';

const sha = data => createHash('sha256').update(data).digest('hex');
const rsin11Proef = value => {
  if (!/^[0-9]{9}$/.test(value)) return false;
  const w = [9, 8, 7, 6, 5, 4, 3, 2, -1];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(value[i]) * w[i];
  return sum % 11 === 0;
};
const normalize = value =>
  value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/gu, ' ').trim();
const bucketFor = name => {
  const first = normalize(name)[0] ?? '';
  if (first >= 'a' && first <= 'z') return first;
  if (first >= '0' && first <= '9') return '0-9';
  return 'other';
};

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
  readFileSync('src/data/netherlands-index-sources.tsv', 'utf8')
    .trimEnd()
    .split('\n')
    .slice(1)
    .map(line => {
      const [name, url, bytes, hash] = line.split('\t');
      return [name, { url, bytes: Number(bytes), sha256: hash }];
    }),
);

// 1. Verify Belastingdienst ANBI registry manifest & all shards
const regManifest = JSON.parse(readFileSync(join(regSrc, 'manifest.json'), 'utf8'));
assert.equal(regManifest.format, 'charitology-netherlands-anbi-v1');
assert.equal(regManifest.source.url, pins['anbi.zip'].url);
assert.equal(regManifest.source.bytes, pins['anbi.zip'].bytes);
assert.equal(regManifest.source.sha256, pins['anbi.zip'].sha256);
assert.equal(regManifest.statutoryUmbrellas.length, 5);
assert.deepEqual(readdirSync(regSrc).sort(), ['ids', 'manifest.json', 'names']);
for (const section of ['ids', 'names']) {
  assert.deepEqual(
    readdirSync(join(regSrc, section)).sort(),
    Object.keys(regManifest[section]).map(k => k + '.json.gz').sort(),
  );
}

const regIds = new Map();
const regSubMatches = new Map();
let activeCount = 0;
let revokedCount = 0;
let culturalActive = 0;
let culturalRevoked = 0;
let safeUrls = 0;
let multiDecree = 0;

for (const [bucket, asset] of Object.entries(regManifest.names)) {
  for (const row of verifyShard(regSrc, regDist, asset)) {
    assert.equal(row.length, regManifest.fields.length);
    const [rsin, name, , , status, cultural, , , , website, decreeCount, subMatch] = row;
    assert.ok(rsin11Proef(rsin), `Invalid RSIN ${rsin}`);
    assert.ok(!regIds.has(rsin) && name.trim().length > 0);
    assert.ok(status === 'A' || status === 'R', status);
    assert.ok(cultural === null || cultural === 'A' || cultural === 'R', String(cultural));
    assert.equal(bucketFor(name), bucket, `${rsin} ${name}`);
    if (status === 'A') activeCount++; else revokedCount++;
    if (cultural === 'A') culturalActive++; else if (cultural === 'R') culturalRevoked++;
    if (website !== null) {
      assert.ok(/^https?:\/\//i.test(website), `Unsafe website URL for ${rsin}: ${website}`);
      safeUrls++;
    }
    if (decreeCount > 1) multiDecree++;
    if (subMatch !== null) {
      assert.ok(subMatch === 'C' || subMatch === 'N');
      regSubMatches.set(rsin, subMatch);
    }
    regIds.set(rsin, bucket);
  }
}

const directed = new Set();
for (const [prefix, asset] of Object.entries(regManifest.ids)) {
  for (const [rsin, bucket] of verifyShard(regSrc, regDist, asset)) {
    assert.equal(rsin.slice(0, 2), prefix);
    assert.equal(regIds.get(rsin), bucket);
    assert.ok(!directed.has(rsin));
    directed.add(rsin);
  }
}

assert.equal(regIds.size, 54_361);
assert.equal(regIds.size, directed.size);
assert.equal(regIds.size, regManifest.counts.distinctOrganizations);
assert.equal(activeCount, regManifest.counts.activeOrganizations);
assert.equal(revokedCount, regManifest.counts.revokedOrEndedOrganizations);
assert.equal(culturalActive, regManifest.counts.culturalActiveOrganizations);
assert.equal(culturalRevoked, regManifest.counts.culturalRevokedOrEndedOrganizations);
assert.equal(safeUrls, regManifest.counts.withSafeWebsiteUrl);
assert.equal(multiDecree, regManifest.counts.multiDecreeOrganizations);
assert.equal(regSubMatches.size, regManifest.counts.candidateSubsidyMatches2020to2024);

// 2. Verify Rijksfinancien 2020-2024 nonprofit subsidies edition
const flowManifest = JSON.parse(readFileSync(join(flowSrc, 'manifest.json'), 'utf8'));
assert.equal(flowManifest.format, 'charitology-netherlands-rijksfinancien-v1');
assert.equal(flowManifest.currency, 'EUR');
assert.equal(flowManifest.amountUnit, 'EUR_thousands');
assert.deepEqual(flowManifest.source, pins['Financiele_instrumenten_2017-2024.csv']);
assert.equal(flowManifest.anbiSnapshot.sourceSha256, regManifest.source.sha256);

const recipients = verifyShard(flowSrc, flowDist, flowManifest.asset);
assert.equal(recipients.length, 17_868);
assert.equal(recipients.length, flowManifest.counts.distinctKvkRecipients);

const byKvk = new Map();
const linkedRsinsFromFlow = new Set();
let sumNetK = 0;
let sumRows = 0;
const basisCounts = { C: 0, N: 0, A: 0, U: 0 };

for (const row of recipients) {
  assert.equal(row.length, flowManifest.fields.length);
  const [kvk, name, legalForm, , , , k20, k21, k22, k23, k24, netK, rowCount, basis, candRsin] = row;
  assert.ok(/^[0-9]{8}$/.test(kvk) && name.trim().length > 0 && !byKvk.has(kvk), kvk);
  assert.ok(['S', 'V', 'K', 'M'].includes(legalForm), legalForm);
  assert.ok(['C', 'N', 'A', 'U'].includes(basis), basis);
  const yearSum = (k20 ?? 0) + (k21 ?? 0) + (k22 ?? 0) + (k23 ?? 0) + (k24 ?? 0);
  assert.equal(yearSum, netK, kvk);
  assert.ok(Number.isInteger(rowCount) && rowCount >= 1);
  if (basis === 'C' || basis === 'N') {
    assert.ok(candRsin && regIds.has(candRsin), `${kvk} -> ${candRsin}`);
    assert.ok(regSubMatches.has(candRsin), `${candRsin} missing subsidyMatch flag in ANBI`);
    linkedRsinsFromFlow.add(candRsin);
  } else {
    assert.equal(candRsin, null, kvk);
  }
  basisCounts[basis]++;
  sumNetK += netK;
  sumRows += rowCount;
  byKvk.set(kvk, row);
}

assert.equal(linkedRsinsFromFlow.size, regSubMatches.size);
assert.equal(basisCounts.C, flowManifest.counts.anbiCandidateMatches.uniqueNameAndCity);
assert.equal(basisCounts.N, flowManifest.counts.anbiCandidateMatches.uniqueNameOnly);
assert.equal(basisCounts.A, flowManifest.counts.anbiCandidateMatches.ambiguousNameCollision);
assert.equal(basisCounts.U, flowManifest.counts.anbiCandidateMatches.unmatchedNoPublicCrosswalk);
assert.equal(sumNetK, flowManifest.counts.kvkRecipientsNetEurThousands);
assert.equal(sumNetK + flowManifest.counts.blankKvkNetEurThousands, flowManifest.counts.netEurThousands);
assert.equal(sumRows + flowManifest.counts.blankKvkRows, flowManifest.counts.includedSubsidyRows2020to2024);

// Spot-check flagship organizations & honest non-guessing
const cordaid = byKvk.get('41160054');
assert.ok(cordaid && cordaid[11] === 413_083 && cordaid[13] === 'N' && cordaid[14] === '808298276');
const oxfam = byKvk.get('27108436');
assert.ok(oxfam && oxfam[11] === 148_724 && oxfam[13] === 'N' && oxfam[14] === '002872237');
const redCross = byKvk.get('40409352');
assert.ok(redCross && redCross[11] === 366_940 && redCross[13] === 'U' && redCross[14] === null);

// Check anomalies.json & chapters-2020-2024.csv & dist byte identity
const anomaliesBytes = readFileSync(join(flowSrc, 'anomalies.json'));
assert.equal(anomaliesBytes.length, flowManifest.anomalies.bytes);
assert.equal(sha(anomaliesBytes), flowManifest.anomalies.sha256);
const anomalies = JSON.parse(anomaliesBytes);
assert.equal(anomalies.blankKvkRowsCount, flowManifest.counts.blankKvkRows);
assert.equal(anomalies.negativeAdjustmentRowsCount, flowManifest.counts.negativeAdjustmentRows);
assert.equal(anomalies.ambiguousAnbiNameCollisionsCount, flowManifest.counts.anbiCandidateMatches.ambiguousNameCollision);

const csvBytes = readFileSync(join(flowSrc, 'chapters-2020-2024.csv'));
assert.equal(csvBytes.length, flowManifest.chaptersCsv.bytes);
assert.equal(sha(csvBytes), flowManifest.chaptersCsv.sha256);
const [, ...csvRows] = parseCsv(csvBytes.toString('utf8').replace(/^\uFEFF/, ''));
assert.equal(csvRows.length, 16);
const csvNetSum = csvRows.reduce((acc, r) => acc + Number(r[8]), 0);
assert.equal(csvNetSum, flowManifest.counts.netEurThousands);

for (const [srcDir, distDir, file] of [
  [regSrc, regDist, 'manifest.json'],
  [flowSrc, flowDist, 'manifest.json'],
  [flowSrc, flowDist, 'anomalies.json'],
  [flowSrc, flowDist, 'chapters-2020-2024.csv'],
]) {
  assert.deepEqual(readFileSync(join(distDir, file)), readFileSync(join(srcDir, file)), file);
}

// 3. Verify built HTML pages and cross-links
const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const regRoute = '/record/charity-index/netherlands/';
const flowRoute = '/record/funding-flows/netherlands-rijksfinancien/';
const page = route => readFileSync('dist' + route + 'index.html', 'utf8');

const regHtml = page(regRoute);
const flowHtml = page(flowRoute);
assert.ok(regHtml.includes('data-netherlands-registry'));
assert.ok(regHtml.includes(`href="${base}${flowRoute}"`));
assert.ok(regHtml.includes('54,361'));
assert.ok(flowHtml.includes('data-nl-subsidies'));
assert.ok(flowHtml.includes(`href="${base}${regRoute}"`));
assert.ok(flowHtml.includes('41160054'));
assert.ok(flowHtml.includes('Stichting Cordaid'));
assert.ok(flowHtml.includes('EUR 15,540,383k'));
for (const html of [regHtml, flowHtml]) {
  assert.ok(html.includes('github.com/theguysaccount/charitology/issues/new'));
}
assert.ok(page('/record/charity-index/coverage/').includes(`href="${base}${regRoute}"`));
assert.ok(page('/record/charity-index/coverage/').includes(`href="${base}${flowRoute}"`));
assert.ok(page('/record/funding-flows/').includes(`href="${base}${flowRoute}"`));
console.log(`Netherlands release verified: ${regIds.size} ANBI RSINs across ${Object.keys(regManifest.names).length} name shards + ${byKvk.size} nonprofit subsidy KVK recipients (${csvRows.length} budget chapters, EUR ${flowManifest.counts.netEurThousands.toLocaleString('en-US')}k net) and matching built pages.`);
