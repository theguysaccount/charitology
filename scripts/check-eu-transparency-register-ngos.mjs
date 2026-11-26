import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const dir = 'public/data/funding-flows/eu-transparency-register-ngos';
const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));

assert.equal(manifest.format, 'charitology-eu-transparency-register-ngos-v1');
assert.equal(manifest.asOf, '2026-11-25');
assert.equal(manifest.counts.allRegisterEntities, 18169);
assert.equal(manifest.counts.includedCivilSocietyOrganizations, 6317);
assert.equal(manifest.counts.distinctHeadquartersCountries, 106);
assert.equal(manifest.counts.withPositiveEuGrants, 2162);
assert.equal(manifest.counts.totalEuGrantsEur, 7799715769);
assert.equal(manifest.counts.totalItemizedEuGrants, 5538);
assert.equal(manifest.counts.byCategory.ngo.organizations, 4966);
assert.equal(manifest.counts.byCategory.think_tank.organizations, 798);
assert.equal(manifest.counts.byCategory.academic.organizations, 490);
assert.equal(manifest.counts.byCategory.religious.organizations, 63);
assert.equal(manifest.counts.grantsExceedBudgetCount, 54);
assert.equal(manifest.counts.negativeFinancialValuesCount, 18);

const art = manifest.artifacts.organizations;
const gz = readFileSync(`${dir}/${art.path}`);
assert.equal(gz.length, art.bytes);
assert.equal(sha256(gz), art.sha256);
const raw = gunzipSync(gz);
assert.equal(raw.length, art.decodedBytes);
assert.equal(sha256(raw), art.decodedSha256);

const rows = JSON.parse(raw.toString('utf8'));
assert.equal(rows.length, 6317);

const seen = new Set();
let grantSum = 0;
let positiveGrants = 0;
const byId = new Map();

for (const r of rows) {
  assert.match(r.id, /^\d+-\d+$/, `Invalid EU Register ID: ${r.id}`);
  assert.ok(!seen.has(r.id), `Duplicate EU Register ID: ${r.id}`);
  seen.add(r.id);
  byId.set(r.id, r);
  assert.ok(r.name.trim().length > 0, `Empty name for ${r.id}`);
  // Privacy guard: no address, phone, or personal names
  assert.equal('address' in r, false, 'PII leak: address');
  assert.equal('phone' in r, false, 'PII leak: phone');
  assert.equal('headOfEntity' in r, false, 'PII leak: headOfEntity');
  if (r.web !== null) {
    assert.match(r.web, /^https?:\/\/[^@\s<>,"']+$/, `Unsafe website URL for ${r.id}: ${r.web}`);
  }
  if (r.grants !== null && r.grants > 0) {
    positiveGrants++;
    grantSum += r.grants;
  }
}

assert.equal(positiveGrants, 2162);
assert.equal(grantSum, 7799715769);

// Canonical spot checks
assert.equal(byId.get('272646820681-30')?.name, 'ACTION CONTRE LA FAIM');
assert.equal(byId.get('272646820681-30')?.grants, 167000000);
assert.equal(byId.get('854718349128-48')?.name, 'Arnika, z.s.');
assert.equal(byId.get('854718349128-48')?.budget, 1260031);

const csvBuf = readFileSync(`${dir}/${manifest.artifacts.csv.path}`);
assert.equal(csvBuf.length, manifest.artifacts.csv.bytes);
assert.equal(sha256(csvBuf), manifest.artifacts.csv.sha256);
assert.ok(csvBuf.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), 'CSV missing UTF-8 BOM');

const anomBuf = readFileSync(`${dir}/${manifest.artifacts.anomalies.path}`);
assert.equal(anomBuf.length, manifest.artifacts.anomalies.bytes);
assert.equal(sha256(anomBuf), manifest.artifacts.anomalies.sha256);
const anom = JSON.parse(anomBuf.toString('utf8'));
assert.equal(anom.summary.xml11ControlCharEntitiesStripped, 8);
assert.equal(anom.summary.grantsExceedTotalBudgetCount, 54);
assert.equal(anom.summary.negativeFinancialValuesCount, 18);

const html = readFileSync('dist/record/funding-flows/eu-transparency-register-ngos/index.html', 'utf8');
assert.ok(html.includes('6,317'), 'EU TR page missing 6,317 count');
assert.ok(html.includes('data-eu-tr'), 'EU TR page missing mount');
assert.ok(html.includes('data-site-symbol="euStars"'), 'EU TR page missing euStars symbol');

console.log(
  `EU Transparency Register NGOs verified: ${seen.size} civil-society orgs across 106 countries (${positiveGrants} recipients, EUR ${grantSum.toLocaleString('en-US')} EU grants, 54 anomalies disclosed) and matching built page.`,
);
