import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const regDir = 'public/data/charity-registry/austria';
const manifest = JSON.parse(readFileSync(`${regDir}/manifest.json`, 'utf8'));

assert.equal(manifest.format, 'charitology-austria-registry-v1');
assert.equal(manifest.asOf, '2026-10-01');
assert.equal(manifest.counts.includedOrganizations, 8577);
assert.equal(manifest.counts.uniqueBmfCodes, 8577);
assert.equal(manifest.counts.distinctExactNames, 8089);
assert.equal(manifest.counts.activeOpenEnded, 7648);
assert.equal(manifest.counts.expiredWithValidTo, 929);
assert.equal(manifest.counts.withValidFrom, 2980);
assert.equal(manifest.counts.withoutValidFrom, 5597);
assert.equal(manifest.counts.validToWithoutValidFrom, 31);
assert.equal(manifest.counts.reformCohort2024To2026Dated, 964);
assert.equal(manifest.counts.populatedCategories, 22);
assert.equal(manifest.categories.length, 22);

const art = manifest.artifacts.organizations;
const gz = readFileSync(`${regDir}/${art.path}`);
assert.equal(gz.length, art.bytes, 'Austria gzip byte length mismatch');
assert.equal(sha256(gz), art.sha256, 'Austria gzip sha256 mismatch');
const raw = gunzipSync(gz);
assert.equal(raw.length, art.decodedBytes, 'Austria decoded byte length mismatch');
assert.equal(sha256(raw), art.decodedSha256, 'Austria decoded sha256 mismatch');

const rows = JSON.parse(raw.toString('utf8'));
assert.equal(rows.length, 8577);

const validPrefixes = new Set([
  'AS', 'BI', 'FF', 'FW', 'GM', 'KK', 'KR', 'MÖ', 'MP', 'NT', 'ÖK', 'ÖS',
  'PA', 'PK', 'PS', 'SE', 'SG', 'SN', 'SO', 'SP', 'SV', 'UN', 'ZG', 'ZI',
]);

const seen = new Set();
let activeCount = 0;
let expiredCount = 0;
let withValidFrom = 0;
let validToWithoutFrom = 0;
let reformDated = 0;
const byCode = new Map();

for (const r of rows) {
  assert.match(r.code, /^[A-ZÄÖÜ]{2,3}-\d+$/, `Invalid BMF code ${r.code}`);
  assert.ok(validPrefixes.has(r.prefix), `Unknown BMF prefix ${r.prefix}`);
  assert.equal(r.code.split('-')[0], r.prefix, `Code/prefix mismatch ${r.code}`);
  assert.ok(!seen.has(r.code), `Duplicate BMF code ${r.code}`);
  seen.add(r.code);
  byCode.set(r.code, r);
  assert.ok(r.name.trim().length > 0, `Empty name for ${r.code}`);
  if (r.validFrom !== null) {
    assert.match(r.validFrom, /^\d{4}-\d{2}-\d{2}$/, `Invalid validFrom ${r.validFrom}`);
    withValidFrom++;
    if (r.validFrom >= '2024-01-01') reformDated++;
  }
  if (r.validTo !== null) {
    assert.match(r.validTo, /^\d{4}-\d{2}-\d{2}$/, `Invalid validTo ${r.validTo}`);
    assert.ok(r.validTo < '2026-10-01', `Non-expired validTo ${r.code}: ${r.validTo}`);
    if (r.validFrom !== null) {
      assert.ok(r.validFrom <= r.validTo, `Inverted dates for ${r.code}`);
    } else {
      validToWithoutFrom++;
    }
    assert.equal(r.active, false);
    expiredCount++;
  } else {
    assert.equal(r.active, true);
    activeCount++;
  }
}

assert.equal(seen.size, 8577);
assert.equal(activeCount, 7648);
assert.equal(expiredCount, 929);
assert.equal(withValidFrom, 2980);
assert.equal(validToWithoutFrom, 31);
assert.equal(reformDated, 964);

// Spot-check edge cases recovered cleanly by the PDF stream tokenizer
assert.equal(byCode.get('SO-2220')?.name, 'SAVE TIBET');
assert.equal(byCode.get('SO-1131')?.name, 'Österreichisches Rotes Kreuz');
assert.equal(byCode.get('MÖ-11641')?.name, 'Albertina');
assert.ok(byCode.get('SO-9900')?.name.includes('– Verein zur Förderung'));
assert.ok(byCode.get('SO-3919')?.name.includes('„SOWO“'));

const csvBuf = readFileSync(`${regDir}/${manifest.artifacts.csv.path}`);
assert.equal(csvBuf.length, manifest.artifacts.csv.bytes);
assert.equal(sha256(csvBuf), manifest.artifacts.csv.sha256);
assert.equal(csvBuf.toString('utf8').trim().split('\n').length, 8578);

const anomBuf = readFileSync(`${regDir}/${manifest.artifacts.anomalies.path}`);
assert.equal(anomBuf.length, manifest.artifacts.anomalies.bytes);
assert.equal(sha256(anomBuf), manifest.artifacts.anomalies.sha256);
const anomalies = JSON.parse(anomBuf.toString('utf8'));
assert.equal(anomalies.summary.validToWithoutValidFromCount, 31);

const regHtml = readFileSync('dist/record/charity-index/austria/index.html', 'utf8');
assert.ok(regHtml.includes('8,577'), 'Austria registry page missing 8,577 org count');
assert.ok(regHtml.includes('data-austria-registry'), 'Austria registry page missing mount');
assert.ok(regHtml.includes('data-site-symbol="edelweiss"'), 'Austria registry page missing edelweiss symbol');

const coverageHtml = readFileSync('dist/record/charity-index/coverage/index.html', 'utf8');
assert.ok(coverageHtml.includes('id="austria"'), 'Coverage page missing Austria card');

console.log(
  `Austria release verified: ${seen.size} unique BMF codes (${activeCount} active, ${expiredCount} historical/expired, ${manifest.categories.length} statutory categories, ${reformDated} dated 2024–2026 reform entries) and matching built pages.`,
);
