import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const validNip = (nip) => {
  if (!/^[0-9]{10}$/.test(nip)) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(nip[i]) * w[i];
  return sum % 11 === Number(nip[9]);
};

// 1. Verify Poland OPP registry
const regDir = 'public/data/charity-registry/poland';
const regManifest = JSON.parse(readFileSync(`${regDir}/manifest.json`, 'utf8'));
assert.equal(regManifest.format, 'charitology.poland-opp-registry.v1');
assert.equal(regManifest.counts.includedOrganizations, 10484);
assert.equal(regManifest.counts.eligible2025, 9591);
assert.equal(regManifest.counts.eligible2024, 9316);
assert.equal(regManifest.counts.eligible2023, 9182);
assert.equal(regManifest.counts.eligibleAllThreeYears, 8339);
assert.equal(regManifest.counts.fundedAnyYear2022to2025, 10395);
assert.equal(regManifest.counts.total4yrPit15Grosze, 831680100668);
assert.equal(Object.keys(regManifest.voivodeships).length, 16);

const regGz = readFileSync(`${regDir}/${regManifest.asset.path}`);
assert.equal(regGz.length, regManifest.asset.bytes);
assert.equal(sha256(regGz), regManifest.asset.sha256);
const regRaw = gunzipSync(regGz);
assert.equal(regRaw.length, regManifest.asset.decodedBytes);
assert.equal(sha256(regRaw), regManifest.asset.decodedSha256);
const orgs = JSON.parse(regRaw.toString('utf8'));
assert.equal(orgs.length, regManifest.counts.includedOrganizations);

const seenKrs = new Set();
let regTotalGrosze = 0;
let validNipCount = 0;
let elig2025Check = 0;
for (const row of orgs) {
  const [krs, nip, name, voivCode, , eligMask, total4yr] = row;
  assert.match(krs, /^[0-9]{10}$/, `Invalid KRS ${krs}`);
  assert.ok(!seenKrs.has(krs), `Duplicate KRS ${krs}`);
  seenKrs.add(krs);
  assert.ok(name.trim().length > 0, `Empty name for ${krs}`);
  if (nip !== null) {
    assert.ok(validNip(nip), `Invalid NIP checksum ${nip} for ${krs}`);
    validNipCount++;
  }
  if (voivCode !== null) assert.ok(regManifest.voivodeships[voivCode], `Unknown voiv ${voivCode}`);
  if (eligMask & 4) elig2025Check++;
  regTotalGrosze += total4yr;
}
assert.equal(validNipCount, regManifest.counts.withValidatedNip);
assert.equal(elig2025Check, regManifest.counts.eligible2025);
assert.equal(regTotalGrosze, regManifest.counts.total4yrPit15Grosze);

// 2. Verify Poland 1.5% PIT funding flows
const flowDir = 'public/data/funding-flows/poland-pit-1-5-percent';
const flowManifest = JSON.parse(readFileSync(`${flowDir}/manifest.json`, 'utf8'));
const reconciliation = JSON.parse(readFileSync(`${flowDir}/reconciliation.json`, 'utf8'));
assert.equal(flowManifest.format, 'charitology.poland-pit-1-5-percent.v1');
assert.equal(flowManifest.counts.distinctFundedRecipients, 10395);
assert.equal(flowManifest.counts.total4yrGrosze, 831680100668);
assert.equal(flowManifest.counts.total2025Grosze, 260739886661);
assert.equal(flowManifest.counts.funded2025Orgs, 9450);
assert.equal(flowManifest.counts.eligible2025PaidZero, 167);
assert.equal(flowManifest.counts.paid2025NotInFinalNiw, 26);
assert.equal(reconciliation.paidNotInFinalNiwByTaxYear['2025'].length, 26);
assert.equal(reconciliation.paidNotInFinalNiwByTaxYear['2024'].length, 40);
assert.equal(reconciliation.paidNotInFinalNiwByTaxYear['2023'].length, 39);
assert.equal(reconciliation.voivodeshipSpellingFixes.length, 2);

const flowGz = readFileSync(`${flowDir}/${flowManifest.asset.path}`);
assert.equal(flowGz.length, flowManifest.asset.bytes);
assert.equal(sha256(flowGz), flowManifest.asset.sha256);
const flowRaw = gunzipSync(flowGz);
assert.equal(flowRaw.length, flowManifest.asset.decodedBytes);
assert.equal(sha256(flowRaw), flowManifest.asset.decodedSha256);
const recipients = JSON.parse(flowRaw.toString('utf8'));
assert.equal(recipients.length, flowManifest.counts.distinctFundedRecipients);

const yearTotals = [0, 0, 0, 0];
const yearCounts = [0, 0, 0, 0];
let outside2025Check = 0;
for (const row of recipients) {
  const [krs, , , eligMask, total4yr, g22, g23, g24, g25] = row;
  assert.ok(seenKrs.has(krs), `Funded KRS missing from registry: ${krs}`);
  assert.equal(g22 + g23 + g24 + g25, total4yr, `Sum mismatch for ${krs}`);
  [g22, g23, g24, g25].forEach((g, idx) => {
    yearTotals[idx] += g;
    if (g > 0) yearCounts[idx]++;
  });
  if (g25 > 0 && !(eligMask & 4)) outside2025Check++;
}
assert.deepEqual(yearTotals, [153043029558, 190024007391, 227873177058, 260739886661]);
assert.deepEqual(yearCounts, [9009, 9072, 9213, 9450]);
assert.equal(outside2025Check, 26);

// Verify CSV export rows
const csvLines = readFileSync(`${flowDir}/yearly-2022-2025.csv`, 'utf8').trim().split('\n');
assert.equal(csvLines.length, 5);
assert.ok(csvLines[4].startsWith('2025,2026,9591,9450,167,26,2607398866.61,'));

// 3. Verify built HTML pages
const regHtml = readFileSync('dist/record/charity-index/poland/index.html', 'utf8');
assert.ok(regHtml.includes('10,484'), 'Poland registry page missing org count');
assert.ok(regHtml.includes('data-poland-registry'), 'Poland registry page missing mount');
assert.ok(regHtml.includes('data-site-symbol="poppy"'), 'Poland registry page missing poppy symbol');

const flowHtml = readFileSync('dist/record/funding-flows/poland-pit-1-5-percent/index.html', 'utf8');
assert.ok(flowHtml.includes('0000037904'), 'Poland funding page missing top recipient KRS');
assert.ok(flowHtml.includes('data-pl-pit'), 'Poland funding page missing mount');
assert.ok(flowHtml.includes('data-site-symbol="taxSlice"'), 'Poland funding page missing taxSlice symbol');

const coverageHtml = readFileSync('dist/record/charity-index/coverage/index.html', 'utf8');
assert.ok(coverageHtml.includes('id="poland"'), 'Coverage page missing Poland card');

console.log(
  `Poland release verified: ${orgs.length} KRS orgs (${validNipCount} mod-11 NIPs) + ${recipients.length} 1.5% PIT recipients (2022–2025 total PLN 8,316,801,006.68; 2025 PLN 2,607,398,866.61, 167 eligible-zero, 26 paid outside final NIW) and matching built pages.`
);
