import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function validYtunnus(val) {
  const m = /^(\d{7})-(\d)$/.exec(val);
  if (!m) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2];
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(m[1][i]) * weights[i];
  const rem = sum % 11;
  if (rem === 1) return false;
  const chk = rem === 0 ? 0 : 11 - rem;
  return chk === Number(m[2]);
}

const regDir = 'public/data/charity-registry/finland';
const manifest = JSON.parse(readFileSync(`${regDir}/manifest.json`, 'utf8'));

assert.equal(manifest.format, 'charitology-finland-registry-v1');
assert.equal(manifest.asOf, '2026-11-25');
assert.equal(manifest.counts.includedOrganizations, 5319);
assert.equal(manifest.counts.uniqueBusinessIds, 5319);
assert.equal(manifest.counts.mod11ValidBusinessIds, 5319);
assert.equal(manifest.counts.byForm.association, 4948);
assert.equal(manifest.counts.byForm.foundation, 371);
assert.equal(manifest.counts.activeOrganizations, 4253);
assert.equal(manifest.counts.endedOrganizations, 1066);
assert.equal(manifest.counts.unnamedRecords, 56);
assert.equal(manifest.topSectors.length, 12);

const art = manifest.artifacts.organizations;
const gz = readFileSync(`${regDir}/${art.path}`);
assert.equal(gz.length, art.bytes, 'FI gzip byte length mismatch');
assert.equal(sha256(gz), art.sha256, 'FI gzip sha256 mismatch');
const raw = gunzipSync(gz);
assert.equal(raw.length, art.decodedBytes, 'FI decoded byte length mismatch');
assert.equal(sha256(raw), art.decodedSha256, 'FI decoded sha256 mismatch');

const rows = JSON.parse(raw.toString('utf8'));
assert.equal(rows.length, 5319);

const seen = new Set();
let activeCount = 0;
let ayhCount = 0;
let saaCount = 0;
let unnamedCount = 0;
const byId = new Map();

for (const r of rows) {
  assert.ok(validYtunnus(r.id), `Invalid modulo-11 Y-tunnus: ${r.id}`);
  assert.ok(!seen.has(r.id), `Duplicate Y-tunnus: ${r.id}`);
  seen.add(r.id);
  byId.set(r.id, r);
  if (r.active) activeCount++;
  if (r.form === 'association') ayhCount++;
  if (r.form === 'foundation') saaCount++;
  if (r.name === null) unnamedCount++;
  // Privacy guard: no street address, postcode, or email
  assert.equal('street' in r, false, 'PII leak: street');
  assert.equal('postCode' in r, false, 'PII leak: postCode');
  assert.equal('email' in r, false, 'PII leak: email');
  if (r.web !== null) {
    assert.match(r.web, /^https?:\/\/[^@\s<>,"']+$/, `Unsafe or malformed website URL for ${r.id}: ${r.web}`);
  }
}

assert.equal(activeCount, 4253);
assert.equal(ayhCount, 4948);
assert.equal(saaCount, 371);
assert.equal(unnamedCount, 56);

// Canonical spot checks
assert.equal(byId.get('0184433-6')?.name, 'Vörå Sparbanksstiftelse sr');
assert.equal(byId.get('0184433-6')?.formCode, 'SÄÄ');
assert.equal(byId.get('2425295-8')?.name, 'Sirkus Magenta ry');
assert.equal(byId.get('0555291-2')?.name, null);

const csvBuf = readFileSync(`${regDir}/${manifest.artifacts.csv.path}`);
assert.equal(csvBuf.length, manifest.artifacts.csv.bytes);
assert.equal(sha256(csvBuf), manifest.artifacts.csv.sha256);
assert.ok(csvBuf.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), 'FI CSV missing UTF-8 BOM');

const anomBuf = readFileSync(`${regDir}/${manifest.artifacts.anomalies.path}`);
assert.equal(anomBuf.length, manifest.artifacts.anomalies.bytes);
assert.equal(sha256(anomBuf), manifest.artifacts.anomalies.sha256);
const anomalies = JSON.parse(anomBuf.toString('utf8'));
assert.equal(anomalies.summary.invalidMod11BusinessIdsCount, 0);
assert.equal(anomalies.summary.unnamedRecordsCount, 56);
assert.equal(anomalies.summary.strippedMalformedWebsitesCount, 9);
assert.equal(anomalies.summary.sentinel1900DateCount, 3);

const regHtml = readFileSync('dist/record/charity-index/finland/index.html', 'utf8');
assert.ok(regHtml.includes('5,319'), 'FI registry page missing 5,319 count');
assert.ok(regHtml.includes('data-fi-registry'), 'FI registry page missing mount');
assert.ok(regHtml.includes('data-site-symbol="nordicBirch"'), 'FI registry page missing nordicBirch symbol');

const coverageHtml = readFileSync('dist/record/charity-index/coverage/index.html', 'utf8');
assert.ok(coverageHtml.includes('id="finland"'), 'Coverage page missing Finland card');

console.log(
  `Finland PRH YTJ release verified: ${seen.size} unique mod-11 Y-tunnus (${ayhCount} AYH, ${saaCount} SÄÄ; ${activeCount} active, ${seen.size - activeCount} ended) and matching built pages.`,
);
