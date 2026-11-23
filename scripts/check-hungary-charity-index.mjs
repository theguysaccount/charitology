import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// 1. Verify Hungary 1% SZJA civil-organization registry (2024-2026)
const regDir = 'public/data/charity-registry/hungary';
const regManifest = JSON.parse(readFileSync(`${regDir}/manifest.json`, 'utf8'));
assert.equal(regManifest.format, 'charitology-hungary-registry-v1');
assert.equal(regManifest.counts.includedOrganizations, 34109);
assert.equal(regManifest.counts.active2026Organizations, 31299);
assert.equal(regManifest.counts.presentAll3Years, 27050);
assert.equal(regManifest.counts.total3YearCivilHuf, 58968699914);
assert.equal(regManifest.counts.total2026CivilHuf, 21402688919);
assert.equal(regManifest.counts.total2026CivilDonors, 1802747);
assert.equal(regManifest.counts.technicalNumber2026Count, 186);
assert.equal(regManifest.counts.technicalNumber2026Huf, 23947458210);

const seen = new Set();
let huf2026Check = 0;
let donors2026Check = 0;
let active2026Check = 0;
let all3yCheck = 0;

for (const [bkt, shard] of Object.entries(regManifest.shards.names)) {
  const gz = readFileSync(`${regDir}/${shard.path}`);
  assert.equal(gz.length, shard.bytes, `Byte mismatch ${bkt}`);
  assert.equal(sha256(gz), shard.sha256, `SHA mismatch ${bkt}`);
  const raw = gunzipSync(gz);
  assert.equal(raw.length, shard.decodedBytes, `Decoded byte mismatch ${bkt}`);
  assert.equal(sha256(raw), shard.decodedSha256, `Decoded SHA mismatch ${bkt}`);
  const rows = JSON.parse(raw.toString('utf8'));
  assert.equal(rows.length, shard.rows, `Row count mismatch ${bkt}`);
  for (const r of rows) {
    assert.match(r.tax8, /^[0-9]{8}$/, `Invalid 8-digit tax ID ${r.tax8}`);
    assert.ok(!seen.has(r.tax8), `Duplicate tax ID ${r.tax8}`);
    seen.add(r.tax8);
    assert.ok(r.name.trim().length > 0, `Empty name for ${r.tax8}`);
    if (r.y2026Huf !== null) {
      active2026Check++;
      huf2026Check += r.y2026Huf;
      donors2026Check += r.y2026Donors;
    }
    if (r.yearsCount === 3) all3yCheck++;
  }
}
assert.equal(seen.size, 34109);
assert.equal(active2026Check, 31299);
assert.equal(all3yCheck, 27050);
assert.equal(huf2026Check, 21402688919);
assert.equal(donors2026Check, 1802747);

const idTotal = Object.entries(regManifest.shards.ids).reduce((acc, [pfx, shard]) => {
  const gz = readFileSync(`${regDir}/${shard.path}`);
  assert.equal(gz.length, shard.bytes, `ID shard bytes ${pfx}`);
  assert.equal(sha256(gz), shard.sha256, `ID shard sha ${pfx}`);
  const raw = gunzipSync(gz);
  assert.equal(sha256(raw), shard.decodedSha256, `ID shard decoded sha ${pfx}`);
  const rows = JSON.parse(raw.toString('utf8'));
  assert.equal(rows.length, shard.rows);
  return acc + rows.length;
}, 0);
assert.equal(idTotal, 34109);

// 2. Verify Hungary 1%+1% SZJA funding flows
const flowDir = 'public/data/funding-flows/hungary-szja-1-percent';
const flowManifest = JSON.parse(readFileSync(`${flowDir}/manifest.json`, 'utf8'));
assert.equal(flowManifest.format, 'charitology-hungary-szja-1-percent-v1');
assert.equal(flowManifest.counts.distinctCivilOrganizations3y, 34109);
assert.equal(flowManifest.counts.combined2026Huf, 21402688919 + 23947458210);

const recArt = flowManifest.artifacts.recipients;
const recGz = readFileSync(`${flowDir}/${recArt.path}`);
assert.equal(recGz.length, recArt.bytes);
assert.equal(sha256(recGz), recArt.sha256);
const recRaw = gunzipSync(recGz);
assert.equal(sha256(recRaw), recArt.decodedSha256);
const recData = JSON.parse(recRaw.toString('utf8'));
assert.equal(recData.topCivil250.length, 250);
assert.equal(recData.technicalNumbers2026.length, 186);
for (const c of recData.topCivil250) {
  assert.ok(seen.has(c.tax8), `Top-250 tax ID absent from registry: ${c.tax8}`);
}

const yCsv = readFileSync(`${flowDir}/${flowManifest.artifacts.yearlyCsv.path}`);
assert.equal(sha256(yCsv), flowManifest.artifacts.yearlyCsv.sha256);
assert.equal(yCsv.toString('utf8').trim().split('\n').length, 4);

const tCsv = readFileSync(`${flowDir}/${flowManifest.artifacts.techCsv.path}`);
assert.equal(sha256(tCsv), flowManifest.artifacts.techCsv.sha256);
assert.equal(tCsv.toString('utf8').trim().split('\n').length, 187);

// 3. Verify built HTML pages
const regHtml = readFileSync('dist/record/charity-index/hungary/index.html', 'utf8');
assert.ok(regHtml.includes('34,109'), 'Hungary registry page missing 34,109 org count');
assert.ok(regHtml.includes('data-hungary-registry'), 'Hungary registry page missing mount');
assert.ok(regHtml.includes('data-site-symbol="danubeArch"'), 'Hungary registry page missing danubeArch symbol');

const flowHtml = readFileSync('dist/record/funding-flows/hungary-szja-1-percent/index.html', 'utf8');
assert.ok(flowHtml.includes('21.40'), 'Hungary flows page missing 21.40B civil total');
assert.ok(flowHtml.includes('data-hu-szja'), 'Hungary flows page missing mount');
assert.ok(flowHtml.includes('data-site-symbol="onePercent"'), 'Hungary flows page missing onePercent symbol');

const coverageHtml = readFileSync('dist/record/charity-index/coverage/index.html', 'utf8');
assert.ok(coverageHtml.includes('id="hungary"'), 'Coverage page missing Hungary card');

console.log(
  `Hungary release verified: ${seen.size} civil orgs (2024-2026; ${active2026Check} active in 2026 totaling HUF ${huf2026Check.toLocaleString('en-US')} from ${donors2026Check.toLocaleString('en-US')} donors) + 186 technical-number 2026 recipients and matching built pages.`,
);
