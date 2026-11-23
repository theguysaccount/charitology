import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = process.cwd();
const dir = path.join(root, 'public/data/funding-flows/hong-kong-fundraising-permits');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

assert.equal(manifest.format, 'charitology-hk-fundraising-permits-v1');
assert.equal(manifest.counts.totalPermits, 401);
assert.equal(manifest.counts.distinctOrganizations, 76);
assert.equal(manifest.counts.byPermitType['Public Subscription Permit'], 391);
assert.equal(manifest.counts.byPermitType['Lottery Licence'], 10);
assert.equal(manifest.counts.s88MatchedPermits + manifest.counts.s88UnmatchedPermits, 401);

const gz = fs.readFileSync(path.join(dir, manifest.artifacts.permits.path));
const decoded = zlib.gunzipSync(gz);
assert.equal(gz.length, manifest.artifacts.permits.bytes);
assert.equal(sha256(gz), manifest.artifacts.permits.sha256);
assert.equal(decoded.length, manifest.artifacts.permits.decodedBytes);
assert.equal(sha256(decoded), manifest.artifacts.permits.decodedSha256);

const rows = JSON.parse(decoded.toString('utf8'));
assert.equal(rows.length, 401);
for (const r of rows) {
  assert.ok(!('enquiryContact' in r), 'enquiryContact phone number must be stripped');
  assert.ok(r.orgEn || r.orgZh, 'Every permit must retain an organization name');
  if (r.s88Basis === 'unmatched_s88') {
    assert.equal(r.s88EffectiveDate, null, `Unmatched permit ${r.permitNo} must keep null s88EffectiveDate`);
  } else {
    assert.match(r.s88EffectiveDate ?? '', /^\d{4}-\d{2}-\d{2}$/, `Matched permit ${r.permitNo} must retain valid s88EffectiveDate`);
  }
}

const csvBytes = fs.readFileSync(path.join(dir, manifest.artifacts.csv.path));
assert.equal(csvBytes.length, manifest.artifacts.csv.bytes);
assert.equal(sha256(csvBytes), manifest.artifacts.csv.sha256);
assert.equal(csvBytes.toString('utf8').trim().split('\n').length, 402);

const builtHtml = path.join(root, 'dist/record/funding-flows/hong-kong-fundraising-permits/index.html');
if (fs.existsSync(builtHtml)) {
  const html = fs.readFileSync(builtHtml, 'utf8');
  for (const token of ['401', 'Public Subscription Permit', 'Lottery Licence', 'Hospital Authority Charitable Foundation']) {
    assert.ok(html.includes(token), `Built HK permits page missing ${token}`);
  }
}

console.log('✓ Hong Kong GovHK Fundraising Permits verified: 401 permits across 76 orgs, phone contacts stripped, conservative S88 name-candidate join exact.');
