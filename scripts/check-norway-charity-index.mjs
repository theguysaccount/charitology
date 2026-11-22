import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseCsv } from '../src/lib/client/csv.ts';

const regSrc = 'public/data/charity-registry/norway';
const regDist = 'dist/data/charity-registry/norway';
const flowSrc = 'public/data/funding-flows/norway-momskompensasjon';
const flowDist = 'dist/data/funding-flows/norway-momskompensasjon';

const sha = data => createHash('sha256').update(data).digest('hex');
const mod11 = value => {
  if (!/^[0-9]{9}$/.test(value)) return false;
  const w = [3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(value[i]) * w[i];
  let rem = 11 - (sum % 11);
  if (rem === 11) rem = 0;
  if (rem === 10) return false;
  return rem === Number(value[8]);
};
const normalize = value =>
  value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
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
  readFileSync('src/data/norway-index-sources.tsv', 'utf8')
    .trimEnd()
    .split('\n')
    .slice(1)
    .map(line => {
      const [name, url, bytes, hash] = line.split('\t');
      return [name, { url, bytes: Number(bytes), sha256: hash }];
    }),
);

// 1. Verify Frivillighetsregisteret registry manifest & all shards
const regManifest = JSON.parse(readFileSync(join(regSrc, 'manifest.json'), 'utf8'));
assert.equal(regManifest.format, 'charitology-norway-frivillighetsregisteret-v1');
assert.deepEqual(regManifest.source, pins['enheter_alle.json.gz']);
assert.deepEqual(readdirSync(regSrc).sort(), ['ids', 'manifest.json', 'names']);
for (const section of ['ids', 'names']) {
  assert.deepEqual(
    readdirSync(join(regSrc, section)).sort(),
    Object.keys(regManifest[section]).map(k => k + '.json.gz').sort(),
  );
}

const regIds = new Map();
let matchedGrantsInReg = 0;
let stiftCount = 0;
let mvaCount = 0;
let missingMuni = 0;
for (const [bucket, asset] of Object.entries(regManifest.names)) {
  for (const row of verifyShard(regSrc, regDist, asset)) {
    assert.equal(row.length, regManifest.fields.length);
    const [orgnr, name, form, , , muniCode, , , flags, hasMoms] = row;
    assert.ok(mod11(orgnr), `Invalid orgnr ${orgnr}`);
    assert.ok(!regIds.has(orgnr) && name.trim().length > 0);
    assert.ok(['FLI', 'STI', 'AS'].includes(form), form);
    assert.equal(bucketFor(name), bucket, `${orgnr} ${name}`);
    if (flags.includes('S')) stiftCount++;
    if (flags.includes('M')) mvaCount++;
    if (muniCode === null) missingMuni++;
    if (hasMoms) matchedGrantsInReg++;
    regIds.set(orgnr, bucket);
  }
}
const directed = new Set();
for (const [prefix, asset] of Object.entries(regManifest.ids)) {
  for (const [orgnr, bucket] of verifyShard(regSrc, regDist, asset)) {
    assert.equal(orgnr.slice(0, 2), prefix);
    assert.equal(regIds.get(orgnr), bucket);
    assert.ok(!directed.has(orgnr));
    directed.add(orgnr);
  }
}
assert.equal(regIds.size, 72_968);
assert.equal(regIds.size, directed.size);
assert.equal(regIds.size, regManifest.counts.includedOrganizations);
assert.equal(stiftCount, regManifest.counts.foundationRegisterOverlap);
assert.equal(mvaCount, regManifest.counts.vatRegistered);
assert.equal(missingMuni, regManifest.counts.unknownMunicipality);
assert.equal(matchedGrantsInReg, regManifest.counts.matchedMomskompensasjon2023to2025);

// 2. Verify Momskompensasjon 2023-2025 funding flows edition
const flowManifest = JSON.parse(readFileSync(join(flowSrc, 'manifest.json'), 'utf8'));
assert.equal(flowManifest.format, 'charitology-norway-momskompensasjon-v1');
assert.equal(flowManifest.currency, 'NOK');
assert.equal(flowManifest.registrySnapshot.sourceSha256, regManifest.source.sha256);
for (const yr of ['2023', '2024', '2025']) {
  const pin = pins[`moms-${yr}.xlsx`];
  assert.equal(flowManifest.sources[yr].url, pin.url);
  assert.equal(flowManifest.sources[yr].bytes, pin.bytes);
  assert.equal(flowManifest.sources[yr].sha256, pin.sha256);
}

