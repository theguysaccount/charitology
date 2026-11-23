import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const regDir = 'public/data/charity-registry/denmark';
const manifest = JSON.parse(readFileSync(`${regDir}/manifest.json`, 'utf8'));

assert.equal(manifest.format, 'charitology-denmark-registry-v1');
assert.equal(manifest.counts.includedOrganizations, 1471);
assert.equal(manifest.counts.uniqueCvrs, 1471);
assert.equal(manifest.counts.ll8aTotal, 1078);
assert.equal(manifest.counts.ll8aFullYear, 1052);
assert.equal(manifest.counts.ll8aPartialYear, 26);
assert.equal(manifest.counts.ll12Total, 502);
assert.equal(manifest.counts.ll12FullYear, 494);
assert.equal(manifest.counts.ll12PartialYear, 8);
assert.equal(manifest.counts.balListedTotal, 410);
assert.equal(manifest.counts.ceased2025, 2);

const art = manifest.artifacts.organizations;
const gz = readFileSync(`${regDir}/${art.path}`);
assert.equal(gz.length, art.bytes, 'Denmark gzip byte length mismatch');
assert.equal(sha256(gz), art.sha256, 'Denmark gzip sha256 mismatch');
const raw = gunzipSync(gz);
assert.equal(raw.length, art.decodedBytes, 'Denmark decoded byte length mismatch');
assert.equal(sha256(raw), art.decodedSha256, 'Denmark decoded sha256 mismatch');

const rows = JSON.parse(raw.toString('utf8'));
assert.equal(rows.length, 1471);

const seen = new Set();
let c8a = 0;
let c12 = 0;
let cBal = 0;
let cCeased = 0;
for (const r of rows) {
  assert.match(r.cvr, /^[0-9]{8}$/, `Invalid 8-digit CVR ${r.cvr}`);
  assert.ok(!seen.has(r.cvr), `Duplicate CVR ${r.cvr}`);
  seen.add(r.cvr);
  assert.ok(r.name.trim().length > 0, `Empty name for ${r.cvr}`);
  if (r.s8a) c8a++;
  if (r.s12) c12++;
  if (r.bal) cBal++;
  if (r.ceased2025) cCeased++;
}
assert.equal(seen.size, 1471);
assert.equal(c8a, 1078);
assert.equal(c12, 502);
assert.equal(cBal, 410);
assert.equal(cCeased, 2);

const csvBuf = readFileSync(`${regDir}/${manifest.artifacts.csv.path}`);
assert.equal(csvBuf.length, manifest.artifacts.csv.bytes);
assert.equal(sha256(csvBuf), manifest.artifacts.csv.sha256);
assert.equal(csvBuf.toString('utf8').trim().split('\n').length, 1472);

const regHtml = readFileSync('dist/record/charity-index/denmark/index.html', 'utf8');
assert.ok(regHtml.includes('1,471'), 'Denmark registry page missing 1,471 org count');
assert.ok(regHtml.includes('data-denmark-registry'), 'Denmark registry page missing mount');
assert.ok(regHtml.includes('data-site-symbol="danishCrown"'), 'Denmark registry page missing danishCrown symbol');

const coverageHtml = readFileSync('dist/record/charity-index/coverage/index.html', 'utf8');
assert.ok(coverageHtml.includes('id="denmark"'), 'Coverage page missing Denmark card');

console.log(
  `Denmark release verified: ${seen.size} unique 8-digit CVR organizations (${c8a} LL § 8 A, ${c12} LL § 12 stk. 3, ${cBal} BAL § 3 stk. 2, ${cCeased} ceased in 2025) and matching built pages.`,
);
