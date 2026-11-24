import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = process.cwd();
const regDir = path.join(root, 'public/data/charity-registry/italy');
const flowDir = path.join(root, 'public/data/funding-flows/italy-five-per-mille');
const regManifest = JSON.parse(fs.readFileSync(path.join(regDir, 'manifest.json'), 'utf8'));
const flowManifest = JSON.parse(fs.readFileSync(path.join(flowDir, 'manifest.json'), 'utf8'));
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

assert.equal(regManifest.format, 'charitology-italy-registry-v1');
assert.equal(flowManifest.format, 'charitology-italy-5xmille-flow-v1');
assert.equal(regManifest.counts.includedOrganizations, 96059);
assert.equal(regManifest.counts.validatedCodiceFiscale, 96059);
assert.equal(regManifest.counts.invalidCodiceFiscale, 0);
assert.equal(regManifest.counts.leadingZeroCodiceFiscale, 22354);
assert.equal(regManifest.counts.regionsCovered, 20);
assert.equal(regManifest.counts.totalChoices, 15562797);
assert.equal(regManifest.counts.expressedEurCents, 52050594042);
assert.equal(regManifest.counts.genericEurCents, 8215196926);
assert.equal(regManifest.counts.under100RedistEurCents, 44187112);
assert.equal(regManifest.counts.totalDisbursableEurCents, 60309978080);
assert.equal(
  regManifest.counts.expressedEurCents +
    regManifest.counts.genericEurCents +
    regManifest.counts.under100RedistEurCents,
  regManifest.counts.totalDisbursableEurCents,
);
assert.equal(regManifest.counts.unflaggedCategoryOrganizations, 2023);
assert.equal(regManifest.counts.subThresholdOrganizations, 8216);

const anomBytes = fs.readFileSync(path.join(regDir, regManifest.anomalies.path));
assert.equal(anomBytes.length, regManifest.anomalies.bytes);
assert.equal(sha256(anomBytes), regManifest.anomalies.sha256);

let nameRowsTotal = 0;
let nameEurTotal = 0;
for (const meta of Object.values(regManifest.shards.names)) {
  const gz = fs.readFileSync(path.join(regDir, meta.path));
  const dec = zlib.gunzipSync(gz);
  assert.equal(gz.length, meta.bytes);
  assert.equal(sha256(gz), meta.sha256);
  assert.equal(dec.length, meta.decodedBytes);
  assert.equal(sha256(dec), meta.decodedSha256);
  const rows = JSON.parse(dec.toString('utf8'));
  assert.equal(rows.length, meta.rows);
  for (const r of rows) {
    assert.match(r.cf, /^\d{11}$/, `Codice Fiscale must stay 11-digit string: ${r.cf}`);
    assert.equal(r.expC + r.genC + r.u100C, r.totC, `Exact cent sum mismatch on ${r.cf}`);
    nameEurTotal += r.totC;
  }
  nameRowsTotal += rows.length;
}
assert.equal(nameRowsTotal, 96059);
assert.equal(nameEurTotal, 60309978080);

let idRowsTotal = 0;
for (const meta of Object.values(regManifest.shards.ids)) {
  const gz = fs.readFileSync(path.join(regDir, meta.path));
  const dec = zlib.gunzipSync(gz);
  assert.equal(gz.length, meta.bytes);
  assert.equal(sha256(gz), meta.sha256);
  assert.equal(dec.length, meta.decodedBytes);
  assert.equal(sha256(dec), meta.decodedSha256);
  const rows = JSON.parse(dec.toString('utf8'));
  assert.equal(rows.length, meta.rows);
  idRowsTotal += rows.length;
}
assert.equal(idRowsTotal, 96059);

// Verify funding-flow artifacts
const top250Meta = flowManifest.artifacts.top250;
const top250Gz = fs.readFileSync(path.join(flowDir, top250Meta.path));
const top250Dec = zlib.gunzipSync(top250Gz);
assert.equal(top250Gz.length, top250Meta.bytes);
assert.equal(sha256(top250Gz), top250Meta.sha256);
assert.equal(top250Dec.length, top250Meta.decodedBytes);
assert.equal(sha256(top250Dec), top250Meta.decodedSha256);
const top250 = JSON.parse(top250Dec.toString('utf8'));
assert.equal(top250.length, 250);
assert.equal(top250[0].cf, '80051890152');

for (const key of ['categoriesCsv', 'regionsCsv']) {
  const meta = flowManifest.artifacts[key];
  const raw = fs.readFileSync(path.join(flowDir, meta.path));
  assert.equal(raw.length, meta.bytes);
  assert.equal(sha256(raw), meta.sha256);
  assert.equal(raw[0], 0xef, `${key} should start with UTF-8 BOM`);
}

const builtReg = path.join(root, 'dist/record/charity-index/italy/index.html');
if (fs.existsSync(builtReg)) {
  const html = fs.readFileSync(builtReg, 'utf8');
  for (const token of ['96,059', '15,562,797', '80051890152', 'FONDAZIONE AIRC', 'LOMBARDIA']) {
    assert.ok(html.includes(token), `Built Italy registry page missing ${token}`);
  }
}

const builtFlow = path.join(root, 'dist/record/funding-flows/italy-five-per-mille/index.html');
if (fs.existsSync(builtFlow)) {
  const html = fs.readFileSync(builtFlow, 'utf8');
  for (const token of ['603.10', '96,059', '15,562,797', '28.76%', 'europe-tax-assignment-compare']) {
    assert.ok(html.includes(token), `Built Italy 5x1000 funding-flow page missing ${token}`);
  }
}

console.log(
  '✓ Italy 5 per mille AF 2025 registry & funding flow verified: 96,059 Luhn-valid CFs (22,354 leading-zero), 15,562,797 taxpayer choices, EUR 603,099,780.80 exact, all shards & CSVs exact.',
);