const recipients = verifyShard(flowSrc, flowDist, flowManifest.asset);
assert.equal(recipients.length, 28_011);
assert.equal(recipients.length, flowManifest.counts.distinctValidOrgnrs);
const flowByOrg = new Map();
let sum23 = 0, sum24 = 0, sum25t1 = 0, sum25supp = 0, sum25tot = 0, inFriv = 0;
for (const row of recipients) {
  assert.equal(row.length, flowManifest.fields.length);
  const [orgnr, name, regStatus, , , , n23, n24, n25t1, n25supp, n25tot, rcnt] = row;
  assert.ok(mod11(orgnr) && name.trim().length > 0 && !flowByOrg.has(orgnr));
  assert.ok(['F', 'E', 'N'].includes(regStatus));
  assert.equal(regStatus === 'F', regIds.has(orgnr), orgnr);
  if (regStatus === 'F') inFriv++;
  if (n23 !== null) sum23 += n23;
  if (n24 !== null) sum24 += n24;
  if (n25t1 !== null) {
    assert.equal(n25t1 + (n25supp ?? 0), n25tot, orgnr);
    sum25t1 += n25t1;
    sum25supp += n25supp ?? 0;
    sum25tot += n25tot;
  }
  assert.ok(Number.isInteger(rcnt) && rcnt >= 1);
  flowByOrg.set(orgnr, row);
}
assert.equal(inFriv, matchedGrantsInReg);
assert.equal(inFriv, flowManifest.counts.inFrivillighetsregisteret);
assert.equal(sum23, 2_450_807_991);
assert.equal(sum24, 2_707_252_900);
assert.equal(sum25t1, 2_634_154_760);
assert.equal(sum25supp, 236_149_590);
assert.equal(sum25tot, 2_870_304_350);
assert.equal(sum23 + sum24 + sum25tot, flowManifest.counts.totalAwardedAndDisbursedNOK);

// Check Nordlia Skisenter discrepancy & Red Cross presence
const nordlia = flowByOrg.get('985514607');
assert.ok(nordlia);
assert.equal(nordlia[8], 110_656);
assert.equal(nordlia[9], 0);
assert.equal(nordlia[10], 110_656);
assert.equal(flowManifest.reconciliation2025.discrepancyCount, 1);
assert.equal(flowManifest.reconciliation2025.discrepancies[0].orgnr, '985514607');
assert.equal(flowManifest.reconciliation2025.discrepancies[0].differenceNOK, -9921);
assert.ok(flowByOrg.has('864139442')); // Norges Røde Kors

// Check anomalies.json & umbrellas-2025.csv & dist byte identity
const anomaliesBytes = readFileSync(join(flowSrc, 'anomalies.json'));
assert.equal(anomaliesBytes.length, flowManifest.anomalies.bytes);
assert.equal(sha(anomaliesBytes), flowManifest.anomalies.sha256);
const anomalies = JSON.parse(anomaliesBytes);
assert.equal(anomalies.blankOrgnrRowsCount, 33);
assert.equal(anomalies.duplicateOrgnrCounts['2023'], 29);
assert.equal(anomalies.duplicateOrgnrCounts['2025'], 24);

const csvBytes = readFileSync(join(flowSrc, 'umbrellas-2025.csv'));
assert.equal(csvBytes.length, flowManifest.umbrellasCsv.bytes);
assert.equal(sha(csvBytes), flowManifest.umbrellasCsv.sha256);
const [, ...csvRows] = parseCsv(csvBytes.toString('utf8').replace(/^\uFEFF/, ''));
assert.equal(csvRows.length, 264);

for (const [srcDir, distDir, file] of [
  [regSrc, regDist, 'manifest.json'],
  [flowSrc, flowDist, 'manifest.json'],
  [flowSrc, flowDist, 'anomalies.json'],
  [flowSrc, flowDist, 'umbrellas-2025.csv'],
]) {
  assert.deepEqual(readFileSync(join(distDir, file)), readFileSync(join(srcDir, file)), file);
}

// 3. Verify built HTML pages and cross-links
const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const regRoute = '/record/charity-index/norway/';
const flowRoute = '/record/funding-flows/norway-momskompensasjon/';
const page = route => readFileSync('dist' + route + 'index.html', 'utf8');

const regHtml = page(regRoute);
const flowHtml = page(flowRoute);
assert.ok(regHtml.includes('data-norway-registry'));
assert.ok(regHtml.includes(`href="${base}${flowRoute}"`));
assert.ok(regHtml.includes('72,968'));
assert.ok(flowHtml.includes('data-norway-moms'));
assert.ok(flowHtml.includes(`href="${base}${regRoute}"`));
assert.ok(flowHtml.includes('985514607'));
assert.ok(flowHtml.includes('NORDLIA SKISENTER'));
assert.ok(flowHtml.includes('NOK 8,028,365,241'));
for (const html of [regHtml, flowHtml]) {
  assert.ok(html.includes('github.com/theguysaccount/charitology/issues/new'));
}
assert.ok(page('/record/charity-index/coverage/').includes(`href="${base}${regRoute}"`));
assert.ok(page('/record/charity-index/coverage/').includes(`href="${base}${flowRoute}"`));
assert.ok(page('/record/funding-flows/').includes(`href="${base}${flowRoute}"`));
console.log(`Norway release verified: ${regIds.size} voluntary orgs across ${Object.keys(regManifest.names).length} name shards + ${flowByOrg.size} multi-year grant recipients (${csvRows.length} umbrellas, 1 documented discrepancy) and matching built pages.`);
